#!/usr/bin/env node
/**
 * PONTO DE GUARDA DA REVISÃO ADVERSARIAL
 * ======================================
 * Os agentes de uma revisão escrevem o que encontram no `journal.jsonl` da
 * corrida, que vive no contentor da sessão — e o contentor é reciclado por
 * inactividade. Se a sessão morrer a meio (limite de tokens, timeout), o
 * trabalho de dezenas de agentes desaparece com ele.
 *
 * Este script extrai o journal para um ficheiro no repositório, que é o único
 * sítio durável: uma vez empurrado para o GitHub, sobrevive ao contentor.
 *
 * Correr SEMPRE que uma corrida termine, e de preferência também a meio de
 * corridas longas — é barato e idempotente.
 *
 *   node tools/checkpoint-revisao.mjs <caminho-do-journal.jsonl> [saida.json]
 *
 * A saída junta achados de VÁRIAS corridas: lê o ficheiro existente e funde
 * pela chave ficheiro+título, para uma segunda corrida não apagar a primeira.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const journalPath = process.argv[2]
const outPath = process.argv[3] ?? 'docs/revisao-achados.json'

if (!journalPath || !existsSync(journalPath)) {
  console.error(`journal não encontrado: ${journalPath}`)
  process.exit(1)
}

const linhas = readFileSync(journalPath, 'utf8').split('\n').filter((l) => l.trim())
const registos = linhas.map((l) => {
  try {
    return JSON.parse(l)
  } catch {
    return null // linha truncada: a corrida pode ter morrido a meio de uma escrita
  }
}).filter(Boolean)

const chave = (f) => `${f.file}::${f.title}`

/** Achados vêm de agentes cujo resultado traz `findings`. */
const achados = []
for (const r of registos) {
  if (r.type !== 'result') continue
  const v = r.result
  if (v && typeof v === 'object' && Array.isArray(v.findings)) {
    for (const f of v.findings) {
      if (f && f.file && f.title) achados.push({ ...f, agentId: r.agentId, agentKey: r.key })
    }
  }
}

/** Vereditos: resultado com `refuted`. A chave do agente diz de que achado é. */
const vereditos = registos
  .filter((r) => r.type === 'result' && r.result && typeof r.result === 'object' && typeof r.result.refuted === 'boolean')
  .map((r) => ({ agentId: r.agentId, agentKey: r.key, refuted: r.result.refuted, reason: r.result.reason }))

const falhas = registos.filter((r) => r.type === 'failed').length

// funde com o que já estivesse guardado, para não perder corridas anteriores
let anterior = { achados: [], vereditos: [], corridas: [] }
if (existsSync(outPath)) {
  try {
    anterior = JSON.parse(readFileSync(outPath, 'utf8'))
  } catch {
    console.warn('ficheiro anterior ilegível — começa do zero')
  }
}

const porChave = new Map()
for (const f of anterior.achados ?? []) porChave.set(chave(f), f)
for (const f of achados) porChave.set(chave(f), { ...porChave.get(chave(f)), ...f })

const saida = {
  nota: 'Extraído de journal.jsonl por tools/checkpoint-revisao.mjs. NÃO editar à mão.',
  corridas: [...new Set([...(anterior.corridas ?? []), journalPath])],
  resumo: {
    achados: porChave.size,
    vereditos: vereditos.length,
    agentes_falhados: falhas,
  },
  achados: [...porChave.values()].sort((a, b) => {
    const ordem = { alta: 0, media: 1, baixa: 2 }
    return (ordem[a.severity] ?? 3) - (ordem[b.severity] ?? 3)
  }),
  vereditos,
}

writeFileSync(outPath, JSON.stringify(saida, null, 2) + '\n')
console.log(`${saida.resumo.achados} achados, ${saida.resumo.vereditos} vereditos, ${falhas} agentes falhados -> ${outPath}`)
