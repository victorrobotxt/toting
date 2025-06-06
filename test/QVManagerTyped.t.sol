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

contract MACIStub is IMACI {
    event Message(bytes data);
    function publishMessage(bytes calldata data) external override {
        emit Message(data);
    }
}

contract QVManagerTypedTest is Test {
    QVManager manager;
    QVVerifierStub verifier;
    MACIStub maci;

    function setUp() public {
        verifier = new QVVerifierStub();
        maci = new MACIStub();
        manager = new QVManager(IMACI(maci), QVVerifier(address(verifier)));
    }

    function testSubmitTypedBallot() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;
        bytes memory ballot = hex"deadbeef";
        bytes32 digest = manager.hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256("Ballot(address voter, bytes32 ballotHash)"),
                    vm.addr(1),
                    keccak256(ballot)
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(vm.addr(1));
        manager.submitTypedBallot(a, b, c, inputs, ballot, sig);
    }
}
