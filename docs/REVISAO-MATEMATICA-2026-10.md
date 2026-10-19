# Revisão da matemática da missão (Outubro de 2026)

Segunda vaga da revisão completa da aplicação (a primeira, da exportação
KML/KMZ contra a especificação WPML da DJI, está em
`REVISAO-EXPORTACAO-2026-10.md`). Pergunta desta vaga: **o que o planeador
calcula está certo para o planeamento de voo fotogramétrico e LiDAR, bate
certo com o `METODOS.md` e aguenta os casos-limite?**

**Estado (2026-10-19):** relatório entregue; nenhuma correcção aplicada
ainda — os pacotes da secção 5 aguardam aprovação.

## 1. Método

Três agentes de revisão (Claude Opus 5.5), cada um com um domínio, a ler
primeiro o `METODOS.md` (o método pretendido e as referências) e depois o
código função a função, a confrontar (a) código contra METODOS, (b) os
dois contra a prática fotogramétrica, (c) casos-limite numéricos e (d) a
cobertura dos testes. Cada afirmação não óbvia foi verificada com scripts
Node sobre os módulos reais (a 39,5° N); os achados principais foram
depois confirmados no código por mim antes de entrarem aqui. Os scripts
dos agentes ficaram fora do repositório; os testes a criar estão listados
em cada achado.

| Domínio                                                           | Módulos                                                                                                     | METODOS                  | Achados                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| G — sensor, grelha de área, tempo e baterias                      | `units.js`, `geo.js`, `drones.js`, `areaPlan.js`, `squareMosaic.js`, `blocks.js`, `equipment.js`            | §1–§4, §6, §15           | 15 (1 bloqueia, 7, 7)    |
| T — terreno, datums, bases e zonas, alcance visual, preflight     | `terrain.js`, `verticalDatum.js`, `demFile.js`, `takeoffZones.js`, `baseLayout.js`, `viewshed*.js`, preflight | §5, §12, §14, §16        | 13 (2 bloqueiam, 7, 4)   |
| E — fachada, órbita, corredor, circular, GCPs, pontos de inspecção | `faceMode.js`, `orbit.js`, `corridor.js`, `circular.js`, `gcp.js`, `inspect.js`, `exportParams.js`          | §7–§10                   | 14 (3 bloqueiam, 5, 6)   |

Classificação, como na primeira vaga: **Bloqueia** = uma missão voada
ficaria errada ou insegura, ou os números do planeador mentem de maneira
que muda decisões; **Errado mas funciona** = errado, com efeito pequeno
ou raro; **Melhoria**.

## 2. Resumo

42 achados: 6 bloqueiam, 19 errados mas funcionam, 17 melhorias. Nenhum
é um erro de fórmula no sensor (pegada, GSD, espaçamento, intervalo: tudo
conforme §2 e verificado); os problemas estão **no que o modelo de tempo
não conta** (prolongamento, fiada e margem no bloco por bateria; inversões
e trânsito nos blocos do circular; trânsito e baterias da rota única), **no
que o relevo não verifica** (buracos no modelo tratados como cobertos;
trânsitos base ↔ rota nunca amostrados; folga medida na mesma grelha que a
gerou) e **em geometria dos modos especiais** (fachada com pitch ≠ 0 e nos
cantos). O resto são números apresentados ao operador que não são os
voados (margem das faixas com células, densidade LiDAR, contagem de fotos,
corda da órbita) e divergências entre o METODOS e o código (3 s por
viragem; EPSG de Cascais).

## 3. Achados que bloqueiam

**M2-G1 — O lado do bloco por bateria ignora o prolongamento, a fiada e
a margem.** `squareSideForBattery` (`geo.js:344-370`),
`squareSideWithBaseTransit`/`cellFitsBattery` (`baseLayout.js:442-497`) e
`useAreaGeometry.js:189-214` dimensionam o quadrado com
`(L²/s + 2L)/v + n·v/1,7`, sem `overshoot`, `tieLine` nem `bufferPct`; a
célula voa faixas de `L + 2o`, a fiada (`L + 2o` mais ~L/2 de ligação) e,
com margem, a célula alargada `pct/100·L/2` de cada lado
(`areaPlan.js:47-54`). Medido, blocos cheios com o trânsito de
dimensionamento: Mapper+ a 60 m, 50 %, 5 m/s, TB60 25 min, prolongamento
30 m e fiada → L = 460 m e **28,0 min (112 % do útil)**; só prolongamento →
101 %; P1 a 100 m, 80/70, 7 m/s: margem 10 % → 107 %, 20 % → 127 %. Sem
estas opções o modelo dá 92–100 %, ou seja, está certo. Cada voo come 2–7
min da reserva; o preflight avisa em todos os blocos e o operador baixa o
tecto à mão; para o LiDAR o modo bateria deixa de servir. Correcção: passar
as três opções às duas funções; prolongamento `b += 2o/(s·v)`,
`c += 2o/v`; fiada uma só vez, fora da divisão por passagens,
`T = (útil − trânsito − (1,5L + 2o)/v − v/1,7)/passagens`; margem:
dimensionar `L·(1 + pct/100)`. Protótipo: L = 410 m → 23,8 min (95 %).
Teste a criar: a célula do mosaico por bateria, planeada com as opções da
missão, mais o trânsito, fica ≤ útil (`tempo.test.mjs:81-109` só compara
o modelo consigo próprio). Confiança alta.

**M2-T1 — Relevo em falta debaixo da rota passa sem aviso nem
bloqueio.** `terrain.js:619-622`: a amostra sem dados herda a última cota
válida (ou a referência); `terrain.js:345/:400`: até 20 % de tiles
falhados são aceites e a caixa inteira é dada como coberta;
`clearance.js:92-93` salta a amostra sem relevo; a cobertura é medida por
caixa (`useTerrain.js:26-30`, `App.jsx:1432-1443`); a zona ignora as
amostras sem dados (`takeoffZones.js:139`); os avisos de `terrainResult`
nunca entram no preflight (ao contrário do que diz `baseSites.js:9`).
Verificado: colina de 80 m num buraco de 250 m de raio, AGL 60 m — com
seguir terreno a folga calculada é 60,0 m e a real **−10,1 m**; com altura
plana 51,1 m e **−19,0 m**; o preflight só mostra «alturas relativas». A
zoom 12 um tile tem ~7,5 km de lado: com 9 tiles um em falta é aceite. Uma
zona parcialmente fora de um MDT importado tem a mínima só na parte
válida. Correcção: `routeClearance` e `terrainRangeAlong` devolvem
`noData` (rota e corredor ±30 m); preflight **bloqueio** `terrain-holes`
com a fracção e o primeiro ponto; `loadTerrain` volta a pedir os tiles
falhados que tocam a caixa antes de dar o relevo como pronto;
`computeTakeoffZone` marca `partial`; os avisos de `terrainResult` entram
no preflight. Teste: `elevationAt` nulo sobre uma colina tem de dar um
`block` em `preflightArea`. Confiança alta.

**M2-T3 — Os trânsitos base → 1.º waypoint e último waypoint → base não
são verificados contra o relevo.** `baseLayout.js:187-192` calcula só a
distância; `App.jsx:1343-1351` tira os troços entre blocos da verificação;
`preflight.js:47-66`. O KMZ sai com `flyToWaylineMode` `safely`: pela
especificação a aeronave sobe na descolagem à altura relativa do 1.º
waypoint e voa na horizontal até ele; o regresso é em linha recta à maior
entre a altura actual e a de RTH. Exemplo: base num vale com a mínima da
zona a 100 m, área a 150 m, AGL 60 → h₁ = 110 m, trânsito a 210 m; uma lomba
de 230 m entre as duas é atravessada 20 m abaixo do topo e nenhum número
do planeador o mostra. Correcção: `transitClearance(zone, wp, h,
elevationAt)` — amostrar o segmento do pior ponto da zona ao 1.º e ao
último waypoint às cotas `refElev + max(h₁, takeOffSecurityHeight)` e
`refElev + max(h_último, RTH)`; bloqueio com folga < 0 e aviso abaixo de
15 m, por voo e na rota única. Confiança média (o comportamento de
`safely` vem da especificação, não de um voo). Testes: nenhum.

**M2-E1 — Os blocos do circular não cabem na bateria.**
`circularBlocks` (`circular.js:375-396`) testa o encaixe de cada círculo
com `routeStats(..., { turns: 0 })` — só deslocamento —, enquanto o tempo
do bloco em `close()` soma `2·(círculos − 1)` inversões de `v/1,7`; nenhum
conta o trânsito, e o resumo (`App.jsx:1167`) recebe os blocos sem
`transitS`. Medido (600 × 400 m, R 30, 50 %, 60 m, 12 pontos por círculo,
20 min úteis): a 8 m/s cada bloco dura **1591 s para 1200 úteis (+33 %)**;
a 5 m/s +11 %; a 12 m/s +77 %. O painel anuncia «N blocos por bateria (20
min úteis)» e o preflight só compara o total. Correcção:
`addS = cur ? timeOf(cur.end − 1, end) + 2·turnCostS(speed) : timeOf(c.start, end)`,
trânsito `2·d(base, wps[c.start])/v` no orçamento e `transitS` no bloco.
Teste: `circular.test.mjs:224` só conta blocos; acrescentar
`timeS ≤ usableS` (hoje falha). Confiança alta.

**M2-E2 — A fachada com pitch ≠ 0 deixa face sem imagem.**
`faceMode.js:125-161,195,221`: pegada, alturas das passagens, passo
vertical, `uncoveredBottomM` e GSD são de câmara nivelada (§7 diz-o);
`gimbalPitch` só é copiado para o `perWaypoint`, mas o campo
(`FacePanel.jsx:154`) aceita −90° a +45° sem aviso. Com pitch `p` e
meia-abertura vertical `v = atan(sH/2f)` a banda vista a `d` é
`[h + d·tan(p−v), h + d·tan(p+v)]`. M3E, face de 30 m, d = 25 m, 70/70 %:
−10° deixa 5,2 m do topo sem imagem, −20° 9,8 m (33 %), −30° 14,2 m
(47 %); +20° deixa 9,8 m do pé; o GSD no centro piora `1/cos p`; as
estatísticas mostram a face coberta. Correcção: `first = max(piso,
−d·tan(p−v))`, `last = H − d·tan(p+v)`, `vStep = d·(tan(p+v) −
tan(p−v))·(1−o)`, `uncoveredBottomM = max(0, first + d·tan(p−v))`,
GSD a `d/cos p`, recusar `|p| + v ≥ 90°` (a alternativa mínima é fixar o
pitch a 0 e avisar). Teste: com p = −20°,
`heights.at(−1) + d·tan(p+v) ≥ H`. Confiança alta.

**M2-E3 — Nos cantos da fachada o drone fica a menos do afastamento.**
`offsetPolyline` (`faceMode.js:23-40`) usa mitra até 132° de deflexão e,
acima, um só ponto na bissectriz a `d` do vértice, sem remover laços. O
afastamento é o parâmetro de segurança. Distância mínima à face medida
(M3E, d = 25 m): canto convexo de 135° → 11,9 m, 150° → 9,3 m, 170° →
6,2 m; V côncavo de 30° → 7,7 m; côncavo de 90° com o segundo troço de 15
m → 15,0 m; U de 60 × 40 m voado por dentro → 14,9 m e o troço do meio sai
invertido, com o rumo a apontar para longe da face. `checkFaceClearance`
só olha ao longo do rumo (apanha os cantos agudos com DSM local, não o U
nem o troço curto; sem DSM nada). Correcção: reutilizar
`offsetRuns`/`offsetPolylineMiter` do corredor (junta redonda no lado
convexo com rumo ao vértice; esquadria e critério de validade no côncavo,
partindo a passagem em troços); no mínimo, recusar o plano
(`standoff-corner`, com o vértice) quando alguma amostra fica a menos de
0,95·d da linha de base ou um troço desviado tem sentido oposto ao da
base. Testes: U de 60 × 40 com d = 25 dá erro; convexo de 150° dá mínimo
≥ 0,95·d. Confiança alta.

## 4. Os restantes achados

### 4.1 Errado mas funciona

| Id      | Achado                                                                                                                                                                                                                                                                                          | Correcção                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M2-T4 / G5 | Rota única: o trânsito é a distância à **fronteira** da área (`geo.js:546-553`, `App.jsx:926-928`) — 0 com a base dentro — e não há VLOS; corredor e circular sem trânsito nenhum (`preflight.js:465-469`). Área de 1 × 1 km com a base no centro: 1684 m / 2,8 min não contados; VLOS no pior caso 880 m sem item. | `blockWorstTransitM(zona, wps[0], wps[n−1])` e `route-vlos` com `blockWorstVlosM`, também em `preflightPlan`; corrigir §4.                                   |
| M2-G6   | Baterias e conjuntos: `aggregatePlans` (`geo.js:1184-1205`) soma `ceil(tempo/útil)` por plano, sem trânsito; sem divisão conta sempre 1 voo (`App.jsx:1150-1161`). Mosaico P1 com 6 blocos de 20,4 min + 3 de trânsito: 5 conjuntos em vez de 6; rota única de 43,8 min / 30 úteis: 1 voo. | Com blocos `Σ max(1, ceil((timeS + transitS)/útil))`; sem blocos `ceil((tempo + trânsito)/útil)`.                                                              |
| M2-T6   | Corredor e circular usam a cota do **ponto** da base (`reference.js:45-50` via `useCorridorMission.js:163-168`, `useCircularMission.js:122-128`), não a mínima da zona como a área (`useAreaMission.js:267-271`) e §4.1/§9; `base-no-terrain` é aviso na rota única e bloqueio nos blocos. Encosta de 5° → voo 4,4 m mais baixo. | `zones[base.id]?.refElev` quando a zona existe; um só nível para `base-no-terrain`.                                                                             |
| M2-T8   | Tecto AGL do payload (Mapper+ 100 m): `worstAgl = altitude + tolerância` (`drones.js:322-330`) ignora a subida do corredor (`clearance.maxM`) e o ganho da zona. AGL 80 com 30°/45° transversal: 97,3/110,0 m + ganho, sem aviso.                                                              | `worstAgl = max(altitude + tol, clearance.maxM) + gainM`; a nota dos 120 m também.                                                                            |
| M2-E6   | A órbita não avisa do obturador (o circular avisa). M4T IV, R 60, 80 %, 5 m/s: uma foto por 1,51 s com `minTriggerS` 2 s; R 30: 0,75 s; P1 R 20 a 85 %: 0,61 s < 0,7.                                                                                                                           | `triggerWarn: avisoIntervalo(2R·sin(π/n), speed)` no preflight e no painel da órbita.                                                                       |
| M2-E4   | Fachada: a folga vertical compara-se com `minClearanceM` (15 m), mas a passagem mais baixa fica em `max(imgH/2, 5 m)` → em solo plano a passagem 1 é sempre vermelha (M3E/M4T abaixo de ~28 m de afastamento, P1 44 m); falso alarme permanente; o smoke 9b2 contorna com `minHeightM 16`.      | Limiar próprio: `vertical < min(minClearanceM, heights[0] − 0,5)` ou só quando o solo sobe acima do pé. Teste: DSM plano → `ok`.                                 |
| M2-T7   | Zona em encosta uniforme: o raio é cortado no primeiro anel com > 10 m de desnível (`takeoffZones.js:133-150`), só com nota `info`. 6° → 40 m (voo 6,3 m mais baixo a 100 m); 10° → 20 m (14,1); 20° → 10 m (32,8); ≥ 27° → 0 m («descole a menos de 0 m»).                                   | `cause` com `belowM` e a mínima no raio pedido; `warn` quando `belowM > 0`; aviso próprio para raio 0. Os testes fixam o nível actual.                         |
| M2-G2   | Com células a faixa exterior fica a `(bordo − yRef) mod s` do contorno (0..s; `computeAlignment`, `geo.js:572-586`, `yRef` = centróide) — no plano único 0..s/2. 1730 × 1350 m, s = 42,5, mosaico 500 m: 21,2 → **41,3 m**; câmara a 70 %: bordo de 2 faixas para 1; Mapper+ 80 m a 40 %: vazio até 11,3 m. | `n = floor(heightM/s) + 1`, `yRef = (minY + maxY)/2 − (n − 1)/2·latStep` (41,3 → 21,2 m; colinearidade mantida). Teste: medir a margem.                      |
| M2-G3   | Côncavos: a ligação entre células atravessa o vão (`gridRoute.js:97-107,154-170`): `cellTurns` começa sempre na 1.ª fila lado `xlo`; `orderCells` só escolhe 2 de 4 orientações. U de 600 × 600 com vão 200 × 400, s 40 a 90°: 2001 m de ligações, 291 m fora da área (a 270°: 1364 m, nada fora). §3 l. 140 diz o contrário. | Avaliar as 4 orientações com antecipação e rejeitar ligações que saiam do polígono (amostradas). Teste: amostrar a ligação inteira a 0/90/180/270°.        |
| M2-G4   | Linha que passa num vértice reentrante perde a paridade (`geo.js:709-713`; o mesmo em :506 e :785): o resto da fila desaparece sem erro (rectângulo com entalhe em V: a fila do meio voa só 0–300 m). Raro (igualdade a ~1e-5 m).                                                            | Se `\|y − y_vértice\| < 1e-9°`, deslocar a linha 1e-8° antes de intersectar; na fiada e em `findOptimalDirection` também.                                    |
| M2-T2   | A folga ao solo é verificada na mesma grelha de 40 m do seguimento (`terrain.js:571/:592`, `clearance.js:23/:34`): valida o perfil contra si próprio. Cumeada com flancos de 20°/30°/45°: a crista passa 7,2/11,4/19,8 m abaixo do planeado; a folga mostrada continua 60,0 m (fina: 40,2).    | `stepM = clamp(resolução/2, 1, 10)` na folga; no perfil, o máximo das sub-amostras em ±½ passo. Teste: grelha de 30 m com flancos de 45°.                     |
| M2-T5   | Um bloco de uma só faixa (cauda do corte por área) fica sem base e sem maneira de lha dar (`takeoffZones.js:746` salta anéis < 3 pontos antes da atribuição manual; `baseLayout.js:71-74`): «?-3», `block-no-base`, proposta vazia.                                                             | Aceitar anéis ≥ 1 ponto na atribuição e na proposta, ou `blockRing` = rectângulo de meia passada à volta da faixa (serve a bacia de visão).                   |
| M2-G7 / E7 | O METODOS §4 (l. 185, 191, 233, 261) e §9 (l. 805) ainda descrevem **3 s por viragem**; o código usa `(n − 1)·v/1,7` (§15/§16). A 10 m/s são 5,9 s; 30 faixas: 171 s contra 90 escritos.                                                                                                          | Reescrever as fórmulas de §4 e §9.                                                                                                                           |
| M2-G8   | Constantes do referencial local (`units.js:15-21`): 110574 é o grau de meridiano **no equador** (a 37–42° N: 110978–111073, −0,4 %); `111320·cos φ` fica 0,12–0,15 % abaixo; com o `transformRotate` esférico, a âncora de 500 × 500 m sai 498,7 × 504,1 e os quadrados 500,7 × 502,0. ≤ 1 % nas dimensões, ~+0,5 % de tempo por célula. | `M(φ) = 111132,95 − 559,82·cos2φ + 1,175·cos4φ`, `P(φ) = 111412,84·cosφ − 93,5·cos3φ + 0,118·cos5φ`; rodar a âncora e a grelha em metros no local.              |
| M2-E5   | Circular: a corda `across(alcance no eixo)·(1 − frontal)` mede o deslocamento, não a pegada, que roda à volta do centro. P1 a 60 m, −45°, R 30, 80 %: 12 pontos e **66 %** reais (24–25 precisos; os ~20 do UgCS dão ~77 %, não os «~86 %» de §9A); M3E/M4T 65 %; com R ≈ H/tan\|p\| sobreamostra. | Bordo distante da pegada: `t = H/(f·sin\|p\| − (sH/2)·cos\|p\|)`, `w_far = sW·t`, `ρ_far = \|t·(f·cos\|p\| + (sH/2)·sin\|p\|) − R\|`, `Δθ = (1−o)·w_far/ρ_far`; exigir `\|p\| > v`; corrigir §9A. Confiança média. |
| M2-E8   | GCPs: o recuo do perímetro é em direcção ao centróide (`gcp.js:111-122`); numa faixa de 3000 × 100 m, 10 dos 11 GCPs ficam em y ≈ 41 m, quase colineares — nada controla o rolamento transversal (Martínez-Carricondo 2018, §10).                                                              | Recuar pela normal interior da aresta local; centróide só como recurso. Teste: faixa com dispersão transversal > 50 % da largura.                           |

### 4.2 Melhorias

| Id      | Achado                                                                                                                                                                                                                           | Correcção                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| M2-T9   | A sugestão de gimbal para encostas (câmara a −(90−θ)) é incompatível com `followWayline`: a câmara inclina-se para a frente, ao longo da curva de nível; a incidência piora (20° → 28°, 45° → 60°) em vez de ir a 0°; o plano é ajustado à caixa e não ao polígono. | Retirar o botão, ou exportar rumo fixo = azimute descendente + 180° quando o gimbal ≠ −90; amostrar só dentro do anel. |
| M2-T10  | EPSG:5782 é «Alicante»; Cascais é **5780** (`verticalDatum.js:15`, METODOS l. 1154, `datum.test.mjs:22` fixa o erro). Só rótulo.                                                                                                | 5780 → Cascais, 5782 → Alicante.                                                                   |
| M2-T11  | METODOS vs código: §5 l. 610 `rel = round10(AGL + elev − ref)` mas o código usa o máximo do eixo e de ±15/±30 m (só documentado em §9; falta em §15); §16 l. 1320 diz que a zona não é varrida mas `viewshedPlan.js:77-95` varre 37 pontos; «aviso do preflight» da altura < 20 m só existe no painel; o plano de encosta usa a caixa, não a área. | Corrigir §5, §15, §16.                                                                            |
| M2-T12  | O filtro de picos trabalha tile a tile (`terrain.js:187,200-229`): esporões, cristas e promontórios de 1 píxel nos bordos/cantos dos tiles são rebaixados (300 → 100 m, lado inseguro); raro no continente.                        | Filtrar sobre o mosaico ou com orla de 1 píxel; suporte proporcional aos vizinhos.               |
| M2-T13  | Descidas comparadas com `maxClimbMS` (`uncertainty.js:170-172`); afecta o tempo, não a segurança. Confiança baixa.                                                                                                              | `maxDescentMS` por aeronave.                                                                       |
| M2-E9   | `gcpStats` ignora os buracos (`gcp.js:191`): quadrado de 400 m com buraco de 200: 16 ha em vez de 12 (+33 % ha/GCP).                                                                                                            | `gcpStats(ring, gcps, holes)`.                                                                     |
| M2-E10  | Circular: a grelha cobre a caixa e não descarta círculos que não vêem a área (L de 300 m com braço de 100: 9 de 121 não vêem nada, 25 a mais de 2R; triângulo: 6/12/30 de 120).                                                | Descartar centros a mais de `ρ_far` + meia pegada (ou 2R) da área, mantendo a serpentina.          |
| M2-E11  | Fachada: nos cantos convexos de 90–132° a mitra prolonga a passagem com rumo perpendicular e essas fotografias olham para o vazio (3 de 34 waypoints a 90°, 11 de 40 a 130°); nos côncavos a face junto ao vértice só é vista de esguelha. | Com a junta redonda de E3, rumo ao vértice ao longo do arco; nos côncavos, rumos a rodar em passos ≤ HFOV·(1−o). |
| M2-E12  | Corredor: as passagens acabam na perpendicular às pontas, sem prolongamento (a área tem `overshootM`): redundância nas pontas cai a metade (5 → 3 imagens).                                                                        | Prolongar `overshootM` (ou `along/2`) nas pontas, com disparo.                                     |
| M2-E13  | A órbita começa sempre a norte (`startBearingDeg` 0, não exposto); com `safely`, descolar a sul de um alvo alto atravessa-o na aproximação.                                                                                    | Começar no rumo POI → base, ou expor o rumo inicial e marcá-lo no mapa.                           |
| M2-E14  | `chordM`/`transitionM` dão a corda pedida, não `2R·sin(π/n)` (17,0 vs 16,4 m; 85 vs 45,9 com o mínimo de 8); o cabeçalho diz subida vertical (é helicoidal); `photoCount` conta fotos com LiDAR na órbita e no circular.       | Corda real; comentário; `photoCount = 0` sem câmara.                                              |
| M2-G9   | Dupla grelha: a 2.ª grelha não começa junto ao fim da 1.ª (500 × 500 com nadir: ligações 24 + 685 m; invertendo, 508).                                                                                                           | Inverter linhas, waypoints e `perLine`/`perWaypoint` quando encurta.                               |
| M2-G10  | A margem é % de √área e aplica-se a cada célula: 10 % são 59 m na área e 24 m numa célula de 480 m; 158 m em 10 km²; arestas interiores voadas duas vezes (+3 %).                                                               | Margem em metros ou fracção da pegada, uma vez ao contorno; células recortadas da área alargada.   |
| M2-G11  | A densidade LiDAR entre parênteses é sempre a de 2 passagens (`geo.js:234-238`): «Denso» 70 %, 4 m/s, 60 m mostra 709 (1418) e a média é 2362 (−40 %); a 30 % mostra 1135 e 57 % da área só tem 567.                           | Mostrar a média `PRR/(v·spacing)` e o mínimo de uma passagem.                                      |
| M2-G12  | A contagem de fotos não inclui as das ligações (§6 diz que o disparo continua): 1128 vs 1171 (+4 %) num km² com M3E a 100 m.                                                                                                     | Contar por `triggerRangesForLines` sobre o percurso.                                               |
| M2-G13  | Focal do M3E em 12,2 mm (`drones.js:130`); EXIF e Pix4D dão ~12,29 mm: pegada e GSD 0,7 % maiores. Confiança média.                                                                                                               | Confirmar `FocalLength` numa foto do 1.º voo do M3E; o smoke 243 muda.                            |
| M2-G14  | Tempo útil por aeronave e bateria, não por payload (M300: P1 e Mapper+ partilham TB60 25 / TB65 28 sem registo do payload medido).                                                                                               | Chave aeronave:payload, ou registar o payload da medição.                                         |
| M2-G15  | `splitIntoBlocks`: ramo `battery` morto (a aplicação manda o modo para o mosaico; só os testes o correm); o modo `area` conta a área da faixa com prolongamento e fiada (blocos 12 % abaixo do pedido com 30 m).                   | Retirar ou marcar o ramo no §4; usar o comprimento do núcleo.                                      |

### 4.3 Verificado e correcto

Pegada, GSD, espaçamento e intervalo (§2) e a largura do sensor
transversal, coerente com `followWayline`; fichas dos sensores (M3E 3,28
µm, P1 GSD = H/80, M4T pelo EXIF, `minTriggerS` 0,7 s e 2 s na térmica);
GSD alvo → altitude; gimbal oblíquo conservador; grelha única centrada
(margem 0..s/2), ângulos equivalentes, `findOptimalDirection`, casos
pequenos, células com intervalos consistentes, índices (`passPoints`,
`concatPerWaypoint`, `nadirLineLocalPerBlock`, `passThroughFor`,
`triggerRangesForLines`); `stripRouteStats` = L/v + (n − 1)·v/1,7 +
paragens; `buildSquareMosaic`; `equipment.js`; latitudes 32–42° sem
singularidades. Terrarium (descodificação, Mercator, bilinear),
`simplifyProfile`, ligações e `regroupTerrainBlocks`, referência na
mínima (lado seguro), `computeTakeoffZone`, pior caso de VLOS e trânsito
(factor (1 + √2)·L), atribuição manual/menor VLOS, bacias de visão
(curvatura, Fresnel, vegetação), datums (pés, 4979/4937, KMZ absoluto
recusado), `demFile`, itens de §14 com os limiares do código. Fachada
(pegada, passos, alturas, mitra, rumo, tempo, `checkFaceClearance`),
órbita (pontos, rumo ao POI sem salto no norte, pitch, níveis, espiral de
vídeo, sobreposição conservadora para alvos ≤ R/2), corredor
(`passOffsets`, juntas, ligações, amostragem; corte de cantos ≤ 2,1 m),
circular (grelha, serpentina, rumo, pitch, GSD, terreno), GCPs e pontos de
inspecção conforme §10, `exportParams` alinhados em todos os modos.

## 5. Pacotes propostos

- **Pacote M-A — segurança (os 6 que bloqueiam):** G1 (lado do bloco por
  bateria com prolongamento, fiada e margem), T1 (relevo em falta → bloqueio
  e repetição dos tiles), T3 (trânsitos base ↔ rota contra o relevo), E1
  (blocos do circular com inversões e trânsito), E2 (fachada com pitch),
  E3 (cantos da fachada com a junta do corredor, ou no mínimo a recusa).
  Com testes novos para cada um. Os números dos blocos por bateria mudam
  (lados mais pequenos com prolongamento/fiada/margem): CHANGELOG.
- **Pacote M-B — números que mentem (tempo, trânsito, baterias,
  cobertura):** T4/G5, G6, T6, T8, E6, E4, T7, G2, G3, G4, T2, T5 e as
  fórmulas de §4/§9 (G7/E7).
- **Pacote M-C — modelos e melhorias:** E5 (sobreposição do circular pelo
  bordo distante), E8/E9 (GCPs), E10, E11, E12, E13, E14, T9, T12, T13,
  G8 (referencial local), G9, G10, G11, G12, G15.
- **Pacote M-D — documentação e fichas:** T10 (EPSG), T11 (§5/§15/§16),
  G13 (focal do M3E: precisa de uma foto do próximo voo) e G14 (tempo útil
  por payload: precisa dos tempos medidos).

Cada pacote passa a cadeia completa e o E2E antes de ir para o `main`,
como os da primeira vaga.
