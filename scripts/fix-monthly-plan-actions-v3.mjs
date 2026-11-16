import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const start=source.indexOf("<div className='monthly-table-actions'");
if(start<0)throw new Error('Monthly Plan action container was not found.');
const close=source.indexOf("</div>",start);
if(close<0)throw new Error('Monthly Plan action container is incomplete.');

const directActions="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);window.setTimeout(()=>document.querySelector('.monthly-create-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title={monthlyLockedIds.has(String(plan.id))?'Locked: Daily Plan already created':'Remove Monthly Plan'} aria-label='Remove Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();void deleteMonthlyPlan(plan);}} disabled={monthlyBusy||monthlyLockedIds.has(String(plan.id))}>⌫</button></div>";

source=source.slice(0,start)+directActions+source.slice(close+6);
if(source===original)throw new Error('Monthly Plan action handler was not updated.');
fs.writeFileSync(file,source);
console.log('Monthly Plan actions use direct React onClick handlers. Edit opens the form; delete remains protected while Daily Plans are allocated.');
