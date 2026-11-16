import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const actionsPattern=/<div className='monthly-table-actions'[^>]*>[\\s\\S]*?<\\/div>/;
const directActions="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);window.setTimeout(()=>document.querySelector('.monthly-create-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title={monthlyLockedIds.has(String(plan.id))?'Locked: Daily Plan already created':'Remove Monthly Plan'} aria-label='Remove Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();void deleteMonthlyPlan(plan);}} disabled={monthlyBusy||monthlyLockedIds.has(String(plan.id))}>⌫</button></div>";

if(actionsPattern.test(source)){
 source=source.replace(actionsPattern,directActions);
}else{
 throw new Error('Monthly Plan action container was not found. Refusing to modify unrelated UI.');
}

if(source===original)throw new Error('Monthly Plan action handler was not updated.');
fs.writeFileSync(file,source);
console.log('Monthly Plan actions use direct React onClick handlers. Edit opens the form; delete remains protected while Daily Plans are allocated.');
