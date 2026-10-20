/** Preflight: mensagens dos itens de src/mission/preflight.js (chave = preflight.<code>). */
export default {
  'preflight.title': { pt: 'Preflight', en: 'Preflight' },
  'app.exportBlockedHint': {
    pt: 'Exportação bloqueada pelo preflight: veja a lista no botão «Preflight» do cabeçalho.',
    en: 'Export blocked by the preflight: see the list under the “Preflight” button in the header.',
  },
  'preflight.ok': { pt: 'Pronto a exportar', en: 'Ready to export' },
  'preflight.summary': {
    pt: '{b} {bw}, {w} {ww}',
    en: '{b} {bw}, {w} {ww}',
  },
  'preflight.word.blocker': { pt: 'bloqueio', en: 'blocker' },
  'preflight.word.blockers': { pt: 'bloqueios', en: 'blockers' },
  'preflight.word.warning': { pt: 'aviso', en: 'warning' },
  'preflight.word.warnings': { pt: 'avisos', en: 'warnings' },
  'preflight.noPlanArea': {
    pt: 'sem plano: defina a área (cartão 2)',
    en: 'no plan: define the area (card 2)',
  },
  'preflight.noPlan': { pt: 'sem plano ainda', en: 'no plan yet' },
  'preflight.pillTitle': {
    pt: 'Verificação única antes de exportar: bloqueios, avisos e lembretes da missão activa',
    en: 'Single check before exporting: blockers, warnings and reminders for the active mission',
  },
  'preflight.no-plan': {
    pt: 'Sem plano de voo: defina a área, o eixo, o pé da face ou o POI.',
    en: 'No flight plan yet: define the area, axis, baseline or POI.',
  },
  'preflight.plan-error': {
    pt: 'O plano tem um erro: {error} Corrija-o antes de exportar.',
    en: 'The plan has an error: {error} Fix it before exporting.',
  },
  'preflight.photo-pass-unverified': {
    pt: 'Foto por waypoint sem paragem: ainda não foi confirmado em voo que o Pilot 2 dispara ao passar pelo ponto. Confira o número de fotos no primeiro voo, ou escolha «Paragem nos waypoints: Em todos».',
    en: 'Photo per waypoint without stopping: it is not yet confirmed in flight that Pilot 2 fires while passing the point. Check the photo count on the first flight, or choose “Stop at waypoints: At every waypoint”.',
  },
  'preflight.terrain-not-loaded': {
    pt: '«Seguir terreno» está ligado mas não há relevo a cobrir a área; sem ele o KMZ sairia com altura constante, sem seguir o relevo.',
    en: '“Follow terrain” is on but no elevation data covers the area; without it the KMZ would carry a constant height, not following the terrain.',
  },
  'preflight.terrain-loading': {
    pt: 'A descarregar o relevo da rota; a exportação fica disponível quando terminar.',
    en: 'Downloading terrain for the route; export becomes available when it finishes.',
  },
  'preflight.terrain-download-error': {
    pt: 'Não há relevo sob a rota: a descarga falhou ({msg}). Volta a tentar sozinha; pode também tentar já ou importar um MDT.',
    en: 'No terrain under the route: the download failed ({msg}). It retries on its own; you can also retry now or import a DTM.',
  },
  'preflight.terrain-file-outside': {
    pt: 'O MDT importado não chega a toda a rota (o ficheiro acaba antes dela). Importe um MDT que a cubra, ou use o relevo global (~30 m).',
    en: 'The imported DTM does not reach the whole route (the file ends before it). Import a DTM that covers it, or use the global terrain (~30 m).',
  },
  'preflight.terrain-file-error': {
    pt: 'Não há relevo sob a rota: a leitura do MDT importado falhou ({msg}). Importe outro ficheiro ou use o relevo global (~30 m).',
    en: 'No terrain under the route: reading the imported DTM failed ({msg}). Import another file or use the global terrain (~30 m).',
  },
  'preflight.terrain-missing': {
    pt: 'Não há relevo sob a rota: sem ele não se sabe a que altura do solo se voa. Descarregue o relevo global ou importe um MDT que a cubra.',
    en: 'No terrain under the route: without it the height above ground is unknown. Download the global terrain or import a DTM that covers it.',
  },
  'preflight.terrain-error': {
    pt: 'O seguimento do terreno falhou: {msg}',
    en: 'Terrain following failed: {msg}',
  },
  'preflight.too-many-waypoints': {
    pt: '{n} waypoints numa rota excede o limite WPML de {max}: divida a missão em blocos.',
    en: '{n} waypoints in one route exceeds the WPML limit of {max}: split the mission into blocks.',
  },
  'preflight.waypoints-many': {
    pt: '{n} waypoints numa só rota: o Pilot 2 importa lentamente; considere dividir em blocos.',
    en: '{n} waypoints in one route: Pilot 2 imports slowly; consider splitting into blocks.',
  },
  'preflight.agl-cap': {
    pt: 'Altura de {worst} m acima do tecto AGL do payload ({cap} m): baixe a altura de voo ou escolha outro payload.',
    en: 'Height of {worst} m above the payload AGL ceiling ({cap} m): lower the flight height or choose another payload.',
  },
  'preflight.shutter': {
    pt: 'Intervalo de disparo de {s} s, abaixo do intervalo mínimo da câmara ({min} s): reduza a velocidade para ≤ {vmax} m/s ou baixe a sobreposição frontal.',
    en: 'Trigger interval of {s} s, below the camera’s minimum interval ({min} s): reduce speed to ≤ {vmax} m/s or lower the forward overlap.',
  },
  'preflight.battery': {
    pt: 'Tempo estimado de {min} min excede o tempo útil por voo ({usable} min, já com a reserva de aterragem): divida em blocos.',
    en: 'Estimated {min} min exceeds the usable time per flight ({usable} min, landing reserve included): split into blocks.',
  },
  'preflight.battery-block': {
    pt: 'Voo {flight}: {min} min excede o tempo útil por voo ({usable} min, já com a reserva de aterragem). Reduza o lado do quadrado, divida mais ou aumente a velocidade.',
    en: 'Flight {flight}: {min} min exceeds the usable time per flight ({usable} min, landing reserve included). Reduce the square side, split further or raise the speed.',
  },
  'preflight.battery-block-base': {
    pt: 'Voo {flight} (bloco {id}, base {base}): {min} min com {transit} min de deslocação de ida e volta do pior ponto da zona excede o tempo útil por voo ({usable} min). Aproxime a base ou reduza o lado do bloco.',
    en: 'Flight {flight} (block {id}, base {base}): {min} min including {transit} min of round-trip transit from the worst point of the zone exceeds the usable time per flight ({usable} min). Move the base closer or reduce the block side.',
  },
  'preflight.block-base-unreachable': {
    pt: 'Voo {flight} (bloco {id}): só a deslocação de ida e volta da base {base} leva {min} min, acima dos {usable} min úteis de um conjunto de baterias. Mude a base deste bloco.',
    en: 'Flight {flight} (block {id}): the round trip from base {base} alone takes {min} min, above the {usable} usable minutes of one battery set. Change this block’s base.',
  },
  'preflight.block-vlos': {
    pt: 'Voo {flight} (bloco {id}) longe demais da base {base} para VLOS: {m} m no pior caso (descolando na orla da zona), acima da distância VLOS da aeronave ({vlos} m). Mude a base do bloco ou aproxime-a.',
    en: 'Flight {flight} (block {id}) beyond visual line of sight from base {base}: {m} m in the worst case (taking off at the edge of the zone), above the aircraft’s VLOS range ({vlos} m). Change the block’s base or move it closer.',
  },
  'preflight.block-viewshed': {
    pt: 'Voo {flight}: {pct} % do bloco fica atrás do relevo visto da base {base}, tapado a ~{m} m. A aeronave sai da vista do piloto: mude ou suba a base, ou confirme no campo (bacias de visão no mapa).',
    en: 'Flight {flight}: {pct} % of the block is behind the terrain seen from base {base}, blocked at ~{m} m. The aircraft leaves the pilot’s sight: move or raise the base, or check in the field (viewsheds on the map).',
  },
  'preflight.block-viewshed-minor': {
    pt: 'Voo {flight}: {pct} % do bloco fica atrás do relevo visto da base {base} (tapado a ~{m} m).',
    en: 'Flight {flight}: {pct} % of the block is behind the terrain seen from base {base} (blocked at ~{m} m).',
  },
  'preflight.block-radio': {
    pt: 'Voo {flight}: {pct} % do bloco com o sinal de rádio em risco visto da base {base}: à vista, mas o relevo entra na zona de Fresnel (60 % a 2,4 GHz) a ~{m} m. Pode perder a ligação do comando: suba o comando ou a base, ou confirme no campo.',
    en: 'Flight {flight}: {pct} % of the block with the radio signal at risk from base {base}: in sight, but the terrain enters the Fresnel zone (60 % at 2.4 GHz) at ~{m} m. The controller link may drop: raise the controller or the base, or check in the field.',
  },
  'preflight.block-radio-minor': {
    pt: 'Voo {flight}: {pct} % do bloco com o sinal de rádio em risco visto da base {base} (relevo na zona de Fresnel a ~{m} m).',
    en: 'Flight {flight}: {pct} % of the block with the radio signal at risk from base {base} (terrain in the Fresnel zone at ~{m} m).',
  },
  'preflight.block-no-base': {
    pt: 'Voo {flight} (bloco {id}) sem base: não se sabe de onde descola nem a que cota se referem as alturas.',
    en: 'Flight {flight} (block {id}) has no base: neither the take-off point nor the reference elevation of its heights is known.',
  },
  'preflight.base-zone-no-terrain': {
    pt: 'A base {base} está fora do relevo carregado: as alturas dos voos {flights} não têm cota de referência conhecida (assumiu-se a mínima de cada bloco). Mova a base para dentro do relevo ou carregue relevo que a cubra.',
    en: 'Base {base} is outside the loaded elevation data: flights {flights} have no known reference elevation (each block’s lowest point was assumed). Move the base inside the elevation data or load terrain that covers it.',
  },
  'preflight.base-zone-reduced': {
    pt: 'Zona da base {base} reduzida a {r} m (pedidos {req} m): {relief} m de desnível a {at} m da base. Descole a menos de {r} m do ponto marcado.',
    en: 'Zone of base {base} reduced to {r} m ({req} m requested): {relief} m of relief at {at} m from the base. Take off within {r} m of the marked point.',
  },
  'preflight.base-zone-drop': {
    pt: 'Zona da base {base} reduzida a {r} m (pedidos {req} m): {relief} m de desnível a {at} m da base. Descolar até {req} m do ponto pode pôr o voo {drop} m mais baixo do que o planeado: descole a menos de {r} m, ou mova a base para um sítio plano.',
    en: 'Zone of base {base} reduced to {r} m ({req} m requested): {relief} m of relief at {at} m from the base. Taking off up to {req} m from the point may fly {drop} m lower than planned: take off within {r} m, or move the base to flat ground.',
  },
  'preflight.base-zone-zero': {
    pt: 'A zona da base {base} ficou sem raio: já a {at} m do ponto há {relief} m de desnível, e descolar até {req} m pode pôr o voo {drop} m mais baixo. Descole no ponto marcado, ou mova a base para um sítio plano.',
    en: 'The zone of base {base} has no radius left: {relief} m of relief already at {at} m from the point, and taking off up to {req} m away may fly {drop} m lower. Take off at the marked point, or move the base to flat ground.',
  },
  'preflight.route-vlos': {
    pt: 'A rota chega a {m} m da base no pior ponto da zona, acima da distância VLOS da aeronave ({vlos} m). Mova a base, divida a área em blocos com bases, ou voe com observadores.',
    en: 'The route reaches {m} m from the base at the worst point of the zone, beyond the aircraft’s VLOS range ({vlos} m). Move the base, split the area into blocks with bases, or fly with observers.',
  },
  'preflight.terrain-datum-ellipsoidal': {
    pt: 'O MDT declara alturas elipsoidais ({model}): as alturas relativas continuam certas, mas não compare cotas deste ficheiro com fontes ortométricas.',
    en: 'The DTM declares ellipsoidal heights ({model}): relative heights are still right, but do not compare its elevations with orthometric sources.',
  },
  'preflight.overlap-uncertain': {
    pt: 'No pior caso do posicionamento {mode} e do relevo, a sobreposição cai para {front} % frontal / {side} % lateral, abaixo do mínimo habitual (60 / 50 %).',
    en: 'In the worst case of {mode} positioning and relief, overlap drops to {front} % forward / {side} % side, below the usual minimum (60 / 50 %).',
  },
  'preflight.blur': {
    pt: 'A esta velocidade o arrastamento a 1/500 s é de {px} px ({cm} cm): fixe uma exposição mais curta ou reduza a velocidade.',
    en: 'At this speed the motion blur at 1/500 s is {px} px ({cm} cm): use a shorter exposure or reduce speed.',
  },
  'preflight.route-duplicate-waypoint': {
    pt: 'A rota tem {n} par(es) de waypoints consecutivos a menos de 0,5 m (o primeiro no voo {flight}, em {lat}, {lon}), o mínimo do SDK da DJI entre waypoints: afaste ou retire um dos pontos.',
    en: 'The route has {n} pair(s) of consecutive waypoints closer than 0.5 m (the first on flight {flight}, at {lat}, {lon}), the DJI SDK minimum between waypoints: move or remove one of the points.',
  },
  'preflight.route-climb-rate': {
    pt: 'Subida de {rate} m/s exigida no voo {flight}, a partir de {lat}, {lon} ({n} segmento(s) acima da velocidade máxima de subida da aeronave): a rota vai atrasar-se ou o Pilot 2 vai suavizá-la. Reduza a velocidade ou a tolerância do seguimento de terreno.',
    en: 'Climb of {rate} m/s required on flight {flight}, from {lat}, {lon} ({n} segment(s) above the aircraft’s maximum climb rate): the route will lag or Pilot 2 will smooth it. Reduce the speed or the terrain-following tolerance.',
  },
  'preflight.route-long-segment': {
    pt: 'Segmento de {km} km no voo {flight}, a partir de {lat}, {lon}: confirme que o segmento atravessa terreno seguro à altura de deslocação.',
    en: '{km} km segment on flight {flight}, from {lat}, {lon}: confirm the segment crosses safe terrain at transit height.',
  },
  'preflight.base-far': {
    pt: 'Base a {km} km da área: a deslocação conta na bateria e o regresso tem de a cobrir. Confirme que é o ponto real de descolagem.',
    en: 'Base {km} km from the area: the transit counts against the battery and the return has to cover it. Confirm it is the real take-off point.',
  },
  'preflight.base-unreachable': {
    pt: 'Base a {km} km da área: só a deslocação de ida e volta leva {min} min, acima dos {usable} min úteis de um conjunto de baterias. Mova a base para junto da área.',
    en: 'Base {km} km from the area: the round trip alone takes {min} min, above the {usable} usable minutes of one battery set. Move the base next to the area.',
  },
  'preflight.base-no-terrain': {
    pt: 'A base está fora do relevo carregado: assumiu-se a descolagem à cota mínima da área ({elev} m) no perfil, na vista 3D, na folga ao solo e no seguimento de terreno. Mova a base para dentro do relevo para ter alturas exactas.',
    en: 'The base is outside the loaded elevation data: take-off is assumed at the lowest elevation of the area ({elev} m) for the profile, the 3D view, the ground clearance and terrain following. Move the base inside the elevation data for exact heights.',
  },
  'preflight.no-base-relief': {
    pt: 'Sem base numa área com {relief} m de desnível: assumiu-se a descolagem à cota mínima ({elev} m), o lado seguro. A descolar mais alto a rota fica mais alta do que o planeado (GSD pior); a descolar fora e abaixo da área, mais baixa. Marque a base para ter alturas exactas.',
    en: 'No base in an area with {relief} m of relief: take-off is assumed at the lowest elevation ({elev} m), the safe side. Taking off higher puts the route higher than planned (worse GSD); taking off outside and below the area, lower. Mark the base for exact heights.',
  },
  'preflight.terrain-collision': {
    pt: 'A rota entra no relevo: {m} m abaixo do solo no pior ponto. Suba a altura de voo ou ligue «Seguir terreno».',
    en: 'The route goes into the terrain: {m} m below ground at the worst point. Raise the flight height or turn on “Follow terrain”.',
  },
  'preflight.clearance-low': {
    pt: 'Folga mínima ao solo de {m} m, abaixo de 15 m. Suba a altura de voo ou ligue «Seguir terreno».',
    en: 'Minimum ground clearance of {m} m, below 15 m. Raise the flight height or turn on “Follow terrain”.',
  },
  'preflight.terrain-holes': {
    pt: 'Sem relevo em {n} de {total} pontos da rota ({pct} %), o primeiro em {lat}, {lon}: a rota atravessa um buraco do modelo (tile em falta ou zona sem dados do MDT), onde o seguimento de terreno e a folga ao solo não sabem a que altura do solo se voa. Volte a carregar o relevo ou importe um MDT que cubra a rota.',
    en: 'No elevation data at {n} of {total} route points ({pct} %), the first at {lat}, {lon}: the route crosses a hole in the model (a missing tile or a no-data area of the DTM), where terrain following and ground clearance cannot know the height above ground. Reload the elevation data or import a DTM that covers the route.',
  },
  'preflight.transit-collision': {
    pt: 'A deslocação entre a base e a rota (voo {flight}) entra no relevo: {m} m abaixo do solo a {h} m acima da base. A aeronave sobe na descolagem à altura do 1.º waypoint (ou à altura de segurança na descolagem) e voa a direito até ele; no fim regressa a {rth} m acima da descolagem (RTH, escrito no KMZ). Mova a base para o lado de cá do relevo ou aproxime-a da rota, suba a altura de voo, ou comece a rota noutro ponto.',
    en: 'The transit between the base and the route (flight {flight}) goes into the terrain: {m} m below ground at {h} m above the base. The aircraft climbs at take-off to the first waypoint’s height (or the take-off safety height) and flies straight to it; at the end it returns at {rth} m above take-off (the RTH written in the KMZ). Move the base to this side of the terrain or closer to the route, raise the flight height, or start the route elsewhere.',
  },
  'preflight.transit-low': {
    pt: 'Folga mínima de {m} m na deslocação entre a base e a rota (voo {flight}, a {h} m acima da base), abaixo de 15 m.',
    en: 'Minimum clearance of {m} m on the transit between the base and the route (flight {flight}, at {h} m above the base), below 15 m.',
  },
  'preflight.base-zone-partial': {
    pt: 'A zona da base {base} tem {n} pontos sem relevo: a cota mínima e o desnível só contam a parte com dados. Carregue relevo que cubra a zona inteira.',
    en: 'The take-off zone of base {base} has {n} points without elevation data: the minimum elevation and relief only count the covered part. Load elevation data that covers the whole zone.',
  },
  'preflight.gimbal-range': {
    pt: 'Inclinação do gimbal de {worst}° pedida fora do que o payload alcança ({min}° a {max}°): o KMZ sai recortado ao limite. Ajuste a inclinação.',
    en: 'Gimbal pitch of {worst}° requested outside what the payload reaches ({min}° to {max}°): the KMZ is clamped to the limit. Adjust the pitch.',
  },
  'preflight.no-base': {
    pt: 'Sem ponto de base: a deslocação não conta para a bateria e as alturas referem-se à cota mínima do relevo debaixo da rota.',
    en: 'No base point: transit is not counted against the battery and heights refer to the minimum terrain elevation under the route.',
  },
  'preflight.unverified-combo': {
    pt: 'Primeiro voo desta combinação ({aircraft} + {payload}, {mode}): ainda não há KMZ confirmado no Pilot 2. No primeiro voo conte as fotos, confira as alturas e a lente, e registe na matriz de compatibilidade (manual de QA, §16 «Primeiro voo de cada modo»).',
    en: 'First flight of this combination ({aircraft} + {payload}, {mode}): no KMZ confirmed in Pilot 2 yet. On the first flight count the photos, check the heights and the lens, and record it in the compatibility matrix (QA manual, §16 “First flight of each mode”).',
  },
  'preflight.open-category-rth': {
    pt: 'O regresso (RTH) a {rth} m acima da descolagem passa os {cap} m da categoria aberta junto à base.',
    en: 'The return (RTH) at {rth} m above take-off exceeds the {cap} m of the Open category near the base.',
  },
  'preflight.face-unverified': {
    pt: 'Afastamento à face não verificado contra o terreno: sem MDT/MDS local, os tiles globais não têm resolução à escala de uma face. Importe um GeoTIFF no separador Área, cartão 2 (Área e relevo), para a verificação de folga.',
    en: 'Face standoff not verified against the terrain: without a local DTM/DSM, global tiles lack resolution at face scale. Import a GeoTIFF in the Area tab, card 2 (Area and terrain), for the clearance check.',
  },
  'preflight.face-clearance': {
    pt: 'O corredor de voo junto à face corta a superfície do modelo local (MDT/MDS) nas passagens {passes} (folga mínima {min} m): aumente o afastamento ou, conscientemente, reduza a «Folga mínima».',
    en: 'The face flight corridor clips the local model surface (DTM/DSM) on passes {passes} (minimum clearance {min} m): raise the standoff or knowingly lower the “Minimum clearance”.',
  },
  'preflight.corridor-uncovered': {
    pt: '{n} passagem(ns) do corredor sem cobertura: a curvatura do eixo é mais apertada do que a distância ao eixo e o KMZ não cobre a largura pedida aí. Reduza a meia-largura, suavize a curva ou voe essa passagem à parte.',
    en: '{n} corridor pass(es) without coverage: the centreline curves tighter than the pass distance and the KMZ leaves the requested width uncovered there. Reduce the half-width, ease the bend, or fly that pass separately.',
  },
  'preflight.open-category-agl': {
    pt: 'A rota chega a {max} m acima do solo. O máximo na categoria aberta é {cap} m; acima disso é preciso voar na categoria específica, com autorização operacional.',
    en: 'The route reaches {max} m above ground. The Open category maximum is {cap} m; above that you need to fly in the Specific category, with an operational authorisation.',
  },
  'preflight.heights-relative': {
    pt: 'As alturas do KMZ são relativas ao ponto de descolagem: descole na base marcada (ou dentro da zona dela). Sem base, o plano assume a cota mínima da área: descolar mais alto sobe a rota.',
    en: 'KMZ heights are relative to the take-off point: take off at the marked base (or inside its zone). Without a base the plan assumes the area’s lowest elevation: taking off higher raises the route.',
  },

  /* ---- Descolagem da face e da órbita numa base ---- */
  'preflight.takeoff-base-missing': {
    pt: 'Descolagem na base {base}: a base já não existe no projecto. Escolha outra descolagem.',
    en: 'Take-off at base {base}: the base is no longer in the project. Choose another take-off.',
  },
  'preflight.takeoff-terrain-missing': {
    pt: 'Descolagem na base {base}: sem relevo carregado, as alturas não se convertem para a base.',
    en: 'Take-off at base {base}: with no terrain loaded, the heights cannot be converted to the base.',
  },
  'preflight.takeoff-ref-outside-terrain': {
    pt: 'Descolagem na base {base}: o relevo carregado não cobre a base e o alvo.',
    en: 'Take-off at base {base}: the loaded terrain does not cover both the base and the target.',
  },
}
