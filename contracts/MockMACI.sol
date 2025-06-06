// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMACI.sol"; // for the IMACI interface

/// @dev A minimal MACI stub that simply records published messages so `enqueueMessage()` won’t revert.
contract MockMACI is IMACI {
    event Message(bytes data);
    bytes[] public inbox;

    function publishMessage(bytes calldata data) external override {
        inbox.push(data);
        emit Message(data);
    }
}
