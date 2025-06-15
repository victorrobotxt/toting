// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
// --- FIX: Import the local placeholder file we just created. ---
import {OwnableUpgradeable} from "./utils/OwnableUpgradeable.sol";
import "./interfaces/IMACI.sol";
import "./interfaces/IVotingStrategy.sol";

/// @title Upgradeable ElectionManager
/// @notice Version 2 of ElectionManager using UUPS proxy pattern
contract ElectionManagerV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    IMACI public maci;
    bool public tallied; // slot from V1

    constructor() {
        _disableInitializers();
    }

    struct TallyResult {
        bool tallied;
        uint256[2] result;
    }

    struct Election {
        uint128 start;
        uint128 end;
    }

    mapping(uint256 => Election) public elections;
    mapping(uint256 => IVotingStrategy) public strategies;
    mapping(uint256 => TallyResult) public tallies;
    uint256 public nextId;
    uint256[2] public result; // [A, B] tally result

    /// @custom:storage-gap
    uint256[50] private __gap;

    /// @dev initializer replaces constructor for upgradeable contracts
    function initialize(IMACI _maci, address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        maci = _maci;
    }

    modifier onlyDuringElection(uint256 id) {
        Election memory e = elections[id];
        require(block.number >= uint256(e.start) && block.number <= uint256(e.end), "closed");
        _;
    }

    function createElection(bytes32 meta, IVotingStrategy strategy) external onlyOwner {
        elections[nextId] = Election(
            uint128(block.number),
            // Dramatically increase election duration for local development
            uint128(block.number + 1_000_000)
        );
        strategies[nextId] = strategy;
        emit ElectionCreated(nextId, meta);
        unchecked {
            nextId++;
        }
    }

    function enqueueMessage(
        uint256 id,
        uint256 vote,
        uint256 nonce,
        bytes calldata vcProof
    ) external onlyDuringElection(id) {
        maci.publishMessage(abi.encode(msg.sender, vote, nonce, vcProof));
    }

    function tallyVotes(
        uint256 id,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata pubSignals
    ) external onlyOwner {
        require(!tallies[id].tallied, "already tallied");
        IVotingStrategy strategy = strategies[id];
        require(address(strategy) != address(0), "no strategy");
        uint256[2] memory tally = strategy.tallyVotes(a, b, c, pubSignals);
        result[0] = tally[0];
        result[1] = tally[1];
        tallies[id].result[0] = tally[0];
        tallies[id].result[1] = tally[1];
        emit Tally(id, tally[0], tally[1]);
        tallies[id].tallied = true;
        tallied = true;
    }

    event ElectionCreated(uint256 indexed id, bytes32 meta);
    event Tally(uint256 indexed id, uint256 A, uint256 B);

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
