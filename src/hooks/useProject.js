/**
 * Projecto: gravação automática em localStorage (debounce), hidratação
 * única no arranque, exportação para ficheiro JSON e importação. A forma
 * do ficheiro, a leitura e a migração v1 → v2 estão em mission/project.js;
 * distribuir o projecto normalizado pelo estado é do App (applyNormalized),
 * que é quem tem os setters.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PROJECT_STORAGE_KEY,
  normalizeProject,
  projectFileName,
  serializeProject,
} from '../mission/project.js'
import { downloadBlob } from '../utils/exporters.js'

/** Chave da cópia de um projecto gravado que não se conseguiu ler (M3-C7). */
export function rejectedProjectKey(now = new Date()) {
  return `${PROJECT_STORAGE_KEY}:recusado:${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
}

/**
 * @param {object} args
 * @param {object} args.state tudo o que o projecto guarda (memoizado pelo App)
 * @param {string} args.missionName
 * @param {(n: object) => void} args.applyNormalized distribui um projecto normalizado pelo estado
 * @param {() => void} args.onLoaded chamado quando um projecto com área foi carregado (enquadrar o mapa)
 * @param {(msg: string|null) => void} args.setImportError
 * @param {(key: string, vars?: object) => string} args.t
 */
export function useProject({ state, missionName, applyNormalized, onLoaded, setImportError, t }) {
  const hydratedRef = useRef(false)

  /** Lê e aplica um projecto (v1 ou v2); devolve false se não for um projecto. */
  const applyProject = useCallback(
    (p) => {
      const n = normalizeProject(p)
      if (!n) return false
      applyNormalized(n)
      return true
    },
    [applyNormalized],
  )

  // Hidratação única no arranque: applyProject reconstitui uma dezena de
  // átomos de estado a partir do projecto gravado, e passá-los todos a
  // inicializadores preguiçosos de useState não é um acerto local. Custa um
  // render extra, uma só vez.
  useEffect(() => {
    let raw = null
    try {
      raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    } catch {
      /* armazenamento recusado: começa-se vazio */
    }
    if (raw) {
      let ok = false
      try {
        const p = JSON.parse(raw)
        ok = applyProject(p)
        if (ok && p.ring) onLoaded()
      } catch {
        ok = false
      }
      if (!ok) {
        // O projecto gravado não se leu (JSON inválido, versão desconhecida,
        // coordenadas inválidas): fica numa cópia datada antes de a gravação
        // automática escrever o estado vazio por cima (M3-C7), e diz-se
        const key = rejectedProjectKey()
        try {
          localStorage.setItem(key, raw)
        } catch {
          /* sem espaço: a cópia não fica, o aviso sim */
        }
        setImportError(t('project.err.rejected', { key }))
      }
    }
    hydratedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // gravação automática (debounce 500 ms); o cabeçalho diz quando o browser
  // a recusa (armazenamento bloqueado ou cheio). null até à primeira
  // tentativa: antes dela não se sabe se fica gravado
  const [autosaveFailed, setAutosaveFailed] = useState(/** @type {boolean|null} */ (null))
  useEffect(() => {
    if (!hydratedRef.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(serializeProject(state)))
        setAutosaveFailed(false)
      } catch {
        setAutosaveFailed(true)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [state])

  const exportProject = useCallback(() => {
    downloadBlob(
      new Blob([JSON.stringify(serializeProject(state), null, 2)], { type: 'application/json' }),
      projectFileName(missionName),
    )
  }, [state, missionName])

  // devolve se o projecto abriu (null sem ficheiro): quem o abriu mostra o
  // erro também onde a acção foi feita
  const importProject = useCallback(
    async (file) => {
      if (!file) return null
      try {
        const p = JSON.parse(await file.text())
        if (!applyProject(p)) {
          setImportError(t('project.err.invalid'))
          return false
        }
        if (p.ring) onLoaded()
        return true
      } catch {
        setImportError(t('project.err.invalid'))
        return false
      }
    },
    [applyProject, setImportError, onLoaded, t],
  )

  return { applyProject, exportProject, importProject, autosaveFailed }
}
