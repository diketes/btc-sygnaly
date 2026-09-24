/**
 * Cena na żywo.
 *
 * W każdym miejscu na cyfrę jest ZAWSZE dokładnie jeden glif. Zmiana cyfry
 * to krótkie „wpadnięcie” nowej wartości (lekki ruch z góry i rozjaśnienie)
 * — stara znika od razu, więc dwie cyfry nigdy nie nakładają się na siebie.
 *
 * Dlaczego nie ma tu już przewijanej taśmy 0–9 (poprzednia wersja):
 *  • cena zmienia się kilka razy na sekundę, a sprężyna taśmy potrzebowała
 *    około pół sekundy, żeby się zatrzymać — ostatnie cyfry właściwie nigdy
 *    nie stały w miejscu i stale pokazywały fragmenty dwóch wartości,
 *  • klucz komponentu zawierał wartość cyfry, więc każda zmiana tworzyła
 *    taśmę od nowa i animowała ją z „0px” do „-40%” — mieszane jednostki
 *    przeliczane w chwili montowania, co na wolniejszych telefonach kończyło
 *    się zatrzymaniem taśmy w pół drogi,
 *  • na słabszym Androidzie (telefon taty) rozsypka była stała i cena była
 *    nieczytelna. Test `npm run test:cena` odtwarzał to w 5 na 5 scenariuszy.
 *
 * Wymiary są w jednostkach czcionki (`ch`), więc systemowe powiększenie
 * tekstu po prostu powiększa całą cenę.
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

/**
 * Wejście nowej cyfry. Oba końce w tych samych jednostkach (`em`), żeby
 * biblioteka animacji nie musiała niczego przeliczać na piksele.
 */
const WEJSCIE = {
  initial: { opacity: 0.45, y: '-0.1em' },
  animate: { opacity: 1, y: '0em' },
  transition: { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] },
}

function Cyfra({
  znak,
  pozycja,
  animujWejscie,
}: {
  znak: string
  pozycja: number
  /** false przy pierwszym wyświetleniu ceny – ma się po prostu pojawić. */
  animujWejscie: boolean
}) {
  if (!/\d/.test(znak)) {
    return <span style={{ display: 'inline-block' }}>{znak}</span>
  }

  return (
    <span
      data-slot-cyfry
      style={{
        display: 'inline-block',
        // `ch` = szerokość „0” w faktycznie użytej czcionce – cyfry trzymają
        // równe odstępy także wtedy, gdy wejdzie czcionka zapasowa.
        width: '1ch',
        textAlign: 'center',
      }}
    >
      {/*
        Klucz zawiera wartość celowo: nowa cyfra to nowy element, więc animacja
        wejścia odpala się przy każdej zmianie. Poprzedni element znika od razu
        (bez AnimatePresence) — w miejscu nigdy nie ma dwóch glifów.
      */}
      <motion.span
        key={`${pozycja}-${znak}`}
        style={{ display: 'inline-block' }}
        // `initial` czytane jest tylko przy montowaniu – cyfry obecne od startu
        // nie animują się, a każda późniejsza zmiana (nowy klucz) już tak.
        initial={animujWejscie ? WEJSCIE.initial : false}
        animate={WEJSCIE.animate}
        transition={WEJSCIE.transition}
      >
        {znak}
      </motion.span>
    </span>
  )
}

function CenaNaZywoBase({ wartosc, rozmiar = 44, miejsca = 0, klasa = '', zBlyskiem = true }: Props) {
  const [blysk, ustawBlysk] = useState<'gora' | 'dol' | null>(null)
  const poprzednia = useRef<number | null>(null)
  // Pierwsze wyświetlenie bez animacji – cena ma się po prostu pojawić.
  const [zamontowana, ustawZamontowana] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => ustawZamontowana(true), 0)
    return () => clearTimeout(t)
  }, [])

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
      data-cena={tekst.replace(/\D/g, '')}
      aria-label={`${tekst}`}
      className={`cyfry inline-flex items-end rounded-lg px-1 ${
        blysk === 'gora' ? 'blysk-w-gore' : blysk === 'dol' ? 'blysk-w-dol' : ''
      } ${klasa}`}
      style={{ fontSize: rozmiar, lineHeight: 1.15 }}
    >
      {tekst.split('').map((z, i) => (
        <Cyfra key={i} znak={z} pozycja={i} animujWejscie={zamontowana} />
      ))}
    </span>
  )
}

export const CenaNaZywo = memo(CenaNaZywoBase)
