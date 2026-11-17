import fs from 'fs';
const file='src/App.jsx';
let s=fs.readFileSync(file,'utf8');
const original=s;

// Normalize PostgreSQL time values (HH:MM:SS) before matching hourly targets.
s=s.replace("const targetByHour=new Map((previous||[]).map(row=>[row.hour,Number(row.planned_qty||0)]));","const targetByHour=new Map((previous||[]).map(row=>[String(row.hour||row.start_time||'').slice(0,5),Number(row.planned_qty||0)]));");

// Track whether the editor was opened from the Monthly Plan-backed Daily Plan library.
if(!s.includes("const [editingPlanKind,setEditingPlanKind]=useState('standard');")){
 s=s.replace("const [editingPlanId,setEditingPlanId]=useState(''); const [dailyPlanDetailId,setDailyPlanDetailId]=useState('');","const [editingPlanId,setEditingPlanId]=useState(''); const [editingPlanKind,setEditingPlanKind]=useState('standard');");
}
s=s.replace("setEditingPlanId('');setForm({production_date:localDateKey(new Date())","setEditingPlanId('');setEditingPlanKind('standard');setForm({production_date:localDateKey(new Date())");

// Load the serial_number_id relationship to recognize Monthly Plan-backed Daily Plan allocations.
s=s.replace("select('id,plan_id,label_number,serial_number,sequence_no,status,scanned_at')","select('id,plan_id,serial_number_id,label_number,serial_number,sequence_no,status,scanned_at')");
const editAnchor="const allocated=result.data||[];";
if(s.includes(editAnchor)&&!s.includes("const isMonthlyBackedDailyPlan=allocated.some")){
 s=s.replace(editAnchor,editAnchor+"\n  const isMonthlyBackedDailyPlan=allocated.some(row=>Boolean(row.serial_number_id));");
}
s=s.replace("setEditingPlanId(plan.id);setForm({production_date:","setEditingPlanId(plan.id);setEditingPlanKind(isMonthlyBackedDailyPlan?'daily':'standard');setForm({production_date:");
s=s.replace("setHourlyTargets(Array.isArray(plan.hourly_targets)&&plan.hourly_targets.length?schedule:distributeHourlyTargetsEvenly(createHourlyTargets(startValue,endValue),Number(plan.hourly_targets?.[0]?.planned_qty ?? 0)));","setHourlyTargets(Array.isArray(plan.hourly_targets)&&plan.hourly_targets.length?schedule:distributeHourlyTargetsEvenly(createHourlyTargets(startValue,endValue),Number(plan.hourly_targets?.[0]?.planned_qty ?? (Number(plan.shift_planned_qty||0)/Math.max(1,createHourlyTargets(startValue,endValue).length)))));");

// Daily plans retain their Monthly Plan serial reservations. Update only the plan schedule/metadata.
const rpcAnchor="if(editingPlanId){\n   const planId=editingPlanId,original=plans.find(plan=>plan.id===planId);";
const dailyBranch=`if(editingPlanId){
   const planId=editingPlanId,original=plans.find(plan=>plan.id===planId);
   if(editingPlanKind==='daily'){
    if(!original||original.status!=='draft'){setBusy(false);return setMessage('Only Draft Daily Plans can be edited.');}
    if(chosen.length!==Number(original.planned_qty||0)){setBusy(false);return setMessage('Daily Plan serial reservations are fixed. The planned quantity must remain '+Number(original.planned_qty||0).toLocaleString()+'.');}
    const {data:savedPlan,error}=await supabase.from('production_plans').update({
     production_date:form.production_date,brand:form.brand.trim()||'Unspecified',product_name:form.product_name.trim(),model:form.model.trim(),
     production_line:form.production_line,planned_qty:Number(original.planned_qty||0),hourly_targets:hourlyPayload,
     shift_name:shiftName.trim()||'Shift A',shift_start:shiftStart,shift_end:shiftEnd,
     shift_planned_qty:hourlyTargetTotal,manpower_count:manpowerCount
    }).eq('id',planId).eq('status','draft').select().maybeSingle();
    if(error||!savedPlan){setBusy(false);return setMessage(error?'Could not update Daily Plan: '+error.message:'Daily Plan was not updated. Refresh and check its status.');}
    setPlans(previous=>previous.map(plan=>plan.id===planId?savedPlan:plan));
    setDailyPlansList(previous=>previous.map(plan=>plan.id===planId?savedPlan:plan));
    setEditingPlanId('');setEditingPlanKind('standard');setRows([]);setSourceFile('');setFileInfo('');setBusy(false);
    setMessage('Daily Plan shift details updated. Monthly serial reservations were preserved.');
    broadcastProductionChange('plan',planId);await loadDailyPlansList();setView('daily-planner');return;
   }`;
if(s.includes(rpcAnchor))s=s.replace(rpcAnchor,dailyBranch);
else if(!s.includes("Daily Plan serial reservations are fixed."))throw new Error('Could not locate draft plan save branch.');

// Operator quality control is available but collapsed by default so the scanner remains the primary workspace.
const oldQC="{selectedPlan&&!showPlanSetup&&<ProductionRejections plan={selectedPlan} operatorName={operator} planSerials={planSerials} onRefresh={async()=>{await refreshPlanMetrics(selectedPlan);await refreshMonitoring();}} onChanged={()=>broadcastProductionChange('rejection',selectedPlan.id)} />}";
const newQC="{selectedPlan&&!showPlanSetup&&<details className='operator-quality-details'><summary><span><b>QUALITY CONTROL</b><small>Production rejection, defect recording and rework</small></span><span className='operator-quality-open'>Open quality control</span></summary><ProductionRejections plan={selectedPlan} operatorName={operator} planSerials={planSerials} onRefresh={async()=>{await refreshPlanMetrics(selectedPlan);await refreshMonitoring();}} onChanged={()=>broadcastProductionChange('rejection',selectedPlan.id)} /></details>}";
if(s.includes(oldQC))s=s.replace(oldQC,newQC);

// Daily plan list actions: details, edit and safe draft delete.
const oldAction="<td>{plan.status==='draft'?<button type='button' onClick={()=>void startEditPlan(plan)}>Edit draft</button>:<span className='muted-action'>Locked</span>}</td>";
const newAction=`<td><div className='daily-plan-row-actions'>
 <button type='button' onClick={()=>{setExpandedManagePlanId(plan.id);setView('manage');}}>Details</button>
 {plan.status==='draft'?<><button type='button' disabled={busy} onClick={()=>void startEditPlan(plan)}>Edit</button><button type='button' className='daily-plan-delete' disabled={busy} onClick={()=>void deleteDailyPlan(plan)}>Delete</button></>:<span className='muted-action'>Locked</span>}
 </div></td>`;
if(s.includes(oldAction))s=s.replace(oldAction,newAction);

// Safe delete releases only an untouched draft allocation; scanned or rejected history is never removed.
const dailyLoader=" const loadDailyPlansList=async()=>{";
if(s.includes(dailyLoader)&&!s.includes("const deleteDailyPlan=async plan=>")){
 const fn=` const deleteDailyPlan=async plan=>{
  if(!plan||plan.status!=='draft')return setDailyMessage('Only Draft Daily Plans can be deleted.');
  if(!window.confirm('Delete this Draft Daily Plan? Its monthly serial reservations will be released.'))return;
  setDailyBusy(true);setDailyMessage('Checking the Daily Plan before deletion…');
  try{
   const {data:serialRows,error:serialError}=await supabase.from('plan_serials').select('id,status').eq('plan_id',plan.id);
   if(serialError)throw serialError;
   if((serialRows||[]).some(row=>row.status==='scanned'||row.status==='rejected'))throw new Error('This plan has production/rejection history and cannot be deleted. Cancel it instead.');
   const {data:deletedRows,error:deleteSerialError}=await supabase.from('plan_serials').delete().eq('plan_id',plan.id).select('id');
   if(deleteSerialError)throw deleteSerialError;
   const {data:deletedPlan,error:deletePlanError}=await supabase.from('production_plans').delete().eq('id',plan.id).eq('status','draft').select('id').maybeSingle();
   if(deletePlanError||!deletedPlan){throw deletePlanError||new Error('Daily Plan was not deleted. Refresh and retry.');}
   setDailyPlansList(previous=>previous.filter(row=>row.id!==plan.id));setPlans(previous=>previous.filter(row=>row.id!==plan.id));
   await loadDailyMonthlyPlans();setDailyMessage('Draft Daily Plan deleted. Its monthly serial reservations are available again.');
   broadcastProductionChange('plan',plan.id);
  }catch(error){setDailyMessage(error?.message||'Could not delete the Daily Plan.');}
  finally{setDailyBusy(false);}
 };
`;
 s=s.replace(dailyLoader,fn+dailyLoader);
}

// Keep all Daily Plans visible; refresh both the plan list and planning metrics on tab entry.
s=s.replace("onClick={()=>{void loadDailyMonthlyPlans();void loadDailyPlansList();}}","onClick={()=>{void loadDailyMonthlyPlans();void loadDailyPlansList();}}");

// Daily Plan edit quantity is reservation-backed and must not be changed in the edit form.
s=s.replace("<label>Production requirement<input type='number' min='1' value={form.planned_qty}","<label>Production requirement<input type='number' min='1' disabled={editingPlanKind==='daily'} value={form.planned_qty}");

// Styles are added to the existing daily production stylesheet.
const cssFile='src/daily-production.css';
let css=fs.existsSync(cssFile)?fs.readFileSync(cssFile,'utf8'):'';
css+=`
/* daily-plan-operator-layout-v1 */
.daily-plan-row-actions{display:flex;gap:6px;flex-wrap:wrap}.daily-plan-row-actions button{border:1px solid #d7e1ee;background:#fff;border-radius:8px;padding:7px 10px;font-weight:800;cursor:pointer}.daily-plan-row-actions .daily-plan-delete{color:#b91c1c;border-color:#fecaca}
.operator-quality-details{margin:14px 0 0;border:1px solid #dbe4ef;border-radius:14px;background:#fff;overflow:hidden}
.operator-quality-details>summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;background:#f8fafc}
.operator-quality-details>summary::-webkit-details-marker{display:none}
.operator-quality-details>summary span:first-child{display:grid;gap:3px}.operator-quality-details>summary b{font-size:12px;letter-spacing:.08em;color:#334155}.operator-quality-details>summary small{font-size:12px;color:#64748b}
.operator-quality-open{font-size:12px;font-weight:800;color:#1d4ed8}.operator-quality-details[open]>summary{border-bottom:1px solid #dbe4ef;background:#eff6ff}
.operator-quality-details>section{margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}
@media(max-width:760px){.daily-plan-row-actions{min-width:150px}.operator-quality-details>summary{padding:10px}}
`;
fs.writeFileSync(cssFile,css);
if(s===original)throw new Error('Daily plan/operator fix did not modify App.jsx');
fs.writeFileSync(file,s);
console.log('Daily plan and operator layout fixes applied.');
