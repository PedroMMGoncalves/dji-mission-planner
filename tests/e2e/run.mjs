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
 * vez do que o Playwright instala), E2E_OUT (pasta das capturas em falha),
 * E2E_COBERTURA=1 (cobertura do código do ecrã sobre a build com mapas de
 * fontes: `npm run test:e2e:cobertura`, ver cobertura.mjs).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import Ajv2020 from 'ajv/dist/2020.js'
import JSZip from 'jszip'
import jsQR from 'jsqr'
import * as turf from '@turf/turf'
import {
  HOLE,
  MESAS,
  RIDGE,
  ground,
  hillRing,
  makeFixtures,
  rectRing,
  toLL,
  toM,
} from './fixtures.mjs'
import { analyseRoute, readRoutes } from './kmz.mjs'
import { buildProfile } from '../../src/mission/elevationProfile.js'
import { conferir, gravarReferencia, impressaoFicheiro } from './impressoes.mjs'

const PORT = Number(process.env.E2E_PORT ?? 4173)
const URL = `http://127.0.0.1:${PORT}/dji-mission-planner/`
const OUT = resolve(process.env.E2E_OUT ?? 'tests/e2e/out')
const AGL_M = 100 // altura AGL por omissao da interface, usada nos cenarios
const TOL_M = 5 // tolerância vertical por omissão do terrain follow
// Cobertura (E2E_COBERTURA): a build com mapas de fontes em vez do dist/ e a
// cobertura JS de cada página; sem a variável o módulo nem carrega.
const cobertura = ['', '0'].includes(process.env.E2E_COBERTURA ?? '')
  ? null
  : await import('./cobertura.mjs')
const DIST = cobertura ? cobertura.DIST : 'dist'

let fails = 0
let passes = 0
const check = (label, ok, detail = '') => {
  if (ok) passes += 1
  else fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`)
}
// Toda a rota exportada tem de ser executável pelo comando: waypoints
// consecutivos a pelo menos 0,5 m (em 3D), o mínimo que a DJI aceita.
const executavel = (r) =>
  check(
    'rota executável: waypoints consecutivos a >= 0,5 m',
    Number.isFinite(r.minStep3DM) && r.minStep3DM >= 0.5,
    `passo mínimo ${Number.isFinite(r.minStep3DM) ? r.minStep3DM.toFixed(2) : '?'} m`,
  )

if (!existsSync(join(DIST, 'index.html'))) {
  const build = cobertura ? 'npm run test:e2e:cobertura' : 'npm run build'
  console.error(`sem ${DIST}/index.html — corra ${build} primeiro`)
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
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    ...(cobertura ? ['--outDir', DIST] : []),
    '--port',
    String(PORT),
    '--strictPort',
    '--host',
    '127.0.0.1',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
)
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    /* já terminou */
  }
}
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
const up = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return true
    } catch {
      /* ainda a arrancar */
    }
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
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
})

/* ---- passos de operador ------------------------------------------------ */
const label = (page, re) => page.locator('label', { hasText: re }).locator('input[type=checkbox]')
const TF = /Seguir terreno|Follow terrain/
const CROSS = /crosshatch/i
const NADIR = /Passagem nadir|nadir pass/i

/**
 * Tile Terrarium de 256 x 256 todo à mesma cota: R*256 + G + B/256 - 32768,
 * logo (128, 0, 0) é 0 m. PNG RGB sem filtro, feito à mão com o zlib.
 */
function solidTerrariumPng([r, g, b]) {
  const W = 256
  const row = Buffer.alloc(1 + W * 3)
  for (let x = 0; x < W; x++) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: W }, () => row))
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(W, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const FLAT_TILE = solidTerrariumPng([128, 0, 0])

async function openMission({
  viewport = { width: 1500, height: 950 },
  area = null,
  dem = true,
  demFile = null,
  globalTerrain = true,
  disclaimer = true,
  // corre antes da página (p. ex. um localStorage que recusa, um projecto gravado)
  initScript = null,
  // pedidos locais a abortar (um bloco sob demanda que «não chega»)
  abort = null,
  // num contexto próprio, onde se podem abrir outros separadores (fecha-se com a página)
  separadores = false,
}) {
  const page = separadores
    ? await (await browser.newContext({ viewport, acceptDownloads: true })).newPage()
    : await browser.newPage({ viewport, acceptDownloads: true })
  currentPage = page
  // antes da navegação; o page.close() passa a recolhê-la (cobertura.mjs)
  if (cobertura) await cobertura.iniciar(page)
  if (initScript) await page.addInitScript(initScript)
  // aviso antes de usar já aceite neste "aparelho" (o cenário do aviso testa-o)
  if (disclaimer)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('dji-mission-planner:disclaimer', '2')
      } catch {
        /* armazenamento recusado: o cenário trata do aviso */
      }
    })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)))
  // só a build local: mapas e fontes externas ficam de fora; o relevo global
  // é um chão plano a 0 m servido aqui (não há exportação sem relevo)
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (abort && abort.test(url)) return route.abort()
    if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue()
    if (globalTerrain && /elevation-tiles-prod\/terrarium\//.test(url))
      return route.fulfill({ status: 200, contentType: 'image/png', body: FLAT_TILE })
    return route.abort()
  })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  // o painel da área como abre (uma secção de cada vez: a da área e, quando
  // a área chega, a dos parâmetros de voo): os passos abrem a secção do que
  // vão usar (abrirNoPainel)
  if (!area) return { page, errors }
  const areaInput = page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
  await areaInput.waitFor({ state: 'attached', timeout: 20000 })
  await areaInput.setInputFiles(area)
  if (dem) {
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll('button')].find((b) =>
          /Importar MDT|Import DTM/.test(b.textContent),
        )
        return b && !b.disabled
      },
      null,
      { timeout: 15000 },
    )
    await page.locator('input[accept=".tif,.tiff"]').setInputFiles(demFile ?? fx.dem)
    await page.waitForFunction(
      () => {
        const l = [...document.querySelectorAll('label')].find((l) =>
          /Seguir terreno|Follow terrain/.test(l.textContent),
        )
        const i = l?.querySelector('input')
        return i && !i.disabled
      },
      null,
      { timeout: 20000 },
    )
  }
  return { page, errors }
}

/** Espera que o botão de exportação do cabeçalho fique activo (relevo carregado). */
async function exportReady(page) {
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('header button')].find((b) =>
        /Exportar WPML|Export Advanced WPML/.test(b.textContent),
      )
      return b && !b.disabled
    },
    null,
    { timeout: 40000 },
  )
}
const DOWNLOAD_GLOBAL = /Descarregar relevo global|Download global terrain/

/**
 * Abre a secção `card-<card>` de um painel, se está fechada, antes de mexer
 * no que tem dentro. Os painéis (o da área e os dos outros modos) abrem uma
 * secção de cada vez, e a fechada esconde os campos: como o operador,
 * abre-se a secção do que se vai usar (e a que estava aberta fecha-se).
 */
async function abrirNoPainel(page, card) {
  const botao = page.getByTestId(`card-${card}`).locator(':scope > h3 > button')
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
}

async function configure(page, { cross = false, nadir = false, tf = false, split = null }) {
  // dupla grelha e passagem nadir: na gaveta do cartão «Parâmetros de voo»
  if (cross || nadir) await openDrawer(page, 'voo')
  if (cross) await label(page, CROSS).check()
  if (nadir) await label(page, NADIR).check()
  await closeDrawer(page)
  // seguir terreno na secção dos parâmetros de voo; a divisão, na dela
  if (tf) {
    await abrirNoPainel(page, 'voo')
    await label(page, TF).check()
  }
  if (split) {
    await abrirNoPainel(page, 'divisao')
    await page.getByRole('button', { name: split, exact: true }).click()
  }
  await page.waitForTimeout(800)
}

// O botão de exportar a missão do cabeçalho; os painéis dos modos têm um
// botão com o mesmo nome (o cartão do plano), por isso cada um se procura
// no seu sítio. O rótulo diz o que sai: «(KMZ)», ou «(ZIP)» com vários voos.
const HEADER_EXPORT = /Exportar WPML Avançado|Export Advanced WPML/
const headerExport = (page) => page.locator('header').getByRole('button', { name: HEADER_EXPORT })
// «Exportar KML da área», o par KML do botão da missão: o polígono da área,
// ou com a área em vários voos os KML dos blocos num ZIP; e, nesse caso,
// «Polígono da área (KML)», só o polígono, na seta
const AREA_KML = /Exportar KML da área|Export area KML/
const AREA_POLYGON = /Polígono da área|Area polygon/
// As outras exportações do separador estão no menu da seta do botão de
// exportar do cabeçalho (os itens só existem com o menu aberto): abre-o, se
// estiver fechado, e devolve o cabeçalho, onde estão os itens.
async function headerMenu(page) {
  const seta = page
    .locator('header')
    .getByRole('button', { name: /Outras exportações|Other exports/ })
  if ((await seta.getAttribute('aria-expanded')) !== 'true') await seta.click()
  return page.locator('header')
}
// o polígono da área do cabeçalho, no menu da seta: «Polígono da área (KML)»
// com a área em vários voos, senão «Exportar KML da área», que é ele (o fim
// do cartão 7 tem o mesmo botão)
const headerKml = async (page) => {
  const menu = await headerMenu(page)
  const poligono = menu.getByRole('menuitem', { name: AREA_POLYGON })
  return (await poligono.count()) > 0 ? poligono : menu.getByRole('menuitem', { name: AREA_KML })
}
// O campo de ficheiro do projecto do cartão 1; o menu do projecto do
// cabeçalho tem outro igual (header-project-file).
const projectFile = (page) => page.getByTestId('card-missao').locator('input[accept=".json"]')
/** O nome de um item do menu: a primeira linha (a segunda diz o que sai). */
const itemName = async (item) => (await item.innerText()).split('\n')[0].trim()
const panelExportButton = (page, card) =>
  page.getByTestId(`card-${card}`).getByRole('button', { name: HEADER_EXPORT })
/** O rótulo do botão condiz com o ficheiro: «(ZIP)» para um .zip, «(KMZ)» para um .kmz. */
async function rotuloCondiz(locator, fileName) {
  const txt = await locator.innerText()
  return /\.zip$/i.test(fileName) ? /\(ZIP\)/.test(txt) : /\(KMZ\)/.test(txt)
}

async function exportKmz(page, file) {
  const btn = headerExport(page)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), btn.click()])
  await dl.saveAs(file)
  check(
    'cabeçalho: o rótulo diz o tipo do ficheiro que saiu',
    await rotuloCondiz(btn, dl.suggestedFilename()),
    `${(await btn.innerText()).trim()} → ${dl.suggestedFilename()}`,
  )
  return file
}

const bodyText = (page) => page.evaluate(() => document.body.innerText)
const pillText = async (page) => (await page.getByTestId('preflight-pill').innerText()).trim()
// sem bloqueios a pastilha diz «Pronto a exportar» ou só os avisos («3 avisos»,
// sem «0 bloqueios» à frente); nunca um «N bloqueio(s)»
const semBloqueio = (txt) =>
  /Pronto a exportar|Ready to export|\d+ avisos?\b|\d+ warnings?\b/.test(txt) &&
  !/[1-9]\d* bloqueios?|[1-9]\d* blockers?/.test(txt)

const ONLY = process.env.E2E_ONLY ? process.env.E2E_ONLY.split(',') : null
// os nomes registados, para um E2E_ONLY com um nome que não existe não
// «passar» com 0 cenários (M3-T14)
const SCENARIOS = []
// a última página aberta por openMission: quando um cenário lança, o seu
// `ctx` nunca chega a existir e a captura em falha não acontecia (M3-T14)
let currentPage = null
async function scenario(name, fn) {
  SCENARIOS.push(name)
  if (ONLY && !ONLY.includes(name)) return
  console.log(`\n## ${name}`)
  let ctx = null
  try {
    ctx = await fn()
  } catch (err) {
    fails += 1
    console.log(`FAIL  ${name}: ${err.message.split('\n')[0]}`)
    const page = ctx?.page ?? currentPage
    if (page && !page.isClosed()) {
      await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {})
      await page.close().catch(() => {})
    }
  }
}

const clearanceOk = (r) => r.minClearance >= r.agl - TOL_M - 1

/* ---- cenários ---------------------------------------------------------- */
await scenario('rectangulo-crosshatch-tf', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  // o datum está na gaveta do cartão «Área e relevo»
  await openDrawer(page, 'area')
  check(
    'terreno: datum vertical apresentado no painel (MDT sem GeoKeys verticais)',
    /Datum vertical: não declarado|Vertical datum: not declared/.test(await bodyText(page)),
  )
  await closeDrawer(page)
  await configure(page, { cross: true, tf: true })
  const txt = await bodyText(page)
  check(
    'painel: waypoints com altura própria',
    /waypoints com altura própria|waypoints with individual heights/.test(txt),
  )
  check('painel: fonte do terreno é o MDT local', /MDT local dem\.tif|local DTM dem\.tif/.test(txt))
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'rect-cross-tf.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground, aglNominalM: AGL_M })
  executavel(r)
  check(
    'rota única, sem valores não finitos',
    routes.length === 1 && r.nan === 0,
    `${r.n} waypoints`,
  )
  check(
    'folga ao solo ≥ AGL − tolerância em toda a rota',
    clearanceOk(r),
    `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`,
  )
  check(
    'disparo: um grupo por grelha, ligação entre grelhas sem disparo',
    r.groups.length === 2 && r.linksWithoutTrigger >= 1,
    `${r.groups.length} grupos, ${r.linksWithoutTrigger} ligações`,
  )
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
  const r = analyseRoute(routes[0].wpml, { toM, ground, aglNominalM: AGL_M })
  executavel(r)
  // antes da correcção das ligações: 64,4 m para 100 m de AGL
  check(
    'U: ligações através do entalhe sobem sobre a colina',
    clearanceOk(r),
    `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`,
  )
  check('U: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* Paragem nos waypoints: com seguimento de terreno as faixas levam vértices
   a meio. Por omissão passam sem parar e só os cantos param; «Em todos»
   repõe a paragem em cada ponto. */
const PASS_MODE = 'toPointAndPassWithContinuityCurvature'
const STOP_MODE = 'toPointAndStopWithDiscontinuityCurvature'
const turnModes = (wpml) => [...wpml.matchAll(/<wpml:waypointTurnMode>([^<]+)</g)].map((m) => m[1])

// Os alvos GCP arrastam-se no mapa e o ponto fica no projecto, pelo id do
// alvo; «Repor posições» devolve-os à heurística
await scenario('gcp-arrastar-alvo', async () => {
  const { page } = await openMission({ area: fx.rect })
  await openDrawer(page, 'extras')
  await page.getByLabel(/Planear posições de GCPs|Plan GCP positions/).check()
  const marker = page.locator('.gcp-marker').first()
  await marker.waitFor({ state: 'visible', timeout: 10000 })
  const n0 = await page.locator('.gcp-marker').count()
  const box = await marker.boundingBox()
  const x0 = box.x + box.width / 2
  const y0 = box.y + box.height / 2
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + 40, y0, { steps: 6 })
  await page.mouse.move(x0 + 80, y0, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(1200) // autosave com debounce de 500 ms
  const manual = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('dji-mission-planner:project:v1') ?? 'null')?.gcpConfig
        ?.manual ?? {},
  )
  const ids = Object.keys(manual)
  check(
    'gcp: o alvo arrastado fica no projecto, pelo seu id',
    ids.length === 1 && /^GCP-\d+$/.test(ids[0]) && Array.isArray(manual[ids[0]]),
    JSON.stringify(manual),
  )
  const moved = page.locator('.gcp-marker.gcp-manual')
  const box2 = await moved.first().boundingBox()
  check(
    'gcp: o marcador movido fica assinalado, a Este de onde estava, e os alvos continuam todos',
    (await moved.count()) === 1 &&
      (await page.locator('.gcp-marker').count()) === n0 &&
      box2 != null &&
      box2.x > box.x + 50,
    `${await moved.count()} movidos, ${await page.locator('.gcp-marker').count()}/${n0} alvos, x ${box?.x?.toFixed(0)} → ${box2?.x?.toFixed(0)}`,
  )
  await page
    .getByTestId('gcp-manual')
    .getByRole('button', { name: /Repor posições|Reset positions/ })
    .click()
  await page.waitForTimeout(300)
  check(
    'gcp: «Repor posições» devolve o alvo à heurística',
    (await moved.count()) === 0 && (await page.getByTestId('gcp-manual').count()) === 0,
    `${await moved.count()} movidos`,
  )
  await page.close()
  return { page }
})

await scenario('paragens-waypoints', async () => {
  const { page, errors } = await openMission({ area: fx.u })
  // um controlo segmentado na gaveta dos parâmetros de voo (só nos cantos | em todos)
  const stops = page.getByRole('group', {
    name: /^(Paragem nos waypoints|Stop at waypoints)$/,
    includeHidden: true,
  })
  const escolha = (re) => stops.getByRole('button', { name: re, includeHidden: true })
  check('paragens: controlo escondido sem pontos intermédios', (await stops.count()) === 0)
  await configure(page, { tf: true })
  check(
    'paragens: com seguimento de terreno aparece, só nos cantos por omissão',
    (await stops.count()) === 1 &&
      (await escolha(/^(Só nos cantos|Corners only)$/).getAttribute('aria-pressed')) === 'true',
  )
  const cantos = turnModes(
    (await readRoutes(await exportKmz(page, join(OUT, 'u-tf-cantos.kmz'))))[0].wpml,
  )
  const nPass = cantos.filter((m) => m === PASS_MODE).length
  check(
    'paragens: vértices do terreno passam, extremos param',
    nPass > 0 && cantos[0] === STOP_MODE && cantos.at(-1) === STOP_MODE,
    `${nPass} de ${cantos.length} passam`,
  )
  await openDrawer(page, 'voo')
  await escolha(/^(Em todos|At every waypoint)$/).click()
  await page.waitForTimeout(800)
  const todos = turnModes(
    (await readRoutes(await exportKmz(page, join(OUT, 'u-tf-todos.kmz'))))[0].wpml,
  )
  check(
    'paragens: «Em todos» pára em cada waypoint',
    todos.length === cantos.length && todos.every((m) => m === STOP_MODE),
    `${todos.length} waypoints`,
  )
  check('paragens: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Seguir terreno com foto por waypoint: os pontos de foto entram na rota do
// relevo, com a acção a seguir o ponto; a exportação deixa de ficar bloqueada
await scenario('terreno-foto-por-waypoint', async () => {
  const { page, errors } = await openMission({ area: fx.u })
  await configure(page, { tf: true })
  await openDrawer(page, 'voo')
  await page
    .getByRole('group', { name: /^(Disparo por|Trigger by)$/ })
    .getByRole('button', { name: 'Waypoint', exact: true })
    .click()
  await page.waitForTimeout(800)
  await closeDrawer(page)
  const pill = await pillText(page)
  check('terreno + foto por waypoint: sem bloqueio no preflight', semBloqueio(pill), pill)
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'u-tf-waypoint.kmz')))
  const wpml = routes[0].wpml
  const tiros = (wpml.match(/<wpml:actionActuatorFunc>takePhoto</g) ?? []).length
  const alturas = [...wpml.matchAll(/<wpml:executeHeight>([^<]+)</g)].map((m) => +m[1])
  const r = analyseRoute(wpml, { toM, ground, aglNominalM: AGL_M })
  executavel(r)
  check(
    'terreno + foto por waypoint: uma acção de foto por ponto de foto, às dezenas, com alturas do relevo',
    tiros >= 30 && Math.max(...alturas) - Math.min(...alturas) > 10,
    `${tiros} fotos, alturas ${Math.min(...alturas)}–${Math.max(...alturas)} m`,
  )
  check(
    'terreno + foto por waypoint: a rota segue o relevo com a folga pedida',
    clearanceOk(r),
    `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`,
  )
  check('terreno + foto por waypoint: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('u-crosshatch-tf', async () => {
  const { page, errors } = await openMission({ area: fx.u })
  await configure(page, { cross: true, tf: true })
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'u-cross-tf.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground, aglNominalM: AGL_M })
  executavel(r)
  // antes da correcção das ligações: 17,8 m para 100 m de AGL
  check(
    'U + dupla grelha: folga ≥ AGL − tolerância, ligações incluídas',
    clearanceOk(r),
    `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`,
  )
  check(
    'U + dupla grelha: disparo suspenso nas travessias do entalhe',
    r.groups.length >= 3 && r.linksWithoutTrigger >= 3,
    `${r.groups.length} grupos, ${r.linksWithoutTrigger} ligações`,
  )
  check('U + dupla grelha: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('blocos-bateria-crosshatch-nadir-tf', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await configure(page, { cross: true, nadir: true, tf: true, split: 'Bateria' })
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'blocos.zip')))
  const rs = routes.map((x) => analyseRoute(x.wpml, { toM, ground, aglNominalM: AGL_M }))
  check('blocos: um KMZ por bloco', routes.length >= 2, `${routes.length} blocos`)
  check(
    'blocos: folga ao solo em todos os blocos',
    rs.every(clearanceOk),
    rs.map((r) => r.minClearance.toFixed(0)).join(','),
  )
  // cada bloco arranca da base: o primeiro troço é uma linha, não um ponto de
  // ligação. As faixas da primeira grelha são E-W (90°) e as ligações entre
  // elas N-S: o troço tem de ser E-W. Com o mosaico recortado uma célula de
  // bordo pode ter faixas curtas, pelo que o comprimento já não serve de
  // critério (antes: >= 100 m, com quadrados inteiros)
  check(
    'blocos: cada bloco começa numa linha de voo',
    rs.every(
      (r) =>
        Math.abs(r.firstSeg[0]) >= 5 && Math.abs(r.firstSeg[1]) <= 0.02 * Math.abs(r.firstSeg[0]),
    ),
    rs.map((r) => `${r.firstSeg[0].toFixed(0)}/${r.firstSeg[1].toFixed(0)}`).join(','),
  )
  check(
    'blocos: intervalos de disparo válidos em índices locais',
    rs.every((r) => r.groups.length >= 1 && r.groups.every(([s, e]) => s <= e && e < r.n)),
  )
  check('blocos: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('multipoligono-aviso', async () => {
  const { page, errors } = await openMission({ area: fx.multi })
  const txt = await bodyText(page)
  check(
    'importação: aviso de polígonos ignorados',
    /2 polígono\(s\) a mais|2 extra polygon/.test(txt),
    txt
      .split('\n')
      .filter((l) => /pol[ií]gon|ignor/i.test(l))
      .join(' | ')
      .slice(0, 200),
  )
  // o relevo do fixture sobe mais de 80 m dentro do poligono maior: sem
  // seguir terreno a rota entraria no relevo e o preflight bloqueia a
  // exportacao (de proposito); a missao exportada tem de ser viavel
  await configure(page, { tf: true })
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'multi.kmz')))
  const r = analyseRoute(routes[0].wpml, { toM, ground, aglNominalM: AGL_M })
  executavel(r)
  check(
    'importação: o maior polígono é o exportado (rectângulo, um grupo de disparo)',
    r.n > 20 && r.groups.length === 1,
    `${r.n} waypoints`,
  )
  // todas as partes como células: um KMZ por parte (o botão está no aviso da
  // importação, na secção «Área e relevo»)
  await abrirNoPainel(page, 'area')
  await page.getByRole('button', { name: /Usar todas as partes|Use all parts/ }).click()
  await page.waitForTimeout(800)
  // as outras duas partes ficam fora do MDT importado: sem relevo não há
  // exportação, e o preflight diz porquê e oferece o relevo global
  const pill = page.getByTestId('preflight-pill')
  const exportBtn = headerExport(page)
  check(
    'importação: partes fora do MDT importado bloqueiam a exportação',
    /1 bloqueio|1 blocker/.test(await pill.innerText()) && !(await exportBtn.isEnabled()),
    await pill.innerText(),
  )
  await pill.click()
  const list = page.getByTestId('preflight-list')
  check(
    'importação: o preflight explica que o MDT importado não cobre a rota',
    /MDT importado não chega|imported DTM does not reach/.test(await list.innerText()),
  )
  await list.getByRole('button', { name: DOWNLOAD_GLOBAL }).click()
  await exportReady(page)
  const cells = await readRoutes(await exportKmz(page, join(OUT, 'multi-celulas.zip')))
  check(
    'importação: todas as partes como células exportam um KMZ por parte',
    cells.length === 3,
    `${cells.length} rotas`,
  )
  check('importação: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- outros modos: desenhados no mapa, como o operador faz ------------- */
// Os cliques no mapa dão-se em metros do referencial dos fixtures (x para
// este, y para norte: toLL), situados no ecrã pelo contorno da área
// importada (path.area-ring) e pela caixa dele em metros: o ponto é o mesmo
// qualquer que seja o enquadramento (a área fica por baixo da barra de
// desenho e à esquerda do cartão das métricas) ou o zoom. Um clique que
// caísse fora do mapa ou debaixo de um painel (uma gaveta aberta, um
// cartão, os controlos) pára o cenário em vez de cair noutro sítio.
const caixaM = (ring) => {
  const ms = ring.map(([lon, lat]) => toM(lon, lat))
  const xs = ms.map((m) => m[0])
  const ys = ms.map((m) => m[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}
const RECT_M = caixaM(rectRing)
const HILL_M = caixaM(hillRing)
/** A caixa do contorno da área no ecrã: a geometria (getBBox), sem o traço. */
const caixaAnel = (page) =>
  page
    .locator('path.area-ring')
    .first()
    .evaluate((path) => {
      const b = path.getBBox()
      const m = path.getScreenCTM()
      return { x: m.a * b.x + m.e, y: m.d * b.y + m.f, w: m.a * b.width, h: m.d * b.height }
    })
/** O ponto (x, y) em metros, no ecrã, pela caixa `caixa` da área importada. */
async function noEcra(page, x, y, caixa = RECT_M) {
  const a = await caixaAnel(page)
  return [
    a.x + ((x - caixa.x0) / (caixa.x1 - caixa.x0)) * a.w,
    a.y + ((caixa.y1 - y) / (caixa.y1 - caixa.y0)) * a.h,
  ]
}
async function clickMap(page, x, y, caixa = RECT_M) {
  const [px, py] = await noEcra(page, x, y, caixa)
  const livre = await page.evaluate(
    ([u, v]) => {
      const el = document.elementFromPoint(u, v)
      return Boolean(el?.closest('.leaflet-container') && !el.closest('.leaflet-control-container'))
    },
    [px, py],
  )
  if (!livre)
    throw new Error(`clique no mapa em (${x}, ${y}) m: fora do mapa ou debaixo de um painel`)
  await page.mouse.click(px, py)
  await page.waitForTimeout(250)
}
/** Sem área ainda (o primeiro desenho), a vista inicial: píxeis a partir do centro do mapa. */
async function clickMapCentro(page, dx, dy) {
  const box = await page.locator('.leaflet-container').boundingBox()
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
  await page.waitForTimeout(250)
}
/**
 * «Afastar» um nível e esperar que o mapa acabe a animação: o contorno da
 * área fica com metade da largura. Com a página ocupada (um MDT a
 * recortar), o clique chegava a meio da animação anterior e o Leaflet
 * ignorava-o; um clique sem efeito repete-se.
 */
async function afastar(page) {
  const { w } = await caixaAnel(page)
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.leaflet-control-zoom-out').click()
    const feito = await page
      .waitForFunction(
        (w0) => {
          const p = document.querySelector('path.area-ring')
          if (!p || document.querySelector('.leaflet-zoom-anim')) return false
          return Math.abs(p.getScreenCTM().a * p.getBBox().width - w0 / 2) < 3
        },
        w,
        { timeout: 8000 },
      )
      .then(
        () => true,
        () => false,
      )
    if (feito) return
  }
  throw new Error('«Afastar» não mudou o zoom do mapa')
}
// «Marcar base» e «Marcar pontos de inspecção» são a mesma acção no cartão
// (o 5, e a gaveta do 6) e na barra de desenho sobre o mapa, com o mesmo
// nome: cada uma procura-se no seu sítio
const MARCAR_BASE = /^(Marcar base|Set base)$/
const MARCAR_PONTOS = /^(Marcar pontos de inspecção|Place inspection points)$/
const naBarra = (page) => page.getByTestId('map-draw-tools')
/** «Marcar base» do cartão 5, ou da barra sobre o mapa (`onde` 'mapa'). */
const marcarBase = (page, onde = 'cartão') =>
  (onde === 'mapa' ? naBarra(page) : page.getByTestId('card-bases')).getByRole('button', {
    name: MARCAR_BASE,
  })
/** «Marcar pontos de inspecção» da gaveta do cartão 6 (aberta), ou da barra sobre o mapa. */
const marcarPontos = (page, onde = 'gaveta') =>
  (onde === 'mapa' ? naBarra(page) : page.getByTestId('drawer-extras')).getByRole('button', {
    name: MARCAR_PONTOS,
  })
const modo = (page, re) => page.getByRole('button', { name: re, exact: true }).click()
// o botão de desenhar o eixo do corredor diz o que desenha
const DESENHAR_EIXO = /^Desenhar o eixo$|^Draw the centreline$/
/** Descarrega pelo botão `btn` (um Locator, ou o nome do botão). */
const panelExport = async (page, btn, file) => {
  const loc = btn instanceof RegExp ? page.getByRole('button', { name: btn }) : btn
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), loc.click()])
  await dl.saveAs(file)
  return file
}
const plano = { toM, ground: () => 0 }

await scenario('corredor-desenhado', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Corredor$|^Corridor$/)
  await page.getByRole('button', { name: DESENHAR_EIXO }).click()
  await clickMap(page, 330, 905)
  await clickMap(page, 1450, 1275)
  await clickMap(page, 2565, 905)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  // meia-largura de 300 m: várias passagens em vez da passagem única por omissão
  await page
    .locator('label', { hasText: /Meia-largura|Half-width/ })
    .locator('input')
    .fill('300')
  await page.waitForTimeout(800)
  const txt = await bodyText(page)
  check('corredor: painel mostra as passagens', /passagens|passes/.test(txt))
  await abrirNoPainel(page, 'corredor-5')
  const routes = await readRoutes(
    await panelExport(page, panelExportButton(page, 'corredor-5'), join(OUT, 'corredor.kmz')),
  )
  const r = analyseRoute(routes[0].wpml, plano)
  executavel(r)
  check(
    'corredor: rota com várias passagens, gimbal nadir e disparo por distância',
    r.n >= 6 &&
      r.groups.length >= 1 &&
      /gimbalPitchRotateAngle>-90</.test(routes[0].wpml) &&
      /multipleDistance/.test(routes[0].wpml),
    `${r.n} waypoints, ${r.groups.length} grupos`,
  )
  check('corredor: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Corredor com altura própria e partido em voos pela bateria: o painel
// lista os voos, o mapa mostra cada um com o seu rótulo, e a exportação dá
// um KMZ por voo, todos à altura do corredor (a da área fica nos 100 m).
await scenario('corredor-voos-parametros-proprios', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Corredor$|^Corridor$/)
  await page.getByRole('button', { name: DESENHAR_EIXO }).click()
  await clickMap(page, 330, 905)
  await clickMap(page, 1450, 1275)
  await clickMap(page, 2565, 905)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  const meia = page.locator('label', { hasText: /Meia-largura|Half-width/ }).locator('input')
  await meia.fill('300')
  await meia.press('Tab')
  await abrirNoPainel(page, 'corredor-2')
  await page.getByTestId('corridor-own-params').check()
  const altura = page
    .getByTestId('card-corredor-2')
    .locator('label', { hasText: /Altura acima da descolagem|Height above take-off/ })
    .locator('input')
  await altura.fill('60')
  await altura.press('Tab')
  await page.waitForTimeout(800)
  await abrirNoPainel(page, 'corredor-5')
  const exportar = panelExportButton(page, 'corredor-5')
  const alturas = (wpml) =>
    [...wpml.matchAll(/<wpml:executeHeight>([-\d.]+)</g)].map((m) => Number(m[1]))
  const [um] = await readRoutes(await panelExport(page, exportar, join(OUT, 'corredor-60.kmz')))
  const h1 = alturas(um.wpml)
  check(
    'corredor: com altura própria, o KMZ voa a 60 m',
    h1.length > 0 && h1.every((h) => h === 60),
    `${Math.min(...h1)}–${Math.max(...h1)} m`,
  )
  // a divisão em voos e a tabela dos voos estão na secção «Voos e bases»
  await abrirNoPainel(page, 'corredor-voos')
  await page
    .getByTestId('corridor-split')
    .getByRole('button', { name: /^Por bateria$|^By battery$/ })
    .click()
  await page.waitForTimeout(1200)
  const voos = page.getByTestId('corridor-flights').locator('tbody tr')
  const n = await voos.count()
  check(
    'corredor: partido pela bateria, o painel lista os voos',
    n >= 2,
    (
      await page
        .getByTestId('corridor-flights')
        .innerText()
        .catch(() => '')
    ).slice(0, 160),
  )
  check(
    'corredor: cada voo com o seu rótulo no mapa',
    (await page.locator('.corridor-flight-label').count()) === n,
    `${await page.locator('.corridor-flight-label').count()} rótulos, ${n} voos`,
  )
  // as estatísticas contam os voos da divisão (contavam a rota junta como um
  // voo, a vermelho contra o tempo útil); o mais longo diz o rótulo do voo
  // e o tempo contra o útil («Voo mais longo · C-3», «27:23 de 30:00»)
  const nVoos = (await page.getByTestId('stats-flights').locator('[data-tone]').innerText()).trim()
  const maisLongo = page.getByTestId('stats-longest')
  const tempoLongo = maisLongo.locator('[data-tone]')
  check(
    'corredor: as estatísticas contam os voos, e o mais longo cabe no tempo útil',
    new RegExp(`^${n}\\b`).test(nVoos) &&
      (await tempoLongo.getAttribute('data-tone')) !== 'over' &&
      /Voo mais longo · C-\d+/.test(await maisLongo.innerText()) &&
      /^\d+:\d\d de \d+:\d\d$/.test((await tempoLongo.innerText()).trim()),
    `${nVoos} · ${(await maisLongo.innerText()).replace(/\s+/g, ' ')}`,
  )
  // partido em voos sai um ZIP, e os botões do painel e do cabeçalho dizem-no
  await abrirNoPainel(page, 'corredor-5')
  check(
    'corredor em voos: os botões do painel e do cabeçalho dizem (ZIP)',
    /\(ZIP\)/.test(await exportar.innerText()) &&
      /\(ZIP\)/.test(await headerExport(page).innerText()),
    `${(await exportar.innerText()).trim()} · ${(await headerExport(page).innerText()).trim()}`,
  )
  const rotas = await readRoutes(await panelExport(page, exportar, join(OUT, 'corredor-voos.zip')))
  const medidas = rotas.map((x) => analyseRoute(x.wpml, plano))
  for (const m of medidas) executavel(m)
  check(
    'corredor: um KMZ por voo, todos a 60 m',
    rotas.length === n && rotas.every((x) => alturas(x.wpml).every((h) => h === 60)),
    `${rotas.length} KMZ, ${n} voos`,
  )
  check('corredor em voos: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Desenho: Backspace e Ctrl+Z anulam o último vértice (o Ctrl+Z não desfaz
// edições da área por baixo), o clique noutro vértice não faz nada e o
// clique no primeiro, com 3 ou mais, fecha o polígono. No eixo do corredor
// as mesmas teclas, e o Esc cancela.
await scenario('desenho-teclas-primeiro-vertice', async () => {
  const { page, errors } = await openMission({})
  // sem plano a pastilha é neutra e diz o passo seguinte, não «⛔ 1 bloqueios» (M3-U12)
  const pastilha = await page.getByTestId('preflight-pill').innerText()
  check(
    'sem área: a pastilha do preflight é neutra e aponta para o cartão 2',
    /defina a área \(cartão 2\)|define the area \(card 2\)/.test(pastilha) &&
      !/bloqueio|blocker|⛔/.test(pastilha),
    pastilha,
  )
  // o menu da seta do botão de exportar, com o teclado: sem área o KML da
  // área está inactivo (aria-disabled) mas recebe o foco, para se ouvir a
  // dica; o Enter não o escolhe; o Tab fecha o menu e segue em frente
  await page
    .locator('header')
    .getByRole('button', { name: /Outras exportações|Other exports/ })
    .focus()
  await page.keyboard.press('ArrowDown')
  const itemFoco = await page.evaluate(() => {
    const el = document.activeElement
    return `${el?.getAttribute('role')} ${el?.getAttribute('aria-disabled')} ${!!el?.title}`
  })
  await page.keyboard.press('Enter')
  const aberto = await page.locator('#export-menu').count()
  await page.keyboard.press('Tab')
  const fechado = await page.locator('#export-menu').count()
  const seguinte = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
  check(
    'menu de exportar: o item inactivo recebe o foco e não escolhe; o Tab fecha e segue',
    itemFoco === 'menuitem true true' &&
      aberto === 1 &&
      fechado === 0 &&
      seguinte === 'open-settings',
    `${itemFoco}, aberto: ${aberto}, fechado: ${fechado}, foco: ${seguinte}`,
  )
  const draft = page.locator('path.draft-vertex')
  const closer = page.locator('path.draft-close')
  const handles = page.locator('.vertex-handle')
  await page.getByRole('button', { name: /^Polígono$|^Polygon$/ }).click()
  const pts = [
    [60, -120],
    [260, -120],
    [260, 80],
    [60, 80],
  ]
  for (const [dx, dy] of pts) await clickMapCentro(page, dx, dy)
  check(
    'desenho: 4 vértices e o primeiro a fechar',
    (await draft.count()) === 4 && (await closer.count()) === 1,
  )
  await page.keyboard.press('Backspace')
  const afterBack = await draft.count()
  await page.keyboard.press('Control+z')
  const afterUndo = await draft.count()
  check(
    'desenho: Backspace e Ctrl+Z anulam um vértice cada',
    afterBack === 3 && afterUndo === 2 && (await closer.count()) === 0,
    `${afterBack} e ${afterUndo}`,
  )
  for (const [dx, dy] of pts.slice(2)) await clickMapCentro(page, dx, dy)
  await draft.nth(1).click()
  await page.waitForTimeout(250)
  check('desenho: o clique noutro vértice não o remove', (await draft.count()) === 4)
  await closer.click()
  await page.waitForTimeout(400)
  check(
    'desenho: o clique no primeiro vértice fecha o polígono',
    (await draft.count()) === 0 && (await handles.count()) === 4,
    `${await handles.count()} vértices editáveis`,
  )
  // depois de fechar, o Ctrl+Z volta a desfazer as edições da área
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  check('desenho: Ctrl+Z depois de fechar desfaz a área', (await handles.count()) === 0)

  await modo(page, /^Corredor$|^Corridor$/)
  await page.getByRole('button', { name: DESENHAR_EIXO }).click()
  for (const [dx, dy] of pts.slice(0, 3)) await clickMapCentro(page, dx, dy)
  await page.keyboard.press('Backspace')
  const axBack = await draft.count()
  await page.keyboard.press('Control+z')
  const axUndo = await draft.count()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check(
    'corredor: Backspace e Ctrl+Z anulam pontos do eixo, Esc cancela',
    axBack === 2 &&
      axUndo === 1 &&
      (await draft.count()) === 0 &&
      (await page.getByRole('button', { name: DESENHAR_EIXO }).count()) === 1,
    `${axBack} e ${axUndo}`,
  )
  check('desenho: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('circular-sobre-a-area', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Circular$|^Circular$/)
  await page.waitForTimeout(500)
  // o rectângulo de 2,5 x 1,8 km com o raio de 30 m dava milhares de
  // círculos: o painel explica e o KMZ fica desactivado
  let txt = await bodyText(page)
  // o erro está na secção dos círculos; o botão de exportar, na do resumo
  await abrirNoPainel(page, 'circular-4')
  check(
    'circular: demasiados círculos com o raio por omissão é um erro explicado',
    /Demasiados círculos|Too many circles/.test(txt) &&
      (await panelExportButton(page, 'circular-4').isDisabled()),
  )
  await abrirNoPainel(page, 'circular-2')
  const setField = async (re, value) => {
    const input = page.locator('label', { hasText: re }).locator('input')
    await input.fill(String(value))
    await input.press('Tab')
  }
  await setField(/^Raio|^Radius/, 150)
  await setField(/Sobreposição entre círculos|Circle overlap/, 25)
  await page.waitForTimeout(800)
  // os círculos e os pontos de cada um estão no mosaico do resumo («153 /
  // × 20 pontos»), que tem também o botão de exportar
  await abrirNoPainel(page, 'circular-4')
  const mosaico = await page.getByTestId('circular-circles').innerText()
  const m = /(\d+)\s+×\s+(\d+) (?:pontos|points)/.exec(mosaico)
  check(
    'circular: painel mostra círculos e pontos por círculo',
    Boolean(m),
    (m?.[0] ?? mosaico).replace(/\s+/g, ' '),
  )
  check(
    'circular: o conselho de sobreposição aparece com o número de círculos',
    (await page.getByTestId('circular-advice').count()) === 1,
  )
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    panelExportButton(page, 'circular-4').click(),
  ])
  await dl.saveAs(join(OUT, 'circular.kmz'))
  const routes = await readRoutes(join(OUT, 'circular.kmz'))
  const wpml = routes[0].wpml
  const r = analyseRoute(wpml, plano)
  executavel(r)
  const circles = Number(m?.[1])
  const pts = Number(m?.[2])
  const fotos = (wpml.match(/<wpml:actionActuatorFunc>takePhoto</g) || []).length
  const rumos = (wpml.match(/<wpml:waypointHeadingAngle>/g) || []).length
  check(
    'circular: KMZ com (n + 1) pontos por círculo, uma foto por ponto, rumo em todos, voo curvo contínuo',
    r.n === circles * (pts + 1) &&
      fotos === circles * pts &&
      rumos === r.n &&
      /toPointAndPassWithContinuityCurvature/.test(wpml) &&
      /gimbalPitchRotateAngle>-45</.test(wpml),
    `${r.n} waypoints, ${fotos} fotos, ${circles} círculos`,
  )
  check(
    'circular: nome do ficheiro com o tipo e o número de círculos',
    new RegExp(`_circular_n${circles}\\.kmz$`).test(dl.suggestedFilename()),
    dl.suggestedFilename(),
  )
  // a área continua a ser a do separador Área
  await modo(page, /^Área$|^Area$/)
  await page.waitForTimeout(400)
  txt = await bodyText(page)
  check('resumo do projecto conta a área e a missão circular', /2 planos|2 plans/.test(txt))
  // retirada, a missão circular deixa de contar
  await modo(page, /^Circular$|^Circular$/)
  await abrirNoPainel(page, 'circular-4')
  await page
    .getByRole('button', { name: /Retirar a missão circular|Remove the circular mission/ })
    .click()
  await page.waitForTimeout(500)
  check(
    'circular retirada: o resumo volta a um só plano',
    !/\d+ planos|\d+ plans/.test(await bodyText(page)),
  )
  check('circular: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('corredor-segue-terreno', async () => {
  // o MDT sintetico importado pela area serve tambem o corredor desenhado
  // dentro dela: um so relevo para os dois
  const { page, errors } = await openMission({ area: fx.rect, dem: true })
  await modo(page, /^Corredor$|^Corridor$/)
  await page.getByRole('button', { name: DESENHAR_EIXO }).click()
  await clickMap(page, 330, 905)
  await clickMap(page, 1450, 1275)
  await clickMap(page, 2565, 905)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  await page
    .locator('label', { hasText: /Meia-largura|Half-width/ })
    .locator('input')
    .fill('200')
  await page.waitForTimeout(800)
  // sem seguimento de terreno o corredor plano entra nas colinas: o preflight
  // bloqueia, e tanto o botão do painel como o do cabeçalho ficam desactivados
  await abrirNoPainel(page, 'corredor-5')
  const exportPainel = panelExportButton(page, 'corredor-5')
  const exportCabecalho = headerExport(page)
  check(
    'corredor: rota plana dentro do relevo fica bloqueada no painel e no cabeçalho',
    (await exportPainel.isDisabled()) &&
      (await exportCabecalho.isDisabled()) &&
      /Exportação bloqueada pelo preflight|Export blocked by the preflight/.test(
        await bodyText(page),
      ),
  )
  // o seguimento de terreno está na secção «Relevo»
  await abrirNoPainel(page, 'corredor-3')
  const tf = page
    .locator('label', { hasText: /cada passagem sobre o seu solo|each pass over its own ground/ })
    .locator('input')
  check('corredor: seguimento de terreno disponível com o MDT da área', !(await tf.isDisabled()))
  await tf.check()
  await page.waitForTimeout(800)
  // o botão do cabeçalho exporta a missão do separador aberto: o corredor
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    exportCabecalho.click(),
  ])
  await dl.saveAs(join(OUT, 'corredor-tf.kmz'))
  const routes = await readRoutes(join(OUT, 'corredor-tf.kmz'))
  const r = analyseRoute(routes[0].wpml, { toM, ground, aglNominalM: AGL_M })
  executavel(r)
  const hs = [...routes[0].wpml.matchAll(/<wpml:executeHeight>([-\d.]+)</g)].map((m) =>
    Number(m[1]),
  )
  check(
    'corredor: com relevo as alturas variam',
    new Set(hs).size > 3,
    `${hs.length} pontos, alturas ${Math.min(...hs)}–${Math.max(...hs)} m`,
  )
  check(
    'corredor: folga ao solo mantida ao longo de toda a rota',
    clearanceOk(r),
    `${r.minClearance.toFixed(1)} m (AGL ${r.agl}) ${r.minAt}`,
  )
  check(
    'corredor: nome do ficheiro com -tf',
    /_corridor-tf_n\d+\.kmz$/.test(dl.suggestedFilename()),
    dl.suggestedFilename(),
  )
  check('corredor com relevo: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('fachada-desenhada', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Face$/)
  // a seta do botão de exportar tem o KML da área em todos os separadores,
  // como o botão que o cabeçalho tinha; na Face é o único item
  const menuFace = await headerMenu(page)
  const itensFace = await menuFace
    .getByRole('menuitem')
    .evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0].trim()))
  const kmlFace = await (await headerKml(page)).isEnabled()
  await page.keyboard.press('Escape')
  check(
    'fachada: a seta do cabeçalho tem o KML da área, activo com a área',
    itensFace.join(' | ') === 'Exportar KML da área' && kmlFace,
    itensFace.join(' | '),
  )
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, 705, 1050)
  await clickMap(page, 2195, 1050)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  await page.waitForTimeout(800)
  await abrirNoPainel(page, 'fachada-4')
  const routes = await readRoutes(
    await panelExport(page, panelExportButton(page, 'fachada-4'), join(OUT, 'fachada.kmz')),
  )
  const wpml = routes[0].wpml
  const rumos = [...wpml.matchAll(/<wpml:waypointHeadingAngle>([-\d.]+)</g)].map((m) =>
    Number(m[1]),
  )
  const r = analyseRoute(wpml, plano)
  executavel(r)
  check(
    'fachada: passagens empilhadas com rumo fixo em [-180, 180] e uma foto por waypoint',
    r.n >= 4 &&
      rumos.length === r.n &&
      rumos.every((h) => h >= -180 && h <= 180) &&
      (wpml.match(/takePhoto/g) ?? []).length >= r.n,
    `${r.n} waypoints, ${rumos.length} rumos`,
  )
  // sem DSM local, o aviso do afastamento não verificado está no preflight,
  // não só na caixa do painel (M3-U1)
  await page.getByTestId('preflight-pill').click()
  const lista = await page.getByTestId('preflight-list').innerText()
  check(
    'fachada: o preflight avisa que o afastamento não foi verificado contra o terreno',
    /aviso|warning/.test(await pillText(page)) &&
      /não verificado contra o terreno|not verified against the terrain/.test(lista),
    `${await pillText(page)} | ${lista.replace(/\s+/g, ' ').slice(0, 160)}`,
  )
  check('fachada: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Face em L: as fotografias do canto ficam em posições diferentes ao longo
// da linha afastada, com o rumo a rodar entre os das duas faces; nunca no
// mesmo ponto, que a DJI recusa (o preflight bloqueava a exportação de
// qualquer face com cantos). A espera em cada foto sai como acção hover
// antes do disparo, e o prolongamento das pontas desloca a primeira foto
// meia imagem para lá da ponta.
await scenario('fachada-em-l', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Face$/)
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, 705, 1050)
  await clickMap(page, 1820, 1050)
  await clickMap(page, 1820, 1605)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  // a espera em cada foto está na secção «Captura»
  await abrirNoPainel(page, 'fachada-captura')
  const espera = page
    .locator('label', { hasText: /Espera em cada foto|Wait at each photo/ })
    .locator('input')
  await espera.fill('2')
  await espera.press('Tab')
  await page.waitForTimeout(800)
  await abrirNoPainel(page, 'fachada-4')
  const exportar = panelExportButton(page, 'fachada-4')
  check('fachada em L: a exportação fica disponível', await exportar.isEnabled())
  const [rota] = await readRoutes(await panelExport(page, exportar, join(OUT, 'fachada-l.kmz')))
  const r = analyseRoute(rota.wpml, plano)
  executavel(r)
  check(
    'fachada em L: waypoints seguidos a 1 m ou mais, sem fotos sobrepostas no canto',
    r.minStep3DM >= 0.9,
    `passo mínimo ${r.minStep3DM.toFixed(2)} m`,
  )
  // os dois rumos mais frequentes são os das faces; os do canto ficam entre eles
  const norm = (h) => ((Math.round(h) % 360) + 360) % 360
  const ang = (x, y) => Math.abs(((x - y + 540) % 360) - 180)
  const rumos = [...rota.wpml.matchAll(/<wpml:waypointHeadingAngle>([-\d.]+)</g)].map((m) =>
    norm(Number(m[1])),
  )
  const freq = new Map()
  for (const h of rumos) freq.set(h, (freq.get(h) ?? 0) + 1)
  const [a, b] = [...freq.entries()].sort((x, y) => y[1] - x[1]).map(([h]) => h)
  const canto = rumos.filter(
    (h) => ang(h, a) > 2 && ang(h, b) > 2 && ang(h, a) + ang(h, b) <= ang(a, b) + 1,
  )
  check(
    'fachada em L: as duas faces a ~90° e rumos intermédios no canto',
    Math.abs(ang(a, b) - 90) <= 3 && canto.length >= 1,
    `faces a ${a}° e ${b}°, ${canto.length} no canto`,
  )
  const fotos = (rota.wpml.match(/<wpml:actionActuatorFunc>takePhoto</g) ?? []).length
  const esperas = [
    ...rota.wpml.matchAll(
      /<wpml:actionActuatorFunc>hover<\/wpml:actionActuatorFunc>\s*<wpml:actionActuatorFuncParam>\s*<wpml:hoverTime>([\d.]+)</g,
    ),
  ].map((m) => Number(m[1]))
  check(
    'fachada em L: uma espera de 2 s (hover) antes de cada foto',
    fotos === r.n && esperas.length === fotos && esperas.every((x) => x === 2),
    `${fotos} fotos, ${esperas.length} esperas`,
  )
  // prolongamento: sem ele, a primeira foto recua o que o painel diz (o
  // interruptor e a dica estão nos parâmetros da face)
  await abrirNoPainel(page, 'fachada-2')
  const dica = await page
    .locator('p', { hasText: /para lá das pontas|beyond the ends/ })
    .innerText()
  const extM = Number(/(\d+(?:\.\d+)?) m (?:para lá|beyond)/.exec(dica)?.[1])
  await page.getByTestId('face-extend-ends').uncheck()
  await page.waitForTimeout(800)
  await abrirNoPainel(page, 'fachada-4')
  const [semPontas] = await readRoutes(
    await panelExport(page, exportar, join(OUT, 'fachada-l-sem-pontas.kmz')),
  )
  const [x0, y0] = r.points[0]
  const [x1, y1] = analyseRoute(semPontas.wpml, plano).points[0]
  check(
    'fachada em L: o prolongamento põe a primeira foto meia imagem para lá da ponta',
    extM > 0 && Math.abs(Math.hypot(x1 - x0, y1 - y0) - extM) < 0.5,
    `${Math.hypot(x1 - x0, y1 - y0).toFixed(2)} m no KMZ, ${extM} m no painel`,
  )
  check('fachada em L: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// V muito fechado (deflexão de 150°, braços de 40 m), voado do lado de
// dentro a 5 m com 90 % de sobreposição: ao longo da linha afastada as fotos
// ficavam a um passo, mas através do vértice da esquadria duas seguidas
// ficavam a menos de 0,5 m e o preflight bloqueava a exportação. A linha de
// base entra pelo projecto gravado, em coordenadas exactas: a distância
// através do vértice depende de onde as amostras caem, e um desenho à mão
// podia cair num sítio bom.
await scenario('fachada-v-fechado-por-dentro', async () => {
  const lat0 = 38.7
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const LL = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
  const a = (150 * Math.PI) / 180
  const baseline = [LL(0, 0), LL(40, 0), LL(40 + 40 * Math.cos(a), 40 * Math.sin(a))]
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await page.waitForTimeout(1200) // autosave com debounce de 500 ms
  await page.evaluate((b) => {
    const p = JSON.parse(localStorage.getItem('dji-mission-planner:project:v1'))
    p.missionMode = 'face'
    p.faceConfig = {
      ...p.faceConfig,
      baseline: b,
      heightM: 6,
      standoffM: 5,
      side: 'left',
      verticalOverlapPct: 70,
      horizontalOverlapPct: 90,
    }
    localStorage.setItem('dji-mission-planner:project:v1', JSON.stringify(p))
  }, baseline)
  await page.reload({ waitUntil: 'domcontentloaded' })
  // a secção do resumo, com o botão de exportar, abre-se depois de o painel aparecer
  await page.getByTestId('card-fachada-4').waitFor({ timeout: 20000 })
  await abrirNoPainel(page, 'fachada-4')
  const exportar = panelExportButton(page, 'fachada-4')
  const botao = exportar
  await botao.waitFor({ timeout: 20000 })
  await page.waitForTimeout(1500)
  check(
    'V fechado por dentro: a exportação fica disponível',
    await botao.isEnabled(),
    (await pillText(page)).replace(/\s+/g, ' '),
  )
  const [rota] = await readRoutes(await panelExport(page, exportar, join(OUT, 'fachada-v.kmz')))
  const r = analyseRoute(rota.wpml, plano)
  executavel(r)
  check(
    'V fechado por dentro: fotos seguidas a 0,55 m ou mais',
    r.minStep3DM >= 0.54,
    `passo mínimo ${r.minStep3DM.toFixed(2)} m, ${r.n} waypoints`,
  )
  check('V fechado por dentro: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Os painéis dos outros modos em secções, como o da área: uma aberta de
// cada vez, fechadas com o resumo numa linha; o botão de exportar do resumo
// é o do cabeçalho (o mesmo nome, a mesma dica e o mesmo estado); «Ver»
// abre a lista do preflight; «O que vai no KMZ» abre e fecha; e o aviso do
// afastamento não verificado leva ao separador Área, onde se importa o MDS.
await scenario('modos-em-seccoes', async () => {
  const { page, errors } = await comProjecto(
    { area: fx.rect, dem: false },
    {
      missionMode: 'face',
      faceConfig: {
        baseline: [toLL(800, 800), toLL(880, 800), toLL(880, 860)],
        heightM: 20,
        standoffM: 15,
        side: 'left',
      },
    },
  )
  const painel = page.getByRole('region', {
    name: /Parâmetros da missão de face|Face mission parameters/,
  })
  const abertas = () =>
    painel
      .locator('section[data-testid^="card-"]')
      .evaluateAll((els) =>
        els
          .filter(
            (e) =>
              e.querySelector(':scope > h3 > button')?.getAttribute('aria-expanded') === 'true',
          )
          .map((e) => e.dataset.testid.slice(5)),
      )
  const antes = await abertas()
  const resumoPe = (await page.getByTestId('card-fachada-1').innerText()).replace(/\s+/g, ' ')
  check(
    'secções: com o pé da face desenhado abre a dos parâmetros, e a fechada diz o resumo',
    antes.join() === 'fachada-2' && /Desenhado no mapa|Drawn on the map/.test(resumoPe),
    `${antes.join()} · ${resumoPe.slice(0, 80)}`,
  )
  await abrirNoPainel(page, 'fachada-4')
  check('secções: abrir o resumo fecha a outra', (await abertas()).join() === 'fachada-4')
  const doPainel = panelExportButton(page, 'fachada-4')
  const doCabecalho = headerExport(page)
  check(
    'secções: o botão de exportar do resumo é o do cabeçalho (nome, dica e estado)',
    (await doPainel.innerText()).trim() === (await doCabecalho.innerText()).trim() &&
      (await doPainel.getAttribute('title')) === (await doCabecalho.getAttribute('title')) &&
      (await doPainel.isDisabled()) === (await doCabecalho.isDisabled()),
    `${(await doPainel.innerText()).trim()} · ${await doPainel.getAttribute('title')}`,
  )
  const kmz = page.getByTestId('mode-kmz-contents')
  const abrirKmz = kmz.getByRole('button', { name: /O que vai no KMZ|What goes into the KMZ/ })
  await abrirKmz.click()
  check(
    'secções: «O que vai no KMZ» abre e diz o que a exportação escreve',
    (await abrirKmz.getAttribute('aria-expanded')) === 'true' &&
      /Um waypoint por posição de foto|One waypoint per photo position/.test(await kmz.innerText()),
  )
  await page
    .getByTestId('mode-preflight')
    .getByRole('button', { name: /Ver a lista do preflight|See the preflight list/ })
    .click()
  await page.getByTestId('preflight-list').waitFor({ timeout: 5000 })
  check(
    'secções: «Ver» abre a lista do preflight',
    (await page.getByTestId('preflight-list').count()) === 1,
  )
  await page.keyboard.press('Escape')
  await abrirNoPainel(page, 'fachada-2')
  await page
    .getByRole('button', { name: /Importar um GeoTIFF em Área e relevo|Import a GeoTIFF in Area/ })
    .click()
  await page.waitForTimeout(400)
  check(
    'secções: o aviso do afastamento leva ao separador Área, com «Área e relevo» aberta',
    (await page
      .getByRole('button', { name: /^Área$|^Area$/, exact: true })
      .getAttribute('aria-current')) === 'true' &&
      (await page
        .getByTestId('card-area')
        .locator(':scope > h3 > button')
        .getAttribute('aria-expanded')) === 'true',
  )
  check('secções: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('orbita-marcada', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Órbita$|^Orbit$/)
  await page.getByRole('button', { name: /Marcar POI|Mark POI/ }).click()
  await clickMap(page, 1450, 1050)
  await page.waitForTimeout(800)
  await abrirNoPainel(page, 'orbita-5')
  const single = await readRoutes(
    await panelExport(page, panelExportButton(page, 'orbita-5'), join(OUT, 'orbita.kmz')),
  )
  const r = analyseRoute(single[0].wpml, plano)
  executavel(r)
  check(
    'órbita: anel de waypoints em voo curvo contínuo',
    r.n >= 8 && /ContinuityCurvature|coordinateTurn/.test(single[0].wpml),
    `${r.n} waypoints`,
  )
  // a missão única leva todos os níveis; entre anéis nunca há um segmento
  // de comprimento horizontal nulo (era onde a aeronave parava)
  check(
    'órbita: um só KMZ com todos os níveis e sem segmentos verticais',
    r.n > 8 && r.minStepM > 1,
    `passo mínimo ${r.minStepM.toFixed(2)} m`,
  )
  const perLevel = await readRoutes(
    await panelExport(page, /um KMZ por nível|one KMZ per level/, join(OUT, 'orbita-niveis.zip')),
  )
  check(
    'órbita: um KMZ por nível',
    perLevel.length >= 1 && perLevel.every((x) => analyseRoute(x.wpml, plano).n >= 8),
    `${perLevel.length} níveis`,
  )
  // captura em vídeo: espiral contínua a gravar do primeiro ao último ponto
  await abrirNoPainel(page, 'orbita-2')
  await page.getByRole('radio', { name: /Vídeo|Video/ }).click()
  await page.waitForTimeout(500)
  await abrirNoPainel(page, 'orbita-5')
  const [dlVideo] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    panelExportButton(page, 'orbita-5').click(),
  ])
  await dlVideo.saveAs(join(OUT, 'orbita-video.kmz'))
  const video = await readRoutes(join(OUT, 'orbita-video.kmz'))
  const rv = analyseRoute(video[0].wpml, plano)
  executavel(rv)
  const cnt = (re) => (video[0].wpml.match(re) || []).length
  const hs = [...video[0].wpml.matchAll(/<wpml:executeHeight>([-\d.]+)</g)].map((m) => Number(m[1]))
  check(
    'órbita vídeo: um startRecord, um stopRecord, nenhum takePhoto, alturas sempre a subir',
    cnt(/<wpml:actionActuatorFunc>startRecord</g) === 1 &&
      cnt(/<wpml:actionActuatorFunc>stopRecord</g) === 1 &&
      cnt(/<wpml:actionActuatorFunc>takePhoto</g) === 0 &&
      hs.length === rv.n &&
      hs.every((h, i) => i === 0 || h > hs[i - 1]),
    `${rv.n} pontos, ${hs[0]} → ${hs[hs.length - 1]} m`,
  )
  check(
    'órbita vídeo: nome do ficheiro com a variante',
    /_orbit-video_n\d+\.kmz$/.test(dlVideo.suggestedFilename()),
    dlVideo.suggestedFilename(),
  )
  check(
    'órbita vídeo: a exportação por nível fica desactivada',
    await page.getByRole('button', { name: /um KMZ por nível|one KMZ per level/ }).isDisabled(),
  )
  await abrirNoPainel(page, 'orbita-2')
  await page.getByRole('radio', { name: /Fotografia|Photo/ }).click()
  await modo(page, /^Área$|^Area$/)
  await page.waitForTimeout(500)
  const txt = await bodyText(page)
  check(
    'resumo do projecto conta a área e a órbita em qualquer separador',
    /2 planos|2 plans/.test(txt),
  )
  check('órbita: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Órbita: a aeronave e o sensor escolhem-se no próprio painel (antes só no
// cartão 1 da área, e sem câmara não havia fotos nem maneira de a escolher),
// e as várias inclinações com paragem: em cada ponto gimbal e foto por
// inclinação, a de cima 5° abaixo do limite do gimbal (P1: 30° → 25°).
await scenario('orbita-aeronave-e-inclinacoes', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Órbita$|^Orbit$/)
  // a primeira secção do painel, que se abre para escolher
  await abrirNoPainel(page, 'orbita-aeronave')
  const picker = page.getByTestId('aircraft-picker')
  check('órbita: aeronave e sensor no topo do painel', await picker.isVisible())
  await picker.getByTestId('aircraft-picker-aircraft').selectOption('M300RTK')
  await picker.getByTestId('aircraft-picker-payload').selectOption('P1')
  await abrirNoPainel(page, 'orbita-1')
  await page.getByRole('button', { name: /Marcar POI|Mark POI/ }).click()
  await clickMap(page, 1450, 1050)
  await abrirNoPainel(page, 'orbita-2')
  await page.getByTestId('orbit-capture-multi').click()
  await page.waitForTimeout(800)
  const angulos = await page
    .getByTestId('orbit-shots')
    .locator('input[type=number]')
    .evaluateAll((els) => els.map((e) => Number(e.value)))
  check(
    'órbita: por omissão −45°, 0° e o limite do P1 menos 5° (25°)',
    JSON.stringify(angulos) === JSON.stringify([-45, 0, 25]),
    angulos.join(', '),
  )
  await abrirNoPainel(page, 'orbita-5')
  const [rota] = await readRoutes(
    await panelExport(
      page,
      panelExportButton(page, 'orbita-5'),
      join(OUT, 'orbita-inclinacoes.kmz'),
    ),
  )
  const r = analyseRoute(rota.wpml, plano)
  executavel(r)
  const fotos = (rota.wpml.match(/<wpml:actionActuatorFunc>takePhoto</g) ?? []).length
  check(
    'órbita: três fotos por ponto, com paragem em cada um',
    fotos === 3 * r.n && /toPointAndStopWithDiscontinuityCurvature/.test(rota.wpml),
    `${fotos} fotos em ${r.n} pontos`,
  )
  const pitches = [...rota.wpml.matchAll(/<wpml:gimbalPitchRotateAngle>([-\d.]+)</g)].map((m) =>
    Number(m[1]),
  )
  check(
    'órbita: o gimbal sobe aos 25° e não passa deles',
    pitches.includes(25) && Math.max(...pitches) === 25,
    `de ${Math.min(...pitches)} a ${Math.max(...pitches)}°`,
  )
  // a escolha é a do projecto: o cartão 1 da área mostra-a
  await modo(page, /^Área$|^Area$/)
  const sel = page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
  check(
    'órbita: a aeronave escolhida na órbita é a do projecto (cartão 1 da área)',
    (await sel.inputValue()) === 'M300RTK',
  )
  check('órbita com inclinações: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Projecto: gravação automática, recarregar a página, guardar em ficheiro
// e abrir — a ligação entre o estado e o ficheiro de projecto que nenhuma
// suite em Node exercita de ponta a ponta.
await scenario('projecto-autosave-ficheiro', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  // o nome e «Guardar projecto» estão na secção «Missão»
  const nameInput = page.getByPlaceholder(/nome-da-missao|mission-name/)
  await abrirNoPainel(page, 'missao')
  await nameInput.fill('projecto-e2e')
  await openDrawer(page, 'voo')
  await label(page, CROSS).check()
  await page.waitForTimeout(1200) // autosave com debounce de 500 ms
  const stored = await page.evaluate(() => localStorage.getItem('dji-mission-planner:project:v1'))
  const saved = stored ? JSON.parse(stored) : null
  check(
    'projecto: autosave em localStorage com versão 2 e área',
    saved?.version === 2 &&
      saved.missionName === 'projecto-e2e' &&
      Array.isArray(saved.ring) &&
      saved.ring.length >= 3,
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
    .waitFor({ state: 'attached', timeout: 20000 })
  // o projecto gravado repõe o estado e o plano recalcula-se: espera-se por
  // isso (até 20 s) e não por uma pausa fixa, que no CI às vezes não chegava
  for (const t0 = Date.now(); Date.now() - t0 < 20000; await page.waitForTimeout(250))
    if ((await nameInput.inputValue()) === 'projecto-e2e' && (await headerExport(page).isEnabled()))
      break
  check(
    'projecto: nome e dupla grelha sobrevivem ao recarregar',
    (await nameInput.inputValue()) === 'projecto-e2e' && (await label(page, CROSS).isChecked()),
  )
  const afterReload = await bodyText(page)
  check(
    'projecto: a área volta com o plano calculado',
    /Exportar WPML|Export Advanced WPML/.test(afterReload) &&
      (await headerExport(page).isEnabled()),
  )

  await abrirNoPainel(page, 'missao')
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Guardar projecto|Save project/ }).click(),
  ])
  const file = join(OUT, 'projecto-e2e.json')
  await dl.saveAs(file)
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  // o ficheiro que a aplicação escreve tem de cumprir o contrato publicado
  const ajv = new Ajv2020({ allErrors: true })
  const valid = ajv.compile(
    JSON.parse(readFileSync('public/schema/project-v2.schema.json', 'utf8')),
  )
  check(
    'projecto: o ficheiro guardado valida contra public/schema/project-v2.schema.json',
    valid(onDisk) === true,
    (valid.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; '),
  )
  check(
    'projecto: ficheiro guardado com o mesmo conteúdo do autosave',
    onDisk.version === 2 &&
      onDisk.missionName === 'projecto-e2e' &&
      onDisk.params?.crosshatch === true &&
      JSON.stringify(onDisk.ring) === JSON.stringify(saved.ring),
  )
  check(
    'projecto: guarda a bateria da missão (tipo e tempo útil) sem reserva por cima',
    typeof onDisk.battery?.batteryId === 'string' &&
      onDisk.battery.usefulMin > 0 &&
      onDisk.split?.reservePct === 0 &&
      onDisk.batteryByCombo === undefined,
    JSON.stringify(onDisk.battery),
  )

  // estado limpo, depois abrir o ficheiro: tudo tem de voltar
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
    .waitFor({ state: 'attached', timeout: 20000 })
  check(
    'projecto: sem projecto gravado o nome volta ao defeito',
    (await nameInput.inputValue()) !== 'projecto-e2e',
  )
  await projectFile(page).setInputFiles(file)
  // o projecto aberto repõe o estado e o plano recalcula-se: espera-se por
  // isso (até 20 s) e não por uma pausa fixa, que no CI às vezes não chegava
  for (const t0 = Date.now(); Date.now() - t0 < 20000; await page.waitForTimeout(250))
    if ((await nameInput.inputValue()) === 'projecto-e2e' && (await headerExport(page).isEnabled()))
      break
  check(
    'projecto: abrir o ficheiro repõe nome, dupla grelha e área',
    (await nameInput.inputValue()) === 'projecto-e2e' &&
      (await label(page, CROSS).isChecked()) &&
      (await headerExport(page).isEnabled()),
  )
  // «Mudar o nome», no menu do projecto do cabeçalho: o Enter grava o nome,
  // o menu não reabre e o foco volta ao botão do projecto
  const projecto = page.locator('header').getByRole('button', { name: /^(Projecto|Project) / })
  await projecto.click()
  await page
    .locator('#project-menu')
    .getByRole('menuitem', { name: /Mudar o nome|Rename/ })
    .click()
  const novoNome = page
    .locator('header')
    .getByRole('textbox', { name: /Nome da missão|Mission name/ })
  await novoNome.fill('projecto-renomeado')
  await novoNome.press('Enter')
  await page.waitForTimeout(300)
  const menuAberto = await page.locator('#project-menu').count()
  const foco = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  check(
    'projecto: o Enter de «Mudar o nome» grava, não reabre o menu e devolve o foco ao botão',
    menuAberto === 0 &&
      (await nameInput.inputValue()) === 'projecto-renomeado' &&
      /^(Projecto|Project) projecto-renomeado,/.test(foco),
    `menu aberto: ${menuAberto}, foco: ${foco}`,
  )
  check('projecto: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Preflight: a pastilha do cabeçalho resume bloqueios e avisos da missão
// activa e os bloqueios desactivam o botão do KMZ. Um projecto gravado com
// seguir terreno ligado mas sem relevo (rede cortada) exportava antes um
// KMZ com alturas planas, sem aviso.
await scenario('preflight-bloqueia-terreno-em-falta', async () => {
  // relevo global indisponível (rede cortada): a primeira descarga falha
  const { page, errors } = await openMission({ area: fx.rect, dem: false, globalTerrain: false })
  const pill = page.getByTestId('preflight-pill')
  await page.waitForTimeout(1500)
  const exportBtn = headerExport(page)
  check(
    'preflight: sem relevo sobre a rota é um bloqueio e o KMZ fica desactivado',
    (await pill.count()) === 1 &&
      /1 bloqueio|1 blocker/.test(await pill.innerText()) &&
      !(await exportBtn.isEnabled()),
    await pill.innerText(),
  )
  // o cartão 7 diz o bloqueio ao pé dos botões cinzentos, sem abrir a pastilha (M3-U6)
  await abrirNoPainel(page, 'resumo')
  const caixa7 = page.getByTestId('summary-blockers')
  check(
    'preflight: o cartão 7 diz o bloqueio do relevo e oferece a lista',
    (await caixa7.count()) === 1 &&
      /Não há relevo sob a rota|No terrain under the route/.test(await caixa7.innerText()) &&
      (await caixa7.getByRole('button', { name: /Ver todos|See all/ }).count()) === 1,
    (await caixa7.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160),
  )
  await pill.click()
  const list = page.getByTestId('preflight-list')
  check(
    'preflight: a lista explica a falha e oferece a descarga do relevo global',
    /descarga falhou|download failed/.test(await list.innerText()) &&
      (await list.getByRole('button', { name: DOWNLOAD_GLOBAL }).count()) === 1,
    (await list.innerText()).slice(0, 200),
  )

  // a rede volta: a descarga (do botão ou da nova tentativa automática)
  // traz o relevo e a exportação fica disponível
  await page.route(/elevation-tiles-prod\/terrarium\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: FLAT_TILE }),
  )
  // pelo botão, ou pela nova tentativa automática, se chegar antes
  const dl = list.getByRole('button', { name: DOWNLOAD_GLOBAL })
  if ((await dl.count()) > 0) await dl.click({ timeout: 5000 }).catch(() => {})
  await exportReady(page)
  check(
    'preflight: com o relevo global o bloqueio desaparece',
    semBloqueio(await pill.innerText()),
    await pill.innerText(),
  )
  check(
    'preflight: a lista fica com o lembrete das alturas relativas',
    /descolagem|take-off/.test(await page.getByTestId('preflight-list').innerText()),
  )

  // projecto gravado com seguir terreno ligado e sem relevo ao recarregar:
  // um só bloqueio (o do relevo), não dois
  await page.waitForTimeout(1200) // autosave com debounce de 500 ms
  await page.evaluate(() => {
    const raw = localStorage.getItem('dji-mission-planner:project:v1')
    const p = JSON.parse(raw)
    p.terrainFollow = { enabled: true, tolerance: 5 }
    localStorage.setItem('dji-mission-planner:project:v1', JSON.stringify(p))
  })
  // rede outra vez cortada e cache de tiles vazia (senão o relevo vinha da
  // cache persistente, como no campo sem rede)
  await page.unroute(/elevation-tiles-prod\/terrarium\//)
  await page.evaluate(async () => {
    for (const k of await caches.keys()) await caches.delete(k)
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('preflight-pill').waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(1500)
  const pill2 = page.getByTestId('preflight-pill')
  check(
    'preflight: seguir terreno sem relevo continua a ser um só bloqueio',
    /1 bloqueio|1 blocker/.test(await pill2.innerText()) && !(await exportBtn.isEnabled()),
    await pill2.innerText(),
  )

  // com o MDT importado o bloqueio desaparece e a exportação volta
  await page.locator('input[accept=".tif,.tiff"]').setInputFiles(fx.dem)
  await exportReady(page)
  check(
    'preflight: com o MDT carregado o bloqueio desaparece',
    !/bloqueio|blocker/.test(await page.getByTestId('preflight-pill').innerText()) ||
      /0 bloqueios|0 blockers/.test(await page.getByTestId('preflight-pill').innerText()),
  )
  check('preflight: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('mdt-importado-acompanha-a-geometria', async () => {
  // MDT importado recortado para a área; um corredor desenhado depois sai do
  // recorte mas não do ficheiro: o relevo volta a sair do MESMO ficheiro, e
  // não do global nem de um bloqueio
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await exportReady(page)
  await page.locator('input[accept=".tif,.tiff"]').setInputFiles(fx.demBig)
  await page.waitForFunction(
    () => /MDT local grande\.tif|local DTM grande\.tif/.test(document.body.innerText),
    null,
    { timeout: 20000 },
  )
  await modo(page, /^Corredor$|^Corridor$/)
  // um eixo de ~7 km, de 2,3 km a oeste da área a 2,3 km a leste: dois
  // «Afastar» para as duas pontas ficarem à vista, ao lado do cartão das
  // métricas
  await afastar(page)
  await afastar(page)
  await page.getByRole('button', { name: DESENHAR_EIXO }).click()
  await clickMap(page, -2130, 1050)
  await clickMap(page, 5035, 975)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  // o relevo do fixture sobe centenas de metros à volta: com relevo sobre a
  // rota, o preflight vê a colisão; sem ele, diria que não há relevo
  await page.waitForTimeout(3000)
  await page.getByTestId('preflight-pill').click()
  const txt = await page.getByTestId('preflight-list').innerText()
  check(
    'mdt: corredor fora do recorte inicial tem relevo (o ficheiro recortado de novo)',
    !/Não há relevo|não chega a toda a rota|No terrain under|does not reach/.test(txt) &&
      /entra no relevo|enters the terrain/.test(txt),
    txt.slice(0, 200),
  )
  await modo(page, /^Área$|^Area$/)
  // a fonte do relevo diz-se na secção «Área e relevo»
  await abrirNoPainel(page, 'area')
  check(
    'mdt: a fonte continua a ser o ficheiro importado, não o relevo global',
    /MDT local grande\.tif|local DTM grande\.tif/.test(await bodyText(page)),
  )
  check('mdt: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('aviso-antes-de-usar', async () => {
  const { page, errors } = await openMission({ disclaimer: false })
  const dlg = page.getByTestId('disclaimer')
  await dlg.waitFor({ state: 'visible', timeout: 20000 })
  check(
    'aviso: aparece na primeira abertura, com o texto e a matriz',
    /Aviso antes de usar/.test(await dlg.innerText()) &&
      /piloto remoto é o único responsável/.test(await dlg.innerText()) &&
      /seguro de responsabilidade civil quando exigido/.test(await dlg.innerText()) &&
      (await dlg.getByRole('link', { name: /matriz de compatibilidade/ }).count()) === 1,
  )
  // o texto integral em cinco pontos numerados, a declaração ao lado do botão
  check(
    'aviso: cinco pontos numerados e a declaração junto do botão',
    (await dlg.locator('ol > li').count()) === 5 &&
      /Ao continuar, declara que compreende/.test(await dlg.innerText()) &&
      (await dlg.getByRole('button', { name: 'pt', exact: true }).getAttribute('aria-pressed')) ===
        'true',
  )
  // só fecha no botão: nem Escape nem um clique fora
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  await page.waitForTimeout(300)
  check('aviso: Escape e clique fora não o fecham', await dlg.isVisible())
  await dlg.getByRole('button', { name: 'en', exact: true }).click()
  check(
    'aviso: muda de língua no próprio aviso',
    /Before you use this app/.test(await dlg.innerText()) &&
      /remote pilot is solely responsible/.test(await dlg.innerText()) &&
      (await dlg.getByRole('button', { name: 'en', exact: true }).getAttribute('aria-pressed')) ===
        'true',
  )
  await dlg.getByRole('button', { name: 'I understand' }).click()
  check('aviso: o botão fecha-o', !(await dlg.isVisible()))
  check(
    'aviso: a aceitação fica guardada com a versão do texto',
    (await page.evaluate(() => localStorage.getItem('dji-mission-planner:disclaimer'))) === '2',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTitle(/Instruções e informação|Instructions and app information/).waitFor()
  await page.waitForTimeout(500)
  check('aviso: aceite, não volta a aparecer neste aparelho', (await dlg.count()) === 0)
  // reaberto da ajuda, para reler; aí fecha com Escape. Na ajuda, o aviso é
  // um tópico do grupo «Acerca» do índice
  await page.getByTitle(/Instruções e informação|Instructions and app information/).click()
  const indice = page.getByRole('navigation', { name: /Tópicos da ajuda|Help topics/ })
  await indice.getByRole('button', { name: /^(Acerca|About)$/ }).click()
  await indice
    .getByRole('button', { name: /^(Aviso antes de usar|Before you use this app)$/ })
    .click()
  await page.getByRole('button', { name: /Ler o aviso completo|Read the full disclaimer/ }).click()
  await dlg.waitFor({ state: 'visible', timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('aviso: reaberto da ajuda e fechado com Escape', (await dlg.count()) === 0)
  check('aviso: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('inspeccao-sem-relevo-bloqueia', async () => {
  // pontos de inspecção: missão própria, fora do preflight da área, mas com
  // a mesma regra; sem relevo o KMZ fica desactivado e o painel diz porquê
  const { page, errors } = await openMission({ area: fx.rect, dem: false, globalTerrain: false })
  // os pontos de inspecção estão na gaveta do cartão «Extras»; aberta, a
  // gaveta fica por cima da parte oeste da área: fecha-se para marcar e
  // volta a abrir-se para terminar
  await openDrawer(page, 'extras')
  await marcarPontos(page).click()
  await closeDrawer(page)
  await clickMap(page, 1150, 980)
  await clickMap(page, 1670, 1165)
  await openDrawer(page, 'extras')
  await marcarPontos(page).click()
  const btn = page.getByRole('button', { name: /^Exportar KMZ$|^Export KMZ$/ })
  await page.waitForTimeout(800)
  check(
    'inspecção: sem relevo o KMZ fica desactivado e o painel explica',
    (await btn.count()) === 1 &&
      !(await btn.isEnabled()) &&
      /Sem relevo sob os pontos|No terrain under the points/.test(await bodyText(page)),
  )
  // a rede volta: o relevo chega e a exportação fica disponível
  await page.route(/elevation-tiles-prod\/terrarium\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: FLAT_TILE }),
  )
  // pelo botão do preflight, ou pela nova tentativa automática, se chegar antes
  await page.getByTestId('preflight-pill').click()
  const dl = page.getByTestId('preflight-list').getByRole('button', { name: DOWNLOAD_GLOBAL })
  if ((await dl.count()) > 0) await dl.click({ timeout: 5000 }).catch(() => {})
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (b) => /^(Exportar KMZ|Export KMZ)$/.test(b.textContent.trim()) && !b.disabled,
      ),
    null,
    { timeout: 40000 },
  )
  const routes = await readRoutes(
    await panelExport(page, /^Exportar KMZ$|^Export KMZ$/, join(OUT, 'inspeccao.kmz')),
  )
  const r = analyseRoute(routes[0].wpml, plano)
  check('inspecção: com relevo exporta um ponto por marca', r.n === 2, `${r.n} waypoints`)
  check('inspecção: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- colisao com o relevo ---------------------------------------------- */
// Com o MDT carregado e seguir terreno desligado, uma altitude relativa que
// nao chega ao topo do relevo e um bloqueio, nao um numero vermelho num
// painel: foi assim que um perfil com o voo a -86 m do solo chegou ao campo.
await scenario('preflight-bloqueia-colisao-com-relevo', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  const alt = page
    .locator('label', { hasText: /Altura acima da descolagem|Altura AGL|Altitude/ })
    .locator('input')
    .first()
  await alt.fill('30')
  await alt.press('Tab')
  await page.waitForTimeout(900)
  const pill = page.getByTestId('preflight-pill')
  const exportBtn = headerExport(page)
  check(
    'colisao: a 30 m sem seguir terreno o preflight bloqueia e o KMZ fica desactivado',
    /bloqueio|blocker/.test(await pill.innerText()) && !(await exportBtn.isEnabled()),
    await pill.innerText(),
  )
  await pill.click()
  check(
    'colisao: a lista diz que a rota entra no relevo',
    /entra no relevo|into the terrain/.test(await page.getByTestId('preflight-list').innerText()),
  )
  // seguir terreno resolve: a rota passa a acompanhar o relevo
  await label(page, TF).check()
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('header button')].find((b) =>
        /Exportar WPML|Export Advanced WPML/.test(b.textContent),
      )
      return b && !b.disabled
    },
    null,
    { timeout: 20000 },
  )
  const lista = await page.getByTestId('preflight-list').innerText()
  check(
    'colisao: com seguir terreno o bloqueio desaparece',
    !/entra no relevo|into the terrain/.test(lista),
  )
  // sem base, o relevo do fixture tem dezenas de metros de desnivel: a cota
  // assumida e a minima da area, e o preflight di-lo com o valor
  check(
    'colisao: sem base, o preflight diz que assumiu a cota minima da area',
    /cota mínima \(\d+ m\)|lowest elevation \(\d+ m\)/.test(lista),
    lista.split('\n').find((l) => /mínima|lowest/.test(l)) ?? '',
  )
  check('colisao: sem erros de pagina', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- mover a area inteira ------------------------------------------------ */
// A pega central so existia quando a area vinha da ancora: numa area
// importada, ou com a divisao em mosaico/bateria ligada (onde a edicao de
// vertices esta desligada de proposito), nao havia forma de reposicionar o
// conjunto todo. E justamente ai que faz falta.
const kmlRing = (file) => {
  const m = readFileSync(file, 'utf8').match(/<coordinates>([^<]*)<\/coordinates>/)
  return m[1]
    .trim()
    .split(/\s+/)
    .map((c) => c.split(',').map(Number))
}
const centro = (r) => [
  r.reduce((s, p) => s + p[0], 0) / r.length,
  r.reduce((s, p) => s + p[1], 0) / r.length,
]

await scenario('area-mover-inteira', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  // mosaico: `editable` fica falso, que era a condicao que escondia a pega
  await configure(page, { split: 'Quadrícula' })
  const pega = page.locator('.anchor-handle')
  check('mover: ha pega central numa area importada com mosaico', (await pega.count()) === 1)

  const antes = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'mover-antes.kml')),
  )
  const box = await pega.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 140, y + 70, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)

  const depois = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'mover-depois.kml')),
  )
  const a = centro(antes)
  const b = centro(depois)
  check('mover: a area foi para leste', b[0] > a[0], `${a[0].toFixed(5)} -> ${b[0].toFixed(5)}`)
  check('mover: a area foi para sul', b[1] < a[1], `${a[1].toFixed(5)} -> ${b[1].toFixed(5)}`)
  const lado = (r) => {
    const p0 = toM(r[0][0], r[0][1])
    const p1 = toM(r[1][0], r[1][1])
    return Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
  }
  check(
    'mover: a forma nao muda',
    Math.abs(lado(antes) - lado(depois)) < 1,
    `${lado(antes).toFixed(1)} vs ${lado(depois).toFixed(1)} m`,
  )
  check('mover: o anel mantem os vertices', antes.length === depois.length)

  // Ctrl+Z desfaz o movimento inteiro: a area volta ao sitio de partida
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(600)
  const desfeito = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'mover-desfeito.kml')),
  )
  const c = centro(desfeito)
  check(
    'mover: Ctrl+Z repoe a area onde estava',
    Math.abs(c[0] - a[0]) < 1e-9 && Math.abs(c[1] - a[1]) < 1e-9,
    `${c[0].toFixed(6)},${c[1].toFixed(6)}`,
  )
  check('mover: sem erros de pagina', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Configuração (equipamento): o tempo útil por conjunto de cada bateria
// alimenta a bateria da missão (selector e tempo útil por voo, que seguem a
// configuração até serem acertados à mão), sobrevive ao recarregar e vai e
// volta por ficheiro.
await scenario('configuracao-equipamento', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  // a aeronave na secção «Missão»; a bateria da missão, na da divisão
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await abrirNoPainel(page, 'divisao')
  await page.getByRole('button', { name: 'Bateria', exact: true }).click()
  const batSel = page.getByTestId('mission-battery')
  const useful = page.getByTestId('mission-useful')
  check(
    'equipamento: M300 abre na TB60 com 25 min úteis',
    (await batSel.inputValue()) === 'TB60' && (await useful.inputValue()) === '25',
    `${await batSel.inputValue()} / ${await useful.inputValue()}`,
  )
  check(
    'equipamento: sem campo de reserva de regresso na divisão por bateria',
    (await page.getByText(/Reserva de regresso|Return reserve/).count()) === 0,
  )
  await batSel.selectOption('TB65')
  check('equipamento: TB65 escolhida dá 28 min úteis', (await useful.inputValue()) === '28')

  // abrir a configuração no botão do cabeçalho e mudar o tempo da TB65
  const gear = page.getByRole('button', { name: /^(Configuração|Settings)$/ }).first()
  await page.getByTestId('open-settings').click()
  const dlg = page.getByRole('dialog', { name: /Configuração|Settings/ })
  check(
    'equipamento: a configuração abre do cabeçalho, na aeronave da missão',
    (await dlg.isVisible()) &&
      (await gear.getAttribute('title')) !== null &&
      (await dlg
        .getByRole('tab', { name: 'DJI Matrice 300 RTK' })
        .getAttribute('aria-selected')) === 'true',
  )
  const tb65 = dlg.locator('li[data-battery-id="TB65"]')
  await tb65.locator('input[id$="-useful"]').fill('30')
  await tb65.locator('input[id$="-count"]').fill('3')
  await tb65.locator('input[id$="-count"]').press('Tab')
  // as quatro secções são separadores do índice: cada passo abre a sua
  const seccao = (nome) => dlg.getByRole('tab', { name: nome }).click()
  const AERONAVES = /^(Aeronaves e baterias|Aircraft and batteries)$/
  const DADOS = /^(Ficheiro e dados|File and data)$/
  const fechar = () =>
    dlg
      .getByRole('button', { name: /^(Fechar|Close)$/ })
      .last()
      .click()
  await fechar()
  await page.waitForTimeout(400)
  check(
    'equipamento: o selector e o tempo útil da missão seguem a configuração',
    (await batSel.inputValue()) === 'TB65' &&
      (await useful.inputValue()) === '30' &&
      /TB65 · 30 min/.test(await batSel.locator('option[value="TB65"]').innerText()),
    `${await useful.inputValue()}`,
  )
  // a nota dos conjuntos está no «Resumo e exportar»
  await abrirNoPainel(page, 'resumo')
  check(
    'equipamento: mais voos do que os 3 conjuntos dá a nota',
    await page.getByTestId('sets-note').isVisible(),
  )
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('dji-mission-planner:equipment') ?? 'null'),
  )
  const tb65Stored = stored?.aircraft?.M300RTK?.batteries?.find((b) => b.id === 'TB65')
  check(
    'equipamento: guardado no browser',
    tb65Stored?.usefulMin === 30 && tb65Stored?.count === 3 && tb65Stored?.estimated === false,
  )

  // acerto do dia na missão e volta ao valor da bateria (o campo confirma o
  // rascunho ao sair dele, no Enter ou 400 ms depois da última tecla)
  await abrirNoPainel(page, 'divisao')
  await useful.fill('26')
  await useful.press('Tab')
  await page.waitForTimeout(300)
  const reset = page.getByTestId('mission-useful-reset')
  check('equipamento: tempo útil acertado à mão mostra a reposição', await reset.isVisible())
  await reset.click()
  check('equipamento: repor volta ao tempo da bateria', (await useful.inputValue()) === '30')

  // exportar, estragar, importar de volta
  await page.getByTestId('open-settings').click()
  await seccao(DADOS)
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    dlg.getByRole('button', { name: /^(Exportar|Export)$/ }).click(),
  ])
  const file = join(OUT, 'equipamento-e2e.json')
  await dl.saveAs(file)
  const exported = JSON.parse(readFileSync(file, 'utf8'))
  check(
    'equipamento: o ficheiro exportado leva o marcador e o tempo da TB65',
    exported.kind === 'dji-mission-planner/equipment' &&
      exported.aircraft.M300RTK.batteries.find((b) => b.id === 'TB65')?.usefulMin === 30,
  )
  await seccao(AERONAVES)
  await tb65.locator('input[id$="-useful"]').fill('27')
  await tb65.locator('input[id$="-useful"]').press('Tab')
  await seccao(DADOS)
  const importInput = dlg.getByTestId('settings-import')
  await importInput.setInputFiles(fx.rect)
  check(
    'equipamento: um ficheiro que não é de equipamento dá o erro em português',
    /não é uma configuração de equipamento/.test(await dlg.getByRole('alert').innerText()),
  )
  await importInput.setInputFiles(file)
  await page.waitForTimeout(300)
  // a mensagem fica na secção do ficheiro; o tempo da TB65, na das aeronaves
  const importada = /importada|imported/.test(await dlg.getByRole('status').innerText())
  await seccao(AERONAVES)
  check(
    'equipamento: importar repõe a configuração exportada',
    (await tb65.locator('input[id$="-useful"]').inputValue()) === '30' && importada,
  )
  await fechar()

  // recarregar: equipamento e escolha da missão persistem
  await page.waitForTimeout(800) // autosave do projecto (debounce 500 ms)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
    .waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(800)
  check(
    'equipamento: recarregar mantém a TB65 com 30 min e a missão a segui-la',
    (await batSel.inputValue()) === 'TB65' &&
      (await useful.inputValue()) === '30' &&
      (await page.getByTestId('mission-useful-reset').count()) === 0,
    `${await batSel.inputValue()} / ${await useful.inputValue()}`,
  )

  // repor os valores por omissão pede confirmação (o tempo da TB65 lê-se na
  // secção das aeronaves, escondida enquanto se confirma)
  await page.getByTestId('open-settings').click()
  await seccao(DADOS)
  await dlg.getByRole('button', { name: /Repor valores por omissão|Restore defaults/ }).click()
  check(
    'equipamento: repor pede confirmação antes de apagar',
    (await tb65.locator('input[id$="-useful"]').inputValue()) === '30' &&
      (await dlg.getByRole('alertdialog').isVisible()),
  )
  await dlg.getByRole('button', { name: /^(Repor|Restore)$/ }).click()
  await fechar()
  check(
    'equipamento: valores por omissão repostos (TB65 28 min) e a missão segue',
    (await useful.inputValue()) === '28' && (await page.getByTestId('sets-note').count()) === 0,
  )
  check('equipamento: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- bases multiplas ------------------------------------------------------ */
// Operacao do LNEG: a area grande e dividida em quadrados por bateria e voada
// de varias bases. "Propor bases" cobre os blocos dentro do alcance visual;
// cada bloco sai com as alturas referidas a cota MINIMA da zona da sua base
// (relevo do fixture: rampa e colinas, logo bases a cotas diferentes);
// arrastar uma base refaz a zona; levada para longe, o preflight diz que os
// seus voos ficaram fora do alcance visual; tudo volta com o projecto.
const baseRows = (page) =>
  page.getByTestId('base-row').evaluateAll((els) =>
    els.map((e) => ({
      id: e.dataset.baseId,
      label: e.dataset.baseLabel,
      blocks: e.dataset.blockIds ? e.dataset.blockIds.split(',').map(Number) : [],
      ref: e.dataset.refElev === '' ? null : Number(e.dataset.refElev),
      radius: Number(e.dataset.zoneRadius),
    })),
  )
const savedProject = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('dji-mission-planner:project:v1') ?? 'null'))
/**
 * «Propor bases» (na secção «Bases e segurança») e esperar pelo fim: com
 * relevo a proposta corre em fatias («A propor bases… N %»), e só no fim
 * aparece o resumo da proposta.
 */
async function proposeAndWait(page) {
  await abrirNoPainel(page, 'bases')
  await page.getByTestId('propose-bases').click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="propose-bases"]')?.dataset.state === 'idle' &&
      document.querySelector('[data-testid="bases-proposal"]'),
    null,
    { timeout: 30000 },
  )
  await page.waitForTimeout(800)
}
/**
 * As zonas das bases com cota e o relevo sem recorte em curso, estável
 * durante 800 ms. Com bases novas (ou uma base arrastada) a caixa do MDT
 * importado muda e o ficheiro é recortado de novo 300 ms depois; enquanto se
 * relê, as zonas ficam sem cota. Lia-se a uma hora fixa, e num runner lento
 * a leitura caía nesse intervalo (A:null … no CI de 1d59144).
 */
async function zonesReady(page) {
  await page.evaluate(() => {
    window.__zonasOkDesde = null
  })
  await page
    .waitForFunction(
      () => {
        const dem = [...document.querySelectorAll('button')].find((b) =>
          /Importar MDT|Import DTM/.test(b.textContent),
        )
        const ok =
          (!dem || !dem.disabled) &&
          [...document.querySelectorAll('[data-testid="base-row"]')].every(
            (r) => r.dataset.refElev !== '',
          )
        const now = performance.now()
        if (!ok) {
          window.__zonasOkDesde = null
          return false
        }
        if (window.__zonasOkDesde == null) window.__zonasOkDesde = now
        return now - window.__zonasOkDesde >= 800
      },
      null,
      { timeout: 20000, polling: 100 },
    )
    .catch(() => {})
}
async function dragMarker(page, locator, dx, dy) {
  const box = await locator.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 8 })
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
}
// rótulo do voo no nome de um KMZ (…_B-3.kmz, …_B-03.kmz → "B-3")
const flightOfFile = (name) => {
  const m = /_([A-Z]+)-(\d+)\.kmz$/.exec(name)
  return m ? `${m[1]}-${Number(m[2])}` : null
}
const blockOfFlightMap = async (page) =>
  new Map(
    await page
      .getByTestId('block-row')
      .evaluateAll((els) => els.map((e) => [e.dataset.flight, Number(e.dataset.blockId)])),
  )
/** Carrega num botão e devolve [nome sugerido, caminho gravado] do download. */
async function download(page, locator, file) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    locator.click(),
  ])
  await dl.saveAs(file)
  return [dl.suggestedFilename(), file]
}
/** Os `n` ficheiros que um clique descarrega (guardados como `<prefixo>-<i>`). */
/** Nomes dos KMZ dentro de um ZIP, pela ordem em que lá estão. */
const zipOrder = async (file) =>
  Object.keys((await JSZip.loadAsync(readFileSync(file))).files).filter((n) => n.endsWith('.kmz'))
/** Os ficheiros de um ZIP de KML, o nome e o texto, pela ordem em que lá estão. */
async function zipTexts(file) {
  const zip = await JSZip.loadAsync(readFileSync(file))
  const out = []
  for (const [name, entry] of Object.entries(zip.files))
    if (!entry.dir) out.push(`${name}\n${await entry.async('string')}`)
  return out.join('\n')
}
/**
 * O texto de um código QR desenhado em <svg> (a folha A4 da base): o SVG
 * passa a um canvas no browser, como o papel o mostraria, e os píxeis são
 * lidos aqui por um descodificador independente (jsQR).
 */
async function lerQr(locator) {
  const { w, data } = await locator.evaluate(async (svg) => {
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
    await img.decode()
    const w = 360
    const c = document.createElement('canvas')
    c.width = w
    c.height = w
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, w)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, w, w)
    const px = ctx.getImageData(0, 0, w, w).data
    let s = ''
    for (let i = 0; i < px.length; i += 8192) s += String.fromCharCode(...px.subarray(i, i + 8192))
    return { w, data: btoa(s) }
  })
  return jsQR(new Uint8ClampedArray(Buffer.from(data, 'base64')), w, w)?.data ?? null
}
/** Páginas de um PDF (os objectos /Type /Page). */
const paginasPdf = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length
/** Título da missão dentro de um KMZ (o <name> da pasta do template.kml). */
async function kmzTitle(buf) {
  const kmz = await JSZip.loadAsync(buf)
  const tpl = await kmz.file('wpmz/template.kml').async('string')
  return /<Folder>\s*<name>([^<]*)<\/name>/.exec(tpl)?.[1] ?? null
}

await scenario('bases-multiplas', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  const nBlocks = await page.getByTestId('block-row').count()
  check(
    'bases: a divisão por bateria dá vários blocos quadrados',
    nBlocks >= 6,
    `${nBlocks} blocos`,
  )
  check(
    'bases: sem bases os voos são numerados 1..n',
    (await page.getByTestId('block-row').first().getAttribute('data-flight')) === '1',
  )

  await proposeAndWait(page)
  await zonesReady(page)
  let rows = await baseRows(page)
  check(
    'bases: "Propor bases" dá pelo menos duas bases',
    rows.length >= 2,
    rows.map((r) => r.label).join(','),
  )
  const assigned = rows.flatMap((r) => r.blocks)
  check(
    'bases: cada bloco fica com uma base, e só uma',
    assigned.length === nBlocks && new Set(assigned).size === nBlocks,
    `${assigned.length} atribuídos de ${nBlocks}`,
  )
  check(
    'bases: zonas calculadas sobre o MDT (cota de referência por base)',
    rows.every((r) => Number.isFinite(r.ref)),
    rows.map((r) => `${r.label}:${r.ref}`).join(' '),
  )
  // numeração por base, pela ordem dos rótulos: A-1, A-2, B-3, ...
  const flights = await page
    .getByTestId('block-row')
    .evaluateAll((els) => els.map((e) => e.dataset.flight))
  const parsed = flights.map((f) => /^([A-Z]+)-(\d+)$/.exec(f))
  check(
    'bases: voos numerados base a base (A-1, A-2, B-3...)',
    parsed.every(Boolean) &&
      parsed.every((m, i) => Number(m[2]) === i + 1) &&
      parsed.every((m, i) => i === 0 || m[1] >= parsed[i - 1][1]),
    flights.join(' '),
  )

  // cada KMZ com as alturas referidas à zona da sua base; o ficheiro tem o
  // rótulo do voo (…_A-1.kmz), e o bloco vem da lista de blocos
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'bases-blocos.zip')))
  const refOfBlock = new Map()
  for (const r of rows) for (const id of r.blocks) refOfBlock.set(id, r.ref)
  const blockOfFlight = await blockOfFlightMap(page)
  const est = routes.map((x) => {
    const id = blockOfFlight.get(flightOfFile(x.name))
    const a = analyseRoute(x.wpml, { toM, ground, aglNominalM: AGL_M })
    // h = AGL + terreno − ref (mais a subida do corredor lateral): o máximo
    // de AGL + terreno − h é a cota de referência do bloco
    const ref = Math.max(...a.points.map(([px, py, h]) => AGL_M + ground(px, py) - h))
    return { id, ref, want: refOfBlock.get(id) }
  })
  check('bases: um KMZ por bloco', routes.length === nBlocks, `${routes.length} rotas`)
  check(
    'bases: as alturas de cada KMZ referem-se à cota da zona da sua base (±2 m)',
    est.every((e) => Number.isFinite(e.want) && Math.abs(e.ref - e.want) <= 2),
    est.map((e) => `b${e.id}:${e.ref.toFixed(1)}/${e.want?.toFixed(1)}`).join(' '),
  )
  const refs = rows.map((r) => r.ref)
  const spread = Math.max(...refs) - Math.min(...refs)
  const lo = est.reduce((m, e) => (e.want < m.want ? e : m))
  const hi = est.reduce((m, e) => (e.want > m.want ? e : m))
  check(
    'bases: bases a cotas diferentes dão desvios de altura diferentes nos seus blocos',
    spread > 5 && Math.abs(hi.ref - lo.ref - (hi.want - lo.want)) <= 2,
    `zonas ${Math.min(...refs).toFixed(1)}..${Math.max(...refs).toFixed(1)} m; blocos ${lo.ref.toFixed(1)} e ${hi.ref.toFixed(1)} m`,
  )

  // arrastar uma base: a zona é refeita (outra cota) e o ponto gravado muda
  const pin = (label) =>
    page.locator('.base-marker-multi').filter({ has: page.locator(`[data-base-label="${label}"]`) })
  const before = rows.find((r) => r.label === 'A')
  const pt0 = (await savedProject(page))?.bases?.find((b) => b.label === 'A')?.point
  await dragMarker(page, pin('A'), 90, -60)
  await zonesReady(page)
  rows = await baseRows(page)
  const after = rows.find((r) => r.label === 'A')
  const pt1 = (await savedProject(page))?.bases?.find((b) => b.label === 'A')?.point
  check(
    'bases: arrastar a base move o ponto e refaz a zona',
    pt0 && pt1 && (pt0[0] !== pt1[0] || pt0[1] !== pt1[1]) && after.ref !== before.ref,
    `cota ${before.ref} -> ${after.ref}`,
  )
  check(
    'bases: a base arrastada mantém os seus voos (a aplicação não mexe na escolha)',
    after.blocks.join(',') === before.blocks.join(','),
  )

  // levada para longe dos seus blocos: preflight bloco a bloco
  const map = await page.locator('.leaflet-container').boundingBox()
  const box = await pin('A').boundingBox()
  const far = [
    box.x < map.x + map.width / 2 ? map.x + map.width - 40 : map.x + 40,
    box.y < map.y + map.height / 2 ? map.y + map.height - 40 : map.y + 60,
  ]
  await dragMarker(page, pin('A'), far[0] - box.x - box.width / 2, far[1] - box.y - box.height / 2)
  await page.getByTestId('preflight-pill').click()
  const lista = await page.getByTestId('preflight-list').innerText()
  // com um voo, a frase; com vários, a tabela «N voos longe demais da base
  // para VLOS», uma linha por voo: voo, bloco, base e distância no pior caso
  check(
    'bases: o preflight diz que os voos da base A ficaram fora do alcance visual',
    /Voo A-\d+ \(bloco \d+\) longe demais da base A para VLOS: \d+ m/.test(lista) ||
      (/\d+ voos longe demais da base para VLOS/.test(lista) &&
        /A-\d+\s+\d+\s+(A\s+)?Base A\s+\d+ m/.test(lista)),
    lista
      .split('\n')
      .filter((l) => /VLOS|Base A/.test(l))
      .slice(0, 3)
      .join(' | ')
      .slice(0, 300),
  )
  await page.getByTestId('preflight-pill').click()

  // o projecto guarda as bases e as atribuições, e volta igual
  await page.waitForTimeout(800)
  const saved = await savedProject(page)
  const ajv = new Ajv2020({ allErrors: true })
  const valid = ajv.compile(
    JSON.parse(readFileSync('public/schema/project-v2.schema.json', 'utf8')),
  )
  check(
    'bases: o projecto gravado leva as bases e valida contra o esquema',
    Array.isArray(saved?.bases) &&
      saved.bases.length === rows.length &&
      Object.keys(saved.blockBase ?? {}).length === nBlocks &&
      valid(saved) === true,
    (valid.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; '),
  )
  const labels = rows.map((r) => r.label).join(',')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
    .waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(1500)
  const again = await baseRows(page)
  check(
    'bases: recarregar repõe as bases, os rótulos e os voos de cada uma',
    again.map((r) => r.label).join(',') === labels &&
      again.every((r, i) => r.blocks.join(',') === rows[i].blocks.join(',')),
    again.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' '),
  )
  const back = (await savedProject(page))?.bases?.find((b) => b.label === 'A')?.point
  check(
    'bases: a base movida volta onde o operador a deixou',
    back && saved.bases.find((b) => b.label === 'A').point.join() === back.join(),
  )
  check('bases: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Exportação base a base: no campo o operador chega à base B e só quer os
// voos dela. ZIP da base B só com os voos de B, pela ordem de voo e com o
// rótulo no nome; um voo só; todos; KML de campo; ficha na checklist.
await scenario('bases-exportar-por-base', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await proposeAndWait(page)
  await zonesReady(page)
  await exportReady(page)
  const rows = await baseRows(page)
  const order = await page
    .getByTestId('block-row')
    .evaluateAll((els) => els.map((e) => e.dataset.flight))
  const withFlights = rows.filter((r) => r.blocks.length > 0)
  check(
    'por base: pelo menos duas bases com voos',
    withFlights.length >= 2,
    rows.map((r) => `${r.label}:${r.blocks.length}`).join(' '),
  )
  // as exportações por voo e por base, no «Resumo e exportar»
  await abrirNoPainel(page, 'resumo')
  const panel = page.getByTestId('flight-exports')
  check(
    'por base: um só botão «Voos por base (KMZ, ZIP)» (e não um por base)',
    (await panel.getByTestId('export-by-base').count()) === 1 &&
      (await panel.getByTestId('export-base-flights').count()) === 0,
  )
  // dois pares iguais: KMZ (a rota) e KML (o polígono), cada um com todos
  // soltos num ZIP e numa pasta por base
  const kmzGroup = panel.getByRole('group', { name: /^KMZ/ })
  const kmlGroup = panel.getByRole('group', { name: /^KML/ })
  check(
    'exportar: dois pares, KMZ e KML, cada um com todos (ZIP) e por base (ZIP)',
    (await kmzGroup.getByTestId('export-all-flights').count()) === 1 &&
      (await kmzGroup.getByTestId('export-by-base').count()) === 1 &&
      (await kmlGroup.getByTestId('export-kml-all').count()) === 1 &&
      (await kmlGroup.getByTestId('export-kml-by-base').count()) === 1,
  )
  const header = headerExport(page)
  check(
    'por base: os botões seguem o preflight do botão do cabeçalho',
    (await panel.getByTestId('export-all-flights').isDisabled()) === (await header.isDisabled()) &&
      (await panel.getByTestId('export-by-base').isDisabled()) === (await header.isDisabled()),
  )

  // todos os voos por base: uma pasta por base, cada uma com os seus voos
  // pela ordem de voo (com vários pilotos, cada um leva as suas pastas)
  const B = withFlights[1]
  const wantB = order.filter((f) => f.startsWith(`${B.label}-`))
  const [zipByBase, fileByBase] = await download(
    page,
    panel.getByTestId('export-by-base'),
    join(OUT, 'voos-por-base.zip'),
  )
  const prefix = zipByBase.replace(/_voos-por-base\.zip$/, '')
  const entries = await zipOrder(fileByBase)
  check(
    'por base: ZIP «…_voos-por-base.zip»',
    zipByBase.endsWith('_voos-por-base.zip') && /_area-tf$/.test(prefix),
    zipByBase,
  )
  check(
    'por base: uma pasta por base com voos, e cada voo na pasta da sua base',
    withFlights.every((r) => entries.some((n) => n.startsWith(`base-${r.label}/`))) &&
      entries.every((n) => {
        const m = /^base-([A-Z]+)\/[^/]+_([A-Z]+)-\d+\.kmz$/.exec(n)
        return m && m[1] === m[2]
      }) &&
      entries.length === order.length,
    entries.join(' '),
  )
  const inB = entries.filter((n) => n.startsWith(`base-${B.label}/`))
  check(
    `por base: a pasta da base ${B.label} só tem os voos dela, pela ordem de voo`,
    inB.map(flightOfFile).join(',') === wantB.join(','),
    `${inB.join(' ')} / ${wantB.join(' ')}`,
  )
  check(
    'por base: cada KMZ chama-se <missão>_area-tf_<voo>.kmz',
    inB.every((n) => {
      const f = n.split('/').pop()
      return f.startsWith(`${prefix}_${B.label}-`) && /^[\w-]+\.kmz$/.test(f)
    }),
    inB.join(' '),
  )
  const zip = await JSZip.loadAsync(readFileSync(fileByBase))
  const titles = await Promise.all(
    inB.map(async (n) => kmzTitle(await zip.file(n).async('nodebuffer'))),
  )
  check(
    'por base: o título da missão no KMZ é o nome do ficheiro',
    titles.every(
      (t, i) =>
        t ===
        inB[i]
          .split('/')
          .pop()
          .replace(/\.kmz$/, ''),
    ),
    titles.join(' '),
  )
  // KML por base: uma pasta por base com um KML por voo (só o polígono, para
  // a missão de mapeamento do Pilot 2) e mapa/ com a base
  const [zipKml, fileKml] = await download(
    page,
    panel.getByTestId('export-kml-by-base'),
    join(OUT, 'kml-por-base.zip'),
  )
  const kmlZip = await JSZip.loadAsync(readFileSync(fileKml))
  const kmlEntries = Object.keys(kmlZip.files).filter((n) => n.endsWith('.kml'))
  const polys = kmlEntries.filter((n) => !n.includes('/mapa/'))
  const stem = prefix.replace(/_area.*$/, '')
  check(
    'kml por base: ZIP «…_kml-por-base.zip», com o prefixo do ZIP dos voos',
    zipKml === `${prefix}_kml-por-base.zip`,
    zipKml,
  )
  check(
    'kml por base: um KML por voo na pasta da sua base, pela ordem de voo, e mapa/ por base',
    polys.map((n) => flightOfFile(n.replace(/\.kml$/, '.kmz'))).join(',') === order.join(',') &&
      polys.every((n) => {
        const m = /^base-([A-Z]+)\/[^/]+_poligono_([A-Z]+)-\d+\.kml$/.exec(n)
        return m && m[1] === m[2]
      }) &&
      withFlights.every((r) =>
        kmlEntries.includes(`base-${r.label}/mapa/${stem}_mapa_base-${r.label}.kml`),
      ),
    kmlEntries.join(' '),
  )
  const polyTexts = await Promise.all(polys.map((n) => kmlZip.file(n).async('string')))
  check(
    'kml por base: cada KML de bloco tem um só Placemark com um só Polygon fechado, sem buracos, e o nome do ficheiro',
    polyTexts.every((txt, i) => {
      const name = polys[i]
        .split('/')
        .pop()
        .replace(/\.kml$/, '')
      const coords = (/<coordinates>([^<]*)<\/coordinates>/.exec(txt)?.[1] ?? '')
        .trim()
        .split(/\s+/)
      return (
        (txt.match(/<Placemark>/g) || []).length === 1 &&
        (txt.match(/<Polygon>/g) || []).length === 1 &&
        !txt.includes('innerBoundaryIs') &&
        txt.includes(`<name>${name}</name>`) &&
        coords.length >= 4 &&
        coords[0] === coords[coords.length - 1]
      )
    }),
    polys.join(' '),
  )
  // KML de todos os blocos, o par do ZIP de todos os voos: os mesmos KML de
  // bloco do ZIP por base, com o mesmo texto, soltos na raiz e sem mapa/
  const [zipKmlAll, fileKmlAll] = await download(
    page,
    panel.getByTestId('export-kml-all'),
    join(OUT, 'kml-todos.zip'),
  )
  const kmlAllZip = await JSZip.loadAsync(readFileSync(fileKmlAll))
  const kmlAll = Object.keys(kmlAllZip.files)
  const kmlAllTexts = await Promise.all(kmlAll.map((n) => kmlAllZip.file(n).async('string')))
  check(
    'kml todos: ZIP «…_kml.zip», com o prefixo do ZIP dos voos',
    zipKmlAll === `${prefix}_kml.zip`,
    zipKmlAll,
  )
  check(
    'kml todos: os KML de bloco do ZIP por base, soltos na raiz, pela ordem de voo e com o mesmo texto',
    kmlAll.join(' ') === polys.map((n) => n.split('/').pop()).join(' ') &&
      kmlAllTexts.length === polyTexts.length &&
      kmlAllTexts.every((txt, i) => txt === polyTexts[i]),
    kmlAll.join(' '),
  )
  const routesB = (await readRoutes(fileByBase)).filter((x) =>
    x.name.startsWith(`base-${B.label}/`),
  )
  const refB = routesB.map((x) => {
    const a = analyseRoute(x.wpml, { toM, ground, aglNominalM: AGL_M })
    return Math.max(...a.points.map(([px, py, h]) => AGL_M + ground(px, py) - h))
  })
  check(
    `por base: as alturas dos voos de ${B.label} referem-se à cota da sua zona (±2 m)`,
    refB.length === wantB.length && refB.every((r) => Math.abs(r - B.ref) <= 2),
    `${refB.map((r) => r.toFixed(1)).join(',')} / ${B.ref}`,
  )

  // um voo só: o segundo da lista (ou o único de B)
  const pick = wantB[wantB.length - 1]
  const blockOfFlight = await blockOfFlightMap(page)
  await panel.getByTestId('export-flight-select').selectOption(String(blockOfFlight.get(pick)))
  const [oneName, oneFile] = await download(
    page,
    panel.getByTestId('export-one-flight'),
    join(OUT, 'um-voo.kmz'),
  )
  check(
    `um voo: KMZ «${prefix}_${pick}.kmz»`,
    flightOfFile(oneName) === pick && oneName.startsWith(`${prefix}_`),
    oneName,
  )
  check(
    'um voo: título no KMZ igual ao nome do ficheiro',
    (await kmzTitle(readFileSync(oneFile))) === oneName.replace(/\.kmz$/, ''),
  )

  // todos os voos: o ZIP de todos, pela ordem de voo; igual ao do cabeçalho
  const [allName, allFile] = await download(
    page,
    panel.getByTestId('export-all-flights'),
    join(OUT, 'todos.zip'),
  )
  const all = await zipOrder(allFile)
  check(
    'todos: «…_voos.zip» com todos os voos pela ordem de voo',
    allName === `${prefix}_voos.zip` && all.map(flightOfFile).join(',') === order.join(','),
    `${allName}: ${all.join(' ')}`,
  )
  // o cabeçalho com bases: um clique, um ficheiro — o ZIP por base (M3-U16);
  // o dos voos soltos continua em «Exportar voos»
  const [headName, headFile] = await download(page, header, join(OUT, 'cabecalho.zip'))
  check(
    'todos: o botão do cabeçalho, que diz (ZIP), descarrega um só ZIP, o por base',
    headName === zipByBase &&
      (await zipOrder(headFile)).join() === entries.join() &&
      (await rotuloCondiz(header, headName)),
    `${(await header.innerText()).trim()} → ${headName}`,
  )
  // o fim do cartão 7 é o par do cabeçalho, igual em tudo: nome, dica,
  // preflight e ficheiro; a dica diz qual dos ZIP de «Exportar voos» sai
  const fimMissao = page.getByTestId('summary-export-mission')
  const [fimName, fimFile] = await download(page, fimMissao, join(OUT, 'cartao7.zip'))
  check(
    'cartão 7: o botão da missão é o do cabeçalho (nome, dica e o mesmo ZIP por base)',
    (await fimMissao.innerText()).trim() === (await header.innerText()).trim() &&
      (await fimMissao.getAttribute('title')) === (await header.getAttribute('title')) &&
      /Voos por base \(KMZ, ZIP\)/.test(await header.getAttribute('title')) &&
      (await fimMissao.isDisabled()) === (await header.isDisabled()) &&
      fimName === headName &&
      (await zipOrder(fimFile)).join() === entries.join(),
    `${(await fimMissao.innerText()).trim()} → ${fimName} | ${await header.getAttribute('title')}`,
  )
  // «Exportar KML da área», o par KML do botão da missão: com bases, os KML dos
  // blocos numa pasta por base, o mesmo que «Blocos por base (KML, ZIP)»
  const fimKml = page.getByTestId('summary-export-area')
  const [fimKmlName, fimKmlFile] = await download(page, fimKml, join(OUT, 'cartao7-kml.zip'))
  check(
    'cartão 7: com bases, «Exportar KML da área (ZIP)» escreve o ZIP dos KML por base, e a dica di-lo',
    (await fimKml.innerText()).trim() === 'Exportar KML da área (ZIP)' &&
      /Blocos por base \(KML, ZIP\)/.test(await fimKml.getAttribute('title')) &&
      fimKmlName === zipKml &&
      (await zipTexts(fimKmlFile)) === (await zipTexts(fileKml)) &&
      (await page.getByTestId('summary-export-area-notes').count()) === 0,
    `${(await fimKml.innerText()).trim()} → ${fimKmlName}`,
  )
  // no cabeçalho, um item do menu da seta do botão de exportar
  const cabKml = (await headerMenu(page)).getByTestId('header-export-area')
  const cabKmlNome = await itemName(cabKml)
  const cabKmlDica = await cabKml.getAttribute('title')
  const [cabKmlName, cabKmlFile] = await download(page, cabKml, join(OUT, 'cab-kml.zip'))
  check(
    'cartão 7: «Exportar KML da área» é o do cabeçalho (nome, dica e o mesmo ficheiro)',
    (await fimKml.innerText()).trim() === cabKmlNome &&
      (await fimKml.getAttribute('title')) === cabKmlDica &&
      fimKmlName === cabKmlName &&
      (await zipTexts(fimKmlFile)) === (await zipTexts(cabKmlFile)),
    `${(await fimKml.innerText()).trim()} → ${fimKmlName} | cabeçalho: ${cabKmlNome}`,
  )
  // e o polígono da área inteira, à parte, na seta: «Polígono da área (KML)»
  const poligono = (await headerMenu(page)).getByTestId('header-export-area-polygon')
  const poligonoNome = await itemName(poligono)
  const poligonoDica = await poligono.getAttribute('title')
  const [poligonoName, poligonoFile] = await download(page, poligono, join(OUT, 'cab-area.kml'))
  const poligonoKml = readFileSync(poligonoFile, 'utf8')
  check(
    'cabeçalho: com a área em vários voos, «Polígono da área (KML)» dá só o polígono da área',
    poligonoNome === 'Polígono da área (KML)' &&
      /^Só o polígono da área/.test(poligonoDica) &&
      /\.kml$/.test(poligonoName) &&
      (poligonoKml.match(/<Polygon>/g) ?? []).length === 1,
    `${poligonoNome} → ${poligonoName}`,
  )
  // a seta do botão de exportar tem as outras do cartão 7 («Exportar voos»
  // menos «Um voo», que pede a escolha do voo): os mesmos nomes e a mesma
  // linha a dizer o que sai, as mesmas dicas, o mesmo estado e os mesmos
  // ficheiros
  const pares = [
    ['export-all-flights', 'header-export-all-flights'],
    ['export-by-base', 'header-export-by-base'],
    ['export-kml-all', 'header-export-kml-all'],
    ['export-kml-by-base', 'header-export-kml-by-base'],
    ['export-bases-kml', 'header-export-bases-kml'],
  ]
  const menu = await headerMenu(page)
  const nomesMenu = await menu
    .getByRole('menuitem')
    .evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0].trim()))
  const diferentes = []
  for (const [fim, cab] of pares) {
    const a = panel.getByTestId(fim)
    const b = menu.getByTestId(cab)
    if (
      (await b.count()) !== 1 ||
      (await a.innerText()).trim() !== (await b.innerText()).trim() ||
      (await a.getAttribute('title')) !== (await b.getAttribute('title')) ||
      (await a.isDisabled()) !== (await b.isDisabled())
    )
      diferentes.push(fim)
  }
  await page.keyboard.press('Escape')
  check(
    'cabeçalho: o menu da seta tem as exportações do cartão 7, com o mesmo nome, dica e estado',
    diferentes.length === 0 &&
      nomesMenu.join(' | ') ===
        [
          'Exportar KML da área (ZIP)',
          'Polígono da área (KML)',
          'Todos os voos (KMZ, ZIP)',
          'Voos por base (KMZ, ZIP)',
          'Todos os blocos (KML, ZIP)',
          'Blocos por base (KML, ZIP)',
          'Bases e blocos (KML)',
        ].join(' | '),
    `${nomesMenu.join(' | ')}${diferentes.length ? ` — diferentes: ${diferentes.join(', ')}` : ''}`,
  )
  const [menuTodosName, menuTodosFile] = await download(
    page,
    (await headerMenu(page)).getByTestId('header-export-all-flights'),
    join(OUT, 'cab-todos.zip'),
  )
  const [menuMapaName, menuMapaFile] = await download(
    page,
    (await headerMenu(page)).getByTestId('header-export-bases-kml'),
    join(OUT, 'cab-bases.kml'),
  )
  const [fimMapaName, fimMapaFile] = await download(
    page,
    panel.getByTestId('export-bases-kml'),
    join(OUT, 'cartao7-bases.kml'),
  )
  check(
    'cabeçalho: os itens do menu descarregam os ficheiros do cartão 7 (todos os voos, bases e blocos)',
    menuTodosName === allName &&
      (await zipOrder(menuTodosFile)).join() === all.join() &&
      menuMapaName === fimMapaName &&
      readFileSync(menuMapaFile, 'utf8') === readFileSync(fimMapaFile, 'utf8'),
    `${menuTodosName}, ${menuMapaName}`,
  )

  // KML de campo: bases, zonas, blocos com o rótulo do voo
  const [kmlName, kmlFile] = await download(
    page,
    panel.getByTestId('export-bases-kml'),
    join(OUT, 'bases.kml'),
  )
  const kml = readFileSync(kmlFile, 'utf8')
  const names = [...kml.matchAll(/<name>([^<]*)<\/name>/g)].map((m) => m[1])
  check('kml: ficheiro «…_bases.kml»', kmlName.endsWith('_bases.kml'), kmlName)
  check(
    'kml: um ponto por base com o rótulo e uma zona com o raio efectivo',
    withFlights.every(
      (r) => names.includes(`Base ${r.label}`) && names.includes(`Zona ${r.label} (${r.radius} m)`),
    ),
    names.filter((n) => /Base|Zona/.test(n)).join(' | '),
  )
  check(
    'kml: um contorno por bloco com o rótulo do voo, pela ordem de voo',
    order.every((f) => names.includes(f)) &&
      names.filter((n) => order.includes(n)).join(',') === order.join(','),
    names.filter((n) => /^[A-Z]+-\d+$/.test(n)).join(' '),
  )
  check(
    'kml: a ficha da base leva os ficheiros dos voos',
    inB.every((n) => kml.includes(n.split('/').pop())),
  )

  // checklist de campo: um cartão por base com voos, que abre a folha A4 dela
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  const sec = page.getByTestId('checklist-bases')
  await sec.waitFor({ timeout: 10000 })
  const cartoes = await sec
    .getByTestId('base-sheet-card')
    .evaluateAll((els) => els.map((e) => e.dataset.baseLabel))
  check(
    'checklist: uma ficha por base com voos',
    cartoes.join() === withFlights.map((r) => r.label).join(),
    cartoes.join(),
  )
  // a folha A4 da base B, aberta no cartão dela
  const cartaoB = sec.locator(`[data-testid="base-sheet-card"][data-base-label="${B.label}"]`)
  await cartaoB.click()
  const folha = page.getByTestId('sheet-view').getByTestId('base-sheet')
  await folha.waitFor({ timeout: 10000 })
  const sB = await folha.evaluate((e) => ({
    label: e.dataset.baseLabel,
    text: e.innerText,
    href: e.querySelector('[data-testid="base-sheet-link"]')?.getAttribute('href') ?? '',
    flights: [...e.querySelectorAll('[data-testid="base-sheet-flight"]')].map(
      (r) => r.dataset.flight,
    ),
  }))
  check(
    `checklist: ficha da base ${B.label} com coordenadas, ligação, zona, cota, voos e ficheiros`,
    sB.label === B.label &&
      /-?\d+\.\d{6}, -?\d+\.\d{6}/.test(sB.text) &&
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(sB.href) &&
      // a zona de descolagem, no primeiro número da folha
      /Zona de descolagem\s+\d+ m/.test(sB.text) &&
      /Descolar a menos de \d+ m do ponto|Descolar no ponto marcado/.test(sB.text) &&
      /Voo acima do planeado\s+entre 0 e \+\d+ m/.test(sB.text) &&
      /Distância VLOS/i.test(sB.text) &&
      // «1 necessário» com um voo, «N necessários» com mais
      /necessários?/.test(sB.text) &&
      // M3-U10: alturas no comando, % do útil e os parâmetros do plano
      /Altura no comando/i.test(sB.text) &&
      // «150–180 m», ou um só valor quando a do 1.º waypoint é a máxima
      /Altura no comando\s+-?\d+(–\d+)? m\s+rel\. à descolagem/.test(sB.text) &&
      /\d+ %/.test(sB.text) &&
      /altura \d+ m · [\d.]+ m\/s · sobreposição \d+\/\d+ %/.test(sB.text) &&
      sB.flights.join(',') === wantB.join(',') &&
      inB.every((n) => sB.text.includes(n.split('/').pop())),
    sB.text.replace(/\s+/g, ' ').slice(0, 300),
  )
  // o código QR da folha lê-se e abre o ponto da base: a mesma ligação dos mapas
  const qrB = await lerQr(folha.getByTestId('base-sheet-qr'))
  check(
    `checklist: o código QR da ficha da base ${B.label} dá a ligação do ponto da base`,
    qrB !== null && qrB === sB.href,
    `${qrB} / ${sB.href}`,
  )
  // impressa, a folha é uma página A4 (com voos a mais, a letra encolhe e cabe)
  const pdfFolha = await page.pdf({ format: 'A4' })
  check(
    'checklist: a folha da base imprime-se numa página A4',
    paginasPdf(pdfFolha) === 1,
    `${paginasPdf(pdfFolha)} páginas`,
  )
  // Esc volta à checklist, com o foco no cartão da base
  await page.keyboard.press('Escape')
  check(
    'checklist: Esc fecha a folha e devolve o foco ao cartão da base',
    (await page.getByTestId('sheet-view').count()) === 0 &&
      (await cartaoB.evaluate((e) => e === document.activeElement)),
  )
  check(
    'checklist: a linha do dia soma os voos de todas as bases contra os conjuntos da equipa',
    (await sec.getByTestId('sheets-day').count()) === 1 &&
      /Dia: \d+ voos? · conjuntos de baterias: \d+ necessários?/.test(
        await sec.getByTestId('sheets-day').innerText(),
      ),
    await sec
      .getByTestId('sheets-day')
      .innerText()
      .catch(() => ''),
  )
  // «Imprimir as N fichas»: uma folha por base, que só existem enquanto se imprime
  await page.evaluate(() => {
    window.__folhas = null
    window.print = () => {
      window.__folhas = [
        ...document.querySelectorAll('[data-testid="sheets-print"] [data-testid="base-sheet"]'),
      ].map((e) => e.dataset.baseLabel)
    }
  })
  await sec.getByTestId('sheets-print-all').click()
  const impressas = await page.evaluate(() => window.__folhas)
  check(
    'checklist: «Imprimir as N fichas» imprime uma folha por base com voos',
    (impressas ?? []).join() === withFlights.map((r) => r.label).join() &&
      (await page.getByTestId('sheets-print').count()) === 0,
    (impressas ?? []).join(),
  )
  // na fase Durante, o selector de voo: os voos do plano pela ordem de voo,
  // com os dados do escolhido; é só uma vista (as caixas não mudam)
  await page.getByRole('tab', { name: /Durante/ }).click()
  const selector = page.getByTestId('chk-flight-select')
  const opcoes = await selector.locator('option').evaluateAll((els) => els.map((e) => e.value))
  const marcadas = () => page.locator('[role="checkbox"][aria-checked="true"]').count()
  const antesDoVoo = await marcadas()
  await selector.selectOption(wantB[0])
  check(
    'checklist: o selector de voo do Durante tem os voos do plano, e o escolhido diz a sua base',
    opcoes.join(',') === order.join(',') &&
      new RegExp(`Base ${B.label} · zona \\d+ m`).test(
        await page.getByTestId('chk-flight-info').innerText(),
      ) &&
      (await marcadas()) === antesDoVoo,
    `${opcoes.join(' ')} | ${await page.getByTestId('chk-flight-info').innerText()}`,
  )
  await page.getByRole('button', { name: /Voltar ao planeador|Back to planner/ }).click()

  // relatório: a mesma ficha, inteira no botão por baixo da tabela dos voos
  // (a tabela tem a ficha de cada base numa linha)
  await page.getByRole('button', { name: /^(Relatório|Report)$/ }).click()
  const rep = page.getByTestId('report-bases')
  await rep.waitFor({ timeout: 10000 })
  const verFichas = rep.getByRole('button', { name: /fichas? de campo|field sheets?/ })
  check(
    'relatório: as fichas inteiras começam fechadas, no botão por baixo da tabela',
    (await verFichas.getAttribute('aria-expanded')) === 'false' &&
      (await rep.getByTestId('base-sheet').count()) === 0,
  )
  await verFichas.click()
  await rep.getByTestId('base-sheet').first().waitFor({ timeout: 10000 })
  check(
    'relatório: ficha por base',
    (await verFichas.getAttribute('aria-expanded')) === 'true' &&
      (await rep.getByTestId('base-sheet').count()) === withFlights.length,
  )
  // a tabela dos blocos com os rótulos dos voos do planeador (A-1…), pela
  // ordem de voo — dizia B01… enquanto o mapa dizia 1… e as fichas A-1…
  const repFlights = await page
    .getByTestId('report-block-row')
    .evaluateAll((els) => els.map((e) => e.dataset.flight))
  check(
    'relatório: a tabela dos blocos usa os rótulos dos voos, pela ordem de voo',
    repFlights.join(',') === order.join(','),
    `${repFlights.join(' ')} / ${order.join(' ')}`,
  )
  // a ficha de cada base numa linha da tabela: uma vez cada base com voos,
  // pela ordem dos rótulos (os voos dela por baixo)
  const repBases = await page
    .getByTestId('report-base')
    .evaluateAll((els) => els.map((e) => e.dataset.baseLabel))
  check(
    'relatório: cada base com voos uma vez na tabela dos voos',
    repBases.join() === withFlights.map((r) => r.label).join(),
    repBases.join(' '),
  )
  // impressão: a barra do relatório não sai no papel; o mapa e a tabela sim,
  // em fundo branco
  await page.emulateMedia({ media: 'print' })
  const impresso = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"][aria-labelledby="rep-title"]')
    const vis = (el) => Boolean(el) && el.getClientRects().length > 0
    return {
      barra: vis(root?.querySelector('header')),
      mapa: vis(root?.querySelector('canvas')),
      tabela: vis(root?.querySelector('[data-testid="report-block-row"]')),
      fundo: getComputedStyle(document.body).backgroundColor,
    }
  })
  await page.emulateMedia({ media: 'screen' })
  check(
    'relatório impresso: sem a barra de cima, com o mapa e a tabela dos voos, em branco',
    !impresso.barra && impresso.mapa && impresso.tabela && impresso.fundo === 'rgb(255, 255, 255)',
    JSON.stringify(impresso),
  )
  check('por base: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Sem bases: os dois «todos», KMZ e KML, com os mesmos voos pela mesma
// ordem; os «por base» e o mapa «Bases e blocos» só aparecem com bases.
await scenario('exportar-voos-sem-bases', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await configure(page, { split: 'Quadrícula' })
  await exportReady(page)
  // as exportações por voo, no «Resumo e exportar»
  await abrirNoPainel(page, 'resumo')
  const panel = page.getByTestId('flight-exports')
  const conta = (id) => panel.getByTestId(id).count()
  check(
    'sem bases: KMZ e KML de todos, sem os por base nem o mapa das bases',
    (await conta('export-all-flights')) === 1 &&
      (await conta('export-kml-all')) === 1 &&
      (await conta('export-by-base')) === 0 &&
      (await conta('export-kml-by-base')) === 0 &&
      (await conta('export-bases-kml')) === 0,
  )
  const [kmzName, kmzFile] = await download(
    page,
    panel.getByTestId('export-all-flights'),
    join(OUT, 'sem-bases-voos.zip'),
  )
  const [kmlName, kmlFile] = await download(
    page,
    panel.getByTestId('export-kml-all'),
    join(OUT, 'sem-bases-kml.zip'),
  )
  const kmz = await zipOrder(kmzFile)
  // sem bases o botão da missão (o do cabeçalho e o do fim do cartão 7, o
  // mesmo) escreve o ZIP de todos, e a dica di-lo
  const cab = headerExport(page)
  const [cabName] = await download(page, cab, join(OUT, 'sem-bases-cabecalho.zip'))
  const [fimName] = await download(
    page,
    page.getByTestId('summary-export-mission'),
    join(OUT, 'sem-bases-cartao7.zip'),
  )
  check(
    'sem bases: o cabeçalho e o fim do cartão 7 escrevem o ZIP de todos, e a dica di-lo',
    cabName === kmzName &&
      fimName === kmzName &&
      /Todos os voos \(KMZ, ZIP\)/.test(await cab.getAttribute('title')) &&
      (await page.getByTestId('summary-export-mission').getAttribute('title')) ===
        (await cab.getAttribute('title')),
    `${cabName} / ${fimName}`,
  )
  // e o par KML dele, «Exportar KML da área» (no fim do cartão 7 e na seta): os KML
  // dos blocos todos soltos, o mesmo que «Todos os blocos (KML, ZIP)»
  const fimKml = page.getByTestId('summary-export-area')
  const [fimKmlName, fimKmlFile] = await download(
    page,
    fimKml,
    join(OUT, 'sem-bases-cartao7-kml.zip'),
  )
  const cabKml = (await headerMenu(page)).getByTestId('header-export-area')
  const cabKmlNome = await itemName(cabKml)
  const cabKmlDica = await cabKml.getAttribute('title')
  const [cabKmlName, cabKmlFile] = await download(page, cabKml, join(OUT, 'sem-bases-cab-kml.zip'))
  const todosKml = await zipTexts(kmlFile)
  check(
    'sem bases: «Exportar KML da área (ZIP)» escreve o ZIP de todos os blocos, no cartão 7 e na seta, e a dica di-lo',
    (await fimKml.innerText()).trim() === 'Exportar KML da área (ZIP)' &&
      cabKmlNome === 'Exportar KML da área (ZIP)' &&
      (await fimKml.getAttribute('title')) === cabKmlDica &&
      /Todos os blocos \(KML, ZIP\)/.test(cabKmlDica) &&
      fimKmlName === kmlName &&
      cabKmlName === kmlName &&
      (await zipTexts(fimKmlFile)) === todosKml &&
      (await zipTexts(cabKmlFile)) === todosKml,
    `${(await fimKml.innerText()).trim()} → ${fimKmlName} | ${cabKmlNome} → ${cabKmlName}`,
  )
  const kmlZip = await JSZip.loadAsync(readFileSync(kmlFile))
  const kml = Object.keys(kmlZip.files)
  // o voo no nome: o que vem depois do tipo (…_area_3.kmz, …_poligono_3.kml)
  const voo = (n, tipo) => n.replace(new RegExp(`^.*_${tipo}_`), '').replace(/\.km[lz]$/, '')
  check(
    'sem bases: «…_kml.zip» ao lado de «…_voos.zip», com o mesmo prefixo',
    kmzName.endsWith('_voos.zip') && kmlName === kmzName.replace(/_voos\.zip$/, '_kml.zip'),
    `${kmzName} / ${kmlName}`,
  )
  check(
    'sem bases: um KML por voo, solto na raiz, pela ordem e com o número dos KMZ',
    kml.length >= 2 &&
      kml.length === kmz.length &&
      kml.every((n) => /^[\w-]+_poligono_\d+\.kml$/.test(n)) &&
      kml.map((n) => voo(n, 'poligono')).join() === kmz.map((n) => voo(n, 'area')).join(),
    `${kml.join(' ')} / ${kmz.join(' ')}`,
  )
  const texts = await Promise.all(kml.map((n) => kmlZip.file(n).async('string')))
  check(
    'sem bases: cada KML tem um só Polygon, sem buracos, com o nome do ficheiro',
    texts.every(
      (txt, i) =>
        (txt.match(/<Polygon>/g) || []).length === 1 &&
        !txt.includes('innerBoundaryIs') &&
        txt.includes(`<name>${kml[i].replace(/\.kml$/, '')}</name>`),
    ),
  )
  check('sem bases: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Projecto gravado antes das bases múltiplas e do mosaico novo: a base única
// abre como base A, o mosaico manual mantém a orientação guardada e as
// células desactivadas na grelha antiga passam para as células novas que
// ficam (pelo menos meio) dentro delas.
await scenario('projecto-antigo-mosaico-e-base', async () => {
  const { page, errors } = await openMission({})
  const file = join(OUT, 'projecto-antigo.json')
  writeFileSync(
    file,
    JSON.stringify({
      version: 2,
      missionName: 'antigo',
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      params: { altitude: 100, speed: 10, frontOverlap: 80, sideOverlap: 70, angle: 90 },
      split: { mode: 'tiles', tileSize: 500, tileOrientation: 0, reservePct: 30, maxSide: 500 },
      ring: rectRing.slice(0, -1),
      areaOrigin: 'draw',
      basePoint: toLL(100, 100),
      disabledTiles: [0, 1],
    }),
  )
  await page
    .locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
    .waitFor({ state: 'attached', timeout: 20000 })
  await projectFile(page).setInputFiles(file)
  await page.waitForTimeout(1500)
  const rows = await baseRows(page)
  check(
    'antigo: a base única abre como base A',
    rows.length === 1 && rows[0].label === 'A',
    rows.map((r) => r.label).join(','),
  )
  check(
    'antigo: o mosaico manual mantém a orientação guardada (não segue as faixas)',
    (await page.getByTestId('tile-orientation-auto').isChecked()) === false,
  )
  // as contagens das células estão na gaveta do cartão «Divisão em voos»
  await openDrawer(page, 'divisao')
  const m = /(\d+) células geradas, (\d+) activas/.exec(await bodyText(page))
  const total = Number(m?.[1])
  const active = Number(m?.[2])
  check(
    'antigo: as duas células desactivadas passam para o mosaico novo',
    m && total - active === 2,
    m ? `${active} activas de ${total}` : 'sem contagem',
  )
  check('antigo: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Ctrl+Z desfaz a última edição de qualquer tipo, pela ordem: o raio
// escrito numa base (um passo, tecla a tecla), a base arrastada, a
// atribuição manual de um bloco e a própria proposta de bases.
const basePin = (page, label) =>
  page.locator('.base-marker-multi').filter({ has: page.locator(`[data-base-label="${label}"]`) })
const savedBase = async (page, label) =>
  (await savedProject(page))?.bases?.find((b) => b.label === label) ?? null
const undo = async (page) => {
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(1200)
}
await scenario('bases-desfazer', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await proposeAndWait(page)
  const rows0 = await baseRows(page)
  const layout0 = rows0.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ')
  check('desfazer: a proposta dá pelo menos duas bases', rows0.length >= 2, layout0)

  // 1) atribuição manual: seleccionada a base B (o pino), o bloco de A passa para ela
  const A = rows0[0]
  const blk = A.blocks[0]
  await basePin(page, rows0[1].label).click()
  await page.locator(`.block-label [data-block-id="${blk}"]`).click()
  await page.waitForTimeout(1200)
  let rows = await baseRows(page)
  const owner = rows.find((r) => r.blocks.includes(blk))
  check(
    'desfazer: com a base B seleccionada, o clique no bloco passa-o para B',
    owner && owner.label === rows0[1].label,
    `bloco ${blk}: ${A.label} -> ${owner?.label}`,
  )
  // 2) a base A arrastada (sem base seleccionada: Esc)
  await page.keyboard.press('Escape')
  const ptA0 = (await savedBase(page, 'A'))?.point
  await dragMarker(page, basePin(page, 'A'), 90, 60)
  const ptA1 = (await savedBase(page, 'A'))?.point
  check('desfazer: a base A foi arrastada', ptA0 && ptA1 && ptA0.join() !== ptA1.join())
  // 3) o raio da base B escrito tecla a tecla
  const radius = page.locator(
    `[data-testid="base-row"][data-base-label="${rows0[1].label}"] [data-testid="base-radius"]`,
  )
  // no detalhe da base, que se abre na linha da tabela
  await revelar(page, radius)
  await radius.click()
  await page.keyboard.type('150')
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.waitForTimeout(1200)
  check(
    'desfazer: raio da base B em 150 m',
    (await savedBase(page, rows0[1].label))?.radiusM === 150,
  )

  // Ctrl+Z: o raio inteiro num passo; a base A fica onde foi arrastada
  await undo(page)
  const B1 = await savedBase(page, rows0[1].label)
  check(
    'desfazer: um Ctrl+Z repõe o raio escrito (as três teclas são um passo)',
    B1 && B1.radiusM == null && (await savedBase(page, 'A'))?.point.join() === ptA1.join(),
    `raio ${B1?.radiusM}`,
  )
  // Ctrl+Z: a base A volta onde estava
  await undo(page)
  check(
    'desfazer: o Ctrl+Z seguinte repõe a base arrastada',
    (await savedBase(page, 'A'))?.point.join() === ptA0.join(),
  )
  rows = await baseRows(page)
  check(
    'desfazer: … sem desfazer ainda a atribuição',
    rows.find((r) => r.blocks.includes(blk))?.label === owner?.label,
  )
  // Ctrl+Z: o bloco volta à base A
  await undo(page)
  rows = await baseRows(page)
  check(
    'desfazer: o Ctrl+Z seguinte repõe a atribuição manual',
    rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ') === layout0,
    rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' '),
  )
  // Ctrl+Z: a proposta inteira sai
  await undo(page)
  check('desfazer: e depois a proposta de bases', (await baseRows(page)).length === 0)
  check('desfazer: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// «Juntar blocos a esta base», à mão: o botão da base entra no modo de juntar
// sem mexer em nada; cada clique num bloco passa-o para a base, e só esse;
// «Terminar» sai, e o Ctrl+Z desfaz um clique de cada vez.
await scenario('juntar-a-esta-base', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await proposeAndWait(page)
  const rows0 = await baseRows(page)
  const layout0 = rows0.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ')
  check('juntar: a proposta dá pelo menos duas bases', rows0.length >= 2, layout0)
  const A = rows0[0]
  // «Juntar blocos a esta base» na linha de A: entra no modo de juntar à mão
  // (não mexe em nada sozinho)
  const rowA = page.locator(`[data-testid="base-row"][data-base-label="${A.label}"]`)
  // no detalhe da base, que se abre na linha da tabela
  await revelar(page, rowA.getByTestId('base-gather'))
  await rowA.getByTestId('base-gather').click()
  await page.waitForTimeout(400)
  check(
    'juntar: o botão entra no modo de juntar à mão e não mexe em nada sozinho',
    (await rowA.getByTestId('base-gather-on').count()) === 1 &&
      (await page.getByTestId('bases-click-hint').getAttribute('data-assign')) === 'on' &&
      (await baseRows(page)).map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ') === layout0,
  )
  // clicar em blocos de outras bases: o rótulo de um, a célula de outro
  const others = rows0.filter((r) => r.label !== A.label && r.blocks.length)
  const pick1 = others[0].blocks[0]
  const pick2 = (others[1] ?? others[0]).blocks.at(-1)
  await page.locator(`.block-label [data-block-id="${pick1}"]`).click()
  await page.waitForTimeout(600)
  if (pick2 !== pick1) {
    const cell = await page.locator(`path.block-cell-${pick2}`).boundingBox()
    await page.mouse.click(cell.x + cell.width * 0.25, cell.y + cell.height * 0.75)
    await page.waitForTimeout(600)
  }
  const rows = await baseRows(page)
  const mine = rows.find((r) => r.label === A.label)
  const moved = new Set([pick1, pick2])
  check(
    'juntar: os blocos clicados passam para a base, e só esses',
    [...moved].every((b) => mine.blocks.includes(b)) &&
      mine.blocks.length === A.blocks.length + moved.size &&
      rows0.every((r) =>
        r.blocks
          .filter((b) => !moved.has(b))
          .every((b) => rows.find((x) => x.label === r.label)?.blocks.includes(b)),
      ),
    rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' '),
  )
  // «Terminar» sai do modo
  await rowA.getByTestId('base-gather-done').click()
  await page.waitForTimeout(300)
  check(
    'juntar: «Terminar» sai do modo de juntar',
    (await page.getByTestId('bases-click-hint').getAttribute('data-assign')) === 'off' &&
      (await rowA.getByTestId('base-gather-on').count()) === 0,
  )
  // Ctrl+Z desfaz um bloco de cada vez
  for (let i = 0; i < moved.size; i++) await undo(page)
  const back = (await baseRows(page)).map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ')
  check('juntar: Ctrl+Z repõe os blocos, um passo por clique', back === layout0, back)
  // vista 3D com bases: cada voo na cor da sua base, sem erros
  await page.getByRole('button', { name: /Vista 3D|3D View/ }).click()
  await page.waitForSelector('canvas', { timeout: 15000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(OUT, 'juntar-3d.png') })
  check('juntar: a vista 3D com bases abre sem erros', errors.length === 0, errors.join(' | '))
  // a legenda nas cores da cena: a rota e os waypoints nas cores das bases
  // (as dos pinos do mapa, por baixo da vista)
  const l3d = page.getByTestId('map3d-legend')
  const abrir3d = l3d.getByTestId('map3d-legend-toggle')
  if ((await abrir3d.getAttribute('aria-expanded')) !== 'true') await abrir3d.click()
  const rgb = (cores) =>
    page.evaluate(
      (cs) =>
        cs.map((c) => {
          const e = document.createElement('i')
          e.style.color = c
          document.body.append(e)
          const v = getComputedStyle(e).color
          e.remove()
          return v
        }),
      cores,
    )
  const pinos = new Set(
    await rgb(
      await page.locator('.base-pin').evaluateAll((els) => els.map((e) => e.style.background)),
    ),
  )
  const rota3d = await rgb(await coresDoSimbolo(l3d.getByTestId('map3d-legend-route')))
  const pontos3d = await rgb(await coresDoSimbolo(l3d.getByTestId('map3d-legend-waypoints')))
  check(
    'juntar: na legenda 3D, a rota e os waypoints nas cores das bases',
    rota3d.length >= 1 &&
      [...rota3d, ...pontos3d].every((c) => pinos.has(c)) &&
      /Cor da base/.test(await l3d.getByTestId('map3d-legend-route').innerText()),
    `${rota3d} / ${pontos3d} · pinos ${[...pinos]}`,
  )
  await page.keyboard.press('Escape')
  check('juntar: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Passar um bloco a uma base: o pino selecciona a base, o clique no bloco
// (rótulo ou célula) passa-o para ela; um segundo clique não o dá a outra
// base; Esc desselecciona e o clique volta a activar/desactivar; «Marcar
// base» dentro de uma célula cria a base (antes desactivava a célula).
await scenario('atribuir-bloco-a-base', async () => {
  for (const split of ['Bateria', 'Faixas']) {
    const { page, errors } = await openMission({ area: fx.rect })
    await abrirNoPainel(page, 'missao')
    await page
      .locator('select')
      .filter({ has: page.locator('option[value="M300RTK"]') })
      .first()
      .selectOption('M300RTK')
    await configure(page, { tf: true, split })
    await proposeAndWait(page)
    const rows0 = await baseRows(page)
    const [A, B] = rows0
    const hint = page.getByTestId('bases-click-hint')
    check(
      `${split}: sem base seleccionada, o painel diz como passar blocos`,
      (await hint.getAttribute('data-assign')) === 'off' &&
        /Atribuir blocos a esta base/.test(await hint.innerText()),
    )
    await basePin(page, B.label).click()
    check(
      `${split}: o pino selecciona a base e o painel diz que os cliques vão para ela`,
      (await hint.getAttribute('data-assign')) === 'on' &&
        new RegExp(`Base ${B.label} seleccionada`).test(await hint.innerText()),
    )
    // o rótulo do bloco de A, mesmo debaixo de um pino
    const blk = A.blocks[0]
    await page.locator(`.block-label [data-block-id="${blk}"]`).click()
    await page.waitForTimeout(800)
    let owner = (await baseRows(page)).find((r) => r.blocks.includes(blk))
    check(
      `${split}: o clique no bloco de ${A.label} passa-o para ${B.label}`,
      owner?.label === B.label,
      `bloco ${blk} -> ${owner?.label}`,
    )
    // segundo clique: fica em B (não roda para a base seguinte)
    await page.locator(`.block-label [data-block-id="${blk}"]`).click()
    await page.waitForTimeout(800)
    owner = (await baseRows(page)).find((r) => r.blocks.includes(blk))
    check(
      `${split}: um segundo clique deixa o bloco em ${B.label}`,
      owner?.label === B.label,
      `bloco ${blk} -> ${owner?.label}`,
    )
    // a célula (fora do rótulo) também serve: um ponto dentro dela, longe
    // do centro (onde a proposta costuma pôr os pinos)
    // (um bloco de outra base que não B; nas faixas, o contorno do bloco)
    const blk2 = (await baseRows(page))
      .filter((r) => r.label !== B.label)
      .flatMap((r) => r.blocks)
      .find((x) => x !== blk)
    if (blk2 != null) {
      const cell = await page.locator(`path.block-cell-${blk2}`).boundingBox()
      await page.mouse.click(cell.x + cell.width * 0.25, cell.y + cell.height * 0.75)
      await page.waitForTimeout(800)
      owner = (await baseRows(page)).find((r) => r.blocks.includes(blk2))
      check(
        `${split}: clicar dentro da célula do bloco (fora do rótulo) também o passa`,
        owner?.label === B.label,
        `bloco ${blk2} -> ${owner?.label}`,
      )
    }
    // com uma gaveta aberta, o Esc fecha a gaveta e a base continua
    // seleccionada (as bacias de visão, sozinhas na gaveta das bases, foram
    // para a secção: a gaveta é a da área)
    await openDrawer(page, 'area')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    check(
      `${split}: com uma gaveta aberta, o Esc fecha a gaveta e a base fica seleccionada`,
      (await page.locator('[data-testid="drawer-area"]:visible').count()) === 0 &&
        (await hint.getAttribute('data-assign')) === 'on',
    )
    // Esc desselecciona
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    check(`${split}: Esc desselecciona a base`, (await hint.getAttribute('data-assign')) === 'off')
    if (split === 'Bateria') {
      // «Marcar base» com o clique dentro de uma célula: cria a base (o botão
      // da secção «Bases e segurança»; a gaveta da área abriu a dela)
      const n0 = (await baseRows(page)).length
      await abrirNoPainel(page, 'bases')
      await marcarBase(page).click()
      const lbl = await page.locator(`.block-label [data-block-id="${blk}"]`).boundingBox()
      await page.mouse.click(lbl.x + lbl.width / 2 + 30, lbl.y + lbl.height / 2 + 30)
      await page.waitForTimeout(800)
      check(
        'Bateria: «Marcar base» dentro de uma célula cria a base (não desactiva a célula)',
        (await baseRows(page)).length === n0 + 1,
        `${n0} -> ${(await baseRows(page)).length}`,
      )
      // ponto de inspecção dentro de uma célula: cria o ponto (antes
      // desactivava a célula)
      const blocks0 = (await baseRows(page)).reduce((n, r) => n + r.blocks.length, 0)
      const ip0 = (await savedProject(page))?.inspectPoints?.length ?? 0
      await openDrawer(page, 'extras')
      await marcarPontos(page).click()
      await closeDrawer(page)
      const cellI = await page.locator(`path.block-cell-${blk}`).boundingBox()
      await page.mouse.click(cellI.x + cellI.width * 0.7, cellI.y + cellI.height * 0.3)
      await page.waitForTimeout(1000)
      const ip1 = (await savedProject(page))?.inspectPoints?.length ?? 0
      const blocks1 = (await baseRows(page)).reduce((n, r) => n + r.blocks.length, 0)
      check(
        'Bateria: um ponto de inspecção dentro de uma célula cria o ponto (não desactiva a célula)',
        ip1 === ip0 + 1 && blocks1 === blocks0,
        `pontos ${ip0} -> ${ip1}; blocos ${blocks0} -> ${blocks1}`,
      )
      // «Marcar base» em cima da pega de mover a área (no centro dela)
      await openDrawer(page, 'extras')
      await marcarPontos(page).click()
      await closeDrawer(page)
      const nb0 = (await baseRows(page)).length
      await abrirNoPainel(page, 'bases')
      await marcarBase(page).click()
      await page.locator('.anchor-handle').first().click()
      await page.waitForTimeout(800)
      check(
        'Bateria: «Marcar base» com o clique na pega do centro da área cria a base',
        (await baseRows(page)).length === nb0 + 1,
        `${nb0} -> ${(await baseRows(page)).length}`,
      )
    }
    check(`${split}: sem erros de página`, errors.length === 0, errors.join(' | '))
    await page.close()
  }
  return {}
})

// Mosaico refeito pelo ângulo das faixas: as atribuições manuais passam para
// as células novas que ficam pelo menos meio dentro de uma antiga, e as que
// não passaram são ditas no painel das bases. Verificado contra o contorno
// dos blocos no KML de campo, antes e depois, com o turf.
const setAngle = (page, deg) =>
  page.evaluate((v) => {
    const el = [...document.querySelectorAll('input[type=range]')].find((i) => i.max === '360')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, deg)
/** Blocos do KML «Bases e blocos»: id, rótulo do voo e contorno. */
const kmlBlocks = (kml) =>
  [...kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)]
    .map((m) => m[1])
    .filter((p) => /<Polygon>/.test(p) && /bloco (\d+)/.test(p))
    .map((p) => {
      const coords = /<LinearRing><coordinates>([^<]*)<\/coordinates>/.exec(p)[1]
      const ring = coords
        .trim()
        .split(/\s+/)
        .map((c) => c.split(',').slice(0, 2).map(Number))
      return {
        id: Number(/bloco (\d+)/.exec(p)[1]),
        label: /<name>([^<]*)<\/name>/.exec(p)[1],
        poly: turf.polygon([ring]),
      }
    })
await scenario('mosaico-refeito-mantem-atribuicoes', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await proposeAndWait(page)
  // «Bases e blocos (KML)», no «Resumo e exportar»
  const kml = async (file) => {
    await abrirNoPainel(page, 'resumo')
    return readFileSync(
      (await download(page, page.getByTestId('export-bases-kml'), join(OUT, file)))[1],
      'utf8',
    )
  }
  const old = kmlBlocks(await kml('refeito-antes.kml'))
  const manual0 = (await savedProject(page))?.blockBase ?? {}
  check(
    'refeito: depois da proposta todos os blocos estão atribuídos à mão',
    old.length > 4 && old.every((b) => manual0[b.id]),
    `${old.length} blocos, ${Object.keys(manual0).length} atribuições`,
  )
  check(
    'refeito: sem aviso antes de refazer o mosaico',
    (await page.getByTestId('bases-carry-lost').count()) === 0,
  )

  await setAngle(page, 72)
  await page.waitForTimeout(2500)
  const neu = kmlBlocks(await kml('refeito-depois.kml'))
  const manual1 = (await savedProject(page))?.blockBase ?? {}
  check(
    'refeito: o ângulo novo refez o mosaico',
    neu.map((b) => b.poly.geometry.coordinates[0][0].join()).join() !==
      old.map((b) => b.poly.geometry.coordinates[0][0].join()).join(),
  )
  // o oráculo: a célula antiga que cobre mais de cada célula nova
  let carried = 0
  let wrong = []
  const heirs = new Set()
  for (const n of neu) {
    const A = turf.area(n.poly)
    let best = { f: 0, o: null }
    for (const o of old) {
      const x = turf.intersect(turf.featureCollection([n.poly, o.poly]))
      const f = x ? turf.area(x) / A : 0
      if (f > best.f) best = { f, o }
    }
    if (best.f >= 0.5) heirs.add(best.o.id)
    if (best.f >= 0.55) {
      if (manual1[n.id] === manual0[best.o.id]) carried += 1
      else wrong.push(`${n.id}<-${best.o.id}:${manual1[n.id]}/${manual0[best.o.id]}`)
    } else if (best.f <= 0.45 && manual1[n.id] !== undefined) wrong.push(`${n.id}:sem herança`)
  }
  check(
    'refeito: as células novas meio dentro de uma antiga ficam com a base escolhida',
    carried > 0 && wrong.length === 0,
    `${carried} herdadas; ${wrong.slice(0, 6).join(' ')}`,
  )
  const lostWanted = old.filter((o) => !heirs.has(o.id)).length
  // o aviso está no painel das bases
  await abrirNoPainel(page, 'bases')
  const info = page.getByTestId('bases-carry-lost')
  const lost = (await info.count()) ? Number(await info.getAttribute('data-lost')) : 0
  check(
    'refeito: o painel diz quantas atribuições não passaram',
    lostWanted > 0 &&
      lost === lostWanted &&
      /atribuições manuais não passaram para a nova divisão/.test(await info.innerText()),
    `${lost} no painel, ${lostWanted} esperadas`,
  )
  // os blocos sem herança voltam à base automática: todos com base
  const rows = await baseRows(page)
  check(
    'refeito: todos os blocos novos continuam com uma base',
    rows.flatMap((r) => r.blocks).length === neu.length,
  )
  check('refeito: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Bacias de visão: uma cumeada entre a base A (na planície a oeste) e o
// bloco de leste. O preflight diz que voo e que base, a camada do mapa
// pinta os quadrados tapados (só para lá da sombra da cumeada), a ficha de
// campo dá a percentagem visível e o relevo usado; com a base no alto da
// cumeada tudo se vê. O rádio: o bloco de oeste vê-se todo, mas na orla
// junto da sombra a cumeada entra na zona de Fresnel (60 % a 2,4 GHz) — à
// vista e com o sinal de rádio em risco. A vegetação somada a um MDT
// alarga a sombra; com o ficheiro marcado como MDS não se soma.
/**
 * Posição no ecrã de um ponto [lon, lat], calibrada com dois marcadores de
 * posição conhecida: em Web Mercator a escala é a mesma nos dois eixos, e
 * a algumas centenas de metros é linear.
 */
async function mapProjector(page, a, b) {
  const centre = async (loc) => {
    const box = await loc.boundingBox()
    return [box.x + box.width / 2, box.y + box.height / 2]
  }
  const merc = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI
  const [pa, pb] = [await centre(a.locator), await centre(b.locator)]
  const k = (pb[0] - pa[0]) / (b.lonlat[0] - a.lonlat[0])
  return ([lon, lat]) => [
    pa[0] + k * (lon - a.lonlat[0]),
    pa[1] - k * (merc(lat) - merc(a.lonlat[1])),
  ]
}
const VIEWSHED_LAYER_KEY = 'dji-mission-planner:viewshedLayer'
/** Vista por voo no painel das bases: { "A-1": 100, "A-2": 34 } (percentagem visível). */
const panelViews = async (page, attrName = 'data-view') => {
  const attr = await page
    .locator('[data-testid="base-row"][data-base-label="A"] [data-testid="base-view"]')
    .getAttribute(attrName, { timeout: 15000 })
  return Object.fromEntries(
    (attr ?? '').split(',').map((x) => {
      const [f, v] = x.split(':')
      return [f, Number(v)]
    }),
  )
}
await scenario('bacias-visao-cumeada', async () => {
  const { page, errors } = await openMission({ area: fx.hill, demFile: fx.demRidge })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { split: 'Quadrícula' })
  const nBlocks = await page.getByTestId('block-row').count()
  check('cumeada: dois blocos de 250 m', nBlocks === 2, `${nBlocks} blocos`)
  check(
    'cumeada: a camada «Bacias de visão» começa desligada',
    (await page.evaluate((k) => localStorage.getItem(k), VIEWSHED_LAYER_KEY)) !== '1' &&
      (await page.locator('.viewshed-hidden').count()) === 0,
  )

  // a base: um clique no mapa, e depois arrastada para a planície a oeste
  // da cumeada (mapa calibrado com a base e a pega do centro da área)
  await afastar(page)
  await abrirNoPainel(page, 'bases')
  await marcarBase(page).click()
  await clickMap(page, 785, 1125, HILL_M)
  await page.waitForTimeout(1200)
  const centreLL = toLL(1250, 1125)
  const project = async () =>
    mapProjector(
      page,
      { locator: basePin(page, 'A'), lonlat: (await savedBase(page, 'A')).point },
      { locator: page.locator('.anchor-handle'), lonlat: centreLL },
    )
  const moveBaseTo = async (x) => {
    // uma gaveta aberta fica por cima do mapa (e da base)
    await closeDrawer(page)
    const proj = await project()
    const box = await basePin(page, 'A').boundingBox()
    const [tx, ty] = proj(toLL(x, 1125))
    await dragMarker(
      page,
      basePin(page, 'A'),
      tx - box.x - box.width / 2,
      ty - box.y - box.height / 2,
    )
    return toM(...(await savedBase(page, 'A')).point)
  }
  const at = await moveBaseTo(RIDGE.baseX)
  check(
    'cumeada: base A na planície a oeste da cumeada',
    Math.abs(at[0] - RIDGE.baseX) < 15 && Math.abs(at[1] - 1125) < 15,
    `(${at[0].toFixed(0)}, ${at[1].toFixed(0)}) m`,
  )

  // painel: percentagem visível por voo, depois da pausa e do cálculo
  await page.waitForFunction(
    () => document.querySelector('[data-testid="base-view"]')?.dataset.view?.split(',').length >= 2,
    null,
    { timeout: 15000 },
  )
  const views = await panelViews(page)
  const flights = Object.keys(views)
  const hiddenFlights = flights.filter((f) => views[f] < 95)
  check(
    'cumeada: o painel dá a vista de cada voo; um bloco tapado em parte, o outro visível',
    flights.length === 2 && hiddenFlights.length === 1 && flights.some((f) => views[f] === 100),
    JSON.stringify(views),
  )
  const hf = hiddenFlights[0]
  const vf = flights.find((f) => views[f] === 100)
  const radio = await panelViews(page, 'data-radio')
  check(
    `cumeada: o voo ${vf} vê-se todo mas tem parte com o rádio em risco (zona de Fresnel)`,
    views[vf] === 100 && radio[vf] >= 5,
    `rádio em risco à vista: ${JSON.stringify(radio)}`,
  )
  // a lista das bases na secção, com a vista de cada voo no detalhe da base
  // A (abre-se na linha), e as bacias de visão (relevo usado) na mesma secção
  await revelar(
    page,
    page.locator('[data-testid="base-row"][data-base-label="A"] [data-testid="base-view"]'),
  )
  await revelar(page, page.getByTestId('viewshed-terrain'))
  const panelText = `${await page.getByTestId('bases-panel').innerText()}\n${await page
    .getByTestId('viewshed-box')
    .innerText()}`
  check(
    'cumeada: o painel diz a distância a que fica tapado e o relevo usado (com a ressalva do MDT)',
    new RegExp(`${hf} \\d+ % \\(tapado a ~\\d+ m do piloto\\)`).test(panelText) &&
      /Relevo: MDT importado «cumeada\.tif»/.test(panelText) &&
      /MDS/.test(panelText),
    panelText.replace(/\s+/g, ' ').slice(0, 400),
  )

  // preflight: aviso com o voo e a base. Um voo com o aviso tem a frase; com
  // mais voos do mesmo código, a lista junta-os numa tabela, uma linha por
  // voo: voo, base, percentagem e distância (src/mission/preflightGroups.js)
  await page.getByTestId('preflight-pill').click()
  let lista = await page.getByTestId('preflight-list').innerText()
  /** Os avisos `codes` do voo: a frase dele, ou «célula | célula» da sua linha na tabela. */
  const avisosDoVoo = (voo, codes) =>
    page.getByTestId('preflight-list').evaluate(
      (el, [v, cs]) =>
        [...el.querySelectorAll('li[data-level="warn"]')]
          .filter((li) => cs.includes(li.dataset.code))
          .flatMap((li) => {
            if (!li.dataset.group) return li.innerText.includes(`Voo ${v}:`) ? [li.innerText] : []
            const tr = [...li.querySelectorAll('tbody tr')].find(
              (r) => r.cells[0]?.innerText.trim() === v,
            )
            return tr ? [[...tr.cells].map((td) => td.innerText.trim()).join(' | ')] : []
          }),
      [voo, codes],
    )
  // a distância («tapado a ~250 m», ou «~250 m» na tabela), com a base A
  const aviso = (texto, frase) => {
    const m = /~(\d+) m/.exec(texto ?? '')
    return texto && (frase.test(texto) || /\bBase A\b/.test(texto)) && m ? Number(m[1]) : null
  }
  const hidden = await avisosDoVoo(hf, ['block-viewshed'])
  const warn = aviso(hidden[0], /fica atrás do relevo visto da base A/)
  // a cumeada está a 250 m da base: o raio tapado (mediana) passa-a. A
  // distância conta dos olhos, no melhor ponto da zona: se recuaram, a
  // cumeada fica mais longe deles, no máximo o recuo
  const eyeShift = (await panelViews(page, 'data-eye'))[hf] ?? 0
  check(
    `cumeada: o preflight avisa «Voo ${hf}: N % do bloco fica atrás do relevo visto da base A»`,
    hidden.length === 1 && warn >= 200 && warn <= 300 + eyeShift,
    hidden.join(' || ').slice(0, 300),
  )
  check(
    'cumeada: é um aviso (não bloqueia)',
    (await page
      .getByTestId('preflight-list')
      .locator('li[data-level="warn"]', { hasText: 'atrás do relevo' })
      .count()) === 1,
  )
  // o voo à vista: só o aviso do rádio (nem atrás do relevo, nem outro)
  const doVf = await avisosDoVoo(vf, ['block-viewshed', 'block-radio', 'battery-block'])
  const radioWarn = aviso(
    (await avisosDoVoo(vf, ['block-radio']))[0],
    /sinal de rádio em risco visto da base A: à vista, mas o relevo entra na zona de Fresnel \(60 % a 2,4 GHz\)/,
  )
  check(
    `cumeada: o preflight avisa «Voo ${vf}: … sinal de rádio em risco» (à vista, causa rádio)`,
    radioWarn >= 200 &&
      radioWarn <= 300 &&
      (await avisosDoVoo(vf, ['block-viewshed'])).length === 0 &&
      doVf.length === 1,
    `${doVf.join(' || ')} | ${lista
      .split('\n')
      .filter((l) => /rádio/.test(l))
      .join(' | ')}`.slice(0, 300),
  )
  await page.getByTestId('preflight-pill').click()

  // camada do mapa: ligada no painel, pinta os quadrados tapados e a
  // percentagem de cada bloco, e fica lembrada neste aparelho
  await revelar(page, page.getByTestId('viewshed-toggle'))
  await page.getByTestId('viewshed-toggle').check()
  await page.waitForTimeout(500)
  const squares = await page.locator('.viewshed-hidden').count()
  const labels = await page.locator('.viewshed-label span').allInnerTexts()
  check(
    'cumeada: a camada pinta os quadrados tapados e a percentagem de cada bloco',
    squares > 0 &&
      labels.length === nBlocks &&
      labels.every((l) => /^\d+ %( · rádio −\d+ %)?$/.test(l)),
    `${squares} faixas; ${labels.join(' / ')}`,
  )
  const proj = await project()
  const shadowX = proj(toLL(1150, 1125))[0]
  const boxes = await page
    .locator('.viewshed-hidden')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left))
  check(
    'cumeada: os quadrados tapados ficam só na sombra da cumeada (a mais de ~500 m da base)',
    boxes.every((x) => x > shadowX),
    `mais a oeste ${Math.min(...boxes).toFixed(0)} px, limite ${shadowX.toFixed(0)} px`,
  )
  // rádio em risco à vista: faixas mais claras, na orla da sombra (a
  // oeste dela, até um quadrado de 25 m)
  const radioBoxes = await page
    .locator('.viewshed-radio')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))
  const pxPerM = Math.abs(proj(toLL(1250, 1125))[0] - proj(toLL(1150, 1125))[0]) / 100
  check(
    'cumeada: a camada pinta à parte o rádio em risco, junto da sombra da cumeada',
    radioBoxes.length > 0 &&
      Math.max(...radioBoxes) <= Math.min(...boxes) + 25 * pxPerM + 2 &&
      Math.min(...radioBoxes) > shadowX,
    `${radioBoxes.length} faixas de rádio; até ${Math.max(...radioBoxes).toFixed(0)} px, sombra desde ${Math.min(...boxes).toFixed(0)} px`,
  )
  check(
    'cumeada: a camada fica ligada neste aparelho, também no controlo de camadas',
    (await page.evaluate((k) => localStorage.getItem(k), VIEWSHED_LAYER_KEY)) === '1' &&
      (await page
        .locator('.leaflet-control-layers-overlays label', { hasText: 'Bacias de visão' })
        .locator('input')
        .isChecked()),
  )

  // vegetação e obstáculos (por missão): 10 m somados ao MDT alargam a
  // sombra ao bloco de oeste; marcado o ficheiro como MDS, não se somam
  await revelar(page, page.getByTestId('viewshed-obstacle'))
  await page.getByTestId('viewshed-obstacle').fill('10')
  await page.waitForFunction(
    (f) =>
      document
        .querySelector('[data-testid="base-view"]')
        ?.dataset.view?.split(',')
        .some((x) => x.startsWith(`${f}:`) && Number(x.split(':')[1]) < 100),
    vf,
    { timeout: 15000 },
  )
  const veg = await panelViews(page)
  const vegText = await page.getByTestId('viewshed-terrain').innerText()
  check(
    `cumeada: com 10 m de vegetação o voo ${vf} fica em parte atrás do relevo, e o painel di-lo`,
    veg[vf] < 100 &&
      veg[hf] <= views[hf] &&
      /MDT importado «cumeada\.tif» \(\d+\.\d m\) \+ 10 m de vegetação e obstáculos/.test(vegText),
    `${JSON.stringify(veg)}; ${vegText.slice(0, 160)}`,
  )
  await page.waitForTimeout(800)
  check(
    'cumeada: a vegetação fica no projecto (por missão)',
    (await savedProject(page))?.obstacleHeightM === 10,
  )
  // MDT ou MDS na secção «Área e relevo»; o relevo usado lê-se de novo nas bases
  await abrirNoPainel(page, 'area')
  await page.getByTestId('dem-surface-dsm').click()
  await page.waitForFunction(
    (f) =>
      document
        .querySelector('[data-testid="base-view"]')
        ?.dataset.view?.split(',')
        .includes(`${f}:100`),
    vf,
    { timeout: 15000 },
  )
  await revelar(page, page.getByTestId('viewshed-terrain'))
  const dsmText = await page.getByTestId('viewshed-terrain').innerText()
  check(
    'cumeada: marcado como MDS, a vegetação não se soma (o campo fica desligado) e o painel diz MDS',
    (await page.getByTestId('viewshed-obstacle').isDisabled()) &&
      /MDS importado «cumeada\.tif»/.test(dsmText) &&
      !/vegetação e obstáculos/.test(dsmText.split('.')[0]),
    dsmText.slice(0, 200),
  )
  await abrirNoPainel(page, 'area')
  await page.getByTestId('dem-surface-dtm').click()
  await revelar(page, page.getByTestId('viewshed-obstacle'))
  await page.getByTestId('viewshed-obstacle').fill('0')
  await page.waitForFunction(
    (f) =>
      document
        .querySelector('[data-testid="base-view"]')
        ?.dataset.view?.split(',')
        .includes(`${f}:100`),
    vf,
    { timeout: 15000 },
  )

  // a base no alto da cumeada: tudo à vista
  const top = await moveBaseTo(RIDGE.x)
  check(
    'cumeada: base A no alto da cumeada',
    Math.abs(top[0] - RIDGE.x) < 8,
    `x = ${top[0].toFixed(1)} m`,
  )
  await page.waitForFunction(
    () => {
      const v = document.querySelector('[data-testid="base-view"]')?.dataset.view ?? ''
      return v.split(',').length >= 2 && v.split(',').every((x) => x.endsWith(':100'))
    },
    null,
    { timeout: 15000 },
  )
  await page.getByTestId('preflight-pill').click()
  lista = await page.getByTestId('preflight-list').innerText()
  check(
    'cumeada: do alto da cumeada os avisos desaparecem (relevo e rádio)',
    !/atrás do relevo/.test(lista) && !/rádio em risco/.test(lista),
    lista
      .split('\n')
      .filter((l) => /relevo visto/.test(l))
      .join(' | '),
  )
  await page.getByTestId('preflight-pill').click()
  check(
    'cumeada: … e a camada fica sem quadrados tapados, com 100 % em cada bloco',
    (await page.locator('.viewshed-hidden').count()) === 0 &&
      (await page.locator('.viewshed-radio').count()) === 0 &&
      (await page.locator('.viewshed-label span').allInnerTexts()).every((l) => l === '100 %'),
  )
  // Ctrl+Z: a base volta à planície, e a bacia já calculada volta logo
  await undo(page)
  check(
    'cumeada: Ctrl+Z repõe a base na planície e o bloco tapado',
    Math.abs(toM(...(await savedBase(page, 'A')).point)[0] - RIDGE.baseX) < 15 &&
      (await panelViews(page))[hf] === views[hf],
    JSON.stringify(await panelViews(page)),
  )

  // ficha de campo da base A (a folha A4, aberta no cartão): percentagem por
  // voo e o relevo usado
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  await page.getByTestId('checklist-bases').getByTestId('base-sheet-card').first().click()
  const sheet = page.getByTestId('sheet-view').getByTestId('base-sheet')
  await sheet.waitFor({ timeout: 10000 })
  const sheetText = await sheet.innerText()
  const cellText = await sheet
    .locator(`[data-testid="base-sheet-view"][data-flight="${hf}"]`)
    .innerText()
  check(
    `cumeada: a ficha da base A dá «N % visível — olhos a … — tapado a ~X m do operador» no voo ${hf}`,
    new RegExp(
      `^${views[hf]} % visível( — olhos a \\d+ m [NSEO]{1,2} da base \\(-?\\d+\\.\\d{5}, -?\\d+\\.\\d{5}\\))? — tapado a ~\\d+ m do piloto( — rádio em risco em \\d+ % \\(Fresnel a ~\\d+ m\\))?$`,
    ).test(cellText.trim()),
    cellText,
  )
  const vfCell = await sheet
    .locator(`[data-testid="base-sheet-view"][data-flight="${vf}"]`)
    .innerText()
  check(
    `cumeada: e no voo ${vf} «100 % visível — rádio em risco em N % (Fresnel a ~X m)»`,
    /^100 % visível( — olhos a \d+ m [NSEO]{1,2} da base \(-?\d+\.\d{5}, -?\d+\.\d{5}\))? — rádio em risco em \d+ % \(Fresnel a ~\d+ m\)$/.test(
      vfCell.trim(),
    ),
    vfCell,
  )
  // o rodapé da folha: a vista da base com o relevo das bacias de visão
  check(
    'cumeada: a ficha diz o relevo usado e a ressalva do MDT',
    /Vista da base: MDT importado «cumeada\.tif»/.test(sheetText) &&
      /árvores, edifícios nem escombreiras/.test(sheetText),
    sheetText.replace(/\s+/g, ' ').slice(-400),
  )

  // MDT/MDS no projecto: o ficheiro não vai no projecto, mas o nome e a
  // escolha sim; ao reabrir, o painel lembra qual reimportar, e o mesmo
  // ficheiro volta com a escolha gravada
  const demInput = page.locator('input[accept=".tif,.tiff"]').first()
  const reopenAndReimport = async () => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    // o lembrete e a escolha MDT/MDS estão na secção «Área e relevo»
    await abrirNoPainel(page, 'area')
    const note = page.getByTestId('dem-remembered')
    await note.waitFor({ timeout: 20000 })
    const noteText = await note.innerText()
    await demInput.setInputFiles(fx.demRidge)
    await page.getByTestId('dem-surface-dsm').waitFor({ timeout: 20000 })
    return {
      noteText,
      dsm: (await page.getByTestId('dem-surface-dsm').getAttribute('aria-pressed')) === 'true',
    }
  }
  await page.waitForTimeout(800) // autosave com debounce
  check(
    'cumeada: o projecto grava o nome do MDT e a escolha MDT',
    JSON.stringify((await savedProject(page))?.demFile) ===
      JSON.stringify({ label: 'cumeada.tif', surface: 'dtm' }),
    JSON.stringify((await savedProject(page))?.demFile),
  )
  let back = await reopenAndReimport()
  check(
    'cumeada: reaberto, o painel lembra o MDT a reimportar, e volta como MDT',
    /MDT «cumeada\.tif»/.test(back.noteText) && !back.dsm,
    back.noteText,
  )
  await page.getByTestId('dem-surface-dsm').click()
  // a gravação automática espera 500 ms depois da última mudança, e num
  // runner ocupado chegava depois dos 800 ms fixos de antes
  await page
    .waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('dji-mission-planner:project:v1') ?? 'null')?.demFile
          ?.surface === 'dsm',
      null,
      { timeout: 10000 },
    )
    .catch(() => {})
  check(
    'cumeada: marcado como MDS, o projecto grava-o',
    (await savedProject(page))?.demFile?.surface === 'dsm',
  )
  back = await reopenAndReimport()
  check(
    'cumeada: reaberto, o painel lembra o MDS, e o mesmo ficheiro volta como MDS',
    /MDS «cumeada\.tif»/.test(back.noteText) && back.dsm,
    back.noteText,
  )
  check(
    'cumeada: com o ficheiro reimportado o lembrete desaparece',
    (await page.getByTestId('dem-remembered').count()) === 0,
  )

  check('cumeada: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// «Propor bases» com relevo: um sítio plano ou alto com o rádio livre, nunca
// um baixo — a prática da equipa (Mata de Vilar, Lousada: sinal perdido com
// o drone atrás de um monte com árvores). Relevo MESAS: o alto de oeste é o
// mais alto e vê os dois blocos dentro do VLOS, mas a cumeada entre ele e a
// área corta o rádio; o de leste, mais baixo e plano, tem o rádio livre.
// Uma base do operador no alto de oeste nunca é mexida (a proposta diz que
// todos os blocos têm base; o preflight avisa do rádio). Sem ela, a proposta
// vai para o alto de leste, com e sem seguir terreno, e o preflight não tem
// aviso de rádio nem de relevo para essa disposição.
await scenario('propor-bases-sitio-alto', async () => {
  const { page, errors } = await openMission({ area: fx.hill, demFile: fx.demMesas })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { split: 'Quadrícula' })
  check('alto: dois blocos de 250 m', (await page.getByTestId('block-row').count()) === 2)
  const preflightText = async () => {
    await page.getByTestId('preflight-pill').click()
    const text = await page.getByTestId('preflight-list').innerText()
    await page.getByTestId('preflight-pill').click()
    return text
  }
  const viewsReady = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[data-testid="base-view"]')?.dataset.view?.split(',').length >= 2,
      null,
      { timeout: 20000 },
    )

  // 1) a base do operador no alto de oeste: arrastada para lá com o mapa
  // calibrado pela base e pela pega do centro da área
  await afastar(page)
  await abrirNoPainel(page, 'bases')
  await marcarBase(page).click()
  await clickMap(page, 785, 1125, HILL_M)
  await page.waitForTimeout(1200)
  const proj = await mapProjector(
    page,
    { locator: basePin(page, 'A'), lonlat: (await savedBase(page, 'A')).point },
    { locator: page.locator('.anchor-handle'), lonlat: toLL(1250, 1125) },
  )
  const box = await basePin(page, 'A').boundingBox()
  const [tx, ty] = proj(toLL(MESAS.west.x + 40, MESAS.west.y))
  await dragMarker(
    page,
    basePin(page, 'A'),
    tx - box.x - box.width / 2,
    ty - box.y - box.height / 2,
  )
  const mine = (await savedBase(page, 'A')).point
  const [mx, my] = toM(...mine)
  check(
    'alto: base A do operador no alto de oeste (o sítio mais alto)',
    Math.hypot(mx - MESAS.west.x, my - MESAS.west.y) < 70,
    `(${mx.toFixed(0)}, ${my.toFixed(0)}) m`,
  )
  await proposeAndWait(page)
  let rows = await baseRows(page)
  const said = await page.getByTestId('bases-proposal').innerText()
  check(
    'alto: a proposta nunca mexe na base do operador (todos os blocos já têm base)',
    rows.length === 1 &&
      rows[0].label === 'A' &&
      rows[0].blocks.length === 2 &&
      (await savedBase(page, 'A')).point.join() === mine.join() &&
      /já têm uma base/.test(said),
    `${rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ')}; ${said}`,
  )
  await viewsReady()
  let lista = await preflightText()
  check(
    'alto: com a base A no alto de oeste o preflight avisa que a cumeada corta o rádio',
    /visto da base A/.test(lista) && /rádio em risco|atrás do relevo/.test(lista),
    lista
      .split('\n')
      .filter((l) => /visto da base/.test(l))
      .join(' | ')
      .slice(0, 300),
  )

  // 2) sem a base do operador: a proposta vai para o alto plano de leste
  await page.getByRole('button', { name: /Retirar a base A|Remove base A/ }).click()
  await page.waitForTimeout(800)
  check('alto: base A retirada', (await baseRows(page)).length === 0)
  // a proposta corre em fatias: «A propor bases… 0 %» e «Cancelar». O React
  // desenha o clique numa microtarefa e a primeira fatia vem num setTimeout:
  // entre as duas, cancelar não deixa mudar nada
  const started = await page.evaluate(async () => {
    const btn = document.querySelector('[data-testid="propose-bases"]')
    btn.click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    const running = { state: btn.dataset.state, text: btn.textContent, disabled: btn.disabled }
    document.querySelector('[data-testid="propose-cancel"]').click()
    return running
  })
  await page.waitForTimeout(1500)
  check(
    'alto: «A propor bases… 0 %» com o botão desactivado enquanto corre',
    started.state === 'running' && /A propor bases… 0 %/.test(started.text) && started.disabled,
    JSON.stringify(started),
  )
  check(
    'alto: «Cancelar» pára a proposta e as bases ficam como estavam',
    (await baseRows(page)).length === 0 &&
      (await page.getByTestId('propose-bases').getAttribute('data-state')) === 'idle' &&
      (await page.getByTestId('propose-cancel').count()) === 0 &&
      /Proposta cancelada/.test(await page.getByTestId('bases-proposal').innerText()),
  )
  for (const tf of [false, true]) {
    const tag = tf ? 'com seguir terreno' : 'sem seguir terreno'
    if (tf) {
      await abrirNoPainel(page, 'voo')
      await label(page, TF).check()
      await page.waitForTimeout(1200)
    }
    await proposeAndWait(page)
    await zonesReady(page)
    rows = await baseRows(page)
    const at = toM(...(await savedBase(page, 'A')).point)
    check(
      `alto: ${tag}, uma base no alto plano de leste — nem na planície, nem no alto de oeste atrás da cumeada`,
      rows.length === 1 &&
        rows[0].blocks.length === 2 &&
        rows[0].ref >= MESAS.east.top - 10.5 &&
        rows[0].ref <= MESAS.east.top + 0.5 &&
        Math.hypot(at[0] - MESAS.east.x, at[1] - MESAS.east.y) <= 100,
      `${rows.map((r) => `${r.label}:${r.ref}`).join(' ')} em (${at[0].toFixed(0)}, ${at[1].toFixed(0)}) m`,
    )
    check(
      `alto: ${tag}, a proposta não diz que ficou sem sítio com rádio`,
      (await page.getByTestId('bases-proposal-radio').count()) === 0,
    )
    await viewsReady()
    const views = await panelViews(page)
    const radio = await panelViews(page, 'data-radio')
    check(
      `alto: ${tag}, os dois voos todos à vista e sem rádio em risco no painel`,
      Object.keys(views).length === 2 &&
        Object.values(views).every((v) => v === 100) &&
        Object.values(radio).every((v) => v === 0),
      `${JSON.stringify(views)} ${JSON.stringify(radio)}`,
    )
    lista = await preflightText()
    check(
      `alto: ${tag}, o preflight não tem aviso de rádio nem de relevo para a disposição proposta`,
      !/rádio em risco/.test(lista) && !/atrás do relevo/.test(lista),
      lista
        .split('\n')
        .filter((l) => /visto da base/.test(l))
        .join(' | ')
        .slice(0, 300),
    )
    if (!tf) {
      await undo(page)
      check('alto: Ctrl+Z retira a proposta', (await baseRows(page)).length === 0)
    }
  }
  check('alto: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- secções e gavetas do painel da área ------------------------------- */
// O painel da área é uma coluna de secções numeradas pela ordem do trabalho,
// uma aberta de cada vez (fechadas, o resumo numa linha); o resto dos
// controlos de cada secção está na sua gaveta («Mais opções ›»), ao lado do
// painel e por cima do mapa, uma de cada vez, em grupos que também fecham.
async function openDrawer(page, card) {
  const more = page.getByTestId(`card-more-${card}`)
  if ((await more.count()) === 0) return false
  // o botão está na secção: aberta, se estiver fechada
  if (!(await more.isVisible())) await revelar(page, more)
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
  const gaveta = page.getByTestId(`drawer-${card}`)
  await gaveta.waitFor({ state: 'visible', timeout: 5000 })
  // os grupos da gaveta todos abertos, também os que fecham por omissão (um
  // a um: abrir um tira-o da lista dos fechados)
  const fechado = gaveta.locator('h3 > button[aria-expanded="false"]')
  for (let i = 0; i < 12 && (await fechado.count()) > 0; i += 1) await fechado.first().click()
  return true
}
/**
 * Põe à vista o controlo `loc`: abre, de fora para dentro, o que o esconde —
 * a secção, a gaveta (pelo seu «Mais opções ›»), um grupo da gaveta, o
 * detalhe de uma base —, carregando no botão que o controla (aria-controls).
 * Devolve se ficou à vista.
 */
async function revelar(page, loc) {
  const el = loc.first()
  for (let i = 0; i < 6; i += 1) {
    if (await el.isVisible().catch(() => false)) return true
    const id = await el
      .evaluate((e) => {
        let fora = null
        for (let x = e; x; x = x.parentElement) if (x.hidden && x.id) fora = x.id
        return fora
      })
      .catch(() => null)
    if (!id) return false
    const botao = page.locator(`[aria-controls="${id}"]`).first()
    if (!(await botao.isVisible()) && !(await revelar(page, botao))) return false
    await botao.click()
  }
  return el.isVisible()
}
async function closeDrawer(page) {
  const open = page.locator('[data-testid^="drawer-"]:visible')
  if ((await open.count()) > 0) await open.getByRole('button', { name: /^(Fechar|Close)/ }).click()
}
/**
 * O controlo `loc` do cartão `card`, à vista: na secção (aberta, se estiver
 * fechada), ou depois de abrir a gaveta dela (e o grupo da gaveta, ou o
 * detalhe da base). Devolve onde estava ('cartão' | 'gaveta') e o locator,
 * ou null quando não se alcança. Sem cartões (painel antigo) procura na
 * página. Com `card` 'mapa', na barra de desenho sobre o mapa ('mapa').
 */
async function reach(page, card, loc) {
  if (card === 'mapa') {
    const el = loc(page.getByTestId('map-draw-tools'), page).first()
    return { where: (await el.isVisible().catch(() => false)) ? 'mapa' : null, el }
  }
  const scope = page.locator(`[data-testid="card-${card}"], [data-testid="drawer-${card}"]`)
  const root = (await scope.count()) > 0 ? scope : page
  const el = loc(root, page).first()
  // no cartão ou numa gaveta já aberta (a do mesmo cartão: `root`)
  const where = () =>
    el.evaluate((e) => (e.closest('[data-testid^="drawer-"]') ? 'gaveta' : 'cartão'))
  if (await el.isVisible().catch(() => false)) return { where: await where(), el }
  if (await revelar(page, el)) return { where: await where(), el }
  return { where: null, el }
}

// escondidos também (includeHidden): numa secção fechada ou numa gaveta, o
// controlo existe e revelar() abre o que o esconde
const inv = {
  btn: (re) => (r) => r.getByRole('button', { name: re, includeHidden: true }),
  exact: (name) => (r) => r.getByRole('button', { name, exact: true, includeHidden: true }),
  field: (re) => (r) => r.locator('label', { hasText: re }).locator('input, select'),
  group: (re) => (r) => r.getByRole('group', { name: re, includeHidden: true }),
  id: (id) => (r) => r.getByTestId(id),
}

/*
 * Inventário: todos os controlos do painel da área antes dos cartões (Missão,
 * Drone / Sensor, Parâmetros de voo, Orientação das linhas, Expansão, Área de
 * levantamento, Bases, Divisão em blocos, Terreno, GCPs, Pontos de inspecção),
 * levantado do painel antigo antes da mudança (e verificado contra ele), com
 * o cartão onde ficaram: a exportação por voo e por base passou do painel
 * das bases para o cartão «Resumo e exportar», e as formas da área
 * (polígono, rectângulo, quadrado) do cartão «Área e relevo» para a barra de
 * desenho sobre o mapa ('mapa'), que tem também «Marcar base» e «Marcar
 * pontos de inspecção» (os dos cartões 5 e 6). Agrupados pelo estado que os
 * mostra. Os cartões são secções que fecham, uma aberta de cada vez: o
 * inventário parte delas como abrem e reach() abre a secção (fechando a
 * outra), a gaveta, o grupo da gaveta ou o detalhe da base de cada
 * controlo. «Seleccionar a base A» (o rótulo da base) e «Atribuir blocos a
 * esta base» eram a mesma acção com dois nomes: fica o segundo, no detalhe
 * da base; «Disparo por», «Paragem nos waypoints» e o tipo do sensor
 * próprio passaram de listas e botões de rádio a controlos segmentados
 * (grupos de botões).
 */
const INVENTARIO_INICIO = [
  ['missao', 'nome da missão', (r) => r.getByPlaceholder(/nome-da-missao/)],
  ['missao', 'Guardar projecto', inv.btn(/Guardar projecto/)],
  ['missao', 'Abrir projecto', inv.btn(/Abrir projecto/)],
  [
    'missao',
    'aeronave',
    (r, page) => r.locator('select').filter({ has: page.locator('option[value="M300RTK"]') }),
  ],
  ['missao', 'RTK', inv.field(/Posicionamento RTK/)],
  ['missao', 'preset de missão', inv.field(/Tipo de levantamento/)],
  ['voo', 'altitude', inv.field(/^Altura acima da descolagem|^Altura AGL|^Altitude/)],
  ['voo', 'GSD alvo', inv.field(/GSD alvo/)],
  ['voo', 'velocidade', inv.field(/^Velocidade/)],
  ['voo', 'sobreposição frontal', inv.field(/Sobreposição frontal/)],
  ['voo', 'sobreposição lateral', inv.field(/Sobreposição lateral/)],
  ['voo', 'espaçamento manual', inv.field(/Espaçamento manual/)],
  ['voo', 'disparo por', inv.group(/Disparo por/)],
  ['voo', 'intervalo de disparo manual', inv.id('interval-manual')],
  ['voo', 'rumo da aeronave', inv.id('heading-mode')],
  ['voo', 'inclinação do gimbal', inv.field(/Inclinação do gimbal/)],
  ['voo', 'overshoot', inv.field(/Prolongamento por faixa/)],
  ['voo', 'direcção das linhas (cursor)', (r) => r.locator('input[type=range][max="360"]')],
  ['voo', 'direcção das linhas (graus)', (r) => r.locator('input[type=number][max="360"]')],
  ['voo', '∥ Paralelas', inv.btn(/Paralelas/)],
  ['voo', '⊥ Perpendic.', inv.btn(/Perpendic/)],
  ['voo', '∠ Oblíquas 45°', inv.btn(/Oblíquas 45/)],
  ['voo', 'Óptima', inv.exact('Óptima')],
  ['voo', 'dupla grelha (crosshatch)', inv.field(/crosshatch/)],
  ['voo', 'fiada de amarração', inv.field(/Faixa transversal de amarração/)],
  ['voo', 'expansão 0 %', inv.exact('0%')],
  ['voo', 'expansão 10 %', inv.exact('10%')],
  ['voo', 'expansão 20 %', inv.exact('20%')],
  ['voo', 'expansão 30 %', inv.exact('30%')],
  ['voo', 'seguir terreno', inv.field(/Seguir terreno/)],
  ['mapa', 'Polígono', inv.btn(/Polígono/)],
  ['mapa', 'Rectângulo', inv.btn(/Rectângulo/)],
  ['mapa', 'Quadrado', inv.btn(/^Quadrado/)],
  // a mesma acção do cartão 5 e da gaveta do 6, com o mesmo nome («Base» e
  // «Inspecção» são os rótulos curtos)
  ['mapa', 'Marcar base (Base)', inv.btn(/^Marcar base$/)],
  ['mapa', 'Marcar pontos de inspecção (Inspecção)', inv.btn(/^Marcar pontos de inspecção$/)],
  ['area', 'Importar área', inv.btn(/Importar área/)],
  ['area', 'Descarregar relevo global', inv.btn(DOWNLOAD_GLOBAL)],
  ['area', 'Importar MDT', inv.btn(/Importar MDT/)],
  ['area', 'Perfil de elevação', inv.btn(/Perfil de elevação/)],
  ['divisao', 'divisão: Nenhuma', inv.exact('Nenhuma')],
  ['divisao', 'divisão: Faixas', inv.exact('Faixas')],
  ['divisao', 'divisão: Bateria', inv.exact('Bateria')],
  ['divisao', 'divisão: Mosaico', inv.exact('Quadrícula')],
  ['bases', 'Marcar base', inv.btn(/Marcar base/)],
  ['bases', 'Remover base', inv.btn(/Remover base/)],
  ['extras', 'planear GCPs', inv.field(/Planear posições de GCPs/)],
  ['extras', 'marcar pontos de inspecção', inv.btn(/Marcar pontos de inspecção/)],
]
const INVENTARIO_DRONE = [
  [
    'missao',
    'payload / sensor',
    (r, page) => r.locator('select').filter({ has: page.locator('option[value="P1"]') }),
  ],
  ['missao', 'FOV de trabalho (LiDAR)', inv.field(/FOV de trabalho/)],
  ['missao', 'FOV nominal', inv.exact('Nominal')],
]
const INVENTARIO_CUSTOM = [
  ['missao', 'sensor próprio: câmara', inv.exact('Câmara')],
  ['missao', 'sensor próprio: LiDAR', inv.btn(/LiDAR \(FOV\)/)],
  ['missao', 'largura do sensor', inv.field(/Largura sensor/)],
  ['missao', 'altura do sensor', inv.field(/Altura sensor/)],
  ['missao', 'distância focal', inv.field(/Distância focal/)],
  ['missao', 'largura da imagem', inv.field(/Largura imagem/)],
  ['missao', 'droneEnumValue', inv.field(/droneEnumValue/)],
  ['missao', 'payloadEnumValue', inv.field(/payloadEnumValue/)],
]
const INVENTARIO_DESENHO = [
  ['area', 'Anular último', inv.btn(/Anular último/)],
  ['area', 'Concluir', inv.exact('Concluir')],
]
const INVENTARIO_ANCORA = [
  ['area', 'tamanho rápido 250²', inv.exact('250²')],
  ['area', 'tamanho rápido 500²', inv.exact('500²')],
  ['area', 'tamanho rápido 750²', inv.exact('750²')],
  ['area', 'tamanho rápido 1000²', inv.exact('1000²')],
  ['area', 'comprimento', inv.field(/^Comprimento/)],
  ['area', 'largura', inv.field(/^Larguram?$/)],
  ['area', 'orientação da forma', inv.field(/^Orientação°?$/)],
  ['area', 'grelha de réplicas: colunas', inv.field(/^Colunas/)],
  ['area', 'grelha de réplicas: linhas', inv.field(/^Filas \(/)],
]
const INVENTARIO_AREA = [
  ['area', 'Limpar área', inv.btn(/Limpar área/)],
  ['area', 'o ficheiro é MDT', inv.id('dem-surface-dtm')],
  ['area', 'o ficheiro é MDS', inv.id('dem-surface-dsm')],
  ['area', 'reimportar MDT', inv.btn(/Importar MDT/)],
  ['area', 'relevo global (de novo)', inv.btn(DOWNLOAD_GLOBAL)],
  // a sugestão de gimbal caiu (M2-T9): fica só a do ângulo das linhas
  ['area', 'declive: linhas', inv.btn(/^Faixas a \d+°$/)],
  ['voo', 'tolerância vertical', inv.field(/Tolerância vertical/)],
  ['voo', 'paragem nos waypoints', inv.group(/Paragem nos waypoints/)],
  ['voo', 'distância entre linhas', inv.field(/Espaçamento entre faixas/)],
  ['voo', 'passagem nadir extra', inv.field(/Passagem nadir extra/)],
]
const INVENTARIO_MOSAICO = [
  ['divisao', 'quadrado de 250 m', inv.exact('250 m')],
  ['divisao', 'quadrado de 500 m', inv.exact('500 m')],
  ['divisao', 'quadrado de 750 m', inv.exact('750 m')],
  ['divisao', 'quadrado de 1000 m', inv.exact('1000 m')],
  ['divisao', 'lado personalizado', inv.field(/Lado personalizado/)],
  ['divisao', 'orientação: segue as faixas', inv.id('tile-orientation-auto')],
  ['divisao', 'Anular (Ctrl+Z)', inv.btn(/Anular \(Ctrl\+Z\)/)],
  ['divisao', 'Reactivar todas', inv.btn(/Reactivar todas/)],
]
const INVENTARIO_BATERIA = [
  ['divisao', 'tipo de bateria', inv.id('mission-battery')],
  ['divisao', 'tempo útil', inv.id('mission-useful')],
  ['divisao', 'repor o tempo útil', inv.id('mission-useful-reset')],
  ['divisao', 'ligação à Configuração', (r) => r.locator('button', { hasText: 'Configuração' })],
  ['divisao', 'lado máximo (VLOS)', inv.field(/Lado máx\. \(VLOS\)/)],
  ['divisao', 'lista de blocos', inv.id('block-row')],
  ['bases', 'Propor bases', inv.id('propose-bases')],
  // a base marcada fica seleccionada: «Terminar» no lugar de «Atribuir…»
  [
    'bases',
    'seleccionar a base (Atribuir blocos a esta base / Terminar)',
    (r) => r.locator('[data-testid="base-gather"], [data-testid="base-gather-done"]'),
  ],
  ['bases', 'raio da zona', inv.id('base-radius')],
  ['bases', 'retirar a base', inv.btn(/Retirar a base A/)],
  ['bases', 'clique num bloco (activar ou passar à base)', inv.id('bases-click-hint')],
  ['bases', 'camada das bacias de visão', inv.id('viewshed-toggle')],
  ['bases', 'vegetação e obstáculos', inv.id('viewshed-obstacle')],
  ['resumo', 'exportar todos os voos', inv.id('export-all-flights')],
  ['resumo', 'exportar todos os voos por base', inv.id('export-by-base')],
  ['resumo', 'escolher um voo', inv.id('export-flight-select')],
  ['resumo', 'exportar um voo', inv.id('export-one-flight')],
  ['resumo', 'KML de todos os blocos', inv.id('export-kml-all')],
  ['resumo', 'KML das bases e blocos', inv.id('export-bases-kml')],
  ['resumo', 'KML dos blocos por base', inv.id('export-kml-by-base')],
]
const INVENTARIO_EXTRAS = [
  ['extras', 'número de GCPs', inv.field(/Número de GCPs/)],
  ['extras', 'GCPs: Auto', inv.exact('Auto')],
  ['extras', 'exportar GCPs', inv.btn(/Exportar GCPs/)],
  ['extras', 'nome do ponto', (r) => r.locator('[draggable=true] input[type=text]')],
  // com aria-label (M3-U23): o nome acessível diz o que a seta faz
  ['extras', 'ponto: subir', inv.btn(/Subir o ponto 1|Move point 1 up/)],
  ['extras', 'ponto: descer', inv.btn(/Descer o ponto 1|Move point 1 down/)],
  [
    'extras',
    'ponto: retirar',
    (r) =>
      r
        .locator('[draggable=true]')
        .getByRole('button', { name: /Retirar o ponto 1|Remove point 1/, includeHidden: true }),
  ],
  [
    'extras',
    'ponto: altura',
    (r) => r.locator('[draggable=true] label', { hasText: 'alt' }).locator('input'),
  ],
  [
    'extras',
    'ponto: rumo',
    (r) => r.locator('[draggable=true] label', { hasText: 'rumo' }).locator('input'),
  ],
  [
    'extras',
    'ponto: pitch',
    (r) => r.locator('[draggable=true] label', { hasText: 'pitch' }).locator('input'),
  ],
  ['extras', 'ponto: fotografar', inv.field(/Fotografar neste ponto/)],
  ['extras', 'sugerir ordem', inv.btn(/Sugerir ordem/)],
  ['extras', 'exportar a inspecção', inv.exact('Exportar KMZ')],
]
const INVENTARIO_IMPORTACAO = [['area', 'usar todas as partes', inv.btn(/Usar todas as partes/)]]
const INVENTARIO_CRS = [
  ['area', 'sistema de coordenadas', (r) => r.locator('#crs-select')],
  ['area', 'Converter', inv.exact('Converter')],
  ['area', 'Cancelar a importação', inv.exact('Cancelar')],
]

await scenario('inventario-painel-area', async () => {
  let total = 0
  const falta = []
  const onde = { cartão: 0, gaveta: 0, mapa: 0 }
  const verifica = async (page, lista) => {
    for (const [card, nome, loc] of lista) {
      total += 1
      const { where } = await reach(page, card, loc)
      if (where) onde[where] += 1
      else falta.push(`${card}: ${nome}`)
    }
    await closeDrawer(page)
  }
  /** O controlo à vista (abre a gaveta do cartão se for preciso). */
  const usa = async (page, card, loc) => {
    const { el, where } = await reach(page, card, loc)
    if (!where) throw new Error(`inventário: não se alcança um controlo de ${card}`)
    return el
  }

  // sem área: o painel inteiro tal como abre, com as secções como abrem
  const { page, errors } = await openMission({})
  await page.getByPlaceholder(/nome-da-missao/).waitFor({ state: 'attached', timeout: 20000 })
  await verifica(page, INVENTARIO_INICIO)
  // aeronave com vários payloads e um LiDAR (FOV de trabalho)
  const aeronave = (r, p) =>
    r.locator('select').filter({ has: p.locator('option[value="M300RTK"]') })
  await (await usa(page, 'missao', aeronave)).selectOption('M300RTK')
  await (
    await usa(page, 'missao', (r, p) =>
      r.locator('select').filter({ has: p.locator('option[value="P1"]') }),
    )
  ).selectOption('MAPPER_PLUS')
  // o valor escrito chega ao plano ao acabar (Enter), e só então aparece «Nominal»
  const fov = await usa(page, 'missao', inv.field(/FOV de trabalho/))
  await fov.fill('50')
  await fov.press('Enter')
  await closeDrawer(page)
  await verifica(page, INVENTARIO_DRONE)
  // aeronave própria: o editor do sensor e os enums WPML
  await (await usa(page, 'missao', aeronave)).selectOption('CUSTOM')
  await verifica(page, INVENTARIO_CUSTOM)
  await (await usa(page, 'missao', inv.btn(/LiDAR \(FOV\)/))).click()
  await closeDrawer(page)
  await verifica(page, [['missao', 'FOV do feixe', inv.field(/FOV do feixe/)]])
  // desenho livre e formas ancoradas: o desenho abre a secção da área,
  // mesmo fechada, onde estão os seus botões e campos
  const area2 = page.getByTestId('card-area').locator('h3 > button')
  if ((await area2.getAttribute('aria-expanded')) === 'true') await area2.click()
  await (await usa(page, 'mapa', inv.btn(/Polígono/))).click()
  check(
    'inventário: desenhar na barra do mapa abre a secção «Área e relevo» fechada',
    (await area2.getAttribute('aria-expanded')) === 'true' &&
      (await page
        .getByTestId('card-area')
        .getByRole('button', { name: /Anular último/ })
        .isVisible()),
  )
  await verifica(page, INVENTARIO_DESENHO)
  await (await usa(page, 'mapa', inv.btn(/Rectângulo/))).click()
  await verifica(page, INVENTARIO_ANCORA)
  await (await usa(page, 'mapa', inv.btn(/^Quadrado/))).click()
  await verifica(page, [['area', 'lado do quadrado', inv.field(/^Lado°?m?$/)]])
  check('inventário: sem erros de página sem área', errors.length === 0, errors.join(' | '))
  await page.close()

  // com área e um MDT inclinado (sugestão de declive), divisões e bases
  const b = await openMission({ area: fx.rect, demFile: fx.demSteep })
  const p2 = b.page
  await (await usa(p2, 'voo', inv.field(/Seguir terreno/))).check()
  await (await usa(p2, 'voo', inv.field(/Espaçamento manual/))).check()
  await (await usa(p2, 'voo', inv.field(/crosshatch/))).check()
  await closeDrawer(p2)
  await p2.waitForTimeout(800)
  await verifica(p2, INVENTARIO_AREA)
  await (await usa(p2, 'voo', inv.field(/Espaçamento manual/))).uncheck()
  await (await usa(p2, 'voo', inv.field(/crosshatch/))).uncheck()
  // pontos de inspecção e GCPs, antes da divisão
  await (await usa(p2, 'extras', inv.btn(/Marcar pontos de inspecção/))).click()
  await closeDrawer(p2)
  for (const [x, y] of [
    [1670, 1200],
    [1895, 980],
    [1745, 830],
  ])
    await clickMap(p2, x, y)
  await (await usa(p2, 'extras', inv.btn(/Marcar pontos de inspecção/))).click()
  await (await usa(p2, 'extras', inv.field(/Planear posições de GCPs/))).check()
  await closeDrawer(p2)
  await verifica(p2, INVENTARIO_EXTRAS)
  // base A marcada no mapa
  await (await usa(p2, 'bases', inv.btn(/Marcar base/))).click()
  await closeDrawer(p2)
  await clickMap(p2, 2195, 1495)
  await (await usa(p2, 'bases', inv.btn(/Marcar base/))).click()
  await closeDrawer(p2)
  await (await usa(p2, 'divisao', inv.exact('Quadrícula'))).click()
  await closeDrawer(p2)
  await p2.waitForTimeout(800)
  await verifica(p2, INVENTARIO_MOSAICO)
  await (await usa(p2, 'divisao', inv.id('tile-orientation-auto'))).uncheck()
  await verifica(p2, [['divisao', 'orientação da malha', inv.field(/Orientação da quadrícula/)]])
  await (await usa(p2, 'divisao', inv.exact('Faixas'))).click()
  await closeDrawer(p2)
  await verifica(p2, [['divisao', 'área máxima por bloco', inv.field(/Área máx\. por bloco/)]])
  await (await usa(p2, 'divisao', inv.exact('Bateria'))).click()
  await (await usa(p2, 'divisao', inv.id('mission-useful'))).fill('20')
  await closeDrawer(p2)
  await p2.waitForTimeout(1500)
  await verifica(p2, INVENTARIO_BATERIA)
  check('inventário: sem erros de página com área', b.errors.length === 0, b.errors.join(' | '))
  await p2.close()

  // importações: várias partes e coordenadas projectadas sem CRS
  const c = await openMission({ area: fx.multi, dem: false })
  await c.page.waitForTimeout(800)
  await verifica(c.page, INVENTARIO_IMPORTACAO)
  await c.page.close()
  const d = await openMission({ area: fx.projected, dem: false })
  await d.page.waitForTimeout(800)
  await verifica(d.page, INVENTARIO_CRS)
  await d.page.close()

  check(
    `inventário: os ${total} controlos do painel da área alcançam-se (cartão, gaveta ou barra do mapa)`,
    falta.length === 0,
    falta.length
      ? `faltam: ${falta.join('; ')}`
      : `${onde['cartão']} no cartão, ${onde.gaveta} na gaveta, ${onde.mapa} na barra do mapa`,
  )
  return { page: p2 }
})

// A barra sobre o mapa e os cartões são a mesma acção, com o mesmo nome:
// «Base» é o rótulo curto de «Marcar base» (o nome e a dica do botão), e
// marca no mesmo ponto a mesma base que o botão do cartão 5; «Inspecção»
// (marcar pontos de inspecção) acrescenta o ponto, com o marcador no mapa,
// como o botão da gaveta do cartão 6.
await scenario('barra-do-mapa-base-e-inspeccao', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  const base = marcarBase(page, 'mapa')
  const pontos = marcarPontos(page, 'mapa')
  check(
    'barra do mapa: «Base» e «Inspecção» com o nome e a dica das acções dos cartões',
    (await base.count()) === 1 &&
      (await base.innerText()).trim() === 'Base' &&
      (await base.getAttribute('title')) === 'Marcar base' &&
      (await pontos.count()) === 1 &&
      (await pontos.innerText()).trim() === 'Inspecção' &&
      (await pontos.getAttribute('title')) === 'Marcar pontos de inspecção',
    `${await base.getAttribute('title')} · ${await pontos.getAttribute('title')}`,
  )
  // a linha da base, estável durante 1,5 s (a zona, a cota e a vista
  // chegam depois do clique)
  const linhaA = async () => {
    await zonesReady(page)
    const ler = async () => {
      const [row] = await baseRows(page)
      const txt = (await page.getByTestId('base-row').first().innerText()).replace(/\s+/g, ' ')
      return JSON.stringify({ ...row, id: null, txt, ponto: (await savedBase(page, 'A'))?.point })
    }
    const t0 = Date.now()
    let antes = await ler()
    let desde = Date.now()
    while (Date.now() - t0 < 30000 && Date.now() - desde < 1500) {
      await page.waitForTimeout(250)
      const agora = await ler()
      if (agora !== antes) [antes, desde] = [agora, Date.now()]
    }
    return JSON.parse(antes)
  }
  // o botão do cartão, na secção «Bases e segurança»
  await abrirNoPainel(page, 'bases')
  await marcarBase(page).click()
  await clickMap(page, 900, 1400)
  const doCartao = await linhaA()
  await undo(page)
  const desfeita = (await baseRows(page)).length === 0
  await base.click()
  const premido = (await base.getAttribute('aria-pressed')) === 'true'
  await clickMap(page, 900, 1400)
  const daBarra = await linhaA()
  check(
    'barra do mapa: «Marcar base» da barra dá a mesma base que a do cartão 5, no mesmo ponto',
    desfeita &&
      premido &&
      doCartao.label === 'A' &&
      doCartao.ponto != null &&
      JSON.stringify(daBarra) === JSON.stringify(doCartao),
    `${doCartao.txt.slice(0, 80)} | ${daBarra.txt.slice(0, 80)}`,
  )
  const marcadores = page.locator('.inspect-marker')
  const n0 = await marcadores.count()
  await pontos.click()
  const marcar = (await pontos.getAttribute('aria-pressed')) === 'true'
  await clickMap(page, 1700, 700)
  await page.waitForTimeout(1200)
  const n1 = await marcadores.count()
  const guardados = (await savedProject(page))?.inspectPoints?.length ?? 0
  await pontos.click()
  check(
    'barra do mapa: «Inspecção» acrescenta um ponto de inspecção, com o marcador no mapa',
    marcar &&
      n1 === n0 + 1 &&
      guardados === n1 &&
      (await pontos.getAttribute('aria-pressed')) === 'false',
    `${n0} -> ${n1} marcadores, ${guardados} no projecto`,
  )
  check('barra do mapa: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- cartões e gavetas: comportamento ---------------------------------- */
const CARTOES = ['missao', 'area', 'voo', 'divisao', 'bases', 'extras', 'resumo']
const gavetasAbertas = (page) => page.locator('[data-testid^="drawer-"]:visible').count()
const focoDentro = (page, testid) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    return Boolean(el && el.contains(document.activeElement))
  }, testid)
const focoEm = (page, testid) =>
  page.evaluate((id) => document.activeElement?.getAttribute('data-testid') === id, testid)

await scenario('cartoes-gavetas', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  // sete secções numeradas, pela ordem do trabalho (o número é o do botão
  // que abre e fecha a secção)
  const ordem = await page
    .locator('[data-testid^="card-"]:not([data-testid^="card-more-"])')
    .evaluateAll((els) =>
      els.map((e) => [
        e.dataset.testid.slice(5),
        e.querySelector(':scope > h3 button > span')?.textContent,
      ]),
    )
  check(
    'cartões: sete, numerados 1 a 7 pela ordem do trabalho',
    JSON.stringify(ordem) === JSON.stringify(CARTOES.map((c, i) => [c, String(i + 1)])),
    JSON.stringify(ordem),
  )
  check('gavetas: nenhuma aberta ao abrir a aplicação', (await gavetasAbertas(page)) === 0)
  // os botões que abrem as gavetas: botões a sério, com aria-expanded e
  // aria-controls e 44 px; cada um diz o que a gaveta tem (a da área, a dos
  // parâmetros de voo e, nos Extras, uma por parte). As gavetas pequenas
  // (bases, resumo) passaram para dentro da secção; a da missão só existe
  // com um sensor personalizado e a da divisão com células (abaixo).
  const mais = page.locator('[data-testid^="card-more-"]')
  const botoes = await mais.evaluateAll((els) =>
    els.map((e) => ({
      tag: e.tagName,
      controls: e.getAttribute('aria-controls'),
      expanded: e.getAttribute('aria-expanded'),
      txt: e.textContent,
    })),
  )
  // a altura de cada um à vista, com a secção dele aberta (uma de cada vez)
  for (const [i, b] of botoes.entries()) {
    await revelar(page, mais.nth(i))
    b.h = (await mais.nth(i).boundingBox())?.height ?? 0
  }
  const nomes = [
    ['drawer-area', /^Datum vertical e mais opções$/],
    ['drawer-voo', /^Linhas de voo, disparo e câmara$/],
    ['drawer-extras', /^Pontos de apoio \(GCP\)/],
    ['drawer-extras', /^Pontos de inspecção/],
  ]
  check(
    'gavetas: os botões que as abrem (área, voo, GCP, inspecção), com aria-expanded, aria-controls e 44 px',
    botoes.length === nomes.length &&
      botoes.every(
        (b, i) =>
          b.tag === 'BUTTON' &&
          b.controls === nomes[i][0] &&
          b.expanded === 'false' &&
          b.h >= 44 &&
          nomes[i][1].test(b.txt.trim()),
      ),
    JSON.stringify(botoes.map((b) => [b.controls, b.expanded, Math.round(b.h), b.txt])),
  )

  // abre com o botão (na secção dele): a gaveta aparece ao lado do painel, o
  // foco entra nela
  const btn = page.getByTestId('card-more-voo')
  await abrirNoPainel(page, 'voo')
  await btn.click()
  const gaveta = page.getByTestId('drawer-voo')
  await gaveta.waitFor({ state: 'visible', timeout: 5000 })
  const painel = await page.getByTestId('card-voo').boundingBox()
  const caixa = await gaveta.boundingBox()
  const mapa = await page.locator('.leaflet-container').boundingBox()
  check(
    'gaveta: abre com o botão, ao lado do painel e por cima do mapa',
    (await btn.getAttribute('aria-expanded')) === 'true' &&
      caixa.x >= painel.x + painel.width - 1 &&
      caixa.x < mapa.x + mapa.width &&
      caixa.x + caixa.width > mapa.x,
    `gaveta x ${Math.round(caixa.x)}, painel até ${Math.round(painel.x + painel.width)}`,
  )
  check('gaveta: o foco entra nela', await focoDentro(page, 'drawer-voo'))
  // uma de cada vez
  await abrirNoPainel(page, 'area')
  await page.getByTestId('card-more-area').click()
  await page.getByTestId('drawer-area').waitFor({ state: 'visible', timeout: 5000 })
  check(
    'gavetas: só uma aberta de cada vez',
    (await gavetasAbertas(page)) === 1 &&
      !(await gaveta.isVisible()) &&
      (await btn.getAttribute('aria-expanded')) === 'false',
  )
  // ✕ fecha e o foco volta ao botão
  await page
    .getByTestId('drawer-area')
    .getByRole('button', { name: /^(Fechar|Close)/ })
    .click()
  check(
    'gaveta: o ✕ fecha, e o foco volta a «Mais opções»',
    (await gavetasAbertas(page)) === 0 && (await focoEm(page, 'card-more-area')),
  )
  // Escape fecha
  await abrirNoPainel(page, 'extras')
  await page.getByTestId('card-more-extras').click()
  await page.getByTestId('drawer-extras').waitFor({ state: 'visible', timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check(
    'gaveta: Escape fecha, e o foco volta a «Mais opções»',
    (await gavetasAbertas(page)) === 0 && (await focoEm(page, 'card-more-extras')),
  )
  // a gaveta da divisão (as células) só existe com quadrícula ou bateria
  check(
    'gavetas: a divisão sem células não tem gaveta',
    (await page.getByTestId('card-more-divisao').count()) === 0,
  )
  await configure(page, { split: 'Quadrícula' })
  const celulas = page.getByTestId('card-more-divisao')
  await celulas.waitFor({ state: 'visible', timeout: 5000 })
  // o mesmo botão abre e fecha
  await celulas.click()
  await page.getByTestId('drawer-divisao').waitFor({ state: 'visible', timeout: 5000 })
  await celulas.click()
  check(
    'gaveta: o mesmo botão volta a fechá-la',
    (await gavetasAbertas(page)) === 0 &&
      (await celulas.getAttribute('aria-expanded')) === 'false' &&
      /^Células e orientação dos quadrados$/.test((await celulas.textContent()).trim()),
  )
  // o que se mudou numa gaveta fica, fechada e reaberta (continua montada)
  await openDrawer(page, 'voo')
  await label(page, /Faixa transversal de amarração|Perpendicular tie line/).check()
  await closeDrawer(page)
  await openDrawer(page, 'voo')
  check(
    'gaveta: o que se mudou nela fica depois de fechar e abrir',
    await label(page, /Faixa transversal de amarração|Perpendicular tie line/).isChecked(),
  )
  await closeDrawer(page)
  check('gavetas: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- as secções do painel da área ------------------------------------- */
// Uma aberta de cada vez: abrir uma fecha a outra, e carregar na aberta
// fecha-a (pode ficar nenhuma). Sem escolha do operador, «Área e relevo» e,
// quando a área chega, «Parâmetros de voo», a menos que o operador já tenha
// aberto uma. A escolha dele fica lembrada neste aparelho; a secção que passa
// a ter o que mostrar abre-se sozinha (e fecha a outra), sem mudar essa
// escolha. O resumo de uma linha é a descrição do botão da secção.
const seccoesAbertas = (page) =>
  page
    .getByTestId('area-panel')
    .locator('section[data-testid^="card-"]')
    .evaluateAll((els) =>
      els
        .filter(
          (e) => e.querySelector(':scope > h3 > button')?.getAttribute('aria-expanded') === 'true',
        )
        .map((e) => e.dataset.testid.slice(5)),
    )
const botaoSeccao = (page, card) => page.getByTestId(`card-${card}`).locator(':scope > h3 > button')
const resumoSeccao = (page, card) =>
  botaoSeccao(page, card).evaluate((b) =>
    (b.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim(),
  )
/** Recarrega a página e espera pelo painel da área. */
async function recarregar(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('area-panel').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(800)
}

await scenario('seccoes-do-painel', async () => {
  const a = await openMission({})
  await a.page.getByTestId('area-panel').waitFor({ state: 'visible', timeout: 20000 })
  const semArea = await seccoesAbertas(a.page)
  const resumos0 = {
    missao: await resumoSeccao(a.page, 'missao'),
    area: await resumoSeccao(a.page, 'area'),
    divisao: await resumoSeccao(a.page, 'divisao'),
    resumo: await resumoSeccao(a.page, 'resumo'),
  }
  check(
    'secções: sem área, só «Área e relevo» aberta',
    JSON.stringify(semArea) === '["area"]',
    JSON.stringify(semArea),
  )
  check(
    'secções: o essencial numa linha, na descrição do botão (a da área também aberta)',
    /RTK (ligado|desligado)$/.test(resumos0.missao) &&
      resumos0.area === 'Sem área: desenhe-a no mapa ou importe-a' &&
      resumos0.divisao === 'Nenhuma · um só voo' &&
      resumos0.resumo === 'Sem plano',
    JSON.stringify(resumos0),
  )
  // aberta pelo operador antes de a área chegar, a da missão fica: a área
  // que chega não abre a dos parâmetros de voo por cima da escolha dele
  await botaoSeccao(a.page, 'missao').click()
  const daMissao = await seccoesAbertas(a.page)
  await a.page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]').setInputFiles(fx.rect)
  await a.page.locator('path.area-ring').first().waitFor({ timeout: 20000 })
  await a.page.waitForTimeout(800)
  const daMissaoComArea = await seccoesAbertas(a.page)
  check(
    'secções: abrir a da missão fecha a da área, e a área que chega deixa a que o operador abriu',
    JSON.stringify(daMissao) === '["missao"]' && JSON.stringify(daMissaoComArea) === '["missao"]',
    `${JSON.stringify(daMissao)} -> ${JSON.stringify(daMissaoComArea)}`,
  )
  await a.page.close()

  const { page, errors } = await openMission({ area: fx.rect })
  await page.waitForTimeout(800)
  const comArea = await seccoesAbertas(page)
  const resumos = {
    area: await resumoSeccao(page, 'area'),
    voo: await resumoSeccao(page, 'voo'),
    resumo: await resumoSeccao(page, 'resumo'),
  }
  check(
    'secções: quando a área chega abre-se «Parâmetros de voo», e a da área fecha-se',
    JSON.stringify(comArea) === '["voo"]',
    JSON.stringify(comArea),
  )
  check(
    'secções: o resumo da área diz os hectares e o relevo; o do plano, os voos',
    /^\d+\.\d{2} ha · /.test(resumos.area) &&
      /^1 voo · /.test(resumos.resumo) &&
      // aberta, a secção dos parâmetros de voo mostra o resumo por baixo do título
      / m (AGL|acima da descolagem)/.test(resumos.voo),
    JSON.stringify(resumos),
  )
  // o operador: abrir uma fecha a outra, carregar na aberta fecha-a (fica
  // nenhuma), e também «nenhuma» fica lembrada neste aparelho
  await botaoSeccao(page, 'area').click()
  const umaDeCadaVez = [await seccoesAbertas(page)]
  await botaoSeccao(page, 'divisao').click()
  umaDeCadaVez.push(await seccoesAbertas(page))
  await botaoSeccao(page, 'divisao').click()
  umaDeCadaVez.push(await seccoesAbertas(page))
  await recarregar(page)
  umaDeCadaVez.push(await seccoesAbertas(page))
  check(
    'secções: uma aberta de cada vez, a aberta fecha-se no título, e «nenhuma» fica lembrada',
    JSON.stringify(umaDeCadaVez) === '[["area"],["divisao"],[],[]]',
    JSON.stringify(umaDeCadaVez),
  )
  await botaoSeccao(page, 'divisao').click()
  const escolha = await seccoesAbertas(page)
  await recarregar(page)
  const depois = await seccoesAbertas(page)
  check(
    'secções: a escolha do operador fica lembrada depois de recarregar',
    JSON.stringify(escolha) === '["divisao"]' && JSON.stringify(depois) === '["divisao"]',
    `${JSON.stringify(escolha)} -> ${JSON.stringify(depois)}`,
  )

  // o que passa a ter o que mostrar abre a sua secção sozinho, fechada, e
  // fecha a outra; `mostra` é o que tem a mostrar, à vista
  const abreSozinha = async (oQue, seccao, nome, faz, mostra) => {
    const antes = await seccoesAbertas(page)
    await faz()
    await page
      .locator(`[data-testid="card-${seccao}"] > h3 > button[aria-expanded="true"]`)
      .waitFor({ timeout: 10000 })
      .catch(() => {})
    const agora = await seccoesAbertas(page)
    check(
      `secções: ${oQue} abre «${nome}», fechada, e fecha a outra`,
      !antes.includes(seccao) &&
        JSON.stringify(agora) === JSON.stringify([seccao]) &&
        (await mostra.isVisible()),
      `${JSON.stringify(antes)} -> ${JSON.stringify(agora)}`,
    )
  }
  // marcar uma base e os pontos de inspecção na barra do mapa: o botão do
  // cartão, com o mesmo nome, e o aviso de que se estão a marcar pontos
  await abreSozinha(
    'marcar uma base no mapa',
    'bases',
    'Bases e segurança',
    () => marcarBase(page, 'mapa').click(),
    marcarBase(page),
  )
  await marcarBase(page, 'mapa').click()
  await abreSozinha(
    'marcar pontos de inspecção no mapa',
    'extras',
    'Extras',
    () => marcarPontos(page, 'mapa').click(),
    page.getByTestId('card-extras').getByText(/^A marcar pontos de inspecção:/),
  )
  await marcarPontos(page, 'mapa').click()
  // um ficheiro de área que não abre (só com o eixo de uma estrada): o erro,
  // junto de «Importar área»
  const eixo = join(OUT, 'seccoes-eixo.kml')
  writeFileSync(
    eixo,
    `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>EN 2</name>
<LineString><coordinates>${toLL(200, 150).join(',')},0 ${toLL(2700, 1950).join(',')},0</coordinates></LineString>
</Placemark></Document></kml>`,
  )
  const areaInput = page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
  await abreSozinha(
    'um ficheiro de área que não abre',
    'area',
    'Área e relevo',
    () => areaInput.setInputFiles(eixo),
    page.getByTestId('import-error'),
  )
  // um projecto que não abre: o erro, junto de «Abrir projecto»
  const mau = join(OUT, 'seccoes-projecto-mau.json')
  writeFileSync(mau, JSON.stringify({ version: 2, ring: 'x' }))
  await abreSozinha(
    'um projecto que não abre',
    'missao',
    'Missão',
    () => projectFile(page).setInputFiles(mau),
    page.getByTestId('project-error'),
  )
  // um ficheiro em coordenadas projectadas sem sistema: a pergunta do CRS
  await abreSozinha(
    'a pergunta do sistema de coordenadas',
    'area',
    'Área e relevo',
    () => areaInput.setInputFiles(fx.projected),
    page.locator('#crs-select'),
  )
  await page
    .getByTestId('card-area')
    .getByRole('button', { name: /^(Cancelar|Cancel)$/ })
    .click()
  // nenhuma destas mudou a escolha do operador: recarregada, a da divisão
  await recarregar(page)
  const lembrada = await seccoesAbertas(page)
  check(
    'secções: as que se abrem sozinhas não mudam a escolha lembrada do operador',
    JSON.stringify(lembrada) === '["divisao"]',
    JSON.stringify(lembrada),
  )
  const erros = [...a.errors, ...errors]
  check('secções: sem erros de página', erros.length === 0, erros.join(' | '))
  await page.close()
  return { page }
})

/* ---- acções de segurança no KMZ ---------------------------------------- */
const accoes = (wpml) =>
  ['finishAction', 'exitOnRCLost', 'executeRCLostAction'].map(
    (k) => new RegExp(`<wpml:${k}>([^<]*)</wpml:${k}>`).exec(wpml)?.[1],
  )
await scenario('accoes-seguranca-kmz', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await configure(page, { tf: true })
  await exportReady(page)
  const fim = page.getByTestId('safety-finish')
  const sinal = page.getByTestId('safety-rc-lost')
  const accao = page.getByTestId('safety-rc-action')
  // a caixa das acções de segurança, aberta, na secção «Bases e segurança»
  await revelar(page, page.getByTestId('safety-actions'))
  check(
    'segurança: no cartão «Bases e segurança», com as omissões (RTH; interromper e RTH)',
    (await page.getByTestId('card-bases').getByTestId('safety-actions').isVisible()) &&
      (await fim.inputValue()) === 'goHome' &&
      (await sinal.inputValue()) === 'executeLostAction' &&
      (await accao.inputValue()) === 'goBack',
  )
  let [r] = await readRoutes(await exportKmz(page, join(OUT, 'seguranca-omissao.kmz')))
  check(
    'segurança: por omissão o KMZ leva goHome, executeLostAction, goBack',
    JSON.stringify(accoes(r.wpml)) === JSON.stringify(['goHome', 'executeLostAction', 'goBack']),
    accoes(r.wpml).join(','),
  )
  // a altura de regresso e a subida de descolagem escritas no KMZ estão no
  // cartão 5, iguais às do ficheiro (M3-U3)
  const rthTxt = await page.getByTestId('card-bases').getByTestId('safety-rth').innerText()
  const rthKmz = Number(/<wpml:globalRTHHeight>([\d.]+)</.exec(r.wpml)?.[1])
  const subidaKmz = Number(/<wpml:takeOffSecurityHeight>([\d.]+)</.exec(r.wpml)?.[1])
  const mRth = /RTH\): (\d+) m/.exec(rthTxt)
  const mSubida = /descolagem: (\d+) m|safety height: (\d+) m/.exec(rthTxt)
  check(
    'segurança: o cartão 5 diz o RTH e a subida de descolagem do KMZ',
    Boolean(mRth) &&
      Number(mRth[1]) === rthKmz &&
      Number(mSubida?.[1] ?? mSubida?.[2]) === subidaKmz,
    `${rthTxt.replace(/\s+/g, ' ').slice(0, 120)} | KMZ ${rthKmz} / ${subidaKmz}`,
  )
  await fim.selectOption('autoLand')
  await accao.selectOption('hover')
  await page.waitForTimeout(400)
  ;[r] = await readRoutes(await exportKmz(page, join(OUT, 'seguranca-aterrar.kmz')))
  check(
    'segurança: aterrar no fim e pairar sem sinal mudam o KMZ',
    JSON.stringify(accoes(r.wpml)) === JSON.stringify(['autoLand', 'executeLostAction', 'hover']),
    accoes(r.wpml).join(','),
  )
  await sinal.selectOption('goContinue')
  await page.waitForTimeout(400)
  check(
    'segurança: com «Continuar a missão» a acção ao interromper fica desligada',
    await accao.isDisabled(),
  )
  // o botão do cartão «Resumo e exportar» é a mesma exportação do cabeçalho
  await abrirNoPainel(page, 'resumo')
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByTestId('summary-export-mission').click(),
  ])
  await dl.saveAs(join(OUT, 'seguranca-continuar.kmz'))
  check(
    'cartão 7: o botão da missão tem o nome do cabeçalho e diz (KMZ), e sai um KMZ',
    HEADER_EXPORT.test(await page.getByTestId('summary-export-mission').innerText()) &&
      (await rotuloCondiz(page.getByTestId('summary-export-mission'), dl.suggestedFilename())),
    `${(await page.getByTestId('summary-export-mission').innerText()).trim()} → ${dl.suggestedFilename()}`,
  )
  ;[r] = await readRoutes(join(OUT, 'seguranca-continuar.kmz'))
  check(
    'segurança: «Continuar a missão» sai no KMZ (exportado no cartão «Resumo e exportar»)',
    JSON.stringify(accoes(r.wpml)) === JSON.stringify(['autoLand', 'goContinue', 'hover']),
    accoes(r.wpml).join(','),
  )
  await page.waitForTimeout(800)
  const saved = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('dji-mission-planner:project:v1'))) ?? 'null',
  )
  check(
    'segurança: as acções ficam no projecto',
    JSON.stringify(saved?.safety) ===
      JSON.stringify({
        finishAction: 'autoLand',
        exitOnRCLost: 'goContinue',
        executeRCLostAction: 'hover',
      }),
    JSON.stringify(saved?.safety),
  )
  // os outros modos mostram o mesmo cartão, com a mesma escolha
  await modo(page, /^Corredor$|^Corridor$/)
  check(
    'segurança: o corredor tem o cartão das acções, com a mesma escolha',
    (await page.getByTestId('card-corredor-seguranca').isVisible()) &&
      (await page.getByTestId('safety-finish').inputValue()) === 'autoLand' &&
      (await page.getByTestId('safety-rc-lost').inputValue()) === 'goContinue',
  )
  await modo(page, /^Área$|^Area$/)
  // a checklist de campo diz quais são
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  const chk = await page.getByTestId('checklist-safety').innerText()
  // em linhas «rótulo … valor»: «Regresso (RTH)  136 m acima da descolagem»
  check(
    'segurança: a checklist diz o RTH do KMZ',
    (await page.getByTestId('checklist-rth').count()) === 1 &&
      new RegExp(`RTH\\)\\s+${rthKmz} m`).test(chk),
    chk.replace(/\s+/g, ' ').slice(0, 160),
  )
  check(
    'segurança: a checklist de campo diz as acções escritas no KMZ',
    /Aterrar no local/.test(chk) && /Continuar a missão até ao fim/.test(chk),
    chk.replace(/\s+/g, ' ').slice(0, 200),
  )
  check('segurança: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- tablet: cartões e gaveta por cima do mapa -------------------------- */
await scenario('painel-estatisticas', async () => {
  // três grupos (qualidade, voo, operação); a operação diz voos, baterias e
  // o voo mais longo contra o tempo útil, com cor nos limites; e o painel é
  // o do separador aberto (antes a órbita mostrava os números da área)
  const { page, errors } = await openMission({ area: fx.rect })
  const panel = page.getByTestId('stats-panel')
  await page.getByTestId('stats-flights').waitFor({ timeout: 30000 })
  const txt = await panel.innerText()
  check(
    'estatísticas: três grupos, qualidade, voo e operação',
    /Qualidade/i.test(txt) && /\bVoo\b/i.test(txt) && /Operação/i.test(txt),
    txt.replace(/\s+/g, ' ').slice(0, 160),
  )
  const flights = async () =>
    (await page.getByTestId('stats-flights').locator('[data-tone]').innerText()).trim()
  const longest = page.getByTestId('stats-longest').locator('[data-tone]')
  check(
    'estatísticas: sem divisão, um voo comparado com o tempo útil',
    /\b1$/.test(await flights()) &&
      /^\d+:\d\d(:\d\d)? de \d+:\d\d$/.test((await longest.innerText()).trim()),
    `${await flights()} · ${await longest.innerText()}`,
  )
  // missão de um voo, muito acima do tempo útil: vermelho
  check(
    'estatísticas: o voo único passa o tempo útil e fica a vermelho',
    (await longest.getAttribute('data-tone')) === 'over',
    await longest.innerText(),
  )
  // divisão por bateria: os voos do painel são os blocos, e cabem
  await abrirNoPainel(page, 'divisao')
  await page.getByRole('button', { name: 'Bateria', exact: true }).click()
  await page.waitForTimeout(800)
  const nBlocks = await page.getByTestId('block-row').count()
  check(
    'estatísticas: com divisão, os voos são os blocos e o total aparece',
    nBlocks > 1 &&
      new RegExp(`^${nBlocks}\\b`).test(await flights()) &&
      (await page.getByTestId('stats-total').count()) === 1,
    `${nBlocks} blocos · ${await flights()}`,
  )
  check(
    'estatísticas: blocos dimensionados pela bateria não ficam a vermelho',
    (await longest.getAttribute('data-tone')) !== 'over',
    await longest.innerText(),
  )
  // órbita sem POI: nada da área no painel — sem plano, nem há cartão
  await modo(page, /^Órbita$|^Orbit$/)
  await page.waitForTimeout(500)
  const orbitTxt = (await panel.count()) > 0 ? await panel.innerText() : ''
  check(
    'estatísticas: no separador da órbita sem POI não há métricas (nem os números da área)',
    (await panel.count()) === 0 &&
      !/\bha\b/.test(orbitTxt) &&
      (await page.getByTestId('stats-flights').count()) === 0,
    orbitTxt.replace(/\s+/g, ' ').slice(0, 160),
  )
  check('estatísticas: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// O cartão das métricas e o enquadramento da área. Na janela do E2E o
// cartão abre e a área importada fica à esquerda dele e por baixo da barra
// de desenho, como no ecrã desenhado (antes ficava ao centro, com o cartão
// por cima da parte direita). Num mapa estreito (janela de 1024), sem
// escolha gravada, o cartão começa recolhido (aberto tapava meio mapa);
// aberto, pára acima da atribuição do mapa, e a escolha fica ao recarregar.
await scenario('metricas-enquadramento', async () => {
  const largo = await openMission({ area: fx.rect, dem: false })
  const anel = await caixaAnel(largo.page)
  const cartao = await largo.page.getByTestId('stats-panel').boundingBox()
  const barra = await largo.page.getByTestId('map-draw-tools').boundingBox()
  check(
    'enquadramento: a área fica à esquerda do cartão das métricas aberto e por baixo da barra',
    (await largo.page.getByTestId('stats-toggle').getAttribute('aria-expanded')) === 'true' &&
      anel.x + anel.w <= cartao.x - 8 &&
      anel.y >= barra.y + barra.height + 8,
    `área ${Math.round(anel.x)}–${Math.round(anel.x + anel.w)} px e desde ${Math.round(anel.y)}; ` +
      `cartão desde ${Math.round(cartao.x)}, barra até ${Math.round(barra.y + barra.height)}`,
  )
  check('enquadramento: sem erros de página', largo.errors.length === 0, largo.errors.join(' | '))
  await largo.page.close()

  const { page, errors } = await openMission({
    area: fx.rect,
    dem: false,
    viewport: { width: 1024, height: 768 },
  })
  const toggle = page.getByTestId('stats-toggle')
  await toggle.waitFor({ timeout: 20000 })
  check(
    'mapa estreito: sem escolha gravada, as métricas começam recolhidas',
    (await toggle.getAttribute('aria-expanded')) === 'false',
  )
  await toggle.click()
  const coluna = await page.getByTestId('stats-panel').boundingBox()
  const atribuicao = await page.locator('.leaflet-control-attribution').boundingBox()
  const corpo = await toggle.getAttribute('aria-controls')
  check(
    'mapa estreito: aberto, o cartão pára acima da atribuição e o botão diz o que abre',
    (await toggle.getAttribute('aria-expanded')) === 'true' &&
      coluna.y + coluna.height <= atribuicao.y &&
      (await page.evaluate(
        (id) =>
          Boolean(
            id &&
            document.querySelector('[data-testid="stats-panel"]')?.querySelector(`[id="${id}"]`),
          ),
        corpo,
      )),
    `cartão até ${Math.round(coluna.y + coluna.height)} px, atribuição desde ${Math.round(atribuicao.y)}`,
  )
  // a gravação automática (500 ms depois da última mudança) tem de ter
  // chegado ao localStorage antes de recarregar: sem ela a página volta sem
  // área, e sem plano não há cartão das métricas (no CI recarregava antes)
  await page.waitForFunction(
    () =>
      Boolean(JSON.parse(localStorage.getItem('dji-mission-planner:project:v1') ?? 'null')?.ring),
    null,
    { timeout: 20000 },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await toggle.waitFor({ timeout: 20000 })
  check(
    'mapa estreito: aberto pelo operador, continua aberto ao recarregar',
    (await toggle.getAttribute('aria-expanded')) === 'true',
  )
  check('mapa estreito: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Intervalo de disparo escrito à mão: em «Distância» os metros, em «Tempo»
// os segundos, tal como saem no KMZ e nas estatísticas, com a sobreposição
// frontal que resulta; e o rumo fixo, o mesmo ângulo em todos os waypoints.
await scenario('intervalo-manual-e-rumo-fixo', async () => {
  // relevo global plano: com o MDT de colinas, a grelha sem seguir terreno bloqueia
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await exportReady(page)
  const usa = async (loc) => {
    const { el, where } = await reach(page, 'voo', loc)
    if (!where) throw new Error('controlo do cartão «Parâmetros de voo» fora de alcance')
    return el
  }
  const params = (wpml, tipo) =>
    [
      ...wpml.matchAll(
        new RegExp(
          `<wpml:actionTriggerType>${tipo}</wpml:actionTriggerType>\\s*<wpml:actionTriggerParam>([\\d.]+)<`,
          'g',
        ),
      ),
    ].map((m) => Number(m[1]))
  await (await usa(inv.id('interval-manual'))).check()
  const metros = await usa(inv.id('interval-metres'))
  await metros.fill('25')
  await metros.press('Tab')
  await page.waitForTimeout(600)
  const sobre = await page.getByTestId('interval-overlap').innerText()
  await closeDrawer(page)
  let [r] = await readRoutes(await exportKmz(page, join(OUT, 'intervalo-25m.kmz')))
  let p = params(r.wpml, 'multipleDistance')
  check(
    'intervalo manual: 25 m no KMZ, nas estatísticas e na sobreposição do painel',
    p.length > 0 &&
      p.every((x) => x === 25) &&
      /25\.0 m · manual/.test(await page.getByTestId('stats-interval').innerText()) &&
      /\d+ % \(25\.0 m entre fotos\)/.test(sobre),
    `${p.length} grupos (${[...new Set(p)].join(',')}) · ${sobre.slice(0, 80)}`,
  )
  // por tempo: os segundos escritos, sem passar por metros
  await (
    await usa(inv.group(/Disparo por/))
  )
    .getByRole('button', { name: /^(Tempo|Time)$/ })
    .click()
  const segundos = await usa(inv.id('interval-seconds'))
  await segundos.fill('2.3')
  await segundos.press('Tab')
  await page.waitForTimeout(600)
  await closeDrawer(page)
  ;[r] = await readRoutes(await exportKmz(page, join(OUT, 'intervalo-2_3s.kmz')))
  p = params(r.wpml, 'multipleTiming')
  check(
    'intervalo manual: 2,3 s no KMZ e nas estatísticas',
    p.length > 0 &&
      p.every((x) => x === 2.3) &&
      /2\.3 s · manual/.test(await page.getByTestId('stats-interval').innerText()),
    `${p.length} grupos (${[...new Set(p)].join(',')})`,
  )
  // rumo fixo a 270°: −90 no WPML, em smoothTransition, em todos os waypoints
  await (await usa(inv.id('heading-mode'))).getByRole('button', { name: /^(Fixo|Fixed)$/ }).click()
  const graus = await usa(inv.id('heading-deg'))
  await graus.fill('270')
  await graus.press('Tab')
  await page.waitForTimeout(600)
  await closeDrawer(page)
  ;[r] = await readRoutes(await exportKmz(page, join(OUT, 'rumo-fixo.kmz')))
  const rumos = r.wpml
    .split('<Placemark>')
    .slice(1)
    .map((pm) =>
      /<wpml:waypointHeadingMode>(\w+)<\/wpml:waypointHeadingMode>\s*<wpml:waypointHeadingAngle>([-\d.]+)</.exec(
        pm,
      ),
    )
  check(
    'rumo fixo: smoothTransition a −90° em todos os waypoints',
    rumos.length > 0 && rumos.every((m) => m && m[1] === 'smoothTransition' && m[2] === '-90'),
    `${rumos.length} waypoints; o primeiro ${rumos[0]?.[1]} ${rumos[0]?.[2]}`,
  )
  check('intervalo e rumo: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Alturas de segurança escritas pelo piloto: a subida de descolagem e o RTH
// saem no KMZ e no cartão; vazias, voltam às automáticas. Escritas tecla a
// tecla e devagar, como no campo: «150» não pode passar pelo mínimo (20 m)
// a meio da escrita (o campo levava cada tecla ao limite e dava 205).
await scenario('alturas-seguranca-kmz', async () => {
  // relevo global plano: com o MDT de colinas, a grelha sem seguir terreno bloqueia
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await exportReady(page)
  const alturas = (wpml) => ({
    rth: Number(/<wpml:globalRTHHeight>([\d.]+)</.exec(wpml)?.[1]),
    subida: Number(/<wpml:takeOffSecurityHeight>([\d.]+)</.exec(wpml)?.[1]),
  })
  let [r] = await readRoutes(await exportKmz(page, join(OUT, 'alturas-auto.kmz')))
  const auto = alturas(r.wpml)
  const subida = page.getByTestId('safety-takeoff-height')
  const rth = page.getByTestId('safety-rth-height')
  // na caixa das acções de segurança, na secção «Bases e segurança»
  await revelar(page, rth)
  await rth.click()
  await rth.pressSequentially('150', { delay: 450 })
  await subida.click()
  await subida.pressSequentially('45', { delay: 450 })
  await subida.press('Tab')
  await page.waitForTimeout(500)
  ;[r] = await readRoutes(await exportKmz(page, join(OUT, 'alturas-escritas.kmz')))
  const escritas = alturas(r.wpml)
  const cartao = await page.getByTestId('card-bases').getByTestId('safety-rth').innerText()
  check(
    'segurança: as alturas escritas (45 e 150 m) saem no KMZ e no cartão',
    escritas.subida === 45 &&
      escritas.rth === 150 &&
      /RTH\): 150 m/.test(cartao) &&
      /(descolagem|safety height): 45 m/.test(cartao),
    `KMZ ${escritas.subida} / ${escritas.rth} · ${cartao.replace(/\s+/g, ' ').slice(0, 120)}`,
  )
  await rth.fill('')
  await rth.press('Tab')
  await subida.fill('')
  await subida.press('Tab')
  await page.waitForTimeout(500)
  ;[r] = await readRoutes(await exportKmz(page, join(OUT, 'alturas-repostas.kmz')))
  const repostas = alturas(r.wpml)
  check(
    'segurança: com os campos vazios, as alturas voltam às automáticas',
    repostas.rth === auto.rth && repostas.subida === auto.subida,
    `${repostas.subida} / ${repostas.rth} (automáticas ${auto.subida} / ${auto.rth})`,
  )
  check('alturas de segurança: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Legenda do mapa e da vista 3D: só as camadas com conteúdo, e cada
// interruptor esconde e volta a mostrar a sua camada (a área em SVG, as
// fotos no canvas).
await scenario('legenda-camadas', async () => {
  // relevo global plano: com o MDT de colinas, a grelha sem seguir terreno bloqueia
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await exportReady(page)
  const legenda = page.getByTestId('map-legend')
  await legenda.getByTestId('map-legend-toggle').click()
  const caixas = await legenda
    .getByRole('switch')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  check(
    'legenda: a área, as faixas e as fotos, e não as camadas vazias',
    ['polygon', 'lines', 'photos'].every((k) => caixas.includes(`map-legend-${k}`)) &&
      !caixas.includes('map-legend-orbit') &&
      !caixas.includes('map-legend-gcps'),
    caixas.join(','),
  )
  const caminhos = () => page.locator('.leaflet-overlay-pane svg path').count()
  const antes = await caminhos()
  await legenda.getByTestId('map-legend-polygon').uncheck()
  const sem = await caminhos()
  await legenda.getByTestId('map-legend-polygon').check()
  const depois = await caminhos()
  check(
    'legenda: o interruptor da área esconde e volta a mostrar o polígono',
    sem < antes && depois === antes,
    `${antes} → ${sem} → ${depois} caminhos`,
  )
  // as fotos e as faixas são desenhadas no canvas: a imagem muda com a caixa
  const imagem = async () => {
    await page.waitForTimeout(400)
    return page
      .locator('.leaflet-overlay-pane canvas')
      .first()
      .evaluate((c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let h = 0
        for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 3]) >>> 0
        return h
      })
  }
  const comFotos = await imagem()
  await legenda.getByTestId('map-legend-photos').uncheck()
  const semFotos = await imagem()
  await legenda.getByTestId('map-legend-photos').check()
  const deNovo = await imagem()
  check(
    'legenda: o interruptor das fotos esconde e volta a mostrar as fotos',
    comFotos !== semFotos && deNovo !== semFotos,
  )
  // vista 3D: a sua legenda, com as fotos e a rota
  await page.getByRole('button', { name: /Vista 3D|3D View/ }).click()
  const l3d = page.getByTestId('map3d-legend')
  await l3d.waitFor({ timeout: 20000 })
  // num ecrã largo a legenda da vista 3D já abre aberta; recolhida, abre-se
  const abrir3d = l3d.getByTestId('map3d-legend-toggle')
  if ((await abrir3d.getAttribute('aria-expanded')) !== 'true') await abrir3d.click()
  const caixas3d = await l3d
    .getByRole('switch')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  const fotos3d = l3d.getByTestId('map3d-legend-photos')
  await fotos3d.uncheck()
  const desligada = !(await fotos3d.isChecked())
  await fotos3d.check()
  check(
    'legenda 3D: relevo, rota e fotos, e o interruptor das fotos liga e desliga',
    ['terrain', 'route', 'photos'].every((k) => caixas3d.includes(`map3d-legend-${k}`)) &&
      desligada &&
      (await fotos3d.isChecked()),
    caixas3d.join(','),
  )
  // nas cores da cena: sem bases, a rota em ciano com o realce âmbar e os
  // waypoints em ciano; o relevo global plano diz a cota, e o exagero
  // vertical escolhido no cabeçalho aparece no relevo
  const rota3d = await coresDoSimbolo(l3d.getByTestId('map3d-legend-route'))
  const pontos3d = await coresDoSimbolo(l3d.getByTestId('map3d-legend-waypoints'))
  const relevo3d = () => l3d.getByTestId('map3d-legend-terrain').locator('..').innerText()
  const antes3d = await relevo3d()
  await page
    .getByRole('group', { name: /Exagero vertical|Vertical exaggeration/ })
    .getByRole('button', { name: '2×' })
    .click()
  const depois3d = await relevo3d()
  check(
    'legenda 3D: a rota e os waypoints nas cores da cena, o relevo plano e o exagero',
    rota3d.join() === '#fbbf24,#22d3ee' &&
      pontos3d.join() === '#22d3ee' &&
      /Relevo plano, à cota de 0 m/.test(antes3d) &&
      /Exagero vertical 1×/.test(antes3d) &&
      /Exagero vertical 2×/.test(depois3d) &&
      (await page.getByTestId('map3d-summary').innerText()) === 'Área · 1 voo',
    `rota ${rota3d} · waypoints ${pontos3d} · ${antes3d.replace(/\s+/g, ' ')} → ${depois3d.replace(/\s+/g, ' ')}`,
  )
  // o botão do cabeçalho da legenda recolhe-a numa pastilha e volta a
  // abri-la, com o foco sempre no botão
  const focoNoBotao = () =>
    page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'map3d-legend-toggle',
    )
  await abrir3d.click()
  const recolhida =
    (await abrir3d.getAttribute('aria-expanded')) === 'false' &&
    !(await fotos3d.isVisible()) &&
    (await focoNoBotao())
  await abrir3d.click()
  check(
    'legenda 3D: o botão recolhe a legenda e volta a abri-la, com o foco nele',
    recolhida &&
      (await abrir3d.getAttribute('aria-expanded')) === 'true' &&
      (await fotos3d.isVisible()) &&
      (await focoNoBotao()),
  )
  check('legenda: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/**
 * As cores de um símbolo da legenda (traços e preenchimentos do SVG), sem
 * repetidos, pela ordem em que aparecem.
 * @param {import('playwright').Locator} loc
 */
function coresDoSimbolo(loc) {
  return loc.locator('svg [stroke], svg [fill]').evaluateAll((els) => [
    ...new Set(
      els
        .flatMap((e) => [e.getAttribute('stroke'), e.getAttribute('fill')])
        .filter((c) => c && c !== 'none' && !c.startsWith('url'))
        .map((c) => c.toLowerCase()),
    ),
  ])
}

// Perfil de elevação: a folga mínima em destaque, com os limites das cores
// escritos, e os valores do resumo iguais aos do cálculo do perfil
// (buildProfile) sobre a rota exportada e o relevo analítico dos fixtures —
// o E2E nunca abria o perfil. A escala do relevo da vista 3D cobre o terreno
// do perfil. A 30 m sem seguir terreno, a folga passa a negativa e o cartão a
// vermelho, como o bloqueio do preflight.
// A sobreposição entre blocos: onde dois blocos voam a mesma faixa (a margem,
// o prolongamento), uma só linha às riscas nas cores deles (o mapa conta os
// troços em data-overlap-stretches, e as riscas são os únicos polígonos
// fechados no canvas das faixas) e a legenda das faixas di-lo; com as faixas
// dentro dos quadrados, nada às riscas.
await scenario('sobreposicao-entre-blocos', async () => {
  const { page, errors } = await openMission({
    area: fx.rect,
    dem: false,
    // conta os polígonos fechados que o mapa pinta no canvas (as riscas)
    initScript: () => {
      const closePath = CanvasRenderingContext2D.prototype.closePath
      window.__riscas = 0
      CanvasRenderingContext2D.prototype.closePath = function () {
        window.__riscas += 1
        return closePath.call(this)
      }
    },
  })
  await configure(page, { split: 'Bateria' })
  await exportReady(page)
  const legenda = page.getByTestId('map-legend')
  await legenda.getByTestId('map-legend-toggle').click()
  const troços = async () =>
    Number(await page.locator('[data-overlap-stretches]').getAttribute('data-overlap-stretches'))
  const riscas = () => page.evaluate(() => window.__riscas)
  const blocos = await page.getByTestId('block-row').count()
  check(
    'sobreposição: as faixas dentro dos quadrados (sem margem nem prolongamento), nada às riscas',
    blocos >= 2 &&
      (await troços()) === 0 &&
      (await riscas()) === 0 &&
      !/às riscas/.test(await legenda.innerText()),
    `${blocos} blocos, ${await troços()} troços, ${await riscas()} riscas`,
  )
  await openDrawer(page, 'voo')
  const over = page
    .locator('label', { hasText: /Prolongamento por faixa|Per-line overshoot/ })
    .locator('input')
  await over.fill('30')
  await over.press('Tab')
  await closeDrawer(page)
  await page.waitForTimeout(1500)
  check(
    'sobreposição: com o prolongamento, os troços que dois blocos voam às riscas, e a legenda di-lo',
    (await troços()) > 0 &&
      (await riscas()) > 0 &&
      /às riscas onde dois blocos voam a mesma faixa/.test(await legenda.innerText()),
    `${await troços()} troços, ${await riscas()} riscas`,
  )
  check('sobreposição: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
})

await scenario('perfil-folga-minima', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await label(page, TF).check()
  await exportReady(page)
  const [rota] = await readRoutes(await exportKmz(page, join(OUT, 'perfil-tf.kmz')))
  const wps = rota.wpml
    .split('<Placemark>')
    .slice(1)
    .map((p) => {
      const c = /<coordinates>\s*([-\d.]+),([-\d.]+)/.exec(p)
      const h = /<wpml:executeHeight>([-\d.]+)</.exec(p)
      return [Number(c[1]), Number(c[2]), Number(h[1])]
    })
  // a cota de referência: nos waypoints que seguem o terreno, solo + AGL − altura
  const solo = { elevationAt: (lon, lat) => ground(...toM(lon, lat)) }
  const ref = Math.max(...wps.map(([lon, lat, h]) => solo.elevationAt(lon, lat) + AGL_M - h))
  const esperado = buildProfile(wps, solo, ref)
  const abrirPerfil = async () => {
    const { el } = await reach(page, 'area', inv.btn(/Perfil de elevação|elevation profile/))
    await el.click()
    const perfil = page.getByTestId('elevation-profile')
    await perfil.waitFor({ timeout: 10000 })
    return perfil
  }
  let perfil = await abrirPerfil()
  const num = (s) =>
    Number(
      String(s)
        .replace('−', '-')
        .match(/-?\d+(\.\d+)?/)[0],
    )
  const valor = (id) => perfil.getByTestId(id).locator('dd').first().innerText()
  const intervalo = async (id) =>
    (await valor(id))
      .match(/(-?\d+)\s*–\s*(-?\d+)/)
      .slice(1)
      .map(Number)
  const folga = perfil.getByTestId('profile-clearance')
  const folgaTxt = await folga.getByTestId('profile-clearance-value').innerText()
  const limites = await folga.getByTestId('profile-limits').innerText()
  check(
    'perfil: a folga mínima em destaque é a calculada sobre a rota exportada',
    Math.abs(num(folgaTxt) - esperado.aglMin) <= 0.3 &&
      (await perfil.getByTestId('profile-worst').textContent()).trim() === folgaTxt.trim(),
    `${folgaTxt} (calculada ${esperado.aglMin.toFixed(2)} m)`,
  )
  check(
    'perfil: folga a verde, com os limites escritos (verde a partir de 30 m, vermelho abaixo de 15 m)',
    esperado.aglMin >= 30 &&
      (await folga.getAttribute('data-tone')) === 'ok' &&
      /Verde a partir de 30 m, âmbar de 15 a 30 m, vermelho abaixo de 15 m/.test(limites),
    limites,
  )
  const [g0, g1] = await intervalo('profile-terrain')
  const [a0, a1] = await intervalo('profile-agl')
  const comprimento = await valor('profile-length')
  const metros = /km/.test(comprimento) ? num(comprimento) * 1000 : num(comprimento)
  check(
    'perfil: terreno, AGL, referência, percurso e waypoints como os calculados',
    Math.abs(g0 - esperado.gMin) <= 1 &&
      Math.abs(g1 - esperado.gMax) <= 1 &&
      Math.abs(a0 - esperado.aglMin) <= 1 &&
      Math.abs(a1 - esperado.aglMax) <= 1 &&
      Math.abs(num(await valor('profile-ref')) - ref) <= 1 &&
      Math.abs(metros - esperado.totalM) <= Math.max(20, esperado.totalM * 0.002) &&
      num(await valor('profile-wps')) === esperado.wpCount,
    `terreno ${g0}–${g1} (${esperado.gMin.toFixed(1)}–${esperado.gMax.toFixed(1)}) · AGL ${a0}–${a1} (${esperado.aglMin.toFixed(1)}–${esperado.aglMax.toFixed(1)}) · ref ${await valor('profile-ref')} (${ref.toFixed(1)}) · ${comprimento} (${esperado.totalM.toFixed(0)} m) · ${await valor('profile-wps')} wps (${esperado.wpCount})`,
  )
  await page.keyboard.press('Escape')
  check('perfil: Esc fecha o perfil', (await perfil.count()) === 0)

  // a escala do relevo da vista 3D (a malha cobre mais do que a rota) contém
  // o terreno do perfil
  await page.getByRole('button', { name: /Vista 3D|3D View/ }).click()
  const escala = page.getByTestId('map3d-scale')
  await escala.waitFor({ timeout: 20000 })
  const [z0, z1] = (await escala.innerText()).match(/-?\d+/g).map(Number)
  check(
    'vista 3D: a escala do relevo cobre o terreno do perfil',
    z0 <= esperado.gMin + 2 && z1 >= esperado.gMax - 2 && z0 < z1,
    `escala ${z0}–${z1} m · perfil ${esperado.gMin.toFixed(1)}–${esperado.gMax.toFixed(1)} m`,
  )
  await page.keyboard.press('Escape')

  // a 30 m sem seguir terreno a rota entra no relevo: folga negativa, a
  // vermelho (o perfil abriu-se na secção da área; estes, nos parâmetros de voo)
  await abrirNoPainel(page, 'voo')
  await label(page, TF).uncheck()
  const alt = page
    .locator('label', { hasText: /Altura acima da descolagem|Altura AGL|Altitude/ })
    .locator('input')
    .first()
  await alt.fill('30')
  await alt.press('Tab')
  await page.waitForTimeout(900)
  perfil = await abrirPerfil()
  const negativa = await perfil.getByTestId('profile-clearance-value').innerText()
  check(
    'perfil: com a rota dentro do relevo, a folga negativa a vermelho',
    num(negativa) < 0 &&
      (await perfil.getByTestId('profile-clearance').getAttribute('data-tone')) === 'danger' &&
      /bloqueio|blocker/.test(await pillText(page)),
    negativa,
  )
  check('perfil: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Ajuda em português: o índice abre os tópicos (os grupos abrem e fecham),
// «Ver também» leva aos relacionados, a pesquisa deixa no índice só os
// tópicos com as palavras (sem maiúsculas nem acentos, no princípio de uma
// palavra) e realça-as; Enter passa ao tópico seguinte; Esc limpa a
// pesquisa e, depois, fecha a ajuda.
await scenario('ajuda-indice-pesquisa', async () => {
  const { page, errors } = await openMission({})
  await page.getByTitle(/Instruções e informação/).click()
  const ajuda = page.getByRole('dialog', { name: 'Ajuda' })
  await ajuda.waitFor({ timeout: 5000 })
  const indice = ajuda.getByRole('navigation', { name: 'Tópicos da ajuda' })
  const topico = ajuda.getByTestId('help-topic')
  const titulo = () => topico.getByRole('heading', { level: 2 }).innerText()
  const busca = ajuda.getByRole('searchbox', { name: 'Procurar na ajuda' })
  const entradas = async () =>
    (await indice.getByRole('button').allInnerTexts()).map((s) => s.split('\n')[0].trim())
  const todas = await entradas()
  check(
    'ajuda: abre em português no primeiro tópico, com a pesquisa em foco e o índice',
    (await titulo()) === 'Fluxo básico' &&
      (await busca.evaluate((e) => e === document.activeElement)) &&
      [
        'Fluxo básico',
        'Tipos de missão',
        'Voos e bases',
        'Exportar',
        'O que mudou',
        'Acerca',
      ].every((n) => todas.includes(n)),
    todas.join(' | '),
  )
  const grupo = indice.getByRole('button', { name: 'Voos e bases' })
  await grupo.click()
  const aberto = (await grupo.getAttribute('aria-expanded')) === 'true'
  await indice.getByRole('button', { name: 'Bacias de visão' }).click()
  check(
    'ajuda: o índice abre o grupo e o tópico, marcado como o actual, com o caminho',
    aberto &&
      (await titulo()) === 'Bacias de visão' &&
      /Laranja: atrás do relevo/.test(await topico.innerText()) &&
      /^Ajuda\s*Voos e bases/.test(await topico.innerText()) &&
      (await indice
        .getByRole('button', { name: 'Bacias de visão' })
        .getAttribute('aria-current')) === 'true',
  )
  await grupo.click()
  check(
    'ajuda: o grupo fecha-se no índice',
    (await grupo.getAttribute('aria-expanded')) === 'false' &&
      (await indice.getByRole('button', { name: 'Bacias de visão' }).count()) === 0,
  )
  await topico.getByRole('button', { name: 'Configuração' }).click()
  check(
    'ajuda: «Ver também» abre o tópico relacionado',
    (await titulo()) === 'Configuração' &&
      /roda dentada no cabeçalho/.test(await topico.innerText()),
  )
  // pesquisa: só os tópicos com a palavra, realçada; «rth» não é o de «Earth»
  await busca.fill('rth')
  const comRth = await entradas()
  const marcas = await topico.locator('mark').allInnerTexts()
  check(
    'ajuda: a pesquisa deixa no índice só os tópicos com a palavra e realça-a',
    comRth.includes('Acções de segurança') &&
      comRth.includes('O que mudou') &&
      !comRth.includes('Fluxo básico') &&
      !comRth.includes('WPML (KMZ) e voos') &&
      (await titulo()) === 'Acções de segurança' &&
      marcas.length >= 1 &&
      marcas.every((m) => m === 'RTH') &&
      /\d+ resultados em 2 tópicos/.test(await ajuda.getByRole('status').innerText()),
    `${comRth.join(' | ')} · ${marcas.join(',')}`,
  )
  await busca.press('Enter')
  check('ajuda: Enter na pesquisa passa ao tópico seguinte', (await titulo()) === 'O que mudou')
  // sem acentos: «seguranca» encontra «segurança»
  await busca.fill('SEGURANCA')
  const semAcento = await topico.locator('mark').allInnerTexts()
  check(
    'ajuda: a pesquisa não distingue maiúsculas nem acentos',
    semAcento.length >= 1 && semAcento.every((m) => /^segurança$/i.test(m)),
    semAcento.join(','),
  )
  await busca.fill('xyzzy')
  check(
    'ajuda: sem resultados, o índice fica vazio e a ajuda di-lo',
    (await indice.getByRole('button').count()) === 0 &&
      /Nada encontrado para «xyzzy»/.test(await ajuda.innerText()),
  )
  await busca.press('Escape')
  const limpa = (await busca.inputValue()) === '' && (await ajuda.isVisible())
  await busca.press('ArrowDown')
  check(
    'ajuda: Esc limpa a pesquisa, e a seta para baixo passa ao índice',
    limpa &&
      (await entradas()).length === todas.length &&
      (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Fluxo básico',
  )
  await page.keyboard.press('Escape')
  check('ajuda: Esc, fora da pesquisa, fecha a ajuda', (await ajuda.count()) === 0)
  check('ajuda: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// Configuração em quatro secções com índice: cada separador mostra a sua
// secção e esconde as outras; as setas e o End andam no índice; os esquemas
// da zona e do piloto dizem os valores configurados.
await scenario('configuracao-indice', async () => {
  const { page, errors } = await openMission({})
  await page.getByTestId('open-settings').click()
  const dlg = page.getByRole('dialog', { name: 'Configuração' })
  await dlg.waitFor({ timeout: 5000 })
  const indice = dlg.getByRole('tablist', { name: 'Secções da configuração' })
  const tab = (nome) => indice.getByRole('tab', { name: nome, exact: true })
  const nomes = ['Aeronaves e baterias', 'Zona de descolagem', 'Piloto', 'Ficheiro e dados']
  const contagens = await Promise.all(nomes.map((n) => tab(n).count()))
  const vis = (sel) => dlg.locator(sel).isVisible()
  check(
    'configuração: quatro secções no índice, a primeira aberta e as outras escondidas',
    contagens.every((n) => n === 1) &&
      (await tab('Aeronaves e baterias').getAttribute('aria-selected')) === 'true' &&
      (await vis('#set-vlos')) &&
      !(await vis('#set-zone-radius')) &&
      !(await vis('#set-eye-height')),
    contagens.join(','),
  )
  await tab('Zona de descolagem').click()
  const raio = dlg.locator('#set-zone-radius')
  await raio.fill('150')
  await raio.press('Tab')
  check(
    'configuração: a secção da zona, com o raio no esquema do mapa',
    (await tab('Zona de descolagem').getAttribute('aria-selected')) === 'true' &&
      !(await vis('#set-vlos')) &&
      /Raio pedido \(150 m\), a tracejado quando foi reduzido/.test(await dlg.innerText()),
  )
  // teclado: a seta para baixo passa ao Piloto, o End ao Ficheiro e dados
  await tab('Zona de descolagem').focus()
  await page.keyboard.press('ArrowDown')
  const piloto =
    (await tab('Piloto').getAttribute('aria-selected')) === 'true' &&
    (await vis('#set-eye-height')) &&
    /Linha de vista, dos olhos \(1\.7 m\)/.test(await dlg.innerText())
  await page.keyboard.press('End')
  check(
    'configuração: as setas e o End andam no índice (Piloto, Ficheiro e dados)',
    piloto &&
      (await tab('Ficheiro e dados').getAttribute('aria-selected')) === 'true' &&
      (await tab('Ficheiro e dados').evaluate((e) => e === document.activeElement)) &&
      (await dlg.getByRole('button', { name: /^Exportar$/ }).isVisible()) &&
      (await dlg.getByRole('button', { name: 'Limpar a cache do relevo' }).isVisible()),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const guardado = await page.evaluate(
    () => JSON.parse(localStorage.getItem('dji-mission-planner:equipment') ?? 'null')?.zoneRadiusM,
  )
  check(
    'configuração: o raio fica guardado e Esc fecha a janela',
    guardado === 150 && (await dlg.count()) === 0,
    `${guardado}`,
  )
  check('configuração: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// A 1440 × 900 o cabeçalho cabe numa linha, sem área e com uma área
// planeada: abaixo de 1800 px as vistas ficam só com o ícone (o nome fica
// para o leitor de ecrã); a partir de 1800 px voltam a ter o nome
await scenario('cabecalho-1440-uma-linha', async () => {
  const { page, errors } = await openMission({ viewport: { width: 1440, height: 900 } })
  const altura = async () => Math.round((await page.locator('header').boundingBox())?.height ?? 0)
  const vista = page.locator('header').getByRole('button', { name: 'Vista 3D', exact: true })
  const largura = async () => Math.round((await vista.boundingBox())?.width ?? 0)
  const semArea = await altura()
  const icone = await largura()
  const areaInput = page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
  await areaInput.setInputFiles(fx.rect)
  await page.waitForTimeout(1200)
  const comArea = await altura()
  await page.setViewportSize({ width: 1800, height: 900 })
  await page.waitForTimeout(300)
  const a1800 = await altura()
  const nome = await largura()
  check(
    'cabeçalho: numa só linha a 1440 px (vistas só com o ícone) e a 1800 px (com o nome)',
    semArea <= 64 && comArea <= 64 && icone <= 40 && a1800 <= 64 && nome > 60,
    `1440: ${semArea}/${comArea} px, vista ${icone} px; 1800: ${a1800} px, vista ${nome} px`,
  )
  check('cabeçalho: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('tablet-cartoes-gaveta', async () => {
  const { page, errors } = await openMission({
    area: fx.rect,
    viewport: { width: 834, height: 1112 },
  })
  const w = 834
  // o cabeçalho fica numa linha, com a configuração, a ajuda e a língua (e,
  // ao alto, as vistas) no menu «⋮», em vez de os empurrar para fora do ecrã
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
  check('tablet: a página não transborda para o lado', scrollW <= w, `${scrollW} px`)
  const alturaCab = Math.round((await page.locator('header').boundingBox())?.height ?? 0)
  await page.getByTestId('header-more').click()
  const gear = await page.getByTestId('open-settings').boundingBox()
  const vistasNoMenu = await page
    .locator('#more-menu')
    .getByRole('menuitem', { name: /Checklist de campo|Field checklist/ })
    .count()
  const tracos = await page.locator('#more-menu').getByRole('separator').count()
  check(
    'tablet: a configuração fica dentro do ecrã (no menu «⋮», com as vistas) e o cabeçalho numa linha',
    gear != null &&
      gear.x >= 0 &&
      gear.x + gear.width <= w &&
      vistasNoMenu === 1 &&
      tracos === 2 &&
      alturaCab <= 64,
    `${JSON.stringify(gear)} · cabeçalho ${alturaCab} px`,
  )
  await page.keyboard.press('Escape')
  const vistos = []
  for (const c of CARTOES) {
    const card = page.getByTestId(`card-${c}`)
    await card.scrollIntoViewIfNeeded()
    const b = await card.boundingBox()
    if ((await card.isVisible()) && b && b.x >= 0 && b.x + b.width <= w) vistos.push(c)
  }
  check(
    'tablet 834×1112: os sete cartões à vista dentro do ecrã',
    vistos.length === CARTOES.length,
    vistos.join(','),
  )
  await page.getByTestId('card-voo').scrollIntoViewIfNeeded()
  await openDrawer(page, 'voo')
  const g = await page.getByTestId('drawer-voo').boundingBox()
  const mapa = await page.locator('.leaflet-container').boundingBox()
  const painel = await page.getByTestId('card-voo').boundingBox()
  check(
    'tablet: a gaveta abre por cima do mapa, ao lado do painel, dentro do ecrã',
    g.x >= painel.x + painel.width - 1 &&
      g.x < mapa.x + mapa.width &&
      g.x + g.width > mapa.x &&
      g.x + g.width <= w &&
      (await label(page, CROSS).isVisible()),
    `gaveta ${Math.round(g.x)}–${Math.round(g.x + g.width)} px, mapa desde ${Math.round(mapa.x)}`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('tablet: Escape fecha a gaveta', (await gavetasAbertas(page)) === 0)
  check('tablet: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// O tablet ao baixo (1024 × 768), como no desenho: o cabeçalho numa linha,
// com botões de 44 px, e a configuração, a ajuda e a língua no menu «⋮»; o
// painel de parâmetros é uma folha que se recolhe, no botão dele e no
// «Painel» da barra dos modos (o mapa fica com a largura), e volta ao
// escolher um modo; as métricas num botão.
await scenario('tablet-1024-cabecalho-e-folha', async () => {
  const { page, errors } = await openMission({
    area: fx.rect,
    dem: false,
    viewport: { width: 1024, height: 768 },
  })
  await page.getByTestId('stats-toggle').waitFor({ timeout: 20000 })
  const cab = await page.locator('header').boundingBox()
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
  // os controlos do cabeçalho com 44 px de altura (o toque)
  const baixos = await page
    .locator('header')
    .getByRole('button')
    .evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => [
          e.getAttribute('aria-label') || e.textContent.trim(),
          e.getBoundingClientRect().height,
        ])
        .filter(([, h]) => h < 43.5)
        .map(([n, h]) => `${n.slice(0, 20)}:${Math.round(h)}`),
    )
  check(
    'tablet 1024: o cabeçalho numa linha, sem transbordar, com os botões de 44 px',
    cab.height <= 64 && scrollW <= 1024 && baixos.length === 0,
    `${Math.round(cab.height)} px, ${scrollW} px · ${baixos.join(' ')}`,
  )
  check(
    'tablet 1024: as métricas começam num botão',
    (await page.getByTestId('stats-toggle').getAttribute('aria-expanded')) === 'false',
  )
  // o menu «⋮»: configuração, ajuda e as duas línguas, a actual marcada
  const mais = page.getByTestId('header-more')
  await mais.click()
  const menu = page.locator('#more-menu')
  const itens = (await menu.locator('[role^="menuitem"]').allInnerTexts()).map((s) => s.trim())
  const pt = menu.getByRole('menuitemradio', { name: 'Português' })
  check(
    'tablet 1024: o menu «⋮» tem a configuração, a ajuda e a língua (a actual marcada)',
    itens.join('|') === 'Configuração|Ajuda|Português|English' &&
      (await pt.getAttribute('aria-checked')) === 'true' &&
      (await page.getByTestId('open-settings').count()) === 1,
    itens.join('|'),
  )
  const alturasMenu = await menu
    .locator('[role^="menuitem"]')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  check(
    'tablet 1024: os itens do menu «⋮» têm 44 px (o toque), com um traço antes das línguas',
    alturasMenu.every((h) => h >= 44) && (await menu.getByRole('separator').count()) === 1,
    alturasMenu.join(','),
  )
  await menu.getByRole('menuitemradio', { name: 'English' }).click()
  const emIngles = await headerExport(page).innerText()
  await mais.click()
  const en = await menu.getByRole('menuitemradio', { name: 'English' }).getAttribute('aria-checked')
  await menu.getByRole('menuitemradio', { name: 'Português' }).click()
  check(
    'tablet 1024: a língua muda no menu e o menu marca-a',
    /Export Advanced WPML/.test(emIngles) &&
      en === 'true' &&
      /Exportar WPML Avançado/.test(await headerExport(page).innerText()),
    emIngles,
  )
  await mais.click()
  await page.getByTestId('open-settings').click()
  const config = page.getByRole('dialog', { name: /Configuração/ })
  const abriu = await config.isVisible()
  await page.keyboard.press('Escape')
  check('tablet 1024: «Configuração» no menu abre a configuração', abriu)
  // a folha do painel
  const painel = page.getByTestId('panel-toggle')
  const missao = page.getByTestId('card-missao')
  const largura = async () =>
    Math.round((await page.locator('.leaflet-container').boundingBox())?.width ?? 0)
  const aberto = await largura()
  check(
    'tablet 1024: o painel à vista, com o «Painel» da barra aceso',
    (await painel.getAttribute('aria-expanded')) === 'true' && (await missao.isVisible()),
  )
  await painel.click()
  await page.waitForTimeout(400)
  const recolhido = await largura()
  check(
    'tablet 1024: o «Painel» da barra recolhe a folha e o mapa fica com a largura',
    (await painel.getAttribute('aria-expanded')) === 'false' &&
      !(await missao.isVisible()) &&
      recolhido >= aberto + 300,
    `mapa ${aberto} → ${recolhido} px`,
  )
  await painel.click()
  await page.waitForTimeout(300)
  const recolher = page.getByRole('button', { name: 'Recolher o painel' })
  const voltou = (await missao.isVisible()) && (await recolher.isVisible())
  await recolher.click()
  await page.waitForTimeout(300)
  check(
    'tablet 1024: o botão da folha recolhe-a e o foco passa ao «Painel» da barra',
    voltou &&
      !(await missao.isVisible()) &&
      (await painel.evaluate((e) => e === document.activeElement)),
  )
  await modo(page, /^Área$|^Area$/)
  await page.waitForTimeout(300)
  check(
    'tablet 1024: escolher um modo mostra o painel dele',
    (await missao.isVisible()) && (await painel.getAttribute('aria-expanded')) === 'true',
  )
  check('tablet 1024: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// A operação do dia: com a área dividida em voos e as bases marcadas, o
// botão «Operação do dia», por baixo das métricas, abre à direita do mapa o
// painel do dia de campo — os conjuntos, o tempo total e o voo mais longo
// (os números das métricas), o voo seguinte e uma linha por voo, pela ordem
// de voo —, com as métricas e o painel de parâmetros recolhidos. Feito é o
// voo com a «Hora fim» no registo de voos da checklist: «Marcar feito»
// escreve-a lá (com as linhas do plano, como «Importar blocos do plano»),
// desmarcar apaga-a, o que a checklist escreve vê-se no painel, e abrir e
// fechar o painel não grava nada.
const CHECKLIST_KEYS = (page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('dji-mission-planner:checklist'))
      .map((k) => [k, localStorage.getItem(k)]),
  )
await scenario('operacao-do-dia', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { split: 'Bateria' })
  check(
    'operação: sem bases, não há operação do dia',
    (await page.getByTestId('block-row').count()) > 1 &&
      (await page.getByTestId('day-open').count()) === 0,
  )
  await proposeAndWait(page)
  await zonesReady(page)
  const voos = await page
    .getByTestId('block-row')
    .evaluateAll((els) => els.map((e) => e.dataset.flight))
  const n = voos.length
  const abre = page.getByTestId('day-open')
  await abre.waitFor({ timeout: 20000 })
  const total = (await page.getByTestId('stats-total').locator('[data-tone]').innerText()).trim()
  const longo = (await page.getByTestId('stats-longest').locator('[data-tone]').innerText())
    .trim()
    .split(/\s/)[0]
  check(
    'operação: o botão, por baixo das métricas, diz os voos e o tempo total delas',
    (await abre.innerText()).includes(`${n} voos · ${total}`),
    `${await abre.innerText()} · ${n} voos · ${total}`,
  )
  // abrir e fechar não grava nada no registo da checklist
  const antes = await CHECKLIST_KEYS(page)
  await abre.click()
  const painel = page.getByTestId('day-panel')
  await painel.waitFor({ timeout: 5000 })
  const fechar = painel.getByRole('button', { name: 'Fechar a operação do dia' })
  check(
    'operação: abre à direita do mapa, com o foco no fechar, sem as métricas e sem o painel de parâmetros',
    (await fechar.evaluate((e) => e === document.activeElement)) &&
      (await page.getByTestId('stats-panel').count()) === 0 &&
      !(await page.getByTestId('card-missao').isVisible()) &&
      (await page.getByTestId('panel-toggle').getAttribute('aria-expanded')) === 'false' &&
      (await page.locator('.leaflet-container').boundingBox()).x +
        (await page.locator('.leaflet-container').boundingBox()).width <=
        (await painel.boundingBox()).x + 1,
  )
  const linhas = painel.getByTestId('day-row')
  const ordem = await linhas.evaluateAll((els) => els.map((e) => e.dataset.flight))
  check(
    'operação: uma linha por voo, pela ordem de voo do painel da área',
    ordem.join(' ') === voos.join(' '),
    ordem.join(' '),
  )
  check(
    'operação: os conjuntos, o tempo total e o voo mais longo são os das métricas',
    (await painel.getByTestId('day-sets').innerText()).includes(String(n)) &&
      (await painel.getByTestId('day-total').innerText()).includes(total) &&
      (await painel.getByTestId('day-longest').innerText()).includes(longo),
    `${total} · ${longo}`,
  )
  check(
    'operação: o voo seguinte é o primeiro, e o mapa marca-o',
    (await painel.getByTestId('day-next').getAttribute('data-flight')) === voos[0] &&
      new RegExp(`A seguir · base [A-Z]+ · ${voos[0]}`).test(
        await page.locator('.day-focus-label').innerText(),
      ),
  )
  // o nome de cada botão começa pelo que ele mostra (WCAG 2.5.3): «Ver no
  // mapa» e «Marcar feito» com o voo; na linha, a base, com a acção na dica
  const base0 = voos[0].split('-')[0]
  const seguinte = painel.getByTestId('day-next')
  check(
    'operação: «Ver no mapa» e «Marcar feito» chamam-se pelo que mostram, com o voo',
    (await seguinte
      .getByRole('button', { name: `Ver no mapa: voo ${voos[0]} (base ${base0})`, exact: true })
      .count()) === 1 &&
      (await seguinte
        .getByRole('button', { name: `Marcar feito: voo ${voos[0]}`, exact: true })
        .count()) === 1 &&
      (await linhas
        .first()
        .getByRole('button', { name: new RegExp(`^Base ${base0}\\s*\\d+ conjuntos?$`) })
        .getAttribute('title')) === `Ver no mapa: voo ${voos[0]} (base ${base0})`,
  )
  await page.keyboard.press('Escape')
  check(
    'operação: Esc fecha, o foco volta ao botão, e as métricas e o painel voltam',
    (await painel.count()) === 0 &&
      (await abre.evaluate((e) => e === document.activeElement)) &&
      (await page.getByTestId('stats-panel').count()) === 1 &&
      (await page.getByTestId('card-missao').isVisible()),
  )
  check(
    'operação: abrir e fechar não grava nada no registo de voos',
    JSON.stringify(await CHECKLIST_KEYS(page)) === JSON.stringify(antes),
    JSON.stringify(antes).slice(0, 120),
  )
  // marcar o voo seguinte: a hora de fim no registo da checklist
  await abre.click()
  await painel.getByTestId('day-mark-next').click()
  const registo = async () => {
    const [[, v] = []] = await CHECKLIST_KEYS(page)
    return v ? (JSON.parse(v).voos ?? []) : []
  }
  let r = await registo()
  const hora = r.find((l) => l.n === voos[0])?.fim ?? ''
  check(
    'operação: «Marcar feito» escreve a hora na «Hora fim» do voo, com as linhas do plano',
    /^\d\d:\d\d$/.test(hora) &&
      r.map((l) => l.n).join(' ') === voos.join(' ') &&
      r.filter((l) => l.fim).length === 1,
    JSON.stringify(r).slice(0, 200),
  )
  check(
    'operação: o voo fica feito, o seguinte passa ao outro e o mapa marca-o com um visto',
    (await linhas.first().getAttribute('data-done')) === 'true' &&
      (await painel.getByTestId('day-next').getAttribute('data-flight')) === voos[1] &&
      new RegExp(`Feitos 1 de ${n}`).test(await painel.getByTestId('day-progress').innerText()) &&
      (await page.locator('.day-done-mark').count()) === 1,
    await painel.getByTestId('day-progress').innerText(),
  )
  // desmarcar na linha apaga a hora; marcar de novo volta a escrevê-la
  const caixa = linhas.first().getByRole('button', { name: `Marcar feito: voo ${voos[0]}` })
  await caixa.click()
  r = await registo()
  check(
    'operação: desmarcar apaga a «Hora fim» e o voo volta a ser o seguinte',
    (await caixa.getAttribute('aria-pressed')) === 'false' &&
      r.find((l) => l.n === voos[0])?.fim === '' &&
      (await painel.getByTestId('day-next').getAttribute('data-flight')) === voos[0],
  )
  await caixa.click()
  // «Ver no mapa» de outro voo: o rótulo dele no mapa
  await linhas
    .nth(2)
    .getByTitle(`Ver no mapa: voo ${voos[2]} (base ${voos[2].split('-')[0]})`)
    .click()
  await page.waitForTimeout(600)
  check(
    'operação: mostrar outro voo põe o rótulo dele no mapa',
    new RegExp(`Base [A-Z]+ · ${voos[2]}$`).test(
      (await page.locator('.day-focus-label').innerText()).trim(),
    ),
    await page.locator('.day-focus-label').innerText(),
  )
  const horaFim = (await registo()).find((l) => l.n === voos[0])?.fim ?? ''
  await fechar.click()
  // a checklist mostra a hora; apagada lá, o voo volta a estar por fazer
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  await page.waitForTimeout(500)
  const campo = await page.evaluate(
    ({ voo, hora }) => {
      for (const tabela of document.querySelectorAll('table')) {
        const cols = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent.trim())
        // a coluna do voo: «#», ou «Voo» com as linhas do plano
        const iN = cols.findIndex((c) => /^(#|Voo|Flight)$/.test(c))
        const iFim = cols.findIndex((c) => /^(Hora fim|End time)$/i.test(c))
        if (iN < 0 || iFim < 0) continue
        for (const tr of tabela.querySelectorAll('tbody tr')) {
          const celulas = [...tr.children]
          const fim = celulas[iFim]?.querySelector('input')
          if (celulas[iN]?.querySelector('input')?.value !== voo || !fim) continue
          fim.setAttribute('data-e2e-fim', '1')
          return fim.value === hora
        }
      }
      return false
    },
    { voo: voos[0], hora: horaFim },
  )
  check('operação: a checklist mostra a hora de fim no registo de voos', campo, horaFim)
  if (campo) {
    await page.locator('[data-e2e-fim]').fill('')
    await page.waitForTimeout(700)
  }
  await page.getByRole('button', { name: /Voltar ao planeador|Back to planner/ }).click()
  await page.waitForTimeout(500)
  await abre.click()
  check(
    'operação: a hora apagada na checklist deixa o voo por fazer no painel',
    (await painel.getByTestId('day-row').first().getAttribute('data-done')) === 'false' &&
      new RegExp(`Feitos 0 de ${n}`).test(await painel.getByTestId('day-progress').innerText()),
    await painel.getByTestId('day-progress').innerText(),
  )
  // «Painel», na barra dos modos, fecha a operação e mostra o painel
  await page.getByTestId('panel-toggle').click()
  check(
    'operação: o «Painel» da barra fecha a operação do dia e mostra o painel',
    (await painel.count()) === 0 && (await page.getByTestId('card-missao').isVisible()),
  )
  // num ecrã baixo (1024 × 768) com as métricas abertas, o botão da operação
  // fica com a sua altura por baixo do cartão: é o cartão que cede (rola)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.waitForTimeout(400)
  const metricas = page.getByTestId('stats-toggle')
  if ((await metricas.getAttribute('aria-expanded')) !== 'true') await metricas.click()
  await page.waitForTimeout(300)
  const cartao = await page.getByTestId('stats-panel').boundingBox()
  const botao = await abre.boundingBox()
  check(
    'operação: num ecrã baixo, com as métricas abertas, o botão não encolhe e fica por baixo do cartão',
    botao.height >= 39.5 && cartao.y + cartao.height <= botao.y,
    `botão ${botao.height} px desde ${Math.round(botao.y)}; cartão até ${Math.round(cartao.y + cartao.height)}`,
  )
  check('operação: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- pacote R-A: projecto e dados (docs/REVISAO-CODIGO-2026-10.md) ------- */
// Coordenadas dos waypoints de um waylines.wpml, [lon, lat].
const wpCoords = (wpml) =>
  [...wpml.matchAll(/<coordinates>\s*(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ])
const esperaArea = async (page) => {
  await page
    .locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
    .waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(800)
}
const mesmoAnel = (a, b, tolM = 0.5) =>
  a.length === b.length &&
  a.every((p, i) => {
    const q = toM(p[0], p[1])
    const r = toM(b[i][0], b[i][1])
    return Math.hypot(q[0] - r[0], q[1] - r[1]) < tolM
  })
const lados = (fechado) => {
  const ring =
    fechado.length > 1 &&
    fechado[0][0] === fechado[fechado.length - 1][0] &&
    fechado[0][1] === fechado[fechado.length - 1][1]
      ? fechado.slice(0, -1)
      : fechado
  return ring.map((p, i) => {
    const q = toM(p[0], p[1])
    const r = toM(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1])
    return Math.hypot(q[0] - r[0], q[1] - r[1])
  })
}

// M3-C1: abrir um projecto por cima de uma sessão substituía só o anel «if
// (n.ring)»: com o rectângulo da âncora aberto, o KMZ saía com a geometria
// da sessão anterior e o nome do projecto novo.
await scenario('projecto-por-cima-da-sessao', async () => {
  const { page, errors } = await openMission({ dem: false })
  // a sessão: a grelha 2×2 da âncora (quatro células, quatro voos)
  const grelha = join(OUT, 'sessao-grelha.json')
  writeFileSync(
    grelha,
    JSON.stringify({
      version: 2,
      missionName: 'sessao-grelha',
      anchor: {
        center: toLL(1000, 1000),
        length: 500,
        width: 300,
        orientation: 90,
        shape: 'rect',
        cols: 2,
        rows: 2,
      },
      ring: [toLL(500, 700), toLL(1500, 700), toLL(1500, 1300), toLL(500, 1300)],
      areaOrigin: 'anchor',
    }),
  )
  await projectFile(page).setInputFiles(grelha)
  await page.waitForTimeout(1000)
  await exportReady(page)
  const sessao = await readRoutes(await exportKmz(page, join(OUT, 'por-cima-sessao.zip')))
  check(
    'projecto por cima: a sessão voa a grelha da âncora em 4 voos',
    sessao.length === 4,
    `${sessao.length} voos`,
  )
  // um projecto desenhado 3,6 km a nordeste da origem dos fixtures, como
  // «Guardar projecto» o escreveria
  const anel = [toLL(3600, 3600), toLL(3900, 3600), toLL(3900, 3900), toLL(3600, 3900)]
  const file = join(OUT, 'p2-desenhada.json')
  writeFileSync(
    file,
    JSON.stringify({
      version: 2,
      missionName: 'p2-desenhada',
      ring: anel,
      areaOrigin: 'draw',
      params: { altitude: 80 },
    }),
  )
  await projectFile(page).setInputFiles(file)
  await page.waitForTimeout(1000)
  await exportReady(page)
  const nameInput = page.getByPlaceholder(/nome-da-missao|mission-name/)
  check(
    'projecto por cima: o nome é o do ficheiro',
    (await nameInput.inputValue()) === 'p2-desenhada',
  )
  const depois = await readRoutes(await exportKmz(page, join(OUT, 'por-cima-p2.kmz')))
  const poly = turf.buffer(turf.polygon([[...anel, anel[0]]]), 60, { units: 'meters' })
  const wps = depois.flatMap((r) => wpCoords(r.wpml))
  const dentro = wps.filter((q) => turf.booleanPointInPolygon(turf.point(q), poly)).length
  check(
    'projecto por cima: um só voo, com todos os waypoints na área do projecto aberto',
    depois.length === 1 && wps.length > 0 && dentro === wps.length,
    `${depois.length} voos, ${dentro}/${wps.length} dentro`,
  )
  check(
    'projecto por cima: a altitude é a do ficheiro (80 m), não a da sessão',
    /<wpml:executeHeight>80</.test(depois[0].wpml),
  )
  // Ctrl+Z não sai do projecto aberto: a área continua a ser a de p2
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(600)
  const kml = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'por-cima-undo.kml')),
  )
  check(
    'projecto por cima: Ctrl+Z não repõe a área da sessão anterior',
    turf.booleanPointInPolygon(turf.point(centro(kml)), poly),
  )
  check('projecto por cima: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// M3-C2: um vértice arrastado num rectângulo da âncora perdia-se ao
// recarregar (a âncora regenerava o anel) e ao mover a área.
await scenario('ancora-editada-sobrevive', async () => {
  const { page, errors } = await openMission({ dem: false })
  // o rectângulo da âncora vem de um projecto, para o mapa o enquadrar (com
  // o mapa afastado os quatro vértices e a pega central caem no mesmo píxel)
  const ficheiroRect = join(OUT, 'ancora-rect.json')
  writeFileSync(
    ficheiroRect,
    JSON.stringify({
      version: 2,
      missionName: 'ancora-rect',
      anchor: {
        center: toLL(1000, 1000),
        length: 500,
        width: 300,
        orientation: 90,
        shape: 'rect',
        cols: 1,
        rows: 1,
      },
      ring: [toLL(750, 850), toLL(1250, 850), toLL(1250, 1150), toLL(750, 1150)],
      areaOrigin: 'anchor',
    }),
  )
  await projectFile(page).setInputFiles(ficheiroRect)
  await page.waitForTimeout(1000)
  const handles = page.locator('.vertex-handle')
  check('âncora editada: o rectângulo tem 4 vértices editáveis', (await handles.count()) === 4)
  await dragMarker(page, handles.first(), 60, 40)
  const editado = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'ancora-editado.kml')),
  )
  const rect = [...lados(editado)]
  check(
    'âncora editada: o anel deixou de ser um rectângulo (um vértice mexeu)',
    rect.length === 4 && Math.abs(rect[0] - rect[2]) > 20,
    rect.map((v) => v.toFixed(0)).join(' '),
  )
  await page.waitForTimeout(1200) // autosave
  await page.reload({ waitUntil: 'domcontentloaded' })
  await esperaArea(page)
  const recarregado = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'ancora-recarregado.kml')),
  )
  check(
    'âncora editada: o vértice arrastado sobrevive ao recarregar',
    mesmoAnel(editado, recarregado),
    `${editado.length} vs ${recarregado.length} vértices`,
  )
  // mover a área inteira mantém a forma editada
  await configure(page, { split: 'Quadrícula' })
  const pega = page.locator('.anchor-handle')
  check('âncora editada: há pega central', (await pega.count()) === 1)
  await dragMarker(page, pega, 100, 50)
  const movido = kmlRing(
    await panelExport(page, await headerKml(page), join(OUT, 'ancora-movido.kml')),
  )
  const l1 = lados(recarregado)
  const l2 = lados(movido)
  check(
    'âncora editada: mover a área mantém a forma editada',
    movido.length === recarregado.length && l1.every((v, i) => Math.abs(v - l2[i]) < 1),
    `${l1.map((v) => v.toFixed(0)).join(' ')} vs ${l2.map((v) => v.toFixed(0)).join(' ')}`,
  )
  check('âncora editada: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// M3-C3: «Usar todas as partes como células» não era gravado: ao recarregar
// ficava só a maior parte, e a parte pequena saía do plano sem aviso.
await scenario('partes-como-celulas-sobrevivem', async () => {
  const { page, errors } = await openMission({ area: fx.multi, dem: false })
  await page.getByRole('button', { name: /Usar todas as partes|Use all parts/ }).click()
  await page.waitForTimeout(1500) // autosave
  await exportReady(page)
  const antes = await readRoutes(await exportKmz(page, join(OUT, 'partes-antes.zip')))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await esperaArea(page)
  await exportReady(page)
  const depois = await readRoutes(await exportKmz(page, join(OUT, 'partes-depois.zip')))
  check(
    'partes como células: depois de recarregar continuam 3 voos',
    antes.length === 3 && depois.length === 3,
    `${antes.length} → ${depois.length}`,
  )
  // na secção «Área e relevo», onde estava
  await abrirNoPainel(page, 'area')
  check(
    'partes como células: o botão das partes não volta a aparecer',
    (await page.getByRole('button', { name: /Usar todas as partes|Use all parts/ }).count()) === 0,
  )
  check('partes como células: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// M3-C6: com o armazenamento recusado (dados de sites bloqueados) a página
// ficava em branco ao ler a língua.
await scenario('armazenamento-recusado-abre', async () => {
  const { page, errors } = await openMission({
    disclaimer: false,
    initScript: () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
    },
  })
  await page.waitForTimeout(2000)
  const filhos = await page.locator('#root').evaluate((r) => r.childElementCount)
  check(
    'armazenamento recusado: a aplicação abre',
    filhos > 0 && /DJI Mission Planner/.test(await bodyText(page)),
  )
  // a gravação automática falhou: o projecto do cabeçalho di-lo
  const projecto = await page.evaluate(
    () =>
      document
        .querySelector(
          'header button[aria-label^="Projecto "], header button[aria-label^="Project "]',
        )
        ?.getAttribute('aria-label') ?? '',
  )
  check(
    'armazenamento recusado: o cabeçalho diz que o projecto não está gravado',
    /, (não gravado|not saved)$/.test(projecto),
    projecto,
  )
  check('armazenamento recusado: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// M3-C4: sem rede, o bloco do relatório que não chega apagava a aplicação
// inteira; agora a janela diz que não abriu e «Fechar» repõe o planeador.
await scenario('relatorio-sem-bloco-nao-apaga-a-app', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false, abort: /MissionReport-/ })
  await exportReady(page)
  await page
    .getByRole('button', { name: /Relatório|Report/ })
    .first()
    .click()
  const boundary = page.getByTestId('error-boundary-window')
  await boundary.waitFor({ state: 'visible', timeout: 20000 })
  check(
    'bloco em falta: a fronteira de erro diz que a janela não abriu',
    /não abriu|could not open/.test(await boundary.innerText()),
  )
  await boundary.getByRole('button', { name: /^Fechar$|^Close$/ }).click()
  await page.waitForTimeout(500)
  check(
    'bloco em falta: o planeador continua, com o botão de exportar',
    (await headerExport(page).count()) === 1 &&
      (await page.getByTestId('error-boundary-window').count()) === 0,
  )
  // o único erro admissível é o do próprio bloco que não chegou
  const outros = errors.filter((e) => !/dynamically imported module|Failed to fetch/i.test(e))
  check('bloco em falta: sem outros erros de página', outros.length === 0, outros.join(' | '))
  await page.close()
  return { page }
})

// M3-C5/C7: um projecto gravado com coordenadas que não são números
// deixava a página em branco em todos os arranques; agora é recusado, fica
// numa cópia datada e a aplicação diz porquê.
await scenario('projecto-gravado-malformado', async () => {
  const { page, errors } = await openMission({
    dem: false,
    initScript: () =>
      localStorage.setItem(
        'dji-mission-planner:project:v1',
        JSON.stringify({
          version: 2,
          missionName: 'mau',
          ring: [
            ['a', 'b'],
            ['c', 'd'],
            ['e', 'f'],
          ],
        }),
      ),
  })
  await page.waitForTimeout(1500)
  const filhos = await page.locator('#root').evaluate((r) => r.childElementCount)
  check('projecto malformado: a aplicação abre', filhos > 0)
  check(
    'projecto malformado: diz que o projecto gravado não foi lido e ficou em cópia',
    /não foi lido|could not be read/.test(await bodyText(page)),
  )
  const chaves = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.includes(':recusado:')),
  )
  check('projecto malformado: a cópia datada existe', chaves.length === 1, chaves.join(','))
  check('projecto malformado: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// M3-U5: a checklist de campo era uma para todos os projectos e abria com a
// missão, a plataforma e os itens críticos da missão anterior.
await scenario('checklist-por-projecto', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  const nameInput = page.getByPlaceholder(/nome-da-missao|mission-name/)
  const abrir = async () => {
    await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
    await page.waitForTimeout(500)
  }
  const voltar = async () => {
    await page.getByRole('button', { name: /Voltar ao planeador|Back to planner/ }).click()
    await page.waitForTimeout(300)
  }
  const campoMissao = () =>
    page
      .locator('label', { hasText: /Missão|Mission/ })
      .locator('input')
      .first()
  // o nome da missão está na secção «Missão» (que fica aberta ao voltar)
  await abrirNoPainel(page, 'missao')
  await nameInput.fill('corta-norte')
  await abrir()
  // os itens são caixas (role="checkbox"); a fase aberta é a dos críticos por fazer
  const item = page.locator('button.chk-item:visible').first()
  await item.click()
  check('checklist: o item fica marcado', (await item.getAttribute('aria-checked')) === 'true')
  check(
    'checklist: o campo da missão vem do planeador',
    (await campoMissao().inputValue()) === 'corta-norte',
  )
  // as fases em separadores: as setas mudam de fase (o foco segue) e só o
  // painel da escolhida se vê; um grupo fecha no título e esconde os itens
  await page.getByRole('tab', { name: 'Pré-campo', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  const tabDurante = page.getByRole('tab', { name: 'Durante', exact: true })
  check(
    'checklist: fases em separadores; a seta passa ao Durante e só o painel dele se vê',
    (await tabDurante.getAttribute('aria-selected')) === 'true' &&
      (await tabDurante.evaluate((e) => e === document.activeElement)) &&
      (await page.getByRole('tabpanel').count()) === 1 &&
      (await page.getByRole('tabpanel').getAttribute('aria-labelledby')) ===
        (await tabDurante.getAttribute('id')),
  )
  const grupo = page.getByRole('button', { name: 'Chegada ao local', exact: true })
  const itensDoGrupo = page.locator(`#${await grupo.getAttribute('aria-controls')}`)
  const abertoAntes = await grupo.getAttribute('aria-expanded')
  await grupo.click()
  check(
    'checklist: um grupo fecha no título (aria-expanded) e os itens escondem-se',
    abertoAntes === 'true' &&
      (await grupo.getAttribute('aria-expanded')) === 'false' &&
      !(await itensDoGrupo.isVisible()),
  )
  await grupo.click()
  await page.getByRole('tab', { name: 'Pré-campo', exact: true }).click()
  await page.waitForTimeout(700) // gravação
  // a checklist gravada e o JSON exportado com a forma de sempre (as mesmas
  // chaves, pela mesma ordem): a página nova é uma vista sobre os mesmos dados
  const gravado = JSON.parse(
    await page.evaluate(() => localStorage.getItem('dji-mission-planner:checklist:v1:corta-norte')),
  )
  check(
    'checklist: o registo gravado tem as chaves de sempre, pela mesma ordem',
    Object.keys(gravado).join() === 'missionName,savedAt,checked,missao,voos,gcps,notas' &&
      gravado.checked['pre.0.0'] === true &&
      Object.keys(gravado.missao).join() === 'operador,local,missao,plataforma,data' &&
      Object.keys(gravado.voos[0]).join() ===
        '_id,n,inicio,fim,previsto,duracao,baterias,area,imagens,sensor,meteo,obs' &&
      Object.keys(gravado.gcps[0]).join() === '_id,n,ident,lat,lon,alt,crs,metodo,incerteza,obs',
    JSON.stringify(gravado).slice(0, 200),
  )
  const [dlJson] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Exportar JSON|Export JSON/ }).click(),
  ])
  const exportado = JSON.parse(readFileSync(await dlJson.path(), 'utf8'))
  check(
    'checklist: o JSON exportado tem a forma de sempre (fases, itens e linhas)',
    /^checklist-corta-norte-\d{4}-\d{2}-\d{2}\.json$/.test(dlJson.suggestedFilename()) &&
      Object.keys(exportado).join() === 'idioma,missao,checklist,voos,gcps,notas,exportado_em' &&
      Object.keys(exportado.checklist).join() === 'pre,durante,pos' &&
      Object.keys(exportado.checklist.pre).join() === 'itens,concluidos,total' &&
      Object.keys(exportado.checklist.pre.itens[0]).join() === 'texto,concluido,critico' &&
      exportado.checklist.pre.itens[0].concluido === true &&
      exportado.checklist.pre.concluidos === 1 &&
      exportado.checklist.pre.total +
        exportado.checklist.durante.total +
        exportado.checklist.pos.total ===
        75 &&
      Object.keys(exportado.voos[0]).join() ===
        'n,inicio,fim,previsto,duracao,baterias,area,imagens,sensor,meteo,obs',
    `${dlJson.suggestedFilename()} ${JSON.stringify(exportado).slice(0, 160)}`,
  )
  await voltar()
  await nameInput.fill('corta-sul')
  await abrir()
  check(
    'checklist: outra missão abre com a sua própria checklist, por marcar',
    (await page.locator('button.chk-item:visible').first().getAttribute('aria-checked')) ===
      'false' && (await campoMissao().inputValue()) === 'corta-sul',
  )
  check(
    'checklist: sem faixa de outra missão (a chave é por missão)',
    (await page.getByTestId('checklist-other-mission').count()) === 0,
  )
  await voltar()
  await nameInput.fill('corta-norte')
  await abrir()
  check(
    'checklist: ao voltar à primeira missão os itens marcados voltam',
    (await page.locator('button.chk-item:visible').first().getAttribute('aria-checked')) === 'true',
  )
  await voltar()
  // a checklist antiga (versão anterior, sem chave de missão) é anunciada
  await page.evaluate(() =>
    localStorage.setItem(
      'dji-mission-planner:checklist:v1',
      JSON.stringify({
        missao: { missao: 'antiga-2026', data: '2026-10-14' },
        checked: { x: true },
      }),
    ),
  )
  await nameInput.fill('corta-este')
  await abrir()
  const faixa = page.getByTestId('checklist-other-mission')
  check(
    'checklist: a checklist antiga de outra missão é anunciada',
    (await faixa.count()) === 1 && /antiga-2026/.test(await faixa.innerText()),
  )
  await faixa.getByRole('button', { name: /Começar uma nova|Start a new one/ }).click()
  check(
    'checklist: começar uma nova esquece a antiga',
    (await page.getByTestId('checklist-other-mission').count()) === 0,
  )
  check('checklist: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- o registo de voos com dois escritores ------------------------------
 * O planeador («Operação do dia») marca um voo feito escrevendo a «Hora fim»
 * na linha dele, na chave da checklist da missão. Com a checklist aberta
 * noutro separador, a gravação seguinte dela escrevia por cima das marcas;
 * voltar ao planeador logo a seguir a uma edição perdia-a; e importar os
 * blocos do plano depois de marcar repetia as linhas. */
await scenario('checklist-registo-partilhado', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false, separadores: true })
  await abrirNoPainel(page, 'missao')
  await page.getByPlaceholder(/nome-da-missao|mission-name/).fill('registo-duplo')
  await configure(page, { split: 'Bateria' })
  const CHAVE = 'dji-mission-planner:checklist:v1:registo-duplo'
  const gravado = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), CHAVE)
  const abrir = async () => {
    await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
    await page.waitForTimeout(500)
  }
  const celula = (col, voo) => page.getByLabel(`${col} do voo ${voo}`, { exact: true })
  const espera = async (loc, valor) => {
    for (let i = 0; i < 30 && (await loc.inputValue()) !== valor; i++)
      await page.waitForTimeout(100)
    return (await loc.inputValue()) === valor
  }
  const importar = page.getByRole('button', { name: /Importar blocos do plano/ })
  await abrir()
  await importar.click()
  await page.waitForTimeout(700) // gravação
  const rotulos = ((await gravado())?.voos ?? []).map((l) => l.n)
  check(
    'registo partilhado: importar os blocos escreve uma linha por voo',
    rotulos.length >= 2 && new Set(rotulos).size === rotulos.length && rotulos.every(Boolean),
    rotulos.join(),
  )
  const [v1, v2] = rotulos

  // outro separador (o planeador) marca o 2.º voo: a hora entra logo aqui
  const outro = await page.context().newPage()
  await outro.route('**/*', (route) =>
    route.request().url().startsWith(`http://127.0.0.1:${PORT}/`)
      ? route.continue()
      : route.abort(),
  )
  await outro.goto(`${URL}schema/project-v2.schema.json`)
  const marcarNoOutro = (voo, hora) =>
    outro.evaluate(
      ([k, v, h]) => {
        const g = JSON.parse(localStorage.getItem(k))
        g.voos = g.voos.map((l) => (l.n === v ? { ...l, fim: h } : l))
        localStorage.setItem(k, JSON.stringify(g))
      },
      [CHAVE, voo, hora],
    )
  await marcarNoOutro(v2, '10:42')
  check(
    'registo partilhado: a hora marcada noutro separador aparece na checklist aberta',
    await espera(celula('Hora fim', v2), '10:42'),
  )
  // a edição seguinte da checklist grava a marca de lá e a sua
  await celula('Bateria(s)', v1).fill('B1')
  await page.waitForTimeout(700)
  let g = await gravado()
  const linhaDe = (voo) => g.voos.find((l) => l.n === voo)
  check(
    'registo partilhado: a gravação da checklist guarda a marca do planeador e a sua edição',
    linhaDe(v2).fim === '10:42' && linhaDe(v1).baterias === 'B1',
    JSON.stringify(g.voos.slice(0, 2)),
  )
  // duas escritas do planeador antes de a checklist gravar (marcar e logo
  // desmarcar o mesmo voo: um duplo clique em «Marcar feito»): fica por fazer
  const v3 = rotulos[2]
  await marcarNoOutro(v3, '10:50')
  await page.waitForTimeout(120)
  await marcarNoOutro(v3, '')
  await page.waitForTimeout(900)
  g = await gravado()
  check(
    'registo partilhado: marcar e desmarcar no planeador em menos de 400 ms deixa o voo por fazer',
    linhaDe(v3).fim === '' && (await celula('Hora fim', v3).inputValue()) === '',
    JSON.stringify(linhaDe(v3)),
  )

  // uma marca escrita sem aviso (o evento perdido): a checklist relê antes de
  // gravar, junta-a e mostra-a
  await page.evaluate(
    ([k, v]) => {
      const s = JSON.parse(localStorage.getItem(k))
      s.voos = s.voos.map((l) => (l.n === v ? { ...l, fim: '11:05' } : l))
      localStorage.setItem(k, JSON.stringify(s))
    },
    [CHAVE, v1],
  )
  await celula('Meteo', v2).fill('sol')
  await page.waitForTimeout(700)
  g = await gravado()
  check(
    'registo partilhado: antes de gravar relê a chave e junta a marca que não ouviu',
    linhaDe(v1).fim === '11:05' &&
      linhaDe(v1).baterias === 'B1' &&
      linhaDe(v2).meteo === 'sol' &&
      linhaDe(v2).fim === '10:42' &&
      (await espera(celula('Hora fim', v1), '11:05')),
    JSON.stringify(g.voos.slice(0, 2)),
  )
  // apagar uma hora na checklist (para a reescrever) não a faz voltar
  await celula('Hora fim', v1).fill('')
  await page.waitForTimeout(900)
  g = await gravado()
  check(
    'registo partilhado: uma hora apagada na checklist fica apagada',
    linhaDe(v1).fim === '' && (await celula('Hora fim', v1).inputValue()) === '',
  )
  // a chave tem as mesmas chaves, pela mesma ordem, e nenhuma linha repetida
  await importar.click()
  await page.waitForTimeout(700)
  g = await gravado()
  const depois = g.voos.map((l) => l.n)
  check(
    'registo partilhado: importar depois de marcar não repete as linhas',
    depois.join() === rotulos.join() && linhaDe(v2).fim === '10:42',
    depois.join(),
  )
  check(
    'registo partilhado: o registo gravado tem a forma de sempre',
    Object.keys(g).join() === 'missionName,savedAt,checked,missao,voos,gcps,notas' &&
      g.voos.every(
        (l) =>
          Object.keys(l).join() ===
          '_id,n,inicio,fim,previsto,duracao,baterias,area,imagens,sensor,meteo,obs',
      ),
  )

  // voltar ao planeador logo a seguir a uma edição (antes dos 400 ms) não a
  // perde: a página sai e a gravação por fazer faz-se logo (antes, sair
  // cancelava-a; a espera abaixo não a salvaria). O clique vai pelo DOM: o
  // do Playwright rola até ao botão e espera que pare, e isso pode passar
  // dos 400 ms
  await celula('Bateria(s)', v2).fill('B7')
  await page
    .getByRole('button', { name: /Voltar ao planeador|Back to planner/ })
    .evaluate((b) => b.click())
  await page.waitForTimeout(300)
  g = await gravado()
  check(
    'registo partilhado: voltar ao planeador logo a seguir grava a edição',
    linhaDe(v2).baterias === 'B7',
    JSON.stringify(linhaDe(v2)),
  )
  // nem recarregar o separador (pagehide)
  await abrir()
  await celula('Sensor', v2).fill('P1')
  await page.reload({ waitUntil: 'domcontentloaded' })
  g = await gravado()
  check(
    'registo partilhado: recarregar logo a seguir grava a edição',
    linhaDe(v2).sensor === 'P1' && linhaDe(v2).baterias === 'B7' && linhaDe(v2).fim === '10:42',
    JSON.stringify(linhaDe(v2)),
  )
  check('registo partilhado: sem erros de página', errors.length === 0, errors.join(' | '))
  await outro.close()
  await page.close()
  await page.context().close()
  return { page }
})

/* ---- a folha A4 de uma base com muitos voos -------------------------------
 * Com a distância VLOS a 2500 m e o relevo global plano, uma base fica com os
 * voos todos: a folha não cabe numa página nem com a letra reduzida. Saía em
 * duas, cortada a meio dos críticos e com «(1 de 1)» no rodapé; pagina-se de
 * propósito, com o número de cada página. */
await scenario('ficha-base-muitos-voos', async () => {
  const { page, errors } = await openMission({
    area: fx.rect,
    dem: false,
    initScript: () => {
      try {
        localStorage.setItem(
          'dji-mission-planner:equipment',
          JSON.stringify({ aircraft: { M3E: { vlosM: 2500 } } }),
        )
      } catch {
        /* armazenamento recusado: o cenário falha no número de voos */
      }
    },
  })
  await exportReady(page)
  await configure(page, { split: 'Bateria' })
  await proposeAndWait(page)
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  const cartoes = page.getByTestId('base-sheet-card')
  await cartoes.first().waitFor({ timeout: 10000 })
  // a base com mais voos (o nome do cartão diz-os todos)
  const nomes = await cartoes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const nVoos = nomes.map((n) => (n.match(/[A-Z]-\d+/g) ?? []).length)
  const i = nVoos.indexOf(Math.max(...nVoos))
  await cartoes.nth(i).click()
  const folha = page.getByTestId('sheet-view').getByTestId('base-sheet')
  await folha.waitFor({ timeout: 10000 })
  const P = Number(await folha.getAttribute('data-pages'))
  const paginas = folha.locator('.chk-ficha-pagina')
  const rodapes = await paginas.evaluateAll((els) =>
    els.map((e) => e.querySelector('[data-rodape]')?.textContent ?? ''),
  )
  const linhas = await folha
    .getByTestId('base-sheet-flight')
    .evaluateAll((els) => els.map((e) => e.dataset.flight))
  check(
    'folha com muitos voos: em várias páginas, cada uma com o seu número no rodapé',
    nVoos[i] >= 15 &&
      P >= 2 &&
      (await paginas.count()) === P &&
      rodapes.every((r, k) => r.includes(`página ${k + 1} de ${P}`)) &&
      // a tabela dos voos partida entre linhas: cada voo uma vez, pela ordem
      linhas.length === nVoos[i] &&
      new Set(linhas).size === linhas.length,
    `${nVoos[i]} voos, ${P} páginas | ${rodapes.map((r) => r.slice(-40)).join(' / ')}`,
  )
  // impressa, sai nessas páginas (um bloco cortado daria uma a mais)
  const pdf = await page.pdf({ format: 'A4' })
  check(
    'folha com muitos voos: imprime-se nas páginas que o rodapé diz',
    paginasPdf(pdf) === P,
    `${paginasPdf(pdf)} páginas no PDF, ${P} na folha`,
  )
  check('folha com muitos voos: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- M3-T3: a ligação do App às verificações de segurança -------------- */
/** Importa um MDT pela interface e espera que o relevo fique carregado. */
async function importDem(page, file) {
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')].find((b) =>
        /Importar MDT|Import DTM/.test(b.textContent),
      )
      return b && !b.disabled
    },
    null,
    { timeout: 15000 },
  )
  await page.locator('input[accept=".tif,.tiff"]').setInputFiles(file)
  await page.waitForFunction(
    () => {
      const l = [...document.querySelectorAll('label')].find((l) =>
        /Seguir terreno|Follow terrain/.test(l.textContent),
      )
      const i = l?.querySelector('input')
      return i && !i.disabled
    },
    null,
    { timeout: 20000 },
  )
}

// um MDT com um disco de 150 m sem dados debaixo da rota: o preflight
// bloqueia (terrain-holes), diz quantos pontos e onde, e o KMZ fica
// desactivado; com o MDT íntegro o bloqueio desaparece
await scenario('preflight-bloqueia-buracos-no-mdt', async () => {
  const { page, errors } = await openMission({ area: fx.rect, demFile: fx.demHole })
  // a seguir o terreno (a rota plana entrava nas colinas): o único bloqueio
  // é o dos buracos
  await configure(page, { tf: true })
  await page.waitForTimeout(1500)
  const pill = page.getByTestId('preflight-pill')
  const exportBtn = headerExport(page)
  check(
    'buracos: um disco sem dados debaixo da rota é um bloqueio e o KMZ fica desactivado',
    (await pill.count()) === 1 &&
      /1 bloqueio|1 blocker/.test(await pillText(page)) &&
      !(await exportBtn.isEnabled()),
    await pillText(page),
  )
  await pill.click()
  const txt = await page.getByTestId('preflight-list').innerText()
  const m = /Sem relevo em (\d+) de (\d+) pontos|No elevation data at (\d+) of (\d+)/.exec(txt)
  const n = Number(m?.[1] ?? m?.[3])
  const total = Number(m?.[2] ?? m?.[4])
  check(
    'buracos: a lista diz quantos pontos da rota ficam sem relevo e o primeiro onde',
    Boolean(m) && /38\.7\d+, -9\.1\d+/.test(txt),
    txt.replace(/\s+/g, ' ').slice(0, 220),
  )
  // o disco é uma pequena parte da rota, não a rota toda (nem um só ponto)
  check(
    'buracos: são os pontos do disco, uma pequena parte da rota',
    n >= 5 && n < total * 0.2,
    `${n} de ${total}`,
  )
  // o primeiro ponto sem dados está no disco
  const at = /(38\.7\d+), (-9\.1\d+)/.exec(txt)
  const [ax, ay] = at ? toM(Number(at[2]), Number(at[1])) : [NaN, NaN]
  check(
    'buracos: o ponto anunciado está dentro do disco (±1 passo de 40 m)',
    Math.hypot(ax - HOLE.x, ay - HOLE.y) <= HOLE.r + 45,
    `(${ax.toFixed(0)}, ${ay.toFixed(0)}) m, disco em (${HOLE.x}, ${HOLE.y}) r ${HOLE.r}`,
  )
  await importDem(page, fx.dem)
  await exportReady(page)
  check(
    'buracos: com o MDT íntegro o bloqueio desaparece',
    semBloqueio(await pillText(page)),
    await pillText(page),
  )
  check('buracos: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// a base na planície (150 m) a oeste da cumeada estreita das MESAS (95 m, em
// x = 850), fora do alto de oeste: o trânsito «safely» faz-se à altura do
// 1.º waypoint (40 m sobre a cota da zona) e entra na cumeada — bloqueio
// transit-collision, com o voo; a 150 m passa por cima e o bloqueio desaparece
await scenario('preflight-bloqueia-transito-atras-da-cumeada', async () => {
  const { page, errors } = await openMission({ dem: false })
  const ficheiro = join(OUT, 'transito-cumeada.json')
  writeFileSync(
    ficheiro,
    JSON.stringify({
      version: 2,
      missionName: 'transito-cumeada',
      ring: hillRing.slice(0, 4),
      params: { altitude: 40 },
      bases: [{ id: 'base-a', label: 'A', point: toLL(650, 850) }],
    }),
  )
  await projectFile(page).setInputFiles(ficheiro)
  await page.waitForTimeout(1000)
  await importDem(page, fx.demMesas)
  await configure(page, { split: 'Quadrícula' })
  const nBlocks = await page.getByTestId('block-row').count()
  check('trânsito: dois blocos de 250 m, com a base A', nBlocks === 2, `${nBlocks} blocos`)
  await page.waitForTimeout(1500)
  const pill = page.getByTestId('preflight-pill')
  const exportBtn = headerExport(page)
  check(
    'trânsito: a 40 m atrás da cumeada é um bloqueio e o KMZ fica desactivado',
    (await pill.count()) === 1 &&
      /1 bloqueio|1 blocker/.test(await pillText(page)) &&
      !(await exportBtn.isEnabled()),
    await pillText(page),
  )
  await pill.click()
  const txt = await page.getByTestId('preflight-list').innerText()
  const m =
    /deslocação entre a base e a rota \(voo (A-\d)\) entra no relevo: (\d+(?:\.\d)?) m abaixo do solo a (\d+) m acima da base|transit between the home point and the route \(flight (A-\d)\) goes into the terrain: (\d+(?:\.\d)?) m below ground at (\d+) m above the home point/.exec(
      txt,
    )
  const abaixo = Number(m?.[2] ?? m?.[5])
  const altura = Number(m?.[3] ?? m?.[6])
  check(
    'trânsito: a lista nomeia o voo, quanto entra no relevo e a altura do trânsito',
    Boolean(m) && altura === 40,
    txt.replace(/\s+/g, ' ').slice(0, 260),
  )
  // a cumeada tem 95 m sobre a planície: a 40 m, ~55 m abaixo do topo
  check(
    'trânsito: entra ~55 m no relevo (cumeada de 95 m a 40 m de altura)',
    abaixo >= 45 && abaixo <= 60,
    `${abaixo} m`,
  )
  const alt = page
    .locator('label', { hasText: /Altura acima da descolagem|Altura AGL|Altitude/ })
    .locator('input')
  await abrirNoPainel(page, 'voo')
  await alt.fill('150')
  await alt.press('Tab')
  await page.waitForTimeout(1500)
  check(
    'trânsito: a 150 m passa por cima da cumeada e o bloqueio desaparece',
    semBloqueio(await pillText(page)),
    await pillText(page),
  )
  check('trânsito: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// M4T térmica: cada acção de foto do KMZ leva a lente ir (payloadLensIndex);
// a larga leva wide; os enums da aeronave e do payload são os do M4T
await scenario('m4t-termica-exporta-lente-ir', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  const sel = (v) =>
    page
      .locator('select')
      .filter({ has: page.locator(`option[value="${v}"]`) })
      .first()
  // a aeronave e o sensor, na secção «Missão»
  await abrirNoPainel(page, 'missao')
  await sel('M4T').selectOption('M4T')
  await openDrawer(page, 'missao')
  await sel('M4T_THERMAL').selectOption('M4T_THERMAL')
  await closeDrawer(page)
  await exportReady(page)
  const lentes = (w) => {
    const fotos = (w.match(/<wpml:actionActuatorFunc>takePhoto</g) ?? []).length
    const ir = (w.match(/<wpml:payloadLensIndex>ir</g) ?? []).length
    const wide = (w.match(/<wpml:payloadLensIndex>wide</g) ?? []).length
    return { fotos, ir, wide }
  }
  const termica = await readRoutes(await exportKmz(page, join(OUT, 'm4t-termica.kmz')))
  const t = lentes(termica[0].wpml)
  check(
    'M4T térmica: todas as acções de foto levam a lente ir',
    t.fotos > 0 && t.ir === t.fotos && t.wide === 0,
    `${t.ir} ir, ${t.wide} wide, ${t.fotos} fotos`,
  )
  check(
    'M4T térmica: enums da aeronave (99) e do payload (89) no KMZ',
    /<wpml:droneEnumValue>99</.test(termica[0].wpml) &&
      /<wpml:payloadEnumValue>89</.test(termica[0].wpml),
  )
  await openDrawer(page, 'missao')
  await sel('M4T_WIDE').selectOption('M4T_WIDE')
  await closeDrawer(page)
  await exportReady(page)
  const larga = await readRoutes(await exportKmz(page, join(OUT, 'm4t-larga.kmz')))
  const l = lentes(larga[0].wpml)
  check(
    'M4T larga: todas as acções de foto levam a lente wide',
    l.fotos > 0 && l.wide === l.fotos && l.ir === 0,
    `${l.wide} wide, ${l.ir} ir, ${l.fotos} fotos`,
  )
  check('M4T: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// divisão por bateria com prolongamento de 30 m, fiada de amarração e margem
// de 10 %: o que cada célula voa além do quadrado conta no lado (M2-G1) — a
// duração de cada KMZ, com o trânsito de uma base no canto, cabe no tempo
// útil, e há mais blocos do que sem estes extras
await scenario('bateria-com-prolongamento-fiada-e-margem', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await configure(page, { tf: true, split: 'Bateria' })
  // 12 min de tempo útil: o lado fica pela bateria, abaixo do tecto de 500 m
  // (só assim os extras encolhem os quadrados; a margem do bloco, 5 % do
  // lado para cada lado, cabia nos 25 min sem mexer no lado)
  await page.getByTestId('mission-useful').fill('12')
  await page.getByTestId('mission-useful').press('Tab')
  await page.waitForTimeout(800)
  const useful = Number(await page.getByTestId('mission-useful').inputValue())
  await exportReady(page)
  const base = await readRoutes(await exportKmz(page, join(OUT, 'bateria-simples.zip')))
  await openDrawer(page, 'voo')
  const over = page
    .locator('label', { hasText: /Prolongamento por faixa|Per-line overshoot/ })
    .locator('input')
  await over.fill('30')
  await over.press('Tab')
  await label(page, /Faixa transversal de amarração|Perpendicular tie line/).check()
  await page.getByRole('button', { name: '10%', exact: true }).click()
  // a margem lê-se pelo bloco: metade de 10 % do lado para cada lado, e os
  // vizinhos voam em comum o dobro (cellBuffersM)
  const dica = page.getByTestId('buffer-metres')
  await page.waitForFunction(
    () => /cada bloco/.test(document.querySelector('[data-testid="buffer-metres"]')?.textContent),
    null,
    { timeout: 10000 },
  )
  const m =
    /= (\d+) m para cada lado de cada bloco \(10 % do lado de (\d+) m ÷ 2\): dois blocos vizinhos voam (\d+) m em comum/.exec(
      await dica.innerText(),
    )
  check(
    'bateria: a margem é a do bloco, 5 % do lado para cada lado, e os vizinhos voam 10 % em comum',
    Boolean(m) &&
      Math.abs(Number(m[1]) - 0.05 * Number(m[2])) <= 0.5 &&
      Math.abs(Number(m[3]) - 0.1 * Number(m[2])) <= 1,
    await dica.innerText(),
  )
  await closeDrawer(page)
  await page.waitForTimeout(1500)
  await exportReady(page)
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'bateria-extras.zip')))
  check(
    'bateria: com prolongamento, fiada e margem há mais blocos do que sem',
    routes.length > base.length && base.length >= 2,
    `${routes.length} vs ${base.length}`,
  )
  // o modelo do lado (squareSideWithBaseTransit): uma base num canto da célula
  // com a zona de 100 m, trânsito (2·100 + (1+√2)·L)/v; o lado L do mosaico é
  // a extensão através das faixas sem a margem, que é a do bloco: 10 % do
  // lado, metade de cada lado (cellBuffersM), logo a extensão é 1,1·L
  const medidas = routes.map((r) => {
    const wps = [...r.wpml.matchAll(/<coordinates>\s*([-\d.]+),([-\d.]+)/g)].map((m) =>
      toM(Number(m[1]), Number(m[2])),
    )
    const xs = wps.map((w) => w[0])
    const ys = wps.map((w) => w[1])
    const ext = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    const v = Number(/<wpml:autoFlightSpeed>([\d.]+)</.exec(r.wpml)?.[1])
    const dur = Number(/<wpml:duration>([\d.]+)</.exec(r.wpml)?.[1])
    const L = Math.max(0, ext / 1.1)
    return { name: r.name, dur, transit: (2 * 100 + (1 + Math.SQRT2) * L) / v, L }
  })
  const pior = medidas.reduce((a, b) => (a.dur + a.transit > b.dur + b.transit ? a : b))
  check(
    'bateria: a duração de cada KMZ, com o trânsito do canto, cabe no tempo útil',
    medidas.every((m) => Number.isFinite(m.dur) && m.dur + m.transit <= useful * 60),
    `pior ${pior.name}: ${pior.dur.toFixed(0)} s + ${pior.transit.toFixed(0)} s de trânsito, útil ${useful * 60} s (L ≈ ${pior.L.toFixed(0)} m)`,
  )
  // e os blocos não são minúsculos: o maior usa pelo menos metade do útil
  check(
    'bateria: o bloco mais longo usa pelo menos metade do tempo útil',
    pior.dur + pior.transit >= useful * 30,
    `${(pior.dur + pior.transit).toFixed(0)} s de ${useful * 60}`,
  )
  check(
    'bateria: no painel o voo mais longo não fica a vermelho',
    (await page.getByTestId('stats-longest').locator('[data-tone]').getAttribute('data-tone')) !==
      'over',
    await page.getByTestId('stats-longest').innerText(),
  )
  check('bateria: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

// erros de importação por código, junto do botão (M3-U18): um KML só com
// o eixo de uma estrada diz que é um eixo e manda para o Corredor; um
// projecto que não abre fica no cartão 1, junto de «Abrir projecto»
await scenario('erros-de-importacao-junto-do-botao', async () => {
  const { page, errors } = await openMission({ dem: false })
  const eixo = join(OUT, 'eixo-estrada.kml')
  writeFileSync(
    eixo,
    `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>EN 2</name>
<LineString><coordinates>${toLL(200, 150).join(',')},0 ${toLL(2700, 1950).join(',')},0</coordinates></LineString>
</Placemark></Document></kml>`,
  )
  const areaInput = page.locator('input[accept=".kml,.geojson,.json,.zip,.kmz"]')
  await areaInput.waitFor({ state: 'attached', timeout: 20000 })
  await areaInput.setInputFiles(eixo)
  await page.waitForTimeout(800)
  const erro = page.getByTestId('import-error')
  check(
    'importação: um KML só com uma linha diz que é um eixo e manda para o Corredor',
    (await erro.count()) === 1 &&
      /tem 1 linha\(s\) mas nenhum polígono|has 1 line\(s\) but no polygon/.test(
        await erro.innerText(),
      ) &&
      /Corredor|Corridor/.test(await erro.innerText()),
    (await erro.innerText().catch(() => '')).slice(0, 160),
  )
  check(
    'importação: o erro está no cartão 2, junto de «Importar área»',
    (await page.getByTestId('card-area').getByTestId('import-error').count()) === 1,
  )
  // em inglês a mesma mensagem traduzida (não o português cru)
  await page.getByTitle(/English/).click()
  await page.waitForTimeout(300)
  const en = await erro.innerText().catch(() => '')
  check(
    'importação: em EN a mensagem é a tradução, não o português cru',
    /has 1 line\(s\) but no polygon/.test(en) && /Corridor/.test(en),
    en.slice(0, 120),
  )
  await page.getByTitle(/Português/).click()
  await page.waitForTimeout(300)
  // um projecto que não abre: erro no cartão 1, junto do botão
  const mau = join(OUT, 'projecto-mau.json')
  writeFileSync(mau, JSON.stringify({ version: 2, ring: 'x' }))
  await projectFile(page).setInputFiles(mau)
  await page.waitForTimeout(600)
  check(
    'projecto: o erro de um projecto que não abre está no cartão 1, junto de «Abrir projecto»',
    (await page.getByTestId('card-missao').getByTestId('project-error').count()) === 1,
  )
  // pelo menu do projecto do cabeçalho, noutro separador (o cartão 1 não se
  // vê): o erro aparece por baixo do cabeçalho e o separador não muda; o ✕
  // fecha-o, e um projecto que abre tira-o
  await modo(page, /^Face$/)
  const ficheiroCab = page.getByTestId('header-project-file')
  await ficheiroCab.setInputFiles(mau)
  await page.waitForTimeout(600)
  const faixa = page.getByTestId('header-project-error')
  const faixaTxt = await faixa.innerText().catch(() => '')
  check(
    'projecto: aberto pelo cabeçalho na Face, o erro aparece por baixo do cabeçalho',
    (await faixa.isVisible()) &&
      (await faixa.getAttribute('role')) === 'alert' &&
      /não é um projecto do planeador/.test(faixaTxt) &&
      (await page.getByTestId('card-fachada-1').isVisible()),
    faixaTxt.slice(0, 120),
  )
  await faixa.getByRole('button', { name: /Fechar|Close/ }).click()
  const fechada = (await faixa.count()) === 0
  await ficheiroCab.setInputFiles(mau)
  await page.waitForTimeout(600)
  const deNovo = await faixa.isVisible()
  const bom = join(OUT, 'projecto-face.json')
  writeFileSync(bom, JSON.stringify({ version: 2, missionName: 'face-ok', missionMode: 'face' }))
  await ficheiroCab.setInputFiles(bom)
  await page.waitForTimeout(600)
  const depois = await faixa.count()
  check(
    'projecto: o ✕ fecha a faixa do erro, e um projecto que abre tira-a',
    fechada && deNovo && depois === 0,
    `fechada: ${fechada}, de novo: ${deNovo}, depois do projecto bom: ${depois}`,
  )
  check('importação: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- uma base sem blocos: a zona dela a partir do painel ---------------- */
// Sem divisão em voos não há blocos a atribuir («Atribuir blocos a esta base»
// não aparece); escolher a base, o que desenha a zona dela no mapa, faz-se
// no detalhe dela com «Mostrar a zona no mapa», como um clique no marcador.
await scenario('base-sem-blocos-mostra-zona', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  const marcar = marcarBase(page, 'mapa')
  await marcar.click()
  await clickMap(page, 900, 1400)
  if ((await marcar.getAttribute('aria-pressed')) === 'true') await marcar.click()
  await zonesReady(page)
  const linha = page.locator('[data-testid="base-row"][data-base-label="A"]')
  const abrir = linha.locator('th button')
  await revelar(page, abrir)
  if ((await abrir.getAttribute('aria-expanded')) === 'false') await abrir.click()
  const mostrar = linha.getByTestId('base-show-zone')
  check(
    'base sem blocos: no detalhe, «Mostrar a zona no mapa» em vez de «Atribuir blocos a esta base»',
    (await linha.getByTestId('base-gather').count()) === 0 &&
      (await mostrar.isVisible()) &&
      (await mostrar.innerText()).trim() === 'Mostrar a zona no mapa' &&
      /zona de descolagem da base A/.test((await mostrar.getAttribute('title')) ?? ''),
    `${await linha.getByTestId('base-gather').count()} · ${await mostrar.getAttribute('title')}`,
  )
  // a zona são círculos no mapa (o raio pedido a tracejado, se reduzido)
  const caminhos = () => page.locator('.leaflet-overlay-pane svg path').count()
  const estado = async () => ({
    premido: await mostrar.getAttribute('aria-pressed'),
    caminhos: await caminhos(),
  })
  // acabada de marcar, a base fica escolhida: a zona está à vista
  const marcada = await estado()
  await mostrar.click()
  const escondida = await estado()
  await mostrar.click()
  const mostrada = await estado()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const comEsc = await estado()
  check(
    'base sem blocos: «Mostrar a zona no mapa» liga e desliga a zona (aria-pressed), e Esc esconde-a',
    marcada.premido === 'true' &&
      escondida.premido === 'false' &&
      escondida.caminhos < marcada.caminhos &&
      mostrada.premido === 'true' &&
      mostrada.caminhos === marcada.caminhos &&
      comEsc.premido === 'false' &&
      comEsc.caminhos === escondida.caminhos,
    JSON.stringify({ marcada, escondida, mostrada, comEsc }),
  )
  check('base sem blocos: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- impressões digitais (repartição do App.jsx) ------------------------- */
// Um projecto fixo por modo; do que a interface mostra e exporta guarda-se
// uma impressão (tests/e2e/impressoes.mjs) que cada passo da repartição do
// App.jsx em hooks e componentes tem de reproduzir. Os projectos entram pelo
// armazenamento, em coordenadas exactas, para não dependerem de cliques no
// mapa; a área com bases segue o caminho do operador (mosaico por bateria,
// «Propor bases»), sobre o MDT do cenário.

const PENDENTE = /A carregar o relevo…|A propor bases…|a calcular…/

/** O que os painéis mostram: preflight, métricas, bases e blocos. */
const lerEcra = (page) =>
  page.evaluate((pend) => {
    const limpo = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
    const txt = (sel) => limpo(document.querySelector(sel)?.innerText)
    const todos = (sel) => [...document.querySelectorAll(sel)].map((e) => limpo(e.innerText))
    return {
      pendente: new RegExp(pend).test(document.body.innerText),
      preflight: txt('[data-testid="preflight-list"]'),
      metricas: txt('[data-testid="stats-panel"]'),
      bases: todos('[data-testid="base-row"]'),
      blocos: todos('[data-testid="block-row"]'),
    }
  }, PENDENTE.source)

/**
 * Os painéis estáveis durante 1,5 s, sem nada a meio (relevo, zonas, bacias
 * de visão). O painel da área abre uma secção de cada vez: as bases lêem-se
 * com a secção delas aberta e, no fim, os blocos com a da divisão (numa
 * secção fechada a linha não se lê como o operador a vê); enquanto se
 * espera, os blocos escondidos contam só para ver se mudam.
 */
async function ecraEstavel(page) {
  const area = (await page.getByTestId('card-bases').count()) > 0
  if (area) await abrirNoPainel(page, 'bases')
  // cada base com o detalhe aberto (abre-se na linha da tabela): o texto
  // inteiro da base, como o operador o lê (uma a uma: abrir uma tira-a da
  // lista das fechadas)
  const fechada = page.locator('[data-testid="base-row"] th button[aria-expanded="false"]:visible')
  for (let i = 0; i < 60 && (await fechada.count()) > 0; i += 1) await fechada.first().click()
  if ((await page.getByTestId('preflight-list').count()) === 0)
    await page.getByTestId('preflight-pill').click()
  const toggle = page.getByTestId('stats-toggle')
  if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click()
  const t0 = Date.now()
  let antes = null
  let desde = 0
  while (Date.now() - t0 < 45000) {
    const agora = await lerEcra(page)
    const chave = JSON.stringify(agora)
    if (agora.pendente || chave !== antes) {
      antes = chave
      desde = Date.now()
    } else if (Date.now() - desde >= 1500) {
      const { pendente: _p, ...resto } = agora
      if (area) {
        await abrirNoPainel(page, 'divisao')
        resto.blocos = (await lerEcra(page)).blocos
      }
      return resto
    }
    await page.waitForTimeout(250)
  }
  throw new Error('os painéis não estabilizaram em 45 s')
}

/**
 * Abre a missão, muda o projecto gravado (os objectos fundem-se com os que lá
 * estão, o resto substitui) e recarrega.
 */
async function comProjecto(opts, muda) {
  const { page, errors } = await openMission(opts)
  // o projecto gravado já com a área e sem gravação por fazer (estável 1 s):
  // uma gravação automática atrasada (debounce de 500 ms) num runner lento
  // reescrevia a mudança antes do recarregamento
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('dji-mission-planner:project:v1')
      const agora = performance.now()
      if (!raw || !JSON.parse(raw)?.ring || raw !== window.__projectoAntes) {
        window.__projectoAntes = raw
        window.__projectoDesde = agora
        return false
      }
      return agora - window.__projectoDesde >= 1000
    },
    null,
    { timeout: 20000, polling: 100 },
  )
  await page.evaluate((muda) => {
    const k = 'dji-mission-planner:project:v1'
    const p = JSON.parse(localStorage.getItem(k))
    for (const [key, v] of Object.entries(muda))
      p[key] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(p[key] ?? {}), ...v } : v
    localStorage.setItem(k, JSON.stringify(p))
  }, muda)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('preflight-pill').waitFor({ state: 'attached', timeout: 20000 })
  return { page, errors }
}

const BASE_A = { id: 'imp-a', label: 'A', point: toLL(700, 700), radiusM: null }

/** Exporta pelo botão do cabeçalho e junta a impressão do ficheiro à do ecrã. */
async function impressaoModo(page, ficheiro) {
  await exportReady(page)
  const ecra = await ecraEstavel(page)
  const btn = headerExport(page)
  const [nome, f] = await download(page, btn, join(OUT, ficheiro))
  // o rótulo diz o que saiu: «(KMZ)», ou «(ZIP)» com vários voos
  check(
    'cabeçalho: o rótulo diz o tipo do ficheiro que saiu',
    await rotuloCondiz(btn, nome),
    `${(await btn.innerText()).trim()} → ${nome}`,
  )
  return { ...ecra, kmz: await impressaoFicheiro(f) }
}

await scenario('impressao-area-bases', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
  await abrirNoPainel(page, 'missao')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await proposeAndWait(page)
  await zonesReady(page)
  const agora = await impressaoModo(page, 'impressao-area-bases.zip')
  // as exportações por voo e por base, no «Resumo e exportar»
  await abrirNoPainel(page, 'resumo')
  const panel = page.getByTestId('flight-exports')
  const [, kml] = await download(
    page,
    panel.getByTestId('export-bases-kml'),
    join(OUT, 'impressao-bases.kml'),
  )
  const [, porBase] = await download(
    page,
    panel.getByTestId('export-kml-by-base'),
    join(OUT, 'impressao-kml-por-base.zip'),
  )
  const [, kmlTodos] = await download(
    page,
    panel.getByTestId('export-kml-all'),
    join(OUT, 'impressao-kml-todos.zip'),
  )
  agora.basesKml = await impressaoFicheiro(kml)
  agora.kmlPorBase = await impressaoFicheiro(porBase)
  agora.kmlTodos = await impressaoFicheiro(kmlTodos)
  conferir('area-bases', agora, check, OUT)
  check('impressão da área com bases: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('impressao-area-simples', async () => {
  const { page, errors } = await openMission({ area: fx.hill, dem: false })
  const agora = await impressaoModo(page, 'impressao-area.kmz')
  agora.kml = await impressaoFicheiro(
    await panelExport(page, await headerKml(page), join(OUT, 'impressao-area.kml')),
  )
  conferir('area-simples', agora, check, OUT)
  check('impressão da área simples: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('impressao-corredor-partido', async () => {
  const { page, errors } = await comProjecto(
    { area: fx.rect, dem: false },
    {
      missionMode: 'corridor',
      corridorConfig: {
        centreline: [toLL(300, 300), toLL(1500, 900), toLL(2600, 1700)],
        bufferM: 250,
        split: 'battery',
      },
      bases: [BASE_A, { id: 'imp-b', label: 'B', point: toLL(2650, 1800), radiusM: null }],
    },
  )
  conferir('corredor-partido', await impressaoModo(page, 'impressao-corredor.zip'), check, OUT)
  check('impressão do corredor: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('impressao-face', async () => {
  const { page, errors } = await comProjecto(
    { area: fx.rect, dem: false },
    {
      missionMode: 'face',
      faceConfig: {
        baseline: [toLL(800, 800), toLL(880, 800), toLL(880, 860)],
        heightM: 20,
        standoffM: 15,
        side: 'left',
        capture: 'multi',
        takeoffBaseId: BASE_A.id,
      },
      bases: [BASE_A],
    },
  )
  conferir('face', await impressaoModo(page, 'impressao-face.kmz'), check, OUT)
  check('impressão da face: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

for (const [caso, orbita] of [
  ['orbita-video', { capture: 'video', levelCount: 2, levelStepM: 15 }],
  ['orbita-varias', { capture: 'multi', hoverS: 1, takeoffBaseId: BASE_A.id }],
])
  await scenario(`impressao-${caso}`, async () => {
    const { page, errors } = await comProjecto(
      { area: fx.rect, dem: false },
      {
        missionMode: 'orbit',
        orbitConfig: { poi: toLL(1400, 1000), radiusM: 50, ...orbita },
        bases: [BASE_A],
      },
    )
    conferir(caso, await impressaoModo(page, `impressao-${caso}.kmz`), check, OUT)
    check(`impressão ${caso}: sem erros de página`, errors.length === 0, errors.join(' | '))
    await page.close()
    return { page }
  })

await scenario('impressao-circular', async () => {
  const { page, errors } = await comProjecto(
    { area: fx.hill, dem: false },
    { missionMode: 'circular', circularConfig: { enabled: true } },
  )
  conferir('circular', await impressaoModo(page, 'impressao-circular.kmz'), check, OUT)
  check('impressão do circular: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

await scenario('impressao-inspeccao', async () => {
  const { page, errors } = await comProjecto(
    { area: fx.hill, dem: false },
    {
      inspectPoints: [
        { id: 1, point: toLL(1050, 1050), heightM: 30, photo: true },
        { id: 2, point: toLL(1250, 1150), heightM: 45, gimbalPitch: -30, photo: true },
        { id: 3, point: toLL(1450, 1200), heightM: 30, heading: 90, photo: true, hoverS: 2 },
      ],
    },
  )
  await openDrawer(page, 'extras')
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (b) => /^(Exportar KMZ|Export KMZ)$/.test(b.textContent.trim()) && !b.disabled,
      ),
    null,
    { timeout: 40000 },
  )
  const kmz = await impressaoFicheiro(
    await panelExport(page, /^Exportar KMZ$|^Export KMZ$/, join(OUT, 'impressao-inspeccao.kmz')),
  )
  conferir('inspeccao', { kmz }, check, OUT)
  check('impressão da inspecção: sem erros de página', errors.length === 0, errors.join(' | '))
  await page.close()
  return { page }
})

/* ---- fim ----------------------------------------------------------------- */
gravarReferencia()
if (cobertura) await cobertura.recolherAbertas()
await browser.close()
stopServer()
// o relatório da cobertura vem antes do veredicto; se falhar, o comando
// falha, mas as contas do E2E são as mesmas
const coberturaOk = cobertura ? await cobertura.relatorio(join(OUT, 'cobertura')) : true
if (ONLY) {
  const desconhecidos = ONLY.filter((n) => !SCENARIOS.includes(n))
  if (desconhecidos.length) {
    fails += 1
    console.log(`FAIL  E2E_ONLY com cenários que não existem: ${desconhecidos.join(', ')}`)
  }
}
if (passes + fails === 0) {
  fails += 1
  console.log('FAIL  nenhuma verificação correu')
}
console.log(`\n${passes} PASS, ${fails} FAIL`)
if (fails > 0) {
  console.log(`capturas e ficheiros em ${OUT}`)
  process.exit(1)
}
if (!coberturaOk) process.exit(1)
console.log('E2E: TODOS OS CENARIOS PASSARAM')
process.exit(0)
