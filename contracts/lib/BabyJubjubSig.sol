// contracts/lib/BabyJubjubSig.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal placeholder verifier for Baby-Jubjub EdDSA signatures.
///         This is *not* secure and only demonstrates the interface.
library BabyJubjubSig {
    /// @dev Verifies a signature over the pre-hashed message `digest` for `owner`.
    ///      Signature format: [R8x(32)][R8y(32)][S(32)] = 96 bytes total.
    ///      The digest should be sha256(owner || messageHash) computed off-chain.
    function verify(bytes32 digest, bytes memory sig, address owner)
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
        bytes32 expR8x = digest;
        bytes32 expR8y = sha256(abi.encodePacked(o, digest));
        bytes32 expS   = sha256(abi.encodePacked(digest, o));
        return r8x == expR8x && r8y == expR8y && s == expS;
    }
}
