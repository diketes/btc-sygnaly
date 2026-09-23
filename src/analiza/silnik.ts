/**
 * Silnik sygnałów.
 *
 * Każdy interwał oceniany jest niezależnie (składniki −100…+100), potem składany
 * wagami profilu horyzontu. Na wynik nakładane są modyfikatory rynkowe (funding,
 * likwidacje, nastroje), a dopiero z tego powstaje sygnał z wejściem, SL i celami.
 *
 * Silnik jest czystą funkcją – to samo wejście zawsze daje to samo wyjście.
 * Dzięki temu backtest i aplikacja liczą dokładnie tak samo.
 */

import {
  adx as liczAdx,
  atr as liczAtr,
  bollinger,
  ema,
  ichimoku as liczIchimoku,
  macd as liczMacd,
  nachylenie,
  obv as liczObv,
  ogranicz,
  ostatnia,
  percentyl,
  rsi as liczRsi,
  sma,
  stochRsi as liczStochRsi,
  vwap as liczVwap,
  wartoscWstecz,
  zamkniecia,
  type Swieca,
} from './wskazniki'
import {
  najblizszeWsparcie,
  najblizszyOpor,
  ostatniImpuls,
  pivoty,
  poziomy as liczPoziomy,
  strukturaTrendu,
  type Poziom,
} from './struktura'
import { MS_INTERWALU, profil, type Horyzont, type Interwal, type ProfilHoryzontu } from './profile'
import {
  PUSTY_KONTEKST,
  type Cel,
  type Czekaj,
  type KontekstRynku,
  type Modyfikator,
  type OcenaInterwalu,
  type Rezim,
  type Skladnik,
  type SwieceWgInterwalu,
  type Sygnal,
  type WynikAnalizy,
} from './typy'

// ------------------------------------------------------------------ pomocnicze

function bezpieczna(x: number, zastepcza = 0): number {
  return Number.isFinite(x) ? x : zastepcza
}

function procentowaRoznica(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0
  return ((a - b) / b) * 100
}

/**
 * Dywergencja między ceną a oscylatorem na dwóch ostatnich pivotach.
 * Bycza: cena niżej, oscylator wyżej. Niedźwiedzia: cena wyżej, oscylator niżej.
 */
function dywergencja(
  swiece: readonly Swieca[],
  oscylator: readonly number[],
  promien = 3,
): 'bycza' | 'niedzwiedzia' | null {
  const p = pivoty(swiece, promien)
  const dolki = p.filter((x) => x.typ === 'dolek').slice(-2)
  const szczyty = p.filter((x) => x.typ === 'szczyt').slice(-2)

  if (dolki.length === 2) {
    const [a, b] = dolki
    const oa = oscylator[a.indeks]
    const ob = oscylator[b.indeks]
    if (Number.isFinite(oa) && Number.isFinite(ob) && b.cena < a.cena && ob > oa + 2) {
      return 'bycza'
    }
  }
  if (szczyty.length === 2) {
    const [a, b] = szczyty
    const oa = oscylator[a.indeks]
    const ob = oscylator[b.indeks]
    if (Number.isFinite(oa) && Number.isFinite(ob) && b.cena > a.cena && ob < oa - 2) {
      return 'niedzwiedzia'
    }
  }
  return null
}

function wykryjRezim(wartoscAdx: number): Rezim {
  if (!Number.isFinite(wartoscAdx)) return 'przejsciowy'
  if (wartoscAdx > 25) return 'trend'
  if (wartoscAdx < 20) return 'zakres'
  return 'przejsciowy'
}

// ------------------------------------------------------------------ ocena jednego interwału

export function ocenInterwal(
  interwal: Interwal,
  swiece: readonly Swieca[],
  p: ProfilHoryzontu,
  waga: number,
): OcenaInterwalu | null {
  if (swiece.length < 60) return null

  const c = zamkniecia(swiece)
  const cena = c[c.length - 1]

  const e9 = ema(c, 9)
  const e21 = ema(c, 21)
  const e50 = ema(c, 50)
  const e200 = ema(c, 200)
  const s50 = sma(c, 50)
  const s200 = sma(c, 200)
  const m = liczMacd(c)
  const r = liczRsi(c, 14)
  const sr = liczStochRsi(c)
  const bb = bollinger(c, 20, 2)
  const a = liczAtr(swiece, 14)
  const adxDane = liczAdx(swiece, 14)
  const vw = liczVwap(swiece)
  const ich = liczIchimoku(swiece)
  const ob = liczObv(swiece)

  const wartoscAtr = bezpieczna(ostatnia(a), cena * 0.01)
  const wartoscAdx = ostatnia(adxDane.adx)
  const rezim = wykryjRezim(wartoscAdx)
  const w = p.wagiWskaznikow
  const skladniki: Skladnik[] = []

  const dodaj = (klucz: keyof typeof w, etykieta: string, wynik: number, opis: string) => {
    if (w[klucz] <= 0) return
    skladniki.push({ klucz, etykieta, wynik: ogranicz(wynik, -100, 100), waga: w[klucz], opis })
  }

  // --- układ średnich EMA -------------------------------------------------
  {
    const v9 = ostatnia(e9)
    const v21 = ostatnia(e21)
    const v50 = ostatnia(e50)
    const v200 = ostatnia(e200)
    let wynik = 0
    const opisy: string[] = []
    if (Number.isFinite(v21)) {
      wynik += cena > v21 ? 20 : -20
    }
    if (Number.isFinite(v9) && Number.isFinite(v21)) {
      wynik += v9 > v21 ? 20 : -20
    }
    if (Number.isFinite(v21) && Number.isFinite(v50)) {
      wynik += v21 > v50 ? 25 : -25
    }
    if (Number.isFinite(v50) && Number.isFinite(v200)) {
      wynik += v50 > v200 ? 35 : -35
      opisy.push(v50 > v200 ? 'EMA50 nad EMA200' : 'EMA50 pod EMA200')
    }
    const uklad =
      wynik > 55
        ? 'średnie ułożone byczo'
        : wynik < -55
          ? 'średnie ułożone niedźwiedzio'
          : 'średnie splątane'
    dodaj('emaUklad', 'Układ EMA', wynik, `${interwal}: ${uklad}${opisy.length ? ` (${opisy[0]})` : ''}`)
  }

  // --- trend wyższego rzędu ----------------------------------------------
  {
    const v200 = ostatnia(e200)
    const vs50 = ostatnia(s50)
    const vs200 = ostatnia(s200)
    let wynik = 0
    let opis = `${interwal}: brak pełnych danych trendu`
    if (Number.isFinite(v200)) {
      const odleglosc = procentowaRoznica(cena, v200)
      wynik += cena > v200 ? 40 : -40
      wynik += ogranicz(odleglosc * 1.5, -20, 20)
      opis = `${interwal}: cena ${odleglosc >= 0 ? '+' : ''}${odleglosc.toFixed(1)}% względem EMA200`
    }
    if (Number.isFinite(vs50) && Number.isFinite(vs200)) {
      wynik += vs50 > vs200 ? 40 : -40
      opis += vs50 > vs200 ? ', złoty krzyż aktywny' : ', krzyż śmierci aktywny'
    }
    dodaj('trendDlugi', 'Trend wyższego rzędu', wynik, opis)
  }

  // --- MACD ---------------------------------------------------------------
  {
    const hist = ostatnia(m.histogram)
    const histPoprz = wartoscWstecz(m.histogram, 1)
    const linia = ostatnia(m.linia)
    let wynik = 0
    if (Number.isFinite(hist)) wynik += hist > 0 ? 30 : -30
    if (Number.isFinite(linia)) wynik += linia > 0 ? 25 : -25
    if (Number.isFinite(hist) && Number.isFinite(histPoprz)) {
      wynik += hist > histPoprz ? 25 : -25
      // Świeże przecięcie linii sygnału ma dodatkową wagę.
      if (histPoprz <= 0 && hist > 0) wynik += 20
      if (histPoprz >= 0 && hist < 0) wynik -= 20
    }
    const kierunekOpis =
      Number.isFinite(hist) && Number.isFinite(histPoprz)
        ? hist > histPoprz
          ? 'momentum rośnie'
          : 'momentum słabnie'
        : 'brak danych'
    dodaj(
      'macd',
      'MACD',
      wynik,
      `${interwal}: histogram ${hist >= 0 ? 'dodatni' : 'ujemny'}, ${kierunekOpis}`,
    )
  }

  // --- RSI (z uwzględnieniem reżimu i dywergencji) ------------------------
  {
    const v = ostatnia(r)
    let wynik = 0
    let opis = `${interwal}: RSI ${v.toFixed(0)}`
    if (Number.isFinite(v)) {
      if (rezim === 'zakres') {
        // W konsolidacji gramy od krawędzi – wyprzedanie jest bycze.
        if (v < 30) wynik = ogranicz((30 - v) * 4, 0, 100)
        else if (v > 70) wynik = -ogranicz((v - 70) * 4, 0, 100)
        else wynik = (50 - v) * 1.2
        opis += v < 30 ? ' – wyprzedanie w konsolidacji' : v > 70 ? ' – wykupienie w konsolidacji' : ' – środek zakresu'
      } else {
        // W trendzie RSI powyżej 50 potwierdza kierunek, skrajności lekko karzemy.
        wynik = ogranicz((v - 50) * 2.4, -100, 100)
        if (v > 78) wynik -= 25
        if (v < 22) wynik += 25
        opis += v > 50 ? ' – momentum po stronie byków' : ' – momentum po stronie niedźwiedzi'
      }
      const dyw = dywergencja(swiece, r)
      if (dyw === 'bycza') {
        wynik += 25
        opis += ', bycza dywergencja'
      } else if (dyw === 'niedzwiedzia') {
        wynik -= 25
        opis += ', niedźwiedzia dywergencja'
      }
    }
    dodaj('rsi', 'RSI', wynik, opis)
  }

  // --- Stochastic RSI -----------------------------------------------------
  {
    const k = ostatnia(sr.k)
    const d = ostatnia(sr.d)
    let wynik = 0
    let opis = `${interwal}: Stoch RSI brak danych`
    if (Number.isFinite(k) && Number.isFinite(d)) {
      if (k < 20) wynik += 55
      else if (k > 80) wynik -= 55
      else wynik += (50 - k) * 0.8
      wynik += k > d ? 25 : -25
      opis = `${interwal}: Stoch RSI ${k.toFixed(0)} (${k > d ? '%K nad %D' : '%K pod %D'})`
    }
    dodaj('stochRsi', 'Stoch RSI', wynik, opis)
  }

  // --- wstęgi Bollingera --------------------------------------------------
  {
    const gora = ostatnia(bb.gora)
    const dol = ostatnia(bb.dol)
    const srodek = ostatnia(bb.srodek)
    let wynik = 0
    let opis = `${interwal}: Bollinger brak danych`
    if (Number.isFinite(gora) && Number.isFinite(dol) && gora > dol) {
      const procentB = ((cena - dol) / (gora - dol)) * 100
      if (rezim === 'zakres') {
        wynik = ogranicz((50 - procentB) * 1.8, -100, 100)
      } else {
        wynik = ogranicz((procentB - 50) * 1.4, -100, 100)
        if (procentB > 100) wynik -= 20
        if (procentB < 0) wynik += 20
      }
      const percSzer = percentyl(bb.szerokosc.filter(Number.isFinite), 120)
      const sciski = Number.isFinite(percSzer) && percSzer < 15
      if (sciski) wynik *= 0.6
      opis = `${interwal}: %B ${procentB.toFixed(0)}${sciski ? ', ściśnięte wstęgi (wybicie blisko)' : ''}${
        Number.isFinite(srodek) ? '' : ''
      }`
    }
    dodaj('bollinger', 'Bollinger', wynik, opis)
  }

  // --- VWAP ---------------------------------------------------------------
  {
    const v = ostatnia(vw)
    let wynik = 0
    let opis = `${interwal}: VWAP brak danych`
    if (Number.isFinite(v)) {
      const odleglosc = procentowaRoznica(cena, v)
      wynik = ogranicz(odleglosc * 45, -100, 100)
      opis = `${interwal}: cena ${odleglosc >= 0 ? 'nad' : 'pod'} VWAP (${odleglosc >= 0 ? '+' : ''}${odleglosc.toFixed(2)}%)`
    }
    dodaj('vwap', 'VWAP', wynik, opis)
  }

  // --- Ichimoku -----------------------------------------------------------
  {
    const tenkan = ostatnia(ich.tenkan)
    const kijun = ostatnia(ich.kijun)
    const spanA = ostatnia(ich.spanA)
    const spanB = ostatnia(ich.spanB)
    let wynik = 0
    let opis = `${interwal}: Ichimoku brak danych`
    if (Number.isFinite(spanA) && Number.isFinite(spanB)) {
      const goraChmury = Math.max(spanA, spanB)
      const dolChmury = Math.min(spanA, spanB)
      if (cena > goraChmury) {
        wynik += 40
        opis = `${interwal}: cena nad chmurą Ichimoku`
      } else if (cena < dolChmury) {
        wynik -= 40
        opis = `${interwal}: cena pod chmurą Ichimoku`
      } else {
        opis = `${interwal}: cena w chmurze Ichimoku (niezdecydowanie)`
      }
      wynik += spanA > spanB ? 30 : -30
    }
    if (Number.isFinite(tenkan) && Number.isFinite(kijun)) {
      wynik += tenkan > kijun ? 30 : -30
    }
    dodaj('ichimoku', 'Ichimoku', wynik, opis)
  }

  // --- struktura rynku ----------------------------------------------------
  {
    const st = strukturaTrendu(swiece, 3)
    let wynik = st === 'wzrostowa' ? 70 : st === 'spadkowa' ? -70 : 0
    const okno = swiece.slice(-90)
    const max = Math.max(...okno.map((s) => s.h))
    const min = Math.min(...okno.map((s) => s.l))
    if (max > min) {
      const pozycja = ((cena - min) / (max - min)) * 100
      // W trendzie wysoka pozycja to siła, w konsolidacji – ryzyko.
      wynik += rezim === 'zakres' ? ogranicz((50 - pozycja) * 0.6, -30, 30) : ogranicz((pozycja - 50) * 0.6, -30, 30)
    }
    const opisSt =
      st === 'wzrostowa'
        ? 'wyższe szczyty i wyższe dołki'
        : st === 'spadkowa'
          ? 'niższe szczyty i niższe dołki'
          : 'struktura boczna'
    dodaj('struktura', 'Struktura', wynik, `${interwal}: ${opisSt}`)
  }

  // --- poziomy wsparcia i oporu ------------------------------------------
  let poziomyLista: Poziom[] = []
  {
    poziomyLista = liczPoziomy(swiece, cena, { promien: 2, tolerancjaProc: 0.25, maks: 14 })
    const wsparcie = najblizszeWsparcie(poziomyLista, cena)
    const opor = najblizszyOpor(poziomyLista, cena)
    let wynik = 0
    let opis = `${interwal}: brak wyraźnych poziomów`
    if (wsparcie && opor) {
      const doWsparcia = cena - wsparcie.cena
      const doOporu = opor.cena - cena
      // Blisko wsparcia = okazja do longa; blisko oporu = ryzyko.
      if (doWsparcia < wartoscAtr * 0.6) wynik += 55
      if (doOporu < wartoscAtr * 0.6) wynik -= 55
      // Przestrzeń do ruchu: gdzie jest więcej miejsca.
      const asymetria = (doOporu - doWsparcia) / (doOporu + doWsparcia)
      wynik += ogranicz(asymetria * 45, -45, 45)
      opis = `${interwal}: wsparcie ${wsparcie.cena.toFixed(0)}, opór ${opor.cena.toFixed(0)}`
    } else if (wsparcie) {
      wynik += 25
      opis = `${interwal}: brak oporu nad ceną (otwarta przestrzeń)`
    } else if (opor) {
      wynik -= 25
      opis = `${interwal}: brak wsparcia pod ceną`
    }
    dodaj('poziomy', 'Poziomy S/R', wynik, opis)
  }

  // --- wolumen / OBV ------------------------------------------------------
  {
    const nachylenieObv = nachylenie(ob, 30)
    const sredniWolumen = swiece.slice(-40, -1).reduce((a, s) => a + s.v, 0) / 39
    const ostatniWolumen = swiece[swiece.length - 1].v
    const stosunek = sredniWolumen > 0 ? ostatniWolumen / sredniWolumen : 1
    const ostatniaZmiana = swiece[swiece.length - 1].c - swiece[swiece.length - 1].o

    let wynik = 0
    if (Number.isFinite(nachylenieObv)) wynik += ogranicz(nachylenieObv * 12, -60, 60)
    if (stosunek > 1.5) wynik += ostatniaZmiana > 0 ? 40 : -40
    const opis = `${interwal}: OBV ${Number.isFinite(nachylenieObv) && nachylenieObv > 0 ? 'rośnie' : 'spada'}, wolumen ${stosunek.toFixed(1)}× średniej`
    dodaj('wolumen', 'Wolumen / OBV', wynik, opis)
  }

  // --- suma ważona --------------------------------------------------------
  const sumaWag = skladniki.reduce((a, s) => a + s.waga, 0)
  const wynik =
    sumaWag > 0 ? ogranicz(skladniki.reduce((a, s) => a + s.wynik * s.waga, 0) / sumaWag, -100, 100) : 0

  return {
    interwal,
    waga,
    wynik,
    rezim,
    adx: bezpieczna(wartoscAdx),
    atr: wartoscAtr,
    cena,
    skladniki,
  }
}

// ------------------------------------------------------------------ modyfikatory

function policzModyfikatory(k: KontekstRynku, p: ProfilHoryzontu): Modyfikator[] {
  const out: Modyfikator[] = []
  const wm = p.wagiModyfikatorow

  if (k.funding !== null && Number.isFinite(k.funding)) {
    const f = k.funding
    if (f > 0.05) {
      out.push({
        etykieta: 'Funding',
        wplyw: -15 * wm.funding,
        opis: `Funding ${f.toFixed(3)}% – longi przepłacają, rynek przegrzany po stronie byków`,
      })
    } else if (f < -0.02) {
      out.push({
        etykieta: 'Funding',
        wplyw: 14 * wm.funding,
        opis: `Funding ${f.toFixed(3)}% – shorty płacą longom, tłum ustawiony na spadki`,
      })
    } else {
      out.push({
        etykieta: 'Funding',
        wplyw: 0,
        opis: `Funding ${f.toFixed(3)}% – neutralny`,
      })
    }
  }

  if (k.longShort !== null && Number.isFinite(k.longShort)) {
    const ls = k.longShort
    if (ls > 2.5) {
      out.push({
        etykieta: 'Long/Short',
        wplyw: -12 * wm.longShort,
        opis: `${ls.toFixed(2)} longów na shorta – tłum po jednej stronie, ryzyko zgarnięcia`,
      })
    } else if (ls < 0.8) {
      out.push({
        etykieta: 'Long/Short',
        wplyw: 12 * wm.longShort,
        opis: `${ls.toFixed(2)} longów na shorta – przewaga shortów, paliwo do short squeeze`,
      })
    }
  }

  const likwidacje = k.likwidacjeLong15m + k.likwidacjeShort15m
  if (likwidacje > 20_000_000) {
    const przewagaLong = k.likwidacjeLong15m > k.likwidacjeShort15m
    out.push({
      etykieta: 'Likwidacje',
      wplyw: (przewagaLong ? 18 : -18) * wm.likwidacje,
      opis: `Kaskada likwidacji ${(likwidacje / 1_000_000).toFixed(1)} mln USD w 15 min – głównie ${
        przewagaLong ? 'longi (kapitulacja, częste odbicie)' : 'shorty (wyciskanie, częste schłodzenie)'
      }`,
    })
  }

  if (k.strachChciwosc !== null && Number.isFinite(k.strachChciwosc)) {
    const fg = k.strachChciwosc
    if (fg < 20) {
      out.push({
        etykieta: 'Strach i chciwość',
        wplyw: 14 * wm.strachChciwosc,
        opis: `Indeks ${fg} – skrajny strach, historycznie dobre miejsce na akumulację`,
      })
    } else if (fg > 80) {
      out.push({
        etykieta: 'Strach i chciwość',
        wplyw: -14 * wm.strachChciwosc,
        opis: `Indeks ${fg} – skrajna chciwość, podwyższone ryzyko korekty`,
      })
    }
  }

  if (k.zmianaOi24h !== null && Number.isFinite(k.zmianaOi24h)) {
    const oi = k.zmianaOi24h
    if (Math.abs(oi) > 6) {
      out.push({
        etykieta: 'Open Interest',
        wplyw: 0,
        opis: `OI ${oi >= 0 ? '+' : ''}${oi.toFixed(1)}% / 24h – ${
          oi > 0 ? 'napływ nowych pozycji, ruch ma paliwo' : 'zamykanie pozycji, ruch traci paliwo'
        }`,
      })
    }
  }

  return out
}

// ------------------------------------------------------------------ główna analiza

export interface WejscieAnalizy {
  horyzont: Horyzont
  swieceWg: SwieceWgInterwalu
  kontekst?: KontekstRynku
  /** Znacznik czasu analizy (domyślnie „teraz”) – backtest podaje czas świecy. */
  teraz?: number
  /** Ostatni sygnał tego horyzontu – do sprawdzenia cooldownu. */
  poprzedniSygnal?: { kierunek: 'long' | 'short'; utworzony: number } | null
  /**
   * Tryb „Daj sygnał”: pomija progi wejścia i zawsze zwraca kierunek,
   * w który przechyla się rynek. Poziomy (wejście, stop, cele) liczone są
   * dokładnie tak samo jak zwykle — różnica jest wyłącznie w tym, że silnik
   * nie odmawia, gdy przewaga jest za słaba. Wynikowy sygnał ma
   * `naZadanie: true` i listę tego, czego mu zabrakło.
   */
  naZadanie?: boolean
}

export function analizuj(wejscie: WejscieAnalizy): WynikAnalizy {
  const { horyzont, swieceWg } = wejscie
  const kontekst = wejscie.kontekst ?? PUSTY_KONTEKST
  const p = profil(horyzont)
  const teraz = wejscie.teraz ?? Date.now()

  const oceny: OcenaInterwalu[] = []
  for (const { interwal, waga } of p.interwaly) {
    const swiece = swieceWg[interwal]
    if (!swiece || swiece.length < 60) continue
    const o = ocenInterwal(interwal, swiece, p, waga)
    if (o) oceny.push(o)
  }

  const swieceBazowe = swieceWg[p.interwalBazowy] ?? []
  const cenaOdniesienia = swieceBazowe.length
    ? swieceBazowe[swieceBazowe.length - 1].c
    : (oceny[0]?.cena ?? 0)

  const czekaj = (powody: string[], wynik = 0, zgodnosc = 0, rezim: Rezim = 'przejsciowy'): Czekaj => ({
    horyzont,
    kierunek: 'czekaj',
    wynik,
    zgodnosc,
    rezim,
    powody,
    oceny,
    modyfikatory: policzModyfikatory(kontekst, p),
    cenaOdniesienia,
    utworzony: teraz,
    postep: {
      wynikUdzial: ogranicz(Math.abs(wynik) / p.progWyniku, 0, 1),
      zgodnoscUdzial: ogranicz(zgodnosc / p.minZgodnosc, 0, 1),
      progWyniku: p.progWyniku,
      wymaganaZgodnosc: p.minZgodnosc,
      sklonnosc: Math.abs(wynik) < 3 ? null : wynik > 0 ? 'long' : 'short',
    },
  })

  if (oceny.length === 0 || swieceBazowe.length < 60) {
    return czekaj(['Za mało danych świecowych, żeby policzyć analizę.'])
  }

  // Suma ważona interwałów (wagi normalizowane do faktycznie dostępnych).
  const sumaWag = oceny.reduce((a, o) => a + o.waga, 0)
  let wynik = oceny.reduce((a, o) => a + o.wynik * o.waga, 0) / sumaWag

  const modyfikatory = policzModyfikatory(kontekst, p)
  for (const mod of modyfikatory) wynik += mod.wplyw
  wynik = ogranicz(wynik, -100, 100)

  const kierunekWstepny: 'long' | 'short' = wynik >= 0 ? 'long' : 'short'
  const zgodnosc = oceny.filter((o) =>
    kierunekWstepny === 'long' ? o.wynik > 5 : o.wynik < -5,
  ).length

  // Reżim decydujemy na interwale bazowym (lub najwyżej ważonym dostępnym).
  const ocenaBazowa =
    oceny.find((o) => o.interwal === p.interwalBazowy) ??
    [...oceny].sort((a, b) => b.waga - a.waga)[0]
  const rezim = ocenaBazowa.rezim
  const wartoscAtr = ocenaBazowa.atr

  const powodyCzekania: string[] = []
  if (Math.abs(wynik) < p.progWyniku) {
    powodyCzekania.push(
      `Wynik ${wynik.toFixed(0)} jest poniżej progu ${p.progWyniku} – rynek nie daje przewagi żadnej ze stron.`,
    )
  }
  if (zgodnosc < p.minZgodnosc) {
    powodyCzekania.push(
      `Tylko ${zgodnosc} z ${oceny.length} interwałów wskazuje ten sam kierunek (wymagane ${p.minZgodnosc}).`,
    )
  }

  // Cooldown – nie zasypujemy tym samym kierunkiem.
  const poprzedni = wejscie.poprzedniSygnal
  if (poprzedni && poprzedni.kierunek === kierunekWstepny) {
    const minelo = teraz - poprzedni.utworzony
    const wymagane = p.cooldownSwiec * MS_INTERWALU[p.interwalBazowy]
    if (minelo < wymagane) {
      const zostalo = Math.ceil((wymagane - minelo) / 3_600_000)
      powodyCzekania.push(
        `Aktywna blokada po poprzednim sygnale ${kierunekWstepny.toUpperCase()} (jeszcze ok. ${zostalo} h).`,
      )
    }
  }

  const naZadanie = wejscie.naZadanie === true

  // W trybie „Daj sygnał” nie odmawiamy – zapamiętujemy tylko, czego zabrakło.
  if (powodyCzekania.length > 0 && !naZadanie) {
    return czekaj(powodyCzekania, wynik, zgodnosc, rezim)
  }
  const brakiDoStandardu = naZadanie ? [...powodyCzekania] : []

  // --- budowa sygnału -----------------------------------------------------
  const kierunek = kierunekWstepny
  const poziomyBazowe = liczPoziomy(swieceBazowe, cenaOdniesienia, {
    promien: 2,
    tolerancjaProc: 0.25,
    maks: 16,
  })

  // Stop loss: ostatni istotny swing po stronie ryzyka, powiększony o bufor ATR.
  const okno = swieceBazowe.slice(-40)
  const swingDol = Math.min(...okno.map((s) => s.l))
  const swingGora = Math.max(...okno.map((s) => s.h))
  const bufor = wartoscAtr * p.mnoznikSL

  let stopLoss =
    kierunek === 'long'
      ? Math.min(swingDol - bufor * 0.35, cenaOdniesienia - bufor)
      : Math.max(swingGora + bufor * 0.35, cenaOdniesienia + bufor)

  // Zabezpieczenie: SL nie bliżej niż 0,4 ATR i nie dalej niż 5 ATR od ceny.
  const minOdleglosc = wartoscAtr * 0.4
  const maksOdleglosc = wartoscAtr * 5
  const odlegloscSurowa = Math.abs(cenaOdniesienia - stopLoss)
  if (odlegloscSurowa < minOdleglosc) {
    stopLoss = kierunek === 'long' ? cenaOdniesienia - minOdleglosc : cenaOdniesienia + minOdleglosc
  } else if (odlegloscSurowa > maksOdleglosc) {
    stopLoss = kierunek === 'long' ? cenaOdniesienia - maksOdleglosc : cenaOdniesienia + maksOdleglosc
  }

  const ryzyko = Math.abs(cenaOdniesienia - stopLoss)
  if (!Number.isFinite(ryzyko) || ryzyko <= 0) {
    return czekaj(['Nie udało się wyznaczyć sensownego stop lossa.'], wynik, zgodnosc, rezim)
  }

  // Wejście: rynkowe albo limit na retest EMA21 interwału bazowego, gdy cena uciekła.
  const c = zamkniecia(swieceBazowe)
  const e21 = ostatnia(ema(c, 21))
  const odlegloscOdEma = Number.isFinite(e21) ? Math.abs(cenaOdniesienia - e21) : 0
  const retest = Number.isFinite(e21) && odlegloscOdEma > wartoscAtr * 1.2
  const cenaWejscia = retest
    ? kierunek === 'long'
      ? Math.max(e21, stopLoss + ryzyko * 0.35)
      : Math.min(e21, stopLoss - ryzyko * 0.35)
    : cenaOdniesienia
  const typWejscia = retest
    ? `limit na retest EMA21 ${p.interwalBazowy}`
    : 'rynek (cena w strefie wejścia)'
  const polSzerokosci = wartoscAtr * 0.18
  const zakresWejscia: [number, number] = [
    cenaWejscia - polSzerokosci,
    cenaWejscia + polSzerokosci,
  ]

  const ryzykoOdWejscia = Math.abs(cenaWejscia - stopLoss)

  // Cele: wielokrotności R, ale TP3 przyciągany do realnego poziomu, jeśli jest blisko.
  const znak = kierunek === 'long' ? 1 : -1
  const surowe = p.celeR.map((r) => cenaWejscia + znak * ryzykoOdWejscia * r)
  const poziomDocelowy =
    kierunek === 'long'
      ? najblizszyOpor(poziomyBazowe, surowe[1])
      : najblizszeWsparcie(poziomyBazowe, surowe[1])
  if (poziomDocelowy) {
    const kandydat = poziomDocelowy.cena
    const rKandydata = (znak * (kandydat - cenaWejscia)) / ryzykoOdWejscia
    // TP3 przyciągamy do realnego poziomu tylko wtedy, gdy leży wyraźnie dalej
    // niż TP2. Bez tego marginesu poziom tuż nad TP2 robił z nich bliźniaki
    // (np. TP2 1,8R i TP3 1,9R), co nie daje żadnej dodatkowej informacji.
    if (rKandydata > p.celeR[1] * 1.25 && rKandydata < p.celeR[2] * 1.6) surowe[2] = kandydat
  }

  const cele: Cel[] = surowe.map((cenaCelu, i) => ({
    poziom: (i + 1) as 1 | 2 | 3,
    cena: cenaCelu,
    procent: ((cenaCelu - cenaWejscia) / cenaWejscia) * 100 * znak,
    r: (znak * (cenaCelu - cenaWejscia)) / ryzykoOdWejscia,
    osiagniety: false,
    czasOsiagniecia: null,
  }))

  const rr = cele[1].r // R:R liczone do TP2 – realistyczny cel częściowego zamknięcia
  if (rr < p.minRR) {
    const powod = `Stosunek zysku do ryzyka ${rr.toFixed(2)} jest poniżej wymaganego ${p.minRR} – nie warto wchodzić.`
    if (!naZadanie) return czekaj([powod], wynik, zgodnosc, rezim)
    brakiDoStandardu.push(powod)
  }

  // --- pewność ------------------------------------------------------------
  const atrSeria = liczAtr(swieceBazowe, 14)
  const percAtr = percentyl(atrSeria.filter(Number.isFinite), 200)
  let pewnosc = Math.abs(wynik)
  pewnosc *= 0.6 + 0.1 * zgodnosc // zgodność interwałów 0–4
  pewnosc *= rezim === 'trend' ? 1.08 : rezim === 'zakres' ? 0.94 : 1
  if (Number.isFinite(percAtr) && percAtr > 80) pewnosc *= 0.85
  pewnosc *= ogranicz(0.85 + (rr - p.minRR) * 0.1, 0.85, 1.15)

  const podwyzszoneRyzyko = kontekst.ryzykoNewsow.wysokie
  if (podwyzszoneRyzyko) pewnosc *= 0.5
  pewnosc = ogranicz(Math.round(pewnosc), 1, 97)

  // --- dźwignia -----------------------------------------------------------
  const odlegloscSlProc = (ryzykoOdWejscia / cenaWejscia) * 100
  // Likwidacja ma wypaść dalej niż stop loss – stąd współczynnik bezpieczeństwa 1,8.
  const maksDzwignia = ogranicz(Math.floor(100 / (odlegloscSlProc * 1.8)), 1, p.maksDzwignia)

  // --- uzasadnienie -------------------------------------------------------
  const wszystkieSkladniki = oceny.flatMap((o) => o.skladniki.map((s) => ({ ...s, interwal: o.interwal })))
  const zgodneZKierunkiem = wszystkieSkladniki
    .filter((s) => (kierunek === 'long' ? s.wynik > 25 : s.wynik < -25))
    .sort((a, b) => Math.abs(b.wynik) * b.waga - Math.abs(a.wynik) * a.waga)
    .slice(0, 4)

  const uzasadnienie = zgodneZKierunkiem.map((s) => s.opis)
  const istotneModyfikatory = modyfikatory
    .filter((m) => Math.abs(m.wplyw) > 4 || m.etykieta === 'Open Interest')
    .slice(0, 2)
  for (const m of istotneModyfikatory) uzasadnienie.push(m.opis)

  if (uzasadnienie.length === 0) {
    uzasadnienie.push(
      `Przewaga wynika z sumy wielu drobnych przesłanek (wynik ${wynik.toFixed(0)}), bez jednego dominującego sygnału.`,
    )
  }
  uzasadnienie.push(
    `Zgodność interwałów: ${zgodnosc}/${oceny.length}, reżim rynku: ${
      rezim === 'trend' ? 'trend (ADX ' + ocenaBazowa.adx.toFixed(0) + ')' : rezim === 'zakres' ? 'konsolidacja' : 'przejściowy'
    }.`,
  )

  // --- unieważnienie ------------------------------------------------------
  const poziomUniewaznienia =
    kierunek === 'long' ? stopLoss + ryzykoOdWejscia * 0.08 : stopLoss - ryzykoOdWejscia * 0.08
  const uniewaznienie = {
    cena: poziomUniewaznienia,
    opis: `Sygnał traci ważność, gdy świeca ${p.interwalBazowy} zamknie się ${
      kierunek === 'long' ? 'poniżej' : 'powyżej'
    } ${poziomUniewaznienia.toFixed(0)} USDT.`,
  }

  const sygnal: Sygnal = {
    id: `${horyzont}-${kierunek}-${naZadanie ? 'zad-' : ''}${teraz}`,
    horyzont,
    kierunek,
    utworzony: teraz,
    cenaOdniesienia,
    wejscie: cenaWejscia,
    zakresWejscia,
    typWejscia,
    stopLoss,
    odlegloscSlProc,
    cele,
    rr,
    pewnosc,
    maksDzwignia,
    uniewaznienie,
    uzasadnienie,
    wynik,
    zgodnosc,
    rezim,
    atr: wartoscAtr,
    interwalBazowy: p.interwalBazowy,
    oceny,
    modyfikatory,
    podwyzszoneRyzyko,
    powodRyzyka: kontekst.ryzykoNewsow.powod,
    wygasa: teraz + p.waznoscGodzin * 3_600_000,
    status: 'aktywny',
    zdarzenia: [
      {
        czas: teraz,
        typ: 'utworzony',
        cena: cenaOdniesienia,
        opis: naZadanie
          ? `Sygnał ${kierunek.toUpperCase()} (${p.nazwa.toLowerCase()}) pokazany na żądanie przy ${cenaOdniesienia.toFixed(0)} USDT.`
          : `Sygnał ${kierunek.toUpperCase()} (${p.nazwa.toLowerCase()}) wystawiony przy ${cenaOdniesienia.toFixed(0)} USDT.`,
      },
    ],
    wynikR: null,
    zamkniety: null,
    naZadanie,
    brakiDoStandardu,
  }

  return sygnal
}

/** Analiza dla wielu horyzontów naraz. */
export function analizujWiele(
  horyzonty: Horyzont[],
  swieceWg: SwieceWgInterwalu,
  kontekst: KontekstRynku,
  poprzednie: Partial<Record<Horyzont, { kierunek: 'long' | 'short'; utworzony: number } | null>> = {},
  teraz?: number,
): Record<string, WynikAnalizy> {
  const out: Record<string, WynikAnalizy> = {}
  for (const h of horyzonty) {
    out[h] = analizuj({
      horyzont: h,
      swieceWg,
      kontekst,
      teraz,
      poprzedniSygnal: poprzednie[h] ?? null,
    })
  }
  return out
}
