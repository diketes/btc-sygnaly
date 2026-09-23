/** Stan newsów i kalendarza makro. */

import { create } from 'zustand'
import {
  coMozeRuszycBtc,
  odswiezNewsy,
  oznaczPowiadomione,
  oznaczPrzeczytane,
  przygotujNewsy,
  ryzykoZNewsow,
} from '@/dane/newsy'
import type { ZapisKlastra } from '@/dane/db'
import {
  pobierzKalendarzZZapasem,
  ryzykoMakro,
  type WydarzenieMakro,
} from '@/dane/newsy/kalendarz'
import { powiadom } from '@/lib/powiadomienia'
import { poraNaPowiadomienie, uzyjUstawien } from './ustawienia'

interface StatystykiOdswiezenia {
  pobrane: number
  nowe: number
  wzbogacone: number
  odrzuconeUrl: number
  odrzuconeSimhash: number
  odrzuconeJaccard: number
}

interface StanNewsow {
  klastry: ZapisKlastra[]
  kalendarz: WydarzenieMakro[]
  kalendarzPewny: boolean
  komunikatKalendarza: string | null
  ladowanie: boolean
  ostatnieOdswiezenie: number | null
  bledy: { zrodlo: string; komunikat: string }[]
  komunikatOgolny: string | null
  statystyki: StatystykiOdswiezenia | null

  wczytaj: () => Promise<void>
  odswiez: () => Promise<void>
  odswiezKalendarz: () => Promise<void>
  oznaczJakoPrzeczytane: (idy: string[]) => Promise<void>
}

let odswiezanieWToku = false

export const uzyjNewsow = create<StanNewsow>((set, get) => ({
  klastry: [],
  kalendarz: [],
  kalendarzPewny: true,
  komunikatKalendarza: null,
  ladowanie: false,
  ostatnieOdswiezenie: null,
  bledy: [],
  komunikatOgolny: null,
  statystyki: null,

  async wczytaj() {
    const zapisane = await przygotujNewsy()
    set({ klastry: zapisane.sort((a, b) => b.pierwszaData - a.pierwszaData) })
  },

  async odswiez() {
    if (odswiezanieWToku) return
    odswiezanieWToku = true
    set({ ladowanie: true })
    try {
      const ustawienia = uzyjUstawien.getState()
      const wynik = await odswiezNewsy({ wlaczoneZrodla: ustawienia.wlaczoneZrodla })

      set({
        klastry: wynik.klastry,
        bledy: wynik.bledy,
        komunikatOgolny: wynik.komunikatOgolny,
        statystyki: wynik.statystyki,
        ostatnieOdswiezenie: wynik.czas,
      })

      // Powiadamiamy tylko o naprawdę nowych historiach i tylko raz na klaster.
      const doPowiadomienia = wynik.noweDoPowiadomienia.filter(
        (k) => k.ocena.wplyw >= ustawienia.progWplywuNewsa,
      )
      if (
        ustawienia.powiadomieniaNewsy &&
        doPowiadomienia.length > 0 &&
        poraNaPowiadomienie(ustawienia)
      ) {
        // Przy wysypie newsów jedno zbiorcze powiadomienie zamiast serii.
        if (doPowiadomienia.length > 2) {
          await powiadom({
            tytul: `📰 ${doPowiadomienia.length} ważnych newsów o BTC`,
            tresc: doPowiadomienia
              .slice(0, 3)
              .map((k) => k.tytul.slice(0, 60))
              .join(' · '),
            tag: 'newsy-zbiorcze',
          })
        } else {
          for (const k of doPowiadomienia) {
            await powiadom({
              tytul: `📰 ${k.ocena.nazwaKategorii} · wpływ ${k.ocena.wplyw}/10`,
              tresc: k.tytul.slice(0, 140),
              tag: `news-${k.id}`,
            })
          }
        }
      }
      // Oznaczamy WSZYSTKIE nowe, nie tylko te wysłane – inaczej news, który
      // dziś nie przeszedł progu, jutro wyskoczyłby jako „nowy”.
      await oznaczPowiadomione(wynik.noweDoPowiadomienia.map((k) => k.id))
    } catch (e) {
      set({
        bledy: [
          {
            zrodlo: 'Moduł newsów',
            komunikat: e instanceof Error ? e.message : 'nie udało się odświeżyć',
          },
        ],
      })
    } finally {
      set({ ladowanie: false })
      odswiezanieWToku = false
    }
  },

  async odswiezKalendarz() {
    const stan = await pobierzKalendarzZZapasem()
    set({
      kalendarz: stan.wydarzenia,
      kalendarzPewny: stan.zrodloDziala,
      komunikatKalendarza: stan.komunikat,
    })
  },

  async oznaczJakoPrzeczytane(idy) {
    await oznaczPrzeczytane(idy)
    set((s) => ({
      klastry: s.klastry.map((k) => (idy.includes(k.id) ? { ...k, przeczytany: true } : k)),
    }))
  },
}))

/** Łączne ryzyko z newsów i kalendarza – wchodzi do silnika sygnałów. */
export function ryzykoDlaSilnika(): { wysokie: boolean; powod: string | null } {
  const { klastry, kalendarz } = uzyjNewsow.getState()
  const zNewsow = ryzykoZNewsow(klastry, 60)
  if (zNewsow.wysokie) return zNewsow
  return ryzykoMakro(kalendarz, 2)
}

export function najwazniejszeNewsy(limit = 3): ZapisKlastra[] {
  return coMozeRuszycBtc(uzyjNewsow.getState().klastry, 6, 24).slice(0, limit)
}
