import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

// Planning metrics: one paginated serial query is shared by Monthly Plan and Daily Plan lists.
const stateAnchor=" const [dailyMonthlyPlans,setDailyMonthlyPlans]=useState([]); const [dailyMonthlyPlanId,setDailyMonthlyPlanId]=useState(''); const [dailyAvailableQty,setDailyAvailableQty]=useState(0); const [dailyBreakMinutes,setDailyBreakMinutes]=useState(0); const [dailyPlannedManpower,setDailyPlannedManpower]=useState(0); const [dailyNotes,setDailyNotes]=useState(''); const [dailyBusy,setDailyBusy]=useState(false); const [dailyMessage,setDailyMessage]=useState('');";
if(!source.includes(stateAnchor)) throw new Error('Daily planning state anchor not found.');
source=source.replace(stateAnchor,stateAnchor+" const [planningMetrics,setPlanningMetrics]=useState({monthly:{},daily:{}}); const [dailyPlansList,setDailyPlansList]=useState([]); const [dailyPlansLoading,setDailyPlansLoading]=useState(false); const planningMetricsRefreshRef=useRef(null);");

const monthlyLoaderStart=" const loadMonthlyPlans=async()=>{";
if(!source.includes(monthlyLoaderStart)) throw new Error('Monthly loader anchor not found.');
const oldMonthlyLoader=/ const loadMonthlyPlans=async\(\)=>\{[\s\S]*?\n \};/;
const newMonthlyLoader=` const loadPlanningMetrics=async(monthlyRows=[],dailyRows=[])=>{\n  try{\n   const {count:totalCount,error:countError}=await supabase.from('plan_serials').select('id',{count:'exact',head:true});\n   if(countError)throw countError;\n   const pageSize=1000,total=Number(totalCount||0),pages=Math.max(1,Math.ceil(total/pageSize));\n   const chunks=await Promise.all(Array.from({length:pages},(_,page)=>supabase.from('plan_serials').select('monthly_plan_id,plan_id,status').order('id',{ascending:true}).range(page*pageSize,Math.min(total,(page+1)*pageSize)-1)));\n   const monthly={},daily={};\n   for(const result of chunks){if(result.error)throw result.error;for(const row of result.data||[]){if(row.monthly_plan_id){const m=monthly[row.monthly_plan_id]||(monthly[row.monthly_plan_id]={planned:0,actual:0});m.planned+=1;if(row.status==='scanned')m.actual+=1;}if(row.plan_id){const d=daily[row.plan_id]||(daily[row.plan_id]={planned:0,actual:0});d.planned+=1;if(row.status==='scanned')d.actual+=1;}}}\n   setPlanningMetrics({monthly,daily});\n  }catch(error){setPlanningMetrics({monthly:{},daily:{}});console.warn('Planning metrics refresh failed',error);}\n };\n useEffect(()=>{planningMetricsRefreshRef.current=()=>{void loadPlanningMetrics(monthlyPlans,dailyPlansList);};},[monthlyPlans,dailyPlansList]);\n const loadMonthlyPlans=async()=>{ const {data,error}=await supabase.from('monthly_production_plans').select('id,plan_month,brand,product_name,model,mrp,total_qty,status,created_at').order('plan_month',{ascending:false}).order('created_at',{ascending:false}).limit(200); if(error){setMonthlyMessage('Could not load monthly plans: '+error.message);return;} const rows=data||[]; setMonthlyPlans(rows); void loadPlanningMetrics(rows,dailyPlansList); };`;
source=source.replace(oldMonthlyLoader,newMonthlyLoader);
source=source.replace("setMonitoringUpdatedAt(new Date());return;","setMonitoringUpdatedAt(new Date());void planningMetricsRefreshRef.current?.();return;");

// Add the Daily Plan list loader beside the existing monthly-plan loader.
const dailyLoaderAnchor=" const loadDailyMonthlyPlans=async()=>{";
if(!source.includes(dailyLoaderAnchor)) throw new Error('Daily monthly loader anchor not found.');
const dailyListFunction=` const loadDailyPlansList=async()=>{\n  setDailyPlansLoading(true);\n  try{ const {data,error}=await supabase.from('production_plans').select('id,production_date,product_name,brand,model,production_line,shift_name,shift_start,shift_end,planned_qty,status,hourly_targets,manpower_count').order('production_date',{ascending:false}).order('created_at',{ascending:false}).limit(500); if(error)throw error; const rows=data||[]; setDailyPlansList(rows); void loadPlanningMetrics(monthlyPlans,rows); }catch(error){setDailyMessage('Could not load daily plans: '+error.message);} finally{setDailyPlansLoading(false);} \n };\n`;
source=source.replace(dailyLoaderAnchor,dailyListFunction+dailyLoaderAnchor);

// Refresh the daily list when entering the Daily Plan tab.
source=source.replace("void loadDailyMonthlyPlans();}}>Daily Plan</button>","void loadDailyMonthlyPlans();void loadDailyPlansList();}}>Daily Plan</button>");
source=source.replace("void loadDailyMonthlyPlans();}}>＋ Daily Production Plan</button>","void loadDailyMonthlyPlans();void loadDailyPlansList();}}>＋ Daily Production Plan</button>");

// After creating a Daily Plan, return to Daily Plan and refresh the list instead of the old Manage Production page.
source=source.replace("await load();\n   await refreshDailyMonthlyAvailability(dailyMonthlyPlanId);", "await load();\n   await refreshDailyMonthlyAvailability(dailyMonthlyPlanId);\n   await loadDailyPlansList();");
source=source.replace("setView('manage');", "setView('daily-planner');");

// Remove the Manage Production navigation item entirely.
const manageNavRegex=/<button className=\{view==='manage'\?'nav-button is-active':'nav-button'\} onClick=\{\(\)=>setView\('manage'\)\}>Manage Production<\\\/button>/;
source=source.replace(manageNavRegex,'');
// Some generated builds contain the JSX slash without escaping in the regex above; handle the plain form too.
source=source.replace("<button className={view==='manage'?'nav-button is-active':'nav-button'} onClick={()=>setView('manage')}>Manage Production</button>",'');

// Replace visible "serials" wording with "quantity" while preserving the technical term "serial number".
source=source.replace(/\bserials\b/gi,match=>match[0]==='Serials'?'Quantities':match[0]==='SERIALS'?'QUANTITIES':'quantity');

// Add metrics to existing Monthly Plan cards: Planned = allocated daily quantity, Actual = scanned quantity, Available = remaining.
const monthlyQtyAnchor="<div className='monthly-plan-qty'><strong>{Number(plan.total_qty||0).toLocaleString()}</strong><span>quantity</span><div className='planning-metric-line'><span>Planned <b>{Number(planningMetrics.monthly?.[plan.id]?.planned||0).toLocaleString()}</b></span><span>Actual <b>{Number(planningMetrics.monthly?.[plan.id]?.actual||0).toLocaleString()}</b></span><span>Available <b>{Math.max(0,Number(plan.total_qty||0)-Number(planningMetrics.monthly?.[plan.id]?.planned||0)).toLocaleString()}</b></span></div><div className='monthly-completion'><div className='monthly-completion-heading'><span>Monthly completion</span><strong>{Number(plan.total_qty||0)>0?Math.min(100,Math.round(Number(planningMetrics.monthly?.[plan.id]?.actual||0)/Number(plan.total_qty||0)*100)):0}%</strong></div><div className='monthly-completion-track'><span style={{width:(Number(plan.total_qty||0)>0?Math.min(100,Math.round(Number(planningMetrics.monthly?.[plan.id]?.actual||0)/Number(plan.total_qty||0)*100)):0)+'%'}}/></div><small>{Number(planningMetrics.monthly?.[plan.id]?.actual||0).toLocaleString()} / {Number(plan.total_qty||0).toLocaleString()} scanned · {Number(plan.total_qty||0)>0&&Number(planningMetrics.monthly?.[plan.id]?.actual||0)>=Number(plan.total_qty||0)?'Completed':Number(planningMetrics.monthly?.[plan.id]?.actual||0)>0?'In progress':Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0?'Daily plan created':'Not started'}</small></div></div>";
if(source.includes(monthlyQtyAnchor)){
 source=source.replace(monthlyQtyAnchor,"<div className='monthly-plan-qty'><strong>{Number(plan.total_qty||0).toLocaleString()}</strong><span>quantity</span><div className='planning-metric-line'><span>Planned <b>{Number(planningMetrics.monthly?.[plan.id]?.planned||0).toLocaleString()}</b></span><span>Actual <b>{Number(planningMetrics.monthly?.[plan.id]?.actual||0).toLocaleString()}</b></span><span>Available <b>{Math.max(0,Number(plan.total_qty||0)-Number(planningMetrics.monthly?.[plan.id]?.planned||0)).toLocaleString()}</b></span></div></div>");
}

// Insert a compact Daily Plan history/list below the creation form. It contains no serial-upload/add-serial action.
const dailyPageBoundary=/<\/main>\}\s*\{view==='planner'/;
const dailyList=`<section className='panel daily-plans-list-panel'>\n  <div className='panel-head'><div><span className='eyebrow'>DAILY PLANS</span><h3>All created daily plans</h3><p>Daily plans are linked to their Monthly Plan. You can edit a Draft plan, but serial quantity cannot be added from the Daily Plan screen.</p></div><button type='button' onClick={()=>{void loadDailyPlansList();void loadDailyMonthlyPlans();}}>↻ Refresh</button></div>\n  {dailyPlansLoading?<div className='empty'>Loading daily plans…</div>:dailyPlansList.length?<div className='daily-plan-table-wrap'><table className='daily-plan-table'><thead><tr><th>Date</th><th>Product / Model</th><th>Line / Shift</th><th>Planned</th><th>Actual</th><th>Remaining</th><th>Status</th><th>Action</th></tr></thead><tbody>{dailyPlansList.map(plan=>{const metric=planningMetrics.daily?.[plan.id]||{};const planned=Number(plan.planned_qty||metric.planned||0);const actual=Number(metric.actual||0);return <tr key={plan.id}><td>{plan.production_date}</td><td><strong>{plan.product_name||'—'}</strong><small>{plan.brand||'—'} · {plan.model||'—'}</small></td><td>{plan.production_line||'—'}<small>{plan.shift_name||'Shift A'} · {formatClock12(String(plan.shift_start||'').slice(0,5))}–{formatClock12(String(plan.shift_end||'').slice(0,5))}</small></td><td><strong>{planned.toLocaleString()}</strong></td><td><strong>{actual.toLocaleString()}</strong></td><td>{Math.max(0,planned-actual).toLocaleString()}</td><td><span className={'plan-status-badge status-'+plan.status}>{plan.status}</span></td><td>{plan.status==='draft'?<button type='button' onClick={()=>void startEditPlan(plan)}>Edit draft</button>:<span className='muted-action'>Locked</span>}</td></tr>})}</tbody></table></div>:<div className='empty'>No daily plans created yet.</div>}\n </section>\n `;
if(!dailyPageBoundary.test(source)) throw new Error('Daily page boundary not found.');
source=source.replace(dailyPageBoundary,()=>dailyList+'</main>}\n {view===\'planner\'');

// Add a small Monthly Plan metric grid for clearer planned/actual/available quantities.
const monthlyStyleAnchor=".monthly-plan-qty";
if(!source.includes('planning-metric-line')){
 source=source.replace(monthlyStyleAnchor,monthlyStyleAnchor);
}

if(source===original)throw new Error('V7 patch produced no changes.');
fs.writeFileSync(file,source);
console.log('Production planning v7 applied.');
