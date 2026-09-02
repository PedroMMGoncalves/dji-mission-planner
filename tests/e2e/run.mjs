/**
 * E2E sobre a build de produção, em Chromium headless.
 *
 * O que as suites em Node não conseguem ver é a ligação entre o painel, o
 * estado e a exportação — foi aí que viveram os defeitos que só o browser
 * apanhou: o plano do corredor nulo fora do seu separador, o modo que não
 * chegava ao componente, as ligações do terrain follow a 17,8 m do solo.
 * Aqui faz-se o que um operador faria — importar um polígono e um MDT,
 * ligar modos, exportar — e mede-se o ficheiro que sairia para o comando.
 *
 *   npm run build && npm run test:e2e
 *
 * Variáveis: E2E_ONLY (nomes de cenários, separados por vírgula), E2E_PORT (4173), E2E_CHROMIUM (caminho de um Chromium local em
 * vez do que o Playwright instala), E2E_OUT (pasta das capturas em falha).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { ground, makeFixtures, toM } from './fixtures.mjs'
import { analyseRoute, readRoutes } from './kmz.mjs'

const PORT = Number(process.env.E2E_PORT ?? 4173)
const URL = `http://127.0.0.1:${PORT}/dji-mission-planner/`
const OUT = resolve(process.env.E2E_OUT ?? 'tests/e2e/out')
const TOL_M = 5 // tolerância vertical por omissão do terrain follow

let fails = 0
let passes = 0
const check = (label, ok, detail = '') => {
  if (ok) passes += 1
  else fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`)
}

if (!existsSync('dist/index.html')) {
  console.error('sem dist/index.html — corra npm run build primeiro')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })

/* ---- servidor da build ------------------------------------------------ */
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
const up = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return true
    } catch { /* ainda a arrancar */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
if (!(await up())) {
  console.error(`servidor não respondeu em ${URL}\n${serverLog}`)
  server.kill()
  process.exit(2)
}

const fx = await makeFixtures(mkdtempSync(join(tmpdir(), 'dmp-e2e-')))
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

/* ---- passos de operador ------------------------------------------------ */
const label = (page, re) => page.locator('label', { hasText: re }).locator('input[type=checkbox]')
const TF = /Seguir terreno|Follow terrain/
const CROSS = /crosshatch/i
const NADIR = /Passagem nadir|nadir pass/i

async function openMission({ area, dem = true }) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)))
  // só a build local: mapas, relevo global e fontes externas ficam de fora
  await page.route('**/*', (route) =>
    route.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? route.continue() : route.abort(),
  )
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  const areaInput = page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
  await areaInput.waitFor({ state: 'attached', timeout: 20000 })
  await areaInput.setInputFiles(area)
  if (dem) {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((b) => /Importar MDT|Import DTM/.test(b.textContent))
      return b && !b.disabled
    }, null, { timeout: 15000 })
    await page.locator('input[accept=".tif,.tiff"]').setInputFiles(fx.dem)
    await page.waitForFunction(() => {
      const l = [...document.querySelectorAll('label')].find((l) => /Seguir terreno|Follow terrain/.test(l.textContent))
      const i = l?.querySelector('input')
      return i && !i.disabled
    }, null, { timeout: 20000 })
  }
  return { page, errors }
}

async function configure(page, { cross = false, nadir = false, tf = false, split = null }) {
  if (cross) await label(page, CROSS).check()
  if (nadir) await label(page, NADIR).check()
  if (tf) await label(page, TF).check()
  if (split) await page.getByRole('button', { name: split, exact: true }).click()
  await page.waitForTimeout(800)
}

async function exportKmz(page, file) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ }).click(),
  ])
  await dl.saveAs(file)
  return file
}

const bodyText = (page) => page.evaluate(() => document.body.innerText)

const ONLY = process.env.E2E_ONLY ? process.env.E2E_ONLY.split(',') : null
async function scenario(name, fn) {
  if (ONLY && !ONLY.includes(name)) return
  console.log(`\n## ${name}`)
  let ctx = null
  try {
    ctx = await fn()
  } catch (err) {
    fails += 1
    console.log(`FAIL  ${name}: ${err.message.split('\n')[0]}`)
    if (ctx?.page) await ctx.page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {})
  }
}

const clearanceOk = (r) => r.minClearance >= r.agl - TOL_M - 1

/* ---- cenários ---------------------------------------------------------- */
await scenario('rectangulo-crosshatch-tf', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await configure(page, { cross: true, tf: true })
  const txt = await bodyText(page)
  check('painel: waypoints com altura própria', /waypoints com altura própria|waypoints with individual heights/.test(txt))
  check('painel: fonte do terreno é o MDT local', /MDT local dem\.tif|local DTM dem\.tif/.test(txt))
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'rect-cross-tf.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground })
  check('rota única, sem valores não finitos', routes.length === 1 && r.nan === 0, `${r.n} waypoints`)
  check('folga ao solo ≥ AGL − tolerância em toda a rota', clearanceOk(r), `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`)
  check('disparo: um grupo por grelha, ligação entre grelhas sem disparo', r.groups.length === 2 && r.linksWithoutTrigger >= 1, `${r.groups.length} grupos, ${r.linksWithoutTrigger} ligações`)
  await page.getByRole('button', { name: /Vista 3D|3D View/ }).click()
  await page.waitForSelector('canvas', { timeout: 15000 })
  await page.waitForTimeout(1500)
  check('vista 3D abre sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('u-terrain-follow', async () => {
  const { page, errors } = await openMission({ area: fx.u })
  await configure(page, { tf: true })
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'u-tf.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground })
  // antes da correcção das ligações: 64,4 m para 100 m de AGL
  check('U: ligações através do entalhe sobem sobre a colina', clearanceOk(r), `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`)
  check('U: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('u-crosshatch-tf', async () => {
  const { page, errors } = await openMission({ area: fx.u })
  await configure(page, { cross: true, tf: true })
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'u-cross-tf.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground })
  // antes da correcção das ligações: 17,8 m para 100 m de AGL
  check('U + dupla grelha: folga ≥ AGL − tolerância, ligações incluídas', clearanceOk(r), `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`)
  check('U + dupla grelha: disparo suspenso nas travessias do entalhe', r.groups.length >= 3 && r.linksWithoutTrigger >= 3, `${r.groups.length} grupos, ${r.linksWithoutTrigger} ligações`)
  check('U + dupla grelha: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('blocos-bateria-crosshatch-nadir-tf', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await configure(page, { cross: true, nadir: true, tf: true, split: 'Bateria' })
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'blocos.zip')))
  const rs = routes.map((x) => analyseRoute(x.wpml, { toM, ground }))
  check('blocos: um KMZ por bloco', routes.length >= 2, `${routes.length} blocos`)
  check('blocos: folga ao solo em todos os blocos', rs.every(clearanceOk), rs.map((r) => r.minClearance.toFixed(0)).join(','))
  // cada bloco arranca da base: o primeiro troço é uma linha, não um ponto de ligação
  check('blocos: cada bloco começa numa linha de voo', rs.every((r) => r.firstSegM >= 100), rs.map((r) => r.firstSegM.toFixed(0)).join(','))
  check('blocos: intervalos de disparo válidos em índices locais', rs.every((r) => r.groups.length >= 1 && r.groups.every(([s, e]) => s <= e && e < r.n)))
  check('blocos: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('multipoligono-aviso', async () => {
  const { page, errors } = await openMission({ area: fx.multi })
  const txt = await bodyText(page)
  check('importação: aviso de polígonos ignorados', /2 polígono\(s\) a mais|2 extra polygon/.test(txt),
    txt.split('\n').filter((l) => /pol[ií]gon|ignor/i.test(l)).join(' | ').slice(0, 200))
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'multi.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground })
  check('importação: o maior polígono é o exportado (rectângulo, um grupo de disparo)', r.n > 20 && r.groups.length === 1, `${r.n} waypoints`)
  check('importação: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- fim ----------------------------------------------------------------- */
await browser.close()
server.kill()
console.log(`\n${passes} PASS, ${fails} FAIL`)
if (fails > 0) {
  console.log(`capturas e ficheiros em ${OUT}`)
  process.exit(1)
}
console.log('E2E: TODOS OS CENARIOS PASSARAM')
