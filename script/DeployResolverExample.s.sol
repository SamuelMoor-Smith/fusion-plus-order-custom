// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";

import { ResolverExample } from "contracts/mocks/ResolverExample.sol";
import { IEscrowFactory } from "contracts/interfaces/IEscrowFactory.sol";
import { IOrderMixin } from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";


interface ICreateX {
    function deployCreate3(bytes32 salt, bytes calldata creationCode) external returns (address);
}

contract DeployResolverExample is Script {
    bytes32 public constant CROSSCHAIN_SALT = keccak256("JSAMs3 ResolverExample");

    ICreateX public constant CREATE3_DEPLOYER = ICreateX(0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed);

    // You can hardcode or pass via env
    address public constant ESCROW_FACTORY = 0xc45B404021e8c99637B22D3e97E0fc09Fd0459AF;
    address public constant LOP = 0x111111125421cA6dc452d289314280a0f8842A65; // or your custom LOP address

    function run() external {
        address initialOwner = 0x1ed17B61CdFa0572e98FF006625258c63255544A; // Or hardcode if needed

        vm.startBroadcast();

        address resolverExample = CREATE3_DEPLOYER.deployCreate3(
            CROSSCHAIN_SALT,
            abi.encodePacked(
                type(ResolverExample).creationCode,
                abi.encode(IEscrowFactory(ESCROW_FACTORY), IOrderMixin(LOP), initialOwner)
            )
        );

        vm.stopBroadcast();

        console.log("ResolverExample deployed at: ", resolverExample);
    }
}