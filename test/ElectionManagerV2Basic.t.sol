// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ElectionManagerV2} from "../contracts/ElectionManagerV2.sol";
import {MockMACI} from "../contracts/MockMACI.sol";
import {IVotingStrategy} from "../contracts/interfaces/IVotingStrategy.sol";
import {IMACI} from "../contracts/interfaces/IMACI.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract DummyStrategy is IVotingStrategy {
    function tallyVotes(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[] calldata
    ) external pure returns (uint256[2] memory tally) {
        tally[0] = 7;
        tally[1] = 9;
    }
}

contract ElectionManagerV2BasicTest is Test {
    ElectionManagerV2 manager;
    MockMACI maci;
    address owner = address(this);

    function setUp() public {
        maci = new MockMACI();
        ElectionManagerV2 impl = new ElectionManagerV2();
        bytes memory data = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(maci)), owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        manager = ElectionManagerV2(address(proxy));
    }

    function testFullFlow() public {
        DummyStrategy strategy = new DummyStrategy();
        vm.prank(owner);
        manager.createElection(bytes32(uint256(1)), strategy);
        uint256 id = 0;
        address voter = address(0xBEEF);
        vm.prank(voter);
        manager.enqueueMessage(id, 2, 0, "");
        address badgeAddr = address(manager.badge());
        assertEq(ERC721(badgeAddr).balanceOf(voter), 1);
        (,uint128 end) = manager.elections(id);
        uint256[2] memory a; uint256[2][2] memory b; uint256[2] memory c; uint256[7] memory inputs;
        vm.roll(end + 1);
        manager.tallyVotes(id, a, b, c, inputs);
        bool tallied = manager.tallies(id);
        assertTrue(tallied);
        assertEq(manager.result(0), 7);
        assertEq(manager.result(1), 9);
    }

}
