/**
 * Struktura rynku: pivoty swingowe, poziomy wsparcia/oporu, zniesienia Fibonacciego
 * i profil wolumenu (POC / VAH / VAL).
 */

import type { Swieca } from './wskazniki'

export interface Pivot {
  indeks: number
  czas: number
  cena: number
  typ: 'szczyt' | 'dolek'
}

export interface Poziom {
  cena: number
  /** Ile pivotów utworzyło ten poziom – im więcej, tym mocniejszy. */
  dotkniecia: number
  /** 0–100; uwzględnia liczbę dotknięć, świeżość i wolumen. */
  sila: number
  typ: 'wsparcie' | 'opor'
  ostatnioCzas: number
}

/**
 * Pivoty fraktalne: świeca jest szczytem, gdy jej maksimum jest najwyższe
 * w oknie `promien` świec po obu stronach.
 */
export function pivoty(swiece: readonly Swieca[], promien = 2): Pivot[] {
  const out: Pivot[] = []
  for (let i = promien; i < swiece.length - promien; i++) {
    let szczyt = true
    let dolek = true
    for (let j = i - promien; j <= i + promien; j++) {
      if (j === i) continue
      if (swiece[j].h >= swiece[i].h) szczyt = false
      if (swiece[j].l <= swiece[i].l) dolek = false
    }
    if (szczyt) out.push({ indeks: i, czas: swiece[i].czas, cena: swiece[i].h, typ: 'szczyt' })
    if (dolek) out.push({ indeks: i, czas: swiece[i].czas, cena: swiece[i].l, typ: 'dolek' })
  }
  return out
}

/**
 * Klastrowanie pivotów w poziomy S/R z tolerancją procentową.
 * Poziomy powyżej ceny bieżącej to opory, poniżej – wsparcia.
 */
export function poziomy(
  swiece: readonly Swieca[],
  cenaBiezaca: number,
  opcje: { promien?: number; tolerancjaProc?: number; maks?: number } = {},
): Poziom[] {
  const { promien = 2, tolerancjaProc = 0.25, maks = 12 } = opcje
  const p = pivoty(swiece, promien)
  if (p.length === 0) return []

  const posortowane = [...p].sort((a, b) => a.cena - b.cena)
  const klastry: Pivot[][] = []
  let biezacy: Pivot[] = [posortowane[0]]

  for (let i = 1; i < posortowane.length; i++) {
    const srednia = biezacy.reduce((a, x) => a + x.cena, 0) / biezacy.length
    const roznicaProc = (Math.abs(posortowane[i].cena - srednia) / srednia) * 100
    if (roznicaProc <= tolerancjaProc) {
      biezacy.push(posortowane[i])
    } else {
      klastry.push(biezacy)
      biezacy = [posortowane[i]]
    }
  }
  klastry.push(biezacy)

  const teraz = swiece[swiece.length - 1].czas
  const najstarszy = swiece[0].czas
  const rozpietoscCzasu = Math.max(1, teraz - najstarszy)

  const wynik: Poziom[] = klastry.map((k) => {
    const cena = k.reduce((a, x) => a + x.cena, 0) / k.length
    const ostatnioCzas = Math.max(...k.map((x) => x.czas))
    const swiezosc = (ostatnioCzas - najstarszy) / rozpietoscCzasu // 0..1
    const sila = Math.min(100, k.length * 22 + swiezosc * 34)
    return {
      cena,
      dotkniecia: k.length,
      sila,
      typ: cena >= cenaBiezaca ? ('opor' as const) : ('wsparcie' as const),
      ostatnioCzas,
    }
  })

  // Najbliższe cenie i najmocniejsze – najważniejsze.
  return wynik
    .sort((a, b) => {
      const odlA = Math.abs(a.cena - cenaBiezaca) / cenaBiezaca
      const odlB = Math.abs(b.cena - cenaBiezaca) / cenaBiezaca
      return odlA * 100 - a.sila / 40 - (odlB * 100 - b.sila / 40)
    })
    .slice(0, maks)
}

/** Najbliższe wsparcie poniżej ceny (lub null). */
export function najblizszeWsparcie(lista: readonly Poziom[], cena: number): Poziom | null {
  const kandydaci = lista.filter((p) => p.cena < cena).sort((a, b) => b.cena - a.cena)
  return kandydaci[0] ?? null
}

/** Najbliższy opór powyżej ceny (lub null). */
export function najblizszyOpor(lista: readonly Poziom[], cena: number): Poziom | null {
  const kandydaci = lista.filter((p) => p.cena > cena).sort((a, b) => a.cena - b.cena)
  return kandydaci[0] ?? null
}

export interface Impuls {
  odCzas: number
  doCzas: number
  odCena: number
  doCena: number
  kierunek: 'wzrost' | 'spadek'
}

/** Ostatni wyraźny impuls cenowy (od ostatniego przeciwstawnego pivota do skrajności). */
export function ostatniImpuls(swiece: readonly Swieca[], promien = 3): Impuls | null {
  const p = pivoty(swiece, promien)
  if (p.length < 2) return null
  const ost = p[p.length - 1]
  // Szukamy wstecz pivota przeciwnego typu.
  for (let i = p.length - 2; i >= 0; i--) {
    if (p[i].typ !== ost.typ) {
      return {
        odCzas: p[i].czas,
        doCzas: ost.czas,
        odCena: p[i].cena,
        doCena: ost.cena,
        kierunek: ost.cena > p[i].cena ? 'wzrost' : 'spadek',
      }
    }
  }
  return null
}

export interface PoziomFibo {
  etykieta: string
  wspolczynnik: number
  cena: number
}

export function fibo(impuls: Impuls): PoziomFibo[] {
  const wspolczynniki = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1, 1.272, 1.618]
  const rozpietosc = impuls.doCena - impuls.odCena
  return wspolczynniki.map((w) => ({
    etykieta: `${(w * 100).toFixed(1).replace(/\.0$/, '')}%`,
    wspolczynnik: w,
    cena: impuls.doCena - rozpietosc * w,
  }))
}

export interface ProfilWolumenu {
  /** Point of Control – cena z największym wolumenem. */
  poc: number
  /** Górna granica obszaru wartości (70% wolumenu). */
  vah: number
  /** Dolna granica obszaru wartości. */
  val: number
  kubelki: { cena: number; wolumen: number }[]
}

export function profilWolumenu(swiece: readonly Swieca[], liczbaKubelkow = 48): ProfilWolumenu | null {
  if (swiece.length < 10) return null
  let min = Infinity
  let max = -Infinity
  for (const s of swiece) {
    if (s.l < min) min = s.l
    if (s.h > max) max = s.h
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null

  const krok = (max - min) / liczbaKubelkow
  const kubelki = new Array<number>(liczbaKubelkow).fill(0)

  // Wolumen świecy rozkładamy równomiernie na kubełki objęte jej zakresem.
  for (const s of swiece) {
    const odI = Math.max(0, Math.floor((s.l - min) / krok))
    const doI = Math.min(liczbaKubelkow - 1, Math.floor((s.h - min) / krok))
    const ile = doI - odI + 1
    const czesc = s.v / ile
    for (let i = odI; i <= doI; i++) kubelki[i] += czesc
  }

  let indeksPoc = 0
  for (let i = 1; i < kubelki.length; i++) if (kubelki[i] > kubelki[indeksPoc]) indeksPoc = i

  const calosc = kubelki.reduce((a, b) => a + b, 0)
  const cel = calosc * 0.7
  let dol = indeksPoc
  let gora = indeksPoc
  let zebrane = kubelki[indeksPoc]
  while (zebrane < cel && (dol > 0 || gora < kubelki.length - 1)) {
    const wDol = dol > 0 ? kubelki[dol - 1] : -1
    const wGore = gora < kubelki.length - 1 ? kubelki[gora + 1] : -1
    if (wGore >= wDol) {
      gora++
      zebrane += Math.max(0, wGore)
    } else {
      dol--
      zebrane += Math.max(0, wDol)
    }
  }

  const cenaKubelka = (i: number) => min + krok * (i + 0.5)
  return {
    poc: cenaKubelka(indeksPoc),
    vah: cenaKubelka(gora),
    val: cenaKubelka(dol),
    kubelki: kubelki.map((w, i) => ({ cena: cenaKubelka(i), wolumen: w })),
  }
}

export type StrukturaTrendu = 'wzrostowa' | 'spadkowa' | 'boczna'

/**
 * Struktura wyższych szczytów / wyższych dołków (HH-HL) lub odwrotnie.
 * Patrzy na 3 ostatnie szczyty i 3 ostatnie dołki.
 */
export function strukturaTrendu(swiece: readonly Swieca[], promien = 3): StrukturaTrendu {
  const p = pivoty(swiece, promien)
  const szczyty = p.filter((x) => x.typ === 'szczyt').slice(-3)
  const dolki = p.filter((x) => x.typ === 'dolek').slice(-3)
  if (szczyty.length < 2 || dolki.length < 2) return 'boczna'

  const szczytyRosna = szczyty[szczyty.length - 1].cena > szczyty[szczyty.length - 2].cena
  const dolkiRosna = dolki[dolki.length - 1].cena > dolki[dolki.length - 2].cena

  if (szczytyRosna && dolkiRosna) return 'wzrostowa'
  if (!szczytyRosna && !dolkiRosna) return 'spadkowa'
  return 'boczna'
}
