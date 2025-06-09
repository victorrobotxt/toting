// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./TallyVerifier.sol";
import "./interfaces/IMACI.sol";

/// @title Upgradeable ElectionManager
/// @notice Version 2 of ElectionManager using UUPS proxy pattern
contract ElectionManagerV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    IMACI public maci;
    TallyVerifier public tallyVerifier;
    bool public tallied; // slot from V1 for storage compatibility

    /// @notice The result of the most recently tallied election.
    uint256[2] public result; // [A, B] tally result

    struct TallyResult {
        bool tallied;
        uint256[2] result;
    }

    struct Election {
        uint128 start;
        uint128 end;
    }

    mapping(uint256 => Election) public elections;
    mapping(uint256 => TallyResult) public tallies;
    uint256 public nextId;

    /// @custom:storage-gap
    uint256[49] private __gap;

    /// @dev The constructor should be empty for upgradeable contracts.
    constructor() {
        _disableInitializers();
    }

    /// @dev Initializer to be called by the proxy, replacing the constructor.
    function initialize(IMACI _maci, address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        maci = _maci;
        tallyVerifier = TallyVerifier(address(0));
    }

    /// @dev Modifier to ensure a function is only callable during a specific election period.
    modifier onlyDuringElection(uint256 id) {
        Election memory e = elections[id];
        require(block.number >= uint256(e.start) && block.number <= uint256(e.end), "Election not active");
        _;
    }

    /**
     * @notice Creates a new election, restricted to the owner.
     * @param meta A 32-byte field for arbitrary metadata about the election.
     */
    function createElection(bytes32 meta) external onlyOwner {
        elections[nextId] = Election(
            uint128(block.number),
            // Set a long duration for local development and testing.
            uint128(block.number + 1_000_000)
        );
        emit ElectionCreated(nextId, meta);
        unchecked {
            nextId++;
        }
    }

    /**
     * @notice Submits an encrypted vote message to the MACI contract.
     * @dev This function is open to anyone during an active election.
     * @param id The ID of the election.
     * @param vote The voter's choice.
     * @param nonce A nonce for replay protection.
     * @param vcProof A proof of voice credits.
     */
    function enqueueMessage(
        uint256 id,
        uint256 vote,
        uint256 nonce,
        bytes calldata vcProof
    ) external onlyDuringElection(id) {
        maci.publishMessage(abi.encode(msg.sender, vote, nonce, vcProof));
    }

    /**
     * @notice Submits the ZK-SNARK proof to tally the votes for an election.
     * @dev Restricted to the owner. Persists the final tally on-chain.
     * @param id The ID of the election to tally.
     * @param a The groth16 proof parameter 'a'.
     * @param b The groth16 proof parameter 'b'.
     * @param c The groth16 proof parameter 'c'.
     * @param pubSignals The public signals from the proof, containing the results.
     */
    function tallyVotes(
        uint256 id,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) external onlyOwner {
        require(!tallies[id].tallied, "Election already tallied");
        require(
            tallyVerifier.verifyProof(a, b, c, pubSignals),
            "Invalid tally proof"
        );
        
        // Update state
        result[0] = pubSignals[0];
        result[1] = pubSignals[1];

        TallyResult storage electionTally = tallies[id];
        electionTally.result[0] = pubSignals[0];
        electionTally.result[1] = pubSignals[1];
        electionTally.tallied = true;
        
        // This is the V1 storage slot, kept for compatibility.
        tallied = true;

        emit Tally(id, pubSignals[0], pubSignals[1]);
    }

    event ElectionCreated(uint256 indexed id, bytes32 meta);
    event Tally(uint256 indexed id, uint256 A, uint256 B);

    /// @dev Required by UUPSUpgradeable. Restricts upgrade authorization to the owner.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
