import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
let changed=false;
const portalImport="import {createPortal} from 'react-dom';";
if(!source.includes('createPortal(')&&!source.includes("import {createPortal} from 'react-dom'")){source=source.replace("import React,{useEffect,useMemo,useRef,useState} from 'react';","import React,{useEffect,useMemo,useRef,useState} from 'react';\n"+portalImport);changed=true;}
const stateAnchor=" const [monthlyEditingId,setMonthlyEditingId]=useState('');";
if(source.includes(stateAnchor)&&!source.includes("setTimeout(()=>setMonthlyMessage(''),4000)")){
 source=source.replace(stateAnchor,stateAnchor+"\n useEffect(()=>{if(!monthlyMessage)return;const timer=setTimeout(()=>setMonthlyMessage(''),4000);return ()=>clearTimeout(timer);},[monthlyMessage]);");
 changed=true;
}
if(source.includes(stateAnchor)&&!source.includes('monthlyPoolStats')){
 source=source.replace(stateAnchor,stateAnchor+" const [monthlyPoolStats,setMonthlyPoolStats]=useState({total:0,allocated:0});");
 changed=true;
}
const loaderAnchor=" const loadMonthlyPlans=async()=>{";
const helperStart=source.indexOf('const getMonthlyPlanDailyAllocationCount=async planId=>{');
const helperEnd=source.indexOf(loaderAnchor,helperStart);
if(helperStart<0||helperEnd<0)throw new Error('Monthly Plan allocation helper insertion range not found.');
const helper=`const getMonthlyPlanDailyAllocationCount=async planId=>{const plan=monthlyPlans.find(row=>row.id===planId);const expected=Math.max(0,Number(plan?.total_qty||0));const pageCount=Math.max(1,Math.ceil(expected/500));const pages=await Promise.all(Array.from({length:pageCount},(_,index)=>supabase.from('monthly_plan_serials').select('serial_number').eq('monthly_plan_id',planId).not('serial_number','is',null).range(index*500,index*500+499)));const pool=new Set();for(const result of pages){if(result.error)throw result.error;for(const row of result.data||[]){const key=String(row.serial_number||'').trim().toUpperCase();if(key)pool.add(key);}}if(!pool.size)return 0;const keys=[...pool];const batches=await Promise.all(Array.from({length:Math.ceil(keys.length/150)},(_,index)=>supabase.from('plan_serials').select('serial_number,plan_id').in('serial_number',keys.slice(index*150,index*150+150))));const allocations=[];for(const result of batches){if(result.error)throw result.error;allocations.push(...(result.data||[]));}const planIds=[...new Set(allocations.map(row=>row.plan_id).filter(Boolean))];if(!planIds.length)return 0;const dailyPlans=await Promise.all(Array.from({length:Math.ceil(planIds.length/150)},(_,index)=>supabase.from('production_plans').select('id,status').in('id',planIds.slice(index*150,index*150+150))));const activePlanIds=new Set();for(const result of dailyPlans){if(result.error)throw result.error;for(const row of result.data||[])if(row.status!=='cancelled')activePlanIds.add(row.id);}return allocations.filter(row=>activePlanIds.has(row.plan_id)).length;};const openMonthlyPlanEditWithAllocationGuard=async plan=>{if(!plan)return;setMonthlyMessage('Checking Daily Plan allocations…');setMonthlyBusy(true);try{const allocatedCount=await getMonthlyPlanDailyAllocationCount(plan.id);const total=Number(plan.total_qty||0);setMonthlyPoolStats({total,allocated:allocatedCount});if(allocatedCount>0){setMonthlyEditingId('');setMonthlyMessage('Editing is locked. '+allocatedCount.toLocaleString()+' serial(s) are allocated to non-cancelled Daily Plans. Cancel those Daily Plans before editing this Monthly Plan.');return;}setMonthlyEditingId(plan.id);setMonthlySelectedId(plan.id);setMonthlyForm({plan_month:String(plan.plan_month||'').slice(0,7),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',mrp:String(plan.mrp??'')});setMonthlyRows([]);setMonthlyFile('');setMonthlyMessage('Update the Monthly Plan details or upload an additional quantity-pool PDF/CSV/TXT.');}catch(error){const detail=error?.message||error?.details||error?.hint||error?.code||JSON.stringify(error);setMonthlyMessage('Could not verify Daily Plan restrictions: '+detail);}finally{setMonthlyBusy(false);}};`;
source=source.slice(0,helperStart)+helper+'\n'+source.slice(helperEnd);
changed=true;
const resetHandler="const resetMonthlyPlanEditForm=()=>{const plan=monthlyPlans.find(row=>row.id===monthlyEditingId);if(!plan)return;setMonthlyForm({plan_month:String(plan.plan_month||'').slice(0,7),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',mrp:String(plan.mrp??'')});setMonthlyRows([]);setMonthlyFile('');setMonthlyMessage('Edit form reset. The saved Monthly Plan and existing serial pool are unchanged. You can now choose a different PDF.');};";
if(!source.includes('const resetMonthlyPlanEditForm=')){source=source.replace(loaderAnchor,resetHandler+'\n'+loaderAnchor);changed=true;}
if(source.includes("onClick={cancelMonthlyPlanEdit}>Cancel edit</button>")){source=source.replace("onClick={cancelMonthlyPlanEdit}>Cancel edit</button>","onClick={resetMonthlyPlanEditForm}>Reset edit form</button><button type='button' disabled={monthlyBusy} onClick={cancelMonthlyPlanEdit}>Cancel edit</button>");changed=true;}
const saveStart=source.indexOf('const saveMonthlyPlan=async()=>{');
const saveEnd=source.indexOf('\nconst deleteMonthlyPlan=async plan=>{',saveStart);
if(saveStart<0||saveEnd<0)throw new Error('Monthly Plan save handler boundaries not found.');
const saveHandler=String.raw\`const saveMonthlyPlan=async()=>{
 const editingId=monthlyEditingId,current=monthlyPlans.find(plan=>plan.id===editingId);
 if(!editingId||!current){setMonthlyMessage('Select a Monthly Plan to edit.');return;}
 const month=String(monthlyForm.plan_month||'').trim(),brand=monthlyForm.brand.trim(),product=monthlyForm.product_name.trim(),model=monthlyForm.model.trim(),mrp=Number(monthlyForm.mrp);
 if(!/^\\d{4}-\\d{2}$/.test(month)){setMonthlyMessage('Select a valid production month.');return;}
 if(!brand||!product||!model){setMonthlyMessage('Enter Brand, Product and Model.');return;}
 if(!Number.isFinite(mrp)||mrp<0){setMonthlyMessage('Enter a valid MRP.');return;}
 setMonthlyBusy(true);setMonthlyMessage('Saving Monthly Plan…');
 try{
  const allocated=await getMonthlyPlanDailyAllocationCount(editingId);
  if(allocated>0)throw new Error('Cannot edit: '+allocated.toLocaleString()+' serial(s) are allocated to non-cancelled Daily Plans. Cancel those plans first.');
  const {data:updated,error:updateError}=await supabase.from('monthly_production_plans').update({plan_month:month+'-01',brand,product_name:product,model,mrp}).eq('id',editingId).select('id').maybeSingle();
  if(updateError)throw new Error('Plan update failed: '+updateError.message);
  if(!updated?.id)throw new Error('The database did not update this Monthly Plan. Confirm that your signed-in Pro_Scan role is Planner or Super Admin.');
  let added=0;
  if(monthlyRows.length){
   const {data:last,error:lastError}=await supabase.from('monthly_plan_serials').select('sequence_no').eq('monthly_plan_id',editingId).order('sequence_no',{ascending:false}).limit(1).maybeSingle();
   if(lastError)throw new Error('Plan details saved, but sequence lookup failed: '+lastError.message);
   const first=Number(last?.sequence_no||0)+1;
   const payload=monthlyRows.map((row,index)=>({monthly_plan_id:editingId,label_number:String(row.label_number).trim(),serial_number:String(row.serial_number).trim(),sequence_no:first+index}));
   for(let offset=0;offset<payload.length;offset+=250){
    const {error}=await supabase.from('monthly_plan_serials').insert(payload.slice(offset,offset+250));
    if(error)throw new Error('Plan details saved, but serial batch '+(Math.floor(offset/250)+1)+' failed: '+error.message);
   }
   added=payload.length;
  }
  await loadMonthlyPlans();setMonthlyEditingId('');setMonthlyRows([]);setMonthlyFile('');
  setMonthlyMessage('Monthly Plan updated successfully. '+added.toLocaleString()+' additional serial-label pairs saved.');
 }catch(error){setMonthlyMessage(error?.message||'Could not save Monthly Plan.');}
 finally{setMonthlyBusy(false);}
};\`;
source=source.slice(0,saveStart)+saveHandler+source.slice(saveEnd);
const deleteStart=source.indexOf('const deleteMonthlyPlan=async plan=>{');
const deleteEnd=source.indexOf('\n\nconst navAnchor=',deleteStart);
if(deleteStart<0||deleteEnd<0)throw new Error('Monthly Plan delete handler boundaries not found.');
const deleteHandler=String.raw\`const deleteMonthlyPlan=async plan=>{
 if(!plan||monthlyBusy)return;
 if(!window.confirm('Remove Monthly Plan '+plan.brand+' · '+plan.product_name+' · '+plan.model+'? The unused monthly serial pool will also be deleted.'))return;
 setMonthlyBusy(true);setMonthlyMessage('Checking Daily Plan allocations…');
 try{
  const allocated=await getMonthlyPlanDailyAllocationCount(plan.id);
  if(allocated>0)throw new Error('Cannot delete this plan: '+allocated.toLocaleString()+' serial(s) are still allocated to non-cancelled Daily Plans.');
  const {data:deleted,error,count}=await supabase.from('monthly_production_plans').delete({count:'exact'}).eq('id',plan.id).select('id');
  if(error)throw new Error('Delete failed: '+error.message);
  if(!deleted?.length||count===0)throw new Error('The database did not delete this plan. Your signed-in Pro_Scan role must be Planner or Super Admin.');
  if(monthlyEditingId===plan.id)cancelMonthlyPlanEdit();
  setMonthlySelectedId('');await loadMonthlyPlans();
  setMonthlyMessage('Monthly Plan deleted successfully. Its unused serial pool was removed.');
 }catch(error){setMonthlyMessage(error?.message||'Could not delete Monthly Plan.');}
 finally{setMonthlyBusy(false);}
};\`;
source=source.slice(0,deleteStart)+deleteHandler+source.slice(deleteEnd);
source=source.replaceAll("disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0}","disabled={monthlyBusy}");
const qtyMarkupPattern=/<div className='monthly-import-count'[^>]*>[\s\S]*?<\/div>/;
const newQty="{monthlyEditingId?<div className='monthly-import-count monthly-pool-stats'><div><span>Current available</span><strong>{Math.max(0,monthlyPoolStats.total-monthlyPoolStats.allocated).toLocaleString()}</strong></div><div><span>New pool ready</span><strong>{monthlyRows.length.toLocaleString()}</strong></div><div><span>Final available</span><strong>{(Math.max(0,monthlyPoolStats.total-monthlyPoolStats.allocated)+monthlyRows.length).toLocaleString()}</strong></div></div>:<div className='monthly-import-count monthly-pool-create-count'><span>Final quantity</span><strong>{monthlyRows.length.toLocaleString()}</strong></div>}";
if(qtyMarkupPattern.test(source)){source=source.replace(qtyMarkupPattern,newQty);changed=true;}
else if(!source.includes('monthly-pool-stats'))console.log('Monthly quantity card was already transformed by the earlier layout stage; keeping its existing markup.');
const oldRemove="disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0} title={Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0?'Cannot remove while serials are allocated to Daily Plans':'Remove this Monthly Plan'}";
if(source.includes(oldRemove)){source=source.replace(oldRemove,"disabled={monthlyBusy} title='Remove this Monthly Plan'");changed=true;}
else if(source.includes("planningMetrics.monthly?.[plan.id]?.planned||0)>0")){source=source.replaceAll("disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0}","disabled={monthlyBusy}");changed=true;}
const noticeMarker="{monthlyMessage&&<div className='notice'>{monthlyMessage}</div>}";
const toastMarkup="{monthlyMessage&&createPortal(<div className='notice monthly-global-toast' role='status' aria-live='polite'><span>{monthlyMessage}</span><button type='button' aria-label='Dismiss notification' onClick={()=>setMonthlyMessage('')}>×</button></div>,document.body)}";
if(source.includes(noticeMarker)){source=source.replace(noticeMarker,toastMarkup);changed=true;}
else if(source.includes("monthly-global-toast' role='status'")){const toastStart=source.lastIndexOf('{monthlyMessage&&',source.indexOf("monthly-global-toast' role='status'"));const toastEnd=source.indexOf('</div>}',toastStart);if(toastStart>=0&&toastEnd>=0){source=source.slice(0,toastStart)+toastMarkup+source.slice(toastEnd+7);changed=true;}}
const cssFile='src/monthly-production.css';
let css=fs.readFileSync(cssFile,'utf8');
if(!css.includes('monthly-pool-ux-v2')){
 css+=`
/* monthly-pool-ux-v2 */
.monthly-global-toast{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:14px!important}.monthly-global-toast button{border:0!important;background:transparent!important;color:inherit!important;font-size:22px!important;line-height:1!important;padding:0 2px!important;cursor:pointer!important;flex:0 0 auto!important}

.monthly-global-toast{position:fixed!important;top:auto!important;bottom:22px!important;right:22px!important;left:auto!important;z-index:2147483000!important;width:min(620px,calc(100vw - 36px))!important;margin:0!important;padding:14px 18px!important;box-shadow:0 12px 36px rgba(15,23,42,.22)!important;border:1px solid #b9d4ff!important;background:#eff6ff!important;color:#1746a2!important;border-radius:12px!important;animation:monthlyToastIn .18s ease-out}
@keyframes monthlyToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.monthly-pool-stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;min-width:0!important}
.monthly-pool-stats>div{display:flex;flex-direction:column;justify-content:center;gap:5px;padding:10px 12px;border:1px solid #d9e6f8;border-radius:12px;background:#f7faff;min-width:0}
.monthly-pool-stats span{font-size:11px;font-weight:800;color:#647796;white-space:nowrap}
.monthly-pool-stats strong{font-size:23px;font-weight:850;color:#132d5d;line-height:1.1}
.monthly-plan-actions .monthly-remove-action:disabled{opacity:.55;cursor:wait}
@media(max-width:760px){.monthly-pool-stats{grid-template-columns:1fr!important}.monthly-global-toast{right:10px!important;bottom:10px!important;top:auto!important;width:calc(100vw - 20px)!important}}
/* monthly-pool-layout-repair */
.monthly-create-panel .monthly-upload-row{grid-template-columns:minmax(0,1fr) minmax(420px,1.35fr) minmax(190px,220px)!important;align-items:stretch!important;gap:14px!important}
.monthly-create-panel .monthly-pool-stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;align-items:stretch!important;gap:8px!important;width:100%!important;min-width:0!important;box-sizing:border-box!important}
.monthly-create-panel .monthly-pool-stats>div{min-width:0!important;width:auto!important;box-sizing:border-box!important;padding:12px 10px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:flex-start!important;gap:6px!important}
.monthly-create-panel .monthly-pool-stats span{display:block!important;white-space:normal!important;overflow-wrap:anywhere!important;line-height:1.25!important;font-size:10px!important;letter-spacing:.02em!important}
.monthly-create-panel .monthly-pool-stats strong{display:block!important;font-size:23px!important;line-height:1.15!important}
.monthly-create-panel .monthly-upload-row>.primary{min-width:0!important;white-space:normal!important}
.monthly-create-panel.is-edit-modal{width:min(1080px,calc(100vw - 36px))!important}
.monthly-create-panel.is-edit-modal .monthly-upload-row{grid-template-columns:minmax(0,1fr) minmax(390px,1.2fr)!important}
.monthly-create-panel.is-edit-modal .monthly-upload-row>.primary{grid-column:2!important;min-height:48px!important}
.monthly-create-panel.is-edit-modal .monthly-upload-row>button:not(.primary){grid-column:1/-1!important}
.monthly-global-toast{position:fixed!important;top:auto!important;bottom:22px!important;right:22px!important;left:auto!important;z-index:2147483000!important;width:min(620px,calc(100vw - 36px))!important;max-width:calc(100vw - 36px)!important;box-sizing:border-box!important}
@media(max-width:1050px){.monthly-create-panel .monthly-upload-row{grid-template-columns:minmax(0,1fr) minmax(340px,1fr)!important}.monthly-create-panel .monthly-upload-row>.primary{grid-column:1/-1!important}.monthly-create-panel.is-edit-modal .monthly-upload-row{grid-template-columns:minmax(0,1fr)!important}.monthly-create-panel.is-edit-modal .monthly-upload-row>.primary{grid-column:1!important}}
@media(max-width:680px){.monthly-create-panel .monthly-upload-row{grid-template-columns:minmax(0,1fr)!important}.monthly-create-panel .monthly-pool-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important}.monthly-create-panel .monthly-pool-stats span{font-size:9px!important}.monthly-create-panel .monthly-pool-stats strong{font-size:19px!important}.monthly-create-panel.is-edit-modal{width:calc(100vw - 18px)!important}.monthly-create-panel.is-edit-modal .monthly-upload-row{grid-template-columns:minmax(0,1fr)!important}}

`;
 fs.writeFileSync(cssFile,css);
 changed=true;
}
if(!changed)throw new Error('Monthly pool UX finalizer made no changes.');
fs.writeFileSync(file,source);
console.log('Monthly edit quantity summary, immediate toast, and remove action finalized.');
