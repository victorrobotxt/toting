// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TallyVerifier.sol";
import "./interfaces/IMACI.sol";
import "./interfaces/IEligibilityVerifier.sol";

contract ElectionManager {
    IMACI public immutable maci;
    TallyVerifier public tallyVerifier;

    struct TallyResult {
        bool tallied;
        uint256[2] result;
    }

    event ElectionCreated(uint id, bytes32 indexed meta, address verifier);
    event Tally(uint256 id, uint256 A, uint256 B);

    struct E {
        uint128 start;
        uint128 end;
        IEligibilityVerifier verifier;
    }
    mapping(uint => E) public elections;
    mapping(uint => TallyResult) public tallies;
    uint public nextId;

    modifier onlyDuringElection(uint id) {
        E memory e = elections[id];
        require(
            block.number >= uint256(e.start) && block.number <= uint256(e.end),
            "closed"
        );
        _;
    }

    constructor(IMACI _m) {
        maci = _m;
        tallyVerifier = TallyVerifier(address(0)); // wire up real verifier later
    }

    function createElection(bytes32 meta, IEligibilityVerifier verifier) external {
        elections[nextId] = E(
            uint128(block.number),
            uint128(block.number + 7200),
            verifier
        );
        emit ElectionCreated(nextId, meta, address(verifier));
        unchecked {
            nextId++;
        }
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
        uint id,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) external {
        require(!tallies[id].tallied, "already tallied");
        require(
            tallyVerifier.verifyProof(a, b, c, pubSignals),
            "invalid tally proof"
        );
        tallies[id].result[0] = pubSignals[0];
        tallies[id].result[1] = pubSignals[1];
        emit Tally(id, pubSignals[0], pubSignals[1]);
        tallies[id].tallied = true;
    }
}
