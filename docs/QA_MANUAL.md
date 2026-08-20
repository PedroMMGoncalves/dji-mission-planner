# Protocolo de QA manual (≈10 min por release)

O smoke test (`node smoke-test.mjs`, corre também no CI) cobre a matemática e
o WPML; **não** cobre a integração de interface. Este protocolo verifica no
browser o que o harness não vê. Correr uma vez por tag de release, contra a
app publicada (<https://pedrommgoncalves.github.io/dji-mission-planner/>),
de preferência num browser sem estado (janela privada) e depois uma segunda
passagem rápida com o estado normal (migração de projetos antigos).

Cada item: **ação → resultado esperado → ☐**. Qualquer desvio: abrir issue
com screenshot e os passos.

## 1. Área em U — rota côncava-segura (~2 min)

- ☐ Desenhar um U (braços verticais largos, base em baixo; ~600×600 m) com a
  ferramenta polígono; direção das linhas a **90°** (E-O).
  **Esperado:** na pré-visualização, nenhuma ligação entre faixas atravessa o
  vão do U — as pernas entre strips seguem pela base.
- ☐ Carregar o atalho **Ótima**.
  **Esperado:** a direção salta para ~0° (N-S), o nº de faixas desce
  (comparar o cartão "Nº de faixas" antes/depois) e a distância total baixa.
- ☐ Voltar a 90° e comparar "Distância total".
  **Esperado:** maior do que na direção ótima.

## 2. Dupla grelha + terrain follow (~2 min)

- ☐ Área retangular ~500×300 m em terreno com relevo; preset
  **Modelo 3D · Dupla grelha**; esperar a descarga automática do relevo;
  ativar **terrain follow**.
  **Esperado:** duas famílias de linhas perpendiculares; cartão GSD passa a
  **"GSD (centro do quadro)"** (gimbal −60°) com valor ~15% pior do que a
  −90°; o resultado do terreno indica waypoints densificados.
- ☐ Abrir o **perfil de elevação**.
  **Esperado:** a linha de voo acompanha o terreno dentro da tolerância; sem
  buracos inesperados.
- ☐ Exportar WPML e abrir o KMZ (unzip) num editor.
  **Esperado:** `waylines.wpml` com `executeHeight` variável por waypoint e
  grupo de `gimbalRotate` a −60.

## 3. Round-trip de KMZ (~1.5 min)

- ☐ Exportar o WPML da missão do item 2; **Importar área** com esse mesmo
  `.kmz`.
  **Esperado:** a área é reconstruída sobre a original (contorno aproximado),
  nome/altitude/velocidade recuperados; sem erro na consola.

## 4. Blocos e bateria por combinação (~1.5 min)

- ☐ M300 RTK + payload **YellowScan Mapper+**; divisão por **bateria**.
  **Esperado:** campo de bateria pré-preenchido com 55 min (defeito do M300);
  editar para 38 → aparece o botão **Defeito**; trocar o payload para P1 →
  o campo volta a 55 (o override ficou só na combinação Mapper+).
- ☐ Ainda com Mapper+: subir a altitude acima de 100 m.
  **Esperado:** aviso vermelho do teto operacional (100 m AGL). O cartão de
  métricas mostra **Densidade LiDAR** em vez de GSD.
- ☐ Checklist (com Mapper+ ativo).
  **Esperado:** grupos **LiDAR** no pré-campo e no durante; com um perfil de
  câmara os grupos desaparecem e as contagens de progresso ajustam.

## 5. Presets e projetos antigos (~1.5 min)

- ☐ Na janela com estado antigo (pré-round-1): abrir a app.
  **Esperado:** o projeto carrega sem erro; o drone selecionado migra para o
  par aeronave+payload equivalente; nenhuma definição perdida.
- ☐ Guardar projeto (JSON), limpar tudo, reabrir o ficheiro.
  **Esperado:** área, hardware, parâmetros, blocos e afinações (FOV de
  trabalho, bateria por combinação) restaurados.

## 6. Modo fachada e órbitas — *pendente da ronda de UI*

Os geradores e o exportador estão prontos e testados pelo harness; os itens
abaixo ativam quando a interface (baseline no mapa, clique de POI) existir:

- ☐ Fachada numa baseline em L: pré-visualização das passagens afastadas ao
  standoff; rumo roda na esquina; aviso "standoff não verificado" sem DSM
  local; com DSM local, aviso de folga quando uma passagem corta a rampa.
- ☐ Órbita multi-nível: círculos ao raio pedido, export em voo curvo
  contínuo, gimbal por nível a apontar ao alvo.

---

Registo de execução:

| Data | Versão/commit | Executor | Resultado | Notas |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
