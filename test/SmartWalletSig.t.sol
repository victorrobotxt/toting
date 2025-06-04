// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/SmartWallet.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

/// @dev Expose the internal _isValidSignature for testing
contract SigHelper is SmartWallet {
    constructor(IEntryPoint ep, address owner_) SmartWallet(ep, owner_) {}

    function isValid(
        bytes32 hash,
        bytes calldata signature
    ) external view returns (bool) {
        return _isValidSignature(hash, signature);
    }
}

contract SmartWalletSigTest is Test {
    SigHelper wallet;
    uint256 constant OWNER_KEY = 0xA11CE;
    address ownerAddr;

    bytes32 constant ED_MSG = hex"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    bytes constant ED_SIG = hex"ad90ec520a580a9cc74e655adb18648f01af2bc88f21500ee7b93928ddc78972d2ecd9b433674db509379ef8a8d9be02b45ee432a65a34cb06f30dc234a91d7a45ae0a454764465899f228182b1e4933ec1742bf651d2aca72e3967026137549";

    function setUp() public {
        ownerAddr = vm.addr(OWNER_KEY);
        wallet = new SigHelper(EntryPoint(payable(address(0))), ownerAddr);
    }

    function testValidSignature() public {
        bytes32 msgHash = keccak256("dummy userOp");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, msgHash);
        // abi.encode pads each value to 32 bytes resulting in a 96-byte
        // array which the wallet interprets as a Baby-Jubjub signature.
        // Use abi.encodePacked to produce the standard 65-byte secp256k1
        // signature format.
        bytes memory sig = abi.encodePacked(v, r, s);
        bool ok = wallet.isValid(msgHash, sig);
        assertTrue(ok, "correct key should validate");
    }

    function testInvalidSignature() public {
        bytes32 msgHash = keccak256("dummy userOp");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, msgHash);
        // Use the packed encoding for the secp256k1 signature to avoid the
        // 96-byte padded encoding which would be treated as an EdDSA
        // signature by the wallet.
        bytes memory sig = abi.encodePacked(v, r, s);
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
