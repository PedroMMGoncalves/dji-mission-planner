import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useT } from '../i18n.jsx'
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'

/**
 * VISUALIZADOR 3D DA MISSÃO
 * -------------------------
 * Sobreposição a ecrã inteiro com o relevo da área (DEM já carregado), o
 * traçado de voo em altitude real, o contorno da área, a base do operador e
 * os alvos GCP.
 *
 * Convenções (iguais a utils/geo.js):
 *  - coordenadas [lon, lat] em WGS84, distâncias em metros;
 *  - referencial local métrico centrado no centro da bbox do terreno, com
 *    x = Este, y = Norte e z = altitude → a cena usa "Z para cima"
 *    (`camera.up = (0,0,1)`), o que deixa a PlaneGeometry do terreno no seu
 *    plano natural XY e as altitudes diretamente no eixo Z.
 *
 * Altitudes: a altura dos waypoints é RELATIVA ao ponto de referência da
 * missão, pelo que a altitude absoluta é `refElev + alturaRel`. O exagero
 * vertical multiplica todas as cotas (terreno e voo) pelo mesmo fator, para
 * que a relação entre o drone e o relevo se mantenha correta.
 */

const SEGMENTS = 200 // ~200×200 quadrículas na malha do terreno
const TILE = 256
const MAX_IMAGERY_TILES = 144 // trava contra bboxes enormes
const IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const DEFAULT_REL_HEIGHT = 100 // altura relativa assumida quando não vem no waypoint
const MAX_WP_SPHERES = 2000 // acima disto desenha-se apenas a polilinha

/** Fração vertical [0,1] de uma latitude em Web Mercator (0 = Norte). */
function mercatorN(lat) {
  const s = Math.max(-0.9999, Math.min(0.9999, Math.sin((lat * Math.PI) / 180)))
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

/** Executa `worker` sobre `items` com um limite de tarefas em paralelo. */
async function runPool(items, limit, worker) {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      await worker(items[k])
    }
  })
  await Promise.all(runners)
}

/** Carrega uma imagem com CORS; resolve `null` em vez de rejeitar. */
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Compõe as imagens de satélite Esri num canvas recortado EXATAMENTE pela
 * bbox (em píxeis Web Mercator), pronto a servir de textura ao terreno.
 * O zoom é escolhido para o lado maior ficar em ~1024–2048 px.
 * Devolve `null` se os tiles falharem (CORS/rede) — o chamador mantém então o
 * sombreado hipsométrico.
 */
async function buildImageryCanvas([minLon, minLat, maxLon, maxLat], isCancelled) {
  if (typeof document === 'undefined') return null

  let z = 6
  for (let cand = 19; cand >= 6; cand--) {
    const n = 2 ** cand
    const w = ((maxLon - minLon) / 360) * TILE * n
    const h = (mercatorN(minLat) - mercatorN(maxLat)) * TILE * n
    if (Math.max(w, h) <= 2048) {
      z = cand
      break
    }
  }

  const n = 2 ** z
  const px0 = ((minLon + 180) / 360) * n * TILE
  const px1 = ((maxLon + 180) / 360) * n * TILE
  const py0 = mercatorN(maxLat) * n * TILE
  const py1 = mercatorN(minLat) * n * TILE
  const w = Math.max(2, Math.round(px1 - px0))
  const h = Math.max(2, Math.round(py1 - py0))

  const tx0 = Math.floor(px0 / TILE)
  const tx1 = Math.floor((px1 - 1e-6) / TILE)
  const ty0 = Math.max(0, Math.floor(py0 / TILE))
  const ty1 = Math.min(n - 1, Math.floor((py1 - 1e-6) / TILE))
  const jobs = []
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) jobs.push({ x, y })
  }
  if (jobs.length === 0 || jobs.length > MAX_IMAGERY_TILES) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  let ok = 0
  await runPool(jobs, 6, async ({ x, y }) => {
    if (isCancelled()) return
    const wrapped = ((x % n) + n) % n
    const img = await loadImage(
      IMAGERY_URL.replace('{z}', String(z))
        .replace('{y}', String(y))
        .replace('{x}', String(wrapped)),
    )
    if (isCancelled() || !img) return
    ok++
    // desenha na posição do tile relativa ao canto NO da bbox
    ctx.drawImage(img, Math.round(x * TILE - px0), Math.round(y * TILE - py0), TILE, TILE)
  })

  if (isCancelled() || ok < jobs.length * 0.5) return null
  return canvas
}

/** Rampa hipsométrica verde → castanho → branco (t em [0,1]). */
const HYPSO_LOW = new THREE.Color('#2f6b3d')
const HYPSO_MID = new THREE.Color('#8a6636')
const HYPSO_HIGH = new THREE.Color('#f1f5f9')
function hypsoColor(t, out) {
  if (t < 0.5) out.copy(HYPSO_LOW).lerp(HYPSO_MID, t * 2)
  else out.copy(HYPSO_MID).lerp(HYPSO_HIGH, (t - 0.5) * 2)
  return out
}

/** Etiqueta de texto simples (canvas → Sprite). */
function makeLabelSprite(text, worldHeight) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const font = 'bold 44px system-ui, sans-serif'
  ctx.font = font
  canvas.width = Math.min(512, Math.ceil(ctx.measureText(text).width) + 28)
  canvas.height = 64
  // redimensionar o canvas repõe o estado do contexto
  ctx.font = font
  ctx.fillStyle = 'rgba(2, 6, 23, 0.72)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#facc15'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1)
  sprite.renderOrder = 10
  return sprite
}

const BTN = 'rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700'
const EXAG_OPTIONS = [
  { value: 1, label: '1×' },
  { value: 1.5, label: '1,5×' },
  { value: 2, label: '2×' },
]

export default function Map3D({ terrain, ring, waypoints, refElev, basePoint, gcps, onClose }) {
  const t = useT()
  const hostRef = useRef(null)
  const apiRef = useRef(null) // { applyExaggeration, resetView } da cena viva
  const propsRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const exagRef = useRef(1)

  const [exag, setExag] = useState(1)
  const [imagery, setImagery] = useState('loading') // 'loading' | 'ok' | 'fallback'

  // Escrito num efeito e não durante o render: mutar um ref no corpo do
  // componente é inseguro com renderização concorrente (React pode repetir
  // ou descartar o render). Os handlers imperativos abaixo só disparam por
  // acção do utilizador, sempre depois de o efeito ter corrido, pelo que
  // continuam a ler a versão mais recente.
  useEffect(() => {
    propsRef.current = { terrain, ring, waypoints, refElev, basePoint, gcps }
    onCloseRef.current = onClose
    exagRef.current = exag
  })

  const hasTerrain =
    Array.isArray(terrain?.bbox) &&
    terrain.bbox.length >= 4 &&
    typeof terrain?.elevationAt === 'function'

  // Assinatura primitiva do conteúdo: evita reconstruir a cena só porque o pai
  // recriou os arrays com a mesma informação.
  const sig = [
    hasTerrain ? terrain.bbox.join(',') : 'none',
    ring?.length ?? 0,
    waypoints?.length ?? 0,
    Number.isFinite(refElev) ? Math.round(refElev) : 'x',
    basePoint ? basePoint.join(',') : '-',
    gcps?.length ?? 0,
  ].join('|')

  // Esc fecha o visualizador
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Construção da cena (uma vez por conjunto de dados)
  useEffect(() => {
    const host = hostRef.current
    const { terrain, ring, waypoints, refElev, basePoint, gcps } = propsRef.current
    if (!host || !Array.isArray(terrain?.bbox) || typeof terrain.elevationAt !== 'function') return

    setImagery('loading')

    /* --- referencial local -------------------------------------------- */
    const minLon = Math.min(terrain.bbox[0], terrain.bbox[2])
    const maxLon = Math.max(terrain.bbox[0], terrain.bbox[2])
    const minLat = Math.min(terrain.bbox[1], terrain.bbox[3])
    const maxLat = Math.max(terrain.bbox[1], terrain.bbox[3])
    const lon0 = (minLon + maxLon) / 2
    const lat0 = (minLat + maxLat) / 2
    const mLon = metersPerDegLon(lat0) || 1
    const toLocal = (p) => [(p[0] - lon0) * mLon, (p[1] - lat0) * M_PER_DEG_LAT]
    const elevAt = (lon, lat) => {
      const e = terrain.elevationAt(lon, lat)
      return Number.isFinite(e) ? e : 0
    }

    const disposables = new Set()
    const track = (r) => {
      disposables.add(r)
      return r
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#020617') // slate-950

    /* --- malha do terreno ---------------------------------------------- */
    const widthM = (maxLon - minLon) * mLon
    const heightM = (maxLat - minLat) * M_PER_DEG_LAT
    const terrainGeo = track(new THREE.PlaneGeometry(widthM, heightM, SEGMENTS, SEGMENTS))
    const posAttr = terrainGeo.attributes.position
    const uvAttr = terrainGeo.attributes.uv
    const vertexCount = posAttr.count
    const terrainZ = new Float32Array(vertexCount) // cotas SEM exagero

    const nTop = mercatorN(maxLat)
    const nSpan = mercatorN(minLat) - nTop
    const lonSpan = maxLon - minLon || 1
    let lastValid = 0
    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i < vertexCount; i++) {
      const lon = lon0 + posAttr.getX(i) / mLon
      const lat = lat0 + posAttr.getY(i) / M_PER_DEG_LAT
      const raw = terrain.elevationAt(lon, lat)
      const z = Number.isFinite(raw) ? raw : lastValid // null → última válida (ou 0)
      lastValid = z
      terrainZ[i] = z
      if (z < zMin) zMin = z
      if (z > zMax) zMax = z
      // UV em Web Mercator, para a textura assentar alinhada com a bbox
      uvAttr.setXY(i, (lon - minLon) / lonSpan, nSpan > 0 ? 1 - (mercatorN(lat) - nTop) / nSpan : 0)
    }
    uvAttr.needsUpdate = true
    if (!Number.isFinite(zMin)) {
      zMin = 0
      zMax = 1
    }

    // Sombreado hipsométrico (também é o plano B se a imagem de satélite falhar)
    const colors = new Float32Array(vertexCount * 3)
    const span = Math.max(1, zMax - zMin)
    const tmpColor = new THREE.Color()
    for (let i = 0; i < vertexCount; i++) {
      hypsoColor((terrainZ[i] - zMin) / span, tmpColor)
      colors[i * 3] = tmpColor.r
      colors[i * 3 + 1] = tmpColor.g
      colors[i * 3 + 2] = tmpColor.b
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const terrainMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }))
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat)
    scene.add(terrainMesh)

    /* --- luzes ---------------------------------------------------------- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.0)
    const lightSpan = Math.max(widthM, heightM, 500)
    sun.position.set(-lightSpan, lightSpan, lightSpan * 1.2) // sol a NO
    scene.add(sun)

    /* --- enquadramento (área de interesse) ------------------------------ */
    const wps = Array.isArray(waypoints)
      ? waypoints.filter((w) => Array.isArray(w) && Number.isFinite(w[0]) && Number.isFinite(w[1]))
      : []
    const focus = ring && ring.length >= 3 ? ring : wps.length ? wps : null
    let cx = 0
    let cy = 0
    let extent = Math.max(widthM, heightM, 200)
    if (focus) {
      let ax = Infinity
      let ay = Infinity
      let bx = -Infinity
      let by = -Infinity
      focus.forEach((p) => {
        const [x, y] = toLocal(p)
        ax = Math.min(ax, x)
        ay = Math.min(ay, y)
        bx = Math.max(bx, x)
        by = Math.max(by, y)
      })
      cx = (ax + bx) / 2
      cy = (ay + by) / 2
      extent = Math.max(bx - ax, by - ay, 100)
    }
    const targetZ = elevAt(lon0 + cx / mLon, lat0 + cy / M_PER_DEG_LAT) // sem exagero
    const unit = Math.min(40, Math.max(1.5, extent / 150)) // escala dos marcadores

    /* --- traçado de voo -------------------------------------------------- */
    const known = wps.map((w) => (Number.isFinite(w[2]) ? w[2] : null)).filter((h) => h !== null)
    const defaultHeight = known.length
      ? known.reduce((a, b) => a + b, 0) / known.length
      : DEFAULT_REL_HEIGHT
    const ref = Number.isFinite(refElev) ? refElev : wps.length ? elevAt(wps[0][0], wps[0][1]) : 0

    const pathXY = wps.map(toLocal)
    const pathZ = wps.map((w) => ref + (Number.isFinite(w[2]) ? w[2] : defaultHeight))

    let pathGeo = null
    let wpInstances = null
    let startMarker = null
    let endMarker = null
    const dummy = new THREE.Object3D()

    if (wps.length >= 2) {
      pathGeo = track(new THREE.BufferGeometry())
      pathGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(wps.length * 3), 3),
      )
      const pathMat = track(new THREE.LineBasicMaterial({ color: '#22d3ee' }))
      scene.add(new THREE.Line(pathGeo, pathMat))
      // segundo passe amarelo, ligeiramente acima, para contraste sobre o relevo
      const glowMat = track(
        new THREE.LineBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.55 }),
      )
      const glow = new THREE.Line(pathGeo, glowMat)
      glow.position.z = unit * 0.25
      scene.add(glow)
    }

    if (wps.length > 0 && wps.length <= MAX_WP_SPHERES) {
      const wpGeo = track(new THREE.SphereGeometry(unit * 0.45, 8, 6))
      const wpMat = track(new THREE.MeshLambertMaterial({ color: '#22d3ee' }))
      wpInstances = new THREE.InstancedMesh(wpGeo, wpMat, wps.length)
      wpInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      scene.add(wpInstances)
    }

    if (wps.length > 0) {
      const markerGeo = track(new THREE.SphereGeometry(unit * 1.1, 16, 12))
      const startMat = track(new THREE.MeshLambertMaterial({ color: '#4ade80' }))
      const endMat = track(new THREE.MeshLambertMaterial({ color: '#ef4444' }))
      startMarker = new THREE.Mesh(markerGeo, startMat)
      endMarker = new THREE.Mesh(markerGeo, endMat)
      scene.add(startMarker, endMarker)
    }

    /* --- contorno da área, drapejado no terreno -------------------------- */
    let ringGeo = null
    let ringZ = null
    if (ring && ring.length >= 3) {
      // densifica cada aresta para a linha acompanhar o relevo
      const closed = [...ring, ring[0]]
      const pts = []
      for (let i = 0; i < closed.length - 1; i++) {
        const [x0, y0] = toLocal(closed[i])
        const [x1, y1] = toLocal(closed[i + 1])
        const len = Math.hypot(x1 - x0, y1 - y0)
        const steps = Math.max(1, Math.min(400, Math.ceil(len / Math.max(5, extent / 400))))
        for (let s = 0; s < steps; s++) {
          const t = s / steps
          pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
        }
      }
      ringZ = new Float32Array(pts.length)
      const ringPos = new Float32Array(pts.length * 3)
      pts.forEach(([x, y], i) => {
        ringPos[i * 3] = x
        ringPos[i * 3 + 1] = y
        ringZ[i] = elevAt(lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT) + 2 // +2 m acima do solo
      })
      ringGeo = track(new THREE.BufferGeometry())
      ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3))
      const ringMat = track(
        new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
      )
      scene.add(new THREE.LineLoop(ringGeo, ringMat))
    }

    /* --- objetos ao nível do solo (base, GCPs, etiquetas) ---------------- */
    // { obj, groundZ, lift }: z = groundZ × exagero + lift
    const groundObjects = []

    if (
      Array.isArray(basePoint) &&
      Number.isFinite(basePoint[0]) &&
      Number.isFinite(basePoint[1])
    ) {
      const [bx, by] = toLocal(basePoint)
      const group = new THREE.Group()
      const mastGeo = track(new THREE.CylinderGeometry(unit * 0.28, unit * 0.28, unit * 3, 12))
      mastGeo.rotateX(Math.PI / 2) // eixo do cilindro alinhado com Z
      const amber = track(new THREE.MeshLambertMaterial({ color: '#f59e0b' }))
      const mast = new THREE.Mesh(mastGeo, amber)
      mast.position.z = unit * 1.5
      const capGeo = track(new THREE.SphereGeometry(unit * 0.75, 14, 10))
      const cap = new THREE.Mesh(capGeo, amber)
      cap.position.z = unit * 3
      group.add(mast, cap)
      group.position.set(bx, by, 0)
      scene.add(group)
      groundObjects.push({
        obj: group,
        groundZ: elevAt(basePoint[0], basePoint[1]),
        lift: unit * 0.4,
      })
    }

    if (Array.isArray(gcps) && gcps.length > 0) {
      const gcpGeo = track(new THREE.OctahedronGeometry(unit * 0.7))
      const gcpMat = track(new THREE.MeshLambertMaterial({ color: '#facc15' }))
      gcps.forEach((g) => {
        const p = g?.point
        if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return
        const [x, y] = toLocal(p)
        const ground = elevAt(p[0], p[1])
        const mesh = new THREE.Mesh(gcpGeo, gcpMat)
        mesh.position.set(x, y, 0)
        scene.add(mesh)
        groundObjects.push({ obj: mesh, groundZ: ground, lift: unit * 0.7 })

        if (g.id != null && gcps.length <= 60) {
          const sprite = makeLabelSprite(String(g.id), unit * 1.6)
          if (sprite) {
            sprite.position.set(x, y, 0)
            scene.add(sprite)
            track(sprite.material.map)
            track(sprite.material)
            groundObjects.push({ obj: sprite, groundZ: ground, lift: unit * 2.6 })
          }
        }
      })
    }

    /* --- câmara e controlos ---------------------------------------------- */
    const width0 = host.clientWidth || 1
    const height0 = host.clientHeight || 1
    const camera = new THREE.PerspectiveCamera(
      55,
      width0 / height0,
      Math.max(1, extent / 2000),
      extent * 40 + 40000,
    )
    camera.up.set(0, 0, 1) // mundo com Z para cima

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width0, height0)
    renderer.domElement.style.display = 'block'
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = false
    controls.maxPolarAngle = Math.PI * 0.495 // não passar por baixo do terreno
    controls.minDistance = Math.max(5, unit * 2)
    controls.maxDistance = extent * 30 + 20000

    // câmara inclinada ~45°, vista de SE
    const camDist = extent * 1.7 + 200
    const camOffset = new THREE.Vector3(0.5, -0.5, Math.SQRT1_2).multiplyScalar(camDist)

    let currentExag = exagRef.current

    const resetView = () => {
      controls.target.set(cx, cy, targetZ * currentExag)
      camera.position.copy(controls.target).add(camOffset)
      controls.update()
    }

    /**
     * Aplica o exagero vertical sem reconstruir a cena: reescala as cotas do
     * terreno, do traçado e dos marcadores e desloca câmara+alvo do mesmo
     * valor, para o enquadramento não saltar.
     */
    const applyExaggeration = (k) => {
      if (!(k > 0) || k === currentExag) return
      for (let i = 0; i < vertexCount; i++) posAttr.setZ(i, terrainZ[i] * k)
      posAttr.needsUpdate = true
      terrainGeo.computeVertexNormals()
      terrainGeo.computeBoundingSphere()

      if (pathGeo) {
        const arr = pathGeo.attributes.position
        for (let i = 0; i < pathXY.length; i++) {
          arr.setXYZ(i, pathXY[i][0], pathXY[i][1], pathZ[i] * k)
        }
        arr.needsUpdate = true
        pathGeo.computeBoundingSphere()
      }
      if (wpInstances) {
        for (let i = 0; i < pathXY.length; i++) {
          dummy.position.set(pathXY[i][0], pathXY[i][1], pathZ[i] * k)
          dummy.updateMatrix()
          wpInstances.setMatrixAt(i, dummy.matrix)
        }
        wpInstances.instanceMatrix.needsUpdate = true
        wpInstances.computeBoundingSphere()
      }
      if (startMarker && endMarker) {
        const last = pathXY.length - 1
        startMarker.position.set(pathXY[0][0], pathXY[0][1], pathZ[0] * k)
        endMarker.position.set(pathXY[last][0], pathXY[last][1], pathZ[last] * k)
      }
      if (ringGeo && ringZ) {
        const arr = ringGeo.attributes.position
        for (let i = 0; i < ringZ.length; i++) arr.setZ(i, ringZ[i] * k)
        arr.needsUpdate = true
        ringGeo.computeBoundingSphere()
      }
      groundObjects.forEach(({ obj, groundZ, lift }) => {
        obj.position.z = groundZ * k + lift
      })

      const dz = targetZ * (k - currentExag)
      controls.target.z += dz
      camera.position.z += dz
      currentExag = k
      controls.update()
    }

    // estado inicial (força a primeira aplicação partindo de um valor neutro)
    currentExag = 0
    applyExaggeration(exagRef.current)
    resetView()
    apiRef.current = { applyExaggeration, resetView }

    /* --- textura de satélite (assíncrona, com plano B) -------------------- */
    let cancelled = false
    buildImageryCanvas([minLon, minLat, maxLon, maxLat], () => cancelled)
      .then((canvas) => {
        if (cancelled) return
        if (!canvas) {
          setImagery('fallback')
          return
        }
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate = true
        track(texture)
        terrainMat.map = texture
        terrainMat.vertexColors = false
        terrainMat.color.set(0xffffff)
        terrainMat.needsUpdate = true
        setImagery('ok')
      })
      .catch(() => {
        if (!cancelled) setImagery('fallback')
      })

    /* --- redimensionamento e ciclo de render ------------------------------ */
    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    ro?.observe(host)
    window.addEventListener('resize', resize)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    /* --- limpeza ----------------------------------------------------------- */
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      controls.dispose()
      apiRef.current = null
      if (wpInstances) wpInstances.dispose()
      disposables.forEach((r) => r?.dispose?.())
      disposables.clear()
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss?.()
      renderer.domElement.remove()
    }
    // a cena é reconstruída apenas quando o CONTEÚDO muda (ver `sig`)
  }, [sig])

  // Exagero vertical: atualiza a cena existente
  useEffect(() => {
    apiRef.current?.applyExaggeration(exag)
  }, [exag, sig])

  const status =
    imagery === 'ok'
      ? 'Imagens © Esri'
      : imagery === 'loading'
        ? 'A carregar imagens…'
        : 'Relevo sombreado (sem imagens)'

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-3 py-2">
        <span className="text-sm font-semibold text-slate-100">{t('map3d.title')}</span>
        {hasTerrain && <span className="hidden text-xs text-slate-500 sm:inline">{status}</span>}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">{t('map3d.exaggeration')}</span>
          <div className="flex overflow-hidden rounded border border-slate-700">
            {EXAG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setExag(opt.value)}
                className={`px-2.5 py-1.5 text-sm ${
                  exag === opt.value
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" className={BTN} onClick={() => apiRef.current?.resetView()}>
            {t('map3d.reset')}
          </button>
          <button type="button" className={BTN} onClick={onClose}>
            {t('map3d.close')}
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        {hasTerrain ? (
          <div className="pointer-events-none absolute bottom-2 left-3 text-xs text-slate-500">
            Arrastar: rodar · Roda do rato: zoom · Botão direito: deslocar · Esc: fechar
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
            Sem modelo de terreno carregado — descarregue o relevo da área para ver a missão em 3D.
          </div>
        )}
      </div>
    </div>
  )
}
