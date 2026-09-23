import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { kwota, liczba, procent, cena as fCena, godzina, odliczanie } from '@/lib/format'
import { podsumujLikwidacje, uzyjRynku } from '@/stan/rynek'
import { uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { usunAlert, wczytajAlerty, zapiszAlert, type Alert } from '@/dane/db'
import { Ekran, Kafelek, NaglowekEkranu, PustyStan, Sekcja } from '@/ui/Powloka'
import { IkonaOstrzezenie, IkonaRynek, IkonaZamknij } from '@/ui/Ikony'
import { drgnij } from '@/lib/powiadomienia'

type Karta = 'rynek' | 'narzedzia'

export function Rynek() {
  const [karta, ustawKarte] = useState<Karta>('rynek')

  return (
    <Ekran naOdswiez={uzyjRynku.getState().odswiezMigawke}>
      <NaglowekEkranu tytul="Rynek" podtytul="Dane terminowe, on-chain i narzędzia" />
      <div className="px-4">
        <div className="mb-3 flex gap-1.5">
          {(
            [
              ['rynek', 'Statystyki'],
              ['narzedzia', 'Narzędzia'],
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
                  layoutId="pigulka-rynku"
                  className="absolute inset-0 -z-10 rounded-xl bg-white"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              {etykieta}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {karta === 'rynek' ? (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Statystyki />
            </motion.div>
          ) : (
            <motion.div key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Narzedzia />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ekran>
  )
}

// ------------------------------------------------------------------ statystyki

function Statystyki() {
  const { migawka, likwidacje, cena } = uzyjRynku()
  const [tik, ustawTik] = useState(0)

  // Odliczanie do fundingu musi tykać co sekundę.
  useEffect(() => {
    const t = setInterval(() => ustawTik((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const lik15 = useMemo(() => podsumujLikwidacje(likwidacje, 15), [likwidacje, tik])
  const lik60 = useMemo(() => podsumujLikwidacje(likwidacje, 60), [likwidacje, tik])

  if (!migawka) {
    return (
      <div className="karta">
        <PustyStan
          tytul="Pobieram dane rynkowe"
          opis="Funding, open interest, pozycjonowanie i dane on-chain."
          ikona={<IkonaRynek rozmiar={30} />}
        />
      </div>
    )
  }

  const f = migawka.funding
  const oi = migawka.oi
  const ls = migawka.longShort

  return (
    <>
      <Sekcja tytul="Rynek terminowy">
        <div className="grid grid-cols-2 gap-3">
          <Kafelek
            etykieta="Funding rate"
            wartosc={f ? `${f.ostatni.toFixed(4).replace('.', ',')}%` : '—'}
            opis={
              f?.nastepny
                ? `rozliczenie za ${odliczanie(f.nastepny)}`
                : 'brak danych o rozliczeniu'
            }
            kolor={
              f ? (f.ostatni > 0.03 ? 'var(--czerwien)' : f.ostatni < -0.01 ? 'var(--zielen)' : undefined) : undefined
            }
          />
          <Kafelek
            etykieta="Open interest"
            wartosc={oi ? `${kwota(oi.biezace)} $` : '—'}
            opis={oi ? `${procent(oi.zmiana24hProc)} / 24h` : undefined}
            kolor={oi ? (oi.zmiana24hProc >= 0 ? 'var(--zielen)' : 'var(--czerwien)') : undefined}
          />
          <Kafelek
            etykieta="Long / Short (konta)"
            wartosc={ls ? liczba(ls.ratio) : '—'}
            opis={ls ? `${ls.procentLong.toFixed(0)}% long · ${ls.procentShort.toFixed(0)}% short` : undefined}
            kolor={ls ? (ls.ratio > 2.5 ? 'var(--czerwien)' : ls.ratio < 0.8 ? 'var(--zielen)' : undefined) : undefined}
          />
          <Kafelek
            etykieta="Taker buy / sell"
            wartosc={migawka.taker ? liczba(migawka.taker.ratio) : '—'}
            opis="agresywne kupno ÷ sprzedaż"
            kolor={
              migawka.taker
                ? migawka.taker.ratio > 1.05
                  ? 'var(--zielen)'
                  : migawka.taker.ratio < 0.95
                    ? 'var(--czerwien)'
                    : undefined
                : undefined
            }
          />
        </div>

        {f && f.historia.length > 3 && (
          <div className="karta mt-3 p-4">
            <p className="etykieta mb-2">Funding – ostatnie rozliczenia</p>
            <div className="flex h-16 items-end gap-1">
              {f.historia.slice(-24).map((h, i) => {
                const maks = Math.max(...f.historia.slice(-24).map((x) => Math.abs(x.wartosc)), 0.01)
                const wys = (Math.abs(h.wartosc) / maks) * 100
                return (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      background: h.wartosc >= 0 ? 'rgba(0,226,138,0.55)' : 'rgba(255,59,92,0.55)',
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(4, wys)}%` }}
                    transition={{ delay: i * 0.012, type: 'spring', stiffness: 200, damping: 22 }}
                  />
                )
              })}
            </div>
            <p className="mt-2 text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
              Dodatni funding = longi płacą shortom. Skrajne wartości często poprzedzają korektę.
            </p>
          </div>
        )}
      </Sekcja>

      <Sekcja tytul="Likwidacje na żywo">
        <div className="grid grid-cols-2 gap-3">
          <Kafelek
            etykieta="Longi · 15 min"
            wartosc={`${kwota(lik15.long)} $`}
            opis={`60 min: ${kwota(lik60.long)} $`}
            kolor="var(--czerwien)"
          />
          <Kafelek
            etykieta="Shorty · 15 min"
            wartosc={`${kwota(lik15.short)} $`}
            opis={`60 min: ${kwota(lik60.short)} $`}
            kolor="var(--zielen)"
          />
        </div>

        {likwidacje.length > 0 ? (
          <div className="karta mt-3 max-h-56 overflow-y-auto p-3">
            {likwidacje
              .slice()
              .reverse()
              .slice(0, 30)
              .map((l, i) => (
                <motion.div
                  key={`${l.czas}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between border-b border-white/4 py-1.5 last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: l.strona === 'long' ? 'var(--czerwien)' : 'var(--zielen)' }}
                    />
                    <span className="text-[11.5px] font-semibold">
                      {l.strona === 'long' ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="cyfry text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
                      {godzina(l.czas)}
                    </span>
                  </span>
                  <span className="cyfry text-[11.5px] font-semibold">
                    {kwota(l.wartosc)} $ <span style={{ color: 'var(--tekst-3)' }}>@ {fCena(l.cena)}</span>
                  </span>
                </motion.div>
              ))}
          </div>
        ) : (
          <div className="karta mt-3 p-4">
            <p className="text-[12px]" style={{ color: 'var(--tekst-3)' }}>
              Brak likwidacji w ostatnich minutach — rynek spokojny. Strumień jest podłączony i czeka.
            </p>
          </div>
        )}
      </Sekcja>

      <Sekcja tytul="Rynek globalny">
        <div className="grid grid-cols-2 gap-3">
          <Kafelek
            etykieta="Dominacja BTC"
            wartosc={migawka.globalny ? `${migawka.globalny.dominacjaBtc.toFixed(2).replace('.', ',')}%` : '—'}
          />
          <Kafelek
            etykieta="Kapitalizacja krypto"
            wartosc={migawka.globalny ? `${kwota(migawka.globalny.kapitalizacjaUsd)} $` : '—'}
            opis={migawka.globalny ? `${procent(migawka.globalny.zmianaKapitalizacji24h)} / 24h` : undefined}
          />
        </div>
      </Sekcja>

      <Sekcja tytul="Sieć Bitcoina">
        <div className="grid grid-cols-2 gap-3">
          <Kafelek
            etykieta="Wysokość bloku"
            wartosc={migawka.onChain ? fCena(migawka.onChain.wysokoscBloku) : '—'}
          />
          <Kafelek
            etykieta="Hashrate"
            wartosc={
              migawka.onChain?.hashrate
                ? `${(migawka.onChain.hashrate / 1e18).toFixed(0)} EH/s`
                : '—'
            }
          />
          <Kafelek
            etykieta="Opłata szybka"
            wartosc={migawka.onChain ? `${migawka.onChain.oplataSzybka} sat/vB` : '—'}
          />
          <Kafelek
            etykieta="Opłata godzinna"
            wartosc={migawka.onChain ? `${migawka.onChain.oplataGodzina} sat/vB` : '—'}
          />
        </div>
      </Sekcja>

      {migawka.bledy.length > 0 && (
        <div className="mb-4 rounded-2xl bg-[#F7931A]/8 p-3">
          <p className="etykieta mb-1" style={{ color: '#F7931A' }}>
            Niedostępne źródła
          </p>
          {migawka.bledy.map((b, i) => (
            <p key={i} className="text-[11px]" style={{ color: 'var(--tekst-3)' }}>
              {b}
            </p>
          ))}
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ narzędzia

function Narzedzia() {
  const cena = uzyjRynku((s) => s.cena)
  const aktywne = uzyjSygnalow((s) => s.aktywne)
  const { kapital, ryzykoProc, ustaw } = uzyjUstawien()

  const [wejscie, ustawWejscie] = useState('')
  const [stop, ustawStop] = useState('')
  const [alerty, ustawAlerty] = useState<Alert[]>([])
  const [nowyAlert, ustawNowyAlert] = useState('')

  useEffect(() => {
    void wczytajAlerty().then(ustawAlerty)
  }, [])

  // Podpowiadamy poziomy z aktywnego sygnału.
  useEffect(() => {
    if (wejscie === '' && aktywne[0]) {
      ustawWejscie(aktywne[0].wejscie.toFixed(0))
      ustawStop(aktywne[0].stopLoss.toFixed(0))
    }
  }, [aktywne, wejscie])

  const wynik = useMemo(() => {
    const we = Number(wejscie.replace(',', '.'))
    const sl = Number(stop.replace(',', '.'))
    if (!Number.isFinite(we) || !Number.isFinite(sl) || we <= 0 || sl <= 0 || we === sl) return null

    const odlegloscProc = (Math.abs(we - sl) / we) * 100
    const ryzykoUsd = (kapital * ryzykoProc) / 100
    const wielkoscUsd = ryzykoUsd / (odlegloscProc / 100)
    const btc = wielkoscUsd / we
    // Likwidacja musi wypaść dalej niż stop – stąd zapas 1,8×.
    const maksDzwignia = Math.max(1, Math.floor(100 / (odlegloscProc * 1.8)))
    const potrzebnaDzwignia = wielkoscUsd / kapital

    return { odlegloscProc, ryzykoUsd, wielkoscUsd, btc, maksDzwignia, potrzebnaDzwignia, long: sl < we }
  }, [wejscie, stop, kapital, ryzykoProc])

  const dodajAlert = async () => {
    const c = Number(nowyAlert.replace(',', '.').replace(/\s/g, ''))
    if (!Number.isFinite(c) || c <= 0 || cena === null) return
    const a: Alert = {
      cena: c,
      kierunek: c > cena ? 'powyzej' : 'ponizej',
      utworzony: Date.now(),
      wyzwolony: false,
      opis: `BTC ${c > cena ? 'powyżej' : 'poniżej'} ${fCena(c)} USDT`,
    }
    await zapiszAlert(a)
    ustawAlerty(await wczytajAlerty())
    ustawNowyAlert('')
    void drgnij('srednio')
  }

  return (
    <>
      <Sekcja tytul="Kalkulator pozycji">
        <div className="karta space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Pole
              etykieta="Kapitał (USDT)"
              wartosc={String(kapital)}
              naZmiane={(v) => ustaw('kapital', Math.max(1, Number(v.replace(',', '.')) || 0))}
            />
            <Pole
              etykieta="Ryzyko na pozycję (%)"
              wartosc={String(ryzykoProc)}
              naZmiane={(v) => ustaw('ryzykoProc', Math.min(20, Math.max(0.1, Number(v.replace(',', '.')) || 1)))}
            />
            <Pole etykieta="Wejście (USDT)" wartosc={wejscie} naZmiane={ustawWejscie} />
            <Pole etykieta="Stop loss (USDT)" wartosc={stop} naZmiane={ustawStop} />
          </div>

          {cena !== null && (
            <button
              onClick={() => ustawWejscie(cena.toFixed(0))}
              className="w-full rounded-xl bg-white/6 py-2 text-[12px] font-semibold"
              style={{ color: 'var(--tekst-2)' }}
            >
              Wstaw cenę rynkową ({fCena(cena)})
            </button>
          )}

          {wynik ? (
            <div className="space-y-2 rounded-2xl bg-black/25 p-3">
              <WierszWyniku
                etykieta="Kierunek"
                wartosc={wynik.long ? 'LONG' : 'SHORT'}
                kolor={wynik.long ? 'var(--zielen)' : 'var(--czerwien)'}
              />
              <WierszWyniku
                etykieta="Odległość do SL"
                wartosc={`${wynik.odlegloscProc.toFixed(2).replace('.', ',')}%`}
              />
              <WierszWyniku etykieta="Ryzykujesz" wartosc={`${liczba(wynik.ryzykoUsd)} USDT`} />
              <WierszWyniku
                etykieta="Wielkość pozycji"
                wartosc={`${liczba(wynik.wielkoscUsd)} USDT`}
                dodatek={`${wynik.btc.toFixed(5)} BTC`}
              />
              <WierszWyniku
                etykieta="Potrzebna dźwignia"
                wartosc={`${wynik.potrzebnaDzwignia.toFixed(1).replace('.', ',')}×`}
                dodatek="przy całym kapitale jako depozyt"
              />
              <WierszWyniku
                etykieta="Maks. bezpieczna dźwignia"
                wartosc={`${wynik.maksDzwignia}×`}
                kolor="var(--zielen)"
                dodatek="likwidacja dalej niż SL"
              />
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--tekst-3)' }}>
              Wpisz wejście i stop loss, żeby policzyć wielkość pozycji.
            </p>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-white/3 p-2.5">
            <IkonaOstrzezenie rozmiar={13} klasa="mt-0.5 shrink-0 text-white/35" />
            <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
              Wyliczenia bez prowizji, poślizgu i kosztu fundingu. Rzeczywisty poziom likwidacji
              zależy od giełdy i trybu marginu — sprawdź go u siebie przed wejściem.
            </p>
          </div>
        </div>
      </Sekcja>

      <Sekcja tytul="Alerty cenowe">
        <div className="karta p-4">
          <div className="mb-3 flex gap-2">
            <input
              inputMode="decimal"
              value={nowyAlert}
              onChange={(e) => ustawNowyAlert(e.target.value)}
              placeholder={cena ? fCena(cena) : 'cena'}
              className="cyfry min-w-0 flex-1 rounded-xl bg-white/6 px-3 py-2.5 text-[14px] outline-none"
              style={{ color: 'var(--tekst)' }}
            />
            <button
              onClick={dodajAlert}
              className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
              style={{ background: 'var(--fiolet)', color: '#050609' }}
            >
              Dodaj
            </button>
          </div>

          {alerty.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--tekst-3)' }}>
              Brak alertów. Dodaj cenę, a dostaniesz powiadomienie, gdy BTC ją osiągnie.
            </p>
          ) : (
            <div className="space-y-1.5">
              {alerty.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="cyfry block text-[13px] font-semibold">
                      {fCena(a.cena)} USDT
                    </span>
                    <span className="block text-[10.5px]" style={{ color: 'var(--tekst-3)' }}>
                      {a.wyzwolony ? 'wyzwolony' : a.kierunek === 'powyzej' ? 'gdy wzrośnie powyżej' : 'gdy spadnie poniżej'}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      if (a.id !== undefined) {
                        await usunAlert(a.id)
                        ustawAlerty(await wczytajAlerty())
                      }
                    }}
                    aria-label="Usuń alert"
                    className="shrink-0 rounded-lg p-1.5"
                    style={{ color: 'var(--tekst-3)' }}
                  >
                    <IkonaZamknij rozmiar={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Sekcja>
    </>
  )
}

function Pole({
  etykieta,
  wartosc,
  naZmiane,
}: {
  etykieta: string
  wartosc: string
  naZmiane: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="etykieta mb-1 block">{etykieta}</span>
      <input
        inputMode="decimal"
        value={wartosc}
        onChange={(e) => naZmiane(e.target.value)}
        className="cyfry w-full rounded-xl bg-white/6 px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-[var(--fiolet)]"
        style={{ color: 'var(--tekst)' }}
      />
    </label>
  )
}

function WierszWyniku({
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
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12.5px]" style={{ color: 'var(--tekst-2)' }}>
        {etykieta}
      </span>
      <span className="text-right">
        <span className="cyfry text-[14px] font-semibold" style={{ color: kolor ?? 'var(--tekst)' }}>
          {wartosc}
        </span>
        {dodatek && (
          <span className="block text-[10px]" style={{ color: 'var(--tekst-3)' }}>
            {dodatek}
          </span>
        )}
      </span>
    </div>
  )
}
