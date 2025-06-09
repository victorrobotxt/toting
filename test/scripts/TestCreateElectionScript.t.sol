// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../../script/TestCreateElection.s.sol";   // reuse your script

contract DryRun is Script {
    function run() external {
        // Just make sure the script does not revert when the env is in place.
        new TestCreateElection().run();
    }
}
