/**
 * Dicionário PT/EN do painel de controlo (ControlPanel.jsx).
 *
 * Convenção de chaves: `cp.<secção>.<campo>`. As secções seguem a ordem do
 * painel: mission · drone · flight · orientation · buffer · area · split ·
 * terrain · gcp. Interpolação com `{var}` (ver `useT()` em src/i18n.jsx).
 *
 * Nomes próprios e siglas (DJI Pilot 2, CAOP, DGT, Esri, LiDAR, GSD, VLOS,
 * WPML, KML, KMZ, GeoTIFF, PT-TM06) e unidades não são traduzidos.
 */

export default {
  /* ---- Missão ---- */
  'cp.mission.title': { pt: 'Missão', en: 'Mission' },
  'cp.mission.namePlaceholder': { pt: 'nome-da-missao', en: 'mission-name' },
  'cp.mission.nameHintA': {
    pt: 'Nome dos ficheiros exportados',
    en: 'Name of the exported files',
  },
  'cp.mission.nameHintB': {
    pt: 'e da missão no DJI Pilot 2.',
    en: 'and of the mission in DJI Pilot 2.',
  },
  'cp.mission.save': { pt: 'Guardar projeto', en: 'Save project' },
  'cp.mission.saveTitle': {
    pt: 'Descarregar o projeto completo (.json)',
    en: 'Download the complete project (.json)',
  },
  'cp.mission.open': { pt: 'Abrir projeto', en: 'Open project' },
  'cp.mission.openTitle': {
    pt: 'Abrir um projeto guardado (.json)',
    en: 'Open a saved project (.json)',
  },
  'cp.mission.autosave': {
    pt: 'O trabalho é gravado automaticamente neste browser.',
    en: 'Your work is saved automatically in this browser.',
  },

  /* ---- Drone / Sensor ---- */
  'cp.drone.title': { pt: 'Drone / Sensor', en: 'Drone / Sensor' },
  'cp.drone.payload': { pt: 'Payload / Sensor', en: 'Payload / Sensor' },
  'cp.drone.lidarSpecs': {
    pt: '{desc} · FOV nominal {fov}° · teto operacional {agl} m AGL',
    en: '{desc} · nominal FOV {fov}° · operational ceiling {agl} m AGL',
  },
  'cp.drone.effectiveFov': { pt: 'FOV de trabalho', en: 'Working FOV' },
  'cp.drone.effectiveFovReset': { pt: 'Nominal', en: 'Nominal' },
  'cp.drone.effectiveFovResetTitle': {
    pt: 'Voltar ao FOV nominal do sensor ({fov}°)',
    en: 'Back to the sensor nominal FOV ({fov}°)',
  },
  'cp.drone.effectiveFovHint': {
    pt: 'Corte de trabalho do feixe: a faixa e o espaçamento usam este ângulo. Bordas do feixe têm mais ruído — é comum voar com um corte mais estreito que o nominal.',
    en: 'Working beam cut: swath and spacing use this angle. Beam edges are noisier — flying a narrower cut than nominal is common practice.',
  },
  'cp.drone.specs': {
    pt: '{camera} · sensor {w}×{h} mm · focal {focal} mm · payload {payload}',
    en: '{camera} · sensor {w}×{h} mm · focal length {focal} mm · payload {payload}',
  },
  'cp.drone.camera': { pt: 'Câmara', en: 'Camera' },
  'cp.drone.lidar': { pt: 'LiDAR (FOV)', en: 'LiDAR (FOV)' },
  'cp.drone.sensorWidth': { pt: 'Largura sensor', en: 'Sensor width' },
  'cp.drone.sensorHeight': { pt: 'Altura sensor', en: 'Sensor height' },
  'cp.drone.focalLength': { pt: 'Distância focal', en: 'Focal length' },
  'cp.drone.imageWidth': { pt: 'Largura imagem', en: 'Image width' },
  'cp.drone.fov': { pt: 'FOV do feixe', en: 'Beam FOV' },
  'cp.drone.wpmlEnums': { pt: 'Enums WPML (avançado)', en: 'WPML enums (advanced)' },

  /* ---- Parâmetros de voo ---- */
  'cp.flight.title': { pt: 'Parâmetros de Voo', en: 'Flight Parameters' },
  'cp.flight.altitude': { pt: 'Altitude (AGL)', en: 'Altitude (AGL)' },
  'cp.flight.gsdTarget': { pt: 'GSD alvo', en: 'Target GSD' },
  'cp.flight.altWarnPre': { pt: 'Acima de', en: 'Above' },
  'cp.flight.altWarnPost': {
    pt: '— excede o limite geral da categoria Aberta (UE); requer autorização específica.',
    en: '— exceeds the general Open category limit (EU); specific authorisation is required.',
  },
  'cp.flight.speed': { pt: 'Velocidade', en: 'Speed' },
  'cp.flight.frontOverlap': { pt: 'Sobreposição frontal', en: 'Front overlap' },
  'cp.flight.sideOverlap': { pt: 'Sobreposição lateral', en: 'Side overlap' },
  'cp.flight.manualSpacing': {
    pt: 'Espaçamento manual entre linhas',
    en: 'Manual line spacing',
  },
  'cp.flight.lineDistance': { pt: 'Distância entre linhas', en: 'Line spacing' },
  'cp.flight.triggerBy': { pt: 'Disparo por', en: 'Trigger by' },
  'cp.flight.triggerDistance': { pt: 'Distância', en: 'Distance' },
  'cp.flight.triggerTime': { pt: 'Tempo', en: 'Time' },
  'cp.flight.gimbalPitch': { pt: 'Inclinação do gimbal', en: 'Gimbal pitch' },
  'cp.flight.gimbalHint': {
    pt: '−90° = nadir (2D) · −60°/−45° = oblíqua, para reconstrução 3D',
    en: '−90° = nadir (2D) · −60°/−45° = oblique, for 3D reconstruction',
  },

  /* ---- Orientação das linhas ---- */
  'cp.orientation.title': { pt: 'Orientação das Linhas', en: 'Flight Line Orientation' },
  'cp.orientation.azimuthHint': {
    pt: 'Azimute das faixas: 0° = Norte–Sul · 90° = Este–Oeste',
    en: 'Flight line azimuth: 0° = North–South · 90° = East–West',
  },
  'cp.orientation.parallel': { pt: '∥ Paralelas', en: '∥ Parallel' },
  'cp.orientation.perpendicular': { pt: '⊥ Perpendic.', en: '⊥ Perpend.' },
  'cp.orientation.oblique45': { pt: '∠ Oblíquas 45°', en: '∠ Oblique 45°' },
  'cp.orientation.relativeTitle': {
    pt: 'Direção relativa à orientação do bloco (ou à aresta mais longa do polígono)',
    en: 'Direction relative to the block orientation (or to the longest edge of the polygon)',
  },
  'cp.orientation.reference': {
    pt: 'Referência: {deg}° — orientação do bloco / aresta mais longa',
    en: 'Reference: {deg}° — block orientation / longest edge',
  },
  'cp.orientation.crosshatch': {
    pt: 'Dupla grelha perpendicular (crosshatch, 3D)',
    en: 'Perpendicular double grid (crosshatch, 3D)',
  },
  'cp.orientation.crosshatchHint': {
    pt: 'Segunda passagem a {deg}°. Duplica o tempo de voo — os blocos por bateria são redimensionados. Sugere-se gimbal a −60°.',
    en: 'Second pass at {deg}°. Doubles the flight time — the per-battery blocks are resized. A gimbal pitch of −60° is recommended.',
  },

  /* ---- Expansão (buffer) ---- */
  'cp.buffer.title': {
    pt: 'Expansão das Linhas (Buffer)',
    en: 'Flight Line Expansion (Buffer)',
  },

  /* ---- Área de levantamento ---- */
  'cp.area.title': { pt: 'Área de Levantamento', en: 'Survey Area' },
  'cp.area.shape': { pt: 'Forma', en: 'Shape' },
  'cp.area.polygon': { pt: 'Polígono', en: 'Polygon' },
  'cp.area.polygonTitle': {
    pt: 'Polígono livre: clique a clique no mapa',
    en: 'Free-form polygon: click by click on the map',
  },
  'cp.area.rect': { pt: 'Retângulo', en: 'Rectangle' },
  'cp.area.rectTitle': {
    pt: 'Retângulo centrado num ponto (comprimento × largura)',
    en: 'Rectangle centred on a point (length × width)',
  },
  'cp.area.square': { pt: 'Quadrado', en: 'Square' },
  'cp.area.squareTitle': {
    pt: 'Quadrado centrado num ponto (lado único)',
    en: 'Square centred on a point (single side)',
  },
  'cp.area.import': {
    pt: 'Importar área (KML · GeoJSON · SHP · KMZ WPML)',
    en: 'Import area (KML · GeoJSON · SHP · WPML KMZ)',
  },
  'cp.area.importTitle': {
    pt: 'Importar área de ficheiro KML, GeoJSON ou Shapefile zipado',
    en: 'Import an area from a KML, GeoJSON or zipped Shapefile',
  },
  'cp.area.crsPrompt': {
    pt: 'coordenadas projetadas detetadas. Escolha o sistema de coordenadas de origem:',
    en: 'projected coordinates detected. Choose the source coordinate reference system:',
  },
  'cp.area.convert': { pt: 'Converter', en: 'Convert' },
  'cp.area.cancel': { pt: 'Cancelar', en: 'Cancel' },
  'cp.area.markBase': { pt: 'Marcar base', en: 'Set base' },
  'cp.area.baseTitle': {
    pt: 'Marcar o ponto de descolagem / posição do operador',
    en: 'Set the takeoff point / operator position',
  },
  'cp.area.removeBase': { pt: 'Remover base', en: 'Remove base' },
  'cp.area.baseHint': {
    pt: 'Clique no mapa para marcar a base (arrastável). A distância à área aparece no painel de métricas e o ponto é incluído no KML.',
    en: 'Click on the map to set the base (draggable). The distance to the area is shown in the metrics panel and the point is included in the KML.',
  },
  'cp.area.drawHintA': {
    pt: 'Clique no mapa para adicionar vértices ({n}).',
    en: 'Click on the map to add vertices ({n}).',
  },
  'cp.area.drawHintB': {
    pt: 'ou clique num vértice para o remover ·',
    en: 'or click a vertex to remove it ·',
  },
  'cp.area.drawHintDblClick': { pt: 'duplo clique', en: 'double-click' },
  'cp.area.drawHintC': {
    pt: '(esquerdo ou direito) ou «Concluir» para fechar · Esc cancela.',
    en: '(left or right) or “Finish” to close · Esc cancels.',
  },
  'cp.area.undoVertex': { pt: 'Anular último', en: 'Undo last' },
  'cp.area.finish': { pt: 'Concluir', en: 'Finish' },
  'cp.area.anchorHint': {
    pt: 'Clique no mapa para definir o centro. A forma ajusta-se aos valores abaixo.',
    en: 'Click on the map to set the center point. The shape adjusts to the values below.',
  },
  'cp.area.quickSizes': { pt: 'Tamanhos rápidos', en: 'Quick sizes' },
  'cp.area.sizeTitle': { pt: '{s}×{s} m', en: '{s}×{s} m' },
  'cp.area.sizeTitleBattery': {
    pt: '{s}×{s} m (≈1 bateria)',
    en: '{s}×{s} m (≈1 battery)',
  },
  'cp.area.side': { pt: 'Lado', en: 'Side' },
  'cp.area.length': { pt: 'Comprimento', en: 'Length' },
  'cp.area.width': { pt: 'Largura', en: 'Width' },
  'cp.area.orientation': { pt: 'Orientação', en: 'Orientation' },
  'cp.area.blockGrid': {
    pt: 'Grelha de blocos (réplicas da forma)',
    en: 'Block grid (replicas of the shape)',
  },
  'cp.area.cols': { pt: 'Colunas (∥ orientação)', en: 'Columns (∥ orientation)' },
  'cp.area.rows': { pt: 'Linhas (⊥ orientação)', en: 'Rows (⊥ orientation)' },
  'cp.area.gridHint': {
    pt: 'Com mais de 1 célula, cada célula torna-se um bloco de voo numerado (ex.: 3×2 quadrados de 250 m = 6 baterias). Use o buffer para criar sobreposição entre células.',
    en: 'With more than 1 cell, each cell becomes a numbered flight block (e.g. 3×2 squares of 250 m = 6 batteries). Use the buffer to create overlap between cells.',
  },
  'cp.area.editHintA': {
    pt: 'Edição: arraste os vértices · arraste os pontos intermédios para',
    en: 'Editing: drag the vertices · drag the midpoints to',
  },
  'cp.area.editHintInsert': { pt: 'inserir vértices', en: 'insert vertices' },
  'cp.area.editHintB': {
    pt: '· clique direito num vértice para o',
    en: '· right-click a vertex to',
  },
  'cp.area.editHintRemove': { pt: 'remover', en: 'remove it' },
  'cp.area.clear': { pt: 'Limpar área', en: 'Clear area' },
  'cp.area.invalidTitle': { pt: 'Polígono inválido:', en: 'Invalid polygon:' },
  'cp.area.invalidBody': {
    pt: 'foram detetadas auto-interseções (marcadas a vermelho no mapa). Arraste os vértices para corrigir a geometria antes de gerar as linhas de voo.',
    en: 'self-intersections were detected (marked in red on the map). Drag the vertices to fix the geometry before generating the flight lines.',
  },
  'cp.area.tooManyLines': {
    pt: 'O espaçamento calculado gera linhas em excesso (>2500). Aumente a altitude, reduza a sobreposição lateral ou diminua a área.',
    en: 'The computed spacing produces too many flight lines (>2500). Increase the altitude, reduce the side overlap or shrink the area.',
  },

  /* ---- Divisão em blocos de voo ---- */
  'cp.split.title': { pt: 'Divisão em Blocos de Voo', en: 'Split into Flight Blocks' },
  'cp.split.gridActive': {
    pt: 'Grelha ativa: cada célula é um bloco de voo. A divisão por área/bateria aplica-se apenas a áreas sem grelha.',
    en: 'Grid active: each cell is a flight block. Splitting by area/battery applies only to areas without a grid.',
  },
  'cp.split.modeNone': { pt: 'Nenhuma', en: 'None' },
  'cp.split.modeArea': { pt: 'Faixas', en: 'Lines' },
  'cp.split.modeBattery': { pt: 'Bateria', en: 'Battery' },
  'cp.split.modeTiles': { pt: 'Mosaico', en: 'Mosaic' },
  'cp.split.tileSideLabel': { pt: 'Lado do quadrado', en: 'Square side' },
  'cp.split.customSide': { pt: 'Lado personalizado', en: 'Custom side' },
  'cp.split.meshOrientation': { pt: 'Orientação da malha', en: 'Mosaic orientation' },
  'cp.split.undo': { pt: 'Anular (Ctrl+Z)', en: 'Undo (Ctrl+Z)' },
  'cp.split.undoTitle': {
    pt: 'Desfazer a última alteração às células (Ctrl+Z)',
    en: 'Undo the last change to the cells (Ctrl+Z)',
  },
  'cp.split.restoreAll': { pt: 'Reativar todas', en: 'Re-enable all' },
  'cp.split.tilesHintA': {
    pt: 'O polígono é coberto por quadrados (podem exceder os limites).',
    en: 'The polygon is covered by squares (they may extend beyond its limits).',
  },
  'cp.split.clickCell': {
    pt: 'Clique numa célula no mapa',
    en: 'Click a cell on the map',
  },
  'cp.split.tilesHintB': {
    pt: 'para a desativar/reativar (Ctrl+Z desfaz). Cada célula ativa é um bloco de voo numerado.',
    en: 'to disable/re-enable it (Ctrl+Z undoes). Each active cell is a numbered flight block.',
  },
  'cp.split.cellsGenerated': { pt: '{n} células geradas', en: '{n} cells generated' },
  'cp.split.cells': { pt: '{n} células', en: '{n} cells' },
  'cp.split.cellsActive': { pt: ', {n} ativas', en: ', {n} active' },
  'cp.split.tooManyCellsTile': {
    pt: 'Demasiadas células (>400). Aumente o lado do quadrado.',
    en: 'Too many cells (>400). Increase the square side.',
  },
  'cp.split.tooManyCellsBattery': {
    pt: 'Demasiadas células (>400). Aumente a duração da bateria ou o teto VLOS.',
    en: 'Too many cells (>400). Increase the battery duration or the VLOS ceiling.',
  },
  'cp.split.maxAreaPerBlock': { pt: 'Área máx. por bloco', en: 'Max. area per block' },
  'cp.split.batteryDuration': { pt: 'Duração da bateria', en: 'Battery duration' },
  'cp.split.returnReserve': { pt: 'Reserva de regresso', en: 'Return reserve' },
  'cp.split.maxSide': { pt: 'Lado máx. (VLOS)', en: 'Max. side (VLOS)' },
  'cp.split.squareBlocks': { pt: 'Blocos quadrados de', en: 'Square blocks of' },
  'cp.split.batteryUse': {
    pt: ', dimensionados para {pct}% da bateria',
    en: ', sized for {pct}% of the battery',
  },
  'cp.split.transitDeducted': {
    pt: '(trânsito à base descontado)',
    en: '(transit to base deducted)',
  },
  'cp.split.batteryHintA': {
    pt: 'Áreas compactas mantêm o voo dentro do alcance visual (VLOS) e a troca de baterias perto do bloco.',
    en: 'Compact areas keep the flight within visual line of sight (VLOS) and battery swaps close to the block.',
  },
  'cp.split.batteryHintB': {
    pt: 'para a desativar/reativar.',
    en: 'to disable/re-enable it.',
  },
  'cp.split.markBaseHint': {
    pt: 'Marque a base para descontar o trânsito ao dimensionar.',
    en: 'Set the base to deduct the transit when sizing.',
  },
  'cp.split.exportHint': {
    pt: 'A exportação WPML gera um ZIP com um KMZ por bloco, numerados pela ordem de voo.',
    en: 'The WPML export produces a ZIP with one KMZ per block, numbered in flight order.',
  },

  /* ---- Terreno (DEM) ---- */
  'cp.terrain.title': {
    pt: 'Terreno (DEM) — Terrain Follow',
    en: 'Terrain (DEM) — Terrain Follow',
  },
  'cp.terrain.loading': { pt: 'A carregar terreno…', en: 'Loading terrain…' },
  'cp.terrain.downloadGlobal': {
    pt: 'Descarregar relevo global (~30 m)',
    en: 'Download global terrain (~30 m)',
  },
  'cp.terrain.importDem': {
    pt: 'Importar MDT (GeoTIFF LiDAR DGT)',
    en: 'Import DTM (DGT LiDAR GeoTIFF)',
  },
  'cp.terrain.importDemTitle': {
    pt: 'MDT LiDAR da DGT (50 cm / 2 m) descarregado do Centro de Dados Geográficos — só é lida a janela da área, mesmo em ficheiros de vários GB',
    en: 'DGT LiDAR DTM (50 cm / 2 m) downloaded from the Centro de Dados Geográficos — only the area window is read, even in multi-GB files',
  },
  'cp.terrain.localDem': { pt: 'MDT local:', en: 'Local DTM:' },
  'cp.terrain.demGrid': {
    pt: '({crs}, grelha ~{res} m)',
    en: '({crs}, ~{res} m grid)',
  },
  'cp.terrain.outOfCoverage': {
    pt: 'A área atual sai fora do relevo carregado — volte a descarregar.',
    en: 'The current area extends beyond the loaded terrain — download it again.',
  },
  'cp.terrain.follow': {
    pt: 'Seguir terreno (AGL constante)',
    en: 'Follow terrain (constant AGL)',
  },
  'cp.terrain.tolerance': { pt: 'Tolerância vertical', en: 'Vertical tolerance' },
  'cp.terrain.result': {
    pt: 'Terreno {min}–{max} m · {n} waypoints com altura própria (ref. {ref} m).',
    en: 'Terrain {min}–{max} m · {n} waypoints with individual heights (ref. {ref} m).',
  },
  'cp.terrain.sourceHint': {
    pt: 'Fonte: Terrarium/AWS (~30 m). As alturas por waypoint são relativas ao ponto de descolagem — marque a base no local real de descolagem e valide no Pilot 2.',
    en: 'Source: Terrarium/AWS (~30 m). Waypoint heights are relative to the takeoff point — set the base at the actual takeoff location and validate in Pilot 2.',
  },

  /* ---- GCPs ---- */
  'cp.gcp.title': { pt: 'GCPs — Pontos de Controlo', en: 'GCPs — Ground Control Points' },
  'cp.gcp.plan': { pt: 'Planear posições de GCPs', en: 'Plan GCP positions' },
  'cp.gcp.count': { pt: 'Número de GCPs', en: 'Number of GCPs' },
  'cp.gcp.auto': { pt: 'Auto', en: 'Auto' },
  'cp.gcp.autoTitle': {
    pt: 'Automático: {n} (≈1 por 5 ha, mín. 5)',
    en: 'Automatic: {n} (≈1 per 5 ha, min. 5)',
  },
  'cp.gcp.info': {
    pt: '{count} GCPs · ~{ha} ha/GCP · espaçamento mín. {spacing}',
    en: '{count} GCPs · ~{ha} ha/GCP · min. spacing {spacing}',
  },
  'cp.gcp.export': { pt: 'Exportar GCPs (KML)', en: 'Export GCPs (KML)' },
  'cp.gcp.hint': {
    pt: 'Heurística bordo + centro (distribuição de erro mínimo na literatura fotogramétrica). Os GCPs também vão no KML simples da área.',
    en: 'Edge + center heuristic (minimum-error distribution in the photogrammetric literature). The GCPs are also included in the simple area KML.',
  },

  'cp.terrain.auto': {
    pt: 'O relevo global descarrega-se automaticamente ao definir a área; o botão serve para recarregar. Um MDT importado tem sempre prioridade.',
    en: 'The global terrain downloads automatically once the area is defined; the button re-loads it. An imported DTM always takes priority.',
  },

  'cp.terrain.profile': {
    pt: 'Perfil de elevação do voo',
    en: 'Flight elevation profile',
  },
  'cp.flight.triggerFast': {
    pt: 'Disparo a cada {s} s — abaixo do mínimo do obturador (~{min} s). Reduza a velocidade para ≤ {vmax} m/s ou baixe a sobreposição frontal.',
    en: 'Shot every {s} s — below the shutter minimum (~{min} s). Reduce speed to ≤ {vmax} m/s or lower the front overlap.',
  },

  /* ---- Presets de missão ---- */
  'cp.preset.label': { pt: 'Preset de missão', en: 'Mission preset' },
  'cp.preset.custom': { pt: 'Personalizado', en: 'Custom' },
  'cp.preset.hint': {
    pt: 'Escolha um tipo de levantamento para aplicar sobreposições, velocidade, gimbal e dupla grelha recomendados.',
    en: 'Pick a survey type to apply the recommended overlaps, speed, gimbal and crosshatch.',
  },
}
