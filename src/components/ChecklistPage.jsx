import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLang, useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { flightLogRows, groupApplies, mergeFlightLog, missingPlanRows } from '../data/checklist.js'
import { BaseSheetPage, baseInk } from './BaseFieldSheets.jsx'
import { Button } from './ui/Button.jsx'
import {
  IconCheckCircle,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconShield,
  IconTrash,
} from './Icons.jsx'
import { dayFlightOrder } from '../mission/fieldSheet.js'
import { rthRangeLabel } from '../mission/transitLegs.js'
import { safeFileStem } from '../utils/exporters.js'

/* ------------------------------------------------------------------ *
 * Checklist de campo UAV — pré-campo, durante, pós-campo + relatório.
 * Persistência local automática, exportação JSON e impressão (A4).
 * As fases em separadores com o progresso, os grupos que fecham, itens
 * de 52 px e caixas de 24 px (com luvas); e a folha A4 de cada base, com
 * o código QR do ponto, para ver e imprimir (BaseSheetPage).
 *
 * Bilingue PT/EN com dicionário interno: o conteúdo é longo e muito
 * estruturado, pelo que cada texto vive junto do item a que pertence
 * como par `{ pt, en }`. As chaves de estado (checks) usam índices
 * fase/grupo/item e são, por isso, independentes da língua activa.
 * ------------------------------------------------------------------ */

/** A chave antiga, sem missão (a de quem actualizou); a de cada missão acrescenta-lhe o nome. */
export const STORAGE_KEY = 'dji-mission-planner:checklist:v1'
const SAVE_DELAY_MS = 400

/**
 * Chave do armazenamento POR MISSÃO (M3-U5): uma só checklist para todos os
 * projectos abria a missão de hoje com a missão, a plataforma e os itens
 * críticos de outra já marcados — e é o registo que se exporta e imprime.
 * A chave antiga (sem missão) é a de quem actualizou: lê-se uma vez.
 */
export function checklistStorageKey(missionName) {
  const slug = String(missionName ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${STORAGE_KEY}:${slug || 'missao'}`
}

/** Par bilingue PT/EN. */
const bi = (pt, en) => ({ pt, en })

/** Resolve um par bilingue (ou string simples) na língua pedida. */
const tr = (v, lang) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return v[lang] ?? v.pt ?? ''
}

/**
 * Lê o estado gravado do checklist. Corre uma vez, no inicializador
 * preguiçoso do `useState`: assim os átomos nascem já com os valores
 * gravados, em vez de nascerem vazios e serem corrigidos por um efeito —
 * que custava um render extra e deixava uma janela em que a gravação podia
 * escrever por cima da leitura (era o que o `hidratado` guardava).
 */
function lerChave(chave) {
  return objectoDe(lerTexto(chave))
}

/** O texto gravado numa chave (null: nada, ou armazenamento indisponível). */
function lerTexto(chave) {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null
  }
}

/** O objecto de um texto gravado (null: vazio ou corrompido). */
function objectoDe(bruto) {
  try {
    const g = bruto ? JSON.parse(bruto) : null
    return g && typeof g === 'object' ? g : null
  } catch {
    /* dados corrompidos */
    return null
  }
}

/**
 * O que está gravado para esta missão: `dados` (a checklist desta missão,
 * ou vazia), `outra` (a checklist antiga, sem chave de missão, quando é de
 * outra missão e ainda não se decidiu o que lhe fazer) e `texto`, o texto
 * gravado na chave da missão (a base da fusão com o planeador).
 */
function lerGuardado(missionName) {
  const texto = lerTexto(checklistStorageKey(missionName))
  const propria = objectoDe(texto)
  if (propria) return { dados: propria, outra: null, texto }
  const antiga = lerChave(STORAGE_KEY)
  if (!antiga) return { dados: {}, outra: null, texto }
  const nome = antiga.missionName ?? antiga.missao?.missao ?? ''
  if (!nome || nome === missionName) return { dados: antiga, outra: null, texto }
  return { dados: {}, outra: { ...antiga, nome }, texto }
}

/** Atalho para declarar um item: texto, nota opcional, crítico opcional. */
const it = (texto, nota = null, critico = false) => ({ texto, nota, critico })

/**
 * As fases e os itens, com os textos tirados do plano (M3-U11): a
 * sobreposição planeada, os GCPs planeados, a reserva com que o tempo útil
 * foi medido, e o item da altura única só sem seguir terreno. `ctx`:
 * {front, side, gcps, terrainFollowOn}.
 */
const fasesDe = (ctx) => [
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
              'Hélices fixas com sentido correcto por motor',
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
          it(bi('Sistema de aterragem / patins verificado', 'Landing gear / skids checked')),
        ],
      },
      {
        titulo: bi('Software e firmware', 'Software and firmware'),
        itens: [
          it(
            bi(
              'Firmware do UAS actualizado — versão estável',
              'UAS firmware up to date — stable release',
            ),
            bi(
              'Não actualizar em campo, apenas em base',
              'Do not update in the field, only at base',
            ),
            true,
          ),
          it(
            bi('Software de missão actualizado', 'Mission planning software up to date'),
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
            bi('Plano de voo carregado e validado', 'Flight plan uploaded and validated'),
            bi(
              `Sobreposição do plano: ${ctx.front}/${ctx.side} % (mínimo habitual 60 / 50 %)`,
              `Plan overlap: ${ctx.front}/${ctx.side} % (usual minimum 60 / 50 %)`,
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
              'Missões em áreas remotas sem rede eléctrica',
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
          it(bi('Gimbal desbloqueado com movimentação livre', 'Gimbal unlocked and moving freely')),
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
            bi('Targets GCP preparados e identificados', 'GCP targets prepared and labelled'),
            bi(
              `Contraste com o terreno; ${ctx.gcps} planeado(s) no cartão 6`,
              `Contrast against the ground; ${ctx.gcps} planned on card 6`,
            ),
          ),
          it(bi('Cartografia de base da área disponível', 'Base mapping of the area available')),
        ],
      },
      {
        titulo: bi('Plano de voo e segurança', 'Flight plan and safety'),
        itens: [
          it(
            bi(
              'Altura de segurança acima dos obstáculos definida',
              'Safe height above obstacles defined',
            ),
          ),
          it(
            bi(
              'Autonomia estimada com margem de retorno ≥ 30%',
              'Estimated endurance with ≥ 30% return margin',
            ),
          ),
          it(
            bi('Autorização de voo / NOTAM obtida', 'Flight authorisation / NOTAM obtained'),
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
            bi('Briefing de segurança à equipa preparado', 'Safety briefing for the crew prepared'),
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
            bi('Armazenamento do scanner com espaço livre', 'Scanner storage with free space'),
            bi(
              'Cartão/SSD formatado; capacidade para o dia',
              'Card/SSD formatted; capacity for the day',
            ),
            true,
          ),
          it(bi('Bateria própria do scanner carregada', 'Scanner battery charged'), null, true),
          it(
            bi('Plano PPK: base GNSS e ficheiros RINEX', 'PPK plan: GNSS base and RINEX files'),
            bi(
              'Estação base própria montada ou CORS definida',
              'Own base station planned or CORS chosen',
            ),
            true,
          ),
        ],
      },
      // Grupo condicional: só aparece com uma missão de corredor activa
      // (appliesTo 'corridor'). Acrescentado no FIM dos grupos da fase, como
      // o de fachada, para não deslocar índices já publicados — o estado
      // gravado é indexado por fase/grupo/item.
      {
        titulo: bi('Corredor', 'Corridor'),
        appliesTo: 'corridor',
        itens: [
          it(
            bi(
              'Traçado do eixo confirmado contra cartografia actual',
              'Centreline checked against current mapping',
            ),
            bi(
              'Obras, desvios e troços cortados desde o último levantamento',
              'Works, diversions and closed sections since the last survey',
            ),
          ),
          it(
            bi(
              'Autorização de sobrevoo do corredor e do domínio público envolvido',
              'Overflight permission for the corridor and the public domain crossed',
            ),
            null,
            true,
          ),
          it(
            bi(
              'Pontos de descolagem e recolha ao longo do traçado, com acesso viário',
              'Take-off and recovery points along the route, with road access',
            ),
            bi(
              'O corredor não se divide por bateria — os pontos são planeados à mão',
              'The corridor does not split by battery — the points are planned by hand',
            ),
          ),
          ...(ctx.terrainFollowOn
            ? [
                it(
                  bi(
                    'Alturas a seguir o terreno validadas contra o relevo (perfil e folga ao solo)',
                    'Terrain-following heights validated against the relief (profile and ground clearance)',
                  ),
                  bi(
                    'Modo nadir com seguimento de terreno: cada waypoint leva a sua altura; a cota de descolagem é a referência',
                    'Nadir with terrain following: each waypoint carries its own height; the take-off elevation is the reference',
                  ),
                  true,
                ),
              ]
            : [
                it(
                  bi(
                    'Altura única validada contra o ponto mais alto de todo o traçado',
                    'Single height validated against the highest point of the whole route',
                  ),
                  bi(
                    'Modo nadir sem seguimento de terreno: a cota de descolagem é a referência de tudo',
                    'Nadir only, no terrain following: the take-off elevation is the reference throughout',
                  ),
                  true,
                ),
              ]),
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
            bi('GCPs colocados e coordenadas registadas', 'GCPs laid out and coordinates recorded'),
            null,
            true,
          ),
          it(
            bi('Calibração IMU se necessário', 'IMU calibration if required'),
            bi('novo local', 'new site'),
          ),
          it(
            bi('Calibração da bússola se necessário', 'Compass calibration if required'),
            bi('Obrigatório após transporte longo', 'Mandatory after long-distance transport'),
          ),
          it(
            bi(
              'Painel radiométrico fotografado antes do voo',
              'Radiometric panel photographed before flight',
            ),
          ),
        ],
      },
      // os quatro grupos que se repetem em cada voo («Por voo»): as mesmas
      // caixas em todos os voos; o selector de voo só escolhe o que se mostra
      {
        titulo: bi('Descolagem', 'Take-off'),
        porVoo: true,
        itens: [
          it(
            bi('Sinal GNSS estável', 'GNSS signal stable'),
            bi('≥ 12 satélites, HDOP < 1.5', '≥ 12 satellites, HDOP < 1.5'),
            true,
          ),
          it(bi('Home Point definido e confirmado', 'Home Point set and confirmed'), null, true),
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
        porVoo: true,
        itens: [
          it(
            bi(
              'Bateria monitorizada: regressar com a reserva com que o tempo útil foi medido (15–20 %); o plano já a desconta',
              'Battery monitored: return with the reserve the usable time was measured with (15–20 %); the plan already deducts it',
            ),
            null,
            true,
          ),
          it(bi('Sinal de telemetria e RC estáveis', 'Telemetry and RC links stable')),
          it(
            bi('Câmara a capturar', 'Camera capturing'),
            bi('live feed confirmado', 'live feed confirmed'),
          ),
          it(bi('Meteorologia reavaliada em voo', 'Weather reassessed during flight')),
          it(bi('Espaço aéreo monitorizado', 'Airspace monitored')),
          it(bi('Anomalias registadas em tempo real', 'Anomalies logged in real time')),
        ],
      },
      {
        titulo: bi('Aterragem', 'Landing'),
        porVoo: true,
        itens: [
          it(bi('Confirmar bateria antes do retorno', 'Confirm battery before return leg')),
          it(bi('Zona de aterragem livre e visível', 'Landing zone clear and in sight')),
          it(
            bi(
              'Motores desarmados após aterragem completa',
              'Motors disarmed after touchdown is complete',
            ),
            null,
            true,
          ),
          it(bi('Hora de fim e duração registadas', 'End time and duration recorded')),
        ],
      },
      {
        titulo: bi('Entre voos', 'Between flights'),
        porVoo: true,
        itens: [
          it(bi('Substituição de bateria — registar ID', 'Battery swap — record ID')),
          it(bi('Verificação rápida de câmara e cartão SD', 'Quick check of camera and SD card')),
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
            bi('Inspecção visual rápida da plataforma', 'Quick visual inspection of the aircraft'),
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
            bi('Base GNSS a registar antes da descolagem', 'GNSS base logging before take-off'),
            bi('Confirmar gravação e taxa (≥ 1 Hz)', 'Confirm recording and rate (≥ 1 Hz)'),
            true,
          ),
          it(
            bi(
              'Alinhamento estático do IMU antes de descolar',
              'Static IMU alignment before take-off',
            ),
            bi(
              'Scanner ligado, plataforma imóvel (~1–3 min)',
              'Scanner on, aircraft still (~1–3 min)',
            ),
            true,
          ),
          it(
            bi(
              'Manobras de calibração antes das faixas',
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
              'Manobras de calibração depois das faixas',
              'Calibration manoeuvres after the lines',
            ),
          ),
          it(bi('Alinhamento estático final após aterrar', 'Final static alignment after landing')),
        ],
      },
      // Grupo condicional (R2.6): só aparece com uma missão de fachada
      // activa (appliesTo 'face'). Acrescentado DEPOIS do grupo LiDAR para
      // não deslocar índices de grupos já publicados — o estado gravado é
      // indexado por fase/grupo/item. Textos provisórios, o Pedro afina.
      {
        titulo: bi('Modo Face', 'Face mode'),
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
              'Faces altas bloqueiam constelação — vigiar o n.º de satélites',
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
              'Afastamento confirmado com o conhecimento mais recente da superfície',
              'Standoff confirmed against the newest surface knowledge',
            ),
            bi(
              'Modelo local (MDT/MDS) se existir; sem ele o afastamento fica por verificar',
              'Local DTM/DSM when available; without it the standoff stays unverified',
            ),
            true,
          ),
        ],
      },
      // Grupo condicional: só aparece com uma missão de corredor activa
      // (appliesTo 'corridor'). Acrescentado no FIM dos grupos da fase, como
      // o de fachada, para não deslocar índices já publicados — o estado
      // gravado é indexado por fase/grupo/item.
      {
        titulo: bi('Corredor', 'Corridor'),
        appliesTo: 'corridor',
        itens: [
          it(
            bi(
              'Obstáculos verticais no corredor levantados',
              'Vertical obstacles in the corridor surveyed',
            ),
            bi(
              'Postes, cabos, pontes, antenas, guindastes',
              'Poles, cables, bridges, antennas, cranes',
            ),
            true,
          ),
          it(
            bi(
              'Distância mínima a linhas eléctricas em tensão respeitada',
              'Minimum distance to live power lines respected',
            ),
            bi(
              'Vigiar também a interferência electromagnética na bússola',
              'Watch for electromagnetic interference on the compass as well',
            ),
            true,
          ),
          it(
            bi(
              'Trânsito por baixo do corredor acautelado e avisado',
              'Traffic under the corridor accounted for and warned',
            ),
            bi(
              'Rodoviário, ferroviário, pedonal — e quem faz o aviso',
              'Road, rail, pedestrian — and who issues the warning',
            ),
          ),
          it(
            bi(
              'Passagens partidas do planeamento revistas troço a troço',
              'Split passes from planning reviewed run by run',
            ),
            bi(
              'Decidir o que fazer à cobertura em falta nas curvas apertadas',
              'Decide what to do about the coverage missing on tight bends',
            ),
          ),
          it(
            bi('Vento transversal ao eixo avaliado', 'Crosswind to the centreline assessed'),
            bi(
              'Corredores longos dão exposição prolongada num só rumo',
              'Long corridors mean prolonged exposure on a single heading',
            ),
          ),
          it(
            bi(
              'Ponto de retoma anotado a cada troca de bateria',
              'Resume point noted at every battery change',
            ),
            null,
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
            bi('N.º de imagens verificado vs. plano', 'Image count checked against the plan'),
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
            bi('Amostra de imagens inspeccionada', 'Sample of images inspected'),
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
          it(bi('Cobertura confirmada sem gaps', 'Coverage confirmed with no gaps')),
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
            bi('Baterias a 40–60% para armazenamento', 'Batteries at 40–60% for storage'),
            bi(
              'LiPo degradam a 100% ou 0% prolongados',
              'LiPo cells degrade if left at 100% or 0% for long periods',
            ),
            true,
          ),
          it(bi('Baterias em local fresco e seco', 'Batteries stored in a cool, dry place')),
          it(
            bi('Inchamento/aquecimento anormal reportado', 'Swelling or abnormal heating reported'),
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
            bi('YYYYMMDD_LOCAL_SENSOR_RAW / PROCESSED', 'YYYYMMDD_SITE_SENSOR_RAW / PROCESSED'),
          ),
          it(bi('Dados sincronizados para servidor', 'Data synchronised to the server')),
          it(bi('Inventário conferido', 'Inventory checked'), bi('saída = chegada', 'out = back')),
        ],
      },
      // Grupo condicional: só aparece com uma missão de corredor activa
      // (appliesTo 'corridor'). Acrescentado no FIM dos grupos da fase, como
      // o de fachada, para não deslocar índices já publicados — o estado
      // gravado é indexado por fase/grupo/item.
      {
        titulo: bi('Corredor', 'Corridor'),
        appliesTo: 'corridor',
        itens: [
          it(
            bi(
              'Cobertura contínua verificada nas curvas',
              'Continuous coverage verified on the bends',
            ),
            bi(
              'O corredor desenhado mostra a largura pedida, não a coberta',
              'The drawn band shows the requested width, not the covered one',
            ),
            true,
          ),
          it(
            bi(
              'Troços voados em sessões separadas conferidos ponta a ponta',
              'Runs flown in separate sorties checked end to end',
            ),
            bi(
              'Sem divisão automática, as junções entre troços são manuais',
              'With no automatic splitting, the joins between runs are manual',
            ),
          ),
        ],
      },
    ],
  },
]

/** Strings de interface — dicionário interno a esta página. */
const UI = {
  back: bi('Voltar ao planeador', 'Back to planner'),
  title: bi('Checklist de Campo UAS', 'UAS Field Checklist'),
  // o subtítulo: a missão, a plataforma e os voos do plano
  flightsBases: bi('{n} voos em {b} bases', '{n} flights from {b} bases'),
  flightsBase: bi('{n} voos em 1 base', '{n} flights from 1 base'),
  flightBase: bi('1 voo em 1 base', '1 flight from 1 base'),
  flights: bi('{n} voos', '{n} flights'),
  flightOne: bi('1 voo', '1 flight'),
  exportJson: bi('Exportar JSON', 'Export JSON'),
  printFilled: bi('Imprimir preenchido', 'Print filled in'),
  printBlank: bi('Imprimir em branco', 'Print blank'),
  clear: bi('Limpar', 'Clear'),
  otherMission: bi(
    'Há uma checklist de outra missão, «{m}» ({d}). Esta missão começa com a sua própria.',
    'There is a checklist from another mission, “{m}” ({d}). This mission starts its own.',
  ),
  startNew: bi('Começar uma nova', 'Start a new one'),
  continueOld: bi('Continuar com a de «{m}»', 'Continue with the one from “{m}”'),
  clearConfirm: bi(
    'Limpar toda a checklist, tabelas e notas? Esta acção não pode ser anulada.',
    'Clear the whole checklist, tables and notes? This action cannot be undone.',
  ),
  missionSection: bi('Identificação da missão', 'Mission identification'),
  flightsSection: bi('Registo de voos', 'Flight log'),
  gcpSection: bi('GCPs', 'GCPs'),
  notesSection: bi('Notas de missão', 'Mission notes'),
  // rótulo curto à vista; o nome e a dica dizem a acção inteira
  addFlight: bi('Voo', 'Flight'),
  addFlightFull: bi('Acrescentar uma linha de voo', 'Add a flight row'),
  addGcp: bi('GCP', 'GCP'),
  addGcpFull: bi('Acrescentar uma linha de GCP', 'Add a GCP row'),
  removeLast: bi('Remover a última', 'Remove the last'),
  removeFlightFull: bi('Remover a última linha de voo', 'Remove the last flight row'),
  removeGcpFull: bi('Remover a última linha de GCP', 'Remove the last GCP row'),
  emptyRows: bi('Sem linhas.', 'No rows.'),
  importBlocks: bi('Importar blocos do plano', 'Import plan blocks'),
  importGcps: bi('Importar GCPs do plano', 'Import planned GCPs'),
  flightsHint: bi(
    '«Importar blocos do plano» escreve o voo, a área e o tempo previsto; o resto preenche-se no campo.',
    '“Import plan blocks” writes the flight, the area and the planned time; the rest is filled in on site.',
  ),
  gcpsHint: bi(
    'Sem GCP planeados no plano: registe aqui os que colocar no campo.',
    'No GCPs planned: record here the ones you lay out in the field.',
  ),
  gcpsHintPlanned: bi(
    '«Importar GCPs do plano» escreve o ID e as coordenadas dos {n} planeados; o resto preenche-se no campo.',
    '“Import planned GCPs” writes the ID and coordinates of the {n} planned; the rest is filled in on site.',
  ),
  flightCol: bi('Voo', 'Flight'),
  cellFlight: bi('{col} do voo {v}', '{col} of flight {v}'),
  cellRow: bi('{col} da linha {i}', '{col}, row {i}'),
  cellGcp: bi('{col} do GCP da linha {i}', '{col} of the GCP in row {i}'),
  autosave: bi('Guardado automaticamente neste navegador', 'Saved automatically in this browser'),
  // a checklist em fases
  checklist: bi('Checklist', 'Checklist'),
  overall: bi('{f} de {t} itens · {p} %', '{f} of {t} items · {p} %'),
  critPending: bi('{n} críticos por fazer', '{n} critical items to do'),
  critPendingOne: bi('1 crítico por fazer', '1 critical item to do'),
  critAllDone: bi('Todos os críticos feitos', 'All critical items done'),
  phases: bi('Fases da checklist', 'Checklist phases'),
  tabCritOk: bi('Críticos feitos', 'Critical items done'),
  tabCrit: bi('{n} críticos', '{n} critical'),
  tabCritOne: bi('1 crítico', '1 critical'),
  itemsOf: bi('{f} de {t} itens', '{f} of {t} items'),
  groupDone: bi('feito', 'done'),
  groupDoneIcon: bi('Grupo feito', 'Group done'),
  perFlight: bi('Por voo', 'Per flight'),
  critical: bi('Crítico', 'Critical'),
  flightPick: bi('Voo a que se referem as caixas por voo', 'Flight the per-flight boxes refer to'),
  flightOption: bi('Voo {v}', 'Flight {v}'),
  flightOf: bi('de {n}', 'of {n}'),
  perFlightNote: bi(
    'Descolagem, Monitorização em voo, Aterragem e Entre voos repetem-se em cada voo: as caixas «Por voo» são as mesmas em todos; confira-as antes de cada um.',
    'Take-off, In-flight monitoring, Landing and Between flights repeat on every flight: the “Per flight” boxes are the same for all of them; check them before each one.',
  ),
  flightZone: bi('zona {r} m', 'zone {r} m'),
  flightTime: bi('{m} min com a deslocação', '{m} min incl. transit'),
  flightPct: bi('{p} % do tempo útil', '{p} % of usable time'),
  flightPlanned: bi('{m} min previstos', '{m} min planned'),
  flightLogged: bi('registo: {a}–{b}', 'log: {a}–{b}'),
  // as fichas por base e a folha A4
  sheetsTitle: bi('Fichas por base', 'Sheets by base'),
  printSheets: bi('Imprimir as {n} fichas', 'Print the {n} sheets'),
  printSheet: bi('Imprimir a ficha', 'Print the sheet'),
  sheetsA4: bi('Cada ficha é uma folha A4.', 'Each sheet is one A4 page.'),
  zonePill: bi('Zona {r} m', 'Zone {r} m'),
  zoneWord: bi('Zona', 'Zone'),
  sheetCard: bi(
    'Ficha de campo da base {l}, {v}: zona {z} m, RTH {r} m, {m} min. Abre a folha para imprimir.',
    'Field sheet of base {l}, {v}: zone {z} m, RTH {r} m, {m} min. Opens the sheet to print.',
  ),
  cardFlight: bi('voo {v}', 'flight {v}'),
  cardFlights: bi('voos {v}', 'flights {v}'),
  zonesReduced: bi(
    'reduzida pelo desnível em {n} bases: descolar dentro dela (a base {l} só tem {r} m).',
    'reduced by the relief at {n} bases: take off inside it (base {l} has only {r} m).',
  ),
  zonesReducedOne: bi(
    'reduzida pelo desnível na base {l}: descolar dentro dela ({r} m).',
    'reduced by the relief at base {l}: take off inside it ({r} m).',
  ),
  sheetBack: bi('Voltar à checklist', 'Back to the checklist'),
  sheetOf: bi('{n} de {t}', '{n} of {t}'),
  sheetPrev: bi('Base anterior', 'Previous base'),
  sheetNext: bi('Base seguinte', 'Next base'),
  printThis: bi('Imprimir esta ficha', 'Print this sheet'),
  // acções de segurança e assinaturas
  rthValue: bi('{rth} m acima da descolagem', '{rth} m above take-off'),
  signatures: bi('Assinaturas', 'Signatures'),
  signaturesHint: bi('assinam-se na folha impressa', 'signed on the printed sheet'),
}

/**
 * Ordem das colunas do registo de voos no ecrã e na impressão: primeiro o
 * que vem do plano (voo, área, previsto), depois o que se preenche no
 * campo. COLS_VOO fica pela ordem de sempre — é a ordem das chaves de cada
 * linha gravada e exportada no JSON, que não muda.
 */
const ORDEM_VOO = [
  'n',
  'area',
  'previsto',
  'inicio',
  'fim',
  'duracao',
  'baterias',
  'imagens',
  'sensor',
  'meteo',
  'obs',
]
/** Larguras das colunas no ecrã (as da prancha); a impressão reparte a folha. */
const LARGURA = {
  voo: {
    n: 'w-[84px]',
    area: 'w-[92px]',
    previsto: 'w-[108px]',
    inicio: 'w-[100px]',
    fim: 'w-[100px]',
    duracao: 'w-[108px]',
    baterias: 'w-[116px]',
    imagens: 'w-[108px]',
    sensor: 'w-[116px]',
    meteo: 'w-[132px]',
    obs: 'min-w-[180px]',
  },
  gcp: {
    n: 'w-[56px]',
    ident: 'w-[120px]',
    lat: 'w-[150px]',
    lon: 'w-[150px]',
    alt: 'w-[120px]',
    crs: 'w-[140px]',
    metodo: 'w-[140px]',
    incerteza: 'w-[130px]',
    obs: 'min-w-[180px]',
  },
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
    label: bi('Plataforma UAS', 'UAS platform'),
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
  // o tempo previsto no plano (importado dos blocos) e, ao lado, o voado,
  // que o piloto escreve; uma checklist gravada antes desta coluna abre
  // com ela vazia (linhaVazia preenche as colunas em falta)
  { key: 'previsto', label: bi('Previsto (min)', 'Planned (min)'), w: 'w-24' },
  { key: 'duracao', label: bi('Duração (min)', 'Duration (min)'), w: 'w-24' },
  { key: 'baterias', label: bi('Bateria(s)', 'Battery(ies)'), w: 'w-28' },
  { key: 'area', label: bi('Área (ha)', 'Area (ha)'), w: 'w-24' },
  { key: 'imagens', label: bi('N.º imagens', 'No. of images'), w: 'w-24' },
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
  { key: 'crs', label: bi('Datum-SRC', 'Datum-CRS'), w: 'w-32' },
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

const linhaVazia = (cols) => cols.reduce((acc, c) => ({ ...acc, [c.key]: '' }), { _id: uid() })
/**
 * Uma linha do registo de voos a partir de uma que outro separador gravou
 * (todas as colunas e um _id novo), como as que se lêem ao abrir.
 */
const linhaDeVoo = (l) => ({ ...linhaVazia(COLS_VOO), ...l, _id: uid() })

const chaveItem = (faseId, gi, ii) => `${faseId}.${gi}.${ii}`

const hoje = () => new Date().toISOString().slice(0, 10)

/** Um texto do dicionário da página com as {variáveis} preenchidas. */
const fmt = (s, vars) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)

/** «3 críticos por fazer» / «1 crítico por fazer». */
const critText = (n, L) => (n === 1 ? L(UI.critPendingOne) : fmt(L(UI.critPending), { n }))

/**
 * A fase que abre: a primeira com críticos por fazer, senão a primeira com
 * itens por fazer, senão a última — como no desenho, o pré-campo feito
 * (menos o que não se aplica) passa ao «Durante».
 */
function faseInicial(fases, checked, applies) {
  const pend = fases.map((f) => {
    let crit = 0
    let todos = 0
    f.grupos.forEach((g, gi) => {
      if (!applies(g)) return
      g.itens.forEach((item, ii) => {
        if (checked[chaveItem(f.id, gi, ii)]) return
        todos += 1
        if (item.critico) crit += 1
      })
    })
    return { id: f.id, crit, todos }
  })
  return (pend.find((p) => p.crit > 0) ?? pend.find((p) => p.todos > 0) ?? pend[pend.length - 1]).id
}

/** Os grupos abertos à entrada: os que têm itens por fazer (os feitos fecham). */
function gruposAbertos(fases, checked) {
  const out = {}
  for (const f of fases)
    f.grupos.forEach((g, gi) => {
      out[`${f.id}.${gi}`] = g.itens.some((_, ii) => !checked[chaveItem(f.id, gi, ii)])
    })
  return out
}

/** O voo a seguir: o primeiro do plano sem «Hora fim» no registo; feitos todos, o último. */
function proximoVoo(plano, linhas) {
  if (plano.length === 0) return null
  const feito = (label) =>
    linhas.some((l) => String(l.n ?? '').trim() === label && String(l.fim ?? '').trim() !== '')
  return (plano.find((v) => !feito(v.label)) ?? plano[plano.length - 1]).label
}

/* ------------------------------ Ícones ------------------------------ */

/** Ícone de traço 24×24 (o estilo de Icons.jsx), decorativo: o nome é do botão. */
function Svg({ children, className = 'h-4 w-4', strokeWidth = 1.8 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

/** @param {{className?: string}} props */
function IconArrowLeft({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  )
}

/** @param {{className?: string}} props */
function IconChevronLeft({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  )
}

/** Impressora — imprimir. */
/** @param {{className?: string}} props */
function IconPrinter({ className }) {
  return (
    <Svg className={className}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </Svg>
  )
}

/** Folha em branco — imprimir em branco. */
/** @param {{className?: string}} props */
function IconFile({ className }) {
  return (
    <Svg className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </Svg>
  )
}

/** @param {{className?: string}} props */
function IconPlus({ className }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

/** Seta para a linha de base — trazer do plano. */
/** @param {{className?: string}} props */
function IconImport({ className }) {
  return (
    <Svg className={className}>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </Svg>
  )
}

/** Octógono com «!» — item crítico. */
/** @param {{className?: string}} props */
function IconCritical({ className }) {
  return (
    <Svg className={className} strokeWidth={2.4}>
      <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" />
      <path d="M12 8v4M12 16h.01" />
    </Svg>
  )
}

/* --------------------------- Subcomponentes --------------------------- */

/** Uma secção da página: painel com contorno e cantos de 12 px, como na prancha. */
const CARTAO = 'chk-bloco rounded-xl border border-slate-800 bg-panel'
const H2 = 'm-0 text-sm font-semibold text-slate-100'
/** «Voltar …»: uma ligação de acção, na cor das ligações. */
const VOLTAR =
  'inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13.5px] font-medium text-sky-300 transition-colors hover:bg-raised hover:text-sky-200'

/** Campo da identificação da missão: o rótulo por cima e a caixa de 44 px. */
function CampoTexto({ campo, label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label data-campo={campo} className="flex min-w-0 flex-col gap-1.5 text-xs text-slate-400">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="chk-fill h-11 w-full min-w-0 rounded-lg border border-slate-700 bg-field px-3 text-sm font-medium tabular-nums text-slate-100 [color-scheme:dark] placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
      />
    </label>
  )
}

/** Pastilha vermelha dos críticos por fazer, com o octógono. */
function CritPill({ children, small = false }) {
  return (
    <span
      className={`chk-crit-pill inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[#7A2530] bg-[#2B1215] font-semibold tabular-nums text-red-300 ${
        small ? 'h-6 px-[9px] text-xs' : 'h-7 px-[11px] text-[12.5px]'
      }`}
    >
      <IconCritical className={`text-red-400 ${small ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
      {children}
    </span>
  )
}

/** Um item: a caixa de 24 px, o texto e a nota, e «Crítico»; alvo de 52 px (com luvas). */
function ItemChecklist({ item, feito, onToggle, L }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={feito}
      onClick={onToggle}
      className="chk-item flex min-h-[52px] w-full items-start gap-3.5 px-4 pb-3 pt-[13px] text-left text-slate-100 transition-colors hover:bg-raised/60 focus-visible:outline-offset-[-2px]"
    >
      <span
        aria-hidden="true"
        className={`chk-box flex h-6 w-6 flex-none items-center justify-center rounded-md border-2 ${
          feito ? 'border-sky-400 bg-sky-400 text-[#06202E]' : 'border-[#5B6E8F] bg-field'
        }`}
      >
        {feito && (
          <Svg className="chk-mark h-4 w-4" strokeWidth={2.6}>
            <path d="M20 6 9 17l-5-5" />
          </Svg>
        )}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span
          className={`chk-text block text-sm leading-[1.4] ${
            feito ? 'text-slate-300' : 'text-slate-100'
          }`}
        >
          {L(item.texto)}
        </span>
        {item.nota && (
          <span className="chk-note mt-[3px] block text-[12.5px] leading-[1.4] text-slate-400">
            {L(item.nota)}
          </span>
        )}
      </span>
      {item.critico && (
        <span
          className={`chk-crit inline-flex h-6 flex-none items-center gap-[5px] whitespace-nowrap rounded-full border px-[9px] text-xs font-semibold ${
            feito
              ? 'border-slate-700 bg-[#1A2742] text-slate-300'
              : 'border-[#7A2530] bg-[#2B1215] text-red-300'
          }`}
        >
          <IconCritical className="h-3 w-3" />
          {L(UI.critical)}
        </span>
      )}
    </button>
  )
}

/**
 * Um grupo de itens que abre e fecha: o anel do progresso (ou o visto,
 * feito), o título e «N de M itens», «Por voo» e os críticos por fazer.
 * Fechado, os itens ficam no DOM e escondidos (e imprimem-se).
 */
function Grupo({ id, grupo, faseId, gi, c, checked, onToggle, aberto, onAbrir, L }) {
  const completo = c.total > 0 && c.feitos === c.total
  const pend = c.crit - c.critFeitos
  const C = 2 * Math.PI * 12
  return (
    <section
      className={`chk-grupo overflow-hidden rounded-[10px] border bg-surface ${
        aberto ? 'border-[#2C4A68]' : 'border-slate-800'
      }`}
    >
      <h3 className="m-0">
        {/* o nome do botão é só o título; o progresso e as etiquetas descrevem-no */}
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={`${id}-itens`}
          aria-labelledby={`${id}-titulo`}
          aria-describedby={[
            `${id}-resumo`,
            grupo.porVoo && `${id}-voo`,
            pend > 0 && `${id}-criticos`,
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onAbrir}
          className="chk-grupo-btn flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left text-slate-100"
        >
          {completo ? (
            <svg
              role="img"
              aria-label={L(UI.groupDoneIcon)}
              width="30"
              height="30"
              viewBox="0 0 30 30"
              className="chk-anel flex-none"
            >
              <circle cx="15" cy="15" r="13" fill="#0D2A21" stroke="#34D399" strokeWidth="2" />
              <path
                d="m9.5 15.5 3.6 3.6 7.4-7.6"
                fill="none"
                stroke="#34D399"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              width="30"
              height="30"
              viewBox="0 0 30 30"
              className="chk-anel flex-none"
            >
              <circle cx="15" cy="15" r="12" fill="none" stroke="#1C2740" strokeWidth="3" />
              <circle
                cx="15"
                cy="15"
                r="12"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="3"
                transform="rotate(-90 15 15)"
                strokeDasharray={`${((C * c.feitos) / Math.max(1, c.total)).toFixed(1)} ${C.toFixed(1)}`}
              />
            </svg>
          )}
          <span className="min-w-0 flex-1">
            <span
              id={`${id}-titulo`}
              className="chk-grupo-titulo block text-[14.5px] font-semibold"
            >
              {L(grupo.titulo)}
            </span>
            <span
              id={`${id}-resumo`}
              className={`chk-progresso mt-0.5 block text-[12.5px] tabular-nums ${
                completo ? 'text-emerald-300' : 'text-slate-400'
              }`}
            >
              {fmt(L(UI.itemsOf), { f: c.feitos, t: c.total })}
              {completo ? ` · ${L(UI.groupDone)}` : ''}
            </span>
          </span>
          {grupo.porVoo && (
            <span
              id={`${id}-voo`}
              className="chk-por-voo inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full border border-[#1E2E4A] bg-[#10233A] px-[9px] text-xs font-semibold text-blue-300"
            >
              {L(UI.perFlight)}
            </span>
          )}
          {pend > 0 && (
            <span id={`${id}-criticos`} className="flex flex-none">
              <CritPill small>{critText(pend, L)}</CritPill>
            </span>
          )}
          <IconChevronDown
            className={`chk-seta h-[18px] w-[18px] flex-none text-slate-400 transition-transform ${
              aberto ? 'rotate-180' : ''
            }`}
          />
        </button>
      </h3>
      <ul
        id={`${id}-itens`}
        hidden={!aberto}
        className={`chk-itens m-0 list-none border-t border-slate-800 p-0 ${aberto ? 'block' : 'hidden'}`}
      >
        {grupo.itens.map((item, ii) => {
          const k = chaveItem(faseId, gi, ii)
          return (
            <li key={k} className="border-t border-raised first:border-t-0">
              <ItemChecklist item={item} feito={!!checked[k]} onToggle={() => onToggle(k)} L={L} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** O separador de uma fase: número, título, críticos, «N de M itens», a percentagem e a barra. */
function FaseTab({ ids, fase, n, c, sel, onSelect, onKeyDown, L }) {
  const pct = c.total ? Math.round((100 * c.feitos) / c.total) : 0
  const pend = c.crit - c.critFeitos
  return (
    <button
      type="button"
      role="tab"
      id={ids.tab}
      aria-selected={sel}
      aria-controls={ids.painel}
      aria-labelledby={ids.titulo}
      aria-describedby={ids.progresso}
      tabIndex={sel ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      data-testid={`chk-tab-${fase.id}`}
      className={`flex min-h-[92px] min-w-0 flex-col gap-2.5 rounded-[10px] border px-3.5 pb-3.5 pt-3 text-left text-slate-100 transition-colors ${
        sel ? 'border-[#2C4A68] bg-[#16223A]' : 'border-slate-800 bg-surface hover:bg-raised'
      }`}
    >
      <span className="flex w-full items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[12.5px] font-semibold ${
            sel ? 'bg-sky-400 text-[#06202E]' : 'bg-[#1A2742] text-slate-300'
          }`}
        >
          {n}
        </span>
        <span id={ids.titulo} className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {L(fase.titulo)}
        </span>
        {pend === 0 ? (
          <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-xs font-medium text-emerald-300">
            <IconCheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            {L(UI.tabCritOk)}
          </span>
        ) : (
          <CritPill small>
            {pend === 1 ? L(UI.tabCritOne) : fmt(L(UI.tabCrit), { n: pend })}
          </CritPill>
        )}
      </span>
      <span
        id={ids.progresso}
        className="flex w-full justify-between text-[12.5px] tabular-nums text-slate-300"
      >
        <span>{fmt(L(UI.itemsOf), { f: c.feitos, t: c.total })}</span>
        <span>{pct} %</span>
      </span>
      <span
        aria-hidden="true"
        className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
      >
        <span
          className={`block h-full rounded-full ${
            c.feitos === c.total ? 'bg-emerald-400' : 'bg-sky-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </button>
  )
}

/**
 * O voo a que se referem os grupos «Por voo», na fase Durante: uma vista
 * sobre as mesmas caixas (não há caixas por voo gravadas), com os dados do
 * voo escolhido. Um <select> nativo por cima da face do desenho: o teclado,
 * o leitor de ecrã e o seleccionador do tablet são os do sistema.
 */
function SeletorVoo({ voos, valor, onChange, info, L }) {
  const v = voos.find((x) => x.label === valor) ?? voos[0]
  return (
    <div className="no-print flex flex-wrap items-center gap-x-3.5 gap-y-2 pb-1 pt-0.5">
      <div className="relative flex h-11 flex-none items-center gap-2 rounded-lg border border-slate-700 bg-field px-3 text-[13.5px] font-semibold tabular-nums text-slate-100 transition-colors focus-within:border-sky-400 hover:border-slate-600">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: v?.color ?? '#38BDF8' }}
        />
        <span aria-hidden="true">{fmt(L(UI.flightOption), { v: v?.label ?? '' })}</span>
        <span aria-hidden="true" className="font-normal text-slate-400">
          {fmt(L(UI.flightOf), { n: voos.length })}
        </span>
        <IconChevronDown className="h-[15px] w-[15px] text-slate-400" />
        <select
          data-testid="chk-flight-select"
          aria-label={L(UI.flightPick)}
          value={v?.label ?? ''}
          onChange={(e) => onChange(e.target.value)}
          // por cima da borda: o alvo tem os 44 px da caixa
          className="absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer appearance-none opacity-0"
        >
          {voos.map((x) => (
            <option key={x.label} value={x.label}>
              {fmt(L(UI.flightOption), { v: x.label })}
            </option>
          ))}
        </select>
      </div>
      <p className="m-0 min-w-[240px] flex-1 text-[12.5px] leading-[1.45] text-slate-300">
        {L(UI.perFlightNote)}
        {info && (
          <span data-testid="chk-flight-info" className="mt-1 block text-slate-400">
            {info}
          </span>
        )}
      </p>
    </div>
  )
}

/** As acções de segurança escritas no KMZ, em linhas «rótulo … valor». */
function SegurancaKmz({ safety, rthInfo, t, L }) {
  const tituloId = useId()
  const linhas = [
    { k: 'fim', label: t('safety.finish'), value: t(`safety.finish.${safety.finishAction}`) },
    // «Interromper a missão, depois RTH»: a acção com o nome curto (o do
    // desenho e da folha A4), numa linha; o nome inteiro fica no título
    safety.exitOnRCLost === 'executeLostAction'
      ? {
          k: 'sinal',
          label: t('safety.rcLost'),
          value: t('safety.checklistStop', {
            mode: t('safety.rcLost.executeLostAction'),
            action: t(`mp.safety.act.${safety.executeRCLostAction}`),
          }),
          title: t('safety.checklistStop', {
            mode: t('safety.rcLost.executeLostAction'),
            action: t(`safety.rcAction.${safety.executeRCLostAction}`),
          }),
        }
      : { k: 'sinal', label: t('safety.rcLost'), value: t('safety.rcLost.goContinue') },
    ...(rthInfo
      ? [
          {
            k: 'rth',
            testId: 'checklist-rth',
            label: t('bases.sheet.rth'),
            value: fmt(L(UI.rthValue), { rth: rthRangeLabel(rthInfo) }),
          },
          { k: 'subida', label: t('bases.a4.takeoff'), value: `${rthInfo.takeoffM} m` },
        ]
      : []),
  ]
  return (
    <section
      data-testid="checklist-safety"
      aria-labelledby={tituloId}
      className={`${CARTAO} px-[18px] py-4`}
    >
      <div className="flex items-center gap-2.5">
        <IconShield className="h-[18px] w-[18px] text-sky-300" />
        <h2 id={tituloId} className={H2}>
          {t('safety.checklist')}
        </h2>
      </div>
      <dl className="m-0 mt-2.5 text-[13px]">
        {linhas.map((l, i) => (
          <div
            key={l.k}
            data-testid={l.testId}
            className={`flex min-h-[36px] items-center justify-between gap-3 py-1.5 ${
              i ? 'border-t border-raised' : ''
            }`}
          >
            <dt className="flex-none whitespace-nowrap text-slate-300">{l.label}</dt>
            <dd title={l.title} className="m-0 text-right tabular-nums">
              {l.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-2 text-xs leading-normal text-slate-400">{t('safety.checklistHint')}</p>
    </section>
  )
}

/**
 * As fichas por base: a linha do dia, um cartão por base (zona, RTH,
 * tempo) que abre a folha A4 dela, e «Imprimir as N fichas».
 */
function FichasPorBase({ sheets, day, onOpen, onPrintAll, ultima, cardRefs, t, L }) {
  const tituloId = useId()
  const reduzidas = sheets.filter((s) => s.reduced && Number.isFinite(s.radiusM))
  const menor = reduzidas.reduce((a, s) => (!a || s.radiusM < a.radiusM ? s : a), null)
  return (
    <section
      data-testid="checklist-bases"
      aria-labelledby={tituloId}
      className={`chk-bases ${CARTAO} px-4 pb-4 pt-3`}
    >
      <div className="flex items-center gap-2.5">
        <h2 id={tituloId} className={`${H2} flex-1`}>
          {L(UI.sheetsTitle)}
        </h2>
        <button
          type="button"
          data-testid="sheets-print-all"
          onClick={onPrintAll}
          className="no-print inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-[13px] font-medium text-sky-300 transition-colors hover:text-sky-200"
        >
          <IconPrinter className="h-4 w-4" />
          {sheets.length === 1 ? L(UI.printSheet) : fmt(L(UI.printSheets), { n: sheets.length })}
        </button>
      </div>
      {day && (
        <p
          data-testid="sheets-day"
          className={`m-0 text-[12.5px] leading-normal ${
            day.short ? 'text-amber-300' : 'text-slate-400'
          }`}
        >
          {day.sets != null
            ? tCount(t, 'bases.sheet.day', day.flights, {
                flights: day.flights,
                sets: day.flights,
                team: day.sets,
              })
            : tCount(t, 'bases.sheet.dayUnknown', day.flights, {
                flights: day.flights,
                sets: day.flights,
              })}
          . {L(UI.sheetsA4)}
        </p>
      )}
      <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
        {sheets.map((s, i) => {
          const voos = (s.flights ?? []).map((f) => f.flightLabel)
          const labels = voos.join(', ')
          // no cartão, vários voos (seguidos: a numeração é base a base)
          // cabem como «A-1–A-3»; o nome do cartão diz-os todos
          const curto = voos.length > 1 ? `${voos[0]}–${voos[voos.length - 1]}` : labels
          const z = Number.isFinite(s.radiusM) ? Math.round(s.radiusM) : '—'
          const rth = s.rthM != null ? Math.round(s.rthM) : '—'
          const m = Number.isFinite(s.totalS) ? Math.round(s.totalS / 60) : '—'
          const nome = fmt(L(UI.sheetCard), {
            l: s.label,
            v: fmt(L((s.flights ?? []).length === 1 ? UI.cardFlight : UI.cardFlights), {
              v: labels,
            }),
            z,
            r: rth,
            m,
          })
          return (
            <li key={s.id}>
              <button
                type="button"
                ref={(el) => {
                  cardRefs.current[s.id] = el
                }}
                data-testid="base-sheet-card"
                data-base-label={s.label}
                aria-label={nome}
                title={nome}
                onClick={() => onOpen(i)}
                className={`chk-cartao-base flex min-h-[64px] w-full flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 text-left text-slate-100 transition-colors hover:border-[#2C4A68] ${
                  ultima === s.id ? 'border-[#2C4A68] bg-[#16223A]' : 'border-slate-800 bg-surface'
                }`}
              >
                <span className="flex w-full min-w-0 items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="chk-cor inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11.5px] font-bold"
                    style={{ backgroundColor: s.color ?? '#334155', color: baseInk(s.color) }}
                  >
                    {s.label}
                  </span>
                  <span className="text-[13.5px] font-semibold">
                    {t('bases.label', { label: s.label })}
                  </span>
                  <span className="min-w-0 truncate text-[12.5px] tabular-nums text-slate-400">
                    {curto}
                  </span>
                  <span className="flex-1" />
                  <span className="text-[12.5px] tabular-nums text-slate-200">{m} min</span>
                </span>
                <span className="flex w-full items-center gap-1.5 whitespace-nowrap">
                  <span
                    className={`chk-zona inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold tabular-nums ${
                      s.reduced || s.noTerrain
                        ? 'bg-[#2A1F0B] text-amber-300'
                        : 'bg-[#1A2742] text-slate-200'
                    }`}
                  >
                    {fmt(L(UI.zonePill), { r: z })}
                  </span>
                  <span className="text-xs tabular-nums text-slate-300">RTH {rth} m</span>
                  <IconPrinter className="no-print ml-auto h-[15px] w-[15px] text-sky-300" />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {menor && (
        <p className="chk-zona-nota m-0 mt-3 flex items-start gap-2 text-xs leading-[1.45] text-slate-400">
          <span className="chk-zona inline-flex h-[22px] flex-none items-center rounded-full bg-[#2A1F0B] px-2 text-xs font-semibold text-amber-300">
            {L(UI.zoneWord)}
          </span>
          <span className="pt-[3px]">
            {reduzidas.length === 1
              ? fmt(L(UI.zonesReducedOne), { l: menor.label, r: Math.round(menor.radiusM) })
              : fmt(L(UI.zonesReduced), {
                  n: reduzidas.length,
                  l: menor.label,
                  r: Math.round(menor.radiusM),
                })}
          </span>
        </p>
      )}
    </section>
  )
}

/**
 * A folha A4 de uma base, por cima da checklist (que fica inerte): voltar,
 * a base anterior e a seguinte, imprimir esta folha ou todas. Esc volta.
 */
function FichaVista({ sheets, index, onIndex, onClose, onPrintAll, sheetProps, t, L }) {
  const s = sheets[index]
  const voltar = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const anterior = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const seguinte = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const corpo = useRef(/** @type {HTMLDivElement|null} */ (null))
  useEffect(() => {
    voltar.current?.focus()
  }, [])
  // na primeira e na última base o botão usado fica desactivado: o foco passa
  // ao do outro lado (com uma só base não há para onde ir: «Voltar»)
  const ir = (i) => {
    flushSync(() => onIndex(i))
    const foco = /** @type {HTMLButtonElement|null} */ (document.activeElement)
    if (foco && foco !== document.body && !foco.disabled) return
    const outro = i === 0 ? seguinte.current : anterior.current
    ;(outro && !outro.disabled ? outro : voltar.current)?.focus()
  }
  // cada base abre a folha no topo
  useEffect(() => {
    corpo.current?.scrollTo?.(0, 0)
  }, [index])
  // Esc volta à checklist, também com o foco fora dos botões (um clique na folha)
  useEffect(() => {
    const tecla = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onClose])
  const titulo = t('bases.a4.title', { label: s.label })
  const quadrado = 'h-11 w-11 px-0'
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      data-testid="sheet-view"
      className="chk-vista fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100"
    >
      <header className="no-print flex min-h-[72px] flex-none flex-wrap items-center gap-3 border-b border-slate-800 py-3 pl-5 pr-8">
        <button ref={voltar} type="button" onClick={onClose} className={VOLTAR}>
          <IconArrowLeft className="h-[18px] w-[18px]" />
          {L(UI.sheetBack)}
        </button>
        <span aria-hidden="true" className="h-8 w-px bg-slate-800" />
        <div className="min-w-0 pl-1">
          <h1 className="m-0 truncate text-lg font-semibold tracking-[-0.01em]">{titulo}</h1>
          <div className="mt-[3px] text-[12.5px] tabular-nums text-slate-400">
            {fmt(L(UI.sheetOf), { n: index + 1, t: sheets.length })}
          </div>
        </div>
        <div className="flex-1" />
        <Button
          ref={anterior}
          size="lg"
          variant="ghost"
          className={quadrado}
          aria-label={L(UI.sheetPrev)}
          title={L(UI.sheetPrev)}
          disabled={index === 0}
          onClick={() => ir(index - 1)}
          icon={<IconChevronLeft className="h-5 w-5" />}
        />
        <Button
          ref={seguinte}
          size="lg"
          variant="ghost"
          className={quadrado}
          aria-label={L(UI.sheetNext)}
          title={L(UI.sheetNext)}
          disabled={index === sheets.length - 1}
          onClick={() => ir(index + 1)}
          icon={<IconChevronRight className="h-5 w-5" />}
        />
        <Button
          size="lg"
          variant="primary"
          data-testid="sheet-print"
          onClick={() => window.print()}
          icon={<IconPrinter className="h-4 w-4" />}
        >
          {L(UI.printThis)}
        </Button>
        {sheets.length > 1 && (
          <Button
            size="lg"
            onClick={onPrintAll}
            icon={<IconPrinter className="h-4 w-4 text-slate-300" />}
          >
            {fmt(L(UI.printSheets), { n: sheets.length })}
          </Button>
        )}
      </header>
      <div ref={corpo} className="chk-vista-corpo flex-1 overflow-auto px-4 py-6">
        <div className="chk-papel mx-auto w-[794px]">
          <BaseSheetPage sheet={s} index={index} total={sheets.length} {...sheetProps} />
        </div>
      </div>
    </div>
  )
}

/** Uma tabela de registo (voos ou GCPs): uma caixa de texto por célula, de 44 px. */
function Tabela({
  label,
  cols,
  linhas,
  onCell,
  largura,
  nomeCelula,
  separador = null,
  plano = null,
  corDe = null,
  L,
}) {
  return (
    <div className="chk-moldura overflow-x-auto rounded-[10px] border border-slate-800">
      <table
        aria-label={label}
        className="chk-tabela w-full min-w-[1100px] border-collapse text-left"
      >
        <thead>
          <tr className="bg-sunken text-xs">
            {cols.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={`px-3 py-3 font-normal ${largura[c.key] ?? ''} ${
                  i === 0
                    ? ''
                    : c.key === separador
                      ? 'border-l border-[#2C4A68]'
                      : 'border-l border-raised'
                } ${plano && !plano.has(c.key) ? 'text-slate-200' : 'text-slate-400'}`}
              >
                {c.key === 'n' && plano ? L(UI.flightCol) : L(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, li) => (
            <tr key={linha._id} className="border-t border-raised">
              {cols.map((c, i) => {
                const cor = c.key === 'n' && corDe ? corDe(linha.n) : null
                return (
                  <td
                    key={c.key}
                    className={`p-0 ${
                      i === 0
                        ? ''
                        : c.key === separador
                          ? 'border-l border-[#2C4A68]'
                          : 'border-l border-raised'
                    }`}
                  >
                    <span className="flex h-11 items-center">
                      {cor && (
                        <span
                          aria-hidden="true"
                          className="chk-cor ml-3 h-2.5 w-2.5 flex-none rounded-full"
                          style={{ backgroundColor: cor }}
                        />
                      )}
                      <input
                        value={linha[c.key] ?? ''}
                        placeholder={c.key === 'n' ? String(li + 1) : undefined}
                        aria-label={nomeCelula(L(c.label), linha, li)}
                        onChange={(e) => onCell(li, c.key, e.target.value)}
                        className={`chk-fill h-11 w-full min-w-0 bg-transparent text-[13.5px] tabular-nums placeholder:text-slate-500 focus:bg-raised focus:shadow-[inset_0_0_0_2px_#38BDF8] focus:outline-none ${
                          cor ? 'pl-2 pr-3' : 'px-3'
                        } ${
                          c.key === 'n'
                            ? 'font-semibold text-slate-100'
                            : plano?.has(c.key)
                              ? 'text-slate-200'
                              : 'font-medium text-slate-100'
                        }`}
                      />
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-3 py-3 text-center text-xs text-slate-400">
                {L(UI.emptyRows)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CaixaNota({ label, value, onChange }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-slate-400">
      {label}
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="chk-fill chk-nota h-28 w-full resize-y rounded-lg border border-slate-700 bg-field px-3 py-2.5 text-[13.5px] leading-normal text-slate-100 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
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
  corridorMode = false, // idem para o grupo 'corridor'
  blocks = [],
  // voo de cada bloco (layoutBlocks: byBlock), para numerar o registo de voos
  flightLabels = null,
  // ficha de campo por base (baseFieldSheets), com a área dividida e bases
  baseSheets = [],
  // a linha do dia por cima das fichas (daySummary)
  daySheets = null,
  plannedGcps = [],
  // sobreposições do plano e seguimento de terreno, para os itens (M3-U11)
  params = null,
  terrainFollowOn = false,
  // acções de segurança escritas no KMZ (src/mission/safety.js)
  safety = null,
  // altura de regresso (RTH) e subida de descolagem escritas no KMZ (M3-U3)
  rthInfo = null,
  onBack,
}) {
  const lang = useLang()
  const t = useT()
  const L = (v) => tr(v, lang)
  const FASES = useMemo(
    () =>
      fasesDe({
        front: Number.isFinite(params?.frontOverlap) ? params.frontOverlap : '—',
        side: Number.isFinite(params?.sideOverlap) ? params.sideOverlap : '—',
        gcps: plannedGcps?.length ?? 0,
        terrainFollowOn: Boolean(terrainFollowOn),
      }),
    [params?.frontOverlap, params?.sideOverlap, plannedGcps?.length, terrainFollowOn],
  )

  // O estado gravado é lido UMA vez e semeia todos os átomos abaixo
  const [{ dados: guardado, outra: guardadoDeOutra, texto: textoLido }] = useState(() =>
    lerGuardado(missionName),
  )
  // a checklist antiga de outra missão, à espera de «Começar uma nova» ou «Continuar com esta»
  const [outraMissao, setOutraMissao] = useState(guardadoDeOutra)
  const [checked, setChecked] = useState(() =>
    guardado.checked && typeof guardado.checked === 'object' ? guardado.checked : {},
  )
  const [missao, setMissao] = useState(() => {
    const g = guardado.missao && typeof guardado.missao === 'object' ? guardado.missao : {}
    return {
      operador: '',
      local: '',
      ...g,
      // um valor vazio gravado não apaga o que vem do planeador
      missao: g.missao || missionName || '',
      plataforma: g.plataforma || droneLabel || '',
      data: g.data || hoje(),
    }
  })
  const [voos, setVoos] = useState(() =>
    Array.isArray(guardado.voos)
      ? guardado.voos.map((l) => ({ ...linhaVazia(COLS_VOO), ...l, _id: uid() }))
      : [linhaVazia(COLS_VOO), linhaVazia(COLS_VOO), linhaVazia(COLS_VOO)],
  )
  const [gcps, setGcps] = useState(() =>
    Array.isArray(guardado.gcps)
      ? guardado.gcps.map((l) => ({ ...linhaVazia(COLS_GCP), ...l, _id: uid() }))
      : Array.from({ length: 5 }, () => linhaVazia(COLS_GCP)),
  )
  const [notas, setNotas] = useState(() => ({
    anomalias: '',
    qualidade: '',
    condicoes: '',
    seguimento: '',
    ...(guardado.notas && typeof guardado.notas === 'object' ? guardado.notas : {}),
  }))

  /* -------- Só vista (não se grava nem se exporta): fase, grupos, voo -------- */
  const aplica = (g) => groupApplies(g, sensorType, { face: faceMode, corridor: corridorMode })
  const [fase, setFase] = useState(() => faseInicial(FASES, checked, aplica))
  const [abertos, setAbertos] = useState(() => gruposAbertos(FASES, checked))
  const [vooEscolhido, setVooEscolhido] = useState(/** @type {string|null} */ (null))
  // a folha A4 aberta (índice nas fichas) e a que se abriu por último
  const [ficha, setFicha] = useState(/** @type {number|null} */ (null))
  const [ultimaFicha, setUltimaFicha] = useState(/** @type {string|null} */ (null))
  // 'fichas' enquanto se imprimem as folhas de todas as bases
  const [imprimir, setImprimir] = useState(/** @type {string|null} */ (null))
  const cardRefs = useRef(/** @type {Record<string, HTMLButtonElement|null>} */ ({}))
  const prefixo = useId()

  /* ------------- Gravação automática com debounce simples ------------- */
  // Sem guarda de hidratação: o estado já nasce com o que estava gravado,
  // pelo que a primeira gravação reescreve exactamente o mesmo conteúdo.
  //
  // O registo de voos tem outro escritor: o planeador («Operação do dia»)
  // marca um voo feito escrevendo a «Hora fim» na linha dele, na mesma chave,
  // às vezes noutro separador. Antes de gravar relê-se a chave e, se outro a
  // escreveu desde o texto que a página conhece (o lido ao abrir ou o último
  // que gravou), junta-se o registo de lá ao daqui (mergeFlightLog); o
  // evento «storage» e o regresso ao separador trazem-no logo para o ecrã.
  // Sem outro escritor grava-se o mesmo texto de sempre. Ao sair da página
  // (voltar ao planeador, fechar ou recarregar o separador) a gravação por
  // fazer faz-se logo, em vez de se perder.
  const conhecido = useRef({ chave: checklistStorageKey(missionName), texto: textoLido })
  const ultimo = useRef(/** @type {any} */ (null))
  const pendente = useRef(false)
  const gravar = useRef((/** @type {boolean} */ noEcra) => {
    const e = ultimo.current
    if (!e || !pendente.current) return
    pendente.current = false
    const chave = checklistStorageKey(e.missionName)
    const agora = lerTexto(chave)
    let registo = e.voos
    // (com outra chave, de outra missão, não há base: grava-se por cima, como sempre)
    if (conhecido.current.chave === chave && agora !== conhecido.current.texto) {
      const base = objectoDe(conhecido.current.texto)?.voos
      const deLa = objectoDe(agora)?.voos
      registo = mergeFlightLog(e.voos, deLa, base, linhaDeVoo)
      if (noEcra && registo !== e.voos)
        setVoos((v) => (v === e.voos ? registo : mergeFlightLog(v, deLa, base, linhaDeVoo)))
    }
    const { missionName: nome, checked: c, missao: m, gcps: g, notas: n } = e
    const texto = JSON.stringify({
      missionName: nome,
      savedAt: hoje(),
      checked: c,
      missao: m,
      voos: registo,
      gcps: g,
      notas: n,
    })
    try {
      if (texto !== agora) window.localStorage.setItem(chave, texto)
      conhecido.current = { chave, texto }
    } catch {
      /* quota excedida ou modo privado — ignorar */
    }
  })
  useEffect(() => {
    ultimo.current = { missionName, checked, missao, voos, gcps, notas }
    pendente.current = true
    const t = setTimeout(() => gravar.current(true), SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [missionName, checked, missao, voos, gcps, notas])
  // ao sair: a gravação por fazer faz-se já (pagehide: fechar ou recarregar)
  useEffect(() => {
    const sair = () => gravar.current(false)
    window.addEventListener('pagehide', sair)
    return () => {
      window.removeEventListener('pagehide', sair)
      sair()
    }
  }, [])
  // o que o planeador gravou noutro separador, ou enquanto este esteve escondido
  useEffect(() => {
    const chave = checklistStorageKey(missionName)
    const trazer = (agora) => {
      const { chave: daBase, texto } = conhecido.current
      if (agora == null || daBase !== chave || agora === texto) return
      const base = objectoDe(texto)?.voos
      const deLa = objectoDe(agora)?.voos
      setVoos((v) => mergeFlightLog(v, deLa, base, linhaDeVoo))
      // o texto de lá passa a ser a base da fusão seguinte: duas escritas do
      // planeador antes de a página gravar (marcar e desmarcar o mesmo voo)
      // fundem-se uma de cada vez. A gravação por fazer, se correr antes do
      // render novo, leva já a fusão
      const e = ultimo.current
      if (e) ultimo.current = { ...e, voos: mergeFlightLog(e.voos, deLa, base, linhaDeVoo) }
      conhecido.current = { chave, texto: agora }
    }
    const aoGravar = (ev) => {
      if (ev.key === chave) trazer(ev.newValue)
    }
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') trazer(lerTexto(chave))
    }
    window.addEventListener('storage', aoGravar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.removeEventListener('storage', aoGravar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [missionName])

  /** Continuar com a checklist antiga de outra missão: os dados passam para esta missão. */
  const continuarOutra = () => {
    if (!outraMissao) return
    const g = outraMissao
    if (g.checked && typeof g.checked === 'object') {
      setChecked(g.checked)
      setAbertos(gruposAbertos(FASES, g.checked))
    }
    setMissao((m) => ({
      ...m,
      ...(g.missao && typeof g.missao === 'object' ? g.missao : {}),
      missao: missionName || '',
      plataforma: droneLabel || '',
    }))
    if (Array.isArray(g.voos))
      setVoos(g.voos.map((l) => ({ ...linhaVazia(COLS_VOO), ...l, _id: uid() })))
    if (Array.isArray(g.gcps))
      setGcps(g.gcps.map((l) => ({ ...linhaVazia(COLS_GCP), ...l, _id: uid() })))
    if (g.notas && typeof g.notas === 'object') setNotas((n) => ({ ...n, ...g.notas }))
    esquecerOutra()
  }

  /** A checklist antiga fica esquecida: a desta missão começa do zero. */
  const esquecerOutra = () => {
    setOutraMissao(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignorar */
    }
  }

  /* ------------------------------ Acções ------------------------------ */
  const toggle = (k) => setChecked((c) => ({ ...c, [k]: !c[k] }))

  const setCampoMissao = (k, v) => setMissao((m) => ({ ...m, [k]: v }))
  const setNota = (k, v) => setNotas((n) => ({ ...n, [k]: v }))

  const editarLinha = (setter) => (idx, key, valor) =>
    setter((linhas) => linhas.map((l, i) => (i === idx ? { ...l, [key]: valor } : l)))

  const setCelulaVoo = editarLinha(setVoos)
  const setCelulaGcp = editarLinha(setGcps)

  const resumo = useMemo(() => {
    const porFase = {}
    let feitos = 0
    let total = 0
    FASES.forEach((fase) => {
      const itens = []
      fase.grupos.forEach((g, gi) => {
        if (!groupApplies(g, sensorType, { face: faceMode, corridor: corridorMode })) return
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
  }, [checked, lang, sensorType, faceMode, corridorMode, FASES])

  // as contagens do ecrã: por fase e por grupo, com os críticos
  const contagens = useMemo(
    () =>
      FASES.map((fase) => {
        const grupos = {}
        let feitos = 0
        let total = 0
        let crit = 0
        let critFeitos = 0
        fase.grupos.forEach((g, gi) => {
          if (!groupApplies(g, sensorType, { face: faceMode, corridor: corridorMode })) return
          const c = { feitos: 0, total: g.itens.length, crit: 0, critFeitos: 0 }
          g.itens.forEach((item, ii) => {
            const on = !!checked[chaveItem(fase.id, gi, ii)]
            if (on) c.feitos += 1
            if (item.critico) {
              c.crit += 1
              if (on) c.critFeitos += 1
            }
          })
          grupos[gi] = c
          feitos += c.feitos
          total += c.total
          crit += c.crit
          critFeitos += c.critFeitos
        })
        return { feitos, total, crit, critFeitos, grupos }
      }),
    [FASES, checked, sensorType, faceMode, corridorMode],
  )

  const importarBlocos = () => {
    if (!blocks || blocks.length === 0) return
    // pela ordem de voo, com o rótulo do voo (A-1), a área e o tempo
    // previsto com o trânsito da base; a duração fica para o piloto
    const novas = flightLogRows(blocks, flightLabels).map((l) => ({
      ...linhaVazia(COLS_VOO),
      ...l,
    }))
    setVoos((prev) => {
      const preenchidas = prev.filter((l) =>
        COLS_VOO.some((c) => String(l[c.key] ?? '').trim() !== ''),
      )
      // um voo que já tem linha (marcado feito no planeador, ou importado
      // antes) não se repete
      return [...preenchidas, ...missingPlanRows(preenchidas, novas)]
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
    setAbertos(gruposAbertos(FASES, {}))
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
      window.localStorage.removeItem(checklistStorageKey(missionName))
    } catch {
      /* ignorar */
    }
  }

  const semId = (linhas) => linhas.map(({ _id, ...resto }) => resto)

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
    a.download = `checklist-${safeFileStem(missao.missao)}-${missao.data || hoje()}.json`
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

  /* ---------------------- Voos do plano e fichas ---------------------- */
  // os voos do plano pela ordem de voo, com os rótulos do registo (A-1)
  const voosPlano = useMemo(() => {
    if (!Array.isArray(blocks) || blocks.length === 0) return []
    const info = (b) => flightLabels?.[b.id] ?? null
    return [...blocks]
      .sort((a, b) => (info(a)?.flight ?? a.id) - (info(b)?.flight ?? b.id))
      .map((b, i) => ({
        label: info(b)?.flightLabel || String(b.id ?? i + 1),
        color: info(b)?.color ?? null,
        timeS: b.timeS,
        transitS: info(b)?.transitS ?? 0,
      }))
  }, [blocks, flightLabels])
  const vooAtual = vooEscolhido ?? proximoVoo(voosPlano, voos)
  const fichaDoVoo = useMemo(() => {
    const m = new Map()
    for (const s of baseSheets) for (const f of s.flights ?? []) m.set(f.flightLabel, { s, f })
    return m
  }, [baseSheets])
  const corDoVoo = (n) => voosPlano.find((v) => v.label === String(n ?? '').trim())?.color ?? null

  // a linha do voo escolhido: a base, a zona, o RTH, o tempo, o KMZ e o registo
  const infoVoo = (() => {
    const v = voosPlano.find((x) => x.label === vooAtual)
    if (!v) return ''
    const partes = []
    const x = fichaDoVoo.get(v.label)
    if (x) {
      partes.push(t('bases.label', { label: x.s.label }))
      if (Number.isFinite(x.s.radiusM))
        partes.push(fmt(L(UI.flightZone), { r: Math.round(x.s.radiusM) }))
      const rth = x.f.rthM ?? x.s.rthM
      if (rth != null) partes.push(`RTH ${Math.round(rth)} m`)
      if (Number.isFinite(x.f.totalS))
        partes.push(
          fmt(L(UI.flightTime), { m: Math.round(x.f.totalS / 60) }) +
            (x.f.pctUseful != null ? ` (${fmt(L(UI.flightPct), { p: x.f.pctUseful })})` : ''),
        )
      if (x.f.file) partes.push(x.f.file)
    } else if (Number.isFinite(v.timeS)) {
      partes.push(fmt(L(UI.flightPlanned), { m: Math.round((v.timeS + v.transitS) / 60) }))
    }
    const linha = voos.find((l) => String(l.n ?? '').trim() === v.label)
    const ini = String(linha?.inicio ?? '').trim()
    const fim = String(linha?.fim ?? '').trim()
    if (ini || fim) partes.push(fmt(L(UI.flightLogged), { a: ini || '—', b: fim || '—' }))
    return partes.join(' · ')
  })()

  // o que a folha A4 de cada base leva da checklist: a ordem do dia, a
  // identificação, as acções de segurança e os críticos da descolagem (o
  // grupo 1 da fase Durante: os índices dos grupos não mudam)
  const ordemDia = useMemo(() => dayFlightOrder(baseSheets), [baseSheets])
  const descolagem = FASES.find((f) => f.id === 'durante')?.grupos[1]
  const sheetProps = {
    order: ordemDia,
    missionName: missao.missao,
    droneLabel: missao.plataforma,
    date: missao.data,
    pilot: missao.operador,
    safety,
    criticalItems: (descolagem?.itens ?? [])
      .filter((item) => item.critico)
      .map((item) => (item.nota ? `${L(item.texto)} (${L(item.nota)})` : L(item.texto))),
  }

  const abrirFicha = (i) => {
    setFicha(i)
    setUltimaFicha(baseSheets[i]?.id ?? null)
  }
  const fecharFicha = () => {
    const id = baseSheets[ficha]?.id
    // a checklist deixa de estar inerte antes de o foco voltar ao cartão
    flushSync(() => setFicha(null))
    if (id != null) cardRefs.current[id]?.focus()
  }
  // as folhas de todas as bases só existem enquanto se imprimem
  const imprimirFichas = () => {
    flushSync(() => setImprimir('fichas'))
    window.print()
    setImprimir(null)
  }

  /* ---------------------------- Cabeçalho ---------------------------- */
  const nBases = baseSheets.length
  const nVoos = voosPlano.length
  const voosTxt =
    nVoos === 0
      ? ''
      : nBases > 0
        ? nVoos === 1
          ? L(UI.flightBase)
          : nBases === 1
            ? fmt(L(UI.flightsBase), { n: nVoos })
            : fmt(L(UI.flightsBases), { n: nVoos, b: nBases })
        : nVoos === 1
          ? L(UI.flightOne)
          : fmt(L(UI.flights), { n: nVoos })
  const subtitulo = [missao.missao, missao.plataforma, voosTxt].filter(Boolean).join(' · ')

  const pctGlobal = resumo.total ? Math.round((resumo.feitos / resumo.total) * 100) : 0
  const critPorFazer = contagens.reduce((n, c) => n + c.crit - c.critFeitos, 0)
  const ids = (id) => ({
    tab: `${prefixo}-tab-${id}`,
    painel: `${prefixo}-painel-${id}`,
    titulo: `${prefixo}-titulo-${id}`,
    progresso: `${prefixo}-progresso-${id}`,
  })
  // setas, Home e End entre os separadores (o foco segue a escolha)
  const teclaFase = (e, i) => {
    const n = FASES.length
    const destino = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[
      e.key
    ]
    if (destino === undefined) return
    e.preventDefault()
    setFase(FASES[destino].id)
    document.getElementById(ids(FASES[destino].id).tab)?.focus()
  }
  const temLado = Boolean(safety) || baseSheets.length > 0

  return (
    <div
      className="chk-root min-h-full bg-slate-950 text-slate-100"
      data-imprimir={imprimir ?? (ficha != null ? 'ficha' : 'checklist')}
    >
      <style>{PRINT_CSS}</style>

      <div className="chk-page" inert={ficha != null}>
        {/* -------------------------- Cabeçalho -------------------------- */}
        <header className="chk-cabecalho flex min-h-[72px] flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 py-3 pl-5 pr-8">
          <button type="button" onClick={onBack} className={`no-print ${VOLTAR}`}>
            <IconArrowLeft className="h-[18px] w-[18px]" />
            {L(UI.back)}
          </button>
          <span aria-hidden="true" className="no-print h-8 w-px bg-slate-800" />
          <div className="min-w-0 pl-1">
            <h1 className="m-0 text-lg font-semibold tracking-[-0.01em]">{L(UI.title)}</h1>
            {subtitulo && <div className="mt-[3px] text-[12.5px] text-slate-400">{subtitulo}</div>}
          </div>
          <div className="flex-1" />
          <div className="no-print flex flex-wrap items-center gap-2.5">
            <Button
              size="lg"
              variant="primary"
              onClick={exportarJSON}
              icon={<IconDownload className="h-4 w-4" />}
            >
              {L(UI.exportJson)}
            </Button>
            <Button
              size="lg"
              onClick={imprimirPreenchido}
              icon={<IconPrinter className="h-4 w-4 text-slate-300" />}
            >
              {L(UI.printFilled)}
            </Button>
            <Button
              size="lg"
              onClick={imprimirEmBranco}
              icon={<IconFile className="h-4 w-4 text-slate-300" />}
            >
              {L(UI.printBlank)}
            </Button>
            <span aria-hidden="true" className="mx-1.5 h-8 w-px bg-slate-700" />
            <Button
              size="lg"
              variant="danger"
              onClick={limpar}
              icon={<IconTrash className="h-4 w-4" />}
            >
              {L(UI.clear)}
            </Button>
          </div>
        </header>

        <main className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-5 sm:px-8">
          {outraMissao && (
            <div
              data-testid="checklist-other-mission"
              className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-[#6B4A12] bg-[#1F170A] px-4 py-3 text-[13px] text-amber-100"
            >
              <span className="min-w-0 flex-1">
                {L(UI.otherMission)
                  .replace('{m}', outraMissao.nome)
                  .replace('{d}', outraMissao.savedAt ?? outraMissao.missao?.data ?? '—')}
              </span>
              <Button size="md" variant="primary" onClick={esquecerOutra}>
                {L(UI.startNew)}
              </Button>
              <Button size="md" onClick={continuarOutra}>
                {L(UI.continueOld).replace('{m}', outraMissao.nome)}
              </Button>
            </div>
          )}

          {/* ---------------------- Campos da missão ---------------------- */}
          <section
            aria-labelledby={`${prefixo}-missao`}
            className={`${CARTAO} px-5 pb-[18px] pt-4`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 id={`${prefixo}-missao`} className={H2}>
                {L(UI.missionSection)}
              </h2>
              <span className="flex-1" />
              <span className="no-print flex items-center gap-1.5 text-[12.5px] text-slate-400">
                <IconCheckCircle className="h-[15px] w-[15px] text-emerald-400" />
                {L(UI.autosave)}
              </span>
            </div>
            <div className="chk-campos grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {CAMPOS_MISSAO.map((c) => (
                <CampoTexto
                  key={c.key}
                  campo={c.key}
                  label={L(c.label)}
                  type={c.type}
                  placeholder={L(c.placeholder)}
                  value={missao[c.key] ?? ''}
                  onChange={(v) => setCampoMissao(c.key, v)}
                />
              ))}
            </div>
          </section>

          <div
            className={`chk-colunas grid items-start gap-5 ${
              temLado ? 'xl:grid-cols-[minmax(0,1fr)_468px]' : ''
            }`}
          >
            {/* ------------------- Checklist em fases ------------------- */}
            <section
              aria-labelledby={`${prefixo}-checklist`}
              className={`${CARTAO} flex min-w-0 flex-col gap-3 px-[18px] pb-[18px] pt-4`}
            >
              <div className="flex min-h-[30px] flex-wrap items-center gap-3">
                <h2 id={`${prefixo}-checklist`} className={H2}>
                  {L(UI.checklist)}
                </h2>
                <span className="chk-progresso text-[13px] tabular-nums text-slate-300">
                  {fmt(L(UI.overall), { f: resumo.feitos, t: resumo.total, p: pctGlobal })}
                </span>
                <span className="flex-1" />
                {critPorFazer > 0 ? (
                  <CritPill>{critText(critPorFazer, L)}</CritPill>
                ) : (
                  <span className="chk-crit-pill inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#1F5C47] bg-[#0D2A21] px-[11px] text-[12.5px] font-semibold text-emerald-200">
                    <Svg className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2}>
                      <path d="M20 6 9 17l-5-5" />
                    </Svg>
                    {L(UI.critAllDone)}
                  </span>
                )}
              </div>

              <div
                role="tablist"
                aria-label={L(UI.phases)}
                className="no-print grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {FASES.map((f, i) => (
                  <FaseTab
                    key={f.id}
                    ids={ids(f.id)}
                    fase={f}
                    n={i + 1}
                    c={contagens[i]}
                    sel={f.id === fase}
                    onSelect={() => setFase(f.id)}
                    onKeyDown={(e) => teclaFase(e, i)}
                    L={L}
                  />
                ))}
              </div>

              <div className="chk-fases">
                {FASES.map((f, fi) => {
                  const sel = f.id === fase
                  return (
                    <div
                      key={f.id}
                      role="tabpanel"
                      id={ids(f.id).painel}
                      aria-labelledby={ids(f.id).tab}
                      hidden={!sel}
                      className={`chk-fase flex-col gap-2 ${sel ? 'flex' : 'hidden'}`}
                    >
                      <h3 className="chk-fase-titulo hidden">
                        {L(f.titulo)}
                        <span className="chk-progresso">
                          {' '}
                          ·{' '}
                          {fmt(L(UI.itemsOf), { f: contagens[fi].feitos, t: contagens[fi].total })}
                        </span>
                      </h3>
                      {f.id === 'durante' && voosPlano.length > 0 && (
                        <SeletorVoo
                          voos={voosPlano}
                          valor={vooAtual}
                          onChange={setVooEscolhido}
                          info={infoVoo}
                          L={L}
                        />
                      )}
                      {/* filtragem sem reindexar: gi original preserva as chaves gravadas */}
                      {f.grupos.map(
                        (grupo, gi) =>
                          groupApplies(grupo, sensorType, {
                            face: faceMode,
                            corridor: corridorMode,
                          }) && (
                            <Grupo
                              key={`${f.id}.${gi}`}
                              id={`${prefixo}-grupo-${f.id}-${gi}`}
                              grupo={grupo}
                              faseId={f.id}
                              gi={gi}
                              c={contagens[fi].grupos[gi]}
                              checked={checked}
                              onToggle={toggle}
                              aberto={abertos[`${f.id}.${gi}`] ?? true}
                              onAbrir={() =>
                                setAbertos((a) => ({
                                  ...a,
                                  [`${f.id}.${gi}`]: !(a[`${f.id}.${gi}`] ?? true),
                                }))
                              }
                              L={L}
                            />
                          ),
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {temLado && (
              <div className="chk-lado grid items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
                {safety && <SegurancaKmz safety={safety} rthInfo={rthInfo} t={t} L={L} />}
                {baseSheets.length > 0 && (
                  <FichasPorBase
                    sheets={baseSheets}
                    day={daySheets}
                    onOpen={abrirFicha}
                    onPrintAll={imprimirFichas}
                    ultima={ultimaFicha}
                    cardRefs={cardRefs}
                    t={t}
                    L={L}
                  />
                )}
              </div>
            )}
          </div>

          {/* ------------------------ Registo de voos ---------------------- */}
          <section
            aria-labelledby={`${prefixo}-voos`}
            className={`chk-registo ${CARTAO} px-5 pb-5 pt-3.5`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <h2 id={`${prefixo}-voos`} className={H2}>
                  {L(UI.flightsSection)}
                </h2>
                <p className="m-0 mt-0.5 text-[12.5px] text-slate-400">{L(UI.flightsHint)}</p>
              </div>
              <div className="no-print flex flex-wrap items-center gap-2">
                {blocks && blocks.length > 0 && (
                  <Button
                    size="lg"
                    onClick={importarBlocos}
                    icon={<IconImport className="h-4 w-4 text-slate-300" />}
                  >
                    {L(UI.importBlocks)} ({blocks.length})
                  </Button>
                )}
                <Button
                  size="lg"
                  aria-label={L(UI.addFlightFull)}
                  title={L(UI.addFlightFull)}
                  onClick={() => setVoos((v) => [...v, linhaVazia(COLS_VOO)])}
                  icon={<IconPlus className="h-4 w-4" />}
                >
                  {L(UI.addFlight)}
                </Button>
                <Button
                  size="lg"
                  variant="danger"
                  aria-label={L(UI.removeFlightFull)}
                  title={L(UI.removeFlightFull)}
                  disabled={voos.length === 0}
                  onClick={() => setVoos((v) => v.slice(0, -1))}
                >
                  {L(UI.removeLast)}
                </Button>
              </div>
            </div>
            <Tabela
              label={L(UI.flightsSection)}
              cols={ORDEM_VOO.map((k) => COLS_VOO.find((c) => c.key === k))}
              linhas={voos}
              onCell={setCelulaVoo}
              largura={LARGURA.voo}
              separador="inicio"
              plano={new Set(['n', 'area', 'previsto'])}
              corDe={corDoVoo}
              nomeCelula={(col, linha, i) =>
                String(linha.n ?? '').trim()
                  ? fmt(L(UI.cellFlight), { col, v: String(linha.n).trim() })
                  : fmt(L(UI.cellRow), { col, i: i + 1 })
              }
              L={L}
            />
          </section>

          {/* --------------------------- GCPs ----------------------------- */}
          <section
            aria-labelledby={`${prefixo}-gcps`}
            className={`chk-registo ${CARTAO} px-5 pb-5 pt-3.5`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <h2 id={`${prefixo}-gcps`} className={H2}>
                  {L(UI.gcpSection)}
                </h2>
                <p className="m-0 mt-0.5 text-[12.5px] text-slate-400">
                  {plannedGcps && plannedGcps.length > 0
                    ? fmt(L(UI.gcpsHintPlanned), { n: plannedGcps.length })
                    : L(UI.gcpsHint)}
                </p>
              </div>
              <div className="no-print flex flex-wrap items-center gap-2">
                {plannedGcps && plannedGcps.length > 0 && (
                  <Button
                    size="lg"
                    onClick={importarGcps}
                    icon={<IconImport className="h-4 w-4 text-slate-300" />}
                  >
                    {L(UI.importGcps)} ({plannedGcps.length})
                  </Button>
                )}
                <Button
                  size="lg"
                  aria-label={L(UI.addGcpFull)}
                  title={L(UI.addGcpFull)}
                  onClick={() => setGcps((g) => [...g, linhaVazia(COLS_GCP)])}
                  icon={<IconPlus className="h-4 w-4" />}
                >
                  {L(UI.addGcp)}
                </Button>
                <Button
                  size="lg"
                  variant="danger"
                  aria-label={L(UI.removeGcpFull)}
                  title={L(UI.removeGcpFull)}
                  disabled={gcps.length === 0}
                  onClick={() => setGcps((g) => g.slice(0, -1))}
                >
                  {L(UI.removeLast)}
                </Button>
              </div>
            </div>
            <Tabela
              label={L(UI.gcpSection)}
              cols={COLS_GCP}
              linhas={gcps}
              onCell={setCelulaGcp}
              largura={LARGURA.gcp}
              nomeCelula={(col, _linha, i) => fmt(L(UI.cellGcp), { col, i: i + 1 })}
              L={L}
            />
          </section>

          {/* --------------------------- Notas ---------------------------- */}
          <section
            aria-labelledby={`${prefixo}-notas`}
            className={`chk-notas-bloco ${CARTAO} px-5 pb-5 pt-3.5`}
          >
            <h2 id={`${prefixo}-notas`} className={`${H2} mb-3`}>
              {L(UI.notesSection)}
            </h2>
            <div className="chk-notas grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          <section
            aria-labelledby={`${prefixo}-assinaturas`}
            className={`chk-assinaturas ${CARTAO} px-5 pb-[18px] pt-3.5`}
          >
            <div className="flex items-baseline gap-2.5">
              <h2 id={`${prefixo}-assinaturas`} className={H2}>
                {L(UI.signatures)}
              </h2>
              <span className="no-print text-[12.5px] text-slate-400">{L(UI.signaturesHint)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-8">
              {ASSINATURAS.map((papel) => (
                <div key={papel.pt}>
                  <div className="chk-linha h-10 border-b border-[#3A4A66]" />
                  <p className="m-0 mt-1.5 text-[12.5px] text-slate-300">{L(papel)}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {ficha != null && baseSheets[ficha] && (
        <FichaVista
          sheets={baseSheets}
          index={ficha}
          onIndex={abrirFicha}
          onClose={fecharFicha}
          onPrintAll={imprimirFichas}
          sheetProps={sheetProps}
          t={t}
          L={L}
        />
      )}

      {imprimir === 'fichas' && (
        // fora do ecrã mas com a largura da folha: cada uma mede-se para caber na página
        <div
          className="chk-fichas-impressao pointer-events-none invisible absolute left-[-10000px] top-0"
          data-testid="sheets-print"
        >
          {baseSheets.map((s, i) => (
            <BaseSheetPage
              key={s.id}
              sheet={s}
              index={i}
              total={baseSheets.length}
              {...sheetProps}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------- Estilos de impressão --------------------------- */

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm; }

  html, body {
    background: #fff !important;
    color: #000 !important;
  }

  .no-print { display: none !important; }

  /* o que se imprime: a checklist, a folha da base aberta, ou as de todas */
  .chk-root { min-height: 0 !important; background: #fff !important; }
  .chk-root[data-imprimir='ficha'] .chk-page,
  .chk-root[data-imprimir='fichas'] .chk-page,
  .chk-root[data-imprimir='fichas'] .chk-vista { display: none !important; }
  .chk-root .chk-vista {
    position: static !important;
    display: block !important;
    background: #fff !important;
  }
  .chk-root .chk-vista-corpo { overflow: visible !important; padding: 0 !important; }
  .chk-root .chk-papel { width: auto !important; box-shadow: none !important; }
  .chk-root .chk-fichas-impressao {
    position: static !important;
    visibility: visible !important;
  }
  /* a folha de cada base nas suas páginas (a margem é a da página): uma,
     reduzida só quando o conteúdo não cabe (--print-zoom), ou várias, de
     propósito, com muitos voos (BaseSheetPage mede e pagina); nenhum bloco
     se parte, e as tabelas só entre linhas */
  .chk-root .chk-ficha {
    width: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    gap: 0 !important;
    zoom: var(--print-zoom, 1);
    break-after: page;
  }
  .chk-root .chk-ficha:last-child { break-after: auto; }
  .chk-root .chk-ficha-pagina {
    width: auto !important;
    min-height: calc(276mm / var(--print-zoom, 1)) !important;
    padding: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
  }
  .chk-root .chk-ficha-pagina:not(:last-child) { break-after: page; }
  .chk-root .chk-ficha [data-bloco],
  .chk-root .chk-ficha tr { break-inside: avoid; }
  .chk-root .chk-ficha a { text-decoration: none !important; }

  /* a checklist: a preto e branco, compacta */
  .chk-page,
  .chk-page * {
    background: transparent !important;
    color: #000 !important;
    border-color: #ccc !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  .chk-page { font-size: 9pt; }
  .chk-page .chk-registo { break-inside: avoid; }
  .chk-page .chk-campos input {
    height: auto !important;
    padding: 1mm 1.5mm !important;
  }
  .chk-page main { max-width: none !important; padding: 0 !important; gap: 4mm !important; }
  .chk-page .chk-cabecalho {
    min-height: 0 !important;
    padding: 0 0 3mm !important;
    border-bottom: 1px solid #000 !important;
  }
  .chk-page .chk-bloco {
    border: 1px solid #bbb !important;
    border-radius: 0 !important;
    padding: 3mm !important;
  }
  .chk-page .chk-colunas,
  .chk-page .chk-lado { display: block !important; }
  .chk-page .chk-lado { margin-top: 4mm; }
  .chk-page .chk-lado > * + * { margin-top: 4mm; }
  /* a identificação em duas linhas: a plataforma («DJI Matrice 300 RTK +
     Zenmuse P1») não cabe num quinto da folha, e um campo não dobra */
  .chk-page .chk-campos { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }
  .chk-page .chk-campos > label { grid-column: span 2; }
  .chk-page .chk-campos > label[data-campo='plataforma'] { grid-column: span 4; }

  /* as três fases lado a lado, com os grupos todos abertos */
  .chk-page .chk-fases {
    display: grid !important;
    grid-template-columns: 1fr 1fr 1fr !important;
    gap: 4mm !important;
  }
  .chk-page .chk-fase { display: block !important; }
  .chk-page .chk-fase-titulo {
    display: block !important;
    margin: 0 0 1.5mm !important;
    font-size: 8pt !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .chk-page .chk-grupo {
    border: 0 !important;
    border-radius: 0 !important;
    margin-bottom: 2mm;
    break-inside: avoid;
  }
  .chk-page .chk-grupo-btn {
    min-height: 0 !important;
    padding: 0 !important;
    gap: 1.5mm !important;
  }
  .chk-page .chk-grupo-titulo { font-size: 7.5pt !important; font-weight: 700 !important; }
  .chk-page .chk-anel,
  .chk-page .chk-seta,
  .chk-page .chk-crit-pill svg,
  .chk-page .chk-crit svg { display: none !important; }
  .chk-page .chk-progresso { font-size: 7pt !important; }
  .chk-page .chk-por-voo,
  .chk-page .chk-crit-pill {
    height: auto !important;
    padding: 0 1mm !important;
    border: 1px solid #777 !important;
    font-size: 6pt !important;
  }
  .chk-page .chk-itens { display: block !important; border: 0 !important; }
  .chk-page .chk-itens li { border: 0 !important; }
  .chk-page .chk-item {
    min-height: 0 !important;
    padding: 0.4mm 0 !important;
    gap: 1.5mm !important;
  }
  .chk-page .chk-box {
    width: 3mm !important;
    height: 3mm !important;
    margin-top: 0.4mm;
    border: 1px solid #444 !important;
    border-radius: 0.5mm !important;
  }
  .chk-page .chk-mark { width: 2.6mm !important; height: 2.6mm !important; }
  .chk-page .chk-text,
  .chk-page .chk-note {
    font-size: 7.5pt !important;
    line-height: 1.25 !important;
  }
  .chk-page .chk-crit {
    height: auto !important;
    padding: 0 1mm !important;
    border: 1px solid #777 !important;
    font-size: 6pt !important;
  }

  /* as fichas por base: os cartões em quatro colunas; a lista passa à página
     seguinte entre filas, nunca a meio de um cartão, e o título vai com ela */
  .chk-page .chk-bases > div,
  .chk-page .chk-bases > p { break-after: avoid; }
  .chk-page .chk-bases li { break-inside: avoid; }
  .chk-page .chk-bases ul {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 1.5mm !important;
  }
  .chk-page .chk-cartao-base {
    min-height: 0 !important;
    padding: 1mm 1.5mm !important;
    gap: 0.5mm !important;
    border: 1px solid #ccc !important;
    border-radius: 0 !important;
  }
  /* no papel, tudo na mesma letra pequena e os voos de cada base por
     inteiro; a cor da base não passa ao preto e branco, e o nome já diz
     a letra */
  .chk-page .chk-cartao-base,
  .chk-page .chk-cartao-base * { font-size: 7pt !important; }
  .chk-page .chk-cartao-base span {
    overflow: visible !important;
    text-overflow: clip !important;
  }
  .chk-page .chk-zona { height: auto !important; padding: 0 !important; }
  .chk-page .chk-cor { display: none !important; }
  .chk-page .chk-zona-nota { gap: 1.2mm !important; }
  .chk-page .chk-zona-nota > span { padding-top: 0 !important; }

  .chk-page input,
  .chk-page textarea {
    border: 1px solid #ccc !important;
    border-radius: 0 !important;
    font-size: 8pt !important;
    resize: none !important;
  }
  .chk-page .chk-moldura { overflow: visible !important; border: 0 !important; }
  .chk-page .chk-tabela {
    min-width: 0 !important;
    width: 100% !important;
    table-layout: fixed;
    font-size: 7.5pt !important;
  }
  .chk-page .chk-tabela th,
  .chk-page .chk-tabela td {
    border: 1px solid #ccc !important;
    padding: 0.5mm 1mm !important;
    width: auto !important;
    min-width: 0 !important;
  }
  /* os títulos na letra da tabela (a linha do ecrã traz a sua), e a
     primeira coluna, só com o voo ou o número, estreita: «Observações»
     cabe na sua */
  .chk-page .chk-tabela th { font-size: 7pt !important; line-height: 1.2 !important; }
  .chk-page .chk-tabela th:first-child { width: 11mm !important; }
  .chk-page .chk-tabela td > span { height: auto !important; }
  .chk-page .chk-tabela input {
    height: auto !important;
    border: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
    font-size: 7.5pt !important;
  }
  .chk-page .chk-tabela input::placeholder { color: transparent !important; }

  .chk-page .chk-notas { grid-template-columns: 1fr 1fr !important; gap: 3mm !important; }
  /* as notas, como o registo e as assinaturas, não se partem; e um título
     não fica sozinho no fim da página */
  .chk-page .chk-notas-bloco,
  .chk-page .chk-assinaturas { break-inside: avoid; }
  .chk-page h2,
  .chk-page h3 { break-after: avoid; }
  .chk-page .chk-linha { border-bottom: 1px solid #000 !important; }
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

  body.print-blank .chk-progresso { visibility: hidden !important; }

  /* o estado dos críticos também é preenchimento */
  body.print-blank .chk-crit-pill { display: none !important; }
}
`
