// test/QVVerifier.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {QVVerifier} from "../contracts/QVVerifier.sol";

contract QVVerifierTest is Test {
    QVVerifier verifier;

    function setUp() public {
        verifier = new QVVerifier();
    }

    function testVerifyProofAlwaysReturnsTrue() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        bool ok = verifier.verifyProof(a, b, c, inputs);
        assertTrue(ok);
    }
}
