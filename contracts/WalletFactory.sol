// contracts/WalletFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";
import "./SmartWallet.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";
// --- THIS IS THE FIX: Add the import for the Create2 library ---
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

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
     * @notice Computes the determined address of a wallet without deploying it.
     * @dev This is a `view` function, safe to be called via `staticcall` by the SDK.
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
