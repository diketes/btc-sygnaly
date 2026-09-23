/**
 * Karta sygnału – wszystko, co trader musi wiedzieć, zanim wejdzie w pozycję.
 * Wariant „czekaj” tłumaczy, czego brakuje, zamiast udawać, że sygnał jest.
 */

import { motion } from 'framer-motion'
import { biezacyWynikR, postepDoCelu } from '@/analiza/cykl'
import { PROFILE } from '@/analiza/profile'
import { czySygnal, type Czekaj, type Sygnal, type WynikAnalizy } from '@/analiza/typy'
import { cena as fCena, liczba, procent, temu, za } from '@/lib/format'
import {
  IkonaBlyskawica,
  IkonaCel,
  IkonaGora,
  IkonaOstrzezenie,
  IkonaStrzalkaDol,
  IkonaStrzalkaGora,
  IkonaTarcza,
  IkonaZegar,
} from './Ikony'

const SPREZYNA = { type: 'spring' as const, stiffness: 240, damping: 28 }

function Naglowek({ horyzont }: { horyzont: 'krotki' | 'dlugi' }) {
  const p = PROFILE[horyzont]
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `${p.kolorAkcentu}1f`, color: p.kolorAkcentu }}
    >
      {horyzont === 'krotki' ? <IkonaBlyskawica rozmiar={12} /> : <IkonaGora rozmiar={12} />}
      {p.nazwa}
    </span>
  )
}

function Wiersz({
  etykieta,
  wartosc,
  kolor,
  dodatek,
}: {
  etykieta: string
  wartosc: string
  kolor?: string
  dodatek?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13px]" style={{ color: 'var(--tekst-2)' }}>
        {etykieta}
      </span>
      <span className="flex items-baseline gap-1.5 text-right">
        <span className="cyfry text-[15px] font-semibold" style={{ color: kolor ?? 'var(--tekst)' }}>
          {wartosc}
        </span>
        {dodatek && (
          <span className="cyfry text-[11px]" style={{ color: 'var(--tekst-3)' }}>
            {dodatek}
          </span>
        )}
      </span>
    </div>
  )
}

function PasekPewnosci({ wartosc, kolor }: { wartosc: number; kolor: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <motion.div
        className="h-full rounded-full"
        style={{ background: kolor }}
        initial={{ width: 0 }}
        animate={{ width: `${wartosc}%` }}
        transition={{ ...SPREZYNA, delay: 0.1 }}
      />
    </div>
  )
}

// ------------------------------------------------------------------ czekaj

/** Mini-wykres wskazania silnika w czasie – widać, czy rynek dojrzewa do sygnału. */
function WykresWskazania({ punkty, prog }: { punkty: { czas: number; wynik: number }[]; prog: number }) {
  if (punkty.length < 3) return null

  const szer = 300
  const wys = 44
  // Skala symetryczna względem zera, minimum tak duże, żeby próg był widoczny.
  const maks = Math.max(prog * 1.2, ...punkty.map((p) => Math.abs(p.wynik)), 10)
  const naY = (w: number) => wys / 2 - (w / maks) * (wys / 2 - 2)
  const naX = (i: number) => (i / (punkty.length - 1)) * szer

  const sciezka = punkty.map((p, i) => `${i === 0 ? 'M' : 'L'}${naX(i).toFixed(1)},${naY(p.wynik).toFixed(1)}`).join(' ')
  const ostatni = punkty[punkty.length - 1].wynik

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="etykieta">Wskazanie w czasie</span>
        <span className="text-[10px]" style={{ color: 'var(--tekst-3)' }}>
          ostatnie {punkty.length} odczytów
        </span>
      </div>
      <svg viewBox={`0 0 ${szer} ${wys}`} className="w-full" preserveAspectRatio="none" aria-hidden>
        {/* Progi wystawienia sygnału – w górę i w dół. */}
        <line x1="0" y1={naY(prog)} x2={szer} y2={naY(prog)} stroke="rgba(0,226,138,0.3)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="0" y1={naY(-prog)} x2={szer} y2={naY(-prog)} stroke="rgba(255,59,92,0.3)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="0" y1={naY(0)} x2={szer} y2={naY(0)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <path
          d={sciezka}
          fill="none"
          stroke={ostatni >= 0 ? 'var(--zielen)' : 'var(--czerwien)'}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

interface PropsCzekaj {
  analiza: Czekaj
  /** Historia wskazań do mini-wykresu. */
  wskazania?: { czas: number; wynik: number }[]
  /** Wywoływane po naciśnięciu „Daj sygnał”. */
  naDajSygnal?: () => void
  liczySygnal?: boolean
}

function KartaCzekaj({ analiza, wskazania, naDajSygnal, liczySygnal }: PropsCzekaj) {
  const { postep } = analiza
  const kolorSklonnosci =
    postep.sklonnosc === 'long'
      ? 'var(--zielen)'
      : postep.sklonnosc === 'short'
        ? 'var(--czerwien)'
        : 'var(--tekst-2)'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPREZYNA}
      className="karta p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <Naglowek horyzont={analiza.horyzont} />
        <span className="etykieta">Brak sygnału</span>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/6">
          <IkonaZegar rozmiar={20} klasa="text-white/45" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="naglowek text-lg font-semibold">Czekaj</p>
          <p className="text-[12px]" style={{ color: 'var(--tekst-2)' }}>
            {postep.sklonnosc
              ? `Rynek lekko przechyla się w stronę ${postep.sklonnosc === 'long' ? 'wzrostów' : 'spadków'}`
              : 'Rynek nie daje przewagi żadnej ze stron'}
          </p>
        </div>
      </div>

      {/* Ile brakuje do sygnału – czekanie przestaje być martwym ekranem. */}
      <div className="mb-3 space-y-2 rounded-2xl bg-black/25 p-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11.5px]" style={{ color: 'var(--tekst-2)' }}>
              Siła wskazania
            </span>
            <span className="cyfry text-[11.5px] font-semibold" style={{ color: kolorSklonnosci }}>
              {Math.abs(analiza.wynik).toFixed(0)} / {postep.progWyniku}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full"
              style={{ background: kolorSklonnosci }}
              initial={{ width: 0 }}
              animate={{ width: `${postep.wynikUdzial * 100}%` }}
              transition={SPREZYNA}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11.5px]" style={{ color: 'var(--tekst-2)' }}>
              Zgodność interwałów
            </span>
            <span className="cyfry text-[11.5px] font-semibold">
              {analiza.zgodnosc} / {postep.wymaganaZgodnosc}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full bg-white/50"
              initial={{ width: 0 }}
              animate={{ width: `${postep.zgodnoscUdzial * 100}%` }}
              transition={SPREZYNA}
            />
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {analiza.powody.map((p, i) => (
          <li key={i} className="flex gap-2 text-[12.5px]" style={{ color: 'var(--tekst-2)' }}>
            <span style={{ color: 'var(--tekst-3)' }}>•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {wskazania && <WykresWskazania punkty={wskazania} prog={postep.progWyniku} />}

      {naDajSygnal && (
        <div className="mt-3 border-t border-white/6 pt-3">
          <button
            onClick={naDajSygnal}
            disabled={liczySygnal}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'rgba(247,147,26,0.16)', color: 'var(--zloto)' }}
          >
            {liczySygnal ? 'Liczę…' : 'Daj sygnał mimo to'}
          </button>
          <p className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
            Pokaże, w którą stronę silnik przechyla się w tej chwili, z pełnymi poziomami.
            Taki sygnał nie przeszedł progów, więc jest słabszy — i liczy się w statystykach osobno.
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ------------------------------------------------------------------ sygnał

interface PropsSygnalu {
  sygnal: Sygnal
  cenaBiezaca: number | null
  /** Rozwinięta karta pokazuje pełne uzasadnienie i składniki. */
  rozwinieta?: boolean
  naKlik?: () => void
}

export function KartaAktywnegoSygnalu({
  sygnal,
  cenaBiezaca,
  rozwinieta = false,
  naKlik,
}: PropsSygnalu) {
  const long = sygnal.kierunek === 'long'
  const kolor = long ? 'var(--zielen)' : 'var(--czerwien)'
  const cenaDoLiczenia = cenaBiezaca ?? sygnal.cenaOdniesienia
  const biezaceR = biezacyWynikR(sygnal, cenaDoLiczenia)
  const postep = postepDoCelu(sygnal, cenaDoLiczenia)
  const zamkniety = sygnal.status === 'zamkniety_zysk' || sygnal.status === 'zamkniety_strata' || sygnal.status === 'wygasly'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPREZYNA}
      onClick={naKlik}
      className="karta relative overflow-hidden p-4"
      style={{ boxShadow: `0 10px 40px -20px ${kolor}` }}
    >
      {/* Poświata kierunku */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full"
        style={{ background: kolor, opacity: 0.1, filter: 'blur(40px)' }}
      />

      <div className="mb-3 flex items-start justify-between gap-2">
        <Naglowek horyzont={sygnal.horyzont} />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {sygnal.naZadanie && (
            <span className="rounded-full bg-[#F7931A]/15 px-2 py-1 text-[10px] font-semibold text-[#F7931A]">
              NA ŻĄDANIE
            </span>
          )}
          {sygnal.podwyzszoneRyzyko && (
            <span className="flex items-center gap-1 rounded-full bg-[#F7931A]/15 px-2 py-1 text-[10px] font-semibold text-[#F7931A]">
              <IkonaOstrzezenie rozmiar={11} />
              PODWYŻSZONE RYZYKO
            </span>
          )}
          <span className="etykieta">{temu(sygnal.utworzony)}</span>
        </div>
      </div>

      {/* Sygnał wymuszony musi jasno mówić, czego mu zabrakło. */}
      {sygnal.naZadanie && sygnal.brakiDoStandardu.length > 0 && (
        <div className="mb-3 rounded-2xl bg-[#F7931A]/8 p-3">
          <p className="mb-1 text-[11.5px] font-semibold" style={{ color: 'var(--zloto)' }}>
            Ten sygnał nie powstałby sam
          </p>
          <ul className="space-y-0.5">
            {sygnal.brakiDoStandardu.map((b, i) => (
              <li key={i} className="text-[11.5px] leading-snug" style={{ color: 'var(--tekst-2)' }}>
                • {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Kierunek + pewność */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${kolor}1f`, color: kolor }}
        >
          {long ? <IkonaStrzalkaGora rozmiar={24} /> : <IkonaStrzalkaDol rozmiar={24} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="naglowek text-2xl font-bold" style={{ color: kolor }}>
              {long ? 'LONG' : 'SHORT'}
            </span>
            <span className="cyfry text-sm" style={{ color: 'var(--tekst-3)' }}>
              {PROFILE[sygnal.horyzont].opisDlugosci}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <PasekPewnosci wartosc={sygnal.pewnosc} kolor={kolor} />
            <span className="cyfry shrink-0 text-[12px] font-semibold" style={{ color: kolor }}>
              {sygnal.pewnosc}%
            </span>
          </div>
        </div>
      </div>

      {/* Poziomy */}
      <div className="rounded-2xl bg-black/25 p-3">
        <Wiersz
          etykieta="Wejście"
          wartosc={`${fCena(sygnal.wejscie)} USDT`}
          dodatek={sygnal.typWejscia.startsWith('limit') ? 'limit' : 'rynek'}
        />
        <Wiersz
          etykieta="Stop loss"
          wartosc={`${fCena(sygnal.stopLoss)} USDT`}
          kolor="var(--czerwien)"
          dodatek={`−${sygnal.odlegloscSlProc.toFixed(2).replace('.', ',')}%`}
        />
        {sygnal.cele.map((c) => (
          <Wiersz
            key={c.poziom}
            etykieta={`Cel TP${c.poziom}${c.osiagniety ? ' ✓' : ''}`}
            wartosc={`${fCena(c.cena)} USDT`}
            kolor={c.osiagniety ? 'var(--zielen)' : undefined}
            dodatek={`${procent(c.procent)} · ${c.r.toFixed(1)}R`}
          />
        ))}
      </div>

      {/* Metryki */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { etykieta: 'Zysk / ryzyko', wartosc: `${sygnal.rr.toFixed(2).replace('.', ',')} : 1`, ikona: <IkonaCel rozmiar={13} /> },
          { etykieta: 'Maks. dźwignia', wartosc: `${sygnal.maksDzwignia}×`, ikona: <IkonaTarcza rozmiar={13} /> },
          {
            etykieta: zamkniety ? 'Wynik' : 'Teraz',
            wartosc: `${biezaceR >= 0 ? '+' : ''}${(zamkniety ? (sygnal.wynikR ?? 0) : biezaceR).toFixed(2).replace('.', ',')}R`,
            ikona: null,
          },
        ].map((m) => (
          <div key={m.etykieta} className="rounded-xl bg-white/4 p-2 text-center">
            <div className="etykieta mb-0.5 flex items-center justify-center gap-1">
              {m.ikona}
              {m.etykieta}
            </div>
            <div className="cyfry text-[14px] font-semibold">{m.wartosc}</div>
          </div>
        ))}
      </div>

      {/* Postęp do celu */}
      {!zamkniety && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="etykieta">Do celu TP{postep.cel}</span>
            <span className="cyfry text-[11px]" style={{ color: 'var(--tekst-2)' }}>
              {postep.postep.toFixed(0)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full"
              style={{ background: kolor }}
              animate={{ width: `${postep.postep}%` }}
              transition={SPREZYNA}
            />
          </div>
        </div>
      )}

      {/* Uzasadnienie */}
      <div className="mt-3 border-t border-white/6 pt-3">
        <p className="etykieta mb-1.5">Dlaczego</p>
        <ul className="space-y-1">
          {(rozwinieta ? sygnal.uzasadnienie : sygnal.uzasadnienie.slice(0, 3)).map((u, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--tekst-2)' }}>
              <span style={{ color: kolor }}>›</span>
              <span>{u}</span>
            </li>
          ))}
        </ul>
        {!rozwinieta && sygnal.uzasadnienie.length > 3 && (
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--tekst-3)' }}>
            +{sygnal.uzasadnienie.length - 3} więcej — dotknij, żeby rozwinąć
          </p>
        )}
      </div>

      {rozwinieta && (
        <>
          <div className="mt-3 rounded-xl bg-[#F7931A]/8 p-2.5">
            <p className="text-[12px] leading-snug" style={{ color: '#F7931A' }}>
              {sygnal.uniewaznienie.opis}
            </p>
          </div>

          <div className="mt-3">
            <p className="etykieta mb-1.5">Ocena interwałów</p>
            <div className="space-y-1.5">
              {sygnal.oceny.map((o) => (
                <div key={o.interwal} className="flex items-center gap-2">
                  <span className="cyfry w-10 shrink-0 text-[11px]" style={{ color: 'var(--tekst-2)' }}>
                    {o.interwal}
                  </span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        background: o.wynik >= 0 ? 'var(--zielen)' : 'var(--czerwien)',
                        left: o.wynik >= 0 ? '50%' : `${50 + o.wynik / 2}%`,
                        width: `${Math.abs(o.wynik) / 2}%`,
                      }}
                    />
                    <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                  </div>
                  <span className="cyfry w-9 shrink-0 text-right text-[11px]" style={{ color: 'var(--tekst-2)' }}>
                    {o.wynik > 0 ? '+' : ''}
                    {o.wynik.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {sygnal.modyfikatory.length > 0 && (
            <div className="mt-3">
              <p className="etykieta mb-1.5">Kontekst rynkowy</p>
              <ul className="space-y-1">
                {sygnal.modyfikatory.map((m, i) => (
                  <li key={i} className="text-[12px] leading-snug" style={{ color: 'var(--tekst-2)' }}>
                    <span className="font-semibold">{m.etykieta}:</span> {m.opis}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!zamkniety && (
        <p className="mt-3 text-[11px]" style={{ color: 'var(--tekst-3)' }}>
          Ważny {za(sygnal.wygasa)} · unieważnienie przy {fCena(sygnal.uniewaznienie.cena)}
        </p>
      )}
    </motion.div>
  )
}

// ------------------------------------------------------------------ rozdzielacz

export function KartaAnalizy({
  analiza,
  cenaBiezaca,
  rozwinieta,
  naKlik,
  wskazania,
  naDajSygnal,
  liczySygnal,
}: {
  analiza: WynikAnalizy
  cenaBiezaca: number | null
  rozwinieta?: boolean
  naKlik?: () => void
  wskazania?: { czas: number; wynik: number }[]
  naDajSygnal?: () => void
  liczySygnal?: boolean
}) {
  if (czySygnal(analiza)) {
    return (
      <KartaAktywnegoSygnalu
        sygnal={analiza}
        cenaBiezaca={cenaBiezaca}
        rozwinieta={rozwinieta}
        naKlik={naKlik}
      />
    )
  }
  return (
    <KartaCzekaj
      analiza={analiza}
      wskazania={wskazania}
      naDajSygnal={naDajSygnal}
      liczySygnal={liczySygnal}
    />
  )
}

/** Kompaktowy wiersz historii. */
export function WierszHistorii({ sygnal }: { sygnal: Sygnal }) {
  const r = sygnal.wynikR ?? 0
  const zysk = r > 0
  const neutralny = Math.abs(r) < 0.02
  const kolor = neutralny ? 'var(--tekst-2)' : zysk ? 'var(--zielen)' : 'var(--czerwien)'
  const opisStatusu: Record<string, string> = {
    zamkniety_zysk: 'Zamknięty z zyskiem',
    zamkniety_strata: 'Stop loss',
    wygasly: 'Wygasł',
    uniewazniony: 'Unieważniony',
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/3 p-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${sygnal.kierunek === 'long' ? 'var(--zielen)' : 'var(--czerwien)'}18`, color: sygnal.kierunek === 'long' ? 'var(--zielen)' : 'var(--czerwien)' }}
      >
        {sygnal.kierunek === 'long' ? <IkonaStrzalkaGora rozmiar={16} /> : <IkonaStrzalkaDol rozmiar={16} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">
          {sygnal.kierunek === 'long' ? 'LONG' : 'SHORT'}{' '}
          <span className="font-normal" style={{ color: 'var(--tekst-3)' }}>
            · {PROFILE[sygnal.horyzont].nazwa.toLowerCase()}
          </span>
        </p>
        <p className="truncate text-[11px]" style={{ color: 'var(--tekst-3)' }}>
          {opisStatusu[sygnal.status] ?? sygnal.status} · wejście {fCena(sygnal.wejscie)} ·{' '}
          {temu(sygnal.utworzony)}
        </p>
      </div>
      <div className="text-right">
        <p className="cyfry text-[14px] font-bold" style={{ color: kolor }}>
          {r >= 0 ? '+' : ''}
          {liczba(r)}R
        </p>
        <p className="cyfry text-[10px]" style={{ color: 'var(--tekst-3)' }}>
          pewność {sygnal.pewnosc}%
        </p>
      </div>
    </div>
  )
}
