/**
 * Statystyki skuteczności sygnałów.
 *
 * Liczone z pełnej historii – bez wybierania „najlepszych”. Sygnały wygasłe
 * i unieważnione też się liczą, bo w realnym handlu też kosztują.
 */

import { czyZamkniety } from './cykl'
import type { Horyzont } from './profile'
import type { Sygnal } from './typy'

export interface Statystyki {
  liczba: number
  wygrane: number
  przegrane: number
  skutecznosc: number
  sredniR: number
  sumaR: number
  profitFactor: number
  najdluzszaSeriaStrat: number
  najdluzszaSeriaWygranych: number
  najwiekszeObsuniecie: number
  krzywaKapitalu: { czas: number; wartosc: number }[]
  /** Ile sygnałów sięgnęło danego celu. */
  trafienia: { tp1: number; tp2: number; tp3: number }
}

export const PUSTE_STATYSTYKI: Statystyki = {
  liczba: 0,
  wygrane: 0,
  przegrane: 0,
  skutecznosc: 0,
  sredniR: 0,
  sumaR: 0,
  profitFactor: 0,
  najdluzszaSeriaStrat: 0,
  najdluzszaSeriaWygranych: 0,
  najwiekszeObsuniecie: 0,
  krzywaKapitalu: [],
  trafienia: { tp1: 0, tp2: 0, tp3: 0 },
}

export function policzStatystyki(sygnaly: readonly Sygnal[], ryzykoProc = 1): Statystyki {
  const zamkniete = sygnaly
    .filter((s) => czyZamkniety(s) && s.wynikR !== null)
    .sort((a, b) => (a.zamkniety ?? a.utworzony) - (b.zamkniety ?? b.utworzony))

  if (zamkniete.length === 0) return { ...PUSTE_STATYSTYKI, krzywaKapitalu: [] }

  let sumaR = 0
  let zyski = 0
  let straty = 0
  let seriaStrat = 0
  let maksSeriaStrat = 0
  let seriaWygranych = 0
  let maksSeriaWygranych = 0
  let kapital = 100
  let szczyt = 100
  let obsuniecie = 0

  const krzywa: { czas: number; wartosc: number }[] = [
    { czas: zamkniete[0].utworzony, wartosc: 100 },
  ]
  const trafienia = { tp1: 0, tp2: 0, tp3: 0 }

  for (const s of zamkniete) {
    const r = s.wynikR ?? 0
    sumaR += r
    if (r > 0) {
      zyski += r
      seriaWygranych++
      seriaStrat = 0
      maksSeriaWygranych = Math.max(maksSeriaWygranych, seriaWygranych)
    } else if (r < 0) {
      straty += -r
      seriaStrat++
      seriaWygranych = 0
      maksSeriaStrat = Math.max(maksSeriaStrat, seriaStrat)
    }

    if (s.cele[0]?.osiagniety) trafienia.tp1++
    if (s.cele[1]?.osiagniety) trafienia.tp2++
    if (s.cele[2]?.osiagniety) trafienia.tp3++

    // Krzywa kapitału przy stałym ryzyku procentowym na sygnał.
    kapital *= 1 + (r * ryzykoProc) / 100
    szczyt = Math.max(szczyt, kapital)
    obsuniecie = Math.max(obsuniecie, ((szczyt - kapital) / szczyt) * 100)
    krzywa.push({ czas: s.zamkniety ?? s.utworzony, wartosc: kapital })
  }

  const wygrane = zamkniete.filter((s) => (s.wynikR ?? 0) > 0).length
  const przegrane = zamkniete.filter((s) => (s.wynikR ?? 0) < 0).length

  return {
    liczba: zamkniete.length,
    wygrane,
    przegrane,
    skutecznosc: (wygrane / zamkniete.length) * 100,
    sredniR: sumaR / zamkniete.length,
    sumaR,
    profitFactor: straty > 0 ? zyski / straty : zyski > 0 ? Infinity : 0,
    najdluzszaSeriaStrat: maksSeriaStrat,
    najdluzszaSeriaWygranych: maksSeriaWygranych,
    najwiekszeObsuniecie: obsuniecie,
    krzywaKapitalu: krzywa,
    trafienia,
  }
}

export interface RozbicieStatystyk {
  etykieta: string
  statystyki: Statystyki
}

export function rozbijWgHoryzontu(sygnaly: readonly Sygnal[]): RozbicieStatystyk[] {
  const horyzonty: Horyzont[] = ['krotki', 'dlugi']
  return horyzonty.map((h) => ({
    etykieta: h === 'krotki' ? 'Krótki termin' : 'Długi termin',
    statystyki: policzStatystyki(sygnaly.filter((s) => s.horyzont === h)),
  }))
}

export function rozbijWgKierunku(sygnaly: readonly Sygnal[]): RozbicieStatystyk[] {
  return [
    { etykieta: 'LONG', statystyki: policzStatystyki(sygnaly.filter((s) => s.kierunek === 'long')) },
    { etykieta: 'SHORT', statystyki: policzStatystyki(sygnaly.filter((s) => s.kierunek === 'short')) },
  ]
}

export function rozbijWgPewnosci(sygnaly: readonly Sygnal[]): RozbicieStatystyk[] {
  const przedzialy: [number, number, string][] = [
    [0, 50, 'do 50%'],
    [50, 65, '50–65%'],
    [65, 80, '65–80%'],
    [80, 101, 'powyżej 80%'],
  ]
  return przedzialy.map(([od, doo, etykieta]) => ({
    etykieta,
    statystyki: policzStatystyki(sygnaly.filter((s) => s.pewnosc >= od && s.pewnosc < doo)),
  }))
}

export function rozbijWgRezimu(sygnaly: readonly Sygnal[]): RozbicieStatystyk[] {
  return [
    { etykieta: 'Trend', statystyki: policzStatystyki(sygnaly.filter((s) => s.rezim === 'trend')) },
    { etykieta: 'Konsolidacja', statystyki: policzStatystyki(sygnaly.filter((s) => s.rezim === 'zakres')) },
    { etykieta: 'Przejściowy', statystyki: policzStatystyki(sygnaly.filter((s) => s.rezim === 'przejsciowy')) },
  ]
}
