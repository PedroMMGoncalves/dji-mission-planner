import * as turf from '@turf/turf'
import { computeFootprint, computeGSD } from './geo.js'

/** Valores iniciais da configuração de órbita (E1.2). */
export const DEFAULT_ORBIT_CONFIG = {
  poi: null, // [lon, lat]
  radiusM: 60,
  levelCount: 3,
  levelStartM: 30,
  levelStepM: 15,
  horizontalOverlapPct: 80,
  poiHeightM: 0,
  clockwise: true,
  speedMS: 5, // velocidade de voo da órbita — parâmetro explícito (sem clamp)
  // 'photo': anéis a altura constante, uma foto por waypoint (fotogrametria)
  // 'video': espiral contínua, a gravar do primeiro ao último ponto
  capture: 'photo',
}

export const ORBIT_CAPTURES = ['photo', 'video']

/**
 * E1.2: normaliza uma configuração de órbita guardada num projecto —
 * campos em falta caem nos defaults, números validados e limitados,
 * lixo nunca rebenta.
 */
export function normalizeOrbitConfig(stored) {
  const d = { ...DEFAULT_ORBIT_CONFIG }
  if (!stored || typeof stored !== 'object') return d
  const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt)
  const poi =
    Array.isArray(stored.poi) && Number.isFinite(stored.poi[0]) && Number.isFinite(stored.poi[1])
      ? [stored.poi[0], stored.poi[1]]
      : null
  return {
    poi,
    radiusM: num(stored.radiusM, 5, 500, d.radiusM),
    levelCount: Math.round(num(stored.levelCount, 1, 12, d.levelCount)),
    levelStartM: num(stored.levelStartM, 2, 300, d.levelStartM),
    levelStepM: num(stored.levelStepM, 1, 100, d.levelStepM),
    horizontalOverlapPct: num(stored.horizontalOverlapPct, 0, 95, d.horizontalOverlapPct),
    poiHeightM: num(stored.poiHeightM, -50, 300, d.poiHeightM),
    clockwise: stored.clockwise !== false,
    speedMS: num(stored.speedMS, 1, 10, d.speedMS),
    capture: ORBIT_CAPTURES.includes(stored.capture) ? stored.capture : d.capture,
  }
}

/**
 * E1.2: divide um plano de órbita em blocos por nível — cada nível vira uma
 * missão independente (um KMZ por bateria/nível), com o perWaypoint fatiado
 * em sincronia. Serve exportBlocksZip directamente.
 */
export function orbitLevelsToBlocks(plan) {
  if (!plan?.waypoints?.length || !plan.stats) return []
  return plan.perLevel.map((lvl) => ({
    id: lvl.level,
    waypoints: plan.waypoints.slice(lvl.start, lvl.start + lvl.count),
    perWaypoint: plan.perWaypoint.slice(lvl.start, lvl.start + lvl.count),
  }))
}

/**
 * ÓRBITAS MULTI-NÍVEL (T5.1) — círculos empilhados em torno de um POI para
 * inspeção/reconstrução 3D de estruturas isoladas (chaminés, antenas,
 * afloramentos pontuais).
 *
 * Cada nível é uma volta completa ao raio dado; os pontos por revolução
 * saem da sobreposição horizontal à distância R (corda ≈ pegada transversal
 * × (1 − sobreposição)), com mínimo de 8. Em cada waypoint o rumo aponta ao
 * POI e dispara-se uma foto; o gimbal de cada nível aponta à cota do centro
 * do alvo: pitch = −atan((h − poiHeightM)/R). A volta fecha no rumo inicial
 * e a subida para o nível seguinte é vertical, no mesmo ponto horizontal.
 * Pensado para exportar com waypointTurnMode
 * toPointAndPassWithContinuityCurvature (voo curvo contínuo).
 *
 * Com `capture: 'video'` a geometria muda: em vez de anéis a altura
 * constante, uma ESPIRAL CONTÍNUA que sobe um passo por volta, do primeiro
 * ao último nível (L níveis = L−1 voltas; um nível = uma volta a altura
 * constante). A câmara não fotografa enquanto grava, por isso não há
 * takePhoto: startRecord no primeiro ponto, stopRecord no último, e o
 * gimbal reaponta ao centro do alvo em cada ponto à medida que sobe. Os
 * anéis servem a fotogrametria (altura, pitch e sobreposição iguais em cada
 * nível); a espiral serve o vídeo de inspecção.
 *
 * Alturas relativas ao ponto de descolagem (relativeToStartPoint), como o
 * resto da app; `poiHeightM` é a cota do centro do alvo no mesmo referencial.
 */
export function generateOrbitPlan(poi, options) {
  const {
    sensor,
    radiusM,
    levels,
    horizontalOverlapPct = 80,
    poiHeightM = 0,
    speed = 3,
    startBearingDeg = 0,
    clockwise = true,
    capture = 'photo',
  } = options ?? {}

  if (!poi || !(radiusM > 0)) return { error: 'invalid-radius' }
  const heights = Array.isArray(levels)
    ? levels.slice()
    : levels && levels.count > 0
      ? Array.from({ length: levels.count }, (_, k) => levels.startM + k * levels.stepM)
      : null
  if (!heights || heights.length === 0 || heights.some((h) => !Number.isFinite(h))) {
    return { error: 'invalid-levels' }
  }

  // pontos por revolução a partir da sobreposição horizontal à distância R
  const fp = sensor?.type === 'camera' ? computeFootprint(sensor, radiusM) : null
  const chordM = fp
    ? Math.max(1, fp.across * (1 - horizontalOverlapPct / 100))
    : (2 * Math.PI * radiusM) / 24
  const nPts = Math.min(120, Math.max(8, Math.ceil((2 * Math.PI * radiusM) / chordM)))
  const stepDeg = (clockwise ? 360 : -360) / nPts

  const poiPt = turf.point(poi)
  const waypoints = []
  const perWaypoint = []
  const perLevel = []
  // gimbal apontado ao centro do alvo (trigonometria simples)
  const pitchAt = (h) =>
    Math.max(-90, Math.min(20, -Math.round((Math.atan2(h - poiHeightM, radiusM) * 180) / Math.PI)))
  const posAt = (i) => {
    const brg = startBearingDeg + (i % nPts) * stepDeg
    return turf.destination(poiPt, radiusM, (((brg % 360) + 540) % 360) - 180, {
      units: 'meters',
    }).geometry.coordinates
  }
  const headingAt = (pos) => ((Math.round(turf.bearing(pos, poi)) % 360) + 360) % 360
  const video = capture === 'video'
  if (video) {
    // ESPIRAL: L−1 voltas entre o primeiro e o último nível (uma volta a
    // altura constante com um só nível); o ponto j está a
    // h0 + (j / nPts) · passo, e o último fecha no rumo inicial à altura do
    // último nível. Cada volta é um "nível" para a pré-visualização e os
    // blocos, com a altura e o pitch do seu início.
    const turns = Math.max(1, heights.length - 1)
    const stepM = heights.length > 1 ? heights[1] - heights[0] : 0
    const total = turns * nPts + 1
    for (let j = 0; j < total; j++) {
      const h = heights[0] + (j / nPts) * stepM
      const pos = posAt(j)
      if (j % nPts === 0 && j < total - 1) {
        perLevel.push({
          level: j / nPts + 1,
          heightM: Math.round(h * 10) / 10,
          gimbalPitch: pitchAt(h),
          start: j,
          count: j / nPts === turns - 1 ? nPts + 1 : nPts,
        })
      }
      const actions = j === 0 ? ['startRecord'] : j === total - 1 ? ['stopRecord'] : []
      waypoints.push([pos[0], pos[1], Math.round(h * 10) / 10])
      perWaypoint.push({ heading: headingAt(pos), gimbalPitch: pitchAt(h), actions })
    }
  }
  if (!video)
    heights.forEach((h, li) => {
      const pitch = pitchAt(h)
      // TRANSIÇÃO ENTRE ANÉIS: helicoidal, nunca vertical. Cada anel termina
      // uma corda ANTES do rumo inicial e o anel seguinte começa nesse rumo,
      // um passo acima — o troço de ligação tem uma corda na horizontal e o
      // passo na vertical, e a volta fica completa (a última corda voa-se a
      // subir). Antes cada anel fechava no rumo inicial e o seguinte começava
      // no MESMO ponto horizontal: um segmento de comprimento horizontal nulo.
      // A órbita voa em curva contínua ajustada pelos pontos (useStraightLine
      // 0, sem amortecimento), e num troço vertical a tangente horizontal fica
      // indefinida: em voo a aeronave parava no fim do primeiro anel. Só o
      // último anel fecha a volta, para a missão acabar onde o anel começou.
      const last = li === heights.length - 1
      const count = last ? nPts + 1 : nPts
      perLevel.push({
        level: li + 1,
        heightM: h,
        gimbalPitch: pitch,
        start: waypoints.length,
        count,
      })
      for (let i = 0; i < count; i++) {
        // i === nPts (só no último anel) fecha a volta no rumo inicial
        const pos = posAt(i)
        waypoints.push([pos[0], pos[1], Math.round(h * 10) / 10])
        perWaypoint.push({ heading: headingAt(pos), gimbalPitch: pitch, actions: ['takePhoto'] })
      }
    })

  let pathLengthM = 0
  for (let i = 1; i < waypoints.length; i++) {
    const dxy = turf.distance(waypoints[i - 1], waypoints[i], { units: 'meters' })
    const dh = Math.abs((waypoints[i][2] ?? 0) - (waypoints[i - 1][2] ?? 0))
    pathLengthM += Math.hypot(dxy, dh)
  }

  return {
    waypoints,
    perWaypoint,
    perLevel,
    turnMode: 'toPointAndPassWithContinuityCurvature',
    stats: {
      capture: video ? 'video' : 'photo',
      levelCount: heights.length,
      // voltas voadas: uma por anel, ou as da espiral
      turnCount: perLevel.length,
      pointsPerOrbit: nPts,
      waypointCount: waypoints.length,
      photoCount: video ? 0 : waypoints.length,
      chordM,
      radiusM,
      gsdCm: sensor?.type === 'camera' ? computeGSD(sensor, radiusM) : null,
      heights,
      pathLengthM,
      flightTimeS: speed > 0 ? pathLengthM / speed : null,
      // ligação entre anéis: corda na horizontal, passo na vertical
      transitionM: !video && heights.length > 1 ? chordM : null,
    },
  }
}
