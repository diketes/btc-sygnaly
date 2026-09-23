/**
 * Sprawdzanie aktualizacji przez GitHuba.
 *
 * Aplikacja instalowana z pliku APK nie ma sklepu, który pilnowałby wersji,
 * więc robi to sama: pyta o najnowsze wydanie w repozytorium i porównuje je
 * z wersją wbudowaną przy budowaniu.
 *
 * W wersji PWA (iPhone, przeglądarka) tego nie robimy — tam aktualizacje
 * przynosi service worker, a plik APK i tak nie miałby zastosowania.
 */

import { NATYWNIE, pobierzJson } from '@/lib/http'

const REPO = 'diketes/btc-sygnaly'
const API_WYDANIA = `https://api.github.com/repos/${REPO}/releases/latest`

/** Wersja wbudowana przy budowaniu; „dev” przy uruchomieniu lokalnym. */
export const WERSJA: string = typeof __WERSJA__ === 'string' ? __WERSJA__ : 'dev'

export const STRONA_WYDAN = `https://github.com/${REPO}/releases/latest`
export const LINK_APK = `https://github.com/${REPO}/releases/latest/download/btc-sygnaly.apk`

export interface Aktualizacja {
  wersja: string
  opis: string
  dataWydania: number
  linkApk: string
  linkStrony: string
  rozmiarBajty: number | null
}

interface SurowieWydanie {
  tag_name?: string
  name?: string
  body?: string
  published_at?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  assets?: { name?: string; browser_download_url?: string; size?: number }[]
}

/**
 * Rozbija znacznik wersji „v1.0.7” na liczby. Zwraca null, gdy znacznik ma
 * inny kształt (np. „dev” albo „web-12”) – wtedy nie ma czego porównywać.
 */
export function rozbijWersje(znacznik: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(znacznik.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Czy `kandydat` jest nowszy od `biezaca`. */
export function czyNowsza(kandydat: string, biezaca: string): boolean {
  const a = rozbijWersje(kandydat)
  const b = rozbijWersje(biezaca)
  // Bez poprawnej wersji bieżącej (np. build deweloperski) nie zaczepiamy użytkownika.
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

/** Czy w tej wersji aplikacji sprawdzanie aktualizacji ma w ogóle sens. */
export function czyWartoSprawdzac(): boolean {
  return NATYWNIE && rozbijWersje(WERSJA) !== null
}

/**
 * Pyta GitHuba o najnowsze wydanie. Zwraca opis aktualizacji tylko wtedy,
 * gdy jest faktycznie nowsza od zainstalowanej.
 */
export async function sprawdzAktualizacje(wymuszone = false): Promise<Aktualizacja | null> {
  if (!wymuszone && !czyWartoSprawdzac()) return null

  const wydanie = await pobierzJson<SurowieWydanie>(API_WYDANIA, {
    timeout: 12_000,
    powtorzenia: 1,
    naglowki: { Accept: 'application/vnd.github+json' },
  })

  const znacznik = wydanie.tag_name
  if (!znacznik || wydanie.draft || wydanie.prerelease) return null
  if (!czyNowsza(znacznik, WERSJA)) return null

  const apk = (wydanie.assets ?? []).find((a) => a.name?.endsWith('.apk'))

  return {
    wersja: znacznik,
    opis: (wydanie.body ?? '').trim(),
    dataWydania: wydanie.published_at ? Date.parse(wydanie.published_at) : Date.now(),
    linkApk: apk?.browser_download_url ?? LINK_APK,
    linkStrony: wydanie.html_url ?? STRONA_WYDAN,
    rozmiarBajty: apk?.size ?? null,
  }
}

/**
 * Sprawdzenie „na żądanie” z ekranu ustawień — działa też w przeglądarce
 * i przy buildzie deweloperskim, żeby dało się je przetestować.
 */
export interface WynikSprawdzenia {
  stan: 'aktualna' | 'dostepna' | 'blad' | 'nieobslugiwane'
  aktualizacja: Aktualizacja | null
  komunikat: string
}

export async function sprawdzNaZadanie(): Promise<WynikSprawdzenia> {
  if (!NATYWNIE) {
    return {
      stan: 'nieobslugiwane',
      aktualizacja: null,
      komunikat:
        'Ta wersja aktualizuje się sama — wystarczy odświeżyć stronę. ' +
        'Sprawdzanie wydań dotyczy aplikacji zainstalowanej z pliku APK.',
    }
  }

  try {
    const a = await sprawdzAktualizacje(true)
    if (!a) {
      return { stan: 'aktualna', aktualizacja: null, komunikat: 'Masz najnowszą wersję.' }
    }
    return {
      stan: 'dostepna',
      aktualizacja: a,
      komunikat: `Dostępna wersja ${a.wersja}.`,
    }
  } catch (e) {
    return {
      stan: 'blad',
      aktualizacja: null,
      komunikat:
        e instanceof Error && /rate limit/i.test(e.message)
          ? 'GitHub chwilowo ogranicza zapytania — spróbuj za kilka minut.'
          : 'Nie udało się sprawdzić aktualizacji. Sprawdź połączenie z internetem.',
    }
  }
}

// ------------------------------------------------------------------ PWA

/**
 * Nasłuchuje aktualizacji service workera (wersja przeglądarkowa i iPhone).
 * Wywołuje `naGotowa`, gdy nowa wersja jest pobrana i czeka na przeładowanie.
 *
 * Zwraca funkcję, która aktywuje nową wersję i przeładowuje stronę.
 */
export function nasluchujAktualizacjiPwa(naGotowa: () => void): () => void {
  if (NATYWNIE || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  let czekajacy: ServiceWorker | null = null

  const zgloszGotowosc = (sw: ServiceWorker | null) => {
    if (!sw) return
    czekajacy = sw
    naGotowa()
  }

  void navigator.serviceWorker.ready
    .then((rejestracja) => {
      // Nowa wersja mogła zostać pobrana, zanim zdążyliśmy się podpiąć.
      if (rejestracja.waiting) zgloszGotowosc(rejestracja.waiting)

      rejestracja.addEventListener('updatefound', () => {
        const nowy = rejestracja.installing
        if (!nowy) return
        nowy.addEventListener('statechange', () => {
          // „installed” przy istniejącym kontrolerze = jest starsza wersja do podmiany.
          if (nowy.state === 'installed' && navigator.serviceWorker.controller) {
            zgloszGotowosc(nowy)
          }
        })
      })

      // Pytamy o aktualizację przy starcie i co pół godziny.
      void rejestracja.update().catch(() => {})
      setInterval(() => void rejestracja.update().catch(() => {}), 30 * 60_000)
    })
    .catch(() => {})

  return () => {
    if (czekajacy) {
      czekajacy.postMessage({ typ: 'PRZEJMIJ' })
      // Przeładowanie po przejęciu kontroli przez nowy service worker.
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
        once: true,
      })
      // Zapas, gdyby zdarzenie nie przyszło.
      setTimeout(() => window.location.reload(), 1500)
    } else {
      window.location.reload()
    }
  }
}
