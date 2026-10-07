import { useState } from 'react'
import { useT } from '../i18n.jsx'
import { IconTrash } from './Icons.jsx'

/**
 * Lista das bases de descolagem do modo área: por base, os seus voos, a
 * zona (raio, reduzida e porquê, fora do relevo) e "voo entre 0 e +X m
 * acima do planeado"; selecção (mostra a zona no mapa), raio pedido e
 * remoção. Mais a proposta de bases a partir dos blocos e o que faz o
 * clique num bloco no mapa. As linhas vêm de summarizeBases
 * (src/mission/baseLayout.js); a interface não calcula nada.
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
  clickMode,
  onClickMode,
  vlosM,
  defaultRadiusM,
  maxFlightsPerBase = 0,
  showClickMode = true,
}) {
  const t = useT()
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

      <button
        type="button"
        onClick={onPropose}
        disabled={!hasBlocks}
        title={hasBlocks ? t('bases.proposeTitle') : t('bases.proposeNeedsBlocks')}
        data-testid="propose-bases"
        className="mb-1.5 w-full rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('bases.propose')}
      </button>
      {proposal && (
        <p data-testid="bases-proposal" className="mb-1.5 text-[11px] leading-relaxed text-sky-200">
          {proposal.added > 0
            ? t('bases.proposed', { n: proposal.added })
            : t('bases.proposedNone')}
          {proposal.outOfVlos > 0 && (
            <span className="text-amber-300">
              {' '}
              {t('bases.proposedOut', { n: proposal.outOfVlos })}
            </span>
          )}
        </p>
      )}

      {rows.length === 0 && (
        <p className="text-[11px] leading-relaxed text-slate-500">{t('bases.none')}</p>
      )}

      {rows.length > 0 && showClickMode && hasBlocks && (
        <div className="mb-1.5">
          <p className="mb-1 text-[11px] text-slate-500">{t('bases.clickMode')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { value: 'toggle', key: 'bases.clickToggle' },
              { value: 'assign', key: 'bases.clickAssign' },
            ].map(({ value, key }) => (
              <button
                key={value}
                type="button"
                data-testid={`click-mode-${value}`}
                onClick={() => onClickMode(value)}
                className={`rounded px-1 py-1 text-[11px] font-medium transition-colors ${
                  clickMode === value
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {t(key)}
              </button>
            ))}
          </div>
          {clickMode === 'assign' && (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {t('bases.clickAssignHint')}
            </p>
          )}
        </div>
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
            defaultRadiusM={defaultRadiusM}
          />
        ))}
      </ul>
    </div>
  )
}

function BaseRow({ row: b, selected, onSelect, onRemove, onRadius, defaultRadiusM }) {
  const t = useT()
  // rascunho do raio enquanto se escreve (vazio = o da Configuração)
  const [draft, setDraft] = useState(null)
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
            onFocus={() => setDraft(shown)}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              const text = e.target.value
              setDraft(text)
              if (text.trim() === '') onRadius(b.id, null)
              else if (Number.isFinite(Number(text))) onRadius(b.id, Number(text))
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
