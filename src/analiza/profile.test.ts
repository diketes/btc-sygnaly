import { describe, expect, it } from 'vitest'
import {
  MAX_DNI,
  MIN_DNI,
  MS_INTERWALU,
  opisDni,
  opisDniDopelniacz,
  polozenieHoryzontu,
  PROFILE,
  profilDlaDni,
} from './profile'

const SIATKA = [2, 3, 4, 5, 7, 10, 11, 14, 21, 30, 31, 45, 60, 90]

describe('profilDlaDni – spójność', () => {
  it.each(SIATKA)('wagi interwałów sumują się do 1 (%i dni)', (dni) => {
    const suma = profilDlaDni(dni).interwaly.reduce((a, i) => a + i.waga, 0)
    expect(suma).toBeCloseTo(1, 9)
  })

  it.each(SIATKA)('wagi wskaźników sumują się do 1 (%i dni)', (dni) => {
    const suma = Object.values(profilDlaDni(dni).wagiWskaznikow).reduce((a, b) => a + b, 0)
    expect(suma).toBeCloseTo(1, 9)
  })

  it.each(SIATKA)('interwał bazowy jest wśród analizowanych (%i dni)', (dni) => {
    const p = profilDlaDni(dni)
    expect(p.interwaly.map((i) => i.interwal)).toContain(p.interwalBazowy)
  })

  it.each(SIATKA)('cele są rosnące, a TP2 spełnia wymagany zysk do ryzyka (%i dni)', (dni) => {
    const p = profilDlaDni(dni)
    expect(p.celeR[0]).toBeLessThan(p.celeR[1])
    expect(p.celeR[1]).toBeLessThan(p.celeR[2])
    // R:R liczone jest do TP2 – gdyby TP2 był niżej niż próg, żaden
    // zwykły sygnał nie mógłby powstać.
    expect(p.celeR[1]).toBeGreaterThanOrEqual(p.minRR)
  })

  it.each(SIATKA)('sygnał żyje dokładnie tyle dni, ile wybrano (%i dni)', (dni) => {
    expect(profilDlaDni(dni).waznoscGodzin).toBe(dni * 24)
  })
})

describe('profilDlaDni – krótszy horyzont to naprawdę inna gra', () => {
  it('dłuższy horyzont nigdy nie ma niższego interwału bazowego', () => {
    let poprzedni = 0
    for (let dni = MIN_DNI; dni <= MAX_DNI; dni++) {
      const ms = MS_INTERWALU[profilDlaDni(dni).interwalBazowy]
      expect(ms).toBeGreaterThanOrEqual(poprzedni)
      poprzedni = ms
    }
  })

  it('stop, cele i wymagane R:R rosną z długością horyzontu', () => {
    let pop = profilDlaDni(MIN_DNI)
    for (let dni = MIN_DNI + 1; dni <= MAX_DNI; dni++) {
      const p = profilDlaDni(dni)
      expect(p.mnoznikSL).toBeGreaterThanOrEqual(pop.mnoznikSL)
      expect(p.celeR[2]).toBeGreaterThanOrEqual(pop.celeR[2])
      expect(p.minRR).toBeGreaterThanOrEqual(pop.minRR)
      pop = p
    }
  })

  it('sufit dźwigni maleje z długością horyzontu', () => {
    let pop = profilDlaDni(MIN_DNI).maksDzwignia
    for (let dni = MIN_DNI + 1; dni <= MAX_DNI; dni++) {
      const d = profilDlaDni(dni).maksDzwignia
      expect(d).toBeLessThanOrEqual(pop)
      pop = d
    }
  })

  it('krańce osi pokrywają się ze stałymi profilami tam, gdzie powinny', () => {
    const krotki = profilDlaDni(MIN_DNI)
    const dlugi = profilDlaDni(MAX_DNI)
    expect(krotki.celeR).toEqual(PROFILE.krotki.celeR)
    expect(dlugi.celeR).toEqual(PROFILE.dlugi.celeR)
    expect(dlugi.mnoznikSL).toBeCloseTo(PROFILE.dlugi.mnoznikSL, 5)
    expect(krotki.minRR).toBe(PROFILE.krotki.minRR)
    expect(dlugi.minRR).toBe(PROFILE.dlugi.minRR)
  })

  it('okno swingu pod stop mieści się w 10–40 świecach bazowych', () => {
    for (let dni = MIN_DNI; dni <= MAX_DNI; dni++) {
      const okno = profilDlaDni(dni).oknoSwingu ?? 0
      expect(okno).toBeGreaterThanOrEqual(10)
      expect(okno).toBeLessThanOrEqual(40)
    }
  })
})

describe('profilDlaDni – wejście spoza zakresu', () => {
  it('przycina do 2–90 dni i zaokrągla', () => {
    expect(profilDlaDni(0).dniWlasne).toBe(MIN_DNI)
    expect(profilDlaDni(500).dniWlasne).toBe(MAX_DNI)
    expect(profilDlaDni(7.4).dniWlasne).toBe(7)
  })

  it('położenie na osi to 0 dla 2 dni i 1 dla 90 dni', () => {
    expect(polozenieHoryzontu(2)).toBeCloseTo(0, 9)
    expect(polozenieHoryzontu(90)).toBeCloseTo(1, 9)
    expect(polozenieHoryzontu(1)).toBeCloseTo(0, 9)
  })
})

describe('opisDni', () => {
  it('nazywa okrągłe okresy po ludzku', () => {
    expect(opisDni(7)).toBe('tydzień')
    expect(opisDni(14)).toBe('2 tygodnie')
    expect(opisDni(30)).toBe('miesiąc')
    expect(opisDni(90)).toBe('3 miesiące')
    expect(opisDni(5)).toBe('5 dni')
    expect(opisDni(45)).toBe('45 dni')
  })

  it('w dopełniaczu – po „do” i „dla”', () => {
    expect(opisDniDopelniacz(7)).toBe('tygodnia')
    expect(opisDniDopelniacz(14)).toBe('2 tygodni')
    expect(opisDniDopelniacz(30)).toBe('miesiąca')
    expect(opisDniDopelniacz(90)).toBe('3 miesięcy')
    expect(opisDniDopelniacz(5)).toBe('5 dni')
    expect(profilDlaDni(60).opisDlugosci).toBe('do 2 miesięcy')
  })
})
