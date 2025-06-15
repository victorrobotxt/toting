// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DepositVerifier.sol";

/// @title Simple deposit contract using a nullifier to prevent double spends.
contract DepositManager {
    DepositVerifier public verifier;
    mapping(uint256 => bool) public nullifiers;

    constructor(DepositVerifier _verifier) {
        verifier = _verifier;
    }

    function deposit(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] calldata inputs
    ) external {
        uint256 nullifier = inputs[1];
        require(!nullifiers[nullifier], "nullifier-used");
        require(verifier.verifyProof(a, b, c, inputs), "invalid-proof");
        nullifiers[nullifier] = true;
    }
}
