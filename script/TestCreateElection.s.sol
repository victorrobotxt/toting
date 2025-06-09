// script/TestCreateElection.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// --- FIX: Import Test.sol instead of Script.sol ---
import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../contracts/ElectionManagerV2.sol";

// --- FIX: Inherit from Test instead of Script ---
contract TestCreateElection is Test {
    function run() external {
        // --- Config: Read from environment ---
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        address managerAddress = vm.envAddress("ELECTION_MANAGER");

        // --- Pre-flight checks ---
        require(deployerPrivateKey != 0, "ORCHESTRATOR_KEY not set");
        require(managerAddress != address(0), "ELECTION_MANAGER not set");
        
        // --- Setup ---
        // Instantiate the contract interface at the deployed proxy address
        ElectionManagerV2 manager = ElectionManagerV2(payable(managerAddress));
        address deployer = vm.addr(deployerPrivateKey);

        // --- Pre-condition checks ---
        // Ensure the deployer is the owner, as expected from the deployment script
        require(manager.owner() == deployer, "Script runner is not the owner of the manager contract");
        uint256 initialNextId = manager.nextId();
        console.log("Initial nextId:", initialNextId);

        // --- Action: Create the election ---
        bytes32 meta = keccak256("my-test-election-from-script");
        
        console.log("Broadcasting createElection transaction as owner:", deployer);
        vm.startBroadcast(deployerPrivateKey);
        manager.createElection(meta);
        vm.stopBroadcast();
        console.log("Transaction broadcasted.");

        // --- Post-condition checks ---
        uint256 finalNextId = manager.nextId();
        console.log("Final nextId:", finalNextId);
        
        // These assertions will now work because we inherit from Test
        assertEq(finalNextId, initialNextId + 1, "nextId should have incremented by 1");

        // Check the created election's data
        (uint128 start, uint128 end) = manager.elections(initialNextId);
        assertTrue(start > 0, "Election start block should be set");
        assertTrue(end > start, "Election end block should be after start block");
        
        console.log("   Successfully created election with ID", initialNextId);
        console.log("   Start block:", start);
        console.log("   End block:", end);
    }
}