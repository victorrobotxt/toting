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
        bytes32 salt = keccak256(abi.encodePacked(owner, msg.sender));
        wallet = address(new SmartWallet{salt: salt}(entryPoint, owner));
        walletOf[owner] = wallet;
        emit WalletMinted(owner, wallet);
    }
}
