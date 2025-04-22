// test/FuzzAndInvariant.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/Verifier.sol";
import "../contracts/ElectionManager.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

// --- Stub verifier that always passes ---
contract VerifierStub is Verifier {
    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[] memory
    ) external pure override returns (bool) {
        return true;
    }
}

// --- Fuzz tests ---
contract FuzzTests is Test {
    WalletFactory factory;
    ElectionManager em;
    VerifierStub vs;

    function setUp() public {
        vs = new VerifierStub();
        factory = new WalletFactory(EntryPoint(payable(address(0))), vs);
        em = new ElectionManager(IMACI(address(0)));
    }

    /// For any non‑zero caller+owner, mintWallet must return a non‑zero address
    function testFuzz_MintProducesWallet(address caller, address owner) public {
        vm.assume(caller != address(0) && owner != address(0));
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[] memory inputs;
        vm.prank(caller);
        address wallet = factory.mintWallet(a, b, c, inputs, owner);
        assertTrue(wallet != address(0));
        assertEq(factory.walletOf(caller), wallet);
    }

    /// After a successful mint, a second mint must revert
    function testFuzz_DuplicateMintReverts(
        address caller,
        address owner
    ) public {
        vm.assume(caller != address(0) && owner != address(0));
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[] memory inputs;
        vm.prank(caller);
        factory.mintWallet(a, b, c, inputs, owner);

        vm.prank(caller);
        vm.expectRevert(bytes("Factory: already minted"));
        factory.mintWallet(a, b, c, inputs, owner);
    }

    /// If you roll past `end`, enqueueMessage must revert with "closed"
    function testFuzz_ElectionClosed(uint256 offset) public {
        vm.assume(offset > 0 && offset < 10_000);
        em.createElection(bytes32(uint256(0x42)));
        (, uint256 endBlock) = em.elections(0);
        vm.roll(endBlock + offset);
        vm.expectRevert("closed");
        em.enqueueMessage(1, 0, new bytes(0));
    }
}

// --- Invariant tests ---
contract InvariantTests is Test {
    ElectionManager em;

    function setUp() public {
        em = new ElectionManager(IMACI(address(0)));
        targetContract(address(em));
    }

    /// For every created election, start ≤ end must always hold
    function invariant_startBeforeOrAtEnd() public view {
        uint256 n = em.nextId();
        for (uint256 i = 0; i < n; i++) {
            (uint256 s, uint256 e) = em.elections(i);
            assertLe(s, e);
        }
    }
}
