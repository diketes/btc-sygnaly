/** Narzędzia wspólne dla skryptów uruchamianych z linii poleceń. */

import type { Interwal } from '../src/analiza/profile'
import type { Swieca } from '../src/analiza/wskazniki'

export const kolor = {
  zielony: (s: string) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s: string) => `\x1b[31m${s}\x1b[0m`,
  zolty: (s: string) => `\x1b[33m${s}\x1b[0m`,
  niebieski: (s: string) => `\x1b[36m${s}\x1b[0m`,
  szary: (s: string) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s: string) => `\x1b[1m${s}\x1b[0m`,
}

export const MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
}

function poczekaj(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Pobiera dowolnie długą historię świec, stronicując po 1000 sztuk. */
export async function pobierzHistorie(
  interwal: Interwal,
  od: number,
  doCzasu = Date.now(),
): Promise<Swieca[]> {
  const out: Swieca[] = []
  let kursor = od
  const krok = MS[interwal]
  let zapytania = 0

  while (kursor < doCzasu) {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interwal}` +
      `&startTime=${kursor}&limit=1000`
    const odp = await fetch(url)
    if (!odp.ok) {
      if (odp.status === 429 || odp.status === 418) {
        await poczekaj(5000)
        continue
      }
      throw new Error(`Binance odpowiedział kodem ${odp.status}`)
    }
    const dane = (await odp.json()) as unknown[][]
    if (dane.length === 0) break

    for (const s of dane) {
      out.push({
        czas: Number(s[0]),
        o: Number(s[1]),
        h: Number(s[2]),
        l: Number(s[3]),
        c: Number(s[4]),
        v: Number(s[5]),
      })
    }

    const ostatni = Number(dane[dane.length - 1][0])
    if (ostatni <= kursor) break
    kursor = ostatni + krok
    zapytania++
    if (zapytania % 10 === 0) {
      process.stdout.write(
        `\r  ${kolor.szary(`pobrano ${out.length} świec ${interwal}…`)}          `,
      )
    }
    await poczekaj(120) // szacunek dla limitów API
  }

  process.stdout.write(`\r${' '.repeat(60)}\r`)
  // Ostatnia świeca bywa jeszcze niezamknięta – odcinamy ją.
  return out.filter((s) => s.czas + krok <= doCzasu)
}

/** Składa świece niższego interwału w wyższy. */
export function agreguj(zrodlo: readonly Swieca[], docelowy: Interwal): Swieca[] {
  const rozmiar = MS[docelowy]
  const grupy = new Map<number, Swieca[]>()

  for (const s of zrodlo) {
    // Tydzień kotwiczymy do poniedziałku UTC, resztę do wielokrotności epoki
    // – tak samo jak robi to Binance.
    let klucz: number
    if (docelowy === '1w') {
      const d = new Date(s.czas)
      const dzienTygodnia = (d.getUTCDay() + 6) % 7
      klucz =
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dzienTygodnia * MS['1d']
    } else {
      klucz = Math.floor(s.czas / rozmiar) * rozmiar
    }
    const lista = grupy.get(klucz)
    if (lista) lista.push(s)
    else grupy.set(klucz, [s])
  }

  return [...grupy.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([czas, lista]) => ({
      czas,
      o: lista[0].o,
      h: Math.max(...lista.map((x) => x.h)),
      l: Math.min(...lista.map((x) => x.l)),
      c: lista[lista.length - 1].c,
      v: lista.reduce((a, x) => a + x.v, 0),
    }))
}

/**
 * Świece już ZAMKNIĘTE w chwili `czas` – tylko takie trader naprawdę widzi.
 *
 * Krytyczne dla uczciwości backtestu: świeca otwarta dokładnie o `czas` dopiero
 * się tworzy, a jej maksimum i minimum należą do przyszłości. Wpuszczenie jej
 * do silnika to podglądanie przyszłości i sztucznie zawyżone wyniki.
 */
export function doCzasu(
  seria: readonly Swieca[],
  czas: number,
  ile: number,
  msInterwalu: number,
): Swieca[] {
  // Binarne szukanie pierwszej świecy, która NIE zamknęła się jeszcze do `czas`.
  let lo = 0
  let hi = seria.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (seria[mid].czas + msInterwalu <= czas) lo = mid + 1
    else hi = mid
  }
  return seria.slice(Math.max(0, lo - ile), lo)
}

export function formatujUsd(x: number): string {
  return x.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
}

export function formatujData(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}
