import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const from='const planCarryPreview=plan=>{';
const to='let planCarryPreview=plan=>{';
if(!source.includes(from)) throw new Error('planCarryPreview declaration not found');
source=source.replace(from,to);
fs.writeFileSync(file,source);
console.log('Carry-forward preview reassignment fixed.');
