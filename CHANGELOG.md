# Registo de alterações

Formato: [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/); versões
[SemVer](https://semver.org/lang/pt-BR/). A etiqueta git `vX.Y.Z` é a
versão do `package.json`, e a GitHub Release traz o build estático em zip.

## Por publicar

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

### Manutenção
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
