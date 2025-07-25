// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";

/// @title Quadratic Voting proof verifier stub
/// @notice Placeholder verifier used for tests and local deployments.
contract QVVerifier is Verifier {
    /// @dev Always returns true. Replace with real verification logic for
    /// production deployments.
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure virtual override returns (bool) {
        return true;
    }
}
