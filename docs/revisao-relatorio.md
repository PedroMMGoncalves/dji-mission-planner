Verifiquei os quinze achados contra o código em `HEAD` (44ed7ca), com `node` sobre os módulos reais, `npm test` (581 asserções, todas a passar) e `npm run lint` (limpo).

---

# Auditoria do código posterior a 622ea92 — relatório final

Data: 2026-08-28 · Referência: `622ea92..HEAD` (44ed7ca) · Testes: 581 asserções a passar, ESLint limpo

## Resumo

Dos quinze achados submetidos, **onze estão resolvidos no código actual** e verifiquei cada correcção a correr. Restam **quatro defeitos abertos**, dois deles de gravidade alta. Dois dos abertos são *resíduos* de correcções que atacaram metade do problema: a esquadria passou de 4x para 2x mas continua a transbordar, e a velocidade do corredor passou a ser limitada mas o aviso de obturador continua invisível nesse modo.

Nenhum achado ficou por julgar.

---

## ABERTOS

### A1 · [ALTA] `src/utils/corridor.js:147-150` — a trava de amostragem cose a passagem com uma recta que abandona o corredor, em silêncio

Quatro dos achados submetidos (3, 12, 13, 14) são o mesmo defeito visto de quatro ângulos. Trato-o como um.

Quando `resamplePolyline` atinge `MAX_SAMPLES` (20000), faz `out.push(clean[clean.length - 1])` e devolve. Não trunca nem recusa: liga o ponto de corte ao último vértice da polilinha por **um segmento recto**. Em `offsetRuns` (linha 240) o critério de validade avalia PONTOS, nunca o interior de um segmento; ambos os extremos do salto estão a `|offset|` do eixo, logo o troço é aceite inteiro, sobrevive a `simplifyPolyline` e chega ao KMZ como perna de voo.

**Reproduzido em HEAD.** Conduta em L, 22 km para leste e 4 km para norte, M3E_WIDE a 30 m, meia-largura 60 m, sobreposição lateral 90% (`spacing` 4,25 m, `sampleStep` 1,06 m):

```
passes 20  runs 20  dropped 0  split 0  waypoints 60
pontos por passagem: 3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3
maior salto dentro de uma passagem: 21 272 m
afastamento máximo do eixo ao longo desse salto: 624 m  (pedido: 60 m)
```

Vinte passagens com três pontos cada. Sem erro, sem aviso, `droppedPasses` e `splitPasses` a zero, e `stats.totalLineLengthM` a contar os 21 km da diagonal como faixa coberta.

Um caso maior torna-o visual — L de 60 km + 8 km, altitude 40 m, sobreposição lateral 80%: seis das sete passagens saem como `(0,−34) → (56737,−34) → (60034,8000)`, ou seja uma diagonal recta de ~8,7 km que se afasta **2296 m** de um corredor de 60 m de meia-largura.

O limiar prático é 20000 × `sampleStep`, com `sampleStep = max(0,5; min(spacing/4; comprimento/4; 10))`: ~200 km com espaçamento largo, mas **~21 km a 30 m de altitude com 90% de sobreposição lateral** — que é o regime normal de uma linha eléctrica ou de uma conduta, o próprio caso de uso que o módulo documenta no cabeçalho.

Agrava: `smoke-test.mjs:2206` — `check('corredor: trava preserva o ponto final do eixo', huge[huge.length - 1][0] === 300000)` — **certifica exactamente este comportamento**. Com passo 0,5 e um eixo de 300 km, o resultado que a asserção declara correcto são 10 km amostrados seguidos de um segmento recto de 290 km. A asserção irmã da linha 2205 só conta pontos.

Num projecto que se declara *fail loud*, isto é degradação silenciosa da pior espécie: a ferramenta não recusa a missão, corrompe-a.

**Correcção concreta:**
1. `corridor.js:147-150` — ao atingir a trava, sinalizar em vez de coser. `resamplePolyline` devolve um resultado marcado (ex. anexar `truncated: true` ao array, ou lançar) e `generateCorridorPlan` (linha ~407) converte-o em `return { error: 'corridor-too-long' }`, com a chave em `src/i18n/dict.missionModes.js` a dizer o que fazer (dividir o eixo, ou baixar a sobreposição).
2. `corridor.js:239-247` — defesa em profundidade: quebrar o troço sempre que dois pontos densos consecutivos distem mais do que ~2×`sampleStep`. Um salto deixa de poder viver dentro de um troço, seja qual for a origem.
3. `smoke-test.mjs:2204-2206` — substituir a asserção que consagra o salto por uma que exija a recusa, e acrescentar uma que meça o **maior salto entre pontos consecutivos** de cada passagem gerada.

---

### A2 · [ALTA] `src/utils/exporters.js:614` — `waypointHeadingAngle` sai fora de `[-180,180]`, e os ficheiros de referência novos consagram-no

`buildWaylinesWPML` escreve `<wpml:waypointHeadingAngle>${hasHeading ? Math.round(pw.heading) : 0}</...>` com `waypointHeadingMode` a `smoothTransition` — o modo em que o elemento é obrigatório. Os geradores produzem rumos em 0..359: `faceMode.js:186` e `orbit.js:123` fazem ambos `((Math.round(x) % 360) + 360) % 360`, e `ControlPanel.jsx` limita o rumo dos pontos de inspecção a 0..359. O exportador não converte nem valida.

**Reproduzido em HEAD.** Fachada com baseline Norte→Sul (`[-8.60,41.155] → [-8.60,41.150]`), lado esquerdo, altura 30 m, afastamento 25 m:

```
headings distintos: [ 270 ]
fora de [-180,180]: 108 de 108 waypoints
modo: smoothTransition
```

E `tests/golden/orbita.waylines.wpml` — ficheiro acrescentado **nesta janela** por `fce2035` — tem 22 dos 48 valores fora do intervalo: 196, 211, 227, 243, 258, 274, 290, 305, 321, 337, 352.

A prova interna de que a convenção correcta é conhecida está no próprio código: `preview.js:18`, `faceMode.js:295` e `orbit.js:120` fazem todos `((x + 540) % 360) - 180` antes de usar o rumo. Só o exportador não o faz.

**Ressalva de proveniência, que devo ser honesto em dar:** o escritor da linha 614 é byte a byte igual ao de 622ea92 — o defeito não nasceu nesta janela. O que nasceu nesta janela foi (a) `validateExportParams`, a fronteira que se diz responsável por impedir que valores maus cheguem ao ficheiro e que verifica o **domínio** de `gimbalPitch` (linha 114) mas do rumo só verifica a finitude (linha 109: `270` passa); (b) o commit `b6e20ca`, "Conformidade WPML"; e (c) os ficheiros de referência que agora selam os valores fora do intervalo. Três trabalhos passaram ao lado dele. Reporto-o por isso, e porque o efeito — um KMZ recusado ou com o yaw mal interpretado, e só no comando, no campo — é o mais caro da lista.

**Correcção concreta:**
1. `exporters.js:614` — `<wpml:waypointHeadingAngle>${hasHeading ? ((Math.round(pw.heading) + 540) % 360) - 180 : 0}</...>`.
2. `exporters.js:110` — acrescentar a verificação de domínio ao lado da de `gimbalPitch`: recusar `pw.heading < -180 || pw.heading > 180` com `param-out-of-range`. (Se preferir aceitar 0..359 na entrada e normalizar na escrita, então valide `[-180, 360)` — mas escolha uma das duas e documente-a; hoje não há nenhuma.)
3. Regenerar `tests/golden/orbita.waylines.wpml` e `tests/golden/fachada.waylines.wpml`, e acrescentar uma asserção que varra todos os `waypointHeadingAngle` de todos os ficheiros de referência e exija o intervalo.

---

### A3 · [MÉDIA] `src/utils/corridor.js:199` e `:240` — a esquadria continua a transbordar até 2x o desvio, e o critério unilateral aceita-o por construção

Resíduo da correcção que baixou `miterLimit` de 4 para 2. A magnitude caiu para metade, o defeito não desapareceu.

O vértice em esquadria dista `|desvio|` das duas RECTAS de suporte, mas `|desvio|/cos(θ/2)` da POLILINHA. O critério de `offsetRuns` (linha 240) é `pointPolylineDistance(q, axis) >= limit`, com `limit = |offset| - tol`: é **unilateral**, só rejeita pontos mais PERTO do eixo. Um ponto mais longe é sempre aceite, por construção.

**Medido em HEAD**, desvio 85,1 m, razão de transbordo por deflexão do eixo:

```
30°:1.04x  60°:1.15x  90°:1.41x  110°:1.74x  115°:1.86x  120°:2.00x  121°:1.00x  125°:1.00x ...
```

O `miterLimit = 2` transformou a explosão numa **falésia**: 120° dá 170,2 m, 121° dá 85,1 m. Um grau de diferença no eixo desenhado muda a passagem em 85 m.

**Reproduzido ao nível do plano.** Cotovelo de estrada com duas pernas de 500 m e deflexão de 120°, a 38,70 N, M3E_WIDE a 100 m, meia-largura 150 m, sobreposição lateral 70%:

```
passes 5  runs 5  split 0  dropped 0  width 300
desvios: -85.1 -42.5 0.0 42.5 85.1
distância máxima waypoint→eixo: 170.2 m   (meia-largura pedida: 150 m)
```

O painel anuncia "Largura coberta 300 m" e não há aviso nenhum — `splitPasses` e `droppedPasses` são ambos zero, porque o transbordo não é nem uma partida nem uma perda.

**O que ficou resolvido:** o efeito secundário desapareceu. Em 400 planos gerados sobre eixos aleatórios com o `miterLimit` actual, **zero** passagens auto-intersectadas (antes eram 18 em 556). Esse ponto do achado original está fechado.

**Correcção concreta.** A correcção simétrica óbvia — tornar o critério da linha 240 bilateral — não serve sozinha: com `tol = max(0,25; |offset|·0,01)`, uma deflexão de apenas 30° já produz 88,1 m contra um tecto de 85,95 m, e passaria a partir a passagem em quase todas as curvas. A correcção certa é substituir a junta:

1. `corridor.js:199` — trocar a junta em esquadria por uma **junta redonda**: no vértice exterior, inserir um arco de pontos a `|offset|` do vértice, entre as duas normais, com passo ≤ `sampleStep`. Verifiquei numericamente: com junta redonda o máximo é **exactamente** `|offset|` em todas as deflexões testadas (30°, 60°, 90°, 120°, 150°, 170°, dos dois lados), enquanto o mínimo continua a cair do lado côncavo — que é precisamente o que o critério existente deve cortar. Não há falésia e não há transbordo. (Um bisel resolveria o transbordo mas abriria um vazio de cobertura na parte de fora da curva, que é exactamente o que a esquadria foi lá pôr.)
2. Só depois disso, `corridor.js:240` — tornar o critério bilateral: `const d = pointPolylineDistance(q, axis); if (d >= limit && d <= Math.abs(offset) + tol)`. Com a junta redonda isto passa a ser uma rede de segurança barata em vez de uma máquina de partir passagens.
3. Corrigir o comentário do módulo (linhas 17-22) e o README, que afirmam hoje o contrário do que o código faz.

---

### A4 · [MÉDIA] `src/App.jsx:1917` — em modo corredor o aviso de obturador é calculado e nunca chega a ser desenhado

Resíduo da correcção da velocidade. `corridorSpeed` (App.jsx:301-304) passou a limitar correctamente aos limites da aeronave, e é esse valor que entra no plano (911), na exportação (938) e no painel (1901-1903). Verificado. Mas a segunda metade do achado original ficou de pé.

`triggerWarn` (App.jsx:407) é calculado com `speed` — a velocidade da ÁREA — e só é passado ao `<ControlPanel>` (App.jsx:1955). O `<ControlPanel>` está atrás de `{missionMode === 'area' && (...)}` (App.jsx:1917). Em modo corredor **não é renderizado de todo**, e o `CorridorPanel` não tem nenhum aviso equivalente.

**Reproduzido em HEAD.** Corredor com M3E_WIDE a 40 m, sobreposição frontal 80%, velocidade já limitada a 15 m/s:

```
intervalo de disparo: 8,52 m  →  0,57 s por foto
minTriggerS do M3E_WIDE: 0,7 s
painel anuncia: 2460 fotos, 23,5 min
fotos que o obturador consegue: ~1995
waylines.wpml exportado: <wpml:actionTriggerParam>8.5</wpml:actionTriggerParam>
```

O gatilho `multipleDistance` não é honrado, a sobreposição frontal real cai de 80% para ~75%, o painel mostra uma contagem de fotos 23% acima da real, e não há uma palavra. Não é um caso de canto: **onze** combinações de altitude (30-80 m) e sobreposição frontal (80-90%) caem abaixo de `minTriggerS` mesmo à velocidade já limitada.

Contexto que agrava: como o `ControlPanel` não é desenhado em modo corredor, o `CorridorPanel` também nunca mostra a altitude nem as sobreposições que o plano está a usar, e não há forma de as alterar sem voltar ao modo área. O operador planeia um corredor sobre parâmetros que não vê.

**Correcção concreta:**
1. `App.jsx:407` — parametrizar `triggerWarn` pela velocidade activa (`missionMode === 'corridor' ? corridorSpeed : speed`), ou derivar um segundo `corridorTriggerWarn` com `corridorSpeed`.
2. `App.jsx:1898-1915` — passar esse aviso ao `<CorridorPanel>` e desenhá-lo na secção `co.plan.title`, com o mesmo tratamento a âmbar que já existe para `co.plan.split` (`CorridorPanel.jsx:202-206`), reaproveitando a chave `cp.*` do `ControlPanel.jsx:450-457`.
3. Acrescentar ao `CorridorPanel`, na secção de parâmetros, linhas só de leitura com a altitude, a sobreposição frontal e a lateral em vigor — para o operador ver sobre o que está a planear.

---

## JÁ RESOLVIDOS (verificados no código actual, 2026-08-28)

Onze dos quinze. Confirmei cada um a correr, não por leitura.

| # | Achado | Estado verificado |
|---|---|---|
| 2 | `passOffsets` alocava antes de `MAX_PASSES` recusar → `RangeError` no render | **Resolvido.** `corridor.js:108` devolve `{ count }` antes de alocar, com `MAX_OFFSET_ALLOC = 100000`; `generateCorridorPlan:379` converte em `too-many-passes`. Meia-largura de 1e12 → `too-many-passes` em 1 ms, sem alocação e sem excepção. |
| 4 | O aviso de passagens partidas desaparecia quando havia cobertura perdida | **Resolvido.** `corridor.js:404-412` conta `splitPasses` e `droppedPasses` em separado; `CorridorPanel.jsx:88-89, 197-206` avisa a vermelho e troca "Largura coberta" por "Largura pedida (não coberta)". Caso A (semicircunferência R=60, meia-largura 120) dá agora `dropped: 2, offsets perdidos [63.8, 89.3]`. Chaves i18n presentes. |
| 5 | Velocidade do corredor sem trava, escrita tal e qual no WPML | **Resolvido na parte principal** (`App.jsx:301-304` + 911 + 938 + 1901-1903). O resíduo do obturador está acima como **A4**. |
| 6, 11 | O resumo do projecto não somava o corredor | **Resolvido.** `App.jsx:1237-1245` inclui `corridorPlan.stats` e `corridorPlan` está nas dependências (1249). |
| 7, 9 | `validateExportParams` não validava `perWaypoint` | **Resolvido.** `exporters.js:100-125` valida `heading`, `gimbalPitch` (finitude e domínio) e `actions`. Confirmei que `heading:"270°"` e `gimbalPitch:"nadir"` são agora recusados antes de qualquer concatenação. |
| 8, 10 | `MissionReport` recebia `params` em bruto | **Resolvido.** `App.jsx:2100` passa `params.speed === speed ? params : { ...params, speed }`, a mesma cópia limitada que o `ControlPanel` recebe em 1929. |
| 1 (parcial) | Esquadria com laços auto-intersectados | **Resolvido.** Com `miterLimit = 2`, zero passagens auto-intersectadas em 400 planos aleatórios. O transbordo residual está acima como **A3**. |
| — | `globalRTHHeight` derivado do ponto mais alto da rota | **Resolvido.** `exporters.js:352-359`, com tecto `MAX_RTH_HEIGHT_M = 1500`. |

---

## ACHADOS NÃO JULGADOS

Nenhum. Os quinze foram julgados por três cépticos cada.

---

## Observação que NÃO é achado

Ao verificar A2 sondei o resto da fronteira de exportação. Continuam sem validação nem escape: `turnMode` (produz XML mal formado com `&`), `takeOffSecurityHeightM`, `wpml.droneSubEnumValue`, `payloadSubEnumValue` e `payloadPositionIndex`. Confirmei que todos passam `validateExportParams` e chegam ao ficheiro em cru. **Não os conto como achados** porque nenhum é hoje alimentado pela aplicação — não sei nomear a entrada de utilizador que os parte. Ficam registados como dívida da fronteira, para quando alguém os ligar a um campo.

---

## O que continua por verificar neste código

Sendo franco sobre o alcance desta revisão:

**Não foi verificado por nenhuma revisão até aqui.** O comportamento real no comando continua a ser o buraco grande: nenhum dos KMZ produzidos foi alguma vez aberto no DJI Pilot 2, nem os enums WPML testados contra um aparelho. A2 é a demonstração de porque isso importa — o ficheiro é XML sintacticamente válido, passa os testes todos, e pode ser recusado ou mal interpretado no arranque da missão. Não há validação em voo real de nenhum modo.

**Verificado por análise, não por medição.** A cobertura efectiva do corredor. Sei agora que uma passagem pode transbordar 2x (A3) e que outra pode saltar 20 km em linha recta (A1), mas ninguém mediu a fracção do corredor que fica realmente coberta com sobreposição suficiente — o `stats.coveredWidthM` continua a ser a largura pedida, e nenhum teste compara a faixa voada com a faixa pedida. Uma asserção que integre a cobertura sobre o terreno apanharia A1 e A3 de uma vez, e apanharia o próximo.

**Verificado só em geometria de brinquedo.** Todos os cenários de corredor — os meus e os dos cépticos — usam eixos sintéticos: L, escada, ziguezague, semicircunferência. Nenhum usa um traçado real importado (uma estrada de OSM, um cadastro de conduta), onde a densidade de vértices é irregular e as deflexões pequenas se acumulam. É exactamente o regime onde a falésia dos 120° de A3 pode aparecer sem ninguém a procurar.

**Não coberto por esta revisão, por âmbito.** Não olhei para os módulos anteriores a 622ea92 senão onde o código novo lhes toca (o exportador, por A2). A importação de projectos (`applyProject`), a leitura de MDT e o modo área ficam com a cobertura que já tinham. E as limitações que o projecto assume — corredor só nadir, sem seguimento de terreno, sem divisão por bateria, sem tempo de paragem por waypoint — continuam por levantar; A1 mostra que a ausência de divisão por bateria não é neutra, porque a ferramenta aceita uma missão de 68 km e corrompe-a em vez de a recusar.

**O que os testes garantem hoje.** 581 asserções a passar, e uma delas — `smoke-test.mjs:2206` — a certificar activamente um defeito de gravidade alta. Vale a pena ler isso como aviso sobre o resto da suite: várias asserções de corredor contam pontos, verificam vértices e preservam extremos, mas nenhuma mede distâncias ao eixo no interior dos segmentos. É a classe inteira de defeitos que A1 e A3 ocupam, e é o buraco de método que eu fecharia primeiro.