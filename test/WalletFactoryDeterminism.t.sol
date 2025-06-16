// test/WalletFactoryDeterminism.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {WalletFactory} from "../contracts/WalletFactory.sol";
import {SmartWallet} from "../contracts/SmartWallet.sol";
import {Verifier} from "../contracts/Verifier.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

contract TestVerifier is Verifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return true;
    }
}

contract WalletFactoryDeterminismTest is Test {
    WalletFactory public factory;
    EntryPoint public entryPoint;
    TestVerifier public verifier;
    
    address internal owner = vm.addr(1);

    function setUp() public {
        entryPoint = new EntryPoint();
        verifier = new TestVerifier();
        factory = new WalletFactory(entryPoint, verifier, "bn254");
    }

    function test_DeterministicAddress() public {
        // Dummy proof inputs
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        uint256 salt = 123; // Use a non-zero salt

        // --- FIX: Correctly compute the creation code hash including constructor args ---
        bytes memory creationCode = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(entryPoint, owner)
        );
        bytes32 create2Salt = keccak256(abi.encodePacked(owner, salt));
        
        // When a factory deploys a contract, the deployer address is the factory itself.
        address expectedAddress = Create2.computeAddress(create2Salt, keccak256(creationCode), address(factory));

        factory.mintWallet(a, b, c, inputs, owner, salt);
        
        address actualAddress = factory.walletOf(owner);

        assertEq(actualAddress, expectedAddress, "Wallet address should be deterministic");
        
        // Also test the view function
        address predictedAddress = factory.getAddress(owner, salt);
        assertEq(predictedAddress, expectedAddress, "getAddress view function should match");
    }
}
