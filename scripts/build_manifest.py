#!/usr/bin/env python3
import hashlib, json, os, subprocess, glob, sys

ARTIFACTS_DIR = "artifacts"
PTAU_FILE = os.environ.get("PTAU_FILE", "pot12_final.ptau")
CURVE = os.environ.get("CURVE", "bn254").lower()

manifest = {}
had_error = False
manifest_file = os.path.join(ARTIFACTS_DIR, "manifest.json")
if os.path.exists(manifest_file):
    with open(manifest_file) as f:
        manifest = json.load(f)

for cfile in glob.glob("circuits/**/*.circom", recursive=True):
    with open(cfile, "rb") as f:
        h = hashlib.sha256(f.read()).hexdigest()
    name = os.path.splitext(os.path.basename(cfile))[0]
    out_dir = os.path.join(ARTIFACTS_DIR, CURVE, name, h)
    os.makedirs(out_dir, exist_ok=True)
    r1cs = os.path.join(out_dir, f"{name}.r1cs")
    wasm = os.path.join(out_dir, f"{name}.wasm")
    zkey = os.path.join(out_dir, f"{name}.zkey")
    if not os.path.exists(r1cs) or not os.path.exists(wasm):
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
    if os.path.exists(PTAU_FILE) and not os.path.exists(zkey):
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

os.makedirs(ARTIFACTS_DIR, exist_ok=True)
with open(manifest_file, "w") as f:
    json.dump(manifest, f, indent=2)
print("Wrote", manifest_file)
if had_error:
    sys.exit(1)
