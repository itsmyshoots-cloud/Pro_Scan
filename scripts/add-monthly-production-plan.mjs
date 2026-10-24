import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const stateAnchor=" const [statusUpdatingId,setStatusUpdatingId]=useState('');";
if(!source.includes(stateAnchor)) throw new Error('Monthly state anchor not found.');
source=source.replace(stateAnchor,stateAnchor+" const [monthlyPlans,setMonthlyPlans]=useState([]); const [monthlyForm,setMonthlyForm]=useState({plan_month:new Date().toISOString().slice(0,7),brand:'',product_name:'',model:'',mrp:''}); const [monthlyRows,setMonthlyRows]=useState([]); const [monthlyFile,setMonthlyFile]=useState(''); const [monthlyBusy,setMonthlyBusy]=useState(false); const [monthlyMessage,setMonthlyMessage]=useState(''); const [monthlySelectedId,setMonthlySelectedId]=useState(''); const [monthlyEditingId,setMonthlyEditingId]=useState('');");

const loadAnchor=" const load=async()=>{";
if(!source.includes(loadAnchor)) throw new Error('Load anchor not found.');
const monthlyLoader=" const loadMonthlyPlans=async()=>{ const {data,error}=await supabase.from('monthly_production_plans').select('*').order('plan_month',{ascending:false}).order('created_at',{ascending:false}).limit(200); if(error){setMonthlyMessage('Could not load monthly plans: '+error.message);return;} setMonthlyPlans(data||[]); };\n";
source=source.replace(loadAnchor,monthlyLoader+loadAnchor);
source=source.replace("const load=async()=>{try{await supabase.rpc('ensure_production_carry_forward',{p_target_date:localDateKey(new Date())});}catch{} const {data,error}=", "const load=async()=>{ const {data,error}=");

const importAnchor=" const importFile=async e=>{";
if(!source.includes(importAnchor)) throw new Error('Import anchor not found.');
const monthlyFunctions=` const importMonthlyFile=async e=>{\n  const input=e.currentTarget,f=input.files?.[0]; if(!f)return;\n  setMonthlyBusy(true);setMonthlyRows([]);setMonthlyFile('');setMonthlyMessage('Reading '+f.name+'…');\n  try{ let parsed; if(f.name.toLowerCase().endsWith('.pdf')) parsed=(await parseSupplierPdf(f,setMonthlyMessage)).rows; else parsed=pairsFromText(await f.text()); validatePairs(parsed); const serialKeys=parsed.map(row=>String(row.serial_number).toUpperCase()); const labelKeys=parsed.map(row=>String(row.label_number).toUpperCase()); if(new Set(serialKeys).size!==serialKeys.length)throw new Error('Duplicate serial numbers were found inside this file.'); if(new Set(labelKeys).size!==labelKeys.length)throw new Error('Duplicate labels were found inside this file.'); const [{data:existingSerials,error:serialError},{data:existingLabels,error:labelError}]=await Promise.all([supabase.from('monthly_plan_serials').select('serial_number').in('serial_number',serialKeys),supabase.from('monthly_plan_serials').select('label_number').in('label_number',labelKeys)]); if(serialError||labelError)throw new Error('Could not check existing monthly serials: '+(serialError||labelError).message); const existing=new Set((existingSerials||[]).map(row=>String(row.serial_number).toUpperCase())); const existingLabelSet=new Set((existingLabels||[]).map(row=>String(row.label_number).toUpperCase())); const fresh=parsed.filter(row=>!existing.has(String(row.serial_number).toUpperCase())&&!existingLabelSet.has(String(row.label_number).toUpperCase())); setMonthlyRows(fresh);setMonthlyFile(f.name);setMonthlyMessage((existing.size?existing.size.toLocaleString()+' existing serials skipped. ':'')+fresh.length.toLocaleString()+' new unique serials ready.'); }catch(error){setMonthlyRows([]);setMonthlyFile('');setMonthlyMessage(error?.message||'Could not read the serial PDF.');} finally{setMonthlyBusy(false);input.value='';}\n };\n const createMonthlyPlan=async()=>{\n  const month=String(monthlyForm.plan_month||'').trim(),brand=monthlyForm.brand.trim(),product=monthlyForm.product_name.trim(),model=monthlyForm.model.trim(),mrp=Number(monthlyForm.mrp);\n  if(!/^\\d{4}-\\d{2}$/.test(month))return setMonthlyMessage('Select a valid production month.'); if(!brand||!product||!model)return setMonthlyMessage('Enter Brand, Product and Model.'); if(!Number.isFinite(mrp)||mrp<0)return setMonthlyMessage('Enter a valid MRP.'); if(!monthlyRows.length)return setMonthlyMessage('Upload a serial PDF before creating the monthly plan.');\n  setMonthlyBusy(true);setMonthlyMessage('Creating monthly production plan…');\n  try{ const {data:plan,error}=await supabase.from('monthly_production_plans').insert({plan_month:month+'-01',brand,product_name:product,model,mrp,total_qty:0,status:'active'}).select().single(); if(error)throw new Error(error.message.includes('monthly_production_plan_model_month_unique')?'A monthly plan already exists for this month, brand and model.':error.message); const payload=monthlyRows.map((row,index)=>({monthly_plan_id:plan.id,label_number:row.label_number,serial_number:row.serial_number,sequence_no:index+1})); const {error:serialError}=await supabase.from('monthly_plan_serials').insert(payload); if(serialError){await supabase.from('monthly_production_plans').delete().eq('id',plan.id);throw new Error('Serial pool could not be saved: '+serialError.message);} setMonthlyForm({plan_month:month,brand:'',product_name:'',model:'',mrp:''});setMonthlyRows([]);setMonthlyFile('');setMonthlyEditingId('');setMonthlySelectedId(plan.id);await loadMonthlyPlans();setMonthlyMessage('Monthly production plan created with '+payload.length.toLocaleString()+' unique serials.'); }catch(error){setMonthlyMessage(error?.message||'Could not create the monthly plan.');} finally{setMonthlyBusy(false);}\n };\n const addMonthlySerials=async e=>{\n  const input=e.currentTarget,f=input.files?.[0]; if(!f||!monthlySelectedId)return; setMonthlyBusy(true);setMonthlyMessage('Reading additional serials…');\n  try{ let parsed=f.name.toLowerCase().endsWith('.pdf')?(await parseSupplierPdf(f,setMonthlyMessage)).rows:pairsFromText(await f.text()); validatePairs(parsed); const serialKeys=parsed.map(row=>String(row.serial_number).toUpperCase()),labelKeys=parsed.map(row=>String(row.label_number).toUpperCase()); if(new Set(serialKeys).size!==serialKeys.length||new Set(labelKeys).size!==labelKeys.length)throw new Error('Duplicate serial or label found inside the uploaded file.'); const {data:existing,error}=await supabase.from('monthly_plan_serials').select('serial_number,label_number').in('serial_number',serialKeys); if(error)throw new Error('Could not check duplicate serials: '+error.message); const occupiedSerials=new Set((existing||[]).map(row=>String(row.serial_number).toUpperCase())); const occupiedLabels=new Set((existing||[]).map(row=>String(row.label_number).toUpperCase())); const fresh=parsed.filter(row=>!occupiedSerials.has(String(row.serial_number).toUpperCase())&&!occupiedLabels.has(String(row.label_number).toUpperCase())); if(!fresh.length){setMonthlyMessage('No new serials were added. All uploaded serials already exist.');return;} const {data:currentRow,error:currentError}=await supabase.from('monthly_plan_serials').select('sequence_no').eq('monthly_plan_id',monthlySelectedId).order('sequence_no',{ascending:false}).limit(1).maybeSingle(); if(currentError)throw new Error(currentError.message); const start=Number(currentRow?.sequence_no||0)+1; const payload=fresh.map((row,index)=>({monthly_plan_id:monthlySelectedId,label_number:row.label_number,serial_number:row.serial_number,sequence_no:start+index})); const {error:insertError}=await supabase.from('monthly_plan_serials').insert(payload); if(insertError)throw new Error(insertError.message); await loadMonthlyPlans();setMonthlyMessage(fresh.length.toLocaleString()+' new serials added. '+(parsed.length-fresh.length).toLocaleString()+' existing rows skipped.'); }catch(error){setMonthlyMessage(error?.message||'Could not add serials.');} finally{setMonthlyBusy(false);input.value='';}\n };\n`;
source=source.replace(importAnchor,monthlyFunctions+importAnchor);

const startEditMonthlyPlan=plan=>{
  if(!plan)return;
  setMonthlyEditingId(plan.id);setMonthlySelectedId(plan.id);
  setMonthlyForm({plan_month:String(plan.plan_month||'').slice(0,7),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',mrp:String(plan.mrp??'')});
  setMonthlyRows([]);setMonthlyFile('');
  setMonthlyMessage('Editing this Monthly Plan. Upload an additional file here to add unique serial-label pairs.');
};
const cancelMonthlyPlanEdit=()=>{
  setMonthlyEditingId('');setMonthlyRows([]);setMonthlyFile('');
  setMonthlyForm({plan_month:new Date().toISOString().slice(0,7),brand:'',product_name:'',model:'',mrp:''});
  setMonthlyMessage('Monthly Plan editing cancelled.');
};
const saveMonthlyPlan=async()=>{
  const editingId=monthlyEditingId,current=monthlyPlans.find(plan=>plan.id===editingId);
  if(!editingId||!current)return setMonthlyMessage('Select a Monthly Plan to edit.');
  const month=String(monthlyForm.plan_month||'').trim(),brand=monthlyForm.brand.trim(),product=monthlyForm.product_name.trim(),model=monthlyForm.model.trim(),mrp=Number(monthlyForm.mrp);
  if(!/^\d{4}-\d{2}$/.test(month))return setMonthlyMessage('Select a valid production month.');
  if(!brand||!product||!model)return setMonthlyMessage('Enter Brand, Product and Model.');
  if(!Number.isFinite(mrp)||mrp<0)return setMonthlyMessage('Enter a valid MRP.');
  setMonthlyBusy(true);setMonthlyMessage('Saving Monthly Plan changes…');
  try{
    const {count:allocatedCount,error:allocationError}=await supabase.from('plan_serials').select('id',{count:'exact',head:true}).eq('monthly_plan_id',editingId);
    if(allocationError)throw new Error('Could not check Daily Plan allocations: '+allocationError.message);
    const identityChanged=String(current.plan_month||'').slice(0,7)!==month||String(current.brand||'')!==brand||String(current.product_name||'')!==product||String(current.model||'')!==model;
    if(Number(allocatedCount||0)>0&&identityChanged)throw new Error('This Monthly Plan already has serials allocated to Daily Plans. Its month, brand, product and model are locked to protect existing plans; MRP and additional serials can still be updated.');
    const {error:updateError}=await supabase.from('monthly_production_plans').update({plan_month:month+'-01',brand,product_name:product,model,mrp}).eq('id',editingId);
    if(updateError)throw new Error(updateError.message);
    let added=0;
    if(monthlyRows.length){
      const {data:lastRow,error:lastError}=await supabase.from('monthly_plan_serials').select('sequence_no').eq('monthly_plan_id',editingId).order('sequence_no',{ascending:false}).limit(1).maybeSingle();
      if(lastError)throw new Error('Monthly Plan details saved, but new serial sequence could not be checked: '+lastError.message);
      const first=Number(lastRow?.sequence_no||0)+1;
      const payload=monthlyRows.map((row,index)=>({monthly_plan_id:editingId,label_number:row.label_number,serial_number:row.serial_number,sequence_no:first+index}));
      const {error:insertError}=await supabase.from('monthly_plan_serials').insert(payload);
      if(insertError)throw new Error('Plan details saved, but additional serials could not be added: '+insertError.message);
      added=payload.length;
    }
    await loadMonthlyPlans();
    setMonthlyEditingId('');setMonthlyRows([]);setMonthlyFile('');
    setMonthlyForm({plan_month:month,brand:'',product_name:'',model:'',mrp:''});
    setMonthlyMessage('Monthly Plan updated. '+added.toLocaleString()+' new serial-label pairs added. Planned, Actual and Available are recalculated from Daily Plan allocations and operator scans.');
  }catch(error){setMonthlyMessage(error?.message||'Could not update the Monthly Plan.');}
  finally{setMonthlyBusy(false);}
};
const deleteMonthlyPlan=async plan=>{
  if(!plan)return;
  if(!window.confirm('Remove Monthly Plan '+plan.brand+' · '+plan.product_name+' · '+plan.model+'? This permanently removes its unused serial pool.'))return;
  setMonthlyBusy(true);setMonthlyMessage('Checking Monthly Plan allocations…');
  try{
    const {count:allocatedCount,error:allocationError}=await supabase.from('plan_serials').select('id',{count:'exact',head:true}).eq('monthly_plan_id',plan.id);
    if(allocationError)throw new Error(allocationError.message);
    if(Number(allocatedCount||0)>0)throw new Error('This Monthly Plan cannot be removed because '+Number(allocatedCount).toLocaleString()+' serials are already allocated to Daily Plans. Clear those allocations first.');
    const {error:poolError}=await supabase.from('monthly_plan_serials').delete().eq('monthly_plan_id',plan.id);
    if(poolError)throw new Error('Could not remove the unused serial pool: '+poolError.message);
    const {error:planError}=await supabase.from('monthly_production_plans').delete().eq('id',plan.id);
    if(planError)throw new Error('Serial pool removed, but the Monthly Plan record could not be removed: '+planError.message);
    if(monthlyEditingId===plan.id)cancelMonthlyPlanEdit();
    await loadMonthlyPlans();
    setMonthlyMessage('Monthly Plan and its unused serial pool were removed.');
  }catch(error){setMonthlyMessage(error?.message||'Could not remove this Monthly Plan.');}
  finally{setMonthlyBusy(false);}
};

const navAnchor="<button className={view==='manage'?'nav-button is-active':'nav-button'} onClick={()=>setView('manage')}>Manage Production</button>";
if(!source.includes(navAnchor)) throw new Error('Navigation anchor not found.');
source=source.replace(navAnchor,navAnchor+"<button className={view==='monthly-plans'?'nav-button is-active':'nav-button'} onClick={()=>{setView('monthly-plans');void loadMonthlyPlans();}}>Monthly Plan</button>");

const renderAnchor=" {view==='plans'&&<main><section className='panel'>";
if(!source.includes(renderAnchor)) throw new Error('Render anchor not found.');
const monthlyPage=` {view==='monthly-plans'&&<main className='monthly-production-page'>\n <section className='monthly-hero'><div><span className='eyebrow'>MONTHLY PRODUCTION CONTROL</span><h2>Monthly Production Plan</h2><p>Create the monthly serial pool first. Daily production plans will use this pool; serial upload is not required during daily planning.</p></div><div className='monthly-total-card'><span>Selected plan quantity</span><strong>{monthlyPlans.find(p=>p.id===monthlySelectedId)?.total_qty?.toLocaleString()||'0'}</strong><small>unique serials</small></div></section>\n <section className='panel monthly-create-panel'><div className='panel-head'><div><span className='eyebrow'>{monthlyEditingId?'EDIT MONTHLY PLAN':'CREATE MONTHLY PLAN'}</span><h3>{monthlyEditingId?'Update plan details and add serials':'Model & serial pool'}</h3></div></div>\n  <div className='monthly-form-grid'><label>Month<input type='month' value={monthlyForm.plan_month} onChange={e=>setMonthlyForm({...monthlyForm,plan_month:e.target.value})}/></label><label>Brand<input value={monthlyForm.brand} onChange={e=>setMonthlyForm({...monthlyForm,brand:e.target.value})} placeholder='Brand'/></label><label>Product<input value={monthlyForm.product_name} onChange={e=>setMonthlyForm({...monthlyForm,product_name:e.target.value})} placeholder='Product name'/></label><label>Model<input value={monthlyForm.model} onChange={e=>setMonthlyForm({...monthlyForm,model:e.target.value})} placeholder='Model / SKU'/></label><label>MRP<input type='number' min='0' step='0.01' value={monthlyForm.mrp} onChange={e=>setMonthlyForm({...monthlyForm,mrp:e.target.value})} placeholder='0.00'/></label></div>\n  <div className='monthly-upload-row'><label className='monthly-upload-box'><span>{monthlyEditingId?'Add serials to monthly pool':'① Upload Serial PDF'}</span><input type='file' accept='.pdf,.csv,.txt' onChange={importMonthlyFile} disabled={monthlyBusy}/><small>{monthlyFile||(monthlyEditingId?'Choose a file containing additional unique serial-label pairs':'Searchable PDF / CSV / TXT')}</small></label><div className='monthly-import-count'><span>Ready serials</span><strong>{monthlyRows.length.toLocaleString()}</strong></div><button className='primary' onClick={()=>void(monthlyEditingId?saveMonthlyPlan():createMonthlyPlan())} disabled={monthlyBusy||(!monthlyEditingId&&!monthlyRows.length)}>{monthlyBusy?'Processing…':(monthlyEditingId?'Save Monthly Plan':'Create Monthly Plan')}</button>{monthlyEditingId&&<button type='button' disabled={monthlyBusy} onClick={cancelMonthlyPlanEdit}>Cancel edit</button>}</div>{monthlyMessage&&<div className='notice'>{monthlyMessage}</div>}\n </section>\n <section className='panel monthly-list-panel'><div className='panel-head'><div><span className='eyebrow'>MONTHLY SERIAL POOLS</span><h3>Existing monthly plans</h3></div><button onClick={()=>void loadMonthlyPlans()}>↻ Refresh</button></div>\n  {monthlyPlans.length?<div className='monthly-plan-list'>{monthlyPlans.map(plan=><article className={'monthly-plan-card '+(monthlySelectedId===plan.id?'is-selected':'')} key={plan.id} onClick={()=>setMonthlySelectedId(plan.id)}><div><span className='monthly-plan-month'>{new Date(plan.plan_month+'T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</span><h3>{plan.brand} · {plan.product_name}</h3><p>{plan.model} · MRP ₹{Number(plan.mrp||0).toLocaleString('en-IN')}</p></div><div className='monthly-plan-qty'><strong>{Number(plan.total_qty||0).toLocaleString()}</strong><span>serials</span></div><div className='monthly-plan-actions'><button type='button' className='secondary-action' onClick={event=>{event.stopPropagation();startEditMonthlyPlan(plan);}} disabled={monthlyBusy}>Edit Plan / Add Serials</button><button type='button' className='monthly-remove-action' onClick={event=>{event.stopPropagation();void deleteMonthlyPlan(plan);}} disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0} title={Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0?'Cannot remove while serials are allocated to Daily Plans':'Remove this Monthly Plan'}>Remove</button><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></div></article>)}</div>:<div className='empty'>No monthly production plans yet.</div>}\n </section>\n <section className='monthly-rule-note'><strong>Workflow rule:</strong> Monthly plan owns the serial pool. Daily planning will not ask for serial PDF uploads and will not automatically carry unfinished quantity into the next day.</section>\n</main>}\n`;
source=source.replace(renderAnchor,monthlyPage+renderAnchor);

if(source===original)throw new Error('Monthly production plan patch produced no changes.');
fs.writeFileSync(file,source);
console.log('Monthly production planning UI injected.');
