import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { horyzontyDlaTrybu, PROFILE } from '@/analiza/profile'
import { czySygnal } from '@/analiza/typy'
import { cena as fCena, kwota, procent, temu } from '@/lib/format'
import { uzyjNewsow } from '@/stan/newsy'
import { podsumujLikwidacje, uzyjRynku } from '@/stan/rynek'
import { uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { CenaNaZywo } from '@/ui/CenaNaZywo'
import { IkonaNewsy, IkonaOstrzezenie, IkonaUstawienia, IkonaZegar } from '@/ui/Ikony'
import { KartaAnalizy } from '@/ui/KartaSygnalu'
import { Ekran, Kafelek, NaglowekEkranu, PustyStan, Sekcja, WskaznikTarcza } from '@/ui/Powloka'
import { PrzelacznikHoryzontu } from '@/ui/PrzelacznikHoryzontu'
import { coMozeRuszycBtc } from '@/dane/newsy'
import { najblizszeWysokiegoRyzyka } from '@/dane/newsy/kalendarz'
import { za } from '@/lib/format'

interface Props {
  naUstawienia: () => void
  naSygnal: (id: string) => void
  naNewsy: () => void
}

export function Pulpit({ naUstawienia, naSygnal, naNewsy }: Props) {
  const { cena, ticker, status, migawka, likwidacje, ostatnieDane, danieZPamieci, odswiezSwiece, odswiezMigawke } =
    uzyjRynku()
  const { analizy, aktywne } = uzyjSygnalow()
  const { klastry, kalendarz } = uzyjNewsow()
  const trybHoryzontu = uzyjUstawien((s) => s.trybHoryzontu)
  const ustaw = uzyjUstawien((s) => s.ustaw)

  const horyzonty = horyzontyDlaTrybu(trybHoryzontu)
  const zmiana = ticker?.zmiana24hProc ?? null
  const rosnie = (zmiana ?? 0) >= 0

  const wazneNewsy = useMemo(() => coMozeRuszycBtc(klastry, 6, 24).slice(0, 3), [klastry])
  const najblizszeMakro = useMemo(() => najblizszeWysokiegoRyzyka(kalendarz), [kalendarz])
  const likwidacje15m = useMemo(() => podsumujLikwidacje(likwidacje, 15), [likwidacje])

  const odswiez = async () => {
    await Promise.all([odswiezSwiece(), odswiezMigawke()])
  }

  return (
    <Ekran naOdswiez={odswiez}>
      <NaglowekEkranu
        tytul="BTC Sygnały"
        status={status}
        ostatnieDane={ostatnieDane}
        zPamieci={danieZPamieci}
        akcja={
          <button
            onClick={naUstawienia}
            aria-label="Ustawienia"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:scale-95"
            style={{ color: 'var(--tekst-2)' }}
          >
            <IkonaUstawienia rozmiar={18} />
          </button>
        }
      />

      <div className="px-4">
        {/* Cena */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          className="mb-4 mt-1"
        >
          <div className="flex items-end gap-2">
            <CenaNaZywo wartosc={cena} rozmiar={46} klasa="font-bold" />
            <span className="mb-1.5 text-sm font-semibold" style={{ color: 'var(--tekst-3)' }}>
              USDT
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span
              className="cyfry rounded-lg px-2 py-0.5 text-[13px] font-bold"
              style={{
                color: rosnie ? 'var(--zielen)' : 'var(--czerwien)',
                background: rosnie ? 'rgba(0,226,138,0.12)' : 'rgba(255,59,92,0.12)',
              }}
            >
              {procent(zmiana)}
            </span>
            <span className="cyfry text-[12px]" style={{ color: 'var(--tekst-3)' }}>
              24h: {fCena(ticker?.min24h)} – {fCena(ticker?.max24h)}
            </span>
          </div>
        </motion.div>

        {/* Przełącznik horyzontu */}
        <div className="mb-4">
          <PrzelacznikHoryzontu wartosc={trybHoryzontu} naZmiane={(t) => ustaw('trybHoryzontu', t)} />
        </div>

        {/* Ostrzeżenie o wydarzeniu makro */}
        {najblizszeMakro && najblizszeMakro.czas - Date.now() < 6 * 3_600_000 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`karta mb-4 flex items-center gap-3 p-3 ${
              najblizszeMakro.czas - Date.now() < 3_600_000 ? 'oddech' : ''
            }`}
            style={{ borderColor: 'rgba(247,147,26,0.3)' }}
          >
            <IkonaZegar rozmiar={18} klasa="shrink-0 text-[#F7931A]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{najblizszeMakro.nazwa}</p>
              <p className="text-[11px]" style={{ color: 'var(--tekst-3)' }}>
                {za(najblizszeMakro.czas)}
                {!najblizszeMakro.pewny && ' · termin orientacyjny'}
                {najblizszeMakro.prognoza && ` · prognoza ${najblizszeMakro.prognoza}`}
              </p>
            </div>
          </motion.div>
        )}

        {/* Sygnały */}
        <Sekcja tytul={trybHoryzontu === 'oba' ? 'Sygnały – oba horyzonty' : 'Sygnał'}>
          <div className="space-y-3">
            {horyzonty.map((h) => {
              const aktywny = aktywne.find((s) => s.horyzont === h)
              const analiza = aktywny ?? analizy[h]
              if (!analiza) {
                return (
                  <div key={h} className="karta p-4">
                    <p className="etykieta mb-1">{PROFILE[h].nazwa}</p>
                    <p className="text-[13px]" style={{ color: 'var(--tekst-2)' }}>
                      Liczę analizę…
                    </p>
                  </div>
                )
              }
              return (
                <KartaAnalizy
                  key={h}
                  analiza={analiza}
                  cenaBiezaca={cena}
                  naKlik={czySygnal(analiza) ? () => naSygnal(analiza.id) : undefined}
                />
              )
            })}
          </div>
        </Sekcja>

        {/* Nastroje i szybkie liczby */}
        <Sekcja tytul="Nastroje rynku">
          <div className="karta flex items-center gap-4 p-4">
            {migawka?.strachChciwosc ? (
              <WskaznikTarcza
                wartosc={migawka.strachChciwosc.wartosc}
                opis={migawka.strachChciwosc.opis}
              />
            ) : (
              <div className="flex h-20 flex-1 items-center justify-center">
                <span className="text-[12px]" style={{ color: 'var(--tekst-3)' }}>
                  Brak danych o nastrojach
                </span>
              </div>
            )}
            <div className="flex-1 space-y-2">
              {[
                {
                  e: 'Funding',
                  w: migawka?.funding ? `${migawka.funding.ostatni.toFixed(4).replace('.', ',')}%` : '—',
                  k: migawka?.funding
                    ? migawka.funding.ostatni > 0.03
                      ? 'var(--czerwien)'
                      : migawka.funding.ostatni < -0.01
                        ? 'var(--zielen)'
                        : undefined
                    : undefined,
                },
                {
                  e: 'Long / Short',
                  w: migawka?.longShort ? migawka.longShort.ratio.toFixed(2).replace('.', ',') : '—',
                },
                {
                  e: 'Dominacja BTC',
                  w: migawka?.globalny ? `${migawka.globalny.dominacjaBtc.toFixed(1).replace('.', ',')}%` : '—',
                },
              ].map((x) => (
                <div key={x.e} className="flex items-baseline justify-between">
                  <span className="text-[12px]" style={{ color: 'var(--tekst-2)' }}>
                    {x.e}
                  </span>
                  <span className="cyfry text-[13px] font-semibold" style={{ color: x.k }}>
                    {x.w}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {likwidacje15m.razem > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Kafelek
                etykieta="Likwidacje longów 15 min"
                wartosc={`${kwota(likwidacje15m.long)} $`}
                kolor="var(--czerwien)"
              />
              <Kafelek
                etykieta="Likwidacje shortów 15 min"
                wartosc={`${kwota(likwidacje15m.short)} $`}
                kolor="var(--zielen)"
              />
            </div>
          )}
        </Sekcja>

        {/* Newsy */}
        <Sekcja
          tytul="Co może ruszyć BTC"
          akcja={
            <button onClick={naNewsy} className="text-[11px] font-semibold" style={{ color: 'var(--fiolet)' }}>
              Wszystkie
            </button>
          }
        >
          {wazneNewsy.length === 0 ? (
            <div className="karta">
              <PustyStan
                tytul="Spokojnie na froncie"
                opis="Brak newsów o dużym wpływie z ostatnich 24 godzin."
                ikona={<IkonaNewsy rozmiar={30} />}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {wazneNewsy.map((k) => (
                <button
                  key={k.id}
                  onClick={naNewsy}
                  className="karta flex w-full items-start gap-3 p-3 text-left active:scale-[0.99]"
                >
                  <span
                    className="cyfry mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold"
                    style={{
                      background:
                        k.ocena.wydzwiek >= 2
                          ? 'rgba(0,226,138,0.14)'
                          : k.ocena.wydzwiek <= -2
                            ? 'rgba(255,59,92,0.14)'
                            : 'rgba(255,255,255,0.07)',
                      color:
                        k.ocena.wydzwiek >= 2
                          ? 'var(--zielen)'
                          : k.ocena.wydzwiek <= -2
                            ? 'var(--czerwien)'
                            : 'var(--tekst-2)',
                    }}
                  >
                    {k.ocena.wplyw}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[13px] font-medium leading-snug">
                      {k.tytul}
                    </span>
                    <span className="mt-0.5 block text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
                      {k.ocena.nazwaKategorii} · {temu(k.pierwszaData)}
                      {k.zrodla.length > 1 && ` · ${k.zrodla.length} źródeł`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Sekcja>

        {/* Disclaimer */}
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-white/3 p-3">
          <IkonaOstrzezenie rozmiar={14} klasa="mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
            To nie jest porada inwestycyjna. Handel BTC z dźwignią wiąże się z ryzykiem utraty całego
            kapitału.
          </p>
        </div>
      </div>
    </Ekran>
  )
}
