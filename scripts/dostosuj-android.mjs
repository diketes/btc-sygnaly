#!/usr/bin/env node
/**
 * Nakłada dostosowania na wygenerowany projekt Androida.
 *
 * Katalog `android/` powstaje z szablonu Capacitora i nie jest trzymany w repo
 * (jest duży i w całości odtwarzalny). Ten skrypt zapisuje w nim wszystko, co
 * jest nasze: motyw, kolory i ustawienia paska stanu. Ikony robi osobno
 * `generuj-ikony.mjs`.
 *
 * Uruchomienie: node scripts/dostosuj-android.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const KORZEN = join(import.meta.dirname, '..')
const RES = join(KORZEN, 'android', 'app', 'src', 'main', 'res')

if (!existsSync(RES)) {
  console.log('Katalog android/ nie istnieje – uruchom najpierw: npm run android:add')
  process.exit(0)
}

const PLIKI = {
  'values/colors.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Motyw aplikacji: czerń OLED z bitcoinowym złotem jako akcentem. -->
    <color name="colorPrimary">#0A0B0F</color>
    <color name="colorPrimaryDark">#000000</color>
    <color name="colorAccent">#F7931A</color>
    <color name="tlo">#000000</color>
</resources>
`,

  'values/ic_launcher_background.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Tło ikony adaptacyjnej – zgodne z motywem aplikacji. -->
    <color name="ic_launcher_background">#0A0B0F</color>
</resources>
`,

  'values/styles.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Motyw bazowy – ciemny, żeby przy starcie nie mignęło białe tło. -->
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:windowBackground">@color/tlo</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@color/tlo</item>
        <item name="android:windowBackground">@color/tlo</item>
        <!-- Aplikacja sama rysuje pod paskiem stanu (safe-area w CSS). -->
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`,
}

for (const [wzgledna, tresc] of Object.entries(PLIKI)) {
  const sciezka = join(RES, wzgledna)
  mkdirSync(dirname(sciezka), { recursive: true })
  writeFileSync(sciezka, tresc, 'utf8')
  console.log(`zapisano ${wzgledna}`)
}

// Nazwa aplikacji – Capacitor bierze ją z capacitor.config.ts, ale po
// ponownym wygenerowaniu projektu warto się upewnić.
const strings = join(RES, 'values', 'strings.xml')
if (existsSync(strings)) {
  const tresc = readFileSync(strings, 'utf8')
  if (!tresc.includes('BTC Sygnały')) {
    console.log('UWAGA: strings.xml nie zawiera nazwy „BTC Sygnały” – sprawdź capacitor.config.ts')
  }
}

/**
 * Wersja widoczna w ustawieniach Androida.
 *
 * Szablon Capacitora wpisuje na sztywno versionName "1.0", więc każda kolejna
 * instalacja wyglądałaby na tę samą wersję. Podmieniamy ją na znacznik wydania,
 * a versionCode na numer budowania — inaczej Android potrafi odmówić instalacji
 * nowszego pliku, uznając go za tę samą wersję.
 */
const buildGradle = join(KORZEN, 'android', 'app', 'build.gradle')
const wersja = (process.env.WERSJA_APLIKACJI ?? '').replace(/^v/, '')
const numerBudowania = Number(process.env.NUMER_BUDOWANIA ?? '')

if (existsSync(buildGradle) && wersja && Number.isFinite(numerBudowania) && numerBudowania > 0) {
  let tresc = readFileSync(buildGradle, 'utf8')
  const przed = tresc
  tresc = tresc
    .replace(/versionCode\s+\d+/, `versionCode ${numerBudowania}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${wersja}"`)
  if (tresc !== przed) {
    writeFileSync(buildGradle, tresc, 'utf8')
    console.log(`zapisano wersję w build.gradle: ${wersja} (kod ${numerBudowania})`)
  }
} else if (existsSync(buildGradle)) {
  console.log('Brak WERSJA_APLIKACJI / NUMER_BUDOWANIA – zostawiam wersję z szablonu.')
}

// ------------------------------------------------------------------ aktualizator

/**
 * Natywny moduł aktualizatora i zmieniona MainActivity. Źródła leżą w repo
 * w `natywne/android/` – tu tylko kopiujemy je do generowanego projektu.
 */
const PAKIET = join(KORZEN, 'android', 'app', 'src', 'main', 'java', 'pl', 'btcsygnaly', 'app')
const ZRODLA_NATYWNE = join(KORZEN, 'natywne', 'android')
const PLIKI_NATYWNE = ['AktualizatorPlugin.java', 'MainActivity.java']

// W CI brak aktualizatora ma przerwać build – wcześniej brak źródeł kończył się
// tylko ostrzeżeniem i wyszło wydanie bez aktualizatora, czego nikt nie zauważył.
const wymagany = process.env.WYMAGAJ_AKTUALIZATORA === '1'
const brakuje = [
  ...(existsSync(PAKIET) ? [] : [`katalogu pakietu ${PAKIET}`]),
  ...PLIKI_NATYWNE.filter((p) => !existsSync(join(ZRODLA_NATYWNE, p))).map(
    (p) => `źródła natywne/android/${p} (czy nie jest w .gitignore?)`,
  ),
]

if (brakuje.length === 0) {
  for (const plik of PLIKI_NATYWNE) {
    writeFileSync(join(PAKIET, plik), readFileSync(join(ZRODLA_NATYWNE, plik), 'utf8'), 'utf8')
    console.log(`zapisano java/${plik}`)
  }
} else {
  console.log(`UWAGA: aktualizator nie zostanie dodany – brakuje: ${brakuje.join('; ')}`)
  if (wymagany) {
    console.error('Przerywam: WYMAGAJ_AKTUALIZATORA=1, a wydanie bez aktualizatora nie może powstać.')
    process.exit(1)
  }
}

// Uprawnienie do uruchamiania instalatora pobranego APK.
const manifest = join(KORZEN, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
if (existsSync(manifest)) {
  let tresc = readFileSync(manifest, 'utf8')
  const uprawnienie = '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
  if (!tresc.includes('REQUEST_INSTALL_PACKAGES')) {
    tresc = tresc.replace(
      /(<uses-permission android:name="android\.permission\.INTERNET" \/>)/,
      `$1\n    ${uprawnienie}`,
    )
    if (!tresc.includes('REQUEST_INSTALL_PACKAGES')) {
      // Szablon się zmienił – dopisujemy przed zamknięciem manifestu.
      tresc = tresc.replace(/<\/manifest>\s*$/, `    ${uprawnienie}\n</manifest>\n`)
    }
    writeFileSync(manifest, tresc, 'utf8')
    console.log('dopisano uprawnienie REQUEST_INSTALL_PACKAGES')
  }
}

// ------------------------------------------------------------------ podpis

/**
 * Stały klucz podpisu.
 *
 * Bez tego każdy build w chmurze dostawał nowy, losowy klucz debug, a Android
 * odmawia zainstalowania aktualizacji podpisanej innym kluczem niż wersja już
 * zainstalowana („Nie zainstalowano aplikacji”). Sprawdzone: v1.0.5 i v1.0.6
 * miały różne odciski SHA-256, więc aktualizacje nie mogły działać.
 *
 * Klucz przychodzi z sekretów repozytorium przez zmienne środowiskowe —
 * hasła nie trafiają do pliku, tylko są czytane w chwili budowania.
 */
const MARKER_PODPISU = '// --- stały klucz podpisu (dostosuj-android.mjs) ---'
if (existsSync(buildGradle) && process.env.KLUCZ_PLIK) {
  let tresc = readFileSync(buildGradle, 'utf8')
  if (!tresc.includes(MARKER_PODPISU)) {
    // Drugi blok `android { }` – Gradle łączy go z pierwszym, więc nie trzeba
    // przerabiać wygenerowanego pliku wyrażeniami regularnymi.
    tresc += `
${MARKER_PODPISU}
android {
    signingConfigs {
        stabilny {
            storeFile file(System.getenv("KLUCZ_PLIK"))
            storePassword System.getenv("KLUCZ_HASLO")
            keyAlias System.getenv("KLUCZ_ALIAS")
            keyPassword System.getenv("KLUCZ_HASLO")
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.stabilny }
        release { signingConfig signingConfigs.stabilny }
    }
}
`
    writeFileSync(buildGradle, tresc, 'utf8')
    console.log('dopisano stały klucz podpisu do build.gradle')
  }
} else if (existsSync(buildGradle)) {
  console.log('Brak KLUCZ_PLIK – build dostanie klucz debug z tego komputera.')
}

console.log('\nDostosowania Androida nałożone.')
