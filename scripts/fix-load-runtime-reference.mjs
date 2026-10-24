import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// The generated App has accumulated several build-time layers. Remove the
// ambiguous short identifier `load` from the production workspace and use a
// uniquely named plan refresh function instead. This prevents a stale patch
// layer or scope transform from leaving a ReferenceError after login.
const replacements=[
  [/const load=async\(\)=>/g,'const refreshPlans=async()=>'],
  [/\{load,refreshMonitoring,refreshPlanMetrics,/g,'{refreshPlans,refreshMonitoring,refreshPlanMetrics,'],
  [/void load\(\)/g,'void refreshPlans()'],
  [/await load\(\)/g,'await refreshPlans()']
];
for(const [pattern,replacement] of replacements)source=source.replace(pattern,replacement);

fs.writeFileSync(file,source);
console.log('Runtime plan refresh reference renamed from load to refreshPlans.');
