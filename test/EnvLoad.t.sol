// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

contract EnvLoad is Test {
    function testEnvFileIsVisible() public {
        // The real value is whatever scripts/setup_env.sh wrote.
        // We only care that it’s *defined* and parses as an address.
        address mgr = vm.envAddress("ELECTION_MANAGER");
        assertTrue(mgr != address(0), "ELECTION_MANAGER missing or 0x0");
    }
}
