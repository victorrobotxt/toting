// contracts/SmartWallet.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
// --- FIX: This import is removed as it does not exist in v0.6.0 ---
// import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/core/Helpers.sol";
import {BabyJubjubSig} from "./lib/BabyJubjubSig.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SmartWallet is BaseAccount {
    address public owner;
    IEntryPoint private immutable _entryPoint;

    constructor(IEntryPoint entryPoint_, address owner_) {
        _entryPoint = entryPoint_;
        owner = owner_;
    }

    /// @notice Required by BaseAccount
    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * @notice Returns the nonce of the account for a given sender and key.
     * @dev The key is used to allow for multiple nonces per account (e.g., for parallel execution).
     *      The EntryPoint will always use a key of 0 for sequential nonces.
     */
    function getNonce() public view override returns (uint256) {
        return _entryPoint.getNonce(address(this), 0);
    }

    /// @notice Hook called by BaseAccount.validateUserOp(...)
    /// @dev Must return 0 if valid, SIG_VALIDATION_FAILED otherwise.
    function _validateSignature(
        // --- FIX: The type is changed from `PackedUserOperation` to `UserOperation` ---
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256) {
        // we trust the entryPoint to have correctly hashed the UserOp
        if (!_isValidSignature(userOpHash, userOp.signature)) {
            return SIG_VALIDATION_FAILED;
        }
        return 0;
    }

    /// @dev Dual-curve signature validation. 65-byte secp256k1 (r,s,v packed)
    ///      or 96-byte Baby-Jubjub.
    function _isValidSignature(bytes32 hash, bytes memory signature) internal view returns (bool) {
        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := mload(add(signature, 0x20))
                s := mload(add(signature, 0x40))
                v := byte(0, mload(add(signature, 0x60)))
            }
            address recovered = ecrecover(hash, v, r, s);
            return recovered == owner;
        }
        if (signature.length == 96) {
            bytes32 digest = sha256(abi.encodePacked(bytes20(owner), hash));
            return BabyJubjubSig.verify(digest, signature, owner);
        }
        return false;
    }

    /*───────────────────────────  new code  ───────────────────────────*/
    /// @dev Re-usable auth check: caller must be the EntryPoint or the owner.
    function _requireFromEntryPointOrOwner() internal view {
        require(msg.sender == address(_entryPoint) || msg.sender == owner, "SmartWallet: not authorized");
    }
    /**
     * @notice Execute an arbitrary call from the wallet.
     *         Can be invoked directly by the owner **or** internally by the
     *         EntryPoint while processing a UserOperation.
     */

    function execute(address dest, uint256 value, bytes calldata func) external payable {
        _requireFromEntryPointOrOwner();
        (bool success,) = dest.call{value: value}(func);
        require(success, "SmartWallet: execute failed");
    }

    /// @notice Execute multiple calls in order
    function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external payable {
        _requireFromEntryPointOrOwner();
        require(dest.length == func.length && dest.length == value.length, "len mismatch");
        for (uint256 i = 0; i < dest.length; i++) {
            (bool success,) = dest[i].call{value: value[i]}(func[i]);
            require(success, "SmartWallet: execute failed");
        }
    }
    /*───────────────────────────────────────────────────────────────────*/

    receive() external payable {}
}
