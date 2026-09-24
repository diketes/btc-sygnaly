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
  /**
   * Z ilu ostatnich świec bazowych brać swing pod stop loss (domyślnie 40).
   * Przy krótkim własnym horyzoncie 40 świec dziennych to ponad miesiąc –
   * stop wypadałby dużo dalej, niż ma sens przy kilkudniowej pozycji.
   */
  oknoSwingu?: number
  /** Liczba dni – tylko profil zbudowany w generatorze (`profilDlaDni`). */
  dniWlasne?: number
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

// ------------------------------------------------------------------ własny horyzont

/**
 * Profil na dowolną liczbę dni – dla generatora sygnału („od 2 dni do 3 miesięcy”).
 *
 * Dwa stałe profile to dwa punkty na osi czasu: krótki (do ~2 dni) i długi
 * (2 tygodnie – 3 miesiące). Tutaj budujemy profil pomiędzy nimi i poza nimi,
 * tak żeby sygnał na 3 dni był naprawdę innym sygnałem niż na 60 dni:
 *
 *  • interwały i interwał bazowy dobierane progami – im dłuższy horyzont, tym
 *    wyższe interwały (krótkie świece to przy trzymiesięcznej pozycji szum),
 *  • stop, cele, wymagany stosunek zysku do ryzyka, wagi wskaźników i wpływ
 *    danych z rynku terminowego przechodzą płynnie od profilu krótkiego do
 *    długiego wraz z logarytmem liczby dni,
 *  • sygnał żyje dokładnie tyle dni, ile wybrał użytkownik.
 */

export const MIN_DNI = 2
export const MAX_DNI = 90

/** Położenie na osi 2…90 dni w skali logarytmicznej: 0 = 2 dni, 1 = 90 dni. */
export function polozenieHoryzontu(dni: number): number {
  const d = Math.min(MAX_DNI, Math.max(MIN_DNI, dni))
  return Math.log(d / MIN_DNI) / Math.log(MAX_DNI / MIN_DNI)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Opis liczby dni po ludzku: „tydzień”, „2 tygodnie”, „miesiąc”, „45 dni”. */
export function opisDni(dni: number): string {
  const d = Math.round(dni)
  const nazwy: Record<number, string> = {
    7: 'tydzień',
    14: '2 tygodnie',
    21: '3 tygodnie',
    30: 'miesiąc',
    60: '2 miesiące',
    90: '3 miesiące',
  }
  return nazwy[d] ?? `${d} dni`
}

/** To samo w dopełniaczu – po „do” i „dla”: „do tygodnia”, „dla 3 miesięcy”. */
export function opisDniDopelniacz(dni: number): string {
  const d = Math.round(dni)
  const nazwy: Record<number, string> = {
    7: 'tygodnia',
    14: '2 tygodni',
    21: '3 tygodni',
    30: 'miesiąca',
    60: '2 miesięcy',
    90: '3 miesięcy',
  }
  return nazwy[d] ?? `${d} dni`
}

/** Nazwa horyzontu sygnału: „Krótki termin” albo „Generator · 2 tygodnie”. */
export function etykietaHoryzontu(s: { horyzont: Horyzont; dniHoryzontu?: number }): string {
  return typeof s.dniHoryzontu === 'number'
    ? `Generator · ${opisDni(s.dniHoryzontu)}`
    : PROFILE[s.horyzont].nazwa
}

type WpisInterwalu = { interwal: Interwal; waga: number }

function interwalyDlaDni(dni: number): { interwaly: WpisInterwalu[]; bazowy: Interwal } {
  if (dni <= 3) {
    return {
      bazowy: '1h',
      interwaly: [
        { interwal: '15m', waga: 0.15 },
        { interwal: '1h', waga: 0.35 },
        { interwal: '4h', waga: 0.35 },
        { interwal: '1d', waga: 0.15 },
      ],
    }
  }
  if (dni <= 10) {
    return {
      bazowy: '4h',
      interwaly: [
        { interwal: '1h', waga: 0.15 },
        { interwal: '4h', waga: 0.4 },
        { interwal: '1d', waga: 0.35 },
        { interwal: '3d', waga: 0.1 },
      ],
    }
  }
  if (dni <= 30) {
    return {
      bazowy: '1d',
      interwaly: [
        { interwal: '4h', waga: 0.25 },
        { interwal: '1d', waga: 0.45 },
        { interwal: '3d', waga: 0.2 },
        { interwal: '1w', waga: 0.1 },
      ],
    }
  }
  return {
    bazowy: '1d',
    interwaly: [
      { interwal: '4h', waga: 0.15 },
      { interwal: '1d', waga: 0.4 },
      { interwal: '3d', waga: 0.25 },
      { interwal: '1w', waga: 0.2 },
    ],
  }
}

export function profilDlaDni(dniWejscie: number): ProfilHoryzontu {
  const dni = Math.round(Math.min(MAX_DNI, Math.max(MIN_DNI, dniWejscie)))
  const t = polozenieHoryzontu(dni)
  const k = PROFIL_KROTKI
  const d = PROFIL_DLUGI
  const { interwaly, bazowy } = interwalyDlaDni(dni)

  const wagiWskaznikow = Object.fromEntries(
    (Object.keys(k.wagiWskaznikow) as (keyof WagiWskaznikow)[]).map((klucz) => [
      klucz,
      lerp(k.wagiWskaznikow[klucz], d.wagiWskaznikow[klucz], t),
    ]),
  ) as unknown as WagiWskaznikow

  const wagiModyfikatorow = Object.fromEntries(
    (Object.keys(k.wagiModyfikatorow) as (keyof WagiModyfikatorow)[]).map((klucz) => [
      klucz,
      lerp(k.wagiModyfikatorow[klucz], d.wagiModyfikatorow[klucz], t),
    ]),
  ) as unknown as WagiModyfikatorow

  // Swing pod stop: ok. 60% długości horyzontu w świecach bazowych, 10–40 świec.
  const godzinBazowego = MS_INTERWALU[bazowy] / 3_600_000
  const oknoSwingu = Math.round(Math.min(40, Math.max(10, ((dni * 24) / godzinBazowego) * 0.6)))

  // toFixed zdejmuje ogony w rodzaju 2,0500000000000003 z mnożenia przez krok.
  const zaokr = (x: number, krok: number) => Number((Math.round(x / krok) * krok).toFixed(4))

  return {
    // Najbliższy stały profil – do grupowania; generator i tak rozpoznaje
    // swoje sygnały po `dniHoryzontu`.
    id: dni <= 10 ? 'krotki' : 'dlugi',
    nazwa: 'Własny horyzont',
    podtytul: opisDni(dni),
    opisDlugosci: `do ${opisDniDopelniacz(dni)}`,
    ikona: 'suwak',
    interwaly,
    interwalBazowy: bazowy,
    swiecDoAnalizy: 500,
    wagiWskaznikow,
    wagiModyfikatorow,
    mnoznikSL: zaokr(lerp(1.5, d.mnoznikSL, t), 0.05),
    celeR: [
      zaokr(lerp(k.celeR[0], d.celeR[0], t), 0.1),
      zaokr(lerp(k.celeR[1], d.celeR[1], t), 0.1),
      zaokr(lerp(k.celeR[2], d.celeR[2], t), 0.1),
    ],
    minRR: zaokr(lerp(k.minRR, d.minRR, t), 0.1),
    progWyniku: Math.round(lerp(k.progWyniku, d.progWyniku, t)),
    minZgodnosc: dni <= 10 ? 3 : 2,
    // Przy pozycji trzymanej dniami dochodzi koszt fundingu i ryzyko luki –
    // dźwignia ma sufit malejący z długością horyzontu.
    maksDzwignia: dni <= 3 ? 10 : dni <= 10 ? 7 : dni <= 30 ? 5 : 3,
    cooldownSwiec: 1,
    domyslneRyzykoProc: zaokr(lerp(k.domyslneRyzykoProc, d.domyslneRyzykoProc, t), 0.5),
    waznoscGodzin: dni * 24,
    kolorAkcentu: '#22C3E6',
    oknoSwingu,
    dniWlasne: dni,
  }
}
