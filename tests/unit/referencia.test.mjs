/**
 * A secção 2 do docs/VALIDACAO.md diz do esperado.json que «o diff desse
 * ficheiro é a prova de qualquer mudança no motor». Só é verdade se alguém
 * se lembrar de correr tools/missoes-referencia.mjs e commitar o resultado
 * — e não havia nada que o exigisse. Um instantâneo que fica para trás não
 * é prova de nada: passa a dizer que o motor não mudou quando mudou.
 *
 * Esta suite regenera o instantâneo em memória e compara-o com o ficheiro
 * em disco. Se falhar, o motor mudou e o ficheiro não foi regenerado:
 * correr `node tools/missoes-referencia.mjs` e commitar o diff, que é
 * exactamente a prova que o protocolo pede.
 */
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { MISSOES, esperadoDe, esperadoDeTodas } from '../../tools/missoes-referencia.mjs'

const dir = new URL('../../docs/validacao/missoes/', import.meta.url)
const lerJson = async (nome) => JSON.parse(await readFile(new URL(nome, dir), 'utf8'))

describe('missoes de referencia: o instantaneo acompanha o motor', () => {
  test('esperado.json em disco e igual ao que o motor produz agora', async () => {
    const emDisco = await lerJson('esperado.json')
    expect(emDisco).toEqual(esperadoDeTodas())
  })

  test('cada ficheiro de projecto em disco e igual ao que o gerador define', async () => {
    for (const [nome, proj] of Object.entries(MISSOES)) {
      expect(await lerJson(`${nome}.json`), nome).toEqual(proj)
    }
  })

  test('o instantaneo cobre as quatro missoes do protocolo', async () => {
    const emDisco = await lerJson('esperado.json')
    expect(Object.keys(emDisco)).toEqual(Object.keys(MISSOES))
    expect(Object.keys(MISSOES)).toHaveLength(4)
  })
})

describe('missoes de referencia: o seguimento de terreno entra no instantaneo', () => {
  // A R2 declarava terrainFollow e não trazia terreno, por isso o
  // seguimento nunca corria: os campos tf* ficavam todos a null e uma
  // alteração às alturas exportadas não mexia no ficheiro.
  test('a R2 e a unica que declara seguimento de terreno', () => {
    const comTf = Object.entries(MISSOES)
      .filter(([, p]) => p.terrainFollow?.enabled)
      .map(([nome]) => nome)
    expect(comTf).toEqual(['R2-U-terreno-dupla-grelha'])
  })

  test('a R2 traz alturas, folga e corredor medidos, nao nulos', () => {
    const r2 = esperadoDe(MISSOES['R2-U-terreno-dupla-grelha'])
    expect(r2.tfWaypointCount).toBeGreaterThan(0)
    expect(r2.tfRelMaxM).toBeGreaterThan(r2.tfRelMinM)
    expect(r2.tfCorridorRiseMaxM).toBeGreaterThan(0)
    expect(r2.tfClearanceMinM).toBeGreaterThan(0)
  })

  test('o relevo sintetico e exigente ao ponto de o tecto travar a subida', () => {
    // é o que faz o instantâneo cobrir o caminho do recorte aos 120 m: sem
    // isto, a metade do código que limita a subida ficava fora da prova
    const r2 = esperadoDe(MISSOES['R2-U-terreno-dupla-grelha'])
    expect(r2.tfCappedCount).toBeGreaterThan(0)
    expect(r2.tfClearanceMinM).toBeLessThan(r2.aglM)
  })

  test('as missoes sem seguimento de terreno mantem os campos a null', () => {
    for (const nome of ['R1-rectangulo-nadir', 'R3-blocos-bateria', 'L1-lidar-mapper']) {
      const e = esperadoDe(MISSOES[nome])
      expect(e.tfWaypointCount, nome).toBeNull()
      expect(e.tfCappedCount, nome).toBeNull()
    }
  })

  test('importar o gerador nao reescreve o que a suite esta a verificar', async () => {
    const antes = await readFile(new URL('esperado.json', dir), 'utf8')
    esperadoDeTodas()
    expect(await readFile(new URL('esperado.json', dir), 'utf8')).toBe(antes)
  })
})
