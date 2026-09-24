/**
 * Generator sygnału: wybierasz, na ile dni (od 2 do 90), naciskasz
 * „Wygeneruj sygnał” – silnik dociąga świeże dane, liczy wszystko od nowa
 * pod ten horyzont i mówi: LONG czy SHORT, z wejściem, stopem i celami.
 *
 * Obok wyniku stoi uczciwa historia: jak taki sygnał wypadał w backteście,
 * z przedziałem ufności i ostrzeżeniem, gdy próba jest za mała.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HISTORIA_GENERATORA,
  historiaDlaDni,
  ocenaPrzewagi,
  odsetekNiewypelnionych,
  wielkoscProby,
  type WynikWariantu,
} from '@/analiza/historiaGeneratora'
import {
  MAX_DNI,
  MIN_DNI,
  opisDni,
  opisDniDopelniacz,
  polozenieHoryzontu,
  profilDlaDni,
} from '@/analiza/profile'
import { czySygnal } from '@/analiza/typy'
import { liczba, odmiana } from '@/lib/format'
import { drgnij } from '@/lib/powiadomienia'
import { ETAPY_GENERATORA, uzyjGeneratora } from '@/stan/generator'
import { uzyjRynku } from '@/stan/rynek'
import { aktywnyZGeneratora, uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { IkonaIskra, IkonaOstrzezenie, IkonaSuwak } from './Ikony'
import { KartaAktywnegoSygnalu, KartaAnalizy, KOLOR_GENERATORA } from './KartaSygnalu'

const SPREZYNA = { type: 'spring' as const, stiffness: 300, damping: 26 }

/** Suwak ma 1000 kroków na skali logarytmicznej – dni blisko siebie przy krótkich horyzontach. */
const KROKI = 1000

const SZYBKI_WYBOR: { dni: number; etykieta: string }[] = [
  { dni: 2, etykieta: '2 dni' },
  { dni: 3, etykieta: '3 dni' },
  { dni: 7, etykieta: 'Tydzień' },
  { dni: 14, etykieta: '2 tyg.' },
  { dni: 30, etykieta: 'Miesiąc' },
  { dni: 60, etykieta: '2 mies.' },
  { dni: 90, etykieta: '3 mies.' },
]

function dniZSuwaka(wartosc: number): number {
  const t = wartosc / KROKI
  return Math.round(MIN_DNI * Math.pow(MAX_DNI / MIN_DNI, t))
}

/** „4R” zamiast „4,0R”, „1,3R” bez zmian – krócej, a nic nie ginie. */
function liczbaR(r: number): string {
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')
}

function zR(x: number): string {
  return `${x > 0 ? '+' : ''}${x.toFixed(2).replace('.', ',')}R`
}

function dataKonca(dni: number): string {
  return new Date(Date.now() + dni * 86_400_000).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
  })
}

export function PanelGeneratora() {
  const dni = uzyjUstawien((s) => s.dniGeneratora)
  const ustaw = uzyjUstawien((s) => s.ustaw)
  const cena = uzyjRynku((s) => s.cena)
  const { etap, wynik, wynikDni, czasWyniku, nieaktualne, blad, generuj } = uzyjGeneratora()
  const aktywne = uzyjSygnalow((s) => s.aktywne)
  const sledz = uzyjSygnalow((s) => s.sledz)
  const zakonczSledzenie = uzyjSygnalow((s) => s.zakonczSledzenie)
  const [rozwiniety, ustawRozwiniety] = useState(false)
  const [rozwinietySledzony, ustawRozwinietySledzony] = useState(false)

  const profil = useMemo(() => profilDlaDni(dni), [dni])
  const sledzony = aktywnyZGeneratora(aktywne)
  const trwa = etap !== null
  const wynikSledzony = wynik && czySygnal(wynik) && sledzony?.id === wynik.id

  const zmienDni = (nowe: number) => {
    const d = Math.min(MAX_DNI, Math.max(MIN_DNI, Math.round(nowe)))
    if (d === dni) return
    ustaw('dniGeneratora', d)
    void drgnij('lekko')
  }

  const wypelnienie = `${(polozenieHoryzontu(dni) * 100).toFixed(1)}%`

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- wybór dni */}
      <div className="karta relative overflow-hidden p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-24 h-52 w-52 rounded-full"
          style={{ background: KOLOR_GENERATORA, opacity: 0.12, filter: 'blur(50px)' }}
        />

        <div className="mb-1 flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-xl"
            style={{ background: 'rgba(34,195,230,0.14)', color: KOLOR_GENERATORA }}
          >
            <IkonaSuwak rozmiar={15} />
          </span>
          <span className="etykieta">Na ile dni sygnał?</span>
        </div>

        <div className="mb-1 flex items-end gap-2" data-dni-generatora={dni}>
          <AnimatePresence mode="popLayout" initial={false}>
            {/*
              Krótka animacja zamiast sprężyny: stara liczba ma zniknąć szybko,
              bez długiego ogona, w którym dwie liczby nakładają się na siebie.
            */}
            <motion.span
              key={dni}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="cyfry text-[52px] font-bold leading-none"
            >
              {dni}
            </motion.span>
          </AnimatePresence>
          <span className="naglowek mb-1.5 text-xl font-semibold" style={{ color: 'var(--tekst-2)' }}>
            {odmiana(dni, 'dzień', 'dni', 'dni')}
          </span>
        </div>
        <p className="mb-4 text-[12px]" style={{ color: 'var(--tekst-2)' }}>
          {opisDni(dni) !== `${dni} dni` && <span className="font-semibold">{opisDni(dni)} · </span>}
          sygnał ważny do {dataKonca(dni)}
        </p>

        <input
          type="range"
          min={0}
          max={KROKI}
          step={1}
          value={Math.round(polozenieHoryzontu(dni) * KROKI)}
          onChange={(e) => zmienDni(dniZSuwaka(Number(e.target.value)))}
          disabled={trwa}
          aria-label="Horyzont sygnału w dniach"
          aria-valuetext={opisDni(dni)}
          className="suwak-dni"
          style={{ '--wypelnienie': wypelnienie } as CSSProperties}
        />
        <div className="relative mb-3 mt-0.5 h-4 text-[10px]" style={{ color: 'var(--tekst-3)' }}>
          {[2, 7, 30, 90].map((d) => (
            <span
              key={d}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `calc(13px + (100% - 26px) * ${polozenieHoryzontu(d)})` }}
            >
              {d === 2 ? '2 dni' : d === 7 ? 'tydzień' : d === 30 ? 'miesiąc' : '3 mies.'}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SZYBKI_WYBOR.map((o) => {
            const wybrany = o.dni === dni
            return (
              <button
                key={o.dni}
                onClick={() => zmienDni(o.dni)}
                disabled={trwa}
                className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors active:scale-95"
                style={{
                  background: wybrany ? KOLOR_GENERATORA : 'rgba(255,255,255,0.06)',
                  color: wybrany ? '#041016' : 'var(--tekst-2)',
                }}
              >
                {o.etykieta}
              </button>
            )
          })}
        </div>

        {/* Co zmienia wybrana liczba dni – żeby było widać, że to inny sygnał, nie ten sam z inną etykietą. */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { e: 'Interwały', w: profil.interwaly.map((i) => i.interwal).join(' · ') },
            { e: 'Stop loss', w: `${liczba(profil.mnoznikSL)}× ATR ${profil.interwalBazowy}` },
            { e: 'Cele', w: profil.celeR.map((r) => `${liczbaR(r)}R`).join(' · ') },
            { e: 'Maks. dźwignia', w: `${profil.maksDzwignia}×` },
          ].map((x) => (
            <div key={x.e} className="rounded-xl bg-black/25 px-2.5 py-2">
              <p className="etykieta mb-0.5 text-[9.5px]">{x.e}</p>
              <p className="cyfry text-[12px] font-semibold leading-tight">{x.w}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------- przycisk */}
      <div>
        <motion.button
          onClick={() => void generuj(dni)}
          disabled={trwa}
          whileTap={{ scale: 0.97 }}
          transition={SPREZYNA}
          data-generuj
          className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-[15px] font-bold disabled:cursor-wait"
          style={{
            background: 'linear-gradient(135deg, #22C3E6 0%, #7C5CFF 100%)',
            color: '#FFFFFF',
            boxShadow: '0 12px 36px -14px rgba(34,195,230,0.9)',
          }}
        >
          {trwa && (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/3"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
              }}
              initial={{ left: '-35%' }}
              animate={{ left: '105%' }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <IkonaIskra rozmiar={19} />
          <span className="naglowek relative">
            {trwa ? 'Analizuję…' : `Wygeneruj sygnał na ${opisDni(dni)}`}
          </span>
        </motion.button>

        <AnimatePresence>
          {trwa && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-1.5 overflow-hidden px-1"
              data-etapy-generatora
            >
              {ETAPY_GENERATORA.map((e, i) => {
                const biezacy = ETAPY_GENERATORA.findIndex((x) => x.id === etap)
                const stan = i < biezacy ? 'gotowe' : i === biezacy ? 'trwa' : 'czeka'
                return (
                  <li key={e.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="flex h-4 w-4 items-center justify-center">
                      {stan === 'gotowe' && (
                        <motion.svg
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={SPREZYNA}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--zielen)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </motion.svg>
                      )}
                      {stan === 'trwa' && (
                        <motion.span
                          className="block h-3.5 w-3.5 rounded-full border-2 border-t-transparent"
                          style={{ borderColor: KOLOR_GENERATORA, borderTopColor: 'transparent' }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                        />
                      )}
                      {stan === 'czeka' && <span className="block h-1.5 w-1.5 rounded-full bg-white/20" />}
                    </span>
                    <span
                      style={{
                        color: stan === 'czeka' ? 'var(--tekst-3)' : stan === 'trwa' ? 'var(--tekst)' : 'var(--tekst-2)',
                      }}
                    >
                      {e.id === 'swiece'
                        ? `${e.opis}: ${profil.interwaly.map((x) => x.interwal).join(', ')}`
                        : e.opis}
                    </span>
                  </li>
                )
              })}
            </motion.ul>
          )}
        </AnimatePresence>

        {blad && !trwa && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#FF3B5C]/10 p-3">
            <IkonaOstrzezenie rozmiar={15} klasa="mt-0.5 shrink-0 text-[#FF3B5C]" />
            <p className="text-[12px] leading-snug" style={{ color: 'var(--tekst-2)' }}>
              {blad}
            </p>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- wynik */}
      {wynik && wynikDni !== null && (
        <motion.div
          key={czasWyniku ?? 0}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPREZYNA}
          data-wynik-generatora={czySygnal(wynik) ? wynik.kierunek : 'czekaj'}
        >
          <p className="etykieta mb-2 px-1">Wynik · {opisDni(wynikDni)}</p>

          {wynikDni !== dni && (
            <p className="mb-2 px-1 text-[11.5px]" style={{ color: 'var(--zloto)' }}>
              Ten wynik jest dla {opisDniDopelniacz(wynikDni)}. Naciśnij przycisk, żeby policzyć
              dla {opisDniDopelniacz(dni)}.
            </p>
          )}
          {nieaktualne.length > 0 && (
            <p className="mb-2 px-1 text-[11.5px]" style={{ color: 'var(--zloto)' }}>
              Nie udało się odświeżyć {nieaktualne.join(', ')} – analiza poszła na ostatnio
              zapisanych świecach.
            </p>
          )}

          <KartaAnalizy
            analiza={wynik}
            cenaBiezaca={cena}
            rozwinieta={rozwiniety}
            naKlik={() => ustawRozwiniety((r) => !r)}
            dniGeneratora={wynikDni}
          />

          {czySygnal(wynik) && (
            <div className="mt-3">
              <button
                onClick={() => void sledz(wynik)}
                disabled={Boolean(wynikSledzony)}
                data-sledz
                className="w-full rounded-xl py-3 text-[13px] font-bold active:scale-[0.98] disabled:opacity-80"
                style={{
                  background: wynikSledzony ? 'rgba(0,226,138,0.14)' : 'rgba(34,195,230,0.14)',
                  color: wynikSledzony ? 'var(--zielen)' : KOLOR_GENERATORA,
                }}
              >
                {wynikSledzony
                  ? '✓ Śledzony – powiadomię o TP i SL'
                  : sledzony
                    ? 'Śledź ten zamiast obecnego'
                    : 'Śledź ten sygnał – powiadomię o TP i SL'}
              </button>
              {!wynikSledzony && sledzony && (
                <p className="mt-1.5 px-1 text-[10.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
                  Śledzony jest jeden sygnał z generatora naraz. Obecny (
                  {sledzony.kierunek.toUpperCase()} · {opisDni(sledzony.dniHoryzontu!)}) zostanie
                  zamknięty po bieżącej cenie i trafi do historii.
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ---------------------------------------------------------- historia */}
      <HistoriaHoryzontu dni={dni} />

      {/* ---------------------------------------------------------- śledzony */}
      {sledzony && !wynikSledzony && (
        <div>
          <p className="etykieta mb-2 px-1">Śledzony sygnał z generatora</p>
          <KartaAktywnegoSygnalu
            sygnal={sledzony}
            cenaBiezaca={cena}
            rozwinieta={rozwinietySledzony}
            naKlik={() => ustawRozwinietySledzony((r) => !r)}
          />
          <button
            onClick={() => void zakonczSledzenie(sledzony.id)}
            className="mt-2 w-full rounded-xl bg-white/5 py-2.5 text-[12.5px] font-semibold active:scale-[0.98]"
            style={{ color: 'var(--tekst-2)' }}
          >
            Zakończ śledzenie (zamknięcie po bieżącej cenie)
          </button>
        </div>
      )}
      {sledzony && wynikSledzony && (
        <button
          onClick={() => void zakonczSledzenie(sledzony.id)}
          className="w-full rounded-xl bg-white/5 py-2.5 text-[12.5px] font-semibold active:scale-[0.98]"
          style={{ color: 'var(--tekst-2)' }}
        >
          Zakończ śledzenie (zamknięcie po bieżącej cenie)
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ historia

const OCENY = {
  potwierdzona: { tekst: 'Przewaga ponad przypadek', kolor: 'var(--zielen)', tlo: 'rgba(0,226,138,0.12)' },
  niepewna: { tekst: 'Na plusie, ale w granicach przypadku', kolor: '#F7931A', tlo: 'rgba(247,147,26,0.12)' },
  brak: { tekst: 'Bez przewagi', kolor: 'var(--czerwien)', tlo: 'rgba(255,59,92,0.12)' },
} as const

function HistoriaHoryzontu({ dni }: { dni: number }) {
  const wpis = historiaDlaDni(dni)
  if (!wpis) return null
  const w = wpis.naZadanie
  const ocena = OCENY[ocenaPrzewagi(w)]
  const proba = wielkoscProby(w.transakcji)
  const { okno } = HISTORIA_GENERATORA
  const lata = (Date.parse(okno.do) - Date.parse(okno.od)) / (365 * 86_400_000)

  return (
    <div className="karta p-4" data-historia-generatora={wpis.dni}>
      <p className="naglowek mb-1.5 text-[15px] font-semibold">Jak to wypadało w przeszłości</p>
      <span
        className="mb-2 inline-block rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
        style={{ background: ocena.tlo, color: ocena.kolor }}
      >
        {ocena.tekst}
      </span>
      <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
        Test na danych {formatujDate(okno.od)} – {formatujDate(okno.do)}: przycisk naciskany za każdym
        razem, gdy nie było otwartej pozycji
        {wpis.dni !== dni ? ` · najbliższy policzony horyzont: ${opisDni(wpis.dni)}` : ''}.
      </p>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { e: 'Trafność', w: `${w.skutecznosc.toFixed(0)}%` },
          { e: 'Średnio', w: zR(w.sredniR), k: w.sredniR > 0 ? 'var(--zielen)' : 'var(--czerwien)' },
          { e: 'Transakcji', w: String(w.transakcji) },
        ].map((x) => (
          <div key={x.e} className="rounded-xl bg-white/4 px-1 py-2 text-center">
            <p className="etykieta mb-0.5 text-[9.5px] tracking-[0.08em]">{x.e}</p>
            <p className="cyfry text-[14px] font-bold" style={{ color: x.k }}>
              {x.w}
            </p>
          </div>
        ))}
      </div>

      {w.przedzialR && <PrzedzialUfnosci przedzial={w.przedzialR} srednia={w.sredniR} />}

      <div className="mt-3 space-y-1.5">
        {proba !== 'duza' && (
          <p className="flex gap-2 text-[11.5px] leading-snug" style={{ color: proba === 'mala' ? '#F7931A' : 'var(--tekst-2)' }}>
            <IkonaOstrzezenie rozmiar={13} klasa="mt-0.5 shrink-0" />
            <span>
              {proba === 'mala'
                ? `Tylko ${w.transakcji} ${odmiana(w.transakcji, 'transakcja', 'transakcje', 'transakcji')} w ciągu ${Math.round(lata) === 1 ? 'roku' : `${Math.round(lata)} lat`} – za mało, żeby odróżnić przewagę od szczęścia.`
                : `${w.transakcji} transakcji – wynik orientacyjny, jeszcze nie przesądzający.`}
            </span>
          </p>
        )}
        {w.niewypelnione > 0 && (
          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--tekst-2)' }}>
            W {odsetekNiewypelnionych(w).toFixed(0)}% przypadków cena nie doszła do poziomu wejścia
            przed końcem ważności – transakcji wtedy nie było.
          </p>
        )}
        <PorownanieZProgami zProgami={wpis.zProgami} naZadanie={w} />
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
        Bez prowizji, fundingu i poślizgu. Stop sprawdzany przed celem w obrębie świecy. Wynik
        z przeszłości nie gwarantuje przyszłych.
      </p>
    </div>
  )
}

function PorownanieZProgami({ zProgami, naZadanie }: { zProgami: WynikWariantu; naZadanie: WynikWariantu }) {
  if (zProgami.transakcji === 0) return null
  const lepiej = zProgami.sredniR > naZadanie.sredniR
  return (
    <p className="text-[11.5px] leading-snug" style={{ color: 'var(--tekst-2)' }}>
      Gdy silnik sam widział przewagę (sygnał przeszedł progi):{' '}
      <span className="cyfry font-semibold" style={{ color: lepiej ? 'var(--zielen)' : 'var(--tekst)' }}>
        {zProgami.skutecznosc.toFixed(0)}% trafień, średnio {zR(zProgami.sredniR)}
      </span>{' '}
      z {zProgami.transakcji} transakcji.
      {lepiej ? ' Czekanie na taki moment zwykle się opłacało.' : ''}
    </p>
  )
}

/** Pasek przedziału ufności średniego wyniku z zaznaczonym zerem. */
function PrzedzialUfnosci({ przedzial, srednia }: { przedzial: [number, number]; srednia: number }) {
  const [od, doo] = przedzial
  // Oś symetryczna wokół zera, żeby od razu było widać, czy przedział je obejmuje.
  const zasieg = Math.max(0.5, Math.abs(od), Math.abs(doo)) * 1.15
  const naProc = (x: number) => ((x + zasieg) / (2 * zasieg)) * 100
  const nadZerem = od > 0
  const kolor = nadZerem ? 'var(--zielen)' : srednia > 0 ? '#F7931A' : 'var(--czerwien)'

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px]" style={{ color: 'var(--tekst-2)' }}>
          Średni wynik – 95% przedział
        </span>
        <span className="cyfry text-[11px] font-semibold" style={{ color: kolor }}>
          {zR(od)} … {zR(doo)}
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-white/6">
        <motion.div
          className="absolute top-0 h-full rounded-full"
          style={{ background: kolor, opacity: 0.55 }}
          initial={{ left: '50%', width: 0 }}
          animate={{ left: `${naProc(od)}%`, width: `${naProc(doo) - naProc(od)}%` }}
          transition={SPREZYNA}
        />
        <motion.div
          className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full"
          style={{ background: kolor }}
          initial={{ left: '50%' }}
          animate={{ left: `calc(${naProc(srednia)}% - 2px)` }}
          transition={SPREZYNA}
        />
        <div className="absolute -top-0.5 left-1/2 h-3.5 w-px bg-white/45" />
      </div>
      <div className="mt-0.5 flex justify-center text-[9.5px]" style={{ color: 'var(--tekst-3)' }}>
        0R
      </div>
    </div>
  )
}

function formatujDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
}
