import { useEffect, useState } from 'react'
import { useLang, useT } from '../i18n.jsx'

/** Chip de tecla/acção, estilo visualizador de mapas. */
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

function InstrucoesPt() {
  return (
    <>
      <H>Fluxo básico</H>
      <ol className="list-decimal pl-5">
        <Li>Escolha o <strong>drone/sensor</strong> e ajuste altitude (ou GSD alvo), velocidade e sobreposições.</Li>
        <Li>Defina a <strong>área</strong>: desenhe um polígono, use retângulo/quadrado no ponto central, ou importe KML/GeoJSON/Shapefile.</Li>
        <Li>Opcional: marque a <strong>base</strong>, divida em <strong>blocos</strong>, carregue o <strong>terreno</strong> e planeie <strong>GCPs</strong>.</Li>
        <Li><strong>Exporte</strong>: KML simples (área) ou WPML/KMZ (missão completa para o DJI Pilot 2).</Li>
      </ol>

      <H>Tipos de missão</H>
      <ul className="list-none">
        <Li><strong>Área</strong> (selector no topo do painel) — grelha nadir/oblíqua sobre um polígono; inclui a dupla grelha 3D com «Passagem nadir extra (orto)» e os <strong>pontos de inspecção</strong> como camada extra: marque pontos no mapa, edite etiqueta/rumo/pitch/foto, reordene por arrasto ou «Sugerir ordem», e exporte como missão própria.</Li>
        <Li><strong>Fachada</strong> — clique «Desenhar» e marque o pé da face no mapa (o sentido do desenho define a esquerda/direita); conclua com duplo clique. Ajuste altura, afastamento, lado e sobreposições; a pré-visualização mostra a linha de voo afastada e os rumos. Nenhuma passagem desce abaixo do piso de segurança de 5 m — com afastamentos curtos a imagem é estreita e o painel avisa da faixa que fica sem cobertura no pé da face. Exporta com rumo fixo e uma foto por waypoint.</Li>
        <Li><strong>Órbita</strong> — «Marcar POI» e clicar no alvo; defina raio (ou GSD alvo), níveis e passo. Exporta em voo curvo contínuo, missão única ou um KMZ por nível (ZIP).</Li>
      </ul>

      <H>Avisos que deve compreender</H>
      <ul className="list-none">
        <Li><strong>«Afastamento NÃO verificado»</strong> (fachada) — sem um GeoTIFF local importado, nada valida a distância à face: os tiles globais (~30 m) não têm resolução à escala de uma parede. Com um DSM local carregado, a app verifica a folga vertical e ao longo do rumo e lista as passagens em conflito — aumentar o afastamento resolve.</Li>
        <Li><strong>«GSD (centro do quadro)»</strong> — com o gimbal oblíquo, o GSD mostrado usa o alcance inclinado ao centro da imagem (a −60° é ~15% pior do que a nadir); os bordos superiores do quadro são ainda piores. O espaçamento das faixas continua calculado como a nadir, de propósito — o erro é conservador (sobreposição real ≥ pedida).</Li>
      </ul>

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
        <Li><strong>Bateria</strong> — quadrados dimensionados pela bateria (duração × reserva, trânsito à base descontado, tecto VLOS).</Li>
        <Li><strong>Mosaico</strong> — quadrados de lado manual sobre o polígono.</Li>
        <Li><Kbd>Clique numa célula</Kbd> — desactiva/reactiva · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> — desfaz.</Li>
        <Li>No modo ponto central, a <strong>grelha N×M</strong> replica a forma em colunas × linhas.</Li>
      </ul>

      <H>Terreno e Vista 3D</H>
      <ul className="list-none">
        <Li>O relevo global (~30 m) descarrega-se automaticamente ao definir a área; com «Seguir terreno», cada waypoint recebe a altura que mantém o AGL constante.</Li>
        <Li>Para precisão máxima, importe um <strong>MDT GeoTIFF do LiDAR da DGT</strong> (50 cm/2 m) — só a janela da área é lida, mesmo em ficheiros de vários GB.</Li>
        <Li>Marque a <strong>base no local real de descolagem</strong> — as alturas WPML são relativas a esse ponto.</Li>
        <Li>A <strong>Vista 3D</strong> mostra as linhas de voo à altura real sobre o relevo (órbita com o rato, exagero vertical).</Li>
      </ul>

      <H>Exportação</H>
      <ul className="list-none">
        <Li><strong>KML Simples</strong> — polígono 2D + base + GCPs, para desenhar a missão no Pilot 2.</Li>
        <Li><strong>WPML (KMZ)</strong> — missão executável com waypoints e disparo automático; com blocos activos gera um ZIP com um KMZ por bloco.</Li>
        <Li><strong>Disparo por waypoint</strong> — em «Disparo por: Waypoint», cada passagem é densificada em waypoints a passos iguais ≤ intervalo e cada um leva uma acção de foto (sem gatilho por distância); o overshoot não fotografa e o modo não é compatível com «Seguir terreno». O tempo de paragem em cada waypoint não entra na estimativa.</Li>
        <Li>O projecto grava-se automaticamente no browser; use «Guardar/Abrir projecto» para arquivar em ficheiro.</Li>
      </ul>
    </>
  )
}

function InstrucoesEn() {
  return (
    <>
      <H>Basic workflow</H>
      <ol className="list-decimal pl-5">
        <Li>Pick the <strong>drone/sensor</strong> and set altitude (or target GSD), speed and overlaps.</Li>
        <Li>Define the <strong>area</strong>: draw a polygon, use a centre-point rectangle/square, or import KML/GeoJSON/Shapefile.</Li>
        <Li>Optional: mark the <strong>home point</strong>, split into <strong>blocks</strong>, load the <strong>terrain</strong> and plan <strong>GCPs</strong>.</Li>
        <Li><strong>Export</strong>: simple KML (area) or WPML/KMZ (full mission for DJI Pilot 2).</Li>
      </ol>

      <H>Mission types</H>
      <ul className="list-none">
        <Li><strong>Area</strong> (selector at the top of the panel) — nadir/oblique grid over a polygon; includes the 3D double grid with “Extra nadir pass (ortho)” and <strong>inspection points</strong> as an extra layer: place points on the map, edit label/heading/pitch/photo, reorder by drag or “Suggest order”, and export as a mission of its own.</Li>
        <Li><strong>Face</strong> — click “Draw” and mark the foot of the face on the map (the drawing direction defines left/right); finish with a double click. Set height, standoff, side and overlaps; the preview shows the offset flight line and the headings. No pass drops below the 5 m safety floor — at short standoffs the image is narrow and the panel warns about the strip left uncovered at the foot of the face. Exports with a fixed heading and one photo per waypoint.</Li>
        <Li><strong>Orbit</strong> — “Mark POI” and click the target; set radius (or target GSD), levels and step. Exports in continuous curved flight, single mission or one KMZ per level (ZIP).</Li>
      </ul>

      <H>Warnings you must understand</H>
      <ul className="list-none">
        <Li><strong>“Standoff NOT verified”</strong> (face mode) — without an imported local GeoTIFF, nothing validates the distance to the face: global tiles (~30 m) lack resolution at wall scale. With a local DSM loaded, the app checks vertical and along-heading clearance and lists conflicting passes — raising the standoff clears it.</Li>
        <Li><strong>“GSD (frame centre)”</strong> — with an oblique gimbal the displayed GSD uses the slant range to the image centre (at −60° it is ~15% worse than nadir); the upper frame edges are worse still. Line spacing stays nadir-based on purpose — the error is conservative (real overlap ≥ requested).</Li>
      </ul>

      <H>Polygon drawing</H>
      <ul className="list-none">
        <Li><Kbd>Click</Kbd> — adds a vertex.</Li>
        <Li><Kbd>Click a vertex</Kbd> or <Kbd>Backspace</Kbd> — removes it.</Li>
        <Li><Kbd>Double click</Kbd> (left or right) — closes the polygon.</Li>
        <Li><Kbd>Esc</Kbd> — cancels drawing.</Li>
      </ul>

      <H>Area editing</H>
      <ul className="list-none">
        <Li><Kbd>Drag a vertex</Kbd> — moves it; <Kbd>drag a midpoint</Kbd> — inserts a new vertex.</Li>
        <Li><Kbd>Right-click a vertex</Kbd> — removes it (minimum 3).</Li>
        <Li>Red vertices with a warning = self-intersection; fix before exporting.</Li>
      </ul>

      <H>Flight blocks</H>
      <ul className="list-none">
        <Li><strong>Strips</strong> — cuts the serpentine by maximum area (long lines).</Li>
        <Li><strong>Battery</strong> — squares sized by the battery (duration × return reserve, transit to home deducted, VLOS cap).</Li>
        <Li><strong>Mosaic</strong> — squares of manual size over the polygon.</Li>
        <Li><Kbd>Click a cell</Kbd> — disables/enables it · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> — undo.</Li>
        <Li>In centre-point mode, the <strong>N×M grid</strong> replicates the shape in columns × rows.</Li>
      </ul>

      <H>Terrain and 3D view</H>
      <ul className="list-none">
        <Li>The global terrain (~30 m) downloads automatically once the area is defined; with “Follow terrain”, each waypoint gets the height that keeps the AGL constant.</Li>
        <Li>For maximum accuracy, import a <strong>DGT LiDAR DTM GeoTIFF</strong> (50 cm/2 m) — only the window covering your area is read, even from multi-GB files.</Li>
        <Li>Mark the <strong>home point at the real takeoff location</strong> — WPML heights are relative to it.</Li>
        <Li>The <strong>3D view</strong> shows the flight lines at their true height over the relief (mouse orbit, vertical exaggeration).</Li>
      </ul>

      <H>Export</H>
      <ul className="list-none">
        <Li><strong>Simple KML</strong> — 2D polygon + home point + GCPs, to draw the mission in Pilot 2.</Li>
        <Li><strong>WPML (KMZ)</strong> — executable mission with waypoints and automatic camera triggering; with blocks active it generates a ZIP with one KMZ per block.</Li>
        <Li><strong>Per-waypoint trigger</strong> — with “Trigger by: Waypoint”, each pass is densified into waypoints at equal steps ≤ interval and every one carries a take-photo action (no distance trigger); the overshoot takes no photos and the mode is not compatible with “Follow terrain”. The stop time at each waypoint is not part of the estimate.</Li>
        <Li>The project auto-saves in the browser; use “Save/Open project” to archive it as a file.</Li>
      </ul>
    </>
  )
}

function AcercaPt() {
  return (
    <>
      <H>DJI Mission Planner</H>
      <p className="leading-relaxed">
        Planeador de missões de mapeamento com drones: grelhas fotogramétricas e LiDAR,
        divisão em blocos por bateria, seguimento de terreno, planeamento de GCPs e
        exportação KML/WPML optimizada para o DJI Pilot 2 (Mavic 3E, Matrice 4T, M300
        RTK + P1 e perfis personalizados).
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
        Esta ferramenta apoia o planeamento mas não substitui a validação no DJI Pilot 2
        nem o cumprimento das regras UAS aplicáveis (categoria Aberta: máx. 120 m AGL e
        voo em linha de vista). O piloto é sempre responsável pela operação. Verifique
        zonas de restrição e autorizações necessárias antes de voar.
      </p>
    </>
  )
}

function AcercaEn() {
  return (
    <>
      <H>DJI Mission Planner</H>
      <p className="leading-relaxed">
        Drone mapping mission planner: photogrammetry and LiDAR grids, battery-based
        block splitting, terrain following, GCP planning and KML/WPML export optimised
        for DJI Pilot 2 (Mavic 3E, Matrice 4T, M300 RTK + P1 and custom profiles).
      </p>

      <H>Data and services</H>
      <ul className="list-disc pl-5">
        <Li>Satellite imagery and labels © Esri · OpenStreetMap contributors.</Li>
        <Li>Administrative boundaries: CAOP © Direção-Geral do Território, Portugal (CC-BY 4.0).</Li>
        <Li>Global elevation: Terrarium terrain tiles (Mapzen/AWS Open Data).</Li>
        <Li>High-resolution DTM: LiDAR survey of mainland Portugal © DGT (CC-BY 4.0), via GeoTIFF import.</Li>
      </ul>

      <H>Disclaimer</H>
      <p className="leading-relaxed text-slate-400">
        This tool supports planning but does not replace validation in DJI Pilot 2 nor
        compliance with applicable UAS rules (Open category: max. 120 m AGL and visual
        line of sight). The pilot is always responsible for the operation. Check
        restriction zones and required authorisations before flying.
      </p>
    </>
  )
}

export default function HelpModal({ onClose }) {
  const [tab, setTab] = useState('instrucoes')
  const t = useT()
  const lang = useLang()

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
            {t('help.instructions')}
          </button>
          <button
            onClick={() => setTab('acerca')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'acerca'
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('help.about')}
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2.5 text-slate-400 transition-colors hover:text-slate-100"
            title={t('help.closeTitle')}
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">
          {tab === 'instrucoes' ? (
            lang === 'en' ? <InstrucoesEn /> : <InstrucoesPt />
          ) : lang === 'en' ? (
            <AcercaEn />
          ) : (
            <AcercaPt />
          )}
        </div>
      </div>
    </div>
  )
}
