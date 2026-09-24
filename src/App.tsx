/**
 * Główna powłoka aplikacji: uruchamia strumienie danych, pilnuje cyklu
 * przeliczania analizy i przełącza ekrany.
 *
 * Ważne dla wydajności: `App` NIE subskrybuje całego stanu rynku. Cena tyka
 * kilka razy na sekundę i przerysowywanie tu całego drzewa nie tylko kosztuje
 * klatki, ale wcześniej potrafiło zakleszczyć przejście między ekranami
 * (AnimatePresence gubił zakończenie animacji wyjścia przy ciągłych
 * przerysowaniach rodzica). Wszystko, co zależy od ceny, siedzi w osobnych,
 * drobnych komponentach poniżej.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { App as AplikacjaNatywna } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { atr, ostatnia } from '@/analiza/wskazniki'
import type { KontekstRynku } from '@/analiza/typy'
import { NATYWNIE } from '@/lib/http'
import { cena as fCena } from '@/lib/format'
import { popropZgode, powiadom, ustawHaptyke } from '@/lib/powiadomienia'
import { wczytajAlerty, zapiszAlert } from '@/dane/db'
import { uzyjRynku } from '@/stan/rynek'
import { zbudujKontekstRynku } from '@/stan/kontekst'
import { uzyjNewsow } from '@/stan/newsy'
import { uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { nasluchujAktualizacjiPwa } from '@/dane/aktualizacje'
import { uzyjAktualizacji } from '@/stan/aktualizacja'
import { Czasteczki, type UchwytCzasteczek } from '@/ui/Czasteczki'
import { PasekAktualizacji } from '@/ui/PasekAktualizacji'
import { PasekNawigacji, type Zakladka } from '@/ui/Powloka'
import { TloPlynne } from '@/ui/TloPlynne'
import { Newsy } from '@/ekrany/Newsy'
import { Powitanie } from '@/ekrany/Powitanie'
import { Pulpit } from '@/ekrany/Pulpit'
import { Rynek } from '@/ekrany/Rynek'
import { Sygnaly } from '@/ekrany/Sygnaly'
import { Ustawienia } from '@/ekrany/Ustawienia'
import { Wykres } from '@/ekrany/Wykres'

/** Analiza przeliczana nie rzadziej niż co 90 s, nawet bez nowej świecy. */
const ODSTEP_ANALIZY = 90_000
const ODSTEP_NEWSOW = 3 * 60_000

// ------------------------------------------------------------------ cena

/**
 * Pilnuje ceny: celów aktywnych sygnałów i alertów użytkownika.
 * Nic nie renderuje – istnieje po to, żeby tykająca cena nie przerysowywała `App`.
 */
function PilnowanieCeny() {
  const cena = uzyjRynku((s) => s.cena)
  const sprawdzCeny = uzyjSygnalow((s) => s.sprawdzCeny)
  const ostatnioSprawdzona = useRef(0)

  useEffect(() => {
    if (cena === null || !Number.isFinite(cena)) return
    // Reagujemy dopiero na zauważalną zmianę – oszczędza pracy przy każdym ticku.
    if (Math.abs(cena - ostatnioSprawdzona.current) < 0.5) return
    const poprzednia = ostatnioSprawdzona.current
    ostatnioSprawdzona.current = cena

    void sprawdzCeny(cena)
    if (poprzednia <= 0) return

    void (async () => {
      const alerty = await wczytajAlerty()
      for (const a of alerty) {
        if (a.wyzwolony) continue
        const trafiony =
          a.kierunek === 'powyzej'
            ? cena >= a.cena && poprzednia < a.cena
            : cena <= a.cena && poprzednia > a.cena
        if (!trafiony) continue
        await zapiszAlert({ ...a, wyzwolony: true })
        void powiadom({
          tytul: '🔔 Alert cenowy',
          tresc: `BTC osiągnął ${fCena(a.cena)} USDT (teraz ${fCena(cena)}).`,
          tag: `alert-${a.id}`,
        })
      }
    })()
  }, [cena, sprawdzCeny])

  return null
}

// ------------------------------------------------------------------ tło

/** Tło reagujące na kierunek i zmienność – osobno, bo czyta świece. */
function TloReagujace({ aktywne }: { aktywne: boolean }) {
  const swieceWg = uzyjRynku((s) => s.swieceWg)
  const swiece = swieceWg['1h'] ?? swieceWg['15m'] ?? []

  const kierunek = (() => {
    if (swiece.length < 2) return 0
    const ost = swiece[swiece.length - 1]
    return Math.max(-1, Math.min(1, ((ost.c - ost.o) / ost.o) * 120))
  })()

  const zmiennosc = (() => {
    if (swiece.length < 20) return 0.15
    const a = ostatnia(atr(swiece, 14))
    const c = swiece[swiece.length - 1].c
    if (!Number.isFinite(a) || !c) return 0.15
    // ATR godzinowy rzędu 1% ceny traktujemy jako pełną skalę.
    return Math.max(0, Math.min(1, (a / c) * 100))
  })()

  return <TloPlynne kierunek={kierunek} zmiennosc={zmiennosc} aktywne={aktywne} />
}

// ------------------------------------------------------------------ aplikacja

export function App() {
  const zaakceptowano = uzyjUstawien((s) => s.zaakceptowanoRyzyko)
  const trybHoryzontu = uzyjUstawien((s) => s.trybHoryzontu)
  const oszczedzajBaterie = uzyjUstawien((s) => s.oszczedzajBaterie)
  const haptyka = uzyjUstawien((s) => s.haptyka)
  const ustaw = uzyjUstawien((s) => s.ustaw)

  const sprawdzajAktualizacje = uzyjUstawien((s) => s.sprawdzajAktualizacje)

  const [zakladka, ustawZakladke] = useState<Zakladka>('pulpit')
  const [ustawieniaOtwarte, ustawUstawieniaOtwarte] = useState(false)
  const [gotowe, ustawGotowe] = useState(false)
  const zastosujPwa = useRef<() => void>(() => window.location.reload())

  const czasteczki = useRef<UchwytCzasteczek>(null)
  const ostatniaAnaliza = useRef(0)
  const obsluzonySygnal = useRef<string | null>(null)

  const wersjaSwiec = uzyjRynku((s) => s.wersjaSwiec)
  const przelicz = uzyjSygnalow((s) => s.przelicz)
  const swiezySygnal = uzyjSygnalow((s) => s.swiezySygnal)
  const wyczyscSwiezy = uzyjSygnalow((s) => s.wyczyscSwiezy)
  const nieprzeczytane = uzyjNewsow(
    (s) => s.klastry.filter((k) => !k.przeczytany && k.ocena.wplyw >= 7).length,
  )

  // --- start aplikacji -----------------------------------------------------
  useEffect(() => {
    void (async () => {
      await uzyjUstawien.getState().wczytaj()
      ustawGotowe(true)
      if (NATYWNIE) {
        try {
          await StatusBar.setStyle({ style: Style.Dark })
          await StatusBar.setBackgroundColor({ color: '#000000' })
          await SplashScreen.hide()
        } catch {
          /* na części urządzeń pasek stanu jest niedostępny */
        }
      }
    })()
  }, [])

  // --- uruchomienie danych po akceptacji ryzyka ---------------------------
  useEffect(() => {
    if (!gotowe || !zaakceptowano) return
    ustawHaptyke(haptyka)
    void popropZgode()

    void (async () => {
      const sygnaly = uzyjSygnalow.getState()
      const newsy = uzyjNewsow.getState()
      await Promise.all([sygnaly.wczytaj(), newsy.wczytaj()])
      await uzyjRynku.getState().uruchom(uzyjUstawien.getState().trybHoryzontu)
      void newsy.odswiez()
      void newsy.odswiezKalendarz()
    })()

    return () => uzyjRynku.getState().zatrzymaj()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotowe, zaakceptowano])

  // --- zmiana horyzontu: dociągamy brakujące interwały ---------------------
  useEffect(() => {
    if (!gotowe || !zaakceptowano) return
    void uzyjRynku.getState().uruchom(trybHoryzontu)
  }, [trybHoryzontu, gotowe, zaakceptowano])

  // --- kontekst rynkowy dla silnika ---------------------------------------
  const zbudujKontekst = useCallback((): KontekstRynku => zbudujKontekstRynku(), [])

  // --- przeliczanie analizy ------------------------------------------------
  useEffect(() => {
    if (!zaakceptowano) return
    if (Object.keys(uzyjRynku.getState().swieceWg).length === 0) return
    const teraz = Date.now()
    if (teraz - ostatniaAnaliza.current < 4000) return // ochrona przed kaskadą
    ostatniaAnaliza.current = teraz
    void przelicz(trybHoryzontu, zbudujKontekst())
  }, [wersjaSwiec, trybHoryzontu, zaakceptowano, przelicz, zbudujKontekst])

  useEffect(() => {
    if (!zaakceptowano) return
    const t = setInterval(() => {
      if (document.hidden) return
      ostatniaAnaliza.current = Date.now()
      void przelicz(uzyjUstawien.getState().trybHoryzontu, zbudujKontekst())
    }, ODSTEP_ANALIZY)
    return () => clearInterval(t)
  }, [przelicz, zbudujKontekst, zaakceptowano])

  // --- newsy cyklicznie ----------------------------------------------------
  useEffect(() => {
    if (!zaakceptowano) return
    const t = setInterval(() => {
      if (document.hidden) return
      void uzyjNewsow.getState().odswiez()
    }, ODSTEP_NEWSOW)
    const tk = setInterval(() => void uzyjNewsow.getState().odswiezKalendarz(), 30 * 60_000)
    return () => {
      clearInterval(t)
      clearInterval(tk)
    }
  }, [zaakceptowano])

  // --- efekt cząsteczek przy nowym sygnale --------------------------------
  useEffect(() => {
    if (!swiezySygnal || swiezySygnal.id === obsluzonySygnal.current) return
    obsluzonySygnal.current = swiezySygnal.id
    czasteczki.current?.wystrzel(
      window.innerWidth / 2,
      window.innerHeight * 0.38,
      swiezySygnal.kierunek === 'long' ? '#00E28A' : '#FF3B5C',
      40,
    )
    const t = setTimeout(wyczyscSwiezy, 1200)
    return () => clearTimeout(t)
  }, [swiezySygnal, wyczyscSwiezy])

  // --- aktualizacje --------------------------------------------------------
  useEffect(() => {
    if (!gotowe || !zaakceptowano || !sprawdzajAktualizacje) return

    // Wersja natywna: pytamy GitHuba o najnowsze wydanie, a przez Wi-Fi
    // nowa wersja ściąga się sama w tle.
    const sprawdz = () => void uzyjAktualizacji.getState().sprawdz()
    sprawdz()
    const timer = setInterval(sprawdz, 6 * 3_600_000)

    // Wersja przeglądarkowa / iPhone: nową wersję przynosi service worker.
    zastosujPwa.current = nasluchujAktualizacjiPwa(() => uzyjAktualizacji.getState().zglosPwa())

    return () => clearInterval(timer)
  }, [gotowe, zaakceptowano, sprawdzajAktualizacje])

  // --- powrót aplikacji z tła ---------------------------------------------
  useEffect(() => {
    if (!zaakceptowano) return

    const naZmiane = () => {
      if (document.hidden) return
      const rynek = uzyjRynku.getState()
      void rynek.odswiezSwiece()
      void rynek.odswiezMigawke()
      void uzyjNewsow.getState().odswiez()
      // Powrót z ustawień systemu po udzieleniu zgody na instalację –
      // od razu otwieramy instalator, bez kolejnego klikania.
      void uzyjAktualizacji.getState().powrotZUstawien()
    }
    document.addEventListener('visibilitychange', naZmiane)

    let odpiecie: (() => void) | null = null
    if (NATYWNIE) {
      void AplikacjaNatywna.addListener('appStateChange', ({ isActive }) => {
        if (isActive) naZmiane()
      }).then((u) => {
        odpiecie = () => void u.remove()
      })
    }

    return () => {
      document.removeEventListener('visibilitychange', naZmiane)
      odpiecie?.()
    }
  }, [zaakceptowano])

  const efektyWlaczone = !oszczedzajBaterie

  if (!gotowe) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="naglowek text-2xl font-bold" style={{ color: 'var(--zloto)' }}>
          ₿
        </span>
      </div>
    )
  }

  if (!zaakceptowano) {
    return (
      <>
        <TloPlynne kierunek={0} zmiennosc={0.2} aktywne={efektyWlaczone} />
        <Powitanie naAkceptacje={() => ustaw('zaakceptowanoRyzyko', true)} />
      </>
    )
  }

  return (
    <>
      <TloReagujace aktywne={efektyWlaczone} />
      <Czasteczki ref={czasteczki} aktywne={efektyWlaczone} />
      <PilnowanieCeny />

      <PasekAktualizacji naOdswiezPwa={() => zastosujPwa.current()} />

      {/*
        Ekrany podmieniane są bez `AnimatePresence`: zakładka ma zniknąć od razu,
        a nie czekać na animację wyjścia poprzedniej. Wejście animujemy kluczem.
      */}
      <div className="h-full">
        <motion.div
          key={zakladka}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
          className="h-full"
        >
          {zakladka === 'pulpit' && (
            <Pulpit
              naUstawienia={() => ustawUstawieniaOtwarte(true)}
              naSygnal={() => ustawZakladke('sygnaly')}
              naNewsy={() => ustawZakladke('newsy')}
            />
          )}
          {zakladka === 'wykres' && <Wykres />}
          {zakladka === 'sygnaly' && <Sygnaly />}
          {zakladka === 'newsy' && <Newsy />}
          {zakladka === 'rynek' && <Rynek />}
        </motion.div>
      </div>

      {/* Ustawienia to nakładka – tu animacja wejścia i wyjścia ma sens. */}
      <AnimatePresence>
        {ustawieniaOtwarte && (
          <motion.div
            key="ustawienia"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 28 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed inset-0 z-40"
            style={{ background: 'var(--tlo-0)' }}
          >
            <Ustawienia naZamknij={() => ustawUstawieniaOtwarte(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {!ustawieniaOtwarte && (
        <PasekNawigacji aktywna={zakladka} naZmiane={ustawZakladke} licznikNewsow={nieprzeczytane} />
      )}
    </>
  )
}
