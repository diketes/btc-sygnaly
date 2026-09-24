/**
 * Backtest generatora sygnałów dla siatki horyzontów 2–90 dni.
 *
 * Dla każdego horyzontu liczymy dwa warianty:
 *  • „na żądanie” – sygnał brany za każdym razem, gdy nie ma otwartej pozycji.
 *    Tak działa przycisk „Wygeneruj sygnał”: zawsze daje kierunek, więc to
 *    uczciwy obraz tego, co dostaje ktoś, kto naciska go w dowolnym momencie,
 *  • „z progami” – tylko wtedy, gdy silnik sam widział przewagę (te same progi,
 *    co w zwykłych sygnałach). Pokazuje, ile daje czekanie na lepszy moment.
 *
 * Wynik trafia do `src/analiza/historiaGeneratora.json` i jest pokazywany
 * w aplikacji przy wybranym horyzoncie.
 *
 * Uruchomienie: npm run backtest:generator  (opcjonalnie liczba lat, domyślnie 2)
 *
 * Uwaga: skrypt ciągnie dane z Binance, a Binance blokuje adresy z USA –
 * dlatego nie da się go puścić w GitHub Actions. Liczony lokalnie, wynik
 * jest w repozytorium razem z datą i zakresem danych.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analizuj } from '../src/analiza/silnik'
import { profilDlaDni, type Interwal, type ProfilHoryzontu } from '../src/analiza/profile'
import { czySygnal, type SwieceWgInterwalu } from '../src/analiza/typy'
import type { Swieca } from '../src/analiza/wskazniki'
import { doCzasu, formatujData, kolor, MS, pobierzHistorie } from './wspolne'
import { symuluj, type WynikSymulacji } from './symulacja'

const SIATKA = [2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90]
const lata = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 2)

export interface WynikWariantu {
  transakcji: number
  naRok: number
  skutecznosc: number
  sredniR: number
  sumaR: number
  profitFactor: number | null
  maksObsuniecie: number
  trafienieTp1: number
  niewypelnione: number
  /**
   * 95-procentowy przedział ufności średniego wyniku w R. Jeśli dolna granica
   * jest powyżej zera, przewaga jest mało prawdopodobna jako czysty przypadek.
   * Jeśli przedział obejmuje zero – wynik mieści się w granicach losowości.
   */
  przedzialR: [number, number] | null
}

// ------------------------------------------------------------------ dane

const teraz = Date.now()
const od = teraz - lata * 365 * MS['1d']

console.log(kolor.gruby(`\n=== Backtest generatora: ${SIATKA.join(', ')} dni, ${lata} lata danych ===\n`))

const potrzebne = new Set<Interwal>(['1h'])
for (const dni of SIATKA) for (const { interwal } of profilDlaDni(dni).interwaly) potrzebne.add(interwal)

const serie: Partial<Record<Interwal, Swieca[]>> = {}
for (const i of [...potrzebne].sort((a, b) => MS[a] - MS[b])) {
  // Rozbieg 260 świec przed oknem – EMA200 policzona od pierwszego kroku.
  const start = od - 260 * MS[i]
  process.stdout.write(kolor.szary(`  pobieram ${i}…\r`))
  serie[i] = await pobierzHistorie(i, start, teraz)
  console.log(kolor.szary(`  ${i.padEnd(4)} ${String(serie[i]!.length).padStart(6)} świec`))
}

// Przebieg ceny do rozliczania pozycji: świece godzinowe w oknie testu.
const sciezka = serie['1h']!.filter((s) => s.czas >= od)
console.log(kolor.szary(`\nOkno testu: ${formatujData(od)} – ${formatujData(teraz)}\n`))

// ------------------------------------------------------------------ symulacja

function podsumuj(wyniki: WynikSymulacji[], p: ProfilHoryzontu, dniOkna: number): WynikWariantu {
  const zawarte = wyniki.filter((w) => w.wypelniony)
  const niewypelnione = wyniki.length - zawarte.length
  if (zawarte.length === 0) {
    return {
      transakcji: 0,
      naRok: 0,
      skutecznosc: 0,
      sredniR: 0,
      sumaR: 0,
      profitFactor: null,
      maksObsuniecie: 0,
      trafienieTp1: 0,
      niewypelnione,
      przedzialR: null,
    }
  }

  // Odchylenie standardowe wyników – do przedziału ufności średniej.
  const sredniaR = zawarte.reduce((a, w) => a + w.wynikR, 0) / zawarte.length
  const wariancja =
    zawarte.length > 1
      ? zawarte.reduce((a, w) => a + (w.wynikR - sredniaR) ** 2, 0) / (zawarte.length - 1)
      : 0
  const blad = Math.sqrt(wariancja / zawarte.length)

  const sumaR = zawarte.reduce((a, w) => a + w.wynikR, 0)
  const zyski = zawarte.filter((w) => w.wynikR > 0).reduce((a, w) => a + w.wynikR, 0)
  const straty = -zawarte.filter((w) => w.wynikR < 0).reduce((a, w) => a + w.wynikR, 0)

  let kapital = 100
  let szczyt = 100
  let obsuniecie = 0
  for (const w of [...zawarte].sort((a, b) => a.zamkniecie - b.zamkniecie)) {
    kapital *= 1 + (w.wynikR * p.domyslneRyzykoProc) / 100
    szczyt = Math.max(szczyt, kapital)
    obsuniecie = Math.max(obsuniecie, ((szczyt - kapital) / szczyt) * 100)
  }

  const zaokr = (x: number, m = 2) => Math.round(x * 10 ** m) / 10 ** m
  return {
    transakcji: zawarte.length,
    naRok: zaokr((zawarte.length / dniOkna) * 365, 1),
    skutecznosc: zaokr((zawarte.filter((w) => w.wynikR > 0).length / zawarte.length) * 100, 1),
    sredniR: zaokr(sumaR / zawarte.length),
    sumaR: zaokr(sumaR, 1),
    profitFactor: straty > 0 ? zaokr(zyski / straty) : null,
    maksObsuniecie: zaokr(obsuniecie, 1),
    trafienieTp1: zaokr((zawarte.filter((w) => w.osiagnietyTp >= 1).length / zawarte.length) * 100, 1),
    niewypelnione,
    // Przy kilku transakcjach przedział jest tak szeroki, że niczego nie mówi –
    // i dobrze, bo właśnie to ma zobaczyć użytkownik.
    przedzialR: zawarte.length >= 2 ? [zaokr(sredniaR - 1.96 * blad), zaokr(sredniaR + 1.96 * blad)] : null,
  }
}

function przebieg(dni: number, naZadanie: boolean): WynikWariantu {
  const p = profilDlaDni(dni)
  const krok = MS[p.interwalBazowy]
  const wyniki: WynikSymulacji[] = []
  let otwartaDo = 0

  // Ostatni horyzont przed końcem danych nie ma przyszłości do rozliczenia.
  const koniec = teraz - dni * MS['1d']
  let wskaznikSciezki = 0

  for (let czas = od; czas < koniec; czas += krok) {
    if (czas < otwartaDo) continue

    const swieceWg: SwieceWgInterwalu = {}
    let komplet = true
    for (const { interwal } of p.interwaly) {
      const kawalek = doCzasu(serie[interwal]!, czas, p.swiecDoAnalizy, MS[interwal])
      if (kawalek.length < 60) {
        komplet = false
        break
      }
      swieceWg[interwal] = kawalek
    }
    if (!komplet) continue

    const wynik = analizuj({
      horyzont: p.id,
      swieceWg,
      teraz: czas,
      naZadanie,
      profilWlasny: p,
    })
    if (!czySygnal(wynik)) continue

    while (wskaznikSciezki < sciezka.length && sciezka[wskaznikSciezki].czas < czas) wskaznikSciezki++
    // Sygnał wygasa po `dni` dniach – dalsza ścieżka nie jest potrzebna
    // (+2 świece, żeby symulacja miała świecę tuż po wygaśnięciu do wyceny).
    const przyszlosc = sciezka.slice(wskaznikSciezki, wskaznikSciezki + dni * 24 + 2)
    if (przyszlosc.length === 0) break

    const s = symuluj(wynik, przyszlosc)
    wyniki.push(s)
    otwartaDo = s.wypelniony ? s.zamkniecie : czas + krok
  }

  const dniOkna = (koniec - od) / MS['1d']
  return podsumuj(wyniki, p, dniOkna)
}

// ------------------------------------------------------------------ przebieg siatki

const horyzonty: {
  dni: number
  interwalBazowy: Interwal
  naZadanie: WynikWariantu
  zProgami: WynikWariantu
}[] = []

console.log(
  kolor.szary(
    '  dni   baza   │ NA ŻĄDANIE: trans.  traf.   śr.R    PF   │ Z PROGAMI: trans.  traf.   śr.R    PF',
  ),
)

for (const dni of SIATKA) {
  const start = Date.now()
  const naZadanie = przebieg(dni, true)
  const zProgami = przebieg(dni, false)
  const p = profilDlaDni(dni)
  horyzonty.push({ dni, interwalBazowy: p.interwalBazowy, naZadanie, zProgami })

  const kol = (w: WynikWariantu) =>
    `${String(w.transakcji).padStart(6)}  ${(w.skutecznosc.toFixed(0) + '%').padStart(5)}  ` +
    `${((w.sredniR >= 0 ? '+' : '') + w.sredniR.toFixed(2)).padStart(6)}  ${(w.profitFactor?.toFixed(2) ?? '—').padStart(5)}` +
    `  [${w.przedzialR ? w.przedzialR.map((x) => (x >= 0 ? '+' : '') + x.toFixed(2)).join('…') : '—'}]`
  // Zielony tylko wtedy, gdy przewaga wychodzi poza granice przypadku.
  const barwa = (w: WynikWariantu) =>
    w.przedzialR && w.przedzialR[0] > 0 ? kolor.zielony : w.sredniR > 0 ? kolor.zolty : kolor.czerwony
  console.log(
    `  ${String(dni).padStart(3)}   ${p.interwalBazowy.padEnd(4)}   │            ${barwa(naZadanie)(kol(naZadanie))}   │           ${barwa(zProgami)(kol(zProgami))}` +
      kolor.szary(`  ${((Date.now() - start) / 1000).toFixed(1)}s`),
  )
}

const plik = join(import.meta.dirname, '..', 'src', 'analiza', 'historiaGeneratora.json')
writeFileSync(
  plik,
  JSON.stringify(
    {
      policzono: new Date(teraz).toISOString().slice(0, 10),
      okno: { od: new Date(od).toISOString().slice(0, 10), do: new Date(teraz).toISOString().slice(0, 10) },
      zrodlo: 'Binance BTCUSDT, rozliczenie na świecach 1h, stop przed celem w obrębie świecy',
      horyzonty,
    },
    null,
    2,
  ) + '\n',
)
console.log(kolor.szary(`\nZapisano: ${plik}\n`))
