/**
 * Scalanie serii świec.
 *
 * Wydzielone z modułu strumienia, bo to czysta logika bez zależności od
 * przeglądarki – dzięki temu da się ją porządnie przetestować.
 *
 * Reguła: po zerwaniu połączenia dociągamy świece REST-em i scalamy je z tym,
 * co już mamy. Klucz to czas otwarcia świecy; nowsze dane nadpisują starsze
 * (ostatnia świeca w serii bywa jeszcze niezamknięta i zmienia się w czasie).
 */

import type { Swieca } from '@/analiza/wskazniki'

/**
 * Wstawia świecę ze strumienia do serii: aktualizuje ostatnią albo dokleja nową.
 * Zwraca nową tablicę – nigdy nie mutuje wejścia.
 */
export function scalSwiece(seria: readonly Swieca[], nowa: Swieca, maks = 1000): Swieca[] {
  if (seria.length === 0) return [nowa]

  const ostatnia = seria[seria.length - 1]
  if (nowa.czas === ostatnia.czas) {
    const kopia = seria.slice()
    kopia[kopia.length - 1] = nowa
    return kopia
  }
  if (nowa.czas > ostatnia.czas) {
    const kopia = seria.slice(-(maks - 1))
    kopia.push(nowa)
    return kopia
  }
  // Świeca starsza niż ostatnia – spóźniona ramka, ignorujemy.
  return seria as Swieca[]
}

/**
 * Scala dwie serie po czasie otwarcia. Dane z `nowa` mają pierwszeństwo.
 * Używane po wznowieniu połączenia, żeby dokleić brakujący fragment
 * bez duplikatów i bez dziur.
 */
export function scalSerie(stara: readonly Swieca[], nowa: readonly Swieca[], maks = 1000): Swieca[] {
  // Żadnych skrótów przy pustym wejściu: funkcja obiecuje serię posortowaną
  // i bez duplikatów, a dane z giełd zapasowych przychodzą od najnowszych.
  const mapa = new Map<number, Swieca>()
  for (const s of stara) mapa.set(s.czas, s)
  for (const s of nowa) mapa.set(s.czas, s)

  return [...mapa.values()].sort((a, b) => a.czas - b.czas).slice(-maks)
}

export interface RaportCiaglosci {
  ciagla: boolean
  duplikaty: number
  dziury: { od: number; do: number; brakujace: number }[]
  pozaKolejnoscia: number
}

/**
 * Sprawdza, czy seria nie ma dziur ani duplikatów przy zadanym odstępie.
 * Używane w teście wznowienia połączenia.
 */
export function sprawdzCiaglosc(seria: readonly Swieca[], odstepMs: number): RaportCiaglosci {
  const dziury: { od: number; do: number; brakujace: number }[] = []
  let duplikaty = 0
  let pozaKolejnoscia = 0

  for (let i = 1; i < seria.length; i++) {
    const roznica = seria[i].czas - seria[i - 1].czas
    if (roznica === 0) duplikaty++
    else if (roznica < 0) pozaKolejnoscia++
    else if (roznica > odstepMs) {
      dziury.push({
        od: seria[i - 1].czas,
        do: seria[i].czas,
        brakujace: Math.round(roznica / odstepMs) - 1,
      })
    }
  }

  return {
    ciagla: dziury.length === 0 && duplikaty === 0 && pozaKolejnoscia === 0,
    duplikaty,
    dziury,
    pozaKolejnoscia,
  }
}
