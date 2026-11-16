import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
let changed=false;

const loaderAnchor=" const loadMonthlyPlans=async()=>{";
if(!source.includes(loaderAnchor))throw new Error('Monthly Plan loader anchor not found.');

if(!source.includes('const openMonthlyPlanEditWithAllocationGuard=')){
 const helper=` const getMonthlyPlanDailyAllocationCount=async planId=>{const poolSerials=new Set();for(let from=0;;from+=500){const {data,error}=await supabase.from('monthly_plan_serials').select('serial_number').eq('monthly_plan_id',planId).not('serial_number','is',null).range(from,from+499);if(error)throw error;for(const row of data||[]){const key=String(row.serial_number||'').trim().toUpperCase();if(key)poolSerials.add(key);}if(!data||data.length<500)break;}if(!poolSerials.size)return 0;const usedSerials=new Set();for(let from=0;;from+=500){const {data,error}=await supabase.from('plan_serials').select('serial_number').not('serial_number','is',null).range(from,from+499);if(error)throw error;for(const row of data||[]){const key=String(row.serial_number||'').trim().toUpperCase();if(key&&poolSerials.has(key))usedSerials.add(key);}if(!data||data.length<500)break;}return usedSerials.size;}; const openMonthlyPlanEditWithAllocationGuard=async plan=>{if(!plan)return;setMonthlyBusy(true);setMonthlyMessage('Checking Daily Plan allocations…');try{const allocatedCount=await getMonthlyPlanDailyAllocationCount(plan.id);if(allocatedCount>0){setMonthlyEditingId('');setMonthlyMessage('Editing is locked. This Monthly Plan already has '+allocatedCount.toLocaleString()+' serial(s) allocated to Daily Plans. Monthly details and quantity pool cannot be changed.');return;}setMonthlyEditingId(plan.id);setMonthlySelectedId(plan.id);setMonthlyForm({plan_month:String(plan.plan_month||'').slice(0,7),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',mrp:String(plan.mrp??'')});setMonthlyRows([]);setMonthlyFile('');setMonthlyMessage('Update the Monthly Plan details or upload an additional quantity-pool PDF/CSV/TXT.');}catch(error){const detail=error?.message||error?.details||error?.hint||error?.code||JSON.stringify(error);setMonthlyMessage('Could not verify Daily Plan restrictions: '+detail);}finally{setMonthlyBusy(false);}};
`;
 source=source.replace(loaderAnchor,helper+loaderAnchor);changed=true;
}

const oldEditCheck="if(Number(allocatedCount||0)>0&&identityChanged)throw new Error('This Monthly Plan already has serials allocated to Daily Plans. Its month, brand, product and model are locked to protect existing plans; MRP and additional serials can still be updated.');";
const newEditCheck="if(Number(allocatedCount||0)>0)throw new Error('This Monthly Plan cannot be edited because it already has '+Number(allocatedCount).toLocaleString()+' active or completed Daily Plan(s). All Monthly Plan details and the quantity pool are locked.');";
if(source.includes(oldEditCheck)){source=source.replace(oldEditCheck,newEditCheck);changed=true;}
else if(!source.includes("This Monthly Plan cannot be edited because it already has"))console.log('Strict edit lock is enforced before opening the modal; existing save-time guard retained.');

const formOpen="<section className='panel monthly-create-panel'>";
const modalOpen="<>{monthlyEditingId&&<div className='monthly-edit-backdrop' onClick={resetMonthlyPlanEditFromRuntimeFix} role='presentation'/>}<section className={'panel monthly-create-panel '+(monthlyEditingId?'is-edit-modal':'')}>";
if(source.includes(formOpen)){source=source.replace(formOpen,modalOpen);changed=true;}
else if(!source.includes("monthly-create-panel '+(monthlyEditingId"))throw new Error('Could not locate Monthly Plan form panel for modal conversion.');

const panelHead="<div className='panel-head'><div><span className='eyebrow'>{monthlyEditingId?'EDIT MONTHLY PLAN':'CREATE MONTHLY PLAN'}</span>";
const panelHeadNew="<div className='panel-head'><div><span className='eyebrow'>{monthlyEditingId?'EDIT MONTHLY PLAN':'CREATE MONTHLY PLAN'}</span>";
if(source.includes(panelHead)){
 // Insert the close control after the title block, immediately before the panel head closes.
 const titleEnd="</h3><p className='monthly-create-subtitle'>";
 if(source.includes(titleEnd)){
  source=source.replace(titleEnd,"</h3><p className='monthly-create-subtitle'>");
  // Use the upload row cancel button as the modal's close control; keep it in place and style it.
  changed=true;
 }
}

const oldEditAction="onClick={()=>startEditMonthlyPlan(plan)}";
if(source.includes(oldEditAction)){source=source.replaceAll(oldEditAction,"onClick={()=>void openMonthlyPlanEditWithAllocationGuard(plan)}");changed=true;}
else if(!source.includes('openMonthlyPlanEditWithAllocationGuard(plan)'))throw new Error('Could not locate Monthly Plan edit button handler.');

const formEndMarker="</section><section id='monthly-available-plans'";
if(source.includes(formEndMarker)){source=source.replace(formEndMarker,"</section></><section id='monthly-available-plans'");changed=true;}
else if(!source.includes("</section></><section id='monthly-available-plans'"))throw new Error('Could not close the Monthly Plan modal fragment before Available Plans.');

const removeDisabled="disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0}";
if(source.includes(removeDisabled)){source=source.replaceAll(removeDisabled,"disabled={monthlyBusy}");changed=true;}

const removeAction="onClick={()=>void deleteMonthlyPlan(plan)}";
if(!source.includes(removeAction)&&!source.includes("onClick={event=>{event.stopPropagation();void deleteMonthlyPlan(plan);}}"))throw new Error('Could not locate Monthly Plan delete button handler.');

if(!source.includes('monthly-edit-modal-v1')){
 const css=`
/* monthly-edit-modal-v1 */
.monthly-edit-backdrop{position:fixed;inset:0;background:rgba(8,18,38,.58);backdrop-filter:blur(3px);z-index:10000}
.monthly-create-panel.is-edit-modal{position:fixed!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:min(920px,calc(100vw - 32px))!important;max-height:calc(100vh - 36px)!important;overflow-y:auto!important;z-index:10001!important;margin:0!important;box-shadow:0 28px 90px rgba(5,15,35,.32)!important;border:1px solid #d7e2f1!important}
.monthly-create-panel.is-edit-modal .panel-head{position:sticky;top:-1px;background:#fff;z-index:2;padding:6px 0 14px}
.monthly-create-panel.is-edit-modal .monthly-upload-row{align-items:stretch}
.monthly-create-panel.is-edit-modal .monthly-upload-box{min-width:0}
.monthly-create-panel.is-edit-modal .monthly-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.monthly-create-panel.is-edit-modal .monthly-upload-row>button{min-height:44px}
@media(max-width:640px){.monthly-create-panel.is-edit-modal{width:calc(100vw - 18px)!important;max-height:calc(100vh - 18px)!important;padding:16px!important}.monthly-create-panel.is-edit-modal .monthly-form-grid{grid-template-columns:1fr}}
`;
 fs.appendFileSync('src/monthly-production.css',css);
}
if(!changed)throw new Error('Monthly Plan modal/lock finalizer made no changes.');
fs.writeFileSync(file,source);
console.log('Monthly Plan edit modal and strict Daily Plan edit lock applied.');
