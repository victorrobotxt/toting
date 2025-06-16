// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/DepositManager.sol";
import "../contracts/DepositVerifier.sol";

contract DepositVerifierTest is Test {
    DepositManager manager;

    function setUp() public {
        // Use real verifier which will reject the dummy proof
        DepositVerifier verifier = new DepositVerifier();
        manager = new DepositManager(verifier);
    }

    function testInvalidProofReverts() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[2] memory inputs;
        // Call deposit with all zero proof which should fail verification
        vm.expectRevert("invalid-proof");
        manager.deposit(a, b, c, inputs);
    }

    function testVerifierReturnsFalse() public view {
        DepositVerifier verifier = manager.verifier();
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[2] memory inputs;
        bool ok = verifier.verifyProof(a, b, c, inputs);
        assertFalse(ok, "zero proof should fail");
    }
}
