import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;
const pageStart=source.indexOf("{view==='monthly-plans'&&<main className='monthly-production-page'>");
const pageEnd=pageStart<0?-1:source.indexOf("</main>}",pageStart);
if(pageStart<0||pageEnd<0)throw new Error('Could not locate the Monthly Plan page; refusing to publish a partial layout.');

const replaceOnce=(input,oldText,newText,label)=>{
 const count=input.split(oldText).length-1;
 if(count!==1)throw new Error(label+': expected one source match, found '+count+'.');
 return input.replace(oldText,newText);
};

// Suggestions are sourced from existing Monthly and Production Plans; users can still type a new value.
if(!source.includes('const monthlyBrandOptions=')){
 const helpers=[
  "const monthlyBrandOptions=[...new Set([...monthlyPlans.map(row=>row.brand),...plans.map(row=>row.brand)].map(value=>String(value||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));",
  "const monthlyProductOptions=[...new Set([...monthlyPlans.filter(row=>!monthlyForm.brand||row.brand===monthlyForm.brand).map(row=>row.product_name),...plans.filter(row=>!monthlyForm.brand||row.brand===monthlyForm.brand).map(row=>row.product_name)].map(value=>String(value||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));",
  "const monthlyModelOptions=[...new Set([...monthlyPlans.filter(row=>(!monthlyForm.brand||row.brand===monthlyForm.brand)&&(!monthlyForm.product_name||row.product_name===monthlyForm.product_name)).map(row=>row.model),...plans.filter(row=>(!monthlyForm.brand||row.brand===monthlyForm.brand)&&(!monthlyForm.product_name||row.product_name===monthlyForm.product_name)).map(row=>row.model)].map(value=>String(value||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));",
  "const monthlyInventorySummary=[...monthlyPlans.reduce((groups,plan)=>{const brand=String(plan.brand||'Unspecified').trim()||'Unspecified',product=String(plan.product_name||'Unspecified').trim()||'Unspecified',key=brand.toLocaleLowerCase()+'::'+product.toLocaleLowerCase();let row=groups.get(key);if(!row){row={brand,product,models:new Set(),plans:0,total:0,planned:0,actual:0};groups.set(key,row);}if(String(plan.model||'').trim())row.models.add(String(plan.model).trim());row.plans+=1;row.total+=Math.max(0,Number(plan.total_qty||0));row.planned+=Math.max(0,Number(planningMetrics.monthly?.[plan.id]?.planned||0));row.actual+=Math.max(0,Number(planningMetrics.monthly?.[plan.id]?.actual||0));return groups;},new Map()).values()].map(row=>({...row,modelCount:row.models.size,available:Math.max(0,row.total-row.planned)})).sort((a,b)=>a.brand.localeCompare(b.brand)||a.product.localeCompare(b.product));",
  "const monthlyInventoryBrandCount=new Set(monthlyInventorySummary.map(row=>row.brand)).size;",
  "const monthlyInventoryProductCount=monthlyInventorySummary.length;",
  "const monthlyInventoryTotalQuantity=monthlyInventorySummary.reduce((sum,row)=>sum+row.total,0);",
  "const monthlyInventoryPlanned=monthlyInventorySummary.reduce((sum,row)=>sum+row.planned,0);",
  "const monthlyInventoryActual=monthlyInventorySummary.reduce((sum,row)=>sum+row.actual,0);"
 ].join('\n');
 source=replaceOnce(source,"const navAnchor=",helpers+"\nconst navAnchor=","Monthly option and summary helpers");
}

// Use dropdown suggestions from actual stored data, with new entries still allowed.
source=replaceOnce(source,
 "<label>Brand<input value={monthlyForm.brand} onChange={e=>setMonthlyForm({...monthlyForm,brand:e.target.value})} placeholder='Brand'/></label>",
 "<label>Brand<input list='monthly-brand-options' value={monthlyForm.brand} onChange={e=>setMonthlyForm({...monthlyForm,brand:e.target.value,product_name:'',model:''})} placeholder='Choose or enter brand'/><datalist id='monthly-brand-options'>{monthlyBrandOptions.map(value=><option key={value} value={value}/>)}</datalist></label>",
 "Brand dropdown");
source=replaceOnce(source,
 "<label>Product<input value={monthlyForm.product_name} onChange={e=>setMonthlyForm({...monthlyForm,product_name:e.target.value})} placeholder='Product name'/></label>",
 "<label>Product<input list='monthly-product-options' value={monthlyForm.product_name} onChange={e=>setMonthlyForm({...monthlyForm,product_name:e.target.value,model:''})} placeholder='Choose or enter product'/><datalist id='monthly-product-options'>{monthlyProductOptions.map(value=><option key={value} value={value}/>)}</datalist></label>",
 "Product dropdown");
source=replaceOnce(source,
 "<label>Model<input value={monthlyForm.model} onChange={e=>setMonthlyForm({...monthlyForm,model:e.target.value})} placeholder='Model / SKU'/></label>",
 "<label>Model<input list='monthly-model-options' value={monthlyForm.model} onChange={e=>setMonthlyForm({...monthlyForm,model:e.target.value})} placeholder='Choose or enter model'/><datalist id='monthly-model-options'>{monthlyModelOptions.map(value=><option key={value} value={value}/>)}</datalist></label>",
 "Model dropdown");

// Monthly Plan labels use Quantity for counts; internal serial-number identifiers remain unchanged for traceability.
const copyReplacements=[
 ["MONTHLY SERIAL POOLS","MONTHLY QUANTITY POOLS"],
 ["Upload Serial PDF","Upload Quantity File"],
 ["serial PDFs","quantity files"],
 ["serial PDF","quantity file"],
 ["serial-label pairs","label and item-code entries"],
 ["serial label pairs","label and item-code entries"],
 ["unique serials ready","unique quantity entries ready"],
 ["unique serials","quantity units"],
 ["existing serials skipped","existing entries skipped"],
 ["additional serials can still be updated","additional quantity entries can still be added"],
 ["serials are already allocated","quantity units are already allocated"],
 ["serial sequence","entry order"],
 ["additional serials","additional quantity entries"],
 ["No new serials were added. All uploaded serials already exist.","No new quantity entries were added because the uploaded item codes already exist."],
 ["serials added.","quantity units added."],
 ["serials reserved","quantity units reserved"],
 ["serials allocated","quantity units allocated"],
 ["monthly serial pool","monthly quantity pool"],
 ["Monthly plan owns the serial pool.","Monthly Plan tracks available quantity and its product identifiers."],
 ["Edit Plan / Add quantity","Edit Plan / Add Quantity"],
 ["Add Serials","Add Quantity"]
];
for(const pair of copyReplacements)source=source.replaceAll(pair[0],pair[1]);

// Add summary KPIs and a grouped brand/product table to the top of the pool panel.
const summaryMarkup="<div className='monthly-inventory-overview'><div className='monthly-inventory-overview-head'><div><span className='eyebrow'>BRAND & PRODUCT WISE COUNT</span><h4>Quantity overview</h4><p>Totals from all created Monthly Plans. Planned means quantity reserved by Daily Plans; Actual updates from operator scans.</p></div></div><div className='monthly-inventory-kpis'><div><span>Monthly Plans</span><strong>{monthlyPlans.length.toLocaleString()}</strong></div><div><span>Brands</span><strong>{monthlyInventoryBrandCount.toLocaleString()}</strong></div><div><span>Products</span><strong>{monthlyInventoryProductCount.toLocaleString()}</strong></div><div><span>Total Quantity</span><strong>{monthlyInventoryTotalQuantity.toLocaleString()}</strong></div></div><div className='monthly-summary-table-wrap'><table className='monthly-summary-table'><thead><tr><th>Brand</th><th>Product</th><th>Models</th><th>Plans</th><th>Total Qty</th><th>Planned</th><th>Actual</th><th>Available</th></tr></thead><tbody>{monthlyInventorySummary.length?monthlyInventorySummary.map(row=><tr key={row.brand+'::'+row.product}><td><strong>{row.brand}</strong></td><td>{row.product}</td><td>{row.modelCount.toLocaleString()}</td><td>{row.plans.toLocaleString()}</td><td><strong>{row.total.toLocaleString()}</strong></td><td>{row.planned.toLocaleString()}</td><td>{row.actual.toLocaleString()}</td><td><strong>{row.available.toLocaleString()}</strong></td></tr>):<tr><td colSpan='8'>No Monthly Plans yet. Create a plan below to start this overview.</td></tr>}</tbody></table></div></div>";
if(!source.includes("className='monthly-inventory-overview'")){
 source=replaceOnce(source,"<button onClick={()=>void loadMonthlyPlans()}>↻ Refresh</button></div>",
 "<button onClick={()=>void loadMonthlyPlans()}>↻ Refresh</button></div>\n  "+summaryMarkup,
 "Monthly quantity overview");
}

// Pool first, creation form second, Monthly Production Control banner below the form.
const start=source.indexOf("{view==='monthly-plans'&&<main className='monthly-production-page'>");
const end=source.indexOf("</main>}",start);
let page=source.slice(start,end);
const extract=(pattern,label)=>{
 const match=page.match(pattern);
 if(!match)throw new Error('Could not find '+label+' section to reorder.');
 page=page.replace(match[0],'');
 return match[0];
};
const hero=extract(/<section className='monthly-hero'>[\s\S]*?<\/section>/,'Monthly Production Control');
const form=extract(/<section className='panel monthly-create-panel'>[\s\S]*?<\/section>/,'Create Monthly Plan');
const pool=extract(/<section className='panel monthly-list-panel'>[\s\S]*?<\/section>/,'Existing Monthly Plans');
const ruleIndex=page.indexOf("<section className='monthly-rule-note'>");
if(ruleIndex<0)throw new Error('Monthly workflow note section not found after reordering.');
page=page.slice(0,ruleIndex)+"\n "+pool+"\n "+form+"\n "+hero+"\n "+page.slice(ruleIndex);
source=source.slice(0,start)+page+source.slice(end);

const cssFile='src/monthly-production.css';
if(!fs.existsSync(cssFile))throw new Error('Monthly stylesheet was not generated before the layout finalizer.');
let css=fs.readFileSync(cssFile,'utf8');
if(!css.includes('monthly-plan-layout-v2')){
 css += "\n/* monthly-plan-layout-v2 */\n"+
 ".monthly-production-page{display:flex;flex-direction:column;gap:20px;max-width:1600px}\n"+
 ".monthly-production-page>.monthly-list-panel{order:1}\n"+
 ".monthly-production-page>.monthly-create-panel{order:2}\n"+
 ".monthly-production-page>.monthly-hero{order:3}\n"+
 ".monthly-hero h2{color:#fff!important;line-height:1.2}\n"+
 ".monthly-hero .eyebrow{color:#a9bddb!important}\n"+
 ".monthly-plan-card{grid-template-columns:minmax(210px,1.05fr) minmax(280px,1.2fr) minmax(210px,auto);gap:24px;padding:22px 24px;cursor:default}\n"+
 ".monthly-plan-card>div{min-width:0}\n"+
 ".monthly-plan-card h3{line-height:1.3;overflow-wrap:anywhere}\n"+
 ".monthly-plan-card p{line-height:1.5}\n"+
 ".monthly-plan-qty{text-align:left;min-width:0;width:100%}\n"+
 ".monthly-plan-qty>strong{font-size:28px;line-height:1.2}\n"+
 ".planning-metric-line{justify-content:flex-start;gap:14px;margin:7px 0}\n"+
 ".monthly-completion{min-width:0;max-width:420px}\n"+
 ".monthly-plan-actions{align-content:center;align-items:center;justify-content:flex-end;gap:8px;min-width:0;flex-wrap:wrap}\n"+
 ".monthly-plan-actions button{white-space:normal;line-height:1.3}\n"+
 ".monthly-inventory-overview{padding:18px 0 8px;display:grid;gap:14px}\n"+
 ".monthly-inventory-overview-head h4{margin:5px 0;font-size:17px}\n"+
 ".monthly-inventory-overview-head p{margin:0;color:#64748b;font-size:13px;line-height:1.5}\n"+
 ".monthly-inventory-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}\n"+
 ".monthly-inventory-kpis>div{border:1px solid #e1e8f2;background:#f8fafc;border-radius:13px;padding:13px 15px;display:grid;gap:5px;min-width:0}\n"+
 ".monthly-inventory-kpis span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:800}\n"+
 ".monthly-inventory-kpis strong{font-size:23px;color:#172033;overflow-wrap:anywhere}\n"+
 ".monthly-summary-table-wrap{width:100%;overflow-x:auto;border:1px solid #e2e8f0;border-radius:13px}\n"+
 ".monthly-summary-table{width:100%;border-collapse:collapse;min-width:740px;background:#fff;font-size:12px}\n"+
 ".monthly-summary-table th{background:#f8fafc;color:#64748b;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:12px 14px;white-space:nowrap}\n"+
 ".monthly-summary-table td{padding:12px 14px;border-top:1px solid #edf1f6;color:#334155}\n"+
 ".monthly-summary-table tbody tr:hover{background:#f8fbff}\n"+
 ".monthly-production-page .monthly-upload-row{grid-template-columns:minmax(260px,1fr) 150px auto;gap:14px}\n"+
 ".monthly-production-page .monthly-upload-box{min-width:0}\n"+
 "@media(max-width:1100px){.monthly-plan-card{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.monthly-plan-actions{grid-column:1/-1;justify-content:flex-start}.monthly-inventory-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}\n"+
 "@media(max-width:640px){.monthly-production-page{padding:14px}.monthly-plan-card{grid-template-columns:minmax(0,1fr);padding:16px}.monthly-plan-actions{grid-column:auto;justify-content:flex-start}.monthly-inventory-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.monthly-production-page .monthly-upload-row{grid-template-columns:minmax(0,1fr)}.monthly-production-page .monthly-upload-row>.primary,.monthly-production-page .monthly-upload-row>button{grid-column:auto}.monthly-hero h2{font-size:25px}}\n";
}
fs.writeFileSync(cssFile,css);
if(source===original)console.log('Monthly Plan layout already up to date.');
else fs.writeFileSync(file,source);
if(!source.includes("className='monthly-inventory-overview'")||!source.includes("list='monthly-brand-options'")||!source.includes("Edit Plan / Add Quantity"))throw new Error('Monthly Plan layout verification failed.');
if(!(source.indexOf("<section className='panel monthly-list-panel'>")<source.indexOf("<section className='panel monthly-create-panel'>")&&source.indexOf("<section className='panel monthly-create-panel'>")<source.indexOf("<section className='monthly-hero'>")))throw new Error('Monthly page order verification failed.');
console.log('Monthly Plan layout, data-backed option suggestions, summary table and terminology verified.');
