#!/usr/bin/env node
/**
 * Sprawdza każde źródło danych używane przez aplikację.
 * Uruchomienie: npm run test:api
 */

import { WebSocket } from 'ws'

const WYNIKI = []
let sukcesy = 0
let porazki = 0

const kolor = {
  zielony: (s) => `\x1b[32m${s}\x1b[0m`,
  czerwony: (s) => `\x1b[31m${s}\x1b[0m`,
  zolty: (s) => `\x1b[33m${s}\x1b[0m`,
  szary: (s) => `\x1b[90m${s}\x1b[0m`,
  gruby: (s) => `\x1b[1m${s}\x1b[0m`,
}

async function sprawdz(nazwa, url, walidator, { krytyczne = true } = {}) {
  const start = Date.now()
  try {
    const kontroler = new AbortController()
    const timeout = setTimeout(() => kontroler.abort(), 20_000)
    const odp = await fetch(url, {
      signal: kontroler.signal,
      headers: { 'User-Agent': 'BTC-Sygnaly/1.0 (test)' },
    })
    clearTimeout(timeout)

    const ms = Date.now() - start
    if (!odp.ok) throw new Error(`HTTP ${odp.status}`)

    const typ = odp.headers.get('content-type') ?? ''
    const dane = typ.includes('json') ? await odp.json() : await odp.text()
    const próbka = walidator(dane)

    console.log(`${kolor.zielony('OK  ')} ${nazwa.padEnd(34)} ${kolor.szary(`${ms} ms`)}  ${próbka}`)
    WYNIKI.push({ nazwa, ok: true, ms })
    sukcesy++
    return dane
  } catch (e) {
    const ms = Date.now() - start
    const etykieta = krytyczne ? kolor.czerwony('BŁĄD') : kolor.zolty('OSTRZ')
    console.log(`${etykieta} ${nazwa.padEnd(34)} ${kolor.szary(`${ms} ms`)}  ${e.message}`)
    WYNIKI.push({ nazwa, ok: false, ms, blad: e.message, krytyczne })
    if (krytyczne) porazki++
    return null
  }
}

function sprawdzWs(nazwa, url, { sekundy = 12, krytyczne = true, ramkiWymagane = true } = {}) {
  return new Promise((resolve) => {
    const start = Date.now()
    let ramki = 0
    let pierwsza = null
    let polaczone = false
    let ws
    try {
      ws = new WebSocket(url)
    } catch (e) {
      console.log(`${kolor.czerwony('BŁĄD')} ${nazwa.padEnd(34)} ${e.message}`)
      porazki++
      return resolve(null)
    }

    let zakonczone = false
    const zakoncz = (ok, info) => {
      if (zakonczone) return
      zakonczone = true
      try {
        ws.close()
      } catch {
        /* i tak kończymy */
      }
      const ms = Date.now() - start
      if (ok) {
        console.log(`${kolor.zielony('OK  ')} ${nazwa.padEnd(34)} ${kolor.szary(`${ms} ms`)}  ${info}`)
        sukcesy++
        WYNIKI.push({ nazwa, ok: true, ms })
      } else {
        const etykieta = krytyczne ? kolor.czerwony('BŁĄD') : kolor.zolty('OSTRZ')
        console.log(`${etykieta} ${nazwa.padEnd(34)} ${kolor.szary(`${ms} ms`)}  ${info}`)
        if (krytyczne) porazki++
        WYNIKI.push({ nazwa, ok: false, ms, blad: info, krytyczne })
      }
      resolve(pierwsza)
    }

    const timer = setTimeout(() => {
      if (ramki > 0) {
        zakoncz(true, `${ramki} ramek w ${sekundy}s`)
      } else if (polaczone && !ramkiWymagane) {
        // Likwidacje są zdarzeniem rzadkim – przy spokojnym rynku ramek po prostu nie ma.
        zakoncz(true, `połączono, brak zdarzeń w ${sekundy}s (spokojny rynek)`)
      } else {
        zakoncz(false, polaczone ? `brak ramek przez ${sekundy}s` : 'nie udało się połączyć')
      }
    }, sekundy * 1000)

    ws.on('open', () => {
      polaczone = true
    })

    ws.on('message', (dane) => {
      ramki++
      if (!pierwsza) {
        try {
          pierwsza = JSON.parse(dane.toString())
        } catch {
          pierwsza = dane.toString().slice(0, 80)
        }
      }
      if (ramki >= 5) {
        clearTimeout(timer)
        zakoncz(true, `${ramki} ramek, pierwsza po ${Date.now() - start} ms`)
      }
    })

    ws.on('error', (e) => {
      clearTimeout(timer)
      zakoncz(false, e.message)
    })
  })
}

const liczba = (x) => Number(x).toLocaleString('pl-PL', { maximumFractionDigits: 2 })

console.log(kolor.gruby('\n=== Cena i świece ===\n'))

await sprawdz(
  'Binance – świece 1h',
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=5',
  (d) => `${d.length} świec, ostatnie zamknięcie ${liczba(d.at(-1)[4])} USDT`,
)

await sprawdz(
  'Binance – świece 1d',
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=5',
  (d) => `${d.length} świec`,
)

await sprawdz(
  'Binance – świece 1w',
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=5',
  (d) => `${d.length} świec`,
)

await sprawdz(
  'Binance – ticker 24h',
  'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
  (d) => `${liczba(d.lastPrice)} USDT (${Number(d.priceChangePercent).toFixed(2)}%)`,
)

console.log(kolor.gruby('\n=== Giełdy zapasowe ===\n'))

await sprawdz(
  'Bybit – świece 1h',
  'https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=5',
  (d) => `${d.result?.list?.length ?? 0} świec`,
  { krytyczne: false },
)

await sprawdz(
  'OKX – świece 1H',
  'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=5',
  (d) => `${d.data?.length ?? 0} świec`,
  { krytyczne: false },
)

await sprawdz(
  'Kraken – świece 60',
  'https://api.kraken.com/0/public/OHLC?pair=XBTUSDT&interval=60',
  (d) => {
    const k = Object.keys(d.result ?? {}).find((x) => x !== 'last')
    return `${d.result?.[k]?.length ?? 0} świec`
  },
  { krytyczne: false },
)

await sprawdz(
  'Coinbase – świece 3600',
  'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600',
  (d) => `${d.length} świec`,
  { krytyczne: false },
)

console.log(kolor.gruby('\n=== Rynek terminowy ===\n'))

await sprawdz(
  'Binance – funding rate',
  'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=5',
  (d) => `ostatni ${(Number(d.at(-1).fundingRate) * 100).toFixed(4)}%`,
)

await sprawdz(
  'Binance – premium index',
  'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
  (d) => `mark ${liczba(d.markPrice)}, next funding za ${Math.round((d.nextFundingTime - Date.now()) / 60000)} min`,
)

await sprawdz(
  'Binance – open interest',
  'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=5',
  (d) => `${liczba(Number(d.at(-1).sumOpenInterestValue) / 1e9)} mld USD`,
)

await sprawdz(
  'Binance – long/short ratio',
  'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=5',
  (d) => `${Number(d.at(-1).longShortRatio).toFixed(3)} longów na shorta`,
)

await sprawdz(
  'Binance – taker buy/sell',
  'https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=5',
  (d) => `ratio ${Number(d.at(-1).buySellRatio).toFixed(3)}`,
)

console.log(kolor.gruby('\n=== Nastroje i kontekst ===\n'))

await sprawdz(
  'Alternative.me – strach/chciwość',
  'https://api.alternative.me/fng/?limit=3',
  (d) => `${d.data[0].value} (${d.data[0].value_classification})`,
)

await sprawdz(
  'CoinGecko – rynek globalny',
  'https://api.coingecko.com/api/v3/global',
  (d) => `dominacja BTC ${d.data.market_cap_percentage.btc.toFixed(2)}%`,
  { krytyczne: false },
)

await sprawdz(
  'mempool.space – opłaty',
  'https://mempool.space/api/v1/fees/recommended',
  (d) => `szybka ${d.fastestFee} sat/vB`,
  { krytyczne: false },
)

await sprawdz(
  'mempool.space – wysokość bloku',
  'https://mempool.space/api/blocks/tip/height',
  (d) => `blok ${liczba(d)}`,
  { krytyczne: false },
)

await sprawdz(
  'mempool.space – hashrate',
  'https://mempool.space/api/v1/mining/hashrate/3d',
  (d) => `${(d.currentHashrate / 1e18).toFixed(1)} EH/s`,
  { krytyczne: false },
)

console.log(kolor.gruby('\n=== Kanały newsowe ===\n'))

const KANALY = [
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  ['Cointelegraph', 'https://cointelegraph.com/rss'],
  ['The Block', 'https://www.theblock.co/rss.xml'],
  ['Decrypt', 'https://decrypt.co/feed'],
  ['Bitcoin Magazine', 'https://bitcoinmagazine.com/feed'],
  ['CryptoSlate', 'https://cryptoslate.com/feed/'],
  ['Bitcoinist', 'https://bitcoinist.com/feed/'],
  ['NewsBTC', 'https://www.newsbtc.com/feed/'],
  ['Google News PL', 'https://news.google.com/rss/search?q=bitcoin+OR+kryptowaluty&hl=pl&gl=PL&ceid=PL:pl'],
  ['Google News świat', 'https://news.google.com/rss/search?q=bitcoin+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Google News makro', 'https://news.google.com/rss/search?q=%22Federal+Reserve%22+OR+CPI+OR+FOMC+when:2d&hl=en-US&gl=US&ceid=US:en'],
]

for (const [nazwa, url] of KANALY) {
  await sprawdz(
    nazwa,
    url,
    (xml) => {
      const tekst = typeof xml === 'string' ? xml : JSON.stringify(xml)
      const pozycje = (tekst.match(/<item[\s>]/g) ?? tekst.match(/<entry[\s>]/g) ?? []).length
      const tytul = tekst.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)
      if (pozycje === 0) throw new Error('kanał bez pozycji')
      return `${pozycje} pozycji, np. „${(tytul?.[1] ?? '').slice(0, 45).trim()}…”`
    },
    { krytyczne: false },
  )
}

console.log(kolor.gruby('\n=== Kalendarz makro ===\n'))

await sprawdz(
  'Forex Factory – ten tydzień',
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  (d) => {
    const wysokie = d.filter((x) => x.impact === 'High')
    return `${d.length} wydarzeń, ${wysokie.length} o wysokiej wadze`
  },
  { krytyczne: false },
)

console.log(kolor.gruby('\n=== WebSocket ===\n'))

await sprawdzWs(
  'Binance – strumień ceny',
  'wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@aggTrade/btcusdt@kline_1m',
)

await sprawdzWs('Binance – likwidacje', 'wss://fstream.binance.com/ws/!forceOrder@arr', {
  sekundy: 20,
  krytyczne: false,
  ramkiWymagane: false,
})

// ------------------------------------------------------------------ podsumowanie

console.log(kolor.gruby('\n=== Podsumowanie ===\n'))
const ostrzezenia = WYNIKI.filter((w) => !w.ok && !w.krytyczne).length
console.log(`Działa:      ${kolor.zielony(String(sukcesy))}`)
console.log(`Ostrzeżenia: ${ostrzezenia > 0 ? kolor.zolty(String(ostrzezenia)) : '0'}  ${kolor.szary('(źródła zapasowe / opcjonalne)')}`)
console.log(`Błędy:       ${porazki > 0 ? kolor.czerwony(String(porazki)) : '0'}  ${kolor.szary('(źródła krytyczne)')}`)

if (porazki > 0) {
  console.log(kolor.czerwony('\nKrytyczne źródła nie odpowiadają:'))
  for (const w of WYNIKI.filter((x) => !x.ok && x.krytyczne)) {
    console.log(`  • ${w.nazwa}: ${w.blad}`)
  }
}
console.log('')
process.exit(porazki > 0 ? 1 : 0)
