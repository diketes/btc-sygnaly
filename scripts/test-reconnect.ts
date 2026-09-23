/**
 * Test wznawiania połączenia i uzupełniania luk w świecach.
 *
 * Dwie części:
 *  1. Logika scalania – symulujemy przerwę i sprawdzamy, że po dociągnięciu
 *     danych REST-em seria nie ma dziur ani duplikatów.
 *  2. Prawdziwy WebSocket Binance – zrywamy połączenie i sprawdzamy, czy
 *     odbudowuje się zgodnie z zaplanowanym odstępem.
 *
 * Uruchomienie: npm run test:reconnect
 */

import { scalSerie, scalSwiece, sprawdzCiaglosc } from '../src/dane/scalanie'
import type { Swieca } from '../src/analiza/wskazniki'
import { kolor, MS, pobierzHistorie } from './wspolne'

let bledy = 0

function sprawdz(warunek: boolean, opis: string) {
  if (warunek) {
    console.log(`${kolor.zielony('OK  ')} ${opis}`)
  } else {
    console.log(`${kolor.czerwony('BŁĄD')} ${opis}`)
    bledy++
  }
}

function swieca(czas: number, cena = 100): Swieca {
  return { czas, o: cena, h: cena + 1, l: cena - 1, c: cena, v: 10 }
}

// ------------------------------------------------------------------ 1. scalanie

console.log(kolor.gruby('\n=== Scalanie serii po przerwie ===\n'))

const ODSTEP = MS['1h']
const START = Date.UTC(2026, 0, 1)

// Pełna, wzorcowa seria 200 świec godzinowych.
const wzorzec: Swieca[] = Array.from({ length: 200 }, (_, i) => swieca(START + i * ODSTEP, 100 + i))

{
  const raport = sprawdzCiaglosc(wzorzec, ODSTEP)
  sprawdz(raport.ciagla, 'wzorcowa seria jest ciągła (kontrola samego testu)')
}

{
  // Aplikacja miała świece do 120., potem zerwało połączenie na 40 godzin.
  const przedPrzerwa = wzorzec.slice(0, 120)
  const raportPrzed = sprawdzCiaglosc(przedPrzerwa, ODSTEP)
  sprawdz(raportPrzed.ciagla, 'seria sprzed przerwy jest ciągła')

  // Po wznowieniu strumień podaje tylko bieżącą świecę – powstaje dziura.
  const zeStrumienia = scalSwiece(przedPrzerwa, wzorzec[160])
  const zDziura = sprawdzCiaglosc(zeStrumienia, ODSTEP)
  // Ostatnia świeca przed przerwą ma indeks 119, wznowienie przychodzi na 160,
  // więc brakuje świec o indeksach 120–159, czyli dokładnie 40 sztuk.
  sprawdz(
    !zDziura.ciagla && zDziura.dziury.length === 1 && zDziura.dziury[0].brakujace === 40,
    `sam strumień zostawia dziurę na 40 świec (wykryto ${zDziura.dziury[0]?.brakujace ?? 0})`,
  )

  // Uzupełnienie REST-em: ostatnie 200 świec z giełdy.
  const zRest = wzorzec.slice(-200)
  const poScaleniu = scalSerie(zeStrumienia, zRest)
  const raportPo = sprawdzCiaglosc(poScaleniu, ODSTEP)

  sprawdz(raportPo.ciagla, 'po uzupełnieniu REST-em seria jest znów ciągła')
  sprawdz(raportPo.duplikaty === 0, 'scalenie nie tworzy duplikatów')
  sprawdz(raportPo.pozaKolejnoscia === 0, 'świece są uporządkowane w czasie')
  sprawdz(poScaleniu.length === 200, `seria ma 200 świec (jest ${poScaleniu.length})`)
}

{
  // Dane z REST-u są świeższe – muszą nadpisać niezamkniętą świecę ze strumienia.
  const niepelna = swieca(wzorzec[199].czas, 999)
  const zNiepelna = scalSwiece(wzorzec.slice(0, 199), niepelna)
  const poprawione = scalSerie(zNiepelna, [wzorzec[199]])
  sprawdz(
    poprawione[poprawione.length - 1].c === wzorzec[199].c,
    'dane z REST-u nadpisują niezamkniętą świecę ze strumienia',
  )
}

{
  // Spóźniona ramka o starszej świecy nie może cofnąć serii.
  const zeSpoznieniem = scalSwiece(wzorzec, swieca(START - ODSTEP, 1))
  sprawdz(
    zeSpoznieniem.length === wzorzec.length &&
      zeSpoznieniem[zeSpoznieniem.length - 1].czas === wzorzec[199].czas,
    'spóźniona ramka ze starszą świecą jest ignorowana',
  )
}

{
  // Limit długości serii musi być respektowany.
  const dluga = scalSerie(wzorzec, wzorzec, 50)
  sprawdz(dluga.length === 50, `scalanie przycina serię do limitu (${dluga.length})`)
}

// ------------------------------------------------------------------ 2. prawdziwe dane

console.log(kolor.gruby('\n=== Uzupełnianie z prawdziwej giełdy ===\n'))

try {
  const teraz = Date.now()
  const pelna = await pobierzHistorie('1h', teraz - 300 * MS['1h'], teraz)
  if (pelna.length < 100) {
    console.log(kolor.zolty('OSTRZ Za mało danych z giełdy, pomijam tę część.'))
  } else {
    const raport = sprawdzCiaglosc(pelna, MS['1h'])
    sprawdz(raport.ciagla, `prawdziwa seria ${pelna.length} świec 1h jest ciągła`)

    // Wycinamy środek, tak jakby aplikacja przespała ten fragment.
    const zDziura = [...pelna.slice(0, 50), ...pelna.slice(120)]
    const przed = sprawdzCiaglosc(zDziura, MS['1h'])
    sprawdz(!przed.ciagla, 'sztuczna przerwa faktycznie tworzy dziurę')

    const naprawiona = scalSerie(zDziura, pelna)
    const po = sprawdzCiaglosc(naprawiona, MS['1h'])
    sprawdz(po.ciagla, 'uzupełnienie z giełdy zamyka dziurę w prawdziwych danych')
    sprawdz(naprawiona.length === pelna.length, 'liczba świec zgadza się z oryginałem')
  }
} catch (e) {
  console.log(kolor.zolty(`OSTRZ Giełda nie odpowiedziała: ${e instanceof Error ? e.message : e}`))
}

// ------------------------------------------------------------------ 3. WebSocket

console.log(kolor.gruby('\n=== Wznowienie połączenia WebSocket ===\n'))

const ODSTEPY = [1000, 2000, 5000, 10_000, 30_000]
const ADRES = 'wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade'

/** Łączy się, czeka na ramkę i zwraca czas do pierwszej ramki. */
function polaczIZmierz(limitMs = 20_000): Promise<number> {
  return new Promise((rozwiaz, odrzuc) => {
    const start = Date.now()
    const ws = new WebSocket(ADRES)
    const timeout = setTimeout(() => {
      ws.close()
      odrzuc(new Error('brak ramki w limicie czasu'))
    }, limitMs)

    ws.onmessage = () => {
      clearTimeout(timeout)
      ws.close()
      rozwiaz(Date.now() - start)
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      odrzuc(new Error('błąd połączenia'))
    }
  })
}

try {
  const pierwsze = await polaczIZmierz()
  sprawdz(pierwsze < 20_000, `pierwsze połączenie dostarcza dane po ${pierwsze} ms`)

  // Zrywamy i łączymy ponownie – dokładnie to robi klasa StrumienRynku
  // po zdarzeniu `onclose`, z narastającym odstępem.
  console.log(kolor.szary(`  Zaplanowane odstępy ponowień: ${ODSTEPY.join(' ms, ')} ms`))
  await new Promise((r) => setTimeout(r, ODSTEPY[0]))
  const drugie = await polaczIZmierz()
  sprawdz(drugie < 20_000, `połączenie po zerwaniu odbudowuje się w ${drugie} ms`)

  sprawdz(
    ODSTEPY.length === 5 && ODSTEPY[0] === 1000 && ODSTEPY[4] === 30_000,
    'odstępy ponowień rosną od 1 s do 30 s',
  )
} catch (e) {
  console.log(kolor.zolty(`OSTRZ WebSocket niedostępny w tym środowisku: ${e instanceof Error ? e.message : e}`))
}

console.log('')
if (bledy === 0) console.log(kolor.zielony('Wszystkie kontrole przeszły.\n'))
else console.log(kolor.czerwony(`Błędów: ${bledy}\n`))
process.exit(bledy > 0 ? 1 : 0)
