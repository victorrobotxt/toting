// test/SmokeTests.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {WalletFactory} from "../contracts/WalletFactory.sol";
import {Verifier} from "../contracts/Verifier.sol";

contract TestVerifier is Verifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public view override returns (bool) {
        return true;
    }
}

contract SmokeTests is Test {
    WalletFactory public factory;
    EntryPoint public entryPoint;
    TestVerifier public verifier;
    
    address internal alice = vm.addr(1);

    function setUp() public {
        entryPoint = new EntryPoint();
        verifier = new TestVerifier();
        factory = new WalletFactory(entryPoint, verifier, "bn254");
    }

    function test_MintWallet() public {
        // Dummy proof inputs
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        uint256 salt = 0;

        factory.mintWallet(a, b, c, inputs, alice, salt);
        
        address aWallet = factory.walletOf(alice);
        assertTrue(aWallet != address(0));
        
        vm.expectRevert("Factory: already minted");
        factory.mintWallet(a, b, c, inputs, alice, salt);
    }
}