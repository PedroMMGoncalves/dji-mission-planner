import { useLayoutEffect, useMemo, useRef } from 'react'
import { useT } from '../i18n.jsx'
import { rangeText, tCount } from '../i18n/format.js'
import { sheetHeights, zoneNotice } from '../mission/fieldSheet.js'
import { qrSvg } from '../utils/qrCode.js'
import { IconWarning } from './Icons.jsx'

/**
 * Modelo de relevo das bacias de visão em texto: «relevo global ~30 m»,
 * «MDT importado «ficheiro» (2.0 m)», «MDS importado ...», e a vegetação
 * somada («+ 15 m de vegetação e obstáculos»).
 * @param {(key: string, vars?: object) => string} t
 * @param {import('../mission/viewshedPlan.js').TerrainModel|null} model
 */
export function viewTerrainText(t, model) {
  if (!model) return ''
  const res = model.resolutionM > 0 ? model.resolutionM.toFixed(1) : '?'
  const dsm = model.surface === 'dsm'
  const base =
    model.kind === 'global'
      ? t('bases.view.global')
      : model.label
        ? t(dsm ? 'bases.view.fileDsm' : 'bases.view.file', { label: model.label, res })
        : t(dsm ? 'bases.view.fileDsmNoLabel' : 'bases.view.fileNoLabel', { res })
  return model.obstacleM > 0
    ? `${base} ${t('bases.view.plusObstacle', { m: model.obstacleM })}`
    : base
}

/**
 * Ressalva do modelo de relevo: um MDT (ou o global) não tem árvores,
 * edifícios nem escombreiras (salvo a vegetação somada); um MDS já os tem.
 * @param {(key: string, vars?: object) => string} t
 * @param {import('../mission/viewshedPlan.js').TerrainModel|null} model
 */
export function viewCaveatText(t, model) {
  if (!model) return ''
  if (model.surface === 'dsm') return t('bases.view.caveatDsm')
  if (model.obstacleM > 0) return t('bases.view.caveatObstacle', { m: model.obstacleM })
  return t('bases.view.caveat')
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/**
 * Onde ficam os olhos quando não é no ponto da base (o melhor ponto da zona
 * para aquele voo): «olhos a 90 m E da base», com as coordenadas se
 * `coords` (a ficha de campo, para o telemóvel). '' no ponto da base.
 * @param {(key: string, vars?: object) => string} t
 * @param {{point: number[], shiftM: number, bearingDeg: number}|null|undefined} eye
 * @param {{coords?: boolean}} [opts]
 */
export function eyeText(t, eye, { coords = false } = {}) {
  if (!eye) return ''
  const dir = t(`bases.dir.${DIRS[Math.round(eye.bearingDeg / 45) % 8]}`)
  const txt = t('bases.view.eye', { m: Math.round(eye.shiftM / 5) * 5, dir })
  return coords ? `${txt} (${eye.point[1].toFixed(5)}, ${eye.point[0].toFixed(5)})` : txt
}

/**
 * Parte visível de um voo vista da base: «82 % visível — tapado a ~420 m do
 * operador», e o rádio quando a parte à vista o tem em risco («rádio em risco em
 * 12 % (Fresnel a ~260 m)»); «—» enquanto se calcula ou sem relevo.
 * @param {(key: string, vars?: object) => string} t
 * @param {import('../mission/viewshedPlan.js').ViewSummary|null} view
 */
export function flightViewText(t, view) {
  if (!view) return '—'
  const parts = [t('bases.view.visiblePct', { pct: view.visiblePct })]
  if (view.eye) parts.push(eyeText(t, view.eye, { coords: true }))
  if (view.hidden > 0) parts.push(t('bases.view.hiddenAt', { m: view.blockedAtM }))
  if (view.radioOnly > 0)
    parts.push(t('bases.view.radioAt', { pct: view.radioOnlyPct, m: view.radioAtM }))
  return parts.join(' — ')
}

/**
 * Ficha de campo por base (baseFieldSheets, src/mission/fieldSheet.js),
 * comum à checklist de campo e ao relatório da missão: rótulo, coordenadas
 * com a ligação para a aplicação de mapas, zona («descolar até R m do
 * ponto», reduzida e porquê), cota de referência e ganho, conjuntos de
 * baterias contra os da equipa, alcance visual e os voos com o tempo
 * (trânsito incluído), a parte de cada bloco que se vê da base (bacias de
 * visão, com o relevo usado) e o nome do KMZ. Imprimível: as ligações levam o
 * texto das coordenadas, e as classes de impressão vêm de quem a usa.
 * @param {{sheets: any[], day?: any, cardClass?: string, tableClass?: string}} props
 */
export default function BaseFieldSheets({ sheets, day = null, cardClass = '', tableClass = '' }) {
  const t = useT()
  const min = (s) => (Number.isFinite(s) ? Math.round(s / 60) : '—')
  const zoneText = (s) =>
    s.noTerrain
      ? t('bases.zoneNoTerrain')
      : s.reduced
        ? t('bases.kml.zoneReduced', {
            r: Math.round(s.radiusM),
            req: Math.round(s.requestedRadiusM),
            relief: Math.round(s.cause?.reliefM ?? 0),
            at: Math.round(s.cause?.atM ?? 0),
          })
        : t('bases.kml.zone', { r: Math.round(s.radiusM) })
  const cell = 'border border-slate-800 px-2 py-[3px] text-xs'
  const head =
    'border border-slate-800 bg-slate-950 px-2 py-[3px] text-left text-[9px] font-semibold uppercase tracking-wider text-slate-400'
  return (
    <div className="space-y-3" data-testid="base-sheets">
      {day && (
        <p
          data-testid="sheets-day"
          className={`mb-2 text-sm ${day.short ? 'text-amber-300' : 'text-slate-200'}`}
        >
          {day.sets != null
            ? tCount(t, 'bases.sheet.day', day.flights, {
                flights: day.flights,
                sets: day.flights,
                team: day.sets,
              })
            : tCount(t, 'bases.sheet.dayUnknown', day.flights, {
                flights: day.flights,
                sets: day.flights,
              })}
        </p>
      )}
      {sheets.map((s) => (
        <div
          key={s.id}
          data-testid="base-sheet"
          data-base-label={s.label}
          className={`rounded border border-slate-800 p-2 ${cardClass}`}
        >
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-100">
              <span
                className="rep-swatch inline-block h-3 w-3 rounded-full border border-slate-950"
                style={{ backgroundColor: s.color }}
              />
              {t('bases.label', { label: s.label })}
            </span>
            {s.links && (
              <span className="font-mono text-xs text-slate-300">
                <a
                  href={s.links.https}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="base-sheet-link"
                  className="text-sky-300 underline"
                  title={t('bases.sheet.open')}
                >
                  {s.coords}
                </a>{' '}
                <a
                  href={s.links.geo}
                  className="no-print text-xs text-slate-400 underline"
                  title={t('bases.sheet.openGeo')}
                >
                  {t('bases.sheet.openGeo')}
                </a>
              </span>
            )}
          </div>
          <table className={`w-full border-collapse text-left ${tableClass}`}>
            <tbody>
              <tr>
                <th className={`${head} w-40`}>{t('bases.sheet.zone')}</th>
                <td className={`${cell} ${s.reduced || s.noTerrain ? 'text-amber-300' : ''}`}>
                  {zoneText(s)}
                </td>
              </tr>
              <tr>
                <th className={head}>{t('bases.sheet.ref')}</th>
                <td className={cell}>
                  {s.refElev != null
                    ? t('bases.sheet.refValue', {
                        ref: Math.round(s.refElev),
                        gain: Math.round(s.gainM ?? 0),
                      })
                    : '—'}
                </td>
              </tr>
              {s.params && (
                <tr>
                  <th className={head}>{t('bases.sheet.params')}</th>
                  <td className={cell} data-testid="base-sheet-params">
                    {t('bases.sheet.paramsValue', {
                      alt: Math.round(s.params.altitudeM),
                      v: s.params.speedMS,
                      f: s.params.frontPct,
                      s: s.params.sidePct,
                      gsd: Number.isFinite(s.params.gsdCm) ? s.params.gsdCm.toFixed(1) : '—',
                    })}
                  </td>
                </tr>
              )}
              <tr>
                <th className={head}>{t('bases.sheet.rth')}</th>
                <td className={cell} data-testid="base-sheet-rth">
                  {s.rthM != null
                    ? t('bases.sheet.rthValue', {
                        rth: Math.round(s.rthM),
                        takeoff: s.takeoffM ?? '—',
                      })
                    : '—'}
                </td>
              </tr>
              <tr>
                <th className={head}>{t('bases.sheet.batteries')}</th>
                <td className={`${cell} ${s.sets.short ? 'text-amber-300' : ''}`}>
                  {s.sets.sets != null
                    ? tCount(t, 'bases.sheet.setsKnown', s.sets.flights, {
                        flights: s.sets.flights,
                        sets: s.sets.sets,
                      })
                    : tCount(t, 'bases.sheet.setsUnknown', s.sets.flights, {
                        flights: s.sets.flights,
                      })}
                  {s.sets.short ? ` — ${t('bases.sheet.setsShort')}` : ''}
                </td>
              </tr>
              <tr>
                <th className={head}>{t('bases.sheet.vlos')}</th>
                <td className={cell}>
                  {t('bases.sheet.vlosValue', {
                    vlos: Math.round(s.vlosM),
                    worst: s.worstVlosM != null ? Math.round(s.worstVlosM) : '—',
                  })}
                </td>
              </tr>
              {s.viewTerrain && (
                <tr data-testid="base-sheet-view-terrain">
                  <th className={head}>{t('bases.sheet.viewTerrain')}</th>
                  <td className={cell}>
                    {t('bases.view.model', { model: viewTerrainText(t, s.viewTerrain) })}{' '}
                    {s.viewPending ? `${t('bases.view.pending')} ` : ''}
                    <span className="text-slate-400">
                      {viewCaveatText(t, s.viewTerrain)} {t('bases.view.point')}{' '}
                      {t('bases.view.radioRule')}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <table className={`mt-1.5 w-full border-collapse text-left ${tableClass}`}>
            <thead>
              <tr>
                <th className={`${head} w-20`}>{t('bases.sheet.flight')}</th>
                <th className={`${head} w-24`}>{t('bases.sheet.time')}</th>
                <th className={`${head} w-28`}>{t('bases.sheet.transit')}</th>
                <th className={`${head} w-32`}>{t('bases.sheet.heights')}</th>
                <th className={`${head} w-20`}>{t('bases.sheet.pctUseful')}</th>
                <th className={`${head} w-40`}>{t('bases.sheet.view')}</th>
                <th className={head}>{t('bases.sheet.file')}</th>
              </tr>
            </thead>
            <tbody>
              {s.flights.map((f) => (
                <tr key={f.blockId} data-testid="base-sheet-flight" data-flight={f.flightLabel}>
                  <td className={`${cell} font-mono text-slate-100`}>
                    {f.flightLabel}
                    {!f.withinVlos && (
                      <span className="ml-1 text-amber-300">({t('bases.sheet.outOfVlos')})</span>
                    )}
                  </td>
                  <td className={`${cell} font-mono`}>{min(f.totalS)}</td>
                  <td className={`${cell} font-mono text-slate-400`}>{min(f.transitS)}</td>
                  <td className={`${cell} font-mono`} data-testid="base-sheet-heights">
                    {f.h1M != null
                      ? t('bases.sheet.heightsValue', {
                          // um só valor quando a do 1.º waypoint e a máxima
                          // coincidem (antes «150–150 m»)
                          range: rangeText(f.h1M, f.hmaxM ?? f.h1M, Math.round),
                        })
                      : '—'}
                  </td>
                  <td
                    className={`${cell} font-mono ${f.pctUseful > 90 ? 'text-amber-300' : ''}`}
                    data-testid="base-sheet-pct"
                  >
                    {f.pctUseful != null ? `${f.pctUseful} %` : '—'}
                  </td>
                  <td
                    data-testid="base-sheet-view"
                    data-visible-pct={f.view ? f.view.visiblePct : ''}
                    className={`${cell} ${
                      f.view?.hidden > 0 || f.view?.radioOnly > 0 ? 'text-amber-300' : ''
                    }`}
                  >
                    {flightViewText(t, f.view)}
                  </td>
                  <td className={`${cell} break-all font-mono text-slate-300`}>{f.file ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${head} normal-case`}>{t('bases.sheet.total')}</td>
                <td className={`${cell} font-mono text-sky-300`}>{min(s.totalS)}</td>
                <td className={cell} colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Folha A4 de cada base (a ficha da checklist de campo): impressa a
 * branco, uma por página, com o código QR do ponto da base. O desenho é o
 * da prancha «Ficha da base J (A4)»: 794 × 1123 px, o tamanho de uma A4
 * a 96 ppp, que é também o da folha no ecrã.
 * ------------------------------------------------------------------ */

/**
 * A tinta legível sobre a cor de uma base: a que dá mais contraste, branco
 * ou quase preto (as cores das bases alternam claras e escuras).
 * @param {string|null|undefined} hex
 */
export function baseInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const lin = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // contraste contra o branco (L 1) e contra #0A0F1C (L ~0,005)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.055 ? '#FFFFFF' : '#0A0F1C'
}

/**
 * A altura útil de uma A4 com as margens de 10 mm da impressão (277 mm a 96
 * ppp são 1047 px), com uma folga para os arredondamentos.
 */
const A4_USEFUL_PX = 1036

/** «13 min» de um tempo em segundos; «—» sem tempo. */
const minText = (s) => (Number.isFinite(s) ? `${Math.round(s / 60)} min` : '—')

/** «20/10/2026» de uma data «2026-10-20» (a da checklist); outro texto fica como está. */
const dateText = (d) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) ? d.split('-').reverse().join('/') : (d ?? '')

/**
 * Código QR em SVG (src/utils/qrCode.js): os módulos escuros sobre branco,
 * com a margem clara, nítidos no ecrã e no papel. Sem texto, nada.
 * @param {{text: string|null|undefined, label: string, size?: number, testId?: string}} props
 */
export function QrCode({ text, label, size = 104, testId }) {
  const qr = useMemo(() => qrSvg(text ?? ''), [text])
  if (!qr) return null
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      data-testid={testId}
      className="block flex-none"
    >
      <rect width={qr.size} height={qr.size} fill="#FFFFFF" />
      <path fill="#0F172A" d={qr.path} />
    </svg>
  )
}

/**
 * A zona de descolagem numa régua: do ponto da base ao raio pedido, a parte
 * onde se descola e, reduzida, onde está o desnível que a reduziu.
 * @param {{s: any, t: (key: string, vars?: object) => string}} props
 */
function ZoneDiagram({ s, t }) {
  const req = Number.isFinite(s.requestedRadiusM) && s.requestedRadiusM > 0 ? s.requestedRadiusM : 0
  const full = req > 0 ? req : s.radiusM
  if (!(full > 0)) return null
  const notice = zoneNotice(s)
  const cut = notice && notice.kind !== 'noTerrain' ? notice : null
  const r = Math.max(0, Math.round(s.radiusM ?? 0))
  const x0 = 6
  const x1 = 317
  const X = (d) => x0 + (Math.min(Math.max(d, 0), full) / full) * (x1 - x0)
  const xr = X(r)
  const xa = cut ? X(cut.at) : null
  // as etiquetas de baixo não se sobrepõem: a do raio só longe do 0, a do
  // desnível só longe da do raio e da do fim
  const showR = r > 0 && xr - x0 >= 22 && x1 - xr >= 70
  const showAt = cut && xa - (showR ? xr : x0) >= 36 && x1 - xa >= 70
  const label = cut
    ? t('bases.a4.diagramReduced', {
        label: s.label,
        r,
        relief: cut.relief,
        at: cut.at,
        req: cut.req,
      })
    : t('bases.a4.diagram', { label: s.label, r })
  const flip = xa != null && xa > 200
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 323 74"
      className="mt-2.5 block h-auto w-full"
      style={{ fontFamily: 'inherit' }}
    >
      <text x="0" y="10" fontSize="10.5" fontWeight="600" fill="#334155">
        {t('bases.a4.distance')}
      </text>
      {cut && (
        <line
          x1={x0}
          y1="36"
          x2={x1}
          y2="36"
          stroke="#94A3B8"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      )}
      <rect
        x={x0}
        y="30"
        width={Math.max(0, xr - x0)}
        height="12"
        rx="2"
        fill={cut ? '#B45309' : '#475569'}
      />
      <line x1={x0} y1="26" x2={x0} y2="46" stroke="#0F172A" strokeWidth="1.5" />
      <line x1={x1} y1="30" x2={x1} y2="42" stroke="#94A3B8" strokeWidth="1.5" />
      {cut && (
        <>
          <path d={`M${xa - 6} 33 ${xa} 23 ${xa + 6} 33z`} fill="#7C2D12" />
          <text
            x={flip ? xa - 11 : xa + 11}
            // à esquerda do desnível a régua pode já ir por baixo: o texto sobe
            y={flip ? 25 : 31}
            fontSize="10.5"
            fill="#7C2D12"
            textAnchor={flip ? 'end' : 'start'}
          >
            {t('bases.a4.relief', { m: cut.relief })}
          </text>
        </>
      )}
      <text x={x0} y="58" fontSize="10.5" fill="#334155">
        0
      </text>
      {showR && (
        <text x={xr} y="58" fontSize="10.5" fill="#334155" textAnchor="middle">
          {r} m
        </text>
      )}
      {showAt && (
        <text x={xa} y="58" fontSize="10.5" fill="#334155" textAnchor="middle">
          {cut.at} m
        </text>
      )}
      <text x={x1} y="58" fontSize="10.5" fill="#334155" textAnchor="end">
        {cut ? t('bases.a4.requested', { m: cut.req }) : `${Math.round(full)} m`}
      </text>
      <rect x={x0} y="66" width="12" height="7" rx="1.5" fill={cut ? '#B45309' : '#475569'} />
      <text x="22" y="73" fontSize="10" fill="#475569">
        {t('bases.a4.here')}
      </text>
      {cut && (
        <>
          <line
            x1="104"
            y1="69.5"
            x2="122"
            y2="69.5"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <text x="126" y="73" fontSize="10" fill="#475569">
            {t('bases.a4.reducedZone')}
          </text>
        </>
      )}
    </svg>
  )
}

/** Um dos quatro números grandes do topo da folha. */
function Tile({ label, value, sub, warn = false, testId = undefined }) {
  return (
    <div
      data-testid={testId}
      className={`rounded-lg px-3 pb-1.5 pt-1.5 ${
        warn ? 'border-[1.5px] border-[#B45309] bg-[#FFF7ED]' : 'border border-[#94A3B8]'
      }`}
    >
      <div className={`text-[11.5px] font-semibold ${warn ? 'text-[#9A3412]' : 'text-[#334155]'}`}>
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-bold leading-[1.1] tracking-[-0.02em]">{value}</div>
      <div className={`text-[11.5px] ${warn ? 'text-[#7C2D12]' : 'text-[#475569]'}`}>{sub}</div>
    </div>
  )
}

/** Uma linha «rótulo … valor» das alturas e do alcance. */
function SheetRow({ label, children, first = false, warn = false }) {
  return (
    <div
      className={`flex min-h-[26px] items-center justify-between gap-3 py-0.5 text-xs ${
        first ? '' : 'border-t border-[#E2E8F0]'
      }`}
    >
      <span className="text-[#475569]">{label}</span>
      <span className={`text-right font-semibold ${warn ? 'text-[#B45309]' : ''}`}>{children}</span>
    </div>
  )
}

/** Uma caixa de visto para marcar à mão no papel. */
function PaperCheck({ children, strong = false }) {
  return (
    <div className="flex items-start gap-2.5 py-1 text-xs">
      <span
        aria-hidden="true"
        className="mt-px h-3.5 w-3.5 flex-none rounded-[3px] border-[1.5px] border-[#0F172A]"
      />
      <span className={strong ? 'font-bold' : ''}>{children}</span>
    </div>
  )
}

/** Um campo a preencher à mão: o rótulo e a linha. */
function WriteIn({ label, extra = null }) {
  return (
    <div>
      <div className="text-[11px] text-[#475569]">
        {label}
        {extra && <span className="text-[#64748B]"> · {extra}</span>}
      </div>
      <div className="h-[26px] border-b border-[#64748B]" />
    </div>
  )
}

const SHEET_H3 = 'm-0 text-[11px] font-bold uppercase tracking-[0.06em] text-[#334155]'

/** Os campos do registo de um voo, a preencher à mão (os da checklist). */
const LOG_FIELDS = [
  'bases.a4.start',
  'bases.a4.end',
  'bases.a4.duration',
  'bases.a4.batteries',
  'bases.a4.images',
  'bases.a4.weather',
]

/**
 * A vista da base no rodapé da folha: o relevo das bacias de visão, o que
 * lhe falta, de onde se vê e a regra do rádio (o texto inteiro, com o
 * conselho para o planeamento, fica no relatório e no painel das bases).
 * @param {(key: string, vars?: object) => string} t
 * @param {any} s ficha
 */
function viewFooterText(t, s) {
  const m = s.viewTerrain
  const caveat =
    m.surface === 'dsm' ? t('bases.a4.viewDsm') : m.obstacleM > 0 ? '' : t('bases.a4.viewDtm')
  return [
    t('bases.a4.view', { model: viewTerrainText(t, m), caveat }),
    s.viewPending ? t('bases.view.pending') : '',
    t('bases.view.radioRule'),
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * A folha A4 de uma base: onde descolar (coordenadas, código QR com a
 * ligação dos mapas e a zona numa régua), as alturas e o alcance, os voos
 * com o ficheiro KMZ, o que conferir no Pilot 2, os itens críticos da
 * descolagem e o registo do voo para preencher à mão. `order` é a ordem dos
 * voos do dia (dayFlightOrder); `index` e `total` dizem que ficha é; a
 * data, o piloto, as acções de segurança e os itens críticos vêm da
 * checklist (`criticalItems`, já na língua da página).
 * @param {{sheet: any, order?: Map<string, {n: number, total: number, prev: string|null,
 *   next: string|null}>|null, index?: number, total?: number, missionName?: string,
 *   droneLabel?: string, date?: string, pilot?: string, safety?: any,
 *   criticalItems?: string[], className?: string}} props
 */
export function BaseSheetPage({
  sheet: s,
  order = null,
  index = 0,
  total = 1,
  missionName = '',
  droneLabel = '',
  date = '',
  pilot = '',
  safety = null,
  criticalItems = [],
  className = '',
}) {
  const t = useT()
  const flights = s.flights ?? []
  const one = flights.length === 1
  // com mais de quatro voos, os críticos e o registo ocupam a largura toda
  const wide = flights.length > 4
  const labels = flights.map((f) => f.flightLabel).join(', ')
  const notice = zoneNotice(s)
  const heights = sheetHeights(s)
  const r = Number.isFinite(s.radiusM) ? Math.round(s.radiusM) : null
  const usefulMin = Number.isFinite(s.usefulS) && s.usefulS > 0 ? Math.round(s.usefulS / 60) : null
  const pcts = flights.map((f) => f.pctUseful).filter((p) => Number.isFinite(p))

  // «10.º voo de 20 · antes I-9, depois K-11»: a posição no dia e os vizinhos
  const first = order?.get(flights[0]?.flightLabel)
  const last = order?.get(flights[flights.length - 1]?.flightLabel)
  const orderText =
    first && last && first.total > 1
      ? [
          one
            ? t('bases.a4.order', { n: first.n, total: first.total })
            : t('bases.a4.orderMany', { a: first.n, b: last.n, total: first.total }),
          [
            first.prev && t('bases.a4.prev', { flight: first.prev }),
            last.next && t('bases.a4.next', { flight: last.next }),
          ]
            .filter(Boolean)
            .join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
      : ''

  const warning =
    notice?.kind === 'noTerrain'
      ? { title: '', body: t('bases.a4.warnNoTerrain') }
      : notice?.kind === 'zero'
        ? {
            title: t('bases.a4.warnZeroTitle'),
            body: t(notice.drop > 0 ? 'bases.a4.warnZero' : 'bases.a4.warnReduced', notice),
          }
        : notice
          ? {
              title: t('bases.a4.warnDropTitle', { r: notice.r }),
              body: t(
                notice.kind === 'drop' ? 'bases.a4.warnDrop' : 'bases.a4.warnReduced',
                notice,
              ),
            }
          : null

  // as acções de segurança com os nomes curtos do resumo dos painéis dos
  // modos («RTH», «interromper e RTH»): os mesmos valores, numa linha
  const safetyText = safety
    ? t('bases.a4.safety', {
        finish: t(`mp.safety.end.${safety.finishAction}`),
        lost:
          safety.exitOnRCLost === 'executeLostAction'
            ? t('mp.safety.stop', { action: t(`mp.safety.act.${safety.executeRCLostAction}`) })
            : t('mp.safety.continue'),
      })
    : ''
  const paramsText = s.params
    ? t('bases.sheet.paramsValue', {
        alt: Math.round(s.params.altitudeM),
        v: s.params.speedMS,
        f: s.params.frontPct,
        s: s.params.sidePct,
        gsd: Number.isFinite(s.params.gsdCm) ? s.params.gsdCm.toFixed(1) : '—',
      })
    : ''
  const version = import.meta.env.APP_VERSION
  // a mesma vista em todos os voos (ou um só) numa linha; diferentes, uma por voo
  const views = flights.map((f) => flightViewText(t, f.view))
  const sameView = views.every((v) => v === views[0])

  // Uma folha por base: com muitos voos o conteúdo pode passar a área útil
  // da A4, e a impressão reduz-lhe a letra (zoom) só o que precisa. Mede-se
  // no ecrã, que tem a mesma largura útil da página (718 px); a impressão
  // usa --print-zoom (a regra é de quem imprime, na checklist).
  const ref = useRef(/** @type {HTMLElement|null} */ (null))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('min-height', '0px')
    const cs = getComputedStyle(el)
    const alto =
      el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    el.style.removeProperty('min-height')
    const z =
      alto > A4_USEFUL_PX ? Math.max(0.75, Math.floor((100 * A4_USEFUL_PX) / alto) / 100) : 1
    el.style.setProperty('--print-zoom', String(z))
  })

  return (
    <article
      ref={ref}
      data-testid="base-sheet"
      data-base-label={s.label}
      aria-label={t('bases.a4.title', { label: s.label })}
      className={`chk-ficha flex min-h-[1123px] w-[794px] flex-none flex-col gap-2 bg-white px-[38px] pb-[30px] pt-9 text-xs leading-[1.4] text-[#0F172A] tabular-nums [-webkit-print-color-adjust:exact] [print-color-adjust:exact] ${className}`}
    >
      <header className="flex items-center gap-3.5 border-b-2 border-[#0F172A] pb-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full text-2xl font-bold"
          style={{ backgroundColor: s.color ?? '#334155', color: baseInk(s.color) }}
        >
          {s.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <h2 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em]">
              {t('bases.label', { label: s.label })}
            </h2>
            <span className="text-[15px] font-semibold">
              {t(one ? 'bases.a4.flight' : 'bases.a4.flights', { list: labels })}
            </span>
            {orderText && <span className="text-xs text-[#475569]">{orderText}</span>}
          </div>
          <div className="mt-[3px] text-xs text-[#334155]">
            {[t('bases.a4.sub'), missionName, droneLabel].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="grid flex-none grid-cols-[auto_118px] items-end gap-2 text-[11.5px] text-[#334155]">
          <span>{t('bases.a4.date')}</span>
          <span className="min-h-[17px] border-b border-[#64748B] pb-px text-[12.5px] text-[#0F172A]">
            {dateText(date)}
          </span>
          <span>{t('bases.a4.pilot')}</span>
          <span className="min-h-[17px] border-b border-[#64748B] pb-px text-[12.5px] text-[#0F172A]">
            {pilot}
          </span>
        </div>
      </header>

      {warning && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-lg border-[1.5px] border-[#B45309] bg-[#FFF7ED] px-3.5 py-[9px]"
        >
          <IconWarning className="mt-px h-5 w-5 flex-none text-[#B45309]" />
          <p className="m-0 text-[12.5px] leading-[1.45] text-[#431407]">
            {warning.title && <strong className="font-bold text-[#7C2D12]">{warning.title}</strong>}
            {warning.title ? ' ' : ''}
            {warning.body}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Tile
          warn={Boolean(notice)}
          label={t('bases.a4.zone')}
          value={r != null ? `${r} m` : '—'}
          sub={
            s.noTerrain
              ? t('bases.a4.zoneSubNoTerrain')
              : s.reduced
                ? t('bases.a4.zoneSub', { req: notice?.req ?? r })
                : t('bases.a4.zoneSubFull')
          }
        />
        <Tile
          label={t('bases.sheet.heights')}
          value={heights ? `${rangeText(heights.minM, heights.maxM, Math.round)} m` : '—'}
          sub={t('bases.a4.relTakeoff')}
        />
        <Tile
          testId="base-sheet-rth"
          label={t('bases.sheet.rth')}
          value={s.rthM != null ? `${Math.round(s.rthM)} m` : '—'}
          sub={t('bases.a4.aboveTakeoff')}
        />
        <Tile
          label={t(one ? 'bases.a4.time' : 'bases.a4.timeMany')}
          value={minText(s.totalS)}
          sub={
            usefulMin != null && pcts.length
              ? one
                ? t('bases.a4.useful', { pct: pcts[0], useful: usefulMin })
                : t('bases.a4.usefulMany', { pct: Math.max(...pcts), useful: usefulMin })
              : one
                ? t('bases.a4.withTransit')
                : t('bases.a4.manyFlights', { n: flights.length })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-lg border border-[#CBD5E1] px-3.5 py-2.5">
          <h3 className={`${SHEET_H3} mb-2`}>{t('bases.a4.where')}</h3>
          <div className="flex items-start gap-3">
            <QrCode
              text={s.links?.https}
              testId="base-sheet-qr"
              label={t('bases.a4.qrLabel', { label: s.label, coords: s.coords })}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-[#475569]">{t('bases.a4.point')}</div>
              <div className="mt-px whitespace-nowrap text-[15.5px] font-semibold tracking-[-0.01em]">
                {s.links ? (
                  <a
                    href={s.links.https}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="base-sheet-link"
                    title={t('bases.sheet.open')}
                    className="text-[#0F172A] no-underline hover:underline"
                  >
                    {s.coords}
                  </a>
                ) : (
                  s.coords || '—'
                )}
              </div>
              {s.links && (
                <p className="m-0 mt-1.5 text-[11.5px] leading-[1.45] text-[#334155]">
                  {t('bases.a4.qrHint')}{' '}
                  <a
                    href={s.links.geo}
                    className="no-print text-[#1D4ED8] underline"
                    title={t('bases.sheet.openGeo')}
                  >
                    {t('bases.sheet.openGeo')}
                  </a>
                </p>
              )}
            </div>
          </div>
          {!s.noTerrain && <ZoneDiagram s={s} t={t} />}
        </section>

        <section className="rounded-lg border border-[#CBD5E1] px-3.5 py-2.5">
          <h3 className={`${SHEET_H3} mb-1`}>{t('bases.a4.heights')}</h3>
          <SheetRow first label={t('bases.sheet.ref')}>
            {s.refElev != null ? `${Math.round(s.refElev)} m` : '—'}
          </SheetRow>
          <SheetRow label={t('bases.a4.gain')}>
            {s.gainM != null ? t('bases.a4.gainValue', { gain: Math.round(s.gainM) }) : '—'}
          </SheetRow>
          <SheetRow label={t('bases.a4.takeoff')}>
            {s.takeoffM != null ? `${s.takeoffM} m` : '—'}
          </SheetRow>
          <SheetRow label={t('bases.sheet.vlos')}>
            {t('bases.a4.vlosValue', {
              vlos: Number.isFinite(s.vlosM) ? Math.round(s.vlosM) : '—',
              worst: s.worstVlosM != null ? Math.round(s.worstVlosM) : '—',
            })}
          </SheetRow>
          <SheetRow label={t('bases.sheet.view')}>
            {(sameView ? flights.slice(0, 1) : flights).map((f) => (
              <span
                key={f.blockId}
                className={`block ${
                  f.view?.hidden > 0 || f.view?.radioOnly > 0 ? 'text-[#B45309]' : ''
                }`}
              >
                {sameView ? '' : `${f.flightLabel}: `}
                <span
                  data-testid="base-sheet-view"
                  data-flight={f.flightLabel}
                  data-visible-pct={f.view ? f.view.visiblePct : ''}
                >
                  {flightViewText(t, f.view)}
                </span>
              </span>
            ))}
          </SheetRow>
          <SheetRow label={t('bases.sheet.batteries')} warn={Boolean(s.sets?.short)}>
            {tCount(t, 'bases.a4.sets', s.sets?.flights ?? flights.length, {
              n: s.sets?.flights ?? flights.length,
            })}
            {s.sets?.sets != null ? ` · ${t('bases.a4.setsTeam', { sets: s.sets.sets })}` : ''}
            {s.sets?.short ? ` — ${t('bases.sheet.setsShort')}` : ''}
          </SheetRow>
          {s.sets?.sets == null && (
            <p className="m-0 mt-1 text-[10.5px] leading-[1.4] text-[#475569]">
              {t('bases.a4.setsUnknown')}
            </p>
          )}
        </section>
      </div>

      <section>
        <h3 className={`${SHEET_H3} mb-1.5`}>
          {t(one ? 'bases.a4.flightTable' : 'bases.a4.flightTableMany')}
        </h3>
        <div className="overflow-hidden rounded-lg border border-[#94A3B8]">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[60px]" />
              <col />
              <col className="w-[88px]" />
              <col className="w-[84px]" />
              <col className="w-[124px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr className="bg-[#F1F5F9] text-[11px] text-[#334155]">
                <th scope="col" className="px-2 py-[7px] font-semibold">
                  {t('bases.sheet.flight')}
                </th>
                {[
                  'bases.a4.file',
                  'bases.a4.total',
                  'bases.a4.transit',
                  'bases.sheet.heights',
                  'bases.sheet.pctUseful',
                ].map((k) => (
                  <th
                    key={k}
                    scope="col"
                    className="border-l border-[#CBD5E1] px-2 py-[7px] font-semibold"
                  >
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr
                  key={f.blockId}
                  data-testid="base-sheet-flight"
                  data-flight={f.flightLabel}
                  className="border-t border-[#94A3B8] text-[13px]"
                >
                  <td className="h-[34px] px-2 font-bold">
                    {f.flightLabel}
                    {!f.withinVlos && (
                      <span className="block text-[10.5px] font-semibold leading-tight text-[#B45309]">
                        {t('bases.sheet.outOfVlos')}
                      </span>
                    )}
                  </td>
                  <td className="break-all border-l border-[#CBD5E1] px-2 font-mono text-[11.5px]">
                    {f.file ?? '—'}
                  </td>
                  <td className="border-l border-[#CBD5E1] px-2 font-semibold">
                    {minText(f.totalS)}
                  </td>
                  <td className="border-l border-[#CBD5E1] px-2">{minText(f.transitS)}</td>
                  <td
                    data-testid="base-sheet-heights"
                    className="border-l border-[#CBD5E1] px-2 font-semibold"
                  >
                    {f.h1M != null ? `${rangeText(f.h1M, f.hmaxM ?? f.h1M, Math.round)} m` : '—'}
                  </td>
                  <td
                    data-testid="base-sheet-pct"
                    className={`border-l border-[#CBD5E1] px-2 ${
                      f.pctUseful > 90 ? 'font-semibold text-[#B45309]' : ''
                    }`}
                  >
                    {f.pctUseful != null ? `${f.pctUseful} %` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(paramsText || safetyText) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mt-px h-[18px] w-[18px] flex-none"
            fill="none"
            stroke="#334155"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
          <p data-testid="base-sheet-params" className="m-0 text-xs leading-[1.45] text-[#1E293B]">
            <strong className="font-bold">{t('bases.a4.check', { flights: labels })}</strong>{' '}
            {[paramsText, safetyText].filter(Boolean).join(' · ')}.
          </p>
        </div>
      )}

      <div className={`grid gap-3 ${wide ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <section className="rounded-lg border border-[#CBD5E1] px-3.5 pb-2 pt-2.5">
          <h3 className={`${SHEET_H3} mb-1`}>{t('bases.a4.before')}</h3>
          <div className={wide ? 'grid grid-cols-2 gap-x-6' : ''}>
            {notice?.kind !== 'noTerrain' && r != null && (
              <PaperCheck strong>
                {notice?.kind === 'zero'
                  ? t('bases.a4.beforeZero')
                  : t('bases.a4.beforeZone', { r })}
              </PaperCheck>
            )}
            {criticalItems.map((txt) => (
              <PaperCheck key={txt}>{txt}</PaperCheck>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-[#CBD5E1] px-3.5 pb-3 pt-2.5">
          <h3 className={`${SHEET_H3} mb-1.5`}>
            {one ? t('bases.a4.log', { flight: labels }) : t('bases.a4.logMany')}
          </h3>
          {one ? (
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
              <WriteIn label={t('bases.a4.start')} />
              <WriteIn label={t('bases.a4.end')} />
              <WriteIn
                label={t('bases.a4.duration')}
                extra={
                  Number.isFinite(flights[0].totalS)
                    ? t('bases.a4.planned', { m: Math.round(flights[0].totalS / 60) })
                    : null
                }
              />
              <WriteIn label={t('bases.a4.batteries')} />
              <WriteIn label={t('bases.a4.images')} />
              <WriteIn label={t('bases.a4.weather')} />
            </div>
          ) : !wide ? (
            // até quatro voos: um campo por linha e uma coluna por voo, ao lado
            // dos críticos, para a folha caber numa página
            <table className="w-full table-fixed border-collapse text-left text-[11px]">
              <thead>
                <tr>
                  <td className="w-[96px]" />
                  {flights.map((f) => (
                    <th
                      key={f.blockId}
                      scope="col"
                      className="pb-0.5 pl-1.5 text-xs font-bold text-[#0F172A]"
                    >
                      {f.flightLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LOG_FIELDS.map((k) => (
                  <tr key={k} className="h-6">
                    <th scope="row" className="pr-2 align-bottom font-normal text-[#475569]">
                      {t(k)}
                    </th>
                    {flights.map((f) => (
                      <td
                        key={f.blockId}
                        className="border-b border-l border-[#64748B] border-l-white px-1.5 text-right align-bottom text-[10px] text-[#64748B]"
                      >
                        {k === 'bases.a4.duration' && Number.isFinite(f.totalS)
                          ? t('bases.a4.planned', { m: Math.round(f.totalS / 60) })
                          : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full table-fixed border-collapse text-left text-[11px]">
              <thead>
                <tr className="text-[#475569]">
                  {[
                    'bases.sheet.flight',
                    'bases.a4.start',
                    'bases.a4.end',
                    'bases.a4.duration',
                    'bases.a4.batteries',
                    'bases.a4.images',
                    'bases.a4.weather',
                  ].map((k) => (
                    <th key={k} scope="col" className="pb-1 pr-2 font-normal">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flights.map((f) => (
                  <tr key={f.blockId} className="h-[30px] border-b border-[#64748B]">
                    <td className="pr-2 font-bold">{f.flightLabel}</td>
                    <td />
                    <td />
                    <td className="text-[#64748B]">
                      {Number.isFinite(f.totalS)
                        ? t('bases.a4.planned', { m: Math.round(f.totalS / 60) })
                        : ''}
                    </td>
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section>
        <h3 className={SHEET_H3}>{t('bases.a4.notes')}</h3>
        <div className="h-[25px] border-b border-[#CBD5E1]" />
        <div className="h-[25px] border-b border-[#CBD5E1]" />
        <div className="mt-3 flex items-end gap-2.5 text-[11.5px] text-[#475569]">
          <span>{t('bases.a4.signature')}</span>
          <span className="h-5 flex-1 border-b border-[#64748B]" />
          <span>{t('bases.a4.hour')}</span>
          <span className="h-5 w-24 border-b border-[#64748B]" />
        </div>
      </section>

      <footer className="mt-auto border-t border-[#CBD5E1] pt-[7px] text-[10px] leading-[1.45] text-[#475569]">
        {s.viewTerrain && (
          <p data-testid="base-sheet-view-terrain" className="m-0">
            {viewFooterText(t, s)}
          </p>
        )}
        <div className="mt-[3px] flex justify-between gap-3">
          <span>
            {[
              `DJI Mission Planner${version ? ` v${version}` : ''}`,
              missionName,
              t('bases.a4.footer', { label: s.label, n: index + 1, total }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span>A4</span>
        </div>
      </footer>
    </article>
  )
}
