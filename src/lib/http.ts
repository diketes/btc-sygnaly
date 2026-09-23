/**
 * Warstwa sieciowa.
 *
 * Natywnie (Android/iOS) używamy CapacitorHttp – żądania idą poza WebView,
 * więc nie obowiązuje CORS. W przeglądarce lecimy zwykłym fetchem: giełdowe API
 * (Binance, CoinGecko, mempool.space, alternative.me) wystawiają nagłówki CORS,
 * więc działają wprost. Kanały RSS ich nie mają – te idą przez proxy.
 */

import { CapacitorHttp } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'

export const NATYWNIE = Capacitor.isNativePlatform()
export const TRYB_DEV = import.meta.env?.DEV ?? false

export class BladSieci extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'BladSieci'
  }
}

export interface OpcjeZadania {
  /** Limit czasu w ms (domyślnie 12 s). */
  timeout?: number
  /** Ile razy ponowić przy błędzie sieci (domyślnie 2). */
  powtorzenia?: number
  naglowki?: Record<string, string>
  sygnal?: AbortSignal
}

function poczekaj(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchZTimeoutem(
  url: string,
  opcje: OpcjeZadania,
): Promise<Response> {
  const kontroler = new AbortController()
  const czas = setTimeout(() => kontroler.abort(), opcje.timeout ?? 12_000)
  const odpiecie = () => kontroler.abort()
  opcje.sygnal?.addEventListener('abort', odpiecie)
  try {
    return await fetch(url, {
      signal: kontroler.signal,
      headers: opcje.naglowki,
      cache: 'no-store',
    })
  } finally {
    clearTimeout(czas)
    opcje.sygnal?.removeEventListener('abort', odpiecie)
  }
}

/** Pojedyncza próba pobrania – zwraca surowy tekst. */
async function jednaProba(url: string, opcje: OpcjeZadania): Promise<string> {
  if (NATYWNIE) {
    const odp = await CapacitorHttp.request({
      method: 'GET',
      url,
      headers: opcje.naglowki,
      connectTimeout: opcje.timeout ?? 12_000,
      readTimeout: opcje.timeout ?? 12_000,
      responseType: 'text',
    })
    if (odp.status < 200 || odp.status >= 300) {
      throw new BladSieci(`Serwer odpowiedział kodem ${odp.status}`, url, odp.status)
    }
    return typeof odp.data === 'string' ? odp.data : JSON.stringify(odp.data)
  }

  const odp = await fetchZTimeoutem(url, opcje)
  if (!odp.ok) {
    throw new BladSieci(`Serwer odpowiedział kodem ${odp.status}`, url, odp.status)
  }
  return await odp.text()
}

/** Pobiera tekst z ponawianiem i rosnącym odstępem. */
export async function pobierzTekst(url: string, opcje: OpcjeZadania = {}): Promise<string> {
  const proby = (opcje.powtorzenia ?? 2) + 1
  let ostatniBlad: unknown = null
  for (let i = 0; i < proby; i++) {
    try {
      return await jednaProba(url, opcje)
    } catch (e) {
      ostatniBlad = e
      // Błędów 4xx nie ma sensu ponawiać – to nie jest problem sieci.
      if (e instanceof BladSieci && e.status && e.status >= 400 && e.status < 500) break
      if (opcje.sygnal?.aborted) break
      if (i < proby - 1) await poczekaj(400 * 2 ** i)
    }
  }
  throw ostatniBlad instanceof Error
    ? ostatniBlad
    : new BladSieci('Nie udało się pobrać danych', url)
}

export async function pobierzJson<T>(url: string, opcje: OpcjeZadania = {}): Promise<T> {
  const tekst = await pobierzTekst(url, opcje)
  try {
    return JSON.parse(tekst) as T
  } catch {
    throw new BladSieci('Odpowiedź serwera nie jest poprawnym JSON-em', url)
  }
}

/**
 * Proxy dla źródeł bez nagłówków CORS (kanały RSS, kalendarz makro).
 * Dotyczy wyłącznie przeglądarki i PWA – natywnie pobieramy wprost.
 *
 * Darmowe proxy bywają przeciążone i odpowiadają 403/401/429, dlatego jest ich
 * kilka i próbujemy po kolei. Część zwraca treść opakowaną w JSON – stąd pole
 * `rozpakuj`.
 */
interface Proxy {
  nazwa: string
  zbuduj: (url: string) => string
  rozpakuj?: (odpowiedz: string) => string
}

const PROXY: Proxy[] = [
  // W trybie deweloperskim korzystamy z proxy serwera Vite – żądanie wychodzi
  // z serwera, więc CORS w ogóle nie wchodzi w grę i nie zużywamy limitów
  // publicznych proxy przy każdym przeładowaniu.
  ...(TRYB_DEV && !NATYWNIE
    ? [
        {
          nazwa: 'vite/dev',
          zbuduj: (u: string) => `/proxy/pobierz?url=${encodeURIComponent(u)}`,
        },
      ]
    : []),
  {
    nazwa: 'allorigins/raw',
    zbuduj: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  },
  {
    nazwa: 'codetabs',
    zbuduj: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  },
  {
    nazwa: 'allorigins/get',
    zbuduj: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    rozpakuj: (o) => {
      const dane = JSON.parse(o) as { contents?: string }
      if (typeof dane.contents !== 'string') throw new Error('Brak pola contents')
      return dane.contents
    },
  },
  {
    nazwa: 'corsproxy.io',
    zbuduj: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  },
  {
    nazwa: 'whateverorigin',
    zbuduj: (u) => `https://www.whateverorigin.org/get?url=${encodeURIComponent(u)}`,
    rozpakuj: (o) => {
      const dane = JSON.parse(o) as { contents?: string }
      if (typeof dane.contents !== 'string') throw new Error('Brak pola contents')
      return dane.contents
    },
  },
]

/** Proxy, które ostatnio zadziałało – próbujemy go najpierw. */
let udaneProxy: string | null = null

/** Pobiera dokument XML/JSON, obchodząc CORS tam, gdzie trzeba. */
export async function pobierzKanal(url: string, opcje: OpcjeZadania = {}): Promise<string> {
  if (NATYWNIE) return pobierzTekst(url, opcje)

  const kolejnosc = udaneProxy
    ? [...PROXY.filter((p) => p.nazwa === udaneProxy), ...PROXY.filter((p) => p.nazwa !== udaneProxy)]
    : PROXY

  let ostatniBlad: unknown = null
  for (const p of kolejnosc) {
    try {
      const surowe = await pobierzTekst(p.zbuduj(url), { ...opcje, powtorzenia: 0 })
      const tekst = p.rozpakuj ? p.rozpakuj(surowe) : surowe
      if (tekst.trim().length > 0) {
        udaneProxy = p.nazwa
        return tekst
      }
    } catch (e) {
      ostatniBlad = e
    }
  }
  throw ostatniBlad instanceof Error
    ? ostatniBlad
    : new BladSieci('Żadne proxy nie zwróciło treści', url)
}

/** Czy urządzenie ma połączenie (bez pewności, że API odpowiada). */
export function czyOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}
