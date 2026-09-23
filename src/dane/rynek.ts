/**
 * Dane rynkowe poza samą ceną: kontrakty terminowe, nastroje i sieć Bitcoina.
 * Wszystko z publicznych, darmowych API bez klucza.
 */

import { pobierzJson, NATYWNIE, TRYB_DEV } from '@/lib/http'
import { BAZA_BINANCE_FUT } from './gieldy'

function baza(bezposredni: string, proxy: string): string {
  return NATYWNIE || !TRYB_DEV ? bezposredni : proxy
}

// ------------------------------------------------------------------ funding

export interface DaneFundingu {
  /** Ostatni funding w procentach (0,01 = 0,01%). */
  ostatni: number
  /** Średnia z ostatnich 24h w procentach. */
  srednia24h: number
  /** Znacznik czasu najbliższego rozliczenia. */
  nastepny: number | null
  historia: { czas: number; wartosc: number }[]
}

export async function pobierzFunding(): Promise<DaneFundingu> {
  const [historia, premia] = await Promise.all([
    pobierzJson<{ fundingRate: string; fundingTime: number }[]>(
      `${BAZA_BINANCE_FUT()}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=100`,
    ),
    pobierzJson<{ lastFundingRate: string; nextFundingTime: number }>(
      `${BAZA_BINANCE_FUT()}/fapi/v1/premiumIndex?symbol=BTCUSDT`,
    ).catch(() => null),
  ])

  const lista = historia
    .map((h) => ({ czas: h.fundingTime, wartosc: Number(h.fundingRate) * 100 }))
    .filter((h) => Number.isFinite(h.wartosc))
    .sort((a, b) => a.czas - b.czas)

  const ostatnie3 = lista.slice(-3) // funding rozlicza się co 8h → 3 na dobę
  const srednia24h = ostatnie3.length
    ? ostatnie3.reduce((a, x) => a + x.wartosc, 0) / ostatnie3.length
    : 0

  const zPremii = premia ? Number(premia.lastFundingRate) * 100 : Number.NaN
  return {
    ostatni: Number.isFinite(zPremii) ? zPremii : (lista[lista.length - 1]?.wartosc ?? 0),
    srednia24h,
    nastepny: premia?.nextFundingTime ?? null,
    historia: lista,
  }
}

// ------------------------------------------------------------------ open interest

export interface DaneOi {
  biezace: number
  zmiana24hProc: number
  historia: { czas: number; wartosc: number }[]
}

export async function pobierzOpenInterest(): Promise<DaneOi> {
  const dane = await pobierzJson<{ sumOpenInterestValue: string; timestamp: number }[]>(
    `${BAZA_BINANCE_FUT()}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=200`,
  )
  const historia = dane
    .map((d) => ({ czas: d.timestamp, wartosc: Number(d.sumOpenInterestValue) }))
    .filter((d) => Number.isFinite(d.wartosc))
    .sort((a, b) => a.czas - b.czas)

  const biezace = historia[historia.length - 1]?.wartosc ?? 0
  const sprzed24h = historia[Math.max(0, historia.length - 25)]?.wartosc ?? biezace
  return {
    biezace,
    zmiana24hProc: sprzed24h > 0 ? ((biezace - sprzed24h) / sprzed24h) * 100 : 0,
    historia,
  }
}

// ------------------------------------------------------------------ pozycjonowanie

export interface DaneLongShort {
  ratio: number
  procentLong: number
  procentShort: number
  historia: { czas: number; wartosc: number }[]
}

export async function pobierzLongShort(): Promise<DaneLongShort> {
  const dane = await pobierzJson<
    { longShortRatio: string; longAccount: string; shortAccount: string; timestamp: number }[]
  >(`${BAZA_BINANCE_FUT()}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=100`)

  const historia = dane
    .map((d) => ({ czas: d.timestamp, wartosc: Number(d.longShortRatio) }))
    .filter((d) => Number.isFinite(d.wartosc))
    .sort((a, b) => a.czas - b.czas)

  const ostatni = dane[dane.length - 1]
  return {
    ratio: historia[historia.length - 1]?.wartosc ?? 1,
    procentLong: ostatni ? Number(ostatni.longAccount) * 100 : 50,
    procentShort: ostatni ? Number(ostatni.shortAccount) * 100 : 50,
    historia,
  }
}

export interface DaneTaker {
  ratio: number
  historia: { czas: number; wartosc: number }[]
}

export async function pobierzTakerRatio(): Promise<DaneTaker> {
  const dane = await pobierzJson<{ buySellRatio: string; timestamp: number }[]>(
    `${BAZA_BINANCE_FUT()}/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=100`,
  )
  const historia = dane
    .map((d) => ({ czas: d.timestamp, wartosc: Number(d.buySellRatio) }))
    .filter((d) => Number.isFinite(d.wartosc))
    .sort((a, b) => a.czas - b.czas)
  return { ratio: historia[historia.length - 1]?.wartosc ?? 1, historia }
}

// ------------------------------------------------------------------ nastroje

export interface StrachChciwosc {
  wartosc: number
  opis: string
  historia: { czas: number; wartosc: number }[]
}

const OPISY_FNG: Record<string, string> = {
  'Extreme Fear': 'Skrajny strach',
  Fear: 'Strach',
  Neutral: 'Neutralnie',
  Greed: 'Chciwość',
  'Extreme Greed': 'Skrajna chciwość',
}

export async function pobierzStrachChciwosc(): Promise<StrachChciwosc> {
  const d = await pobierzJson<{
    data: { value: string; value_classification: string; timestamp: string }[]
  }>(`${baza('https://api.alternative.me', '/proxy/fng')}/fng/?limit=30`)

  const historia = d.data
    .map((x) => ({ czas: Number(x.timestamp) * 1000, wartosc: Number(x.value) }))
    .filter((x) => Number.isFinite(x.wartosc))
    .sort((a, b) => a.czas - b.czas)

  const ostatni = d.data[0]
  return {
    wartosc: Number(ostatni?.value ?? 50),
    opis: OPISY_FNG[ostatni?.value_classification ?? ''] ?? 'Brak danych',
    historia,
  }
}

// ------------------------------------------------------------------ rynek globalny

export interface RynekGlobalny {
  dominacjaBtc: number
  kapitalizacjaUsd: number
  wolumen24hUsd: number
  zmianaKapitalizacji24h: number
}

export async function pobierzRynekGlobalny(): Promise<RynekGlobalny> {
  const d = await pobierzJson<{
    data: {
      market_cap_percentage: Record<string, number>
      total_market_cap: Record<string, number>
      total_volume: Record<string, number>
      market_cap_change_percentage_24h_usd: number
    }
  }>(`${baza('https://api.coingecko.com', '/proxy/coingecko')}/api/v3/global`)

  return {
    dominacjaBtc: d.data.market_cap_percentage?.btc ?? 0,
    kapitalizacjaUsd: d.data.total_market_cap?.usd ?? 0,
    wolumen24hUsd: d.data.total_volume?.usd ?? 0,
    zmianaKapitalizacji24h: d.data.market_cap_change_percentage_24h_usd ?? 0,
  }
}

// ------------------------------------------------------------------ sieć Bitcoina

export interface DaneOnChain {
  wysokoscBloku: number
  oplataSzybka: number
  oplataGodzina: number
  hashrate: number
  trudnosc: number
}

export async function pobierzOnChain(): Promise<DaneOnChain> {
  const b = baza('https://mempool.space', '/proxy/mempool')
  const [oplaty, wysokosc, hash] = await Promise.all([
    pobierzJson<{ fastestFee: number; hourFee: number }>(`${b}/api/v1/fees/recommended`),
    pobierzJson<number>(`${b}/api/blocks/tip/height`).catch(() => 0),
    pobierzJson<{ currentHashrate: number; currentDifficulty: number }>(
      `${b}/api/v1/mining/hashrate/3d`,
    ).catch(() => ({ currentHashrate: 0, currentDifficulty: 0 })),
  ])

  return {
    wysokoscBloku: Number(wysokosc) || 0,
    oplataSzybka: oplaty.fastestFee,
    oplataGodzina: oplaty.hourFee,
    hashrate: hash.currentHashrate,
    trudnosc: hash.currentDifficulty,
  }
}

// ------------------------------------------------------------------ zbiorczo

export interface MigawkaRynku {
  funding: DaneFundingu | null
  oi: DaneOi | null
  longShort: DaneLongShort | null
  taker: DaneTaker | null
  strachChciwosc: StrachChciwosc | null
  globalny: RynekGlobalny | null
  onChain: DaneOnChain | null
  pobrano: number
  bledy: string[]
}

/**
 * Pobiera wszystko naraz. Pojedyncza awaria nie wywraca reszty –
 * brakujące sekcje zostają nullem i aplikacja pokaże „brak danych”.
 */
export async function pobierzMigawkeRynku(): Promise<MigawkaRynku> {
  const bledy: string[] = []
  const bezpiecznie = async <T>(nazwa: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn()
    } catch (e) {
      bledy.push(`${nazwa}: ${e instanceof Error ? e.message : 'błąd'}`)
      return null
    }
  }

  const [funding, oi, longShort, taker, strachChciwosc, globalny, onChain] = await Promise.all([
    bezpiecznie('Funding', pobierzFunding),
    bezpiecznie('Open Interest', pobierzOpenInterest),
    bezpiecznie('Long/Short', pobierzLongShort),
    bezpiecznie('Taker ratio', pobierzTakerRatio),
    bezpiecznie('Strach i chciwość', pobierzStrachChciwosc),
    bezpiecznie('Rynek globalny', pobierzRynekGlobalny),
    bezpiecznie('On-chain', pobierzOnChain),
  ])

  return { funding, oi, longShort, taker, strachChciwosc, globalny, onChain, pobrano: Date.now(), bledy }
}
