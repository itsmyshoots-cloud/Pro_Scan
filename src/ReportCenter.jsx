import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './lib/supabase';

const REPORT_TYPES=[
 ['overall','Overall report'],
 ['day','Day-wise'],
 ['product','Product-wise'],
 ['brand','Brand-wise'],
 ['month','Month-wise'],
 ['hour','Hour-wise']
];
const n=value=>Number(value||0);
const qty=value=>n(value).toLocaleString('en-IN');
const dateKey=value=>String(value||'').slice(0,10);
const localToday=()=>{
 const d=new Date();
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const monthStart=()=>{
 const d=new Date();
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
};
const clockLabel=value=>{
 const parts=String(value||'').slice(0,5).split(':').map(Number);
 if(parts.length!==2||parts.some(x=>!Number.isFinite(x)))return String(value||'—');
 const h=parts[0],m=parts[1];
 return String(h%12||12).padStart(2,'0')+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM');
};
const timeInSlot=(value,slot,date)=>{
 if(!value)return false;
 const d=new Date(value);
 if(Number.isNaN(d.getTime())||dateKey(d.toISOString())!==date)return false;
 const parts=String(slot||'').slice(0,5).split(':').map(Number);
 if(parts.length!==2||parts.some(x=>!Number.isFinite(x)))return false;
 const minute=d.getHours()*60+d.getMinutes(),start=parts[0]*60+parts[1];
 return minute>=start&&minute<start+60;
};
const plannedFor=plan=>{
 const hourly=Array.isArray(plan?.hourly_targets)?plan.hourly_targets:[];
 const sum=hourly.reduce((total,row)=>total+n(row.planned_qty),0);
 return sum||n(plan?.planned_qty);
};
const csvCell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
const downloadCsv=(filename,headers,rows)=>{
 const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export default function ReportCenter({onNavigate,embedded=true}){
 const [reportType,setReportType]=useState('overall');
 const [plans,setPlans]=useState([]);
 const [serials,setSerials]=useState([]);
 const [rejections,setRejections]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [filters,setFilters]=useState({from:monthStart(),to:localToday(),brand:'all',product:'all',line:'all',shift:'all'});

 const load=async()=>{
  setLoading(true);setError('');
  const [planResult,serialResult,rejectionResult]=await Promise.all([
   supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(2000),
   supabase.from('plan_serials').select('*').limit(100000),
   supabase.from('production_rejections').select('*').limit(100000)
  ]);
  const failure=planResult.error||serialResult.error||rejectionResult.error;
  if(failure){setError(failure.message||'Could not load production reports.');setLoading(false);return;}
  setPlans(planResult.data||[]);
  setSerials(serialResult.data||[]);
  setRejections(rejectionResult.data||[]);
  setLoading(false);
 };
 useEffect(()=>{void load();},[]);

 const brands=useMemo(()=>[...new Set(plans.map(p=>String(p.brand||'').trim()).filter(Boolean))].sort(),[plans]);
 const products=useMemo(()=>[...new Set(plans.map(p=>String(p.product_name||'').trim()).filter(Boolean))].sort(),[plans]);
 const lines=useMemo(()=>[...new Set(plans.map(p=>String(p.production_line||'').trim()).filter(Boolean))].sort(),[plans]);
 const shifts=useMemo(()=>[...new Set(plans.map(p=>String(p.shift_name||'').trim()).filter(Boolean))].sort(),[plans]);

 const serialByPlan=useMemo(()=>{
  const map=new Map();
  for(const serial of serials){const list=map.get(serial.plan_id)||[];list.push(serial);map.set(serial.plan_id,list);}
  return map;
 },[serials]);
 const rejectionByPlan=useMemo(()=>{
  const map=new Map();
  for(const row of rejections){const list=map.get(row.plan_id)||[];list.push(row);map.set(row.plan_id,list);}
  return map;
 },[rejections]);

 const filteredPlans=useMemo(()=>plans.filter(plan=>{
  const date=dateKey(plan.production_date);
  return (!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to)
   &&(filters.brand==='all'||plan.brand===filters.brand)
   &&(filters.product==='all'||plan.product_name===filters.product)
   &&(filters.line==='all'||plan.production_line===filters.line)
   &&(filters.shift==='all'||plan.shift_name===filters.shift);
 }),[plans,filters]);

 const planRows=useMemo(()=>filteredPlans.map(plan=>{
  const planSerials=serialByPlan.get(plan.id)||[];
  const planRejections=rejectionByPlan.get(plan.id)||[];
  const acceptedSerials=planSerials.filter(row=>row.status==='scanned').length;
  const rejectedSerials=planSerials.filter(row=>row.status==='rejected').length;
  const quantityAccepted=planRejections.filter(row=>row.rejection_type==='quantity'&&row.status==='rework_accepted').reduce((sum,row)=>sum+n(row.quantity),0);
  const quantityRejected=planRejections.filter(row=>row.rejection_type==='quantity'&&!['closed','rework_accepted'].includes(row.status)).reduce((sum,row)=>sum+n(row.quantity),0);
  const accepted=acceptedSerials+quantityAccepted;
  const rejected=rejectedSerials+quantityRejected;
  const actual=accepted+rejected;
  const planned=plannedFor(plan);
  return {plan,planned,actual,rejected,accepted,pending:Math.max(0,planned-actual),serials:planSerials,rejections:planRejections};
 }),[filteredPlans,serialByPlan,rejectionByPlan]);

 const totals=useMemo(()=>planRows.reduce((sum,row)=>{
  sum.planned+=row.planned;sum.actual+=row.actual;sum.rejected+=row.rejected;sum.accepted+=row.accepted;sum.pending+=row.pending;
  return sum;
 },{planned:0,actual:0,rejected:0,accepted:0,pending:0}),[planRows]);

 const groupedRows=useMemo(()=>{
  if(reportType==='overall')return planRows.map(row=>({
   key:row.plan.id,date:dateKey(row.plan.production_date),brand:row.plan.brand||'—',product:row.plan.product_name||'—',model:row.plan.model||'—',line:row.plan.production_line||'—',shift:row.plan.shift_name||'—',
   planned:row.planned,actual:row.actual,rejected:row.rejected,accepted:row.accepted,pending:row.pending,status:row.plan.status||'—'
  }));
  const getKey=row=>{
   if(reportType==='day')return dateKey(row.plan.production_date);
   if(reportType==='product')return (row.plan.product_name||'—')+' · '+(row.plan.model||'—');
   if(reportType==='brand')return row.plan.brand||'—';
   return dateKey(row.plan.production_date).slice(0,7);
  };
  const map=new Map();
  for(const row of planRows){
   const key=getKey(row);
   const item=map.get(key)||{key,label:key,plans:0,planned:0,actual:0,rejected:0,accepted:0,pending:0};
   item.plans+=1;item.planned+=row.planned;item.actual+=row.actual;item.rejected+=row.rejected;item.accepted+=row.accepted;item.pending+=row.pending;
   map.set(key,item);
  }
  return [...map.values()].sort((a,b)=>String(b.key).localeCompare(String(a.key)));
 },[reportType,planRows]);

 const hourlyRows=useMemo(()=>{
  if(reportType!=='hour')return [];
  const output=[];
  for(const row of planRows){
   const plan=row.plan,date=dateKey(plan.production_date);
   const targets=Array.isArray(plan.hourly_targets)?plan.hourly_targets:[];
   const planSerials=row.serials,planRejections=row.rejections;
   for(const target of targets){
    const hour=String(target.hour||'').slice(0,5);
    const acceptedScans=planSerials.filter(s=>s.status==='scanned'&&timeInSlot(s.scanned_at,hour,date)).length;
    const rejectedSerials=planRejections.filter(r=>r.rejection_type==='serial'&&r.status!=='rework_accepted'&&r.status!=='closed'&&timeInSlot(r.recorded_at,hour,date)).length;
    const quantityRejected=planRejections.filter(r=>r.rejection_type==='quantity'&&!['closed','rework_accepted'].includes(r.status)&&timeInSlot(r.recorded_at,hour,date)).reduce((sum,r)=>sum+n(r.quantity),0);
    const quantityAccepted=planRejections.filter(r=>r.rejection_type==='quantity'&&r.status==='rework_accepted'&&timeInSlot(r.resolved_at,hour,date)).reduce((sum,r)=>sum+n(r.quantity),0);
    const accepted=acceptedScans+quantityAccepted,rejected=rejectedSerials+quantityRejected,actual=accepted+rejected,planned=n(target.planned_qty);
    output.push({key:plan.id+'-'+hour,date,line:plan.production_line||'—',brand:plan.brand||'—',product:plan.product_name||'—',model:plan.model||'—',shift:plan.shift_name||'—',hour:clockLabel(hour),planned,actual,rejected,accepted,pending:Math.max(0,planned-actual)});
   }
  }
  return output;
 },[reportType,planRows]);

 const reportRows=reportType==='hour'?hourlyRows:groupedRows;
 const reportHeaders=reportType==='overall'
  ?['Date','Brand','Product','Model','Line','Shift','Planned Qty','Actual Qty','Rejected Qty','Accepted Qty','Pending']
  :reportType==='hour'
   ?['Date','Line','Brand','Product / Model','Shift','Hour','Planned Qty','Actual Qty','Rejected Qty','Accepted Qty','Pending']
   :[reportType==='day'?'Date':reportType==='product'?'Product / Model':reportType==='brand'?'Brand':'Month','Plans','Planned Qty','Actual Qty','Rejected Qty','Accepted Qty','Pending'];
 const exportRows=reportType==='overall'
  ?reportRows.map(r=>[r.date,r.brand,r.product,r.model,r.line,r.shift,r.planned,r.actual,r.rejected,r.accepted,r.pending])
  :reportType==='hour'
   ?reportRows.map(r=>[r.date,r.line,r.brand,r.product+' / '+r.model,r.shift,r.hour,r.planned,r.actual,r.rejected,r.accepted,r.pending])
   :reportRows.map(r=>[r.label,r.plans,r.planned,r.actual,r.rejected,r.accepted,r.pending]);

 const reset=()=>setFilters({from:monthStart(),to:localToday(),brand:'all',product:'all',line:'all',shift:'all'});
 const setFilter=(key,value)=>setFilters(previous=>({...previous,[key]:value}));
 const reportLabel=REPORT_TYPES.find(([id])=>id===reportType)?.[1]||'Overall report';

 return <div className={embedded?'rc-shell rc-embedded':'rc-shell'}>
  <main className='rc-main rc-report-workspace'>
   <div className='rc-top rc-report-heading'>
    <div><span className='rc-kicker'>PRODUCTION MIS</span><h1>Production Reports</h1><p>Analyze accepted, rejected and total production across dates, products, brands, lines and shifts.</p></div>
    <div className='rc-top-actions'><button className='rc-export' onClick={()=>downloadCsv('pro-scan-'+reportType+'-report.csv',reportHeaders,exportRows)}>Export CSV / Excel</button><button className='rc-print' onClick={()=>window.print()}>Print / Save PDF</button></div>
   </div>

   <section className='rc-filter-card rc-filter-card-new'>
    <div className='rc-filter-head'><div><strong>Report Filters</strong><span>{filteredPlans.length.toLocaleString('en-IN')} production plans in view</span></div><div className='rc-filter-actions'><button className='rc-reset' onClick={reset}>Reset</button><button className='rc-reset' onClick={()=>void load()}>↻ Refresh</button></div></div>
    <div className='rc-filter-grid rc-filter-new-grid'>
     <label><span>Report type</span><select value={reportType} onChange={e=>setReportType(e.target.value)}>{REPORT_TYPES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
     <label><span>From</span><input type='date' value={filters.from} onChange={e=>setFilter('from',e.target.value)}/></label>
     <label><span>To</span><input type='date' value={filters.to} onChange={e=>setFilter('to',e.target.value)}/></label>
     <label><span>Brand</span><select value={filters.brand} onChange={e=>setFilter('brand',e.target.value)}><option value='all'>All brands</option>{brands.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
     <label><span>Product</span><select value={filters.product} onChange={e=>setFilter('product',e.target.value)}><option value='all'>All products</option>{products.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
     <label><span>Production line</span><select value={filters.line} onChange={e=>setFilter('line',e.target.value)}><option value='all'>All lines</option>{lines.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
     <label><span>Shift</span><select value={filters.shift} onChange={e=>setFilter('shift',e.target.value)}><option value='all'>All shifts</option>{shifts.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    </div>
   </section>

   <section className='rc-kpis rc-quality-kpis'>
    <div><span>Planned Qty</span><strong>{qty(totals.planned)}</strong><small>Scheduled production quantity</small></div>
    <div><span>Actual Qty</span><strong>{qty(totals.actual)}</strong><small>Accepted + rejected quantity</small></div>
    <div><span>Rejected Qty</span><strong>{qty(totals.rejected)}</strong><small>Awaiting rework or reinspection</small></div>
    <div><span>Accepted Qty</span><strong>{qty(totals.accepted)}</strong><small>Passed production / reinspection</small></div>
   </section>

   <section className='rc-table-section'>
    <div className='rc-table-title'><div><span className='rc-kicker'>{reportLabel.toUpperCase()}</span><h2>{reportLabel}</h2></div><span>{reportRows.length.toLocaleString('en-IN')} report row(s)</span></div>
    {loading?<div className='rc-loading'><div className='rc-spinner'></div><strong>Loading production data</strong><span>Preparing report metrics…</span></div>
    :error?<div className='rc-error'><strong>Could not load reports</strong><span>{error}</span></div>
    :<div className='rc-table-wrap'><table className='rc-table'><thead><tr>{reportHeaders.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {reportRows.length?reportRows.map(row=>reportType==='overall'?<tr key={row.key}><td>{row.date}</td><td>{row.brand}</td><td>{row.product}</td><td>{row.model}</td><td>{row.line}</td><td>{row.shift}</td><td>{qty(row.planned)}</td><td className='rc-actual'>{qty(row.actual)}</td><td className='rc-bad'>{qty(row.rejected)}</td><td className='rc-good'>{qty(row.accepted)}</td><td>{qty(row.pending)}</td></tr>
       :reportType==='hour'?<tr key={row.key}><td>{row.date}</td><td>{row.line}</td><td>{row.brand}</td><td>{row.product} / {row.model}</td><td>{row.shift}</td><td>{row.hour}</td><td>{qty(row.planned)}</td><td className='rc-actual'>{qty(row.actual)}</td><td className='rc-bad'>{qty(row.rejected)}</td><td className='rc-good'>{qty(row.accepted)}</td><td>{qty(row.pending)}</td></tr>
       :<tr key={row.key}><td>{row.label}</td><td>{qty(row.plans)}</td><td>{qty(row.planned)}</td><td className='rc-actual'>{qty(row.actual)}</td><td className='rc-bad'>{qty(row.rejected)}</td><td className='rc-good'>{qty(row.accepted)}</td><td>{qty(row.pending)}</td></tr>)
      :<tr><td colSpan={reportHeaders.length} className='rc-empty'>No production data matches these filters.</td></tr>}
    </tbody></table></div>}
   </section>
  </main>
 </div>;
}
