/**
 * Cykl życia sygnału: śledzenie aktywnych pozycji względem ceny na żywo.
 *
 * Reguły:
 *  • wejście limitem → pozycja powstaje dopiero, gdy cena dotknie poziomu
 *                      zlecenia; wcześniej stop i cele się nie liczą, a po
 *                      terminie sygnał wygasa bez wyniku (jak w backteście),
 *  • TP1 osiągnięty  → stop loss przesuwany na próg rentowności (break even),
 *  • TP2 osiągnięty  → sygnał liczony jako zyskowny nawet po powrocie do BE,
 *  • TP3 osiągnięty  → zamknięcie z zyskiem,
 *  • SL trafiony     → zamknięcie ze stratą,
 *  • upłynął termin  → wygaśnięcie (liczone po aktualnej cenie).
 */

import type { Sygnal, StatusSygnalu, ZdarzenieSygnalu } from './typy'

export interface AktualizacjaSygnalu {
  sygnal: Sygnal
  zmienil: boolean
  noweZdarzenia: ZdarzenieSygnalu[]
}

/** Czy cena sięgnęła poziomu w kierunku sygnału. */
function siegnela(kierunek: 'long' | 'short', cena: number, poziom: number): boolean {
  return kierunek === 'long' ? cena >= poziom : cena <= poziom
}

/** Czy cena spadła na poziom stopa. */
function trafilStop(kierunek: 'long' | 'short', cena: number, stop: number): boolean {
  return kierunek === 'long' ? cena <= stop : cena >= stop
}

export function zaktualizujSygnal(
  wejsciowy: Sygnal,
  cena: number,
  teraz = Date.now(),
): AktualizacjaSygnalu {
  const zamkniete: StatusSygnalu[] = ['zamkniety_zysk', 'zamkniety_strata', 'uniewazniony', 'wygasly']
  if (zamkniete.includes(wejsciowy.status) || !Number.isFinite(cena)) {
    return { sygnal: wejsciowy, zmienil: false, noweZdarzenia: [] }
  }

  const s: Sygnal = {
    ...wejsciowy,
    cele: wejsciowy.cele.map((c) => ({ ...c })),
    zdarzenia: [...wejsciowy.zdarzenia],
  }
  const noweZdarzenia: ZdarzenieSygnalu[] = []
  const znak = s.kierunek === 'long' ? 1 : -1
  const ryzyko = Math.abs(s.wejscie - s.stopLoss)

  const dodaj = (typ: ZdarzenieSygnalu['typ'], opis: string) => {
    const z: ZdarzenieSygnalu = { czas: teraz, typ, cena, opis }
    noweZdarzenia.push(z)
    s.zdarzenia.push(z)
  }

  // 0. Zlecenie limit czeka, aż cena dotknie jego poziomu – z której strony
  //    by nie nadchodziła. Bez tego sygnał, którego wejście nigdy nie weszło,
  //    zbierałby „zyski” z ruchu, w którym nikt nie miał pozycji.
  if (s.wypelniony === false) {
    const odGory = s.cenaOdniesienia > s.wejscie
    const dotknela = odGory ? cena <= s.wejscie : cena >= s.wejscie
    if (!dotknela) {
      if (teraz >= s.wygasa) {
        s.status = 'wygasly'
        s.zamkniety = teraz
        s.wynikR = null
        dodaj(
          'wygasly',
          `Cena nie doszła do poziomu wejścia ${s.wejscie.toFixed(0)} USDT – zlecenie nie weszło, transakcji nie było.`,
        )
        return { sygnal: s, zmienil: true, noweZdarzenia }
      }
      return { sygnal: wejsciowy, zmienil: false, noweZdarzenia }
    }
    s.wypelniony = true
    dodaj('wejscie', `Zlecenie limit wypełnione przy ${s.wejscie.toFixed(0)} USDT – pozycja otwarta.`)
  }

  // 1. Stop loss ma pierwszeństwo – zawsze sprawdzamy go najpierw.
  if (trafilStop(s.kierunek, cena, s.stopLoss)) {
    const poTp1 = s.cele[0].osiagniety
    s.status = poTp1 ? 'zamkniety_zysk' : 'zamkniety_strata'
    s.zamkniety = teraz
    s.wynikR = poTp1 ? (znak * (s.stopLoss - s.wejscie)) / ryzyko : -1
    dodaj(
      'sl',
      poTp1
        ? `Zamknięcie na przesuniętym stopie po TP1 – wynik ${s.wynikR.toFixed(2)}R.`
        : `Stop loss trafiony przy ${cena.toFixed(0)} USDT – strata 1R.`,
    )
    return { sygnal: s, zmienil: true, noweZdarzenia }
  }

  // 2. Kolejne cele.
  for (const cel of s.cele) {
    if (cel.osiagniety) continue
    if (!siegnela(s.kierunek, cena, cel.cena)) continue

    cel.osiagniety = true
    cel.czasOsiagniecia = teraz

    if (cel.poziom === 1) {
      s.status = 'tp1'
      const staryStop = s.stopLoss
      s.stopLoss = s.wejscie
      dodaj('tp1', `TP1 osiągnięty przy ${cel.cena.toFixed(0)} USDT (+${cel.procent.toFixed(2)}%).`)
      if (staryStop !== s.wejscie) {
        dodaj('be', 'Stop loss przesunięty na próg rentowności – pozycja bez ryzyka.')
      }
    } else if (cel.poziom === 2) {
      s.status = 'tp2'
      dodaj('tp2', `TP2 osiągnięty przy ${cel.cena.toFixed(0)} USDT (+${cel.procent.toFixed(2)}%).`)
    } else {
      s.status = 'zamkniety_zysk'
      s.zamkniety = teraz
      s.wynikR = cel.r
      dodaj('tp3', `TP3 osiągnięty przy ${cel.cena.toFixed(0)} USDT – sygnał zamknięty z zyskiem ${cel.r.toFixed(2)}R.`)
      return { sygnal: s, zmienil: true, noweZdarzenia }
    }
  }

  // 3. Wygaśnięcie z upływem czasu.
  if (teraz >= s.wygasa) {
    const osiagniety = [...s.cele].reverse().find((c) => c.osiagniety)
    s.status = osiagniety ? 'zamkniety_zysk' : 'wygasly'
    s.zamkniety = teraz
    s.wynikR = osiagniety ? osiagniety.r : (znak * (cena - s.wejscie)) / ryzyko
    dodaj(
      'wygasly',
      `Minął termin ważności sygnału. Wynik na moment wygaśnięcia: ${s.wynikR.toFixed(2)}R.`,
    )
    return { sygnal: s, zmienil: true, noweZdarzenia }
  }

  return { sygnal: s, zmienil: noweZdarzenia.length > 0, noweZdarzenia }
}

/** Aktualizacja całej listy sygnałów jedną ceną. */
export function zaktualizujWszystkie(
  sygnaly: readonly Sygnal[],
  cena: number,
  teraz = Date.now(),
): { sygnaly: Sygnal[]; zmiany: { sygnal: Sygnal; zdarzenia: ZdarzenieSygnalu[] }[] } {
  const wynik: Sygnal[] = []
  const zmiany: { sygnal: Sygnal; zdarzenia: ZdarzenieSygnalu[] }[] = []
  for (const s of sygnaly) {
    const a = zaktualizujSygnal(s, cena, teraz)
    wynik.push(a.sygnal)
    if (a.noweZdarzenia.length > 0) zmiany.push({ sygnal: a.sygnal, zdarzenia: a.noweZdarzenia })
  }
  return { sygnaly: wynik, zmiany }
}

export function czyAktywny(s: Sygnal): boolean {
  return s.status === 'aktywny' || s.status === 'tp1' || s.status === 'tp2'
}

export function czyZamkniety(s: Sygnal): boolean {
  return !czyAktywny(s)
}

/** Czy sygnał wciąż czeka na wypełnienie zlecenia limit. */
export function czekaNaWejscie(s: Sygnal): boolean {
  return s.wypelniony === false && czyAktywny(s)
}

/** Bieżący, niezrealizowany wynik w R dla aktywnego sygnału. */
export function biezacyWynikR(s: Sygnal, cena: number): number {
  const ryzyko = Math.abs(s.wejscie - s.stopLoss) || Math.abs(s.wejscie * 0.01)
  const znak = s.kierunek === 'long' ? 1 : -1
  return (znak * (cena - s.wejscie)) / ryzyko
}

/** Postęp do kolejnego celu w procentach (0–100). */
export function postepDoCelu(s: Sygnal, cena: number): { cel: number; postep: number } {
  const nastepny = s.cele.find((c) => !c.osiagniety)
  if (!nastepny) return { cel: 3, postep: 100 }
  const od = s.cele.filter((c) => c.osiagniety).slice(-1)[0]?.cena ?? s.wejscie
  const dystans = Math.abs(nastepny.cena - od)
  if (dystans === 0) return { cel: nastepny.poziom, postep: 0 }
  const przebyty = Math.abs(cena - od)
  const kierunekOk = s.kierunek === 'long' ? cena >= od : cena <= od
  return {
    cel: nastepny.poziom,
    postep: Math.max(0, Math.min(100, kierunekOk ? (przebyty / dystans) * 100 : 0)),
  }
}
