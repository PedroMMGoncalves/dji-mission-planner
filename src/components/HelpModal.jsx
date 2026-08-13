import { useEffect, useState } from 'react'

/** Chip de tecla/ação, estilo visualizador de mapas. */
function Kbd({ children }) {
  return (
    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
      {children}
    </kbd>
  )
}

function H({ children }) {
  return (
    <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-sky-400 first:mt-0">
      {children}
    </h3>
  )
}

function Li({ children }) {
  return <li className="mb-1.5 leading-relaxed">{children}</li>
}

export default function HelpModal({ onClose }) {
  const [tab, setTab] = useState('instrucoes')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-6 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-slate-700">
          <button
            onClick={() => setTab('instrucoes')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'instrucoes'
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Instruções
          </button>
          <button
            onClick={() => setTab('acerca')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'acerca'
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Acerca
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2.5 text-slate-400 transition-colors hover:text-slate-100"
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">
          {tab === 'instrucoes' ? (
            <>
              <H>Fluxo básico</H>
              <ol className="list-decimal pl-5">
                <Li>Escolha o <strong>drone/sensor</strong> e ajuste altitude (ou GSD alvo), velocidade e sobreposições.</Li>
                <Li>Defina a <strong>área</strong>: desenhe um polígono, use retângulo/quadrado no ponto central, ou importe KML/GeoJSON/Shapefile.</Li>
                <Li>Opcional: marque a <strong>base</strong>, divida em <strong>blocos</strong>, carregue o <strong>terreno</strong> e planeie <strong>GCPs</strong>.</Li>
                <Li><strong>Exporte</strong>: KML simples (área) ou WPML/KMZ (missão completa para o DJI Pilot 2).</Li>
              </ol>

              <H>Desenho do polígono</H>
              <ul className="list-none">
                <Li><Kbd>Clique</Kbd> — adiciona um vértice.</Li>
                <Li><Kbd>Clique num vértice</Kbd> ou <Kbd>Backspace</Kbd> — remove-o.</Li>
                <Li><Kbd>Duplo clique</Kbd> (esquerdo ou direito) — fecha o polígono.</Li>
                <Li><Kbd>Esc</Kbd> — cancela o desenho.</Li>
              </ul>

              <H>Edição da área</H>
              <ul className="list-none">
                <Li><Kbd>Arrastar vértice</Kbd> — move-o; <Kbd>arrastar ponto intermédio</Kbd> — insere um vértice novo.</Li>
                <Li><Kbd>Clique direito num vértice</Kbd> — remove-o (mínimo 3).</Li>
                <Li>Vértices vermelhos com aviso = auto-interseção; corrija antes de exportar.</Li>
              </ul>

              <H>Blocos de voo</H>
              <ul className="list-none">
                <Li><strong>Faixas</strong> — corta a serpentina por área máxima (linhas longas).</Li>
                <Li><strong>Bateria</strong> — quadrados dimensionados pela bateria (duração × reserva, trânsito à base descontado, teto VLOS).</Li>
                <Li><strong>Mosaico</strong> — quadrados de lado manual sobre o polígono.</Li>
                <Li><Kbd>Clique numa célula</Kbd> — desativa/reativa · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> — desfaz.</Li>
                <Li>No modo ponto central, a <strong>grelha N×M</strong> replica a forma em colunas × linhas.</Li>
              </ul>

              <H>Terreno (terrain follow)</H>
              <ul className="list-none">
                <Li>«Descarregar relevo» obtém o modelo global (~30 m); com «Seguir terreno», cada waypoint recebe a altura que mantém o AGL constante.</Li>
                <Li>Marque a <strong>base no local real de descolagem</strong> — as alturas WPML são relativas a esse ponto.</Li>
                <Li>Para precisão máxima, importe um <strong>MDT GeoTIFF do LiDAR da DGT</strong> (50 cm/2 m) descarregado do Centro de Dados Geográficos.</Li>
              </ul>

              <H>Exportação</H>
              <ul className="list-none">
                <Li><strong>KML Simples</strong> — polígono 2D + base + GCPs, para desenhar a missão no Pilot 2.</Li>
                <Li><strong>WPML (KMZ)</strong> — missão executável com waypoints e disparo automático; com blocos ativos gera um ZIP com um KMZ por bloco.</Li>
                <Li>O projeto grava-se automaticamente no browser; use «Guardar/Abrir projeto» para arquivar em ficheiro.</Li>
              </ul>
            </>
          ) : (
            <>
              <H>DJI Mission Planner</H>
              <p className="leading-relaxed">
                Planeador de missões de mapeamento com drones: grelhas fotogramétricas e
                LiDAR, divisão em blocos por bateria, seguimento de terreno, planeamento
                de GCPs e exportação KML/WPML otimizada para o DJI Pilot 2 (Mavic 3E,
                Matrice 4T, M300 RTK + P1 e perfis personalizados).
              </p>

              <H>Dados e serviços</H>
              <ul className="list-disc pl-5">
                <Li>Imagens de satélite e topónimos © Esri · OpenStreetMap contributors.</Li>
                <Li>Limites administrativos: CAOP © Direção-Geral do Território (CC-BY 4.0).</Li>
                <Li>Elevação global: terrain tiles Terrarium (Mapzen/AWS Open Data).</Li>
                <Li>MDT de alta resolução: LiDAR de Portugal Continental © DGT (CC-BY 4.0), via importação de GeoTIFF.</Li>
              </ul>

              <H>Aviso</H>
              <p className="leading-relaxed text-slate-400">
                Esta ferramenta apoia o planeamento mas não substitui a validação no DJI
                Pilot 2 nem o cumprimento das regras UAS aplicáveis (categoria Aberta:
                máx. 120 m AGL e voo em linha de vista). O piloto é sempre responsável
                pela operação. Verifique zonas de restrição e autorizações necessárias
                antes de voar.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
