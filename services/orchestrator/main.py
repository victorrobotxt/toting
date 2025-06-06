# services/orchestrator/main.py
import os
import time
import subprocess
import json
from web3 import Web3
from web3.exceptions import LogTopicError
from eth_account import Account

EVM_RPC      = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
MAX_RETRIES  = int(os.getenv("EVM_MAX_RETRIES", "20"))
ELECTION_MANAGER_ADDR = Web3.to_checksum_address(os.environ["ELECTION_MANAGER"])
PRIVATE_KEY  = os.environ["ORCHESTRATOR_KEY"]
CHAIN_ID     = int(os.getenv("CHAIN_ID", "31337"))

# paths—these are placeholders for the real proof generation logic
CIRCUIT_WASM = "./circuits/tally.wasm"
CIRCUIT_R1CS = "./circuits/tally.r1cs"
ZKEY_FILE    = "./circuits/tally_final.zkey"
PTAU_FILE    = "./circuits/pot12_final.ptau"

# Minimal ABI for ElectionManager events & tallyVotes
ELECTION_MANAGER_ABI = json.loads("""
[
    {
      "anonymous": false,
      "inputs":[
        {"indexed":false, "internalType":"uint256","name":"id","type":"uint256"},
        {"indexed":false, "internalType":"bytes32","name":"meta","type":"bytes32"}
      ],
      "name":"ElectionCreated","type":"event"
    },
    {
      "anonymous":false,
      "inputs":[
        {"indexed":False,"internalType":"uint256","name":"A","type":"uint256"},
        {"indexed":False,"internalType":"uint256","name":"B","type":"uint256"}
      ],
      "name":"Tally","type":"event"
    },
    {
      "inputs":[
        {"internalType":"uint256[2]","name":"a","type":"uint256[2]"},
        {"internalType":"uint256[2][2]","name":"b","type":"uint256[2][2]"},
        {"internalType":"uint256[2]","name":"c","type":"uint256[2]"},
        {"internalType":"uint256[7]","name":"pubSignals","type":"uint256[7]"}
      ],
      "name":"tallyVotes","outputs":[],"stateMutability":"nonpayable","type":"function"
    }
]
""")


def connect_w3() -> Web3:
    """Try to connect to the EVM provider until it is reachable."""
    retries = 0
    w3 = Web3(Web3.HTTPProvider(EVM_RPC))
    while not w3.is_connected():
        retries += 1
        print("⏳ waiting for anvil…")
        time.sleep(3)
        if 0 < MAX_RETRIES <= retries:
            raise RuntimeError(f"EVM RPC not reachable at {EVM_RPC}")
    return w3


def wait_for_election_end(w3, mgr):
    """
    Waits for election #0 to be created, then waits for its voting period to end.
    Returns the end block number if found, otherwise loops.
    """
    event_filter = mgr.events.ElectionCreated.create_filter(fromBlock='earliest')
    
    print("Watching for ElectionCreated(id=0)...")
    while True:
        logs = event_filter.get_new_entries()
        for event in logs:
            if event['args']['id'] == 0:
                end_block = event['blockNumber'] + 7200
                print(f"🎯 Election 0 found! Ends at block #{end_block}")
                while w3.eth.block_number < end_block:
                    print(f"⏳ block {w3.eth.block_number}/{end_block}")
                    time.sleep(5)
                return end_block
        time.sleep(5) # Wait before polling for new events again

def run_snarkjs_proof():
    # 1) generate witness
    subprocess.run([
      "snarkjs","wtns","calculate",
      CIRCUIT_WASM, "./circuits/tally_input.json", "./circuits/tally.wtns"
    ], check=True, capture_output=True)
    # 2) generate proof
    subprocess.run([
      "snarkjs","groth16","prove",
      ZKEY_FILE, "./circuits/tally.wtns", "./circuits/proof.json", "./circuits/public.json"
    ], check=True, capture_output=True)
    # 3) export calldata
    out = subprocess.check_output([
      "snarkjs","groth16","exportsoliditycalldata",
      "./circuits/public.json", "./circuits/proof.json"
    ])
    # snarkjs output is not clean JSON, requires manual parsing
    # "0x...", [["0x...", "0x..."], ...
    calldata_str = out.decode().replace('"', '').replace('\n', '').replace(' ', '')
    parts = calldata_str.split('],[')
    a_str = parts[0].lstrip('[')
    b_str = parts[1]
    c_str = parts[2]
    pub_str = parts[3].rstrip(']]')
    
    a = [int(x, 16) for x in a_str.split(',')]
    b_nested = [p.strip('[]').split(',') for p in b_str.split('],[')]
    b = [[int(x, 16) for x in inner] for inner in b_nested]
    c = [int(x, 16) for x in c_str.split(',')]
    pub = [int(x, 16) for x in pub_str.split(',')]

    return a, b, c, pub

def submit_tally(w3, mgr, acct, proof_data):
    a, b, c, pub = proof_data
    tx = mgr.functions.tallyVotes(a,b,c,pub).build_transaction({
      "from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address),
      "gas": 4_000_000, "gasPrice": w3.to_wei("1","gwei"), "chainId": CHAIN_ID
    })
    signed = acct.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction)
    print("📤 submitted tallyVotes tx:", txh.hex())
    w3.eth.wait_for_transaction_receipt(txh)
    print("✅ Tally on-chain!")

def main():
    w3 = connect_w3()
    mgr = w3.eth.contract(address=ELECTION_MANAGER_ADDR, abi=ELECTION_MANAGER_ABI)
    acct = w3.eth.account.from_key(PRIVATE_KEY)

    print("Orchestrator started, watching for election #0...")
    
    # This main loop will wait until an election is found and tallied
    while True:
        end_block = wait_for_election_end(w3, mgr)
        if end_block is None:
            time.sleep(10)
            continue
        
        print("🔐 Election ended. Generating ZK proof…")
        # NOTE: This uses dummy proof inputs. You'll need to fetch real ballot data.
        if not os.path.exists("./circuits/tally_input.json"):
             with open("./circuits/tally_input.json", "w") as f:
                 f.write('{"in": [1, 2]}') # dummy input
        
        proof_data = run_snarkjs_proof()
        calldata_str = str(proof_data)[:80] + "..."
        print(f"📋 calldata: {calldata_str}")
        submit_tally(w3, mgr, acct, proof_data)
        break # Exit after successfully tallying the first election

if __name__=="__main__":
    main()
