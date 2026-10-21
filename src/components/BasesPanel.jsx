import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { IconChevronDown, IconDownload, IconSparkle, IconTrash, IconWarning } from './Icons.jsx'
import { exportChoices, flightsArchiveName } from '../mission/flightFiles.js'
import { eyeText, viewCaveatText, viewTerrainText } from './BaseFieldSheets.jsx'
import { SelectBox } from './Cards.jsx'
import { buttonClass } from './ui/Button.jsx'
import { fieldBox, fieldInput } from './ui/Field.jsx'
import { Switch } from './ui/Switch.jsx'

/**
 * Bases de descolagem do modo área: «Propor bases» (com as acções de
 * «Marcar base» e «Remover base» ao lado, `actions`), o que a proposta fez,
 * as bases com a zona reduzida e uma tabela, uma linha por base — os seus
 * voos, a zona e a cota de referência —, com o detalhe a abrir na própria
 * linha: o raio pedido, a zona (reduzida e porquê, fora do relevo), «voo
 * entre 0 e +X m acima do planeado», a vista de cada voo, «Atribuir blocos
 * a esta base» e «Retirar a base». As linhas vêm de summarizeBases
 * (src/mission/baseLayout.js); a interface não calcula nada. A proposta corre
 * em fatias (useBaseProposal): enquanto corre (`proposing`), o botão diz «A
 * propor bases… N %» e há «Cancelar».
 *
 * A base seleccionada (o pino no mapa, ou «Atribuir blocos a esta base») é
 * o destino dos blocos clicados no mapa; seleccionada, a sua linha abre-se.
 *
 * Refeito o mosaico, as atribuições manuais passam para os blocos novos por
 * sobreposição; as que não passaram são contadas (`carryLost`) e ditas aqui,
 * até o operador as dispensar ou o mosaico mudar de novo.
 *
 * Bacias de visão (`viewshed`, de useViewsheds): por voo a parte do bloco
 * que se vê do ponto da base e, quando tapada, a que distância; o relevo
 * usado com a ressalva do MDT, e a camada do mapa (ViewshedBox).
 *
 * Com a área dividida em voos, a exportação por voo (`exportFlights`,
 * FlightExports): os KMZ de todos os voos, numa pasta por base ou de um só,
 * atrás do preflight; os KML dos blocos, todos ou numa pasta por base; e o
 * KML «Bases e blocos» para o campo.
 *
 * No painel da área, `part="list"` desenha só as bases (secção «Bases e
 * segurança»); as bacias de visão e a exportação por voo ficam nas secções
 * delas.
 */
export default function BasesPanel({
  rows,
  selectedBaseId,
  onSelect,
  onRemove,
  onRadius,
  onPropose,
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
  // botões ao lado de «Propor bases» (Marcar e Remover base), e uma nota por baixo
  actions = null,
  actionsNote = null,
  // «Ver todos no preflight», na caixa das zonas reduzidas
  onShowPreflight = null,
}) {
  const t = useT()
  const all = part === 'all'
  // as linhas com o detalhe aberto; a base seleccionada (no mapa, ou para
  // lhe atribuir blocos) abre a sua
  const [openIds, setOpenIds] = useState(() => new Set())
  const [seenSel, setSeenSel] = useState(selectedBaseId)
  if (selectedBaseId !== seenSel) {
    setSeenSel(selectedBaseId)
    if (selectedBaseId && !openIds.has(selectedBaseId))
      setOpenIds(new Set(openIds).add(selectedBaseId))
  }
  const toggleRow = (id) =>
    setOpenIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const reduced = rows.filter((r) => r.reduced).length
  const info = [
    rows.length > 0 ? tCount(t, 'bases.count', rows.length, { n: rows.length }) : null,
    t('bases.vlos', { m: vlosM }),
    t('bases.radiusDefault', { r: defaultRadiusM }),
    maxFlightsPerBase > 0 ? t('bases.maxPerBase', { n: maxFlightsPerBase }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div data-testid="bases-panel" className="flex flex-col gap-3">
      <div
        className={`grid gap-1.5 ${
          actions ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'grid-cols-1'
        }`}
      >
        <button
          type="button"
          onClick={onPropose}
          disabled={!hasBlocks || Boolean(proposing)}
          title={hasBlocks ? t('bases.proposeTitle') : t('bases.proposeNeedsBlocks')}
          data-testid="propose-bases"
          data-state={proposing ? 'running' : 'idle'}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#2C4A68] bg-[#0F2438] px-2 py-1 text-[13px] font-semibold leading-tight text-sky-200 transition-colors hover:bg-[#13304A] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#0F2438]"
        >
          <IconSparkle className="h-4 w-4 flex-none" />
          <span>
            {proposing
              ? t('bases.proposing', { pct: Math.round((proposing.progress ?? 0) * 100) })
              : t('bases.propose')}
          </span>
        </button>
        {actions}
      </div>
      {proposing && (
        <button
          type="button"
          onClick={proposing.onCancel}
          data-testid="propose-cancel"
          className={`${buttonClass('ghost', 'sm')} self-start text-amber-200`}
        >
          {t('bases.proposeCancel')}
        </button>
      )}
      {actionsNote}
      {proposal && (
        <p data-testid="bases-proposal" className="text-[12.5px] leading-relaxed text-sky-200">
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

      {carryLost > 0 && (
        <div
          data-testid="bases-carry-lost"
          data-lost={carryLost}
          className="flex items-start gap-2 rounded-[9px] border border-[#5C4214] bg-[#1C160B] px-3 py-2 text-[12.5px] leading-relaxed text-[#E9D8AE]"
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

      {reduced > 0 && (
        <div className="flex items-start gap-2.5 rounded-[9px] border border-[#5C4214] bg-[#1C160B] px-3 py-2.5">
          <IconWarning className="mt-0.5 h-4 w-4 flex-none text-amber-500" />
          <p className="text-[12.5px] leading-relaxed text-[#E9D8AE]">
            <strong className="font-semibold text-amber-300">
              {tCount(t, 'bases.reducedWarn', reduced, { n: reduced })}
            </strong>{' '}
            {t('bases.reducedWhy')}
            {onShowPreflight && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onShowPreflight}
                  className="font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  {t('cards.summary.seeAll')}
                </button>
              </>
            )}
          </p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-400">{info}</p>

      {rows.length === 0 && (
        <p className="text-xs leading-relaxed text-slate-400">{t('bases.none')}</p>
      )}

      {rows.length > 0 && hasBlocks && (
        <p
          data-testid="bases-click-hint"
          data-assign={assignMode ? 'on' : 'off'}
          className={`text-xs leading-relaxed ${
            assignMode
              ? 'rounded-lg border border-[#1D3A55] bg-[#0B1D2E] px-3 py-2 text-[#C9E6F7]'
              : 'text-slate-400'
          }`}
        >
          {assignMode
            ? t('bases.clickAssignOn', {
                label: rows.find((r) => r.id === selectedBaseId)?.label ?? '',
              })
            : t('bases.clickAssignOff')}
        </p>
      )}

      {rows.length > 0 && (
        <div className="max-h-[372px] overflow-y-auto rounded-[9px] border border-slate-800">
          <table
            aria-label={t('bases.title')}
            className="w-full table-fixed border-collapse text-[12.5px] tabular-nums"
          >
            <colgroup>
              <col className="w-[34%]" />
              <col />
              <col className="w-[17%]" />
              <col className="w-[18%]" />
              <col className="w-7" />
            </colgroup>
            <thead className="sticky top-0 z-[1] bg-sunken text-[11.5px] text-slate-400">
              <tr>
                <th scope="col" className="px-2.5 py-1.5 text-left font-normal">
                  {t('bases.col.base')}
                </th>
                <th scope="col" className="px-1 py-1.5 text-left font-normal">
                  {t('bases.col.flights')}
                </th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal">
                  {t('bases.col.zone')}
                </th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal">
                  {t('bases.col.ref')}
                </th>
                <th scope="col" className="py-1.5 pr-2.5">
                  <span className="sr-only">{t('bases.col.detail')}</span>
                </th>
              </tr>
            </thead>
            {rows.map((b) => (
              <BaseRow
                key={b.id}
                row={b}
                open={openIds.has(b.id)}
                onToggle={() => toggleRow(b.id)}
                selected={b.id === selectedBaseId}
                onSelect={onSelect}
                onRemove={onRemove}
                onRadius={onRadius}
                canGather={hasBlocks}
                defaultRadiusM={defaultRadiusM}
                views={viewshed?.byBlock ?? null}
              />
            ))}
          </table>
        </div>
      )}

      {all && viewshed && rows.length > 0 && hasBlocks && <ViewshedBox {...viewshed} />}

      {all && exportFlights && exportFlights.files.length > 1 && (
        <FlightExports {...exportFlights} rows={rows} />
      )}
    </div>
  )
}

/**
 * Uma linha da lista de exportações: o nome e, por baixo, o que sai (o
 * mesmo par do menu da seta do botão de exportar do cabeçalho).
 */
function ExportRow({ testId, label, desc, title, disabled = false, onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex min-h-[52px] w-full items-center gap-2.5 border-t border-raised px-3 py-2 text-left transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-100">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-400">{desc}</span>
      </span>
      <IconDownload className="h-4 w-4 flex-none text-sky-300" />
    </button>
  )
}

/**
 * Exportação dos voos, em dois pares iguais — os mesmos voos, pela mesma
 * ordem e com os mesmos nomes, todos soltos num ZIP ou numa pasta por base:
 * KMZ, a rota de cada voo («Todos os voos», «Voos por base», mais «Um voo»
 * com a escolha do voo), atrás do preflight; KML, o polígono de cada bloco
 * para a missão de mapeamento do Pilot 2 («Todos os blocos», «Blocos por
 * base»), mais o mapa «Bases e blocos». Os pares por base só com bases. Os
 * nomes vêm de flightFiles (os mesmos que o ficheiro leva); o nome e a linha
 * de cada um são os do menu da seta do botão de exportar do cabeçalho.
 */
export function FlightExports({
  files,
  baseName,
  rows,
  canExport,
  blocked,
  onExport,
  onExportKml,
  onExportKmlAll = null,
  onExportKmlByBase = null,
}) {
  const t = useT()
  const { bases } = exportChoices(files, rows)
  const [picked, setPicked] = useState(null)
  // um voo que deixou de existir (mosaico refeito) volta ao primeiro
  const flight = files.find((f) => f.blockId === picked) ?? files[0]
  const disabled = !canExport || blocked
  const why = blocked ? t('bases.export.blocked') : undefined
  const kmlByBase = bases.length > 0 ? onExportKmlByBase : null
  const group = 'overflow-hidden rounded-[9px] border border-slate-800'
  const groupTitle = 'bg-sunken px-3 py-1.5 text-[11.5px] text-slate-400'
  return (
    <div data-testid="flight-exports" className="flex flex-col gap-2">
      {/* o nome a que as dicas do cabeçalho, a ajuda e o manual se referem */}
      <h4 className="text-[13.5px] font-semibold text-slate-100">{t('bases.export.title')}</h4>
      <div role="group" aria-labelledby="flight-exports-kmz" className={group}>
        <p id="flight-exports-kmz" className={groupTitle}>
          {t('bases.export.kmzGroup')}
        </p>
        <ExportRow
          testId="export-all-flights"
          label={t('bases.export.all')}
          desc={t('app.menu.all')}
          disabled={disabled}
          onClick={() => onExport({ kind: 'all' })}
          title={
            why ??
            t('bases.export.allTitle', {
              file: `${flightsArchiveName(baseName, { kind: 'all' })}.zip`,
            })
          }
        />
        {bases.length > 0 && (
          <ExportRow
            testId="export-by-base"
            label={t('bases.export.byBase')}
            desc={t('app.menu.byBase')}
            disabled={disabled}
            onClick={() => onExport({ kind: 'byBase' })}
            title={
              why ??
              t('bases.export.byBaseTitle', {
                file: `${flightsArchiveName(baseName, { kind: 'byBase' })}.zip`,
              })
            }
          />
        )}
        <div className="flex min-h-[52px] items-center gap-2 border-t border-raised py-2 pl-3 pr-2">
          <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-100">
            {t('bases.export.one')}
          </span>
          <SelectBox
            data-testid="export-flight-select"
            aria-label={t('bases.export.oneSelect')}
            value={flight.blockId}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="!h-[34px] w-[6.5rem] rounded-[7px] !px-2"
          >
            {files.map((f) => (
              <option key={f.blockId} value={f.blockId}>
                {f.flightLabel}
              </option>
            ))}
          </SelectBox>
          <button
            type="button"
            data-testid="export-one-flight"
            disabled={disabled}
            onClick={() => onExport({ kind: 'flight', blockId: flight.blockId })}
            aria-label={t('bases.export.one')}
            title={why ?? flight.file}
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[7px] text-sky-300 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <IconDownload className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="px-0.5 text-xs leading-relaxed text-slate-400">
        {t('bases.export.names', { example: files[0].file })}
      </p>
      {(onExportKmlAll || kmlByBase || onExportKml) && (
        <div role="group" aria-labelledby="flight-exports-kml" className={group}>
          <p id="flight-exports-kml" className={groupTitle}>
            {t('bases.export.kmlGroup')}
          </p>
          {onExportKmlAll && (
            <ExportRow
              testId="export-kml-all"
              label={t('bases.export.kmlAll')}
              desc={t('app.menu.kmlAll')}
              onClick={onExportKmlAll}
              title={t('bases.export.kmlAllTitle', { file: `${baseName}_kml.zip` })}
            />
          )}
          {kmlByBase && (
            <ExportRow
              testId="export-kml-by-base"
              label={t('bases.export.kmlByBase')}
              desc={t('app.menu.kmlByBase')}
              onClick={kmlByBase}
              title={t('bases.export.kmlByBaseTitle', { file: `${baseName}_kml-por-base.zip` })}
            />
          )}
          {onExportKml && (
            <ExportRow
              testId="export-bases-kml"
              label={t('bases.export.kml')}
              desc={t('app.menu.basesKml')}
              onClick={onExportKml}
              title={t('bases.export.kmlTitle')}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Bacias de visão: a camada do mapa (lembrada neste aparelho), a vegetação
 * e os obstáculos a somar a um MDT, o relevo usado e a ressalva — um MDT não
 * tem árvores, edifícios nem escombreiras, e a vista é a do ponto da base,
 * não de toda a zona.
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
    <div
      data-testid="viewshed-box"
      className="flex shrink-0 flex-col gap-2.5 rounded-[9px] border border-slate-800 bg-sunken p-3"
    >
      <h4 className="text-[13.5px] font-semibold text-slate-100">{t('bases.view.title')}</h4>
      <Switch
        label={t('bases.view.layer')}
        title={t('bases.view.layerTitle')}
        checked={layerOn}
        onChange={onLayer}
        testId="viewshed-toggle"
      />
      {onObstacle && (
        <label
          className="flex items-center gap-2.5 text-[12.5px] leading-snug text-slate-300"
          title={t('bases.view.obstacleTitle')}
        >
          <span className="min-w-0 flex-1">{t('bases.view.obstacle')}</span>
          <span className={`${fieldBox} !h-[34px] w-[5.5rem] flex-none rounded-[7px] !px-2`}>
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
              className={fieldInput}
            />
            <span className="flex-none text-xs text-slate-400">m</span>
          </span>
        </label>
      )}
      {!terrain ? (
        <p className="text-xs leading-relaxed text-slate-400">{t('bases.view.noTerrain')}</p>
      ) : (
        <p data-testid="viewshed-terrain" className="text-xs leading-relaxed text-slate-300">
          {t('bases.view.model', { model: viewTerrainText(t, terrain) })}
          {running ? ` ${t('bases.view.pending')}` : ''}{' '}
          <span className="text-slate-400">
            {viewCaveatText(t, terrain)} {t('bases.view.point')} {t('bases.view.radioRule')}
          </span>
        </p>
      )}
    </div>
  )
}

/** A cor do texto sobre a cor de uma base: a que dá mais contraste (branco ou quase preto). */
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return '#0A0F1C'
  const n = parseInt(m[1], 16)
  const lin = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // contraste contra o branco (L 1) e contra #0A0F1C (L ~0,005)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.055 ? '#FFFFFF' : '#0A0F1C'
}

/** Contador das edições do raio (uma por foco no campo), para o Ctrl+Z. */
let radiusEdits = 0

function BaseRow({
  row: b,
  open,
  onToggle,
  selected,
  onSelect,
  onRemove,
  onRadius,
  canGather,
  defaultRadiusM,
  views,
}) {
  const t = useT()
  const detailId = useId()
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
  const zoneTone = b.noTerrain ? 'text-red-300' : b.reduced ? 'text-amber-300' : 'text-slate-300'
  const flights = b.flights.length
    ? tCount(t, 'bases.flights', b.flights.length, { list: b.flights.join(', ') })
    : t('bases.noFlights')
  const lit = open || selected
  // escolhida no mapa, ou aberta aqui: a linha, com o detalhe, fica à
  // vista no painel (aberta no fundo da tabela, o detalhe ficava por baixo)
  const rowRef = useRef(/** @type {HTMLTableSectionElement|null} */ (null))
  useEffect(() => {
    if (selected || open) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, open])
  return (
    <tbody
      ref={rowRef}
      data-testid="base-row"
      data-base-id={b.id}
      data-base-label={b.label}
      data-block-ids={b.blockIds.join(',')}
      data-ref-elev={b.refElev == null ? '' : b.refElev.toFixed(2)}
      data-zone-radius={Math.round(b.radiusM)}
    >
      {/* a linha inteira abre o detalhe com o rato; o botão é o do teclado */}
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-raised transition-colors ${
          lit ? 'bg-[#16223A]' : 'hover:bg-raised/60'
        }`}
      >
        <th scope="row" className="px-2.5 text-left font-medium">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="flex min-h-9 w-full min-w-0 items-center gap-2 text-left text-slate-100"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold"
              style={{ backgroundColor: b.color, color: inkFor(b.color) }}
            >
              {b.label}
            </span>
            <span className="truncate">{t('bases.label', { label: b.label })}</span>
          </button>
        </th>
        <td className="truncate px-1 text-slate-200" title={b.flights.join(', ')}>
          {b.flights.length ? b.flights.join(', ') : '—'}
        </td>
        <td className={`px-1 text-right ${b.reduced || b.noTerrain ? zoneTone : 'text-slate-200'}`}>
          {b.noTerrain ? '—' : `${Math.round(b.radiusM)} m`}
        </td>
        <td className="px-1 text-right text-slate-200">
          {b.refElev == null ? '—' : `${Math.round(b.refElev)} m`}
        </td>
        <td className="pr-2.5 text-right">
          <IconChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </td>
      </tr>
      <tr id={detailId} hidden={!open} className={open ? '' : 'hidden'}>
        <td colSpan={5} className="border-t border-[#22304D] bg-[#16223A] px-3 pb-3 pt-2.5">
          <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed">
            <label className="flex items-center gap-2.5 text-slate-300">
              {t('bases.radius')}
              <span className={`${fieldBox} !h-[34px] w-[5.5rem] rounded-[7px] !px-2`}>
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
                  className={fieldInput}
                />
                <span className="flex-none text-xs text-slate-400">m</span>
              </span>
            </label>
            <p className="text-slate-200">{flights}</p>
            <p className={zoneTone}>{zoneText}</p>
            {b.refElev != null && (
              <p className="text-slate-300">
                {t('bases.gain', { ref: Math.round(b.refElev), gain: Math.round(b.gainM ?? 0) })}
              </p>
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
                className={
                  seen.some((v) => v.hidden > 0 || v.radioOnly > 0)
                    ? 'text-amber-300'
                    : 'text-slate-300'
                }
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
            <div className="mt-0.5 flex items-center gap-1.5">
              {/* juntar blocos à mão: a base fica seleccionada e cada clique
                  num bloco do mapa passa-o para ela, até «Terminar» ou Esc */}
              {canGather &&
                (selected ? (
                  <div
                    data-testid="base-gather-on"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#1D3A55] bg-[#0B1D2E] px-2.5 py-1.5 text-xs leading-snug text-[#C9E6F7]"
                  >
                    <span className="flex-1">{t('bases.gatherOn', { label: b.label })}</span>
                    <button
                      type="button"
                      data-testid="base-gather-done"
                      onClick={() => onSelect(null)}
                      className={`${buttonClass('secondary', 'sm')} shrink-0 bg-panel`}
                    >
                      {t('bases.gatherDone')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="base-gather"
                    onClick={() => onSelect(b.id)}
                    title={t('bases.gatherTitle', { label: b.label })}
                    className={`${buttonClass('secondary', 'md')} min-w-0 flex-1 bg-panel`}
                  >
                    {t('bases.gather')}
                  </button>
                ))}
              {/* sem blocos não há o que atribuir: a escolha da base só
                  mostra a zona dela no mapa (como um clique no marcador) */}
              {!canGather && (
                <button
                  type="button"
                  data-testid="base-show-zone"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : b.id)}
                  title={t('bases.showZoneTitle', { label: b.label })}
                  className={`${buttonClass('secondary', 'md')} min-w-0 flex-1 ${
                    selected ? 'border-[#2C4A68] bg-[#0F2438] text-sky-200' : 'bg-panel'
                  }`}
                >
                  {t('bases.showZone')}
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(b.id)}
                title={t('bases.remove', { label: b.label })}
                aria-label={t('bases.remove', { label: b.label })}
                className={`${buttonClass('danger', 'icon')} ml-auto flex-none`}
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  )
}
