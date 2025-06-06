# services/orchestrator/main.py
import os
import time
import subprocess
import json
from web3 import Web3
# --- FIX: Use the correct import path for web3.py v6.x ---
from web3.middleware.geth import geth_poa_middleware
from eth_account import Account

# --- Configuration ---
EVM_RPC = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
MAX_RETRIES = int(os.getenv("EVM_MAX_RETRIES", "0")) # 0 means wait forever
ELECTION_MANAGER_ADDR = Web3.to_checksum_address(os.environ["ELECTION_MANAGER"])
PRIVATE_KEY = os.environ["ORCHESTRATOR_KEY"]
CHAIN_ID = int(os.getenv("CHAIN_ID", "31337"))
POLL_INTERVAL_S = 10

# Paths for ZK proof generation
CIRCUIT_DIR = "/app/circuits" # Use absolute path inside container
TALLY_INPUT_FILE = os.path.join(CIRCUIT_DIR, "tally_input.json")
TALLY_WASM_FILE = os.path.join(CIRCUIT_DIR, "qv", "qv_tally.wasm")
TALLY_ZKEY_FILE = os.path.join(CIRCUIT_DIR, "qv_tally_final.zkey")
PROOF_FILE = os.path.join(CIRCUIT_DIR, "proof.json")
PUBLIC_FILE = os.path.join(CIRCUIT_DIR, "public.json")
WTNS_FILE = os.path.join(CIRCUIT_DIR, "tally.wtns")

# --- Load full ABI from the mounted artifact ---
ABI_PATH = os.path.join(os.path.dirname(__file__), 'ElectionManagerV2.json')
print(f"Attempting to load ABI from {ABI_PATH}")
if not os.path.exists(ABI_PATH):
    print(f"❌ ABI file not found at {ABI_PATH}. Make sure the volume is mounted and the setup script ran successfully.")
    exit(1)

with open(ABI_PATH) as f:
    artifact = json.load(f)
    ELECTION_MANAGER_ABI = artifact['abi']
print("✅ ABI loaded successfully.")

def connect_w3() -> Web3:
    """Connect to the EVM provider, waiting if necessary."""
    w3 = Web3(Web3.HTTPProvider(EVM_RPC))
    # Inject the PoA middleware to connect to Anvil/Hardhat
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    retries = 0
    while not w3.is_connected():
        retries += 1
        print(f"⏳ Waiting for EVM RPC at {EVM_RPC}...")
        time.sleep(3)
        if 0 < MAX_RETRIES <= retries:
            raise ConnectionError(f"EVM RPC not reachable after {retries} retries.")
    print("✅ Connected to EVM RPC.")
    return w3

def wait_for_election_zero(w3: Web3, mgr) -> int | None:
    """Polls for ElectionCreated(id=0) and returns its end block number."""
    print("Watching for ElectionCreated(id=0)...")
    while True:
        try:
            event_filter = mgr.events.ElectionCreated.create_filter(fromBlock=0)
            logs = event_filter.get_all_entries()

            if not logs:
                print(f"... no 'ElectionCreated' events found yet. Retrying in {POLL_INTERVAL_S}s.")
                time.sleep(POLL_INTERVAL_S)
                continue

            for raw_log in logs:
                try:
                    processed_log = mgr.events.ElectionCreated().process_log(raw_log)
                    if processed_log.args.id == 0:
                        end_block = processed_log.blockNumber + 7200
                        print(f"🎯 Found election #0 in block {processed_log.blockNumber}. Voting ends at block #{end_block}")
                        return end_block
                except Exception:
                    # This log doesn't match the 'ElectionCreated' event, which can happen
                    # if another contract emits a log with a colliding topic hash (very rare)
                    # or if the ABI is still mismatched. We can safely ignore and continue.
                    continue

            print(f"... all events processed, but election #0 not found. Retrying in {POLL_INTERVAL_S}s.")
            time.sleep(POLL_INTERVAL_S)

        except Exception as e:
            print(f"⚠️ An unexpected error occurred while polling for events: {e}")
            time.sleep(POLL_INTERVAL_S)


def run_snarkjs_proof():
    """Generates the ZK proof using snarkjs."""
    # (This function is a placeholder and may need real inputs)
    print("🧠 Generating witness...")
    subprocess.run(
        ["snarkjs", "wtns", "calculate", TALLY_WASM_FILE, TALLY_INPUT_FILE, WTNS_FILE],
        check=True, capture_output=True, text=True
    )
    print("🔐 Generating proof...")
    subprocess.run(
        ["snarkjs", "groth16", "prove", TALLY_ZKEY_FILE, WTNS_FILE, PROOF_FILE, PUBLIC_FILE],
        check=True, capture_output=True, text=True
    )
    print("📋 Exporting calldata...")
    out = subprocess.check_output(
        ["snarkjs", "groth16", "exportsoliditycalldata", PUBLIC_FILE, PROOF_FILE]
    )
    # snarkjs output is not clean JSON and needs careful parsing
    params = json.loads(f"[{out.decode().replace(' ', '')}]")
    return (params[0], params[1], params[2], params[3])

def submit_tally(w3: Web3, mgr, acct, proof_data):
    """Submits the generated proof to the tallyVotes function."""
    a, b, c, pub = proof_data
    tx = mgr.functions.tallyVotes(a, b, c, pub).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "gas": 4_000_000,
        "gasPrice": w3.to_wei("1", "gwei"),
        "chainId": CHAIN_ID,
    })
    signed = acct.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.raw_transaction)
    print("📤 Submitted tallyVotes tx:", txh.hex())
    w3.eth.wait_for_transaction_receipt(txh)
    print("✅ Tally successfully recorded on-chain!")

def main():
    w3 = connect_w3()
    mgr = w3.eth.contract(address=ELECTION_MANAGER_ADDR, abi=ELECTION_MANAGER_ABI)
    acct = w3.eth.account.from_key(PRIVATE_KEY)

    end_block = wait_for_election_zero(w3, mgr)

    while (current_block := w3.eth.block_number) < end_block:
        print(f"⏳ Election is open. Waiting for block {end_block}. (Current: {current_block})")
        time.sleep(15)

    print("🗳️ Election ended. Generating ZK proof for tally...")
    if not os.path.exists(TALLY_INPUT_FILE):
        with open(TALLY_INPUT_FILE, "w") as f:
            f.write('{"in": [1, 2]}')  # Dummy input, replace with real data logic

    try:
        proof_data = run_snarkjs_proof()
        submit_tally(w3, mgr, acct, proof_data)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"❌ Failed to generate or submit proof: {e}")
        if isinstance(e, subprocess.CalledProcessError):
            print("--- snarkjs stdout ---")
            print(e.stdout)
            print("--- snarkjs stderr ---")
            print(e.stderr)
        return

    print("🎉 Tally process complete. Orchestrator can now exit.")

if __name__ == "__main__":
    main()
