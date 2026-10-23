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

// The live database does not currently expose the create_daily_production_plan_from_monthly
// RPC signature expected by the Daily Plan UI. Keep the UI working by performing the same
// operation through the tables using the authenticated Supabase client.
//
// IMPORTANT: this insert is schema-compatible. Supabase/PostgREST returns a
// deterministic "Could not find the 'X' column of 'production_plans'" error when
// an older database is missing an optional column. We remove only that optional
// field and retry the same insert. This prevents the recurring one-column-at-a-time
// deployment failures that were happening during Daily Plan creation.
const insertProductionPlanSchemaCompatible = async (payload) => {
  const workingPayload = { ...payload };
  const removableFields = new Set([
    'brand',
    'hourly_targets',
    'shift_name',
    'shift_start',
    'shift_end',
    'shift_planned_qty',
    'manpower_count',
    'planner_notes',
  ]);

  for (let attempt = 0; attempt <= removableFields.size; attempt += 1) {
    const { data, error } = await client
      .from('production_plans')
      .insert(workingPayload)
      .select()
      .single();

    if (!error) return { data, error: null };

    const message = String(error.message || '');
    const match = message.match(/Could not find the '([^']+)' column of 'production_plans'/i);
    const missingColumn = match?.[1];

    if (!missingColumn || !removableFields.has(missingColumn) || !(missingColumn in workingPayload)) {
      return { data: null, error };
    }

    delete workingPayload[missingColumn];
  }

  return { data: null, error: new Error('Could not create the daily production plan with the current production_plans schema.') };
};

const createDailyProductionPlanFromMonthly = async (args = {}) => {
  const monthlyPlanId = args.p_monthly_plan_id;
  const productionDate = args.p_production_date;
  const productionLine = String(args.p_production_line || '').trim();
  const shiftName = String(args.p_shift_name || 'Shift A').trim() || 'Shift A';
  const shiftStart = args.p_shift_start;
  const shiftEnd = args.p_shift_end;
  const plannedQty = Math.floor(Number(args.p_planned_qty) || 0);
  const hourlyTargets = Array.isArray(args.p_hourly_targets) ? args.p_hourly_targets : [];
  const plannedManpower = Math.max(0, Math.floor(Number(args.p_planned_manpower_count) || 0));

  if (!monthlyPlanId) return { data: null, error: new Error('Monthly production plan is required.') };
  if (!productionDate || !productionLine) return { data: null, error: new Error('Production date and production line are required.') };
  if (!shiftStart || !shiftEnd || shiftEnd <= shiftStart) return { data: null, error: new Error('Shift start and end times are invalid.') };
  if (plannedQty < 1) return { data: null, error: new Error('Daily planned quantity must be at least one.') };
  if (!hourlyTargets.length) return { data: null, error: new Error('At least one hourly production target is required.') };

  const hourlyTotal = hourlyTargets.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row?.planned_qty) || 0)), 0);
  if (hourlyTotal !== plannedQty) {
    return { data: null, error: new Error('Hourly targets must total the daily planned quantity.') };
  }

  const { data: sourcePlan, error: sourceError } = await client
    .from('monthly_production_plans')
    .select('*')
    .eq('id', monthlyPlanId)
    .eq('status', 'active')
    .maybeSingle();
  if (sourceError) return { data: null, error: sourceError };
  if (!sourcePlan) return { data: null, error: new Error('Monthly production plan was not found or is not active.') };

  const { data: pool, error: poolError } = await client
    .from('monthly_plan_serials')
    .select('id,label_number,serial_number,sequence_no')
    .eq('monthly_plan_id', monthlyPlanId)
    .order('sequence_no', { ascending: true });
  if (poolError) return { data: null, error: poolError };

  const { data: allocated, error: allocatedError } = await client
    .from('plan_serials')
    .select('serial_number')
    .not('serial_number', 'is', null);
  if (allocatedError) return { data: null, error: allocatedError };

  const used = new Set((allocated || []).map(row => String(row.serial_number || '').trim().toUpperCase()).filter(Boolean));
  const available = (pool || []).filter(row => {
    const serial = String(row.serial_number || '').trim().toUpperCase();
    return serial && !used.has(serial);
  });

  if (plannedQty > available.length) {
    return { data: null, error: new Error(`Daily planned quantity ${plannedQty} exceeds available monthly serials ${available.length}.`) };
  }

  const { data: overlapPlans, error: overlapError } = await client
    .from('production_plans')
    .select('id,production_date,production_line,shift_start,shift_end,status')
    .eq('production_date', productionDate)
    .eq('production_line', productionLine)
    .neq('status', 'cancelled');
  if (overlapError) return { data: null, error: overlapError };
  const startMinutes = Number(String(shiftStart).slice(0, 2)) * 60 + Number(String(shiftStart).slice(3, 5));
  const endMinutes = Number(String(shiftEnd).slice(0, 2)) * 60 + Number(String(shiftEnd).slice(3, 5));
  const overlaps = (overlapPlans || []).some(plan => {
    if (!plan.shift_start || !plan.shift_end) return false;
    const ps = Number(String(plan.shift_start).slice(0, 2)) * 60 + Number(String(plan.shift_start).slice(3, 5));
    const pe = Number(String(plan.shift_end).slice(0, 2)) * 60 + Number(String(plan.shift_end).slice(3, 5));
    return ps < endMinutes && pe > startMinutes;
  });
  if (overlaps) return { data: null, error: new Error('This production line already has an overlapping production plan for the selected time.') };

  // Only fields known to belong to the Daily Plan record are supplied here.
  // The compatibility helper removes any optional field that is absent from
  // an older production_plans schema, so another missing-column error will not
  // require another code/deployment cycle.
  const { data: newPlan, error: planError } = await insertProductionPlanSchemaCompatible({
    production_date: productionDate,
    product_name: sourcePlan.product_name,
    model: sourcePlan.model,
    production_line: productionLine,
    planned_qty: plannedQty,
    status: 'draft',
    brand: sourcePlan.brand,
    hourly_targets: hourlyTargets,
    shift_name: shiftName,
    shift_start: shiftStart,
    shift_end: shiftEnd,
    shift_planned_qty: plannedQty,
    manpower_count: plannedManpower,
  });
  if (planError) return { data: null, error: planError };

  const chosen = available.slice(0, plannedQty);
  const payload = chosen.map((row, index) => ({
    plan_id: newPlan.id,
    label_number: row.label_number,
    serial_number: row.serial_number,
    sequence_no: index + 1,
    status: 'pending',
  }));

  const { error: serialError } = await client.from('plan_serials').insert(payload);
  if (serialError) {
    await client.from('production_plans').delete().eq('id', newPlan.id);
    return { data: null, error: serialError };
  }

  return { data: newPlan, error: null };
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
        if (functionName === 'create_daily_production_plan_from_monthly') {
          return createDailyProductionPlanFromMonthly(args);
        }
        return target.rpc.call(target, functionName, args, options);
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});