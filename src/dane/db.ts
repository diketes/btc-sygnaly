/**
 * Baza lokalna (IndexedDB przez Dexie).
 *
 * Uwaga projektowa: pierwotny plan zakładał SQLite natywnie i IndexedDB jako
 * zapas. Zostawiono sam IndexedDB, bo działa identycznie w WebView Androida,
 * w Safari na iPhonie i w PWA – jedna ścieżka kodu zamiast dwóch, przy tych
 * samych możliwościach (ilość danych to tu kilka megabajtów).
 */

import Dexie, { type Table } from 'dexie'
import type { Interwal } from '@/analiza/profile'
import type { Swieca } from '@/analiza/wskazniki'
import type { Sygnal } from '@/analiza/typy'
import type { Klaster, WpisIndeksu } from './newsy/dedup'
import type { OcenaNewsa } from './newsy/ocena'
import type { MigawkaRynku } from './rynek'

export interface ZapisSwiec {
  klucz: Interwal
  dane: Swieca[]
  zapisano: number
}

export interface ZapisKlastra extends Klaster {
  ocena: OcenaNewsa
  przeczytany: boolean
}

export interface Alert {
  id?: number
  cena: number
  kierunek: 'powyzej' | 'ponizej'
  utworzony: number
  wyzwolony: boolean
  opis: string
}

export interface ZapisUstawien {
  klucz: string
  wartosc: unknown
}

export interface ZapisMigawki {
  klucz: 'rynek'
  dane: MigawkaRynku
  zapisano: number
}

class BazaBtc extends Dexie {
  swiece!: Table<ZapisSwiec, string>
  sygnaly!: Table<Sygnal, string>
  klastry!: Table<ZapisKlastra, string>
  widzianeNewsy!: Table<WpisIndeksu, string>
  alerty!: Table<Alert, number>
  ustawienia!: Table<ZapisUstawien, string>
  migawki!: Table<ZapisMigawki, string>

  constructor() {
    super('btc-sygnaly')
    this.version(1).stores({
      swiece: 'klucz, zapisano',
      sygnaly: 'id, horyzont, status, utworzony, zamkniety',
      klastry: 'id, pierwszaData, ostatniaData',
      widzianeNewsy: 'id, data, klasterId',
      alerty: '++id, cena, wyzwolony',
      ustawienia: 'klucz',
      migawki: 'klucz',
    })
  }
}

export const db = new BazaBtc()

let bazaDziala = true

/** Owija operację bazy – awaria IndexedDB nie może wywrócić aplikacji. */
async function bezpiecznie<T>(operacja: () => Promise<T>, domyslna: T): Promise<T> {
  if (!bazaDziala) return domyslna
  try {
    return await operacja()
  } catch (e) {
    console.warn('Operacja na bazie lokalnej nie powiodła się:', e)
    // Tryb prywatny lub zablokowane dane witryny – działamy dalej bez zapisu.
    if (e instanceof Error && /InvalidState|SecurityError|QuotaExceeded/.test(e.name)) {
      bazaDziala = false
    }
    return domyslna
  }
}

export function czyBazaDziala(): boolean {
  return bazaDziala
}

// ------------------------------------------------------------------ świece

export function zapiszSwiece(interwal: Interwal, dane: Swieca[]): Promise<void> {
  return bezpiecznie(async () => {
    // Trzymamy maksymalnie 1000 świec na interwał – tyle liczy silnik.
    await db.swiece.put({ klucz: interwal, dane: dane.slice(-1000), zapisano: Date.now() })
  }, undefined)
}

export function wczytajSwiece(interwal: Interwal): Promise<ZapisSwiec | null> {
  return bezpiecznie(async () => (await db.swiece.get(interwal)) ?? null, null)
}

export function wczytajWszystkieSwiece(): Promise<ZapisSwiec[]> {
  return bezpiecznie(() => db.swiece.toArray(), [])
}

// ------------------------------------------------------------------ sygnały

export function zapiszSygnal(s: Sygnal): Promise<void> {
  return bezpiecznie(async () => {
    await db.sygnaly.put(s)
  }, undefined)
}

export function zapiszSygnaly(lista: Sygnal[]): Promise<void> {
  return bezpiecznie(async () => {
    await db.sygnaly.bulkPut(lista)
  }, undefined)
}

export function wczytajSygnaly(): Promise<Sygnal[]> {
  return bezpiecznie(async () => {
    const lista = await db.sygnaly.toArray()
    return lista.sort((a, b) => b.utworzony - a.utworzony)
  }, [])
}

export function usunSygnaly(): Promise<void> {
  return bezpiecznie(async () => {
    await db.sygnaly.clear()
  }, undefined)
}

// ------------------------------------------------------------------ newsy

export function zapiszKlastry(lista: ZapisKlastra[]): Promise<void> {
  return bezpiecznie(async () => {
    await db.klastry.bulkPut(lista)
  }, undefined)
}

export function wczytajKlastry(): Promise<ZapisKlastra[]> {
  return bezpiecznie(async () => {
    const lista = await db.klastry.toArray()
    return lista.sort((a, b) => b.pierwszaData - a.pierwszaData)
  }, [])
}

export function zapiszIndeks(wpisy: WpisIndeksu[]): Promise<void> {
  return bezpiecznie(async () => {
    await db.widzianeNewsy.bulkPut(wpisy)
  }, undefined)
}

export function wczytajIndeks(): Promise<WpisIndeksu[]> {
  return bezpiecznie(() => db.widzianeNewsy.toArray(), [])
}

/** Kasuje wpisy indeksu i klastry starsze niż `dni`. */
export function wyczyscStareNewsy(dni = 30): Promise<number> {
  return bezpiecznie(async () => {
    const granica = Date.now() - dni * 86_400_000
    const usunieteWpisy = await db.widzianeNewsy.where('data').below(granica).delete()
    await db.klastry.where('ostatniaData').below(granica).delete()
    return usunieteWpisy
  }, 0)
}

// ------------------------------------------------------------------ alerty

export function zapiszAlert(a: Alert): Promise<number | undefined> {
  return bezpiecznie(() => db.alerty.put(a), undefined)
}

export function wczytajAlerty(): Promise<Alert[]> {
  return bezpiecznie(() => db.alerty.toArray(), [])
}

export function usunAlert(id: number): Promise<void> {
  return bezpiecznie(async () => {
    await db.alerty.delete(id)
  }, undefined)
}

// ------------------------------------------------------------------ ustawienia

export function zapiszUstawienie(klucz: string, wartosc: unknown): Promise<void> {
  return bezpiecznie(async () => {
    await db.ustawienia.put({ klucz, wartosc })
  }, undefined)
}

export function wczytajUstawienia(): Promise<Record<string, unknown>> {
  return bezpiecznie(async () => {
    const lista = await db.ustawienia.toArray()
    return Object.fromEntries(lista.map((u) => [u.klucz, u.wartosc]))
  }, {})
}

// ------------------------------------------------------------------ migawka rynku

export function zapiszMigawke(dane: MigawkaRynku): Promise<void> {
  return bezpiecznie(async () => {
    await db.migawki.put({ klucz: 'rynek', dane, zapisano: Date.now() })
  }, undefined)
}

export function wczytajMigawke(): Promise<ZapisMigawki | null> {
  return bezpiecznie(async () => (await db.migawki.get('rynek')) ?? null, null)
}

// ------------------------------------------------------------------ reset

export async function wyczyscWszystko(): Promise<void> {
  await bezpiecznie(async () => {
    await Promise.all([
      db.swiece.clear(),
      db.sygnaly.clear(),
      db.klastry.clear(),
      db.widzianeNewsy.clear(),
      db.alerty.clear(),
      db.migawki.clear(),
    ])
  }, undefined)
}
