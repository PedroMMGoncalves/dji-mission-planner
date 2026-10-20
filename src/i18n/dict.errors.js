/**
 * Mensagens dos erros com código (src/utils/appError.js: chave = err.<code>),
 * das importações, do MDT, do relevo global e do equipamento, e os avisos do
 * seguimento de terreno. Cada uma diz o que se passou e o passo seguinte
 * (M3-C11/M3-U18 da revisão do código).
 */
export default {
  // importação de áreas
  'err.import.kml-invalid': {
    pt: 'KML inválido: o ficheiro não é XML bem formado. Volte a exportá-lo do SIG.',
    en: 'Invalid KML: the file is not well-formed XML. Export it again from the GIS.',
  },
  'err.import.no-polygon': {
    pt: 'Nenhum polígono encontrado no {what}: o ficheiro da área tem de trazer pelo menos um polígono fechado.',
    en: 'No polygon found in the {what}: the area file must contain at least one closed polygon.',
  },
  'err.import.no-polygon-lines': {
    pt: 'O {what} tem {n} linha(s) mas nenhum polígono. Para um eixo (estrada, conduta, linha eléctrica) desenhe-o no separador Corredor; para uma área, exporte-a do SIG como polígono.',
    en: 'The {what} has {n} line(s) but no polygon. For an axis (road, pipeline, power line) draw it in the Corridor tab; for an area, export it from the GIS as a polygon.',
  },
  'err.import.geojson-invalid': {
    pt: 'GeoJSON inválido: o ficheiro não é JSON. Volte a exportá-lo do SIG.',
    en: 'Invalid GeoJSON: the file is not JSON. Export it again from the GIS.',
  },
  'err.import.unsupported-format': {
    pt: 'Formato não suportado: use .kml, .kmz (missão WPML), .geojson/.json ou .zip (shapefile).',
    en: 'Unsupported format: use .kml, .kmz (WPML mission), .geojson/.json or .zip (shapefile).',
  },
  'err.import.crs-failed': {
    pt: 'Falha na conversão de coordenadas: confirme o sistema escolhido ou exporte o ficheiro em WGS84.',
    en: 'Coordinate conversion failed: confirm the chosen system or export the file in WGS84.',
  },
  'err.import.read-failed': {
    pt: 'Falha ao ler o ficheiro: {d}',
    en: 'Could not read the file: {d}',
  },
  // missões WPML reimportadas
  'err.wpml.unreadable': {
    pt: 'KMZ ilegível: o ficheiro está corrompido ou não é um .kmz.',
    en: 'Unreadable KMZ: the file is corrupted or is not a .kmz.',
  },
  'err.wpml.not-mission': {
    pt: 'KMZ sem waylines.wpml nem template.kml: não é uma missão WPML.',
    en: 'KMZ without waylines.wpml or template.kml: not a WPML mission.',
  },
  'err.wpml.xml-invalid': {
    pt: 'XML da missão ilegível: o ficheiro WPML está corrompido.',
    en: 'Unreadable mission XML: the WPML file is corrupted.',
  },
  'err.wpml.no-coordinates': {
    pt: 'KMZ sem coordenadas válidas: nenhum waypoint encontrado.',
    en: 'KMZ without valid coordinates: no waypoint found.',
  },
  'err.wpml.too-few-waypoints': {
    pt: 'KMZ sem waypoints suficientes (mínimo 3) para reconstruir a área.',
    en: 'KMZ with too few waypoints (minimum 3) to rebuild the area.',
  },
  'err.wpml.height-mode': {
    pt: 'KMZ com alturas em {mode}: só se importam missões com alturas relativas ao ponto de descolagem (relativeToStartPoint).',
    en: 'KMZ with heights in {mode}: only missions with heights relative to the take-off point (relativeToStartPoint) can be imported.',
  },
  // MDT importado (GeoTIFF)
  'err.dem.no-crs': {
    pt: 'O GeoTIFF não indica o sistema de coordenadas (sem GeoKeys): exporte o MDT em PT-TM06 (EPSG:3763).',
    en: 'The GeoTIFF does not state its coordinate system (no GeoKeys): export the DTM in PT-TM06 (EPSG:3763).',
  },
  'err.dem.crs-unsupported': {
    pt: 'SRC não suportado: EPSG:{code}. Exporte o MDT em PT-TM06 (EPSG:3763).',
    en: 'Unsupported CRS: EPSG:{code}. Export the DTM in PT-TM06 (EPSG:3763).',
  },
  'err.dem.project-failed': {
    pt: 'Não foi possível projectar a área para o sistema de coordenadas do MDT. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The area could not be projected into the DTM coordinate system. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.file-invalid': {
    pt: 'Ficheiro de MDT inválido. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'Invalid DTM file. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.area-invalid': {
    pt: 'Área de levantamento inválida para recortar o MDT.',
    en: 'Invalid survey area for cropping the DTM.',
  },
  'err.dem.open-failed': {
    pt: 'Não foi possível abrir o GeoTIFF ({d}). Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'Could not open the GeoTIFF ({d}). Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.unreadable': {
    pt: 'GeoTIFF ilegível ({d}). Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'Unreadable GeoTIFF ({d}). Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.no-pixels': {
    pt: 'O GeoTIFF não tem píxeis. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The GeoTIFF has no pixels. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.rotated': {
    pt: 'MDT com rotação não suportado: reexporte o raster sem rotação (orientado a norte).',
    en: 'Rotated DTM not supported: re-export the raster without rotation (north-up).',
  },
  'err.dem.not-georeferenced': {
    pt: 'O GeoTIFF não está georreferenciado (sem origem/escala de píxel). Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The GeoTIFF is not georeferenced (no pixel origin/scale). Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.bad-scale': {
    pt: 'O GeoTIFF tem uma escala de píxel inválida. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The GeoTIFF has an invalid pixel scale. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.outside-area': {
    pt: 'O MDT não cobre a área de levantamento: importe um ficheiro que a inclua, ou use o relevo global (~30 m).',
    en: 'The DTM does not cover the survey area: import a file that includes it, or use the global terrain (~30 m).',
  },
  'err.dem.read-failed': {
    pt: 'Falha ao ler os píxeis do MDT ({d}). Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'Could not read the DTM pixels ({d}). Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.no-data-window': {
    pt: 'O MDT não devolveu dados na janela pedida. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The DTM returned no data in the requested window. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.incomplete': {
    pt: 'O MDT devolveu uma grelha incompleta. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The DTM returned an incomplete grid. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.no-valid-values': {
    pt: 'O MDT não tem cotas válidas na área de levantamento. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'The DTM has no valid elevation values in the survey area. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  'err.dem.generic': {
    pt: 'Falha ao ler o MDT. Reexporte o MDT do SIG (GeoTIFF georreferenciado, PT-TM06) ou use o relevo global (~30 m).',
    en: 'Could not read the DTM. Re-export the DTM from the GIS (georeferenced GeoTIFF, PT-TM06) or use the global terrain (~30 m).',
  },
  // relevo global
  'err.terrain.download-failed': {
    pt: 'Falha ao descarregar o relevo global: verifique a ligação e volte a tentar, ou importe um MDT.',
    en: 'Could not download the global terrain: check the connection and retry, or import a DTM.',
  },
  'err.terrain.too-large': {
    pt: 'Área demasiado grande para o relevo global: reduza a área.',
    en: 'Area too large for the global terrain: reduce the area.',
  },
  'err.terrain.bbox-invalid': {
    pt: 'Rectângulo envolvente inválido para o relevo global.',
    en: 'Invalid bounding box for the global terrain.',
  },
  'err.terrain.unsupported': {
    pt: 'Este browser não consegue descodificar o relevo ({d}).',
    en: 'This browser cannot decode the terrain ({d}).',
  },
  'err.terrain.offline': {
    pt: 'Sem ligação à Internet: só as áreas já descarregadas estão na cache.',
    en: 'No Internet connection: only the areas already downloaded are in the cache.',
  },
  'err.terrain.generic': { pt: 'Falha ao obter o relevo.', en: 'Could not load the terrain.' },
  // avisos do seguimento de terreno
  'err.tf.min-relative': {
    pt: 'Altura relativa mínima de {min} m (abaixo dos {rec} m recomendados face ao ponto de descolagem): verifique o relevo e os obstáculos.',
    en: 'Minimum relative height of {min} m (below the {rec} m recommended above the take-off point): check the terrain and obstacles.',
  },
  'err.tf.no-data': {
    pt: 'Sem dados de terreno em {n} de {total} pontos amostrados: nessas zonas foi usada a última cota válida.',
    en: 'No terrain data at {n} of {total} sampled points: the last valid elevation was used there.',
  },
  'err.tf.capped': {
    pt: 'Terreno até {rise} m mais alto dentro de {half} m do eixo da faixa: para manter {height} m de folga a rota teria de passar o tecto de {cap} m acima do solo. Ficou limitada ao tecto e a folga desce a {min} m em {n} de {total} pontos: baixe a altura, rode as faixas ou parta a área.',
    en: 'Terrain up to {rise} m higher within {half} m of the line: to keep {height} m of clearance the route would exceed the {cap} m ceiling above ground. It was capped at the ceiling and the clearance drops to {min} m at {n} of {total} points: lower the height, rotate the lines or split the area.',
  },
  // equipamento (Configuração)
  'err.equipment.not-json': {
    pt: 'Ficheiro de equipamento inválido: o conteúdo não é JSON.',
    en: 'Invalid equipment file: the content is not JSON.',
  },
  'err.equipment.wrong-kind': {
    pt: 'Este ficheiro não é uma configuração de equipamento (esperado kind «{kind}»).',
    en: 'This file is not an equipment configuration (expected kind “{kind}”).',
  },
}
