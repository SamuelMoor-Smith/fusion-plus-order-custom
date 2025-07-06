// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IEscrowFactory {
    struct Immutables {
        bytes32 orderHash;
        bytes32 hashlock;
        uint256 maker;
        uint256 taker;
        uint256 token;
        uint256 amount;
        uint256 safetyDeposit;
        uint256 timelocks;
    }

    function createDstEscrow(Immutables memory, uint256) external payable;
}

contract CreateDestinationVault is Script {
    function run() external {
        string memory keyStr = vm.envString("PRIVATE_KEY");
        uint256 pk = vm.parseUint(string.concat("0x", keyStr)); 

        IEscrowFactory factory = IEscrowFactory(0x5e69765f2740850206Ca1eA3A21B319E4bB39ffc);
        IERC20 token = IERC20(0xA2a1D3778107f3Cff1FB393CaD2a4b3488C3E3a3); // 🔑 Replace with your ERC20 token address

        uint256 amount = 1e18;

        IEscrowFactory.Immutables memory immutables = IEscrowFactory.Immutables({
            orderHash: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
            hashlock: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
            maker: uint256(uint160(0x1ed17B61CdFa0572e98FF006625258c63255544A)),
            taker: uint256(uint160(0x2222222222222222222222222222222222222222)),
            token: uint256(uint160(0xA2a1D3778107f3Cff1FB393CaD2a4b3488C3E3a3)),
            amount: amount,
            safetyDeposit: 0,
            timelocks: 300032214234046188315793196318403184640
        });

        vm.startBroadcast(pk);
        token.approve(address(factory), amount);

        factory.createDstEscrow(immutables, 5793196318403184640);
        vm.stopBroadcast();
    }
}