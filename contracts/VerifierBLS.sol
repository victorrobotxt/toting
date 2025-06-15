// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";

/// @title BLS12-381 proof verifier stub
/// @notice Placeholder verifier used when deploying with curve BLS12-381.
contract VerifierBLS is Verifier {
    /// @dev Always returns true. Replace with real verification logic for
    /// production deployments.
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return true;
    }
}
