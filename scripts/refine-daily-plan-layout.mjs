import fs from 'node:fs';

const appPath='src/App.jsx';
const cssPath='src/daily-production.css';
let source=fs.readFileSync(appPath,'utf8');
let css=fs.readFileSync(cssPath,'utf8');

const stateAnchor=" const [planningMetrics,setPlanningMetrics]=useState({monthly:{},daily:{}}); const [dailyPlansList,setDailyPlansList]=useState([]); const [dailyPlansLoading,setDailyPlansLoading]=useState(false); const planningMetricsRefreshRef=useRef(null);";
if(!source.includes(stateAnchor)) throw new Error('Daily Plan state anchor not found.');
source=source.replace(stateAnchor,stateAnchor+" const [dailyFormCollapsed,setDailyFormCollapsed]=useState(false); const [dailyRecordSearch,setDailyRecordSearch]=useState(''); const [dailyRecordDate,setDailyRecordDate]=useState('all'); const [dailyRecordLine,setDailyRecordLine]=useState('all'); const [dailyRecordStatus,setDailyRecordStatus]=useState('all'); const [dailyRecordPage,setDailyRecordPage]=useState(1);");

const loaderAnchor=" const loadDailyPlansList=async()=>{";
if(!source.includes(loaderAnchor)) throw new Error('Daily Plan list loader anchor not found.');
const derived=[
" const dailyRecordDateOptions=[...new Set(dailyPlansList.map(plan=>String(plan.production_date||'').slice(0,10)).filter(Boolean))].sort().reverse();",
" const dailyRecordLineOptions=[...new Set(dailyPlansList.map(plan=>String(plan.production_line||'').trim()).filter(Boolean))].sort();",
" const dailyRecordFilteredPlans=dailyPlansList.filter(plan=>{",
"  const haystack=[plan.product_name,plan.brand,plan.model,plan.production_line,plan.shift_name].join(' ').toLowerCase();",
"  return (dailyRecordDate==='all'||String(plan.production_date||'').slice(0,10)===dailyRecordDate)&&(dailyRecordLine==='all'||plan.production_line===dailyRecordLine)&&(dailyRecordStatus==='all'||plan.status===dailyRecordStatus)&&(!dailyRecordSearch.trim()||haystack.includes(dailyRecordSearch.trim().toLowerCase()));",
" });",
" const dailyRecordPageSize=10;",
" const dailyRecordPageCount=Math.max(1,Math.ceil(dailyRecordFilteredPlans.length/dailyRecordPageSize));",
" const dailyRecordPageRows=dailyRecordFilteredPlans.slice((dailyRecordPage-1)*dailyRecordPageSize,dailyRecordPage*dailyRecordPageSize);",
" const dailySelectedDateMetrics=dailyPlansList.filter(plan=>String(plan.production_date||'').slice(0,10)===String(form.production_date||'').slice(0,10)).reduce((totals,plan)=>{const metric=planningMetrics.daily?.[plan.id]||{};totals.planned+=Number(plan.planned_qty||metric.planned||0);totals.actual+=Number(metric.actual||0);return totals;},{planned:0,actual:0});",
" const dailyStartParts=String(shiftStart||'09:00').slice(0,5).split(':').map(Number);",
" const dailyEndParts=String(shiftEnd||'18:00').slice(0,5).split(':').map(Number);",
" const dailyShiftMinutes=(dailyEndParts[0]*60+dailyEndParts[1])-(dailyStartParts[0]*60+dailyStartParts[1]);",
" const dailyProductiveHours=Math.max(0,Math.floor((dailyShiftMinutes-Math.max(0,Number(dailyBreakMinutes)||0))/60));",
" const dailyShiftCapacity=dailyProductiveHours*Math.max(0,Math.floor(Number(hourlyProductionQty)||0));"
].join('\n')+'\n';
source=source.replace(loaderAnchor,derived+loaderAnchor);

const pageStart=source.indexOf("{view==='daily-planner'&&<main className='daily-production-page'>");
if(pageStart<0) throw new Error('Daily Plan page was not generated.');
const pageEnd=source.indexOf('</main>}',pageStart);
if(pageEnd<0) throw new Error('Daily Plan page closing tag not found.');

const libPattern=/<section className='panel daily-plan-library'>[\s\S]*?<\/section>\s*/;
const beforeClean=source.slice(pageStart,pageEnd);
if(beforeClean.includes("className='panel daily-plan-library'")){
 const clean=beforeClean.replace(libPattern,'');
 if(clean===beforeClean) throw new Error('Duplicate Daily Plan library could not be removed.');
 source=source.slice(0,pageStart)+clean+source.slice(pageEnd);
}

const heroStart=source.indexOf("<section className='daily-hero'>",pageStart);
const heroEnd=source.indexOf('</section>',heroStart);
if(heroStart<0||heroEnd<0) throw new Error('Daily Plan hero block not found.');
const hero=[
"<section className='daily-hero'>",
" <div><span className='eyebrow'>DAILY PRODUCTION PLANNING</span><h2>Daily Production Plan</h2><p>Schedule production from an existing Monthly Plan, configure the shift and hourly targets, then reserve the required quantity from the monthly pool.</p></div>",
"</section>",
"<section className='daily-summary-grid'>",
" <div className='daily-summary-card'><span>Monthly pool available</span><strong>{dailyAvailableQty.toLocaleString()}</strong><small>Unallocated units in selected Monthly Plan</small></div>",
" <div className='daily-summary-card'><span>Already planned for date</span><strong>{dailySelectedDateMetrics.planned.toLocaleString()}</strong><small>{form.production_date||'Selected production date'}</small></div>",
" <div className='daily-summary-card'><span>Actually produced</span><strong>{dailySelectedDateMetrics.actual.toLocaleString()}</strong><small>Successful scans on selected date</small></div>",
" <div className='daily-summary-card'><span>Remaining production today</span><strong>{Math.max(0,dailySelectedDateMetrics.planned-dailySelectedDateMetrics.actual).toLocaleString()}</strong><small>Selected-date planned quantity minus completed scans</small></div>",
"</section>"
].join('\n');
source=source.slice(0,heroStart)+hero+source.slice(heroEnd+'</section>'.length);

const gridStart=source.indexOf("  <div className='daily-form-grid'>",pageStart);
const shiftStart=source.indexOf("  <section className='daily-shift-card'>",gridStart);
if(gridStart<0||shiftStart<0) throw new Error('Daily product form grid boundaries not found.');
const productSection=[
"  <section className='daily-product-section'>",
"   <div className='daily-step-heading'><span className='daily-step-number'>01</span><div><h3>Product & daily schedule</h3><p>Choose the Monthly Plan, production date and line for this schedule.</p></div></div>",
"   <div className='daily-primary-grid'>",
"    <label>Production date<input type='date' value={form.production_date} onChange={e=>setForm({...form,production_date:e.target.value})}/></label>",
"    <label>Monthly production plan<select value={dailyMonthlyPlanId} onChange={e=>void prepareDailyMonthlyPlan(e.target.value)}><option value=''>Select monthly plan</option>{dailyMonthlyPlans.map(plan=><option key={plan.id} value={plan.id}>{new Date(plan.plan_month+'T00:00:00').toLocaleDateString('en-IN',{month:'short',year:'numeric'})} · {plan.brand} · {plan.product_name} · {plan.model} · {Number(plan.total_qty||0).toLocaleString()} units</option>)}</select></label>",
"    <label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(line=><option key={line}>{line}</option>)}</select></label>",
"   </div>",
"   <div className='daily-product-summary'>",
"    <div><span>Brand</span><strong>{form.brand||'—'}</strong></div>",
"    <div><span>Product</span><strong>{form.product_name||'—'}</strong></div>",
"    <div><span>Model</span><strong>{form.model||'—'}</strong></div>",
"    <div><span>MRP</span><strong>{dailyMonthlyPlans.find(plan=>plan.id===dailyMonthlyPlanId)?'₹ '+Number(dailyMonthlyPlans.find(plan=>plan.id===dailyMonthlyPlanId).mrp||0).toLocaleString('en-IN'):'—'}</strong></div>",
"   </div>",
"  </section>"
].join('\n');
source=source.slice(0,gridStart)+productSection+source.slice(shiftStart);

const newShift="<div className='daily-step-heading'><span className='daily-step-number'>02</span><div><h3>Shift, rate & manpower</h3><p>Set the shift window, break duration, hourly rate and manpower for this production run.</p></div></div>";
const shiftHeadingStart=source.indexOf("<div className='daily-shift-heading'>");
const shiftHeadingEnd=source.indexOf('</div></div>',shiftHeadingStart);
if(shiftHeadingStart<0||shiftHeadingEnd<0)throw new Error('Daily shift heading structural wrapper not found.');
source=source.slice(0,shiftHeadingStart)+newShift+source.slice(shiftHeadingEnd+'</div></div>'.length);

const oldCapacity="<div className='daily-capacity-summary'><div><span>Monthly available</span><strong>{dailyAvailableQty.toLocaleString()}</strong></div><div><span>Shift capacity</span><strong>{(Array.isArray(hourlyTargets)?hourlyTargets:[]).reduce((sum,row)=>sum+Math.max(0,Math.floor(Number(row.planned_qty)||0)),0).toLocaleString()}</strong></div><div><span>Daily planned</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong></div><div><span>Remaining monthly</span><strong>{Math.max(0,dailyAvailableQty-Number(form.planned_qty||0)).toLocaleString()}</strong></div></div>";
const newCapacity="<div className='daily-shift-summary'><div><span>Productive hours</span><strong>{dailyProductiveHours.toLocaleString()}</strong></div><div><span>Shift capacity</span><strong>{dailyShiftCapacity.toLocaleString()}</strong></div><div><span>Daily planned</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong></div><div><span>Unused shift capacity</span><strong>{Math.max(0,dailyShiftCapacity-Number(form.planned_qty||0)).toLocaleString()}</strong></div></div>";
if(!source.includes(oldCapacity)) throw new Error('Daily capacity summary anchor not found.');
source=source.replace(oldCapacity,newCapacity);

const hourlyAnchor="   {hourlyTargets.length?<div className='hourly-target-grid'>";
if(!source.includes(hourlyAnchor)) throw new Error('Daily hourly targets anchor not found.');
source=source.replace(hourlyAnchor,"   <div className='daily-step-heading daily-hourly-heading'><span className='daily-step-number'>03</span><div><h3>Hourly production targets</h3><p>Review or adjust the target for each productive hour. The total must match the daily planned quantity.</p></div></div>\n"+hourlyAnchor);

const notesAnchor="  <label className='daily-notes-field'>";
if(!source.includes(notesAnchor)) throw new Error('Daily Notes anchor not found.');
source=source.replace(notesAnchor,"  <div className='daily-step-heading daily-notes-heading'><span className='daily-step-number'>04</span><div><h3>Notes & instructions</h3><p>Optional setup notes or instructions for the production team.</p></div></div>\n"+notesAnchor);

const allocationNoteStart=source.indexOf("<div className='daily-rule-note'>");
const allocationNoteEnd=source.indexOf('</div>',allocationNoteStart);
if(allocationNoteStart<0||allocationNoteEnd<0)throw new Error('Daily allocation note structural wrapper not found.');
const newRule="<div className='daily-rule-note'><strong>Monthly pool reservation:</strong> This plan reserves {Number(form.planned_qty||0).toLocaleString()} units. Any unallocated quantity remains available in the Monthly Plan for another date.</div>";
source=source.slice(0,allocationNoteStart)+newRule+source.slice(allocationNoteEnd+'</div>'.length);

const panelStart=source.indexOf(" <section className='panel daily-plan-panel'>",pageStart);
if(panelStart<0) throw new Error('Daily Plan form panel not found.');
const panelHeader=[
" <section className='panel daily-plan-panel'>",
"  <div className='daily-plan-panel-head'><div><span className='eyebrow'>PLAN SETUP</span><h3>Create a daily production plan</h3><p>Complete the four steps below to schedule production from the selected Monthly Plan.</p></div><button type='button' className='daily-collapse-toggle' onClick={()=>setDailyFormCollapsed(value=>!value)}>{dailyFormCollapsed?'Create new plan':'Collapse form'}</button></div>",
"  {!dailyFormCollapsed&&<div className='daily-plan-form-body'>"
].join('\n');
source=source.slice(0,panelStart)+panelHeader+source.slice(panelStart+" <section className='panel daily-plan-panel'>".length);

const recordsStart=source.indexOf("<section className='panel daily-plans-list-panel'>",panelStart);
if(recordsStart<0) throw new Error('Daily Production Records section not found.');
const panelClose=source.lastIndexOf("\n </section>",recordsStart);
if(panelClose<0) throw new Error('Daily Plan form panel closing tag not found.');
source=source.slice(0,panelClose)+"\n  </div>}"+source.slice(panelClose);

const successAnchor="setSelectedPlan(savedPlan||null);";
if(!source.includes(successAnchor)) throw new Error('Daily Plan save success anchor not found.');
source=source.replace(successAnchor,successAnchor+"setDailyFormCollapsed(true);");

const recordsStart2=source.indexOf("<section className='panel daily-plans-list-panel'>",pageStart);
const recordsEnd=source.indexOf("</section>",recordsStart2);
if(recordsStart2<0||recordsEnd<0) throw new Error('Daily Production Records panel boundaries not found.');
let records=source.slice(recordsStart2,recordsEnd+"</section>".length);
records=records.replace("<h3>All created daily plans</h3><p>Daily plans are linked to their Monthly Plan. You can edit a Draft plan, but serial quantity cannot be added from the Daily Plan screen.</p>","<h3>Daily Production Records</h3><p>One list of every daily plan, with planned output, actual scans and remaining quantity.</p>");
const filterAnchor="</div><button type='button' onClick={()=>{void loadDailyPlansList();void loadDailyMonthlyPlans();}}>↻ Refresh</button></div>\n  {dailyPlansLoading?";
const filterBlock=[
"</div><button type='button' onClick={()=>{void loadDailyPlansList();void loadDailyMonthlyPlans();}}>↻ Refresh</button></div>",
"  <div className='daily-record-filters'>",
"   <label>Search<input type='search' value={dailyRecordSearch} placeholder='Search product, brand or model' onChange={e=>{setDailyRecordSearch(e.target.value);setDailyRecordPage(1);}}/></label>",
"   <label>Production date<select value={dailyRecordDate} onChange={e=>{setDailyRecordDate(e.target.value);setDailyRecordPage(1);}}><option value='all'>All dates</option>{dailyRecordDateOptions.map(date=><option key={date} value={date}>{new Date(date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</option>)}</select></label>",
"   <label>Production line<select value={dailyRecordLine} onChange={e=>{setDailyRecordLine(e.target.value);setDailyRecordPage(1);}}><option value='all'>All lines</option>{dailyRecordLineOptions.map(line=><option key={line} value={line}>{line}</option>)}</select></label>",
"   <label>Status<select value={dailyRecordStatus} onChange={e=>{setDailyRecordStatus(e.target.value);setDailyRecordPage(1);}}><option value='all'>All statuses</option><option value='draft'>Draft</option><option value='active'>Active</option><option value='completed'>Completed</option><option value='cancelled'>Cancelled</option></select></label>",
"  </div>",
"  <div className='daily-record-result-count'>{dailyRecordFilteredPlans.length.toLocaleString()} plan(s) found</div>",
"  {dailyPlansLoading?"
].join('\n');
if(!records.includes(filterAnchor)) throw new Error('Daily Records filter insertion anchor not found.');
records=records.replace(filterAnchor,filterBlock);
records=records.replace("dailyPlansList.length?<div className='daily-plan-table-wrap'>","dailyRecordFilteredPlans.length?<div className='daily-plan-table-wrap'>");
records=records.replace("dailyPlansList.map(plan=>{const metric=planningMetrics.daily?.[plan.id]||{};","dailyRecordPageRows.map(plan=>{const metric=planningMetrics.daily?.[plan.id]||{};");
const oldAction="<td>{plan.status==='draft'?<button type='button' onClick={()=>void startEditPlan(plan)}>Edit draft</button>:<span className='muted-action'>Locked</span>}</td>";
const newAction="<td><div className='daily-record-actions'><button type='button' onClick={()=>{setSelectedPlan(plan);setExpandedManagePlanId(plan.id);setView('manage');void refreshMonitoring();}}>Details</button>{plan.status==='draft'&&<button type='button' onClick={()=>void startEditPlan(plan)}>Edit draft</button>}</div></td>";
if(!records.includes(oldAction)) throw new Error('Daily Records action cell anchor not found.');
records=records.replace(oldAction,newAction);
records=records.replace("<div className='empty'>No daily plans created yet.</div>","<div className='empty'>No daily plans match the selected filters.</div>");
const tableClose="</table></div>:<div className='empty'>";
const pagination=[
"</table></div><div className='daily-record-pagination'>",
" <span>Showing {dailyRecordFilteredPlans.length?((dailyRecordPage-1)*dailyRecordPageSize+1).toLocaleString():'0'}–{Math.min(dailyRecordPage*dailyRecordPageSize,dailyRecordFilteredPlans.length).toLocaleString()} of {dailyRecordFilteredPlans.length.toLocaleString()}</span>",
" <div><button type='button' disabled={dailyRecordPage<=1} onClick={()=>setDailyRecordPage(page=>Math.max(1,page-1))}>Previous</button><span>Page {dailyRecordPage} of {dailyRecordPageCount}</span><button type='button' disabled={dailyRecordPage>=dailyRecordPageCount} onClick={()=>setDailyRecordPage(page=>Math.min(dailyRecordPageCount,page+1))}>Next</button></div>",
"</div>:<div className='empty'>"
].join('\n');
if(!records.includes(tableClose)) throw new Error('Daily Records pagination anchor not found.');
records=records.replace(tableClose,pagination);
source=source.slice(0,recordsStart2)+records+source.slice(recordsEnd+"</section>".length);

if(!css.includes("/* daily-plan-layout-v3 */")){
 css += [
"/* daily-plan-layout-v3 */",
".daily-production-page{max-width:1560px;padding:22px 24px 34px;display:grid;gap:16px}",
".daily-hero{margin:0;display:flex;align-items:center;justify-content:space-between;gap:16px}",
".daily-hero h2{font-size:27px;line-height:1.15;margin:5px 0 7px;color:#111827}",
".daily-hero p{margin:0;max-width:900px;font-size:13px;line-height:1.5;color:#64748b}",
".daily-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}",
".daily-summary-card{min-width:0;border:1px solid #dce5f0;border-radius:13px;background:#fff;padding:14px 16px}",
".daily-summary-card span{display:block;font-size:10px;letter-spacing:.07em;text-transform:uppercase;font-weight:850;color:#64748b}",
".daily-summary-card strong{display:block;font-size:26px;line-height:1.2;color:#172033;margin:7px 0 4px;font-variant-numeric:tabular-nums}",
".daily-summary-card small{display:block;font-size:10px;line-height:1.35;color:#64748b}",
".daily-plan-panel{padding:20px 22px}",
".daily-plan-panel-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-bottom:16px;border-bottom:1px solid #e8edf4}",
".daily-plan-panel-head h3{font-size:18px;margin:4px 0;color:#172033}",
".daily-plan-panel-head p{font-size:12px;margin:0;color:#64748b}",
".daily-collapse-toggle{flex:0 0 auto;border:1px solid #cbd8e8;border-radius:9px;background:#fff;color:#334155;font-weight:800;font-size:11px;padding:10px 13px;cursor:pointer}",
".daily-plan-form-body{display:grid;gap:18px;padding-top:18px}",
".daily-product-section{display:grid;gap:13px}",
".daily-step-heading{display:flex;align-items:flex-start;gap:11px;margin:0 0 4px}",
".daily-step-number{width:27px;height:27px;flex:0 0 27px;display:grid;place-items:center;border-radius:8px;background:#eaf2ff;color:#2458bd;font-size:11px;font-weight:900}",
".daily-step-heading h3{font-size:15px;margin:0 0 3px;color:#172033}",
".daily-step-heading p{font-size:11px;line-height:1.4;margin:0;color:#64748b}",
".daily-primary-grid{display:grid;grid-template-columns:minmax(180px,1fr) minmax(360px,2.2fr) minmax(155px,.9fr);gap:12px;align-items:end}",
".daily-primary-grid label,.daily-shift-grid label,.daily-notes-field{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:800;color:#52627a}",
".daily-primary-grid input,.daily-primary-grid select,.daily-shift-grid input,.daily-notes-field textarea{box-sizing:border-box;width:100%;min-height:42px;border:1px solid #d6dfeb;border-radius:9px;padding:9px 11px;background:#fff;color:#172033;font:inherit;font-size:12px}",
".daily-product-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;border:1px solid #e1e8f1;border-radius:11px;background:#f8fafc;padding:10px}",
".daily-product-summary>div{min-width:0;padding:4px 7px}",
".daily-product-summary span,.daily-shift-summary span{display:block;color:#64748b;font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:850}",
".daily-product-summary strong{display:block;margin-top:5px;color:#172033;font-size:12px;overflow-wrap:anywhere}",
".daily-shift-card{margin:0;padding:17px 18px;background:#fbfdff;border:1px solid #dce5f0;border-radius:14px;display:grid;gap:14px}",
".daily-shift-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}",
".daily-shift-grid input{min-height:40px}",
".daily-shift-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}",
".daily-shift-summary>div{border:1px solid #e4eaf2;border-radius:9px;background:#fff;padding:10px 12px}",
".daily-shift-summary strong{display:block;margin-top:5px;color:#172033;font-size:17px;font-variant-numeric:tabular-nums}",
".daily-hourly-heading{margin-top:2px}",
".daily-production-page .hourly-target-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:0}",
".daily-production-page .hour-target-field{min-width:0;border:1px solid #dce5f0;border-radius:10px;padding:10px;background:#fff}",
".daily-production-page .hour-target-field span{font-size:11px}",
".daily-production-page .hour-target-field small{font-size:9px}",
".daily-production-page .hour-target-field input{min-height:36px;padding:7px 9px}",
".daily-notes-heading{margin-top:1px}",
".daily-notes-field{margin-top:0}",
".daily-notes-field textarea{min-height:76px}",
".daily-rule-note{margin:0;padding:11px 13px;border-radius:9px;font-size:11px}",
".daily-plan-form-body .actions{margin:0;display:flex;gap:9px}",
".daily-plan-form-body .actions button{min-height:42px;padding:0 17px}",
".daily-plans-list-panel{padding:19px 20px;display:grid;gap:12px}",
".daily-plans-list-panel .panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0}",
".daily-plans-list-panel .panel-head h3{font-size:19px;margin:4px 0}",
".daily-plans-list-panel .panel-head p{font-size:11px;color:#64748b;margin:0}",
".daily-record-filters{display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(3,minmax(130px,1fr));gap:10px;padding:12px;border:1px solid #e4eaf2;border-radius:11px;background:#f8fafc}",
".daily-record-filters label{display:grid;gap:5px;font-size:10px;font-weight:850;color:#64748b}",
".daily-record-filters input,.daily-record-filters select{box-sizing:border-box;width:100%;height:38px;border:1px solid #d6dfeb;border-radius:8px;background:#fff;padding:0 10px;color:#172033;font:inherit;font-size:11px}",
".daily-record-result-count{font-size:10px;font-weight:800;color:#64748b}",
".daily-plan-table-wrap{width:100%;overflow:auto;border:1px solid #e6ecf3;border-radius:11px}",
".daily-plan-table{width:100%;min-width:900px;border-collapse:collapse}",
".daily-plan-table th{padding:11px 12px;background:#f8fafc;color:#64748b;font-size:9px;letter-spacing:.07em;text-transform:uppercase;text-align:left;white-space:nowrap}",
".daily-plan-table td{padding:12px;border-top:1px solid #edf1f6;font-size:11px;color:#334155;vertical-align:middle}",
".daily-plan-table td small{display:block;margin-top:3px;font-size:9px;color:#64748b}",
".daily-plan-table td strong{font-variant-numeric:tabular-nums}",
".daily-record-actions{display:flex;gap:6px;white-space:nowrap}",
".daily-record-actions button,.daily-record-pagination button{border:1px solid #d7e1ed;border-radius:7px;background:#fff;color:#334155;padding:7px 9px;font-size:10px;font-weight:800;cursor:pointer}",
".daily-record-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#64748b;font-size:10px}",
".daily-record-pagination>div{display:flex;align-items:center;gap:10px}",
".daily-record-pagination button:disabled{opacity:.4;cursor:not-allowed}",
"@media(max-width:1050px){.daily-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-shift-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-production-page .hourly-target-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}",
"@media(max-width:720px){.daily-production-page{padding:14px}.daily-hero h2{font-size:22px}.daily-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-primary-grid{grid-template-columns:1fr}.daily-product-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-shift-grid,.daily-shift-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-production-page .hourly-target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-plan-panel{padding:14px}.daily-plan-panel-head{align-items:flex-start}.daily-record-filters{grid-template-columns:1fr 1fr}.daily-plans-list-panel .panel-head{align-items:flex-start}.daily-record-pagination{align-items:flex-start;flex-direction:column}}"
].join('\n')+'\n';
}

if(!source.includes("dailyFormCollapsed?'Create new plan':'Collapse form'"))throw new Error('Daily Plan collapse control missing.');
if(!source.includes('dailyRecordPageRows.map(plan=>'))throw new Error('Daily Plan record pagination missing.');
if(!source.includes('dailySelectedDateMetrics.actual.toLocaleString()'))throw new Error('Daily Plan actual production summary missing.');
if(source.includes("className='panel daily-plan-library'"))throw new Error('Duplicate Daily Plan card library remains.');
fs.writeFileSync(appPath,source);
fs.writeFileSync(cssPath,css);
console.log('Daily Plan layout v3 applied: summary, four ordered steps, collapsible form, filtered and paginated records, duplicate library removed.');
