// test/SmartWallet.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SmartWallet} from "../contracts/SmartWallet.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";

contract DummyTarget {
    bool public pinged;

    function ping() external {
        pinged = true;
    }
}

contract SmartWalletTest is Test {
    SmartWallet wallet;
    EntryPoint ep;
    address owner = address(0xABCD);
    address other = address(0xBEEF);

    function setUp() public {
        ep = new EntryPoint();
        wallet = new SmartWallet(ep, owner);
    }

    function testExecuteByOwner() public {
        DummyTarget target = new DummyTarget();
        vm.prank(owner);
        wallet.execute(address(target), 0, abi.encodeCall(DummyTarget.ping, ()));
        assertTrue(target.pinged());
    }

    function testExecuteByEntryPoint() public {
        DummyTarget target = new DummyTarget();
        vm.prank(address(ep));
        wallet.execute(address(target), 0, abi.encodeCall(DummyTarget.ping, ()));
        assertTrue(target.pinged());
    }

    function testExecuteUnauthorizedReverts() public {
        DummyTarget target = new DummyTarget();
        vm.prank(other);
        vm.expectRevert("SmartWallet: not authorized");
        wallet.execute(address(target), 0, abi.encodeCall(DummyTarget.ping, ()));
    }

    function testExecuteBatch() public {
        DummyTarget t1 = new DummyTarget();
        DummyTarget t2 = new DummyTarget();
        address[] memory dest = new address[](2);
        dest[0] = address(t1);
        dest[1] = address(t2);
        uint256[] memory val = new uint256[](2);
        bytes[] memory data = new bytes[](2);
        data[0] = abi.encodeCall(DummyTarget.ping, ());
        data[1] = abi.encodeCall(DummyTarget.ping, ());
        vm.prank(owner);
        wallet.executeBatch(dest, val, data);
        assertTrue(t1.pinged() && t2.pinged());
    }
}
