import JSZip from 'jszip'

/**
 * Módulos de exportação:
 *  - KML simples: polígono 2D da área, para importação rápida no DJI Pilot 2.
 *  - KMZ WPML:    estrutura oficial DJI (wpmz/template.kml + wpmz/waylines.wpml)
 *                 com waypoints 3D e disparo automático da câmara.
 */

/**
 * Erro de exportação com código estável, para a interface poder traduzir a
 * mensagem sem depender do texto. Um plano inválido tem de falhar aqui: um
 * KMZ com `NaN` numas coordenadas ou `undefined` numa altura é aceite por
 * qualquer verificação de subcadeia mas rejeitado (ou pior, mal interpretado)
 * pelo DJI Pilot 2, e o erro só aparece no campo.
 */
export class MissionExportError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'MissionExportError'
    this.code = code
    this.detail = detail
  }
}

// wpml:index tem alcance [0, 65535], logo no máximo 65536 waypoints por rota.
export const MAX_WAYPOINTS_PER_ROUTE = 65536
// Limiares de sanidade, não limites de modelo: apanham unidades trocadas e
// campos em bruto antes de chegarem ao ficheiro.
export const MAX_SPEED_MS = 30
export const MAX_RTH_HEIGHT_M = 1500

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Um waypoint é [lon, lat] ou [lon, lat, altura]; valida domínio e finitude. */
function checkWaypoint(wp, i) {
  if (!Array.isArray(wp) || wp.length < 2) {
    throw new MissionExportError('waypoint-malformed', `índice ${i}`)
  }
  const [lon, lat, h] = wp
  if (!isNum(lon) || !isNum(lat)) {
    throw new MissionExportError('waypoint-not-finite', `índice ${i}`)
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new MissionExportError('waypoint-out-of-range', `índice ${i}: ${lon}, ${lat}`)
  }
  if (h !== undefined && h !== null && !isNum(h)) {
    throw new MissionExportError('height-not-finite', `índice ${i}`)
  }
}

/**
 * Validação na fronteira da exportação. Corre antes de qualquer concatenação
 * de XML, para nenhum valor não-finito ou em falta chegar ao ficheiro.
 */
export function validateExportParams(params) {
  const { waypoints, altitude, speed, wpml } = params ?? {}
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    throw new MissionExportError('no-waypoints')
  }
  if (waypoints.length > MAX_WAYPOINTS_PER_ROUTE) {
    throw new MissionExportError('too-many-waypoints', String(waypoints.length))
  }
  waypoints.forEach(checkWaypoint)
  // A altitude global é o valor de recurso de cada waypoint sem altura
  // própria, por isso tem de ser finita mesmo quando todos a trazem. Tem
  // também de ser positiva: um valor nulo ou negativo é aceite por qualquer
  // verificação de finitude mas não descreve nenhuma missão real.
  if (!isNum(altitude)) throw new MissionExportError('altitude-not-finite', String(altitude))
  if (altitude <= 0) throw new MissionExportError('altitude-not-positive', String(altitude))
  // MAX_SPEED_MS é generoso face ao mais rápido dos DJI suportados (~23 m/s);
  // serve para apanhar unidades trocadas ou um campo em bruto, não para
  // impor o limite de um modelo, que é validado na interface.
  if (!isNum(speed) || speed <= 0) throw new MissionExportError('speed-invalid', String(speed))
  if (speed > MAX_SPEED_MS) throw new MissionExportError('speed-out-of-range', String(speed))
  if (!wpml || !isNum(wpml.droneEnumValue) || !isNum(wpml.payloadEnumValue)) {
    throw new MissionExportError('wpml-enums-missing')
  }
  for (const key of ['photoIntervalM', 'gimbalPitch', 'rthHeightM', 'turnDampingDistM']) {
    const v = params[key]
    if (v !== undefined && v !== null && !isNum(v)) {
      throw new MissionExportError('param-not-finite', key)
    }
  }
  // Domínios: um intervalo de disparo negativo desliga o disparo em silêncio,
  // e uma altura de regresso negativa mandaria o regresso para baixo do
  // ponto de descolagem.
  if (isNum(params.photoIntervalM) && params.photoIntervalM < 0) {
    throw new MissionExportError('param-out-of-range', 'photoIntervalM')
  }
  if (isNum(params.rthHeightM) && (params.rthHeightM <= 0 || params.rthHeightM > MAX_RTH_HEIGHT_M)) {
    throw new MissionExportError('param-out-of-range', 'rthHeightM')
  }
  // As acções por waypoint escapavam a esta fronteira: um rumo ou um pitch
  // não numérico — vindo de um projecto importado à mão, ou de um campo de
  // texto — era interpolado tal e qual no XML. Um `heading` de "270°" saía
  // como <wpml:waypointHeadingAngle>NaN</...> e um pitch de "nadir" saía
  // literalmente, sem excepção nenhuma. O ficheiro passava a validação
  // sintáctica de XML e só o comando o recusava, no campo.
  if (params.perWaypoint != null) {
    if (!Array.isArray(params.perWaypoint)) {
      throw new MissionExportError('param-not-finite', 'perWaypoint')
    }
    params.perWaypoint.forEach((pw, i) => {
      if (pw == null) return // buracos são normais: só alguns waypoints têm acções
      if (typeof pw !== 'object') {
        throw new MissionExportError('per-waypoint-invalid', `${i}`)
      }
      if (pw.heading != null && !isNum(pw.heading)) {
        throw new MissionExportError('per-waypoint-not-finite', `${i}.heading=${pw.heading}`)
      }
      // Os geradores produzem rumos em 0..359 (faceMode, orbit, pontos de
      // inspecção) e o WPML exige [-180, 180] em smoothTransition. Aceita-se a
      // convenção de entrada dos geradores e normaliza-se na escrita; o que
      // não se aceita é um valor fora de ambas as convenções.
      if (isNum(pw.heading) && (pw.heading < -180 || pw.heading >= 360)) {
        throw new MissionExportError('param-out-of-range', `perWaypoint[${i}].heading`)
      }
      if (pw.gimbalPitch != null && !isNum(pw.gimbalPitch)) {
        throw new MissionExportError('per-waypoint-not-finite', `${i}.gimbalPitch=${pw.gimbalPitch}`)
      }
      if (isNum(pw.gimbalPitch) && (pw.gimbalPitch < -120 || pw.gimbalPitch > 60)) {
        throw new MissionExportError('param-out-of-range', `perWaypoint[${i}].gimbalPitch`)
      }
      if (pw.actions != null && !Array.isArray(pw.actions)) {
        throw new MissionExportError('per-waypoint-invalid', `${i}.actions`)
      }
    })
  }
  // Divida da fronteira que a auditoria registou: estes campos chegavam ao
  // ficheiro em cru. Nenhum e hoje alimentado por um campo da interface, mas
  // `turnMode: 'a & b'` e `payloadPositionIndex: '<mau>'` produzem XML MAL
  // FORMADO — um KMZ que o Pilot 2 nem chega a abrir — e um
  // takeOffSecurityHeightM nao numerico escreve NaN. Fecha-se agora, antes de
  // alguem os ligar a um campo.
  if (params.turnMode != null && !TURN_MODES.includes(params.turnMode)) {
    throw new MissionExportError('param-out-of-range', `turnMode=${params.turnMode}`)
  }
  if (params.takeOffSecurityHeightM != null) {
    if (!isNum(params.takeOffSecurityHeightM)) {
      throw new MissionExportError('param-not-finite', 'takeOffSecurityHeightM')
    }
    if (params.takeOffSecurityHeightM <= 0 || params.takeOffSecurityHeightM > 200) {
      throw new MissionExportError('param-out-of-range', 'takeOffSecurityHeightM')
    }
  }
  for (const chave of ['droneSubEnumValue', 'payloadSubEnumValue', 'payloadPositionIndex']) {
    const v = wpml[chave]
    if (v !== undefined && v !== null && !isNum(v)) {
      throw new MissionExportError('param-not-finite', `wpml.${chave}`)
    }
  }
  if (isNum(params.gimbalPitch) && (params.gimbalPitch < -120 || params.gimbalPitch > 60)) {
    throw new MissionExportError('param-out-of-range', 'gimbalPitch')
  }
  return params
}

function fmtCoord(v) {
  return Number(v.toFixed(8))
}

/**
 * E3.1: nome canónico dos ficheiros exportados, com o tipo de missão e a
 * variante codificados: `<missao>_<tipo>[-variante][_parte]`, ex.:
 *   quinta_area-crosshatch-nadir_b01 · quinta_face-p1-6 · quinta_orbit-n3
 * `variant` pode ser string ou lista (filtra vazios e junta com '-');
 * `part` é o sufixo de bloco/nível. Sem extensão — o chamador acrescenta.
 */
export function buildExportName(missionName, type, { variant = null, part = null } = {}) {
  const safe = (s) =>
    String(s ?? '')
      .trim()
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'missao'
  const variants = (Array.isArray(variant) ? variant : [variant]).filter(Boolean)
  const typeBit = [type, ...variants].filter(Boolean).join('-')
  return [safe(missionName), typeBit, part].filter(Boolean).join('_')
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/* KML simples (polígono 2D)                                          */
/* ------------------------------------------------------------------ */

export function buildSimpleKML(ring, name, basePoint = null, gcps = null, lines = null) {
  if (!Array.isArray(ring) || ring.length < 3) throw new MissionExportError('ring-too-short')
  ring.forEach(checkWaypoint)
  if (basePoint) checkWaypoint(basePoint, -1)
  gcps?.forEach((g, i) => checkWaypoint(g.point, i))
  lines?.forEach((seg) => seg.forEach(checkWaypoint))
  const coords = [...ring, ring[0]]
    .map(([lon, lat]) => `${fmtCoord(lon)},${fmtCoord(lat)},0`)
    .join(' ')

  const basePlacemark = basePoint
    ? `
    <Placemark>
      <name>Base</name>
      <Point>
        <coordinates>${fmtCoord(basePoint[0])},${fmtCoord(basePoint[1])},0</coordinates>
      </Point>
    </Placemark>`
    : ''

  const gcpPlacemarks = gcps?.length
    ? gcps
        .map(
          (g) => `
    <Placemark>
      <name>${escapeXml(g.id)}</name>
      <Point>
        <coordinates>${fmtCoord(g.point[0])},${fmtCoord(g.point[1])},0</coordinates>
      </Point>
    </Placemark>`,
        )
        .join('')
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Style id="surveyArea">
      <LineStyle><color>ffd8bd38</color><width>2</width></LineStyle>
      <PolyStyle><color>4dd8bd38</color></PolyStyle>
    </Style>
    <Placemark>
      <name>${escapeXml(name)} — área de levantamento</name>
      <styleUrl>#surveyArea</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>${basePlacemark}${gcpPlacemarks}${linesFolder(lines)}
  </Document>
</kml>
`
}

/** Pasta opcional com as faixas de voo (útil no QGIS; desligável no visualizador). */
function linesFolder(lines) {
  if (!lines?.length) return ''
  const placemarks = lines
    .map(
      (seg, i) => `
      <Placemark>
        <name>L${String(i + 1).padStart(3, '0')}</name>
        <styleUrl>#flightLine</styleUrl>
        <LineString>
          <coordinates>${seg
            .map(([lon, lat]) => `${fmtCoord(lon)},${fmtCoord(lat)},0`)
            .join(' ')}</coordinates>
        </LineString>
      </Placemark>`,
    )
    .join('')
  return `
    <Style id="flightLine">
      <LineStyle><color>ffeed322</color><width>1.5</width></LineStyle>
    </Style>
    <Folder>
      <name>Flight lines</name>${placemarks}
    </Folder>`
}

export function exportSimpleKML(ring, name, basePoint = null, gcps = null, lines = null) {
  const kml = buildSimpleKML(ring, name, basePoint, gcps, lines)
  downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${name}.kml`)
}

/* ------------------------------------------------------------------ */
/* KMZ WPML (DJI Pilot 2)                                             */
/* ------------------------------------------------------------------ */

/**
 * Caracteres que a produção `Char` do XML 1.0 não admite (controlos C0 fora de
 * tab/LF/CR, e os não-caracteres U+FFFE/U+FFFF), mais os controlos C1, que são
 * legais mas nunca intencionais num nome de missão. Um único destes — colado
 * sem querer de outra aplicação — produz um ficheiro que nenhum analisador
 * conforme abre, e o Pilot 2 rejeita-o sem explicar porquê.
 */
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g

/**
 * Substitutos isolados (uma metade de um par sem a outra). Também não são
 * caracteres XML válidos, mas nenhum analisador em JavaScript os denuncia,
 * porque as strings de JavaScript admitem-nos: chegariam ao ficheiro e só o
 * leitor do Pilot 2 recusaria. Aparecem em texto truncado a meio de um
 * emoji ou colado de uma aplicação que cortou por unidades de código.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function escapeXml(s) {
  return String(s)
    .replace(XML_ILLEGAL, '')
    .replace(LONE_SURROGATE, '')
    .replace(/[<>&'"]/g, (c) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    })[c])
}

/**
 * Ações de segurança admitidas pela especificação WPML (dji-sdk/Cloud-API-Doc,
 * template-kml.md e waylines-wpml.md, verificado 2026-08-27). Valores fora
 * destas listas são rejeitados pelo DJI Pilot 2, por isso o exportador
 * valida e cai no valor por omissão em vez de escrever lixo no ficheiro.
 */
export const FINISH_ACTIONS = ['goHome', 'noAction', 'autoLand', 'gotoFirstWaypoint']
export const RC_LOST_MODES = ['executeLostAction', 'goContinue']
export const RC_LOST_ACTIONS = ['goBack', 'landing', 'hover']

const pick = (value, allowed) => (allowed.includes(value) ? value : allowed[0])

/**
 * Parâmetros de viragem coerentes com o modo, conforme a especificação
 * (common-element.md, `wpml:waypointTurnMode` / `wpml:waypointTurnDampingDist`
 * / `wpml:useStraightLine`):
 *
 *  - `toPointAndStopWithDiscontinuityCurvature` — troço recto com paragem no
 *    ponto. É o modo das grelhas e das fachadas: mantém-se `useStraightLine`
 *    a 1 e amortecimento 0, exactamente como antes.
 *  - `toPointAndPassWithContinuityCurvature` — voo curvo contínuo, sem parar
 *    (órbitas). Exige `useStraightLine` a 0: a 1 significa "aproxima o troço
 *    de uma recta entre os dois pontos", o que transformaria a órbita num
 *    polígono de cantos arredondados. Com 0, `waypointTurnDampingDist` deixa
 *    de ser obrigatório — só o é em `coordinateTurn` ou nesta curvatura com
 *    `useStraightLine` a 1, e aí tem de ser > 0 (0 está fora do intervalo).
 */
const TURN_MODE_STRAIGHT_LINE = {
  toPointAndStopWithDiscontinuityCurvature: 1,
  toPointAndStopWithContinuityCurvature: 0,
  toPointAndPassWithContinuityCurvature: 0,
  coordinateTurn: 0,
}

/** Modos de viragem aceites — as chaves do mapa acima, sem os repetir. */
export const TURN_MODES = Object.keys(TURN_MODE_STRAIGHT_LINE)

export function turnParams(turnMode, dampingDistM = 0) {
  const straightLine = TURN_MODE_STRAIGHT_LINE[turnMode] ?? 1
  const needsDamping =
    turnMode === 'coordinateTurn' ||
    (turnMode === 'toPointAndPassWithContinuityCurvature' && straightLine === 1)
  // Quando é obrigatório tem de ser > 0; sem valor utilizável cai em 1 m, o
  // menor amortecimento que a especificação aceita para segmentos normais.
  const damping = needsDamping ? Math.max(dampingDistM, 1) : 0
  return { straightLine, damping }
}

function missionConfigXml({ wpml, speed, altitude, ...opts }) {
  const finishAction = pick(opts.finishAction, FINISH_ACTIONS)
  const exitOnRCLost = pick(opts.exitOnRCLost, RC_LOST_MODES)
  const rcLostAction = pick(opts.executeRCLostAction, RC_LOST_ACTIONS)
  const takeOffSecurityHeight = opts.takeOffSecurityHeightM ?? 30
  // `wpml:globalRTHHeight` é obrigatório em waylines.wpml. O regresso é
  // planeado acima do tecto da missão (mínimo 100 m, o valor por omissão do
  // Pilot 2) para o trajecto de regresso não descer para dentro da área.
  //
  // O tecto é o ponto MAIS ALTO da rota, não a altitude nominal. Com
  // seguimento de terreno cada waypoint leva a sua própria altura
  // (agl + relevo − cota de descolagem): numa missão sobre um planalto 250 m
  // acima do ponto de descolagem, os waypoints ficam a ~350 m enquanto a
  // altitude pedida continua a ser 100. Derivar só de `altitude` dava um
  // regresso a 120 m — 230 m abaixo da própria rota, e abaixo do relevo que
  // ela acompanha. O valor derivado é limitado ao mesmo tecto que a validação
  // na fronteira exige de um valor vindo do chamador.
  const alturasRota = (opts.waypoints ?? [])
    .map((w) => Number(w?.[2]))
    .filter((h) => Number.isFinite(h))
  const tectoM = Math.max(Number(altitude) || 0, ...(alturasRota.length ? alturasRota : [0]))
  const rthHeight =
    opts.rthHeightM ?? Math.min(MAX_RTH_HEIGHT_M, Math.max(100, Math.ceil(tectoM) + 20))
  return `  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>${finishAction}</wpml:finishAction>
    <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
    <wpml:executeRCLostAction>${rcLostAction}</wpml:executeRCLostAction>
    <wpml:takeOffSecurityHeight>${takeOffSecurityHeight}</wpml:takeOffSecurityHeight>
    <wpml:globalRTHHeight>${rthHeight}</wpml:globalRTHHeight>
    <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
    <wpml:droneInfo>
      <wpml:droneEnumValue>${wpml.droneEnumValue}</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>${wpml.droneSubEnumValue ?? 0}</wpml:droneSubEnumValue>
    </wpml:droneInfo>
    <wpml:payloadInfo>
      <wpml:payloadEnumValue>${wpml.payloadEnumValue}</wpml:payloadEnumValue>
      <wpml:payloadSubEnumValue>${wpml.payloadSubEnumValue ?? 0}</wpml:payloadSubEnumValue>
      <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
    </wpml:payloadInfo>
  </wpml:missionConfig>`
}

/**
 * template.kml — "molde" da missão, com a configuração global e os waypoints.
 * O DJI Pilot 2 usa este ficheiro para reconstruir/editar a missão.
 */
export function buildTemplateKML(params) {
  validateExportParams(params)
  const { name, waypoints, altitude, speed } = params
  const turnMode = params.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature'
  const turn = turnParams(turnMode, params.turnDampingDistM)
  // Injectável para as comparações com ficheiros de referência serem
  // determinísticas; em uso normal é o instante da exportação.
  const now = params.createTimeMs ?? Date.now()

  const placemarks = waypoints
    .map(
      ([lon, lat, h], i) => `      <Placemark>
        <Point>
          <coordinates>${fmtCoord(lon)},${fmtCoord(lat)}</coordinates>
        </Point>
        <wpml:index>${i}</wpml:index>
        <wpml:ellipsoidHeight>${h ?? altitude}</wpml:ellipsoidHeight>
        <wpml:height>${h ?? altitude}</wpml:height>
        <wpml:useGlobalHeight>${h != null ? 0 : 1}</wpml:useGlobalHeight>
        <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>
        <wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>
        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>
        <wpml:useStraightLine>${turn.straightLine}</wpml:useStraightLine>
      </Placemark>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
<Document>
  <wpml:author>dji-mission-planner</wpml:author>
  <wpml:createTime>${now}</wpml:createTime>
  <wpml:updateTime>${now}</wpml:updateTime>
${missionConfigXml(params)}
  <Folder>
    <name>${escapeXml(name)}</name>
    <wpml:templateType>waypoint</wpml:templateType>
    <wpml:templateId>0</wpml:templateId>
    <wpml:waylineCoordinateSysParam>
      <wpml:coordinateMode>WGS84</wpml:coordinateMode>
      <wpml:heightMode>relativeToStartPoint</wpml:heightMode>
    </wpml:waylineCoordinateSysParam>
    <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
    <wpml:globalHeight>${altitude}</wpml:globalHeight>
    <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
    <wpml:gimbalPitchMode>manual</wpml:gimbalPitchMode>
    <wpml:globalWaypointHeadingParam>
      <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
      <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
      <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
      <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
    </wpml:globalWaypointHeadingParam>
    <wpml:globalWaypointTurnMode>${turnMode}</wpml:globalWaypointTurnMode>
    <wpml:globalUseStraightLine>${turn.straightLine}</wpml:globalUseStraightLine>
${placemarks}
  </Folder>
</Document>
</kml>
`
}

/**
 * waylines.wpml — a rota executável: waypoints 3D + ações de câmara.
 * O disparo automático usa um actionGroup que cobre toda a rota com trigger
 * multipleDistance (disparo a cada X metros) ou multipleTiming (a cada X s).
 *
 * Teto de waypoints por wayline (T3.3/R2.3, decisão: NÃO implementar corte):
 * a especificação WPML documenta wpml:index com alcance [0, 65535]
 * (dji-sdk/Cloud-API-Doc, waylines-wpml.md, verificado 2026-08-20) e nenhum
 * limite menor por wayline. O pior caso realista desta app — terrain follow
 * densificado (passo mínimo 40 m, simplificação Douglas-Peucker), teto de
 * segurança de 2500 faixas e blocos cortados por bateria — fica ordens de
 * grandeza abaixo de 65536, pelo que o padrão split_by_waypoint_count do
 * FlyPath não foi portado de propósito. Se um teste real no comando revelar
 * um limite prático menor do Pilot 2, reabrir a tarefa com essa evidência.
 */
export function buildWaylinesWPML(params) {
  validateExportParams(params)
  const {
    waypoints, altitude, speed, wpml, photoIntervalM, triggerMode, sensorType,
    // T4.1: ações por waypoint — array paralelo a `waypoints` com entradas
    // opcionais { gimbalPitch, heading, actions: ['takePhoto', ...] }.
    // heading fixa o rumo nesse waypoint (waypointHeadingMode
    // smoothTransition); sem entrada, o comportamento global mantém-se
    // byte a byte (followWayline, sem grupos extra).
    perWaypoint = null,
    // T5.1: modo de viragem (ex.: toPointAndPassWithContinuityCurvature
    // para órbitas em voo curvo contínuo); por defeito o comportamento
    // atual de parar em cada waypoint.
    turnMode = 'toPointAndStopWithDiscontinuityCurvature',
    // Distância de amortecimento da viragem (m). Só é escrita quando a
    // especificação a exige — ver turnParams().
    turnDampingDistM = 0,
  } = params
  const turn = turnParams(turnMode, turnDampingDistM)
  const gimbalPitch = params.gimbalPitch ?? -90

  const triggerXml = (() => {
    if (!photoIntervalM || photoIntervalM <= 0) return null
    if (triggerMode === 'time') {
      const seconds = Math.max(0.1, photoIntervalM / speed)
      return `          <wpml:actionTriggerType>multipleTiming</wpml:actionTriggerType>
          <wpml:actionTriggerParam>${seconds.toFixed(1)}</wpml:actionTriggerParam>`
    }
    return `          <wpml:actionTriggerType>multipleDistance</wpml:actionTriggerType>
          <wpml:actionTriggerParam>${photoIntervalM.toFixed(1)}</wpml:actionTriggerParam>`
  })()

  // Waypoint-0 action groups. A LiDAR payload (e.g. YellowScan on a Skyport
  // mount) has no gimbal the WPML can rotate, so the gimbalRotate group is
  // omitted for sensorType 'lidar'; the takePhoto group is omitted whenever
  // photoIntervalM is null/0. Group ids stay consecutive from 0, and with
  // both groups absent waypoint 0 carries no actions at all.
  const gimbalGroup =
    sensorType === 'lidar'
      ? null
      : `        <wpml:actionGroup>
          <wpml:actionGroupId>0</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>0</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>0</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${gimbalPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`
  const photoGroupId = gimbalGroup ? 1 : 0
  const photoGroup = triggerXml
    ? `        <wpml:actionGroup>
          <wpml:actionGroupId>${photoGroupId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${waypoints.length - 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
${triggerXml}
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${photoGroupId}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`
    : null
  const firstWaypointActions = [gimbalGroup, photoGroup].filter(Boolean).join('\n')

  // T4.1: grupos de ações por waypoint, com ids consecutivos a seguir aos
  // grupos globais. Cada grupo dispara em reachPoint no próprio waypoint.
  let nextGroupId = (gimbalGroup ? 1 : 0) + (photoGroup ? 1 : 0)
  const perWaypointGroup = (i, pw) => {
    const actions = []
    if (pw.gimbalPitch != null) {
      actions.push(`          <wpml:action>
            <wpml:actionId>${actions.length}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${pw.gimbalPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`)
    }
    for (const act of pw.actions ?? []) {
      if (act !== 'takePhoto') continue
      actions.push(`          <wpml:action>
            <wpml:actionId>${actions.length}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`)
    }
    if (actions.length === 0) return ''
    const gid = nextGroupId
    nextGroupId += 1
    return `        <wpml:actionGroup>
          <wpml:actionGroupId>${gid}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${i}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${actions.join('\n')}
        </wpml:actionGroup>`
  }

  const placemarks = waypoints
    .map(([lon, lat, h], i) => {
      const pw = perWaypoint?.[i] ?? null
      const hasHeading = pw?.heading != null
      const pwGroup = pw ? perWaypointGroup(i, pw) : ''
      const groupsXml = [i === 0 ? firstWaypointActions : '', pwGroup]
        .filter(Boolean)
        .join('\n')
      return `      <Placemark>
        <Point>
          <coordinates>${fmtCoord(lon)},${fmtCoord(lat)}</coordinates>
        </Point>
        <wpml:index>${i}</wpml:index>
        <wpml:executeHeight>${h ?? altitude}</wpml:executeHeight>
        <wpml:waypointSpeed>${speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${hasHeading ? 'smoothTransition' : 'followWayline'}</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${hasHeading ? ((Math.round(pw.heading) + 540) % 360) - 180 : 0}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>${hasHeading ? 1 : 0}</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>${turn.damping}</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${turn.straightLine}</wpml:useStraightLine>${groupsXml ? '\n' + groupsXml : ''}
      </Placemark>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
<Document>
${missionConfigXml(params)}
  <Folder>
    <wpml:templateId>0</wpml:templateId>
    <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
    <wpml:waylineId>0</wpml:waylineId>
    <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
${placemarks}
  </Folder>
</Document>
</kml>
`
}

/**
 * Empacota template.kml + waylines.wpml na estrutura oficial DJI:
 *   missao.kmz
 *   └── wpmz/
 *       ├── template.kml
 *       └── waylines.wpml
 */
async function buildKmz(params, type = 'blob') {
  const zip = new JSZip()
  const wpmz = zip.folder('wpmz')
  wpmz.file('template.kml', buildTemplateKML(params))
  wpmz.file('waylines.wpml', buildWaylinesWPML(params))
  return zip.generateAsync({
    type,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

export async function exportWPMLKmz(params) {
  const blob = await buildKmz(params)
  downloadBlob(blob, `${params.name}.kmz`)
}

/**
 * Exporta um ZIP com um KMZ WPML por bloco de voo, numerados pela ordem de
 * voo: missao-b01.kmz, missao-b02.kmz, … Cada KMZ é uma missão completa e
 * independente para o DJI Pilot 2 (uma bateria por bloco).
 */
export async function exportBlocksZip(params, blocks) {
  const master = new JSZip()
  for (const block of blocks) {
    const nn = String(block.id).padStart(2, '0')
    const kmz = await buildKmz(
      {
        ...params,
        name: `${params.name}_b${nn}`,
        waypoints: block.waypoints,
        // um perWaypoint global indexaria mal as fatias — cada bloco traz o
        // seu (ex.: marcador de gimbal nadir do R2.10), ou nenhum
        perWaypoint: block.perWaypoint ?? null,
      },
      'arraybuffer',
    )
    master.file(`${params.name}_b${nn}.kmz`, kmz)
  }
  const blob = await master.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${params.name}_blocos.zip`)
}
