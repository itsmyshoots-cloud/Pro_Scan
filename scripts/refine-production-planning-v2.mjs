import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const importAnchor="import {supabase} from './lib/supabase';";
if(!source.includes(importAnchor)) throw new Error('App import anchor not found.');
if(!source.includes("./production-planning-v2.css")) source=source.replace(importAnchor,importAnchor+"\nimport './production-planning-v2.css';");

const previewPattern=/ const planCarryPreview=plan=>\{[\s\S]*?\n \};/;
const previewReplacement=` const planCarryPreview=plan=>{
  if(!plan)return null;
  const destination=plan?.carry_forward_plan_id?plans.find(row=>row.id===plan.carry_forward_plan_id):null;
  const quantity=planCarryForward(plan),rate=Math.max(1,planHourlyRate(plan)),hours=planHours(plan),capacity=Math.max(1,rate*hours);
  const toMinutes=value=>{const parts=String(value||'').slice(0,5).split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:NaN;};
  const start=toMinutes(plan.shift_start),shiftStart=Number.isFinite(start)?start:(getPlanShiftWindow(plan)?.start??540),shiftEnd=shiftStart+hours*60;
  const occupiedForDate=date=>plans.some(row=>row.id!==plan.id&&row.production_date===date&&row.production_line===plan.production_line&&row.status!=='cancelled'&&row.shift_start&&row.shift_end&&shiftStart<toMinutes(row.shift_end)&&shiftEnd>toMinutes(row.shift_start));
  const nextSlot=(fromDate,qty)=>{let cursor=new Date(String(fromDate).slice(0,10)+'T00:00:00');for(let i=0;i<370;i++){cursor.setDate(cursor.getDate()+1);const date=localDateKey(cursor);if(occupiedForDate(date))continue;const allocated=Math.min(qty,capacity),remaining=Math.max(0,qty-allocated);return {date,line:plan.production_line,shiftName:plan.shift_name||'Shift A',start:minutesToClock(shiftStart),end:minutesToClock(shiftEnd),rate,capacity,allocated,remaining,manpower:Number(plan.manpower_count||0)};}return null;};
  if(destination){const next=planCarryForward(destination)>0?nextSlot(destination.production_date,planCarryForward(destination)):null;return {actual:true,plan:destination,quantity,rate,capacity,allocated:Math.min(quantity,capacity),remaining:Math.max(0,quantity-capacity),next};}
  if(quantity<=0)return {actual:false,plan:null,quantity:0,rate,capacity,allocated:0,remaining:0,next:null};
  const first=nextSlot(plan.production_date,quantity);return first?{actual:false,plan:null,quantity,rate,capacity,allocated:first.allocated,remaining:first.remaining,next:first.remaining>0?nextSlot(first.date,first.remaining):null,...first}:{actual:false,plan:null,quantity,rate,capacity,allocated:0,remaining:quantity,next:null};
 };
`;
if(!previewPattern.test(source)) throw new Error('Carry-forward preview helper not found.');
source=source.replace(previewPattern,previewReplacement);

const manageBody=/<tbody>\{filteredPlans\.map\(plan=>\{[\s\S]*?\}\)\}<\/tbody>/;
const manageReplacement=`<tbody>{filteredPlans.map(plan=>{
 const scanned=planScannedCount(plan),capacity=planCapacity(plan),requirement=planRequirement(plan),pct=capacity?Math.min(100,Math.round(scanned/capacity*100)):0,carry=planCarryForward(plan),preview=planCarryPreview(plan),expanded=expandedManagePlanId===plan.id,cfOpen=carryForwardPlanId===plan.id;
 const sourcePlan=plan.carry_forward_from_plan_id?plans.find(row=>row.id===plan.carry_forward_from_plan_id):null;
 const destination=plan.carry_forward_plan_id?plans.find(row=>row.id===plan.carry_forward_plan_id):null;
 const nextCarry=destination?planCarryForward(destination):(preview?.remaining||0),nextAllocation=destination?planCarryPreview(destination):preview?.next;
 const carryDate=destination?.production_date||preview?.date||'';
 const carryShift=destination?planShiftLabel(destination):(preview?.start&&preview?.end?formatClock12(preview.start)+' – '+formatClock12(preview.end):'');
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
    {carry>0&&<button type='button' onClick={event=>{event.stopPropagation();setCarryForwardPlanId(value=>value===plan.id?'':plan.id);}}>Carry Forward Details</button>}
    {plan.status==='draft'&&<button disabled={busy} onClick={event=>{event.stopPropagation();void startEditPlan(plan)}}>Edit draft</button>}
    {(plan.status==='draft'||plan.status==='active')&&<button onClick={event=>{event.stopPropagation();setSelectedPlan(plan);setView('operator')}}>Operator</button>}
    {(plan.status==='draft'||plan.status==='active')&&<button disabled={statusUpdatingId===plan.id} onClick={event=>{event.stopPropagation();void updatePlanStatus(plan.id,'cancelled')}}>Cancel</button>}
   </div></td>
  </tr>
  {carry>0&&<tr className={cfOpen?'manage-carry-row is-open':'manage-carry-row'} onClick={event=>{event.stopPropagation();setCarryForwardPlanId(value=>value===plan.id?'':plan.id);}}>
   <td colSpan='8'><div className='manage-carry-subline'><div className='manage-carry-marker'>↳</div><div className='manage-carry-main'><div className='manage-carry-title'>Carry forward <strong>{carry.toLocaleString()} units</strong></div><div className='manage-carry-summary'><span>Next available shift: <b>{carryDate||'Pending allocation'}</b></span><span>{carryShift||'Same configured shift window'}</span><span>{(destination?planHourlyRate(destination):preview?.rate||planHourlyRate(plan)).toLocaleString()} units/hr</span><span>Shift capacity {(destination?planCapacity(destination):preview?.capacity||capacity).toLocaleString()}</span>{nextCarry>0&&<span>Then carry <b>{nextCarry.toLocaleString()}</b> more</span>}</div></div><button type='button' className='manage-carry-action' onClick={event=>{event.stopPropagation();setCarryForwardPlanId(value=>value===plan.id?'':plan.id);}}>{cfOpen?'Hide details':'View details'}</button></div></td>
  </tr>}
  {cfOpen&&carry>0&&<tr className='manage-carry-details-row'><td colSpan='8'><section className='manage-carry-panel'>
   <div className='manage-carry-header'><div><span className='eyebrow'>CARRY FORWARD ALLOCATION</span><h3>{carry.toLocaleString()} units to continue</h3></div><span className='manage-carry-qty'>{carry.toLocaleString()}</span></div>
   <div className='manage-carry-source'><b>Source shift</b><span>{plan.production_date}</span><span>{plan.production_line}</span><span>{planShiftLabel(plan)}</span><span>{planHourlyRate(plan).toLocaleString()} units/hr</span><span>Capacity {capacity.toLocaleString()}</span><span>Requirement {requirement.toLocaleString()}</span><span>Scanned {scanned.toLocaleString()}</span></div>
   <div className='manage-carry-flow'>
    <div className='manage-carry-step current'><span className='step-no'>1</span><div><b>Current shift</b><strong>{capacity.toLocaleString()} units capacity</strong><small>{Math.max(0,requirement-capacity).toLocaleString()} units are beyond this shift's planned capacity.</small></div></div>
    <div className='manage-carry-arrow'>↓</div>
    <div className='manage-carry-step next'><span className='step-no'>2</span><div><b>{destination?'Allocated shift':'Next available shift'}</b><strong>{destination?destination.production_date:(preview?.date||'—')} · {destination?planShiftLabel(destination):carryShift||'—'}</strong><small>{(destination?planHourlyRate(destination):preview?.rate||planHourlyRate(plan)).toLocaleString()} units/hr · shift capacity {(destination?planCapacity(destination):preview?.capacity||capacity).toLocaleString()} · carry-forward batch {(destination?planRequirement(destination):preview?.allocated||carry).toLocaleString()} units</small></div></div>
    {nextCarry>0&&<><div className='manage-carry-arrow'>↓</div><div className='manage-carry-step pending'><span className='step-no'>3</span><div><b>Further carry-forward</b><strong>{nextCarry.toLocaleString()} units</strong><small>Next available day keeps the same shift window and rate. The shift is never extended.</small>{nextAllocation&&<em>{nextAllocation.date} · {formatClock12(nextAllocation.start)} – {formatClock12(nextAllocation.end)} · capacity {nextAllocation.capacity.toLocaleString()}</em>}</div></div></>}
   </div>
   {destination&&<div className='manage-carry-actual'><b>Allocated plan:</b> #{destination.id.slice(0,8)} · {destination.status} · batch requirement {planRequirement(destination).toLocaleString()} · capacity {planCapacity(destination).toLocaleString()} · manpower {Number(destination.manpower_count||0).toLocaleString()}</div>}
   {sourcePlan&&<div className='manage-carry-actual'><b>Received from:</b> {sourcePlan.production_date} · {sourcePlan.production_line} · {planShiftLabel(sourcePlan)} · {planRequirement(sourcePlan).toLocaleString()} units</div>}
  </section></td></tr>}
  {expanded&&<tr className='manage-plan-details-row'><td colSpan='8'><section className='manage-plan-panel'>
   <div className='manage-plan-header'><div><span className='eyebrow'>PRODUCTION PLAN</span><h3>{plan.product_name} · {plan.model}</h3><p>{plan.production_date} · {plan.production_line} · {plan.shift_name||'Shift A'}</p></div><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></div>
   <div className='manage-plan-metrics'><div><span>Shift window</span><strong>{planShiftLabel(plan)}</strong></div><div><span>Hourly rate</span><strong>{planHourlyRate(plan).toLocaleString()} units/hr</strong></div><div><span>Shift capacity</span><strong>{capacity.toLocaleString()}</strong></div><div><span>Batch requirement</span><strong>{requirement.toLocaleString()}</strong></div><div><span>Actual scanned</span><strong>{scanned.toLocaleString()}</strong></div><div><span>Shift remaining</span><strong>{Math.max(0,capacity-scanned).toLocaleString()}</strong></div><div><span>Manpower</span><strong>{Number(plan.manpower_count||0).toLocaleString()}</strong></div><div><span>Plan ID</span><strong>#{plan.id.slice(0,8)}</strong></div></div>
   <div className='manage-hourly-section'><div className='manage-section-title'>Hourly production plan <span>{planHourlyRate(plan).toLocaleString()} units/hr · {capacity.toLocaleString()} shift capacity</span></div><div className='manage-hourly-grid'>{(Array.isArray(plan.hourly_targets)?plan.hourly_targets:[]).map(row=><div className='manage-hour-card' key={row.hour}><strong>{getHourlySlotLabel(row.hour)}</strong><span>{Number(row.planned_qty||0).toLocaleString()} units planned</span></div>)}</div></div>
  </section></td></tr>}
 </React.Fragment>;
})}</tbody>`;
if(!manageBody.test(source)) throw new Error('Manage Production table body anchor not found.');
source=source.replace(manageBody,manageReplacement);

if(source===original) throw new Error('Production planning v2 patch produced no changes.');
fs.writeFileSync(file,source);
console.log('Production planning v2 layout/allocation refinement applied.');
