// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ElectionManager.sol";

/// @dev IMACI is the interface in ElectionManager.sol,
/// but for event-emission we don't need a real implementation,
/// so we can pass address(0).
contract DeployElectionManager is Script {
    function run() external {
        vm.startBroadcast();
        ElectionManager mgr = new ElectionManager(IMACI(address(0)));
        console.log("ElectionManager deployed to:", address(mgr));
        vm.stopBroadcast();
    }
}
