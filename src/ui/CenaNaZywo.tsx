/**
 * Cena z przewijanymi cyframi.
 *
 * Każda cyfra to taśma 0–9 przesuwana transformacją – zmienia się tylko ta,
 * która faktycznie się zmieniła, więc reszta liczby nie „skacze”.
 * Animujemy wyłącznie `transform`, żeby nie wywoływać przeliczania układu.
 */

import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  wartosc: number | null
  /** Rozmiar czcionki w pikselach. */
  rozmiar?: number
  miejsca?: number
  klasa?: string
  /** Pokaż błysk tła przy zmianie. */
  zBlyskiem?: boolean
}

const SPREZYNA = { type: 'spring' as const, stiffness: 260, damping: 26, mass: 0.7 }

function Cyfra({ znak, rozmiar }: { znak: string; rozmiar: number }) {
  if (!/\d/.test(znak)) {
    return <span style={{ display: 'inline-block' }}>{znak}</span>
  }
  const cyfra = Number(znak)
  return (
    <span className="rolka" style={{ height: rozmiar * 1.06, width: rozmiar * 0.62 }}>
      <motion.span
        className="rolka-tasma"
        animate={{ y: -cyfra * rozmiar * 1.06 }}
        transition={SPREZYNA}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span
            key={d}
            style={{
              height: rozmiar * 1.06,
              lineHeight: `${rozmiar * 1.06}px`,
              textAlign: 'center',
            }}
          >
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

function CenaNaZywoBase({ wartosc, rozmiar = 44, miejsca = 0, klasa = '', zBlyskiem = true }: Props) {
  const [blysk, ustawBlysk] = useState<'gora' | 'dol' | null>(null)
  const poprzednia = useRef<number | null>(null)

  useEffect(() => {
    if (wartosc === null || !Number.isFinite(wartosc)) return
    const stara = poprzednia.current
    poprzednia.current = wartosc
    if (stara === null || !zBlyskiem || stara === wartosc) return

    ustawBlysk(wartosc > stara ? 'gora' : 'dol')
    const t = setTimeout(() => ustawBlysk(null), 500)
    return () => clearTimeout(t)
  }, [wartosc, zBlyskiem])

  if (wartosc === null || !Number.isFinite(wartosc)) {
    return (
      <span className={`cyfry ${klasa}`} style={{ fontSize: rozmiar, color: 'var(--tekst-3)' }}>
        —
      </span>
    )
  }

  const tekst = wartosc.toLocaleString('pl-PL', {
    minimumFractionDigits: miejsca,
    maximumFractionDigits: miejsca,
  })

  return (
    <span
      className={`cyfry inline-flex items-end rounded-lg px-1 ${
        blysk === 'gora' ? 'blysk-w-gore' : blysk === 'dol' ? 'blysk-w-dol' : ''
      } ${klasa}`}
      style={{ fontSize: rozmiar, lineHeight: 1 }}
    >
      {tekst.split('').map((z, i) => (
        <Cyfra key={`${i}-${z}`} znak={z} rozmiar={rozmiar} />
      ))}
    </span>
  )
}

export const CenaNaZywo = memo(CenaNaZywoBase)
