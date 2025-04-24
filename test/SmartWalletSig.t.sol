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

    function setUp() public {
        ownerAddr = vm.addr(OWNER_KEY);
        wallet = new SigHelper(EntryPoint(payable(address(0))), ownerAddr);
    }

    function testValidSignature() public {
        bytes32 msgHash = keccak256("dummy userOp");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, msgHash);
        bytes memory sig = abi.encode(v, r, s);
        bool ok = wallet.isValid(msgHash, sig);
        assertTrue(ok, "correct key should validate");
    }

    function testInvalidSignature() public {
        bytes32 msgHash = keccak256("dummy userOp");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, msgHash);
        bytes memory sig = abi.encode(v, r, s);
        bool ok = wallet.isValid(msgHash, sig);
        assertFalse(ok, "wrong key should fail");
    }
}
