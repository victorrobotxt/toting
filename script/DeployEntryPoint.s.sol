// script/DeployEntryPoint.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract DeployEntryPoint is Script {
    function run() external returns (address entryPointAddress) {
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        if (deployerPrivateKey == 0) {
            revert("ORCHESTRATOR_KEY environment variable not set or invalid.");
        }

        vm.startBroadcast(deployerPrivateKey);
        EntryPoint entryPoint = new EntryPoint();
        vm.stopBroadcast();

        entryPointAddress = address(entryPoint);
        console.log("EntryPoint deployed at:", entryPointAddress);
    }
}
