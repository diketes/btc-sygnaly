/**
 * Strumienie WebSocket Binance: cena, świece, księga zleceń i likwidacje.
 *
 * Po każdym zerwaniu połączenia świece są dociągane REST-em i scalane ze
 * strumieniem, żeby na wykresie nie powstała dziura.
 */

import type { Interwal } from '@/analiza/profile'
import type { Swieca } from '@/analiza/wskazniki'
import { pobierzSwiece } from './gieldy'

export type StatusPolaczenia = 'laczenie' | 'nazywo' | 'rozlaczony' | 'offline'

export interface Likwidacja {
  czas: number
  strona: 'long' | 'short'
  /** Wartość w USD. */
  wartosc: number
  cena: number
}

export interface PoziomKsiegi {
  cena: number
  ilosc: number
}

export interface Ksiega {
  kupno: PoziomKsiegi[]
  sprzedaz: PoziomKsiegi[]
  czas: number
}

export interface ZdarzeniaStrumienia {
  cena: (cena: number, czas: number) => void
  ticker: (dane: { cena: number; zmianaProc: number; max: number; min: number; wolumen: number }) => void
  swieca: (interwal: Interwal, swieca: Swieca, zamknieta: boolean) => void
  swieceUzupelnione: (interwal: Interwal, swiece: Swieca[]) => void
  ksiega: (k: Ksiega) => void
  likwidacja: (l: Likwidacja) => void
  status: (s: StatusPolaczenia) => void
}

type NazwaZdarzenia = keyof ZdarzeniaStrumienia

const ODSTEPY_PONOWIENIA = [1000, 2000, 5000, 10_000, 30_000]

class Emiter {
  private sluchacze = new Map<NazwaZdarzenia, Set<(...a: never[]) => void>>()

  na<K extends NazwaZdarzenia>(nazwa: K, cb: ZdarzeniaStrumienia[K]): () => void {
    let zbior = this.sluchacze.get(nazwa)
    if (!zbior) {
      zbior = new Set()
      this.sluchacze.set(nazwa, zbior)
    }
    zbior.add(cb as (...a: never[]) => void)
    return () => zbior?.delete(cb as (...a: never[]) => void)
  }

  protected emituj<K extends NazwaZdarzenia>(nazwa: K, ...args: Parameters<ZdarzeniaStrumienia[K]>) {
    const zbior = this.sluchacze.get(nazwa)
    if (!zbior) return
    for (const cb of zbior) {
      try {
        ;(cb as (...a: unknown[]) => void)(...args)
      } catch (e) {
        console.error(`Błąd w obsłudze zdarzenia „${nazwa}”:`, e)
      }
    }
  }

  protected wyczyscSluchaczy() {
    this.sluchacze.clear()
  }
}

interface SurowaSwiecaWs {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
  x: boolean
}

export class StrumienRynku extends Emiter {
  private gniazdo: WebSocket | null = null
  private gniazdoLikwidacji: WebSocket | null = null
  private proba = 0
  private zatrzymany = true
  private timerPonowienia: ReturnType<typeof setTimeout> | null = null
  private interwaly: Interwal[] = []
  private ostatniCzasSwiecy = new Map<Interwal, number>()
  private status: StatusPolaczenia = 'rozlaczony'
  private byloPolaczenie = false

  start(interwaly: Interwal[]): void {
    // Ponowny start (np. po zmianie horyzontu) musi najpierw zamknąć poprzednie
    // gniazda. Inaczej zostaje po nich działający strumień, a ich `onclose`
    // planuje jeszcze reconnect – po kilku przełączeniach mielibyśmy kilka
    // równoległych połączeń dorzucających te same świece.
    const takieSame =
      this.interwaly.length === interwaly.length &&
      this.interwaly.every((i) => interwaly.includes(i))
    if (takieSame && this.gniazdo && this.status === 'nazywo') return

    this.rozlacz()
    this.interwaly = interwaly
    this.zatrzymany = false
    this.proba = 0
    this.polacz()
    this.polaczLikwidacje()
  }

  /** Zamyka gniazda bez zmiany flagi zatrzymania. */
  private rozlacz(): void {
    if (this.timerPonowienia) clearTimeout(this.timerPonowienia)
    this.timerPonowienia = null

    for (const g of [this.gniazdo, this.gniazdoLikwidacji]) {
      if (!g) continue
      // Zdejmujemy obsługę zamknięcia, żeby nie odpaliła ponownego łączenia.
      g.onclose = null
      g.onmessage = null
      g.onerror = null
      g.onopen = null
      try {
        g.close()
      } catch {
        /* gniazdo mogło już być zamknięte */
      }
    }
    this.gniazdo = null
    this.gniazdoLikwidacji = null
  }

  stop(): void {
    this.zatrzymany = true
    this.rozlacz()
    this.ustawStatus('rozlaczony')
  }

  zniszcz(): void {
    this.stop()
    this.wyczyscSluchaczy()
  }

  get stanPolaczenia(): StatusPolaczenia {
    return this.status
  }

  private ustawStatus(s: StatusPolaczenia) {
    if (this.status === s) return
    this.status = s
    this.emituj('status', s)
  }

  private adres(): string {
    const strumienie = [
      ...this.interwaly.map((i) => `btcusdt@kline_${i}`),
      'btcusdt@ticker',
      'btcusdt@aggTrade',
      'btcusdt@depth20@100ms',
    ]
    return `wss://stream.binance.com:9443/stream?streams=${strumienie.join('/')}`
  }

  private polacz(): void {
    if (this.zatrzymany) return
    this.ustawStatus('laczenie')

    let ws: WebSocket
    try {
      ws = new WebSocket(this.adres())
    } catch {
      this.zaplanujPonowienie()
      return
    }
    this.gniazdo = ws

    ws.onopen = () => {
      this.proba = 0
      this.ustawStatus('nazywo')
      // Po ponownym połączeniu dociągamy to, co uciekło w czasie przerwy.
      if (this.byloPolaczenie) void this.uzupelnijLuki()
      this.byloPolaczenie = true
    }

    ws.onmessage = (zdarzenie) => {
      try {
        this.obsluzWiadomosc(JSON.parse(zdarzenie.data as string))
      } catch {
        /* pojedyncza uszkodzona ramka nie może zabić strumienia */
      }
    }

    ws.onerror = () => {
      // Szczegóły i tak przyjdą w onclose.
    }

    ws.onclose = () => {
      if (this.gniazdo === ws) this.gniazdo = null
      if (!this.zatrzymany) {
        this.ustawStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'rozlaczony')
        this.zaplanujPonowienie()
      }
    }
  }

  private polaczLikwidacje(): void {
    if (this.zatrzymany) return
    let ws: WebSocket
    try {
      ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr')
    } catch {
      return
    }
    this.gniazdoLikwidacji = ws

    ws.onmessage = (zdarzenie) => {
      try {
        const ramka = JSON.parse(zdarzenie.data as string) as {
          o?: { s?: string; S?: string; q?: string; ap?: string; p?: string; T?: number }
        }
        const o = ramka.o
        if (!o || o.s !== 'BTCUSDT') return
        const cena = Number(o.ap || o.p)
        const ilosc = Number(o.q)
        if (!Number.isFinite(cena) || !Number.isFinite(ilosc)) return
        this.emituj('likwidacja', {
          czas: o.T ?? Date.now(),
          // Zlecenie SELL likwiduje pozycję długą i odwrotnie.
          strona: o.S === 'SELL' ? 'long' : 'short',
          wartosc: cena * ilosc,
          cena,
        })
      } catch {
        /* ignorujemy uszkodzoną ramkę */
      }
    }

    ws.onclose = () => {
      if (this.gniazdoLikwidacji === ws) this.gniazdoLikwidacji = null
      if (!this.zatrzymany) setTimeout(() => this.polaczLikwidacje(), 5000)
    }
  }

  private obsluzWiadomosc(ramka: { stream?: string; data?: Record<string, unknown> }): void {
    const strumien = ramka.stream
    const dane = ramka.data
    if (!strumien || !dane) return

    if (strumien.includes('@kline_')) {
      const k = dane.k as unknown as SurowaSwiecaWs | undefined
      if (!k) return
      const interwal = strumien.split('@kline_')[1] as Interwal
      const swieca: Swieca = {
        czas: k.t,
        o: Number(k.o),
        h: Number(k.h),
        l: Number(k.l),
        c: Number(k.c),
        v: Number(k.v),
      }
      if (k.x) this.ostatniCzasSwiecy.set(interwal, k.t)
      this.emituj('swieca', interwal, swieca, k.x)
      return
    }

    if (strumien.endsWith('@ticker')) {
      const cena = Number(dane.c)
      if (Number.isFinite(cena)) {
        this.emituj('cena', cena, Number(dane.E) || Date.now())
        this.emituj('ticker', {
          cena,
          zmianaProc: Number(dane.P),
          max: Number(dane.h),
          min: Number(dane.l),
          wolumen: Number(dane.q),
        })
      }
      return
    }

    if (strumien.endsWith('@aggTrade')) {
      const cena = Number(dane.p)
      if (Number.isFinite(cena)) this.emituj('cena', cena, Number(dane.T) || Date.now())
      return
    }

    if (strumien.includes('@depth')) {
      const mapuj = (x: unknown): PoziomKsiegi[] =>
        Array.isArray(x)
          ? (x as string[][]).map((p) => ({ cena: Number(p[0]), ilosc: Number(p[1]) }))
          : []
      this.emituj('ksiega', {
        kupno: mapuj(dane.bids),
        sprzedaz: mapuj(dane.asks),
        czas: Date.now(),
      })
    }
  }

  private zaplanujPonowienie(): void {
    if (this.zatrzymany || this.timerPonowienia) return
    const odstep = ODSTEPY_PONOWIENIA[Math.min(this.proba, ODSTEPY_PONOWIENIA.length - 1)]
    this.proba++
    this.timerPonowienia = setTimeout(() => {
      this.timerPonowienia = null
      this.polacz()
    }, odstep)
  }

  /** Dociąga świece REST-em po przerwie i oddaje je jako pełne serie. */
  private async uzupelnijLuki(): Promise<void> {
    for (const interwal of this.interwaly) {
      try {
        const swiece = await pobierzSwiece(interwal, 500)
        if (swiece.length > 0) {
          this.ostatniCzasSwiecy.set(interwal, swiece[swiece.length - 1].czas)
          this.emituj('swieceUzupelnione', interwal, swiece)
        }
      } catch (e) {
        console.warn(`Nie udało się uzupełnić świec ${interwal}:`, e)
      }
    }
  }

  /** Ręczne wymuszenie odświeżenia (np. po powrocie aplikacji z tła). */
  async odswiez(): Promise<void> {
    await this.uzupelnijLuki()
  }
}

// Scalanie serii żyje w osobnym module (czysta logika, bez przeglądarki).
export { scalSerie, scalSwiece, sprawdzCiaglosc } from './scalanie'

export const strumien = new StrumienRynku()
