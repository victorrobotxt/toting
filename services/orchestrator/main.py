# services/orchestrator/main.py
import os
import time
import subprocess
from web3 import Web3
from web3.exceptions import LogTopicError

EVM_RPC      = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
FACTORY_ADDR = Web3.to_checksum_address(os.environ["ELECTION_MANAGER"])
PRIVATE_KEY  = os.environ["ORCHESTRATOR_KEY"]
CHAIN_ID     = int(os.getenv("CHAIN_ID", "1337"))
# paths—tweak to your repo layout:
CIRCUIT_WASM = "./circuits/tally.wasm"
CIRCUIT_R1CS = "./circuits/tally.r1cs"
ZKEY_FILE    = "./circuits/tally_final.zkey"
PTAU_FILE    = "./circuits/pot12_final.ptau"

# Minimal ABI for ElectionManager events & tallyVotes
ELECTION_MANAGER_ABI = [
    {
      "anonymous": False,
      "inputs":[
        {"indexed":False, "internalType":"uint256","name":"id","type":"uint256"},
        {"indexed":False, "internalType":"bytes32","name":"meta","type":"bytes32"}
      ],
      "name":"ElectionCreated","type":"event"
    },
    {
      "anonymous":False,
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


def connect_w3() -> Web3:
    """Try to connect to the EVM provider until it is reachable."""
    for _ in range(20):
        w3 = Web3(Web3.HTTPProvider(EVM_RPC))
        if w3.is_connected():
            return w3
        print("⏳ waiting for anvil…")
        time.sleep(3)
    raise RuntimeError("EVM RPC not reachable")



def wait_for_election_end(w3, mgr):
    # pull *all* logs for this contract
    all_logs = w3.eth.get_logs({
        "fromBlock": 0,
        "toBlock": "latest",
        "address": mgr.address
    })

    # try to decode only the ElectionCreated ones
    created_events = []
    for log in all_logs:
        try:
            ev = mgr.events.ElectionCreated().process_log(log)
            created_events.append(ev)
        except LogTopicError:
            continue

    if not created_events:
        raise RuntimeError("No ElectionCreated events found")

    # find the one with id == 0
    first = next((e for e in created_events if e["args"]["id"] == 0), None)
    if first is None:
        raise RuntimeError("No election #0 found")

    end_block = first["blockNumber"] + 7200
    print(f"🎯 Election 0 ends at block #{end_block}")
    while w3.eth.block_number < end_block:
        print(f"⏳ block {w3.eth.block_number}/{end_block}")
        time.sleep(5)
    return end_block

def run_snarkjs_proof():
    # 1) generate witness
    subprocess.run([
      "snarkjs","wtns","calculate",
      CIRCUIT_WASM, "./circuits/tally_input.json", "./circuits/tally.wtns"
    ], check=True)
    # 2) generate proof
    subprocess.run([
      "snarkjs","groth16","prove",
      ZKEY_FILE, "./circuits/tally.wtns", "./circuits/proof.json", "./circuits/public.json"
    ], check=True)
    # 3) export calldata
    out = subprocess.check_output([
      "snarkjs","groth16","exportsoliditycalldata",
      "--public", "./circuits/public.json", "./circuits/proof.json"
    ])
    return out.decode().strip()

def submit_tally(w3, mgr, acct, calldata):
    # parse calldata into Python lists
    parts = calldata.replace(" ", "").split("],")
    a = eval(parts[0] + "]")
    b = eval(parts[1] + "]]")
    c = eval(parts[2] + "]")
    pub = eval(parts[3] + "]")
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
    mgr = w3.eth.contract(address=FACTORY_ADDR, abi=ELECTION_MANAGER_ABI)
    acct = w3.eth.account.from_key(PRIVATE_KEY)

    end_block = wait_for_election_end(w3, mgr)
    print("🔐 running ZK proof…")
    calldata = run_snarkjs_proof()
    print("📋 calldata:", calldata[:80], "…")
    submit_tally(w3, mgr, acct, calldata)

if __name__=="__main__":
    main()
