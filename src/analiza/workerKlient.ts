/**
 * Klient Web Workera – zamienia komunikaty na obietnice.
 *
 * Gdy środowisko nie wspiera workerów (albo coś padnie przy starcie), liczymy
 * na głównym wątku. Aplikacja działa dalej, tylko animacje mogą zamrugać.
 */

import { analizuj } from './silnik'
import type { Horyzont, Interwal } from './profile'
import type { Swieca } from './wskazniki'
import type { KontekstRynku, SwieceWgInterwalu, WynikAnalizy } from './typy'
import type {
  OdpowiedzWorkera,
  WynikWskaznikow,
  ZadanieAnalizy,
  ZadanieWorkera,
  ZadanieWskaznikow,
} from './worker'

/**
 * `Omit` na typie sumarycznym gubi pola wariantów, więc rozkładamy go ręcznie.
 */
type ZadanieBezId = Omit<ZadanieAnalizy, 'id'> | Omit<ZadanieWskaznikow, 'id'>

type Rozwiazanie = { rozwiaz: (w: unknown) => void; odrzuc: (e: Error) => void }

let worker: Worker | null = null
let dostepny = true
let licznik = 0
const oczekujace = new Map<number, Rozwiazanie>()

function pobierzWorkera(): Worker | null {
  if (!dostepny) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (z: MessageEvent<OdpowiedzWorkera>) => {
      const odp = z.data
      const czeka = oczekujace.get(odp.id)
      if (!czeka) return
      oczekujace.delete(odp.id)
      if (odp.typ === 'blad') czeka.odrzuc(new Error(odp.komunikat))
      else czeka.rozwiaz(odp.wynik)
    }
    worker.onerror = () => {
      dostepny = false
      for (const [, czeka] of oczekujace) czeka.odrzuc(new Error('Wątek obliczeń przestał działać'))
      oczekujace.clear()
      worker = null
    }
    return worker
  } catch {
    dostepny = false
    return null
  }
}

function wyslij<T>(zadanie: ZadanieBezId): Promise<T> {
  const w = pobierzWorkera()
  if (!w) return Promise.reject(new Error('Worker niedostępny'))
  const id = ++licznik
  return new Promise<T>((rozwiaz, odrzuc) => {
    oczekujace.set(id, { rozwiaz: rozwiaz as (w: unknown) => void, odrzuc })
    w.postMessage({ ...zadanie, id } as ZadanieWorkera)
    // Zabezpieczenie przed zawieszonym zadaniem.
    setTimeout(() => {
      if (oczekujace.has(id)) {
        oczekujace.delete(id)
        odrzuc(new Error('Obliczenia trwały zbyt długo'))
      }
    }, 20_000)
  })
}

export async function policzAnalize(
  horyzonty: Horyzont[],
  swieceWg: SwieceWgInterwalu,
  kontekst: KontekstRynku,
  poprzednie: Partial<Record<Horyzont, { kierunek: 'long' | 'short'; utworzony: number } | null>> = {},
  naZadanie = false,
): Promise<Record<string, WynikAnalizy>> {
  try {
    return await wyslij<Record<string, WynikAnalizy>>({
      typ: 'analiza',
      horyzonty,
      swieceWg,
      kontekst,
      poprzednie,
      naZadanie,
    })
  } catch {
    // Zapas na głównym wątku – lepiej zamrugać niż nie pokazać sygnału.
    const wynik: Record<string, WynikAnalizy> = {}
    for (const h of horyzonty) {
      wynik[h] = analizuj({
        horyzont: h,
        swieceWg,
        kontekst,
        poprzedniSygnal: poprzednie[h] ?? null,
        naZadanie,
      })
    }
    return wynik
  }
}

export async function policzWskaznikiWykresu(
  interwal: Interwal,
  swiece: Swieca[],
  ktore: string[],
): Promise<WynikWskaznikow | null> {
  try {
    return await wyslij<WynikWskaznikow>({ typ: 'wskazniki', interwal, swiece, ktore })
  } catch {
    return null
  }
}

export function czyWorkerDziala(): boolean {
  return dostepny
}
