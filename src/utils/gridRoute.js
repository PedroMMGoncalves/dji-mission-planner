// Boustrophedon cellular decomposition — the standard coverage-path-planning
// algorithm of Choset & Pignon, "Coverage Path Planning: The Boustrophedon
// Cellular Decomposition" (Field and Service Robotics, 1998). A sweep line
// crosses the region; the in-region pieces of each sweep are grouped into
// cells that break at every split and merge, and the cells are then visited in
// graph order so the legs between passes stay inside the region.
//
// Provenance: this implementation started as a translation of grid_route.py in
// dronnix-io/FlyPath (GPL-3.0) and is redistributed here under the same
// licence. Modified from the original as follows: axes swapped (FlyPath sweeps
// vertical columns with segments in y; our scanlines are horizontal rows with
// segments in x, so a cell segment here is [y, xLo, xHi] and route points are
// [x, y] in the rotated frame); the strip-overlap epsilon is metres in FlyPath
// and is converted to degrees by the caller; pass densification is not carried
// over (terrain follow densifies later in this codebase); and the nearest-entry
// tie-break weighs x by the local metres-per-degree ratio, because this
// codebase routes in geographic degrees where the rotated frame is
// anisotropic — an unweighted distance would pick the wrong cell entry at high
// latitude.

/** Two segments on adjacent scan lines belong to the same strip when their
 * along-track ranges overlap by more than this (metres). A real gap between
 * strips gives no overlap, so the strips are kept apart and never flown
 * across. Callers convert to degrees: eps / metersPerDegLon(lat). */
export const STRIP_OVERLAP_EPS_M = 1e-6

/**
 * Boustrophedon cellular decomposition: group scan-line segments into
 * contiguous strips (cells). A cell is a run of segments, one per scan line,
 * that stay connected; it ends where the area splits, merges, or stops.
 *
 * `rows` is a list of [y, segments], one per scan line in sweep order, where
 * each segment is [xLo, xHi] of an in-polygon piece of that line. Empty rows
 * must be included — they break connectivity, exactly like a real gap.
 *
 * Returns { cells, adjacency }: `cells` is a list of cells, each a list of
 * [y, xLo, xHi]; `adjacency` is a parallel list of Sets giving, for each
 * cell, the cells it connects to at a split/merge. Adjacent cells share the
 * survey area's spine, so visiting them in graph order keeps the legs
 * between strips inside the polygon.
 */
export function decomposeCells(rows, overlapEps) {
  const cells = []
  const adjacency = []

  const openCell = (seg, parents) => {
    const idx = cells.length
    cells.push([seg])
    adjacency.push(new Set())
    for (const p of parents) {
      adjacency[idx].add(p)
      adjacency[p].add(idx)
    }
    return idx
  }

  let prevSegs = []
  let prevIdx = {}
  for (const [y, segs] of rows) {
    const curToPrev = segs.map(() => [])
    const prevToCur = prevSegs.map(() => [])
    segs.forEach(([clo, chi], j) => {
      prevSegs.forEach(([plo, phi], i) => {
        if (Math.min(chi, phi) - Math.max(clo, plo) > overlapEps) {
          curToPrev[j].push(i)
          prevToCur[i].push(j)
        }
      })
    })

    const curIdx = {}
    segs.forEach(([clo, chi], j) => {
      const prevs = curToPrev[j]
      // A clean one-to-one link continues the same strip; anything else
      // (a start, a split, or a merge) opens a fresh cell that neighbours
      // the previous cells it touches.
      if (prevs.length === 1 && prevToCur[prevs[0]].length === 1) {
        const ci = prevIdx[prevs[0]]
        cells[ci].push([y, clo, chi])
        curIdx[j] = ci
      } else {
        curIdx[j] = openCell(
          [y, clo, chi],
          prevs.map((i) => prevIdx[i]),
        )
      }
    })

    prevSegs = segs
    prevIdx = curIdx
  }

  return { cells, adjacency }
}

/** Snake one cell into [x, y] points: along one line, back the next. */
export function cellTurns(cell) {
  const turns = []
  cell.forEach(([y, xlo, xhi], k) => {
    const pts = [
      [xlo, y],
      [xhi, y],
    ]
    turns.push(...(k % 2 === 0 ? pts : pts.reverse()))
  })
  return turns
}

/** Depth-first cell order, starting from a leaf so a path-shaped area is
 * walked end to end. Keeps neighbouring cells consecutive. */
function visitOrder(turnlists, adjacency) {
  const n = turnlists.length
  if (n === 0) return []

  const rank = (k) => [adjacency[k].size, turnlists[k][0][0], turnlists[k][0][1]]
  const roots = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]
  })

  const order = []
  const visited = new Set()
  for (const root of roots) {
    if (visited.has(root)) continue
    const stack = [root]
    while (stack.length > 0) {
      const node = stack.pop()
      if (visited.has(node)) continue
      visited.add(node)
      order.push(node)
      const nbrs = [...adjacency[node]]
        .filter((k) => !visited.has(k))
        .sort((a, b) => {
          // descending, so the stack pops the lowest (x, y) first
          const ta = turnlists[a][0]
          const tb = turnlists[b][0]
          return tb[0] - ta[0] || tb[1] - ta[1]
        })
      stack.push(...nbrs)
    }
  }
  return order
}

/**
 * Concatenate the cells into one route in adjacency (graph) order, so the
 * legs between strips run along the survey area's spine and stay inside it.
 * Each cell is flown in whichever direction enters it closest to the
 * previous cell's exit (x weighed by `xToYRatio`, the local metres-per-degree
 * anisotropy of the rotated frame). Every pass itself lies within a single
 * strip. Returns a flat list of [x, y] points — two per pass.
 */
export function orderCells(cells, adjacency, xToYRatio = 1) {
  const turnlists = cells.map((c) => cellTurns(c))
  if (turnlists.length === 0) return []
  const route = []
  let cur = null
  for (const k of visitOrder(turnlists, adjacency)) {
    const t = turnlists[k]
    let chosen = t
    if (cur != null) {
      const d2 = (p) => ((p[0] - cur[0]) * xToYRatio) ** 2 + (p[1] - cur[1]) ** 2
      chosen = d2(t[0]) <= d2(t[t.length - 1]) ? t : t.slice().reverse()
    }
    route.push(...chosen)
    cur = route[route.length - 1]
  }
  return route
}
