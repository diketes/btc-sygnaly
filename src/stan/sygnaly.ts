/**
 * Stan sygnałów: bieżąca analiza dla każdego horyzontu, aktywne pozycje,
 * historia i statystyki skuteczności.
 *
 * Zasada: na jeden horyzont przypada maksymalnie JEDEN aktywny sygnał.
 * Bez tego nakładałyby się na siebie mocno skorelowane pozycje, a statystyki
 * skuteczności przestałyby cokolwiek znaczyć.
 */

import { create } from 'zustand'
import { biezacyWynikR, czekaNaWejscie, czyAktywny, zaktualizujWszystkie } from '@/analiza/cykl'
import { HORYZONTY, horyzontyDlaTrybu, opisDni, type Horyzont, type TrybHoryzontu } from '@/analiza/profile'
import { policzStatystyki, type Statystyki, PUSTE_STATYSTYKI } from '@/analiza/statystyki'
import {
  czySygnal,
  czyZGeneratora,
  type KontekstRynku,
  type Sygnal,
  type WynikAnalizy,
} from '@/analiza/typy'
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
  /** Skuteczność śledzonych sygnałów z generatora (własna liczba dni), osobno. */
  statystykiGeneratora: Statystyki
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
  /**
   * Bierze sygnał z generatora pod obserwację: TP/SL pilnowane jak przy
   * zwykłych sygnałach, z powiadomieniami. Śledzony jest jeden naraz –
   * poprzedni zostaje zamknięty po bieżącej cenie.
   */
  sledz: (sygnal: Sygnal) => Promise<void>
  /** Kończy śledzenie sygnału z generatora – zamknięcie po bieżącej cenie. */
  zakonczSledzenie: (id: string) => Promise<void>
  wyczyscSwiezy: () => void
  wyczyscHistorie: () => Promise<void>
}

/** Ile punktów wskazania trzymamy na horyzont (ok. 6 godzin przy liczeniu co 90 s). */
const MAKS_WSKAZAN = 240

/**
 * Statystyki liczone osobno dla sygnałów własnych silnika, wymuszonych
 * przyciskiem i z generatora. Mieszanie ich zniekształcałoby obraz
 * skuteczności: sygnały na żądanie z założenia nie przeszły progów, a te
 * z generatora grają na zupełnie innych horyzontach.
 */
function przeliczStatystyki(
  historia: Sygnal[],
  aktywne: Sygnal[],
  ryzyko: number,
): Pick<StanSygnalow, 'statystyki' | 'statystykiNaZadanie' | 'statystykiGeneratora'> {
  const zwykle: Sygnal[] = []
  const naZadanie: Sygnal[] = []
  const generator: Sygnal[] = []
  for (const s of [...historia, ...aktywne]) {
    if (czyZGeneratora(s)) generator.push(s)
    else if (s.naZadanie) naZadanie.push(s)
    else zwykle.push(s)
  }
  const licz = (lista: Sygnal[]) => (lista.length > 0 ? policzStatystyki(lista, ryzyko) : PUSTE_STATYSTYKI)
  return {
    statystyki: licz(zwykle),
    statystykiNaZadanie: licz(naZadanie),
    statystykiGeneratora: licz(generator),
  }
}

/**
 * Zamyka sygnał po bieżącej cenie – gdy zastępuje go nowy albo użytkownik
 * kończy śledzenie. Wynik liczony tak samo jak przy wygaśnięciu, więc
 * porzucenie przegrywającej pozycji nie wymazuje jej ze statystyk.
 */
function zamknijPoCenie(s: Sygnal, cena: number, opis: string, teraz = Date.now()): Sygnal {
  // Zlecenie limit, które nie weszło, nie ma wyniku – pozycji nigdy nie było.
  if (czekaNaWejscie(s)) {
    return {
      ...s,
      status: 'uniewazniony',
      zamkniety: teraz,
      wynikR: null,
      zdarzenia: [
        ...s.zdarzenia,
        { czas: teraz, typ: 'uniewazniony', cena, opis: `${opis} Zlecenie nie weszło – bez wyniku.` },
      ],
    }
  }
  const osiagniety = [...s.cele].reverse().find((c) => c.osiagniety)
  const wynikR = osiagniety ? osiagniety.r : Math.max(-1, biezacyWynikR(s, cena))
  return {
    ...s,
    status: 'uniewazniony',
    zamkniety: teraz,
    wynikR,
    zdarzenia: [...s.zdarzenia, { czas: teraz, typ: 'uniewazniony', cena, opis }],
  }
}

/** Nazwa sygnału do powiadomień: „krótki termin”, „generator · 2 tygodnie”. */
export function nazwaSygnalu(s: Sygnal): string {
  if (czyZGeneratora(s)) return `generator · ${opisDni(s.dniHoryzontu!)}`
  return s.horyzont === 'krotki' ? 'krótki termin' : 'długi termin'
}

export const uzyjSygnalow = create<StanSygnalow>((set, get) => ({
  analizy: {},
  aktywne: [],
  historia: [],
  statystyki: PUSTE_STATYSTYKI,
  statystykiNaZadanie: PUSTE_STATYSTYKI,
  statystykiGeneratora: PUSTE_STATYSTYKI,
  wskazania: {},
  liczenie: false,
  liczenieNaZadanie: null,
  ostatnieLiczenie: null,
  swiezySygnal: null,

  async wczytaj() {
    const wszystkie = await wczytajSygnaly()
    const aktywne = wszystkie.filter(czyAktywny)
    const historia = wszystkie.filter((s) => !czyAktywny(s))
    set({ aktywne, historia, ...przeliczStatystyki(historia, aktywne, uzyjUstawien.getState().ryzykoProc) })
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
      // nie ma sensu trzymać kilku wymuszonych naraz. Stary jest zamykany
      // (a nie tylko chowany), inaczej wróciłby z bazy po restarcie.
      const doZastapienia = (s: Sygnal) => s.naZadanie && !czyZGeneratora(s) && s.horyzont === horyzont
      const cena = uzyjRynku.getState().cena
      const zastapione = get()
        .aktywne.filter(doZastapienia)
        .map((s) => zamknijPoCenie(s, cena ?? s.cenaOdniesienia, 'Zastąpiony nowym sygnałem na żądanie.'))
      set((s) => ({
        aktywne: [...s.aktywne.filter((x) => !doZastapienia(x)), analiza],
        historia: [...zastapione, ...s.historia].sort((a, b) => b.utworzony - a.utworzony),
        swiezySygnal: analiza,
      }))
      await zapiszSygnaly([...zastapione, analiza])
      void drgnij('mocno')

      const ustawienia = uzyjUstawien.getState()
      set((s) => przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc))
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
      // Sygnały z generatora żyją na własnej osi dni i nie wstrzymują kart
      // „krótki/długi”.
      const poprzednie: Partial<
        Record<Horyzont, { kierunek: 'long' | 'short'; utworzony: number } | null>
      > = {}
      const stale = [...get().historia, ...aktywne].filter((s) => !czyZGeneratora(s))
      for (const h of HORYZONTY) {
        const ostatni = stale
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
        if (aktywne.some((s) => s.horyzont === h && !czyZGeneratora(s))) continue

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
            tytul: `${sygnal.kierunek === 'long' ? '🟢 LONG' : '🔴 SHORT'} · ${nazwaSygnalu(sygnal)}`,
            tresc:
              `Wejście ${Math.round(sygnal.wejscie)} · SL ${Math.round(sygnal.stopLoss)} · ` +
              `TP1 ${Math.round(sygnal.cele[0].cena)} · pewność ${sygnal.pewnosc}%`,
            tag: `sygnal-${sygnal.horyzont}`,
          })
        }
      }

      set((s) => przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc))
    } finally {
      set({ liczenie: false })
    }
  },

  async sledz(sygnal) {
    if (!czyZGeneratora(sygnal) || get().aktywne.some((s) => s.id === sygnal.id)) return
    const cena = uzyjRynku.getState().cena
    const zastapione = get()
      .aktywne.filter(czyZGeneratora)
      .map((s) =>
        zamknijPoCenie(
          s,
          cena ?? s.cenaOdniesienia,
          'Zastąpiony nowym sygnałem z generatora – zamknięty po bieżącej cenie.',
        ),
      )
    set((s) => ({
      aktywne: [...s.aktywne.filter((x) => !czyZGeneratora(x)), sygnal],
      historia: [...zastapione, ...s.historia].sort((a, b) => b.utworzony - a.utworzony),
      swiezySygnal: sygnal,
    }))
    await zapiszSygnaly([...zastapione, sygnal])
    void drgnij('mocno')
    set((s) => przeliczStatystyki(s.historia, s.aktywne, uzyjUstawien.getState().ryzykoProc))
  },

  async zakonczSledzenie(id) {
    const sygnal = get().aktywne.find((s) => s.id === id)
    if (!sygnal || !czyZGeneratora(sygnal)) return
    const cena = uzyjRynku.getState().cena ?? sygnal.cenaOdniesienia
    const zamkniety = zamknijPoCenie(sygnal, cena, 'Śledzenie zakończone ręcznie – zamknięty po bieżącej cenie.')
    set((s) => ({
      aktywne: s.aktywne.filter((x) => x.id !== id),
      historia: [zamkniety, ...s.historia].sort((a, b) => b.utworzony - a.utworzony),
    }))
    await zapiszSygnal(zamkniety)
    set((s) => przeliczStatystyki(s.historia, s.aktywne, uzyjUstawien.getState().ryzykoProc))
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
      if (s.powiadomionoOWejsciu || s.wypelniony) continue
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
        else if (z.typ === 'wejscie') void drgnij('srednio')
        const ikona = sukces ? '🎯' : z.typ === 'sl' ? '🛑' : z.typ === 'wejscie' ? '✅' : '⌛'

        if (ustawienia.powiadomieniaCele && poraNaPowiadomienie(ustawienia)) {
          void powiadom({
            tytul: `${ikona} ${sygnal.kierunek.toUpperCase()} · ${nazwaSygnalu(sygnal)}`,
            tresc: z.opis,
            tag: `cel-${sygnal.id}`,
          })
        }
      }
    }

    set((s) => przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc))
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
      statystykiGeneratora: PUSTE_STATYSTYKI,
      wskazania: {},
      analizy: {},
    })
  },
}))

/** Aktywny sygnał stałego horyzontu (lub null) – bez sygnałów z generatora. */
export function aktywnyDlaHoryzontu(lista: readonly Sygnal[], h: Horyzont): Sygnal | null {
  return lista.find((s) => s.horyzont === h && !czyZGeneratora(s)) ?? null
}

/** Śledzony sygnał z generatora (lub null). */
export function aktywnyZGeneratora(lista: readonly Sygnal[]): Sygnal | null {
  return lista.find(czyZGeneratora) ?? null
}
