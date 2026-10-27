import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;
const replaceExactly=(text,oldValue,newValue,label)=>{
 const count=text.split(oldValue).length-1;
 if(count!==1)throw new Error(label+': expected one match, found '+count);
 return text.replace(oldValue,newValue);
};

// Add the dedicated styling bundle after all other App imports have been patched.
const supabaseImport="import {supabase} from './lib/supabase';";
if(!source.includes("import './dashboard-live.css';")){
 if(!source.includes(supabaseImport))throw new Error('Supabase import anchor missing.');
 source=source.replace(supabaseImport,supabaseImport+"\nimport './dashboard-live.css';");
}

// Recent activity is read from scan_events and is read-only; operator scan writes stay unchanged.
const monitoringState="const [monitoringSerials,setMonitoringSerials]=useState([]);";
if(!source.includes("const [recentScanEvents,setRecentScanEvents]")){
 source=replaceExactly(source,monitoringState,monitoringState+" const [recentScanEvents,setRecentScanEvents]=useState([]);","recent scan state");
}

// Dashboard/live monitoring must include completed plans from today too, or daily production totals drop when a shift completes.
const oldRelevant="const relevantPlans=(view==='manage'||view==='reports')\n    ?plans\n    :(['dashboard','live-monitoring'].includes(view)?plans.filter(plan=>plan.status==='active'||plan.status==='draft'):(selectedPlan?[selectedPlan]:[]));";
const newRelevant="const relevantPlans=(view==='manage'||view==='reports')\n    ?plans\n    :(['dashboard','live-monitoring'].includes(view)?plans.filter(plan=>(plan.production_date===localDateKey(new Date())&&plan.status!=='cancelled')||plan.status==='active'||(plan.status==='draft'&&plan.production_date>=localDateKey(new Date()))):(selectedPlan?[selectedPlan]:[]));";
source=replaceExactly(source,oldRelevant,newRelevant,"dashboard monitoring scope");

// Query a small, newest-first event window alongside the existing scan counts. Event query failure must not block KPIs.
const oldPromise="const [serialResult,countResult]=await Promise.all([serialRequest,duplicateCountRequest]);";
const newPromise="const recentEventsRequest=['dashboard','live-monitoring'].includes(view)?supabase.from('scan_events').select('id,plan_id,serial_number,scanned_at,operator_name,production_line,scan_status,serial_number_id').order('scanned_at',{ascending:false}).limit(40):Promise.resolve({data:[],error:null});\n   const [serialResult,countResult,eventResult]=await Promise.all([serialRequest,duplicateCountRequest,recentEventsRequest]);";
source=replaceExactly(source,oldPromise,newPromise,"recent event query");
const oldMetricSet="setDuplicateEventCount(countResult.count||0);\n   setMonitoringUpdatedAt(new Date());";
const newMetricSet="setDuplicateEventCount(countResult.count||0);\n   if(!eventResult.error)setRecentScanEvents(eventResult.data||[]);\n   setMonitoringUpdatedAt(new Date());";
source=replaceExactly(source,oldMetricSet,newMetricSet,"recent event state update");

// Add dashboard calculations after the existing Monthly Plan helpers are declared, avoiding temporal-dead-zone references.
const monthlySearchAnchor="const monthlyPlanSearchResults=monthlyPeriodPlans.filter(plan=>!monthlySearch.trim()||[plan.brand,plan.product_name,plan.model].some(value=>String(value||'').toLocaleLowerCase().includes(monthlySearch.trim().toLocaleLowerCase())));";
const analyticsHelpers=[
"const todayProductionPlans=useMemo(()=>plans.filter(plan=>plan.production_date===todayKey&&plan.status!=='cancelled'),[plans,todayKey]);",
"const todayProductionPlanIds=useMemo(()=>new Set(todayProductionPlans.map(plan=>plan.id)),[todayProductionPlans]);",
"const todayScannedByPlan=useMemo(()=>monitoringSerials.reduce((map,row)=>{if(todayProductionPlanIds.has(row.plan_id)&&row.status==='scanned')map[row.plan_id]=(map[row.plan_id]||0)+1;return map;},{}),[monitoringSerials,todayProductionPlanIds]);",
"const todayPlannedQuantity=useMemo(()=>todayProductionPlans.reduce((sum,plan)=>sum+Math.max(0,Number(plan.planned_qty||0)),0),[todayProductionPlans]);",
"const todayProducedQuantity=useMemo(()=>todayProductionPlans.reduce((sum,plan)=>sum+Number(todayScannedByPlan[plan.id]||0),0),[todayProductionPlans,todayScannedByPlan]);",
"const todayBalanceQuantity=Math.max(0,todayPlannedQuantity-todayProducedQuantity);",
"const todayCompletionPercent=todayPlannedQuantity?Math.min(100,Math.round(todayProducedQuantity/todayPlannedQuantity*100)):0;",
"const todayCompletedPlans=useMemo(()=>todayProductionPlans.filter(plan=>plan.status==='completed'||(Number(plan.planned_qty||0)>0&&Number(todayScannedByPlan[plan.id]||0)>=Number(plan.planned_qty||0))).length,[todayProductionPlans,todayScannedByPlan]);",
"const todayActiveLineCount=useMemo(()=>new Set(activePlans.map(plan=>plan.production_line||'Unassigned')).size,[activePlans]);",
"const allLineLiveStats=useMemo(()=>[...new Set([...lines,...plans.map(plan=>plan.production_line||'Unassigned')])].map(line=>{const todayPlansForLine=todayProductionPlans.filter(plan=>(plan.production_line||'Unassigned')===line);const runningPlans=activePlans.filter(plan=>(plan.production_line||'Unassigned')===line);const target=todayPlansForLine.reduce((sum,plan)=>sum+Math.max(0,Number(plan.planned_qty||0)),0);const produced=todayPlansForLine.reduce((sum,plan)=>sum+Number(todayScannedByPlan[plan.id]||0),0);const complete=todayPlansForLine.length>0&&todayPlansForLine.every(plan=>plan.status==='completed'||(Number(plan.planned_qty||0)>0&&Number(todayScannedByPlan[plan.id]||0)>=Number(plan.planned_qty||0)));const status=runningPlans.length?'Running':complete?'Completed':todayPlansForLine.length?'Planned':'Idle';return {line,status,plans:todayPlansForLine.length,running:runningPlans.length,target,produced,balance:Math.max(0,target-produced),percent:target?Math.min(100,Math.round(produced/target*100)):0};}).sort((a,b)=>lines.indexOf(a.line)-lines.indexOf(b.line)||a.line.localeCompare(b.line)),[plans,todayProductionPlans,todayScannedByPlan,activePlans]);",
"const monthlyTotalAllocated=monthlyActiveProducts.reduce((sum,item)=>sum+item.plans.reduce((planSum,plan)=>planSum+Number(planningMetrics.monthly?.[plan.id]?.planned||0),0),0);",
"const monthlyMonthLabel=new Date(monthlyDashboardMonth+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});"
].join('\n');
if(!source.includes("const todayProductionPlans=")){
 source=replaceExactly(source,monthlySearchAnchor,monthlySearchAnchor+"\n"+analyticsHelpers,"live dashboard metrics");
}

// Include monthly serial allocation status scans in the normal live refresh loop after navigating to Dashboard/Live View.
const oldLoadEffect="useEffect(()=>{void __refreshProductionPlans()},[]);";
const newLoadEffect="useEffect(()=>{void __refreshProductionPlans()},[]);\n useEffect(()=>{if(['dashboard','live-monitoring'].includes(view)){void loadMonthlyPlans();}},[view]);";
if(!source.includes("if(['dashboard','live-monitoring'].includes(view)){void loadMonthlyPlans();}"))
 source=replaceExactly(source,oldLoadEffect,newLoadEffect,"monthly progress loader");

// Add a first-class Live View tab, while keeping the existing route and screen.
const dashboardNav="className={view==='dashboard'?'nav-button is-active':'nav-button'} onClick={()=>setView('dashboard')}>Dashboard</button>";
const liveNav=dashboardNav+"<button className={view==='live-monitoring'?'nav-button is-active':'nav-button'} onClick={()=>setView('live-monitoring')}>Live View</button>";
if(!source.includes("'>Live View</button>"))source=replaceExactly(source,dashboardNav,liveNav,"Live View navigation");

// Replace existing Dashboard KPIs with today's production truth, including completed shifts.
const dStart=source.indexOf("{view==='dashboard'&&<main className='dashboard-page'>");
const liveStart=source.indexOf("{view==='live-monitoring'&&<main className='live-monitoring-page'>",dStart);
if(dStart<0||liveStart<0)throw new Error('Dashboard and Live View section anchors were not found.');
const kpiStart=source.indexOf(" <div className='dashboard-kpis'>",dStart);
const kpiEnd=source.indexOf("\n <section className='panel dashboard-section",kpiStart);
if(kpiStart<0||kpiEnd<0||kpiEnd>liveStart)throw new Error('Dashboard KPI block could not be safely located.');
const dashboardKpis="<div className='dashboard-kpis dashboard-kpis-today'>"+
"<div className='dashboard-kpi'><span className='kpi-label'>Today's Planned</span><div className='kpi-value'>{todayPlannedQuantity.toLocaleString()}<span className='kpi-icon kpi-violet'>◎</span></div><small>{todayProductionPlans.length.toLocaleString()} production plans today</small></div>"+
"<div className='dashboard-kpi'><span className='kpi-label'>Produced</span><div className='kpi-value'>{todayProducedQuantity.toLocaleString()}<span className='kpi-icon kpi-green'>✓</span></div><small>Confirmed operator scans today</small></div>"+
"<div className='dashboard-kpi'><span className='kpi-label'>Balance</span><div className='kpi-value'>{todayBalanceQuantity.toLocaleString()}<span className='kpi-icon kpi-amber'>◷</span></div><small>Quantity remaining today</small></div>"+
"<div className='dashboard-kpi'><span className='kpi-label'>Completion</span><div className='kpi-value'>{todayCompletionPercent}%<span className='kpi-icon kpi-blue'>◔</span></div><div className='dashboard-kpi-progress'><span style={{width:todayCompletionPercent+'%'}}/></div></div>"+
"<div className='dashboard-kpi'><span className='kpi-label'>Active Lines</span><div className='kpi-value'>{todayActiveLineCount.toLocaleString()}<span className='kpi-icon kpi-blue'>▦</span></div><small>Lines with an active plan</small></div>"+
"<div className='dashboard-kpi'><span className='kpi-label'>Completed Plans</span><div className='kpi-value'>{todayCompletedPlans.toLocaleString()}<span className='kpi-icon kpi-green'>✓</span></div><small>Completed out of {todayProductionPlans.length.toLocaleString()} today</small></div>"+
"</div>";
source=source.slice(0,kpiStart)+" "+dashboardKpis+source.slice(kpiEnd);

// Shared line-status view: explicit Running / Planned / Completed / Idle states for every production line.
const lineStatusPanel="<section className='panel live-status-panel'><div className='live-module-heading'><div><span className='eyebrow'>PRODUCTION LINE STATUS</span><h3>Shop-floor line overview</h3><p>Line status and production figures are calculated from today's saved plans and scanned quantities.</p></div><span className={'live-connection-pill '+(realtimeConnected?'is-connected':'') }><i/> {realtimeConnected?'Realtime connected':'Polling fallback'}</span></div><div className='live-status-grid'>{allLineLiveStats.map(stat=><article className='live-status-card' key={stat.line}><div className='live-status-card-top'><strong>{stat.line}</strong><span className={'live-line-state state-'+stat.status.toLowerCase()}><i/>{stat.status}</span></div><div className='live-status-progress-head'><strong>{stat.percent}%</strong><span>{stat.produced.toLocaleString()} / {stat.target.toLocaleString()} produced</span></div><div className='live-status-track'><span style={{width:stat.percent+'%'}}/></div><div className='live-status-quantities'><span>Planned <b>{stat.target.toLocaleString()}</b></span><span>Balance <b>{stat.balance.toLocaleString()}</b></span><span>Plans <b>{stat.plans.toLocaleString()}</b></span></div></article>)}</div></section>";

const activityPanel="<section className='panel live-activity-panel'><div className='live-module-heading'><div><span className='eyebrow'>LIVE SCAN ACTIVITY</span><h3>Latest operator scans</h3><p>Accepted, duplicate and unallocated attempts from the scan event log.</p></div><button type='button' className='secondary-action' onClick={()=>void refreshMonitoring()}>↻ Refresh</button></div>{recentScanEvents.length?<div className='live-activity-table-wrap'><table className='live-activity-table'><thead><tr><th>Time</th><th>Line</th><th>Product / Model</th><th>Serial / Code</th><th>Operator</th><th>Result</th></tr></thead><tbody>{recentScanEvents.slice(0,20).map(event=>{const eventPlan=plans.find(plan=>plan.id===event.plan_id);const success=event.scan_status==='success';return <tr key={event.id}><td>{event.scanned_at?new Date(event.scanned_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}</td><td>{event.production_line||eventPlan?.production_line||'—'}</td><td><strong>{eventPlan?.product_name||'Unknown plan'}</strong><small>{eventPlan?.brand||'—'} · {eventPlan?.model||'—'}</small></td><td><code>{event.serial_number||'—'}</code></td><td>{event.operator_name||'—'}</td><td><span className={'live-scan-result '+(success?'result-success':event.scan_status==='duplicate'?'result-duplicate':'result-invalid')}>{success?'Accepted':event.scan_status==='duplicate'?'Duplicate':event.scan_status==='missing'?'Not allocated':String(event.scan_status||'Unknown')}</span></td></tr>})}</tbody></table></div>:<div className='live-activity-empty'>No scan events returned yet. Accepted and rejected scans will appear here as operators work.</div>}</section>";

const monthlyProgressPanel="<section className='panel live-monthly-panel'><div className='live-module-heading'><div><span className='eyebrow'>MONTHLY PRODUCTION PROGRESS</span><h3>Monthly plan completion</h3><p>Monthly quantity allocated to Daily Plans compared with scanned production.</p></div><label className='live-month-filter'><span>Month</span><input type='month' value={monthlyDashboardMonth} onChange={event=>setMonthlyDashboardMonth(event.target.value)}/></label></div><div className='live-monthly-summary'><div><span>Monthly Quantity</span><strong>{monthlyActiveProducts.reduce((sum,item)=>sum+item.total,0).toLocaleString()}</strong></div><div><span>Allocated to Daily Plans</span><strong>{monthlyTotalAllocated.toLocaleString()}</strong></div><div><span>Produced</span><strong>{monthlyTotalProduction.toLocaleString()}</strong></div><div><span>Balance to Produce</span><strong>{monthlyActiveProducts.reduce((sum,item)=>sum+item.difference,0).toLocaleString()}</strong></div></div>{monthlyActiveProducts.length?<div className='live-monthly-list'>{monthlyActiveProducts.map(item=>{const allocated=item.plans.reduce((sum,plan)=>sum+Number(planningMetrics.monthly?.[plan.id]?.planned||0),0);const balance=Math.max(0,item.total-item.actual);const completion=item.completion;return <div className='live-monthly-row' key={[item.brand,item.product_name,item.model,item.mrp].join('::')}><div className='live-monthly-product'><strong>{item.product_name||'Product'}</strong><span>{item.brand||'—'} · {item.model||'—'}</span></div><div className='live-monthly-numbers'><span>Monthly <b>{item.total.toLocaleString()}</b></span><span>Allocated <b>{allocated.toLocaleString()}</b></span><span>Produced <b>{item.actual.toLocaleString()}</b></span><span>Balance <b>{balance.toLocaleString()}</b></span></div><div className='live-monthly-progress'><div className='live-status-track'><span style={{width:completion+'%'}}/></div><strong>{completion}%</strong></div></div>})}</div>:<div className='live-activity-empty'>No Monthly Plans for {monthlyMonthLabel}. Open Monthly Plan to add a monthly quantity pool.</div>}</section>";

// Add line status, monthly progress, and scan activity to Dashboard before its footer.
const dashFooter=source.indexOf("<div className='dashboard-footer'>",dStart);
if(dashFooter<0||dashFooter>liveStart)throw new Error('Dashboard footer insertion point missing.');
source=source.slice(0,dashFooter)+lineStatusPanel+monthlyProgressPanel+activityPanel+"\n "+source.slice(dashFooter);

// Add a first-class line-status strip plus monthly progress and live events to the Live View.
const liveStart2=source.indexOf("{view==='live-monitoring'&&<main className='live-monitoring-page'>");
const liveFooter=source.indexOf("<div className='dashboard-footer'>",liveStart2);
const plannerStart=source.indexOf("{view==='planner'&&<main>",liveStart2);
if(liveStart2<0||liveFooter<0||plannerStart<0||liveFooter>plannerStart)throw new Error('Live View insertion anchors missing.');
source=source.slice(0,liveFooter)+activityPanel+monthlyProgressPanel+"\n "+source.slice(liveFooter);

// Add All-line status panel before the existing Active Production Lines/hourly charts panel.
const livePanelAnchor="<section className='panel live-line-panel'>";
const livePanelIndex=source.indexOf(livePanelAnchor,liveStart2);
if(livePanelIndex<0||livePanelIndex>plannerStart)throw new Error('Live View line panel anchor missing.');
source=source.slice(0,livePanelIndex)+lineStatusPanel+"\n "+source.slice(livePanelIndex);

// Make successful scan events appear immediately on the operator-originating browser and broadcast to other connected screens.
const oldSuccessEvent="void recordEvent('success',data.serial_number).then(({error:eventError})=>{if(eventError)setMessage(current=>current===successMessage?successMessage+' · scan event log failed':current);});";
const newSuccessEvent="void recordEvent('success',data.serial_number).then(({data:eventRecord,error:eventError})=>{if(eventError){setMessage(current=>current===successMessage?successMessage+' · scan event log failed':current);return;}if(eventRecord){setRecentScanEvents(previous=>[eventRecord,...previous.filter(row=>row.id!==eventRecord.id)].slice(0,40));broadcastProductionChange('event',selectedPlan.id,eventRecord.id);}});";
source=replaceExactly(source,oldSuccessEvent,newSuccessEvent,"immediate successful scan event");
const oldDuplicateEvent="if(duplicateEvent){\n      setDuplicateScans(previous=>previous.some(item=>item.id===duplicateEvent.id)?previous:[duplicateEvent,...previous]);";
const newDuplicateEvent="if(duplicateEvent){\n      setRecentScanEvents(previous=>[duplicateEvent,...previous.filter(row=>row.id!==duplicateEvent.id)].slice(0,40));\n      setDuplicateScans(previous=>previous.some(item=>item.id===duplicateEvent.id)?previous:[duplicateEvent,...previous]);";
source=replaceExactly(source,oldDuplicateEvent,newDuplicateEvent,"immediate duplicate event");

// Install the live view responsive stylesheet.
const cssFile='src/dashboard-live.css';
const cssRules=[
"/* dashboard-live-v1 */",
".dashboard-kpis-today{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}",
".dashboard-kpis-today .dashboard-kpi{min-width:0}",
".dashboard-kpi-progress{height:7px;overflow:hidden;border-radius:99px;background:#e7edf6;margin-top:10px}",
".dashboard-kpi-progress span{display:block;height:100%;background:#2563eb;border-radius:99px}",
".live-status-panel,.live-activity-panel,.live-monthly-panel{padding:20px;border:1px solid #dfe7f2;border-radius:18px;background:#fff;min-width:0}",
".live-module-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}",
".live-module-heading h3{margin:5px 0;color:#14284e;font-size:19px}",
".live-module-heading p{margin:4px 0 0;color:#7183a0;font-size:12px;line-height:1.5}",
".live-status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}",
".live-status-card{min-width:0;border:1px solid #e3ebf5;border-radius:13px;background:#fbfdff;padding:15px}",
".live-status-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}",
".live-status-card-top>strong{font-size:15px;color:#1d3154}",
".live-line-state{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;background:#eff3f8;color:#6b7c95}",
".live-line-state i,.live-connection-pill i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}",
".live-line-state.state-running{background:#e7f9ef;color:#07874c}.live-line-state.state-completed{background:#e8f1ff;color:#2563eb}.live-line-state.state-planned{background:#fff4dc;color:#a86300}.live-line-state.state-idle{background:#f0f3f7;color:#78869b}",
".live-status-progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:17px}",
".live-status-progress-head>strong{font-size:23px;color:#14284e}.live-status-progress-head>span{font-size:11px;color:#7183a0;text-align:right}",
".live-status-track{height:7px;overflow:hidden;background:#e7edf6;border-radius:99px;flex:1;min-width:0}",
".live-status-track>span{height:100%;display:block;background:#2563eb;border-radius:99px}.live-status-track>span.is-complete{background:#14a765}",
".live-status-quantities{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:11px;color:#7788a2;font-size:11px}",
".live-status-quantities b{color:#2b3d5c}",
".live-connection-pill{display:inline-flex;align-items:center;gap:7px;border-radius:99px;padding:7px 10px;background:#fff4dc;color:#aa6a05;font-size:10px;font-weight:900;white-space:nowrap}",
".live-connection-pill.is-connected{background:#e6f9ef;color:#07864a}",
".live-activity-panel .live-module-heading,.live-monthly-panel .live-module-heading{margin-bottom:14px}",
".live-activity-table-wrap{width:100%;overflow:auto;border:1px solid #e1e9f4;border-radius:12px}",
".live-activity-table{width:100%;min-width:880px;border-collapse:collapse;font-size:12px}",
".live-activity-table th{background:#f3f7fc;color:#687c9a;text-align:left;text-transform:uppercase;letter-spacing:.04em;font-size:10px;padding:12px 13px;white-space:nowrap}",
".live-activity-table td{padding:11px 13px;border-top:1px solid #edf2f8;color:#30425f;white-space:nowrap}",
".live-activity-table td small{display:block;font-size:10px;color:#8190a7;margin-top:3px}",
".live-activity-table code{font:600 11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#174b9b}",
".live-scan-result{display:inline-block;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;background:#e7f9ef;color:#07864a}",
".live-scan-result.result-duplicate{background:#fff1f1;color:#c92b37}.live-scan-result.result-invalid{background:#fff4dc;color:#a86300}",
".live-activity-empty{padding:28px 16px;text-align:center;border:1px dashed #d9e4f2;border-radius:12px;color:#7183a0;font-size:12px;background:#fafcff}",
".live-month-filter{display:grid;gap:5px;min-width:155px;color:#6b7d99;font-size:10px;font-weight:900}",
".live-month-filter input{border:1px solid #dbe5f2;border-radius:9px;padding:9px 10px;background:#fff;color:#182b4f;font:inherit;font-size:12px}",
".live-monthly-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:15px}",
".live-monthly-summary>div{border:1px solid #e3ebf5;background:#f6f9fe;border-radius:11px;padding:12px;min-width:0}",
".live-monthly-summary span{display:block;color:#7183a0;font-size:10px;font-weight:800;line-height:1.4}",
".live-monthly-summary strong{display:block;color:#14284e;font-size:21px;margin-top:4px;overflow-wrap:anywhere}",
".live-monthly-list{display:grid;gap:0}",
".live-monthly-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(300px,2fr) minmax(120px,.8fr);align-items:center;gap:18px;padding:13px 0;border-top:1px solid #edf2f8}",
".live-monthly-product{display:grid;gap:4px;min-width:0}.live-monthly-product strong{color:#263b5f;font-size:13px}.live-monthly-product span{color:#7b8da7;font-size:11px;overflow-wrap:anywhere}",
".live-monthly-numbers{display:flex;gap:10px 16px;flex-wrap:wrap;color:#7587a2;font-size:10px}.live-monthly-numbers b{color:#304360}",
".live-monthly-progress{display:flex;align-items:center;gap:8px;min-width:0}.live-monthly-progress strong{font-size:11px;color:#304360;min-width:30px;text-align:right}",
".dashboard-line-status-panel{margin-top:16px}",
"@media(max-width:1250px){.live-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-kpis-today{grid-template-columns:repeat(3,minmax(0,1fr))}.live-monthly-row{grid-template-columns:minmax(120px,1fr) minmax(230px,1.5fr)}.live-monthly-progress{grid-column:1/-1}}",
"@media(max-width:780px){.dashboard-kpis-today{grid-template-columns:repeat(2,minmax(0,1fr))}.live-status-grid{grid-template-columns:1fr}.live-monthly-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.live-module-heading{align-items:flex-start;flex-direction:column}.live-month-filter{width:100%}.live-monthly-row{grid-template-columns:1fr;gap:10px}.live-monthly-progress{grid-column:auto}.live-status-panel,.live-activity-panel,.live-monthly-panel{padding:14px}}",
"@media(max-width:480px){.dashboard-kpis-today{grid-template-columns:1fr}.live-monthly-summary{grid-template-columns:1fr 1fr}.live-status-progress-head{align-items:flex-start;flex-direction:column}.live-status-card{padding:12px}}"
].join('\n');
let css=fs.existsSync(cssFile)?fs.readFileSync(cssFile,'utf8'):'';
if(!css.includes('dashboard-live-v1'))css+='\n'+cssRules+'\n';
fs.writeFileSync(cssFile,css);

// Build-time safeguards: all critical new views must be present and hooks must be unconditional.
if(!source.includes(">Live View</button>"))throw new Error('Live View navigation was not installed.');
if(!source.includes('todayPlannedQuantity')||!source.includes('todayProducedQuantity')||!source.includes('todayCompletedPlans'))throw new Error("Today dashboard metrics are missing.");
if(!source.includes("LIVE SCAN ACTIVITY")||!source.includes("MONTHLY PRODUCTION PROGRESS")||!source.includes("PRODUCTION LINE STATUS"))throw new Error('Live monitoring sections are missing.');
if(!source.includes("setRecentScanEvents(previous=>[eventRecord"))throw new Error('Immediate scan event refresh is missing.');
fs.writeFileSync(file,source);
console.log('Dashboard + Live View updated: daily KPIs, line status, hourly chart, monthly progress, recent scan events and Realtime scan refresh.');
