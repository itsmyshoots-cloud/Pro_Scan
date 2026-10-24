import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;

const supabaseImport="import {supabase} from './lib/supabase';";
if(!source.includes("import ReportCenter from './ReportCenter.jsx';")){
  if(!source.includes(supabaseImport))throw new Error('Supabase import anchor not found for Reports integration.');
  source=source.replace(supabaseImport,supabaseImport+"\nimport ReportCenter from './ReportCenter.jsx';\nimport './report-center.css';");
}

// Remove the previous body-level React root implementation. It created a
// second app above the main workspace, which made Reports behave like a
// separate full-screen page.
source=source.replace(/import \{createRoot\} from 'react-dom\/client';\s*/g,'');
if(source.includes("const mountId='proscan-report-center-mount';")){
  const oldRootEffect=/\s*useEffect\(\(\)=>\{\s*const mountId='proscan-report-center-mount';[\s\S]*?\},\[view\]\);\s*/;
  if(!oldRootEffect.test(source))throw new Error('Legacy Reports mount was found, but its useEffect block could not be safely removed.');
  source=source.replace(oldRootEffect,'\n');
}

// Render the Reports component inside App's normal content area.
const legacyReports=/\{view==='reports'&&<main className='reports-page'>[\s\S]*?<\/main>\}/;
if(legacyReports.test(source)){
  source=source.replace(legacyReports,"{view==='reports'&&<ReportCenter embedded onNavigate={setView}/>}"); 
}else if(!source.includes("{view==='reports'&&<ReportCenter embedded onNavigate={setView}/>")){
  throw new Error('Reports page anchor not found; refusing to add a detached React root.');
}

if(source.includes("proscan-report-center-mount")||source.includes("createRoot(")){
  throw new Error('Legacy detached Reports root remains after patch.');
}
if(source===original)console.log('Reports already use the inline workspace integration.');
else fs.writeFileSync(file,source);
console.log('Reports render inline within the main Pro Scan workspace.');
