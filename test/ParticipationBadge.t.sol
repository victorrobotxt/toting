// test/ParticipationBadge.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ParticipationBadge} from "../contracts/ParticipationBadge.sol";

contract ParticipationBadgeTest is Test {
    ParticipationBadge badge;
    address manager = address(0x1234);

    function setUp() public {
        badge = new ParticipationBadge();
        badge.transferOwnership(manager);
    }

    function testMintAndNonTransferable() public {
        vm.prank(manager);
        uint256 id = badge.safeMint(address(1), 7);
        assertEq(badge.ownerOf(id), address(1));

        vm.expectRevert(bytes("SBT"));
        vm.prank(address(1));
        badge.transferFrom(address(1), address(2), id);
    }

    function testOnlyOwnerCanMint() public {
        vm.expectRevert("Ownable: caller is not the owner");
        badge.safeMint(address(1), 1);
    }

    function testMintEmitsEventAndIncrementsId() public {
        vm.prank(manager);
        vm.expectEmit(true, true, true, false);
        emit ParticipationBadge.BadgeMinted(address(1), 0, 42);
        uint256 id1 = badge.safeMint(address(1), 42);
        assertEq(id1, 0);
        vm.prank(manager);
        uint256 id2 = badge.safeMint(address(2), 43);
        assertEq(id2, 1);
    }
}
