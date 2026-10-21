/**
 * Orçamento de tamanho do pacote produzido.
 *
 * A aplicação é servida como um sítio estático e é usada em campo, muitas
 * vezes por ligação móvel, por isso o peso do JavaScript é um requisito e não
 * um detalhe. Este guarda-costas falha a construção quando o total cresce
 * acima do orçamento, para uma dependência pesada acrescentada por descuido
 * aparecer na revisão em vez de só no terreno.
 *
 * Ajustar BUDGET_KB deliberadamente, com a justificação no commit.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 2200 → 2250 no pacote R-B da revisão do código (2026-10): o dicionário dos
// erros com código (41 mensagens PT/EN) e os textos do preflight; nenhuma
// dependência nova. O total ia em 2203 KB.
// 2250 → 2400 nas actualizações de Outubro de 2026: React 19 (o react-dom
// cresce 77 KB) e three 0.186 (a vista 3D cresce 54 KB). O total ia em
// 2354 KB; o orçamento continua a obrigar a uma decisão por cada subida.
// 2400 → 2450 no lote dos parâmetros de missão (Outubro de 2026): a legenda
// do mapa e da vista 3D, o corredor partido em voos, a descolagem numa base,
// o intervalo manual, o rumo fixo, as alturas de segurança, os cantos da
// face, o campo numérico partilhado e os textos PT/EN e da ajuda; nenhuma
// dependência nova. O lote acrescenta 45 KB (2361 → 2406 KB).
// 2450 → 2500 na conversão para o desenho aprovado (fase 1, Outubro de
// 2026): o cabeçalho com o menu do projecto e o botão de exportar partido,
// a lista do preflight com as tabelas dos avisos repetidos, os componentes
// partilhados (src/components/ui), a barra dos modos com ícones, a barra de
// desenho sobre o mapa, os primeiros passos, o cartão de métricas com a
// barra do voo mais longo, a legenda com os símbolos do mapa e
// interruptores, e os textos PT/EN e da ajuda; nenhuma dependência de
// JavaScript nova (a letra Inter são ficheiros .woff2, que não contam). As
// duas partes acrescentam 31 + 22 KB (2435 → 2489 KB).
// 2500 → 2625 na fase 2 da conversão para o desenho aprovado (Outubro de
// 2026). O painel da área: as sete secções que fecham, com o resumo de cada
// uma numa linha, a tabela das bases com o detalhe na linha, o «Resumo e
// exportar» com a tabela dos voos e as exportações em linhas, as gavetas em
// grupos, o interruptor e o controlo segmentado partilhados
// (src/components/ui) — 27 KB. As janelas: a configuração em quatro secções
// com índice e esquemas, a ajuda com índice de tópicos e pesquisa (os textos
// de sempre, PT e EN, arrumados em 26 tópicos), o aviso em pontos numerados,
// a legenda da vista 3D nas cores da cena com a escala do relevo, o perfil
// com a folga mínima em destaque e as peças comuns das janelas
// (src/components/ui/Window.jsx) — 51 KB: 36 no pacote principal, 11 na
// vista 3D e 4 no perfil, que se carregam à parte. Os painéis da face, da
// órbita, do corredor e do circular em secções, com as peças partilhadas
// dos modos (src/components/ModePanel.jsx) — 48 KB. Nenhuma dependência
// nova; os textos PT/EN de tudo isto. O total ia em cerca de 2617 KB.
// 2625 → 2770 na fase 3 da conversão (Outubro de 2026), parte da operação do
// dia e do tablet: o painel «Operação do dia» à direita do mapa (os três
// números do dia, o voo seguinte e a ordem do dia, uma linha por voo com a
// barra contra o tempo útil) — 16 KB; os seus textos PT/EN e os do tablet
// (src/i18n/dict.operation.js) — 6 KB; o tópico novo da ajuda, PT e EN — 6
// KB; o voo em foco e os feitos no mapa, e o registo de voos da checklist
// lido e escrito pelo painel (src/mission/dayPlan.js, useFlightLog.js,
// useDayOperation.js) — 7 KB; o cabeçalho do tablet com o menu «Mais», o
// botão «Painel» e a folha que se recolhe — 4 KB. Nenhuma dependência nova.
// E o relatório da missão do desenho novo: a barra com as secções, a
// identificação, a operação e a legenda ao lado do mapa, a tabela «Voos por
// base» com a ficha de cada base numa linha (barra contra o tempo útil, a
// linha comum, as fichas inteiras num botão), a segurança, o preflight com
// as peças da lista do cabeçalho e as regras de impressão do A4, com os
// textos PT/EN — 30 KB, quase todos no bloco do relatório, que só se carrega
// ao abrir. Nenhuma dependência nova.
// E a checklist de campo e a folha A4 de cada base: as fases em separadores,
// os grupos que fecham, os itens para luvas, o selector de voo, os cartões
// das bases, a folha A4 (o aviso da zona, a régua, as alturas e o alcance,
// os voos, o registo para preencher à mão, em várias páginas com muitos
// voos) com a impressão de uma ou de todas, o registo de voos partilhado com
// o planeador, e os textos PT/EN — cerca de 64 KB; e uma dependência nova, o
// lean-qr 2.7.4 (MIT, sem dependências), que codifica o código QR do ponto
// da base — 7 KB. As três partes juntas: 2620 → cerca de 2760 KB.
const BUDGET_KB = 2770
// fileURLToPath e não .pathname: este descodifica percent-encoding e trata
// os caminhos do Windows, o outro devolve-os em bruto.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}

let files
try {
  files = walk(DIST)
} catch {
  console.error('dist/ não existe — correr `npm run build` primeiro.')
  process.exit(1)
}

const js = files.filter((f) => f.endsWith('.js'))
const totalKb = Math.round(js.reduce((s, f) => s + statSync(f).size, 0) / 1024)

const biggest = js
  .map((f) => [f.replace(DIST, ''), Math.round(statSync(f).size / 1024)])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)

console.log(`JavaScript total: ${totalKb} KB (orçamento ${BUDGET_KB} KB)`)
for (const [name, kb] of biggest) console.log(`  ${String(kb).padStart(5)} KB  ${name}`)

if (totalKb > BUDGET_KB) {
  console.error(`\nOrçamento excedido em ${totalKb - BUDGET_KB} KB.`)
  process.exit(1)
}
