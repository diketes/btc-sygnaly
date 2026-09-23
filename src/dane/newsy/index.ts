/**
 * Spinacz modułu newsów: pobranie kanałów → deduplikacja → ocena → zapis.
 *
 * Kluczowa gwarancja: `noweDoPowiadomienia` zawiera wyłącznie klastry, o których
 * użytkownik jeszcze nie był powiadamiany. Klaster raz oznaczony jako
 * powiadomiony nigdy nie wraca, nawet gdy dopisze się do niego kolejne źródło.
 */

import { NATYWNIE } from '@/lib/http'
import { wczytajIndeks, wczytajKlastry, wyczyscStareNewsy, zapiszIndeks, zapiszKlastry, type ZapisKlastra } from '../db'
import { IndeksDeduplikacji, przetworzPartie, type Klaster } from './dedup'
import { ocenNews, type OcenaNewsa } from './ocena'
import { pobierzKanaly } from './rss'
import { ZRODLA, type Zrodlo } from './zrodla'

export type { Klaster } from './dedup'
export type { OcenaNewsa } from './ocena'

export interface WynikOdswiezenia {
  klastry: ZapisKlastra[]
  /** Nowe historie, o których wolno wysłać powiadomienie. */
  noweDoPowiadomienia: ZapisKlastra[]
  statystyki: {
    pobrane: number
    nowe: number
    wzbogacone: number
    odrzuconeUrl: number
    odrzuconeSimhash: number
    odrzuconeJaccard: number
  }
  bledy: { zrodlo: string; komunikat: string }[]
  /** Wypełnione, gdy nie udało się pobrać ŻADNEGO kanału – wyjaśnia dlaczego. */
  komunikatOgolny: string | null
  czas: number
}

let indeks: IndeksDeduplikacji | null = null
let mapaKlastrow = new Map<string, ZapisKlastra>()
let zaladowano = false

function doZapisu(k: Klaster, ocena: OcenaNewsa, przeczytany = false): ZapisKlastra {
  return { ...k, ocena, przeczytany }
}

/** Wczytuje indeks i klastry z bazy – raz na uruchomienie aplikacji. */
export async function przygotujNewsy(): Promise<ZapisKlastra[]> {
  if (zaladowano && indeks) return [...mapaKlastrow.values()]

  await wyczyscStareNewsy(30)
  const [wpisy, klastry] = await Promise.all([wczytajIndeks(), wczytajKlastry()])

  indeks = new IndeksDeduplikacji(wpisy)
  indeks.wyczyscStare()
  mapaKlastrow = new Map(klastry.map((k) => [k.id, k]))
  zaladowano = true

  return klastry
}

export interface OpcjeOdswiezenia {
  /** Identyfikatory włączonych źródeł. */
  wlaczoneZrodla?: string[]
  teraz?: number
}

export async function odswiezNewsy(opcje: OpcjeOdswiezenia = {}): Promise<WynikOdswiezenia> {
  const teraz = opcje.teraz ?? Date.now()
  await przygotujNewsy()
  if (!indeks) throw new Error('Indeks deduplikacji nie został przygotowany')

  const wybrane: Zrodlo[] = opcje.wlaczoneZrodla
    ? ZRODLA.filter((z) => opcje.wlaczoneZrodla!.includes(z.id))
    : ZRODLA.filter((z) => z.domyslnieWlaczone)

  const { newsy, bledy, udane } = await pobierzKanaly(wybrane)

  // Gdy padły wszystkie kanały, wina prawie na pewno leży po stronie pośrednika,
  // a nie pojedynczego serwisu – warto powiedzieć to wprost zamiast pokazywać
  // pustą listę bez wyjaśnienia.
  const komunikatOgolny =
    udane === 0 && wybrane.length > 0
      ? NATYWNIE
        ? 'Nie udało się pobrać żadnego kanału — sprawdź połączenie z internetem.'
        : 'Żaden kanał nie odpowiedział. W przeglądarce newsy muszą iść przez publiczne ' +
          'pośredniki (kanały RSS nie zezwalają na bezpośredni odczyt), a te bywają ' +
          'chwilowo przeciążone. W aplikacji na Androida i w wersji natywnej pobieranie ' +
          'działa wprost i ten problem nie występuje.'
      : null

  // Odrzucamy pozycje bez sensownej daty albo starsze niż tydzień.
  const swieze = newsy.filter(
    (n) => Number.isFinite(n.data) && teraz - n.data < 7 * 86_400_000 && n.data <= teraz + 3_600_000,
  )

  // Mapa klastrów w postaci „gołej” – przetworzPartie nie zna pól zapisu.
  const gole = new Map<string, Klaster>(
    [...mapaKlastrow.entries()].map(([id, k]) => [
      id,
      {
        id: k.id,
        tytul: k.tytul,
        opis: k.opis,
        jezyk: k.jezyk,
        pierwszaData: k.pierwszaData,
        ostatniaData: k.ostatniaData,
        zrodla: k.zrodla,
        powiadomiono: k.powiadomiono,
      },
    ]),
  )

  const wynik = await przetworzPartie(swieze, indeks, gole)

  // Przepisujemy z powrotem, dorabiając ocenę i zachowując flagi.
  for (const [id, k] of gole) {
    const stary = mapaKlastrow.get(id)
    const dotkniety =
      wynik.nowe.some((n) => n.id === id) || wynik.wzbogacone.some((n) => n.id === id)
    if (!stary) {
      mapaKlastrow.set(id, doZapisu(k, ocenNews(k, teraz)))
    } else if (dotkniety) {
      // Ocena przeliczana tylko dla ruszonych klastrów – reszta nie zmieniła treści.
      mapaKlastrow.set(id, { ...stary, ...k, ocena: ocenNews(k, teraz) })
    }
  }

  // Wpływ zależy też od świeżości, więc starsze klastry z czasem tracą wagę.
  for (const [id, k] of mapaKlastrow) {
    if (teraz - k.ostatniaData > 6 * 3_600_000 && k.ocena.wplyw > 3) {
      mapaKlastrow.set(id, { ...k, ocena: ocenNews(k, teraz) })
    }
  }

  const noweDoPowiadomienia = wynik.nowe
    .map((n) => mapaKlastrow.get(n.id))
    .filter((k): k is ZapisKlastra => !!k && !k.powiadomiono)

  const wszystkie = [...mapaKlastrow.values()].sort((a, b) => b.pierwszaData - a.pierwszaData)

  await Promise.all([zapiszKlastry(wszystkie), zapiszIndeks(indeks.eksportuj())])

  return {
    klastry: wszystkie,
    noweDoPowiadomienia,
    statystyki: {
      pobrane: newsy.length,
      nowe: wynik.nowe.length,
      wzbogacone: wynik.wzbogacone.length,
      odrzuconeUrl: wynik.odrzucone.url,
      odrzuconeSimhash: wynik.odrzucone.simhash,
      odrzuconeJaccard: wynik.odrzucone.jaccard,
    },
    bledy,
    komunikatOgolny,
    czas: teraz,
  }
}

/** Oznacza klastry jako już zgłoszone – po wysłaniu powiadomień. */
export async function oznaczPowiadomione(idy: string[]): Promise<void> {
  const zmienione: ZapisKlastra[] = []
  for (const id of idy) {
    const k = mapaKlastrow.get(id)
    if (k && !k.powiadomiono) {
      const nowy = { ...k, powiadomiono: true }
      mapaKlastrow.set(id, nowy)
      zmienione.push(nowy)
    }
  }
  if (zmienione.length > 0) await zapiszKlastry(zmienione)
}

export async function oznaczPrzeczytane(idy: string[]): Promise<void> {
  const zmienione: ZapisKlastra[] = []
  for (const id of idy) {
    const k = mapaKlastrow.get(id)
    if (k && !k.przeczytany) {
      const nowy = { ...k, przeczytany: true }
      mapaKlastrow.set(id, nowy)
      zmienione.push(nowy)
    }
  }
  if (zmienione.length > 0) await zapiszKlastry(zmienione)
}

/** Klastry o wpływie ≥ próg z ostatnich `godzin` – sekcja „Co może ruszyć BTC”. */
export function coMozeRuszycBtc(
  klastry: readonly ZapisKlastra[],
  prog = 7,
  godzin = 24,
  teraz = Date.now(),
): ZapisKlastra[] {
  return klastry
    .filter((k) => k.ocena.wplyw >= prog && teraz - k.pierwszaData <= godzin * 3_600_000)
    .sort((a, b) => b.ocena.wplyw - a.ocena.wplyw || b.pierwszaData - a.pierwszaData)
}

/** Czy w ostatnich `minut` pojawił się news mogący wywrócić rynek. */
export function ryzykoZNewsow(
  klastry: readonly ZapisKlastra[],
  minut = 60,
  teraz = Date.now(),
): { wysokie: boolean; powod: string | null } {
  const granica = teraz - minut * 60_000
  const k = klastry
    .filter((x) => x.ocena.wplyw >= 8 && x.pierwszaData >= granica)
    .sort((a, b) => b.ocena.wplyw - a.ocena.wplyw)[0]
  if (!k) return { wysokie: false, powod: null }
  return { wysokie: true, powod: `Świeży news o dużej wadze: „${k.tytul.slice(0, 80)}”` }
}

/** Czyści pamięć podręczną modułu (używane w testach). */
export function zresetujModulNewsow(): void {
  indeks = null
  mapaKlastrow = new Map()
  zaladowano = false
}
