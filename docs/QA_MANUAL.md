# Protocolo de QA manual (≈12 min por release)

As suites automáticas (`npm test`, correm também no CI) cobrem a matemática, o
WPML e a fronteira de leitura de ficheiros; **não** cobrem a integração de
interface. Este protocolo verifica no browser o que as suites não veem. Correr uma vez por tag de release, contra a
app publicada (<https://pedrommgoncalves.github.io/dji-mission-planner/>),
de preferência num browser sem estado (janela privada) e depois uma segunda
passagem rápida com o estado normal (migração de projectos antigos).

Cada item: **acção → resultado esperado → ☐**. Qualquer desvio: abrir issue
com screenshot e os passos.

## 1. Área em U — rota côncava-segura (~2 min)

- ☐ Desenhar um U (braços verticais largos, base em baixo; ~600×600 m) com a
  ferramenta polígono; direcção das linhas a **90°** (E-O).
  **Esperado:** na pré-visualização, nenhuma ligação entre faixas atravessa o
  vão do U — as pernas entre strips seguem pela base.
- ☐ Carregar o atalho **Óptima**.
  **Esperado:** a direcção salta para ~0° (N-S), o nº de faixas desce
  (comparar o cartão "Nº de faixas" antes/depois) e a distância total baixa.
- ☐ Voltar a 90° e comparar "Distância total".
  **Esperado:** maior do que na direcção óptima.

## 2. Dupla grelha + terrain follow (~2 min)

- ☐ Área retangular ~500×300 m em terreno com relevo; preset
  **Modelo 3D · Dupla grelha**; esperar a descarga automática do relevo;
  activar **terrain follow**.
  **Esperado:** duas famílias de linhas perpendiculares; cartão GSD passa a
  **"GSD (centro do quadro)"** (gimbal −60°) com valor ~15% pior do que a
  −90°; o resultado do terreno indica waypoints densificados.
- ☐ Abrir o **perfil de elevação**.
  **Esperado:** a linha de voo acompanha o terreno dentro da tolerância; sem
  buracos inesperados.
- ☐ Desenhar a área em **U** (com uma concavidade) sobre uma encosta, com a
  dupla grelha e o terrain follow activos, e abrir a **vista 3D**.
  **Esperado:** as ligações entre linhas e entre as duas grelhas — os troços
  rectos que atravessam a concavidade — sobem sobre o relevo tal como as
  linhas; nenhum troço corta uma encosta.
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
  **Esperado:** aviso vermelho do tecto operacional (100 m AGL). O cartão de
  métricas mostra **Densidade LiDAR** em vez de GSD.
- ☐ Checklist (com Mapper+ activo).
  **Esperado:** grupos **LiDAR** no pré-campo e no durante; com um perfil de
  câmara os grupos desaparecem e as contagens de progresso ajustam.

## 5. Presets e projectos antigos (~1.5 min)

- ☐ Na janela com estado antigo (pré-round-1): abrir a app.
  **Esperado:** o projecto carrega sem erro; o drone seleccionado migra para o
  par aeronave+payload equivalente; nenhuma definição perdida.
- ☐ Guardar projecto (JSON), limpar tudo, reabrir o ficheiro.
  **Esperado:** área, hardware, parâmetros, blocos e afinações (FOV de
  trabalho, bateria por combinação) restaurados.

## 6. Modo fachada (~2.5 min)

- ☐ Selector do topo → **Fachada**; Desenhar; clicar um L no mapa (dois
  troços perpendiculares, ~300 m cada); Concluir (ou duplo clique).
  **Esperado:** baseline laranja; linha afastada tracejada ao standoff do
  lado escolhido; traços amarelos de rumo perpendiculares a cada troço,
  a rodarem na esquina; painel com passagens/GSD/tempo.
- ☐ Trocar o **Lado do voo**.
  **Esperado:** a linha afastada salta para o outro lado da baseline e os
  rumos invertem.
- ☐ Baixar o **Afastamento** para 5 m (o mínimo) e ler o painel.
  **Esperado:** passo vertical POSITIVO e aviso âmbar do piso de segurança
  com a faixa por cobrir no pé da face; as alturas das passagens sobem
  sempre, nenhuma abaixo dos 5 m. Repor o afastamento a 25 m faz o aviso
  desaparecer.
- ☐ Sem GeoTIFF local carregado, observar os avisos.
  **Esperado:** aviso âmbar "afastamento NÃO verificado" (os tiles globais
  nunca validam uma face).
- ☐ Importar um GeoTIFF local (modo Área → Terreno) que cubra a face —
  idealmente o DSM sintético de rampa dos testes de campo.
  **Esperado:** o aviso muda para folga verificada (verde) ou para a lista
  vermelha de passagens em conflito; subir o standoff limpa a lista.
- ☐ Exportar WPML e abrir o KMZ.
  **Esperado:** nome `<missao>_face_p1-N.kmz`; `waylines.wpml` com
  `smoothTransition` e um `takePhoto` em cada waypoint.
- ☐ Guardar o projecto, limpar tudo, reabrir.
  **Esperado:** baseline, parâmetros e modo activo restaurados.

## 7. Modo órbita (~2 min)

- ☐ Selector → **Órbita**; Marcar POI; clicar no alvo; raio 60 m, 3 níveis.
  **Esperado:** anel tracejado ao raio, traços de rumo a apontarem ao POI,
  marcador arrastável; painel com níveis × pontos/volta e gimbal por nível
  (mais inclinado nos níveis altos).
- ☐ Ajustar o **GSD alvo à distância**.
  **Esperado:** o raio recalcula-se em conformidade.
- ☐ Exportar missão única; reimportar o KMZ no modo Área.
  **Esperado:** `<missao>_orbit_nN.kmz` com
  `toPointAndPassWithContinuityCurvature` em todos os waypoints; o
  reimport reconstrói um contorno em redor do círculo sem erro.
- ☐ Exportar um KMZ por nível.
  **Esperado:** ZIP com N ficheiros `_b01..bNN`, um nível cada, alturas
  crescentes.

## 8. Modo corredor (~2 min)

- ☐ Selector do topo → **Corredor**; Desenhar; clicar um eixo com uma curva
  larga (3–4 vértices, ~500 m); Concluir (ou duplo clique).
  **Esperado:** eixo desenhado, faixa ilustrativa da largura pedida e as
  passagens paralelas; painel com o número de passagens, waypoints e tempo.
- ☐ Aumentar a **meia-largura** de 60 para 120 m.
  **Esperado:** o número de passagens cresce **uma de cada vez**, nunca aos
  saltos, e a faixa alarga em conformidade.
- ☐ Desenhar um eixo com uma curva APERTADA (raio menor do que a
  meia-largura) e ler o painel.
  **Esperado:** aviso de passagens partidas, com a contagem; nenhuma
  passagem desenha um laço sobre si própria no mapa.
- ☐ Trocar o **Disparo** entre «Por distância» e «Por waypoint».
  **Esperado:** por waypoint, a contagem de waypoints sobe e a de fotos
  iguala-a; por distância, volta aos extremos das passagens.
- ☐ Exportar WPML e abrir o KMZ.
  **Esperado:** `waylines.wpml` analisa, gimbal a −90 em todos os waypoints
  (o corredor é apenas nadir) e nenhum valor não-finito nas coordenadas.
- ☐ Confirmar que **Seguir terreno** e a divisão por bateria não se aplicam.
  **Esperado:** o corredor voa a altitude única — é limitação conhecida,
  não defeito.
- ☐ Guardar o projecto, limpar tudo, reabrir.
  **Esperado:** eixo, meia-largura e modo de disparo restaurados.

## 9. Pontos de inspecção — ordem e persistência (~1.5 min)

- ☐ Modo Área → marcar 4 pontos; renomear dois; arrastar o cartão do 4.º
  para a 2.ª posição; carregar em Sugerir ordem.
  **Esperado:** o arrasto reordena (números do mapa acompanham); a sugestão
  reordena por proximidade a partir da base.
- ☐ Guardar projecto → limpar → reabrir → exportar KMZ.
  **Esperado:** etiquetas e ordem sobrevivem ao ciclo gravar/abrir e a
  ordem do KMZ (`_inspect_nN.kmz`) segue a lista.

## 10. Disparo por waypoint (~1.5 min)

- ☐ Perfil de câmara (M3E); área rectangular ~100 × 60 m, overshoot 10 m;
  **Disparo por: Waypoint**.
  **Esperado:** a opção só existe com câmara (desaparece com o Mapper+); o
  mapa mostra waypoints intermédios em cada faixa, nenhum nos troços de
  overshoot; o cartão **Fotos** passa a contar waypoints com foto (sem o
  valor entre parênteses) e **Waypoints** sobe em conformidade.
- ☐ Exportar WPML e abrir `waylines.wpml`.
  **Esperado:** um `actionGroup` com `takePhoto` por waypoint intermédio
  (`reachPoint`), sem `multipleDistance`/`multipleTiming`; os extremos de
  overshoot não têm grupo de foto.
- ☐ Activar **Seguir terreno** com o disparo por waypoint.
  **Esperado:** erro vermelho na secção de terreno e botão **WPML** desactivado;
  voltar a **Distância** reactiva ambos.
- ☐ Abrir um projecto gravado antes desta versão.
  **Esperado:** carrega em **Distância** (nada muda no plano nem na exportação).

## 11. Verificação em tablet (~1 min)

A app é usada em campo: numa janela a **~768 px de largura** (DevTools ou
tablet real):

- ☐ O selector de modo e os três painéis (Área/Fachada/Órbita) são usáveis
  sem sobreposições; os campos numéricos aceitam toque; as listas fazem
  scroll dentro do painel.
- ☐ No modo inspecção, reordenar com as **setas** (o arrastar HTML5 não
  dispara em ecrã táctil — comportamento esperado).
- ☐ A faixa de resumo do projecto (2+ planos) não tapa os controlos do
  mapa.

---

Registo de execução:

| Data | Versão/commit | Executor | Resultado | Notas |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
