import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { horyzontyDlaTrybu, PROFILE } from '@/analiza/profile'
import {
  rozbijWgHoryzontu,
  rozbijWgKierunku,
  rozbijWgPewnosci,
  rozbijWgRezimu,
  type RozbicieStatystyk,
} from '@/analiza/statystyki'
import { liczba, procent } from '@/lib/format'
import { zbudujKontekstRynku } from '@/stan/kontekst'
import { uzyjRynku } from '@/stan/rynek'
import { uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { IkonaSygnaly } from '@/ui/Ikony'
import { KartaAnalizy, WierszHistorii } from '@/ui/KartaSygnalu'
import { Ekran, Kafelek, NaglowekEkranu, PustyStan, Sekcja } from '@/ui/Powloka'
import { PrzelacznikHoryzontu } from '@/ui/PrzelacznikHoryzontu'

type Karta = 'aktywne' | 'historia' | 'statystyki'

export function Sygnaly() {
  const cena = uzyjRynku((s) => s.cena)
  const {
    analizy,
    aktywne,
    historia,
    statystyki,
    statystykiNaZadanie,
    wskazania,
    liczenieNaZadanie,
    dajSygnal,
  } = uzyjSygnalow()
  const trybHoryzontu = uzyjUstawien((s) => s.trybHoryzontu)
  const ustaw = uzyjUstawien((s) => s.ustaw)
  const [karta, ustawKarte] = useState<Karta>('aktywne')
  const [rozwiniety, ustawRozwiniety] = useState<string | null>(null)

  const horyzonty = horyzontyDlaTrybu(trybHoryzontu)

  const rozbicia = useMemo(
    () => ({
      horyzont: rozbijWgHoryzontu(historia),
      kierunek: rozbijWgKierunku(historia),
      pewnosc: rozbijWgPewnosci(historia),
      rezim: rozbijWgRezimu(historia),
    }),
    [historia],
  )

  return (
    <Ekran>
      <NaglowekEkranu
        tytul="Sygnały"
        podtytul={`${aktywne.length} aktywnych · ${historia.length} w historii`}
      />

      <div className="px-4">
        <div className="mb-3 flex gap-1.5">
          {(
            [
              ['aktywne', 'Aktywne'],
              ['historia', 'Historia'],
              ['statystyki', 'Skuteczność'],
            ] as [Karta, string][]
          ).map(([id, etykieta]) => (
            <button
              key={id}
              onClick={() => ustawKarte(id)}
              className="relative flex-1 rounded-xl py-2 text-[12.5px] font-semibold"
              style={{ color: karta === id ? '#050609' : 'var(--tekst-2)' }}
            >
              {karta === id && (
                <motion.span
                  layoutId="pigulka-sygnalow"
                  className="absolute inset-0 -z-10 rounded-xl bg-white"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              {etykieta}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {karta === 'aktywne' && (
            <motion.div
              key="aktywne"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="mb-4">
                <PrzelacznikHoryzontu
                  wartosc={trybHoryzontu}
                  naZmiane={(t) => ustaw('trybHoryzontu', t)}
                  kompaktowy
                />
              </div>

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
                  const id = 'id' in analiza ? analiza.id : h
                  return (
                    <KartaAnalizy
                      key={h}
                      analiza={analiza}
                      cenaBiezaca={cena}
                      rozwinieta={rozwiniety === id}
                      wskazania={wskazania[h]}
                      naDajSygnal={() => void dajSygnal(h, zbudujKontekstRynku())}
                      liczySygnal={liczenieNaZadanie === h}
                      naKlik={() => ustawRozwiniety(rozwiniety === id ? null : id)}
                    />
                  )
                })}
              </div>
            </motion.div>
          )}

          {karta === 'historia' && (
            <motion.div
              key="historia"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.18 }}
            >
              {historia.length === 0 ? (
                <div className="karta">
                  <PustyStan
                    tytul="Historia jest pusta"
                    opis="Tu trafi każdy zamknięty sygnał — także przegrany. Bez tego statystyki skuteczności nic by nie znaczyły."
                    ikona={<IkonaSygnaly rozmiar={30} />}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {historia.map((s) => (
                    <WierszHistorii key={s.id} sygnal={s} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {karta === 'statystyki' && (
            <motion.div
              key="statystyki"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.18 }}
            >
              {statystyki.liczba === 0 && statystykiNaZadanie.liczba === 0 ? (
                <div className="karta">
                  <PustyStan
                    tytul="Za mało danych"
                    opis="Statystyki pojawią się, gdy zamknie się pierwszy sygnał. Liczone są z pełnej historii, bez wybierania najlepszych."
                    ikona={<IkonaSygnaly rozmiar={30} />}
                  />
                </div>
              ) : (
                <>
                  {statystyki.liczba === 0 && (
                    <div className="karta mb-4 p-4">
                      <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
                        Nie ma jeszcze zamkniętych sygnałów wystawionych przez sam silnik — poniżej
                        widać tylko te wymuszone przyciskiem „Daj sygnał”.
                      </p>
                    </div>
                  )}

                  <div className={statystyki.liczba === 0 ? 'hidden' : 'mb-4 grid grid-cols-2 gap-3'}>
                    <Kafelek
                      etykieta="Skuteczność"
                      wartosc={`${statystyki.skutecznosc.toFixed(0)}%`}
                      opis={`${statystyki.wygrane} wygranych / ${statystyki.przegrane} przegranych`}
                      kolor={statystyki.skutecznosc >= 45 ? 'var(--zielen)' : '#F7931A'}
                    />
                    <Kafelek
                      etykieta="Średnie R"
                      wartosc={`${statystyki.sredniR >= 0 ? '+' : ''}${liczba(statystyki.sredniR)}`}
                      opis="na jeden sygnał"
                      kolor={statystyki.sredniR >= 0 ? 'var(--zielen)' : 'var(--czerwien)'}
                    />
                    <Kafelek
                      etykieta="Profit factor"
                      wartosc={
                        Number.isFinite(statystyki.profitFactor)
                          ? liczba(statystyki.profitFactor)
                          : '∞'
                      }
                      opis="zyski ÷ straty"
                      kolor={statystyki.profitFactor >= 1.2 ? 'var(--zielen)' : '#F7931A'}
                    />
                    <Kafelek
                      etykieta="Maks. obsunięcie"
                      wartosc={`${statystyki.najwiekszeObsuniecie.toFixed(1).replace('.', ',')}%`}
                      opis={`najdłuższa seria strat: ${statystyki.najdluzszaSeriaStrat}`}
                      kolor={statystyki.najwiekszeObsuniecie < 20 ? 'var(--zielen)' : 'var(--czerwien)'}
                    />
                  </div>

                  <div className={statystyki.liczba === 0 ? 'hidden' : ''}>
                  <Sekcja tytul="Trafienia celów">
                    <div className="karta space-y-2.5 p-4">
                      {(['tp1', 'tp2', 'tp3'] as const).map((tp, i) => {
                        const ile = statystyki.trafienia[tp]
                        const udzial = (ile / statystyki.liczba) * 100
                        return (
                          <div key={tp}>
                            <div className="mb-1 flex items-baseline justify-between">
                              <span className="text-[12px]" style={{ color: 'var(--tekst-2)' }}>
                                Cel TP{i + 1}
                              </span>
                              <span className="cyfry text-[12px] font-semibold">
                                {udzial.toFixed(0)}% ({ile})
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                              <motion.div
                                className="h-full rounded-full bg-[var(--zielen)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${udzial}%` }}
                                transition={{ type: 'spring', stiffness: 120, damping: 22, delay: i * 0.06 }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Sekcja>

                  <KrzywaKapitalu punkty={statystyki.krzywaKapitalu} />
                  </div>

                  {statystykiNaZadanie.liczba > 0 && (
                    <Sekcja tytul="Sygnały na żądanie – osobno">
                      <div className="karta p-4">
                        <p className="mb-2.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
                          Wymuszone przyciskiem „Daj sygnał”. Nie przeszły progów silnika, więc
                          z założenia wypadają słabiej — dlatego nie są wliczane do skuteczności
                          powyżej.
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            {
                              e: 'Skuteczność',
                              w: `${statystykiNaZadanie.skutecznosc.toFixed(0)}%`,
                              k:
                                statystykiNaZadanie.skutecznosc >= statystyki.skutecznosc
                                  ? 'var(--zielen)'
                                  : 'var(--czerwien)',
                            },
                            {
                              e: 'Średnie R',
                              w: `${statystykiNaZadanie.sredniR >= 0 ? '+' : ''}${liczba(statystykiNaZadanie.sredniR)}`,
                              k: statystykiNaZadanie.sredniR >= 0 ? 'var(--zielen)' : 'var(--czerwien)',
                            },
                            { e: 'Sygnałów', w: String(statystykiNaZadanie.liczba), k: undefined },
                          ].map((x) => (
                            <div key={x.e} className="rounded-xl bg-white/4 p-2 text-center">
                              <p className="etykieta mb-0.5">{x.e}</p>
                              <p className="cyfry text-[14px] font-bold" style={{ color: x.k }}>
                                {x.w}
                              </p>
                            </div>
                          ))}
                        </div>
                        {statystyki.liczba > 0 && (
                          <p className="mt-2.5 text-[11.5px]" style={{ color: 'var(--tekst-2)' }}>
                            Dla porównania zwykłe sygnały: {statystyki.skutecznosc.toFixed(0)}% trafień,
                            średnio {statystyki.sredniR >= 0 ? '+' : ''}
                            {liczba(statystyki.sredniR)}R.
                          </p>
                        )}
                      </div>
                    </Sekcja>
                  )}

                  <Sekcja tytul="W rozbiciu">
                    <div className="space-y-3">
                      <Rozbicie tytul="Horyzont" dane={rozbicia.horyzont} />
                      <Rozbicie tytul="Kierunek" dane={rozbicia.kierunek} />
                      <Rozbicie tytul="Pewność sygnału" dane={rozbicia.pewnosc} />
                      <Rozbicie tytul="Reżim rynku" dane={rozbicia.rezim} />
                    </div>
                  </Sekcja>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mb-4 mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
          To nie jest porada inwestycyjna. Handel BTC z dźwignią wiąże się z ryzykiem utraty całego
          kapitału.
        </p>
      </div>
    </Ekran>
  )
}

function Rozbicie({ tytul, dane }: { tytul: string; dane: RozbicieStatystyk[] }) {
  const zDanymi = dane.filter((d) => d.statystyki.liczba > 0)
  if (zDanymi.length === 0) return null

  return (
    <div className="karta p-3.5">
      <p className="etykieta mb-2">{tytul}</p>
      <div className="space-y-1.5">
        {zDanymi.map((d) => (
          <div key={d.etykieta} className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px]" style={{ color: 'var(--tekst-2)' }}>
              {d.etykieta}
              <span className="ml-1.5 text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
                ({d.statystyki.liczba})
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="cyfry text-[12.5px] font-semibold">
                {d.statystyki.skutecznosc.toFixed(0)}%
              </span>
              <span
                className="cyfry w-14 text-right text-[12px] font-semibold"
                style={{ color: d.statystyki.sredniR >= 0 ? 'var(--zielen)' : 'var(--czerwien)' }}
              >
                {d.statystyki.sredniR >= 0 ? '+' : ''}
                {liczba(d.statystyki.sredniR)}R
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function KrzywaKapitalu({ punkty }: { punkty: { czas: number; wartosc: number }[] }) {
  if (punkty.length < 2) return null

  const wartosci = punkty.map((p) => p.wartosc)
  const min = Math.min(...wartosci)
  const max = Math.max(...wartosci)
  const zakres = max - min || 1
  const szer = 320
  const wys = 96

  const sciezka = punkty
    .map((p, i) => {
      const x = (i / (punkty.length - 1)) * szer
      const y = wys - ((p.wartosc - min) / zakres) * (wys - 8) - 4
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const koncowa = punkty[punkty.length - 1].wartosc
  const zysk = koncowa >= 100
  const kolor = zysk ? 'var(--zielen)' : 'var(--czerwien)'

  return (
    <Sekcja tytul="Krzywa kapitału">
      <div className="karta p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[12px]" style={{ color: 'var(--tekst-2)' }}>
            Start 100 →
          </span>
          <span className="cyfry text-lg font-bold" style={{ color: kolor }}>
            {liczba(koncowa)}
            <span className="ml-1.5 text-[12px]">({procent(koncowa - 100)})</span>
          </span>
        </div>
        <svg viewBox={`0 0 ${szer} ${wys}`} className="w-full" preserveAspectRatio="none" aria-hidden>
          <line x1="0" y1={wys - ((100 - min) / zakres) * (wys - 8) - 4} x2={szer} y2={wys - ((100 - min) / zakres) * (wys - 8) - 4} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 3" />
          <motion.path
            d={sciezka}
            fill="none"
            stroke={kolor}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="mt-2 text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
          Przy stałym ryzyku na sygnał, bez prowizji i poślizgu. Jedna pozycja naraz na horyzont.
        </p>
      </div>
    </Sekcja>
  )
}
