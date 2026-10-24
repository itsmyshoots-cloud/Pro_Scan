import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const helperAnchor="function localDateKey(date){";
if(!source.includes(helperAnchor)) throw new Error('Popup helper anchor not found.');
const helper="function productionWarningPopup(message,title='Production warning'){ if(typeof window!=='undefined'&&typeof window.alert==='function'){ window.alert(title+'\\n\\n'+String(message||'')); } }\\n";
if(!source.includes('function productionWarningPopup(')) source=source.replace(helperAnchor,helper+helperAnchor);

const replacements=[
 ["throw new Error('Duplicate serial numbers were found inside this file.');","productionWarningPopup('Duplicate serial numbers were found inside the uploaded serial file. Remove the duplicate serial numbers before creating the Monthly Plan.','Duplicate serial numbers'); throw new Error('Duplicate serial numbers were found inside this file.');"],
 ["throw new Error('Duplicate labels were found inside this file.');","productionWarningPopup('Duplicate label numbers were found inside the uploaded serial file. Remove the duplicate labels before creating the Monthly Plan.','Duplicate labels'); throw new Error('Duplicate labels were found inside this file.');"],
 ["setMonthlyMessage((existing.size?existing.size.toLocaleString()+' existing serials skipped. ':'')+fresh.length.toLocaleString()+' new unique serials ready.');","if(existing.size) productionWarningPopup(existing.size.toLocaleString()+' serial number(s) already exist in another Monthly Plan and were excluded from this upload. Please review the serial file before creating the new plan.','Serial already used'); setMonthlyMessage((existing.size?existing.size.toLocaleString()+' existing serials skipped. ':'')+fresh.length.toLocaleString()+' new unique serials ready.');"],
 ["new Error(error.message.includes('monthly_production_plan_model_month_unique')?'A monthly plan already exists for this month, brand and model.':error.message)","new Error(error.message.includes('monthly_production_plan_model_month_unique')?'A monthly plan already exists for this month, brand and model.':error.message)"],
 ["catch(error){setMonthlyMessage(error?.message||'Could not create the monthly plan.');}","catch(error){productionWarningPopup(error?.message||'Could not create the monthly plan.','Monthly Plan not created');setMonthlyMessage(error?.message||'Could not create the monthly plan.');}"],
 ["if(!monthlyPlan)return setDailyMessage('Select a monthly production plan first.');","if(!monthlyPlan){productionWarningPopup('Select a Monthly Production Plan before creating the Daily Plan.');return setDailyMessage('Select a monthly production plan first.');}"],
 ["if(!form.production_date)return setDailyMessage('Select the production date.');","if(!form.production_date){productionWarningPopup('Select the production date before creating the Daily Plan.');return setDailyMessage('Select the production date.');}"],
 ["if(!form.production_line)return setDailyMessage('Select the production line.');","if(!form.production_line){productionWarningPopup('Select the production line before creating the Daily Plan.');return setDailyMessage('Select the production line.');}"],
 ["if(!productiveMinutes<60)","if(!productiveMinutes<60)"],
 ["if(qty>capacity)return setDailyMessage('Daily planned quantity '+qty.toLocaleString()+' exceeds shift capacity '+capacity.toLocaleString()+' at '+rate.toLocaleString()+' units/hour.');","if(qty>capacity){const msg='Daily planned quantity '+qty.toLocaleString()+' exceeds shift capacity '+capacity.toLocaleString()+' at '+rate.toLocaleString()+' units/hour. Reduce the Daily Planned quantity or adjust the hourly production quantities.';productionWarningPopup(msg,'Shift capacity warning');return setDailyMessage(msg);}"],
 ["if(qty>dailyAvailableQty)return setDailyMessage('Daily planned quantity '+qty.toLocaleString()+' exceeds the '+dailyAvailableQty.toLocaleString()+' available serials in the monthly pool.');","if(qty>dailyAvailableQty){const msg='Daily planned quantity '+qty.toLocaleString()+' exceeds the '+dailyAvailableQty.toLocaleString()+' available serials in the monthly pool. Please reduce the Daily Planned quantity.';productionWarningPopup(msg,'Monthly serial pool warning');return setDailyMessage(msg);}"],
 ["if(targets.reduce((sum,row)=>sum+Number(row.planned_qty||0),0)!==qty)return setDailyMessage('Hourly production targets could not be balanced to the daily quantity.');","if(targets.reduce((sum,row)=>sum+Number(row.planned_qty||0),0)!==qty){const msg='Hourly production quantities must total exactly '+qty.toLocaleString()+'. Please review the hourly entries.';productionWarningPopup(msg,'Hourly quantity warning');return setDailyMessage(msg);}"],
 ["if(overlaps) return { data: null, error: new Error('This production line already has an overlapping production plan for the selected time.') };","if(overlaps) return { data: null, error: new Error('This production line already has an overlapping production plan for the selected time. Choose another date, line or non-overlapping shift.') };"],
 ["catch(error){setDailyMessage(error?.message||'Could not create the daily production plan. No serials were reserved.');}","catch(error){productionWarningPopup(error?.message||'Could not create the daily production plan. No serials were reserved.','Daily Plan not created');setDailyMessage(error?.message||'Could not create the daily production plan. No serials were reserved.');}"],
 ["return { data: null, error: new Error(`Daily planned quantity ${plannedQty} exceeds available unique monthly serials ${available.length}.`) };","return { data: null, error: new Error(`Daily planned quantity ${plannedQty} exceeds available unique monthly serials ${available.length}. Please reduce the Daily Planned quantity or refresh the Monthly Plan.`) };"],
 ["return { data: null, error: new Error('Daily Plan contains duplicate serial numbers and was not created.') };","return { data: null, error: new Error('Duplicate serial numbers were detected in the Daily Plan allocation. No Daily Plan was created and no serials were reserved.') };"],
 ["return { data: null, error: new Error('One or more monthly serial numbers are already allocated. Please refresh the Daily Plan and try again.') };","return { data: null, error: new Error('One or more monthly serial numbers are already allocated to another Daily Plan. No new Daily Plan was created. Refresh the page and try again.') };"],
];

for(const [from,to] of replacements){ if(source.includes(from)) source=source.replace(from,to); }

if(source===original) throw new Error('Production warning popup patch made no changes.');
fs.writeFileSync(file,source);
console.log('Production validation warning popups added.');
