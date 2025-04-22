// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";
import "./SmartWallet.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract WalletFactory {
    EntryPoint public immutable entryPoint;
    Verifier   public immutable verifier;
    mapping(address => address) public walletOf;

    event WalletMinted(address indexed owner, address indexed wallet);

    constructor(EntryPoint _entryPoint, Verifier _verifier) {
        entryPoint = _entryPoint;
        verifier   = _verifier;
    }

    /**
     * @notice Mint a new ERC‑4337 SmartWallet for `owner`, after proving eligibility.
     * @param a    snarkjs proof parameter 'a'
     * @param b    snarkjs proof parameter 'b'
     * @param c    snarkjs proof parameter 'c'
     * @param pubSignals the public inputs array: [ msgHash, pubKeyX, pubKeyY, … ]
     * @param owner the EOAccount that will own the new SmartWallet
     * @return wallet the address of the newly deployed SmartWallet
     */
    function mintWallet(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata pubSignals,
        address owner
    ) external returns (address wallet) {
        require(walletOf[msg.sender] == address(0), "Factory: already minted");

        // Verify zero‑knowledge proof of eligibility (JWT sig + eligibility==1)
        require(
            verifier.verifyProof(a, b, c, pubSignals),
            "Factory: invalid proof"
        );

        // Deploy via CREATE2 so address = keccak256( 0xff, factory, salt, codeHash )
        bytes32 salt = keccak256(abi.encodePacked(owner, msg.sender));
        wallet = address(new SmartWallet{salt: salt}(entryPoint, owner));

        walletOf[msg.sender] = wallet;
        emit WalletMinted(owner, wallet);
    }
}
