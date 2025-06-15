// test/integration/MultiUserFlow.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import { EntryPoint } from "@account-abstraction/contracts/core/EntryPoint.sol";
import { UserOperation } from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import { WalletFactory } from "../../contracts/WalletFactory.sol";
import { SmartWallet } from "../../contracts/SmartWallet.sol";
import { ElectionManagerV2 } from "../../contracts/ElectionManagerV2.sol";
import { ParticipationBadge } from "../../contracts/ParticipationBadge.sol";
import { MockMACI } from "../../contracts/MockMACI.sol";
import { Verifier } from "../../contracts/Verifier.sol";
import { TallyVerifier } from "../../contracts/TallyVerifier.sol";
import { QuadraticVotingStrategy } from "../../contracts/strategies/QuadraticVotingStrategy.sol";
import { IVotingStrategy } from "../../contracts/interfaces/IVotingStrategy.sol";
import { IMACI } from "../../contracts/interfaces/IMACI.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

/// @notice Always-true verifier used in tests
contract TestVerifierMU is Verifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return true;
    }
}

contract TestTallyVerifierMU is TallyVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return true;
    }
}

contract MultiUserFlowTest is Test {
    EntryPoint public entryPoint;
    WalletFactory public factory;
    ElectionManagerV2 public manager;
    MockMACI public maci;
    QuadraticVotingStrategy public qvStrategy;

    address internal admin = vm.addr(1);
    uint256 internal adminKey = 1;
    address internal voterA = vm.addr(2);
    uint256 internal voterAKey = 2;
    address internal voterB = vm.addr(3);
    uint256 internal voterBKey = 3;
    address internal attacker = vm.addr(4);
    uint256 internal attackerKey = 4;

    address public voterAWallet;
    address public voterBWallet;

    function setUp() public {
        entryPoint = new EntryPoint();
        maci = new MockMACI();
        factory = new WalletFactory(entryPoint, new TestVerifierMU(), "bn254");
        qvStrategy = new QuadraticVotingStrategy(new TestTallyVerifierMU());

        // Deploy manager behind a proxy
        ElectionManagerV2 impl = new ElectionManagerV2();
        bytes memory initData = abi.encodeCall(
            ElectionManagerV2.initialize,
            (IMACI(address(maci)), admin)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        manager = ElectionManagerV2(address(proxy));

        // Precompute smart wallet addresses via CREATE2
        bytes memory creationCodeA = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(entryPoint, voterA)
        );
        bytes memory creationCodeB = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(entryPoint, voterB)
        );
        bytes32 saltA = keccak256(abi.encodePacked(voterA, uint256(0)));
        bytes32 saltB = keccak256(abi.encodePacked(voterB, uint256(0)));
        voterAWallet = Create2.computeAddress(saltA, keccak256(creationCodeA), address(factory));
        voterBWallet = Create2.computeAddress(saltB, keccak256(creationCodeB), address(factory));

        // Fund the wallets
        vm.deal(voterAWallet, 1 ether);
        vm.deal(voterBWallet, 1 ether);
    }

    function _createElection(bytes32 meta) internal returns (uint256 id) {
        id = manager.nextId();
        vm.prank(admin);
        bytes memory payload = abi.encodeWithSignature(
            "createElection(bytes32,address)",
            meta,
            address(qvStrategy)
        );
        (bool success, ) = address(manager).call(payload);
        require(success, "createElection call failed");
        assertEq(manager.nextId(), id + 1, "nextId should increment");
        return id;
    }

    /// @dev Helper to build the `initCode` for deploying a wallet.
    function _buildInitCode(address voter) internal view returns (bytes memory) {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        bytes memory innerData = abi.encode(a, b, c, inputs, voter, uint256(0)); // salt = 0
        bytes memory factoryCalldata = abi.encodeWithSelector(factory.createAccount.selector, innerData);
        return abi.encodePacked(address(factory), factoryCalldata);
    }

    /// @dev Helper to build the `callData` for the wallet's execution.
    function _buildCallData(
        uint256 eid,
        uint256 ballotNonce,
        uint256 vote,
        bytes memory vcProof
    ) internal view returns (bytes memory) {
        bytes memory mgrCall = abi.encodeWithSelector(
            manager.enqueueMessage.selector,
            eid,
            vote,
            ballotNonce,
            vcProof
        );

        return abi.encodeWithSelector(SmartWallet.execute.selector, address(manager), 0, mgrCall);
    }
    
    /// @dev Builds and signs a UserOperation.
    function _buildOp(
        address voter,
        uint256 key,
        address wallet,
        uint256 eid,
        uint256 ballotNonce,
        uint256 vote,
        bytes memory vcProof
    ) internal returns (UserOperation memory op, bytes32 opHash) {
        op.sender = wallet;
        op.nonce = entryPoint.getNonce(wallet, 0);
        op.initCode = wallet.code.length > 0 ? bytes("") : _buildInitCode(voter);
        op.callData = _buildCallData(eid, ballotNonce, vote, vcProof);
        op.callGasLimit = 1_000_000;
        op.verificationGasLimit = 1_500_000;
        op.preVerificationGas = 50_000;
        op.maxFeePerGas = tx.gasprice;
        op.maxPriorityFeePerGas = tx.gasprice;
        op.paymasterAndData = "";

        opHash = entryPoint.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, opHash);
        op.signature = abi.encodePacked(r, s, v);
    }


    function test_TwoVotersCanVote() public {
        uint256 eid = _createElection(bytes32("multi"));

        (UserOperation memory opA, ) = _buildOp(voterA, voterAKey, voterAWallet, eid, 111, 1, bytes("p"));
        (UserOperation memory opB, ) = _buildOp(voterB, voterBKey, voterBWallet, eid, 222, 0, bytes("q"));

        UserOperation[] memory ops = new UserOperation[](2);
        ops[0] = opA;
        ops[1] = opB;
        entryPoint.handleOps(ops, payable(admin));

        // wallets should be deployed and nonces incremented
        assertTrue(voterAWallet.code.length > 0, "A wallet deployed");
        assertTrue(voterBWallet.code.length > 0, "B wallet deployed");
        assertEq(entryPoint.getNonce(voterAWallet, 0), 1);
        assertEq(entryPoint.getNonce(voterBWallet, 0), 1);
    }

    function test_DoubleVoteRejected() public {
        uint256 eid = _createElection(bytes32("once"));

        // first vote
        (UserOperation memory op1, ) = _buildOp(voterA, voterAKey, voterAWallet, eid, 1, 1, bytes("p"));
        UserOperation[] memory single = new UserOperation[](1);
        single[0] = op1;
        entryPoint.handleOps(single, payable(admin));

        // replay with old nonce
        (UserOperation memory op2, ) = _buildOp(voterA, voterAKey, voterAWallet, eid, 2, 0, bytes("p"));
        op2.nonce = 0; // Use old nonce
        bytes32 h2 = entryPoint.getUserOpHash(op2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(voterAKey, h2);
        op2.signature = abi.encodePacked(r2, s2, v2);

        single[0] = op2;
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA25 invalid account nonce"));
        entryPoint.handleOps(single, payable(admin));
    }

    function test_AttackerSignatureRejected() public {
        uint256 eid = _createElection(bytes32("sig"));

        (UserOperation memory op, ) = _buildOp(voterA, attackerKey, voterAWallet, eid, 10, 1, bytes("p"));
        UserOperation[] memory arr = new UserOperation[](1);
        arr[0] = op;

        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(arr, payable(admin));
    }

    function test_AdminEarlyTallyReverts() public {
        uint256 eid = _createElection(bytes32("early"));

        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        vm.prank(admin);
        vm.expectRevert(bytes("Election not over"));
        manager.tallyVotes(eid, a, b, c, inputs);
    }

    function test_NonAdminCallsRevert() public {
        uint256 eid = _createElection(bytes32("nope"));

        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        // non-owner cannot create
        vm.prank(voterA);
        vm.expectRevert("Ownable: caller is not the owner");
        bytes memory payload = abi.encodeWithSignature(
            "createElection(bytes32,address)",
            bytes32("bad"),
            address(0)
        );
        (bool s, ) = address(manager).call(payload);
        if (!s) revert();


        // non-owner cannot tally
        vm.prank(voterA);
        vm.roll(block.number + 2_000_000); // ensure election is over
        vm.expectRevert("Ownable: caller is not the owner");
        manager.tallyVotes(eid, a, b, c, inputs);
    }
}
