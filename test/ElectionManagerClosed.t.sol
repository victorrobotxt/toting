// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ElectionManager.sol";
// --- FIX: Add necessary imports ---
import "../contracts/interfaces/IMACI.sol";
import "../contracts/interfaces/IEligibilityVerifier.sol";


contract ElectionManagerClosedTest is Test {
    ElectionManager em;

    function setUp() public {
        em = new ElectionManager(IMACI(address(0)));
    }

    function testElectionClosedRevert() public {
        // --- FIX: Add the missing 'verifier' argument ---
        em.createElection(bytes32(uint256(0x42)), IEligibilityVerifier(address(0)));
        
        // --- FIX: Correctly destructure the 3 return values from the 'elections' getter ---
        (, uint256 endBlock, ) = em.elections(0);

        // roll past the end
        vm.roll(endBlock + 1);

        vm.expectRevert("closed");
        em.enqueueMessage(0, 1, 0, new bytes(0));
    }
}