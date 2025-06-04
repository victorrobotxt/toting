// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "openzeppelin-contracts/contracts/proxy/utils/Initializable.sol";

/// @title Minimal OwnableUpgradeable
/// @notice Simplified version of OpenZeppelin's OwnableUpgradeable for demos
abstract contract OwnableUpgradeable is Initializable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == _owner, "not owner");
        _;
    }

    function __Ownable_init(address initialOwner) internal initializer {
        require(initialOwner != address(0), "owner zero");
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "owner zero");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}
