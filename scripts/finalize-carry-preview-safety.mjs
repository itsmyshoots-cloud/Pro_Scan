import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// Final safety net: the legacy carry-forward preview is no longer part of the
// visible production-planning flow. Some older patch layers can still leave a
// reference behind. Keep a harmless top-level implementation so the workspace
// can never fail during render because of an undefined preview helper.
const marker='function planCarryPreview(plan){';
if(!source.includes(marker)){
  const helper=`\nfunction planCarryPreview(plan){\n const quantity=Math.max(0,Number(plan?.carry_forward_qty||0));\n return {quantity,rate:0,hours:0,capacity:0,start:0,end:0,chain:[]};\n}\n`;
  const anchor='export default function App({user}){';
  if(!source.includes(anchor)) throw new Error('App component anchor not found.');
  source=source.replace(anchor,helper+'\n'+anchor);
}

// The old v4 layer can attempt to wrap/reassign the helper. Make that wrapper
// harmless if it remains in the generated source.
source=source.replace(/\bconst basePlanCarryPreview=planCarryPreview;/g,"const basePlanCarryPreview=typeof planCarryPreview==='function'?planCarryPreview:null;");
source=source.replace(/\bconst result=basePlanCarryPreview\(plan\);/g,"const result=basePlanCarryPreview?basePlanCarryPreview(plan):null;");

fs.writeFileSync(file,source);
console.log('Final carry-forward preview safety applied.');
