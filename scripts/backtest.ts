/**
 * Backtest silnika sygnałów na realnych danych z Binance.
 *
 * Uruchomienie:
 *   npm run backtest              – oba horyzonty
 *   npm run backtest -- krotki    – tylko krótki termin
 *   npm run backtest -- dlugi 3   – długi termin, 3 lata danych
 *
 * Zasady symulacji (celowo ostrożne):
 *  • sygnał liczony jest wyłącznie z danych dostępnych w danej chwili,
 *  • wejście po cenie zamknięcia świecy sygnału (limit = wejście w zasięgu ceny),
 *  • gdy w jednej świecy mieści się i stop, i cel – przyjmujemy trafienie stopa,
 *  • po TP1 stop wędruje na próg rentowności.
 */

import { writeFileSync } from 'node:fs'
import { analizuj } from '../src/analiza/silnik'
import { PROFILE, type Horyzont, type Interwal } from '../src/analiza/profile'
import { czySygnal, type Sygnal, type SwieceWgInterwalu } from '../src/analiza/typy'
import type { Swieca } from '../src/analiza/wskazniki'
import { agreguj, doCzasu, formatujData, kolor, MS, pobierzHistorie } from './wspolne'

type PowodZamkniecia = 'tp3' | 'tp2-be' | 'tp1-be' | 'sl' | 'wygasl' | 'niewypelniony'

interface WynikSymulacji {
  sygnal: Sygnal
  wynikR: number
  zamkniecie: number
  powod: PowodZamkniecia
  osiagnietyTp: number
  /** false = zlecenie limit nigdy się nie wypełniło, transakcji nie było. */
  wypelniony: boolean
}

/**
 * Przechodzi sygnał przez przyszłe świece i zwraca, jak się skończył.
 *
 * Wejście limitem (retest EMA21) NIE jest darmowe: pozycja powstaje dopiero,
 * gdy cena faktycznie dotknie poziomu zlecenia. Jeśli nigdy tam nie wróci,
 * transakcji nie ma i sygnał nie wchodzi do statystyk. Bez tego backtest
 * dostawałby lepsze wejścia, niż dałoby się osiągnąć na rynku.
 */
function symuluj(sygnal: Sygnal, przyszlosc: readonly Swieca[]): WynikSymulacji {
  const znak = sygnal.kierunek === 'long' ? 1 : -1
  const ryzyko = Math.abs(sygnal.wejscie - sygnal.stopLoss)
  let stop = sygnal.stopLoss
  let osiagnietyTp = 0

  // Wejście rynkowe jest wypełnione od razu; limit czeka na dotknięcie ceny.
  const limit = Math.abs(sygnal.wejscie - sygnal.cenaOdniesienia) > 1e-9
  let wypelniony = !limit

  for (const s of przyszlosc) {
    if (s.czas > sygnal.wygasa) break

    if (!wypelniony) {
      // Zlecenie limit wypełnia się, gdy zakres świecy obejmie jego cenę.
      if (s.l <= sygnal.wejscie && s.h >= sygnal.wejscie) wypelniony = true
      else continue
    }

    const stopTrafiony = sygnal.kierunek === 'long' ? s.l <= stop : s.h >= stop
    if (stopTrafiony) {
      const r = (znak * (stop - sygnal.wejscie)) / ryzyko
      return {
        sygnal,
        wynikR: r,
        zamkniecie: s.czas,
        powod: osiagnietyTp > 0 ? (osiagnietyTp === 2 ? 'tp2-be' : 'tp1-be') : 'sl',
        osiagnietyTp,
        wypelniony: true,
      }
    }

    for (const cel of sygnal.cele) {
      if (cel.poziom <= osiagnietyTp) continue
      const trafiony = sygnal.kierunek === 'long' ? s.h >= cel.cena : s.l <= cel.cena
      if (!trafiony) continue

      osiagnietyTp = cel.poziom
      if (cel.poziom === 1) stop = sygnal.wejscie // przesunięcie na próg rentowności
      if (cel.poziom === 3) {
        return {
          sygnal,
          wynikR: cel.r,
          zamkniecie: s.czas,
          powod: 'tp3',
          osiagnietyTp: 3,
          wypelniony: true,
        }
      }
    }
  }

  if (!wypelniony) {
    return {
      sygnal,
      wynikR: 0,
      zamkniecie: sygnal.wygasa,
      powod: 'niewypelniony',
      osiagnietyTp: 0,
      wypelniony: false,
    }
  }

  // Sygnał dożył końca ważności – wycena po cenie z chwili wygaśnięcia.
  const ostatnia = przyszlosc.find((s) => s.czas > sygnal.wygasa) ?? przyszlosc[przyszlosc.length - 1]
  if (!ostatnia) {
    return {
      sygnal,
      wynikR: 0,
      zamkniecie: sygnal.wygasa,
      powod: 'wygasl',
      osiagnietyTp,
      wypelniony: true,
    }
  }
  const r =
    osiagnietyTp > 0
      ? sygnal.cele[osiagnietyTp - 1].r
      : (znak * (ostatnia.c - sygnal.wejscie)) / ryzyko
  return { sygnal, wynikR: r, zamkniecie: ostatnia.czas, powod: 'wygasl', osiagnietyTp, wypelniony: true }
}

async function backtestHoryzontu(horyzont: Horyzont, lata: number): Promise<void> {
  const p = PROFILE[horyzont]
  console.log(kolor.gruby(`\n=== Backtest: ${p.nazwa} (${p.podtytul}) ===\n`))

  // Bazę dobieramy tak, żeby dało się z niej złożyć wszystkie potrzebne interwały.
  const bazowy: Interwal = horyzont === 'krotki' ? '5m' : '1h'
  // Krótki termin na krótszym oknie – 5-minutówek z 2 lat byłoby ponad 200 tysięcy.
  const dni = horyzont === 'krotki' ? Math.min(120, lata * 365) : lata * 365
  const od = Date.now() - dni * MS['1d']

  console.log(
    kolor.szary(`Pobieram ${dni} dni świec ${bazowy} (od ${formatujData(od)})…`),
  )
  const baza = await pobierzHistorie(bazowy, od)
  if (baza.length < 500) {
    console.log(kolor.czerwony('Za mało danych do backtestu.'))
    return
  }
  console.log(kolor.szary(`Pobrano ${baza.length} świec ${bazowy}.`))

  /**
   * Każdy interwał pobieramy z własnym rozbiegiem 260 świec, żeby wskaźniki
   * długookresowe (EMA200) były policzone już od pierwszego kroku symulacji –
   * dokładnie tak, jak widzi je aplikacja na żywo, która ciągnie 1000 świec.
   */
  const serie: Record<string, Swieca[]> = { [bazowy]: baza }
  for (const { interwal } of p.interwaly) {
    if (serie[interwal]) continue
    if (MS[interwal] < MS[bazowy]) continue

    const rozbieg = od - 260 * MS[interwal]
    // Interwały składane z bazy (np. 4h z 1h) i tak wymagają własnego pobrania,
    // bo baza zaczyna się dopiero od `od`.
    process.stdout.write(kolor.szary(`  rozbieg ${interwal}…\r`))
    serie[interwal] = await pobierzHistorie(interwal, rozbieg)
    if (serie[interwal].length < 120) {
      // Binance nie wystawia tego interwału tak daleko wstecz – składamy z bazy.
      serie[interwal] = agreguj(baza, interwal)
    }
  }

  console.log(
    kolor.szary(
      `Rozbieg: ${p.interwaly.map(({ interwal }) => `${interwal}=${serie[interwal]?.length ?? 0}`).join(', ')}`,
    ),
  )

  const krokMs = MS[p.interwalBazowy]
  const startCzas = od

  const sygnaly: WynikSymulacji[] = []
  let poprzedni: { kierunek: 'long' | 'short'; utworzony: number } | null = null
  let krokow = 0
  let czekan = 0
  let pominieteBoOtwarta = 0
  const powodyCzekania = new Map<string, number>()

  /**
   * Czas zamknięcia ostatniej pozycji. Dopóki pozycja jest otwarta, nowych nie
   * otwieramy – inaczej liczylibyśmy kilkanaście nakładających się, mocno
   * skorelowanych sygnałów jako niezależne transakcje i krzywa kapitału
   * kłamałaby przez zawyżone składanie zysków. Aplikacja trzyma tak samo:
   * jeden aktywny sygnał na horyzont.
   */
  let otwartaDo = 0

  const startPracy = Date.now()

  for (let czas = startCzas; czas < Date.now() - krokMs; czas += krokMs) {
    krokow++
    if (krokow % 200 === 0) {
      const proc = ((czas - startCzas) / (Date.now() - startCzas)) * 100
      process.stdout.write(
        `\r  ${kolor.szary(`analiza ${proc.toFixed(0)}%, sygnałów: ${sygnaly.length}`)}        `,
      )
    }

    if (czas < otwartaDo) {
      pominieteBoOtwarta++
      continue
    }

    const swieceWg: SwieceWgInterwalu = {}
    let komplet = true
    for (const { interwal } of p.interwaly) {
      const kawalek = doCzasu(serie[interwal], czas, p.swiecDoAnalizy, MS[interwal])
      if (kawalek.length < 60) {
        komplet = false
        break
      }
      swieceWg[interwal] = kawalek
    }
    if (!komplet) continue

    const wynik = analizuj({
      horyzont,
      swieceWg,
      teraz: czas,
      poprzedniSygnal: poprzedni,
    })

    if (!czySygnal(wynik)) {
      czekan++
      const powod = wynik.powody[0]?.split('–')[0].slice(0, 60) ?? 'inne'
      powodyCzekania.set(powod, (powodyCzekania.get(powod) ?? 0) + 1)
      continue
    }

    // Przyszłość liczona na świecach bazowych – najdokładniejszy zapis ruchu.
    // Pierwsza handlowalna świeca to ta otwierająca się dokładnie o `czas`.
    const indeks = baza.findIndex((s) => s.czas >= czas)
    if (indeks < 0) continue
    const przyszlosc = baza.slice(indeks)

    const symulacja = symuluj(wynik, przyszlosc)
    sygnaly.push(symulacja)
    // Niewypełniony limit nie blokuje slotu – w praktyce anulowałoby się go
    // przy kolejnym układzie. Za odstępy odpowiada wtedy sam cooldown.
    otwartaDo = symulacja.wypelniony ? symulacja.zamkniecie : czas
    poprzedni = { kierunek: wynik.kierunek, utworzony: czas }
  }

  process.stdout.write(`\r${' '.repeat(70)}\r`)

  // --- raport -------------------------------------------------------------
  const sekundy = ((Date.now() - startPracy) / 1000).toFixed(1)
  console.log(
    kolor.szary(
      `Przeanalizowano ${krokow} kroków w ${sekundy} s ` +
        `(${czekan}× „czekaj”, ${pominieteBoOtwarta}× pozycja już otwarta).\n`,
    ),
  )

  if (sygnaly.length === 0) {
    console.log(kolor.czerwony('Silnik nie wystawił ani jednego sygnału.'))
    console.log(kolor.szary('Najczęstsze powody czekania:'))
    for (const [powod, ile] of [...powodyCzekania].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(kolor.szary(`  ${String(ile).padStart(6)}× ${powod}`))
    }
    return
  }

  const wystawione = sygnaly.length
  const niewypelnione = sygnaly.filter((s) => !s.wypelniony).length
  // Statystyki liczymy wyłącznie z transakcji, które naprawdę by powstały.
  const zawarte = sygnaly.filter((s) => s.wypelniony)
  if (zawarte.length === 0) {
    console.log(kolor.czerwony(`Wystawiono ${wystawione} sygnałów, ale żaden limit się nie wypełnił.`))
    return
  }
  sygnaly.length = 0
  sygnaly.push(...zawarte)

  const wygrane = sygnaly.filter((s) => s.wynikR > 0)
  const przegrane = sygnaly.filter((s) => s.wynikR < 0)
  const sumaR = sygnaly.reduce((a, s) => a + s.wynikR, 0)
  const zyski = wygrane.reduce((a, s) => a + s.wynikR, 0)
  const straty = -przegrane.reduce((a, s) => a + s.wynikR, 0)

  let kapital = 100
  let szczyt = 100
  let obsuniecie = 0
  const krzywa: { czas: number; wartosc: number }[] = []
  const posortowane = [...sygnaly].sort((a, b) => a.zamkniecie - b.zamkniecie)
  for (const s of posortowane) {
    kapital *= 1 + (s.wynikR * p.domyslneRyzykoProc) / 100
    szczyt = Math.max(szczyt, kapital)
    obsuniecie = Math.max(obsuniecie, ((szczyt - kapital) / szczyt) * 100)
    krzywa.push({ czas: s.zamkniecie, wartosc: kapital })
  }

  const naRok = (sygnaly.length / dni) * 365
  const skutecznosc = (wygrane.length / sygnaly.length) * 100
  const profitFactor = straty > 0 ? zyski / straty : Infinity

  const ocena = (wartosc: number, prog: number) =>
    wartosc >= prog ? kolor.zielony(wartosc.toFixed(2)) : kolor.zolty(wartosc.toFixed(2))

  console.log(
    `  Wystawionych:        ${wystawione}` +
      (niewypelnione > 0
        ? kolor.szary(`  (${niewypelnione} limitów bez wypełnienia – poza statystyką)`)
        : ''),
  )
  console.log(`  Transakcji:          ${kolor.gruby(String(sygnaly.length))} (${naRok.toFixed(0)}/rok)`)
  console.log(`  Long / Short:        ${sygnaly.filter((s) => s.sygnal.kierunek === 'long').length} / ${sygnaly.filter((s) => s.sygnal.kierunek === 'short').length}`)
  console.log(`  Skuteczność:         ${skutecznosc >= 45 ? kolor.zielony(skutecznosc.toFixed(1) + '%') : kolor.zolty(skutecznosc.toFixed(1) + '%')}`)
  console.log(`  Średnie R:           ${ocena(sumaR / sygnaly.length, 0.1)}`)
  console.log(`  Suma R:              ${ocena(sumaR, 0)}`)
  console.log(`  Profit factor:       ${ocena(profitFactor, 1.2)}`)
  console.log(`  Maks. obsunięcie:    ${obsuniecie < 25 ? kolor.zielony(obsuniecie.toFixed(1) + '%') : kolor.czerwony(obsuniecie.toFixed(1) + '%')}`)
  console.log(`  Kapitał 100 →        ${kolor.gruby(kapital.toFixed(1))} (ryzyko ${p.domyslneRyzykoProc}% na sygnał)`)

  const trafienia = {
    tp1: sygnaly.filter((s) => s.osiagnietyTp >= 1).length,
    tp2: sygnaly.filter((s) => s.osiagnietyTp >= 2).length,
    tp3: sygnaly.filter((s) => s.osiagnietyTp >= 3).length,
  }
  console.log(
    `  Trafienia celów:     TP1 ${((trafienia.tp1 / sygnaly.length) * 100).toFixed(0)}%, ` +
      `TP2 ${((trafienia.tp2 / sygnaly.length) * 100).toFixed(0)}%, ` +
      `TP3 ${((trafienia.tp3 / sygnaly.length) * 100).toFixed(0)}%`,
  )

  const wgPewnosci = [
    [0, 50],
    [50, 65],
    [65, 80],
    [80, 101],
  ] as const
  console.log(kolor.szary('\n  Skuteczność wg pewności:'))
  for (const [od2, do2] of wgPewnosci) {
    const grupa = sygnaly.filter((s) => s.sygnal.pewnosc >= od2 && s.sygnal.pewnosc < do2)
    if (grupa.length === 0) continue
    const w = grupa.filter((s) => s.wynikR > 0).length
    const sr = grupa.reduce((a, s) => a + s.wynikR, 0) / grupa.length
    console.log(
      kolor.szary(
        `    ${String(od2).padStart(3)}–${String(do2 - 1).padEnd(3)}  ${String(grupa.length).padStart(4)} szt.  ` +
          `${((w / grupa.length) * 100).toFixed(0).padStart(3)}% traf.  śr. ${sr >= 0 ? '+' : ''}${sr.toFixed(2)}R`,
      ),
    )
  }

  const plik = `backtest-${horyzont}.csv`
  const naglowek = 'czas_otwarcia,czas_zamkniecia,kierunek,wejscie,sl,tp1,tp2,tp3,pewnosc,rr,wynik_R,powod,kapital\n'
  const wiersze = posortowane
    .map((s, i) =>
      [
        new Date(s.sygnal.utworzony).toISOString(),
        new Date(s.zamkniecie).toISOString(),
        s.sygnal.kierunek,
        s.sygnal.wejscie.toFixed(2),
        s.sygnal.stopLoss.toFixed(2),
        ...s.sygnal.cele.map((c) => c.cena.toFixed(2)),
        s.sygnal.pewnosc,
        s.sygnal.rr.toFixed(2),
        s.wynikR.toFixed(3),
        s.powod,
        krzywa[i].wartosc.toFixed(2),
      ].join(','),
    )
    .join('\n')
  writeFileSync(plik, naglowek + wiersze)
  console.log(kolor.szary(`\n  Pełna lista sygnałów: ${plik}`))
}

// ------------------------------------------------------------------ start

const argumenty = process.argv.slice(2)
const wybrany = argumenty.find((a) => a === 'krotki' || a === 'dlugi') as Horyzont | undefined
const lata = Number(argumenty.find((a) => /^\d+$/.test(a)) ?? 2)

const horyzonty: Horyzont[] = wybrany ? [wybrany] : ['dlugi', 'krotki']
for (const h of horyzonty) {
  await backtestHoryzontu(h, lata)
}
console.log('')
