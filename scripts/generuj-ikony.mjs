#!/usr/bin/env node
/**
 * Generator ikon aplikacji – rysuje motyw świec na ciemnym tle i zapisuje PNG.
 *
 * Koder PNG napisany wprost (zlib jest w Node), żeby nie dokładać zależności
 * graficznych tylko po to, by zrobić kilka kwadratów.
 */

import { deflateSync } from 'node:zlib'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KORZEN = join(dirname(fileURLToPath(import.meta.url)), '..')
const KATALOG = join(KORZEN, 'public', 'ikony')
const ANDROID_RES = join(KORZEN, 'android', 'app', 'src', 'main', 'res')

// ------------------------------------------------------------------ koder PNG

const TABLICA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bufor) {
  let c = 0xffffffff
  for (const b of bufor) c = TABLICA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(typ, dane) {
  const dlugosc = Buffer.alloc(4)
  dlugosc.writeUInt32BE(dane.length)
  const tresc = Buffer.concat([Buffer.from(typ, 'ascii'), dane])
  const suma = Buffer.alloc(4)
  suma.writeUInt32BE(crc32(tresc))
  return Buffer.concat([dlugosc, tresc, suma])
}

function zapiszPng(sciezka, szerokosc, wysokosc, piksele) {
  const naglowek = Buffer.alloc(13)
  naglowek.writeUInt32BE(szerokosc, 0)
  naglowek.writeUInt32BE(wysokosc, 4)
  naglowek[8] = 8 // głębia bitowa
  naglowek[9] = 6 // RGBA
  naglowek[10] = 0
  naglowek[11] = 0
  naglowek[12] = 0

  // Każdy wiersz poprzedzony bajtem filtra (0 = brak).
  const surowe = Buffer.alloc(wysokosc * (szerokosc * 4 + 1))
  for (let y = 0; y < wysokosc; y++) {
    const od = y * (szerokosc * 4 + 1)
    surowe[od] = 0
    piksele.copy(surowe, od + 1, y * szerokosc * 4, (y + 1) * szerokosc * 4)
  }

  writeFileSync(
    sciezka,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', naglowek),
      chunk('IDAT', deflateSync(surowe, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

// ------------------------------------------------------------------ rysowanie

function rysujIkone(rozmiar, zTlem = true) {
  const piksele = Buffer.alloc(rozmiar * rozmiar * 4)
  const promien = rozmiar * 0.22

  const ustaw = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= rozmiar || y >= rozmiar) return
    const i = (y * rozmiar + x) * 4
    const alfa = a / 255
    piksele[i] = Math.round(piksele[i] * (1 - alfa) + r * alfa)
    piksele[i + 1] = Math.round(piksele[i + 1] * (1 - alfa) + g * alfa)
    piksele[i + 2] = Math.round(piksele[i + 2] * (1 - alfa) + b * alfa)
    piksele[i + 3] = Math.max(piksele[i + 3], a)
  }

  // Tło: zaokrąglony kwadrat z pionowym gradientem.
  if (zTlem) {
    for (let y = 0; y < rozmiar; y++) {
      for (let x = 0; x < rozmiar; x++) {
        const dx = Math.max(promien - x, x - (rozmiar - promien), 0)
        const dy = Math.max(promien - y, y - (rozmiar - promien), 0)
        if (Math.hypot(dx, dy) > promien) continue
        const t = y / rozmiar
        ustaw(x, y, [Math.round(10 + t * 8), Math.round(11 + t * 9), Math.round(15 + t * 14)])
      }
    }
  }

  const prostokat = (x0, y0, szer, wys, kolor) => {
    for (let y = Math.round(y0); y < Math.round(y0 + wys); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + szer); x++) ustaw(x, y, kolor)
    }
  }

  // Trzy świece – dwie rosnące, jedna spadkowa.
  const ZIELEN = [0, 226, 138]
  const CZERWIEN = [255, 59, 92]
  const ZLOTO = [247, 147, 26]

  const j = rozmiar / 100 // jednostka
  const swiece = [
    { x: 22, korpusOd: 52, korpusDo: 74, knotOd: 44, knotDo: 80, kolor: ZIELEN },
    { x: 44, korpusOd: 32, korpusDo: 56, knotOd: 24, knotDo: 66, kolor: CZERWIEN },
    { x: 66, korpusOd: 22, korpusDo: 48, knotOd: 16, knotDo: 56, kolor: ZIELEN },
  ]

  for (const s of swiece) {
    const szerKorpusu = 12 * j
    const szerKnota = 2.6 * j
    prostokat(
      s.x * j + szerKorpusu / 2 - szerKnota / 2,
      s.knotOd * j,
      szerKnota,
      (s.knotDo - s.knotOd) * j,
      s.kolor,
    )
    prostokat(s.x * j, s.korpusOd * j, szerKorpusu, (s.korpusDo - s.korpusOd) * j, s.kolor)
  }

  // Złoty akcent – linia trendu u dołu.
  prostokat(20 * j, 86 * j, 60 * j, 3.2 * j, ZLOTO)

  return piksele
}

// ------------------------------------------------------------------ start

mkdirSync(KATALOG, { recursive: true })

const ROZMIARY = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512]
for (const r of ROZMIARY) {
  zapiszPng(join(KATALOG, `ikona-${r}.png`), r, r, rysujIkone(r))
}

// Ikona maskowalna – Android dokłada własną maskę, więc treść musi mieć zapas.
const maskowalna = 512
const pikseleMaskowalne = Buffer.alloc(maskowalna * maskowalna * 4)
{
  const wewnetrzna = rysujIkone(Math.round(maskowalna * 0.66), false)
  const bok = Math.round(maskowalna * 0.66)
  const odsuniecie = Math.round((maskowalna - bok) / 2)
  // Pełne tło bez zaokrągleń.
  for (let y = 0; y < maskowalna; y++) {
    for (let x = 0; x < maskowalna; x++) {
      const i = (y * maskowalna + x) * 4
      const t = y / maskowalna
      pikseleMaskowalne[i] = Math.round(10 + t * 8)
      pikseleMaskowalne[i + 1] = Math.round(11 + t * 9)
      pikseleMaskowalne[i + 2] = Math.round(15 + t * 14)
      pikseleMaskowalne[i + 3] = 255
    }
  }
  for (let y = 0; y < bok; y++) {
    for (let x = 0; x < bok; x++) {
      const zrodlo = (y * bok + x) * 4
      if (wewnetrzna[zrodlo + 3] === 0) continue
      const cel = ((y + odsuniecie) * maskowalna + (x + odsuniecie)) * 4
      pikseleMaskowalne[cel] = wewnetrzna[zrodlo]
      pikseleMaskowalne[cel + 1] = wewnetrzna[zrodlo + 1]
      pikseleMaskowalne[cel + 2] = wewnetrzna[zrodlo + 2]
      pikseleMaskowalne[cel + 3] = 255
    }
  }
}
zapiszPng(join(KATALOG, 'ikona-maskowalna-512.png'), maskowalna, maskowalna, pikseleMaskowalne)

console.log(`Zapisano ${ROZMIARY.length + 1} ikon w ${KATALOG}`)

// ------------------------------------------------------------------ Android

/**
 * Ikona powiadomień: Android wymaga białej sylwetki na przezroczystym tle –
 * kolorowa ikona wyświetliłaby się jako biały kwadrat.
 */
function rysujIkonePowiadomienia(rozmiar) {
  const piksele = Buffer.alloc(rozmiar * rozmiar * 4)
  const j = rozmiar / 100
  const prostokat = (x0, y0, szer, wys) => {
    for (let y = Math.round(y0); y < Math.round(y0 + wys); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + szer); x++) {
        if (x < 0 || y < 0 || x >= rozmiar || y >= rozmiar) continue
        const i = (y * rozmiar + x) * 4
        piksele[i] = 255
        piksele[i + 1] = 255
        piksele[i + 2] = 255
        piksele[i + 3] = 255
      }
    }
  }

  const swiece = [
    { x: 18, korpusOd: 50, korpusDo: 74, knotOd: 42, knotDo: 82 },
    { x: 42, korpusOd: 30, korpusDo: 56, knotOd: 22, knotDo: 66 },
    { x: 66, korpusOd: 18, korpusDo: 46, knotOd: 12, knotDo: 56 },
  ]
  for (const s of swiece) {
    const szerKorpusu = 14 * j
    const szerKnota = 3 * j
    prostokat(s.x * j + szerKorpusu / 2 - szerKnota / 2, s.knotOd * j, szerKnota, (s.knotDo - s.knotOd) * j)
    prostokat(s.x * j, s.korpusOd * j, szerKorpusu, (s.korpusDo - s.korpusOd) * j)
  }
  return piksele
}

if (existsSync(ANDROID_RES)) {
  // Gęstości ekranu zgodnie z wymaganiami Androida.
  const GESTOSCI = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ]

  for (const [gestosc, rozmiar] of GESTOSCI) {
    const katalog = join(ANDROID_RES, `mipmap-${gestosc}`)
    mkdirSync(katalog, { recursive: true })
    const ikona = rysujIkone(rozmiar)
    zapiszPng(join(katalog, 'ic_launcher.png'), rozmiar, rozmiar, ikona)
    zapiszPng(join(katalog, 'ic_launcher_round.png'), rozmiar, rozmiar, ikona)
    // Warstwa przednia ikony adaptacyjnej potrzebuje zapasu na maskę systemu.
    const przod = Math.round(rozmiar * 1.5)
    const wewnetrzna = rysujIkone(Math.round(przod * 0.62), false)
    const bok = Math.round(przod * 0.62)
    const odsun = Math.round((przod - bok) / 2)
    const warstwa = Buffer.alloc(przod * przod * 4)
    for (let y = 0; y < bok; y++) {
      for (let x = 0; x < bok; x++) {
        const zr = (y * bok + x) * 4
        if (wewnetrzna[zr + 3] === 0) continue
        const cel = ((y + odsun) * przod + (x + odsun)) * 4
        warstwa[cel] = wewnetrzna[zr]
        warstwa[cel + 1] = wewnetrzna[zr + 1]
        warstwa[cel + 2] = wewnetrzna[zr + 2]
        warstwa[cel + 3] = 255
      }
    }
    zapiszPng(join(katalog, 'ic_launcher_foreground.png'), przod, przod, warstwa)

    // Ikona powiadomień (biała sylwetka).
    const katalogDrawable = join(ANDROID_RES, `drawable-${gestosc}`)
    mkdirSync(katalogDrawable, { recursive: true })
    const rozmiarPow = Math.round(rozmiar * 0.5)
    zapiszPng(
      join(katalogDrawable, 'ic_stat_icon.png'),
      rozmiarPow,
      rozmiarPow,
      rysujIkonePowiadomienia(rozmiarPow),
    )
  }

  console.log(`Zapisano ikony Androida w ${ANDROID_RES}`)
} else {
  console.log('Katalog android/ nie istnieje – pomijam ikony Androida.')
}
