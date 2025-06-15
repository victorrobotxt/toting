const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('circuits/**/*.circom', {
  ignore: ['circuits/circomlib/**', 'circuits/eligibility/circuits/circomlib/**']
});

let found = false;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (/MiMC/i.test(src)) {
    console.error(`MiMC reference found in ${f}`);
    found = true;
  }
}
if (found) {
  process.exit(1);
} else {
  console.log('No MiMC references found');
}
