// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for Chainlink Automation compatibility
interface IAutomationCompatible {
    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}
