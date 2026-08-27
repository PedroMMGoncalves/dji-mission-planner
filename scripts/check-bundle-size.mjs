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

const BUDGET_KB = 2200
const DIST = new URL('../dist/', import.meta.url).pathname

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
