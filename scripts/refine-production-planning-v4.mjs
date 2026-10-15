import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const state="const [carryForwardSegmentKey,setCarryForwardSegmentKey]=useState('');";
if(!source.includes('carryForwardEditKey')){
 if(!source.includes(state)) throw new Error('carry-forward state not found');
 source=source.replace(state,state+" const [carryForwardEditKey,setCarryForwardEditKey]=useState(''); const [carryForwardEdits,setCarryForwardEdits]=useState({});");
}

const preview=/ const planCarryPreview=plan=>\{[\s\S]*?\n \};/;
const match=source.match(preview);
if(!match) throw new Error('planCarryPreview not found');
const wrapper=`
 const basePlanCarryPreview=planCarryPreview;
 planCarryPreview=plan=>{
  const result=basePlanCarryPreview(plan); if(!result)return result;
  let remaining=result.quantity, inheritedRate=result.rate, inheritedStart=result.start, inheritedEnd=result.end, inheritedManpower=Number(plan.manpower_count||0);
  const chain=result.chain.map((segment,index)=>{
   const edit=carryForwardEdits[segment.key]||{};
   const rate=Math.max(1,Math.floor(Number(edit.rate??inheritedRate)||inheritedRate));
   const startParts=String(edit.shiftStart??segment.shiftStart).slice(0,5).split(':').map(Number), endParts=String(edit.shiftEnd??segment.shiftEnd).slice(0,5).split(':').map(Number);
   const start=startParts.length===2&&startParts.every(Number.isFinite)?startParts[0]*60+startParts[1]:inheritedStart;
   const end=endParts.length===2&&endParts.every(Number.isFinite)&&endParts[0]*60+endParts[1]>start?endParts[0]*60+endParts[1]:inheritedEnd;
   const hours=Math.max(1,Math.floor((end-start)/60)),capacity=rate*hours;
   const requested=edit.allocated===undefined?capacity:Math.max(0,Math.floor(Number(edit.allocated)||0));
   const allocated=Math.min(remaining,requested),after=Math.max(0,remaining-allocated),hoursUsed=allocated?Math.max(1,Math.ceil(allocated/rate)):0;
   const manpower=Math.max(0,Math.floor(Number(edit.manpower??inheritedManpower)||0));
   const hourly=[]; let left=allocated; for(let h=0;h<hours&&left>0;h++){const amount=Math.min(rate,left);hourly.push({hour:minutesToClock(start+h*60),planned_qty:amount});left-=amount;}
   remaining=after; inheritedRate=rate; inheritedStart=start; inheritedEnd=end; inheritedManpower=manpower;
   return {...segment,shiftStart:minutesToClock(start),shiftEnd:minutesToClock(end),rate,capacity,allocated,remaining:after,hoursUsed,productionEnd:minutesToClock(start+hoursUsed*60),manpower,hourly};
  });
  return {...result,chain};
 };
`;
source=source.replace(match[0],match[0]+wrapper);

source=source.replace(/\{carry>0&&<button type='button' onClick=\{event=>\{event\.stopPropagation\(\);setCarryForwardSegmentKey\([^}]+\}\}>Carry Forward Details<\/button>\}/,'');
source=source.replace(/<div className='manage-carry-availability'>[\s\S]*?<\/div>/,'');
source=source.replace("setCarryForwardSegmentKey(value=>value===segment.key?'':segment.key);}}>","setExpandedManagePlanId('');setCarryForwardSegmentKey(value=>value===segment.key?'':segment.key);setCarryForwardEditKey('');}}>");
source=source.replace("setCarryForwardSegmentKey(value=>value===segment.key?'':segment.key);}}>{open?'Hide':'View shift details'}", "setExpandedManagePlanId('');setCarryForwardSegmentKey(value=>value===segment.key?'':segment.key);setCarryForwardEditKey('');}}>{open?'Hide':'View shift details'}");

const hourly="<div className='manage-hourly-section'><div className='manage-section-title'>Hourly production allocation";
if(!source.includes("manage-carry-edit")){
 const edit=`<div className='manage-carry-edit'>{!segment.isLive&&<>{carryForwardEditKey===segment.key?<div className='manage-carry-edit-form'><div><span className='eyebrow'>AUTO-GENERATED · NOT LIVE</span><strong>Edit carry-forward shift</strong><small>Changes immediately recalculate the next carry-forward shift.</small></div><div className='manage-carry-edit-grid'><label>Allocation<input type='number' min='0' value={carryForwardEdits[segment.key]?.allocated??segment.allocated} onChange={event=>setCarryForwardEdits(prev=>({...prev,[segment.key]:{...(prev[segment.key]||{}),allocated:Math.max(0,Math.floor(Number(event.target.value)||0))}}))}/></label><label>Rate / hour<input type='number' min='1' value={carryForwardEdits[segment.key]?.rate??segment.rate} onChange={event=>setCarryForwardEdits(prev=>({...prev,[segment.key]:{...(prev[segment.key]||{}),rate:Math.max(1,Math.floor(Number(event.target.value)||1))}}))}/></label><label>Shift start<input type='time' value={carryForwardEdits[segment.key]?.shiftStart??segment.shiftStart.slice(0,5)} onChange={event=>setCarryForwardEdits(prev=>({...prev,[segment.key]:{...(prev[segment.key]||{}),shiftStart:event.target.value}}))}/></label><label>Shift end<input type='time' value={carryForwardEdits[segment.key]?.shiftEnd??segment.shiftEnd.slice(0,5)} onChange={event=>setCarryForwardEdits(prev=>({...prev,[segment.key]:{...(prev[segment.key]||{}),shiftEnd:event.target.value}}))}/></label><label>Manpower<input type='number' min='0' value={carryForwardEdits[segment.key]?.manpower??segment.manpower} onChange={event=>setCarryForwardEdits(prev=>({...prev,[segment.key]:{...(prev[segment.key]||{}),manpower:Math.max(0,Math.floor(Number(event.target.value)||0))}}))}/></label></div><div className='manage-carry-edit-actions'><button type='button' className='primary' onClick={()=>setCarryForwardEditKey('')}>Save changes</button><button type='button' onClick={()=>{setCarryForwardEdits(prev=>{const next={...prev};delete next[segment.key];return next;});setCarryForwardEditKey('');}}>Reset</button></div></div>:<div className='manage-carry-edit-compact'><div><strong>Auto-generated carry-forward</strong><span>Not live yet · editable before activation.</span></div><button type='button' onClick={event=>{event.stopPropagation();setCarryForwardEditKey(segment.key);}}>Edit shift</button></div>}</>}{segment.isLive&&<div className='manage-carry-live-note'><strong>LIVE CARRY-FORWARD</strong><span>This shift is already created in production planning.</span></div>}</div>`;
 if(!source.includes(hourly)) throw new Error('hourly allocation anchor not found');
 source=source.replace(hourly,edit+hourly);
}

if(source===original) throw new Error('v4 made no changes');
fs.writeFileSync(file,source);
console.log('Carry-forward editing and inline detail behavior applied.');
