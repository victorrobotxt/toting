// script/DeployFactory.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../contracts/Verifier.sol";
import "../contracts/WalletFactory.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract UnsafeVerifierStub is Verifier {
    uint256 public immutable allowedChain;
    constructor(uint256 _chain) { allowedChain = _chain; }
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) public view override returns (bool) {
        require(block.chainid == allowedChain, "unsafe verifier");
        return true;
    }
}

contract DeployFactory is Script {
    function run() external {
        uint256 allowedChain = block.chainid;
        try vm.envUint("CHAIN_ID") returns (uint256 cid) {
            allowedChain = cid;
        } catch {}
        require(block.chainid == allowedChain, "Unsafe verifier on non-test chain");

        // Read the private key from the environment.
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        if (deployerPrivateKey == 0) {
            revert("ORCHESTRATOR_KEY environment variable not set or invalid.");
        }

        // Read the EntryPoint address from the environment
        address entryPointAddress = vm.envAddress("ENTRYPOINT_ADDRESS");
        require(entryPointAddress != address(0), "ENTRYPOINT_ADDRESS env var not set");

        // Start broadcasting transactions signed with this specific private key.
        vm.startBroadcast(deployerPrivateKey);

        UnsafeVerifierStub vs = new UnsafeVerifierStub(allowedChain);
        WalletFactory factory = new WalletFactory(
            // Pass the real EntryPoint address to the constructor
            EntryPoint(payable(entryPointAddress)),
            vs
        );
        console.log("Factory deployed at:", address(factory));
        
        vm.stopBroadcast();
    }
}
