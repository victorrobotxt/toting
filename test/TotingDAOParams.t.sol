// test/TotingDAOParams.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TotingToken} from "../contracts/TotingToken.sol";
import {TotingDAO} from "../contracts/TotingDAO.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract TotingDAOParamsTest is Test {
    TotingDAO dao;

    function setUp() public {
        TotingToken token = new TotingToken();
        TimelockController timelock = new TimelockController(0, new address[](0), new address[](0), address(this));
        dao = new TotingDAO(token, timelock);
    }

    function testParameters() public {
        assertEq(dao.votingDelay(), 1);
        assertEq(dao.votingPeriod(), 45818);
    }
}
