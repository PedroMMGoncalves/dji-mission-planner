#!/usr/bin/env node
/*
 * Diferença semântica entre dois dicionários da especificação WPML
 * (tests/spec/wpml-spec.json, gerados por tools/wpml-spec.mjs): elementos
 * novos e removidos e, nos que ficam, o que mudou em cada documento —
 * tipo, unidade, enum, intervalo, obrigatoriedade, aeronaves suportadas,
 * descrição — e a ordem dos filhos nos exemplos. A linha e a secção não
 * contam (mudam com qualquer edição acima).
 *
 * Uso:  node tools/wpml-spec-diff.mjs antigo.json novo.json [--json]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FIELDS = [
  'type',
  'unit',
  'values',
  'ref',
  'range',
  'required',
  'note',
  'support',
  'description',
]
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
// a ordem dos valores de um enum não conta
const sameField = (field, a, b) =>
  field === 'values' && Array.isArray(a) && Array.isArray(b)
    ? same([...a].sort(), [...b].sort())
    : same(a, b)

/**
 * @returns {{added: string[], removed: string[], changed: Array<{id: string,
 *   doc: string, field: string, before: any, after: any}>, docsAdded: Array<{id: string, doc: string}>,
 *   docsRemoved: Array<{id: string, doc: string}>, examples: Array<{file: string, parent: string,
 *   before: string[]|null, after: string[]|null}>}}
 */
export function diffSpec(before, after) {
  const a = before.elements
  const b = after.elements
  const added = Object.keys(b).filter((k) => !a[k])
  const removed = Object.keys(a).filter((k) => !b[k])
  const changed = []
  const docsAdded = []
  const docsRemoved = []
  for (const id of Object.keys(a).filter((k) => b[k])) {
    for (const doc of new Set([...Object.keys(a[id].docs), ...Object.keys(b[id].docs)])) {
      const x = a[id].docs[doc]
      const y = b[id].docs[doc]
      if (!x) docsAdded.push({ id, doc })
      else if (!y) docsRemoved.push({ id, doc })
      else
        for (const field of FIELDS)
          if (!sameField(field, x[field], y[field]))
            changed.push({ id, doc, field, before: x[field], after: y[field] })
    }
  }
  const examples = []
  for (const file of new Set([...Object.keys(before.examples), ...Object.keys(after.examples)])) {
    const ea = before.examples[file] ?? {}
    const eb = after.examples[file] ?? {}
    for (const parent of new Set([...Object.keys(ea), ...Object.keys(eb)]))
      if (!same(ea[parent], eb[parent]))
        examples.push({ file, parent, before: ea[parent] ?? null, after: eb[parent] ?? null })
  }
  return { added, removed, changed, docsAdded, docsRemoved, examples }
}

/** Aeronaves acrescentadas e retiradas de uma lista de suporte. */
export function supportDelta(before, after) {
  const x = new Set(before ?? [])
  const y = new Set(after ?? [])
  return { plus: [...y].filter((s) => !x.has(s)), minus: [...x].filter((s) => !y.has(s)) }
}

/** Texto legível, agrupado por tipo de mudança. */
export function describeDiff(d, after) {
  const out = []
  const fmt = (v) => (v == null ? '—' : typeof v === 'string' ? v : JSON.stringify(v))
  out.push(`## Elementos novos (${d.added.length})`)
  for (const id of d.added) {
    const docs = after.elements[id].docs
    for (const [doc, x] of Object.entries(docs))
      out.push(
        `- ${id} [${doc}${x.anchor ? '#' + x.anchor : ''}] ${x.type}; valores ${fmt(x.values)}; intervalo ${fmt(x.range)}; obrigatório ${x.required}; suporte ${x.support.join(', ')}`,
      )
  }
  out.push('', `## Elementos removidos (${d.removed.length})`, ...d.removed.map((id) => `- ${id}`))
  out.push('', `## Documentos novos de um elemento existente (${d.docsAdded.length})`)
  for (const { id, doc } of d.docsAdded) {
    const x = after.elements[id].docs[doc]
    out.push(
      `- ${id} [${doc}] ${x.type}; valores ${fmt(x.values)}; intervalo ${fmt(x.range)}; obrigatório ${x.required}; suporte ${x.support.join(', ')}`,
    )
  }
  out.push(
    '',
    `## Documentos retirados de um elemento (${d.docsRemoved.length})`,
    ...d.docsRemoved.map((x) => `- ${x.id} [${x.doc}]`),
  )
  for (const field of FIELDS) {
    const list = d.changed.filter((c) => c.field === field)
    out.push('', `## Mudanças: ${field} (${list.length})`)
    for (const c of list) {
      if (field === 'support') {
        const { plus, minus } = supportDelta(c.before, c.after)
        out.push(
          `- ${c.id} [${c.doc}]: ${plus.length ? '+' + plus.join(', +') : ''}${minus.length ? ' -' + minus.join(', -') : ''}`,
        )
      } else out.push(`- ${c.id} [${c.doc}]: ${fmt(c.before)} → ${fmt(c.after)}`)
    }
  }
  out.push('', `## Ordem dos filhos nos exemplos (${d.examples.length})`)
  for (const e of d.examples)
    out.push(`- ${e.file} ${e.parent}: ${fmt(e.before)} → ${fmt(e.after)}`)
  return out.join('\n') + '\n'
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [oldPath, newPath] = process.argv.slice(2).filter((x) => !x.startsWith('--'))
  const before = JSON.parse(readFileSync(oldPath, 'utf8'))
  const after = JSON.parse(readFileSync(newPath, 'utf8'))
  const d = diffSpec(before, after)
  process.stdout.write(
    process.argv.includes('--json') ? JSON.stringify(d, null, 2) + '\n' : describeDiff(d, after),
  )
}
