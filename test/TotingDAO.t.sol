// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TotingToken} from "../contracts/TotingToken.sol";
import {TotingDAO} from "../contracts/TotingDAO.sol";
import {ElectionManagerV2} from "../contracts/ElectionManagerV2.sol";
import {MockMACI} from "../contracts/MockMACI.sol";
import {IMACI} from "../contracts/interfaces/IMACI.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract TotingDAOTest is Test {
    TotingToken token;
    TimelockController timelock;
    TotingDAO dao;
    ElectionManagerV2 manager;

    function setUp() public {
        token = new TotingToken();
        timelock = new TimelockController(0, new address[](0), new address[](0), address(this));
        dao = new TotingDAO(token, timelock);

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(dao));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(dao));

        token.mint(address(this), 1 ether);
        token.delegate(address(this));

        ElectionManagerV2 impl = new ElectionManagerV2();
        MockMACI maci = new MockMACI();
        bytes memory data = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(maci)), address(timelock)));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        manager = ElectionManagerV2(address(proxy));
    }

    function testGovernedElectionCreation() public {
        address[] memory targets = new address[](1);
        targets[0] = address(manager);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        bytes32 meta = bytes32(uint256(0x42));
        calldatas[0] = abi.encodeCall(ElectionManagerV2.createElection, (meta));
        string memory desc = "create election";

        uint256 id = dao.propose(targets, values, calldatas, desc);

        vm.roll(block.number + dao.votingDelay() + 1);
        dao.castVote(id, 1);
        vm.roll(block.number + dao.votingPeriod() + 1);
        vm.warp(block.timestamp + 1);

        assertEq(uint256(dao.state(id)), 4); // Succeeded

        dao.queue(targets, values, calldatas, keccak256(bytes(desc)));
        dao.execute(targets, values, calldatas, keccak256(bytes(desc)));

        assertEq(manager.nextId(), 1);
    }
}
