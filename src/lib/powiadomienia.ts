/**
 * Powiadomienia lokalne.
 *
 * Natywnie leci przez @capacitor/local-notifications, w przeglądarce przez
 * Notification API. Gdy ani jedno, ani drugie nie jest dostępne – po cichu nic
 * się nie dzieje, bo powiadomienie nigdy nie może wywrócić aplikacji.
 */

import { LocalNotifications } from '@capacitor/local-notifications'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { NATYWNIE } from './http'

let zgoda: boolean | null = null
let licznikId = 1

export async function popropZgode(): Promise<boolean> {
  if (zgoda !== null) return zgoda
  try {
    if (NATYWNIE) {
      const wynik = await LocalNotifications.requestPermissions()
      zgoda = wynik.display === 'granted'
    } else if (typeof Notification !== 'undefined') {
      const wynik = await Notification.requestPermission()
      zgoda = wynik === 'granted'
    } else {
      zgoda = false
    }
  } catch {
    zgoda = false
  }
  return zgoda
}

export async function czyMamyZgode(): Promise<boolean> {
  if (zgoda !== null) return zgoda
  try {
    if (NATYWNIE) {
      const wynik = await LocalNotifications.checkPermissions()
      zgoda = wynik.display === 'granted'
    } else if (typeof Notification !== 'undefined') {
      zgoda = Notification.permission === 'granted'
    } else {
      zgoda = false
    }
  } catch {
    zgoda = false
  }
  return zgoda
}

export interface TrescPowiadomienia {
  tytul: string
  tresc: string
  /** Do grupowania i otwierania właściwego ekranu. */
  tag?: string
}

export async function powiadom(p: TrescPowiadomienia): Promise<void> {
  if (!(await czyMamyZgode())) return
  try {
    if (NATYWNIE) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: licznikId++,
            title: p.tytul,
            body: p.tresc,
            smallIcon: 'ic_stat_icon',
            group: p.tag,
          },
        ],
      })
    } else if (typeof Notification !== 'undefined') {
      new Notification(p.tytul, { body: p.tresc, tag: p.tag, icon: './ikony/ikona-192.png' })
    }
  } catch (e) {
    console.warn('Nie udało się wyświetlić powiadomienia:', e)
  }
}

// ------------------------------------------------------------------ haptyka

let haptykaWlaczona = true

export function ustawHaptyke(wlaczona: boolean): void {
  haptykaWlaczona = wlaczona
}

export async function drgnij(sila: 'lekko' | 'srednio' | 'mocno' = 'lekko'): Promise<void> {
  if (!haptykaWlaczona || !NATYWNIE) return
  try {
    const styl =
      sila === 'mocno' ? ImpactStyle.Heavy : sila === 'srednio' ? ImpactStyle.Medium : ImpactStyle.Light
    await Haptics.impact({ style: styl })
  } catch {
    /* urządzenie bez wibracji */
  }
}

export async function drgnijSukces(): Promise<void> {
  if (!haptykaWlaczona || !NATYWNIE) return
  try {
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    /* bez wibracji */
  }
}

export async function drgnijBlad(): Promise<void> {
  if (!haptykaWlaczona || !NATYWNIE) return
  try {
    await Haptics.notification({ type: NotificationType.Error })
  } catch {
    /* bez wibracji */
  }
}
