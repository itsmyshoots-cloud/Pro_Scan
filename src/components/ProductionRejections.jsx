import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';

const reasons=['Physical damage','Electrical failure','Assembly defect','Cosmetic defect','Functional failure','Missing component','Other'];
const card={background:'#fff',border:'1px solid #dbe3ee',borderRadius:16,padding:18,marginTop:18,color:'#172033'};
const field={display:'grid',gap:6,fontSize:13,fontWeight:700,color:'#475569'};
const control={width:'100%',minHeight:42,border:'1px solid #cbd5e1',borderRadius:9,padding:'9px 11px',font:'inherit',background:'#fff',color:'#0f172a'};
const button={border:0,borderRadius:9,padding:'10px 14px',fontWeight:800,cursor:'pointer',background:'#1d4ed8',color:'#fff'};
const secondary={...button,background:'#e2e8f0',color:'#1e293b'};
export default function ProductionRejections({plan,operatorName='Operator',planSerials=[],onRefresh,onChanged}){
 const [records,setRecords]=useState([]),[events,setEvents]=useState([]),[mode,setMode]=useState('serial'); const [collapsed,setCollapsed]=useState(true);
 const [serial,setSerial]=useState(''),[quantity,setQuantity]=useState('1'),[reason,setReason]=useState(reasons[0]),[remarks,setRemarks]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [resolveId,setResolveId]=useState(''),[resolution,setResolution]=useState('accepted'),[resolutionRemarks,setResolutionRemarks]=useState('');
 const accepted=planSerials.filter(r=>r.status==='scanned').length+records.filter(r=>r.rejection_type==='quantity'&&r.status==='rework_accepted').reduce((n,r)=>n+Number(r.quantity||0),0);
 const rejectedSerials=planSerials.filter(r=>r.status==='rejected').length;
 const qtyRejected=records.filter(r=>r.rejection_type==='quantity'&&!['closed','rework_accepted'].includes(r.status)).reduce((n,r)=>n+Number(r.quantity||0),0);
 const rejected=rejectedSerials+qtyRejected;
 const pending=Math.max(0,Number(plan?.planned_qty||0)-accepted-rejected);
 const load=async()=>{
  if(!plan?.id)return;
  const [rr,ee]=await Promise.all([
   supabase.from('production_rejections').select('*').eq('plan_id',plan.id).order('recorded_at',{ascending:false}).limit(300),
   supabase.from('production_rejection_events').select('*,production_rejections!inner(plan_id)').eq('production_rejections.plan_id',plan.id).order('performed_at',{ascending:false}).limit(500)
  ]);
  if(rr.error)throw rr.error;if(ee.error)throw ee.error;

  setRecords(rr.data||[]);setEvents(ee.data||[]);
 };
 const syncPlanCompletion=async()=>{
  const [serialResult,quantityResult]=await Promise.all([
   supabase.from('plan_serials').select('id').eq('plan_id',plan.id).in('status',['scanned','rejected']),
   supabase.from('production_rejections').select('quantity').eq('plan_id',plan.id).eq('rejection_type','quantity').neq('status','closed')
  ]);
  if(serialResult.error)throw serialResult.error;
  if(quantityResult.error)throw quantityResult.error;
  const serialAccounted=(serialResult.data||[]).length;
  const quantityAccounted=(quantityResult.data||[]).reduce((sum,row)=>sum+Number(row.quantity||0),0);
  if(serialAccounted+quantityAccounted<Number(plan.planned_qty||0)||plan.status==='completed')return null;
  const {data,error}=await supabase.from('production_plans').update({status:'completed'}).eq('id',plan.id).in('status',['draft','active']).select().maybeSingle();
  if(error)throw error;
  return data||null;
 };
 useEffect(()=>{setRecords([]);setEvents([]);setNotice('');setError('');if(plan?.id)load().catch(e=>setError(e.message));},[plan?.id]);
 const openSerial=useMemo(()=>new Set(records.filter(r=>r.rejection_type==='serial'&&r.status==='rework_pending').map(r=>r.plan_serial_id)),[records]);
 const record=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   if(!plan?.id)throw new Error('Select a production plan first.');
   if(!reason)throw new Error('Select a rejection reason.');
   if(mode==='serial'){
    const code=serial.trim().toUpperCase();if(!code)throw new Error('Scan or enter the rejected serial/label.');
    const row=planSerials.find(r=>String(r.serial_number||'').toUpperCase()===code||String(r.label_number||'').toUpperCase()===code);
    if(!row)throw new Error('This serial or label is not allocated to the selected plan.');
    if(row.status==='rejected'||openSerial.has(row.id))throw new Error('This serial already has an open rejection/rework record.');
    if(row.status!=='pending'&&row.status!=='scanned')throw new Error('Only pending or scanned serials can be rejected.');
    if(row.status==='scanned'&& !window.confirm('This unit was already counted as scanned. Reject it and remove it from accepted production?'))return;
    const {data:rej,error:rejError}=await supabase.from('production_rejections').insert({plan_id:plan.id,rejection_type:'serial',plan_serial_id:row.id,serial_number:row.serial_number,quantity:1,reason,remarks:remarks.trim()||null,recorded_by:operatorName,status:'rework_pending'}).select().single();
    if(rejError)throw rejError;
    const {data:changed,error:updateError}=await supabase.from('plan_serials').update({status:'rejected',scanned_at:null,scanned_by:null}).eq('id',row.id).in('status',['pending','scanned']).select('id').maybeSingle();
    if(updateError||!changed){await supabase.from('production_rejections').update({status:'closed',resolution_remarks:'Auto-closed because the serial status update did not complete.'}).eq('id',rej.id);throw updateError||new Error('Serial status changed concurrently. Refresh and retry.');}
    await supabase.from('production_rejection_events').insert({rejection_id:rej.id,event_type:'rework_started',remarks:'Marked rejected; awaiting rework',performed_by:operatorName});
    setSerial('');setNotice('Serial '+row.serial_number+' recorded as rejected and excluded from accepted scans.');
   }else{
    const qty=Number(quantity);if(!Number.isInteger(qty)||qty<1)throw new Error('Enter a whole rejection quantity greater than zero.');
    if(qty>pending)throw new Error('Only '+pending.toLocaleString()+' units remain unaccounted for on this plan.');
    const {data:rej,error:rejError}=await supabase.from('production_rejections').insert({plan_id:plan.id,rejection_type:'quantity',quantity:qty,reason,remarks:remarks.trim()||null,recorded_by:operatorName,status:'rework_pending'}).select().single();
    if(rejError)throw rejError;
    await supabase.from('production_rejection_events').insert({rejection_id:rej.id,event_type:'rework_started',remarks:'Quantity rejection recorded; awaiting rework',performed_by:operatorName});
    setQuantity('1');setNotice(qty.toLocaleString()+' rejected unit(s) recorded.');
   }
   setRemarks('');await load();const completedPlan=await syncPlanCompletion();await onRefresh?.(completedPlan);onChanged?.();
  }catch(e){setError(e.message||'Could not save rejection.');}
  finally{setBusy(false);}
 };
 const reinspect=async()=>{
  const row=records.find(r=>r.id===resolveId);if(!row)return;
  setBusy(true);setError('');setNotice('');
  try{
   if(row.rejection_type==='serial'){
    const serialRow=planSerials.find(s=>s.id===row.plan_serial_id);
    if(!serialRow||serialRow.status!=='rejected')throw new Error('Serial is not currently in rejected status. Refresh the plan.');
    const nextStatus=resolution==='accepted'?'scanned':'rejected';
    const {data:updated,error:updateError}=await supabase.from('plan_serials').update({status:nextStatus,scanned_at:resolution==='accepted'?new Date().toISOString():null,scanned_by:resolution==='accepted'?operatorName:null}).eq('id',serialRow.id).eq('status','rejected').select('id').maybeSingle();
    if(updateError||!updated)throw updateError||new Error('Serial status changed. Refresh and retry.');
   }
   const next=resolution==='accepted'?'rework_accepted':'rework_pending';
   const {error:updateError}=await supabase.from('production_rejections').update({status:next,resolved_at:new Date().toISOString(),resolved_by:operatorName,resolution_remarks:resolutionRemarks.trim()||null}).eq('id',row.id).eq('status','rework_pending');
   if(updateError)throw updateError;
   const {error:eventError}=await supabase.from('production_rejection_events').insert({rejection_id:row.id,event_type:resolution==='accepted'?'reinspection_accepted':'reinspection_rejected',remarks:resolutionRemarks.trim()||null,performed_by:operatorName});
   if(eventError)throw eventError;
   setResolveId('');setResolutionRemarks('');setNotice(resolution==='accepted'?'Reinspection passed. Unit moved into accepted production.':'Reinspection failed. Unit remains in the rework queue for another repair and reinspection cycle.');
   await load();const completedPlan=await syncPlanCompletion();await onRefresh?.(completedPlan);onChanged?.();
  }catch(e){setError(e.message||'Could not save reinspection.');}
  finally{setBusy(false);}
 };
 if(!plan)return null;
 const open=records.filter(r=>r.status==='rework_pending');
 return <section style={card}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
   <div><div style={{fontSize:11,fontWeight:900,letterSpacing:1.1,color:'#64748b'}}>QUALITY CONTROL</div><h3 style={{margin:'4px 0',fontSize:20}}>Production rejection & rework</h3><p style={{margin:0,color:'#64748b',fontSize:13}}>Record individual serials or quantity-only rejects, then track repair and reinspection.</p></div>
   <div style={{display:'flex',gap:8,alignItems:'center'}}>
    <button type="button" style={secondary} onClick={()=>load().then(()=>onRefresh?.()).catch(e=>setError(e.message))}>↻ Refresh</button>
    <button type="button" style={button} onClick={()=>setCollapsed(value=>!value)}>{collapsed?'Open quality control':'Collapse quality control'}</button>
   </div>
  </div>
  {collapsed?<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginTop:12}}>
   {[['Planned',Number(plan.planned_qty||0)],['Accepted',accepted],['Rejected',rejected],['Pending',pending]].map(([label,value])=><div key={label} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:9,padding:'8px 10px'}}><div style={{fontSize:10,color:'#64748b',fontWeight:800}}>{label}</div><strong style={{fontSize:18}}>{value.toLocaleString()}</strong></div>)}
  </div>:<> 
  <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:9,marginTop:16}}>
   {[['Planned',Number(plan.planned_qty||0)],['Accepted',accepted],['Rejected',rejected],['Pending',pending]].map(([label,value])=><div key={label} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:11,padding:12}}><div style={{fontSize:11,color:'#64748b',fontWeight:800}}>{label}</div><strong style={{fontSize:22}}>{value.toLocaleString()}</strong></div>)}
  </div>
  <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}}>
   <button type="button" style={mode==='serial'?button:secondary} onClick={()=>setMode('serial')}>Serial-wise rejection</button>
   <button type="button" style={mode==='quantity'?button:secondary} onClick={()=>setMode('quantity')}>Quantity-wise rejection</button>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginTop:14,alignItems:'end'}}>
   {mode==='serial'?<label style={field}>Scan / enter serial or label<input style={control} value={serial} onChange={e=>setSerial(e.target.value)} placeholder="Scan rejected product"/></label>:<label style={field}>Rejected quantity<input style={control} type="number" min="1" max={pending} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>}
   <label style={field}>Rejection reason<select style={control} value={reason} onChange={e=>setReason(e.target.value)}>{reasons.map(x=><option key={x}>{x}</option>)}</select></label>
   <label style={field}>Remarks (optional)<input style={control} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Add defect details"/></label>
   <button type="button" style={{...button,opacity:busy?0.6:1}} disabled={busy||pending<=0} onClick={record}>{busy?'Saving…':'Record rejection'}</button>
  </div>
  {error&&<p role="alert" style={{color:'#b91c1c',fontWeight:700}}>{error}</p>}{notice&&<p role="status" style={{color:'#047857',fontWeight:700}}>{notice}</p>}
  <div style={{marginTop:18,display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong>Rework queue</strong><span style={{fontSize:12,color:'#64748b'}}>{open.length} item(s) awaiting reinspection</span></div>
  {open.length?<div style={{overflowX:'auto',marginTop:8}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Type / serial','Qty','Reason','Recorded','Action'].map(x=><th key={x} style={{textAlign:'left',padding:9,borderBottom:'1px solid #e2e8f0',color:'#64748b'}}>{x}</th>)}</tr></thead><tbody>{open.map(r=><tr key={r.id}><td style={{padding:9,borderBottom:'1px solid #e2e8f0'}}><b>{r.rejection_type==='serial'?r.serial_number:'Quantity rejection'}</b></td><td style={{padding:9,borderBottom:'1px solid #e2e8f0'}}>{r.quantity}</td><td style={{padding:9,borderBottom:'1px solid #e2e8f0'}}>{r.reason}{r.remarks?' · '+r.remarks:''}</td><td style={{padding:9,borderBottom:'1px solid #e2e8f0'}}>{new Date(r.recorded_at).toLocaleString('en-IN')}</td><td style={{padding:9,borderBottom:'1px solid #e2e8f0'}}><button type="button" style={button} onClick={()=>{setResolveId(r.id);setResolution('accepted');setResolutionRemarks('');}}>Reinspect</button></td></tr>)}</tbody></table></div>:<p style={{color:'#64748b',fontSize:13}}>No rejected items are awaiting reinspection.</p>}
  {resolveId&&<div style={{marginTop:14,padding:14,border:'1px solid #bfdbfe',borderRadius:12,background:'#eff6ff'}}>
   <strong>Reinspection result</strong><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:10}}>
    <label style={field}>Result<select style={control} value={resolution} onChange={e=>setResolution(e.target.value)}><option value="accepted">Passed QC — accept unit</option><option value="rejected">Failed QC — reject again</option></select></label>
    <label style={field}>QC remarks<input style={control} value={resolutionRemarks} onChange={e=>setResolutionRemarks(e.target.value)} placeholder="Repair / inspection details"/></label>
    <div style={{display:'flex',gap:8,alignItems:'end'}}><button type="button" style={button} disabled={busy} onClick={reinspect}>Save result</button><button type="button" style={secondary} onClick={()=>setResolveId('')}>Cancel</button></div>
   </div>
  </div>}
  <details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:800}}>Rejection history ({records.length})</summary><div style={{overflowX:'auto',marginTop:8}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Serial / type','Qty','Reason','Status','Recorded by','Time'].map(x=><th key={x} style={{textAlign:'left',padding:8,borderBottom:'1px solid #e2e8f0'}}>{x}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.id}><td style={{padding:8}}>{r.serial_number||'Quantity-wise'}</td><td style={{padding:8}}>{r.quantity}</td><td style={{padding:8}}>{r.reason}</td><td style={{padding:8}}>{r.status.replaceAll('_',' ')}</td><td style={{padding:8}}>{r.recorded_by||'—'}</td><td style={{padding:8}}>{new Date(r.recorded_at).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div></details>
  </>}
 </section>;
}
