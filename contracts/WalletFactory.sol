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
    function createAccount(bytes calldata data) external returns (address wallet) {
        // Decode the arguments for our specific minting logic from the generic `data` bytes.
        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[7] memory pubSignals,
            address owner,
            uint256 salt
        ) = abi.decode(data, (uint256[2], uint256[2][2], uint256[2], uint256[7], address, uint256));
        
        // Call the original minting logic with the decoded arguments.
        return mintWallet(a, b, c, pubSignals, owner, salt);
    }


    /**
     * @notice Mint a new ERC-4337 SmartWallet for `owner`, after proving eligibility.
     */
    // --- FIX: Change parameter data location from `calldata` to `memory` ---
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
}
