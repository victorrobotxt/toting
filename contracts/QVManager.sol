// contracts/QVManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./QVVerifier.sol";
import "./interfaces/IMACI.sol";

/// @title Manager for Quadratic Voting ballots
/// @notice Verifies private credit proofs and forwards encrypted ballots to MACI

// --- FIX: Use the correct import path for OpenZeppelin v4.9.3 ---
// This path now matches the file you located with the `ls` command.
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract QVManager is EIP712 {
    IMACI public immutable maci;
    QVVerifier public qvVerifier;
    mapping(bytes32 => bool) public ballotSeen;

    bytes32 private constant BALLOT_TYPEHASH =
        keccak256("Ballot(address voter, bytes32 ballotHash)");

    event BallotSubmitted(address indexed voter, bytes encryptedBallot);

    constructor(IMACI _maci, QVVerifier _verifier)
        EIP712("QuadraticVote", "1")
    {
        maci = _maci;
        qvVerifier = _verifier;
    }

    /// @dev helper exposed for testing
    function hashTypedDataV4(bytes32 s) external view returns (bytes32) {
        return _hashTypedDataV4(s);
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
        bytes32 h = keccak256(
            abi.encode(block.chainid, msg.sender, keccak256(encryptedBallot))
        );
        require(!ballotSeen[h], "duplicate ballot");
        ballotSeen[h] = true;
        maci.publishMessage(encryptedBallot);
        emit BallotSubmitted(msg.sender, encryptedBallot);
    }

    /// @notice Submit a typed ballot signed using EIP-712
    function submitTypedBallot(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals,
        bytes calldata encryptedBallot,
        bytes calldata signature
    ) external {
        require(
            qvVerifier.verifyProof(a, b, c, pubSignals),
            "invalid voice credit proof"
        );
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    BALLOT_TYPEHASH,
                    msg.sender,
                    keccak256(encryptedBallot)
                )
            )
        );
        address signer = ECDSA.recover(digest, signature);
        require(signer == msg.sender, "bad sig");
        bytes32 h = keccak256(
            abi.encode(block.chainid, msg.sender, keccak256(encryptedBallot))
        );
        require(!ballotSeen[h], "duplicate ballot");
        ballotSeen[h] = true;
        maci.publishMessage(encryptedBallot);
        emit BallotSubmitted(msg.sender, encryptedBallot);
    }
}
