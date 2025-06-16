// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ElectionManager.sol";
import "../contracts/MockMACI.sol";
import "../contracts/TallyVerifier.sol";

contract EligibilityStub is IEligibilityVerifier {
    function isEligible(address) external pure returns (bool) { return true; }
}

contract ElectionManagerBasicTest is Test {
    ElectionManager manager;
    MockMACI maci;

    function setUp() public {
        maci = new MockMACI();
        manager = new ElectionManager(IMACI(address(maci)));
        // set tally verifier to always-true stub
        TallyVerifier verifier = new TallyVerifier();
        vm.store(
            address(manager),
            bytes32(uint256(0)),
            bytes32(uint256(uint160(address(verifier))))
        );
    }

    function testCreateAndTally() public {
        EligibilityStub ev = new EligibilityStub();
        vm.expectEmit(true, true, true, true);
        emit ElectionCreated(0, bytes32(uint256(1)), address(ev));
        manager.createElection(bytes32(uint256(1)), ev);

        // enqueue a message during the election
        vm.expectEmit(false, false, false, true, address(maci));
        emit Message(abi.encode(address(this), uint256(1), uint256(0), new bytes(0)));
        manager.enqueueMessage(0, 1, 0, new bytes(0));

        // fast forward to after election end
        (, uint256 end,) = manager.elections(0);
        vm.roll(end + 1);

        uint256[2] memory a; uint256[2][2] memory b; uint256[2] memory c; uint256[7] memory inputs;
        inputs[0] = 5; inputs[1] = 6;
        vm.expectEmit(true, true, true, true);
        emit Tally(0, 5, 6);
        manager.tallyVotes(0, a, b, c, inputs);
        bool tallied = manager.tallies(0);
        assertTrue(tallied);
    }

    event Message(bytes data);
    event ElectionCreated(uint id, bytes32 indexed meta, address verifier);
    event Tally(uint256 id, uint256 A, uint256 B);
}
