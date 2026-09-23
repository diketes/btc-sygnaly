/** Ustawienia użytkownika – trzymane w bazie lokalnej, wczytywane przy starcie. */

import { create } from 'zustand'
import { wczytajUstawienia, zapiszUstawienie } from '@/dane/db'
import { domyslneZrodla } from '@/dane/newsy/zrodla'
import type { TrybHoryzontu } from '@/analiza/profile'

export interface Ustawienia {
  /** KRÓTKI, DŁUGI albo OBA naraz – główny przełącznik aplikacji. */
  trybHoryzontu: TrybHoryzontu
  /** Minimalna pewność, przy której wychodzi powiadomienie o sygnale. */
  progPewnosci: number
  /** Minimalny wpływ newsa, przy którym wychodzi powiadomienie. */
  progWplywuNewsa: number
  powiadomieniaSygnaly: boolean
  powiadomieniaCele: boolean
  powiadomieniaNewsy: boolean
  powiadomieniaMakro: boolean
  ciszaNocna: boolean
  ciszaOd: number
  ciszaDo: number
  wlaczoneZrodla: string[]
  /** Wyłącza tło canvas, cząsteczki i żyroskop. */
  oszczedzajBaterie: boolean
  haptyka: boolean
  kapital: number
  ryzykoProc: number
  zaakceptowanoRyzyko: boolean
  wskaznikiWykresu: string[]
  /** Wersja, o której użytkownik nie chce już słyszeć (zamknął pasek). */
  pominietaWersja: string
  sprawdzajAktualizacje: boolean
}

export const DOMYSLNE: Ustawienia = {
  trybHoryzontu: 'oba',
  progPewnosci: 55,
  progWplywuNewsa: 8,
  powiadomieniaSygnaly: true,
  powiadomieniaCele: true,
  powiadomieniaNewsy: true,
  powiadomieniaMakro: true,
  ciszaNocna: true,
  ciszaOd: 23,
  ciszaDo: 7,
  wlaczoneZrodla: domyslneZrodla(),
  oszczedzajBaterie: false,
  haptyka: true,
  kapital: 1000,
  ryzykoProc: 1,
  zaakceptowanoRyzyko: false,
  wskaznikiWykresu: ['ema21', 'ema50', 'ema200', 'poziomy'],
  pominietaWersja: '',
  sprawdzajAktualizacje: true,
}

interface StanUstawien extends Ustawienia {
  wczytane: boolean
  wczytaj: () => Promise<void>
  ustaw: <K extends keyof Ustawienia>(klucz: K, wartosc: Ustawienia[K]) => void
  przelaczZrodlo: (id: string) => void
  przelaczWskaznik: (nazwa: string) => void
  przywrocDomyslne: () => void
}

export const uzyjUstawien = create<StanUstawien>((set, get) => ({
  ...DOMYSLNE,
  wczytane: false,

  async wczytaj() {
    const zapisane = await wczytajUstawienia()
    const scalone: Partial<Ustawienia> = {}
    for (const klucz of Object.keys(DOMYSLNE) as (keyof Ustawienia)[]) {
      if (zapisane[klucz] !== undefined) {
        ;(scalone as Record<string, unknown>)[klucz] = zapisane[klucz]
      }
    }
    set({ ...scalone, wczytane: true })
  },

  ustaw(klucz, wartosc) {
    set({ [klucz]: wartosc } as unknown as Partial<StanUstawien>)
    void zapiszUstawienie(klucz, wartosc)
  },

  przelaczZrodlo(id) {
    const biezace = get().wlaczoneZrodla
    const nowe = biezace.includes(id) ? biezace.filter((z) => z !== id) : [...biezace, id]
    set({ wlaczoneZrodla: nowe })
    void zapiszUstawienie('wlaczoneZrodla', nowe)
  },

  przelaczWskaznik(nazwa) {
    const biezace = get().wskaznikiWykresu
    const nowe = biezace.includes(nazwa)
      ? biezace.filter((w) => w !== nazwa)
      : [...biezace, nazwa]
    set({ wskaznikiWykresu: nowe })
    void zapiszUstawienie('wskaznikiWykresu', nowe)
  },

  przywrocDomyslne() {
    set({ ...DOMYSLNE, zaakceptowanoRyzyko: get().zaakceptowanoRyzyko })
    for (const [k, v] of Object.entries(DOMYSLNE)) {
      if (k === 'zaakceptowanoRyzyko') continue
      void zapiszUstawienie(k, v)
    }
  },
}))

/** Czy o tej porze wolno wysłać powiadomienie. */
export function poraNaPowiadomienie(u: Ustawienia, teraz = new Date()): boolean {
  if (!u.ciszaNocna) return true
  const g = teraz.getHours()
  // Cisza może przechodzić przez północ (np. 23 → 7).
  return u.ciszaOd <= u.ciszaDo ? g < u.ciszaOd || g >= u.ciszaDo : g >= u.ciszaDo && g < u.ciszaOd
}
