# Revisão do código, dos testes e da usabilidade (Outubro de 2026)

Terceira vaga da revisão completa da aplicação. A primeira reviu o exportador
contra a especificação WPML da DJI (`REVISAO-EXPORTACAO-2026-10.md`); a
segunda, a matemática da missão (`REVISAO-MATEMATICA-2026-10.md`). Pergunta
desta vaga: **o código de aplicação é sólido (projecto, estado, erros), a
suite de testes apanha o que importa antes do campo, e a interface diz ao
operador o que ele precisa de saber para voar?**

**Estado (2026-10-19):** pacotes R-A a R-D aprovados, pela ordem R-A, R-C,
R-B, R-D. R-A (projecto e dados: C1, C2, C3, C4, C5, C6, C7, T1, T4, U5)
aplicado, com `tests/unit/projecto-ida-volta.test.mjs`,
`tests/unit/crs-controlo.test.mjs` e sete cenários E2E novos. R-C
(desempenho e portão de testes: C8, C9, T2, T3, T7, T8, T13, T14)
aplicado, com `tests/unit/i18n.test.mjs`,
`tests/unit/ligacao-app-seguranca.test.mjs`, o workflow nocturno e quatro
cenários E2E novos. R-B (preflight, textos e identificadores: U1, U2, U3,
U4, U6, U8, U12, C10, C11/U18, U21 + T15 + C12a, T5, T10) aplicado, com
`tests/unit/preflight-limiares.test.mjs`, `src/utils/appError.js` e
`src/i18n/dict.errors.js`; de U21 ficam de fora, de propósito, a formatação
pt-PT dos números (os números do painel seguem os dos ficheiros e das
medições) e o nome por omissão com data. R-D a seguir. Os achados das duas
primeiras vagas não se repetem aqui.

## 1. Método

Três agentes de revisão (Claude Opus 5.5), um por domínio, sem alterarem o
repositório. O agente do código correu a aplicação num servidor Vite isolado
com o Chromium do Playwright (rede exterior cortada, um tile de relevo plano
servido localmente) e confirmou cada achado que bloqueia no browser; o dos
testes correu a suite inteira, a cobertura por ferramenta e **38 mutações**
do código (uma alteração de cada vez numa cópia, a ver que teste a apanha);
o da usabilidade trabalhou sobre os componentes, os dicionários PT/EN (770
chaves), os valores por omissão, o E2E lido como guião do utilizador, o
manual de QA, a ajuda e o CHANGELOG. Os achados principais foram depois
confirmados por mim no código antes de entrarem aqui: C1 a C7 (os sítios
exactos em `useAreaGeometry.js`, `App.jsx`, `useProject.js`, `project.js` e
`i18n.jsx`), U1 a U5 (preflight, dicionários, `ControlPanel.jsx`,
`baseLayout.js`, `ChecklistPage.jsx`), T1 (a definição do EPSG:20790 em
`importArea.js`) e T2 (o deploy do commit 112dc64 publicado com o CI
vermelho, visto nas execuções do GitHub). Os scripts e as sondas dos agentes
ficaram fora do repositório.

| Domínio                                                                             | Material                                                                                                           | Achados                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| C — código de aplicação: App, componentes, hooks, projecto, importadores, i18n      | `App.jsx` (2993 linhas), `components/*` (11 663), `hooks/*`, `mission/project.js`, `utils/import*.js`, `i18n*`     | 15 (7 bloqueiam, 4, 4)  |
| T — testes e CI: unitários, smoke, E/S, E2E, goldens, instantâneo, cobertura, fluxos | `tests/**`, `smoke-test*.mjs`, `tools/`, `.github/workflows/*`, `vitest.config.js`, `package.json`                 | 16 (5 bloqueiam, 7, 4)  |
| U — usabilidade: fluxo, textos, números, erros, campo, convenções DJI, ergonomia    | componentes, `src/i18n/*`, `defaults.js`, `drones.js`, `tests/e2e/run.mjs`, `QA_MANUAL.md`, `README.pt.md`, ajuda | 23 (5 bloqueiam, 16, 2) |

Classificação: **Bloqueia** = resultado errado, perda de dados, crash ou
risco de segurança, ou o operador induzido em erro com consequência no voo
ou nos dados; **Errado mas funciona** = erro real sem consequência grave
hoje; **Melhoria** = valor claro.

## 2. Resumo

54 achados: **17 bloqueiam**, 27 errados mas funcionam, 10 melhorias. Não há
nenhum de segurança de conteúdo (XSS, escape de XML, nomes de ficheiro): a
superfície HTML e os ficheiros gerados estão bem guardados. Os problemas
concentram-se em oito sítios:

1. **O ciclo de vida do projecto** (C1, C2, C3, C5, C7, T4): abrir um
   projecto por cima de uma sessão deixa ficar a geometria, as partes
   importadas, o histórico e os parâmetros da sessão anterior — e o KMZ sai
   com a geometria errada e o nome certo; um vértice editado num rectângulo
   da âncora perde-se ao recarregar; «Usar todas as partes como células» não
   é gravado; um projecto com coordenadas malformadas deixa a página em
   branco em todos os arranques; uma leitura falhada é sobrescrita por um
   projecto vazio; a ida e volta do projecto não tem teste que a guarde.
2. **A robustez do arranque e das janelas sob demanda** (C4, C6): sem
   _error boundary_, o relatório sem rede ou a Vista 3D sem WebGL apagam a
   aplicação inteira; com o armazenamento recusado a página fica em branco.
3. **Uma definição de CRS errada** (T1): o Hayford-Gauss Militar
   (EPSG:20790) tem o meridiano central 0,065° a leste do do registo EPSG —
   uma área ou um MDT nesse sistema entram 5,4–5,8 km ao lado, sem erro.
4. **O que a pastilha do preflight não vê ou diz mal** (U1, U2, U3, U4, U8,
   U12): a colisão da fachada com o MDS e as passagens do corredor sem
   cobertura ficam fora dela; «Altitude (AGL)» sem seguir terreno é altura
   acima da descolagem; a altura de regresso nunca aparece; sem bases o
   mesmo bloco tem dois números; códigos em bruto e índices de waypoints
   nas mensagens; cores dos cartões que contradizem os níveis.
5. **O registo de campo** (U5, U10, U11): a checklist é uma para todos os
   projectos e abre com os itens críticos da missão anterior marcados; a
   ficha não tem a altura que o comando vai mostrar, os parâmetros nem o
   total do dia; quatro itens da checklist contradizem o plano.
6. **O portão de testes** (T2, T3, T5, T7, T8): o deploy e a release não
   esperam pelo CI; a ligação do App às verificações de segurança não tem
   teste nenhum (uma refactorização desliga-as em silêncio); os limiares são
   testados longe da fronteira (15 mutações passam em tudo); propriedades
   sem semente e cinco testes de tempo tornam o portão não determinista; o
   limiar de cobertura só mede o smoke sobre `src/utils`.
7. **O desempenho ao escrever** (C8, C9): `useT()` devolve uma função nova
   em cada render e, por ser dependência do seguimento de terreno, refaz o
   plano a cada tecla no nome da missão (4,6 s de tarefas longas em 10
   teclas, numa área de 5 × 4 km); os campos numéricos aplicam cada tecla
   (o «1» de «120» é um plano a 1 m com 1882 faixas).
8. **Os textos** (C10, C11, U18, U21): mensagens geradas em português fora
   do dicionário e mostradas em EN, `export.err.unknown` cru, grafias AO90
   numa interface pré-AO90, e um terceiro higienizador de nomes de ficheiro
   (`-vora-projeto.json` ao lado de `Evora_area_A-1.kmz`).

## 3. Achados que bloqueiam

### 3.1 Código (C)

- **M3-C1 — Abrir um projecto não limpa a sessão.**
  `useAreaGeometry.js:716-726`, `App.jsx:1977-2031`, `useProject.js:77-92`.
  `applyProjectGeometry` só põe o anel `if (n.ring)` e nunca repõe
  `gridCells`, `importParts`/`importWarning` nem o histórico;
  `applyNormalized` funde `params`, `custom`, `terrainFollow` e `gcpConfig`
  no estado corrente (`{...prev, ...n.params}`) em vez de partir das
  omissões; `importProject` não limpa `importError`. Verificado no browser:
  com a grelha 2×2 da âncora aberta, abrir `p2.json` (área desenhada de
  300 × 300 m a 3,6 km) exporta `p2-desenhada_area_voos.zip` com **76 de 76
  waypoints na grelha do projecto anterior e 0 na área de p2**, com o resumo
  a dizer 96 ha; um projecto sem área abre com o anel da sessão anterior; o
  Ctrl+Z repõe o anel da sessão anterior e apaga a base do projecto aberto;
  um projecto v1 herda prolongamento, fiada, margem e seguir terreno que
  nunca teve. Correcção: `resetSession(n)` em `useAreaGeometry` (anel,
  buracos, células, partes, avisos, histórico) chamado por
  `applyProjectGeometry`; `applyNormalized` a partir das omissões
  (`DEFAULT_PARAMS`, `DEFAULT_TERRAIN_FOLLOW`, `DEFAULT_GCP_CONFIG`,
  `DEFAULT_CUSTOM_SENSOR`), todos os campos escritos. Teste: E2E
  «projecto-por-cima» (grelha da âncora → abrir um projecto desenhado →
  todos os waypoints do KMZ dentro da área aberta, Ctrl+Z não sai do
  projecto, sem o botão das partes); unitário: as chaves de
  `normalizeProject({version: 1})` cobrem os campos de `serializeProject`.
- **M3-C2 — Um vértice editado num rectângulo da âncora perde-se.**
  `useAreaGeometry.js:137-160, 557-608`. O rectângulo é regenerado pelo
  efeito sempre que o objecto `anchor` muda; arrastar, inserir ou apagar um
  vértice edita `ring` mas deixa `anchor.center`; ao abrir um projecto a
  âncora gravada é aplicada depois do anel e o efeito escreve por cima.
  Verificado: rectângulo de 500 × 300 m com um vértice arrastado → depois de
  recarregar, o rectângulo original; mover a área pela pega devolve o
  rectângulo puro. A área que o operador acertou à mão (tirar um edifício)
  volta ao rectângulo em silêncio — e é essa que voa. Correcção: qualquer
  edição manual solta a âncora (`center: null`, `areaOrigin 'draw'`), como
  `startDraw` e `applyImportedRing` já fazem; `applyProjectGeometry` só
  aplica `anchor.center` com `areaOrigin === 'anchor'`. Teste: E2E
  «âncora-editada».
- **M3-C3 — «Usar todas as partes como células» não é gravado.**
  `useAreaGeometry.js:641-647`, `project.js:51-121`, esquema v2. As partes
  vão para `gridCells`, que nem `serializeProject` nem o estado do projecto
  guardam; ao reabrir fica só `ring`, a maior parte. Verificado: duas partes
  (500 e 300 m) → 2 voos e 14 waypoints na parte pequena; recarregar → um
  só KMZ e 0 waypoints nela, sem aviso. Correcção: gravar `cells` (anéis e
  buracos) quando `areaOrigin !== 'anchor'`, ler, validar e repor; campo no
  esquema. Teste: ida e volta com células; E2E partes → recarregar → 2 voos.
- **M3-C4 — Não há _error boundary_.** `main.jsx:7-11`, `App.jsx:2869-2990`,
  `Map3D.jsx:693-696`. Só `<Suspense>` à volta dos três componentes sob
  demanda, e o `WebGLRenderer` corre num efeito sem try/catch. Verificado:
  sem rede, com o bloco do relatório por carregar, «Relatório» dá `Failed to
  fetch dynamically imported module` e o `#root` passa a vazio; num browser
  sem WebGL, «Vista 3D» faz o mesmo. No campo sem rede — o cenário para que
  existe a cache do relevo — abrir as fichas apaga o planeador; só
  recarregar o recupera. Correcção: um ErrorBoundary por janela sob demanda
  («Fechar» repõe o estado) e um no topo («Recarregar»); try/catch no
  renderer; pré-carregar os três blocos depois do arranque
  (`requestIdleCallback`). Teste: E2E com `page.route` a abortar o bloco e
  `getContext('webgl')` a devolver null.
- **M3-C5 — Um projecto com coordenadas malformadas deixa a página em
  branco.** `project.js:176, 193-200`. `normalizeProject` aceita `params` de
  qualquer forma, pontos de inspecção só com `Array.isArray(q.point)`,
  `anchor` tal como vem, qualquer array como `ring`. Verificado com quatro
  projectos (anel com texto, `point: [lon]`, `center: [lon]`, buraco com
  texto): página em branco; vindos do localStorage, **em todos os
  arranques** — o projecto mau continua gravado. Correcção: validar como o
  equipamento já faz (`normalizeEquipment`): vértices `isPoint`, ≥ 3, ou
  projecto recusado; `params` com números finitos; ids inteiros. Teste:
  fast-check sobre `normalizeProject` (devolve null ou só coordenadas
  finitas) e os quatro casos.
- **M3-C6 — Com o armazenamento recusado a página fica em branco.**
  `App.jsx:152`: a língua lê-se com `localStorage.getItem` directamente no
  inicializador do `useState`, sem try/catch (o próprio ficheiro tem
  `browserStorage()` para isso); verificado com o getter a lançar
  `SecurityError`. Correcção: try/catch e validação contra `LANGS`. Teste:
  E2E com `addInitScript`.
- **M3-C7 — Uma leitura falhada do projecto gravado é sobrescrita.**
  `useProject.js:43-68`: a hidratação marca `hydratedRef` mesmo quando não
  leu nada (JSON inválido, `version` diferente de 1/2, excepção) e a
  gravação automática escreve o estado vazio 500 ms depois. Verificado: com
  um projecto `version: 3`, 2 s depois lá está `version 2`, anel null.
  Correcção: copiar a cadeia recusada para `…:project:v1:recusado` com a
  data, avisar, e só gravar depois de uma alteração do operador.

### 3.2 Testes e CI (T)

- **M3-T1 — EPSG:20790 com o meridiano central errado.**
  `importArea.js:42-46` (também usado por `demFile.js` para os GeoTIFF):
  `+lon_0=1.06541666666667 +pm=lisbon` (−8,066 489°) em vez de `+lon_0=1`
  do registo EPSG (−8,131 906°, Melriça). Medido: a relação Militares =
  Hayford-Gauss 73 + (200 000, 300 000) dá resíduos de −5,4 a −5,8 km em
  Lisboa, Porto, Faro e Bragança com a definição da app, e 0,1–0,2 m com a
  do registo. As definições só são testadas por ida e volta consigo próprias
  (qualquer definição inversível passa) ou com limites largos; o 20790 não
  tem teste nenhum; mutações de 100 m no PT-TM06 e de ~450 m no Datum 73
  passam em tudo. Efeito: uma área ou um MDT nesse sistema entram 5,4–5,8 km
  a leste e o seguimento de terreno calcula-se sobre outro relevo.
  Correcção: `+lon_0=1`. Teste: `crs-controlo.test.mjs` com as quatro
  cidades (|Δ| < 1 m), as origens de 3763 e 20790 a < 1 m de Melriça e os
  meridianos centrais a 1e-6°.
- **M3-T2 — O deploy e a release não esperam pelo CI.** `deploy.yml`,
  `release.yml`: correm a cada push a `main` em paralelo com o CI, só com
  lint, `npm run test` e build — sem E2E, typecheck, Prettier nem cobertura.
  Verificado na 112dc64: o CI falhou («Property-based tests», um defeito
  real — a faixa da borda cortada a meio, corrigido em 4a480b7) e o Deploy
  publicou um minuto depois, porque o seu `npm run test` passou com outra
  semente. Correcção: `on: workflow_run` do CI com `conclusion ==
  'success'`, a publicar o `dist/` que o CI construiu, ou um job de deploy
  em `ci.yml` com `needs: [checks, e2e]`.
- **M3-T3 — A ligação do App às verificações de segurança não tem teste.**
  `App.jsx:1535-1610, 401-415`, `useAreaGeometry.js:192-263`: `terrainHoles`
  e `transitClearanceInfo` (os bloqueios do pacote M-A) vivem no App, que
  nenhum teste em Node importa, e as suas mensagens têm 0 ocorrências no
  E2E; os enums com `imageFormat` (lente do M4T) são montados no App e
  replicados nos testes, e nenhum cenário E2E exporta com o M4T nem com o
  Mapper+ — tirar a linha 408 do App tira o `payloadLensIndex` dos KMZ
  térmicos e passa em tudo; os cenários E2E com divisão por bateria usam
  prolongamento 0, sem fiada nem margem (onde o M2-G1 não se via).
  Correcção: funções puras em `src/mission` (`transitLegs`, `missionWpml`,
  `batterySizingOpts`) usadas pelo App e pelos testes; E2E com MDT com um
  disco sem dados, trânsito atrás de uma cumeada, M4T térmica a exportar, e
  bateria com prolongamento 30 m, fiada e margem 10 % (`duration + trânsito
  ≤ útil` em cada KMZ).
- **M3-T4 — A ida e volta do projecto deixa de fora os campos antigos.**
  `project.js:51-121, 169-227`, `projecto.test.mjs:21-81`. Mutações que
  passam em tudo: gravar sem `holes`, abrir sem `holes`, gravar sem
  `terrainFollow`, abrir sem `anchor`, abrir sem `gcpConfig`. O estado do
  teste não tem `holes`, `safety`, `obstacleHeightM` nem `demFile`; o E2E do
  projecto verifica nome, dupla grelha e anel sobre uma área sem buracos.
  Efeito: um projecto reabre no campo sem os buracos — o KMZ cobre as zonas
  excluídas — ou sem seguir terreno, sem aviso; cada campo novo obriga a
  cinco sítios e nada verifica a cadeia. Correcção: `PROJECT_KEYS` exportada
  e usada pelo App e pelo teste de ida e volta com os 25 campos fora da
  omissão.
- **M3-T5 — Os limiares de segurança são testados longe da fronteira.**
  `preflight.js:17, 114-115`, `takeoffZones.js:769`, `exporters.js:40-49`.
  Mutações que passam em tudo: `transit-collision` de `< 0` para `< −10`
  (o teste usa −12,3 e +9); `CLEARANCE_WARN_M` 15 → 14; VLOS 20 % mais
  permissivo; duas só pelo diff de texto dos goldens (RTH mínimo 100 → 30 m;
  altura de descolagem 30 → 20 m). Correcção: `preflight-limiares.test.mjs`
  (−0,1 / 0 / 14,9 / 15; 999 / 1001 m; RTH 100 a 40 m e 110 a 90 m).

### 3.3 Usabilidade (U)

- **M3-U1 — O preflight deixa de fora dois avisos dos painéis.**
  `FacePanel.jsx:224-232`, `CorridorPanel.jsx:400-404`, `App.jsx:771-776,
  1877`, `preflight.js:499-547`. A caixa vermelha da fachada («o corredor
  de voo corta a superfície do DSM») e as passagens do corredor «SEM
  COBERTURA» só existem nos painéis; a pastilha pode estar verde («Pronto a
  exportar») com o KMZ activo enquanto a passagem 4 corta a face.
  Correcção: itens `face-clearance` (bloqueio), `face-unverified` (aviso) e
  `corridor-uncovered` (aviso) em `preflightPlan`; o botão do painel usa o
  mesmo `exportBlocked`.
- **M3-U2 — «Altitude (AGL)» engana sem seguir terreno.**
  `dict.controlPanel.js:148`, `MissionReport.jsx:59, 737`,
  `exporters.js:1012, 1037`. Sem «Seguir terreno» (desligado por omissão) o
  KMZ escreve a altura **relativa à descolagem**; com a base no vale e a
  área 60 m acima, «AGL 80» são 20 m do chão, e nada o diz (a folga só avisa
  abaixo de 15 m). Correcção: rótulo pelo modo — «Altura acima da
  descolagem» com a linha «Sobre a área: {min}–{max} m acima do solo» (a
  âmbar quando o mínimo fica abaixo de metade), e «Altura AGL (segue o
  terreno)» com o seguimento; o mesmo no relatório.
- **M3-U3 — A altura de regresso (RTH) nunca aparece.**
  `exporters.js:39-49, 579-596`: o KMZ fixa `globalRTHHeight` em máx(100 m,
  topo da rota + 20) e a subida de descolagem em 30 m, e nenhum ecrã, ficha
  ou relatório os mostra — a checklist e o README mandam «confirmar o RTH»
  e o bloqueio `transit-collision` manda «subir o RTH», sem controlo para
  isso; com seguir terreno a 180 m, o regresso a 200 m passa os 120 m da
  categoria aberta junto à base sem nota. Correcção: linha «Regresso (RTH):
  {rth} m acima da descolagem · subida na descolagem: 30 m» no cartão 5, na
  ficha, na checklist e no relatório; o RTH na nota da categoria aberta;
  remédio do `transit-collision` reescrito.
- **M3-U4 — Sem bases, o mesmo bloco tem dois números.**
  `ControlPanel.jsx:1093`, `MapView.jsx:671`, `baseLayout.js:244`,
  `dict.preflight.js:81-84`. Mosaico sem bases com a célula 3 desactivada: o
  quadrado é «3» no mapa e sai como `_3.kmz`, mas é «B04» no cartão 4 e
  «Bloco 4» no preflight; o «4» do mapa é outro quadrado. O operador vai ao
  «4» do mapa e o voo longo (`_3.kmz`) segue para o comando. Correcção: um
  só identificador visível, o rótulo do voo, em todos os textos (`Voo 3:
  …`); com bases já é assim.
- **M3-U5 — A checklist é uma para todos os projectos.**
  `ChecklistPage.jsx:16, 1172-1187`: chave única no armazenamento; os itens
  marcados e os campos «Missão» e «Plataforma» gravados ganham aos do
  planeador. A checklist de quarta abre com a missão e a plataforma de
  segunda e os críticos («Autorização de voo / NOTAM», «Baterias ≥ 95 %»)
  já marcados — e é o registo que se exporta e imprime. Correcção: checklist
  por projecto (chave com o nome ou a impressão SHA-256 do relatório); faixa
  «Esta checklist é da missão «…» (data). Começar uma nova · Continuar»;
  «Missão» e «Plataforma» sempre do planeador.

## 4. Os restantes achados

### 4.1 Errado mas funciona

| Id     | Achado                                                                                                                                                                                                                                                                                                                                                                           | Correcção                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-C8  | `useT()` (`i18n.jsx:29-39`) devolve uma função nova em cada chamada; `t` é dependência do seguimento de terreno (`useAreaMission.js:308`) e das fichas (`App.jsx:1101`), que se recalculam em cada render, e com eles a rota, a folga, o preflight e o redesenho do mapa. Medido: 10 teclas no nome da missão → `planTerrainFollow`, `routeClearance` e `preflightArea` 10 vezes cada; 4,6 s de tarefas longas numa área de 5 × 4 km. | `useT` com `useMemo` por língua; o seguimento de terreno devolve códigos traduzidos no painel e `t` sai das dependências; memorizar os blocos do Perfil.                                                     |
| M3-C9  | Campos numéricos controlados tecla a tecla (`ControlPanel.jsx:31-45`): escrever «120» na altitude planeia a 1 m (1882 faixas) e a 12 m pelo caminho; `min`/`max` não se aplicam ao que se escreve; o campo vazio dá 0.                                                                                                                                                             | `NumberInput` com rascunho local confirmado no blur/Enter ou ao fim de ~400 ms, limitado a [min, max]; tabela de limites em `setParam`.                                                                      |
| M3-C10 | `runExport` (`App.jsx:275-283`) grava `'unknown'` para qualquer erro que não seja `MissionExportError` e o dicionário não tem `export.err.unknown`: o operador lê a chave crua; `per-waypoint-not-finite`/`-invalid` têm `{d}` que nunca é preenchido; `export.failed` diz «valores inválidos» também para falhas do ZIP.                                                          | Guardar `{code, detail}`; `export.err.unknown` PT/EN com a mensagem; texto neutro de `export.failed`.                                                                                                        |
| M3-C11 | Mensagens em português fora do dicionário, mostradas cruas também em EN: avisos do seguimento de terreno (`terrain.js:803-815`), sem rede (`useTerrain.js`, sem acentos), 16 mensagens do MDT (`demFile.js`), importações (`importArea.js`, `importWpml.js`), projecto («Ficheiro de projeto inválido», AO90, que fica depois de abrir um válido), equipamento; texto fixo em `Map3D.jsx`. | Códigos com variáveis traduzidos nos painéis (como o corredor e o circular já fazem); limpar `importError` ao abrir um projecto; verificação no smoke de `throw new Error('…')` em português.                   |
| M3-T6  | Os goldens (16 ficheiros, 65 656 linhas) comparam texto exacto e mudam a cada alteração do motor (regenerados em 5 dos últimos 9 commits; 14 de 16 na 112dc64): um diff destes não se revê, e as mutações do RTH mínimo e da altura de descolagem só aparecem aí. Cenários escritos à mão por fora de `buildAreaExport`; `area-lidar` é M3E + LiDAR, combinação que a app não produz.    | Resumo estrutural por cenário (`<cenário>.resumo.json`: contagens por elemento, acções, waypoints, `distance`/`duration`) revisável; goldens pelos construtores da app nas combinações reais.                 |
| M3-T7  | O portão não é determinista: cinco testes de tempo (p. ex. `bases-sitios-bons.test.mjs:518`, 82 ms contra 50 na corrida completa) e 17 `fc.assert` sem semente; o mesmo `npm run test` falhou no CI e passou no Deploy um minuto depois.                                                                                                                                              | Tempos para `tests/perf/` fora do portão (ou contar operações); `fc.configureGlobal({seed})` fixo no portão e um job nocturno com semente aleatória; cada contra-exemplo passa a teste fixo.                 |
| M3-T8  | O limiar de cobertura (92/90/82) mede só o smoke e a E/S sobre `src/utils`; os 650 testes do vitest não contam (c8 com `pool: 'forks'` dá 0 %); `src/mission` (30 módulos) não tem limiar; sem `--all` um módulo novo nem entra.                                                                                                                                                   | `c8 --all --include "src/{utils,mission}/**"` sobre smoke + E/S + `vitest run --pool=threads` (medido: `src/mission` 98,6 % linhas), limiares um ponto abaixo.                                              |
| M3-T9  | O instantâneo e a ferramenta planeado-vs-medido (`tools/lib/planeado.mjs`) reimplementam a orquestração do App sem células, buracos nem blocos, e ignoram a bateria do projecto: a R3 fica com 45 faixas e 4 549 s onde a app planeia 4 células, 95 faixas e 4 912 s; o M-A mudou o lado por bateria e o `esperado.json` não mudou.                                                    | Uma só `planMissionFromProject(n)` em `src/mission`, usada pelo App e pelas ferramentas; instantâneo com `blocks` e a maior razão voo/útil.                                                                 |
| M3-T10 | `baseZoneFor` (`reference.js:39-50`, a correcção M2-T6 do corredor e do circular) não é executada por teste nenhum (0 chamadas em smoke + E/S + unitários); `return null` passa em tudo.                                                                                                                                                                                             | Teste em `cota-referencia.test.mjs` (patamar a 200 m com 196 m à volta → `refElev` 196, `gainM` 4).                                                                                                        |
| M3-T14 | E2E: a captura em falha nunca acontece (`ctx` fica null quando o cenário lança) e a página não é fechada; `E2E_ONLY` com um nome inexistente corre 0 cenários e passa; 85 esperas fixas (70 s) onde há condição observável; ≈130 selectores por texto; o job E2E reconstrói a app em vez de testar o `dist/` do job `checks`.                                                          | `scenario()` abre a página e entrega-a (captura e `close` no `finally`); 0 verificações = falha; esperas por condição; `dist/` como artefacto.                                                               |
| M3-T15 | `projectFileName` (`project.js:136-142`) é um terceiro higienizador: «Évora» → `-vora-projeto.json`, «Quinta da Conceição» → `Quinta-da-Concei-o-projeto.json`, ao lado de `Evora_area_A-1.kmz`; a checklist usa um quarto (`slug`). O teste só tem nomes ASCII.                                                                                                                      | `safeFileStem(nome) + '-projecto.json'` (e o `slug` da checklist); teste com os três nomes.                                                                                                                 |
| M3-U6  | No fim do fluxo, o cartão 7 tem os botões de exportação cinzentos sem uma palavra sobre o bloqueio (só no `title`, invisível em ecrã táctil); o porquê está numa pastilha fechada no canto oposto; quatro textos apontam para sítios que já não existem («secção Terreno», «painel das bases»); a ajuda contradiz-se («Opcional: … carregue o terreno» vs «Não há missão sem relevo»). | Caixa vermelha no cartão 7 com os dois primeiros bloqueios e «Ver todos no Preflight»; corrigir os ponteiros e o passo 3 da ajuda.                                                                            |
| M3-U7  | O tipo de bateria e o «Tempo útil por voo» só aparecem com a divisão «Bateria», mas decidem os avisos e a cor de «Voo mais longo / útil» em todas as divisões; no corredor a altitude e as sobreposições vêm do separador Área sem campo nem nota (o circular tem-na); «Área máx. por bloco» está na gaveta quando o lado do mosaico está no cartão.                                        | Bateria e tempo útil no topo do cartão 4 em todas as divisões; linha da altitude no corredor; «Área máx. por bloco» no cartão.                                                                               |
| M3-U8  | `plan-error` mostra o código em bruto («O plano tem um erro (standoff-corner)»); os itens de rota dão índices de waypoints que nenhum ecrã mostra; `battery-block`, `agl-cap` e `heights-relative` sem remédio ou com um remédio impossível («descole no ponto de referência do plano», que é uma cota).                                                                               | `plan-error` com a mensagem traduzida do modo; voo e coordenadas em vez de índices; remédios (secção «Textos a rever» do relatório do agente).                                                                |
| M3-U9  | Acções destrutivas sem confirmação nem anulação: «Abrir projecto» por cima de um dia de trabalho; o botão «Anular ponto» que passa a «Limpar» ao concluir o eixo (um segundo clique apaga 6 km de eixo); limpar a fachada, o POI e os pontos de inspecção sem histórico; «Remover base» sem saber qual; não há «Novo projecto» (`clearAll` não toca em bases, pontos, eixo, fachada nem nome). | «Novo projecto» no cartão 1; confirmação em «Abrir projecto» com alterações; Ctrl+Z para o eixo, a linha de base e os pontos; «Limpar» nunca na posição de «Anular ponto»; «Remover base» só com base seleccionada. |
| M3-U10 | A ficha de campo não tem a altura que o comando vai mostrar (1.º waypoint e máxima), os parâmetros que o piloto confere no Pilot 2, o RTH, a percentagem do útil por voo nem o total do dia; só existe na área com bases e blocos (uma rota única, um corredor ou uma órbita não levam a base para o papel); `bases.sheet.coords` existe e não é usada.                                   | Por voo «Altura no comando: {h1}–{hmax} m» e «{pct} % do útil»; por base os parâmetros e o RTH; linha do dia; ficha para todos os modos.                                                                      |
| M3-U11 | Quatro itens da checklist contradizem o plano: «Overlap lateral ≥ 70 %, frontal ≥ 80 %» (crítico) contra os 50 % do Mapper+; «retorno se < 30 %» contra blocos dimensionados a 92–95 % do útil (cada bloco seria interrompido 2–4 min antes do fim); «GCPs: mínimo 5 por bloco» (60 em 12 blocos); corredor «altura única … sem seguimento de terreno» quando segue desde a 1.4.0.         | Textos tirados do plano («Sobreposição do plano: {f}/{s} %», «Regressar com a reserva com que o tempo útil foi medido», «GCPs: {n} planeados»); o item do corredor só sem seguir terreno.                 |
| M3-U12 | Cores dos cartões contra os níveis do preflight: `too-many-lines` a âmbar (bloqueia), `aglWarn` a vermelho (só avisa), relevo fora de cobertura a âmbar (bloqueia); «1 bloqueios, 0 avisos»; sem área, a primeira coisa que a aplicação diz é «⛔ Preflight · 1 bloqueios».                                                                                                         | As caixas usam o nível e o ícone do item (⛔ ⚠ ⓘ); plurais; sem plano, pastilha neutra «defina a área (cartão 2)».                                                                                           |
| M3-U13 | `pointer-events-none` no painel de métricas (`StatsPanel.jsx:99`) mata as nove dicas (`title`) que explicam os parênteses e o âmbar; «Tempo estimado» (sem trânsito) e «Tempo total de voo» (com) com o mesmo rótulo em sítios diferentes; «A-3 18:42 / 20:00» lê-se como hora do dia; o cartão 7 não tem «Voo mais longo / útil».                                                         | `pointer-events-auto` nos mosaicos ou um «?»; «Tempo na rota (sem trânsito)» / «Tempo total com trânsitos»; um só formato; «Voo mais longo / útil» no cartão 7.                                              |
| M3-U14 | Quatro formas do mesmo número: «Baterias {n} de {s} conj.» (n são voos), «Voos / conjuntos 6 / 4», «{bat} baterias», «{flights} necessários · a equipa tem {sets}»; rota única acima do útil → «1 de 1 conj.» a âmbar; a ficha compara os voos de uma base com os conjuntos da equipa inteira.                                                                                         | Uma frase — «Conjuntos de baterias: 6 precisos · 4 na equipa» — em todo o lado; na rota única `n = ⌈(tempo + trânsito)/útil⌉`; linha do dia na ficha.                                                        |
| M3-U15 | O mesmo objecto com três nomes (voo A-3, bloco 4, célula; relatório «B04» sem trânsito ao lado da ficha «A-3» com trânsito); em EN «home point» em 11 chaves e «base» em 71 («Home Point» do DJI é o ponto gravado ao descolar); «takeoff»/«take-off».                                                                                                                              | Glossário: voo (A-3), célula (só na edição do mosaico), base (EN «base»); relatório por voo e com o trânsito.                                                                                                |
| M3-U16 | Com bases, «Exportar a missão (KMZ)» descarrega dois ZIP com os mesmos KMZ (`…_voos.zip` e `…_voos-por-base.zip`); se o browser recusar o segundo pedido ninguém o diz; copiados os dois, cada voo aparece duas vezes no Pilot 2.                                                                                                                                                      | Um clique, um ficheiro: com bases o ZIP por base, sem bases o ZIP dos voos; o rótulo diz o que sai.                                                                                                          |
| M3-U17 | O projecto não guarda a versão da aplicação e as migrações são silenciosas; o CHANGELOG «Por publicar» muda o plano de um projecto reaberto (quadrados mais pequenos, bloqueios novos, 12 → 21 fotos por círculo, órbita a começar do lado da base): o «A-4» de agora é outro quadrado, e refazer o voo que falhou reexporta o quadrado errado.                                           | `appVersion` no projecto; faixa no cartão 1 ao abrir um de versão anterior com a lista curta do que mudou; «O que mudou» na ajuda.                                                                            |
| M3-U18 | Erros de importação e de projecto em PT fixo, longe do botão e sem o passo seguinte: «Ficheiro de projeto inválido» aparece no cartão 2 debaixo de «Importar área»; «Nenhum polígono encontrado no KML» para um KML com o eixo de uma estrada; «Formato não suportado — use .kml, .geojson…» quando o botão aceita `.kmz`; «Bateria padrão» também em EN.                               | Códigos `import.err.*` PT/EN com o que fazer («O ficheiro tem linhas mas nenhum polígono: … desenhe o eixo no separador Corredor»), mostrados junto do botão.                                               |
| M3-U19 | O manual de QA falha por construção (§4 descreve o campo de bateria antigo; §8 diz que o corredor não segue o terreno; «modo Área → Terreno»); dos «por confirmar em voo» do CHANGELOG só dois têm passo; o M4T térmico não avisa que é o primeiro voo da lente escrita em cada foto.                                                                                                | Refazer §4 e §8; secção «Primeiro voo de cada modo» com B2, M3, M2 e a foto sem paragem; `info` no preflight enquanto a matriz não tiver o voo.                                                             |
| M3-U20 | «{s}×{s} m (≈1 bateria)» e «3×2 quadrados de 250 m = 6 baterias» na grelha do ponto central: um quadrado de 250 m dura 3,3 min no M3E, 6,5 no P1 e 6,0 no Mapper+, contra 25–32 min úteis — a dica erra 4 a 8 vezes.                                                                                                                                                                  | Tirar «≈1 bateria» ou calcular («≈{min} min com os parâmetros actuais»); remeter para a divisão «Bateria».                                                                                                  |
| M3-U21 | Grafias AO90 em texto visível («Retângulo» no botão do cartão 2, «auto-interseções», «Seleção», «correto», «elétrica», «inspecionada», «projetar», «projeto» e o sufixo `-projeto.json`); EN com «center» no meio de «centre»; vírgula decimal nos textos e ponto nos números (`toFixed` sem `toLocaleString`); o nome por omissão «missao-drone» dá o mesmo nome a missões de projectos diferentes. | Grafias pré-AO90; `-projecto.json`; um só inglês; `Intl.NumberFormat('pt-PT')` nos números; pedir um nome (ou juntar a data) ao exportar com o nome por omissão.                                           |

### 4.2 Melhorias

| Id     | Achado                                                                                                                                                                                                                                                                                                                    | Correcção                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-C12 | Duplicação: `projectFileName` fora da unificação K-E3 (= M3-T15); cópia de `escapeXml` em `gcp.js` sem a limpeza dos caracteres ilegais; três «concluir desenho» iguais com efeitos dentro do actualizador de `setDraftVertices` (o StrictMode corre-os duas vezes).                                                           | `safeFileStem`; `gcp.js` importa `escapeXml`; `finishDraft(draft, min)` pura com os efeitos fora do actualizador.                                                                                               |
| M3-C13 | Código morto e API só para testes: `BASE_MARKER_HTML`, `VLOS_M`, `WAYPOINT_STOPS` sem uso; `clearTileCache` documentado como um botão «limpar» que não existe (a cache dos tiles não tem limpeza nem limite); seis funções só usadas nos testes; comentário órfão em `App.jsx:332-336`.                                        | Apagar os três; marcar os de teste; «Limpar a cache do relevo» na Configuração com o tamanho de `navigator.storage.estimate()`.                                                                                 |
| M3-C14 | O typecheck só inclui `src/utils`, `mission`, `data` e `hooks`: o `App.jsx` e os `components` (onde estão C1, C4, C6, C8, C9 e C10) não são verificados; `strictNullChecks` desligado (307 erros na parte verificada); `normalizeProject` sem `@param`/`@returns` (tudo `any`, por isso nada obriga o anel a ser `[number, number][]`). | `@types/react` e `src/**/*.jsx` no include com `@ts-nocheck` a retirar um a um; typedef `Project`/`NormalizedProject`; `strictNullChecks` por pasta.                                                              |
| M3-C15 | `App.jsx` com 2993 linhas e 130 hooks; o memo do preflight tem 57 dependências. Extracções com melhor relação valor/risco: `useProjectSession` (aplicar, repor e validar um projecto — fecha a classe de C1, C3, C5 e C7), `activeRoute()` pura em `src/mission` (view3d, folga, buracos, trânsitos, AGL — testável em Node), `preflightFor(modo, ctx)`, `useBases()`. | As quatro extracções, por esta ordem; não vale a pena o JSX do cabeçalho e dos painéis.                                                                                                                          |
| M3-T11 | A matriz de conformidade deixa de fora: os parâmetros da área por fora de `buildAreaExport` (sem dupla grelha, nadir, blocos por bateria, nomes de voo); corredor, circular e órbita no M4T; fachada, órbita e inspecção no M300; LiDAR no corredor; RTK nunca variado. O E2E nunca passa os KMZ exportados pelo validador, e o validador só vê forma (sem fotos, lente errada ou alturas a 1 m dão «SEM ERROS»). | `validateKmz` em `readRoutes` do E2E; matriz da área por `buildAreaExport` com blocos, terreno e nadir; combinações em falta; expectativas por caso (≥ 1 grupo de disparo, `payloadLensIndex` = `imageFormat`). |
| M3-T12 | Nenhum ficheiro real na suite: tudo sintetizado pelos próprios testes; o ramo do shapefile nunca corre; uma actualização do `proj4` ou do `shpjs` (há PR do Dependabot em aberto) passa no CI.                                                                                                                              | `tests/fixtures/` com shapefile QGIS em PT-TM06 (com e sem `.prj`), GeoJSON QGIS, KML Google Earth, recorte de MDT da DGT, projectos gravados pelas versões 1.0, 1.3 e 1.4.2.                                    |
| M3-T13 | Não há teste global do dicionário (hoje coerente só por cuidado): retirar `'stats.flights'` ou acrescentar `{x}` só ao EN passa em tudo; o E2E corre sempre em PT.                                                                                                                                                         | `i18n.test.mjs`: cada `t('literal')` existe, PT e EN não vazios, as mesmas variáveis, nenhuma chave definida duas vezes, cada código do preflight com mensagem, famílias dinâmicas ⊇ enums.                     |
| M3-T16 | `smoke-test.mjs` com 4 944 linhas e 65 blocos: numeração fora de ordem, fixtures de topo partilhadas por blocos distantes, uma excepção aborta os seguintes, nenhum bloco corre sozinho, duplicação com os unitários (o bloco circular repete `circular.test.mjs`).                                                           | Partição em `tests/smoke/` (16 ficheiros por área, `lib.mjs` e `fixtures.mjs`, corredor de ~30 linhas; `node smoke-test.mjs terreno` corre um só) — tabela no relatório do agente.                              |
| M3-U22 | Margem em percentagem de √área (10 % são 25 m em 25 ha, 50 m em 1 km², 100 m em 4 km²) quando o Pilot 2 e o UgCS dão metros; a dica das paragens não dá o nome do Pilot 2 («Turns before waypoint. Flies through»); «Front/Forward overlap» e «Overlap/Sobreposição lateral» misturados.                                     | Margem em metros (atalhos 0/25/50/100 m) ou «= {m} m» ao lado; «(no Pilot 2: …)» na dica; um só termo.                                                                                                        |
| M3-U23 | Contraste abaixo de 4,5:1 nas dicas (`text-slate-500`, 4,06:1; 183 textos a 10–11 px) e nos botões de exportar (branco sobre `sky-600` 4,10:1); vértices de 12 px e remoção só com clique direito (sem alternativa táctil); setas e ✕ dos pontos sem `aria-label`; «At every waypoint» cortado numa `select` de 112 px; o painel de métricas (16 mosaicos, ~450 px) não se recolhe. | `slate-400` e 12 px; botões em `sky-700`/`emerald-700`; alvos de 24–32 px e remoção por toque longo ou botão; `aria-label`; `select` mais larga; painel recolhível.                                             |

### 4.3 Verificado e correcto

- **Segurança de conteúdo:** nenhum `dangerouslySetInnerHTML`; o HTML dos
  marcadores do Leaflet só leva rótulos validados; as descrições do KML de
  campo são escapadas como HTML e XML; nomes de missão e de base passam por
  `escapeXml`, e os nomes de ficheiros e pastas por `safeFileStem`; as
  ligações das fichas só levam coordenadas; não há exportação CSV.
- **Corridas tratadas:** descargas de relevo e recortes do MDT (só o pedido
  mais recente entra; novas tentativas; evento `online`), bacias de visão
  (fatias de 12 ms, cancelamento, chave do trabalho), proposta de bases
  (cancelada quando mudam blocos, bases ou relevo); `tileCache` cai na rede
  quando a Cache API falha; ESLint com `react-hooks` limpo e os quatro
  `exhaustive-deps` desligados com razão.
- **Dicionários:** 770 chaves, todas com PT e EN, marcadores iguais,
  nenhuma repetida; os 646 literais usados no código existem; os 48 códigos
  do preflight e as famílias `fp.error.*`, `co.err.*`, `ci.err.*` e
  `safety.*` cobertas; o PT dos dicionários quase todo pré-AO90.
- **Suite:** ≈1 400 asserções em Node em menos de 25 s e 34 cenários E2E em
  4–6 min; 21 das 38 mutações apanhadas por um teste com valores (limiares
  de bateria, colisão da rota, nomes dos voos, lente do M4T, RTH acima do
  tecto, acções de segurança); o teste do M2-G1 já não é tautológico; o
  validador de conformidade apanha a classe de erros para que foi feito; o
  esquema JSON validado com `ajv` estrito; o E2E mede a folga ao solo contra
  o relevo analítico do fixture (um oráculo independente), cada cenário num
  contexto próprio; o CI com acções fixadas ao SHA, privilégio mínimo e
  auditoria das dependências.
- **Interface:** cartões pela ordem do trabalho, gavetas uma de cada vez
  com foco e Esc por camadas, alvos de 44 px nos botões; preflight com três
  níveis e marcas distintas, exportação travada em todos os modos, acção no
  próprio item quando falta o relevo; muitas mensagens exemplares
  (`battery-block-base`, `block-vlos`, `base-zone-drop`, `terrain-holes`
  com coordenadas, `co.err.corridor-too-long`); nomes dos KMZ pela ordem de
  voo; ficha de campo com coordenadas, ligações, zona, cota, vista e rádio;
  convenções DJI certas (−90° = nadir, sentido das sobreposições, acções de
  segurança com os enums do WPML).

### 4.4 Cinco alterações típicas que hoje passariam sem aviso (agente T)

1. Retirar ou renomear uma chave do dicionário usada só num componente, ou
   acrescentar uma `{variável}` só numa língua.
2. Afrouxar um limiar do preflight (trânsito de `< 0` para `< −10`, folga
   de 15 para 14 m, VLOS com 20 % de folga).
3. Mudar o higienizador de um nome de ficheiro exportado.
4. Esquecer um campo novo do projecto num dos cinco sítios, ou tirar
   `holes`/`terrainFollow`/`anchor`/`gcpConfig` da gravação ou da leitura.
5. Estragar uma definição de CRS, ou aceitar o PR do Dependabot ao `proj4`.

E a sexta, a mais provável: refactorizar o App e desligar em silêncio um
bloqueio do M-A ou a lente térmica (M3-T3).

## 5. Pacotes propostos

- **Pacote R-A — projecto e dados (os 10 que bloqueiam no código e nos
  dados):** C1 (abrir um projecto repõe a sessão inteira e parte das
  omissões), C2 (a edição manual solta a âncora), C3 (células gravadas no
  projecto e no esquema), C5 (validação da geometria do projecto, com
  fast-check), C6 (língua com try/catch), C7 (leitura falhada guardada em
  cópia, sem sobrescrever), C4 (_error boundaries_, try/catch no WebGL,
  pré-carga dos blocos), T1 (EPSG:20790 com `+lon_0=1` e o teste de controlo
  dos CRS), T4 (`PROJECT_KEYS` e o teste de ida e volta com os 25 campos),
  U5 (checklist por projecto). Testes novos para cada um (unitários e E2E
  «projecto-por-cima», «âncora-editada», partes → recarregar, armazenamento
  recusado, bloco sob demanda em falha). Cerca de dois dias.
- **Pacote R-B — preflight, textos e identificadores:** U1 (colisão da
  fachada e cobertura do corredor no preflight), U2 (rótulo da altitude pelo
  modo e intervalo AGL sobre a área), U3 (RTH e subida de descolagem à
  vista), U4 (um só identificador de voo), U6 (bloqueios no cartão 7 e
  ponteiros corrigidos), U8 (`plan-error` traduzido, voo e coordenadas em
  vez de índices, remédios), U12 (cores pelo nível, plurais, pastilha
  neutra), C10 (`export.err.unknown` e `{d}`), C11/U18 (mensagens por
  código PT/EN junto do botão), U21 + T15 + C12a (grafias pré-AO90,
  `-projecto.json` por `safeFileStem`), T5 (testes de fronteira dos
  limiares) e T10 (teste de `baseZoneFor`). Cerca de dois dias.
- **Pacote R-C — desempenho e portão de testes:** C8 (`useT` memorizado e
  `t` fora das dependências), C9 (`NumberInput` com rascunho e limites), T2
  (deploy e release só com o CI verde), T7 (semente fixa, tempos fora do
  portão, job nocturno), T8 (cobertura com o vitest e `src/mission`), T13
  (teste global do dicionário), T14 (E2E: captura em falha, 0 cenários =
  falha, esperas por condição), T3 (funções puras para as pernas de trânsito,
  os enums WPML e as opções do lado por bateria, com os quatro cenários E2E).
  Cerca de dois dias.
- **Pacote R-D — campo, consistência e estrutura:** U7 (bateria e tempo
  útil em todas as divisões; altitude no corredor), U10 (ficha de campo
  completa e para todos os modos), U11 (checklist tirada do plano), U13
  (dicas do painel de métricas e os dois tempos), U14/U15 (glossário:
  conjuntos de baterias, voo/célula/base), U16 (um clique, um ficheiro),
  U17 (`appVersion` e faixa do que mudou), U19 (QA §4/§8 e «Primeiro voo de
  cada modo»), U20 (dica da grelha com minutos), U22 (margem em metros,
  nomes do Pilot 2), U23 (contraste, alvos tácteis, `aria-label`, painel
  recolhível), C12b/c, C13, C14, C15, T6 (resumos dos goldens), T9
  (`planMissionFromProject` partilhada), T11 (matriz e `validateKmz` no
  E2E), T12 (ficheiros reais), T16 (partição do smoke). Três a quatro dias;
  pode partir-se em dois (campo e textos; estrutura e testes).

Cada pacote passa a cadeia completa e o E2E antes de ir para o `main`, como
os das vagas anteriores. Fora de qualquer pacote, por não serem código:
os «por confirmar em voo» (B2, M2, M3, foto sem paragem) continuam a
precisar de um voo e de um registo na matriz de validação.
