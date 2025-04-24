// test/WalletFactoryDeterminism.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/SmartWallet.sol";
import "../contracts/Verifier.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract VerifierStub is Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata pubSignals
    ) public view override returns (bool) {
        return true;
    }
}

contract WalletFactoryDeterminismTest is Test {
    EntryPoint ep;
    WalletFactory factory;
    address alice = address(0xABCD);
    address owner = address(0x1234);

    function setUp() public {
        ep = EntryPoint(payable(address(0)));
        factory = new WalletFactory(ep, new VerifierStub());
    }

    function testCreate2AddressDeterminism() public {
        uint256[2] memory a = [uint256(0), uint256(0)];
        uint256[2][2] memory b = [
            [uint256(0), uint256(0)],
            [uint256(0), uint256(0)]
        ];
        uint256[2] memory c = [uint256(0), uint256(0)];
        uint256[7] memory inputs;

        vm.prank(alice);
        address wallet = factory.mintWallet(a, b, c, inputs, owner);

        // recompute CREATE2 address
        bytes32 salt = keccak256(abi.encodePacked(owner, alice));
        bytes memory creation = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(ep, owner)
        );
        bytes32 codeHash = keccak256(creation);
        address expected = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(factory),
                            salt,
                            codeHash
                        )
                    )
                )
            )
        );

        assertEq(wallet, expected, "mintWallet wrong");
        assertEq(factory.walletOf(alice), expected, "walletOf wrong");
    }
}
