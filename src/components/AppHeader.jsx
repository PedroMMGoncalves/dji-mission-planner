/**
 * O cabeçalho: o nome e a versão; o projecto (o nome da missão e se está
 * gravado, com mudar o nome, guardar e abrir, as acções do cartão 1); as
 * vistas (3D, relatório, checklist); a pastilha do preflight, que abre a
 * lista por cima do mapa; o botão de exportar partido — a parte principal
 * é a exportação do separador aberto, a mesma do fim do painel, e a seta
 * abre as outras desse separador (na área as do cartão 7, com os mesmos
 * nomes, dicas e acções); configuração, ajuda e língua. Por baixo, o erro
 * da última exportação.
 */
import { useEffect, useRef, useState } from 'react'
import { LANGS, useT } from '../i18n.jsx'
import { missionExportLabel } from '../i18n/format.js'
import { exportChoices, flightsArchiveName } from '../mission/flightFiles.js'
import {
  IconChevronDown,
  IconClipboard,
  IconCube,
  IconDownload,
  IconDrone,
  IconFolder,
  IconGear,
  IconHelp,
  IconPencil,
  IconReport,
} from './Icons.jsx'
import { PreflightList, PreflightPill } from './PreflightBar.jsx'
import { buttonClass } from './ui/Button.jsx'
import { Menu, useMenu } from './ui/Menu.jsx'
import { SplitButton } from './ui/SplitButton.jsx'

const menuIcon = (Icon) => <Icon className="mt-0.5 h-4 w-4 flex-none text-sky-300" />

/**
 * As outras exportações do separador aberto, para a seta do botão de
 * exportar: as do painel desse separador, com as condições dos botões de
 * lá. Na área, as do cartão 7 — o KML da área e, com vários voos, as de
 * «Exportar voos» (FlightExports) menos «Um voo», que pede a escolha do voo.
 */
function moreExports({
  t,
  missionMode,
  area,
  sheets,
  orbit,
  circular,
  routeView,
  baseRows,
  gated,
  exportBlocked,
}) {
  const icon = menuIcon(IconDownload)
  if (missionMode === 'orbit') {
    const { orbitPlan, orbitConfig, handleExportOrbitPerLevel } = orbit
    const stats = orbitPlan && !orbitPlan.error ? orbitPlan.stats : null
    return [
      {
        key: 'per-level',
        label: t('op.exportPerLevel'),
        icon,
        disabled:
          !stats || stats.levelCount < 2 || orbitConfig.capture === 'video' || exportBlocked,
        onSelect: gated(() => handleExportOrbitPerLevel(routeView.orbitTakeoff)),
      },
    ]
  }
  if (missionMode === 'circular') {
    const { circularPlan, circularBlocks, handleExportCircularBlocks } = circular
    const stats = circularPlan && !circularPlan.error ? circularPlan.stats : null
    return [
      {
        key: 'blocks',
        label: t('ci.exportBlocks'),
        icon,
        disabled: !stats || !(circularBlocks?.length > 1) || exportBlocked,
        onSelect: gated(handleExportCircularBlocks),
      },
    ]
  }
  if (missionMode !== 'area') return []
  /** @type {import('./ui/Menu.jsx').MenuItem[]} */
  const items = [
    {
      key: 'area-kml',
      label: t('app.exportKml'),
      description: t('app.menu.areaKml'),
      title: sheets.exportKmlTitle,
      icon,
      disabled: !area.canExportKML,
      onSelect: area.handleExportKML,
      testId: 'header-export-area',
    },
  ]
  const files = area.flightFiles ?? []
  if (files.length < 2) return items
  const { bases } = exportChoices(files, baseRows)
  // os KMZ seguem o preflight, os KML não (como no cartão 7)
  const why = exportBlocked ? t('bases.export.blocked') : undefined
  const blocked = !area.canExportKMZ || exportBlocked
  const zip = (kind) => `${flightsArchiveName(area.exportBaseName, { kind })}.zip`
  const flights = (kind) => () => gated(() => area.handleExportFlights({ kind }))()
  items.push({
    key: 'all',
    label: t('bases.export.all'),
    description: t('app.menu.all'),
    title: why ?? t('bases.export.allTitle', { file: zip('all') }),
    icon,
    disabled: blocked,
    onSelect: flights('all'),
    testId: 'header-export-all-flights',
  })
  if (bases.length > 0)
    items.push({
      key: 'by-base',
      label: t('bases.export.byBase'),
      description: t('app.menu.byBase'),
      title: why ?? t('bases.export.byBaseTitle', { file: zip('byBase') }),
      icon,
      disabled: blocked,
      onSelect: flights('byBase'),
      testId: 'header-export-by-base',
    })
  items.push({
    key: 'kml-all',
    label: t('bases.export.kmlAll'),
    description: t('app.menu.kmlAll'),
    title: t('bases.export.kmlAllTitle', { file: `${area.exportBaseName}_kml.zip` }),
    icon,
    onSelect: sheets.handleExportKmlAll,
    testId: 'header-export-kml-all',
  })
  const sheetsOn = sheets.fieldSheets?.length > 0
  if (bases.length > 0 && sheetsOn)
    items.push({
      key: 'kml-by-base',
      label: t('bases.export.kmlByBase'),
      description: t('app.menu.kmlByBase'),
      title: t('bases.export.kmlByBaseTitle', { file: `${area.exportBaseName}_kml-por-base.zip` }),
      icon,
      onSelect: sheets.handleExportKmlByBase,
      testId: 'header-export-kml-by-base',
    })
  if (sheetsOn)
    items.push({
      key: 'bases-kml',
      label: t('bases.export.kml'),
      description: t('app.menu.basesKml'),
      title: t('bases.export.kmlTitle'),
      icon,
      onSelect: sheets.handleExportBasesKml,
      testId: 'header-export-bases-kml',
    })
  return items
}

/**
 * O botão do projecto e o seu menu. «Mudar o nome» troca o botão por um
 * campo (Enter ou sair do campo grava, Esc desiste); guardar e abrir são os
 * do cartão 1 (useProject), com um campo de ficheiro próprio.
 */
function ProjectButton({ missionName, setMissionName, session, onOpen }) {
  const t = useT()
  const menu = useMenu({ onOpen })
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const [renaming, setRenaming] = useState(false)
  // o campo acaba uma só vez: o Esc não pode gravar no blur que vem a seguir
  const doneRef = useRef(false)
  // com Enter ou Esc o foco volta ao botão, quando ele volta a existir
  const focusBackRef = useRef(false)
  useEffect(() => {
    if (renaming || !focusBackRef.current) return
    focusBackRef.current = false
    menu.triggerRef.current?.focus()
  }, [renaming, menu.triggerRef])
  const saved = !session.autosaveFailed
  const state = t(saved ? 'app.project.saved' : 'app.project.notSaved')
  const finish = (value, returnFocus) => {
    if (doneRef.current) return
    doneRef.current = true
    focusBackRef.current = returnFocus
    if (value != null && value !== missionName) setMissionName(value)
    setRenaming(false)
  }
  return (
    <div className="relative min-w-0">
      {renaming ? (
        <input
          type="text"
          autoFocus
          defaultValue={missionName}
          aria-label={t('cards.missionName')}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => finish(e.currentTarget.value, false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // o Enter fica no campo: no botão que volta ao lugar dele, o
              // Chromium fazia dele um clique e o menu reabria
              e.preventDefault()
              finish(e.currentTarget.value, true)
            } else if (e.key === 'Escape') {
              // o Esc é do campo: nem a gaveta nem a base seleccionada o recebem
              e.preventDefault()
              e.stopPropagation()
              finish(null, true)
            }
          }}
          className="h-9 w-56 max-w-full rounded-lg border border-sky-400 bg-field px-2.5 text-[13px] font-medium text-slate-100 outline-none"
        />
      ) : (
        <button
          type="button"
          {...menu.triggerProps}
          aria-controls={menu.open ? 'project-menu' : undefined}
          aria-label={t('app.project.label', { name: missionName || '—', state })}
          title={t('app.project.title')}
          className="flex h-9 min-w-0 max-w-[18rem] items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised"
        >
          <IconFolder className="h-4 w-4 flex-none text-slate-400" />
          <span className="truncate">{missionName || t('cp.mission.namePlaceholder')}</span>
          <span
            title={saved ? t('cp.mission.autosave') : t('app.project.notSavedTitle')}
            className={`flex-none text-xs font-normal ${saved ? 'text-slate-400' : 'text-amber-300'}`}
          >
            · {state}
          </span>
          <IconChevronDown className="h-3.5 w-3.5 flex-none text-slate-400" />
        </button>
      )}
      <Menu
        id="project-menu"
        open={menu.open}
        start={menu.start}
        close={menu.close}
        triggerRef={menu.triggerRef}
        label={t('app.project.menu')}
        className="left-0 w-72"
        items={[
          {
            key: 'rename',
            label: t('app.project.rename'),
            description: t('cp.mission.nameHintA'),
            icon: menuIcon(IconPencil),
            onSelect: () => {
              doneRef.current = false
              setRenaming(true)
            },
          },
          {
            key: 'save',
            label: t('cp.mission.save'),
            description: t('cp.mission.saveTitle'),
            icon: menuIcon(IconDownload),
            onSelect: session.exportProject,
          },
          {
            key: 'open',
            label: t('cp.mission.open'),
            description: t('cp.mission.openTitle'),
            icon: menuIcon(IconFolder),
            onSelect: () => fileRef.current?.click(),
          },
        ]}
      />
      {/* o mesmo projecto .json que o cartão 1 abre */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          session.importProject(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

const VIEW_BUTTON =
  'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-slate-200 transition-colors hover:bg-raised hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

const Divider = () => <span aria-hidden="true" className="h-6 w-px bg-slate-800" />

export default function AppHeader({
  terrainState,
  area,
  routeView,
  sheets,
  preflightState,
  orbit,
  circular,
  baseActions,
  session,
  missionName,
  setMissionName,
  overlayOpen = false,
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
  const { planOk } = area
  const { view3d } = routeView
  const { preflight, exportBlocked, terrainActions } = preflightState
  const baseRows = baseActions?.baseRows ?? []
  const t = useT()
  const pillRef = useRef(/** @type {HTMLButtonElement|null} */ (null))
  // um menu aberto fecha a lista do preflight (ficavam um por cima do outro)
  const closePreflight = () => setShowPreflight(false)
  const exportItems = moreExports({
    t,
    missionMode,
    area,
    sheets,
    orbit,
    circular,
    routeView,
    baseRows,
    gated,
    exportBlocked,
  })
  const baseColors = Object.fromEntries(baseRows.map((b) => [b.label, b.color]))
  return (
    <>
      <header className="relative z-[1200] flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <div className="flex items-center gap-2.5" title={t('app.subtitle')}>
          <IconDrone className="h-[26px] w-[26px] text-sky-400" />
          <h1 className="flex items-baseline gap-1.5 whitespace-nowrap text-[15px] font-semibold tracking-tight">
            DJI Mission Planner
            <span className="text-xs font-normal tracking-normal text-slate-400">
              v{import.meta.env.APP_VERSION}
            </span>
          </h1>
        </div>
        <Divider />
        <ProjectButton
          missionName={missionName}
          setMissionName={setMissionName}
          session={session}
          onOpen={closePreflight}
        />
        <div className="flex-1" />
        <nav aria-label={t('app.views')} className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShow3d(true)}
            disabled={
              !(
                terrain.status === 'ready' &&
                view3d &&
                (missionMode !== 'area' || (terrainCovers && planOk))
              )
            }
            title={terrain.status === 'ready' ? t('app.view3dReady') : t('app.view3dNotReady')}
            className={VIEW_BUTTON}
          >
            <IconCube className="h-4 w-4" /> {t('app.view3d')}
          </button>
          <button
            type="button"
            onClick={() => setShowReport(true)}
            disabled={!planOk}
            title={t('app.reportTitle')}
            className={VIEW_BUTTON}
          >
            <IconReport className="h-4 w-4" /> {t('app.report')}
          </button>
          <button
            type="button"
            onClick={() => setView('checklist')}
            title={t('app.checklistTitle')}
            className={VIEW_BUTTON}
          >
            <IconClipboard className="h-4 w-4" /> {t('app.checklist')}
          </button>
        </nav>
        <Divider />
        <div className="relative">
          <PreflightPill
            items={preflight}
            open={showPreflight}
            onToggle={() => setShowPreflight((v) => !v)}
            mode={missionMode}
            buttonRef={pillRef}
          />
          {showPreflight && (
            <PreflightList
              items={preflight}
              actions={terrainActions}
              inactive={overlayOpen}
              baseColors={baseColors}
              onClose={(focusPill) => {
                setShowPreflight(false)
                if (focusPill) pillRef.current?.focus()
              }}
            />
          )}
        </div>
        <SplitButton
          // no modo circular o KMZ do cabecalho e a missao circular: o
          // preflight ao lado e o dela, e a grelha da area exporta-se no
          // separador Area
          onClick={gated(modeExport)}
          disabled={!modePlanOk || exportBlocked}
          title={modeExportTitle ?? t('app.exportWpmlTitle')}
          icon={<IconDownload className="h-4 w-4" />}
          label={missionExportLabel(t, modeExportKind)}
          menuLabel={t('app.exportMore')}
          menuId="export-menu"
          items={exportItems}
          onOpen={closePreflight}
        />

        {/* configuração, ajuda e língua encostados à direita (também quando
            o cabeçalho, estreito, os passa para a segunda linha) */}
        <div className="ml-auto flex items-center gap-1.5">
          <Divider />
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title={t('app.settingsTitle')}
            aria-label={t('app.settings')}
            data-testid="open-settings"
            className={`${buttonClass('ghost', 'icon')} text-slate-200`}
          >
            <IconGear className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            title={t('app.helpTitle')}
            aria-label={t('app.help')}
            className={`${buttonClass('ghost', 'icon')} text-slate-200`}
          >
            <IconHelp className="h-[18px] w-[18px]" />
          </button>
          <div
            role="group"
            aria-label={t('app.lang')}
            className="flex h-9 overflow-hidden rounded-lg border border-slate-700"
          >
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                title={label}
                aria-pressed={lang === code}
                className={`px-[11px] text-xs font-semibold transition-colors focus-visible:outline-offset-[-2px] ${
                  lang === code
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:bg-raised hover:text-slate-200'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

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
