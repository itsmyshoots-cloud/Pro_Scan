import fs from 'fs';

const file = 'src/App.jsx';
let source = fs.readFileSync(file, 'utf8');
const original = source;

const replacements = [
  ["<span>Monthly planned</span>", "<span>Daily planned</span>"],
  ["<span>MONTHLY PLANNED</span>", "<span>DAILY PLANNED</span>"]
];

for (const [from, to] of replacements) {
  source = source.split(from).join(to);
}

// This patch is intentionally idempotent. The Daily Plan generator/v7 patch may
// already have changed the label before this script runs. In that case the
// build must continue instead of failing with a false "anchor not found" error.
const alreadyDaily = source.includes('<span>Daily planned</span>') || source.includes('<span>DAILY PLANNED</span>');

if (source === original && !alreadyDaily) {
  throw new Error('Daily summary label not found.');
}

if (source !== original) {
  fs.writeFileSync(file, source);
  console.log('Daily Plan summary label changed from Monthly planned to Daily planned.');
} else {
  console.log('Daily Plan summary label already set to Daily planned; nothing to change.');
}
