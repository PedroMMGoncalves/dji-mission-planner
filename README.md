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
  largura e orientação geram um retângulo perfeito (`turf.transformRotate`).
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
