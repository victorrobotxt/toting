#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const { readFileSync, writeFileSync, mkdtempSync, existsSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { ethers, HDNodeWallet } = require('ethers');

function run(cmd, args, capture = false) {
  const opts = capture ? { encoding: 'utf8' } : { stdio: 'inherit' };
  const res = spawnSync(cmd, args, opts);
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
  return capture ? res.stdout : '';
}

(async () => {
  const mnemonic = readFileSync('mnemonic.txt', 'utf8').trim();
  const anvil = spawn('anvil', [
    '--host',
    '127.0.0.1',
    '--port',
    '8545',
    '--mnemonic',
    mnemonic,
  ]);
  anvil.stdout.on('data', (d) => process.stdout.write(d));
  anvil.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((r) => setTimeout(r, 1000));

  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const wallet = HDNodeWallet.fromPhrase(mnemonic).connect(provider);

  const artifactPath = 'out/QVVerifier.sol/QVVerifier.json';
  if (!existsSync(artifactPath)) {
    run('forge', ['build', '--silent']);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    wallet,
  );
  const verifier = await factory.deploy();
  await verifier.waitForDeployment();
  console.log('Verifier deployed at', await verifier.getAddress());

  // Compile the circuit to ensure a valid wasm file
  const circuitDir = mkdtempSync(join(tmpdir(), 'vc-circuit-'));
  run('npx', ['-y', 'circom2', 'circuits/qv/voice_check.circom', '--wasm', '--r1cs', '-o', circuitDir]);
  const wasm = join(circuitDir, 'voice_check_js/voice_check.wasm');
  const zkey = 'proofs/voice_check_final.zkey';
  if (!existsSync(zkey)) {
    run('bash', ['scripts/fetch_voice_keys.sh', 'proofs']);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'vc-'));
  const input = {
    credits: [0, 1, 4, 9, 16, 25, 36, 49, 64, 81],
    credit_sqrts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    limit: 50,
  };
  const inputFile = join(tmp, 'input.json');
  const wtns = join(tmp, 'witness.wtns');
  const proofFile = join(tmp, 'proof.json');
  const publicFile = join(tmp, 'public.json');
  writeFileSync(inputFile, JSON.stringify(input));

  run('npx', ['-y', 'snarkjs', 'wtns', 'calculate', wasm, inputFile, wtns]);
  run('npx', ['-y', 'snarkjs', 'groth16', 'prove', zkey, wtns, proofFile, publicFile]);
  const cd = run(
    'npx',
    ['-y', 'snarkjs', 'zkey', 'export', 'soliditycalldata', publicFile, proofFile],
    true,
  ).trim();
  const [a, b, c, inputs] = JSON.parse('[' + cd + ']');

  const ok = await verifier.verifyProof(a, b, c, inputs);
  console.log('verifyProof(valid) =>', ok);
  if (!ok) {
    console.error('Expected proof to be valid');
    process.exitCode = 1;
  }

  inputs[0] = (BigInt(inputs[0]) + 1n).toString();
  const bad = await verifier.verifyProof(a, b, c, inputs);
  console.log('verifyProof(tampered) =>', bad);
  if (bad) {
    console.error('Tampered proof unexpectedly verified');
    process.exitCode = 1;
  }

  anvil.kill('SIGINT');
})();
