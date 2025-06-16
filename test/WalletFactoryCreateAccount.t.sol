// test/WalletFactoryCreateAccount.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {WalletFactory} from "../contracts/WalletFactory.sol";
import {Verifier} from "../contracts/Verifier.sol";

contract TestVerifierWF is Verifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[7] calldata) public pure override returns (bool) {
        return true;
    }
}

contract WalletFactoryCreateAccountTest is Test {
    WalletFactory factory;
    EntryPoint ep;
    TestVerifierWF verifier;
    address owner = vm.addr(1);

    function setUp() public {
        ep = new EntryPoint();
        verifier = new TestVerifierWF();
        factory = new WalletFactory(ep, verifier, "bn254");
    }

    function testCreateAccount() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        uint256 salt = 77;
        bytes memory data = abi.encode(a, b, c, inputs, owner, salt);
        address wallet = factory.createAccount(data);
        assertEq(wallet, factory.walletOf(owner));
    }
}
