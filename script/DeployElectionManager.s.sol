// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ElectionManager.sol";
import "../contracts/MockMACI.sol";

/// @dev Deploy a MockMACI and wire it into ElectionManager so that enqueueMessage() won't revert.
contract DeployElectionManager is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy the MACI stub first
        MockMACI maci = new MockMACI();

        // Pass the stub’s address into ElectionManager
        ElectionManager mgr = new ElectionManager(maci);
        console.log("MockMACI deployed to:", address(maci));
        console.log("ElectionManager deployed to:", address(mgr));

        vm.stopBroadcast();
    }
}
