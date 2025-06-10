// test/AuditInvariant.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {ElectionManagerV2} from "../contracts/ElectionManagerV2.sol";
import {WalletFactory} from "../contracts/WalletFactory.sol";

/// @notice Placeholder invariants expanded during the audit hardening phase
contract AuditInvariant is Test {
    ElectionManagerV2 manager;
    WalletFactory factory;

    function setUp() public {
        // TODO: deploy contracts for invariant tests
    }

    /// @dev Only the contract owner should be able to upgrade the manager
    /// TODO: rename to `invariant_onlyOwnerCanUpgrade` once implemented
    function todo_onlyOwnerCanUpgrade() public {
        // TODO: implement property test
    }

    /// @dev A single wallet should be minted per EOA
    /// TODO: rename to `invariant_uniqueWalletMint` once implemented
    function todo_uniqueWalletMint() public {
        // TODO: implement property test
    }
}
