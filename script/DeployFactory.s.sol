// script/DeployFactory.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../contracts/Verifier.sol";
import "../contracts/WalletFactory.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract UnsafeVerifierStub is Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) public view override returns (bool) {
        return true;
    }
}

contract DeployFactory is Script {
    function run() external {
        require(block.chainid == 31337, "Unsafe verifier on non-test chain");

        // Read the private key from the environment.
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        if (deployerPrivateKey == 0) {
            revert("ORCHESTRATOR_KEY environment variable not set or invalid.");
        }

        // Start broadcasting transactions signed with this specific private key.
        vm.startBroadcast(deployerPrivateKey);

        UnsafeVerifierStub vs = new UnsafeVerifierStub();
        WalletFactory factory = new WalletFactory(
            EntryPoint(payable(address(0))),
            vs
        );
        console.log("Factory deployed at:", address(factory));
        
        vm.stopBroadcast();
    }
}