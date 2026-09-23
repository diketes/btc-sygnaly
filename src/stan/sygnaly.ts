/**
 * Stan sygnałów: bieżąca analiza dla każdego horyzontu, aktywne pozycje,
 * historia i statystyki skuteczności.
 *
 * Zasada: na jeden horyzont przypada maksymalnie JEDEN aktywny sygnał.
 * Bez tego nakładałyby się na siebie mocno skorelowane pozycje, a statystyki
 * skuteczności przestałyby cokolwiek znaczyć.
 */

import { create } from 'zustand'
import { czyAktywny, zaktualizujWszystkie } from '@/analiza/cykl'
import { HORYZONTY, horyzontyDlaTrybu, type Horyzont, type TrybHoryzontu } from '@/analiza/profile'
import { policzStatystyki, type Statystyki, PUSTE_STATYSTYKI } from '@/analiza/statystyki'
import { czySygnal, type KontekstRynku, type Sygnal, type WynikAnalizy } from '@/analiza/typy'
import { policzAnalize } from '@/analiza/workerKlient'
import { usunSygnaly, wczytajSygnaly, zapiszSygnal, zapiszSygnaly } from '@/dane/db'
import { drgnij, drgnijBlad, drgnijSukces, powiadom } from '@/lib/powiadomienia'
import { poraNaPowiadomienie, uzyjUstawien } from './ustawienia'
import { uzyjRynku } from './rynek'

interface StanSygnalow {
  analizy: Partial<Record<Horyzont, WynikAnalizy>>
  aktywne: Sygnal[]
  historia: Sygnal[]
  statystyki: Statystyki
  liczenie: boolean
  ostatnieLiczenie: number | null
  /** Sygnał, który właśnie się pojawił – do animacji i efektów. */
  swiezySygnal: Sygnal | null

  wczytaj: () => Promise<void>
  przelicz: (tryb: TrybHoryzontu, kontekst: KontekstRynku) => Promise<void>
  sprawdzCeny: (cena: number) => Promise<void>
  wyczyscSwiezy: () => void
  wyczyscHistorie: () => Promise<void>
}

function przeliczStatystyki(historia: Sygnal[], aktywne: Sygnal[], ryzyko: number): Statystyki {
  const wszystkie = [...historia, ...aktywne]
  return wszystkie.length > 0 ? policzStatystyki(wszystkie, ryzyko) : PUSTE_STATYSTYKI
}

export const uzyjSygnalow = create<StanSygnalow>((set, get) => ({
  analizy: {},
  aktywne: [],
  historia: [],
  statystyki: PUSTE_STATYSTYKI,
  liczenie: false,
  ostatnieLiczenie: null,
  swiezySygnal: null,

  async wczytaj() {
    const wszystkie = await wczytajSygnaly()
    const aktywne = wszystkie.filter(czyAktywny)
    const historia = wszystkie.filter((s) => !czyAktywny(s))
    set({
      aktywne,
      historia,
      statystyki: przeliczStatystyki(historia, aktywne, uzyjUstawien.getState().ryzykoProc),
    })
  },

  async przelicz(tryb, kontekst) {
    if (get().liczenie) return
    const swieceWg = uzyjRynku.getState().swieceWg
    if (Object.keys(swieceWg).length === 0) return

    set({ liczenie: true })
    try {
      const horyzonty = horyzontyDlaTrybu(tryb)
      const aktywne = get().aktywne

      // Cooldown liczymy od ostatniego sygnału danego horyzontu – także zamkniętego.
      const poprzednie: Partial<
        Record<Horyzont, { kierunek: 'long' | 'short'; utworzony: number } | null>
      > = {}
      for (const h of HORYZONTY) {
        const ostatni = [...get().historia, ...aktywne]
          .filter((s) => s.horyzont === h)
          .sort((a, b) => b.utworzony - a.utworzony)[0]
        poprzednie[h] = ostatni ? { kierunek: ostatni.kierunek, utworzony: ostatni.utworzony } : null
      }

      const wynik = await policzAnalize(horyzonty, swieceWg, kontekst, poprzednie)
      set({ analizy: wynik as Partial<Record<Horyzont, WynikAnalizy>>, ostatnieLiczenie: Date.now() })

      // Nowy sygnał przyjmujemy tylko, gdy dany horyzont nie ma otwartej pozycji.
      const ustawienia = uzyjUstawien.getState()
      for (const h of horyzonty) {
        const analiza = wynik[h]
        if (!analiza || !czySygnal(analiza)) continue
        if (aktywne.some((s) => s.horyzont === h)) continue

        const sygnal = analiza
        set((s) => ({ aktywne: [...s.aktywne, sygnal], swiezySygnal: sygnal }))
        await zapiszSygnal(sygnal)
        void drgnij('mocno')

        if (
          ustawienia.powiadomieniaSygnaly &&
          sygnal.pewnosc >= ustawienia.progPewnosci &&
          poraNaPowiadomienie(ustawienia)
        ) {
          void powiadom({
            tytul: `${sygnal.kierunek === 'long' ? '🟢 LONG' : '🔴 SHORT'} · ${
              sygnal.horyzont === 'krotki' ? 'krótki termin' : 'długi termin'
            }`,
            tresc:
              `Wejście ${Math.round(sygnal.wejscie)} · SL ${Math.round(sygnal.stopLoss)} · ` +
              `TP1 ${Math.round(sygnal.cele[0].cena)} · pewność ${sygnal.pewnosc}%`,
            tag: `sygnal-${sygnal.horyzont}`,
          })
        }
      }

      set((s) => ({
        statystyki: przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc),
      }))
    } finally {
      set({ liczenie: false })
    }
  },

  async sprawdzCeny(cena) {
    const aktywne = get().aktywne
    if (aktywne.length === 0 || !Number.isFinite(cena)) return

    const { sygnaly, zmiany } = zaktualizujWszystkie(aktywne, cena)
    if (zmiany.length === 0) return

    const ustawienia = uzyjUstawien.getState()
    const nadalAktywne = sygnaly.filter(czyAktywny)
    const zamkniete = sygnaly.filter((s) => !czyAktywny(s))

    set((s) => ({
      aktywne: nadalAktywne,
      historia: [...zamkniete, ...s.historia].sort((a, b) => b.utworzony - a.utworzony),
    }))
    await zapiszSygnaly(sygnaly)

    for (const { sygnal, zdarzenia } of zmiany) {
      for (const z of zdarzenia) {
        if (z.typ === 'be') continue // techniczne, nie zawracamy głowy
        const sukces = z.typ === 'tp1' || z.typ === 'tp2' || z.typ === 'tp3'
        if (sukces) void drgnijSukces()
        else if (z.typ === 'sl') void drgnijBlad()

        if (ustawienia.powiadomieniaCele && poraNaPowiadomienie(ustawienia)) {
          void powiadom({
            tytul: `${sukces ? '🎯' : '🛑'} ${sygnal.kierunek.toUpperCase()} · ${
              sygnal.horyzont === 'krotki' ? 'krótki termin' : 'długi termin'
            }`,
            tresc: z.opis,
            tag: `cel-${sygnal.id}`,
          })
        }
      }
    }

    set((s) => ({
      statystyki: przeliczStatystyki(s.historia, s.aktywne, ustawienia.ryzykoProc),
    }))
  },

  wyczyscSwiezy() {
    set({ swiezySygnal: null })
  },

  async wyczyscHistorie() {
    await usunSygnaly()
    set({ aktywne: [], historia: [], statystyki: PUSTE_STATYSTYKI, analizy: {} })
  },
}))

/** Aktywny sygnał danego horyzontu (lub null). */
export function aktywnyDlaHoryzontu(lista: readonly Sygnal[], h: Horyzont): Sygnal | null {
  return lista.find((s) => s.horyzont === h) ?? null
}
