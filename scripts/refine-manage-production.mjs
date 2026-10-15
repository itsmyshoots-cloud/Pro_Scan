import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

// State for inline Manage Production details.
const stateAnchor=" const [planStatusFilter,setPlanStatusFilter]=useState('all'); const [manageFilters,setManageFilters]=useState({date_from:'',date_to:'',month:'all',model:'all',production_line:'all'}); const [statusUpdatingId,setStatusUpdatingId]=useState('');";
const stateReplacement=stateAnchor+" const [expandedManagePlanId,setExpandedManagePlanId]=useState(''); const [carryForwardPlanId,setCarryForwardPlanId]=useState('');";
if(!source.includes(stateAnchor)) throw new Error('Manage Production state anchor not found.');
source=source.replace(stateAnchor,stateReplacement);

// Helpers for hourly rate and the next automatically allotted carry-forward shift.
const helperAnchor=" const planCapacity=plan=>Number(plan?.shift_planned_qty??plan?.planned_qty??0);\n const planRequirement=plan=>Number(plan?.planned_qty||0);\n const planCarryForward=plan=>{const explicit=Number(plan?.carry_forward_qty||0);return explicit>0?explicit:Math.max(0,planRequirement(plan)-planCapacity(plan));};\n";
const helperAdd=` const planHours=plan=>{const shift=getPlanShiftWindow(plan);return shift?Math.max(1,Math.round((shift.end-shift.start)/60)):Math.max(1,Array.isArray(plan?.hourly_targets)?plan.hourly_targets.length:1);};
 const planHourlyRate=plan=>{const first=Array.isArray(plan?.hourly_targets)?plan.hourly_targets.find(row=>Number(row?.planned_qty||0)>0):null;return Math.max(0,Math.floor(Number(first?.planned_qty??(planCapacity(plan)/planHours(plan)))||0));};
 const planScannedCount=plan=>monitoringSerials.filter(row=>row.plan_id===plan?.id&&row.status==='scanned').length;
 const planCarryPreview=plan=>{
  if(!plan)return null;
  const destination=plan?.carry_forward_plan_id?plans.find(row=>row.id===plan.carry_forward_plan_id):null;
  if(destination)return {actual:true,plan:destination,quantity:planCarryForward(plan)};
  const quantity=planCarryForward(plan),rate=Math.max(1,planHourlyRate(plan));
  if(quantity<=0)return {actual:false,plan:null,quantity:0};
  const dateValue=String(plan.production_date||'').slice(0,10);
  const nextDate=new Date(dateValue+'T00:00:00');
  if(Number.isNaN(nextDate.getTime()))return {actual:false,plan:null,quantity};
  nextDate.setDate(nextDate.getDate()+1);
  const targetDate=localDateKey(nextDate);
  const occupied=plans.filter(row=>row.id!==plan.id&&row.production_date===targetDate&&row.production_line===plan.production_line&&row.status!=='cancelled'&&row.shift_start&&row.shift_end).sort((a,b)=>String(a.shift_start).localeCompare(String(b.shift_start)));
  const toMinutes=value=>{const parts=String(value||'').slice(0,5).split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:NaN;};
  let candidateStart=toMinutes(plan.shift_start);
  if(!Number.isFinite(candidateStart)){const shift=getPlanShiftWindow(plan);candidateStart=shift?.start??540;}
  const neededHours=Math.max(1,Math.ceil(quantity/rate));
  for(const row of occupied){
   const occupiedStart=toMinutes(row.shift_start),occupiedEnd=toMinutes(row.shift_end);
   if(!Number.isFinite(occupiedStart)||!Number.isFinite(occupiedEnd))continue;
   if(candidateStart+neededHours*60<=occupiedStart)break;
   if(candidateStart<occupiedEnd)candidateStart=occupiedEnd;
  }
  const candidateEnd=candidateStart+neededHours*60;
  const startClock=minutesToClock(candidateStart),endClock=minutesToClock(candidateEnd);
  return {actual:false,plan:null,quantity,date:targetDate,line:plan.production_line,shiftName:plan.shift_name||'Shift A',start:startClock,end:endClock,rate,capacity:quantity,manpower:Number(plan.manpower_count||0),hours:neededHours};
 };
`;
if(!source.includes(helperAnchor)) throw new Error('Production planning helper anchor not found.');
source=source.replace(helperAnchor,helperAnchor+helperAdd);

// Operator view: separate shift capacity from the full batch requirement.
source=source.replace(
 "<div className='operator-assignment-details'><span>{selectedPlan.production_line}</span><i/> <span>{planShiftLabel(selectedPlan)}</span><i/> <span>{Number(selectedPlan.planned_qty||0).toLocaleString()} units</span><i/> <span>#{selectedPlan.id.slice(0,8)}</span></div>",
 "<div className='operator-assignment-details'><span>{selectedPlan.production_line}</span><i/> <span>{planShiftLabel(selectedPlan)}</span><i/> <span>Shift capacity {planCapacity(selectedPlan).toLocaleString()}</span><i/> <span>Batch requirement {planRequirement(selectedPlan).toLocaleString()}</span><i/> <span>Carry forward {planCarryForward(selectedPlan).toLocaleString()}</span><i/> <span>#{selectedPlan.id.slice(0,8)}</span></div>"
);
source=source.replace(
 "<div className='operator-side-card-heading'><span>PLAN PROGRESS</span><strong>{Number(selectedPlan.planned_qty||0)?Math.min(100,Math.round(scannedSerials.length/Number(selectedPlan.planned_qty)*100)):0}%</strong></div>",
 "<div className='operator-side-card-heading'><span>SHIFT PROGRESS</span><strong>{planCapacity(selectedPlan)?Math.min(100,Math.round(scannedSerials.length/planCapacity(selectedPlan)*100)):0}%</strong></div>"
);
source=source.replace(
 "<div className='operator-progress-track'><div style={{width:(Number(selectedPlan.planned_qty||0)?Math.min(100,scannedSerials.length/Number(selectedPlan.planned_qty)*100):0)+'%'}}/></div>",
 "<div className='operator-progress-track'><div style={{width:(planCapacity(selectedPlan)?Math.min(100,scannedSerials.length/planCapacity(selectedPlan)*100):0)+'%'}}/></div>"
);
source=source.replace(
 "<div className='operator-progress-numbers'><div><span>Scanned</span><strong>{scannedSerials.length.toLocaleString()}</strong></div><div><span>Remaining</span><strong>{pendingSerials.length.toLocaleString()}</strong></div><div><span>Target</span><strong>{Number(selectedPlan.planned_qty||0).toLocaleString()}</strong></div></div>",
 "<div className='operator-progress-numbers'><div><span>Scanned</span><strong>{scannedSerials.length.toLocaleString()}</strong></div><div><span>Shift remaining</span><strong>{Math.max(0,planCapacity(selectedPlan)-scannedSerials.length).toLocaleString()}</strong></div><div><span>Shift capacity</span><strong>{planCapacity(selectedPlan).toLocaleString()}</strong></div></div>"
);
source=source.replace(
 "<span>PLANNED QTY</span><strong>{Number(selectedPlan.planned_qty||0).toLocaleString()}</strong><small>Click to view all planned serials</small>",
 "<span>SHIFT CAPACITY</span><strong>{planCapacity(selectedPlan).toLocaleString()}</strong><small>Allocated for this shift</small>"
);
source=source.replace(
 "<span>REMAINING QTY</span><strong>{pendingSerials.length.toLocaleString()}</strong><small>Click to view remaining serials</small>",
 "<span>SHIFT REMAINING</span><strong>{Math.max(0,planCapacity(selectedPlan)-scannedSerials.length).toLocaleString()}</strong><small>Remaining within this shift</small>"
);
source=source.replace(
 "   <section className='operator-shift-info'>\n    <div><span>SHIFT WINDOW</span><strong>{planShiftLabel(selectedPlan)}</strong></div>\n    <div><span>PRODUCTION LINE</span><strong>{selectedPlan.production_line}</strong></div>\n    <div><span>PLAN STATUS</span><strong className={'operator-status-text status-'+selectedPlan.status}>{selectedPlan.status.toUpperCase()}</strong></div>\n   </section>",
 "   <section className='operator-shift-info'>\n    <div><span>SHIFT WINDOW</span><strong>{planShiftLabel(selectedPlan)}</strong></div>\n    <div><span>HOURLY PRODUCTION RATE</span><strong>{planHourlyRate(selectedPlan).toLocaleString()} units/hr</strong></div>\n    <div><span>SHIFT CAPACITY</span><strong>{planCapacity(selectedPlan).toLocaleString()} units</strong></div>\n    <div><span>BATCH REQUIREMENT</span><strong>{planRequirement(selectedPlan).toLocaleString()} units</strong></div>\n    <div><span>CARRY FORWARD</span><strong>{planCarryForward(selectedPlan).toLocaleString()} units</strong></div>\n    <div><span>MANPOWER</span><strong>{Number(selectedPlan.manpower_count||0).toLocaleString()}</strong></div>\n    <div><span>PRODUCTION LINE</span><strong>{selectedPlan.production_line}</strong></div>\n    <div><span>PLAN STATUS</span><strong className={'operator-status-text status-'+selectedPlan.status}>{selectedPlan.status.toUpperCase()}</strong></div>\n   </section>"
);
source=source.replace(
 "const completedByThisScan=Number(selectedPlan.planned_qty||0)>0&&planSerials.filter(row=>row.status==='scanned').length+1>=Number(selectedPlan.planned_qty||0);",
 "const completedByThisScan=planCapacity(selectedPlan)>0&&planSerials.filter(row=>row.status==='scanned').length+1>=planCapacity(selectedPlan);"
);
source=source.replace(
 "const successMessage=completedByThisScan?'✓ PLAN TARGET REACHED · '+data.serial_number:",
 "const successMessage=completedByThisScan?'✓ SHIFT CAPACITY REACHED · '+data.serial_number:"
);

// Replace the entire Manage Production table body with expandable plan rows and row-level carry-forward details.
const manageBody=/\<tbody>\{filteredPlans\.map\(plan=>\{[\s\S]*?\}\)\}<\/tbody>/;
const manageReplacement=`<tbody>{filteredPlans.map(plan=>{
 const scanned=planScannedCount(plan),capacity=planCapacity(plan),requirement=planRequirement(plan),pct=capacity?Math.min(100,Math.round(scanned/capacity*100)):0,carry=planCarryForward(plan),preview=planCarryPreview(plan),expanded=expandedManagePlanId===plan.id,cfOpen=carryForwardPlanId===plan.id;
 const sourcePlan=plan.carry_forward_from_plan_id?plans.find(row=>row.id===plan.carry_forward_from_plan_id):null;
 const destination=plan.carry_forward_plan_id?plans.find(row=>row.id===plan.carry_forward_plan_id):null;
 return <React.Fragment key={plan.id}>
  <tr style={{cursor:'pointer'}} className={expanded?'manage-plan-row is-expanded':'manage-plan-row'} onClick={()=>setExpandedManagePlanId(value=>value===plan.id?'':plan.id)}>
   <td>{plan.production_date}</td>
   <td><div className='activity-product'>{plan.product_name}</div><small>{plan.brand||'—'} · {plan.model} · Requirement {requirement.toLocaleString()} · Capacity {capacity.toLocaleString()}</small></td>
   <td>{plan.production_line}<br/><small>{plan.shift_name||'Shift A'} · {formatClock12(String(plan.shift_start||'09:00').slice(0,5))}–{formatClock12(String(plan.shift_end||'18:00').slice(0,5))}</small></td>
   <td><strong>{capacity.toLocaleString()}</strong><br/><small>Req. {requirement.toLocaleString()}</small></td>
   <td>{Number(plan.manpower_count||0).toLocaleString()}</td>
   <td><div className='manage-progress'><div className='progress-track'><div className='progress-fill' style={{width:Math.min(100,pct)+'%'}}/></div><span>{scanned.toLocaleString()} / {capacity.toLocaleString()} ({pct}%)</span></div></td>
   <td><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></td>
   <td><div className='table-actions'>
    <button type='button' onClick={event=>{event.stopPropagation();setExpandedManagePlanId(value=>value===plan.id?'':plan.id);}}>Details</button>
    <button type='button' onClick={event=>{event.stopPropagation();setCarryForwardPlanId(value=>value===plan.id?'':plan.id);setExpandedManagePlanId(plan.id);}}>{cfOpen?'Hide CF':'Carry Forward Details'}</button>
    {plan.status==='draft'&&<button disabled={busy} onClick={event=>{event.stopPropagation();void startEditPlan(plan)}}>Edit draft</button>}
    {(plan.status==='draft'||plan.status==='active')&&<button onClick={event=>{event.stopPropagation();setSelectedPlan(plan);setView('operator')}}>Operator</button>}
    {(plan.status==='draft'||plan.status==='active')&&<button disabled={statusUpdatingId===plan.id} onClick={event=>{event.stopPropagation();void updatePlanStatus(plan.id,'cancelled')}}>Cancel</button>}
   </div></td>
  </tr>
  {expanded&&<tr className='manage-plan-details-row'><td colSpan='8' style={{padding:'0 18px 18px'}}>
   <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.25fr) minmax(320px,1fr)',gap:'14px',padding:'16px',border:'1px solid #dbe5f1',borderRadius:'16px',background:'#f8fafc'}}>
    <section style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'14px',padding:'16px'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'flex-start',marginBottom:'12px'}}><div><span className='eyebrow'>PLAN DETAILS</span><h3 style={{margin:'4px 0 0'}}>Production plan</h3></div><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></div>
     <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'10px'}}>
      <div><b>Production date</b><strong>{plan.production_date}</strong></div>
      <div><b>Line</b><strong>{plan.production_line||'—'}</strong></div>
      <div><b>Shift</b><strong>{plan.shift_name||'Shift A'}</strong></div>
      <div><b>Shift window</b><strong>{planShiftLabel(plan)}</strong></div>
      <div><b>Hourly rate</b><strong>{planHourlyRate(plan).toLocaleString()} units/hr</strong></div>
      <div><b>Shift capacity</b><strong>{capacity.toLocaleString()} units</strong></div>
      <div><b>Batch requirement</b><strong>{requirement.toLocaleString()} units</strong></div>
      <div><b>Actual scanned</b><strong>{scanned.toLocaleString()} units</strong></div>
      <div><b>Shift remaining</b><strong>{Math.max(0,capacity-scanned).toLocaleString()} units</strong></div>
      <div><b>Manpower</b><strong>{Number(plan.manpower_count||0).toLocaleString()}</strong></div>
      <div><b>Carry forward</b><strong>{carry.toLocaleString()} units</strong></div>
      <div><b>Plan ID</b><strong>#{plan.id.slice(0,8)}</strong></div>
     </div>
     <div style={{marginTop:'14px'}}><div style={{fontSize:'11px',fontWeight:800,color:'#64748b',textTransform:'uppercase',marginBottom:'8px'}}>Hourly production plan</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:'8px'}}>{(Array.isArray(plan.hourly_targets)?plan.hourly_targets:[]).map(row=><div key={row.hour} style={{border:'1px solid #edf0f4',borderRadius:'10px',padding:'8px 10px'}}><strong>{getHourlySlotLabel(row.hour)}</strong><small style={{display:'block',color:'#64748b',marginTop:'3px'}}>{Number(row.planned_qty||0).toLocaleString()} units planned</small></div>)}</div></div>
    </section>
    <section style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'14px',padding:'16px'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'flex-start',marginBottom:'12px'}}><div><span className='eyebrow'>CARRY FORWARD</span><h3 style={{margin:'4px 0 0'}}>Carry-forward allocation</h3></div><span style={{fontWeight:800,fontSize:'20px',color:'#c2410c'}}>{carry.toLocaleString()}</span></div>
     {carry>0?<div>
      <div style={{padding:'12px',borderRadius:'12px',background:'#fff7ed',border:'1px solid #fed7aa'}}><strong>{carry.toLocaleString()} units</strong> will move to the next available production shift if this plan closes unfinished.</div>
      <div style={{marginTop:'12px',display:'grid',gap:'8px'}}>
       <div><b>Source:</b> {sourcePlan?sourcePlan.production_date+' · '+sourcePlan.production_line+' · '+planShiftLabel(sourcePlan):plan.production_date+' · '+plan.production_line+' · '+planShiftLabel(plan)}</div>
       {destination?<div><b>Auto-allotted shift:</b> {destination.production_date} · {destination.production_line} · {destination.shift_name||'Shift A'} · {planShiftLabel(destination)} · {planHourlyRate(destination).toLocaleString()} units/hr · capacity {planCapacity(destination).toLocaleString()} · manpower {Number(destination.manpower_count||0).toLocaleString()}</div>:preview?<div><b>Next auto-allotted shift (preview):</b> {preview.date} · {preview.line} · {preview.shiftName} · {formatClock12(preview.start)}–{formatClock12(preview.end)} · {preview.rate.toLocaleString()} units/hr · capacity {preview.capacity.toLocaleString()} · manpower {preview.manpower.toLocaleString()}</div>:<div><b>Next auto-allotted shift:</b> Will be calculated from the next available shift on this production line.</div>}
       {sourcePlan&&<div><b>Received from:</b> {sourcePlan.production_date} · {sourcePlan.production_line} · {planShiftLabel(sourcePlan)} · {planRequirement(sourcePlan).toLocaleString()} batch requirement</div>}
       {destination&&<div><b>Moved to plan:</b> #{destination.id.slice(0,8)} · {destination.status}</div>}
      </div>
     </div>:<div style={{padding:'12px',borderRadius:'12px',background:'#f8fafc',border:'1px dashed #cbd5e1',color:'#64748b'}}>No carry-forward quantity is currently pending for this plan.</div>}
     <div style={{marginTop:'14px',fontSize:'12px',color:'#64748b'}}>Click the <b>Carry Forward Details</b> button in the row to focus this section.</div>
    </section>
   </div>
  </td></tr>}
 </React.Fragment>;
})}</tbody>`;
if(!manageBody.test(source)) throw new Error('Manage Production table body anchor not found.');
source=source.replace(manageBody,manageReplacement);

if(source===original) throw new Error('No Manage Production refinement changes were produced.');
fs.writeFileSync(file,source);
console.log('Manage Production detail/carry-forward refinement applied.');
