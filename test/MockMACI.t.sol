// test/MockMACI.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MockMACI} from "../contracts/MockMACI.sol";

contract MockMACITest is Test {
    MockMACI maci;

    function setUp() public {
        maci = new MockMACI();
    }

    function testPublishMessageEmitsEvent() public {
        bytes memory data = hex"deadbeef";
        vm.expectEmit(false, false, false, true);
        emit MockMACI.Message(data);
        maci.publishMessage(data);
    }
}
