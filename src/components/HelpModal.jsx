/**
 * Ajuda: um índice de tópicos à esquerda, com uma pesquisa por cima, e o
 * tópico aberto à direita. Os textos são os de sempre (a documentação da
 * aplicação, em PT e em EN), só arrumados em tópicos e grupos; a pesquisa
 * procura na língua aberta, sem distinguir maiúsculas nem acentos, deixa no
 * índice só os tópicos que têm todas as palavras e realça-as no tópico.
 */
import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import { useLang, useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { VERSION_NOTES } from '../data/versionNotes.js'
import { findTerms, searchTerms } from '../utils/textSearch.js'
import { IconChevronRight } from './Icons.jsx'
import { Icon, useMedia } from './MapOverlay.jsx'
import { BACKDROP, CloseIconButton, WINDOW, WindowHeader, useDialogFocus } from './ui/Window.jsx'

/** Chip de tecla/acção, estilo visualizador de mapas. */
function Kbd({ children }) {
  return (
    <kbd className="inline-block min-w-[18px] rounded-[5px] border border-b-2 border-[#2C3A55] bg-surface px-1.5 text-center font-sans text-xs font-semibold leading-5 text-slate-100">
      {children}
    </kbd>
  )
}

/** As notas de versão (src/data/versionNotes.js), por versão. */
function whatChanged(lang) {
  return (
    <ul>
      {VERSION_NOTES.flatMap((n) =>
        (lang === 'en' ? n.en : n.pt).map((txt, i) => (
          <li key={`${n.version}-${i}`}>
            <span className="font-mono text-xs text-slate-400">{n.version}</span> {txt}
          </li>
        )),
      )}
    </ul>
  )
}

/**
 * @typedef {{id: string, title: string, body?: any, children?: Topic[]}} Topic
 * Um tópico tem o corpo; um grupo tem `children`.
 */

/**
 * Os tópicos em português, pela ordem do índice. Cada parágrafo é um dos da
 * ajuda de sempre, com o mesmo texto.
 * @param {{onShowDisclaimer: (() => void)|null, t: (key: string) => string}} o
 * @returns {Topic[]}
 */
function topicsPt({ onShowDisclaimer, t }) {
  return [
    {
      id: 'fluxo',
      title: 'Fluxo básico',
      body: (
        <ol>
          <li>
            Escolha a <strong>aeronave e o sensor</strong> e ajuste a altura de voo (ou o GSD alvo),
            a velocidade e as sobreposições.
          </li>
          <li>
            Defina a <strong>área</strong>: desenhe-a na barra sobre o mapa (polígono, ou
            rectângulo/quadrado no ponto central), ou importe KML/GeoJSON/Shapefile (cartão 2). Sem
            área, os «Primeiros passos» por baixo da barra dizem por onde começar.
          </li>
          <li>
            Confirme o <strong>relevo</strong> (cartão 2: o global descarrega-se sozinho, ou importe
            um MDT; sem relevo não há exportação) e, se quiser, marque a <strong>base</strong>{' '}
            («Marcar base», no cartão 5 ou na barra sobre o mapa, onde se lê «Base»), divida em{' '}
            <strong>blocos</strong> e planeie <strong>GCPs</strong>.
          </li>
          <li>
            <strong>Exporte</strong>: WPML/KMZ (missão completa para o DJI Pilot 2) no botão{' '}
            <strong>Exportar</strong> do cabeçalho, ou KML simples (área) na seta ao lado dele.
          </li>
        </ol>
      ),
    },
    {
      id: 'painel',
      title: 'Painel em cartões',
      body: (
        <p>
          No modo Área o painel é uma coluna de sete cartões numerados pela ordem do trabalho:{' '}
          <strong>1 Missão</strong> (nome, projecto, aeronave, sensor, RTK, tipo de levantamento),{' '}
          <strong>2 Área e relevo</strong>, <strong>3 Parâmetros de voo</strong>,{' '}
          <strong>4 Divisão em voos</strong>, <strong>5 Bases e segurança</strong>,{' '}
          <strong>6 Extras</strong> (GCPs e pontos de inspecção) e{' '}
          <strong>7 Resumo e exportar</strong>. Os cartões abrem e fecham no título, um de cada vez:
          abrir um fecha o que estava aberto, e carregar no título do que está aberto fecha-o (podem
          ficar todos fechados); fechado, cada um mostra o essencial numa linha (ex.: «451.96 ha ·
          relevo global (~30 m)»). À partida está aberto o 2 e, quando a área chega, o 3, a menos
          que já tenha aberto outro; o cartão que deixar aberto (ou nenhum) fica lembrado neste
          aparelho. Um cartão fechado abre-se sozinho quando passa a ter o que mostrar — um projecto
          que não abre ou que foi gravado por uma versão anterior (1); um erro, um aviso ou a
          pergunta das coordenadas ao importar a área, ou desenhá-la (2); marcar uma base ou
          escolhê-la no mapa (5); marcar pontos de inspecção (6) — e fecha o que estava aberto, sem
          mudar o que fica lembrado. O resto de alguns cartões abre numa gaveta ao lado do painel,
          por cima do mapa (só uma de cada vez; fecha no ✕ ou com <Kbd>Esc</Kbd>), no botão do fim
          do cartão, que diz o que ela tem: «Mais opções da aeronave» (1, com a aeronave
          «Personalizada»: o sensor próprio e os enums WPML); «Datum vertical e mais opções» (2: a
          forma centrada num ponto, a sugestão para o declive e a fonte do relevo); «Linhas de voo,
          disparo e câmara» (3: espaçamento manual, margem, prolongamento, disparo, gimbal, rumo,
          dupla grelha, faixa de amarração); «Células e orientação dos quadrados» (4, com
          «Quadrícula» ou «Bateria»); «Pontos de apoio (GCP)» e «Pontos de inspecção» (6). No cartão
          5 as bases estão numa tabela (base, voos, zona, cota): a linha de uma base abre o detalhe
          dela (raio da zona, voos, vista, «Atribuir blocos a esta base» ou, ainda sem blocos,
          «Mostrar a zona no mapa», retirar); as bacias de visão e as acções de segurança estão no
          mesmo cartão. Os outros modos usam o mesmo aspecto, também com uma secção aberta de cada
          vez.
        </p>
      ),
    },
    {
      id: 'tipos',
      title: 'Tipos de missão',
      children: [
        {
          id: 'tipo-area',
          title: 'Área',
          body: (
            <p>
              <strong>Área</strong> (na barra dos modos, à esquerda do painel) — grelha
              nadir/oblíqua sobre um polígono; inclui a dupla grelha 3D com «Passagem nadir extra
              (ortomosaico)» e os <strong>pontos de inspecção</strong> como camada extra: marque-os
              no mapa («Marcar pontos de inspecção», no botão «Pontos de inspecção» do cartão 6 ou
              na barra sobre o mapa, onde se lê «Inspecção»), edite etiqueta/rumo/pitch/foto,
              reordene por arrasto ou «Sugerir ordem», e exporte como missão própria.
            </p>
          ),
        },
        {
          id: 'tipo-face',
          title: 'Face',
          body: (
            <p>
              <strong>Face</strong> — na secção «Pé da face», clique «Desenhar» e marque o pé da
              face no mapa (o sentido do desenho define a esquerda/direita, e o «Lado do voo»
              escolhe-se aí); conclua com «Concluir» ou duplo clique. Em «Parâmetros da face» ajuste
              altura, afastamento, sobreposições e folga mínima: a caixa azul por baixo diz as
              passagens, o passo vertical e o GSD na face, e a pré-visualização mostra a linha de
              voo afastada e os rumos. Nenhuma passagem desce abaixo da altura mínima de segurança
              de 5 m — com afastamentos curtos a imagem é estreita e o painel avisa da parte que
              fica sem cobertura no pé da face. Exporta com rumo fixo e uma foto por waypoint. Numa
              face com cantos, as fotos extra ficam num arco à volta da aresta (do lado de fora) ou
              repartidas antes e depois do vértice (do lado de dentro). Pode esperar em cada foto
              (acção hover) e tirar várias inclinações em cada ponto («Captura»), prolongar as
              pontas meia imagem («Parâmetros da face») e descolar numa base («Descolagem e
              segurança»): as alturas passam a ser relativas a ela. Em todos os modos, a aeronave e
              o sensor escolhem-se na secção 1 do painel, «Aeronave e sensor».
            </p>
          ),
        },
        {
          id: 'tipo-orbita',
          title: 'Órbita',
          body: (
            <p>
              <strong>Órbita</strong> — na secção «Ponto de interesse (POI)», «Marcar POI» e clicar
              no alvo; em «Geometria da órbita» defina raio (ou GSD alvo), níveis e passo, e os
              anéis aparecem vistos de lado, com os pontos por volta e o gimbal por nível. Captura
              em fotografia (anéis, uma foto por waypoint), vídeo (espiral contínua a gravar, com o
              gimbal a rodar sem degraus) ou <strong>várias inclinações (com paragem)</strong>: a
              aeronave pára em cada ponto e tira uma foto por inclinação (por omissão −45°, 0° e o
              limite do gimbal menos 5°). No resumo, exporta a missão única («Exportar WPML Avançado
              (KMZ)», o mesmo botão do cabeçalho) ou um KMZ por nível (ZIP); «O que vai no KMZ» diz
              o que cada ficheiro leva, com os nomes do WPML. Como a face, pode descolar numa base.
            </p>
          ),
        },
        {
          id: 'tipo-circular',
          title: 'Circular',
          body: (
            <p>
              <strong>Circular</strong> — grelha de círculos sobrepostos sobre a mesma área do modo
              Área («Área a cobrir»: o polígono é o mesmo, e move-se, edita-se e importa-se no
              separador Área), câmara inclinada e apontada ao centro de cada círculo, uma foto por
              ponto (circlegrammetry). Em «Círculos», raio e sobreposição entre círculos dão o
              número de círculos; a caixa azul sugere a maior sobreposição que não acrescenta um
              círculo («Usar …») e «Como funciona» explica a conta. Altura e sobreposição frontal:
              as da área, ou próprias («Parâmetros de voo»). «Voos e baterias» junta os círculos em
              blocos, um por bateria, e o resumo exporta a missão única ou um KMZ por bloco (ZIP).
            </p>
          ),
        },
        {
          id: 'tipo-corredor',
          title: 'Corredor',
          body: (
            <p>
              <strong>Corredor</strong> — para infraestruturas lineares (estradas, condutas, linhas
              de água, linhas eléctricas). Na secção «Eixo e largura», clique «Desenhar o eixo» e
              marque o <em>eixo</em> no mapa; conclua com «Concluir» ou duplo clique. Defina a{' '}
              <strong>meia-largura</strong> (distância coberta de cada lado do eixo — a largura
              total é o dobro) e o número de passagens paralelas sai daí, da altura de voo e da
              sobreposição lateral: a caixa azul por baixo diz-o. Em «Parâmetros de voo» escolha o
              disparo por distância ou por waypoint. É <strong>apenas nadir</strong>; altura e
              sobreposições são as da área, ou próprias. Em «Voos e bases», «Divisão em voos: Por
              bateria» corta o eixo em troços que cabem na bateria; a tabela dá cada voo com a sua
              base, o tempo no troço e com a deslocação; cada voo descola da base mais próxima e sai
              num KMZ próprio (ZIP). Com relevo carregado, «Seguir terreno» (secção «Relevo») põe
              cada passagem sobre o seu próprio solo; a área e o corredor partilham o mesmo MDT.
            </p>
          ),
        },
      ],
    },
    {
      id: 'desenhar',
      title: 'Desenhar e editar a área',
      body: (
        <>
          <h3>Desenho do polígono</h3>
          <ul>
            <li>
              <Kbd>Clique</Kbd> — adiciona um vértice.
            </li>
            <li>
              <Kbd>Backspace</Kbd> ou <Kbd>Ctrl+Z</Kbd> — remove o último vértice (também no pé da
              face e no eixo do corredor).
            </li>
            <li>
              <Kbd>Clique no primeiro vértice</Kbd> (com 3 ou mais) ou <Kbd>Duplo clique</Kbd>{' '}
              (esquerdo ou direito) — fecha o polígono.
            </li>
            <li>
              <Kbd>Esc</Kbd> — cancela o desenho.
            </li>
          </ul>
          <h3>Edição da área</h3>
          <ul>
            <li>
              <Kbd>Arrastar vértice</Kbd> — move-o; <Kbd>arrastar ponto intermédio</Kbd> — insere um
              vértice novo.
            </li>
            <li>
              <Kbd>Clique direito num vértice</Kbd> — remove-o (mínimo 3).
            </li>
            <li>Vértices vermelhos com aviso = auto-intersecção; corrija antes de exportar.</li>
          </ul>
          <p>
            No modo ponto central, a <strong>grelha N×M</strong> replica a forma em colunas × filas.
          </p>
        </>
      ),
    },
    {
      id: 'voos',
      title: 'Voos e bases',
      children: [
        {
          id: 'divisao',
          title: 'Divisão em voos',
          body: (
            <>
              <p>
                <strong>Faixas</strong> — corta a serpentina por área máxima (faixas longas).
              </p>
              <p>
                <strong>Bateria</strong> — quadrados dimensionados pelo{' '}
                <strong>tempo útil por voo</strong> (com a deslocação de uma base num canto do bloco
                e o «Lado máx. (VLOS)»). Escolha o tipo de bateria e acerte o tempo útil para as
                condições do dia; já inclui a reserva com que aterra, nada é descontado por cima. Os
                quadrados são recortados pela área, seguem as faixas e as tiras pequenas juntam-se
                ao vizinho quando cabem na bateria.
              </p>
              <p>
                <strong>Quadrícula</strong> — quadrados de lado manual sobre o polígono, paralelos
                às faixas ou com a orientação escolhida.
              </p>
              <p>
                <Kbd>Clique numa célula</Kbd> — desactiva/reactiva · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> —
                anula a última edição, da área, das células ou das bases (marcar, arrastar, retirar,
                raio, atribuir, propor), pela ordem.
              </p>
            </>
          ),
        },
        {
          id: 'bases',
          title: 'Bases de descolagem',
          body: (
            <>
              <p>
                Marque a <strong>base no local real de descolagem</strong> — as alturas WPML são
                relativas a esse ponto; com várias bases, cada bloco descola da zona da sua.
              </p>
              <p>
                <strong>Bases</strong> — «Marcar base» acrescenta A, B, C... (arraste para mover;
                retire-a no detalhe dela, na tabela do cartão 5). «Propor bases» cobre os blocos que
                nenhuma base vê dentro da distância VLOS, sem mexer nas suas. Com relevo, prefere
                sítios <strong>planos ou altos</strong> com o rádio livre: a zona de descolagem não
                pode ficar reduzida a menos de metade, cada bloco tem de ter o rádio livre (zona de
                Fresnel, com a vegetação da missão) em 95 % dos pontos, e entre os que servem ganha
                o melhor rádio, a melhor vista, o mais alto e o mais plano; procura também nos altos
                do relevo à volta dos blocos. Nunca escolhe um sítio baixo: uma altura relativa
                pequena a partir de uma base alta fica para o aviso do preflight. Corre em fatias
                («A propor bases… N %», com «Cancelar»). Cada base é uma <strong>zona</strong> (100
                m na Configuração): as alturas dos seus blocos referem-se à cota mais baixa da zona,
                e descolando em qualquer ponto dela voa-se entre 0 e +X m acima do planeado. Voos
                numerados por base: A-1, A-2, B-3. Para passar um bloco a uma base, seleccione-a (o
                marcador no mapa, ou «Atribuir blocos a esta base» no detalhe dela, na tabela do
                cartão 5) e clique no bloco (o rótulo ou a célula); um segundo clique deixa-o lá,
                Esc ou um novo clique no marcador desselecciona. Sem base seleccionada, o clique
                activa ou desactiva a célula. Refeita a divisão (ângulo, lado, bateria, área
                editada), cada bloco novo herda a base escolhida à mão e o estado desactivado do
                bloco antigo que cobre pelo menos metade dele; as atribuições que não passam são
                ditas no cartão 5 (Bases e segurança). Com a área substituída por outra (menos de
                metade em comum) nada passa.
              </p>
            </>
          ),
        },
        {
          id: 'zona',
          title: 'Zona de descolagem',
          body: (
            <p>
              O operador marca cada base como um ponto, mas no campo descola a 20–100 m dali. Por
              isso cada base é uma <strong>zona</strong> de raio r: 100 m por omissão
              (Configuração), ou um raio próprio de 0 a 500 m no detalhe da base, na tabela do
              cartão 5. O planeamento usa o pior caso: as alturas dos blocos da base referem-se à
              cota <strong>mais baixa</strong> da zona (o centro e anéis a cada 10 m em 16
              direcções), e descolando em qualquer ponto dela voa-se entre 0 e +ganho metros acima
              do planeado (ganho = cota máxima − cota mínima). Junto a uma corta, o raio reduz-se ao
              maior anel com um desnível até 10 m (o máximo da Configuração) e o preflight avisa. O
              alcance visual e o trânsito medem-se do pior ponto da zona: o vértice mais afastado do
              bloco mais r. No mapa, a base escolhida (um clique no marcador) mostra a zona a cheio
              e, se foi reduzida, o raio pedido a tracejado — o mesmo esquema da Configuração.
            </p>
          ),
        },
        {
          id: 'atribuir',
          title: 'Atribuir blocos a uma base',
          body: (
            <p>
              <strong>Atribuir blocos a esta base</strong> — à mão: carregue em «Atribuir blocos a
              esta base» no detalhe da base (abre-se na linha dela, na tabela do cartão 5), ou
              clique no marcador dela no mapa, e clique no mapa nos blocos que quer passar para ela,
              um a um (o rótulo ou a área do bloco); um clique num bloco que já é dela deixa-o lá.
              «Terminar» ou Esc acaba. Nada muda sozinho: só os blocos clicados. Um bloco para lá da
              distância VLOS a partir da base passa na mesma, e o preflight avisa. Ctrl+Z anula um
              clique de cada vez.
            </p>
          ),
        },
        {
          id: 'bacias',
          title: 'Bacias de visão',
          body: (
            <p>
              <strong>Bacias de visão</strong> — com bases, blocos e relevo, cada bloco é visto do{' '}
              <strong>melhor ponto da zona</strong> da sua base (à altura dos olhos da Configuração;
              o painel e a ficha dizem onde ficar, «olhos a 90 m E da base»; com vegetação somada, o
              ponto da base) numa grelha de 25 m, à cota a que a aeronave lá passa. Laranja: atrás
              do relevo; amarelo tracejado: à vista, mas o relevo entra em 60 % da zona de Fresnel
              do rádio (2,4 GHz, da antena do comando) e a ligação pode cair. O preflight avisa por
              voo a partir de 5 % do bloco («Voo A-3: 18 % do bloco fica atrás do relevo visto da
              base A, tapado a ~420 m», ou «sinal de rádio em risco»). Um MDT e o relevo global não
              têm árvores, edifícios nem escombreiras: some-os em «Vegetação e obstáculos» (por
              missão, a mais de 30 m da base) ou importe o MDS da equipa e marque «Este ficheiro é:
              MDS». A camada liga-se em «Mostrar no mapa», na caixa «Bacias de visão» do cartão 5,
              ou no controlo de camadas do mapa, e fica lembrada neste aparelho.
            </p>
          ),
        },
      ],
    },
    {
      id: 'relevo',
      title: 'Relevo, Vista 3D e perfil',
      body: (
        <>
          <p>
            Não há missão sem relevo: o relevo global (~30 m) descarrega-se logo que a área, o eixo,
            a face ou a órbita ficam definidos, e volta a tentar se falhar. Sem relevo sob a rota a
            exportação fica bloqueada. Com «Seguir terreno», cada waypoint recebe a altura que
            mantém o AGL constante.
          </p>
          <p>
            Para precisão máxima, importe um <strong>MDT GeoTIFF do LiDAR da DGT</strong> (50 cm/2
            m) — só a janela da área é lida, mesmo em ficheiros de vários GB.
          </p>
          <p>
            A <strong>Vista 3D</strong> mostra as linhas de voo à altura real sobre o relevo (órbita
            com o rato, exagero vertical).
          </p>
          <p>
            O <strong>perfil de elevação</strong> mostra o terreno sob a rota e a altitude de voo,
            da rota toda ou de um voo de cada vez; a <strong>folga mínima</strong>, onde o voo passa
            mais perto do relevo, fica em destaque: a verde a partir de 30 m, a âmbar de 15 a 30 m e
            a vermelho abaixo de 15 m.
          </p>
        </>
      ),
    },
    {
      id: 'mapa',
      title: 'Legenda e métricas',
      body: (
        <>
          <p>
            A <strong>Legenda</strong>, no canto de baixo do mapa e no de cima da vista 3D, diz o
            que é cada camada, com o símbolo que o mapa desenha (na vista 3D, nas cores da cena, com
            a escala das cotas do relevo e o exagero vertical), e mostra ou esconde cada uma no seu
            interruptor (faixas, fotos, bases, GCP…; no mapa, também as bacias de visão).
          </p>
          <p>
            As <strong>Métricas</strong>, num cartão à direita do mapa, aparecem quando há plano: o
            voo mais longo contra o tempo útil da bateria (com uma barra) e a qualidade, o voo e a
            operação do separador aberto. A seta recolhe o cartão num botão com o GSD e os voos; num
            mapa estreito começa recolhido, e a escolha fica neste aparelho. Ao importar uma área ou
            abrir um projecto, o mapa enquadra-a por baixo da barra de desenho e à esquerda do
            cartão aberto. Com a área dividida em voos e as bases marcadas, por baixo das métricas
            fica o botão <strong>Operação do dia</strong> (os voos e o tempo total), que abre o
            painel do dia de campo no lugar delas.
          </p>
        </>
      ),
    },
    {
      id: 'operacao',
      title: 'Operação do dia e tablet',
      body: (
        <>
          <p>
            A <strong>Operação do dia</strong> abre-se no botão por baixo das métricas, com a área
            dividida em voos e as bases marcadas, e fica à direita do mapa; enquanto está aberta, as
            métricas e o painel de parâmetros recolhem-se, e o mapa fica só com a missão. Fecha no ✕
            ou com <Kbd>Esc</Kbd>. Em cima, os conjuntos de baterias necessários contra os da equipa
            («Definir na Configuração»), o tempo total com as deslocações (e o tempo na missão) e o
            voo mais longo contra o tempo útil. Depois, <strong>A seguir</strong>: o primeiro voo
            por fazer, com a base, o tempo com a deslocação, a parte da bateria, a maior distância à
            base e a zona de descolagem (a âmbar, quando foi reduzida); <strong>Ver no mapa</strong>{' '}
            enquadra o bloco e a base, e <strong>Marcar feito</strong> dá-o por feito. Na{' '}
            <strong>Ordem do dia</strong> há uma linha por voo, pela ordem de voo (A-1, B-2, …), com
            a base e os conjuntos dela, a barra do tempo no bloco e da deslocação (mais clara)
            contra o tempo útil, com um traço nos 90 %, a percentagem e a maior distância à base; a
            caixa da linha marca e desmarca o voo, e a base mostra-o no mapa. No mapa, o voo em foco
            fica com o contorno do bloco, um anel na base e o rótulo, e cada voo feito com um visto.
            «Ajustar o tempo útil» abre a secção 4 do painel, onde se acerta o tempo útil por voo
            para o vento e o frio do dia.
          </p>
          <p>
            Um voo está feito quando tem a <strong>Hora fim</strong> no{' '}
            <strong>Registo de voos</strong> da checklist de campo: <strong>Marcar feito</strong>{' '}
            escreve lá a hora de agora e desmarcar apaga-a; sem as linhas do plano no registo,
            juntam-se primeiro, como em «Importar blocos do plano». O painel e a checklist usam o
            mesmo registo, guardado neste browser com a checklist da missão: o que se marca num
            vê-se no outro.
          </p>
          <p>
            Num ecrã estreito (um tablet, até 1179 px de largura) o cabeçalho fica numa linha, com
            botões de 44 px: o nome da aplicação só no ícone, e a configuração, a ajuda e a língua
            no menu <strong>⋮</strong> (num tablet ao alto, também as vistas). O painel de
            parâmetros é uma folha que se recolhe no botão ao lado do nome do modo; o botão{' '}
            <strong>Painel</strong>, no fundo da barra dos modos, mostra-o e esconde-o em qualquer
            ecrã, e escolher um modo mostra-o. As métricas começam recolhidas num botão.
          </p>
        </>
      ),
    },
    {
      id: 'exportar',
      title: 'Exportar',
      children: [
        {
          id: 'kml',
          title: 'KML da área e dos blocos',
          body: (
            <>
              <p>
                <strong>KML da área</strong> — só o anel exterior do polígono, para desenhar a
                missão no Pilot 2: os buracos, as partes secundárias e as células desactivadas ficam
                de fora (o botão avisa); os GCPs têm o seu KML, e as bases, zonas e blocos o «Bases
                e blocos (KML)».
              </p>
              <p>
                <strong>KML dos blocos</strong> — um KML por bloco, só o polígono, para a missão de
                mapeamento do Pilot 2 (o comando planeia a rota: confirme a altura, o ângulo das
                faixas e o tempo): «Todos os blocos (KML, ZIP)» (…_kml.zip, todos soltos) ou «Blocos
                por base (KML, ZIP)» (…_kml-por-base.zip, uma pasta por base, com mapa/ com a base,
                a zona e os blocos).
              </p>
            </>
          ),
        },
        {
          id: 'wpml',
          title: 'WPML (KMZ) e voos',
          body: (
            <>
              <p>
                <strong>WPML (KMZ)</strong> — missão executável com waypoints e disparo automático;
                com blocos activos gera um ZIP com um KMZ por voo, cada um com o nome do voo
                (missao_area-tf_A-1.kmz, que é o que o Pilot 2 mostra), pela ordem de voo.
              </p>
              <p>
                <strong>Exportar voos</strong> (cartão 7, Resumo e exportar) — dois pares iguais,
                KMZ e KML. KMZ: «Todos os voos (KMZ, ZIP)» (…_voos.zip, todos soltos), «Voos por
                base (KMZ, ZIP)» (…_voos-por-base.zip, uma pasta por base: com vários pilotos, cada
                um leva as pastas das suas bases) ou «Um voo (KMZ)»; KML: o polígono de cada bloco,
                todos ou por base (acima). O botão de exportar do cabeçalho é partido: a parte
                principal é a do fim do cartão 7, o mesmo botão (com bases descarrega o ZIP por
                base, sem bases o de todos, e a dica diz qual); a <strong>seta</strong> ao lado abre
                «Exportar KML da área», em todos os separadores, e as outras exportações do
                separador aberto, com os nomes, as dicas e as acções do painel — na área, com a área
                em vários voos, as de «Exportar voos» (menos «Um voo», que pede a escolha do voo);
                na órbita, o KMZ por nível; no circular, o KMZ por bloco. A checklist de campo e o
                relatório trazem a ficha de cada base (coordenadas com ligação para os mapas, zona,
                cota, voos com os ficheiros, baterias); «Bases e blocos (KML)» leva as bases, as
                zonas e os blocos com o rótulo do voo para o Google Earth ou o telemóvel. No
                relatório, cada base fica numa linha da tabela «Voos por base», com o que é comum a
                todos os voos por cima, e as fichas inteiras abrem-se no botão por baixo dela; o
                relatório imprime-se em A4, em branco, sem a barra de cima.
              </p>
            </>
          ),
        },
        {
          id: 'disparo',
          title: 'Disparo manual e por waypoint',
          body: (
            <>
              <p>
                <strong>Intervalo de disparo manual</strong> (cartão 3, gaveta «Linhas de voo,
                disparo e câmara», grupo «Disparo e câmara») — em metros com «Distância» e
                «Waypoint», em segundos com «Tempo»; o painel diz a sobreposição frontal que resulta
                e o ficheiro leva o valor escrito. <strong>Rumo da aeronave: fixo</strong> — todos
                os waypoints com o mesmo rumo, para oblíquas sempre viradas para o mesmo lado.
              </p>
              <p>
                <strong>Disparo por waypoint</strong> — em «Disparo por: Waypoint», cada faixa é
                densificada em waypoints a passos iguais ≤ intervalo e cada um leva uma acção de
                foto (sem disparo por distância); o prolongamento não fotografa. Com «Seguir
                terreno», os pontos de foto passam a fazer parte da rota que segue o relevo e cada
                um leva a altura do perfil nesse sítio. Em «Paragem nos waypoints» escolhe-se parar
                só nos cantos das faixas (por omissão) ou em cada ponto.
              </p>
            </>
          ),
        },
        {
          id: 'projecto',
          title: 'Guardar o projecto',
          body: (
            <p>
              O projecto grava-se automaticamente no browser; use «Guardar/Abrir projecto» para
              arquivar em ficheiro. Estão no cartão 1 e no <strong>menu do projecto</strong>, o nome
              da missão no cabeçalho, com «Mudar o nome»; ao lado do nome, «gravado», ou «não
              gravado» quando o browser recusa a gravação automática. Um ficheiro que não abre diz
              porquê no cartão 1 e, aberto pelo menu do projecto, também por baixo do cabeçalho.
            </p>
          ),
        },
      ],
    },
    {
      id: 'seguranca',
      title: 'Acções de segurança',
      body: (
        <p>
          <strong>Acções de segurança</strong> (cartão 5 da área; nos outros modos, a secção «Acções
          de segurança» — na face e na órbita, dentro de «Descolagem e segurança»; as mesmas em
          todos) — <strong>No fim da missão</strong>: regressar ao ponto de descolagem (RTH, por
          omissão), pairar no último ponto, aterrar no local ou voltar ao primeiro waypoint.{' '}
          <strong>Perda de sinal</strong>: interromper a missão e regressar ao ponto de descolagem
          (por omissão), aterrar ou pairar; ou continuar a missão até ao fim sem comando (e depois a
          acção de fim). Vão no KMZ de todos os voos, ficam no projecto e a checklist de campo
          lembra-as; confirme no Pilot 2 que a altura de regresso livra o relevo. A{' '}
          <strong>altura de segurança na descolagem</strong> e a{' '}
          <strong>altura de regresso (RTH)</strong> podem ser escritas; vazias, ficam as automáticas
          (30 m; acima do ponto mais alto de cada voo, no mínimo 100 m).
        </p>
      ),
    },
    {
      id: 'preflight',
      title: 'Preflight',
      body: (
        <p>
          O <strong>preflight</strong> (a pastilha no cabeçalho) abre a lista por cima do mapa:
          bloqueios primeiro, depois avisos e notas; os avisos repetidos do mesmo tipo (a zona
          reduzida em várias bases, os voos longe da base) juntam-se numa tabela, uma linha por base
          ou por voo. Fecha no ✕ ou com <Kbd>Esc</Kbd>.
        </p>
      ),
    },
    {
      id: 'avisos',
      title: 'Avisos que deve compreender',
      body: (
        <>
          <p>
            <strong>«Afastamento não verificado contra o terreno»</strong> (modo Face) — sem um
            GeoTIFF local importado, nada valida a distância à face: os tiles globais (~30 m) não
            têm resolução à escala de uma parede. «Importar um GeoTIFF em Área e relevo», no próprio
            aviso, abre o separador Área. Com um modelo local (MDT/MDS) carregado, a app verifica a
            folga vertical e ao longo do rumo e lista as passagens em conflito — aumentar o
            afastamento resolve.
          </p>
          <p>
            <strong>«Passagens partidas»</strong> (corredor) — onde o eixo curva mais apertado do
            que a distância da passagem ao eixo, a linha desviada dobrar-se-ia sobre si própria e a
            aeronave voaria um laço. A app parte a passagem em troços em vez de a voar dobrada, e
            diz quantos partiram. Nessas zonas a cobertura real é menor do que o corredor desenhado
            no mapa, que mostra sempre a largura <em>pedida</em>: alargue a curva do eixo ou reduza
            a meia-largura se precisar de cobertura contínua.
          </p>
          <p>
            <strong>«GSD (centro da imagem)»</strong> — com o gimbal oblíquo, o GSD mostrado usa a
            distância inclinada ao centro da imagem (a −60° é ~15 % pior do que a nadir); os bordos
            superiores da imagem são ainda piores. O espaçamento das faixas continua calculado como
            a nadir, de propósito — o erro é conservador (sobreposição real ≥ pedida).
          </p>
        </>
      ),
    },
    {
      id: 'configuracao',
      title: 'Configuração',
      body: (
        <p>
          <strong>Configuração</strong> (roda dentada no cabeçalho), em quatro secções com um índice
          (aeronaves e baterias, zona de descolagem, piloto, ficheiro e dados) — por aeronave, a
          distância VLOS e os tipos de bateria com o tempo útil por conjunto e quantos conjuntos tem
          a equipa (para avisar quando a missão precisa de mais voos); a altura dos olhos (1,7 m) e
          do comando (1,5 m) para as bacias de visão; guardada no browser, exporta-se e importa-se
          em ficheiro.
        </p>
      ),
    },
    {
      id: 'mudou',
      title: 'O que mudou',
      body: (
        <>
          <p>
            O projecto grava a versão da aplicação; ao reabri-lo com uma versão mais recente, o
            cartão 1 lista o que mudou no plano desde então (o quadrado ou o voo com o mesmo rótulo
            pode já não ser o mesmo). A mesma lista:
          </p>
          {whatChanged('pt')}
        </>
      ),
    },
    {
      id: 'acerca',
      title: t('help.about'),
      children: [
        {
          id: 'aplicacao',
          title: 'A aplicação',
          body: (
            <p>
              Planeador de missões de mapeamento com drones: grelhas fotogramétricas e LiDAR,
              divisão em blocos por bateria, seguimento de terreno, planeamento de GCPs e exportação
              KML/WPML optimizada para o DJI Pilot 2 (Mavic 3E, Matrice 4T, M300 RTK + P1 e perfis
              personalizados).
            </p>
          ),
        },
        {
          id: 'dados',
          title: 'Dados e serviços',
          body: (
            <ul>
              <li>Imagens de satélite e topónimos © Esri · OpenStreetMap contributors.</li>
              <li>Limites administrativos: CAOP © Direção-Geral do Território (CC-BY 4.0).</li>
              <li>Elevação global: terrain tiles Terrarium (Mapzen/AWS Open Data).</li>
              <li>
                MDT de alta resolução: LiDAR de Portugal Continental © DGT (CC-BY 4.0), via
                importação de GeoTIFF.
              </li>
            </ul>
          ),
        },
        {
          id: 'aviso',
          title: t('disc.title'),
          body: (
            <>
              <p>
                Esta ferramenta apoia o planeamento mas não substitui a validação no DJI Pilot 2 nem
                o cumprimento das regras UAS aplicáveis (categoria aberta: máx. 120 m AGL e voo em
                linha de vista). O piloto é sempre responsável pela operação. Verifique zonas de
                restrição e autorizações necessárias antes de voar.
              </p>
              {onShowDisclaimer && (
                <button type="button" onClick={onShowDisclaimer} className={DISCLAIMER_LINK}>
                  Ler o aviso completo
                </button>
              )}
            </>
          ),
        },
      ],
    },
  ]
}

/**
 * Os tópicos em inglês, com os mesmos ids e a mesma ordem.
 * @param {{onShowDisclaimer: (() => void)|null, t: (key: string) => string}} o
 * @returns {Topic[]}
 */
function topicsEn({ onShowDisclaimer, t }) {
  return [
    {
      id: 'fluxo',
      title: 'Basic workflow',
      body: (
        <ol>
          <li>
            Pick the <strong>aircraft and sensor</strong> and set the flight height (or target GSD),
            speed and overlaps.
          </li>
          <li>
            Define the <strong>area</strong>: draw it with the bar over the map (polygon, or
            centre-point rectangle/square), or import KML/GeoJSON/Shapefile (card 2). With no area,
            the “First steps” under the bar say where to start.
          </li>
          <li>
            Check the <strong>terrain</strong> (card 2: the global terrain downloads on its own, or
            import a DTM; no terrain, no export) and, if you wish, set the <strong>base</strong>{' '}
            (“Set base”, in card 5 or in the bar over the map, where it reads “Base”), split into{' '}
            <strong>blocks</strong> and plan <strong>GCPs</strong>.
          </li>
          <li>
            <strong>Export</strong>: WPML/KMZ (full mission for DJI Pilot 2) with the{' '}
            <strong>Export</strong> button in the header, or simple KML (area) from the arrow next
            to it.
          </li>
        </ol>
      ),
    },
    {
      id: 'painel',
      title: 'Panel in cards',
      body: (
        <p>
          In the Area mode the panel is a column of seven cards numbered in work order:{' '}
          <strong>1 Mission</strong> (name, project, aircraft, sensor, RTK, survey type),{' '}
          <strong>2 Area and terrain</strong>, <strong>3 Flight parameters</strong>,{' '}
          <strong>4 Split into flights</strong>, <strong>5 Bases and safety</strong>,{' '}
          <strong>6 Extras</strong> (GCPs and inspection points) and{' '}
          <strong>7 Summary and export</strong>. The cards open and close on their title, one at a
          time: opening one closes the one that was open, and pressing the title of the open one
          closes it (they can all be closed); closed, each shows the essentials on one line (e.g.
          “451.96 ha · global terrain (~30 m)”). At first card 2 is open and, when the area arrives,
          card 3, unless you have already opened another; the card you leave open (or none) is
          remembered on this device. A closed card opens by itself when it has something to show — a
          project that does not open or was saved by an earlier version (1); an error, a warning or
          the coordinate question when importing the area, or drawing it (2); placing a base or
          picking it on the map (5); placing inspection points (6) — and closes the one that was
          open, without changing what is remembered. The rest of some cards opens in a drawer next
          to the panel, over the map (one at a time; ✕ or <Kbd>Esc</Kbd> closes it), from the button
          at the end of the card, which says what it holds: “More aircraft options” (1, with the
          “Custom” aircraft: the custom sensor and the WPML enums); “Vertical datum and more
          options” (2: the shape centred on a point, the slope suggestion and the terrain source);
          “Flight lines, trigger and camera” (3: manual spacing, buffer, overshoot, trigger, gimbal,
          heading, crosshatch, tie line); “Cells and square orientation” (4, with “Tiles” or
          “Battery”); “Ground control points (GCP)” and “Inspection points” (6). In card 5 the bases
          are in a table (base, flights, zone, elevation): a base’s row opens its detail (zone
          radius, flights, view, “Assign blocks to this base” or, with no blocks yet, “Show the zone
          on the map”, remove); the viewsheds and the safety actions are in the same card. The other
          modes use the same look, also with one section open at a time.
        </p>
      ),
    },
    {
      id: 'tipos',
      title: 'Mission types',
      children: [
        {
          id: 'tipo-area',
          title: 'Area',
          body: (
            <p>
              <strong>Area</strong> (in the mode bar, left of the panel) — nadir/oblique grid over a
              polygon; includes the 3D crosshatch with “Extra nadir pass (orthomosaic)” and{' '}
              <strong>inspection points</strong> as an extra layer: place them on the map (“Place
              inspection points”, under the “Inspection points” button of card 6 or in the bar over
              the map, where it reads “Inspection”), edit label/heading/pitch/photo, reorder by drag
              or “Suggest order”, and export as a mission of its own.
            </p>
          ),
        },
        {
          id: 'tipo-face',
          title: 'Face',
          body: (
            <p>
              <strong>Face</strong> — in the “Foot of the face” section, click “Draw” and mark the
              foot of the face on the map (the drawing direction defines left/right, and the “Flight
              side” is chosen there); end with “Finish” or a double click. In “Face parameters” set
              height, standoff, overlaps and minimum clearance: the blue box below gives the passes,
              the vertical step and the GSD on the face, and the preview shows the offset flight
              line and the headings. No pass drops below the 5 m safety floor — at short standoffs
              the image is narrow and the panel warns about the part left uncovered at the foot of
              the face. Exports with a fixed heading and one photo per waypoint. On a face with
              corners, the extra photos sit on an arc around the edge (outside) or spread before and
              after the vertex (inside). It can wait at each photo (hover action) and take several
              pitches at each point (“Capture”), extend the ends by half an image (“Face
              parameters”) and take off from a base (“Take-off and safety”): heights then become
              relative to it. In every mode, the aircraft and sensor are chosen in the panel’s
              section 1, “Aircraft and sensor”.
            </p>
          ),
        },
        {
          id: 'tipo-orbita',
          title: 'Orbit',
          body: (
            <p>
              <strong>Orbit</strong> — in the “Point of interest (POI)” section, “Mark POI” and
              click the target; in “Orbit geometry” set radius (or target GSD), levels and step, and
              the rings appear seen from the side, with the points per turn and the gimbal per
              level. Capture as photo (rings, one photo per waypoint), video (a continuous recording
              spiral, with the gimbal turning without steps) or{' '}
              <strong>several pitches (with stops)</strong>: the aircraft stops at each point and
              takes one photo per pitch (by default −45°, 0° and the gimbal limit minus 5°). In the
              summary, exports a single mission (“Export Advanced WPML (KMZ)”, the same button as in
              the header) or one KMZ per level (ZIP); “What goes into the KMZ” says what each file
              carries, with the WPML names. Like the face, it can take off from a base.
            </p>
          ),
        },
        {
          id: 'tipo-circular',
          title: 'Circular',
          body: (
            <p>
              <strong>Circular</strong> — a grid of overlapping circles over the same polygon as the
              Area mode (“Area to cover”: the polygon is shared, and it is moved, edited and
              imported in the Area tab), camera tilted and aimed at each circle centre, one photo
              per point (circlegrammetry). In “Circles”, radius and circle overlap set the circle
              count; the blue box suggests the largest overlap that does not add a circle (“Use …”)
              and “How it works” explains the sum. Height and forward overlap: the area’s, or its
              own (“Flight parameters”). “Flights and batteries” groups the circles into blocks, one
              per battery, and the summary exports a single mission or one KMZ per block (ZIP).
            </p>
          ),
        },
        {
          id: 'tipo-corredor',
          title: 'Corridor',
          body: (
            <p>
              <strong>Corridor</strong> — for linear infrastructure (roads, pipelines, watercourses,
              power lines). In the “Centreline and width” section, click “Draw the centreline” and
              mark the <em>centreline</em> on the map; end with “Finish” or a double click. Set the{' '}
              <strong>half-width</strong> (distance covered on each side of the centreline — the
              total width is twice that) and the number of parallel passes follows from it, the
              flight height and the side overlap: the blue box below says it. In “Flight parameters”
              choose distance or per-waypoint triggering. It is <strong>nadir only</strong>; height
              and overlaps are the area’s, or its own. In “Flights and bases”, “Split into flights:
              By battery” cuts the centreline into stretches that fit the battery; the table gives
              each flight with its base, the time on the stretch and with transit; each flight takes
              off from the nearest base and goes into its own KMZ (ZIP). With terrain loaded,
              “Follow terrain” (“Terrain” section) puts each pass over its own ground; the area and
              the corridor share one DTM.
            </p>
          ),
        },
      ],
    },
    {
      id: 'desenhar',
      title: 'Drawing and editing the area',
      body: (
        <>
          <h3>Polygon drawing</h3>
          <ul>
            <li>
              <Kbd>Click</Kbd> — adds a vertex.
            </li>
            <li>
              <Kbd>Backspace</Kbd> or <Kbd>Ctrl+Z</Kbd> — removes the last vertex (also on the face
              foot and the corridor centreline).
            </li>
            <li>
              <Kbd>Click the first vertex</Kbd> (with 3 or more) or <Kbd>Double click</Kbd> (left or
              right) — closes the polygon.
            </li>
            <li>
              <Kbd>Esc</Kbd> — cancels drawing.
            </li>
          </ul>
          <h3>Area editing</h3>
          <ul>
            <li>
              <Kbd>Drag a vertex</Kbd> — moves it; <Kbd>drag a midpoint</Kbd> — inserts a new
              vertex.
            </li>
            <li>
              <Kbd>Right-click a vertex</Kbd> — removes it (minimum 3).
            </li>
            <li>Red vertices with a warning = self-intersection; fix before exporting.</li>
          </ul>
          <p>
            In centre-point mode, the <strong>N×M grid</strong> replicates the shape in columns ×
            rows.
          </p>
        </>
      ),
    },
    {
      id: 'voos',
      title: 'Flights and bases',
      children: [
        {
          id: 'divisao',
          title: 'Split into flights',
          body: (
            <>
              <p>
                <strong>Lines</strong> — cuts the serpentine by maximum area (long lines).
              </p>
              <p>
                <strong>Battery</strong> — squares sized by the{' '}
                <strong>usable time per flight</strong> (including transit from a base at a block
                corner, and the “Max. side (VLOS)”). Pick the battery type and adjust the usable
                time for the day’s conditions; it already includes the reserve you land with,
                nothing more is deducted. Squares are clipped to the area, follow the flight lines,
                and small slivers merge into a neighbour when the result still fits the battery.
              </p>
              <p>
                <strong>Tiles</strong> — squares of manual size over the polygon, parallel to the
                flight lines or at the chosen orientation.
              </p>
              <p>
                <Kbd>Click a cell</Kbd> — disables/enables it · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> —
                undoes the last edit of the area, the cells or the bases (add, drag, remove, radius,
                assign, propose), in order.
              </p>
            </>
          ),
        },
        {
          id: 'bases',
          title: 'Take-off bases',
          body: (
            <>
              <p>
                Set the <strong>base at the actual take-off location</strong> — WPML heights are
                relative to it; with several bases, each block takes off from its base’s zone.
              </p>
              <p>
                <strong>Bases</strong> — “Set base” adds A, B, C... (drag to move; remove it in its
                detail, in the table of card 5). “Propose bases” covers the blocks no base sees
                within VLOS range, without touching yours. With terrain it prefers{' '}
                <strong>flat or high</strong> sites with a clear radio link: the take-off zone must
                keep at least half its radius, each block needs a clear radio link (Fresnel zone,
                with the mission’s vegetation) over 95 % of its points, and among the sites that
                qualify the best radio, the best view, the highest and the flattest win; it also
                looks at the terrain high points around the blocks. It never picks a low site: a
                small relative height from a high base is left to the preflight warning. It runs in
                slices (“Proposing bases… N %”, with “Cancel”). Each base is a <strong>zone</strong>{' '}
                (100 m in Settings): its blocks’ heights refer to the zone’s lowest elevation, and
                taking off anywhere in it you fly between 0 and +X m above plan. Flights are
                numbered by base: A-1, A-2, B-3. To move a block to a base, select it (its marker on
                the map, or “Assign blocks to this base” in its detail, in the table of card 5) and
                click the block (its label or its cell); a second click leaves it there, Esc or
                another click on the marker deselects. With no base selected, a click enables or
                disables the cell. When the split is redone (angle, size, battery, edited area),
                each new block inherits the hand-picked base and the disabled state of the old block
                covering at least half of it; assignments that do not carry over are reported in
                card 5 (Bases and safety). If the area is replaced by another (less than half in
                common), nothing carries over.
              </p>
            </>
          ),
        },
        {
          id: 'zona',
          title: 'Take-off zone',
          body: (
            <p>
              Each base is marked as a point, but in the field you take off 20–100 m from it. So
              each base is a <strong>zone</strong> of radius r: 100 m by default (Settings), or its
              own radius from 0 to 500 m in the base’s detail, in the table of card 5. Planning
              takes the worst case: the heights of the base’s blocks refer to the{' '}
              <strong>lowest</strong> elevation of the zone (the centre and rings every 10 m in 16
              directions), and taking off anywhere in it you fly between 0 and +gain metres above
              the plan (gain = highest − lowest elevation). Near a cliff, the radius shrinks to the
              largest ring with at most 10 m of relief (the maximum in Settings) and the preflight
              warns. Visual range and transit are measured from the zone’s worst point: the block’s
              farthest vertex plus r. On the map, the selected base (a click on its marker) shows
              the zone filled and, if it was reduced, the requested radius dashed — the same scheme
              as in Settings.
            </p>
          ),
        },
        {
          id: 'atribuir',
          title: 'Assigning blocks to a base',
          body: (
            <p>
              <strong>Assign blocks to this base</strong> — by hand: press “Assign blocks to this
              base” in the base’s detail (it opens in its row, in the table of card 5), or click its
              marker on the map, and click on the map the blocks you want to move to it, one by one
              (their label or their area); clicking a block that is already its own leaves it there.
              “Done” or Esc ends. Nothing changes by itself: only the clicked blocks. A block beyond
              VLOS range from the base moves anyway, and the preflight warns. Ctrl+Z undoes one
              click at a time.
            </p>
          ),
        },
        {
          id: 'bacias',
          title: 'Viewsheds',
          body: (
            <p>
              <strong>Viewsheds</strong> — with bases, blocks and terrain, each block is seen from
              the <strong>best point of its base’s zone</strong> (at the eye height in Settings; the
              panel and the sheet say where to stand, “eyes 90 m E of the base”; with vegetation
              added, the base point) on a 25 m grid, at the height the aircraft flies there. Orange:
              behind the terrain; yellow hatch: in sight, but the terrain enters 60 % of the radio
              Fresnel zone (2.4 GHz, from the controller antenna) and the link may drop. The
              preflight warns per flight from 5 % of the block. A DTM and the global terrain have no
              trees, buildings or spoil heaps: add them in “Vegetation and obstacles” (per mission,
              beyond 30 m from the base) or import the team’s DSM and mark “This file is: DSM”. The
              layer is switched with “Show on the map”, in the “Viewsheds” box of card 5, or in the
              map’s layer control, and remembered on this device.
            </p>
          ),
        },
      ],
    },
    {
      id: 'relevo',
      title: 'Terrain, 3D view and profile',
      body: (
        <>
          <p>
            There is no mission without terrain: the global terrain (~30 m) downloads as soon as the
            area, axis, face or orbit is defined, and retries if it fails. With no terrain under the
            route, export is blocked. With “Follow terrain”, each waypoint gets the height that
            keeps the AGL constant.
          </p>
          <p>
            For maximum accuracy, import a <strong>DGT LiDAR DTM GeoTIFF</strong> (50 cm/2 m) — only
            the window covering your area is read, even from multi-GB files.
          </p>
          <p>
            The <strong>3D view</strong> shows the flight lines at their true height over the
            terrain (mouse orbit, vertical exaggeration).
          </p>
          <p>
            The <strong>elevation profile</strong> shows the terrain under the route and the flight
            altitude, for the whole route or one flight at a time; the{' '}
            <strong>minimum clearance</strong>, where the flight passes closest to the terrain, is
            highlighted: green from 30 m, amber from 15 to 30 m and red below 15 m.
          </p>
        </>
      ),
    },
    {
      id: 'mapa',
      title: 'Legend and metrics',
      body: (
        <>
          <p>
            The <strong>Legend</strong>, in the bottom corner of the map and in the top corner of
            the 3D view, says what each layer is, with the symbol the map draws (in the 3D view, in
            the scene’s colours, with the terrain elevation scale and the vertical exaggeration),
            and shows or hides each one with its switch (lines, photos, bases, GCPs…; on the map,
            also the viewsheds).
          </p>
          <p>
            The <strong>Metrics</strong>, in a card on the right of the map, appear once there is a
            plan: the longest flight against the battery’s usable time (with a bar) and the quality,
            flight and operation of the open tab. The arrow collapses the card into a button with
            the GSD and the flights; on a narrow map it starts collapsed, and the choice is kept on
            this device. When you import an area or open a project, the map frames it below the
            drawing bar and to the left of the open card. With the area split into flights and the
            bases set, below the metrics is the <strong>Operation of the day</strong> button (the
            flights and the total time), which opens the field-day panel in their place.
          </p>
        </>
      ),
    },
    {
      id: 'operacao',
      title: 'Operation of the day and tablet',
      body: (
        <>
          <p>
            The <strong>Operation of the day</strong> opens from the button below the metrics, with
            the area split into flights and the bases set, and sits on the right of the map; while
            it is open, the metrics and the parameters panel are tucked away and the map shows only
            the mission. ✕ or <Kbd>Esc</Kbd> closes it. At the top, the battery sets needed against
            those of the team (“Set in the settings”), the total time with transit (and the mission
            time) and the longest flight against the usable time. Then <strong>Next</strong>: the
            first flight not yet done, with its base, the time with transit, the share of the
            battery, the furthest distance from the base and the take-off zone (amber when it was
            reduced); <strong>Show on the map</strong> frames the block and the base, and{' '}
            <strong>Mark done</strong> marks it as done. The <strong>Order of the day</strong> has
            one row per flight, in flying order (A-1, B-2, …), with the base and its sets, the bar
            of the time in the block and of the transit (lighter) against the usable time, with a
            tick at 90 %, the percentage and the furthest distance from the base; the row’s box
            marks and unmarks the flight, and the base shows it on the map. On the map, the flight
            in focus gets the block outline, a ring on the base and its label, and each flight done
            a tick. “Adjust the usable time” opens section 4 of the panel, where the usable time per
            flight is set for the day’s wind and cold.
          </p>
          <p>
            A flight is done when it has an <strong>End time</strong> in the field checklist’s{' '}
            <strong>Flight log</strong>: <strong>Mark done</strong> writes the current time there
            and unmarking clears it; when the log does not have the plan’s rows yet, they are added
            first, as “Import plan blocks” does. The panel and the checklist use the same log, kept
            in this browser with the mission’s checklist: what is marked in one shows in the other.
          </p>
          <p>
            On a narrow screen (a tablet, up to 1179 px wide) the header fits on one line, with 44
            px buttons: the app name only as the icon, and the settings, help and language in the{' '}
            <strong>⋮</strong> menu (on an upright tablet, the views too). The parameters panel is a
            sheet that collapses with the button next to the mode name; the <strong>Panel</strong>{' '}
            button at the bottom of the mode bar shows and hides it on any screen, and choosing a
            mode shows it. The metrics start collapsed into a button.
          </p>
        </>
      ),
    },
    {
      id: 'exportar',
      title: 'Export',
      children: [
        {
          id: 'kml',
          title: 'Area and block KML',
          body: (
            <>
              <p>
                <strong>Area KML</strong> — the outer ring of the polygon only, to draw the mission
                in Pilot 2: holes, secondary parts and disabled cells are left out (the button says
                so); GCPs have their own KML, and bases, zones and blocks the “Bases and blocks
                (KML)”.
              </p>
              <p>
                <strong>Block KMLs</strong> — one KML per block, the polygon only, for a Pilot 2
                mapping mission (the controller plans the route: check height, line angle and time):
                “All blocks (KML, ZIP)” (…_kml.zip, all loose) or “Blocks by base (KML, ZIP)”
                (…_kml-por-base.zip, one folder per base, with mapa/ holding the base, the zone and
                the blocks).
              </p>
            </>
          ),
        },
        {
          id: 'wpml',
          title: 'WPML (KMZ) and flights',
          body: (
            <>
              <p>
                <strong>WPML (KMZ)</strong> — executable mission with waypoints and automatic camera
                triggering; with blocks active it generates a ZIP with one KMZ per flight, each
                named after its flight (mission_area-tf_A-1.kmz, which is what Pilot 2 shows), in
                flight order.
              </p>
              <p>
                <strong>Export flights</strong> (card 7, Summary and export) — two matching pairs,
                KMZ and KML. KMZ: “All flights (KMZ, ZIP)” (…_voos.zip, all loose), “Flights by base
                (KMZ, ZIP)” (…_voos-por-base.zip, one folder per base: with several pilots, each
                takes the folders of their bases) or “One flight (KMZ)”; KML: each block’s polygon,
                all or by base (above). The header export button is a split button: its main part is
                the one at the end of card 7, the same button (with bases it downloads the ZIP by
                base, without bases the one with all flights, and the tooltip says which); the{' '}
                <strong>arrow</strong> next to it opens “Export area KML”, in every tab, and the
                other exports of the open tab, with the panel’s names, tooltips and actions — in the
                area, with the area split into flights, those of “Export flights” (except “One
                flight”, which needs the flight to be chosen); in the orbit, the KMZ per level; in
                the circular mode, the KMZ per block. The field checklist and the report carry a
                sheet per base (coordinates with a maps link, zone, reference elevation, flights
                with their files, batteries); “Bases and blocks (KML)” takes the bases, zones and
                blocks labelled with their flight to Google Earth or a phone. In the report, each
                base takes one line of the “Flights by base” table, with what every flight shares
                above it, and the full sheets open from the button below it; the report prints on
                A4, on white, without the top bar.
              </p>
            </>
          ),
        },
        {
          id: 'disparo',
          title: 'Manual and per-waypoint trigger',
          body: (
            <>
              <p>
                <strong>Manual trigger interval</strong> (card 3, “Flight lines, trigger and camera”
                drawer, “Trigger and camera” group) — in metres with “Distance” and “Waypoint”, in
                seconds with “Time”; the panel shows the resulting forward overlap and the file
                carries the typed value. <strong>Aircraft heading: fixed</strong> — every waypoint
                with the same heading, for obliques always facing the same way.
              </p>
              <p>
                <strong>Per-waypoint trigger</strong> — with “Trigger by: Waypoint”, each line is
                densified into waypoints at equal steps ≤ interval and every one carries a
                take-photo action (no distance trigger); the overshoot takes no photos. With “Follow
                terrain”, the photo points become part of the terrain-following route and each one
                takes the profile height at that spot. “Stop at waypoints” chooses between stopping
                only at line corners (default) or at every point.
              </p>
            </>
          ),
        },
        {
          id: 'projecto',
          title: 'Saving the project',
          body: (
            <p>
              The project auto-saves in the browser; use “Save/Open project” to archive it as a
              file. They are in card 1 and in the <strong>project menu</strong>, the mission name in
              the header, with “Rename”; next to the name, “saved”, or “not saved” when the browser
              refuses the automatic save. A file that does not open says why in card 1 and, when
              opened from the project menu, also below the header.
            </p>
          ),
        },
      ],
    },
    {
      id: 'seguranca',
      title: 'Safety actions',
      body: (
        <p>
          <strong>Safety actions</strong> (card 5 of the area; in the other modes, the “Safety
          actions” section — in the face and the orbit, inside “Take-off and safety”; the same for
          all) — <strong>At the end of the mission</strong>: return to home (RTH, the default),
          hover at the last point, land in place or go back to the first waypoint.{' '}
          <strong>Signal loss</strong>: stop the mission and return home (the default), land or
          hover; or continue the mission to the end without control (then the end action). They go
          into the KMZ of every flight, are kept in the project and listed in the field checklist;
          check in Pilot 2 that the return height clears the terrain. The{' '}
          <strong>take-off safety height</strong> and the <strong>return (RTH) height</strong> can
          be typed; empty, they are automatic (30 m; above the highest point of each flight, at
          least 100 m).
        </p>
      ),
    },
    {
      id: 'preflight',
      title: 'Preflight',
      body: (
        <p>
          The <strong>preflight</strong> (the pill in the header) opens its list over the map:
          blockers first, then warnings and notes; repeated warnings of the same kind (the zone
          reduced at several bases, flights far from their base) are gathered in a table, one row
          per base or flight. It closes with ✕ or <Kbd>Esc</Kbd>.
        </p>
      ),
    },
    {
      id: 'avisos',
      title: 'Warnings you must understand',
      body: (
        <>
          <p>
            <strong>“Standoff not verified against the terrain”</strong> (face mode) — without an
            imported local GeoTIFF, nothing validates the distance to the face: global tiles (~30 m)
            lack resolution at wall scale. “Import a GeoTIFF in Area and terrain”, in the warning
            itself, opens the Area tab. With a local DTM/DSM loaded, the app checks vertical and
            along-heading clearance and lists conflicting passes — raising the standoff clears it.
          </p>
          <p>
            <strong>“Split passes”</strong> (corridor) — where the centreline curves tighter than a
            pass's distance from it, the offset line would fold back on itself and the aircraft
            would fly a loop. The app splits the pass into runs instead of flying it folded, and
            reports how many split. Coverage there is narrower than the band drawn on the map, which
            always shows the <em>requested</em> width: ease the bend or reduce the half-width if you
            need continuous coverage.
          </p>
          <p>
            <strong>“GSD (frame centre)”</strong> — with an oblique gimbal the displayed GSD uses
            the slant range to the image centre (at −60° it is ~15 % worse than nadir); the upper
            frame edges are worse still. Line spacing stays nadir-based on purpose — the error is
            conservative (real overlap ≥ requested).
          </p>
        </>
      ),
    },
    {
      id: 'configuracao',
      title: 'Settings',
      body: (
        <p>
          <strong>Settings</strong> (gear in the header), in four sections with an index (aircraft
          and batteries, take-off zone, pilot, file and data) — per aircraft, the VLOS range and the
          battery types with the usable time per set and how many sets the team has (to flag
          missions that need more flights); the eye (1.7 m) and controller (1.5 m) heights for the
          viewsheds; stored in the browser, exported and imported as a file.
        </p>
      ),
    },
    {
      id: 'mudou',
      title: 'What changed',
      body: (
        <>
          <p>
            The project records the application version; when reopened with a newer one, card 1
            lists what changed in the plan since then (the square or flight with the same label may
            no longer be the same one). The same list:
          </p>
          {whatChanged('en')}
        </>
      ),
    },
    {
      id: 'acerca',
      title: t('help.about'),
      children: [
        {
          id: 'aplicacao',
          title: 'The application',
          body: (
            <p>
              Drone mapping mission planner: photogrammetry and LiDAR grids, battery-based block
              splitting, terrain following, GCP planning and KML/WPML export optimised for DJI Pilot
              2 (Mavic 3E, Matrice 4T, M300 RTK + P1 and custom profiles).
            </p>
          ),
        },
        {
          id: 'dados',
          title: 'Data and services',
          body: (
            <ul>
              <li>Satellite imagery and labels © Esri · OpenStreetMap contributors.</li>
              <li>
                Administrative boundaries: CAOP © Direção-Geral do Território, Portugal (CC-BY 4.0).
              </li>
              <li>Global elevation: Terrarium terrain tiles (Mapzen/AWS Open Data).</li>
              <li>
                High-resolution DTM: LiDAR survey of mainland Portugal © DGT (CC-BY 4.0), via
                GeoTIFF import.
              </li>
            </ul>
          ),
        },
        {
          id: 'aviso',
          title: t('disc.title'),
          body: (
            <>
              <p>
                This tool supports planning but does not replace validation in DJI Pilot 2 nor
                compliance with applicable UAS rules (Open category: max. 120 m AGL and visual line
                of sight). The pilot is always responsible for the operation. Check restriction
                zones and required authorisations before flying.
              </p>
              {onShowDisclaimer && (
                <button type="button" onClick={onShowDisclaimer} className={DISCLAIMER_LINK}>
                  Read the full disclaimer
                </button>
              )}
            </>
          ),
        },
      ],
    },
  ]
}

/** O botão que reabre o aviso, com aspecto de ligação. */
const DISCLAIMER_LINK =
  'mt-3 inline-flex min-h-[34px] items-center font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200'

/** Tópicos relacionados, no fim de cada um («Ver também»). */
const SEE_ALSO = {
  fluxo: ['painel', 'relevo', 'wpml'],
  painel: ['fluxo', 'mapa'],
  'tipo-area': ['desenhar', 'divisao'],
  'tipo-face': ['avisos', 'seguranca'],
  'tipo-orbita': ['wpml', 'seguranca'],
  'tipo-circular': ['tipo-area'],
  'tipo-corredor': ['avisos', 'divisao'],
  desenhar: ['tipo-area', 'divisao'],
  divisao: ['bases', 'configuracao'],
  bases: ['zona', 'atribuir', 'bacias'],
  zona: ['bases', 'configuracao', 'preflight'],
  atribuir: ['bases', 'divisao'],
  bacias: ['bases', 'configuracao'],
  relevo: ['bases', 'mapa'],
  mapa: ['relevo', 'painel', 'operacao'],
  operacao: ['mapa', 'divisao', 'bases'],
  kml: ['wpml'],
  wpml: ['kml', 'seguranca', 'projecto'],
  disparo: ['wpml'],
  projecto: ['mudou'],
  seguranca: ['wpml', 'preflight'],
  preflight: ['avisos', 'seguranca'],
  avisos: ['preflight', 'tipo-face', 'tipo-corredor'],
  configuracao: ['bases', 'bacias', 'divisao'],
  mudou: ['projecto'],
  aplicacao: ['dados', 'aviso'],
  dados: ['aplicacao'],
  aviso: ['aplicacao'],
}

/** Os elementos que separam o texto em blocos: a pesquisa não junta palavras de dois blocos. */
const BLOCKS = new Set(['p', 'li', 'ol', 'ul', 'h3'])

/**
 * O texto de um corpo, pela ordem em que se lê, com uma quebra entre blocos:
 * o que a pesquisa compara e cujos intervalos o realce percorre.
 * @param {any} node
 * @param {string[]} [out]
 */
function bodyText(node, out = []) {
  if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
  else if (Array.isArray(node)) for (const n of node) bodyText(n, out)
  else if (isValidElement(node)) {
    const el = /** @type {import('react').ReactElement<any>} */ (node)
    const block = typeof el.type === 'string' && BLOCKS.has(el.type)
    if (block) out.push('\n')
    bodyText(el.props.children, out)
    if (block) out.push('\n')
  }
  return out.join('')
}

/** Um texto com os intervalos [a, b) (em `at`, a posição dele no corpo) dentro de <mark>. */
function markText(text, at, ranges) {
  const end = at + text.length
  const parts = []
  let pos = at
  for (const [a, b] of ranges) {
    if (b <= pos || a >= end) continue
    const s = Math.max(a, pos)
    const e = Math.min(b, end)
    if (s > pos) parts.push(text.slice(pos - at, s - at))
    parts.push(
      <mark key={`m${s}`} className={MARK}>
        {text.slice(s - at, e - at)}
      </mark>,
    )
    pos = e
  }
  if (!parts.length) return text
  if (pos < end) parts.push(text.slice(pos - at))
  return parts
}

/** Realce de um termo encontrado. */
const MARK = 'rounded-[3px] bg-amber-300/30 px-px text-amber-50'

/**
 * O corpo com os intervalos `ranges` (do bodyText dele) realçados: o mesmo
 * percurso, com `state.off` a contar o texto já visto.
 * @param {any} node
 * @param {Array<[number, number]>} ranges
 * @param {{off: number}} state
 * @returns {any}
 */
function markTree(node, ranges, state) {
  if (typeof node === 'string' || typeof node === 'number') {
    const s = String(node)
    const out = markText(s, state.off, ranges)
    state.off += s.length
    return out
  }
  if (Array.isArray(node)) return node.map((n) => markTree(n, ranges, state))
  if (!isValidElement(node)) return node
  const el = /** @type {import('react').ReactElement<any>} */ (node)
  const block = typeof el.type === 'string' && BLOCKS.has(el.type)
  if (block) state.off += 1
  const kids = el.props.children
  const marked =
    kids === undefined
      ? el
      : Array.isArray(kids)
        ? cloneElement(el, undefined, ...kids.map((k) => markTree(k, ranges, state)))
        : cloneElement(el, undefined, markTree(kids, ranges, state))
  if (block) state.off += 1
  return marked
}

/** Os tópicos com corpo, pela ordem do índice, cada um com o seu grupo (ou null). */
function leavesOf(topics) {
  return topics.flatMap((x) =>
    x.children ? x.children.map((c) => ({ ...c, group: x })) : [{ ...x, group: null }],
  )
}

/**
 * Os tópicos que têm todas as palavras (no título ou no corpo) e quantas
 * vezes aparecem, por id; null sem pesquisa.
 * @param {string[]} terms
 * @param {Array<{id: string, title: string}>} leaves
 * @param {Map<string, string>} texts o bodyText de cada tópico
 * @returns {Map<string, number>|null}
 */
function hitsOf(terms, leaves, texts) {
  if (!terms.length) return null
  const out = new Map()
  for (const l of leaves) {
    const a = findTerms(l.title, terms).counts
    const b = findTerms(texts.get(l.id) ?? '', terms).counts
    if (terms.every((_, i) => a[i] + b[i] > 0))
      out.set(
        l.id,
        [...a, ...b].reduce((s, n) => s + n, 0),
      )
  }
  return out
}

/** A classe de uma entrada do índice. */
const navItem = (current, child) =>
  `flex min-h-[34px] w-full items-center gap-2 rounded-lg pr-2.5 text-left text-[13px] transition-colors ${
    child ? 'pl-11' : 'pl-8'
  } ${
    current
      ? 'bg-[#16223A] font-semibold text-slate-100'
      : 'font-medium text-slate-200 hover:bg-raised hover:text-slate-100'
  }`

/**
 * @param {{onClose: () => void, onShowDisclaimer?: (() => void)|null}} props
 */
export default function HelpModal({ onClose, onShowDisclaimer = null }) {
  const t = useT()
  const lang = useLang()
  const boxRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const searchRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const articleRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const navRef = useRef(/** @type {HTMLElement|null} */ (null))
  // com rato, o foco vai para a pesquisa; num ecrã táctil fica na janela,
  // para o teclado do ecrã não abrir sem se pedir
  const finePointer = useMedia('(pointer: fine)')
  useDialogFocus(boxRef, finePointer ? searchRef : undefined)

  const topics = useMemo(
    () => (lang === 'en' ? topicsEn : topicsPt)({ onShowDisclaimer, t }),
    [lang, onShowDisclaimer, t],
  )
  const leaves = useMemo(() => leavesOf(topics), [topics])
  const texts = useMemo(() => new Map(leaves.map((l) => [l.id, bodyText(l.body)])), [leaves])

  const [current, setCurrent] = useState('fluxo')
  const [query, setQuery] = useState('')
  // os grupos abertos no índice (com a pesquisa, abrem-se os que têm resultados)
  const [openGroups, setOpenGroups] = useState(() => new Set())

  const terms = useMemo(() => searchTerms(query), [query])
  const hits = useMemo(() => hitsOf(terms, leaves, texts), [terms, leaves, texts])

  const show = (id) => {
    setCurrent(id)
    const leaf = leaves.find((l) => l.id === id)
    if (leaf?.group) setOpenGroups((s) => new Set(s).add(leaf.group.id))
  }
  const search = (q) => {
    setQuery(q)
    // o tópico aberto fica se tiver as palavras; senão abre o primeiro que as tem
    const h = hitsOf(searchTerms(q), leaves, texts)
    const first = h?.size && !h.has(current) ? leaves.find((l) => h.has(l.id)) : null
    if (first) show(first.id)
  }
  /** Enter na pesquisa: o tópico seguinte com resultados. */
  const nextHit = () => {
    if (!hits?.size) return
    const ids = leaves.filter((l) => hits.has(l.id)).map((l) => l.id)
    show(ids[(ids.indexOf(current) + 1) % ids.length])
  }

  // Escape: com a pesquisa escrita, limpa-a; senão fecha a ajuda. Na captura,
  // antes das gavetas e da base seleccionada, que ficam por baixo
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      const input = searchRef.current
      if (input && e.target === input && input.value) {
        setQuery('')
        return
      }
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const noResults = hits != null && hits.size === 0
  const shown = noResults ? null : (leaves.find((l) => l.id === current) ?? leaves[0])

  // um tópico novo abre no princípio; com a pesquisa, no primeiro resultado
  useEffect(() => {
    const box = articleRef.current
    if (!box) return
    const first = box.querySelector('mark')
    if (first?.scrollIntoView) first.scrollIntoView({ block: 'center' })
    else box.scrollTop = 0
  }, [shown?.id, query])

  const bodyRanges = shown && terms.length ? findTerms(texts.get(shown.id), terms).ranges : []
  const body = !shown
    ? null
    : bodyRanges.length
      ? markTree(shown.body, bodyRanges, { off: 0 })
      : shown.body
  const title = !shown
    ? null
    : terms.length
      ? markText(shown.title, 0, findTerms(shown.title, terms).ranges)
      : shown.title

  // Setas no índice: a entrada anterior e a seguinte (Home e End, as pontas)
  const navKeys = (e) => {
    const items = [...(navRef.current?.querySelectorAll('button') ?? [])]
    const i = items.indexOf(/** @type {any} */ (document.activeElement))
    const to =
      e.key === 'ArrowDown'
        ? items[Math.min(items.length - 1, i + 1)]
        : e.key === 'ArrowUp'
          ? i <= 0
            ? searchRef.current
            : items[i - 1]
          : e.key === 'Home'
            ? items[0]
            : e.key === 'End'
              ? items[items.length - 1]
              : null
    if (!to) return
    e.preventDefault()
    to.focus()
  }

  const version = import.meta.env.APP_VERSION
  const totalHits = hits ? [...hits.values()].reduce((s, n) => s + n, 0) : 0
  const seeAlso = shown
    ? (SEE_ALSO[shown.id] ?? []).map((id) => leaves.find((l) => l.id === id)).filter(Boolean)
    : []

  return (
    <div className={`${BACKDROP} z-[3000] bg-[rgba(3,6,14,0.74)]`} onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        data-testid="help"
        tabIndex={-1}
        className={`${WINDOW} h-[816px] max-w-[1080px] border-slate-700`}
        onClick={(e) => e.stopPropagation()}
      >
        <WindowHeader
          id="help-title"
          inline
          className="py-[11px] pl-5 pr-3.5"
          icon={
            <Icon size={18} sw={1.8}>
              <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
              <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
            </Icon>
          }
          title={t('app.help')}
          subtitle={`DJI Mission Planner${version ? ` v${version}` : ''}`}
        >
          <CloseIconButton label={t('help.close')} title={t('help.closeTitle')} onClick={onClose} />
        </WindowHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[284px_minmax(0,1fr)] md:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-slate-800 bg-slate-950 md:border-b-0 md:border-r">
            <div className="px-3 pb-2.5 pt-3.5">
              <label className="relative flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-field px-2.5 text-slate-400 focus-within:border-sky-400">
                <Icon size={16}>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </Icon>
                <span className="sr-only">{t('help.search')}</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder={t('help.searchPlaceholder')}
                  aria-describedby="help-search-status"
                  onChange={(e) => search(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      nextHit()
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      navRef.current?.querySelector('button')?.focus()
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] text-slate-100 outline-none placeholder:text-slate-500"
                />
              </label>
              <p
                id="help-search-status"
                role="status"
                className={`m-0 px-1 text-xs text-slate-400 ${hits ? 'mt-2' : 'sr-only'}`}
              >
                {hits
                  ? hits.size
                    ? t('help.results', {
                        results: tCount(t, 'help.resultCount', totalHits, { n: totalHits }),
                        topics: tCount(t, 'help.topicCount', hits.size, { n: hits.size }),
                      })
                    : t('help.noResults', { q: query.trim() })
                  : ''}
              </p>
            </div>
            <nav
              ref={navRef}
              aria-label={t('help.topics')}
              onKeyDown={navKeys}
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-3.5 pt-0.5"
            >
              {topics.map((x) => {
                if (!x.children) {
                  if (hits && !hits.has(x.id)) return null
                  const on = shown?.id === x.id
                  return (
                    <button
                      key={x.id}
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => show(x.id)}
                      className={navItem(on, false)}
                    >
                      <span className="flex-1">{x.title}</span>
                      {hits && (
                        <span aria-hidden="true" className="text-xs font-medium text-slate-400">
                          {hits.get(x.id)}
                        </span>
                      )}
                    </button>
                  )
                }
                const kids = hits ? x.children.filter((c) => hits.has(c.id)) : x.children
                if (!kids.length) return null
                const expanded = hits != null || openGroups.has(x.id)
                const hasCurrent = kids.some((c) => c.id === shown?.id)
                return (
                  <div key={x.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`help-group-${x.id}`}
                      onClick={() =>
                        setOpenGroups((s) => {
                          const n = new Set(s)
                          if (n.has(x.id)) n.delete(x.id)
                          else n.add(x.id)
                          return n
                        })
                      }
                      className={`flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-raised ${
                        hasCurrent ? 'text-slate-100' : 'text-slate-200'
                      }`}
                    >
                      <IconChevronRight
                        className={`h-3.5 w-3.5 flex-none text-slate-400 transition-transform ${
                          expanded ? 'rotate-90' : ''
                        }`}
                      />
                      <span className="flex-1">{x.title}</span>
                      <span aria-hidden="true" className="text-xs font-medium text-slate-400">
                        {hits ? kids.reduce((s, c) => s + hits.get(c.id), 0) : kids.length}
                      </span>
                    </button>
                    {expanded && (
                      <div
                        id={`help-group-${x.id}`}
                        role="group"
                        aria-label={x.title}
                        className="mb-1 mt-0.5 flex flex-col gap-0.5"
                      >
                        {kids.map((c) => {
                          const on = shown?.id === c.id
                          return (
                            <button
                              key={c.id}
                              type="button"
                              aria-current={on ? 'true' : undefined}
                              onClick={() => show(c.id)}
                              className={navItem(on, true)}
                            >
                              <span className="flex-1">{c.title}</span>
                              {hits && (
                                <span
                                  aria-hidden="true"
                                  className="text-xs font-medium text-slate-400"
                                >
                                  {hits.get(c.id)}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>

          <div ref={articleRef} className="min-h-0 overflow-y-auto px-5 py-5 md:px-10">
            {shown ? (
              <article
                aria-labelledby="help-topic"
                data-testid="help-topic"
                className="max-w-[700px] text-sm leading-[1.65] text-slate-200 [&_h3]:mb-1.5 [&_h3]:mt-[22px] [&_h3]:text-[14.5px] [&_h3]:font-semibold [&_h3]:text-slate-100 [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_p]:mt-2 [&_strong]:font-semibold [&_strong]:text-slate-100 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
              >
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {t('app.help')}
                  {shown.group && (
                    <>
                      <IconChevronRight className="h-3 w-3" />
                      {shown.group.title}
                    </>
                  )}
                </div>
                <h2
                  id="help-topic"
                  className="m-0 mt-1.5 text-xl font-semibold leading-snug tracking-[-0.01em] text-slate-100"
                >
                  {title}
                </h2>
                {body}
                {seeAlso.length > 0 && (
                  <div className="mt-5 border-t border-slate-800 pt-3.5">
                    <div className="text-xs text-slate-400">{t('help.seeAlso')}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {seeAlso.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => show(l.id)}
                          className="inline-flex h-[34px] items-center rounded-full border border-slate-700 bg-surface px-3 text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised"
                        >
                          {l.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ) : (
              <div className="max-w-[700px] pt-6 text-sm leading-relaxed text-slate-300">
                <p className="m-0 text-[15px] font-semibold text-slate-100">
                  {t('help.noResults', { q: query.trim() })}
                </p>
                <p className="m-0 mt-1.5 text-slate-400">{t('help.noResultsHint')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
