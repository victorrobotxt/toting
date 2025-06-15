// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Eligibility Verifier Interface
/// @notice Minimal interface for pluggable eligibility checks
interface IEligibilityVerifier {
    /// @notice Returns true if the given user address is eligible to vote
    /// @param user The externally owned account to check
    /// @return bool Whether the account is eligible
    function isEligible(address user) external view returns (bool);
}
