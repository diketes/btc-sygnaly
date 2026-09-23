# BTC Sygnały

Aplikacja mobilna do analizy Bitcoina: cena i wykresy na żywo, sygnały long/short
z konkretnymi poziomami oraz newsy, które realnie potrafią ruszyć kursem.
Android i iPhone, cały interfejs po polsku.

> **To nie jest porada inwestycyjna.** Handel BTC z dźwignią wiąże się z ryzykiem
> utraty całego kapitału. Sygnały to wynik analizy technicznej i danych publicznych —
> nie przewidują przyszłości, a skuteczność historyczna niczego nie gwarantuje.

## Pobierz

| Urządzenie | Link | Co zrobić |
| ---------- | ---- | --------- |
| **Android** | [**btc-sygnaly.apk**](https://github.com/diketes/btc-sygnaly/releases/latest/download/btc-sygnaly.apk) | Otwórz plik na telefonie i zainstaluj. Android poprosi o zgodę na instalację z nieznanych źródeł. |
| **iPhone** | [**diketes.github.io/btc-sygnaly**](https://diketes.github.io/btc-sygnaly/) | Otwórz w **Safari**, potem *Udostępnij → Dodaj do ekranu początkowego*. |
| Przeglądarka | [diketes.github.io/btc-sygnaly](https://diketes.github.io/btc-sygnaly/) | Działa też po prostu w oknie przeglądarki. |

Wszystkie [wydania](https://github.com/diketes/btc-sygnaly/releases) · aktualizacje APK
budują się automatycznie po każdej zmianie w kodzie.

---

## Dwa horyzonty, do wyboru

Rdzeń aplikacji: te same dane, ale **dwie różne gry**, liczone niezależnie.
Przełącznik jest na każdym ekranie — możesz śledzić jeden horyzont albo oba naraz.

|                        | **Krótki termin** (intraday/scalp) | **Długi termin** (swing/pozycja) |
| ---------------------- | ---------------------------------- | -------------------------------- |
| Interwały              | 5m, 15m, 1h, 4h                    | 4h, 1D, 3D, 1W                   |
| Sygnał wystawiany na   | 15m                                | 1D                               |
| Czas trwania pozycji   | kilka godzin – 2 dni               | 2 tygodnie – 3 miesiące          |
| Stop loss              | 1,1 × ATR                          | 2,6 × ATR                        |
| Cele                   | 1R / 1,8R / 3R                     | 1,5R / 3R / 5R                   |
| Min. zysk do ryzyka    | 1,5                                | 2,0                              |
| Maks. dźwignia         | 20×                                | 5×                               |
| Co waży najmocniej     | momentum, VWAP, funding, likwidacje | trend, Ichimoku, struktura, nastroje |

Wybór horyzontu zmienia **wszystko**: które interwały są analizowane, jak szeroki
jest stop, jak daleko sięgają cele, jak długo żyje sygnał i jak mocno liczą się
dane z rynku terminowego.

## Co dokładnie pokazuje sygnał

- kierunek **LONG / SHORT / CZEKAJ** (przy braku przewagi aplikacja mówi wprost, czego brakuje),
- **wejście** — cena rynkowa albo limit na retest EMA21,
- **stop loss** z odległością w procentach,
- **TP1 / TP2 / TP3** z procentem i wielokrotnością ryzyka (R),
- **stosunek zysku do ryzyka** — poniżej progu profilu sygnał w ogóle nie powstaje,
- **pewność 0–97%** (nigdy 100 — to nie byłoby uczciwe),
- **maksymalną bezpieczną dźwignię** taką, by likwidacja wypadła dalej niż stop loss,
- **poziom unieważnienia** z opisem,
- **uzasadnienie po polsku** — konkretne przesłanki, nie ogólniki,
- ocenę każdego interwału z osobna i kontekst rynkowy (funding, likwidacje, nastroje).

Po trafieniu TP1 stop automatycznie przesuwa się na próg rentowności.

## Szybki start

```bash
npm install
npm run dev          # http://localhost:5180
```

Wymagania: Node 20 lub nowszy.

## Polecenia

| Polecenie                  | Co robi                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `npm run dev`              | serwer deweloperski                                          |
| `npm run build`            | sprawdzenie typów + wersja produkcyjna do `dist/`            |
| `npm test`                 | testy jednostkowe (wskaźniki, silnik, deduplikacja, scalanie) |
| `npm run test:api`         | sprawdza, czy wszystkie źródła danych odpowiadają            |
| `npm run test:dedup`       | deduplikacja na 200 newsach z 60 celowymi powtórkami         |
| `npm run test:reconnect`   | wznowienie połączenia i uzupełnianie luk w świecach          |
| `npm run backtest`         | backtest silnika na realnych danych z Binance                |
| `npm run sprawdz`          | wszystkie kontrole naraz                                     |
| `npm run sprawdz:app`      | klika przez aplikację w przeglądarce i robi zrzuty           |
| `npm run apk`              | buduje APK (wymaga JDK 17+ i Android SDK)                    |

Backtest przyjmuje argumenty: `npm run backtest -- dlugi 4` (horyzont i liczba lat).

## Instalacja na telefonie

### Android

Najprościej: pobierz gotowy plik —
[**btc-sygnaly.apk**](https://github.com/diketes/btc-sygnaly/releases/latest/download/btc-sygnaly.apk).
Buduje się automatycznie przy każdej zmianie w kodzie
(workflow `.github/workflows/android.yml`) i ląduje w [wydaniach](https://github.com/diketes/btc-sygnaly/releases).

Budowanie u siebie wymaga **JDK 17+** i **Android SDK** (najprościej: zainstaluj
Android Studio i uruchom je raz):

```bash
npm run apk
# APK ląduje w dist-apk/btc-sygnaly-debug.apk
adb install -r dist-apk/btc-sygnaly-debug.apk
```

`npm run apk` najpierw sprawdza, czego brakuje, i mówi to po polsku, zamiast sypać
błędami Gradle.

### iPhone

**Sposób pierwszy (polecany) — PWA.** Nie wymaga Maca, konta Apple, kabla ani
odświeżania co tydzień.

1. Otwórz [diketes.github.io/btc-sygnaly](https://diketes.github.io/btc-sygnaly/)
   w **Safari** (musi być Safari — Chrome na iOS nie potrafi dodać aplikacji do ekranu).
2. Naciśnij **Udostępnij** (kwadrat ze strzałką) → **Dodaj do ekranu początkowego**.

Aplikacja działa wtedy pełnoekranowo, z własną ikoną i trybem offline — wygląda
i zachowuje się jak zwykła aplikacja.

**Sposób drugi — niepodpisany IPA.** Workflow `.github/workflows/ios.yml`
(uruchamiany ręcznie albo tagiem `v*`) buduje `.ipa` na maszynie macOS GitHuba.
Plik wgrywasz przez AltStore lub Sideloadly. Uwaga: przy darmowym certyfikacie
Apple aplikacja wygasa po 7 dniach i trzeba ją odświeżyć — dlatego PWA jest
wygodniejsza dla większości osób.

## Skąd biorą się dane

Wszystko z publicznych API, **bez kluczy i bez zakładania kont**.

**Cena i świece** — Binance (główne źródło), a przy awarii automatycznie Bybit → OKX
→ Kraken → Coinbase. Na żywo leci WebSocket ze świecami, tickerem, księgą zleceń
i strumieniem likwidacji; po zerwaniu połączenia brakujące świece są dociągane
REST-em i scalane, żeby na wykresie nie powstała dziura.

**Rynek terminowy** — funding rate, open interest, long/short ratio kont, taker
buy/sell, likwidacje na żywo (wszystko z Binance Futures).

**Nastroje i kontekst** — indeks strachu i chciwości (alternative.me), dominacja BTC
i kapitalizacja rynku (CoinGecko), dane sieci Bitcoin: wysokość bloku, opłaty,
hashrate (mempool.space).

**Newsy** — CoinDesk, Cointelegraph, The Block, Decrypt, Bitcoin Magazine, CryptoSlate,
Bitcoinist, NewsBTC oraz Google News po polsku i po angielsku.

**Kalendarz makro** — darmowy kanał Forex Factory (CPI, FOMC, NFP i podobne).
Gdy nie odpowiada, aplikacja pokazuje terminy wyliczone regułą i **wyraźnie oznacza
je jako orientacyjne** — nie podaje zmyślonych dat jako pewnych.

## Deduplikacja newsów

Ten sam news nigdy nie pojawia się dwa razy — ani na liście, ani w powiadomieniach.
Działa to warstwowo; pierwsza warstwa, która trafi, kończy sprawę:

1. **Kanonizacja adresu** — bez `utm_*`, `fbclid`, wariantów AMP i opakowań Google News.
2. **SHA-256 z kanonicznego URL** — dokładny duplikat odpada natychmiast.
3. **Normalizacja tytułu** — bez diakrytyków, interpunkcji, stopwordów i nazwy serwisu,
   plus lekki stemmer (polski odmienia przez końcówki, więc bez tego „zatwierdza”
   i „zatwierdziła” byłyby dwoma różnymi tokenami).
4. **SimHash 64-bit** z 3-gramów słów, indeksowany metodą LSH — odległość Hamminga ≤ 6.
5. **Podobieństwo Jaccarda** ≥ 0,6 w oknie 48 godzin — łapie przepisane tytuły.

Duplikaty nie znikają: dołączają do klastra jako kolejne źródło tej samej historii.
Karta pokazuje wtedy „potwierdzone przez 5 źródeł”, a więcej źródeł podnosi ocenę
wiarygodności. Powiadomienie wychodzi **raz na klaster** i nigdy się nie powtarza,
nawet gdy dojdzie dziesięć kolejnych serwisów.

Wynik testu na 200 pozycjach zawierających 160 powtórek: **100% wykrycia, zero
błędnych sklejeń** (`npm run test:dedup`).

## Ocena wpływu newsa

Każdy klaster dostaje kategorię (regulacje, ETF, makro, on-chain, bezpieczeństwo,
adopcja, technologia, górnicy, opinia), wydźwięk od −5 do +5 i siłę oddziaływania
1–10. Siła zależy od wagi kategorii, wiarygodności źródła, liczby źródeł w klastrze
i świeżości. Sekcja **„Co może ruszyć BTC”** pokazuje pozycje o wpływie ≥ 7 z ostatniej
doby razem z odliczaniem do najbliższych wydarzeń makro.

Świeży news o wpływie ≥ 8 albo wydarzenie makro w ciągu 2 godzin **obniża pewność
sygnału o połowę** i oznacza go etykietą „PODWYŻSZONE RYZYKO”.

### Streszczenia newsów anglojęzycznych

Ocena działa na regułach i słownikach — bez modelu językowego, więc bez klucza API
i bez wysyłania czegokolwiek na zewnątrz. Konsekwencja: przy newsie po angielsku
aplikacja **nie tłumaczy tekstu**, tylko opisuje po polsku, co w nim wykryła
(kategoria, podmioty, kwoty, wydźwięk), i zostawia oryginalny tytuł. Karta mówi
to wprost. To uczciwsze niż udawanie tłumaczenia.

## Jak liczony jest sygnał

1. Każdy interwał oceniany osobno — jedenaście składników (układ EMA, trend wyższego
   rzędu, MACD, RSI z dywergencjami, Stoch RSI, Bollinger, VWAP, Ichimoku, struktura
   HH/HL, poziomy S/R, wolumen/OBV), każdy w skali −100…+100.
2. Wagi składników zależą od **reżimu rynku**: w trendzie (ADX > 25) liczą się
   średnie i momentum, w konsolidacji (ADX < 20) oscylatory i krawędzie zakresu.
3. Oceny interwałów składane są wagami profilu horyzontu.
4. Na wynik nakładane są modyfikatory rynkowe: funding, long/short ratio, kaskady
   likwidacji, indeks strachu i chciwości, zmiana open interest.
5. Sygnał powstaje tylko, gdy wynik przekroczy próg, zgodność interwałów jest
   wystarczająca, stosunek zysku do ryzyka mieści się w wymaganiach i nie trwa
   blokada po poprzednim sygnale.

Silnik jest **czystą funkcją** — to samo wejście zawsze daje to samo wyjście.
Dzięki temu backtest liczy dokładnie tak samo jak aplikacja.

## Wyniki backtestu

Na realnych danych z Binance, wejścia limitowe rozliczane tylko wtedy, gdy cena
faktycznie wróciła na poziom zlecenia, jedna otwarta pozycja naraz, stop sprawdzany
przed celem w obrębie tej samej świecy:

| Horyzont | Okres  | Transakcji | Skuteczność | Średnie R | Profit factor | Maks. obsunięcie |
| -------- | ------ | ---------- | ----------- | --------- | ------------- | ---------------- |
| Długi    | 4 lata | 23 (6/rok) | 47,8%       | +0,33     | 1,81          | 7,0%             |
| Krótki   | 120 dni | 68 (207/rok) | 29,4%     | +0,27     | 1,66          | 7,0%             |

**Jak to czytać.** Przy krótkim terminie niska skuteczność nie oznacza strat: 56%
pozycji sięga TP1, po czym stop idzie na próg rentowności, więc duża część
„nietrafionych” to wyjścia na zero, a nie straty. Próba dla długiego horyzontu
(23 transakcje) jest mała i statystycznie niepewna — przy pozycjach trzymanych
tygodniami więcej się w cztery lata nie zmieści. Okres testu obejmował głównie
rynek wzrostowy, więc wyniki po stronie long są zawyżone względem pełnego cyklu.
Backtest nie uwzględnia prowizji, poślizgu ani kosztu fundingu.

Powtórz u siebie: `npm run backtest`.

## Co widać na ekranach

- **Pulpit** — cena z przewijanymi cyframi, przełącznik horyzontu, karty sygnałów,
  wskaźnik strachu i chciwości, likwidacje, najważniejsze newsy.
- **Wykres** — świece z lightweight-charts, sześć interwałów, dziewięć wskaźników do
  włączenia, poziomy S/R i Fibonacciego, znaczniki wejścia/SL/TP aktywnego sygnału,
  panel RSI / MACD / Stoch pod spodem.
- **Sygnały** — aktywne, pełna historia (także przegrane) i statystyki skuteczności
  z krzywą kapitału oraz rozbiciem na horyzont, kierunek, pewność i reżim rynku.
- **Newsy** — „Co może ruszyć BTC”, kalendarz makro z odliczaniem, filtry kategorii,
  karty klastrów z listą źródeł.
- **Rynek** — funding z historią, open interest, pozycjonowanie, likwidacje na żywo,
  dominacja BTC, dane sieci Bitcoin; w zakładce Narzędzia kalkulator pozycji i alerty.
- **Ustawienia** — horyzont, progi powiadomień, cisza nocna, źródła danych, kanały
  newsowe, tryb oszczędzania baterii, kasowanie danych.

## Wygląd i efekty

Czerń OLED, szkło z rozmyciem, neonowe akcenty. Animacje na sprężynach (Framer
Motion), nie na krzywych czasowych:

- tło na canvasie, którego **tempo i barwa zależą od realnej zmienności** (ATR)
  i kierunku ostatniej godziny,
- cząsteczki przy nowym sygnale, konfetti przy trafionym celu, wstrząśnięcie przy stopie,
- przewijane cyfry ceny z błyskiem tła na tick,
- pull-to-refresh z gumowym tłumieniem,
- pływające pigułki pod aktywnymi zakładkami,
- wibracje (haptyka) przy sygnałach i celach.

Wszystko szanuje systemowe `prefers-reduced-motion` oraz przełącznik **„Oszczędzaj
baterię”**, który wyłącza canvas i żyroskop. Animowane są wyłącznie `transform`
i `opacity`, a pętle canvasa zasypiają, gdy aplikacja schodzi w tło.

## Dane lokalne

Wszystko zostaje na urządzeniu — IndexedDB przez Dexie. Żadnych kont, logowania ani
chmury. Aplikacja działa offline na ostatnich zapisanych danych i pokazuje wtedy
plakietkę z wiekiem tych danych.

Tabele: świece (per interwał), sygnały, klastry newsów, indeks deduplikacji,
alerty, ustawienia, migawka rynku. Wpisy indeksu starsze niż 30 dni czyszczą się
przy starcie.

> Uwaga projektowa: pierwotnie planowany był SQLite natywnie z IndexedDB jako zapas.
> Został sam IndexedDB — działa identycznie w WebView Androida, w Safari na iPhonie
> i w PWA, więc jedna ścieżka kodu zamiast dwóch, przy tych samych możliwościach.

## CORS, czyli dlaczego newsy działają inaczej w przeglądarce

Kanały RSS i kalendarz makro nie wystawiają nagłówków CORS.

- **Natywnie (Android/iOS)** — `CapacitorHttp` pobiera je wprost, poza WebView.
  Żadnych pośredników.
- **W trybie deweloperskim** — pobiera je serwer Vite (`/proxy/pobierz`).
- **W wersji PWA** — idą przez publiczne proxy (allorigins, codetabs i kolejne
  z listy). Te bywają przeciążone i odpowiadają błędem; aplikacja próbuje kolejnych
  i zapamiętuje to, które zadziałało. Jeśli w PWA newsy się nie ładują, a na
  Androidzie tak — to jest właśnie ta różnica.

## Struktura projektu

```
src/
  analiza/       wskaźniki, struktura rynku, profile horyzontów, silnik sygnałów,
                 cykl życia sygnału, statystyki, Web Worker
  dane/          giełdy (z przełączaniem), WebSocket, scalanie świec, baza lokalna,
                 newsy (źródła, RSS, deduplikacja, ocena, kalendarz)
  stan/          sklepy Zustand: rynek, sygnały, newsy, ustawienia
  ui/            komponenty: cena, karta sygnału, przełącznik horyzontu, tło,
                 cząsteczki, powłoka
  ekrany/        Pulpit, Wykres, Sygnały, Newsy, Rynek, Ustawienia, Powitanie
  lib/           warstwa sieciowa, formatowanie, powiadomienia i haptyka
scripts/         testy API, deduplikacji, wznowienia połączenia, backtest,
                 generator ikon, budowanie APK, test aplikacji w przeglądarce
```

Cała matematyka (wskaźniki, silnik) liczy się w **Web Workerze**, żeby główny wątek
został przy animacjach. Gdy worker jest niedostępny, obliczenia lecą na głównym
wątku — aplikacja działa dalej, tylko animacje mogą zamrugać.

## Czego aplikacja nie robi

- nie łączy się z Twoim kontem giełdowym i nie składa zleceń — jest **wyłącznie
  analityczna**,
- nie wysyła nigdzie Twoich danych,
- nie używa płatnych API,
- nie wstawia danych przykładowych: gdy źródło milczy, pokazuje „brak danych”,
  a nie wymyśloną liczbę.
