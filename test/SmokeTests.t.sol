// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/Verifier.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/ElectionManager.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

// -------------------- stub contracts --------------------

contract VerifierStub is Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) public view override returns (bool) {
        return true;
    }
}

contract MACIStub is IMACI {
    event MessagePublished(bytes data);
    function publishMessage(bytes calldata m) external override {
        emit MessagePublished(m);
    }
}

// -------------------- tests -----------------------------

contract SmokeTests is Test {
    WalletFactory factory;
    VerifierStub verifier;
    ElectionManager em;
    MACIStub maci;
    address immutable alice = address(0xBEEF);

    function setUp() public {
        verifier = new VerifierStub();
        factory = new WalletFactory(EntryPoint(payable(address(0))), verifier);
        maci = new MACIStub();
        em = new ElectionManager(IMACI(maci));
    }

    function testMintAndDupRevert() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        vm.prank(alice);
        address aWallet = factory.mintWallet(a, b, c, inputs, alice);

        vm.prank(alice);
        vm.expectRevert(bytes("Factory: already minted"));
        factory.mintWallet(a, b, c, inputs, alice);
    }

    function testElectionCreateAndEnqueue() public {
        em.createElection(bytes32(uint256(0x42)));
        vm.roll(block.number + 1);
        em.enqueueMessage(1, 0, new bytes(0));
    }
}
