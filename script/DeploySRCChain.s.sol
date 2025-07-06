// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { MakerTraits } from "limit-order-protocol/contracts/libraries/MakerTraitsLib.sol";
import { TakerTraits } from "limit-order-protocol/contracts/libraries/TakerTraitsLib.sol";
import { Timelocks } from "../contracts/libraries/TimelocksLib.sol";
import { Address } from "solidity-utils/contracts/libraries/AddressLib.sol";

import { IERC20 } from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import { IOrderMixin } from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import { IBaseEscrow } from "../contracts/interfaces/IBaseEscrow.sol";
import { IResolverExample } from "../contracts/interfaces/IResolverExample.sol";

contract SubmitOrderWithResolver is Script {
    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        uint256 pk = vm.parseUint(string.concat("0x", keyStr));         

        IResolverExample resolver = IResolverExample(0x3c6580b15A74096c73bb417E3C954c27331a8D4D);
        IERC20 makerToken = IERC20(0xCE252C063B7C66417934C85c177AE61Bf0e9858a);
        IERC20 takerToken = IERC20(0x61ed92A2Aa23B2E7da92adEA1209eC71f8098e42);

        uint256 amount = 1e15;
        uint256 amountTaker = 500e18;

        IOrderMixin.Order memory order = IOrderMixin.Order({
            salt: 123456,
            maker: Address.wrap(uint160(0x1ed17B61CdFa0572e98FF006625258c63255544A)),
            receiver: Address.wrap(uint160(0x4dDd8F7371Bb05CCa7eEdfF260931586F0c6A0F3)),
            makerAsset: Address.wrap(uint160(0xCE252C063B7C66417934C85c177AE61Bf0e9858a)),
            takerAsset: Address.wrap(uint160(0x61ed92A2Aa23B2E7da92adEA1209eC71f8098e42)),
            makingAmount: amount,
            takingAmount: amountTaker,
            makerTraits: MakerTraits.wrap(0)
        });

        IBaseEscrow.Immutables memory immutables = IBaseEscrow.Immutables({
            orderHash: 0xe7ef9b96a595d641a1d5c0023066c1dcb13db5fd53563d871d3a80f6ae99456b,
            hashlock: 0xfaf1d8b0d741f1e944f560a3ed42bca66c8d287f6d69734d60ca81af2cdbb6d6,
            maker: Address.wrap(uint160(0x1ed17B61CdFa0572e98FF006625258c63255544A)),
            taker: Address.wrap(uint160(0x4dDd8F7371Bb05CCa7eEdfF260931586F0c6A0F3)),
            token: Address.wrap(uint160(0xCE252C063B7C66417934C85c177AE61Bf0e9858a)),
            amount: amount,
            safetyDeposit: 0,
            timelocks: Timelocks.wrap(300032214234046188315793196318403184640)
        });

        bytes32 r = 0x260e67b587c4b831d2f97021bb762936f5d79ec6f6cd986b2570c526ef0c8270;
        bytes32 vs = 0x574769324b38be9f7562a515311a2194b53399e671b12952bd4130d11cd1759b;

        TakerTraits takerTraits = TakerTraits.wrap(0);
        bytes memory args = "";

        vm.startBroadcast(pk);

        // Approve maker tokens from *EOA* (for LOP + resolver)
        makerToken.approve(0x111111125421cA6dc452d289314280a0f8842A65, amount);
        makerToken.approve(address(resolver), amount);

        // Approve taker token from *EOA* (for resolver to pull if needed)
        takerToken.approve(address(resolver), amountTaker);

        // Now resolver approves takerToken to LOP on its behalf
        resolver.approveToken(takerToken, 0x111111125421cA6dc452d289314280a0f8842A65, amountTaker);

        // Deploy src escrow + fill order
        resolver.deploySrc(immutables, order, r, vs, amount, takerTraits, args);

        vm.stopBroadcast();
    }
}