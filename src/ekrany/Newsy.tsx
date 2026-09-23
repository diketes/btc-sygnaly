import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { coMozeRuszycBtc } from '@/dane/newsy'
import type { ZapisKlastra } from '@/dane/db'
import { NAZWY_KATEGORII, type Kategoria } from '@/dane/newsy/ocena'
import { dataGodzina, temu, za, zrodlaOdmiana } from '@/lib/format'
import { drgnij } from '@/lib/powiadomienia'
import { uzyjNewsow } from '@/stan/newsy'
import { IkonaLink, IkonaNewsy, IkonaOstrzezenie, IkonaZegar } from '@/ui/Ikony'
import { Ekran, NaglowekEkranu, PustyStan, Sekcja } from '@/ui/Powloka'

const KATEGORIE: (Kategoria | 'wszystkie')[] = [
  'wszystkie',
  'makro',
  'etf',
  'regulacje',
  'onchain',
  'bezpieczenstwo',
  'adopcja',
  'gornicy',
  'technologia',
  'opinia',
]

export function Newsy() {
  const {
    klastry,
    kalendarz,
    kalendarzPewny,
    komunikatKalendarza,
    ladowanie,
    ostatnieOdswiezenie,
    bledy,
    komunikatOgolny,
    statystyki,
    odswiez,
    odswiezKalendarz,
    oznaczJakoPrzeczytane,
  } = uzyjNewsow()

  const [kategoria, ustawKategorie] = useState<Kategoria | 'wszystkie'>('wszystkie')
  const [rozwiniety, ustawRozwiniety] = useState<string | null>(null)

  const wazne = useMemo(() => coMozeRuszycBtc(klastry, 7, 24), [klastry])
  const nadchodzace = useMemo(
    () =>
      kalendarz
        .filter((w) => w.czas > Date.now() && w.czas < Date.now() + 7 * 86_400_000)
        .slice(0, 5),
    [kalendarz],
  )

  const lista = useMemo(() => {
    const f = kategoria === 'wszystkie' ? klastry : klastry.filter((k) => k.ocena.kategoria === kategoria)
    return f.slice(0, 120)
  }, [klastry, kategoria])

  const odswiezWszystko = async () => {
    await Promise.all([odswiez(), odswiezKalendarz()])
  }

  return (
    <Ekran naOdswiez={odswiezWszystko}>
      <NaglowekEkranu
        tytul="Newsy"
        podtytul={
          ostatnieOdswiezenie
            ? `Odświeżono ${temu(ostatnieOdswiezenie)} · ${klastry.length} historii`
            : 'Pobieram kanały…'
        }
      />

      <div className="px-4">
        {komunikatOgolny && (
          <div className="karta mb-4 flex items-start gap-2.5 p-3.5" style={{ borderColor: 'rgba(247,147,26,0.3)' }}>
            <IkonaOstrzezenie rozmiar={16} klasa="mt-0.5 shrink-0 text-[#F7931A]" />
            <div>
              <p className="mb-1 text-[12.5px] font-semibold" style={{ color: '#F7931A' }}>
                Nie udało się pobrać newsów
              </p>
              <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
                {komunikatOgolny}
              </p>
            </div>
          </div>
        )}

        {/* Co może ruszyć BTC */}
        <Sekcja tytul="Co może ruszyć BTC">
          {nadchodzace.length > 0 && (
            <div className="mb-3 space-y-2">
              {nadchodzace.map((w) => {
                const blisko = w.czas - Date.now() < 3_600_000
                return (
                  <div
                    key={w.id}
                    className={`karta flex items-center gap-3 p-3 ${blisko ? 'oddech' : ''}`}
                  >
                    <IkonaZegar
                      rozmiar={17}
                      klasa={`shrink-0 ${w.waga === 'wysoka' ? 'text-[#F7931A]' : 'text-white/40'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-snug">{w.nazwa}</p>
                      <p className="text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
                        {w.kraj} · {dataGodzina(w.czas)}
                        {!w.pewny && ' · termin orientacyjny'}
                        {w.prognoza && ` · prognoza ${w.prognoza}`}
                      </p>
                    </div>
                    <span
                      className="cyfry shrink-0 text-[11px] font-semibold"
                      style={{ color: blisko ? '#F7931A' : 'var(--tekst-2)' }}
                    >
                      {za(w.czas).replace('za ', '')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {komunikatKalendarza && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-[#F7931A]/10 p-2.5">
              <IkonaOstrzezenie rozmiar={13} klasa="mt-0.5 shrink-0 text-[#F7931A]" />
              <p className="text-[11px]" style={{ color: '#F7931A' }}>
                {komunikatKalendarza}
              </p>
            </div>
          )}

          {wazne.length > 0 ? (
            <div className="space-y-2">
              {wazne.slice(0, 4).map((k) => (
                <KartaNewsa
                  key={k.id}
                  klaster={k}
                  wyrozniona
                  rozwinieta={rozwiniety === k.id}
                  naKlik={() => {
                    ustawRozwiniety(rozwiniety === k.id ? null : k.id)
                    void oznaczJakoPrzeczytane([k.id])
                    void drgnij('lekko')
                  }}
                />
              ))}
            </div>
          ) : (
            !nadchodzace.length && (
              <div className="karta">
                <PustyStan
                  tytul="Brak newsów o dużej wadze"
                  opis="Nic z ostatniej doby nie przekracza progu wpływu 7/10."
                  ikona={<IkonaNewsy rozmiar={28} />}
                />
              </div>
            )
          )}
        </Sekcja>

        {/* Filtry */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {KATEGORIE.map((k) => {
            const aktywna = kategoria === k
            const ile =
              k === 'wszystkie' ? klastry.length : klastry.filter((x) => x.ocena.kategoria === k).length
            if (ile === 0 && k !== 'wszystkie') return null
            return (
              <button
                key={k}
                onClick={() => ustawKategorie(k)}
                className="shrink-0 rounded-xl px-3 py-1.5 text-[11.5px] font-semibold transition-colors"
                style={{
                  background: aktywna ? 'var(--fiolet)' : 'rgba(255,255,255,0.05)',
                  color: aktywna ? '#050609' : 'var(--tekst-2)',
                }}
              >
                {k === 'wszystkie' ? 'Wszystkie' : NAZWY_KATEGORII[k]}
                <span className="ml-1 opacity-60">{ile}</span>
              </button>
            )
          })}
        </div>

        {/* Lista */}
        {lista.length === 0 ? (
          <div className="karta">
            <PustyStan
              tytul={ladowanie ? 'Pobieram newsy…' : 'Brak newsów'}
              opis={
                ladowanie
                  ? 'Ściągam kanały i sprawdzam, czy któraś historia nie jest powtórką.'
                  : 'Pociągnij w dół, żeby odświeżyć.'
              }
              ikona={<IkonaNewsy rozmiar={30} />}
            />
          </div>
        ) : (
          <div className="space-y-2" data-lista="newsy">
            {lista.map((k) => (
              <KartaNewsa
                key={k.id}
                klaster={k}
                rozwinieta={rozwiniety === k.id}
                naKlik={() => {
                  ustawRozwiniety(rozwiniety === k.id ? null : k.id)
                  void oznaczJakoPrzeczytane([k.id])
                  void drgnij('lekko')
                }}
              />
            ))}
          </div>
        )}

        {/* Diagnostyka deduplikacji */}
        {statystyki && (
          <div className="mt-4 rounded-2xl bg-white/3 p-3">
            <p className="etykieta mb-1.5">Ostatnie odświeżenie</p>
            <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
              Pobrano {statystyki.pobrane} pozycji · {statystyki.nowe} nowych historii ·{' '}
              {statystyki.wzbogacone} uzupełnionych o kolejne źródło.
              <br />
              Odrzucono jako powtórki: {statystyki.odrzuconeUrl} po adresie,{' '}
              {statystyki.odrzuconeSimhash} po podobieństwie treści, {statystyki.odrzuconeJaccard} po
              pokryciu słów.
            </p>
          </div>
        )}

        {bledy.length > 0 && (
          <div className="mt-3 rounded-2xl bg-[#FF3B5C]/8 p-3">
            <p className="etykieta mb-1.5" style={{ color: 'var(--czerwien)' }}>
              Kanały bez odpowiedzi
            </p>
            {bledy.map((b, i) => (
              <p key={i} className="text-[11px]" style={{ color: 'var(--tekst-3)' }}>
                {b.zrodlo}: {b.komunikat}
              </p>
            ))}
          </div>
        )}
      </div>
    </Ekran>
  )
}

function KartaNewsa({
  klaster,
  rozwinieta,
  wyrozniona = false,
  naKlik,
}: {
  klaster: ZapisKlastra
  rozwinieta: boolean
  wyrozniona?: boolean
  naKlik: () => void
}) {
  const { ocena } = klaster
  const kolor =
    ocena.wydzwiek >= 2 ? 'var(--zielen)' : ocena.wydzwiek <= -2 ? 'var(--czerwien)' : 'var(--tekst-2)'

  return (
    <motion.div
      layout
      onClick={naKlik}
      data-klaster={klaster.id}
      className={`karta cursor-pointer overflow-hidden p-3.5 ${
        klaster.przeczytany ? 'opacity-75' : ''
      }`}
      style={wyrozniona ? { borderColor: `${kolor}44` } : undefined}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl"
          style={{ background: `${kolor}1a` }}
        >
          <span className="cyfry text-[13px] font-bold leading-none" style={{ color: kolor }}>
            {ocena.wplyw}
          </span>
          <span className="text-[7px] leading-none" style={{ color: kolor, opacity: 0.7 }}>
            /10
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-[13.5px] font-medium leading-snug ${rozwinieta ? '' : 'line-clamp-3'}`}>
            {klaster.tytul}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[10.5px] font-semibold" style={{ color: kolor }}>
              {ocena.etykieta}
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
              {ocena.nazwaKategorii} · {temu(klaster.pierwszaData)}
            </span>
            {klaster.zrodla.length > 1 && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--tekst-2)' }}
              >
                {zrodlaOdmiana(klaster.zrodla.length)}
              </span>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {rozwinieta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-white/6 pt-3">
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
                {ocena.streszczenie}
              </p>

              {klaster.jezyk === 'en' && (
                <p className="mt-2 text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
                  Oryginał po angielsku — opis powyżej powstał z analizy treści, nie z tłumaczenia.
                </p>
              )}

              <p className="etykieta mb-1.5 mt-3">
                {klaster.zrodla.length > 1 ? 'Źródła tej historii' : 'Źródło'}
              </p>
              <div className="space-y-1">
                {klaster.zrodla
                  .slice()
                  .sort((a, b) => a.data - b.data)
                  .map((z, i) => (
                    <a
                      key={i}
                      href={z.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 rounded-lg bg-white/4 px-2.5 py-1.5"
                    >
                      <IkonaLink rozmiar={12} klasa="shrink-0 text-white/35" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11.5px] font-semibold">{z.nazwa}</span>
                        <span className="block truncate text-[10px]" style={{ color: 'var(--tekst-3)' }}>
                          {z.tytul}
                        </span>
                      </span>
                      <span className="shrink-0 text-[9.5px]" style={{ color: 'var(--tekst-3)' }}>
                        {temu(z.data)}
                      </span>
                    </a>
                  ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
