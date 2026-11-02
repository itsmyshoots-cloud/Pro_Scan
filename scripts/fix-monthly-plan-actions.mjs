import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const oldActions="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={()=>startEditMonthlyPlan(plan)} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan' onClick={()=>void deleteMonthlyPlan(plan)} disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0}>⌫</button></div>";
const newActions="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),0);}} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();void deleteMonthlyPlan(plan);}} disabled={monthlyBusy}>⌫</button></div>";

if(source.includes(oldActions)){
  source=source.replace(oldActions,newActions);
  console.log('Monthly Plan action buttons patched.');
}else if(source.includes("onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);")&&source.includes("onClick={event=>{event.preventDefault();event.stopPropagation();void deleteMonthlyPlan(plan);}")){
  console.log('Monthly Plan action buttons are already patched.');
}else{
  throw new Error('Monthly Plan action-button anchor not found. Refusing to modify unrelated UI.');
}

if(!source.includes("setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),0)"))throw new Error('Monthly Edit action scroll behavior was not installed.');
if(source.includes("disabled={monthlyBusy||Number(planningMetrics.monthly?.[plan.id]?.planned||0)>0}"))throw new Error('Monthly Delete action is still silently disabled by planned quantity.');

if(source!==original)fs.writeFileSync(file,source);
