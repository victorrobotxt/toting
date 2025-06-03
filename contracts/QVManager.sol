// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./QVVerifier.sol";
import "./ElectionManager.sol";

/// @title Manager for Quadratic Voting ballots
/// @notice Verifies private credit proofs and forwards encrypted ballots to MACI
contract QVManager {
    IMACI public immutable maci;
    QVVerifier public qvVerifier;

    event BallotSubmitted(address indexed voter, bytes encryptedBallot);

    constructor(IMACI _maci, QVVerifier _verifier) {
        maci = _maci;
        qvVerifier = _verifier;
    }

    /// @notice Submit an encrypted ballot after proving correct voice-credit allocation
    function submitBallot(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals,
        bytes calldata encryptedBallot
    ) external {
        require(
            qvVerifier.verifyProof(a, b, c, pubSignals),
            "invalid voice credit proof"
        );
        maci.publishMessage(encryptedBallot);
        emit BallotSubmitted(msg.sender, encryptedBallot);
    }
}
