import { describe, expect, it } from 'vitest'
import {
  HISTORIA_GENERATORA,
  historiaDlaDni,
  ocenaPrzewagi,
  odsetekNiewypelnionych,
  wielkoscProby,
  type WynikWariantu,
} from './historiaGeneratora'
import { MAX_DNI, MIN_DNI, profilDlaDni } from './profile'

const wynik = (zmiany: Partial<WynikWariantu>): WynikWariantu => ({
  transakcji: 100,
  naRok: 50,
  skutecznosc: 45,
  sredniR: 0.2,
  sumaR: 20,
  profitFactor: 1.4,
  maksObsuniecie: 8,
  trafienieTp1: 40,
  niewypelnione: 0,
  przedzialR: [0.05, 0.35],
  ...zmiany,
})

describe('historia generatora – dane dołączone do aplikacji', () => {
  it('pokrywa cały zakres suwaka i zgadza się z profilami', () => {
    const dni = HISTORIA_GENERATORA.horyzonty.map((h) => h.dni)
    expect(Math.min(...dni)).toBe(MIN_DNI)
    expect(Math.max(...dni)).toBe(MAX_DNI)
    for (const h of HISTORIA_GENERATORA.horyzonty) {
      // Gdy profile się zmienią, a backtestu nikt nie powtórzy – ten test to wyłapie.
      expect(h.interwalBazowy, `${h.dni} dni`).toBe(profilDlaDni(h.dni).interwalBazowy)
      for (const w of [h.naZadanie, h.zProgami]) {
        if (w.przedzialR) expect(w.przedzialR[0]).toBeLessThanOrEqual(w.przedzialR[1])
        expect(w.skutecznosc).toBeGreaterThanOrEqual(0)
        expect(w.skutecznosc).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('historia generatora – najbliższy horyzont', () => {
  it('dokładne trafienie w siatkę', () => {
    expect(historiaDlaDni(14)?.dni).toBe(14)
    expect(historiaDlaDni(90)?.dni).toBe(90)
  })

  it('odległość liczona logarytmicznie, jak na suwaku', () => {
    expect(historiaDlaDni(25)?.dni).toBe(21)
    expect(historiaDlaDni(26)?.dni).toBe(30)
    // 37 dni: liniowo bliżej 30 (7 vs 8), logarytmicznie bliżej 45:
    // ln(37/30)=0,210 > ln(45/37)=0,196.
    expect(historiaDlaDni(37)?.dni).toBe(45)
  })
})

describe('historia generatora – oceny', () => {
  it('przewaga potwierdzona tylko przy dolnej granicy przedziału powyżej zera', () => {
    expect(ocenaPrzewagi(wynik({}))).toBe('potwierdzona')
    expect(ocenaPrzewagi(wynik({ przedzialR: [-0.1, 0.5] }))).toBe('niepewna')
    expect(ocenaPrzewagi(wynik({ sredniR: -0.05, przedzialR: [-0.2, 0.1] }))).toBe('brak')
    expect(ocenaPrzewagi(wynik({ transakcji: 0 }))).toBe('brak')
    expect(ocenaPrzewagi(wynik({ przedzialR: null }))).toBe('niepewna')
  })

  it('wielkość próby', () => {
    expect(wielkoscProby(9)).toBe('mala')
    expect(wielkoscProby(30)).toBe('srednia')
    expect(wielkoscProby(99)).toBe('srednia')
    expect(wielkoscProby(100)).toBe('duza')
  })

  it('odsetek sygnałów bez wejścia', () => {
    expect(odsetekNiewypelnionych(wynik({ transakcji: 25, niewypelnione: 75 }))).toBe(75)
    expect(odsetekNiewypelnionych(wynik({ transakcji: 0, niewypelnione: 0 }))).toBe(0)
  })
})
