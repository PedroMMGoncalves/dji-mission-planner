# Registo de alterações

Formato: [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/); versões
[SemVer](https://semver.org/lang/pt-BR/). A etiqueta git `vX.Y.Z` é a
versão do `package.json`, e a GitHub Release traz o build estático em zip.

## Por publicar

### Alterado («Juntar a esta base» volta ao desenho anterior)

- Sai a versão da 1.4.0 com o botão «Juntar aqui (+N voos)» em todas as
  bases, a pré-visualização no mapa e a barra por cima do mapa: tirava a
  sensação de escolha e misturava-se com o «Atribuir base». Volta o botão
  «Juntar a esta base» na linha da base seleccionada (o pino no mapa ou o
  rótulo na lista), que leva todos os blocos ao alcance. A exportação por
  base em pastas e os dois ZIP do cabeçalho ficam.

### Corrigido (passar um bloco a uma base)

- **A base seleccionada é o destino dos blocos.** Antes, com a base B
  seleccionada, clicar no bloco A-1 desactivava-o (o clique só passava o
  bloco à base no modo «Atribuir base», escondido no cartão 5). Agora,
  com uma base seleccionada (o pino no mapa ou o rótulo na lista), clicar
  num bloco — o rótulo ou qualquer ponto da célula — passa-o para ela; um
  segundo clique deixa-o lá (antes passava-o à base seguinte). Esc ou um
  novo clique no pino desselecciona, e sem base seleccionada o clique
  volta a activar ou desactivar a célula. O cartão 5 diz em que estado
  está; os botões «Activar / desactivar» e «Atribuir base» saem.
- Na divisão por faixas os pinos das bases ficavam em cima dos rótulos e
  não havia onde clicar: as células passam a ser alvos, e com uma base
  seleccionada os rótulos ficam por cima dos pinos das outras bases.
- Os traços das faixas e os waypoints deixam de apanhar o clique, que
  chega à célula por baixo.
- «Marcar base» com o clique dentro de uma célula do mosaico desactivava a
  célula em vez de criar a base; agora cria a base.

## 1.4.0 — 2026-10-07

### Acrescentado (várias bases de descolagem)

- **Várias bases** na missão de área. «Marcar base» acrescenta bases A, B,
  C...: marcadores arrastáveis com o rótulo, que se retiram na lista do
  painel. Cada base é uma **zona** (o raio da Configuração, 100 m por
  omissão, ou um raio próprio por base), porque no campo se descola onde
  as condições deixam; a seleccionada mostra a zona no mapa, e o raio
  pedido a tracejado quando foi reduzido junto a uma corta ou talude. A
  aplicação nunca move uma base marcada pelo operador.
- **Alturas por bloco.** As alturas de cada bloco referem-se à cota MAIS
  BAIXA da zona da sua base: descolando em qualquer ponto da zona voa-se
  igual ou acima do plano, nunca abaixo. Com seguir terreno, o KMZ de cada
  bloco sai com `AGL + terreno − cota da zona`; sem ele as alturas ficam
  planas. A folga ao solo, o 3D, o perfil e o preflight usam a cota de
  cada bloco, e os troços de um voo para o seguinte, que não se voam, não
  contam.
- **Atribuição dos blocos**: à base mais próxima no pior caso, ou à
  escolhida à mão (com «Clique num bloco → Atribuir base», o clique passa
  o bloco para a base seleccionada, ou para a seguinte). Voos numerados
  base a base pela ordem dos rótulos e, em cada base, pela ordem do
  mosaico — A-1, A-2, B-3 — no mapa (blocos na cor da sua base), na lista
  de blocos, no perfil e na vista 3D.
- **Lista de bases** no painel: os voos de cada uma, a zona (raio,
  reduzida e porquê, fora do relevo), a cota de referência e «voo entre 0
  e +X m acima do planeado».
- **Preflight bloco a bloco**: voo fora do alcance visual da sua base, com
  a distância no pior caso (aviso); tempo do voo com o trânsito de ida e
  volta acima do tempo útil (aviso; bloqueio quando só o trânsito o passa);
  base fora do relevo (bloqueio); zona reduzida (nota); bloco sem base
  (bloqueio).
- **Ctrl+Z nas bases**: marcar, arrastar e retirar uma base, o raio da zona
  (escrito tecla a tecla, um só passo), atribuir um bloco à mão, «Propor
  bases» e «Juntar aqui» entram no mesmo histórico das edições da área e
  das células.
- **Mosaico refeito sem perder as escolhas.** Mudar o ângulo das faixas, o
  lado, a orientação, o tempo útil ou editar a área mantém, em cada bloco
  novo, a base escolhida à mão e o estado desactivado do bloco antigo que
  cobre pelo menos metade dele; os outros ficam com a base automática e
  activos. Com a área substituída por outra (menos de metade em comum)
  nada passa. As atribuições que não passam são ditas no painel das bases,
  com um botão para dispensar o aviso. METODOS §4.2.
- **Perfil de elevação**: cada voo à parte, com a cota da zona da sua base;
  em «Tudo», os saltos entre voos ficam como falhas e não contam na folga
  nem no percurso.
- **Vista 3D**: cada voo na cor da sua base (traçado, waypoints, contorno
  do bloco drapejado no relevo, área do bloco pintada na imagem de satélite
  e rótulo do voo), cada base com o rótulo e o círculo da zona de
  descolagem, e sem os saltos entre voos.
- Os outros modos (corredor, circular, fachada, órbita, inspecção)
  continuam com uma base de referência: a mais próxima da sua rota. Com
  uma só base, como antes.

### Acrescentado (propor bases e «Juntar aqui»)

- **«Propor bases»** (área dividida em blocos): bases para os blocos que
  nenhuma base vê inteiros dentro do alcance visual da aeronave (M300
  1000 m), com o «máximo de voos por base» da Configuração (0 = sem
  limite); as bases já marcadas ficam onde estão.
- **Sítios planos ou altos, com o rádio livre.** A prática da equipa é
  descolar de um sítio PLANO ou de um dos pontos mais ALTOS da área, nunca
  de um baixo, por causa da ligação rádio (em Mata de Vilar, Lousada, um
  monte pequeno com árvores altas, o sinal caiu quando o drone passou para
  trás dele). Com relevo, um sítio serve se a sua zona de descolagem não
  ficar reduzida abaixo de metade do raio pedido; um bloco aceita-o quando,
  numa bacia de visão grosseira (grelha de 60 m, raio lido a 20 m, rádio
  pela zona de Fresnel, alturas dos olhos e do comando, vegetação da
  missão, cota do drone como nas bacias de visão), o rádio fica livre em
  pelo menos 95 % do bloco, vista do ponto ou de um de 8 pontos na beira
  da zona (com vegetação somada, só do ponto). Entre candidatos: mais
  blocos; melhor rádio; melhor vista; o sítio mais alto; o mais plano. Sem
  sítio aceite para um bloco, propõe-se o melhor que há e o painel diz
  quantas bases ficaram assim. Alturas relativas pequenas ou negativas a
  partir de uma base alta ficam para o aviso do preflight.
- **Candidatos nos altos do relevo**, além dos vértices, pontos médios e
  centros dos blocos: uma grelha de 100 m sobre os blocos e uma margem do
  tamanho do alcance visual, os máximos locais e os patamares planos, até 3
  por bloco.
- **Um sítio, uma base, e consolidação no fim**: os blocos que vão para um
  sítio que já é base juntam-se a ela; uma base cujos blocos possam todos
  passar para outras já escolhidas (dentro do alcance visual, com o sítio
  aceite ou o rádio pelo menos tão bom, sem passar o limite) desaparece, e
  as letras são renumeradas. Menos deslocações.
- **Sem prender o browser**: a proposta corre em fatias de 12 ms, com «A
  propor bases… N %» e «Cancelar»; o resultado não depende das fatias. Sem
  relevo, a proposta é só a da cobertura. METODOS §4.1.
- **«Juntar aqui»**, para descolar de um alto sem mudar de base: o botão de
  cada base diz quantos voos mais ela pode levar dentro do alcance visual
  (pior caso, com o raio da zona), mesmo os de outras bases («Juntar aqui
  (+4 voos)», ou «Nada a juntar»). Ao passar o rato o mapa mostra o
  alcance a tracejado, os blocos que entram e os que ficam de fora; clicar
  no pino da base no mapa abre a mesma acção numa barra por cima do mapa.
  As bases que ficam sem voos saem; o rádio e a vista continuam no
  preflight.

### Acrescentado (bacias de visão e ligação rádio)

- **Bacias de visão por voo.** Com a área dividida em blocos, bases e
  relevo, cada bloco é visto à altura dos olhos do **melhor ponto da zona
  de descolagem** da sua base, numa grelha de 25 m, à cota a que o drone lá
  passa (cota da zona + altura, ou relevo + AGL com seguir terreno), com
  curvatura da Terra e refracção. O operador anda até à beira do patamar
  para ver a encosta: num alto convexo o ombro esconde do ponto da base a
  parte baixa da encosta (na área de teste, a 120 m AGL, 87 % dos pontos à
  vista do ponto da base, 98 % do melhor ponto da zona). Com vegetação
  somada ao relevo, o olho fica no ponto da base (a beira de um cabeço
  arborizado não é clareira).
- No painel das bases e na ficha de campo, por voo, «82 % visível — olhos a
  90 m E da base — tapado a ~420 m do operador» (as coordenadas dos olhos
  na ficha), e o relevo usado («relevo global ~30 m», «MDT importado
  «ficheiro»», «MDS importado …») com a ressalva de que um MDT não tem
  árvores, edifícios nem escombreiras.
- **Rádio (zona de Fresnel).** Cada ponto também com a ligação do comando:
  em risco quando o relevo entra em 60 % da primeira zona de Fresnel a
  2,4 GHz, a partir da antena do comando. Um bloco pode ver-se todo e ter o
  rádio em risco na orla de uma crista.
- **Preflight por voo e por causa**: «Voo A-3: 18 % do bloco fica atrás do
  relevo visto da base A, tapado a ~420 m» e «… com o sinal de rádio em
  risco …», aviso a partir de 5 % do bloco, nota abaixo; nunca bloqueia.
- **Camada «Bacias de visão»** no mapa (painel das bases ou controlo de
  camadas; desligada por omissão, lembrada neste aparelho): atrás do relevo
  a laranja, à vista com o rádio em risco a amarelo tracejado, e a
  percentagem visível de cada bloco.
- **Vegetação e obstáculos** a somar ao relevo, por missão (no projecto,
  0-60 m), a mais de 30 m da base, só com um MDT ou o relevo global. Ao
  importar um ficheiro de relevo, «Este ficheiro é: MDT / MDS» (MDT por
  omissão); com MDS nada se soma. A escolha fica no projecto com o nome do
  ficheiro (que não vai no projecto): ao reabrir, o painel do terreno
  lembra que ficheiro reimportar, e o mesmo ficheiro volta como foi
  gravado.
- **Configuração**: altura dos olhos (1,7 m) e do comando (1,5 m), 1-5 m.
- Cálculo sem prender a interface: depois de 350 ms sem edições, em fatias
  de 12 ms, só para os blocos cujo resultado mudou (mover a base A refaz os
  blocos de A; Ctrl+Z reaproveita). METODOS §4.3.

### Acrescentado (exportação por voo e ficha de campo)

- **Exportar voos** no cartão 7, com a área dividida em voos: **Todos os
  voos (ZIP)** (`..._voos.zip`, todos soltos), **Todos os voos por base
  (ZIP)** (`..._voos-por-base.zip`, uma pasta por base: com vários pilotos,
  cada um leva as pastas das suas bases) e **Um voo (KMZ)** com a escolha
  do voo. Com bases, o botão de exportar do cabeçalho descarrega os dois
  ZIP. Tudo atrás do mesmo preflight.
- **Nomes dos ficheiros**: cada voo sai em
  `<missão>_<tipo>[-variantes]_<voo>.kmz`, ex. `corta-norte_area-tf_A-1.kmz`
  (antes `..._bNN.kmz` pelo id do bloco), e o nome é também o título da
  missão dentro do KMZ, que é o que o Pilot 2 mostra; dentro dos ZIP, os
  KMZ vão pela ordem de voo. Com 10 voos ou mais o número leva zeros
  (`A-01` ... `B-10`), para a lista do Pilot 2 sair pela ordem de voo. Uma
  missão sem divisão mantém o nome de sempre; a órbita por nível e os
  blocos da circular mantêm `_bNN`.
- **Ficha de campo por base** na checklist de campo e no relatório da
  missão: rótulo, coordenadas (6 casas) com ligação para abrir na
  aplicação de mapas (`https` e `geo:`), zona («descolar até R m do
  ponto», reduzida e porquê), cota de referência e «voo entre 0 e +X m
  acima do planeado», voos com o tempo com trânsito e o nome do KMZ de
  cada um, a vista de cada voo, conjuntos de baterias que a base pede
  contra os da equipa e o alcance visual usado. Imprimível, cada base
  inteira numa página. «Importar blocos do plano» na checklist numera o
  registo de voos pelos voos (A-1, ...), com o trânsito.
- **«Bases e blocos (KML)»** para o Google Earth ou a navegação no
  telemóvel: bases com o rótulo e a ficha na descrição, zonas de
  descolagem (círculo com o raio efectivo) e o contorno de cada bloco com
  o rótulo do seu voo, nas cores das bases.

### Alterado (mosaico de quadrados)

- A divisão por bateria e o mosaico usam o mosaico novo: quadrados
  recortados pela área (antes podiam sair dela e voava-se o quadrado
  inteiro), grelha deslocada para dar menos células e menos tiras, tiras
  pequenas fundidas no vizinho quando o conjunto ainda cabe numa bateria,
  e buracos por célula. Os quadrados seguem as faixas por omissão (o
  ângulo usado, também o «Óptimo»); «Quadrados paralelos às faixas»
  desligado devolve a orientação manual.
- O lado do quadrado por bateria passa a contar o trânsito de uma base
  num canto do bloco (zona incluída) e não depende de onde estão as bases;
  o trânsito real de cada bloco é verificado no preflight.
- Projecto: guarda `bases` e `blockBase` (atribuições manuais), e a
  geração do mosaico (`split.mosaic`). Um projecto antigo abre com a base
  única como base A; as células desactivadas no mosaico antigo passam para
  as células novas que ficam pelo menos meio dentro delas; um mosaico
  manual antigo mantém a orientação guardada. Esquema actualizado.

### Acrescentado (configuração do equipamento e tempo útil por voo)

- **Janela «Configuração»** (roda dentada no cabeçalho, ao lado da ajuda).
  Por aeronave: o alcance visual (VLOS) e os tipos de bateria, cada um com
  o **tempo útil por conjunto** — os minutos de voo já descontada a
  reserva com que se aterra — e, opcionalmente, quantos conjuntos a equipa
  tem; acrescentam-se e retiram-se tipos (fica sempre um) e escolhe-se o
  que as missões usam por omissão. O M300 RTK traz os tempos medidos no
  campo (TB60 25 min, TB65 28 min); os das outras aeronaves são
  estimativas e estão marcados como tal. Guarda também o raio e o
  desnível máximo das zonas de descolagem, para as bases múltiplas. Fica
  no browser, à parte dos projectos, e leva-se para outro computador com
  Exportar / Importar (ficheiro JSON; um ficheiro errado dá o motivo na
  própria janela). «Repor valores por omissão» pede confirmação.
- **Bateria da missão em tempo útil.** Na divisão por bateria, «Duração
  da bateria» e «Reserva de regresso» dão lugar a um selector do tipo de
  bateria e ao «Tempo útil por voo», que segue o da bateria e se acerta à
  mão para as condições do dia (com reposição ao valor da bateria). A
  reserva deixa de ser aplicada por cima: blocos, lado do quadrado,
  preflight, resumo do projecto e circular usam o tempo útil tal como
  está, o que é como o operador conta as baterias.
- **Voos contra conjuntos.** Com a contagem de conjuntos conhecida, a
  lista de blocos (e os blocos da circular) mostra uma nota quando a
  missão precisa de mais voos do que os conjuntos que a equipa tem.

### Alterado (projecto: bateria)

- O projecto guarda a bateria da missão (`battery`: tipo e tempo útil) e
  a reserva fica a 0; `batteryByCombo` deixa de ser escrito. Um projecto
  antigo abre com o tempo útil equivalente — duração nominal × (1 −
  reserva), ao meio minuto, com os 30 % de então quando a reserva falta —
  e os seus blocos ficam como estavam. Esquema
  `public/schema/project-v2.schema.json` actualizado; os ficheiros antigos
  continuam a validar.

### Alterado (painel da área em cartões)

- **O painel da área passou a uma coluna de sete cartões numerados pela
  ordem do trabalho**: 1 Missão, 2 Área e relevo, 3 Parâmetros de voo, 4
  Divisão em voos, 5 Bases e segurança, 6 Extras, 7 Resumo e exportar. Cada
  cartão mostra o essencial; o resto abre em **Mais opções ›**, uma gaveta ao
  lado do painel, por cima do mapa (num tablet também): uma de cada vez, fecha
  no ✕ e com Escape, o foco entra nela e volta ao botão. Nas gavetas: preset
  de missão, sensor próprio, FOV de trabalho e enums WPML (1); grelha de
  réplicas, datum, sugestões de encosta e reimportar o MDT ou voltar ao
  relevo global (2); espaçamento manual, disparo e paragens, gimbal,
  overshoot, expansão, dupla grelha, passagem nadir e fiada de amarração
  (3); orientação do mosaico, lado máximo, área por bloco, anular/reactivar
  células e as contagens (4); bacias de visão e vegetação (5); GCPs e pontos
  de inspecção (6). A exportação por voo e por base e o KML «Bases e blocos»
  passaram para o cartão 7, com os números da missão (voos, tempo, voos
  contra conjuntos de baterias, área) e os botões da missão (KMZ) e da área
  (KML). Nenhum controlo saiu: um
  cenário E2E novo (`inventario-painel-area`) verifica os 124 controlos do
  painel antigo, no cartão ou na gaveta. Os outros modos (corredor,
  circular, fachada, órbita) usam o mesmo aspecto de cartões.

### Alterado (painel de estatísticas)

- **Três grupos:** qualidade (GSD, pegada, espaçamento, intervalo de
  disparo), voo (linhas, waypoints, distância, fotos, tempo) e operação.
- **Operação, nova:** voos e bases; baterias necessárias contra os
  conjuntos da equipa; o voo mais longo, com o trânsito desde a sua base,
  contra o tempo útil de uma bateria («A-2 23:20 / 25:00»); tempo total de
  voo com os trânsitos.
- **Cor nos limites:** voo mais longo a âmbar acima de 90 % do tempo útil e
  a vermelho acima de 100 %; menos conjuntos do que voos e intervalo de
  disparo abaixo do mínimo da câmara a âmbar. O preflight tem os avisos
  completos; o painel só os põe à vista.
- **Corrigido:** nos separadores corredor, fachada e órbita o painel
  mostrava os números da área; passa a mostrar os do separador aberto (o
  GSD da fachada e da órbita vem do plano delas, e a pegada, o espaçamento
  e o intervalo das grelhas não se aplicam). «Base → área» só aparece com
  uma base.
- Tempos de uma hora ou mais em horas («17 h 19 min» em vez de «1039 min
  11 s»), também no resumo do cartão 7.

### Acrescentado (acções de segurança)

- **No fim da missão** (regressar à base, por omissão; pairar no último
  ponto; aterrar no local; voltar ao primeiro waypoint) e **Perda de sinal**
  (interromper a missão e regressar à base, aterrar ou pairar; ou continuar
  a missão até ao fim), no cartão 5 da área e num cartão próprio nos outros
  modos, as mesmas em todos. Saem no `missionConfig` do KMZ de todos os
  modos (área, por voo incluído, corredor, circular, fachada, órbita e
  pontos de inspecção), ficam no projecto (`safety`, no esquema JSON) e a
  checklist de campo diz quais são. Um projecto anterior abre com as
  omissões, que são os valores que a exportação sempre escreveu.

### Acrescentado (aviso antes de usar)

- **Aviso na primeira abertura.** Uma janela com cinco pontos: sem
  garantia (GPL-3.0, os autores não respondem por danos na medida máxima
  permitida pela lei), a responsabilidade é do piloto remoto (incluindo o
  seguro de responsabilidade civil, quando exigido), verificar cada missão
  no DJI Pilot 2 antes de descolar, limitações do relevo e o que ainda não
  foi validado em voo, com ligação para a matriz de compatibilidade. Em PT
  e EN, com a escolha de língua no próprio aviso. Aparece uma vez por
  aparelho e volta quando o texto muda; só fecha no botão «Li e
  compreendo». Relê-se a partir da ajuda («Acerca»). Secção curta de aviso
  no topo dos dois README.

### Alterado (não há missão sem relevo)

- **O relevo passa a ser obrigatório.** As alturas do KMZ são relativas à
  descolagem, e sem relevo a aplicação exportava na mesma, com a cota de
  referência no próprio ponto de descolagem e a folga ao solo por
  verificar. Agora o preflight bloqueia a exportação, em todos os modos,
  enquanto o relevo carregado não cobrir a rota exportada, e diz porquê
  (a descarregar, descarga falhada, MDT importado que não cobre a rota, ou
  nenhum), com o botão para descarregar o relevo global no próprio item.
- **Descarga imediata.** Fechar uma geometria (área desenhada, importada
  ou ancorada, eixo do corredor, fachada, órbita) descarrega logo o relevo
  global que a cubra; antes esperava 1,5 s. Editar uma geometria já com
  relevo para lá dele espera 0,8 s. Cada tile tem 20 s.
- **Novas tentativas.** Uma descarga falhada tentava uma vez e desistia até
  se mudar a área. Agora volta a tentar aos 3, 10 e 30 s e quando a
  ligação volta; uma descarga antiga que chegue tarde já não substitui a
  da geometria actual.
- **Uma caixa de relevo para todo o projecto.** A fachada, a órbita, os
  pontos de inspecção e as células das partes importadas de um
  MultiPolygon entram na caixa a cobrir, com a área, o corredor e a rota do
  separador aberto (até 20 km). O relevo global declara coberta a extensão
  dos tiles descarregados, e não só a caixa pedida.
- **MDT importado.** Nunca é substituído enquanto tocar na geometria; um
  MDT de outro sítio, que não lhe toca, dá lugar ao relevo global. Fica em
  memória e é recortado de novo, do mesmo ficheiro, para o separador
  aberto, para não perder resolução (a grelha lida tem no máximo 2048
  píxeis de lado). A falha a ler um ficheiro tem mensagem própria.
- **Pontos de inspecção com a mesma regra.** A sua exportação não passava
  por preflight nenhum: o botão do KMZ fica desactivado, com o motivo,
  enquanto o relevo não os cobrir.
- A nota do preflight sobre a categoria aberta mede-se só sobre o relevo.

### Alterado (sem tecto de altura)

- **A altura de voo é decisão do operador.** O seguimento de terreno
  cortava por omissão aos 120 m acima do solo a subida que o relevo dos
  lados da faixa exige. Não impedia voar mais alto, mas a 100 m a
  protecção lateral ficava limitada a 20 m, e a 120 m ou mais
  desligava-se por completo: tirava segurança precisamente a quem voa
  mais alto, com autorização na categoria específica. O corte sai. Quando
  a rota passa os 120 m acima do solo, o preflight mostra uma nota com a
  altura máxima e o limite da categoria aberta; não é aviso nem bloqueio.
  Nas missões de referência a R2 passa a manter os 100 m de folga pedidos
  (antes 89,6 m, com 48 pontos travados); o instantâneo foi regenerado.
- A nota «sem base» do preflight dizia que o seguimento de terreno usa o
  primeiro waypoint como referência; passa a dizer a verdade: a cota
  mínima do relevo debaixo da rota.

### Corrigido (revisão confrontada: sete problemas reais, dois menores)

Cada achado de uma revisão ao código foi posto à prova por dois agentes,
um a tentar demonstrá-lo e outro a tentar refutá-lo, com um juiz a
decidir. Dos dez, sete confirmaram-se, dois eram menores e um não era
problema.

- **Os botões de exportação dos painéis respeitam o preflight.** Na
  fachada, órbita, corredor e circular, o botão do painel exportava rotas
  que o preflight bloqueava: rota a entrar no relevo, waypoints repetidos,
  base inalcançável. Só o botão do cabeçalho estava ligado aos bloqueios,
  e nesses modos exportava a área, com o preflight do outro modo ao lado.
  Agora todos os botões de uma missão ficam desactivados pelos bloqueios
  dela, com a razão no painel, e o do cabeçalho exporta a missão do
  separador aberto.
- **Pontos dos círculos sem relevo deixam de sair à altura plana.** Com
  seguimento de terreno, um ponto fora do MDT ou num pixel sem dados usava
  a AGL relativa à descolagem e, numa encosta, podia ficar abaixo do chão
  sem a verificação de folga o ver. Passa a usar a cota mais alta do seu
  círculo; um círculo sem relevo nenhum é bloqueio. A cobertura do relevo
  mede-se sobre os círculos, que saem da área até um raio.
- **Circular com seguimento de terreno sem cota de referência é
  bloqueio**, e não uma exportação com alturas planas.
- **Missão circular fantasma no resumo.** Qualquer área gerava uma missão
  circular que o resumo do projecto somava, com tempo, fotos e baterias
  várias vezes acima do real. A missão circular passa a existir só depois
  de se abrir o separador, e pode ser retirada no painel. Projectos
  guardados no separador circular abrem com ela; os outros, sem ela.
- **Aviso do obturador do circular** passa a medir a distância entre fotos
  ao longo do círculo, e não o intervalo das grelhas da área.
- **Um MDT importado para a área continua a cobri-la** depois de se
  desenhar um corredor ao lado: a cobertura da área volta a medir-se
  contra a caixa da área, e a caixa conjunta serve só para carregar.
- **«Seguir terreno» pode sempre desligar-se.** A opção é partilhada pela
  área, corredor e circular, e ficava marcada e bloqueada no separador
  cujo relevo não cobria a rota.
- Menores: a caixa do relevo deixa de ser recalculada a cada render (a
  descarga automática deixava de ser adiada enquanto se editavam campos);
  a espiral em vídeo interpola entre níveis desiguais em vez de assumir o
  primeiro passo (só alcançável por programação).

### Acrescentado (corredor com seguimento de terreno)

- **O corredor passa a seguir o terreno.** Era a limitação declarada do
  modo: as passagens voavam a uma altitude única relativa à descolagem, e
  um corredor segue precisamente o que sobe e desce encostas, como rampas
  de acesso a cortas, coroamentos de barragens de rejeitados, condutas e
  linhas de água. Com relevo carregado, «Seguir terreno» no painel do
  corredor põe cada passagem sobre o seu próprio chão: o motor da área
  (densificação, corredor de ±30 m dos lados da faixa, tecto de 120 m,
  Douglas-Peucker com a tolerância) passa a aceitar passagens com dobras,
  perfila cada troço entre vértices e mantém-nos todos. Numa encosta
  atravessada as passagens de cima e de baixo ficam a alturas diferentes,
  e não à do eixo.
- Na **foto por waypoint** as acções são reindexadas para os vértices na
  rota nova e os pontos acrescentados pelo relevo seguem sem foto; a área,
  nesse modo, continua a recusar o seguimento de terreno.
- **Um só relevo para a área e o corredor**: com corredor no projecto, o
  relevo global e o MDT importado cobrem a união dos dois quando cabe em
  20 km, para um só MDT da DGT, ou o último levantamento, servir ambos.
- A referência das alturas do corredor passa a ser a da área (base com
  relevo, senão a mínima debaixo da rota), também sem seguimento de
  terreno; antes era a cota no início do eixo. O painel ganha a secção
  «Relevo e Base» (descarregar, importar MDT, marcar base, perfil), o
  preflight bloqueia o seguimento pedido sem relevo que cubra a rota e diz
  a cota assumida sem base, e o KMZ leva `-tf` no nome. O perfil e o 3D
  mostram a referência do modo aberto.

## 1.3.0 — 2026-09-24

### Adicionado (modo circular, circlegrammetry)

- **Quinto tipo de missão: Circular.** A área do modo Área coberta por uma
  grelha de círculos sobrepostos, cada um voado com a câmara inclinada
  (−45° por omissão) e o rumo ao seu centro, uma foto em cada ponto, em
  voo curvo contínuo. É a geometria de Bilodeau, Esau, MacDonald e Farooque
  (ISPRS Open J. Photogramm. Remote Sens. 18, 2025), tal como o UgCS a
  planeia: a sobreposição entre círculos dá o passo entre centros
  `2R(1−p)`, a grelha `⌈L/s⌉ × ⌈W/s⌉` é centrada na caixa da área alinhada
  com a aresta mais longa e sai da fronteira, as fiadas alternam o sentido
  de rotação e voam-se em serpentina, e cada círculo entra e sai pelo
  ponto virado ao anterior, pelo que a ligação na fiada mede um passo.
  Verificado contra o campo do artigo (93 × 131 m, raio 30 m): 20 círculos
  a 50 % e 9 a 25 %, extensão fora da área de 25 e 28 m.
- Herda da área o relevo, a cota de referência e o seguimento de terreno,
  aplicado ponto a ponto (sem densificação, para as acções de foto não
  mudarem de índice); blocos por bateria com círculos inteiros; mover a
  área inteira funciona também neste modo. O painel mostra o número de
  círculos, a extensão fora da área, o tempo lado a lado com a grelha do
  separador Área, e sugere a maior sobreposição que mantém o número de
  círculos (a regra do artigo: o tempo sobe em degraus, e no topo do
  degrau os círculos saem menos da área). KMZ `_circular_nN` (`-tf` com
  relevo), único ou um por bloco. Guardado no projecto (`circularConfig`,
  esquema v2). Métodos: METODOS §9A.

### Adicionado (órbita em vídeo)

- **A órbita passa a ter um parâmetro de captura: Fotografia ou Vídeo.**
  Em Fotografia nada muda: anéis a altura constante, uma foto em cada
  waypoint, altura, gimbal e sobreposição iguais em todo o nível, para
  fotogrametria. Em Vídeo a geometria é uma espiral contínua com a mesma
  planta (raio, pontos por volta, rumo ao POI) que sobe um passo por volta
  do primeiro ao último nível, com o gimbal a reapontar ao centro em cada
  ponto; grava do primeiro ao último ponto (`startRecord`/`stopRecord`) e
  não tira fotografias, porque a câmara não fotografa enquanto grava. A
  exportação por nível fica desactivada em vídeo (a gravação é uma só) e o
  KMZ leva a variante no nome (`_orbit-video_nN`). Guardado no projecto
  (`orbitConfig.capture`, esquema actualizado; projectos antigos caem em
  Fotografia). Métodos: METODOS §8.

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

### Corrigido (auditoria contra a especificação WPML)

- **Velocidade de transição limitada a 15 m/s**, o intervalo que a
  especificação dá a `globalTransitionalSpeed`; o M300 RTK deixa de oferecer
  17 m/s (os 81 KMZ escritos pelo comando nunca passam de 15).
- **Inclinação do gimbal por payload.** A fachada aceitava até +45° quando o
  gimbal do M3E chega a +35°; cada payload declara agora o intervalo, a
  exportação recorta o valor e o preflight avisa do pedido fora do intervalo.
- **Lente do M4T no ficheiro.** O template passa a levar `payloadParam` com
  `imageFormat` (`wide` / `ir`) para o par grande-angular / térmica do M4T;
  sem ele o levantamento térmico dispararia a grande-angular, que o Pilot 2
  assume por omissão. Os outros payloads ficam como no ficheiro que voou.
- Fronteira da altura de segurança de descolagem alinhada com o comando
  ([1,2, 1500] m). A auditoria completa, com o que está conforme e o que é
  omitido e tolerado, está em `docs/METODOS.md` §11.2.

### Corrigido (verificações de rota em todos os modos)

- **As verificações de rota corriam só na área.** Órbita, fachada, corredor
  e pontos de inspecção exportavam sem nenhuma verificação de waypoints
  demasiado próximos, taxa de subida ou troços longos — e foi na órbita que
  apareceu o troço inexecutável. Passam a correr sobre a geometria que sai
  no KMZ do modo activo, a mesma que o perfil e o 3D mostram.
- **Limiar de proximidade a 0,5 m em 3D**, o mínimo do SDK da DJI entre
  waypoints consecutivos (a especificação WPML não fixa um); antes só se apanhavam pontos coincidentes a 5 cm.
  O E2E mede-o em todas as rotas exportadas.

### Corrigido (órbita: parava no fim do primeiro anel)

- **Transição entre anéis da órbita.** Cada anel fechava no rumo inicial e o
  anel seguinte começava no mesmo ponto horizontal, um passo acima: um
  segmento de comprimento horizontal **nulo**. A órbita voa em curva
  contínua ajustada pelos pontos (`useStraightLine` 0, sem amortecimento) e
  num troço vertical a tangente horizontal fica indefinida. Em voo
  a aeronave completava o primeiro anel e não continuava. A transição passa
  a ser helicoidal: o anel termina uma corda antes do rumo inicial e o
  seguinte começa nesse rumo, um passo acima; a última corda de cada anel
  voa-se a subir e só o último anel fecha a volta. O ZIP por nível continua
  a dar um KMZ por anel. O E2E passa a garantir que a missão única não tem
  nenhum segmento com menos de 1 m na horizontal.

### Corrigido (base longe da área: perfil debaixo da terra e blocos de 80 m)

- **Cota de referência nunca é 0, e sem base é a mínima da área.** A cota
  da descolagem vinha da elevação no ponto de base; com a base fora do relevo
  carregado — esquecida de outro projecto, ou deixada para trás ao mover a
  área — caía silenciosamente em 0 m, e o perfil de elevação e o 3D
  desenhavam o voo a 80 m absolutos debaixo de um terreno a 100–160 m, com a
  folga a −86 m e nada a avisar. Sem base, o seguimento de terreno usava o
  primeiro waypoint, que também não é seguro: descolar num vale abaixo dele
  punha a rota exportada mais baixa do que a folga dizia. A cadeia passa a
  ser base com relevo → cota **mínima** do relevo debaixo da rota → nenhuma
  (`src/mission/reference.js`), uma só para o perfil, o 3D, a folga ao solo e
  as alturas do seguimento de terreno. A mínima é a única escolha em que
  descolar em qualquer ponto da área põe o drone mais alto, e nunca mais
  baixo, do que o planeado; o perfil mostra a cota assumida e a origem, e o
  preflight avisa quando a base não tem relevo e, sem base, quando o desnível
  da área passa de 10 m — com a cota assumida e o custo na mensagem.
- **Rota que entra no relevo é um bloqueio.** A pior folga ao solo da rota
  exportável é calculada sobre o relevo carregado (`src/mission/clearance.js`,
  amostragem a 40 m como o seguimento de terreno) e entra no preflight: abaixo
  de 0 m bloqueia a exportação («a rota entra no relevo: N m abaixo do solo»),
  abaixo de 15 m avisa. Vale para todos os modos. Antes só o perfil o
  mostrava, a vermelho, para quem o abrisse.
- **Base longe da área** avisa acima de 2 km e bloqueia quando só o trânsito de
  ida e volta excede o tempo útil de uma bateria, com a distância e os minutos
  na mensagem.
- **Blocos por bateria com base inalcançável.** O trânsito entrava no
  orçamento do bloco; com a base a dezenas de km o orçamento caía no mínimo
  de 60 s e saíam 239 quadrados de 80 m — ridículos e sem explicação. Um
  trânsito que não cabe numa bateria deixa de encolher os blocos: dimensionam-se
  sem ele e o preflight bloqueia com a razão.
- A pega de mover a área passa a dizer que a base fica no sítio.

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
  forma e mantém a selecção de células desactivadas. O Ctrl+Z desfaz o
  movimento inteiro — o histórico passa a guardar a área toda (anel,
  buracos, células e âncora) e não só o anel, que era o que repunha antes e
  deixaria buracos e células desalinhados depois de um movimento.
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
