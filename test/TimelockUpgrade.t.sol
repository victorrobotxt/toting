// test/TimelockUpgrade.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {ElectionManagerV2} from "../contracts/ElectionManagerV2.sol";
import {MockMACI} from "../contracts/MockMACI.sol";
import {IMACI} from "../contracts/interfaces/IMACI.sol";

contract TimelockUpgradeTest is Test {
    ElectionManagerV2 public manager;
    TimelockController public timelock;
    address internal owner;

    function setUp() public {
        owner = address(this);

        ElectionManagerV2 implementation = new ElectionManagerV2();
        MockMACI maci = new MockMACI();
        bytes memory data = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(maci)), owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), data);
        manager = ElectionManagerV2(address(proxy));

        address[] memory proposers = new address[](1);
        proposers[0] = owner;
        address[] memory executors = new address[](1);
        executors[0] = owner;
        timelock = new TimelockController(1 days, proposers, executors, owner);

        manager.transferOwnership(address(timelock));
    }

    function _impl() internal view returns (address impl) {
        bytes32 slot = bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
        bytes32 data = vm.load(address(manager), slot);
        impl = address(uint160(uint256(data)));
    }

    function test_upgradeThroughTimelock() public {
        address implBefore = _impl();
        ElectionManagerV2 newImpl = new ElectionManagerV2();

        bytes memory callData = abi.encodeWithSelector(manager.upgradeTo.selector, address(newImpl));
        bytes32 salt = bytes32(0);
        timelock.schedule(address(manager), 0, callData, bytes32(0), salt, 1 days);

        vm.warp(block.timestamp + 1 days + 1);
        timelock.execute(address(manager), 0, callData, bytes32(0), salt);

        address implAfter = _impl();
        assertEq(implAfter, address(newImpl));
        assertTrue(implBefore != implAfter);
    }

    function test_directUpgradeBlocked() public {
        ElectionManagerV2 newImpl = new ElectionManagerV2();
        vm.expectRevert("Ownable: caller is not the owner");
        manager.upgradeTo(address(newImpl));
    }
}
