import fs from 'node:fs';

const appFile='src/App.jsx';
const cssFile='src/global-ui-ux.css';
let source=fs.readFileSync(appFile,'utf8');

if(!source.includes("import './global-ui-ux.css';")){
 const importAnchor="import './dashboard-live.css';";
 if(source.includes(importAnchor))source=source.replace(importAnchor,importAnchor+"\nimport './global-ui-ux.css';");
 else {
  const supabaseImport="import {supabase} from './lib/supabase';";
  if(!source.includes(supabaseImport))throw new Error('Could not find a stable App import location for the global UI stylesheet.');
  source=source.replace(supabaseImport,supabaseImport+"\nimport './global-ui-ux.css';");
 }
}


/* Remove four read-only product pseudo-inputs from the Daily Plan form.
   Keep only the editable schedule selectors, and present inherited Monthly Plan
   details once as a compact read-only context strip. */
const oldDailyFields=[
"   <label>Brand<input value={form.brand} readOnly/></label>",
"   <label>Product<input value={form.product_name} readOnly/></label>",
"   <label>Model<input value={form.model} readOnly/></label>",
"   <label>MRP<input value={dailyMonthlyPlans.find(plan=>plan.id===dailyMonthlyPlanId)?'₹ '+Number(dailyMonthlyPlans.find(plan=>plan.id===dailyMonthlyPlanId).mrp||0).toLocaleString('en-IN'):''} readOnly/></label>",
"   <label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(line=><option key={line}>{line}</option>)}</select></label>",
"  </div>"
].join('\n');
const newDailyFields=[
"   <label>Production line<select value={form.production_line} onChange={e=>setForm({...form,production_line:e.target.value})}>{lines.map(line=><option key={line}>{line}</option>)}</select></label>",
"  </div>",
"  <div className='daily-product-context' aria-label='Selected Monthly Plan details'>",
"   <div><span>Brand</span><strong>{form.brand||'—'}</strong></div>",
"   <div><span>Product</span><strong>{form.product_name||'—'}</strong></div>",
"   <div><span>Model</span><strong>{form.model||'—'}</strong></div>",
"   <div><span>MRP</span><strong>{dailyMonthlyPlans.find(plan=>plan.id===dailyMonthlyPlanId)?'₹ '+Number(dailyMonthlyPlans.find(plan=>plan.id===dailyMonthlyPlanId).mrp||0).toLocaleString('en-IN'):'—'}</strong></div>",
"  </div>"
].join('\n');
if(source.includes(oldDailyFields)){
 source=source.replace(oldDailyFields,newDailyFields);
}else if(!source.includes("className='daily-product-context'")){
 throw new Error('Daily Plan inherited product fields were not found; layout finalizer stopped safely.');
}
const duplicateDailyMetric="<div><span>Daily planned</span><strong>{Number(form.planned_qty||0).toLocaleString()}</strong></div>";
source=source.replace(duplicateDailyMetric,'');
const verboseAllocationNote="<div className='daily-rule-note'><strong>Serial allocation:</strong> {dailyAvailableQty.toLocaleString()} monthly serials are currently available. Creating this daily plan reserves exactly {Number(form.planned_qty||0).toLocaleString()} serials. The remaining quantity stays in the monthly pool for a future daily plan.</div>";
const conciseAllocationNote="<div className='daily-rule-note'><strong>Serial allocation:</strong> Creating this plan reserves the entered quantity from the selected Monthly Plan. Any unallocated quantity remains available for future Daily Plans.</div>";
const dailyHeroCardPattern=/<div className='daily-hero-card'>[\s\S]*?<\/div>/;
if(dailyHeroCardPattern.test(source))source=source.replace(dailyHeroCardPattern,'');
const dailyRuleNotePattern=/<div className='daily-rule-note'>[\s\S]*?<\/div>/;
if(dailyRuleNotePattern.test(source))source=source.replace(dailyRuleNotePattern,conciseAllocationNote);
else if(source.includes('className=\'daily-rule-note\''))throw new Error('Daily Plan allocation note could not be simplified safely.');

const css=String.raw`
/* global-ui-ux-v1 — consistent page rhythm, forms and production Live View */
:root{--ui-ink:#17243a;--ui-muted:#667991;--ui-border:#dce5f0;--ui-soft:#f5f8fc;--ui-blue:#245fca;--ui-green:#087b4d}
.app:not(.app-operator){max-width:1840px;width:100%;padding:18px clamp(14px,2.2vw,34px) 32px}
.app:not(.app-operator)>header{position:sticky;top:0;z-index:100;min-height:64px;margin:0 0 18px;padding:10px 0;background:rgba(244,247,251,.96);backdrop-filter:blur(12px);border-bottom:1px solid #dce5f0}
.app:not(.app-operator)>header h1{margin:2px 0;font-size:clamp(25px,2.1vw,32px);line-height:1.1;color:#101e34}
.app:not(.app-operator)>header .eyebrow{font-size:9px;letter-spacing:.16em}
.app:not(.app-operator) .top-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;min-width:0}
.app:not(.app-operator) .top-actions .nav-button{padding:9px 11px;border:1px solid transparent;border-radius:9px;background:transparent;color:#44556e;font-size:11px;font-weight:850;white-space:nowrap}
.app:not(.app-operator) .top-actions .nav-button:hover{background:#fff;border-color:#dbe4ef}
.app:not(.app-operator) .top-actions .nav-button.is-active{background:#eaf2ff;border-color:#bcd2f8;color:#174fae;box-shadow:0 1px 2px rgba(23,79,174,.06)}
.app:not(.app-operator) .top-actions .live{font-size:10px;letter-spacing:.05em;margin-right:8px;white-space:nowrap}
.dashboard-page,.live-monitoring-page,.manage-production-page,.daily-production-page,.monthly-production-page,.reports-page,.user-admin-page,.rw-page,.planner-panel{width:100%;max-width:1760px;margin-inline:auto}
.dashboard-page,.live-monitoring-page,.manage-production-page,.daily-production-page,.monthly-production-page,.reports-page,.user-admin-page,.rw-page{display:flex;flex-direction:column;gap:16px}
.dashboard-page>.panel,.live-monitoring-page>.panel,.manage-production-page>.panel{margin-top:0}
.app:not(.app-operator) .panel{border:1px solid var(--ui-border);border-radius:15px;box-shadow:0 3px 12px rgba(15,23,42,.035)}
.app:not(.app-operator) .panel-head{align-items:center;gap:14px;margin-bottom:14px}
.app:not(.app-operator) .panel-head h2,.app:not(.app-operator) .panel-head h3{color:var(--ui-ink)}
.app:not(.app-operator) .eyebrow{color:#6b7d97;font-size:9px;letter-spacing:.13em}
.app:not(.app-operator) label{min-width:0}
.app:not(.app-operator) input:not([type='checkbox']):not([type='radio']):not([type='file']),.app:not(.app-operator) select,.app:not(.app-operator) textarea{box-sizing:border-box;max-width:100%;min-width:0;border:1px solid #d4deea;border-radius:9px;background:#fff;color:#17243a;font:inherit;font-size:12px;line-height:1.35;outline:none}
.app:not(.app-operator) input:not([type='checkbox']):not([type='radio']):not([type='file']),.app:not(.app-operator) select{min-height:41px;padding:9px 11px}
.app:not(.app-operator) textarea{padding:10px 11px;resize:vertical}
.app:not(.app-operator) input:focus,.app:not(.app-operator) select:focus,.app:not(.app-operator) textarea:focus{border-color:#83a8e6;box-shadow:0 0 0 3px rgba(37,99,235,.09)}
.app:not(.app-operator) input:disabled,.app:not(.app-operator) select:disabled,.app:not(.app-operator) textarea:disabled{background:#f2f5f9;color:#8997aa;cursor:not-allowed}
.app:not(.app-operator) button{transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.app:not(.app-operator) button:focus-visible{outline:3px solid rgba(37,99,235,.25);outline-offset:2px}
.app:not(.app-operator) button:disabled{opacity:.55;cursor:not-allowed;transform:none}
.app:not(.app-operator) .primary{background:#142139;border-color:#142139;color:#fff;border-radius:9px;font-weight:900}
.app:not(.app-operator) .primary:hover:not(:disabled){background:#203454;border-color:#203454}
.app:not(.app-operator) .notice,.app:not(.app-operator) .inline-alert{line-height:1.5;border-radius:9px}
.app:not(.app-operator) .badge,.app:not(.app-operator) .plan-status-badge{white-space:nowrap}

/* Daily Plan: one ordered product/schedule block, followed by shift settings and hourly slots. */
.daily-production-page{gap:15px}
.daily-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;border:1px solid #dce5f0;border-radius:15px;background:linear-gradient(110deg,#fff 0%,#f5f9ff 100%)}
.daily-hero h2{margin:4px 0 5px;font-size:25px;color:#14243c}
.daily-hero p{max-width:850px;margin:0;color:#64758e;font-size:12px;line-height:1.55}
.daily-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.daily-summary-card{padding:13px 15px;border-radius:12px}
.daily-form-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.daily-product-summary{grid-template-columns:repeat(4,minmax(0,1fr))}
.daily-product-context{display:grid;grid-column:1/-1;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:2px}
.daily-product-context>div{min-width:0;padding:11px 13px;border:1px solid #e3ebf5;border-radius:10px;background:#f7faff}
.daily-product-context span{display:block;color:#7889a1;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
.daily-product-context strong{display:block;margin-top:5px;color:#223958;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
.daily-capacity-summary{grid-template-columns:repeat(3,minmax(0,1fr))}

.daily-shift-card{gap:14px;padding:17px 18px}
.daily-shift-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
.daily-shift-grid label,.daily-form-grid label,.daily-notes-field{display:flex;flex-direction:column;gap:6px;color:#52627a;font-size:10px;font-weight:850}
.daily-production-page .hourly-target-grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.daily-production-page .hour-target-field{min-width:0;padding:11px;border-radius:10px}
.daily-production-page .hour-target-field input{width:100%}
.daily-shift-summary{grid-template-columns:repeat(4,minmax(0,1fr))}
.daily-plan-panel{padding:19px}
.daily-plan-panel-head{gap:14px}
.daily-plan-form-body{gap:17px}

/* Monthly Plan: title first, create/update form second, saved pools third. */
.monthly-production-page{gap:15px}
.monthly-production-page>.monthly-hero{order:0}
.monthly-production-page>.monthly-create-panel{order:1}
.monthly-production-page>.monthly-list-panel{order:2}
.monthly-production-page>.monthly-rule-note{order:3}
.monthly-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:19px 22px}
.monthly-hero h2{font-size:25px;line-height:1.2}
.monthly-hero p{max-width:840px;font-size:12px;line-height:1.55}
.monthly-create-panel,.monthly-list-panel{padding:18px 20px}
.monthly-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.monthly-form-grid label{display:flex;flex-direction:column;gap:6px;color:#52627a;font-size:10px;font-weight:850}
.monthly-upload-row{grid-template-columns:minmax(240px,1fr) minmax(130px,170px) auto;gap:12px;align-items:stretch}
.monthly-upload-box{min-width:0}
.monthly-plan-list{gap:10px}
.monthly-plan-card{grid-template-columns:minmax(190px,1.2fr) minmax(190px,.8fr) minmax(240px,1fr);gap:17px;padding:17px}
.monthly-plan-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
.monthly-inventory-overview{padding-top:14px}

/* Manage Production: date range, month, model and line; status/action controls after filters. */
.manage-production-page{gap:14px}
.management-title-bar{margin:0;padding:4px 0 3px}
.management-title-bar h2{font-size:25px}
.management-advanced-filters{padding:15px 17px}
.management-advanced-grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:11px}
.management-advanced-grid label,.management-filter-bar label{display:flex;flex-direction:column;gap:5px;min-width:0;color:#52627a;font-size:10px;font-weight:850}
.management-filter-bar{min-height:50px}
.management-table-panel{margin:0;padding:0}
.management-table-wrap{border-radius:11px}
.management-table th,.management-table td{padding:12px 13px}
.table-actions{display:flex;gap:6px;flex-wrap:wrap}
.table-actions button{white-space:nowrap}

/* Reports, Rework and User Roles share the same filter/form rhythm. */
.reports-page,.rw-page,.user-admin-page{gap:15px}
.reports-title-bar,.rw-page-head,.user-admin-heading{margin:0}
.report-filter-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
.report-filter-grid label,.rw-filter-grid label,.user-admin-page label{display:flex;flex-direction:column;gap:6px;min-width:0}
.rw-filter-grid{grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(135px,1fr));gap:11px}
.user-admin-page .user-admin-card{padding:17px}
.user-admin-page .user-admin-card-heading{margin-bottom:12px}
.user-admin-page .user-admin-card .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}

/* Live View: widen the working area and make the line-by-line/hourly picture dominant. */
.live-monitoring-page{max-width:1800px;gap:15px}
.monitoring-hero{position:relative;align-items:center;padding:19px 23px;margin:0;border:1px solid #1d3558;background:linear-gradient(112deg,#13243f 0%,#1e3d67 100%);color:#fff;box-shadow:0 7px 22px rgba(16,37,68,.13)}
.monitoring-hero h2{margin:4px 0 5px;color:#fff;font-size:27px}
.monitoring-hero .eyebrow{color:#b8c9e2}
.monitoring-hero p{max-width:860px;color:#d2deee;font-size:12px}
.monitoring-live-status{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:9px 11px;border:1px solid rgba(187,247,208,.35);border-radius:10px;background:rgba(255,255,255,.08);color:#a7f3c8;font-size:10px;font-weight:950;white-space:nowrap}
.monitoring-live-status>span{color:#e2eaf5}
.monitoring-live-status button{border-color:rgba(255,255,255,.24)!important;background:rgba(255,255,255,.1)!important;color:#fff!important}
.live-quantity-panel{padding:21px 22px;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,.05)}
.live-quantity-heading{align-items:center;margin-bottom:16px}
.live-quantity-heading h3{font-size:20px;color:#172a49}
.live-quantity-heading p{font-size:12px}
.live-quantity-kpis{gap:12px;margin-bottom:16px}
.live-quantity-kpis>div{padding:15px 16px;border-radius:12px;background:#f7faff}
.live-quantity-kpis span{font-size:10px;letter-spacing:.04em;text-transform:uppercase}
.live-quantity-kpis strong{font-size:clamp(22px,2vw,30px);line-height:1.1}
.live-quantity-table{min-width:820px;font-size:12px}
.live-quantity-table th{padding:12px 14px;font-size:9px}
.live-quantity-table td{padding:12px 14px}
.live-quantity-progress>div{width:105px;height:8px}
.live-line-panel{margin:0;padding:20px 21px;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,.05)}
.live-line-panel .panel-head h3{font-size:19px}
.live-line-panel .refresh-caption{font-size:11px;color:#71829a}
.line-monitor-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.line-monitor-card{padding:19px 20px;border:1px solid #dbe5f0;border-radius:14px;background:#fff;box-shadow:0 3px 12px rgba(15,23,42,.035)}
.line-monitor-head strong{font-size:14px}
.line-monitor-head .badge{font-size:9px;padding:5px 8px}
.line-monitor-percent{margin:16px 0 10px;font-size:46px;line-height:1;color:#17243a}
.line-monitor-counts{gap:10px;margin-top:14px;padding:10px 11px;border:1px solid #e8eef5;border-radius:10px;background:#f8fbff}
.line-monitor-counts span{font-size:10px}
.line-monitor-counts b{font-size:15px}
.line-plan-hourly{margin-top:17px;padding-top:15px}
.line-plan-hourly-heading strong{font-size:13px}
.line-plan-hourly-heading span{font-size:10px}
.line-plan-hourly-heading>small{font-size:10px;padding:5px 7px}
.line-plan-chart-legend{font-size:10px}
.line-plan-hourly-chart{min-height:165px;gap:7px}
.line-plan-hourly-column{min-width:28px;max-width:62px}
.line-plan-hourly-values{font-size:10px}
.line-plan-hourly-bars{height:108px}
.line-plan-hourly-bars i{max-width:14px}
.line-plan-hourly-column>small{font-size:9px}
.live-activity-panel{margin:0;padding:19px 21px;border-radius:16px}
.live-activity-panel h3{font-size:18px}
.live-activity-table{min-width:900px;font-size:11px}
.live-activity-table th{padding:12px 13px}
.live-activity-table td{padding:12px 13px}
.live-activity-empty{padding:22px}
.dashboard-footer{margin-top:0;padding:9px 2px;color:#73849b;font-size:10px}

/* Keep the scan-first Operator viewport compact, while normal app pages scroll naturally. */
.app-operator .operator-workstation-grid{grid-template-columns:minmax(0,1.04fr) minmax(390px,.96fr)}
.app-operator .operator-recent-scans{flex:1 1 auto;min-height:110px;overflow:auto}
.app-operator .operator-recent-scans-heading{flex:0 0 auto}
.app-operator .operator-qc-trigger{min-height:45px;margin:7px 0}
.app-operator .operator-qc-trigger strong{font-size:11px}
.app-operator .operator-qc-trigger small{font-size:9px}
.app-operator .operator-scan-input-panel{gap:5px}
.app-operator .operator-recent-list{min-height:65px;overflow:auto}
.app-operator .operator-workstation-side{overflow:auto}

/* Responsive page layouts */
@media(max-width:1250px){
 .app:not(.app-operator)>header{align-items:flex-start;flex-direction:column;gap:9px}
 .app:not(.app-operator) .top-actions{justify-content:flex-start;width:100%;overflow-x:auto;flex-wrap:nowrap;padding:1px 0 5px}
 .management-advanced-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
 .monthly-plan-card{grid-template-columns:minmax(0,1fr) minmax(0,.8fr)}
 .monthly-plan-actions{grid-column:1/-1;justify-content:flex-start}
}
@media(max-width:1050px){
 .daily-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .daily-shift-grid,.monthly-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .daily-production-page .hourly-target-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
 .report-filter-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
 .line-monitor-grid{grid-template-columns:1fr}
 .line-plan-hourly-chart{min-height:150px}
 .line-plan-hourly-bars{height:96px}
}
@media(max-width:760px){
 .app:not(.app-operator){padding:12px 12px 24px}
 .app:not(.app-operator)>header{position:relative;top:auto;margin-bottom:13px}
 .app:not(.app-operator) .top-actions .nav-button{padding:8px 9px;font-size:10px}
 .monitoring-hero{align-items:flex-start;flex-direction:column;padding:16px}
 .monitoring-hero h2{font-size:23px}
 .monitoring-live-status{white-space:normal}
 .live-quantity-panel,.live-line-panel,.live-activity-panel{padding:14px}
 .live-quantity-heading{align-items:flex-start;flex-direction:column}
 .live-quantity-controls{width:100%;align-items:flex-start}
 .live-quantity-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
 .line-monitor-grid{grid-template-columns:1fr}
 .daily-form-grid,.daily-shift-grid,.monthly-form-grid,.management-advanced-grid,.report-filter-grid,.rw-filter-grid,.user-admin-page .user-admin-card .grid{grid-template-columns:1fr}
 .daily-summary-grid,.daily-product-summary,.daily-product-context,.daily-capacity-summary,.daily-shift-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
 .daily-production-page .hourly-target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .monthly-upload-row{grid-template-columns:1fr}
 .monthly-plan-card{grid-template-columns:1fr}
 .monthly-plan-actions{grid-column:auto;justify-content:flex-start}
 .reports-title-bar,.rw-page-head,.management-title-bar{align-items:flex-start;flex-direction:column}
 .management-filter-bar{align-items:stretch;flex-wrap:wrap}
 .management-filter-bar label{width:100%}
 .app-operator .operator-workstation-grid{grid-template-columns:minmax(0,1fr) minmax(300px,.85fr)}
}
@media(max-width:520px){
 .daily-summary-grid,.daily-product-summary,.daily-product-context,.daily-capacity-summary,.daily-shift-summary{grid-template-columns:1fr 1fr}
 .daily-shift-grid{grid-template-columns:1fr}
 .daily-production-page .hourly-target-grid{grid-template-columns:1fr 1fr}
 .live-quantity-kpis{grid-template-columns:1fr 1fr}
 .line-monitor-percent{font-size:40px}
 .management-filter-bar>div{margin-right:0}
 .app-operator .operator-workstation-grid{grid-template-columns:1fr;overflow:auto}
 .app-operator .operator-scan-input-panel,.app-operator .operator-workstation-side{min-height:420px;overflow:visible}
}
@media(prefers-reduced-motion:reduce){
 .app:not(.app-operator) button{transition:none}
}
`;
fs.writeFileSync(cssFile,css);
if(!source.includes("import './global-ui-ux.css';"))throw new Error('Global UI stylesheet import is missing.');
if(!source.includes('live-quantity-panel')||!source.includes('live-line-panel')||!source.includes('LIVE SCAN ACTIVITY'))throw new Error('Live View must contain product quantity, line/hourly and scan activity sections.');
if(!source.includes("className='daily-form-grid'")||!source.includes("className='monthly-form-grid'")||!source.includes("className='management-advanced-grid'"))throw new Error('A production form layout section is missing.');
if(source.includes("view==='dashboard'"))throw new Error('Legacy Dashboard route should remain removed.');
fs.writeFileSync(appFile,source);
console.log('Global Pro Scan UI system applied: consistent shell, ordered forms, Monthly Plan heading restored to top, enlarged Live View and responsive scanner layout.');
