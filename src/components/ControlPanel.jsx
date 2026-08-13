import { DRONE_PROFILES } from '../data/drones.js'
import {
  IconCheck,
  IconHelipad,
  IconPolygon,
  IconTarget,
  IconTrash,
} from './Icons.jsx'

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
  hasBase,
  refAzimuth,
  split,
  setSplitParam,
  blocks,
  gridActive,
  onUndoVertex,
  onStartDraw,
  onStartAnchor,
  onStartBase,
  onRemoveBase,
  onSetAngleRelative,
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
        <p className="mt-1.5 text-[11px] text-slate-500">
          Nome dos ficheiros exportados (<span className="font-mono">.kml</span> /{' '}
          <span className="font-mono">.kmz</span>) e da missão no DJI Pilot 2.
        </p>
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
        <div className={params.spacingMode === 'manual' ? 'opacity-40' : ''}>
          <Field label="Sobreposição lateral" suffix="%">
            <NumberInput
              value={params.sideOverlap}
              min={0}
              max={95}
              onChange={(v) => setParam('sideOverlap', v)}
            />
          </Field>
        </div>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={params.spacingMode === 'manual'}
            onChange={(e) => setParam('spacingMode', e.target.checked ? 'manual' : 'auto')}
          />
          Espaçamento manual entre linhas
        </label>
        {params.spacingMode === 'manual' && (
          <Field label="Distância entre linhas" suffix="m">
            <NumberInput
              value={params.manualSpacing}
              min={1}
              max={2000}
              onChange={(v) => setParam('manualSpacing', v)}
            />
          </Field>
        )}
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
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {[
            { label: '∥ Paralelas', offset: 0 },
            { label: '⊥ Perpendic.', offset: 90 },
            { label: '∠ Oblíquas 45°', offset: 45 },
          ].map(({ label, offset }) => (
            <button
              key={offset}
              onClick={() => onSetAngleRelative(offset)}
              disabled={refAzimuth == null}
              title="Direção relativa à orientação do bloco (ou à aresta mais longa do polígono)"
              className="rounded bg-slate-800 px-1.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
        {refAzimuth != null && (
          <p className="mt-1 text-[11px] text-slate-500">
            Referência: {Math.round(refAzimuth)}° — orientação do bloco / aresta mais longa
          </p>
        )}
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
        <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Forma</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={onStartDraw}
            title="Polígono livre: clique a clique no mapa"
            className={`flex items-center justify-center gap-1 rounded px-1.5 py-2 text-xs font-medium transition-colors ${
              mode === 'draw'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconPolygon /> Polígono
          </button>
          <button
            onClick={() => onStartAnchor('rect')}
            title="Retângulo centrado num ponto (comprimento × largura)"
            className={`flex items-center justify-center gap-1 rounded px-1.5 py-2 text-xs font-medium transition-colors ${
              mode === 'anchor' && anchor.shape === 'rect'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconTarget /> Retângulo
          </button>
          <button
            onClick={() => onStartAnchor('square')}
            title="Quadrado centrado num ponto (lado único)"
            className={`flex items-center justify-center gap-1 rounded px-1.5 py-2 text-xs font-medium transition-colors ${
              mode === 'anchor' && anchor.shape === 'square'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconTarget /> Quadrado
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={onStartBase}
            title="Marcar o ponto de descolagem / posição do operador"
            className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-medium transition-colors ${
              mode === 'base'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconHelipad /> Marcar base
          </button>
          <button
            onClick={onRemoveBase}
            disabled={!hasBase}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconTrash /> Remover base
          </button>
        </div>

        {mode === 'base' && (
          <p className="mt-2 text-xs text-slate-400">
            Clique no mapa para marcar a base (arrastável). A distância à área aparece no
            painel de métricas e o ponto é incluído no KML.
          </p>
        )}

        {mode === 'draw' && (
          <div className="mt-2 space-y-2">
            <p className="text-xs leading-relaxed text-slate-400">
              Clique no mapa para adicionar vértices ({draftCount}).{' '}
              <strong className="text-slate-300">Backspace</strong> ou clique num vértice
              para o remover · <strong className="text-slate-300">duplo clique</strong>{' '}
              (esquerdo ou direito) ou «Concluir» para fechar · Esc cancela.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onUndoVertex}
                disabled={draftCount === 0}
                className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↩ Anular último
              </button>
              <button
                onClick={onFinishDraw}
                disabled={draftCount < 3}
                className="flex items-center justify-center gap-1.5 rounded bg-emerald-600 px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconCheck /> Concluir
              </button>
            </div>
          </div>
        )}

        {mode === 'anchor' && (
          <div className="mt-2 space-y-1 rounded border border-slate-800 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs text-slate-400">
              Clique no mapa para definir o centro. A forma ajusta-se aos valores abaixo.
            </p>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">
              Tamanhos rápidos
            </p>
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {[250, 500, 750, 1000].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setAnchorParam('length', s)
                    if (anchor.shape !== 'square') setAnchorParam('width', s)
                  }}
                  title={s === 250 ? `${s}×${s} m (≈1 bateria)` : `${s}×${s} m`}
                  className={`rounded px-1 py-1.5 text-xs font-medium transition-colors ${
                    anchor.length === s && anchor.width === s
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {s}²
                </button>
              ))}
            </div>
            {anchor.shape === 'square' ? (
              <Field label="Lado" suffix="m">
                <NumberInput
                  value={anchor.length}
                  min={10}
                  onChange={(v) => setAnchorParam('length', v)}
                />
              </Field>
            ) : (
              <>
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
              </>
            )}
            <Field label="Orientação" suffix="°">
              <NumberInput
                value={anchor.orientation}
                min={0}
                max={360}
                onChange={(v) => setAnchorParam('orientation', v)}
              />
            </Field>

            <p className="pb-1 pt-2 text-[11px] uppercase tracking-wider text-slate-500">
              Grelha de blocos (réplicas da forma)
            </p>
            <Field label="Colunas (∥ orientação)">
              <NumberInput
                value={anchor.cols}
                min={1}
                max={12}
                onChange={(v) => setAnchorParam('cols', v)}
              />
            </Field>
            <Field label="Linhas (⊥ orientação)">
              <NumberInput
                value={anchor.rows}
                min={1}
                max={12}
                onChange={(v) => setAnchorParam('rows', v)}
              />
            </Field>
            <p className="pt-1 text-[11px] leading-relaxed text-slate-500">
              Com mais de 1 célula, cada célula torna-se um bloco de voo numerado
              (ex.: 3×2 quadrados de 250 m = 6 baterias). Use o buffer para criar
              sobreposição entre células.
            </p>
          </div>
        )}

        {hasRing && mode !== 'draw' && !gridActive && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Edição: arraste os vértices · arraste os pontos intermédios para{' '}
            <strong className="text-slate-400">inserir vértices</strong> · clique direito
            num vértice para o <strong className="text-slate-400">remover</strong>.
          </p>
        )}

        {hasRing && (
          <button
            onClick={onClear}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-300 transition-colors hover:bg-red-900/60 hover:text-red-200"
          >
            <IconTrash /> Limpar área
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

      {/* Divisão em blocos de voo */}
      <Section title="Divisão em Blocos de Voo">
        {gridActive && (
          <p className="mb-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            Grelha ativa: cada célula é um bloco de voo. A divisão por área/bateria
            aplica-se apenas a áreas sem grelha.
          </p>
        )}
        {!gridActive && (
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { value: 'none', label: 'Nenhuma' },
            { value: 'area', label: 'Por área' },
            { value: 'battery', label: 'Por bateria' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSplitParam('mode', value)}
              className={`rounded px-1.5 py-1.5 text-xs font-medium transition-colors ${
                split.mode === value
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        )}

        {!gridActive && split.mode === 'area' && (
          <div className="mt-2">
            <Field label="Área máx. por bloco" suffix="ha">
              <NumberInput
                value={split.maxAreaHa}
                min={0.5}
                step={0.5}
                onChange={(v) => setSplitParam('maxAreaHa', v)}
              />
            </Field>
          </div>
        )}

        {!gridActive && split.mode === 'battery' && (
          <div className="mt-2">
            <Field label="Duração da bateria" suffix="min">
              <NumberInput
                value={split.batteryMin}
                min={5}
                max={60}
                onChange={(v) => setSplitParam('batteryMin', v)}
              />
            </Field>
            <Field label="Reserva de regresso" suffix="%">
              <NumberInput
                value={split.reservePct}
                min={10}
                max={50}
                onChange={(v) => setSplitParam('reservePct', v)}
              />
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Cada bloco usa no máx. {100 - split.reservePct}% da bateria
              {hasBase ? ', descontando o trânsito ida e volta à base.' : '.'}{' '}
              {!hasBase && 'Marque a base para descontar o trânsito.'}
            </p>
          </div>
        )}

        {(gridActive || split.mode !== 'none') && blocks && (
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded border border-slate-800 bg-slate-900/60 p-2">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-xs text-slate-300"
              >
                <span className="font-mono text-sky-300">B{String(b.id).padStart(2, '0')}</span>
                <span>{b.areaHa.toFixed(1)} ha</span>
                <span>{(b.lengthM / 1000).toFixed(1)} km</span>
                <span className="font-mono">{Math.round(b.timeS / 60)} min</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-slate-500">
              A exportação WPML gera um ZIP com um KMZ por bloco, numerados pela ordem de
              voo.
            </p>
          </div>
        )}
      </Section>
    </div>
  )
}
