import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { BASE_MARKER_HTML } from './Icons.jsx'
import { useLang, useT } from '../i18n.jsx'

/**
 * Mapa Leaflet com camadas imperativas sincronizadas com o estado React:
 *  - desenho livre de polígonos (clique adiciona vértice, duplo-clique conclui)
 *  - vértices editáveis por arrasto após concluir
 *  - modo âncora (clique define o centro do retângulo, marcador arrastável)
 *  - área com buffer, linhas de voo em serpentina e waypoints
 */

const toLatLng = ([lon, lat]) => [lat, lon]

export default function MapView({
  mode,
  draftVertices,
  ring,
  valid,
  kinks,
  anchorCenter,
  basePoint,
  plan,
  blocks,
  gridCells,
  tiles,
  disabledTiles,
  onTileToggle,
  gcps,
  inspectPoints,
  onInspectDrag,
  facePreview,
  corridorPreview,
  orbitPreview,
  onOrbitPoiDrag,
  fitKey,
  editable,
  onMapClick,
  onVertexDrag,
  onVertexInsert,
  onVertexDelete,
  onDraftVertexRemove,
  onAnchorDrag,
  onBaseDrag,
  onFinishDraw,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)

  // As callbacks/modo vivem num ref para os handlers Leaflet (registados uma
  // única vez) lerem sempre a versão atual sem re-registos.
  const stateRef = useRef({})
  stateRef.current = {
    mode,
    onMapClick,
    onFinishDraw,
    onVertexDrag,
    onVertexInsert,
    onVertexDelete,
    onDraftVertexRemove,
    onAnchorDrag,
    onBaseDrag,
    onTileToggle,
    onInspectDrag,
    onOrbitPoiDrag,
  }

  // Inicialização única do mapa
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [39.5, -8.0],
      zoom: 7,
      doubleClickZoom: false,
    })

    const esriImagery = () =>
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imagens © Esri' },
      )
    const esriLabels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, maxNativeZoom: 18, zIndex: 3, attribution: 'Etiquetas © Esri' },
    )
    const hybrid = L.layerGroup([esriImagery(), esriLabels]).addTo(map)
    const sat = esriImagery()
    const topo = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, maxNativeZoom: 19, attribution: 'Topográfico © Esri' },
    )
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    })

    // Municípios (CAOP) — vetor local simplificado: linhas verde+branco e
    // etiquetas dependentes da escala (nomes visíveis a partir do zoom 9)
    const municipios = L.layerGroup()
    const caopLabels = L.layerGroup()
    let caopLoaded = false
    const syncCaopLabels = () => {
      const show = map.getZoom() >= 9 && map.hasLayer(municipios)
      if (show && !map.hasLayer(caopLabels)) caopLabels.addTo(map)
      if (!show && map.hasLayer(caopLabels)) caopLabels.remove()
    }
    const loadCaop = async () => {
      if (caopLoaded) return
      caopLoaded = true
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}caop-municipios.json`)
        const gj = await res.json()
        L.geoJSON(gj, {
          style: { color: '#16a34a', weight: 1.5, fill: false },
          interactive: false,
        }).addTo(municipios)
        L.geoJSON(gj, {
          style: { color: '#ffffff', weight: 0.75, fill: false },
          interactive: false,
        }).addTo(municipios)
        gj.features.forEach((f) => {
          const [lon, lat] = f.properties.lp
          L.marker([lat, lon], {
            icon: L.divIcon({
              className: 'caop-label',
              html: f.properties.n,
              iconSize: null,
            }),
            interactive: false,
          }).addTo(caopLabels)
        })
        syncCaopLabels()
      } catch {
        caopLoaded = false
      }
    }
    map.on('zoomend', syncCaopLabels)
    map.on('overlayadd', (e) => {
      if (e.layer === municipios) {
        loadCaop()
        syncCaopLabels()
      }
    })
    map.on('overlayremove', (e) => {
      if (e.layer === municipios) syncCaopLabels()
    })

    // Freguesias (CAOP) — WMS oficial da DGT
    const freguesias = L.tileLayer.wms('https://geo2.dgterritorio.gov.pt/geoserver/ows', {
      layers:
        'caop_continente:cont_freguesias,caop_raa:raa_cen_ori_freguesias,caop_raa:raa_oci_freguesias,caop_ram:ram_freguesias',
      format: 'image/png',
      transparent: true,
      maxZoom: 19,
      zIndex: 5,
      attribution: 'CAOP © DGT',
    })

    // o controlo de camadas é criado no efeito de idioma (labels traduzidas)
    layersRef.current = {
      ...(layersRef.current ?? {}),
      baseLayers: { hybrid, sat, topo, osm },
      caopOverlays: { municipios, freguesias },
      layersControl: null,
    }

    layersRef.current = {
      ...(layersRef.current ?? {}),
      draft: L.layerGroup().addTo(map),
      polygon: L.layerGroup().addTo(map),
      buffer: L.layerGroup().addTo(map),
      lines: L.layerGroup().addTo(map),
      gcps: L.layerGroup().addTo(map),
      inspect: L.layerGroup().addTo(map),
      face: L.layerGroup().addTo(map),
      corridor: L.layerGroup().addTo(map),
      orbit: L.layerGroup().addTo(map),
      canvas: L.canvas({ padding: 0.3 }),
    }

    map.on('click', (e) => {
      const s = stateRef.current
      if (
        s.mode === 'draw' || s.mode === 'anchor' || s.mode === 'base' ||
        s.mode === 'inspect' || s.mode === 'face' || s.mode === 'orbit' ||
        s.mode === 'corridor'
      ) {
        s.onMapClick([e.latlng.lng, e.latlng.lat])
      }
    })
    map.on('dblclick', () => {
      const s = stateRef.current
      if (s.mode === 'draw' || s.mode === 'face' || s.mode === 'corridor') s.onFinishDraw()
    })
    // Duplo clique DIREITO fecha o polígono; o menu do browser fica suprimido
    // durante o desenho (evita cliques fantasma ao dispensá-lo)
    let lastContextMenu = 0
    map.on('contextmenu', (e) => {
      const s = stateRef.current
      if (s.mode !== 'draw') return
      e.originalEvent?.preventDefault()
      const now = Date.now()
      if (now - lastContextMenu < 500) s.onFinishDraw()
      lastContextMenu = now
    })

    mapRef.current = map
    return () => map.remove()
  }, [])

  // Controlo de camadas com labels na língua ativa (reconstruído ao mudar;
  // os estados ligado/desligado preservam-se porque as camadas são as mesmas)
  const t = useT()
  const lang = useLang()
  useEffect(() => {
    const map = mapRef.current
    const refs = layersRef.current
    if (!map || !refs?.baseLayers) return
    if (refs.layersControl) map.removeControl(refs.layersControl)
    refs.layersControl = L.control
      .layers(
        {
          [t('map.hybrid')]: refs.baseLayers.hybrid,
          [t('map.satellite')]: refs.baseLayers.sat,
          [t('map.topo')]: refs.baseLayers.topo,
          OpenStreetMap: refs.baseLayers.osm,
        },
        {
          [t('map.municipalities')]: refs.caopOverlays.municipios,
          [t('map.parishes')]: refs.caopOverlays.freguesias,
        },
        { position: 'topright' },
      )
      .addTo(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  // Cursor de mira nos modos interativos
  useEffect(() => {
    const el = mapRef.current?.getContainer()
    if (el)
      el.classList.toggle(
        'cursor-crosshair',
        mode === 'draw' || mode === 'anchor' || mode === 'base' ||
          mode === 'inspect' || mode === 'face' || mode === 'orbit' ||
          mode === 'corridor',
      )
  }, [mode])

  // Enquadrar o mapa na área (após importação ou abertura de projeto)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !fitKey || !ring || ring.length < 3) return
    map.fitBounds(L.latLngBounds(ring.map(toLatLng)), { padding: [60, 60] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  // Marcador da base do operador (ponto de descolagem)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let marker = null
    if (basePoint) {
      const icon = L.divIcon({
        className: 'base-marker',
        html: BASE_MARKER_HTML,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      marker = L.marker(toLatLng(basePoint), { icon, draggable: true, zIndexOffset: 500 }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        stateRef.current.onBaseDrag([p.lng, p.lat])
      })
    }
    return () => {
      if (marker) marker.remove()
    }
  }, [basePoint])

  // Rascunho durante o desenho livre
  useEffect(() => {
    const g = layersRef.current?.draft
    if (!g) return
    g.clearLayers()
    if ((mode !== 'draw' && mode !== 'face' && mode !== 'corridor') || draftVertices.length === 0) return

    if (draftVertices.length > 1) {
      L.polyline(draftVertices.map(toLatLng), {
        color: '#38bdf8',
        weight: 2,
        dashArray: '6 4',
      }).addTo(g)
    }
    draftVertices.forEach((v, i) => {
      const m = L.circleMarker(toLatLng(v), {
        radius: 6,
        color: '#0f172a',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 1,
        bubblingMouseEvents: false, // o clique no vértice não chega ao mapa
      }).addTo(g)
      // clicar num vértice do rascunho remove-o
      m.on('click', () => stateRef.current.onDraftVertexRemove(i))
    })
  }, [draftVertices, mode])

  // Polígono da área + vértices editáveis + auto-interseções (kinks)
  useEffect(() => {
    const g = layersRef.current?.polygon
    if (!g) return
    g.clearLayers()
    if (!ring) return

    const color = valid ? '#38bdf8' : '#ef4444'
    L.polygon(ring.map(toLatLng), {
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.08,
    }).addTo(g)

    if (editable) {
      const icon = L.divIcon({ className: 'vertex-handle', iconSize: [12, 12] })
      ring.forEach((v, i) => {
        const m = L.marker(toLatLng(v), { icon, draggable: true }).addTo(g)
        m.on('dragend', () => {
          const p = m.getLatLng()
          stateRef.current.onVertexDrag(i, [p.lng, p.lat])
        })
        // clique direito remove o vértice (mínimo 3)
        m.on('contextmenu', (e) => {
          e.originalEvent?.preventDefault()
          stateRef.current.onVertexDelete(i)
        })
      })

      // Pontos intermédios: arrastar insere um novo vértice nessa aresta
      const midIcon = L.divIcon({ className: 'midpoint-handle', iconSize: [10, 10] })
      ring.forEach((v, i) => {
        const next = ring[(i + 1) % ring.length]
        const mid = [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2]
        const mm = L.marker(toLatLng(mid), { icon: midIcon, draggable: true }).addTo(g)
        mm.on('dragend', () => {
          const p = mm.getLatLng()
          stateRef.current.onVertexInsert(i + 1, [p.lng, p.lat])
        })
      })
    }

    // Contornos das células da grelha de blocos
    if (gridCells) {
      gridCells.forEach((cell) => {
        L.polygon(cell.map(toLatLng), {
          color: '#f59e0b',
          weight: 1,
          dashArray: '3 4',
          fill: false,
          opacity: 0.8,
          interactive: false,
        }).addTo(g)
      })
    }

    // Células do mosaico: clicar ativa/desativa cada quadrado
    if (tiles) {
      tiles.forEach((cell, i) => {
        const off = disabledTiles?.has(i)
        const p = L.polygon(cell.map(toLatLng), {
          color: off ? '#64748b' : '#f59e0b',
          weight: off ? 1 : 1.5,
          dashArray: off ? '2 5' : '3 4',
          fillColor: off ? '#64748b' : '#f59e0b',
          fillOpacity: off ? 0.04 : 0.08,
          opacity: off ? 0.5 : 0.9,
          bubblingMouseEvents: false,
        }).addTo(g)
        p.on('click', () => stateRef.current.onTileToggle(i))
        if (off) {
          const c = cell.reduce((a, v) => [a[0] + v[0] / 4, a[1] + v[1] / 4], [0, 0])
          L.marker(toLatLng(c), {
            icon: L.divIcon({ className: 'tile-off-label', html: '✕', iconSize: null }),
            interactive: false,
          }).addTo(g)
        }
      })
    }

    kinks.forEach((k) => {
      L.circleMarker(toLatLng(k), {
        radius: 8,
        color: '#ef4444',
        weight: 3,
        fill: false,
      }).addTo(g)
    })
  }, [ring, valid, kinks, editable, gridCells, tiles, disabledTiles])

  // Marcador do ponto central (modo âncora)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let marker = null
    if (anchorCenter) {
      const icon = L.divIcon({ className: 'anchor-handle', iconSize: [16, 16] })
      marker = L.marker(toLatLng(anchorCenter), { icon, draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        stateRef.current.onAnchorDrag([p.lng, p.lat])
      })
    }
    return () => {
      if (marker) marker.remove()
    }
  }, [anchorCenter])

  // Plano de voo: área com buffer, linhas, ligações e waypoints
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    layers.buffer.clearLayers()
    layers.lines.clearLayers()
    if (!plan || plan.error) return

    // Contorno da área expandida (buffer)
    const bufferRing = plan.area.geometry.coordinates[0]
    L.polyline(bufferRing.map(toLatLng), {
      color: '#f59e0b',
      weight: 1.5,
      dashArray: '4 6',
      opacity: 0.9,
    }).addTo(layers.buffer)

    // Caminho completo em serpentina (faixas + viragens)
    const path = plan.waypoints.map(toLatLng)
    L.polyline(path, {
      color: '#22d3ee',
      weight: 1,
      dashArray: '2 4',
      opacity: 0.7,
      renderer: layers.canvas,
    }).addTo(layers.lines)

    // Faixas de voo: uma cor por bloco (quando há divisão) ou ciano único
    const BLOCK_COLORS = [
      '#22d3ee', '#a3e635', '#f472b6', '#fbbf24',
      '#c084fc', '#34d399', '#fb923c', '#60a5fa',
    ]
    if (blocks && blocks.length > 1) {
      blocks.forEach((block) => {
        const color = BLOCK_COLORS[(block.id - 1) % BLOCK_COLORS.length]
        block.lines.forEach((seg) => {
          L.polyline(seg.map(toLatLng), {
            color,
            weight: 2.5,
            renderer: layers.canvas,
          }).addTo(layers.lines)
        })
        // etiqueta numerada no início do bloco
        const first = block.lines[0]
        const mid = [(first[0][0] + first[1][0]) / 2, (first[0][1] + first[1][1]) / 2]
        L.marker(toLatLng(mid), {
          icon: L.divIcon({
            className: 'block-label',
            html: `<span style="border-color:${color}">${block.id}</span>`,
            iconSize: null,
          }),
          interactive: false,
        }).addTo(layers.lines)
      })
    } else {
      plan.lines.forEach((seg) => {
        L.polyline(seg.map(toLatLng), {
          color: '#22d3ee',
          weight: 2.5,
          renderer: layers.canvas,
        }).addTo(layers.lines)
      })
    }

    // Waypoints + início (verde) / fim (vermelho)
    plan.waypoints.forEach((w, i) => {
      const isFirst = i === 0
      const isLast = i === plan.waypoints.length - 1
      L.circleMarker(toLatLng(w), {
        radius: isFirst || isLast ? 7 : 2.5,
        color: '#0f172a',
        weight: 1,
        fillColor: isFirst ? '#4ade80' : isLast ? '#ef4444' : '#22d3ee',
        fillOpacity: 1,
        renderer: layers.canvas,
      }).addTo(layers.lines)
    })
  }, [plan, blocks])

  // Alvos GCP planeados (xadrez amarelo, com etiqueta)
  useEffect(() => {
    const g = layersRef.current?.gcps
    if (!g) return
    g.clearLayers()
    if (!gcps) return
    gcps.forEach(({ id, point }) => {
      L.marker(toLatLng(point), {
        icon: L.divIcon({
          className: 'gcp-marker',
          html: `<div class="gcp-target"></div><div class="gcp-label">${id}</div>`,
          iconSize: null,
        }),
        interactive: false,
        zIndexOffset: 400,
      }).addTo(g)
    })
  }, [gcps])

  // Pré-visualização do modo fachada (E1.1): baseline (pé da face), linha
  // afastada ao standoff e traços de rumo da primeira passagem
  useEffect(() => {
    const g = layersRef.current?.face
    if (!g) return
    g.clearLayers()
    if (!facePreview) return
    if (facePreview.baseline?.length >= 2) {
      L.polyline(facePreview.baseline.map(toLatLng), {
        color: '#f97316',
        weight: 3,
      }).addTo(g)
    }
    if (facePreview.offsetLine?.length >= 2) {
      L.polyline(facePreview.offsetLine.map(toLatLng), {
        color: '#38bdf8',
        weight: 2,
        dashArray: '6 4',
      }).addTo(g)
    }
    if (facePreview.ticks) {
      facePreview.ticks.forEach(([a, b]) => {
        L.polyline([toLatLng(a), toLatLng(b)], {
          color: '#fde047',
          weight: 1.5,
          opacity: 0.9,
        }).addTo(g)
      })
    }
  }, [facePreview])

  // Pré-visualização do modo corredor (E5.1): eixo, faixa coberta e
  // passagens geradas. Onde a curvatura parte uma passagem em troços, cada
  // troço é desenhado por si, para o corte ser visível antes do voo.
  useEffect(() => {
    const g = layersRef.current?.corridor
    if (!g) return
    g.clearLayers()
    if (!corridorPreview) return
    if (corridorPreview.buffer?.length >= 3) {
      L.polygon(corridorPreview.buffer.map(toLatLng), {
        color: '#f97316',
        weight: 1,
        opacity: 0.5,
        fillColor: '#f97316',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(g)
    }
    if (corridorPreview.centreline?.length >= 2) {
      L.polyline(corridorPreview.centreline.map(toLatLng), {
        color: '#f97316',
        weight: 3,
      }).addTo(g)
    }
    corridorPreview.passes?.forEach((seg) => {
      if (seg.length < 2) return
      L.polyline(seg.map(toLatLng), {
        color: '#fde047',
        weight: 2,
        opacity: 0.95,
      }).addTo(g)
    })
  }, [corridorPreview])

  // Pré-visualização do modo órbita (E1.2): POI arrastável, anel do 1.º
  // nível e traços de rumo a apontar ao alvo
  useEffect(() => {
    const g = layersRef.current?.orbit
    if (!g) return
    g.clearLayers()
    if (!orbitPreview) return
    if (orbitPreview.ring?.length >= 2) {
      L.polyline(orbitPreview.ring.map(toLatLng), {
        color: '#38bdf8',
        weight: 2,
        dashArray: '6 4',
      }).addTo(g)
    }
    if (orbitPreview.ticks) {
      orbitPreview.ticks.forEach(([a, b]) => {
        L.polyline([toLatLng(a), toLatLng(b)], {
          color: '#fde047',
          weight: 1.5,
          opacity: 0.9,
        }).addTo(g)
      })
    }
    if (orbitPreview.poi) {
      const icon = L.divIcon({ className: 'anchor-handle', iconSize: [16, 16] })
      const m = L.marker(toLatLng(orbitPreview.poi), {
        icon,
        draggable: true,
        zIndexOffset: 550,
      }).addTo(g)
      m.on('dragend', () => {
        const p = m.getLatLng()
        stateRef.current.onOrbitPoiDrag?.([p.lng, p.lat])
      })
    }
  }, [orbitPreview])

  // Pontos de inspeção (R2.9): marcadores numerados e arrastáveis
  useEffect(() => {
    const g = layersRef.current?.inspect
    if (!g) return
    g.clearLayers()
    if (!inspectPoints || inspectPoints.length === 0) return
    inspectPoints.forEach((p, i) => {
      const m = L.marker(toLatLng(p.point), {
        icon: L.divIcon({
          className: 'inspect-marker',
          html: `<div class="inspect-dot">${i + 1}</div><div class="inspect-label">${String(p.label ?? '').replace(/[<>&]/g, '')}</div>`,
          iconSize: null,
        }),
        draggable: true,
        zIndexOffset: 600,
      }).addTo(g)
      m.on('dragend', () => {
        const q = m.getLatLng()
        stateRef.current.onInspectDrag?.(p.id, [q.lng, q.lat])
      })
    })
  }, [inspectPoints])

  return <div ref={containerRef} className="h-full w-full" />
}
