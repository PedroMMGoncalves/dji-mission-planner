import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useLang, useT } from '../i18n.jsx'
import { hiddenStrips, radioStrips, ringLabelPoint } from '../mission/viewshedPlan.js'
import { blockRing } from '../mission/baseLayout.js'

/**
 * Mapa Leaflet com camadas imperativas sincronizadas com o estado React:
 *  - desenho livre de polígonos (clique adiciona vértice, duplo-clique conclui)
 *  - vértices editáveis por arrasto após concluir
 *  - modo âncora (clique define o centro do retângulo, marcador arrastável)
 *  - área com buffer, linhas de voo em serpentina e waypoints
 *  - bases de descolagem (A, B, ...) arrastáveis, a zona da seleccionada, e
 *    os blocos na cor da sua base com o número do voo
 *  - bacias de visão (camada do controlo, desligada por omissão): as partes
 *    de cada bloco atrás do relevo vistas da base, a laranja; as à vista mas
 *    com o rádio em risco (zona de Fresnel), a amarelo tracejado; e a
 *    percentagem visível de cada bloco
 */

const toLatLng = ([lon, lat]) => [lat, lon]

export default function MapView({
  mode,
  draftVertices,
  ring,
  holes = null,
  valid,
  kinks,
  anchorCenter,
  bases = null,
  selectedBaseId = null,
  onBaseSelect,
  gatherPreview = null,
  baseLayout = null,
  blockClickMode = 'toggle',
  onBlockClick,
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
  circularPreview,
  onOrbitPoiDrag,
  fitKey,
  editable,
  areaMovable = false,
  onMapClick,
  onVertexDrag,
  onVertexInsert,
  onVertexDelete,
  onDraftVertexRemove,
  onAreaMove,
  onBaseDrag,
  onFinishDraw,
  viewsheds = null,
  viewshedLayerOn = false,
  onViewshedLayer,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)

  // As callbacks/modo vivem num ref para os handlers Leaflet (registados uma
  // única vez) lerem sempre a versão atual sem re-registos.
  const stateRef = useRef({})
  // Escrito num efeito e não durante o render: mutar um ref no corpo do
  // componente é inseguro com renderização concorrente (React pode repetir
  // ou descartar o render). Os handlers imperativos abaixo só disparam por
  // acção do utilizador, sempre depois de o efeito ter corrido, pelo que
  // continuam a ler a versão mais recente.
  useEffect(() => {
    stateRef.current = {
      mode,
      onMapClick,
      onFinishDraw,
      onVertexDrag,
      onVertexInsert,
      onVertexDelete,
      onDraftVertexRemove,
      onAreaMove,
      onBaseDrag,
      onBaseSelect,
      onBlockClick,
      onTileToggle,
      onInspectDrag,
      onOrbitPoiDrag,
      onViewshedLayer,
    }
  })

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
      circular: L.layerGroup().addTo(map),
      bases: L.layerGroup().addTo(map),
      // pré-visualização do «Juntar aqui»: alcance e blocos que entram/ficam
      gather: L.layerGroup().addTo(map),
      // bacias de visão: só no mapa quando ligada (controlo de camadas ou painel)
      viewshed: L.layerGroup(),
      canvas: L.canvas({ padding: 0.3 }),
    }
    const viewshedLayer = layersRef.current.viewshed
    map.on('overlayadd', (e) => {
      if (e.layer === viewshedLayer) stateRef.current.onViewshedLayer?.(true)
    })
    map.on('overlayremove', (e) => {
      if (e.layer === viewshedLayer) stateRef.current.onViewshedLayer?.(false)
    })

    map.on('click', (e) => {
      const s = stateRef.current
      if (
        s.mode === 'draw' ||
        s.mode === 'anchor' ||
        s.mode === 'base' ||
        s.mode === 'inspect' ||
        s.mode === 'face' ||
        s.mode === 'orbit' ||
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
  const moveHint = t('map.moveArea')
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
          [t('map.viewsheds')]: refs.viewshed,
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
        mode === 'draw' ||
          mode === 'anchor' ||
          mode === 'base' ||
          mode === 'inspect' ||
          mode === 'face' ||
          mode === 'orbit' ||
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

  // Bases de descolagem: rótulo na cor da base, arrastável (só o operador
  // as move); a seleccionada mostra a zona, com o raio pedido a tracejado
  // quando foi reduzido junto a um desnível
  const baseTitle = t('bases.markerTitle', { label: '{label}' })
  useEffect(() => {
    const g = layersRef.current?.bases
    if (!g) return
    g.clearLayers()
    for (const b of bases ?? []) {
      const sel = b.id === selectedBaseId
      if (sel) {
        if (b.reduced && b.requestedRadiusM > 0)
          L.circle(toLatLng(b.point), {
            radius: b.requestedRadiusM,
            color: b.color,
            weight: 1.5,
            dashArray: '6 6',
            fill: false,
            interactive: false,
          }).addTo(g)
        if (b.radiusM > 0)
          L.circle(toLatLng(b.point), {
            radius: b.radiusM,
            color: b.color,
            weight: 2,
            fillColor: b.color,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(g)
      }
      const icon = L.divIcon({
        className: 'base-marker-multi',
        html: `<div class="base-pin${sel ? ' selected' : ''}" data-base-label="${b.label}" style="background:${b.color}">${b.label}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      const marker = L.marker(toLatLng(b.point), {
        icon,
        draggable: true,
        zIndexOffset: sel ? 700 : 500,
        title: baseTitle.replace('{label}', b.label),
        bubblingMouseEvents: false,
      }).addTo(g)
      marker.on('click', () => stateRef.current.onBaseSelect?.(b.id))
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        stateRef.current.onBaseDrag?.(b.id, [p.lng, p.lat])
      })
    }
  }, [bases, selectedBaseId, baseTitle])

  // «Juntar aqui»: o alcance da base (um vértice de bloco para lá dele passa
  // o VLOS no pior caso), os blocos que passam a ela a cheio na sua cor, os
  // que já eram dela só contornados e os que ficam de fora a cinzento
  useEffect(() => {
    const g = layersRef.current?.gather
    if (!g) return
    g.clearLayers()
    const p = gatherPreview
    if (!p || !Array.isArray(p.point) || !blocks?.length) return
    if (p.reachM > 0)
      L.circle(toLatLng(p.point), {
        radius: p.reachM,
        color: p.color,
        weight: 2,
        dashArray: '8 6',
        fill: false,
        interactive: false,
      }).addTo(g)
    const joined = new Set(p.joinedIds ?? [])
    const kept = new Set(p.keptIds ?? [])
    const far = new Set(p.farIds ?? [])
    for (const b of blocks) {
      const ring = b.cellRing ?? blockRing(b)
      if (!Array.isArray(ring) || ring.length < 3) continue
      const style = joined.has(b.id)
        ? { color: p.color, weight: 3, fillColor: p.color, fillOpacity: 0.3 }
        : kept.has(b.id)
          ? { color: p.color, weight: 2, fill: false }
          : far.has(b.id)
            ? {
                color: '#94a3b8',
                weight: 1.5,
                dashArray: '4 4',
                fillColor: '#0f172a',
                fillOpacity: 0.35,
              }
            : null
      if (!style) continue
      L.polygon(ring.map(toLatLng), {
        ...style,
        interactive: false,
        className: joined.has(b.id) ? 'gather-in' : kept.has(b.id) ? 'gather-kept' : 'gather-out',
      }).addTo(g)
    }
  }, [gatherPreview, blocks])

  // Bacias de visão: a camada segue o estado (painel ou controlo de camadas)
  useEffect(() => {
    const map = mapRef.current
    const g = layersRef.current?.viewshed
    if (!map || !g) return
    if (viewshedLayerOn && !map.hasLayer(g)) g.addTo(map)
    if (!viewshedLayerOn && map.hasLayer(g)) g.remove()
  }, [viewshedLayerOn])

  const radioLabel = t('map.viewshedRadio', { vis: '{vis}', pct: '{pct}' })
  // Bacias de visão: faixas de quadrados tapados (gridStepM de lado) e a
  // percentagem visível de cada bloco no seu centro; só com a camada ligada
  useEffect(() => {
    const g = layersRef.current?.viewshed
    if (!g) return
    g.clearLayers()
    if (!viewshedLayerOn || !viewsheds) return
    for (const v of Object.values(viewsheds)) {
      const res = v.result && !v.result.error ? v.result : null
      if (res) {
        for (const bounds of hiddenStrips(res))
          L.rectangle(bounds, {
            stroke: false,
            fillColor: '#f97316',
            fillOpacity: 0.45,
            interactive: false,
            className: 'viewshed-hidden',
          }).addTo(g)
        // à vista, mas com o rádio em risco: mais claro e tracejado
        for (const bounds of radioStrips(res))
          L.rectangle(bounds, {
            color: '#facc15',
            weight: 1,
            dashArray: '3 3',
            fillColor: '#fde047',
            fillOpacity: 0.2,
            interactive: false,
            className: 'viewshed-radio',
          }).addTo(g)
      }
      const at = ringLabelPoint(v.ring)
      if (!at) continue
      const s = v.summary
      const text =
        s?.status === 'ok'
          ? s.radioOnly > 0
            ? radioLabel
                .replace('{vis}', String(s.visiblePct))
                .replace('{pct}', String(s.radioOnlyPct))
            : `${s.visiblePct} %`
          : s
            ? '?'
            : '…'
      L.marker(toLatLng(at), {
        icon: L.divIcon({
          className: `viewshed-label${s?.hidden > 0 || s?.radioOnly > 0 ? ' some-hidden' : ''}`,
          html: `<span data-block-id="${v.blockId}">${text}</span>`,
          iconSize: null,
        }),
        interactive: false,
        zIndexOffset: 300,
      }).addTo(g)
    }
  }, [viewsheds, viewshedLayerOn, radioLabel])

  // Rascunho durante o desenho livre
  useEffect(() => {
    const g = layersRef.current?.draft
    if (!g) return
    g.clearLayers()
    if ((mode !== 'draw' && mode !== 'face' && mode !== 'corridor') || draftVertices.length === 0)
      return

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
    const rings = [ring.map(toLatLng), ...(holes ?? []).map((h) => h.map(toLatLng))]
    L.polygon(rings, {
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

    // Células do mosaico: clicar ativa/desativa cada quadrado (ou atribui a
    // base, conforme o painel); com bases, cada célula na cor da sua base
    if (tiles) {
      tiles.forEach((cell, i) => {
        const off = disabledTiles?.has(i)
        const tint = !off ? baseLayout?.byBlock?.[i + 1]?.color : null
        const on = tint ?? '#f59e0b'
        const p = L.polygon(cell.map(toLatLng), {
          color: off ? '#64748b' : on,
          weight: off ? 1 : 1.5,
          dashArray: off ? '2 5' : tint ? null : '3 4',
          fillColor: off ? '#64748b' : on,
          fillOpacity: off ? 0.04 : tint ? 0.16 : 0.08,
          opacity: off ? 0.5 : 0.9,
          bubblingMouseEvents: false,
        }).addTo(g)
        p.on('click', () => stateRef.current.onTileToggle(i))
        if (off) {
          let c = [0, 0]
          for (const v of cell) c = [c[0] + v[0] / cell.length, c[1] + v[1] / cell.length]
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
  }, [ring, holes, valid, kinks, editable, gridCells, tiles, disabledTiles, baseLayout])

  // Pega central: move a ÁREA INTEIRA (anel, buracos e células). Existe
  // sempre que há área — não só no modo âncora, como antes, e deliberadamente
  // também quando `editable` é falso: a edição de vértices está desligada nos
  // modos de mosaico e de blocos por bateria, mas é justamente aí que faz
  // falta arrastar o conjunto todo para o lado. Reporta o deslocamento, não o
  // destino, para a origem da área (âncora, ou anel desenhado/importado)
  // decidir o que fazer com ele.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // só no modo de área: nos outros modos a pega ficaria no meio do mapa a
    // apanhar os cliques que marcam o corredor, a fachada ou a órbita
    if (!areaMovable) return
    const at = anchorCenter
      ? toLatLng(anchorCenter)
      : ring && ring.length >= 3
        ? L.latLngBounds(ring.map(toLatLng)).getCenter()
        : null
    if (!at) return
    const icon = L.divIcon({ className: 'anchor-handle', iconSize: [16, 16] })
    const marker = L.marker(at, { icon, draggable: true, zIndexOffset: 400 }).addTo(map)
    marker.bindTooltip(moveHint, { direction: 'top', offset: [0, -10] })
    const origin = L.latLng(at)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      stateRef.current.onAreaMove([p.lng - origin.lng, p.lat - origin.lat])
    })
    return () => marker.remove()
  }, [anchorCenter, ring, areaMovable, moveHint])

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
      '#22d3ee',
      '#a3e635',
      '#f472b6',
      '#fbbf24',
      '#c084fc',
      '#34d399',
      '#fb923c',
      '#60a5fa',
    ]
    const assign = blockClickMode === 'assign' && Boolean(baseLayout?.hasBases)
    if (blocks && (blocks.length > 1 || baseLayout?.hasBases)) {
      blocks.forEach((block, i) => {
        // com bases: a cor da base do bloco; sem elas, uma cor por bloco
        const info = baseLayout?.byBlock?.[block.id]
        const color = info?.color ?? BLOCK_COLORS[i % BLOCK_COLORS.length]
        block.lines.forEach((seg) => {
          L.polyline(seg.map(toLatLng), {
            color,
            weight: 2.5,
            renderer: layers.canvas,
          }).addTo(layers.lines)
        })
        // etiqueta com o número do voo no início do bloco ("A-1"; sem bases, 1, 2, ...)
        const first = block.lines[0]
        const mid = [(first[0][0] + first[1][0]) / 2, (first[0][1] + first[1][1]) / 2]
        const label = String(info?.flightLabel || block.id).replace(/[<>&]/g, '')
        const m = L.marker(toLatLng(mid), {
          icon: L.divIcon({
            className: `block-label${assign ? ' clickable' : ''}`,
            html: `<span data-block-id="${block.id}" style="border-color:${color}">${label}</span>`,
            iconSize: null,
          }),
          interactive: assign,
          bubblingMouseEvents: false,
        }).addTo(layers.lines)
        if (assign) m.on('click', () => stateRef.current.onBlockClick?.(block.id))
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
  }, [plan, blocks, baseLayout, blockClickMode])

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

  // Pré-visualização do modo circular: os círculos da grelha e a rota que
  // os liga, pela ordem de voo
  useEffect(() => {
    const g = layersRef.current?.circular
    if (!g) return
    g.clearLayers()
    if (!circularPreview) return
    const renderer = layersRef.current?.canvas
    circularPreview.circles?.forEach((c) => {
      L.circle(toLatLng(c.centre), {
        radius: circularPreview.radiusM,
        color: c.clockwise ? '#38bdf8' : '#a78bfa',
        weight: 1,
        opacity: 0.7,
        fill: false,
        dashArray: '4 4',
        interactive: false,
        renderer,
      }).addTo(g)
    })
    if (circularPreview.path?.length >= 2) {
      L.polyline(circularPreview.path.map(toLatLng), {
        color: '#fde047',
        weight: 1.5,
        opacity: 0.9,
        interactive: false,
        renderer,
      }).addTo(g)
    }
  }, [circularPreview])

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
