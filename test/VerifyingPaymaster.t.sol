// test/VerifyingPaymaster.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import {VerifyingPaymaster} from "../contracts/VerifyingPaymaster.sol";

contract VerifyingPaymasterHarness is VerifyingPaymaster {
    constructor(EntryPoint ep, address signer) VerifyingPaymaster(ep, signer) {}

    function callPostOp(IPaymaster.PostOpMode mode, bytes calldata context, uint256 cost) external {
        _postOp(mode, context, cost);
    }
}

contract VerifyingPaymasterTest is Test {
    EntryPoint ep;
    VerifyingPaymasterHarness paymaster;
    address signer = vm.addr(100);

    function setUp() public {
        ep = new EntryPoint();
        paymaster = new VerifyingPaymasterHarness(ep, signer);
    }

    function testDepositAndPostOp() public {
        uint256 eid = 1;
        paymaster.deposit{value: 1 ether}(eid);
        (address sponsor, uint256 amount) = paymaster.sponsorDeposits(eid);
        assertEq(sponsor, address(this));
        assertEq(amount, 1 ether);
        bytes memory ctx = abi.encode(eid);
        paymaster.callPostOp(IPaymaster.PostOpMode.opSucceeded, ctx, 0.3 ether);
        (, uint256 remaining) = paymaster.sponsorDeposits(eid);
        assertEq(remaining, 0.7 ether);
    }

    function testParseFunctions() public {
        uint48 validUntil = 10;
        uint48 validAfter = 5;
        bytes memory sig = hex"deadbeef";
        bytes memory pad = abi.encodePacked(address(paymaster), abi.encode(validUntil, validAfter), sig);
        (uint48 u, uint48 a, bytes memory s) = paymaster.parsePaymasterAndData(pad);
        assertEq(u, validUntil);
        assertEq(a, validAfter);
        assertEq(s, sig);

        uint256 id = 42;
        bytes memory callData = abi.encodeWithSelector(bytes4(0x12345678), id);
        uint256 parsed = paymaster.parseElectionId(callData);
        assertEq(parsed, id);
    }
}
