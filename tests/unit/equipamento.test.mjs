/**
 * Equipamento (Configuração > Equipamento): valores por omissão,
 * normalização, gravação no browser, ficheiro JSON e consultas.
 */
import { describe, expect, test } from 'vitest'
import { AIRCRAFT } from '../../src/data/drones.js'
import {
  EQUIPMENT_KEY,
  EQUIPMENT_KIND,
  EQUIPMENT_LIMITS,
  EQUIPMENT_VERSION,
  addBattery,
  batteryFor,
  defaultAircraftEquipment,
  defaultEquipment,
  equipmentFromJson,
  equipmentToJson,
  flightsVsSets,
  followBatteryIfEqual,
  legacyUsefulMin,
  loadEquipment,
  normalizeEquipment,
  removeBattery,
  resolveMissionBattery,
  saveEquipment,
  setDefaultBattery,
  updateAircraftEquipment,
  updateBattery,
  usefulMinFor,
  vlosFor,
} from '../../src/mission/equipment.js'

/** Storage em memória com a interface getItem/setItem. */
function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
  }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('equipamento: valores por omissao', () => {
  const eq = defaultEquipment()

  test('tem versao, zona de descolagem e todas as aeronaves do catalogo', () => {
    expect(eq.version).toBe(EQUIPMENT_VERSION)
    expect(eq.zoneRadiusM).toBe(100)
    expect(eq.zoneMaxReliefM).toBe(10)
    expect(Object.keys(eq.aircraft).sort()).toEqual(Object.keys(AIRCRAFT).sort())
  })

  test('M300 RTK: TB60 25 min e TB65 28 min, medidos, TB60 por omissao', () => {
    const m300 = eq.aircraft.M300RTK
    expect(m300.batteries).toEqual([
      { id: 'TB60', label: 'TB60', usefulMin: 25, count: null, estimated: false },
      { id: 'TB65', label: 'TB65', usefulMin: 28, count: null, estimated: false },
    ])
    expect(m300.defaultBatteryId).toBe('TB60')
  })

  test('VLOS por aeronave', () => {
    expect(eq.aircraft.M300RTK.vlosM).toBe(1000)
    expect(eq.aircraft.M3E.vlosM).toBe(500)
    expect(eq.aircraft.M4T.vlosM).toBe(500)
    expect(eq.aircraft.CUSTOM.vlosM).toBe(500)
  })

  test('restantes aeronaves com uma bateria estimada', () => {
    for (const [id, min] of [
      ['M3E', 30],
      ['M4T', 32],
      ['CUSTOM', 18],
    ]) {
      const a = eq.aircraft[id]
      expect(a.batteries).toHaveLength(1)
      expect(a.batteries[0]).toMatchObject({ usefulMin: min, count: null, estimated: true })
      expect(a.batteries[0].label).toBe('Bateria padrão')
      expect(a.defaultBatteryId).toBe(a.batteries[0].id)
    }
  })

  test('aeronave nova no catalogo recebe valores genericos', () => {
    const a = defaultAircraftEquipment({ id: 'NOVA', batteryMin: 40 })
    expect(a.vlosM).toBe(500)
    expect(a.batteries).toEqual([
      { id: 'padrao', label: 'Bateria padrão', usefulMin: 24, count: null, estimated: true },
    ])
    expect(a.defaultBatteryId).toBe('padrao')
    // sem duração nominal válida continua a dar uma bateria utilizável
    expect(defaultAircraftEquipment({ id: 'X' }).batteries[0].usefulMin).toBeGreaterThan(0)
  })

  test('cada chamada devolve objectos novos', () => {
    const a = defaultEquipment()
    a.aircraft.M300RTK.batteries[0].usefulMin = 1
    expect(defaultEquipment().aircraft.M300RTK.batteries[0].usefulMin).toBe(25)
  })
})

describe('equipamento: normalizacao', () => {
  test('lixo devolve os valores por omissao sem lancar', () => {
    const def = defaultEquipment()
    for (const raw of [null, undefined, [], 'texto', 42, NaN, true, { aircraft: 'x' }]) {
      expect(normalizeEquipment(raw)).toEqual(def)
    }
  })

  test('entrada parcial preenche o que falta', () => {
    const eq = normalizeEquipment({ zoneRadiusM: 150, aircraft: { M3E: { vlosM: 400 } } })
    expect(eq.zoneRadiusM).toBe(150)
    expect(eq.zoneMaxReliefM).toBe(10)
    expect(eq.aircraft.M3E.vlosM).toBe(400)
    expect(eq.aircraft.M3E.batteries[0].usefulMin).toBe(30)
    expect(eq.aircraft.M300RTK).toEqual(defaultEquipment().aircraft.M300RTK)
  })

  test('descarta aeronaves desconhecidas', () => {
    const eq = normalizeEquipment({ aircraft: { PHANTOM: { vlosM: 300 }, M4T: { vlosM: 600 } } })
    expect(eq.aircraft.PHANTOM).toBeUndefined()
    expect(eq.aircraft.M4T.vlosM).toBe(600)
  })

  test('limita os numeros aos intervalos', () => {
    const eq = normalizeEquipment({
      zoneRadiusM: 9999,
      zoneMaxReliefM: 0,
      aircraft: {
        M3E: { vlosM: 10, batteries: [{ id: 'a', label: 'A', usefulMin: 500, count: 5000 }] },
        M4T: { vlosM: 1e6, batteries: [{ id: 'b', label: 'B', usefulMin: -3, count: -2 }] },
      },
    })
    expect(eq.zoneRadiusM).toBe(500)
    expect(eq.zoneMaxReliefM).toBe(1)
    expect(eq.aircraft.M3E.vlosM).toBe(50)
    expect(eq.aircraft.M4T.vlosM).toBe(5000)
    expect(eq.aircraft.M3E.batteries[0]).toMatchObject({ usefulMin: 120, count: 999 })
    expect(eq.aircraft.M4T.batteries[0]).toMatchObject({ usefulMin: 1, count: 0 })
    expect(normalizeEquipment({ zoneRadiusM: -5 }).zoneRadiusM).toBe(0)
    expect(normalizeEquipment({ zoneMaxReliefM: 500 }).zoneMaxReliefM).toBe(100)
  })

  test('valores nao numericos voltam ao valor por omissao; count invalido fica null', () => {
    const eq = normalizeEquipment({
      zoneRadiusM: 'abc',
      zoneMaxReliefM: NaN,
      aircraft: {
        M300RTK: {
          vlosM: null,
          batteries: [{ id: 'TB65', usefulMin: 'x', count: 'muitos' }],
        },
      },
    })
    expect(eq.zoneRadiusM).toBe(100)
    expect(eq.zoneMaxReliefM).toBe(10)
    expect(eq.aircraft.M300RTK.vlosM).toBe(1000)
    expect(eq.aircraft.M300RTK.batteries).toEqual([
      { id: 'TB65', label: 'TB65', usefulMin: 28, count: null, estimated: false },
    ])
  })

  test('count arredonda a inteiro e aceita texto numerico', () => {
    const eq = normalizeEquipment({
      aircraft: { M3E: { batteries: [{ id: 'p', label: 'P', usefulMin: '27', count: '6.4' }] } },
    })
    expect(eq.aircraft.M3E.batteries[0]).toMatchObject({ usefulMin: 27, count: 6 })
  })

  test('ids de bateria unicos e nomes aparados e nao vazios', () => {
    const eq = normalizeEquipment({
      aircraft: {
        M300RTK: {
          batteries: [
            { id: 'TB60', label: '  TB60 nova  ', usefulMin: 24 },
            { id: 'TB60', label: '   ', usefulMin: 23 },
            { label: 'Emprestada', usefulMin: 20 },
            { usefulMin: 19 },
            'lixo',
            null,
          ],
          defaultBatteryId: 'inexistente',
        },
      },
    })
    const bats = eq.aircraft.M300RTK.batteries
    expect(bats.map((b) => b.id)).toEqual(['TB60', 'TB60-2', 'Emprestada', 'bateria-4'])
    expect(new Set(bats.map((b) => b.id)).size).toBe(bats.length)
    expect(bats[0].label).toBe('TB60 nova')
    expect(bats[1].label).toBe('TB60')
    for (const b of bats) expect(b.label.length).toBeGreaterThan(0)
    expect(eq.aircraft.M300RTK.defaultBatteryId).toBe('TB60')
  })

  test('defaultBatteryId invalido cai na primeira bateria quando a omissao nao existe', () => {
    const eq = normalizeEquipment({
      aircraft: {
        M300RTK: {
          batteries: [{ id: 'X1', label: 'X1', usefulMin: 20 }],
          defaultBatteryId: 'TB65',
        },
      },
    })
    expect(eq.aircraft.M300RTK.defaultBatteryId).toBe('X1')
  })

  test('defaultBatteryId valido e mantido', () => {
    const eq = normalizeEquipment({ aircraft: { M300RTK: { defaultBatteryId: 'TB65' } } })
    expect(eq.aircraft.M300RTK.defaultBatteryId).toBe('TB65')
  })

  test('lista de baterias vazia ou invalida volta as baterias por omissao', () => {
    for (const batteries of [[], [null, 3], 'x']) {
      const eq = normalizeEquipment({ aircraft: { M300RTK: { batteries } } })
      expect(eq.aircraft.M300RTK.batteries).toEqual(defaultEquipment().aircraft.M300RTK.batteries)
    }
  })

  test('estimated: preserva o booleano, herda do preset ou fica false', () => {
    const eq = normalizeEquipment({
      aircraft: {
        M3E: {
          batteries: [
            { id: 'padrao', usefulMin: 29 },
            { id: 'nova', label: 'Nova', usefulMin: 31 },
            { id: 'medida', label: 'Medida', usefulMin: 31, estimated: true },
          ],
        },
      },
    })
    expect(eq.aircraft.M3E.batteries.map((b) => b.estimated)).toEqual([true, false, true])
  })

  test('normalizar duas vezes da o mesmo resultado', () => {
    const once = normalizeEquipment({
      aircraft: { M300RTK: { batteries: [{ id: 'a' }, { id: 'a' }], vlosM: 30 } },
    })
    expect(normalizeEquipment(once)).toEqual(once)
  })
})

describe('equipamento: gravar e ler no browser', () => {
  test('ida e volta com storage em memoria', () => {
    const st = fakeStorage()
    const eq = defaultEquipment()
    eq.aircraft.M300RTK.batteries[1].count = 6
    eq.zoneRadiusM = 80
    expect(saveEquipment(st, eq)).toBe(true)
    expect(typeof st.data[EQUIPMENT_KEY]).toBe('string')
    expect(loadEquipment(st)).toEqual(eq)
  })

  test('storage vazio, nulo ou corrompido devolve valores por omissao', () => {
    expect(loadEquipment(fakeStorage())).toEqual(defaultEquipment())
    expect(loadEquipment(null)).toEqual(defaultEquipment())
    expect(loadEquipment(undefined)).toEqual(defaultEquipment())
    expect(loadEquipment(fakeStorage({ [EQUIPMENT_KEY]: '{nao json' }))).toEqual(defaultEquipment())
    expect(loadEquipment(fakeStorage({ [EQUIPMENT_KEY]: '[1,2]' }))).toEqual(defaultEquipment())
  })

  test('storage que lanca (modo privado) nao rebenta', () => {
    expect(loadEquipment(throwingStorage)).toEqual(defaultEquipment())
    expect(saveEquipment(throwingStorage, defaultEquipment())).toBe(false)
    expect(saveEquipment(null, defaultEquipment())).toBe(false)
  })

  test('grava sempre normalizado', () => {
    const st = fakeStorage()
    saveEquipment(st, { zoneRadiusM: 9999 })
    const stored = JSON.parse(st.data[EQUIPMENT_KEY])
    expect(stored.zoneRadiusM).toBe(500)
    expect(stored.aircraft.M300RTK).toBeDefined()
  })
})

describe('equipamento: ficheiro JSON', () => {
  test('ida e volta', () => {
    const eq = defaultEquipment()
    eq.aircraft.M3E.vlosM = 450
    eq.aircraft.M3E.batteries[0].count = 4
    const text = equipmentToJson(eq)
    expect(text).toContain('\n  ')
    expect(JSON.parse(text).kind).toBe(EQUIPMENT_KIND)
    expect(equipmentFromJson(text)).toEqual(eq)
  })

  test('rejeita texto que nao e JSON', () => {
    expect(() => equipmentFromJson('isto nao e json')).toThrow(/não é JSON/)
  })

  test('rejeita kind errado ou ausente', () => {
    const eq = defaultEquipment()
    expect(() => equipmentFromJson(JSON.stringify(eq))).toThrow(/configuração de equipamento/)
    expect(() => equipmentFromJson(JSON.stringify({ ...eq, kind: 'outro' }))).toThrow(
      /configuração de equipamento/,
    )
    expect(() => equipmentFromJson('null')).toThrow(/configuração de equipamento/)
    expect(() => equipmentFromJson('[]')).toThrow(/configuração de equipamento/)
  })

  test('ficheiro valido mas incompleto sai normalizado', () => {
    const eq = equipmentFromJson(JSON.stringify({ kind: EQUIPMENT_KIND, zoneRadiusM: 50 }))
    expect(eq.zoneRadiusM).toBe(50)
    expect(eq.aircraft.M300RTK.vlosM).toBe(1000)
    expect(eq).not.toHaveProperty('kind')
  })
})

describe('equipamento: consultas', () => {
  const eq = defaultEquipment()

  test('batteryFor devolve a pedida ou a por omissao', () => {
    expect(batteryFor(eq, 'M300RTK', 'TB65').id).toBe('TB65')
    expect(batteryFor(eq, 'M300RTK').id).toBe('TB60')
    expect(batteryFor(eq, 'M300RTK', null).id).toBe('TB60')
    expect(batteryFor(eq, 'M300RTK', 'TB99').id).toBe('TB60')
  })

  test('batteryFor sem equipamento ou aeronave fora do catalogo', () => {
    expect(batteryFor(null, 'M300RTK').usefulMin).toBe(25)
    expect(batteryFor({}, 'M3E').usefulMin).toBe(30)
    const b = batteryFor(eq, 'DESCONHECIDA')
    expect(b.usefulMin).toBeGreaterThan(0)
    expect(b.estimated).toBe(true)
  })

  test('batteryFor com defaultBatteryId errado cai na primeira', () => {
    const bad = {
      aircraft: {
        M3E: { vlosM: 500, batteries: [{ id: 'z', usefulMin: 22 }], defaultBatteryId: 'nada' },
      },
    }
    expect(batteryFor(/** @type {any} */ (bad), 'M3E').id).toBe('z')
  })

  test('usefulMinFor e vlosFor', () => {
    expect(usefulMinFor(eq, 'M300RTK', 'TB65')).toBe(28)
    expect(usefulMinFor(eq, 'M300RTK')).toBe(25)
    expect(usefulMinFor(eq, 'M4T')).toBe(32)
    expect(vlosFor(eq, 'M300RTK')).toBe(1000)
    expect(vlosFor(eq, 'M3E')).toBe(500)
    expect(vlosFor(null, 'M300RTK')).toBe(1000)
    expect(vlosFor(eq, 'DESCONHECIDA')).toBe(500)
  })
})

describe('equipamento: migracao de projectos antigos', () => {
  test('nominal menos reserva, arredondado ao meio minuto', () => {
    expect(legacyUsefulMin(55, 30)).toBe(38.5)
    expect(legacyUsefulMin(45, 30)).toBe(31.5)
    expect(legacyUsefulMin(49, 20)).toBe(39) // 39.2
    expect(legacyUsefulMin(25, 0)).toBe(25)
    expect(legacyUsefulMin(28, 15)).toBe(24) // 23.8
  })

  test('reserva por omissao 30 % e limitada a 0-95 %', () => {
    expect(legacyUsefulMin(40)).toBe(28)
    expect(legacyUsefulMin(40, -10)).toBe(40)
    expect(legacyUsefulMin(40, 200)).toBe(2)
    expect(legacyUsefulMin(40, NaN)).toBe(28)
  })

  test('duracao invalida devolve null', () => {
    for (const v of [0, -5, NaN, null, undefined, 'x']) expect(legacyUsefulMin(v, 30)).toBeNull()
  })
})

describe('equipamento: voos contra conjuntos de baterias', () => {
  test('contagem desconhecida: sets null e nunca falta', () => {
    expect(flightsVsSets(defaultEquipment(), 'M300RTK', 'TB60', 9)).toEqual({
      flights: 9,
      sets: null,
      short: false,
    })
  })

  test('mais voos que conjuntos: short', () => {
    const eq = defaultEquipment()
    eq.aircraft.M300RTK.batteries[0].count = 6
    eq.aircraft.M300RTK.batteries[1].count = 12
    expect(flightsVsSets(eq, 'M300RTK', 'TB60', 9)).toEqual({ flights: 9, sets: 6, short: true })
    expect(flightsVsSets(eq, 'M300RTK', 'TB65', 9)).toEqual({ flights: 9, sets: 12, short: false })
    expect(flightsVsSets(eq, 'M300RTK', 'TB60', 6).short).toBe(false)
    // id em falta usa a bateria por omissão (TB60)
    expect(flightsVsSets(eq, 'M300RTK', undefined, 7).sets).toBe(6)
  })

  test('voos invalidos ou fraccionarios', () => {
    const eq = defaultEquipment()
    eq.aircraft.M3E.batteries[0].count = 0
    expect(flightsVsSets(eq, 'M3E', null, NaN)).toEqual({ flights: 0, sets: 0, short: false })
    expect(flightsVsSets(eq, 'M3E', null, 1.2)).toEqual({ flights: 2, sets: 0, short: true })
    expect(flightsVsSets(eq, 'M3E', null, -3).flights).toBe(0)
  })
})

describe('edição (janela Configuração)', () => {
  test('limites expostos para a interface', () => {
    expect(EQUIPMENT_LIMITS.usefulMin).toEqual({ min: 1, max: 120 })
    expect(EQUIPMENT_LIMITS.vlosM.min).toBe(50)
  })

  test('alterar o VLOS e uma bateria não toca nas outras aeronaves nem no original', () => {
    const eq = defaultEquipment()
    const a = updateAircraftEquipment(eq, 'M300RTK', { vlosM: 800 })
    expect(a.aircraft.M300RTK.vlosM).toBe(800)
    expect(eq.aircraft.M300RTK.vlosM).toBe(1000)
    expect(a.aircraft.M3E).toBe(eq.aircraft.M3E)
    const b = updateBattery(a, 'M300RTK', 'TB65', { usefulMin: 30, count: 4, id: 'outro' })
    expect(batteryFor(b, 'M300RTK', 'TB65')).toMatchObject({ id: 'TB65', usefulMin: 30, count: 4 })
    expect(batteryFor(b, 'M300RTK', 'TB60').usefulMin).toBe(25)
    // id desconhecido: nada muda
    expect(
      updateBattery(b, 'M300RTK', 'TB99', { usefulMin: 1 }).aircraft.M300RTK.batteries,
    ).toEqual(b.aircraft.M300RTK.batteries)
  })

  test('acrescentar: id novo e único, tempo da bateria por omissão, não estimado', () => {
    const eq = defaultEquipment()
    const r1 = addBattery(eq, 'M300RTK', '  TB60 velhas ')
    expect(r1.batteryId).toBe('bateria-3')
    const nova = batteryFor(r1.equipment, 'M300RTK', 'bateria-3')
    expect(nova).toEqual({
      id: 'bateria-3',
      label: 'TB60 velhas',
      usefulMin: 25,
      count: null,
      estimated: false,
    })
    const r2 = addBattery(r1.equipment, 'M300RTK', '')
    expect(r2.batteryId).toBe('bateria-4')
    expect(batteryFor(r2.equipment, 'M300RTK', 'bateria-4').label).toBe('bateria-4')
    // a normalização mantém-no
    expect(normalizeEquipment(r2.equipment).aircraft.M300RTK.batteries).toHaveLength(4)
  })

  test('retirar: fica sempre uma; retirada a por omissão, passa a primeira', () => {
    const eq = defaultEquipment()
    const a = removeBattery(eq, 'M300RTK', 'TB60')
    expect(a.aircraft.M300RTK.batteries.map((b) => b.id)).toEqual(['TB65'])
    expect(a.aircraft.M300RTK.defaultBatteryId).toBe('TB65')
    expect(removeBattery(a, 'M300RTK', 'TB65')).toBe(a)
    expect(removeBattery(eq, 'M300RTK', 'nada')).toBe(eq)
    const b = removeBattery(eq, 'M300RTK', 'TB65')
    expect(b.aircraft.M300RTK.defaultBatteryId).toBe('TB60')
  })

  test('bateria por omissão: só ids existentes', () => {
    const eq = defaultEquipment()
    expect(setDefaultBattery(eq, 'M300RTK', 'TB65').aircraft.M300RTK.defaultBatteryId).toBe('TB65')
    expect(setDefaultBattery(eq, 'M300RTK', 'x')).toBe(eq)
  })
})

describe('bateria da missão', () => {
  test('sem escolha: a bateria por omissão e o tempo útil dela', () => {
    const eq = defaultEquipment()
    expect(resolveMissionBattery(eq, 'M300RTK', null)).toMatchObject({
      battery: { id: 'TB60' },
      usefulMin: 25,
      overridden: false,
    })
  })

  test('tipo escolhido segue a configuração; acerto do dia sobrepõe-se', () => {
    let eq = defaultEquipment()
    const choice = { aircraftId: 'M300RTK', batteryId: 'TB65', usefulMin: null }
    expect(resolveMissionBattery(eq, 'M300RTK', choice).usefulMin).toBe(28)
    eq = updateBattery(eq, 'M300RTK', 'TB65', { usefulMin: 30 })
    expect(resolveMissionBattery(eq, 'M300RTK', choice).usefulMin).toBe(30)
    const dia = resolveMissionBattery(eq, 'M300RTK', { ...choice, usefulMin: 26 })
    expect(dia).toMatchObject({ usefulMin: 26, overridden: true })
    // igual ao da bateria não conta como acerto
    expect(resolveMissionBattery(eq, 'M300RTK', { ...choice, usefulMin: 30 }).overridden).toBe(
      false,
    )
    // limites do equipamento
    expect(resolveMissionBattery(eq, 'M300RTK', { ...choice, usefulMin: 999 }).usefulMin).toBe(120)
  })

  test('a escolha só vale para a aeronave em que foi feita; bateria retirada cai na por omissão', () => {
    const eq = defaultEquipment()
    const choice = { aircraftId: 'M300RTK', batteryId: 'TB65', usefulMin: 20 }
    expect(resolveMissionBattery(eq, 'M3E', choice)).toMatchObject({
      battery: { id: 'padrao' },
      usefulMin: 30,
      overridden: false,
    })
    const sem = removeBattery(eq, 'M300RTK', 'TB65')
    expect(resolveMissionBattery(sem, 'M300RTK', { ...choice, usefulMin: null }).battery.id).toBe(
      'TB60',
    )
  })

  test('followBatteryIfEqual: igual ao equipamento segue-o, diferente fica', () => {
    const eq = defaultEquipment()
    expect(
      followBatteryIfEqual(eq, { aircraftId: 'M300RTK', batteryId: 'TB60', usefulMin: 25 }),
    ).toEqual({ aircraftId: 'M300RTK', batteryId: 'TB60', usefulMin: null })
    expect(
      followBatteryIfEqual(eq, { aircraftId: 'M300RTK', batteryId: null, usefulMin: 22 }).usefulMin,
    ).toBe(22)
    expect(followBatteryIfEqual(eq, null)).toBeNull()
  })
})
