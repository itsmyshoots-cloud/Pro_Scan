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

const client = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: sessionFetch,
  },
});

// Daily Plan V2: the availability RPC was committed to the repository but may
// not yet exist in the live database schema cache. Calculate the same value
// directly from the monthly serial pool when that RPC is requested.
const getMonthlyPlanAvailableQty = async (monthlyPlanId) => {
  const { data: pool, error: poolError } = await client
    .from('monthly_plan_serials')
    .select('id,serial_number')
    .eq('monthly_plan_id', monthlyPlanId);
  if (poolError) throw poolError;

  const serials = pool || [];
  if (!serials.length) return 0;

  const ids = serials.map(row => row.id);
  const usedIds = new Set();
  const usedSerials = new Set();

  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: allocated, error: allocationError } = await client
      .from('plan_serials')
      .select('monthly_plan_serial_id,serial_number')
      .in('monthly_plan_serial_id', chunk);
    if (allocationError) throw allocationError;
    for (const row of allocated || []) {
      if (row.monthly_plan_serial_id) usedIds.add(row.monthly_plan_serial_id);
      if (row.serial_number) usedSerials.add(String(row.serial_number).trim().toUpperCase());
    }
  }

  return serials.reduce((count, row) => {
    const serial = String(row.serial_number || '').trim().toUpperCase();
    return count + (usedIds.has(row.id) || (serial && usedSerials.has(serial)) ? 0 : 1);
  }, 0);
};

export const supabase = new Proxy(client, {
  get(target, property, receiver) {
    if (property === 'rpc') {
      return async (functionName, args, options) => {
        if (functionName === 'get_monthly_plan_available_qty') {
          try {
            return { data: await getMonthlyPlanAvailableQty(args?.p_monthly_plan_id), error: null };
          } catch (error) {
            return { data: null, error };
          }
        }
        return target.rpc.call(target, functionName, args, options);
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
