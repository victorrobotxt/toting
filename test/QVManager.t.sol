// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/QVManager.sol";

contract QVVerifierStub is QVVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return true;
    }
}

contract QVVerifierFalse is QVVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return false;
    }
}

contract MACIStub is IMACI {
    event Message(bytes data);
    function publishMessage(bytes calldata data) external override {
        emit Message(data);
    }
}

contract QVManagerTest is Test {
    QVManager manager;
    QVVerifierStub verifier;
    MACIStub maci;

    function setUp() public {
        verifier = new QVVerifierStub();
        maci = new MACIStub();
        manager = new QVManager(IMACI(maci), QVVerifier(address(verifier)));
    }

    function testSubmitBallot() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        bytes memory ballot = hex"deadbeef";

        manager.submitBallot(a, b, c, inputs, ballot);
    }

    function testDuplicateBallotReverts() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        bytes memory ballot = hex"deadbeef";
        manager.submitBallot(a, b, c, inputs, ballot);
        vm.expectRevert("duplicate ballot");
        manager.submitBallot(a, b, c, inputs, ballot);
    }

    function testSubmitBallotInvalidProofReverts() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        bytes memory ballot = hex"deadbeef";
        QVVerifierFalse bad = new QVVerifierFalse();
        QVManager mgr = new QVManager(IMACI(maci), QVVerifier(address(bad)));
        vm.expectRevert("invalid voice credit proof");
        mgr.submitBallot(a, b, c, inputs, ballot);
    }
}
