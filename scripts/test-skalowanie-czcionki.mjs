#!/usr/bin/env node
/**
 * Sprawdza, czy aplikacja znosi powiększoną czcionkę systemową.
 *
 * Android (Ustawienia → Wyświetlacz → Rozmiar czcionki) mnoży rozmiar tekstu
 * w WebView, ale NIE zmienia długości podanych w pikselach. Każdy element,
 * który ma wysokość liczoną w px, a w środku tekst – rozjedzie się.
 *
 * Uruchomienie: node scripts/test-skalowanie-czcionki.mjs [adres]
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const ADRES = process.argv[2] ?? 'http://127.0.0.1:4180/'
const ZRZUTY = 'zrzuty'
const SKALE = [100, 130, 160, 200]

const SCIEZKI = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const przegladarka_sciezka = SCIEZKI.find((p) => existsSync(p))
if (!przegladarka_sciezka) {
  console.error('Nie znaleziono przeglądarki.')
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
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))
let bledy = 0

const przegladarka = await puppeteer.launch({
  executablePath: przegladarka_sciezka,
  headless: 'new',
  args: ['--no-sandbox'],
})

console.log(kolor.gruby(`\n=== Skalowanie czcionki systemowej: ${ADRES} ===\n`))

for (const skala of SKALE) {
  const strona = await przegladarka.newPage()
  await strona.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  // Nie czekamy na ciszę w sieci – strumień WebSocket nigdy nie milknie.
  await strona.goto(ADRES, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await czekaj(2000)
  await strona.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((e) => e.textContent?.includes('Rozumiem'))?.click()
  })
  // Czekamy, aż pojawi się cena.
  for (let i = 0; i < 60; i++) {
    const jest = await strona.evaluate(() => /24h:\s*\d/.test(document.body.innerText))
    if (jest) break
    await czekaj(700)
  }
  await czekaj(1500)

  /**
   * Odwzorowanie WebView Androida: `setTextZoom` mnoży rozmiar tekstu,
   * a długości podane w pikselach zostawia bez zmian. Powiększamy więc
   * czcionkę samego elementu ceny i sprawdzamy, czy okienko cyfry
   * urosło razem z nią.
   */
  const pomiar = await strona.evaluate((s) => {
    const rolka = document.querySelector('.rolka')
    if (!rolka) return { brak: true }
    const korzen = rolka.closest('.cyfry')
    const tasma = rolka.querySelector('.rolka-tasma')
    const pozycja = tasma && tasma.children[0]
    if (!korzen || !tasma || !pozycja) return { brak: true }

    const zmierz = () => ({
      czcionka: parseFloat(getComputedStyle(pozycja).fontSize),
      okienko: rolka.getBoundingClientRect().height,
      krok: tasma.getBoundingClientRect().height / tasma.children.length,
      szerokosc: rolka.getBoundingClientRect().width,
    })

    const przed = zmierz()
    const bazowa = parseFloat(getComputedStyle(korzen).fontSize)
    korzen.style.fontSize = `${(bazowa * s) / 100}px`
    // Wymuszenie przeliczenia układu przed pomiarem.
    void rolka.getBoundingClientRect().height
    const po = zmierz()

    return { brak: false, przed, po }
  }, skala)

  if (pomiar.brak) {
    console.log(`${kolor.czerwony('BŁĄD')} skala ${skala}% – nie znaleziono elementu ceny`)
    bledy++
    await strona.close()
    continue
  }

  const { przed, po } = pomiar
  const wzrostCzcionki = po.czcionka / przed.czcionka
  const wzrostOkienka = po.okienko / przed.okienko

  // Poprawnie: okienko rośnie w tym samym tempie co czcionka (±5%),
  // a krok taśmy nadal równa się wysokości okienka.
  const okienkoNadaza = Math.abs(wzrostOkienka - wzrostCzcionki) < 0.05
  const krokPasuje = Math.abs(po.krok - po.okienko) < 1.5
  const ok = okienkoNadaza && krokPasuje

  console.log(
    `${ok ? kolor.zielony('OK  ') : kolor.czerwony('BŁĄD')} skala ${String(skala).padStart(3)}%  ` +
      kolor.szary(
        `czcionka ${przed.czcionka.toFixed(0)}→${po.czcionka.toFixed(0)}px (×${wzrostCzcionki.toFixed(2)}), ` +
          `okienko ${przed.okienko.toFixed(0)}→${po.okienko.toFixed(0)}px (×${wzrostOkienka.toFixed(2)})`,
      ),
  )
  if (!ok) {
    if (!okienkoNadaza) {
      console.log(
        kolor.czerwony(
          `      okienko nie nadąża za czcionką → cyfry wylewają się poza swoje miejsce`,
        ),
      )
    }
    if (!krokPasuje) {
      console.log(kolor.czerwony(`      krok taśmy ${po.krok.toFixed(1)}px ≠ okienko ${po.okienko.toFixed(1)}px`))
    }
    bledy++
  }

  await strona.screenshot({
    path: join(ZRZUTY, `czcionka-${skala}.png`),
    clip: { x: 0, y: 0, width: 414, height: 300 },
  })
  await strona.close()
}

console.log('')
if (bledy === 0) {
  console.log(kolor.zielony('Cena trzyma się przy każdym powiększeniu czcionki.\n'))
} else {
  console.log(kolor.czerwony(`Rozjazd przy ${bledy} z ${SKALE.length} skal – cyfry będą się nakładać.\n`))
}
console.log(kolor.szary(`Zrzuty: ${ZRZUTY}/czcionka-*.png\n`))

await przegladarka.close()
process.exit(bledy > 0 ? 1 : 0)
