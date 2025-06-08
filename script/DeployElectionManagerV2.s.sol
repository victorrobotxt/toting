// script/DeployElectionManagerV2.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../contracts/ElectionManagerV2.sol";
import "../contracts/MockMACI.sol";
import "../contracts/interfaces/IMACI.sol"; // Add direct import for IMACI

contract DeployElectionManagerV2Script is Script {
    function run() external returns (address proxyAddr) {
        // Read the private key from the environment.
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        
        if (deployerPrivateKey == 0) {
            revert("ORCHESTRATOR_KEY environment variable not set or invalid.");
        }

        // Derive the deployer's address from the private key.
        address deployer = vm.addr(deployerPrivateKey);

        // Start broadcasting transactions signed with this private key.
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy MockMACI
        MockMACI maci = new MockMACI();
        console.log("MockMACI deployed to:", address(maci));

        // 2. Deploy the implementation contract
        ElectionManagerV2 implementation = new ElectionManagerV2();
        console.log("ElectionManagerV2 implementation deployed to:", address(implementation));

        // 3. Prepare the initialization calldata
        // We pass both the MACI dependency and the initial owner address.
        bytes memory callData = abi.encodeWithSelector(
            ElectionManagerV2.initialize.selector, // This resolves to initialize(IMACI,address)
            IMACI(address(maci)),
            deployer
        );
        
        // 4. Deploy the UUPS proxy pointing to the implementation
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), callData);
        proxyAddr = address(proxy);
        console.log("ElectionManagerV2 proxy deployed to:", proxyAddr);

        // 5. Create election #0 so the orchestrator has a task to watch
        bytes32 meta = "Initial Demo Election";
        ElectionManagerV2(payable(proxyAddr)).createElection(meta);
        console.log("Created initial election #0.");

        vm.stopBroadcast();
    }
}
