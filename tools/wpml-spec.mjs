#!/usr/bin/env node
/*
 * Dicionário da especificação WPML em JSON (T1 da revisão da exportação,
 * docs/REVISAO-EXPORTACAO-2026-10.md): lê as tabelas Markdown da
 * documentação oficial da DJI (dji-sdk/cloud-api-doc, docs/en/60.api-reference/
 * 00.dji-wpml/) e grava tests/spec/wpml-spec.json com, por elemento e pai:
 * tipo, valores do enum, intervalo, obrigatoriedade (incluindo «obrigatório
 * se…»), aeronaves suportadas, ficheiro e linha; e, dos exemplos XML da
 * documentação, a ordem dos filhos de cada elemento.
 *
 * Uso:  node tools/wpml-spec.mjs [pasta-do-clone] [--check]
 *   pasta-do-clone: .../cloud-api-doc (omissão: $WPML_SPEC_DIR ou
 *   /home/user/dji-sdk/cloud-api-doc). --check não grava: falha se o JSON
 *   em disco divergir do que a documentação dá (o mesmo padrão do
 *   esperado.json das missões de referência).
 *
 * O JSON é um ficheiro gerado e versionado: o validador de conformidade
 * (tests/lib/wpml-conformidade.mjs) lê-o no CI sem precisar do clone.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'tests', 'spec', 'wpml-spec.json')
const args = process.argv.slice(2)
const check = args.includes('--check')
const cloneDir =
  args.find((a) => !a.startsWith('--')) ??
  process.env.WPML_SPEC_DIR ??
  '/home/user/dji-sdk/cloud-api-doc'
const DOCS = join(cloneDir, 'docs', 'en', '60.api-reference', '00.dji-wpml')
const FILES = ['20.template-kml.md', '30.waylines-wpml.md', '40.common-element.md']

if (!existsSync(DOCS)) {
  console.error(`sem a documentação em ${DOCS}: clone https://github.com/dji-sdk/cloud-api-doc`)
  process.exit(2)
}

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
    .trim()

function parseValues(cell, type) {
  const text = clean(cell)
  // enums: `north`: ... ; só `waypoint`<br/>`mapping2d`; e, nos enums, também
  // os valores sem crase no início da linha («accurateShoot: AI Spot-Check»)
  const quoted = [...cell.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map((x) => x[1])
  if (/enum/i.test(type)) {
    const words = [...text.matchAll(/(?:^|\n)\s*([a-zA-Z][A-Za-z0-9_]+)\s*[:：]/g)].map((x) => x[1])
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
    const words = [...text.matchAll(/(?:^|\n)\s*([a-z][A-Za-z0-9_]+)\s*[:：]/g)].map((x) => x[1])
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

function parseSupport(cell) {
  return clean(cell)
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/* ---- leitura das tabelas --------------------------------------------- */
const elements = {}
const seen = new Set()
for (const file of FILES) {
  const lines = readFileSync(join(DOCS, file), 'utf8').split('\n')
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
        description: clean(nameCell).slice(0, 160),
        type,
        unit: clean(unitCell) || null,
        values: parseValues(valueCell, type),
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
  const text = readFileSync(join(DOCS, file), 'utf8')
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

const out = {
  source: {
    repo: 'https://github.com/dji-sdk/cloud-api-doc',
    path: 'docs/en/60.api-reference/00.dji-wpml',
    commit,
    files: FILES,
  },
  elements,
  examples,
}
const json = JSON.stringify(out, null, 2) + '\n'
if (check) {
  const disk = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  // o commit do clone pode ser outro sem a documentação mudar: compara-se
  // sem ele
  const strip = (s) => s.replace(/"commit": "[^"]*"/, '"commit": null')
  if (strip(disk) !== strip(json)) {
    console.error(
      `${OUT} diverge da documentação em ${DOCS}; regenerar com node tools/wpml-spec.mjs`,
    )
    process.exit(1)
  }
  console.log(`${OUT} em dia (${Object.keys(elements).length} entradas)`)
} else {
  writeFileSync(OUT, json)
  console.log(
    `${OUT}: ${Object.keys(elements).length} entradas, exemplos de ${Object.keys(examples['template.kml']).length}+${Object.keys(examples['waylines.wpml']).length} pais`,
  )
}
