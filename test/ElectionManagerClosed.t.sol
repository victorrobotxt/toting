// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ElectionManager.sol";

contract ElectionManagerClosedTest is Test {
    ElectionManager em;

    function setUp() public {
        em = new ElectionManager(IMACI(address(0)));
    }

    function testElectionClosedRevert() public {
        em.createElection(bytes32(uint256(0x42)));
        (, uint256 endBlock) = em.elections(0);

        // roll past the end
        vm.roll(endBlock + 1);

        vm.expectRevert("closed");
        em.enqueueMessage(1, 0, new bytes(0));
    }
}
