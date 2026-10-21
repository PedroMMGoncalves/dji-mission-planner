import { useState } from 'react'
import { useT } from '../i18n.jsx'
import { CARD, ICON_BUTTON, Icon, PILL, useToggleFocus } from './MapOverlay.jsx'

const HIDDEN_KEY = 'dji-mission-planner:firstSteps:hidden'

/**
 * Primeiros passos, no primeiro ecrã (modo Área, sem área e sem ferramenta
 * activa): um cartão por baixo da barra de desenho, a apontar para ela, com
 * os três passos — a área (agora), o relevo e os parâmetros de voo. Esconde-
 * se no ✕ e fica um botão no mesmo sítio para o reabrir; a escolha fica
 * neste aparelho. Some ao começar a desenhar, para não tapar os cliques.
 */
export default function FirstSteps() {
  const t = useT()
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) !== '1'
    } catch {
      return true
    }
  })
  const { ref: toggleRef, mark: markToggle } = useToggleFocus(open)
  const change = (v) => {
    markToggle()
    setOpen(v)
    try {
      localStorage.setItem(HIDDEN_KEY, v ? '0' : '1')
    } catch {
      /* sem armazenamento: fica só nesta sessão */
    }
  }
  const count = t('guide.count', { n: 1, total: 3 })
  if (!open)
    return (
      <button
        type="button"
        ref={toggleRef}
        onClick={() => change(true)}
        aria-expanded="false"
        className={`absolute left-[72px] top-[72px] z-[1000] ${PILL}`}
      >
        <Icon className="text-sky-300">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </Icon>
        {t('guide.title')}
        <span className="text-slate-400">· {count}</span>
      </button>
    )
  // o marcador de cada passo: o actual cheio, os seguintes vazios, ligados
  // por uma linha até ao último
  const step = (n, title, body, last = false) => (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center">
        {n === 1 ? (
          <span
            aria-hidden="true"
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-sky-400 bg-sky-400/10"
          >
            <span className="h-2 w-2 rounded-full bg-sky-400" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-slate-700 bg-slate-950"
          />
        )}
        {!last && <span aria-hidden="true" className="my-1 w-0.5 flex-1 bg-slate-800" />}
      </div>
      <div className={last ? 'pb-3' : 'pb-4'}>
        <div
          className={`text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] ${
            n === 1 ? 'text-sky-300' : 'text-slate-400'
          }`}
        >
          {n === 1 ? t('guide.now') : t('guide.step', { n })}
        </div>
        <div
          className={`mt-0.5 text-[13.5px] font-semibold leading-tight ${n === 1 ? 'text-slate-100' : 'text-slate-200'}`}
        >
          {title}
        </div>
        {body}
      </div>
    </li>
  )
  return (
    <section
      aria-labelledby="first-steps-title"
      data-testid="first-steps"
      className={`absolute left-[72px] top-[72px] z-[1000] flex max-h-[calc(100%-88px)] w-[404px] max-w-[calc(100%-88px)] flex-col ${CARD}`}
    >
      {/* a seta aponta para as formas, na barra de desenho por cima */}
      <span
        aria-hidden="true"
        className="absolute -top-[6px] left-[52px] h-2.5 w-2.5 rotate-45 border-l border-t border-slate-700 bg-slate-900"
      />
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 py-2.5 pl-4 pr-2">
        <h2 id="first-steps-title" className="m-0 flex-1 text-sm font-semibold">
          {t('guide.title')}
        </h2>
        <span className="text-xs tabular-nums text-slate-400">{count}</span>
        <button
          type="button"
          ref={toggleRef}
          onClick={() => change(false)}
          aria-label={t('guide.hide')}
          title={t('guide.hide')}
          className={`h-8 w-8 ${ICON_BUTTON}`}
        >
          <Icon d="M18 6 6 18M6 6l12 12" />
        </button>
      </div>
      {/* num mapa baixo rola o conteúdo, e a seta fica de fora do corte */}
      <div className="min-h-0 overflow-y-auto">
        <ol className="m-0 list-none px-4 pb-1.5 pt-3.5">
          {step(
            1,
            t('guide.s1'),
            <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-normal text-slate-200">
              <div>
                <strong className="font-semibold text-slate-100">{t('cp.area.polygon')}:</strong>{' '}
                {t('guide.s1Polygon')}
              </div>
              <div>
                <strong className="font-semibold text-slate-100">{t('guide.s1ShapesLead')}</strong>{' '}
                {t('guide.s1Shapes')}
              </div>
              <div className="text-slate-300">{t('guide.s1Import')}</div>
            </div>,
          )}
          {step(
            2,
            t('guide.s2'),
            <div className="mt-1 text-[12.5px] leading-normal text-slate-300">
              {t('guide.s2Text')}
            </div>,
          )}
          {step(
            3,
            t('guide.s3'),
            <div className="mt-1 text-[12.5px] leading-normal text-slate-300">
              {t('guide.s3Text')}
            </div>,
            true,
          )}
        </ol>
        <div className="border-t border-slate-800 px-4 pb-3 pt-2.5 text-xs leading-normal text-slate-400">
          {t('guide.project')}{' '}
          <strong className="font-semibold text-slate-200">{t('cp.mission.open')}</strong>.
        </div>
      </div>
    </section>
  )
}
