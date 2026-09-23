/**
 * Kalendarz wydarzeń makro, które potrafią ruszyć kursem BTC.
 *
 * Źródło główne: darmowy kanał Forex Factory (bez klucza), obejmujący bieżący
 * i przyszły tydzień – czyli dokładnie okres, który ma znaczenie dla sygnałów.
 *
 * Gdy kanał nie odpowiada, wchodzi zapasowy harmonogram wyliczany z reguły
 * (CPI USA publikowane jest w połowie miesiąca). Takie pozycje są JAWNIE
 * oznaczone `pewny: false`, a aplikacja dopisuje przy nich „termin orientacyjny”.
 * Nie podajemy zmyślonych dat jako pewnych.
 */

import { pobierzKanal } from '@/lib/http'

export type WagaWydarzenia = 'wysoka' | 'srednia' | 'niska'

export interface WydarzenieMakro {
  id: string
  nazwa: string
  kraj: string
  czas: number
  waga: WagaWydarzenia
  prognoza: string | null
  poprzednio: string | null
  /** false = termin wyliczony regułą, nie potwierdzony przez kalendarz. */
  pewny: boolean
}

const KANAL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

/** Tłumaczenia najczęstszych pozycji – reszta zostaje w oryginale. */
const TLUMACZENIA: { wzorzec: RegExp; nazwa: string }[] = [
  { wzorzec: /^CPI m\/m/i, nazwa: 'Inflacja CPI USA (m/m)' },
  { wzorzec: /^CPI y\/y/i, nazwa: 'Inflacja CPI USA (r/r)' },
  { wzorzec: /^Core CPI/i, nazwa: 'Inflacja bazowa CPI USA' },
  { wzorzec: /^PPI/i, nazwa: 'Inflacja producencka PPI USA' },
  { wzorzec: /^Core PCE/i, nazwa: 'Inflacja bazowa PCE (ulubiona miara Fed)' },
  { wzorzec: /FOMC Statement/i, nazwa: 'Komunikat FOMC – decyzja o stopach' },
  { wzorzec: /FOMC Press Conference/i, nazwa: 'Konferencja prasowa Powella' },
  { wzorzec: /FOMC Meeting Minutes/i, nazwa: 'Protokół z posiedzenia FOMC' },
  { wzorzec: /Federal Funds Rate/i, nazwa: 'Decyzja Fed o stopach procentowych' },
  { wzorzec: /Non-Farm Employment|NFP/i, nazwa: 'Dane z rynku pracy USA (NFP)' },
  { wzorzec: /Unemployment Rate/i, nazwa: 'Stopa bezrobocia w USA' },
  { wzorzec: /^Retail Sales/i, nazwa: 'Sprzedaż detaliczna USA' },
  { wzorzec: /^GDP/i, nazwa: 'PKB USA' },
  { wzorzec: /Consumer Confidence/i, nazwa: 'Nastroje konsumentów USA' },
  { wzorzec: /Main Refinancing Rate|ECB/i, nazwa: 'Decyzja EBC o stopach' },
  { wzorzec: /Powell Speaks|Fed Chair/i, nazwa: 'Wystąpienie szefa Fed' },
  { wzorzec: /Jobless Claims/i, nazwa: 'Wnioski o zasiłek dla bezrobotnych (USA)' },
]

function przetlumacz(tytul: string): string {
  for (const t of TLUMACZENIA) if (t.wzorzec.test(tytul)) return t.nazwa
  return tytul
}

function waga(impact: string): WagaWydarzenia {
  const i = (impact ?? '').toLowerCase()
  if (i === 'high') return 'wysoka'
  if (i === 'medium') return 'srednia'
  return 'niska'
}

interface SurowePozycjeKanalu {
  title?: string
  country?: string
  date?: string
  impact?: string
  forecast?: string
  previous?: string
}

export async function pobierzKalendarz(): Promise<WydarzenieMakro[]> {
  // Kanał nie wystawia nagłówków CORS, więc w przeglądarce i w PWA musi lecieć
  // przez proxy – natywnie `pobierzKanal` i tak pobiera wprost.
  const tekst = await pobierzKanal(KANAL, { timeout: 15_000, powtorzenia: 1 })
  let dane: SurowePozycjeKanalu[]
  try {
    dane = JSON.parse(tekst) as SurowePozycjeKanalu[]
  } catch {
    throw new Error('Kalendarz zwrócił odpowiedź, której nie da się odczytać')
  }
  if (!Array.isArray(dane)) throw new Error('Kalendarz zwrócił nieoczekiwany format')

  return dane
    .filter((d) => d.country === 'USD' || d.country === 'EUR' || d.country === 'ALL')
    .map((d, i): WydarzenieMakro | null => {
      const czas = d.date ? Date.parse(d.date) : Number.NaN
      if (!Number.isFinite(czas) || !d.title) return null
      return {
        id: `ff-${czas}-${i}`,
        nazwa: przetlumacz(d.title),
        kraj: d.country === 'EUR' ? 'Strefa euro' : 'USA',
        czas,
        waga: waga(d.impact ?? ''),
        prognoza: d.forecast || null,
        poprzednio: d.previous || null,
        pewny: true,
      }
    })
    .filter((x): x is WydarzenieMakro => x !== null)
    .filter((x) => x.waga !== 'niska')
    .sort((a, b) => a.czas - b.czas)
}

/**
 * Zapasowy harmonogram, gdy kanał nie odpowiada.
 * CPI USA publikowane jest zwykle między 10. a 15. dniem miesiąca o 14:30 CET.
 * To REGUŁA, nie potwierdzony termin – stąd `pewny: false`.
 */
export function zapasowyKalendarz(teraz = Date.now(), miesiecy = 6): WydarzenieMakro[] {
  const out: WydarzenieMakro[] = []
  const start = new Date(teraz)

  for (let i = 0; i <= miesiecy; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 12, 12, 30))
    // Publikacje nie wypadają w weekend – przesuwamy na poniedziałek.
    const dzien = d.getUTCDay()
    if (dzien === 6) d.setUTCDate(d.getUTCDate() + 2)
    if (dzien === 0) d.setUTCDate(d.getUTCDate() + 1)
    if (d.getTime() <= teraz) continue

    out.push({
      id: `zapas-cpi-${d.getTime()}`,
      nazwa: 'Inflacja CPI USA',
      kraj: 'USA',
      czas: d.getTime(),
      waga: 'wysoka',
      prognoza: null,
      poprzednio: null,
      pewny: false,
    })
  }
  return out
}

export interface StanKalendarza {
  wydarzenia: WydarzenieMakro[]
  zrodloDziala: boolean
  komunikat: string | null
}

export async function pobierzKalendarzZZapasem(teraz = Date.now()): Promise<StanKalendarza> {
  try {
    const wydarzenia = await pobierzKalendarz()
    if (wydarzenia.length > 0) {
      return { wydarzenia, zrodloDziala: true, komunikat: null }
    }
    return {
      wydarzenia: zapasowyKalendarz(teraz),
      zrodloDziala: false,
      komunikat: 'Kalendarz nie zwrócił wydarzeń – pokazuję terminy orientacyjne.',
    }
  } catch {
    return {
      wydarzenia: zapasowyKalendarz(teraz),
      zrodloDziala: false,
      komunikat: 'Brak połączenia z kalendarzem makro – terminy poniżej są orientacyjne.',
    }
  }
}

/** Najbliższe wydarzenie o wysokiej wadze (do oceny ryzyka sygnału). */
export function najblizszeWysokiegoRyzyka(
  wydarzenia: readonly WydarzenieMakro[],
  teraz = Date.now(),
): WydarzenieMakro | null {
  return (
    wydarzenia
      .filter((w) => w.waga === 'wysoka' && w.czas > teraz)
      .sort((a, b) => a.czas - b.czas)[0] ?? null
  )
}

/** Czy w ciągu `godzin` wypada wydarzenie, które może wywrócić stolik. */
export function ryzykoMakro(
  wydarzenia: readonly WydarzenieMakro[],
  godzin = 2,
  teraz = Date.now(),
): { wysokie: boolean; powod: string | null } {
  const okno = teraz + godzin * 3_600_000
  const w = wydarzenia.find((x) => x.waga === 'wysoka' && x.czas > teraz && x.czas <= okno)
  if (!w) return { wysokie: false, powod: null }
  const zostalo = Math.max(1, Math.round((w.czas - teraz) / 60_000))
  const godzinyDo = Math.floor(zostalo / 60)
  const minuty = zostalo % 60
  const czas = godzinyDo > 0 ? `${godzinyDo} h ${minuty} min` : `${minuty} min`
  return {
    wysokie: true,
    powod: `${w.nazwa} za ${czas}${w.pewny ? '' : ' (termin orientacyjny)'}`,
  }
}
