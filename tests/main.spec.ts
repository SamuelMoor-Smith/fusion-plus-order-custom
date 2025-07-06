import 'dotenv/config'
import {afterAll, beforeAll, describe, expect, it, jest} from '@jest/globals'

import {createServer, CreateServerReturnType} from 'prool'
// import {anvil} from 'prool/instances'

import Sdk, { HashLock } from '@1inch/cross-chain-sdk'
import {
    computeAddress,
    ContractFactory,
    JsonRpcProvider,
    MaxUint256,
    parseEther,
    parseUnits,
    randomBytes,
    Wallet as SignerWallet
} from 'ethers'
import {uint8ArrayToHex, UINT_40_MAX} from '@1inch/byte-utils'
import assert from 'node:assert'
import {ChainConfig, config} from './config'
import {Wallet} from './wallet'
import {Resolver} from './resolver'
import {EscrowFactory} from './escrow-factory'
import factoryContract from '../dist/contracts/TestEscrowFactory.sol/TestEscrowFactory.json'
import resolverContract from '../dist/contracts/Resolver.sol/Resolver.json'
import { NetworkEnum } from '@1inch/fusion-sdk';

const {Address} = Sdk

// jest.setTimeout(1000 * 60)
jest.setTimeout(1000 * 90) 

const userPk = '22479eae812b91a8bab3f654c72c324bcd7b5d102a1d569fa5afaf33c4ecc435'
const resolverPk = '22479eae812b91a8bab3f654c72c324bcd7b5d102a1d569fa5afaf33c4ecc435'

// eslint-disable-next-line max-lines-per-function
describe('Resolving example', () => {
    const srcChainId = config.chain.source.chainId
    const dstChainId = config.chain.destination.chainId

    type Chain = {
        node?: CreateServerReturnType | undefined
        provider: JsonRpcProvider
        escrowFactory: string
        resolver: string
    }

    let src: Chain
    let dst: Chain

    let srcChainUser: Wallet
    let dstChainUser: Wallet
    let srcChainResolver: Wallet
    let dstChainResolver: Wallet

    let srcFactory: EscrowFactory
    let dstFactory: EscrowFactory
    let srcResolverContract: Wallet
    let dstResolverContract: Wallet

    let srcTimestamp: bigint

    // async function increaseTime(t: number): Promise<void> {
    //     await Promise.all([src, dst].map((chain) => chain.provider.send('evm_increaseTime', [t])))
    // }

    beforeAll(async () => {
        ;[src, dst] = await Promise.all([initChain(config.chain.source), initChain(config.chain.destination)])

        srcChainUser = new Wallet(userPk, src.provider)
        dstChainUser = new Wallet(userPk, dst.provider)
        srcChainResolver = new Wallet(resolverPk, src.provider)
        dstChainResolver = new Wallet(resolverPk, dst.provider)

        srcFactory = new EscrowFactory(src.provider, src.escrowFactory)
        dstFactory = new EscrowFactory(dst.provider, dst.escrowFactory)
        // get 1000 USDC for user in SRC chain and approve to LOP
        // await srcChainUser.topUpFromDonor(
        //     config.chain.source.tokens.USDC.address,
        //     config.chain.source.tokens.USDC.donor,
        //     parseUnits('1000', 6)
        // )
        // Ensure test accounts are pre-funded on testnets
        const srcUserBalance = await srcChainUser.tokenBalance(config.chain.source.tokens.USDC.address)
        // const dstUserBalance = await srcChainUser.tokenBalance(config.chain.destination.tokens.USDC.address)
        console.log(`Source user USDC balance: ${srcUserBalance.toString()}`)
        // console.log(`Dest user USDC balance: ${dstUserBalance.toString()}`)
        if (srcUserBalance < 10) {
            throw new Error('User does not have enough USDC on source chain. Please fund manually.')
        }
        await srcChainUser.approveToken(
            config.chain.source.tokens.USDC.address,
            config.chain.source.limitOrderProtocol,
            MaxUint256
        )

        // get 2000 USDC for resolver in DST chain
        srcResolverContract = new Wallet(resolverPk, src.provider) // await Wallet.fromAddress(src.resolver, src.provider)
        dstResolverContract = new Wallet(resolverPk, dst.provider) // await Wallet.fromAddress(dst.resolver, dst.provider)
        // await dstResolverContract.topUpFromDonor(
        //     config.chain.destination.tokens.USDC.address,
        //     config.chain.destination.tokens.USDC.donor,
        //     parseUnits('2000', 6)
        // )
        // top up contract for approve
        // await dstChainResolver.transfer(dst.resolver, parseEther("0.000000001"))
        console.log("Destination chain id", dstChainId)
        await dstResolverContract.unlimitedApprove(config.chain.destination.tokens.USDC.address, dst.escrowFactory)

        srcTimestamp = BigInt((await src.provider.getBlock('latest'))!.timestamp)
    })

    async function getBalances(
        srcToken: string,
        dstToken: string
    ): Promise<{src: {user: bigint; resolver: bigint}; dst: {user: bigint; resolver: bigint}}> {
        return {
            src: {
                user: await srcChainUser.tokenBalance(srcToken),
                resolver: await srcResolverContract.tokenBalance(srcToken)
            },
            dst: {
                user: await dstChainUser.tokenBalance(dstToken),
                resolver: await dstResolverContract.tokenBalance(dstToken)
            }
        }
    }

    // afterAll(async () => {
    //     src.provider.destroy()
    //     dst.provider.destroy()
    //     await Promise.all([src.node?.stop(), dst.node?.stop()])
    // })
    // no-op for public RPCs

    // eslint-disable-next-line max-lines-per-function
    describe('Fill', () => {
        it('should swap Ethereum USDC -> Bsc USDC. Single fill only', async () => {

            const initialBalances = await getBalances(
                config.chain.source.tokens.USDC.address,
                config.chain.destination.tokens.USDC.address
            )
            console.log('Initial balances:', initialBalances)

            // User creates order
            const secret = uint8ArrayToHex(randomBytes(32)) // note: use crypto secure random number in real world
            const order = Sdk.CrossChainOrder.new(
                new Address(src.escrowFactory),
                {
                    salt: Sdk.randBigInt(123456n),
                    maker: new Address("0x1ed17B61CdFa0572e98FF006625258c63255544A"),
                    makingAmount: BigInt(1e15), // 0.001 USDC
                    takingAmount: BigInt(500e18),
                    makerAsset: new Address("0xCE252C063B7C66417934C85c177AE61Bf0e9858a"),
                    takerAsset: new Address("0x61ed92A2Aa23B2E7da92adEA1209eC71f8098e42")
                },
                {
                    hashLock: Sdk.HashLock.forSingleFill(secret),
                    timeLocks: Sdk.TimeLocks.new({
                        srcWithdrawal: 100n, // 10sec finality lock for test
                        srcPublicWithdrawal: 1200n, // 2m for private withdrawal
                        srcCancellation: 1210n, // 1sec public withdrawal
                        srcPublicCancellation: 1220n, // 1sec private cancellation
                        dstWithdrawal: 100n, // 10sec finality lock for test
                        dstPublicWithdrawal: 1000n, // 100sec private withdrawal
                        dstCancellation: 1010n // 1sec public withdrawal
                    }),
                    srcChainId,
                    dstChainId,
                    srcSafetyDeposit: parseEther("0"),
                    dstSafetyDeposit: parseEther("0")
                },
                {
                    auction: new Sdk.AuctionDetails({
                        initialRateBump: 0,
                        points: [],
                        duration: 120n,
                        startTime: srcTimestamp
                    }),
                    whitelist: [
                        {
                            address: new Address(src.resolver),
                            allowFrom: 0n
                        },
                        {
                            address: new Address(await srcChainResolver.getAddress()),
                            allowFrom: 0n
                        },
                    ],
                    resolvingStartTime: 0n
                },
                {
                    nonce: Sdk.randBigInt(UINT_40_MAX),
                    allowPartialFills: false,
                    allowMultipleFills: false
                }
            )

            console.log(secret, Sdk.HashLock.forSingleFill(secret))

            const signature = await srcChainUser.signOrder(srcChainId, order)
            const orderHash = order.getOrderHash(srcChainId)
            
            // Resolver fills order
            const resolverContract = new Resolver(src.resolver, dst.resolver)
            // const {txHash: orderFillHash, blockHash: srcDeployBlock} = await srcChainResolver.send(
            //     resolverContract.ping()
            // )

            // const pong = await resolverContract.ping()
            
            console.log(`[${srcChainId}]`, `Filling order ${orderHash}`)

            const balance = await src.provider.getBalance(await srcChainResolver.getAddress())
            console.log('ETH balance of resolver:', balance.toString())

            // const code = await src.provider.getCode(src.resolver)
            // console.log('Code at escrow address:', code)

            const fillAmount = order.makingAmount
            const {txHash: orderFillHash, blockHash: srcDeployBlock} = await srcChainResolver.send(
                resolverContract.deploySrc(
                    srcChainId,
                    order,
                    signature,
                    Sdk.TakerTraits.default()
                        .setExtension(order.extension)
                        .setAmountMode(Sdk.AmountMode.maker)
                        .setAmountThreshold(order.takingAmount),
                    fillAmount
                )
            )

            console.log(`[${srcChainId}]`, `Order ${orderHash} filled for ${fillAmount} in tx ${orderFillHash}`)

            // const srcEscrowEvent = await srcFactory.getSrcDeployEvent(srcDeployBlock)

            // const dstImmutables = srcEscrowEvent[0]
            //     .withComplement(srcEscrowEvent[1])
            //     .withTaker(new Address(resolverContract.dstAddress))

            // console.log(`[${dstChainId}]`, `Depositing ${dstImmutables.amount} for order ${orderHash}`)
            // const {txHash: dstDepositHash, blockTimestamp: dstDeployedAt} = await dstChainResolver.send(
            //     resolverContract.deployDst(dstImmutables)
            // )
            // console.log(`[${dstChainId}]`, `Created dst deposit for order ${orderHash} in tx ${dstDepositHash}`)

            // const ESCROW_SRC_IMPLEMENTATION = await srcFactory.getSourceImpl()
            // const ESCROW_DST_IMPLEMENTATION = await dstFactory.getDestinationImpl()

            // const srcEscrowAddress = new Sdk.EscrowFactory(new Address(src.escrowFactory)).getSrcEscrowAddress(
            //     srcEscrowEvent[0],
            //     ESCROW_SRC_IMPLEMENTATION
            // )

            // const dstEscrowAddress = new Sdk.EscrowFactory(new Address(dst.escrowFactory)).getDstEscrowAddress(
            //     srcEscrowEvent[0],
            //     srcEscrowEvent[1],
            //     dstDeployedAt,
            //     new Address(resolverContract.dstAddress),
            //     ESCROW_DST_IMPLEMENTATION
            // )

            // // await increaseTime(11)
            // // User shares key after validation of dst escrow deployment
            // console.log(`[${dstChainId}]`, `Withdrawing funds for user from ${dstEscrowAddress}`)
            // await dstChainResolver.send(
            //     resolverContract.withdraw('dst', dstEscrowAddress, secret, dstImmutables.withDeployedAt(dstDeployedAt))
            // )

            // console.log(`[${srcChainId}]`, `Withdrawing funds for resolver from ${srcEscrowAddress}`)
            // const {txHash: resolverWithdrawHash} = await srcChainResolver.send(
            //     resolverContract.withdraw('src', srcEscrowAddress, secret, srcEscrowEvent[0])
            // )
            // console.log(
            //     `[${srcChainId}]`,
            //     `Withdrew funds for resolver from ${srcEscrowAddress} to ${src.resolver} in tx ${resolverWithdrawHash}`
            // )

            // const resultBalances = await getBalances(
            //     config.chain.source.tokens.USDC.address,
            //     config.chain.destination.tokens.USDC.address
            // )

            // // user transferred funds to resolver on source chain
            // expect(initialBalances.src.user - resultBalances.src.user).toBe(order.makingAmount)
            // expect(resultBalances.src.resolver - initialBalances.src.resolver).toBe(order.makingAmount)
            // // resolver transferred funds to user on destination chain
            // expect(resultBalances.dst.user - initialBalances.dst.user).toBe(order.takingAmount)
            // expect(initialBalances.dst.resolver - resultBalances.dst.resolver).toBe(order.takingAmount)
        })
    })

    //     it('should swap Ethereum USDC -> Bsc USDC. Multiple fills. Fill 100%', async () => {
    //         const initialBalances = await getBalances(
    //             config.chain.source.tokens.USDC.address,
    //             config.chain.destination.tokens.USDC.address
    //         )

    //         // User creates order
    //         // 11 secrets
    //         const secrets = Array.from({length: 11}).map(() => uint8ArrayToHex(randomBytes(32))) // note: use crypto secure random number in the real world
    //         const secretHashes = secrets.map((s) => Sdk.HashLock.hashSecret(s))
    //         const leaves = Sdk.HashLock.getMerkleLeaves(secrets)
    //         const order = Sdk.CrossChainOrder.new(
    //             new Address(src.escrowFactory),
    //             {
    //                 salt: Sdk.randBigInt(1000n),
    //                 maker: new Address(await srcChainUser.getAddress()),
    //                 makingAmount: 1n,
    //                 takingAmount: 1n,
    //                 makerAsset: new Address(config.chain.source.tokens.USDC.address),
    //                 takerAsset: new Address(config.chain.destination.tokens.USDC.address)
    //             },
    //             {
    //                 hashLock: Sdk.HashLock.forMultipleFills(leaves),
    //                 timeLocks: Sdk.TimeLocks.new({
    //                     srcWithdrawal: 10n, // 10s finality lock for test
    //                     srcPublicWithdrawal: 120n, // 2m for private withdrawal
    //                     srcCancellation: 121n, // 1sec public withdrawal
    //                     srcPublicCancellation: 122n, // 1sec private cancellation
    //                     dstWithdrawal: 10n, // 10s finality lock for test
    //                     dstPublicWithdrawal: 100n, // 100sec private withdrawal
    //                     dstCancellation: 101n // 1sec public withdrawal
    //                 }),
    //                 srcChainId,
    //                 dstChainId,
    //                 srcSafetyDeposit: parseEther("0.000000001"),
    //                 dstSafetyDeposit: parseEther("0.000000001")
    //             },
    //             {
    //                 auction: new Sdk.AuctionDetails({
    //                     initialRateBump: 0,
    //                     points: [],
    //                     duration: 120n,
    //                     startTime: srcTimestamp
    //                 }),
    //                 whitelist: [
    //                     {
    //                         address: new Address(src.resolver),
    //                         allowFrom: 0n
    //                     }
    //                 ],
    //                 resolvingStartTime: 0n
    //             },
    //             {
    //                 nonce: Sdk.randBigInt(UINT_40_MAX),
    //                 allowPartialFills: true,
    //                 allowMultipleFills: true
    //             }
    //         )

    //         const signature = await srcChainUser.signOrder(srcChainId, order)
    //         const orderHash = order.getOrderHash(srcChainId)
    //         // Resolver fills order
    //         const resolverContract = new Resolver(src.resolver, dst.resolver)

    //         console.log(`[${srcChainId}]`, `Filling order ${orderHash}`)

    //         const fillAmount = order.makingAmount
    //         const idx = secrets.length - 1 // last index to fulfill
    //         // Number((BigInt(secrets.length - 1) * (fillAmount - 1n)) / order.makingAmount)

    //         const {txHash: orderFillHash, blockHash: srcDeployBlock} = await srcChainResolver.send(
    //             resolverContract.deploySrc(
    //                 srcChainId,
    //                 order,
    //                 signature,
    //                 Sdk.TakerTraits.default()
    //                     .setExtension(order.extension)
    //                     .setInteraction(
    //                         new Sdk.EscrowFactory(new Address(src.escrowFactory)).getMultipleFillInteraction(
    //                             Sdk.HashLock.getProof(leaves, idx),
    //                             idx,
    //                             secretHashes[idx]
    //                         )
    //                     )
    //                     .setAmountMode(Sdk.AmountMode.maker)
    //                     .setAmountThreshold(order.takingAmount),
    //                 fillAmount,
    //                 Sdk.HashLock.fromString(secretHashes[idx])
    //             )
    //         )

    //         console.log(`[${srcChainId}]`, `Order ${orderHash} filled for ${fillAmount} in tx ${orderFillHash}`)

    //         const srcEscrowEvent = await srcFactory.getSrcDeployEvent(srcDeployBlock)

    //         const dstImmutables = srcEscrowEvent[0]
    //             .withComplement(srcEscrowEvent[1])
    //             .withTaker(new Address(resolverContract.dstAddress))

    //         console.log(`[${dstChainId}]`, `Depositing ${dstImmutables.amount} for order ${orderHash}`)
    //         const {txHash: dstDepositHash, blockTimestamp: dstDeployedAt} = await dstChainResolver.send(
    //             resolverContract.deployDst(dstImmutables)
    //         )
    //         console.log(`[${dstChainId}]`, `Created dst deposit for order ${orderHash} in tx ${dstDepositHash}`)

    //         const secret = secrets[idx]

    //         const ESCROW_SRC_IMPLEMENTATION = await srcFactory.getSourceImpl()
    //         const ESCROW_DST_IMPLEMENTATION = await dstFactory.getDestinationImpl()

    //         const srcEscrowAddress = new Sdk.EscrowFactory(new Address(src.escrowFactory)).getSrcEscrowAddress(
    //             srcEscrowEvent[0],
    //             ESCROW_SRC_IMPLEMENTATION
    //         )

    //         const dstEscrowAddress = new Sdk.EscrowFactory(new Address(dst.escrowFactory)).getDstEscrowAddress(
    //             srcEscrowEvent[0],
    //             srcEscrowEvent[1],
    //             dstDeployedAt,
    //             new Address(resolverContract.dstAddress),
    //             ESCROW_DST_IMPLEMENTATION
    //         )

    //         // await increaseTime(11) // finality lock passed
    //         // User shares key after validation of dst escrow deployment
    //         console.log(`[${dstChainId}]`, `Withdrawing funds for user from ${dstEscrowAddress}`)
    //         await dstChainResolver.send(
    //             resolverContract.withdraw('dst', dstEscrowAddress, secret, dstImmutables.withDeployedAt(dstDeployedAt))
    //         )

    //         console.log(`[${srcChainId}]`, `Withdrawing funds for resolver from ${srcEscrowAddress}`)
    //         const {txHash: resolverWithdrawHash} = await srcChainResolver.send(
    //             resolverContract.withdraw('src', srcEscrowAddress, secret, srcEscrowEvent[0])
    //         )
    //         console.log(
    //             `[${srcChainId}]`,
    //             `Withdrew funds for resolver from ${srcEscrowAddress} to ${src.resolver} in tx ${resolverWithdrawHash}`
    //         )

    //         const resultBalances = await getBalances(
    //             config.chain.source.tokens.USDC.address,
    //             config.chain.destination.tokens.USDC.address
    //         )

    //         // user transferred funds to resolver on the source chain
    //         expect(initialBalances.src.user - resultBalances.src.user).toBe(order.makingAmount)
    //         expect(resultBalances.src.resolver - initialBalances.src.resolver).toBe(order.makingAmount)
    //         // resolver transferred funds to user on the destination chain
    //         expect(resultBalances.dst.user - initialBalances.dst.user).toBe(order.takingAmount)
    //         expect(initialBalances.dst.resolver - resultBalances.dst.resolver).toBe(order.takingAmount)
    //     })

    //     it('should swap Ethereum USDC -> Bsc USDC. Multiple fills. Fill 50%', async () => {
    //         const initialBalances = await getBalances(
    //             config.chain.source.tokens.USDC.address,
    //             config.chain.destination.tokens.USDC.address
    //         )

    //         // User creates order
    //         // 11 secrets
    //         const secrets = Array.from({length: 11}).map(() => uint8ArrayToHex(randomBytes(32))) // note: use crypto secure random number in the real world
    //         const secretHashes = secrets.map((s) => Sdk.HashLock.hashSecret(s))
    //         const leaves = Sdk.HashLock.getMerkleLeaves(secrets)
    //         const order = Sdk.CrossChainOrder.new(
    //             new Address(src.escrowFactory),
    //             {
    //                 salt: Sdk.randBigInt(1000n),
    //                 maker: new Address(await srcChainUser.getAddress()),
    //                 makingAmount: 1n,
    //                 takingAmount: 1n,
    //                 makerAsset: new Address(config.chain.source.tokens.USDC.address),
    //                 takerAsset: new Address(config.chain.destination.tokens.USDC.address)
    //             },
    //             {
    //                 hashLock: Sdk.HashLock.forMultipleFills(leaves),
    //                 timeLocks: Sdk.TimeLocks.new({
    //                     srcWithdrawal: 10n, // 10s finality lock for test
    //                     srcPublicWithdrawal: 120n, // 2m for private withdrawal
    //                     srcCancellation: 121n, // 1sec public withdrawal
    //                     srcPublicCancellation: 122n, // 1sec private cancellation
    //                     dstWithdrawal: 10n, // 10s finality lock for test
    //                     dstPublicWithdrawal: 100n, // 100sec private withdrawal
    //                     dstCancellation: 101n // 1sec public withdrawal
    //                 }),
    //                 srcChainId,
    //                 dstChainId,
    //                 srcSafetyDeposit: parseEther("0.000000001"),
    //                 dstSafetyDeposit: parseEther("0.000000001")
    //             },
    //             {
    //                 auction: new Sdk.AuctionDetails({
    //                     initialRateBump: 0,
    //                     points: [],
    //                     duration: 120n,
    //                     startTime: srcTimestamp
    //                 }),
    //                 whitelist: [
    //                     {
    //                         address: new Address(src.resolver),
    //                         allowFrom: 0n
    //                     }
    //                 ],
    //                 resolvingStartTime: 0n
    //             },
    //             {
    //                 nonce: Sdk.randBigInt(UINT_40_MAX),
    //                 allowPartialFills: true,
    //                 allowMultipleFills: true
    //             }
    //         )

    //         const signature = await srcChainUser.signOrder(srcChainId, order)
    //         const orderHash = order.getOrderHash(srcChainId)
    //         // Resolver fills order
    //         const resolverContract = new Resolver(src.resolver, dst.resolver)

    //         console.log(`[${srcChainId}]`, `Filling order ${orderHash}`)

    //         const fillAmount = order.makingAmount / 2n
    //         const idx = Number((BigInt(secrets.length - 1) * (fillAmount - 1n)) / order.makingAmount)

    //         const {txHash: orderFillHash, blockHash: srcDeployBlock} = await srcChainResolver.send(
    //             resolverContract.deploySrc(
    //                 srcChainId,
    //                 order,
    //                 signature,
    //                 Sdk.TakerTraits.default()
    //                     .setExtension(order.extension)
    //                     .setInteraction(
    //                         new Sdk.EscrowFactory(new Address(src.escrowFactory)).getMultipleFillInteraction(
    //                             Sdk.HashLock.getProof(leaves, idx),
    //                             idx,
    //                             secretHashes[idx]
    //                         )
    //                     )
    //                     .setAmountMode(Sdk.AmountMode.maker)
    //                     .setAmountThreshold(order.takingAmount),
    //                 fillAmount,
    //                 Sdk.HashLock.fromString(secretHashes[idx])
    //             )
    //         )

    //         console.log(`[${srcChainId}]`, `Order ${orderHash} filled for ${fillAmount} in tx ${orderFillHash}`)

    //         const srcEscrowEvent = await srcFactory.getSrcDeployEvent(srcDeployBlock)

    //         const dstImmutables = srcEscrowEvent[0]
    //             .withComplement(srcEscrowEvent[1])
    //             .withTaker(new Address(resolverContract.dstAddress))

    //         console.log(`[${dstChainId}]`, `Depositing ${dstImmutables.amount} for order ${orderHash}`)
    //         const {txHash: dstDepositHash, blockTimestamp: dstDeployedAt} = await dstChainResolver.send(
    //             resolverContract.deployDst(dstImmutables)
    //         )
    //         console.log(`[${dstChainId}]`, `Created dst deposit for order ${orderHash} in tx ${dstDepositHash}`)

    //         const secret = secrets[idx]

    //         const ESCROW_SRC_IMPLEMENTATION = await srcFactory.getSourceImpl()
    //         const ESCROW_DST_IMPLEMENTATION = await dstFactory.getDestinationImpl()

    //         const srcEscrowAddress = new Sdk.EscrowFactory(new Address(src.escrowFactory)).getSrcEscrowAddress(
    //             srcEscrowEvent[0],
    //             ESCROW_SRC_IMPLEMENTATION
    //         )

    //         const dstEscrowAddress = new Sdk.EscrowFactory(new Address(dst.escrowFactory)).getDstEscrowAddress(
    //             srcEscrowEvent[0],
    //             srcEscrowEvent[1],
    //             dstDeployedAt,
    //             new Address(resolverContract.dstAddress),
    //             ESCROW_DST_IMPLEMENTATION
    //         )

    //         // await increaseTime(11) // finality lock passed
    //         // User shares key after validation of dst escrow deployment
    //         console.log(`[${dstChainId}]`, `Withdrawing funds for user from ${dstEscrowAddress}`)
    //         await dstChainResolver.send(
    //             resolverContract.withdraw('dst', dstEscrowAddress, secret, dstImmutables.withDeployedAt(dstDeployedAt))
    //         )

    //         console.log(`[${srcChainId}]`, `Withdrawing funds for resolver from ${srcEscrowAddress}`)
    //         const {txHash: resolverWithdrawHash} = await srcChainResolver.send(
    //             resolverContract.withdraw('src', srcEscrowAddress, secret, srcEscrowEvent[0])
    //         )
    //         console.log(
    //             `[${srcChainId}]`,
    //             `Withdrew funds for resolver from ${srcEscrowAddress} to ${src.resolver} in tx ${resolverWithdrawHash}`
    //         )

    //         const resultBalances = await getBalances(
    //             config.chain.source.tokens.USDC.address,
    //             config.chain.destination.tokens.USDC.address
    //         )

    //         // user transferred funds to resolver on the source chain
    //         expect(initialBalances.src.user - resultBalances.src.user).toBe(fillAmount)
    //         expect(resultBalances.src.resolver - initialBalances.src.resolver).toBe(fillAmount)
    //         // resolver transferred funds to user on the destination chain
    //         const dstAmount = (order.takingAmount * fillAmount) / order.makingAmount
    //         expect(resultBalances.dst.user - initialBalances.dst.user).toBe(dstAmount)
    //         expect(initialBalances.dst.resolver - resultBalances.dst.resolver).toBe(dstAmount)
    //     })
    // })

    // describe('Cancel', () => {
    //     it('should cancel swap Ethereum USDC -> Bsc USDC', async () => {
    //         const initialBalances = await getBalances(
    //             config.chain.source.tokens.USDC.address,
    //             config.chain.destination.tokens.USDC.address
    //         )

    //         // User creates order
    //         const hashLock = Sdk.HashLock.forSingleFill(uint8ArrayToHex(randomBytes(32))) // note: use crypto secure random number in real world
    //         const order = Sdk.CrossChainOrder.new(
    //             new Address(src.escrowFactory),
    //             {
    //                 salt: Sdk.randBigInt(1000n),
    //                 maker: new Address(await srcChainUser.getAddress()),
    //                 makingAmount: 1n,
    //                 takingAmount: 1n,
    //                 makerAsset: new Address(config.chain.source.tokens.USDC.address),
    //                 takerAsset: new Address(config.chain.destination.tokens.USDC.address)
    //             },
    //             {
    //                 hashLock,
    //                 timeLocks: Sdk.TimeLocks.new({
    //                     srcWithdrawal: 0n, // no finality lock for test
    //                     srcPublicWithdrawal: 120n, // 2m for private withdrawal
    //                     srcCancellation: 121n, // 1sec public withdrawal
    //                     srcPublicCancellation: 122n, // 1sec private cancellation
    //                     dstWithdrawal: 0n, // no finality lock for test
    //                     dstPublicWithdrawal: 100n, // 100sec private withdrawal
    //                     dstCancellation: 101n // 1sec public withdrawal
    //                 }),
    //                 srcChainId,
    //                 dstChainId,
    //                 srcSafetyDeposit: parseEther('0.001'),
    //                 dstSafetyDeposit: parseEther('0.001')
    //             },
    //             {
    //                 auction: new Sdk.AuctionDetails({
    //                     initialRateBump: 0,
    //                     points: [],
    //                     duration: 120n,
    //                     startTime: srcTimestamp
    //                 }),
    //                 whitelist: [
    //                     {
    //                         address: new Address(src.resolver),
    //                         allowFrom: 0n
    //                     }
    //                 ],
    //                 resolvingStartTime: 0n
    //             },
    //             {
    //                 nonce: Sdk.randBigInt(UINT_40_MAX),
    //                 allowPartialFills: false,
    //                 allowMultipleFills: false
    //             }
    //         )

    //         const signature = await srcChainUser.signOrder(srcChainId, order)
    //         const orderHash = order.getOrderHash(srcChainId)
    //         // Resolver fills order
    //         const resolverContract = new Resolver(src.resolver, dst.resolver)

    //         console.log(`[${srcChainId}]`, `Filling order ${orderHash}`)

    //         const fillAmount = order.makingAmount
    //         const {txHash: orderFillHash, blockHash: srcDeployBlock} = await srcChainResolver.send(
    //             resolverContract.deploySrc(
    //                 srcChainId,
    //                 order,
    //                 signature,
    //                 Sdk.TakerTraits.default()
    //                     .setExtension(order.extension)
    //                     .setAmountMode(Sdk.AmountMode.maker)
    //                     .setAmountThreshold(order.takingAmount),
    //                 fillAmount
    //             )
    //         )

    //         console.log(`[${srcChainId}]`, `Order ${orderHash} filled for ${fillAmount} in tx ${orderFillHash}`)

    //         const srcEscrowEvent = await srcFactory.getSrcDeployEvent(srcDeployBlock)

    //         const dstImmutables = srcEscrowEvent[0]
    //             .withComplement(srcEscrowEvent[1])
    //             .withTaker(new Address(resolverContract.dstAddress))

    //         console.log(`[${dstChainId}]`, `Depositing ${dstImmutables.amount} for order ${orderHash}`)
    //         const {txHash: dstDepositHash, blockTimestamp: dstDeployedAt} = await dstChainResolver.send(
    //             resolverContract.deployDst(dstImmutables)
    //         )
    //         console.log(`[${dstChainId}]`, `Created dst deposit for order ${orderHash} in tx ${dstDepositHash}`)

    //         const ESCROW_SRC_IMPLEMENTATION = await srcFactory.getSourceImpl()
    //         const ESCROW_DST_IMPLEMENTATION = await dstFactory.getDestinationImpl()

    //         const srcEscrowAddress = new Sdk.EscrowFactory(new Address(src.escrowFactory)).getSrcEscrowAddress(
    //             srcEscrowEvent[0],
    //             ESCROW_SRC_IMPLEMENTATION
    //         )

    //         const dstEscrowAddress = new Sdk.EscrowFactory(new Address(dst.escrowFactory)).getDstEscrowAddress(
    //             srcEscrowEvent[0],
    //             srcEscrowEvent[1],
    //             dstDeployedAt,
    //             new Address(resolverContract.dstAddress),
    //             ESCROW_DST_IMPLEMENTATION
    //         )

    //         // await increaseTime(125)
    //         // user does not share secret, so cancel both escrows
    //         console.log(`[${dstChainId}]`, `Cancelling dst escrow ${dstEscrowAddress}`)
    //         await dstChainResolver.send(
    //             resolverContract.cancel('dst', dstEscrowAddress, dstImmutables.withDeployedAt(dstDeployedAt))
    //         )

    //         console.log(`[${srcChainId}]`, `Cancelling src escrow ${srcEscrowAddress}`)
    //         const {txHash: cancelSrcEscrow} = await srcChainResolver.send(
    //             resolverContract.cancel('src', srcEscrowAddress, srcEscrowEvent[0])
    //         )
    //         console.log(`[${srcChainId}]`, `Cancelled src escrow ${srcEscrowAddress} in tx ${cancelSrcEscrow}`)

    //         const resultBalances = await getBalances(
    //             config.chain.source.tokens.USDC.address,
    //             config.chain.destination.tokens.USDC.address
    //         )

    //         expect(initialBalances).toEqual(resultBalances)
    //     })
    // })
})

async function initChain(
    cnf: ChainConfig
): Promise<{node?: CreateServerReturnType; provider: JsonRpcProvider; escrowFactory: string; resolver: string}> {
    const {node, provider} = await getProvider(cnf)

    if (cnf.escrowFactory && cnf.resolver) {
        console.log(`[${cnf.chainId}] Using pre-deployed contracts`)
        return {
            provider,
            escrowFactory: cnf.escrowFactory,
            resolver: cnf.resolver
        }
    }

    const deployer = new SignerWallet((cnf as any).ownerPrivateKey, provider)

    // deploy EscrowFactory
    const escrowFactory = await deploy(
        factoryContract,
        [
            (cnf as any).limitOrderProtocol,
            (cnf as any).wrappedNative, // feeToken,
            Address.fromBigInt(0n).toString(), // accessToken,
            deployer.address, // owner
            60 * 30, // src rescue delay
            60 * 30 // dst rescue delay
        ],
        provider,
        deployer
    )
    console.log(`[${(cnf as any).chainId}]`, `Escrow factory contract deployed to`, escrowFactory)

    // deploy Resolver contract
    const resolver = await deploy(
        resolverContract,
        [
            escrowFactory,
            (cnf as any).limitOrderProtocol,
            computeAddress(resolverPk) // resolver as owner of contract
        ],
        provider,
        deployer
    )
    console.log(`[${(cnf as any).chainId}]`, `Resolver contract deployed to`, resolver)

    return {node: node, provider, resolver, escrowFactory}
}

async function getProvider(cnf: ChainConfig): Promise<{node?: CreateServerReturnType; provider: JsonRpcProvider}> {
    if (!cnf.createFork) {
        return {
            provider: new JsonRpcProvider(cnf.url, cnf.chainId, {
                cacheTimeout: -1,
                staticNetwork: true
            })
        }
    }

    // const node = createServer({
    //     instance: anvil({forkUrl: cnf.url, chainId: cnf.chainId}),
    //     limit: 1
    // })
    // await node.start()

    // const address = node.address()
    // assert(address)

    // const provider = new JsonRpcProvider(`http://[${address.address}]:${address.port}/1`, cnf.chainId, {
    //     cacheTimeout: -1,
    //     staticNetwork: true
    // })

    // return {
    //     provider,
    //     node
    // }
}

/**
 * Deploy contract and return its address
 */
async function deploy(
    json: {abi: any; bytecode: any},
    params: unknown[],
    provider: JsonRpcProvider,
    deployer: SignerWallet
): Promise<string> {
    const deployed = await new ContractFactory(json.abi, json.bytecode, deployer).deploy(...params)
    await deployed.waitForDeployment()

    return await deployed.getAddress()
}
