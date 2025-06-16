// test/OwnableUpgradeable.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/utils/OwnableUpgradeable.sol";

contract OwnableMock is OwnableUpgradeable {
    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    function onlyOwnerFn() external view onlyOwner returns (bool) {
        return true;
    }
}

contract OwnableUpgradeableTest is Test {
    OwnableMock mock;
    address owner = address(this);
    address other = address(0xBEEF);

    function setUp() public {
        mock = new OwnableMock();
        mock.initialize(owner);
    }

    function testInitialOwner() public {
        assertEq(mock.owner(), owner);
    }

    function testOnlyOwnerModifier() public {
        bool ok = mock.onlyOwnerFn();
        assertTrue(ok);
        vm.prank(other);
        vm.expectRevert("Ownable: caller is not the owner");
        mock.onlyOwnerFn();
    }

    function testTransferOwnership() public {
        vm.expectEmit(true, true, false, true);
        emit OwnableUpgradeable.OwnershipTransferred(owner, other);
        mock.transferOwnership(other);
        assertEq(mock.owner(), other);
    }

    function testTransferOwnershipOnlyOwner() public {
        vm.prank(other);
        vm.expectRevert("Ownable: caller is not the owner");
        mock.transferOwnership(address(1));
    }

    function testTransferOwnershipZeroAddress() public {
        vm.expectRevert("Ownable: new owner is the zero address");
        mock.transferOwnership(address(0));
    }
}
