import fs from 'node:fs';

const source = fs.readFileSync('src/App.jsx', 'utf8');

for (const token of ['function getPlanHours(', 'function getPlanHourlyRate(']) {
  if (!source.includes(token)) {
    throw new Error('Missing shared production helper: ' + token);
  }
}

for (const legacyCall of ['planHours(', 'planHourlyRate(']) {
  if (source.includes(legacyCall)) {
    throw new Error('Legacy component-scoped hourly helper reference remains: ' + legacyCall);
  }
}

console.log('Production hourly helper check passed: shared helpers exist and no legacy references remain.');
