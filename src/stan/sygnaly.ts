/**
 * Stan sygnałów: bieżąca analiza dla każdego horyzontu, aktywne pozycje,
 * historia i statystyki skuteczności.
 *
 * Zasada: na jeden horyzont przypada maksymalnie JEDEN aktywny sygnał.
 * Bez tego nakładałyby się na siebie mocno skorelowane pozycje, a statystyki
 * skuteczności przestałyby cokolwiek znaczyć.
 */

import { create } from 'zustand'
import { czyAktywny, zaktualizujWszystkie } from '@/analiza/cykl'
import { HORYZONTY, horyzontyDlaTrybu, type Horyzont, type TrybHoryzontu } from '@/analiza/profile'
import { policzStatystyki, type Statystyki, PUSTE_STATYSTYKI } from '@/analiza/statystyki'
import { czySygnal, type KontekstRynku, type Sygnal, type WynikAnalizy } from '@/analiza/typy'
import { policzAnalize } from '@/analiza/workerKlient'
import { usunSygnaly, wczytajSygnaly, zapiszSygnal, zapiszSygnaly } from '@/dane/db'
import { drgnij, drgnijBlad, drgnijSukces, powiadom } from '@/lib/powiadomienia'
import { poraNaPowiadomienie, uzyjUstawien } from './ustawienia'
import { uzyjRynku } from './rynek'

/** Punkt na wykresie wskazania silnika w czasie. */
export interface PunktWskazania {
  czas: number
  wynik: number
}

interface StanSygnalow {
  analizy: Partial<Record<Horyzont, WynikAnalizy>>
  aktywne: Sygnal[]
  historia: Sygnal[]
  /** Skuteczność zwykłych sygnałów – tych, które silnik wystawił sam. */
  statystyki: Statystyki
  /** Skuteczność sygnałów wymuszonych przyciskiem „Daj sygnał”, osobno. */
  statystykiNaZadanie: Statystyki
  /** Ostatnie wskazania silnika – pokazywane jako mini-wykres. */
  wskazania: Partial<Record<Horyzont, PunktWskazania[]>>
  liczenie: boolean
  /** Trwa liczenie sygnału na żądanie (dla konkretnego horyzontu). */
  liczenieNaZadanie: Horyzont | null
  ostatnieLiczenie: number | null
  /** Sygnał, który właśnie się pojawił – do animacji i efektów. */
  swiezySygnal: Sygnal | null

  wczytaj: () => Promise<void>
  przelicz: (tryb: TrybHoryzontu, kontekst: KontekstRynku) => Promise<void>
  dajSygnal: (horyzont: Horyzont, kontekst: KontekstRynku) => Promise<void>
  sprawdzCeny: (cena: number) => Promise<void>
  wyczyscSwiezy: () => void
  wyczyscHistorie: () => Promise<void>
}

/** Ile punktów wskazania trzymamy na horyzont (ok. 6 godzin przy liczeniu co 90 s). */
const MAKS_WSKAZAN = 240

/**
 * Statystyki liczone osobno dla sygnałów własnych silnika i dla wymuszonych
 * przyciskiem. Mieszanie ich zniekształcałoby obraz skuteczności: sygnały
 * na żądanie z założenia nie przeszły progów, więc wypadają słabiej.
 */
function przeliczStatystyki(
  historia: Sygnal[],
  aktywne: Sygnal[],
  ryzyko: number,
): { zwykle: Statystyki; naZadanie: Statystyki } {
  const wszystkie = [...historia, ...aktywne]
  const zwykle = wszystkie.filter((s) => !s.naZadanie)
  const naZadanie = wszystkie.filter((s) => s.naZadanie)
  return {
    zwykle: zwykle.length > 0 ? policzStatystyki(zwykle, ryzyko) : PUSTE_STATYSTYKI,
    naZadanie: naZadanie.length > 0 ? policzStatystyki(naZadanie, ryzyko) : PUSTE_STATYSTYKI,
  }
}

export const uzyjSygnalow = create<StanSygnalow>((set, get) => ({
  analizy: {},
  aktywne: [],
  historia: [],
  statystyki: PUSTE_STATYSTYKI,
  statystykiNaZadanie: PUSTE_STATYSTYKI,
  wskazania: {},
  liczenie: false,
  liczenieNaZadanie: null,
  ostatnieLiczenie: null,
  swiezySygnal: null,

  async wczytaj() {
    const wszystkie = await wczytajSygnaly()
    const aktywne = wszystkie.filter(czyAktywny)
    const historia = wszystkie.filter((s) => !czyAktywny(s))
    const st = przeliczStatystyki(historia, aktywne, uzyjUstawien.getState().ryzykoProc)
    set({ aktywne, historia, statystyki: st.zwykle, statystykiNaZadanie: st.naZadanie })
  },

  /**
   * „Daj sygnał” – pokazuje, w którą stronę silnik przechyla się w tej chwili,
   * nawet gdy przewaga jest za słaba na zwykły sygnał. Wynik jest oznaczony
   * i liczony w statystykach osobno.
   */
  async dajSygnal(horyzont, kontekst) {
    if (get().liczenieNaZadanie) return
    const swieceWg = uzyjRynku.getState().swieceWg
    if (Object.keys(swieceWg).length === 0) return

    set({ liczenieNaZadanie: horyzont })
    try {
      const wynik = await policzAnalize([horyzont], swieceWg, kontekst, {}, true)
      const analiza = wynik[horyzont]
      if (!analiza || !czySygnal(analiza)) return

      // Zastępujemy ewentualny poprzedni sygnał na żądanie tego horyzontu –
      // nie ma sensu trzymać kilku wymuszonych naraz.
      const bezStarych = get().aktywne.filter((s) => !(s.naZadanie && s.horyzont === horyzont))
      set({ aktywne: [...bezStarych, analiza], swiezySygnal: analiza })
      await zapiszSygnal(analiza)
      void drgnij('mocno')

      const ustawienia = uzyjUstawien.getState()
      set((s) => {
        const st = przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc)
        return { statystyki: st.zwykle, statystykiNaZadanie: st.naZadanie }
      })
    } finally {
      set({ liczenieNaZadanie: null })
    }
  },

  async przelicz(tryb, kontekst) {
    if (get().liczenie) return
    const swieceWg = uzyjRynku.getState().swieceWg
    if (Object.keys(swieceWg).length === 0) return

    set({ liczenie: true })
    try {
      const horyzonty = horyzontyDlaTrybu(tryb)
      const aktywne = get().aktywne

      // Cooldown liczymy od ostatniego sygnału danego horyzontu – także zamkniętego.
      const poprzednie: Partial<
        Record<Horyzont, { kierunek: 'long' | 'short'; utworzony: number } | null>
      > = {}
      for (const h of HORYZONTY) {
        const ostatni = [...get().historia, ...aktywne]
          .filter((s) => s.horyzont === h)
          .sort((a, b) => b.utworzony - a.utworzony)[0]
        poprzednie[h] = ostatni ? { kierunek: ostatni.kierunek, utworzony: ostatni.utworzony } : null
      }

      const wynik = await policzAnalize(horyzonty, swieceWg, kontekst, poprzednie)
      const teraz = Date.now()
      set({ analizy: wynik as Partial<Record<Horyzont, WynikAnalizy>>, ostatnieLiczenie: teraz })

      // Zapis wskazania do mini-wykresu: widać, czy rynek dojrzewa do sygnału,
      // czy się od niego oddala.
      set((s) => {
        const nowe = { ...s.wskazania }
        for (const h of horyzonty) {
          const a = wynik[h]
          if (!a) continue
          const seria = nowe[h] ?? []
          nowe[h] = [...seria, { czas: teraz, wynik: a.wynik }].slice(-MAKS_WSKAZAN)
        }
        return { wskazania: nowe }
      })

      // Nowy sygnał przyjmujemy tylko, gdy dany horyzont nie ma otwartej pozycji.
      const ustawienia = uzyjUstawien.getState()
      for (const h of horyzonty) {
        const analiza = wynik[h]
        if (!analiza || !czySygnal(analiza)) continue
        if (aktywne.some((s) => s.horyzont === h)) continue

        const sygnal = analiza
        set((s) => ({ aktywne: [...s.aktywne, sygnal], swiezySygnal: sygnal }))
        await zapiszSygnal(sygnal)
        void drgnij('mocno')

        if (
          ustawienia.powiadomieniaSygnaly &&
          sygnal.pewnosc >= ustawienia.progPewnosci &&
          poraNaPowiadomienie(ustawienia)
        ) {
          void powiadom({
            tytul: `${sygnal.kierunek === 'long' ? '🟢 LONG' : '🔴 SHORT'} · ${
              sygnal.horyzont === 'krotki' ? 'krótki termin' : 'długi termin'
            }`,
            tresc:
              `Wejście ${Math.round(sygnal.wejscie)} · SL ${Math.round(sygnal.stopLoss)} · ` +
              `TP1 ${Math.round(sygnal.cele[0].cena)} · pewność ${sygnal.pewnosc}%`,
            tag: `sygnal-${sygnal.horyzont}`,
          })
        }
      }

      set((s) => {
        const st = przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc)
        return { statystyki: st.zwykle, statystykiNaZadanie: st.naZadanie }
      })
    } finally {
      set({ liczenie: false })
    }
  },

  async sprawdzCeny(cena) {
    const aktywne = get().aktywne
    if (aktywne.length === 0 || !Number.isFinite(cena)) return

    // Sygnał z wejściem limitowym jest bezużyteczny, jeśli człowiek przegapi
    // moment, w którym cena wraca na poziom zlecenia. Ostrzegamy raz, gdy
    // brakuje już mniej niż 0,35%.
    const ustawieniaCeny = uzyjUstawien.getState()
    const doOznaczenia: Sygnal[] = []
    for (const s of aktywne) {
      if (s.powiadomionoOWejsciu) continue
      const limit = Math.abs(s.wejscie - s.cenaOdniesienia) > 1e-9
      if (!limit) continue
      const odlegloscProc = (Math.abs(cena - s.wejscie) / s.wejscie) * 100
      if (odlegloscProc > 0.35) continue

      doOznaczenia.push({ ...s, powiadomionoOWejsciu: true })
      if (ustawieniaCeny.powiadomieniaCele && poraNaPowiadomienie(ustawieniaCeny)) {
        void powiadom({
          tytul: `🎯 Cena przy wejściu · ${s.kierunek.toUpperCase()}`,
          tresc:
            `BTC ${Math.round(cena)} USDT, poziom wejścia ${Math.round(s.wejscie)}. ` +
            `Stop ${Math.round(s.stopLoss)}, TP1 ${Math.round(s.cele[0].cena)}.`,
          tag: `wejscie-${s.id}`,
        })
      }
    }
    if (doOznaczenia.length > 0) {
      const mapa = new Map(doOznaczenia.map((s) => [s.id, s]))
      set((s) => ({ aktywne: s.aktywne.map((x) => mapa.get(x.id) ?? x) }))
      await zapiszSygnaly(doOznaczenia)
    }

    const { sygnaly, zmiany } = zaktualizujWszystkie(get().aktywne, cena)
    if (zmiany.length === 0) return

    const ustawienia = uzyjUstawien.getState()
    const nadalAktywne = sygnaly.filter(czyAktywny)
    const zamkniete = sygnaly.filter((s) => !czyAktywny(s))

    set((s) => ({
      aktywne: nadalAktywne,
      historia: [...zamkniete, ...s.historia].sort((a, b) => b.utworzony - a.utworzony),
    }))
    await zapiszSygnaly(sygnaly)

    for (const { sygnal, zdarzenia } of zmiany) {
      for (const z of zdarzenia) {
        if (z.typ === 'be') continue // techniczne, nie zawracamy głowy
        const sukces = z.typ === 'tp1' || z.typ === 'tp2' || z.typ === 'tp3'
        if (sukces) void drgnijSukces()
        else if (z.typ === 'sl') void drgnijBlad()

        if (ustawienia.powiadomieniaCele && poraNaPowiadomienie(ustawienia)) {
          void powiadom({
            tytul: `${sukces ? '🎯' : '🛑'} ${sygnal.kierunek.toUpperCase()} · ${
              sygnal.horyzont === 'krotki' ? 'krótki termin' : 'długi termin'
            }`,
            tresc: z.opis,
            tag: `cel-${sygnal.id}`,
          })
        }
      }
    }

    set((s) => {
      const st = przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc)
      return { statystyki: st.zwykle, statystykiNaZadanie: st.naZadanie }
    })
  },

  wyczyscSwiezy() {
    set({ swiezySygnal: null })
  },

  async wyczyscHistorie() {
    await usunSygnaly()
    set({
      aktywne: [],
      historia: [],
      statystyki: PUSTE_STATYSTYKI,
      statystykiNaZadanie: PUSTE_STATYSTYKI,
      wskazania: {},
      analizy: {},
    })
  },
}))

/** Aktywny sygnał danego horyzontu (lub null). */
export function aktywnyDlaHoryzontu(lista: readonly Sygnal[], h: Horyzont): Sygnal | null {
  return lista.find((s) => s.horyzont === h) ?? null
}
