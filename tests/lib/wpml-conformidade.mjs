/*
 * Validador de conformidade WPML (T2, T3, T4 e T7 da revisão da exportação,
 * docs/REVISAO-EXPORTACAO-2026-10.md), sobre o dicionário da especificação
 * em tests/spec/wpml-spec.json (gerado por tools/wpml-spec.mjs a partir da
 * documentação oficial da DJI).
 *
 * Para cada ficheiro gerado (template.kml e waylines.wpml):
 *  - T2: cada par pai→filho existe na especificação, ou numa lista explícita
 *    com a prova (ficheiros reais do Pilot 2, voos); cada enum no enum; cada
 *    booleano em {0, 1}; cada numérico em decimal (nunca 4e-7, NaN,
 *    undefined) e dentro do intervalo; os obrigatórios presentes (incluindo
 *    os «obrigatório se…» codificados à mão); dada a aeronave, nenhum
 *    elemento fora da coluna de suporte sem prova;
 *  - T3: a ordem dos filhos de cada elemento segue os exemplos da
 *    especificação; os filhos que os exemplos não têm levam a posição
 *    aceite, com a prova;
 *  - T4: template.kml e waylines.wpml contam a mesma história (waypoints,
 *    alturas, ids, modos, velocidades);
 *  - T7: o KMZ tem exactamente wpmz/template.kml e wpmz/waylines.wpml, em
 *    UTF-8 sem BOM, com declaração XML e XML válido.
 *
 * Tudo o que foi preciso pôr na lista de excepções está aqui com a razão:
 * um elemento novo fora da especificação faz o teste falhar até alguém o
 * provar, que é o objectivo («nunca mais no campo»).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SPEC = JSON.parse(readFileSync(join(HERE, '..', 'spec', 'wpml-spec.json'), 'utf8'))

const DOC_OF = { template: '20.template-kml.md', waylines: '30.waylines-wpml.md' }
const COMMON = '40.common-element.md'
const EXAMPLE_OF = { template: 'template.kml', waylines: 'waylines.wpml' }

/** Aeronave (nome da coluna de suporte) a partir do droneEnumValue. */
export const AIRCRAFT_OF = {
  60: 'M300 RTK',
  89: 'M350 RTK',
  67: 'M30/M30T',
  77: 'M3E/M3T/M3M',
  91: 'M3D/M3TD',
}
/** O M4 (99) não consta da documentação clonada: valida-se como a classe M3E (extrapolação). */
const CLASS_OF = { 99: 'M3E/M3T/M3M' }

/* ---- excepções, cada uma com a prova ----------------------------------- */
export const ALLOW = {
  // pares pai→filho que a especificação não tem
  elements: {
    'Folder/name': 'KML 2.2: nome do Folder; o Pilot 2 usa o nome do ficheiro',
    'payloadInfo/payloadSubEnumValue':
      '81 KMZ reais do Pilot 2 (M300 RTK, 2023-2026) escrevem-no; nao documentado',
    'waypointHeadingParam/waypointHeadingAngleEnable': '81 KMZ reais do Pilot 2; nao documentado',
    'Folder/distance':
      '81 KMZ reais; sem ele o Pilot 2 mostrou 100 % e 00:00 a meio (voo M3E 2026-09)',
    'Folder/duration':
      '81 KMZ reais; sem ele o Pilot 2 mostrou 100 % e 00:00 a meio (voo M3E 2026-09)',
  },
  // valores fora do enum da tabela
  values: {
    'droneInfo/droneEnumValue': {
      99: 'M4T: KMZ aceite e voado (2026-10); o M4 nao esta na documentacao clonada',
    },
    'droneInfo/droneSubEnumValue': { 1: 'M4T: sub-enum 1 (extrapolacao do M3T); voado 2026-10' },
    'payloadInfo/payloadEnumValue': {
      50: 'Zenmuse P1: 15 KMZ reais do Pilot 2 escrevem 50/1',
      65535: 'PSDK: 66 KMZ reais do Pilot 2 escrevem 65535/0 (a tabela diz 65534)',
      89: 'M4T: KMZ aceite e voado (2026-10)',
    },
  },
  // obrigatórios que ficam de fora, com a razão (E2 da revisão)
  missing: {
    'waylineCoordinateSysParam/globalShootHeight':
      'so nos templates de mapeamento (o exemplo da documentacao e um mapping2d); o template waypoint voou no M3E e no M4T sem ele',
    'waylineCoordinateSysParam/surfaceFollowModeEnable': 'idem globalShootHeight',
    'actionActuatorFuncParam/fileSuffix@takePhoto':
      'tolerado nos voos do M3E e do M4T; a decidir o valor com um ficheiro real',
    'actionActuatorFuncParam/fileSuffix@startRecord': 'idem takePhoto',
  },
  // elementos escritos para aeronaves fora da coluna de suporte (M3 da revisão, pacote B)
  unsupported: {
    'actionActuatorFuncParam/payloadLensIndex@takePhoto': {
      'M3E/M3T/M3M':
        'B2 da revisao: a lente por accao no M4T (classe M3E na validacao); a tabela so lista M30/M3D — a confirmar com um KMZ termico do Pilot 2 no M4T',
    },
    'actionActuatorFuncParam/payloadLensIndex@startRecord': {
      'M3E/M3T/M3M': 'idem takePhoto',
    },
    'Placemark/useStraightLine': {
      'M300 RTK':
        'escrito tambem no M300, onde a especificacao nao o suporta (ignorado): M3 aplicado — nessas aeronaves so passam sem parar os pontos colineares (exporters.js, NO_STRAIGHT_LINE_DRONES)',
      'M350 RTK': 'idem M300',
    },
    'Folder/globalUseStraightLine#waypoint': {
      'M300 RTK': 'idem useStraightLine',
      'M350 RTK': 'idem',
    },
  },
  // filhos que os exemplos da especificação não mostram: posição aceite
  order: [
    {
      file: '*',
      parent: 'missionConfig',
      name: 'globalRTHHeight',
      after: 'takeOffSecurityHeight',
      why: 'so na tabela (waylines-wpml.md); sem exemplo',
    },
    {
      file: 'template',
      parent: 'Folder',
      name: 'payloadParam',
      after: 'waylineCoordinateSysParam',
      why: 'so na tabela; voou no M4T nesta posicao',
    },
    {
      file: 'waylines',
      parent: 'Folder',
      name: 'distance',
      after: 'waylineId',
      why: '81 KMZ reais: entre waylineId e autoFlightSpeed',
    },
    {
      file: 'waylines',
      parent: 'Folder',
      name: 'duration',
      after: 'distance',
      why: '81 KMZ reais',
    },
    {
      file: '*',
      parent: 'payloadInfo',
      name: 'payloadSubEnumValue',
      after: 'payloadEnumValue',
      why: '81 KMZ reais',
    },
    {
      file: '*',
      parent: 'waypointHeadingParam',
      name: 'waypointHeadingAngleEnable',
      after: 'waypointPoiPoint',
      why: '81 KMZ reais',
    },
    {
      file: 'template',
      parent: 'Placemark',
      name: 'waypointHeadingParam',
      after: 'useGlobalHeadingParam',
      why: 'tabela: obrigatorio se useGlobalHeadingParam 0; o exemplo nao o mostra',
    },
    {
      file: 'template',
      parent: 'Placemark',
      name: 'waypointTurnParam',
      after: 'useGlobalTurnParam',
      why: 'tabela: obrigatorio se useGlobalTurnParam 0; o exemplo nao o mostra',
    },
    {
      file: 'template',
      parent: 'Placemark',
      name: 'useStraightLine',
      after: ['waypointTurnParam', 'useGlobalTurnParam'],
      why: 'tabela (a seguir aos parametros de viragem); o exemplo nao o mostra',
    },
    {
      file: 'waylines',
      parent: 'Placemark',
      name: 'useStraightLine',
      after: 'waypointTurnParam',
      why: 'tabela; o exemplo nao o mostra',
    },
    {
      file: 'template',
      parent: 'Folder',
      name: 'name',
      before: 'templateType',
      why: 'KML 2.2: o nome do Folder vem primeiro',
    },
    {
      file: 'template',
      parent: 'Folder',
      name: 'globalHeight',
      after: 'autoFlightSpeed',
      why: 'tabela do template waypoint; o exemplo da documentacao e de mapeamento',
    },
    {
      file: '*',
      parent: 'actionActuatorFuncParam',
      name: 'gimbalHeadingYawBase',
      before: 'gimbalRotateMode',
      why: 'tabela do gimbalRotate (primeiro parametro); o exemplo nao o mostra',
    },
    {
      file: '*',
      parent: 'actionActuatorFuncParam',
      name: 'payloadLensIndex',
      after: 'payloadPositionIndex',
      why: 'tabela do takePhoto (payloadPositionIndex, fileSuffix, payloadLensIndex, useGlobalPayloadLensIndex); o exemplo nao o mostra',
    },
    {
      file: '*',
      parent: 'actionActuatorFuncParam',
      name: 'useGlobalPayloadLensIndex',
      after: 'payloadLensIndex',
      why: 'tabela do takePhoto (ultimo parametro); o exemplo nao o mostra',
    },
    {
      file: '*',
      parent: 'actionActuatorFuncParam',
      name: 'hoverTime',
      before: 'gimbalRotateMode',
      why: 'tabela do hover (common-element.md, linha 178): hoverTime e o unico parametro; os exemplos nao tem hover',
    },
    {
      file: '*',
      parent: 'actionTrigger',
      name: 'actionTriggerParam',
      after: 'actionTriggerType',
      why: 'tabela do actionTrigger; o exemplo e um reachPoint sem parametro',
    },
  ],
}

/* ---- árvore ----------------------------------------------------------- */
// parseTagValue false: o texto fica como está escrito («1e2» não vira 100)
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
})
const local = (n) => n.replace(/^wpml:/, '')

/** Nós {name, parent, children, text, path} a partir do XML (ordem preservada). */
export function parseNodes(xml) {
  const tree = parser.parse(xml)
  const out = []
  const walk = (nodes, parent, path) => {
    for (const n of nodes) {
      const raw = Object.keys(n).find((k) => k !== ':@')
      if (raw === '#text' || raw === '?xml') continue
      const kids = n[raw]
      const text =
        kids.length === 1 && kids[0]['#text'] !== undefined
          ? String(kids[0]['#text'])
          : kids.length === 0
            ? ''
            : null
      const node = { name: local(raw), parent, children: [], text, path: `${path}/${local(raw)}` }
      out.push(node)
      if (parent) parent.children.push(node)
      if (text == null) walk(kids, node, node.path)
    }
  }
  walk(tree, null, '')
  return out
}

const byName = (node, name) => node.children.find((c) => c.name === name)
/** Texto canónico de um nó (nomes e textos, sem espaços), para comparar entre ficheiros. */
const serialize = (node) =>
  node.text != null
    ? `${node.name}=${node.text}`
    : `${node.name}(${node.children.map(serialize).join(',')})`
const textOf = (node, name) => byName(node, name)?.text ?? null

/* ---- dicionário ------------------------------------------------------- */
function lookup(parentName, name, { action = null, template = null } = {}) {
  const base = `${parentName}/${name}`
  const ids = []
  if (action) ids.push(`${base}@${action}`)
  if (template) ids.push(`${base}#${template}`)
  ids.push(base)
  for (const id of ids) if (SPEC.elements[id]) return { id, entry: SPEC.elements[id] }
  return null
}
function docFor(entry, fileKind) {
  return entry.docs[DOC_OF[fileKind]] ?? entry.docs[COMMON] ?? Object.values(entry.docs)[0]
}
const isEnumType = (doc) =>
  /enum/i.test(doc.type) || (Array.isArray(doc.values) && !/bool/i.test(doc.type))
const isBool = (doc) => /bool/i.test(doc.type)
const isNumeric = (doc) => /^(int|integer|float|double)$/i.test(doc.type.trim())
const DECIMAL = /^-?\d+(\.\d+)?$/

/* ---- KML 2.2 (fora das tabelas WPML) ---------------------------------- */
const KML_CHILDREN = {
  kml: ['Document'],
  Document: ['author', 'createTime', 'updateTime', 'missionConfig', 'Folder'],
  Point: ['coordinates'],
}
const KML_CORE = new Set(['kml', 'Document', 'Folder', 'Placemark', 'Point', 'coordinates', 'name'])

/* ---- T2 --------------------------------------------------------------- */
/** Um par pai→filho aparece nos exemplos XML da especificação? */
function inExamples(parentName, name) {
  return Object.values(SPEC.examples).some((ex) => ex[parentName]?.includes(name))
}

/** Intervalos que não se aplicam a um valor que a própria especificação exemplifica. */
const RANGE_EXCEPTIONS = {
  // (0, ...] só quando o amortecimento é obrigatório; nos modos de paragem o
  // exemplo da DJI escreve 0 (waylines-wpml.md, exemplo do Placemark)
  'waypointTurnParam/waypointTurnDampingDist': (node) => node.text === '0',
}

function validateFile(xml, fileKind, aircraft, errors) {
  const v = XMLValidator.validate(xml)
  if (v !== true) {
    errors.push({ code: 'xml-invalid', file: fileKind, detail: JSON.stringify(v) })
    return null
  }
  if (xml.charCodeAt(0) === 0xfeff) errors.push({ code: 'bom', file: fileKind })
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
    errors.push({ code: 'xml-declaration', file: fileKind })
  const nodes = parseNodes(xml)
  const folder = nodes.find((n) => n.name === 'Folder')
  const templateKind =
    fileKind === 'template' ? (textOf(folder, 'templateType') ?? 'waypoint') : null
  const requiredSeen = new Map() // parent node -> Set(child names)

  for (const node of nodes) {
    if (!node.parent) continue
    const parentName = node.parent.name
    // contexto: parâmetros de uma acção (takePhoto, gimbalRotate...)
    const action =
      parentName === 'actionActuatorFuncParam'
        ? textOf(node.parent.parent, 'actionActuatorFunc')
        : null
    const key = `${parentName}/${node.name}`
    if (KML_CHILDREN[parentName]) {
      if (!KML_CHILDREN[parentName].includes(node.name))
        errors.push({ code: 'unknown-element', file: fileKind, path: node.path })
      continue
    }
    const found = lookup(parentName, node.name, { action, template: templateKind })
    if (!found) {
      if (ALLOW.elements[key]) continue
      if (KML_CORE.has(node.name) && KML_CORE.has(parentName)) continue
      // os exemplos da especificação também são especificação (Placemark/actionGroup, Document/missionConfig...)
      if (inExamples(parentName, node.name)) continue
      errors.push({ code: 'unknown-element', file: fileKind, path: node.path, key })
      continue
    }
    const { id, entry } = found
    const doc = docFor(entry, fileKind)
    // suporte por aeronave
    if (aircraft && doc.support.length > 0 && !doc.support.includes(aircraft)) {
      const ok = ALLOW.unsupported[id]?.[aircraft]
      if (!ok)
        errors.push({
          code: 'unsupported',
          file: fileKind,
          path: node.path,
          key: id,
          aircraft,
          support: doc.support,
        })
    }
    if (node.text == null) continue
    const text = node.text
    if (isBool(doc)) {
      if (!['0', '1'].includes(text))
        errors.push({ code: 'bool', file: fileKind, path: node.path, value: text })
    } else if (isEnumType(doc) && doc.values) {
      if (!doc.values.includes(text) && !ALLOW.values[id]?.[text])
        errors.push({
          code: 'enum',
          file: fileKind,
          path: node.path,
          value: text,
          allowed: doc.values,
        })
    } else if (isNumeric(doc)) {
      if (!DECIMAL.test(text))
        errors.push({ code: 'number-format', file: fileKind, path: node.path, value: text })
      else {
        if (/^int/i.test(doc.type) && text.includes('.'))
          errors.push({ code: 'integer', file: fileKind, path: node.path, value: text })
        const r = doc.range
        const n = Number(text)
        if (r && !(RANGE_EXCEPTIONS[id]?.(node) ?? false)) {
          const low = r.minOpen ? n > r.min : n >= r.min
          const high = r.max == null ? true : r.maxOpen ? n < r.max : n <= r.max
          if (!(low && high))
            errors.push({ code: 'range', file: fileKind, path: node.path, value: text, range: r })
        }
      }
    }
    // texto que nunca deve sair tal e qual
    if (/undefined|NaN|null|Infinity|\[object/.test(text))
      errors.push({ code: 'garbage', file: fileKind, path: node.path, value: text })
    const set = requiredSeen.get(node.parent) ?? new Set()
    set.add(node.name)
    requiredSeen.set(node.parent, set)
  }

  // obrigatórios: por cada instância de pai, os filhos «Yes» da tabela
  // desse documento (ou da comum) e suportados pela aeronave
  const parents = nodes.filter((n) => n.text == null)
  for (const p of parents) {
    const present = new Set(p.children.map((c) => c.name))
    const action =
      p.name === 'actionActuatorFuncParam' ? textOf(p.parent, 'actionActuatorFunc') : null
    for (const [id, entry] of Object.entries(SPEC.elements)) {
      if (entry.parent !== p.name) continue
      if (entry.action && entry.action !== action) continue
      if (!entry.action && action) continue
      if (entry.template && entry.template !== templateKind) continue
      const doc = entry.docs[DOC_OF[fileKind]] ?? (entry.docs[COMMON] ? entry.docs[COMMON] : null)
      if (!doc || doc.required !== 'yes') continue
      if (aircraft && doc.support.length > 0 && !doc.support.includes(aircraft)) continue
      if (present.has(entry.element)) continue
      if (ALLOW.missing[id]) continue
      errors.push({ code: 'missing', file: fileKind, path: `${p.path}/${entry.element}`, key: id })
    }
  }
  conditionalRules(nodes, fileKind, aircraft, errors)
  orderRules(nodes, fileKind, errors)
  return nodes
}

/* ---- «obrigatório se…», codificado à mão a partir das tabelas ---------- */
function conditionalRules(nodes, fileKind, aircraft, errors) {
  const straightSupported =
    !aircraft ||
    SPEC.elements['Placemark/useStraightLine'].docs[DOC_OF[fileKind]].support.includes(aircraft)
  for (const p of nodes.filter((n) => n.name === 'Placemark')) {
    const need = (flag, child) => {
      if (textOf(p, flag) === '0' && !byName(p, child))
        errors.push({
          code: 'conditional',
          file: fileKind,
          path: `${p.path}/${child}`,
          why: `${flag} 0`,
        })
    }
    if (fileKind === 'template') {
      need('useGlobalHeight', 'height')
      need('useGlobalHeight', 'ellipsoidHeight')
      need('useGlobalSpeed', 'waypointSpeed')
      need('useGlobalHeadingParam', 'waypointHeadingParam')
      need('useGlobalTurnParam', 'waypointTurnParam')
    }
    const turn = byName(p, 'waypointTurnParam')
    if (turn) {
      const mode = textOf(turn, 'waypointTurnMode')
      const damping = Number(textOf(turn, 'waypointTurnDampingDist'))
      const straight = textOf(p, 'useStraightLine')
      if (mode === 'coordinateTurn' && !(damping > 0))
        errors.push({
          code: 'conditional',
          file: fileKind,
          path: `${turn.path}/waypointTurnDampingDist`,
          why: 'coordinateTurn exige amortecimento > 0',
        })
      if (mode === 'toPointAndPassWithContinuityCurvature' && straight === '1' && !(damping > 0))
        errors.push({
          code: 'conditional',
          file: fileKind,
          path: `${turn.path}/waypointTurnDampingDist`,
          why: 'passagem com useStraightLine 1 exige amortecimento > 0',
        })
      if (straightSupported && /ContinuityCurvature$/.test(mode ?? '') && straight == null)
        errors.push({
          code: 'conditional',
          file: fileKind,
          path: `${p.path}/useStraightLine`,
          why: `${mode} exige useStraightLine`,
        })
    }
    const heading = byName(p, 'waypointHeadingParam')
    if (heading) {
      const mode = textOf(heading, 'waypointHeadingMode')
      if (mode === 'smoothTransition' && textOf(heading, 'waypointHeadingAngle') == null)
        errors.push({
          code: 'conditional',
          file: fileKind,
          path: `${heading.path}/waypointHeadingAngle`,
          why: 'smoothTransition',
        })
      if (mode === 'towardPOI' && textOf(heading, 'waypointPoiPoint') == null)
        errors.push({
          code: 'conditional',
          file: fileKind,
          path: `${heading.path}/waypointPoiPoint`,
          why: 'towardPOI',
        })
    }
  }
  for (const t of nodes.filter((n) => n.name === 'actionTrigger')) {
    const type = textOf(t, 'actionTriggerType')
    if (
      (type === 'multipleTiming' || type === 'multipleDistance') &&
      !(Number(textOf(t, 'actionTriggerParam')) > 0)
    )
      errors.push({
        code: 'conditional',
        file: fileKind,
        path: `${t.path}/actionTriggerParam`,
        why: `${type} exige actionTriggerParam > 0`,
      })
  }
  const seenGroupIds = new Set()
  for (const g of nodes.filter((n) => n.name === 'actionGroup')) {
    const id = textOf(g, 'actionGroupId')
    if (seenGroupIds.has(id))
      errors.push({ code: 'duplicate-id', file: fileKind, path: g.path, value: id })
    seenGroupIds.add(id)
    const a = Number(textOf(g, 'actionGroupStartIndex'))
    const b = Number(textOf(g, 'actionGroupEndIndex'))
    if (!(b >= a))
      errors.push({
        code: 'conditional',
        file: fileKind,
        path: g.path,
        why: 'actionGroupEndIndex < actionGroupStartIndex',
      })
    const actionIds = g.children
      .filter((c) => c.name === 'action')
      .map((c) => textOf(c, 'actionId'))
    if (new Set(actionIds).size !== actionIds.length)
      errors.push({
        code: 'duplicate-id',
        file: fileKind,
        path: g.path,
        value: actionIds.join(','),
      })
  }
  // índices contínuos a partir de 0
  const idx = nodes.filter((n) => n.name === 'Placemark').map((p) => Number(textOf(p, 'index')))
  idx.forEach((v, i) => {
    if (v !== i) errors.push({ code: 'index', file: fileKind, value: `${v} na posição ${i}` })
  })
}

/* ---- T3: ordem dos filhos --------------------------------------------- */
function orderRules(nodes, fileKind, errors) {
  const examples = SPEC.examples[EXAMPLE_OF[fileKind]]
  const allowed = ALLOW.order.filter((o) => o.file === '*' || o.file === fileKind)
  for (const p of nodes.filter((n) => n.text == null && n.children.length > 0)) {
    // waypointHeadingParam e globalWaypointHeadingParam têm os mesmos filhos
    // (common-element.md): o exemplo mais completo serve aos dois
    const alias = {
      waypointHeadingParam: 'globalWaypointHeadingParam',
      globalWaypointHeadingParam: 'waypointHeadingParam',
    }
    const candidates = [
      examples[p.name],
      SPEC.examples['template.kml'][alias[p.name]],
      SPEC.examples['waylines.wpml'][alias[p.name]],
    ].filter(Boolean)
    const example = candidates.sort((a, b) => b.length - a.length)[0]
    if (!example) continue
    const seq = []
    for (const c of p.children) if (!seq.includes(c.name)) seq.push(c.name)
    // ordem esperada: o exemplo, com os extras aceites inseridos atrás do seu «after»
    const expected = [...example]
    for (const name of seq) {
      if (expected.includes(name)) continue
      const rule = allowed.find((o) => o.parent === p.name && o.name === name)
      if (!rule) {
        errors.push({ code: 'order-unknown', file: fileKind, path: `${p.path}/${name}` })
        continue
      }
      if (rule.before) {
        const at = expected.indexOf(rule.before)
        expected.splice(at < 0 ? 0 : at, 0, name)
      } else {
        // `after` pode ser uma lista de âncoras: vale a primeira presente
        const anchors = [].concat(rule.after)
        const at = anchors.map((a) => expected.indexOf(a)).find((i) => i >= 0) ?? -1
        expected.splice(at < 0 ? expected.length : at + 1, 0, name)
      }
    }
    const positions = seq.map((n) => expected.indexOf(n))
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] >= 0 && positions[i - 1] >= 0 && positions[i] < positions[i - 1]) {
        errors.push({
          code: 'order',
          file: fileKind,
          path: p.path,
          sequence: seq.join(','),
          expected: expected.join(','),
        })
        break
      }
    }
  }
}

/* ---- T4: coerência template ↔ waylines -------------------------------- */
function coherence(tpl, wl, errors) {
  const tp = tpl.filter((n) => n.name === 'Placemark')
  const wp = wl.filter((n) => n.name === 'Placemark')
  if (tp.length !== wp.length) {
    errors.push({
      code: 'coherence',
      detail: `${tp.length} Placemarks no template, ${wp.length} no waylines`,
    })
    return
  }
  const coord = (p) => textOf(byName(p, 'Point'), 'coordinates')
  tp.forEach((p, i) => {
    if (coord(p) !== coord(wp[i]))
      errors.push({ code: 'coherence', detail: `coordenadas diferentes no waypoint ${i}` })
    const h = textOf(p, 'height')
    const eh = textOf(wp[i], 'executeHeight')
    if (h != null && eh != null && Number(h) !== Number(eh))
      errors.push({
        code: 'coherence',
        detail: `height ${h} vs executeHeight ${eh} no waypoint ${i}`,
      })
    const ownTurn = byName(p, 'waypointTurnParam')
    const wlTurn = byName(wp[i], 'waypointTurnParam')
    if (
      ownTurn &&
      wlTurn &&
      textOf(ownTurn, 'waypointTurnMode') !== textOf(wlTurn, 'waypointTurnMode')
    )
      errors.push({ code: 'coherence', detail: `modo de viragem diferente no waypoint ${i}` })
  })
  const tf = tpl.find((n) => n.name === 'Folder')
  const wf = wl.find((n) => n.name === 'Folder')
  if (textOf(tf, 'templateId') !== textOf(wf, 'templateId'))
    errors.push({ code: 'coherence', detail: 'templateId' })
  if (Number(textOf(tf, 'autoFlightSpeed')) !== Number(textOf(wf, 'autoFlightSpeed')))
    errors.push({ code: 'coherence', detail: 'autoFlightSpeed' })
  const hm = textOf(byName(tf, 'waylineCoordinateSysParam'), 'heightMode')
  const ehm = textOf(wf, 'executeHeightMode')
  const pair = { relativeToStartPoint: 'relativeToStartPoint', WGS84: 'WGS84', EGM96: 'WGS84' }
  if (pair[hm] !== ehm)
    errors.push({ code: 'coherence', detail: `heightMode ${hm} vs executeHeightMode ${ehm}` })
  const gmode = textOf(tf, 'globalWaypointTurnMode')
  wp.forEach((p, i) => {
    const own = byName(tp[i], 'waypointTurnParam')
    const mode = textOf(byName(p, 'waypointTurnParam'), 'waypointTurnMode')
    if (!own && mode !== gmode)
      errors.push({
        code: 'coherence',
        detail: `waypoint ${i}: ${mode} no waylines sem viragem própria no template (${gmode})`,
      })
  })
  // M2: os grupos de acções e os rumos próprios são os mesmos nos dois ficheiros
  const groupsOf = (p) =>
    p.children
      .filter((c) => c.name === 'actionGroup')
      .map(serialize)
      .join('|')
  const headingOf = (p) => {
    const h = byName(p, 'waypointHeadingParam')
    return h ? serialize(h) : null
  }
  wp.forEach((p, i) => {
    if (groupsOf(tp[i]) !== groupsOf(p))
      errors.push({ code: 'coherence', detail: `grupos de acções diferentes no waypoint ${i}` })
    const th = headingOf(tp[i])
    if (th != null && th !== headingOf(p))
      errors.push({ code: 'coherence', detail: `rumo diferente no waypoint ${i}` })
    if (
      th == null &&
      textOf(byName(p, 'waypointHeadingParam'), 'waypointHeadingMode') === 'smoothTransition'
    )
      errors.push({
        code: 'coherence',
        detail: `waypoint ${i}: rumo proprio no waylines sem rumo no template`,
      })
  })
  const tm = tpl.find((n) => n.name === 'missionConfig')
  const wm = wl.find((n) => n.name === 'missionConfig')
  for (const k of [
    'flyToWaylineMode',
    'finishAction',
    'exitOnRCLost',
    'executeRCLostAction',
    'takeOffSecurityHeight',
    'globalTransitionalSpeed',
  ])
    if (textOf(tm, k) !== textOf(wm, k))
      errors.push({ code: 'coherence', detail: `missionConfig/${k}` })
}

/**
 * Valida um par template.kml + waylines.wpml. `aircraft` vem do
 * droneEnumValue quando não é dado. Devolve { errors } (vazio = conforme).
 */
export function validateWpml({ template, waylines, aircraft = null }) {
  const errors = []
  const droneEnum = Number(waylines.match(/<wpml:droneEnumValue>(\d+)</)?.[1])
  const name = aircraft ?? AIRCRAFT_OF[droneEnum] ?? CLASS_OF[droneEnum] ?? null
  const tpl = validateFile(template, 'template', name, errors)
  const wl = validateFile(waylines, 'waylines', name, errors)
  if (tpl && wl) coherence(tpl, wl, errors)
  return { errors, aircraft: name }
}

/* ---- T7: empacotamento ------------------------------------------------ */
export async function validateKmz(bytes) {
  const errors = []
  const zip = await JSZip.loadAsync(bytes)
  const files = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .sort()
  if (files.join(',') !== 'wpmz/template.kml,wpmz/waylines.wpml')
    errors.push({ code: 'kmz-entries', files })
  const template = files.includes('wpmz/template.kml')
    ? await zip.file('wpmz/template.kml').async('string')
    : null
  const waylines = files.includes('wpmz/waylines.wpml')
    ? await zip.file('wpmz/waylines.wpml').async('string')
    : null
  if (template && waylines) errors.push(...validateWpml({ template, waylines }).errors)
  return { errors, template, waylines }
}

/** Texto legível de uma lista de erros, para a mensagem do teste. */
export function describeErrors(errors) {
  return errors.map((e) => JSON.stringify(e)).join('\n')
}
