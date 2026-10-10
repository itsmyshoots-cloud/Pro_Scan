import React, { useEffect, useState } from 'react';
import App from './App.jsx';
import { supabase } from './lib/supabase';
import './auth.css';

const SESSION_KEY = 'pro_scan_session';

function LoginScreen({ onAuthenticated }) {
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const switchMode=next=>{
    setMode(next);setPassword('');setConfirmPassword('');setError('');setNotice('');
  };

  const submit=async event=>{
    event.preventDefault();setBusy(true);setError('');setNotice('');
    if(mode==='register'&&password!==confirmPassword){setError('The passwords do not match.');setBusy(false);return;}
    const action=mode==='register'?'register':'login';
    try{
      const {data,error:invokeError}=await supabase.functions.invoke('app-auth',{body:{action,email:email.trim().toLowerCase(),password}});
      if(invokeError)setError(invokeError.message||'Could not connect to the access service.');
      else if(data?.error)setError(data.error);
      else if(mode==='register'&&data?.ok){
        setNotice(data.message||'Registration complete. Your account is waiting for Super Admin role assignment.');
        setPassword('');setConfirmPassword('');setMode('login');
      }else if(data?.token&&data?.user){
        localStorage.setItem(SESSION_KEY,data.token);onAuthenticated(data.user);
      }else setError('The access service returned an unexpected response. Please try again.');
    }catch(requestError){setError(requestError?.message||'Could not connect to the access service.');}
    finally{setBusy(false);}
  };

  return <main className='auth-page'>
    <section className='auth-card'>
      <div className='auth-brand'><span className='auth-logo'>PS</span><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div></div>
      <div className='auth-heading'><h2>{mode==='register'?'Create your account':'Sign in'}</h2><p>{mode==='register'?'Register with your company email. Production access is enabled after the Super Admin assigns your role.':'Use your company email and Pro Scan password to continue.'}</p></div>
      <form onSubmit={submit} className='auth-form'>
        <label>Company email<input type='email' autoComplete='username' value={email} onChange={e=>setEmail(e.target.value)} placeholder='name@gsons.co.in' required/></label>
        <label>Password<input type='password' autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='register'?'Create a strong password (10+ characters)':'Enter your password'} minLength={mode==='register'?10:undefined} required/></label>
        {mode==='register'&&<label>Confirm password<input type='password' autoComplete='new-password' value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder='Enter the password again' minLength={10} required/></label>}
        {error&&<div className='auth-error' role='alert'>{error}</div>}
        {notice&&<div className='auth-notice' role='status'>{notice}</div>}
        <button className='auth-submit' disabled={busy}>{busy?(mode==='register'?'Creating account…':'Signing in…'):(mode==='register'?'Register for access':'Sign in')}</button>
      </form>
      <button type='button' className='auth-mode-toggle' onClick={()=>switchMode(mode==='register'?'login':'register')}>{mode==='register'?'Back to sign in':'New user? Register for access'}</button>
      <p className='auth-help'>Passwords are securely hashed by the server. Registration does not grant production access until a Super Admin assigns a role.</p>
    </section>
  </main>;
}

function PendingAccessScreen({email,onSignOut,onRefresh,checking,error,notice}) {
  return <main className='auth-page'><section className='auth-card pending-access-card'>
    <div className='auth-brand'><span className='auth-logo'>PS</span><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div></div>
    <div className='pending-access-mark'>⌛</div>
    <div className='auth-heading'><h2>Waiting for role assignment</h2><p>Your account has been created, but production access is not assigned yet.</p></div>
    <div className='pending-access-email'>{email}</div>
    <p className='auth-help'>Ask your Super Admin to assign you as Planner or Operator. Once assigned, select Check access or sign in again. No production tabs are available until a role is assigned.</p>
    {error&&<div className='auth-error' role='alert'>{error}</div>}
    {notice&&<div className='auth-notice' role='status'>{notice}</div>}
    <div className='pending-access-actions'><button className='auth-submit' onClick={onRefresh} disabled={checking}>{checking?'Checking access…':'Check access'}</button><button className='auth-mode-toggle' onClick={onSignOut}>Sign out</button></div>
  </section></main>;
}

export default function AuthGate() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) {
      setUser(null);
      return () => { mounted = false; };
    }

    supabase.functions.invoke('app-auth', { body: { action: 'session' } })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data?.user) {
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
        } else {
          setUser(data.user);
        }
      })
      .catch(() => {
        if (!mounted) return;
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
      });
    return () => { mounted = false; };
  }, []);

  const signOut = async () => {
    try {
      await supabase.functions.invoke('app-auth', { body: { action: 'logout' } });
    } finally {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
    }
  };

  const [checkingAccess,setCheckingAccess]=useState(false);
  const [accessCheckError,setAccessCheckError]=useState('');
  const [accessCheckNotice,setAccessCheckNotice]=useState('');
  const refreshAccess=async()=>{
    setCheckingAccess(true);setAccessCheckError('');setAccessCheckNotice('');
    try{
      const {data,error}=await supabase.functions.invoke('app-auth',{body:{action:'session'}});
      if(error||!data?.user){setAccessCheckError(error?.message||'Could not verify your account. Please sign in again.');return;}
      setUser(data.user);
      if(data.user.role==='pending')setAccessCheckNotice('Your role is still pending. Check again after the Super Admin updates it.');
    }catch(error){setAccessCheckError(error?.message||'Could not check access.');}
    finally{setCheckingAccess(false);}
  };

  if (user === undefined) return <main className='auth-page'><div className='auth-loading'>Checking secure access…</div></main>;
  if (!user) return <LoginScreen onAuthenticated={setUser} />;
  if (user.role === 'pending') return <PendingAccessScreen email={user.email} onSignOut={signOut} onRefresh={refreshAccess} checking={checkingAccess} error={accessCheckError} notice={accessCheckNotice} />;

  return <div className={'auth-shell auth-role-' + user.role}>
    <div className='auth-userbar'><span><b>{user.email}</b><em>{{super_admin:'Super Admin',planner:'Planner',operator:'Operator'}[user.role]||user.role}</em></span><button onClick={signOut}>Sign out</button></div>
    <App user={user} />
  </div>;
}
