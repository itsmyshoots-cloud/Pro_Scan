import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// The Monthly Plan UI is injected earlier in prebuild. Do not test for the
// identifier alone: action markup can reference it before its React state exists.
const stateDeclaration=/const\s*\[monthlyLockedIds\s*,\s*setMonthlyLockedIds\]\s*=\s*useState\(/;
if(!stateDeclaration.test(source)){
 const stateAnchor=" const [statusUpdatingId,setStatusUpdatingId]=useState('');";
 if(!source.includes(stateAnchor))throw new Error('App state anchor for Monthly Plan lock state not found.');
 source=source.replace(stateAnchor,stateAnchor+" const [monthlyLockedIds,setMonthlyLockedIds]=useState(()=>new Set());");
}

const loaderAnchor=" const loadMonthlyPlans=async()=>{";
// Define a uniquely named edit-reset callback in the final prebuild pass.
const resetMarker='const resetMonthlyPlanEditFromRuntimeFix=';
if(!source.includes(resetMarker)){
 const resetHelper=" const resetMonthlyPlanEditFromRuntimeFix=()=>{setMonthlyEditingId('');setMonthlyRows([]);setMonthlyFile('');setMonthlyForm({plan_month:new Date().toISOString().slice(0,7),brand:'',product_name:'',model:'',mrp:''});setMonthlyMessage('Monthly Plan editing cancelled.');};\n";
 source=source.replace(loaderAnchor,resetHelper+loaderAnchor);
 source=source.replaceAll('cancelMonthlyPlanEdit','resetMonthlyPlanEditFromRuntimeFix');
}

if(!source.includes(loaderAnchor))throw new Error('Monthly loader anchor not found.');
if(!source.includes('const refreshMonthlyPlanLocks=async()=>')){
 const helper=" const refreshMonthlyPlanLocks=async()=>{try{const poolRows=[];for(let from=0;;from+=500){const {data,error}=await supabase.from('monthly_plan_serials').select('monthly_plan_id,serial_number').not('serial_number','is',null).range(from,from+499);if(error)throw error;poolRows.push(...(data||[]));if(!data||data.length<500)break;}const usedSerials=new Set();for(let from=0;;from+=500){const {data,error}=await supabase.from('plan_serials').select('serial_number').not('serial_number','is',null).range(from,from+499);if(error)throw error;for(const row of data||[]){const key=String(row.serial_number||'').trim().toUpperCase();if(key)usedSerials.add(key);}if(!data||data.length<500)break;}const locked=new Set();for(const row of poolRows){const key=String(row.serial_number||'').trim().toUpperCase();if(key&&usedSerials.has(key)&&row.monthly_plan_id)locked.add(String(row.monthly_plan_id));}setMonthlyLockedIds(locked);}catch(error){setMonthlyMessage('Could not check Monthly Plan locks: '+(error?.message||String(error)));}};\n useEffect(()=>{void refreshMonthlyPlanLocks();},[monthlyPlans,plans,view]);\n";
 source=source.replace(loaderAnchor,helper+loaderAnchor);
}else{
 source=source.replace("useEffect(()=>{void refreshMonthlyPlanLocks();},[monthlyPlans]);","useEffect(()=>{void refreshMonthlyPlanLocks();},[monthlyPlans,plans,view]);");
}

const cssFile='src/monthly-production.css';
if(fs.existsSync(cssFile)){
 let css=fs.readFileSync(cssFile,'utf8');
 if(!css.includes('monthly-lock-v1'))css+="\n/* monthly-lock-v1 */\n.monthly-table-actions button:disabled{opacity:.42!important;cursor:not-allowed!important}.monthly-table-actions button:disabled:hover{transform:none!important}\n";
 fs.writeFileSync(cssFile,css);
}
fs.writeFileSync(file,source);
console.log('Monthly Plan lock state is declared before use; Daily Plan allocation lock checks retained.');
