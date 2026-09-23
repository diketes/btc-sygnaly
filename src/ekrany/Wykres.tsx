/**
 * Pełny wykres świecowy: interwały, wskaźniki nakładane, poziomy S/R,
 * znaczniki wejścia/SL/TP aktywnego sygnału oraz panel oscylatorów.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Interwal } from '@/analiza/profile'
import type { WynikWskaznikow } from '@/analiza/worker'
import { policzWskaznikiWykresu } from '@/analiza/workerKlient'
import { cena as fCena, nazwaInterwalu, procent } from '@/lib/format'
import { drgnij } from '@/lib/powiadomienia'
import { uzyjRynku } from '@/stan/rynek'
import { uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { Ekran, NaglowekEkranu } from '@/ui/Powloka'

const INTERWALY: Interwal[] = ['5m', '15m', '1h', '4h', '1d', '1w']

const WSKAZNIKI: { id: string; etykieta: string }[] = [
  { id: 'ema21', etykieta: 'EMA 21' },
  { id: 'ema50', etykieta: 'EMA 50' },
  { id: 'ema200', etykieta: 'EMA 200' },
  { id: 'bollinger', etykieta: 'Bollinger' },
  { id: 'vwap', etykieta: 'VWAP' },
  { id: 'ichimoku', etykieta: 'Ichimoku' },
  { id: 'poziomy', etykieta: 'Poziomy S/R' },
  { id: 'fibo', etykieta: 'Fibonacci' },
  { id: 'profilWolumenu', etykieta: 'Profil wolumenu' },
]

type PanelOscylatora = 'rsi' | 'macd' | 'stoch' | 'brak'

/**
 * lightweight-charts rzuca wyjątkiem, gdy cokolwiek dotknie wykresu albo serii
 * po ich usunięciu — a ResizeObserver, sprzątanie efektu czy spóźniona obietnica
 * potrafią to zrobić już po odmontowaniu ekranu. Każde wywołanie na wykresie
 * przepuszczamy więc przez ten strażnik.
 *
 * Komunikaty biblioteki bywają różne („Object is disposed” przy wykresie,
 * „Value is undefined” przy serii zdjętej razem z wykresem), więc łapiemy oba.
 */
const SPRZATNIETY = /object is disposed|value is undefined|assertion failed/i

function naWykresie<T>(operacja: () => T): T | undefined {
  try {
    return operacja()
  } catch (e) {
    if (e instanceof Error && SPRZATNIETY.test(e.message)) return undefined
    throw e
  }
}

const OPCJE_WYKRESU = {
  layout: {
    background: { color: 'transparent' },
    textColor: '#9AA3B5',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
  },
  grid: {
    vertLines: { color: 'rgba(255,255,255,0.035)' },
    horzLines: { color: 'rgba(255,255,255,0.035)' },
  },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.07)' },
  timeScale: {
    borderColor: 'rgba(255,255,255,0.07)',
    timeVisible: true,
    secondsVisible: false,
  },
  crosshair: {
    mode: 0 as const,
    vertLine: { color: 'rgba(124,92,255,0.5)', width: 1 as const, labelBackgroundColor: '#7C5CFF' },
    horzLine: { color: 'rgba(124,92,255,0.5)', width: 1 as const, labelBackgroundColor: '#7C5CFF' },
  },
  handleScale: { axisPressedMouseMove: { time: true, price: false } },
}

export function Wykres() {
  const { swieceWg, cena, ticker, status, zapewnijInterwal } = uzyjRynku()
  const aktywne = uzyjSygnalow((s) => s.aktywne)
  const wskaznikiWybrane = uzyjUstawien((s) => s.wskaznikiWykresu)
  const przelaczWskaznik = uzyjUstawien((s) => s.przelaczWskaznik)

  const [interwal, ustawInterwal] = useState<Interwal>('1h')
  const [panel, ustawPanel] = useState<PanelOscylatora>('rsi')
  const [wskazniki, ustawWskazniki] = useState<WynikWskaznikow | null>(null)
  const [pokazPanel, ustawPokazPanel] = useState(false)

  const kontener = useRef<HTMLDivElement>(null)
  const kontenerOscylatora = useRef<HTMLDivElement>(null)
  const wykres = useRef<IChartApi | null>(null)
  const wykresOscylatora = useRef<IChartApi | null>(null)
  const seriaSwiec = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const seriaWolumenu = useRef<ISeriesApi<'Histogram'> | null>(null)
  const serieNakladek = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const dopasowanyInterwal = useRef<Interwal | null>(null)

  const swiece = swieceWg[interwal]

  // Interwał spoza bieżącego trybu trzeba dociągnąć.
  useEffect(() => {
    void zapewnijInterwal(interwal)
  }, [interwal, zapewnijInterwal])

  // --- budowa wykresu ------------------------------------------------------
  useEffect(() => {
    const el = kontener.current
    if (!el) return

    const w = createChart(el, {
      ...OPCJE_WYKRESU,
      width: el.clientWidth,
      height: el.clientHeight,
    })
    wykres.current = w

    seriaSwiec.current = w.addCandlestickSeries({
      upColor: '#00E28A',
      downColor: '#FF3B5C',
      borderUpColor: '#00E28A',
      borderDownColor: '#FF3B5C',
      wickUpColor: 'rgba(0,226,138,0.6)',
      wickDownColor: 'rgba(255,59,92,0.6)',
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    })

    seriaWolumenu.current = w.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'wolumen',
    })
    w.priceScale('wolumen').applyOptions({
      scaleMargins: { top: 0.86, bottom: 0 },
    })

    const dopasuj = () => {
      if (!el) return
      naWykresie(() => w.applyOptions({ width: el.clientWidth, height: el.clientHeight }))
    }
    const obserwator = new ResizeObserver(dopasuj)
    obserwator.observe(el)

    return () => {
      obserwator.disconnect()
      serieNakladek.current.clear()
      wykres.current = null
      seriaSwiec.current = null
      seriaWolumenu.current = null
      naWykresie(() => w.remove())
    }
  }, [])

  // --- panel oscylatorów ---------------------------------------------------
  useEffect(() => {
    const el = kontenerOscylatora.current
    if (!el || !pokazPanel || panel === 'brak') return

    const w = createChart(el, {
      ...OPCJE_WYKRESU,
      width: el.clientWidth,
      height: el.clientHeight,
      timeScale: { ...OPCJE_WYKRESU.timeScale, visible: false },
    })
    wykresOscylatora.current = w

    const dopasuj = () =>
      naWykresie(() => w.applyOptions({ width: el.clientWidth, height: el.clientHeight }))
    const obserwator = new ResizeObserver(dopasuj)
    obserwator.observe(el)

    // Synchronizacja przesuwania obu wykresów.
    const glowny = wykres.current
    const synchronizuj = () =>
      naWykresie(() => {
        const zakres = glowny?.timeScale().getVisibleLogicalRange()
        if (zakres) w.timeScale().setVisibleLogicalRange(zakres)
      })
    naWykresie(() => glowny?.timeScale().subscribeVisibleLogicalRangeChange(synchronizuj))

    return () => {
      obserwator.disconnect()
      wykresOscylatora.current = null
      naWykresie(() => glowny?.timeScale().unsubscribeVisibleLogicalRangeChange(synchronizuj))
      naWykresie(() => w.remove())
    }
  }, [pokazPanel, panel])

  // --- dane świecowe -------------------------------------------------------
  useEffect(() => {
    if (!seriaSwiec.current || !swiece || swiece.length === 0) return

    naWykresie(() => {
      const dane: CandlestickData[] = swiece.map((s) => ({
        time: Math.floor(s.czas / 1000) as UTCTimestamp,
        open: s.o,
        high: s.h,
        low: s.l,
        close: s.c,
      }))
      seriaSwiec.current?.setData(dane)

      seriaWolumenu.current?.setData(
        swiece.map((s) => ({
          time: Math.floor(s.czas / 1000) as UTCTimestamp,
          value: s.v,
          color: s.c >= s.o ? 'rgba(0,226,138,0.22)' : 'rgba(255,59,92,0.22)',
        })),
      )

      // Dopasowanie widoku tylko przy zmianie interwału – w trakcie życia
      // wykresu użytkownik mógł go przesunąć i nie chcemy mu tego kasować.
      if (dopasowanyInterwal.current !== interwal) {
        dopasowanyInterwal.current = interwal
        wykres.current?.timeScale().fitContent()
      }
    })
  }, [swiece, interwal])

  // --- wskaźniki z workera -------------------------------------------------
  useEffect(() => {
    if (!swiece || swiece.length < 60) return
    let anulowane = false
    const potrzebne = [...wskaznikiWybrane]
    void policzWskaznikiWykresu(interwal, swiece, potrzebne).then((w) => {
      if (!anulowane) ustawWskazniki(w)
    })
    return () => {
      anulowane = true
    }
  }, [swiece, wskaznikiWybrane, interwal])

  // --- nakładanie serii na wykres -----------------------------------------
  useEffect(() => {
    const w = wykres.current
    if (!w || !wskazniki) return

    naWykresie(() => {
      const chciane = new Set(wskazniki.serie.map((s) => s.nazwa))

      // Usuwamy serie, których już nie chcemy.
      for (const [nazwa, seria] of serieNakladek.current) {
        if (!chciane.has(nazwa)) {
          w.removeSeries(seria)
          serieNakladek.current.delete(nazwa)
        }
      }

      for (const s of wskazniki.serie) {
        let seria = serieNakladek.current.get(s.nazwa)
        if (!seria) {
          seria = w.addLineSeries({
            color: s.kolor,
            lineWidth: s.nazwa.startsWith('bb') || s.nazwa.startsWith('span') ? 1 : 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          serieNakladek.current.set(s.nazwa, seria)
        }
        seria.setData(s.punkty as LineData[])
      }
    })
  }, [wskazniki])

  // --- poziomy S/R, Fibo, POC i znaczniki sygnału --------------------------
  useEffect(() => {
    const seria = seriaSwiec.current
    if (!seria) return

    const linie: ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[] = []

    if (wskazniki) {
      for (const p of wskazniki.poziomy) {
        linie.push(
          seria.createPriceLine({
            price: p.cena,
            color: p.typ === 'opor' ? 'rgba(255,59,92,0.4)' : 'rgba(0,226,138,0.4)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: p.typ === 'opor' ? 'opór' : 'wsparcie',
          }),
        )
      }
      if (wskazniki.poc !== null) {
        linie.push(
          seria.createPriceLine({
            price: wskazniki.poc,
            color: 'rgba(255,209,102,0.7)',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: 'POC',
          }),
        )
      }
      for (const f of wskazniki.fibo) {
        linie.push(
          seria.createPriceLine({
            price: f.cena,
            color: 'rgba(124,92,255,0.3)',
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: false,
            title: `Fib ${f.etykieta}`,
          }),
        )
      }
    }

    for (const s of aktywne) {
      const kolor = s.kierunek === 'long' ? '#00E28A' : '#FF3B5C'
      linie.push(
        seria.createPriceLine({
          price: s.wejscie,
          color: kolor,
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `wejście ${s.kierunek === 'long' ? 'L' : 'S'}`,
        }),
      )
      linie.push(
        seria.createPriceLine({
          price: s.stopLoss,
          color: '#FF3B5C',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'SL',
        }),
      )
      s.cele.forEach((c) =>
        linie.push(
          seria.createPriceLine({
            price: c.cena,
            color: c.osiagniety ? '#00E28A' : 'rgba(0,226,138,0.5)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `TP${c.poziom}`,
          }),
        ),
      )
    }

    return () => {
      // Analogicznie: po zniszczeniu wykresu linie już nie istnieją.
      if (seriaSwiec.current !== seria) return
      for (const l of linie) naWykresie(() => seria.removePriceLine(l))
    }
  }, [wskazniki, aktywne])

  // --- dane panelu oscylatorów --------------------------------------------
  useEffect(() => {
    const w = wykresOscylatora.current
    if (!w || !wskazniki || panel === 'brak') return

    const serie: ISeriesApi<'Line' | 'Histogram'>[] = []

    if (panel === 'rsi') {
      const s = w.addLineSeries({ color: '#7C5CFF', lineWidth: 2, priceLineVisible: false })
      s.setData(wskazniki.oscylatory.rsi as LineData[])
      s.createPriceLine({ price: 70, color: 'rgba(255,59,92,0.35)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
      s.createPriceLine({ price: 30, color: 'rgba(0,226,138,0.35)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
      serie.push(s)
    } else if (panel === 'macd') {
      const h = w.addHistogramSeries({ priceLineVisible: false })
      h.setData(
        wskazniki.oscylatory.macdHistogram.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
          color: p.color,
        })),
      )
      const l = w.addLineSeries({ color: '#7C5CFF', lineWidth: 2, priceLineVisible: false })
      l.setData(wskazniki.oscylatory.macd as LineData[])
      const sg = w.addLineSeries({ color: '#F7931A', lineWidth: 1, priceLineVisible: false })
      sg.setData(wskazniki.oscylatory.macdSygnal as LineData[])
      serie.push(h, l, sg)
    } else {
      const k = w.addLineSeries({ color: '#00E28A', lineWidth: 2, priceLineVisible: false })
      k.setData(wskazniki.oscylatory.stochK as LineData[])
      const d = w.addLineSeries({ color: '#FF3B5C', lineWidth: 1, priceLineVisible: false })
      d.setData(wskazniki.oscylatory.stochD as LineData[])
      serie.push(k, d)
    }

    return () => {
      // Gdy wykres oscylatora został już zniszczony, jego serie poszły razem
      // z nim – nie ma czego zdejmować i próba kończy się wyjątkiem.
      if (wykresOscylatora.current !== w) return
      for (const s of serie) naWykresie(() => w.removeSeries(s))
    }
  }, [wskazniki, panel])

  const zmiana = ticker?.zmiana24hProc ?? null
  const brakDanych = !swiece || swiece.length === 0

  const podtytul = useMemo(
    () => `${fCena(cena)} USDT · ${procent(zmiana)} · ${nazwaInterwalu(interwal)}`,
    [cena, zmiana, interwal],
  )

  return (
    <Ekran klasa="!pb-0">
      <NaglowekEkranu tytul="Wykres" podtytul={podtytul} status={status} />

      {/* Interwały */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
        {INTERWALY.map((i) => (
          <button
            key={i}
            onClick={() => {
              ustawInterwal(i)
              void drgnij('lekko')
            }}
            className="shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors"
            style={{
              background: interwal === i ? 'var(--fiolet)' : 'rgba(255,255,255,0.05)',
              color: interwal === i ? '#050609' : 'var(--tekst-2)',
            }}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Wykres */}
      <div className="relative mx-3 mb-2 overflow-hidden rounded-2xl bg-black/30">
        <div ref={kontener} className="h-[46vh] w-full" />
        {brakDanych && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[12px]" style={{ color: 'var(--tekst-3)' }}>
              Pobieram świece {interwal}…
            </span>
          </div>
        )}
      </div>

      {/* Panel oscylatorów */}
      <div className="mx-3 mb-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          {(['rsi', 'macd', 'stoch'] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                ustawPanel(p)
                ustawPokazPanel(true)
              }}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: pokazPanel && panel === p ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.05)',
                color: pokazPanel && panel === p ? 'var(--fiolet)' : 'var(--tekst-3)',
              }}
            >
              {p === 'rsi' ? 'RSI' : p === 'macd' ? 'MACD' : 'Stoch'}
            </button>
          ))}
          <button
            onClick={() => ustawPokazPanel(false)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: !pokazPanel ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: 'var(--tekst-3)',
            }}
          >
            Ukryj
          </button>
        </div>
        {pokazPanel && (
          <div className="overflow-hidden rounded-2xl bg-black/30">
            <div ref={kontenerOscylatora} className="h-[14vh] w-full" />
          </div>
        )}
      </div>

      {/* Wskaźniki */}
      <div className="px-4 pb-6">
        <p className="etykieta mb-2">Wskaźniki na wykresie</p>
        <div className="flex flex-wrap gap-1.5">
          {WSKAZNIKI.map((w) => {
            const wlaczony = wskaznikiWybrane.includes(w.id)
            return (
              <button
                key={w.id}
                onClick={() => {
                  przelaczWskaznik(w.id)
                  void drgnij('lekko')
                }}
                className="rounded-xl px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
                style={{
                  background: wlaczony ? 'rgba(0,226,138,0.14)' : 'rgba(255,255,255,0.05)',
                  color: wlaczony ? 'var(--zielen)' : 'var(--tekst-3)',
                }}
              >
                {w.etykieta}
              </button>
            )
          })}
        </div>
      </div>
    </Ekran>
  )
}
