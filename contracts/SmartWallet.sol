// contracts/SmartWallet.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/core/Helpers.sol";

contract SmartWallet is BaseAccount {
    address public owner;
    IEntryPoint private immutable _entryPoint;

    constructor(IEntryPoint entryPoint_, address owner_) {
        _entryPoint = entryPoint_;
        owner        = owner_;
    }

    /// @notice Required by BaseAccount
    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    /// @notice Hook called by BaseAccount.validateUserOp(...)
    /// @dev Must return 0 if valid, SIG_VALIDATION_FAILED otherwise.
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256) {
        // we trust the entryPoint to have correctly hashed the UserOp
        if (!_isValidSignature(userOpHash, userOp.signature)) {
            return SIG_VALIDATION_FAILED;
        }
        return 0;
    }

    /// @dev Simple ECDSA check for `owner`
    function _isValidSignature(bytes32 hash, bytes memory signature)
        internal
        view
        returns (bool)
    {
        (uint8 v, bytes32 r, bytes32 s) = abi.decode(signature, (uint8, bytes32, bytes32));
        address recovered = ecrecover(hash, v, r, s);
        return recovered == owner;
    }

    receive() external payable {}
}
