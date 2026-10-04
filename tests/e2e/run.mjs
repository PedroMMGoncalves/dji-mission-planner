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
import zlib from 'node:zlib'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import Ajv2020 from 'ajv/dist/2020.js'
import { ground, makeFixtures, toM } from './fixtures.mjs'
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

async function openMission({ area = null, dem = true, globalTerrain = true, disclaimer = true }) {
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
    await page.locator('input[accept=".tif,.tiff"]').setInputFiles(fx.dem)
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
  // cada bloco arranca da base: o primeiro troço é uma linha, não um ponto de ligação
  check(
    'blocos: cada bloco começa numa linha de voo',
    rs.every((r) => r.firstSegM >= 100),
    rs.map((r) => r.firstSegM.toFixed(0)).join(','),
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
