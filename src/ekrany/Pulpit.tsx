import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { biezacyWynikR, czekaNaWejscie } from '@/analiza/cykl'
import { horyzontyDlaTrybu, opisDni, PROFILE } from '@/analiza/profile'
import { czySygnal } from '@/analiza/typy'
import { cena as fCena, kwota, procent, temu } from '@/lib/format'
import { uzyjNewsow } from '@/stan/newsy'
import { zbudujKontekstRynku } from '@/stan/kontekst'
import { podsumujLikwidacje, uzyjRynku } from '@/stan/rynek'
import { aktywnyDlaHoryzontu, aktywnyZGeneratora, uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { CenaNaZywo } from '@/ui/CenaNaZywo'
import {
  IkonaIskra,
  IkonaNewsy,
  IkonaOstrzezenie,
  IkonaStrzalkaPrawo,
  IkonaUstawienia,
  IkonaZegar,
} from '@/ui/Ikony'
import { KartaAnalizy, KOLOR_GENERATORA } from '@/ui/KartaSygnalu'
import { Ekran, Kafelek, NaglowekEkranu, PustyStan, Sekcja, WskaznikTarcza } from '@/ui/Powloka'
import { PrzelacznikHoryzontu } from '@/ui/PrzelacznikHoryzontu'
import { coMozeRuszycBtc } from '@/dane/newsy'
import { najblizszeWysokiegoRyzyka } from '@/dane/newsy/kalendarz'
import { za } from '@/lib/format'

interface Props {
  naUstawienia: () => void
  naSygnal: (id: string) => void
  naGenerator: () => void
  naNewsy: () => void
}

export function Pulpit({ naUstawienia, naSygnal, naGenerator, naNewsy }: Props) {
  const { cena, ticker, status, migawka, likwidacje, ostatnieDane, danieZPamieci, odswiezSwiece, odswiezMigawke } =
    uzyjRynku()
  const { analizy, aktywne, wskazania, liczenieNaZadanie, dajSygnal } = uzyjSygnalow()
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
              const aktywny = aktywnyDlaHoryzontu(aktywne, h)
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
                  wskazania={wskazania[h]}
                  naDajSygnal={() => void dajSygnal(h, zbudujKontekstRynku())}
                  liczySygnal={liczenieNaZadanie === h}
                  naKlik={czySygnal(analiza) ? () => naSygnal(analiza.id) : undefined}
                />
              )
            })}
          </div>
        </Sekcja>

        <SkrotGeneratora naGenerator={naGenerator} />

        <RozjazdHoryzontow />

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

/**
 * Wejście do generatora: sygnał na dowolną liczbę dni od 2 do 90.
 * Gdy jakiś sygnał z generatora jest śledzony – pokazuje, jak mu idzie.
 */
function SkrotGeneratora({ naGenerator }: { naGenerator: () => void }) {
  const aktywne = uzyjSygnalow((s) => s.aktywne)
  const cena = uzyjRynku((s) => s.cena)
  const dni = uzyjUstawien((s) => s.dniGeneratora)
  const sledzony = aktywnyZGeneratora(aktywne)
  const czeka = sledzony ? czekaNaWejscie(sledzony) : false
  const r = sledzony && cena !== null && !czeka ? biezacyWynikR(sledzony, cena) : null

  return (
    <motion.button
      onClick={naGenerator}
      whileTap={{ scale: 0.98 }}
      data-skrot-generatora
      className="karta relative mb-5 flex w-full items-center gap-3 overflow-hidden p-3.5 text-left"
      style={{ borderColor: 'rgba(34,195,230,0.28)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full"
        style={{ background: KOLOR_GENERATORA, opacity: 0.14, filter: 'blur(36px)' }}
      />
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #22C3E6 0%, #7C5CFF 100%)', color: '#FFFFFF' }}
      >
        <IkonaIskra rozmiar={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="naglowek block text-[14px] font-semibold">Generator sygnału</span>
        <span className="block truncate text-[11.5px]" style={{ color: 'var(--tekst-2)' }}>
          {sledzony
            ? `Śledzisz ${sledzony.kierunek.toUpperCase()} · ${opisDni(sledzony.dniHoryzontu!)}`
            : `Wybierz od 2 dni do 3 miesięcy · ostatnio ${opisDni(dni)}`}
        </span>
      </span>
      {czeka ? (
        <span className="shrink-0 text-[11px] font-semibold" style={{ color: 'var(--tekst-2)' }}>
          czeka na wejście
        </span>
      ) : r !== null ? (
        <span
          className="cyfry shrink-0 text-[13px] font-bold"
          style={{ color: r >= 0 ? 'var(--zielen)' : 'var(--czerwien)' }}
        >
          {r >= 0 ? '+' : ''}
          {r.toFixed(2).replace('.', ',')}R
        </span>
      ) : (
        <IkonaStrzalkaPrawo rozmiar={16} klasa="shrink-0 text-white/40" />
      )}
    </motion.button>
  )
}

/**
 * Ostrzeżenie, gdy krótki i długi horyzont wskazują w przeciwne strony.
 *
 * To nie jest błąd — krótkoterminowa korekta w długim trendzie wzrostowym jest
 * normalna. Ale jeśli ktoś patrzy tylko na jedną kartę, łatwo tego nie zauważyć
 * i wejść w pozycję pod prąd nadrzędnego kierunku.
 */
function RozjazdHoryzontow() {
  const analizy = uzyjSygnalow((s) => s.analizy)
  const aktywne = uzyjSygnalow((s) => s.aktywne)

  const wynikDla = (h: 'krotki' | 'dlugi') => {
    const sygnal = aktywnyDlaHoryzontu(aktywne, h)
    if (sygnal) return sygnal.wynik
    const a = analizy[h]
    return a ? a.wynik : null
  }

  const krotki = wynikDla('krotki')
  const dlugi = wynikDla('dlugi')

  // Reagujemy dopiero przy wyraźnym rozjeździe – drobne wahania to szum.
  const PROG = 15
  if (krotki === null || dlugi === null) return null
  if (Math.abs(krotki) < PROG || Math.abs(dlugi) < PROG) return null
  if (Math.sign(krotki) === Math.sign(dlugi)) return null

  const krotkiWGore = krotki > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="karta mb-5 flex items-start gap-3 p-3.5"
      style={{ borderColor: 'rgba(247,147,26,0.3)' }}
    >
      <IkonaOstrzezenie rozmiar={17} klasa="mt-0.5 shrink-0 text-[#F7931A]" />
      <div>
        <p className="mb-0.5 text-[12.5px] font-semibold" style={{ color: '#F7931A' }}>
          Horyzonty wskazują w przeciwne strony
        </p>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
          Krótki termin ciągnie {krotkiWGore ? 'w górę' : 'w dół'} ({krotki > 0 ? '+' : ''}
          {krotki.toFixed(0)}), długi {krotkiWGore ? 'w dół' : 'w górę'} ({dlugi > 0 ? '+' : ''}
          {dlugi.toFixed(0)}). Zwykle znaczy to korektę wewnątrz nadrzędnego trendu — pozycja
          zgodna z krótkim terminem idzie wtedy pod prąd i warto ją trzymać krócej.
        </p>
      </div>
    </motion.div>
  )
}
