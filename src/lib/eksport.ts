/**
 * Eksport historii sygnałów do CSV.
 *
 * Kopiowanie do schowka działa tak samo w przeglądarce i w aplikacji natywnej,
 * więc to ono jest drogą główną. Pobieranie pliku dokładamy tam, gdzie
 * przeglądarka na to pozwala.
 */

import type { Sygnal } from '@/analiza/typy'
import { etykietaHoryzontu } from '@/analiza/profile'

const NAGLOWKI = [
  'utworzony',
  'zamkniety',
  'horyzont',
  'kierunek',
  'na_zadanie',
  'wejscie',
  'stop_loss',
  'tp1',
  'tp2',
  'tp3',
  'pewnosc_proc',
  'zysk_do_ryzyka',
  'rezim',
  'wynik_R',
  'status',
  'uzasadnienie',
]

/** Pole CSV: cudzysłowy podwajamy, całość cytujemy, gdy trzeba. */
function pole(wartosc: unknown): string {
  const s = wartosc === null || wartosc === undefined ? '' : String(wartosc)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function data(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/** Liczba z przecinkiem – arkusze w polskiej lokalizacji tak jej oczekują. */
function liczbaPl(x: number | null | undefined, miejsca = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return ''
  return x.toFixed(miejsca).replace('.', ',')
}

export function historiaDoCsv(sygnaly: readonly Sygnal[]): string {
  const wiersze = [...sygnaly]
    .sort((a, b) => a.utworzony - b.utworzony)
    .map((s) =>
      [
        data(s.utworzony),
        data(s.zamkniety),
        etykietaHoryzontu(s),
        s.kierunek.toUpperCase(),
        s.naZadanie ? 'tak' : 'nie',
        liczbaPl(s.wejscie),
        liczbaPl(s.stopLoss),
        liczbaPl(s.cele[0]?.cena),
        liczbaPl(s.cele[1]?.cena),
        liczbaPl(s.cele[2]?.cena),
        s.pewnosc,
        liczbaPl(s.rr),
        s.rezim,
        liczbaPl(s.wynikR, 3),
        s.status,
        s.uzasadnienie.join(' | '),
      ]
        .map(pole)
        .join(';'),
    )

  // Średnik jako separator i BOM – bez tego Excel po polsku rozsypuje kolumny
  // i gubi polskie znaki.
  return '﻿' + [NAGLOWKI.join(';'), ...wiersze].join('\r\n')
}

export interface WynikEksportu {
  udane: boolean
  komunikat: string
}

export async function eksportujHistorie(sygnaly: readonly Sygnal[]): Promise<WynikEksportu> {
  if (sygnaly.length === 0) {
    return { udane: false, komunikat: 'Historia jest pusta — nie ma czego eksportować.' }
  }

  const csv = historiaDoCsv(sygnaly)
  let doSchowka = false

  try {
    await navigator.clipboard.writeText(csv)
    doSchowka = true
  } catch {
    // Brak zgody na schowek albo kontekst bez HTTPS – spróbujemy pliku.
  }

  let plik = false
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'btc-sygnaly-historia.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    plik = true
  } catch {
    // WebView potrafi blokować pobieranie – schowek wtedy ratuje sytuację.
  }

  if (doSchowka && plik) {
    return { udane: true, komunikat: `${sygnaly.length} sygnałów: plik pobrany i skopiowany do schowka.` }
  }
  if (doSchowka) {
    return {
      udane: true,
      komunikat: `${sygnaly.length} sygnałów skopiowanych do schowka — wklej do arkusza.`,
    }
  }
  if (plik) {
    return { udane: true, komunikat: `${sygnaly.length} sygnałów zapisanych do pliku CSV.` }
  }
  return { udane: false, komunikat: 'Nie udało się ani skopiować, ani zapisać pliku.' }
}
