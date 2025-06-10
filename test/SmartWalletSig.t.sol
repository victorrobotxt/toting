// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/SmartWallet.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

/// @dev Expose the internal _isValidSignature for testing
contract SigHelper is SmartWallet {
    constructor(IEntryPoint ep, address owner_) SmartWallet(ep, owner_) {}

    function isValid(bytes32 hash, bytes calldata signature) external view returns (bool) {
        return _isValidSignature(hash, signature);
    }
}

contract SmartWalletSigTest is Test {
    SigHelper wallet;
    uint256 constant OWNER_KEY = 0xA11CE;
    address ownerAddr;

    bytes32 constant ED_MSG = hex"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    // Generated using BabyJubjubSig.verify's placeholder algorithm for
    // `ownerAddr` and `ED_MSG`.
    bytes constant ED_SIG =
        hex"43dccc3f9b28ec4e2417e2623f17d99b37c462064afe9252844765c0124302081b0e414a7972eb653085b8c07a720bdd2e610ae0bf12ed0e4a4557a56e0cd21526c8283e037d6957efc2637b676606ea2761d998a7617b7862593c40e2b7ecbe";

    function setUp() public {
        ownerAddr = vm.addr(OWNER_KEY);
        wallet = new SigHelper(EntryPoint(payable(address(0))), ownerAddr);
    }

    function testValidSignature() public {
        bytes32 msgHash = keccak256("dummy userOp");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, ethHash);
        // abi.encode pads each value to 32 bytes resulting in a 96-byte
        // array which the wallet interprets as a Baby-Jubjub signature.
        // Use abi.encodePacked to produce the standard 65-byte secp256k1
        // signature format in r || s || v order.
        bytes memory sig = abi.encodePacked(r, s, v);
        bool ok = wallet.isValid(msgHash, sig);
        assertTrue(ok, "correct key should validate");
    }

    function testInvalidSignature() public {
        bytes32 msgHash = keccak256("dummy userOp");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, ethHash);
        // Use the packed encoding for the secp256k1 signature to avoid the
        // 96-byte padded encoding which would be treated as an EdDSA
        // signature by the wallet. Signatures are encoded in r || s || v order.
        bytes memory sig = abi.encodePacked(r, s, v);
        bool ok = wallet.isValid(msgHash, sig);
        assertFalse(ok, "wrong key should fail");
    }

    function testValidEdDSA() public {
        bool ok = wallet.isValid(ED_MSG, ED_SIG);
        assertTrue(ok, "eddsa signature should validate");
    }

    function testInvalidEdDSA() public {
        bytes memory badSig = bytes.concat(ED_SIG, hex"00");
        bool ok = wallet.isValid(ED_MSG, badSig);
        assertFalse(ok, "malformed eddsa should fail");
    }
}
