import { useId, useState } from 'react'
import { IconChevronDown, IconChevronRight } from '../Icons.jsx'

/**
 * Secção que fecha (o cartão do painel no desenho): o número do passo, o
 * título e, fechada, o essencial numa linha (`summary`); `status`, um ícone
 * ou uma etiqueta antes da seta (pronto, avisos). Aberta por fora (`open` e
 * `onToggle`) ou por si (`defaultOpen`). Fechada, o conteúdo fica montado e
 * escondido: os campos guardam o que se estava a escrever. `more`, no fim
 * do conteúdo, é o lugar do «Mais opções» (ver MoreButton). O nome do botão
 * é só o título (o resumo muda com os valores); o resumo e o estado ficam
 * na descrição dele.
 * @param {{title: any, n?: number|null, summary?: any, summaryOpen?: boolean,
 *   status?: any, open?: boolean, onToggle?: () => void, defaultOpen?: boolean,
 *   more?: any, testId?: string, children?: any}} props
 */
export function Section({
  title,
  n = null,
  summary = null,
  summaryOpen = false,
  status = null,
  open,
  onToggle,
  defaultOpen = false,
  more = null,
  testId,
  children = null,
}) {
  const id = useId()
  const [own, setOwn] = useState(defaultOpen)
  const isOpen = open ?? own
  const toggle = onToggle ?? (() => setOwn((v) => !v))
  const showSummary = summary != null && summary !== '' && (!isOpen || summaryOpen)
  const describedBy =
    [showSummary && `${id}-summary`, status != null && `${id}-status`].filter(Boolean).join(' ') ||
    undefined
  return (
    <section
      data-testid={testId}
      className={`shrink-0 overflow-hidden rounded-[10px] border bg-surface ${
        isOpen ? 'border-[#2C4A68]' : 'border-slate-800'
      }`}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${id}-body`}
          aria-labelledby={`${id}-title`}
          aria-describedby={describedBy}
          onClick={toggle}
          className="flex min-h-[56px] w-full items-center gap-2.5 px-3 py-2.5 text-left text-slate-100"
        >
          {n != null && (
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                isOpen ? 'bg-sky-400 text-[#06202E]' : 'bg-[#1A2742] text-slate-300'
              }`}
            >
              {n}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span id={`${id}-title`} className="block text-sm font-semibold">
              {title}
            </span>
            {showSummary && (
              <span
                id={`${id}-summary`}
                className="mt-0.5 block truncate text-[12.5px] font-normal text-slate-400"
              >
                {summary}
              </span>
            )}
          </span>
          {status != null && (
            <span id={`${id}-status`} className="flex flex-none items-center">
              {status}
            </span>
          )}
          <IconChevronDown
            className={`h-4 w-4 flex-none text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      {/* a classe e não só o atributo: o `flex` passava por cima do hidden */}
      <div
        id={`${id}-body`}
        hidden={!isOpen}
        className={`${isOpen ? 'flex' : 'hidden'} flex-col gap-3 border-t border-slate-800 px-3 pb-3.5 pt-3`}
      >
        {children}
        {more}
      </div>
    </section>
  )
}

/**
 * «Mais opções ›» de uma secção: abre a gaveta `controls` (ou o que
 * `onClick` fizer), e diz se está aberta (`expanded`).
 * @param {{label: any, onClick: () => void, expanded?: boolean, controls?: string,
 *   ariaLabel?: string, testId?: string}} props
 */
export function MoreButton({ label, onClick, expanded = false, controls, ariaLabel, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex min-h-[36px] w-full items-center justify-between gap-2 rounded-lg px-0.5 text-left text-[13px] font-medium transition-colors hover:text-sky-200 ${
        expanded ? 'text-sky-200' : 'text-sky-300'
      }`}
    >
      <span>{label}</span>
      <IconChevronRight className="h-4 w-4 flex-none" />
    </button>
  )
}
