import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

// The v7 patch can miss its exact JSX anchor after upstream text normalization.
// Upgrade the plain Monthly Plan quantity block and fail the build if metrics are absent.
if(!source.includes("className='monthly-completion'")){
 const pattern=/<div className='monthly-plan-qty'><strong>\{Number\(plan\.total_qty\|\|0\)\.toLocaleString\(\)\}<\/strong><span>(?:quantity|serials|Serials|Quantity)<\/span><\/div>/;
 const count=(source.match(new RegExp(pattern.source,'g'))||[]).length;
 if(count!==1)throw new Error('Expected exactly one plain Monthly Plan quantity card to upgrade; found '+count+'. Refusing to build without monthly progress metrics.');
 const markup="<div className='monthly-plan-qty'><strong>{Number(plan.total_qty||0).toLocaleString()}</strong><span>quantity</span><div className='planning-metric-line'><span>Planned <b>{Number(planningMetrics.monthly?.[plan.id]?.planned||0).toLocaleString()}</b></span><span>Actual <b>{Number(planningMetrics.monthly?.[plan.id]?.actual||0).toLocaleString()}</b></span><span>Available <b>{Math.max(0,Number(plan.total_qty||0)-Number(planningMetrics.monthly?.[plan.id]?.planned||0)).toLocaleString()}</b></span></div><div className='monthly-completion'><div className='monthly-completion-heading'><span>Monthly completion</span><strong>{Number(plan.total_qty||0)>0?Math.min(100,Math.round(Number(planningMetrics.monthly?.[plan.id]?.actual||0)/Number(plan.total_qty||0)*100)):0}%</strong></div><div className='monthly-completion-track'><span style={{width:(Number(plan.total_qty||0)>0?Math.min(100,Math.round(Number(planningMetrics.monthly?.[plan.id]?.actual||0)/Number(plan.total_qty||0)*100)):0)+'%'}}/></div><small>{Number(planningMetrics.monthly?.[plan.id]?.actual||0).toLocaleString()} / {Number(plan.total_qty||0).toLocaleString()} scanned · {Number(plan.total_qty||0)>0&&Number(planningMetrics.monthly?.[plan.id]?.actual||0)>=Number(plan.total_qty||0)?'Completed':Number(planningMetrics.monthly?.[plan.id]?.actual||0)>0?'In progress':Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0?'Daily plan created':'Not started'}</small></div></div>";
 source=source.replace(pattern,markup);
}
for(const marker of ["planningMetrics.monthly?.[plan.id]?.planned","planningMetrics.monthly?.[plan.id]?.actual","className='monthly-completion'","className='monthly-completion-track'"]){
 if(!source.includes(marker))throw new Error('Monthly Plan progress metric is missing: '+marker);
}
if(!source.includes('planningMetricsRefreshRef.current'))throw new Error('Live-scan metric refresh binding is missing.');
fs.writeFileSync(file,source);
console.log(source===original?'Monthly Plan progress metrics already present and verified.':'Monthly Plan Planned/Actual/Available and completion progress added and verified.');
