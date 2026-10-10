import React, { useEffect, useState } from 'react';
import App from './App.jsx';
import { supabase } from './lib/supabase';
import './auth.css';

const SESSION_KEY = 'pro_scan_session';

function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = next => {
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setSetupCode('');
    setError('');
    setNotice('');
  };

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    if (mode === 'setup' && password !== confirmPassword) {
      setError('The passwords do not match.');
      setBusy(false);
      return;
    }

    const action = mode === 'setup' ? 'setup' : 'login';
    const body = mode === 'setup'
      ? { action, email: email.trim().toLowerCase(), setupCode: setupCode.trim(), password }
      : { action, email: email.trim().toLowerCase(), password };

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('app-auth', { body });
      if (invokeError) {
        setError(invokeError.message || 'Could not connect to the login service.');
      } else if (data?.error) {
        setError(data.error);
      } else if (mode === 'setup' && data?.ok) {
        setNotice(data.message || 'Password created. You can now sign in.');
        setPassword('');
        setConfirmPassword('');
        setSetupCode('');
        setMode('login');
      } else if (data?.token && data?.user) {
        localStorage.setItem(SESSION_KEY, data.token);
        onAuthenticated(data.user);
      } else {
        setError('The login service returned an unexpected response. Please try again.');
      }
    } catch (requestError) {
      setError(requestError?.message || 'Could not connect to the login service.');
    } finally {
      setBusy(false);
    }
  };

  return <main className='auth-page'>
    <section className='auth-card'>
      <div className='auth-brand'><span className='auth-logo'>PS</span><div><span className='eyebrow'>PRODUCTION CONTROL</span><h1>Pro Scan</h1></div></div>
      <div className='auth-heading'>
        <h2>{mode === 'setup' ? 'Set your password' : 'Sign in'}</h2>
        <p>{mode === 'setup'
          ? 'Use the one-time setup code provided by your administrator to create your company password.'
          : 'Use your company email and Pro Scan password to continue.'}</p>
      </div>
      <form onSubmit={submit} className='auth-form'>
        <label>Email address<input type='email' autoComplete='username' value={email} onChange={e => setEmail(e.target.value)} placeholder='name@gsons.co.in' required /></label>
        {mode === 'setup' && <label>One-time setup code<input type='text' autoComplete='one-time-code' value={setupCode} onChange={e => setSetupCode(e.target.value)} placeholder='Enter setup code' required /></label>}
        <label>Password<input type='password' autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'setup' ? 'Create a strong password (10+ characters)' : 'Enter your password'} minLength={mode === 'setup' ? 10 : undefined} required /></label>
        {mode === 'setup' && <label>Confirm password<input type='password' autoComplete='new-password' value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder='Re-enter your password' minLength={10} required /></label>}
        {error && <div className='auth-error' role='alert'>{error}</div>}
        {notice && <div className='auth-notice' role='status'>{notice}</div>}
        <button className='auth-submit' disabled={busy}>{busy ? (mode === 'setup' ? 'Setting password…' : 'Signing in…') : (mode === 'setup' ? 'Create password' : 'Sign in')}</button>
      </form>
      <button type='button' className='auth-mode-toggle' onClick={() => switchMode(mode === 'setup' ? 'login' : 'setup')}>
        {mode === 'setup' ? 'Back to sign in' : 'First time here? Set up your password'}
      </button>
      <p className='auth-help'>Access is controlled by your assigned Pro Scan role. Passwords are securely hashed and checked by the server.</p>
    </section>
  </main>;
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

  useEffect(() => {
    if (user?.role !== 'operator') return undefined;
    let forced = false;
    let observer;
    const forceOperatorView = () => {
      if (forced) return true;
      const buttons = [...document.querySelectorAll('.app .top-actions .nav-button')];
      const operatorButton = buttons.find(button => button.textContent?.trim().toLowerCase() === 'operator');
      if (operatorButton) {
        forced = true;
        observer?.disconnect();
        operatorButton.click();
        return true;
      }
      return false;
    };
    observer = new MutationObserver(forceOperatorView);
    const root = document.getElementById('root');
    if (root) observer.observe(root, { subtree: true, childList: true });
    const timer = setTimeout(forceOperatorView, 0);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [user?.role]);

  const signOut = async () => {
    try {
      await supabase.functions.invoke('app-auth', { body: { action: 'logout' } });
    } finally {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
    }
  };

  if (user === undefined) return <main className='auth-page'><div className='auth-loading'>Checking secure access…</div></main>;
  if (!user) return <LoginScreen onAuthenticated={setUser} />;

  return <div className={'auth-shell auth-role-' + user.role}>
    <div className='auth-userbar'><span><b>{user.email}</b><em>{user.role}</em></span><button onClick={signOut}>Sign out</button></div>
    <App />
  </div>;
}
