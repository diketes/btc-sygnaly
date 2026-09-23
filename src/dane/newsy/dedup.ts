/**
 * Deduplikacja i klastrowanie newsów.
 *
 * Warstwy, po kolei – pierwsza, która trafi, kończy sprawę:
 *  1. kanonizacja adresu URL (bez utm_*, AMP, śmieci),
 *  2. identyfikator SHA-256 z kanonicznego URL – dokładny duplikat,
 *  3. normalizacja tytułu (bez diakrytyków, interpunkcji, stopwordów, nazwy źródła),
 *  4. SimHash 64-bit z 3-gramów + indeks LSH → odległość Hamminga ≤ 6,
 *  5. podobieństwo Jaccarda zbiorów tokenów ≥ 0,6 w oknie 48 h.
 *
 * Duplikaty nie znikają – dołączają do klastra jako kolejne źródło tej samej
 * historii. Powiadomienie push wychodzi raz na klaster, nigdy drugi raz.
 */

// ------------------------------------------------------------------ typy

export interface SurowyNews {
  tytul: string
  opis: string
  url: string
  zrodlo: string
  data: number
  jezyk: 'pl' | 'en'
}

export interface ZrodloKlastra {
  nazwa: string
  url: string
  tytul: string
  data: number
}

export interface Klaster {
  id: string
  tytul: string
  opis: string
  jezyk: 'pl' | 'en'
  pierwszaData: number
  ostatniaData: number
  zrodla: ZrodloKlastra[]
  powiadomiono: boolean
}

export interface WpisIndeksu {
  id: string
  klasterId: string
  simhash: string
  tokeny: string[]
  data: number
}

export type PowodDuplikatu = 'url' | 'simhash' | 'jaccard' | null

// ------------------------------------------------------------------ kanonizacja URL

const SMIECIOWE_PARAMETRY = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^igshid$/i,
  /^mc_(cid|eid)$/i,
  /^ref$/i,
  /^referrer$/i,
  /^source$/i,
  /^src$/i,
  /^amp$/i,
  /^__twitter_impression$/i,
  /^guccounter$/i,
  /^guce_referrer/i,
  /^s$/i,
  /^__source$/i,
]

export function kanonicznyUrl(surowy: string): string {
  let tekst = (surowy ?? '').trim()
  if (!tekst) return ''

  // Google News opakowuje właściwy adres w parametr ?url=
  try {
    const wstepny = new URL(tekst)
    const zagniezdzony = wstepny.searchParams.get('url')
    if (zagniezdzony && /^https?:\/\//i.test(zagniezdzony)) tekst = zagniezdzony
  } catch {
    /* zajmiemy się tym niżej */
  }

  let u: URL
  try {
    u = new URL(tekst)
  } catch {
    return tekst.toLowerCase().replace(/\/+$/, '')
  }

  u.protocol = 'https:'
  u.hash = ''
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^amp\./, '')
  u.port = ''

  for (const klucz of [...u.searchParams.keys()]) {
    if (SMIECIOWE_PARAMETRY.some((w) => w.test(klucz))) u.searchParams.delete(klucz)
  }
  u.searchParams.sort()

  // Warianty AMP wskazują na ten sam artykuł.
  u.pathname = u.pathname
    .replace(/\/amp\/?$/i, '/')
    .replace(/\.amp(\.html?)?$/i, '$1')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')

  const zapytanie = u.searchParams.toString()
  return `${u.protocol}//${u.hostname}${u.pathname}${zapytanie ? `?${zapytanie}` : ''}`
}

// ------------------------------------------------------------------ identyfikator

const HEX = '0123456789abcdef'

function doHex(bajty: Uint8Array): string {
  let out = ''
  for (const b of bajty) out += HEX[b >> 4] + HEX[b & 15]
  return out
}

/** SHA-256 z kanonicznego URL. Gdy Web Crypto niedostępne – stabilny fallback. */
export async function idZUrl(url: string): Promise<string> {
  const kanoniczny = kanonicznyUrl(url)
  const podsystem = globalThis.crypto?.subtle
  if (podsystem) {
    const bufor = await podsystem.digest('SHA-256', new TextEncoder().encode(kanoniczny))
    return doHex(new Uint8Array(bufor))
  }
  // Fallback: FNV-1a 64-bit – do identyfikacji w zupełności wystarcza.
  return fnv1a64(kanoniczny).toString(16).padStart(16, '0')
}

const FNV_PRIME = 0x100000001b3n
const FNV_OFFSET = 0xcbf29ce484222325n
const MASKA64 = (1n << 64n) - 1n

export function fnv1a64(tekst: string): bigint {
  let h = FNV_OFFSET
  for (let i = 0; i < tekst.length; i++) {
    h ^= BigInt(tekst.charCodeAt(i) & 0xff)
    h = (h * FNV_PRIME) & MASKA64
  }
  return h
}

// ------------------------------------------------------------------ normalizacja tytułu

const STOPWORDY = new Set([
  // polskie
  'a','aby','ale','albo','bo','by','być','coś','czy','dla','do','gdy','gdzie','go','i','ich','ile',
  'im','inne','iż','ja','jak','jako','je','jego','jej','jest','jeszcze','już','kto','która','które',
  'który','lat','lub','ma','mają','mi','między','mnie','może','na','nad','nam','nas','nie','niż','o',
  'od','oraz','po','pod','ponad','przez','przy','sie','się','są','ta','tak','także','te','tego','tej',
  'ten','teraz','to','tych','tym','u','w','we','więc','z','za','ze','że','żeby','będzie','było','ich',
  'jednak','tylko','bardzo','nowy','nowe','nowa','wg','pln','roku','rok',
  // angielskie
  'a','about','after','all','also','an','and','are','as','at','be','been','but','by','can','could',
  'for','from','had','has','have','how','in','into','is','it','its','may','more','most','new','no',
  'not','of','on','one','or','other','out','over','said','says','she','so','some','such','than','that',
  'the','their','them','then','there','these','they','this','to','up','was','way','we','were','what',
  'when','which','who','will','with','would','you','your','amp','via','report','reports','says',
])

export function bezDiakrytykow(tekst: string): string {
  return tekst
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
}

/** Usuwa końcówkę z nazwą źródła: „Tytuł - CoinDesk”, „Tytuł | Cointelegraph”. */
export function bezNazwyZrodla(tytul: string): string {
  return tytul.replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/u, '').trim()
}

export function normalizujTytul(tytul: string): string {
  return bezDiakrytykow(bezNazwyZrodla(tytul ?? ''))
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Końcówki fleksyjne odcinane przed porównaniem – bez diakrytyków, bo tytuł
 * jest już znormalizowany. Kolejność ma znaczenie: najdłuższe najpierw.
 *
 * Polski odmienia przez końcówki, więc „zatwierdza” i „zatwierdziła” to bez
 * tego kroku dwa zupełnie różne tokeny i SimHash ich nie skleja.
 */
const SUFIKSY = [
  'iami', 'ach', 'ami', 'ami', 'och', 'ych', 'ymi', 'imi', 'owi', 'emu', 'ego',
  'isz', 'asz', 'aja', 'uja', 'ily', 'aly', 'ili', 'ali', 'ing', 'ies',
  'la', 'ly', 'li', 'ow', 'om', 'ie', 'ia', 'iu', 'em', 'im', 'ym', 'ej', 'ki',
  'ka', 'ku', 'ac', 'ic', 'ec', 'ed', 'es',
  'a', 'e', 'i', 'o', 'u', 'y', 'l', 's',
]

const MIN_RDZEN = 4
const MAKS_RDZEN = 8

/** Lekki stemmer: odcina jedną końcówkę fleksyjną i przycina do 8 znaków. */
export function rdzen(token: string): string {
  if (token.length <= MIN_RDZEN) return token
  let t = token
  for (const suf of SUFIKSY) {
    if (t.endsWith(suf) && t.length - suf.length >= MIN_RDZEN) {
      t = t.slice(0, -suf.length)
      break
    }
  }
  return t.slice(0, MAKS_RDZEN)
}

export function tokeny(tytul: string): string[] {
  return normalizujTytul(tytul)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDY.has(t))
    .map(rdzen)
}

// ------------------------------------------------------------------ SimHash

/** 3-gramy słów; przy krótkich tytułach schodzimy do pojedynczych tokenów. */
export function shingle(lista: string[], n = 3): string[] {
  if (lista.length === 0) return []
  if (lista.length < n) return lista.slice()
  const out: string[] = []
  for (let i = 0; i <= lista.length - n; i++) out.push(lista.slice(i, i + n).join(' '))
  return out
}

export function simhash(lista: string[]): bigint {
  const kawalki = shingle(lista)
  if (kawalki.length === 0) return 0n

  const licznik = new Array<number>(64).fill(0)
  for (const k of kawalki) {
    const h = fnv1a64(k)
    for (let b = 0; b < 64; b++) {
      if ((h >> BigInt(b)) & 1n) licznik[b]++
      else licznik[b]--
    }
  }

  let wynik = 0n
  for (let b = 0; b < 64; b++) if (licznik[b] > 0) wynik |= 1n << BigInt(b)
  return wynik
}

export function odlegloscHamminga(a: bigint, b: bigint): number {
  let x = a ^ b
  let liczba = 0
  while (x) {
    x &= x - 1n
    liczba++
  }
  return liczba
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const zbiorA = new Set(a)
  const zbiorB = new Set(b)
  let wspolne = 0
  for (const t of zbiorA) if (zbiorB.has(t)) wspolne++
  const suma = zbiorA.size + zbiorB.size - wspolne
  return suma === 0 ? 0 : wspolne / suma
}

// ------------------------------------------------------------------ indeks

export const PROG_HAMMINGA = 6
export const PROG_JACCARDA = 0.6
export const OKNO_PODOBIENSTWA_MS = 48 * 3_600_000
export const TTL_INDEKSU_MS = 30 * 24 * 3_600_000

/** Cztery pasma po 16 bitów – kandydatów szukamy tylko w tych samych kubełkach. */
function pasma(h: bigint): string[] {
  const out: string[] = []
  for (let i = 0; i < 4; i++) {
    const kawalek = (h >> BigInt(i * 16)) & 0xffffn
    out.push(`${i}:${kawalek.toString(16)}`)
  }
  return out
}

export interface WynikSprawdzenia {
  duplikat: boolean
  powod: PowodDuplikatu
  klasterId: string | null
  /** Podobieństwo, jeśli o nim zdecydowało (Hamming lub Jaccard). */
  miara: number | null
}

export class IndeksDeduplikacji {
  private wpisy = new Map<string, WpisIndeksu>()
  private kubelki = new Map<string, Set<string>>()

  constructor(wpisy: readonly WpisIndeksu[] = []) {
    for (const w of wpisy) this.zaindeksuj(w)
  }

  get rozmiar(): number {
    return this.wpisy.size
  }

  eksportuj(): WpisIndeksu[] {
    return [...this.wpisy.values()]
  }

  private zaindeksuj(w: WpisIndeksu): void {
    this.wpisy.set(w.id, w)
    for (const p of pasma(BigInt(w.simhash))) {
      let zbior = this.kubelki.get(p)
      if (!zbior) {
        zbior = new Set()
        this.kubelki.set(p, zbior)
      }
      zbior.add(w.id)
    }
  }

  /** Czy ten news już znamy – a jeśli tak, do którego klastra należy. */
  sprawdz(id: string, tytulTokeny: string[], hash: bigint, data: number): WynikSprawdzenia {
    // 1. Dokładnie ten sam adres.
    const dokladny = this.wpisy.get(id)
    if (dokladny) {
      return { duplikat: true, powod: 'url', klasterId: dokladny.klasterId, miara: 0 }
    }

    // 2. Kandydaci z indeksu LSH.
    const kandydaci = new Set<string>()
    for (const p of pasma(hash)) {
      const zbior = this.kubelki.get(p)
      if (zbior) for (const kid of zbior) kandydaci.add(kid)
    }

    let najlepszy: { wpis: WpisIndeksu; odleglosc: number } | null = null
    for (const kid of kandydaci) {
      const w = this.wpisy.get(kid)
      if (!w) continue
      if (Math.abs(w.data - data) > OKNO_PODOBIENSTWA_MS) continue
      const odleglosc = odlegloscHamminga(hash, BigInt(w.simhash))
      if (odleglosc <= PROG_HAMMINGA && (!najlepszy || odleglosc < najlepszy.odleglosc)) {
        najlepszy = { wpis: w, odleglosc }
      }
    }
    if (najlepszy) {
      return {
        duplikat: true,
        powod: 'simhash',
        klasterId: najlepszy.wpis.klasterId,
        miara: najlepszy.odleglosc,
      }
    }

    // 3. Jaccard w oknie 48 h – łapie przepisane tytuły, których SimHash nie złapał.
    let najlepszyJaccard: { wpis: WpisIndeksu; miara: number } | null = null
    for (const w of this.wpisy.values()) {
      if (Math.abs(w.data - data) > OKNO_PODOBIENSTWA_MS) continue
      const m = jaccard(tytulTokeny, w.tokeny)
      if (m >= PROG_JACCARDA && (!najlepszyJaccard || m > najlepszyJaccard.miara)) {
        najlepszyJaccard = { wpis: w, miara: m }
      }
    }
    if (najlepszyJaccard) {
      return {
        duplikat: true,
        powod: 'jaccard',
        klasterId: najlepszyJaccard.wpis.klasterId,
        miara: najlepszyJaccard.miara,
      }
    }

    return { duplikat: false, powod: null, klasterId: null, miara: null }
  }

  dodaj(id: string, klasterId: string, tytulTokeny: string[], hash: bigint, data: number): void {
    if (this.wpisy.has(id)) return
    this.zaindeksuj({ id, klasterId, simhash: hash.toString(), tokeny: tytulTokeny, data })
  }

  /** Usuwa wpisy starsze niż TTL (domyślnie 30 dni). */
  wyczyscStare(teraz = Date.now(), ttl = TTL_INDEKSU_MS): number {
    let usuniete = 0
    for (const [id, w] of this.wpisy) {
      if (teraz - w.data > ttl) {
        this.wpisy.delete(id)
        for (const p of pasma(BigInt(w.simhash))) this.kubelki.get(p)?.delete(id)
        usuniete++
      }
    }
    for (const [k, zbior] of this.kubelki) if (zbior.size === 0) this.kubelki.delete(k)
    return usuniete
  }
}

// ------------------------------------------------------------------ przetwarzanie partii

export interface WynikPrzetwarzania {
  /** Klastry utworzone w tej partii – tylko o nich wolno powiadamiać. */
  nowe: Klaster[]
  /** Klastry, do których doszło nowe źródło. */
  wzbogacone: Klaster[]
  /** Ile wpisów odrzucono jako duplikaty, w rozbiciu na powód. */
  odrzucone: { url: number; simhash: number; jaccard: number }
}

/** Nazwa źródła wycięta z URL, gdy kanał jej nie podał. */
function nazwaZUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'nieznane'
  }
}

/**
 * Przepuszcza partię newsów przez indeks. Zwraca nowe klastry i te, do których
 * dołączyło kolejne źródło. Indeks i mapa klastrów są modyfikowane w miejscu.
 */
export async function przetworzPartie(
  newsy: readonly SurowyNews[],
  indeks: IndeksDeduplikacji,
  klastry: Map<string, Klaster>,
): Promise<WynikPrzetwarzania> {
  const nowe: Klaster[] = []
  const wzbogacone = new Map<string, Klaster>()
  const odrzucone = { url: 0, simhash: 0, jaccard: 0 }

  // Najstarsze najpierw – klaster ma wtedy poprawną „pierwszą datę” i tytuł oryginału.
  const posortowane = [...newsy].sort((a, b) => a.data - b.data)

  for (const news of posortowane) {
    const url = kanonicznyUrl(news.url)
    if (!url) continue

    const id = await idZUrl(url)
    const t = tokeny(news.tytul)
    if (t.length === 0) continue
    const hash = simhash(t)

    const wynik = indeks.sprawdz(id, t, hash, news.data)

    if (wynik.duplikat && wynik.klasterId) {
      if (wynik.powod) odrzucone[wynik.powod]++
      const klaster = klastry.get(wynik.klasterId)
      if (!klaster) continue

      // Ten sam adres już jest – nic nie dopisujemy.
      const juzJest = klaster.zrodla.some((z) => kanonicznyUrl(z.url) === url)
      if (juzJest) continue

      klaster.zrodla.push({
        nazwa: news.zrodlo || nazwaZUrl(news.url),
        url: news.url,
        tytul: news.tytul,
        data: news.data,
      })
      klaster.ostatniaData = Math.max(klaster.ostatniaData, news.data)
      klaster.pierwszaData = Math.min(klaster.pierwszaData, news.data)
      // Polski tytuł ma pierwszeństwo – aplikacja jest po polsku.
      if (klaster.jezyk === 'en' && news.jezyk === 'pl') {
        klaster.tytul = news.tytul
        klaster.opis = news.opis || klaster.opis
        klaster.jezyk = 'pl'
      }
      indeks.dodaj(id, klaster.id, t, hash, news.data)
      wzbogacone.set(klaster.id, klaster)
      continue
    }

    const klasterId = `k-${id.slice(0, 16)}`
    const klaster: Klaster = {
      id: klasterId,
      tytul: news.tytul,
      opis: news.opis,
      jezyk: news.jezyk,
      pierwszaData: news.data,
      ostatniaData: news.data,
      zrodla: [
        {
          nazwa: news.zrodlo || nazwaZUrl(news.url),
          url: news.url,
          tytul: news.tytul,
          data: news.data,
        },
      ],
      powiadomiono: false,
    }
    klastry.set(klasterId, klaster)
    indeks.dodaj(id, klasterId, t, hash, news.data)
    nowe.push(klaster)
  }

  return { nowe, wzbogacone: [...wzbogacone.values()], odrzucone }
}
