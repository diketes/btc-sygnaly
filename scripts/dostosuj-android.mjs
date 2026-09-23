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

console.log('\nDostosowania Androida nałożone.')
