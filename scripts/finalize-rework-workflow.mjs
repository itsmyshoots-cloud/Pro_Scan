import fs from 'node:fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const importAnchor="import ProductionRejections from './components/ProductionRejections';";
if(!source.includes("import ReworkCenter from './components/ReworkCenter';")){
 if(!source.includes(importAnchor))throw new Error('ProductionRejections import anchor not found.');
 source=source.replace(importAnchor,importAnchor+"\nimport ReworkCenter from './components/ReworkCenter';");
}

const navAnchor="<button className={view==='operator'?'nav-button is-active':'nav-button'} onClick={()=>setView('operator')}>Operator</button>";
if(!source.includes("onClick={()=>setView('rework')}>Rework</button>")){
 if(!source.includes(navAnchor))throw new Error('Operator navigation anchor not found.');
 source=source.replace(navAnchor,"<button className={view==='rework'?'nav-button is-active':'nav-button'} onClick={()=>setView('rework')}>Rework</button>"+navAnchor);
}

const operatorRoute="{view==='operator'&&<main className='operator-workstation'>";
if(!source.includes("{view==='rework'&&<ReworkCenter")){
 if(!source.includes(operatorRoute))throw new Error('Operator route anchor not found.');
 const route="{view==='rework'&&<ReworkCenter onChanged={async planId=>{broadcastProductionChange('rework',planId);await load();await loadMonthlyPlans();await loadDailyPlansList();await refreshMonitoring();}} />}\n ";
 source=source.replace(operatorRoute,route+operatorRoute);
}

const dateMessage="Choose a valid production date before increasing the Draft quantity.";
const dateMessageIndex=source.indexOf(dateMessage);
if(dateMessageIndex<0)throw new Error('Draft top-up date validation was not found.');
const dateLineStart=source.lastIndexOf('\n',dateMessageIndex)+1;
const dateLineEnd=source.indexOf('\n',dateMessageIndex);
const correctedDateLine="    if(!/^\\d{4}-\\d{2}$/.test(month))throw new Error('Choose a valid production date before increasing the Draft quantity.');";
source=source.slice(0,dateLineStart)+correctedDateLine+source.slice(dateLineEnd);

const allocationStart=source.indexOf("const [poolResult,allocatedResult,registryResult]=await Promise.all([");
if(allocationStart<0)throw new Error('Draft Monthly Plan allocation query not found.');
const allocationEnd=source.indexOf("]);",allocationStart);
if(allocationEnd<0)throw new Error('Draft allocation query block is incomplete.');
const allocationQuery=[
"const [poolResult,allocatedResult,registryResult,planStatusResult]=await Promise.all([",
"     fetchAllRows((from,to)=>supabase.from('monthly_plan_serials').select('label_number,serial_number,sequence_no').eq('monthly_plan_id',monthlyPlan.id).order('sequence_no',{ascending:true}).range(from,to)),",
"     fetchAllRows((from,to)=>supabase.from('plan_serials').select('plan_id,serial_number,label_number').order('id',{ascending:true}).range(from,to)),",
"     fetchAllRows((from,to)=>supabase.from('serial_numbers').select('serial_number').order('id',{ascending:true}).range(from,to)),",
"     fetchAllRows((from,to)=>supabase.from('production_plans').select('id,status').order('id',{ascending:true}).range(from,to))",
"    ]);"
].join('\n');
source=source.slice(0,allocationStart)+allocationQuery+source.slice(allocationEnd+3);
const registryErrorAnchor="    if(registryResult.error)throw new Error('Could not verify the serial registry: '+registryResult.error.message);";
if(!source.includes(registryErrorAnchor))throw new Error('Draft serial registry error guard not found.');
source=source.replace(registryErrorAnchor,registryErrorAnchor+"\n    if(planStatusResult.error)throw new Error('Could not verify Daily Plan allocation status: '+planStatusResult.error.message);");
const usedAnchor="    const usedSerials=new Set((allocatedResult.data||[]).map(row=>normalize(row.serial_number)).filter(Boolean));\n    const usedLabels=new Set((allocatedResult.data||[]).map(row=>normalize(row.label_number)).filter(Boolean));";
const usedReplacement=[
"    const livePlanIds=new Set((planStatusResult.data||[]).filter(row=>row.status!=='cancelled').map(row=>row.id));",
"    const liveAllocations=(allocatedResult.data||[]).filter(row=>livePlanIds.has(row.plan_id));",
"    const usedSerials=new Set(liveAllocations.map(row=>normalize(row.serial_number)).filter(Boolean));",
"    const usedLabels=new Set(liveAllocations.map(row=>normalize(row.label_number)).filter(Boolean));"
].join('\n');
if(!source.includes(usedAnchor))throw new Error('Draft allocation exclusion sets not found.');
source=source.replace(usedAnchor,usedReplacement);

const metricStart=source.indexOf("const loadPlanningMetrics=async(");
const metricEffect=source.indexOf("useEffect(()=>{planningMetricsRefreshRef.current",metricStart);
if(metricStart<0||metricEffect<0)throw new Error('Planning metrics function/effect anchors not found after the V7 planner patch.');
const metricFunction=[
"const loadPlanningMetrics=async(monthlyRows=[],dailyRows=[])=>{",
"  try{",
"   const [poolResult,serialResult,planResult,reworkResult]=await Promise.all([",
"    fetchAllRows((from,to)=>supabase.from('monthly_plan_serials').select('monthly_plan_id,serial_number,label_number').order('sequence_no',{ascending:true}).range(from,to)),",
"    fetchAllRows((from,to)=>supabase.from('plan_serials').select('plan_id,serial_number,label_number,status').order('id',{ascending:true}).range(from,to)),",
"    fetchAllRows((from,to)=>supabase.from('production_plans').select('id,production_date,brand,product_name,model,status,planned_qty').order('id',{ascending:true}).range(from,to)),",
"    fetchAllRows((from,to)=>supabase.from('production_rejections').select('plan_id,quantity,rejection_type,status').eq('rejection_type','quantity').eq('status','rework_accepted').order('id',{ascending:true}).range(from,to))",
"   ]);",
"   const failure=poolResult.error||serialResult.error||planResult.error||reworkResult.error;",
"   if(failure)throw failure;",
"   const pool=poolResult.data||[],serialRows=serialResult.data||[],planRows=planResult.data||[],reworkRows=reworkResult.data||[];",
"   const norm=value=>String(value||'').trim().toUpperCase();",
"   const planById=new Map(planRows.map(row=>[row.id,row]));",
"   const serialByValue=new Map();",
"   const dailyScanned={},dailyQuantityAccepted={};",
"   for(const row of serialRows){",
"    const serial=norm(row.serial_number),label=norm(row.label_number);",
"    if(serial)serialByValue.set(serial,row);",
"    if(label&&!serialByValue.has(label))serialByValue.set(label,row);",
"    if(row.status==='scanned'&&row.plan_id)dailyScanned[row.plan_id]=(dailyScanned[row.plan_id]||0)+1;",
"   }",
"   for(const row of reworkRows){if(row.plan_id)dailyQuantityAccepted[row.plan_id]=(dailyQuantityAccepted[row.plan_id]||0)+Number(row.quantity||0);}",
"   const daily={};",
"   for(const plan of planRows){daily[plan.id]={planned:Number(plan.planned_qty||0),actual:Number(dailyScanned[plan.id]||0)+Number(dailyQuantityAccepted[plan.id]||0)};}",
"   const monthly={},monthlyByProduct=new Map();",
"   for(const plan of monthlyRows||[]){",
"    monthly[plan.id]={planned:0,actual:0};",
"    const key=[String(plan.plan_month||'').slice(0,7),norm(plan.brand),norm(plan.product_name),norm(plan.model)].join('|');",
"    monthlyByProduct.set(key,plan.id);",
"   }",
"   for(const poolRow of pool){",
"    const linked=serialByValue.get(norm(poolRow.serial_number))||serialByValue.get(norm(poolRow.label_number));",
"    if(!linked)continue;",
"    const plan=planById.get(linked.plan_id);",
"    if(!plan)continue;",
"    const stats=monthly[poolRow.monthly_plan_id]||(monthly[poolRow.monthly_plan_id]={planned:0,actual:0});",
"    if(plan.status!=='cancelled')stats.planned+=1;",
"    if(linked.status==='scanned')stats.actual+=1;",
"   }",
"   for(const row of reworkRows){",
"    const plan=planById.get(row.plan_id);",
"    if(!plan)continue;",
"    const key=[String(plan.production_date||'').slice(0,7),norm(plan.brand),norm(plan.product_name),norm(plan.model)].join('|');",
"    const monthlyId=monthlyByProduct.get(key);",
"    if(monthlyId)(monthly[monthlyId]||(monthly[monthlyId]={planned:0,actual:0})).actual+=Number(row.quantity||0);",
"   }",
"   setPlanningMetrics({monthly,daily});",
"  }catch(error){setPlanningMetrics({monthly:{},daily:{}});console.warn('Planning metrics refresh failed',error);}",
" };",
" "
].join('\n');
source=source.slice(0,metricStart)+metricFunction+source.slice(metricEffect);

if(!source.includes("import ReworkCenter from './components/ReworkCenter';"))throw new Error('ReworkCenter import verification failed.');
if(!source.includes("onClick={()=>setView('rework')}>Rework</button>"))throw new Error('Rework navigation verification failed.');
if(!source.includes("{view==='rework'&&<ReworkCenter"))throw new Error('Rework route verification failed.');
if(!source.includes("const livePlanIds=new Set("))throw new Error('Cancelled-plan serial release verification failed.');
if(!source.includes("if(!/^\\d{4}-\\d{2}$/.test(month))"))throw new Error('Draft date validation was not corrected.');
if(source===original)throw new Error('Rework workflow finalizer made no changes.');
fs.writeFileSync(file,source);
console.log('Rework tab, Draft hourly-rate top-up fix, and Daily/Monthly rework metrics finalized.');
