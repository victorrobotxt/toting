#!/usr/bin/env python3
import json
from pathlib import Path

# load address from broadcast file

def load_address(path):
    file = Path(path) / 'run-latest.json'
    if not file.exists():
        raise SystemExit(f"missing {file}")
    data = json.loads(file.read_text())
    txs = data.get('transactions') or []
    if not txs:
        raise SystemExit(f"no transactions in {file}")
    return txs[-1]['contractAddress']

factory = load_address('broadcast/DeployFactory.s.sol/31337')
manager = load_address('broadcast/DeployElectionManager.s.sol/31337')

# zero address default for entrypoint
entrypoint = '0x' + '0'*40
print(f"NEXT_PUBLIC_ENTRYPOINT={entrypoint}")
print(f"NEXT_PUBLIC_WALLET_FACTORY={factory}")
print(f"NEXT_PUBLIC_ELECTION_MANAGER={manager}")
print(f"ELECTION_MANAGER={manager}")
