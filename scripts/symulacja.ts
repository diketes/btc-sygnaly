/**
 * Symulacja przebiegu sygnału na przyszłych świecach – wspólna dla backtestu
 * stałych horyzontów i generatora. Zasady (celowo ostrożne):
 *  • wejście limitem liczy się dopiero, gdy cena faktycznie dotknie poziomu,
 *  • gdy w jednej świecy mieści się i stop, i cel – przyjmujemy trafienie stopa,
 *  • po TP1 stop wędruje na próg rentowności.
 */

import type { Sygnal } from '../src/analiza/typy'
import type { Swieca } from '../src/analiza/wskazniki'

export type PowodZamkniecia = 'tp3' | 'tp2-be' | 'tp1-be' | 'sl' | 'wygasl' | 'niewypelniony'

export interface WynikSymulacji {
  sygnal: Sygnal
  wynikR: number
  zamkniecie: number
  powod: PowodZamkniecia
  osiagnietyTp: number
  /** false = zlecenie limit nigdy się nie wypełniło, transakcji nie było. */
  wypelniony: boolean
}

/**
 * Przechodzi sygnał przez przyszłe świece i zwraca, jak się skończył.
 *
 * Wejście limitem (retest EMA21) NIE jest darmowe: pozycja powstaje dopiero,
 * gdy cena faktycznie dotknie poziomu zlecenia. Jeśli nigdy tam nie wróci,
 * transakcji nie ma i sygnał nie wchodzi do statystyk. Bez tego backtest
 * dostawałby lepsze wejścia, niż dałoby się osiągnąć na rynku.
 */
export function symuluj(sygnal: Sygnal, przyszlosc: readonly Swieca[]): WynikSymulacji {
  const znak = sygnal.kierunek === 'long' ? 1 : -1
  const ryzyko = Math.abs(sygnal.wejscie - sygnal.stopLoss)
  let stop = sygnal.stopLoss
  let osiagnietyTp = 0

  // Wejście rynkowe jest wypełnione od razu; limit czeka na dotknięcie ceny.
  const limit = Math.abs(sygnal.wejscie - sygnal.cenaOdniesienia) > 1e-9
  let wypelniony = !limit

  for (const s of przyszlosc) {
    if (s.czas > sygnal.wygasa) break

    if (!wypelniony) {
      // Zlecenie limit wypełnia się, gdy zakres świecy obejmie jego cenę.
      if (s.l <= sygnal.wejscie && s.h >= sygnal.wejscie) wypelniony = true
      else continue
    }

    const stopTrafiony = sygnal.kierunek === 'long' ? s.l <= stop : s.h >= stop
    if (stopTrafiony) {
      const r = (znak * (stop - sygnal.wejscie)) / ryzyko
      return {
        sygnal,
        wynikR: r,
        zamkniecie: s.czas,
        powod: osiagnietyTp > 0 ? (osiagnietyTp === 2 ? 'tp2-be' : 'tp1-be') : 'sl',
        osiagnietyTp,
        wypelniony: true,
      }
    }

    for (const cel of sygnal.cele) {
      if (cel.poziom <= osiagnietyTp) continue
      const trafiony = sygnal.kierunek === 'long' ? s.h >= cel.cena : s.l <= cel.cena
      if (!trafiony) continue

      osiagnietyTp = cel.poziom
      if (cel.poziom === 1) stop = sygnal.wejscie // przesunięcie na próg rentowności
      if (cel.poziom === 3) {
        return {
          sygnal,
          wynikR: cel.r,
          zamkniecie: s.czas,
          powod: 'tp3',
          osiagnietyTp: 3,
          wypelniony: true,
        }
      }
    }
  }

  if (!wypelniony) {
    return {
      sygnal,
      wynikR: 0,
      zamkniecie: sygnal.wygasa,
      powod: 'niewypelniony',
      osiagnietyTp: 0,
      wypelniony: false,
    }
  }

  // Sygnał dożył końca ważności – wycena po cenie z chwili wygaśnięcia.
  const ostatnia = przyszlosc.find((s) => s.czas > sygnal.wygasa) ?? przyszlosc[przyszlosc.length - 1]
  if (!ostatnia) {
    return {
      sygnal,
      wynikR: 0,
      zamkniecie: sygnal.wygasa,
      powod: 'wygasl',
      osiagnietyTp,
      wypelniony: true,
    }
  }
  const r =
    osiagnietyTp > 0
      ? sygnal.cele[osiagnietyTp - 1].r
      : (znak * (ostatnia.c - sygnal.wejscie)) / ryzyko
  return { sygnal, wynikR: r, zamkniecie: ostatnia.czas, powod: 'wygasl', osiagnietyTp, wypelniony: true }
}
