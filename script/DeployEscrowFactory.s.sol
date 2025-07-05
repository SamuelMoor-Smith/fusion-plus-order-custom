// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Script } from "forge-std/Script.sol";
import { EscrowFactory } from "contracts/EscrowFactory.sol";
import { console } from "forge-std/console.sol";

interface ICreateX {
    function deployCreate3(bytes32 salt, bytes calldata creationCode) external returns (address);
}

contract DeployEscrowFactory is Script {
    uint32 public constant RESCUE_DELAY = 691200; // 8 days
    bytes32 public constant CROSSCHAIN_SALT = keccak256("1inch111 EscrowFactory");
    
    address public constant LOP = 0x111111125421cA6dc452d289314280a0f8842A65;
    address public constant ACCESS_TOKEN = 0xACCe550000159e70908C0499a1119D04e7039C28;
    ICreateX public constant CREATE3_DEPLOYER = ICreateX(0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed);

    mapping(uint256 => address) public FEE_TOKEN;
    
    function run() external {
        FEE_TOKEN[1] = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
        FEE_TOKEN[56] = 0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3;
        FEE_TOKEN[137] = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
        FEE_TOKEN[43114] = 0xd586E7F844cEa2F87f50152665BCbc2C279D8d70;
        FEE_TOKEN[100] = 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d;
        FEE_TOKEN[42161] = 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1;
        FEE_TOKEN[10] = 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1;
        FEE_TOKEN[8453] = 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb;
        FEE_TOKEN[59144] = 0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5;
        FEE_TOKEN[146] = 0x29219dd400f2Bf60E5a23d13Be72B486D4038894;
        FEE_TOKEN[130] = 0x20CAb320A855b39F724131C69424240519573f81;
        FEE_TOKEN[11155111] = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address feeBankOwner = deployer;
        address feeToken = FEE_TOKEN[block.chainid];

        vm.startBroadcast();
        address escrowFactory = CREATE3_DEPLOYER.deployCreate3(
            CROSSCHAIN_SALT,
            abi.encodePacked(
                type(EscrowFactory).creationCode,
                abi.encode(LOP, feeToken, ACCESS_TOKEN, feeBankOwner, RESCUE_DELAY, RESCUE_DELAY)
            )
        );
        vm.stopBroadcast();

        console.log("Escrow Factory deployed at: ", escrowFactory);
    }
}