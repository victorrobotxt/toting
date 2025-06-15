const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recursive-circuit-'));

function testRecursive() {
  const dir = path.join(tmp, 'recursive');
  fs.mkdirSync(dir);
  run(`npx -y circom2 circuits/tally/recursive_batch_tally.circom --wasm --r1cs -o ${dir}`);
  const input = { A: Array.from({length:8},()=>Array(128).fill(0)), B: Array.from({length:8},()=>Array(128).fill(0)) };
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify(input));
  run(`node ${path.join(dir,'recursive_batch_tally_js/generate_witness.js')} ${path.join(dir,'recursive_batch_tally_js/recursive_batch_tally.wasm')} ${path.join(dir,'input.json')} ${path.join(dir,'witness.wtns')}`);
  run(`npx -y snarkjs wtns check ${path.join(dir,'recursive_batch_tally.r1cs')} ${path.join(dir,'witness.wtns')}`);
  console.log('recursive_batch_tally circuit verified');
}

try {
  testRecursive();
} catch (e) {
  console.error(e);
  process.exit(1);
}
