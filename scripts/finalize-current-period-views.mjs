import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;
const replaceExactly=(text,oldValue,newValue,label)=>{
 const count=text.split(oldValue).length-1;
 if(count!==1)throw new Error(label+': expected exactly one match, found '+count);
 return text.replace(oldValue,newValue);
};

// Keep a local-date daily selector shared by Daily Plan and Live View.
const monthStateAnchor="const [monthlyDashboardMonth,setMonthlyDashboardMonth]=useState(currentMonthKey()); const [monthlySearch,setMonthlySearch]=useState('');";
if(!source.includes("const [dailySummaryDate,setDailySummaryDate]")){
 if(!source.includes(monthStateAnchor))throw new Error('Current-month selector state anchor missing.');
 source=source.replace(monthStateAnchor,monthStateAnchor+" const [dailySummaryDate,setDailySummaryDate]=useState(localDateKey(new Date())); const [liveQuantityPeriod,setLiveQuantityPeriod]=useState('daily');");
}

// Derive a product-wise daily summary from the same plan rows and scan-derived metrics used by the Daily Plan table.
const monthlySearchAnchor="const monthlyPlanSearchResults=";
const monthlySearchStart=source.indexOf(monthlySearchAnchor);
if(monthlySearchStart<0)throw new Error('Monthly Plan period filter helper missing.');
if(!source.includes("const dailyProductSummaries=")){
 const lineEnd=source.indexOf('\n',monthlySearchStart);
 if(lineEnd<0)throw new Error('Monthly Plan helper line end missing.');
 const helpers=[
  "const dailyPlansForDate=dailyPlansList.filter(plan=>String(plan.production_date||'').slice(0,10)===dailySummaryDate);",
  "const dailyProductSummaries=[...dailyPlansForDate.reduce((groups,plan)=>{const brand=String(plan.brand||'').trim(),product_name=String(plan.product_name||'').trim(),model=String(plan.model||'').trim(),key=[brand,product_name,model].join('::').toLocaleLowerCase();let row=groups.get(key);if(!row){row={brand,product_name,model,planned:0,actual:0,plans:[]};groups.set(key,row);}row.planned+=Math.max(0,Number(plan.planned_qty||0));row.actual+=Math.max(0,Number(planningMetrics.daily?.[plan.id]?.actual||0));row.plans.push(plan);return groups;},new Map()).values()].map(row=>({...row,remaining:Math.max(0,row.planned-row.actual),completion:row.planned>0?Math.min(100,Math.round(row.actual/row.planned*100)):0})).sort((a,b)=>a.product_name.localeCompare(b.product_name)||a.brand.localeCompare(b.brand)||a.model.localeCompare(b.model));",
  "const dailySummaryPlanned=dailyProductSummaries.reduce((sum,row)=>sum+row.planned,0);",
  "const dailySummaryActual=dailyProductSummaries.reduce((sum,row)=>sum+row.actual,0);",
  "const dailySummaryRemaining=Math.max(0,dailySummaryPlanned-dailySummaryActual);",
  "const dailySummaryCompletion=dailySummaryPlanned>0?Math.min(100,Math.round(dailySummaryActual/dailySummaryPlanned*100)):0;",
  "const dailySummaryDateLabel=new Date(dailySummaryDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});"
 ].join('\n');
 source=source.slice(0,lineEnd+1)+helpers+'\n'+source.slice(lineEnd+1);
}

// Replace the Daily Plan history list with a current-date selector, a product-wise planned/actual summary, and date-filtered plan details.
const dailyListStart=source.indexOf("<section className='panel daily-plans-list-panel'>");
if(dailyListStart<0)throw new Error('Daily Plan history panel anchor missing.');
const dailyListEnd=source.indexOf('</section>',dailyListStart);
if(dailyListEnd<0)throw new Error('Daily Plan history panel ending missing.');
const newDailyPanel="<section className='panel daily-plans-list-panel period-daily-summary-panel'><div className='period-summary-heading'><div><span className='eyebrow'>DAILY PRODUCTION SUMMARY</span><h3>Product-wise planned vs production</h3><p>Only Daily Plans for the selected date are included. Actual quantity comes from accepted operator scans.</p></div><div className='period-summary-controls'><label><span>Production date</span><input type='date' value={dailySummaryDate} onChange={e=>setDailySummaryDate(e.target.value)}/></label><button type='button' onClick={()=>{void loadDailyPlansList();void loadDailyMonthlyPlans();}}>↻ Refresh</button></div></div><div className='period-summary-kpis'><div><span>Products</span><strong>{dailyProductSummaries.length.toLocaleString('en-IN')}</strong></div><div><span>Daily Planned</span><strong>{dailySummaryPlanned.toLocaleString('en-IN')}</strong></div><div><span>Production</span><strong>{dailySummaryActual.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className={dailySummaryRemaining>0?'period-pending':''}>{dailySummaryRemaining.toLocaleString('en-IN')}</strong></div><div><span>Completion</span><strong>{dailySummaryCompletion}%</strong><div className='period-progress-track'><span style={{width:dailySummaryCompletion+'%'}}/></div></div></div><div className='period-product-grid'>{dailyProductSummaries.length?dailyProductSummaries.map(item=><article className='period-product-card' key={[item.brand,item.product_name,item.model].join('::')}><div className='period-product-card-head'><div><span className='period-date-chip'>{dailySummaryDateLabel}</span><h4>{item.product_name||'Product'}</h4><p>{item.brand||'—'} · {item.model||'—'}</p></div><span className={'period-state '+(item.completion>=100?'is-complete':item.actual>0?'is-partial':'is-pending')}>{item.completion>=100?'Complete':item.actual>0?'In progress':'Not started'}</span></div><div className='period-product-metrics'><div><span>Planned</span><strong>{item.planned.toLocaleString('en-IN')}</strong></div><div><span>Produced</span><strong>{item.actual.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className={item.remaining>0?'period-pending':''}>{item.remaining.toLocaleString('en-IN')}</strong></div></div><div className='period-card-progress'><div className='period-progress-track'><span style={{width:item.completion+'%'}}/></div><strong>{item.completion}%</strong></div><small className='period-plan-count'>{item.plans.length.toLocaleString('en-IN')} daily plan{item.plans.length===1?'':'s'}</small></article>):<div className='period-empty'>No daily production plans for {dailySummaryDateLabel}. Change the date to view another day.</div>}</div><div className='period-detail-heading'><div><span className='eyebrow'>DAILY PLAN DETAILS</span><h4>Plans for {dailySummaryDateLabel}</h4></div><span>{dailyPlansForDate.length.toLocaleString('en-IN')} plan{dailyPlansForDate.length===1?'':'s'}</span></div>{dailyPlansLoading&&!dailyPlansList.length?<div className='empty'>Loading daily plans…</div>:dailyPlansForDate.length?<div className='daily-plan-table-wrap'><table className='daily-plan-table'><thead><tr><th>Product / Model</th><th>Line / Shift</th><th>Planned</th><th>Actual</th><th>Remaining</th><th>Status</th><th>Action</th></tr></thead><tbody>{dailyPlansForDate.map(plan=>{const metric=planningMetrics.daily?.[plan.id]||{};const planned=Number(plan.planned_qty||metric.planned||0);const actual=Number(metric.actual||0);return <tr key={plan.id}><td><strong>{plan.product_name||'—'}</strong><small>{plan.brand||'—'} · {plan.model||'—'}</small></td><td>{plan.production_line||'—'}<small>{plan.shift_name||'Shift A'} · {formatClock12(String(plan.shift_start||'').slice(0,5))}–{formatClock12(String(plan.shift_end||'').slice(0,5))}</small></td><td><strong>{planned.toLocaleString('en-IN')}</strong></td><td><strong>{actual.toLocaleString('en-IN')}</strong></td><td>{Math.max(0,planned-actual).toLocaleString('en-IN')}</td><td><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></td><td>{plan.status==='draft'?<button type='button' onClick={()=>void startEditPlan(plan)}>Edit draft</button>:<span className='muted-action'>Locked</span>}</td></tr>})}</tbody></table></div>:null}</section>";
source=source.slice(0,dailyListStart)+newDailyPanel+source.slice(dailyListEnd+'</section>'.length);

// Live View: remove duplicate line-status cards and duplicate active-plan KPI totals. Keep hourly line/plan charts and scan activity.
const liveStart=source.indexOf("{view==='live-monitoring'&&<main className='live-monitoring-page'>");
const plannerStart=source.indexOf("{view==='planner'&&<main>",liveStart);
if(liveStart<0||plannerStart<0)throw new Error('Live View boundaries missing.');
let liveView=source.slice(liveStart,plannerStart);
const removeFirstPanel=(html,marker,label)=>{
 const start=html.indexOf(marker);
 if(start<0)return html;
 const end=html.indexOf('</section>',start);
 if(end<0)throw new Error(label+' closing section missing.');
 return html.slice(0,start)+html.slice(end+'</section>'.length);
};
liveView=removeFirstPanel(liveView,"<section className='panel live-status-panel'>",'duplicate line-status panel');
const kpiStart=liveView.indexOf("<div className='dashboard-kpis monitoring-kpis'>");
if(kpiStart>=0){
 const lineStart=liveView.indexOf("<section className='panel live-line-panel'>",kpiStart);
 if(lineStart<0)throw new Error('Live View KPI block end missing.');
 liveView=liveView.slice(0,kpiStart)+liveView.slice(lineStart);
}
liveView=removeFirstPanel(liveView,"<section className='panel live-monthly-panel'>",'old monthly progress panel');

const livePeriodPanel="<section className='panel live-period-panel'><div className='period-summary-heading'><div><span className='eyebrow'>PRODUCTION QUANTITY OVERVIEW</span><h3>Planned vs production by product</h3><p>Switch between a single production date and the selected monthly pool; operator scans supply the actual quantities.</p></div><div className='period-switch' role='group' aria-label='Production period'><button type='button' className={liveQuantityPeriod==='daily'?'is-active':''} onClick={()=>setLiveQuantityPeriod('daily')}>Daily</button><button type='button' className={liveQuantityPeriod==='monthly'?'is-active':''} onClick={()=>setLiveQuantityPeriod('monthly')}>Monthly</button></div></div>{liveQuantityPeriod==='daily'?<><div className='period-view-date-row'><label><span>Production date</span><input type='date' value={dailySummaryDate} onChange={e=>setDailySummaryDate(e.target.value)}/></label><span className='period-current-label'>{dailySummaryDateLabel}</span></div><div className='period-summary-kpis'><div><span>Products</span><strong>{dailyProductSummaries.length.toLocaleString('en-IN')}</strong></div><div><span>Daily Planned</span><strong>{dailySummaryPlanned.toLocaleString('en-IN')}</strong></div><div><span>Production</span><strong>{dailySummaryActual.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className={dailySummaryRemaining>0?'period-pending':''}>{dailySummaryRemaining.toLocaleString('en-IN')}</strong></div><div><span>Completion</span><strong>{dailySummaryCompletion}%</strong><div className='period-progress-track'><span style={{width:dailySummaryCompletion+'%'}}/></div></div></div><div className='period-product-grid'>{dailyProductSummaries.length?dailyProductSummaries.map(item=><article className='period-product-card' key={[item.brand,item.product_name,item.model].join('::')}><div className='period-product-card-head'><div><span className='period-date-chip'>{dailySummaryDateLabel}</span><h4>{item.product_name||'Product'}</h4><p>{item.brand||'—'} · {item.model||'—'}</p></div><span className={'period-state '+(item.completion>=100?'is-complete':item.actual>0?'is-partial':'is-pending')}>{item.completion>=100?'Complete':item.actual>0?'In progress':'Not started'}</span></div><div className='period-product-metrics'><div><span>Planned</span><strong>{item.planned.toLocaleString('en-IN')}</strong></div><div><span>Produced</span><strong>{item.actual.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className={item.remaining>0?'period-pending':''}>{item.remaining.toLocaleString('en-IN')}</strong></div></div><div className='period-card-progress'><div className='period-progress-track'><span style={{width:item.completion+'%'}}/></div><strong>{item.completion}%</strong></div></article>):<div className='period-empty'>No daily production plans for {dailySummaryDateLabel}.</div>}</div></>:<><div className='period-view-date-row'><label><span>Monthly Plan</span><input type='month' value={monthlyDashboardMonth} onChange={e=>setMonthlyDashboardMonth(e.target.value)}/></label><span className='period-current-label'>{monthlyMonthLabel}</span></div><div className='period-summary-kpis'><div><span>Products</span><strong>{monthlyActiveProducts.length.toLocaleString('en-IN')}</strong></div><div><span>Monthly Planned</span><strong>{monthlyTotalPlanned.toLocaleString('en-IN')}</strong></div><div><span>Allocated to Daily Plans</span><strong>{monthlyTotalAllocated.toLocaleString('en-IN')}</strong></div><div><span>Produced</span><strong>{monthlyTotalProduction.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className={monthlyTotalDifference>0?'period-pending':''}>{monthlyTotalDifference.toLocaleString('en-IN')}</strong></div></div><div className='period-product-grid'>{monthlyActiveProducts.length?monthlyActiveProducts.map(item=><article className='period-product-card' key={[item.brand,item.product_name,item.model,item.mrp].join('::')}><div className='period-product-card-head'><div><span className='period-date-chip'>{monthlyMonthLabel}</span><h4>{item.product_name||'Product'}</h4><p>{item.model||'—'}{item.brand?' · '+item.brand:''}</p></div><span className={'period-state '+(item.completion>=100?'is-complete':item.actual>0?'is-partial':'is-pending')}>{item.completion>=100?'Complete':item.actual>0?'In progress':'Not started'}</span></div><div className='period-product-metrics'><div><span>Monthly Planned</span><strong>{item.total.toLocaleString('en-IN')}</strong></div><div><span>Produced</span><strong>{item.actual.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className={item.difference>0?'period-pending':''}>{item.difference.toLocaleString('en-IN')}</strong></div></div><div className='period-card-progress'><div className='period-progress-track'><span style={{width:item.completion+'%'}}/></div><strong>{item.completion}%</strong></div></article>):<div className='period-empty'>No monthly plans for {monthlyMonthLabel}.</div>}</div></>}</section>";

if(!liveView.includes("className='live-period-panel'")){
 // Move the old monthly progress position to the top of Live View, before line/hourly details.
 const oldMarker="<section className='panel live-monthly-panel'>";
 const oldStart=source.indexOf(oldMarker,liveStart);
 if(oldStart<0)throw new Error('Live View period summary insertion anchor missing.');
 const globalOldEnd=source.indexOf('</section>',oldStart);
 if(globalOldEnd<0)throw new Error('Live View period summary ending missing.');
 source=source.slice(0,oldStart)+livePeriodPanel+source.slice(globalOldEnd+'</section>'.length);
}
// Reload both monthly and daily data on entering Live View; both loaders are already used by their own tabs.
const oldEffect="useEffect(()=>{if(['dashboard','live-monitoring'].includes(view)){void loadMonthlyPlans();}},[view]);";
const newEffect="useEffect(()=>{if(view==='live-monitoring'){void loadMonthlyPlans();void loadDailyPlansList();}},[view]);";
if(source.includes(oldEffect))source=source.replace(oldEffect,newEffect);
else if(!source.includes(newEffect))throw new Error('Live View period-data refresh effect anchor missing.');

// A single summary should precede the line/hourly charts. Move it if the insertion location above was after the line panel.
const lvStart=source.indexOf("{view==='live-monitoring'&&<main className='live-monitoring-page'>");
const lvEnd=source.indexOf("{view==='planner'&&<main>",lvStart);
let currentLive=source.slice(lvStart,lvEnd);
const summaryStart=currentLive.indexOf("<section className='panel live-period-panel'>");
const lineStart=currentLive.indexOf("<section className='panel live-line-panel'>");
if(summaryStart<0||lineStart<0)throw new Error('Live View summary or line panel missing.');
const summaryEnd=currentLive.indexOf('</section>',summaryStart);
if(summaryEnd<0)throw new Error('Live View summary closing section missing.');
if(summaryStart>lineStart){
 const summary=currentLive.slice(summaryStart,summaryEnd+'</section>'.length);
 currentLive=currentLive.slice(0,summaryStart)+currentLive.slice(summaryEnd+'</section>'.length);
 const newLineStart=currentLive.indexOf("<section className='panel live-line-panel'>");
 currentLive=currentLive.slice(0,newLineStart)+summary+currentLive.slice(newLineStart);
 source=source.slice(0,lvStart)+currentLive+source.slice(lvEnd);
}

// Add compact responsive styling for period filters, KPIs, and product cards.
const cssFile='src/period-summary.css';
let css=fs.existsSync(cssFile)?fs.readFileSync(cssFile,'utf8'):'';
if(!css.includes('period-summary-layout-v1')){
 css+='\n'+[
  "/* period-summary-layout-v1 */",
  ".period-daily-summary-panel,.live-period-panel{padding:20px;border:1px solid #dfe8f4;border-radius:16px;background:#fff;min-width:0}",
  ".period-summary-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px}",
  ".period-summary-heading h3{margin:5px 0;color:#14284f;font-size:19px}.period-summary-heading p{margin:5px 0 0;color:#7183a0;font-size:12px;line-height:1.5}",
  ".period-summary-controls{display:flex;align-items:flex-end;gap:9px}.period-summary-controls label,.period-view-date-row label{display:grid;gap:5px;color:#687d9a;font-size:10px;font-weight:900}.period-summary-controls input,.period-view-date-row input{min-width:155px;border:1px solid #dce6f3;border-radius:9px;padding:9px 10px;background:#fff;color:#1c3155;font:inherit;font-size:12px}.period-summary-controls button{border:1px solid #dce6f3;border-radius:9px;padding:9px 11px;background:#fff;color:#334969;font:inherit;font-size:11px;font-weight:800;cursor:pointer}",
  ".period-summary-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;background:#f4f8ff;border:1px solid #e0eaf8;border-radius:12px;padding:13px 6px;margin-bottom:15px}",
  ".period-summary-kpis>div{min-width:0;padding:0 13px;border-right:1px solid #dce8f7}.period-summary-kpis>div:last-child{border-right:0}.period-summary-kpis span{display:block;color:#7183a0;font-size:10px;line-height:1.4}.period-summary-kpis strong{display:block;color:#14284f;font-size:20px;margin-top:4px;overflow-wrap:anywhere}.period-pending{color:#df263a!important}",
  ".period-progress-track{height:6px;border-radius:99px;overflow:hidden;background:#e2eaf5;min-width:0;margin-top:7px}.period-progress-track span{height:100%;display:block;border-radius:99px;background:#2168ed}",
  ".period-product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.period-product-card{min-width:0;border:1px solid #e1eaf5;border-radius:13px;padding:14px;background:#fff}",
  ".period-product-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.period-product-card-head>div{min-width:0}.period-product-card h4{margin:7px 0 3px;color:#1a2e50;font-size:14px;overflow-wrap:anywhere}.period-product-card p{margin:0;color:#7a8ca6;font-size:11px;overflow-wrap:anywhere}",
  ".period-date-chip{display:inline-flex;align-items:center;border:1px solid #dce9fb;border-radius:999px;background:#f1f6ff;color:#235fc1;font-size:9px;font-weight:900;padding:4px 7px;letter-spacing:.025em}",
  ".period-state{display:inline-flex;white-space:nowrap;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;text-transform:uppercase;background:#f0f3f8;color:#77859a}.period-state.is-complete{background:#e6f8ef;color:#087e48}.period-state.is-partial{background:#fff4dc;color:#ab6900}.period-state.is-pending{background:#eef3f9;color:#687b95}",
  ".period-product-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:16px}.period-product-metrics>div{min-width:0;border-right:1px solid #e8eef6;padding:0 8px}.period-product-metrics>div:first-child{padding-left:0}.period-product-metrics>div:last-child{border-right:0;padding-right:0}.period-product-metrics span{display:block;color:#7789a3;font-size:10px;margin-bottom:4px}.period-product-metrics strong{display:block;color:#1d3154;font-size:16px;overflow-wrap:anywhere}",
  ".period-card-progress{display:flex;align-items:center;gap:9px;margin-top:14px}.period-card-progress .period-progress-track{flex:1;margin:0}.period-card-progress strong{font-size:10px;color:#657b9b;min-width:28px;text-align:right}.period-plan-count{display:block;margin-top:9px;color:#8391a7;font-size:10px}",
  ".period-empty{grid-column:1/-1;padding:22px 16px;border:1px dashed #d7e3f2;border-radius:12px;background:#f9fbfe;text-align:center;color:#7183a0;font-size:12px}",
  ".period-detail-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 10px;padding-top:17px;border-top:1px solid #e9eff7}.period-detail-heading h4{margin:5px 0 0;color:#263b5c;font-size:14px}.period-detail-heading>span{font-size:11px;color:#7789a3}",
  ".period-switch{display:flex;align-items:center;gap:3px;padding:4px;border:1px solid #dce6f4;border-radius:11px;background:#f5f8fd;white-space:nowrap}.period-switch button{border:0;border-radius:8px;padding:8px 15px;background:transparent;color:#657997;font:inherit;font-size:12px;font-weight:900;cursor:pointer}.period-switch button.is-active{background:#fff;color:#155fe5;box-shadow:0 1px 4px rgba(18,44,87,.1)}",
  ".period-view-date-row{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 0 13px}.period-current-label{color:#536b8e;font-size:12px;font-weight:800;padding-bottom:8px}",
  ".live-period-panel{margin-bottom:16px}.live-monitoring-page .live-line-panel{margin-top:0}.live-monitoring-page .live-period-panel .period-product-grid{grid-template-columns:repeat(3,minmax(0,1fr))}",
  "@media(max-width:1100px){.period-summary-kpis{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:13px}.period-summary-kpis>div:nth-child(3){border-right:0}.period-summary-kpis>div:nth-child(4){border-right:1px solid #dce8f7}.period-product-grid,.live-monitoring-page .live-period-panel .period-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  "@media(max-width:720px){.period-daily-summary-panel,.live-period-panel{padding:14px}.period-summary-heading{align-items:flex-start;flex-direction:column}.period-summary-controls{width:100%;align-items:flex-end}.period-summary-controls label{flex:1}.period-summary-controls input{width:100%;min-width:0;box-sizing:border-box}.period-summary-kpis{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:13px}.period-summary-kpis>div:nth-child(2n){border-right:0}.period-summary-kpis>div:nth-child(3){border-right:1px solid #dce8f7}.period-product-grid,.live-monitoring-page .live-period-panel .period-product-grid{grid-template-columns:1fr}.period-view-date-row{align-items:flex-start;flex-direction:column}.period-switch{align-self:flex-start}}"
 ].join('\n')+'\n';
}
fs.writeFileSync(cssFile,css);
if(!source.includes("className='panel live-period-panel'"))throw new Error('Live View period switch was not installed.');
if(!source.includes("const dailyProductSummaries=")||!source.includes('dailyPlansForDate.map(plan=>'))throw new Error('Daily product rollup or date-filtered table is missing.');
if(!source.includes('monthlyMonthLabel')||!source.includes('monthlyActiveProducts.map(item=>'))throw new Error('Monthly Plan current-period product summary is missing.');
if(source.includes("className='panel live-status-panel'"))throw new Error('Duplicate line-status panel remains on Live View.');
if(source.includes("className='panel live-monthly-panel'"))throw new Error('Old duplicate monthly panel remains on Live View.');
if(source===original)throw new Error('Period summaries patch produced no source change.');
fs.writeFileSync(file,source);
console.log('Current-period summaries applied: monthly month labels, date-filtered daily product rollup, and a compact Live View daily/monthly switch without duplicate panels.');
