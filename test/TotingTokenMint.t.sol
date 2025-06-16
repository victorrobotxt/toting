// test/TotingTokenMint.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TotingToken} from "../contracts/TotingToken.sol";

contract TotingTokenMintTest is Test {
    TotingToken token;

    function setUp() public {
        token = new TotingToken();
    }

    function testMintAndDelegate() public {
        token.mint(address(this), 1 ether);
        assertEq(token.totalSupply(), 1 ether, "mint should increase supply");

        token.delegate(address(this));
        assertEq(token.getVotes(address(this)), 1 ether, "delegated votes");

        token.transfer(address(1), 0.4 ether);
        assertEq(token.balanceOf(address(1)), 0.4 ether, "recipient balance");
        assertEq(token.getVotes(address(this)), 0.6 ether, "votes updated after transfer");
    }
}
