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

export function buildSimpleKML(ring, name, basePoint = null) {
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
    </Placemark>${basePlacemark}
  </Document>
</kml>
`
}

export function exportSimpleKML(ring, name, basePoint = null) {
  const kml = buildSimpleKML(ring, name, basePoint)
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
  const now = Date.now()

  const placemarks = waypoints
    .map(
      ([lon, lat], i) => `      <Placemark>
        <Point>
          <coordinates>${fmtCoord(lon)},${fmtCoord(lat)}</coordinates>
        </Point>
        <wpml:index>${i}</wpml:index>
        <wpml:ellipsoidHeight>${altitude}</wpml:ellipsoidHeight>
        <wpml:height>${altitude}</wpml:height>
        <wpml:useGlobalHeight>1</wpml:useGlobalHeight>
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
    <wpml:globalWaypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:globalWaypointTurnMode>
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
 */
export function buildWaylinesWPML(params) {
  const { waypoints, altitude, speed, wpml, photoIntervalM, triggerMode } = params

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

  // Grupo 0: ao chegar ao 1.º waypoint, gimbal a nadir (-90°).
  // Grupo 1: disparo contínuo da câmara ao longo de toda a rota.
  const firstWaypointActions = `        <wpml:actionGroup>
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
              <wpml:gimbalPitchRotateAngle>-90</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>${
          triggerXml
            ? `
        <wpml:actionGroup>
          <wpml:actionGroupId>1</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${waypoints.length - 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
${triggerXml}
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>1</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>${wpml.payloadPositionIndex ?? 0}</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`
            : ''
        }`

  const placemarks = waypoints
    .map(
      ([lon, lat], i) => `      <Placemark>
        <Point>
          <coordinates>${fmtCoord(lon)},${fmtCoord(lat)}</coordinates>
        </Point>
        <wpml:index>${i}</wpml:index>
        <wpml:executeHeight>${altitude}</wpml:executeHeight>
        <wpml:waypointSpeed>${speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>${i === 0 ? '\n' + firstWaypointActions : ''}
      </Placemark>`,
    )
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
export async function exportWPMLKmz(params) {
  const zip = new JSZip()
  const wpmz = zip.folder('wpmz')
  wpmz.file('template.kml', buildTemplateKML(params))
  wpmz.file('waylines.wpml', buildWaylinesWPML(params))
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  downloadBlob(blob, `${params.name}.kmz`)
}
