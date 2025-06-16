// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Generic Groth16 verifier interface
/// @notice Simplified interface used by test stubs and placeholder verifiers
abstract contract Verifier {
    /// @dev Verify a Groth16 proof with seven public signals
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) public view virtual returns (bool);
}
