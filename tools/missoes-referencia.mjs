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
import { predictFromProject } from './lib/planeado.mjs'
import { PROJECT_SCHEMA_URL } from '../src/mission/project.js'

const lat0 = 38.55
const lon0 = -7.9
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [Number((lon0 + x / mLon).toFixed(7)), Number((lat0 + y / 110574).toFixed(7))]
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

const dir = new URL('../docs/validacao/missoes/', import.meta.url)
await mkdir(dir, { recursive: true })
const esperado = {}
for (const [nome, proj] of Object.entries(MISSOES)) {
  await writeFile(new URL(`${nome}.json`, dir), JSON.stringify(proj, null, 2) + '\n')
  const p = predictFromProject(proj)
  esperado[nome] = {
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
  }
}
await writeFile(new URL('esperado.json', dir), JSON.stringify(esperado, null, 2) + '\n')
console.log(JSON.stringify(esperado, null, 2))
