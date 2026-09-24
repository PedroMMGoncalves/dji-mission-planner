/** Preflight: mensagens dos itens de src/mission/preflight.js (chave = preflight.<code>). */
export default {
  'preflight.title': { pt: 'Preflight', en: 'Preflight' },
  'preflight.ok': { pt: 'Pronto a exportar', en: 'Ready to export' },
  'preflight.summary': {
    pt: '{b} bloqueios, {w} avisos',
    en: '{b} blockers, {w} warnings',
  },
  'preflight.pillTitle': {
    pt: 'Verificação única antes de exportar: bloqueios, avisos e lembretes da missão activa',
    en: 'Single check before exporting: blockers, warnings and reminders for the active mission',
  },
  'preflight.no-plan': {
    pt: 'Sem plano de voo: defina a área, o eixo, a linha de base ou o POI.',
    en: 'No flight plan yet: define the area, axis, baseline or POI.',
  },
  'preflight.plan-error': {
    pt: 'O plano tem um erro ({error}); corrija-o antes de exportar.',
    en: 'The plan has an error ({error}); fix it before exporting.',
  },
  'preflight.terrain-photo-waypoint': {
    pt: 'Seguir terreno e foto por waypoint não podem coexistir: escolha disparo por distância ou desligue o terreno.',
    en: 'Follow terrain and photo-per-waypoint cannot coexist: choose distance triggering or turn terrain off.',
  },
  'preflight.photo-pass-unverified': {
    pt: 'Foto por waypoint sem paragem: ainda não foi confirmado em voo que o Pilot 2 dispara ao passar pelo ponto. Confira o número de fotos no primeiro voo, ou escolha «Paragem nos waypoints: Em todos».',
    en: 'Photo per waypoint without stopping: it is not yet confirmed in flight that Pilot 2 fires while passing the point. Check the photo count on the first flight, or choose "Stop at waypoints: At every waypoint".',
  },
  'preflight.terrain-not-loaded': {
    pt: 'Seguir terreno está ligado mas não há relevo a cobrir a área; sem ele o KMZ sairia com alturas planas.',
    en: 'Follow terrain is on but no elevation data covers the area; without it the KMZ would carry flat heights.',
  },
  'preflight.terrain-error': {
    pt: 'Seguir terreno falhou: {msg}',
    en: 'Follow terrain failed: {msg}',
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
    pt: 'Altura de {worst} m acima do tecto AGL do payload ({cap} m).',
    en: 'Height of {worst} m above the payload AGL ceiling ({cap} m).',
  },
  'preflight.shutter': {
    pt: 'Intervalo entre fotos de {s} s abaixo do mínimo do obturador ({min} s); velocidade máxima {vmax} m/s.',
    en: 'Photo interval of {s} s below the shutter minimum ({min} s); maximum speed {vmax} m/s.',
  },
  'preflight.battery': {
    pt: 'Tempo estimado de {min} min excede o útil de uma bateria ({usable} min com reserva): divida em blocos.',
    en: 'Estimated {min} min exceeds one battery’s usable time ({usable} min with reserve): split into blocks.',
  },
  'preflight.battery-block': {
    pt: 'Bloco {id}: {min} min excede o útil de uma bateria ({usable} min com reserva).',
    en: 'Block {id}: {min} min exceeds one battery’s usable time ({usable} min with reserve).',
  },
  'preflight.terrain-datum-ellipsoidal': {
    pt: 'O MDT declara alturas elipsoidais ({model}): as alturas relativas continuam certas, mas não compare cotas deste ficheiro com fontes ortométricas.',
    en: 'The DTM declares ellipsoidal heights ({model}): relative heights are still right, but do not compare its elevations with orthometric sources.',
  },
  'preflight.overlap-uncertain': {
    pt: 'No pior caso do posicionamento {mode} e do relevo, a sobreposição cai para {front} % frontal / {side} % lateral, abaixo do mínimo habitual (60/50 %).',
    en: 'In the worst case of {mode} positioning and relief, overlap drops to {front} % front / {side} % side, below the usual minimum (60/50 %).',
  },
  'preflight.blur': {
    pt: 'A esta velocidade o arrastamento a 1/500 s é de {px} px ({cm} cm): fixe uma exposição mais curta ou reduza a velocidade.',
    en: 'At this speed the motion blur at 1/500 s is {px} px ({cm} cm): use a shorter exposure or reduce speed.',
  },
  'preflight.route-duplicate-waypoint': {
    pt: 'A rota tem {n} par(es) de waypoints consecutivos a menos de 0,5 m (primeiro no índice {at}); a DJI exige pelo menos 0,5 m entre waypoints.',
    en: 'The route has {n} pair(s) of consecutive waypoints closer than 0.5 m (first at index {at}); DJI requires at least 0.5 m between waypoints.',
  },
  'preflight.route-climb-rate': {
    pt: 'Subida de {rate} m/s exigida no segmento {at} ({n} segmento(s) acima da aeronave): a rota vai atrasar-se ou o Pilot 2 vai suavizá-la.',
    en: 'Climb of {rate} m/s required at segment {at} ({n} segment(s) above the aircraft): the route will lag or Pilot 2 will smooth it.',
  },
  'preflight.route-long-segment': {
    pt: 'Segmento de {km} km (índice {at}): confirme que a ligação atravessa terreno seguro à altura de trânsito.',
    en: '{km} km segment (index {at}): confirm the link crosses safe terrain at transit height.',
  },
  'preflight.base-far': {
    pt: 'Base a {km} km da área: o trânsito conta na bateria e o regresso tem de o cobrir. Confirme que é o ponto real de descolagem.',
    en: 'Home point {km} km from the area: the transit counts against the battery and the return has to cover it. Confirm it is the real take-off point.',
  },
  'preflight.base-unreachable': {
    pt: 'Base a {km} km da área: só o trânsito de ida e volta leva {min} min, acima dos {usable} min úteis de uma bateria. Mova a base para junto da área.',
    en: 'Home point {km} km from the area: the round trip alone takes {min} min, above the {usable} usable minutes of one battery. Move the home point next to the area.',
  },
  'preflight.base-no-terrain': {
    pt: 'A base está fora do relevo carregado: assumiu-se a descolagem à cota mínima da área ({elev} m) no perfil, no 3D, na folga ao solo e no seguimento de terreno. Mova a base para dentro do relevo para ter alturas exactas.',
    en: 'The home point is outside the loaded elevation data: take-off is assumed at the lowest elevation of the area ({elev} m) for the profile, the 3D view, the ground clearance and terrain following. Move the home point inside the elevation data for exact heights.',
  },
  'preflight.no-base-relief': {
    pt: 'Sem base numa área com {relief} m de desnível: assumiu-se a descolagem à cota mínima ({elev} m), o lado seguro. A descolar mais alto a rota fica mais alta do que o planeado (GSD pior); a descolar fora e abaixo da área, mais baixa. Marque a base para ter alturas exactas.',
    en: 'No home point in an area with {relief} m of relief: take-off is assumed at the lowest elevation ({elev} m), the safe side. Taking off higher puts the route higher than planned (worse GSD); taking off outside and below the area, lower. Mark the home point for exact heights.',
  },
  'preflight.terrain-collision': {
    pt: 'A rota entra no relevo: {m} m abaixo do solo no pior ponto. Suba a altitude ou ligue seguir terreno.',
    en: 'The route goes into the terrain: {m} m below ground at the worst point. Raise the altitude or turn follow terrain on.',
  },
  'preflight.clearance-low': {
    pt: 'Folga mínima ao solo de {m} m, abaixo de 15 m. Suba a altitude ou ligue seguir terreno.',
    en: 'Minimum ground clearance of {m} m, below 15 m. Raise the altitude or turn follow terrain on.',
  },
  'preflight.no-base': {
    pt: 'Sem ponto de base: o trânsito não conta para a bateria e o seguimento de terreno usa o primeiro waypoint como referência.',
    en: 'No base point: transit is not counted against the battery and terrain following uses the first waypoint as reference.',
  },
  'preflight.heights-relative': {
    pt: 'As alturas do KMZ são relativas ao ponto de descolagem: descole na base ou no ponto de referência do plano.',
    en: 'KMZ heights are relative to the take-off point: take off at the base or at the plan’s reference point.',
  },
}
