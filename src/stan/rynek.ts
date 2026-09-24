/**
 * Stan rynku: cena na żywo, świece, księga zleceń, likwidacje i migawka danych
 * pochodnych. Spina WebSocket z pamięcią lokalną i pilnuje, żeby aplikacja
 * działała także offline (na ostatnich zapisanych danych).
 */

import { create } from 'zustand'
import { potrzebneInterwaly, type Interwal, type TrybHoryzontu } from '@/analiza/profile'
import type { Swieca } from '@/analiza/wskazniki'
import { pobierzSwiece, pobierzTicker, stanZrodla, type Ticker } from '@/dane/gieldy'
import { pobierzMigawkeRynku, type MigawkaRynku } from '@/dane/rynek'
import { scalSerie, scalSwiece, strumien, type Ksiega, type Likwidacja, type StatusPolaczenia } from '@/dane/ws'
import { wczytajMigawke, wczytajWszystkieSwiece, zapiszMigawke, zapiszSwiece } from '@/dane/db'

/** Ile milisekund trzymamy likwidacje do wyliczeń i wykresu. */
const OKNO_LIKWIDACJI = 15 * 60_000

interface StanRynku {
  cena: number | null
  poprzedniaCena: number | null
  ticker: Ticker | null
  swieceWg: Partial<Record<Interwal, Swieca[]>>
  ksiega: Ksiega | null
  likwidacje: Likwidacja[]
  migawka: MigawkaRynku | null
  status: StatusPolaczenia
  zrodlo: string
  ladowanie: boolean
  blad: string | null
  /** Czas ostatnich świeżych danych – do plakietki „offline”. */
  ostatnieDane: number | null
  danieZPamieci: boolean
  /** Rośnie przy każdym zamknięciu świecy bazowej – wyzwala przeliczenie analizy. */
  wersjaSwiec: number

  uruchom: (tryb: TrybHoryzontu) => Promise<void>
  zatrzymaj: () => void
  odswiezMigawke: () => Promise<void>
  /** `tylkoBrakujace` pomija interwały, które mamy świeże – oszczędza limity API. */
  odswiezSwiece: (tylkoBrakujace?: boolean) => Promise<void>
  zapewnijInterwal: (interwal: Interwal) => Promise<void>
  /**
   * Pilnuje, żeby podane interwały były świeże – dociąga te, których nie mamy
   * albo które pobraliśmy dawniej niż `maksWiekMs` temu. Interwały płynące
   * strumieniem na żywo są aktualne same z siebie i nie są pobierane ponownie.
   * Zwraca listę interwałów, których nie udało się odświeżyć.
   */
  zapewnijSwieze: (interwaly: readonly Interwal[], maksWiekMs?: number) => Promise<Interwal[]>
}

/** Kiedy ostatnio pobraliśmy dany interwał z sieci. */
const pobranoInterwal = new Map<Interwal, number>()
const SWIEZOSC_MS = 2 * 60_000

let odpiecia: (() => void)[] = []
let ostatniaEmisjaCeny = 0
let biezaceInterwaly: Interwal[] = []
let timerMigawki: ReturnType<typeof setInterval> | null = null
/** Zapobiega przeplataniu się dwóch uruchomień (np. przy szybkiej zmianie horyzontu). */
let uruchamianieWToku = false

export const uzyjRynku = create<StanRynku>((set, get) => ({
  cena: null,
  poprzedniaCena: null,
  ticker: null,
  swieceWg: {},
  ksiega: null,
  likwidacje: [],
  migawka: null,
  status: 'rozlaczony',
  zrodlo: 'Binance',
  ladowanie: true,
  blad: null,
  ostatnieDane: null,
  danieZPamieci: false,
  wersjaSwiec: 0,

  async uruchom(tryb) {
    if (uruchamianieWToku) return
    uruchamianieWToku = true
    set({ ladowanie: true, blad: null })
    try {

      // 1. Natychmiast pokazujemy to, co mamy zapisane – ekran nie jest pusty.
      const [zapisane, migawkaZPamieci] = await Promise.all([
        wczytajWszystkieSwiece(),
        wczytajMigawke(),
      ])
      if (zapisane.length > 0) {
        const z: Partial<Record<Interwal, Swieca[]>> = {}
        for (const s of zapisane) z[s.klucz] = s.dane
        const najnowsze = Math.max(...zapisane.map((s) => s.zapisano))
        set({
          swieceWg: z,
          cena: zapisane[0]?.dane.at(-1)?.c ?? null,
          ostatnieDane: najnowsze,
          danieZPamieci: true,
        })
      }
      if (migawkaZPamieci) set({ migawka: migawkaZPamieci.dane })

      // 2. Świeże dane z sieci.
      const interwaly = potrzebneInterwaly(tryb)
      biezaceInterwaly = interwaly
      // Przy zmianie horyzontu dociągamy tylko to, czego jeszcze nie mamy.
      await get().odswiezSwiece(true)
      void get().odswiezMigawke()

      // 3. Strumień na żywo.
      odpiecia.forEach((o) => o())
      odpiecia = [
        strumien.na('status', (s) => set({ status: s, zrodlo: stanZrodla().aktywna })),

        strumien.na('cena', (cena) => {
          // Cena tyka wiele razy na sekundę – do stanu wpuszczamy ją rzadziej,
          // żeby nie przerysowywać drzewa Reacta bez potrzeby.
          const teraz = Date.now()
          if (teraz - ostatniaEmisjaCeny < 220) return
          ostatniaEmisjaCeny = teraz
          set((s) => ({
            poprzedniaCena: s.cena,
            cena,
            ostatnieDane: teraz,
            danieZPamieci: false,
          }))
        }),

        strumien.na('ticker', (t) => {
          set((s) => ({
            ticker: s.ticker
              ? { ...s.ticker, cena: t.cena, zmiana24hProc: t.zmianaProc, max24h: t.max, min24h: t.min, wolumen24h: t.wolumen }
              : {
                  cena: t.cena,
                  zmiana24hProc: t.zmianaProc,
                  zmiana24hUsd: 0,
                  max24h: t.max,
                  min24h: t.min,
                  wolumen24h: t.wolumen,
                  czas: Date.now(),
                },
          }))
        }),

        strumien.na('swieca', (interwal, swieca, zamknieta) => {
          set((s) => {
            const seria = s.swieceWg[interwal]
            if (!seria) return {}
            const nowa = scalSwiece(seria, swieca)
            return {
              swieceWg: { ...s.swieceWg, [interwal]: nowa },
              wersjaSwiec: zamknieta ? s.wersjaSwiec + 1 : s.wersjaSwiec,
            }
          })
          if (zamknieta) void zapiszSwiece(interwal, get().swieceWg[interwal] ?? [])
        }),

        strumien.na('swieceUzupelnione', (interwal, swiece) => {
          set((s) => ({
            swieceWg: {
              ...s.swieceWg,
              [interwal]: scalSerie(s.swieceWg[interwal] ?? [], swiece),
            },
            wersjaSwiec: s.wersjaSwiec + 1,
            ostatnieDane: Date.now(),
            danieZPamieci: false,
          }))
          void zapiszSwiece(interwal, get().swieceWg[interwal] ?? [])
        }),

        strumien.na('ksiega', (k) => set({ ksiega: k })),

        strumien.na('likwidacja', (l) => {
          set((s) => {
            const granica = Date.now() - OKNO_LIKWIDACJI
            return { likwidacje: [...s.likwidacje.filter((x) => x.czas >= granica), l].slice(-400) }
          })
        }),
      ]

        strumien.start(interwaly)

      // 4. Dane pochodne odświeżamy co 2 minuty.
      if (timerMigawki) clearInterval(timerMigawki)
      timerMigawki = setInterval(() => void get().odswiezMigawke(), 120_000)
    } finally {
      uruchamianieWToku = false
      set({ ladowanie: false })
    }
  },

  zatrzymaj() {
    odpiecia.forEach((o) => o())
    odpiecia = []
    if (timerMigawki) clearInterval(timerMigawki)
    timerMigawki = null
    strumien.stop()
  },

  async odswiezSwiece(tylkoBrakujace = false) {
    const teraz = Date.now()
    const doPobrania = tylkoBrakujace
      ? biezaceInterwaly.filter((i) => {
          const maDane = (get().swieceWg[i]?.length ?? 0) > 0
          const pobrano = pobranoInterwal.get(i) ?? 0
          return !maDane || teraz - pobrano > SWIEZOSC_MS
        })
      : biezaceInterwaly

    if (doPobrania.length === 0) return

    // Wyższe interwały nie potrzebują tysiąca świec – 1000 tygodniówek to 19 lat.
    const ileSwiec = (i: Interwal) => (i === '1w' || i === '3d' ? 400 : 1000)

    const wyniki = await Promise.allSettled(
      doPobrania.map(async (i) => ({ i, dane: await pobierzSwiece(i, ileSwiec(i)) })),
    )

    const nowe: Partial<Record<Interwal, Swieca[]>> = {}
    let udane = 0
    for (const w of wyniki) {
      if (w.status === 'fulfilled' && w.value.dane.length > 0) {
        nowe[w.value.i] = w.value.dane
        pobranoInterwal.set(w.value.i, teraz)
        udane++
        void zapiszSwiece(w.value.i, w.value.dane)
      }
    }

    if (udane === 0) {
      set({
        blad: get().swieceWg['1h']
          ? 'Brak połączenia – pokazuję ostatnie zapisane dane.'
          : 'Nie udało się pobrać danych z żadnej giełdy.',
      })
      return
    }

    // Cenę bierzemy wprost z najświeższej świecy – mamy ją już pobraną, więc
    // ekran nie może zostać pusty tylko dlatego, że osobne zapytanie o ticker
    // się nie powiodło.
    const najkrotszy = (['5m', '15m', '1h', '4h', '1d', '3d', '1w'] as Interwal[]).find(
      (i) => (nowe[i]?.length ?? 0) > 0,
    )
    const cenaZeSwiec = najkrotszy ? nowe[najkrotszy]![nowe[najkrotszy]!.length - 1].c : null

    set((s) => ({
      swieceWg: { ...s.swieceWg, ...nowe },
      cena: cenaZeSwiec ?? s.cena,
      wersjaSwiec: s.wersjaSwiec + 1,
      ostatnieDane: Date.now(),
      danieZPamieci: false,
      blad: null,
      zrodlo: stanZrodla().aktywna,
    }))

    try {
      const t = await pobierzTicker()
      set({ ticker: t, cena: t.cena })
    } catch {
      // Ticker jest dodatkiem (zakres 24h) – cena i tak już jest ze świec,
      // a resztę uzupełni strumień na żywo.
    }
  },

  async odswiezMigawke() {
    try {
      const m = await pobierzMigawkeRynku()
      set({ migawka: m })
      void zapiszMigawke(m)
    } catch {
      /* zostaje poprzednia migawka */
    }
  },

  /** Dociąga interwał spoza bieżącego trybu (np. gdy użytkownik zmieni go na wykresie). */
  async zapewnijInterwal(interwal) {
    if (get().swieceWg[interwal]?.length) return
    try {
      const dane = await pobierzSwiece(interwal, interwal === '1w' || interwal === '3d' ? 400 : 1000)
      if (dane.length === 0) return
      pobranoInterwal.set(interwal, Date.now())
      set((s) => ({ swieceWg: { ...s.swieceWg, [interwal]: dane } }))
      void zapiszSwiece(interwal, dane)
    } catch {
      /* wykres pokaże komunikat o braku danych */
    }
  },

  async zapewnijSwieze(interwaly, maksWiekMs = SWIEZOSC_MS) {
    const teraz = Date.now()
    const naZywo = get().status === 'nazywo'
    const doPobrania = interwaly.filter((i) => {
      if ((get().swieceWg[i]?.length ?? 0) === 0) return true
      if (naZywo && biezaceInterwaly.includes(i)) return false
      return teraz - (pobranoInterwal.get(i) ?? 0) > maksWiekMs
    })
    if (doPobrania.length === 0) return []

    const wyniki = await Promise.allSettled(
      doPobrania.map(async (i) => ({
        i,
        dane: await pobierzSwiece(i, i === '1w' || i === '3d' ? 400 : 1000),
      })),
    )

    const nowe: Partial<Record<Interwal, Swieca[]>> = {}
    for (const w of wyniki) {
      if (w.status !== 'fulfilled' || w.value.dane.length === 0) continue
      nowe[w.value.i] = w.value.dane
      pobranoInterwal.set(w.value.i, Date.now())
      void zapiszSwiece(w.value.i, w.value.dane)
    }
    if (Object.keys(nowe).length > 0) set((s) => ({ swieceWg: { ...s.swieceWg, ...nowe } }))
    return doPobrania.filter((i) => !nowe[i])
  },
}))

/** Likwidacje z ostatnich `minut`, w rozbiciu na strony. */
export function podsumujLikwidacje(
  lista: readonly Likwidacja[],
  minut = 15,
  teraz = Date.now(),
): { long: number; short: number; razem: number } {
  const granica = teraz - minut * 60_000
  let long = 0
  let short = 0
  for (const l of lista) {
    if (l.czas < granica) continue
    if (l.strona === 'long') long += l.wartosc
    else short += l.wartosc
  }
  return { long, short, razem: long + short }
}
