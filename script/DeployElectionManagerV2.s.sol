// script/DeployElectionManagerV2.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../contracts/ElectionManagerV2.sol";
import "../contracts/MockMACI.sol";

contract DeployElectionManagerV2 is Script {
    function run() external returns (address proxyAddr) {
        address deployer = vm.envAddress("ORCHESTRATOR_KEY");
        
        vm.startBroadcast(vm.envUint("ORCHESTRATOR_KEY_PK"));

        // 1. Deploy MockMACI
        MockMACI maci = new MockMACI();
        console.log("MockMACI deployed to:", address(maci));

        // 2. Deploy the implementation contract
        ElectionManagerV2 implementation = new ElectionManagerV2();
        console.log("ElectionManagerV2 implementation deployed to:", address(implementation));

        // 3. Prepare the initialization calldata
        bytes memory callData = abi.encodeWithSelector(
            ElectionManagerV2.initialize.selector,
            IMACI(address(maci))
        );
        
        // The owner will be the deployer, as __Ownable_init is called inside initialize

        // 4. Deploy the UUPS proxy pointing to the implementation
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), callData);
        console.log("ElectionManagerV2 proxy deployed to:", address(proxy));

        vm.stopBroadcast();
        
        return address(proxy);
    }
}