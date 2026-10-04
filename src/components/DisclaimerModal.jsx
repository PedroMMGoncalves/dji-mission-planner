/**
 * Aviso antes de usar: aparece uma vez por aparelho e volta quando o texto
 * muda (DISCLAIMER_VERSION). Só fecha no botão: nem Escape nem um clique
 * fora o dispensam. Reabre-se da ajuda, e aí fecha como qualquer janela.
 */
import { useEffect } from 'react'
import { LANGS } from '../i18n.jsx'

/** Sobe quando o texto muda: o aviso volta a aparecer a toda a gente. */
export const DISCLAIMER_VERSION = '1'
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

function Item({ title, children }) {
  return (
    <li className="mb-2.5 leading-relaxed">
      <strong className="text-slate-100">{title}</strong> {children}
    </li>
  )
}

const MatrixLink = ({ children }) => (
  <a
    href={MATRIX_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sky-400 underline hover:text-sky-300"
  >
    {children}
  </a>
)

function TextoPt() {
  return (
    <>
      <p className="mb-3 leading-relaxed">
        Esta aplicação ajuda a planear missões de drone e a exportá-las para o DJI Pilot 2. Antes de
        a usar, leia o seguinte:
      </p>
      <ol className="list-decimal pl-5">
        <Item title="Sem garantia.">
          O software é fornecido tal como está, sem garantia de qualquer tipo, nos termos da licença
          GPL-3.0. Os autores não garantem que as missões geradas estejam correctas, completas ou
          adequadas a um fim específico. Na medida máxima permitida pela lei aplicável, os autores
          não são responsáveis por danos resultantes da sua utilização.
        </Item>
        <Item title="A responsabilidade é do piloto.">
          O piloto remoto é o único responsável pela operação: regras UAS (Reg. (UE) 2019/947),
          zonas geográficas, autorizações, condições meteorológicas e segurança de pessoas e bens no
          local.
        </Item>
        <Item title="Verifique antes de descolar.">
          Reveja cada missão no DJI Pilot 2 antes do voo: rota, alturas, velocidade e acções da
          câmara. As alturas são relativas ao ponto de descolagem, por isso descole no ponto
          previsto.
        </Item>
        <Item title="O relevo é uma aproximação.">
          O relevo global tem cerca de 30 m de resolução e pode falhar em taludes, cortas e encostas
          íngremes. Nenhum modelo de terreno inclui árvores, edifícios, linhas eléctricas ou outros
          obstáculos.
        </Item>
        <Item title="Nem tudo foi validado em voo.">
          Alguns modos (circular, órbita em vídeo, corredor com seguimento de terreno) e algumas
          combinações de aeronave e payload ainda não foram confirmados em voo. O estado de cada uma
          está na <MatrixLink>matriz de compatibilidade</MatrixLink>.
        </Item>
      </ol>
      <p className="mt-3 leading-relaxed">
        Ao continuar, declara que compreende estas limitações e que a utilização da aplicação é da
        sua inteira responsabilidade.
      </p>
    </>
  )
}

function TextoEn() {
  return (
    <>
      <p className="mb-3 leading-relaxed">
        This app helps plan drone missions and export them to DJI Pilot 2. Before using it, please
        read the following:
      </p>
      <ol className="list-decimal pl-5">
        <Item title="No warranty.">
          The software is provided as is, without warranty of any kind, under the GPL-3.0 licence.
          The authors do not guarantee that the generated missions are correct, complete or fit for
          a particular purpose. To the fullest extent permitted by applicable law, the authors are
          not liable for any damage arising from its use.
        </Item>
        <Item title="The pilot is responsible.">
          The remote pilot is solely responsible for the operation: UAS rules (Regulation (EU)
          2019/947), geographical zones, authorisations, weather, and the safety of people and
          property on site.
        </Item>
        <Item title="Check before take-off.">
          Review every mission in DJI Pilot 2 before flying: route, heights, speed and camera
          actions. Heights are relative to the take-off point, so take off where planned.
        </Item>
        <Item title="Terrain is an approximation.">
          The global terrain has a resolution of about 30 m and may be wrong on embankments, open
          pits and steep slopes. No terrain model includes trees, buildings, power lines or other
          obstacles.
        </Item>
        <Item title="Not everything has been flight-tested.">
          Some modes (circular, orbit video, corridor with terrain following) and some
          aircraft–payload combinations have not yet been confirmed in flight. The status of each is
          in the <MatrixLink>compatibility matrix</MatrixLink>.
        </Item>
      </ol>
      <p className="mt-3 leading-relaxed">
        By continuing, you confirm that you understand these limitations and that you use the app
        entirely at your own risk.
      </p>
    </>
  )
}

/**
 * @param {{lang: string, setLang: (l: string) => void, onAccept: () => void,
 *   dismissable?: boolean}} props `dismissable`: reaberto da ajuda, fecha
 *   também com Escape ou um clique fora (já foi aceite).
 */
export default function DisclaimerModal({ lang, setLang, onAccept, dismissable = false }) {
  useEffect(() => {
    if (!dismissable) return
    const onKey = (e) => {
      if (e.key === 'Escape') onAccept()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissable, onAccept])

  const en = lang === 'en'
  return (
    <div
      className="fixed inset-0 z-[4000] flex items-start justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm"
      onClick={dismissable ? onAccept : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disclaimer-title"
        data-testid="disclaimer"
        className="mt-6 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-amber-700/60 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-3">
          <h2 id="disclaimer-title" className="text-base font-semibold text-amber-300">
            ⚠ {en ? 'Before you use this app' : 'Aviso antes de usar'}
          </h2>
          <div className="ml-auto flex overflow-hidden rounded border border-slate-700">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                title={label}
                className={`px-2 py-1 text-xs font-medium uppercase ${
                  lang === code
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">
          {en ? <TextoEn /> : <TextoPt />}
        </div>
        <div className="flex justify-end border-t border-slate-700 px-5 py-3">
          <button
            type="button"
            autoFocus
            onClick={onAccept}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            {en ? 'I understand' : 'Li e compreendo'}
          </button>
        </div>
      </div>
    </div>
  )
}
