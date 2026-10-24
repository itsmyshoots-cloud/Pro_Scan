import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// The production-planning feature has accumulated several build-time patches.
// Some of those patches previously inserted helpers into the wrong lexical
// scope, producing browser ReferenceErrors such as planCapacity and load /
// refreshPlans being undefined. Install one canonical set of helpers directly
// inside App and route all affected calls to those names.

const appAnchor='export default function App({user}){';
if(!source.includes(appAnchor))throw new Error('App component anchor not found.');

// Remove the known legacy plan-loader declarations before installing the
// canonical one. The loader body is intentionally matched exactly so that
// unrelated declarations are never removed.
const loaderBody=/\s+const\s+(?:load|refreshPlans|__refreshProductionPlans)\s*=\s*async\s*\(\s*\)\s*=>\{try\{await supabase\.rpc\('ensure_production_carry_forward',\{p_target_date:localDateKey\(new Date\(\)\)\}\);\}catch\{\}\s*const \{data,error\}=await supabase\.from\('production_plans'\)\.select\('\*'\)\.order\('production_date',\{ascending:false\}\)\.limit\(200\);if\(error\)\{setMessage\(error\.message\);return;\}if\(data\)setPlans\(data\)\};?/g;
source=source.replace(loaderBody,'');

// Route every legacy call to a unique identifier that cannot collide with a
// helper inserted by another patch layer.
source=source.replace(/\bload\s*\(\s*\)/g,'__refreshProductionPlans()');
source=source.replace(/\brefreshPlans\s*\(\s*\)/g,'__refreshProductionPlans()');
source=source.replace(/([,{\[]\s*)(?:load|refreshPlans)(\s*[,}\]])/g,'$1__refreshProductionPlans$2');

// Route the carry-forward helpers to unique App-local names. The old helper
// declarations may remain elsewhere, but they are no longer referenced.
source=source.replace(/\bplanCapacity\s*\(/g,'__planCapacity(');
source=source.replace(/\bplanRequirement\s*\(/g,'__planRequirement(');
source=source.replace(/\bplanCarryForward\s*\(/g,'__planCarryForward(');
source=source.replace(/\bplanCarryPreviewFallback\s*\(/g,'__planCarryPreviewFallback(');

const canonicalHelpers=`\n // Canonical production-planning helpers. These are deliberately declared at the top of App so every JSX block, hook and callback in App resolves the same lexical binding.\n const __refreshProductionPlans=async()=>{try{await supabase.rpc('ensure_production_carry_forward',{p_target_date:localDateKey(new Date())});}catch{} const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(200);if(error){setMessage(error.message);return;}if(data)setPlans(data)};\n const __planCapacity=plan=>Number(plan?.shift_planned_qty??plan?.planned_qty??0);\n const __planRequirement=plan=>Number(plan?.planned_qty||0);\n const __planCarryForward=plan=>{const explicit=Number(plan?.carry_forward_qty||0);return explicit>0?explicit:Math.max(0,__planRequirement(plan)-__planCapacity(plan));};\n const __planCarryPreviewFallback=plan=>{const quantity=Math.max(0,Number(plan?.carry_forward_qty||0));return {quantity,rate:0,hours:0,capacity:0,start:0,end:0,chain:[]};};\n`;
source=source.replace(appAnchor,appAnchor+canonicalHelpers);

// A final source-level guard. We intentionally check the exact canonical
// declarations, not merely the identifier appearing somewhere in the file.
for(const name of ['__refreshProductionPlans','__planCapacity','__planRequirement','__planCarryForward','__planCarryPreviewFallback']){
 if(!source.includes(`const ${name}=`))throw new Error(`Canonical helper ${name} was not installed inside App.`);
}
if(/\b(?:load|refreshPlans)\s*\(\s*\)/.test(source))throw new Error('Legacy load/refreshPlans call remains.');
if(/\bplanCapacity\s*\(/.test(source))throw new Error('Legacy planCapacity call remains.');
if(/\bplanRequirement\s*\(/.test(source))throw new Error('Legacy planRequirement call remains.');
if(/\bplanCarryForward\s*\(/.test(source))throw new Error('Legacy planCarryForward call remains.');
if(/\bplanCarryPreviewFallback\s*\(/.test(source))throw new Error('Legacy carry-preview helper call remains.');

fs.writeFileSync(file,source);
console.log('Canonical production-planning helpers installed directly inside App; legacy helper references normalized.');
