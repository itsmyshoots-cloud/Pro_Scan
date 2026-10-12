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
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const switchMode=next=>{
    setMode(next);setPassword('');setConfirmPassword('');setShowPassword(false);setError('');setNotice('');
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
        setPassword('');setConfirmPassword('');setShowPassword(false);setMode('login');
      }else if(data?.token&&data?.user){
        localStorage.setItem(SESSION_KEY,data.token);onAuthenticated(data.user);
      }else setError('The access service returned an unexpected response. Please try again.');
    }catch(requestError){setError(requestError?.message||'Could not connect to the access service.');}
    finally{setBusy(false);}
  };

  return <main className='auth-page auth-page-login'>
    <div className='auth-layout'>
      <aside className='auth-brand-panel'>
        <div className='auth-panel-brand'><span className='auth-logo auth-logo-premium'><span>PS</span><i/></span><div><span className='auth-panel-overline'>PRODUCTION CONTROL</span><strong>Pro Scan</strong></div></div>
        <div className='auth-brand-copy'>
          <span className='auth-brand-kicker'><i/> FACTORY OPERATIONS PLATFORM</span>
          <h2>Every scan.<br/><span>Accounted for.</span></h2>
          <p>One clear view of production plans, serial traceability and live output across your factory floor.</p>
        </div>
        <div className='auth-visual-card' aria-hidden='true'>
          <div className='auth-visual-header'><span className='auth-visual-overline'>SCAN WORKFLOW</span><span className='auth-visual-live'><i/> READY</span></div>
          <div className='auth-visual-center'>
            <div className='auth-scan-frame'><i className='scan-corner scan-corner-tl'/><i className='scan-corner scan-corner-tr'/><i className='scan-corner scan-corner-bl'/><i className='scan-corner scan-corner-br'/><div className='auth-qr-pattern'><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><span className='auth-scan-beam'/></div>
            <div className='auth-visual-lines'><span/><span/><span/><span/><span/></div>
          </div>
          <div className='auth-visual-footer'><span><i/> PLAN-WISE TRACKING</span><span>LIVE VISIBILITY</span></div>
        </div>
        <div className='auth-panel-footer'><span>GSONS INDUSTRIES</span><i/> PRODUCTION SYSTEMS</div>
      </aside>

      <section className='auth-form-panel'>
        <div className='auth-form-topline'><span className='auth-form-overline'>{mode==='register'?'ACCOUNT REGISTRATION':'SECURE WORKSPACE'}</span><span className='auth-secure-mark'><i/> Secure access</span></div>
        <div className='auth-heading auth-heading-premium'><span className='auth-step-label'>{mode==='register'?'GET STARTED':'WELCOME BACK'}</span><h1>{mode==='register'?'Create your account':'Sign in to Pro Scan'}</h1><p>{mode==='register'?'Use your company email to request access. The Super Admin will assign your role.':'Enter your company credentials to access your production workspace.'}</p></div>
        <form onSubmit={submit} className='auth-form auth-form-premium'>
          <label htmlFor='proscan-email'>Company email<span className='auth-field-required'>Required</span><div className='auth-input-shell'><span className='auth-field-icon' aria-hidden='true'>@</span><input id='proscan-email' type='email' autoComplete='username' autoCapitalize='none' spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder='name@gsons.co.in' required/></div></label>
          <label htmlFor='proscan-password'>Password<span className='auth-field-required'>{mode==='register'?'10+ characters':'Required'}</span><div className='auth-input-shell'><span className='auth-field-icon auth-lock-icon' aria-hidden='true'>▣</span><input id='proscan-password' type={showPassword?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='register'?'Create a strong password':'Enter your password'} minLength={mode==='register'?10:undefined} required/><button type='button' className='auth-password-toggle' onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?'Hide':'Show'}</button></div></label>
          {mode==='register'&&<label htmlFor='proscan-confirm-password'>Confirm password<span className='auth-field-required'>Required</span><div className='auth-input-shell'><span className='auth-field-icon auth-lock-icon' aria-hidden='true'>▣</span><input id='proscan-confirm-password' type={showPassword?'text':'password'} autoComplete='new-password' value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder='Enter the password again' minLength={10} required/></div></label>}
          {error&&<div className='auth-error' role='alert'><span className='auth-message-icon'>!</span><span>{error}</span></div>}
          {notice&&<div className='auth-notice' role='status'><span className='auth-message-icon'>✓</span><span>{notice}</span></div>}
          <button className='auth-submit auth-submit-premium' disabled={busy}>{busy?<><span className='auth-button-spinner'/> {mode==='register'?'Creating account…':'Signing you in…'}</>:(mode==='register'?'Create account':'Sign in securely')}<span aria-hidden='true'>↗</span></button>
        </form>
        <div className='auth-mode-switch'><span>{mode==='register'?'Already have an account?':'New to Pro Scan?'}</span><button type='button' className='auth-mode-toggle' onClick={()=>switchMode(mode==='register'?'login':'register')}>{mode==='register'?'Back to sign in':'Register for access'} <span aria-hidden='true'>→</span></button></div>
        <div className='auth-form-footer'><span className='auth-footer-shield' aria-hidden='true'>✓</span><p><strong>Your access, protected.</strong><br/>Passwords are securely hashed. New registrations remain pending until a Super Admin assigns a role.</p></div>
      </section>
    </div>
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
