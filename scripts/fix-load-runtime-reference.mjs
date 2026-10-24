import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

const appAnchor='export default function App({user}){';
if(!source.includes(appAnchor))throw new Error('App component anchor not found.');

// Remove the previous in-App helper block if the script is run repeatedly.
// Pure planning helpers are now module-scoped, so every component callback,
// render path and helper patched into App resolves the same binding.
source=source.replace(/\n\/\* PROSCAN_CANONICAL_PLAN_HELPERS_START \*\/[\s\S]*?\/\* PROSCAN_CANONICAL_PLAN_HELPERS_END \*\/\n/g,'\n');
source=source.replace(/\n\s*const __planCapacity=plan=>Number\(plan\?\.shift_planned_qty\?\?plan\?\.planned_qty\?\?0\);/g,'');
source=source.replace(/\n\s*const __planRequirement=plan=>Number\(plan\?\.planned_qty\|\|0\);/g,'');
source=source.replace(/\n\s*const __planCarryForward=plan=>\{const explicit=Number\(plan\?\.carry_forward_qty\|\|0\);return explicit>0\?explicit:Math\.max\(0,__planRequirement\(plan\)-__planCapacity\(plan\)\);\};/g,'');
source=source.replace(/\n\s*const __planCarryPreviewFallback=plan=>\{const quantity=Math\.max\(0,Number\(plan\?\.carry_forward_qty\|\|0\)\);return \{quantity,rate:0,hours:0,capacity:0,start:0,end:0,chain:\[\]\};\};/g,'');

// Remove legacy loader definitions that were previously inserted at the
// wrong point in App. The one replacement below installs a single loader
// inside App, where setPlans/setMessage are available.
const loaderBody=/\s+const\s+(?:load|refreshPlans|__refreshProductionPlans)\s*=\s*async\s*\(\s*\)\s*=>\{try\{await supabase\.rpc\('ensure_production_carry_forward',\{p_target_date:localDateKey\(new Date\(\)\)\}\);\}catch\{\}\s*const \{data,error\}=await supabase\.from\('production_plans'\)\.select\('\*'\)\.order\('production_date',\{ascending:false\}\)\.limit\(200\);if\(error\)\{setMessage\(error\.message\);return;\}if\(data\)setPlans\(data\)\};?/g;
source=source.replace(loaderBody,'');

source=source.replace(/\bload\s*\(\s*\)/g,'__refreshProductionPlans()');
source=source.replace(/\brefreshPlans\s*\(\s*\)/g,'__refreshProductionPlans()');
source=source.replace(/([,{\[]\s*)(?:load|refreshPlans)(\s*[,}\]])/g,'$1__refreshProductionPlans$2');

// Route all legacy planning-helper calls to canonical names.
source=source.replace(/\bplanCapacity\s*\(/g,'__planCapacity(');
source=source.replace(/\bplanRequirement\s*\(/g,'__planRequirement(');
source=source.replace(/\bplanCarryForward\s*\(/g,'__planCarryForward(');
source=source.replace(/\bplanCarryPreviewFallback\s*\(/g,'__planCarryPreviewFallback(');

const pureHelpers=`
// PROSCAN_CANONICAL_PLAN_HELPERS_START
// Module-scoped declarations prevent ReferenceErrors from patched JSX/functions.
function __planCapacity(plan){return Number(plan?.shift_planned_qty??plan?.planned_qty??0);}
function __planRequirement(plan){return Number(plan?.planned_qty||0);}
function __planCarryForward(plan){const explicit=Number(plan?.carry_forward_qty||0);return explicit>0?explicit:Math.max(0,__planRequirement(plan)-__planCapacity(plan));}
function __planCarryPreviewFallback(plan){const quantity=Math.max(0,Number(plan?.carry_forward_qty||0));return {quantity,rate:0,hours:0,capacity:0,start:0,end:0,chain:[]};}
// PROSCAN_CANONICAL_PLAN_HELPERS_END
`;

source=source.replace(appAnchor,pureHelpers+'\n'+appAnchor+`
 // App-local loader only: it updates React state owned by App.
 const __refreshProductionPlans=async()=>{try{await supabase.rpc('ensure_production_carry_forward',{p_target_date:localDateKey(new Date())});}catch{} const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(200);if(error){setMessage(error.message);return;}if(data)setPlans(data)};
`);

for(const name of ['__planCapacity','__planRequirement','__planCarryForward','__planCarryPreviewFallback']){
 if(!source.includes(`function ${name}(`))throw new Error(`Module-scoped canonical helper ${name} was not installed.`);
}
if(!source.includes('const __refreshProductionPlans=async()=>'))throw new Error('Canonical App-local plan loader was not installed.');
if(/\b(?:load|refreshPlans)\s*\(\s*\)/.test(source))throw new Error('Legacy load/refreshPlans call remains.');
if(/\bplanCapacity\s*\(/.test(source))throw new Error('Legacy planCapacity call remains.');
if(/\bplanRequirement\s*\(/.test(source))throw new Error('Legacy planRequirement call remains.');
if(/\bplanCarryForward\s*\(/.test(source))throw new Error('Legacy planCarryForward call remains.');
if(/\bplanCarryPreviewFallback\s*\(/.test(source))throw new Error('Legacy carry-preview helper call remains.');

fs.writeFileSync(file,source);
console.log('Module-scoped planning helpers and a single App-local plan loader installed.');
