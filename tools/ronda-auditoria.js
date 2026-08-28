export const meta = {
  name: 'ronda-auditoria',
  description: 'UMA ronda de auditoria adversarial: procura, refuta com dois cepticos, critica a completude. Curta de proposito, para uma falha custar pouco.',
  phases: [
    { title: 'Procura', detail: 'procuradores sobre as areas desta ronda' },
    { title: 'Refutacao', detail: 'dois cepticos por achado; ambos a refutar matam' },
    { title: 'Completude', detail: 'o que esta ronda nao cobriu' },
  ],
}

/*
 * ECONOMIA, que e o ponto deste desenho:
 *
 *  - Uma RONDA por invocacao. A corrida anterior gastou 5,7 milhoes de tokens
 *    em duas tentativas e 87 agentes morreram sem entregar nada, porque tudo
 *    dependia de uma unica corrida chegar ao fim. Aqui, quem chama guarda o
 *    resultado entre rondas: uma falha custa uma ronda, nao a auditoria.
 *  - DOIS refutadores em vez de tres. O julgamento era 9x a procura; com dois
 *    passa a 6x. A regra muda em conformidade: bastam os dois a refutar.
 *  - O critico de completude corre EM CADA ronda, nao uma vez no fim. Na
 *    auditoria anterior correu uma so vez e encontrou sozinho um defeito de
 *    gravidade alta que nenhuma das dez lentes tinha visto.
 *  - `args.jaConhecidos` evita pagar outra vez pelo que ja se sabe.
 */

const A = args ?? {}
const AREAS = A.areas ?? []
const CONTEXTO = A.contexto ?? ''
const JA = A.jaConhecidos ?? []

const ACHADOS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          title: { type: 'string' },
          detail: { type: 'string' },
          failure: { type: 'string' },
          severity: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        },
        required: ['file', 'title', 'detail', 'failure', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VEREDICTO = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted', 'reason'],
}

const conhecidos = JA.length === 0 ? '(nenhum)' : JA.map((t) => `- ${t}`).join('\n')

const BASE = `${CONTEXTO}

JA CONHECIDOS — nao voltes a levantar nenhum destes, ja foram encontrados ou corrigidos:
${conhecidos}

O QUE CONTA COMO ACHADO: um defeito que produza um plano de voo errado, um ficheiro
exportado invalido, perda de dados do utilizador, um erro em execucao, ou um numero
errado mostrado ao operador. Cada achado TEM de trazer um cenario de falha concreto:
entradas especificas -> resultado errado, verificado com codigo corrido. Se nao
consegues nomear a entrada que parte, nao e achado.`

const LENTES = [
  { key: 'reproduz', ask: 'Tenta REPRODUZIR a falha com codigo node. Se nao produzires o comportamento errado descrito, esta refutado.' },
  { key: 'ja-tratado', ask: 'Procura no codigo circundante uma guarda, validacao ou caso especial que ja trate isto a montante ou a jusante. Le os chamadores. Se ja esta tratado, esta refutado.' },
]

phase('Procura')
log(`ronda "${A.ronda ?? '?'}": ${AREAS.length} area(s), ${JA.length} achados ja conhecidos`)

const porArea = await pipeline(
  AREAS,
  (area) => agent(`${BASE}\n\nLENTE: ${area.prompt}`, {
    label: `procura:${area.key}`, phase: 'Procura', schema: ACHADOS,
  }),
  (achados, area) => {
    const lista = achados?.findings ?? []
    if (lista.length === 0) return []
    return parallel(lista.map((f) => () =>
      parallel(LENTES.map((l) => () =>
        agent(`${BASE}

REFUTA este achado. Parte do principio de que esta errado e procura a prova. Na duvida, refuta.

FICHEIRO: ${f.file}${f.line ? ` (linha ${f.line})` : ''}
TITULO: ${f.title}
DESCRICAO: ${f.detail}
CENARIO ALEGADO: ${f.failure}

${l.ask}`, { label: `refuta:${l.key}:${f.file.split('/').pop()}`, phase: 'Refutacao', schema: VEREDICTO })))
        .then((votos) => {
          const validos = votos.filter(Boolean)
          return {
            ...f,
            area: area.key,
            votos: validos,
            julgado: validos.length >= 2,
            // com dois cepticos, ambos tem de refutar para matar
            sobrevive: validos.length >= 2 && validos.filter((v) => v.refuted).length < 2,
          }
        })))
  },
)

const todos = porArea.filter(Boolean).flat().filter(Boolean)
const confirmados = todos.filter((f) => f.sobrevive)
const naoJulgados = todos.filter((f) => !f.julgado)
log(`${todos.length} em bruto: ${confirmados.length} sobrevivem, ${naoJulgados.length} sem julgamento completo`)

phase('Completude')
const critico = await agent(`${BASE}

Esta ronda cobriu: ${AREAS.map((a) => a.key).join(', ')}.
Encontrou: ${confirmados.length === 0 ? '(nada)' : confirmados.map((f) => `${f.file}: ${f.title}`).join('; ')}

O que e que estas lentes NAO cobriram? Ficheiros que ninguem abriu, interaccoes entre
subsistemas que ninguem cruzou, classes de defeito que ninguem procurou. Procura TU
nessas lacunas e reporta so o que confirmares com codigo lido ou corrido.`,
  { label: 'critico', phase: 'Completude', schema: ACHADOS, effort: 'high' })

const lacunas = critico?.findings ?? []
const lacunasJulgadas = lacunas.length === 0 ? [] : (await parallel(lacunas.map((f) => () =>
  parallel(LENTES.map((l) => () =>
    agent(`${BASE}\n\nREFUTA: ${f.file} — ${f.title}\n${f.detail}\nCENARIO: ${f.failure}\n\n${l.ask}`,
      { label: `refuta-lacuna:${l.key}`, phase: 'Completude', schema: VEREDICTO })))
    .then((votos) => {
      const v = votos.filter(Boolean)
      return { ...f, area: 'completude', votos: v, julgado: v.length >= 2, sobrevive: v.length >= 2 && v.filter((x) => x.refuted).length < 2 }
    })))).filter(Boolean)

return {
  ronda: A.ronda ?? null,
  areas: AREAS.map((a) => a.key),
  brutos: todos.length + lacunas.length,
  confirmados: [...confirmados, ...lacunasJulgadas.filter((f) => f.sobrevive)]
    .map((f) => ({ file: f.file, line: f.line, severity: f.severity, title: f.title, detail: f.detail, failure: f.failure, area: f.area })),
  refutados: [...todos, ...lacunasJulgadas].filter((f) => f.julgado && !f.sobrevive).length,
  naoJulgados: [...naoJulgados, ...lacunasJulgadas.filter((f) => !f.julgado)]
    .map((f) => ({ file: f.file, severity: f.severity, title: f.title })),
}
