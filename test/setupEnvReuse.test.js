const fs = require('fs');
const path = require('path');
const os = require('os');
const {execSync} = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appLink = '/app';
try {
  if (!fs.existsSync(appLink)) {
    fs.symlinkSync(root, appLink);
  }
} catch (e) {
  console.error('Failed to create /app symlink', e);
  process.exit(1);
}

const envFile = path.join(appLink, '.env');
fs.writeFileSync(envFile, 'ORCHESTRATOR_KEY=0x01\n');

const deployedFile = path.join(appLink, '.env.deployed');
const ADDR_ENTRY = '0x1111111111111111111111111111111111111111';
const ADDR_MGR = '0x2222222222222222222222222222222222222222';
const ADDR_FACTORY = '0x3333333333333333333333333333333333333333';
fs.writeFileSync(deployedFile, `ELECTION_MANAGER=${ADDR_MGR}\nNEXT_PUBLIC_ELECTION_MANAGER=${ADDR_MGR}\nNEXT_PUBLIC_WALLET_FACTORY=${ADDR_FACTORY}\nNEXT_PUBLIC_ENTRYPOINT=${ADDR_ENTRY}\n`);

const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stubbin-'));
function writeStub(name, script){
  const p = path.join(binDir, name);
  fs.writeFileSync(p, script, {mode:0o755});
}
writeStub('cast', `#!/bin/bash
if [ "$1" = "block-number" ]; then echo 1; exit 0; fi
if [ "$1" = "code" ]; then echo 0xabc; exit 0; fi
if [ "$1" = "wallet" ]; then echo 0xdeadbeef; exit 0; fi
exit 0
`);
writeStub('forge', `#!/bin/bash
echo forge $@ >>${binDir}/forge.log
exit 0
`);

const env = {...process.env, PATH: `${binDir}:${process.env.PATH}`};
try {
  execSync('bash scripts/setup_env.sh anvil', {stdio:'inherit', env});
} catch (e) {
  console.error('setup_env.sh failed', e);
  process.exit(1);
}

const contents = fs.readFileSync(deployedFile,'utf8');
assert(contents.includes(`NEXT_PUBLIC_ENTRYPOINT=${ADDR_ENTRY}`), 'entrypoint changed');
assert(contents.includes(`NEXT_PUBLIC_ELECTION_MANAGER=${ADDR_MGR}`), 'manager changed');
assert(contents.includes(`NEXT_PUBLIC_WALLET_FACTORY=${ADDR_FACTORY}`), 'factory changed');

console.log('setup_env reuse test passed');

fs.rmSync(binDir, {recursive:true, force:true});
fs.unlinkSync(appLink);
