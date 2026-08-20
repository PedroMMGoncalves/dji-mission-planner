import { useT } from '../i18n.jsx'

/**
 * E1.0 (modelo A): selector de tipo de missão no topo do painel lateral —
 * troca a ferramenta de desenho e o painel de parâmetros. Os pontos de
 * inspecção mantêm-se como camada extra dentro do modo Área.
 */
const MODES = [
  { id: 'area', key: 'mode.area' },
  { id: 'face', key: 'mode.face' },
  { id: 'orbit', key: 'mode.orbit' },
]

export default function MissionModeSelector({ mode, onChange }) {
  const t = useT()
  return (
    <div className="w-80 shrink-0 border-b border-r border-slate-800 bg-slate-950 px-4 py-2.5 lg:w-96">
      <div className="grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === m.id
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t(m.key)}
          </button>
        ))}
      </div>
    </div>
  )
}
