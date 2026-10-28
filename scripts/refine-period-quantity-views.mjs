import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

const helperAnchor=" const importFile=async e=>{";
if(!source.includes("const dailyPlansForSelectedDate=")){
 const helpers=[
  "const [dailyDashboardDate,setDailyDashboardDate]=useState(localDateKey(new Date()));",
  "const [liveQuantityView,setLiveQuantityView]=useState('daily');",
  "const dailyPlansForSelectedDate=useMemo(()=>dailyPlansList.filter(plan=>plan.production_date===dailyDashboardDate&&plan.status!=='cancelled'),[dailyPlansList,dailyDashboardDate]);",
  "const dailyProductSummary=[...dailyPlansForSelectedDate.reduce((groups,plan)=>{const brand=String(plan.brand||'').trim(),product_name=String(plan.product_name||'').trim(),model=String(plan.model||'').trim(),key=[brand,product_name,model].join('::').toLocaleLowerCase();let row=groups.get(key);if(!row){row={brand,product_name,model,total:0,actual:0,plans:[]};groups.set(key,row);}row.total+=Math.max(0,Number(plan.planned_qty||0));row.actual+=Math.max(0,Number(planningMetrics.daily?.[plan.id]?.actual||0));row.plans.push(plan);return groups;},new Map()).values()].map(row=>({...row,difference:Math.max(0,row.total-row.actual),completion:row.total>0?Math.min(100,Math.round(row.actual/row.total*100)):0})).sort((a,b)=>a.product_name.localeCompare(b.product_name)||a.brand.localeCompare(b.brand)||a.model.localeCompare(b.model));",
  "const dailySummaryTotalPlanned=dailyProductSummary.reduce((sum,row)=>sum+row.total,0);",
  "const dailySummaryTotalActual=dailyProductSummary.reduce((sum,row)=>sum+row.actual,0);",
  "const dailySummaryTotalDifference=Math.max(0,dailySummaryTotalPlanned-dailySummaryTotalActual);",
  "const dailySummaryCompletion=dailySummaryTotalPlanned?Math.min(100,Math.round(dailySummaryTotalActual/dailySummaryTotalPlanned*100)):0;",
  "const liveQuantityProducts=liveQuantityView==='daily'?dailyProductSummary:monthlyActiveProducts;",
  "const liveQuantityTotalPlanned=liveQuantityProducts.reduce((sum,row)=>sum+Number(row.total||0),0);",
  "const liveQuantityTotalActual=liveQuantityProducts.reduce((sum,row)=>sum+Number(row.actual||0),0);",
  "const liveQuantityTotalDifference=Math.max(0,liveQuantityTotalPlanned-liveQuantityTotalActual);",
  "const liveQuantityCompletion=liveQuantityTotalPlanned?Math.min(100,Math.round(liveQuantityTotalActual/liveQuantityTotalPlanned*100)):0;",
  "const dailyDateLabel=dailyDashboardDate?new Date(dailyDashboardDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'Selected date';"
 ].join('\n ');
 source=source.replace(helperAnchor,helpers+'\n'+helperAnchor);
}

// Load product metrics when Live View is opened so it uses the same source data as the plan tabs.
source=source.replace(
 "useEffect(()=>{if(['live-monitoring'].includes(view)){void loadMonthlyPlans();}},[view]);",
 "useEffect(()=>{if(['live-monitoring'].includes(view)){void loadMonthlyPlans();void loadDailyPlansList();}},[view]);"
);

const dailyQuantityPanel = "<section className='panel daily-quantity-panel'><div className='daily-quantity-heading'><div><span className='eyebrow'>DAILY QUANTITY SUMMARY</span><h3>Product-wise planned vs production</h3><p>Only plans for the selected date are included. Production reflects successful operator scans.</p></div><label>Production date<input type='date' value={dailyDashboardDate} onChange={event=>setDailyDashboardDate(event.target.value)}/></label></div><div className='daily-quantity-kpis'><div><span>Planned quantity</span><strong>{dailySummaryTotalPlanned.toLocaleString('en-IN')}</strong></div><div><span>Production quantity</span><strong>{dailySummaryTotalActual.toLocaleString('en-IN')}</strong></div><div><span>Difference</span><strong className={dailySummaryTotalDifference>0?'is-pending':'is-complete'}>{dailySummaryTotalDifference.toLocaleString('en-IN')}</strong></div><div><span>Completion</span><strong>{dailySummaryCompletion}%</strong></div></div>{dailyProductSummary.length?<div className='daily-quantity-table-wrap'><table className='daily-quantity-table'><thead><tr><th>Product / Model</th><th>Brand</th><th>Planned</th><th>Production</th><th>Difference</th><th>Completion</th></tr></thead><tbody>{dailyProductSummary.map(item=><tr key={[item.brand,item.product_name,item.model].join('::')}><td><strong>{item.product_name||'—'}</strong><small>{item.model||'—'} · {item.plans.length} plan{item.plans.length===1?'':'s'}</small></td><td>{item.brand||'—'}</td><td><strong>{item.total.toLocaleString('en-IN')}</strong></td><td>{item.actual.toLocaleString('en-IN')}</td><td><strong className={item.difference>0?'is-pending':'is-complete'}>{item.difference.toLocaleString('en-IN')}</strong></td><td><div className='daily-quantity-progress'><div><span style={{width:item.completion+'%'}}/></div><small>{item.completion}%</small></div></td></tr>)}</tbody></table></div>:<div className='daily-quantity-empty'>No daily production plans for {dailyDateLabel}.</div>}</section>";

const dailyListAnchor="<section className='panel daily-plans-list-panel'>";
if(!source.includes(dailyListAnchor))throw new Error('Daily Plan list anchor missing.');
if(!source.includes("className='daily-quantity-panel'"))source=source.replace(dailyListAnchor,dailyQuantityPanel+"\n "+dailyListAnchor);
const dailyListStart=source.indexOf(dailyListAnchor);
const dailyListEnd=source.indexOf("</section>",dailyListStart);
if(dailyListStart<0||dailyListEnd<0)throw new Error('Daily Plan detail list boundaries missing.');
let dailyListMarkup=source.slice(dailyListStart,dailyListEnd+10);
dailyListMarkup=dailyListMarkup.replace("All created daily plans","Plans for selected day");
dailyListMarkup=dailyListMarkup.replace("Daily plans are linked to their Monthly Plan. You can edit a Draft plan, but serial quantity cannot be added from the Daily Plan screen.","Individual shifts for the selected date. Product-wise totals are summarized above.");
dailyListMarkup=dailyListMarkup.replace("dailyPlansList.length?","dailyPlansForSelectedDate.length?");
dailyListMarkup=dailyListMarkup.replace("dailyPlansList.map(plan=>","dailyPlansForSelectedDate.map(plan=>");
dailyListMarkup=dailyListMarkup.replace("No daily plans created yet.","No daily plans for the selected date.");
source=source.slice(0,dailyListStart)+dailyListMarkup+source.slice(dailyListEnd+10);
source=source.replace(
 "<label>Production date<input type='date' value={form.production_date} onChange={e=>setForm({...form,production_date:e.target.value})}/></label>",
 "<label>Production date<input type='date' value={form.production_date} onChange={e=>{setForm({...form,production_date:e.target.value});setDailyDashboardDate(e.target.value);}}/></label>"
);

const liveStart=source.indexOf("{view==='live-monitoring'&&<main className='live-monitoring-page'>");
if(liveStart<0)throw new Error('Live View render section missing.');
const kpiStart=source.indexOf(" <div className='dashboard-kpis monitoring-kpis'>",liveStart);
const statusStart=source.indexOf("<section className='panel live-status-panel'>",liveStart);
if(kpiStart>=0&&statusStart>kpiStart)source=source.slice(0,kpiStart)+source.slice(statusStart);

// Remove the redundant line-status summary; native Live View already has a line-by-line hourly panel.
const statusBlock=/<section className='panel live-status-panel'>[\s\S]*?<\/section>/;
if(statusBlock.test(source))source=source.replace(statusBlock,'');

// Remove the monthly-only block; Daily / Monthly live quantities are now in a single switchable panel.
const monthlyBlock=/<section className='panel live-monthly-panel'>[\s\S]*?<\/section>/;
if(monthlyBlock.test(source))source=source.replace(monthlyBlock,'');

const liveQuantityPanel="<section className='panel live-quantity-panel'><div className='live-quantity-heading'><div><span className='eyebrow'>PRODUCTION QUANTITY</span><h3>Product-wise planned vs production</h3><p>Switch between daily and monthly totals in one compact view.</p></div><div className='live-quantity-controls'><div className='live-quantity-tabs'><button type='button' className={liveQuantityView==='daily'?'is-active':''} aria-pressed={liveQuantityView==='daily'} onClick={()=>setLiveQuantityView('daily')}>Daily</button><button type='button' className={liveQuantityView==='monthly'?'is-active':''} aria-pressed={liveQuantityView==='monthly'} onClick={()=>setLiveQuantityView('monthly')}>Monthly</button></div>{liveQuantityView==='daily'?<label>Production date<input type='date' value={dailyDashboardDate} onChange={event=>setDailyDashboardDate(event.target.value)}/></label>:<label>Month<input type='month' value={monthlyDashboardMonth} onChange={event=>setMonthlyDashboardMonth(event.target.value)}/></label>}</div></div><div className='live-quantity-kpis'><div><span>{liveQuantityView==='daily'?'Daily planned':'Monthly planned'}</span><strong>{liveQuantityTotalPlanned.toLocaleString('en-IN')}</strong></div><div><span>Production</span><strong>{liveQuantityTotalActual.toLocaleString('en-IN')}</strong></div><div><span>Difference</span><strong className={liveQuantityTotalDifference>0?'is-pending':'is-complete'}>{liveQuantityTotalDifference.toLocaleString('en-IN')}</strong></div><div><span>Completion</span><strong>{liveQuantityCompletion}%</strong></div></div>{liveQuantityProducts.length?<div className='live-quantity-table-wrap'><table className='live-quantity-table'><thead><tr><th>Product / Model</th><th>Brand</th><th>Planned</th><th>Production</th><th>Difference</th><th>Completion</th></tr></thead><tbody>{liveQuantityProducts.map(item=><tr key={[liveQuantityView,item.brand,item.product_name,item.model].join('::')}><td><strong>{item.product_name||'—'}</strong><small>{item.model||'—'} · {item.plans.length} plan{item.plans.length===1?'':'s'}</small></td><td>{item.brand||'—'}</td><td><strong>{item.total.toLocaleString('en-IN')}</strong></td><td>{item.actual.toLocaleString('en-IN')}</td><td><strong className={item.difference>0?'is-pending':'is-complete'}>{item.difference.toLocaleString('en-IN')}</strong></td><td><div className='live-quantity-progress'><div><span style={{width:item.completion+'%'}}/></div><small>{item.completion}%</small></div></td></tr>)}</tbody></table></div>:<div className='live-quantity-empty'>No production quantities found for {liveQuantityView==='daily'?dailyDateLabel:monthlyMonthLabel}.</div>}</section>";
const livePanelAnchor="<section className='panel live-line-panel'>";
const livePanelIndex=source.indexOf(livePanelAnchor,liveStart);
if(livePanelIndex<0)throw new Error('Original line-wise/hourly Live View panel missing.');
const plannerBoundary=source.indexOf("{view==='planner'&&<main>",liveStart);
if(plannerBoundary<0)throw new Error('Live View end boundary missing.');
let liveViewMarkup=source.slice(liveStart,plannerBoundary);
liveViewMarkup=liveViewMarkup.replace(/<section className='panel live-quantity-panel'>[\s\S]*?<\/section>/g,'');
const quantityInsertAt=liveViewMarkup.indexOf(livePanelAnchor);
if(quantityInsertAt<0)throw new Error('Original line-wise/hourly Live View panel missing after cleanup.');
liveViewMarkup=liveViewMarkup.slice(0,quantityInsertAt)+liveQuantityPanel+"\n "+liveViewMarkup.slice(quantityInsertAt);
source=source.slice(0,liveStart)+liveViewMarkup+source.slice(plannerBoundary);

if(!source.includes("dailyPlansForSelectedDate.map(plan=>"))throw new Error('Daily plan detail list is not filtered by the selected date.');
const liveViewEnd=source.indexOf("{view==='planner'&&<main>",liveStart); const liveQuantityPanelCount=source.slice(liveStart,liveViewEnd).split("className='live-quantity-panel'").length-1; console.log('Live View quantity panel count after deduplication: '+liveQuantityPanelCount); if(liveQuantityPanelCount<1)throw new Error('Live View product quantity panel was not inserted.');
if(!source.includes("className='daily-quantity-panel'"))throw new Error('Daily Plan quantity panel missing.');
if(!source.includes("onChange={e=>{setForm({...form,production_date:e.target.value});setDailyDashboardDate(e.target.value);}}"))throw new Error('Daily creation date is not synchronized with its summary.');

const cssFile='src/dashboard-live.css';
let css=fs.existsSync(cssFile)?fs.readFileSync(cssFile,'utf8'):'';
const cssRules="\n/* period-quantity-view-v1 */\n.daily-quantity-panel,.live-quantity-panel{padding:18px;border:1px solid #dfe8f4;border-radius:16px;background:#fff;min-width:0}\n.daily-quantity-heading,.live-quantity-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:14px}\n.daily-quantity-heading h3,.live-quantity-heading h3{margin:4px 0;color:#162b50;font-size:18px}\n.daily-quantity-heading p,.live-quantity-heading p{margin:5px 0 0;color:#71829c;font-size:12px;line-height:1.5}\n.daily-quantity-heading label,.live-quantity-controls>label{display:grid;gap:5px;min-width:160px;color:#647895;font-size:10px;font-weight:900}\n.daily-quantity-heading input,.live-quantity-controls input{border:1px solid #dbe5f2;border-radius:9px;padding:9px 10px;background:#fff;color:#1b3154;font:inherit;font-size:12px}\n.daily-quantity-kpis,.live-quantity-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}\n.daily-quantity-kpis>div,.live-quantity-kpis>div{min-width:0;border:1px solid #e2eaf5;border-radius:10px;padding:12px;background:#f7faff}\n.daily-quantity-kpis span,.live-quantity-kpis span{display:block;color:#71829d;font-size:10px;font-weight:800;line-height:1.4}\n.daily-quantity-kpis strong,.live-quantity-kpis strong{display:block;margin-top:4px;color:#152b50;font-size:19px;overflow-wrap:anywhere}\n.daily-quantity-kpis strong.is-pending,.live-quantity-kpis strong.is-pending,.daily-quantity-table .is-pending,.live-quantity-table .is-pending{color:#dc2638}\n.daily-quantity-kpis strong.is-complete,.live-quantity-kpis strong.is-complete,.daily-quantity-table .is-complete,.live-quantity-table .is-complete{color:#07864b}\n.daily-quantity-table-wrap,.live-quantity-table-wrap{width:100%;overflow-x:auto;border:1px solid #e2eaf5;border-radius:10px}\n.daily-quantity-table,.live-quantity-table{width:100%;min-width:760px;border-collapse:collapse;font-size:11px}\n.daily-quantity-table th,.live-quantity-table th{padding:11px 12px;text-align:left;white-space:nowrap;background:#f3f7fc;color:#6b7d98;text-transform:uppercase;letter-spacing:.035em;font-size:9px}\n.daily-quantity-table td,.live-quantity-table td{padding:10px 12px;border-top:1px solid #edf2f8;color:#334967;white-space:nowrap}\n.daily-quantity-table td:first-child strong,.live-quantity-table td:first-child strong{display:block;color:#23395d}\n.daily-quantity-table td:first-child small,.live-quantity-table td:first-child small{display:block;margin-top:3px;color:#8090a7;font-size:10px}\n.daily-quantity-progress,.live-quantity-progress{display:flex;align-items:center;gap:8px;min-width:100px}\n.daily-quantity-progress>div,.live-quantity-progress>div{width:82px;height:7px;overflow:hidden;border-radius:99px;background:#e7edf6}\n.daily-quantity-progress>div span,.live-quantity-progress>div span{display:block;height:100%;background:#2373ee;border-radius:99px}\n.daily-quantity-progress small,.live-quantity-progress small{font-size:10px;color:#647894;min-width:28px}\n.daily-quantity-empty,.live-quantity-empty{padding:22px;text-align:center;border:1px dashed #dce6f3;border-radius:10px;background:#f9fbfe;color:#71829b;font-size:12px}\n.live-quantity-heading{align-items:center}\n.live-quantity-controls{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}\n.live-quantity-tabs{display:flex;align-items:center;gap:3px;padding:4px;background:#f0f5fc;border:1px solid #e0e8f4;border-radius:10px}\n.live-quantity-tabs button{border:0;border-radius:7px;padding:8px 13px;background:transparent;color:#617492;font:inherit;font-size:11px;font-weight:900;cursor:pointer}\n.live-quantity-tabs button.is-active{background:#1768e8;color:#fff;box-shadow:0 2px 6px rgba(23,104,232,.18)}\n@media(max-width:760px){.daily-quantity-heading,.live-quantity-heading{align-items:stretch;flex-direction:column}.daily-quantity-heading label,.live-quantity-controls>label{width:100%}.daily-quantity-kpis,.live-quantity-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.live-quantity-controls{align-items:stretch;flex-direction:column}.live-quantity-tabs{align-self:flex-start}}\n@media(max-width:430px){.daily-quantity-kpis,.live-quantity-kpis{grid-template-columns:1fr 1fr}.daily-quantity-panel,.live-quantity-panel{padding:13px}.daily-quantity-kpis>div,.live-quantity-kpis>div{padding:10px}.daily-quantity-kpis strong,.live-quantity-kpis strong{font-size:17px}}\n";
if(!css.includes('period-quantity-view-v1'))css+='\n'+cssRules+'\n';
fs.writeFileSync(cssFile,css);

if(!source.includes("className='monthly-product-period'"))throw new Error('Monthly product cards are missing the selected month label.');
if(!source.includes("monthlyPeriodPlans.filter(plan=>String(plan.plan_month||'').slice(0,7)===monthlyDashboardMonth)"))throw new Error('Monthly Plan is not scoped to the selected month.');
fs.writeFileSync(file,source);
console.log('Monthly, Daily and Live View quantity summaries are date-scoped, product-wise and consolidated.');
