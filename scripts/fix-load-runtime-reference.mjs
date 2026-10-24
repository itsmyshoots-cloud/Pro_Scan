import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// The App source has accumulated several build-time patches. Do not try to
// rename an existing loader and assume it is still in App scope: an earlier
// patch can leave a loader declaration inside another block. Instead, remove
// known loader declarations and install one canonical loader immediately
// inside App. This guarantees the identifier and its React state setters share
// the same lexical scope.
const loaderBody=/\s+const\s+(?:load|refreshPlans|__refreshProductionPlans)\s*=\s*async\s*\(\s*\)\s*=>\{try\{await supabase\.rpc\('ensure_production_carry_forward',\{p_target_date:localDateKey\(new Date\(\)\)\}\);\}catch\{\}\s*const \{data,error\}=await supabase\.from\('production_plans'\)\.select\('\*'\)\.order\('production_date',\{ascending:false\}\)\.limit\(200\);if\(error\)\{setMessage\(error\.message\);return;\}if\(data\)setPlans\(data\)\};?/g;
source=source.replace(loaderBody,'');

const appAnchor='export default function App({user}){';
if(!source.includes(appAnchor))throw new Error('App component anchor not found.');

const loader="\n const __refreshProductionPlans=async()=>{try{await supabase.rpc('ensure_production_carry_forward',{p_target_date:localDateKey(new Date())});}catch{} const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(200);if(error){setMessage(error.message);return;}if(data)setPlans(data)};\n";
source=source.replace(appAnchor,appAnchor+loader);

// Replace every runtime call produced by any previous loader patch.
source=source.replace(/\bload\s*\(\s*\)/g,'__refreshProductionPlans()');
source=source.replace(/\brefreshPlans\s*\(\s*\)/g,'__refreshProductionPlans()');

// Replace known bare dependency references left by earlier patches.
source=source.replace(/([,{\[]\s*)(?:load|refreshPlans)(\s*[,}\]])/g,'$1__refreshProductionPlans$2');
source=source.replace(/\b(?:load|refreshPlans)\s*:\s*(?=\b)/g,'__refreshProductionPlans:');

// The canonical declaration must exist directly inside App, and no old loader
// call may remain. If these checks fail, refuse the build instead of shipping
// another runtime ReferenceError.
if(!source.includes('const __refreshProductionPlans=async()=>')){
  throw new Error('Plan loader fix failed: canonical loader was not installed inside App.');
}
if(/\b(?:load|refreshPlans)\s*\(\s*\)/.test(source)){
  throw new Error('Plan loader fix failed: legacy loader call remains.');
}

fs.writeFileSync(file,source);
console.log('Canonical production plan loader installed directly inside App; legacy load/refreshPlans calls normalized.');
