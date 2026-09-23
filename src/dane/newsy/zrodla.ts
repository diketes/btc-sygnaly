/** Kanały newsowe. Wiarygodność wpływa na wyliczaną siłę oddziaływania newsa. */

export interface Zrodlo {
  id: string
  nazwa: string
  url: string
  jezyk: 'pl' | 'en'
  /** 0,5–1,0 – jak bardzo ufamy temu źródłu. */
  wiarygodnosc: number
  domyslnieWlaczone: boolean
}

export const ZRODLA: Zrodlo[] = [
  {
    id: 'coindesk',
    nazwa: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    jezyk: 'en',
    wiarygodnosc: 0.95,
    domyslnieWlaczone: true,
  },
  {
    id: 'cointelegraph',
    nazwa: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    jezyk: 'en',
    wiarygodnosc: 0.8,
    domyslnieWlaczone: true,
  },
  {
    id: 'theblock',
    nazwa: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
    jezyk: 'en',
    wiarygodnosc: 0.95,
    domyslnieWlaczone: true,
  },
  {
    id: 'decrypt',
    nazwa: 'Decrypt',
    url: 'https://decrypt.co/feed',
    jezyk: 'en',
    wiarygodnosc: 0.85,
    domyslnieWlaczone: true,
  },
  {
    id: 'bitcoinmagazine',
    nazwa: 'Bitcoin Magazine',
    url: 'https://bitcoinmagazine.com/feed',
    jezyk: 'en',
    wiarygodnosc: 0.8,
    domyslnieWlaczone: true,
  },
  {
    id: 'cryptoslate',
    nazwa: 'CryptoSlate',
    url: 'https://cryptoslate.com/feed/',
    jezyk: 'en',
    wiarygodnosc: 0.7,
    domyslnieWlaczone: true,
  },
  {
    id: 'bitcoinist',
    nazwa: 'Bitcoinist',
    url: 'https://bitcoinist.com/feed/',
    jezyk: 'en',
    wiarygodnosc: 0.6,
    domyslnieWlaczone: true,
  },
  {
    id: 'newsbtc',
    nazwa: 'NewsBTC',
    url: 'https://www.newsbtc.com/feed/',
    jezyk: 'en',
    wiarygodnosc: 0.6,
    domyslnieWlaczone: false,
  },
  {
    id: 'google-pl',
    nazwa: 'Google News (PL)',
    url: 'https://news.google.com/rss/search?q=bitcoin+OR+kryptowaluty&hl=pl&gl=PL&ceid=PL:pl',
    jezyk: 'pl',
    wiarygodnosc: 0.75,
    domyslnieWlaczone: true,
  },
  {
    id: 'google-en',
    nazwa: 'Google News (świat)',
    url: 'https://news.google.com/rss/search?q=bitcoin+when:2d&hl=en-US&gl=US&ceid=US:en',
    jezyk: 'en',
    wiarygodnosc: 0.75,
    domyslnieWlaczone: true,
  },
  {
    id: 'google-makro',
    nazwa: 'Google News (makro)',
    url: 'https://news.google.com/rss/search?q=%22Federal+Reserve%22+OR+CPI+OR+FOMC+when:2d&hl=en-US&gl=US&ceid=US:en',
    jezyk: 'en',
    wiarygodnosc: 0.8,
    domyslnieWlaczone: true,
  },
]

export function zrodloPoId(id: string): Zrodlo | undefined {
  return ZRODLA.find((z) => z.id === id)
}

export function domyslneZrodla(): string[] {
  return ZRODLA.filter((z) => z.domyslnieWlaczone).map((z) => z.id)
}
