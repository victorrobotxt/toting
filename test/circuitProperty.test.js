const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-test-'));

function testVoice() {
  const dir = path.join(tmp, 'voice');
  fs.mkdirSync(dir);
  run(`npx -y circom2 circuits/qv/voice_check.circom --wasm --r1cs -o ${dir}`);
  const input = {
    credits: [0,1,4,9,16,25,36,49,64,81],
    credit_sqrts: [0,1,2,3,4,5,6,7,8,9],
    limit: 50
  };
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify(input));
  run(`node ${path.join(dir,'voice_check_js/generate_witness.js')} ${path.join(dir,'voice_check_js/voice_check.wasm')} ${path.join(dir,'input.json')} ${path.join(dir,'witness.wtns')}`);
  run(`npx -y snarkjs wtns check ${path.join(dir,'voice_check.r1cs')} ${path.join(dir,'witness.wtns')}`);
  console.log('voice_check circuit verified');
}

function testTally() {
  const dir = path.join(tmp, 'tally');
  fs.mkdirSync(dir);
  run(`npx -y circom2 circuits/qv/qv_tally.circom --wasm --r1cs -o ${dir}`);
  const input = { sums: [0,1,4], results: [0,1,2] };
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify(input));
  run(`node ${path.join(dir,'qv_tally_js/generate_witness.js')} ${path.join(dir,'qv_tally_js/qv_tally.wasm')} ${path.join(dir,'input.json')} ${path.join(dir,'witness.wtns')}`);
  run(`npx -y snarkjs wtns check ${path.join(dir,'qv_tally.r1cs')} ${path.join(dir,'witness.wtns')}`);
  console.log('qv_tally circuit verified');
}

try {
  testVoice();
  testTally();
} catch (e) {
  console.error(e);
  process.exit(1);
}
