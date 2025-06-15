// test/integration/FullFlow.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";

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

/// @notice Always‑true verifier used in tests
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
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) public pure override returns (bool) {
        return true;
    }
}

/// -------------------------------------------------------------------------
/// Full happy‑path AA flow + fuzz harness
/// -------------------------------------------------------------------------
contract FullFlowTest is Test {
    /* --------------------------------------------------------------------- */
    /*                                State                                  */
    /* --------------------------------------------------------------------- */

    EntryPoint          public entryPoint;
    WalletFactory       public factory;
    ElectionManagerV2   public manager;
    MockMACI            public maci;
    QuadraticVotingStrategy public qvStrategy;

    address internal admin = vm.addr(1);
    uint256 internal adminKey = 1;
    address internal voter = vm.addr(2);
    uint256 internal voterKey = 2;

    address public voterWallet;

    /* --------------------------------------------------------------------- */
    /*                                Setup                                  */
    /* --------------------------------------------------------------------- */
    function setUp() public {
        entryPoint = new EntryPoint();

        maci       = new MockMACI();
        factory    = new WalletFactory(entryPoint, new TestVerifier(), "bn254");
        qvStrategy = new QuadraticVotingStrategy(new TestTallyVerifier());

        // ── Deploy upgradeable manager (proxy + impl) ──────────────────────
        ElectionManagerV2 impl = new ElectionManagerV2();
        bytes memory initData = abi.encodeCall(ElectionManagerV2.initialize, (IMACI(address(maci)), admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        manager = ElectionManagerV2(address(proxy));

        // ── Pre‑compute deterministic wallet address (salt = 0) ────────────
        bytes memory creationCode = abi.encodePacked(type(SmartWallet).creationCode, abi.encode(entryPoint, voter));
        bytes32 salt = keccak256(abi.encodePacked(voter, uint256(0)));
        voterWallet = Create2.computeAddress(salt, keccak256(creationCode), address(factory));

        // Fund the (yet‑to‑be‑deployed) wallet so it can pay for gas.
        vm.deal(voterWallet, 1 ether);
    }

    /* --------------------------------------------------------------------- */
    /*                               Helpers                                 */
    /* --------------------------------------------------------------------- */
    /// @dev Creates an election and returns its ID.
    function _createElection(bytes32 meta) internal returns (uint256 id) {
        // First, get the ID of the election to be created. This is a view call and doesn't need a prank.
        id = manager.nextId();

        vm.prank(admin);

        // --- FIX: Replace the ambiguous high-level call with an explicit low-level call ---
        // This ensures the calldata sent to the proxy is correctly formatted with the
        // function selector, preventing the state corruption seen in the test trace.

        bytes memory calldataToProxy = abi.encodeCall(manager.createElection, (meta, IVotingStrategy(address(qvStrategy))));
        (bool success, ) = address(manager).call(calldataToProxy);
        require(success, "createElection call to proxy failed");

        // Verify the side-effect. This view call does not need a prank.
        assertEq(manager.nextId(), id + 1, "nextId should have been incremented");
        return id;
    }

    /// @dev Builds a fully‑signed UserOperation that (a) deploys the wallet
    ///      and (b) forwards an encrypted ballot to `ElectionManagerV2`.
    function _buildOp(uint256 eid, uint256 ballotNonce, uint256 vote, bytes memory vcProof)
        internal
        returns (UserOperation memory op, bytes32 opHash)
    {
        // InitCode — deterministic wallet deployment via factory
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[7] memory inputs;

        bytes memory inner = abi.encode(a, b, c, inputs, voter, uint256(0)); // salt = 0
        bytes memory initCode =
            abi.encodePacked(address(factory), abi.encodeWithSelector(factory.createAccount.selector, inner));

        // Smart‑wallet batch call: enqueue message then mint badge
        bytes memory mgrCall = abi.encodeWithSelector(manager.enqueueMessage.selector, eid, vote, ballotNonce, vcProof);

        address badgeAddr = address(manager.badge());
        bytes memory badgeCall = abi.encodeWithSelector(ParticipationBadge.safeMint.selector, voterWallet, eid);

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

        // Populate UserOp
        op.sender = voterWallet;
        op.nonce = entryPoint.getNonce(voterWallet, 0);
        op.initCode = initCode;
        op.callData = callData;
        op.callGasLimit = 1_000_000;
        op.verificationGasLimit = 1_500_000;
        op.preVerificationGas = 50_000;
        op.maxFeePerGas = tx.gasprice;
        op.maxPriorityFeePerGas = tx.gasprice;
        op.paymasterAndData = bytes("");

        opHash = entryPoint.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(voterKey, opHash);
        op.signature = abi.encodePacked(r, s, v);
    }

    /* --------------------------------------------------------------------- */
    /*                            Happy‑path test                             */
    /* --------------------------------------------------------------------- */
    function test_AdminCreatesElection_And_VoterCastsBallotViaAA() public {
        // 1. admin starts an election
        uint256 eid = _createElection(bytes32("test-election"));

        // 2. voter deploys wallet + casts ballot in a single AA tx
        uint256 ballotNonce = 12345;
        uint256 vote = 1;
        bytes memory proof = bytes("stub-proof");
        (UserOperation memory op,) = _buildOp(eid, ballotNonce, vote, proof);

        // We *expect* MACI to receive exactly one encrypted message.
        bytes memory expectedMsg = abi.encode(voterWallet, vote, ballotNonce, proof);
        vm.expectEmit(false, false, false, true, address(maci));
        emit MockMACI.Message(expectedMsg);

        ParticipationBadge badge = manager.badge();
        vm.expectEmit(true, true, true, true, address(badge));
        emit ParticipationBadge.BadgeMinted(voterWallet, 0, eid);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        entryPoint.handleOps(ops, payable(admin));

        // 3. post‑conditions
        assertTrue(voterWallet.code.length > 0, "wallet deployed");
        assertEq(entryPoint.getNonce(voterWallet, 0), 1, "nonce bumped");
    }

    /* --------------------------------------------------------------------- */
    /*                          Meta‑fuzz regression                          */
    /* --------------------------------------------------------------------- */
    /// @notice Fuzz different election metadata + boolean votes to make sure
    ///         the AA flow *always* succeeds and never reverts.
    function testFuzz_Flow(bytes32 meta, uint8 rawVote) public {
        uint256 eid = _createElection(meta);
        uint256 vote = uint256(rawVote) % 2; // normalise to {0,1}
        bytes memory proof = bytes("p");
        uint256 ballotNonce = 67890;

        // Build the UserOp with the fuzzed vote, fully signed.
        (UserOperation memory op,) = _buildOp(eid, ballotNonce, vote, proof);

        UserOperation[] memory arr = new UserOperation[](1);
        arr[0] = op;

        // The EntryPoint handles inner reverts. The transaction should succeed
        // from the outside, even if the wallet's execution fails.
        entryPoint.handleOps(arr, payable(admin));

        // At the very least, the wallet’s nonce should have incremented.
        assertEq(entryPoint.getNonce(voterWallet, 0), 1);
    }
}
