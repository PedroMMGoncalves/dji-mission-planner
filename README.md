# 🛩️ DJI Mission Planner

Aplicação web de planeamento de missões de mapeamento com drones, otimizada para
importação na app **DJI Pilot 2**. Permite desenhar áreas de levantamento,
calcular grelhas de voo fotogramétricas/LiDAR e exportar **KML** simples ou
**KMZ (WPML)** com a estrutura oficial da DJI.

**Stack:** React + Vite · Tailwind CSS · Leaflet · Turf.js · JSZip

## Funcionalidades

- **Dicionário de hardware expansível** ([src/data/drones.js](src/data/drones.js)):
  Mavic 3 Enterprise, Matrice 4T, Matrice 300 RTK + Zenmuse P1 e um perfil
  Custom/LiDAR (sensor/focal manuais ou FOV do feixe).
- **Painel de parâmetros:** altitude AGL, velocidade, sobreposições frontal e
  lateral, slider de orientação das linhas (0–360°) e expansão exterior da área
  (buffer 0/10/20/30% via `turf.buffer`).
- **Desenho livre de polígonos** com validação topológica (`turf.kinks` deteta
  auto-interseções e assinala-as a vermelho) e vértices editáveis por arrasto.
- **Modo ponto central (âncora):** um clique define o centro; comprimento,
  largura e orientação geram um retângulo perfeito (`turf.transformRotate`),
  com blocos rápidos 250/500/750/1000 m (250×250 ≈ 1 bateria).
- **Base do operador:** marcador do ponto de descolagem (arrastável), com
  distância à área no painel de métricas e incluído no KML exportado.
- **Direções rápidas das linhas:** paralelas, perpendiculares ou oblíquas (45°)
  em relação à orientação do bloco ou à aresta mais longa do polígono; em
  alternativa, espaçamento manual em metros (útil para LiDAR).
- **Mapas base:** Esri Híbrido (satélite + topónimos), Satélite, Topográfico e
  OpenStreetMap. Overlay dos **municípios da CAOP** em vetor (linhas verde+branco,
  nomes visíveis a partir do zoom 9; dados simplificados incluídos na app) e das
  **freguesias** via WMS oficial da DGT.
- **Edição avançada:** arrastar vértices, arrastar pontos intermédios para
  inserir novos vértices e clique direito para remover. Durante o desenho:
  Backspace/clique num vértice anula-o, duplo clique (esquerdo ou direito)
  fecha o polígono, Esc cancela. Formas predefinidas (polígono livre,
  retângulo, quadrado).
- **Grelha de blocos:** no modo ponto central, replicar a forma em N colunas ×
  M linhas (paralelas/perpendiculares à orientação); cada célula torna-se um
  bloco de voo numerado em ordem serpenteante (ex.: 3×2 quadrados de 250 m =
  6 baterias), com exportação de um KMZ por célula.
- **Mosaico automático:** cobrir um polígono desenhado com quadrados de lado
  à escolha (podem exceder os limites); clicar numa célula no mapa
  desativa-a/reativa-a e cada célula ativa é um bloco de voo numerado.
- **GSD alvo ↔ altitude:** editar qualquer um dos dois recalcula o outro, com
  aviso quando a altitude excede os 120 m AGL da categoria Aberta (UE).
- **Checklist de campo UAV** (pré-campo / durante / pós-campo + relatório de
  missão): página própria acessível pelo cabeçalho, imprimível e com
  exportação JSON.
- **Terrain follow (DEM):** relevo Terrarium/AWS (~30 m) descarregado para a
  área; com "Seguir terreno" ativo, as faixas são densificadas e cada waypoint
  recebe a altura que mantém o AGL constante (Douglas-Peucker com tolerância
  configurável; alturas relativas ao ponto de descolagem/base).
- **Dupla grelha (crosshatch):** segunda passagem perpendicular para
  reconstrução 3D, com inclinação do gimbal configurável (−90° nadir a 0°);
  os blocos por bateria são redimensionados para as duas passagens.
- **Planeamento de GCPs:** heurística bordo+centro (literatura fotogramétrica)
  com contagem automática (~1/5 ha, mín. 5) ou manual, alvos numerados no mapa
  e exportação KML própria.
- **Divisão em blocos de voo numerados** (modelo UgCS/DroneDeploy), com a
  grelha globalmente alinhada (faixas colineares entre blocos):
  - *Faixas* — corte da serpentina por área máxima (ha);
  - *Bateria* — **quadrados compactos dimensionados automaticamente** a partir
    da duração da bateria × reserva de regresso (30% por defeito), descontando
    o trânsito à base marcada e limitados por um teto VLOS (500 m por defeito);
  - *Mosaico* — quadrados de lado manual; em ambos os mosaicos as células
    clicam-se no mapa para desativar/reativar (Ctrl+Z desfaz).
  A exportação WPML gera um ZIP com um KMZ independente por bloco
  (`missao-b01.kmz`, …).
- **Grelha de voo em serpentina** cortada rigorosamente dentro da área
  (`turf.lineIntersect` + `turf.booleanPointInPolygon`), com suporte a polígonos
  côncavos.
- **Exportação:**
  - *KML Simples* — polígono 2D da área, para desenhar a missão diretamente no Pilot 2;
  - *WPML Avançado (KMZ)* — `wpmz/template.kml` + `wpml/waylines.wpml` com waypoints
    3D, gimbal a nadir e disparo automático da câmara por distância (`multipleDistance`)
    ou tempo (`multipleTiming`).

## Como calculamos o espaçamento das linhas

1. **Pegada no chão (footprint):** com o modelo pin-hole,
   `largura_no_chão = altitude × largura_sensor / distância_focal`.
   Para LiDAR: `faixa = 2 × altitude × tan(FOV/2)`.
2. **Espaçamento entre faixas:** `espaçamento = pegada_transversal × (1 − sobreposição_lateral/100)`.
3. **Intervalo de disparo:** `intervalo = pegada_longitudinal × (1 − sobreposição_frontal/100)`.

A geração da grelha roda a área por `90° − azimute` em torno do centróide para
que as faixas fiquem horizontais, gera scanlines espaçadas do valor calculado,
interseta-as com o polígono (bufferizado, se aplicável) e devolve tudo ao
referencial original, em ziguezague. Detalhes em [src/utils/geo.js](src/utils/geo.js).

> **Nota (buffer):** a percentagem de expansão refere-se à dimensão
> característica da área (L = √área): com 10 %, cada lado avança 5 % de L para
> fora, ou seja, a largura total cresce ≈10 %.

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm run build    # build de produção em dist/
```

## Deploy no GitHub Pages

1. Criar o repositório `dji-mission-planner` no GitHub (o `base` em
   [vite.config.js](vite.config.js) já assume esse nome).
2. `git init && git add -A && git commit -m "Initial commit" && git branch -M main`
3. `git remote add origin https://github.com/<utilizador>/dji-mission-planner.git && git push -u origin main`
4. No GitHub: **Settings → Pages → Source: GitHub Actions**.
5. O workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) faz build
   e publica automaticamente a cada push no `main`.

## Notas importantes

- **Enums WPML:** os valores `droneEnumValue`/`payloadEnumValue` em
  [src/data/drones.js](src/data/drones.js) seguem a documentação WPML da DJI
  (M3E = 77/66, M4T = 99/89, M300 RTK + P1 = 60/50). Se o Pilot 2 rejeitar a
  importação, confirme os enums para a versão do seu firmware na
  [documentação oficial](https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/overview.html)
  e ajuste-os no dicionário (ou na interface, no perfil Custom).
- **Valide sempre a missão no DJI Pilot 2** (altitudes, velocidade, RTH) antes de voar.
- Os cálculos assumem terreno plano à cota de descolagem (altura relativa ao ponto de partida).
