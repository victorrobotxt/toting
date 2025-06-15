const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'range32-'));
  const circuitPath = path.join(__dirname, '..', 'circuits', 'gadgets', 'range32.circom');

  run(`npx -y circom2 ${circuitPath} --wasm --r1cs -o ${tmp}`);

  const wasm = path.join(tmp, 'range32_js', 'range32.wasm');
  const gen = path.join(tmp, 'range32_js', 'generate_witness.js');
  const r1cs = path.join(tmp, 'range32.r1cs');
  const inputFile = path.join(tmp, 'input.json');
  const witness = path.join(tmp, 'witness.wtns');

  const MAX = 2 ** 32 - 1;
  const NUM_RUNS = 50;
  let falseNeg = 0;
  let falsePos = 0;

  for (let i = 0; i < NUM_RUNS; i++) {
    const val = Math.floor(Math.random() * (MAX + 1));
    fs.writeFileSync(inputFile, JSON.stringify({ value: val }));
    try {
      run(`node ${gen} ${wasm} ${inputFile} ${witness}`);
      run(`npx -y snarkjs wtns check ${r1cs} ${witness}`);
    } catch (e) {
      falseNeg++;
    }
  }

  for (let i = 0; i < NUM_RUNS; i++) {
    const val = MAX + 1 + Math.floor(Math.random() * 100000);
    fs.writeFileSync(inputFile, JSON.stringify({ value: val }));
    let passed = true;
    try {
      run(`node ${gen} ${wasm} ${inputFile} ${witness}`);
      run(`npx -y snarkjs wtns check ${r1cs} ${witness}`);
    } catch (e) {
      passed = false;
    }
    if (passed) falsePos++;
  }

  if (falseNeg !== 0 || falsePos !== 0) {
    console.error(`falseNeg=${falseNeg} falsePos=${falsePos}`);
    process.exit(1);
  }

  console.log('signal range fuzz test passed');
})();
