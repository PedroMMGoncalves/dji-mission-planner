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
  'preflight.no-base': {
    pt: 'Sem ponto de base: o trânsito não conta para a bateria e o seguimento de terreno usa o primeiro waypoint como referência.',
    en: 'No base point: transit is not counted against the battery and terrain following uses the first waypoint as reference.',
  },
  'preflight.heights-relative': {
    pt: 'As alturas do KMZ são relativas ao ponto de descolagem: descole na base ou no ponto de referência do plano.',
    en: 'KMZ heights are relative to the take-off point: take off at the base or at the plan’s reference point.',
  },
}
