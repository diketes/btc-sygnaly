#!/usr/bin/env node
/**
 * Test generatora sygnału w prawdziwej przeglądarce, na prawdziwych danych
 * z giełdy – tak, jak użyłby go człowiek:
 *
 *  1. skrót z Pulpitu otwiera generator,
 *  2. suwak i szybki wybór zmieniają liczbę dni (Home/End = 2 i 90 dni),
 *  3. „Wygeneruj sygnał” pokazuje etapy i kończy się kartą LONG/SHORT
 *     z wejściem, stopem i celami dla wybranej liczby dni,
 *  4. obok wyniku jest historia z backtestu dla tego horyzontu,
 *  5. „Śledź” dodaje sygnał do aktywnych, drugi śledzony zamyka pierwszy,
 *  6. po przeładowaniu strony zostaje tylko jeden śledzony sygnał
 *     i zapamiętana liczba dni,
 *  7. na wąskim telefonie nic nie wystaje poza ekran.
 *
 * Uruchomienie: node scripts/test-generatora.mjs [adres]
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const ADRES = process.argv[2] ?? 'http://127.0.0.1:4184/'
const ZRZUTY = 'zrzuty'
const SCIEZKI = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const przegladarkaSciezka = SCIEZKI.find((p) => existsSync(p))
if (!przegladarkaSciezka) {
  console.error('Nie znaleziono Chrome ani Edge.')
  process.exit(1)
}

const kolor = {
  zielony: (s) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s) => `\x1b[31m${s}\x1b[0m`,
  szary: (s) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s) => `\x1b[1m${s}\x1b[0m`,
}

mkdirSync(ZRZUTY, { recursive: true })
const bledy = []
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))

function sprawdz(warunek, opis) {
  console.log(`${warunek ? kolor.zielony('OK  ') : kolor.czerwony('BŁĄD')} ${opis}`)
  if (!warunek) bledy.push(opis)
  return warunek
}

const przegladarka = await puppeteer.launch({
  executablePath: przegladarkaSciezka,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const strona = await przegladarka.newPage()
// Wąski telefon – na nim najłatwiej coś wypchnąć poza ekran.
await strona.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

const OCZEKIWANY_SZUM =
  /Failed to load resource|net::ERR|ERR_|blocked by CORS policy|Ping received after close|WebSocket connection to/
strona.on('console', (m) => {
  if (m.type() === 'error' && !OCZEKIWANY_SZUM.test(m.text())) bledy.push(`konsola: ${m.text()}`)
})
strona.on('pageerror', (e) => bledy.push(`WYJĄTEK: ${e.message}`))

const tekst = async () => (await strona.evaluate(() => document.body.innerText)).toLocaleLowerCase('pl-PL')
const zawiera = async (fragment) => (await tekst()).includes(fragment.toLocaleLowerCase('pl-PL'))

async function czekajNa(warunek, sekundy = 30) {
  const koniec = Date.now() + sekundy * 1000
  while (Date.now() < koniec) {
    if (await warunek()) return true
    await czekaj(250)
  }
  return false
}

async function klikTekst(fragment) {
  const ok = await strona.evaluate((t) => {
    const cel = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(t))
    cel?.click()
    return Boolean(cel)
  }, fragment)
  if (!ok) throw new Error(`Nie znaleziono przycisku „${fragment}”`)
  await czekaj(350)
}

async function klik(selektor) {
  await strona.$eval(selektor, (e) => e.click())
  await czekaj(350)
}

/** Sygnały zapisane w IndexedDB – do diagnostyki, gdy coś się nie zgadza. */
function sygnalyWBazie() {
  return strona.evaluate(
    () =>
      new Promise((rozwiaz) => {
        const z = indexedDB.open('btc-sygnaly')
        z.onerror = () => rozwiaz('nie da się otworzyć bazy')
        z.onsuccess = () => {
          const t = z.result.transaction('sygnaly').objectStore('sygnaly').getAll()
          t.onsuccess = () =>
            rozwiaz(t.result.map((s) => `${s.id} ${s.status} dni=${s.dniHoryzontu ?? '-'} R=${s.wynikR}`))
        }
      }),
  )
}

const dni = () => strona.$eval('[data-dni-generatora]', (e) => Number(e.getAttribute('data-dni-generatora')))

async function bezPrzewijaniaWPoziomie(opis) {
  const { szer, okno } = await strona.evaluate(() => ({
    szer: document.documentElement.scrollWidth,
    okno: window.innerWidth,
  }))
  sprawdz(szer <= okno, `${opis}: nic nie wystaje poza ekran (${szer} ≤ ${okno})`)
}

/** Naciska „Wygeneruj” i czeka na kartę wyniku dla podanej liczby dni. */
async function generuj(oczekiwaneDni) {
  await klik('[data-generuj]')
  const etapy = await czekajNa(async () => Boolean(await strona.$('[data-etapy-generatora]')), 3)
  sprawdz(etapy, 'widać etapy analizy w trakcie liczenia')
  const gotowe = await czekajNa(
    async () =>
      !(await strona.$('[data-etapy-generatora]')) &&
      (await strona.evaluate(() => Boolean(document.querySelector('[data-wynik-generatora]')))),
    60,
  )
  sprawdz(gotowe, `wynik dla ${oczekiwaneDni} dni pojawił się`)
  return strona.$eval('[data-wynik-generatora]', (e) => e.getAttribute('data-wynik-generatora'))
}

console.log(kolor.gruby(`\n=== Test generatora: ${ADRES} ===\n`))

await strona.goto(ADRES, { waitUntil: 'networkidle2', timeout: 60_000 })
await czekaj(1000)
if (await zawiera('Rozumiem')) await klikTekst('Rozumiem')
sprawdz(await czekajNa(async () => /24h:\s*\d/.test(await tekst()), 60), 'aplikacja pobrała cenę')

// --- 1. skrót z Pulpitu ------------------------------------------------------
console.log(kolor.gruby('\nSkrót z Pulpitu'))
sprawdz(Boolean(await strona.$('[data-skrot-generatora]')), 'na Pulpicie jest skrót „Generator sygnału”')
await klik('[data-skrot-generatora]')
sprawdz(await czekajNa(() => zawiera('Na ile dni sygnał?'), 10), 'skrót otwiera generator')
await bezPrzewijaniaWPoziomie('generator')

// --- 2. suwak i szybki wybór --------------------------------------------------
console.log(kolor.gruby('\nWybór liczby dni'))
await strona.focus('input.suwak-dni')
await strona.keyboard.press('Home')
await czekaj(300)
sprawdz((await dni()) === 2, `Home na suwaku = 2 dni (jest ${await dni()})`)
await strona.keyboard.press('End')
await czekaj(300)
sprawdz((await dni()) === 90, `End na suwaku = 90 dni (jest ${await dni()})`)
sprawdz(await zawiera('1d · 3d · 1w'), 'przy 90 dniach analiza obejmuje świece 3-dniowe i tygodniowe')

await klikTekst('2 tyg.')
await czekaj(400)
sprawdz((await dni()) === 14, `szybki wybór „2 tyg.” = 14 dni (jest ${await dni()})`)
await strona.screenshot({ path: join(ZRZUTY, 'generator-1-wybor.png'), fullPage: false })

// --- 3. generowanie ------------------------------------------------------------
console.log(kolor.gruby('\nGenerowanie – 2 tygodnie'))
const kierunek14 = await generuj(14)
sprawdz(kierunek14 === 'long' || kierunek14 === 'short', `generator dał kierunek (${kierunek14})`)
const karta = await strona.$eval('[data-wynik-generatora]', (e) => e.innerText.toLocaleLowerCase('pl-PL'))
sprawdz(karta.includes('generator · 2 tygodnie'), 'karta ma plakietkę „Generator · 2 tygodnie”')
sprawdz(karta.includes('do 2 tygodni'), 'karta mówi, na jak długo jest sygnał („do 2 tygodni”)')
sprawdz(
  karta.includes('wejście') && karta.includes('stop loss') && karta.includes('cel tp1') && karta.includes('cel tp3'),
  'karta ma wejście, stop i trzy cele',
)
await strona.$eval('[data-wynik-generatora]', (e) => e.scrollIntoView())
await czekaj(400)
await strona.screenshot({ path: join(ZRZUTY, 'generator-2-wynik.png') })

// --- 4. historia -------------------------------------------------------------
console.log(kolor.gruby('\nHistoria z backtestu'))
const historia = await strona.$eval('[data-historia-generatora]', (e) => ({
  dni: e.getAttribute('data-historia-generatora'),
  tekst: e.innerText.toLocaleLowerCase('pl-PL'),
}))
sprawdz(historia.dni === '14', 'historia dotyczy 14 dni')
sprawdz(historia.tekst.includes('95% przedział'), 'historia pokazuje przedział ufności')
sprawdz(/transakcji/.test(historia.tekst), 'historia pokazuje liczbę transakcji')
await strona.$eval('[data-historia-generatora]', (e) => e.scrollIntoView())
await czekaj(400)
await strona.screenshot({ path: join(ZRZUTY, 'generator-2b-historia.png') })

// --- 5. śledzenie ---------------------------------------------------------------
console.log(kolor.gruby('\nŚledzenie'))
await klik('[data-sledz]')
sprawdz(await czekajNa(() => zawiera('Śledzony – powiadomię'), 5), '„Śledź” oznacza sygnał jako śledzony')
await klik('[data-karta-sygnalow="aktywne"]')
await czekaj(500)
sprawdz(await zawiera('Generator · 2 tygodnie'), 'śledzony sygnał widać w zakładce Aktywne')
sprawdz(
  (await zawiera('Krótki termin')) && (await zawiera('Długi termin')),
  'karty krótki/długi nadal są na miejscu',
)

console.log(kolor.gruby('\nDrugi sygnał – 2 dni'))
await klik('[data-karta-sygnalow="generator"]')
await czekaj(500)
await klikTekst('2 dni')
await czekaj(300)
sprawdz((await dni()) === 2, '„2 dni” wybrane')
const kierunek2 = await generuj(2)
sprawdz(kierunek2 === 'long' || kierunek2 === 'short', `generator dał kierunek na 2 dni (${kierunek2})`)
sprawdz(await zawiera('Śledź ten zamiast obecnego'), 'przycisk uprzedza o zastąpieniu śledzonego sygnału')
await klik('[data-sledz]')
sprawdz(await czekajNa(() => zawiera('Śledzony – powiadomię'), 5), 'drugi sygnał jest teraz śledzony')
await klik('[data-karta-sygnalow="historia"]')
await czekaj(700)
const wHistorii = await zawiera('generator · 2 tygodnie')
sprawdz(wHistorii, 'poprzedni sygnał trafił do historii')
sprawdz(await zawiera('Unieważniony'), 'poprzedni sygnał jest opisany jako unieważniony')
if (!wHistorii) {
  console.log(kolor.szary((await tekst()).slice(0, 1500)))
  console.log(kolor.szary(JSON.stringify(await sygnalyWBazie(), null, 1)))
}

// --- 6. po przeładowaniu --------------------------------------------------------
console.log(kolor.gruby('\nPo przeładowaniu'))
// WebSocket z ceną nie pozwala sieci „ucichnąć”, więc nie czekamy na networkidle.
await strona.reload({ waitUntil: 'domcontentloaded' })
await czekajNa(async () => /24h:\s*\d/.test(await tekst()), 60)
await klik('[data-skrot-generatora]')
await czekaj(600)
sprawdz((await dni()) === 2, 'generator pamięta ostatnio wybraną liczbę dni')
await klik('[data-karta-sygnalow="aktywne"]')
await czekaj(600)
const aktywneTekst = await tekst()
sprawdz(aktywneTekst.includes('generator · 2 dni'), 'śledzony sygnał przetrwał przeładowanie')
sprawdz(!aktywneTekst.includes('generator · 2 tygodnie'), 'zastąpiony sygnał nie wrócił jako aktywny')
await bezPrzewijaniaWPoziomie('zakładka Aktywne')

// Zastąpiony sygnał ma wynik tylko wtedy, gdy jego wejście faktycznie weszło.
const zastapiony = (await sygnalyWBazie()).find((l) => l.includes('uniewazniony') && l.includes('dni=14'))
const miaWynik = Boolean(zastapiony) && !zastapiony.endsWith('R=null')
await klik('[data-karta-sygnalow="statystyki"]')
await czekaj(600)
sprawdz(
  (await zawiera('Generator – osobno')) === miaWynik,
  miaWynik
    ? 'skuteczność generatora liczona osobno'
    : 'zlecenie, które nie weszło, nie trafiło do skuteczności (brak fikcyjnego wyniku)',
)
await strona.screenshot({ path: join(ZRZUTY, 'generator-3-statystyki.png') })

// --- podsumowanie ---------------------------------------------------------------
console.log('')
if (bledy.length === 0) console.log(kolor.zielony('Generator działa.\n'))
else {
  console.log(kolor.czerwony(`Błędy (${bledy.length}):`))
  for (const b of [...new Set(bledy)]) console.log(kolor.czerwony(`  • ${b.slice(0, 300)}`))
}
await przegladarka.close()
process.exit(bledy.length > 0 ? 1 : 0)
