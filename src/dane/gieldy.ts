/**
 * Adaptery giełd. Binance jest źródłem głównym, reszta wchodzi automatycznie,
 * gdy Binance nie odpowiada (awaria, blokada regionalna, limit zapytań).
 *
 * Wszystkie adaptery zwracają ten sam kształt świecy: czas otwarcia w ms + OHLCV.
 */

import { pobierzJson, NATYWNIE, TRYB_DEV } from '@/lib/http'
import type { Interwal } from '@/analiza/profile'
import type { Swieca } from '@/analiza/wskazniki'

export interface Ticker {
  cena: number
  zmiana24hProc: number
  zmiana24hUsd: number
  max24h: number
  min24h: number
  wolumen24h: number
  czas: number
}

export interface Gielda {
  id: string
  nazwa: string
  swiece(interwal: Interwal, limit: number): Promise<Swieca[]>
  ticker(): Promise<Ticker>
}

/**
 * W przeglądarce w trybie dev korzystamy z proxy Vite (stabilniejsze przy
 * lokalnym blokowaniu), natywnie i w zbudowanej PWA – wprost (te API dają CORS).
 */
function bazowy(bezposredni: string, sciezkaProxy: string): string {
  if (NATYWNIE || !TRYB_DEV) return bezposredni
  return sciezkaProxy
}

export const BAZA_BINANCE = () => bazowy('https://api.binance.com', '/proxy/binance')
export const BAZA_BINANCE_FUT = () => bazowy('https://fapi.binance.com', '/proxy/binance-fut')

// ------------------------------------------------------------------ Binance

type SurowaSwiecaBinance = [number, string, string, string, string, string, ...unknown[]]

const binance: Gielda = {
  id: 'binance',
  nazwa: 'Binance',
  async swiece(interwal, limit) {
    const dane = await pobierzJson<SurowaSwiecaBinance[]>(
      `${BAZA_BINANCE()}/api/v3/klines?symbol=BTCUSDT&interval=${interwal}&limit=${Math.min(limit, 1000)}`,
    )
    return dane.map((s) => ({
      czas: s[0],
      o: Number(s[1]),
      h: Number(s[2]),
      l: Number(s[3]),
      c: Number(s[4]),
      v: Number(s[5]),
    }))
  },
  async ticker() {
    const d = await pobierzJson<Record<string, string>>(
      `${BAZA_BINANCE()}/api/v3/ticker/24hr?symbol=BTCUSDT`,
    )
    return {
      cena: Number(d.lastPrice),
      zmiana24hProc: Number(d.priceChangePercent),
      zmiana24hUsd: Number(d.priceChange),
      max24h: Number(d.highPrice),
      min24h: Number(d.lowPrice),
      wolumen24h: Number(d.quoteVolume),
      czas: Number(d.closeTime) || Date.now(),
    }
  },
}

// ------------------------------------------------------------------ Bybit

const INTERWAL_BYBIT: Partial<Record<Interwal, string>> = {
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
}

const bybit: Gielda = {
  id: 'bybit',
  nazwa: 'Bybit',
  async swiece(interwal, limit) {
    const i = INTERWAL_BYBIT[interwal]
    if (!i) return agregujZDziennych(await bybit.swiece('1d', 1000), interwal)
    const baza = bazowy('https://api.bybit.com', '/proxy/bybit')
    const d = await pobierzJson<{ result?: { list?: string[][] } }>(
      `${baza}/v5/market/kline?category=spot&symbol=BTCUSDT&interval=${i}&limit=${Math.min(limit, 1000)}`,
    )
    const lista = d.result?.list ?? []
    return lista
      .map((s) => ({
        czas: Number(s[0]),
        o: Number(s[1]),
        h: Number(s[2]),
        l: Number(s[3]),
        c: Number(s[4]),
        v: Number(s[5]),
      }))
      .sort((a, b) => a.czas - b.czas)
  },
  async ticker() {
    const baza = bazowy('https://api.bybit.com', '/proxy/bybit')
    const d = await pobierzJson<{ result?: { list?: Record<string, string>[] } }>(
      `${baza}/v5/market/tickers?category=spot&symbol=BTCUSDT`,
    )
    const t = d.result?.list?.[0]
    if (!t) throw new Error('Bybit nie zwrócił tickera')
    const cena = Number(t.lastPrice)
    const proc = Number(t.price24hPcnt) * 100
    return {
      cena,
      zmiana24hProc: proc,
      zmiana24hUsd: cena - Number(t.prevPrice24h),
      max24h: Number(t.highPrice24h),
      min24h: Number(t.lowPrice24h),
      wolumen24h: Number(t.turnover24h),
      czas: Date.now(),
    }
  },
}

// ------------------------------------------------------------------ OKX

const INTERWAL_OKX: Partial<Record<Interwal, string>> = {
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '3d': '3D',
  '1w': '1W',
}

const okx: Gielda = {
  id: 'okx',
  nazwa: 'OKX',
  async swiece(interwal, limit) {
    const i = INTERWAL_OKX[interwal]
    if (!i) return agregujZDziennych(await okx.swiece('1d', 300), interwal)
    const baza = bazowy('https://www.okx.com', '/proxy/okx')
    const d = await pobierzJson<{ data?: string[][] }>(
      `${baza}/api/v5/market/candles?instId=BTC-USDT&bar=${i}&limit=${Math.min(limit, 300)}`,
    )
    return (d.data ?? [])
      .map((s) => ({
        czas: Number(s[0]),
        o: Number(s[1]),
        h: Number(s[2]),
        l: Number(s[3]),
        c: Number(s[4]),
        v: Number(s[5]),
      }))
      .sort((a, b) => a.czas - b.czas)
  },
  async ticker() {
    const baza = bazowy('https://www.okx.com', '/proxy/okx')
    const d = await pobierzJson<{ data?: Record<string, string>[] }>(
      `${baza}/api/v5/market/ticker?instId=BTC-USDT`,
    )
    const t = d.data?.[0]
    if (!t) throw new Error('OKX nie zwrócił tickera')
    const cena = Number(t.last)
    const otwarcie = Number(t.open24h)
    return {
      cena,
      zmiana24hProc: otwarcie ? ((cena - otwarcie) / otwarcie) * 100 : 0,
      zmiana24hUsd: cena - otwarcie,
      max24h: Number(t.high24h),
      min24h: Number(t.low24h),
      wolumen24h: Number(t.volCcy24h),
      czas: Number(t.ts) || Date.now(),
    }
  },
}

// ------------------------------------------------------------------ Kraken

const INTERWAL_KRAKEN: Partial<Record<Interwal, number>> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
  '1w': 10080,
}

const kraken: Gielda = {
  id: 'kraken',
  nazwa: 'Kraken',
  async swiece(interwal, limit) {
    const i = INTERWAL_KRAKEN[interwal]
    if (!i) return agregujZDziennych(await kraken.swiece('1d', 720), interwal)
    const baza = bazowy('https://api.kraken.com', '/proxy/kraken')
    const d = await pobierzJson<{ result?: Record<string, unknown> }>(
      `${baza}/0/public/OHLC?pair=XBTUSDT&interval=${i}`,
    )
    const klucz = Object.keys(d.result ?? {}).find((k) => k !== 'last')
    const lista = (klucz ? (d.result as Record<string, unknown>)[klucz] : []) as unknown[][]
    return lista
      .map((s) => ({
        czas: Number(s[0]) * 1000,
        o: Number(s[1]),
        h: Number(s[2]),
        l: Number(s[3]),
        c: Number(s[4]),
        v: Number(s[6]),
      }))
      .sort((a, b) => a.czas - b.czas)
      .slice(-limit)
  },
  async ticker() {
    const baza = bazowy('https://api.kraken.com', '/proxy/kraken')
    const d = await pobierzJson<{ result?: Record<string, Record<string, string[]>> }>(
      `${baza}/0/public/Ticker?pair=XBTUSDT`,
    )
    const klucz = Object.keys(d.result ?? {})[0]
    const t = klucz ? d.result?.[klucz] : undefined
    if (!t) throw new Error('Kraken nie zwrócił tickera')
    const cena = Number(t.c?.[0])
    const otwarcie = Number(t.o as unknown as string)
    return {
      cena,
      zmiana24hProc: otwarcie ? ((cena - otwarcie) / otwarcie) * 100 : 0,
      zmiana24hUsd: cena - otwarcie,
      max24h: Number(t.h?.[1]),
      min24h: Number(t.l?.[1]),
      wolumen24h: Number(t.v?.[1]) * cena,
      czas: Date.now(),
    }
  },
}

// ------------------------------------------------------------------ Coinbase

const GRANULACJA_COINBASE: Partial<Record<Interwal, number>> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 21600, // Coinbase nie ma 4h – 6h jest najbliższe
  '1d': 86400,
}

const coinbase: Gielda = {
  id: 'coinbase',
  nazwa: 'Coinbase',
  async swiece(interwal, limit) {
    const g = GRANULACJA_COINBASE[interwal]
    if (!g) return agregujZDziennych(await coinbase.swiece('1d', 300), interwal)
    const baza = bazowy('https://api.exchange.coinbase.com', '/proxy/coinbase')
    const d = await pobierzJson<number[][]>(`${baza}/products/BTC-USD/candles?granularity=${g}`)
    return d
      .map((s) => ({
        czas: s[0] * 1000,
        o: s[3],
        h: s[2],
        l: s[1],
        c: s[4],
        v: s[5],
      }))
      .sort((a, b) => a.czas - b.czas)
      .slice(-limit)
  },
  async ticker() {
    const baza = bazowy('https://api.exchange.coinbase.com', '/proxy/coinbase')
    const [t, s] = await Promise.all([
      pobierzJson<Record<string, string>>(`${baza}/products/BTC-USD/ticker`),
      pobierzJson<Record<string, string>>(`${baza}/products/BTC-USD/stats`),
    ])
    const cena = Number(t.price)
    const otwarcie = Number(s.open)
    return {
      cena,
      zmiana24hProc: otwarcie ? ((cena - otwarcie) / otwarcie) * 100 : 0,
      zmiana24hUsd: cena - otwarcie,
      max24h: Number(s.high),
      min24h: Number(s.low),
      wolumen24h: Number(s.volume) * cena,
      czas: Date.now(),
    }
  },
}

// ------------------------------------------------------------------ agregacja

/**
 * Składa świece 3-dniowe i tygodniowe z dziennych, gdy giełda ich nie wystawia.
 * 3D kotwiczone jest do epoki (tak jak robi to Binance), 1W do poniedziałku UTC.
 */
export function agregujZDziennych(dzienne: Swieca[], docelowy: Interwal): Swieca[] {
  if (dzienne.length === 0) return []
  const dzien = 86_400_000

  const kluczGrupy = (czas: number): number => {
    if (docelowy === '3d') return Math.floor(czas / (3 * dzien)) * 3 * dzien
    if (docelowy === '1w') {
      const d = new Date(czas)
      const dzienTygodnia = (d.getUTCDay() + 6) % 7 // poniedziałek = 0
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dzienTygodnia * dzien
    }
    return czas
  }

  const grupy = new Map<number, Swieca[]>()
  for (const s of dzienne) {
    const k = kluczGrupy(s.czas)
    const lista = grupy.get(k)
    if (lista) lista.push(s)
    else grupy.set(k, [s])
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

// ------------------------------------------------------------------ przełączanie

export const GIELDY: Gielda[] = [binance, bybit, okx, kraken, coinbase]

export interface StanZrodla {
  aktywna: string
  zapasowa: boolean
  ostatniBlad: string | null
}

let aktywnaGielda: Gielda = binance
let ostatniBlad: string | null = null

export function stanZrodla(): StanZrodla {
  return {
    aktywna: aktywnaGielda.nazwa,
    zapasowa: aktywnaGielda.id !== 'binance',
    ostatniBlad,
  }
}

/** Próbuje kolejnych giełd aż któraś odpowie. Zapamiętuje tę, która zadziałała. */
async function zPrzelaczaniem<T>(operacja: (g: Gielda) => Promise<T>): Promise<T> {
  const kolejnosc = [aktywnaGielda, ...GIELDY.filter((g) => g.id !== aktywnaGielda.id)]
  let blad: unknown = null
  for (const g of kolejnosc) {
    try {
      const wynik = await operacja(g)
      if (aktywnaGielda.id !== g.id) {
        aktywnaGielda = g
        ostatniBlad = `Przełączono na ${g.nazwa}`
      } else {
        ostatniBlad = null
      }
      return wynik
    } catch (e) {
      blad = e
      ostatniBlad = e instanceof Error ? e.message : 'Nieznany błąd'
    }
  }
  throw blad instanceof Error ? blad : new Error('Żadna giełda nie odpowiedziała')
}

export function pobierzSwiece(interwal: Interwal, limit = 500): Promise<Swieca[]> {
  return zPrzelaczaniem((g) => g.swiece(interwal, limit))
}

export function pobierzTicker(): Promise<Ticker> {
  return zPrzelaczaniem((g) => g.ticker())
}

/** Wymusza konkretną giełdę (ustawienia aplikacji). */
export function ustawGielde(id: string): void {
  const g = GIELDY.find((x) => x.id === id)
  if (g) aktywnaGielda = g
}
