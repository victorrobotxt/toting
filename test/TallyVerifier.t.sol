// test/TallyVerifier.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TallyVerifier} from "../contracts/TallyVerifier.sol";

contract TallyVerifierTest is Test {
    TallyVerifier verifier;

    function setUp() public {
        verifier = new TallyVerifier();
    }

    function testVerifyProofAlwaysTrue() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        bool ok = verifier.verifyProof(a, b, c, inputs);
        assertTrue(ok, "stub verifier should return true");
    }
}
