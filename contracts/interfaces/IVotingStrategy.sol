// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Interface for pluggable voting strategies
/// @notice Implementations verify tally proofs for a specific voting method
interface IVotingStrategy {
    /// @notice Verify a tally proof and return the resulting tally numbers
    /// @param a Groth16 proof A
    /// @param b Groth16 proof B
    /// @param c Groth16 proof C
    /// @param pubSignals Arbitrary length public inputs for the proof
    /// @return tally Array containing the tally result
    function tallyVotes(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata pubSignals
    ) external view returns (uint256[2] memory tally);
}
