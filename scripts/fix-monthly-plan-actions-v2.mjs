import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const old="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();startEditMonthlyPlan(plan);setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),0);}} disabled={monthlyBusy}>✎</button><button type='button' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan' onClick={event=>{event.preventDefault();event.stopPropagation();void deleteMonthlyPlan(plan);}} disabled={monthlyBusy}>⌫</button></div>";

const next="<div className='monthly-table-actions' onClickCapture={event=>{const button=event.target.closest('button[data-monthly-action]');if(!button)return;event.preventDefault();event.stopPropagation();const action=button.getAttribute('data-monthly-action');if(action==='edit'){startEditMonthlyPlan(plan);setTimeout(()=>document.querySelector('.monthly-create-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}else if(action==='delete'){void deleteMonthlyPlan(plan);}}}><button type='button' data-monthly-action='edit' title='Edit Monthly Plan' aria-label='Edit Monthly Plan'>✎</button><button type='button' data-monthly-action='delete' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan'>⌫</button></div>";

if(source.includes(old)){
 source=source.replace(old,next);
}else if(source.includes("<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan'")){
 throw new Error('Monthly action markup exists but is not in the expected previous patched form. Refusing to guess.');
}else{
 throw new Error('Monthly table action markup not found. Refusing to modify unrelated UI.');
}

if(source===original)throw new Error('No Monthly Plan action change was made.');
fs.writeFileSync(file,source);
console.log('Monthly Plan actions v2 installed: capture-based handlers, no disabled state, reliable form scroll.');
