// test/VerifierBLS.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {VerifierBLS} from "../contracts/VerifierBLS.sol";

contract VerifierBLSTest is Test {
    VerifierBLS verifier;

    function setUp() public {
        verifier = new VerifierBLS();
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
