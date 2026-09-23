import { describe, expect, it } from 'vitest'
import {
  IndeksDeduplikacji,
  jaccard,
  kanonicznyUrl,
  normalizujTytul,
  odlegloscHamminga,
  przetworzPartie,
  simhash,
  tokeny,
  type Klaster,
  type SurowyNews,
} from './dedup'

describe('kanonicznyUrl', () => {
  it('usuwa parametry śledzące', () => {
    expect(
      kanonicznyUrl('https://www.coindesk.com/artykul?utm_source=x&utm_medium=y&fbclid=abc'),
    ).toBe('https://coindesk.com/artykul')
  })

  it('sprowadza warianty tego samego artykułu do jednej postaci', () => {
    const cel = 'https://cointelegraph.com/news/btc-rosnie'
    expect(kanonicznyUrl('http://www.cointelegraph.com/news/btc-rosnie/')).toBe(cel)
    expect(kanonicznyUrl('https://cointelegraph.com/news/btc-rosnie/amp/')).toBe(cel)
    expect(kanonicznyUrl('https://amp.cointelegraph.com/news/btc-rosnie#sekcja')).toBe(cel)
    expect(kanonicznyUrl('https://cointelegraph.com/news/btc-rosnie?ref=twitter')).toBe(cel)
  })

  it('wyciąga właściwy adres z opakowania Google News', () => {
    expect(kanonicznyUrl('https://news.google.com/rss/articles/xyz?url=https://decrypt.co/1234')).toBe(
      'https://decrypt.co/1234',
    )
  })

  it('sortuje pozostałe parametry, żeby kolejność nie tworzyła duplikatu', () => {
    expect(kanonicznyUrl('https://x.pl/a?b=2&a=1')).toBe(kanonicznyUrl('https://x.pl/a?a=1&b=2'))
  })
})

describe('normalizacja tytułu', () => {
  it('zdejmuje diakrytyki, interpunkcję i nazwę źródła', () => {
    expect(normalizujTytul('Bitcoin rośnie! Zaskakujące dane — CoinDesk')).toBe(
      'bitcoin rosnie zaskakujace dane',
    )
  })

  it('wycina stopwordy z listy tokenów', () => {
    expect(tokeny('Bitcoin i ETF to jest nowy rekord')).toEqual(['bitcoin', 'etf', 'rekord'])
  })
})

describe('SimHash', () => {
  it('identyczne tytuły dają identyczny hash', () => {
    const a = simhash(tokeny('Bitcoin przebija 100 tysięcy dolarów po decyzji SEC'))
    const b = simhash(tokeny('Bitcoin przebija 100 tysięcy dolarów po decyzji SEC'))
    expect(odlegloscHamminga(a, b)).toBe(0)
  })

  it('drobna przeróbka tytułu mieści się w progu', () => {
    const a = simhash(tokeny('SEC zatwierdza spotowy ETF na Bitcoina po latach odmów'))
    const b = simhash(tokeny('SEC zatwierdziła spotowy ETF na Bitcoina po latach odmów'))
    expect(odlegloscHamminga(a, b)).toBeLessThanOrEqual(6)
  })

  it('zupełnie inne tematy są daleko od siebie', () => {
    const a = simhash(tokeny('SEC zatwierdza spotowy ETF na Bitcoina'))
    const b = simhash(tokeny('Giełda Mt Gox przenosi monety do nowego portfela'))
    expect(odlegloscHamminga(a, b)).toBeGreaterThan(6)
  })
})

describe('Jaccard', () => {
  it('mierzy pokrycie zbiorów tokenów', () => {
    expect(jaccard(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(1)
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0)
    expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'd'])).toBeCloseTo(0.5, 5)
  })
})

describe('IndeksDeduplikacji + klastrowanie', () => {
  const news = (n: Partial<SurowyNews>): SurowyNews => ({
    tytul: 'Domyślny tytuł',
    opis: '',
    url: 'https://przyklad.pl/1',
    zrodlo: 'Test',
    data: Date.UTC(2026, 0, 10, 12),
    jezyk: 'en',
    ...n,
  })

  it('ten sam artykuł z różnymi parametrami trafia raz', async () => {
    const indeks = new IndeksDeduplikacji()
    const klastry = new Map<string, Klaster>()

    const wynik = await przetworzPartie(
      [
        news({ tytul: 'SEC zatwierdza ETF', url: 'https://coindesk.com/a?utm_source=rss' }),
        news({ tytul: 'SEC zatwierdza ETF', url: 'https://www.coindesk.com/a/' }),
        news({ tytul: 'SEC zatwierdza ETF', url: 'https://coindesk.com/a/amp/' }),
      ],
      indeks,
      klastry,
    )

    expect(wynik.nowe).toHaveLength(1)
    expect(wynik.odrzucone.url).toBe(2)
    expect(klastry.size).toBe(1)
  })

  it('ta sama historia z różnych serwisów tworzy jeden klaster z wieloma źródłami', async () => {
    const indeks = new IndeksDeduplikacji()
    const klastry = new Map<string, Klaster>()

    const wynik = await przetworzPartie(
      [
        news({
          tytul: 'SEC zatwierdza spotowy ETF na Bitcoina po latach odmów',
          url: 'https://coindesk.com/sec-etf',
          zrodlo: 'CoinDesk',
        }),
        news({
          tytul: 'SEC zatwierdziła spotowy ETF na Bitcoina po latach odmów',
          url: 'https://cointelegraph.com/sec-etf-approved',
          zrodlo: 'Cointelegraph',
          data: Date.UTC(2026, 0, 10, 13),
        }),
        news({
          tytul: 'Spotowy ETF na Bitcoina zatwierdzony przez SEC po latach odmów',
          url: 'https://decrypt.co/sec',
          zrodlo: 'Decrypt',
          data: Date.UTC(2026, 0, 10, 14),
        }),
      ],
      indeks,
      klastry,
    )

    expect(wynik.nowe).toHaveLength(1)
    expect(klastry.size).toBe(1)
    const jedyny = [...klastry.values()][0]
    expect(jedyny.zrodla).toHaveLength(3)
    expect(jedyny.zrodla.map((z) => z.nazwa).sort()).toEqual(['CoinDesk', 'Cointelegraph', 'Decrypt'])
  })

  it('różne historie zostają osobno', async () => {
    const indeks = new IndeksDeduplikacji()
    const klastry = new Map<string, Klaster>()

    const wynik = await przetworzPartie(
      [
        news({ tytul: 'SEC zatwierdza spotowy ETF na Bitcoina', url: 'https://a.pl/1' }),
        news({ tytul: 'Wieloryb przenosi 5000 BTC na giełdę Binance', url: 'https://a.pl/2' }),
        news({ tytul: 'Hashrate sieci Bitcoin bije kolejny rekord', url: 'https://a.pl/3' }),
        news({ tytul: 'Fed utrzymuje stopy procentowe bez zmian', url: 'https://a.pl/4' }),
      ],
      indeks,
      klastry,
    )

    expect(wynik.nowe).toHaveLength(4)
  })

  it('polski tytuł wypiera angielski w tym samym klastrze', async () => {
    const indeks = new IndeksDeduplikacji()
    const klastry = new Map<string, Klaster>()

    await przetworzPartie(
      [
        news({
          tytul: 'MicroStrategy buys another 5000 bitcoin worth 300 million dollars',
          url: 'https://a.pl/en',
          jezyk: 'en',
        }),
        news({
          tytul: 'MicroStrategy buys another 5000 bitcoin worth 300 million dollars',
          url: 'https://b.pl/pl',
          jezyk: 'pl',
          data: Date.UTC(2026, 0, 10, 13),
        }),
      ],
      indeks,
      klastry,
    )

    const jedyny = [...klastry.values()][0]
    expect(jedyny.jezyk).toBe('pl')
  })

  it('ponowne przetworzenie tej samej partii nie tworzy nic nowego', async () => {
    const indeks = new IndeksDeduplikacji()
    const klastry = new Map<string, Klaster>()
    const partia = [
      news({ tytul: 'Bitcoin przebija 120 tysięcy dolarów', url: 'https://a.pl/1' }),
      news({ tytul: 'Fed tnie stopy o 25 punktów bazowych', url: 'https://a.pl/2' }),
    ]

    const pierwsze = await przetworzPartie(partia, indeks, klastry)
    const drugie = await przetworzPartie(partia, indeks, klastry)

    expect(pierwsze.nowe).toHaveLength(2)
    expect(drugie.nowe).toHaveLength(0)
    expect(drugie.odrzucone.url).toBe(2)
    expect(klastry.size).toBe(2)
  })

  it('czyści wpisy starsze niż TTL', () => {
    const indeks = new IndeksDeduplikacji()
    const teraz = Date.UTC(2026, 1, 1)
    indeks.dodaj('stary', 'k1', ['bitcoin', 'etf'], simhash(['bitcoin', 'etf']), teraz - 40 * 86_400_000)
    indeks.dodaj('nowy', 'k2', ['fed', 'stopy'], simhash(['fed', 'stopy']), teraz - 2 * 86_400_000)

    expect(indeks.rozmiar).toBe(2)
    expect(indeks.wyczyscStare(teraz)).toBe(1)
    expect(indeks.rozmiar).toBe(1)
  })

  it('poza oknem 48 h podobne tytuły to osobne historie', async () => {
    const indeks = new IndeksDeduplikacji()
    const klastry = new Map<string, Klaster>()

    const wynik = await przetworzPartie(
      [
        news({
          tytul: 'Bitcoin bije rekord wszech czasów na fali napływów do ETF',
          url: 'https://a.pl/styczen',
          data: Date.UTC(2026, 0, 1),
        }),
        news({
          tytul: 'Bitcoin bije rekord wszech czasów na fali napływów do ETF',
          url: 'https://a.pl/marzec',
          data: Date.UTC(2026, 2, 1),
        }),
      ],
      indeks,
      klastry,
    )

    expect(wynik.nowe).toHaveLength(2)
  })
})
