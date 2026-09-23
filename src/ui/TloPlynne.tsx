/**
 * Płynne tło reagujące na rynek.
 *
 * Prędkość plam zależy od realnej zmienności (ATR w stosunku do ceny), a barwa
 * od kierunku zmiany z ostatniej godziny. Spokojny rynek = leniwe, fioletowe
 * tło; gwałtowny ruch = szybkie, zielone albo czerwone.
 *
 * Rysujemy na płótnie w 1/4 rozdzielczości i rozmywamy je filtrem CSS – to
 * kosztuje ułamek tego, co prawdziwe metabale, a wygląda jak ciecz.
 */

import { useEffect, useRef } from 'react'

interface Props {
  /** −1 (mocno w dół) … +1 (mocno w górę). */
  kierunek: number
  /** 0 (spokój) … 1 (skrajna zmienność). */
  zmiennosc: number
  aktywne: boolean
}

interface Plama {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  odcien: number
}

const LICZBA_PLAM = 5
const PODZIALKA = 4 // rysujemy w 1/4 rozdzielczości

export function TloPlynne({ kierunek, zmiennosc, aktywne }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const parametry = useRef({ kierunek, zmiennosc })
  parametry.current = { kierunek, zmiennosc }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !aktywne) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let szerokosc = 0
    let wysokosc = 0
    let plamy: Plama[] = []
    let klatka = 0
    let dziala = true

    const dopasuj = () => {
      szerokosc = Math.max(1, Math.floor(window.innerWidth / PODZIALKA))
      wysokosc = Math.max(1, Math.floor(window.innerHeight / PODZIALKA))
      canvas.width = szerokosc
      canvas.height = wysokosc
      if (plamy.length === 0) {
        plamy = Array.from({ length: LICZBA_PLAM }, (_, i) => ({
          x: Math.random() * szerokosc,
          y: Math.random() * wysokosc,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: (0.22 + Math.random() * 0.2) * Math.min(szerokosc, wysokosc),
          odcien: i / LICZBA_PLAM,
        }))
      }
    }

    dopasuj()
    window.addEventListener('resize', dopasuj)

    // Barwy: fiolet w spokoju, zieleń przy wzrostach, czerwień przy spadkach.
    const barwa = (odcien: number, k: number): [number, number, number] => {
      const neutralny: [number, number, number] = [124, 92, 255]
      const gora: [number, number, number] = [0, 226, 138]
      const dol: [number, number, number] = [255, 59, 92]
      const cel = k >= 0 ? gora : dol
      const sila = Math.min(1, Math.abs(k)) * (0.35 + odcien * 0.5)
      return [
        Math.round(neutralny[0] + (cel[0] - neutralny[0]) * sila),
        Math.round(neutralny[1] + (cel[1] - neutralny[1]) * sila),
        Math.round(neutralny[2] + (cel[2] - neutralny[2]) * sila),
      ]
    }

    const rysuj = () => {
      if (!dziala) return
      klatka = requestAnimationFrame(rysuj)

      const { kierunek: k, zmiennosc: z } = parametry.current
      const tempo = 0.25 + z * 2.4

      ctx.clearRect(0, 0, szerokosc, wysokosc)
      ctx.globalCompositeOperation = 'lighter'

      for (const p of plamy) {
        p.x += p.vx * tempo
        p.y += p.vy * tempo

        // Odbicia od krawędzi z lekkim marginesem, żeby plamy nie znikały.
        if (p.x < -p.r * 0.4 || p.x > szerokosc + p.r * 0.4) p.vx *= -1
        if (p.y < -p.r * 0.4 || p.y > wysokosc + p.r * 0.4) p.vy *= -1

        const [r, g, b] = barwa(p.odcien, k)
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
        gradient.addColorStop(0, `rgba(${r},${g},${b},${0.3 + z * 0.22})`)
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    // Gdy aplikacja schodzi w tło, zatrzymujemy pętlę – nie palimy baterii.
    const naWidocznosc = () => {
      if (document.hidden) {
        dziala = false
        cancelAnimationFrame(klatka)
      } else if (!dziala) {
        dziala = true
        klatka = requestAnimationFrame(rysuj)
      }
    }
    document.addEventListener('visibilitychange', naWidocznosc)

    klatka = requestAnimationFrame(rysuj)

    return () => {
      dziala = false
      cancelAnimationFrame(klatka)
      window.removeEventListener('resize', dopasuj)
      document.removeEventListener('visibilitychange', naWidocznosc)
    }
  }, [aktywne])

  if (!aktywne) {
    // Statyczny zamiennik w trybie oszczędzania – nadal ładny, zero kosztu.
    return (
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 80% at 20% 0%, rgba(124,92,255,0.16) 0%, transparent 55%),' +
            'radial-gradient(100% 70% at 85% 25%, rgba(0,226,138,0.10) 0%, transparent 60%)',
        }}
      />
    )
  }

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      style={{ filter: 'blur(42px)', opacity: 0.85 }}
    />
  )
}
