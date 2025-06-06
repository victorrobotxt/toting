// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "openzeppelin-contracts/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "openzeppelin-contracts/contracts/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "./utils/OwnableUpgradeable.sol";
import "./TallyVerifier.sol";

interface IMACI {
    function publishMessage(bytes calldata) external;
}

/// @title Upgradeable ElectionManager
/// @notice Version 2 of ElectionManager using UUPS proxy pattern
contract ElectionManagerV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    IMACI public maci;
    TallyVerifier public tallyVerifier;
    bool public tallied; // slot from V1

    struct Election {
        uint256 start;
        uint256 end;
    }

    mapping(uint256 => Election) public elections;
    uint256 public nextId;
    uint256[2] public result; // [A, B] tally result

    /// @custom:storage-gap
    uint256[50] private __gap;

    /// @dev initializer replaces constructor for upgradeable contracts
    function initialize(IMACI _maci) public initializer {
        __Ownable_init(msg.sender);
        maci = _maci;
        tallyVerifier = TallyVerifier(address(0));
    }

    modifier onlyDuringElection(uint256 id) {
        Election memory e = elections[id];
        require(block.number >= e.start && block.number <= e.end, "closed");
        _;
    }

    function createElection(bytes32 meta) external onlyOwner {
        elections[nextId] = Election(block.number, block.number + 7200);
        emit ElectionCreated(nextId, meta);
        nextId++;
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
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) external onlyOwner {
        require(!tallied, "already tallied");
        require(
            tallyVerifier.verifyProof(a, b, c, pubSignals),
            "invalid tally proof"
        );
        result[0] = pubSignals[0];
        result[1] = pubSignals[1];
        emit Tally(pubSignals[0], pubSignals[1]);
        tallied = true;
    }

    event ElectionCreated(uint256 id, bytes32 meta);
    event Tally(uint256 A, uint256 B);

    function upgradeTo(address newImplementation)
        external
        onlyOwner
        onlyProxy
    {
        upgradeToAndCall(newImplementation, bytes(""));
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
