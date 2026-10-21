import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'
import { fillTerrainGaps } from '../utils/terrainGrid.js'
import { IconCube } from './Icons.jsx'
import { CARD, FOCUS, ICON_BUTTON, Icon, PILL, useMedia, useToggleFocus } from './MapOverlay.jsx'
import { buttonClass } from './ui/Button.jsx'
import { CloseKeyButton, useDialogFocus } from './ui/Window.jsx'

/**
 * VISUALIZADOR 3D DA MISSÃO
 * -------------------------
 * Sobreposição a ecrã inteiro com o relevo da área (DEM já carregado), o
 * traçado de voo em altitude real, o contorno da área, as bases do operador
 * e os alvos GCP. Com bases e blocos, cada voo vem na cor da sua base (como
 * no mapa): o traçado, o contorno do bloco drapejado no relevo, a área do
 * bloco pintada na imagem de satélite e o rótulo do voo; cada base com o
 * rótulo e o círculo da zona de descolagem. Os saltos de um voo para o
 * seguinte (`breaks`) não se desenham.
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
const MAX_PHOTO_SPHERES = 20000 // fotos: acima disto não se desenham

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

/**
 * Pinta a área de cada bloco, na cor da sua base e translúcida, sobre a
 * imagem de satélite (o canvas está em píxeis Web Mercator da bbox): a
 * textura assenta no relevo, e a cor com ela.
 */
function paintBlocks(canvas, blocks, [minLon, minLat, maxLon, maxLat]) {
  const ctx = canvas.getContext('2d')
  if (!ctx || !blocks?.length) return
  const nTop = mercatorN(maxLat)
  const nSpan = mercatorN(minLat) - nTop || 1
  const lonSpan = maxLon - minLon || 1
  const px = (p) => [
    ((p[0] - minLon) / lonSpan) * canvas.width,
    ((mercatorN(p[1]) - nTop) / nSpan) * canvas.height,
  ]
  ctx.save()
  for (const b of blocks) {
    ctx.beginPath()
    b.ring.forEach((p, i) => {
      const [x, y] = px(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = b.color || '#22d3ee'
    ctx.fill()
  }
  ctx.restore()
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
function makeLabelSprite(text, worldHeight, color = '#facc15') {
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
  ctx.fillStyle = color
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

/** Camadas da cena na legenda: um THREE.Group por chave (só as que têm conteúdo). */
const LEGEND_3D = [
  { key: 'terrain', label: 'legend.terrain' },
  { key: 'area', label: 'legend.area' },
  { key: 'blocks', label: 'legend.blocks' },
  { key: 'route', label: 'legend.route' },
  { key: 'waypoints', label: 'legend.waypoints' },
  { key: 'photos', label: 'legend.photos' },
  { key: 'bases', label: 'legend.bases' },
  { key: 'gcps', label: 'legend.gcps' },
]
const EXAG_OPTIONS = [
  { value: 1, label: '1×' },
  { value: 1.5, label: '1,5×' },
  { value: 2, label: '2×' },
]

/* --- legenda: os símbolos nas cores com que a cena desenha cada camada --- */

/** As cores distintas de uma lista, pela ordem (até `max`). */
const distinct = (colors, max = 4) => [...new Set(colors.filter(Boolean))].slice(0, max)

/** Caixa de 28 × 20 dos símbolos. */
const Sym = ({ children }) => (
  <svg aria-hidden="true" width="28" height="20" viewBox="0 0 28 20" className="flex-none">
    {children}
  </svg>
)

/** A rampa hipsométrica da cena (hypsoColor), como gradiente SVG. */
const Ramp = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#2f6b3d" />
      <stop offset="0.5" stopColor="#8a6636" />
      <stop offset="1" stopColor="#f1f5f9" />
    </linearGradient>
  </defs>
)

/**
 * Símbolo de cada camada: o relevo (a rampa das cotas, ou a imagem de
 * satélite), o contorno da área, os blocos, a rota e os waypoints nas cores
 * dos voos (ou o ciano com o realce âmbar), as fotos, as bases com a zona e
 * os alvos GCP.
 */
function symbolOf(key, { imagery, pieces, blocks, bases }) {
  if (key === 'terrain')
    return imagery === 'ok' ? (
      <Sym>
        <rect x="2" y="4" width="24" height="12" rx="2.5" fill="#55624a" />
        <path
          d="M2 12 9 8l5 4 5-3 7 4v1.5a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 2 13.5Z"
          fill="#8a7b62"
        />
      </Sym>
    ) : (
      <Sym>
        <Ramp id="map3d-ramp-mini" />
        <rect x="2" y="4" width="24" height="12" rx="2.5" fill="url(#map3d-ramp-mini)" />
      </Sym>
    )
  if (key === 'area')
    return (
      <Sym>
        <rect
          x="3"
          y="4"
          width="22"
          height="12"
          rx="1.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
        />
      </Sym>
    )
  if (key === 'blocks') {
    const c = blocks.length ? blocks : ['#22d3ee']
    return (
      <Sym>
        {[
          [2, 3],
          [15, 3],
          [2, 11],
          [15, 11],
        ].map(([x, y], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width="11"
            height="6.5"
            fill="none"
            stroke={c[i % c.length]}
            strokeWidth="1.5"
          />
        ))}
      </Sym>
    )
  }
  if (key === 'route')
    return pieces ? (
      <Sym>
        {['M2 14 8 6', 'M8 6l6 8', 'M14 14l6-8', 'M20 6l6 8'].map((d, i) => (
          <path
            key={d}
            d={d}
            stroke={pieces[i % pieces.length]}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </Sym>
    ) : (
      <Sym>
        <path
          d="M2 14 8 6l6 8 6-8 6 8"
          fill="none"
          stroke="#fbbf24"
          strokeOpacity="0.55"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M2 14 8 6l6 8 6-8 6 8"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </Sym>
    )
  if (key === 'waypoints') {
    const c = pieces ?? ['#22d3ee']
    return (
      <Sym>
        {[4.5, 11, 17.5, 24].map((x, i) => (
          <circle key={x} cx={x} cy="10" r="2.6" fill={c[i % c.length]} />
        ))}
      </Sym>
    )
  }
  if (key === 'photos')
    return (
      <Sym>
        {[4, 9.3, 14.6, 19.9, 25.2].map((x) => (
          <circle key={x} cx={x} cy="10" r="2.2" fill="#fde68a" />
        ))}
      </Sym>
    )
  if (key === 'bases') {
    const c = bases[0] ?? '#f59e0b'
    return (
      <Sym>
        <circle
          cx="14"
          cy="10"
          r="8"
          fill="none"
          stroke={c}
          strokeOpacity="0.9"
          strokeWidth="1.3"
        />
        <circle cx="14" cy="10" r="3.4" fill={c} />
      </Sym>
    )
  }
  return (
    <Sym>
      <rect
        x="9"
        y="5"
        width="10"
        height="10"
        fill="#facc15"
        stroke="#0f172a"
        transform="rotate(45 14 10)"
      />
    </Sym>
  )
}

/** Interruptor de 40 × 24 (só o desenho: o botão é a linha inteira). */
const Knob = ({ on }) => (
  <span
    aria-hidden="true"
    className={`flex h-6 w-10 flex-none rounded-full p-0.5 transition-colors ${
      on ? 'justify-end bg-sky-400' : 'justify-start bg-slate-700'
    }`}
  >
    <span className={`h-5 w-5 rounded-full ${on ? 'bg-[#06202E]' : 'bg-slate-300'}`} />
  </span>
)

/**
 * Legenda da vista 3D: um cartão no canto de cima, à direita, que se recolhe
 * numa pastilha; cada camada é um interruptor (a linha inteira) com o
 * símbolo nas cores da cena, e o relevo leva a escala das cotas e o exagero
 * vertical.
 * @param {{items: Array<{key: string, label: string, symbol: any, desc?: any, extra?: any}>,
 *   hidden: Set<string>, onToggle: (key: string) => void, open: boolean,
 *   onOpenChange: (open: boolean) => void, colors: string[], note: string}} props
 */
function Legend3D({ items, hidden, onToggle, open, onOpenChange, colors, note }) {
  const t = useT()
  const { ref: toggleRef, mark } = useToggleFocus(open)
  const setOpen = (v) => {
    mark()
    onOpenChange(v)
  }
  const testId = 'map3d-legend'
  if (!items.length) return null
  if (!open)
    return (
      <div className="absolute right-4 top-4 z-10" data-testid={testId}>
        <button
          type="button"
          ref={toggleRef}
          data-testid={`${testId}-toggle`}
          aria-expanded="false"
          aria-controls={`${testId}-body`}
          title={t('legend.expand')}
          onClick={() => setOpen(true)}
          className={PILL}
        >
          <span aria-hidden="true" className="flex gap-[3px]">
            {colors.slice(0, 3).map((c) => (
              <span key={c} className="h-2 w-2 rounded-sm" style={{ background: c }} />
            ))}
          </span>
          {t('legend.title')}
          <span className="text-slate-400">
            · {tCount(t, 'map3d.layers', items.length, { n: items.length })}
          </span>
          <Icon d="m6 9 6 6 6-6" size={14} className="text-slate-400" />
        </button>
      </div>
    )
  return (
    <section
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className={`absolute right-4 top-4 z-10 flex max-h-[calc(100%-32px)] w-[312px] max-w-[calc(100%-32px)] flex-col overflow-hidden ${CARD}`}
    >
      <div className="flex flex-none items-center gap-2 border-b border-slate-800 py-2 pl-3.5 pr-2">
        <div className="min-w-0 flex-1">
          <h3 id={`${testId}-title`} className="m-0 text-sm font-semibold">
            {t('legend.title')}
          </h3>
          <p className="m-0 mt-px text-xs text-slate-400">{t('map3d.legendHint')}</p>
        </div>
        <button
          type="button"
          ref={toggleRef}
          data-testid={`${testId}-toggle`}
          aria-expanded="true"
          aria-controls={`${testId}-body`}
          aria-label={t('legend.collapse')}
          title={t('legend.collapse')}
          onClick={() => setOpen(false)}
          className={`h-8 w-8 ${ICON_BUTTON}`}
        >
          <Icon d="m18 15-6-6-6 6" />
        </button>
      </div>
      <div id={`${testId}-body`} className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-1.5">
        {items.map((it) => {
          const on = !hidden.has(it.key)
          const row = (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby={`${testId}-${it.key}-label`}
              aria-describedby={it.desc ? `${testId}-${it.key}-desc` : undefined}
              data-testid={`${testId}-${it.key}`}
              onClick={() => onToggle(it.key)}
              className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raised ${FOCUS}`}
            >
              <span className={on ? '' : 'opacity-50'}>{it.symbol}</span>
              <span className={`min-w-0 flex-1 ${on ? '' : 'opacity-50'}`}>
                <span
                  id={`${testId}-${it.key}-label`}
                  className="block text-[13px] font-medium text-slate-100"
                >
                  {it.label}
                </span>
                {it.desc && (
                  <span
                    id={`${testId}-${it.key}-desc`}
                    className="mt-px block text-xs text-slate-400"
                  >
                    {it.desc}
                  </span>
                )}
              </span>
              <Knob on={on} />
            </button>
          )
          return it.extra ? (
            <div key={it.key} className="mb-1 rounded-[9px] border border-slate-800 bg-sunken">
              {row}
              <div className={`pb-2.5 pl-[46px] pr-2.5 ${on ? '' : 'opacity-50'}`}>{it.extra}</div>
            </div>
          ) : (
            <div key={it.key}>{row}</div>
          )
        })}
      </div>
      <p className="m-0 flex-none border-t border-slate-800 px-3.5 pb-[11px] pt-[9px] text-xs leading-snug text-slate-400">
        {note}
      </p>
    </section>
  )
}

/** Rato com um botão (ou a roda) aceso, para as dicas de como mexer na vista. */
function MouseIcon({ part }) {
  return (
    <Icon size={16} sw={1.8} className="text-slate-300">
      <rect x="6" y="2.5" width="12" height="19" rx="6" />
      {part === 'wheel' ? (
        <path d="M12 6v3.5" stroke="#7DD3FC" strokeWidth="2.8" />
      ) : (
        <>
          <path d="M12 2.5V10M6 10h12" />
          <path
            d={
              part === 'left' ? 'M12 2.5A6 6 0 0 0 6 8.5V10h6z' : 'M12 2.5A6 6 0 0 1 18 8.5V10h-6z'
            }
            fill="#7DD3FC"
            stroke="none"
          />
        </>
      )}
    </Icon>
  )
}

/** O primeiro e o último rótulo de voo pela numeração (A-1 … T-20). */
function flightRange(labels) {
  const num = (s) => Number(/(\d+)\s*$/.exec(s)?.[1] ?? NaN)
  const sorted = labels.filter(Boolean).sort((a, b) => num(a) - num(b) || a.localeCompare(b))
  return sorted.length ? [sorted[0], sorted[sorted.length - 1]] : null
}

export default function Map3D({
  terrain,
  ring,
  waypoints,
  refElev,
  basePoints = null,
  breaks = null,
  pieceColors = null,
  blocks3d = null,
  bases3d = null,
  gcps,
  photos = null,
  missionName = '',
  modeLabel = '',
  onClose,
}) {
  const t = useT()
  const hostRef = useRef(null)
  const boxRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const apiRef = useRef(null) // { applyExaggeration, resetView } da cena viva
  const propsRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const exagRef = useRef(1)
  useDialogFocus(boxRef)

  const [exag, setExag] = useState(1)
  const [imagery, setImagery] = useState('loading') // 'loading' | 'ok' | 'fallback'
  // um browser sem WebGL: a mensagem fica na janela, o planeador continua (M3-C4)
  const [glError, setGlError] = useState(null)
  // legenda: aberta (de início, num ecrã largo), camadas escondidas (um ref
  // para a cena reconstruída as repor) e as que têm conteúdo
  const wide = useMedia('(min-width: 1024px)')
  const [legendChoice, setLegendOpen] = useState(/** @type {boolean|null} */ (null))
  const legendOpen = legendChoice ?? wide
  const [hiddenLayers, setHiddenLayers] = useState(() => new Set())
  const hiddenRef = useRef(hiddenLayers)
  const [presentLayers, setPresentLayers] = useState(/** @type {string[]} */ ([]))
  // o que a cena calculou e a legenda mostra: as cotas da rampa do relevo e
  // se a rota vem nas cores dos voos
  const [sceneInfo, setSceneInfo] = useState(
    /** @type {{zMin: number, zMax: number, colored: boolean, waypoints: number, photos: number}|null} */ (
      null
    ),
  )

  // Escrito num efeito e não durante o render: mutar um ref no corpo do
  // componente é inseguro com renderização concorrente (React pode repetir
  // ou descartar o render). Os handlers imperativos abaixo só disparam por
  // acção do utilizador, sempre depois de o efeito ter corrido, pelo que
  // continuam a ler a versão mais recente.
  useEffect(() => {
    propsRef.current = {
      terrain,
      ring,
      waypoints,
      refElev,
      basePoints,
      breaks,
      pieceColors,
      blocks3d,
      bases3d,
      gcps,
      photos,
    }
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
    (basePoints ?? []).map((p) => p.join(',')).join(';') || '-',
    (breaks ?? []).join(','),
    (pieceColors ?? []).join(','),
    (blocks3d ?? []).map((b) => `${b.label}:${b.color}:${b.ring?.length ?? 0}`).join(';'),
    (bases3d ?? [])
      .map((b) => `${b.label}:${b.color}:${b.point?.join(',')}:${Math.round(b.radiusM ?? 0)}`)
      .join(';'),
    gcps?.length ?? 0,
    photos?.length ?? 0,
  ].join('|')

  // Esc fecha o visualizador (na captura, antes das gavetas e da base
  // seleccionada, que ficam por baixo)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Construção da cena (uma vez por conjunto de dados)
  useEffect(() => {
    const host = hostRef.current
    const {
      terrain,
      ring,
      waypoints,
      refElev,
      basePoints,
      breaks,
      pieceColors,
      blocks3d,
      bases3d,
      gcps,
      photos,
    } = propsRef.current
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
    const hasZ = new Uint8Array(vertexCount)

    const nTop = mercatorN(maxLat)
    const nSpan = mercatorN(minLat) - nTop
    const lonSpan = maxLon - minLon || 1
    let sum = 0
    let nKnown = 0
    for (let i = 0; i < vertexCount; i++) {
      const lon = lon0 + posAttr.getX(i) / mLon
      const lat = lat0 + posAttr.getY(i) / M_PER_DEG_LAT
      const raw = terrain.elevationAt(lon, lat)
      if (Number.isFinite(raw)) {
        terrainZ[i] = raw
        hasZ[i] = 1
        sum += raw
        nKnown++
      }
      // UV em Web Mercator, para a textura assentar alinhada com a bbox
      uvAttr.setXY(i, (lon - minLon) / lonSpan, nSpan > 0 ? 1 - (mercatorN(lat) - nTop) / nSpan : 0)
    }
    uvAttr.needsUpdate = true
    fillTerrainGaps(terrainZ, hasZ, SEGMENTS + 1, nKnown > 0 ? sum / nKnown : 0)

    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i < vertexCount; i++) {
      if (terrainZ[i] < zMin) zMin = terrainZ[i]
      if (terrainZ[i] > zMax) zMax = terrainZ[i]
    }
    if (!Number.isFinite(zMin)) {
      zMin = 0
      zMax = 1
    }

    /*
     * Tudo o que "assenta no chão" (contorno da área, base, GCPs, alvo da
     * câmara) lê a MESMA grelha que é desenhada, por interpolação bilinear.
     * Antes usava `terrain.elevationAt` directamente e caía em 0 m onde não
     * houvesse dados — o contorno mergulhava centenas de metros abaixo do
     * relevo, e o alvo da câmara ia para o nível do mar.
     */
    const cellX = widthM / SEGMENTS
    const cellY = heightM / SEGMENTS
    const gridAt = (x, y) => {
      const fx = Math.min(SEGMENTS, Math.max(0, (x + widthM / 2) / cellX))
      const fy = Math.min(SEGMENTS, Math.max(0, (heightM / 2 - y) / cellY))
      const ix = Math.min(SEGMENTS - 1, Math.floor(fx))
      const iy = Math.min(SEGMENTS - 1, Math.floor(fy))
      const tx = fx - ix
      const ty = fy - iy
      const row = SEGMENTS + 1
      const a = terrainZ[iy * row + ix]
      const b = terrainZ[iy * row + ix + 1]
      const c = terrainZ[(iy + 1) * row + ix]
      const d = terrainZ[(iy + 1) * row + ix + 1]
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    }
    const elevAt = (lon, lat) => gridAt((lon - lon0) * mLon, (lat - lat0) * M_PER_DEG_LAT)

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
    // um grupo por camada da legenda (THREE.Group.visible esconde-o inteiro)
    /** @type {Record<string, THREE.Group>} */
    const layer3d = {}
    for (const l of LEGEND_3D) {
      layer3d[l.key] = new THREE.Group()
      scene.add(layer3d[l.key])
    }
    layer3d.terrain.add(terrainMesh)

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

    // os índices onde começa um voo novo (só valem com todos os waypoints válidos)
    const allValid = Array.isArray(waypoints) && wps.length === waypoints.length
    const breakSet = new Set(allValid && Array.isArray(breaks) ? breaks : [])
    const colored = allValid && Array.isArray(pieceColors) && pieceColors.length > 0
    if (wps.length >= 2) {
      pathGeo = track(new THREE.BufferGeometry())
      pathGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(wps.length * 3), 3),
      )
      // segmentos i-1 → i, menos os saltos entre voos (não se voam)
      const index = []
      for (let i = 1; i < wps.length; i++) if (!breakSet.has(i)) index.push(i - 1, i)
      pathGeo.setIndex(index)
      if (colored) {
        // cor de cada waypoint: a do voo (troço) a que pertence
        const col = new Float32Array(wps.length * 3)
        const c = new THREE.Color()
        let piece = 0
        for (let i = 0; i < wps.length; i++) {
          if (i > 0 && breakSet.has(i)) piece++
          c.set(pieceColors[piece] || '#22d3ee')
          col[i * 3] = c.r
          col[i * 3 + 1] = c.g
          col[i * 3 + 2] = c.b
        }
        pathGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      }
      const pathMat = track(
        colored
          ? new THREE.LineBasicMaterial({ vertexColors: true })
          : new THREE.LineBasicMaterial({ color: '#22d3ee' }),
      )
      layer3d.route.add(new THREE.LineSegments(pathGeo, pathMat))
      // segundo passe ligeiramente acima, para contraste sobre o relevo
      // (amarelo; com as cores dos voos, branco ténue para não as misturar)
      const glowMat = track(
        new THREE.LineBasicMaterial({
          color: colored ? '#ffffff' : '#fbbf24',
          transparent: true,
          opacity: colored ? 0.25 : 0.55,
        }),
      )
      const glow = new THREE.LineSegments(pathGeo, glowMat)
      glow.position.z = unit * 0.25
      layer3d.route.add(glow)
    }

    if (wps.length > 0 && wps.length <= MAX_WP_SPHERES) {
      const wpGeo = track(new THREE.SphereGeometry(unit * 0.45, 8, 6))
      // com as cores dos voos, o material fica branco e cada esfera leva a sua
      const wpMat = track(new THREE.MeshLambertMaterial({ color: colored ? '#ffffff' : '#22d3ee' }))
      wpInstances = new THREE.InstancedMesh(wpGeo, wpMat, wps.length)
      wpInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      if (colored) {
        const c = new THREE.Color()
        let piece = 0
        for (let i = 0; i < wps.length; i++) {
          if (i > 0 && breakSet.has(i)) piece++
          wpInstances.setColorAt(i, c.set(pieceColors[piece] || '#22d3ee'))
        }
      }
      layer3d.waypoints.add(wpInstances)
    }

    if (wps.length > 0) {
      const markerGeo = track(new THREE.SphereGeometry(unit * 1.1, 16, 12))
      const startMat = track(new THREE.MeshLambertMaterial({ color: '#4ade80' }))
      const endMat = track(new THREE.MeshLambertMaterial({ color: '#ef4444' }))
      startMarker = new THREE.Mesh(markerGeo, startMat)
      endMarker = new THREE.Mesh(markerGeo, endMat)
      layer3d.route.add(startMarker, endMarker)
    }

    /* --- fotos: onde a aeronave dispara, sobre a rota -------------------- */
    // alturas relativas à mesma cota de referência dos waypoints; esferas
    // âmbar um pouco maiores do que as dos waypoints, para que, com foto por
    // waypoint, cada waypoint com foto fique âmbar (os outros ficam como estão)
    const photoList = Array.isArray(photos)
      ? photos.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      : []
    let photoInstances = null
    let photoXY = []
    let photoZ = []
    if (photoList.length > 0 && photoList.length <= MAX_PHOTO_SPHERES) {
      photoXY = photoList.map(toLocal)
      photoZ = photoList.map((p) => ref + (Number.isFinite(p[2]) ? p[2] : defaultHeight))
      const photoGeo = track(new THREE.SphereGeometry(unit * 0.5, 8, 6))
      const photoMat = track(new THREE.MeshLambertMaterial({ color: '#fde68a' }))
      photoInstances = new THREE.InstancedMesh(photoGeo, photoMat, photoList.length)
      photoInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      layer3d.photos.add(photoInstances)
    }

    /* --- linhas drapejadas no terreno (área, blocos, zonas) ------------- */
    // { geo, z }: cotas SEM exagero, reescaladas em applyExaggeration
    const draped = []
    const drape = (lonlats, color, opacity, liftM = 2, target = layer3d.area) => {
      if (!Array.isArray(lonlats) || lonlats.length < 3) return
      // densifica cada aresta para a linha acompanhar o relevo
      const closed = [...lonlats, lonlats[0]]
      const pts = []
      for (let i = 0; i < closed.length - 1; i++) {
        const [x0, y0] = toLocal(closed[i])
        const [x1, y1] = toLocal(closed[i + 1])
        const len = Math.hypot(x1 - x0, y1 - y0)
        const steps = Math.max(1, Math.min(400, Math.ceil(len / Math.max(5, extent / 400))))
        for (let k = 0; k < steps; k++) {
          const t = k / steps
          pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
        }
      }
      const z = new Float32Array(pts.length)
      const pos = new Float32Array(pts.length * 3)
      pts.forEach(([x, y], i) => {
        pos[i * 3] = x
        pos[i * 3 + 1] = y
        z[i] = elevAt(lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT) + liftM
      })
      const geo = track(new THREE.BufferGeometry())
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = track(new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
      target.add(new THREE.LineLoop(geo, mat))
      draped.push({ geo, z })
    }

    // contorno da área
    if (ring && ring.length >= 3) drape(ring, '#ffffff', 0.85)

    // contorno de cada bloco, na cor da sua base
    const blockList = (Array.isArray(blocks3d) ? blocks3d : []).filter(
      (b) => Array.isArray(b?.ring) && b.ring.length >= 3,
    )
    for (const b of blockList) drape(b.ring, b.color || '#22d3ee', 0.95, 3, layer3d.blocks)

    /* --- objetos ao nível do solo (base, GCPs, etiquetas) ---------------- */
    // { obj, groundZ, lift }: z = groundZ × exagero + lift
    const groundObjects = []

    // as bases do projecto: com rótulo, cor e zona quando vêm do painel,
    // senão só os pontos (âmbar)
    const baseList = Array.isArray(bases3d)
      ? bases3d
      : (basePoints ?? []).map((point) => ({ point, label: null, color: null, radiusM: 0 }))
    for (const base of baseList) {
      const basePoint = base?.point
      if (
        !Array.isArray(basePoint) ||
        !Number.isFinite(basePoint[0]) ||
        !Number.isFinite(basePoint[1])
      )
        continue
      const [bx, by] = toLocal(basePoint)
      const color = base.color || '#f59e0b'
      const group = new THREE.Group()
      const mastGeo = track(new THREE.CylinderGeometry(unit * 0.28, unit * 0.28, unit * 3, 12))
      mastGeo.rotateX(Math.PI / 2) // eixo do cilindro alinhado com Z
      const mat = track(new THREE.MeshLambertMaterial({ color }))
      const mast = new THREE.Mesh(mastGeo, mat)
      mast.position.z = unit * 1.5
      const capGeo = track(new THREE.SphereGeometry(unit * 0.75, 14, 10))
      const cap = new THREE.Mesh(capGeo, mat)
      cap.position.z = unit * 3
      group.add(mast, cap)
      group.position.set(bx, by, 0)
      layer3d.bases.add(group)
      const ground = elevAt(basePoint[0], basePoint[1])
      groundObjects.push({ obj: group, groundZ: ground, lift: unit * 0.4 })
      if (base.label) {
        const sprite = makeLabelSprite(String(base.label), unit * 2.4, color)
        if (sprite) {
          sprite.position.set(bx, by, 0)
          layer3d.bases.add(sprite)
          track(sprite.material.map)
          track(sprite.material)
          groundObjects.push({ obj: sprite, groundZ: ground, lift: unit * 5.2 })
        }
      }
      // zona de descolagem: círculo drapejado com o raio efectivo
      if (Number.isFinite(base.radiusM) && base.radiusM > 0) {
        const mLonB = metersPerDegLon(basePoint[1]) || 1
        const circle = []
        for (let k = 0; k < 48; k++) {
          const a = (2 * Math.PI * k) / 48
          circle.push([
            basePoint[0] + (base.radiusM * Math.sin(a)) / mLonB,
            basePoint[1] + (base.radiusM * Math.cos(a)) / M_PER_DEG_LAT,
          ])
        }
        drape(circle, color, 0.9, 2, layer3d.bases)
      }
    }

    // rótulo de cada voo no centro do bloco (até 120 blocos)
    if (blockList.length <= 120) {
      for (const b of blockList) {
        if (!b.label) continue
        const open = b.ring
        let sx = 0
        let sy = 0
        for (const p of open) {
          const [x, y] = toLocal(p)
          sx += x
          sy += y
        }
        const x = sx / open.length
        const y = sy / open.length
        const sprite = makeLabelSprite(String(b.label), unit * 1.8, b.color || '#facc15')
        if (!sprite) continue
        sprite.position.set(x, y, 0)
        layer3d.blocks.add(sprite)
        track(sprite.material.map)
        track(sprite.material)
        groundObjects.push({
          obj: sprite,
          groundZ: elevAt(lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT),
          lift: unit * 2.4,
        })
      }
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
        layer3d.gcps.add(mesh)
        groundObjects.push({ obj: mesh, groundZ: ground, lift: unit * 0.7 })

        if (g.id != null && gcps.length <= 60) {
          const sprite = makeLabelSprite(String(g.id), unit * 1.6)
          if (sprite) {
            sprite.position.set(x, y, 0)
            layer3d.gcps.add(sprite)
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

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch (err) {
      // fora do corpo do efeito (a regra react-hooks/set-state-in-effect):
      // a falha vem de um sistema externo, o WebGL, e é dita no próximo tique
      const msg = String(err?.message ?? err).slice(0, 200)
      queueMicrotask(() => setGlError(msg))
      return undefined
    }
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
      if (photoInstances) {
        for (let i = 0; i < photoXY.length; i++) {
          dummy.position.set(photoXY[i][0], photoXY[i][1], photoZ[i] * k)
          dummy.updateMatrix()
          photoInstances.setMatrixAt(i, dummy.matrix)
        }
        photoInstances.instanceMatrix.needsUpdate = true
        photoInstances.computeBoundingSphere()
      }
      for (const { geo, z } of draped) {
        const arr = geo.attributes.position
        for (let i = 0; i < z.length; i++) arr.setZ(i, z[i] * k)
        arr.needsUpdate = true
        geo.computeBoundingSphere()
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
    // camadas: a visibilidade escolhida na legenda (também depois de a cena
    // ser reconstruída) e as que têm conteúdo
    const setLayerVisible = (key, visible) => {
      if (layer3d[key]) layer3d[key].visible = visible
    }
    for (const key of Object.keys(layer3d)) setLayerVisible(key, !hiddenRef.current.has(key))
    setPresentLayers(LEGEND_3D.filter((l) => layer3d[l.key].children.length > 0).map((l) => l.key))
    // para a legenda: a rampa vai de zMin a zMax, e as cores da rota
    setSceneInfo({ zMin, zMax, colored, waypoints: wps.length, photos: photoList.length })
    apiRef.current = { applyExaggeration, resetView, setLayerVisible }

    /* --- textura de satélite (assíncrona, com plano B) -------------------- */
    let cancelled = false
    buildImageryCanvas([minLon, minLat, maxLon, maxLat], () => cancelled)
      .then((canvas) => {
        if (cancelled) return
        if (!canvas) {
          setImagery('fallback')
          return
        }
        paintBlocks(canvas, blockList, [minLon, minLat, maxLon, maxLat])
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

  // Legenda: mostrar/esconder camadas na cena viva (e lembrar para a próxima)
  useEffect(() => {
    hiddenRef.current = hiddenLayers
    for (const l of LEGEND_3D) apiRef.current?.setLayerVisible?.(l.key, !hiddenLayers.has(l.key))
  }, [hiddenLayers])
  const toggleLayer = (key) =>
    setHiddenLayers((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // as cores com que a cena desenha cada camada (as mesmas que o efeito usa)
  const colored = Boolean(sceneInfo?.colored)
  const palette = {
    imagery,
    pieces: colored ? distinct((pieceColors ?? []).map((c) => c || '#22d3ee')) : null,
    blocks: distinct((blocks3d ?? []).map((b) => b.color || '#22d3ee')),
    bases: distinct(
      (bases3d ?? []).map((b) => b.color || '#f59e0b'),
      3,
    ),
  }
  const nBases = (bases3d ?? []).filter((b) => Array.isArray(b?.point)).length
  const nGcps = Array.isArray(gcps) ? gcps.length : 0
  const exagLabel = EXAG_OPTIONS.find((o) => o.value === exag)?.label ?? `${exag}×`
  const zMin = Math.round(sceneInfo?.zMin ?? 0)
  const zMax = Math.round(sceneInfo?.zMax ?? 0)
  const reliefScale =
    zMin === zMax ? (
      <p className="m-0 text-xs leading-snug text-slate-400">{t('map3d.scaleFlat', { v: zMin })}</p>
    ) : imagery === 'ok' ? (
      <p className="m-0 text-xs leading-snug text-slate-400">
        {t('map3d.scaleImagery', { min: zMin, max: zMax })}
      </p>
    ) : (
      <>
        <svg
          role="img"
          aria-label={t('map3d.scaleAria', { min: zMin, max: zMax })}
          width="100%"
          height="8"
          viewBox="0 0 220 8"
          preserveAspectRatio="none"
          className="block"
        >
          <Ramp id="map3d-ramp" />
          <rect width="220" height="8" rx="4" fill="url(#map3d-ramp)" />
        </svg>
        <div
          aria-hidden="true"
          data-testid="map3d-scale"
          className="mt-1 flex justify-between text-[11.5px] tabular-nums text-slate-200"
        >
          <span>{zMin} m</span>
          <span>{zMax} m</span>
        </div>
        <p className="m-0 mt-1 text-xs leading-snug text-slate-400">
          {t(imagery === 'loading' ? 'map3d.scaleLoading' : 'map3d.scaleFallback')}
        </p>
      </>
    )
  const desc = {
    terrain:
      terrain?.source === 'file'
        ? t('map3d.terrainFile', {
            label: terrain.label,
            res: Number.isFinite(terrain.resolutionM) ? +terrain.resolutionM.toFixed(1) : '?',
          })
        : t('map3d.terrainGlobal'),
    area: t('map3d.areaDesc'),
    blocks: t('map3d.blocksDesc'),
    route: (
      <span className="inline-flex flex-wrap items-center gap-[5px]">
        {colored ? t('map3d.routeBase') : t('map3d.routePlain')} · {t('legend.start')}
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#4ade80]" />· {t('legend.end')}
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#ef4444]" />
      </span>
    ),
    waypoints: colored
      ? t('map3d.inBaseColour', { n: sceneInfo?.waypoints ?? 0 })
      : String(sceneInfo?.waypoints ?? 0),
    photos: colored
      ? t('map3d.photosOver', { n: sceneInfo?.photos ?? 0 })
      : String(sceneInfo?.photos ?? 0),
    bases: tCount(t, 'map3d.basesDesc', nBases, { n: nBases }),
    gcps: tCount(t, 'map3d.gcpsDesc', nGcps, { n: nGcps }),
  }
  const legendItems = LEGEND_3D.filter((l) => presentLayers.includes(l.key)).map((l) => ({
    key: l.key,
    label: t(l.label),
    symbol: symbolOf(l.key, palette),
    desc: desc[l.key],
    extra:
      l.key === 'terrain' ? (
        <>
          {reliefScale}
          <p data-testid="map3d-exag" className="m-0 mt-1 text-xs leading-snug text-slate-300">
            {t('map3d.exag', { k: exagLabel })}
          </p>
        </>
      ) : null,
  }))
  // a pastilha da legenda recolhida: as cores dos voos (ou da rota), senão as das bases
  const pillColors =
    palette.pieces ?? (palette.blocks.length ? palette.blocks : ['#22d3ee', '#fbbf24'])
  // na área, sem GCP diz-se porquê a camada não aparece
  const legendNote =
    Array.isArray(gcps) && !presentLayers.includes('gcps') ? t('map3d.noteNoGcp') : t('legend.note')

  // o resumo do cabeçalho: o modo, os voos (do primeiro ao último) e as bases
  const nFlights = blocks3d?.length || (waypoints?.length ? (breaks?.length ?? 0) + 1 : 0)
  const range = flightRange((blocks3d ?? []).map((b) => b.label))
  const summary = [
    modeLabel,
    nFlights > 1 && range
      ? t('map3d.flightsRange', { n: nFlights, first: range[0], last: range[1] })
      : nFlights > 0
        ? tCount(t, 'map3d.flights', nFlights, { n: nFlights })
        : null,
    nBases > 0 ? tCount(t, 'map3d.bases', nBases, { n: nBases }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const status =
    imagery === 'ok'
      ? t('map3d.imageryOk')
      : imagery === 'loading'
        ? t('map3d.imageryLoading')
        : t('map3d.imageryFallback')

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="map3d-title"
      data-testid="map3d"
      tabIndex={-1}
      className="fixed inset-0 z-[2000] flex flex-col bg-[#020617] text-slate-100 outline-none"
    >
      <div className="flex h-14 flex-none items-center gap-3 border-b border-slate-800 bg-slate-950 px-4">
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <IconCube className="h-5 w-5 text-sky-400" />
          <h2 id="map3d-title" className="m-0 text-[17px] font-semibold tracking-[-0.01em]">
            {t('map3d.title')}
          </h2>
        </div>
        {(missionName || summary) && (
          <>
            <span aria-hidden="true" className="hidden h-6 w-px bg-slate-800 xl:block" />
            <div className="hidden min-w-0 items-baseline gap-2 whitespace-nowrap xl:flex">
              {missionName && (
                <span className="truncate text-[13.5px] font-medium">{missionName}</span>
              )}
              {summary && (
                <span data-testid="map3d-summary" className="truncate text-[12.5px] text-slate-400">
                  {summary}
                </span>
              )}
            </div>
          </>
        )}
        {hasTerrain && (
          <span
            role="status"
            className={`hidden h-7 min-w-0 items-center gap-[7px] truncate whitespace-nowrap rounded-full border px-2.5 text-[12.5px] font-medium md:inline-flex ${
              imagery === 'loading'
                ? 'border-[#1E2E4A] bg-[#0F1A2E] text-blue-300'
                : 'border-slate-700 bg-surface text-slate-300'
            }`}
          >
            {imagery === 'loading' && (
              <Icon d="M21 12a9 9 0 1 1-6.2-8.6" size={14} sw={2.2} className="animate-spin" />
            )}
            {status}
          </span>
        )}
        <span className="flex-1" />
        <span className="hidden whitespace-nowrap text-[12.5px] text-slate-400 xl:inline">
          {t('map3d.exaggeration')}
        </span>
        <div
          role="group"
          aria-label={t('map3d.exaggeration')}
          className="grid flex-none grid-cols-[repeat(3,48px)] gap-0.5 rounded-[9px] border border-slate-800 bg-field p-[3px]"
        >
          {EXAG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={exag === opt.value}
              onClick={() => setExag(opt.value)}
              className={`h-7 rounded-md text-[13px] tabular-nums transition-colors ${
                exag === opt.value
                  ? 'bg-[#1E3A52] font-semibold text-sky-100'
                  : 'font-medium text-slate-200 hover:bg-raised'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          title={t('map3d.resetTitle')}
          onClick={() => apiRef.current?.resetView()}
          className={`${buttonClass('secondary', 'md')} flex-none`}
        >
          <Icon size={16} sw={1.9}>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </Icon>
          {t('map3d.reset')}
        </button>
        <span aria-hidden="true" className="h-6 w-px flex-none bg-slate-800" />
        <CloseKeyButton text={t('map3d.close')} onClick={onClose} />
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        {!glError && hasTerrain && (
          <Legend3D
            items={legendItems}
            hidden={hiddenLayers}
            onToggle={toggleLayer}
            open={legendOpen}
            onOpenChange={setLegendOpen}
            colors={pillColors}
            note={legendNote}
          />
        )}
        {glError ? (
          <div
            data-testid="map3d-error"
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-amber-300"
          >
            {t('map3d.noWebgl', { msg: glError })}
          </div>
        ) : hasTerrain ? (
          <div
            role="note"
            aria-label={t('map3d.hints')}
            className={`pointer-events-none absolute bottom-4 left-4 max-w-[calc(100%-32px)] px-3.5 py-2.5 text-[12.5px] text-slate-200 ${CARD}`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-[7px]">
                <MouseIcon part="left" />
                {t('map3d.hintDrag')}
              </span>
              <span className="inline-flex items-center gap-[7px]">
                <MouseIcon part="wheel" />
                {t('map3d.hintWheel')}
              </span>
              <span className="inline-flex items-center gap-[7px]">
                <MouseIcon part="right" />
                {t('map3d.hintRight')}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-[7px] text-slate-300">
              <Icon size={16} sw={1.8}>
                <path d="M22 14a8 8 0 0 1-8 8" />
                <path d="M18 11v-1a2 2 0 0 0-4 0" />
                <path d="M14 10V9a2 2 0 0 0-4 0v1" />
                <path d="M10 9.5V4a2 2 0 0 0-4 0v10" />
                <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
              </Icon>
              {t('map3d.hintTouch')}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
            {t('map3d.noTerrain')}
          </div>
        )}
      </div>
    </div>
  )
}
