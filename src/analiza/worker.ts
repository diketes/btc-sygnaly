/// <reference lib="webworker" />
/**
 * Web Worker liczący wskaźniki i sygnały.
 *
 * Cała matematyka idzie poza główny wątek, żeby animacje i wykres nie gubiły
 * klatek w chwili przeliczania analizy (kilka interwałów × kilkanaście
 * wskaźników × setki świec).
 */

import { analizuj } from './silnik'
import type { Horyzont, Interwal, ProfilHoryzontu } from './profile'
import {
  atr,
  bollinger,
  ema,
  ichimoku,
  macd,
  rsi,
  sma,
  stochRsi,
  vwap,
  zamkniecia,
  type Swieca,
} from './wskazniki'
import { poziomy as liczPoziomy, profilWolumenu, ostatniImpuls, fibo } from './struktura'
import type { KontekstRynku, SwieceWgInterwalu, WynikAnalizy } from './typy'

export interface ZadanieAnalizy {
  typ: 'analiza'
  id: number
  horyzonty: Horyzont[]
  swieceWg: SwieceWgInterwalu
  kontekst: KontekstRynku
  poprzednie: Partial<Record<Horyzont, { kierunek: 'long' | 'short'; utworzony: number } | null>>
  /** Tryb „Daj sygnał” – pomija progi i zawsze zwraca kierunek. */
  naZadanie?: boolean
  /** Profil z generatora (własna liczba dni) – zastępuje stały profil. */
  profilWlasny?: ProfilHoryzontu
}

export interface ZadanieWskaznikow {
  typ: 'wskazniki'
  id: number
  interwal: Interwal
  swiece: Swieca[]
  ktore: string[]
}

export type ZadanieWorkera = ZadanieAnalizy | ZadanieWskaznikow

export interface SeriaWykresu {
  nazwa: string
  kolor: string
  punkty: { time: number; value: number }[]
}

export interface WynikWskaznikow {
  serie: SeriaWykresu[]
  poziomy: { cena: number; sila: number; typ: 'wsparcie' | 'opor' }[]
  fibo: { etykieta: string; cena: number }[]
  poc: number | null
  vah: number | null
  val: number | null
  oscylatory: {
    rsi: { time: number; value: number }[]
    macd: { time: number; value: number }[]
    macdSygnal: { time: number; value: number }[]
    macdHistogram: { time: number; value: number; color: string }[]
    stochK: { time: number; value: number }[]
    stochD: { time: number; value: number }[]
  }
}

export type OdpowiedzWorkera =
  | { typ: 'analiza'; id: number; wynik: Record<string, WynikAnalizy> }
  | { typ: 'wskazniki'; id: number; wynik: WynikWskaznikow }
  | { typ: 'blad'; id: number; komunikat: string }

/** Zamienia serię liczb na punkty wykresu (czas w sekundach – wymóg biblioteki). */
function naPunkty(swiece: readonly Swieca[], seria: readonly number[]) {
  const out: { time: number; value: number }[] = []
  for (let i = 0; i < swiece.length; i++) {
    if (Number.isFinite(seria[i])) out.push({ time: Math.floor(swiece[i].czas / 1000), value: seria[i] })
  }
  return out
}

const KOLORY: Record<string, string> = {
  ema9: '#7C5CFF',
  ema21: '#00E28A',
  ema50: '#F7931A',
  ema200: '#FF3B5C',
  sma50: '#66A3FF',
  sma200: '#FF8AB0',
  vwap: '#FFD166',
  bbGora: 'rgba(124,92,255,0.45)',
  bbDol: 'rgba(124,92,255,0.45)',
  bbSrodek: 'rgba(255,255,255,0.28)',
  tenkan: '#00E28A',
  kijun: '#FF3B5C',
  spanA: 'rgba(0,226,138,0.35)',
  spanB: 'rgba(255,59,92,0.35)',
}

function policzWskazniki(
  swiece: Swieca[],
  ktore: string[],
): WynikWskaznikow {
  const c = zamkniecia(swiece)
  const serie: SeriaWykresu[] = []
  const chce = (n: string) => ktore.includes(n)

  const dodaj = (nazwa: string, wartosci: number[]) => {
    serie.push({ nazwa, kolor: KOLORY[nazwa] ?? '#888', punkty: naPunkty(swiece, wartosci) })
  }

  if (chce('ema9')) dodaj('ema9', ema(c, 9))
  if (chce('ema21')) dodaj('ema21', ema(c, 21))
  if (chce('ema50')) dodaj('ema50', ema(c, 50))
  if (chce('ema200')) dodaj('ema200', ema(c, 200))
  if (chce('sma50')) dodaj('sma50', sma(c, 50))
  if (chce('sma200')) dodaj('sma200', sma(c, 200))
  if (chce('vwap')) dodaj('vwap', vwap(swiece))

  if (chce('bollinger')) {
    const bb = bollinger(c, 20, 2)
    dodaj('bbGora', bb.gora)
    dodaj('bbSrodek', bb.srodek)
    dodaj('bbDol', bb.dol)
  }

  if (chce('ichimoku')) {
    const ich = ichimoku(swiece)
    dodaj('tenkan', ich.tenkan)
    dodaj('kijun', ich.kijun)
    dodaj('spanA', ich.spanA)
    dodaj('spanB', ich.spanB)
  }

  const cena = c[c.length - 1] ?? 0
  const poziomy = chce('poziomy')
    ? liczPoziomy(swiece, cena, { promien: 2, tolerancjaProc: 0.25, maks: 8 }).map((p) => ({
        cena: p.cena,
        sila: p.sila,
        typ: p.typ,
      }))
    : []

  const impuls = chce('fibo') ? ostatniImpuls(swiece, 3) : null
  const poziomyFibo = impuls
    ? fibo(impuls)
        .filter((f) => f.wspolczynnik > 0 && f.wspolczynnik <= 1)
        .map((f) => ({ etykieta: f.etykieta, cena: f.cena }))
    : []

  const profil = chce('profilWolumenu') ? profilWolumenu(swiece, 48) : null

  // Oscylatory liczymy zawsze – to osobny panel pod wykresem.
  const r = rsi(c, 14)
  const m = macd(c)
  const sr = stochRsi(c)

  return {
    serie,
    poziomy,
    fibo: poziomyFibo,
    poc: profil?.poc ?? null,
    vah: profil?.vah ?? null,
    val: profil?.val ?? null,
    oscylatory: {
      rsi: naPunkty(swiece, r),
      macd: naPunkty(swiece, m.linia),
      macdSygnal: naPunkty(swiece, m.sygnal),
      macdHistogram: naPunkty(swiece, m.histogram).map((p) => ({
        ...p,
        color: p.value >= 0 ? 'rgba(0,226,138,0.6)' : 'rgba(255,59,92,0.6)',
      })),
      stochK: naPunkty(swiece, sr.k),
      stochD: naPunkty(swiece, sr.d),
    },
  }
}

self.onmessage = (zdarzenie: MessageEvent<ZadanieWorkera>) => {
  const zadanie = zdarzenie.data
  try {
    if (zadanie.typ === 'analiza') {
      const wynik: Record<string, WynikAnalizy> = {}
      for (const h of zadanie.horyzonty) {
        wynik[h] = analizuj({
          horyzont: h,
          swieceWg: zadanie.swieceWg,
          kontekst: zadanie.kontekst,
          poprzedniSygnal: zadanie.poprzednie[h] ?? null,
          naZadanie: zadanie.naZadanie,
          profilWlasny: zadanie.profilWlasny,
        })
      }
      const odpowiedz: OdpowiedzWorkera = { typ: 'analiza', id: zadanie.id, wynik }
      self.postMessage(odpowiedz)
      return
    }

    if (zadanie.typ === 'wskazniki') {
      const odpowiedz: OdpowiedzWorkera = {
        typ: 'wskazniki',
        id: zadanie.id,
        wynik: policzWskazniki(zadanie.swiece, zadanie.ktore),
      }
      self.postMessage(odpowiedz)
    }
  } catch (e) {
    const odpowiedz: OdpowiedzWorkera = {
      typ: 'blad',
      id: (zadanie as { id: number }).id,
      komunikat: e instanceof Error ? e.message : 'Nieznany błąd w wątku obliczeń',
    }
    self.postMessage(odpowiedz)
  }
}
