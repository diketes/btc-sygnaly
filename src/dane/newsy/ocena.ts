/**
 * Ocena newsa: kategoria, wydźwięk i siła oddziaływania na kurs BTC.
 *
 * Wszystko na regułach i słownikach – bez zewnętrznego modelu językowego, więc
 * działa offline i nie wymaga klucza API. Jeżeli użytkownik poda klucz, moduł
 * `streszczenieLlm` może nadpisać streszczenie (patrz `ustawStreszczacz`).
 */

import { bezDiakrytykow, type Klaster } from './dedup'
import { zrodloPoId, ZRODLA } from './zrodla'

export type Kategoria =
  | 'regulacje'
  | 'etf'
  | 'makro'
  | 'onchain'
  | 'bezpieczenstwo'
  | 'adopcja'
  | 'technologia'
  | 'gornicy'
  | 'opinia'

export const NAZWY_KATEGORII: Record<Kategoria, string> = {
  regulacje: 'Regulacje',
  etf: 'ETF i instytucje',
  makro: 'Makroekonomia',
  onchain: 'On-chain i wieloryby',
  bezpieczenstwo: 'Hack i bezpieczeństwo',
  adopcja: 'Adopcja',
  technologia: 'Technologia',
  gornicy: 'Górnicy',
  opinia: 'Opinia',
}

/** Jak mocno dana kategoria potrafi ruszyć kursem (0–1). */
const WAGA_KATEGORII: Record<Kategoria, number> = {
  makro: 1,
  etf: 0.95,
  regulacje: 0.9,
  bezpieczenstwo: 0.85,
  onchain: 0.7,
  adopcja: 0.65,
  gornicy: 0.5,
  technologia: 0.45,
  opinia: 0.25,
}

const SLOWA_KATEGORII: Record<Kategoria, string[]> = {
  regulacje: [
    'sec', 'regulac', 'regulat', 'ustaw', 'prawo', 'zakaz', 'ban ', 'lawsuit', 'pozew', 'sad',
    'court', 'cftc', 'mica', 'podatek', 'tax', 'compliance', 'licencj', 'license', 'kongres',
    'congress', 'senat', 'parlament', 'sledztwo', 'investigation', 'grzywn', 'fine', 'settlement',
  ],
  etf: [
    'etf', 'blackrock', 'fidelity', 'grayscale', 'ark invest', 'vanguard', 'instytucj',
    'institutional', 'microstrategy', 'strategy inc', 'napływ', 'naplyw', 'inflow', 'outflow',
    'odpływ', 'odplyw', 'fundusz', 'fund', 'custody', 'saylor', 'skarbiec', 'treasury',
  ],
  makro: [
    'fed', 'federal reserve', 'fomc', 'powell', 'cpi', 'inflacj', 'inflation', 'stopy procentowe',
    'interest rate', 'rate cut', 'rate hike', 'recesj', 'recession', 'pkb', 'gdp', 'nfp',
    'bezroboc', 'unemployment', 'ecb', 'ebc', 'dolar', 'dxy', 'obligacj', 'bond', 'yield',
    'bank centralny', 'central bank', 'qe', 'quantitative',
  ],
  onchain: [
    'wieloryb', 'whale', 'on-chain', 'onchain', 'portfel', 'wallet', 'transfer', 'mempool',
    'adres', 'address', 'satoshi', 'dormant', 'uspiony', 'uspione', 'exchange reserve',
    'rezerwy gield', 'rezerwy giel', 'supply', 'podaz', 'hodler', 'akumulac',
  ],
  bezpieczenstwo: [
    'hack', 'wlam', 'włam', 'exploit', 'kradziez', 'kradzież', 'stolen', 'breach', 'oszustw',
    'scam', 'phishing', 'rug pull', 'luka', 'vulnerability', 'atak', 'attack', 'upadlosc',
    'bankruct', 'bankrupt', 'insolwen', 'niewypla',
  ],
  adopcja: [
    'adopcj', 'adoption', 'platnosc', 'płatnosc', 'payment', 'akceptuj', 'accepts', 'partnerstw',
    'partnership', 'integrac', 'integration', 'legal tender', 'prawny srodek', 'kraj', 'country',
    'rezerwa strategiczna', 'strategic reserve', 'bank', 'paypal', 'visa', 'mastercard',
  ],
  technologia: [
    'lightning', 'taproot', 'ordinal', 'runes', 'aktualizac', 'upgrade', 'protokol', 'protocol',
    'layer 2', 'l2', 'sidechain', 'bip', 'soft fork', 'hard fork', 'kod', 'developer', 'rozwoj',
  ],
  gornicy: [
    'gornic', 'górnic', 'miner', 'mining', 'hashrate', 'trudnosc', 'trudność', 'difficulty',
    'halving', 'polowienie', 'koparki', 'rig', 'asic', 'energia', 'energy',
  ],
  opinia: [
    'zdaniem', 'according to', 'przewiduj', 'predict', 'prognoz', 'forecast', 'analityk',
    'analyst', 'opinia', 'opinion', 'moze osiagnac', 'could reach', 'target price', 'cel cenowy',
    'expert', 'ekspert',
  ],
}

/** Frazy pozytywne i negatywne wraz z siłą (1–3). */
const SLOWNIK_WYDZWIEKU: { fraza: string; waga: number }[] = [
  // pozytywne
  { fraza: 'zatwierdz', waga: 3 }, { fraza: 'approv', waga: 3 },
  { fraza: 'rekord', waga: 3 }, { fraza: 'record high', waga: 3 },
  { fraza: 'all-time high', waga: 3 }, { fraza: 'ath', waga: 2 },
  { fraza: 'rajd', waga: 3 }, { fraza: 'rally', waga: 3 },
  { fraza: 'wzrost', waga: 2 }, { fraza: 'rosnie', waga: 2 }, { fraza: 'rise', waga: 2 },
  { fraza: 'surge', waga: 3 }, { fraza: 'soar', waga: 3 }, { fraza: 'skok', waga: 2 },
  { fraza: 'napływ', waga: 2 }, { fraza: 'naplyw', waga: 2 }, { fraza: 'inflow', waga: 2 },
  { fraza: 'akumulac', waga: 2 }, { fraza: 'accumulat', waga: 2 },
  { fraza: 'kupuj', waga: 2 }, { fraza: 'buys', waga: 2 }, { fraza: 'bought', waga: 2 },
  { fraza: 'byczy', waga: 2 }, { fraza: 'bullish', waga: 2 },
  { fraza: 'adopcj', waga: 2 }, { fraza: 'adoption', waga: 2 },
  { fraza: 'partnerstw', waga: 1 }, { fraza: 'partnership', waga: 1 },
  { fraza: 'legalizuj', waga: 2 }, { fraza: 'legaliz', waga: 2 },
  { fraza: 'obniz stop', waga: 3 }, { fraza: 'rate cut', waga: 3 }, { fraza: 'cuts rates', waga: 3 },
  { fraza: 'wybicie', waga: 2 }, { fraza: 'breakout', waga: 2 },
  { fraza: 'odbicie', waga: 2 }, { fraza: 'rebound', waga: 2 },
  { fraza: 'rezerwa strategiczna', waga: 3 }, { fraza: 'strategic reserve', waga: 3 },

  // negatywne
  { fraza: 'zakaz', waga: -3 }, { fraza: 'ban', waga: -3 },
  { fraza: 'odrzuc', waga: -3 }, { fraza: 'reject', waga: -3 },
  { fraza: 'pozew', waga: -2 }, { fraza: 'lawsuit', waga: -2 }, { fraza: 'sues', waga: -2 },
  { fraza: 'hack', waga: -3 }, { fraza: 'wlam', waga: -3 }, { fraza: 'exploit', waga: -3 },
  { fraza: 'kradziez', waga: -3 }, { fraza: 'stolen', waga: -3 }, { fraza: 'theft', waga: -3 },
  { fraza: 'spadek', waga: -2 }, { fraza: 'spada', waga: -2 }, { fraza: 'fall', waga: -2 },
  { fraza: 'krach', waga: -3 }, { fraza: 'crash', waga: -3 }, { fraza: 'plunge', waga: -3 },
  { fraza: 'wyprzedaz', waga: -2 }, { fraza: 'selloff', waga: -2 }, { fraza: 'sell-off', waga: -2 },
  { fraza: 'odpływ', waga: -2 }, { fraza: 'odplyw', waga: -2 }, { fraza: 'outflow', waga: -2 },
  { fraza: 'likwidacj', waga: -2 }, { fraza: 'liquidat', waga: -2 },
  { fraza: 'niedzwiedzi', waga: -2 }, { fraza: 'bearish', waga: -2 },
  { fraza: 'upadlosc', waga: -3 }, { fraza: 'bankrupt', waga: -3 },
  { fraza: 'grzywn', waga: -2 }, { fraza: 'fine', waga: -1 }, { fraza: 'penalty', waga: -2 },
  { fraza: 'sledztw', waga: -2 }, { fraza: 'investigat', waga: -2 },
  { fraza: 'podwyzk stop', waga: -3 }, { fraza: 'rate hike', waga: -3 },
  { fraza: 'inflacja rosnie', waga: -2 }, { fraza: 'inflation rises', waga: -2 },
  { fraza: 'recesj', waga: -2 }, { fraza: 'recession', waga: -2 },
  { fraza: 'sprzedaj', waga: -2 }, { fraza: 'sells', waga: -2 }, { fraza: 'dumps', waga: -2 },
  { fraza: 'ostrzeg', waga: -1 }, { fraza: 'warns', waga: -1 },
  { fraza: 'opoznien', waga: -2 }, { fraza: 'delay', waga: -2 },
]

/** Słowa, które odwracają znaczenie następnej frazy. */
const NEGACJE = [
  'nie ', 'not ', 'no ', 'zaprzecz', 'denies', 'deny', 'bez ', 'without ', 'brak ',
  'wstrzym', 'halts', 'odmawia', 'refuses', 'anuluj', 'cancels',
]

/** Słowa wzmacniające. */
const WZMOCNIENIA = ['bardzo', 'mocno', 'gwaltown', 'ostro', 'rekordow', 'sharply', 'massively', 'historyczn']

export interface OcenaNewsa {
  kategoria: Kategoria
  nazwaKategorii: string
  /** -5 … +5 */
  wydzwiek: number
  /** 1 … 10 */
  wplyw: number
  etykieta: string
  streszczenie: string
  wykryteFrazy: string[]
}

function przygotuj(tekst: string): string {
  return bezDiakrytykow(tekst).toLowerCase()
}

export function wykryjKategorie(tekst: string): Kategoria {
  const t = przygotuj(tekst)
  let najlepsza: Kategoria = 'opinia'
  let najlepszyWynik = 0

  for (const [kategoria, slowa] of Object.entries(SLOWA_KATEGORII) as [Kategoria, string[]][]) {
    let wynik = 0
    for (const s of slowa) if (t.includes(bezDiakrytykow(s).toLowerCase())) wynik++
    // Kategorie o dużej sile wymagają wyraźniejszego trafienia, żeby nie zagarniały wszystkiego.
    const wazony = wynik * (0.7 + WAGA_KATEGORII[kategoria] * 0.3)
    if (wazony > najlepszyWynik) {
      najlepszyWynik = wazony
      najlepsza = kategoria
    }
  }
  return najlepszyWynik === 0 ? 'opinia' : najlepsza
}

export function policzWydzwiek(tekst: string): { wynik: number; frazy: string[] } {
  const t = przygotuj(tekst)
  let suma = 0
  const frazy: string[] = []

  for (const { fraza, waga } of SLOWNIK_WYDZWIEKU) {
    const szukana = bezDiakrytykow(fraza).toLowerCase()
    const pozycja = t.indexOf(szukana)
    if (pozycja === -1) continue

    // Negacja w 25 znakach przed frazą odwraca jej znak.
    const przed = t.slice(Math.max(0, pozycja - 25), pozycja)
    const zanegowana = NEGACJE.some((n) => przed.includes(bezDiakrytykow(n).toLowerCase()))
    const wzmocniona = WZMOCNIENIA.some((w) => przed.includes(w))

    const wklad = (zanegowana ? -waga : waga) * (wzmocniona ? 1.4 : 1)
    suma += wklad
    frazy.push(fraza)
  }

  // Skalujemy do -5…5 tak, by kilka mocnych fraz nie wysadzało skali.
  const wynik = Math.max(-5, Math.min(5, suma / 1.8))
  return { wynik: Math.round(wynik * 10) / 10, frazy: frazy.slice(0, 6) }
}

function wiarygodnoscKlastra(k: Klaster): number {
  let max = 0.5
  for (const z of k.zrodla) {
    const zrodlo = ZRODLA.find((x) => x.nazwa === z.nazwa) ?? zrodloPoId(z.nazwa)
    if (zrodlo && zrodlo.wiarygodnosc > max) max = zrodlo.wiarygodnosc
  }
  return max
}

function wspolczynnikSwiezosci(data: number, teraz: number): number {
  const godziny = (teraz - data) / 3_600_000
  if (godziny <= 2) return 1
  if (godziny <= 6) return 0.9
  if (godziny <= 12) return 0.75
  if (godziny <= 24) return 0.6
  if (godziny <= 48) return 0.4
  return 0.25
}

/** Znane podmioty z polskimi odpowiednikami – do budowy streszczenia. */
const PODMIOTY: { wzorzec: RegExp; nazwa: string }[] = [
  { wzorzec: /\bsec\b/i, nazwa: 'amerykański nadzór SEC' },
  { wzorzec: /\bcftc\b/i, nazwa: 'amerykański CFTC' },
  { wzorzec: /\bfed\b|federal reserve/i, nazwa: 'Rezerwa Federalna' },
  { wzorzec: /\bfomc\b/i, nazwa: 'posiedzenie FOMC' },
  { wzorzec: /\bcpi\b|inflation|inflacj/i, nazwa: 'dane o inflacji' },
  { wzorzec: /blackrock/i, nazwa: 'BlackRock' },
  { wzorzec: /fidelity/i, nazwa: 'Fidelity' },
  { wzorzec: /grayscale/i, nazwa: 'Grayscale' },
  { wzorzec: /microstrategy|\bsaylor\b/i, nazwa: 'MicroStrategy' },
  { wzorzec: /binance/i, nazwa: 'Binance' },
  { wzorzec: /coinbase/i, nazwa: 'Coinbase' },
  { wzorzec: /\betf\b/i, nazwa: 'fundusze ETF' },
  { wzorzec: /halving|polowieni/i, nazwa: 'halving' },
  { wzorzec: /whale|wieloryb/i, nazwa: 'duży posiadacz (wieloryb)' },
  { wzorzec: /el salvador/i, nazwa: 'Salwador' },
  { wzorzec: /\btrump\b/i, nazwa: 'Donald Trump' },
  { wzorzec: /\beu\b|european union|unia europejska|mica/i, nazwa: 'Unia Europejska' },
  { wzorzec: /china|chiny|chin\b/i, nazwa: 'Chiny' },
]

/** Wyciąga kwoty i liczby, które warto pokazać. */
function wykryjKwoty(tekst: string): string[] {
  const out: string[] = []
  const wzorce: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/\$\s?([\d.,]+)\s?(billion|bln|mld)/gi, (m) => `${m[1]} mld USD`],
    [/\$\s?([\d.,]+)\s?(million|mln|m)\b/gi, (m) => `${m[1]} mln USD`],
    [/([\d.,]+)\s?(bitcoin|btc)\b/gi, (m) => `${m[1]} BTC`],
    [/([\d.,]+)\s?(procent|%)/gi, (m) => `${m[1]}%`],
  ]
  for (const [wzorzec, formatuj] of wzorce) {
    for (const m of tekst.matchAll(wzorzec)) {
      const s = formatuj(m)
      if (!out.includes(s)) out.push(s)
      if (out.length >= 3) return out
    }
  }
  return out
}

/**
 * Streszczenie po polsku budowane z tego, co udało się wykryć.
 *
 * Nie udajemy tłumaczenia – gdy news jest po angielsku, opisujemy po polsku
 * jego treść (kategoria, podmioty, kwoty, wydźwięk) i zostawiamy oryginalny
 * tytuł w karcie. To uczciwsze niż maszynowy przekład bez modelu językowego.
 */
export function zbudujStreszczenie(
  klaster: Klaster,
  kategoria: Kategoria,
  wydzwiek: number,
): string {
  const pelny = `${klaster.tytul} ${klaster.opis}`
  const czesci: string[] = []

  const podmioty = PODMIOTY.filter((p) => p.wzorzec.test(pelny))
    .map((p) => p.nazwa)
    .slice(0, 3)
  const kwoty = wykryjKwoty(pelny)

  if (klaster.jezyk === 'pl' && klaster.opis) {
    // Polski news mamy wprost – bierzemy dwa pierwsze zdania.
    const zdania = klaster.opis.split(/(?<=[.!?])\s+/).filter((z) => z.length > 20)
    if (zdania.length > 0) czesci.push(zdania.slice(0, 2).join(' '))
  }

  if (czesci.length === 0) {
    const wstep = `Temat: ${NAZWY_KATEGORII[kategoria].toLowerCase()}.`
    czesci.push(wstep)
    if (podmioty.length > 0) czesci.push(`Dotyczy: ${podmioty.join(', ')}.`)
    if (kwoty.length > 0) czesci.push(`Wartości w tekście: ${kwoty.join(', ')}.`)
  }

  const kierunek =
    wydzwiek >= 2
      ? 'Wydźwięk pozytywny dla BTC.'
      : wydzwiek <= -2
        ? 'Wydźwięk negatywny dla BTC.'
        : 'Wydźwięk neutralny.'
  czesci.push(kierunek)

  if (klaster.zrodla.length > 1) {
    czesci.push(`Potwierdzone przez ${klaster.zrodla.length} źródeł.`)
  }

  return czesci.join(' ').slice(0, 400)
}

export function etykietaWplywu(wydzwiek: number, wplyw: number): string {
  if (wplyw <= 3) return 'Neutralne — tło'
  if (wydzwiek >= 2) return 'Może pchnąć cenę w górę'
  if (wydzwiek <= -2) return 'Ryzyko spadku'
  return 'Ważne, kierunek niejednoznaczny'
}

export function ocenNews(klaster: Klaster, teraz = Date.now()): OcenaNewsa {
  const pelny = `${klaster.tytul} ${klaster.opis}`
  const kategoria = wykryjKategorie(pelny)
  const { wynik: wydzwiek, frazy } = policzWydzwiek(pelny)

  const wiarygodnosc = wiarygodnoscKlastra(klaster)
  const bonusZrodel = 1 + Math.min(0.5, (klaster.zrodla.length - 1) * 0.12)
  const swiezosc = wspolczynnikSwiezosci(klaster.pierwszaData, teraz)
  const sila = 0.55 + 0.09 * Math.abs(wydzwiek)

  const surowy = 10 * WAGA_KATEGORII[kategoria] * wiarygodnosc * bonusZrodel * swiezosc * sila
  const wplyw = Math.max(1, Math.min(10, Math.round(surowy)))

  return {
    kategoria,
    nazwaKategorii: NAZWY_KATEGORII[kategoria],
    wydzwiek,
    wplyw,
    etykieta: etykietaWplywu(wydzwiek, wplyw),
    streszczenie: zbudujStreszczenie(klaster, kategoria, wydzwiek),
    wykryteFrazy: frazy,
  }
}
