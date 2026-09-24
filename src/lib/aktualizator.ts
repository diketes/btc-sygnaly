/**
 * Most do natywnego modułu aktualizatora (natywne/android/AktualizatorPlugin.java).
 *
 * Pobiera nowe APK wewnątrz aplikacji i otwiera instalator Androida — bez
 * przechodzenia przez przeglądarkę. Ostatnie „Zainstaluj” zawsze naciska
 * użytkownik: Android nie pozwala aplikacjom spoza sklepu instalować się
 * po cichu i nie da się tego obejść.
 *
 * Gdy modułu nie ma (PWA, przeglądarka albo starsza wersja aplikacji bez
 * aktualizatora), wszystko wraca do otwarcia linku w przeglądarce.
 */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { NATYWNIE } from './http'

interface ModulAktualizatora {
  mozeInstalowac(): Promise<{ mozna: boolean }>
  otworzUstawieniaInstalacji(): Promise<void>
  pobranaWersja(): Promise<{ wersja: string }>
  pobierz(opcje: { url: string; wersja: string }): Promise<{ wersja: string; zPamieci: boolean }>
  zainstaluj(): Promise<{ stan: 'instalator-otwarty' | 'wymagana-zgoda' }>
  addListener(
    zdarzenie: 'postep',
    obsluga: (dane: { procent: number; pobrano: number; rozmiar: number }) => void,
  ): Promise<PluginListenerHandle>
}

const Aktualizator = registerPlugin<ModulAktualizatora>('Aktualizator')

let dostepnoscSprawdzona: boolean | null = null

/**
 * Czy natywny aktualizator jest w tej wersji aplikacji.
 * Starsze APK go nie mają – wtedy wywołanie kończy się błędem „not implemented”.
 */
export async function czyAktualizatorDostepny(): Promise<boolean> {
  if (!NATYWNIE) return false
  if (dostepnoscSprawdzona !== null) return dostepnoscSprawdzona
  try {
    await Aktualizator.mozeInstalowac()
    dostepnoscSprawdzona = true
  } catch {
    dostepnoscSprawdzona = false
  }
  return dostepnoscSprawdzona
}

export async function pobranaWersja(): Promise<string> {
  if (!(await czyAktualizatorDostepny())) return ''
  try {
    return (await Aktualizator.pobranaWersja()).wersja
  } catch {
    return ''
  }
}

/**
 * Pobiera APK wskazanej wersji. `naPostep` dostaje procent 0–100.
 * Gdy ta wersja jest już na dysku, kończy się od razu.
 */
export async function pobierzAktualizacje(
  url: string,
  wersja: string,
  naPostep?: (procent: number) => void,
): Promise<void> {
  let sluchacz: PluginListenerHandle | null = null
  try {
    if (naPostep) {
      sluchacz = await Aktualizator.addListener('postep', (d) => naPostep(d.procent))
    }
    await Aktualizator.pobierz({ url, wersja })
    naPostep?.(100)
  } finally {
    await sluchacz?.remove()
  }
}

export type WynikInstalacji = 'instalator-otwarty' | 'wymagana-zgoda'

export async function zainstalujAktualizacje(): Promise<WynikInstalacji> {
  return (await Aktualizator.zainstaluj()).stan
}

export async function otworzUstawieniaInstalacji(): Promise<void> {
  await Aktualizator.otworzUstawieniaInstalacji()
}

/** Ostatnia deska ratunku: plik w przeglądarce systemowej. */
export function otworzWPrzegladarce(url: string): void {
  window.open(url, '_blank')
}
