// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../contracts/Verifier.sol";
import "../contracts/WalletFactory.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract VerifierStub is Verifier {
    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[] memory
    ) external pure override returns (bool) {
        return true;
    }
}

contract DeployFactory is Script {
    function run() external {
        vm.startBroadcast();
        VerifierStub vs = new VerifierStub();
        WalletFactory factory = new WalletFactory(
            EntryPoint(payable(address(0))),
            vs
        );
        console.log("Factory deployed at:", address(factory));
        vm.stopBroadcast();
    }
}
