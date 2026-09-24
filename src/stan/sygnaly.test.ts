import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analizuj } from '@/analiza/silnik'
import { MS_INTERWALU, PROFILE, profilDlaDni, type Interwal } from '@/analiza/profile'
import { PUSTE_STATYSTYKI } from '@/analiza/statystyki'
import { czySygnal, czyZGeneratora, PUSTY_KONTEKST, type Sygnal, type SwieceWgInterwalu } from '@/analiza/typy'
import type { Swieca } from '@/analiza/wskazniki'
import { uzyjRynku } from './rynek'
import { aktywnyDlaHoryzontu, aktywnyZGeneratora, nazwaSygnalu, uzyjSygnalow } from './sygnaly'
import { uzyjUstawien } from './ustawienia'

// W testach nie ma IndexedDB – baza po cichu nic nie zapisuje, a to nam wystarcza.
vi.spyOn(console, 'warn').mockImplementation(() => {})

/** Powtarzalny trend: świece dłuższe ruszają się mocniej, jak w błądzeniu losowym. */
function swiece(ile: number, interwal: Interwal, dryfNaGodzine: number, ziarno = 7): Swieca[] {
  const krok = MS_INTERWALU[interwal]
  const godzin = krok / 3_600_000
  const koniec = Date.now()
  let stan = ziarno
  const losuj = () => {
    stan = (stan * 1103515245 + 12345) & 0x7fffffff
    return stan / 0x7fffffff - 0.5
  }
  const out: Swieca[] = []
  let cena = 50_000
  for (let i = 0; i < ile; i++) {
    const otwarcie = cena
    cena *= 1 + dryfNaGodzine * godzin + losuj() * 0.004 * Math.sqrt(godzin)
    out.push({
      czas: koniec - (ile - i) * krok,
      o: otwarcie,
      h: Math.max(otwarcie, cena) * 1.001,
      l: Math.min(otwarcie, cena) * 0.999,
      c: cena,
      v: 100,
    })
  }
  return out
}

function wszystkieInterwaly(dryf: number): SwieceWgInterwalu {
  const out: SwieceWgInterwalu = {}
  for (const i of ['15m', '1h', '4h', '1d', '3d', '1w'] as Interwal[]) out[i] = swiece(400, i, dryf)
  return out
}

/** Sygnał z generatora z otwartą pozycją (chyba że `wypelniony` podano inaczej). */
function sygnalGeneratora(
  dni: number,
  swieceWg: SwieceWgInterwalu,
  teraz = Date.now(),
  wypelniony = true,
): Sygnal {
  const p = profilDlaDni(dni)
  const w = analizuj({ horyzont: p.id, swieceWg, naZadanie: true, profilWlasny: p, teraz })
  if (!czySygnal(w)) throw new Error('generator nie dał sygnału')
  return { ...w, wypelniony }
}

beforeEach(() => {
  uzyjSygnalow.setState({
    aktywne: [],
    historia: [],
    analizy: {},
    statystyki: PUSTE_STATYSTYKI,
    statystykiNaZadanie: PUSTE_STATYSTYKI,
    statystykiGeneratora: PUSTE_STATYSTYKI,
    swiezySygnal: null,
    liczenie: false,
  })
  uzyjUstawien.setState({ powiadomieniaSygnaly: false, powiadomieniaCele: false })
  uzyjRynku.setState({ cena: null, swieceWg: {} })
})

describe('sygnały z generatora – śledzenie', () => {
  const swieceWg = wszystkieInterwaly(0.0003)

  it('„Śledź” dodaje sygnał do aktywnych, ale nie jako sygnał stałego horyzontu', async () => {
    const s = sygnalGeneratora(14, swieceWg)
    await uzyjSygnalow.getState().sledz(s)

    const { aktywne } = uzyjSygnalow.getState()
    expect(aktywne.map((x) => x.id)).toEqual([s.id])
    expect(aktywnyZGeneratora(aktywne)?.id).toBe(s.id)
    expect(aktywnyDlaHoryzontu(aktywne, s.horyzont)).toBeNull()
  })

  it('nowy śledzony sygnał zamyka poprzedni po bieżącej cenie – nie znika bez śladu', async () => {
    const pierwszy = sygnalGeneratora(7, swieceWg, Date.now() - 60_000)
    await uzyjSygnalow.getState().sledz(pierwszy)

    // Cena poszła w stronę stopa o połowę ryzyka.
    const ryzyko = Math.abs(pierwszy.wejscie - pierwszy.stopLoss)
    const znak = pierwszy.kierunek === 'long' ? 1 : -1
    uzyjRynku.setState({ cena: pierwszy.wejscie - znak * ryzyko * 0.5 })

    const drugi = sygnalGeneratora(30, swieceWg)
    await uzyjSygnalow.getState().sledz(drugi)

    const { aktywne, historia, statystykiGeneratora, statystyki } = uzyjSygnalow.getState()
    expect(aktywne.map((x) => x.id)).toEqual([drugi.id])
    const zamkniety = historia.find((x) => x.id === pierwszy.id)
    expect(zamkniety?.status).toBe('uniewazniony')
    expect(zamkniety?.wynikR).toBeCloseTo(-0.5, 6)
    expect(zamkniety?.zdarzenia.at(-1)?.typ).toBe('uniewazniony')

    // Liczy się w statystykach generatora, a zwykłych nie rusza.
    expect(statystykiGeneratora.liczba).toBe(1)
    expect(statystyki.liczba).toBe(0)
  })

  it('zamknięcie po cenie za stopem liczy najwyżej −1R', async () => {
    const s = sygnalGeneratora(5, swieceWg)
    await uzyjSygnalow.getState().sledz(s)
    const ryzyko = Math.abs(s.wejscie - s.stopLoss)
    const znak = s.kierunek === 'long' ? 1 : -1
    uzyjRynku.setState({ cena: s.wejscie - znak * ryzyko * 3 })

    await uzyjSygnalow.getState().zakonczSledzenie(s.id)
    const { aktywne, historia } = uzyjSygnalow.getState()
    expect(aktywne).toHaveLength(0)
    expect(historia[0].wynikR).toBe(-1)
  })

  it('zastąpione zlecenie limit, które nie weszło, nie dostaje wyniku', async () => {
    const pierwszy = sygnalGeneratora(14, swieceWg, Date.now() - 60_000, false)
    await uzyjSygnalow.getState().sledz(pierwszy)
    // Cena daleko w stronę zysku – ale pozycji nigdy nie było.
    const znak = pierwszy.kierunek === 'long' ? 1 : -1
    uzyjRynku.setState({ cena: pierwszy.cele[1].cena + znak * 100 })

    await uzyjSygnalow.getState().sledz(sygnalGeneratora(30, swieceWg))
    const zamkniety = uzyjSygnalow.getState().historia.find((x) => x.id === pierwszy.id)
    expect(zamkniety?.status).toBe('uniewazniony')
    expect(zamkniety?.wynikR).toBeNull()
    expect(uzyjSygnalow.getState().statystykiGeneratora.liczba).toBe(0)
  })

  it('ten sam sygnał nie trafia do śledzenia dwa razy', async () => {
    const s = sygnalGeneratora(14, swieceWg)
    await uzyjSygnalow.getState().sledz(s)
    await uzyjSygnalow.getState().sledz(s)
    expect(uzyjSygnalow.getState().aktywne).toHaveLength(1)
    expect(uzyjSygnalow.getState().historia).toHaveLength(0)
  })

  it('zwykłego sygnału nie da się „śledzić” jak z generatora', async () => {
    const p = PROFILE.dlugi
    const zwykly = analizuj({ horyzont: 'dlugi', swieceWg: wszystkieInterwaly(0.00025) })
    if (!czySygnal(zwykly)) throw new Error('brak sygnału')
    expect(czyZGeneratora(zwykly)).toBe(false)
    await uzyjSygnalow.getState().sledz(zwykly)
    expect(uzyjSygnalow.getState().aktywne).toHaveLength(0)
    expect(p.id).toBe('dlugi')
  })
})

describe('sygnały z generatora nie blokują kart krótki/długi', () => {
  it('aktywny sygnał z generatora (horyzont „długi”) nie wstrzymuje zwykłego sygnału długiego', async () => {
    const swieceWg = wszystkieInterwaly(0.00025)
    uzyjRynku.setState({ swieceWg })

    // Kontrola: bez generatora silnik sam wystawia sygnał długi na tych danych.
    const kontrolny = analizuj({ horyzont: 'dlugi', swieceWg })
    expect(czySygnal(kontrolny)).toBe(true)

    const zGeneratora = sygnalGeneratora(30, swieceWg)
    expect(zGeneratora.horyzont).toBe('dlugi')
    await uzyjSygnalow.getState().sledz(zGeneratora)

    await uzyjSygnalow.getState().przelicz('dlugi', PUSTY_KONTEKST)

    const { aktywne } = uzyjSygnalow.getState()
    const zwykly = aktywnyDlaHoryzontu(aktywne, 'dlugi')
    expect(zwykly).not.toBeNull()
    expect(czyZGeneratora(zwykly!)).toBe(false)
    expect(aktywnyZGeneratora(aktywne)?.id).toBe(zGeneratora.id)
  })
})

describe('nazwy sygnałów w powiadomieniach', () => {
  it('rozróżnia generator od stałych horyzontów', () => {
    const swieceWg = wszystkieInterwaly(0.0003)
    expect(nazwaSygnalu(sygnalGeneratora(14, swieceWg))).toBe('generator · 2 tygodnie')
    const zwykly = { ...sygnalGeneratora(14, swieceWg), dniHoryzontu: undefined, horyzont: 'krotki' as const }
    expect(nazwaSygnalu(zwykly)).toBe('krótki termin')
  })
})
