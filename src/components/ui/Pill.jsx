/**
 * Pastilhas de estado do desenho: `Pill`, com contorno, para um estado que
 * se lê de longe (o preflight no cabeçalho); `Badge`, pequena e sem
 * contorno, para uma contagem ou uma etiqueta (bloqueios, avisos, notas).
 * Tons: neutral, info, ok, warn e block, os mesmos nas duas.
 */

const PILL_TONE = {
  neutral: 'border-[#334155] bg-surface text-slate-200',
  info: 'border-[#1E2E4A] bg-[#10233A] text-blue-300',
  ok: 'border-[#1F5C47] bg-[#0D2A21] text-emerald-300',
  warn: 'border-[#6B4A12] bg-[#1F170A] text-amber-300',
  block: 'border-[#7A2530] bg-[#2B1215] text-red-300',
}

const BADGE_TONE = {
  neutral: 'bg-[#16213A] text-slate-300',
  info: 'bg-[#10233A] text-blue-300',
  ok: 'bg-[#0D2A21] text-emerald-300',
  warn: 'bg-[#2A1F0B] text-amber-300',
  block: 'bg-[#2B1215] text-red-300',
}

/** Classes de uma pastilha com contorno (para um <button> que o é). */
export function pillClass(tone = 'neutral') {
  return `inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold ${PILL_TONE[tone] ?? PILL_TONE.neutral}`
}

/**
 * Pastilha com contorno; `icon` antes do texto.
 * @param {{tone?: 'neutral'|'info'|'ok'|'warn'|'block', icon?: any, className?: string, children?: any}} props
 */
export function Pill({ tone = 'neutral', icon = null, className = '', children = null }) {
  return (
    <span className={`${pillClass(tone)} ${className}`}>
      {icon}
      {children}
    </span>
  )
}

/**
 * Etiqueta pequena (uma contagem, um estado numa linha).
 * @param {{tone?: 'neutral'|'info'|'ok'|'warn'|'block', className?: string, children?: any}} props
 */
export function Badge({ tone = 'neutral', className = '', children = null }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${BADGE_TONE[tone] ?? BADGE_TONE.neutral} ${className}`}
    >
      {children}
    </span>
  )
}
