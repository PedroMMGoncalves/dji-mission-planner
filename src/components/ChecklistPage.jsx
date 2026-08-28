import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n.jsx'
import { groupApplies } from '../data/checklist.js'

/* ------------------------------------------------------------------ *
 * Checklist de campo UAV — pré-campo, durante, pós-campo + relatório.
 * Persistência local automática, exportação JSON e impressão (A4).
 *
 * Bilingue PT/EN com dicionário interno: o conteúdo é longo e muito
 * estruturado, pelo que cada texto vive junto do item a que pertence
 * como par `{ pt, en }`. As chaves de estado (checks) usam índices
 * fase/grupo/item e são, por isso, independentes da língua activa.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'dji-mission-planner:checklist:v1'
const SAVE_DELAY_MS = 400

/** Par bilingue PT/EN. */
const bi = (pt, en) => ({ pt, en })

/** Resolve um par bilingue (ou string simples) na língua pedida. */
const tr = (v, lang) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return v[lang] ?? v.pt ?? ''
}

/** Hook de conveniência: `const L = useL()` e depois `L(par)`. */
function useL() {
  const lang = useLang()
  return (v) => tr(v, lang)
}

/** Atalho para declarar um item: texto, nota opcional, crítico opcional. */
const it = (texto, nota = null, critico = false) => ({ texto, nota, critico })

const FASES = [
  {
    id: 'pre',
    titulo: bi('Pré-campo', 'Pre-field'),
    grupos: [
      {
        titulo: bi('Plataforma', 'Platform'),
        itens: [
          it(
            bi(
              'Inspecção visual — fuselagem, braços, hélices',
              'Visual inspection — airframe, arms, propellers',
            ),
            bi('Fissuras, folgas, danos físicos', 'Cracks, play, physical damage'),
            true,
          ),
          it(
            bi(
              'Hélices fixas com sentido correto por motor',
              'Propellers secured with correct rotation per motor',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Motores livres de detritos, sem ruído anormal',
              'Motors free of debris, no abnormal noise',
            ),
          ),
          it(
            bi(
              'Sistema de aterragem / patins verificado',
              'Landing gear / skids checked',
            ),
          ),
        ],
      },
      {
        titulo: bi('Software e firmware', 'Software and firmware'),
        itens: [
          it(
            bi(
              'Firmware do UAV actualizado — versão estável',
              'UAV firmware up to date — stable release',
            ),
            bi(
              'Não actualizar em campo, apenas em base',
              'Do not update in the field, only at base',
            ),
            true,
          ),
          it(
            bi(
              'Software de missão actualizado',
              'Mission planning software up to date',
            ),
            bi('DJI Pilot 2', 'DJI Pilot 2'),
          ),
          it(
            bi(
              'Software de processamento testado e licenças válidas',
              'Processing software tested and licences valid',
            ),
            bi('WebODM, Pix4D, Metashape', 'WebODM, Pix4D, Metashape'),
          ),
          it(
            bi(
              'Plano de voo carregado e validado',
              'Flight plan uploaded and validated',
            ),
            bi(
              'Overlap lateral ≥ 70%, frontal ≥ 80%',
              'Side overlap ≥ 70%, forward overlap ≥ 80%',
            ),
            true,
          ),
        ],
      },
      {
        titulo: bi('Energia', 'Power'),
        itens: [
          it(
            bi(
              'Baterias de voo ≥ 95% — tensão por célula ok',
              'Flight batteries ≥ 95% — cell voltage OK',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Bateria do comando e tablet carregadas',
              'Remote controller and tablet batteries charged',
            ),
          ),
          it(
            bi(
              'Baterias reserva em bolsa LiPo anti-chama',
              'Spare batteries in fireproof LiPo bag',
            ),
          ),
          it(
            bi(
              'Carregador de campo + powerbank disponíveis',
              'Field charger + power bank available',
            ),
          ),
          it(
            bi('Gerador verificado com combustível', 'Generator checked and fuelled'),
            bi(
              'Missões em áreas remotas sem rede elétrica',
              'Missions in remote areas with no mains power',
            ),
          ),
        ],
      },
      {
        titulo: bi('Câmara / Sensor', 'Camera / Sensor'),
        itens: [
          it(
            bi(
              'Cartões SD formatados na câmara, capacidade suficiente + extras',
              'SD cards formatted in the camera, sufficient capacity + spares',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Lente limpa — sem poeira ou impressões digitais',
              'Lens clean — no dust or fingerprints',
            ),
          ),
          it(
            bi('Parâmetros da câmara configurados', 'Camera settings configured'),
            bi('ISO, obturador', 'ISO, shutter speed'),
          ),
          it(
            bi(
              'Gimbal desbloqueado com movimentação livre',
              'Gimbal unlocked and moving freely',
            ),
          ),
          it(
            bi('Painel radiométrico incluído', 'Radiometric panel packed'),
            bi(
              'Multiespectral: fotografar antes e depois do voo',
              'Multispectral: photograph before and after the flight',
            ),
          ),
        ],
      },
      {
        titulo: bi('Referenciação', 'Georeferencing'),
        itens: [
          it(
            bi(
              'Sistema de referência e datum definidos e documentados',
              'Reference system and datum defined and documented',
            ),
            bi('WGS84 / PT-TM06', 'WGS84 / PT-TM06'),
          ),
          it(
            bi(
              'Equipamento GNSS/RTK preparado e testado',
              'GNSS/RTK equipment prepared and tested',
            ),
          ),
          it(
            bi(
              'Targets GCP preparados e identificados',
              'GCP targets prepared and labelled',
            ),
            bi(
              'Contraste com o terreno; mínimo 5 por bloco',
              'Contrast against the ground; minimum 5 per block',
            ),
          ),
          it(
            bi(
              'Cartografia de base da área disponível',
              'Base mapping of the area available',
            ),
          ),
        ],
      },
      {
        titulo: bi('Plano de voo e segurança', 'Flight plan and safety'),
        itens: [
          it(
            bi(
              'Altitude de segurança acima de obstáculos definida',
              'Safe altitude above obstacles defined',
            ),
          ),
          it(
            bi(
              'Autonomia estimada com margem de retorno ≥ 30%',
              'Estimated endurance with ≥ 30% return margin',
            ),
          ),
          it(
            bi(
              'Autorização de voo / NOTAM obtida',
              'Flight authorisation / NOTAM obtained',
            ),
            null,
            true,
          ),
          it(
            bi('Previsão meteorológica consultada', 'Weather forecast checked'),
            bi(
              'Vento ≤ 10 m/s, sem chuva, boa visibilidade',
              'Wind ≤ 10 m/s, no rain, good visibility',
            ),
            true,
          ),
          it(
            bi(
              'Briefing de segurança à equipa preparado',
              'Safety briefing for the crew prepared',
            ),
          ),
        ],
      },
      // Grupo condicional (T2.4): só aparece com payload LiDAR activo.
      // Textos provisórios — redacção final e durações a validar em campo.
      {
        titulo: bi('LiDAR', 'LiDAR'),
        appliesTo: 'lidar',
        itens: [
          it(
            bi(
              'Armazenamento do scanner com espaço livre',
              'Scanner storage with free space',
            ),
            bi(
              'Cartão/SSD formatado; capacidade para o dia',
              'Card/SSD formatted; capacity for the day',
            ),
            true,
          ),
          it(
            bi('Bateria própria do scanner carregada', 'Scanner battery charged'),
            null,
            true,
          ),
          it(
            bi(
              'Plano PPK: base GNSS e ficheiros RINEX',
              'PPK plan: GNSS base and RINEX files',
            ),
            bi(
              'Estação base própria montada ou CORS definida',
              'Own base station planned or CORS chosen',
            ),
            true,
          ),
        ],
      },
    ],
  },
  {
    id: 'durante',
    titulo: bi('Durante', 'In-field'),
    grupos: [
      {
        titulo: bi('Chegada ao local', 'Arrival on site'),
        itens: [
          it(
            bi('Reconhecimento visual da área', 'Visual survey of the area'),
            bi(
              'Obstáculos, linhas de alta tensão, espaço aéreo',
              'Obstacles, high-voltage power lines, airspace',
            ),
          ),
          it(
            bi(
              'Zona de exclusão demarcada e briefing feito',
              'Exclusion zone marked out and briefing delivered',
            ),
          ),
          it(
            bi(
              'GCPs colocados e coordenadas registadas',
              'GCPs laid out and coordinates recorded',
            ),
            null,
            true,
          ),
          it(
            bi('Calibração IMU se necessário', 'IMU calibration if required'),
            bi('novo local', 'new site'),
          ),
          it(
            bi('Calibração da bússola se necessário', 'Compass calibration if required'),
            bi(
              'Obrigatório após transporte longo',
              'Mandatory after long-distance transport',
            ),
          ),
          it(
            bi(
              'Painel radiométrico fotografado antes do voo',
              'Radiometric panel photographed before flight',
            ),
          ),
        ],
      },
      {
        titulo: bi('Descolagem', 'Take-off'),
        itens: [
          it(
            bi('Sinal GNSS estável', 'GNSS signal stable'),
            bi('≥ 12 satélites, HDOP < 1.5', '≥ 12 satellites, HDOP < 1.5'),
            true,
          ),
          it(
            bi('Home Point definido e confirmado', 'Home Point set and confirmed'),
            null,
            true,
          ),
          it(
            bi(
              'Nível de bateria confirmado antes de armar',
              'Battery level confirmed before arming',
            ),
          ),
          it(
            bi(
              'Área de descolagem livre de pessoas e obstáculos',
              'Take-off area clear of people and obstacles',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Hover 30 s após descolagem — comportamento normal',
              'Hover 30 s after take-off — behaviour normal',
            ),
            null,
            true,
          ),
          it(bi('Hora de início registada', 'Start time recorded')),
        ],
      },
      {
        titulo: bi('Monitorização em voo', 'In-flight monitoring'),
        itens: [
          it(
            bi(
              'Bateria monitorizada — retorno se < 30%',
              'Battery monitored — return home if < 30%',
            ),
            null,
            true,
          ),
          it(
            bi('Sinal de telemetria e RC estáveis', 'Telemetry and RC links stable'),
          ),
          it(
            bi('Câmara a capturar', 'Camera capturing'),
            bi('live feed confirmado', 'live feed confirmed'),
          ),
          it(bi('Meteorologia reavaliada em voo', 'Weather reassessed during flight')),
          it(bi('Espaço aéreo monitorizado', 'Airspace monitored')),
          it(
            bi('Anomalias registadas em tempo real', 'Anomalies logged in real time'),
          ),
        ],
      },
      {
        titulo: bi('Aterragem', 'Landing'),
        itens: [
          it(
            bi('Confirmar bateria antes do retorno', 'Confirm battery before return leg'),
          ),
          it(
            bi('Zona de aterragem livre e visível', 'Landing zone clear and in sight'),
          ),
          it(
            bi(
              'Motores desarmados após aterragem completa',
              'Motors disarmed after touchdown is complete',
            ),
            null,
            true,
          ),
          it(
            bi('Hora de fim e duração registadas', 'End time and duration recorded'),
          ),
        ],
      },
      {
        titulo: bi('Entre voos', 'Between flights'),
        itens: [
          it(bi('Substituição de bateria — registar ID', 'Battery swap — record ID')),
          it(
            bi(
              'Verificação rápida de câmara e cartão SD',
              'Quick check of camera and SD card',
            ),
          ),
          it(
            bi(
              'Painel radiométrico refotografado se a luz mudou',
              'Radiometric panel re-photographed if the light changed',
            ),
          ),
          it(
            bi('Plano do voo seguinte confirmado', 'Next flight plan confirmed'),
            bi('sem gaps', 'no gaps'),
          ),
          it(
            bi(
              'Inspecção visual rápida da plataforma',
              'Quick visual inspection of the aircraft',
            ),
          ),
        ],
      },
      // Grupo condicional (T2.4): só aparece com payload LiDAR activo.
      // Textos provisórios — redacção final e durações a validar em campo.
      {
        titulo: bi('LiDAR', 'LiDAR'),
        appliesTo: 'lidar',
        itens: [
          it(
            bi(
              'Base GNSS a registar antes da descolagem',
              'GNSS base logging before takeoff',
            ),
            bi('Confirmar gravação e taxa (≥ 1 Hz)', 'Confirm recording and rate (≥ 1 Hz)'),
            true,
          ),
          it(
            bi(
              'Alinhamento estático do IMU antes de descolar',
              'Static IMU alignment before takeoff',
            ),
            bi(
              'Scanner ligado, plataforma imóvel (~1–3 min)',
              'Scanner on, aircraft still (~1–3 min)',
            ),
            true,
          ),
          it(
            bi(
              'Manobras de calibração antes das fiadas',
              'Calibration manoeuvres before the lines',
            ),
            bi(
              'Ex.: oitos / acelerações, conforme o fabricante',
              'E.g. figure-eights / accelerations, per manufacturer',
            ),
            true,
          ),
          it(
            bi(
              'Manobras de calibração depois das fiadas',
              'Calibration manoeuvres after the lines',
            ),
          ),
          it(
            bi(
              'Alinhamento estático final após aterrar',
              'Final static alignment after landing',
            ),
          ),
        ],
      },
      // Grupo condicional (R2.6): só aparece com uma missão de fachada
      // ativa (appliesTo 'face'). Acrescentado DEPOIS do grupo LiDAR para
      // não deslocar índices de grupos já publicados — o estado gravado é
      // indexado por fase/grupo/item. Textos provisórios, o Pedro afina.
      {
        titulo: bi('Fachada / face', 'Face mode'),
        appliesTo: 'face',
        itens: [
          it(
            bi(
              'Fix RTK verificado antes da primeira passagem',
              'RTK fix verified before the first pass',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Sombreamento GNSS / multipath junto à face avaliado',
              'GNSS shadowing / multipath near the face assessed',
            ),
            bi(
              'Faces altas bloqueiam constelação — vigiar nº de satélites',
              'High faces block the constellation — watch satellite count',
            ),
            true,
          ),
          it(
            bi(
              'Rotores de vento no lado de sotavento considerados',
              'Wind rotors on the lee side considered',
            ),
            bi(
              'Turbulência junto à crista e à base da face',
              'Turbulence near the crest and the foot of the face',
            ),
            true,
          ),
          it(
            bi(
              'Linha de vista visual ao longo de toda a face',
              'Visual line of sight along the whole face',
            ),
          ),
          it(
            bi(
              'Standoff confirmado com o conhecimento mais recente da superfície',
              'Standoff confirmed against the newest surface knowledge',
            ),
            bi(
              'DSM local se existir; sem DSM o standoff segue por verificar',
              'Local DSM when available; without it the standoff stays unverified',
            ),
            true,
          ),
        ],
      },
    ],
  },
  {
    id: 'pos',
    titulo: bi('Pós-campo', 'Post-field'),
    grupos: [
      {
        titulo: bi('Backup imediato', 'Immediate backup'),
        itens: [
          it(
            bi(
              'Imagens copiadas para disco externo no campo',
              'Images copied to an external drive in the field',
            ),
            bi(
              '3-2-1: 3 cópias, 2 suportes, 1 offsite',
              '3-2-1: 3 copies, 2 media types, 1 offsite',
            ),
            true,
          ),
          it(
            bi(
              'Nº de imagens verificado vs. plano',
              'Image count checked against the plan',
            ),
            null,
            true,
          ),
          it(bi('Logs de voo exportados', 'Flight logs exported')),
          it(
            bi(
              'Coordenadas GNSS/RTK dos GCPs exportadas',
              'GNSS/RTK coordinates of the GCPs exported',
            ),
          ),
          it(
            bi(
              'Cartões SD sem formatar até backup confirmado',
              'SD cards left unformatted until backup is confirmed',
            ),
          ),
        ],
      },
      {
        titulo: bi('Controlo de qualidade', 'Quality control'),
        itens: [
          it(
            bi('Amostra de imagens inspecionada', 'Sample of images inspected'),
            bi('blur, exposição', 'blur, exposure'),
          ),
          it(
            bi('Metadados EXIF verificados', 'EXIF metadata checked'),
            bi('GPS, timestamp', 'GPS, timestamp'),
          ),
          it(
            bi(
              'Painel radiométrico pós-voo fotografado',
              'Post-flight radiometric panel photographed',
            ),
          ),
          it(
            bi('Cobertura confirmada sem gaps', 'Coverage confirmed with no gaps'),
          ),
        ],
      },
      {
        titulo: bi('Plataforma e energia', 'Platform and power'),
        itens: [
          it(
            bi('Inspecção pós-voo', 'Post-flight inspection'),
            bi('hélices, motores, estrutura', 'propellers, motors, airframe'),
          ),
          it(bi('Lente e sensor limpos', 'Lens and sensor cleaned')),
          it(
            bi(
              'Baterias a 40–60% para armazenamento',
              'Batteries at 40–60% for storage',
            ),
            bi(
              'LiPo degradam a 100% ou 0% prolongados',
              'LiPo cells degrade if left at 100% or 0% for long periods',
            ),
            true,
          ),
          it(
            bi(
              'Baterias em local fresco e seco',
              'Batteries stored in a cool, dry place',
            ),
          ),
          it(
            bi(
              'Inchamento/aquecimento anormal reportado',
              'Swelling or abnormal heating reported',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Ciclos por bateria actualizados no registo',
              'Cycle count per battery updated in the log',
            ),
          ),
        ],
      },
      {
        titulo: bi('Documentação', 'Documentation'),
        itens: [
          it(bi('Diário de voo preenchido', 'Flight logbook completed')),
          it(bi('Condições meteo registadas', 'Weather conditions recorded')),
          it(bi('Incidentes documentados', 'Incidents documented')),
          it(
            bi('Estrutura de pastas criada', 'Folder structure created'),
            bi(
              'YYYYMMDD_LOCAL_SENSOR_RAW / PROCESSED',
              'YYYYMMDD_SITE_SENSOR_RAW / PROCESSED',
            ),
          ),
          it(
            bi('Dados sincronizados para servidor', 'Data synchronised to the server'),
          ),
          it(
            bi('Inventário conferido', 'Inventory checked'),
            bi('saída = chegada', 'out = back'),
          ),
        ],
      },
    ],
  },
]

/** Cores por fase — strings completas para o JIT do Tailwind as detectar. */
const ACENTOS = {
  pre: {
    titulo: 'text-amber-400',
    caixa: 'border-amber-500 bg-amber-500 text-slate-950',
    barra: 'bg-amber-500',
    risca: 'bg-amber-500/60',
  },
  durante: {
    titulo: 'text-violet-400',
    caixa: 'border-violet-500 bg-violet-500 text-slate-950',
    barra: 'bg-violet-500',
    risca: 'bg-violet-500/60',
  },
  pos: {
    titulo: 'text-teal-400',
    caixa: 'border-teal-500 bg-teal-500 text-slate-950',
    barra: 'bg-teal-500',
    risca: 'bg-teal-500/60',
  },
}

/** Strings de interface — dicionário interno a esta página. */
const UI = {
  back: bi('← Voltar ao planeador', '← Back to planner'),
  title: bi('Checklist de Campo UAV', 'UAV Field Checklist'),
  subtitle: bi(
    'Pré-campo · Durante · Pós-campo + Relatório de missão',
    'Pre-field · In-field · Post-field + Mission report',
  ),
  exportJson: bi('Exportar JSON', 'Export JSON'),
  printFilled: bi('Imprimir preenchido', 'Print filled in'),
  printBlank: bi('Imprimir em branco', 'Print blank'),
  clear: bi('Limpar', 'Clear'),
  clearConfirm: bi(
    'Limpar toda a checklist, tabelas e notas? Esta acção não pode ser anulada.',
    'Clear the whole checklist, tables and notes? This action cannot be undone.',
  ),
  missionSection: bi('Identificação da missão', 'Mission identification'),
  flightsSection: bi('Registo de voos', 'Flight log'),
  gcpSection: bi('Pontos de controlo — GCPs', 'Ground control points — GCPs'),
  notesSection: bi('Notas de missão', 'Mission notes'),
  addFlight: bi('+ Voo', '+ Flight'),
  addGcp: bi('+ GCP', '+ GCP'),
  removeLast: bi('− Remover última', '− Remove last'),
  emptyRows: bi('Sem linhas.', 'No rows.'),
  importBlocks: bi('Importar blocos do plano', 'Import plan blocks'),
  importGcps: bi('Importar GCPs do plano', 'Import planned GCPs'),
  items: bi('itens', 'items'),
  autosave: bi(
    'Guardado automaticamente neste navegador.',
    'Saved automatically in this browser.',
  ),
}

const ASSINATURAS = [
  bi('Piloto responsável', 'Pilot in command'),
  bi('Supervisor técnico', 'Technical supervisor'),
  bi('Validação de dados', 'Data validation'),
]

const CAMPOS_MISSAO = [
  {
    key: 'operador',
    label: bi('Operador / Piloto', 'Operator / Pilot'),
    placeholder: bi('Nome', 'Name'),
  },
  {
    key: 'missao',
    label: bi('Missão / Projecto', 'Mission / Project'),
    placeholder: bi('Designação', 'Designation'),
  },
  {
    key: 'local',
    label: bi('Área / Local', 'Area / Site'),
    placeholder: bi('Local do levantamento', 'Survey site'),
  },
  {
    key: 'plataforma',
    label: bi('Plataforma UAV', 'UAV platform'),
    placeholder: bi('Modelo', 'Model'),
  },
  {
    key: 'data',
    label: bi('Data', 'Date'),
    placeholder: bi('AAAA-MM-DD', 'YYYY-MM-DD'),
    type: 'date',
  },
]

const COLS_VOO = [
  { key: 'n', label: bi('#', '#'), w: 'w-12' },
  { key: 'inicio', label: bi('Hora início', 'Start time'), w: 'w-24' },
  { key: 'fim', label: bi('Hora fim', 'End time'), w: 'w-24' },
  { key: 'duracao', label: bi('Duração (min)', 'Duration (min)'), w: 'w-24' },
  { key: 'baterias', label: bi('Bateria(s)', 'Battery(ies)'), w: 'w-28' },
  { key: 'area', label: bi('Área (ha)', 'Area (ha)'), w: 'w-24' },
  { key: 'imagens', label: bi('Nº imagens', 'No. of images'), w: 'w-24' },
  { key: 'sensor', label: bi('Sensor', 'Sensor'), w: 'w-32' },
  { key: 'meteo', label: bi('Meteo', 'Weather'), w: 'w-32' },
  { key: 'obs', label: bi('Observações', 'Remarks'), w: 'w-64' },
]

const COLS_GCP = [
  { key: 'n', label: bi('#', '#'), w: 'w-12' },
  { key: 'ident', label: bi('ID', 'ID'), w: 'w-24' },
  { key: 'lat', label: bi('Latitude', 'Latitude'), w: 'w-32' },
  { key: 'lon', label: bi('Longitude', 'Longitude'), w: 'w-32' },
  { key: 'alt', label: bi('Altitude (m)', 'Altitude (m)'), w: 'w-24' },
  { key: 'crs', label: bi('Datum-CRS', 'Datum-CRS'), w: 'w-32' },
  { key: 'metodo', label: bi('Método', 'Method'), w: 'w-28' },
  { key: 'incerteza', label: bi('Incerteza (m)', 'Uncertainty (m)'), w: 'w-24' },
  { key: 'obs', label: bi('Observações', 'Remarks'), w: 'w-56' },
]

const CAMPOS_NOTAS = [
  { key: 'anomalias', label: bi('Anomalias e incidentes', 'Anomalies and incidents') },
  { key: 'qualidade', label: bi('Qualidade dos dados', 'Data quality') },
  { key: 'condicoes', label: bi('Condições de campo', 'Field conditions') },
  { key: 'seguimento', label: bi('Acções de seguimento', 'Follow-up actions') },
]

let seq = 0
const uid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`

const linhaVazia = (cols) =>
  cols.reduce((acc, c) => ({ ...acc, [c.key]: '' }), { _id: uid() })

const chaveItem = (faseId, gi, ii) => `${faseId}.${gi}.${ii}`

const hoje = () => new Date().toISOString().slice(0, 10)

/** Marcas diacríticas combinatórias (bloco U+0300–U+036F). */
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

const slug = (s) =>
  (s || 'missao')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'missao'

/* --------------------------- Subcomponentes --------------------------- */

function Titulo({ children, className = '' }) {
  return (
    <h2
      className={`text-[11px] font-semibold uppercase tracking-widest text-sky-400 ${className}`}
    >
      {children}
    </h2>
  )
}

function Botao({ children, onClick, tom = 'neutro', disabled }) {
  const tons = {
    neutro:
      'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700',
    primario: 'bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-600',
    aviso: 'bg-slate-800 text-slate-300 hover:bg-red-900/60 hover:text-red-200 border border-slate-700',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tons[tom]}`}
    >
      {children}
    </button>
  )
}

function CampoTexto({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="chk-fill w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
      />
    </label>
  )
}

function Celula({ value, onChange }) {
  return (
    <td className="border border-slate-800 p-0 align-top">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="chk-fill w-full bg-transparent px-2 py-1 text-[12px] text-slate-100 focus:bg-slate-800/60 focus:outline-none"
      />
    </td>
  )
}

function ItemChecklist({ item, feito, onToggle, acento }) {
  const L = useL()
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={feito}
        className="chk-item flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-slate-800/50"
      >
        <span
          className={`chk-box mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[10px] font-bold leading-none ${
            feito ? acento.caixa : 'border-slate-600 bg-slate-950 text-transparent'
          }`}
        >
          <span className="chk-mark">{feito ? '✓' : ''}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`chk-text block text-[13px] leading-snug ${
              feito ? 'text-slate-500 line-through' : 'text-slate-200'
            }`}
          >
            {L(item.texto)}
            {item.critico && (
              <span className="chk-crit ml-1.5 inline-block rounded-sm border border-red-500/60 bg-red-500/10 px-1 align-middle font-mono text-[9px] font-bold uppercase tracking-wider text-red-400">
                CRIT
              </span>
            )}
          </span>
          {item.nota && (
            <span className="chk-note mt-0.5 block font-mono text-[10px] leading-tight text-slate-500">
              {L(item.nota)}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function BarraProgresso({ feitos, total, acento }) {
  const L = useL()
  const pct = total ? Math.round((feitos / total) * 100) : 0
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-1 flex items-baseline justify-between font-mono text-[10px] text-slate-400">
        <span>
          {feitos}/{total} {L(UI.items)}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${acento.barra}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ColunaFase({ fase, checked, onToggle, sensorType, faceMode }) {
  const L = useL()
  const acento = ACENTOS[fase.id]
  const { feitos, total } = useMemo(() => {
    let f = 0
    let t = 0
    fase.grupos.forEach((g, gi) => {
      if (!groupApplies(g, sensorType, { face: faceMode })) return
      g.itens.forEach((_, ii) => {
        t += 1
        if (checked[chaveItem(fase.id, gi, ii)]) f += 1
      })
    })
    return { feitos: f, total: t }
  }, [fase, checked, sensorType, faceMode])

  return (
    <section className="chk-coluna flex flex-col rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-3 w-1 rounded-full ${acento.risca}`} />
        <h2
          className={`text-[11px] font-semibold uppercase tracking-widest ${acento.titulo}`}
        >
          {L(fase.titulo)}
        </h2>
      </div>

      <div className="flex-1 space-y-4">
        {/* filtragem sem reindexar: gi original preserva as chaves gravadas */}
        {fase.grupos.map((grupo, gi) => groupApplies(grupo, sensorType, { face: faceMode }) && (
          <div key={`${fase.id}.${gi}`} className="chk-grupo">
            <h3 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {L(grupo.titulo)}
            </h3>
            <ul className="space-y-0.5">
              {grupo.itens.map((item, ii) => {
                const k = chaveItem(fase.id, gi, ii)
                return (
                  <ItemChecklist
                    key={k}
                    item={item}
                    feito={!!checked[k]}
                    acento={acento}
                    onToggle={() => onToggle(k)}
                  />
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <BarraProgresso feitos={feitos} total={total} acento={acento} />
    </section>
  )
}

function Tabela({
  titulo,
  cols,
  linhas,
  onCell,
  onAdd,
  onRemove,
  extra,
  minWidth,
  rotuloAdd,
}) {
  const L = useL()
  return (
    <section className="chk-bloco rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Titulo>{L(titulo)}</Titulo>
        <div className="no-print flex flex-wrap items-center gap-2">
          {extra}
          <Botao onClick={onAdd}>{L(rotuloAdd)}</Botao>
          <Botao onClick={onRemove} tom="aviso" disabled={linhas.length === 0}>
            {L(UI.removeLast)}
          </Botao>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`chk-tabela w-full border-collapse text-left ${minWidth}`}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`border border-slate-800 bg-slate-950 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${c.w}`}
                >
                  {L(c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, li) => (
              <tr key={linha._id}>
                {cols.map((c) => (
                  <Celula
                    key={c.key}
                    value={linha[c.key] ?? ''}
                    onChange={(v) => onCell(li, c.key, v)}
                  />
                ))}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length}
                  className="border border-slate-800 px-2 py-3 text-center text-[12px] text-slate-600"
                >
                  {L(UI.emptyRows)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CaixaNota({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="chk-fill chk-nota w-full resize-y rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[13px] leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
      />
    </label>
  )
}

/* ------------------------------ Página ------------------------------ */

export default function ChecklistPage({
  missionName = '',
  droneLabel = '',
  sensorType = 'camera',
  faceMode = false, // liga o grupo 'face' quando houver missão de fachada
  blocks = [],
  plannedGcps = [],
  onBack,
}) {
  const lang = useLang()
  const L = (v) => tr(v, lang)

  const [hidratado, setHidratado] = useState(false)
  const [checked, setChecked] = useState({})
  const [missao, setMissao] = useState(() => ({
    operador: '',
    missao: missionName || '',
    local: '',
    plataforma: droneLabel || '',
    data: hoje(),
  }))
  const [voos, setVoos] = useState(() => [
    linhaVazia(COLS_VOO),
    linhaVazia(COLS_VOO),
    linhaVazia(COLS_VOO),
  ])
  const [gcps, setGcps] = useState(() =>
    Array.from({ length: 5 }, () => linhaVazia(COLS_GCP)),
  )
  const [notas, setNotas] = useState({
    anomalias: '',
    qualidade: '',
    condicoes: '',
    seguimento: '',
  })

  /* ---------- Hidratação a partir do localStorage (uma vez) ---------- */
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(STORAGE_KEY)
      if (bruto) {
        const g = JSON.parse(bruto)
        if (g && typeof g === 'object') {
          if (g.checked && typeof g.checked === 'object') setChecked(g.checked)
          if (g.missao && typeof g.missao === 'object') {
            setMissao((m) => ({
              ...m,
              ...g.missao,
              missao: g.missao.missao || m.missao,
              plataforma: g.missao.plataforma || m.plataforma,
              data: g.missao.data || m.data,
            }))
          }
          if (Array.isArray(g.voos)) {
            setVoos(g.voos.map((l) => ({ ...linhaVazia(COLS_VOO), ...l, _id: uid() })))
          }
          if (Array.isArray(g.gcps)) {
            setGcps(g.gcps.map((l) => ({ ...linhaVazia(COLS_GCP), ...l, _id: uid() })))
          }
          if (g.notas && typeof g.notas === 'object') {
            setNotas((n) => ({ ...n, ...g.notas }))
          }
        }
      }
    } catch {
      /* armazenamento indisponível ou dados corrompidos — ignorar */
    }
    setHidratado(true)
  }, [])

  /* ------------- Gravação automática com debounce simples ------------- */
  useEffect(() => {
    if (!hidratado) return undefined
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ checked, missao, voos, gcps, notas }),
        )
      } catch {
        /* quota excedida ou modo privado — ignorar */
      }
    }, SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [hidratado, checked, missao, voos, gcps, notas])

  /* ------------------------------ Acções ------------------------------ */
  const toggle = (k) => setChecked((c) => ({ ...c, [k]: !c[k] }))

  const setCampoMissao = (k, v) => setMissao((m) => ({ ...m, [k]: v }))
  const setNota = (k, v) => setNotas((n) => ({ ...n, [k]: v }))

  const editarLinha = (setter) => (idx, key, valor) =>
    setter((linhas) =>
      linhas.map((l, i) => (i === idx ? { ...l, [key]: valor } : l)),
    )

  const setCelulaVoo = editarLinha(setVoos)
  const setCelulaGcp = editarLinha(setGcps)

  const resumo = useMemo(() => {
    const porFase = {}
    let feitos = 0
    let total = 0
    FASES.forEach((fase) => {
      const itens = []
      fase.grupos.forEach((g, gi) => {
        if (!groupApplies(g, sensorType, { face: faceMode })) return
        g.itens.forEach((item, ii) => {
          const texto = tr(item.texto, lang)
          const nota = tr(item.nota, lang)
          itens.push({
            texto: nota ? `${texto} (${nota})` : texto,
            concluido: !!checked[chaveItem(fase.id, gi, ii)],
            critico: !!item.critico,
          })
        })
      })
      const c = itens.filter((i) => i.concluido).length
      porFase[fase.id] = { itens, concluidos: c, total: itens.length }
      feitos += c
      total += itens.length
    })
    return { porFase, feitos, total }
  }, [checked, lang, sensorType, faceMode])

  const importarBlocos = () => {
    if (!blocks || blocks.length === 0) return
    const novas = blocks.map((b, i) => ({
      ...linhaVazia(COLS_VOO),
      n: String(b.id ?? i + 1),
      area: Number.isFinite(b.areaHa) ? b.areaHa.toFixed(1) : '',
      duracao: Number.isFinite(b.timeS) ? String(Math.round(b.timeS / 60)) : '',
    }))
    setVoos((prev) => {
      const preenchidas = prev.filter((l) =>
        COLS_VOO.some((c) => String(l[c.key] ?? '').trim() !== ''),
      )
      return [...preenchidas, ...novas]
    })
  }

  const importarGcps = () => {
    if (!plannedGcps || plannedGcps.length === 0) return
    const novas = plannedGcps.map((g, i) => ({
      ...linhaVazia(COLS_GCP),
      n: String(i + 1),
      ident: g.id ?? `GCP-${String(i + 1).padStart(2, '0')}`,
      lat: Number.isFinite(g.point?.[1]) ? g.point[1].toFixed(6) : '',
      lon: Number.isFinite(g.point?.[0]) ? g.point[0].toFixed(6) : '',
      crs: 'WGS84',
    }))
    setGcps((prev) => {
      const preenchidas = prev.filter((l) =>
        COLS_GCP.some((c) => String(l[c.key] ?? '').trim() !== ''),
      )
      return [...preenchidas, ...novas]
    })
  }

  const limpar = () => {
    if (!window.confirm(L(UI.clearConfirm))) {
      return
    }
    setChecked({})
    setMissao({
      operador: '',
      missao: missionName || '',
      local: '',
      plataforma: droneLabel || '',
      data: hoje(),
    })
    setVoos([linhaVazia(COLS_VOO), linhaVazia(COLS_VOO), linhaVazia(COLS_VOO)])
    setGcps(Array.from({ length: 5 }, () => linhaVazia(COLS_GCP)))
    setNotas({ anomalias: '', qualidade: '', condicoes: '', seguimento: '' })
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignorar */
    }
  }

  const semId = (linhas) =>
    linhas.map(({ _id, ...resto }) => resto)

  const exportarJSON = () => {
    const payload = {
      idioma: lang,
      missao: { ...missao },
      checklist: {
        pre: resumo.porFase.pre,
        durante: resumo.porFase.durante,
        pos: resumo.porFase.pos,
      },
      voos: semId(voos),
      gcps: semId(gcps),
      notas: { ...notas },
      exportado_em: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checklist-${slug(missao.missao)}-${missao.data || hoje()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const imprimirPreenchido = () => window.print()

  const imprimirEmBranco = () => {
    document.body.classList.add('print-blank')
    window.print()
    document.body.classList.remove('print-blank')
  }

  const pctGlobal = resumo.total
    ? Math.round((resumo.feitos / resumo.total) * 100)
    : 0

  return (
    <div className="chk-root min-h-full bg-slate-950 text-slate-100">
      <style>{PRINT_CSS}</style>

      <div className="mx-auto max-w-[1600px] px-4 py-5">
        {/* -------------------------- Cabeçalho -------------------------- */}
        <header className="mb-5">
          <div className="no-print mb-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            >
              {L(UI.back)}
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-100">
                {L(UI.title)}
              </h1>
              <p className="mt-0.5 text-[13px] text-slate-400">{L(UI.subtitle)}</p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {resumo.feitos}/{resumo.total} · {pctGlobal}%
              </span>
              <Botao onClick={exportarJSON} tom="primario">
                {L(UI.exportJson)}
              </Botao>
              <Botao onClick={imprimirPreenchido}>{L(UI.printFilled)}</Botao>
              <Botao onClick={imprimirEmBranco}>{L(UI.printBlank)}</Botao>
              <Botao onClick={limpar} tom="aviso">
                {L(UI.clear)}
              </Botao>
            </div>
          </div>
        </header>

        {/* ---------------------- Campos da missão ---------------------- */}
        <section className="chk-bloco mb-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <Titulo className="mb-3">{L(UI.missionSection)}</Titulo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CAMPOS_MISSAO.map((c) => (
              <CampoTexto
                key={c.key}
                label={L(c.label)}
                type={c.type}
                placeholder={L(c.placeholder)}
                value={missao[c.key] ?? ''}
                onChange={(v) => setCampoMissao(c.key, v)}
              />
            ))}
          </div>
        </section>

        {/* -------------------- Colunas de checklist -------------------- */}
        <div className="chk-cols mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {FASES.map((fase) => (
            <ColunaFase
              key={fase.id}
              fase={fase}
              checked={checked}
              onToggle={toggle}
              sensorType={sensorType}
              faceMode={faceMode}
            />
          ))}
        </div>

        {/* ------------------------ Registo de voos ---------------------- */}
        <div className="mb-5">
          <Tabela
            titulo={UI.flightsSection}
            cols={COLS_VOO}
            linhas={voos}
            rotuloAdd={UI.addFlight}
            minWidth="min-w-[1160px]"
            onCell={setCelulaVoo}
            onAdd={() => setVoos((v) => [...v, linhaVazia(COLS_VOO)])}
            onRemove={() => setVoos((v) => v.slice(0, -1))}
            extra={
              blocks && blocks.length > 0 ? (
                <Botao onClick={importarBlocos}>
                  {L(UI.importBlocks)} ({blocks.length})
                </Botao>
              ) : null
            }
          />
        </div>

        {/* --------------------------- GCPs ----------------------------- */}
        <div className="mb-5">
          <Tabela
            titulo={UI.gcpSection}
            cols={COLS_GCP}
            linhas={gcps}
            rotuloAdd={UI.addGcp}
            minWidth="min-w-[1040px]"
            onCell={setCelulaGcp}
            onAdd={() => setGcps((g) => [...g, linhaVazia(COLS_GCP)])}
            onRemove={() => setGcps((g) => g.slice(0, -1))}
            extra={
              plannedGcps && plannedGcps.length > 0 ? (
                <Botao onClick={importarGcps}>
                  {L(UI.importGcps)} ({plannedGcps.length})
                </Botao>
              ) : null
            }
          />
        </div>

        {/* --------------------------- Notas ---------------------------- */}
        <section className="chk-bloco mb-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <Titulo className="mb-3">{L(UI.notesSection)}</Titulo>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {CAMPOS_NOTAS.map((c) => (
              <CaixaNota
                key={c.key}
                label={L(c.label)}
                value={notas[c.key] ?? ''}
                onChange={(v) => setNota(c.key, v)}
              />
            ))}
          </div>
        </section>

        {/* ------------------------ Assinaturas -------------------------- */}
        <section className="chk-assinaturas">
          <div className="grid grid-cols-3 gap-8 pt-8">
            {ASSINATURAS.map((papel) => (
              <div key={papel.pt}>
                <div className="h-8 border-b border-slate-600" />
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {L(papel)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="no-print mt-6 text-center font-mono text-[10px] text-slate-600">
          {L(UI.autosave)}
        </p>
      </div>
    </div>
  )
}

/* --------------------------- Estilos de impressão --------------------------- */

const PRINT_CSS = `
.chk-assinaturas { display: none; }

@media print {
  @page { size: A4 portrait; margin: 10mm; }

  html, body {
    background: #fff !important;
    color: #000 !important;
  }

  .no-print { display: none !important; }

  .chk-root,
  .chk-root * {
    background: transparent !important;
    color: #000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  .chk-root {
    min-height: 0 !important;
    font-size: 9pt;
  }

  .chk-root .chk-bloco,
  .chk-root .chk-coluna {
    border: 1px solid #bbb !important;
    border-radius: 0 !important;
    padding: 3mm !important;
    break-inside: avoid;
  }

  .chk-cols {
    display: grid !important;
    grid-template-columns: 1fr 1fr 1fr !important;
    gap: 4mm !important;
  }

  .chk-grupo { break-inside: avoid; }

  .chk-item {
    padding: 0.4mm 0 !important;
  }

  .chk-box {
    border: 1px solid #444 !important;
    border-radius: 1px !important;
  }

  .chk-text,
  .chk-note {
    font-size: 7.5pt !important;
    line-height: 1.25 !important;
  }

  .chk-crit {
    border: 1px solid #777 !important;
    font-size: 6pt !important;
  }

  .chk-root input,
  .chk-root textarea {
    border: 1px solid #ccc !important;
    border-radius: 0 !important;
    font-size: 8pt !important;
    resize: none !important;
  }

  .chk-root .chk-tabela {
    min-width: 0 !important;
    width: 100% !important;
    table-layout: fixed;
    font-size: 7.5pt !important;
  }

  .chk-root .chk-tabela th,
  .chk-root .chk-tabela td {
    border: 1px solid #ccc !important;
    padding: 0.5mm 1mm !important;
    width: auto !important;
    min-width: 0 !important;
  }

  .chk-root .chk-tabela input {
    border: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
    font-size: 7.5pt !important;
  }

  .chk-root .overflow-x-auto { overflow: visible !important; }

  .chk-assinaturas {
    display: block !important;
    break-inside: avoid;
    margin-top: 8mm;
  }

  .chk-assinaturas .border-b { border-bottom: 1px solid #000 !important; }
  .chk-assinaturas p { font-size: 7.5pt !important; }
}

/* ------- Impressão em branco: esconder tudo o que foi preenchido ------- */
@media print {
  body.print-blank .chk-fill {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  body.print-blank input.chk-fill {
    border: 0 !important;
    border-bottom: 1px solid #999 !important;
  }

  body.print-blank .chk-nota {
    border: 1px solid #ccc !important;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 5.2mm,
      #ddd 5.2mm,
      #ddd 5.3mm
    ) !important;
  }

  body.print-blank .chk-mark { display: none !important; }

  body.print-blank .chk-box {
    border: 1px solid #444 !important;
    background: transparent !important;
  }

  body.print-blank .chk-text {
    text-decoration: none !important;
  }
}
`
