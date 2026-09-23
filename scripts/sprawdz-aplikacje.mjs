#!/usr/bin/env node
/**
 * Uruchamia zbudowaną aplikację w przeglądarce, klika przez wszystkie ekrany
 * i raportuje błędy konsoli oraz zrzuty. To test, czy aplikacja NAPRAWDĘ działa,
 * a nie tylko czy się kompiluje.
 *
 * Uruchomienie: node scripts/sprawdz-aplikacje.mjs [adres]
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const ADRES = process.argv[2] ?? 'http://localhost:5180/'
const ZRZUTY = 'zrzuty'

const SCIEZKI_PRZEGLADARKI = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const przegladarkaSciezka = SCIEZKI_PRZEGLADARKI.find((p) => existsSync(p))
if (!przegladarkaSciezka) {
  console.error('Nie znaleziono Chrome ani Edge.')
  process.exit(1)
}

const kolor = {
  zielony: (s) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s) => `\x1b[31m${s}\x1b[0m`,
  zolty: (s) => `\x1b[33m${s}\x1b[0m`,
  szary: (s) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s) => `\x1b[1m${s}\x1b[0m`,
}

mkdirSync(ZRZUTY, { recursive: true })

const bledy = []
const ostrzezenia = []

const przegladarka = await puppeteer.launch({
  executablePath: przegladarkaSciezka,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
})

const strona = await przegladarka.newPage()
await strona.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

/**
 * Komunikaty, które przeglądarka wypisuje, a aplikacja obsługuje:
 *  • nieudane próby publicznych proxy (aplikacja próbuje kolejnych),
 *  • zamknięcie WebSocketa przy zmianie horyzontu (świadome rozłączenie),
 *  • zwykłe błędy sieci przy przeciążonych usługach zewnętrznych.
 * To ostrzeżenia, nie usterki — liczymy je osobno, żeby nie zagłuszały
 * prawdziwych wyjątków aplikacji.
 */
const OCZEKIWANY_SZUM =
  /Failed to load resource|net::ERR|ERR_|blocked by CORS policy|Ping received after close|WebSocket connection to/

strona.on('console', (m) => {
  const tekst = m.text()
  if (m.type() === 'error') {
    if (OCZEKIWANY_SZUM.test(tekst)) ostrzezenia.push(tekst)
    else bledy.push(tekst)
  } else if (m.type() === 'warning') {
    ostrzezenia.push(tekst)
  }
})
strona.on('pageerror', (e) => bledy.push(`WYJĄTEK: ${e.message}`))

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))

async function zrzut(nazwa) {
  await strona.screenshot({ path: join(ZRZUTY, `${nazwa}.png`) })
  console.log(kolor.szary(`  zrzut: ${ZRZUTY}/${nazwa}.png`));
}

async function klikTekst(tekst) {
  const kliknieto = await strona.evaluate((t) => {
    const elementy = [...document.querySelectorAll('button, a')]
    const cel = elementy.find((e) => e.textContent?.trim().includes(t))
    if (cel) {
      cel.click()
      return true
    }
    return false
  }, tekst)
  if (!kliknieto) throw new Error(`Nie znaleziono elementu z tekstem „${tekst}”`)
  await czekaj(400)
}

/**
 * Czeka, aż na stronie pojawi się oczekiwany tekst. Sztywne `sleep` powodowały
 * fałszywe błędy – ekran bywał sprawdzany, zanim zdążył się wyrenderować.
 */
async function czekajNaTekst(fragment, sekundy = 15) {
  const koniec = Date.now() + sekundy * 1000
  while (Date.now() < koniec) {
    if (zawiera(await tekstStrony(), fragment)) return true
    await czekaj(250)
  }
  return false
}

/** Czeka, aż tekst strony spełni wzorzec – używane do czekania na DANE, nie na nagłówki. */
async function czekajNaWzorzec(wzorzec, sekundy = 45) {
  const koniec = Date.now() + sekundy * 1000
  while (Date.now() < koniec) {
    if (wzorzec.test(await tekstStrony())) return true
    await czekaj(400)
  }
  return false
}

async function tekstStrony() {
  // Nagłówki sekcji mają w CSS `text-transform: uppercase`, co widać w innerText.
  // Porównujemy więc bez względu na wielkość liter.
  return (await strona.evaluate(() => document.body.innerText)).toLocaleLowerCase('pl-PL')
}

/** Pomocnik: czy tekst strony zawiera fragment (bez względu na wielkość liter). */
function zawiera(tekst, fragment) {
  return tekst.includes(fragment.toLocaleLowerCase('pl-PL'))
}

function sprawdz(warunek, opis) {
  if (warunek) {
    console.log(`${kolor.zielony('OK  ')} ${opis}`)
    return true
  }
  console.log(`${kolor.czerwony('BŁĄD')} ${opis}`)
  bledy.push(`Nie spełniono warunku: ${opis}`)
  return false
}

console.log(kolor.gruby(`\n=== Sprawdzam aplikację: ${ADRES} ===\n`))

await strona.goto(ADRES, { waitUntil: 'networkidle2', timeout: 60_000 })
await czekaj(1500)

// --- ekran powitalny ------------------------------------------------------
console.log(kolor.gruby('Ekran powitalny'))
let tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'BTC Sygnały'), 'wyświetla nazwę aplikacji')
sprawdz(zawiera(tekst, 'To nie jest porada inwestycyjna'), 'pokazuje obowiązkowy disclaimer')
sprawdz(zawiera(tekst, 'Krótki termin') && zawiera(tekst, 'Długi termin'), 'opisuje oba horyzonty')
await zrzut('01-powitanie')

await klikTekst('Rozumiem')
// Czekamy na DANE (zakres 24h z cyframi), a nie na sam nagłówek sekcji –
// nagłówki pojawiają się od razu i test sprawdzałby pusty ekran.
const sąDane = await czekajNaWzorzec(/24h:\s*\d/, 60)
await czekaj(2000)

// --- pulpit ---------------------------------------------------------------
console.log(kolor.gruby('\nPulpit'))
tekst = await tekstStrony()
sprawdz(sąDane && /24h:\s*\d/.test(tekst), 'pokazuje cenę BTC')
sprawdz(zawiera(tekst, 'NA ŻYWO') || zawiera(tekst, 'ŁĄCZĘ'), 'pokazuje status połączenia')
sprawdz(zawiera(tekst, 'Krótki') && zawiera(tekst, 'Długi') && zawiera(tekst, 'Oba'), 'ma przełącznik horyzontu')
sprawdz(
  zawiera(tekst, 'LONG') || zawiera(tekst, 'SHORT') || zawiera(tekst, 'Czekaj'),
  'pokazuje wynik analizy (sygnał albo „czekaj”)',
)
await zrzut('02-pulpit')

// --- przełącznik horyzontu ------------------------------------------------
console.log(kolor.gruby('\nPrzełącznik horyzontu'))
await klikTekst('Krótki')
await czekaj(4000)
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Krótki termin'), 'tryb „krótki” pokazuje profil krótkoterminowy')
sprawdz(!zawiera(tekst, 'Długi termin'), 'tryb „krótki” nie pokazuje karty długoterminowej')
await zrzut('03-horyzont-krotki')

await klikTekst('Długi')
await czekaj(4000)
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Długi termin'), 'tryb „długi” pokazuje profil długoterminowy')
await zrzut('04-horyzont-dlugi')

await klikTekst('Oba')
await czekaj(5000)
tekst = await tekstStrony()
sprawdz(
  zawiera(tekst, 'Krótki termin') && zawiera(tekst, 'Długi termin'),
  'tryb „oba” pokazuje oba horyzonty naraz',
)
await zrzut('05-horyzont-oba')

// --- wykres ---------------------------------------------------------------
console.log(kolor.gruby('\nWykres'))
await klikTekst('Wykres')
sprawdz(await czekajNaTekst('WSKAŹNIKI NA WYKRESIE', 20), 'ekran wykresu się otworzył')
await czekaj(2500)
const jestPlotno = await strona.evaluate(() => document.querySelectorAll('canvas').length >= 2)
sprawdz(jestPlotno, 'wykres świecowy został narysowany')
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'EMA 200') && zawiera(tekst, 'Bollinger'), 'ma przełączniki wskaźników')
sprawdz(zawiera(tekst, 'RSI') && zawiera(tekst, 'MACD'), 'ma panel oscylatorów')
await zrzut('06-wykres')

// --- sygnały --------------------------------------------------------------
console.log(kolor.gruby('\nSygnały'))
await klikTekst('Sygnały')
sprawdz(await czekajNaTekst('Skuteczność', 15), 'ekran sygnałów się otworzył')
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Aktywne') && zawiera(tekst, 'Historia'), 'ma zakładki aktywne i historia')
await zrzut('07-sygnaly')

await klikTekst('Skuteczność')
await czekaj(1200)
await zrzut('08-skutecznosc')

// --- newsy ----------------------------------------------------------------
console.log(kolor.gruby('\nNewsy'))
await klikTekst('Newsy')
sprawdz(await czekajNaTekst('Co może ruszyć BTC', 20), 'ma sekcję „Co może ruszyć BTC”')
await czekajNaTekst('Odświeżono', 45)
await czekaj(2000)
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Odświeżono') || zawiera(tekst, 'historii'), 'pobrał kanały newsowe')

// Klucz: żadna historia nie może pojawić się na liście dwa razy.
// Sprawdzamy WYŁĄCZNIE listę główną – sekcja „Co może ruszyć BTC” celowo
// powtarza najważniejsze klastry i nie jest duplikatem.
const duplikaty = await strona.evaluate(() => {
  const lista = document.querySelector('[data-lista="newsy"]')
  if (!lista) return { ile: 0, powtorzoneId: [], powtorzoneTytuly: [] }

  const karty = [...lista.querySelectorAll('[data-klaster]')]
  const identyfikatory = karty.map((e) => e.getAttribute('data-klaster'))
  const tytuly = karty.map((e) => e.querySelector('p')?.textContent?.trim() ?? '')

  const policz = (wartosci) => {
    const widziane = new Set()
    const powtorzone = []
    for (const w of wartosci) {
      if (w && widziane.has(w)) powtorzone.push(w)
      widziane.add(w)
    }
    return powtorzone
  }

  return {
    ile: karty.length,
    powtorzoneId: policz(identyfikatory),
    powtorzoneTytuly: policz(tytuly),
  }
})
sprawdz(
  duplikaty.powtorzoneId.length === 0,
  `żaden klaster nie występuje dwa razy (${duplikaty.ile} pozycji)`,
)
sprawdz(
  duplikaty.powtorzoneTytuly.length === 0,
  `żaden tytuł nie powtarza się na liście (${duplikaty.powtorzoneTytuly.length} powtórek)`,
)
await zrzut('09-newsy')

// --- rynek ----------------------------------------------------------------
console.log(kolor.gruby('\nRynek'))
await klikTekst('Rynek')
sprawdz(await czekajNaTekst('Narzędzia', 15), 'ekran rynku się otworzył')
await czekaj(2500)
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Funding') || zawiera(tekst, 'Pobieram dane'), 'pokazuje dane terminowe')
await zrzut('10-rynek')

await klikTekst('Narzędzia')
await czekaj(1500)
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Kalkulator pozycji'), 'ma kalkulator pozycji')
sprawdz(zawiera(tekst, 'Alerty cenowe'), 'ma alerty cenowe')
await zrzut('11-narzedzia')

// --- ustawienia -----------------------------------------------------------
console.log(kolor.gruby('\nUstawienia'))
await klikTekst('Pulpit')
await czekaj(1500)
await strona.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(
    (e) => e.getAttribute('aria-label') === 'Ustawienia',
  )
  b?.click()
})
await czekajNaTekst('Horyzont inwestycyjny', 12)
await czekaj(800)
tekst = await tekstStrony()
sprawdz(zawiera(tekst, 'Horyzont inwestycyjny'), 'ustawienia mają sekcję horyzontu')
sprawdz(zawiera(tekst, 'Powiadomienia'), 'ustawienia mają sekcję powiadomień')
sprawdz(zawiera(tekst, 'Kanały newsowe'), 'ustawienia mają listę kanałów')
await zrzut('12-ustawienia')

// --- wydajność ------------------------------------------------------------
console.log(kolor.gruby('\nWydajność'))
const metryki = await strona.metrics()
const pamiecMb = metryki.JSHeapUsedSize / 1024 / 1024
sprawdz(pamiecMb < 220, `zużycie pamięci JS: ${pamiecMb.toFixed(0)} MB`)

// --- podsumowanie ---------------------------------------------------------
console.log(kolor.gruby('\n=== Podsumowanie ===\n'))
if (ostrzezenia.length > 0) {
  console.log(kolor.zolty(`Ostrzeżenia (${ostrzezenia.length}):`))
  for (const o of [...new Set(ostrzezenia)].slice(0, 8)) {
    console.log(kolor.szary(`  • ${o.slice(0, 150)}`))
  }
  console.log('')
}

if (bledy.length === 0) {
  console.log(kolor.zielony('Brak błędów. Aplikacja działa.\n'))
} else {
  console.log(kolor.czerwony(`Błędy (${bledy.length}):`))
  for (const b of [...new Set(bledy)].slice(0, 15)) {
    console.log(kolor.czerwony(`  • ${b.slice(0, 300)}`))
  }
  console.log('')
}

await przegladarka.close()
process.exit(bledy.length > 0 ? 1 : 0)
