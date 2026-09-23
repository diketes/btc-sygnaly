/**
 * Przełącznik horyzontu: KRÓTKI / DŁUGI / OBA.
 *
 * To główny wybór w aplikacji – decyduje, które interwały są analizowane,
 * jak szeroki jest stop loss, jak daleko sięgają cele i jak długo żyje sygnał.
 * Pigułka pod aktywną opcją jedzie na sprężynie (layoutId Framer Motion).
 */

import { motion } from 'framer-motion'
import { PROFILE, type TrybHoryzontu } from '@/analiza/profile'
import { drgnij } from '@/lib/powiadomienia'
import { IkonaBlyskawica, IkonaGora } from './Ikony'

interface Props {
  wartosc: TrybHoryzontu
  naZmiane: (t: TrybHoryzontu) => void
  /** Wariant kompaktowy – bez opisów, do nagłówków ekranów. */
  kompaktowy?: boolean
}

const OPCJE: { id: TrybHoryzontu; etykieta: string; opis: string }[] = [
  { id: 'krotki', etykieta: 'Krótki', opis: PROFILE.krotki.opisDlugosci },
  { id: 'dlugi', etykieta: 'Długi', opis: PROFILE.dlugi.opisDlugosci },
  { id: 'oba', etykieta: 'Oba', opis: 'dwa sygnały naraz' },
]

export function PrzelacznikHoryzontu({ wartosc, naZmiane, kompaktowy = false }: Props) {
  return (
    <div
      className="szklo relative grid grid-cols-3 gap-1 rounded-2xl p-1"
      role="tablist"
      aria-label="Horyzont inwestycyjny"
    >
      {OPCJE.map((o) => {
        const aktywna = wartosc === o.id
        const kolor =
          o.id === 'krotki'
            ? PROFILE.krotki.kolorAkcentu
            : o.id === 'dlugi'
              ? PROFILE.dlugi.kolorAkcentu
              : '#FFFFFF'

        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={aktywna}
            onClick={() => {
              if (!aktywna) {
                naZmiane(o.id)
                void drgnij('lekko')
              }
            }}
            className={`relative z-10 rounded-xl px-2 transition-colors ${
              kompaktowy ? 'py-2' : 'py-2.5'
            }`}
            style={{ color: aktywna ? '#050609' : 'var(--tekst-2)' }}
          >
            {aktywna && (
              <motion.span
                layoutId="pigulka-horyzontu"
                className="absolute inset-0 -z-10 rounded-xl"
                style={{ background: kolor, boxShadow: `0 6px 22px -8px ${kolor}` }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="flex items-center justify-center gap-1.5">
              {o.id === 'krotki' && <IkonaBlyskawica rozmiar={14} />}
              {o.id === 'dlugi' && <IkonaGora rozmiar={14} />}
              <span className="naglowek text-sm font-semibold">{o.etykieta}</span>
            </span>
            {!kompaktowy && (
              <span
                className="mt-0.5 block text-[10px] leading-tight"
                style={{ color: aktywna ? 'rgba(5,6,9,0.62)' : 'var(--tekst-3)' }}
              >
                {o.opis}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
