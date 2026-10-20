/**
 * Armazenamento do browser (src/utils/browserStorage.js): o localStorage, ou
 * null quando o browser o recusa — modo privado ou cookies bloqueados (ler
 * window.localStorage lança SecurityError) — e fora do browser. Quem o usa
 * continua a funcionar: o equipamento (useHardware) volta aos valores por
 * omissão e gravar diz que não gravou; a camada das bacias de visão (App)
 * fica desligada.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { browserStorage } from '../../src/utils/browserStorage.js'
import {
  EQUIPMENT_KEY,
  defaultEquipment,
  loadEquipment,
  saveEquipment,
  updateAircraftEquipment,
} from '../../src/mission/equipment.js'

/** localStorage em memória: só texto, null para o que não existe. */
function memoryStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v))
    },
  }
}

/** Um window cujo localStorage lança ao ser lido, como no modo privado. */
const blockedWindow = () => ({
  get localStorage() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('localStorage do browser', () => {
  test('fora do browser (sem window): null, sem lançar', () => {
    expect(typeof window).toBe('undefined')
    expect(browserStorage()).toBeNull()
  })

  test('com o localStorage disponível, o próprio', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    expect(browserStorage()).toBe(storage)
  })

  test('modo privado ou cookies bloqueados: o acesso lança e fica null', () => {
    vi.stubGlobal('window', blockedWindow())
    expect(browserStorage()).toBeNull()
    // a camada das bacias de visão lê assim a escolha guardada: desligada
    expect(browserStorage()?.getItem('qualquer') === '1').toBe(false)
  })
})

describe('o equipamento com e sem armazenamento', () => {
  test('sem armazenamento: os valores por omissão, e gravar devolve false', () => {
    vi.stubGlobal('window', blockedWindow())
    expect(loadEquipment(browserStorage())).toEqual(defaultEquipment())
    expect(saveEquipment(browserStorage(), defaultEquipment())).toBe(false)
  })

  test('com armazenamento: o que se grava volta igual na abertura seguinte', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    const eq = updateAircraftEquipment(defaultEquipment(), 'M3E', { vlosM: 800 })
    expect(saveEquipment(browserStorage(), eq)).toBe(true)
    expect(JSON.parse(storage.getItem(EQUIPMENT_KEY)).aircraft.M3E.vlosM).toBe(800)
    expect(loadEquipment(browserStorage())).toEqual(eq)
  })

  test('quota cheia: gravar devolve false e o que lá estava fica', () => {
    const storage = memoryStorage()
    const antes = updateAircraftEquipment(defaultEquipment(), 'M3E', { vlosM: 650 })
    saveEquipment(storage, antes)
    vi.stubGlobal('window', {
      localStorage: {
        getItem: storage.getItem,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError')
        },
      },
    })
    const depois = updateAircraftEquipment(antes, 'M3E', { vlosM: 900 })
    expect(saveEquipment(browserStorage(), depois)).toBe(false)
    expect(loadEquipment(browserStorage()).aircraft.M3E.vlosM).toBe(650)
  })
})
