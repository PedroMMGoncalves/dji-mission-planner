/**
 * Aviso antes de usar: aparece uma vez por aparelho e volta quando o texto
 * muda (DISCLAIMER_VERSION). Só fecha no botão: nem Escape nem um clique
 * fora o dispensam. Reabre-se da ajuda, e aí fecha como qualquer janela.
 * O texto integral em pontos numerados, com a declaração ao lado do botão.
 */
import { useEffect, useRef } from 'react'
import { LANGS, translate } from '../i18n.jsx'
import { IconWarning } from './Icons.jsx'
import { Icon } from './MapOverlay.jsx'
import { buttonClass } from './ui/Button.jsx'
import { BACKDROP, WINDOW, WindowHeader, useDialogFocus } from './ui/Window.jsx'

/** Sobe quando o texto muda: o aviso volta a aparecer a toda a gente. */
export const DISCLAIMER_VERSION = '2'
export const DISCLAIMER_KEY = 'dji-mission-planner:disclaimer'

const MATRIX_URL =
  'https://github.com/PedroMMGoncalves/dji-mission-planner/blob/main/docs/VALIDACAO.md#5-matriz-de-compatibilidade-a-preencher'

/** O aviso desta versão já foi aceite neste aparelho? Sem armazenamento, não. */
export function disclaimerAccepted() {
  try {
    return localStorage.getItem(DISCLAIMER_KEY) === DISCLAIMER_VERSION
  } catch {
    return false
  }
}

export function acceptDisclaimer() {
  try {
    localStorage.setItem(DISCLAIMER_KEY, DISCLAIMER_VERSION)
  } catch {
    // sem armazenamento (navegação privada): volta a aparecer na próxima vez
  }
}

/** Um ponto numerado: o número num círculo, o título e o texto. */
function Item({ n, title, children }) {
  return (
    <li className="grid grid-cols-[26px_minmax(0,1fr)] gap-3.5">
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#1A2742] text-[12.5px] font-semibold text-slate-200"
      >
        {n}
      </span>
      <div>
        <h3 className="m-0 text-sm font-semibold leading-normal text-slate-100">{title}</h3>
        <p className="m-0 mt-0.5 text-[13.5px] leading-[1.6] text-slate-200">{children}</p>
      </div>
    </li>
  )
}

/** Realce dentro de um ponto. */
const B = ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>

const MatrixLink = ({ children, lang }) => (
  <a
    href={MATRIX_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="whitespace-nowrap text-sky-300 underline underline-offset-2 hover:text-sky-200"
  >
    {children}
    <Icon size={13} className="ml-[3px] inline-block align-[-1px]">
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
    <span className="sr-only"> {translate(lang, 'disc.newTab')}</span>
  </a>
)

/** Pontos numerados com um começo comum (a lista do aviso). */
const LIST = 'm-0 mt-4 flex list-none flex-col gap-3.5 p-0'
/** A frase antes dos pontos. */
const LEAD = 'm-0 text-sm leading-[1.6] text-slate-200'

function TextoPt() {
  return (
    <>
      <p className={LEAD}>
        Esta aplicação ajuda a planear missões de drone e a exportá-las para o DJI Pilot 2. Antes de
        a usar, leia o seguinte:
      </p>
      <ol className={LIST}>
        <Item n={1} title="Sem garantia">
          O software é fornecido tal como está, sem garantia de qualquer tipo, nos termos da licença
          GPL-3.0. Os autores não garantem que as missões geradas estejam correctas, completas ou
          adequadas a um fim específico. Na medida máxima permitida pela lei aplicável, os autores
          não são responsáveis por danos resultantes da sua utilização.
        </Item>
        <Item n={2} title="A responsabilidade é do piloto">
          O piloto remoto é <B>o único responsável pela operação</B>: regras UAS (Reg. (UE)
          2019/947), zonas geográficas, autorizações, seguro de responsabilidade civil quando
          exigido, condições meteorológicas e segurança de pessoas e bens no local.
        </Item>
        <Item n={3} title="Verifique antes de descolar">
          Reveja cada missão no DJI Pilot 2 antes do voo: rota, alturas, velocidade e acções da
          câmara. <B>As alturas são relativas ao ponto de descolagem</B>, por isso descole no ponto
          previsto.
        </Item>
        <Item n={4} title="O relevo é uma aproximação">
          O relevo global tem cerca de 30 m de resolução e pode falhar em taludes, cortas e encostas
          íngremes.{' '}
          <B>
            Nenhum modelo de terreno inclui árvores, edifícios, linhas eléctricas ou outros
            obstáculos.
          </B>
        </Item>
        <Item n={5} title="Nem tudo foi validado em voo">
          Alguns modos (circular, órbita em vídeo, corredor com seguimento de terreno) e algumas
          combinações de aeronave e payload ainda não foram confirmados em voo. O estado de cada uma
          está na <MatrixLink lang="pt">matriz de compatibilidade</MatrixLink>.
        </Item>
      </ol>
    </>
  )
}

function TextoEn() {
  return (
    <>
      <p className={LEAD}>
        This app helps plan drone missions and export them to DJI Pilot 2. Before using it, please
        read the following:
      </p>
      <ol className={LIST}>
        <Item n={1} title="No warranty">
          The software is provided as is, without warranty of any kind, under the GPL-3.0 licence.
          The authors do not guarantee that the generated missions are correct, complete or fit for
          a particular purpose. To the fullest extent permitted by applicable law, the authors are
          not liable for any damage arising from its use.
        </Item>
        <Item n={2} title="The pilot is responsible">
          The remote pilot is <B>solely responsible for the operation</B>: UAS rules (Regulation
          (EU) 2019/947), geographical zones, authorisations, third-party liability insurance where
          required, weather, and the safety of people and property on site.
        </Item>
        <Item n={3} title="Check before take-off">
          Review every mission in DJI Pilot 2 before flying: route, heights, speed and camera
          actions. <B>Heights are relative to the take-off point</B>, so take off where planned.
        </Item>
        <Item n={4} title="Terrain is an approximation">
          The global terrain has a resolution of about 30 m and may be wrong on embankments, open
          pits and steep slopes.{' '}
          <B>No terrain model includes trees, buildings, power lines or other obstacles.</B>
        </Item>
        <Item n={5} title="Not everything has been flight-tested">
          Some modes (circular, orbit video, corridor with terrain following) and some
          aircraft–payload combinations have not yet been confirmed in flight. The status of each is
          in the <MatrixLink lang="en">compatibility matrix</MatrixLink>.
        </Item>
      </ol>
    </>
  )
}

/** A declaração ao lado do botão. */
const DECLARATION = {
  pt: 'Ao continuar, declara que compreende estas limitações e que a utilização da aplicação é da sua inteira responsabilidade.',
  en: 'By continuing, you confirm that you understand these limitations and that you use the app entirely at your own risk.',
}

/**
 * @param {{lang: string, setLang: (l: string) => void, onAccept: () => void,
 *   dismissable?: boolean}} props `dismissable`: reaberto da ajuda, fecha
 *   também com Escape ou um clique fora (já foi aceite).
 */
export default function DisclaimerModal({ lang, setLang, onAccept, dismissable = false }) {
  const boxRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const acceptRef = useRef(/** @type {HTMLButtonElement|null} */ (null))
  useDialogFocus(boxRef, acceptRef)

  useEffect(() => {
    if (!dismissable) return
    // na captura, antes das gavetas e da base seleccionada, que ficam por baixo
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onAccept()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dismissable, onAccept])

  const en = lang === 'en'
  return (
    <div
      className={`${BACKDROP} z-[4000] bg-[rgba(3,6,14,0.82)]`}
      onClick={dismissable ? onAccept : undefined}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="disclaimer-title"
        aria-describedby="disclaimer-sub"
        data-testid="disclaimer"
        lang={lang}
        tabIndex={-1}
        className={`${WINDOW} max-h-[min(820px,100%)] max-w-[760px] border-[#5C4214]`}
        onClick={(e) => e.stopPropagation()}
      >
        <WindowHeader
          id="disclaimer-title"
          subtitleId="disclaimer-sub"
          className="py-4 pl-6 pr-4"
          titleClass="text-lg"
          iconClass="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#6B4A12] bg-[#2A1F0B] text-amber-500"
          icon={<IconWarning className="h-5 w-5" />}
          title={translate(lang, 'disc.title')}
          subtitle={translate(lang, 'disc.subtitle')}
        >
          <div
            role="group"
            aria-label={translate(lang, 'disc.lang')}
            className="flex h-9 flex-none overflow-hidden rounded-lg border border-slate-700"
          >
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                title={label}
                aria-pressed={lang === code}
                className={`px-3 text-xs font-semibold uppercase transition-colors ${
                  lang === code
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </WindowHeader>
        <div className="min-h-0 overflow-y-auto px-6 pb-[22px] pt-5">
          {en ? <TextoEn /> : <TextoPt />}
        </div>
        <div className="flex flex-none flex-col items-stretch gap-3 border-t border-slate-800 bg-[#0B1220] py-4 pl-6 pr-4 sm:flex-row sm:items-center sm:gap-5">
          <p className="m-0 flex-1 text-[13px] leading-[1.55] text-slate-100">
            {DECLARATION[en ? 'en' : 'pt']}
          </p>
          <button
            ref={acceptRef}
            type="button"
            onClick={onAccept}
            className={`${buttonClass('primary', 'lg')} h-11 flex-none rounded-[9px] px-5`}
          >
            {translate(lang, 'disc.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
