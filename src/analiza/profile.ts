/**
 * Profile horyzontu inwestycyjnego.
 *
 * Aplikacja liczy sygnały niezależnie dla dwóch horyzontów, bo to są dwie różne gry:
 *  • KRÓTKI  – intraday/scalp: niskie interwały, ciasny stop, wysokie R:R na krótkim dystansie,
 *              duże znaczenie fundingu, likwidacji i księgi zleceń.
 *  • DŁUGI   – swing/pozycja: interwały 4h–1W, szeroki stop, mała dźwignia, liczy się trend
 *              wyższego rzędu, Ichimoku, struktura i makro.
 *
 * Użytkownik wybiera w aplikacji: KRÓTKI, DŁUGI albo OBA (wtedy widzi dwie karty naraz).
 */

export type Horyzont = 'krotki' | 'dlugi'
export type TrybHoryzontu = Horyzont | 'oba'

/** Interwały Binance obsługiwane przez silnik. */
export type Interwal = '5m' | '15m' | '1h' | '4h' | '1d' | '3d' | '1w'

export const MS_INTERWALU: Record<Interwal, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
}

export interface WagiWskaznikow {
  emaUklad: number
  trendDlugi: number
  macd: number
  rsi: number
  stochRsi: number
  bollinger: number
  vwap: number
  ichimoku: number
  struktura: number
  poziomy: number
  wolumen: number
}

export interface WagiModyfikatorow {
  funding: number
  longShort: number
  likwidacje: number
  strachChciwosc: number
  openInterest: number
}

export interface ProfilHoryzontu {
  id: Horyzont
  nazwa: string
  podtytul: string
  opisDlugosci: string
  ikona: string
  /** Interwały analizowane wraz z wagą (suma wag = 1). */
  interwaly: { interwal: Interwal; waga: number }[]
  /** Interwał, na którym wystawiany jest sygnał (cooldown, unieważnienie). */
  interwalBazowy: Interwal
  /** Ile świec interwału bazowego pobrać do analizy. */
  swiecDoAnalizy: number
  wagiWskaznikow: WagiWskaznikow
  wagiModyfikatorow: WagiModyfikatorow
  /** Mnożnik ATR dodawany do swingu przy wyznaczaniu stop lossa. */
  mnoznikSL: number
  /** Cele w wielokrotnościach ryzyka (R). */
  celeR: [number, number, number]
  /** Minimalny stosunek zysku do ryzyka – poniżej sygnał nie powstaje. */
  minRR: number
  /** Minimalny wynik bezwzględny (0–100), żeby w ogóle rozważać sygnał. */
  progWyniku: number
  /** Minimalna zgodność interwałów (ile z nich musi wskazywać ten sam kierunek). */
  minZgodnosc: number
  /** Sugerowana dźwignia nigdy nie przekroczy tej wartości. */
  maksDzwignia: number
  /** Ile świec interwału bazowego blokady po sygnale w tym samym kierunku. */
  cooldownSwiec: number
  /** Domyślny procent kapitału ryzykowany na jedną pozycję. */
  domyslneRyzykoProc: number
  /** Po ilu godzinach niezrealizowany sygnał wygasa. */
  waznoscGodzin: number
  kolorAkcentu: string
}

const PROFIL_KROTKI: ProfilHoryzontu = {
  id: 'krotki',
  nazwa: 'Krótki termin',
  podtytul: 'Intraday / scalp',
  opisDlugosci: 'kilka godzin – 2 dni',
  ikona: 'blyskawica',
  interwaly: [
    { interwal: '5m', waga: 0.1 },
    { interwal: '15m', waga: 0.25 },
    { interwal: '1h', waga: 0.4 },
    { interwal: '4h', waga: 0.25 },
  ],
  interwalBazowy: '15m',
  swiecDoAnalizy: 500,
  wagiWskaznikow: {
    emaUklad: 0.16,
    trendDlugi: 0.04,
    macd: 0.14,
    rsi: 0.12,
    stochRsi: 0.1,
    bollinger: 0.08,
    vwap: 0.1,
    ichimoku: 0,
    struktura: 0.12,
    poziomy: 0.08,
    wolumen: 0.06,
  },
  wagiModyfikatorow: {
    funding: 1,
    longShort: 1,
    likwidacje: 1.2,
    strachChciwosc: 0.5,
    openInterest: 0.8,
  },
  mnoznikSL: 1.1,
  celeR: [1, 1.8, 3],
  minRR: 1.5,
  // Próg i zgodność podniesione po backteście: przy 22/2 silnik wystawiał ponad
  // 2000 sygnałów rocznie, czyli kilka dziennie, w dużej części nakładających się
  // na siebie. To nie są osobne okazje, tylko ten sam ruch liczony wielokrotnie.
  progWyniku: 35,
  minZgodnosc: 3,
  maksDzwignia: 20,
  // 16 świec 15-minutowych = 4 godziny.
  cooldownSwiec: 16,
  domyslneRyzykoProc: 1,
  waznoscGodzin: 48,
  kolorAkcentu: '#7C5CFF',
}

const PROFIL_DLUGI: ProfilHoryzontu = {
  id: 'dlugi',
  nazwa: 'Długi termin',
  podtytul: 'Swing / pozycja',
  opisDlugosci: '2 tygodnie – 3 miesiące',
  ikona: 'gora',
  interwaly: [
    { interwal: '4h', waga: 0.2 },
    { interwal: '1d', waga: 0.45 },
    { interwal: '3d', waga: 0.2 },
    { interwal: '1w', waga: 0.15 },
  ],
  interwalBazowy: '1d',
  swiecDoAnalizy: 700,
  wagiWskaznikow: {
    emaUklad: 0.18,
    trendDlugi: 0.16,
    macd: 0.1,
    rsi: 0.08,
    stochRsi: 0.02,
    bollinger: 0.04,
    vwap: 0,
    ichimoku: 0.14,
    struktura: 0.16,
    poziomy: 0.06,
    wolumen: 0.06,
  },
  wagiModyfikatorow: {
    funding: 0.4,
    longShort: 0.3,
    likwidacje: 0.3,
    strachChciwosc: 1.4,
    openInterest: 0.6,
  },
  mnoznikSL: 2.6,
  celeR: [1.5, 3, 5],
  minRR: 2,
  progWyniku: 32,
  minZgodnosc: 2,
  maksDzwignia: 5,
  // 10 świec dziennych – przy pozycjach trzymanych tygodniami nowy sygnał w tym
  // samym kierunku co 2 dni nie miałby sensu.
  cooldownSwiec: 10,
  domyslneRyzykoProc: 2,
  // Musi pokrywać deklarowany horyzont. Przy stopie 2,6×ATR na interwale
  // dziennym cel 5R to ruch rzędu 13 ATR – przy 21 dniach 87% sygnałów po
  // prostu wygasało, nie dochodząc do żadnego celu. 60 dni to kompromis:
  // cele są osiągalne, a pozycja nie blokuje miejsca przez cały kwartał.
  waznoscGodzin: 60 * 24,
  kolorAkcentu: '#F7931A',
}

export const PROFILE: Record<Horyzont, ProfilHoryzontu> = {
  krotki: PROFIL_KROTKI,
  dlugi: PROFIL_DLUGI,
}

export const HORYZONTY: Horyzont[] = ['krotki', 'dlugi']

export function profil(h: Horyzont): ProfilHoryzontu {
  return PROFILE[h]
}

/** Które horyzonty liczyć przy danym ustawieniu użytkownika. */
export function horyzontyDlaTrybu(tryb: TrybHoryzontu): Horyzont[] {
  return tryb === 'oba' ? HORYZONTY : [tryb]
}

/** Wszystkie interwały potrzebne dla danego trybu (bez duplikatów). */
export function potrzebneInterwaly(tryb: TrybHoryzontu): Interwal[] {
  const zbior = new Set<Interwal>()
  for (const h of horyzontyDlaTrybu(tryb)) {
    for (const i of PROFILE[h].interwaly) zbior.add(i.interwal)
  }
  return [...zbior]
}

export function nazwaHoryzontu(h: Horyzont): string {
  return PROFILE[h].nazwa
}
