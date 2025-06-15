#!/usr/bin/env python3
import json, os, subprocess, csv, time, tempfile

MANIFEST = "artifacts/manifest.json"
CURVES = ["bn254", "bls12-381"]
CONTRACTS = {
    "eligibility": "Verifier",
    "voice_check": "QVVerifier",
    "batch_tally": "TallyVerifier",
    "qv_tally": "TallyVerifier",
    "merkle": "Verifier",
}

ANVIL_RPC = "http://127.0.0.1:8545"
KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"


def start_anvil():
    proc = subprocess.Popen([
        "anvil", "--host", "127.0.0.1", "--port", "8545", "--silent"
    ])
    time.sleep(1)
    return proc


def deploy(contract):
    out = subprocess.check_output(
        [
            "forge", "create", f"contracts/{contract}.sol:{contract}",
            "--rpc-url", ANVIL_RPC,
            "--private-key", KEY,
            "--broadcast",
        ],
        text=True,
    )
    for line in out.splitlines():
        if line.startswith("Deployed to:"):
            return line.split()[-1]
    raise RuntimeError("deploy failed")


def estimate_gas(address):
    out = subprocess.check_output(
        [
            "cast", "estimate", address,
            "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[7])",
            "[0,0]", "[[0,0],[0,0]]", "[0,0]", "[0,0,0,0,0,0,0]",
            "--rpc-url", ANVIL_RPC,
        ],
        text=True,
    )
    return int(out.strip())


def proof_size(curve):
    return 256 if curve == "bn254" else 384


def main():
    with open(MANIFEST) as f:
        manifest = json.load(f)

    anvil = start_anvil()
    rows = []
    try:
        for circuit, info in manifest.items():
            contract = CONTRACTS.get(circuit)
            if not contract:
                continue
            address = deploy(contract)
            gas = estimate_gas(address)
            for curve in CURVES:
                if curve not in info:
                    continue
                zkey = info[curve]["zkey"]
                size = os.path.getsize(zkey)
                rows.append({
                    "circuit": circuit,
                    "curve": curve,
                    "zkey_bytes": size,
                    "proof_bytes": proof_size(curve),
                    "verify_gas": gas,
                })
    finally:
        anvil.terminate()
        anvil.wait()

    with open("compression.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print("Wrote compression.csv")


if __name__ == "__main__":
    main()
