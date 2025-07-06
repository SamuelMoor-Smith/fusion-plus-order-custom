// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import { BaseExtension } from "limit-order-settlement/contracts/extensions/BaseExtension.sol";
import { ResolverValidationExtension } from "limit-order-settlement/contracts/extensions/ResolverValidationExtension.sol";

import { ProxyHashLib } from "./libraries/ProxyHashLib.sol";

import { BaseEscrowFactory } from "./BaseEscrowFactory.sol";
import { EscrowDst } from "./EscrowDst.sol";
import { EscrowSrc } from "./EscrowSrc.sol";
import { MerkleStorageInvalidator } from "./MerkleStorageInvalidator.sol";

import { console } from "forge-std/console.sol";

/**
 * @title Escrow Factory contract
 * @notice Contract to create escrow contracts for cross-chain atomic swap.
 * @custom:security-contact security@1inch.io
 */
contract EscrowFactory is BaseEscrowFactory {
    constructor(
        address limitOrderProtocol,
        IERC20 feeToken,
        IERC20 accessToken,
        address owner,
        uint32 rescueDelaySrc,
        uint32 rescueDelayDst
    )
    BaseExtension(limitOrderProtocol)
    ResolverValidationExtension(feeToken, accessToken, owner)
    MerkleStorageInvalidator(limitOrderProtocol) {
        console.log("EscrowFactory constructor start");
        console.log("limitOrderProtocol: %s", limitOrderProtocol);
        console.log("feeToken: %s", address(feeToken));
        console.log("accessToken: %s", address(accessToken));
        console.log("owner: %s", owner);
        console.log("rescueDelaySrc: %s", rescueDelaySrc);
        console.log("rescueDelayDst: %s", rescueDelayDst);

        console.log("Deploying EscrowSrc...");
        ESCROW_SRC_IMPLEMENTATION = address(new EscrowSrc(rescueDelaySrc, accessToken));
        console.log("ESCROW_SRC_IMPLEMENTATION: %s", ESCROW_SRC_IMPLEMENTATION);

        console.log("Deploying EscrowDst...");
        ESCROW_DST_IMPLEMENTATION = address(new EscrowDst(rescueDelayDst, accessToken));
        console.log("ESCROW_DST_IMPLEMENTATION: %s", ESCROW_DST_IMPLEMENTATION);

        _PROXY_SRC_BYTECODE_HASH = ProxyHashLib.computeProxyBytecodeHash(ESCROW_SRC_IMPLEMENTATION);
        _PROXY_DST_BYTECODE_HASH = ProxyHashLib.computeProxyBytecodeHash(ESCROW_DST_IMPLEMENTATION);

        console.log("PROXY_SRC_BYTECODE_HASH:");
        console.logBytes32(_PROXY_SRC_BYTECODE_HASH);

        console.log("PROXY_DST_BYTECODE_HASH:");
        console.logBytes32(_PROXY_DST_BYTECODE_HASH);
    }
}