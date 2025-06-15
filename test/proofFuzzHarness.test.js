const { execSync } = require('child_process');

try {
  execSync('FUZZ_ITERS=1 node scripts/proof_fuzz_harness.js', { stdio: 'inherit' });
  console.log('proof fuzz harness test passed');
} catch (e) {
  console.error('fuzz harness failed', e);
  process.exit(1);
}
