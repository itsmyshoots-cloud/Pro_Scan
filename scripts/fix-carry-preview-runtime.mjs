import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const marker='function planCarryPreviewFallback(plan){';
if(!source.includes(marker)){
  const helper=`\nfunction planCarryPreviewFallback(plan){\n const quantity=Math.max(0,Number(plan?.carry_forward_qty||0));\n return {quantity,rate:0,hours:0,capacity:0,start:0,end:0,chain:[]};\n}\n`;
  const anchor='export default function App({user}){';
  if(!source.includes(anchor)) throw new Error('App component anchor not found.');
  source=source.replace(anchor,helper+'\n'+anchor);
}
source=source.replace(/\bplanCarryPreview\s*\(/g,'planCarryPreviewFallback(');
fs.writeFileSync(file,source);
console.log('Added safe carry-forward preview fallback.');
