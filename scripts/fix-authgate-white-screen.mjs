import fs from 'fs';
const file='src/AuthGate.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;
source=source.replace("import React, { lazy, Suspense, useEffect, useState } from 'react';\nconst App = lazy(() => import('./App.jsx'));", "import React, { useEffect, useState } from 'react';\nimport App from './App.jsx';");
const suspense="<Suspense fallback={<main className='auth-page auth-startup'><div className='auth-startup-card'><span className='auth-startup-logo'>PS</span><div><strong>Pro Scan</strong><small>Loading workspace</small></div><span className='auth-startup-spinner'/><p>Opening production workspace</p></div></main>}><App user={user} /></Suspense>";
source=source.replace(suspense,"<WorkspaceErrorBoundary><App user={user} /></WorkspaceErrorBoundary>");
const boundary="class WorkspaceErrorBoundary extends React.Component {\n  constructor(props){ super(props); this.state={error:null}; }\n  static getDerivedStateFromError(error){ return {error}; }\n  componentDidCatch(error,info){ console.error('Pro Scan workspace render error',error,info); }\n  render(){\n    if(!this.state.error) return this.props.children;\n    const message=this.state.error?.message||String(this.state.error||'Unknown error');\n    const stack=this.state.error?.stack||'';\n    return <main className='auth-page auth-startup'><div className='auth-startup-card' style={{maxWidth:'760px',padding:'32px',textAlign:'left'}}><span className='auth-startup-logo'>PS</span><div><strong>Workspace failed to load</strong><small>Client-side error detected</small></div><p style={{marginTop:'18px',fontWeight:600}}>{message}</p><pre style={{whiteSpace:'pre-wrap',fontSize:'12px',opacity:.75,maxHeight:'220px',overflow:'auto'}}>{stack}</pre><button type='button' className='auth-submit' onClick={()=>window.location.reload()}>Reload workspace</button></div></main>;\n  }\n}\n\n";
if(!source.includes('class WorkspaceErrorBoundary')){
  const anchor='export default function AuthGate()';
  if(!source.includes(anchor)) throw new Error('AuthGate component anchor not found.');
  source=source.replace(anchor,boundary+anchor);
}
if(source===original) throw new Error('AuthGate white-screen patch made no changes.');
fs.writeFileSync(file,source);
console.log('AuthGate workspace loading fixed and client render errors are now visible instead of a white screen.');
