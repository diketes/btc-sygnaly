/** Parsowanie kanałów RSS 2.0 i Atom do wspólnego kształtu. */

import { XMLParser } from 'fast-xml-parser'
import { NATYWNIE, pobierzKanal } from '@/lib/http'
import type { SurowyNews } from './dedup'
import type { Zrodlo } from './zrodla'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
})

function tekst(x: unknown): string {
  if (typeof x === 'string') return x
  if (typeof x === 'number') return String(x)
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    if (typeof o['#text'] === 'string') return o['#text']
    if (typeof o['@href'] === 'string') return o['@href']
  }
  return ''
}

function bezHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function doTablicy<T>(x: T | T[] | undefined): T[] {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

function dataZTekstu(s: string, zapasowa: number): number {
  if (!s) return zapasowa
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : zapasowa
}

/** Wyciąga adres artykułu z wpisu Atom (link może być tablicą z rel="alternate"). */
function linkAtom(wpis: Record<string, unknown>): string {
  const linki = doTablicy(wpis.link as unknown)
  for (const l of linki) {
    const o = l as Record<string, unknown>
    if (typeof o === 'string') return o
    if (o['@rel'] === undefined || o['@rel'] === 'alternate') {
      const href = o['@href']
      if (typeof href === 'string') return href
    }
  }
  return tekst(linki[0])
}

export function parsujKanal(xml: string, zrodlo: Zrodlo, teraz = Date.now()): SurowyNews[] {
  let dokument: Record<string, unknown>
  try {
    dokument = parser.parse(xml) as Record<string, unknown>
  } catch {
    return []
  }

  const out: SurowyNews[] = []

  // --- RSS 2.0 ---
  const rss = dokument.rss as Record<string, unknown> | undefined
  const kanal = rss?.channel as Record<string, unknown> | undefined
  if (kanal) {
    for (const wpis of doTablicy(kanal.item as Record<string, unknown> | Record<string, unknown>[])) {
      const tytul = bezHtml(tekst(wpis.title))
      const url = tekst(wpis.link) || tekst(wpis.guid)
      if (!tytul || !url) continue
      out.push({
        tytul,
        opis: bezHtml(tekst(wpis.description) || tekst(wpis['content:encoded'])).slice(0, 600),
        url,
        zrodlo: zrodlo.nazwa,
        data: dataZTekstu(tekst(wpis.pubDate) || tekst(wpis['dc:date']), teraz),
        jezyk: zrodlo.jezyk,
      })
    }
    return out
  }

  // --- Atom ---
  const feed = dokument.feed as Record<string, unknown> | undefined
  if (feed) {
    for (const wpis of doTablicy(feed.entry as Record<string, unknown> | Record<string, unknown>[])) {
      const tytul = bezHtml(tekst(wpis.title))
      const url = linkAtom(wpis)
      if (!tytul || !url) continue
      out.push({
        tytul,
        opis: bezHtml(tekst(wpis.summary) || tekst(wpis.content)).slice(0, 600),
        url,
        zrodlo: zrodlo.nazwa,
        data: dataZTekstu(tekst(wpis.updated) || tekst(wpis.published), teraz),
        jezyk: zrodlo.jezyk,
      })
    }
  }

  return out
}

/**
 * Awaryjne źródło dla przeglądarki i PWA.
 *
 * Kanały RSS nie wystawiają nagłówków CORS, więc w przeglądarce muszą iść przez
 * pośrednika. Gdy darmowe proxy nie odpowiadają (a potrafią padać na całe
 * godziny), sięgamy po usługę, która sama czyta RSS i oddaje gotowy JSON
 * z nagłówkiem `Access-Control-Allow-Origin: *`.
 *
 * Natywnie na telefonie nic z tego nie jest potrzebne – CapacitorHttp pobiera
 * kanały wprost.
 */
interface PozycjaRss2Json {
  title?: string
  link?: string
  guid?: string
  pubDate?: string
  description?: string
  content?: string
}

async function pobierzPrzezRss2Json(zrodlo: Zrodlo, teraz = Date.now()): Promise<SurowyNews[]> {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(zrodlo.url)}`
  const odp = await fetch(url, { cache: 'no-store' })
  if (!odp.ok) throw new Error(`rss2json odpowiedział kodem ${odp.status}`)

  const dane = (await odp.json()) as { status?: string; items?: PozycjaRss2Json[] }
  if (dane.status !== 'ok' || !Array.isArray(dane.items)) {
    throw new Error('rss2json nie zwrócił pozycji')
  }

  const out: SurowyNews[] = []
  for (const p of dane.items) {
    const tytul = bezHtml(p.title ?? '')
    const link = p.link || p.guid || ''
    if (!tytul || !link) continue
    out.push({
      tytul,
      opis: bezHtml(p.description || p.content || '').slice(0, 600),
      url: link,
      zrodlo: zrodlo.nazwa,
      data: dataZTekstu(p.pubDate ?? '', teraz),
      jezyk: zrodlo.jezyk,
    })
  }
  return out
}

export interface WynikPobrania {
  newsy: SurowyNews[]
  bledy: { zrodlo: string; komunikat: string }[]
  /** Ile kanałów udało się pobrać (do oceny, czy problem jest globalny). */
  udane: number
}

/** Pobiera wszystkie kanały równolegle. Padnięty kanał nie blokuje pozostałych. */
export async function pobierzKanaly(zrodla: readonly Zrodlo[]): Promise<WynikPobrania> {
  const wyniki = await Promise.allSettled(
    zrodla.map(async (z) => {
      try {
        const xml = await pobierzKanal(z.url, { timeout: 15_000, powtorzenia: 1 })
        const pozycje = parsujKanal(xml, z)
        if (pozycje.length > 0) return pozycje
        throw new Error('kanał nie zawierał pozycji')
      } catch (blad) {
        // Ostatnia szansa: usługa czytająca RSS po stronie serwera.
        if (NATYWNIE) throw blad
        return await pobierzPrzezRss2Json(z)
      }
    }),
  )

  const newsy: SurowyNews[] = []
  const bledy: { zrodlo: string; komunikat: string }[] = []
  let udane = 0

  wyniki.forEach((w, i) => {
    if (w.status === 'fulfilled' && w.value.length > 0) {
      newsy.push(...w.value)
      udane++
    } else {
      bledy.push({
        zrodlo: zrodla[i].nazwa,
        komunikat:
          w.status === 'rejected'
            ? w.reason instanceof Error
              ? w.reason.message
              : 'nie udało się pobrać'
            : 'kanał pusty',
      })
    }
  })

  return { newsy, bledy, udane }
}
