/**
 * Składanie kontekstu rynkowego dla silnika sygnałów.
 *
 * Wydzielone ze `App`, bo potrzebują go też ekrany — przycisk „Daj sygnał”
 * musi podać silnikowi dokładnie ten sam obraz rynku, z jakiego korzysta
 * zwykłe, cykliczne przeliczanie.
 */

import { PUSTY_KONTEKST, type KontekstRynku } from '@/analiza/typy'
import { podsumujLikwidacje, uzyjRynku } from './rynek'
import { ryzykoDlaSilnika } from './newsy'

export function zbudujKontekstRynku(): KontekstRynku {
  const { migawka, likwidacje } = uzyjRynku.getState()
  const lik = podsumujLikwidacje(likwidacje, 15)

  return {
    ...PUSTY_KONTEKST,
    funding: migawka?.funding?.ostatni ?? null,
    fundingSrednia: migawka?.funding?.srednia24h ?? null,
    longShort: migawka?.longShort?.ratio ?? null,
    zmianaOi24h: migawka?.oi?.zmiana24hProc ?? null,
    likwidacjeLong15m: lik.long,
    likwidacjeShort15m: lik.short,
    strachChciwosc: migawka?.strachChciwosc?.wartosc ?? null,
    ryzykoNewsow: ryzykoDlaSilnika(),
  }
}
