/**
 * Warstwa cząsteczek: wystrzał przy nowym sygnale, konfetti przy trafionym celu.
 *
 * Płótno budzi się tylko na czas animacji i samo zasypia, gdy nic nie leci –
 * żadnej pętli w tle.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react'

export interface UchwytCzasteczek {
  /** Wystrzał w punkcie (w pikselach ekranu). */
  wystrzel: (x: number, y: number, kolor: string, ile?: number) => void
  konfetti: (x: number, y: number) => void
}

interface Czastka {
  x: number
  y: number
  vx: number
  vy: number
  zycie: number
  maksZycie: number
  rozmiar: number
  kolor: string
  obrot: number
  obrotV: number
  prostokat: boolean
}

const GRAWITACJA = 0.14
const TARCIE = 0.985

export const Czasteczki = forwardRef<UchwytCzasteczek, { aktywne: boolean }>(
  function Czasteczki({ aktywne }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const czastki = useRef<Czastka[]>([])
    const klatka = useRef<number | null>(null)

    const petla = useCallback(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const zywe: Czastka[] = []

      for (const c of czastki.current) {
        c.vy += GRAWITACJA
        c.vx *= TARCIE
        c.vy *= TARCIE
        c.x += c.vx
        c.y += c.vy
        c.obrot += c.obrotV
        c.zycie--

        if (c.zycie <= 0 || c.y > canvas.height + 40) continue
        zywe.push(c)

        const przezroczystosc = Math.min(1, c.zycie / (c.maksZycie * 0.45))
        ctx.save()
        ctx.globalAlpha = przezroczystosc
        ctx.translate(c.x, c.y)
        ctx.rotate(c.obrot)
        ctx.fillStyle = c.kolor
        if (c.prostokat) {
          ctx.fillRect(-c.rozmiar / 2, -c.rozmiar / 4, c.rozmiar, c.rozmiar / 2)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, c.rozmiar / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      czastki.current = zywe

      if (zywe.length > 0) {
        klatka.current = requestAnimationFrame(petla)
      } else {
        klatka.current = null
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }, [])

    const obudz = useCallback(() => {
      if (klatka.current === null) klatka.current = requestAnimationFrame(petla)
    }, [petla])

    const dodaj = useCallback(
      (nowe: Czastka[]) => {
        if (!aktywne) return
        const canvas = canvasRef.current
        if (!canvas) return
        // Limit, żeby seria zdarzeń nie zatkała płótna.
        czastki.current = [...czastki.current, ...nowe].slice(-320)
        obudz()
      },
      [aktywne, obudz],
    )

    useImperativeHandle(
      ref,
      () => ({
        wystrzel(x, y, kolor, ile = 34) {
          const nowe: Czastka[] = []
          for (let i = 0; i < ile; i++) {
            const kat = (Math.PI * 2 * i) / ile + Math.random() * 0.4
            const moc = 3 + Math.random() * 6
            nowe.push({
              x,
              y,
              vx: Math.cos(kat) * moc,
              vy: Math.sin(kat) * moc - 2,
              zycie: 46 + Math.random() * 34,
              maksZycie: 80,
              rozmiar: 3 + Math.random() * 4,
              kolor,
              obrot: 0,
              obrotV: 0,
              prostokat: false,
            })
          }
          dodaj(nowe)
        },

        konfetti(x, y) {
          const kolory = ['#00E28A', '#7C5CFF', '#F7931A', '#FFD166', '#FFFFFF']
          const nowe: Czastka[] = []
          for (let i = 0; i < 60; i++) {
            const kat = -Math.PI / 2 + (Math.random() - 0.5) * 1.9
            const moc = 6 + Math.random() * 9
            nowe.push({
              x: x + (Math.random() - 0.5) * 60,
              y,
              vx: Math.cos(kat) * moc,
              vy: Math.sin(kat) * moc,
              zycie: 80 + Math.random() * 60,
              maksZycie: 140,
              rozmiar: 6 + Math.random() * 6,
              kolor: kolory[Math.floor(Math.random() * kolory.length)],
              obrot: Math.random() * Math.PI,
              obrotV: (Math.random() - 0.5) * 0.3,
              prostokat: true,
            })
          }
          dodaj(nowe)
        },
      }),
      [dodaj],
    )

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dopasuj = () => {
        const skala = Math.min(2, window.devicePixelRatio || 1)
        canvas.width = window.innerWidth * skala
        canvas.height = window.innerHeight * skala
        canvas.style.width = `${window.innerWidth}px`
        canvas.style.height = `${window.innerHeight}px`
        const ctx = canvas.getContext('2d')
        ctx?.setTransform(skala, 0, 0, skala, 0, 0)
      }
      dopasuj()
      window.addEventListener('resize', dopasuj)
      return () => {
        window.removeEventListener('resize', dopasuj)
        if (klatka.current !== null) cancelAnimationFrame(klatka.current)
      }
    }, [])

    if (!aktywne) return null

    return (
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50"
      />
    )
  },
)
