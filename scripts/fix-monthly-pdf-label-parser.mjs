import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const from='\\bP-\\d+\\b';
const to='\\b(?:P|U)-\\d+\\b';
const occurrences=Math.max(0,source.split(from).length-1);
if(!occurrences) throw new Error('Monthly PDF label regex not found.');
source=source.replaceAll(from,to);
fs.writeFileSync(file,source);
console.log(`PDF label parser updated: ${occurrences} label regex occurrence(s) now accept P- and U- labels.`);
