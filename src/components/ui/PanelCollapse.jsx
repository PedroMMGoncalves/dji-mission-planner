import { createContext, useContext } from 'react'
import { useT } from '../../i18n.jsx'
import { FOCUS, Icon } from '../MapOverlay.jsx'

/**
 * Recolher o painel de parâmetros a partir dele: no ecrã estreito do tablet
 * o painel é uma folha que se recolhe (o botão «Painel» da barra dos modos
 * volta a abri-la), e o cabeçalho da coluna — a da área (Cards.jsx,
 * CardColumn) e a dos outros modos (ModePanel.jsx) — leva este botão. O App
 * dá a acção pelo contexto; sem ela (null, no ecrã largo) não há botão.
 */
export const PanelCollapseContext = createContext(/** @type {null | (() => void)} */ (null))

/** O botão «Recolher o painel» (44 × 44), quando o contexto tem a acção. */
export function PanelCollapseButton() {
  const collapse = useContext(PanelCollapseContext)
  const t = useT()
  if (!collapse) return null
  return (
    <button
      type="button"
      onClick={collapse}
      aria-controls="mode-panel"
      aria-label={t('mode.panelCollapse')}
      title={t('mode.panelCollapse')}
      className={`flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border border-slate-700 text-slate-200 transition-colors hover:bg-raised hover:text-slate-100 ${FOCUS}`}
    >
      <Icon size={18} sw={1.8}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M16 15l-3-3 3-3" />
      </Icon>
    </button>
  )
}
