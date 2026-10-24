import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// Normalize the legacy plan loader. Earlier build-time patches can change the
// surrounding source, so do not depend on one exact whitespace/layout form.
source=source.replace(/\bconst\s+load\s*=\s*async\s*\(\s*\)\s*=>/g,'const refreshPlans=async()=>');
source=source.replace(/\bconst\s+refreshPlans\s*=\s*async\s*\(\s*\)\s*=>/g,'const refreshPlans=async()=>');

// If the loader was removed by an earlier patch layer, recreate it INSIDE App
// so setPlans/setMessage and Supabase remain in the correct React scope.
if(!/\bconst\s+refreshPlans\s*=\s*async\s*\(\s*\)\s*=>/.test(source)){
  const appAnchor="export default function App({user}){";
  const stateAnchor=" const monitoringRefreshRef=useRef(false); const productionChannelRef=useRef(null); const realtimeRefreshRef=useRef({});";
  const loader=" const refreshPlans=async()=>{try{await supabase.rpc('ensure_production_carry_forward',{p_target_date:localDateKey(new Date())});}catch{} const {data,error}=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).limit(200);if(error){setMessage(error.message);return;}if(data)setPlans(data)};";
  if(!source.includes(appAnchor))throw new Error('App component anchor not found.');
  if(!source.includes(stateAnchor))throw new Error('App state anchor not found; cannot safely restore plan loader.');
  source=source.replace(stateAnchor,stateAnchor+loader);
}

// Update every zero-argument runtime call, including calls embedded in hooks.
source=source.replace(/\bload\s*\(\s*\)/g,'refreshPlans()');

// Never allow a bare load identifier to remain in the known dependency list.
source=source.replace(/\{\s*load\s*,\s*refreshMonitoring\s*,\s*refreshPlanMetrics\s*,/g,'{refreshPlans,refreshMonitoring,refreshPlanMetrics,');

if(!/\bconst\s+refreshPlans\s*=\s*async\s*\(\s*\)\s*=>/.test(source)){
  throw new Error('Runtime plan refresh fix failed: refreshPlans could not be established inside App. Refusing to build a broken workspace.');
}

if(/\bload\s*\(\s*\)/.test(source)){
  throw new Error('Runtime plan refresh fix failed: a load() call remains in src/App.jsx. Refusing to build a broken workspace.');
}

fs.writeFileSync(file,source);
console.log('Runtime plan refresh normalized to refreshPlans() inside App; all calls updated.');
