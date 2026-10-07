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

Incerteza propagada (`src/mission/uncertainty.js`): as grandezas acima
são apresentadas também como intervalos [pior, melhor], por propagação de
intervalos (sem hipótese de distribuição; todas as funções são monótonas
no domínio). Entradas: o erro de posicionamento da aeronave (fichas DJI,
precisão em pairagem: GNSS ±0,5 m vertical / ±1,5 m horizontal; RTK
1–1,5 cm + 1 ppm, aqui ±0,03 / ±0,02 m; caixa "RTK activo") e o relevo
dentro da área relativo à referência (amostrado no relevo carregado até
400 waypoints) ou, com seguimento de terreno, a tolerância:

```
AGL  ∈ [H − subida_max − σv,  H + descida_max + σv]      (sem seguimento)
AGL  ∈ [H − tol − σv,  H + tol + σv]                      (com seguimento)
GSD, pegada: avaliados nos dois extremos de AGL
frontal_pior = 1 − (interval + σh) / along(AGL_min);  melhor com (interval − σh) e AGL_max
lateral_pior = 1 − (spacing  + σh) / across(AGL_min); idem
```

Abaixo de 60 % frontal ou 50 % lateral no pior caso o preflight avisa.
Arrastamento por movimento: `blur = v · t_exp`, apresentado a 1/1000 s e
1/500 s em cm e em píxeis do GSD nominal; acima de 1 px a 1/500 s o
preflight avisa. O erro em voo é maior do que em pairagem; os valores
ficam para calibrar com os logs (secção 16).

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

Trânsito: numa rota única, `2 · distância horizontal em linha recta / v`
da base de referência à área (`distanceToArea`, distância à fronteira ou 0
se a base está dentro). Com blocos e bases, cada bloco conta o da SUA base
no pior caso da zona: `(d(centro, 1.º waypoint) + r) + (d(centro, último
waypoint) + r)`, a dividir por `v` (`blockWorstTransitM`). Entre células do
mosaico o trânsito não é contado; entre as grelhas da dupla grelha é.

Tempo útil por voo: o operador conta as baterias em minutos de voo por
conjunto já descontada a reserva com que aterra (15-20 %): no M300 RTK,
TB60 25 min e TB65 28 min, medidos no campo; nas outras aeronaves os
valores por omissão são estimativas (`src/mission/equipment.js`, marcadas
como tal). Cada tipo de bateria guarda esse tempo na Configuração
(equipamento, no browser); a missão escolhe o tipo e pode acertar o tempo
útil para o dia. Esse valor entra no motor como `batteryMin` com reserva
0, e todas as contas usam `útil = batteryMin · 60 · (1 − reserva/100)` =
`batteryMin · 60`: não há reserva aplicada por cima, em lado nenhum (a
reserva por omissão dos módulos puros é 0). Os projectos anteriores
guardavam a duração nominal e a reserva à parte (30 % por omissão); ao
abrir, `legacyUsefulMin` converte-as em tempo útil, `nominal · (1 −
reserva/100)` arredondado ao meio minuto (55 min a 30 % → 38,5 min), e a
reserva passa a 0, pelo que os blocos não mudam. Baterias do projecto
(`aggregatePlans`): somadas por plano, `max(1, ceil(tempo / útil))` por
cada plano, porque missões separadas não partilham uma bateria a meio. Com
o número de conjuntos da equipa conhecido, a lista de blocos avisa quando
há mais voos do que conjuntos (`flightsVsSets`).

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

Trânsito no dimensionamento (`squareSideWithBaseTransit`,
`src/mission/baseLayout.js`): o lado não pode depender de onde estão as
bases — mover uma base refaria o mosaico e perderia as células
desactivadas e as atribuições. Dimensiona-se para uma base num CANTO do
bloco, com a zona: a serpentina começa e acaba em cantos do quadrado, e a
soma das distâncias do pior canto ao primeiro e ao último waypoint é no
máximo `(1 + √2) · L` (um canto adjacente e o oposto). Trânsito
`(2 · raio + (1 + √2) · L) / v`, e o lado é o maior `L` à dezena com `L ≤
squareSideForBattery(trânsito(L))` (o segundo membro decresce com `L`).
Uma base no bordo ou dentro do bloco cabe sempre; as mais longe vão ao
preflight bloco a bloco, com o trânsito real da sua base (secção 14). Com
o lado limitado pelo tecto (`maxSide`) sobra bateria e o trânsito não o
muda. Até Outubro de 2026 o trânsito era o da base única até à área (0
com a base dentro dela), e uma base longe encolhia todos os quadrados.

Mosaico de quadrados (`buildSquareMosaic`, `src/mission/squareMosaic.js`),
nas divisões por bateria e mosaico: quadrados de lado `L` recortados pela
área (e pelos buracos, que vão por célula para o plano); grelha deslocada
em 4 × 4 fracções do lado (2 × 2 acima de ~150 células, 1 × 1 acima de
~600), mais a grelha centrada antiga, escolhendo menos células, depois
menos tiras (`fillFrac < 0,25`), depois menos área em tiras; cada tira
funde-se no vizinho com mais fronteira comum se o conjunto couber numa
bateria (`cellFitsBattery`: o mesmo modelo, com a área `A` e a maior
extensão `W` da célula, `passagens · (A·a + W·b + 3 s) + (2r + (1+√2)·W)/v ≤
útil`; no mosaico manual, `A ≤ 1,25 · L²`). Orientação: arestas paralelas
às faixas do ângulo usado (também o «Óptimo», que escreve o ângulo),
`mosaicOrientationForLines`; desligado, a orientação manual. Numeração em
serpentina. O mosaico antigo (`tilePolygonWithSquares`) mantinha quadrados
inteiros que saíam da área, e o plano voava-os inteiros.

Ids dos blocos: o da célula no mosaico (`índice + 1`), estável ao
desactivar outras células (a «célula N» do mapa e do preflight). Os
ficheiros exportados levam o rótulo do voo (A-1, B-3: §4.1 e §11.3).

### 4.1 Bases múltiplas e zonas de descolagem

Módulos `src/mission/takeoffZones.js`, `src/mission/bases.js`,
`src/mission/baseLayout.js`. Uma área de 5-10 km² voa-se de várias bases;
o operador marca cada uma como um ponto (A, B, C...), mas no campo descola
a 20-100 m dali. Cada base é uma ZONA de raio `r` (equipamento, 100 m por
omissão, ou o raio próprio da base) e o planeamento usa o pior caso:

- cota de referência = a MÍNIMA do relevo na zona (centro e anéis a cada
  10 m em 16 azimutes); descolando em qualquer ponto da zona o voo fica
  entre 0 e +ganho metros acima do planeado, `ganho = máx − mín`;
- junto a uma corta, o raio reduz-se ao maior anel em que o desnível
  acumulado é ≤ 10 m (equipamento), e regista-se o anel e o desnível que o
  limitaram;
- alcance visual no pior caso de um bloco = vértice mais afastado do
  invólucro convexo (célula e waypoints) + `r`; trânsito como acima.

Atribuição: a escolha manual do operador (`blockBase`), senão a base de
menor alcance visual no pior caso (`assignBlocksToBases`). As atribuições
manuais guardam a disposição de blocos em que foram feitas (mosaico,
grelha ou corte), com as células e o contorno da área; refeito o mosaico,
passam para os blocos novos por sobreposição (§4.2). «Propor bases»
(`proposalTargets`, `proposeBases`, `applyProposal`; de uma vez em
`proposeMoreBases`, em fatias em `createBaseProposalRun`) corre a cobertura
gulosa de `proposeBases` só sobre os blocos que nenhuma base vê inteiros
(as bases do operador não se mexem), com o máximo de voos por base da
Configuração (0 = sem limite); as bases novas recebem os rótulos livres
pela ordem do primeiro bloco que servem, e os seus blocos ficam-lhes
atribuídos. Voos: base a base pela ordem dos
rótulos e, em cada base, pela ordem do mosaico: A-1, A-2, B-3.

Bons sítios na proposta (`src/mission/baseSites.js`, com relevo sobre a
área, com ou sem seguimento de terreno). A prática da equipa é descolar de
um sítio PLANO ou de um dos pontos mais ALTOS da área, nunca de um baixo,
por causa da ligação rádio (Mata de Vilar, Lousada: monte pequeno com
árvores altas, sinal perdido com o drone do outro lado). Uma regra anterior
desta mesma versão (`lowSiteRule`) preferia sítios baixos para evitar
alturas relativas pequenas com seguir terreno; saiu: alturas relativas
pequenas ou negativas a partir de uma base alta são aceitáveis, o aviso de
altura relativa (< 20 m, `MIN_SAFE_REL_M`) e as verificações de folga ao
solo já falam, e a proposta não troca o rádio nem a vista por elas.

- **Sítio utilizável** (`siteInfo`): relevo no ponto, e a zona de
  descolagem (`computeTakeoffZone`, raio e desnível do equipamento) com o
  raio efectivo ≥ `SITE_MIN_ZONE_FRAC` = 50 % do pedido — há chão plano
  para descolar à volta. Uma encosta ou a crista íngreme de uma cumeada não
  servem.
- **Candidatos**: os de sempre (vértices, pontos médios das arestas e
  centróides dos blocos) e os altos do relevo (`highPointsStepper`): uma
  grelha de `SITE_HIGHPOINT_GRID_M` = 100 m, alinhada a múltiplos de 100 m
  (não depende da caixa), sobre os blocos e uma margem igual ao VLOS; entram
  os máximos locais (nenhum dos 8 vizinhos mais alto) e os patamares planos
  (desnível do nó e dos vizinhos ≤ desnível máximo da zona). Por bloco, os
  `SITE_HIGHPOINTS_PER_BLOCK` = 3 mais altos (depois os mais planos) que o
  vêem inteiro dentro do VLOS, utilizáveis e a pelo menos 2 nós uns dos
  outros; a união vai para a proposta. Acima de 40 000 nós o passo cresce.
- **Rádio e vista por par candidato/bloco**: bacia de visão GROSSEIRA
  (§4.3) a partir do ponto do candidato — grelha de `SITE_VIEW_GRID_M` =
  60 m, relevo lido a `SITE_VIEW_STEP_M` = 20 m (sem descer à resolução do
  MDT), 60 % da 1.ª zona de Fresnel a 2,4 GHz desde a antena do comando,
  altura dos olhos e do comando da Configuração, vegetação da missão (só
  com MDT ou relevo global) e a cota do drone como nas bacias de visão: com
  seguir terreno `relevo + AGL`, sem ele `cota da zona do candidato +
  altura`. Fracção com o rádio livre = pontos sem intrusão na zona de
  Fresnel (os tapados contam como em risco) / pontos do bloco; fracção
  visível idem. As bacias finas (25 m, 10 m) ficam para o painel, o mapa e
  o preflight, já com as bases escolhidas.
- **Aceitação e escolha**: um bloco aceita um candidato quando a fracção com
  o rádio livre é ≥ `SITE_RADIO_OK_FRAC` = 95 %. `proposeBases` recebe a
  regra pelo gancho `site = { info(ponto), view(ponto, bloco, info),
  accepts(view) }` (o módulo não sabe de relevo) e corre a gulosa sobre a
  cobertura aceite; desempates, por esta ordem: mais blocos; maior fracção
  média com o rádio livre dos blocos que serviria (pesada pelos pontos, ±0,5
  %); maior fracção visível (±0,5 %); os blocos mais difíceis (como sem
  regra); o sítio mais alto (cota no ponto, ±0,5 m); o mais plano (desnível
  da zona, ±0,5 m); o mais perto. Os blocos que nenhum candidato aceite
  cobre recebem, numa segunda volta, o melhor sítio que os vê (utilizável
  primeiro, depois rádio, vista, mais blocos, cota, desnível) com
  `siteOk: false`, contado no painel («sem sítio com o rádio livre em 95 %
  …»): as bacias de visão e o preflight avisam. Sem relevo não há regra e a
  proposta é a de sempre.
- **Agendamento** (`createBaseProposalRun`, hook `useBaseProposal`): os
  blocos sem base que os veja, a grelha dos altos (uma linha por passo), a
  escolha dos altos (um bloco por passo), a cobertura (um candidato por
  passo), as zonas (uma por passo), as bacias grosseiras (um ponto da
  grelha por passo) e a gulosa no fim; fatias de 12 ms separadas por um
  `setTimeout`, com «A propor bases… N %» e «Cancelar» no painel. Uma
  edição a meio (blocos, bases, atribuições, relevo) cancela a corrida; as
  bases só mudam no fim, num passo do Ctrl+Z. O resultado não depende das
  fatias (testado contra o cálculo de uma vez). Medido em Node, relevo
  analítico: 9 blocos de 660 m em ~35 ms, 150 blocos de 300 m em ~270 ms,
  passo indivisível mais longo ≤ 10 ms; no browser, MDT importado: 9 blocos
  em ~0,1 s e 163 blocos de 175 m em ~0,75 s, fatias até 20 ms (a última
  com a gulosa).

Ctrl+Z: as edições das bases (marcar, arrastar, retirar, raio da zona,
atribuir um bloco, propor) entram no mesmo histórico das edições da área e
das células (`useAreaGeometry`, até 100 passos). Cada passo é o estado
inteiro de antes da edição — área, células desactivadas com a disposição a
que se referem, bases e atribuições —, e um Ctrl+Z desfaz a última edição
de qualquer tipo, pela ordem. O raio escrito tecla a tecla num campo é um
só passo (até o campo perder o foco).

### 4.2 Mosaico refeito: atribuições e células desactivadas

Módulo `src/mission/cellCarryOver.js`. O mosaico refaz-se ao mudar o
ângulo das faixas, o lado, a orientação, o tempo útil ou a área; antes, as
atribuições manuais e as células desactivadas perdiam-se em silêncio. A
regra, a mesma de `mosaicLegacy.js` para os projectos antigos:

1. Mesma área? A área nova e a antiga têm de ter em comum pelo menos metade
   da MENOR das duas (contornos exteriores). Abaixo disso a área foi
   substituída — um desenho ou uma importação noutro sítio — e nada passa.
   Uma área deslocada inteira (todos os vértices com o mesmo deslocamento,
   ±1 m: a pega de mover; também uma cópia exacta noutro sítio) é a mesma
   área, e as células antigas acompanham o deslocamento antes da
   comparação.
2. Cada célula nova herda da célula antiga que cobre pelo menos metade da
   sua área (no máximo uma, as antigas não se sobrepõem): a base escolhida
   à mão e o estado desactivado. Sem essa célula fica com a atribuição
   automática e activa.
3. As atribuições manuais que nenhuma célula nova herdou contam-se, e o
   painel das bases diz «N atribuições manuais não passaram para o novo
   mosaico» até o operador o dispensar ou o mosaico mudar de novo.

Vale para o mosaico e a grelha da âncora (células) e para o corte da
serpentina por área (o invólucro de cada bloco). Sobreposições por
Sutherland–Hodgman num plano local em metros quando uma das células é
convexa (quase sempre: quadrados), turf.intersect nas outras; ~150 células
todas atribuídas em poucos milissegundos. Sem blocos (divisão desligada,
área a ser redesenhada) as escolhas ficam guardadas com a disposição
antiga e voltam por esta regra quando os blocos voltarem. Um Ctrl+Z repõe
a disposição a que as escolhas se referiam; se o mosaico de agora for
outro, passam para ele pela mesma regra.

Os modos de rota única (corredor, circular, fachada, órbita, inspecção, e
a área sem blocos) usam uma base de referência: a mais próxima da sua rota
ou geometria (`nearestBase`), a primeira pela ordem dos rótulos sem rota.
Com uma só base é sempre ela. Na área sem blocos a cota é a mínima da zona
dela; nos outros modos, como antes, a cota do ponto da base.

### 4.3 Bacias de visão e ligação rádio

Módulos `src/mission/viewshed.js` (linha de vista, grelha do bloco),
`src/mission/viewshedPlan.js` (trabalhos, resumos, faixas do mapa) e
`src/hooks/useViewsheds.js` (agendamento). Com a área dividida em blocos,
bases e relevo sobre a área, cada bloco é visto da base que o serve.

- **Olho e antena.** No **ponto** da base marcado pelo operador: relevo nesse
  ponto + altura dos olhos (Configuração, 1,7 m, 1-5 m) para a vista, + altura
  do comando (1,5 m, 1-5 m) para o rádio. A zona de descolagem **não é
  varrida**: descolar a 80 m do ponto pode ver mais ou menos. Fica-se no
  ponto, e é isso que a ficha de campo diz.
- **Drone.** A cota absoluta a que o KMZ o põe em cada ponto: sem seguir
  terreno `cota de referência do bloco + altura` (a mínima da zona — o drone
  mais baixo possível, o lado pessimista); com seguir terreno `relevo + AGL`.
- **Grelha.** Centros das células de 25 m que cobrem o rectângulo envolvente
  do invólucro do bloco (célula e waypoints, o mesmo do alcance visual), só
  os de dentro. Cada ponto é um raio olho → drone.
- **Raio.** Relevo lido a passos de 10 m (a resolução do MDT quando é mais
  fina, nunca abaixo de 1 m; o global conta como ~30 m), sem o primeiro e o
  último passo (o chão debaixo dos pés e do drone). A linha desce
  `d·(D − d)·(1 − k)/(2R)` face ao relevo (curvatura da Terra com a
  refracção normal, k = 0,13): centímetros num bloco, decisivo a vários km.
  Tapado no primeiro obstáculo (`margem < 0`); a distância desse obstáculo é
  o «tapado a ~X m da base» (mediana dos pontos tapados, à dezena). Relevo
  em falta não tapa e conta como desconhecido.
- **Rádio (zona de Fresnel).** O comando perde a ligação antes de o
  operador perder o drone de vista quando o relevo, ou a vegetação, entra na
  primeira zona de Fresnel: raio `r₁ = √(λ·d₁·d₂/D)`, λ = c/f. Um ponto fica
  com o rádio em risco quando, em alguma amostra, a folga da linha antena →
  drone é menor do que `0,6·r₁` (60 % livre, a regra habitual; frequência
  2,4 GHz, a banda mais exigente do OcuSync do M300 — `RADIO_FREQ_GHZ`,
  `FRESNEL_FRACTION`). A meio de um raio de 800 m são 3,0 m; de 2 km, 4,7 m:
  uma crista que deixa passar a vista a 2 m da linha corta o rádio. Para o
  veredicto do rádio o raio lê-se até ao fim (sem a saída no 1.º obstáculo),
  e guarda-se a distância da pior intrusão. Distâncias horizontais
  (d₁ + d₂ = D): a inclinação muda r₁ em menos de 1 %. O painel e o preflight
  contam à parte os pontos **à vista** com o rádio em risco (os tapados já
  contam na vista).
- **Vegetação e obstáculos.** Um MDT (DGT) e o relevo global só têm o chão:
  sem árvores, edifícios nem escombreiras, a bacia sai optimista. Por missão
  (no projecto: depende do sítio) pode somar-se uma altura uniforme (0-60 m)
  ao relevo nas amostras dos raios a mais de 30 m da base (a clareira onde o
  operador está; nunca nos pés do operador nem na cota do drone). Só com um
  MDT ou o relevo global: um ficheiro importado marcado como **MDS** («Este
  ficheiro é: MDT / MDS», MDT por omissão) já os tem, e nada se soma. O
  ficheiro não vai no projecto, mas o nome e a escolha sim (`demFile`): ao
  reabrir, o painel lembra qual reimportar, e o ficheiro com o mesmo nome
  volta com a escolha gravada; outro ficheiro começa como MDT. Uma
  altura uniforme é pessimista em campo aberto; o MDS da equipa (último voo)
  é o que mais se aproxima do que se vê. O painel e a ficha dizem o modelo e
  a altura somada.
- **Limiares do preflight.** Por voo e por causa: «atrás do relevo» quando a
  fracção tapada do bloco é ≥ 5 % (`VIEWSHED_WARN_FRAC`), nota abaixo e acima
  de 0; «sinal de rádio em risco» com a mesma regra sobre a fracção à vista
  com o rádio em risco. Só pontos desconhecidos: nada. Nunca bloqueia: a
  decisão é do operador, que pode confirmar no campo.
- **Agendamento.** Os trabalhos têm uma chave com tudo o que muda o
  resultado (ponto da base, anel, cota do drone, alturas, vegetação, relevo,
  resolução): mover uma base só refaz os blocos dela, e um Ctrl+Z reaproveita
  o que já foi calculado. Depois de 350 ms sem mudanças, corre em fatias de
  12 ms (o relógio é visto a cada ponto da grelha), separadas por um
  `setTimeout`; uma mudança a meio cancela a corrida. Medido: 150 blocos de
  660 m em 260-350 ms de cálculo (2,4 s com um MDT de 1 m), fatias até 13 ms
  (25 ms com 1 m); 192 blocos no browser sem nenhuma tarefa acima de 50 ms.
  Um bloco de 660 m sem fatias leva 2-3 ms com 10-30 m e 15-22 ms com 1 m.
- **Mapa.** Camada «Bacias de visão» (desligada por omissão, lembrada neste
  aparelho): os pontos tapados como quadrados de 25 m a laranja, os à vista
  com o rádio em risco a amarelo tracejado, juntos em faixas por linha da
  grelha, e a percentagem visível de cada bloco.

## 5. Terreno

Módulos `src/utils/terrain.js`, `src/utils/demFile.js`,
`src/mission/terrainFollow.js`.

Sem tecto de altura. A altura de voo é decisão operacional (30, 80, 120,
300 m, conforme a categoria e a autorização): o seguimento de terreno sobe
o que o relevo dos lados da faixa exige e não corta nada. Quando a rota
passa os 120 m acima do solo, o máximo da categoria aberta (Reg. (UE)
2019/947, UAS.OPEN.010), o preflight mostra uma nota, que não é aviso nem
bloqueio. A maior altura acima do solo mede-se sobre o relevo com a mesma
amostragem da folga ao solo (`routeClearance.maxM`). Até Setembro de 2026 a subida lateral era cortada aos
120 m por omissão, o que tirava a protecção lateral a quem voava mais alto;
o corte continua disponível no motor (`aglCapM`) para quem o pedir.

Não há missão sem relevo. As alturas do KMZ são relativas à descolagem, e
só o relevo diz a que altura do chão se voa; sem ele a cota de referência
seria o próprio ponto de descolagem e a folga ao solo ficaria por
verificar. Por isso:

- cada geometria fechada (área desenhada, importada ou ancorada, eixo do
  corredor, linha de fachada, órbita) descarrega logo o relevo global que
  a cubra, sem espera; editar uma geometria já com relevo para lá dele
  espera 0,8 s, para não descarregar a cada vértice arrastado;
- a caixa a cobrir junta todas as geometrias do projecto (a área com as
  células das partes importadas e os pontos de inspecção, o corredor, a
  fachada e a órbita) quando o maior lado não passa de 20 km, para um só
  MDT servir todas; acima disso, a do separador aberto
  (`terrainTargetBbox`). Junta-se ainda a caixa da rota do separador
  aberto, que pode sair da geometria (círculos que passam o contorno,
  margem da área);
- o relevo global declara como coberta a extensão dos tiles descarregados
  (com o tile de margem, ~7 km a zoom 12), e não só a caixa pedida; um
  tile que não chega em 20 s conta como falhado, para uma ligação presa
  não deixar o relevo em «a descarregar» para sempre;
- uma descarga falhada volta a tentar sozinha aos 3, 10 e 30 s, e outra
  vez quando a ligação volta; só conta a descarga mais recente;
- um MDT importado nunca é trocado pelo global sem o operador o pedir (a
  DGT ou o último levantamento valem mais do que os ~30 m globais). A
  aplicação guarda o ficheiro e a sua extensão completa, e recorta-o só
  para o separador aberto (geometria e rota), não para a união de todas as
  geometrias: a grelha lida tem no máximo 2048 píxeis de lado, e a união
  de uma área com um corredor ao lado baixava a resolução (um MDT de 50 cm
  passava de ~1 m para ~3 m de grelha). Ao mudar de separador, ou quando a
  geometria cresce, o relevo volta a ser recortado do mesmo ficheiro (uma
  vez por caixa, 0,3 s depois da última mudança); só se o ficheiro acabar
  antes da rota o preflight bloqueia. Um MDT que não toca na caixa (de outro sítio) dá lugar ao
  global para essa caixa, e volta quando se regressa à geometria que ele
  cobre. A falha a ler um ficheiro fica à vista, com mensagem própria;
- o preflight bloqueia a exportação, em todos os modos, enquanto o relevo
  carregado não cobrir a caixa da rota exportada, e diz porquê: a
  descarregar, descarga falhada (com a mensagem), MDT importado que não
  cobre a rota, ou ainda nada. O próprio item traz o botão para
  descarregar o relevo global.

Relevo global: tiles Terrarium (AWS `elevation-tiles-prod`), zoom 12 por
omissão (~30 m/píxel a latitudes médias), com 1 tile de margem em todas as
direcções e trava de 600 tiles; falha se mais de 20 % dos tiles não
chegarem. Os tiles são imutáveis e ficam numa cache persistente do browser
(Cache API, `src/utils/tileCache.js`): uma área já vista carrega sem rede
e o painel diz quantos tiles vieram da cache; sem Cache API ou com a
quota cheia o fetch simples serve na mesma. Sem ligação, a mensagem de
erro diz que só as áreas já descarregadas estão disponíveis. Descodificação por píxel:

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

com a referência = base marcada com relevo, senão a cota **mínima** do
relevo debaixo da rota (`src/mission/reference.js`), a mesma cota que o
perfil, o 3D e a folga ao solo usam. Na missão de área com bases (secção
4.1) a referência é a cota mínima da ZONA: numa rota única, a da base de
referência; com blocos, a da base de CADA bloco — o bloco é recalculado
com a sua cota (os mesmos pontos: cada troço é amostrado por si e a
ligação que o antecede não entra), e as alturas exportadas desse bloco são
`AGL + terreno − cota da zona`. Sem seguir terreno as alturas ficam planas
(`AGL`) e é a altitude absoluta de cada bloco que muda (`cota + AGL`). O
3D, o perfil e a folga ao solo juntam os blocos numa só rota na cota comum
(a mais baixa das zonas), `h + cotaBloco − comum`, e não contam o troço que
começa cada bloco: não se voa (cada bloco descola da sua base). Uma base
fora do relevo deixa os seus blocos na mínima de cada bloco, e o preflight
bloqueia. A mínima, porque a altura real acima
do solo é `AGL planeado + (cota real da descolagem − cota assumida)`:
descolando em qualquer ponto da área o termo é ≥ 0 e o drone voa mais
alto do que o planeado, nunca mais baixo; o custo é GSD quando a
descolagem é acima da mínima, e é a base marcada que o recupera. Os pontos
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

Paragem nos waypoints (`waypointStops`): **cantos** são o primeiro e o
último waypoint de cada faixa (com prolongamento, as pontas prolongadas);
**intermédios** são os outros — fotos do núcleo, vértices do seguimento de
terreno e os pontos que este insere nas ligações. Com `corners` (omissão)
só os cantos param; com `all` param todos, e o tempo soma
`stopCostS = n · turnCostS(v) / 2` pelas `n` paragens intermédias
(`stripRouteStats`). Uma inversão são duas paragens, daí a metade; é um
valor deduzido, não medido (secção 16). O corredor usa a mesma regra por
troço de passagem, com as dobras como intermédios.

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

Posições por `turf.destination` (círculo geodésico), `nPts` pontos por
anel; só o último anel fecha a volta no rumo inicial (um waypoint a mais).
Rumo apontado ao POI arredondado ao grau, pitch por nível
`clamp(−round(atan((h − poiHeight)/R)), −90, +20)`. A transição entre anéis
é helicoidal: o anel termina uma corda antes do rumo inicial e o seguinte
começa nesse rumo um passo acima, pelo que o troço de ligação tem uma
corda na horizontal e o passo na vertical — nunca um segmento de
comprimento horizontal nulo: a órbita voa em curva contínua ajustada pelos
pontos (`useStraightLine` 0, sem amortecimento) e num troço vertical a
tangente horizontal fica indefinida — em voo a aeronave parava aí. `turnMode = toPointAndPassWithContinuityCurvature`
(voo curvo contínuo), tempo `L/v` sem paragens, GSD a `R` (o alcance real
ao centro do alvo, `√(R² + Δh²)`, é maior). Não modelado: colisão com a
estrutura, sobreposição vertical entre níveis (passo dado pelo operador),
oclusões.

Captura, parâmetro `capture` da configuração da órbita:

- **`photo` (anéis, por omissão)**: o descrito acima. `gimbalRotate` +
  `takePhoto` em cada waypoint; altura, pitch e sobreposição iguais em
  todas as fotografias de um nível, o que dá controlo granular para
  fotogrametria.
- **`video` (espiral)**: a mesma geometria horizontal (raio, pontos por
  volta, rumo ao POI), mas a altura sobe a cada ponto: a volta `t` sobe do
  nível `t` ao nível `t+1`, interpolando ponto a ponto (`L` níveis =
  `L − 1` voltas; um nível = uma volta a altura constante), e o último
  ponto fecha no rumo inicial à altura do último nível. Com níveis a passo
  constante, o que a interface gera, é `h₀ + (j / nPts) · passo`. O gimbal reaponta ao centro do alvo em cada ponto
  (`pitch(h)`, a descer com a altura). Acções: `startRecord` no primeiro
  ponto (depois do `gimbalRotate`, no mesmo grupo em sequência),
  `stopRecord` no último, nada nos intermédios; nenhum `takePhoto`,
  porque a câmara não fotografa enquanto grava. `photoCount` é 0, não há
  transição entre anéis, e a exportação por nível fica desactivada: a
  gravação é uma só e fatiá-la deixava os KMZ intermédios sem
  `startRecord`/`stopRecord`. O nome do KMZ leva a variante
  (`_orbit-video_nN`). Parâmetros das acções conforme
  `common-element.md`: `startRecord` com `payloadPositionIndex` e
  `useGlobalPayloadLensIndex` 0, `stopRecord` só com
  `payloadPositionIndex`; `fileSuffix` e `payloadLensIndex` omitidos,
  como no `takePhoto`.

«Vídeo + fotografia» no mesmo anel não é possível pela razão acima; a
alternativa anel a anel (uns a gravar, outros a fotografar) foi posta de
parte por deixar os dois produtos a alturas diferentes.

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
waypoint (segue a rota), gimbal −90°. Tempo `L/v + 3 s · (troços − 1)`.

Seguimento de terreno (`src/mission/corridorTerrain.js`): o motor da área
(§5) aplicado às passagens. Cada passagem é uma polilinha com dobras;
cada troço entre vértices consecutivos é perfilado à parte (densificação,
corredor de ±30 m, Douglas-Peucker com a tolerância, sem tecto), e
os vértices ficam todos, porque dão a forma à passagem. As ligações entre
passagens são amostradas com as mesmas regras. Cada passagem fica assim
sobre o seu próprio chão: numa encosta atravessada, as passagens de cima
e de baixo têm alturas diferentes, e não a do eixo. A referência é a da
área (base com relevo, senão a mínima debaixo da rota). Na foto por
waypoint os vértices são as posições de foto: o motor devolve o índice de
cada vértice na rota nova (`vertexIndex`) e as acções são reindexadas; os
pontos acrescentados pelo relevo seguem sem foto. É a diferença para a
área, que nesse modo recusa o seguimento de terreno. Estatísticas sobre a
rota 3D; nome `_corridor-tf_nN`.

Relevo partilhado: a área e o corredor entram na mesma caixa de relevo
(secção 5), para um só MDT (da DGT ou o último levantamento) servir os
dois. A cobertura do corredor verifica-se
sobre a própria rota com margem para a amostragem lateral. Preflight:
seguimento pedido sem relevo que cubra a rota é bloqueio; sem base, diz a
cota assumida e avisa acima de 10 m de desnível, como na área.

## 9A. Circular («circlegrammetry»)

Módulo `src/utils/circular.js`. A área do modo Área coberta por uma grelha
de círculos sobrepostos, cada um voado com a câmara oblíqua apontada ao
seu centro: a geometria de Bilodeau, Esau, MacDonald e Farooque (2025),
tal como o UgCS 5.5 a planeia, verificada contra o campo do artigo.

Parâmetros: raio `R` (30 m por omissão, o recomendado pelo UgCS e usado
no estudo), sobreposição entre círculos `p` (50 % por omissão), pitch do
gimbal fixo (−45° por omissão; o UgCS aceita 45 a 70), velocidade própria
e rumo das fiadas (por omissão a aresta mais longa). A altura e a
sobreposição frontal são as do separador Área.

```
s     = 2R · (1 − p)                              passo entre centros
N     = ⌈L / s⌉ × ⌈W / s⌉                         fórmula (2) do artigo
u_i   = u_mid − (cols − 1)·s/2 + i·s               grelha centrada na caixa
ext   = (cols − 1)·s/2 + R − L/2                   extensão fora da área
```

`L` e `W` são os lados da caixa da área no referencial local alinhado
com o rumo das fiadas (metros por grau do elipsóide WGS84, série
clássica). A grelha é centrada na caixa e sai da fronteira, como no
UgCS; a extensão de cada lado é a que o artigo mede na fig. 7. Fiadas
em serpentina; o sentido de rotação alterna por fiada (horário numa,
anti-horário na seguinte). Cada círculo entra pelo ponto virado ao
círculo anterior (o primeiro pelo lado oposto ao segundo), dá a volta
completa e sai pelo mesmo ponto, que se repete sem fotografia; a ligação
entre círculos da mesma fiada mede assim exactamente `s`. Rumo ao centro
em cada ponto, pitch fixo, `takePhoto` em cada ponto, `turnMode`
`toPointAndPassWithContinuityCurvature` (`useStraightLine` 0), como a
órbita.

Fotos por círculo: a pegada transversal à distância do eixo óptico
(`altura / sin|pitch|`) vezes `(1 − sobreposição frontal)` dá a corda;
`nPts = clamp(⌈2πR / corda⌉, 12, 120)`; sem câmara, 24. No campo do
artigo (P1 a 60 m, 80 %) dá 12 pontos por círculo; o UgCS usou cerca de
20 (399 waypoints em 20 círculos), o que corresponde a ~86 % ao longo do
círculo. Tempo: `L₃D/v + 2·(N − 1)·v/1,7`, uma inversão à saída e outra
à entrada de cada ligação; estimativa por calibrar em voo. GSD no eixo
óptico (`computeGSD` com o pitch).

Seguimento de terreno por ponto: `h = AGL + (cota − referência)`, com a
cota de referência da área (§5: base com relevo, senão a mínima da
área); sem densificação, para as acções de foto não mudarem de índice.
Um ponto sem relevo (fora do MDT, ou um pixel sem dados) usa a cota mais
alta do seu círculo, o que o põe mais alto e nunca mais baixo; um círculo
sem relevo nenhum é erro, e sem cota de referência também: o preflight
bloqueia, nunca saem alturas planas. A cobertura do relevo mede-se sobre
os próprios círculos, que saem da área até um raio, e não sobre a área.
Blocos por círculos inteiros: o bloco fecha quando o círculo seguinte não
cabe no tempo útil da bateria.

Obturador: a distância entre fotos ao longo do círculo é a corda
`2R · sin(π / nPts)`; o aviso compara-a, a dividir pela velocidade, com o
intervalo mínimo do payload (antes usava, por engano, o intervalo das
grelhas da área).

A missão circular não tem geometria própria: usa o polígono da área e só
existe no projecto depois de se abrir o separador (`enabled`), até ser
retirada no painel. Antes, qualquer área gerava uma missão circular que o
resumo do projecto somava.

Conselho de sobreposição (`overlapAdvice`): o número de colunas mantém-se
enquanto `p ≤ 1 − L / (2R · cols)`, e o de linhas enquanto
`p ≤ 1 − W / (2R · rows)`; o painel mostra o intervalo `[min, max]` de
sobreposições com o mesmo `N` e sugere o máximo, porque no topo do degrau
os círculos saem menos da área (secção 4.2 do artigo).

Verificação contra o artigo (93 × 131 m, R = 30 m): 50 % → 5 × 4 = 20
círculos a 30 m de passo, 25 % → 3 × 3 = 9 a 45 m; extensão de 25 m e
28 m (o artigo mede 28 e 24 m a 50 %, e 28 e 9 m a 25 %, com a
orientação da fiada trocada em relação à nossa). Não modelado: a
«cintura» de passagens de baixa inclinação que o artigo sugere para a
copa baixa; imagens nadir (o modo é só oblíquo, e o ortomosaico não está
avaliado); calibração do tempo em voo.

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
`takeOffSecurityHeight` 30 m por omissão.

Acções de segurança (`src/mission/safety.js`), escolhidas no cartão «Bases
e segurança» da área e no cartão «Acções de segurança» dos outros modos, e
as mesmas em todos: `finishAction` (no fim da missão: `goHome`, por
omissão, `noAction`, `autoLand` ou `gotoFirstWaypoint`), `exitOnRCLost`
(com o sinal do comando perdido: `executeLostAction`, por omissão, que
interrompe a missão, ou `goContinue`, que acaba a rota sem comando e depois
faz a acção de fim) e `executeRCLostAction` (a acção ao interromper:
`goBack`, por omissão, `landing` ou `hover`; só vale com
`executeLostAction`). Os parâmetros de exportação de todos os modos
(`buildAreaExport` e os de `exportParams.js`: corredor, circular, fachada,
órbita e pontos de inspecção) levam-nas, e os blocos herdam-nas; saem no
`missionConfig` do `template.kml` e do `waylines.wpml`. Ficam no projecto
(`safety`); um projecto anterior abre com as omissões, que são os valores
que a exportação escrevia antes. Na fronteira, um valor fora das listas cai
no primeiro valor permitido.
O `Folder` do `waylines.wpml` leva `distance` (m) e `duration` (s), de onde
o Pilot 2 tira o progresso e o tempo em falta da rota: a distância é o
comprimento 3D (`routeLengthM`), a duração é a previsão do plano
(`durationS`) ou, sem ela, distância / velocidade. Por bloco, a do bloco,
sem trânsito.
Pontos de passagem (`passThrough`, lista paralela aos waypoints): no
`waylines.wpml`, `waypointTurnMode` =
`toPointAndPassWithContinuityCurvature`, `useStraightLine` = 1 e
`waypointTurnDampingDist` = `min(1 m, 0,45 × troço adjacente mais curto)`
(3D), que cumpre a regra da DJI de cada troço ser maior do que a soma das
curvas das suas pontas; abaixo de 0,2 m, e sempre no primeiro e no último
waypoint, o ponto fica com o modo da missão. No `template.kml` esses
pontos levam `useGlobalTurnParam` = 0 e `waypointTurnParam` próprio. Sem a
lista, o XML é o de sempre.

Validação na fronteira (`validateExportParams`), que lança
`MissionExportError` em vez de escrever o ficheiro: waypoints presentes e
≤ 65536, coordenadas finitas em [−180, 180] × [−90, 90], alturas finitas,
altitude finita > 0, velocidade em (0, 30] m/s, enums WPML numéricos,
`photoIntervalM ≥ 0`, RTH em (0, 1500], pitch em [−120, 60], rumos em
[−180, 360), `takeOffSecurityHeight` em (0, 200], intervalos de disparo
inteiros, crescentes e dentro da rota. Caracteres XML ilegais e substitutos
isolados são retirados dos textos. Blocos: um KMZ por voo num zip, com
waypoints, acções e intervalos de disparo locais ao bloco (nomes em
§11.3); a órbita por nível e os blocos da circular continuam com
`<nome>_b01.kmz`, ... pelo id.

Enums de aeronave e payload (`src/data/drones.js`) vêm da documentação
DJI (`dji-sdk/Cloud-API-Doc`), excepto os dois do M300 que 81 KMZ reais
exportados pelo Pilot 2 (M300 RTK, 2023–2026) contradizem: os payloads
PSDK de terceiros aparecem sempre como `65535/0`, e não como o `65534`
("PSDK Payload Device") da tabela, e o P1 como `50/1` e não `50/0`. Esses
ficheiros declaram ainda o namespace `wpmz/1.0.3`, enquanto a exportação
escreve `1.0.2` — observação registada, sem alteração, por não haver
evidência de que o cabeçalho 1.0.3 seja aceite com os elementos que
escrevemos, nem de que o 1.0.2 seja recusado. Nenhum enum foi ainda
testado num comando real (ver `README`).

### 11.1 KML da área

O KML que a aplicação exporta tem um só `Document`, um só `Placemark` e um
só `Polygon`, fechado, com `tessellate` e `altitudeMode clampToGround`, mais
os `innerBoundaryIs` dos buracos. Não leva estilos, pastas, ponto de base
nem GCPs: o parser de KML do DJI Pilot 2 é estrito e um ficheiro com várias
geometrias é recusado ou importado em branco. O caso de uso é exportar a
área e fazer o resto das configurações no comando.

O construtor (`buildAreaKML`) aceita extras — base, GCPs e uma pasta com as
faixas — que servem para inspecção em SIG e nunca para levar ao comando.

### 11.2 Conformidade com a especificação WPML

Auditada em 2026-09-24 contra `dji-sdk/Cloud-API-Doc` (template.kml,
waylines.wpml, common-element), campo a campo. Corrigido nesta auditoria:

- `globalTransitionalSpeed` tem intervalo [0, 15] m/s: passa a sair
  limitada a 15, e o M300 RTK deixa de oferecer 17 m/s (os 81 KMZ do comando
  nunca passam de 15).
- `gimbalPitchRotateAngle` tem intervalo por gimbal (M3E/M3T [−90, 35];
  P1 [−120, 30] pela ficha técnica; M4 série [−90, 35] pela ficha técnica, a
  confirmar): a fachada aceitava até +45°. Cada payload declara o intervalo
  (`src/data/drones.js`), a exportação recorta o pitch e o preflight avisa
  do valor pedido.
- `payloadParam.imageFormat` nomeia a lente nos payloads multi-lente: sem
  ele um levantamento térmico no M4T dispararia a grande-angular, que o
  Pilot 2 assume por omissão. O par do M4T passa a escrever `wide` / `ir`.
- `takeOffSecurityHeight` tem intervalo [1,2, 1500] m no comando; a
  fronteira aceitava (0, 200].

Verificado e conforme: enums de `finishAction`, `exitOnRCLost`,
`executeRCLostAction`, `flyToWaylineMode`, `waypointTurnMode`,
`waypointHeadingMode`; `waypointHeadingAngle` em [−180, 180];
`waypointTurnDampingDist` > 0 só onde é obrigatório e nunca acima de 0,45
do troço adjacente; `useStraightLine` coerente com o modo; `actionTriggerParam`
> 0; `coordinateMode` WGS84 e `heightMode` relativeToStartPoint;
`positioningType` é opcional e não afecta a execução.

Documentado como obrigatório e omitido, tolerado no primeiro voo real do
M3E: `fileSuffix` da acção `takePhoto`; `payloadParam` nos payloads de uma
só lente. Fica registado, não alterado, porque o ficheiro que voou é o que
está validado. Sem uso: `coordinateTurn` global (amortecimento fixo sem
verificação do troço) não é alcançável pela interface. A especificação não
fixa uma distância mínima entre waypoints; os 0,5 m do preflight são o
mínimo do SDK da DJI.

### 11.3 Voos de uma área dividida: nomes e exportação por base

Módulos `src/mission/flightFiles.js`, `src/mission/areaExport.js`,
`src/mission/fieldSheet.js` e `src/mission/basesKml.js`. No campo
trabalha-se base a base (chega-se à base B e voam-se os voos dela), e o
Pilot 2 lista as missões pelo nome do ficheiro, que é também o título da
missão dentro do KMZ (`<name>` da pasta do `template.kml`). Por isso:

- **Um KMZ por voo**, com o rótulo do voo: `<missão>_<tipo>[-variantes]_<voo>.kmz`,
  com o nome e as variantes de `buildExportName` (E3.1), ex.:
  `corta-norte_area-tf_A-1.kmz`, `corta-norte_area-crosshatch-nadir-tf_B-3.kmz`.
  Sem bases, o voo é o número (`corta-norte_area_1.kmz`). Só letras ASCII,
  algarismos, `-` e `_` (o nome da missão é limpo como sempre; um voo sem
  base, `?-3`, que o preflight bloqueia, sairia `x-3`). Com 10 voos ou mais
  o número leva zeros à esquerda no ficheiro (`A-01` ... `B-10`), para a
  lista do Pilot 2, ordenada pelo nome, sair pela ordem de voo; no mapa o
  rótulo continua `A-1`. Nomes repetidos não acontecem (o número do voo é
  único); se acontecessem, o segundo leva `-b<id>`, e o ZIP recusa dois
  ficheiros com o mesmo nome em vez de escrever um por cima do outro.
- **Escolhas** (painel das bases, atrás do mesmo preflight do botão do
  cabeçalho): «Todos os voos (ZIP)» = `<missão>_<tipo>[-variantes]_voos.zip`
  (é também o que o botão do cabeçalho exporta); «Voos da base B (ZIP)» =
  `..._base-B.zip`, só os voos dessa base; «Um voo (KMZ)» = o KMZ desse voo
  sozinho. Dentro de um ZIP, os KMZ vão pela ordem de voo (base a base,
  pela ordem dos rótulos, e em cada base pela ordem do mosaico).
- As alturas de cada KMZ são as do seu bloco (cota da zona da sua base,
  §4.1), qualquer que seja a escolha: exportar só a base B dá exactamente
  os mesmos ficheiros de B que exportar tudo.
- Uma missão sem divisão continua a sair num só KMZ, `<missão>_<tipo>[-variantes].kmz`.
- Antes (até à 1.3.0) os ficheiros dos blocos da área chamavam-se
  `..._bNN.kmz` pelo id do bloco e o ZIP `..._blocos.zip`; nenhum ficheiro
  nem teste dependia desses nomes, e o id do bloco continua na descrição do
  KML de campo.

**Ficha de campo por base** (`baseFieldSheets`), na checklist de campo e
no relatório: rótulo; coordenadas WGS84 com 6 casas (~0,1 m) e ligação
`https://www.google.com/maps/search/?api=1&query=lat,lon` (abre a aplicação
de mapas no telemóvel) mais `geo:lat,lon?q=lat,lon(Base B)` (RFC 5870);
zona («descolar até R m do ponto», o raio efectivo, e quando reduzida o
pedido, o desnível e a distância que a limitaram); cota de referência e
«voo entre 0 e +X m acima do planeado»; voos com o tempo do bloco mais o
trânsito de ida e volta no pior caso da zona, e o nome do KMZ de cada um;
conjuntos de baterias que a base pede (um por voo) contra os da equipa
(`flightsVsSets`); alcance visual da aeronave e o pior caso dos voos.

**KML «Bases e blocos»** (`buildBasesKML`, `<missão>_bases.kml`), para o
Google Earth ou a navegação no telemóvel — nunca para o Pilot 2: pasta
«Bases» (um ponto por base, com a ficha na descrição), pasta «Zonas de
descolagem» (círculo de 72 lados com o raio efectivo), pasta «Blocos
(voos)» (contorno de cada bloco — a célula do mosaico, ou o invólucro da
rota no corte por área — numa `MultiGeometry` com um ponto no centro, que
é onde o Google Earth escreve o rótulo do voo). Cores das bases do mapa
(`aabbggrr`). As descrições são HTML: cada valor é escapado como HTML e a
descrição inteira como XML.

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
É o preflight do separador aberto, e desactiva todos os botões de
exportação dessa missão: o do cabeçalho, que exporta a missão do
separador aberto, e os de cada painel. Antes só o do cabeçalho estava
ligado ao preflight, e exportava a área qualquer que fosse o separador.
Bloqueios (desactivam o KMZ): sem plano; plano com erro; relevo que não
cobre a rota exportada, em todos os modos (a descarregar, descarga
falhada, MDT importado curto, ou nenhum: secção 5); seguir terreno com
foto por waypoint; seguir terreno ligado sem relevo a cobrir a área; erro
do cálculo do terreno; mais de 65535 waypoints numa rota (a maior, com
blocos); waypoints consecutivos a menos de 0,5 m em 3D na rota exportada (o mínimo
que a DJI aceita), em todos os modos — as verificações de rota corriam só
na área; é o mínimo do SDK da DJI, a especificação WPML não fixa um. Nota (não é aviso): rota acima de 120 m do solo, o máximo da categoria aberta. Avisos: rota acima de 2000 waypoints; tecto AGL do
payload (`altitude + tolerância` com seguimento de terreno); obturador;
sobreposição no pior caso abaixo de 60/50 % (secção 2); arrastamento
acima de 1 px a 1/500 s; MDT com alturas elipsoidais; taxa de subida
exigida num segmento acima da velocidade de subida da aeronave
(`Δh / (comprimento / v)`, M3E/M4T 6 m/s, M300 5 m/s); segmento acima de
5 km; tempo acima do útil de uma bateria (missão com trânsito de ida e
volta, ou por bloco com `timeS + transitS`); foto por waypoint sem paragem
(«Só nos cantos»), por validar em voo (área e corredor); base a mais de
2 km da área; base fora do relevo carregado (assumida a cota mínima da
área); sem base numa área com mais de 10 m de desnível (cota assumida e
desnível na mensagem); folga mínima ao solo abaixo de 15 m. Bloqueios
acrescentados: rota que entra no relevo (folga negativa, amostrada a 40 m
sobre o relevo carregado, em todos os modos); base a uma distância cujo
trânsito de ida e volta excede o tempo útil de uma bateria. Lembretes: sem
base em terreno plano; alturas relativas à descolagem.

Bases múltiplas, bloco a bloco (missão de área com blocos e bases,
`blockBaseItems`; os blocos nomeados pelo voo e pelo id, «Voo B-4 (bloco
7)», as bases pelo rótulo): voo fora do alcance visual da sua base no pior
caso da zona, com a distância (aviso); tempo do bloco com o trânsito de
ida e volta da sua base acima do tempo útil (aviso, o nível de sempre da
bateria), e bloqueio quando só o trânsito já o passa (como a base
inalcançável); base fora do relevo carregado (bloqueio: a cota de
referência dos seus voos é desconhecida); bloco sem base com bases no
projecto (bloqueio; não devia acontecer); zona reduzida junto a um
desnível, com o raio, o pedido, o desnível e onde (nota; também na rota
única com bases). Com blocos e bases deixam de se aplicar o aviso de base
a mais de 2 km da área e a bateria por bloco sem trânsito.

Bacias de visão (secção 4.3), por voo e por causa: parte do bloco atrás do
relevo visto do ponto da base (aviso a partir de 5 %, nota abaixo,
«Voo A-3: 18 % do bloco fica atrás do relevo visto da base A, tapado a
~420 m»), e parte à vista com o relevo em 60 % da zona de Fresnel do rádio
(«sinal de rádio em risco», a mesma regra). Nada enquanto se calcula, com a
base fora do relevo ou só com pontos desconhecidos.

## 15. Tabela de constantes e tolerâncias

| Grandeza | Valor | Módulo |
|---|---|---|
| Metros por grau de latitude / longitude | 110574 / 111320·cos(lat) | units.js |
| Faixas máximas por plano | 2500 | geo.js |
| Troço mínimo de faixa | 1 m | geo.js |
| Aceleração de viragem | 1,7 m/s² → custo `v/1,7` por inversão | geo.js |
| Células máximas do mosaico | 400 | geo.js |
| Lado mínimo do mosaico | 10 m | geo.js |
| Lado por bateria: tecto / piso / arredondamento | 500 m (≥100) / 50 m / 10 m | geo.js |
| Trânsito de dimensionamento do quadrado | (2·raio + (1+√2)·L) / v (base num canto) | baseLayout.js |
| Mosaico: tira / deslocamentos / fusão no mosaico manual | fillFrac < 0,25 / 4×4 (2×2 > 150, 1×1 > 600 células) / ≤ 1,25·L² | squareMosaic.js |
| Mosaico antigo → novo: célula desactivada | ≥ 50 % da área nas células antigas desactivadas | mosaicLegacy.js |
| Mosaico refeito: herança / mesma área / área movida | célula antiga ≥ 50 % da nova / ≥ 50 % da menor em comum / translação ±1 m | cellCarryOver.js |
| Proposta de bases: sítio utilizável | zona ≥ 50 % do raio pedido, com relevo (`SITE_MIN_ZONE_FRAC`) | baseSites.js |
| Proposta de bases: bloco aceita o sítio | rádio livre em ≥ 95 % dos pontos (`SITE_RADIO_OK_FRAC`) | baseSites.js |
| Proposta de bases: altos do relevo | grelha de 100 m + margem = VLOS (≤ 40 000 nós); 3 por bloco, a ≥ 2 nós | baseSites.js |
| Proposta de bases: bacia grosseira | grelha 60 m / raio a 20 m (`SITE_VIEW_GRID_M`, `SITE_VIEW_STEP_M`) | baseSites.js |
| Proposta de bases: desempates | rádio ±0,5 % / vista ±0,5 % / cota ±0,5 m / desnível ±0,5 m | takeoffZones.js |
| Proposta de bases: fatia | 12 ms | useBaseProposal.js |
| Bacias de visão: olhos / comando | 1,7 m / 1,5 m acima do ponto da base (Configuração, 1-5 m) | equipment.js, viewshed.js |
| Bacias de visão: grelha / passo do raio / pontas | 25 m / 10 m (resolução do MDT; global ~30 m; mínimo 1 m) / 1 passo | viewshed.js, viewshedPlan.js |
| Curvatura e refracção | d·(D − d)·(1 − 0,13)/(2·6371 km) | viewshed.js |
| Rádio: fracção da 1.ª zona de Fresnel / frequência | 60 % livre / 2,4 GHz | viewshed.js |
| Vegetação e obstáculos (só MDT ou global) / clareira da base | 0-60 m por missão / 30 m | viewshedPlan.js, viewshed.js |
| Bacias de visão no preflight: aviso / nota | ≥ 5 % do bloco / > 0 (atrás do relevo; rádio em risco à vista) | preflight.js |
| Bacias de visão: espera / fatia | 350 ms / 12 ms | useViewsheds.js |
| Histórico de edição (Ctrl+Z) | 100 passos (área, células, bases, atribuições) | useAreaGeometry.js |
| Zona de descolagem: raio / desnível máximo | 100 m / 10 m (Configuração; raio próprio por base 0-500 m) | equipment.js, bases.js |
| Zona: amostragem | anéis a 10 m, 16 azimutes; cota = mínima; ganho = máx − mín | takeoffZones.js |
| Alcance visual (VLOS) | M300 RTK 1000 m; M3E, M4T, outras 500 m | equipment.js |
| Pior caso: VLOS / trânsito | vértice mais afastado + raio / (d₁ + r) + (d₂ + r) | takeoffZones.js |
| Máximo de voos por base na proposta | 0 = sem limite (0-50) | equipment.js |
| Bases na caixa do relevo | a menos de 3 km da área, com 500 m à volta | App.jsx |
| Reserva de bateria aplicada pelo motor | 0 % (já no tempo útil; projectos antigos: 30 % convertidos ao abrir) | equipment.js, project.js |
| Tempo útil por conjunto, M300 RTK | TB60 25 min / TB65 28 min | equipment.js |
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
| Circular: círculos / pontos por círculo / pitch | 400 / [12, 120] / [−90, −20] | circular.js |
| Corredor: banda de validade | ±max(0,25 m, 1 %) | corridor.js |
| GCPs: n / recuo / separação | [5, 25] / max(15 m, 3 %·√A) / 10 m | gcp.js |
| WPML: waypoints / velocidade / RTH | 65536 / 30 m/s / 1500 m | exporters.js |
| Preflight: waypoints (bloqueio / aviso) | 65535 / 2000 | preflight.js |
| 3D: malha do terreno / passagens de preenchimento | 200×200 / até 201 | Map3D.jsx, terrainGrid.js |
| Importação: vértices antes de simplificar | 400 | importArea.js |

## 16. O que não é modelado e calibração prevista

Não modelado, em resumo: dinâmica do voo (raio de viragem, vento — a
aceleração entra apenas no custo de viragem); rotações de gimbal, que nas
missões oblíquas do Pilot 2 custam entre 13 e 110 s por faixa, uma ordem
de grandeza acima de uma inversão de sentido, pelo que o tempo de uma
missão oblíqua pode ser o dobro do previsto; o comprimento 3D por bloco,
que continua horizontal quando a missão é dividida com seguimento de
terreno; as paragens nos vértices do terreno no lado dos quadrados por
bateria, que é calculado antes de o perfil existir (o tempo de cada bloco
já as conta, e o preflight avisa); atitude da aeronave (rolamento/arfagem)
na pegada; obstáculos
fora da folga da fachada; conversão entre datums verticais (só a
declaração); retornos múltiplos e padrão de varrimento do LiDAR; a
distribuição estatística dos erros (a incerteza é propagada por
intervalos, com os extremos das fichas técnicas). Nas bacias de visão: a
zona de descolagem não é varrida (só o ponto da base); vegetação e
construções só como altura uniforme ou pelo MDS; o rádio é só a geometria da
zona de Fresnel (sem diagrama das antenas, potência, interferência nem
multipercurso), à frequência mais exigente.

Calibração com logs de voo (E3.3, prevista para Setembro de 2026), com um
ponto de inserção único no código para cada grandeza:

1. tempo de viragem medido = mediana de (tempo entre o fim de uma faixa e
   o início da seguinte − distância da ligação / v), a substituir
   `TURN_ACCEL_MS2`. **Pré-calibrado**, não calibrado: o valor de
   1,7 m/s² vem do ajuste de `L₃D/v + n·(v/a)` ao `wpml:duration` de 72
   missões nadir reais exportadas pelo DJI Pilot 2 (M300 RTK, ~1344
   faixas, 2023–2026), com erro RMS de 1,9 % contra 5,2 % do modelo de
   3 s constantes, e estável (a entre 1,61 e 1,75 m/s²) em 20 variantes
   do critério que conta as faixas. Isso alinha-nos com a **previsão** do
   Pilot 2, não com voo medido: o `wpml:duration` é o modelo da DJI, não
   um cronómetro;
2. tempo útil real por tipo de bateria e aeronave, na Configuração
   (equipamento) ou nos valores por omissão de `src/mission/equipment.js`;
3. custo de uma paragem intermédia (`stopCostS`, com «Em todos»):
   **deduzido**, metade de uma inversão, porque uma inversão são duas
   paragens. Medir no registo de um voo com paragem em cada foto (o
   primeiro voo do M3E, 139 fotos, é um) como mediana do tempo parado mais
   o de travar e acelerar em cada ponto;
4. velocidade efectiva em faixa = distância voada em faixa / tempo em
   faixa; se o rácio for estável e < 1, entra como factor multiplicativo
   nos dois modelos de tempo. Ajustado sobre as mesmas 72 missões do
   Pilot 2 o factor dá 1,02 — indistinguível de 1 e do lado errado para
   ser uma penalização —, pelo que **fica em 1,0** enquanto não houver
   voo medido que mostre o contrário.

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
- Bilodeau, M. F., Esau, T. J., MacDonald, M. T., Farooque, A. A. (2025).
  Circlegrammetry for drone imaging: Evaluating a novel technique for
  mission planning and 3D mapping. *ISPRS Open Journal of Photogrammetry
  and Remote Sensing*, 18, 100111.
- DJI, `dji-sdk/Cloud-API-Doc`: `template-kml.md`, `waylines-wpml.md`,
  `common-element.md` (WPML 1.0.2).
- Mapzen/AWS Terrarium: `elevation-tiles-prod`, codificação RGB.
- YellowScan Mapper+ (Livox AVIA): ficha técnica, consultada em 2026-08-18.
