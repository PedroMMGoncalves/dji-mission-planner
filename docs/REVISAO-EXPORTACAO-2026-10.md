# Revisão da exportação contra os padrões da DJI — Outubro de 2026

Pedida depois do voo do M4T em que as fotos saíram só nos cantos das
faixas (grupos de disparo com `actionGroupMode` `parallel`, fora da
especificação; corrigido no commit 3a61f61). Não era a primeira vez que um
problema de exportação só aparecia no campo (M3E, Setembro: `distance` e
`duration` em falta; paragem em cada foto). Objectivo desta revisão: que
nenhum elemento fora da especificação volte a chegar ao campo.

## 1. Método e fontes

- **Especificação oficial**, clonada do repositório público da DJI
  (`dji-sdk/cloud-api-doc`, commit `4ec6b0c`): `docs/en/60.api-reference/
  00.dji-wpml/` (overview, template-kml, waylines-wpml, common-element) e a
  versão chinesa (`docs/cn/...`), que tem notas a mais. Abaixo, `EN/…:n` e
  `CN/…:n` são ficheiro e linha nesse clone.
- **Sem ficheiros reais do Pilot 2 à mão nesta revisão** (os 81 KMZ do M300
  ficaram no arquivo do LNEG). Onde um ficheiro real é necessário para
  decidir, está dito.
- Dois agentes de revisão (Fable: WPML/KMZ elemento a elemento; Opus: KML,
  ZIPs e exportação por base), só de leitura, com exemplos gerados de todos
  os modos × aeronaves (M3E, M4T grande-angular e térmica, M300+P1,
  M300+Mapper+, custom) e um inventário automático de pares pai→filho,
  enums, intervalos e ordens contra as tabelas da especificação. Os três
  achados de maior peso foram confirmados à mão na especificação.
- Gravidade: **Bloqueia** (o Pilot 2 recusa, ou a aeronave faz outra coisa);
  **Errado mas voa** (fora da especificação, tolerado nos voos reais);
  **Melhoria/risco**.

## 2. Decisões pedidas

| id | achado | gravidade | o que proponho | precisa de ficheiro real? |
|---|---|---|---|---|
| B1 | rota com 1 waypoint chega ao KMZ (pontos de inspecção) | Bloqueia (provável) | recusar na fronteira (< 2 waypoints) e no botão | não |
| B2 | lente nunca é dita ao `waylines` (M4T térmico) | Bloqueia (potencial) | nos payloads com `imageFormat`, escrever `payloadLensIndex` = `imageFormat` em cada `takePhoto`/`startRecord` | sim, para confirmar o valor |
| E1 | `gimbalHeadingYawBase` = `aircraft` (enum só tem `north`) | Errado mas voa | passar a `north` (yaw do gimbal está desligado: sem efeito em voo) | não |
| E2 | `fileSuffix` em falta nos `takePhoto`/`startRecord` | Errado mas voa | manter; decidir com um ficheiro real do M3E/M4T | sim |
| E3 | `caliFlightEnable` num template `waypoint` | Errado mas voa | retirar (só existe nos templates de mapeamento, e só para M300/M350) | não |
| M2 | `template.kml` sem acções nem rumos; uma reedição no Pilot 2 regenera o `waylines` sem eles | Melhoria/risco | espelhar no template os `actionGroup` e os rumos por waypoint; até lá, aviso «não editar no comando» | sim, para o round-trip |
| M3 | `useStraightLine` não é suportado no M300/M350: pontos de passagem com mudança de rumo (dobras do corredor, vértices do terreno) viram com um raio que o ficheiro não controla | Melhoria/risco | no M300/M350, passagem só em pontos colineares; paragem nas dobras | sim, ideal |
| M6 | coordenadas em notação científica a < 1e-6° de 0° | Melhoria | formatar como texto, nunca `Number` | não |
| M7 | `gimbalRotate` repetido em todos os pontos da órbita e da circular (391 grupos em 30 círculos) | Melhoria | omitir quando o pitch não muda | não |
| M8 | o leitor de KMZ assume alturas relativas; um KMZ do comando em WGS84/EGM96 entra errado | Melhoria/risco | ler `executeHeightMode`; recusar o que não for `relativeToStartPoint` | sim, para testar |
| M9 | velocidades: a fronteira aceita até 30 m/s; transição pode sair < 1 | Melhoria | limitar ao `speedRange` da aeronave; transição em [1, 15] | não |
| M10 | `pick()` troca em silêncio uma acção de segurança inválida | Melhoria | lançar erro, como o resto da fronteira | não |
| M11 | documentação desactualizada (VALIDACAO 5.1: `finishAction`, enum PSDK; comentário do M4T em drones.js) | Melhoria | corrigir | não |
| T | testes que impedem cada classe de erro (secção 5) | — | T2, T3, T4, T7 primeiro; T1 como base; T6 quando houver ficheiros reais | T6 sim |

Mantidos de propósito (conformes ou com prova de voo): namespace
`wpmz/1.0.2` (o da especificação; o 1.0.3 só aparece nos ficheiros reais);
`payloadSubEnumValue`, `waypointHeadingAngleEnable`, `distance`, `duration`
e `<name>` (não documentados, mas presentes nos 81 KMZ reais e, os dois do
meio, foram a correcção do «100 % e 00:00» do M3E); enums P1 `50/1`, PSDK
`65535`, M4T `99/1/89` (fora da tabela; vindos de ficheiros reais e do voo
do M4T) — todos a entrar numa lista explícita do validador proposto, cada
um com a sua prova.

## 3. Achados WPML/KMZ

**B1 — missão de 1 waypoint.** `validateExportParams` só recusa a lista
vazia (`src/utils/exporters.js`, `waypoints.length === 0`) e o botão dos
pontos de inspecção só bloqueia a lista vazia (`src/hooks/useInspection.js`);
`inspectionExportParams` produz uma rota com um Placemark e `distance` 0.
A especificação não fixa um mínimo (só exige `wpml:index` contínuo a partir
de 0, `EN/30.waylines-wpml.md:157`), mas o editor do Pilot 2 exige dois
pontos numa rota de waypoints. Consequência: KMZ recusado ou rota que não
arranca. Correcção: `waypoints.length < 2` → `MissionExportError`; botão
desactivado com menos de dois pontos.

**B2 — a lente nunca é dita ao `waylines.wpml`.** O template leva
`payloadParam` com `imageFormat` (`ir` ou `wide`) nos payloads do M4T
(`src/utils/exporters.js`, `payloadParamXml`; `src/data/drones.js`), mas
todos os `takePhoto` e `startRecord` escrevem `useGlobalPayloadLensIndex`
0 («não usar a definição global», `EN/40.common-element.md:96`) e nunca
`payloadLensIndex` (lista `zoom|wide|ir|narrow_band|visable`, obrigatória
nas aeronaves multi-lente listadas: M30/M30T, M3D/M3TD,
`EN/40.common-element.md:95`). O M4T não consta do clone: tudo o que se diz
da lente no M4T é extrapolação do M30T/M3T. Consequência: a lente que
dispara fica ao critério do firmware (definição corrente da câmara). No
perfil grande-angular o voo de Outubro mostrou que algo dispara; no térmico
ninguém sabe se saem `_T`, `_V` ou ambos. Correcção: quando `imageFormat`
existe, escrever `<wpml:payloadLensIndex>` com esse valor em cada
`takePhoto`/`startRecord`, antes de `useGlobalPayloadLensIndex` (que fica a
0, coerente com a lista explícita); M3E e P1 (uma lente, sem
`payloadParam`) ficam como no ficheiro que voou. Confirmar com um KMZ
térmico escrito pelo Pilot 2 no M4T, e contar os `_T` no primeiro voo
térmico (QA §10).

**E1 — `gimbalHeadingYawBase` = `aircraft`.** O enum tem um único valor,
`north` («Relative geographic north», `EN/40.common-element.md:145`,
obrigatório). Sem efeito hoje porque `gimbalYawRotateEnable` é 0; se um dia
se activar a rotação de yaw, o referencial fica ao critério do firmware.
Correcção: `north`.

**E2 — `fileSuffix` em falta.** `takePhoto` e `startRecord` saem só com
`payloadPositionIndex` e `useGlobalPayloadLensIndex`; a tabela marca
`fileSuffix` como obrigatório para M30, M3E/M3T/M3M e M3D/M3TD
(`EN/40.common-element.md:94`) e o exemplo escreve
`<wpml:fileSuffix>point1</wpml:fileSuffix>` (`EN/30.waylines-wpml.md:109`).
Para a P1 e os payloads PSDK a coluna de suporte não os lista: a omissão
está certa no M300. Tolerado nos voos do M3E e do M4T (já registado em
METODOS §11.2). Só com um ficheiro real do M3E/M4T se decide o valor; um
`fileSuffix` vazio inventado é pior do que a omissão validada em voo.

**E3 — `caliFlightEnable` num template `waypoint`.** Escrevemos
`<wpml:caliFlightEnable>0</wpml:caliFlightEnable>` no `Folder`; o elemento
só existe nas tabelas dos templates `mapping2d`, `mapping3d` e
`mappingStrip`, «only applicable to M300 RTK and M350 RTK»
(`EN/20.template-kml.md:213,233,248`), e não na do template `waypoint`
(`:200-207`) nem no exemplo. Ignorado nos voos. Correcção: retirar.

**M2 — template e waylines contam histórias diferentes.** O `template.kml`
escreve `useGlobalHeadingParam` 1 em todos os Placemarks com `followWayline`
global, nenhum `actionGroup` e nenhum `waypointSpeed`; o `waylines.wpml`
escreve `smoothTransition` com ângulo por waypoint, grupos de gimbal, foto,
`startRecord`/`stopRecord` e o marcador nadir. A especificação mostra os
`actionGroup` dentro do template (`EN/20.template-kml.md:99-134`) e diz que
o `waylines` é gerado a partir do template (`EN/10.overview.md:29`). O
comando executa o `waylines` tal como está (provado em voo), mas qualquer
edição e gravação no editor do Pilot 2 regenera o `waylines` a partir do
template — e perde, em silêncio, fotos por waypoint, rumos, pitch por ponto
e a gravação da órbita. Correcção: espelhar no template, por Placemark,
`useGlobalHeadingParam` 0 + `waypointHeadingParam` quando há rumo, e os
mesmos `actionGroup` (ids únicos no KMZ, `EN/40.common-element.md:65`).

**M3 — `useStraightLine` não é suportado no M300 RTK.** Escrevemos
`useStraightLine` em todos os Placemarks e `globalUseStraightLine`, e o modo
«passa sem parar» é `toPointAndPassWithContinuityCurvature` +
`useStraightLine` 1 + amortecimento ≤ 1 m. Suporte do elemento: «M30/M30T,
M3E/M3T/M3M, M3D/M3TD» — sem M300/M350 (`EN/30.waylines-wpml.md:162`,
`EN/20.template-kml.md:203,279`); a receita «Turns before waypoint. Flies
through» depende dele (`EN/40.common-element.md:51`). No M300 o elemento é
ignorado e o ponto fica «voa em curva e não pára no ponto»: nos pontos
colineares de uma faixa (fotos, vértices do terreno) não se nota; nas
dobras do corredor o M300 corta a curva com um raio que o ficheiro não
controla. Correcção: para `droneEnumValue` 60/89, passagem só nos pontos
onde o rumo não muda; paragem nas dobras.

**M6 — notação científica.** `fmtCoord` = `Number(v.toFixed(8))`
interpolado dá `4e-7` a menos de ~11 cm do meridiano de Greenwich ou do
equador (reproduzido); a especificação pede graus decimais
(`EN/20.template-kml.md:268`). Irrelevante em Portugal; é um valor fora do
formato. Correcção: formatar como texto (`toFixed` sem reconverter), o
mesmo em `fmtStat`.

**M7 — grupos de gimbal redundantes.** No waypoint 0 sai o grupo global
`gimbalRotate` e, quando há pitch por waypoint, outro igual; na circular e
na órbita cada ponto leva `gimbalRotate` mesmo sem mudança (391 grupos em
30 círculos; 400 círculos × 121 pontos aproximam-se de 50 000 grupos, limite
prático desconhecido). Correcção: omitir quando o pitch é igual ao do ponto
anterior (e ao global no waypoint 0).

**M8 — o leitor assume o que o escritor escreve.** `src/utils/importWpml.js`
lê `executeHeight`/`height`/`ellipsoidHeight` sem ler `executeHeightMode`
nem `heightMode`; um KMZ do comando em WGS84 (ex.: `executeHeight` 116,57
do exemplo `EN/30.waylines-wpml.md:42`) entra como 116 m relativos. Lê o
nome de `<name>`, que o Pilot 2 não escreve (o nome da rota é o do ficheiro,
`EN/10.overview.md:40`). Correcção: ler `executeHeightMode`; recusar (ou
converter, METODOS §12) o que não for `relativeToStartPoint`; ler os
sub-enums.

**M9 — velocidades.** A fronteira aceita `speed` em (0, 30]; o perfil
custom permite 20 m/s. EN diz «(0, velocidade máxima da aeronave]»
(`EN/20.template-kml.md:179`); CN diz [1, 15] para `autoFlightSpeed`,
`waypointSpeed` e `globalTransitionalSpeed` (`CN/30.waylines-wpml.md:146,
159,134`). Com `speed` < 1 a transição sai < 1. Correcção: limitar ao
`speedRange` da aeronave; `globalTransitionalSpeed = min(15, max(1, v))`.

**M10 — substituição silenciosa.** `pick()` troca um `finishAction`,
`exitOnRCLost` ou `executeRCLostAction` inválido pelo primeiro da lista em
vez de lançar `MissionExportError`, ao contrário do resto da fronteira.
Correcção: lançar.

**M11 — documentação.** `docs/VALIDACAO.md` 5.1 diz `finishAction` «não
escrito» (é escrito) e «enum PSDK 65534» (escreve-se 65535);
`src/data/drones.js` e `exporters.js` contradizem-se sobre quem escolhe a
lente do M4T.

**M12 — namespace e empacotamento (conforme).** `wpmz/1.0.2` é o dos
exemplos EN e CN; 1.0.3 só aparece nos ficheiros reais. O KMZ tem
exactamente `wpmz/template.kml` e `wpmz/waylines.wpml` (DEFLATE, UTF-8 sem
BOM); o nome da rota é o nome do ficheiro, sanitizado.

### Riscos por aeronave

- **M3E** — todos os elementos escritos têm suporte; falta tolerada:
  `fileSuffix`; `payloadLensIndex` não é exigido.
- **M4T** — nada no clone: enums, sub-enum, lente (`payloadLensIndex`,
  `imageFormat`) e intervalo do gimbal são extrapolação; o voo de Outubro
  valida o esqueleto e os enums, não a térmica.
- **M300 RTK** — `useStraightLine` sem suporte (M3); `payloadParam`
  suportado; `fileSuffix` não listado para P1/PSDK (omissão correcta); P1
  `50/1` e PSDK `65535` só por evidência dos 81 KMZ; `payloadPositionIndex`
  0 = gimbal da frente esquerda — confirmar nos ficheiros reais que é esse o
  porto usado.

## 4. Verificado e conforme (WPML/KMZ)

Cabeçalho e `missionConfig` nos dois ficheiros (ordem do exemplo, enums de
`flyToWaylineMode`/`finishAction`/`exitOnRCLost`/`executeRCLostAction`,
`takeOffSecurityHeight` em [1.2, 1500], `globalRTHHeight` presente e acima
do tecto, `globalTransitionalSpeed` ≤ 15, `droneInfo`/`payloadInfo`);
`Folder` do template (`templateType`, `templateId`, `waylineCoordinateSysParam`
WGS84 + `relativeToStartPoint`, `payloadParam` só com `imageFormat`,
`autoFlightSpeed`, `globalHeight`, `gimbalPitchMode` manual,
`globalWaypointHeadingParam` com os quatro filhos, `globalWaypointTurnMode`
e `globalUseStraightLine` coerentes); Placemarks do template (ordem,
`index` contínuo ≤ 65536, `ellipsoidHeight` = `height` em alturas relativas
como a nota CN exige, `useGlobalHeight`/`useGlobalSpeed`/`useGlobalTurnParam`
com as regras «obrigatório se…»); `Folder` do `waylines` (ordem,
`executeHeightMode`, `waylineId`, `distance`/`duration` na posição dos
ficheiros reais); Placemarks do `waylines` (ordem, `waypointHeadingParam`
sempre presente com ângulo normalizado a [−180, 180), `waypointTurnParam`
sempre presente, `waypointTurnDampingDist` > 0 exactamente quando é
obrigatório e ≤ 0,45 do troço adjacente, `useStraightLine` 0 nas curvas
genuínas e 1 na receita «flies through»); grupos de acções (ordem, ids
únicos e a contar do 0, intervalos válidos sem sobreposição, `sequence`,
`actionTriggerType` e `actionTriggerParam` > 0 com uma casa decimal,
`gimbalRotate` com os onze parâmetros e o pitch recortado ao payload,
`takePhoto`/`startRecord`/`stopRecord` com os parâmetros da tabela, LiDAR
sem grupos, blocos com intervalos e acções locais); fronteira (números
finitos e nos domínios, caracteres XML ilegais retirados, nomes escapados);
empacotamento (M12).

## 5. Testes propostos («nunca mais no campo»)

- **T1 — dicionário da especificação em JSON** (`tools/wpml-spec.mjs` lê as
  tabelas Markdown do clone e grava `tests/spec/wpml-spec.json`: por
  elemento, pai, tipo, enum, intervalo, obrigatoriedade incluindo as
  condicionais, suporte por aeronave; um teste falha se o JSON divergir).
- **T2 — validador de elementos** sobre todos os ficheiros gerados (unit,
  golden, E2E): cada par pai→filho existe no dicionário ou numa lista
  explícita com prova; enums, booleanos, numéricos (`/^-?\d+(\.\d+)?$/`),
  intervalos, obrigatórios condicionais, e, dada a aeronave, nenhum elemento
  fora da coluna de suporte. O protótipo usado nesta revisão apanhou E1,
  E3, M1, M4, M6 e M9.
- **T3 — ordem dos filhos**, extraída dos exemplos e completada com os
  ficheiros reais; qualquer sequência nova falha.
- **T4 — coerência template ↔ waylines** (Placemarks, alturas, ids, modos,
  velocidades; depois de M2, acções e rumos).
- **T5 — semântica dos grupos** (um grupo por intervalo no Placemark do
  início; gimbal antes da foto no waypoint 0; `startRecord`/`stopRecord` aos
  pares; lente presente quando há `imageFormat`; sem `gimbalRotate`
  consecutivos iguais).
- **T6 — comparação estrutural com ficheiros reais** (os 81 KMZ do M300 e
  os KMZ que voaram no M3E e no M4T, ou só o inventário JSON deles se forem
  confidenciais): os nossos ficheiros só usam pares e ordens vistos no corpus
  ou na especificação.
- **T7 — empacotamento** (JSZip: exactamente os dois ficheiros, UTF-8 sem
  BOM, XML válido, nome seguro; o mesmo para cada KMZ dos ZIP).
- **T8 — propriedades nos limites** (coordenadas junto a 0°/±180°/±90°,
  alturas negativas, velocidades nos limites, 1 waypoint → erro, 65 537 →
  erro).
- **T9 — leitor** (KMZ em WGS84/EGM96 → recusa ou conversão; sub-enums;
  nome a partir do ficheiro).
- **T10 — matriz modos × aeronaves** (todos os modos em M3E, M4T
  grande-angular e térmica, M300+P1, M300+Mapper+, custom; T2–T5 sobre
  todos). Hoje os golden só cobrem o M3E e não têm circular, inspecção,
  órbita em vídeo nem perfis M4T/M300.

## 6. Achados KML e ZIPs

(Em curso: o segundo agente ainda está a rever. Esta secção é preenchida
quando terminar.)
