import { useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { IconDownload, IconTrash } from './Icons.jsx'
import { exportChoices, flightsArchiveName } from '../mission/flightFiles.js'
import { eyeText, viewCaveatText, viewTerrainText } from './BaseFieldSheets.jsx'

/**
 * Lista das bases de descolagem do modo área: por base, os seus voos, a
 * zona (raio, reduzida e porquê, fora do relevo) e "voo entre 0 e +X m
 * acima do planeado"; selecção (mostra a zona no mapa), raio pedido e
 * remoção. Mais a proposta de bases a partir dos blocos e o que faz o
 * clique num bloco no mapa. As linhas vêm de summarizeBases
 * (src/mission/baseLayout.js); a interface não calcula nada. A proposta corre
 * em fatias (useBaseProposal): enquanto corre (`proposing`), o botão diz «A
 * propor bases… N %» e há «Cancelar».
 *
 * Refeito o mosaico, as atribuições manuais passam para os blocos novos por
 * sobreposição; as que não passaram são contadas (`carryLost`) e ditas aqui,
 * até o operador as dispensar ou o mosaico mudar de novo.
 *
 * Bacias de visão (`viewshed`, de useViewsheds): por voo a parte do bloco
 * que se vê do ponto da base e, quando tapada, a que distância; o relevo
 * usado com a ressalva do MDT, e a camada do mapa.
 *
 * Com a área dividida em voos, a exportação por voo (`exportFlights`):
 * todos os voos, os de uma base («estou na base B») ou um só, atrás do
 * preflight, e o KML «Bases e blocos» para o campo.
 *
 * No painel em cartões da área, `part="list"` desenha só a lista (cartão
 * «Bases e segurança»); as bacias de visão (ViewshedBox) vão para a gaveta
 * do cartão e a exportação por voo (FlightExports) para o cartão «Resumo e
 * exportar».
 */
export default function BasesPanel({
  rows,
  selectedBaseId,
  onSelect,
  onRemove,
  onRadius,
  onPropose,
  onGather = null,
  gathered = null,
  hasBlocks,
  proposal,
  proposing = null,
  carryLost = 0,
  onDismissCarry = null,
  assignMode = false,
  vlosM,
  defaultRadiusM,
  maxFlightsPerBase = 0,
  exportFlights = null,
  viewshed = null,
  // 'all': tudo; 'list': sem as bacias de visão nem a exportação por voo
  part = 'all',
}) {
  const t = useT()
  const all = part === 'all'
  return (
    <div
      data-testid="bases-panel"
      className="mt-2 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t('bases.title')}
        </span>
        <span className="text-[11px] text-slate-500">
          {t('bases.vlos', { m: vlosM })}
          {maxFlightsPerBase > 0 ? ` · ${t('bases.maxPerBase', { n: maxFlightsPerBase })}` : ''}
        </span>
      </div>

      <div className="mb-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={onPropose}
          disabled={!hasBlocks || Boolean(proposing)}
          title={hasBlocks ? t('bases.proposeTitle') : t('bases.proposeNeedsBlocks')}
          data-testid="propose-bases"
          data-state={proposing ? 'running' : 'idle'}
          className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {proposing
            ? t('bases.proposing', { pct: Math.round((proposing.progress ?? 0) * 100) })
            : t('bases.propose')}
        </button>
        {proposing && (
          <button
            type="button"
            onClick={proposing.onCancel}
            data-testid="propose-cancel"
            className="rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-slate-700"
          >
            {t('bases.proposeCancel')}
          </button>
        )}
      </div>
      {proposal && (
        <p data-testid="bases-proposal" className="mb-1.5 text-[11px] leading-relaxed text-sky-200">
          {proposal.cancelled
            ? t('bases.proposeCancelled')
            : proposal.added > 0
              ? t('bases.proposed', { n: proposal.added })
              : t('bases.proposedNone')}
          {proposal.outOfVlos > 0 && (
            <span className="text-amber-300">
              {' '}
              {t('bases.proposedOut', { n: proposal.outOfVlos })}
            </span>
          )}
          {proposal.poorSites > 0 && (
            <span data-testid="bases-proposal-radio" className="text-amber-300">
              {' '}
              {t('bases.proposedRadio', { n: proposal.poorSites })}
            </span>
          )}
        </p>
      )}

      {gathered && (
        <p
          data-testid="bases-gathered"
          data-joined={gathered.joined}
          data-too-far={gathered.tooFar}
          className="mb-1.5 text-[11px] leading-relaxed text-sky-200"
        >
          {t('bases.gathered', {
            label: gathered.label,
            n: gathered.joined + gathered.kept,
            kept: gathered.kept,
          })}
          {gathered.removed.length > 0 && (
            <> {t('bases.gatheredRemoved', { list: gathered.removed.join(', ') })}</>
          )}
          {gathered.tooFar > 0 && (
            <span className="text-amber-300">
              {' '}
              {t('bases.gatheredFar', {
                n: gathered.tooFar,
                m: vlosM,
                near: Math.round(gathered.nearestFarM ?? 0),
              })}
            </span>
          )}
        </p>
      )}

      {carryLost > 0 && (
        <div
          data-testid="bases-carry-lost"
          data-lost={carryLost}
          className="mb-1.5 flex items-start gap-1.5 rounded border border-amber-800/60 bg-amber-950/30 px-1.5 py-1 text-[11px] leading-relaxed text-amber-200"
        >
          <span className="flex-1">
            {carryLost === 1 ? t('bases.carryLostOne') : t('bases.carryLost', { n: carryLost })}
          </span>
          {onDismissCarry && (
            <button
              type="button"
              onClick={onDismissCarry}
              title={t('bases.carryDismiss')}
              aria-label={t('bases.carryDismiss')}
              className="shrink-0 rounded px-1 text-amber-300 hover:bg-amber-900/60"
            >
              ×
            </button>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-[11px] leading-relaxed text-slate-500">{t('bases.none')}</p>
      )}

      {rows.length > 0 && hasBlocks && (
        <p
          data-testid="bases-click-hint"
          data-assign={assignMode ? 'on' : 'off'}
          className={`mb-1.5 rounded px-1.5 py-1 text-[11px] leading-relaxed ${
            assignMode ? 'bg-sky-950/60 text-sky-200' : 'text-slate-500'
          }`}
        >
          {assignMode
            ? t('bases.clickAssignOn', {
                label: rows.find((r) => r.id === selectedBaseId)?.label ?? '',
              })
            : t('bases.clickAssignOff')}
        </p>
      )}

      <ul className="space-y-1">
        {rows.map((b) => (
          <BaseRow
            key={b.id}
            row={b}
            selected={b.id === selectedBaseId}
            onSelect={onSelect}
            onRemove={onRemove}
            onRadius={onRadius}
            onGather={hasBlocks ? onGather : null}
            vlosM={vlosM}
            defaultRadiusM={defaultRadiusM}
            views={viewshed?.byBlock ?? null}
          />
        ))}
      </ul>

      {all && viewshed && rows.length > 0 && hasBlocks && <ViewshedBox {...viewshed} />}

      {all && exportFlights && exportFlights.files.length > 1 && (
        <FlightExports {...exportFlights} rows={rows} />
      )}
    </div>
  )
}

/**
 * Exportação dos voos: «Todos os voos (ZIP)», «Voos da base X (ZIP)» por
 * base, «Um voo (KMZ)» com a escolha do voo, e o KML de campo. Os nomes
 * vêm de flightFiles (os mesmos que o ficheiro leva).
 */
export function FlightExports({
  files,
  baseName,
  rows,
  canExport,
  blocked,
  onExport,
  onExportKml,
}) {
  const t = useT()
  const { bases } = exportChoices(files, rows)
  const [picked, setPicked] = useState(null)
  // um voo que deixou de existir (mosaico refeito) volta ao primeiro
  const flight = files.find((f) => f.blockId === picked) ?? files[0]
  const disabled = !canExport || blocked
  const why = blocked ? t('bases.export.blocked') : undefined
  const btn =
    'flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div data-testid="flight-exports" className="mt-2 border-t border-slate-800 pt-2">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {t('bases.export.title')}
      </p>
      <div className="space-y-1.5">
        <button
          type="button"
          data-testid="export-all-flights"
          disabled={disabled}
          onClick={() => onExport({ kind: 'all' })}
          title={
            why ??
            t('bases.export.allTitle', {
              file: `${flightsArchiveName(baseName, { kind: 'all' })}.zip`,
            })
          }
          className={`${btn} bg-sky-700 text-white hover:bg-sky-600`}
        >
          <IconDownload /> {t('bases.export.all')}
        </button>
        {bases.length > 0 && (
          <button
            type="button"
            data-testid="export-by-base"
            disabled={disabled}
            onClick={() => onExport({ kind: 'byBase' })}
            title={
              why ??
              t('bases.export.byBaseTitle', {
                file: `${flightsArchiveName(baseName, { kind: 'byBase' })}.zip`,
              })
            }
            className={`${btn} bg-sky-800 text-white hover:bg-sky-700`}
          >
            <IconDownload /> {t('bases.export.byBase')}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <select
            data-testid="export-flight-select"
            aria-label={t('bases.export.oneSelect')}
            value={flight.blockId}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-1.5 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            {files.map((f) => (
              <option key={f.blockId} value={f.blockId}>
                {f.flightLabel}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="export-one-flight"
            disabled={disabled}
            onClick={() => onExport({ kind: 'flight', blockId: flight.blockId })}
            title={why ?? flight.file}
            className={`${btn.replace('w-full ', '')} shrink-0 bg-slate-800 text-slate-200 hover:bg-slate-700`}
          >
            {t('bases.export.one')}
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          {t('bases.export.names', { example: files[0].file })}
        </p>
        {onExportKml && (
          <button
            type="button"
            data-testid="export-bases-kml"
            onClick={onExportKml}
            title={t('bases.export.kmlTitle')}
            className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`}
          >
            <IconDownload /> {t('bases.export.kml')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Bacias de visão: a camada do mapa (lembrada neste aparelho), o relevo
 * usado e a ressalva — um MDT não tem árvores, edifícios nem escombreiras,
 * e a vista é a do ponto da base, não de toda a zona.
 */
export function ViewshedBox({
  terrain,
  running,
  layerOn,
  onLayer,
  obstacleM = 0,
  onObstacle = null,
}) {
  const t = useT()
  // rascunho do campo enquanto se escreve
  const [draft, setDraft] = useState(null)
  const dsm = terrain?.surface === 'dsm'
  return (
    <div data-testid="viewshed-box" className="mt-2 border-t border-slate-800 pt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t('bases.view.title')}
        </span>
        <label
          className="flex items-center gap-1.5 text-[11px] text-slate-300"
          title={t('bases.view.layerTitle')}
        >
          <input
            type="checkbox"
            data-testid="viewshed-toggle"
            checked={layerOn}
            onChange={(e) => onLayer(e.target.checked)}
            className="accent-orange-500"
          />
          {t('bases.view.layer')}
        </label>
      </div>
      {onObstacle && (
        <label
          className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400"
          title={t('bases.view.obstacleTitle')}
        >
          <span className="flex-1">{t('bases.view.obstacle')}</span>
          <input
            type="number"
            min={0}
            max={60}
            step={1}
            data-testid="viewshed-obstacle"
            value={draft ?? String(obstacleM)}
            disabled={dsm}
            onFocus={() => setDraft(String(obstacleM))}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              const text = e.target.value
              setDraft(text)
              const n = text.trim() === '' ? 0 : Number(text)
              if (Number.isFinite(n) && n >= 0 && n <= 60) onObstacle(n)
            }}
            className="w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-right text-[11px] text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-40"
          />
          <span>m</span>
        </label>
      )}
      {!terrain ? (
        <p className="text-[11px] leading-relaxed text-slate-500">{t('bases.view.noTerrain')}</p>
      ) : (
        <p data-testid="viewshed-terrain" className="text-[11px] leading-relaxed text-slate-400">
          {t('bases.view.model', { model: viewTerrainText(t, terrain) })}
          {running ? ` ${t('bases.view.pending')}` : ''}{' '}
          <span className="text-slate-500">
            {viewCaveatText(t, terrain)} {t('bases.view.point')} {t('bases.view.radioRule')}
          </span>
        </p>
      )}
    </div>
  )
}

/** Contador das edições do raio (uma por foco no campo), para o Ctrl+Z. */
let radiusEdits = 0

function BaseRow({
  row: b,
  selected,
  onSelect,
  onRemove,
  onRadius,
  onGather,
  vlosM,
  defaultRadiusM,
  views,
}) {
  const t = useT()
  // parte de cada voo vista do ponto da base (só os já calculados)
  const seen = views
    ? b.blockIds
        .map((id) => views[id])
        .filter((v) => v?.summary?.status === 'ok')
        .map((v) => ({ flight: v.flightLabel, ...v.summary }))
    : []
  // rascunho do raio enquanto se escreve (vazio = o da Configuração)
  const [draft, setDraft] = useState(null)
  // cada vez que o campo ganha o foco é uma edição: tudo o que se escreve
  // até sair dele é um só passo do Ctrl+Z
  const editRef = useRef(0)
  const shown = draft ?? (b.customRadius ? String(b.requestedRadiusM) : '')
  const zoneText = b.noTerrain
    ? t('bases.zoneNoTerrain')
    : b.refElev == null
      ? t('bases.zoneWaiting', { r: Math.round(b.requestedRadiusM) })
      : b.reduced
        ? t('bases.zoneReduced', {
            r: Math.round(b.radiusM),
            req: Math.round(b.requestedRadiusM),
            relief: Math.round(b.cause?.reliefM ?? 0),
            at: Math.round(b.cause?.atM ?? 0),
          })
        : t('bases.zone', { r: Math.round(b.radiusM) })
  return (
    <li
      data-testid="base-row"
      data-base-id={b.id}
      data-base-label={b.label}
      data-block-ids={b.blockIds.join(',')}
      data-ref-elev={b.refElev == null ? '' : b.refElev.toFixed(2)}
      data-zone-radius={Math.round(b.radiusM)}
      className={`rounded border px-2 py-1.5 ${
        selected ? 'border-sky-500 bg-sky-950/40' : 'border-slate-800 bg-slate-950/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(selected ? null : b.id)}
          title={t('bases.select', { label: b.label })}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-950 text-[11px] font-bold text-slate-950"
            style={{ backgroundColor: b.color }}
          >
            {b.label}
          </span>
          <span className="text-[11px] text-slate-400">{t('bases.label', { label: b.label })}</span>
        </button>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          {t('bases.radius')}
          <input
            type="number"
            min={0}
            max={500}
            step={10}
            value={shown}
            placeholder={String(defaultRadiusM)}
            title={t('bases.radiusTitle', { r: defaultRadiusM })}
            data-testid="base-radius"
            onFocus={() => {
              setDraft(shown)
              radiusEdits += 1
              editRef.current = radiusEdits
            }}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              const text = e.target.value
              setDraft(text)
              const edit = String(editRef.current || ++radiusEdits)
              if (text.trim() === '') onRadius(b.id, null, edit)
              else if (Number.isFinite(Number(text))) onRadius(b.id, Number(text), edit)
            }}
            className="w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-right text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => onRemove(b.id)}
          title={t('bases.remove', { label: b.label })}
          aria-label={t('bases.remove', { label: b.label })}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-red-900/60 hover:text-red-200"
        >
          <IconTrash />
        </button>
      </div>
      <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-slate-200">
        {b.flights.length
          ? t('bases.flights', { list: b.flights.join(', ') })
          : t('bases.noFlights')}
      </p>
      {selected && onGather && (
        <button
          type="button"
          data-testid="base-gather"
          onClick={() => onGather(b.id)}
          title={t('bases.gatherTitle', { label: b.label, m: vlosM })}
          className="mt-1 w-full rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-sky-200 transition-colors hover:bg-slate-700"
        >
          {t('bases.gather')}
        </button>
      )}
      {seen.length > 0 && (
        <p
          data-testid="base-view"
          data-view={seen.map((v) => `${v.flight}:${v.visiblePct}`).join(',')}
          data-radio={seen.map((v) => `${v.flight}:${v.radioOnlyPct}`).join(',')}
          data-eye={seen
            .map((v) => `${v.flight}:${v.eye ? Math.round(v.eye.shiftM) : 0}`)
            .join(',')}
          title={seen.some((v) => v.eye) ? t('bases.view.eyeTitle') : undefined}
          className={`font-mono text-[11px] leading-relaxed ${
            seen.some((v) => v.hidden > 0 || v.radioOnly > 0) ? 'text-amber-300' : 'text-slate-400'
          }`}
        >
          {t('bases.view.flights', {
            list: seen
              .map((v) => {
                const seen =
                  v.hidden > 0
                    ? t('bases.view.hidden', {
                        flight: v.flight,
                        pct: v.visiblePct,
                        m: v.blockedAtM,
                      })
                    : t('bases.view.visible', { flight: v.flight, pct: v.visiblePct })
                const withEye = v.eye ? `${seen} (${eyeText(t, v.eye)})` : seen
                return v.radioOnly > 0
                  ? `${withEye} ${t('bases.view.radio', { pct: v.radioOnlyPct, m: v.radioAtM })}`
                  : withEye
              })
              .join(', '),
          })}
        </p>
      )}
      <p
        className={`text-[11px] leading-relaxed ${
          b.noTerrain ? 'text-red-300' : b.reduced ? 'text-amber-300' : 'text-slate-500'
        }`}
      >
        {zoneText}
      </p>
      {b.refElev != null && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          {t('bases.gain', { ref: Math.round(b.refElev), gain: Math.round(b.gainM ?? 0) })}
        </p>
      )}
    </li>
  )
}
