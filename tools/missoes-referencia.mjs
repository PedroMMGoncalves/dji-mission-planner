#!/usr/bin/env node
/**
 * Missoes de referencia da validacao de campo (docs/VALIDACAO.md): escreve
 * os ficheiros de projecto em docs/validacao/missoes/ e o que o planeador
 * preve para cada uma (esperado.json), a partir do mesmo motor da
 * aplicacao. Correr de novo depois de mudar o motor: o diff de
 * esperado.json e a prova de que a previsao mudou.
 *
 * As areas ficam num terreno de teste generico (Alentejo interior, longe de
 * espacos aereos controlados); antes de voar, mover a area para o local
 * real com a interface e guardar o projecto ao lado, com o mesmo nome.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { predictFromProject } from './lib/planeado.mjs'
import { planTerrainFollow } from '../src/mission/terrainFollow.js'
import { PROJECT_SCHEMA_URL } from '../src/mission/project.js'

const lat0 = 38.55
const lon0 = -7.9
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [Number((lon0 + x / mLon).toFixed(7)), Number((lat0 + y / 110574).toFixed(7))]

/*
 * RELEVO SINTETICO DAS MISSOES DE REFERENCIA.
 *
 * A R2 declarava seguimento de terreno e nao trazia terreno nenhum, por
 * isso o seguimento nunca corria e o esperado.json so guardava a previsao
 * do plano em planta. Resultado: uma alteracao que mudasse as alturas
 * exportadas passava-lhe ao lado sem deixar rasto, ao contrario do que a
 * seccao 2 do docs/VALIDACAO.md promete deste ficheiro.
 *
 * Este relevo e deterministico e deliberadamente exigente, para o
 * instantaneo cobrir os dois caminhos do seguimento de terreno:
 *
 *  - rampa de 0,08 m/m para Este: subida suave em todo o lado;
 *  - cordilheira Norte-Sul estreita a 300 m do canto: os flancos sobem
 *    perto de 1 m/m, logo o corredor lateral de 30 m apanha ali cerca de
 *    29 m que o eixo da faixa nao ve, o suficiente para o tecto de 120 m
 *    travar a subida com os 100 m de AGL da R2;
 *  - ondulacao Norte-Sul de 12 m: variacao ao longo da propria faixa, que
 *    o eixo ja via antes.
 *
 * Nao pretende imitar um sitio real. As areas continuam a ser movidas para
 * o local do voo antes de voar, com o MDT verdadeiro.
 */
const RELEVO = {
  verticalDatum: { kind: 'orthometric', model: 'sintetico' },
  elevationAt: (lon, lat) => {
    const x = (lon - lon0) * mLon
    const y = (lat - lat0) * 110574
    return (
      200 + 0.08 * x + 80 * Math.exp(-((x - 300) ** 2) / (2 * 50 ** 2)) + 12 * Math.sin(y / 120)
    )
  },
}
const base = {
  $schema: PROJECT_SCHEMA_URL,
  version: 2,
  basePoint: em(-40, -40),
  terrainFollow: { enabled: false, tolerance: 5 },
}

export const MISSOES = {
  'R1-rectangulo-nadir': {
    ...base,
    missionName: 'R1-rectangulo-nadir',
    drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE', rtk: false },
    params: {
      altitude: 80,
      speed: 8,
      frontOverlap: 80,
      sideOverlap: 70,
      angle: 90,
      gimbalPitch: -90,
      triggerMode: 'distance',
    },
    ring: [em(0, 0), em(400, 0), em(400, 250), em(0, 250)],
  },
  'R2-U-terreno-dupla-grelha': {
    ...base,
    missionName: 'R2-U-terreno-dupla-grelha',
    drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE', rtk: false },
    params: {
      altitude: 100,
      speed: 8,
      frontOverlap: 80,
      sideOverlap: 75,
      angle: 0,
      gimbalPitch: -60,
      crosshatch: true,
      includeNadir: true,
      triggerMode: 'distance',
    },
    ring: [
      em(0, 0),
      em(600, 0),
      em(600, 500),
      em(400, 500),
      em(400, 150),
      em(200, 150),
      em(200, 500),
      em(0, 500),
    ],
    terrainFollow: { enabled: true, tolerance: 5 },
  },
  'R3-blocos-bateria': {
    ...base,
    missionName: 'R3-blocos-bateria',
    drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE', rtk: false },
    params: {
      altitude: 60,
      speed: 6,
      frontOverlap: 80,
      sideOverlap: 70,
      angle: 45,
      gimbalPitch: -90,
      triggerMode: 'distance',
    },
    ring: [em(0, 0), em(900, 0), em(900, 700), em(0, 700)],
    split: { mode: 'battery', reservePct: 30, maxSide: 500 },
  },
  'L1-lidar-mapper': {
    ...base,
    missionName: 'L1-lidar-mapper',
    drone: { aircraftId: 'M300RTK', payloadId: 'MAPPER_PLUS', rtk: true },
    params: {
      altitude: 80,
      speed: 5,
      sideOverlap: 50,
      angle: 90,
      gimbalPitch: -90,
      tieLine: true,
      triggerMode: 'distance',
    },
    ring: [em(0, 0), em(500, 0), em(500, 300), em(0, 300)],
  },
}

/**
 * O instantaneo de UMA missao, tal como vai para o esperado.json. Funcao
 * pura: a suite compara-a com o ficheiro em disco, para o ficheiro nao
 * poder ficar desactualizado em silencio (ver tests/unit/referencia.test.mjs).
 */
export function esperadoDe(proj) {
  const p = predictFromProject(proj)
  // Seguimento de terreno: so nas missoes que o declaram, sobre o relevo
  // sintetico acima. Estes campos sao a guarda que faltava - sem eles uma
  // alteracao as alturas exportadas nao aparecia no diff.
  let tf = null
  if (proj.terrainFollow?.enabled && p.plan && !p.planError) {
    const res = planTerrainFollow(RELEVO, p.plan, {
      refPt: proj.basePoint,
      agl: p.aglM,
      toleranceM: proj.terrainFollow.tolerance,
    })
    if (!res.error) {
      const alturas = res.waypoints.map((w) => w[2])
      tf = {
        tfWaypointCount: res.waypoints.length,
        tfRelMinM: Number(Math.min(...alturas).toFixed(1)),
        tfRelMaxM: Number(Math.max(...alturas).toFixed(1)),
        tfClearanceMinM: res.clearanceMinM == null ? null : Number(res.clearanceMinM.toFixed(1)),
        tfCorridorRiseMaxM: Number(res.corridorRiseMaxM.toFixed(1)),
        tfCappedCount: res.cappedCount,
      }
    }
  }
  return {
    hardware: `${p.aircraftLabel} + ${p.payloadLabel}${proj.drone.rtk ? ' (RTK)' : ''}`,
    aglM: p.aglM,
    gsdCm: p.gsdCm == null ? null : Number(p.gsdCm.toFixed(2)),
    spacingM: Number(p.spacingM.toFixed(2)),
    intervalM: p.intervalM == null ? null : Number(p.intervalM.toFixed(2)),
    lineCount: p.plan?.stats?.lineCount ?? null,
    photoCount: p.plan?.stats?.photoCount ?? null,
    flightTimeS: p.plan?.stats?.flightTimeS == null ? null : Math.round(p.plan.stats.flightTimeS),
    pathLengthM: p.plan?.stats?.pathLengthM == null ? null : Math.round(p.plan.stats.pathLengthM),
    densityPerM2: p.densityPerM2 == null ? null : Math.round(p.densityPerM2),
    planError: p.planError,
    tfWaypointCount: tf?.tfWaypointCount ?? null,
    tfRelMinM: tf?.tfRelMinM ?? null,
    tfRelMaxM: tf?.tfRelMaxM ?? null,
    tfClearanceMinM: tf?.tfClearanceMinM ?? null,
    tfCorridorRiseMaxM: tf?.tfCorridorRiseMaxM ?? null,
    tfCappedCount: tf?.tfCappedCount ?? null,
  }
}

/** Instantaneo de todas as missoes, pela ordem de MISSOES. */
export function esperadoDeTodas() {
  const out = {}
  for (const [nome, proj] of Object.entries(MISSOES)) out[nome] = esperadoDe(proj)
  return out
}

// Escrever os ficheiros e efeito colateral do script, nao da importacao: a
// suite importa este modulo para comparar, e nao pode reescrever o que esta
// a verificar.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = new URL('../docs/validacao/missoes/', import.meta.url)
  await mkdir(dir, { recursive: true })
  for (const [nome, proj] of Object.entries(MISSOES)) {
    await writeFile(new URL(`${nome}.json`, dir), JSON.stringify(proj, null, 2) + '\n')
  }
  const esperado = esperadoDeTodas()
  await writeFile(new URL('esperado.json', dir), JSON.stringify(esperado, null, 2) + '\n')
  console.log(JSON.stringify(esperado, null, 2))
}
