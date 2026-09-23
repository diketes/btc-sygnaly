#!/usr/bin/env node
/**
 * Buduje APK: web → Capacitor → Gradle.
 *
 * Skrypt najpierw sprawdza, czy w systemie jest wszystko, czego potrzeba,
 * i mówi wprost, czego brakuje – zamiast zostawiać użytkownika z kilkuset
 * liniami błędu Gradle.
 *
 * Uruchomienie: npm run apk            (wersja debug, gotowa do instalacji)
 *               npm run apk -- release (wersja release, wymaga podpisu)
 */

import { execSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const KORZEN = resolve(import.meta.dirname, '..')
const ANDROID = join(KORZEN, 'android')
const WYJSCIE = join(KORZEN, 'dist-apk')

const kolor = {
  zielony: (s) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s) => `\x1b[31m${s}\x1b[0m`,
  zolty: (s) => `\x1b[33m${s}\x1b[0m`,
  szary: (s) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s) => `\x1b[1m${s}\x1b[0m`,
}

const wariant = process.argv.includes('release') ? 'release' : 'debug'

// ------------------------------------------------------------------ wymagania

console.log(kolor.gruby('\n=== Sprawdzam wymagania ===\n'))

const brakujace = []

function znajdzJdk() {
  const kandydaci = [
    process.env.JAVA_HOME,
    process.env.CAPACITOR_ANDROID_STUDIO_PATH,
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Android\\Android Studio\\jbr',
  ].filter(Boolean)

  for (const k of kandydaci) {
    if (!existsSync(k)) continue
    if (existsSync(join(k, 'bin', 'java.exe')) || existsSync(join(k, 'bin', 'java'))) return k
    // Katalog zbiorczy – szukamy w środku JDK 17 lub nowszego.
    try {
      const wersje = readdirSync(k)
        .filter((n) => /jdk/i.test(n))
        .map((n) => join(k, n))
        .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'bin')))
      if (wersje.length > 0) return wersje.sort().reverse()[0]
    } catch {
      /* brak dostępu – próbujemy dalej */
    }
  }
  return null
}

function znajdzSdk() {
  const kandydaci = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
    join(process.env.HOME ?? '', 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
  ].filter(Boolean)
  return kandydaci.find((k) => existsSync(join(k, 'platform-tools'))) ?? null
}

const jdk = znajdzJdk()
if (jdk) {
  console.log(`${kolor.zielony('OK  ')} JDK: ${jdk}`)
  process.env.JAVA_HOME = jdk
} else {
  console.log(`${kolor.czerwony('BRAK')} JDK 17 lub nowszy`)
  brakujace.push({
    co: 'JDK 17+',
    jak:
      'Pobierz Eclipse Temurin 17: https://adoptium.net/temurin/releases/?version=17\n' +
      '       Po instalacji ustaw JAVA_HOME na katalog JDK.',
  })
}

const sdk = znajdzSdk()
if (sdk) {
  console.log(`${kolor.zielony('OK  ')} Android SDK: ${sdk}`)
  process.env.ANDROID_HOME = sdk
  process.env.ANDROID_SDK_ROOT = sdk
} else {
  console.log(`${kolor.czerwony('BRAK')} Android SDK`)
  brakujace.push({
    co: 'Android SDK',
    jak:
      'Najprościej: zainstaluj Android Studio (https://developer.android.com/studio),\n' +
      '       uruchom je raz i pozwól pobrać SDK. Potem ustaw ANDROID_HOME\n' +
      '       na %LOCALAPPDATA%\\Android\\Sdk.',
  })
}

if (!existsSync(ANDROID)) {
  console.log(`${kolor.czerwony('BRAK')} katalogu android/`)
  brakujace.push({ co: 'projekt Androida', jak: 'Uruchom: npm run android:add' })
} else {
  console.log(`${kolor.zielony('OK  ')} projekt Androida`)
}

if (brakujace.length > 0) {
  console.log(kolor.zolty('\nBez tych rzeczy APK nie powstanie:\n'))
  for (const b of brakujace) {
    console.log(`  ${kolor.gruby(b.co)}\n       ${b.jak}\n`)
  }
  console.log(
    kolor.szary(
      'Alternatywa bez instalowania czegokolwiek: wypchnij repozytorium na GitHub —\n' +
        'workflow .github/workflows/android.yml zbuduje APK w chmurze i wystawi go\n' +
        'jako artefakt do pobrania.\n',
    ),
  )
  process.exit(1)
}

// ------------------------------------------------------------------ budowanie

function uruchom(polecenie, opcje = {}) {
  console.log(kolor.szary(`\n$ ${polecenie}`))
  execSync(polecenie, { stdio: 'inherit', cwd: KORZEN, ...opcje })
}

console.log(kolor.gruby('\n=== Budowanie ===\n'))

uruchom('npm run build')
uruchom('npx cap sync android')
uruchom('node scripts/dostosuj-android.mjs')
uruchom('node scripts/generuj-ikony.mjs')

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const zadanie = wariant === 'release' ? 'assembleRelease' : 'assembleDebug'

const wynik = spawnSync(gradlew, [zadanie], {
  cwd: ANDROID,
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

if (wynik.status !== 0) {
  console.log(kolor.czerwony('\nGradle zakończył się błędem.\n'))
  process.exit(wynik.status ?? 1)
}

// ------------------------------------------------------------------ wynik

const katalogApk = join(ANDROID, 'app', 'build', 'outputs', 'apk', wariant)
if (!existsSync(katalogApk)) {
  console.log(kolor.czerwony(`\nNie znaleziono katalogu z APK: ${katalogApk}\n`))
  process.exit(1)
}

mkdirSync(WYJSCIE, { recursive: true })
const pliki = readdirSync(katalogApk).filter((n) => n.endsWith('.apk'))

if (pliki.length === 0) {
  console.log(kolor.czerwony('\nGradle nie wyprodukował pliku APK.\n'))
  process.exit(1)
}

console.log(kolor.gruby('\n=== Gotowe ===\n'))
for (const p of pliki) {
  const zrodlo = join(katalogApk, p)
  const cel = join(WYJSCIE, `btc-sygnaly-${wariant}.apk`)
  copyFileSync(zrodlo, cel)
  const mb = (statSync(cel).size / 1024 / 1024).toFixed(1)
  console.log(`${kolor.zielony('OK')} ${cel} ${kolor.szary(`(${mb} MB)`)}`)
}

console.log(
  kolor.szary(
    '\nInstalacja na telefonie:\n' +
      '  • przez kabel:  adb install -r dist-apk/btc-sygnaly-debug.apk\n' +
      '  • bez kabla:    skopiuj plik na telefon i otwórz go\n' +
      '                  (trzeba zezwolić na instalację z nieznanych źródeł)\n',
  ),
)
