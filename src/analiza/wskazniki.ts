/**
 * Wskaźniki analizy technicznej – własne implementacje, bez zewnętrznych bibliotek.
 *
 * Konwencja: każda funkcja zwraca tablicę tej samej długości co wejście.
 * Pozycje, dla których wskaźnika jeszcze nie da się policzyć, mają wartość NaN.
 * Wygładzanie typu Wildera (RSI, ATR, ADX) jest zgodne z oryginalnymi definicjami.
 */

export interface Swieca {
  /** Czas otwarcia świecy w milisekundach (UTC). */
  czas: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

const NIC = Number.NaN

export function czyLiczba(x: number | undefined | null): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/** Ostatnia sensowna (nie-NaN) wartość serii. */
export function ostatnia(seria: readonly number[]): number {
  for (let i = seria.length - 1; i >= 0; i--) {
    if (Number.isFinite(seria[i])) return seria[i]
  }
  return NIC
}

/** Wartość serii cofnięta o `wstecz` pozycji od końca. */
export function wartoscWstecz(seria: readonly number[], wstecz: number): number {
  const i = seria.length - 1 - wstecz
  return i >= 0 ? seria[i] : NIC
}

// ---------------------------------------------------------------- średnie

export function sma(dane: readonly number[], okres: number): number[] {
  const out = new Array<number>(dane.length).fill(NIC)
  if (okres <= 0 || dane.length < okres) return out
  let suma = 0
  for (let i = 0; i < dane.length; i++) {
    suma += dane[i]
    if (i >= okres) suma -= dane[i - okres]
    if (i >= okres - 1) out[i] = suma / okres
  }
  return out
}

export function ema(dane: readonly number[], okres: number): number[] {
  const out = new Array<number>(dane.length).fill(NIC)
  if (okres <= 0 || dane.length < okres) return out
  const k = 2 / (okres + 1)
  // Zasiew: SMA z pierwszych `okres` wartości (standard TradingView/Binance).
  let suma = 0
  for (let i = 0; i < okres; i++) suma += dane[i]
  let poprzednia = suma / okres
  out[okres - 1] = poprzednia
  for (let i = okres; i < dane.length; i++) {
    poprzednia = dane[i] * k + poprzednia * (1 - k)
    out[i] = poprzednia
  }
  return out
}

/** Wygładzanie Wildera (RMA) – używane w RSI, ATR i ADX. */
export function rma(dane: readonly number[], okres: number): number[] {
  const out = new Array<number>(dane.length).fill(NIC)
  if (okres <= 0 || dane.length < okres) return out
  let suma = 0
  for (let i = 0; i < okres; i++) suma += dane[i]
  let poprzednia = suma / okres
  out[okres - 1] = poprzednia
  for (let i = okres; i < dane.length; i++) {
    poprzednia = (poprzednia * (okres - 1) + dane[i]) / okres
    out[i] = poprzednia
  }
  return out
}

/** Odchylenie standardowe populacyjne w oknie kroczącym. */
export function odchylenie(dane: readonly number[], okres: number): number[] {
  const out = new Array<number>(dane.length).fill(NIC)
  if (okres <= 1 || dane.length < okres) return out
  for (let i = okres - 1; i < dane.length; i++) {
    let suma = 0
    for (let j = i - okres + 1; j <= i; j++) suma += dane[j]
    const srednia = suma / okres
    let wariancja = 0
    for (let j = i - okres + 1; j <= i; j++) {
      const d = dane[j] - srednia
      wariancja += d * d
    }
    out[i] = Math.sqrt(wariancja / okres)
  }
  return out
}

// ---------------------------------------------------------------- oscylatory

export function rsi(zamkniecia: readonly number[], okres = 14): number[] {
  const out = new Array<number>(zamkniecia.length).fill(NIC)
  if (zamkniecia.length <= okres) return out

  const zyski: number[] = [0]
  const straty: number[] = [0]
  for (let i = 1; i < zamkniecia.length; i++) {
    const zmiana = zamkniecia[i] - zamkniecia[i - 1]
    zyski.push(zmiana > 0 ? zmiana : 0)
    straty.push(zmiana < 0 ? -zmiana : 0)
  }

  // Pierwsza średnia liczona z indeksów 1..okres (pomijamy sztuczne zero na 0).
  let sredniZysk = 0
  let sredniaStrata = 0
  for (let i = 1; i <= okres; i++) {
    sredniZysk += zyski[i]
    sredniaStrata += straty[i]
  }
  sredniZysk /= okres
  sredniaStrata /= okres

  // Brak ruchu w obie strony to 50 (rynek bez kierunku), sam brak strat to 100.
  const wartosc = (zysk: number, strata: number) => {
    if (strata === 0) return zysk === 0 ? 50 : 100
    return 100 - 100 / (1 + zysk / strata)
  }

  out[okres] = wartosc(sredniZysk, sredniaStrata)
  for (let i = okres + 1; i < zamkniecia.length; i++) {
    sredniZysk = (sredniZysk * (okres - 1) + zyski[i]) / okres
    sredniaStrata = (sredniaStrata * (okres - 1) + straty[i]) / okres
    out[i] = wartosc(sredniZysk, sredniaStrata)
  }
  return out
}

export interface StochRsi {
  k: number[]
  d: number[]
}

export function stochRsi(
  zamkniecia: readonly number[],
  okresRsi = 14,
  okresStoch = 14,
  wygladzenieK = 3,
  wygladzenieD = 3,
): StochRsi {
  const r = rsi(zamkniecia, okresRsi)
  const surowy = new Array<number>(r.length).fill(NIC)
  for (let i = 0; i < r.length; i++) {
    if (i < okresRsi + okresStoch - 1) continue
    let min = Infinity
    let max = -Infinity
    let ok = true
    for (let j = i - okresStoch + 1; j <= i; j++) {
      if (!Number.isFinite(r[j])) {
        ok = false
        break
      }
      if (r[j] < min) min = r[j]
      if (r[j] > max) max = r[j]
    }
    if (!ok) continue
    surowy[i] = max === min ? 50 : ((r[i] - min) / (max - min)) * 100
  }
  const k = smaZNaN(surowy, wygladzenieK)
  const d = smaZNaN(k, wygladzenieD)
  return { k, d }
}

/** SMA odporna na NaN na początku serii. */
function smaZNaN(dane: readonly number[], okres: number): number[] {
  const out = new Array<number>(dane.length).fill(NIC)
  for (let i = okres - 1; i < dane.length; i++) {
    let suma = 0
    let ok = true
    for (let j = i - okres + 1; j <= i; j++) {
      if (!Number.isFinite(dane[j])) {
        ok = false
        break
      }
      suma += dane[j]
    }
    if (ok) out[i] = suma / okres
  }
  return out
}

export interface Macd {
  linia: number[]
  sygnal: number[]
  histogram: number[]
}

export function macd(
  zamkniecia: readonly number[],
  szybki = 12,
  wolny = 26,
  sygnalOkres = 9,
): Macd {
  const emaSzybka = ema(zamkniecia, szybki)
  const emaWolna = ema(zamkniecia, wolny)
  const linia = zamkniecia.map((_, i) =>
    Number.isFinite(emaSzybka[i]) && Number.isFinite(emaWolna[i]) ? emaSzybka[i] - emaWolna[i] : NIC,
  )
  // EMA z linii MACD musi startować od pierwszej sensownej wartości.
  const pierwszy = linia.findIndex((x) => Number.isFinite(x))
  const sygnal = new Array<number>(linia.length).fill(NIC)
  if (pierwszy >= 0) {
    const kawalek = linia.slice(pierwszy)
    const e = ema(kawalek, sygnalOkres)
    for (let i = 0; i < e.length; i++) sygnal[pierwszy + i] = e[i]
  }
  const histogram = linia.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(sygnal[i]) ? v - sygnal[i] : NIC,
  )
  return { linia, sygnal, histogram }
}

export interface Bollinger {
  srodek: number[]
  gora: number[]
  dol: number[]
  szerokosc: number[]
}

export function bollinger(zamkniecia: readonly number[], okres = 20, mnoznik = 2): Bollinger {
  const srodek = sma(zamkniecia, okres)
  const sd = odchylenie(zamkniecia, okres)
  const gora = srodek.map((m, i) => (Number.isFinite(m) ? m + mnoznik * sd[i] : NIC))
  const dol = srodek.map((m, i) => (Number.isFinite(m) ? m - mnoznik * sd[i] : NIC))
  const szerokosc = srodek.map((m, i) =>
    Number.isFinite(m) && m !== 0 ? ((gora[i] - dol[i]) / m) * 100 : NIC,
  )
  return { srodek, gora, dol, szerokosc }
}

// ---------------------------------------------------------------- zmienność i trend

export function trueRange(swiece: readonly Swieca[]): number[] {
  const out = new Array<number>(swiece.length).fill(NIC)
  if (swiece.length === 0) return out
  out[0] = swiece[0].h - swiece[0].l
  for (let i = 1; i < swiece.length; i++) {
    const s = swiece[i]
    const poprzednieZamkniecie = swiece[i - 1].c
    out[i] = Math.max(
      s.h - s.l,
      Math.abs(s.h - poprzednieZamkniecie),
      Math.abs(s.l - poprzednieZamkniecie),
    )
  }
  return out
}

export function atr(swiece: readonly Swieca[], okres = 14): number[] {
  return rma(trueRange(swiece), okres)
}

export interface Adx {
  adx: number[]
  plusDi: number[]
  minusDi: number[]
}

export function adx(swiece: readonly Swieca[], okres = 14): Adx {
  const n = swiece.length
  const pusty = () => new Array<number>(n).fill(NIC)
  if (n < okres * 2) return { adx: pusty(), plusDi: pusty(), minusDi: pusty() }

  const tr = trueRange(swiece)
  const plusDm = new Array<number>(n).fill(0)
  const minusDm = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const ruchGora = swiece[i].h - swiece[i - 1].h
    const ruchDol = swiece[i - 1].l - swiece[i].l
    plusDm[i] = ruchGora > ruchDol && ruchGora > 0 ? ruchGora : 0
    minusDm[i] = ruchDol > ruchGora && ruchDol > 0 ? ruchDol : 0
  }

  const trS = rma(tr, okres)
  const plusS = rma(plusDm, okres)
  const minusS = rma(minusDm, okres)

  const plusDi = pusty()
  const minusDi = pusty()
  const dx = pusty()
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) continue
    plusDi[i] = (plusS[i] / trS[i]) * 100
    minusDi[i] = (minusS[i] / trS[i]) * 100
    const suma = plusDi[i] + minusDi[i]
    dx[i] = suma === 0 ? 0 : (Math.abs(plusDi[i] - minusDi[i]) / suma) * 100
  }

  // ADX = wygładzenie Wildera z DX, startujące od pierwszej sensownej wartości DX.
  const pierwszy = dx.findIndex((x) => Number.isFinite(x))
  const wynik = pusty()
  if (pierwszy >= 0) {
    const kawalek = dx.slice(pierwszy)
    const w = rma(kawalek, okres)
    for (let i = 0; i < w.length; i++) wynik[pierwszy + i] = w[i]
  }
  return { adx: wynik, plusDi, minusDi }
}

// ---------------------------------------------------------------- wolumen

/** VWAP resetowany o północy UTC (sesja dzienna). */
export function vwap(swiece: readonly Swieca[]): number[] {
  const out = new Array<number>(swiece.length).fill(NIC)
  let dzien = -1
  let sumaPV = 0
  let sumaV = 0
  for (let i = 0; i < swiece.length; i++) {
    const s = swiece[i]
    const d = Math.floor(s.czas / 86_400_000)
    if (d !== dzien) {
      dzien = d
      sumaPV = 0
      sumaV = 0
    }
    const typowa = (s.h + s.l + s.c) / 3
    sumaPV += typowa * s.v
    sumaV += s.v
    out[i] = sumaV > 0 ? sumaPV / sumaV : NIC
  }
  return out
}

export function obv(swiece: readonly Swieca[]): number[] {
  const out = new Array<number>(swiece.length).fill(NIC)
  if (swiece.length === 0) return out
  let suma = 0
  out[0] = 0
  for (let i = 1; i < swiece.length; i++) {
    if (swiece[i].c > swiece[i - 1].c) suma += swiece[i].v
    else if (swiece[i].c < swiece[i - 1].c) suma -= swiece[i].v
    out[i] = suma
  }
  return out
}

// ---------------------------------------------------------------- Ichimoku

export interface Ichimoku {
  tenkan: number[]
  kijun: number[]
  spanA: number[]
  spanB: number[]
}

export function ichimoku(swiece: readonly Swieca[], t = 9, k = 26, b = 52): Ichimoku {
  const n = swiece.length
  const srodekZakresu = (okres: number) => {
    const out = new Array<number>(n).fill(NIC)
    for (let i = okres - 1; i < n; i++) {
      let max = -Infinity
      let min = Infinity
      for (let j = i - okres + 1; j <= i; j++) {
        if (swiece[j].h > max) max = swiece[j].h
        if (swiece[j].l < min) min = swiece[j].l
      }
      out[i] = (max + min) / 2
    }
    return out
  }
  const tenkan = srodekZakresu(t)
  const kijun = srodekZakresu(k)
  const spanB = srodekZakresu(b)
  const spanA = tenkan.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(kijun[i]) ? (v + kijun[i]) / 2 : NIC,
  )
  return { tenkan, kijun, spanA, spanB }
}

// ---------------------------------------------------------------- pomocnicze

export function zamkniecia(swiece: readonly Swieca[]): number[] {
  return swiece.map((s) => s.c)
}

/** Percentyl (0–100) ostatniej wartości na tle `okno` poprzednich. */
export function percentyl(seria: readonly number[], okno: number): number {
  const kawalek = seria.slice(-okno).filter(Number.isFinite)
  if (kawalek.length < 5) return NIC
  const ost = kawalek[kawalek.length - 1]
  const mniejszych = kawalek.filter((x) => x < ost).length
  return (mniejszych / kawalek.length) * 100
}

/** Nachylenie serii w procentach na świecę (regresja liniowa na ostatnich `okno`). */
export function nachylenie(seria: readonly number[], okno: number): number {
  const kawalek = seria.slice(-okno).filter(Number.isFinite)
  if (kawalek.length < 3) return NIC
  const n = kawalek.length
  const sredniaX = (n - 1) / 2
  const sredniaY = kawalek.reduce((a, b) => a + b, 0) / n
  let licznik = 0
  let mianownik = 0
  for (let i = 0; i < n; i++) {
    licznik += (i - sredniaX) * (kawalek[i] - sredniaY)
    mianownik += (i - sredniaX) ** 2
  }
  if (mianownik === 0 || sredniaY === 0) return NIC
  return ((licznik / mianownik) / sredniaY) * 100
}

/** Przycięcie do zakresu. */
export function ogranicz(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x))
}
