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

    /// @dev Creates an account for a given owner and salt. Required by EntryPoint v0.6.0.
    // --- FIX: Add the `returns (address wallet)` clause as required by the EntryPoint contract ---
    function createAccount(bytes calldata data) external returns (address wallet) {
        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[7] memory pubSignals,
            address owner,
            uint256 salt
        ) = abi.decode(data, (uint256[2], uint256[2][2], uint256[2], uint256[7], address, uint256));
        
        // Call the minting logic and return the created wallet's address.
        wallet = mintWallet(a, b, c, pubSignals, owner, salt);
    }


    /**
     * @notice Mint a new ERC-4337 SmartWallet for `owner`, after proving eligibility.
     */
    // --- FIX: Add the `returns (address wallet)` clause so it can be returned by createAccount ---
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
        
        // Create the wallet and assign its address to the return variable.
        wallet = address(new SmartWallet{salt: create2_salt}(entryPoint, owner));
        
        walletOf[owner] = wallet;
        emit WalletMinted(owner, wallet);
    }
}
