import fs from 'fs';
const file='src/App.jsx'; let source=fs.readFileSync(file,'utf8');
const stateAnchor=" const [monthlyPlans,setMonthlyPlans]=useState([]);";
if(!source.includes(stateAnchor)) throw new Error('Monthly state anchor not found.');
if(!source.includes('monthlyLockedIds')) source=source.replace(stateAnchor,stateAnchor+" const [monthlyLockedIds,setMonthlyLockedIds]=useState(()=>new Set());");
const loaderAnchor=" const loadMonthlyPlans=async()=>{";
if(!source.includes(loaderAnchor)) throw new Error('Monthly loader anchor not found.');
if(!source.includes('refreshMonthlyPlanLocks')){
 const helper=" const refreshMonthlyPlanLocks=async()=>{const {data,error}=await supabase.from('plan_serials').select('monthly_plan_id').not('monthly_plan_id','is',null);if(error){setMonthlyMessage('Could not check Monthly Plan locks: '+error.message);return;}setMonthlyLockedIds(new Set((data||[]).map(row=>String(row.monthly_plan_id)).filter(Boolean)));};\n useEffect(()=>{void refreshMonthlyPlanLocks();},[monthlyPlans]);\n";
 source=source.replace(loaderAnchor,helper+loaderAnchor);
}
const guard="const startEditMonthlyPlan=plan=>{\n  if(!plan)return;";
if(source.includes(guard)&&!source.includes("This Monthly Plan is locked because a Daily Plan has already been created.")) source=source.replace(guard,"const startEditMonthlyPlan=plan=>{\n  if(!plan)return;\n  if(monthlyLockedIds.has(String(plan.id))){setMonthlyMessage('This Monthly Plan is locked because a Daily Plan has already been created from it. It can no longer be edited or deleted.');return;}");
const saveAnchor="const saveMonthlyPlan=async()=>{\n  const editingId=monthlyEditingId,current=monthlyPlans.find(plan=>plan.id===editingId);";
if(source.includes(saveAnchor)&&!source.includes("A Daily Plan already exists for this Monthly Plan")) source=source.replace(saveAnchor,"const saveMonthlyPlan=async()=>{\n  const editingId=monthlyEditingId,current=monthlyPlans.find(plan=>plan.id===editingId);\n  if(editingId&&monthlyLockedIds.has(String(editingId)))return setMonthlyMessage('A Daily Plan already exists for this Monthly Plan. Editing is locked.');");
const deleteAnchor="const deleteMonthlyPlan=async plan=>{\n  if(!plan)return;";
if(source.includes(deleteAnchor)&&!source.includes("cannot be deleted because a Daily Plan already exists")) source=source.replace(deleteAnchor,"const deleteMonthlyPlan=async plan=>{\n  if(!plan)return;\n  if(monthlyLockedIds.has(String(plan.id))){setMonthlyMessage('This Monthly Plan cannot be deleted because a Daily Plan has already been created from it.');return;}");
const oldButton="<button type='button' data-monthly-action='edit' data-monthly-plan-id={plan.id} title='Edit Monthly Plan' aria-label='Edit Monthly Plan'>✎</button><button type='button' data-monthly-action='delete' data-monthly-plan-id={plan.id} className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan'>⌫</button>";
const newButton="<button type='button' data-monthly-action='edit' data-monthly-plan-id={plan.id} title={monthlyLockedIds.has(String(plan.id))?'Locked: Daily Plan already created':'Edit Monthly Plan'} aria-label='Edit Monthly Plan' disabled={monthlyBusy||monthlyLockedIds.has(String(plan.id))}>✎</button><button type='button' data-monthly-action='delete' data-monthly-plan-id={plan.id} className='is-remove' title={monthlyLockedIds.has(String(plan.id))?'Locked: Daily Plan already created':'Remove Monthly Plan'} aria-label='Remove Monthly Plan' disabled={monthlyBusy||monthlyLockedIds.has(String(plan.id))}>⌫</button>";
if(source.includes(oldButton)) source=source.replace(oldButton,newButton);
const cssFile='src/monthly-production.css'; if(fs.existsSync(cssFile)){let css=fs.readFileSync(cssFile,'utf8');if(!css.includes('monthly-lock-v1')) css += "\n/* monthly-lock-v1 */\n.monthly-table-actions button:disabled{opacity:.42!important;cursor:not-allowed!important}.monthly-table-actions button:disabled:hover{transform:none!important}\n";fs.writeFileSync(cssFile,css);}
fs.writeFileSync(file,source); console.log('Monthly Plan lock-after-daily rule installed.');
