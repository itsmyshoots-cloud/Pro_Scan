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

if (!source.includes("Actual produced:")) {
  throw new Error('Hourly production Details must show actual produced quantity per hour.');
}
if (source.includes("<div><span>Batch requirement</span>")) {
  throw new Error('Batch Requirement metric must stay hidden in production Details.');
}

console.log('Production Details check passed: shared hourly helpers, per-hour actual output, and no Batch Requirement metric.');
