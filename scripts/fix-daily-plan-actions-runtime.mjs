import fs from 'fs';
const file='src/App.jsx';
let s=fs.readFileSync(file,'utf8');
const start=s.indexOf('const startEditPlan=async plan=>{');
const end=s.indexOf(' const refreshPlanMetrics=',start);
if(start<0||end<0)throw new Error('Could not locate startEditPlan handler.');
const replacement=`const startEditPlan=async plan=>{
  if(!plan||plan.status!=='draft'){setMessage('Only Draft production plans can be edited.');return;}
  setBusy(true);setMessage('Loading Daily Plan and checking its serial reservations…');
  try{
   const result=await fetchAllRows((from,to)=>supabase.from('plan_serials').select('id,plan_id,serial_number_id,label_number,serial_number,sequence_no,status,scanned_at').eq('plan_id',plan.id).order('sequence_no',{ascending:true}).range(from,to));
   if(result.error)throw new Error('Could not load allocated serials: '+result.error.message);
   const allocated=result.data||[];
   if(allocated.some(row=>row.status==='scanned'||row.status==='rejected'))throw new Error('This plan has production or rejection history and cannot be edited safely.');
   const serialValues=allocated.map(row=>String(row.serial_number||'').trim()).filter(Boolean);
   let monthlySerialSet=new Set();
   if(serialValues.length){
    const lookup=await supabase.from('monthly_plan_serials').select('serial_number').in('serial_number',serialValues);
    if(lookup.error)throw new Error('Could not verify Monthly Plan reservations: '+lookup.error.message);
    monthlySerialSet=new Set((lookup.data||[]).map(row=>String(row.serial_number||'').trim().toUpperCase()));
   }
   const isMonthlyBackedDailyPlan=allocated.some(row=>Boolean(row.serial_number_id)||monthlySerialSet.has(String(row.serial_number||'').trim().toUpperCase()));
   const shift=getPlanShiftWindow(plan),startValue=shift?minutesToClock(shift.start):'09:00',endValue=shift?minutesToClock(shift.end):'18:00';
   const sourceTargets=Array.isArray(plan.hourly_targets)?plan.hourly_targets:[];
   const schedule=createHourlyTargets(startValue,endValue,sourceTargets);
   const qty=Number(plan.planned_qty||0);
   const rate=Number(sourceTargets.find(row=>Number(row?.planned_qty||0)>0)?.planned_qty??(Number(plan.shift_planned_qty||0)/Math.max(1,schedule.length)));
   setEditingPlanId(plan.id);setEditingPlanKind(isMonthlyBackedDailyPlan?'daily':'standard');
   setForm({production_date:plan.production_date||localDateKey(new Date()),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',production_line:plan.production_line||lines[0],planned_qty:qty});
   setShiftName(plan.shift_name||'Shift A');setShiftStart(String(plan.shift_start||startValue).slice(0,5));setShiftEnd(String(plan.shift_end||endValue).slice(0,5));
   setHourlyProductionQty(Math.max(0,Math.floor(Number(rate)||0)));setManpowerCount(Number(plan.manpower_count||0));
   setHourlyTargets(sourceTargets.length?schedule:distributeHourlyTargetsEvenly(createHourlyTargets(startValue,endValue),Math.max(0,Math.floor(Number(rate)||0))));
   setRows(allocated.map(row=>({label_number:row.label_number,serial_number:row.serial_number})));
   setSourceFile(allocated.length?'Existing Draft Plan Allocation':'');setFileInfo(allocated.length?allocated.length.toLocaleString()+' allocated serials loaded':'No serial allocation found — Monthly Plan reservations will remain unchanged');
   setImportConflicts([]);setMessage('');setView('planner');
  }catch(error){setMessage(error?.message||'Could not open this Daily Plan for editing.');}
  finally{setBusy(false);}
 };
`;
s=s.slice(0,start)+replacement+s.slice(end);
fs.writeFileSync(file,s);
console.log('Daily Plan edit loading now always releases the busy state and reports query errors.');
