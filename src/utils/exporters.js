import JSZip from 'jszip'

/**
 * Módulos de exportação:
 *  - KML simples: polígono 2D da área, para importação rápida no DJI Pilot 2.
 *  - KMZ WPML:    estrutura oficial DJI (wpmz/template.kml + wpmz/waylines.wpml)
 *                 com waypoints 3D e disparo automático da câmara.
 */

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
      .replace(/[^\w\-]+/g, '-')
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

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[c])
}

function missionConfigXml({ wpml, speed }) {
  return `  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>goHome</wpml:finishAction>
    <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
    <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
    <wpml:takeOffSecurityHeight>30</wpml:takeOffSecurityHeight>
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
  const { name, waypoints, altitude, speed, wpml } = params
  const turnMode = params.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature'
  const now = Date.now()

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
        <wpml:useStraightLine>1</wpml:useStraightLine>
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
    <wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>
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
  } = params
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
          <wpml:waypointHeadingAngle>${hasHeading ? Math.round(pw.heading) : 0}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>${hasHeading ? 1 : 0}</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>${groupsXml ? '\n' + groupsXml : ''}
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
