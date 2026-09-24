/**
 * Stan aktualizacji aplikacji.
 *
 * Przebieg w aplikacji na Androida:
 *   sprawdzenie → (Wi-Fi) pobranie w tle → „Aktualizacja gotowa” → Zainstaluj
 *   → systemowy ekran instalacji → użytkownik potwierdza.
 *
 * Przez Wi-Fi plik ściąga się sam, bez pytania. Na danych komórkowych
 * aplikacja tylko informuje i czeka na „Pobierz” — nie zużywa komuś pakietu
 * bez jego wiedzy. Instalacji nigdy nie da się pominąć: Android wymaga
 * potwierdzenia przez człowieka przy każdej aplikacji spoza sklepu.
 *
 * W PWA (iPhone, przeglądarka) aktualizację przynosi service worker –
 * wystarczy odświeżyć.
 */

import { create } from 'zustand'
import { Network } from '@capacitor/network'
import { sprawdzAktualizacje, type Aktualizacja } from '@/dane/aktualizacje'
import {
  czyAktualizatorDostepny,
  otworzUstawieniaInstalacji,
  otworzWPrzegladarce,
  pobierzAktualizacje,
  pobranaWersja,
  zainstalujAktualizacje,
} from '@/lib/aktualizator'
import { NATYWNIE } from '@/lib/http'
import { uzyjUstawien } from './ustawienia'

export type EtapAktualizacji =
  | 'brak'
  | 'dostepna'
  | 'pobieranie'
  | 'gotowa'
  | 'wymagana-zgoda'
  | 'blad'
  | 'pwa-gotowa'

interface StanAktualizacji {
  etap: EtapAktualizacji
  aktualizacja: Aktualizacja | null
  procent: number
  komunikat: string | null
  /** Czy ta wersja aplikacji ma natywny aktualizator (starsze APK go nie mają). */
  wbudowanyAktualizator: boolean
  ostatnieSprawdzenie: number | null

  sprawdz: (reczne?: boolean) => Promise<void>
  pobierz: () => Promise<void>
  zainstaluj: () => Promise<void>
  zezwolNaInstalacje: () => Promise<void>
  /** Po powrocie z ustawień systemu – czy użytkownik już zezwolił. */
  powrotZUstawien: () => Promise<void>
  zglosPwa: () => void
  ukryj: () => void
}

async function naWifi(): Promise<boolean> {
  try {
    const stan = await Network.getStatus()
    return stan.connected && stan.connectionType === 'wifi'
  } catch {
    // Brak informacji o sieci – nie ryzykujemy pobierania na danych.
    return false
  }
}

export const uzyjAktualizacji = create<StanAktualizacji>((set, get) => ({
  etap: 'brak',
  aktualizacja: null,
  procent: 0,
  komunikat: null,
  wbudowanyAktualizator: false,
  ostatnieSprawdzenie: null,

  async sprawdz(reczne = false) {
    const wbudowany = await czyAktualizatorDostepny()
    set({ wbudowanyAktualizator: wbudowany })

    // W trakcie pobierania albo gdy plik czeka na instalację – nie zaczynamy od nowa.
    const { etap } = get()
    if (etap === 'pobieranie') return

    let a: Aktualizacja | null
    try {
      a = await sprawdzAktualizacje(reczne)
    } catch {
      if (reczne) set({ komunikat: 'Nie udało się sprawdzić aktualizacji.' })
      return
    } finally {
      set({ ostatnieSprawdzenie: Date.now() })
    }

    if (!a) {
      if (etap !== 'pwa-gotowa') set({ etap: 'brak', aktualizacja: null })
      return
    }

    const ustawienia = uzyjUstawien.getState()
    // Wersję odrzuconą przez użytkownika pomijamy przy automatycznych sprawdzeniach.
    if (!reczne && a.wersja === ustawienia.pominietaWersja) return

    set({ aktualizacja: a, komunikat: null })

    if (!wbudowany) {
      set({ etap: 'dostepna' })
      return
    }

    // Plik tej wersji już leży na dysku – od razu proponujemy instalację.
    if ((await pobranaWersja()) === a.wersja) {
      set({ etap: 'gotowa', procent: 100 })
      return
    }

    set({ etap: 'dostepna' })
    if (ustawienia.pobierajAktualizacjeSamodzielnie && (await naWifi())) {
      await get().pobierz()
    }
  },

  async pobierz() {
    const a = get().aktualizacja
    if (!a) return

    if (!get().wbudowanyAktualizator) {
      // Starsza wersja aplikacji albo PWA – jedyne wyjście to przeglądarka.
      otworzWPrzegladarce(a.linkApk)
      return
    }

    set({ etap: 'pobieranie', procent: 0, komunikat: null })
    try {
      await pobierzAktualizacje(a.linkApk, a.wersja, (p) => set({ procent: p }))
      set({ etap: 'gotowa', procent: 100 })
    } catch (e) {
      set({
        etap: 'blad',
        komunikat:
          e instanceof Error
            ? e.message.replace(/^Error:\s*/, '')
            : 'Nie udało się pobrać aktualizacji.',
      })
    }
  },

  async zainstaluj() {
    try {
      const wynik = await zainstalujAktualizacje()
      if (wynik === 'wymagana-zgoda') {
        set({
          etap: 'wymagana-zgoda',
          komunikat:
            'Android pyta raz: zezwól tej aplikacji na instalowanie aktualizacji, potem wróć tutaj.',
        })
      }
    } catch (e) {
      set({
        etap: 'blad',
        komunikat: e instanceof Error ? e.message : 'Nie udało się uruchomić instalatora.',
      })
    }
  },

  async zezwolNaInstalacje() {
    await otworzUstawieniaInstalacji()
  },

  async powrotZUstawien() {
    if (get().etap !== 'wymagana-zgoda') return
    // Użytkownik wrócił z ustawień – jeśli zezwolił, od razu otwieramy instalator.
    try {
      const wynik = await zainstalujAktualizacje()
      if (wynik === 'instalator-otwarty') set({ etap: 'gotowa', komunikat: null })
    } catch {
      /* zostaje prośba o zgodę */
    }
  },

  zglosPwa() {
    if (!NATYWNIE) set({ etap: 'pwa-gotowa' })
  },

  ukryj() {
    const a = get().aktualizacja
    if (a) uzyjUstawien.getState().ustaw('pominietaWersja', a.wersja)
    set({ etap: 'brak', komunikat: null })
  },
}))
