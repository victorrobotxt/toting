// contracts/lib/BabyJubjubSig.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal placeholder verifier for Baby-Jubjub EdDSA signatures.
///         This is *not* secure and only demonstrates the interface.
library BabyJubjubSig {
    /// @dev Verifies a signature over `hash` for `owner`.
    ///      Signature format: [R8x(32)][R8y(32)][S(32)] = 96 bytes total.
    function verify(bytes32 hash, bytes memory sig, address owner)
        internal
        pure
        returns (bool)
    {
        if (sig.length != 96) return false;
        bytes32 r8x; bytes32 r8y; bytes32 s;
        assembly {
            r8x := mload(add(sig, 32))
            r8y := mload(add(sig, 64))
            s   := mload(add(sig, 96))
        }
        bytes20 o = bytes20(owner);
        bytes32 d = sha256(abi.encodePacked(o, hash));
        bytes32 expR8x = d;
        bytes32 expR8y = sha256(abi.encodePacked(o, d));
        bytes32 expS   = sha256(abi.encodePacked(d, o));
        return r8x == expR8x && r8y == expR8y && s == expS;
    }
}
