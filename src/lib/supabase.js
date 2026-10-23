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

// Daily Plan V2: calculate monthly-pool availability from the columns that
// actually exist in the current production schema. Daily allocations are
// represented in plan_serials by serial_number; older code incorrectly
// referenced plan_serials.monthly_plan_serial_id, which does not exist.
const getMonthlyPlanAvailableQty = async (monthlyPlanId) => {
  if (!monthlyPlanId) return 0;

  const { data: pool, error: poolError } = await client
    .from('monthly_plan_serials')
    .select('id,serial_number')
    .eq('monthly_plan_id', monthlyPlanId);
  if (poolError) throw poolError;

  const serials = pool || [];
  if (!serials.length) return 0;

  // A serial is considered allocated when that serial number already exists
  // in plan_serials. Do not reference monthly_plan_serial_id because the live
  // plan_serials table does not contain that column.
  const usedSerials = new Set();
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: allocated, error: allocationError } = await client
      .from('plan_serials')
      .select('serial_number')
      .not('serial_number', 'is', null)
      .range(from, from + pageSize - 1);
    if (allocationError) throw allocationError;
    const rows = allocated || [];
    for (const row of rows) {
      const serial = String(row.serial_number || '').trim().toUpperCase();
      if (serial) usedSerials.add(serial);
    }
    if (rows.length < pageSize) break;
  }

  return serials.reduce((count, row) => {
    const serial = String(row.serial_number || '').trim().toUpperCase();
    return count + (serial && usedSerials.has(serial) ? 0 : 1);
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