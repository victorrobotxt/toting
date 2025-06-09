// script/DeployElectionManagerV2.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../contracts/ElectionManagerV2.sol";
import "../contracts/MockMACI.sol";
import "../contracts/interfaces/IMACI.sol";

contract DeployElectionManagerV2Script is Script {
    function run() external returns (address proxyAddr) {
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        
        if (deployerPrivateKey == 0) {
            revert("ORCHESTRATOR_KEY environment variable not set or invalid.");
        }

        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        
        MockMACI maci = new MockMACI();
        console.log("MockMACI deployed to:", address(maci));

        ElectionManagerV2 implementation = new ElectionManagerV2();
        console.log("ElectionManagerV2 implementation deployed to:", address(implementation));

        // --- THIS IS THE DEFINITIVE FIX ---
        // We use `abi.encodeWithSignature` to manually specify the exact function
        // signature as a string. This removes all ambiguity for the compiler.
        // The contract type `IMACI` is treated as a simple `address` in the ABI.
        bytes memory callData = abi.encodeWithSignature(
            "initialize(address,address)",
            address(maci),
            deployer
        );
        
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), callData);
        proxyAddr = address(proxy);
        console.log("ElectionManagerV2 proxy deployed to:", proxyAddr);

        vm.stopBroadcast();
    }
}
