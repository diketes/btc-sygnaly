import { useState } from 'react'
import { motion } from 'framer-motion'
import { PROFILE } from '@/analiza/profile'
import { STRONA_WYDAN, WERSJA } from '@/dane/aktualizacje'
import { NATYWNIE } from '@/lib/http'
import { uzyjAktualizacji } from '@/stan/aktualizacja'
import { wyczyscWszystko } from '@/dane/db'
import { ZRODLA } from '@/dane/newsy/zrodla'
import { GIELDY, stanZrodla, ustawGielde } from '@/dane/gieldy'
import { eksportujHistorie, type WynikEksportu } from '@/lib/eksport'
import { czyMamyZgode, popropZgode, ustawHaptyke } from '@/lib/powiadomienia'
import { uzyjSygnalow } from '@/stan/sygnaly'
import { uzyjUstawien } from '@/stan/ustawienia'
import { IkonaOstrzezenie, IkonaZamknij } from '@/ui/Ikony'
import { Ekran, NaglowekEkranu, Sekcja } from '@/ui/Powloka'
import { PrzelacznikHoryzontu } from '@/ui/PrzelacznikHoryzontu'

export function Ustawienia({ naZamknij }: { naZamknij: () => void }) {
  const u = uzyjUstawien()
  const wyczyscHistorie = uzyjSygnalow((s) => s.wyczyscHistorie)
  const [potwierdzenie, ustawPotwierdzenie] = useState<'historia' | 'wszystko' | null>(null)
  const [zgodaPowiadomien, ustawZgode] = useState<boolean | null>(null)
  const [eksport, ustawEksport] = useState<WynikEksportu | null>(null)

  void czyMamyZgode().then((z) => {
    if (zgodaPowiadomien === null) ustawZgode(z)
  })

  return (
    <Ekran>
      <NaglowekEkranu
        tytul="Ustawienia"
        akcja={
          <button
            onClick={naZamknij}
            aria-label="Zamknij"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:scale-95"
            style={{ color: 'var(--tekst-2)' }}
          >
            <IkonaZamknij rozmiar={18} />
          </button>
        }
      />

      <div className="px-4">
        <Sekcja tytul="Horyzont inwestycyjny">
          <PrzelacznikHoryzontu wartosc={u.trybHoryzontu} naZmiane={(t) => u.ustaw('trybHoryzontu', t)} />
          <div className="karta mt-3 space-y-3 p-4">
            {(['krotki', 'dlugi'] as const).map((h) => {
              const p = PROFILE[h]
              return (
                <div key={h}>
                  <p className="text-[13px] font-semibold" style={{ color: p.kolorAkcentu }}>
                    {p.nazwa} — {p.podtytul}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
                    Interwały {p.interwaly.map((i) => i.interwal).join(', ')} · stop {p.mnoznikSL}×ATR ·
                    cele {p.celeR.join('R / ')}R · min. zysk do ryzyka {p.minRR} · maks. dźwignia{' '}
                    {p.maksDzwignia}× · sygnał żyje do {Math.round(p.waznoscGodzin / 24)} dni
                  </p>
                </div>
              )
            })}
          </div>
        </Sekcja>

        <Sekcja tytul="Powiadomienia">
          <div className="karta divide-y divide-white/5 p-1">
            {zgodaPowiadomien === false && (
              <button
                onClick={async () => ustawZgode(await popropZgode())}
                className="w-full rounded-xl px-3 py-3 text-left"
              >
                <span className="text-[13px] font-semibold" style={{ color: 'var(--fiolet)' }}>
                  Włącz powiadomienia systemowe
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--tekst-3)' }}>
                  Bez zgody aplikacja nie wyśle żadnego alertu.
                </span>
              </button>
            )}
            <Przelacznik
              etykieta="Nowe sygnały"
              opis={`tylko o pewności co najmniej ${u.progPewnosci}%`}
              wartosc={u.powiadomieniaSygnaly}
              naZmiane={(v) => u.ustaw('powiadomieniaSygnaly', v)}
            />
            <Suwak
              etykieta="Próg pewności sygnału"
              wartosc={u.progPewnosci}
              min={30}
              max={90}
              krok={5}
              jednostka="%"
              naZmiane={(v) => u.ustaw('progPewnosci', v)}
            />
            <Przelacznik
              etykieta="Trafione cele i stopy"
              opis="TP1, TP2, TP3, stop loss, unieważnienie"
              wartosc={u.powiadomieniaCele}
              naZmiane={(v) => u.ustaw('powiadomieniaCele', v)}
            />
            <Przelacznik
              etykieta="Ważne newsy"
              opis="jedno powiadomienie na historię, nigdy dwa razy to samo"
              wartosc={u.powiadomieniaNewsy}
              naZmiane={(v) => u.ustaw('powiadomieniaNewsy', v)}
            />
            <Suwak
              etykieta="Próg wpływu newsa"
              wartosc={u.progWplywuNewsa}
              min={5}
              max={10}
              krok={1}
              jednostka="/10"
              naZmiane={(v) => u.ustaw('progWplywuNewsa', v)}
            />
            <Przelacznik
              etykieta="Wydarzenia makro"
              opis="30 minut przed publikacją danych"
              wartosc={u.powiadomieniaMakro}
              naZmiane={(v) => u.ustaw('powiadomieniaMakro', v)}
            />
            <Przelacznik
              etykieta="Cisza nocna"
              opis={`od ${u.ciszaOd}:00 do ${u.ciszaDo}:00`}
              wartosc={u.ciszaNocna}
              naZmiane={(v) => u.ustaw('ciszaNocna', v)}
            />
          </div>
        </Sekcja>

        <Sekcja tytul="Wygląd i wydajność">
          <div className="karta divide-y divide-white/5 p-1">
            <Przelacznik
              etykieta="Oszczędzaj baterię"
              opis="wyłącza animowane tło, cząsteczki i żyroskop"
              wartosc={u.oszczedzajBaterie}
              naZmiane={(v) => u.ustaw('oszczedzajBaterie', v)}
            />
            <Przelacznik
              etykieta="Wibracje"
              opis="przy nowym sygnale, trafionym celu i stopie"
              wartosc={u.haptyka}
              naZmiane={(v) => {
                u.ustaw('haptyka', v)
                ustawHaptyke(v)
              }}
            />
          </div>
        </Sekcja>

        <Sekcja tytul="Źródła danych">
          <div className="karta p-4">
            <p className="etykieta mb-2">Giełda (cena i świece)</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {GIELDY.map((g) => {
                const aktywna = stanZrodla().aktywna === g.nazwa
                return (
                  <button
                    key={g.id}
                    onClick={() => ustawGielde(g.id)}
                    className="rounded-xl px-3 py-1.5 text-[12px] font-semibold"
                    style={{
                      background: aktywna ? 'rgba(0,226,138,0.15)' : 'rgba(255,255,255,0.05)',
                      color: aktywna ? 'var(--zielen)' : 'var(--tekst-3)',
                    }}
                  >
                    {g.nazwa}
                  </button>
                )
              })}
            </div>
            <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
              Binance jest źródłem głównym. Gdy przestanie odpowiadać, aplikacja sama przechodzi na
              kolejną giełdę z listy.
            </p>
          </div>

          <div className="karta mt-3 p-4">
            <p className="etykieta mb-2">Kanały newsowe</p>
            <div className="space-y-1">
              {ZRODLA.map((z) => {
                const wlaczone = u.wlaczoneZrodla.includes(z.id)
                return (
                  <button
                    key={z.id}
                    onClick={() => u.przelaczZrodlo(z.id)}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2"
                    style={{ background: wlaczone ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                  >
                    <span className="text-left">
                      <span className="block text-[12.5px] font-medium">{z.nazwa}</span>
                      <span className="block text-[10px]" style={{ color: 'var(--tekst-3)' }}>
                        {z.jezyk === 'pl' ? 'polski' : 'angielski'} · wiarygodność{' '}
                        {(z.wiarygodnosc * 100).toFixed(0)}%
                      </span>
                    </span>
                    <Ptaszek wlaczony={wlaczone} />
                  </button>
                )
              })}
            </div>
          </div>
        </Sekcja>

        <Sekcja tytul="Aktualizacje">
          <SekcjaAktualizacji />
        </Sekcja>

        <Sekcja tytul="Dane">
          <div className="karta space-y-2 p-4">
            {potwierdzenie === null ? (
              <>
                <button
                  onClick={async () => {
                    const s = uzyjSygnalow.getState()
                    ustawEksport(await eksportujHistorie([...s.historia, ...s.aktywne]))
                  }}
                  className="w-full rounded-xl bg-white/6 py-2.5 text-[13px] font-semibold"
                >
                  Eksportuj historię (CSV)
                </button>
                {eksport && (
                  <p
                    className="px-1 text-[11.5px] leading-relaxed"
                    style={{ color: eksport.udane ? 'var(--zielen)' : 'var(--tekst-3)' }}
                  >
                    {eksport.komunikat}
                  </p>
                )}
                <button
                  onClick={() => ustawPotwierdzenie('historia')}
                  className="w-full rounded-xl bg-white/6 py-2.5 text-[13px] font-semibold"
                >
                  Wyczyść historię sygnałów
                </button>
                <button
                  onClick={() => ustawPotwierdzenie('wszystko')}
                  className="w-full rounded-xl py-2.5 text-[13px] font-semibold"
                  style={{ background: 'rgba(255,59,92,0.12)', color: 'var(--czerwien)' }}
                >
                  Skasuj wszystkie dane lokalne
                </button>
                <button
                  onClick={u.przywrocDomyslne}
                  className="w-full rounded-xl py-2.5 text-[13px] font-semibold"
                  style={{ color: 'var(--tekst-3)' }}
                >
                  Przywróć ustawienia domyślne
                </button>
              </>
            ) : (
              <div className="rounded-xl bg-[#FF3B5C]/10 p-3">
                <p className="mb-2 text-[13px] font-semibold">
                  {potwierdzenie === 'historia'
                    ? 'Skasować historię sygnałów?'
                    : 'Skasować wszystkie dane lokalne?'}
                </p>
                <p className="mb-3 text-[11.5px]" style={{ color: 'var(--tekst-2)' }}>
                  {potwierdzenie === 'historia'
                    ? 'Znikną wszystkie zamknięte sygnały i statystyki skuteczności. Tego nie da się cofnąć.'
                    : 'Znikną świece, sygnały, newsy, alerty i ustawienia. Tego nie da się cofnąć.'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (potwierdzenie === 'historia') await wyczyscHistorie()
                      else {
                        await wyczyscWszystko()
                        await wyczyscHistorie()
                      }
                      ustawPotwierdzenie(null)
                    }}
                    className="flex-1 rounded-xl py-2 text-[13px] font-semibold"
                    style={{ background: 'var(--czerwien)', color: '#fff' }}
                  >
                    Tak, skasuj
                  </button>
                  <button
                    onClick={() => ustawPotwierdzenie(null)}
                    className="flex-1 rounded-xl bg-white/8 py-2 text-[13px] font-semibold"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </div>
        </Sekcja>

        <div className="mb-6 flex items-start gap-2 rounded-2xl bg-white/3 p-3">
          <IkonaOstrzezenie rozmiar={14} klasa="mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
            To nie jest porada inwestycyjna. Handel BTC z dźwignią wiąże się z ryzykiem utraty całego
            kapitału. Aplikacja liczy analizę techniczną z publicznych danych i nie przewiduje
            przyszłości — sprawdzaj wszystko samodzielnie.
          </p>
        </div>
      </div>
    </Ekran>
  )
}

function SekcjaAktualizacji() {
  const sprawdzaj = uzyjUstawien((s) => s.sprawdzajAktualizacje)
  const samodzielnie = uzyjUstawien((s) => s.pobierajAktualizacjeSamodzielnie)
  const ustaw = uzyjUstawien((s) => s.ustaw)
  const { etap, aktualizacja, procent, komunikat, wbudowanyAktualizator, ostatnieSprawdzenie } =
    uzyjAktualizacji()
  const [wToku, ustawWToku] = useState(false)

  const sprawdz = async () => {
    ustawWToku(true)
    try {
      await uzyjAktualizacji.getState().sprawdz(true)
    } finally {
      ustawWToku(false)
    }
  }

  const opisStanu = (() => {
    if (!NATYWNIE) {
      return 'Ta wersja aktualizuje się sama — wystarczy odświeżyć stronę, gdy pojawi się pasek.'
    }
    switch (etap) {
      case 'dostepna':
        return `Dostępna wersja ${aktualizacja?.wersja}.`
      case 'pobieranie':
        return `Pobieram ${aktualizacja?.wersja}: ${procent}%`
      case 'gotowa':
        return `Wersja ${aktualizacja?.wersja} pobrana – czeka na instalację.`
      case 'wymagana-zgoda':
        return 'Zezwól aplikacji na instalowanie aktualizacji (jednorazowo).'
      case 'blad':
        return komunikat ?? 'Nie udało się pobrać aktualizacji.'
      default:
        return ostatnieSprawdzenie ? 'Masz najnowszą wersję.' : null
    }
  })()

  return (
    <div className="karta p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-medium">Zainstalowana wersja</span>
        <span className="cyfry text-[13px] font-semibold" style={{ color: 'var(--zloto)' }}>
          {WERSJA}
        </span>
      </div>

      <button
        onClick={sprawdz}
        disabled={wToku || etap === 'pobieranie'}
        className="mb-2 w-full rounded-xl bg-white/6 py-2.5 text-[13px] font-semibold disabled:opacity-50"
      >
        {wToku ? 'Sprawdzam…' : 'Sprawdź aktualizacje'}
      </button>

      {opisStanu && (
        <div
          className="mb-3 rounded-xl p-2.5"
          style={{
            background:
              etap === 'blad'
                ? 'rgba(255,59,92,0.1)'
                : etap === 'brak'
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(0,226,138,0.1)',
          }}
        >
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--tekst-2)' }}>
            {opisStanu}
          </p>
          {etap === 'pobieranie' && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-[var(--zielen)]" style={{ width: `${procent}%` }} />
            </div>
          )}
          {(etap === 'dostepna' || etap === 'blad') && (
            <button
              onClick={() => void uzyjAktualizacji.getState().pobierz()}
              className="mt-2 w-full rounded-lg py-2 text-[12.5px] font-bold"
              style={{ background: 'var(--zielen)', color: '#050609' }}
            >
              Pobierz {aktualizacja?.wersja}
            </button>
          )}
          {etap === 'gotowa' && (
            <button
              onClick={() => void uzyjAktualizacji.getState().zainstaluj()}
              className="mt-2 w-full rounded-lg py-2 text-[12.5px] font-bold"
              style={{ background: 'var(--zielen)', color: '#050609' }}
            >
              Zainstaluj {aktualizacja?.wersja}
            </button>
          )}
          {etap === 'wymagana-zgoda' && (
            <button
              onClick={() => void uzyjAktualizacji.getState().zezwolNaInstalacje()}
              className="mt-2 w-full rounded-lg py-2 text-[12.5px] font-bold"
              style={{ background: 'var(--zloto)', color: '#050609' }}
            >
              Otwórz ustawienia zgody
            </button>
          )}
        </div>
      )}

      <div className="-mx-1 border-t border-white/5 pt-1">
        <Przelacznik
          etykieta="Sprawdzaj automatycznie"
          opis="przy starcie i co 6 godzin"
          wartosc={sprawdzaj}
          naZmiane={(v) => ustaw('sprawdzajAktualizacje', v)}
        />
        {NATYWNIE && (
          <Przelacznik
            etykieta="Pobieraj same przez Wi-Fi"
            opis={
              wbudowanyAktualizator
                ? 'nowa wersja ściąga się w tle, zostaje tylko „Zainstaluj”'
                : 'zadziała od następnej wersji aplikacji'
            }
            wartosc={samodzielnie}
            naZmiane={(v) => ustaw('pobierajAktualizacjeSamodzielnie', v)}
          />
        )}
      </div>

      <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: 'var(--tekst-3)' }}>
        Aplikacja nie jest w Google Play, więc sama pilnuje wersji i pobiera nowe wydania
        z GitHuba. Samego zainstalowania Android nie pozwala pominąć — ostatnie „Zainstaluj”
        zawsze potwierdza człowiek.{' '}
        <a href={STRONA_WYDAN} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fiolet)' }}>
          Wszystkie wydania
        </a>
      </p>
    </div>
  )
}

function Ptaszek({ wlaczony }: { wlaczony: boolean }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
      style={{
        background: wlaczony ? 'var(--zielen)' : 'rgba(255,255,255,0.08)',
        color: '#050609',
      }}
    >
      {wlaczony && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  )
}

function Przelacznik({
  etykieta,
  opis,
  wartosc,
  naZmiane,
}: {
  etykieta: string
  opis?: string
  wartosc: boolean
  naZmiane: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => naZmiane(!wartosc)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{etykieta}</span>
        {opis && (
          <span className="mt-0.5 block text-[10.5px] leading-snug" style={{ color: 'var(--tekst-3)' }}>
            {opis}
          </span>
        )}
      </span>
      <span
        className="relative h-6 w-10 shrink-0 rounded-full transition-colors"
        style={{ background: wartosc ? 'var(--zielen)' : 'rgba(255,255,255,0.12)' }}
      >
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          animate={{ left: wartosc ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      </span>
    </button>
  )
}

function Suwak({
  etykieta,
  wartosc,
  min,
  max,
  krok,
  jednostka,
  naZmiane,
}: {
  etykieta: string
  wartosc: number
  min: number
  max: number
  krok: number
  jednostka: string
  naZmiane: (v: number) => void
}) {
  return (
    <div className="px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{etykieta}</span>
        <span className="cyfry text-[13px] font-semibold" style={{ color: 'var(--fiolet)' }}>
          {wartosc}
          {jednostka}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={krok}
        value={wartosc}
        onChange={(e) => naZmiane(Number(e.target.value))}
        className="w-full accent-[var(--fiolet)]"
      />
    </div>
  )
}
