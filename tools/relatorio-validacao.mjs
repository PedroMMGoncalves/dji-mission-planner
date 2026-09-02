#!/usr/bin/env node
/**
 * Relatorio de validacao de campo: junta os JSON produzidos pela
 * ferramenta planeado-vs-medido (--json) de varias missoes de referencia,
 * avalia cada grandeza contra os criterios de docs/VALIDACAO.md e escreve
 * um Markdown com uma tabela por missao e o veredicto global.
 *
 *   node tools/relatorio-validacao.mjs --saida docs/validacao/RELATORIO.md \
 *     [--titulo "..."] [--nota "..."] R1=rel-r1.json R2=rel-r2.json ...
 *
 * Cada argumento NOME=ficheiro.json e uma missao; o nome aparece na tabela.
 * Um JSON com "rtk": true no bloco predicted.drone aplica os criterios RTK.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resumo } from './lib/criterios.mjs'

const argv = process.argv.slice(2)
const opts = {}
const missoes = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--'))
    opts[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  else {
    const [nome, ficheiro] = argv[i].split('=')
    if (nome && ficheiro) missoes.push({ nome, ficheiro })
  }
}
if (missoes.length === 0) {
  console.error('uso: relatorio-validacao --saida out.md [--titulo t] [--nota n] NOME=rel.json ...')
  process.exit(2)
}

const fmt = (v, unit) =>
  v == null
    ? '-'
    : `${Number.isInteger(v) ? v : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}${unit ? ` ${unit}` : ''}`
const out = []
out.push(`# ${opts.titulo ?? 'Relatorio de validacao de campo'}`)
out.push('')
out.push(`Gerado em ${new Date().toISOString().slice(0, 10)} por tools/relatorio-validacao.mjs.`)
if (opts.nota) {
  out.push('')
  out.push(`> ${opts.nota}`)
}
let todas = true
const sumario = []
for (const m of missoes) {
  const rel = JSON.parse(await readFile(m.ficheiro, 'utf8'))
  const rtk = rel?.predicted?.drone?.rtk === true
  const r = resumo(rel.rows ?? [], { rtk })
  todas = todas && r.passa
  sumario.push({
    nome: m.nome,
    ...r,
    hardware: `${rel?.predicted?.aircraftLabel ?? '?'} + ${rel?.predicted?.payloadLabel ?? '?'}${rtk ? ' (RTK)' : ''}`,
  })
  out.push('')
  out.push(`## ${m.nome}: ${rel?.predicted?.missionName ?? ''}`)
  out.push('')
  out.push(`- Hardware: ${sumario[sumario.length - 1].hardware}`)
  out.push(
    `- Veredicto: **${r.passa ? 'PASSA' : r.testadas === 0 ? 'SEM MEDICOES' : 'FALHA'}** (${r.testadas} grandezas avaliadas, ${r.falhas.length} fora de tolerancia)`,
  )
  out.push('')
  out.push('| Grandeza | Planeado | Medido | Desvio | Tolerancia | Estado |')
  out.push('|---|---:|---:|---:|---:|:---:|')
  for (const row of r.avaliadas) {
    const d =
      row.deviationPct == null
        ? '-'
        : `${row.deviationPct > 0 ? '+' : ''}${row.deviationPct.toFixed(1)} %`
    out.push(
      `| ${row.label} | ${fmt(row.planned, row.unit)} | ${fmt(row.measured, row.unit)} | ${d} | ${row.tolerance} | ${row.status} |`,
    )
  }
}
out.push('')
out.push('## Veredicto global')
out.push('')
out.push(`| Missao | Hardware | Avaliadas | Falhas | Veredicto |`)
out.push('|---|---|---:|---:|:---:|')
for (const s of sumario)
  out.push(
    `| ${s.nome} | ${s.hardware} | ${s.testadas} | ${s.falhas.length} | ${s.passa ? 'passa' : s.testadas === 0 ? 'sem medicoes' : 'falha'} |`,
  )
out.push('')
out.push(
  `**${todas ? 'Todas as missoes dentro dos criterios.' : 'Ha missoes fora dos criterios ou sem medicoes.'}**`,
)
const md = out.join('\n') + '\n'
if (opts.saida) {
  await mkdir(dirname(opts.saida), { recursive: true })
  await writeFile(opts.saida, md)
  console.log(`escrito ${opts.saida}`)
} else console.log(md)
process.exit(todas ? 0 : 1)
