import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BrowserCodeReader,BrowserMultiFormatReader} from '@zxing/browser';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {supabase} from './lib/supabase';

pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;

const lines=['Line 1','Line 2','Line 3'];
function createHourlyTargets(start='09:00',end='18:00',previous=[]){
 const toMinutes=value=>{const match=/^(\d{2}):(\d{2})$/.exec(value||'');if(!match)return NaN;const h=Number(match[1]),m=Number(match[2]);return h>=0&&h<24&&m>=0&&m<60?h*60+m:NaN;};
 const startMinutes=toMinutes(start),endMinutes=toMinutes(end);
 if(!Number.isFinite(startMinutes)||!Number.isFinite(endMinutes)||endMinutes<=startMinutes||(endMinutes-startMinutes)%60!==0)return [];
 const targetByHour=new Map((previous||[]).map(row=>[row.hour,Number(row.planned_qty||0)]));
 const output=[];
 for(let minute=startMinutes;minute<endMinutes&&output.length<24;minute+=60){
  const hour=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  output.push({hour,planned_qty:targetByHour.get(hour)||0});
 }
 return output;
}
function formatClock12(value){
 const match=/^(\d{2}):(\d{2})$/.exec(String(value||'').slice(0,5));
 if(!match)return String(value||'');
 const hour=Number(match[1]),minute=Number(match[2]),suffix=hour>=12?'PM':'AM';
 return String(hour%12||12).padStart(2,'0')+':'+String(minute).padStart(2,'0')+' '+suffix;
}
function getHourlySlotLabel(value){
 const parts=String(value||'').slice(0,5).split(':').map(Number);
 if(parts.length!==2||parts.some(part=>!Number.isFinite(part)))return String(value||'');
 const end=((parts[0]*60+parts[1]+60)%(24*60));
 const endValue=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
 return formatClock12(value)+' – '+formatClock12(endValue);
}
function localDateKey(date){
 return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function getPlanShiftWindow(plan){
 const values=(Array.isArray(plan?.hourly_targets)?plan.hourly_targets:[]).map(row=>String(row.hour||'').slice(0,5)).filter(value=>/^\d{2}:\d{2}$/.test(value)).sort();
 if(!values.length)return null;
 const parts=values[values.length-1].split(':').map(Number);
 const first=values[0].split(':').map(Number);
 return {start:first[0]*60+first[1],end:parts[0]*60+parts[1]+60};
}

function minutesToClock(totalMinutes){const minute=((Number(totalMinutes)||0)%(24*60)+24*60)%(24*60);return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');}
function planShiftLabel(plan){const shift=getPlanShiftWindow(plan);return shift?formatClock12(minutesToClock(shift.start))+' – '+formatClock12(minutesToClock(shift.end)):'Shift not set';}
function rebalanceHourlyTargets(targets,total){
 const source=Array.isArray(targets)?targets:[],targetTotal=Math.max(0,Math.floor(Number(total)||0));
 if(!source.length)return [];
 const entered=source.map(row=>Math.max(0,Number(row.planned_qty)||0));let weights=entered,weightTotal=entered.reduce((sum,value)=>sum+value,0);
 if(weightTotal<=0){weights=source.map(()=>1);weightTotal=weights.length;}
 const quotas=weights.map(value=>targetTotal*value/weightTotal),allocated=quotas.map(Math.floor);
 const remainder=targetTotal-allocated.reduce((sum,value)=>sum+value,0);
 const order=quotas.map((value,index)=>({index,fraction:value-Math.floor(value)})).sort((a,b)=>b.fraction-a.fraction);
 for(let i=0;i<remainder;i++)allocated[order[i%order.length].index]+=1;
 return source.map((row,index)=>({...row,planned_qty:allocated[index]}));
}
function getLocalMinutes(date){return date.getHours()*60+date.getMinutes();}
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
export default function App({user}){
 const isOperatorUser = user?.role === 'operator';
 const isSuperAdmin = user?.role === 'super_admin';
 const [view,setView]=useState(user?.role==='operator'?'operator':'dashboard');
 const [roleUsers,setRoleUsers]=useState([]);
 const [usersLoading,setUsersLoading]=useState(false);
 const [usersBusy,setUsersBusy]=useState(false);
 const [usersError,setUsersError]=useState('');
 const [usersNotice,setUsersNotice]=useState('');
 const [newUserEmail,setNewUserEmail]=useState('');
 const [newUserRole,setNewUserRole]=useState('operator');
 const [setupCredential,setSetupCredential]=useState(null); const [plans,setPlans]=useState([]); const [selectedPlan,setSelectedPlan]=useState(null); const [editingPlanId,setEditingPlanId]=useState(''); const [rows,setRows]=useState([]); const [sourceFile,setSourceFile]=useState(''); const [fileInfo,setFileInfo]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
 const [form,setForm]=useState({production_date:new Date().toISOString().slice(0,10),brand:'LifeLong',product_name:'LifeLong OTG',model:'RCAD60',production_line:'Line 2',planned_qty:500});
 const operator='Operator'; const [camera,setCamera]=useState(false); const videoRef=useRef(null); const readerRef=useRef(null); const scanRef=useRef(null); const scanInFlightRef=useRef(false); const cameraLastCodeRef=useRef(''); const lastScanRef=useRef({value:'',at:0}); const [planSerials,setPlanSerials]=useState([]); const [duplicateScans,setDuplicateScans]=useState([]); const [detailsPanel,setDetailsPanel]=useState(''); const [duplicateWarning,setDuplicateWarning]=useState(null); const [now,setNow]=useState(new Date()); const [lastScanAt,setLastScanAt]=useState(null); const [reportFilters,setReportFilters]=useState({type:'summary',group_by:'none',product_name:'all',brand:'all',model:'all',production_line:'all',status:'all',search:'',date_from:'',date_to:'',month:'all'}); const [reportDownloadPlanId,setReportDownloadPlanId]=useState(''); const [reportDownloadMessage,setReportDownloadMessage]=useState(''); const [reportDownloadError,setReportDownloadError]=useState(''); const [dashboardHourlyPlanId,setDashboardHourlyPlanId]=useState(''); const [shiftStart,setShiftStart]=useState('09:00'); const [shiftEnd,setShiftEnd]=useState('18:00'); const [hourlyTargets,setHourlyTargets]=useState(()=>rebalanceHourlyTargets(createHourlyTargets('09:00','18:00'),500)); const [importConflicts,setImportConflicts]=useState([]); const [selectedMonitoringLine,setSelectedMonitoringLine]=useState(''); const [selectedMonitoringPlanId,setSelectedMonitoringPlanId]=useState(''); const [monitoringSerials,setMonitoringSerials]=useState([]); const [monitoringEvents,setMonitoringEvents]=useState([]); const [monitoringUpdatedAt,setMonitoringUpdatedAt]=useState(null); const [monitoringBusy,setMonitoringBusy]=useState(false); const [monitoringError,setMonitoringError]=useState(''); const [duplicateEventCount,setDuplicateEventCount]=useState(0); const [planStatusFilter,setPlanStatusFilter]=useState('all'); const [statusUpdatingId,setStatusUpdatingId]=useState(''); const monitoringRefreshRef=useRef(false);
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

 const checkDatabaseForConflicts=async(parsedRows,excludePlanId='')=>{
 const [allocatedResult,registryResult]=await Promise.all([
  fetchAllRows((from,to)=>supabase.from('plan_serials').select('plan_id,serial_number,label_number').order('id',{ascending:true}).range(from,to)),
  fetchAllRows((from,to)=>supabase.from('serial_numbers').select('serial_number').order('id',{ascending:true}).range(from,to))
 ]);
 if(allocatedResult.error)throw new Error('Could not check existing production serial batches: '+allocatedResult.error.message);
 if(registryResult.error)throw new Error('Could not check the serial registry: '+registryResult.error.message);
 const serialAllocations=new Map(),labelAllocations=new Map(),registeredSerials=new Set(),ownSerials=new Set();
 for(const row of allocatedResult.data||[]){
  if(excludePlanId&&row.plan_id===excludePlanId){if(row.serial_number)ownSerials.add(row.serial_number);continue;}
  if(row.serial_number&&!serialAllocations.has(row.serial_number))serialAllocations.set(row.serial_number,row);
  if(row.label_number&&!labelAllocations.has(row.label_number))labelAllocations.set(row.label_number,row);
 }
 for(const row of registryResult.data||[])if(row.serial_number)registeredSerials.add(row.serial_number);
 const conflicts=[];
 for(const row of parsedRows){
  const reasons=[],existingSerial=serialAllocations.get(row.serial_number),existingLabel=labelAllocations.get(row.label_number);
  if(existingSerial)reasons.push('Serial '+row.serial_number+' is already allocated in a different production plan');
  if(registeredSerials.has(row.serial_number)&&!ownSerials.has(row.serial_number))reasons.push('Serial '+row.serial_number+' already exists in the serial registry');
  if(existingLabel)reasons.push('Label '+row.label_number+' is already allocated in a different production plan');
  if(reasons.length)conflicts.push({label_number:row.label_number,serial_number:row.serial_number,reasons:[...new Set(reasons)],existing_plan_id:existingSerial?.plan_id||existingLabel?.plan_id||''});
 }
 return conflicts;
 };
 const syncPlanStatuses=async(serialRows=monitoringSerials,operatorPlanId=(view==='operator'?selectedPlan?.id:null))=>{
  const currentTime=new Date(),today=localDateKey(currentTime),minutes=getLocalMinutes(currentTime);
  const scannedByPlan=new Map();
  for(const row of serialRows){if(row.status==='scanned')scannedByPlan.set(row.plan_id,(scannedByPlan.get(row.plan_id)||0)+1);}
  const transitions=[];
  for(const plan of plans){
   if(plan.status==='completed'||plan.status==='cancelled')continue;
   const planned=Number(plan.planned_qty||0),scanned=scannedByPlan.get(plan.id)||0,shift=getPlanShiftWindow(plan);
   let next=plan.status;
   if(planned>0&&scanned>=planned)next='completed';
   else if(plan.status==='active'){
    if(plan.production_date<today)next='completed';
    else if(plan.production_date===today&&shift&&minutes>=shift.end)next='completed';
    else if(plan.production_date===today&&shift&&minutes<shift.start&&scanned===0)next='draft';
   }else if(plan.status==='draft'&&plan.id===operatorPlanId){
    if(plan.production_date<today)next='completed';
    else if(plan.production_date===today&&shift&&minutes>=shift.end)next='completed';
    else if(plan.production_date===today&&shift&&minutes>=shift.start&&minutes<shift.end)next='active';
   }
   if(next!==plan.status)transitions.push({plan,previousStatus:plan.status,status:next});
  }
  if(!transitions.length)return plans;
  const updates=await Promise.all(transitions.map(item=>supabase.from('production_plans').update({status:item.status}).eq('id',item.plan.id).eq('status',item.previousStatus).select().maybeSingle()));
  const updated=updates.filter(result=>!result.error&&result.data).map(result=>result.data);
  if(!updated.length)return plans;
  const nextPlans=plans.map(plan=>updated.find(changed=>changed.id===plan.id)||plan);
  setPlans(nextPlans);
  const changedSelected=updated.find(plan=>plan.id===selectedPlan?.id);
  if(changedSelected){setSelectedPlan(changedSelected);if(changedSelected.status==='completed'||changedSelected.status==='cancelled')setCamera(false);}
  return nextPlans;
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
   const freshSerialRows=serialResult.data||[];
   setMonitoringSerials(freshSerialRows);
   setMonitoringEvents(eventResult.data||[]);
   const currentPlans=await syncPlanStatuses(freshSerialRows,view==='operator'?selectedPlan?.id:null);
   const activeIds=currentPlans.filter(p=>p.status==='active').map(p=>p.id);
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
  if(status==='cancelled'&&!window.confirm('Cancel this production plan? It will no longer be available for operator scanning.'))return;
  setStatusUpdatingId(planId);
  const {data,error}=await supabase.from('production_plans').update({status}).eq('id',planId).select().single();
  if(error){setMessage('Could not update production plan: '+error.message);setStatusUpdatingId('');return;}
  setPlans(previous=>previous.map(plan=>plan.id===planId?data:plan));
  if(selectedPlan?.id===planId)setSelectedPlan(data);
  setMessage('Production plan status changed to '+status+'.');
  setStatusUpdatingId('');
  await refreshMonitoring();
 };

 const startNewPlan=()=>{
  setEditingPlanId('');setForm({production_date:localDateKey(new Date()),brand:'LifeLong',product_name:'LifeLong OTG',model:'RCAD60',production_line:'Line 1',planned_qty:500});
  setShiftStart('09:00');setShiftEnd('18:00');setHourlyTargets(rebalanceHourlyTargets(createHourlyTargets('09:00','18:00'),500));
  setRows([]);setSourceFile('');setFileInfo('');setImportConflicts([]);setMessage('');setView('planner');
 };
 const startEditPlan=async plan=>{
  if(!plan||plan.status!=='draft'){setMessage('Only Draft production plans can be edited.');return;}
  setBusy(true);setMessage('Loading draft plan and allocated serials…');
  const result=await fetchAllRows((from,to)=>supabase.from('plan_serials').select('id,plan_id,label_number,serial_number,sequence_no,status,scanned_at').eq('plan_id',plan.id).order('sequence_no',{ascending:true}).range(from,to));
  if(result.error){setBusy(false);setMessage('Could not load draft serial allocation: '+result.error.message);return;}
  const allocated=result.data||[];
  if(allocated.some(row=>row.status==='scanned')){setBusy(false);setMessage('This draft already contains scanned serials and cannot be edited safely.');return;}
  const shift=getPlanShiftWindow(plan),startValue=shift?minutesToClock(shift.start):'09:00',endValue=shift?minutesToClock(shift.end):'18:00';
  const schedule=createHourlyTargets(startValue,endValue,Array.isArray(plan.hourly_targets)?plan.hourly_targets:[]),qty=Number(plan.planned_qty||0);
  setEditingPlanId(plan.id);setForm({production_date:plan.production_date||localDateKey(new Date()),brand:plan.brand||'',product_name:plan.product_name||'',model:plan.model||'',production_line:plan.production_line||lines[0],planned_qty:qty});
  setShiftStart(startValue);setShiftEnd(endValue);setHourlyTargets(rebalanceHourlyTargets(schedule,qty));
  setRows(allocated.map(row=>({label_number:row.label_number,serial_number:row.serial_number})));
  setSourceFile(allocated.length?'Existing Draft Plan Allocation':'');setFileInfo(allocated.length?allocated.length.toLocaleString()+' allocated serials loaded':'No serial allocation found — upload a supplier file');
  setImportConflicts([]);setMessage('');setBusy(false);setView('planner');
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
 useEffect(()=>{
  if(view!=='operator'||!selectedPlan)return;
  void refreshMonitoring();
  const timer=setInterval(()=>{void refreshMonitoring()},8000);
  return()=>clearInterval(timer);
 },[view,selectedPlan?.id,plans.map(plan=>plan.id+':'+plan.status).join('|')]);
 const activePlans=useMemo(()=>plans.filter(p=>p.status==='active'),[plans]);
 const todayKey=localDateKey(now);
 const dashboardPlans=useMemo(()=>plans.filter(p=>(p.status==='active'||p.status==='draft')&&(p.status==='active'||p.production_date>=todayKey)).sort((a,b)=>(b.production_date||'').localeCompare(a.production_date||'')||(a.production_line||'').localeCompare(b.production_line||'')||(getPlanShiftWindow(a)?.start??0)-(getPlanShiftWindow(b)?.start??0)),[plans,todayKey]);
 const operatorEligiblePlans=useMemo(()=>plans.filter(p=>p.status==='active'||p.status==='draft').sort((a,b)=>(b.production_date||'').localeCompare(a.production_date||'')||(a.production_line||'').localeCompare(b.production_line||'')||(getPlanShiftWindow(a)?.start??0)-(getPlanShiftWindow(b)?.start??0)),[plans]);
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

 const reportProductOptions=useMemo(()=>[...new Set(plans.map(plan=>plan.product_name).filter(Boolean))].sort(),[plans]);
 const reportBrandOptions=useMemo(()=>[...new Set(plans.map(plan=>plan.brand).filter(Boolean))].sort(),[plans]);
 const reportModelOptions=useMemo(()=>[...new Set(plans.map(plan=>plan.model).filter(Boolean))].sort(),[plans]);
 const reportLineOptions=useMemo(()=>[...new Set(plans.map(plan=>plan.production_line).filter(Boolean))].sort(),[plans]);
 const reportMonthOptions=useMemo(()=>[...new Set(plans.map(plan=>(plan.production_date||'').slice(0,7)).filter(value=>/^\d{4}-\d{2}$/.test(value)))].sort().reverse(),[plans]);
 const filteredReportPlans=useMemo(()=>plans.filter(plan=>
  (reportFilters.product_name==='all'||plan.product_name===reportFilters.product_name)&&
  (reportFilters.brand==='all'||plan.brand===reportFilters.brand)&&
  (reportFilters.model==='all'||plan.model===reportFilters.model)&&
  (reportFilters.production_line==='all'||plan.production_line===reportFilters.production_line)&&
  (reportFilters.status==='all'||plan.status===reportFilters.status)&&
  (!reportFilters.date_from||plan.production_date>=reportFilters.date_from)&&
  (!reportFilters.date_to||plan.production_date<=reportFilters.date_to)&&
  (reportFilters.month==='all'||(plan.production_date||'').slice(0,7)===reportFilters.month)&&
  (!reportFilters.search||[plan.product_name,plan.brand,plan.model,plan.production_line,plan.id].join(' ').toLowerCase().includes(reportFilters.search.trim().toLowerCase()))
 ),[plans,reportFilters]);
 const dashboardHourlyPlan=useMemo(()=>dashboardPlans.find(plan=>plan.id===dashboardHourlyPlanId)||dashboardPlans[0]||null,[dashboardPlans,dashboardHourlyPlanId]);
 const activeHourlySummary=useMemo(()=>{
  if(!dashboardHourlyPlan)return [];
  const buckets=new Map();
  for(const target of Array.isArray(dashboardHourlyPlan.hourly_targets)?dashboardHourlyPlan.hourly_targets:[]){
   const hour=String(target.hour||'').slice(0,5);if(!/^\d{2}:\d{2}$/.test(hour))continue;
   buckets.set(hour,{hour,planned_qty:Number(target.planned_qty||0),actual_qty:0});
  }
  for(const serial of monitoringSerials){
   if(serial.plan_id!==dashboardHourlyPlan.id||serial.status!=='scanned'||!serial.scanned_at)continue;
   const scannedAt=new Date(serial.scanned_at);
   if(localDateKey(scannedAt)!==dashboardHourlyPlan.production_date)continue;
   const shift=getPlanShiftWindow(dashboardHourlyPlan);
   if(!shift)continue;
   const scannedMinutes=getLocalMinutes(scannedAt);
   if(scannedMinutes<shift.start||scannedMinutes>=shift.end)continue;
   const slotMinutes=shift.start+Math.floor((scannedMinutes-shift.start)/60)*60;
   const hour=String(Math.floor(slotMinutes/60)).padStart(2,'0')+':'+String(slotMinutes%60).padStart(2,'0');
   const row=buckets.get(hour)||{hour,planned_qty:0,actual_qty:0};
   row.actual_qty+=1;buckets.set(hour,row);
  }
  return [...buckets.values()].sort((a,b)=>a.hour.localeCompare(b.hour));
 },[dashboardHourlyPlan,monitoringSerials]);
 const activeHourlyMax=useMemo(()=>Math.max(1,...activeHourlySummary.flatMap(row=>[row.planned_qty,row.actual_qty])),[activeHourlySummary]);
 const downloadFullPlanReport=async plan=>{
  if(!plan||reportDownloadPlanId)return;
  setReportDownloadPlanId(plan.id);setReportDownloadMessage('');setReportDownloadError('');
  try{
   const [serialResult,eventResult]=await Promise.all([
    fetchAllRows((from,to)=>supabase.from('plan_serials').select('id,plan_id,serial_number_id,label_number,serial_number,sequence_no,status,scanned_at,scanned_by,created_at').eq('plan_id',plan.id).order('sequence_no',{ascending:true}).range(from,to)),
    fetchAllRows((from,to)=>supabase.from('scan_events').select('id,plan_id,serial_number_id,serial_number,operator_name,production_line,scan_status,scanned_at').eq('plan_id',plan.id).order('scanned_at',{ascending:true}).order('id',{ascending:true}).range(from,to))
   ]);
   if(serialResult.error)throw new Error('Could not load all allocated serials: '+serialResult.error.message);
   if(eventResult.error)throw new Error('Could not load complete scan event history: '+eventResult.error.message);
   const serials=serialResult.data||[],events=eventResult.data||[];
   const scannedCount=serials.filter(row=>row.status==='scanned').length;
   const pendingCount=serials.filter(row=>row.status==='pending').length;
   const plannedQty=Number(plan.planned_qty||0);
   const completion=plannedQty?Math.round(scannedCount/plannedQty*100):0;
   const formatIST=value=>value?new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Kolkata',hour12:false}):'';
   const exportedAt=formatIST(new Date().toISOString());
   const norm=value=>String(value||'').trim().toUpperCase();
   const eventsBySerial=new Map();
   for(const event of events){
    const key=norm(event.serial_number);
    if(!key)continue;
    if(!eventsBySerial.has(key))eventsBySerial.set(key,[]);
    eventsBySerial.get(key).push(event);
   }
   const serialKeys=new Set();
   const headers=[
    'Record Type','Exported At (IST)','Plan ID','Production Date','Brand','Product','Model','Production Line','Plan Status','Planned Quantity','Allocated Serials','Actual Scanned','Pending Serials','Completion Percent','Plan Created At (IST)','Hourly Targets JSON',
    'Serial Sequence','Label Number','Serial Number','Serial Status','Serial Scanned At (IST)','Scanned By','Serial Record Created At (IST)',
    'Scan Event ID','Scan Event Status','Scan Event Time (IST)','Scan Event Operator','Scan Event Production Line','Serial Number ID'
   ];
   const common={
    'Exported At (IST)':exportedAt,'Plan ID':plan.id,'Production Date':plan.production_date||'',
    'Brand':plan.brand||'','Product':plan.product_name||'','Model':plan.model||'',
    'Production Line':plan.production_line||'','Plan Status':plan.status||'',
    'Planned Quantity':plannedQty,'Allocated Serials':serials.length,'Actual Scanned':scannedCount,
    'Pending Serials':pendingCount,'Completion Percent':completion,
    'Plan Created At (IST)':formatIST(plan.created_at),
    'Hourly Targets JSON':JSON.stringify(Array.isArray(plan.hourly_targets)?plan.hourly_targets:plan.hourly_targets||[])
   };
   const exportRows=[];
   const appendRow=(recordType,serial={},event={})=>{
    exportRows.push(headers.map(header=>{
     const base=common[header];
     if(base!==undefined)return base;
     const values={
      'Record Type':recordType,
      'Serial Sequence':serial.sequence_no??'',
      'Label Number':serial.label_number??'',
      'Serial Number':serial.serial_number??event.serial_number??'',
      'Serial Status':serial.status??(event.scan_status==='missing'?'not allocated in plan':''),
      'Serial Scanned At (IST)':formatIST(serial.scanned_at),
      'Scanned By':serial.scanned_by??'',
      'Serial Record Created At (IST)':formatIST(serial.created_at),
      'Scan Event ID':event.id??'',
      'Scan Event Status':event.scan_status??'',
      'Scan Event Time (IST)':formatIST(event.scanned_at),
      'Scan Event Operator':event.operator_name??'',
      'Scan Event Production Line':event.production_line??'',
      'Serial Number ID':serial.serial_number_id??event.serial_number_id??''
     };
     return values[header]??'';
    }));
   };
   for(const serial of serials){
    const key=norm(serial.serial_number);
    if(key)serialKeys.add(key);
    const matches=eventsBySerial.get(key)||[];
    if(matches.length)for(const event of matches)appendRow('Serial + scan event',serial,event);
    else appendRow('Allocated serial',serial,{});
   }
   for(const event of events){
    const key=norm(event.serial_number);
    if(!key||serialKeys.has(key))continue;
    appendRow('Scan event not linked to allocated serial',{},event);
   }
   if(!exportRows.length)appendRow('Plan summary only',{},{});
   const slug=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
   const filename=['pro-scan-full-plan',slug(plan.production_line),slug(plan.product_name),slug(plan.model),plan.production_date||'undated'].filter(Boolean).join('-')+'.csv';
   downloadCsv(filename,headers,exportRows);
   setReportDownloadMessage('Downloaded '+exportRows.length.toLocaleString()+' detailed row(s) for '+(plan.product_name||'this plan')+'.');
  }catch(error){
   setReportDownloadError(error?.message||'Could not create the full plan report.');
  }finally{
   setReportDownloadPlanId('');
  }
 };
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
   const shift=getPlanShiftWindow(selectedHourlyPlan);
   if(!shift)continue;
   const scannedMinutes=getLocalMinutes(scannedAt);
   if(scannedMinutes<shift.start||scannedMinutes>=shift.end)continue;
   const slotMinutes=shift.start+Math.floor((scannedMinutes-shift.start)/60)*60;
   const hour=String(Math.floor(slotMinutes/60)).padStart(2,'0')+':'+String(slotMinutes%60).padStart(2,'0');
   const bucket=buckets.get(hour)||{hour,planned_qty:0,actual_qty:0};
   bucket.actual_qty+=1;buckets.set(hour,bucket);
  }
  return [...buckets.values()].sort((a,b)=>a.hour.localeCompare(b.hour)).map(row=>({...row,variance:row.actual_qty-row.planned_qty}));
 },[selectedHourlyPlan,monitoringSerials]);
 const hourlyChartMax=useMemo(()=>Math.max(1,...hourlyReportRows.flatMap(row=>[row.planned_qty,row.actual_qty])),[hourlyReportRows]);
 const downloadHourlyReport=()=>{
  if(!selectedHourlyPlan||!hourlyReportRows.length)return;
  const headers=['Product','Brand','Model','Production Date','Production Line','Plan Status','Hourly Slot','Planned Quantity','Actual Scanned','Variance (Actual - Planned)'];
  const data=hourlyReportRows.map(row=>[selectedHourlyPlan.product_name,selectedHourlyPlan.brand||'',selectedHourlyPlan.model,selectedHourlyPlan.production_date,selectedHourlyPlan.production_line,selectedHourlyPlan.status,getHourlySlotLabel(row.hour), row.planned_qty,row.actual_qty,row.variance]);
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
   const conflicts=await checkDatabaseForConflicts(parsed,editingPlanId||'');setImportConflicts(conflicts);
   if(conflicts.length)setMessage('Upload blocked: '+conflicts.length.toLocaleString()+' serial/label pairs already exist in the database.');
   else{
    const currentQty=Number(form.planned_qty||0);
    if(currentQty>parsed.length){
     setForm(previous=>({...previous,planned_qty:parsed.length}));setHourlyTargets(previous=>rebalanceHourlyTargets(previous,parsed.length));
     setMessage('Planned quantity adjusted to '+parsed.length.toLocaleString()+' to match the available serials. Hourly targets were rebalanced; review them before saving.');
    }else setMessage(parsed.length.toLocaleString()+' unique serial-label pairs loaded. No duplicates found in the database.');
   }
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
  if(qty>rows.length)return setMessage('Planned quantity ('+qty.toLocaleString()+') exceeds available serials ('+rows.length.toLocaleString()+'). Upload a serial file with at least '+qty.toLocaleString()+' unique pairs.');
  if(importConflicts.length)return setMessage('Plan creation blocked: '+importConflicts.length.toLocaleString()+' serial/label pairs in this upload already exist in the database.');
  const chosen=rows.slice(0,qty).map(row=>({label_number:row.label_number,serial_number:row.serial_number}));
  try{validatePairs(chosen);}catch(error){return setMessage(error.message);}
  setBusy(true);setMessage('Rechecking uploaded batch against existing production data…');
  try{const conflicts=await checkDatabaseForConflicts(chosen,editingPlanId||'');setImportConflicts(conflicts);if(conflicts.length){setBusy(false);return setMessage('Plan save blocked: '+conflicts.length.toLocaleString()+' serial/label pairs already exist elsewhere in the database.');}}
  catch(error){setBusy(false);return setMessage(error?.message||'Could not validate serial uniqueness. No production plan was saved.');}
  const hourlyPayload=hourlyTargets.map(row=>({hour:row.hour,planned_qty:Number(row.planned_qty||0)}));
  if(editingPlanId){
   const planId=editingPlanId,original=plans.find(plan=>plan.id===planId);
   if(!original||original.status!=='draft'){setBusy(false);return setMessage('Only Draft production plans can be edited. Refresh the plans and try again.');}
   setMessage('Saving draft plan and updating serial allocations…');
   const {data,error}=await supabase.rpc('update_draft_production_plan',{
    p_plan_id:planId,p_production_date:form.production_date,p_brand:form.brand.trim()||'Unspecified',
    p_product_name:form.product_name.trim(),p_model:form.model.trim(),p_production_line:form.production_line,
    p_planned_qty:qty,p_hourly_targets:hourlyPayload,p_serial_pairs:chosen
   });
   if(error){setBusy(false);return setMessage('Could not update draft plan: '+error.message);}
   const savedPlan=Array.isArray(data)?data[0]:data;if(!savedPlan?.id){setBusy(false);return setMessage('The update response was unexpected. Refresh Manage Production to verify the saved plan.');}
   setPlans(previous=>previous.map(plan=>plan.id===planId?savedPlan:plan));setSelectedPlan(previous=>previous?.id===planId?savedPlan:previous);
   setEditingPlanId('');setRows([]);setSourceFile('');setFileInfo('');setBusy(false);setMessage('Draft production plan updated successfully. '+qty.toLocaleString()+' serials are allocated to the revised shift.');
   setView('manage');void load();void refreshMonitoring();return;
  }
  setMessage('Creating plan and allocating '+qty.toLocaleString()+' serials…');
  const {data:plan,error:planError}=await supabase.from('production_plans').insert({...form,brand:form.brand.trim()||'Unspecified',planned_qty:qty,hourly_targets:hourlyPayload,status:'draft'}).select().single();
  if(planError){setBusy(false);return setMessage('Could not create plan: '+planError.message);}
  const payload=chosen.map((row,index)=>({...row,plan_id:plan.id,sequence_no:index+1}));
  const {error:serialError}=await supabase.from('plan_serials').insert(payload);
  if(serialError){setBusy(false);await load();return setMessage('Plan saved as draft, but serial allocation failed: '+serialError.message+'. No active plan was published.');}
  await load();setSelectedPlan(plan);setEditingPlanId('');setBusy(false);setMessage('Production plan created as Draft with '+payload.length.toLocaleString()+' allocated serials. Select the exact plan and shift in Operator during its scheduled hours.');setView('plans');
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
 const startCamera=async()=>{
  if(!selectedPlan){setMessage('Select a production plan first.');return;}
  const current=new Date(),today=localDateKey(current),minutes=getLocalMinutes(current),shift=getPlanShiftWindow(selectedPlan);
  if(selectedPlan.status==='completed'||selectedPlan.status==='cancelled'){setMessage('This plan is '+selectedPlan.status+' and cannot accept new scans.');return;}
  if(selectedPlan.production_date!==today){setMessage('This plan can only be scanned on its production date ('+selectedPlan.production_date+').');return;}
  if(!shift){setMessage('This plan has no hourly shift schedule. Create a plan with shift hours before scanning.');return;}
  if(minutes<shift.start){const startText=String(Math.floor(shift.start/60)).padStart(2,'0')+':'+String(shift.start%60).padStart(2,'0');setMessage('Shift has not started yet. Scanning begins at '+formatClock12(startText)+'.');return;}
  if(minutes>=shift.end){if(selectedPlan.status!=='completed'&&selectedPlan.status!=='cancelled')await updatePlanStatus(selectedPlan.id,'completed');setMessage('The production shift has ended. This plan is marked completed.');setCamera(false);return;}
  if(selectedPlan.status!=='active'){
   const {data,error}=await supabase.from('production_plans').update({status:'active'}).eq('id',selectedPlan.id).in('status',['draft','active']).select().maybeSingle();
   if(error){setMessage('Could not activate production plan: '+error.message);return;}
   const activePlan=data||{...selectedPlan,status:'active'};
   setSelectedPlan(activePlan);setPlans(previous=>previous.map(plan=>plan.id===activePlan.id?activePlan:plan));
  }
  setMessage('Starting camera…');setCamera(true);
 };
 const stopCamera=()=>{try{readerRef.current?.reset()}catch{}setCamera(false)};

 const callAppAuth = async payload => {
  const {data,error}=await supabase.functions.invoke('app-auth',{body:payload});
  if(error)throw new Error(error.message||'Could not contact the authentication service.');
  if(data?.error)throw new Error(data.error);
  return data;
 };
 const loadRoleUsers = async () => {
  if(!isSuperAdmin)return;
  setUsersLoading(true);setUsersError('');
  try {
   const result=await callAppAuth({action:'list-users'});
   setRoleUsers(Array.isArray(result.users)?result.users:[]);
  } catch(error) {setUsersError(error?.message||'Could not load user accounts.');}
  finally {setUsersLoading(false);}
 };
 useEffect(()=>{if(view==='users'&&isSuperAdmin)void loadRoleUsers();},[view,isSuperAdmin]);
 const createRoleUser = async event => {
  event.preventDefault();setUsersBusy(true);setUsersError('');setUsersNotice('');setSetupCredential(null);
  try {
   const result=await callAppAuth({action:'create-user',email:newUserEmail.trim().toLowerCase(),role:newUserRole});
   setSetupCredential({email:result.user.email,code:result.setupCode});
   setUsersNotice('Account created. Share this one-time setup code with the user through a separate secure channel.');
   setNewUserEmail('');setNewUserRole('operator');
   await loadRoleUsers();
  } catch(error) {setUsersError(error?.message||'Could not create the account.');}
  finally {setUsersBusy(false);}
 };
 const changeRoleUser = async (id,role) => {
  setUsersBusy(true);setUsersError('');setUsersNotice('');
  try {
   await callAppAuth({action:'update-user-role',userId:id,role});
   setUsersNotice('User role updated.');
   await loadRoleUsers();
  } catch(error) {setUsersError(error?.message||'Could not update the role.');await loadRoleUsers();}
  finally {setUsersBusy(false);}
 };
 const toggleRoleUserActive = async account => {
  const nextActive=!account.is_active;
  if(!nextActive&&!window.confirm('Deactivate '+account.email+'? They will be signed out and unable to access Pro Scan.'))return;
  setUsersBusy(true);setUsersError('');setUsersNotice('');
  try {
   await callAppAuth({action:'set-user-active',userId:account.id,isActive:nextActive});
   setUsersNotice(nextActive?'Account activated.':'Account deactivated and sessions revoked.');
   await loadRoleUsers();
  } catch(error) {setUsersError(error?.message||'Could not update account status.');await loadRoleUsers();}
  finally {setUsersBusy(false);}
 };
 const resetRoleUserPassword = async account => {
  if(!window.confirm('Generate a new one-time password setup code for '+account.email+'? Their existing sessions will be signed out.'))return;
  setUsersBusy(true);setUsersError('');setUsersNotice('');setSetupCredential(null);
  try {
   const result=await callAppAuth({action:'reset-user-password',userId:account.id});
   setSetupCredential({email:result.user.email,code:result.setupCode});
   setUsersNotice('A new one-time setup code has been generated. Share it through a separate secure channel.');
   await loadRoleUsers();
  } catch(error) {setUsersError(error?.message||'Could not reset the user password.');}
  finally {setUsersBusy(false);}
 };
 const roleLabel = value => ({super_admin:'Super Admin',planner:'Planner',operator:'Operator'}[value]||value);

 return <div className={'app '+(view==='operator'?'app-operator':'')}><header><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div><div className='top-actions'><span className='live'>● LIVE</span>{!isOperatorUser&&<><button className={view==='dashboard'?'nav-button is-active':'nav-button'} onClick={()=>setView('dashboard')}>Dashboard</button><button className={view==='manage'?'nav-button is-active':'nav-button'} onClick={()=>setView('manage')}>Manage Production</button><button className={view==='reports'?'nav-button is-active':'nav-button'} onClick={()=>setView('reports')}>Reports</button>{isSuperAdmin&&<button className={view==='users'?'nav-button is-active':'nav-button'} onClick={()=>setView('users')}>User Roles</button>}</>}<button className={view==='operator'?'nav-button is-active':'nav-button'} onClick={()=>setView('operator')}>Operator</button></div></header>
 {view==='dashboard'&&<main className='dashboard-page'>
 <section className='dashboard-hero'><div><span className='eyebrow'>PRODUCTION OVERVIEW</span><h2>Production at a glance</h2><p>Track today's production, see progress across active lines, and jump directly into live monitoring or production planning.</p></div><div className='dashboard-hero-actions'><button className='secondary-action' onClick={()=>{void load();void refreshMonitoring()}}>↻ Refresh</button><button className='secondary-action' onClick={startNewPlan}>＋ Production Planning</button><button className='primary' onClick={()=>setView('live-monitoring')}>View Live Monitoring ↗</button></div></section>
 {monitoringError&&<div className='notice dashboard-error'>{monitoringError}</div>}
 <div className='dashboard-kpis'>
  <div className='dashboard-kpi'><span className='kpi-label'>Active production plans <small>(count)</small></span><div className='kpi-value'>{activePlans.length.toLocaleString()}<span className='kpi-icon kpi-blue'>▦</span></div><small>Plans currently in production</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Planned quantity <small>(all active plans)</small></span><div className='kpi-value'>{activePlannedQty.toLocaleString()}<span className='kpi-icon kpi-violet'>◎</span></div><small>Units allocated to active plans</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Actual scanned <small>(all active plans)</small></span><div className='kpi-value'>{activeScannedQty.toLocaleString()}<span className='kpi-icon kpi-green'>✓</span></div><small>{activePlannedQty?Math.round(activeScannedQty/activePlannedQty*100):0}% of planned units complete</small></div>
  <div className='dashboard-kpi'><span className='kpi-label'>Pending units <small>(all active plans)</small></span><div className='kpi-value'>{activePendingQty.toLocaleString()}<span className='kpi-icon kpi-amber'>◷</span></div><small><span className='inline-alert'>{duplicateEventCount.toLocaleString()} duplicate scan events</span></small></div>
 </div>
 <section className='panel dashboard-section dashboard-active-plans-wide'>
 <div className='panel-head'><div><span className='eyebrow'>PLAN-WISE PROGRESS</span><h3>Today's & upcoming production plans</h3><p>See each shift independently, including later shifts that are still in Draft.</p></div><button onClick={()=>setView('manage')}>Manage all plans →</button></div>
 {dashboardPlans.length?<div className='dashboard-plan-list'>{dashboardPlans.map(plan=>{
  const planRows=monitoringSerials.filter(row=>row.plan_id===plan.id),scanned=planRows.filter(row=>row.status==='scanned').length;
  const planned=Number(plan.planned_qty||0),pending=Math.max(0,planned-scanned),pct=planned?Math.min(100,Math.round(scanned/planned*100)):0;
  return <div className='dashboard-plan-row' key={plan.id}><div className='plan-avatar'>{(plan.production_line||'P').replace(/[^0-9A-Za-z]/g,'').slice(-2)||'P'}</div>
   <div className='dashboard-plan-main'><div className='dashboard-plan-title'><b>{plan.product_name}</b><span className={plan.status==='active'?'badge':'plan-status-badge status-draft'}>{plan.status==='active'?'ACTIVE':'DRAFT'}</span></div>
    <span className='dashboard-plan-meta'>{plan.brand||'—'} · {plan.model} · {plan.production_line} · {plan.production_date} · Plan #{plan.id.slice(0,8)}</span>
    <span className='dashboard-plan-shift'>Shift {planShiftLabel(plan)} · Target {planned.toLocaleString()} units</span>
    <div className='mini-progress'><div style={{width:pct+'%'}}/></div>
    <div className='plan-wise-quantities'><span>Planned <b>{planned.toLocaleString()}</b></span><span>Scanned <b>{scanned.toLocaleString()}</b></span><span>Pending <b>{pending.toLocaleString()}</b></span><strong>{pct}%</strong></div>
   </div></div>;
 })}</div>:<div className='empty'>No active or upcoming production plans. Create a plan to see its shift, target and progress here.</div>}
</section>
<section className='panel dashboard-hourly-panel'><div className='panel-head'><div><span className='eyebrow'>PLAN-WISE HOURLY OUTPUT</span><h3>Hourly planned vs actual</h3><p>The graph shows one production plan at a time, so each hourly target is compared only with scans belonging to that plan.</p></div><button onClick={()=>setView('live-monitoring')}>Open Live Monitoring →</button></div><div className='dashboard-hourly-plan-select'><label>Select production plan<select value={dashboardHourlyPlan?.id||''} onChange={e=>setDashboardHourlyPlanId(e.target.value)}>{dashboardPlans.map(plan=><option value={plan.id} key={plan.id}>{plan.production_date} · {plan.production_line} · {planShiftLabel(plan)} · {plan.brand||'—'} · {plan.product_name} · {plan.model} · {Number(plan.planned_qty||0).toLocaleString()} units · {plan.status}</option>)}</select></label>{dashboardHourlyPlan&&<div><b>{dashboardHourlyPlan.product_name}</b><span>{dashboardHourlyPlan.brand||'—'} · {dashboardHourlyPlan.model} · {dashboardHourlyPlan.production_line} · {dashboardHourlyPlan.production_date}</span><small>Plan target: {Number(dashboardHourlyPlan.planned_qty||0).toLocaleString()} units</small></div>}</div>
  <div className='dashboard-hourly-legend'><span><i className='legend-planned'/> Planned</span><span><i className='legend-actual'/> Actual scanned</span><small>{monitoringUpdatedAt?'Updated '+monitoringUpdatedAt.toLocaleTimeString('en-IN'):'Loading production data…'}</small></div>
  {activeHourlySummary.length?<div className='active-hourly-chart-scroll'><div className='active-hourly-chart' style={{minWidth:Math.max(620,activeHourlySummary.length*58)+'px'}}>{activeHourlySummary.map(row=><div className='active-hourly-column' key={row.hour} title={row.hour+' · target '+row.planned_qty+' · actual '+row.actual_qty}><div className='active-hourly-values'><span>{row.planned_qty||'·'}</span><span>{row.actual_qty||'·'}</span></div><div className='active-hourly-bars'><div className='hourly-bar planned-hour-bar' style={{height:(row.planned_qty?Math.max(3,row.planned_qty/activeHourlyMax*100):0)+'%'}}/><div className='hourly-bar actual-hour-bar' style={{height:(row.actual_qty?Math.max(3,row.actual_qty/activeHourlyMax*100):0)+'%'}}/></div><b>{formatClock12(row.hour)}</b></div>)}</div></div>:<div className='empty'>No hourly output yet. Hourly targets will appear here once active plans include hourly targets; actual scans are added by scan time.</div>}
 </section>
 <div className='dashboard-footer'><span><i className='live-dot'/> Monitoring refreshes automatically</span><span>Last updated: {monitoringUpdatedAt?monitoringUpdatedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Loading…'}</span><button onClick={()=>setView('operator')}>Open Operator Scanner →</button></div>
</main>}
{view==='live-monitoring'&&<main className='live-monitoring-page'>
 <section className='monitoring-hero'><div><span className='eyebrow'>SHOP FLOOR / LIVE VIEW</span><h2>Live production monitoring</h2><p>Current output and line-wise progress for active production plans.</p></div><div className='monitoring-live-status'><i className='live-dot'/> LIVE <span>{monitoringUpdatedAt?monitoringUpdatedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Connecting…'}</span><button onClick={()=>{void refreshMonitoring();void load()}}>↻ Refresh</button></div></section>
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
 {selectedMonitoringLine&&<div className='hourly-modal-backdrop' role='presentation' onClick={()=>{setSelectedMonitoringLine('');setSelectedMonitoringPlanId('')}}><section className='panel hourly-detail-panel' id='hourly-production-detail' role='dialog' aria-modal='true' aria-label='Hourly production detail' onClick={e=>e.stopPropagation()}>
  <div className='panel-head'><div><span className='eyebrow'>HOURLY OUTPUT ANALYSIS</span><h3>{selectedMonitoringLine} · Planned vs actual production</h3><p className='hourly-panel-subtitle'>Select a plan to compare its hourly target with serials successfully scanned on the plan date.</p></div><button onClick={()=>{setSelectedMonitoringLine('');setSelectedMonitoringPlanId('')}}>Close chart</button></div>
  {selectedLinePlans.length?<><div className='hourly-report-controls'>
   <label>Production plan<select value={selectedHourlyPlan?.id||''} onChange={e=>setSelectedMonitoringPlanId(e.target.value)}>{selectedLinePlans.map(plan=><option value={plan.id} key={plan.id}>{plan.production_date} · {plan.brand||'—'} · {plan.product_name} · {plan.model}</option>)}</select></label>
   {selectedHourlyPlan&&<div className='hourly-plan-summary'><strong>{selectedHourlyPlan.product_name}</strong><span>{selectedHourlyPlan.brand||'—'} · {selectedHourlyPlan.model} · {selectedHourlyPlan.production_date}</span><small>{Number(selectedHourlyPlan.planned_qty||0).toLocaleString()} planned units · {selectedHourlyPlan.status}</small></div>}
  </div>
  {selectedHourlyPlan&&(!Array.isArray(selectedHourlyPlan.hourly_targets)||selectedHourlyPlan.hourly_targets.length===0)&&<div className='notice hourly-target-warning'>This plan was created before hourly targets were enabled, so its planned hourly values are not available. New plans will store the targets entered in Production Planning. Actual scans, if any, are still shown below.</div>}
  <div className='hourly-chart-legend'><span><i className='legend-planned'/> Planned per hour</span><span><i className='legend-actual'/> Actual scanned</span><span className='hourly-date-note'>Production date: {selectedHourlyPlan?.production_date||'—'}</span></div>
  {hourlyReportRows.length?<div className='hourly-chart-scroll'><div className='hourly-chart' style={{minWidth:Math.max(520,hourlyReportRows.length*66)+'px'}}>{hourlyReportRows.map(row=><div className='hourly-chart-column' key={row.hour} title={row.hour+' — planned '+row.planned_qty+', actual '+row.actual_qty}>
   <div className='hourly-bar-values'><span>{row.planned_qty?row.planned_qty.toLocaleString():'·'}</span><span>{row.actual_qty?row.actual_qty.toLocaleString():'·'}</span></div>
   <div className='hourly-bars'><div className='hourly-bar planned-hour-bar' style={{height:(row.planned_qty?Math.max(3,row.planned_qty/hourlyChartMax*100):0)+'%'}}/><div className='hourly-bar actual-hour-bar' style={{height:(row.actual_qty?Math.max(3,row.actual_qty/hourlyChartMax*100):0)+'%'}}/></div>
   <b className='hourly-hour-label'>{formatClock12(row.hour)}</b><small className={row.variance<0?'variance-negative':row.variance>0?'variance-positive':''}>{row.variance>0?'+':''}{row.variance.toLocaleString()}</small>
  </div>)}</div></div>:<div className='empty'>No hourly target or scanned-serial data exists for this plan date yet.</div>}
  {hourlyReportRows.length>0&&<div className='hourly-table-wrap'><table className='hourly-report-table'><thead><tr><th>Hour</th><th>Planned quantity</th><th>Actual scanned</th><th>Variance</th></tr></thead><tbody>{hourlyReportRows.map(row=><tr key={row.hour}><td>{getHourlySlotLabel(row.hour)}</td><td>{row.planned_qty.toLocaleString()}</td><td>{row.actual_qty.toLocaleString()}</td><td className={row.variance<0?'variance-negative':row.variance>0?'variance-positive':''}>{row.variance>0?'+':''}{row.variance.toLocaleString()}</td></tr>)}</tbody></table></div>}
  </>:<div className='empty'>No active plans are available on this line.</div>}
 </section></div>}
 <div className='dashboard-footer'><span><i className='live-dot'/> Live values refresh automatically</span><span>Last updated: {monitoringUpdatedAt?monitoringUpdatedAt.toLocaleString('en-IN'):'Loading…'}</span><button onClick={()=>setView('manage')}>Manage production plans →</button></div>
</main>}
 {view==='planner'&&<main><section className='panel planner-panel'>
 <div className='panel-head'><div><span className='eyebrow'>{editingPlanId?'EDIT DRAFT PLAN':'PRODUCTION PLANNING'}</span><h2>{editingPlanId?'Edit draft production plan':'Create daily production plan'}</h2><p className='planner-subtitle'>Set the production shift and hourly targets, then allocate a matching supplier serial batch. Only Draft plans can be edited.</p></div><button onClick={()=>{setEditingPlanId('');setView(editingPlanId?'manage':'dashboard');setMessage('');}}>Back</button></div>
 <div className='grid'>
  <label>Production date<input type='date' value={form.production_date} onChange={e=>setForm({...form,production_date:e.target.value})}/></label>
  <label>Brand<input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} placeholder='e.g. LifeLong'/></label>
  <label>Product<input value={form.product_name} onChange={e=>setForm({...form,product_name:e.target.value})} placeholder='e.g. LifeLong OTG'/></label>
  <label>Model<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})} placeholder='e.g. RCAD60'/></label>
  <label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Total planned quantity<input type='number' min='1' value={form.planned_qty} onChange={e=>{const value=e.target.value;setForm({...form,planned_qty:value});if(value!=='')setHourlyTargets(previous=>rebalanceHourlyTargets(previous,Number(value)));}}/></label>
 </div>
 <section className='hourly-target-editor'>
  <div className='hourly-editor-head'><div><span className='eyebrow'>HOURLY PRODUCTION TARGET</span><h3>Plan output for every hour</h3><p>Enter the number of units you expect to complete in each hour of the shift. The targets must add up to the total planned quantity.</p></div>
   <div className='shift-time-fields'><label>Shift start<input type='time' value={shiftStart} onChange={e=>{const next=e.target.value;setShiftStart(next);setHourlyTargets(previous=>rebalanceHourlyTargets(createHourlyTargets(next,shiftEnd,previous),Number(form.planned_qty||0)));}}/></label><label>Shift end<input type='time' value={shiftEnd} onChange={e=>{const next=e.target.value;setShiftEnd(next);setHourlyTargets(previous=>rebalanceHourlyTargets(createHourlyTargets(shiftStart,next,previous),Number(form.planned_qty||0)));}}/></label></div>
  </div>
  {hourlyTargets.length?<div className='hourly-target-grid'>{hourlyTargets.map((row,index)=><label className='hour-target-field' key={row.hour}><span>{getHourlySlotLabel(row.hour)}</span><small>Planned units</small><input type='number' min='0' step='1' value={row.planned_qty} onChange={e=>{const value=e.target.value;setHourlyTargets(previous=>previous.map(target=>target.hour===row.hour?{...target,planned_qty:value===''?'':Math.max(0,Math.floor(Number(value)||0))}:target));}}/></label>)}</div>:<div className='notice'>Choose a start and end time with complete 60-minute slots. For example, 09:30 AM to 05:30 PM.</div>}
  <div className='hourly-target-summary'><div><span>Hourly target total</span><strong>{hourlyTargetTotal.toLocaleString()}</strong></div><div><span>Total planned quantity</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong></div><span className={hourlyTargetTotal===Number(form.planned_qty)&&hourlyTargets.length?'target-match':'target-mismatch'}>{hourlyTargetTotal===Number(form.planned_qty)&&hourlyTargets.length?'✓ Totals match':'Adjust hourly targets to match total planned quantity'}</span></div>
 </section>
 <div className='upload'><h3>Supplier serial-number file</h3><p>Upload the original supplier PDF, CSV, or TXT. Pro Scan extracts label and serial pairs, checks duplicates inside the batch, and compares the complete upload with serials already stored in the database.</p><input type='file' accept='.csv,.txt,.pdf,application/pdf,text/csv,text/plain' disabled={busy} onChange={importFile}/><div className='range'>{rows.length?<><b>{rows.length.toLocaleString()}</b> serial-label pairs loaded{sourceFile?' from '+sourceFile:''}{fileInfo?' · '+fileInfo:''}<p>Plan allocation: <b>{Number(form.planned_qty||0).toLocaleString()}</b> units. The first planned-quantity labels will be allocated.</p></>:<>No serial file loaded. A valid supplier file is required. Demo serials are disabled.</>}</div>
  {importConflicts.length>0&&<div className='database-conflicts'><div><strong>Duplicate batch detected — plan creation blocked</strong><span>{importConflicts.length.toLocaleString()} uploaded pair(s) already exist in this database or serial registry.</span></div><div className='conflict-list'>{importConflicts.slice(0,30).map((conflict,index)=><div key={conflict.serial_number+'-'+conflict.label_number+'-'+index}><b>{conflict.serial_number}</b><span>Label {conflict.label_number}</span><small>{conflict.reasons.join(' · ')}</small></div>)}</div>{importConflicts.length>30&&<small>Showing the first 30 conflicts. {importConflicts.length-30} additional conflict(s) also found.</small>}</div>}
  {rows.length>0&&importConflicts.length===0&&<div className='database-clear'><strong>✓ No duplicates found</strong><span>Both serial numbers and label numbers were checked against the database.</span></div>}
 </div>
 {rows.length>0&&<section className='preview-panel'><div className='panel-head'><div><h3>Serial allocation preview</h3><p className='muted'>First 4 and last 4 pairs from the source file.</p></div><span className='badge'>{rows.length.toLocaleString()} unique pairs</span></div><div className='table-scroll'><table><thead><tr><th>Label number</th><th>Serial number</th><th>Allocation</th></tr></thead><tbody>{(rows.length<=8?rows:[...rows.slice(0,4),...rows.slice(-4)]).map((r,i)=><tr key={r.label_number+'-'+i}><td>{r.label_number}</td><td>{r.serial_number}</td><td>{rows.indexOf(r)<Number(form.planned_qty)?'Included':'Not allocated'}</td></tr>)}</tbody></table></div></section>}
 <div className='actions'><button className='primary' disabled={busy||!rows.length||importConflicts.length>0} onClick={createPlan}>{busy?(editingPlanId?'Saving draft…':'Checking / creating…'):(editingPlanId?'Save Draft Changes':'Create Production Plan')}</button></div>{message&&<div className='notice'>{message}</div>}
</section></main>}
{view==='manage'&&<main className='manage-production-page'>
 <section className='management-title-bar'><div><span className='eyebrow'>PRODUCTION PLANS</span><h2>Manage production</h2><p>Review progress and plan status. Completed quantity updates status automatically.</p></div><button className='primary' onClick={startNewPlan}>＋ New production plan</button></section>
 {message&&<div className='notice management-message'>{message}</div>}
 <div className='management-filter-bar'><div><b>{filteredPlans.length}</b><span>plan(s) shown</span></div><label>Filter by status<select value={planStatusFilter} onChange={e=>setPlanStatusFilter(e.target.value)}><option value='all'>All statuses</option><option value='active'>Active</option><option value='draft'>Draft</option><option value='completed'>Completed</option><option value='cancelled'>Cancelled</option></select></label><button onClick={()=>{void load();void refreshMonitoring()}}>↻ Refresh</button></div>
 <section className='panel management-table-panel'>{filteredPlans.length?<div className='management-table-wrap'><table className='management-table'><thead><tr><th>Date</th><th>Product / Model</th><th>Line</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredPlans.map(plan=>{const serials=monitoringSerials.filter(row=>row.plan_id===plan.id);const scanned=serials.filter(row=>row.status==='scanned').length;const target=Number(plan.planned_qty||0);const pct=target?Math.round(scanned/target*100):0;return <tr key={plan.id}><td>{plan.production_date}</td><td><div className='activity-product'>{plan.product_name}</div><small>{plan.brand||'—'} · {plan.model} · {target.toLocaleString()} units</small></td><td>{plan.production_line}</td><td><div className='manage-progress'><div className='progress-track'><div className='progress-fill' style={{width:Math.min(100,pct)+'%'}}/></div><span>{scanned.toLocaleString()} / {target.toLocaleString()} ({pct}%)</span></div></td><td><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></td><td><div className='table-actions'><button onClick={()=>setView('live-monitoring')}>Monitor</button>{plan.status==='draft'&&<button disabled={busy} onClick={()=>void startEditPlan(plan)}>Edit draft</button>}{plan.status==='draft'&&<button onClick={()=>{setSelectedPlan(plan);setView('operator')}}>Operator</button>}{plan.status==='active'&&<button onClick={()=>{setSelectedPlan(plan);setView('operator')}}>Operator</button>}{(plan.status==='draft'||plan.status==='active')&&<button disabled={statusUpdatingId===plan.id} onClick={()=>void updatePlanStatus(plan.id,'cancelled')}>Cancel</button>}</div></td></tr>})}</tbody></table></div>:<div className='empty'>No production plans match this filter.</div>}</section>
 <div className='management-footnote'><span>Plan status changes apply to operator selection and live monitoring.</span><span>Last refreshed: {monitoringUpdatedAt?monitoringUpdatedAt.toLocaleTimeString('en-IN'):'Loading…'}</span></div>
</main>}
 {view==='reports'&&<main className='reports-page'>
 <section className='reports-title-bar'><div><span className='eyebrow'>PRODUCTION ANALYTICS</span><h2>Production reports</h2><p>Filter production plans and download the complete serial and scan-event history for any matching plan.</p></div><button className='report-reset-button' onClick={()=>{setReportFilters({type:'summary',group_by:'none',product_name:'all',brand:'all',model:'all',production_line:'all',status:'all',search:'',date_from:'',date_to:'',month:'all'});setReportDownloadMessage('');setReportDownloadError('');}}>Reset filters</button></section>
 <section className='report-filter-panel'>
  <div className='report-filter-heading'><div><span className='eyebrow'>FIND PRODUCTION PLANS</span><h3>Filters</h3></div><span className='report-matching-count'><strong>{filteredReportPlans.length.toLocaleString()}</strong> matching plan{filteredReportPlans.length===1?'':'s'}</span></div>
  <div className='report-search-row'><label className='report-search-field'>Search product, model, line or plan ID<input type='search' value={reportFilters.search||''} onChange={e=>setReportFilters({...reportFilters,search:e.target.value})} placeholder='Search by product, model, line, or plan ID'/></label></div>
  <div className='report-filter-grid'>
   <label>Product<select value={reportFilters.product_name} onChange={e=>setReportFilters({...reportFilters,product_name:e.target.value})}><option value='all'>All products</option>{reportProductOptions.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   <label>Brand<select value={reportFilters.brand} onChange={e=>setReportFilters({...reportFilters,brand:e.target.value})}><option value='all'>All brands</option>{reportBrandOptions.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   <label>Model<select value={reportFilters.model} onChange={e=>setReportFilters({...reportFilters,model:e.target.value})}><option value='all'>All models</option>{reportModelOptions.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   <label>Production line<select value={reportFilters.production_line} onChange={e=>setReportFilters({...reportFilters,production_line:e.target.value})}><option value='all'>All lines</option>{reportLineOptions.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   <label>Plan status<select value={reportFilters.status||'all'} onChange={e=>setReportFilters({...reportFilters,status:e.target.value})}><option value='all'>All statuses</option><option value='draft'>Draft</option><option value='active'>Active</option><option value='completed'>Completed</option><option value='cancelled'>Cancelled</option></select></label>
   <label>Month<select value={reportFilters.month} onChange={e=>setReportFilters({...reportFilters,month:e.target.value})}><option value='all'>All months</option>{reportMonthOptions.map(value=><option value={value} key={value}>{new Date(value+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</option>)}</select></label>
   <label>From date<input type='date' value={reportFilters.date_from} onChange={e=>setReportFilters({...reportFilters,date_from:e.target.value})}/></label>
   <label>To date<input type='date' value={reportFilters.date_to} onChange={e=>setReportFilters({...reportFilters,date_to:e.target.value})}/></label>
  </div>
  {(reportDownloadMessage||reportDownloadError)&&<div className={reportDownloadError?'report-download-notice report-download-error':'report-download-notice'}>{reportDownloadError||reportDownloadMessage}</div>}
 </section>
 <section className='report-results-panel'>
  <div className='report-results-heading'><div><span className='eyebrow'>MATCHING RESULTS</span><h3>Production plans</h3><p>Each download contains every serial allocated to that plan and its scan attempts, including timestamps and operator details.</p></div><span className='report-results-total'>{filteredReportPlans.length.toLocaleString()} result{filteredReportPlans.length===1?'':'s'}</span></div>
  {filteredReportPlans.length?<div className='report-results-table-wrap'><table className='report-results-table'><thead><tr><th>Production date</th><th>Product / model</th><th>Line</th><th>Progress</th><th>Status</th><th>Full report</th></tr></thead><tbody>{filteredReportPlans.map(plan=>{
   const planSerials=monitoringSerials.filter(row=>row.plan_id===plan.id);
   const scanned=planSerials.filter(row=>row.status==='scanned').length;
   const planned=Number(plan.planned_qty||0);
   const pending=planSerials.filter(row=>row.status==='pending').length;
   const percent=planned?Math.round(scanned/planned*100):0;
   return <tr key={plan.id}>
    <td><strong>{plan.production_date||'—'}</strong><small>{new Date((plan.production_date||'2000-01-01')+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</small></td>
    <td><div className='report-product-name'>{plan.product_name||'—'}</div><small>{plan.brand||'Unspecified'} · {plan.model||'No model'}</small><small className='report-plan-id'>Plan ID: {plan.id}</small></td>
    <td><span className='report-line-pill'>{plan.production_line||'Unassigned'}</span></td>
    <td><div className='report-progress-cell'><div className='report-progress-track'><span style={{width:Math.min(100,percent)+'%'}}/></div><div><strong>{scanned.toLocaleString()}</strong> scanned <span>· {pending.toLocaleString()} pending</span></div><small>{percent}% of {planned.toLocaleString()} planned</small></div></td>
    <td><span className={'plan-status-badge status-'+(plan.status||'draft')}>{plan.status||'draft'}</span></td>
    <td><button className='report-download-button' disabled={!!reportDownloadPlanId} onClick={()=>void downloadFullPlanReport(plan)}>{reportDownloadPlanId===plan.id?'Preparing report…':<><span aria-hidden='true'>↓</span> Download full report</>}</button></td>
   </tr>;
  })}</tbody></table></div>:<div className='report-empty-state'><span className='report-empty-icon'>⌕</span><strong>No production plans match these filters</strong><span>Change or reset one or more filters to see matching plans.</span></div>}
 </section>
</main>}
 {view==='plans'&&<main><section className='panel'><div className='panel-head'><h2>Plan created</h2><button onClick={()=>setView('dashboard')}>Dashboard</button></div><div className='success'>Production plan is saved as Draft. Open Operator and select this plan during its scheduled shift. It becomes Active only during the shift window.</div></section></main>}
 {view==='users'&&isSuperAdmin&&<main className='user-admin-page'>
  <section className='user-admin-heading'><div><span className='eyebrow'>ACCESS CONTROL</span><h2>User role configuration</h2><p>Create company accounts, assign roles, and issue one-time password setup codes.</p></div><button className='user-admin-secondary' onClick={()=>void loadRoleUsers()} disabled={usersLoading||usersBusy}>↻ Refresh users</button></section>
  {usersError&&<div className='auth-error user-admin-message' role='alert'>{usersError}</div>}
  {usersNotice&&<div className='auth-notice user-admin-message' role='status'>{usersNotice}</div>}
  <section className='user-admin-card user-create-card'><div className='user-admin-card-heading'><div><span className='eyebrow'>NEW ACCOUNT</span><h3>Create user access</h3><p>Users create their own password using a one-time setup code.</p></div></div>
   <form className='user-create-form' onSubmit={createRoleUser}>
    <label>Company email<input type='email' value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} placeholder='employee@gsons.co.in' required /></label>
    <label>Role<select value={newUserRole} onChange={e=>setNewUserRole(e.target.value)}><option value='planner'>Planner — production management and all reports</option><option value='operator'>Operator — operator scanner only</option><option value='super_admin'>Super Admin — full access and role configuration</option></select></label>
    <button type='submit' className='primary' disabled={usersBusy}>{usersBusy?'Saving…':'＋ Create account'}</button>
   </form>
  </section>
  {setupCredential&&<section className='user-setup-code-card'><div><span className='eyebrow'>ONE-TIME SETUP CODE</span><h3>{setupCredential.email}</h3><p>Send this code to the user privately. It can be used once to create a password.</p></div><div className='user-setup-code-row'><code>{setupCredential.code}</code><button className='user-admin-secondary' onClick={async()=>{try{await navigator.clipboard.writeText(setupCredential.code);setUsersNotice('Setup code copied. Share it privately.');}catch{setUsersError('Could not copy automatically. Select and copy the code.');}}}>Copy code</button></div></section>}
  <section className='user-admin-card user-directory-card'><div className='user-admin-card-heading'><div><span className='eyebrow'>ACCOUNT DIRECTORY</span><h3>Company users</h3><p>Role changes take effect the next time an account is checked. Deactivation revokes active sessions.</p></div><span className='user-count'>{roleUsers.length} account{roleUsers.length===1?'':'s'}</span></div>
   {usersLoading?<div className='empty'>Loading user accounts…</div>:roleUsers.length?<div className='user-admin-table-wrap'><table className='user-admin-table'><thead><tr><th>Account</th><th>Role</th><th>Password</th><th>Status</th><th>Actions</th></tr></thead><tbody>{roleUsers.map(account=>{const isSelf=String(account.email||'').toLowerCase()===String(user?.email||'').toLowerCase();return <tr key={account.id}><td><strong>{account.email}</strong>{isSelf&&<span className='user-self-tag'>You</span>}</td><td><select value={account.role} disabled={usersBusy||isSelf} onChange={e=>void changeRoleUser(account.id,e.target.value)} aria-label={'Role for '+account.email}><option value='super_admin'>Super Admin</option><option value='planner'>Planner</option><option value='operator'>Operator</option></select></td><td><span className={account.password_configured?'user-password-set':'user-password-pending'}>{account.password_configured?'Password set':'Setup pending'}</span></td><td><span className={account.is_active?'user-state-active':'user-state-inactive'}>{account.is_active?'Active':'Inactive'}</span></td><td><div className='user-admin-row-actions'><button disabled={usersBusy||isSelf} onClick={()=>void resetRoleUserPassword(account)}>Reset password</button><button className={account.is_active?'user-deactivate':''} disabled={usersBusy||isSelf} onClick={()=>void toggleRoleUserActive(account)}>{account.is_active?'Deactivate':'Activate'}</button></div></td></tr>;})}</tbody></table></div>:<div className='empty'>No user accounts found.</div>}
  </section>
 </main>}
 {view==='operator'&&<main><section className='operator-card'>
 <div className='operator-clock'><div><span className='eyebrow'>CURRENT DATE & TIME</span><strong>{now.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</strong></div><b>{now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}</b></div>
 <div className='operator-top'><div><span className='eyebrow'>OPERATOR SCAN</span><h2>{selectedPlan?.product_name||'Select a production plan and shift'}</h2><p>{selectedPlan?(selectedPlan.brand||'—')+' · '+selectedPlan.model+' · '+selectedPlan.production_line:'Choose the exact production plan and shift you are working on.'}</p></div></div>
 <div className='operator-plan-picker'>
  <label>Production plan<select value={selectedPlan?.id||''} onChange={e=>{const plan=operatorEligiblePlans.find(item=>item.id===e.target.value)||null;setSelectedPlan(plan);setDetailsPanel('');setDuplicateWarning(null);setMessage('');if(plan)void refreshPlanMetrics(plan);}}>
   <option value=''>Choose a specific production plan</option>
   {operatorEligiblePlans.map(plan=><option key={plan.id} value={plan.id}>{plan.production_date} · {plan.production_line} · {planShiftLabel(plan)} · {plan.brand||'—'} · {plan.product_name} · {plan.model} · {Number(plan.planned_qty||0).toLocaleString()} units · #{plan.id.slice(0,8)} · {plan.status.toUpperCase()}</option>)}
  </select><small>Plans on the same line or product remain separate. Choose the exact shift, target quantity and plan ID.</small></label>
  <div className='operator-plan-availability'><strong>{operatorEligiblePlans.length.toLocaleString()}</strong><span>available Draft / Active plans</span><small>Completed and cancelled plans are not selectable.</small></div>
 </div>
 {selectedPlan&&<><div className='operator-plan-strip'><div><span className='eyebrow'>SELECTED PLAN</span><strong>{selectedPlan.brand||'—'} · {selectedPlan.product_name} · {selectedPlan.model}</strong><span>{selectedPlan.production_line} · Production date: {selectedPlan.production_date}</span></div><div className='plan-stamp'><span>Plan status</span><b>{selectedPlan.status}</b></div></div>
  <div className='operator-active-progress'><div className='operator-active-progress-head'><span>ACTIVE PRODUCTION PROGRESS</span><strong>{selectedPlan.planned_qty?Math.round(scannedSerials.length/Number(selectedPlan.planned_qty)*100):0}% complete</strong></div><div className='progress-track'><div className='progress-fill' style={{width:(selectedPlan.planned_qty?Math.min(100,scannedSerials.length/Number(selectedPlan.planned_qty)*100):0)+'%'}}/></div><div className='operator-active-progress-foot'><span>{scannedSerials.length.toLocaleString()} units scanned</span><span>{pendingSerials.length.toLocaleString()} remaining of {Number(selectedPlan.planned_qty||0).toLocaleString()}</span></div></div>
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
 {!selectedPlan&&<div className='notice'>{operatorEligiblePlans.length?'Select a production plan above to load its serial allocation and scanner.':'No Draft or Active plans are available for scanning.'}</div>}
 </section></main>}
 {duplicateWarning&&<div className='warning-backdrop' role='alertdialog' aria-modal='true' aria-labelledby='duplicate-warning-title'><section className='warning-dialog'><div className='warning-symbol'>!</div><span className='eyebrow'>OPERATOR ATTENTION REQUIRED</span><h2 id='duplicate-warning-title'>Duplicate serial detected</h2><p>This serial has already been scanned for the selected production plan. Do not apply the same label again.</p><div className='warning-serial'><span>Serial number</span><b>{duplicateWarning.serial_number}</b><span>Label number</span><b>{duplicateWarning.label_number}</b></div><p className='warning-time'>Detected: {new Date(duplicateWarning.detected_at).toLocaleString('en-IN')}</p><button className='warning-ack' onClick={()=>setDuplicateWarning(null)}>Acknowledge warning</button></section></div>}
 </div>
}
