/**
 * Pasek aktualizacji – pokazuje każdy etap: dostępna, pobieranie z postępem,
 * gotowa do instalacji, prośba o zgodę na instalowanie, błąd.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { drgnij } from '@/lib/powiadomienia'
import { uzyjAktualizacji } from '@/stan/aktualizacja'
import { IkonaOdswiez, IkonaOstrzezenie, IkonaZamknij } from './Ikony'

interface Tresc {
  tytul: string
  opis: string
  przycisk: string | null
  akcja: (() => void) | null
  kolor: string
}

/**
 * Tła i obwódki podane wprost. Celowo bez CSS color-mix() – starsze
 * wersje WebView na Androidzie go nie znają i pasek straciłby kolory.
 */
const ODCIENIE: Record<string, { tlo: string; obwodka: string }> = {
  'var(--zielen)': { tlo: 'rgba(0,226,138,0.16)', obwodka: 'rgba(0,226,138,0.4)' },
  'var(--zloto)': { tlo: 'rgba(247,147,26,0.16)', obwodka: 'rgba(247,147,26,0.4)' },
  'var(--czerwien)': { tlo: 'rgba(255,59,92,0.16)', obwodka: 'rgba(255,59,92,0.4)' },
}

export function PasekAktualizacji({ naOdswiezPwa }: { naOdswiezPwa: () => void }) {
  const {
    etap,
    aktualizacja,
    procent,
    komunikat,
    wbudowanyAktualizator,
    pobierz,
    zainstaluj,
    zezwolNaInstalacje,
    ukryj,
  } = uzyjAktualizacji()

  const wersja = aktualizacja?.wersja ?? ''
  const mb = aktualizacja?.rozmiarBajty ? ` · ${(aktualizacja.rozmiarBajty / 1048576).toFixed(1)} MB` : ''

  const tresc: Tresc | null = (() => {
    switch (etap) {
      case 'dostepna':
        return {
          tytul: `Nowa wersja ${wersja}`,
          opis: wbudowanyAktualizator ? `Pobierz i zainstaluj${mb}` : `Pobierz plik${mb}`,
          przycisk: 'Pobierz',
          akcja: () => void pobierz(),
          kolor: 'var(--zielen)',
        }
      case 'pobieranie':
        return {
          tytul: `Pobieram ${wersja}`,
          opis: `${procent}%`,
          przycisk: null,
          akcja: null,
          kolor: 'var(--zielen)',
        }
      case 'gotowa':
        return {
          tytul: `Aktualizacja ${wersja} gotowa`,
          opis: 'Pobrana – zostało tylko zainstalować',
          przycisk: 'Zainstaluj',
          akcja: () => void zainstaluj(),
          kolor: 'var(--zielen)',
        }
      case 'wymagana-zgoda':
        return {
          tytul: 'Potrzebna jednorazowa zgoda',
          opis: 'Zezwól na instalowanie z tej aplikacji i wróć tutaj',
          przycisk: 'Zezwól',
          akcja: () => void zezwolNaInstalacje(),
          kolor: 'var(--zloto)',
        }
      case 'blad':
        return {
          tytul: 'Aktualizacja się nie udała',
          opis: komunikat ?? 'Spróbuj ponownie',
          przycisk: 'Ponów',
          akcja: () => void pobierz(),
          kolor: 'var(--czerwien)',
        }
      case 'pwa-gotowa':
        return {
          tytul: 'Nowa wersja gotowa',
          opis: 'Odśwież, żeby ją włączyć',
          przycisk: 'Odśwież',
          akcja: naOdswiezPwa,
          kolor: 'var(--zielen)',
        }
      default:
        return null
    }
  })()

  return (
    <AnimatePresence>
      {tresc && (
        <motion.div
          key="pasek-aktualizacji"
          initial={{ y: -90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="bezpieczna-gora fixed inset-x-0 top-0 z-[60] px-3 pb-2"
        >
          <div
            className="szklo mx-auto max-w-md overflow-hidden rounded-2xl"
            style={{ borderColor: ODCIENIE[tresc.kolor]?.obwodka }}
          >
            <div className="flex items-center gap-3 p-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: ODCIENIE[tresc.kolor]?.tlo,
                  color: tresc.kolor,
                }}
              >
                {etap === 'blad' || etap === 'wymagana-zgoda' ? (
                  <IkonaOstrzezenie rozmiar={17} />
                ) : (
                  <IkonaOdswiez rozmiar={17} klasa={etap === 'pobieranie' ? 'animate-obrot' : ''} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight">{tresc.tytul}</p>
                <p className="line-clamp-2 text-[11px] leading-tight" style={{ color: 'var(--tekst-2)' }}>
                  {tresc.opis}
                </p>
              </div>

              {tresc.przycisk && tresc.akcja && (
                <button
                  onClick={() => {
                    void drgnij('srednio')
                    tresc.akcja?.()
                  }}
                  className="shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-bold active:scale-95"
                  style={{ background: tresc.kolor, color: '#050609' }}
                >
                  {tresc.przycisk}
                </button>
              )}

              {etap !== 'pobieranie' && (
                <button
                  onClick={ukryj}
                  aria-label="Ukryj"
                  className="shrink-0 rounded-lg p-1.5"
                  style={{ color: 'var(--tekst-3)' }}
                >
                  <IkonaZamknij rozmiar={16} />
                </button>
              )}
            </div>

            {etap === 'pobieranie' && (
              <div className="h-1 w-full bg-white/8">
                <motion.div
                  className="h-full"
                  style={{ background: 'var(--zielen)' }}
                  animate={{ width: `${procent}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
