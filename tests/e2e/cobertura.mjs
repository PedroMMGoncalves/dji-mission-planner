/**
 * Cobertura do código do ecrã pelo E2E: opcional e só relatório (sem limiar,
 * fora da cadeia e do CI).
 *
 *   npm run test:e2e:cobertura
 *
 * O `npm run test:coverage` mede `src/utils/` e `src/mission/` com as suites
 * em Node; os componentes e os hooks só correm no browser, e foi aí que
 * viveram os últimos defeitos. Com E2E_COBERTURA=1 o run.mjs serve a build
 * com mapas de fontes que o script npm faz em DIST (o `dist/` não muda) e
 * cada página que o openMission abre recolhe a cobertura JS do V8 desde antes
 * da navegação até fechar. Ao fechar, as entradas passam a Istanbul pelo
 * v8-to-istanbul com o mapa do seu chunk, ficam só os ficheiros de `src/` que
 * interessam (componentes, hooks, App.jsx e, para comparação, mission e
 * utils) e juntam-se com o istanbul-lib-coverage; no fim escrevem-se em
 * <E2E_OUT>/cobertura/ o resumo, a tabela por ficheiro (da menor cobertura de
 * linhas para a maior), o HTML, o lcov e o JSON do Istanbul.
 *
 * As contas são as do c8: cada linha do ficheiro é uma linha, e as que ficam
 * fora de funções (em branco, comentários, importações) contam como cobertas;
 * um ramo é um bloco que o V8 conta, e só os há nas funções que chegaram a
 * compilar. Ao contrário do c8, uma função anónima também conta como função
 * (ver `comNome`).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import v8toIstanbul from 'v8-to-istanbul'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'

/** A build com mapas de fontes; o script npm fá-la aqui. */
export const DIST = 'tests/e2e/out/build-cobertura'

// Os grupos do relatório: os três primeiros são o código do ecrã, os outros
// dois o motor, que fica para comparação.
const GRUPOS = [
  ['src/components/', 'src/components'],
  ['src/hooks/', 'src/hooks'],
  ['src/App.jsx', 'src/App.jsx'],
  ['src/mission/', 'src/mission'],
  ['src/utils/', 'src/utils'],
]
const ECRA = [0, 1, 2]
const MOTOR = [3, 4]

/** Caminho relativo à raiz do repositório, sempre com «/». */
const rel = (abs) => relative(process.cwd(), abs).split(sep).join('/')
/** Índice do grupo de um caminho absoluto; -1 fica de fora. */
const grupoDe = (abs) => {
  const r = rel(abs)
  return GRUPOS.findIndex(([p]) => (p.endsWith('/') ? r.startsWith(p) : r === p))
}

const cobertura = libCoverage.createCoverageMap({})
const emCurso = new Set() // páginas com a cobertura ligada e ainda por recolher
const mapas = new Map() // chunk local -> mapa de fontes (null: nada de interesse)
const falhas = []
let paginas = 0
let abertasNoFim = 0
let entradas = 0
let msConversao = 0

/** O mapa de fontes de um chunk da build, lido uma vez. */
function mapaDe(ficheiro) {
  if (mapas.has(ficheiro)) return mapas.get(ficheiro)
  let mapa = null
  if (existsSync(`${ficheiro}.map`)) {
    mapa = JSON.parse(readFileSync(`${ficheiro}.map`, 'utf8'))
    const fontes = mapa.sources.map((s) => resolve(dirname(ficheiro), s))
    // o texto das bibliotecas (React, three, turf…) fica vazio: não entra no
    // relatório e o v8-to-istanbul partia-o em linhas a cada página
    mapa.sourcesContent = fontes.map((f, i) =>
      grupoDe(f) < 0 ? '' : (mapa.sourcesContent?.[i] ?? readFileSync(f, 'utf8')),
    )
    if (!fontes.some((f) => grupoDe(f) >= 0)) mapa = null
  }
  mapas.set(ficheiro, mapa)
  return mapa
}

// O v8-to-istanbul só conta como função um bloco com nome, e no código do
// ecrã quase tudo o que falta exercitar é anónimo: o corpo de um useCallback
// ou de um useEffect, uma seta num map. Ganham um nome; o âmbito de topo do
// script (do início ao fim) não é uma função do código e fica como está.
const comNome = (f, n) =>
  f.functionName || (f.ranges[0].startOffset === 0 && f.ranges[0].endOffset >= n)
    ? f
    : { ...f, functionName: '(anónima)' }

/** Converte as entradas V8 de uma página e junta-as ao mapa de cobertura. */
async function juntar(lista) {
  const t0 = performance.now()
  for (const e of lista) {
    // só os chunks da build (o HTML e os scripts sem URL ficam de fora)
    const m = /\/(assets\/[^/?#]+\.js)(?:[?#]|$)/.exec(e.url)
    const ficheiro = m && resolve(DIST, m[1])
    const mapa = ficheiro && mapaDe(ficheiro)
    if (!mapa) continue
    try {
      const fonte = e.source ?? readFileSync(ficheiro, 'utf8')
      const dir = dirname(ficheiro)
      const conv = v8toIstanbul(
        ficheiro,
        0,
        { source: fonte, sourceMap: { sourcemap: mapa } },
        (p) => grupoDe(resolve(dir, p)) < 0,
      )
      await conv.load()
      conv.applyCoverage(e.functions.map((f) => comNome(f, fonte.length)))
      cobertura.merge(conv.toIstanbul())
      entradas += 1
    } catch (err) {
      falhas.push(`${rel(ficheiro)}: ${err.message.split('\n')[0]}`)
    }
  }
  msConversao += performance.now() - t0
}

async function parar(page) {
  if (!emCurso.delete(page)) return []
  try {
    return await page.coverage.stopJSCoverage()
  } catch (err) {
    falhas.push(`página sem cobertura: ${err.message.split('\n')[0]}`)
    return []
  }
}

/**
 * Liga a cobertura numa página acabada de abrir (antes da navegação) e faz o
 * `page.close()` recolhê-la antes de fechar: os cenários fecham as páginas
 * como sempre, e a recolha da falha (scenario) também passa por aqui.
 */
export async function iniciar(page) {
  await page.coverage.startJSCoverage({ resetOnNavigation: false })
  paginas += 1
  emCurso.add(page)
  const fechar = page.close.bind(page)
  page.close = async (opcoes) => {
    const lista = await parar(page)
    try {
      return await fechar(opcoes)
    } finally {
      await juntar(lista)
    }
  }
  // Com a cobertura o JS da página corre mais devagar (o V8 conta cada
  // bloco). As pausas fixas dos cenários («dá tempo ao autosave») estão
  // à justa numa máquina carregada: o autosave depois de importar a área
  // levou até 1,1 s para 1,2 s de pausa, e com a cobertura um cenário chegou
  // tarde. Aqui duplicam; as verificações são as mesmas.
  const esperar = page.waitForTimeout.bind(page)
  page.waitForTimeout = (ms) => esperar(ms * 2)
}

/** As páginas que ficaram abertas: recolhidas antes do `browser.close()`. */
export async function recolherAbertas() {
  abertasNoFim = emCurso.size
  for (const page of [...emCurso]) await page.close().catch(() => {})
}

const pct = ({ covered, total }) => (total ? (100 * covered) / total : 100)
// «–» quando não há nada a contar: as funções de um ficheiro que nunca correu
// não compilaram e não têm ramos, e 0/0 não é 100 %
const col = (m) =>
  `${m.total ? `${pct(m).toFixed(1).padStart(5)} %` : '    –  '} ` +
  `${`${m.covered}/${m.total}`.padStart(11)}`
const fila = (s, nome) => `${col(s.lines)}   ${col(s.functions)}   ${col(s.branches)}   ${nome}`
const CABECALHO = `${'linhas'.padEnd(19)}   ${'funções'.padEnd(19)}   ${'ramos'.padEnd(19)}`
const somar = (lista) =>
  lista.reduce((acc, f) => (acc.merge(f.s), acc), libCoverage.createCoverageSummary())
/** Da menor cobertura de linhas para a maior; empate: mais linhas por cobrir primeiro. */
const porLinhas = (a, b) =>
  pct(a.s.lines) - pct(b.s.lines) ||
  b.s.lines.total - b.s.lines.covered - (a.s.lines.total - a.s.lines.covered) ||
  a.nome.localeCompare(b.nome)

/**
 * Escreve o relatório em `dir` e imprime o resumo. Devolve false se falhou
 * (o veredicto do E2E não muda, mas o comando sai com erro).
 */
export async function relatorio(dir) {
  try {
    // Ficheiros de interesse que a build tem mas nenhuma página carregou (um
    // chunk que nenhum cenário abre) entram a zero, como no --all do c8; os
    // que nem estão na build (só as ferramentas os usam) ficam à parte.
    const assets = join(DIST, 'assets')
    const naBuild = new Set()
    for (const f of readdirSync(assets).filter((f) => f.endsWith('.js.map')))
      for (const s of JSON.parse(readFileSync(join(assets, f), 'utf8')).sources)
        naBuild.add(resolve(assets, s))
    const vistos = new Set(cobertura.files())
    const naoCarregados = []
    const foraDaBuild = []
    for (const f of readdirSync('src', { recursive: true }).map((f) => resolve('src', f))) {
      if (!/\.jsx?$/.test(f) || grupoDe(f) < 0 || vistos.has(f)) continue
      if (!naBuild.has(f)) {
        foraDaBuild.push(rel(f))
        continue
      }
      naoCarregados.push(rel(f))
      const texto = readFileSync(f, 'utf8')
      const conv = v8toIstanbul(f, 0, { source: texto })
      await conv.load()
      conv.applyCoverage([
        {
          functionName: '(empty-report)',
          isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: texto.length, count: 0 }],
        },
      ])
      cobertura.merge(conv.toIstanbul())
    }

    const ficheiros = cobertura.files().map((f) => ({
      nome: rel(f),
      g: grupoDe(f),
      s: cobertura.fileCoverageFor(f).toSummary(),
    }))
    const doGrupo = (gs) => ficheiros.filter((f) => gs.includes(f.g))
    const resumo = [
      'Cobertura do E2E (Chromium, build com mapas de fontes)',
      `${paginas} páginas` +
        (abertasNoFim ? ` (${abertasNoFim} deixadas abertas, recolhidas no fim)` : '') +
        `, ${entradas} entradas do V8 convertidas em ${(msConversao / 1000).toFixed(1)} s` +
        (falhas.length ? `; ${falhas.length} falhas:` : ''),
      ...falhas.slice(0, 10).map((f) => `  ${f}`),
      ...(falhas.length > 10 ? [`  … e mais ${falhas.length - 10}`] : []),
      '',
      `${CABECALHO}   ficheiros`,
      ...GRUPOS.map(([, nome], g) => fila(somar(doGrupo([g])), `${nome} (${doGrupo([g]).length})`)),
      fila(somar(doGrupo(ECRA)), `ecrã: componentes, hooks e App.jsx (${doGrupo(ECRA).length})`),
      fila(somar(doGrupo(MOTOR)), `motor: mission e utils (${doGrupo(MOTOR).length})`),
      '',
      'Linhas: cada linha do ficheiro, como no c8. Só fica por cobrir a linha',
      'que um bloco nunca corrido ocupa inteira (uma seta por chamar numa linha',
      'com outro código não a descobre), e as que ficam fora de funções (em',
      'branco, comentários, importações) contam como cobertas: as funções e os',
      'ramos dizem mais. Funções: com nome ou anónimas. Ramos: os blocos que o',
      'V8 conta nas funções que chegaram a compilar («–» quando não há nenhum).',
      ...(naoCarregados.length
        ? ['', `Na build mas nunca carregados (a zero): ${naoCarregados.join(', ')}`]
        : []),
      ...(foraDaBuild.length ? ['', `Fora da build (não contam): ${foraDaBuild.join(', ')}`] : []),
    ]
    const seccao = (titulo, gs) => [
      titulo,
      `${CABECALHO}   ficheiro`,
      ...doGrupo(gs)
        .sort(porLinhas)
        .map((f) => fila(f.s, f.nome)),
    ]
    const tabela = [
      'Cobertura do E2E por ficheiro, da menor cobertura de linhas para a maior',
      '',
      ...seccao('Ecrã (componentes, hooks e App.jsx)', ECRA),
      '',
      ...seccao('Motor (mission e utils), para comparação', MOTOR),
    ]

    mkdirSync(dir, { recursive: true })
    rmSync(join(dir, 'html'), { recursive: true, force: true })
    writeFileSync(join(dir, 'resumo.txt'), `${resumo.join('\n')}\n`)
    writeFileSync(join(dir, 'tabela.txt'), `${tabela.join('\n')}\n`)
    const contexto = libReport.createContext({
      dir,
      coverageMap: cobertura,
      defaultSummarizer: 'nested',
    })
    reports.create('html', { subdir: 'html' }).execute(contexto)
    reports.create('lcovonly', { file: 'lcov.info' }).execute(contexto)
    reports.create('json', { file: 'coverage-final.json' }).execute(contexto)

    console.log(`\n## cobertura\n${resumo.join('\n')}\n`)
    console.log('Os 15 ficheiros do ecrã com menos linhas cobertas:')
    console.log(`${CABECALHO}   ficheiro`)
    for (const f of doGrupo(ECRA).sort(porLinhas).slice(0, 15)) console.log(fila(f.s, f.nome))
    console.log(
      `\nrelatório em ${rel(dir)}/: resumo.txt, tabela.txt, html/index.html, lcov.info, ` +
        'coverage-final.json',
    )
    return true
  } catch (err) {
    console.log(`\ncobertura: o relatório falhou: ${err.stack}`)
    return false
  }
}
