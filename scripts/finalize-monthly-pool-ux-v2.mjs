import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
let changed=false;
const stateAnchor=" const [monthlyEditingId,setMonthlyEditingId]=useState('');";
if(source.includes(stateAnchor)&&!source.includes('monthlyPoolStats')){
 source=source.replace(stateAnchor,stateAnchor+" const [monthlyPoolStats,setMonthlyPoolStats]=useState({total:0,allocated:0});");
 changed=true;
}
const loaderAnchor=" const loadMonthlyPlans=async()=>{";
const helperStart=source.indexOf('const getMonthlyPlanDailyAllocationCount=async planId=>{');
const helperEnd=source.indexOf(loaderAnchor,helperStart);
if(helperStart<0||helperEnd<0)throw new Error('Monthly Plan allocation helper insertion range not found.');
const helper="const getMonthlyPlanDailyAllocationCount=async planId=>{const {data:poolRows,error:poolError}=await supabase.from('monthly_plan_serials').select('id,serial_number').eq('monthly_plan_id',planId);if(poolError)throw poolError;const poolIds=new Set((poolRows||[]).map(row=>String(row.id)));const poolSerials=new Set((poolRows||[]).map(row=>String(row.serial_number||'').trim().toUpperCase()).filter(Boolean));const allocated=new Set();for(let from=0;;from+=500){const {data,error}=await supabase.from('plan_serials').select('monthly_plan_serial_id,serial_number').range(from,from+499);if(error)throw error;for(const row of data||[]){const id=String(row.monthly_plan_serial_id||'');const serial=String(row.serial_number||'').trim().toUpperCase();if((id&&poolIds.has(id))||(serial&&poolSerials.has(serial)))allocated.add(id&&poolIds.has(id)?id:serial);}if(!data||data.length<500)break;}return allocated.size;};const openMonthlyPlanEditWithAllocationGuard=async plan=>{if(!plan)return;setMonthlyMessage('Checking Daily Plan allocations…');setMonthlyBusy(true);try{const allocatedCount=await getMonthlyPlanDailyAllocationCount(plan.id);const total=Number(plan.total_qty||0);setMonthlyPoolStats({total,allocated:allocatedCount});if(allocatedCount>0){setMonthlyEditingId('');setMonthlyMessage('Editing is locked. This Monthly Plan already has '+allocatedCount.toLocaleString()+' serial(s) allocated to Daily Plans. Monthly details and quantity pool cannot be changed.');return;}setMonthlyEditingId(plan.id);setMonthlySelectedId(plan.id);setMonthlyForm({plan_month:String(plan.plan_month||'').slice(0,7),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',mrp:String(plan.mrp??'')});setMonthlyRows([]);setMonthlyFile('');setMonthlyMessage('Update the Monthly Plan details or upload an additional quantity-pool PDF/CSV/TXT.');}catch(error){const detail=error?.message||error?.details||error?.hint||error?.code||JSON.stringify(error);setMonthlyMessage('Could not verify Daily Plan restrictions: '+detail);}finally{setMonthlyBusy(false);}};";
source=source.slice(0,helperStart)+helper+'\n'+source.slice(helperEnd);
changed=true;
const oldQty="<div className='monthly-import-count'><span>Ready serials</span><strong>{monthlyRows.length.toLocaleString()}</strong></div>";
const newQty="<div className='monthly-import-count monthly-pool-stats'><div><span>Current available</span><strong>{Math.max(0,monthlyPoolStats.total-monthlyPoolStats.allocated).toLocaleString()}</strong></div><div><span>New pool ready</span><strong>{monthlyRows.length.toLocaleString()}</strong></div><div><span>Final available</span><strong>{(Math.max(0,monthlyPoolStats.total-monthlyPoolStats.allocated)+monthlyRows.length).toLocaleString()}</strong></div></div>";
if(source.includes(oldQty)){source=source.replace(oldQty,newQty);changed=true;}
else if(!source.includes('monthly-pool-stats'))throw new Error('Monthly Plan quantity summary markup not found.');
const oldRemove="disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0} title={Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0?'Cannot remove while serials are allocated to Daily Plans':'Remove this Monthly Plan'}";
if(source.includes(oldRemove)){source=source.replace(oldRemove,"disabled={monthlyBusy} title='Remove this Monthly Plan'");changed=true;}
else if(source.includes("planningMetrics.monthly?.[plan.id]?.planned||0)>0"))throw new Error('Remove button disabled condition did not match expected markup.');
const noticeMarker="{monthlyMessage&&<div className='notice'>{monthlyMessage}</div>}";
if(source.includes(noticeMarker)){source=source.replace(noticeMarker,"{monthlyMessage&&<div className='notice monthly-global-toast' role='status' aria-live='polite'>{monthlyMessage}</div>}");changed=true;}
const cssFile='src/monthly-production.css';
let css=fs.readFileSync(cssFile,'utf8');
if(!css.includes('monthly-pool-ux-v2')){
 css+=`
/* monthly-pool-ux-v2 */
.monthly-global-toast{position:fixed!important;top:18px!important;right:22px!important;left:auto!important;z-index:20050!important;width:min(620px,calc(100vw - 36px))!important;margin:0!important;padding:14px 18px!important;box-shadow:0 12px 36px rgba(15,23,42,.22)!important;border:1px solid #b9d4ff!important;background:#eff6ff!important;color:#1746a2!important;border-radius:12px!important;animation:monthlyToastIn .18s ease-out}
@keyframes monthlyToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.monthly-pool-stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;min-width:0!important}
.monthly-pool-stats>div{display:flex;flex-direction:column;justify-content:center;gap:5px;padding:10px 12px;border:1px solid #d9e6f8;border-radius:12px;background:#f7faff;min-width:0}
.monthly-pool-stats span{font-size:11px;font-weight:800;color:#647796;white-space:nowrap}
.monthly-pool-stats strong{font-size:23px;font-weight:850;color:#132d5d;line-height:1.1}
.monthly-plan-actions .monthly-remove-action:disabled{opacity:.55;cursor:wait}
@media(max-width:760px){.monthly-pool-stats{grid-template-columns:1fr!important}.monthly-global-toast{right:10px!important;top:10px!important;width:calc(100vw - 20px)!important}}
`;
 fs.writeFileSync(cssFile,css);
 changed=true;
}
if(!changed)throw new Error('Monthly pool UX finalizer made no changes.');
fs.writeFileSync(file,source);
console.log('Monthly edit quantity summary, immediate toast, and remove action finalized.');
