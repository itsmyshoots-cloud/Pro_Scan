import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const old="<div className='monthly-table-actions' onClickCapture={event=>{const button=event.target.closest('button[data-monthly-action]');if(!button)return;event.preventDefault();event.stopPropagation();const action=button.getAttribute('data-monthly-action');if(action==='edit'){startEditMonthlyPlan(plan);setTimeout(()=>document.querySelector('.monthly-create-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}else if(action==='delete'){void deleteMonthlyPlan(plan);}}}><button type='button' data-monthly-action='edit' title='Edit Monthly Plan' aria-label='Edit Monthly Plan'>✎</button><button type='button' data-monthly-action='delete' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan'>⌫</button></div>";
const next="<div className='monthly-table-actions' data-monthly-action-plan={plan.id}><button type='button' data-monthly-action='edit' data-monthly-plan-id={plan.id} title='Edit Monthly Plan' aria-label='Edit Monthly Plan'>✎</button><button type='button' data-monthly-action='delete' data-monthly-plan-id={plan.id} className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan'>⌫</button></div>";
if(!source.includes(old))throw new Error('Monthly v2 action markup not found. Refusing to modify unrelated UI.');
source=source.replace(old,next);

const hookMarker=" const loadMonthlyPlans=async()=>{";
const nativeHook=" useEffect(()=>{\n  const handleMonthlyAction=(event)=>{\n   const target=event.target;\n   const button=target instanceof Element?target.closest('button[data-monthly-action][data-monthly-plan-id]'):null;\n   if(!button)return;\n   const planId=button.getAttribute('data-monthly-plan-id');\n   const action=button.getAttribute('data-monthly-action');\n   const plan=monthlyPlans.find(item=>String(item.id)===String(planId));\n   if(!plan)return;\n   event.preventDefault();\n   event.stopPropagation();\n   if(action==='edit'){\n    startEditMonthlyPlan(plan);\n    window.setTimeout(()=>document.querySelector('.monthly-create-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),0);\n   }else if(action==='delete'){\n    void deleteMonthlyPlan(plan);\n   }\n  };\n  document.addEventListener('click',handleMonthlyAction,true);\n  return()=>document.removeEventListener('click',handleMonthlyAction,true);\n },[monthlyPlans]);\n";
if(!source.includes("document.addEventListener('click',handleMonthlyAction,true)")){
 if(!source.includes(hookMarker))throw new Error('Monthly loader hook anchor not found.');
 source=source.replace(hookMarker,nativeHook+hookMarker);
}

const cssFile='src/monthly-production.css';
if(fs.existsSync(cssFile)){
 let css=fs.readFileSync(cssFile,'utf8');
 if(!css.includes('monthly-actions-v3')){
  css += "\n/* monthly-actions-v3 */\n.monthly-table-actions{position:relative!important;z-index:20!important;pointer-events:auto!important}.monthly-table-actions button{position:relative!important;z-index:21!important;pointer-events:auto!important;cursor:pointer!important}\n";
  fs.writeFileSync(cssFile,css);
 }
}

if(source===original)throw new Error('No Monthly Plan action change was made.');
fs.writeFileSync(file,source);
console.log('Monthly Plan actions v3 installed: native document capture handler, explicit plan IDs, and pointer-event safety.');
