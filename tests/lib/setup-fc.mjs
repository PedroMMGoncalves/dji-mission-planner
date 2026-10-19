/**
 * Semente fixa do fast-check no portão (M3-T7): o mesmo `npm run test:unit`
 * falhou no CI e passou no deploy um minuto depois, com outra semente. Com
 * FC_SEED (o job nocturno usa uma aleatória) explora-se; cada
 * contra-exemplo encontrado passa a teste fixo. FC_NUM_RUNS multiplica as
 * corridas de cada propriedade.
 */
import fc from 'fast-check'

const seed = Number(process.env.FC_SEED ?? 20261019)
fc.configureGlobal({ seed: Number.isFinite(seed) ? seed : 20261019 })
console.info(`[fast-check] semente ${fc.readConfigureGlobal().seed}`)
