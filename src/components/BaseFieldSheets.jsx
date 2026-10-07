import { useT } from '../i18n.jsx'

/**
 * Ficha de campo por base (baseFieldSheets, src/mission/fieldSheet.js),
 * comum à checklist de campo e ao relatório da missão: rótulo, coordenadas
 * com a ligação para a aplicação de mapas, zona («descolar até R m do
 * ponto», reduzida e porquê), cota de referência e ganho, conjuntos de
 * baterias contra os da equipa, alcance visual e os voos com o tempo
 * (trânsito incluído) e o nome do KMZ. Imprimível: as ligações levam o
 * texto das coordenadas, e as classes de impressão vêm de quem a usa.
 * @param {{sheets: any[], cardClass?: string, tableClass?: string}} props
 */
export default function BaseFieldSheets({ sheets, cardClass = '', tableClass = '' }) {
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
  const cell = 'border border-slate-800 px-2 py-[3px] text-[11px]'
  const head =
    'border border-slate-800 bg-slate-950 px-2 py-[3px] text-left text-[9px] font-semibold uppercase tracking-wider text-slate-400'
  return (
    <div className="space-y-3" data-testid="base-sheets">
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
              <span className="font-mono text-[11px] text-slate-300">
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
                  className="no-print text-[10px] text-slate-500 underline"
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
              <tr>
                <th className={head}>{t('bases.sheet.batteries')}</th>
                <td className={`${cell} ${s.sets.short ? 'text-amber-300' : ''}`}>
                  {s.sets.sets != null
                    ? t('bases.sheet.setsKnown', { flights: s.sets.flights, sets: s.sets.sets })
                    : t('bases.sheet.setsUnknown', { flights: s.sets.flights })}
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
            </tbody>
          </table>
          <table className={`mt-1.5 w-full border-collapse text-left ${tableClass}`}>
            <thead>
              <tr>
                <th className={`${head} w-20`}>{t('bases.sheet.flight')}</th>
                <th className={`${head} w-24`}>{t('bases.sheet.time')}</th>
                <th className={`${head} w-28`}>{t('bases.sheet.transit')}</th>
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
                  <td className={`${cell} break-all font-mono text-slate-300`}>{f.file ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${head} normal-case`}>{t('bases.sheet.total')}</td>
                <td className={`${cell} font-mono text-sky-300`}>{min(s.totalS)}</td>
                <td className={cell} colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  )
}
