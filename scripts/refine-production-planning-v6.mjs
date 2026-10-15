import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const anchor='const chain=result.chain.map((segment,index)=>{';
if(!source.includes(anchor)) throw new Error('carry-forward chain wrapper not found');
source=source.replace(anchor,"let liveSourceId=plan.id; const chain=result.chain.map((segment,index)=>{ const livePlan=liveSourceId?plans.find(row=>row.production_date===segment.date&&row.production_line===plan.production_line&&row.carry_forward_from_plan_id===liveSourceId):null; if(livePlan)liveSourceId=livePlan.id; else liveSourceId=null;");
source=source.replace("return {...segment,shiftStart:","return {...segment,isLive:Boolean(livePlan),livePlanId:livePlan?.id||'',shiftStart:");
fs.writeFileSync(file,source);
console.log('Live carry-forward plans are now locked from auto-plan editing.');
