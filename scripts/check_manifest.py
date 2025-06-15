import hashlib, json, glob, os, sys

MANIFEST_PATH = os.path.join('artifacts', 'manifest.json')

with open(MANIFEST_PATH) as f:
    manifest = json.load(f)

current = {}
for cfile in glob.glob('circuits/**/*.circom', recursive=True):
    with open(cfile, 'rb') as f:
        h = hashlib.sha256(f.read()).hexdigest()
    name = os.path.splitext(os.path.basename(cfile))[0]
    out_dir = os.path.join('artifacts', name, h)
    current[name] = {
        'hash': h,
        'r1cs': f'{out_dir}/{name}.r1cs',
        'wasm': f'{out_dir}/{name}.wasm',
        'zkey': f'{out_dir}/{name}.zkey',
    }

if current != manifest:
    print('Manifest out of date. Expected:')
    print(json.dumps(current, indent=2))
    print('\nFound:')
    print(json.dumps(manifest, indent=2))
    sys.exit(1)
print('manifest up-to-date')
