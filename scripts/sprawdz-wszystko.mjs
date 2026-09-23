#!/usr/bin/env node
/**
 * Uruchamia wszystkie kontrole po kolei i wypisuje jedno podsumowanie.
 *
 * Uruchomienie: npm run sprawdz
 * Pominięcie testu aplikacji w przeglądarce: npm run sprawdz -- --bez-przegladarki
 */

import { spawnSync } from 'node:child_process'

const kolor = {
  zielony: (s) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s) => `\x1b[31m${s}\x1b[0m`,
  zolty: (s) => `\x1b[33m${s}\x1b[0m`,
  szary: (s) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s) => `\x1b[1m${s}\x1b[0m`,
}

const bezPrzegladarki = process.argv.includes('--bez-przegladarki')

const KONTROLE = [
  { nazwa: 'Typy TypeScript', polecenie: 'npx tsc --noEmit', krytyczna: true },
  { nazwa: 'Testy jednostkowe', polecenie: 'npx vitest run', krytyczna: true },
  { nazwa: 'Deduplikacja newsów', polecenie: 'npx tsx scripts/test-dedup.ts', krytyczna: true },
  { nazwa: 'Wznowienie połączenia', polecenie: 'npx tsx scripts/test-reconnect.ts', krytyczna: true },
  { nazwa: 'Dostępność API', polecenie: 'node scripts/test-api.mjs', krytyczna: false },
  { nazwa: 'Budowanie produkcyjne', polecenie: 'npx vite build', krytyczna: true },
]

const wyniki = []

for (const k of KONTROLE) {
  process.stdout.write(`${kolor.gruby(k.nazwa.padEnd(26))} `)
  const start = Date.now()
  const wynik = spawnSync(k.polecenie, { shell: true, encoding: 'utf8' })
  const sekundy = ((Date.now() - start) / 1000).toFixed(1)
  const ok = wynik.status === 0

  console.log(
    ok
      ? `${kolor.zielony('OK')} ${kolor.szary(`${sekundy}s`)}`
      : `${k.krytyczna ? kolor.czerwony('BŁĄD') : kolor.zolty('OSTRZ')} ${kolor.szary(`${sekundy}s`)}`,
  )

  if (!ok) {
    const tresc = `${wynik.stdout ?? ''}${wynik.stderr ?? ''}`
      .split('\n')
      .filter((l) => l.trim())
      .slice(-8)
    for (const l of tresc) console.log(kolor.szary(`    ${l.slice(0, 160)}`))
  }

  wyniki.push({ ...k, ok })
}

if (!bezPrzegladarki) {
  console.log(kolor.szary('\nTest aplikacji w przeglądarce wymaga działającego serwera:'))
  console.log(kolor.szary('  npm run dev        (w osobnym oknie)'))
  console.log(kolor.szary('  npm run sprawdz:app\n'))
}

console.log('')
const bledyKrytyczne = wyniki.filter((w) => !w.ok && w.krytyczna).length
const ostrzezenia = wyniki.filter((w) => !w.ok && !w.krytyczna).length

if (bledyKrytyczne === 0) {
  console.log(kolor.zielony(`Wszystko w porządku (${wyniki.filter((w) => w.ok).length}/${wyniki.length}).`))
  if (ostrzezenia > 0) {
    console.log(kolor.zolty(`Ostrzeżenia: ${ostrzezenia} – sprawdź, czy masz połączenie z internetem.`))
  }
} else {
  console.log(kolor.czerwony(`Nie przeszło: ${bledyKrytyczne} krytycznych kontroli.`))
}
console.log('')

process.exit(bledyKrytyczne > 0 ? 1 : 0)
