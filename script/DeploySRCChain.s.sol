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

        IResolverExample resolver = IResolverExample(0xb4654ED26f3bcCc6869E7b94B6Ce5C4aB4F57651);
        IERC20 makerToken = IERC20(0xCE252C063B7C66417934C85c177AE61Bf0e9858a);
        IERC20 takerToken = IERC20(0x61ed92A2Aa23B2E7da92adEA1209eC71f8098e42);

        uint256 amount = 1e15;
        uint256 amountTaker = 500e18;

        IOrderMixin.Order memory order = IOrderMixin.Order({
            salt: 1234567,
            maker: Address.wrap(uint160(0x1ed17B61CdFa0572e98FF006625258c63255544A)),
            receiver: Address.wrap(uint160(0x4dDd8F7371Bb05CCa7eEdfF260931586F0c6A0F3)),
            makerAsset: Address.wrap(uint160(0xCE252C063B7C66417934C85c177AE61Bf0e9858a)),
            takerAsset: Address.wrap(uint160(0x61ed92A2Aa23B2E7da92adEA1209eC71f8098e42)),
            makingAmount: amount,
            takingAmount: amountTaker,
            makerTraits: MakerTraits.wrap(0)
        });

        IBaseEscrow.Immutables memory immutables = IBaseEscrow.Immutables({
            orderHash: 0x64ed452af8927d44d5225d221e2dfd87abf1285c46c7e4ba6b0227f8368e8e2f,
            hashlock: 0xfabd55e0f66a49c041a5c54b871bef7fa3c97ef1e76fb53aef5687e9601a8467,
            maker: Address.wrap(uint160(0x1ed17B61CdFa0572e98FF006625258c63255544A)),
            taker: Address.wrap(uint160(0x4dDd8F7371Bb05CCa7eEdfF260931586F0c6A0F3)),
            token: Address.wrap(uint160(0xCE252C063B7C66417934C85c177AE61Bf0e9858a)),
            amount: amount,
            safetyDeposit: 0,
            timelocks: Timelocks.wrap(30003221423404618831579319631840318464042839429834292492)
        });

        bytes32 r = 0xea48eb7f3ebc7a4a852a8364ffea80d70d8ab5e6422c8c350f26471317c1354b;
        bytes32 vs = 0xe54e230044db0505e21092a2352893da0abdc00818851671b639dc51179ec6a6;

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