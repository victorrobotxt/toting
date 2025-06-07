// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMACI.sol"; // for the IMACI interface

/// @dev A minimal MACI stub that simply emits a Message event so `enqueueMessage()` won’t revert.
///      The state-changing array push has been removed to prevent gas estimation issues.
contract MockMACI is IMACI {
    event Message(bytes data);
    
    // The `inbox` array has been removed.

    function publishMessage(bytes calldata data) external override {
        // We no longer push to an array, just emit the event.
        // This makes the gas cost predictable and low.
        emit Message(data);
    }
}
