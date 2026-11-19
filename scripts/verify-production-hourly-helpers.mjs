import fs from 'node:fs';

const appPath = 'src/App.jsx';
const source = fs.readFileSync(appPath, 'utf8');

const required = [
  'function getPlanHours(',
  'function getPlanHourlyRate('
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error('Missing shared production helper: ' + token);
  }
}

for (const legacy of [/\\bplanHours\\s*\\(/, /\\bplanHourlyRate\\s*\\(/]) {
  if (legacy.test(source)) {
    throw new Error('Legacy component-scoped hourly helper reference remains: ' + legacy);
  }
}

console.log('Production hourly helper check passed: shared helpers exist and no legacy references remain.');
