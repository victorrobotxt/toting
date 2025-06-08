// contracts/WalletFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";
import "./SmartWallet.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract WalletFactory {
    EntryPoint public immutable entryPoint;
    Verifier public immutable verifier;
    mapping(address => address) public walletOf; // owner => wallet

    event WalletMinted(address indexed owner, address indexed wallet);

    constructor(EntryPoint _entryPoint, Verifier _verifier) {
        entryPoint = _entryPoint;
        verifier = _verifier;
    }

    /**
     * @notice Predicts the address of a SmartWallet for a given owner.
     * @dev This is a required view function for the ERC-4337 SDK to work correctly.
     *      It computes the address using CREATE2, based on a salt derived from the owner.
     * --- FIX: Remove msg.sender from the salt for deterministic, caller-independent addresses. ---
     */
    function getAddress(address owner) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(owner));
        bytes32 codeHash = keccak256(type(SmartWallet).creationCode);
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(abi.encodePacked(
                codeHash,
                abi.encode(entryPoint, owner)
            ))
        )))));
    }


    /**
     * @notice Mint a new ERC-4337 SmartWallet for `owner`, after proving eligibility.
     */
    function mintWallet(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals,
        address owner
    ) external returns (address wallet) {
        require(walletOf[owner] == address(0), "Factory: already minted");
        require(
            verifier.verifyProof(a, b, c, pubSignals),
            "Factory: invalid proof"
        );
        // --- FIX: The salt must match the one used in `getAddress` for the address to be correct. ---
        bytes32 salt = keccak256(abi.encodePacked(owner));
        wallet = address(new SmartWallet{salt: salt}(entryPoint, owner));
        walletOf[owner] = wallet;
        emit WalletMinted(owner, wallet);
    }
}
