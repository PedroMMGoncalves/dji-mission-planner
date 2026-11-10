/*
 * Coerencia template.kml <-> waylines.wpml, waypoint a waypoint, nos
 * ficheiros dourados da fachada e da orbita e nos casos da matriz da
 * circular e dos pontos de inspeccao (#50; M2 da revisao da exportacao).
 * O Pilot 2 voa o waylines tal como vem, mas regenera-o a partir do
 * template quando a missao e editada e gravada no comando: o rumo e os
 * grupos de accoes de cada waypoint tem de ser os mesmos nos dois.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { validateWpml } from '../lib/wpml-conformidade.mjs'
import { casosMatriz, ficheiros } from '../lib/wpml-matriz.mjs'

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden')
const golden = (n) => ({
  template: readFileSync(join(GOLDEN, `${n}.template.kml`), 'utf8'),
  waylines: readFileSync(join(GOLDEN, `${n}.waylines.wpml`), 'utf8'),
})
const matriz = (n) => ficheiros(casosMatriz().find((c) => c.name === n).params)

const placemarks = (xml) => xml.split('<Placemark>').slice(1)
const val = (xml, tag) => xml?.match(new RegExp(`<wpml:${tag}>([^<]*)<`))?.[1] ?? null
const bloco = (xml, tag) =>
  xml.match(new RegExp(`<wpml:${tag}>[\\s\\S]*?</wpml:${tag}>`))?.[0] ?? null
const rumo = (h) => ({
  mode: val(h, 'waypointHeadingMode'),
  angle: Number(val(h, 'waypointHeadingAngle')),
  path: val(h, 'waypointHeadingPathMode'),
})
const grupos = (p) =>
  (p.match(/<wpml:actionGroup>[\s\S]*?<\/wpml:actionGroup>/g) ?? []).map((g) =>
    g.replace(/\s+/g, ''),
  )

/** Rumo efectivo de cada waypoint do template: o proprio, ou o global. */
function rumosTemplate(tpl) {
  const global = rumo(bloco(tpl, 'globalWaypointHeadingParam'))
  return placemarks(tpl).map((p) =>
    val(p, 'useGlobalHeadingParam') === '0' ? rumo(bloco(p, 'waypointHeadingParam')) : global,
  )
}
const rumosWaylines = (wl) => placemarks(wl).map((p) => rumo(bloco(p, 'waypointHeadingParam')))

const CASOS = [
  // rumo proprio: a fachada olha para a parede (um so angulo), a orbita
  // para o centro (um angulo por ponto)
  ['golden fachada', () => golden('fachada'), 'fixo'],
  ['golden orbita', () => golden('orbita'), 'variavel'],
  ['matriz circular-m3e', () => matriz('circular-m3e'), null],
  ['matriz inspeccao-m3e', () => matriz('inspeccao-m3e'), null],
]

describe('template e waylines: o mesmo rumo e os mesmos grupos em cada waypoint (#50)', () => {
  for (const [nome, carregar, rumoProprio] of CASOS) {
    describe(nome, () => {
      const { template, waylines } = carregar()
      test('mesmo numero de waypoints', () => {
        expect(placemarks(template).length).toBe(placemarks(waylines).length)
        expect(placemarks(template).length).toBeGreaterThan(2)
      })
      test('rumo de cada waypoint igual nos dois ficheiros (modo, angulo, sentido)', () => {
        const t = rumosTemplate(template)
        const w = rumosWaylines(waylines)
        expect(t).toEqual(w)
        // a fachada e a orbita tem rumo proprio em cada ponto (o alvo); o
        // template di-lo com useGlobalHeadingParam 0, e nao com o global
        if (rumoProprio) {
          expect(t.every((r) => r.mode === 'smoothTransition')).toBe(true)
          const angulos = new Set(t.map((r) => r.angle)).size
          if (rumoProprio === 'fixo') expect(angulos).toBe(1)
          else expect(angulos).toBeGreaterThan(1)
        }
      })
      test('mesmos grupos de accoes em cada waypoint', () => {
        const t = placemarks(template).map(grupos)
        const w = placemarks(waylines).map(grupos)
        expect(t).toEqual(w)
        expect(t.flat().length).toBeGreaterThan(0)
      })
      test('o template nao leva waypointHeadingAngleEnable; o waylines leva-o em cada ponto', () => {
        expect(template).not.toMatch(/waypointHeadingAngleEnable/)
        expect((waylines.match(/<wpml:waypointHeadingAngleEnable>/g) ?? []).length).toBe(
          placemarks(waylines).length,
        )
      })
      test('o gimbal e manual, com o pitch planeado nos gimbalRotate dos dois ficheiros', () => {
        expect(val(template, 'gimbalPitchMode')).toBe('manual')
        expect(template).not.toMatch(/gimbalPitchAngle/)
        const pitches = (xml) =>
          [...xml.matchAll(/<wpml:gimbalPitchRotateAngle>([^<]+)</g)].map((m) => m[1])
        expect(pitches(template)).toEqual(pitches(waylines))
        expect(pitches(template).length).toBeGreaterThan(0)
      })
    })
  }
})

describe('validador: waypointHeadingAngleEnable so no waylines', () => {
  test('no Placemark do template e um elemento sem prova', () => {
    const { template, waylines } = matriz('fachada-m3e')
    const [cabeca, ...resto] = template.split('<Placemark>')
    const comEnable = [
      cabeca,
      ...resto.map((p) =>
        p.replace(
          /(<wpml:waypointPoiPoint>[^<]*<\/wpml:waypointPoiPoint>)/,
          '$1\n          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>',
        ),
      ),
    ].join('<Placemark>')
    expect(comEnable).not.toBe(template)
    expect(validateWpml({ template, waylines }).errors).toEqual([])
    const erros = validateWpml({ template: comEnable, waylines }).errors
    expect(erros.map((e) => e.code)).toContain('unknown-element')
    expect(erros.every((e) => e.file !== 'waylines')).toBe(true)
  })
})
