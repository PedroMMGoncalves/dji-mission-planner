#!/usr/bin/env node
/**
 * MANIFESTO DE ESTADO DA REVISÃO
 * ==============================
 * O `checkpoint-revisao.mjs` salva os ACHADOS. Isto salva o que é preciso para
 * RETOMAR sem repetir trabalho, e sobrevive à morte do contentor porque vive no
 * repositório:
 *
 *  - que rondas já correram e sobre que áreas
 *  - que achados já têm veredicto, e qual
 *  - o runId e o scriptPath, para o resume barato enquanto a sessão viver
 *
 * Sem isto, uma sessão nova recomeça do zero e paga tudo outra vez. Com isto,
 * sabe o que já foi procurado e continua de onde ficou.
 *
 *   node tools/estado-revisao.mjs registar <ronda> <areas...>
 *   node tools/estado-revisao.mjs ver
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const FICHEIRO = 'docs/revisao-estado.json'
const vazio = { rondas: [], areasCobertas: [], runId: null, scriptPath: null, actualizado: null }

const ler = () => {
  if (!existsSync(FICHEIRO)) return { ...vazio }
  try {
    return { ...vazio, ...JSON.parse(readFileSync(FICHEIRO, 'utf8')) }
  } catch {
    return { ...vazio }
  }
}

const [cmd, ...resto] = process.argv.slice(2)
const estado = ler()

if (cmd === 'registar') {
  const [ronda, ...areas] = resto
  estado.rondas = [...estado.rondas.filter((r) => r.ronda !== ronda), { ronda, areas }]
  estado.areasCobertas = [...new Set([...estado.areasCobertas, ...areas])]
  estado.actualizado = process.env.STAMP ?? null
  writeFileSync(FICHEIRO, JSON.stringify(estado, null, 2) + '\n')
  console.log(
    `ronda "${ronda}" registada com ${areas.length} área(s); ${estado.areasCobertas.length} cobertas ao todo`,
  )
} else {
  let achados = { resumo: {}, achados: [] }
  if (existsSync('docs/revisao-achados.json')) {
    achados = JSON.parse(readFileSync('docs/revisao-achados.json', 'utf8'))
  }
  const porEstado = {}
  for (const a of achados.achados ?? []) {
    const e = a.estado ?? 'por tratar'
    porEstado[e] = (porEstado[e] ?? 0) + 1
  }
  console.log('rondas corridas:', estado.rondas.map((r) => r.ronda).join(', ') || '(nenhuma)')
  console.log('áreas cobertas:', estado.areasCobertas.length)
  console.log('achados:', achados.achados?.length ?? 0, porEstado)
}
