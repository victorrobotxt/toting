// script/DeployTimelockManager.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "../contracts/ElectionManagerV2.sol";
import "../contracts/MockMACI.sol";
import "../contracts/interfaces/IMACI.sol";

contract DeployTimelockManager is Script {
    function run() external returns (address proxyAddr, address timelockAddr) {
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        require(deployerPrivateKey != 0, "ORCHESTRATOR_KEY env var not set");

        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        MockMACI maci = new MockMACI();
        console.log("MockMACI deployed to:", address(maci));

        ElectionManagerV2 implementation = new ElectionManagerV2();
        console.log("ElectionManagerV2 implementation deployed to:", address(implementation));

        bytes memory callData = abi.encodeWithSignature("initialize(address,address)", address(maci), deployer);
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), callData);
        proxyAddr = address(proxy);
        console.log("ElectionManagerV2 proxy deployed to:", proxyAddr);

        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        address[] memory executors = new address[](1);
        executors[0] = deployer;
        TimelockController timelock = new TimelockController(1 days, proposers, executors, deployer);
        timelockAddr = address(timelock);
        console.log("TimelockController deployed to:", timelockAddr);

        ElectionManagerV2(address(proxy)).transferOwnership(timelockAddr);

        vm.stopBroadcast();
    }
}
