import { DRONE_PROFILES } from '../data/drones.js'

/** Secção com título, estilo dashboard de engenharia. */
function Section({ title, children }) {
  return (
    <div className="border-b border-slate-800 px-4 py-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-sky-400">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, suffix, children }) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-300">
      <span className="flex-1">{label}</span>
      {children}
      {suffix && <span className="w-8 text-xs text-slate-500">{suffix}</span>}
    </label>
  )
}

function NumberInput({ value, onChange, min, max, step = 1, wide }) {
  return (
    <input
      type="number"
      className={`${wide ? 'w-28' : 'w-20'} rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-sky-500 focus:outline-none`}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

export default function ControlPanel({
  missionName,
  setMissionName,
  droneId,
  setDroneId,
  custom,
  setCustom,
  params,
  setParam,
  mode,
  draftCount,
  hasRing,
  validation,
  planError,
  anchor,
  setAnchorParam,
  onStartDraw,
  onStartAnchor,
  onFinishDraw,
  onClear,
}) {
  const profile = DRONE_PROFILES[droneId]
  const isCustom = profile.type === 'custom'

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 lg:w-96">
      {/* Missão */}
      <Section title="Missão">
        <input
          type="text"
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          value={missionName}
          onChange={(e) => setMissionName(e.target.value)}
          placeholder="nome-da-missao"
        />
      </Section>

      {/* Drone / Sensor */}
      <Section title="Drone / Sensor">
        <select
          className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          value={droneId}
          onChange={(e) => setDroneId(e.target.value)}
        >
          {Object.values(DRONE_PROFILES).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {!isCustom && (
          <p className="text-xs leading-relaxed text-slate-500">
            {profile.camera} · sensor {profile.sensorWidth}×{profile.sensorHeight} mm · focal{' '}
            {profile.focalLength} mm · payload {profile.payloadLabel}
          </p>
        )}

        {isCustom && (
          <div className="mt-2 space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex gap-4 text-sm text-slate-300">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={custom.mode === 'camera'}
                  onChange={() => setCustom({ ...custom, mode: 'camera' })}
                />
                Câmara
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={custom.mode === 'lidar'}
                  onChange={() => setCustom({ ...custom, mode: 'lidar' })}
                />
                LiDAR (FOV)
              </label>
            </div>

            {custom.mode === 'camera' ? (
              <>
                <Field label="Largura sensor" suffix="mm">
                  <NumberInput
                    value={custom.sensorWidth}
                    step={0.1}
                    min={1}
                    onChange={(v) => setCustom({ ...custom, sensorWidth: v })}
                  />
                </Field>
                <Field label="Altura sensor" suffix="mm">
                  <NumberInput
                    value={custom.sensorHeight}
                    step={0.1}
                    min={1}
                    onChange={(v) => setCustom({ ...custom, sensorHeight: v })}
                  />
                </Field>
                <Field label="Distância focal" suffix="mm">
                  <NumberInput
                    value={custom.focalLength}
                    step={0.1}
                    min={1}
                    onChange={(v) => setCustom({ ...custom, focalLength: v })}
                  />
                </Field>
                <Field label="Largura imagem" suffix="px">
                  <NumberInput
                    value={custom.imageWidth}
                    min={100}
                    onChange={(v) => setCustom({ ...custom, imageWidth: v })}
                  />
                </Field>
              </>
            ) : (
              <Field label="FOV do feixe" suffix="°">
                <NumberInput
                  value={custom.fov}
                  min={1}
                  max={179}
                  onChange={(v) => setCustom({ ...custom, fov: v })}
                />
              </Field>
            )}

            <p className="pt-1 text-[11px] text-slate-500">Enums WPML (avançado)</p>
            <Field label="droneEnumValue">
              <NumberInput
                value={custom.droneEnumValue}
                min={0}
                onChange={(v) => setCustom({ ...custom, droneEnumValue: v })}
              />
            </Field>
            <Field label="payloadEnumValue">
              <NumberInput
                value={custom.payloadEnumValue}
                min={0}
                onChange={(v) => setCustom({ ...custom, payloadEnumValue: v })}
              />
            </Field>
          </div>
        )}
      </Section>

      {/* Parâmetros de voo */}
      <Section title="Parâmetros de Voo">
        <Field label="Altitude (AGL)" suffix="m">
          <NumberInput
            value={params.altitude}
            min={5}
            max={1500}
            onChange={(v) => setParam('altitude', v)}
          />
        </Field>
        <Field label="Velocidade" suffix="m/s">
          <NumberInput
            value={params.speed}
            min={1}
            max={23}
            step={0.5}
            onChange={(v) => setParam('speed', v)}
          />
        </Field>
        <Field label="Sobreposição frontal" suffix="%">
          <NumberInput
            value={params.frontOverlap}
            min={0}
            max={95}
            onChange={(v) => setParam('frontOverlap', v)}
          />
        </Field>
        <Field label="Sobreposição lateral" suffix="%">
          <NumberInput
            value={params.sideOverlap}
            min={0}
            max={95}
            onChange={(v) => setParam('sideOverlap', v)}
          />
        </Field>
        <Field label="Disparo por">
          <select
            className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            value={params.triggerMode}
            onChange={(e) => setParam('triggerMode', e.target.value)}
          >
            <option value="distance">Distância</option>
            <option value="time">Tempo</option>
          </select>
        </Field>
      </Section>

      {/* Orientação das linhas */}
      <Section title="Orientação das Linhas">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={params.angle}
            onChange={(e) => setParam('angle', Number(e.target.value))}
            className="flex-1"
          />
          <NumberInput
            value={params.angle}
            min={0}
            max={360}
            onChange={(v) => setParam('angle', Math.max(0, Math.min(360, v)))}
          />
          <span className="text-xs text-slate-500">°</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Azimute das faixas: 0° = Norte–Sul · 90° = Este–Oeste
        </p>
      </Section>

      {/* Expansão (buffer) */}
      <Section title="Expansão das Linhas (Buffer)">
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 10, 20, 30].map((pct) => (
            <button
              key={pct}
              onClick={() => setParam('bufferPct', pct)}
              className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                params.bufferPct === pct
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </Section>

      {/* Ferramentas de desenho */}
      <Section title="Área de Levantamento">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onStartDraw}
            className={`rounded px-2 py-2 text-sm font-medium transition-colors ${
              mode === 'draw'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            ✏️ Desenhar polígono
          </button>
          <button
            onClick={onStartAnchor}
            className={`rounded px-2 py-2 text-sm font-medium transition-colors ${
              mode === 'anchor'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            📍 Ponto central
          </button>
        </div>

        {mode === 'draw' && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-400">
              Clique no mapa para adicionar vértices ({draftCount}). Duplo-clique ou
              «Concluir» para fechar.
            </p>
            <button
              onClick={onFinishDraw}
              disabled={draftCount < 3}
              className="w-full rounded bg-emerald-600 px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ✔ Concluir polígono
            </button>
          </div>
        )}

        {mode === 'anchor' && (
          <div className="mt-2 space-y-1 rounded border border-slate-800 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs text-slate-400">
              Clique no mapa para definir o centro. O retângulo ajusta-se aos valores
              abaixo.
            </p>
            <Field label="Comprimento" suffix="m">
              <NumberInput
                value={anchor.length}
                min={10}
                onChange={(v) => setAnchorParam('length', v)}
              />
            </Field>
            <Field label="Largura" suffix="m">
              <NumberInput
                value={anchor.width}
                min={10}
                onChange={(v) => setAnchorParam('width', v)}
              />
            </Field>
            <Field label="Orientação" suffix="°">
              <NumberInput
                value={anchor.orientation}
                min={0}
                max={360}
                onChange={(v) => setAnchorParam('orientation', v)}
              />
            </Field>
          </div>
        )}

        {hasRing && (
          <button
            onClick={onClear}
            className="mt-2 w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-300 transition-colors hover:bg-red-900/60 hover:text-red-200"
          >
            🗑 Limpar área
          </button>
        )}

        {hasRing && !validation.valid && (
          <div className="mt-3 rounded border border-red-700 bg-red-950/60 p-3 text-xs leading-relaxed text-red-300">
            ⚠ <strong>Polígono inválido:</strong> foram detetadas auto-interseções
            (marcadas a vermelho no mapa). Arraste os vértices para corrigir a
            geometria antes de gerar as linhas de voo.
          </div>
        )}

        {planError === 'too-many-lines' && (
          <div className="mt-3 rounded border border-amber-700 bg-amber-950/60 p-3 text-xs leading-relaxed text-amber-300">
            ⚠ O espaçamento calculado gera linhas em excesso (&gt;2500). Aumente a
            altitude, reduza a sobreposição lateral ou diminua a área.
          </div>
        )}
      </Section>
    </div>
  )
}
