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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import Ajv2020 from 'ajv/dist/2020.js'
import JSZip from 'jszip'
import * as turf from '@turf/turf'
import { HILL, RIDGE, ground, hillGround, makeFixtures, rectRing, toLL, toM } from './fixtures.mjs'
import { analyseRoute, readRoutes } from './kmz.mjs'

const PORT = Number(process.env.E2E_PORT ?? 4173)
const URL = `http://127.0.0.1:${PORT}/dji-mission-planner/`
const OUT = resolve(process.env.E2E_OUT ?? 'tests/e2e/out')
const AGL_M = 100 // altura AGL por omissao da interface, usada nos cenarios
const TOL_M = 5 // tolerância vertical por omissão do terrain follow

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
  [
    'node_modules/vite/bin/vite.js',
    'preview',
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
  area = null,
  dem = true,
  demFile = null,
  globalTerrain = true,
  disclaimer = true,
}) {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 950 },
    acceptDownloads: true,
  })
  // aviso antes de usar já aceite neste "aparelho" (o cenário do aviso testa-o)
  if (disclaimer)
    await page.addInitScript(() => localStorage.setItem('dji-mission-planner:disclaimer', '2'))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)))
  // só a build local: mapas e fontes externas ficam de fora; o relevo global
  // é um chão plano a 0 m servido aqui (não há exportação sem relevo)
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue()
    if (globalTerrain && /elevation-tiles-prod\/terrarium\//.test(url))
      return route.fulfill({ status: 200, contentType: 'image/png', body: FLAT_TILE })
    return route.abort()
  })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
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
      const b = [...document.querySelectorAll('button')].find((b) =>
        /Exportar WPML|Export Advanced WPML/.test(b.textContent),
      )
      return b && !b.disabled
    },
    null,
    { timeout: 40000 },
  )
}
const DOWNLOAD_GLOBAL = /Descarregar relevo global|Download global terrain/

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
  check(
    'terreno: datum vertical apresentado no painel (MDT sem GeoKeys verticais)',
    /Datum vertical: não declarado|Vertical datum: not declared/.test(await bodyText(page)),
  )
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
await scenario('paragens-waypoints', async () => {
  const { page, errors } = await openMission({ area: fx.u })
  const stops = page
    .locator('label', { hasText: /Paragem nos waypoints|Stop at waypoints/ })
    .locator('select')
  check('paragens: controlo escondido sem pontos intermédios', (await stops.count()) === 0)
  await configure(page, { tf: true })
  check(
    'paragens: com seguimento de terreno aparece, só nos cantos por omissão',
    (await stops.count()) === 1 && (await stops.inputValue()) === 'corners',
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
  await stops.selectOption('all')
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
  // todas as partes como células: um KMZ por parte
  await page.getByRole('button', { name: /Usar todas as partes|Use all parts/ }).click()
  await page.waitForTimeout(800)
  // as outras duas partes ficam fora do MDT importado: sem relevo não há
  // exportação, e o preflight diz porquê e oferece o relevo global
  const pill = page.getByTestId('preflight-pill')
  const exportBtn = page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ })
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
  await page
    .locator('label', { hasText: /Meia-largura|Half-width/ })
    .locator('input')
    .fill('300')
  await page.waitForTimeout(800)
  const txt = await bodyText(page)
  check('corredor: painel mostra as passagens', /passagens|passes/.test(txt))
  const routes = await readRoutes(
    await panelExport(page, /Exportar WPML \(KMZ\)|Export WPML \(KMZ\)/, join(OUT, 'corredor.kmz')),
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

await scenario('circular-sobre-a-area', async () => {
  const { page, errors } = await openMission({ area: fx.rect, dem: false })
  await modo(page, /^Circular$|^Circular$/)
  await page.waitForTimeout(500)
  // o rectângulo de 2,5 x 1,8 km com o raio de 30 m dava milhares de
  // círculos: o painel explica e o KMZ fica desactivado
  let txt = await bodyText(page)
  check(
    'circular: demasiados círculos com o raio por omissão é um erro explicado',
    /Demasiados círculos|Too many circles/.test(txt) &&
      (await page
        .getByRole('button', { name: /Exportar missão única|Export single mission/ })
        .isDisabled()),
  )
  const setField = async (re, value) => {
    const input = page.locator('label', { hasText: re }).locator('input')
    await input.fill(String(value))
    await input.press('Tab')
  }
  await setField(/^Raio|^Radius/, 150)
  await setField(/Sobreposição entre círculos|Circle overlap/, 25)
  await page.waitForTimeout(800)
  txt = await bodyText(page)
  const m = /(\d+) círculos × (\d+) pontos|(\d+) circles × (\d+) points/.exec(txt)
  check('circular: painel mostra círculos e pontos por círculo', Boolean(m), m?.[0])
  check(
    'circular: o conselho de sobreposição aparece com o número de círculos',
    (await page.getByTestId('circular-advice').count()) === 1,
  )
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Exportar missão única|Export single mission/ }).click(),
  ])
  await dl.saveAs(join(OUT, 'circular.kmz'))
  const routes = await readRoutes(join(OUT, 'circular.kmz'))
  const wpml = routes[0].wpml
  const r = analyseRoute(wpml, plano)
  executavel(r)
  const circles = Number(m?.[1] ?? m?.[3])
  const pts = Number(m?.[2] ?? m?.[4])
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
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, -300, 40)
  await clickMap(page, 0, -60)
  await clickMap(page, 300, 40)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  await page
    .locator('label', { hasText: /Meia-largura|Half-width/ })
    .locator('input')
    .fill('200')
  await page.waitForTimeout(800)
  // sem seguimento de terreno o corredor plano entra nas colinas: o preflight
  // bloqueia, e tanto o botão do painel como o do cabeçalho ficam desactivados
  const exportPainel = page.getByRole('button', {
    name: /Exportar WPML \(KMZ\)|Export WPML \(KMZ\)/,
  })
  const exportCabecalho = page.getByRole('button', {
    name: /Exportar WPML Avançado|Export Advanced WPML/,
  })
  check(
    'corredor: rota plana dentro do relevo fica bloqueada no painel e no cabeçalho',
    (await exportPainel.isDisabled()) &&
      (await exportCabecalho.isDisabled()) &&
      /Exportação bloqueada pelo preflight|Export blocked by the preflight/.test(
        await bodyText(page),
      ),
  )
  const tf = page
    .locator('label', { hasText: /cada passagem sobre o seu chão|each pass over its own ground/ })
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
  await modo(page, /^Fachada$|^Face$/)
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, -200, 0)
  await clickMap(page, 200, 0)
  await page.getByRole('button', { name: /^Concluir$|^Finish$/ }).click()
  await page.waitForTimeout(800)
  const routes = await readRoutes(
    await panelExport(page, /Exportar WPML \(KMZ\)|Export WPML \(KMZ\)/, join(OUT, 'fachada.kmz')),
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
  const single = await readRoutes(
    await panelExport(page, /Exportar missão única|Export single mission/, join(OUT, 'orbita.kmz')),
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
  await page.getByRole('radio', { name: /Vídeo|Video/ }).click()
  await page.waitForTimeout(500)
  const [dlVideo] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Exportar missão única|Export single mission/ }).click(),
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
  await page.waitForTimeout(800)
  check(
    'projecto: nome e dupla grelha sobrevivem ao recarregar',
    (await nameInput.inputValue()) === 'projecto-e2e' && (await label(page, CROSS).isChecked()),
  )
  const afterReload = await bodyText(page)
  check(
    'projecto: a área volta com o plano calculado',
    /Exportar WPML|Export Advanced WPML/.test(afterReload) &&
      (await page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ }).isEnabled()),
  )

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
  await page.locator('input[accept=".json"]').setInputFiles(file)
  await page.waitForTimeout(800)
  check(
    'projecto: abrir o ficheiro repõe nome, dupla grelha e área',
    (await nameInput.inputValue()) === 'projecto-e2e' &&
      (await label(page, CROSS).isChecked()) &&
      (await page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ }).isEnabled()),
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
  const exportBtn = page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ })
  check(
    'preflight: sem relevo sobre a rota é um bloqueio e o KMZ fica desactivado',
    (await pill.count()) === 1 &&
      /1 bloqueio|1 blocker/.test(await pill.innerText()) &&
      !(await exportBtn.isEnabled()),
    await pill.innerText(),
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
    /Pronto a exportar|Ready to export|0 bloqueios|0 blockers/.test(await pill.innerText()),
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
  await page.locator('.leaflet-control-zoom-out').click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^Desenhar$|^Draw$/ }).click()
  await clickMap(page, -480, 0)
  await clickMap(page, 480, 10)
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
  // só fecha no botão: nem Escape nem um clique fora
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  await page.waitForTimeout(300)
  check('aviso: Escape e clique fora não o fecham', await dlg.isVisible())
  await dlg.getByRole('button', { name: 'en', exact: true }).click()
  check(
    'aviso: muda de língua no próprio aviso',
    /Before you use this app/.test(await dlg.innerText()) &&
      /remote pilot is solely responsible/.test(await dlg.innerText()),
  )
  await dlg.getByRole('button', { name: 'I understand' }).click()
  check('aviso: o botão fecha-o', !(await dlg.isVisible()))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTitle(/Instruções e informação|Instructions and app information/).waitFor()
  await page.waitForTimeout(500)
  check('aviso: aceite, não volta a aparecer neste aparelho', (await dlg.count()) === 0)
  // reaberto da ajuda, para reler; aí fecha com Escape
  await page.getByTitle(/Instruções e informação|Instructions and app information/).click()
  await page.getByRole('button', { name: /^(Acerca|About)$/ }).click()
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
  await page.getByRole('button', { name: /Marcar pontos no mapa|Place points on the map/ }).click()
  await clickMap(page, -80, 20)
  await clickMap(page, 60, -30)
  await page.getByRole('button', { name: /Marcar pontos no mapa|Place points on the map/ }).click()
  const btn = page.getByRole('button', { name: /^Exportar KMZ$|^Export KMZ$/ })
  await page.waitForTimeout(800)
  check(
    'inspecção: sem relevo o KMZ fica desactivado e o painel explica',
    (await btn.count()) === 1 &&
      !(await btn.isEnabled()) &&
      /Sem relevo sobre os pontos|No terrain under the points/.test(await bodyText(page)),
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
    .locator('label', { hasText: /Altitude/ })
    .locator('input')
    .first()
  await alt.fill('30')
  await alt.press('Tab')
  await page.waitForTimeout(900)
  const pill = page.getByTestId('preflight-pill')
  const exportBtn = page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ })
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
      const b = [...document.querySelectorAll('button')].find((b) =>
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
  await configure(page, { split: 'Mosaico' })
  const pega = page.locator('.anchor-handle')
  check('mover: ha pega central numa area importada com mosaico', (await pega.count()) === 1)

  const antes = kmlRing(
    await panelExport(page, /Exportar KML|Export area KML/, join(OUT, 'mover-antes.kml')),
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
    await panelExport(page, /Exportar KML|Export area KML/, join(OUT, 'mover-depois.kml')),
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
    await panelExport(page, /Exportar KML|Export area KML/, join(OUT, 'mover-desfeito.kml')),
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
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
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

  // acerto do dia na missão e volta ao valor da bateria
  await useful.fill('26')
  await page.waitForTimeout(300)
  const reset = page.getByTestId('mission-useful-reset')
  check('equipamento: tempo útil acertado à mão mostra a reposição', await reset.isVisible())
  await reset.click()
  check('equipamento: repor volta ao tempo da bateria', (await useful.inputValue()) === '30')

  // exportar, estragar, importar de volta
  await page.getByTestId('open-settings').click()
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
  await tb65.locator('input[id$="-useful"]').fill('27')
  await tb65.locator('input[id$="-useful"]').press('Tab')
  const importInput = dlg.getByTestId('settings-import')
  await importInput.setInputFiles(fx.rect)
  check(
    'equipamento: um ficheiro que não é de equipamento dá o erro em português',
    /não é uma configuração de equipamento/.test(await dlg.getByRole('alert').innerText()),
  )
  await importInput.setInputFiles(file)
  await page.waitForTimeout(300)
  check(
    'equipamento: importar repõe a configuração exportada',
    (await tb65.locator('input[id$="-useful"]').inputValue()) === '30' &&
      /importada|imported/.test(await dlg.getByRole('status').innerText()),
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

  // repor os valores por omissão pede confirmação
  await page.getByTestId('open-settings').click()
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
/** Nomes dos KMZ dentro de um ZIP, pela ordem em que lá estão. */
const zipOrder = async (file) =>
  Object.keys((await JSZip.loadAsync(readFileSync(file))).files).filter((n) => n.endsWith('.kmz'))
/** Título da missão dentro de um KMZ (o <name> da pasta do template.kml). */
async function kmzTitle(buf) {
  const kmz = await JSZip.loadAsync(buf)
  const tpl = await kmz.file('wpmz/template.kml').async('string')
  return /<Folder>\s*<name>([^<]*)<\/name>/.exec(tpl)?.[1] ?? null
}

await scenario('bases-multiplas', async () => {
  const { page, errors } = await openMission({ area: fx.rect })
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

  await page.getByTestId('propose-bases').click()
  await page.waitForTimeout(1500)
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
  check(
    'bases: o preflight diz que os voos da base A ficaram fora do alcance visual',
    /Voo A-\d+ \(bloco \d+\) fora do alcance visual da base A: \d+ m/.test(lista),
    lista
      .split('\n')
      .filter((l) => /alcance visual/.test(l))
      .slice(0, 2)
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
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await page.getByTestId('propose-bases').click()
  await page.waitForTimeout(1500)
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
  const panel = page.getByTestId('flight-exports')
  check(
    'por base: um botão «Voos da base X (ZIP)» por base com voos',
    (await panel.getByTestId('export-base-flights').count()) === withFlights.length,
  )
  const header = page.getByRole('button', { name: /Exportar WPML|Export Advanced WPML/ })
  check(
    'por base: os botões seguem o preflight do botão do cabeçalho',
    (await panel.getByTestId('export-all-flights').isDisabled()) === (await header.isDisabled()),
  )

  // base B: só os seus voos, pela ordem de voo
  const B = withFlights[1]
  const wantB = order.filter((f) => f.startsWith(`${B.label}-`))
  const [zipB, fileB] = await download(
    page,
    panel.locator(`[data-testid="export-base-flights"][data-base-label="${B.label}"]`),
    join(OUT, 'base-B.zip'),
  )
  const prefix = zipB.replace(new RegExp(`_base-${B.label}\\.zip$`), '')
  const inB = await zipOrder(fileB)
  check(
    `por base: ZIP «…_base-${B.label}.zip»`,
    zipB.endsWith(`_base-${B.label}.zip`) && /_area-tf$/.test(prefix),
    zipB,
  )
  check(
    `por base: o ZIP da base ${B.label} só tem os voos dela, pela ordem de voo`,
    inB.map(flightOfFile).join(',') === wantB.join(','),
    `${inB.join(' ')} / ${wantB.join(' ')}`,
  )
  check(
    'por base: cada KMZ chama-se <missão>_area-tf_<voo>.kmz',
    inB.every((n) => n.startsWith(`${prefix}_${B.label}-`) && /^[\w-]+\.kmz$/.test(n)),
    inB.join(' '),
  )
  const zip = await JSZip.loadAsync(readFileSync(fileB))
  const titles = await Promise.all(
    inB.map(async (n) => kmzTitle(await zip.file(n).async('nodebuffer'))),
  )
  check(
    'por base: o título da missão no KMZ é o nome do ficheiro',
    titles.every((t, i) => t === inB[i].replace(/\.kmz$/, '')),
    titles.join(' '),
  )
  const routesB = await readRoutes(fileB)
  const refB = routesB.map((x) => {
    const a = analyseRoute(x.wpml, { toM, ground, aglNominalM: AGL_M })
    return Math.max(...a.points.map(([px, py, h]) => AGL_M + ground(px, py) - h))
  })
  check(
    `por base: as alturas dos voos de ${B.label} referem-se à cota da sua zona (±2 m)`,
    refB.every((r) => Math.abs(r - B.ref) <= 2),
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
  const [headName, headFile] = await download(page, header, join(OUT, 'cabecalho.zip'))
  check(
    'todos: o botão do cabeçalho exporta o mesmo ZIP',
    headName === allName && (await zipOrder(headFile)).join() === all.join(),
    headName,
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
    inB.every((n) => kml.includes(n)),
  )

  // checklist de campo: uma ficha por base com voos
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  const sec = page.getByTestId('checklist-bases')
  await sec.waitFor({ timeout: 10000 })
  const sheets = await sec.getByTestId('base-sheet').evaluateAll((els) =>
    els.map((e) => ({
      label: e.dataset.baseLabel,
      text: e.innerText,
      href: e.querySelector('[data-testid="base-sheet-link"]')?.getAttribute('href') ?? '',
      flights: [...e.querySelectorAll('[data-testid="base-sheet-flight"]')].map(
        (r) => r.dataset.flight,
      ),
    })),
  )
  check(
    'checklist: uma ficha por base com voos',
    sheets.map((x) => x.label).join() === withFlights.map((r) => r.label).join(),
    sheets.map((x) => x.label).join(),
  )
  const sB = sheets.find((x) => x.label === B.label)
  check(
    `checklist: ficha da base ${B.label} com coordenadas, ligação, zona, cota, voos e ficheiros`,
    sB &&
      /-?\d+\.\d{6}, -?\d+\.\d{6}/.test(sB.text) &&
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(sB.href) &&
      /descolar até \d+ m do ponto/.test(sB.text) &&
      /voo entre 0 e \+\d+ m acima do planeado/.test(sB.text) &&
      /Alcance visual/i.test(sB.text) &&
      /necessários/.test(sB.text) &&
      sB.flights.join(',') === wantB.join(',') &&
      inB.every((n) => sB.text.includes(n)),
    sB ? sB.text.replace(/\s+/g, ' ').slice(0, 300) : 'sem ficha',
  )
  await page.getByRole('button', { name: /Voltar ao planeador|Back to planner/ }).click()

  // relatório: a mesma ficha
  await page.getByRole('button', { name: /^(Relatório|Report)$/ }).click()
  const rep = page.getByTestId('report-bases')
  await rep.waitFor({ timeout: 10000 })
  check(
    'relatório: ficha por base',
    (await rep.getByTestId('base-sheet').count()) === withFlights.length,
  )
  check('por base: sem erros de página', errors.length === 0, errors.join(' | '))
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
  await page.locator('input[accept=".json"]').setInputFiles(file)
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
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await page.getByTestId('propose-bases').click()
  await page.waitForTimeout(1500)
  const rows0 = await baseRows(page)
  const layout0 = rows0.map((r) => `${r.label}:${r.blocks.join('.')}`).join(' ')
  check('desfazer: a proposta dá pelo menos duas bases', rows0.length >= 2, layout0)

  // 1) atribuição manual: o bloco de A passa para a base seguinte
  const A = rows0[0]
  const blk = A.blocks[0]
  await page.getByTestId('click-mode-assign').click()
  await page.locator(`.block-label [data-block-id="${blk}"]`).click()
  await page.waitForTimeout(1200)
  let rows = await baseRows(page)
  const owner = rows.find((r) => r.blocks.includes(blk))
  check(
    'desfazer: o clique no bloco passa-o para outra base',
    owner && owner.label !== A.label,
    `bloco ${blk}: ${A.label} -> ${owner?.label}`,
  )
  // 2) a base A arrastada
  const ptA0 = (await savedBase(page, 'A'))?.point
  await dragMarker(page, basePin(page, 'A'), 90, 60)
  const ptA1 = (await savedBase(page, 'A'))?.point
  check('desfazer: a base A foi arrastada', ptA0 && ptA1 && ptA0.join() !== ptA1.join())
  // 3) o raio da base B escrito tecla a tecla
  const radius = page.locator(
    `[data-testid="base-row"][data-base-label="${rows0[1].label}"] [data-testid="base-radius"]`,
  )
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
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { tf: true, split: 'Bateria' })
  await page.getByTestId('propose-bases').click()
  await page.waitForTimeout(1500)
  const kml = async (file) =>
    readFileSync(
      (await download(page, page.getByTestId('export-bases-kml'), join(OUT, file)))[1],
      'utf8',
    )
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
  const info = page.getByTestId('bases-carry-lost')
  const lost = (await info.count()) ? Number(await info.getAttribute('data-lost')) : 0
  check(
    'refeito: o painel diz quantas atribuições não passaram',
    lostWanted > 0 &&
      lost === lostWanted &&
      /atribuições manuais não passaram para o novo mosaico/.test(await info.innerText()),
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

// "Propor bases" com um cabeço: sem seguimento de terreno a proposta é a de
// sempre (o ponto médio da aresta comum, no alto); com ele, a cota da zona
// da base deixa os blocos com pelo menos 20 m de altura relativa.
await scenario('propor-bases-evita-cabeco', async () => {
  const { page, errors } = await openMission({ area: fx.hill, demFile: fx.demHill })
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { split: 'Mosaico' })
  check('cabeço: dois quadrados de 250 m', (await page.getByTestId('block-row').count()) === 2)
  const limit = HILL.base + AGL_M - 20 // a planície debaixo dos blocos + AGL − 20 m
  await page.getByTestId('propose-bases').click()
  await page.waitForTimeout(1500)
  let rows = await baseRows(page)
  check(
    'cabeço: sem seguir terreno, a proposta de sempre fica no alto do cabeço',
    rows.length === 1 && rows[0].ref > limit + 20,
    rows.map((r) => `${r.label}:${r.ref}`).join(' '),
  )
  await undo(page)
  check('cabeço: Ctrl+Z retira a proposta', (await baseRows(page)).length === 0)

  await label(page, TF).check()
  await page.waitForTimeout(1200)
  await page.getByTestId('propose-bases').click()
  await page.waitForTimeout(1500)
  rows = await baseRows(page)
  check(
    'cabeço: com seguir terreno, a base fica num sítio baixo (cota ≤ planície + AGL − 20 m)',
    rows.length >= 1 && rows.every((r) => Number.isFinite(r.ref) && r.ref <= limit + 0.5),
    rows.map((r) => `${r.label}:${r.ref}`).join(' '),
  )
  check(
    'cabeço: sem aviso de sítio alto na proposta',
    (await page.getByTestId('bases-proposal-high').count()) === 0,
  )
  await exportReady(page)
  const routes = await readRoutes(await exportKmz(page, join(OUT, 'cabeco.zip')))
  const minRel = Math.min(
    ...routes.flatMap((x) =>
      analyseRoute(x.wpml, { toM, ground: hillGround, aglNominalM: AGL_M }).points.map((q) => q[2]),
    ),
  )
  check(
    'cabeço: nenhum waypoint exportado abaixo de 20 m de altura relativa',
    routes.length === 2 && minRel >= 20 - 0.5,
    `${routes.length} rotas, mínimo ${minRel.toFixed(1)} m`,
  )
  check('cabeço: sem erros de página', errors.length === 0, errors.join(' | '))
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
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="M300RTK"]') })
    .first()
    .selectOption('M300RTK')
  await configure(page, { split: 'Mosaico' })
  const nBlocks = await page.getByTestId('block-row').count()
  check('cumeada: dois blocos de 250 m', nBlocks === 2, `${nBlocks} blocos`)
  check(
    'cumeada: a camada «Bacias de visão» começa desligada',
    (await page.evaluate((k) => localStorage.getItem(k), VIEWSHED_LAYER_KEY)) !== '1' &&
      (await page.locator('.viewshed-hidden').count()) === 0,
  )

  // a base: um clique no mapa, e depois arrastada para a planície a oeste
  // da cumeada (mapa calibrado com a base e a pega do centro da área)
  await page.locator('.leaflet-control-zoom-out').click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /Marcar base|Set base/ }).click()
  await clickMap(page, -250, 0)
  await page.waitForTimeout(1200)
  const centreLL = toLL(1250, 1125)
  const project = async () =>
    mapProjector(
      page,
      { locator: basePin(page, 'A'), lonlat: (await savedBase(page, 'A')).point },
      { locator: page.locator('.anchor-handle'), lonlat: centreLL },
    )
  const moveBaseTo = async (x) => {
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
  const panelText = await page.getByTestId('bases-panel').innerText()
  check(
    'cumeada: o painel diz a distância a que fica tapado e o relevo usado (com a ressalva do MDT)',
    new RegExp(`${hf} \\d+ % \\(tapado a ~\\d+ m da base\\)`).test(panelText) &&
      /Relevo: MDT importado «cumeada\.tif»/.test(panelText) &&
      /MDS/.test(panelText),
    panelText.replace(/\s+/g, ' ').slice(0, 400),
  )

  // preflight: aviso com o voo e a base
  await page.getByTestId('preflight-pill').click()
  let lista = await page.getByTestId('preflight-list').innerText()
  const warn = new RegExp(
    `Voo ${hf}: \\d+ % do bloco fica atrás do relevo visto da base A, tapado a ~(\\d+) m`,
  ).exec(lista)
  // a cumeada está a 250 m da base: o raio tapado (mediana) passa-a
  check(
    `cumeada: o preflight avisa «Voo ${hf}: N % do bloco fica atrás do relevo visto da base A»`,
    Boolean(warn) && Number(warn[1]) >= 200 && Number(warn[1]) <= 300,
    lista
      .split('\n')
      .filter((l) => /relevo visto/.test(l))
      .join(' | ')
      .slice(0, 300),
  )
  check(
    'cumeada: é um aviso (não bloqueia)',
    (await page
      .getByTestId('preflight-list')
      .locator('li[data-level="warn"]', { hasText: 'atrás do relevo' })
      .count()) === 1,
  )
  const radioWarn = new RegExp(
    `Voo ${vf}: \\d+ % do bloco com o sinal de rádio em risco visto da base A: à vista, mas o relevo entra na zona de Fresnel \\(60 % a 2,4 GHz\\) a ~(\\d+) m`,
  ).exec(lista)
  check(
    `cumeada: o preflight avisa «Voo ${vf}: … sinal de rádio em risco» (à vista, causa rádio)`,
    Boolean(radioWarn) &&
      Number(radioWarn[1]) >= 200 &&
      Number(radioWarn[1]) <= 300 &&
      !new RegExp(`Voo ${vf}: \\d+ % do bloco fica atrás do relevo`).test(lista) &&
      (await page
        .getByTestId('preflight-list')
        .locator('li[data-level="warn"]', { hasText: `Voo ${vf}:` })
        .count()) === 1,
    lista
      .split('\n')
      .filter((l) => /rádio/.test(l))
      .join(' | ')
      .slice(0, 300),
  )
  await page.getByTestId('preflight-pill').click()

  // camada do mapa: ligada no painel, pinta os quadrados tapados e a
  // percentagem de cada bloco, e fica lembrada neste aparelho
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
  const dsmText = await page.getByTestId('viewshed-terrain').innerText()
  check(
    'cumeada: marcado como MDS, a vegetação não se soma (o campo fica desligado) e o painel diz MDS',
    (await page.getByTestId('viewshed-obstacle').isDisabled()) &&
      /MDS importado «cumeada\.tif»/.test(dsmText) &&
      !/vegetação e obstáculos/.test(dsmText.split('.')[0]),
    dsmText.slice(0, 200),
  )
  await page.getByTestId('dem-surface-dtm').click()
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

  // ficha de campo da base A: percentagem por voo e o relevo usado
  await page.getByRole('button', { name: /Checklist de campo|Field checklist/ }).click()
  const sheet = page.getByTestId('checklist-bases').getByTestId('base-sheet').first()
  await sheet.waitFor({ timeout: 10000 })
  const sheetText = await sheet.innerText()
  const cellText = await sheet
    .locator(
      `[data-testid="base-sheet-flight"][data-flight="${hf}"] [data-testid="base-sheet-view"]`,
    )
    .innerText()
  check(
    `cumeada: a ficha da base A dá «N % visível — tapado a ~X m da base» no voo ${hf}`,
    new RegExp(
      `^${views[hf]} % visível — tapado a ~\\d+ m da base( — rádio em risco em \\d+ % \\(Fresnel a ~\\d+ m\\))?$`,
    ).test(cellText.trim()),
    cellText,
  )
  const vfCell = await sheet
    .locator(
      `[data-testid="base-sheet-flight"][data-flight="${vf}"] [data-testid="base-sheet-view"]`,
    )
    .innerText()
  check(
    `cumeada: e no voo ${vf} «100 % visível — rádio em risco em N % (Fresnel a ~X m)»`,
    /^100 % visível — rádio em risco em \d+ % \(Fresnel a ~\d+ m\)$/.test(vfCell.trim()),
    vfCell,
  )
  check(
    'cumeada: a ficha diz o relevo usado e a ressalva do MDT',
    /bacias de visão/i.test(sheetText) &&
      /MDT importado «cumeada\.tif»/.test(sheetText) &&
      /árvores, edifícios nem escombreiras/.test(sheetText),
    sheetText.replace(/\s+/g, ' ').slice(0, 300),
  )

  check('cumeada: sem erros de página', errors.length === 0, errors.join(' | '))
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
