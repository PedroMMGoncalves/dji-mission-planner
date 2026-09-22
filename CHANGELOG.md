# Registo de alterações

Formato: [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/); versões
[SemVer](https://semver.org/lang/pt-BR/). A etiqueta git `vX.Y.Z` é a
versão do `package.json`, e a GitHub Release traz o build estático em zip.

## Por publicar

### Corrigido (exportação)

- **O comando passa a saber o comprimento e a duração da rota.** No primeiro
  voo real (M3E, Setembro de 2026) o Pilot 2 mostrou a rota a 100 % e
  «00:00» em falta com a missão na foto 114 de 139. O Pilot 2 tira o
  progresso e o tempo em falta de `wpml:distance` e `wpml:duration`, no
  `Folder` do `waylines.wpml`, e a exportação não escrevia nenhum dos dois.
  Os 81 KMZ escritos pelo comando trazem-nos entre `waylineId` e
  `autoFlightSpeed`, e o `template.kml` nunca; é aí que passam a sair.

  A distância é o comprimento 3D da rota, a mesma função que já reproduzia o
  `wpml:distance` do comando com desvio mediano de 0,00 %. A duração é a que
  o painel mostra para cada modo: na área, a rota com o custo das inversões,
  sobre os waypoints 3D quando há seguimento de terreno; na fachada, no
  corredor e na órbita, a do respectivo plano. Na divisão em blocos cada
  bloco leva a sua, sem o trânsito até à base, que o Pilot 2 não conta na
  rota. Onde não há previsão (pontos de inspecção, níveis de órbita
  exportados um a um) sai distância / velocidade, que fica por baixo mas
  nunca é zero. Uma `durationS` não finita ou negativa é recusada na
  fronteira. Os sete ficheiros de referência ganham as duas linhas e nada
  mais.

### Alterado (paragem nos waypoints)

- **As grelhas deixam de parar em cada foto e em cada vértice do terreno.**
  O modo de viragem que a exportação escrevia em todos os waypoints das
  grelhas (`toPointAndStopWithDiscontinuityCurvature`) pára no ponto, como a
  DJI documenta, e no primeiro voo real o M3E parava em cada foto da foto por
  waypoint. O mesmo acontecia, sem aviso, em cada vértice do seguimento de
  terreno e em cada dobra do corredor, mesmo com disparo por distância.

  Novo parâmetro **«Paragem nos waypoints»** na área e no corredor:
  **Só nos cantos** (por omissão) pára no fim de cada faixa e passa sem
  parar pelos pontos intermédios; **Em todos** repõe a paragem em cada
  ponto, para pouca luz ou exposições longas. Nos pontos de passagem sai o
  modo que o Pilot 2 chama «Turns before waypoint. Flies through»
  (`toPointAndPassWithContinuityCurvature` com `useStraightLine` 1), com
  amortecimento de 1 m, reduzido para caber nos troços curtos; abaixo de
  0,2 m o ponto pára. Projectos anteriores abrem em «Só nos cantos».

  Com «Em todos», o tempo previsto, a duração enviada ao comando, o corte
  da serpentina e o lado dos quadrados por bateria contam cada paragem como
  meia inversão — um valor **deduzido** da calibração das inversões, a
  trocar pelo medido no registo de voo. Um aviso de preflight lembra que
  ainda nenhum voo provou que o Pilot 2 dispara a foto ao passar pelo ponto
  sem parar.

### Corrigido (protocolo de validação)

- **As missões de referência voltam a provar o que dizem provar.** A secção 2
  do `docs/VALIDACAO.md` afirma que «o diff do `esperado.json` é a prova de
  qualquer mudança no motor». Não era: a R2 declarava `terrainFollow` e não
  trazia modelo de terreno nenhum, por isso o seguimento nunca corria e os
  onze campos do instantâneo saíam todos do plano em planta. Uma alteração
  às alturas exportadas — como a do corredor de segurança, nesta mesma
  versão — passava-lhe ao lado sem mover um dígito.

  As missões passam a ter um relevo sintético determinista (rampa,
  cordilheira estreita e ondulação), e o instantâneo ganha seis campos do
  seguimento de terreno: número de waypoints, altura relativa mínima e
  máxima, folga mínima, subida máxima vista no corredor e pontos travados
  pelo tecto. Na R2 o tecto trava em 48 pontos, o que põe o caminho do
  recorte aos 120 m dentro da prova.

- **O instantâneo deixa de poder ficar para trás em silêncio.** Nada obrigava
  a correr `tools/missoes-referencia.mjs` depois de mexer no motor, e um
  instantâneo desactualizado é pior do que nenhum: passa a afirmar que o
  motor não mudou quando mudou. A suite passa a regenerá-lo em memória e a
  compará-lo com o ficheiro em disco, e falha com o diff à vista quando os
  dois divergem. O gerador foi separado em funções puras (`esperadoDe`,
  `esperadoDeTodas`) e só escreve ficheiros quando corrido como script.

### Alterado

- **Seguimento de terreno passa a olhar para os lados da faixa.** O perfil era
  construído só com o relevo debaixo do eixo; numa encosta atravessada, o que
  ameaça a aeronave está ao lado e mais alto, e o eixo não o vê. Passa a
  amostrar-se um corredor de **±30 m** e a usar-se o ponto mais alto para
  calcular a altura de cada waypoint. Medido nos modelos de terreno que os
  próprios KMZ do DJI Pilot 2 trazem (ASTER GDEM V3, ~23 m), em 40 missões
  reais: a 30 m do eixo existe terreno que o eixo não vê, com mediana de 1 a
  11 m e máximos de 8 a 68 m conforme a missão. No pior caso encontrado
  (FB09, planeada a 120 m) havia terreno **70 m mais alto a 50 m do eixo** — a
  folga real nesse ponto era de 50 m, não os 120 m do plano.

  A subida está limitada ao tecto de **120 m acima do solo** da categoria
  aberta (Regulamento (UE) 2019/947, UAS.OPEN.010). Onde manter a folga pedida
  exigiria passar disso, a rota fica no tecto, a folga desce abaixo da pedida
  e sai aviso a dizer quanto e em quantos pontos — subir mais seria ilegal.
  `corridorM: 0` reproduz o comportamento anterior.

  Isto muda as alturas exportadas das missões com seguimento de terreno em
  terreno de encosta. Em terreno plano, e onde a encosta corre ao longo da
  faixa em vez de a atravessar, nada muda. Os ficheiros de referência não
  mexeram, e o `esperado.json` também não: o instantâneo das missões de
  referência guarda a previsão do plano em planta, não as alturas do
  seguimento de terreno — ou seja, não cobre esta classe de alteração.

### Corrigido

- **Intervalo de disparo arredondado por defeito, nunca por excesso.** O
  `wpml:actionTriggerParam` vai no ficheiro com uma casa decimal, e
  arredondá-lo ao mais próximo deixava-o passar para cima em metade dos
  casos — um intervalo maior do que o planeado entrega menos sobreposição
  frontal do que o operador pediu, sem aviso. Medido sobre 11 025
  combinações de payload, altura, sobreposição e velocidade: até **3,34
  pontos percentuais** a menos em disparo por tempo (térmica do M4T a 40 m
  e 14,5 m/s; 1,67 pp na grande-angular do M3E), dois terços da tolerância
  de aceitação de ±5 pontos. Em disparo por distância o pior caso era 0,20
  pp. Agora dispara-se no máximo um passo mais cedo, que é o lado que sobra
  cobertura em vez de faltar. A geometria da rota não muda.

### Corrigido (KML da área, mover a área, 3D)

- **KML da área recusado pelo DJI Pilot 2.** O ficheiro dito «simples» levava,
  além do polígono, o ponto de base, um `Placemark` por GCP e uma pasta com uma
  `LineString` por faixa — dezenas a centenas de geometrias. O parser do
  Pilot 2 quer um polígono e mais nada. Passa a sair o ficheiro mínimo: um
  `Document`, um `Placemark`, um `Polygon` fechado, `clampToGround`, sem
  estilos nem pastas. É esse o caso de uso — exportar a área e fazer as
  configurações no comando. Os GCPs continuam a ter exportação própria, e o
  KML anotado para SIG continua disponível no construtor.
- **Mover a área inteira** deixou de depender da origem da área. A pega
  central só existia quando a área vinha da âncora; numa área desenhada à mão
  ou importada de ficheiro não havia nenhuma, e com a divisão em mosaico ou por
  bateria ligada a edição de vértices está desligada de propósito — que é
  justamente quando faz falta arrastar o conjunto todo para o lado. Agora há
  sempre pega no modo de área: arrasta anel, buracos e células, preserva a
  forma e mantém a selecção de células desactivadas, e o Ctrl+Z desfaz o
  movimento.
- **Visualizador 3D com buracos no relevo.** Os vértices sem dado de elevação
  herdavam a última cota válida, que na ordem de varrimento da malha é o
  vizinho da esquerda: saíam bandas horizontais e degraus artificiais, e um
  buraco na primeira linha punha o terreno a começar no nível do mar. Passam a
  ser preenchidos por difusão a partir dos vizinhos válidos. O Terrarium
  tolera até 20 % de tiles em falta e um MDT local pode não cobrir a bbox
  toda, pelo que isto aparecia e desaparecia consoante a área.
- **Contorno, base e GCPs no 3D** liam a elevação directamente da fonte e
  caíam em 0 m onde não houvesse dados — o contorno mergulhava centenas de
  metros abaixo do relevo e o alvo da câmara ia para o nível do mar. Passam a
  ler, por interpolação bilinear, a mesma grelha que é desenhada: o que se vê
  assenta exactamente na malha.

## 1.2.0 — 2026-09-04

### Corrigido

- **Comprimento da rota com seguimento de terreno**: o motor somava só a
  projecção horizontal, enquanto o `wpml:distance` do Pilot 2 é o
  comprimento 3D. Em terreno acidentado a rota saía curta até 1,8 %, e o
  erro era sempre optimista — menos rota, menos tempo, menos baterias. A
  geometria exportada não muda.
- **Custo de viragem** proporcional à velocidade (`v/1,7`, travar e voltar
  a acelerar) em vez dos 3 s fixos, que só estavam certos perto dos 5 m/s.
  Ajustado ao `wpml:duration` de 72 missões nadir reais do Pilot 2: erro
  RMS de 1,9 % contra 5,2 %. Alinha-nos com a **previsão** do Pilot 2, não
  com voo medido.
- `TURN_TIME_S` deixa de existir em duplicado (havia uma cópia local em
  `corridor.js`) e a contagem de inversões fica em n−1 nos dois motores: a
  área contava n.
- **Enums WPML do M300**, corrigidos pelo que o comando real escreve:
  payloads PSDK de terceiros passam de `65534` a `65535`, e a Zenmuse P1 de
  `50/0` a `50/1`.
- **Ensaio a seco** deixa de esgotar a memória: a perna LiDAR gerava 67
  milhões de pontos sintéticos (~1,3 GB de LAS) sobre a área inteira de L1.
  Passa a correr sobre uma cópia com a área reduzida, com a mesma densidade
  prevista e um limite explícito de 4 milhões de pontos. O registo de voo
  sintético passa a incluir as paragens nos topos de faixa que o modelo de
  tempo cobra.
- `.gitattributes` com `text=auto eol=lf`: um clone em Windows com
  `core.autocrlf=true` punha quase todo o repositório fora do Prettier.

### Alterado

- Perfil **M4T** com as ópticas reais, confirmadas contra o EXIF de fotografias originais da aeronave: grande-angular 1/1.3" (9,7 × 7,3 mm, focal real 6,72 mm, 4032 × 3024 no modo 12 MP que a aeronave escreve por omissão) em vez dos valores provisórios da classe M3E. A pegada e o GSD do M4T passam a ser fiáveis (≈3,6 cm/px a 100 m; metade em 48 MP, via sensor custom com 8064 px).

### Adicionado

- Payload **térmico do M4T** (`M4T_THERMAL`): VOx 640 × 512, 12 µm (7,68 × 6,14 mm), focal 12 mm (EXIF; 52 mm eq., DFOV 44,5°), GSD calculado sobre o detector físico (≈10 cm/px a 100 m) e não sobre o R-JPEG 1280 × 1024 de super-resolução. O M4T passa a mostrar o selector de payload; projectos antigos continuam a carregar com a grande-angular.
- Ferramenta planeado-vs-medido: nas aeronaves que escrevem um ficheiro por lente (M4T: `_V` e `_T` com as mesmas coordenadas e instante), fica só com a câmara do payload planeado, pelo `ImageSource` do XMP, e indica quantas fotos da outra pôs de parte. O CSV do exiftool passa a incluir `-ImageSource`.

## 1.1.0 — 2026-09-02

Primeira versão depois da 1.0.1: preflight único, esquema do ficheiro de
projecto, datums verticais, cache do relevo, buracos e MultiPolygon na
importação, incerteza propagada, ferramenta planeado-vs-medido, métodos e
protocolo de validação. Sem alterações incompatíveis: o ficheiro de
projecto continua na versão 2 (campos novos opcionais: `holes`,
`drone.rtk`, `$schema`).

### Fiabilidade
- Suite E2E (`npm run test:e2e`) em Chromium headless sobre a build de
  produção: importa polígono e MDT sintéticos pela interface, liga dupla
  grelha, terrain follow e blocos por bateria, exporta e mede o KMZ (folga ao
  solo em toda a rota, grupos de disparo, um KMZ por bloco, aviso de
  polígonos ignorados). Corre no CI a seguir às verificações.
- Escritor de GeoTIFF sintético partilhado entre o teste de E/S e o E2E
  (`tests/lib/geotiff.mjs`).
- Testes por propriedades (Vitest + fast-check, `npm run test:unit`) sobre os
  invariantes do corredor, do terrain follow, dos intervalos de disparo, da
  fronteira de exportação e da grelha de área, com entradas aleatórias.
- Limiares de cobertura (c8) sobre `src/utils/` no CI: 92 % linhas, 90 %
  funções, 82 % ramos — só podem subir.

### Preflight
- Verificação única antes de exportar (`src/mission/preflight.js`, pastilha
  no cabeçalho): bloqueios que desactivam o KMZ — sem plano ou plano com
  erro, seguir terreno com foto por waypoint, seguir terreno ligado sem
  relevo a cobrir a área (antes saía um KMZ com alturas planas, sem aviso),
  falha do cálculo do terreno, mais de 65535 waypoints numa rota —, avisos
  (rota acima de 2000 waypoints, tecto AGL do payload, obturador, tempo
  acima do útil de uma bateria, por missão ou por bloco) e lembretes (sem
  ponto de base; alturas relativas ao ponto de descolagem). Cobre os quatro
  modos; oito testes unitários e um cenário E2E (42 asserções E2E no total).

### Importação de áreas
- Buracos (anéis interiores) preservados: entram no polígono do plano, as
  faixas partem-se à volta deles, nenhum GCP cai dentro, o KML exporta-os e
  o mapa desenha-os; não são editáveis. Um polígono com buracos avisa.
- MultiPolygon preservado: todas as partes são lidas com os seus buracos e
  o aviso passa a oferecer "usar todas as partes como células" (a maior é o
  contorno; um KMZ por parte). Antes só o maior era usado.
- Detecção de CRS conservadora: além da magnitude, uma extensão acima de
  2° em qualquer eixo marca as coordenadas como projectadas — um polígono
  em metros locais (0–5000) passava por WGS84 e caía no golfo da Guiné. O
  membro `crs` do GeoJSON é aplicado quando declara um EPSG da lista e
  serve de pista quando declara outro.

### Incerteza e verificações
- Incerteza propagada (ponto 9 do plano): GSD, pegada e sobreposições
  apresentados como intervalos [pior, melhor] a partir do erro de
  posicionamento da aeronave (GNSS ou RTK, caixa nova no painel do drone,
  guardada no projecto) e do relevo dentro da área (ou da tolerância do
  seguimento). O painel de métricas mostra o GSD com o intervalo e a
  sobreposição real no pior caso; o preflight avisa abaixo de 60/50 %.
- Arrastamento por movimento a 1/1000 e 1/500 s, em cm e em píxeis; aviso
  acima de 1 px a 1/500 s.
- Verificação da rota exportada segmento a segmento: waypoints repetidos
  bloqueiam; taxa de subida acima da aeronave e segmentos acima de 5 km
  avisam.
- Relatório com bloco de reprodutibilidade: versão da aplicação, SHA-256
  do ficheiro de projecto, posicionamento e intervalos, arrastamento,
  datum do relevo e resultado do preflight.

### Terreno
- Cache persistente dos tiles de relevo (Cache API): as áreas já vistas
  carregam sem rede, o painel indica quantos tiles vieram da cache e, sem
  ligação, a mensagem de erro diz que só essas áreas estão disponíveis.
  Sem Cache API ou com a quota cheia, o fetch simples serve na mesma.
- Datum vertical declarado por fonte: o Terrarium como ortométrico EGM96
  assumido; um MDT local pelas GeoKeys verticais (EGM96, EGM2008, MSL,
  Cascais, EVRF; unidade em metros, pés ou pés US, convertida na leitura —
  um MDT em pés lia-se como metros). Um GeoTIFF geográfico 3D (EPSG:4979/
  4937) fica marcado como alturas elipsoidais, com aviso no painel e no
  preflight. `docs/METODOS.md` §12 descreve o que cancela e o que não.

### Documentação
- `docs/METODOS.md`: métodos do planeador — fórmulas tal como estão
  implementadas, constantes e tolerâncias, hipóteses, datums verticais tal
  como são tratados, o que não é modelado, calibração prevista e
  referências. Dezassete secções, uma por módulo do motor.

### Validação de campo
- Protocolo de validação (`docs/VALIDACAO.md`): quatro missões de
  referência com ficheiro de projecto e previsão do planeador
  (`docs/validacao/missoes/`, `tools/missoes-referencia.mjs`),
  procedimento por missão, critérios de aceitação por grandeza
  (`tools/lib/criterios.mjs`), matriz de compatibilidade Pilot 2 /
  firmware e round-trip semântico. `tools/relatorio-validacao.mjs` avalia
  os resultados e escreve o relatório; `tools/ensaio-seco.mjs` prova a
  cadeia com voos sintéticos (`docs/validacao/ensaio-seco.md`). Os
  resultados reais ficam para Setembro.
- Ferramenta planeado-vs-medido (`tools/planeado-vs-medido.mjs`): a partir
  do ficheiro de projecto e das fotos (EXIF/XMP ou CSV do exiftool), da
  nuvem LAS (com o CRS do ficheiro) e do registo de voo, mede altura AGL,
  GSD, intervalo e sobreposição frontal, espaçamento e sobreposição lateral
  (faixas detectadas pelo rumo dos passos), fotos dentro da área, duração,
  densidade de pontos global e mínima por célula, velocidade e distância à
  base, e escreve o relatório planeado / medido / desvio em Markdown e JSON.
  Leitor de LAS 1.2–1.4 sem dependências; seis testes com voos sintéticos
  gerados do próprio plano (um igual ao plano, outro desviado).

### Manutenção
- Prettier como formatador único (`npm run format`, `format:check` no CI),
  com uma passagem única de formatação sem alteração de comportamento;
  `CONTRIBUTING.md` com o ciclo de desenvolvimento, as camadas de teste,
  as convenções e o processo de release.
- A release passa a publicar, além do zip da build, o SBOM CycloneDX das
  dependências de produção (gerado pelo npm a partir do lockfile) e uma
  atestação de proveniência SLSA dos dois ficheiros, verificável com
  `gh attestation verify`.
- Primeiro corte do motor fora do `App.jsx`: o reagrupamento por blocos do
  terrain follow (`src/mission/terrainFollow.js`) e a montagem da exportação
  de área — nome com variantes, intervalos de disparo, marcador do gimbal
  nadir, blocos (`src/mission/areaExport.js`) — passam a funções puras com
  testes próprios. Comportamento inalterado (goldens e E2E verdes).
- Segundo corte: os parâmetros de exportação da fachada, da órbita, do
  corredor e dos pontos de inspecção (`src/mission/exportParams.js`), testados
  a partir de planos reais contra a fronteira de validação.
- Terceiro corte: a divisão em blocos (`src/mission/blocks.js`) e o ficheiro
  de projecto — serialização, leitura e migração v1 → v2
  (`src/mission/project.js`) — com testes de ida e volta e de lixo.
- Quarto corte: o plano de área com células alinhadas
  (`src/mission/areaPlan.js`).
- Hooks por modo em `src/hooks/`: `useCorridorMission`, `useOrbitMission`,
  `useFaceMission`, `useInspection`, `useTerrain` e, para a área,
  `useAreaGeometry` (anel, âncora, grelha, mosaico, histórico Ctrl+Z,
  importação de ficheiros) e `useAreaMission` (plano, blocos, GCPs, alturas
  do terrain follow, exportações) — estado, planos, pré-visualizações,
  desenho no mapa e exportação de cada modo, fora do `App.jsx`, que passou
  de 2219 para 1023 linhas e ficou como raiz de composição (hardware,
  parâmetros de voo, resumo e layout). A persistência do projecto (autosave
  com debounce, hidratação no arranque, guardar e abrir ficheiro) está em
  `useProject`; o App só distribui o projecto normalizado pelo estado.
- Cenário E2E do projecto: autosave em localStorage, recarregar a página,
  guardar em ficheiro e abrir com o estado limpo (36 asserções E2E no total).
- Esquema JSON (draft 2020-12) do ficheiro de projecto v2, publicado com a
  aplicação em `schema/project-v2.schema.json` e referenciado pelo campo
  `$schema` de cada ficheiro guardado. Os testes validam contra ele o estado
  por omissão, cada preset e um projecto completo, e recusam lixo; o E2E
  valida o ficheiro que a aplicação realmente escreve. Os valores por
  omissão do estado guardado passam a viver em `src/mission/defaults.js`.
- Verificação de tipos sem TypeScript no código: `npm run typecheck` corre
  `tsc --checkJs` sobre os tipos JSDoc de `src/utils/`, `src/mission/`,
  `src/data/` e `src/hooks/` (sem emitir ficheiros) e faz parte do CI. Os
  tipos das polilinhas marcadas do corredor, dos blocos e das opções de
  agregação ficaram explicitos.
- E2E com o corredor, a fachada e a órbita desenhados no mapa por cliques,
  como o operador faz.

## 1.0.1 — 2026-09-01

Sem alterações funcionais. Primeira versão arquivada no Zenodo.

- Metadados de citação: `.zenodo.json`, `CITATION.cff` e os campos
  `description`, `license`, `author`, `repository` e `homepage` do
  `package.json`.
- Workflow de release: publica a partir do push a `main` quando a etiqueta
  da versão ainda não existe; aceita também etiqueta ou disparo manual.

## 1.0.0 — 2026-09-01

Primeira versão estável. Aplicação 100% no browser, sem servidor nem chaves,
publicada em https://pedrommgoncalves.github.io/dji-mission-planner/.

### Modos de missão
- **Área**: grelha fotogramétrica ou LiDAR por sobreposição/espaçamento,
  polígonos côncavos, dupla grelha (crosshatch) com passagem nadir extra,
  fiada de amarração, overshoot, rectângulo por ponto central, buffer.
- **Corredor**: passagens paralelas a um eixo (estradas, condutas, linhas de
  água, linhas eléctricas) com juntas redondas e critério geométrico
  anti-dobra; recusa explícita em vez de cobertura silenciosamente menor.
- **Fachada**: passagens horizontais empilhadas a distância constante, rumo
  fixo, folga verificada contra MDT local.
- **Órbita**: níveis múltiplos em torno de um ponto, voo curvo contínuo.
- **Pontos de inspecção**: rumo e pitch por ponto, ordenação.

### Terreno
- MDT global (Terrarium, ~30 m) descarregado automaticamente; MDT LiDAR da
  DGT (GeoTIFF, multi-GB) lido por janela.
- Terrain follow por densificação + Douglas-Peucker vertical, nas linhas de
  voo **e nas ligações entre elas**; vista 3D e perfil de elevação;
  sugestões de orientação e gimbal em encostas.

### Planeamento e exportação
- Perfis de aeronave e payload (câmara e LiDAR, com densidade de pontos),
  GSD, footprint, aviso de obturador, tempo e baterias.
- Divisão em blocos por faixas, bateria ou mosaico; resumo do projecto.
- GCPs, relatório de missão, checklist de campo, projectos com autosave,
  PT/EN.
- Importação de KML, GeoJSON, Shapefile e KMZ WPML (com escolha de CRS);
  exportação KML simples e DJI WPML (KMZ) para o Pilot 2, um KMZ por bloco.
- Disparo por distância ou tempo suspenso nas ligações longas; disparo por
  waypoint em alternativa.

### Fiabilidade
- 625 asserções em duas suites (lógica pura e fronteira de ficheiros),
  ficheiros de referência para os cinco tipos de missão, validação de
  tipos e intervalos na fronteira de exportação, XML bem formado garantido.
- Três rondas de auditoria adversarial com refutação independente; todos os
  defeitos confirmados corrigidos e reproduzidos antes/depois (ver
  `docs/revisao-relatorio.md`).
- CI (lint, testes, build, orçamento de bundle, auditoria de dependências),
  CodeQL, Dependabot, acções fixadas ao SHA, deploy bloqueado por falha.

### Validação pendente
- A matriz drone/payload/firmware/Pilot 2 e o comportamento em voo dos KMZ
  (incluindo os grupos de disparo por intervalo e as ligações com terrain
  follow) ficam para ensaio em hardware — ver `docs/QA_MANUAL.md`.
