// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ElectionManagerV2.sol";
import "openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract ElectionManagerUpgradeTest is Test {
    ElectionManagerV2 impl;
    ElectionManagerV2 newImpl;
    ElectionManagerV2 proxyEm;

    function setUp() public {
        impl = new ElectionManagerV2();
        bytes memory data = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(0))));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        proxyEm = ElectionManagerV2(address(proxy));
        newImpl = new ElectionManagerV2();
    }

    function testUpgrade() public {
        // owner is address(this) from initialization
        proxyEm.upgradeTo(address(newImpl));
        assertEq(proxyEm.owner(), address(this));
    }
}
