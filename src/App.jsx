import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BrowserQRCodeReader} from '@zxing/browser';
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
 const [form,setForm]=useState({production_date:new Date().toISOString().slice(0,10),brand:'LifeLong',product_name:'LifeLong OTG',model:'RCAD60',production_line:'Line 2',planned_qty:500});
 const operator='Operator'; const [camera,setCamera]=useState(false); const videoRef=useRef(null); const readerRef=useRef(null); const scanRef=useRef(null); const scanInFlightRef=useRef(false); const cameraLastCodeRef=useRef(''); const lastScanRef=useRef({value:'',at:0}); const [operatorFilters,setOperatorFilters]=useState({production_line:'',brand:'',product_name:''}); const [planSerials,setPlanSerials]=useState([]); const [duplicateScans,setDuplicateScans]=useState([]); const [detailsPanel,setDetailsPanel]=useState(''); const [duplicateWarning,setDuplicateWarning]=useState(null); const [now,setNow]=useState(new Date()); const [lastScanAt,setLastScanAt]=useState(null);
 const load=async()=>{const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(100);if(error){setMessage(error.message);return;}if(data)setPlans(data)};
 const fetchAllRows=async queryBuilder=>{
  const rows=[];let offset=0;
  while(true){
   const {data,error}=await queryBuilder(offset,offset+999);
   if(error)return {data:null,error};
   const page=data||[];rows.push(...page);
   if(page.length<1000)break;
   offset+=1000;
  }
  return {data:rows,error:null};
 };
 const refreshPlanMetrics=async(plan=selectedPlan)=>{
  if(!plan){setPlanSerials([]);setDuplicateScans([]);return;}
  const [serialResult,duplicateResult]=await Promise.all([
   fetchAllRows((from,to)=>supabase.from('plan_serials').select('id,label_number,serial_number,status,scanned_at,scanned_by,sequence_no').eq('plan_id',plan.id).order('sequence_no',{ascending:true}).range(from,to)),
   fetchAllRows((from,to)=>supabase.from('scan_events').select('id,plan_id,serial_number,scanned_at,operator_name,production_line').eq('plan_id',plan.id).eq('scan_status','duplicate').order('scanned_at',{ascending:false}).range(from,to))
  ]);
  if(serialResult.error){setMessage('Could not load plan progress: '+serialResult.error.message);return;}
  if(duplicateResult.error){setMessage('Could not load duplicate scans: '+duplicateResult.error.message);return;}
  setPlanSerials(serialResult.data||[]);
  setDuplicateScans(duplicateResult.data||[]);
 };
 useEffect(()=>{load()},[]);
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  if(view!=='operator'||!selectedPlan){setPlanSerials([]);setDuplicateScans([]);return;}
  refreshPlanMetrics(selectedPlan);
  const timer=setInterval(()=>refreshPlanMetrics(selectedPlan),4000);
  return()=>clearInterval(timer);
 },[view,selectedPlan?.id]);
 const activePlans=useMemo(()=>plans.filter(p=>p.status==='active'),[plans]);
 const operatorLines=useMemo(()=>[...new Set(activePlans.map(p=>p.production_line).filter(Boolean))].sort(),[activePlans]);
 const operatorBrands=useMemo(()=>[...new Set(activePlans.filter(p=>!operatorFilters.production_line||p.production_line===operatorFilters.production_line).map(p=>p.brand).filter(Boolean))].sort(),[activePlans,operatorFilters.production_line]);
 const operatorProducts=useMemo(()=>[...new Set(activePlans.filter(p=>(!operatorFilters.production_line||p.production_line===operatorFilters.production_line)&&(!operatorFilters.brand||p.brand===operatorFilters.brand)).map(p=>p.product_name).filter(Boolean))].sort(),[activePlans,operatorFilters.production_line,operatorFilters.brand]);
 const matchingOperatorPlans=useMemo(()=>activePlans.filter(p=>(!operatorFilters.production_line||p.production_line===operatorFilters.production_line)&&(!operatorFilters.brand||p.brand===operatorFilters.brand)&&(!operatorFilters.product_name||p.product_name===operatorFilters.product_name)),[activePlans,operatorFilters.production_line,operatorFilters.brand,operatorFilters.product_name]);
 const pendingSerials=useMemo(()=>planSerials.filter(s=>s.status!=='scanned'),[planSerials]);
 const scannedSerials=useMemo(()=>planSerials.filter(s=>s.status==='scanned'),[planSerials]);
 const uniqueDuplicateSerials=useMemo(()=>[...new Map(duplicateScans.map(e=>[e.serial_number,e])).values()],[duplicateScans]);
 const lastScannedRecord=useMemo(()=>scannedSerials.reduce((latest,row)=>!latest||new Date(row.scanned_at||0).getTime()>new Date(latest.scanned_at||0).getTime()?row:latest,null),[scannedSerials]);

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
  const {data:plan,error:planError}=await supabase.from('production_plans').insert({...form,brand:form.brand.trim()||'Unspecified',planned_qty:qty,status:'draft'}).select().single();
  if(planError){setBusy(false);return setMessage('Could not create plan: '+planError.message);}
  const payload=chosen.map((r,i)=>({...r,plan_id:plan.id,sequence_no:i+1}));
  const {error:serialError}=await supabase.from('plan_serials').insert(payload);
  if(serialError){setBusy(false);await load();return setMessage('Plan saved as draft, but serial allocation failed: '+serialError.message+'. No active plan was published.');}
  const {data:activePlan,error:activateError}=await supabase.from('production_plans').update({status:'active'}).eq('id',plan.id).select().single();
  if(activateError){setBusy(false);await load();return setMessage('Serials were allocated, but activation failed: '+activateError.message+'. Ask an admin to review the draft.');}
  await load();setSelectedPlan(activePlan);setBusy(false);setMessage('Plan created with '+payload.length.toLocaleString()+' allocated serials.');setView('plans');
 };
 const scan=async value=>{
  if(scanInFlightRef.current||!selectedPlan||!value)return;
  const raw=String(value).trim().toUpperCase();if(!raw)return;
  const token=raw.match(/\bP-\d+\b|\bGM\d+\b/i),clean=(token?.[0]||raw).toUpperCase();
  const nowMs=Date.now();if(lastScanRef.current.value===clean&&nowMs-lastScanRef.current.at<700)return;
  lastScanRef.current={value:clean,at:nowMs};
  scanInFlightRef.current=true;
  setLastScanAt(new Date(nowMs).toISOString());
  try{
   const lookup=supabase.from('plan_serials').select('*').eq('plan_id',selectedPlan.id);
   const lookupQuery=/^(P-\d+|GM\d+)$/i.test(clean)?lookup.or('serial_number.eq.'+clean+',label_number.eq.'+clean):lookup.eq('serial_number',clean);
   const {data,error}=await lookupQuery.maybeSingle();
   if(error){setMessage('Could not check serial '+clean+': '+error.message);cameraLastCodeRef.current='';return;}
   const recordEvent=async(status,serialValue)=>{
    const {error:eventError}=await supabase.from('scan_events').insert({serial_number:serialValue||clean,plan_id:selectedPlan.id,operator_name:operator,production_line:selectedPlan.production_line||null,scan_status:status});
    return eventError;
   };
   const showDuplicate=row=>{
    const detectedAt=new Date().toISOString();
    setDuplicateWarning({serial_number:row.serial_number,label_number:row.label_number||clean,detected_at:detectedAt});
    setMessage('DUPLICATE SCAN: '+row.serial_number+' · Label '+(row.label_number||clean));
    setCamera(false);
    void recordEvent('duplicate',row.serial_number);
    void refreshPlanMetrics(selectedPlan);
   };
   if(!data){
    setMessage('NOT REGISTERED IN THIS PLAN: '+clean);
    void recordEvent('missing',clean);
    return;
   }
   if(data.status==='scanned'){showDuplicate(data);return;}
   const scannedAt=new Date().toISOString();
   const {data:updated,error:updateError}=await supabase.from('plan_serials')
    .update({status:'scanned',scanned_at:scannedAt,scanned_by:operator})
    .eq('id',data.id).eq('status','pending').select('id').maybeSingle();
   if(updateError){setMessage('Could not record scan: '+updateError.message);cameraLastCodeRef.current='';return;}
   if(!updated){showDuplicate(data);return;}
   setPlanSerials(previous=>previous.map(row=>row.id===data.id?{...row,status:'scanned',scanned_at:scannedAt,scanned_by:operator}:row));
   setLastScanAt(scannedAt);
   setMessage('✓ REGISTERED & SCANNED: '+data.serial_number+' · Label '+(data.label_number||'—'));
   void recordEvent('success',data.serial_number).then(eventError=>{
    if(eventError)setMessage(current=>current.startsWith('✓ REGISTERED & SCANNED: '+data.serial_number)?current+' (scan event logging failed)':current);
   });
  }catch(error){
   setMessage('Scan failed: '+(error?.message||'Unknown error'));
   cameraLastCodeRef.current='';
  }finally{
   scanInFlightRef.current=false;
  }
 };
 scanRef.current=scan;
 useEffect(()=>{
  if(!camera)return;
  let disposed=false;let scannerControls=null;
  const reader=new BrowserQRCodeReader();readerRef.current=reader;cameraLastCodeRef.current='';
  const boot=async()=>{
   const video=videoRef.current;
   if(!video){if(!disposed){setMessage('Camera preview is not ready. Please try again.');setCamera(false);}return;}
   video.muted=true;video.playsInline=true;
   try{
    scannerControls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'}}},video,(result)=>{
     if(disposed||!result||scanInFlightRef.current)return;
     const text=result.getText();
     const token=String(text).trim().toUpperCase().match(/\bP-\d+\b|\bGM\d+\b/i);
     const code=(token?.[0]||String(text).trim()).toUpperCase();
     if(!code||cameraLastCodeRef.current===code)return;
     cameraLastCodeRef.current=code;
     void scanRef.current?.(text);
    });
    if(disposed)scannerControls?.stop();
   }catch(e){if(!disposed){setMessage('Camera could not start. Check browser camera permission and allow camera access. '+(e?.message||''));setCamera(false);}}
  };
  void boot();
  return()=>{disposed=true;try{scannerControls?.stop()}catch{}try{reader.reset()}catch{}if(videoRef.current)videoRef.current.srcObject=null;if(readerRef.current===reader)readerRef.current=null;};
 },[camera,selectedPlan?.id]);
 const startCamera=()=>{setMessage('Starting camera…');setCamera(true)};
 const stopCamera=()=>{try{readerRef.current?.reset()}catch{}setCamera(false)};
 return <div className='app'><header><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div><div className='top-actions'><span className='live'>● LIVE</span><button onClick={()=>setView('dashboard')}>Dashboard</button><button onClick={()=>setView('planner')}>Production Planner</button><button onClick={()=>setView('operator')}>Operator</button></div></header>
 {view==='dashboard'&&<main><section className='hero'><div><span className='eyebrow'>CONTROL CENTRE</span><h2>Today's production</h2><p>Create the plan first, then let operators scan only the serials allocated to that plan.</p></div><button className='primary' onClick={()=>setView('planner')}>+ Create Production Plan</button></section><div className='cards'><div><b>{plans.length}</b><span>Active / recent plans</span></div><div><b>{stats.target}</b><span>Total planned units</span></div><div><b>{plans.filter(p=>p.status==='active').length}</b><span>Active today</span></div></div><section className='panel'><div className='panel-head'><h3>Production plans</h3><button onClick={load}>Refresh</button></div><table><thead><tr><th>Date</th><th>Product</th><th>Model</th><th>Line</th><th>Qty</th><th>Status</th></tr></thead><tbody>{plans.map(p=><tr key={p.id} onClick={()=>{setSelectedPlan(p);setOperatorFilters({production_line:p.production_line||'',brand:p.brand||'',product_name:p.product_name||''});setView('operator')}}><td>{p.production_date}</td><td>{p.product_name}</td><td>{p.model}</td><td>{p.production_line}</td><td>{p.planned_qty}</td><td><span className='badge'>{p.status}</span></td></tr>)}</tbody></table>{!plans.length&&<div className='empty'>No production plan yet.</div>}</section></main>}
 {view==='planner'&&<main><section className='panel'><div className='panel-head'><div><span className='eyebrow'>ADMIN / PLANNER</span><h2>Create daily production plan</h2></div><button onClick={()=>setView('dashboard')}>Back</button></div><div className='grid'><label>Production date<input type='date' value={form.production_date} onChange={e=>setForm({...form,production_date:e.target.value})}/></label><label>Brand<input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} placeholder='e.g. LifeLong'/></label><label>Product<input value={form.product_name} onChange={e=>setForm({...form,product_name:e.target.value})}/></label><label>Model<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></label><label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(x=><option key={x}>{x}</option>)}</select></label><label>Planned quantity<input type='number' min='1' value={form.planned_qty} onChange={e=>setForm({...form,planned_qty:e.target.value})}/></label></div><div className='upload'><h3>Supplier serial-number file</h3><p>Upload the original supplier PDF directly, or use CSV/TXT. Pro Scan extracts P-label numbers and GM serial numbers, pairs them in supplier order, and checks for duplicates before creating a plan.</p><input type='file' accept='.csv,.txt,.pdf,application/pdf,text/csv,text/plain' disabled={busy} onChange={importFile}/><div className='range'>{rows.length?<><b>{rows.length.toLocaleString()}</b> serial-label pairs loaded{sourceFile?' from '+sourceFile:''}{fileInfo?' · '+fileInfo:''}<p>Planned quantity: <b>{Number(form.planned_qty||0).toLocaleString()}</b>. The first planned-quantity labels will be allocated to this plan.</p></>:<>No serial file loaded. A valid supplier file is required. Demo serials are disabled.</>}</div></div>
 {rows.length>0&&<section className='preview-panel'><div className='panel-head'><div><h3>Serial allocation preview</h3><p className='muted'>First 4 and last 4 pairs from the source file.</p></div><span className='badge'>{rows.length.toLocaleString()} valid pairs</span></div><div className='table-scroll'><table><thead><tr><th>Label number</th><th>Serial number</th><th>Allocation</th></tr></thead><tbody>{(rows.length<=8?rows:[...rows.slice(0,4),...rows.slice(-4)]).map((r,i)=><tr key={r.label_number}><td>{r.label_number}</td><td>{r.serial_number}</td><td>{i<Math.min(4,rows.length)?(i<Number(form.planned_qty)?'Included':'Not allocated'):(rows.indexOf(r)<Number(form.planned_qty)?'Included':'Not allocated')}</td></tr>)}</tbody></table></div></section>}
 <div className='actions'><button className='primary' disabled={busy} onClick={createPlan}>{busy?'Please wait…':'Create Production Plan'}</button></div>{message&&<div className='notice'>{message}</div>}</section></main>}
 {view==='plans'&&<main><section className='panel'><div className='panel-head'><h2>Plan created</h2><button onClick={()=>setView('dashboard')}>Dashboard</button></div><div className='success'>Production plan is active and ready for scanning.</div></section></main>}
 {view==='operator'&&<main><section className='operator-card'>
 <div className='operator-clock'><div><span className='eyebrow'>CURRENT DATE & TIME</span><strong>{now.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</strong></div><b>{now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}</b></div>
 <div className='operator-top'><div><span className='eyebrow'>OPERATOR SCAN</span><h2>{selectedPlan?.product_name||'Select your production assignment'}</h2><p>{selectedPlan?(selectedPlan.brand||'—')+' · '+selectedPlan.model+' · '+selectedPlan.production_line:'Choose a line, brand and product to load the matching active plan.'}</p></div></div>
 <div className='operator-filter-grid'>
  <label>Production line<select value={operatorFilters.production_line} onChange={e=>{setOperatorFilters({production_line:e.target.value,brand:'',product_name:''});setSelectedPlan(null);setDetailsPanel('')}}><option value=''>Choose production line</option>{operatorLines.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
  <label>Brand<select value={operatorFilters.brand} disabled={!operatorFilters.production_line} onChange={e=>{setOperatorFilters({...operatorFilters,brand:e.target.value,product_name:''});setSelectedPlan(null);setDetailsPanel('')}}><option value=''>Choose brand</option>{operatorBrands.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
  <label>Product<select value={operatorFilters.product_name} disabled={!operatorFilters.brand} onChange={e=>{const next={...operatorFilters,product_name:e.target.value};setOperatorFilters(next);const matches=activePlans.filter(p=>p.production_line===next.production_line&&p.brand===next.brand&&p.product_name===next.product_name);setSelectedPlan(matches[0]||null);setDetailsPanel('')}}><option value=''>Choose product</option>{operatorProducts.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
 </div>
 {operatorFilters.production_line&&operatorFilters.brand&&operatorFilters.product_name&&<div className='matching-plan-row'><label>Matching production plan<select value={selectedPlan?.id||''} onChange={e=>{const plan=matchingOperatorPlans.find(p=>p.id===e.target.value)||null;setSelectedPlan(plan);setDetailsPanel('');setDuplicateWarning(null)}}><option value=''>Choose production plan</option>{matchingOperatorPlans.map(p=><option key={p.id} value={p.id}>{p.production_date} · {p.model} · {Number(p.planned_qty||0).toLocaleString()} planned · {p.production_line}</option>)}</select></label>{selectedPlan&&<span className='badge'>ACTIVE PLAN</span>}</div>}
 {selectedPlan&&<><div className='operator-plan-strip'><div><span className='eyebrow'>SELECTED PLAN</span><strong>{selectedPlan.brand||'—'} · {selectedPlan.product_name} · {selectedPlan.model}</strong><span>{selectedPlan.production_line} · Production date: {selectedPlan.production_date}</span></div><div className='plan-stamp'><span>Plan status</span><b>{selectedPlan.status}</b></div></div>
  <div className='operator-metrics'>
   <button className='metric-tile' onClick={()=>setDetailsPanel(detailsPanel==='planned'?'':'planned')}><span>Total planned quantity</span><b>{Number(selectedPlan.planned_qty||0).toLocaleString()}</b><small>View planned serial list</small></button>
   <button className='metric-tile metric-good' onClick={()=>setDetailsPanel(detailsPanel==='scanned'?'':'scanned')}><span>Actual scanned</span><b>{scannedSerials.length.toLocaleString()}</b><small>{selectedPlan.planned_qty?Math.round(scannedSerials.length/Number(selectedPlan.planned_qty)*100):0}% complete · View scanned items</small></button>
   <button className='metric-tile metric-danger' onClick={()=>setDetailsPanel(detailsPanel==='duplicates'?'':'duplicates')}><span>Duplicate serials</span><b>{uniqueDuplicateSerials.length.toLocaleString()}</b><small>{duplicateScans.length.toLocaleString()} duplicate scan events · Click to view</small></button>
   <button className='metric-tile metric-warn' onClick={()=>setDetailsPanel(detailsPanel==='missing'?'':'missing')}><span>Missing / not yet scanned</span><b>{pendingSerials.length.toLocaleString()}</b><small>Remaining planned serials · Click to view</small></button>
  </div>
  {detailsPanel&&<section className='serial-details'><div className='panel-head'><div><span className='eyebrow'>PLAN SERIAL REPORT</span><h3>{detailsPanel==='planned'?'All planned serials':detailsPanel==='scanned'?'Successfully scanned serials':detailsPanel==='duplicates'?'Duplicate serial scan events':'Missing / not yet scanned serials'}</h3></div><button onClick={()=>setDetailsPanel('')}>Close</button></div>
   {detailsPanel==='duplicates'?(duplicateScans.length?<div className='table-scroll'><table><thead><tr><th>Serial number</th><th>Detected date & time</th><th>Operator</th></tr></thead><tbody>{duplicateScans.map((d,i)=><tr key={d.id||i}><td><b>{d.serial_number}</b></td><td>{d.scanned_at?new Date(d.scanned_at).toLocaleString('en-IN'):'—'}</td><td>{d.operator_name||'—'}</td></tr>)}</tbody></table></div>:<div className='empty'>No duplicate scans recorded for this plan.</div>):
   <div className='table-scroll'><table><thead><tr><th>#</th><th>Label number</th><th>Serial number</th><th>Status</th><th>Scanned date & time</th><th>Operator</th></tr></thead><tbody>{(detailsPanel==='planned'?planSerials:detailsPanel==='scanned'?scannedSerials:pendingSerials).map((r,i)=><tr key={r.id}><td>{r.sequence_no||i+1}</td><td>{r.label_number||'—'}</td><td><b>{r.serial_number}</b></td><td><span className={r.status==='scanned'?'badge':'status-pill'}>{r.status}</span></td><td>{r.scanned_at?new Date(r.scanned_at).toLocaleString('en-IN'):'—'}</td><td>{r.scanned_by||'—'}</td></tr>)}</tbody></table></div>}
  </section>}
  <div className='scanner'>{camera?<video ref={videoRef} autoPlay muted playsInline webkit-playsinline='true'/>:<div className='camera-placeholder'><span className='camera-icon'>▣</span><b>Mobile camera scanner</b><span>Point the camera at the serial-number barcode.</span></div>}</div>
  <div className='scan-actions'>{camera?<button className='primary' onClick={stopCamera}>Stop Camera Scan</button>:<button className='primary scan-start' onClick={startCamera}>Start Camera Scan</button>}<span className='scan-instructions'>Manual serial entry is disabled. Use the device camera to scan labels.</span></div>
  <div className='last-scanned-banner'><div><span>LAST SCANNED SERIAL NUMBER</span><strong>{lastScannedRecord?.serial_number||'No serial scanned yet'}</strong>{lastScannedRecord?.label_number&&<small>Label {lastScannedRecord.label_number}</small>}</div><div className='last-scanned-at'><span>Scanned at</span><b>{lastScannedRecord?.scanned_at?new Date(lastScannedRecord.scanned_at).toLocaleString('en-IN'):'—'}</b></div></div>
  <div className={'status '+(duplicateWarning?'status-danger':'')}>{message||'Ready to scan'}</div>
  <div className='last-scan-time'><span>Last scan attempt</span><b>{lastScanAt?new Date(lastScanAt).toLocaleString('en-IN'):'No scan yet'}</b><span className='live-refresh'>Progress refreshes automatically</span></div>
 </>}
 {!selectedPlan&&<div className='notice'>{operatorFilters.product_name?'No active production plan matches these filters.':'Select production line, brand and product to display the relevant active production plan.'}</div>}
 </section></main>}
 {duplicateWarning&&<div className='warning-backdrop' role='alertdialog' aria-modal='true' aria-labelledby='duplicate-warning-title'><section className='warning-dialog'><div className='warning-symbol'>!</div><span className='eyebrow'>OPERATOR ATTENTION REQUIRED</span><h2 id='duplicate-warning-title'>Duplicate serial detected</h2><p>This serial has already been scanned for the selected production plan. Do not apply the same label again.</p><div className='warning-serial'><span>Serial number</span><b>{duplicateWarning.serial_number}</b><span>Label number</span><b>{duplicateWarning.label_number}</b></div><p className='warning-time'>Detected: {new Date(duplicateWarning.detected_at).toLocaleString('en-IN')}</p><button className='warning-ack' onClick={()=>setDuplicateWarning(null)}>Acknowledge warning</button></section></div>}
 </div>
}
