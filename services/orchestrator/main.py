# services/orchestrator/main.py
import os
import time
import subprocess
import json
from web3 import Web3
# FIX: Correct import path for web3.py v6+
from web3.middleware import geth_poa_middleware
from eth_account import Account

# --- Configuration ---
EVM_RPC = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
MAX_RETRIES = int(os.getenv("EVM_MAX_RETRIES", "0")) # 0 means wait forever
ELECTION_MANAGER_ADDR = Web3.to_checksum_address(os.environ["ELECTION_MANAGER"])
PRIVATE_KEY = os.environ["ORCHESTRATOR_KEY"]
CHAIN_ID = int(os.getenv("CHAIN_ID", "31337"))
POLL_INTERVAL_S = 10
CURVE = os.environ.get("CURVE", "bn254")
MANIFEST_PATH = "/app/artifacts/manifest.json"


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
                    continue

            print(f"... all events processed, but election #0 not found. Retrying in {POLL_INTERVAL_S}s.")
            time.sleep(POLL_INTERVAL_S)

        except Exception as e:
            print(f"⚠️ An unexpected error occurred while polling for events: {e}")
            time.sleep(POLL_INTERVAL_S)


def run_snarkjs_proof(wasm_path, zkey_path):
    """Generates the ZK proof using snarkjs."""
    temp_dir = "/tmp/orchestrator_run"
    os.makedirs(temp_dir, exist_ok=True)
    
    tally_input_file = os.path.join(temp_dir, "tally_input.json")
    proof_file = os.path.join(temp_dir, "proof.json")
    public_file = os.path.join(temp_dir, "public.json")
    wtns_file = os.path.join(temp_dir, "tally.wtns")

    with open(tally_input_file, "w") as f:
        f.write('{"in": [1, 2]}')  # Dummy input, replace with real data logic

    print("🧠 Generating witness...")
    subprocess.run(
        ["snarkjs", "wtns", "calculate", wasm_path, tally_input_file, wtns_file],
        check=True, capture_output=True, text=True
    )
    print("🔐 Generating proof...")
    subprocess.run(
        ["snarkjs", "groth16", "prove", zkey_path, wtns_file, proof_file, public_file],
        check=True, capture_output=True, text=True
    )
    print("📋 Exporting calldata...")
    out = subprocess.check_output(
        ["snarkjs", "groth16", "exportsoliditycalldata", public_file, proof_file]
    )
    params_str = out.decode().replace(' ', '').replace('\n', '')
    params = json.loads(f"[{params_str}]")
    return (params[0], params[1], params[2], params[3])

def submit_tally(w3: Web3, mgr, acct, proof_data, election_id: int):
    """Submits the generated proof to the tallyVotes function."""
    a, b, c, pub = proof_data
    print(f"Submitting tally for election #{election_id}...")
    tx = mgr.functions.tallyVotes(election_id, a, b, c, pub).build_transaction({
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
    
    print(f"Loading manifest from {MANIFEST_PATH} for curve {CURVE}...")
    if not os.path.exists(MANIFEST_PATH):
        print(f"❌ Manifest file not found at {MANIFEST_PATH}")
        exit(1)
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    
    circuit_name = "qv_tally"
    if circuit_name not in manifest or CURVE not in manifest[circuit_name]:
        print(f"❌ Circuit '{circuit_name}' for curve '{CURVE}' not found in manifest.")
        exit(1)

    circuit_paths = manifest[circuit_name][CURVE]
    wasm_path = os.path.join("/app", circuit_paths["wasm"])
    zkey_path = os.path.join("/app", circuit_paths["zkey"])

    if not os.path.exists(wasm_path) or not os.path.exists(zkey_path):
        print(f"❌ Missing proof artifacts. Checked for WASM at {wasm_path} and ZKEY at {zkey_path}.")
        print("Ensure you have run the circuit build process and the artifacts volume is mounted correctly.")
        exit(1)

    try:
        proof_data = run_snarkjs_proof(wasm_path, zkey_path)
        submit_tally(w3, mgr, acct, proof_data, 0)
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
