/**
 * Impressões digitais do que a interface mostra e exporta, para a
 * repartição do App.jsx em hooks e componentes: cada passo muda código de
 * sítio sem mudar o comportamento, e as impressões de cada modo têm de sair
 * iguais às de tests/e2e/impressoes.json.
 *
 * De cada ficheiro exportado guarda-se um resumo (sha-256, 16 caracteres) do
 * texto sem as datas e com os números a 5 casas decimais: o bastante para
 * apanhar uma altura, um ângulo ou um waypoint a mais, sem depender do
 * último bit da vírgula flutuante de um Chromium para outro (o local e o do
 * CI não são o mesmo). Dos painéis guarda-se o texto, como o operador o lê.
 *
 *   E2E_IMPRESSOES=gravar npm run test:e2e   reescreve a referência
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import JSZip from 'jszip'

const REF = resolve('tests/e2e/impressoes.json')
const GRAVAR = process.env.E2E_IMPRESSOES === 'gravar'
const novas = {}

const resumo = (texto) => createHash('sha256').update(texto).digest('hex').slice(0, 16)

/** O texto de um ficheiro da missão sem datas e com os números a 5 casas. */
export function normalizar(texto) {
  return texto
    .replace(/<wpml:(createTime|updateTime)>\d+<\/wpml:\1>/g, '')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?/g, 'DATA')
    .replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(5))
}

/**
 * {ficheiro: resumo} de um KML, de um KMZ, de um ZIP de KMZ ou de um ZIP de
 * KML, pela ordem dos nomes.
 */
export async function impressaoFicheiro(file) {
  const bytes = readFileSync(file)
  if (!/\.(kmz|zip)$/i.test(file))
    return { [basename(file)]: resumo(normalizar(bytes.toString('utf8'))) }
  const out = {}
  const zip = await JSZip.loadAsync(bytes)
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name]
    if (f.dir) continue
    if (!name.endsWith('.kmz')) {
      out[name] = resumo(normalizar(await f.async('string')))
      continue
    }
    const kmz = await JSZip.loadAsync(await f.async('nodebuffer'))
    for (const n of Object.keys(kmz.files).sort())
      if (!kmz.files[n].dir)
        out[`${name}/${n}`] = resumo(normalizar(await kmz.files[n].async('string')))
  }
  return out
}

/**
 * Compara a impressão de um caso com a referência, campo a campo (um check
 * por campo); com E2E_IMPRESSOES=gravar guarda-a para gravarReferencia().
 * Numa diferença, a impressão de agora fica em `outDir` para o diff.
 */
export function conferir(caso, agora, check, outDir) {
  if (GRAVAR) {
    novas[caso] = agora
    check(`impressões: ${caso} gravada`, true)
    return
  }
  const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {}
  const esperada = ref[caso]
  if (!esperada) {
    writeFileSync(join(outDir, `impressao-${caso}.json`), JSON.stringify(agora, null, 2))
    check(`impressões: ${caso} tem referência (gravar com E2E_IMPRESSOES=gravar)`, false)
    return
  }
  let iguais = true
  for (const campo of [...new Set([...Object.keys(esperada), ...Object.keys(agora)])].sort()) {
    const e = JSON.stringify(esperada[campo] ?? null)
    const a = JSON.stringify(agora[campo] ?? null)
    if (a !== e) iguais = false
    check(
      `impressões: ${caso}, ${campo} igual à referência`,
      a === e,
      a === e ? '' : `referência ${e.slice(0, 160)} | agora ${a.slice(0, 160)}`,
    )
  }
  if (!iguais) writeFileSync(join(outDir, `impressao-${caso}.json`), JSON.stringify(agora, null, 2))
}

/** Escreve as impressões gravadas nesta corrida por cima das que já havia. */
export function gravarReferencia() {
  if (!GRAVAR || Object.keys(novas).length === 0) return
  const todas = { ...(existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {}), ...novas }
  const ordenadas = Object.fromEntries(
    Object.keys(todas)
      .sort()
      .map((k) => [k, todas[k]]),
  )
  writeFileSync(REF, `${JSON.stringify(ordenadas, null, 2)}\n`)
  console.log(`impressões gravadas em ${REF}: ${Object.keys(novas).join(', ')}`)
}
