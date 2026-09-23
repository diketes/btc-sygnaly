/** Formatowanie liczb, czasu i kwot – wszystko po polsku. */

const LICZBY = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 })
const LICZBY2 = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function cena(x: number | null | undefined, miejsca = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—'
  return miejsca === 0 ? LICZBY.format(x) : x.toLocaleString('pl-PL', {
    minimumFractionDigits: miejsca,
    maximumFractionDigits: miejsca,
  })
}

export function procent(x: number | null | undefined, miejsca = 2, zeZnakiem = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—'
  const znak = zeZnakiem && x > 0 ? '+' : ''
  return `${znak}${x.toFixed(miejsca).replace('.', ',')}%`
}

export function liczba(x: number | null | undefined, miejsca = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—'
  return miejsca === 0 ? LICZBY.format(x) : LICZBY2.format(x)
}

/** Duże kwoty w skrócie: 8,6 mld USD, 340 mln USD. */
export function kwota(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—'
  const abs = Math.abs(x)
  if (abs >= 1e12) return `${(x / 1e12).toFixed(2).replace('.', ',')} bln`
  if (abs >= 1e9) return `${(x / 1e9).toFixed(2).replace('.', ',')} mld`
  if (abs >= 1e6) return `${(x / 1e6).toFixed(1).replace('.', ',')} mln`
  if (abs >= 1e3) return `${(x / 1e3).toFixed(1).replace('.', ',')} tys.`
  return LICZBY.format(x)
}

export function godzina(ms: number): string {
  return new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

export function dataGodzina(ms: number): string {
  return new Date(ms).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dataKrotka(ms: number): string {
  return new Date(ms).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' })
}

/** „3 min temu”, „2 godz. temu”, „wczoraj”. */
export function temu(ms: number, teraz = Date.now()): string {
  const sekundy = Math.max(0, Math.floor((teraz - ms) / 1000))
  if (sekundy < 45) return 'przed chwilą'
  const minuty = Math.floor(sekundy / 60)
  if (minuty < 60) return `${minuty} min temu`
  const godziny = Math.floor(minuty / 60)
  if (godziny < 24) return `${godziny} godz. temu`
  const dni = Math.floor(godziny / 24)
  if (dni === 1) return 'wczoraj'
  if (dni < 7) return `${dni} dni temu`
  return dataKrotka(ms)
}

/** „za 5 godz. 12 min”, „za 40 min”. */
export function za(ms: number, teraz = Date.now()): string {
  const sekundy = Math.floor((ms - teraz) / 1000)
  if (sekundy <= 0) return 'teraz'
  const minuty = Math.floor(sekundy / 60)
  if (minuty < 60) return `za ${minuty} min`
  const godziny = Math.floor(minuty / 60)
  const reszta = minuty % 60
  if (godziny < 24) return `za ${godziny} godz.${reszta > 0 ? ` ${reszta} min` : ''}`
  const dni = Math.floor(godziny / 24)
  return `za ${dni} ${dni === 1 ? 'dzień' : 'dni'}`
}

/** Odliczanie w formacie 05:12:33. */
export function odliczanie(ms: number, teraz = Date.now()): string {
  const calkowite = Math.max(0, Math.floor((ms - teraz) / 1000))
  const g = Math.floor(calkowite / 3600)
  const m = Math.floor((calkowite % 3600) / 60)
  const s = calkowite % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return g > 0 ? `${pad(g)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function nazwaInterwalu(i: string): string {
  const nazwy: Record<string, string> = {
    '5m': '5 min',
    '15m': '15 min',
    '1h': '1 godz.',
    '4h': '4 godz.',
    '1d': '1 dzień',
    '3d': '3 dni',
    '1w': '1 tydzień',
  }
  return nazwy[i] ?? i
}

/** Odmiana rzeczownika przez liczbę: 1 źródło, 2 źródła, 5 źródeł. */
export function odmiana(n: number, jeden: string, dwa: string, piec: string): string {
  const setki = n % 100
  const dziesiatki = n % 10
  if (n === 1) return jeden
  if (dziesiatki >= 2 && dziesiatki <= 4 && (setki < 12 || setki > 14)) return dwa
  return piec
}

export function zrodlaOdmiana(n: number): string {
  return `${n} ${odmiana(n, 'źródło', 'źródła', 'źródeł')}`
}
