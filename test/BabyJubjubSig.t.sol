// test/BabyJubjubSig.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/lib/BabyJubjubSig.sol";

contract BabyJubjubSigTest is Test {
    function _buildSig(bytes32 digest, address owner) internal pure returns (bytes memory) {
        bytes32 r8x = digest;
        bytes32 r8y = sha256(abi.encodePacked(bytes20(owner), digest));
        bytes32 s = sha256(abi.encodePacked(digest, bytes20(owner)));
        return abi.encodePacked(r8x, r8y, s);
    }

    function testVerifyValidSignature() public pure {
        bytes32 digest = keccak256("msg");
        address owner = address(0x1234);
        bytes memory sig = _buildSig(digest, owner);
        bool ok = BabyJubjubSig.verify(digest, sig, owner);
        assertTrue(ok, "valid signature should verify");
    }

    function testVerifyRejectsBadLength() public pure {
        bytes32 digest = keccak256("msg");
        address owner = address(0x1234);
        bytes memory sig = hex"deadbeef"; // length != 96
        bool ok = BabyJubjubSig.verify(digest, sig, owner);
        assertFalse(ok, "wrong length should fail");
    }

    function testVerifyRejectsWrongComponents() public pure {
        bytes32 digest = keccak256("msg");
        address owner = address(0x1234);
        bytes memory sig = _buildSig(digest, owner);
        // Flip last byte to invalidate s component
        sig[95] = bytes1(uint8(sig[95]) ^ 0x01);
        bool ok = BabyJubjubSig.verify(digest, sig, owner);
        assertFalse(ok, "modified signature should fail");
    }
}
