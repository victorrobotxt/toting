// test/AuditInvariant.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ElectionManagerV2} from "../contracts/ElectionManagerV2.sol";
import {WalletFactory} from "../contracts/WalletFactory.sol";
import {Verifier} from "../contracts/Verifier.sol";
import {MockMACI} from "../contracts/MockMACI.sol";
import {IMACI} from "../contracts/interfaces/IMACI.sol";

contract TestVerifier is Verifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[7] calldata)
        public
        pure
        override
        returns (bool)
    {
        return true;
    }
}

/// @notice Placeholder invariants expanded during the audit hardening phase
contract AuditInvariant is Test {
    ElectionManagerV2 public manager;
    WalletFactory public factory;
    EntryPoint public entryPoint;
    TestVerifier public verifier;

    address internal owner;
    address internal attacker;
    address internal walletOwner;

    function setUp() public {
        owner = address(this);
        attacker = vm.addr(1);
        walletOwner = vm.addr(2);

        entryPoint = new EntryPoint();
        verifier = new TestVerifier();
        factory = new WalletFactory(entryPoint, verifier, "bn254");

        ElectionManagerV2 implementation = new ElectionManagerV2();
        MockMACI maci = new MockMACI();
        bytes memory data = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(maci)), owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), data);
        manager = ElectionManagerV2(address(proxy));
    }

    /// @dev Only the contract owner should be able to upgrade the manager
    function invariant_onlyOwnerCanUpgrade() public {
        ElectionManagerV2 newImpl = new ElectionManagerV2();

        vm.prank(attacker);
        vm.expectRevert("Ownable: caller is not the owner");
        manager.upgradeTo(address(newImpl));
    }

    /// @dev A single wallet should be minted per EOA
    function invariant_uniqueWalletMint() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        uint256 salt = 0;

        if (factory.walletOf(walletOwner) == address(0)) {
            factory.mintWallet(a, b, c, inputs, walletOwner, salt);
        }

        vm.expectRevert("Factory: already minted");
        factory.mintWallet(a, b, c, inputs, walletOwner, salt);
    }
}
