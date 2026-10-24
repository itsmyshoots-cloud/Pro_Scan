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

if (source === original) {
  throw new Error('Daily summary label not found.');
}

fs.writeFileSync(file, source);
console.log('Daily Plan summary label changed from Monthly planned to Daily planned.');
