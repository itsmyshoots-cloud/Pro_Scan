import fs from 'fs';

const file = 'src/App.jsx';
let source = fs.readFileSync(file, 'utf8');
const original = source;

const oldHourlyInput = "<input type='number' min='0' step='1' value={row.planned_qty} onChange={e=>setHourlyTargets(previous=>previous.map(target=>target.hour===row.hour?{...target,planned_qty:Math.max(0,Math.floor(Number(e.target.value)||0))}:target))}/>";
const newHourlyInput = "<input type='number' min='0' step='1' value={row.planned_qty} onChange={e=>setHourlyTargets(previous=>{const next=previous.map(target=>target.hour===row.hour?{...target,planned_qty:Math.max(0,Math.floor(Number(e.target.value)||0))}:target);const total=next.reduce((sum,target)=>sum+Math.max(0,Math.floor(Number(target.planned_qty)||0)),0);setForm(formPrevious=>({...formPrevious,planned_qty:total}));return next;})}/>";
if (!source.includes(oldHourlyInput)) throw new Error('Daily hourly input anchor not found.');
source = source.replace(oldHourlyInput, newHourlyInput, 1);

const oldCapacityValidation = "  if(qty>capacity)return setDailyMessage('Daily planned quantity '+qty.toLocaleString()+' exceeds shift capacity '+capacity.toLocaleString()+' at '+rate.toLocaleString()+' units/hour.');\n  if(qty>dailyAvailableQty)return setDailyMessage('Daily planned quantity '+qty.toLocaleString()+' exceeds the '+dailyAvailableQty.toLocaleString()+' available serials in the monthly pool.');\n  const targets=buildDailyHourlyTargets(shiftStart,shiftEnd,dailyBreakMinutes,qty);\n  if(targets.reduce((sum,row)=>sum+Number(row.planned_qty||0),0)!==qty)return setDailyMessage('Hourly production targets could not be balanced to the daily quantity.');";
const newCapacityValidation = "  if(qty>dailyAvailableQty)return setDailyMessage('Daily planned quantity '+qty.toLocaleString()+' exceeds the '+dailyAvailableQty.toLocaleString()+' available serials in the monthly pool.');\n  const targets=(Array.isArray(hourlyTargets)?hourlyTargets:[]).map(row=>({hour:row.hour,planned_qty:Math.max(0,Math.floor(Number(row.planned_qty)||0))}));\n  const hourlyTotal=targets.reduce((sum,row)=>sum+row.planned_qty,0);\n  if(hourlyTotal!==qty)return setDailyMessage('Hourly production targets total '+hourlyTotal.toLocaleString()+' but the daily planned quantity is '+qty.toLocaleString()+'. Edit the hourly quantities so they match.');";
if (!source.includes(oldCapacityValidation)) throw new Error('Daily capacity validation anchor not found.');
source = source.replace(oldCapacityValidation, newCapacityValidation, 1);

source = source.replace(
  "<p>Example: 100 units/hour × 9 productive hours = maximum 900 units for this daily shift. Any remaining monthly serials stay pending; they are not carried forward automatically.</p>",
  "<p>Target / hour is the normal production rate. Each hourly quantity below can be edited when required for a short shift, balance quantity or other production exception. The monthly serial pool remains the hard limit.</p>",
  1
);

source = source.replace("<small>Planned production</small>", "<small>Edit when required</small>", 1);

if (source === original) throw new Error('Daily hourly override patch made no changes.');
fs.writeFileSync(file, source);
console.log('Daily Plan hourly quantities are editable and drive the planned quantity.');
