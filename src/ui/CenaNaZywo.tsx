/**
 * Cena z przewijanymi cyframi.
 *
 * Każda cyfra to taśma 0–9 przesuwana transformacją – zmienia się tylko ta,
 * która faktycznie się zmieniła, więc reszta liczby nie „skacze”.
 * Animujemy wyłącznie `transform`, żeby nie wywoływać przeliczania układu.
 *
 * WAŻNE: cała geometria taśmy jest wyrażona w jednostkach czcionki (`em`, `ch`)
 * i w procentach własnej wysokości — nigdy w pikselach liczonych w JavaScripcie.
 * WebView Androida mnoży rozmiar tekstu zgodnie z systemowym ustawieniem
 * „Rozmiar czcionki”, ale NIE skaluje długości podanych w pikselach. Przy
 * wcześniejszej wersji (wysokość okienka liczona jako `rozmiar * 1.06` px)
 * powiększona czcionka wylewała się poza swoje miejsce i widać było fragmenty
 * dwóch cyfr naraz. Dopóki wszystko jest względne, powiększenie czcionki
 * po prostu powiększa całą cenę.
 */

/** Wysokość jednego miejsca na cyfrę, w jednostkach rozmiaru czcionki. */
const WYSOKOSC_SLOTU = '1.15em'

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

function Cyfra({ znak }: { znak: string }) {
  if (!/\d/.test(znak)) {
    return <span style={{ display: 'inline-block' }}>{znak}</span>
  }
  const cyfra = Number(znak)

  return (
    <span
      className="rolka"
      style={{
        height: WYSOKOSC_SLOTU,
        // `ch` to szerokość znaku „0” w faktycznie użytej czcionce – pasuje
        // nawet wtedy, gdy JetBrains Mono się nie wczyta i wejdzie zamiennik.
        width: '1ch',
      }}
    >
      <motion.span
        className="rolka-tasma"
        // Procent w translateY liczy się od własnej wysokości taśmy, a taśma
        // ma dokładnie 10 pozycji — czyli 10% to zawsze równo jedna cyfra,
        // niezależnie od rozmiaru czcionki.
        animate={{ y: `${-cyfra * 10}%` }}
        transition={SPREZYNA}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span
            key={d}
            style={{
              height: WYSOKOSC_SLOTU,
              lineHeight: WYSOKOSC_SLOTU,
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
        <Cyfra key={`${i}-${z}`} znak={z} />
      ))}
    </span>
  )
}

export const CenaNaZywo = memo(CenaNaZywoBase)
