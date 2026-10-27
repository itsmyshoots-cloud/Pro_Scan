import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const appAnchor=" const importFile=async e=>{";
if(!source.includes(appAnchor))throw new Error('Monthly Plan helper anchor not found.');
if(!source.includes('const [monthlyOpenDropdown,setMonthlyOpenDropdown]')){
 const dropdownHelpers=[
  "const [monthlyOpenDropdown,setMonthlyOpenDropdown]=useState('');",
  "const [monthlyDropdownSearch,setMonthlyDropdownSearch]=useState('');",
  "const [monthlyNewCatalogType,setMonthlyNewCatalogType]=useState('');",
  "const [monthlyNewCatalogValue,setMonthlyNewCatalogValue]=useState('');",
  "const [monthlyCustomCatalogOptions,setMonthlyCustomCatalogOptions]=useState({brand:[],product_name:[],model:[]});",
  "const renderMonthlyCatalogDropdown=(field,label,options,value,placeholder,onSelect)=>{const visibleOptions=[...new Set([...(options||[]),...(monthlyCustomCatalogOptions[field]||[])].map(item=>String(item||'').trim()).filter(Boolean))].filter(item=>!monthlyDropdownSearch.trim()||item.toLocaleLowerCase().includes(monthlyDropdownSearch.trim().toLocaleLowerCase()));return <div className={'monthly-catalog-dropdown '+(monthlyOpenDropdown===field?'is-open':'')}><label>{label}</label><button type='button' className='monthly-catalog-trigger' aria-expanded={monthlyOpenDropdown===field} onClick={()=>{setMonthlyOpenDropdown(monthlyOpenDropdown===field?'':field);setMonthlyDropdownSearch('');setMonthlyNewCatalogType('');setMonthlyNewCatalogValue('')}}><span>{value||placeholder}</span><span className='monthly-catalog-chevron'>⌄</span></button>{monthlyOpenDropdown===field&&<div className='monthly-catalog-menu'><input className='monthly-catalog-search' value={monthlyDropdownSearch} onChange={e=>setMonthlyDropdownSearch(e.target.value)} placeholder={'Search '+label.toLowerCase()+'…'}/><div className='monthly-catalog-option-list'>{visibleOptions.length?visibleOptions.map(item=><button type='button' key={item} className={'monthly-catalog-option '+(item===value?'is-selected':'')} onClick={()=>{onSelect(item);setMonthlyOpenDropdown('');setMonthlyDropdownSearch('');setMonthlyNewCatalogType('')}}><span>{item}</span>{item===value&&<span>✓</span>}</button>):<div className='monthly-catalog-empty'>No matching {label.toLowerCase()} options</div>}</div><div className='monthly-catalog-add-area'>{monthlyNewCatalogType!==field?<button type='button' className='monthly-catalog-add-link' onClick={()=>{setMonthlyNewCatalogType(field);setMonthlyNewCatalogValue(monthlyDropdownSearch.trim())}}><span>＋</span> Add new {label}</button>:<div className='monthly-catalog-new-form'><input autoFocus value={monthlyNewCatalogValue} onChange={e=>setMonthlyNewCatalogValue(e.target.value)} placeholder={'New '+label.toLowerCase()+' name'}/><div><button type='button' className='monthly-catalog-cancel' onClick={()=>{setMonthlyNewCatalogType('');setMonthlyNewCatalogValue('')}}>Cancel</button><button type='button' className='monthly-catalog-save' disabled={!monthlyNewCatalogValue.trim()} onClick={()=>{const next=monthlyNewCatalogValue.trim();setMonthlyCustomCatalogOptions(prev=>({...prev,[field]:[...new Set([...(prev[field]||[]),next])]}));onSelect(next);setMonthlyOpenDropdown('');setMonthlyDropdownSearch('');setMonthlyNewCatalogType('');setMonthlyNewCatalogValue('')}}>Add</button></div></div>}</div></div>};"
 ].join('\n');
 source=source.replace(appAnchor,dropdownHelpers+'\n'+appAnchor);
}

if(!source.includes('const monthlyDashboardMonth=')){
 const helpers=[
  "const [monthlyDashboardMonth,setMonthlyDashboardMonth]=useState(new Date().toISOString().slice(0,7)); const [monthlySearch,setMonthlySearch]=useState('');",
  "const monthlyPeriodPlans=monthlyPlans.filter(plan=>String(plan.plan_month||'').slice(0,7)===monthlyDashboardMonth);",
  "const monthlyActiveProducts=[...monthlyPeriodPlans.reduce((groups,plan)=>{const brand=String(plan.brand||'').trim(),product_name=String(plan.product_name||'').trim(),model=String(plan.model||'').trim(),mrp=Number(plan.mrp||0),key=[brand,product_name,model,String(mrp)].join('::').toLocaleLowerCase();let row=groups.get(key);if(!row){row={brand,product_name,model,mrp,total:0,actual:0,plans:[]};groups.set(key,row);}row.total+=Math.max(0,Number(plan.total_qty||0));row.actual+=Math.max(0,Number(planningMetrics.monthly?.[plan.id]?.actual||0));row.plans.push(plan);return groups;},new Map()).values()].map(row=>({...row,difference:Math.max(0,row.total-row.actual),completion:row.total>0?Math.min(100,Math.round(row.actual/row.total*100)):0})).sort((a,b)=>a.product_name.localeCompare(b.product_name)||a.brand.localeCompare(b.brand)||a.model.localeCompare(b.model));",
  "const monthlyTotalPlanned=monthlyActiveProducts.reduce((sum,row)=>sum+row.total,0);",
  "const monthlyTotalProduction=monthlyActiveProducts.reduce((sum,row)=>sum+row.actual,0);",
  "const monthlyTotalDifference=monthlyActiveProducts.reduce((sum,row)=>sum+row.difference,0);",
  "const monthlyTotalCompletion=monthlyTotalPlanned>0?Math.min(100,Math.round(monthlyTotalProduction/monthlyTotalPlanned*100)):0;",
  "const monthlyPlanSearchResults=monthlyPeriodPlans.filter(plan=>!monthlySearch.trim()||[plan.brand,plan.product_name,plan.model].some(value=>String(value||'').toLocaleLowerCase().includes(monthlySearch.trim().toLocaleLowerCase())));"
 ].join('\n');
 source=source.replace(appAnchor,helpers+'\n'+appAnchor);
}

const monthlyPagePattern=/\{view==='monthly-plans'&&<main className='monthly-production-page'>[\s\S]*?<\/main>\}/;
const pageMatch=source.match(monthlyPagePattern);
if(!pageMatch)throw new Error('Could not find the current Monthly Plan page to replace.');
const oldPage=pageMatch[0];
const formMatch=oldPage.match(/<section className='panel monthly-create-panel'>[\s\S]*?<\/section>/);
if(!formMatch)throw new Error('Could not preserve the Monthly Plan create/edit form.');
let form=formMatch[0];
form=form.replace(
 "<span className='eyebrow'>{monthlyEditingId?'EDIT MONTHLY PLAN':'CREATE MONTHLY PLAN'}</span><h3>{monthlyEditingId?'Update plan details and add serials':'Model & serial pool'}</h3>",
 "<span className='eyebrow'>{monthlyEditingId?'EDIT MONTHLY PLAN':'CREATE MONTHLY PLAN'}</span><h3>{monthlyEditingId?'Update plan details and add quantity':'Create Monthly Plan'}</h3><p className='monthly-create-subtitle'>Add product quantity for a month. Upload a file or enter details manually.</p>"
);
form=form.replace(
 "<label>Month<input type='month' value={monthlyForm.plan_month} onChange={e=>setMonthlyForm({...monthlyForm,plan_month:e.target.value})}/></label>",
 "<label>Month<input type='month' value={monthlyForm.plan_month} onChange={e=>{setMonthlyForm({...monthlyForm,plan_month:e.target.value});setMonthlyDashboardMonth(e.target.value);}}/></label>"
);
form=form.replace(
 "<span>{monthlyEditingId?'Add serials to monthly pool':'① Upload Serial PDF'}</span>",
 "<span>{monthlyEditingId?'Add Quantity to Monthly Pool':'Upload Quantity File'}</span>"
);
form=form.replace(
 "<small>{monthlyFile||(monthlyEditingId?'Choose a file containing additional unique serial-label pairs':'Searchable PDF / CSV / TXT')}</small>",
 "<small>{monthlyFile||(monthlyEditingId?'Upload a file with additional quantity entries':'Upload PDF, CSV or TXT with product quantities')}</small>"
);
const brandInput="<label>Brand<input list='monthly-brand-options' value={monthlyForm.brand} onChange={e=>setMonthlyForm({...monthlyForm,brand:e.target.value,product_name:'',model:''})} placeholder='Choose or enter brand'/><datalist id='monthly-brand-options'>{monthlyBrandOptions.map(value=><option key={value} value={value}/>)}</datalist></label>";
const productInput="<label>Product<input list='monthly-product-options' value={monthlyForm.product_name} onChange={e=>setMonthlyForm({...monthlyForm,product_name:e.target.value,model:''})} placeholder='Choose or enter product'/><datalist id='monthly-product-options'>{monthlyProductOptions.map(value=><option key={value} value={value}/>)}</datalist></label>";
const modelInput="<label>Model<input list='monthly-model-options' value={monthlyForm.model} onChange={e=>setMonthlyForm({...monthlyForm,model:e.target.value})} placeholder='Choose or enter model'/><datalist id='monthly-model-options'>{monthlyModelOptions.map(value=><option key={value} value={value}/>)}</datalist></label>";
if(!form.includes("renderMonthlyCatalogDropdown('brand'")){
 if(!form.includes(brandInput)||!form.includes(productInput)||!form.includes(modelInput))throw new Error('Could not find all native dropdown fields to replace.');
 form=form.replace(brandInput,"{renderMonthlyCatalogDropdown('brand','Brand',monthlyBrandOptions,monthlyForm.brand,'Choose brand',value=>setMonthlyForm({...monthlyForm,brand:value,product_name:'',model:''}))}");
 form=form.replace(productInput,"{renderMonthlyCatalogDropdown('product_name','Product',monthlyProductOptions,monthlyForm.product_name,'Choose product',value=>setMonthlyForm({...monthlyForm,product_name:value,model:''}))}");
 form=form.replace(modelInput,"{renderMonthlyCatalogDropdown('model','Model',monthlyModelOptions,monthlyForm.model,'Choose model',value=>setMonthlyForm({...monthlyForm,model:value}))}");
}

form=form.replace("Ready serials","Ready Quantity");
form=form.replace(/serial-label pairs/g,"quantity entries");
form=form.replace(/serials/g,"quantities");
form=form.replace(/Serial PDF/g,"Quantity File");
form=form.replace(/serial PDF/g,"quantity file");

const pageHeader = "<header className='monthly-page-header'><div><h1>MONTHLY PLAN</h1><p>Manage monthly product quantities and track production progress</p></div><label className='monthly-month-filter'><span>Month</span><input type='month' value={monthlyDashboardMonth} onChange={e=>{setMonthlyDashboardMonth(e.target.value);setMonthlyForm({...monthlyForm,plan_month:e.target.value});}}/></label></header>";

const activeSection = "<section className='panel monthly-active-panel'><div className='monthly-section-head'><div><span className='eyebrow'>ACTIVE QUANTITY <span className='monthly-category-tag'>(TECH CATEGORY)</span></span><p>Planned quantity, live operator production and remaining difference by product</p></div><button type='button' className='monthly-view-all' onClick={()=>{setMonthlySearch('');document.getElementById('monthly-available-plans')?.scrollIntoView({behavior:'smooth',block:'start'});}}>View all <span>›</span></button></div><div className='monthly-active-grid'>{monthlyActiveProducts.length?monthlyActiveProducts.map(item=><article className='monthly-active-card' key={[item.brand,item.product_name,item.model,item.mrp].join('::')}><div className='monthly-active-card-top'><span className='monthly-product-mark'>{String(item.product_name||'?').trim().slice(0,1).toUpperCase()}</span><div className='monthly-product-identity'><h3>{item.product_name||'Product'}</h3><p>{item.model||'No model'}{item.brand?' · '+item.brand:''}</p></div><span className={'monthly-progress-status '+(item.completion>=100?'is-complete':item.actual>0?'is-partial':'is-active')}>{item.completion>=100?'COMPLETE':item.actual>0?'PARTIAL':'ACTIVE'}</span></div><div className='monthly-product-metrics'><div><span>Planned</span><strong>{item.total.toLocaleString('en-IN')}</strong></div><div><span>Production</span><strong>{item.actual.toLocaleString('en-IN')}</strong></div><div><span>Difference</span><strong className={item.difference>0?'is-pending':'is-complete'}>{item.difference.toLocaleString('en-IN')}</strong></div></div><div className='monthly-progress-bottom'><div className='monthly-progress-track'><span className={item.completion>=100?'is-complete':''} style={{width:item.completion+'%'}}/></div><strong>{item.completion}%</strong></div></article>):<div className='monthly-no-products'>No Monthly Plans for this month. Create a plan below to populate Active Quantity.</div>}</div><div className='monthly-total-kpis'><div className='monthly-kpi'><span className='monthly-kpi-icon'>▦</span><div><span>Total Products</span><strong>{monthlyActiveProducts.length.toLocaleString('en-IN')}</strong></div></div><div className='monthly-kpi'><span className='monthly-kpi-icon'>◇</span><div><span>Total Planned Quantity</span><strong>{monthlyTotalPlanned.toLocaleString('en-IN')}</strong></div></div><div className='monthly-kpi'><span className='monthly-kpi-icon'>▤</span><div><span>Total Production Quantity</span><strong>{monthlyTotalProduction.toLocaleString('en-IN')}</strong></div></div><div className='monthly-kpi'><span className='monthly-kpi-icon is-warning'>△</span><div><span>Total Difference</span><strong className={monthlyTotalDifference>0?'is-pending':'is-complete'}>{monthlyTotalDifference.toLocaleString('en-IN')}</strong></div></div><div className='monthly-kpi monthly-kpi-completion'><div><span>Overall Completion</span><strong>{monthlyTotalCompletion}%</strong></div><div className='monthly-progress-track'><span style={{width:monthlyTotalCompletion+'%'}}/></div></div></div></section>";

const availablePlans = "<section id='monthly-available-plans' className='panel monthly-available-panel'><div className='monthly-section-head'><div><span className='eyebrow'>AVAILABLE PLANS</span><h2>Monthly product plans</h2><p>Product quantity, production progress and remaining quantity</p></div><label className='monthly-plan-search'><span>⌕</span><input type='search' value={monthlySearch} onChange={e=>setMonthlySearch(e.target.value)} placeholder='Search brand, product or model...'/></label></div><div className='monthly-table-wrap'><table className='monthly-plan-table'><thead><tr><th>Month</th><th>Brand</th><th>Product</th><th>Model / SKU</th><th>MRP (₹)</th><th>Total Quantity</th><th>Production Quantity</th><th>Difference</th><th>Completion</th><th>Status</th><th>Action</th></tr></thead><tbody>{monthlyPlanSearchResults.length?monthlyPlanSearchResults.map(plan=>{const target=Math.max(0,Number(plan.total_qty||0)),actual=Math.max(0,Number(planningMetrics.monthly?.[plan.id]?.actual||0)),difference=Math.max(0,target-actual),completion=target>0?Math.min(100,Math.round(actual/target*100)):0;const status=completion>=100?'Complete':actual>0?'Partial':'Active';return <tr key={plan.id}><td>{new Date(String(plan.plan_month||'').slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{month:'short',year:'numeric'})}</td><td>{plan.brand||'—'}</td><td><strong>{plan.product_name||'—'}</strong></td><td>{plan.model||'—'}</td><td>{Number(plan.mrp||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}</td><td><strong>{target.toLocaleString('en-IN')}</strong></td><td>{actual.toLocaleString('en-IN')}</td><td><strong className={difference>0?'is-pending':'is-complete'}>{difference.toLocaleString('en-IN')}</strong></td><td><div className='monthly-table-completion'><div className='monthly-progress-track'><span className={completion>=100?'is-complete':''} style={{width:completion+'%'}}/></div><small>{completion}%</small></div></td><td><span className={'monthly-progress-status '+(completion>=100?'is-complete':actual>0?'is-partial':'is-active')}>{status}</span></td><td><div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={()=>startEditMonthlyPlan(plan)} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan' onClick={()=>void deleteMonthlyPlan(plan)} disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0}>⌫</button></div></td></tr>}) : <tr><td colSpan='11' className='monthly-empty-row'>{monthlySearch.trim()?'No plans match your search.':'No Monthly Plans found for this month.'}</td></tr>}</tbody></table></div><div className='monthly-plan-table-footer'><span>Showing {monthlyPlanSearchResults.length.toLocaleString('en-IN')} of {monthlyPeriodPlans.length.toLocaleString('en-IN')} plans for {new Date(monthlyDashboardMonth+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</span><button type='button' onClick={()=>void loadMonthlyPlans()}>↻ Refresh</button></div></section>";

const newPage="{view==='monthly-plans'&&<main className='monthly-production-page'>"+pageHeader+activeSection+form+availablePlans+"<section className='monthly-rule-note'><strong>Workflow rule:</strong> Monthly Plan tracks the available quantity pool. Daily plans reserve quantity, and operator scans update production progress.</section></main>}";
source=source.replace(oldPage,newPage);

// Add the clean, responsive dashboard visual style without overwriting the existing Monthly Plan stylesheet.
const cssFile='src/monthly-production.css';
if(!fs.existsSync(cssFile))throw new Error('Monthly stylesheet was not generated before the Monthly Plan dashboard finalizer.');
let css=fs.readFileSync(cssFile,'utf8');
if(!css.includes('monthly-dashboard-layout-v3')){
 const rules=[
  "/* monthly-custom-dropdowns-v1 */",
  ".monthly-create-panel{position:relative;z-index:4;overflow:visible!important}",
  ".monthly-create-panel .monthly-form-grid{position:relative;z-index:5;overflow:visible}",
  ".monthly-catalog-dropdown{position:relative;display:grid;gap:7px;min-width:0}",
  ".monthly-catalog-dropdown>label{display:block;color:#3c4d6a;font-size:12px;font-weight:800}",
  ".monthly-catalog-trigger{width:100%;min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #d9e3f1;border-radius:9px;background:#fff;color:#263b5e;font:inherit;font-size:13px;text-align:left;cursor:pointer;box-sizing:border-box}",
  ".monthly-catalog-trigger>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".monthly-catalog-chevron{flex:0 0 auto;font-size:17px;color:#627797;transition:transform .15s ease}",
  ".monthly-catalog-dropdown.is-open .monthly-catalog-trigger{border-color:#4c95ff;box-shadow:0 0 0 3px rgba(37,112,245,.13)}",
  ".monthly-catalog-dropdown.is-open .monthly-catalog-chevron{transform:rotate(180deg)}",
  ".monthly-catalog-menu{position:absolute;z-index:1000;left:0;right:0;top:calc(100% + 7px);padding:8px;background:#fff;border:1px solid #dce6f3;border-radius:13px;box-shadow:0 16px 38px rgba(22,43,76,.18);min-width:230px;max-height:340px;display:flex;flex-direction:column;gap:7px}",
  ".monthly-catalog-search{width:100%;box-sizing:border-box;border:1px solid #dce6f3;border-radius:8px;padding:9px 10px;font:inherit;font-size:12px;color:#17254a;outline:none}",
  ".monthly-catalog-search:focus,.monthly-catalog-new-form input:focus{border-color:#5b9bfa;box-shadow:0 0 0 2px rgba(37,112,245,.12)}",
  ".monthly-catalog-option-list{overflow-y:auto;min-height:0;max-height:190px;display:flex;flex-direction:column;gap:2px}",
  ".monthly-catalog-option{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;border-radius:7px;background:#fff;color:#314565;text-align:left;padding:9px 10px;font:inherit;font-size:12px;cursor:pointer}",
  ".monthly-catalog-option:hover,.monthly-catalog-option.is-selected{background:#edf5ff;color:#115fe0}",
  ".monthly-catalog-empty{padding:12px 10px;color:#7a8ba5;font-size:12px}",
  ".monthly-catalog-add-area{border-top:1px solid #e8eef6;padding-top:7px}",
  ".monthly-catalog-add-link{width:100%;display:flex;align-items:center;gap:8px;border:0;border-radius:8px;background:#eff6ff;color:#1267ed;font:inherit;font-size:12px;font-weight:900;padding:10px;cursor:pointer;text-align:left}",
  ".monthly-catalog-add-link>span{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:#dbeafe;font-size:16px}",
  ".monthly-catalog-new-form{display:grid;gap:8px}",
  ".monthly-catalog-new-form input{width:100%;box-sizing:border-box;border:1px solid #dce6f3;border-radius:8px;padding:9px 10px;font:inherit;font-size:12px;color:#17254a}",
  ".monthly-catalog-new-form>div{display:flex;justify-content:flex-end;gap:7px}",
  ".monthly-catalog-new-form button{border:1px solid #dce6f3;border-radius:7px;padding:7px 10px;background:#fff;color:#415574;font:inherit;font-size:11px;font-weight:800;cursor:pointer}",
  ".monthly-catalog-new-form .monthly-catalog-save{border-color:#1267f5;background:#1267f5;color:#fff}",
  ".monthly-catalog-new-form .monthly-catalog-save:disabled{opacity:.4;cursor:not-allowed}",
  "@media(max-width:900px){.monthly-catalog-menu{min-width:0;max-width:calc(100vw - 56px)}}",
  "/* monthly-dashboard-layout-v3 */",
  ".monthly-production-page{display:flex;flex-direction:column;gap:18px;max-width:1700px;margin:0 auto;padding:24px;background:#f2f6fc;color:#17254a}",
  ".monthly-page-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 2px}",
  ".monthly-page-header h1{font-size:27px;letter-spacing:.015em;margin:0 0 3px;font-weight:900;color:#10214f}",
  ".monthly-page-header p{margin:0;color:#6a7e9f;font-size:14px}",
  ".monthly-month-filter{display:grid;gap:5px;font-size:11px;font-weight:800;color:#64748b;min-width:190px}",
  ".monthly-month-filter input{border:1px solid #dbe5f2;border-radius:10px;padding:10px 12px;background:#fff;color:#17254a;font:inherit;font-size:13px}",
  ".monthly-active-panel,.monthly-create-panel,.monthly-available-panel{padding:20px;border:1px solid #dce7f5;border-radius:17px;background:#fff;box-shadow:0 7px 24px rgba(22,49,91,.035);min-width:0}",
  ".monthly-section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}",
  ".monthly-section-head .eyebrow{display:block;font-size:12px;letter-spacing:.04em;font-weight:900;color:#10285a}",
  ".monthly-section-head p{margin:5px 0 0;color:#6c7f9f;font-size:12px;line-height:1.5}",
  ".monthly-category-tag{color:#1670f8;font-size:11px;margin-left:5px}",
  ".monthly-view-all{border:0;background:transparent;color:#1266ec;font-weight:800;cursor:pointer;white-space:nowrap}",
  ".monthly-view-all span{font-size:20px;margin-left:8px}",
  ".monthly-active-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}",
  ".monthly-active-card{min-width:0;border:1px solid #e1eaf6;border-radius:12px;padding:14px;background:#fff}",
  ".monthly-active-card-top{display:flex;align-items:center;gap:10px;min-width:0}",
  ".monthly-product-mark{display:flex;align-items:center;justify-content:center;flex:0 0 42px;width:42px;height:42px;border-radius:50%;background:#e8f1ff;color:#1266ed;font-size:17px;font-weight:900}",
  ".monthly-product-identity{min-width:0;flex:1}",
  ".monthly-product-identity h3{font-size:13px;font-weight:900;margin:0;color:#263b63;overflow-wrap:anywhere}",
  ".monthly-product-identity p{font-size:11px;color:#6b7e9f;margin:4px 0 0;overflow-wrap:anywhere}",
  ".monthly-progress-status{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border-radius:999px;padding:5px 8px;font-size:9px;letter-spacing:.02em;font-weight:900;background:#e3f9ee;color:#088750;text-transform:uppercase}",
  ".monthly-progress-status.is-partial{background:#fff4dc;color:#bd6a00}.monthly-progress-status.is-complete{background:#e5f9ef;color:#087d49}",
  ".monthly-product-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:17px}",
  ".monthly-product-metrics>div{min-width:0;padding:0 8px;border-right:1px solid #e6edf6}.monthly-product-metrics>div:first-child{padding-left:0}.monthly-product-metrics>div:last-child{border-right:0;padding-right:0}",
  ".monthly-product-metrics span{display:block;color:#7183a0;font-size:10px;margin-bottom:4px}",
  ".monthly-product-metrics strong{display:block;color:#142a59;font-size:16px;line-height:1.2;overflow-wrap:anywhere}",
  ".monthly-product-metrics strong.is-pending,.monthly-kpi strong.is-pending{color:#e11d2e}.monthly-product-metrics strong.is-complete,.monthly-kpi strong.is-complete{color:#078753}",
  ".monthly-progress-bottom{display:flex;align-items:center;gap:10px;margin-top:14px}.monthly-progress-bottom>strong{font-size:10px;color:#647794;min-width:30px;text-align:right}",
  ".monthly-progress-track{height:8px;overflow:hidden;background:#e6edf6;border-radius:99px;flex:1;min-width:0}.monthly-progress-track span{display:block;height:100%;border-radius:99px;background:#1670f8;transition:width .2s ease}.monthly-progress-track span.is-complete{background:#16a765}",
  ".monthly-no-products{grid-column:1/-1;padding:28px 18px;text-align:center;background:#f8fbff;border:1px dashed #d6e2f2;border-radius:12px;color:#6c7f9f;font-size:13px}",
  ".monthly-total-kpis{display:grid;grid-template-columns:1.05fr 1.3fr 1.4fr 1.15fr 1.45fr;gap:0;margin-top:15px;background:#f3f8ff;border:1px solid #e0ecfb;border-radius:12px;padding:13px 8px}",
  ".monthly-kpi{display:flex;align-items:center;gap:11px;padding:0 14px;border-right:1px solid #d9e7f7;min-width:0}.monthly-kpi:last-child{border-right:0}",
  ".monthly-kpi-icon{font-size:25px;color:#1670f8;flex:0 0 auto;font-weight:800}.monthly-kpi-icon.is-warning{color:#e11d2e}",
  ".monthly-kpi>div{min-width:0;flex:1}.monthly-kpi>div>span{display:block;font-size:10px;color:#667b9d;line-height:1.4}.monthly-kpi strong{display:block;font-size:19px;margin-top:3px;color:#10285a;overflow-wrap:anywhere}",
  ".monthly-kpi-completion>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:8px}.monthly-kpi-completion .monthly-progress-track{height:8px;margin-top:8px;flex:none}",
  ".monthly-create-panel .panel-head{margin-bottom:8px}.monthly-create-panel .panel-head h3{font-size:20px;margin:5px 0 0;color:#122557}.monthly-create-subtitle{margin:5px 0 12px;color:#6c7f9f;font-size:12px}",
  ".monthly-create-panel .monthly-form-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}.monthly-create-panel .monthly-form-grid label{display:grid;gap:7px;color:#3c4d6a;font-size:12px;font-weight:800;min-width:0}",
  ".monthly-create-panel .monthly-form-grid input{min-width:0;width:100%;box-sizing:border-box;border:1px solid #d9e3f1;border-radius:9px;padding:11px 12px;background:#fff;color:#15254a;font:inherit;font-size:13px}",
  ".monthly-create-panel .monthly-upload-row{display:grid;grid-template-columns:minmax(0,1fr) 165px 220px;gap:13px;align-items:center;margin-top:14px}",
  ".monthly-create-panel .monthly-upload-box{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,300px);align-items:center;gap:6px 14px;padding:12px 14px;border:1px dashed #c2d8f7;background:#f7fbff;border-radius:12px;min-width:0}",
  ".monthly-create-panel .monthly-upload-box span{font-size:12px;font-weight:900;color:#34496d}.monthly-create-panel .monthly-upload-box input{min-width:0;width:100%;padding:7px;border:1px solid #dae5f3;border-radius:8px;background:#fff;box-sizing:border-box;font-size:11px}.monthly-create-panel .monthly-upload-box small{font-size:10px;color:#6c7f9f;grid-column:1/-1}",
  ".monthly-create-panel .monthly-import-count{border:1px solid #deebfb;border-radius:12px;background:#f7fbff;padding:10px 14px;min-width:0}.monthly-create-panel .monthly-import-count span{font-size:10px;color:#4f6385;text-transform:uppercase;font-weight:900}.monthly-create-panel .monthly-import-count strong{display:block;font-size:23px;line-height:1.3;color:#10285a}",
  ".monthly-create-panel .primary{min-height:46px;border:0;border-radius:10px;background:#1267f5;color:#fff;font-size:12px;font-weight:900;box-shadow:0 6px 14px rgba(18,103,245,.16);cursor:pointer;padding:12px 15px}.monthly-create-panel .primary:disabled{opacity:.5;cursor:not-allowed}",
  ".monthly-available-panel .monthly-section-head h2{font-size:19px;margin:5px 0 0;color:#132654}.monthly-plan-search{display:flex;align-items:center;gap:8px;border:1px solid #dce6f3;border-radius:9px;padding:0 10px;min-width:270px;background:#fff}.monthly-plan-search>span{font-size:19px;color:#8092af}.monthly-plan-search input{border:0;outline:0;padding:10px 0;width:100%;min-width:0;font-size:12px;color:#17254a}",
  ".monthly-table-wrap{width:100%;overflow-x:auto;border:1px solid #e2eaf5;border-radius:11px}.monthly-plan-table{width:100%;border-collapse:collapse;min-width:1100px;background:#fff;font-size:11px}.monthly-plan-table th{background:#f1f6fc;color:#4e6385;text-align:left;font-size:10px;font-weight:900;padding:11px 10px;white-space:nowrap}.monthly-plan-table td{padding:9px 10px;border-top:1px solid #edf2f8;color:#243957;white-space:nowrap}.monthly-plan-table tbody tr:hover{background:#f8fbff}.monthly-plan-table td:nth-child(8){color:#dc2638}",
  ".monthly-table-completion{display:flex;align-items:center;gap:7px;min-width:90px}.monthly-table-completion .monthly-progress-track{height:7px;flex:1;min-width:45px}.monthly-table-completion small{font-size:10px;color:#627694}",
  ".monthly-table-actions{display:flex;align-items:center;gap:6px}.monthly-table-actions button{border:0;background:transparent;color:#526b93;font-size:17px;padding:4px 5px;cursor:pointer;border-radius:6px}.monthly-table-actions button:hover{background:#eaf2ff;color:#1267f5}.monthly-table-actions button.is-remove{color:#e11d2e}.monthly-table-actions button:disabled{opacity:.35;cursor:not-allowed}",
  ".monthly-empty-row{text-align:center!important;padding:24px!important;color:#7183a0!important}.monthly-plan-table-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#7183a0;font-size:11px;margin-top:10px}.monthly-plan-table-footer button{border:1px solid #dae4f2;border-radius:9px;background:#fff;color:#344969;font-size:11px;font-weight:800;padding:8px 12px;cursor:pointer}",
  "@media(max-width:1300px){.monthly-active-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.monthly-total-kpis{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:13px}.monthly-kpi:nth-child(3){border-right:0}.monthly-kpi-completion{grid-column:span 2}}",
  "@media(max-width:900px){.monthly-production-page{padding:16px}.monthly-active-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.monthly-create-panel .monthly-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.monthly-create-panel .monthly-upload-row{grid-template-columns:minmax(0,1fr) 140px}.monthly-create-panel .monthly-upload-row>.primary,.monthly-create-panel .monthly-upload-row>button{grid-column:1/-1}.monthly-create-panel .monthly-upload-box{grid-template-columns:1fr}.monthly-total-kpis{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:15px}.monthly-kpi:nth-child(2),.monthly-kpi:nth-child(4){border-right:0}.monthly-kpi:nth-child(3){border-right:1px solid #d9e7f7}.monthly-kpi-completion{grid-column:auto}.monthly-kpi{padding:0 10px}}",
  "@media(max-width:600px){.monthly-page-header{align-items:flex-start;flex-direction:column}.monthly-month-filter{width:100%}.monthly-active-panel,.monthly-create-panel,.monthly-available-panel{padding:14px}.monthly-active-grid{grid-template-columns:1fr}.monthly-total-kpis{grid-template-columns:1fr}.monthly-kpi{border-right:0!important;padding:9px 10px;border-bottom:1px solid #d9e7f7}.monthly-kpi:last-child{border-bottom:0}.monthly-create-panel .monthly-form-grid{grid-template-columns:1fr}.monthly-create-panel .monthly-upload-row{grid-template-columns:1fr}.monthly-create-panel .monthly-upload-row>.primary,.monthly-create-panel .monthly-upload-row>button{grid-column:auto}.monthly-section-head{align-items:flex-start}.monthly-plan-search{min-width:0;width:100%}.monthly-available-panel .monthly-section-head{flex-direction:column}.monthly-plan-table-footer{align-items:flex-start;flex-direction:column}}"
 ].join("\n");
 css+="\n"+rules+"\n";
 fs.writeFileSync(cssFile,css);
}

if(!newPage.includes('ACTIVE QUANTITY')||!newPage.includes('Production Quantity')||!newPage.includes('Difference')||!newPage.includes('monthly-plan-table')||!newPage.includes('monthly-total-kpis'))throw new Error('Monthly Plan dashboard UI validation failed.');
if(!newPage.includes("renderMonthlyCatalogDropdown('brand'")||!newPage.includes("renderMonthlyCatalogDropdown('product_name'")||!newPage.includes("renderMonthlyCatalogDropdown('model'"))throw new Error('Monthly catalog custom dropdowns were not installed.');
if(newPage.includes('<datalist')||newPage.includes('list=\'monthly-brand-options\''))throw new Error('Native browser datalist is still present on the Monthly Plan form.');
if(newPage.includes('MONTHLY SERIAL POOLS')||newPage.includes('Add Serials')||newPage.includes('unique serials'))throw new Error('Legacy serial terminology remains on the Monthly Plan screen.');
source=source.replace(monthlyPagePattern,newPage);
if(source===original)console.log('Monthly Plan dashboard already up to date.');
else fs.writeFileSync(file,source);
console.log('Monthly Plan dashboard finalizer applied.');
