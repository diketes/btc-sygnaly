/** Ekran powitalny z obowiązkową akceptacją ryzyka – pokazywany raz. */

import { motion } from 'framer-motion'
import { PROFILE } from '@/analiza/profile'
import { IkonaBlyskawica, IkonaGora, IkonaOstrzezenie } from '@/ui/Ikony'

export function Powitanie({ naAkceptacje }: { naAkceptacje: () => void }) {
  return (
    <div className="bezpieczna-gora bezpieczny-dol flex h-full flex-col justify-between px-6 py-8">
      <div />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 26 }}
      >
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl"
          style={{ background: 'rgba(247,147,26,0.14)' }}
        >
          <span className="naglowek text-3xl font-bold" style={{ color: 'var(--zloto)' }}>
            ₿
          </span>
        </div>

        <h1 className="naglowek text-[32px] font-bold leading-tight">BTC Sygnały</h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
          Analiza techniczna Bitcoina na żywo, sygnały long i short z konkretnymi poziomami oraz
          newsy, które naprawdę potrafią ruszyć kursem.
        </p>

        <div className="mt-6 space-y-2.5">
          {(['krotki', 'dlugi'] as const).map((h) => {
            const p = PROFILE[h]
            return (
              <div key={h} className="karta flex items-start gap-3 p-3.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${p.kolorAkcentu}1f`, color: p.kolorAkcentu }}
                >
                  {h === 'krotki' ? <IkonaBlyskawica rozmiar={17} /> : <IkonaGora rozmiar={17} />}
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold">{p.nazwa}</span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--tekst-3)' }}>
                    {p.podtytul} · {p.opisDlugosci} · interwały{' '}
                    {p.interwaly.map((i) => i.interwal).join(', ')}
                  </span>
                </span>
              </div>
            )
          })}
          <p className="px-1 text-[11.5px]" style={{ color: 'var(--tekst-3)' }}>
            Możesz śledzić jeden horyzont albo oba naraz — przełącznik jest na każdym ekranie.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-6"
      >
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-[#FF3B5C]/10 p-3.5">
          <IkonaOstrzezenie rozmiar={17} klasa="mt-0.5 shrink-0 text-[var(--czerwien)]" />
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
            <strong>To nie jest porada inwestycyjna.</strong> Handel BTC z dźwignią wiąże się z
            ryzykiem utraty całego kapitału. Sygnały to wynik analizy technicznej i danych
            publicznych — nie przewidują przyszłości. Skuteczność historyczna nie gwarantuje niczego
            na przyszłość.
          </p>
        </div>

        <button
          onClick={naAkceptacje}
          className="w-full rounded-2xl py-3.5 text-[15px] font-bold active:scale-[0.98]"
          style={{ background: 'var(--zielen)', color: '#050609' }}
        >
          Rozumiem, zaczynamy
        </button>
      </motion.div>
    </div>
  )
}
