const { createFFmpeg } = require('@ffmpeg/ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ffmpeg = createFFmpeg({ log: false });

const circuits = [
  { name: 'eligibility', r1cs: path.join(__dirname, '..', 'eligibility.r1cs') },
  { name: 'voice_check', r1cs: path.join(__dirname, '..', 'voice_check.r1cs') },
  { name: 'batch_tally', r1cs: path.join(__dirname, '..', 'batch_tally.r1cs') },
  { name: 'qv_tally', r1cs: path.join(__dirname, '..', 'qv_tally.r1cs') },
];

const ITERS = parseInt(process.env.FUZZ_ITERS || '1000', 10);

async function fuzzCircuit(c) {
  console.log(`\n→ Fuzzing ${c.name}`);
  for (let i = 0; i < ITERS; i++) {
    await ffmpeg.run('-f', 'lavfi', '-i', 'anoisesrc=d=0.01', '-frames:a', '1', 'noise.raw');
    const data = ffmpeg.FS('readFile', 'noise.raw');
    const wtnsFile = path.join(__dirname, '..', 'cache', `${c.name}_${i}.wtns`);
    fs.writeFileSync(wtnsFile, Buffer.from(data));
    let ok = false;
    try {
      execSync(`npx -y snarkjs wtns check ${c.r1cs} ${wtnsFile}`, { stdio: 'pipe' });
      ok = true;
    } catch (_) {
      // expected failure
    }
    fs.unlinkSync(wtnsFile);
    ffmpeg.FS('unlink', 'noise.raw');
    if (ok) throw new Error(`Verifier accepted invalid witness for ${c.name}`);
  }
  console.log(`✔ ${c.name} reverted on all invalid witnesses`);
}

(async () => {
  await ffmpeg.load();
  for (const c of circuits) {
    await fuzzCircuit(c);
  }
})();
