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
// Avoid a separate local helper for scanned counts: evaluate it in the row's App scope.
source=source.replace(/\bplanScannedCount\s*\(\s*plan\s*\)/g,"((Array.isArray(monitoringSerials)?monitoringSerials:[]).filter(row=>row.plan_id===plan?.id&&row.status==='scanned').length)");
if(/\bplanScannedCount\s*\(/.test(source))throw new Error('Legacy planScannedCount call remains in final source.');
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
// PROSCAN_CANONICAL_PLAN_HELPERS_END
`;

source=source.replace(appAnchor,pureHelpers+'\n'+appAnchor+`
 // App-local loader only: it updates React state owned by App.
 const __refreshProductionPlans=async()=>{try{await supabase.rpc('ensure_production_carry_forward',{p_target_date:localDateKey(new Date())});}catch{} const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(200);if(error){setMessage(error.message);return;}if(data)setPlans(data)};
`);

// Serial uploads and previews belong only in Monthly Plan editing.
const uploadIndex=source.indexOf("<div className='upload'><h3>Supplier serial-number file</h3>");
if(uploadIndex>=0){
 const previewIndex=source.indexOf("{rows.length>0&&<section className='preview-panel'>",uploadIndex);
 const previewEndMarker="</section>}";
 const previewEnd=previewIndex<0?-1:source.indexOf(previewEndMarker,previewIndex);
 const actionsIndex=previewEnd<0?-1:source.indexOf("\n <div className='actions'>",previewEnd+previewEndMarker.length);
 if(previewIndex<0||previewEnd<0||actionsIndex<0)throw new Error('Could not safely remove the legacy supplier serial-upload block.');
 source=source.slice(0,uploadIndex)+"{/* Serial allocation and quantity changes are managed from Monthly Plan. */}\n"+source.slice(actionsIndex);
}
source=source.replace("Set the production shift and hourly targets, then allocate a matching supplier serial batch. Only Draft plans can be edited.","Set the production shift and hourly targets. Serial numbers are managed only from Monthly Plan editing. Only Draft plans can be edited.");
source=source.replace("onClick={()=>{setEditingPlanId('');setView(editingPlanId?'manage':'dashboard');setMessage('');}}","onClick={()=>{const wasEditing=Boolean(editingPlanId);setEditingPlanId('');setView(wasEditing?'daily-planner':'dashboard');setMessage('');if(wasEditing)void loadDailyPlansList();}}");

for(const name of ['__planCapacity','__planRequirement','__planCarryForward','__planCarryPreviewFallback']){
 if(name==='__planCarryPreviewFallback') { if(!source.includes('function __planCarryPreviewFallback('))throw new Error('Module-scoped carry-preview helper was not installed.'); } else if(!source.includes(`function ${name}(`))throw new Error(`Module-scoped canonical helper ${name} was not installed.`);
}
if(!source.includes('const __refreshProductionPlans=async()=>'))throw new Error('Canonical App-local plan loader was not installed.');
if(source.includes("<div className='upload'><h3>Supplier serial-number file</h3>"))throw new Error('Legacy supplier upload remains in the generic plan editor.');
if(/\bplanScannedCount\s*\(/.test(source))throw new Error('Unresolved planScannedCount remains.');
if(/\b(?:load|refreshPlans)\s*\(\s*\)/.test(source))throw new Error('Legacy load/refreshPlans call remains.');
if(/\bplanCapacity\s*\(/.test(source))throw new Error('Legacy planCapacity call remains.');
if(/\bplanRequirement\s*\(/.test(source))throw new Error('Legacy planRequirement call remains.');
if(/\bplanCarryForward\s*\(/.test(source))throw new Error('Legacy planCarryForward call remains.');
if(/\bplanCarryPreviewFallback\s*\(/.test(source))throw new Error('Legacy carry-preview helper call remains.');

fs.writeFileSync(file,source);
console.log('Module-scoped planning helpers and a single App-local plan loader installed.');
