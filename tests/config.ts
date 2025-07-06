import {z} from 'zod'
import Sdk from '@1inch/cross-chain-sdk'
import * as process from 'node:process'
import { resolve } from 'node:path'

const bool = z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .pipe(z.boolean())

const ConfigSchema = z.object({
    SRC_CHAIN_RPC: z.string().url(),
    DST_CHAIN_RPC: z.string().url(),
    SRC_CHAIN_CREATE_FORK: bool.default('false'),
    DST_CHAIN_CREATE_FORK: bool.default('false')
})

const fromEnv = ConfigSchema.parse(process.env)

export const config = {
    chain: {
        source: {
            chainId: Sdk.NetworkEnum.ARBITRUM,
            url: fromEnv.SRC_CHAIN_RPC,
            createFork: false,
            limitOrderProtocol: '0x111111125421cA6dc452d289314280a0f8842A65',
            escrowFactory: '0xc45B404021e8c99637B22D3e97E0fc09Fd0459AF',
            resolver: '0xb4654ED26f3bcCc6869E7b94B6Ce5C4aB4F57651',
            wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            ownerPrivateKey: '22479eae812b91a8bab3f654c72c324bcd7b5d102a1d569fa5afaf33c4ecc435',
            tokens: {
                USDC: {
                    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                    donor: '0x1ed17B61CdFa0572e98FF006625258c63255544A'
                }
            }
        },
        destination: {
            chainId: 10143,
            url: fromEnv.DST_CHAIN_RPC,
            createFork: false,
            limitOrderProtocol: '',
            escrowFactory: '0x5e69765f2740850206Ca1eA3A21B319E4bB39ffc',
            resolver: '0x40d2a8d920709a60f22714ba45277e61b66eb1c8',
            wrappedNative: '0xA2a1D3778107f3Cff1FB393CaD2a4b3488C3E3a3',
            ownerPrivateKey: '22479eae812b91a8bab3f654c72c324bcd7b5d102a1d569fa5afaf33c4ecc435',
            tokens: {
                USDC: {
                    address: '0xA2a1D3778107f3Cff1FB393CaD2a4b3488C3E3a3',
                    donor: '0x1ed17B61CdFa0572e98FF006625258c63255544A'
                }
            }
        }
    }
} as const

export type ChainConfig = (typeof config.chain)['source' | 'destination']
