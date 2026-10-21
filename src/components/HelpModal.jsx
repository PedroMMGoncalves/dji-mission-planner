import { useEffect, useState } from 'react'
import { useLang, useT } from '../i18n.jsx'
import { VERSION_NOTES } from '../data/versionNotes.js'

/** Chip de tecla/acção, estilo visualizador de mapas. */
function Kbd({ children }) {
  return (
    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-200">
      {children}
    </kbd>
  )
}

function H({ children }) {
  return (
    <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-sky-400 first:mt-0">
      {children}
    </h3>
  )
}

function Li({ children }) {
  return <li className="mb-1.5 leading-relaxed">{children}</li>
}

function InstrucoesPt() {
  return (
    <>
      <H>Fluxo básico</H>
      <ol className="list-decimal pl-5">
        <Li>
          Escolha a <strong>aeronave e o sensor</strong> e ajuste a altura de voo (ou o GSD alvo), a
          velocidade e as sobreposições.
        </Li>
        <Li>
          Defina a <strong>área</strong>: desenhe-a na barra sobre o mapa (polígono, ou
          rectângulo/quadrado no ponto central), ou importe KML/GeoJSON/Shapefile (cartão 2). Sem
          área, os «Primeiros passos» por baixo da barra dizem por onde começar.
        </Li>
        <Li>
          Confirme o <strong>relevo</strong> (cartão 2: o global descarrega-se sozinho, ou importe
          um MDT; sem relevo não há exportação) e, se quiser, marque a <strong>base</strong> («Base»
          na barra sobre o mapa, ou «Marcar base» no cartão 5), divida em <strong>blocos</strong> e
          planeie <strong>GCPs</strong>.
        </Li>
        <Li>
          <strong>Exporte</strong>: WPML/KMZ (missão completa para o DJI Pilot 2) no botão{' '}
          <strong>Exportar</strong> do cabeçalho, ou KML simples (área) na seta ao lado dele.
        </Li>
      </ol>

      <H>Painel em cartões</H>
      <p>
        No modo Área o painel é uma coluna de sete cartões numerados pela ordem do trabalho:{' '}
        <strong>1 Missão</strong> (nome, projecto, aeronave, sensor, RTK),{' '}
        <strong>2 Área e relevo</strong>, <strong>3 Parâmetros de voo</strong>,{' '}
        <strong>4 Divisão em voos</strong>, <strong>5 Bases e segurança</strong>,{' '}
        <strong>6 Extras</strong> (GCPs e pontos de inspecção) e{' '}
        <strong>7 Resumo e exportar</strong>. Cada cartão mostra o essencial; o resto abre em{' '}
        <strong>Mais opções ›</strong>, uma gaveta ao lado do painel, por cima do mapa (só uma de
        cada vez; fecha no ✕ ou com <Kbd>Esc</Kbd>). Ex.: tipo de levantamento e sensor próprio (1);
        grelha de réplicas, datum e sugestão para o declive (2); espaçamento manual, disparo,
        gimbal, prolongamento, margem, dupla grelha (3); orientação da quadrícula e células (4);
        bacias de visão (5); GCPs e pontos de inspecção (6). Os outros modos usam o mesmo aspecto.
      </p>

      <H>Tipos de missão</H>
      <ul className="list-none">
        <Li>
          <strong>Área</strong> (na barra dos modos, à esquerda do painel) — grelha nadir/oblíqua
          sobre um polígono; inclui a dupla grelha 3D com «Passagem nadir extra (ortomosaico)» e os{' '}
          <strong>pontos de inspecção</strong> como camada extra: marque pontos no mapa («Inspecção»
          na barra sobre o mapa, ou «Marcar pontos no mapa» em Mais opções do cartão 6), edite
          etiqueta/rumo/pitch/foto, reordene por arrasto ou «Sugerir ordem», e exporte como missão
          própria.
        </Li>
        <Li>
          <strong>Face</strong> — clique «Desenhar» e marque o pé da face no mapa (o sentido do
          desenho define a esquerda/direita); conclua com duplo clique. Ajuste altura, afastamento,
          lado e sobreposições; a pré-visualização mostra a linha de voo afastada e os rumos.
          Nenhuma passagem desce abaixo da altura mínima de segurança de 5 m — com afastamentos
          curtos a imagem é estreita e o painel avisa da parte que fica sem cobertura no pé da face.
          Exporta com rumo fixo e uma foto por waypoint. Numa face com cantos, as fotos extra ficam
          num arco à volta da aresta (do lado de fora) ou repartidas antes e depois do vértice (do
          lado de dentro). Pode esperar em cada foto (acção hover), tirar várias inclinações em cada
          ponto, prolongar as pontas meia imagem e descolar numa base: as alturas passam a ser
          relativas a ela. Em todos os modos, a aeronave e o sensor escolhem-se no topo do painel.
        </Li>
        <Li>
          <strong>Órbita</strong> — «Marcar POI» e clicar no alvo; defina raio (ou GSD alvo), níveis
          e passo. Captura em fotografia (anéis, uma foto por waypoint), vídeo (espiral contínua a
          gravar, com o gimbal a rodar sem degraus) ou{' '}
          <strong>várias inclinações (com paragem)</strong>: a aeronave pára em cada ponto e tira
          uma foto por inclinação (por omissão −45°, 0° e o limite do gimbal menos 5°). Exporta a
          missão única («Exportar WPML Avançado (KMZ)») ou um KMZ por nível (ZIP). Como a face, pode
          descolar numa base.
        </Li>
        <Li>
          <strong>Circular</strong> — grelha de círculos sobrepostos sobre a mesma área do modo
          Área, câmara inclinada e apontada ao centro de cada círculo, uma foto por ponto
          (circlegrammetry). Raio e sobreposição entre círculos dão o número de círculos; o painel
          sugere a maior sobreposição que não acrescenta um círculo. Altura e sobreposição frontal:
          as da área, ou próprias.
        </Li>
        <Li>
          <strong>Corredor</strong> — para infraestruturas lineares (estradas, condutas, linhas de
          água, linhas eléctricas). Clique «Desenhar» e marque o <em>eixo</em> no mapa; conclua com
          duplo clique. Defina a <strong>meia-largura</strong> (distância coberta de cada lado do
          eixo — a largura total é o dobro) e o número de passagens paralelas sai daí, da altura de
          voo e da sobreposição lateral. Escolha o disparo por distância ou por waypoint. É{' '}
          <strong>apenas nadir</strong>; altura e sobreposições são as da área, ou próprias. Em
          «Divisão em voos: Por bateria», o eixo corta-se em troços que cabem na bateria, cada voo
          descola da base mais próxima e sai num KMZ próprio (ZIP). Com relevo carregado, «Seguir
          terreno» põe cada passagem sobre o seu próprio solo; a área e o corredor partilham o mesmo
          MDT.
        </Li>
      </ul>

      <H>Avisos que deve compreender</H>
      <ul className="list-none">
        <Li>
          <strong>«Afastamento NÃO verificado»</strong> (modo Face) — sem um GeoTIFF local
          importado, nada valida a distância à face: os tiles globais (~30 m) não têm resolução à
          escala de uma parede. Com um modelo local (MDT/MDS) carregado, a app verifica a folga
          vertical e ao longo do rumo e lista as passagens em conflito — aumentar o afastamento
          resolve.
        </Li>
        <Li>
          <strong>«Passagens partidas»</strong> (corredor) — onde o eixo curva mais apertado do que
          a distância da passagem ao eixo, a linha desviada dobrar-se-ia sobre si própria e a
          aeronave voaria um laço. A app parte a passagem em troços em vez de a voar dobrada, e diz
          quantos partiram. Nessas zonas a cobertura real é menor do que o corredor desenhado no
          mapa, que mostra sempre a largura <em>pedida</em>: alargue a curva do eixo ou reduza a
          meia-largura se precisar de cobertura contínua.
        </Li>
        <Li>
          <strong>«GSD (centro da imagem)»</strong> — com o gimbal oblíquo, o GSD mostrado usa a
          distância inclinada ao centro da imagem (a −60° é ~15 % pior do que a nadir); os bordos
          superiores da imagem são ainda piores. O espaçamento das faixas continua calculado como a
          nadir, de propósito — o erro é conservador (sobreposição real ≥ pedida).
        </Li>
      </ul>

      <H>Desenho do polígono</H>
      <ul className="list-none">
        <Li>
          <Kbd>Clique</Kbd> — adiciona um vértice.
        </Li>
        <Li>
          <Kbd>Backspace</Kbd> ou <Kbd>Ctrl+Z</Kbd> — remove o último vértice (também no pé da face
          e no eixo do corredor).
        </Li>
        <Li>
          <Kbd>Clique no primeiro vértice</Kbd> (com 3 ou mais) ou <Kbd>Duplo clique</Kbd> (esquerdo
          ou direito) — fecha o polígono.
        </Li>
        <Li>
          <Kbd>Esc</Kbd> — cancela o desenho.
        </Li>
      </ul>

      <H>Edição da área</H>
      <ul className="list-none">
        <Li>
          <Kbd>Arrastar vértice</Kbd> — move-o; <Kbd>arrastar ponto intermédio</Kbd> — insere um
          vértice novo.
        </Li>
        <Li>
          <Kbd>Clique direito num vértice</Kbd> — remove-o (mínimo 3).
        </Li>
        <Li>Vértices vermelhos com aviso = auto-intersecção; corrija antes de exportar.</Li>
      </ul>

      <H>Blocos de voo</H>
      <ul className="list-none">
        <Li>
          <strong>Faixas</strong> — corta a serpentina por área máxima (faixas longas).
        </Li>
        <Li>
          <strong>Bateria</strong> — quadrados dimensionados pelo{' '}
          <strong>tempo útil por voo</strong> (com a deslocação de uma base num canto do bloco e o
          «Lado máx. (VLOS)»). Escolha o tipo de bateria e acerte o tempo útil para as condições do
          dia; já inclui a reserva com que aterra, nada é descontado por cima. Os quadrados são
          recortados pela área, seguem as faixas e as tiras pequenas juntam-se ao vizinho quando
          cabem na bateria.
        </Li>
        <Li>
          <strong>Bases</strong> — «Marcar base» acrescenta A, B, C... (arraste para mover; retire
          na lista). «Propor bases» cobre os blocos que nenhuma base vê dentro da distância VLOS,
          sem mexer nas suas. Com relevo, prefere sítios <strong>planos ou altos</strong> com o
          rádio livre: a zona de descolagem não pode ficar reduzida a menos de metade, cada bloco
          tem de ter o rádio livre (zona de Fresnel, com a vegetação da missão) em 95 % dos pontos,
          e entre os que servem ganha o melhor rádio, a melhor vista, o mais alto e o mais plano;
          procura também nos altos do relevo à volta dos blocos. Nunca escolhe um sítio baixo: uma
          altura relativa pequena a partir de uma base alta fica para o aviso do preflight. Corre em
          fatias («A propor bases… N %», com «Cancelar»). Cada base é uma <strong>zona</strong> (100
          m na Configuração): as alturas dos seus blocos referem-se à cota mais baixa da zona, e
          descolando em qualquer ponto dela voa-se entre 0 e +X m acima do planeado. Voos numerados
          por base: A-1, A-2, B-3. Para passar um bloco a uma base, seleccione-a (o marcador no mapa
          ou o rótulo na lista) e clique no bloco (o rótulo ou a célula); um segundo clique deixa-o
          lá, Esc ou um novo clique no marcador desselecciona. Sem base seleccionada, o clique
          activa ou desactiva a célula. Refeita a divisão (ângulo, lado, bateria, área editada),
          cada bloco novo herda a base escolhida à mão e o estado desactivado do bloco antigo que
          cobre pelo menos metade dele; as atribuições que não passam são ditas no cartão 5 (Bases e
          segurança). Com a área substituída por outra (menos de metade em comum) nada passa.
        </Li>
        <Li>
          <strong>Atribuir blocos a esta base</strong> — à mão: carregue em «Atribuir blocos a esta
          base» na linha da base (ou clique no marcador dela no mapa) e clique no mapa nos blocos
          que quer passar para ela, um a um (o rótulo ou a área do bloco); um clique num bloco que
          já é dela deixa-o lá. «Terminar» ou Esc acaba. Nada muda sozinho: só os blocos clicados.
          Um bloco para lá da distância VLOS a partir da base passa na mesma, e o preflight avisa.
          Ctrl+Z anula um clique de cada vez.
        </Li>
        <Li>
          <strong>Bacias de visão</strong> — com bases, blocos e relevo, cada bloco é visto do{' '}
          <strong>melhor ponto da zona</strong> da sua base (à altura dos olhos da Configuração; o
          painel e a ficha dizem onde ficar, «olhos a 90 m E da base»; com vegetação somada, o ponto
          da base) numa grelha de 25 m, à cota a que a aeronave lá passa. Laranja: atrás do relevo;
          amarelo tracejado: à vista, mas o relevo entra em 60 % da zona de Fresnel do rádio (2,4
          GHz, da antena do comando) e a ligação pode cair. O preflight avisa por voo a partir de 5
          % do bloco («Voo A-3: 18 % do bloco fica atrás do relevo visto da base A, tapado a ~420
          m», ou «sinal de rádio em risco»). Um MDT e o relevo global não têm árvores, edifícios nem
          escombreiras: some-os em «Vegetação e obstáculos» (por missão, a mais de 30 m da base) ou
          importe o MDS da equipa e marque «Este ficheiro é: MDS». A camada liga-se no cartão 5
          (Mais opções) ou no controlo de camadas do mapa e fica lembrada neste aparelho.
        </Li>
        <Li>
          <strong>Configuração</strong> (roda dentada no cabeçalho) — por aeronave, a distância VLOS
          e os tipos de bateria com o tempo útil por conjunto e quantos conjuntos tem a equipa (para
          avisar quando a missão precisa de mais voos); a altura dos olhos (1,7 m) e do comando (1,5
          m) para as bacias de visão; guardada no browser, exporta-se e importa-se em ficheiro.
        </Li>
        <Li>
          <strong>Quadrícula</strong> — quadrados de lado manual sobre o polígono, paralelos às
          faixas ou com a orientação escolhida.
        </Li>
        <Li>
          <Kbd>Clique numa célula</Kbd> — desactiva/reactiva · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> — anula
          a última edição, da área, das células ou das bases (marcar, arrastar, retirar, raio,
          atribuir, propor), pela ordem.
        </Li>
        <Li>
          No modo ponto central, a <strong>grelha N×M</strong> replica a forma em colunas × filas.
        </Li>
      </ul>

      <H>Terreno e Vista 3D</H>
      <ul className="list-none">
        <Li>
          Não há missão sem relevo: o relevo global (~30 m) descarrega-se logo que a área, o eixo, a
          face ou a órbita ficam definidos, e volta a tentar se falhar. Sem relevo sob a rota a
          exportação fica bloqueada. Com «Seguir terreno», cada waypoint recebe a altura que mantém
          o AGL constante.
        </Li>
        <Li>
          Para precisão máxima, importe um <strong>MDT GeoTIFF do LiDAR da DGT</strong> (50 cm/2 m)
          — só a janela da área é lida, mesmo em ficheiros de vários GB.
        </Li>
        <Li>
          Marque a <strong>base no local real de descolagem</strong> — as alturas WPML são relativas
          a esse ponto; com várias bases, cada bloco descola da zona da sua.
        </Li>
        <Li>
          A <strong>Vista 3D</strong> mostra as linhas de voo à altura real sobre o relevo (órbita
          com o rato, exagero vertical).
        </Li>
        <Li>
          A <strong>Legenda</strong>, no canto de baixo do mapa e no da vista 3D, diz o que é cada
          camada, com o símbolo que o mapa desenha, e mostra ou esconde cada uma no seu interruptor
          (faixas, fotos, bases, GCP…; no mapa, também as bacias de visão).
        </Li>
        <Li>
          As <strong>Métricas</strong>, num cartão à direita do mapa, aparecem quando há plano: o
          voo mais longo contra o tempo útil da bateria (com uma barra) e a qualidade, o voo e a
          operação do separador aberto. A seta recolhe o cartão num botão com o GSD e os voos. Ao
          importar uma área ou abrir um projecto, o mapa enquadra-a por baixo da barra de desenho e
          à esquerda do cartão aberto.
        </Li>
      </ul>

      <H>Exportação</H>
      <ul className="list-none">
        <Li>
          <strong>KML da área</strong> — só o anel exterior do polígono, para desenhar a missão no
          Pilot 2: os buracos, as partes secundárias e as células desactivadas ficam de fora (o
          botão avisa); os GCPs têm o seu KML, e as bases, zonas e blocos o «Bases e blocos (KML)».
        </Li>
        <Li>
          <strong>KML dos blocos</strong> — um KML por bloco, só o polígono, para a missão de
          mapeamento do Pilot 2 (o comando planeia a rota: confirme a altura, o ângulo das faixas e
          o tempo): «Todos os blocos (KML, ZIP)» (…_kml.zip, todos soltos) ou «Blocos por base (KML,
          ZIP)» (…_kml-por-base.zip, uma pasta por base, com mapa/ com a base, a zona e os blocos).
        </Li>
        <Li>
          <strong>WPML (KMZ)</strong> — missão executável com waypoints e disparo automático; com
          blocos activos gera um ZIP com um KMZ por voo, cada um com o nome do voo
          (missao_area-tf_A-1.kmz, que é o que o Pilot 2 mostra), pela ordem de voo.
        </Li>
        <Li>
          <strong>Exportar voos</strong> (cartão 7, Resumo e exportar) — dois pares iguais, KMZ e
          KML. KMZ: «Todos os voos (KMZ, ZIP)» (…_voos.zip, todos soltos), «Voos por base (KMZ,
          ZIP)» (…_voos-por-base.zip, uma pasta por base: com vários pilotos, cada um leva as pastas
          das suas bases) ou «Um voo (KMZ)»; KML: o polígono de cada bloco, todos ou por base
          (acima). O botão de exportar do cabeçalho é partido: a parte principal é a do fim do
          cartão 7, o mesmo botão (com bases descarrega o ZIP por base, sem bases o de todos, e a
          dica diz qual); a <strong>seta</strong> ao lado abre «Exportar KML da área», em todos os
          separadores, e as outras exportações do separador aberto, com os nomes, as dicas e as
          acções do painel — na área, com a área em vários voos, as de «Exportar voos» (menos «Um
          voo», que pede a escolha do voo); na órbita, o KMZ por nível; no circular, o KMZ por
          bloco. A checklist de campo e o relatório trazem a ficha de cada base (coordenadas com
          ligação para os mapas, zona, cota, voos com os ficheiros, baterias); «Bases e blocos
          (KML)» leva as bases, as zonas e os blocos com o rótulo do voo para o Google Earth ou o
          telemóvel.
        </Li>
        <Li>
          <strong>Acções de segurança</strong> (cartão 5 da área, e um cartão próprio nos outros
          modos; as mesmas em todos) — <strong>No fim da missão</strong>: regressar ao ponto de
          descolagem (RTH, por omissão), pairar no último ponto, aterrar no local ou voltar ao
          primeiro waypoint. <strong>Perda de sinal</strong>: interromper a missão e regressar ao
          ponto de descolagem (por omissão), aterrar ou pairar; ou continuar a missão até ao fim sem
          comando (e depois a acção de fim). Vão no KMZ de todos os voos, ficam no projecto e a
          checklist de campo lembra-as; confirme no Pilot 2 que a altura de regresso livra o relevo.
          A <strong>altura de segurança na descolagem</strong> e a{' '}
          <strong>altura de regresso (RTH)</strong> podem ser escritas; vazias, ficam as automáticas
          (30 m; acima do ponto mais alto de cada voo, no mínimo 100 m).
        </Li>
        <Li>
          <strong>Intervalo de disparo manual</strong> (cartão 3, gaveta) — em metros com
          «Distância» e «Waypoint», em segundos com «Tempo»; o painel diz a sobreposição frontal que
          resulta e o ficheiro leva o valor escrito. <strong>Rumo da aeronave: fixo</strong> — todos
          os waypoints com o mesmo rumo, para oblíquas sempre viradas para o mesmo lado.
        </Li>
        <Li>
          <strong>Disparo por waypoint</strong> — em «Disparo por: Waypoint», cada faixa é
          densificada em waypoints a passos iguais ≤ intervalo e cada um leva uma acção de foto (sem
          disparo por distância); o prolongamento não fotografa. Com «Seguir terreno», os pontos de
          foto passam a fazer parte da rota que segue o relevo e cada um leva a altura do perfil
          nesse sítio. Em «Paragem nos waypoints» escolhe-se parar só nos cantos das faixas (por
          omissão) ou em cada ponto.
        </Li>
        <Li>
          O projecto grava-se automaticamente no browser; use «Guardar/Abrir projecto» para arquivar
          em ficheiro. Estão no cartão 1 e no <strong>menu do projecto</strong>, o nome da missão no
          cabeçalho, com «Mudar o nome»; ao lado do nome, «gravado», ou «não gravado» quando o
          browser recusa a gravação automática. Um ficheiro que não abre diz porquê no cartão 1 e,
          aberto pelo menu do projecto, também por baixo do cabeçalho.
        </Li>
        <Li>
          O <strong>preflight</strong> (a pastilha no cabeçalho) abre a lista por cima do mapa:
          bloqueios primeiro, depois avisos e notas; os avisos repetidos do mesmo tipo (a zona
          reduzida em várias bases, os voos longe da base) juntam-se numa tabela, uma linha por base
          ou por voo. Fecha no ✕ ou com <Kbd>Esc</Kbd>.
        </Li>
      </ul>
      <H>O que mudou</H>
      <p className="leading-relaxed">
        O projecto grava a versão da aplicação; ao reabri-lo com uma versão mais recente, o cartão 1
        lista o que mudou no plano desde então (o quadrado ou o voo com o mesmo rótulo pode já não
        ser o mesmo). A mesma lista:
      </p>
      <WhatChanged lang="pt" />
    </>
  )
}

/** As notas de versão (src/data/versionNotes.js), por versão. */
function WhatChanged({ lang }) {
  return (
    <ul className="list-disc pl-5">
      {VERSION_NOTES.flatMap((n) =>
        (lang === 'en' ? n.en : n.pt).map((txt, i) => (
          <Li key={`${n.version}-${i}`}>
            <span className="font-mono text-xs text-slate-400">{n.version}</span> {txt}
          </Li>
        )),
      )}
    </ul>
  )
}

function InstrucoesEn() {
  return (
    <>
      <H>Basic workflow</H>
      <ol className="list-decimal pl-5">
        <Li>
          Pick the <strong>aircraft and sensor</strong> and set the flight height (or target GSD),
          speed and overlaps.
        </Li>
        <Li>
          Define the <strong>area</strong>: draw it with the bar over the map (polygon, or
          centre-point rectangle/square), or import KML/GeoJSON/Shapefile (card 2). With no area,
          the “First steps” under the bar say where to start.
        </Li>
        <Li>
          Check the <strong>terrain</strong> (card 2: the global terrain downloads on its own, or
          import a DTM; no terrain, no export) and, if you wish, set the <strong>base</strong>
          (“Base” in the bar over the map, or “Set base” in card 5), split into{' '}
          <strong>blocks</strong> and plan <strong>GCPs</strong>.
        </Li>
        <Li>
          <strong>Export</strong>: WPML/KMZ (full mission for DJI Pilot 2) with the{' '}
          <strong>Export</strong> button in the header, or simple KML (area) from the arrow next to
          it.
        </Li>
      </ol>

      <H>Panel in cards</H>
      <p>
        In the Area mode the panel is a column of seven cards numbered in work order:{' '}
        <strong>1 Mission</strong> (name, project, aircraft, sensor, RTK),{' '}
        <strong>2 Area and terrain</strong>, <strong>3 Flight parameters</strong>,{' '}
        <strong>4 Split into flights</strong>, <strong>5 Bases and safety</strong>,{' '}
        <strong>6 Extras</strong> (GCPs and inspection points) and{' '}
        <strong>7 Summary and export</strong>. Each card shows the essentials; the rest opens under{' '}
        <strong>More options ›</strong>, a drawer next to the panel, over the map (one at a time; ✕
        or <Kbd>Esc</Kbd> closes it). E.g. survey type and custom sensor (1); replica grid, datum
        and slope suggestion (2); manual spacing, trigger, gimbal, overshoot, buffer, crosshatch
        (3); tile orientation and cells (4); viewsheds (5); GCPs and inspection points (6). The
        other modes use the same look.
      </p>

      <H>Mission types</H>
      <ul className="list-none">
        <Li>
          <strong>Area</strong> (in the mode bar, left of the panel) — nadir/oblique grid over a
          polygon; includes the 3D crosshatch with “Extra nadir pass (orthomosaic)” and{' '}
          <strong>inspection points</strong> as an extra layer: place points on the map
          (“Inspection” in the bar over the map, or “Place points on the map” in card 6’s More
          options), edit label/heading/pitch/photo, reorder by drag or “Suggest order”, and export
          as a mission of its own.
        </Li>
        <Li>
          <strong>Face</strong> — click “Draw” and mark the foot of the face on the map (the drawing
          direction defines left/right); finish with a double click. Set height, standoff, side and
          overlaps; the preview shows the offset flight line and the headings. No pass drops below
          the 5 m safety floor — at short standoffs the image is narrow and the panel warns about
          the part left uncovered at the foot of the face. Exports with a fixed heading and one
          photo per waypoint. On a face with corners, the extra photos sit on an arc around the edge
          (outside) or spread before and after the vertex (inside). It can wait at each photo (hover
          action), take several pitches at each point, extend the ends by half an image and take off
          from a base: heights then become relative to it. In every mode, the aircraft and sensor
          are chosen at the top of the panel.
        </Li>
        <Li>
          <strong>Orbit</strong> — “Mark POI” and click the target; set radius (or target GSD),
          levels and step. Capture as photo (rings, one photo per waypoint), video (a continuous
          recording spiral, with the gimbal turning without steps) or{' '}
          <strong>several pitches (with stops)</strong>: the aircraft stops at each point and takes
          one photo per pitch (by default −45°, 0° and the gimbal limit minus 5°). Exports a single
          mission or one KMZ per level (ZIP). Like the face, it can take off from a base.
        </Li>
        <Li>
          <strong>Circular</strong> — a grid of overlapping circles over the same polygon as the
          Area mode, camera tilted and aimed at each circle centre, one photo per point
          (circlegrammetry). Radius and circle overlap set the circle count; the panel suggests the
          largest overlap that does not add a circle. Height and forward overlap: the area’s, or its
          own.
        </Li>
        <Li>
          <strong>Corridor</strong> — for linear infrastructure (roads, pipelines, watercourses,
          power lines). Click “Draw” and mark the <em>centreline</em> on the map; finish with a
          double click. Set the <strong>half-width</strong> (distance covered on each side of the
          centreline — the total width is twice that) and the number of parallel passes follows from
          it, the flight height and the side overlap. Choose distance or per-waypoint triggering. It
          is <strong>nadir only</strong>; height and overlaps are the area’s, or its own. With
          “Split into flights: By battery”, the centreline is cut into pieces that fit the battery,
          each flight takes off from the nearest base and goes into its own KMZ (ZIP). With terrain
          loaded, “Follow terrain” puts each pass over its own ground; the area and the corridor
          share one DTM.
        </Li>
      </ul>

      <H>Warnings you must understand</H>
      <ul className="list-none">
        <Li>
          <strong>“Standoff NOT verified”</strong> (face mode) — without an imported local GeoTIFF,
          nothing validates the distance to the face: global tiles (~30 m) lack resolution at wall
          scale. With a local DTM/DSM loaded, the app checks vertical and along-heading clearance
          and lists conflicting passes — raising the standoff clears it.
        </Li>
        <Li>
          <strong>“Split passes”</strong> (corridor) — where the centreline curves tighter than a
          pass's distance from it, the offset line would fold back on itself and the aircraft would
          fly a loop. The app splits the pass into runs instead of flying it folded, and reports how
          many split. Coverage there is narrower than the band drawn on the map, which always shows
          the <em>requested</em> width: ease the bend or reduce the half-width if you need
          continuous coverage.
        </Li>
        <Li>
          <strong>“GSD (frame centre)”</strong> — with an oblique gimbal the displayed GSD uses the
          slant range to the image centre (at −60° it is ~15 % worse than nadir); the upper frame
          edges are worse still. Line spacing stays nadir-based on purpose — the error is
          conservative (real overlap ≥ requested).
        </Li>
      </ul>

      <H>Polygon drawing</H>
      <ul className="list-none">
        <Li>
          <Kbd>Click</Kbd> — adds a vertex.
        </Li>
        <Li>
          <Kbd>Backspace</Kbd> or <Kbd>Ctrl+Z</Kbd> — removes the last vertex (also on the face foot
          and the corridor centreline).
        </Li>
        <Li>
          <Kbd>Click the first vertex</Kbd> (with 3 or more) or <Kbd>Double click</Kbd> (left or
          right) — closes the polygon.
        </Li>
        <Li>
          <Kbd>Esc</Kbd> — cancels drawing.
        </Li>
      </ul>

      <H>Area editing</H>
      <ul className="list-none">
        <Li>
          <Kbd>Drag a vertex</Kbd> — moves it; <Kbd>drag a midpoint</Kbd> — inserts a new vertex.
        </Li>
        <Li>
          <Kbd>Right-click a vertex</Kbd> — removes it (minimum 3).
        </Li>
        <Li>Red vertices with a warning = self-intersection; fix before exporting.</Li>
      </ul>

      <H>Flight blocks</H>
      <ul className="list-none">
        <Li>
          <strong>Lines</strong> — cuts the serpentine by maximum area (long lines).
        </Li>
        <Li>
          <strong>Battery</strong> — squares sized by the <strong>usable time per flight</strong>{' '}
          (including transit from a base at a block corner, and the “Max. side (VLOS)”). Pick the
          battery type and adjust the usable time for the day’s conditions; it already includes the
          reserve you land with, nothing more is deducted. Squares are clipped to the area, follow
          the flight lines, and small slivers merge into a neighbour when the result still fits the
          battery.
        </Li>
        <Li>
          <strong>Bases</strong> — “Set base” adds A, B, C... (drag to move; remove from the list).
          “Propose bases” covers the blocks no base sees within VLOS range, without touching yours.
          With terrain it prefers <strong>flat or high</strong> sites with a clear radio link: the
          take-off zone must keep at least half its radius, each block needs a clear radio link
          (Fresnel zone, with the mission’s vegetation) over 95 % of its points, and among the sites
          that qualify the best radio, the best view, the highest and the flattest win; it also
          looks at the terrain high points around the blocks. It never picks a low site: a small
          relative height from a high base is left to the preflight warning. It runs in slices
          (“Proposing bases… N %”, with “Cancel”). Each base is a <strong>zone</strong> (100 m in
          Settings): its blocks’ heights refer to the zone’s lowest elevation, and taking off
          anywhere in it you fly between 0 and +X m above plan. Flights are numbered by base: A-1,
          A-2, B-3. To move a block to a base, select it (its marker on the map or its label in the
          list) and click the block (its label or its cell); a second click leaves it there, Esc or
          another click on the marker deselects. With no base selected, a click enables or disables
          the cell. When the split is redone (angle, size, battery, edited area), each new block
          inherits the hand-picked base and the disabled state of the old block covering at least
          half of it; assignments that do not carry over are reported in card 5 (Bases and safety).
          If the area is replaced by another (less than half in common), nothing carries over.
        </Li>
        <Li>
          <strong>Assign blocks to this base</strong> — by hand: press “Assign blocks to this base”
          in the base’s row (or click its marker on the map) and click on the map the blocks you
          want to move to it, one by one (their label or their area); clicking a block that is
          already its own leaves it there. “Done” or Esc ends. Nothing changes by itself: only the
          clicked blocks. A block beyond VLOS range from the base moves anyway, and the preflight
          warns. Ctrl+Z undoes one click at a time.
        </Li>
        <Li>
          <strong>Viewsheds</strong> — with bases, blocks and terrain, each block is seen from the{' '}
          <strong>best point of its base’s zone</strong> (at the eye height in Settings; the panel
          and the sheet say where to stand, “eyes 90 m E of the base”; with vegetation added, the
          base point) on a 25 m grid, at the height the aircraft flies there. Orange: behind the
          terrain; yellow hatch: in sight, but the terrain enters 60 % of the radio Fresnel zone
          (2.4 GHz, from the controller antenna) and the link may drop. The preflight warns per
          flight from 5 % of the block. A DTM and the global terrain have no trees, buildings or
          spoil heaps: add them in “Vegetation and obstacles” (per mission, beyond 30 m from the
          base) or import the team’s DSM and mark “This file is: DSM”. The layer is switched in card
          5 (More options) or the map’s layer control and remembered on this device.
        </Li>
        <Li>
          <strong>Settings</strong> (gear in the header) — per aircraft, the VLOS range and the
          battery types with the usable time per set and how many sets the team has (to flag
          missions that need more flights); the eye (1.7 m) and controller (1.5 m) heights for the
          viewsheds; stored in the browser, exported and imported as a file.
        </Li>
        <Li>
          <strong>Tiles</strong> — squares of manual size over the polygon, parallel to the flight
          lines or at the chosen orientation.
        </Li>
        <Li>
          <Kbd>Click a cell</Kbd> — disables/enables it · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> — undoes the
          last edit of the area, the cells or the bases (add, drag, remove, radius, assign,
          propose), in order.
        </Li>
        <Li>
          In centre-point mode, the <strong>N×M grid</strong> replicates the shape in columns ×
          rows.
        </Li>
      </ul>

      <H>Terrain and 3D view</H>
      <ul className="list-none">
        <Li>
          There is no mission without terrain: the global terrain (~30 m) downloads as soon as the
          area, axis, face or orbit is defined, and retries if it fails. With no terrain under the
          route, export is blocked. With “Follow terrain”, each waypoint gets the height that keeps
          the AGL constant.
        </Li>
        <Li>
          For maximum accuracy, import a <strong>DGT LiDAR DTM GeoTIFF</strong> (50 cm/2 m) — only
          the window covering your area is read, even from multi-GB files.
        </Li>
        <Li>
          Set the <strong>base at the actual take-off location</strong> — WPML heights are relative
          to it; with several bases, each block takes off from its base’s zone.
        </Li>
        <Li>
          The <strong>3D view</strong> shows the flight lines at their true height over the terrain
          (mouse orbit, vertical exaggeration).
        </Li>
        <Li>
          The <strong>Legend</strong>, in the bottom corner of the map and in the 3D view, says what
          each layer is, with the symbol the map draws, and shows or hides each one with its switch
          (lines, photos, bases, GCPs…; on the map, also the viewsheds).
        </Li>
        <Li>
          The <strong>Metrics</strong>, in a card on the right of the map, appear once there is a
          plan: the longest flight against the battery’s usable time (with a bar) and the quality,
          flight and operation of the open tab. The arrow collapses the card into a button with the
          GSD and the flights. When you import an area or open a project, the map frames it below
          the drawing bar and to the left of the open card.
        </Li>
      </ul>

      <H>Export</H>
      <ul className="list-none">
        <Li>
          <strong>Area KML</strong> — the outer ring of the polygon only, to draw the mission in
          Pilot 2: holes, secondary parts and disabled cells are left out (the button says so); GCPs
          have their own KML, and bases, zones and blocks the “Bases and blocks (KML)”.
        </Li>
        <Li>
          <strong>Block KMLs</strong> — one KML per block, the polygon only, for a Pilot 2 mapping
          mission (the controller plans the route: check height, line angle and time): “All blocks
          (KML, ZIP)” (…_kml.zip, all loose) or “Blocks by base (KML, ZIP)” (…_kml-por-base.zip, one
          folder per base, with mapa/ holding the base, the zone and the blocks).
        </Li>
        <Li>
          <strong>WPML (KMZ)</strong> — executable mission with waypoints and automatic camera
          triggering; with blocks active it generates a ZIP with one KMZ per flight, each named
          after its flight (mission_area-tf_A-1.kmz, which is what Pilot 2 shows), in flight order.
        </Li>
        <Li>
          <strong>Export flights</strong> (card 7, Summary and export) — two matching pairs, KMZ and
          KML. KMZ: “All flights (KMZ, ZIP)” (…_voos.zip, all loose), “Flights by base (KMZ, ZIP)”
          (…_voos-por-base.zip, one folder per base: with several pilots, each takes the folders of
          their bases) or “One flight (KMZ)”; KML: each block’s polygon, all or by base (above). The
          header export button is a split button: its main part is the one at the end of card 7, the
          same button (with bases it downloads the ZIP by base, without bases the one with all
          flights, and the tooltip says which); the <strong>arrow</strong> next to it opens “Export
          area KML”, in every tab, and the other exports of the open tab, with the panel’s names,
          tooltips and actions — in the area, with the area split into flights, those of “Export
          flights” (except “One flight”, which needs the flight to be chosen); in the orbit, the KMZ
          per level; in the circular mode, the KMZ per block. The field checklist and the report
          carry a sheet per base (coordinates with a maps link, zone, reference elevation, flights
          with their files, batteries); “Bases and blocks (KML)” takes the bases, zones and blocks
          labelled with their flight to Google Earth or a phone.
        </Li>
        <Li>
          <strong>Safety actions</strong> (card 5 of the area, and a card of their own in the other
          modes; the same for all) — <strong>At the end of the mission</strong>: return to home
          (RTH, the default), hover at the last point, land in place or go back to the first
          waypoint. <strong>Signal loss</strong>: stop the mission and return home (the default),
          land or hover; or continue the mission to the end without control (then the end action).
          They go into the KMZ of every flight, are kept in the project and listed in the field
          checklist; check in Pilot 2 that the return height clears the terrain. The{' '}
          <strong>take-off safety height</strong> and the <strong>return (RTH) height</strong> can
          be typed; empty, they are automatic (30 m; above the highest point of each flight, at
          least 100 m).
        </Li>
        <Li>
          <strong>Manual trigger interval</strong> (card 3, drawer) — in metres with “Distance” and
          “Waypoint”, in seconds with “Time”; the panel shows the resulting forward overlap and the
          file carries the typed value. <strong>Aircraft heading: fixed</strong> — every waypoint
          with the same heading, for obliques always facing the same way.
        </Li>
        <Li>
          <strong>Per-waypoint trigger</strong> — with “Trigger by: Waypoint”, each line is
          densified into waypoints at equal steps ≤ interval and every one carries a take-photo
          action (no distance trigger); the overshoot takes no photos. With “Follow terrain”, the
          photo points become part of the terrain-following route and each one takes the profile
          height at that spot. “Stop at waypoints” chooses between stopping only at line corners
          (default) or at every point.
        </Li>
        <Li>
          The project auto-saves in the browser; use “Save/Open project” to archive it as a file.
          They are in card 1 and in the <strong>project menu</strong>, the mission name in the
          header, with “Rename”; next to the name, “saved”, or “not saved” when the browser refuses
          the automatic save. A file that does not open says why in card 1 and, when opened from the
          project menu, also below the header.
        </Li>
        <Li>
          The <strong>preflight</strong> (the pill in the header) opens its list over the map:
          blockers first, then warnings and notes; repeated warnings of the same kind (the zone
          reduced at several bases, flights far from their base) are gathered in a table, one row
          per base or flight. It closes with ✕ or <Kbd>Esc</Kbd>.
        </Li>
      </ul>
      <H>What changed</H>
      <p className="leading-relaxed">
        The project records the application version; when reopened with a newer one, card 1 lists
        what changed in the plan since then (the square or flight with the same label may no longer
        be the same one). The same list:
      </p>
      <WhatChanged lang="en" />
    </>
  )
}

function AcercaPt({ onShowDisclaimer }) {
  return (
    <>
      <H>DJI Mission Planner</H>
      <p className="leading-relaxed">
        Planeador de missões de mapeamento com drones: grelhas fotogramétricas e LiDAR, divisão em
        blocos por bateria, seguimento de terreno, planeamento de GCPs e exportação KML/WPML
        optimizada para o DJI Pilot 2 (Mavic 3E, Matrice 4T, M300 RTK + P1 e perfis personalizados).
      </p>

      <H>Dados e serviços</H>
      <ul className="list-disc pl-5">
        <Li>Imagens de satélite e topónimos © Esri · OpenStreetMap contributors.</Li>
        <Li>Limites administrativos: CAOP © Direção-Geral do Território (CC-BY 4.0).</Li>
        <Li>Elevação global: terrain tiles Terrarium (Mapzen/AWS Open Data).</Li>
        <Li>
          MDT de alta resolução: LiDAR de Portugal Continental © DGT (CC-BY 4.0), via importação de
          GeoTIFF.
        </Li>
      </ul>

      <H>Aviso</H>
      <p className="leading-relaxed text-slate-400">
        Esta ferramenta apoia o planeamento mas não substitui a validação no DJI Pilot 2 nem o
        cumprimento das regras UAS aplicáveis (categoria aberta: máx. 120 m AGL e voo em linha de
        vista). O piloto é sempre responsável pela operação. Verifique zonas de restrição e
        autorizações necessárias antes de voar.
      </p>
      {onShowDisclaimer && (
        <button
          type="button"
          onClick={onShowDisclaimer}
          className="mt-2 text-sky-400 underline hover:text-sky-300"
        >
          Ler o aviso completo
        </button>
      )}
    </>
  )
}

function AcercaEn({ onShowDisclaimer }) {
  return (
    <>
      <H>DJI Mission Planner</H>
      <p className="leading-relaxed">
        Drone mapping mission planner: photogrammetry and LiDAR grids, battery-based block
        splitting, terrain following, GCP planning and KML/WPML export optimised for DJI Pilot 2
        (Mavic 3E, Matrice 4T, M300 RTK + P1 and custom profiles).
      </p>

      <H>Data and services</H>
      <ul className="list-disc pl-5">
        <Li>Satellite imagery and labels © Esri · OpenStreetMap contributors.</Li>
        <Li>
          Administrative boundaries: CAOP © Direção-Geral do Território, Portugal (CC-BY 4.0).
        </Li>
        <Li>Global elevation: Terrarium terrain tiles (Mapzen/AWS Open Data).</Li>
        <Li>
          High-resolution DTM: LiDAR survey of mainland Portugal © DGT (CC-BY 4.0), via GeoTIFF
          import.
        </Li>
      </ul>

      <H>Disclaimer</H>
      <p className="leading-relaxed text-slate-400">
        This tool supports planning but does not replace validation in DJI Pilot 2 nor compliance
        with applicable UAS rules (Open category: max. 120 m AGL and visual line of sight). The
        pilot is always responsible for the operation. Check restriction zones and required
        authorisations before flying.
      </p>
      {onShowDisclaimer && (
        <button
          type="button"
          onClick={onShowDisclaimer}
          className="mt-2 text-sky-400 underline hover:text-sky-300"
        >
          Read the full disclaimer
        </button>
      )}
    </>
  )
}

export default function HelpModal({ onClose, onShowDisclaimer = null }) {
  const [tab, setTab] = useState('instrucoes')
  const t = useT()
  const lang = useLang()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-6 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-slate-700">
          <button
            onClick={() => setTab('instrucoes')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'instrucoes'
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('help.instructions')}
          </button>
          <button
            onClick={() => setTab('acerca')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'acerca'
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('help.about')}
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2.5 text-slate-400 transition-colors hover:text-slate-100"
            title={t('help.closeTitle')}
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">
          {tab === 'instrucoes' ? (
            lang === 'en' ? (
              <InstrucoesEn />
            ) : (
              <InstrucoesPt />
            )
          ) : lang === 'en' ? (
            <AcercaEn onShowDisclaimer={onShowDisclaimer} />
          ) : (
            <AcercaPt onShowDisclaimer={onShowDisclaimer} />
          )}
        </div>
      </div>
    </div>
  )
}
