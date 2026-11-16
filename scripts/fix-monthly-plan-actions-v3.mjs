import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const oldActions="<div className='monthly-table-actions' data-monthly-action-plan={plan.id}><button type='button' data-monthly-action='edit' data-monthly-plan-id={plan.id} title='Edit Monthly Plan' aria-label='Edit Monthly Plan'>✎</button><button type='button' data-monthly-action='delete' data-monthly-plan-id={plan.id} className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan'>⌫</button></div>";
const directActions="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);window.setTimeout(()=>document.querySelector('.monthly-create-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();void deleteMonthlyPlan(plan);}} disabled={monthlyBusy||monthlyLockedIds.has(String(plan.id))}>⌫</button></div>";

if(source.includes(oldActions)){
 source=source.replace(oldActions,directActions);
}else if(!source.includes("onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);window.setTimeout")){
 throw new Error('Monthly action markup did not match the expected v3 or direct-handler form. Refusing to modify unrelated UI.');
}

if(source.includes("document.addEventListener('click',handleMonthlyAction,true)")){
 const start=source.indexOf(" useEffect(()=>{\n  const handleMonthlyAction=");
 if(start>=0){
  const end=source.indexOf(" },[monthlyPlans]);\n",start);
  if(end<0)throw new Error('Could not safely locate obsolete monthly action listener.');
  source=source.slice(0,start)+source.slice(end+" },[monthlyPlans]);\n".length);
 }
}

if(source===original)console.log('Monthly Plan direct edit handlers already installed.');
else fs.writeFileSync(file,source);
console.log('Monthly Plan actions use direct React onClick handlers; edit scrolls to the form and delete retains allocation protection.');
