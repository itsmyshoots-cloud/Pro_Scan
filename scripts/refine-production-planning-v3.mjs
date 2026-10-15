import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const shiftFn=/function getPlanShiftWindow\(plan\)\{[\s\S]*?\n\}/;
const shiftReplacement=`function getPlanShiftWindow(plan){
 const explicitStart=String(plan?.shift_start||'').slice(0,5),explicitEnd=String(plan?.shift_end||'').slice(0,5);
 const toMinutes=value=>{const match=/^(\\d{2}):(\\d{2})$/.exec(value);return match?Number(match[1])*60+Number(match[2]):NaN;};
 const start=toMinutes(explicitStart),end=toMinutes(explicitEnd);
 if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return {start,end};
 const values=(Array.isArray(plan?.hourly_targets)?plan.hourly_targets:[]).map(row=>String(row.hour||'').slice(0,5)).filter(value=>/^\\d{2}:\\d{2}$/.test(value)).sort();
 if(!values.length)return null;
 const first=values[0].split(':').map(Number),last=values[values.length-1].split(':').map(Number);
 return {start:first[0]*60+first[1],end:last[0]*60+last[1]+60};
}`;
if(!shiftFn.test(source)) throw new Error('shift helper not found');
source=source.replace(shiftFn,shiftReplacement);

if(!source.includes("./production-planning-v3.css")) source=source.replace("import './production-planning-v2.css';","import './production-planning-v2.css';\nimport './production-planning-v3.css';");

const stateAnchor="const [planStatusFilter,setPlanStatusFilter]=useState('all');";
if(source.includes(stateAnchor)&&!source.includes('carryForwardSegmentKey')) source=source.replace(stateAnchor,"const [carryForwardSegmentKey,setCarryForwardSegmentKey]=useState(''); "+stateAnchor);

const previewPattern=/ const planCarryPreview=plan=>\{[\s\S]*?\n \};/;
const previewReplacement=` const planCarryPreview=plan=>{
  if(!plan)return null;
  const quantity=planCarryForward(plan);
  const rate=Math.max(1,planHourlyRate(plan));
  const shift=getPlanShiftWindow(plan);
  const hours=shift?Math.max(1,Math.floor((shift.end-shift.start)/60)):planHours(plan);
  const capacity=Math.max(1,rate*hours);
  const start=shift?.start??540;
  const end=shift?.end??(start+hours*60);
  const toMinutes=value=>{const parts=String(value||'').slice(0,5).split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:NaN;};
  const occupiedForDate=date=>plans.some(row=>row.id!==plan.id&&row.production_date===date&&row.production_line===plan.production_line&&row.status!=='cancelled'&&row.shift_start&&row.shift_end&&start<toMinutes(row.shift_end)&&end>toMinutes(row.shift_start));
  const buildHourly=allocated=>{const out=[];let remaining=allocated;for(let i=0;i<hours&&remaining>0;i++){const amount=Math.min(rate,remaining);out.push({hour:minutesToClock(start+i*60),planned_qty:amount});remaining-=amount;}return out;};
  const chain=[];let remaining=quantity;let cursor=new Date(String(plan.production_date).slice(0,10)+'T00:00:00');
  for(let guard=0;guard<370&&remaining>0;guard++){
   cursor.setDate(cursor.getDate()+1);
   const date=localDateKey(cursor);
   if(occupiedForDate(date))continue;
   const allocated=Math.min(remaining,capacity),after=Math.max(0,remaining-allocated),hoursUsed=Math.max(1,Math.ceil(allocated/rate));
   chain.push({key:date+'-'+chain.length,date,line:plan.production_line,shiftName:plan.shift_name||'Shift A',shiftStart:minutesToClock(start),shiftEnd:minutesToClock(end),rate,capacity,allocated,remaining:after,hoursUsed,productionEnd:minutesToClock(start+hoursUsed*60),manpower:Number(plan.manpower_count||0),hourly:buildHourly(allocated)});
   remaining=after;
  }
  return {quantity,rate,hours,capacity,start,end,chain};
 };
`;
if(!previewPattern.test(source)) throw new Error('preview helper not found');
source=source.replace(previewPattern,previewReplacement);

const manageBody=/<tbody>\{filteredPlans\.map\(plan=>\{[\s\S]*?\}\)\}<\/tbody>/;
const manageReplacement=`<tbody>{filteredPlans.map(plan=>{
 const scanned=planScannedCount(plan),capacity=planCapacity(plan),requirement=planRequirement(plan),pct=capacity?Math.min(100,Math.round(scanned/capacity*100)):0,carry=planCarryForward(plan),preview=planCarryPreview(plan),expanded=expandedManagePlanId===plan.id;
 const sourcePlan=plan.carry_forward_from_plan_id?plans.find(row=>row.id===plan.carry_forward_from_plan_id):null;
 const destination=plan.carry_forward_plan_id?plans.find(row=>row.id===plan.carry_forward_plan_id):null;
 return <React.Fragment key={plan.id}>
  <tr className={expanded?'manage-plan-row is-expanded':'manage-plan-row'} onClick={()=>setExpandedManagePlanId(value=>value===plan.id?'':plan.id)}>
   <td>{plan.production_date}</td>
   <td><div className='activity-product'>{plan.product_name}</div><small>{plan.brand||'—'} · {plan.model} · Requirement {requirement.toLocaleString()} · Shift capacity {capacity.toLocaleString()}</small></td>
   <td>{plan.production_line}<br/><small>{plan.shift_name||'Shift A'} · {formatClock12(String(plan.shift_start||'09:00').slice(0,5))}–{formatClock12(String(plan.shift_end||'18:00').slice(0,5))}</small></td>
   <td><strong>{capacity.toLocaleString()}</strong><br/><small>Req. {requirement.toLocaleString()}</small></td>
   <td>{Number(plan.manpower_count||0).toLocaleString()}</td>
   <td><div className='manage-progress'><div className='progress-track'><div className='progress-fill' style={{width:Math.min(100,pct)+'%'}}/></div><span>{scanned.toLocaleString()} / {capacity.toLocaleString()} ({pct}%)</span></div></td>
   <td><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></td>
   <td><div className='table-actions'>
    <button type='button' onClick={event=>{event.stopPropagation();setExpandedManagePlanId(value=>value===plan.id?'':plan.id);}}>Details</button>
    {carry>0&&<button type='button' onClick={event=>{event.stopPropagation();setCarryForwardSegmentKey(value=>value||((preview?.chain||[])[0]?.key||''));}}>Carry Forward Details</button>}
    {plan.status==='draft'&&<button disabled={busy} onClick={event=>{event.stopPropagation();void startEditPlan(plan)}}>Edit draft</button>}
    {(plan.status==='draft'||plan.status==='active')&&<button onClick={event=>{event.stopPropagation();setSelectedPlan(plan);setView('operator')}}>Operator</button>}
    {(plan.status==='draft'||plan.status==='active')&&<button disabled={statusUpdatingId===plan.id} onClick={event=>{event.stopPropagation();void updatePlanStatus(plan.id,'cancelled')}}>Cancel</button>}
   </div></td>
  </tr>
  {carry>0&&preview?.chain?.map((segment,index)=>{
    const open=carryForwardSegmentKey===segment.key;
    return <React.Fragment key={segment.key}>
     <tr className={open?'manage-carry-row is-open':'manage-carry-row'} onClick={event=>{event.stopPropagation();setCarryForwardSegmentKey(value=>value===segment.key?'':segment.key);}}>
      <td colSpan='8'><div className='manage-carry-subline'><div className='manage-carry-marker'>{index+1}</div><div className='manage-carry-main'><div className='manage-carry-title'><strong>{index===0?'Next available carry-forward shift':'Further carry-forward shift'}</strong> · {segment.allocated.toLocaleString()} units</div><div className='manage-carry-summary'><span><b>{segment.date}</b></span><span>{formatClock12(segment.shiftStart)} – {formatClock12(segment.shiftEnd)}</span><span>{segment.rate.toLocaleString()} units/hr</span><span>Shift capacity {segment.capacity.toLocaleString()}</span><span>Production allocation {segment.allocated.toLocaleString()}</span>{segment.remaining>0&&<span>Then <b>{segment.remaining.toLocaleString()}</b> more</span>}</div></div><button type='button' className='manage-carry-action' onClick={event=>{event.stopPropagation();setCarryForwardSegmentKey(value=>value===segment.key?'':segment.key);}}>{open?'Hide':'View shift details'}</button></div></td>
     </tr>
     {open&&<tr className='manage-carry-details-row'><td colSpan='8'><section className='manage-carry-panel'>
       <div className='manage-carry-header'><div><span className='eyebrow'>CARRY-FORWARD SHIFT {index+1}</span><h3>{segment.allocated.toLocaleString()} units allocated</h3><p className='manage-carry-muted'>{segment.date} · {segment.line} · {segment.shiftName} · full shift {formatClock12(segment.shiftStart)}–{formatClock12(segment.shiftEnd)}</p></div><span className='manage-carry-qty'>{segment.allocated.toLocaleString()}</span></div>
       <div className='manage-carry-detail-grid'><div><span>Hourly rate</span><strong>{segment.rate.toLocaleString()} units/hr</strong></div><div><span>Shift capacity</span><strong>{segment.capacity.toLocaleString()} units</strong></div><div><span>Production allocation</span><strong>{segment.allocated.toLocaleString()} units</strong></div><div><span>Production ends</span><strong>{formatClock12(segment.productionEnd)}</strong></div><div><span>Remaining after shift</span><strong>{segment.remaining.toLocaleString()} units</strong></div><div><span>Manpower</span><strong>{segment.manpower.toLocaleString()}</strong></div></div>
       <div className='manage-hourly-section'><div className='manage-section-title'>Hourly production allocation <span>{segment.allocated.toLocaleString()} / {segment.capacity.toLocaleString()} units</span></div><div className='manage-hourly-grid'>{segment.hourly.map(row=><div className='manage-hour-card' key={row.hour}><strong>{getHourlySlotLabel(row.hour)}</strong><span>{row.planned_qty.toLocaleString()} units planned</span></div>)}</div><div className='manage-carry-availability'>{segment.capacity-segment.allocated>0?<><b>{(segment.capacity-segment.allocated).toLocaleString()} units of this shift remain available</b> for another production plan from {formatClock12(segment.productionEnd)} to {formatClock12(segment.shiftEnd)}.</>:<b>This shift is fully allocated.</b>}</div></div>
       {segment.remaining>0&&<div className='manage-carry-next-note'><b>Next carry-forward:</b> {segment.remaining.toLocaleString()} units will continue to the next available {segment.shiftName} on another day at {segment.rate.toLocaleString()} units/hr.</div>}
     </section></td></tr>}
    </React.Fragment>;
  })}
  {expanded&&<tr className='manage-plan-details-row'><td colSpan='8'><section className='manage-plan-panel'>
   <div className='manage-plan-header'><div><span className='eyebrow'>PRODUCTION PLAN</span><h3>{plan.product_name} · {plan.model}</h3><p>{plan.production_date} · {plan.production_line} · {plan.shift_name||'Shift A'}</p></div><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></div>
   <div className='manage-plan-metrics'><div><span>Shift window</span><strong>{formatClock12(String(plan.shift_start||'09:00').slice(0,5))} – {formatClock12(String(plan.shift_end||'18:00').slice(0,5))}</strong></div><div><span>Hourly rate</span><strong>{planHourlyRate(plan).toLocaleString()} units/hr</strong></div><div><span>Shift capacity</span><strong>{capacity.toLocaleString()}</strong></div><div><span>Batch requirement</span><strong>{requirement.toLocaleString()}</strong></div><div><span>Actual scanned</span><strong>{scanned.toLocaleString()}</strong></div><div><span>Shift remaining</span><strong>{Math.max(0,capacity-scanned).toLocaleString()}</strong></div><div><span>Manpower</span><strong>{Number(plan.manpower_count||0).toLocaleString()}</strong></div><div><span>Plan ID</span><strong>#{plan.id.slice(0,8)}</strong></div></div>
   <div className='manage-hourly-section'><div className='manage-section-title'>Hourly production plan <span>{planHourlyRate(plan).toLocaleString()} units/hr · {capacity.toLocaleString()} shift capacity</span></div><div className='manage-hourly-grid'>{(Array.isArray(plan.hourly_targets)?plan.hourly_targets:[]).filter(row=>Number(row.planned_qty||0)>0).map(row=><div className='manage-hour-card' key={row.hour}><strong>{getHourlySlotLabel(row.hour)}</strong><span>{Number(row.planned_qty||0).toLocaleString()} units planned</span></div>)}</div></div>
   {sourcePlan&&<div className='manage-carry-actual'><b>Carry-forward source:</b> {sourcePlan.production_date} · {sourcePlan.production_line} · {planShiftLabel(sourcePlan)} · {planRequirement(sourcePlan).toLocaleString()} units</div>}
   {destination&&<div className='manage-carry-actual'><b>Next carry-forward:</b> {destination.production_date} · {destination.production_line} · {planShiftLabel(destination)} · requirement {planRequirement(destination).toLocaleString()} · capacity {planCapacity(destination).toLocaleString()}</div>}
  </section></td></tr>}
 </React.Fragment>;
})}</tbody>`;
if(!manageBody.test(source)) throw new Error('Manage Production tbody not found');
source=source.replace(manageBody,manageReplacement);

source=source.replace(/Plan target:/g,'Shift target:');
source=source.replace(/Shift target:\s*\{Number\(dashboardHourlyPlan\.planned_qty\|\|0\)\.toLocaleString\(\)\} units/g,"Shift capacity: {planCapacity(dashboardHourlyPlan).toLocaleString()} units · Batch requirement: {planRequirement(dashboardHourlyPlan).toLocaleString()} units");
source=source.replace(/Shift target:\s*\{Number\(dashboardPlan\.planned_qty\|\|0\)\.toLocaleString\(\)\} units/g,"Shift capacity: {planCapacity(dashboardPlan).toLocaleString()} units · Batch requirement: {planRequirement(dashboardPlan).toLocaleString()} units");

if(source===original)throw new Error('v3 patch produced no changes');
fs.writeFileSync(file,source);
console.log('Production planning v3 carry-forward chain and simplified layout applied.');
