/**
 * Generator sygnału na wybraną liczbę dni (2–90).
 *
 * Etapy pokazywane w aplikacji odpowiadają temu, co faktycznie się dzieje:
 *  1. świece – dociągnięcie interwałów potrzebnych dla tego horyzontu (przy
 *     3 miesiącach to m.in. świece 3-dniowe i tygodniowe, których zwykłe
 *     sygnały w ogóle nie używają),
 *  2. rynek  – odświeżenie fundingu, open interest, long/short i nastrojów,
 *     jeśli migawka jest starsza niż kilka minut,
 *  3. analiza – wskaźniki na wszystkich interwałach, kierunek, wejście, stop
 *     i cele dobrane pod wybraną liczbę dni.
 *
 * Wynik to podgląd: nie trafia do statystyk, dopóki użytkownik nie weźmie go
 * pod obserwację przyciskiem „Śledź”.
 */

import { create } from 'zustand'
import { profilDlaDni, type Interwal } from '@/analiza/profile'
import { czySygnal, type SwieceWgInterwalu, type WynikAnalizy } from '@/analiza/typy'
import { policzAnalize } from '@/analiza/workerKlient'
import { drgnij } from '@/lib/powiadomienia'
import { zbudujKontekstRynku } from './kontekst'
import { uzyjRynku } from './rynek'
import { uzyjSygnalow } from './sygnaly'

export type EtapGeneratora = 'swiece' | 'rynek' | 'analiza'

export const ETAPY_GENERATORA: { id: EtapGeneratora; opis: string }[] = [
  { id: 'swiece', opis: 'Pobieram świeże świece' },
  { id: 'rynek', opis: 'Sprawdzam rynek terminowy i nastroje' },
  { id: 'analiza', opis: 'Liczę wskaźniki, wejście, stop i cele' },
]

interface StanGeneratora {
  etap: EtapGeneratora | null
  wynik: WynikAnalizy | null
  /** Dla ilu dni policzono wynik – suwak mógł się już przesunąć. */
  wynikDni: number | null
  czasWyniku: number | null
  /** Interwały, których nie udało się odświeżyć – analiza poszła na zapisanych. */
  nieaktualne: Interwal[]
  blad: string | null

  generuj: (dni: number) => Promise<void>
  wyczysc: () => void
}

/** Migawka rynku terminowego starsza niż 5 minut jest odświeżana przed analizą. */
const MIGAWKA_MAKS_WIEK = 5 * 60_000
/** Świece spoza strumienia na żywo odświeżamy, gdy mają więcej niż minutę. */
const SWIECE_MAKS_WIEK = 60_000
/** Każdy etap widać przynajmniej przez chwilę – inaczej pasek tylko by mignął. */
const MIN_ETAP_MS = 350
/** Mniej świec niż tyle i silnik nie policzy EMA/ATR na danym interwale. */
const MIN_SWIEC = 60

async function conajmniej<T>(obietnica: Promise<T>, ms: number): Promise<T> {
  const [wynik] = await Promise.all([obietnica, new Promise((r) => setTimeout(r, ms))])
  return wynik
}

export const uzyjGeneratora = create<StanGeneratora>((set, get) => ({
  etap: null,
  wynik: null,
  wynikDni: null,
  czasWyniku: null,
  nieaktualne: [],
  blad: null,

  async generuj(dniWejscie) {
    if (get().etap) return
    const p = profilDlaDni(dniWejscie)
    const dni = p.dniWlasne ?? Math.round(dniWejscie)
    const interwaly = p.interwaly.map((i) => i.interwal)
    const rynek = uzyjRynku.getState()

    set({ etap: 'swiece', blad: null })
    try {
      const nieudane = await conajmniej(rynek.zapewnijSwieze(interwaly, SWIECE_MAKS_WIEK), MIN_ETAP_MS)
      const wszystkie = uzyjRynku.getState().swieceWg
      const brak = interwaly.filter((i) => (wszystkie[i]?.length ?? 0) < MIN_SWIEC)
      if (brak.length > 0) {
        throw new Error(
          `Brak danych dla interwałów ${brak.join(', ')}. Sprawdź połączenie z internetem i spróbuj ponownie.`,
        )
      }
      // Do wątku obliczeń wysyłamy tylko to, czego ten horyzont używa.
      const swieceWg: SwieceWgInterwalu = {}
      for (const i of interwaly) swieceWg[i] = wszystkie[i]

      set({ etap: 'rynek' })
      const migawka = uzyjRynku.getState().migawka
      const stara = !migawka || Date.now() - migawka.pobrano > MIGAWKA_MAKS_WIEK
      await conajmniej(stara ? rynek.odswiezMigawke() : Promise.resolve(), MIN_ETAP_MS)

      set({ etap: 'analiza' })
      const wynik = await conajmniej(
        policzAnalize([p.id], swieceWg, zbudujKontekstRynku(), {}, true, p),
        MIN_ETAP_MS,
      )
      const analiza = wynik[p.id]
      if (!analiza) throw new Error('Silnik nie zwrócił wyniku. Spróbuj ponownie.')

      set({ wynik: analiza, wynikDni: dni, czasWyniku: Date.now(), nieaktualne: nieudane })
      if (czySygnal(analiza)) {
        // Ten sam wystrzał cząsteczek co przy nowym zwykłym sygnale.
        uzyjSygnalow.setState({ swiezySygnal: analiza })
        void drgnij('mocno')
      }
    } catch (e) {
      set({ blad: e instanceof Error ? e.message : 'Nie udało się wygenerować sygnału.' })
    } finally {
      set({ etap: null })
    }
  },

  wyczysc() {
    set({ wynik: null, wynikDni: null, czasWyniku: null, nieaktualne: [], blad: null })
  },
}))
