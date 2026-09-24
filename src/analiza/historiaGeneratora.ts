/**
 * Wyniki historyczne generatora – liczone skryptem `npm run backtest:generator`
 * na siatce horyzontów 2–90 dni i dołączone do aplikacji.
 *
 * Aplikacja pokazuje je przy wybranej liczbie dni, żeby użytkownik widział,
 * jak taki sygnał wypadał w przeszłości – razem z przedziałem ufności
 * i ostrzeżeniem, gdy próba jest za mała, żeby cokolwiek z niej wnioskować.
 */

import dane from './historiaGeneratora.json'
import type { Interwal } from './profile'

export interface WynikWariantu {
  transakcji: number
  naRok: number
  skutecznosc: number
  sredniR: number
  sumaR: number
  profitFactor: number | null
  maksObsuniecie: number
  trafienieTp1: number
  /** Sygnały, w których cena nie doszła do poziomu wejścia (zlecenie limit nie weszło). */
  niewypelnione: number
  /** 95-procentowy przedział ufności średniego wyniku w R. */
  przedzialR: [number, number] | null
}

export interface WpisHistoriiGeneratora {
  dni: number
  interwalBazowy: Interwal
  /** Sygnał brany za każdym razem – tak działa przycisk „Wygeneruj sygnał”. */
  naZadanie: WynikWariantu
  /** Tylko sygnały, przy których silnik sam widział przewagę. */
  zProgami: WynikWariantu
}

export interface HistoriaGeneratora {
  policzono: string
  okno: { od: string; do: string }
  zrodlo: string
  horyzonty: WpisHistoriiGeneratora[]
}

export const HISTORIA_GENERATORA = dane as HistoriaGeneratora

/**
 * Najbliższy policzony horyzont. Odległość mierzona w skali logarytmicznej –
 * 40 dni jest „bliżej” 45 niż 30, tak jak na suwaku.
 */
export function historiaDlaDni(
  dni: number,
  historia: HistoriaGeneratora = HISTORIA_GENERATORA,
): WpisHistoriiGeneratora | null {
  let najlepszy: WpisHistoriiGeneratora | null = null
  let odleglosc = Infinity
  for (const w of historia.horyzonty) {
    const o = Math.abs(Math.log(w.dni) - Math.log(dni))
    if (o < odleglosc) {
      odleglosc = o
      najlepszy = w
    }
  }
  return najlepszy
}

export type WielkoscProby = 'mala' | 'srednia' | 'duza'

/** Poniżej 30 transakcji wynik to w dużej mierze przypadek, od 100 da się na nim opierać. */
export function wielkoscProby(transakcji: number): WielkoscProby {
  if (transakcji < 30) return 'mala'
  if (transakcji < 100) return 'srednia'
  return 'duza'
}

export type OcenaPrzewagi = 'potwierdzona' | 'niepewna' | 'brak'

/**
 * Czy wynik historyczny wychodzi poza granice przypadku.
 *  • potwierdzona – dolna granica przedziału ufności powyżej zera,
 *  • niepewna     – średnia na plusie, ale przedział obejmuje zero,
 *  • brak         – średnia na zero albo pod kreską.
 */
export function ocenaPrzewagi(w: WynikWariantu): OcenaPrzewagi {
  if (w.transakcji === 0 || w.sredniR <= 0) return 'brak'
  if (w.przedzialR && w.przedzialR[0] > 0) return 'potwierdzona'
  return 'niepewna'
}

/** Jaki odsetek sygnałów nie doczekał się wejścia – w procentach. */
export function odsetekNiewypelnionych(w: WynikWariantu): number {
  const wszystkie = w.transakcji + w.niewypelnione
  return wszystkie > 0 ? (w.niewypelnione / wszystkie) * 100 : 0
}
