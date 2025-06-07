# scripts/create_election.py
import os
from web3 import Web3
from eth_account import Account

EVM_RPC      = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
EM_ADDR      = Web3.to_checksum_address(os.environ["ELECTION_MANAGER"])
PRIVATE_KEY  = os.environ["ORCHESTRATOR_KEY"]

# minimal ABI for createElection
ABI = [{
    "inputs":[{"internalType":"bytes32","name":"meta","type":"bytes32"}],
    "name":"createElection","outputs":[],"stateMutability":"nonpayable","type":"function"
}]

w3 = Web3(Web3.HTTPProvider(EVM_RPC))
mgr = w3.eth.contract(address=EM_ADDR, abi=ABI)
acct = Account.from_key(PRIVATE_KEY)

# pick any 32-byte metadata (just for demo we hash a string)
meta = w3.keccak(text="Pilot Election #0")

tx = mgr.functions.createElection(meta).build_transaction({
    "from": acct.address,
    "nonce": w3.eth.get_transaction_count(acct.address),
    "gas": 200_000,
    "gasPrice": w3.to_wei("1", "gwei"),
})
signed = acct.sign_transaction(tx)
txh = w3.eth.send_raw_transaction(signed.rawTransaction)
rcpt = w3.eth.wait_for_transaction_receipt(txh)
print("✅ createElection tx:", txh.hex(), "block", rcpt.blockNumber)
