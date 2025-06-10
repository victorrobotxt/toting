// script/DeployPaymaster.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {VerifyingPaymaster} from "../contracts/VerifyingPaymaster.sol";

contract DeployPaymaster is Script {
    function run() external returns (address paymasterAddr) {
        uint256 deployerPrivateKey = vm.envUint("ORCHESTRATOR_KEY");
        if (deployerPrivateKey == 0) {
            revert("ORCHESTRATOR_KEY env var not set or invalid.");
        }

        address entryPointAddress = vm.envAddress("ENTRYPOINT_ADDRESS");
        require(entryPointAddress != address(0), "ENTRYPOINT_ADDRESS env var not set");

        address signer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        VerifyingPaymaster paymaster = new VerifyingPaymaster(
            EntryPoint(payable(entryPointAddress)),
            signer
        );
        console.log("VerifyingPaymaster deployed at:", address(paymaster));
        vm.stopBroadcast();

        paymasterAddr = address(paymaster);
    }
}
