import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Baza dla GitHub Pages ustawiana zmienną BASE_PUBLICZNA (np. "/btc-sygnaly/").
const baza = process.env.BASE_PUBLICZNA ?? '/'

/**
 * Proxy deweloperskie dla dowolnego adresu: `/proxy/pobierz?url=<adres>`.
 *
 * Kanały RSS i kalendarz makro nie wystawiają nagłówków CORS. Natywnie
 * (Android/iOS) pobiera je CapacitorHttp z pominięciem CORS, a w produkcyjnej
 * PWA – publiczne proxy. W trybie deweloperskim chcemy jednak pracować bez
 * zależności od cudzych, często przeciążonych usług, więc pobieramy po stronie
 * serwera Vite.
 */
function proxyDeweloperskie(): Plugin {
  return {
    name: 'btc-proxy-deweloperskie',
    apply: 'serve',
    configureServer(serwer) {
      serwer.middlewares.use('/proxy/pobierz', (zadanie, odpowiedz) => {
        const adres = new URL(zadanie.url ?? '', 'http://localhost').searchParams.get('url')
        if (!adres || !/^https?:\/\//i.test(adres)) {
          odpowiedz.statusCode = 400
          odpowiedz.end('Brak poprawnego parametru url')
          return
        }
        fetch(adres, {
          headers: { 'User-Agent': 'Mozilla/5.0 (kompatybilny; BTC-Sygnaly/1.0)' },
        })
          .then(async (o) => {
            odpowiedz.statusCode = o.status
            odpowiedz.setHeader('Content-Type', o.headers.get('content-type') ?? 'text/plain')
            odpowiedz.setHeader('Access-Control-Allow-Origin', '*')
            odpowiedz.end(Buffer.from(await o.arrayBuffer()))
          })
          .catch((e: unknown) => {
            odpowiedz.statusCode = 502
            odpowiedz.end(e instanceof Error ? e.message : 'Nie udało się pobrać')
          })
      })
    },
  }
}

/**
 * Wersja aplikacji wstrzykiwana przy budowaniu.
 *
 * Build Androida ustawia ją na dokładnie ten sam znacznik, pod którym powstaje
 * wydanie na GitHubie (np. „v1.0.7”) — dzięki temu aplikacja potrafi porównać
 * siebie z najnowszym wydaniem i zaproponować aktualizację.
 */
const wersja = process.env.WERSJA_APLIKACJI ?? 'dev'

/**
 * Wpisuje wersję do service workera.
 *
 * Pliki z `public/` kopiowane są dosłownie, więc Vite ich nie przetwarza —
 * podmieniamy znacznik po zbudowaniu. Bez tego nazwa pamięci podręcznej nigdy
 * by się nie zmieniła i przeglądarka trzymałaby starą powłokę aplikacji.
 */
function wersjaWServiceWorkerze(): Plugin {
  return {
    name: 'btc-wersja-sw',
    apply: 'build',
    closeBundle() {
      const plik = resolve(__dirname, 'dist', 'sw.js')
      if (!existsSync(plik)) return
      const tresc = readFileSync(plik, 'utf8').replace(/__WERSJA_SW__/g, wersja)
      writeFileSync(plik, tresc)
    },
  }
}

export default defineConfig({
  base: baza,
  define: {
    __WERSJA__: JSON.stringify(wersja),
  },
  plugins: [react(), proxyDeweloperskie(), wersjaWServiceWorkerze()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 5180,
    // Proxy używany TYLKO w przeglądarce (dev/PWA) – natywnie leci CapacitorHttp,
    // który nie podlega CORS.
    proxy: {
      '/proxy/binance': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/binance/, ''),
      },
      '/proxy/binance-fut': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/binance-fut/, ''),
      },
      '/proxy/coingecko': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/coingecko/, ''),
      },
      '/proxy/fng': {
        target: 'https://api.alternative.me',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/fng/, ''),
      },
      '/proxy/mempool': {
        target: 'https://mempool.space',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/mempool/, ''),
      },
      '/proxy/bybit': {
        target: 'https://api.bybit.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/bybit/, ''),
      },
      '/proxy/okx': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/okx/, ''),
      },
      '/proxy/kraken': {
        target: 'https://api.kraken.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/kraken/, ''),
      },
      '/proxy/coinbase': {
        target: 'https://api.exchange.coinbase.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/coinbase/, ''),
      },
      '/proxy/rss': {
        target: 'https://api.allorigins.win',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/rss/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          wykresy: ['lightweight-charts'],
          animacje: ['framer-motion'],
        },
      },
    },
  },
  worker: { format: 'es' },
})
