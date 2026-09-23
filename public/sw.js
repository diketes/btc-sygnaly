/**
 * Service worker aplikacji BTC Sygnały.
 *
 * Powłoka aplikacji (HTML, JS, CSS, ikony) trzymana jest na stałe, żeby
 * aplikacja otwierała się offline. Zapytania do API NIE są cache'owane –
 * nieświeża cena byłaby gorsza niż jej brak; od pokazywania ostatnich znanych
 * danych jest baza lokalna, która wie, kiedy je zapisano.
 */

// Podmieniane przy budowaniu na faktyczną wersję (patrz vite.config.ts).
// Zmiana nazwy pamięci podręcznej wymusza sprzątnięcie poprzedniej przy
// aktywacji nowego service workera.
const WERSJA = 'btc-sygnaly-__WERSJA_SW__'
const POWLOKA = [
  './',
  './index.html',
  './manifest.webmanifest',
  './ikony/ikona-192.png',
  './ikony/ikona-512.png',
]

self.addEventListener('install', (zdarzenie) => {
  // Bez skipWaiting() – nowa wersja czeka, aż aplikacja sama o to poprosi.
  // Dzięki temu użytkownik nie traci stanu ekranu w trakcie korzystania,
  // tylko dostaje pasek „Nowa wersja gotowa” i decyduje, kiedy przeładować.
  zdarzenie.waitUntil(
    caches
      .open(WERSJA)
      .then((magazyn) => magazyn.addAll(POWLOKA))
      .catch(() => undefined),
  )
})

// Aplikacja prosi o natychmiastowe przejęcie kontroli (przycisk „Odśwież”).
self.addEventListener('message', (zdarzenie) => {
  if (zdarzenie.data && zdarzenie.data.typ === 'PRZEJMIJ') {
    void self.skipWaiting()
  }
})

self.addEventListener('activate', (zdarzenie) => {
  zdarzenie.waitUntil(
    caches
      .keys()
      .then((klucze) => Promise.all(klucze.filter((k) => k !== WERSJA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Adresy, których nigdy nie zapisujemy w pamięci podręcznej. */
function czyDaneNaZywo(url) {
  return /(?:binance|bybit|okx|kraken|coinbase|coingecko|alternative\.me|mempool\.space|allorigins|corsproxy|codetabs|faireconomy|news\.google)/i.test(
    url,
  )
}

self.addEventListener('fetch', (zdarzenie) => {
  const zadanie = zdarzenie.request
  if (zadanie.method !== 'GET') return
  if (czyDaneNaZywo(zadanie.url)) return

  const url = new URL(zadanie.url)
  if (url.origin !== self.location.origin) return

  // Nawigacja: najpierw sieć, przy braku – zapisana powłoka.
  if (zadanie.mode === 'navigate') {
    zdarzenie.respondWith(
      fetch(zadanie).catch(() => caches.match('./index.html').then((o) => o ?? Response.error())),
    )
    return
  }

  // Zasoby: najpierw pamięć podręczna, w tle dociągamy świeższą wersję.
  zdarzenie.respondWith(
    caches.match(zadanie).then((zapisane) => {
      const zSieci = fetch(zadanie)
        .then((odpowiedz) => {
          if (odpowiedz.ok) {
            const kopia = odpowiedz.clone()
            void caches.open(WERSJA).then((magazyn) => magazyn.put(zadanie, kopia))
          }
          return odpowiedz
        })
        .catch(() => zapisane ?? Response.error())
      return zapisane ?? zSieci
    }),
  )
})
