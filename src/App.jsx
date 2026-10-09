import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BrowserMultiFormatReader} from '@zxing/browser';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {supabase} from './lib/supabase';

pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;

const lines=['Line 1','Line 2','Line 3'];
function pairsFromText(text){
 const labels=[...text.matchAll(/\bP-\d+\b/gi)].map(m=>m[0].toUpperCase());
 const serials=[...text.matchAll(/\bGM\d+\b/gi)].map(m=>m[0].toUpperCase());
 if(labels.length!==serials.length)throw new Error('Found '+labels.length+' labels and '+serials.length+' serials. Check the supplier file.');
 if(!labels.length)throw new Error('No label/serial pairs found. Use a searchable PDF or CSV/TXT export.');
 return labels.map((label_number,i)=>({label_number,serial_number:serials[i]}));
}
async function parseSupplierPdf(file,onProgress){
 const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const pageCount=pdf.numPages,labels=[],serials=[];
 try{
  for(let pageNo=1;pageNo<=pageCount;pageNo++){
   const page=await pdf.getPage(pageNo),content=await page.getTextContent();
   const text=content.items.map(item=>item.str||'').join(' ');
   labels.push(...[...text.matchAll(/\bP-\d+\b/gi)].map(m=>m[0].toUpperCase()));
   serials.push(...[...text.matchAll(/\bGM\d+\b/gi)].map(m=>m[0].toUpperCase()));
   page.cleanup();
   if(pageNo%50===0){onProgress('Reading PDF page '+pageNo.toLocaleString()+' of '+pageCount.toLocaleString()+'…');await new Promise(resolve=>setTimeout(resolve,0));}
  }
 }finally{await pdf.destroy();}
 if(labels.length!==serials.length)throw new Error('PDF extraction found '+labels.length+' labels and '+serials.length+' serials. The PDF may be incomplete.');
 if(!labels.length)throw new Error('No label/serial text found. This may be an image-only PDF; use a searchable PDF or CSV/TXT export.');
 return {rows:labels.map((label_number,i)=>({label_number,serial_number:serials[i]})),pages:pageCount};
}
function validatePairs(parsed){
 const labels=new Set(),serials=new Set();
 for(const row of parsed){if(labels.has(row.label_number))throw new Error('Duplicate label found: '+row.label_number+'.');if(serials.has(row.serial_number))throw new Error('Duplicate serial found: '+row.serial_number+'.');labels.add(row.label_number);serials.add(row.serial_number);}
 return parsed;
}
export default function App(){
 const [view,setView]=useState('dashboard'); const [plans,setPlans]=useState([]); const [selectedPlan,setSelectedPlan]=useState(null); const [rows,setRows]=useState([]); const [sourceFile,setSourceFile]=useState(''); const [fileInfo,setFileInfo]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
 const [session,setSession]=useState(null); const [authReady,setAuthReady]=useState(false); const [authEmail,setAuthEmail]=useState('admin@gsons.co.in');
 const [form,setForm]=useState({production_date:new Date().toISOString().slice(0,10),product_name:'LifeLong OTG',model:'RCAD60',production_line:'Line 2',planned_qty:500});
 const [operator,setOperator]=useState('Operator'); const [camera,setCamera]=useState(false); const videoRef=useRef(null); const readerRef=useRef(null);
 const load=async()=>{const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(50);if(error){setMessage(error.message);return;}if(data)setPlans(data)};
 useEffect(()=>{
  let active=true;
  supabase.auth.getSession().then(({data,error})=>{if(!active)return;setSession(data.session);setAuthReady(true);if(error)setMessage(error.message);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{if(active){setSession(nextSession);setAuthReady(true);}});
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{if(session)load();else setPlans([]);},[session]);
 const sendLoginLink=async e=>{
  e.preventDefault();const email=authEmail.trim().toLowerCase();
  if(email!=='admin@gsons.co.in'){setMessage('Only the approved administrator email can sign in.');return;}
  setBusy(true);setMessage('Sending sign-in link…');
  const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin,shouldCreateUser:true}});
  setBusy(false);
  if(error)setMessage(error.message+' If the redirect URL is rejected, add this site URL to Supabase Auth → URL Configuration: '+window.location.origin);
  else setMessage('A secure sign-in link was requested for '+email+'. Check your inbox and junk folder.');
 };
 const signOut=async()=>{await supabase.auth.signOut();setSelectedPlan(null);setView('dashboard');setMessage('Signed out.');};
 const stats=useMemo(()=>plans.reduce((a,p)=>{a.target+=p.planned_qty||0;return a},{target:0}),[plans]);
 const importFile=async e=>{
  const input=e.currentTarget,f=input.files?.[0];if(!f)return;
  setBusy(true);setRows([]);setSourceFile('');setFileInfo('');setMessage('Loading '+f.name+'…');
  try{
   let parsed,pages=0;
   if(f.name.toLowerCase().endsWith('.pdf')){const result=await parseSupplierPdf(f,setMessage);parsed=result.rows;pages=result.pages;}
   else parsed=pairsFromText(await f.text());
   validatePairs(parsed);setRows(parsed);setSourceFile(f.name);setFileInfo(pages?'PDF · '+pages.toLocaleString()+' pages':'Text/CSV file');
   setMessage(parsed.length.toLocaleString()+' serial-label pairs loaded from '+f.name+'.');
   if(Number(form.planned_qty)>parsed.length)setMessage(parsed.length.toLocaleString()+' pairs loaded, but planned quantity exceeds the available serial count.');
  }catch(error){setMessage(error?.message||'Could not read the supplier file.');}
  finally{setBusy(false);input.value='';}
 };
 const createPlan=async()=>{
  const qty=Number(form.planned_qty);
  if(!form.product_name.trim()||!form.model.trim())return setMessage('Enter product and model.');
  if(!Number.isInteger(qty)||qty<1)return setMessage('Planned quantity must be a whole number greater than zero.');
  if(!rows.length)return setMessage('Upload a valid supplier PDF, CSV, or TXT before creating a plan. Demo serials are disabled.');
  if(qty>rows.length)return setMessage('Planned quantity ('+qty.toLocaleString()+') exceeds available serials ('+rows.length.toLocaleString()+').');
  const chosen=rows.slice(0,qty);
  try{validatePairs(chosen);}catch(error){return setMessage(error.message);}
  setBusy(true);setMessage('Creating plan and allocating '+qty.toLocaleString()+' serials…');
  const {data:plan,error:planError}=await supabase.from('production_plans').insert({...form,planned_qty:qty,status:'draft'}).select().single();
  if(planError){setBusy(false);return setMessage('Could not create plan: '+planError.message);}
  const payload=chosen.map((r,i)=>({...r,plan_id:plan.id,sequence_no:i+1}));
  const {error:serialError}=await supabase.from('plan_serials').insert(payload);
  if(serialError){setBusy(false);await load();return setMessage('Plan saved as draft, but serial allocation failed: '+serialError.message+'. No active plan was published.');}
  const {data:activePlan,error:activateError}=await supabase.from('production_plans').update({status:'active'}).eq('id',plan.id).select().single();
  if(activateError){setBusy(false);await load();return setMessage('Serials were allocated, but activation failed: '+activateError.message+'. Ask an admin to review the draft.');}
  await load();setSelectedPlan(activePlan);setBusy(false);setMessage('Plan created with '+payload.length.toLocaleString()+' allocated serials.');setView('plans');
 };
 const scan=async value=>{if(!selectedPlan||!value)return; const clean=value.trim(); const {data}=await supabase.from('plan_serials').select('*').eq('plan_id',selectedPlan.id).eq('serial_number',clean).maybeSingle(); if(!data){setMessage(`NOT PLANNED: ${clean}`);return} if(data.status==='scanned'){setMessage(`DUPLICATE: ${clean}`);return} const {error}=await supabase.from('plan_serials').update({status:'scanned',scanned_at:new Date().toISOString(),scanned_by:operator}).eq('id',data.id); setMessage(error?error.message:`✓ Scanned ${clean}`)};
 const startCamera=async()=>{setCamera(true); const r=new BrowserMultiFormatReader(); readerRef.current=r; try{await r.decodeFromVideoDevice(undefined,videoRef.current,(result)=>{if(result){scan(result.getText());}})}catch(e){setMessage('Camera could not start. Check browser camera permission.')}};
 const stopCamera=()=>{try{readerRef.current?.reset()}catch{} setCamera(false)};
 if(!authReady)return <div className='app auth-shell'><section className='auth-card'><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1><p>Checking administrator session…</p></section></div>;
 if(!session)return <div className='app auth-shell'><form className='auth-card' onSubmit={sendLoginLink}><span className='eyebrow'>SECURE ADMIN ACCESS</span><h1>Pro Scan</h1><p>Sign in to manage production plans and serial allocation.</p><label>Administrator email<input type='email' value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required autoComplete='email' placeholder='admin@gsons.co.in'/></label><button className='primary' type='submit' disabled={busy}>{busy?'Sending…':'Send secure sign-in link'}</button><p className='auth-help'>Only admin@gsons.co.in is approved for this initial release. Open the email on this device to complete sign-in.</p>{message&&<div className='notice'>{message}</div>}</form></div>;
 if((session.user?.email||'').toLowerCase()!=='admin@gsons.co.in')return <div className='app auth-shell'><section className='auth-card'><span className='eyebrow'>ACCESS RESTRICTED</span><h1>Pro Scan</h1><p>This account is not approved for Pro Scan.</p><button className='primary' onClick={signOut}>Sign out</button></section></div>;
 return <div className='app'><header><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div><div className='top-actions'><span className='live'>● ADMIN</span><button onClick={()=>setView('dashboard')}>Dashboard</button><button onClick={()=>setView('planner')}>Production Planner</button><button onClick={()=>setView('operator')}>Operator</button><button onClick={signOut}>Sign out</button></div></header>
 {view==='dashboard'&&<main><section className='hero'><div><span className='eyebrow'>CONTROL CENTRE</span><h2>Today's production</h2><p>Create the plan first, then let operators scan only the serials allocated to that plan.</p></div><button className='primary' onClick={()=>setView('planner')}>+ Create Production Plan</button></section><div className='cards'><div><b>{plans.length}</b><span>Active / recent plans</span></div><div><b>{stats.target}</b><span>Total planned units</span></div><div><b>{plans.filter(p=>p.status==='active').length}</b><span>Active today</span></div></div><section className='panel'><div className='panel-head'><h3>Production plans</h3><button onClick={load}>Refresh</button></div><table><thead><tr><th>Date</th><th>Product</th><th>Model</th><th>Line</th><th>Qty</th><th>Status</th></tr></thead><tbody>{plans.map(p=><tr key={p.id} onClick={()=>{setSelectedPlan(p);setView('operator')}}><td>{p.production_date}</td><td>{p.product_name}</td><td>{p.model}</td><td>{p.production_line}</td><td>{p.planned_qty}</td><td><span className='badge'>{p.status}</span></td></tr>)}</tbody></table>{!plans.length&&<div className='empty'>No production plan yet.</div>}</section></main>}
 {view==='planner'&&<main><section className='panel'><div className='panel-head'><div><span className='eyebrow'>ADMIN / PLANNER</span><h2>Create daily production plan</h2></div><button onClick={()=>setView('dashboard')}>Back</button></div><div className='grid'><label>Production date<input type='date' value={form.production_date} onChange={e=>setForm({...form,production_date:e.target.value})}/></label><label>Product<input value={form.product_name} onChange={e=>setForm({...form,product_name:e.target.value})}/></label><label>Model<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></label><label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(x=><option key={x}>{x}</option>)}</select></label><label>Planned quantity<input type='number' min='1' value={form.planned_qty} onChange={e=>setForm({...form,planned_qty:e.target.value})}/></label></div><div className='upload'><h3>Supplier serial-number file</h3><p>Upload the original supplier PDF directly, or use CSV/TXT. Pro Scan extracts P-label numbers and GM serial numbers, pairs them in supplier order, and checks for duplicates before creating a plan.</p><input type='file' accept='.csv,.txt,.pdf,application/pdf,text/csv,text/plain' disabled={busy} onChange={importFile}/><div className='range'>{rows.length?<><b>{rows.length.toLocaleString()}</b> serial-label pairs loaded{sourceFile?' from '+sourceFile:''}{fileInfo?' · '+fileInfo:''}<p>Planned quantity: <b>{Number(form.planned_qty||0).toLocaleString()}</b>. The first planned-quantity labels will be allocated to this plan.</p></>:<>No serial file loaded. A valid supplier file is required. Demo serials are disabled.</>}</div></div>
 {rows.length>0&&<section className='preview-panel'><div className='panel-head'><div><h3>Serial allocation preview</h3><p className='muted'>First 4 and last 4 pairs from the source file.</p></div><span className='badge'>{rows.length.toLocaleString()} valid pairs</span></div><div className='table-scroll'><table><thead><tr><th>Label number</th><th>Serial number</th><th>Allocation</th></tr></thead><tbody>{(rows.length<=8?rows:[...rows.slice(0,4),...rows.slice(-4)]).map((r,i)=><tr key={r.label_number}><td>{r.label_number}</td><td>{r.serial_number}</td><td>{i<Math.min(4,rows.length)?(i<Number(form.planned_qty)?'Included':'Not allocated'):(rows.indexOf(r)<Number(form.planned_qty)?'Included':'Not allocated')}</td></tr>)}</tbody></table></div></section>}
 <div className='actions'><button className='primary' disabled={busy} onClick={createPlan}>{busy?'Please wait…':'Create Production Plan'}</button></div>{message&&<div className='notice'>{message}</div>}</section></main>}
 {view==='plans'&&<main><section className='panel'><div className='panel-head'><h2>Plan created</h2><button onClick={()=>setView('dashboard')}>Dashboard</button></div><div className='success'>Production plan is active and ready for scanning.</div></section></main>}
 {view==='operator'&&<main><section className='operator-card'><div className='operator-top'><div><span className='eyebrow'>OPERATOR SCAN</span><h2>{selectedPlan?.product_name||'Select a plan'}</h2><p>{selectedPlan?.model||''} · {selectedPlan?.production_line||''}</p></div><label>Operator<input value={operator} onChange={e=>setOperator(e.target.value)}/></label></div><div className='scanner'>{camera?<video ref={videoRef} autoPlay muted playsInline/>:<div className='camera-placeholder'>Camera scanner ready</div>}</div><div className='scan-actions'>{camera?<button className='primary' onClick={stopCamera}>Stop Camera</button>:<button className='primary' onClick={startCamera} disabled={!selectedPlan}>Start Camera Scan</button>}<input placeholder='Or enter serial manually' onKeyDown={e=>{if(e.key==='Enter'){scan(e.currentTarget.value);e.currentTarget.value=''}}}/></div><div className='status'>{message||'Ready to scan'}</div></section></main>}
 </div>
}
