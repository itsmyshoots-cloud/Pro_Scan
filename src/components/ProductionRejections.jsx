import React,{useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {supabase} from '../lib/supabase';
import './rejection-rework.css';

const reasons=['Physical damage','Electrical failure','Assembly defect','Cosmetic defect','Functional failure','Missing component','Other'];
const qty=value=>Number(value||0).toLocaleString('en-IN');
const stamp=value=>value?new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';

export default function ProductionRejections({plan,operatorName='Operator',planSerials=[],onRefresh,onChanged}){
 const [open,setOpen]=useState(false);
 const [records,setRecords]=useState([]);
 const [mode,setMode]=useState('serial');
 const [serial,setSerial]=useState('');
 const [quantity,setQuantity]=useState('1');
 const [reason,setReason]=useState(reasons[0]);
 const [remarks,setRemarks]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');

 const load=async()=>{
  if(!plan?.id)return;
  const {data,error:loadError}=await supabase.from('production_rejections').select('*').eq('plan_id',plan.id).order('recorded_at',{ascending:false}).limit(300);
  if(loadError)throw loadError;
  setRecords(data||[]);
 };
 useEffect(()=>{
  if(open){setError('');setNotice('');load().catch(e=>setError(e.message||'Could not load quality control records.'));}
 },[open,plan?.id]);
 useEffect(()=>{
  if(!open)return;
  const onKey=e=>{if(e.key==='Escape'&&!busy)setOpen(false);};
  const old=document.body.style.overflow;
  document.body.style.overflow='hidden';
  window.addEventListener('keydown',onKey);
  return ()=>{document.body.style.overflow=old;window.removeEventListener('keydown',onKey);};
 },[open,busy]);

 const accepted=planSerials.filter(r=>r.status==='scanned').length+
  records.filter(r=>r.rejection_type==='quantity'&&r.status==='rework_accepted').reduce((n,r)=>n+Number(r.quantity||0),0);
 const rejectedHistory=records.reduce((n,r)=>n+Number(r.quantity||1),0);
 const reworkPending=records.filter(r=>r.status==='rework_pending').reduce((n,r)=>n+Number(r.quantity||1),0);
 const reworkCompleted=records.filter(r=>r.status==='rework_accepted').reduce((n,r)=>n+Number(r.quantity||1),0);
 const reworkFailed=records.filter(r=>r.status==='rework_rejected').reduce((n,r)=>n+Number(r.quantity||1),0);
 const serialRejected=planSerials.filter(r=>r.status==='rejected').length;
 const qtyOutstanding=records.filter(r=>['rework_pending','rework_rejected'].includes(r.status)).reduce((n,r)=>n+(r.rejection_type==='quantity'?Number(r.quantity||0):0),0);
 const pending=Math.max(0,Number(plan?.planned_qty||0)-accepted-serialRejected-qtyOutstanding);
 const latest=records.slice(0,5);

 const record=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   if(!plan?.id)throw new Error('Select a production plan first.');
   if(!reason)throw new Error('Select a rejection reason.');
   if(mode==='serial'){
    const code=serial.trim().toUpperCase();
    if(!code)throw new Error('Scan or enter the rejected serial / label.');
    const row=planSerials.find(r=>String(r.serial_number||'').trim().toUpperCase()===code||String(r.label_number||'').trim().toUpperCase()===code);
    if(!row)throw new Error('This serial or label is not allocated to the selected Daily Plan.');
    if(row.status==='rejected')throw new Error('This serial is already rejected. Use the Rework tab to complete or reject it.');
    if(row.status!=='pending'&&row.status!=='scanned')throw new Error('Only pending or scanned serials can be rejected.');
    if(records.some(r=>r.rejection_type==='serial'&&r.plan_serial_id===row.id&&r.status==='rework_pending'))throw new Error('This serial already has an open rework record.');
    if(row.status==='scanned'&&!window.confirm('This unit was already counted as scanned. Reject it and move it out of accepted production?'))return;
    const {data:rej,error:rejError}=await supabase.from('production_rejections').insert({
     plan_id:plan.id,rejection_type:'serial',plan_serial_id:row.id,serial_number:row.serial_number,
     quantity:1,reason,remarks:remarks.trim()||null,recorded_by:operatorName,status:'rework_pending'
    }).select().single();
    if(rejError)throw rejError;
    const {data:changed,error:updateError}=await supabase.from('plan_serials').update({status:'rejected',scanned_at:null,scanned_by:null})
     .eq('id',row.id).in('status',['pending','scanned']).select('id').maybeSingle();
    if(updateError||!changed){
     await supabase.from('production_rejections').update({status:'closed',resolved_at:new Date().toISOString(),resolved_by:operatorName,resolution_remarks:'Closed automatically because serial allocation could not be updated.'}).eq('id',rej.id);
     throw updateError||new Error('Serial status changed while recording. Refresh and retry.');
    }
    const {error:eventError}=await supabase.from('production_rejection_events').insert({rejection_id:rej.id,event_type:'rework_started',remarks:'Marked rejected; awaiting Rework tab action.',performed_by:operatorName});
    if(eventError)throw eventError;
    setSerial('');
    setNotice('Serial '+row.serial_number+' recorded as rejected. Complete its rework from the Rework tab.');
   }else{
    const qtyValue=Number(quantity);
    if(!Number.isInteger(qtyValue)||qtyValue<1)throw new Error('Enter a whole rejection quantity greater than zero.');
    if(qtyValue>pending)throw new Error('Only '+qty(pending)+' units remain available for quantity-wise rejection on this plan.');
    const {data:rej,error:rejError}=await supabase.from('production_rejections').insert({
     plan_id:plan.id,rejection_type:'quantity',quantity:qtyValue,reason,remarks:remarks.trim()||null,
     recorded_by:operatorName,status:'rework_pending'
    }).select().single();
    if(rejError)throw rejError;
    const {error:eventError}=await supabase.from('production_rejection_events').insert({rejection_id:rej.id,event_type:'rework_started',remarks:'Quantity rejection recorded; awaiting Rework tab action.',performed_by:operatorName});
    if(eventError)throw eventError;
    setQuantity('1');
    setNotice(qty(qtyValue)+' rejected unit(s) recorded. Complete or reject them from the Rework tab.');
   }
   setRemarks('');
   await load();
   await onRefresh?.();
   onChanged?.();
  }catch(e){setError(e?.message||'Could not save rejection.');}
  finally{setBusy(false);}
 };

 if(!plan)return null;
 return <>
  <button type='button' className='operator-qc-trigger' onClick={()=>setOpen(true)}>
   <span className='operator-qc-trigger-icon'>QC</span>
   <span><strong>Quality Control</strong><small>{qty(reworkPending)} awaiting rework · {qty(rejectedHistory)} rejected total</small></span>
   <span className='operator-qc-trigger-open'>Open <b>↗</b></span>
  </button>
  {open&&createPortal(<div className='qc-modal-backdrop' role='presentation' onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
   <section className='qc-modal' role='dialog' aria-modal='true' aria-labelledby='qc-modal-title'>
    <header className='qc-modal-head'>
     <div><span className='qc-kicker'>QUALITY CONTROL · DAILY PLAN</span><h2 id='qc-modal-title'>Production rejection</h2><p>{plan.production_date} · {plan.production_line} · {plan.brand||'—'} · {plan.product_name} · {plan.model}</p></div>
     <button type='button' className='qc-modal-close' aria-label='Close Quality Control' onClick={()=>setOpen(false)}>×</button>
    </header>
    <div className='qc-modal-summary'>
     <div><span>Planned</span><strong>{qty(plan.planned_qty)}</strong></div>
     <div><span>Accepted</span><strong className='is-good'>{qty(accepted)}</strong></div>
     <div><span>Rejected history</span><strong className='is-bad'>{qty(rejectedHistory)}</strong></div>
     <div><span>Awaiting rework</span><strong className='is-warn'>{qty(reworkPending)}</strong></div>
     <div><span>Rework completed</span><strong className='is-good'>{qty(reworkCompleted)}</strong></div>
     <div><span>Rework failed</span><strong className='is-bad'>{qty(reworkFailed)}</strong></div>
    </div>
    <div className='qc-modal-tabs'>
     <button type='button' className={mode==='serial'?'is-active':''} onClick={()=>setMode('serial')}>Serial-wise rejection</button>
     <button type='button' className={mode==='quantity'?'is-active':''} onClick={()=>setMode('quantity')}>Quantity-wise rejection</button>
    </div>
    <div className='qc-modal-form'>
     {mode==='serial'
      ?<label>Scan / enter serial or label<input value={serial} onChange={e=>setSerial(e.target.value)} placeholder='Scan rejected product' autoComplete='off'/></label>
      :<label>Rejected quantity<input type='number' min='1' max={pending||1} step='1' value={quantity} onChange={e=>setQuantity(e.target.value)}/><small>{qty(pending)} units remain unaccounted for.</small></label>}
     <label>Rejection reason<select value={reason} onChange={e=>setReason(e.target.value)}>{reasons.map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Remarks<input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder='Defect details / reason for rejection'/></label>
     <button type='button' className='qc-primary' disabled={busy||pending<=0} onClick={()=>void record()}>{busy?'Saving…':'Record rejection'}</button>
    </div>
    {error&&<div className='qc-message is-error' role='alert'>{error}</div>}
    {notice&&<div className='qc-message is-success' role='status'>{notice}</div>}
    <section className='qc-recent-section'>
     <div className='qc-recent-head'><strong>Recent rejection records</strong><button type='button' onClick={()=>load().catch(e=>setError(e.message))}>↻ Refresh</button></div>
     {latest.length?<div className='qc-recent-table-wrap'><table className='qc-recent-table'><thead><tr><th>Serial / type</th><th>Qty</th><th>Reason</th><th>Status</th><th>Recorded</th></tr></thead><tbody>
      {latest.map(r=><tr key={r.id}><td>{r.serial_number||'Quantity-wise'}</td><td>{qty(r.quantity)}</td><td>{r.reason}{r.remarks?' · '+r.remarks:''}</td><td><span className={'qc-status status-'+r.status}>{String(r.status).replaceAll('_',' ')}</span></td><td>{stamp(r.recorded_at)}</td></tr>)}
     </tbody></table></div>:<div className='qc-empty'>No rejection has been recorded for this Daily Plan.</div>}
    </section>
    <footer className='qc-modal-foot'><span>Use the Rework tab to mark rejected items Completed or Rejected.</span><button type='button' onClick={()=>setOpen(false)}>Close</button></footer>
   </section>
  </div>,document.body)}
 </>;
}
