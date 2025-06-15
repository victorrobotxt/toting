// contracts/ParticipationBadge.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Soul-bound voter participation badge
/// @notice Non-transferable ERC721 minted after casting a vote
contract ParticipationBadge is ERC721, Ownable {
    uint256 public nextId;

    event BadgeMinted(address indexed to, uint256 indexed tokenId, uint256 indexed electionId);

    constructor() ERC721("Participation Badge", "VPB") {}

    /// @notice Mint a new badge for a voter
    /// @dev Only callable by the owner (ElectionManagerV2)
    function safeMint(address to, uint256 electionId) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextId;
        nextId++;
        _safeMint(to, tokenId);
        emit BadgeMinted(to, tokenId, electionId);
    }

    // ----- Soul bound hooks -----
    function _beforeTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal
        override
    {
        require(from == address(0) || to == address(0), "SBT");
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    function approve(address, uint256) public pure override {
        revert("SBT");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("SBT");
    }

    function transferFrom(address, address, uint256) public pure override {
        revert("SBT");
    }

    function safeTransferFrom(address, address, uint256) public pure override {
        revert("SBT");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("SBT");
    }
}
