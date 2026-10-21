/**
 * O cabeçalho: o nome e a versão; o projecto (o nome da missão e se está
 * gravado, com mudar o nome, guardar e abrir, as acções do cartão 1); as
 * vistas (3D, relatório, checklist); a pastilha do preflight, que abre a
 * lista por cima do mapa; o botão de exportar partido — a parte principal
 * é a exportação do separador aberto, a mesma do fim do painel, e a seta
 * abre o KML da área (em todos os separadores) e as outras desse separador
 * (na área as do cartão 7, com os mesmos nomes, dicas e acções);
 * configuração, ajuda e língua. Por baixo, o erro da última exportação e o
 * do projecto que o menu do projecto não conseguiu abrir. No ecrã estreito
 * do tablet (até 1179 px) fica numa linha, com os botões de 44 px: o nome
 * da aplicação só no ícone, o projecto sem o «gravado», e a configuração, a
 * ajuda e a língua no menu «Mais» (⋮), que num tablet ao alto (até 899 px)
 * leva também as vistas.
 */
import { useEffect, useRef, useState } from 'react'
import { LANGS, useT } from '../i18n.jsx'
import { missionExportLabel } from '../i18n/format.js'
import { exportChoices, flightsArchiveName } from '../mission/flightFiles.js'
import { errorText } from '../utils/appError.js'
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
import { useMedia } from './MapOverlay.jsx'
import { PreflightList, PreflightPill } from './PreflightBar.jsx'
import { buttonClass } from './ui/Button.jsx'
import { Menu, useMenu } from './ui/Menu.jsx'
import { SplitButton } from './ui/SplitButton.jsx'

const menuIcon = (Icon) => <Icon className="mt-0.5 h-4 w-4 flex-none text-sky-300" />

/**
 * As outras exportações, para a seta do botão de exportar. Primeiro, em
 * todos os separadores, o KML da área, como o botão que o cabeçalho tinha
 * (inactivo sem área válida); depois as do painel do separador aberto, com
 * as condições dos botões de lá: na órbita o KMZ por nível, no circular o
 * KMZ por bloco, na área as de «Exportar voos» do cartão 7 (FlightExports)
 * menos «Um voo», que pede a escolha do voo.
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
  if (missionMode === 'orbit') {
    const { orbitPlan, orbitConfig, handleExportOrbitPerLevel } = orbit
    const stats = orbitPlan && !orbitPlan.error ? orbitPlan.stats : null
    items.push({
      key: 'per-level',
      label: t('op.exportPerLevel'),
      icon,
      disabled: !stats || stats.levelCount < 2 || orbitConfig.capture === 'video' || exportBlocked,
      onSelect: gated(() => handleExportOrbitPerLevel(routeView.orbitTakeoff)),
    })
    return items
  }
  if (missionMode === 'circular') {
    const { circularPlan, circularBlocks, handleExportCircularBlocks } = circular
    const stats = circularPlan && !circularPlan.error ? circularPlan.stats : null
    items.push({
      key: 'blocks',
      label: t('ci.exportBlocks'),
      icon,
      disabled: !stats || !(circularBlocks?.length > 1) || exportBlocked,
      onSelect: gated(handleExportCircularBlocks),
    })
    return items
  }
  if (missionMode !== 'area') return items
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
function ProjectButton({ missionName, setMissionName, session, onOpen, compact = false }) {
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
  // antes da primeira gravação automática (null) não se diz nada: ainda
  // não se sabe se o browser a aceita
  const pending = session.autosaveFailed == null
  const saved = session.autosaveFailed === false
  const state = pending ? null : t(saved ? 'app.project.saved' : 'app.project.notSaved')
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
          aria-label={
            pending
              ? t('app.project.labelPending', { name: missionName || '—' })
              : t('app.project.label', { name: missionName || '—', state })
          }
          title={t('app.project.title')}
          className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised ${
            compact ? 'h-11 max-w-[13rem]' : 'h-9 max-w-[18rem]'
          }`}
        >
          <IconFolder className="h-4 w-4 flex-none text-slate-400" />
          <span className="truncate">{missionName || t('cp.mission.namePlaceholder')}</span>
          {/* no tablet só se diz quando não ficou gravado (o nome do botão diz sempre) */}
          {!pending && !(compact && saved) && (
            <span
              title={saved ? t('cp.mission.autosave') : t('app.project.notSavedTitle')}
              className={`flex-none text-xs font-normal ${saved ? 'text-slate-400' : 'text-amber-300'}`}
            >
              · {state}
            </span>
          )}
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
        accept=".json"
        className="hidden"
        data-testid="header-project-file"
        onChange={(e) => {
          session.importProject(e.target.files?.[0], { fromHeader: true })
          e.target.value = ''
        }}
      />
    </div>
  )
}

const VIEW_BUTTON =
  'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-slate-200 transition-colors hover:bg-raised hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
// Para o cabeçalho caber numa linha a 1440 px, com o rótulo longo do botão
// de exportar, abaixo de 1800 px as vistas ficam só com o ícone e os grupos
// mais juntos; o nome continua no botão, para o leitor de ecrã (sr-only), e
// a dica é a mesma
const VIEW_LABEL = 'sr-only min-[1800px]:not-sr-only min-[1800px]:whitespace-nowrap'

const Divider = () => <span aria-hidden="true" className="h-6 w-px flex-none bg-slate-800" />

// no tablet, os botões das vistas com 44 px de lado
const VIEW_BUTTON_TOUCH =
  'flex h-11 w-11 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-raised hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

/** Os três pontos do menu «Mais». */
const IconKebab = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
)
/** O visto da língua em uso, no menu «Mais». */
const IconCheckSmall = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mt-0.5 h-4 w-4 flex-none text-sky-300"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

/**
 * O menu «Mais» do tablet: as vistas (num tablet ao alto, `views`), a
 * configuração, a ajuda e a língua — os mesmos nomes, dicas e acções dos
 * botões do cabeçalho largo; a língua em uso fica marcada.
 */
function MoreMenu({ views = null, setShowSettings, setShowHelp, lang, setLang, onOpen }) {
  const t = useT()
  const menu = useMenu({ onOpen })
  const label = views ? t('app.moreViews') : t('app.more')
  /** @type {import('./ui/Menu.jsx').MenuItem[]} */
  const items = [
    ...(views ?? []),
    {
      key: 'settings',
      label: t('app.settings'),
      title: t('app.settingsTitle'),
      icon: menuIcon(IconGear),
      onSelect: () => setShowSettings(true),
      testId: 'open-settings',
    },
    {
      key: 'help',
      label: t('app.help'),
      title: t('app.helpTitle'),
      icon: menuIcon(IconHelp),
      onSelect: () => setShowHelp(true),
    },
    ...LANGS.map(({ code, label: name }) => ({
      key: `lang-${code}`,
      label: name,
      checked: lang === code,
      icon:
        lang === code ? <IconCheckSmall /> : <span aria-hidden="true" className="w-4 flex-none" />,
      onSelect: () => setLang(code),
    })),
  ]
  return (
    <div className="relative flex-none">
      <button
        type="button"
        {...menu.triggerProps}
        aria-controls={menu.open ? 'more-menu' : undefined}
        aria-label={label}
        title={label}
        data-testid="header-more"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-200 transition-colors hover:bg-raised hover:text-slate-100"
      >
        <IconKebab />
      </button>
      <Menu
        id="more-menu"
        open={menu.open}
        start={menu.start}
        close={menu.close}
        triggerRef={menu.triggerRef}
        label={label}
        items={items}
        className="right-0 w-64"
      />
    </div>
  )
}

// as faixas de erro por baixo do cabeçalho (exportação, projecto) e o seu ✕
const ALERT_STRIP =
  'flex items-start gap-2 border-b border-red-800 bg-red-950/60 px-4 py-2 text-xs text-red-200'
const ALERT_CLOSE = 'ml-auto rounded border border-red-700 px-2 py-0.5 font-medium hover:bg-red-900'

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
  // o ecrã estreito do tablet: uma linha, botões de 44 px e o menu «Mais»;
  // ao alto, as vistas também no menu
  const compact = useMedia('(max-width: 1179px)')
  const narrow = useMedia('(max-width: 899px)')
  // as três vistas: botões no cabeçalho, ou itens do menu «Mais»
  const views = [
    {
      key: '3d',
      label: t('app.view3d'),
      icon: IconCube,
      onSelect: () => setShow3d(true),
      disabled: !(
        terrain.status === 'ready' &&
        view3d &&
        (missionMode !== 'area' || (terrainCovers && planOk))
      ),
      title: terrain.status === 'ready' ? t('app.view3dReady') : t('app.view3dNotReady'),
    },
    {
      key: 'report',
      label: t('app.report'),
      icon: IconReport,
      onSelect: () => setShowReport(true),
      disabled: !planOk,
      title: t('app.reportTitle'),
    },
    {
      key: 'checklist',
      label: t('app.checklist'),
      icon: IconClipboard,
      onSelect: () => setView('checklist'),
      disabled: false,
      title: t('app.checklistTitle'),
    },
  ]
  return (
    <>
      <header
        className={`relative z-[1200] flex min-h-14 items-center border-b border-slate-800 bg-slate-950 ${
          compact
            ? 'flex-nowrap gap-x-2 px-3 py-1.5'
            : 'flex-wrap gap-x-2 gap-y-2 px-4 py-2 min-[1800px]:gap-x-3'
        }`}
      >
        <div className="flex flex-none items-center gap-2.5" title={t('app.subtitle')}>
          <IconDrone className="h-[26px] w-[26px] text-sky-400" />
          <h1
            className={
              compact
                ? 'sr-only'
                : 'flex items-baseline gap-1.5 whitespace-nowrap text-[15px] font-semibold tracking-tight'
            }
          >
            DJI Mission Planner
            <span className="text-xs font-normal tracking-normal text-slate-400">
              v{import.meta.env.APP_VERSION}
            </span>
          </h1>
        </div>
        {!compact && <Divider />}
        <ProjectButton
          missionName={missionName}
          setMissionName={setMissionName}
          session={session}
          onOpen={closePreflight}
          compact={compact}
        />
        <div className="flex-1" />
        {!narrow && (
          <nav aria-label={t('app.views')} className="flex flex-none items-center gap-0.5">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={v.onSelect}
                disabled={v.disabled}
                title={v.title}
                className={compact ? VIEW_BUTTON_TOUCH : VIEW_BUTTON}
              >
                <v.icon className="h-4 w-4" />
                <span className={compact ? 'sr-only' : VIEW_LABEL}>{v.label}</span>
              </button>
            ))}
          </nav>
        )}
        <Divider />
        <div className="relative">
          <PreflightPill
            items={preflight}
            open={showPreflight}
            onToggle={() => setShowPreflight((v) => !v)}
            mode={missionMode}
            buttonRef={pillRef}
            tall={compact}
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
          tall={compact}
        />

        {/* configuração, ajuda e língua encostados à direita (também quando
            o cabeçalho, estreito, os passa para a segunda linha); no tablet,
            no menu «Mais» */}
        {compact ? (
          <MoreMenu
            views={
              narrow
                ? views.map((v) => ({
                    key: v.key,
                    label: v.label,
                    title: v.title,
                    disabled: v.disabled,
                    icon: menuIcon(v.icon),
                    onSelect: v.onSelect,
                  }))
                : null
            }
            setShowSettings={setShowSettings}
            setShowHelp={setShowHelp}
            lang={lang}
            setLang={setLang}
            onOpen={closePreflight}
          />
        ) : (
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
        )}
      </header>

      {exportError && (
        <div role="alert" className={ALERT_STRIP}>
          <span className="font-semibold">⚠ {t('export.failed')}</span>
          <span>{t(`export.err.${exportError.code}`, { d: exportError.detail })}</span>
          <button onClick={() => setExportError(null)} className={ALERT_CLOSE}>
            ✕
          </button>
        </div>
      )}
      {/* o projecto que o menu do projecto não abriu: o erro fica também
          aqui, porque fora do separador Área o do cartão 1 não se vê */}
      {session.projectAlert && session.projectError && (
        <div role="alert" data-testid="header-project-error" className={ALERT_STRIP}>
          <span>⚠ {errorText(session.projectError, t)}</span>
          <button
            type="button"
            onClick={session.dismissProjectAlert}
            aria-label={t('app.errClose')}
            title={t('app.errClose')}
            className={ALERT_CLOSE}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
