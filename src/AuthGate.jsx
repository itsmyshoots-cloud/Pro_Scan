import React,{useEffect,useState} from 'react';
import App from './App.jsx';
import {supabase} from './lib/supabase';

function LoginScreen(){
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const submit=async event=>{
  event.preventDefault();
  setBusy(true);setError('');
  const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(authError)setError(authError.message);
  setBusy(false);
 };
 return <main className='auth-page'>
  <section className='auth-card'>
   <div className='auth-brand'><span className='auth-logo'>PS</span><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div></div>
   <div className='auth-heading'><h2>Sign in</h2><p>Use your company email and password to access Pro Scan.</p></div>
   <form onSubmit={submit} className='auth-form'>
    <label>Email address<input type='email' autoComplete='username' value={email} onChange={e=>setEmail(e.target.value)} placeholder='name@company.com' required/></label>
    <label>Password<input type='password' autoComplete='current-password' value={password} onChange={e=>setPassword(e.target.value)} placeholder='Enter your password' required/></label>
    {error&&<div className='auth-error'>{error}</div>}
    <button className='auth-submit' disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
   </form>
   <p className='auth-help'>Access is controlled by your assigned Pro Scan role. Contact your administrator if your account has not been assigned access.</p>
  </section>
 </main>;
}

export default function AuthGate(){
 const [session,setSession]=useState(undefined);
 const [role,setRole]=useState('');
 const [accessError,setAccessError]=useState('');
 const [loadingRole,setLoadingRole]=useState(false);
 const loadRole=async currentSession=>{
  if(!currentSession?.user){setRole('');setAccessError('');return;}
  setLoadingRole(true);setAccessError('');
  const email=currentSession.user.email||'';
  const {data,error}=await supabase.from('app_users').select('role').eq('email',email.toLowerCase()).maybeSingle();
  if(error||!data?.role){
   setRole('');
   setAccessError(error?.message||'Your email is authenticated, but no Pro Scan role has been assigned to it.');
  }else setRole(data.role);
  setLoadingRole(false);
 };
 useEffect(()=>{
  let mounted=true;
  supabase.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);void loadRole(data.session);}});
  const {data:listener}=supabase.auth.onAuthStateChange((_event,nextSession)=>{if(!mounted)return;setSession(nextSession);void loadRole(nextSession);});
  return ()=>{mounted=false;listener.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(role!=='operator'||!session)return;
  const forceOperatorView=()=>{
   const buttons=[...document.querySelectorAll('.app .top-actions .nav-button')];
   const operatorButton=buttons.find(button=>button.textContent?.trim().toLowerCase()==='operator');
   if(operatorButton){operatorButton.click();return true;}
   return false;
  };
  const timer=setTimeout(forceOperatorView,0);
  const observer=new MutationObserver(()=>forceOperatorView());
  const root=document.getElementById('root');
  if(root)observer.observe(root,{subtree:true,childList:true});
  return ()=>{clearTimeout(timer);observer.disconnect();};
 },[role,session]);
 if(session===undefined)return <main className='auth-page'><div className='auth-loading'>Loading secure access…</div></main>;
 if(!session)return <LoginScreen/>;
 if(loadingRole)return <main className='auth-page'><div className='auth-loading'>Checking your Pro Scan access…</div></main>;
 if(!role)return <main className='auth-page'><section className='auth-card auth-denied'><div className='auth-brand'><span className='auth-logo'>PS</span><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div></div><h2>Access not assigned</h2><p>{accessError||'Your account does not have a Pro Scan role yet.'}</p><button className='auth-submit' onClick={()=>supabase.auth.signOut()}>Sign out</button></section></main>;
 return <div className={'auth-shell auth-role-'+role}>
  <div className='auth-userbar'><span><b>{session.user.email}</b><em>{role}</em></span><button onClick={()=>supabase.auth.signOut()}>Sign out</button></div>
  <App/>
 </div>;
}
