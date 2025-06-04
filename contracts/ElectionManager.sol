// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TallyVerifier.sol";

interface IMACI {
    function publishMessage(bytes calldata) external;
}

contract ElectionManager {
    IMACI public immutable maci;
    TallyVerifier public tallyVerifier;
    bool public tallied;

    event ElectionCreated(uint id, bytes32 meta);
    event Tally(uint256 A, uint256 B);

    struct E {
        uint start;
        uint end;
    }
    mapping(uint => E) public elections;
    uint public nextId;

    modifier onlyDuringElection(uint id) {
        E memory e = elections[id];
        require(
            block.number >= e.start && block.number <= e.end,
            "closed"
        );
        _;
    }

    constructor(IMACI _m) {
        maci = _m;
        tallyVerifier = TallyVerifier(address(0)); // wire up real verifier later
    }

    function createElection(bytes32 meta) external {
        elections[nextId] = E(block.number, block.number + 7200);
        emit ElectionCreated(nextId, meta);
        nextId++;
    }

    function enqueueMessage(
        uint id,
        uint vote,
        uint nonce,
        bytes calldata vcProof
    ) external onlyDuringElection(id) {
        maci.publishMessage(abi.encode(msg.sender, vote, nonce, vcProof));
    }

    function tallyVotes(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) external {
        require(!tallied, "already tallied");
        require(
            tallyVerifier.verifyProof(a, b, c, pubSignals),
            "invalid tally proof"
        );
        (uint256 A, uint256 B) = (pubSignals[0], pubSignals[1]);
        emit Tally(A, B);
        tallied = true;
    }
}
