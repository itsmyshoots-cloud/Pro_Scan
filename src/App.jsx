import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BrowserCodeReader,BrowserMultiFormatReader} from '@zxing/browser';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {supabase} from './lib/supabase';

pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;

const lines=['Line 1','Line 2','Line 3'];
function createHourlyTargets(start='09:00',end='18:00',previous=[]){
 const toMinutes=value=>{const match=/^(\d{2}):(\d{2})$/.exec(value||'');if(!match)return NaN;const h=Number(match[1]),m=Number(match[2]);return h>=0&&h<24&&m===0?h*60+m:NaN;};
 const startMinutes=toMinutes(start),endMinutes=toMinutes(end);
 if(!Number.isFinite(startMinutes)||!Number.isFinite(endMinutes)||endMinutes<=startMinutes)return [];
 const targetByHour=new Map((previous||[]).map(row=>[row.hour,Number(row.planned_qty||0)]));
 const output=[];
 for(let minute=startMinutes;minute<endMinutes&&output.length<24;minute+=60){
  const hour=String(Math.floor(minute/60)).padStart(2,'0')+':00';
  output.push({hour,planned_qty:targetByHour.get(hour)||0});
 }
 return output;
}
function localDateKey(date){
 return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function csvCell(value){return '"'+String(value??'').replace(/"/g,'""')+'"';}
function downloadCsv(filename,headers,rows){
 const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
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
 const operator='Operator'; const [camera,setCamera]=useState(false); const videoRef=useRef(null); const readerRef=useRef(null); const scanRef=useRef(null); const scanInFlightRef=useRef(false); const cameraLastCodeRef=useRef(''); const lastScanRef=useRef({value:'',at:0}); const [operatorFilters,setOperatorFilters]=useState({production_line:'',brand:'',product_name:''}); const [planSerials,setPlanSerials]=useState([]); const [duplicateScans,setDuplicateScans]=useState([]); const [detailsPanel,setDetailsPanel]=useState(''); const [duplicateWarning,setDuplicateWarning]=useState(null); const [now,setNow]=useState(new Date()); const [lastScanAt,setLastScanAt]=useState(null); const [shiftStart,setShiftStart]=useState('09:00'); const [shiftEnd,setShiftEnd]=useState('18:00'); const [hourlyTargets,setHourlyTargets]=useState(()=>createHourlyTargets()); const [importConflicts,setImportConflicts]=useState([]); const [selectedMonitoringLine,setSelectedMonitoringLine]=useState(''); const [selectedMonitoringPlanId,setSelectedMonitoringPlanId]=useState(''); const [monitoringSerials,setMonitoringSerials]=useState([]); const [monitoringEvents,setMonitoringEvents]=useState([]); const [monitoringUpdatedAt,setMonitoringUpdatedAt]=useState(null); const [monitoringBusy,setMonitoringBusy]=useState(false); const [monitoringError,setMonitoringError]=useState(''); const [duplicateEventCount,setDuplicateEventCount]=useState(0); const [planStatusFilter,setPlanStatusFilter]=useState('all'); const [statusUpdatingId,setStatusUpdatingId]=useState(''); const monitoringRefreshRef=useRef(false);
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

 const checkDatabaseForConflicts=async(parsedRows)=>{
  const [allocatedResult,registryResult]=await Promise.all([
   fetchAllRows((from,to)=>supabase.from('plan_serials').select('plan_id,serial_number,label_number').order('id',{ascending:true}).range(from,to)),
   fetchAllRows((from,to)=>supabase.from('serial_numbers').select('serial_number').order('id',{ascending:true}).range(from,to))
  ]);
  if(allocatedResult.error)throw new Error('Could not check existing production serial batches: '+allocatedResult.error.message);
  if(registryResult.error)throw new Error('Could not check the serial registry: '+registryResult.error.message);
  const serialAllocations=new Map(),labelAllocations=new Map(),registeredSerials=new Set();
  for(const row of allocatedResult.data||[]){
   if(row.serial_number){if(!serialAllocations.has(row.serial_number))serialAllocations.set(row.serial_number,row); }
   if(row.label_number){if(!labelAllocations.has(row.label_number))labelAllocations.set(row.label_number,row);}
  }
  for(const row of registryResult.data||[]){if(row.serial_number)registeredSerials.add(row.serial_number);}
  const conflicts=[];
  for(const row of parsedRows){
   const reasons=[],existingSerial=serialAllocations.get(row.serial_number),existingLabel=labelAllocations.get(row.label_number);
   if(existingSerial)reasons.push('Serial '+row.serial_number+' is already allocated in a production plan');
   if(registeredSerials.has(row.serial_number))reasons.push('Serial '+row.serial_number+' already exists in the serial registry');
   if(existingLabel)reasons.push('Label '+row.label_number+' is already allocated in a production plan');
   if(reasons.length)conflicts.push({label_number:row.label_number,serial_number:row.serial_number,reasons:[...new Set(reasons)],existing_plan_id:existingSerial?.plan_id||existingLabel?.plan_id||''});
  }
  return conflicts;
 };
 const refreshMonitoring=async()=>{
  if(monitoringRefreshRef.current)return;
  monitoringRefreshRef.current=true;
  try{
   const [serialResult,eventResult]=await Promise.all([
    fetchAllRows((from,to)=>supabase.from('plan_serials').select('id,plan_id,status,scanned_at,serial_number,label_number,sequence_no').order('sequence_no',{ascending:true}).range(from,to)),
    supabase.from('scan_events').select('id,plan_id,serial_number,scan_status,scanned_at,production_line').order('scanned_at',{ascending:false}).limit(100)
   ]);
   if(serialResult.error){setMonitoringError('Could not load production progress: '+serialResult.error.message);return;}
   if(eventResult.error){setMonitoringError('Could not load recent scan activity: '+eventResult.error.message);return;}
   setMonitoringSerials(serialResult.data||[]);
   setMonitoringEvents(eventResult.data||[]);
   const activeIds=plans.filter(p=>p.status==='active').map(p=>p.id);
   if(activeIds.length){
    const countResult=await supabase.from('scan_events').select('id',{count:'exact',head:true}).eq('scan_status','duplicate').in('plan_id',activeIds);
    if(!countResult.error)setDuplicateEventCount(countResult.count||0);
   }else setDuplicateEventCount(0);
   setMonitoringUpdatedAt(new Date());
   setMonitoringError('');
  }catch(error){setMonitoringError(error?.message||'Could not refresh live monitoring.');}
  finally{monitoringRefreshRef.current=false;}
 };
 const updatePlanStatus=async(planId,status)=>{
  setStatusUpdatingId(planId);
  const {data,error}=await supabase.from('production_plans').update({status}).eq('id',planId).select().single();
  if(error){setMessage('Could not update production plan: '+error.message);setStatusUpdatingId('');return;}
  setPlans(previous=>previous.map(plan=>plan.id===planId?data:plan));
  if(selectedPlan?.id===planId)setSelectedPlan(data);
  setMessage('Production plan status changed to '+status+'.');
  setStatusUpdatingId('');
  await refreshMonitoring();
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
 useEffect(()=>{if(!['dashboard','live-monitoring','manage'].includes(view))return;void refreshMonitoring();const timer=setInterval(()=>{void refreshMonitoring()},8000);return()=>clearInterval(timer)},[view,plans.map(plan=>plan.id+':'+plan.status).join('|')]);
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
 const activePlanIds=useMemo(()=>new Set(activePlans.map(plan=>plan.id)),[activePlans]);
 const activePlanSerials=useMemo(()=>monitoringSerials.filter(row=>activePlanIds.has(row.plan_id)),[monitoringSerials,activePlanIds]);
 const activePlannedQty=useMemo(()=>activePlans.reduce((sum,plan)=>sum+Number(plan.planned_qty||0),0),[activePlans]);
 const activeScannedQty=useMemo(()=>activePlanSerials.filter(row=>row.status==='scanned').length,[activePlanSerials]);
 const activePendingQty=useMemo(()=>activePlanSerials.filter(row=>row.status!=='scanned').length,[activePlanSerials]);
 const productionLineStats=useMemo(()=>[...new Set(activePlans.map(plan=>plan.production_line||'Unassigned'))].sort().map(line=>{
  const linePlans=activePlans.filter(plan=>(plan.production_line||'Unassigned')===line);
  const ids=new Set(linePlans.map(plan=>plan.id));
  const target=linePlans.reduce((sum,plan)=>sum+Number(plan.planned_qty||0),0);
  const scanned=monitoringSerials.filter(row=>ids.has(row.plan_id)&&row.status==='scanned').length;
  const pending=monitoringSerials.filter(row=>ids.has(row.plan_id)&&row.status!=='scanned').length;
  return {line,plans:linePlans.length,target,scanned,pending,percent:target?Math.min(100,Math.round(scanned/target*100)):0};
 }),[activePlans,monitoringSerials]);
 const filteredPlans=useMemo(()=>plans.filter(plan=>planStatusFilter==='all'||plan.status===planStatusFilter),[plans,planStatusFilter]);

 const hourlyTargetTotal=useMemo(()=>hourlyTargets.reduce((sum,row)=>sum+Math.max(0,Number(row.planned_qty||0)),0),[hourlyTargets]);
 const selectedLinePlans=useMemo(()=>activePlans.filter(plan=>plan.production_line===selectedMonitoringLine),[activePlans,selectedMonitoringLine]);
 const selectedHourlyPlan=useMemo(()=>selectedLinePlans.find(plan=>plan.id===selectedMonitoringPlanId)||selectedLinePlans[0]||null,[selectedLinePlans,selectedMonitoringPlanId]);
 const hourlyReportRows=useMemo(()=>{
  if(!selectedHourlyPlan)return [];
  const buckets=new Map();
  const targets=Array.isArray(selectedHourlyPlan.hourly_targets)?selectedHourlyPlan.hourly_targets:[];
  for(const item of targets){
   const hour=String(item.hour||item.start_time||'').slice(0,5);
   if(!/^\d{2}:\d{2}$/.test(hour))continue;
   buckets.set(hour,{hour,planned_qty:Number(item.planned_qty||0),actual_qty:0});
  }
  for(const serial of monitoringSerials){
   if(serial.plan_id!==selectedHourlyPlan.id||serial.status!=='scanned'||!serial.scanned_at)continue;
   const scannedAt=new Date(serial.scanned_at);
   if(localDateKey(scannedAt)!==selectedHourlyPlan.production_date)continue;
   const hour=String(scannedAt.getHours()).padStart(2,'0')+':00';
   const bucket=buckets.get(hour)||{hour,planned_qty:0,actual_qty:0};
   bucket.actual_qty+=1;buckets.set(hour,bucket);
  }
  return [...buckets.values()].sort((a,b)=>a.hour.localeCompare(b.hour)).map(row=>({...row,variance:row.actual_qty-row.planned_qty}));
 },[selectedHourlyPlan,monitoringSerials]);
 const hourlyChartMax=useMemo(()=>Math.max(1,...hourlyReportRows.flatMap(row=>[row.planned_qty,row.actual_qty])),[hourlyReportRows]);
 const downloadHourlyReport=()=>{
  if(!selectedHourlyPlan||!hourlyReportRows.length)return;
  const headers=['Product','Brand','Model','Production Date','Production Line','Plan Status','Hour','Planned Quantity','Actual Scanned','Variance (Actual - Planned)'];
  const data=hourlyReportRows.map(row=>[selectedHourlyPlan.product_name,selectedHourlyPlan.brand||'',selectedHourlyPlan.model,selectedHourlyPlan.production_date,selectedHourlyPlan.production_line,selectedHourlyPlan.status,row.hour, row.planned_qty,row.actual_qty,row.variance]);
  const slug=String(selectedHourlyPlan.product_name||'production').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  downloadCsv('hourly-production-'+slug+'-'+selectedHourlyPlan.production_date+'.csv',headers,data);
 };
 const openLineHourly=line=>{const linePlans=activePlans.filter(plan=>(plan.production_line||'Unassigned')===line);setSelectedMonitoringLine(line);setSelectedMonitoringPlanId(linePlans[0]?.id||'');};



 const stats=useMemo(()=>plans.reduce((a,p)=>{a.target+=p.planned_qty||0;return a},{target:0}),[plans]);
 const importFile=async e=>{
  const input=e.currentTarget,f=input.files?.[0];if(!f)return;
  setBusy(true);setRows([]);setImportConflicts([]);setSourceFile('');setFileInfo('');setMessage('Reading '+f.name+'…');
  try{
   let parsed,pages=0;
   if(f.name.toLowerCase().endsWith('.pdf')){const result=await parseSupplierPdf(f,setMessage);parsed=result.rows;pages=result.pages;}
   else parsed=pairsFromText(await f.text());
   validatePairs(parsed);setRows(parsed);setSourceFile(f.name);setFileInfo(pages?'PDF · '+pages.toLocaleString()+' pages':'Text/CSV file');
   setMessage('Checking '+parsed.length.toLocaleString()+' serial-label pairs against existing production data…');
   const conflicts=await checkDatabaseForConflicts(parsed);
   setImportConflicts(conflicts);
   if(conflicts.length){
    setMessage('Upload blocked: '+conflicts.length.toLocaleString()+' serial/label pairs already exist in the database. Review the conflicts below before uploading a new batch.');
   }else{
    setMessage(parsed.length.toLocaleString()+' unique serial-label pairs loaded. No duplicates found in the database.');
   }
   if(!conflicts.length&&Number(form.planned_qty)>parsed.length)setMessage(parsed.length.toLocaleString()+' pairs loaded, but planned quantity exceeds the available serial count.');
  }catch(error){setRows([]);setImportConflicts([]);setMessage(error?.message||'Could not read or validate the supplier file.');}
  finally{setBusy(false);input.value='';}
 };
 const createPlan=async()=>{
  const qty=Number(form.planned_qty);
  if(!form.product_name.trim()||!form.model.trim())return setMessage('Enter product and model.');
  if(!Number.isInteger(qty)||qty<1)return setMessage('Planned quantity must be a whole number greater than zero.');
  if(!hourlyTargets.length)return setMessage('Set a valid hourly shift window before creating the production plan.');
  if(hourlyTargetTotal!==qty)return setMessage('Hourly target total ('+hourlyTargetTotal.toLocaleString()+') must equal total planned quantity ('+qty.toLocaleString()+').');
  if(!rows.length)return setMessage('Upload a valid supplier PDF, CSV, or TXT before creating a plan. Demo serials are disabled.');
  if(qty>rows.length)return setMessage('Planned quantity ('+qty.toLocaleString()+') exceeds available serials ('+rows.length.toLocaleString()+').');
  if(importConflicts.length)return setMessage('Plan creation blocked: '+importConflicts.length.toLocaleString()+' serial/label pairs in this upload already exist in the database.');
  const chosen=rows.slice(0,qty);
  try{validatePairs(chosen);}catch(error){return setMessage(error.message);}
  setBusy(true);setMessage('Rechecking uploaded batch against the database…');
  try{
   const conflicts=await checkDatabaseForConflicts(rows);
   setImportConflicts(conflicts);
   if(conflicts.length){setBusy(false);return setMessage('Plan creation blocked: '+conflicts.length.toLocaleString()+' serial/label pairs already exist in the database.');}
  }catch(error){setBusy(false);return setMessage(error?.message||'Could not validate serial uniqueness. No production plan was created.');}
  setMessage('Creating plan and allocating '+qty.toLocaleString()+' serials…');
  const hourlyPayload=hourlyTargets.map(row=>({hour:row.hour,planned_qty:Number(row.planned_qty||0)}));
  const {data:plan,error:planError}=await supabase.from('production_plans').insert({...form,brand:form.brand.trim()||'Unspecified',planned_qty:qty,hourly_targets:hourlyPayload,status:'draft'}).select().single();
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
  const reader=new BrowserMultiFormatReader();readerRef.current=reader;cameraLastCodeRef.current='';
  const boot=async()=>{
   const video=videoRef.current;
   if(!video){if(!disposed){setMessage('Camera preview is not ready. Please try again.');setCamera(false);}return;}
   video.muted=true;video.playsInline=true;
   try{
    const devices=await BrowserCodeReader.listVideoInputDevices();
    if(disposed)return;
    const rearCamera=devices.find(device=>/back|rear|environment|wide/i.test(device.label));
    const selectedDeviceId=rearCamera?.deviceId||devices[devices.length-1]?.deviceId;
    scannerControls=await reader.decodeFromVideoDevice(selectedDeviceId,video,(result,error)=>{
     if(disposed||!result||scanInFlightRef.current)return;
     const text=result.getText();
     const token=String(text).trim().toUpperCase().match(/\bP-\d+\b|\bGM\d+\b/i);
     const code=(token?.[0]||String(text).trim()).toUpperCase();
     if(!code||cameraLastCodeRef.current===code)return;
     cameraLastCodeRef.current=code;
     setMessage('QR detected: '+code+' · Checking selected plan…');
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
 return <div className={'app '+(view==='operator'?'app-operator':'')}><header><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div><div className='top-actions'><span className='live'>● LIVE</span><button className={view==='dashboard'?'nav-button is-active':'nav-button'} onClick={()=>setView('dashboard')}>Dashboard</button><button className={view==='live-monitoring'?'nav-button is-active':'nav-button'} onClick={()=>setView('live-monitoring')}>Live Monitoring</button><button className={view==='planner'?'nav-button is-active':'nav-button'} onClick={()=>setView('planner')}>Production Planning</button><button className={view==='manage'?'nav-button is-active':'nav-button'} onClick={()=>setView('manage')}>Manage Production</button><button className={view==='operator'?'nav-button is-active':'nav-button'} onClick={()=>setView('operator')}>Operator</button></div></header>
 {view==='dashboard'&&<main className='dashboard-page'>
 <section className='dashboard-hero'><div><span className='eyebrow'>PRODUCTION OVERVIEW</span><h2>Production at a glance</h2><p>Track today's production, see progress across active lines, and jump directly into live monitoring or production planning.</p></div><div className='dashboard-hero-actions'><button className='secondary-action' onClick={()=>{void load();void refreshMonitoring()}}>↻ Refresh</button><button className='primary' onClick={()=>setView('live-monitoring')}>View Live Monitoring ↗</button></div></section>
 {monitoringError&&<div className='notice dashboard-error'>{monitoringError}</div>}
 <div className='dashboard-kpis'>
  <div className='dashboard-kpi'><span className='kpi-label'>Active production plans</span><div className='kpi-value'>{activePlans.length.toLocaleString()}<span className='kpi-icon kpi-blue'>▦</span></div><small>Plans currently in production</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Planned quantity</span><div className='kpi-value'>{activePlannedQty.toLocaleString()}<span className='kpi-icon kpi-violet'>◎</span></div><small>Units allocated to active plans</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Actual scanned</span><div className='kpi-value'>{activeScannedQty.toLocaleString()}<span className='kpi-icon kpi-green'>✓</span></div><small>{activePlannedQty?Math.round(activeScannedQty/activePlannedQty*100):0}% of planned units complete</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Pending units</span><div className='kpi-value'>{activePendingQty.toLocaleString()}<span className='kpi-icon kpi-amber'>◷</span></div><small><span className='inline-alert'>{duplicateEventCount.toLocaleString()} duplicate scan events</span></small></div>
 </div>
 <div className='dashboard-content-grid'>
  <section className='panel dashboard-section'><div className='panel-head'><div><span className='eyebrow'>LINE PERFORMANCE</span><h3>Live production progress</h3></div><button onClick={()=>setView('live-monitoring')}>Full monitoring →</button></div>
   {productionLineStats.length?productionLineStats.map(stat=><div className='line-progress-row' key={stat.line}><div className='line-progress-head'><div><strong>{stat.line}</strong><span>{stat.plans} active {stat.plans===1?'plan':'plans'}</span></div><b>{stat.percent}%</b></div><div className='progress-track'><div className='progress-fill' style={{width:stat.percent+'%'}}/></div><div className='line-progress-foot'><span>{stat.scanned.toLocaleString()} scanned</span><span>{stat.pending.toLocaleString()} remaining / {stat.target.toLocaleString()}</span></div></div>):<div className='empty'>No active production lines. Create or activate a production plan to begin.</div>}
   <div className='panel-shortcuts'><button onClick={()=>setView('planner')}><span>＋</span><div><b>Production Planning</b><small>Create and allocate a new plan</small></div><strong>→</strong></button><button onClick={()=>setView('manage')}><span>☷</span><div><b>Manage Production</b><small>Review plans and update status</small></div><strong>→</strong></button></div>
  </section>
  <section className='panel dashboard-section'><div className='panel-head'><div><span className='eyebrow'>ACTIVE PLANS</span><h3>Production plan overview</h3></div><button onClick={()=>setView('manage')}>Manage all →</button></div>
   {activePlans.length?<div className='dashboard-plan-list'>{activePlans.slice(0,5).map(plan=>{const planRows=monitoringSerials.filter(row=>row.plan_id===plan.id);const scanned=planRows.filter(row=>row.status==='scanned').length;const pct=Number(plan.planned_qty)?Math.round(scanned/Number(plan.planned_qty)*100):0;return <div className='dashboard-plan-row' key={plan.id}><div className='plan-avatar'>{(plan.production_line||'P').replace(/[^0-9A-Za-z]/g,'').slice(-2)||'P'}</div><div className='dashboard-plan-main'><div className='dashboard-plan-title'><b>{plan.product_name}</b><span className='badge'>ACTIVE</span></div><span>{plan.brand||'—'} · {plan.model} · {plan.production_line}</span><div className='mini-progress'><div style={{width:pct+'%'}}/></div><small>{scanned.toLocaleString()} / {Number(plan.planned_qty||0).toLocaleString()} units scanned</small></div><button className='icon-action' title='Open operator scanner' onClick={()=>{setSelectedPlan(plan);setOperatorFilters({production_line:plan.production_line||'',brand:plan.brand||'',product_name:plan.product_name||''});setView('operator')}}>↗</button></div>})}</div>:<div className='empty'>No active plans. Use Production Planning to create a plan.</div>}
  </section>
 </div>
 <div className='dashboard-footer'><span><i className='live-dot'/> Monitoring refreshes automatically</span><span>Last updated: {monitoringUpdatedAt?monitoringUpdatedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Loading…'}</span><button onClick={()=>setView('operator')}>Open Operator Scanner →</button></div>
</main>}
{view==='live-monitoring'&&<main className='live-monitoring-page'>
 <section className='monitoring-hero'><div><span className='eyebrow'>SHOP FLOOR / LIVE VIEW</span><h2>Live production monitoring</h2><p>Current output, line-wise progress and the latest scans from active production.</p></div><div className='monitoring-live-status'><i className='live-dot'/> LIVE <span>{monitoringUpdatedAt?monitoringUpdatedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Connecting…'}</span><button onClick={()=>{void refreshMonitoring();void load()}}>↻ Refresh</button></div></section>
 {monitoringError&&<div className='notice dashboard-error'>{monitoringError}</div>}
 <div className='dashboard-kpis monitoring-kpis'>
  <div className='dashboard-kpi'><span className='kpi-label'>Active plans</span><div className='kpi-value'>{activePlans.length.toLocaleString()}<span className='kpi-icon kpi-blue'>▦</span></div><small>Currently running plans</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Planned units</span><div className='kpi-value'>{activePlannedQty.toLocaleString()}<span className='kpi-icon kpi-violet'>◎</span></div><small>Active-plan target</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Scanned units</span><div className='kpi-value'>{activeScannedQty.toLocaleString()}<span className='kpi-icon kpi-green'>✓</span></div><small>{activePlannedQty?Math.round(activeScannedQty/activePlannedQty*100):0}% completion</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Remaining units</span><div className='kpi-value'>{activePendingQty.toLocaleString()}<span className='kpi-icon kpi-amber'>◷</span></div><small>{duplicateEventCount.toLocaleString()} duplicate scan events on active plans</small></div>
 </div>
 <section className='panel live-line-panel'><div className='panel-head'><div><span className='eyebrow'>ACTIVE PRODUCTION LINES</span><h3>Line-wise production</h3></div><span className='refresh-caption'>Auto-refresh every 8 seconds</span></div>
  {productionLineStats.length?<div className='line-monitor-grid'>{productionLineStats.map(stat=><article className={'line-monitor-card '+(selectedMonitoringLine===stat.line?'is-selected':'')} role='button' tabIndex={0} onClick={()=>openLineHourly(stat.line)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLineHourly(stat.line);}}} key={stat.line}><div className='line-monitor-head'><span className='line-indicator'/><strong>{stat.line}</strong><span className='badge'>{stat.plans} {stat.plans===1?'PLAN':'PLANS'}</span></div><div className='line-monitor-percent'>{stat.percent}<small>%</small></div><div className='progress-track'><div className='progress-fill' style={{width:stat.percent+'%'}}/></div><div className='line-monitor-counts'><div><span>Scanned</span><b>{stat.scanned.toLocaleString()}</b></div><div><span>Remaining</span><b>{stat.pending.toLocaleString()}</b></div><div><span>Target</span><b>{stat.target.toLocaleString()}</b></div></div>{activePlans.filter(p=>(p.production_line||'Unassigned')===stat.line).map(plan=><div className='monitor-plan-link' key={plan.id}><span>{plan.brand||'—'} · {plan.product_name} · {plan.model}</span><button onClick={event=>{event.stopPropagation();setSelectedPlan(plan);setOperatorFilters({production_line:plan.production_line||'',brand:plan.brand||'',product_name:plan.product_name||''});setView('operator')}}>Open scanner →</button></div>)}</article>)}</div>:<div className='empty'>No active production plans to monitor.</div>}
 </section>
 {selectedMonitoringLine&&<section className='panel hourly-detail-panel' id='hourly-production-detail'>
  <div className='panel-head'><div><span className='eyebrow'>HOURLY OUTPUT ANALYSIS</span><h3>{selectedMonitoringLine} · Planned vs actual production</h3><p className='hourly-panel-subtitle'>Select a plan to compare its hourly target with serials successfully scanned on the plan date.</p></div><button onClick={()=>{setSelectedMonitoringLine('');setSelectedMonitoringPlanId('')}}>Close chart</button></div>
  {selectedLinePlans.length?<><div className='hourly-report-controls'>
   <label>Production plan<select value={selectedHourlyPlan?.id||''} onChange={e=>setSelectedMonitoringPlanId(e.target.value)}>{selectedLinePlans.map(plan=><option value={plan.id} key={plan.id}>{plan.production_date} · {plan.brand||'—'} · {plan.product_name} · {plan.model}</option>)}</select></label>
   {selectedHourlyPlan&&<div className='hourly-plan-summary'><strong>{selectedHourlyPlan.product_name}</strong><span>{selectedHourlyPlan.brand||'—'} · {selectedHourlyPlan.model} · {selectedHourlyPlan.production_date}</span><small>{Number(selectedHourlyPlan.planned_qty||0).toLocaleString()} planned units · {selectedHourlyPlan.status}</small></div>}
   <button className='primary report-download' disabled={!selectedHourlyPlan||!hourlyReportRows.length} onClick={downloadHourlyReport}>↓ Download Hourly CSV</button>
  </div>
  {selectedHourlyPlan&&(!Array.isArray(selectedHourlyPlan.hourly_targets)||selectedHourlyPlan.hourly_targets.length===0)&&<div className='notice hourly-target-warning'>This plan was created before hourly targets were enabled, so its planned hourly values are not available. New plans will store the targets entered in Production Planning. Actual scans, if any, are still shown below.</div>}
  <div className='hourly-chart-legend'><span><i className='legend-planned'/> Planned per hour</span><span><i className='legend-actual'/> Actual scanned</span><span className='hourly-date-note'>Production date: {selectedHourlyPlan?.production_date||'—'}</span></div>
  {hourlyReportRows.length?<div className='hourly-chart-scroll'><div className='hourly-chart' style={{minWidth:Math.max(520,hourlyReportRows.length*66)+'px'}}>{hourlyReportRows.map(row=><div className='hourly-chart-column' key={row.hour} title={row.hour+' — planned '+row.planned_qty+', actual '+row.actual_qty}>
   <div className='hourly-bar-values'><span>{row.planned_qty?row.planned_qty.toLocaleString():'·'}</span><span>{row.actual_qty?row.actual_qty.toLocaleString():'·'}</span></div>
   <div className='hourly-bars'><div className='hourly-bar planned-hour-bar' style={{height:(row.planned_qty?Math.max(3,row.planned_qty/hourlyChartMax*100):0)+'%'}}/><div className='hourly-bar actual-hour-bar' style={{height:(row.actual_qty?Math.max(3,row.actual_qty/hourlyChartMax*100):0)+'%'}}/></div>
   <b className='hourly-hour-label'>{row.hour}</b><small className={row.variance<0?'variance-negative':row.variance>0?'variance-positive':''}>{row.variance>0?'+':''}{row.variance.toLocaleString()}</small>
  </div>)}</div></div>:<div className='empty'>No hourly target or scanned-serial data exists for this plan date yet.</div>}
  {hourlyReportRows.length>0&&<div className='hourly-table-wrap'><table className='hourly-report-table'><thead><tr><th>Hour</th><th>Planned quantity</th><th>Actual scanned</th><th>Variance</th></tr></thead><tbody>{hourlyReportRows.map(row=><tr key={row.hour}><td>{row.hour}–{String(Number(row.hour.slice(0,2))+1).padStart(2,'0')}:00</td><td>{row.planned_qty.toLocaleString()}</td><td>{row.actual_qty.toLocaleString()}</td><td className={row.variance<0?'variance-negative':row.variance>0?'variance-positive':''}>{row.variance>0?'+':''}{row.variance.toLocaleString()}</td></tr>)}</tbody></table></div>}
  </>:<div className='empty'>No active plans are available on this line.</div>}
 </section>}
 <section className='panel activity-panel'><div className='panel-head'><div><span className='eyebrow'>LATEST SCAN EVENTS</span><h3>Recent production activity</h3></div><span className='refresh-caption'>{monitoringEvents.length} recent event(s)</span></div>
  {monitoringEvents.length?<div className='activity-table-wrap'><table className='activity-table'><thead><tr><th>Result</th><th>Serial / Label</th><th>Product / Line</th><th>Date &amp; time</th></tr></thead><tbody>{monitoringEvents.slice(0,20).map(event=>{const plan=plans.find(p=>p.id===event.plan_id);const state=event.scan_status||'invalid';return <tr key={event.id}><td><span className={'event-status event-'+state}>{state==='success'?'✓ Scanned':state==='duplicate'?'⚠ Duplicate':state==='missing'?'? Missing':'! Invalid'}</span></td><td><b>{event.serial_number||'—'}</b></td><td><div className='activity-product'>{plan?.product_name||'Unknown plan'}</div><small>{event.production_line||plan?.production_line||'—'}{plan?.model?' · '+plan.model:''}</small></td><td>{event.scanned_at?new Date(event.scanned_at).toLocaleString('en-IN'):'—'}</td></tr>})}</tbody></table></div>:<div className='empty'>No scan activity recorded yet. Scans will appear here automatically.</div>}
 </section>
 <div className='dashboard-footer'><span><i className='live-dot'/> Live values refresh automatically</span><span>Last updated: {monitoringUpdatedAt?monitoringUpdatedAt.toLocaleString('en-IN'):'Loading…'}</span><button onClick={()=>setView('manage')}>Manage production plans →</button></div>
</main>}
 {view==='planner'&&<main><section className='panel planner-panel'>
 <div className='panel-head'><div><span className='eyebrow'>ADMIN / PLANNER</span><h2>Create daily production plan</h2><p className='planner-subtitle'>Set production targets by hour, then allocate a supplier serial batch. Existing serials and labels are checked before the plan can be created.</p></div><button onClick={()=>setView('dashboard')}>Back</button></div>
 <div className='grid'>
  <label>Production date<input type='date' value={form.production_date} onChange={e=>setForm({...form,production_date:e.target.value})}/></label>
  <label>Brand<input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} placeholder='e.g. LifeLong'/></label>
  <label>Product<input value={form.product_name} onChange={e=>setForm({...form,product_name:e.target.value})} placeholder='e.g. LifeLong OTG'/></label>
  <label>Model<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})} placeholder='e.g. RCAD60'/></label>
  <label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Total planned quantity<input type='number' min='1' value={form.planned_qty} onChange={e=>setForm({...form,planned_qty:e.target.value})}/></label>
 </div>
 <section className='hourly-target-editor'>
  <div className='hourly-editor-head'><div><span className='eyebrow'>HOURLY PRODUCTION TARGET</span><h3>Plan output for every hour</h3><p>Enter the number of units you expect to complete in each hour of the shift. The targets must add up to the total planned quantity.</p></div>
   <div className='shift-time-fields'><label>Shift start<input type='time' step='3600' value={shiftStart} onChange={e=>{const next=e.target.value;setShiftStart(next);setHourlyTargets(previous=>createHourlyTargets(next,shiftEnd,previous));}}/></label><label>Shift end<input type='time' step='3600' value={shiftEnd} onChange={e=>{const next=e.target.value;setShiftEnd(next);setHourlyTargets(previous=>createHourlyTargets(shiftStart,next,previous));}}/></label></div>
  </div>
  {hourlyTargets.length?<div className='hourly-target-grid'>{hourlyTargets.map((row,index)=><label className='hour-target-field' key={row.hour}><span>{row.hour} – {String(Number(row.hour.slice(0,2))+1).padStart(2,'0')}:00</span><small>Planned units</small><input type='number' min='0' step='1' value={row.planned_qty} onChange={e=>{const value=e.target.value;setHourlyTargets(previous=>previous.map(target=>target.hour===row.hour?{...target,planned_qty:value===''?'':Math.max(0,Math.floor(Number(value)||0))}:target));}}/></label>)}</div>:<div className='notice'>Choose a shift start and end time with a whole-hour interval; shift end must be later than shift start.</div>}
  <div className='hourly-target-summary'><div><span>Hourly target total</span><strong>{hourlyTargetTotal.toLocaleString()}</strong></div><div><span>Total planned quantity</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong></div><span className={hourlyTargetTotal===Number(form.planned_qty)&&hourlyTargets.length?'target-match':'target-mismatch'}>{hourlyTargetTotal===Number(form.planned_qty)&&hourlyTargets.length?'✓ Totals match':'Adjust hourly targets to match total planned quantity'}</span></div>
 </section>
 <div className='upload'><h3>Supplier serial-number file</h3><p>Upload the original supplier PDF, CSV, or TXT. Pro Scan extracts label and serial pairs, checks duplicates inside the batch, and compares the complete upload with serials already stored in the database.</p><input type='file' accept='.csv,.txt,.pdf,application/pdf,text/csv,text/plain' disabled={busy} onChange={importFile}/><div className='range'>{rows.length?<><b>{rows.length.toLocaleString()}</b> serial-label pairs loaded{sourceFile?' from '+sourceFile:''}{fileInfo?' · '+fileInfo:''}<p>Plan allocation: <b>{Number(form.planned_qty||0).toLocaleString()}</b> units. The first planned-quantity labels will be allocated.</p></>:<>No serial file loaded. A valid supplier file is required. Demo serials are disabled.</>}</div>
  {importConflicts.length>0&&<div className='database-conflicts'><div><strong>Duplicate batch detected — plan creation blocked</strong><span>{importConflicts.length.toLocaleString()} uploaded pair(s) already exist in this database or serial registry.</span></div><div className='conflict-list'>{importConflicts.slice(0,30).map((conflict,index)=><div key={conflict.serial_number+'-'+conflict.label_number+'-'+index}><b>{conflict.serial_number}</b><span>Label {conflict.label_number}</span><small>{conflict.reasons.join(' · ')}</small></div>)}</div>{importConflicts.length>30&&<small>Showing the first 30 conflicts. {importConflicts.length-30} additional conflict(s) also found.</small>}</div>}
  {rows.length>0&&importConflicts.length===0&&<div className='database-clear'><strong>✓ No duplicates found</strong><span>Both serial numbers and label numbers were checked against the database.</span></div>}
 </div>
 {rows.length>0&&<section className='preview-panel'><div className='panel-head'><div><h3>Serial allocation preview</h3><p className='muted'>First 4 and last 4 pairs from the source file.</p></div><span className='badge'>{rows.length.toLocaleString()} unique pairs</span></div><div className='table-scroll'><table><thead><tr><th>Label number</th><th>Serial number</th><th>Allocation</th></tr></thead><tbody>{(rows.length<=8?rows:[...rows.slice(0,4),...rows.slice(-4)]).map((r,i)=><tr key={r.label_number+'-'+i}><td>{r.label_number}</td><td>{r.serial_number}</td><td>{rows.indexOf(r)<Number(form.planned_qty)?'Included':'Not allocated'}</td></tr>)}</tbody></table></div></section>}
 <div className='actions'><button className='primary' disabled={busy||!rows.length||importConflicts.length>0} onClick={createPlan}>{busy?'Checking / creating…':'Create Production Plan'}</button></div>{message&&<div className='notice'>{message}</div>}
</section></main>}
view==='manage'&&<main className='manage-production-page'>
 <section className='management-hero'><div><span className='eyebrow'>PRODUCTION ADMINISTRATION</span><h2>Manage production</h2><p>Review plans, monitor allocation and update the status of each production plan.</p></div><button className='primary' onClick={()=>setView('planner')}>＋ New production plan</button></section>
 {message&&<div className='notice management-message'>{message}</div>}
 <div className='management-filter-bar'><div><b>{filteredPlans.length}</b><span>plan(s) shown</span></div><label>Filter by status<select value={planStatusFilter} onChange={e=>setPlanStatusFilter(e.target.value)}><option value='all'>All statuses</option><option value='active'>Active</option><option value='draft'>Draft</option><option value='completed'>Completed</option><option value='cancelled'>Cancelled</option></select></label><button onClick={()=>{void load();void refreshMonitoring()}}>↻ Refresh</button></div>
 <section className='panel management-table-panel'>{filteredPlans.length?<div className='management-table-wrap'><table className='management-table'><thead><tr><th>Date</th><th>Product / Model</th><th>Line</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredPlans.map(plan=>{const serials=monitoringSerials.filter(row=>row.plan_id===plan.id);const scanned=serials.filter(row=>row.status==='scanned').length;const target=Number(plan.planned_qty||0);const pct=target?Math.round(scanned/target*100):0;return <tr key={plan.id}><td>{plan.production_date}</td><td><div className='activity-product'>{plan.product_name}</div><small>{plan.brand||'—'} · {plan.model} · {target.toLocaleString()} units</small></td><td>{plan.production_line}</td><td><div className='manage-progress'><div className='progress-track'><div className='progress-fill' style={{width:Math.min(100,pct)+'%'}}/></div><span>{scanned.toLocaleString()} / {target.toLocaleString()} ({pct}%)</span></div></td><td><select className={'plan-status-select status-'+plan.status} disabled={statusUpdatingId===plan.id} value={plan.status} onChange={e=>void updatePlanStatus(plan.id,e.target.value)}><option value='draft'>Draft</option><option value='active'>Active</option><option value='completed'>Completed</option><option value='cancelled'>Cancelled</option></select></td><td><div className='table-actions'><button onClick={()=>setView('live-monitoring')}>Monitor</button><button onClick={()=>{setSelectedPlan(plan);setOperatorFilters({production_line:plan.production_line||'',brand:plan.brand||'',product_name:plan.product_name||''});setView('operator')}}>Operator</button></div></td></tr>})}</tbody></table></div>:<div className='empty'>No production plans match this filter.</div>}</section>
 <div className='management-footnote'><span>Plan status changes apply to operator selection and live monitoring.</span><span>Last refreshed: {monitoringUpdatedAt?monitoringUpdatedAt.toLocaleTimeString('en-IN'):'Loading…'}</span></div>
</main>}
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
  <div className='operator-dashboard-grid'><div className='operator-progress-pane'><div className='operator-metrics'>
   <button className='metric-tile' onClick={()=>setDetailsPanel(detailsPanel==='planned'?'':'planned')}><span>Total planned quantity</span><b>{Number(selectedPlan.planned_qty||0).toLocaleString()}</b><small>View planned serial list</small></button>
   <button className='metric-tile metric-good' onClick={()=>setDetailsPanel(detailsPanel==='scanned'?'':'scanned')}><span>Actual scanned</span><b>{scannedSerials.length.toLocaleString()}</b><small>{selectedPlan.planned_qty?Math.round(scannedSerials.length/Number(selectedPlan.planned_qty)*100):0}% complete · View scanned items</small></button>
   <button className='metric-tile metric-danger' onClick={()=>setDetailsPanel(detailsPanel==='duplicates'?'':'duplicates')}><span>Duplicate serials</span><b>{uniqueDuplicateSerials.length.toLocaleString()}</b><small>{duplicateScans.length.toLocaleString()} duplicate scan events · Click to view</small></button>
   <button className='metric-tile metric-warn' onClick={()=>setDetailsPanel(detailsPanel==='missing'?'':'missing')}><span>Missing / not yet scanned</span><b>{pendingSerials.length.toLocaleString()}</b><small>Remaining planned serials · Click to view</small></button>
  </div>
  {detailsPanel&&<section className='serial-details'><div className='panel-head'><div><span className='eyebrow'>PLAN SERIAL REPORT</span><h3>{detailsPanel==='planned'?'All planned serials':detailsPanel==='scanned'?'Successfully scanned serials':detailsPanel==='duplicates'?'Duplicate serial scan events':'Missing / not yet scanned serials'}</h3></div><button onClick={()=>setDetailsPanel('')}>Close</button></div>
   {detailsPanel==='duplicates'?(duplicateScans.length?<div className='table-scroll'><table><thead><tr><th>Serial number</th><th>Detected date & time</th><th>Operator</th></tr></thead><tbody>{duplicateScans.map((d,i)=><tr key={d.id||i}><td><b>{d.serial_number}</b></td><td>{d.scanned_at?new Date(d.scanned_at).toLocaleString('en-IN'):'—'}</td><td>{d.operator_name||'—'}</td></tr>)}</tbody></table></div>:<div className='empty'>No duplicate scans recorded for this plan.</div>):
   <div className='table-scroll'><table><thead><tr><th>#</th><th>Label number</th><th>Serial number</th><th>Status</th><th>Scanned date & time</th><th>Operator</th></tr></thead><tbody>{(detailsPanel==='planned'?planSerials:detailsPanel==='scanned'?scannedSerials:pendingSerials).map((r,i)=><tr key={r.id}><td>{r.sequence_no||i+1}</td><td>{r.label_number||'—'}</td><td><b>{r.serial_number}</b></td><td><span className={r.status==='scanned'?'badge':'status-pill'}>{r.status}</span></td><td>{r.scanned_at?new Date(r.scanned_at).toLocaleString('en-IN'):'—'}</td><td>{r.scanned_by||'—'}</td></tr>)}</tbody></table></div>}
  </section>}
  </div><div className='operator-scanner-pane'><div className='scanner'>{camera?<video ref={videoRef} autoPlay muted playsInline webkit-playsinline='true'/>:<div className='camera-placeholder'><span className='camera-icon'>▣</span><b>Mobile camera scanner</b><span>Point the camera at the serial-number barcode.</span></div>}</div>
  <div className='scan-actions'>{camera?<button className='primary' onClick={stopCamera}>Stop Camera Scan</button>:<button className='primary scan-start' onClick={startCamera}>Start Camera Scan</button>}<span className='scan-instructions'>Manual serial entry is disabled. Use the device camera to scan labels.</span></div>
  <div className='last-scanned-banner'><div><span>LAST SCANNED SERIAL NUMBER</span><strong>{lastScannedRecord?.serial_number||'No serial scanned yet'}</strong>{lastScannedRecord?.label_number&&<small>Label {lastScannedRecord.label_number}</small>}</div><div className='last-scanned-at'><span>Scanned at</span><b>{lastScannedRecord?.scanned_at?new Date(lastScannedRecord.scanned_at).toLocaleString('en-IN'):'—'}</b></div></div>
  <div className={'status '+(duplicateWarning?'status-danger':'')}>{message||'Ready to scan'}</div>
  <div className='last-scan-time'><span>Last scan attempt</span><b>{lastScanAt?new Date(lastScanAt).toLocaleString('en-IN'):'No scan yet'}</b><span className='live-refresh'>Progress refreshes automatically</span></div>
  </div></div>
 </>}
 {!selectedPlan&&<div className='notice'>{operatorFilters.product_name?'No active production plan matches these filters.':'Select production line, brand and product to display the relevant active production plan.'}</div>}
 </section></main>}
 {duplicateWarning&&<div className='warning-backdrop' role='alertdialog' aria-modal='true' aria-labelledby='duplicate-warning-title'><section className='warning-dialog'><div className='warning-symbol'>!</div><span className='eyebrow'>OPERATOR ATTENTION REQUIRED</span><h2 id='duplicate-warning-title'>Duplicate serial detected</h2><p>This serial has already been scanned for the selected production plan. Do not apply the same label again.</p><div className='warning-serial'><span>Serial number</span><b>{duplicateWarning.serial_number}</b><span>Label number</span><b>{duplicateWarning.label_number}</b></div><p className='warning-time'>Detected: {new Date(duplicateWarning.detected_at).toLocaleString('en-IN')}</p><button className='warning-ack' onClick={()=>setDuplicateWarning(null)}>Acknowledge warning</button></section></div>}
 </div>
}
