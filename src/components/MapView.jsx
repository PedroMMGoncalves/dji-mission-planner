import { useEffect, useRef } from 'react'
import L from 'leaflet'

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
  plan,
  onMapClick,
  onVertexDrag,
  onAnchorDrag,
  onFinishDraw,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)

  // As callbacks/modo vivem num ref para os handlers Leaflet (registados uma
  // única vez) lerem sempre a versão atual sem re-registos.
  const stateRef = useRef({})
  stateRef.current = { mode, onMapClick, onFinishDraw, onVertexDrag, onAnchorDrag }

  // Inicialização única do mapa
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [39.5, -8.0],
      zoom: 7,
      doubleClickZoom: false,
    })

    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imagens © Esri' },
    ).addTo(map)
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    })
    L.control
      .layers({ 'Satélite (Esri)': sat, OpenStreetMap: osm }, {}, { position: 'topright' })
      .addTo(map)

    layersRef.current = {
      draft: L.layerGroup().addTo(map),
      polygon: L.layerGroup().addTo(map),
      buffer: L.layerGroup().addTo(map),
      lines: L.layerGroup().addTo(map),
      canvas: L.canvas({ padding: 0.3 }),
    }

    map.on('click', (e) => {
      const s = stateRef.current
      if (s.mode === 'draw' || s.mode === 'anchor') {
        s.onMapClick([e.latlng.lng, e.latlng.lat])
      }
    })
    map.on('dblclick', () => {
      const s = stateRef.current
      if (s.mode === 'draw') s.onFinishDraw()
    })

    mapRef.current = map
    return () => map.remove()
  }, [])

  // Cursor de mira nos modos interativos
  useEffect(() => {
    const el = mapRef.current?.getContainer()
    if (el) el.classList.toggle('cursor-crosshair', mode === 'draw' || mode === 'anchor')
  }, [mode])

  // Rascunho durante o desenho livre
  useEffect(() => {
    const g = layersRef.current?.draft
    if (!g) return
    g.clearLayers()
    if (mode !== 'draw' || draftVertices.length === 0) return

    if (draftVertices.length > 1) {
      L.polyline(draftVertices.map(toLatLng), {
        color: '#38bdf8',
        weight: 2,
        dashArray: '6 4',
      }).addTo(g)
    }
    draftVertices.forEach((v) => {
      L.circleMarker(toLatLng(v), {
        radius: 5,
        color: '#0f172a',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 1,
      }).addTo(g)
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

    const icon = L.divIcon({ className: 'vertex-handle', iconSize: [12, 12] })
    ring.forEach((v, i) => {
      const m = L.marker(toLatLng(v), { icon, draggable: true }).addTo(g)
      m.on('dragend', () => {
        const p = m.getLatLng()
        stateRef.current.onVertexDrag(i, [p.lng, p.lat])
      })
    })

    kinks.forEach((k) => {
      L.circleMarker(toLatLng(k), {
        radius: 8,
        color: '#ef4444',
        weight: 3,
        fill: false,
      }).addTo(g)
    })
  }, [ring, valid, kinks])

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

    // Faixas de voo (troços úteis, mais destacados)
    plan.lines.forEach((seg) => {
      L.polyline(seg.map(toLatLng), {
        color: '#22d3ee',
        weight: 2.5,
        renderer: layers.canvas,
      }).addTo(layers.lines)
    })

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
  }, [plan])

  return <div ref={containerRef} className="h-full w-full" />
}
