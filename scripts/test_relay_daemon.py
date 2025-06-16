import os
import json
import time
import subprocess
import base64
import pytest
from web3 import Web3
from eth_account import Account

try:
    from solana.publickey import PublicKey
    from solana.rpc.api import Client
except Exception:  # pragma: no cover - optional dependency
    pytest.skip("solana package not available", allow_module_level=True)

EVM_RPC = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
SOLANA_RPC = os.getenv("SOLANA_RPC", "http://localhost:8899")
MANAGER_ADDR = Web3.to_checksum_address(os.environ["ELECTION_MANAGER"])
PRIVATE_KEY = os.environ["ORCHESTRATOR_KEY"]

# Load ElectionManager ABI
with open(os.path.join("out", "ElectionManagerV2.sol", "ElectionManagerV2.json")) as f:
    MANAGER_ABI = json.load(f)["abi"]

# Load Solana IDL to get program id
IDL_PATH = os.path.join("solana-programs", "election", "target", "idl", "election_mirror.json")
with open(IDL_PATH) as f:
    idl = json.load(f)
PROGRAM_ID = PublicKey(idl["metadata"]["address"])

w3 = Web3(Web3.HTTPProvider(EVM_RPC))
acct = Account.from_key(PRIVATE_KEY)
manager = w3.eth.contract(address=MANAGER_ADDR, abi=MANAGER_ABI)

# Helper to deploy via forge create and return address
def forge_create(identifier, *args):
    cmd = ["forge", "create", identifier, "--rpc-url", EVM_RPC, "--private-key", PRIVATE_KEY]
    if args:
        cmd += ["--constructor-args", *args]
    out = subprocess.check_output(cmd)
    for line in out.decode().splitlines():
        if line.startswith("Deployed to:"):
            return Web3.to_checksum_address(line.split()[2])
    raise RuntimeError(f"Address not found in output: {out}")

def main():
    # Deploy always-true verifier and strategy
    verifier = forge_create("test/integration/FullFlow.t.sol:TestTallyVerifier")
    strategy = forge_create("contracts/strategies/QuadraticVotingStrategy.sol:QuadraticVotingStrategy", verifier)

    # Create election with this strategy
    meta = w3.keccak(text="RelayE2E")
    tx = manager.functions.createElection(meta, strategy).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "gas": 500000,
        "gasPrice": w3.to_wei(1, "gwei"),
        "chainId": w3.eth.chain_id,
    })
    signed = acct.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction)
    rcpt = w3.eth.wait_for_transaction_receipt(txh)
    eid = manager.functions.nextId().call() - 1
    print(f"Created election {eid} at block {rcpt.blockNumber}")

    # Trigger tallyVotes with dummy proof which strategy echoes back
    a = [0,0]
    b = [[0,0],[0,0]]
    c = [0,0]
    A = 42
    B = 7
    pub = [A,B,0,0,0,0,0]
    tx = manager.functions.tallyVotes(eid, a, b, c, pub).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "gas": 1000000,
        "gasPrice": w3.to_wei(1, "gwei"),
        "chainId": w3.eth.chain_id,
    })
    signed = acct.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction)
    rcpt = w3.eth.wait_for_transaction_receipt(txh)
    print("tallyVotes tx mined", txh.hex())

    block_hash = rcpt.blockHash.hex()
    seed = [b"election", bytes.fromhex(block_hash[2:])]
    pda, _ = PublicKey.find_program_address(seed, PROGRAM_ID)

    client = Client(SOLANA_RPC)
    for _ in range(30):
        resp = client.get_account_info(pda)
        val = resp.get("result", {}).get("value")
        if val:
            data = base64.b64decode(val["data"][0])
            votes_a = int.from_bytes(data[72:80], "little")
            votes_b = int.from_bytes(data[80:88], "little")
            if votes_a == A and votes_b == B:
                print("✅ Relay success. votesA", votes_a, "votesB", votes_b)
                return
        time.sleep(2)
    raise SystemExit("❌ Timed out waiting for Solana tally")

if __name__ == "__main__":
    main()
