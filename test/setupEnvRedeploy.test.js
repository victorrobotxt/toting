const fs = require('fs');
const path = require('path');
const os = require('os');
const {execSync} = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appRoot = root;

const envFile = path.join(appRoot, '.env');
fs.writeFileSync(envFile, 'ORCHESTRATOR_KEY=0x01\nSOLANA_BRIDGE_SK=[]\n');

const deployedFile = path.join(appRoot, '.env.deployed');
fs.writeFileSync(deployedFile, 'ELECTION_MANAGER=0x0\nNEXT_PUBLIC_ELECTION_MANAGER=0x0\nNEXT_PUBLIC_WALLET_FACTORY=0x0\nNEXT_PUBLIC_ENTRYPOINT=0x0\n');

const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stubbin-'));
function writeStub(name, script){
  const p = path.join(binDir, name);
  fs.writeFileSync(p, script, {mode:0o755});
}
writeStub('cast', `#!/bin/bash
if [ "$1" = "block-number" ]; then echo 1; exit 0; fi
if [ "$1" = "code" ]; then
  if [ -f "${binDir}/deployed.log" ]; then echo 0xabc; else echo 0x; fi
  exit 0
fi
exit 0
`);
writeStub('forge', `#!/bin/bash
if [[ "$@" == *DeployEntryPoint* ]]; then
  echo "EntryPoint deployed at: 0xaaaa"; touch "${binDir}/deployed.log";
fi
if [[ "$@" == *DeployElectionManagerV2Script* ]]; then
  echo "ElectionManagerV2 proxy deployed to: 0xbbbb";
fi
if [[ "$@" == *DeployFactory* ]]; then
  echo "Factory deployed at: 0xcccc";
fi
exit 0
`);

const env = {...process.env, APP_ROOT: appRoot, PATH: `${binDir}:${process.env.PATH}`};
execSync('bash scripts/setup_env.sh anvil', {stdio:'inherit', env});

const contents = fs.readFileSync(deployedFile,'utf8');
assert(!contents.includes('NEXT_PUBLIC_ENTRYPOINT=0x0'), 'entrypoint not updated');
assert(!contents.includes('NEXT_PUBLIC_WALLET_FACTORY=0x0'), 'factory not updated');

console.log('setup_env redeploy test passed');

fs.rmSync(binDir, {recursive:true, force:true});
