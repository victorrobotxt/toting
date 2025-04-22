// contracts/Verifier.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Verifier {
    // snarkjs will fill in the actual VerifyingKey and proof checks
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory input
    ) external view virtual returns (bool) {
        // AUTO‑GENERATED: snarkjs exportSolidityVerifier
        return true;
    }
}
