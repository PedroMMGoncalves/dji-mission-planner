/**
 * Ícones SVG (traço 24×24, herdam a cor do texto via currentColor).
 * Estilo de linha consistente em toda a interface.
 */

function Svg({ children, className = 'h-4 w-4', strokeWidth = 1.8 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Quadricóptero visto de cima. */
export function IconDrone({ className }) {
  return (
    <Svg className={className}>
      <circle cx="5" cy="5" r="2.6" />
      <circle cx="19" cy="5" r="2.6" />
      <circle cx="5" cy="19" r="2.6" />
      <circle cx="19" cy="19" r="2.6" />
      <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.5" />
      <path d="M6.9 6.9 9.2 9.2M17.1 6.9 14.8 9.2M6.9 17.1 9.2 14.8M17.1 17.1 14.8 14.8" />
    </Svg>
  )
}

/** Polígono com vértices — desenho livre. */
export function IconPolygon({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 4.5 19.5 10 16.5 19h-9L4.5 10Z" />
      <circle cx="12" cy="4.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Mira — modo ponto central. */
export function IconTarget({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
    </Svg>
  )
}

/** Plataforma de aterragem (H) — base do operador. */
export function IconHelipad({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.8 7.5v9M15.2 7.5v9M8.8 12h6.4" />
    </Svg>
  )
}

export function IconTrash({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Svg>
  )
}

export function IconDownload({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Svg>
  )
}

export function IconCheck({ className }) {
  return (
    <Svg className={className}>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </Svg>
  )
}

/** Montanhas — terreno/relevo. */
export function IconMountain({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 18.5 9 7l4 6.5 3-4.5 5 9.5Z" />
      <path d="M7.5 12.5 9 10.5l1.5 2" />
    </Svg>
  )
}

/** Cubo isométrico — vista 3D. */
export function IconCube({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 2.8 20.3 7.4v9.2L12 21.2l-8.3-4.6V7.4Z" />
      <path d="M12 12 20.3 7.4M12 12 3.7 7.4M12 12v9.2" />
    </Svg>
  )
}

/** Pasta — abrir/importar ficheiros. */
export function IconFolder({ className }) {
  return (
    <Svg className={className}>
      <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.3H19A1.5 1.5 0 0 1 20.5 9.3v8.2A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
    </Svg>
  )
}

/** Gráfico de perfil — perfil de elevação. */
export function IconChart({ className }) {
  return (
    <Svg className={className}>
      <path d="M3.5 4v15.5H21" />
      <path d="M6 15.5 10 10l3.5 3 5-6.5" />
    </Svg>
  )
}

/** Bandeira de Portugal (simplificada) — o Windows não renderiza emojis 🇵🇹. */
export function FlagPT({ className = 'h-3.5 w-5' }) {
  return (
    <svg
      viewBox="0 0 20 14"
      className={`inline-block rounded-[2px] ${className}`}
      aria-hidden="true"
    >
      <rect width="8" height="14" fill="#046a38" />
      <rect x="8" width="12" height="14" fill="#da291c" />
      <circle cx="8" cy="7" r="3" fill="#ffe900" />
      <circle cx="8" cy="7" r="1.7" fill="#da291c" stroke="#fff" strokeWidth="0.5" />
    </svg>
  )
}

/** Bandeira do Reino Unido (simplificada). */
export function FlagGB({ className = 'h-3.5 w-5' }) {
  return (
    <svg
      viewBox="0 0 20 14"
      className={`inline-block rounded-[2px] ${className}`}
      aria-hidden="true"
    >
      <rect width="20" height="14" fill="#012169" />
      <path d="M0 0 20 14M20 0 0 14" stroke="#fff" strokeWidth="2.6" />
      <path d="M0 0 20 14M20 0 0 14" stroke="#C8102E" strokeWidth="1.1" />
      <path d="M10 0v14M0 7h20" stroke="#fff" strokeWidth="4.2" />
      <path d="M10 0v14M0 7h20" stroke="#C8102E" strokeWidth="2.4" />
    </svg>
  )
}

/** SVG standalone (string) para o marcador da base no mapa Leaflet. */
export const BASE_MARKER_HTML = `
<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#f59e0b" stroke-width="1.8"
     stroke-linecap="round" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,.8))">
  <circle cx="12" cy="12" r="9" fill="#0f172a" fill-opacity="0.85"/>
  <path d="M8.8 7.5v9M15.2 7.5v9M8.8 12h6.4"/>
</svg>`
