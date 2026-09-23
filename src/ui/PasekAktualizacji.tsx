/**
 * Pasek informujący o nowej wersji aplikacji.
 *
 * Dwa przypadki:
 *  • APK z GitHuba — pokazujemy numer wydania i przycisk pobierania,
 *  • PWA — nowa wersja jest już pobrana przez service workera, wystarczy
 *    przeładować; nie każemy niczego ściągać.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { kwota } from '@/lib/format'
import { drgnij } from '@/lib/powiadomienia'
import type { Aktualizacja } from '@/dane/aktualizacje'
import { IkonaOdswiez, IkonaZamknij } from './Ikony'

interface Props {
  /** Aktualizacja do pobrania (wersja natywna) albo null. */
  doPobrania: Aktualizacja | null
  /** Czy PWA ma gotową nową wersję do przeładowania. */
  gotowaDoOdswiezenia: boolean
  naPobierz: (a: Aktualizacja) => void
  naOdswiez: () => void
  naOdrzuc: () => void
}

export function PasekAktualizacji({
  doPobrania,
  gotowaDoOdswiezenia,
  naPobierz,
  naOdswiez,
  naOdrzuc,
}: Props) {
  const widoczny = Boolean(doPobrania) || gotowaDoOdswiezenia
  const nowaWersja = Boolean(doPobrania)

  return (
    <AnimatePresence>
      {widoczny && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="bezpieczna-gora fixed inset-x-0 top-0 z-[60] px-3 pb-2"
        >
          <div
            className="szklo mx-auto flex max-w-md items-center gap-3 rounded-2xl p-3"
            style={{ borderColor: 'rgba(0,226,138,0.35)' }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(0,226,138,0.14)', color: 'var(--zielen)' }}
            >
              <IkonaOdswiez rozmiar={17} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight">
                {nowaWersja ? `Nowa wersja ${doPobrania!.wersja}` : 'Nowa wersja gotowa'}
              </p>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--tekst-2)' }}>
                {nowaWersja
                  ? doPobrania!.rozmiarBajty
                    ? `Pobierz i zainstaluj (${kwota(doPobrania!.rozmiarBajty)} B)`
                    : 'Pobierz i zainstaluj'
                  : 'Odśwież, żeby ją włączyć'}
              </p>
            </div>

            <button
              onClick={() => {
                void drgnij('srednio')
                if (doPobrania) naPobierz(doPobrania)
                else naOdswiez()
              }}
              className="shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-bold active:scale-95"
              style={{ background: 'var(--zielen)', color: '#050609' }}
            >
              {nowaWersja ? 'Pobierz' : 'Odśwież'}
            </button>

            <button
              onClick={naOdrzuc}
              aria-label="Ukryj"
              className="shrink-0 rounded-lg p-1.5"
              style={{ color: 'var(--tekst-3)' }}
            >
              <IkonaZamknij rozmiar={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
