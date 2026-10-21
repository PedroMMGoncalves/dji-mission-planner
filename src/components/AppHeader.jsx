/**
 * A barra de cima: nome e versão, vista 3D, relatório, checklist, KML da
 * área, a pastilha do preflight, o KMZ do separador aberto (atrás do
 * preflight), configuração, ajuda e língua; por baixo, a lista do preflight
 * e o erro da última exportação.
 */
import { useT } from '../i18n.jsx'
import { missionExportLabel } from '../i18n/format.js'
import { FlagGB, FlagPT, IconCheck, IconCube, IconDownload, IconDrone, IconGear } from './Icons.jsx'
import { PreflightList, PreflightPill } from './PreflightBar.jsx'
import { LANGS } from '../i18n.jsx'

const FLAG_BY_LANG = { pt: FlagPT, en: FlagGB }

export default function AppHeader({
  terrainState,
  area,
  routeView,
  sheets,
  preflightState,
  setShow3d,
  missionMode,
  setShowReport,
  setView,
  showPreflight,
  setShowPreflight,
  gated,
  modeExport,
  // o que modeExport escreve ('kmz' | 'zip'), para o rótulo dizer o que sai
  modeExportKind = 'kmz',
  // a sua dica, a mesma no botão do fim do painel do separador
  modeExportTitle = null,
  modePlanOk,
  setShowSettings,
  setShowHelp,
  setLang,
  lang,
  exportError,
  setExportError,
}) {
  const { terrain, terrainCovers } = terrainState
  const { planOk, handleExportKML, canExportKML } = area
  const { view3d } = routeView
  const { exportKmlTitle } = sheets
  const { preflight, exportBlocked, terrainActions } = preflightState
  const t = useT()
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <IconDrone className="h-7 w-7 text-sky-400" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              DJI Mission Planner{' '}
              <span className="text-xs font-normal text-slate-400">
                v{import.meta.env.APP_VERSION}
              </span>
            </h1>
            {/* em ecrãs estreitos (tablet no campo) o subtítulo dá lugar aos botões */}
            <p className="hidden text-xs text-slate-400 xl:block">{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShow3d(true)}
            disabled={
              !(
                terrain.status === 'ready' &&
                view3d &&
                (missionMode !== 'area' || (terrainCovers && planOk))
              )
            }
            title={terrain.status === 'ready' ? t('app.view3dReady') : t('app.view3dNotReady')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCube /> {t('app.view3d')}
          </button>
          <button
            onClick={() => setShowReport(true)}
            disabled={!planOk}
            title={t('app.reportTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('app.report')}
          </button>
          <button
            onClick={() => setView('checklist')}
            title={t('app.checklistTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-amber-500 hover:text-amber-300"
          >
            <IconCheck /> {t('app.checklist')}
          </button>
          <button
            onClick={handleExportKML}
            disabled={!canExportKML}
            title={exportKmlTitle}
            className="flex items-center gap-1.5 whitespace-nowrap rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('app.exportKml')}
          </button>
          <PreflightPill
            items={preflight}
            open={showPreflight}
            onToggle={() => setShowPreflight((v) => !v)}
            mode={missionMode}
          />
          <button
            // no modo circular o KMZ do cabecalho e a missao circular: o
            // preflight ao lado e o dela, e a grelha da area exporta-se no
            // separador Area
            onClick={gated(modeExport)}
            disabled={!modePlanOk || exportBlocked}
            title={modeExportTitle ?? t('app.exportWpmlTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {missionExportLabel(t, modeExportKind)}
          </button>

          {/* configuração, ajuda e língua encostados à direita */}
          <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
            <button
              onClick={() => setShowSettings(true)}
              title={t('app.settingsTitle')}
              aria-label={t('app.settings')}
              data-testid="open-settings"
              className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-2.5 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
            >
              <IconGear />
            </button>
            <button
              onClick={() => setShowHelp(true)}
              title={t('app.helpTitle')}
              className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
            >
              ?
            </button>
            <div className="flex overflow-hidden rounded border border-slate-700">
              {LANGS.map(({ code, label }) => {
                const Flag = FLAG_BY_LANG[code]
                return (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    title={label}
                    className={`px-2 py-1.5 leading-none transition-opacity ${
                      lang === code ? 'bg-slate-700' : 'opacity-40 hover:opacity-90'
                    }`}
                  >
                    <Flag />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {showPreflight && <PreflightList items={preflight} actions={terrainActions} />}

      {exportError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-800 bg-red-950/60 px-4 py-2 text-xs text-red-200"
        >
          <span className="font-semibold">⚠ {t('export.failed')}</span>
          <span>{t(`export.err.${exportError.code}`, { d: exportError.detail })}</span>
          <button
            onClick={() => setExportError(null)}
            className="ml-auto rounded border border-red-700 px-2 py-0.5 font-medium hover:bg-red-900"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
