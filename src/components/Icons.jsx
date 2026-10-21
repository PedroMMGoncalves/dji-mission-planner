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
/** @param {{className?: string}} props */
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
/** @param {{className?: string}} props */
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
/** @param {{className?: string}} props */
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
/** @param {{className?: string}} props */
export function IconHelipad({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.8 7.5v9M15.2 7.5v9M8.8 12h6.4" />
    </Svg>
  )
}

/** @param {{className?: string}} props */
export function IconTrash({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Svg>
  )
}

/** @param {{className?: string}} props */
export function IconDownload({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Svg>
  )
}

/** @param {{className?: string}} props */
export function IconCheck({ className }) {
  return (
    <Svg className={className}>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </Svg>
  )
}

/** Montanhas — terreno/relevo. */
/** @param {{className?: string}} props */
export function IconMountain({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 18.5 9 7l4 6.5 3-4.5 5 9.5Z" />
      <path d="M7.5 12.5 9 10.5l1.5 2" />
    </Svg>
  )
}

/** Cubo isométrico — vista 3D. */
/** @param {{className?: string}} props */
export function IconCube({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 2.8 20.3 7.4v9.2L12 21.2l-8.3-4.6V7.4Z" />
      <path d="M12 12 20.3 7.4M12 12 3.7 7.4M12 12v9.2" />
    </Svg>
  )
}

/** Pasta — abrir/importar ficheiros. */
/** @param {{className?: string}} props */
export function IconFolder({ className }) {
  return (
    <Svg className={className}>
      <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.3H19A1.5 1.5 0 0 1 20.5 9.3v8.2A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
    </Svg>
  )
}

/** Gráfico de perfil — perfil de elevação. */
/** @param {{className?: string}} props */
export function IconChart({ className }) {
  return (
    <Svg className={className}>
      <path d="M3.5 4v15.5H21" />
      <path d="M6 15.5 10 10l3.5 3 5-6.5" />
    </Svg>
  )
}

/** Seta para baixo — abre um menu ou uma secção. */
/** @param {{className?: string}} props */
export function IconChevronDown({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  )
}

/** Seta para a direita — «Mais opções». */
/** @param {{className?: string}} props */
export function IconChevronRight({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  )
}

/** Cruz — fechar. */
/** @param {{className?: string}} props */
export function IconClose({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  )
}

/** Círculo com «i» — nota, sem plano. */
/** @param {{className?: string}} props */
export function IconInfo({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Svg>
  )
}

/** Triângulo com «!» — aviso. */
/** @param {{className?: string}} props */
export function IconWarning({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Svg>
  )
}

/** Octógono com cruz — bloqueio. */
/** @param {{className?: string}} props */
export function IconBlocked({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z" />
      <path d="m15 9-6 6M9 9l6 6" />
    </Svg>
  )
}

/** Círculo com visto — sem bloqueios. */
/** @param {{className?: string}} props */
export function IconCheckCircle({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
      <path d="M22 4 12 14l-3-3" />
    </Svg>
  )
}

/** Círculo com «?» — ajuda. */
/** @param {{className?: string}} props */
export function IconHelp({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </Svg>
  )
}

/** Folha com linhas — relatório. */
/** @param {{className?: string}} props */
export function IconReport({ className }) {
  return (
    <Svg className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Svg>
  )
}

/** Prancheta com visto — checklist de campo. */
/** @param {{className?: string}} props */
export function IconClipboard({ className }) {
  return (
    <Svg className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </Svg>
  )
}

/** Lápis — mudar o nome. */
/** @param {{className?: string}} props */
export function IconPencil({ className }) {
  return (
    <Svg className={className}>
      <path d="M16.9 3.6a2.1 2.1 0 0 1 3 3L8 18.5 4 19.5l1-4z" />
    </Svg>
  )
}

/** Roda dentada — configuração. */
/** @param {{className?: string}} props */
export function IconGear({ className }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  )
}
