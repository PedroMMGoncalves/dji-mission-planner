/**
 * Montagem da exportação WPML de uma missão de ÁREA: nome com variantes,
 * waypoints (planos ou com terrain follow), intervalos de disparo, blocos e
 * o marcador de gimbal da grelha nadir. Lógica pura, sem React, para ser
 * testada sem browser — vivia no handler de exportação do App.jsx.
 */
import { buildExportName } from '../utils/exporters.js'
import { triggerRangesForLines } from '../utils/geo.js'

/** Copia `pw` com o gimbal a −90° no waypoint `at` (fundindo a entrada existente). */
export function withNadirPitch(pw, at) {
  const out = pw ? [...pw] : []
  out[at] = { ...(out[at] ?? {}), gimbalPitch: -90 }
  return out
}

/**
 * Índice LOCAL do waypoint onde a grelha nadir começa num bloco, ou null
 * quando o bloco não tem linhas nadir. Com terrain follow o bloco já traz o
 * marcador calculado (regroupTerrainBlocks); sem ele, é a soma dos waypoints
 * das linhas anteriores (2 por linha quando não há densificação).
 */
export function nadirMarkerIndex(block, terrainOk) {
  if (terrainOk) return block.nadirMarkerAt ?? null
  if (block.nadirLineLocal == null) return null
  return block.perLine
    ? block.perLine.slice(0, block.nadirLineLocal).reduce((s, n) => s + n, 0)
    : 2 * block.nadirLineLocal
}

/**
 * Devolve `{ params, blocks }`: `params` para exportWPMLKmz, e `blocks`
 * (com `triggerRanges` e `perWaypoint` locais) para exportBlocksZip quando
 * a missão sai em mais de um bloco — senão null.
 */
export function buildAreaExport({
  missionName,
  plan,
  terrainResult = null,
  blocks = null,
  spacingM,
  photoMode = 'distance',
  sensorType,
  altitude,
  speed,
  wpml,
  photoIntervalM,
  triggerMode,
  gimbalPitch,
  crosshatch = false,
  includeNadir = false,
  tieLine = false,
}) {
  const terrainOk = Boolean(terrainResult && !terrainResult.error)
  // E3.1: tipo e variantes codificados no nome do ficheiro
  const name = buildExportName(missionName, 'area', {
    variant: [crosshatch && 'crosshatch', crosshatch && includeNadir && 'nadir', tieLine && 'tie', terrainOk && 'tf'],
  })
  const params = {
    name,
    waypoints: terrainOk ? terrainResult.waypoints : plan.waypoints,
    altitude,
    speed,
    wpml,
    // no modo foto-por-waypoint não há gatilho por distância — as fotos vão
    // nas acções por waypoint (perWaypoint)
    photoIntervalM: sensorType === 'camera' && photoMode !== 'waypoint' ? photoIntervalM : 0,
    triggerMode,
    gimbalPitch,
    sensorType,
  }

  // Disparo suspenso nas ligações longas (mais de 2,5 espaçamentos): as
  // viragens normais continuam a disparar; as travessias de concavidades,
  // as ligações entre grelhas e entre células deixam de encher o cartão
  // com fotos fora da área. Índices locais a cada bloco.
  const maxLinkM = Math.max(2.5 * spacingM, 60)
  params.triggerRanges = triggerRangesForLines(
    plan.lines,
    terrainOk ? terrainResult.perLine : null,
    terrainOk ? terrainResult.perLink : null,
    { maxLinkM },
  )
  const source = terrainOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
  let exportBlocks =
    source?.map((b) => ({
      ...b,
      triggerRanges: triggerRangesForLines(b.lines, b.perLine ?? null, b.perLink ?? null, { maxLinkM }),
    })) ?? null
  const multiBlock = Boolean(exportBlocks && exportBlocks.length > 1)

  // acções de foto por waypoint do plano (null no modo distância); o
  // marcador de gimbal nadir funde-se com a entrada existente do waypoint
  const photoPw = photoMode === 'waypoint' ? (plan.perWaypoint ?? null) : null

  // R2.10: com a passagem nadir extra, o gimbal roda a −90 no primeiro
  // waypoint da grelha nadir (a missão arranca no pitch oblíquo global)
  const nadirLine = plan.nadirStartLine ?? plan.cellPlans?.[0]?.nadirStartLine ?? null
  if (nadirLine != null) {
    if (multiBlock) {
      exportBlocks = exportBlocks.map((b) => {
        const at = nadirMarkerIndex(b, terrainOk)
        return at == null ? b : { ...b, perWaypoint: withNadirPitch(b.perWaypoint, at) }
      })
      return { params, blocks: exportBlocks }
    }
    let at
    if (terrainOk) {
      at = 0
      for (let k = 0; k < nadirLine; k++) at += terrainResult.perLine[k] ?? 0
      // depois da ligação que conduz à grelha nadir: o gimbal roda no
      // primeiro waypoint da grelha, não no troço de aproximação
      at += terrainResult.perLink?.[nadirLine] ?? 0
    } else {
      at = plan.nadirStartWaypoint ?? plan.cellPlans?.[0]?.nadirStartWaypoint ?? 2 * nadirLine
    }
    params.perWaypoint = withNadirPitch(photoPw, at)
  } else if (photoPw) {
    params.perWaypoint = photoPw
  }
  return { params, blocks: multiBlock ? exportBlocks : null }
}
