import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import './rejection-rework.css';

const qty=value=>Number(value||0).toLocaleString('en-IN');
const stamp=value=>value?new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const stateLabel=value=>String(value||'').replaceAll('_',' ');
const statusClass=value=>'rw-status status-'+String(value||'').toLowerCase();

export default function ReworkCenter({onChanged,operatorName='Operator'}){
 const [records,setRecords]=useState([]);
 const [plans,setPlans]=useState([]);
 const [events,setEvents]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [date,setDate]=useState('all');
 const [line,setLine]=useState('all');
 const [status,setStatus]=useState('all');
 const [activePlanId,setActivePlanId]=useState('');
 const [remarks,setRemarks]=useState({});
 const [busyId,setBusyId]=useState('');

 const load=async()=>{
  setLoading(true);setError('');
  try{
   const [rejectionResult,planResult,eventResult]=await Promise.all([
    supabase.from('production_rejections').select('*').order('recorded_at',{ascending:false}).limit(10000),
    supabase.from('production_plans').select('id,production_date,brand,product_name,model,production_line,shift_name,shift_start,shift_end,planned_qty,status').order('production_date',{ascending:false}).limit(3000),
    supabase.from('production_rejection_events').select('*').order('performed_at',{ascending:false}).limit(20000)
   ]);
   const failure=rejectionResult.error||planResult.error||eventResult.error;
   if(failure)throw failure;
   setRecords(rejectionResult.data||[]);
   setPlans(planResult.data||[]);
   setEvents(eventResult.data||[]);
  }catch(e){setError(e?.message||'Could not load rejection and rework records.');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 useEffect(()=>{
  if(!activePlanId)return;
  const onKey=e=>{if(e.key==='Escape'&&!busyId)setActivePlanId('');};
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  window.addEventListener('keydown',onKey);
  return ()=>{document.body.style.overflow=old;window.removeEventListener('keydown',onKey);};
 },[activePlanId,busyId]);

 const planById=useMemo(()=>new Map(plans.map(p=>[p.id,p])),[plans]);
 const dateOptions=useMemo(()=>[...new Set(records.map(r=>planById.get(r.plan_id)?.production_date).filter(Boolean))].sort().reverse(),[records,planById]);
 const lineOptions=useMemo(()=>[...new Set(records.map(r=>planById.get(r.plan_id)?.production_line).filter(Boolean))].sort(),[records,planById]);

 const filteredRecords=useMemo(()=>records.filter(row=>{
  const p=planById.get(row.plan_id)||{};
  const haystack=[p.brand,p.product_name,p.model,p.production_line,p.shift_name,row.serial_number,row.reason,row.remarks].join(' ').toLowerCase();
  return (date==='all'||p.production_date===date)
   &&(line==='all'||p.production_line===line)
   &&(status==='all'||row.status===status)
   &&(!search.trim()||haystack.includes(search.trim().toLowerCase()));
 }),[records,planById,date,line,status,search]);

 const groups=useMemo(()=>{
  const map=new Map();
  for(const row of filteredRecords){
   const plan=planById.get(row.plan_id)||{id:row.plan_id};
   const group=map.get(row.plan_id)||{plan,rows:[],total:0,pending:0,completed:0,rejected:0};
   group.rows.push(row);group.total+=Number(row.quantity||1);
   if(row.status==='rework_pending')group.pending+=Number(row.quantity||1);
   if(row.status==='rework_accepted')group.completed+=Number(row.quantity||1);
   if(row.status==='rework_rejected')group.rejected+=Number(row.quantity||1);
   map.set(row.plan_id,group);
  }
  return [...map.values()].sort((a,b)=>String(b.plan.production_date||'').localeCompare(String(a.plan.production_date||''))||String(a.plan.production_line||'').localeCompare(String(b.plan.production_line||'')));
 },[filteredRecords,planById]);

 const totals=useMemo(()=>filteredRecords.reduce((a,r)=>{
  const q=Number(r.quantity||1);a.total+=q;
  if(r.status==='rework_pending')a.pending+=q;
  if(r.status==='rework_accepted')a.completed+=q;
  if(r.status==='rework_rejected')a.rejected+=q;
  return a;
 },{total:0,pending:0,completed:0,rejected:0}),[filteredRecords]);

 const activePlan=activePlanId?planById.get(activePlanId):null;
 const activeRecords=useMemo(()=>records.filter(r=>r.plan_id===activePlanId).sort((a,b)=>String(b.recorded_at||'').localeCompare(String(a.recorded_at||''))),[records,activePlanId]);
 const eventByRejection=useMemo(()=>{
  const map=new Map();
  for(const event of events){const list=map.get(event.rejection_id)||[];list.push(event);map.set(event.rejection_id,list);}
  return map;
 },[events]);

 const resolve=async(row,resolution)=>{
  if(!row||row.status!=='rework_pending'||busyId)return;
  const note=String(remarks[row.id]||'').trim();
  if(!note){setError('Enter rework / inspection remarks for '+(row.serial_number||'this quantity rejection')+' before saving.');return;}
  const label=row.serial_number||('quantity rejection of '+qty(row.quantity)+' units');
  if(resolution==='rejected'&&!window.confirm('Mark '+label+' as Rejected after rework? It will remain in the rejected production count.'))return;
  setBusyId(row.id);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await supabase.rpc('resolve_production_rejection',{
    p_rejection_id:row.id,
    p_resolution:resolution,
    p_resolution_remarks:note,
    p_performed_by:operatorName
   });
   if(rpcError)throw rpcError;
   const updated=Array.isArray(data)?data[0]:data;
   if(!updated?.id)throw new Error('The Rework result was not returned. Refresh the list to verify it.');
   setNotice(resolution==='completed'?'Rework marked Completed. The accepted quantity has been returned to production totals.':'Rework marked Rejected. The quantity remains in rejected production totals.');
   setRemarks(previous=>({...previous,[row.id]:''}));
   await load();
   await onChanged?.(row.plan_id);
  }catch(e){setError(e?.message||'Could not save the Rework result.');}
  finally{setBusyId('');}
 };

 return <main className='rw-page'>
  <div className='rw-page-head'>
   <div><span className='rw-kicker'>PRODUCTION QUALITY</span><h1>Rework</h1><p>Review rejected output by Daily Plan and record the final reinspection result for each rejected product or quantity.</p></div>
   <button type='button' className='rw-refresh' onClick={()=>void load()} disabled={loading}>↻ Refresh</button>
  </div>
  <section className='rw-summary-grid'>
   <div><span>Total rejected quantity</span><strong>{qty(totals.total)}</strong><small>All rejection records in the current filter</small></div>
   <div><span>Awaiting rework</span><strong className='is-warn'>{qty(totals.pending)}</strong><small>Needs repair / inspection</small></div>
   <div><span>Rework completed</span><strong className='is-good'>{qty(totals.completed)}</strong><small>Returned to accepted production</small></div>
   <div><span>Rework rejected</span><strong className='is-bad'>{qty(totals.rejected)}</strong><small>Failed final reinspection</small></div>
  </section>
  <section className='rw-filter-card'>
   <div className='rw-filter-title'><strong>Filter rejected Daily Plans</strong><button type='button' onClick={()=>{setSearch('');setDate('all');setLine('all');setStatus('all');}}>Reset filters</button></div>
   <div className='rw-filter-grid'>
    <label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Product, model, serial, reason…'/></label>
    <label>Production date<select value={date} onChange={e=>setDate(e.target.value)}><option value='all'>All dates</option>{dateOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label>Production line<select value={line} onChange={e=>setLine(e.target.value)}><option value='all'>All lines</option>{lineOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label>Rework status<select value={status} onChange={e=>setStatus(e.target.value)}><option value='all'>All statuses</option><option value='rework_pending'>Awaiting rework</option><option value='rework_accepted'>Completed</option><option value='rework_rejected'>Rejected</option></select></label>
   </div>
  </section>
  {error&&<div className='rw-notice is-error' role='alert'>{error}</div>}
  {notice&&<div className='rw-notice is-success' role='status'>{notice}</div>}
  <section className='rw-table-card'>
   <div className='rw-table-head'><div><span className='rw-kicker'>DAILY PLAN SUMMARY</span><h2>Rejected production by plan</h2></div><span>{groups.length.toLocaleString('en-IN')} Daily Plan(s)</span></div>
   {loading?<div className='rw-empty'>Loading rejection records…</div>
    :groups.length?<div className='rw-table-scroll'><table className='rw-plan-table'><thead><tr><th>Production date</th><th>Product / Model</th><th>Line / Shift</th><th>Rejected qty</th><th>Awaiting</th><th>Completed</th><th>Rejected again</th><th>Action</th></tr></thead><tbody>
     {groups.map(group=><tr key={group.plan.id}>
      <td>{group.plan.production_date||'—'}</td>
      <td><strong>{group.plan.product_name||'—'}</strong><small>{group.plan.brand||'—'} · {group.plan.model||'—'} · Plan #{String(group.plan.id||'').slice(0,8)}</small></td>
      <td>{group.plan.production_line||'—'}<small>{group.plan.shift_name||'Shift A'} · {group.plan.shift_start?String(group.plan.shift_start).slice(0,5):'—'}–{group.plan.shift_end?String(group.plan.shift_end).slice(0,5):'—'}</small></td>
      <td><strong>{qty(group.total)}</strong><small>{group.rows.length} rejection record(s)</small></td>
      <td className='rw-warn'>{qty(group.pending)}</td><td className='rw-good'>{qty(group.completed)}</td><td className='rw-bad'>{qty(group.rejected)}</td>
      <td><button type='button' className='rw-open-plan' onClick={()=>setActivePlanId(group.plan.id)}>Rework <span>↗</span></button></td>
     </tr>)}
    </tbody></table></div>
    :<div className='rw-empty'>No rejection records match the selected filters.</div>}
  </section>

  {activePlanId&&<div className='rw-modal-backdrop' role='presentation' onMouseDown={e=>{if(e.target===e.currentTarget&&!busyId)setActivePlanId('');}}>
   <section className='rw-modal' role='dialog' aria-modal='true' aria-labelledby='rw-modal-title'>
    <header className='rw-modal-head'>
     <div><span className='rw-kicker'>DAILY PLAN REWORK</span><h2 id='rw-modal-title'>{activePlan?.product_name||'Production Plan'} · {activePlan?.model||''}</h2><p>{activePlan?.production_date||'—'} · {activePlan?.production_line||'—'} · {activePlan?.shift_name||'Shift A'} · Planned {qty(activePlan?.planned_qty)} units</p></div>
     <button type='button' className='rw-modal-close' aria-label='Close Rework details' onClick={()=>setActivePlanId('')}>×</button>
    </header>
    <div className='rw-modal-body'>
     <div className='rw-modal-plan-summary'>
      <span>{activeRecords.length} rejection record(s)</span>
      <span>Rejected qty: <b>{qty(activeRecords.reduce((n,r)=>n+Number(r.quantity||1),0))}</b></span>
      <span>Awaiting: <b>{qty(activeRecords.filter(r=>r.status==='rework_pending').reduce((n,r)=>n+Number(r.quantity||1),0))}</b></span>
      <span>Completed: <b>{qty(activeRecords.filter(r=>r.status==='rework_accepted').reduce((n,r)=>n+Number(r.quantity||1),0))}</b></span>
     </div>
     {activeRecords.map(row=>{
      const rowEvents=eventByRejection.get(row.id)||[];
      const busy=busyId===row.id;
      return <article className='rw-item-card' key={row.id}>
       <div className='rw-item-head'>
        <div><span className='rw-item-type'>{row.rejection_type==='serial'?'SERIAL REJECTION':'QUANTITY REJECTION'}</span><h3>{row.serial_number||qty(row.quantity)+' units'}</h3><p>{row.reason} · {stamp(row.recorded_at)}</p></div>
        <span className={statusClass(row.status)}>{stateLabel(row.status)}</span>
       </div>
       <div className='rw-item-notes'><div><span>Operator remarks</span><p>{row.remarks||'No original remarks entered.'}</p></div><div><span>Recorded by</span><p>{row.recorded_by||'—'}</p></div></div>
       {row.resolution_remarks&&<div className='rw-resolution-note'><strong>Rework / QC remarks</strong><p>{row.resolution_remarks}</p><small>{row.resolved_by||'—'} · {stamp(row.resolved_at)}</small></div>}
       {row.status==='rework_pending'?<div className='rw-resolution-form'>
        <label>Rework / inspection remarks<textarea rows='2' value={remarks[row.id]||''} onChange={e=>setRemarks(previous=>({...previous,[row.id]:e.target.value}))} placeholder='Enter repair carried out and inspection result'/></label>
        <div><button type='button' className='rw-complete' disabled={busy} onClick={()=>void resolve(row,'completed')}>{busy?'Saving…':'Mark Completed'}</button><button type='button' className='rw-failed' disabled={busy} onClick={()=>void resolve(row,'rejected')}>Mark Rejected</button></div>
       </div>:<div className='rw-final-state'>{row.status==='rework_accepted'?'Rework completed — quantity is included in accepted production totals.':'Rework failed — quantity remains in rejected production totals.'}</div>}
       {rowEvents.length>0&&<details className='rw-event-history'><summary>Rework history ({rowEvents.length})</summary><div>{rowEvents.map(ev=><p key={ev.id}><b>{stateLabel(ev.event_type)}</b> · {ev.remarks||'—'} <small>{ev.performed_by||'—'} · {stamp(ev.performed_at)}</small></p>)}</div></details>}
      </article>;
     })}
    </div>
    <footer className='rw-modal-foot'><span>Completed serials return to scanned production; quantity-wise rework is included in the plan totals.</span><button type='button' onClick={()=>setActivePlanId('')}>Close</button></footer>
   </section>
  </div>}
 </main>;
}
