/**
 * Fronteira de erro (M3-C4). Sem ela, um bloco carregado sob demanda que
 * não chega (o relatório sem rede, no campo) ou um `WebGLRenderer` que não
 * nasce apagavam a aplicação inteira: o React desmonta a árvore e o `#root`
 * fica vazio, com o autosave a valer só o que passou de 500 ms.
 *
 * - `scope="window"`: à volta de uma janela (relatório, vista 3D, perfil);
 *   mostra a mensagem dentro da janela e «Fechar» repõe o planeador.
 * - `scope="app"`: no topo; «Recarregar», ou guardar uma cópia do projecto
 *   gravado e recarregar sem ele (um projecto que faça a aplicação cair
 *   em todos os arranques).
 */
import { Component } from 'react'
import { LANGS, LangContext, translate } from '../i18n.jsx'
import { PROJECT_STORAGE_KEY } from '../mission/project.js'

const LANG_KEY = 'dji-mission-planner:lang'

/** Língua gravada, ou pt: o topo da aplicação fica fora do LangContext. */
function storedLang() {
  try {
    const v = window.localStorage.getItem(LANG_KEY)
    return LANGS.some((l) => l.code === v) ? v : 'pt'
  } catch {
    return 'pt'
  }
}

/** Guarda o projecto gravado numa cópia datada e tira-o do arranque. */
export function stashStoredProject() {
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY)
    if (raw) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      window.localStorage.setItem(`${PROJECT_STORAGE_KEY}:recusado:${stamp}`, raw)
      window.localStorage.removeItem(PROJECT_STORAGE_KEY)
    }
  } catch {
    /* sem armazenamento: nada a guardar */
  }
}

export default class ErrorBoundary extends Component {
  static contextType = LangContext

  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    // fica no registo do browser, para quem reportar o problema
    console.error('[dji-mission-planner]', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { scope = 'window', onClose } = this.props
    const lang = scope === 'app' ? storedLang() : (this.context ?? 'pt')
    const t = (key, vars) => translate(lang, key, vars)
    const msg = String(error?.message ?? error).slice(0, 300)
    const btn =
      'rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700'
    return (
      <div
        role="alert"
        data-testid={`error-boundary-${scope}`}
        className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/95 p-6"
      >
        <div className="max-w-lg rounded-lg border border-red-900/60 bg-slate-900 p-5 text-slate-200 shadow-xl">
          <h2 className="text-base font-semibold text-red-300">{t('app.errTitle')}</h2>
          <p className="mt-2 text-sm">
            {scope === 'app' ? t('app.errApp', { msg }) : t('app.errWindow', { msg })}
          </p>
          <p className="mt-2 text-xs text-slate-400">{t('app.errOffline')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {scope === 'window' && (
              <button type="button" className={btn} onClick={() => onClose?.()}>
                {t('app.errClose')}
              </button>
            )}
            <button type="button" className={btn} onClick={() => window.location.reload()}>
              {t('app.errReload')}
            </button>
            {scope === 'app' && (
              <button
                type="button"
                className={btn}
                onClick={() => {
                  stashStoredProject()
                  window.location.reload()
                }}
              >
                {t('app.errClearProject')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
