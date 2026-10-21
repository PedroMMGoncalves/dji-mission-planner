import { useT } from '../i18n.jsx'
import { FOCUS, Icon } from './MapOverlay.jsx'

/**
 * E1.0 (modelo A): barra vertical dos tipos de missão, à esquerda do painel
 * lateral — troca a ferramenta de desenho e o painel de parâmetros. Cada
 * botão leva o ícone e o nome do modo (o nome acessível é só o nome, que é
 * por onde os testes mudam de modo); o modo aberto fica marcado com
 * aria-current="true" (o modo escolhido entre os botões, não uma página
 * aberta por uma ligação). Os pontos de inspecção mantêm-se como camada
 * extra dentro do modo Área. Em baixo, «Painel» mostra e esconde o painel
 * de parâmetros (`panelOpen`, `onTogglePanel`), aceso quando está à vista.
 */
const MODES = [
  {
    id: 'area',
    key: 'mode.area',
    icon: (
      <>
        <path d="M4 7 11 3l9 4-1.5 12L6 21z" />
        <path d="M5.5 10.5h13M5 14h13.5M5.5 17.5h12.5" />
      </>
    ),
  },
  {
    id: 'face',
    key: 'mode.face',
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1" />
        <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
      </>
    ),
  },
  {
    id: 'orbit',
    key: 'mode.orbit',
    icon: (
      <>
        <circle cx="12" cy="12" r="2.5" />
        <ellipse cx="12" cy="12" rx="10" ry="4.5" />
      </>
    ),
  },
  {
    id: 'corridor',
    key: 'mode.corridor',
    icon: <path d="M5 21 10 3M19 21 14 3M12 7v2M12 13v2M12 19v2" />,
  },
  {
    id: 'circular',
    key: 'mode.circular',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
]

const RAIL_BUTTON = `flex min-h-[58px] w-[54px] shrink-0 flex-col items-center justify-center gap-[5px] rounded-[10px] text-[10.5px] font-semibold leading-tight transition-colors ${FOCUS}`
const RAIL_ON = 'bg-sky-400/[0.14] text-sky-300'
const RAIL_OFF = 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'

/**
 * @param {{mode: string, onChange: (mode: string) => void, panelOpen?: boolean|null,
 *   onTogglePanel?: () => void}} props `panelOpen` null: sem o botão «Painel»
 */
export default function MissionModeSelector({ mode, onChange, panelOpen = null, onTogglePanel }) {
  const t = useT()
  // os modos são a navegação; «Painel», em baixo, fica fora dela
  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-slate-800 bg-slate-950 py-2.5">
      <nav aria-label={t('mode.nav')} className="flex flex-col items-center gap-1">
        {MODES.map((m) => {
          const current = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              aria-current={current ? 'true' : undefined}
              className={`${RAIL_BUTTON} ${current ? RAIL_ON : RAIL_OFF}`}
            >
              <Icon size={20} sw={1.8}>
                {m.icon}
              </Icon>
              {t(m.key)}
            </button>
          )
        })}
      </nav>
      {panelOpen != null && (
        <>
          <span aria-hidden="true" className="flex-1" />
          <span aria-hidden="true" className="my-1 h-px w-8 shrink-0 bg-slate-800" />
          <button
            type="button"
            id="panel-toggle"
            onClick={onTogglePanel}
            aria-expanded={panelOpen}
            aria-controls="mode-panel"
            aria-label={t('mode.panelName')}
            title={t('mode.panelTitle')}
            data-testid="panel-toggle"
            className={`${RAIL_BUTTON} ${panelOpen ? RAIL_ON : RAIL_OFF}`}
          >
            <Icon size={20} sw={1.8}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </Icon>
            {t('mode.panel')}
          </button>
        </>
      )}
    </div>
  )
}
