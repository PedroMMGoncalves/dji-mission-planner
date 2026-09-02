/**
 * Projecto: gravação automática em localStorage (debounce), hidratação
 * única no arranque, exportação para ficheiro JSON e importação. A forma
 * do ficheiro, a leitura e a migração v1 → v2 estão em mission/project.js;
 * distribuir o projecto normalizado pelo estado é do App (applyNormalized),
 * que é quem tem os setters.
 */
import { useCallback, useEffect, useRef } from 'react'
import { PROJECT_STORAGE_KEY, normalizeProject, projectFileName, serializeProject } from '../mission/project.js'
import { downloadBlob } from '../utils/exporters.js'

/**
 * @param {object} args
 * @param {object} args.state tudo o que o projecto guarda (memoizado pelo App)
 * @param {string} args.missionName
 * @param {(n: object) => void} args.applyNormalized distribui um projecto normalizado pelo estado
 * @param {() => void} args.onLoaded chamado quando um projecto com área foi carregado (enquadrar o mapa)
 * @param {(msg: string|null) => void} args.setImportError
 */
export function useProject({ state, missionName, applyNormalized, onLoaded, setImportError }) {
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
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if (applyProject(p) && p.ring) onLoaded()
      }
    } catch {
      /* projeto corrompido: ignora */
    }
    hydratedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // gravação automática (debounce 500 ms)
  useEffect(() => {
    if (!hydratedRef.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(serializeProject(state)))
      } catch {
        /* armazenamento indisponível */
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

  const importProject = useCallback(
    async (file) => {
      if (!file) return
      try {
        const p = JSON.parse(await file.text())
        if (!applyProject(p)) {
          setImportError('Ficheiro de projeto inválido')
          return
        }
        if (p.ring) onLoaded()
      } catch {
        setImportError('Ficheiro de projeto inválido')
      }
    },
    [applyProject, setImportError, onLoaded],
  )

  return { applyProject, exportProject, importProject }
}
