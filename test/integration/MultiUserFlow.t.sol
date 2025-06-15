// test/integration/MultiUserFlow.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {WalletFactory} from "../../contracts/WalletFactory.sol";
import {SmartWallet} from "../../contracts/SmartWallet.sol";
import {ElectionManagerV2} from "../../contracts/ElectionManagerV2.sol";
import {ParticipationBadge} from "../../contracts/ParticipationBadge.sol";
import {MockMACI} from "../../contracts/MockMACI.sol";
import {Verifier} from "../../contracts/Verifier.sol";
import {TallyVerifier} from "../../contracts/TallyVerifier.sol";
import {QuadraticVotingStrategy} from "../../contracts/strategies/QuadraticVotingStrategy.sol";
import {IVotingStrategy} from "../../contracts/interfaces/IVotingStrategy.sol";
import {IMACI} from "../../contracts/interfaces/IMACI.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

/// @notice Always-true verifier used in tests
contract TestVerifier is Verifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[7] calldata)
        public
        pure
        override
        returns (bool)
    {
        return true;
    }
}

contract TestTallyVerifier is TallyVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[7] calldata)
        public
        pure
        override
        returns (bool)
    {
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
    uint256 internal keyA = 2;
    address internal voterB = vm.addr(3);
    uint256 internal keyB = 3;
    address internal attacker = vm.addr(999);
    uint256 internal attackerKey = 999;

    address public walletA;
    address public walletB;

    function setUp() public {
        entryPoint = new EntryPoint();

        maci = new MockMACI();
        factory = new WalletFactory(entryPoint, new TestVerifier(), "bn254");
        qvStrategy = new QuadraticVotingStrategy(new TestTallyVerifier());

        ElectionManagerV2 impl = new ElectionManagerV2();
        bytes memory initData = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(maci)), admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        manager = ElectionManagerV2(address(proxy));

        walletA = factory.getAddress(voterA, 0);
        walletB = factory.getAddress(voterB, 0);

        vm.deal(walletA, 1 ether);
        vm.deal(walletB, 1 ether);
    }

    function _createElection(bytes32 meta) internal returns (uint256 id) {
        id = manager.nextId();
        vm.prank(admin);
        bytes memory data = abi.encodeWithSignature("createElection(bytes32,address)", meta, address(qvStrategy));
        (bool success,) = address(manager).call(data);
        require(success, "createElection failed");
        assertEq(manager.nextId(), id + 1);
        return id;
    }

    function _buildOp(address owner, uint256 key, uint256 eid, uint256 ballotNonce, uint256 vote, bytes memory vcProof)
        internal
        returns (UserOperation memory op, bytes32 opHash)
    {
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        bytes memory inner = abi.encode(a, b, c, inputs, owner, uint256(0));
        bytes memory initCode =
            abi.encodePacked(address(factory), abi.encodeWithSelector(factory.createAccount.selector, inner));

        address walletAddr = factory.getAddress(owner, 0);
        bytes memory mgrCall = abi.encodeWithSelector(manager.enqueueMessage.selector, eid, vote, ballotNonce, vcProof);

        address badgeAddr = address(manager.badge());
        bytes memory badgeCall = abi.encodeWithSelector(ParticipationBadge.safeMint.selector, walletAddr, eid);

        address[] memory dest = new address[](2);
        dest[0] = address(manager);
        dest[1] = badgeAddr;

        uint256[] memory valueArr = new uint256[](2);
        valueArr[0] = 0;
        valueArr[1] = 0;

        bytes[] memory funcArr = new bytes[](2);
        funcArr[0] = mgrCall;
        funcArr[1] = badgeCall;

        bytes4 execSel = bytes4(keccak256("executeBatch(address[],uint256[],bytes[])"));
        bytes memory callData = abi.encodeWithSelector(execSel, dest, valueArr, funcArr);

        op.sender = walletAddr;
        op.nonce = entryPoint.getNonce(walletAddr, 0);
        op.initCode = initCode;
        op.callData = callData;
        op.callGasLimit = 1_000_000;
        op.verificationGasLimit = 1_500_000;
        op.preVerificationGas = 50_000;
        op.maxFeePerGas = tx.gasprice;
        op.maxPriorityFeePerGas = tx.gasprice;
        op.paymasterAndData = bytes("");

        opHash = entryPoint.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, opHash);
        op.signature = abi.encodePacked(r, s, v);
    }

    function test_TwoVotersCanVote() public {
        uint256 eid = _createElection("multi");

        (UserOperation memory opA,) = _buildOp(voterA, keyA, eid, 111, 1, bytes("p"));
        (UserOperation memory opB,) = _buildOp(voterB, keyB, eid, 222, 0, bytes("q"));

        UserOperation[] memory arr = new UserOperation[](2);
        arr[0] = opA;
        arr[1] = opB;
        entryPoint.handleOps(arr, payable(admin));

        assertEq(entryPoint.getNonce(walletA, 0), 1);
        assertEq(entryPoint.getNonce(walletB, 0), 1);
    }

    function test_ReplayUserOpFails() public {
        uint256 eid = _createElection("replay");
        (UserOperation memory op,) = _buildOp(voterA, keyA, eid, 123, 1, bytes("p"));

        UserOperation[] memory arr = new UserOperation[](1);
        arr[0] = op;
        entryPoint.handleOps(arr, payable(admin));

        assertEq(entryPoint.getNonce(walletA, 0), 1);

        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA25 invalid account nonce"));
        entryPoint.handleOps(arr, payable(admin));
    }

    function test_AttackerSignatureRejected() public {
        uint256 eid = _createElection("attack");
        (UserOperation memory op,) = _buildOp(voterA, attackerKey, eid, 456, 1, bytes("p"));

        UserOperation[] memory arr = new UserOperation[](1);
        arr[0] = op;
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(arr, payable(admin));
    }

    function test_EarlyTallyReverts() public {
        uint256 eid = _createElection("early");

        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        vm.prank(admin);
        vm.expectRevert(bytes("Election not over"));
        manager.tallyVotes(eid, a, b, c, inputs);
    }

    function test_OnlyOwnerRestrictions() public {
        uint256 eid = _createElection("owner");

        vm.prank(attacker);
        vm.expectRevert("Ownable: caller is not the owner");
        manager.createElection(bytes32("hack"), IVotingStrategy(address(0)));

        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        vm.prank(attacker);
        vm.expectRevert("Ownable: caller is not the owner");
        manager.tallyVotes(eid, a, b, c, inputs);
    }
}
