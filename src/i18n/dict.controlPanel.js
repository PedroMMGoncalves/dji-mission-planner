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
  'cp.mission.namePlaceholder': { pt: 'nome-da-missao', en: 'mission-name' },
  'cp.mission.nameHintA': {
    pt: 'Nome dos ficheiros exportados',
    en: 'Name of the exported files',
  },
  'cp.mission.nameHintB': {
    pt: 'e da missão no DJI Pilot 2.',
    en: 'and of the mission in DJI Pilot 2.',
  },
  'cp.mission.save': { pt: 'Guardar projecto', en: 'Save project' },
  'cp.mission.saveTitle': {
    pt: 'Descarregar o projecto completo (.json)',
    en: 'Download the complete project (.json)',
  },
  'cp.mission.open': { pt: 'Abrir projecto', en: 'Open project' },
  'cp.mission.openTitle': {
    pt: 'Abrir um projecto guardado (.json)',
    en: 'Open a saved project (.json)',
  },
  'cp.mission.autosave': {
    pt: 'O trabalho é gravado automaticamente neste browser.',
    en: 'Your work is saved automatically in this browser.',
  },

  /* ---- Drone / Sensor ---- */
  'cp.drone.rtk': { pt: 'Posicionamento RTK activo', en: 'RTK positioning active' },
  'cp.drone.rtkHint': {
    pt: 'Reduz o erro de posição de ±0,5 / ±1,5 m (GNSS) para centímetros nos intervalos de GSD e sobreposição.',
    en: 'Narrows the position error from ±0.5 / ±1.5 m (GNSS) to centimetres in the GSD and overlap ranges.',
  },
  'cp.drone.payload': { pt: 'Payload / Sensor', en: 'Payload / Sensor' },
  'cp.drone.lidarSpecs': {
    pt: '{desc} · FOV nominal {fov}° · tecto operacional {agl} m AGL',
    en: '{desc} · nominal FOV {fov}° · operational ceiling {agl} m AGL',
  },
  'cp.drone.effectiveFov': { pt: 'FOV de trabalho', en: 'Working FOV' },
  'cp.drone.effectiveFovReset': { pt: 'Nominal', en: 'Nominal' },
  'cp.drone.effectiveFovResetTitle': {
    pt: 'Voltar ao FOV nominal do sensor ({fov}°)',
    en: 'Back to the sensor nominal FOV ({fov}°)',
  },
  /* ---- Pontos de inspecção (R2.9) ---- */
  // o nome da acção, o mesmo no cartão 6 e na barra sobre o mapa («Inspecção»)
  'cp.inspect.mark': { pt: 'Marcar pontos de inspecção', en: 'Place inspection points' },
  'cp.inspect.markTitle': {
    pt: 'Cada clique no mapa acrescenta um ponto de inspecção; volte a carregar para terminar',
    en: 'Each map click adds an inspection point; press again to finish',
  },
  'cp.inspect.markHint': {
    pt: 'Clique no mapa para acrescentar pontos. Arraste um marcador para o mover.',
    en: 'Click the map to add points. Drag a marker to move it.',
  },
  'cp.inspect.height': { pt: 'altura', en: 'hgt' },
  'cp.inspect.heightTitle': {
    pt: 'Altura acima do ponto de descolagem, em metros',
    en: 'Height above the take-off point, in metres',
  },
  'cp.inspect.heading': { pt: 'rumo', en: 'hdg' },
  'cp.inspect.headingTitle': {
    pt: 'Rumo fixo em graus; vazio = segue a rota',
    en: 'Fixed heading in degrees; empty = follows the route',
  },
  'cp.inspect.pitch': { pt: 'pitch', en: 'pitch' },
  'cp.inspect.pitchTitle': {
    pt: 'Inclinação (pitch) do gimbal neste ponto; vazio = mantém o anterior',
    en: 'Gimbal pitch at this point; empty = keeps the previous one',
  },
  'cp.inspect.photo': { pt: 'Fotografar neste ponto', en: 'Take a photo at this point' },
  'cp.inspect.suggest': { pt: 'Sugerir ordem', en: 'Suggest order' },
  'cp.inspect.suggestTitle': {
    pt: 'Reordena por vizinho-mais-próximo a partir da base (ou do 1.º ponto)',
    en: 'Reorders by nearest neighbour starting at the base (or the 1st point)',
  },
  'cp.inspect.export': { pt: 'Exportar KMZ', en: 'Export KMZ' },
  'cp.inspect.noTerrain': {
    pt: 'Sem relevo sob os pontos: a exportação fica disponível quando o relevo os cobrir (é descarregado automaticamente; ou importe um MDT).',
    en: 'No terrain under the points: export becomes available once terrain covers them (it downloads on its own; or import a DTM).',
  },
  'cp.inspect.hint': {
    pt: 'Missão própria, independente da grelha: rumo e inclinação por ponto, uma foto por ponto marcado. As alturas são relativas ao ponto de descolagem.',
    en: 'A mission of its own, independent of the grid: per-point heading and pitch, one photo per marked point. Heights are relative to the take-off point.',
  },
  'cp.terrain.slopeHint': {
    pt: 'Declive médio de {slope}°, a descer para {az}°. Em encostas íngremes, com seguimento do terreno: faixas ao longo das curvas de nível ({lines}°). Mantenha a câmara a nadir: com o rumo da aeronave a seguir a rota, uma câmara oblíqua inclinar-se-ia ao longo da curva de nível, não para a encosta.',
    en: 'Mean slope of {slope}° descending towards {az}°. For steep slopes with terrain following: lines along the contours ({lines}°). Keep the camera at nadir: with the aircraft heading following the route, an oblique camera would tilt along the contour, not towards the slope.',
  },
  'cp.terrain.slopeApplyLines': { pt: 'Faixas a {lines}°', en: 'Lines at {lines}°' },
  'cp.orientation.optimal': { pt: 'Óptima', en: 'Optimal' },
  'cp.orientation.optimalTitle': {
    pt: 'Procura a direcção com menos faixas dentro do polígono real (menos viragens, menos tempo)',
    en: 'Searches for the direction with the fewest lines inside the real polygon (fewer turns, less time)',
  },
  'cp.orientation.includeNadir': {
    pt: 'Passagem nadir extra (ortomosaico)',
    en: 'Extra nadir pass (orthomosaic)',
  },
  'cp.orientation.includeNadirHint': {
    pt: 'Terceira grelha na direcção da primeira, voada no fim com a câmara a −90°: garante o ortomosaico além do modelo 3D. Conta para o tempo, blocos e bateria; o GSD mostrado passa a ser o nadir (a resolução que condiciona o ortomosaico).',
    en: 'Third grid along the first direction, flown last with the camera at −90°: ensures the orthomosaic as well as the 3D model. Counts towards time, blocks and battery; the displayed GSD becomes the nadir one (the resolution that governs the orthomosaic).',
  },
  'cp.orientation.tieLine': {
    pt: 'Faixa transversal de amarração',
    en: 'Perpendicular tie line',
  },
  'cp.orientation.tieLineHint': {
    pt: 'Uma passagem extra a meio do bloco, perpendicular às faixas e voada em último lugar — cruza todas as faixas, para o ajuste de faixas LiDAR (strip adjustment).',
    en: 'One extra pass across the middle of the block, perpendicular to the lines and flown last — it crosses every line, for LiDAR strip adjustment.',
  },
  'cp.flight.overshoot': { pt: 'Prolongamento por faixa', en: 'Per-line overshoot' },
  'cp.flight.overshootHint': {
    pt: 'Prolonga cada faixa nos dois extremos: as viragens ficam fora da área e os dados dentro dela são captados a velocidade e atitude estáveis. Sugerido 10–20 m para LiDAR; 0 desliga. Conta para o tempo e para os blocos.',
    en: 'Extends every line at both ends: turns happen outside the area and in-area data is captured at stable speed and attitude. Suggested 10–20 m for LiDAR; 0 disables. Counts towards time and block budgets.',
  },
  'cp.flight.aglCapWarn': {
    pt: 'O payload {payload} tem tecto operacional de {cap} m AGL e a rota chega a ~{worst} m sobre o terreno. Reduza a altura de voo.',
    en: 'The {payload} payload is rated to {cap} m AGL and the route reaches ~{worst} m above ground. Lower the flight height.',
  },
  'cp.drone.effectiveFovHint': {
    pt: 'Ângulo útil do feixe: a largura de varrimento e o espaçamento usam este ângulo. Os bordos do feixe têm mais ruído — é comum voar com um ângulo mais estreito do que o nominal.',
    en: 'Working beam angle: swath and spacing use this angle. Beam edges are noisier — flying a narrower angle than nominal is common practice.',
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
  'cp.flight.altitudeRel': { pt: 'Altura acima da descolagem', en: 'Height above take-off' },
  'cp.flight.altitudeTf': {
    pt: 'Altura AGL (segue o terreno)',
    en: 'AGL height (follows terrain)',
  },
  'cp.flight.aglOverArea': {
    pt: 'Sobre a área: {range} m acima do solo (sem seguir terreno, a altura é fixa em relação à descolagem).',
    en: 'Over the area: {range} m above ground (without terrain following, the height is fixed relative to take-off).',
  },
  'cp.flight.gsdTarget': { pt: 'GSD alvo', en: 'Target GSD' },
  'cp.flight.altWarnPre': { pt: 'Acima de', en: 'Above' },
  'cp.flight.altWarnPost': {
    pt: '— excede o limite geral da categoria aberta (UE): é preciso operar na categoria específica, com autorização operacional.',
    en: '— exceeds the general Open category limit (EU): operate in the Specific category, with an operational authorisation.',
  },
  'cp.flight.speed': { pt: 'Velocidade', en: 'Speed' },
  'cp.flight.frontOverlap': { pt: 'Sobreposição frontal', en: 'Forward overlap' },
  'cp.flight.sideOverlap': { pt: 'Sobreposição lateral', en: 'Side overlap' },
  'cp.flight.manualSpacing': {
    pt: 'Espaçamento manual entre faixas',
    en: 'Manual line spacing',
  },
  'cp.flight.lineDistance': { pt: 'Espaçamento entre faixas', en: 'Line spacing' },
  'cp.flight.triggerBy': { pt: 'Disparo por', en: 'Trigger by' },
  'cp.flight.triggerDistance': { pt: 'Distância', en: 'Distance' },
  'cp.flight.triggerTime': { pt: 'Tempo', en: 'Time' },
  'cp.flight.triggerWaypoint': { pt: 'Waypoint', en: 'Waypoint' },
  'cp.flight.triggerWaypointHint': {
    pt: 'Uma foto por waypoint: cada faixa é densificada a passos iguais ≤ intervalo, cada ponto leva uma acção de foto e o prolongamento não dispara. Não há disparo por distância; a paragem em cada ponto escolhe-se em «Paragem nos waypoints». Com «Seguir terreno», os pontos de foto passam a fazer parte da rota que segue o relevo, à altura do perfil voado.',
    en: 'One photo per waypoint: each line is densified at equal steps ≤ interval, every point carries a take-photo action and the overshoot does not trigger. There is no distance trigger; stopping at each point is set in “Stop at waypoints”. With “Follow terrain”, the photo points become part of the terrain-following route, at the height of the flown profile.',
  },
  'cp.flight.stops': { pt: 'Paragem nos waypoints', en: 'Stop at waypoints' },
  'cp.flight.stopsCorners': { pt: 'Só nos cantos', en: 'Corners only' },
  'cp.flight.stopsAll': { pt: 'Em todos', en: 'At every waypoint' },
  // a dica da escolha feita, e o que o KMZ leva nesses pontos à parte
  'cp.flight.stopsHintCorners': {
    pt: 'A aeronave pára no fim de cada faixa e passa sem parar pelas fotos e pelos vértices do terreno («Turns before waypoint. Flies through» no Pilot 2).',
    en: 'The aircraft stops at the end of each line and flies through the photo points and terrain vertices (Pilot 2’s “Turns before waypoint. Flies through”).',
  },
  'cp.flight.stopsHintAll': {
    pt: 'A aeronave pára em cada waypoint (pouca luz, exposições longas), e o tempo previsto conta as paragens.',
    en: 'The aircraft stops at every waypoint (low light, long exposures), and the estimated time counts the stops.',
  },
  'cp.flight.stopsKmzCorners': { pt: 'No KMZ, nesses pontos:', en: 'In the KMZ, at those points:' },
  'cp.flight.stopsKmzAll': { pt: 'No KMZ:', en: 'In the KMZ:' },
  'cp.flight.waypointWarn': {
    pt: '{n} waypoints num só bloco — acima de 2000 a importação no Pilot 2 fica lenta; aumente o intervalo ou divida em blocos.',
    en: '{n} waypoints in a single block — above 2000 the Pilot 2 import gets slow; increase the interval or split into blocks.',
  },
  'cp.flight.gimbalPitch': { pt: 'Inclinação do gimbal', en: 'Gimbal pitch' },
  'cp.flight.gimbalHint': {
    pt: '−90° = nadir (2D) · −60°/−45° = oblíqua, para reconstrução 3D',
    en: '−90° = nadir (2D) · −60°/−45° = oblique, for 3D reconstruction',
  },

  /* ---- Orientação das linhas ---- */
  'cp.orientation.title': { pt: 'Orientação das faixas', en: 'Flight Line Orientation' },
  'cp.orientation.azimuthHint': {
    pt: 'Azimute das faixas: 0° = Norte–Sul · 90° = Este–Oeste',
    en: 'Flight line azimuth: 0° = North–South · 90° = East–West',
  },
  'cp.orientation.group': {
    pt: 'Orientação em relação ao bloco',
    en: 'Orientation relative to the block',
  },
  'cp.orientation.parallel': { pt: 'Paralelas', en: 'Parallel' },
  // o rótulo curto do botão; o nome e a dica dizem o resto
  'cp.orientation.perpendicular': { pt: 'Perpendiculares', en: 'Perpendicular' },
  'cp.orientation.perpendicularShort': { pt: 'Perpend.', en: 'Perpend.' },
  'cp.orientation.oblique45': { pt: 'Oblíquas 45°', en: 'Oblique 45°' },
  'cp.orientation.relativeTitle': {
    pt: 'Direcção relativa à orientação do bloco (ou ao lado mais longo do polígono)',
    en: 'Direction relative to the block orientation (or to the longest edge of the polygon)',
  },
  'cp.orientation.reference': {
    pt: 'Referência: {deg}° — orientação do bloco / lado mais longo',
    en: 'Reference: {deg}° — block orientation / longest edge',
  },
  'cp.orientation.crosshatch': {
    pt: 'Dupla grelha perpendicular (crosshatch, 3D)',
    en: 'Perpendicular crosshatch (3D)',
  },
  'cp.orientation.crosshatchHint': {
    pt: 'Segunda passagem a {deg}°. Duplica o tempo de voo — os blocos por bateria são redimensionados. Sugere-se gimbal a −60°.',
    en: 'Second pass at {deg}°. Doubles the flight time — the per-battery blocks are resized. A gimbal pitch of −60° is recommended.',
  },

  /* ---- Expansão (buffer) ---- */
  'cp.buffer.title': {
    pt: 'Margem da área (buffer)',
    en: 'Area buffer',
  },
  'cp.buffer.metres': {
    pt: '= {m} m para cada lado ({pct} % de √área ÷ 2; o Pilot 2 e o UgCS pedem metros)',
    en: '= {m} m on each side ({pct} % of √area ÷ 2; Pilot 2 and UgCS ask for metres)',
  },
  // com a área dividida, a margem lê-se pelo bloco (cellBuffersM): cada um
  // entra metade no vizinho, e os dois voam em comum {pct} % do lado
  'cp.buffer.blocks': {
    pt: '= {m} m para cada lado de cada bloco ({pct} % do lado de {s} m ÷ 2): dois blocos vizinhos voam {o} m em comum, às riscas no mapa',
    en: '= {m} m on each side of every block ({pct} % of the {s} m side ÷ 2): two neighbouring blocks fly {o} m in common, striped on the map',
  },
  'cp.buffer.cells': {
    pt: '= {m} m para cada lado de cada bloco ({pct} % de √área do bloco ÷ 2): dois blocos vizinhos voam {o} m em comum, às riscas no mapa',
    en: '= {m} m on each side of every block ({pct} % of the block’s √area ÷ 2): two neighbouring blocks fly {o} m in common, striped on the map',
  },
  'cp.buffer.cellsRange': {
    pt: '= {m} a {m2} m para cada lado, conforme o bloco ({pct} % de √área de cada bloco ÷ 2); onde dois blocos voam em comum, às riscas no mapa',
    en: '= {m} to {m2} m on each side, depending on the block ({pct} % of each block’s √area ÷ 2); where two blocks fly in common, striped on the map',
  },
  'cp.inspect.moveUp': { pt: 'Subir o ponto {n} na ordem', en: 'Move point {n} up' },
  'cp.inspect.moveDown': { pt: 'Descer o ponto {n} na ordem', en: 'Move point {n} down' },
  'cp.inspect.remove': { pt: 'Retirar o ponto {n}', en: 'Remove point {n}' },

  /* ---- Área de levantamento ---- */
  // por baixo de «Importar área»: o que se importa, ou desenhar
  'cp.area.drawOnMap': {
    pt: 'KML · GeoJSON · SHP (.zip) · KMZ WPML, ou desenhe a área na barra sobre o mapa (Polígono, Rectângulo ou Quadrado).',
    en: 'KML · GeoJSON · SHP (.zip) · WPML KMZ, or draw the area with the bar over the map (Polygon, Rectangle or Square).',
  },
  'cp.area.polygon': { pt: 'Polígono', en: 'Polygon' },
  // dicas da barra sobre o mapa: sem o nome da forma, que a barra lhes junta
  // quando o mostra só no ícone (num mapa estreito)
  'cp.area.polygonTitle': {
    pt: 'Livre, clique a clique no mapa',
    en: 'Free-form, click by click on the map',
  },
  'cp.area.rect': { pt: 'Rectângulo', en: 'Rectangle' },
  'cp.area.rectTitle': {
    pt: 'Centrado num ponto (comprimento × largura)',
    en: 'Centred on a point (length × width)',
  },
  'cp.area.square': { pt: 'Quadrado', en: 'Square' },
  'cp.area.squareTitle': {
    pt: 'Centrado num ponto (lado único)',
    en: 'Centred on a point (single side)',
  },
  'cp.area.import': { pt: 'Importar área', en: 'Import area' },
  'cp.area.importHoles': {
    pt: 'O polígono tem {n} anel(is) interior(es): os buracos ficam fora do plano e não são editáveis.',
    en: 'The polygon has {n} inner ring(s): holes are excluded from the plan and cannot be edited.',
  },
  'cp.area.importUseAll': { pt: 'Usar todas as partes como células', en: 'Use all parts as cells' },
  'cp.area.importCrsHint': {
    pt: 'O ficheiro declara {crs}, que não está na lista; escolha o SRC equivalente ou reexporte em PT-TM06.',
    en: 'The file declares {crs}, which is not in the list; pick the equivalent CRS or re-export in PT-TM06.',
  },
  'cp.area.importDiscarded': {
    pt: 'O ficheiro traz {n} polígono(s) a mais: usou-se o maior. Para os voar todos, use-os como células (botão abaixo) ou importe-os como projectos separados.',
    en: '{n} extra polygon(s) in the file: the largest one was used. To fly them all, use them as cells (button below) or import them as separate projects.',
  },
  'cp.area.importTitle': {
    pt: 'Importar área de ficheiro KML, GeoJSON ou Shapefile comprimido (.zip)',
    en: 'Import an area from a KML, GeoJSON or zipped Shapefile',
  },
  'cp.area.crsPrompt': {
    pt: 'coordenadas projectadas detectadas. Escolha o sistema de coordenadas de origem:',
    en: 'projected coordinates detected. Choose the source coordinate reference system:',
  },
  'cp.area.convert': { pt: 'Converter', en: 'Convert' },
  'cp.area.cancel': { pt: 'Cancelar', en: 'Cancel' },
  // o nome da acção, o mesmo no cartão 5 e na barra sobre o mapa («Base»)
  'cp.area.markBase': { pt: 'Marcar base', en: 'Set base' },
  'cp.area.baseTitle': {
    pt: 'Marcar o ponto de descolagem / posição do piloto',
    en: 'Set the take-off point / pilot position',
  },
  'cp.area.removeBase': { pt: 'Remover base', en: 'Remove base' },
  // os rótulos curtos na secção 5, ao lado de «Propor bases» (o nome e a
  // dica dos botões são os de cima)
  'cp.area.markBaseShort': { pt: 'Marcar', en: 'Set' },
  'cp.area.removeBaseShort': { pt: 'Remover', en: 'Remove' },
  'cp.area.baseHint': {
    pt: 'Clique no mapa para acrescentar uma base (A, B, C...; arrastável). Cada base é uma zona: as alturas dos seus blocos referem-se à cota mais baixa dela.',
    en: 'Click on the map to add a base (A, B, C...; draggable). Each base is a zone: the heights of its blocks refer to its lowest elevation.',
  },
  'cp.area.drawHintA': {
    pt: 'Clique no mapa para adicionar vértices ({n}).',
    en: 'Click on the map to add vertices ({n}).',
  },
  'cp.area.drawHintB': {
    pt: 'removem o último vértice ·',
    en: 'remove the last vertex ·',
  },
  'cp.area.drawHintFirst': { pt: 'clique no primeiro vértice', en: 'click the first vertex' },
  'cp.area.drawHintDblClick': { pt: 'duplo clique', en: 'double-click' },
  'cp.area.drawHintC': {
    pt: '(esquerdo ou direito) ou «Concluir» para fechar · Esc cancela.',
    en: '(left or right) or “Finish” to close · Esc cancels.',
  },
  'cp.area.undoVertex': { pt: 'Anular último', en: 'Undo last' },
  'cp.area.finish': { pt: 'Concluir', en: 'Finish' },
  'cp.area.anchorHint': {
    pt: 'Clique no mapa para definir o centro. A forma ajusta-se aos valores abaixo.',
    en: 'Click on the map to set the centre point. The shape adjusts to the values below.',
  },
  'cp.area.quickSizes': { pt: 'Tamanhos rápidos', en: 'Quick sizes' },
  'cp.area.sizeTitle': { pt: '{s}×{s} m', en: '{s}×{s} m' },
  'cp.area.sizeTitleBattery': {
    pt: '{s}×{s} m (≈{min} min com os parâmetros actuais)',
    en: '{s}×{s} m (≈{min} min with the current parameters)',
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
  'cp.area.rows': { pt: 'Filas (⊥ orientação)', en: 'Rows (⊥ orientation)' },
  'cp.area.gridHint': {
    pt: 'Com mais de 1 célula, cada célula torna-se um bloco de voo numerado (ex.: 3×2 quadrados de 250 m = 6 blocos; para os dimensionar pela bateria use a divisão «Bateria», cartão 4). Use a margem da área para criar sobreposição entre células.',
    en: 'With more than 1 cell, each cell becomes a numbered flight block (e.g. 3×2 squares of 250 m = 6 blocks; to size them by battery use the “Battery” split, card 4). Use the area buffer to create overlap between cells.',
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
    pt: 'foram detectadas auto-intersecções (marcadas a vermelho no mapa). Arraste os vértices para corrigir a geometria antes de gerar as linhas de voo.',
    en: 'self-intersections were detected (marked in red on the map). Drag the vertices to fix the geometry before generating the flight lines.',
  },
  'cp.area.planError.cell-uncovered': {
    pt: 'As células {cells} da grelha ficaram sem faixas — a missão NÃO cobre toda a área desenhada. Ajuste o espaçamento, a orientação ou o tamanho das células.',
    en: 'Grid cells {cells} received no flight lines — the mission does NOT cover the whole drawn area. Adjust the spacing, the orientation or the cell size.',
  },
  'cp.area.planError.crosshatch-failed': {
    pt: 'A segunda grelha (perpendicular) não pôde ser gerada — sem dupla grelha a missão não sai. Ajuste o espaçamento ou a área.',
    en: 'The second (perpendicular) grid could not be generated — no mission without the crosshatch. Adjust the spacing or the area.',
  },
  'cp.area.planError.nadir-failed': {
    pt: 'A passagem nadir extra não pôde ser gerada — a missão não sai sem ela. Ajuste o espaçamento ou desligue a passagem nadir.',
    en: 'The extra nadir pass could not be generated — no mission without it. Adjust the spacing or switch the nadir pass off.',
  },
  'cp.area.tooManyLines': {
    pt: 'O espaçamento calculado gera faixas em excesso (>2500). Aumente a altura de voo, reduza a sobreposição lateral ou diminua a área.',
    en: 'The computed spacing produces too many flight lines (>2500). Increase the flight height, reduce the side overlap or shrink the area.',
  },

  /* ---- Divisão em blocos de voo ---- */
  'cp.split.gridActive': {
    pt: 'Grelha de blocos activa: cada célula é um bloco de voo. A divisão em voos (Faixas, Bateria ou Quadrícula) aplica-se apenas a áreas sem grelha de blocos.',
    en: 'Block grid active: each cell is a flight block. Splitting into flights (Lines, Battery or Tiles) applies only to areas without a block grid.',
  },
  'cp.split.modeNone': { pt: 'Nenhuma', en: 'None' },
  'cp.split.modeArea': { pt: 'Faixas', en: 'Lines' },
  'cp.split.modeBattery': { pt: 'Bateria', en: 'Battery' },
  'cp.split.modeTiles': { pt: 'Quadrícula', en: 'Tiles' },
  'cp.split.tileSideLabel': { pt: 'Lado do quadrado', en: 'Square side' },
  'cp.split.customSide': { pt: 'Lado personalizado', en: 'Custom side' },
  'cp.split.meshOrientation': { pt: 'Orientação da quadrícula', en: 'Tile orientation' },
  'cp.split.undo': { pt: 'Anular (Ctrl+Z)', en: 'Undo (Ctrl+Z)' },
  'cp.split.undoTitle': {
    pt: 'Anular a última edição: área, células ou bases (Ctrl+Z)',
    en: 'Undo the last edit: area, cells or bases (Ctrl+Z)',
  },
  'cp.split.restoreAll': { pt: 'Reactivar todas', en: 'Re-enable all' },
  'cp.split.tilesHintA': {
    pt: 'O polígono é coberto por quadrados recortados pelo contorno; as tiras pequenas juntam-se ao vizinho.',
    en: 'The polygon is covered by squares clipped to its outline; small slivers are merged into a neighbour.',
  },
  'cp.split.clickCell': {
    pt: 'Clique numa célula no mapa',
    en: 'Click a cell on the map',
  },
  'cp.split.tilesHintB': {
    pt: 'para a desactivar/reactivar (Ctrl+Z anula). Cada célula activa é um bloco de voo numerado.',
    en: 'to disable/re-enable it (Ctrl+Z undoes). Each active cell is a numbered flight block.',
  },
  'cp.split.cellsGenerated': { pt: '{n} células geradas', en: '{n} cells generated' },
  'cp.split.cells': { pt: '{n} células', en: '{n} cells' },
  'cp.split.cellsActive': { pt: ', {n} activas', en: ', {n} active' },
  'cp.split.tooManyCellsTile': {
    pt: 'Demasiadas células (>400). Aumente o lado do quadrado.',
    en: 'Too many cells (>400). Increase the square side.',
  },
  'cp.split.tooManyCellsBattery': {
    pt: 'Demasiadas células (>400). Aumente o tempo útil por voo ou o «Lado máx. (VLOS)».',
    en: 'Too many cells (>400). Increase the usable time per flight or the “Max. side (VLOS)”.',
  },
  'cp.split.maxAreaPerBlock': { pt: 'Área máx. por bloco', en: 'Max. area per block' },
  'cp.split.maxSide': { pt: 'Lado máx. (VLOS)', en: 'Max. side (VLOS)' },
  'cp.split.squareBlocks': { pt: 'Blocos quadrados de', en: 'Square blocks of' },
  'cp.split.batteryUse': {
    pt: ', dimensionados para {min} min úteis por voo',
    en: ', sized for {min} usable min per flight',
  },
  'cp.split.batteryHintA': {
    pt: 'Áreas compactas mantêm o voo dentro da distância VLOS e a troca de baterias perto do bloco.',
    en: 'Compact areas keep the flight within visual line of sight (VLOS) and battery swaps close to the block.',
  },
  'cp.split.batteryHintB': {
    pt: 'para a desactivar/reactivar.',
    en: 'to disable/re-enable it.',
  },
  'cp.split.markBaseHint': {
    pt: 'Marque ou proponha as bases: a deslocação de cada bloco conta a partir da sua.',
    en: 'Set or propose the bases: each block’s transit counts from its own.',
  },
  'cp.split.exportHint': {
    pt: 'A exportação WPML gera um ZIP com um KMZ por voo, pela ordem de voo e com o rótulo do voo no nome (…_A-1.kmz), cada um com as alturas referidas à zona da sua base. Os voos de uma só base, ou um só voo, exportam-se no cartão 7 (Resumo e exportar).',
    en: 'The WPML export produces a ZIP with one KMZ per flight, in flight order and named after the flight (…_A-1.kmz), each with heights referred to its base zone. One base’s flights, or a single flight, are exported from card 7 (Summary and export).',
  },

  /* ---- Terreno (DEM) ---- */
  'cp.terrain.loading': { pt: 'A carregar o relevo…', en: 'Loading terrain…' },
  'cp.terrain.rememberedDtm': {
    pt: 'Este projecto usou o MDT «{file}». O ficheiro não fica no projecto: importe-o de novo para o usar.',
    en: 'This project used the DTM “{file}”. The file is not stored in the project: import it again to use it.',
  },
  'cp.terrain.rememberedDsm': {
    pt: 'Este projecto usou o MDS «{file}». O ficheiro não fica no projecto: importe-o de novo e volta a ser tratado como MDS.',
    en: 'This project used the DSM “{file}”. The file is not stored in the project: import it again and it is treated as a DSM again.',
  },
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
  'cp.terrain.localDsm': { pt: 'MDS local:', en: 'Local DSM:' },
  'cp.terrain.surface': { pt: 'Este ficheiro é:', en: 'This file is:' },
  'cp.terrain.surfaceDtm': { pt: 'MDT · terreno', en: 'DTM · terrain' },
  'cp.terrain.surfaceDsm': { pt: 'MDS · superfície', en: 'DSM · surface' },
  'cp.terrain.surfaceHint': {
    pt: 'MDT: só o solo nu (ex. LiDAR da DGT). MDS: com a vegetação, as construções e as escombreiras (ex. o último voo da equipa). As bacias de visão somam a vegetação e os obstáculos da missão só a um MDT.',
    en: 'DTM: bare ground (e.g. DGT LiDAR). DSM: with vegetation, buildings and spoil heaps (e.g. the team’s last flight). The viewsheds add the mission’s vegetation and obstacle height only to a DTM.',
  },
  'cp.terrain.demGrid': {
    pt: '({crs}, grelha ~{res} m)',
    en: '({crs}, ~{res} m grid)',
  },
  'cp.terrain.outOfCoverage': {
    pt: 'A área actual sai fora do relevo carregado — volte a descarregar o relevo global ou importe um MDT que a cubra.',
    en: 'The current area extends beyond the loaded terrain — download the global terrain again or import a DTM that covers it.',
  },
  'cp.terrain.follow': {
    pt: 'Seguir terreno (AGL constante)',
    en: 'Follow terrain (constant AGL)',
  },
  'cp.terrain.tolerance': { pt: 'Tolerância vertical', en: 'Vertical tolerance' },
  /* ---- erros do seguimento de terreno, por código (M3-C8) ---- */
  'cp.terrain.err.ref-outside-terrain': {
    pt: 'Sem cota de referência: nem a base nem a rota estão sobre o relevo carregado. Carregue relevo que cubra a base ou a rota.',
    en: 'No reference elevation: neither the base nor the route lies on the loaded terrain. Load terrain that covers the base or the route.',
  },
  'cp.terrain.err.no-plan': {
    pt: 'Sem plano: não há faixas para seguir o terreno.',
    en: 'No plan: there are no lines to follow the terrain with.',
  },
  'cp.terrain.err.terrain-failed': {
    pt: 'Falha no seguimento do terreno: {msg}',
    en: 'Terrain following failed: {msg}',
  },
  'cp.terrain.result': {
    pt: 'Cotas do terreno {range} m · {n} waypoints com altura própria (cota de referência {ref} m).',
    en: 'Terrain elevation {range} m · {n} waypoints with individual heights (reference elevation {ref} m).',
  },
  'cp.terrain.sourceHint': {
    pt: 'Fonte: Terrarium/AWS (~30 m). As alturas por waypoint são relativas ao ponto de descolagem — marque a base no local real de descolagem e valide no Pilot 2.',
    en: 'Source: Terrarium/AWS (~30 m). Waypoint heights are relative to the take-off point — set the base at the actual take-off location and validate in Pilot 2.',
  },
  'cp.terrain.cacheHint': {
    pt: '{hits} de {total} tiles vieram da cache local (as áreas já vistas carregam sem rede).',
    en: '{hits} of {total} tiles came from the local cache (areas seen before load without network).',
  },
  'cp.terrain.datum': {
    pt: 'Datum vertical: {datum}. As alturas exportadas são diferenças de cotas da mesma fonte, pelo que um desvio constante do datum se anula.',
    en: 'Vertical datum: {datum}. Exported heights are differences of elevations from the same source, so a constant datum offset cancels out.',
  },
  'cp.terrain.datumOrtho': { pt: 'ortométrico, {model}', en: 'orthometric, {model}' },
  'cp.terrain.datumEllip': { pt: 'ELIPSOIDAL, {model}', en: 'ELLIPSOIDAL, {model}' },
  'cp.terrain.datumUnknown': {
    pt: 'não declarado (assumido ortométrico)',
    en: 'not declared (assumed orthometric)',
  },
  'cp.terrain.datumAssumed': { pt: ' (assumido)', en: ' (assumed)' },
  'cp.terrain.datumUnit': {
    pt: ', valores em {unit} convertidos para metros',
    en: ', values in {unit} converted to metres',
  },
  'cp.terrain.datumEllipWarn': {
    pt: 'O MDT declara alturas elipsoidais: não misture com fontes ortométricas (Terrarium, MDT DGT) na mesma missão; a referência das alturas relativas continua a ser este ficheiro.',
    en: 'The DTM declares ellipsoidal heights: do not mix with orthometric sources (Terrarium, DGT DTM) in the same mission; relative heights are still referenced to this file.',
  },
  'cp.terrain.sourceHintFile': {
    pt: 'Fonte: MDT local {label} ({res} m). As alturas por waypoint são relativas ao ponto de descolagem — marque a base no local real de descolagem e valide no Pilot 2.',
    en: 'Source: local DTM {label} ({res} m). Waypoint heights are relative to the take-off point — set the base at the actual take-off location and validate in Pilot 2.',
  },

  /* ---- GCPs ---- */
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
  'cp.gcp.manual': {
    pt: '{n} alvo(s) movido(s) à mão no mapa; os outros seguem a heurística.',
    en: '{n} target(s) moved by hand on the map; the others follow the heuristic.',
  },
  'cp.gcp.reset': { pt: 'Repor posições', en: 'Reset positions' },
  'cp.gcp.hint': {
    pt: 'Heurística bordo + centro (distribuição de erro mínimo na literatura fotogramétrica). Arraste um alvo no mapa para o afinar; o ponto fica no projecto.',
    en: 'Edge + centre heuristic (minimum-error distribution in the photogrammetric literature). Drag a target on the map to adjust it; the point is kept in the project.',
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
    pt: 'Disparo a cada {s} s — abaixo do intervalo mínimo da câmara (~{min} s). Reduza a velocidade para ≤ {vmax} m/s ou baixe a sobreposição frontal.',
    en: 'Shot every {s} s — below the camera’s minimum interval (~{min} s). Reduce speed to ≤ {vmax} m/s or lower the forward overlap.',
  },

  /* ---- Presets de missão ---- */
  'cp.preset.label': { pt: 'Tipo de levantamento', en: 'Survey type' },
  'cp.preset.custom': { pt: 'Personalizado', en: 'Custom' },
  'cp.preset.hint': {
    pt: 'Escolha um tipo de levantamento para aplicar sobreposições, velocidade, gimbal e dupla grelha recomendados.',
    en: 'Pick a survey type to apply the recommended overlaps, speed, gimbal and crosshatch.',
  },

  /* ---- Intervalo manual, rumo fixo e espera nos pontos de inspecção ---- */
  'cp.flight.manualInterval': { pt: 'Intervalo de disparo manual', en: 'Manual trigger interval' },
  'cp.flight.intervalValue': { pt: 'Intervalo de disparo', en: 'Trigger interval' },
  'cp.flight.intervalOverlap': {
    pt: 'Sobreposição frontal resultante: {pct} % ({m} m entre fotos); o campo da sobreposição frontal deixa de contar.',
    en: 'Resulting forward overlap: {pct} % ({m} m between photos); the forward overlap field no longer applies.',
  },
  'cp.flight.intervalOverlapLow': {
    pt: 'Abaixo de 60 % a reconstrução perde robustez.',
    en: 'Below 60 % the reconstruction loses robustness.',
  },
  'cp.flight.headingMode': { pt: 'Rumo da aeronave', en: 'Aircraft heading' },
  'cp.flight.headingRoute': { pt: 'Segue a rota', en: 'Follows the route' },
  'cp.flight.headingFixed': { pt: 'Fixo', en: 'Fixed' },
  'cp.flight.headingDeg': { pt: 'Rumo fixo', en: 'Fixed heading' },
  'cp.flight.headingHintRoute': {
    pt: 'As faixas alternam a direcção de vista; «Fixo» mantém as oblíquas viradas para o mesmo lado.',
    en: 'Lines alternate the viewing direction; “Fixed” keeps the obliques facing the same way.',
  },
  'cp.flight.headingHintFixed': {
    pt: 'A câmara aponta sempre para o mesmo lado, seja qual for o sentido da faixa: oblíquas viradas para a encosta, e cada direcção de vista com a sobreposição lateral pedida. Sai como smoothTransition com o mesmo ângulo em todos os waypoints.',
    en: 'The camera always points the same way, whatever the direction of the line: obliques facing the slope, and each viewing direction with the requested side overlap. Written as smoothTransition with the same angle at every waypoint.',
  },
  'cp.inspect.hover': { pt: 'Espera', en: 'Wait' },
  'cp.inspect.hoverTitle': {
    pt: 'Segundos de espera no ponto antes do disparo (acção hover)',
    en: 'Seconds to wait at the point before the shot (hover action)',
  },
}
