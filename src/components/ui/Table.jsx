/**
 * Tabela do desenho (bases, voos, grupos do preflight): cabeçalho esbatido
 * e uma linha fina entre as linhas, números alinhados. Uma <table> de
 * verdade, para o leitor de ecrã ler cada célula com a sua coluna.
 * `tone` tinge o cabeçalho e as linhas dentro de um cartão de aviso ou de
 * bloqueio; `bare` tira a moldura (a tabela já está dentro de um cartão).
 */

const TONE = {
  neutral: { frame: 'border-slate-800', head: 'bg-sunken text-slate-400', line: 'border-raised' },
  warn: {
    frame: 'border-[#5C4214]',
    head: 'border-t border-[#3A2C10] text-[#A89B7C]',
    line: 'border-[#2A2111]',
  },
  block: {
    frame: 'border-[#7A2530]',
    head: 'border-t border-[#4A1A20] text-[#C9A0A4]',
    line: 'border-[#3A1418]',
  },
  info: {
    frame: 'border-[#1E2E4A]',
    head: 'border-t border-[#1E2E4A] text-slate-400',
    line: 'border-[#18243A]',
  },
}

/**
 * @typedef {{key: string, label: any, align?: 'left'|'right'|'center'}} Column
 * @typedef {{key: string, cells: any[]}} Row
 */

/**
 * @param {{columns: Column[], rows: Row[], label?: string,
 *   tone?: 'neutral'|'warn'|'block'|'info', bare?: boolean, className?: string}} props
 */
export function Table({ columns, rows, label, tone = 'neutral', bare = false, className = '' }) {
  const c = TONE[tone] ?? TONE.neutral
  const align = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')
  return (
    <div
      className={`${bare ? '' : `overflow-hidden rounded-[9px] border ${c.frame}`} ${className}`}
    >
      <table aria-label={label} className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr className={c.head}>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 py-1.5 text-[11.5px] font-normal ${align(col.align)}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`border-t ${c.line}`}>
              {row.cells.map((cell, i) => (
                <td
                  key={columns[i]?.key ?? i}
                  className={`px-3 py-1.5 text-slate-100 ${align(columns[i]?.align)}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
