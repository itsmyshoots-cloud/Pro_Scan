import fs from 'fs';

const file = 'src/App.jsx';
let source = fs.readFileSync(file, 'utf8');
const original = source;

const marker = "<div><span>Shift capacity</span><strong>";
const start = source.indexOf(marker);
if (start === -1) throw new Error('Daily shift capacity summary anchor not found.');
const valueStart = start + marker.length;
const valueEnd = source.indexOf('</strong></div>', valueStart);
if (valueEnd === -1) throw new Error('Daily shift capacity summary value end not found.');

const replacement = "{(Array.isArray(hourlyTargets)?hourlyTargets:[]).reduce((sum,row)=>sum+Math.max(0,Math.floor(Number(row.planned_qty)||0)),0).toLocaleString()}";
source = source.slice(0, valueStart) + replacement + source.slice(valueEnd);

if (source === original) throw new Error('Daily shift capacity patch made no changes.');
fs.writeFileSync(file, source);
console.log('Daily Plan shift capacity now follows the editable hourly quantities.');
