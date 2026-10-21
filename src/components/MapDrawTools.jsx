import { useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { FOCUS, Icon } from './MapOverlay.jsx'

/**
 * Ferramentas de desenho do modo Área, numa barra por cima do mapa, ao lado
 * do zoom: as formas da área (polígono livre, rectângulo e quadrado
 * centrados num ponto, que estavam no cartão 2) e, depois do separador,
 * marcar uma base e os pontos de inspecção (os mesmos dos cartões 5 e 6).
 * Cada botão chama a mesma acção do painel; a ferramenta activa fica
 * premida. Sem área, as três formas ficam realçadas (o primeiro passo).
 * É uma barra de ferramentas: uma só paragem do Tab, e as setas, Home e End
 * passam de um botão ao outro. O `ref` é o da barra: o enquadramento da
 * área fica por baixo dela.
 */

/**
 * @param {{mode: string, anchorShape: string, hasArea: boolean,
 *   onDraw: () => void, onAnchor: (shape: string) => void,
 *   onBase: () => void, onInspect: () => void,
 *   ref?: import('react').Ref<HTMLDivElement>}} props
 */
export default function MapDrawTools({
  ref,
  mode,
  anchorShape,
  hasArea,
  onDraw,
  onAnchor,
  onBase,
  onInspect,
}) {
  const t = useT()
  const refs = useRef([])
  const [focusIdx, setFocusIdx] = useState(0)
  // num mapa estreito a barra inteira não cabe: abaixo de 1024 px fica só o
  // ícone das formas, e abaixo de 1180 px o da base e o da inspecção (o nome
  // continua no botão, para o leitor de ecrã, e na dica)
  const tools = [
    {
      key: 'polygon',
      label: t('cp.area.polygon'),
      title: t('cp.area.polygonTitle'),
      on: mode === 'draw',
      act: onDraw,
      shape: true,
      d: 'M12 2.5 21.5 9.4 17.9 20.5H6.1L2.5 9.4z',
    },
    {
      key: 'rect',
      label: t('cp.area.rect'),
      title: t('cp.area.rectTitle'),
      on: mode === 'anchor' && anchorShape === 'rect',
      act: () => onAnchor('rect'),
      shape: true,
      icon: <rect x="3" y="6" width="18" height="12" rx="1.5" />,
    },
    {
      key: 'square',
      label: t('cp.area.square'),
      title: t('cp.area.squareTitle'),
      on: mode === 'anchor' && anchorShape === 'square',
      act: () => onAnchor('square'),
      shape: true,
      icon: <rect x="4" y="4" width="16" height="16" rx="1.5" />,
    },
    {
      key: 'base',
      label: t('map.toolBase'),
      title: t('cp.area.baseTitle'),
      on: mode === 'base',
      act: onBase,
      icon: (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 7.5v9M15 7.5v9M9 12h6" />
        </>
      ),
    },
    {
      key: 'inspect',
      label: t('map.toolInspect'),
      title: t('cp.inspect.markTitle'),
      on: mode === 'inspect',
      act: onInspect,
      icon: (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" />
        </>
      ),
    },
  ]
  const move = (i) => {
    const n = tools.length
    const next = ((i % n) + n) % n
    setFocusIdx(next)
    refs.current[next]?.focus()
  }
  const onKeyDown = (e) => {
    const i = refs.current.indexOf(document.activeElement)
    if (i < 0) return
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? i + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tools.length - 1
              : null
    if (to == null) return
    e.preventDefault()
    move(to)
  }
  const button = (tool, i) => (
    <button
      key={tool.key}
      ref={(el) => {
        refs.current[i] = el
      }}
      type="button"
      tabIndex={i === focusIdx ? 0 : -1}
      onFocus={() => setFocusIdx(i)}
      onClick={tool.act}
      aria-pressed={tool.on}
      title={tool.title}
      className={`flex h-9 items-center gap-[7px] rounded-[7px] px-2.5 text-[13px] font-medium transition-colors ${FOCUS} ${
        tool.on
          ? 'bg-sky-400/15 text-sky-300'
          : !hasArea && tool.shape
            ? 'text-sky-100 hover:bg-slate-800'
            : 'text-slate-200 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      <Icon d={tool.d} sw={1.8}>
        {tool.icon}
      </Icon>
      <span className={tool.shape ? 'sr-only lg:not-sr-only' : 'sr-only min-[1180px]:not-sr-only'}>
        {tool.label}
      </span>
    </button>
  )
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('map.drawTools')}
      data-testid="map-draw-tools"
      onKeyDown={onKeyDown}
      className="absolute left-[72px] top-4 z-[1000] flex items-center gap-0.5 rounded-[10px] border border-slate-700 bg-slate-900/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    >
      {/* sem área, as formas realçadas: é por aqui que se começa */}
      <span
        className={`flex items-center gap-0.5 rounded-lg ${
          hasArea ? '' : 'bg-sky-400/10 ring-1 ring-sky-400/30'
        }`}
      >
        {tools.slice(0, 3).map(button)}
      </span>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-slate-700" />
      {tools.slice(3).map((tool, i) => button(tool, i + 3))}
    </div>
  )
}
