#!/usr/bin/env python3
import os
import sys
import requests
from web3 import Web3
from eth_account import Account

# ── CONFIG ───────────────────────────────────────────────────────
BACKEND = os.getenv("BACKEND", "http://127.0.0.1:8000")
ANVIL   = os.getenv("ANVIL",   "http://127.0.0.1:8545")
FACTORY_ADDRESS = os.getenv("FACTORY_ADDRESS")
if not FACTORY_ADDRESS:
    print("❌ please set FACTORY_ADDRESS")
    sys.exit(1)

FACTORY_ADDRESS = Web3.to_checksum_address(FACTORY_ADDRESS)

print(f"Using factory address (checksummed): {FACTORY_ADDRESS}")

# Use Anvil's default first private key so it's funded out of the box
PRIVATE_KEY = os.getenv("PRIVATE_KEY",
    "0x59c6995e998f97a5a0044966f0945382fdbd5656656b4e3934e658449e610ba3"
)

FACTORY_ABI = [
    {
        "inputs":[
            {"internalType":"uint256[2]","name":"a","type":"uint256[2]"},
            {"internalType":"uint256[2][2]","name":"b","type":"uint256[2][2]"},
            {"internalType":"uint256[2]","name":"c","type":"uint256[2]"},
            {"internalType":"uint256[]","name":"pubSignals","type":"uint256[]"},
            {"internalType":"address","name":"owner","type":"address"}
        ],
        "name":"mintWallet",
        "outputs":[{"internalType":"address","name":"wallet","type":"address"}],
        "stateMutability":"nonpayable","type":"function"
    },
    {
        "anonymous":False,
        "inputs":[
            {"indexed":True,"internalType":"address","name":"owner","type":"address"},
            {"indexed":True,"internalType":"address","name":"wallet","type":"address"}
        ],
        "name":"WalletMinted","type":"event"
    }
]
# ── END CONFIG ───────────────────────────────────────────────────

# 1. Auth flow: fetch the initiate URL without following redirects
init_url = f"{BACKEND}/auth/initiate"
print(f"→ GET {init_url}")
r = requests.get(init_url, allow_redirects=False, timeout=3)
print("  status:", r.status_code)
if r.status_code in (301,302,303,307,308):
    print("  redirect →", r.headers.get("location"))
else:
    print("❌ expected a redirect; got body:", r.text)
    sys.exit(1)

# 2. Simulate callback (we ignore failure)
callback_url = f"{BACKEND}/auth/callback"
print(f"→ GET {callback_url}?code=dummy")
try:
    r2 = requests.get(callback_url, params={"code":"dummy"}, timeout=3)
    print("  callback status:", r2.status_code, "body:", r2.text)
except Exception as e:
    print("  callback failed (ignored):", e)

# 3. Connect to Anvil
w3 = Web3(Web3.HTTPProvider(ANVIL))
acct = Account.from_key(PRIVATE_KEY)
print("Using account", acct.address)

# 4. Instantiate factory contract
factory = w3.eth.contract(address=FACTORY_ADDRESS, abi=FACTORY_ABI)

# 5. Dummy proof inputs
a = [0, 0]
b = [[0, 0], [0, 0]]
c = [0, 0]
pubSignals = []

gas_price = w3.to_wei("1", "gwei")
tx = factory.functions.mintWallet(a, b, c, pubSignals, acct.address).build_transaction(
    {"from": acct.address,
     "nonce": w3.eth.get_transaction_count(acct.address),
     "gas": 5_000_000,
     "gasPrice": gas_price}
)
signed  = acct.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
print("  tx hash", tx_hash.hex())
rcpt = w3.eth.wait_for_transaction_receipt(tx_hash)
print("  receipt status", rcpt.status)

# 7. Decode the WalletMinted event
events = factory.events.WalletMinted().process_receipt(rcpt)
if not events:
    print("❌ no WalletMinted event")
    sys.exit(1)

print("✅ new wallet =", events[0]["args"]["wallet"])
