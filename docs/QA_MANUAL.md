# Protocolo de QA manual (≈15 min por release)

As suites automáticas (`npm test`, correm também no CI) cobrem a matemática, o
WPML e a fronteira de leitura de ficheiros; **não** cobrem a integração de
interface. Este protocolo verifica no browser o que as suites não veem. Correr uma vez por tag de release, contra a
app publicada (<https://pedrommgoncalves.github.io/dji-mission-planner/>),
de preferência num browser sem estado (janela privada) e depois uma segunda
passagem rápida com o estado normal (migração de projectos antigos).

Cada item: **acção → resultado esperado → ☐**. Qualquer desvio: abrir issue
com screenshot e os passos.

O painel da área é uma coluna de sete cartões numerados (1 Missão, 2 Área e
relevo, 3 Parâmetros de voo, 4 Divisão em voos, 5 Bases e segurança, 6
Extras, 7 Resumo e exportar); o que não está no cartão está na gaveta dele,
em **Mais opções ›**. Os passos abaixo dizem em que cartão (e se na gaveta).

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
  **Modelo 3D · Dupla grelha** (cartão 1, **Mais opções ›**); esperar a descarga automática do relevo;
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
- ☐ Exportar o KMZ dessa área em U e abri-lo no Pilot 2.
  **Esperado:** vários grupos de disparo (um por troço contíguo de linhas);
  nas ligações longas — através da concavidade e entre as duas grelhas — a
  câmara não dispara. Nas viragens normais continua a disparar.
- ☐ Importar um GeoJSON/KML com **dois polígonos**.
  **Esperado:** usa-se o maior e aparece o aviso âmbar "1 polígono a mais…
  ignorado"; com um MDT local carregado, a nota do terreno diz **"Fonte: MDT
  local <ficheiro>"** (cartão 2) e não Terrarium.
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

- ☐ Modo Área → cartão 6 **Extras** → **Mais opções ›** → marcar 4 pontos; renomear dois; arrastar o cartão do 4.º
  para a 2.ª posição; carregar em Sugerir ordem.
  **Esperado:** o arrasto reordena (números do mapa acompanham); a sugestão
  reordena por proximidade a partir da base.
- ☐ Guardar projecto → limpar → reabrir → exportar KMZ.
  **Esperado:** etiquetas e ordem sobrevivem ao ciclo gravar/abrir e a
  ordem do KMZ (`_inspect_nN.kmz`) segue a lista.

## 10. Disparo por waypoint (~1.5 min)

- ☐ Perfil de câmara (M3E); área rectangular ~100 × 60 m; no cartão 3,
  **Mais opções ›**: overshoot 10 m e **Disparo por: Waypoint**.
  **Esperado:** a opção só existe com câmara (desaparece com o Mapper+); o
  mapa mostra waypoints intermédios em cada faixa, nenhum nos troços de
  overshoot; o cartão **Fotos** passa a contar waypoints com foto (sem o
  valor entre parênteses) e **Waypoints** sobe em conformidade.
- ☐ Exportar WPML e abrir `waylines.wpml`.
  **Esperado:** um `actionGroup` com `takePhoto` por waypoint intermédio
  (`reachPoint`), sem `multipleDistance`/`multipleTiming`; os extremos de
  overshoot não têm grupo de foto.
- ☐ Activar **Seguir terreno** com o disparo por waypoint.
  **Esperado:** erro vermelho no cartão 3, por baixo de **Seguir terreno**, e
  botão **WPML** desactivado;
  voltar a **Distância** reactiva ambos.
- ☐ Abrir um projecto gravado antes desta versão.
  **Esperado:** carrega em **Distância** (nada muda no plano nem na exportação).

## 11. Verificação em tablet (~1 min)

A app é usada em campo: numa janela a **~768 px de largura** (DevTools ou
tablet real):

- ☐ O selector de modo e os cinco painéis (Área/Fachada/Órbita/Corredor/Circular) são usáveis
  sem sobreposições; os campos numéricos aceitam toque; as listas fazem
  scroll dentro do painel.
- ☐ Abrir **Mais opções ›** de um cartão.
  **Esperado:** a gaveta abre ao lado do painel, por cima do mapa, sem sair
  do ecrã; os botões dos cartões têm 44 px de altura; o ✕ e o Escape fecham.
- ☐ No modo inspecção, reordenar com as **setas** (o arrastar HTML5 não
  dispara em ecrã táctil — comportamento esperado).
- ☐ A faixa de resumo do projecto (2+ planos) não tapa os controlos do
  mapa.

## 12. Não há missão sem relevo (~1.5 min)

- ☐ Desenhar uma área nova e concluir.
  **Esperado:** o relevo começa logo a descarregar (sem esperar); a
  pastilha do preflight mostra «A descarregar o relevo» e o KMZ fica
  desactivado até terminar.
- ☐ Com a rede desligada (DevTools → Offline) numa zona nunca vista,
  desenhar uma área.
  **Esperado:** bloqueio «a descarga falhou», com o botão **Descarregar
  relevo global** no próprio item. Voltar a ligar a rede: o relevo chega
  sozinho (nova tentativa) ou com o botão, e o bloqueio desaparece.
- ☐ Importar um MDT da DGT que cubra só a área e desenhar um corredor que
  saia dele.
  **Esperado:** o MDT importado não é substituído; no separador Corredor o
  preflight diz que o MDT importado não cobre a rota e oferece o relevo
  global.

## 13. Várias bases e exportação por base (~3 min + campo)

- ☐ M300 RTK, área de alguns km², divisão por **Bateria**, relevo carregado.
  Marcar **duas bases** (A e B) nos dois extremos e **Propor bases**.
  **Esperado:** cada bloco com uma base; voos numerados A-1, A-2, B-3...;
  na lista, a zona e «voo entre 0 e +X m acima do planeado» de cada base.
- ☐ No cartão 7 **Resumo e exportar**, **Voos da base B (ZIP)**.
  **Esperado:** `<missão>_area[-variantes]_base-B.zip` só com os voos de B,
  pela ordem de voo (`..._B-3.kmz`, `..._B-4.kmz`, com zeros a partir de 10
  voos); **Um voo (KMZ)** com B-3 dá `..._B-3.kmz`; **Todos os voos (ZIP)** e
  o botão do cabeçalho dão `..._voos.zip`. Com um bloqueio no preflight os
  três ficam desactivados.
- ☐ **Bases e blocos (KML)** aberto no Google Earth (ou no telemóvel).
  **Esperado:** pontos «Base A» e «Base B» com a ficha ao clicar, círculos
  das zonas, contornos dos blocos com o rótulo do voo.
- ☐ **Checklist de campo** e **Relatório**, e imprimir.
  **Esperado:** uma ficha por base: coordenadas (6 casas) que abrem nos
  mapas, zona (reduzida e porquê), cota de referência, voos com tempo
  (trânsito incluído) e o nome do KMZ, conjuntos de baterias contra os da
  equipa, alcance visual; cada base inteira numa página.
- ☐ **No campo**, na base B: importar o ZIP da base B no DJI Pilot 2
  (cartão ou cabo).
  **Esperado:** as missões aparecem com o nome do ficheiro (`..._B-3`), pela
  ordem de voo; abrir uma e confirmar a altura do primeiro waypoint contra a
  do plano (relativa à cota da zona de B, «voo entre 0 e +X m acima do
  planeado»); descolar dentro do raio da zona.

## 14. Bacias de visão e rádio — verificação no campo (~2 min + campo)

- ☐ Na missão com bases e blocos, cartão 5 → **Mais opções ›** → **Bacias de
  visão → Mostrar no mapa**.
  **Esperado:** quadrados laranja onde o drone fica atrás do relevo visto do
  ponto da base, amarelos tracejados onde se vê mas a zona de Fresnel do
  rádio não está livre; a percentagem visível em cada bloco; no painel e na
  ficha de campo, por voo, «N % visível — tapado a ~X m da base» e o rádio
  em risco; o relevo usado («relevo global ~30 m», «MDT importado …» ou
  «MDS importado …»). A camada fica ligada ao recarregar neste aparelho.
- ☐ Com MDT, **Vegetação e obstáculos** a 15 m (ex. pinhal entre a base e
  um bloco); depois marcar o ficheiro como **MDS**.
  **Esperado:** com o MDT as zonas laranja crescem e o painel diz «+ 15 m de
  vegetação e obstáculos»; com o MDS o campo fica desligado e nada se soma.
- ☐ **No campo**, de pé no ponto da base (não noutro sítio da zona) e com o
  comando à altura habitual: comparar as zonas laranja de um bloco com o que
  se vê (cristas de cortas, bancadas, escombreiras, árvores). Durante o voo,
  anotar onde o sinal do comando cai ou o vídeo falha e comparar com as
  zonas amarelas e laranja.
  **Esperado:** o que fica atrás do relevo no mapa não se vê; onde o mapa
  diz que se vê mas há árvores ou escombreiras que o MDT não tem, a vista e
  o rádio são piores do que o mapa (corrigir com a vegetação ou o MDS da
  equipa, e registar a diferença nas notas).

## 15. Cartões, gavetas e acções de segurança (~2 min)

- ☐ Modo Área: percorrer os sete cartões e abrir a gaveta de cada um.
  **Esperado:** só uma gaveta aberta de cada vez; o foco entra na gaveta e
  volta a **Mais opções ›** ao fechar (✕ ou Escape); um valor mudado numa
  gaveta fica depois de a fechar e reabrir.
- ☐ Cartão 5: **No fim da missão: Aterrar no local**; **Perda de sinal:
  Interromper a missão** com **Pairar**. Exportar o KMZ.
  **Esperado:** em `waylines.wpml` e `template.kml`,
  `<wpml:finishAction>autoLand`, `<wpml:exitOnRCLost>executeLostAction` e
  `<wpml:executeRCLostAction>hover`; com **Continuar a missão até ao fim** a
  acção ao interromper fica desligada e o KMZ leva `goContinue`.
- ☐ Mudar para Corredor, Circular, Fachada e Órbita.
  **Esperado:** o cartão **Acções de segurança** com a mesma escolha; o KMZ
  de cada modo leva-a.
- ☐ **Checklist de campo**; guardar e reabrir o projecto; abrir um projecto
  anterior.
  **Esperado:** a checklist diz as acções escritas no KMZ; o projecto
  guarda-as; um projecto anterior abre com **Regressar à base (RTH)** e
  **Interromper a missão → Regressar à base (RTH)**.
- ☐ **No campo**, abrir a rota no DJI Pilot 2.
  **Esperado:** a acção de fim e a de perda de sinal da rota são as do
  planeador.

---

Registo de execução:

| Data | Versão/commit | Executor | Resultado | Notas |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
