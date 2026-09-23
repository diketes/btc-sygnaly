/** Wspólne typy silnika analitycznego i sygnałów. */

import type { Horyzont, Interwal } from './profile'
import type { Swieca } from './wskazniki'

export type Kierunek = 'long' | 'short'
export type KierunekLubCzekaj = Kierunek | 'czekaj'
export type Rezim = 'trend' | 'zakres' | 'przejsciowy'

export interface Skladnik {
  klucz: string
  etykieta: string
  /** -100 (short) … +100 (long) */
  wynik: number
  waga: number
  /** Krótki opis po polsku – trafia do uzasadnienia sygnału. */
  opis: string
}

export interface OcenaInterwalu {
  interwal: Interwal
  waga: number
  wynik: number
  rezim: Rezim
  adx: number
  atr: number
  cena: number
  skladniki: Skladnik[]
}

export interface Modyfikator {
  etykieta: string
  /** Punkty dodane do wyniku (dodatnie = pro-long). */
  wplyw: number
  opis: string
}

export interface KontekstRynku {
  /** Ostatni funding rate w procentach (np. 0.01 = 0,01%). */
  funding: number | null
  /** Średnia z ostatnich 24h. */
  fundingSrednia: number | null
  /** Stosunek kont long do short (globalLongShortAccountRatio). */
  longShort: number | null
  /** Zmiana Open Interest w ciągu 24h, w procentach. */
  zmianaOi24h: number | null
  /** Suma likwidacji longów w ostatnich 15 minutach (USD). */
  likwidacjeLong15m: number
  /** Suma likwidacji shortów w ostatnich 15 minutach (USD). */
  likwidacjeShort15m: number
  /** Indeks strachu i chciwości 0–100. */
  strachChciwosc: number | null
  /** Ryzyko wynikające z newsów/wydarzeń makro. */
  ryzykoNewsow: { wysokie: boolean; powod: string | null }
}

export const PUSTY_KONTEKST: KontekstRynku = {
  funding: null,
  fundingSrednia: null,
  longShort: null,
  zmianaOi24h: null,
  likwidacjeLong15m: 0,
  likwidacjeShort15m: 0,
  strachChciwosc: null,
  ryzykoNewsow: { wysokie: false, powod: null },
}

export type StatusSygnalu =
  | 'aktywny'
  | 'tp1'
  | 'tp2'
  | 'zamkniety_zysk'
  | 'zamkniety_strata'
  | 'uniewazniony'
  | 'wygasly'

export interface Cel {
  poziom: 1 | 2 | 3
  cena: number
  /** Zysk w procentach od wejścia (bez dźwigni). */
  procent: number
  /** Wielokrotność ryzyka. */
  r: number
  osiagniety: boolean
  czasOsiagniecia: number | null
}

export interface ZdarzenieSygnalu {
  czas: number
  typ: 'utworzony' | 'tp1' | 'tp2' | 'tp3' | 'sl' | 'be' | 'uniewazniony' | 'wygasly'
  cena: number
  opis: string
}

export interface Sygnal {
  id: string
  horyzont: Horyzont
  kierunek: Kierunek
  utworzony: number
  /** Cena w momencie wystawienia sygnału. */
  cenaOdniesienia: number
  wejscie: number
  zakresWejscia: [number, number]
  typWejscia: string
  stopLoss: number
  /** Odległość SL od wejścia w procentach. */
  odlegloscSlProc: number
  cele: Cel[]
  rr: number
  pewnosc: number
  /** Maksymalna dźwignia, przy której likwidacja jest dalej niż stop loss. */
  maksDzwignia: number
  uniewaznienie: { cena: number; opis: string }
  uzasadnienie: string[]
  wynik: number
  zgodnosc: number
  rezim: Rezim
  atr: number
  interwalBazowy: Interwal
  oceny: OcenaInterwalu[]
  modyfikatory: Modyfikator[]
  podwyzszoneRyzyko: boolean
  powodRyzyka: string | null
  wygasa: number
  status: StatusSygnalu
  zdarzenia: ZdarzenieSygnalu[]
  /** Wynik w R po zamknięciu (dodatni = zysk). */
  wynikR: number | null
  zamkniety: number | null

  /**
   * Sygnał wymuszony przyciskiem „Daj sygnał”, a nie wystawiony samodzielnie
   * przez silnik. Powstaje z tych samych danych, ale z pominięciem progów,
   * więc jest z założenia słabszy. Liczony w statystykach OSOBNO, żeby nie
   * zawyżał ani nie zaniżał skuteczności zwykłych sygnałów.
   */
  naZadanie: boolean
  /** Czego zabrakło do normalnego sygnału (puste przy zwykłym sygnale). */
  brakiDoStandardu: string[]
  /** Czy wysłano już powiadomienie o zbliżeniu ceny do wejścia. */
  powiadomionoOWejsciu?: boolean
}

/** Zwracane, gdy warunki nie pozwalają wystawić sygnału. */
export interface Czekaj {
  horyzont: Horyzont
  kierunek: 'czekaj'
  wynik: number
  zgodnosc: number
  rezim: Rezim
  powody: string[]
  oceny: OcenaInterwalu[]
  modyfikatory: Modyfikator[]
  cenaOdniesienia: number
  utworzony: number
  /**
   * Jak blisko jesteśmy sygnału — do paska postępu na karcie „Czekaj”.
   * Dzięki temu czekanie nie wygląda jak martwy ekran.
   */
  postep: {
    /** 0–1: |wynik| względem progu profilu. */
    wynikUdzial: number
    /** 0–1: zgodność interwałów względem wymaganej. */
    zgodnoscUdzial: number
    progWyniku: number
    wymaganaZgodnosc: number
    /** W którą stronę przechyla się rynek, nawet jeśli za słabo na sygnał. */
    sklonnosc: Kierunek | null
  }
}

export type WynikAnalizy = Sygnal | Czekaj

export function czyCzekaj(x: WynikAnalizy): x is Czekaj {
  return x.kierunek === 'czekaj'
}

export function czySygnal(x: WynikAnalizy): x is Sygnal {
  return x.kierunek !== 'czekaj'
}

export type SwieceWgInterwalu = Partial<Record<Interwal, Swieca[]>>
