// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../TallyVerifier.sol";
import "../interfaces/IVotingStrategy.sol";

/// @title Quadratic Voting strategy
/// @notice Default voting strategy using a Groth16 tally proof
contract QuadraticVotingStrategy is IVotingStrategy {
    TallyVerifier public immutable verifier;

    constructor(TallyVerifier _verifier) {
        verifier = _verifier;
    }

    /// @inheritdoc IVotingStrategy
    function tallyVotes(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata pubSignals
    ) external view override returns (uint256[2] memory tally) {
        require(pubSignals.length == 7, "bad-len");
        uint256[7] memory inputs;
        for (uint256 i = 0; i < 7; i++) {
            inputs[i] = pubSignals[i];
        }
        require(verifier.verifyProof(a, b, c, inputs), "invalid tally proof");
        tally[0] = pubSignals[0];
        tally[1] = pubSignals[1];
    }
}
