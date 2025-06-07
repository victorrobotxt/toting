# services/orchestrator/main.py
import os
import time
import subprocess
import json
from web3 import Web3
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
    print(f"❌ ABI file not found at {ABI_PATH}. Make sure the volume is mounted.")
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
    """Polls efficiently for ElectionCreated(id=0) and returns its end block number."""
    print("Watching for ElectionCreated(id=0)...")
    last_scanned_block = 0
    while True:
        try:
            # More efficient polling: start from the block after the last one checked.
            current_head = w3.eth.block_number
            if current_head <= last_scanned_block:
                time.sleep(POLL_INTERVAL_S)
                continue

            event_filter = mgr.events.ElectionCreated.create_filter(fromBlock=last_scanned_block + 1)
            logs = event_filter.get_all_entries()

            if not logs:
                last_scanned_block = current_head
                print(f"... no 'ElectionCreated' events found up to block #{last_scanned_block}. Retrying in {POLL_INTERVAL_S}s.")
                time.sleep(POLL_INTERVAL_S)
                continue

            for raw_log in logs:
                try:
                    processed_log = mgr.events.ElectionCreated().process_log(raw_log)
                    if processed_log.args.id == 0:
                        # Assuming a fixed duration of 7200 blocks for the election
                        end_block = processed_log.blockNumber + 7200
                        print(f"🎯 Found election #0 in block {processed_log.blockNumber}. Voting ends at block #{end_block}")
                        return end_block
                except Exception:
                    continue
            
            # Update last scanned block to the latest log processed
            last_scanned_block = logs[-1].blockNumber

        except Exception as e:
            print(f"⚠️ An unexpected error occurred while polling for events: {e}")
            time.sleep(POLL_INTERVAL_S)


def get_tally_input(w3: Web3, mgr, election_id: int) -> dict:
    """
    Fetches all votes for an election and aggregates them for the tally circuit.
    
    TODO: This is a critical function to implement correctly.
    You must:
    1. Define a `VoteCast` event in your smart contract. e.g., `event VoteCast(uint256 indexed electionId, bool vote);`
    2. Filter for all instances of that event for the given `election_id`.
    3. Count the 'yes' and 'no' votes.
    4. Return a dictionary that matches the input format of your `qv_tally.circom` circuit.
    
    For now, this returns dummy data.
    """
    print("⚠️ Using DUMMY data for tally input. Implement `get_tally_input` for production.")
    # Example: fetch all `VoteCast` events from block 0 to 'latest'
    # event_filter = mgr.events.VoteCast.create_filter(fromBlock=0, argument_filters={'electionId': election_id})
    # all_votes = event_filter.get_all_entries()
    # yes_votes = sum(1 for vote in all_votes if vote.args.vote)
    # no_votes = len(all_votes) - yes_votes
    # return {"yes_votes": str(yes_votes), "no_votes": str(no_votes)}

    # Using dummy data that matches a potential circuit input structure
    return {"in": ["1", "2"]}


def run_snarkjs_proof(wasm_path, zkey_path, tally_input: dict):
    """Generates the ZK proof using snarkjs based on the provided input."""
    temp_dir = "/tmp/orchestrator_run"
    os.makedirs(temp_dir, exist_ok=True)
    
    tally_input_file = os.path.join(temp_dir, "tally_input.json")
    proof_file = os.path.join(temp_dir, "proof.json")
    public_file = os.path.join(temp_dir, "public.json")
    wtns_file = os.path.join(temp_dir, "tally.wtns")

    print(f"📝 Writing tally input to file: {json.dumps(tally_input)}")
    with open(tally_input_file, "w") as f:
        json.dump(tally_input, f)

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
    # The output is not valid JSON, it's a series of comma-separated stringified arrays.
    # We need to wrap it in brackets to make it a valid JSON array.
    params_str = out.decode().strip()
    params = json.loads(f"[{params_str}]")
    return (params[0], params[1], params[2], params[3])

def submit_tally(w3: Web3, mgr, acct, proof_data, election_id: int):
    """Submits the generated proof to the tallyVotes function."""
    a, b, c, pub = proof_data
    print(f"Submitting tally for election #{election_id}...")
    tx = mgr.functions.tallyVotes(election_id, a, b, c, pub).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "gas": 4_000_000, # Tallying can be gas-intensive
        "gasPrice": w3.eth.gas_price,
        "chainId": CHAIN_ID,
    })
    signed = acct.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction)
    print(f"📤 Submitted tallyVotes tx: {txh.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(txh)
    print(f"✅ Tally successfully recorded on-chain! Status: {receipt.status}")
    if receipt.status == 0:
        print("❌ Transaction reverted! Check contract logic and proof.")
        exit(1)

def main():
    w3 = connect_w3()
    mgr = w3.eth.contract(address=ELECTION_MANAGER_ADDR, abi=ELECTION_MANAGER_ABI)
    acct = w3.eth.account.from_key(PRIVATE_KEY)
    print(f"Orchestrator address: {acct.address}")

    end_block = wait_for_election_zero(w3, mgr)
    if end_block is None:
      print("❌ Could not find election #0. Exiting.")
      return

    while (current_block := w3.eth.block_number) < end_block:
        print(f"⏳ Election is open. Waiting for block {end_block}. (Current: {current_block}, {end_block - current_block} blocks left)")
        time.sleep(15)

    print("🗳️ Election ended. Preparing to tally votes...")
    
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
        print(f"❌ Missing proof artifacts at {wasm_path} or {zkey_path}.")
        exit(1)

    try:
        # Fetch real vote data to generate the proof for
        tally_input_data = get_tally_input(w3, mgr, 0)
        
        # Generate the proof
        proof_data = run_snarkjs_proof(wasm_path, zkey_path, tally_input_data)
        
        # Submit proof on-chain
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
