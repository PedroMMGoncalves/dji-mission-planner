/*
 * Pacote R-A da revisao do codigo (M3-T1): as definicoes dos CRS de
 * importacao (areas projectadas e MDT GeoTIFF) contra pontos de controlo
 * conhecidos, e nao so por ida e volta consigo proprias. O EPSG:20790
 * (Hayford-Gauss Militar) tinha o meridiano central 0,065 graus a leste do
 * do registo EPSG: uma area ou um MDT nesse sistema entravam 5,4-5,8 km ao
 * lado.
 */
import proj4 from 'proj4'
import { describe, expect, test } from 'vitest'
import { CRS_OPTIONS } from '../../src/utils/importArea.js'

const def = (code) => CRS_OPTIONS.find((o) => o.code === code).def
const fwd = (code, lonLat) => proj4('EPSG:4326', def(code), lonLat)
const inv = (code, xy) => proj4(def(code), 'EPSG:4326', xy)

// Melrica (vertice da origem das grelhas portuguesas), em ETRS89/WGS84
const MELRICA = [-8.13310833333333, 39.6682583333333]
const CIDADES = {
  Lisboa: [-9.1394, 38.7139],
  Porto: [-8.611, 41.1496],
  Faro: [-7.9304, 37.0194],
  Braganca: [-6.7567, 41.8061],
}

/** Meridiano central em Greenwich, lido da definicao (`+lon_0` e `+pm=lisbon`). */
function centralMeridian(d) {
  const lon0 = Number(/\+lon_0=(-?[\d.]+)/.exec(d)?.[1] ?? NaN)
  const zone = /\+zone=(\d+)/.exec(d)
  if (zone) return Number(zone[1]) * 6 - 183
  const pm = /\+pm=lisbon/.test(d) ? -9.13190611111111 : 0
  return lon0 + pm
}

describe('M3-T1: as definicoes dos CRS contra pontos de controlo', () => {
  test('Militar (20790) = Hayford-Gauss 73 (27493) + (200 000, 300 000) em quatro cidades, a menos de 1 m', () => {
    for (const [nome, ll] of Object.entries(CIDADES)) {
      const mil = fwd('EPSG:20790', ll)
      const hg = fwd('EPSG:27493', ll)
      expect(Math.abs(mil[0] - hg[0] - 200000), `${nome} x`).toBeLessThan(1)
      expect(Math.abs(mil[1] - hg[1] - 300000), `${nome} y`).toBeLessThan(1)
    }
  })

  test('as origens das grelhas caem em Melrica, a menos de 1 m', () => {
    const d = (ll) => proj4('EPSG:4326', def('EPSG:3763'), ll)
    const o3763 = d(inv('EPSG:3763', [0, 0]))
    expect(Math.hypot(o3763[0], o3763[1])).toBeLessThan(1)
    const o20790 = d(inv('EPSG:20790', [200000, 300000]))
    expect(Math.hypot(o20790[0], o20790[1])).toBeLessThan(1)
    // no Datum 73 a origem falsa (180,598; -86,99) poe o vertice de Melrica em (0, 0)
    const o27493 = d(inv('EPSG:27493', [0, 0]))
    expect(Math.hypot(o27493[0], o27493[1])).toBeLessThan(1)
    const m = d(MELRICA)
    expect(Math.hypot(m[0], m[1])).toBeLessThan(0.01)
  })

  test('meridianos centrais das definicoes', () => {
    expect(centralMeridian(def('EPSG:3763'))).toBeCloseTo(-8.13310833, 6)
    expect(centralMeridian(def('EPSG:27493'))).toBeCloseTo(-8.13190611, 6)
    expect(centralMeridian(def('EPSG:20790'))).toBeCloseTo(-8.13190611, 6)
    expect(centralMeridian(def('EPSG:25829'))).toBe(-9)
    expect(centralMeridian(def('EPSG:32629'))).toBe(-9)
  })

  test('ida e volta em cada definicao (a condicao necessaria, nao suficiente)', () => {
    for (const o of CRS_OPTIONS) {
      const xy = proj4('EPSG:4326', o.def, CIDADES.Lisboa)
      const back = proj4(o.def, 'EPSG:4326', xy)
      expect(Math.abs(back[0] - CIDADES.Lisboa[0]), o.code).toBeLessThan(1e-7)
      expect(Math.abs(back[1] - CIDADES.Lisboa[1]), o.code).toBeLessThan(1e-7)
    }
  })
})
