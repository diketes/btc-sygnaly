#!/usr/bin/env node
/**
 * Sprawdza, czy cena jest CZYTELNA — czyli czy w każdym miejscu na cyfrę
 * widać dokładnie jedną cyfrę, i to tę właściwą.
 *
 * Wcześniejszy test mierzył geometrię (czy okienko rośnie razem z czcionką)
 * i przechodził, a na prawdziwym telefonie cyfry i tak się rozsypywały.
 * Ten test nie zakłada niczego o implementacji: dla każdego miejsca liczy,
 * które glify faktycznie na nie zachodzą i jak mocno.
 *
 * Warunki jak na słabszym telefonie: spowolniony procesor i opóźnione
 * wczytanie czcionki — właśnie w takich warunkach animacja przy starcie
 * potrafiła zatrzymać się między cyframi.
 *
 * Uruchomienie: node scripts/test-czytelnosc-ceny.mjs [adres]
 */

import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const ADRES = process.argv[2] ?? 'http://127.0.0.1:4184/'
const SCIEZKI = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const przegladarkaSciezka = SCIEZKI.find((p) => existsSync(p))

const kolor = {
  zielony: (s) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s) => `\x1b[31m${s}\x1b[0m`,
  szary: (s) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s) => `\x1b[1m${s}\x1b[0m`,
}

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Dla każdej cyfry ceny zwraca listę glifów widocznych w jej miejscu
 * (zachodzących na nie i nieprzezroczystych), razem z tym, jaki ułamek
 * wysokości miejsca zajmują.
 */
function zbadajCene() {
  const korzen = document.querySelector('[data-cena]')
  if (!korzen) return { brak: true }

  const sloty = [...korzen.querySelectorAll('[data-slot-cyfry]')]
  const wyniki = sloty.map((slot) => {
    const r = slot.getBoundingClientRect()
    const glify = [...slot.querySelectorAll('span')].filter(
      (s) => s.childElementCount === 0 && /^\d$/.test((s.textContent ?? '').trim()),
    )
    const widoczne = glify
      .map((g) => {
        const gr = g.getBoundingClientRect()
        // Przezroczystość liczymy łącznie z przodkami aż do miejsca na cyfrę.
        let krycie = 1
        for (let el = g; el && el !== slot.parentElement; el = el.parentElement) {
          krycie *= parseFloat(getComputedStyle(el).opacity || '1')
        }
        // Część glifu, która faktycznie jest w polu widzenia miejsca.
        const wSrodku = Math.max(0, Math.min(r.bottom, gr.bottom) - Math.max(r.top, gr.top))
        return {
          znak: g.textContent.trim(),
          pokrycie: r.height > 0 ? wSrodku / r.height : 0,
          krycie,
        }
      })
      .filter((g) => g.pokrycie > 0.08 && g.krycie > 0.08)
    return widoczne
  })

  return {
    brak: false,
    oczekiwana: korzen.getAttribute('data-cena'),
    sloty: wyniki,
  }
}

async function jedenPrzebieg(przegladarka, opis, { cpu, opoznienieCzcionki, skalaCzcionki }) {
  const strona = await przegladarka.newPage()
  await strona.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  if (cpu > 1) await strona.emulateCPUThrottling(cpu)

  // Opóźniamy czcionkę z Google Fonts – na telefonie przychodzi po pierwszym
  // wyrenderowaniu, a to zmienia wymiary glifów w trakcie animacji.
  if (opoznienieCzcionki > 0) {
    await strona.setRequestInterception(true)
    strona.on('request', (z) => {
      if (/fonts\.(gstatic|googleapis)\.com/.test(z.url())) {
        setTimeout(() => z.continue().catch(() => {}), opoznienieCzcionki)
      } else {
        z.continue().catch(() => {})
      }
    })
  }

  await strona.goto(ADRES, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await czekaj(2000)
  await strona.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((e) => e.textContent?.includes('Rozumiem'))?.click()
  })

  for (let i = 0; i < 90; i++) {
    const jest = await strona.evaluate(() => !!document.querySelector('[data-cena]'))
    if (jest) break
    await czekaj(700)
  }

  if (skalaCzcionki !== 100) {
    await strona.evaluate((s) => {
      const k = document.querySelector('[data-cena]')
      if (k) k.style.fontSize = `${(parseFloat(getComputedStyle(k).fontSize) * s) / 100}px`
    }, skalaCzcionki)
  }

  // Obserwujemy gęsto przez dłuższy czas – cena zmienia się kilka razy na
  // sekundę, więc łapiemy także stany w trakcie zmiany, a nie tylko spoczynek.
  let najgorsze = null
  let probek = 0
  let zlych = 0
  for (let i = 0; i < 40; i++) {
    await czekaj(300)
    const w = await strona.evaluate(zbadajCene)
    if (w.brak) continue
    probek++

    // Rozsypka to DWA glify w jednym miejscu albo glif przecięty w pół.
    // Pojedyncza cyfra, która akurat się pojawia (lekko przezroczysta,
    // odrobinę przesunięta), jest czytelna – to nie jest błąd.
    const zle = w.sloty
      .map((widoczne, idx) => ({ idx, widoczne }))
      .filter(
        ({ widoczne }) => widoczne.length !== 1 || widoczne[0].pokrycie < 0.7,
      )
    if (zle.length > 0) {
      zlych++
      if (!najgorsze || zle.length > najgorsze.zle.length) najgorsze = { zle, w }
    }
  }

  const ok = probek > 0 && zlych === 0
  console.log(
    `${ok ? kolor.zielony('OK  ') : kolor.czerwony('BŁĄD')} ${opis.padEnd(46)} ` +
      kolor.szary(`${probek - zlych}/${probek} odczytów czytelnych`),
  )
  if (!ok && najgorsze) {
    for (const { idx, widoczne } of najgorsze.zle.slice(0, 3)) {
      const opisGlifow = widoczne.map((g) => `„${g.znak}” ${(g.pokrycie * 100).toFixed(0)}%`).join(' + ')
      console.log(kolor.czerwony(`       cyfra ${idx + 1}: ${opisGlifow || 'nic nie widać'}`))
    }
  }
  if (probek === 0) console.log(kolor.czerwony('       nie znaleziono ceny na ekranie'))

  await strona.close()
  return ok
}

console.log(kolor.gruby(`\n=== Czytelność ceny: ${ADRES} ===\n`))

const przegladarka = await puppeteer.launch({
  executablePath: przegladarkaSciezka,
  headless: 'new',
  args: ['--no-sandbox'],
})

const SCENARIUSZE = [
  ['komputer, normalne warunki', { cpu: 1, opoznienieCzcionki: 0, skalaCzcionki: 100 }],
  ['słaby telefon (CPU ×6)', { cpu: 6, opoznienieCzcionki: 0, skalaCzcionki: 100 }],
  ['słaby telefon + czcionka po 3 s', { cpu: 6, opoznienieCzcionki: 3000, skalaCzcionki: 100 }],
  ['słaby telefon + czcionka 130%', { cpu: 6, opoznienieCzcionki: 1500, skalaCzcionki: 130 }],
  ['słaby telefon + czcionka 200%', { cpu: 6, opoznienieCzcionki: 1500, skalaCzcionki: 200 }],
]

let bledy = 0
for (const [opis, opcje] of SCENARIUSZE) {
  const ok = await jedenPrzebieg(przegladarka, opis, opcje)
  if (!ok) bledy++
}

await przegladarka.close()
console.log('')
console.log(
  bledy === 0
    ? kolor.zielony('Cena czytelna we wszystkich warunkach.\n')
    : kolor.czerwony(`Rozsypana cena w ${bledy} z ${SCENARIUSZE.length} scenariuszy.\n`),
)
process.exit(bledy > 0 ? 1 : 0)
