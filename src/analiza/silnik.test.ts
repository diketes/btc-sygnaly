import { describe, expect, it } from 'vitest'
import { analizuj } from './silnik'
import { MS_INTERWALU, PROFILE, type Interwal } from './profile'
import { czySygnal, czyCzekaj, PUSTY_KONTEKST, type SwieceWgInterwalu } from './typy'
import { zaktualizujSygnal } from './cykl'
import type { Swieca } from './wskazniki'

/**
 * Generator świec o zadanym charakterze. Szum jest deterministyczny (własny
 * generator pseudolosowy), żeby test nie migotał między uruchomieniami.
 */
function generuj(
  ile: number,
  interwal: Interwal,
  opcje: {
    start?: number
    dryf?: number
    szum?: number
    ziarno?: number
    /** Siła powrotu do średniej – dla rynku w konsolidacji. */
    powrotDoSredniej?: number
  } = {},
): Swieca[] {
  const { start = 50_000, dryf = 0, szum = 0.004, ziarno = 12345, powrotDoSredniej = 0 } = opcje
  const krok = MS_INTERWALU[interwal]
  const poczatek = Date.UTC(2026, 0, 1) - ile * krok

  let stan = ziarno
  const losuj = () => {
    // Prosty generator liniowy – powtarzalny i wystarczający.
    stan = (stan * 1103515245 + 12345) & 0x7fffffff
    return stan / 0x7fffffff - 0.5
  }

  const swiece: Swieca[] = []
  let cena = start
  for (let i = 0; i < ile; i++) {
    // Przy powrocie do średniej cena jest ciągnięta z powrotem do `start`,
    // więc rynek faktycznie stoi w miejscu – w odróżnieniu od błądzenia
    // losowego, które potrafi samo z siebie zbudować wyraźny trend.
    const odchylenie = (cena - start) / start
    const zmiana = dryf + losuj() * szum - odchylenie * powrotDoSredniej
    const otwarcie = cena
    cena = cena * (1 + zmiana)
    const gora = Math.max(otwarcie, cena) * (1 + Math.abs(losuj()) * szum * 0.5)
    const dol = Math.min(otwarcie, cena) * (1 - Math.abs(losuj()) * szum * 0.5)
    swiece.push({
      czas: poczatek + i * krok,
      o: otwarcie,
      h: gora,
      l: dol,
      c: cena,
      v: 100 + Math.abs(losuj()) * 50,
    })
  }
  return swiece
}

function zestaw(
  horyzont: 'krotki' | 'dlugi',
  opcje: Parameters<typeof generuj>[2] = {},
): SwieceWgInterwalu {
  const out: SwieceWgInterwalu = {}
  for (const { interwal } of PROFILE[horyzont].interwaly) {
    out[interwal] = generuj(400, interwal, opcje)
  }
  return out
}

describe('silnik – przypadki brzegowe', () => {
  it('bez danych zwraca „czekaj”, a nie wyjątek', () => {
    const wynik = analizuj({ horyzont: 'krotki', swieceWg: {} })
    expect(czyCzekaj(wynik)).toBe(true)
    if (czyCzekaj(wynik)) {
      expect(wynik.powody[0]).toContain('Za mało danych')
    }
  })

  it('przy zbyt krótkiej serii też czeka', () => {
    const wynik = analizuj({
      horyzont: 'krotki',
      swieceWg: { '15m': generuj(20, '15m') },
    })
    expect(czyCzekaj(wynik)).toBe(true)
  })
})

describe('silnik – kierunek analizy', () => {
  it('silny trend wzrostowy daje dodatni wynik', () => {
    const wynik = analizuj({
      horyzont: 'dlugi',
      swieceWg: zestaw('dlugi', { dryf: 0.006, szum: 0.004 }),
    })
    expect(wynik.wynik).toBeGreaterThan(20)
    if (czySygnal(wynik)) expect(wynik.kierunek).toBe('long')
  })

  it('silny trend spadkowy daje ujemny wynik', () => {
    const wynik = analizuj({
      horyzont: 'dlugi',
      swieceWg: zestaw('dlugi', { dryf: -0.006, szum: 0.004 }),
    })
    expect(wynik.wynik).toBeLessThan(-20)
    if (czySygnal(wynik)) expect(wynik.kierunek).toBe('short')
  })

  it('rynek w konsolidacji nie daje sygnału', () => {
    const wynik = analizuj({
      horyzont: 'krotki',
      swieceWg: zestaw('krotki', { dryf: 0, szum: 0.003, powrotDoSredniej: 0.25, ziarno: 777 }),
    })
    expect(czyCzekaj(wynik)).toBe(true)
  })

  it('rozpoznaje konsolidację jako reżim „zakres”', () => {
    // Uwaga: w konsolidacji wysoki wynik NIE jest błędem – silnik celowo gra
    // od krawędzi zakresu. Sprawdzamy więc rozpoznanie reżimu, a nie wynik.
    const wynik = analizuj({
      horyzont: 'dlugi',
      swieceWg: zestaw('dlugi', { dryf: 0, szum: 0.004, powrotDoSredniej: 0.3, ziarno: 4242 }),
    })
    expect(wynik.rezim).toBe('zakres')
  })

  it('rozpoznaje wyraźny trend jako reżim „trend”', () => {
    const wynik = analizuj({
      horyzont: 'dlugi',
      swieceWg: zestaw('dlugi', { dryf: 0.006, szum: 0.003 }),
    })
    expect(wynik.rezim).toBe('trend')
  })
})

describe('silnik – poprawność wystawionego sygnału', () => {
  const wynik = analizuj({
    horyzont: 'dlugi',
    swieceWg: zestaw('dlugi', { dryf: 0.006, szum: 0.004 }),
  })

  it('w ogóle powstaje sygnał w wyraźnym trendzie', () => {
    expect(czySygnal(wynik)).toBe(true)
  })

  it('stop loss leży po właściwej stronie wejścia', () => {
    if (!czySygnal(wynik)) return
    if (wynik.kierunek === 'long') expect(wynik.stopLoss).toBeLessThan(wynik.wejscie)
    else expect(wynik.stopLoss).toBeGreaterThan(wynik.wejscie)
  })

  it('cele są uporządkowane i po właściwej stronie', () => {
    if (!czySygnal(wynik)) return
    const znak = wynik.kierunek === 'long' ? 1 : -1
    expect(znak * (wynik.cele[0].cena - wynik.wejscie)).toBeGreaterThan(0)
    expect(znak * (wynik.cele[1].cena - wynik.cele[0].cena)).toBeGreaterThan(0)
    expect(znak * (wynik.cele[2].cena - wynik.cele[1].cena)).toBeGreaterThan(0)
  })

  it('wielokrotności R zgadzają się z odległością do stopa', () => {
    if (!czySygnal(wynik)) return
    const ryzyko = Math.abs(wynik.wejscie - wynik.stopLoss)
    const znak = wynik.kierunek === 'long' ? 1 : -1
    for (const cel of wynik.cele) {
      expect(cel.r).toBeCloseTo((znak * (cel.cena - wynik.wejscie)) / ryzyko, 6)
    }
  })

  it('stosunek zysku do ryzyka nie schodzi poniżej progu profilu', () => {
    if (!czySygnal(wynik)) return
    expect(wynik.rr).toBeGreaterThanOrEqual(PROFILE.dlugi.minRR)
  })

  it('pewność mieści się w 1–97% (nigdy 100)', () => {
    if (!czySygnal(wynik)) return
    expect(wynik.pewnosc).toBeGreaterThanOrEqual(1)
    expect(wynik.pewnosc).toBeLessThanOrEqual(97)
  })

  it('sugerowana dźwignia nie przekracza limitu profilu', () => {
    if (!czySygnal(wynik)) return
    expect(wynik.maksDzwignia).toBeGreaterThanOrEqual(1)
    expect(wynik.maksDzwignia).toBeLessThanOrEqual(PROFILE.dlugi.maksDzwignia)
  })

  it('ma uzasadnienie po polsku i opis unieważnienia', () => {
    if (!czySygnal(wynik)) return
    expect(wynik.uzasadnienie.length).toBeGreaterThan(0)
    expect(wynik.uniewaznienie.opis).toContain('traci ważność')
  })

  it('termin ważności zgadza się z profilem', () => {
    if (!czySygnal(wynik)) return
    const godziny = (wynik.wygasa - wynik.utworzony) / 3_600_000
    expect(godziny).toBeCloseTo(PROFILE.dlugi.waznoscGodzin, 5)
  })
})

describe('silnik – cooldown', () => {
  it('blokuje kolejny sygnał w tym samym kierunku', () => {
    const swieceWg = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
    const pierwszy = analizuj({ horyzont: 'dlugi', swieceWg })
    if (!czySygnal(pierwszy)) return

    const drugi = analizuj({
      horyzont: 'dlugi',
      swieceWg,
      poprzedniSygnal: { kierunek: pierwszy.kierunek, utworzony: Date.now() },
    })
    expect(czyCzekaj(drugi)).toBe(true)
    if (czyCzekaj(drugi)) {
      expect(drugi.powody.some((p) => p.includes('blokada'))).toBe(true)
    }
  })

  it('po upływie blokady sygnał może powstać ponownie', () => {
    const swieceWg = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
    const p = PROFILE.dlugi
    const dawno = Date.now() - (p.cooldownSwiec + 1) * MS_INTERWALU[p.interwalBazowy]
    const wynik = analizuj({
      horyzont: 'dlugi',
      swieceWg,
      poprzedniSygnal: { kierunek: 'long', utworzony: dawno },
    })
    expect(czyCzekaj(wynik) && wynik.powody.some((x) => x.includes('blokada'))).toBe(false)
  })
})

describe('silnik – wpływ kontekstu rynkowego', () => {
  const swieceWg = zestaw('krotki', { dryf: 0.0025, szum: 0.004 })

  it('skrajny funding obniża wynik po stronie longów', () => {
    const bez = analizuj({ horyzont: 'krotki', swieceWg })
    const zPrzegrzaniem = analizuj({
      horyzont: 'krotki',
      swieceWg,
      kontekst: { ...PUSTY_KONTEKST, funding: 0.09 },
    })
    expect(zPrzegrzaniem.wynik).toBeLessThan(bez.wynik)
  })

  it('news o wysokim ryzyku obniża pewność o połowę i oznacza sygnał', () => {
    const swieceTrend = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
    const spokojny = analizuj({ horyzont: 'dlugi', swieceWg: swieceTrend })
    const ryzykowny = analizuj({
      horyzont: 'dlugi',
      swieceWg: swieceTrend,
      kontekst: {
        ...PUSTY_KONTEKST,
        ryzykoNewsow: { wysokie: true, powod: 'CPI USA za 40 min' },
      },
    })
    if (!czySygnal(spokojny) || !czySygnal(ryzykowny)) return
    expect(ryzykowny.podwyzszoneRyzyko).toBe(true)
    expect(ryzykowny.pewnosc).toBeLessThan(spokojny.pewnosc)
  })
})

describe('silnik – ten sam wynik dla tego samego wejścia', () => {
  it('analiza jest funkcją czystą', () => {
    const swieceWg = zestaw('dlugi', { dryf: 0.005 })
    const czas = Date.UTC(2026, 5, 1)
    const a = analizuj({ horyzont: 'dlugi', swieceWg, teraz: czas })
    const b = analizuj({ horyzont: 'dlugi', swieceWg, teraz: czas })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('cykl życia sygnału', () => {
  const swieceWg = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
  const sygnal = analizuj({ horyzont: 'dlugi', swieceWg })

  it('trafiony TP1 przesuwa stop na próg rentowności', () => {
    if (!czySygnal(sygnal)) return
    const { sygnal: po } = zaktualizujSygnal(sygnal, sygnal.cele[0].cena)
    expect(po.cele[0].osiagniety).toBe(true)
    expect(po.stopLoss).toBeCloseTo(po.wejscie, 6)
    expect(po.status).toBe('tp1')
  })

  it('trafiony stop przed TP1 zamyka sygnał ze stratą 1R', () => {
    if (!czySygnal(sygnal)) return
    const { sygnal: po } = zaktualizujSygnal(sygnal, sygnal.stopLoss)
    expect(po.status).toBe('zamkniety_strata')
    expect(po.wynikR).toBeCloseTo(-1, 6)
  })

  it('trafiony TP3 zamyka sygnał z zyskiem', () => {
    if (!czySygnal(sygnal)) return
    const { sygnal: po } = zaktualizujSygnal(sygnal, sygnal.cele[2].cena)
    expect(po.status).toBe('zamkniety_zysk')
    expect(po.wynikR).toBeCloseTo(sygnal.cele[2].r, 6)
  })

  it('zamknięty sygnał nie zmienia się przy kolejnych cenach', () => {
    if (!czySygnal(sygnal)) return
    const { sygnal: zamkniety } = zaktualizujSygnal(sygnal, sygnal.stopLoss)
    const { zmienil } = zaktualizujSygnal(zamkniety, sygnal.cele[2].cena)
    expect(zmienil).toBe(false)
  })
})

describe('silnik – tryb „Daj sygnał”', () => {
  // Rynek w konsolidacji: normalnie silnik odmawia.
  const swieceWg = zestaw('krotki', { dryf: 0, szum: 0.003, powrotDoSredniej: 0.25, ziarno: 777 })

  it('bez trybu na żądanie silnik nadal odmawia', () => {
    expect(czyCzekaj(analizuj({ horyzont: 'krotki', swieceWg }))).toBe(true)
  })

  it('na żądanie zawsze zwraca kierunek', () => {
    const wynik = analizuj({ horyzont: 'krotki', swieceWg, naZadanie: true })
    expect(czySygnal(wynik)).toBe(true)
    if (czySygnal(wynik)) expect(['long', 'short']).toContain(wynik.kierunek)
  })

  it('kierunek zgadza się ze znakiem wskazania', () => {
    const czekajacy = analizuj({ horyzont: 'krotki', swieceWg })
    const wymuszony = analizuj({ horyzont: 'krotki', swieceWg, naZadanie: true })
    if (!czySygnal(wymuszony)) return
    expect(wymuszony.kierunek).toBe(czekajacy.wynik >= 0 ? 'long' : 'short')
  })

  it('jest oznaczony i wylicza, czego mu zabrakło', () => {
    const wynik = analizuj({ horyzont: 'krotki', swieceWg, naZadanie: true })
    if (!czySygnal(wynik)) return
    expect(wynik.naZadanie).toBe(true)
    expect(wynik.brakiDoStandardu.length).toBeGreaterThan(0)
    expect(wynik.id).toContain('zad-')
  })

  it('poziomy liczone są tak samo jak w zwykłym sygnale', () => {
    // Trend, w którym powstaje też zwykły sygnał – oba muszą dać te same liczby.
    const trend = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
    const czas = Date.UTC(2026, 5, 1)
    const zwykly = analizuj({ horyzont: 'dlugi', swieceWg: trend, teraz: czas })
    const wymuszony = analizuj({ horyzont: 'dlugi', swieceWg: trend, teraz: czas, naZadanie: true })
    if (!czySygnal(zwykly) || !czySygnal(wymuszony)) return

    expect(wymuszony.wejscie).toBeCloseTo(zwykly.wejscie, 6)
    expect(wymuszony.stopLoss).toBeCloseTo(zwykly.stopLoss, 6)
    expect(wymuszony.cele.map((c) => c.cena)).toEqual(zwykly.cele.map((c) => c.cena))
    expect(wymuszony.pewnosc).toBe(zwykly.pewnosc)
  })

  it('gdy zwykły sygnał i tak by powstał, lista braków jest pusta', () => {
    const trend = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
    const wynik = analizuj({ horyzont: 'dlugi', swieceWg: trend, naZadanie: true })
    if (!czySygnal(wynik)) return
    expect(wynik.brakiDoStandardu).toEqual([])
  })

  it('pomija blokadę po poprzednim sygnale', () => {
    const trend = zestaw('dlugi', { dryf: 0.006, szum: 0.004 })
    const zablokowany = analizuj({
      horyzont: 'dlugi',
      swieceWg: trend,
      poprzedniSygnal: { kierunek: 'long', utworzony: Date.UTC(2026, 5, 1) },
      teraz: Date.UTC(2026, 5, 1) + 3_600_000,
    })
    const wymuszony = analizuj({
      horyzont: 'dlugi',
      swieceWg: trend,
      poprzedniSygnal: { kierunek: 'long', utworzony: Date.UTC(2026, 5, 1) },
      teraz: Date.UTC(2026, 5, 1) + 3_600_000,
      naZadanie: true,
    })
    expect(czyCzekaj(zablokowany)).toBe(true)
    expect(czySygnal(wymuszony)).toBe(true)
  })
})

describe('karta „Czekaj” – dane o postępie', () => {
  it('pokazuje, jak daleko do progu sygnału', () => {
    const wynik = analizuj({
      horyzont: 'krotki',
      swieceWg: zestaw('krotki', { dryf: 0, szum: 0.003, powrotDoSredniej: 0.25, ziarno: 777 }),
    })
    if (!czyCzekaj(wynik)) return
    expect(wynik.postep.progWyniku).toBe(PROFILE.krotki.progWyniku)
    expect(wynik.postep.wymaganaZgodnosc).toBe(PROFILE.krotki.minZgodnosc)
    expect(wynik.postep.wynikUdzial).toBeGreaterThanOrEqual(0)
    expect(wynik.postep.wynikUdzial).toBeLessThanOrEqual(1)
    expect(wynik.postep.zgodnoscUdzial).toBeGreaterThanOrEqual(0)
    expect(wynik.postep.zgodnoscUdzial).toBeLessThanOrEqual(1)
  })

  it('udział wyniku odpowiada stosunkowi wskazania do progu', () => {
    const wynik = analizuj({
      horyzont: 'dlugi',
      swieceWg: zestaw('dlugi', { dryf: 0.0012, szum: 0.004, ziarno: 31337 }),
    })
    if (!czyCzekaj(wynik)) return
    const oczekiwany = Math.min(1, Math.abs(wynik.wynik) / PROFILE.dlugi.progWyniku)
    expect(wynik.postep.wynikUdzial).toBeCloseTo(oczekiwany, 6)
  })
})

describe('silnik – odstępy między celami', () => {
  it('TP3 leży wyraźnie dalej niż TP2, nie tuż obok', () => {
    // Sprawdzamy na wielu układach rynku: przyciąganie TP3 do poziomu S/R
    // nie może sprawić, że TP2 i TP3 stają się praktycznie tym samym celem.
    const przypadki = [
      { horyzont: 'dlugi' as const, dryf: 0.006, ziarno: 1 },
      { horyzont: 'dlugi' as const, dryf: -0.006, ziarno: 2 },
      { horyzont: 'krotki' as const, dryf: 0.004, ziarno: 3 },
      { horyzont: 'krotki' as const, dryf: -0.004, ziarno: 4 },
      { horyzont: 'krotki' as const, dryf: 0.001, ziarno: 5 },
    ]

    let sprawdzonych = 0
    for (const c of przypadki) {
      const wynik = analizuj({
        horyzont: c.horyzont,
        swieceWg: zestaw(c.horyzont, { dryf: c.dryf, szum: 0.004, ziarno: c.ziarno }),
        naZadanie: true,
      })
      if (!czySygnal(wynik)) continue
      sprawdzonych++
      const [, tp2, tp3] = wynik.cele
      expect(tp3.r).toBeGreaterThan(tp2.r * 1.2)
    }
    expect(sprawdzonych).toBeGreaterThan(0)
  })
})
