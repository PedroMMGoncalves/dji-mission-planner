# Métodos: fórmulas, hipóteses, tolerâncias e limites

Este documento descreve o que o planeador calcula e como, com as
fórmulas tal como estão implementadas, as constantes e os limiares que as
governam, as hipóteses em que assentam e o que fica deliberadamente por
modelar. É o documento que um revisor deve ler antes de confiar num
número da interface. Cada secção indica o módulo onde a fórmula vive; as
constantes citadas são as do código na data desta versão (ver
`CHANGELOG.md`).

Convenções gerais:

- Coordenadas em WGS84 (EPSG:4326), `[longitude, latitude]` em graus.
  Distâncias em metros, tempos em segundos, ângulos em graus.
- Um "anel" é um polígono aberto (o último vértice não repete o primeiro).
- Azimutes medidos no sentido horário a partir do Norte: 0° = faixas
  Norte–Sul, 90° = faixas Este–Oeste.
- Alturas exportadas são relativas ao ponto de descolagem (secção 12).

## 1. Referencial métrico e geodesia

Não há projecção cartográfica. Coexistem dois modelos (`src/utils/units.js`,
`src/utils/geo.js`):

- funções esféricas do Turf (`distance`, `bearing`, `area`, `buffer`,
  `transformRotate`, `destination`, `along`), sobre uma esfera de raio
  6371008,8 m, para medir e rodar;
- uma conversão local grau ↔ metro (equirectangular) para construir
  rectângulos, grelhas, mosaicos, desvios e o referencial plano da direcção
  óptima:

```
M_PER_DEG_LAT = 110574 m/grau
metersPerDegLon(lat) = 111320 · cos(lat)
```

O coseno é avaliado uma vez por chamada, numa latitude de referência
(centro da área, média dos vértices ou primeiro vértice, consoante o
módulo). Hipótese declarada em `units.js`: à escala de um levantamento
(poucos km) o erro face à geodésica fica muito abaixo da resolução de
qualquer MDT usado aqui. A rotação das faixas usa `transformRotate` (esférica)
mas o passo em latitude entre faixas sai de uma escala linear da altura da
caixa envolvente (`latStep = Δlat · spacing / heightM`), uma hipótese de
linearidade local.

## 2. Sensor: pegada, GSD, espaçamento, intervalo, densidade LiDAR

Módulo `src/utils/geo.js`. Modelo pin-hole, câmara a nadir, solo plano e
horizontal exactamente à altura `H` (AGL). Sem distorção, sem relevo
dentro da imagem, sem atitude.

```
across = H · sensorWidth  / focalLength          pegada transversal (m)
along  = H · sensorHeight / focalLength          pegada longitudinal (m)
LiDAR: across = 2 · H · tan(FOV/2); along = null
```

GSD ao centro do quadro, em cm/píxel, com o alcance inclinado quando o
gimbal é oblíquo:

```
slant = H / sin(min(90°, |pitch|))
GSD   = sensorWidth · slant · 100 / (focalLength · imageWidth)
```

Abaixo de 20° de |pitch| o GSD deixa de ter sentido (quase-horizonte) e a
interface mostra n/a. A −60° o GSD é ~15 % pior do que a nadir.

Espaçamento entre faixas e intervalo de disparo, definidos como fracção da
pegada **nadir** mesmo com gimbal oblíquo (decisão deliberada: a pegada
oblíqua no solo é maior, pelo que a sobreposição real fica sempre ≥ à
pedida, erro conservador):

```
spacing  = across · (1 − sideOverlap/100)      (modo manual: max(1 m, valor))
interval = along  · (1 − frontOverlap/100)     distância entre fotos (m)
```

Aviso de obturador (`App.jsx`): `interval / v < minTriggerS` (0,7 s por
omissão) marca o intervalo como impossível à velocidade `v` e sugere
`vmax = interval / minTriggerS`.

Densidade LiDAR (pontos/m²), com a PRR de retorno único como valor
conservador e distribuição uniforme no swath:

```
single  = PRR / (v · across)
overlap = 2 · single        (banda de sobreposição de duas passagens)
```

Não é modelado: retornos múltiplos, o afilamento da densidade nas bordas
do padrão de varrimento, a dependência da sobreposição lateral real.

## 3. Grelha de área

Módulo `src/utils/geo.js` (`generateFlightLines`, `generateFlightPlan`,
`composeCellPlans`) e `src/utils/gridRoute.js`.

Passos:

1. Margem exterior opcional (`turf.buffer`) com distância
   `d = (bufferPct/100) · √área / 2`: com 10 % cada lado avança 5 % da
   dimensão característica.
2. Rotação da área por `90° − ângulo` em torno do centróide, para as faixas
   ficarem horizontais no referencial rodado.
3. Linhas de varrimento espaçadas de `spacing`, centradas na caixa
   envolvente; `nLines = floor(altura/spacing) + 1`, com trava
   `MAX_LINES = 2500` (erro `too-many-lines`).
4. Intersecção de cada linha com o polígono (`turf.lineIntersect`),
   ordenação das intersecções, emparelhamento par-a-par e teste do ponto
   médio dentro do polígono, o que trata polígonos côncavos (vários troços
   por linha). Troços com menos de `MIN_SEGMENT_M = 1 m` são descartados;
   as linhas vazias contam para a conectividade.
5. Ordenação boustrophedon por decomposição celular (Choset & Pignon,
   1998; implementação derivada de `grid_route.py` do FlyPath, GPL-3.0):
   troços contíguos formam células percorridas em zig-zag; num polígono
   convexo é a serpentina clássica, num côncavo as ligações nunca
   atravessam os vãos.
6. Rotação inversa.

Prolongamento (overshoot): cada faixa é estendida nos dois extremos, na
direcção de voo já escolhida, em `overshootM`; as viragens caem fora da
área. Fiada de amarração (LiDAR): uma passagem perpendicular a meio do
bloco, voada no fim, com o mesmo prolongamento, a começar no extremo mais
próximo do fim da última faixa.

Dupla grelha: segunda grelha a `ângulo + 90°`, sem fiada de amarração;
sem segunda grelha o plano é um erro explícito (`crosshatch-failed`), nunca
uma grelha única silenciosa. Passagem nadir extra: terceira grelha na
direcção da primeira, voada no fim, com o gimbal rodado para −90° no seu
primeiro waypoint (marcador `nadirStartLine`/`nadirStartWaypoint`).

Células (grelha da âncora ou mosaico): todas partilham o mesmo pivô e a
mesma origem de múltiplos do espaçamento (`computeAlignment`), pelo que as
faixas de células adjacentes são colineares; um múltiplo exactamente sobre
a aresta comum pertence só à célula superior (intervalo semi-aberto); uma
célula mais estreita do que o espaçamento recebe uma única faixa, o
múltiplo mais próximo do centro, encostado para dentro em
`min(0,1 m, 10 % da altura)`. Uma célula sem plano é o erro
`cell-uncovered`, nunca uma missão mais curta do que a área.

Direcção óptima (`findOptimalDirection`, estratégia de
`find_optimal_direction` do FlyPath, implementação independente): custo =
número de troços dentro do polígono, desempate pela menor extensão
perpendicular; varrimento grosseiro a 5° e refinamento ±4° a 1°, com o
número de linhas de varrimento limitado a ~200 por ângulo.

Rectângulo e grelha da âncora: lados em metros convertidos a graus na
latitude da âncora, rotação `orientação − 90°`; células numeradas em
serpentina.

Mosaico de quadrados (`tilePolygonWithSquares`): quadrados de lado
`tileSize` (≥ 10 m) alinhados com `tileOrientation`, centrados na caixa
envolvente rodada; mantém-se toda a célula que intersecta o polígono
(o operador desactiva as que não interessam); trava `MAX_TILES = 400`.

## 4. Tempo de voo, baterias e blocos

Modelo de tempo, igual em todo o motor:

```
flightTimeS = pathLengthM / v + nLines · TURN_TIME_S,   TURN_TIME_S = 3 s
```

com `pathLengthM` a soma das distâncias entre waypoints consecutivos
(ligações incluídas). Não são modelados: aceleração e desaceleração,
raio de viragem, subida e descida, descolagem e aterragem, vento,
pairagem. O custo de 3 s por viragem e o factor de velocidade efectiva em
faixa estão marcados no código para calibração com logs de voo
(Setembro de 2026; ver secção 16).

Trânsito: sempre `2 · distância horizontal em linha recta / v`, da base à
área (`distanceToArea`, distância à fronteira ou 0 se a base está dentro)
ou da base ao primeiro waypoint de cada bloco. Entre células do mosaico o
trânsito não é contado; entre as grelhas da dupla grelha é.

Tempo útil de uma bateria: `batteryMin · 60 · (1 − reserva/100)`, reserva
por omissão 30 %. Baterias do projecto (`aggregatePlans`): somadas por
plano, `max(1, ceil(tempo / útil))` por cada plano, porque missões
separadas não partilham uma bateria a meio.

Divisão em blocos (`splitIntoBlocks`; modelo do UgCS "Large Projects" e do
DroneDeploy multi-flight): a grelha global mantém-se e é cortada em grupos
de faixas contíguas pela ordem de voo. Orçamento por área
`max(0,5 ha, maxAreaHa)`, com a área de cada faixa `≈ comprimento × spacing`;
por bateria `max(60 s, útil)`, com o trânsito do bloco descontado em cada
verificação. A ligação vinda da faixa anterior é deliberadamente excluída
do teste de encaixe (se a faixa for despejada abre um bloco onde essa
ligação nunca se voa); o excesso fica limitado a uma ligação por bloco.
Como os blocos partilham faixas adjacentes da mesma grelha, a sobreposição
lateral entre blocos mantém-se sem margens extra.

Lado do quadrado por bateria (`squareSideForBattery`): para um quadrado de
lado `L`, `n ≈ L/s + 1` faixas, tempo `≈ (L²/s + 2L)/v + n · 3`, igualado
ao tempo útil `T = max(60 s, (útil − trânsito) / passagens)` e resolvido
como quadrática em `L`; limitado a `maxSide` (500 m por omissão, conforto
VLOS, piso 100 m), arredondado para baixo à dezena, mínimo 50 m.

## 5. Terreno

Módulos `src/utils/terrain.js`, `src/utils/demFile.js`,
`src/mission/terrainFollow.js`.

Relevo global: tiles Terrarium (AWS `elevation-tiles-prod`), zoom 12 por
omissão (~30 m/píxel a latitudes médias), com 1 tile de margem em todas as
direcções e trava de 600 tiles; falha se mais de 20 % dos tiles não
chegarem. Descodificação por píxel:

```
elev = R · 256 + G + B / 256 − 32768   (m)
```

Filtro de picos: um píxel sem pelo menos 2 vizinhos a menos de 150 m é
substituído pela mediana dos vizinhos (um erro de ±1 em R vale ±256 m).
Amostragem bilinear nos centros dos píxeis; tiles em falta são saltados e
os pesos renormalizados.

MDT local (GeoTIFF): só rasters north-up (rotação recusada); CRS lido das
GeoKeys, aceites os geográficos (4326, 4258, 4979, 4937, usados como
lon/lat sem reprojecção) e os projectados de `CRS_OPTIONS` (3763, 25829,
32629, 27493, 20790); janela = área + margem de 500 m, lida do primeiro IFD
(sem overviews), reamostrada por vizinho mais próximo (para não contaminar
o sem-dados) até 2048 píxeis de lado; sem-dados = valor GDAL (com
tolerância relativa 1e-6), não finito ou |v| ≥ 1e30; amostragem bilinear
com renormalização. Erro se o MDT não cobre a área ou não tem valores
válidos.

Cobertura: teste de caixa envolvente da área dentro da caixa do relevo
carregado (não é um teste por píxel).

Seguimento de terreno (`terrainFollowLines`): cada faixa **e cada ligação
entre faixas** é densificada a passos ≤ 40 m (interpolação linear em
lon/lat, ≤ 20000 pontos por segmento), amostrada no relevo e simplificada
por Douglas-Peucker sobre o desvio **vertical**: mantém-se o conjunto
mínimo de pontos tal que a interpolação linear entre eles nunca se afasta
mais de `tolerância` (5 m por omissão, mínimo 1 m) do perfil amostrado. A
altura exportada de cada ponto é

```
rel = round10( AGL + (elev(ponto) − elev(referência)) )
```

com a referência = base marcada, ou o primeiro waypoint. Os pontos
inseridos numa ligação contam para a faixa a que conduzem (`perLine`) e
ficam registados à parte (`perLink`); um bloco descarta os da ligação que
antecede a sua primeira faixa, porque arranca da base. Sem dados numa
amostra usa-se a última elevação válida (aviso). Aviso (não bloqueio) se a
altura relativa mínima for inferior a 20 m.

Limites: a garantia da tolerância vale nos pontos amostrados, a 40 m; um
acidente mais estreito do que o passo é invisível ao perfil. O Terrarium é
um modelo de superfície de origem mista (~30 m), sem vegetação nem
edifícios modelados; a diferença de resolução entre fontes não é
assinalada. Seguir terreno e foto por waypoint são mutuamente exclusivos
(a densificação reindexaria as acções).

Sugestão para encostas: plano `z = ax + by + c` ajustado por mínimos
quadrados a uma grelha 12×12 na área (≥ 8 amostras); declive
`atan(√(a²+b²))`, azimute descendente `atan2(−a, −b)`, curvas de nível a
+90°; só com declive ≥ 8°, gimbal sugerido `−round((90 − declive)/5)·5`
em [−90, −45]. Só sugestões.

## 6. Disparo: intervalos, grupos e ligações longas

`triggerRangesForLines` (`geo.js`) percorre as faixas pela ordem de voo e
quebra o intervalo de disparo onde a ligação entre o fim de uma faixa e o
início da seguinte excede `maxLinkM = max(2,5 · spacing, 60 m)`, deixando
de fora os pontos que o seguimento de terreno inseriu nessa ligação. O
exportador escreve um `actionGroup` por intervalo (disparo por distância,
`multipleDistance`, ou por tempo, `multipleTiming` com
`max(0,1 s, interval / v)`), no waypoint onde começa. Numa viragem normal o
disparo continua; numa travessia de concavidade, entre grelhas ou entre
células, pára. Contagem de fotos por distância: `floor(len/interval) + 1`
por faixa (prolongamento incluído; `photoCountArea` desconta-o).

Modo foto por waypoint: cada faixa é densificada a passos iguais
≤ `interval` (`n = ceil(len/interval)`, extremos incluídos) e cada ponto
leva `takePhoto`; com prolongamento os extremos estendidos não disparam.

## 7. Fachada

Módulo `src/utils/faceMode.js`. Linha de base = pé da face; passagens
horizontais empilhadas ao longo da linha desviada de `standoff` para o
lado escolhido; rumo perpendicular ao segmento local, virado para a face;
alturas relativas à descolagem (que deve estar à cota do pé da face).

Pegada **na face**, à distância standoff (câmara nivelada):
`imgW = standoff · sensorWidth / f`, `imgH = standoff · sensorHeight / f`;
passos `vStep = imgH · (1 − vOverlap)`, `hStep = imgW · (1 − hOverlap)`
(erro `overlap-too-high` abaixo de 0,1 m). Centros das imagens de
`max(imgH/2, piso 5 m)` a `H − imgH/2`, com `n = ceil((último − primeiro)/vStep) + 1`
passagens redistribuídas uniformemente (passo real ≤ vStep); o piso
aplica-se ao intervalo inteiro; `uncoveredBottomM` é a banda que o piso
deixa por fotografar. Desvio da linha de base num referencial métrico
local (o `lineOffset` do Turf, em graus, encolhe os desvios E-O em
cos(lat)), com mitra exacta até 2,5·d (`1 + n1·n2 > 0,32`) e bisel além;
sem remoção de laços. Amostragem ao longo da linha desviada a passos
≤ hStep, extremos incluídos; rumo por diferença central arredondado ao
grau; um `takePhoto` por waypoint; pitch do gimbal constante em todas as
passagens. Serpentina com subida no mesmo ponto horizontal. Tempo
`L/v + 2 s · waypoints` (paragem e disparo). GSD ao standoff.

Folga (`checkFaceClearance`), só contra um DSM **local** (o Terrarium é
inutilizável à escala de uma face): por waypoint, folga vertical =
`cota do drone − DSM` e folga horizontal = distância, ao longo do rumo da
câmara, à primeira amostra (a 1/4, 1/2 e 3/4 do standoff) cuja superfície
chega à cota do drone; qualquer uma abaixo de `minClearance` (15 m por
omissão) marca a passagem. Limites: três amostras por waypoint num só
azimute; um obstáculo abaixo da cota do drone não é detectado. Sem DSM
local o standoff fica "não verificado".

## 8. Órbita

Módulo `src/utils/orbit.js`. Círculos empilhados em torno de um POI; pontos
por volta a partir da sobreposição horizontal à distância `R`:

```
corda = max(1 m, across(R) · (1 − hOverlap/100))    (sem câmara: 2πR/24)
nPts  = clamp(ceil(2πR / corda), 8, 120)
```

Posições por `turf.destination` (círculo geodésico), volta fechada no rumo
inicial (um waypoint repetido por nível), rumo apontado ao POI
arredondado ao grau, pitch por nível
`clamp(−round(atan((h − poiHeight)/R)), −90, +20)`, subida vertical no
mesmo ponto horizontal, `turnMode = toPointAndPassWithContinuityCurvature`
(voo curvo contínuo), tempo `L/v` sem paragens, GSD a `R` (o alcance real
ao centro do alvo, `√(R² + Δh²)`, é maior). Não modelado: colisão com a
estrutura, sobreposição vertical entre níveis (passo dado pelo operador),
oclusões.

## 9. Corredor

Módulo `src/utils/corridor.js`. Referencial métrico local com origem no
primeiro vértice. Passagens paralelas ao eixo:

```
nPasses = ceil((2·half − across) / spacing) + 1     (uma só se across ≥ 2·half)
offsets = (i − (n−1)/2) · spacing
```

as exteriores transbordam um pouco a berma para manter a sobreposição até
ao limite. Trava `MAX_PASSES = 200` (recusa, nunca corte silencioso).

Desvio de cada passagem com junta **redonda** do lado convexo (arcos a 5°,
sempre a |offset| exactos do vértice; a esquadria dava |offset|/cos(θ/2),
170 m numa deflexão de 120° com 85 m) e **esquadria** do lado côncavo (o
arco mergulharia para dentro). Critério de validade: um ponto do desvio só
é válido se distar do eixo `|offset| ± max(0,25 m, 1 %)`; os pontos de
uma dobra (curvatura mais apertada do que o desvio) são descartados por
construção e a passagem parte-se em troços contíguos (≥ 5 m), em vez de
ganhar um laço; um salto entre pontos densos maior do que 2 × o passo
também parte o troço. Passo de amostragem
`max(0,5, min(spacing/4, comprimento/4, 10))` m, trava `MAX_SAMPLES = 20000`
por eixo e por desvio (erro `corridor-too-long`, ~21 km a 30 m com 90 %
de sobreposição). Passagens partidas e passagens perdidas contam-se em
separado; a largura anunciada é a pedida, não a voada quando há perdidas.
Serpentina invertendo a ordem e o sentido dos troços nas passagens ímpares.

Fotos: no modo por waypoint, posições por comprimento de arco **de cada
passagem** (a interior é mais curta do que a exterior; projectar do eixo
daria sobreposição a mais dentro e a menos fora); no modo distância, o
traçado é simplificado por Douglas-Peucker (1 m) e o disparo é do drone,
com os intervalos de disparo quebrados nas ligações longas. Sem rumo por
waypoint (segue a rota), gimbal −90°, altura única (sem seguimento de
terreno neste modo). Tempo `L/v + 3 s · (troços − 1)`.

## 10. Pontos de inspecção e GCPs

Inspecção (`src/utils/inspect.js`): ordem manual com sugestão gulosa de
vizinho mais próximo (distância horizontal, sem altura, sem regresso à
base); cada ponto com altura (30 m por omissão), rumo (ausente = segue a
rota), pitch e foto.

GCPs (`src/utils/gcp.js`), com base em Martínez-Carricondo et al. (2018)
e Sanz-Ablanedo et al. (2018): número sugerido
`clamp(5 + floor(ha/5), 5, 25)`; candidatos na fronteira (64 amostras,
recuadas `max(15 m, 3 % · √área)` para o interior) e numa grelha interior
(passo `max(50 m, √(área/n)/2)`, ≤ 2500 nós), todos a pelo menos metade
do recuo da fronteira; selecção gulosa do ponto mais afastado, parando
quando o melhor candidato fica a menos de 10 m dos já escolhidos (pode
devolver menos do que o pedido).

## 11. Exportação WPML

Módulo `src/utils/exporters.js`. Dois ficheiros num KMZ (`wpmz/template.kml`
e `wpmz/waylines.wpml`, `xmlns:wpml="http://www.dji.com/wpmz/1.0.2"`).
Coordenadas a 8 casas decimais. Alturas: `heightMode` e
`executeHeightMode` = `relativeToStartPoint`; cada placemark leva
`executeHeight` (waylines) e `height` + `ellipsoidHeight` (template) com o
mesmo valor `h ?? altitude`; `useGlobalHeight` = 0 quando o waypoint tem
altura própria. Rumo: `followWayline`, ou `smoothTransition` com o ângulo
normalizado de [0, 360) para [−180, 180]. Gimbal: grupo `gimbalRotate` no
waypoint 0 (omitido com LiDAR) e por waypoint quando indicado.
`globalRTHHeight = min(1500, max(100, ceil(tecto da rota) + 20))`, com o
tecto = máximo entre a altitude nominal e todas as alturas dos waypoints
(uma missão num planalto 250 m acima da descolagem tem waypoints a ~350 m).
`takeOffSecurityHeight` 30 m por omissão. `finishAction`, `exitOnRCLost`
e `executeRCLostAction` fora das listas caem no primeiro valor permitido.

Validação na fronteira (`validateExportParams`), que lança
`MissionExportError` em vez de escrever o ficheiro: waypoints presentes e
≤ 65536, coordenadas finitas em [−180, 180] × [−90, 90], alturas finitas,
altitude finita > 0, velocidade em (0, 30] m/s, enums WPML numéricos,
`photoIntervalM ≥ 0`, RTH em (0, 1500], pitch em [−120, 60], rumos em
[−180, 360), `takeOffSecurityHeight` em (0, 200], intervalos de disparo
inteiros, crescentes e dentro da rota. Caracteres XML ilegais e substitutos
isolados são retirados dos textos. Blocos: um KMZ por bloco
(`<nome>_b01.kmz`, ...) num zip, com waypoints, acções e intervalos de
disparo locais ao bloco.

Enums de aeronave e payload (`src/data/drones.js`) vêm da documentação
DJI (`dji-sdk/Cloud-API-Doc`); `payloadEnumValue 65534` é o "PSDK Payload
Device" documentado para payloads de terceiros. Nenhum enum foi ainda
testado num comando real (ver `README`).

## 12. Datums verticais tal como estão implementados

Módulo `src/utils/verticalDatum.js`. Cada fonte de relevo declara o seu
datum vertical (`verticalDatum`: tipo ortométrico / elipsoidal /
desconhecido, modelo, código EPSG, se é assumido, unidade):

- Terrarium: elevações em metros; a fonte não declara datum, assume-se
  ortométrico EGM96 (é o que os dados de origem, na maior parte, são) e o
  painel diz "assumido".
- MDT local: lidas as GeoKeys `VerticalCSTypeGeoKey` (5773 EGM96, 3855
  EGM2008, 5714 MSL, 5782 Cascais, 5730/5621 EVRF; outros códigos
  assumidos ortométricos), `VerticalDatumGeoKey` e `VerticalUnitsGeoKey`
  (9001 m, 9002 pés, 9003 pés US); os valores da banda passam a metros na
  leitura. Sem GeoKeys verticais o datum fica "desconhecido (assumido
  ortométrico)". Um GeoTIFF geográfico 3D (4979/4937) declara alturas
  elipsoidais: o painel avisa e o preflight regista um aviso com seguir
  terreno ligado. Não há conversão elipsoidal ↔ ortométrico (o modelo de
  geóide não está embebido).
- WPML: alturas relativas ao ponto de descolagem; `ellipsoidHeight` é uma
  cópia do mesmo valor relativo, não uma altura elipsoidal.

O que anula o datum na prática: a altura exportada é uma **diferença** de
duas elevações da mesma fonte (`elev(ponto) − elev(referência)`), pelo que
um desvio constante do datum (a ondulação do geóide, que varia lentamente
à escala de um levantamento) cancela; o erro residual é a variação da
ondulação dentro da área, que não é modelada. As duas fontes nunca se
misturam num mesmo cálculo.

## 13. Importação de áreas e de missões

`src/utils/importArea.js`: KML (tags por nome local, `outerBoundaryIs`
preferido, `innerBoundaryIs` lidos como buracos), GeoJSON e Shapefile
zipado (reprojectado pelo `.prj` quando existe). Todos os polígonos do
ficheiro são devolvidos com os seus buracos, por ordem decrescente de área
(fórmula do cadarço); o maior é o contorno e os buracos dele entram no
polígono do plano (as faixas partem-se à volta deles; nenhum GCP cai
dentro; o KML exporta-os como `innerBoundaryIs`; não são editáveis). As
partes restantes ficam disponíveis para voar como células, com a maior
como contorno. Anéis com mais de 400 vértices são simplificados
(Douglas-Peucker do Turf, tolerância de 1e-5 graus ≈ 1 m, dobrada até 8
vezes). Coordenadas projectadas detectadas por magnitude (|x| > 180 ou
|y| > 90) **ou por extensão** (mais de 2° em qualquer eixo: um polígono em
metros locais 0–5000 passava por WGS84) pedem um CRS de `CRS_OPTIONS`; o
membro `crs` de um GeoJSON, quando declara um EPSG da lista, é aplicado
sem perguntar, e quando declara outro fica como pista no pedido de CRS.
`+towgs84` de 3 ou 7 parâmetros, sem grelhas de transformação.

`src/utils/importWpml.js`: reimportação de um KMZ (desta aplicação ou do
Pilot 2): rota pela ordem de `wpml:index`, altura por `executeHeight` →
`height` → `ellipsoidHeight` (valor único, ou mediana), velocidade por
`autoFlightSpeed` ou mediana por waypoint, área reconstruída pelo
invólucro convexo (ou rectângulo com 20 m de margem quando degenerado).

## 14. Preflight

`src/mission/preflight.js`, calculado do mesmo estado que a exportação.
Bloqueios (desactivam o KMZ): sem plano; plano com erro; seguir terreno com
foto por waypoint; seguir terreno ligado sem relevo a cobrir a área; erro
do cálculo do terreno; mais de 65535 waypoints numa rota (a maior, com
blocos). Avisos: rota acima de 2000 waypoints; tecto AGL do payload
(`altitude + tolerância` com seguimento de terreno); obturador; tempo acima
do útil de uma bateria (missão com trânsito de ida e volta, ou por bloco
com `timeS + transitS`). Lembretes: sem base; alturas relativas à
descolagem.

## 15. Tabela de constantes e tolerâncias

| Grandeza | Valor | Módulo |
|---|---|---|
| Metros por grau de latitude / longitude | 110574 / 111320·cos(lat) | units.js |
| Faixas máximas por plano | 2500 | geo.js |
| Troço mínimo de faixa | 1 m | geo.js |
| Tempo por viragem | 3 s (a calibrar) | geo.js, corridor.js |
| Células máximas do mosaico | 400 | geo.js |
| Lado mínimo do mosaico | 10 m | geo.js |
| Lado por bateria: tecto / piso / arredondamento | 500 m (≥100) / 50 m / 10 m | geo.js |
| Reserva de bateria por omissão | 30 % | vários |
| Quebra do disparo nas ligações | max(2,5·spacing, 60 m) | areaExport.js, exportParams.js |
| Limiar de GSD (|pitch|) | 20° | geo.js |
| Zoom / tiles / falhas do Terrarium | 12 / 600 / 20 % | terrain.js |
| Filtro de picos | 150 m, 2 vizinhos | terrain.js |
| Seguimento de terreno: passo / tolerância / mínimo | 40 m / 5 m (≥1) / 20000 pts | terrain.js |
| Altura relativa mínima (aviso) | 20 m | terrain.js |
| MDT local: janela / margem / lado máximo | 1.º IFD / 500 m / 2048 (≤8192) px | demFile.js |
| Plano de encosta: grelha / declive mínimo | 12×12 / 8° | terrain.js |
| Fachada: standoff / altura / folga / piso | 25 m / 30 m / 15 m / 5 m | faceMode.js |
| Órbita: pontos por volta / pitch | [8, 120] / [−90, +20] | orbit.js |
| Corredor: passagens / amostras / troço mínimo / arco | 200 / 20000 / 5 m / 5° | corridor.js |
| Corredor: banda de validade | ±max(0,25 m, 1 %) | corridor.js |
| GCPs: n / recuo / separação | [5, 25] / max(15 m, 3 %·√A) / 10 m | gcp.js |
| WPML: waypoints / velocidade / RTH | 65536 / 30 m/s / 1500 m | exporters.js |
| Preflight: waypoints (bloqueio / aviso) | 65535 / 2000 | preflight.js |
| Importação: vértices antes de simplificar | 400 | importArea.js |

## 16. O que não é modelado e calibração prevista

Não modelado, em resumo: dinâmica do voo (aceleração, raio de viragem,
subida, vento); atitude da aeronave e relevo dentro da imagem na
sobreposição; obstáculos fora da folga da fachada; datum vertical;
retornos múltiplos e padrão de varrimento do LiDAR; incerteza propagada
(altitude barométrica vs RTK, deriva) nas grandezas apresentadas.

Calibração com logs de voo (E3.3, prevista para Setembro de 2026), com um
ponto de inserção único no código para cada grandeza:

1. tempo de viragem medido = mediana de (tempo entre o fim de uma faixa e
   o início da seguinte − distância da ligação / v), a substituir
   `TURN_TIME_S`;
2. autonomia real por combinação aeronave + payload, pela interface
   (`batteryByCombo`) ou corrigindo `batteryMin` no catálogo;
3. velocidade efectiva em faixa = distância voada em faixa / tempo em
   faixa; se o rácio for estável e < 1, entra como factor multiplicativo
   nos dois modelos de tempo.

A ferramenta `tools/planeado-vs-medido.mjs` (ver `README`) mede a partir
das fotos, da nuvem LAS e do registo de voo as grandezas destas secções e
é a entrada dessa calibração.

## 17. Referências

- Choset, H., Pignon, P. (1998). Coverage Path Planning: The Boustrophedon
  Cellular Decomposition. *Field and Service Robotics*.
- dronnix-io/FlyPath (GPL-3.0): `grid_route.py` e
  `find_optimal_direction` (ver `src/utils/gridRoute.js` e `geo.js`).
- Martínez-Carricondo, P. et al. (2018). Assessment of UAV-photogrammetric
  mapping accuracy based on variation of ground control points.
  *Int. J. Applied Earth Observation and Geoinformation*, 72, 1–10.
- Sanz-Ablanedo, E. et al. (2018). Accuracy of Unmanned Aerial Vehicle
  (UAV) and SfM Photogrammetry Survey as a Function of the Number and
  Location of Ground Control Points Used. *Remote Sensing*, 10(10), 1606.
- DJI, `dji-sdk/Cloud-API-Doc`: `template-kml.md`, `waylines-wpml.md`,
  `common-element.md` (WPML 1.0.2).
- Mapzen/AWS Terrarium: `elevation-tiles-prod`, codificação RGB.
- YellowScan Mapper+ (Livox AVIA): ficha técnica, consultada em 2026-08-18.
