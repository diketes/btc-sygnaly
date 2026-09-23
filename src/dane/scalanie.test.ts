import { describe, expect, it } from 'vitest'
import { scalSerie, scalSwiece, sprawdzCiaglosc } from './scalanie'
import type { Swieca } from '@/analiza/wskazniki'

const GODZINA = 3_600_000
const START = Date.UTC(2026, 0, 1)

function swieca(czas: number, cena = 100): Swieca {
  return { czas, o: cena, h: cena + 1, l: cena - 1, c: cena, v: 10 }
}

const seria = (ile: number, od = 0) =>
  Array.from({ length: ile }, (_, i) => swieca(START + (od + i) * GODZINA, 100 + od + i))

describe('scalSwiece', () => {
  it('aktualizuje ostatnią świecę, gdy czas się zgadza', () => {
    const s = seria(3)
    const wynik = scalSwiece(s, swieca(s[2].czas, 555))
    expect(wynik).toHaveLength(3)
    expect(wynik[2].c).toBe(555)
  })

  it('dokleja nową świecę', () => {
    const s = seria(3)
    const wynik = scalSwiece(s, swieca(START + 3 * GODZINA, 777))
    expect(wynik).toHaveLength(4)
    expect(wynik[3].c).toBe(777)
  })

  it('ignoruje spóźnioną ramkę ze starszą świecą', () => {
    const s = seria(3)
    const wynik = scalSwiece(s, swieca(START - GODZINA, 1))
    expect(wynik).toHaveLength(3)
    expect(wynik[0].czas).toBe(START)
  })

  it('nie mutuje wejścia', () => {
    const s = seria(3)
    const kopia = [...s]
    scalSwiece(s, swieca(s[2].czas, 999))
    expect(s).toEqual(kopia)
  })

  it('respektuje limit długości', () => {
    const s = seria(10)
    expect(scalSwiece(s, swieca(START + 10 * GODZINA), 5)).toHaveLength(5)
  })
})

describe('scalSerie', () => {
  it('zamyka dziurę powstałą w czasie przerwy w połączeniu', () => {
    const pelna = seria(100)
    const zDziura = [...pelna.slice(0, 30), ...pelna.slice(70)]
    expect(sprawdzCiaglosc(zDziura, GODZINA).ciagla).toBe(false)

    const naprawiona = scalSerie(zDziura, pelna)
    expect(sprawdzCiaglosc(naprawiona, GODZINA).ciagla).toBe(true)
    expect(naprawiona).toHaveLength(100)
  })

  it('nie tworzy duplikatów przy pokrywających się seriach', () => {
    const a = seria(50)
    const b = seria(50, 25)
    const wynik = scalSerie(a, b)
    expect(sprawdzCiaglosc(wynik, GODZINA).duplikaty).toBe(0)
    expect(wynik).toHaveLength(75)
  })

  it('nowsze dane wygrywają przy tym samym czasie', () => {
    const stara = [swieca(START, 100)]
    const nowa = [swieca(START, 200)]
    expect(scalSerie(stara, nowa)[0].c).toBe(200)
  })

  it('radzi sobie z pustymi seriami', () => {
    expect(scalSerie([], seria(3))).toHaveLength(3)
    expect(scalSerie(seria(3), [])).toHaveLength(3)
    expect(scalSerie([], [])).toHaveLength(0)
  })

  it('zwraca świece uporządkowane rosnąco', () => {
    const pomieszane = [swieca(START + 2 * GODZINA), swieca(START), swieca(START + GODZINA)]
    const wynik = scalSerie([], pomieszane)
    expect(wynik.map((s) => s.czas)).toEqual([START, START + GODZINA, START + 2 * GODZINA])
  })
})

describe('sprawdzCiaglosc', () => {
  it('wykrywa dokładną liczbę brakujących świec', () => {
    const pelna = seria(20)
    const zDziura = [...pelna.slice(0, 5), ...pelna.slice(12)]
    const raport = sprawdzCiaglosc(zDziura, GODZINA)
    expect(raport.dziury).toHaveLength(1)
    expect(raport.dziury[0].brakujace).toBe(7)
  })

  it('wykrywa duplikaty', () => {
    const raport = sprawdzCiaglosc([swieca(START), swieca(START)], GODZINA)
    expect(raport.duplikaty).toBe(1)
    expect(raport.ciagla).toBe(false)
  })

  it('pusta i jednoelementowa seria są ciągłe', () => {
    expect(sprawdzCiaglosc([], GODZINA).ciagla).toBe(true)
    expect(sprawdzCiaglosc([swieca(START)], GODZINA).ciagla).toBe(true)
  })
})
