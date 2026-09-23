import { describe, expect, it } from 'vitest'
import {
  atr,
  bollinger,
  ema,
  ichimoku,
  macd,
  obv,
  ostatnia,
  rma,
  rsi,
  sma,
  stochRsi,
  trueRange,
  vwap,
  type Swieca,
} from './wskazniki'

/** Buduje świece z listy zamknięć (h/l dopięte symetrycznie). */
function swieceZZamkniec(zamkniecia: number[], rozpietosc = 1, wolumen = 100): Swieca[] {
  return zamkniecia.map((c, i) => ({
    czas: Date.UTC(2024, 0, 1) + i * 3_600_000,
    o: i === 0 ? c : zamkniecia[i - 1],
    h: c + rozpietosc / 2,
    l: c - rozpietosc / 2,
    c,
    v: wolumen,
  }))
}

describe('SMA', () => {
  it('liczy średnią kroczącą i zostawia NaN na rozbiegu', () => {
    const wynik = sma([1, 2, 3, 4, 5], 3)
    expect(Number.isNaN(wynik[0])).toBe(true)
    expect(Number.isNaN(wynik[1])).toBe(true)
    expect(wynik[2]).toBeCloseTo(2, 10)
    expect(wynik[3]).toBeCloseTo(3, 10)
    expect(wynik[4]).toBeCloseTo(4, 10)
  })

  it('dla serii stałej zwraca tę samą wartość', () => {
    expect(ostatnia(sma([7, 7, 7, 7, 7], 5))).toBeCloseTo(7, 10)
  })
})

describe('EMA', () => {
  it('zasiewa się średnią prostą i wygładza wykładniczo', () => {
    // okres 3 → k = 0,5; zasiew = SMA(1,2,3) = 2
    const wynik = ema([1, 2, 3, 4, 5], 3)
    expect(wynik[2]).toBeCloseTo(2, 10)
    expect(wynik[3]).toBeCloseTo(3, 10) // 4*0,5 + 2*0,5
    expect(wynik[4]).toBeCloseTo(4, 10) // 5*0,5 + 3*0,5
  })

  it('zwraca same NaN, gdy danych jest mniej niż okres', () => {
    expect(ema([1, 2], 5).every(Number.isNaN)).toBe(true)
  })
})

describe('RMA (wygładzanie Wildera)', () => {
  it('pierwsza wartość to średnia prosta, kolejne ważone', () => {
    const wynik = rma([2, 4, 6, 8], 2)
    expect(wynik[1]).toBeCloseTo(3, 10) // (2+4)/2
    expect(wynik[2]).toBeCloseTo(4.5, 10) // (3*1 + 6)/2
    expect(wynik[3]).toBeCloseTo(6.25, 10) // (4,5*1 + 8)/2
  })
})

describe('RSI', () => {
  // Kanoniczny zestaw danych z książki Wildera – publikowane wartości referencyjne.
  const dane = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28,
    46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18,
    44.22, 44.57, 43.42, 42.66, 43.13,
  ]

  // Wartości policzone bez zaokrągleń pośrednich (zgodne z tabelą StockCharts).
  // Uwaga: w książce Wildera wydrukowano 70,53 / 66,32 / 66,55 – to artefakt
  // zaokrąglania średnich do dwóch miejsc w drukowanej tabeli, nie inna formuła.
  // Kontrola: suma zysków 3,34 / suma strat 1,40 → RS 2,385714 → RSI 70,4641.
  const referencyjne: Record<number, number> = {
    14: 70.46,
    15: 66.25,
    16: 66.48,
    17: 69.35,
    18: 66.29,
    19: 57.92,
    20: 62.88,
    21: 63.21,
    22: 56.01,
    23: 62.34,
    24: 54.67,
    25: 50.39,
    26: 40.02,
    27: 41.49,
    28: 41.9,
    29: 45.5,
    30: 37.32,
    31: 33.09,
    32: 37.79,
  }

  it('zgadza się z wartościami referencyjnymi na całej długości serii', () => {
    const wynik = rsi(dane, 14)
    for (const [indeks, oczekiwana] of Object.entries(referencyjne)) {
      expect(wynik[Number(indeks)], `RSI na pozycji ${indeks}`).toBeCloseTo(oczekiwana, 1)
    }
  })

  it('rosnąca seria daje RSI 100, malejąca 0', () => {
    const rosnaca = Array.from({ length: 40 }, (_, i) => 100 + i)
    const malejaca = Array.from({ length: 40 }, (_, i) => 100 - i)
    expect(ostatnia(rsi(rosnaca, 14))).toBeCloseTo(100, 6)
    expect(ostatnia(rsi(malejaca, 14))).toBeCloseTo(0, 6)
  })

  it('seria stała daje 50 (brak kierunku), a nie 100', () => {
    expect(ostatnia(rsi(new Array(40).fill(50), 14))).toBe(50)
  })

  it('zostawia NaN przed pierwszą policzalną wartością', () => {
    const wynik = rsi(dane, 14)
    expect(wynik.slice(0, 14).every(Number.isNaN)).toBe(true)
  })
})

describe('True Range i ATR', () => {
  it('TR uwzględnia lukę względem poprzedniego zamknięcia', () => {
    const swiece: Swieca[] = [
      { czas: 0, o: 10, h: 12, l: 9, c: 11, v: 1 },
      { czas: 1, o: 11, h: 20, l: 18, c: 19, v: 1 }, // luka w górę
    ]
    const tr = trueRange(swiece)
    expect(tr[0]).toBeCloseTo(3, 10) // 12 - 9
    expect(tr[1]).toBeCloseTo(9, 10) // |20 - 11| większe niż 20-18
  })

  it('ATR przy stałym zakresie równa się temu zakresowi', () => {
    // Cena stoi w miejscu, zakres każdej świecy = 2 → ATR = 2.
    const swiece: Swieca[] = Array.from({ length: 40 }, (_, i) => ({
      czas: i * 3_600_000,
      o: 100,
      h: 101,
      l: 99,
      c: 100,
      v: 10,
    }))
    expect(ostatnia(atr(swiece, 14))).toBeCloseTo(2, 6)
  })
})

describe('MACD', () => {
  it('dla trendu wzrostowego linia jest dodatnia', () => {
    const dane = Array.from({ length: 120 }, (_, i) => 100 + i * 2)
    expect(ostatnia(macd(dane).linia)).toBeGreaterThan(0)
  })

  it('dla trendu spadkowego linia jest ujemna', () => {
    const dane = Array.from({ length: 120 }, (_, i) => 500 - i * 2)
    expect(ostatnia(macd(dane).linia)).toBeLessThan(0)
  })

  it('przy stałym tempie wzrostu histogram wygasa do zera', () => {
    // Liniowa rampa → MACD stały → linia sygnału dogania go, histogram dąży do 0.
    // To własność poprawnej implementacji, nie przypadek.
    const dane = Array.from({ length: 300 }, (_, i) => 100 + i * 2)
    expect(Math.abs(ostatnia(macd(dane).histogram))).toBeLessThan(1e-6)
  })

  it('przy przyspieszającym wzroście histogram jest dodatni', () => {
    const dane = Array.from({ length: 150 }, (_, i) => 100 + i * i * 0.05)
    const m = macd(dane)
    expect(ostatnia(m.linia)).toBeGreaterThan(ostatnia(m.sygnal))
    expect(ostatnia(m.histogram)).toBeGreaterThan(0)
  })

  it('przy przyspieszających spadkach histogram jest ujemny', () => {
    const dane = Array.from({ length: 150 }, (_, i) => 2000 - i * i * 0.05)
    const m = macd(dane)
    expect(ostatnia(m.histogram)).toBeLessThan(0)
  })

  it('histogram to różnica linii i sygnału', () => {
    const dane = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10)
    const m = macd(dane)
    const i = m.histogram.length - 1
    expect(m.histogram[i]).toBeCloseTo(m.linia[i] - m.sygnal[i], 10)
  })
})

describe('Bollinger', () => {
  it('przy zerowej zmienności wstęgi schodzą się do środka', () => {
    const b = bollinger(new Array(40).fill(100), 20, 2)
    expect(ostatnia(b.gora)).toBeCloseTo(100, 10)
    expect(ostatnia(b.dol)).toBeCloseTo(100, 10)
    expect(ostatnia(b.szerokosc)).toBeCloseTo(0, 10)
  })

  it('górna wstęga leży o 2 odchylenia nad środkiem', () => {
    const dane = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5))
    const b = bollinger(dane, 20, 2)
    const i = b.gora.length - 1
    expect(b.gora[i] - b.srodek[i]).toBeCloseTo(b.srodek[i] - b.dol[i], 8)
    expect(b.gora[i] - b.srodek[i]).toBeCloseTo(10, 6) // odchylenie = 5, mnożnik 2
  })
})

describe('Stoch RSI', () => {
  it('trzyma się zakresu 0–100', () => {
    const dane = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 7) * 20 + i * 0.1)
    const s = stochRsi(dane)
    const sensowne = s.k.filter(Number.isFinite)
    expect(sensowne.length).toBeGreaterThan(50)
    expect(Math.min(...sensowne)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...sensowne)).toBeLessThanOrEqual(100)
  })
})

describe('VWAP', () => {
  it('resetuje się o północy UTC', () => {
    const swiece: Swieca[] = [
      { czas: Date.UTC(2024, 0, 1, 22), o: 100, h: 100, l: 100, c: 100, v: 10 },
      { czas: Date.UTC(2024, 0, 1, 23), o: 200, h: 200, l: 200, c: 200, v: 10 },
      { czas: Date.UTC(2024, 0, 2, 0), o: 50, h: 50, l: 50, c: 50, v: 10 },
    ]
    const v = vwap(swiece)
    expect(v[1]).toBeCloseTo(150, 10) // średnia z dwóch świec pierwszego dnia
    expect(v[2]).toBeCloseTo(50, 10) // nowy dzień – licznik od zera
  })
})

describe('OBV', () => {
  it('dodaje wolumen przy wzroście i odejmuje przy spadku', () => {
    const swiece = swieceZZamkniec([10, 11, 10, 12], 0.5, 100)
    const o = obv(swiece)
    expect(o[0]).toBe(0)
    expect(o[1]).toBe(100)
    expect(o[2]).toBe(0)
    expect(o[3]).toBe(100)
  })
})

describe('Ichimoku', () => {
  it('tenkan to środek zakresu z 9 świec', () => {
    const swiece: Swieca[] = Array.from({ length: 60 }, (_, i) => ({
      czas: i * 3_600_000,
      o: 100,
      h: 110,
      l: 90,
      c: 100,
      v: 1,
    }))
    const ich = ichimoku(swiece)
    expect(ostatnia(ich.tenkan)).toBeCloseTo(100, 10) // (110 + 90) / 2
    expect(ostatnia(ich.kijun)).toBeCloseTo(100, 10)
  })
})
