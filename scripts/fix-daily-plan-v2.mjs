import fs from 'fs';

const file = 'src/App.jsx';
let source = fs.readFileSync(file, 'utf8');
const original = source;

// Keep the monthly pool check independent of the optional RPC migration.
const availabilityStart = " const refreshDailyMonthlyAvailability=async(monthlyId=dailyMonthlyPlanId)=>{";
const availabilityEnd = " const createDailyPlanFromMonthly=async()=>{";
if (!source.includes(availabilityStart) || !source.includes(availabilityEnd)) {
  throw new Error('Daily monthly availability function anchors not found.');
}
const startIndex = source.indexOf(availabilityStart);
const endIndex = source.indexOf(availabilityEnd, startIndex);
const replacement = ` const getDailyMonthlyAvailableQty=async monthlyId=>{
  if(!monthlyId)return 0;
  const {data:pool,error:poolError}=await supabase.from('monthly_plan_serials').select('id,serial_number').eq('monthly_plan_id',monthlyId);
  if(poolError)throw new Error(poolError.message);
  const serials=pool||[];
  if(!serials.length)return 0;
  const ids=serials.map(row=>row.id);
  const {data:allocated,error:allocationError}=await supabase.from('plan_serials').select('monthly_plan_serial_id,serial_number').in('monthly_plan_serial_id',ids);
  if(allocationError)throw new Error(allocationError.message);
  const usedIds=new Set((allocated||[]).map(row=>row.monthly_plan_serial_id).filter(Boolean));
  const usedSerials=new Set((allocated||[]).map(row=>String(row.serial_number||'').trim().toUpperCase()).filter(Boolean));
  return serials.reduce((count,row)=>count+(usedIds.has(row.id)||usedSerials.has(String(row.serial_number||'').trim().toUpperCase())?0:1),0);
 };
 const refreshDailyMonthlyAvailability=async(monthlyId=dailyMonthlyPlanId)=>{
  if(!monthlyId){setDailyAvailableQty(0);return;}
  try{setDailyAvailableQty(await getDailyMonthlyAvailableQty(monthlyId));}
  catch(error){setDailyAvailableQty(0);setDailyMessage('Could not check monthly serial usage: '+error.message);}
 };
 const prepareDailyMonthlyPlan=async monthlyId=>{
  setDailyMonthlyPlanId(monthlyId);
  const plan=dailyMonthlyPlans.find(item=>item.id===monthlyId);
  if(!plan){setDailyAvailableQty(0);setForm(previous=>({...previous,brand:'',product_name:'',model:'',planned_qty:0}));return;}
  setForm(previous=>({...previous,brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',planned_qty:0}));
  let available=0;
  try{available=await getDailyMonthlyAvailableQty(monthlyId);}
  catch(error){setDailyAvailableQty(0);setDailyMessage('Could not check monthly serial usage: '+error.message);return;}
  setDailyAvailableQty(available);
  const start=shiftStart,end=shiftEnd;
  const startParts=start.split(':').map(Number),endParts=end.split(':').map(Number);
  const minutes=(endParts[0]*60+endParts[1])-(startParts[0]*60+startParts[1]);
  const productiveHours=Math.max(0,Math.floor(minutes/60));
  const capacity=productiveHours*Math.max(0,Math.floor(Number(hourlyProductionQty)||0));
  const nextQty=Math.min(available,capacity);
  setForm(previous=>({...previous,planned_qty:nextQty}));
  setHourlyTargets(buildDailyHourlyTargetsAtRate(start,end,0,nextQty,Number(hourlyProductionQty)||0));
  setDailyMessage(available+' serials available in the monthly pool. Shift capacity at '+Number(hourlyProductionQty||0).toLocaleString()+' units/hour is '+capacity.toLocaleString()+'.');
 };
`;
source = source.slice(0, startIndex) + replacement + source.slice(endIndex);

// Hourly targets: fill each productive hour from the configured target/hour rate,
// using a smaller final slot only when the monthly pool runs out.
const helperAnchor = "function buildDailyHourlyTargets(start='09:00',end='18:00',breakMinutes=0,total=0){";
if (!source.includes(helperAnchor)) throw new Error('Daily hourly helper anchor not found.');
const rateHelper = `function buildDailyHourlyTargetsAtRate(start='09:00',end='18:00',breakMinutes=0,total=0,rate=0){
 const startMatch=/^(\\d{2}):(\\d{2})$/.exec(start||''),endMatch=/^(\\d{2}):(\\d{2})$/.exec(end||'');
 if(!startMatch||!endMatch)return [];
 const startMinutes=Number(startMatch[1])*60+Number(startMatch[2]),endMinutes=Number(endMatch[1])*60+Number(endMatch[2]);
 const productiveHours=Math.max(0,Math.floor((endMinutes-startMinutes-Math.max(0,Number(breakMinutes)||0))/60));
 if(productiveHours<1)return [];
 const quantity=Math.max(0,Math.floor(Number(total)||0));
 const hourlyRate=Math.max(0,Math.floor(Number(rate)||0));
 return Array.from({length:productiveHours},(_,index)=>{
  const minute=startMinutes+(index*60),hour=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  const planned_qty=hourlyRate>0?Math.min(hourlyRate,Math.max(0,quantity-(index*hourlyRate))):0;
  return {hour,planned_qty};
 });
}
`;
source = source.replace(helperAnchor, rateHelper + helperAnchor);

// The daily planner no longer accepts break minutes or actual manpower. Keep the
// database fields internally at zero so the existing RPC remains compatible.
source = source.replace("p_break_minutes:Math.max(0,Math.floor(Number(dailyBreakMinutes)||0)),", "p_break_minutes:0,");
source = source.replace("p_actual_manpower_count:Math.max(0,Math.floor(Number(manpowerCount)||0)),", "p_actual_manpower_count:0,");

// Shift time and hourly-rate changes should recalculate the derived plan and
// populate the hourly slots from the target/hour rate.
const shiftStartOld = "onChange={e=>{setShiftStart(e.target.value);setHourlyTargets(buildDailyHourlyTargets(e.target.value,shiftEnd,dailyBreakMinutes,Number(form.planned_qty||0)));}}";
const shiftStartNew = "onChange={e=>{const next=e.target.value;setShiftStart(next);const a=next.split(':').map(Number),b=shiftEnd.split(':').map(Number),hours=Math.max(0,Math.floor(((b[0]*60+b[1])-(a[0]*60+a[1]))/60));const capacity=hours*Math.max(0,Math.floor(Number(hourlyProductionQty)||0));const qty=Math.min(Number(dailyAvailableQty||0),capacity);setForm(previous=>({...previous,planned_qty:qty}));setHourlyTargets(buildDailyHourlyTargetsAtRate(next,shiftEnd,0,qty,Number(hourlyProductionQty)||0));}}";
if (!source.includes(shiftStartOld)) throw new Error('Daily shift-start handler not found.');
source = source.replace(shiftStartOld, shiftStartNew, 1);

const shiftEndOld = "onChange={e=>{setShiftEnd(e.target.value);setHourlyTargets(buildDailyHourlyTargets(shiftStart,e.target.value,dailyBreakMinutes,Number(form.planned_qty||0)));}}";
const shiftEndNew = "onChange={e=>{const next=e.target.value;setShiftEnd(next);const a=shiftStart.split(':').map(Number),b=next.split(':').map(Number),hours=Math.max(0,Math.floor(((b[0]*60+b[1])-(a[0]*60+a[1]))/60));const capacity=hours*Math.max(0,Math.floor(Number(hourlyProductionQty)||0));const qty=Math.min(Number(dailyAvailableQty||0),capacity);setForm(previous=>({...previous,planned_qty:qty}));setHourlyTargets(buildDailyHourlyTargetsAtRate(shiftStart,next,0,qty,Number(hourlyProductionQty)||0));}}";
if (!source.includes(shiftEndOld)) throw new Error('Daily shift-end handler not found.');
source = source.replace(shiftEndOld, shiftEndNew, 1);

const rateOld = "onChange={e=>{const value=Math.max(0,Math.floor(Number(e.target.value)||0));setHourlyProductionQty(value);const a=shiftStart.split(':').map(Number),b=shiftEnd.split(':').map(Number),minutes=(b[0]*60+b[1])-(a[0]*60+a[1])-dailyBreakMinutes,hours=Math.max(0,Math.floor(minutes/60));const capacity=hours*value;const qty=Math.min(Number(dailyAvailableQty||0),capacity);setForm(previous=>({...previous,planned_qty:qty}));setHourlyTargets(buildDailyHourlyTargets(shiftStart,shiftEnd,dailyBreakMinutes,qty));}}";
const rateNew = "onChange={e=>{const value=Math.max(0,Math.floor(Number(e.target.value)||0));setHourlyProductionQty(value);const a=shiftStart.split(':').map(Number),b=shiftEnd.split(':').map(Number),hours=Math.max(0,Math.floor(((b[0]*60+b[1])-(a[0]*60+a[1]))/60));const capacity=hours*value;const qty=Math.min(Number(dailyAvailableQty||0),capacity);setForm(previous=>({...previous,planned_qty:qty}));setHourlyTargets(buildDailyHourlyTargetsAtRate(shiftStart,shiftEnd,0,qty,value));}}";
if (!source.includes(rateOld)) throw new Error('Daily target/hour handler not found.');
source = source.replace(rateOld, rateNew, 1);

// Remove the three input fields requested from the Daily Plan UI.
const removeLabels = [
  /\s*<label>Break minutes<input type='number' min='0' max='720' step='1' value=\{dailyBreakMinutes\} onChange=\{e=>\{const value=Math\.max\(0,Math\.floor\(Number\(e\.target\.value\)\|\|0\)\);setDailyBreakMinutes\(value\);setHourlyTargets\(buildDailyHourlyTargets\(shiftStart,shiftEnd,value,Number\(form\.planned_qty\|\|0\)\)\);\}\}\/><\/label>/,
  /\s*<label>Daily planned quantity<input type='number' min='1' max=\{dailyAvailableQty\|\|undefined\} step='1' value=\{form\.planned_qty\} onChange=\{e=>\{const value=e\.target\.value;setForm\(\{\.\.\.form,planned_qty:value\}\);setHourlyTargets\(buildDailyHourlyTargets\(shiftStart,shiftEnd,dailyBreakMinutes,Number\(value\|\|0\)\)\);\}\}\/><\/label>/,
  /\s*<label>Actual manpower<input type='number' min='0' step='1' value=\{manpowerCount\} onChange=\{e=>setManpowerCount\(Math\.max\(0,Math\.floor\(Number\(e\.target\.value\)\|\|0\)\)\)\}\/><\/label>/
];
for (const pattern of removeLabels) {
  const next = source.replace(pattern, '');
  if (next === source) throw new Error('One requested Daily Plan input field was not found.');
  source = next;
}

// Hourly values are derived from Target / hour; they are not independently edited.
const hourlyEditable = "<input type='number' min='0' step='1' value={row.planned_qty} onChange={e=>setHourlyTargets(previous=>previous.map(target=>target.hour===row.hour?{...target,planned_qty:Math.max(0,Math.floor(Number(e.target.value)||0))}:target))}/>";
const hourlyReadonly = "<input type='number' min='0' step='1' value={row.planned_qty} readOnly aria-label={getHourlySlotLabel(row.hour)+' production target'} />";
if (!source.includes(hourlyEditable)) throw new Error('Hourly target editor was not found.');
source = source.replace(hourlyEditable, hourlyReadonly, 1);

source = source.replace('<span>Daily planned</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong>', '<span>Monthly planned</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong>');
source = source.replace("const targets=buildDailyHourlyTargets(shiftStart,shiftEnd,dailyBreakMinutes,qty);", "const targets=buildDailyHourlyTargetsAtRate(shiftStart,shiftEnd,0,qty,rate);");
source = source.replace("const productiveMinutes=shiftMinutes-Math.max(0,Number(dailyBreakMinutes)||0);", "const productiveMinutes=shiftMinutes;");
source = source.replace("p_break_minutes:0,p_planned_qty", "p_break_minutes:0,p_planned_qty");

if (source === original) throw new Error('Daily Plan V2 patch made no changes.');
fs.writeFileSync(file, source);
console.log('Daily Plan V2 fix applied: monthly pool fallback, derived monthly planned/remaining values, rate-driven hourly slots, and removed requested inputs.');
