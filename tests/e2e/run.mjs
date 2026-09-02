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
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
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
// O vite é lançado directamente (sem npx) e no seu próprio grupo de
// processos: matar só o npx deixava o vite vivo com o pipe aberto, e o
// Node nunca terminava — no CI o job ficou pendurado até ao timeout com
// os 19 PASS já impressos.
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
)
const stopServer = () => {
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* já terminou */ }
}
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
  stopServer()
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

/* ---- outros modos: desenhados no mapa, como o operador faz ------------- */
// O mapa fica ajustado ao rectângulo importado (~1 px ≈ 2 m), por isso os
// cliques a algumas centenas de píxeis do centro dão eixos de ~1 km.
async function clickMap(page, dx, dy) {
  const box = await page.locator('.leaflet-container').boundingBox()
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
  await page.waitForTimeout(250)
}
const modo = (page, re) => page.getByRole('button', { name: re, exact: true }).click()
const panelExport = async (page, re, file) => {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: re }).click(),
  ])
  await dl.saveAs(file)
  return file
}
const plano = { toM, ground: () => 0 }

await scenario('corredor-desenhado', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Corredor$|^Corridor$/)
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, -300, 40)
  await clickMap(page, 0, -60)
  await clickMap(page, 300, 40)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  // meia-largura de 300 m: várias passagens em vez da passagem única por omissão
  await page.locator('label', { hasText: /Meia-largura|Half-width/ }).locator('input').fill('300')
  await page.waitForTimeout(800)
  const txt = await bodyText(page)
  check('corredor: painel mostra as passagens', /passagens|passes/.test(txt))
  const routes = await readRoutes(await panelExport(page, /Exportar WPML \(KMZ\)|Export WPML \(KMZ\)/, join(OUT, 'corredor.kmz')))
  const r = analyseRoute(routes[0].wpml, plano)
  check('corredor: rota com várias passagens, gimbal nadir e disparo por distância',
    r.n >= 6 && r.groups.length >= 1 && /gimbalPitchRotateAngle>-90</.test(routes[0].wpml) && /multipleDistance/.test(routes[0].wpml),
    `${r.n} waypoints, ${r.groups.length} grupos`)
  check('corredor: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('fachada-desenhada', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Fachada$|^Face$/)
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, -200, 0)
  await clickMap(page, 200, 0)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  await page.waitForTimeout(800)
  const routes = await readRoutes(await panelExport(page, /Exportar WPML \(KMZ\)|Export WPML \(KMZ\)/, join(OUT, 'fachada.kmz')))
  const wpml = routes[0].wpml
  const rumos = [...wpml.matchAll(/<wpml:waypointHeadingAngle>([-\d.]+)</g)].map((m) => Number(m[1]))
  const r = analyseRoute(wpml, plano)
  check('fachada: passagens empilhadas com rumo fixo em [-180, 180] e uma foto por waypoint',
    r.n >= 4 && rumos.length === r.n && rumos.every((h) => h >= -180 && h <= 180) && (wpml.match(/takePhoto/g) ?? []).length >= r.n,
    `${r.n} waypoints, ${rumos.length} rumos`)
  check('fachada: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('orbita-marcada', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Órbita$|^Orbit$/)
  await page.getByRole('button', { name: /Marcar POI|Mark POI/ }).click()
  await clickMap(page, 0, 0)
  await page.waitForTimeout(800)
  const single = await readRoutes(await panelExport(page, /Exportar missão única|Export single mission/, join(OUT, 'orbita.kmz')))
  const r = analyseRoute(single[0].wpml, plano)
  check('órbita: anel de waypoints em voo curvo contínuo',
    r.n >= 8 && /ContinuityCurvature|coordinateTurn/.test(single[0].wpml), `${r.n} waypoints`)
  const perLevel = await readRoutes(await panelExport(page, /um KMZ por nível|one KMZ per level/, join(OUT, 'orbita-niveis.zip')))
  check('órbita: um KMZ por nível', perLevel.length >= 1 && perLevel.every((x) => analyseRoute(x.wpml, plano).n >= 8), `${perLevel.length} níveis`)
  await modo(page, /^Área$|^Area$/)
  await page.waitForTimeout(500)
  const txt = await bodyText(page)
  check('resumo do projecto conta a área e a órbita em qualquer separador', /2 planos|2 plans/.test(txt))
  check('órbita: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Projecto: gravação automática, recarregar a página, guardar em ficheiro
// e abrir — a ligação entre o estado e o ficheiro de projecto que nenhuma
// suite em Node exercita de ponta a ponta.
await scenario('projecto-autosave-ficheiro', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  const nameInput = page.getByPlaceholder(/nome-da-missao|mission-name/)
  await nameInput.fill('projecto-e2e')
  await label(page, CROSS).check()
  await page.waitForTimeout(1200) // autosave com debounce de 500 ms
  const stored = await page.evaluate(() => localStorage.getItem('dji-mission-planner:project:v1'))
  const saved = stored ? JSON.parse(stored) : null
  check('projecto: autosave em localStorage com versão 2 e área',
    saved?.version === 2 && saved.missionName === 'projecto-e2e' && Array.isArray(saved.ring) && saved.ring.length >= 3)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]').waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(800)
  check('projecto: nome e dupla grelha sobrevivem ao recarregar',
    (await nameInput.inputValue()) === 'projecto-e2e' && (await label(page, CROSS).isChecked()))
  const afterReload = await bodyText(page)
  check('projecto: a área volta com o plano calculado', /Exportar WPML|Export Advanced WPML/.test(afterReload) &&
    (await page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ }).isEnabled()))

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Guardar projecto|Save project/ }).click(),
  ])
  const file = join(OUT, 'projecto-e2e.json')
  await dl.saveAs(file)
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  check('projecto: ficheiro guardado com o mesmo conteúdo do autosave',
    onDisk.version === 2 && onDisk.missionName === 'projecto-e2e' && onDisk.params?.crosshatch === true &&
      JSON.stringify(onDisk.ring) === JSON.stringify(saved.ring))

  // estado limpo, depois abrir o ficheiro: tudo tem de voltar
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]').waitFor({ state: 'attached', timeout: 20000 })
  check('projecto: sem projecto gravado o nome volta ao defeito', (await nameInput.inputValue()) !== 'projecto-e2e')
  await page.locator('input[accept=".json"]').setInputFiles(file)
  await page.waitForTimeout(800)
  check('projecto: abrir o ficheiro repõe nome, dupla grelha e área',
    (await nameInput.inputValue()) === 'projecto-e2e' && (await label(page, CROSS).isChecked()) &&
      (await page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ }).isEnabled()))
  check('projecto: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- fim ----------------------------------------------------------------- */
await browser.close()
stopServer()
console.log(`\n${passes} PASS, ${fails} FAIL`)
if (fails > 0) {
  console.log(`capturas e ficheiros em ${OUT}`)
  process.exit(1)
}
console.log('E2E: TODOS OS CENARIOS PASSARAM')
process.exit(0)
