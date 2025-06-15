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

    function _buildOp(
        address voter,
        uint256 key,
        address wallet,
        uint256 eid,
        uint256 ballotNonce,
        uint256 vote,
        bytes memory vcProof
    ) internal returns (UserOperation memory op, bytes32 opHash) {
        // dummy proof params
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        // initCode to deploy or reuse smart wallet
        bytes memory inner = abi.encode(a, b, c, inputs, voter, uint256(0));
        bytes memory initCode = abi.encodePacked(
            address(factory),
            abi.encodeWithSelector(factory.createAccount.selector, inner)
        );

        // calls: enqueue vote + mint badge
        bytes memory mgrCall = abi.encodeWithSelector(
            manager.enqueueMessage.selector,
            eid,
            vote,
            ballotNonce,
            vcProof
        );
        bytes memory badgeCall = abi.encodeWithSelector(
            ParticipationBadge.safeMint.selector,
            wallet,
            eid
        );
        address;
        dest[0] = address(manager);
        dest[1] = address(manager.badge());
        uint256;
        bytes;
        valueArr[0] = 0;
        valueArr[1] = 0;
        funcArr[0] = mgrCall;
        funcArr[1] = badgeCall;

        // batch execute
        bytes4 execSel = bytes4(keccak256("executeBatch(address[],uint256[],bytes[])"));
        bytes memory callData = abi.encodeWithSelector(execSel, dest, valueArr, funcArr);

        op.sender = wallet;
        op.nonce = entryPoint.getNonce(wallet, 0);
        op.initCode = initCode;
        op.callData = callData;
        op.callGasLimit = 1_000_000;
        op.verificationGasLimit = 1_500_000;
        op.preVerificationGas = 50_000;
        op.maxFeePerGas = tx.gasprice;
        op.maxPriorityFeePerGas = tx.gasprice;
        op.paymasterAndData = "";
        opHash = entryPoint.getUserOpHash(op);

        // sign with the given key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, opHash);
        op.signature = abi.encodePacked(r, s, v);
    }

    function test_TwoVotersCanVote() public {
        uint256 eid = _createElection(bytes32("multi"));

        (UserOperation memory opA, ) = _buildOp(voterA, voterAKey, voterAWallet, eid, 111, 1, bytes("p"));
        (UserOperation memory opB, ) = _buildOp(voterB, voterBKey, voterBWallet, eid, 222, 0, bytes("q"));

        UserOperation;
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
        UserOperation;
        single[0] = op1;
        entryPoint.handleOps(single, payable(admin));

        // replay with old nonce
        (UserOperation memory op2, ) = _buildOp(voterA, voterAKey, voterAWallet, eid, 2, 0, bytes("p"));
        op2.nonce = 0;
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
        UserOperation;
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
        manager.createElection(bytes32("bad"));

        // non-owner cannot tally
        vm.prank(voterA);
        vm.expectRevert("Ownable: caller is not the owner");
        manager.tallyVotes(eid, a, b, c, inputs);
    }
}
