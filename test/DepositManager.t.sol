// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/DepositManager.sol";

contract DepositVerifierStub is DepositVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[2] calldata
    ) public pure override returns (bool) {
        return true;
    }
}

contract DepositManagerTest is Test {
    DepositManager manager;
    DepositVerifierStub verifier;

    function setUp() public {
        verifier = new DepositVerifierStub();
        manager = new DepositManager(DepositVerifier(address(verifier)));
    }

    function testRejectDuplicateNullifier() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[2] memory inputs;
        inputs[1] = 42;
        manager.deposit(a, b, c, inputs);
        vm.expectRevert("nullifier-used");
        manager.deposit(a, b, c, inputs);
    }
}
