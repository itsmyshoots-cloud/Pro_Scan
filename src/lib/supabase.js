import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const sessionFetch = async (input, init = {}) => {
  const sourceHeaders = init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(sourceHeaders || {});
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('pro_scan_session') : null;
  if (token) headers.set('x-app-session', token);
  else headers.delete('x-app-session');
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: sessionFetch,
  },
});
