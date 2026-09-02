/**
 * Leitura e medição de uma exportação WPML: um KMZ (uma rota) ou um ZIP
 * com um KMZ por bloco. Mede o que interessa ao voo e não se vê na
 * interface — a folga ao solo ao longo de TODA a rota, ligações incluídas,
 * e os intervalos em que a câmara dispara.
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'

/** Devolve [{ name, wpml }] para cada rota dentro do ficheiro. */
export async function readRoutes(file) {
  const zip = await JSZip.loadAsync(readFileSync(file))
  const inner = Object.keys(zip.files).filter((n) => n.endsWith('.kmz'))
  if (inner.length === 0) {
    return [{ name: file.split('/').pop(), wpml: await zip.file('wpmz/waylines.wpml').async('string') }]
  }
  const out = []
  for (const name of inner.sort()) {
    const kmz = await JSZip.loadAsync(await zip.file(name).async('nodebuffer'))
    out.push({ name, wpml: await kmz.file('wpmz/waylines.wpml').async('string') })
  }
  return out
}

/**
 * Mede uma rota. `toM` converte [lon, lat] para metros locais e `ground`
 * dá a cota do solo nesses metros. A altura de cada waypoint é relativa ao
 * solo do primeiro (é o que o WPML relativeToStartPoint significa quando a
 * base não está marcada), pelo que o AGL pedido é a altura do primeiro.
 */
export function analyseRoute(wpml, { toM, ground }) {
  const wps = wpml.split('<Placemark>').slice(1).map((p) => {
    const c = /<coordinates>\s*([-\d.]+),([-\d.]+)/.exec(p)
    const h = /<wpml:executeHeight>([-\d.]+)</.exec(p)
    return [...toM(Number(c[1]), Number(c[2])), Number(h[1])]
  })
  const ref = ground(wps[0][0], wps[0][1])
  const agl = wps[0][2]
  const groups = [...wpml.matchAll(
    /<wpml:actionGroupStartIndex>(\d+)<\/wpml:actionGroupStartIndex>\s*<wpml:actionGroupEndIndex>(\d+)<\/wpml:actionGroupEndIndex>\s*<wpml:actionGroupMode>parallel/g,
  )].map((m) => [Number(m[1]), Number(m[2])])
  const inGroup = (i) => groups.some(([s, e]) => i - 1 >= s && i <= e)

  let minClearance = Infinity
  let minAt = null
  let maxJump = 0
  let linksWithoutTrigger = 0
  for (let i = 1; i < wps.length; i++) {
    const [x0, y0, h0] = wps[i - 1]
    const [x1, y1, h1] = wps[i]
    maxJump = Math.max(maxJump, Math.hypot(x1 - x0, y1 - y0))
    if (!inGroup(i)) linksWithoutTrigger += 1
    for (let s = 0; s <= 25; s++) {
      const t = s / 25
      const c = ref + h0 + (h1 - h0) * t - ground(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
      if (c < minClearance) {
        minClearance = c
        minAt = `segmento ${i} em (${(x0 + (x1 - x0) * t).toFixed(0)}, ${(y0 + (y1 - y0) * t).toFixed(0)})`
      }
    }
  }
  const firstSegM = wps.length > 1 ? Math.hypot(wps[1][0] - wps[0][0], wps[1][1] - wps[0][1]) : 0
  const nan = wps.filter((w) => !w.every(Number.isFinite)).length
  return { n: wps.length, agl, groups, minClearance, minAt, maxJump, linksWithoutTrigger, firstSegM, nan }
}
