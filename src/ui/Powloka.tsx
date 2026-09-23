/** Wspólne elementy powłoki: nawigacja, przewijany ekran, pull-to-refresh, wskaźniki. */

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { drgnij } from '@/lib/powiadomienia'
import type { StatusPolaczenia } from '@/dane/ws'
import { temu } from '@/lib/format'
import {
  IkonaNarzedzia,
  IkonaNewsy,
  IkonaPulpit,
  IkonaRynek,
  IkonaSygnaly,
  IkonaWykres,
} from './Ikony'

export type Zakladka = 'pulpit' | 'wykres' | 'sygnaly' | 'newsy' | 'rynek'

const ZAKLADKI: { id: Zakladka; etykieta: string; ikona: (aktywna: boolean) => ReactNode }[] = [
  { id: 'pulpit', etykieta: 'Pulpit', ikona: () => <IkonaPulpit /> },
  { id: 'wykres', etykieta: 'Wykres', ikona: () => <IkonaWykres /> },
  { id: 'sygnaly', etykieta: 'Sygnały', ikona: () => <IkonaSygnaly /> },
  { id: 'newsy', etykieta: 'Newsy', ikona: () => <IkonaNewsy /> },
  { id: 'rynek', etykieta: 'Rynek', ikona: () => <IkonaRynek /> },
]

export function PasekNawigacji({
  aktywna,
  naZmiane,
  licznikNewsow,
}: {
  aktywna: Zakladka
  naZmiane: (z: Zakladka) => void
  licznikNewsow?: number
}) {
  return (
    <nav className="bezpieczny-dol fixed inset-x-0 bottom-0 z-40 px-3 pt-2">
      <div className="szklo mx-auto flex max-w-md items-stretch gap-1 rounded-3xl p-1.5">
        {ZAKLADKI.map((z) => {
          const jest = aktywna === z.id
          return (
            <button
              key={z.id}
              onClick={() => {
                if (!jest) {
                  naZmiane(z.id)
                  void drgnij('lekko')
                }
              }}
              aria-current={jest ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors"
              style={{ color: jest ? 'var(--tekst)' : 'var(--tekst-3)' }}
            >
              {jest && (
                <motion.span
                  layoutId="pigulka-nawigacji"
                  className="absolute inset-0 -z-10 rounded-2xl bg-white/9"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative">
                {z.ikona(jest)}
                {z.id === 'newsy' && !!licznikNewsow && licznikNewsow > 0 && (
                  <span
                    className="cyfry absolute -right-2 -top-1 min-w-[16px] rounded-full px-1 text-[9px] font-bold leading-4"
                    style={{ background: 'var(--czerwien)', color: '#fff' }}
                  >
                    {licznikNewsow > 9 ? '9+' : licznikNewsow}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{z.etykieta}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ------------------------------------------------------------------ nagłówek

export function NaglowekEkranu({
  tytul,
  podtytul,
  akcja,
  status,
  ostatnieDane,
  zPamieci,
}: {
  tytul: string
  podtytul?: string
  akcja?: ReactNode
  status?: StatusPolaczenia
  ostatnieDane?: number | null
  zPamieci?: boolean
}) {
  const opisStatusu: Record<StatusPolaczenia, { tekst: string; kolor: string }> = {
    nazywo: { tekst: 'NA ŻYWO', kolor: 'var(--zielen)' },
    laczenie: { tekst: 'ŁĄCZĘ…', kolor: '#F7931A' },
    rozlaczony: { tekst: 'ROZŁĄCZONY', kolor: 'var(--czerwien)' },
    offline: { tekst: 'OFFLINE', kolor: 'var(--czerwien)' },
  }
  const s = status ? opisStatusu[status] : null

  return (
    <header className="bezpieczna-gora px-4 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="naglowek text-[26px] font-bold leading-tight">{tytul}</h1>
          {podtytul && (
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--tekst-2)' }}>
              {podtytul}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {s && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${status === 'nazywo' ? 'oddech' : ''}`}
                style={{ background: s.kolor }}
              />
              <span className="text-[9.5px] font-bold tracking-wider" style={{ color: s.kolor }}>
                {s.tekst}
              </span>
            </span>
          )}
          {akcja}
        </div>
      </div>

      {zPamieci && ostatnieDane && (
        <div className="mt-2 rounded-xl bg-[#F7931A]/10 px-3 py-1.5">
          <p className="text-[11.5px]" style={{ color: '#F7931A' }}>
            Dane sprzed {temu(ostatnieDane).replace(' temu', '')} — brak połączenia
          </p>
        </div>
      )}
    </header>
  )
}

// ------------------------------------------------------------------ ekran + pull to refresh

const PROG_ODSWIEZENIA = 78

export function Ekran({
  children,
  naOdswiez,
  klasa = '',
}: {
  children: ReactNode
  naOdswiez?: () => Promise<void> | void
  klasa?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const [odswieza, ustawOdswieza] = useState(false)
  const start = useRef<number | null>(null)
  // Wszystkie hooki muszą lecieć bezwarunkowo – wcześniej `useTransform` siedział
  // w warunkowym JSX i ekrany bez pull-to-refresh wywalały się na kolejności hooków.
  const obrot = useTransform(y, [0, PROG_ODSWIEZENIA], [0, 180])
  const krycie = useTransform(y, [0, 30, PROG_ODSWIEZENIA], [0, 0.5, 1])
  const przesuniecieWskaznika = useTransform(y, (v) => v - 34)

  useEffect(() => {
    const el = ref.current
    if (!el || !naOdswiez) return

    const dotknij = (e: TouchEvent) => {
      if (el.scrollTop <= 0) start.current = e.touches[0].clientY
      else start.current = null
    }

    const ruch = (e: TouchEvent) => {
      if (start.current === null || odswieza) return
      const delta = e.touches[0].clientY - start.current
      if (delta <= 0) {
        y.set(0)
        return
      }
      // Gumowe tłumienie – im dalej, tym trudniej ciągnąć.
      y.set(Math.min(PROG_ODSWIEZENIA * 1.5, delta * 0.42))
    }

    const puszczenie = async () => {
      if (start.current === null) return
      const biezace = y.get()
      start.current = null
      if (biezace >= PROG_ODSWIEZENIA && !odswieza) {
        ustawOdswieza(true)
        void drgnij('srednio')
        animate(y, 44, { type: 'spring', stiffness: 300, damping: 30 })
        try {
          await naOdswiez()
        } finally {
          ustawOdswieza(false)
          animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 })
        }
      } else {
        animate(y, 0, { type: 'spring', stiffness: 400, damping: 32 })
      }
    }

    el.addEventListener('touchstart', dotknij, { passive: true })
    el.addEventListener('touchmove', ruch, { passive: true })
    el.addEventListener('touchend', puszczenie)
    el.addEventListener('touchcancel', puszczenie)
    return () => {
      el.removeEventListener('touchstart', dotknij)
      el.removeEventListener('touchmove', ruch)
      el.removeEventListener('touchend', puszczenie)
      el.removeEventListener('touchcancel', puszczenie)
    }
  }, [naOdswiez, odswieza, y])

  return (
    <div className="relative h-full">
      {naOdswiez && (
        <motion.div
          style={{ y: przesuniecieWskaznika, opacity: krycie }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3"
        >
          <motion.span
            style={{ rotate: odswieza ? undefined : obrot }}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/10 ${
              odswieza ? 'animate-obrot' : ''
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3v6h-6" />
            </svg>
          </motion.span>
        </motion.div>
      )}

      <motion.div
        ref={ref}
        style={{ y }}
        className={`przewijanie h-full pb-28 ${klasa}`}
      >
        {children}
      </motion.div>
    </div>
  )
}

// ------------------------------------------------------------------ drobiazgi

export function Kafelek({
  etykieta,
  wartosc,
  opis,
  kolor,
  na,
}: {
  etykieta: string
  wartosc: ReactNode
  opis?: string
  kolor?: string
  na?: () => void
}) {
  return (
    <div
      onClick={na}
      className={`karta p-3 ${na ? 'cursor-pointer active:scale-[0.98]' : ''} transition-transform`}
    >
      <p className="etykieta mb-1">{etykieta}</p>
      <p className="cyfry text-[17px] font-bold" style={{ color: kolor ?? 'var(--tekst)' }}>
        {wartosc}
      </p>
      {opis && (
        <p className="mt-0.5 text-[10.5px] leading-tight" style={{ color: 'var(--tekst-3)' }}>
          {opis}
        </p>
      )}
    </div>
  )
}

/** Półokrągły wskaźnik (strach i chciwość). */
export function WskaznikTarcza({
  wartosc,
  opis,
  min = 0,
  max = 100,
}: {
  wartosc: number
  opis: string
  min?: number
  max?: number
}) {
  const udzial = Math.max(0, Math.min(1, (wartosc - min) / (max - min)))
  const kat = -90 + udzial * 180
  const kolor =
    wartosc < 25 ? 'var(--czerwien)' : wartosc < 45 ? '#F7931A' : wartosc < 60 ? '#FFD166' : wartosc < 80 ? '#9CE37D' : 'var(--zielen)'

  const promien = 52
  const obwod = Math.PI * promien

  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="74" viewBox="0 0 130 74" aria-hidden>
        <path
          d={`M 13 66 A ${promien} ${promien} 0 0 1 117 66`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <motion.path
          d={`M 13 66 A ${promien} ${promien} 0 0 1 117 66`}
          fill="none"
          stroke={kolor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={obwod}
          initial={{ strokeDashoffset: obwod }}
          animate={{ strokeDashoffset: obwod * (1 - udzial) }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
        <motion.line
          x1="65"
          y1="66"
          x2="65"
          y2="26"
          stroke={kolor}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transformOrigin: '65px 66px' }}
          initial={{ rotate: -90 }}
          animate={{ rotate: kat }}
          transition={{ type: 'spring', stiffness: 110, damping: 18 }}
        />
        <circle cx="65" cy="66" r="4" fill={kolor} />
      </svg>
      <p className="cyfry -mt-1 text-2xl font-bold" style={{ color: kolor }}>
        {wartosc}
      </p>
      <p className="text-[11px]" style={{ color: 'var(--tekst-2)' }}>
        {opis}
      </p>
    </div>
  )
}

export function PustyStan({ tytul, opis, ikona }: { tytul: string; opis: string; ikona?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
      {ikona && <div className="mb-3 opacity-25">{ikona}</div>}
      <p className="naglowek mb-1 text-base font-semibold">{tytul}</p>
      <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
        {opis}
      </p>
    </div>
  )
}

export function Sekcja({ tytul, akcja, children }: { tytul: string; akcja?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="etykieta">{tytul}</h2>
        {akcja}
      </div>
      {children}
    </section>
  )
}
