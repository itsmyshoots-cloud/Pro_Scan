import fs from 'fs';
const file='src/App.jsx';let s=fs.readFileSync(file,'utf8');
if(!s.includes("./ReportCenter")){
 s=s.replace("import {supabase} from './lib/supabase';","import {supabase} from './lib/supabase';\nimport {createRoot} from 'react-dom/client';\nimport ReportCenter from './ReportCenter.jsx';\nimport './report-center.css';");
}
const anchor="const [view,setView]=useState(user?.role==='operator'?'operator':'dashboard');";
if(!s.includes('proscan-report-center-mount')){
 if(!s.includes(anchor))throw new Error('view state anchor not found');
 const inject=`\n useEffect(()=>{\n  const mountId='proscan-report-center-mount';\n  let mount=document.getElementById(mountId);\n  if(view==='reports'){\n   if(!mount){mount=document.createElement('div');mount.id=mountId;document.body.appendChild(mount);}\n   mount.style.display='block';\n   if(!mount._root)mount._root=createRoot(mount);\n   mount._root.render(<ReportCenter onClose={()=>setView('dashboard')} onNavigate={setView}/>);\n  }else if(mount){mount.style.display='none';}\n },[view]);\n`;
 s=s.replace(anchor,anchor+inject);
}
fs.writeFileSync(file,s);console.log('Report Center wired to Reports navigation.');
