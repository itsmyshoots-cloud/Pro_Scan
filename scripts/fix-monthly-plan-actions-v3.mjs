import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const start=source.indexOf("<div className='monthly-table-actions'");
if(start<0)throw new Error('Monthly Plan action container was not found.');
const close=source.indexOf("</div>",start);
if(close<0)throw new Error('Monthly Plan action container is incomplete.');

const directActions="<div className='monthly-table-actions'><button type='button' title='Edit Monthly Plan' aria-label='Edit Monthly Plan' onClick={()=>void openMonthlyPlanEditWithAllocationGuard(plan)}>✎</button>{plan.status==='active'&&<button type='button' className='is-cancel' title='Cancel Monthly Plan' aria-label='Cancel Monthly Plan' onClick={()=>void cancelMonthlyPlan(plan)}>Cancel</button>}<button type='button' className='is-remove' title='Remove Monthly Plan' aria-label='Remove Monthly Plan' onClick={()=>void deleteMonthlyPlan(plan)}>⌫</button></div>";

source=source.slice(0,start)+directActions+source.slice(close+6);
if(source===original)throw new Error('Monthly Plan action handler was not updated.');
fs.writeFileSync(file,source);
console.log('Monthly Plan actions installed: Edit, confirmed Cancel for Active plans, and confirmed Remove with allocation guard.');
