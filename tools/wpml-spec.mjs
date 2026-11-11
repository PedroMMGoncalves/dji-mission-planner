#!/usr/bin/env node
/*
 * Dicionário da especificação WPML em JSON (T1 da revisão da exportação,
 * docs/REVISAO-EXPORTACAO-2026-10.md): lê as tabelas da documentação oficial
 * da DJI e grava tests/spec/wpml-spec.json com, por elemento e pai: tipo,
 * valores do enum, intervalo, obrigatoriedade (incluindo «obrigatório
 * se…»), aeronaves suportadas, ficheiro, linha e secção; dos exemplos XML da
 * documentação, a ordem dos filhos de cada elemento; e, da página de suporte
 * de produtos, os enums das aeronaves e das câmaras.
 *
 * A fonte é a página viva (developer.dji.com/doc/cloud-api-tutorial, a que a
 * DJI mantém; o repositório dji-sdk/cloud-api-doc parou em 2024-11, antes do
 * Matrice 4). As páginas descarregam-se para uma pasta local, não
 * versionada (o texto é da DJI): só o JSON derivado entra no repositório.
 * Cada página vem convertida para o Markdown das fontes do clone
 * (tools/lib/pagina-dji.mjs) e lida pelas mesmas regras.
 *
 * Uso:
 *   node tools/wpml-spec.mjs --fetch [pasta]   descarrega as páginas para a pasta
 *   node tools/wpml-spec.mjs [--live pasta] [--check] [--out ficheiro] [--markdown pasta]
 *   node tools/wpml-spec.mjs --clone pasta-do-clone [--check] [--out ficheiro]
 *
 *   pasta (omissão: $WPML_SPEC_LIVE ou .cache/dji-docs na raiz do
 *   repositório, git-ignorada): as páginas descarregadas e fonte.json (URL,
 *   data do descarregamento). --check não grava: falha se o JSON em disco
 *   divergir do que as páginas dão (a data do descarregamento não conta).
 *   --markdown grava o Markdown convertido, para o ler ao lado do JSON.
 *   --clone lê o Markdown de um clone de dji-sdk/cloud-api-doc (a fonte
 *   até 2026-11), para comparar com a página viva.
 *
 * O JSON é um ficheiro gerado e versionado: o validador de conformidade
 * (tests/lib/wpml-conformidade.mjs) lê-o no CI sem precisar das páginas.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE, chunkToMarkdown, fetchPages } from './lib/pagina-dji.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const FILES = ['20.template-kml.md', '30.waylines-wpml.md', '40.common-element.md']
/** Páginas vivas: as três da especificação, a de suporte de produtos e as chinesas (referência). */
export const PAGES = [
  {
    name: 'en.template-kml',
    file: '20.template-kml.md',
    path: '/en/api-reference/dji-wpml/template-kml.html',
  },
  {
    name: 'en.waylines-wpml',
    file: '30.waylines-wpml.md',
    path: '/en/api-reference/dji-wpml/waylines-wpml.html',
  },
  {
    name: 'en.common-element',
    file: '40.common-element.md',
    path: '/en/api-reference/dji-wpml/common-element.html',
  },
  {
    name: 'en.product-support',
    file: 'product-support',
    path: '/en/overview/product-support.html',
  },
  { name: 'cn.template-kml', path: '/cn/api-reference/dji-wpml/template-kml.html' },
  { name: 'cn.waylines-wpml', path: '/cn/api-reference/dji-wpml/waylines-wpml.html' },
  { name: 'cn.common-element', path: '/cn/api-reference/dji-wpml/common-element.html' },
  { name: 'cn.product-support', path: '/cn/overview/product-support.html' },
]

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null
}
const valued = new Set(['--live', '--clone', '--out', '--markdown', '--fetch'])
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]))
const check = flag('--check')
const OUT = resolve(option('--out') ?? join(ROOT, 'tests', 'spec', 'wpml-spec.json'))
const DEFAULT_LIVE = process.env.WPML_SPEC_LIVE ?? join(ROOT, '.cache', 'dji-docs')

/* ---- --fetch: descarregar as páginas ------------------------------------ */
if (flag('--fetch')) {
  const dir = resolve(option('--fetch') ?? DEFAULT_LIVE)
  mkdirSync(dir, { recursive: true })
  const got = await fetchPages(PAGES.map((p) => p.path))
  const pages = []
  for (const [i, g] of got.entries()) {
    const name = PAGES[i].name
    writeFileSync(join(dir, `${name}.js`), g.js)
    pages.push({ name, url: g.url, chunk: g.chunkUrl })
  }
  const fonte = { site: SITE, downloaded: new Date().toISOString().slice(0, 10), pages }
  writeFileSync(join(dir, 'fonte.json'), JSON.stringify(fonte, null, 2) + '\n')
  console.log(`${dir}: ${pages.length} páginas descarregadas (${fonte.downloaded})`)
  process.exit(0)
}

/* ---- fontes ------------------------------------------------------------- */
/** { texts: {ficheiro: {text, anchors}}, productSupport, source } */
function loadLive(dir) {
  const fontePath = join(dir, 'fonte.json')
  if (!existsSync(fontePath)) {
    console.error(`sem as páginas em ${dir}: descarregar com node tools/wpml-spec.mjs --fetch`)
    process.exit(2)
  }
  const fonte = JSON.parse(readFileSync(fontePath, 'utf8'))
  const texts = {}
  const pages = []
  const mdDir = option('--markdown')
  if (mdDir) mkdirSync(mdDir, { recursive: true })
  for (const p of PAGES.filter((x) => x.file)) {
    const js = readFileSync(join(dir, `${p.name}.js`), 'utf8')
    const { markdown, meta, headings } = chunkToMarkdown(js)
    if (meta.path !== p.path) throw new Error(`${p.name}.js é a página ${meta.path}, não ${p.path}`)
    const lines = markdown.split('\n')
    // a secção de cada linha: o id do último cabeçalho acima dela
    const anchors = []
    let h = -1
    for (const l of lines) {
      if (/^#{1,6} /.test(l)) h++
      anchors.push(h >= 0 ? (headings[h]?.id ?? null) : null)
    }
    if (h + 1 !== headings.length)
      throw new Error(`${p.name}: ${h + 1} cabeçalhos no Markdown, ${headings.length} na página`)
    texts[p.file] = { text: markdown, anchors }
    if (mdDir) writeFileSync(join(mdDir, `${p.name}.md`), markdown)
    pages.push({
      file: p.file,
      url: SITE + p.path,
      source: meta.filePathRelative,
      updated: meta.updatedTime
        ? new Date(meta.updatedTime).toISOString().replace('.000Z', 'Z')
        : null,
    })
  }
  return {
    texts,
    source: { site: SITE, pages, downloaded: fonte.downloaded ?? null },
  }
}

function loadClone(cloneDir) {
  const docs = join(cloneDir, 'docs', 'en', '60.api-reference', '00.dji-wpml')
  if (!existsSync(docs)) {
    console.error(`sem a documentação em ${docs}: clone https://github.com/dji-sdk/cloud-api-doc`)
    process.exit(2)
  }
  const texts = {}
  for (const f of FILES) texts[f] = { text: readFileSync(join(docs, f), 'utf8'), anchors: null }
  let commit = null
  try {
    commit = execSync(`git -C "${cloneDir}" rev-parse --short HEAD`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    commit = process.env.WPML_SPEC_COMMIT ?? null
  }
  return {
    texts,
    source: {
      repo: 'https://github.com/dji-sdk/cloud-api-doc',
      path: 'docs/en/60.api-reference/00.dji-wpml',
      commit,
      files: FILES,
    },
  }
}

const cloneDir = option('--clone') ?? positional[0] ?? null
const SRC = cloneDir
  ? loadClone(resolve(cloneDir))
  : loadLive(resolve(option('--live') ?? DEFAULT_LIVE))

/* ---- cabeçalhos → pai(s) e contexto ------------------------------------ */
// «### Mission information (parent element: `<wpml:missionConfig>`)»,
// «### `<wpml:actionGroup>`», «#### takePhoto» (parâmetros da acção),
// «#### Mapping Aerial Template Element (Parent Element: `<Placemark>`)»
const TEMPLATE_KIND = {
  'Waypoint Flight Template': 'waypoint',
  'Mapping Aerial Template': 'mapping2d',
  'Oblique Photography Template': 'mapping3d',
  'Waypoint Segment Flight Template': 'mappingStrip',
}
function headingContext(line, prev) {
  const m = line.match(/^\s*#{2,4}\s*(.*)$/)
  if (!m) return null
  const title = m[1].trim()
  const parents = [...title.matchAll(/<(wpml:)?([A-Za-z]+)>/g)].map((x) => x[2])
  const kind = Object.keys(TEMPLATE_KIND).find((k) => title.startsWith(k))
  if (parents.length > 0) {
    return { parents, action: null, template: kind ? TEMPLATE_KIND[kind] : null }
  }
  // «#### takePhoto» por baixo de «### <wpml:actionActuatorFuncParam>»
  if (/^#{4}\s*[a-zA-Z]+\s*$/.test(line) && prev?.parents?.includes('actionActuatorFuncParam')) {
    return { parents: ['actionActuatorFuncParam'], action: title, template: null }
  }
  if (/^#{4}\s*[a-zA-Z]+\s*$/.test(line) && prev?.action) {
    return { parents: ['actionActuatorFuncParam'], action: title, template: null }
  }
  return { parents: [], action: null, template: null }
}

/* ---- células das tabelas ---------------------------------------------- */
const clean = (s) =>
  s
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\*/g, '')
    // espaços seguidos: o compilador do Vue condensa-os na página viva
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

// «Note: …» no início de uma linha não é um valor do enum
const notNote = (w) => !/^notes?$/i.test(w)

/**
 * Valores que a tabela remete para a página de suporte de produtos (a
 * página viva: «please refer to the `type` in the `Enumeration Values of
 * Aircraft, RC and Dock` in the Product Support page»).
 */
function parseRef(cell) {
  const text = clean(cell)
  const m =
    /refer to the `?(type|sub_type|gimbalindex)`?[\s\S]*?Enumeration Values of (Aircraft|Camera)/i.exec(
      text,
    )
  if (!m || !/product support/i.test(text)) return null
  return {
    page: 'product-support',
    table: /camera/i.test(m[2]) ? 'cameras' : 'aircraft',
    field: { type: 'type', sub_type: 'subType', gimbalindex: 'gimbalIndex' }[m[1].toLowerCase()],
  }
}

function parseValues(cell, type, unit = '') {
  if (parseRef(cell)) return null
  // o tipo às vezes vem na coluna da unidade («List of photo format» |
  // «enum-string (list)», payloadLensIndex)
  if (/enum/i.test(unit ?? '') && !/enum/i.test(type)) type = `${type} ${unit}`
  const text = clean(cell)
  // enums: `north`: ... ; só `waypoint`<br/>`mapping2d`; e, nos enums, também
  // os valores sem crase no início da linha («accurateShoot: AI Spot-Check»)
  const quoted = [...cell.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map((x) => x[1])
  if (/enum/i.test(type)) {
    const words = [...text.matchAll(/(?:^|\n)\s*([a-zA-Z][A-Za-z0-9_]+)\s*[:：]/g)]
      .map((x) => x[1])
      .filter(notNote)
    const all = [...new Set([...quoted, ...words])]
    if (all.length > 0) return all
  }
  if (quoted.length > 0) return [...new Set(quoted)]
  // enums numéricos: «89 (M350 RTK)», «42 (H20)»
  const numbered = [...text.matchAll(/(?:^|[\s,])(\d+)\s*\(/g)].map((x) => x[1])
  if (numbered.length >= 2 && /enum|int/i.test(type)) return [...new Set(numbered)]
  // booleanos «0: Disable», «1: Enable»
  const bools = [...text.matchAll(/(?:^|\n)\s*([01])\s*[:：]/g)].map((x) => x[1])
  if (bools.length >= 2) return [...new Set(bools)]
  // «enum-string» com «zoom: ...» sem crase
  if (/enum/i.test(type)) {
    const words = [...text.matchAll(/(?:^|\n)\s*([a-z][A-Za-z0-9_]+)\s*[:：]/g)]
      .map((x) => x[1])
      .filter(notNote)
    if (words.length > 0) return [...new Set(words)]
  }
  return null
}

function parseRange(cell) {
  const text = clean(cell)
  // «> 0»: mínimo aberto em 0, sem máximo
  if (/^>\s*0\b/.test(text)) return { min: 0, minOpen: true, max: null, maxOpen: false }
  const m = text.match(/([[(])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)?[^\])]*([\])])/)
  if (!m) return null
  return {
    min: Number(m[2]),
    minOpen: m[1] === '(',
    max: m[3] != null ? Number(m[3]) : null,
    maxOpen: m[4] === ')',
  }
}

function parseRequired(cell) {
  const text = clean(cell)
  const note = text
    .replace(/^Yes\s*/i, '')
    .replace(/^Note[:：]\s*/i, '')
    .trim()
  if (
    /required if|required when|only when|when .* is required|it is required|mapping|templateType|template/i.test(
      text,
    )
  )
    return { required: 'conditional', note }
  if (/^yes/i.test(text)) return { required: 'yes', note: note || null }
  if (/^(-|none|no)\b/i.test(text) || text === '') return { required: 'no', note: note || null }
  return { required: 'conditional', note }
}

// a página viva separa às vezes as aeronaves com a vírgula chinesa
// («M3D/M3TD，M4D/M4TD»): as duas separam
function parseSupport(cell) {
  return clean(cell)
    .split(/[,，]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/* ---- leitura das tabelas --------------------------------------------- */
const elements = {}
const seen = new Set()
for (const file of FILES) {
  const { text, anchors } = SRC.texts[file]
  const lines = text.split('\n')
  let ctx = { parents: [], action: null, template: null }
  lines.forEach((line, i) => {
    const h = headingContext(line, ctx)
    if (h) {
      ctx = h.parents.length > 0 || h.action ? h : { parents: [], action: null, template: null }
      return
    }
    if (!/^\|\s*(wpml:)?[A-Za-z]/.test(line) || /^\|\s*Element/.test(line)) return
    const cells = line.split('|').slice(1, -1)
    if (cells.length < 7) return
    const [elemCell, nameCell, typeCell, unitCell, valueCell, reqCell, supCell] = cells
    const elem = clean(elemCell)
      .replace(/^wpml:/, '')
      .replace(/\(.*$/, '')
      .trim()
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(elem)) return
    const type = clean(typeCell)
    const parents = ctx.parents.length > 0 ? ctx.parents : ['?']
    for (const parent of parents) {
      const key = `${parent}/${elem}`
      const doc = {
        line: i + 1,
        ...(anchors ? { anchor: anchors[i] } : {}),
        description: clean(nameCell).slice(0, 160),
        type,
        unit: clean(unitCell) || null,
        values: parseValues(valueCell, type, clean(unitCell)),
        ...(parseRef(valueCell) ? { ref: parseRef(valueCell) } : {}),
        range: parseRange(valueCell),
        ...parseRequired(reqCell),
        support: parseSupport(supCell),
      }
      // o mesmo elemento pode aparecer nos dois ficheiros (template e
      // waylines, com tabelas que diferem: «> 0» num, «[0,15]» no outro) ou
      // em várias acções: cada ocorrência fica guardada pelo seu documento
      const id = ctx.action ? `${key}@${ctx.action}` : ctx.template ? `${key}#${ctx.template}` : key
      const entry = (elements[id] ??= { element: elem, parent, docs: {} })
      if (ctx.action) entry.action = ctx.action
      if (ctx.template) entry.template = ctx.template
      const tag = `${file}`
      if (seen.has(`${id}|${tag}`)) continue
      seen.add(`${id}|${tag}`)
      entry.docs[tag] = doc
    }
  })
}

/* ---- ordem dos filhos nos exemplos XML --------------------------------- */
function exampleOrders(file) {
  const text = SRC.texts[file].text
  const blocks = [...text.matchAll(/```xml\n([\s\S]*?)```/g)].map((m) => m[1])
  const order = {}
  for (const xml of blocks) {
    const stack = []
    for (const m of xml.matchAll(/<(\/)?(wpml:)?([A-Za-z]+)[^>]*?(\/)?>/g)) {
      const closing = Boolean(m[1])
      const name = m[3]
      const selfClosing = Boolean(m[4])
      if (closing) {
        stack.pop()
        continue
      }
      const parent = stack[stack.length - 1]
      if (parent) {
        const list = (order[parent] ??= [])
        if (!list.includes(name)) list.push(name)
      }
      if (!selfClosing) stack.push(name)
    }
  }
  return order
}
const examples = {
  'template.kml': exampleOrders('20.template-kml.md'),
  'waylines.wpml': exampleOrders('30.waylines-wpml.md'),
}
// a versão do namespace WPML que os exemplos declaram (xmlns:wpml=…/wpmz/<versão>)
const namespaceOf = (file) => [
  ...new Set(
    [...SRC.texts[file].text.matchAll(/xmlns:wpml="http:\/\/www\.dji\.com\/wpmz\/([\d.]+)"/g)].map(
      (m) => m[1],
    ),
  ),
]
const namespaces = {
  'template.kml': namespaceOf('20.template-kml.md'),
  'waylines.wpml': namespaceOf('30.waylines-wpml.md'),
}

/* ---- suporte de produtos: enums das aeronaves e das câmaras ------------- */
// tabelas «Enumeration Values of Aircraft, RC and Dock» (name | domain |
// type | sub_type | Description) e «Enumeration Values of Camera» (Product
// Type | name | domain | type-subtype-gimbalindex | Description, com a
// primeira coluna partilhada por várias linhas)
function productSupport(text) {
  if (!text) return null
  const lines = text.split('\n')
  const cellsOf = (l) =>
    l
      .split('|')
      .slice(1, -1)
      .map((c) => clean(c.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')))
  // linhas da primeira tabela a seguir ao cabeçalho de secção `title`
  const section = (title) => {
    const at = lines.findIndex((l) => /^#{2,3} /.test(l) && l.includes(title))
    if (at < 0) throw new Error(`suporte de produtos sem a secção «${title}»`)
    const rows = []
    for (let i = at + 1; i < lines.length && !/^#{1,3} /.test(lines[i]); i++)
      if (/^\|/.test(lines[i]) && !/^\|\s*-/.test(lines[i]))
        rows.push({ line: i + 1, cells: cellsOf(lines[i]) })
    return rows.slice(1) // sem o cabeçalho
  }
  // linhas da tabela cujo cabeçalho casa com `header`
  const table = (header) => {
    const at = lines.findIndex((l) => header.test(l))
    if (at < 0) throw new Error(`suporte de produtos sem a tabela ${header}`)
    const rows = []
    for (let i = at + 1; i < lines.length && /^\|/.test(lines[i]); i++)
      if (!/^\|\s*-/.test(lines[i])) rows.push({ line: i + 1, cells: cellsOf(lines[i]) })
    return rows
  }
  const aircraft = section('Enumeration Values of Aircraft').map(({ line, cells }) => {
    const [name, domain, type, subType] = cells
    if (![domain, type, subType].every((x) => /^\d+$/.test(x)))
      throw new Error(`linha ${line} da tabela das aeronaves fora do formato: ${cells.join(' | ')}`)
    return { name, domain: +domain, type: +type, subType: +subType, line }
  })
  const cameras = []
  for (const { line, cells } of section('Enumeration Values of Camera')) {
    const at = cells.findIndex((c) => /\d+-\d+-\d+/.test(c))
    if (at < 2) throw new Error(`linha ${line} da tabela das câmaras sem type-subtype-gimbalindex`)
    const triples = [...cells[at].matchAll(/(\d+)-(\d+)-(\d+)/g)]
    cameras.push({
      name: cells[at - 2],
      domain: +cells[at - 1],
      type: +triples[0][1],
      subType: +triples[0][2],
      gimbalIndex: [...new Set(triples.map((t) => +t[3]))],
      line,
    })
  }
  // «Aircraft | Gateway | Payload | Comment»: os payloads que o Cloud API
  // suporta em cada aeronave
  const models = table(/^\|\s*Aircraft\s*\|\s*Gateway\s*\|/).map(({ cells }) => ({
    aircraft: cells[0],
    gateway: cells[1],
    payload: cells[2],
  }))
  return { aircraft, cameras, models }
}

const out = {
  source: SRC.source,
  elements,
  examples,
  namespaces,
  ...(SRC.texts['product-support']
    ? { productSupport: productSupport(SRC.texts['product-support'].text) }
    : {}),
}
const json = JSON.stringify(out, null, 2) + '\n'
if (check) {
  const disk = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  // o commit do clone e a data do descarregamento podem mudar sem a
  // documentação mudar: comparam-se sem eles
  const strip = (s) =>
    s
      .replace(/"commit": "[^"]*"/, '"commit": null')
      .replace(/"downloaded": "[^"]*"/, '"downloaded": null')
  if (strip(disk) !== strip(json)) {
    console.error(`${OUT} diverge da documentação; regenerar com node tools/wpml-spec.mjs`)
    process.exit(1)
  }
  console.log(`${OUT} em dia (${Object.keys(elements).length} entradas)`)
} else {
  writeFileSync(OUT, json)
  console.log(
    `${OUT}: ${Object.keys(elements).length} entradas, exemplos de ${Object.keys(examples['template.kml']).length}+${Object.keys(examples['waylines.wpml']).length} pais`,
  )
}
