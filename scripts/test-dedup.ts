/**
 * Test deduplikacji na skalę: 200 pozycji, w tym 60 celowych powtórek.
 *
 * Wymagania (z założeń projektu):
 *  • wykrycie co najmniej 95% duplikatów,
 *  • nie więcej niż 2% fałszywych trafień (różne historie sklejone w jedną).
 *
 * Uruchomienie: npm run test:dedup
 */

import {
  IndeksDeduplikacji,
  przetworzPartie,
  type Klaster,
  type SurowyNews,
} from '../src/dane/newsy/dedup'
import { kolor } from './wspolne'

const DZIEN = 86_400_000
const BAZA = Date.UTC(2026, 8, 20, 12)

/** 40 różnych, realistycznych historii o Bitcoinie. */
const HISTORIE: { tytul: string; opis: string }[] = [
  { tytul: 'SEC zatwierdza spotowy ETF na Bitcoina po latach odmów', opis: 'Decyzja otwiera drogę instytucjom.' },
  { tytul: 'Fed obniża stopy procentowe o 25 punktów bazowych', opis: 'Rynki reagują wzrostami.' },
  { tytul: 'Wieloryb przenosi 12 000 BTC na giełdę Binance', opis: 'Największy transfer od miesięcy.' },
  { tytul: 'Hashrate sieci Bitcoin bije rekord wszech czasów', opis: 'Moc obliczeniowa rośnie mimo spadku ceny.' },
  { tytul: 'MicroStrategy kupuje kolejne 5000 bitcoinów za 420 milionów dolarów', opis: 'Firma powiększa zasoby.' },
  { tytul: 'Giełda kryptowalut traci 200 milionów dolarów po włamaniu', opis: 'Środki użytkowników zabezpieczone.' },
  { tytul: 'Inflacja CPI w USA spadła poniżej oczekiwań analityków', opis: 'Odczyt niższy od prognoz.' },
  { tytul: 'Salwador zwiększa rezerwy bitcoina o kolejne 200 monet', opis: 'Kraj kontynuuje zakupy.' },
  { tytul: 'BlackRock notuje rekordowe napływy do funduszu bitcoinowego', opis: 'Ponad miliard dolarów w tydzień.' },
  { tytul: 'Chiny ponownie zaostrzają przepisy wobec kryptowalut', opis: 'Nowe regulacje dla giełd.' },
  { tytul: 'Górnicy sprzedają rezerwy po spadku opłacalności wydobycia', opis: 'Presja podażowa rośnie.' },
  { tytul: 'Lightning Network przekracza 6000 bitcoinów pojemności', opis: 'Sieć druga warstwa rośnie.' },
  { tytul: 'Analityk przewiduje wzrost bitcoina do 150 tysięcy dolarów', opis: 'Prognoza na przyszły rok.' },
  { tytul: 'Parlament Europejski przyjmuje nowe przepisy MiCA dla kryptowalut', opis: 'Regulacje wchodzą w życie.' },
  { tytul: 'Rezerwy bitcoina na giełdach spadają do najniższego poziomu od lat', opis: 'Inwestorzy wypłacają monety.' },
  { tytul: 'PayPal rozszerza obsługę płatności bitcoinem na kolejne kraje', opis: 'Usługa dostępna w Europie.' },
  { tytul: 'Trudność wydobycia bitcoina rośnie o 5 procent', opis: 'Kolejna korekta w górę.' },
  { tytul: 'Sąd oddala pozew przeciwko dużej giełdzie kryptowalut', opis: 'Wyrok korzystny dla branży.' },
  { tytul: 'Open interest na kontraktach bitcoina osiąga 40 miliardów dolarów', opis: 'Rekordowe zaangażowanie.' },
  { tytul: 'Kaskada likwidacji wymazuje 800 milionów dolarów w godzinę', opis: 'Gwałtowny ruch ceny.' },
  { tytul: 'Bank centralny Japonii utrzymuje stopy bez zmian', opis: 'Decyzja zgodna z oczekiwaniami.' },
  { tytul: 'Nowa propozycja ulepszenia protokołu Bitcoin trafia do konsultacji', opis: 'Deweloperzy dyskutują zmianę.' },
  { tytul: 'Fundusz emerytalny ujawnia pozycję w bitcoinie', opis: 'Instytucja wchodzi na rynek.' },
  { tytul: 'Opłaty transakcyjne w sieci Bitcoin spadają do minimum', opis: 'Mempool pustoszeje.' },
  { tytul: 'Indeks strachu i chciwości wskazuje skrajny strach', opis: 'Nastroje na rynku fatalne.' },
  { tytul: 'Argentyna rozważa uznanie bitcoina za legalny środek płatniczy', opis: 'Rząd analizuje możliwość.' },
  { tytul: 'Producent koparek ogłasza nową generację układów ASIC', opis: 'Wydajność wyższa o 30 procent.' },
  { tytul: 'Dominacja bitcoina przekracza 60 procent kapitalizacji rynku', opis: 'Altcoiny tracą udział.' },
  { tytul: 'Raport wskazuje na rosnącą adopcję bitcoina w Afryce', opis: 'Wzrost liczby użytkowników.' },
  { tytul: 'Giełda uruchamia handel kontraktami na bitcoina w Europie', opis: 'Nowy produkt dla klientów.' },
  { tytul: 'Znany inwestor ostrzega przed bańką na rynku kryptowalut', opis: 'Krytyczna opinia.' },
  { tytul: 'Sieć Bitcoin przetwarza rekordową liczbę transakcji dziennie', opis: 'Aktywność rośnie.' },
  { tytul: 'Departament Skarbu USA publikuje wytyczne dla giełd kryptowalut', opis: 'Nowe obowiązki raportowe.' },
  { tytul: 'Fundusz ETF odnotowuje największy odpływ środków w historii', opis: 'Inwestorzy wycofują kapitał.' },
  { tytul: 'Halving bitcoina odbędzie się wcześniej niż zakładano', opis: 'Bloki wydobywane szybciej.' },
  { tytul: 'Firma płatnicza integruje bitcoina z systemem kasowym', opis: 'Sklepy przyjmą płatności.' },
  { tytul: 'Badanie pokazuje wzrost zainteresowania bitcoinem wśród młodych', opis: 'Nowe pokolenie inwestorów.' },
  { tytul: 'Awaria dużej giełdy uniemożliwia handel przez dwie godziny', opis: 'Użytkownicy zgłaszają problemy.' },
  { tytul: 'Norweski fundusz państwowy zwiększa pośrednią ekspozycję na bitcoina', opis: 'Poprzez akcje spółek.' },
  { tytul: 'Ekonomista wiąże wzrost bitcoina ze słabnącym dolarem', opis: 'Analiza korelacji walut.' },
]

const SERWISY = [
  'CoinDesk',
  'Cointelegraph',
  'The Block',
  'Decrypt',
  'Bitcoin Magazine',
  'CryptoSlate',
  'Bitcoinist',
]

/** Przerabia tytuł tak, jak zrobiłby to inny serwis opisujący tę samą historię. */
function przepisz(tytul: string, wariant: number): string {
  const zamiany: [RegExp, string][] = [
    [/zatwierdza/gi, 'zatwierdziła'],
    [/obniża/gi, 'obniżyła'],
    [/przenosi/gi, 'przeniósł'],
    [/bije/gi, 'pobił'],
    [/kupuje/gi, 'kupiła'],
    [/traci/gi, 'straciła'],
    [/spadła/gi, 'spadła nieoczekiwanie'],
    [/zwiększa/gi, 'zwiększył'],
    [/notuje/gi, 'zanotował'],
    [/rośnie/gi, 'wzrosła'],
    [/przekracza/gi, 'przekroczyła'],
    [/osiąga/gi, 'osiągnął'],
    [/przyjmuje/gi, 'przyjął'],
    [/rozszerza/gi, 'rozszerzył'],
    [/wskazuje/gi, 'wskazał'],
    [/ogłasza/gi, 'ogłosił'],
    [/publikuje/gi, 'opublikował'],
    [/uruchamia/gi, 'uruchomiła'],
    [/integruje/gi, 'zintegrowała'],
    [/odbędzie się/gi, 'nastąpi'],
  ]

  let wynik = tytul
  for (const [z, n] of zamiany) wynik = wynik.replace(z, n)

  if (wariant === 1) return wynik
  if (wariant === 2) return `${wynik} — ${SERWISY[0]}`
  // Wariant 3: przestawienie szyku zdania, tak jak robią to agregatory.
  const slowa = wynik.split(' ')
  if (slowa.length > 5) {
    return [...slowa.slice(2), slowa[0], slowa[1]].join(' ')
  }
  return wynik
}

interface Pozycja {
  news: SurowyNews
  /** Indeks historii, do której pozycja naprawdę należy. */
  historia: number
  duplikat: boolean
}

function zbudujZestaw(): Pozycja[] {
  const pozycje: Pozycja[] = []

  // 140 unikalnych pozycji: 40 historii, część serwisów opisuje po kilka.
  let licznik = 0
  for (let i = 0; i < 140; i++) {
    const h = i % HISTORIE.length
    const serwis = SERWISY[i % SERWISY.length]
    pozycje.push({
      historia: h,
      duplikat: i >= HISTORIE.length, // powyżej 40 to kolejne ujęcia tej samej historii
      news: {
        tytul: i < HISTORIE.length ? HISTORIE[h].tytul : przepisz(HISTORIE[h].tytul, (i % 3) + 1),
        opis: HISTORIE[h].opis,
        url: `https://${serwis.toLowerCase().replace(/\s/g, '')}.com/artykul-${licznik++}`,
        zrodlo: serwis,
        data: BAZA + h * 1000 + (i % 7) * 3_600_000,
        jezyk: 'pl',
      },
    })
  }

  // 60 jawnych powtórek: ten sam artykuł z innym adresem albo z parametrami.
  for (let i = 0; i < 60; i++) {
    const zrodlowa = pozycje[i]
    const rodzaj = i % 4
    let url = zrodlowa.news.url
    if (rodzaj === 0) url = `${url}?utm_source=newsletter&utm_campaign=poranny`
    else if (rodzaj === 1) url = `${url}/amp/`
    else if (rodzaj === 2) url = url.replace('https://', 'http://www.')
    else url = `https://news.google.com/rss/articles/xyz${i}?url=${encodeURIComponent(url)}`

    pozycje.push({
      historia: zrodlowa.historia,
      duplikat: true,
      news: {
        ...zrodlowa.news,
        url,
        zrodlo: SERWISY[(i + 3) % SERWISY.length],
        data: zrodlowa.news.data + 1800_000,
      },
    })
  }

  return pozycje
}

// ------------------------------------------------------------------ start

console.log(kolor.gruby('\n=== Test deduplikacji newsów ===\n'))

const zestaw = zbudujZestaw()
const oczekiwaneDuplikaty = zestaw.filter((p) => p.duplikat).length
const liczbaHistorii = new Set(zestaw.map((p) => p.historia)).size

console.log(
  kolor.szary(
    `Zestaw: ${zestaw.length} pozycji, ${liczbaHistorii} prawdziwych historii, ` +
      `${oczekiwaneDuplikaty} pozycji do sklejenia.\n`,
  ),
)

const indeks = new IndeksDeduplikacji()
const klastry = new Map<string, Klaster>()
const wynik = await przetworzPartie(
  zestaw.map((p) => p.news),
  indeks,
  klastry,
)

// --- ile duplikatów faktycznie wykryto ------------------------------------
const wykryte = wynik.odrzucone.url + wynik.odrzucone.simhash + wynik.odrzucone.jaccard
const skutecznosc = (wykryte / oczekiwaneDuplikaty) * 100

// --- fałszywe trafienia: klaster zawierający dwie różne historie ----------
const urlDoHistorii = new Map<string, number>()
for (const p of zestaw) urlDoHistorii.set(p.news.url, p.historia)

let sklejoneBlednie = 0
const przykladySklejen: string[] = []
for (const k of klastry.values()) {
  const historie = new Set(
    k.zrodla.map((z) => urlDoHistorii.get(z.url)).filter((x): x is number => x !== undefined),
  )
  if (historie.size > 1) {
    sklejoneBlednie += historie.size - 1
    if (przykladySklejen.length < 3) {
      przykladySklejen.push(
        `„${k.tytul.slice(0, 60)}” skleiło historie: ${[...historie].join(', ')}`,
      )
    }
  }
}
const falszywe = (sklejoneBlednie / zestaw.length) * 100

// --- raport ---------------------------------------------------------------
const ocena = (ok: boolean, tekst: string) =>
  ok ? `${kolor.zielony('OK  ')} ${tekst}` : `${kolor.czerwony('BŁĄD')} ${tekst}`

console.log(`  Utworzonych klastrów:  ${kolor.gruby(String(klastry.size))} (oczekiwane ${liczbaHistorii})`)
console.log(`  Wykrytych powtórek:    ${wykryte} z ${oczekiwaneDuplikaty}`)
console.log(
  kolor.szary(
    `    po adresie URL:      ${wynik.odrzucone.url}\n` +
      `    po SimHash:          ${wynik.odrzucone.simhash}\n` +
      `    po Jaccardzie:       ${wynik.odrzucone.jaccard}`,
  ),
)
console.log('')
console.log(ocena(skutecznosc >= 95, `wykrywalność ${skutecznosc.toFixed(1)}% (wymagane ≥ 95%)`))
console.log(ocena(falszywe <= 2, `fałszywe sklejenia ${falszywe.toFixed(2)}% (dopuszczalne ≤ 2%)`))
console.log(
  ocena(
    klastry.size <= liczbaHistorii * 1.15,
    `liczba klastrów ${klastry.size} nie odbiega od ${liczbaHistorii} historii`,
  ),
)

if (przykladySklejen.length > 0) {
  console.log(kolor.zolty('\n  Przykłady błędnych sklejeń:'))
  for (const p of przykladySklejen) console.log(kolor.szary(`    ${p}`))
}

// --- powtórne przetworzenie nie może dać nic nowego -----------------------
const drugie = await przetworzPartie(
  zestaw.map((p) => p.news),
  indeks,
  klastry,
)
console.log(
  '\n' +
    ocena(
      drugie.nowe.length === 0,
      `ponowne przetworzenie tej samej partii nie tworzy nowych historii (${drugie.nowe.length})`,
    ),
)

console.log('')
const zdane = skutecznosc >= 95 && falszywe <= 2 && drugie.nowe.length === 0
process.exit(zdane ? 0 : 1)
