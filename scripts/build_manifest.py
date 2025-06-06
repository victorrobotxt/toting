#!/usr/bin/env python3
import argparse
import glob
import hashlib
import json
import os
import subprocess
import sys

ARTIFACTS_DIR = "artifacts"
PTAU_FILE = os.environ.get("PTAU_FILE", "pot12_final.ptau")
CURVE = os.environ.get("CURVE", "bn254").lower()

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true", help="only check manifest")
args = parser.parse_args()

had_error = False
manifest_file = os.path.join(ARTIFACTS_DIR, "manifest.json")
existing_manifest = {}
if os.path.exists(manifest_file):
    with open(manifest_file) as f:
        existing_manifest = json.load(f)

manifest = json.loads(json.dumps(existing_manifest))

for cfile in glob.glob("circuits/**/*.circom", recursive=True):
    with open(cfile, "rb") as f:
        h = hashlib.sha256(f.read()).hexdigest()
    name = os.path.splitext(os.path.basename(cfile))[0]
    out_dir = os.path.join(ARTIFACTS_DIR, CURVE, name, h)
    os.makedirs(out_dir, exist_ok=True)
    r1cs = os.path.join(out_dir, f"{name}.r1cs")
    wasm = os.path.join(out_dir, f"{name}.wasm")
    zkey = os.path.join(out_dir, f"{name}.zkey")
    if not args.dry_run and (not os.path.exists(r1cs) or not os.path.exists(wasm)):
        try:
            subprocess.run(
                [
                    "npx",
                    "-y",
                    "circom2",
                    cfile,
                    "--r1cs",
                    "--wasm",
                    "--sym",
                    "-o",
                    out_dir,
                ],
                check=True,
            )
        except subprocess.CalledProcessError:
            print(f"skip {cfile}: circom compilation failed")
            had_error = True
            continue
    if not args.dry_run and os.path.exists(PTAU_FILE) and not os.path.exists(zkey):
        try:
            subprocess.run(
                [
                    "npx",
                    "-y",
                    "snarkjs",
                    "groth16",
                    "setup",
                    r1cs,
                    PTAU_FILE,
                    zkey,
                ],
                check=True,
            )
        except subprocess.CalledProcessError:
            print(f"skip {cfile}: snarkjs setup failed")
            had_error = True
            continue
    manifest.setdefault(name, {})[CURVE] = {
        "hash": h,
        "r1cs": r1cs,
        "wasm": wasm,
        "zkey": zkey,
    }

if args.dry_run:
    if manifest != existing_manifest:
        print("Manifest out of date. Expected:")
        print(json.dumps(manifest, indent=2))
        sys.exit(1)
    print("manifest up-to-date")
else:
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    with open(manifest_file, "w") as f:
        json.dump(manifest, f, indent=2)
    print("Wrote", manifest_file)
    if had_error:
        sys.exit(1)
