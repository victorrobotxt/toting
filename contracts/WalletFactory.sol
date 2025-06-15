// contracts/WalletFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";
import "./SmartWallet.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";
// --- FIX: Add the import for the Create2 library ---
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

/// @title Minimal smart‑wallet factory
/// @notice Deploys wallets deterministically and records the owner mapping
contract WalletFactory {
    /// @notice EntryPoint used by new wallets
    EntryPoint public entryPoint;
    /// @notice Proof verifier contract
    Verifier public verifier;
    /// @notice Curve identifier (bn254 or bls12-381)
    string public curve;
    /// @notice Tracks the wallet deployed for each EOA
    mapping(address => address) public walletOf;

    event WalletMinted(address indexed owner, address indexed wallet);

    /// @param _entryPoint Address of the ERC‑4337 entry point
    /// @param _verifier Zero‑knowledge proof verifier
    /// @param _curve Curve identifier string
    constructor(EntryPoint _entryPoint, Verifier _verifier, string memory _curve) {
        entryPoint = _entryPoint;
        verifier = _verifier;
        curve = _curve;
    }

    /// @notice Deploy a wallet using ABI‑encoded proof parameters
    /// @dev Required by EntryPoint v0.6.0
    function createAccount(bytes calldata data) external returns (address wallet) {
        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[7] memory pubSignals,
            address owner,
            uint256 salt
        ) = abi.decode(data, (uint256[2], uint256[2][2], uint256[2], uint256[7], address, uint256));
        
        wallet = mintWallet(a, b, c, pubSignals, owner, salt);
    }

    /// @notice Deploy a new wallet after verifying the ZK proof
    /// @param a Groth16 proof element
    /// @param b Groth16 proof element
    /// @param c Groth16 proof element
    /// @param pubSignals Public inputs to the proof
    /// @param owner EOA that controls the new wallet
    /// @param salt Arbitrary salt for CREATE2
    function mintWallet(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[7] memory pubSignals,
        address owner,
        uint256 salt
    ) public returns (address wallet) {
        require(walletOf[owner] == address(0), "Factory: already minted");
        require(
            verifier.verifyProof(a, b, c, pubSignals),
            "Factory: invalid proof"
        );
        bytes32 create2_salt = keccak256(abi.encodePacked(owner, salt));
        
        wallet = address(new SmartWallet{salt: create2_salt}(entryPoint, owner));
        
        walletOf[owner] = wallet;
        emit WalletMinted(owner, wallet);
    }
    
    /**
     * @notice Compute the deterministic address of a wallet without deploying it
     * @param owner EOA that will own the wallet
     * @param salt  Salt used for CREATE2
     * @return predicted address of the wallet
     */
    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes32 create2_salt = keccak256(abi.encodePacked(owner, salt));
        bytes memory creationCode = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(entryPoint, owner)
        );
        return Create2.computeAddress(create2_salt, keccak256(creationCode), address(this));
    }
}
