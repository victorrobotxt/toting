// test/QuadraticVotingStrategy.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/strategies/QuadraticVotingStrategy.sol";
import "../contracts/TallyVerifier.sol";

contract GoodVerifier is TallyVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[7] calldata)
        public
        pure
        override
        returns (bool)
    {
        return true;
    }
}

contract BadVerifier is TallyVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[7] calldata)
        public
        pure
        override
        returns (bool)
    {
        return false;
    }
}

contract QuadraticVotingStrategyTest is Test {
    QuadraticVotingStrategy strategy;

    function setUp() public {
        strategy = new QuadraticVotingStrategy(new GoodVerifier());
    }

    function testTallyReturnsSignals() public view {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[] memory inputs = new uint256[](7);
        inputs[0] = 11;
        inputs[1] = 22;
        uint256[2] memory tally = strategy.tallyVotes(a, b, c, inputs);
        assertEq(tally[0], 11);
        assertEq(tally[1], 22);
    }

    function testTallyBadLength() public {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[] memory inputs = new uint256[](6);
        vm.expectRevert("bad-len");
        strategy.tallyVotes(a, b, c, inputs);
    }

    function testTallyVerifierFailure() public {
        strategy = new QuadraticVotingStrategy(new BadVerifier());
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[] memory inputs = new uint256[](7);
        vm.expectRevert("invalid tally proof");
        strategy.tallyVotes(a, b, c, inputs);
    }
}
