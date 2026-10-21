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

- ☐ Desenhar um U (braços verticais largos, base em baixo; ~600×600 m) com
  **Polígono**, na barra sobre o mapa; direcção das linhas a **90°** (E-O).
  **Esperado:** na pré-visualização, nenhuma ligação entre faixas atravessa o
  vão do U — as pernas entre strips seguem pela base.
- ☐ Carregar o atalho **Óptima**.
  **Esperado:** a direcção salta para ~0° (N-S), o nº de faixas desce
  (comparar «Faixas» nas métricas antes/depois) e a distância total baixa.
- ☐ Voltar a 90° e comparar "Distância total".
  **Esperado:** maior do que na direcção óptima.

## 2. Dupla grelha + terrain follow (~2 min)

- ☐ Área retangular ~500×300 m em terreno com relevo; preset
  **Modelo 3D · Dupla grelha** (cartão 1, **Mais opções ›**); esperar a descarga automática do relevo;
  activar **terrain follow**.
  **Esperado:** duas famílias de linhas perpendiculares; o GSD das métricas passa a
  **"GSD (centro da imagem)"** (gimbal −60°) com valor ~15% pior do que a
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

- ☐ M300 RTK + payload **YellowScan Mapper+**; cartão 4 (Divisão), em qualquer
  divisão. **Esperado:** «Tipo de bateria» na TB60 com 25 min úteis e
  «Tempo útil por voo» a 25 (os valores da Configuração para o M300); mudar
  para a TB65 dá 28 min; escrever 20 no tempo útil mostra «Repor (28)»; o
  cartão de métricas e o preflight passam a comparar com 20 min.
- ☐ Trocar o payload para P1. **Esperado:** o tempo útil continua o da
  bateria escolhida (a bateria é da aeronave, não do payload); o acerto à mão
  fica no projecto.
- ☐ Ainda com Mapper+: subir a altitude acima de 100 m.
  **Esperado:** aviso âmbar do tecto operacional (100 m AGL) no cartão 3 e no
  preflight. O cartão de métricas mostra **Densidade LiDAR** em vez de GSD.
- ☐ Divisão «Bateria» com prolongamento 30 m, faixa transversal de amarração e margem 10 %.
  **Esperado:** quadrados mais pequenos do que sem esses extras; cada bloco
  cabe no tempo útil (cartão 7, «Voo mais longo / tempo útil» sem vermelho).
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

## 6. Modo face (~2.5 min)

- ☐ Selector do topo → **Face**; Desenhar; clicar um L no mapa (dois
  troços perpendiculares, ~300 m cada); Concluir (ou duplo clique).
  **Esperado:** baseline laranja; linha afastada tracejada ao standoff do
  lado escolhido; traços amarelos de rumo perpendiculares a cada troço,
  a rodarem na esquina; painel com passagens/GSD/tempo.
- ☐ Trocar o **Lado do voo**.
  **Esperado:** a linha afastada salta para o outro lado da baseline e os
  rumos invertem.
- ☐ Baixar o **Afastamento** para 5 m (o mínimo) e ler o painel.
  **Esperado:** passo vertical POSITIVO e aviso âmbar da altura mínima de segurança
  com a faixa por cobrir no pé da face; as alturas das passagens sobem
  sempre, nenhuma abaixo dos 5 m. Repor o afastamento a 25 m faz o aviso
  desaparecer.
- ☐ Sem GeoTIFF local carregado, observar os avisos.
  **Esperado:** aviso âmbar "afastamento NÃO verificado" (os tiles globais
  nunca validam uma face).
- ☐ Importar um GeoTIFF local (separador Área, cartão 2 «Área e relevo») que cubra a face —
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
- ☐ Ajustar o **GSD pretendido no alvo**.
  **Esperado:** o raio recalcula-se em conformidade.
- ☐ **Exportar WPML Avançado (KMZ)** (a missão única); reimportar o KMZ no
  modo Área.
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
  passagens paralelas; painel com o número de passagens, waypoints e tempo, e
  a linha «Altura … · sobreposição …/… % (do separador Área, cartão 3)».
- ☐ Aumentar a **meia-largura** de 60 para 120 m.
  **Esperado:** o número de passagens cresce **uma de cada vez**, nunca aos
  saltos, e a faixa alarga em conformidade.
- ☐ Desenhar um eixo com uma curva APERTADA (raio menor do que a
  meia-largura) e ler o painel e o preflight.
  **Esperado:** aviso de passagens sem cobertura, com a contagem, no painel e
  na lista do preflight; nenhuma passagem desenha um laço sobre si própria.
- ☐ Trocar o **Disparo** entre «Por distância» e «Por waypoint».
  **Esperado:** por waypoint, a contagem de waypoints sobe e a de fotos
  iguala-a; por distância, volta aos extremos das passagens.
- ☐ Ligar **Seguir terreno** (cartão Relevo e Base) sobre relevo carregado.
  **Esperado:** as alturas de cada waypoint seguem o relevo (painel «waypoints
  com altura própria»), o KMZ sai com `-tf` no nome e a folga ao solo mantém-se
  em toda a rota; sem relevo a cobrir o eixo o preflight bloqueia.
- ☐ Exportar WPML e abrir o KMZ.
  **Esperado:** `waylines.wpml` analisa, gimbal a −90 em todos os waypoints
  (o corredor é apenas nadir) e nenhum valor não-finito nas coordenadas.
- ☐ Confirmar que a divisão por bateria não se aplica ao corredor.
  **Esperado:** o corredor é um só voo; o preflight avisa quando passa o
  tempo útil (com o trânsito da base, se marcada).
- ☐ Guardar o projecto, limpar tudo, reabrir.
  **Esperado:** eixo, meia-largura, modo de disparo e seguir terreno
  restaurados.

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
  **Mais opções ›**: prolongamento 10 m e **Disparo por: Waypoint**.
  **Esperado:** a opção só existe com câmara (desaparece com o Mapper+); o
  mapa mostra waypoints intermédios em cada faixa, nenhum nos troços de
  overshoot; o cartão **Fotos** passa a contar waypoints com foto (sem o
  valor entre parênteses) e **Waypoints** sobe em conformidade.
- ☐ Exportar WPML e abrir `waylines.wpml`.
  **Esperado:** um `actionGroup` com `takePhoto` por waypoint intermédio
  (`reachPoint`), sem `multipleDistance`/`multipleTiming`; os extremos de
  overshoot não têm grupo de foto.
- ☐ Activar **Seguir terreno** com o disparo por waypoint (com relevo
  carregado a cobrir a área).
  **Esperado:** sem erro nem bloqueio; **Waypoints** sobe (pontos de foto
  mais as amostras do relevo); o WPML exportado continua a ter um
  `takePhoto` por ponto de foto, agora com alturas que acompanham o relevo;
  na vista 3D as fotos aparecem sobre a rota.
- ☐ Abrir um projecto gravado antes desta versão.
  **Esperado:** carrega em **Distância** (nada muda no plano nem na exportação).
- ☐ Em **Distância**, exportar WPML e abrir `waylines.wpml`.
  **Esperado:** cada `actionGroup` de disparo com `multipleDistance`,
  `actionGroupMode` **`sequence`** e `actionId` 0; nunca `parallel`.
- ☐ **No campo** (M4T, e depois M300 RTK + P1): grelha pequena de 3–4
  faixas em **Distância**, intervalo ≥ 20 m. Importar no Pilot 2, abrir a
  rota e confirmar que a acção de disparo por distância aparece no
  waypoint 0; voar e contar as fotos.
  **Esperado:** fotos ao longo de cada faixa, `floor(len/intervalo) + 1`
  por faixa (± 1), e não só nos cantos (foi o sintoma do M4T em Outubro de
  2026, com os grupos em `parallel`). Registar Pilot 2, firmware e o
  resultado na matriz do `docs/VALIDACAO.md`.

## 11. Verificação em tablet (~1 min)

A app é usada em campo: numa janela a **~768 px de largura** (DevTools ou
tablet real):

- ☐ A barra dos modos (à esquerda do painel) e os cinco painéis
  (Área/Face/Órbita/Corredor/Circular) são usáveis sem sobreposições; os
  campos numéricos aceitam toque; as listas fazem scroll dentro do painel.
- ☐ Abrir **Mais opções ›** de um cartão.
  **Esperado:** a gaveta abre ao lado do painel, por cima do mapa, sem sair
  do ecrã; os botões dos cartões têm 44 px de altura; o ✕ e o Escape fecham.
- ☐ No modo inspecção, reordenar com as **setas** (o arrastar HTML5 não
  dispara em ecrã táctil — comportamento esperado).
- ☐ O resumo do projecto (2+ planos), por cima das métricas, e o cartão
  das métricas não tapam a barra de desenho nem o zoom; a 1024 × 768 o
  cartão desce para baixo da barra.

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
- ☐ No cartão 7 **Resumo e exportar**, em **Exportar voos**, dois pares:
  KMZ e KML, cada um com «todos» e «por base». **Voos por base (KMZ, ZIP)**.
  **Esperado:** `<missão>_area[-variantes]_voos-por-base.zip` com uma pasta
  por base (`base-A/`, `base-B/`…), cada uma com os seus voos pela ordem de
  voo (`..._B-3.kmz`, `..._B-4.kmz`, com zeros a partir de 10 voos); **Todos
  os voos (KMZ, ZIP)** dá `..._voos.zip` com todos soltos; **Um voo (KMZ)**
  com B-3 dá `..._B-3.kmz`; o botão de exportar do cabeçalho diz **(ZIP)** e
  descarrega o ZIP por base, com a dica a dizê-lo; o botão do fim do cartão
  7 é a parte principal desse botão, com o mesmo nome, a mesma dica e o
  mesmo ficheiro; a seta do botão do cabeçalho abre **Exportar KML da área**
  e as de **Exportar voos** (menos **Um voo**), com os nomes, as dicas e os
  ficheiros do cartão 7. Com um bloqueio no preflight ficam os KMZ
  desactivados (os KML não), no cartão e no menu.
- ☐ **Bases e blocos (KML)** aberto no Google Earth (ou no telemóvel).
  **Esperado:** pontos «Base A» e «Base B» com a ficha ao clicar, círculos
  das zonas, contornos dos blocos com o rótulo do voo.
- ☐ **Blocos por base (KML, ZIP)**; abrir o ZIP.
  **Esperado:** `<missão>_area[-variantes]_kml-por-base.zip` com `base-A/`,
  `base-B/`…, cada uma com um KML por voo (`<missão>_poligono_B-3.kml`,
  pela ordem de voo) e `mapa/<missão>_mapa_base-B.kml`; **Todos os blocos
  (KML, ZIP)** dá `..._kml.zip` com os mesmos KML de bloco soltos, sem
  `mapa/`; cada KML de bloco abre no Google Earth como um só polígono com o
  nome do ficheiro. Sem bases (divisão sem bases marcadas) há só os dois
  «todos», KMZ e KML. **No
  Pilot 2** (M3E/M4T e M300 com P1): importar um KML de bloco como área
  de uma missão de mapeamento e ver o nome mostrado e o polígono; registar
  em `docs/VALIDACAO.md`.
- ☐ **Checklist de campo** e **Relatório**, e imprimir.
  **Esperado:** uma ficha por base: coordenadas (6 casas) que abrem nos
  mapas, zona (reduzida e porquê), cota de referência, voos com tempo
  (trânsito incluído) e o nome do KMZ, conjuntos de baterias contra os da
  equipa, distância VLOS; cada base inteira numa página.
- ☐ **No campo**, na base B: copiar a pasta `base-B/` do ZIP por base para o
  comando e importar no DJI Pilot 2 (cartão ou cabo).
  **Esperado:** as missões aparecem com o nome do ficheiro (`..._B-3`), pela
  ordem de voo; abrir uma e confirmar a altura do primeiro waypoint contra a
  do plano (relativa à cota da zona de B, «voo entre 0 e +X m acima do
  planeado»); descolar dentro do raio da zona.

- ☐ Clicar no pino da base B; clicar no rótulo de um bloco de A e depois
  noutro ponto da célula de outro bloco de A; clicar de novo no mesmo bloco.
  **Esperado:** o cartão 5 diz «Base B seleccionada…»; os dois blocos passam
  para B (cor e rótulo B-…); o segundo clique deixa-o em B. **Esc**: o
  cartão volta à indicação geral e um clique num bloco desactiva-o
  (**Ctrl+Z** repõe). **Marcar base** e um ponto de inspecção com o clique
  dentro de uma célula criam a base e o ponto (a célula não se desactiva).
  Com uma gaveta aberta, o primeiro Esc fecha a gaveta e a base continua
  seleccionada.
- ☐ Na linha da base A, **Atribuir blocos a esta base**; clicar na área de dois
  blocos de outras bases (um na divisão por faixas, onde não há quadrados).
  **Esperado:** nada muda ao carregar no botão; a linha diz «A atribuir blocos
  à base A…»; cada bloco clicado passa para A e só esses; **Terminar** sai do
  modo; dois **Ctrl+Z** repõem os blocos.

## 14. Bacias de visão e rádio — verificação no campo (~2 min + campo)

- ☐ Na missão com bases e blocos, cartão 5 → **Mais opções ›** → **Bacias de
  visão → Mostrar no mapa**.
  **Esperado:** quadrados laranja onde o drone fica atrás do relevo visto do
  ponto da base, amarelos tracejados onde se vê mas a zona de Fresnel do
  rádio não está livre; a percentagem visível em cada bloco; no painel e na
  ficha de campo, por voo, «N % visível — tapado a ~X m do piloto» e o rádio
  em risco; o relevo usado («relevo global ~30 m», «MDT importado …» ou
  «MDS importado …»). A camada fica ligada ao recarregar neste aparelho.
- ☐ Com MDT, **Vegetação e obstáculos** a 15 m (ex. pinhal entre a base e
  um bloco); depois marcar o ficheiro como **MDS**.
  **Esperado:** com o MDT as zonas laranja crescem e o painel diz «+ 15 m de
  vegetação e obstáculos»; com o MDS o campo fica desligado e nada se soma.
- ☐ Base num alto de topo arredondado, seguir terreno a 40-60 m.
  **Esperado:** no painel, por voo, «(olhos a X m DIR da base)» quando o
  melhor ponto da zona não é o ponto da base; na ficha de campo o mesmo,
  com as coordenadas. Com **Vegetação e obstáculos** acima de 0 o texto
  desaparece (o olho fica no ponto).
- ☐ **No campo**, de pé no ponto indicado para o voo (o da base, ou o dos
  «olhos a X m» da ficha) e com o comando à altura habitual: comparar as zonas laranja de um bloco com o que
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
- ☐ Mudar para Corredor, Circular, Face e Órbita.
  **Esperado:** o cartão **Acções de segurança** com a mesma escolha; o KMZ
  de cada modo leva-a.
- ☐ **Checklist de campo**; guardar e reabrir o projecto; abrir um projecto
  anterior.
  **Esperado:** a checklist diz as acções escritas no KMZ; o projecto
  guarda-as; um projecto anterior abre com **Regressar ao ponto de descolagem (RTH)** e
  **Interromper a missão → Regressar ao ponto de descolagem (RTH)**.
- ☐ **No campo**, abrir a rota no DJI Pilot 2.
  **Esperado:** a acção de fim e a de perda de sinal da rota são as do
  planeador.

---

## 16. Primeiro voo de cada modo (~campo)

Os ficheiros que o comando já aceitou estão na matriz de compatibilidade
(`docs/VALIDACAO.md`, §5): M3E + grande-angular e M4T + grande-angular, na
área. Fora dessas combinações o preflight põe a nota «Primeiro voo desta
combinação». No primeiro voo de cada uma, e de cada modo, confirmar e
registar na matriz:

- ☐ **M4T térmica (B2)**: cada foto do KMZ leva a lente `ir`; no cartão
  saem ficheiros `_T` (e não `_V`), uma por disparo; contar as fotos contra
  o «N.º de fotos» do painel.
- ☐ **M300 RTK (M3)**: três waypoints colineares nas pontas das faixas; a
  rota voa a direito sem o comando os rejeitar, e o gimbal fica a −90.
- ☐ **Template com acções e rumos (M2)**: o Pilot 2 abre a missão com as
  acções de câmara por waypoint e os rumos escritos; conferir a primeira
  foto e o rumo do primeiro waypoint contra o plano.
- ☐ **Foto por waypoint sem paragem**: com «Paragem nos waypoints: só nos
  cantos», confirmar que a foto dispara ao passar pelo ponto (contagem de
  fotos igual à de waypoints); se não disparar, exportar com «Em todos».
- ☐ **Alturas no comando**: a altura do primeiro waypoint que o comando
  mostra é a da ficha de campo («Altura no comando») e do KMZ; o RTH do
  cartão 5 é o que o comando propõe ao abrir a rota.
- ☐ **Corredor, circular, órbita e face**: o KMZ aceite no comando, a
  primeira passagem na posição e altura do plano, e as fotos a sair; face
  e órbita com o rumo fixo escrito.

Registo na matriz: aeronave, payload, modo, versão do Pilot 2 e do firmware,
«KMZ aceite», e o que falhou.

## 17. Parâmetros novos, legenda e fotos (~6 min)

- ☐ **Face em L**: desenhar um L e exportar.
  **Esperado:** o preflight não bloqueia; no mapa, na esquina, as fotos
  extra ficam num arco à volta da aresta (lado de fora) ou repartidas antes
  e depois do vértice (lado de dentro), nunca no mesmo ponto; no
  `waylines.wpml`, nenhum par de waypoints seguidos a menos de 1 m.
- ☐ **Face em V muito fechado, por dentro**: um V de braços de 40 m com
  uma deflexão de 150°, lado de dentro, afastamento 5 m, sobreposição
  horizontal 90 %.
  **Esperado:** a exportação fica disponível (sem bloqueio no preflight);
  junto ao vértice fica uma foto a olhar para o fundo do canto; nenhum par
  de waypoints seguidos a menos de 0,55 m.
- ☐ **Face: prolongamento e espera**: com «Prolongar as pontas meia
  imagem» ligado, a primeira e a última coluna de fotos ficam para lá das
  pontas (o painel diz quanto); «Espera em cada foto» a 2 s.
  **Esperado:** cada grupo de foto com `hover` (`hoverTime` 2) antes do
  `takePhoto`, e o tempo de voo sobe 2 s por foto.
- ☐ **Descolagem numa base** (face e órbita, com relevo e uma base): escolher
  «Na base A».
  **Esperado:** o painel diz a diferença de cotas, as alturas do KMZ sobem
  (ou descem) dessa diferença, e a vista 3D mostra a rota no mesmo sítio;
  apagar a base: o preflight bloqueia até escolher outra descolagem.
- ☐ **Intervalo de disparo manual** (área): «Intervalo de disparo manual»
  em «Distância», 25 m; depois «Tempo», 2,3 s.
  **Esperado:** o painel mostra a sobreposição frontal resultante e o campo
  da frontal esbate-se; as estatísticas, as fotos no mapa e o KMZ seguem o
  valor (`multipleDistance` 25, depois `multipleTiming` 2,3); o intervalo
  das estatísticas é o do ficheiro, com «manual».
- ☐ **Rumo fixo** (área): «Rumo da aeronave: fixo», 270°.
  **Esperado:** no `waylines.wpml`, todos os waypoints com
  `smoothTransition` e ângulo −90; com blocos, todos os KMZ do ZIP.
- ☐ **Alturas de segurança**: nas acções de segurança, 45 m de descolagem e
  RTH 150 m.
  **Esperado:** o cartão e a ficha mostram 45 e 150; `takeOffSecurityHeight`
  45 e `globalRTHHeight` 150 em todos os KMZ; apagar os campos volta às
  automáticas.
- ☐ **Corredor e circular com parâmetros próprios**: ligar «Altura e
  sobreposições próprias» e mudar a altura.
  **Esperado:** o plano e o KMZ seguem a altura do corredor (ou do
  circular), e a área não muda.
- ☐ **Corredor partido em voos**: corredor de vários quilómetros, «Divisão
  em voos: Por bateria».
  **Esperado:** o painel lista os voos (C-1, C-2…) com o tempo e a base de
  cada um, todos abaixo do tempo útil; as estatísticas dizem o mesmo número
  de voos e o mais longo com a deslocação da sua base; o mapa mostra cada
  voo na sua cor, com o rótulo; a exportação dá um ZIP com um KMZ por voo;
  a vista 3D mostra os voos separados.
- ☐ **Campos escritos devagar**: no RTH, escrever 150 tecla a tecla, com uma
  pausa entre teclas; no raio do circular, 30.
  **Esperado:** os campos ficam em 150 e 30 (antes davam 205 e 50).
- ☐ **Aeronave e sensor nos outros modos**: na face, na órbita, no corredor
  e no circular, mudar a aeronave e o payload no topo do painel.
  **Esperado:** o cartão 1 da área mostra a mesma escolha; com um LiDAR, a
  órbita e o circular não levam `takePhoto` no KMZ e o painel diz 0 fotos.
- ☐ **Várias inclinações (órbita e face)**: «Várias inclinações (com
  paragem)», ângulos por omissão.
  **Esperado:** −45°, 0° e o limite do gimbal menos 5° (M3E 30°, P1 25°);
  no KMZ, em cada ponto, `gimbalRotate` → `hover` (se houver espera) →
  `takePhoto`, depois `gimbalRotate` → `takePhoto` por inclinação, e a
  órbita em `toPointAndStopWithDiscontinuityCurvature`; fotos ×3. **Em
  voo:** a aeronave pára e cada foto sai com a sua inclinação.
- ☐ **Vídeo da órbita sem degraus**: exportar em vídeo.
  **Esperado:** um `gimbalEvenlyRotate` por troço (`betweenAdjacentPoints`,
  índices `i` e `i+1`) e um só `gimbalRotate` (o do waypoint 0). **Em
  voo:** o gimbal desce de forma contínua, sem saltos entre pontos.
- ☐ **Espera nos pontos de inspecção**: 3 s num ponto.
  **Esperado:** só esse ponto leva `hover`.
- ☐ **Legenda e fotos**: abrir «Legenda» no mapa e na vista 3D, desligar
  «Fotos» e voltar a ligar, em cada modo (área, corredor com foto por
  waypoint, face, órbita, circular).
  **Esperado:** a legenda só lista as camadas com conteúdo, com os símbolos
  do mapa (os blocos e as faixas na cor da base, o início e o fim da rota);
  cada interruptor esconde e mostra a sua camada; as fotos (âmbar) aparecem
  em todos os modos, no mapa e no 3D; com bases e blocos, «Bacias de visão»
  em «Análise» liga a mesma camada do controlo de camadas e do cartão 5.
- ☐ **Primeiro ecrã e métricas**: abrir a app sem área (janela privada).
  **Esperado:** sobre o mapa, a barra de desenho (Polígono, Rectângulo e
  Quadrado realçados; Base; Inspecção) e, por baixo, os «Primeiros passos»
  (3 passos); o ✕ esconde-os e fica o botão «Primeiros passos · 1 de 3»
  (lembrado neste aparelho); sem métricas até haver plano. Com o plano, o
  cartão «Métricas» à direita, com o voo mais longo e a barra contra o
  tempo útil; a seta recolhe-o num botão «Métricas · GSD · voos», e assim
  fica ao recarregar.

## 18. Cabeçalho: projecto, exportar e preflight (~2 min)

- ☐ Abrir o menu do projecto (o nome da missão, no cabeçalho) e escolher
  **Mudar o nome**; escrever outro nome e Enter.
  **Esperado:** o cabeçalho e o cartão 1 mostram o nome novo; com Esc em vez
  de Enter o nome fica como estava. Ao lado do nome, «gravado»; numa janela
  com o armazenamento do site bloqueado, «não gravado».
- ☐ No mesmo menu, **Guardar projecto** e depois **Abrir projecto** com esse
  ficheiro, num separador que não seja o da área.
  **Esperado:** o mesmo .json do botão do cartão 1; o projecto abre igual.
- ☐ Com o teclado: Tab até à seta do botão **Exportar**, seta para baixo,
  setas, Esc.
  **Esperado:** o menu abre com o foco no primeiro item activo, as setas
  andam pelos itens, Esc fecha e o foco volta à seta; em todos os
  separadores o primeiro item é **Exportar KML da área** (inactivo sem
  área), o único nos separadores Face e Corredor; na Órbita segue-se o KMZ
  por nível e no Circular o KMZ por bloco.
- ☐ Área com 15 ou mais bases e zonas reduzidas (relevo acidentado); abrir
  o **preflight** no cabeçalho.
  **Esperado:** a lista abre por cima do mapa, sem o empurrar; no topo as
  contagens de bloqueios, avisos e notas; os bloqueios primeiro, depois os
  avisos e as notas; as zonas reduzidas numa só tabela (base, zona, desnível,
  voo mais baixo), da pior para a melhor, com os mesmos números das frases
  de antes; Esc ou ✕ fecha, e o foco volta à pastilha.
- ☐ A 1024 px de largura.
  **Esperado:** o cabeçalho parte-se em duas linhas sem sair do ecrã; a lista
  do preflight e os menus ficam dentro do ecrã.

Registo de execução:

| Data | Versão/commit | Executor | Resultado | Notas |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
