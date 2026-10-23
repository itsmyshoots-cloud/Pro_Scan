import fs from 'fs';

const file = 'src/lib/supabase.js';
let source = fs.readFileSync(file, 'utf8');
const original = source;

// Use PostgREST's duplicate-ignore upsert for the globally unique serial_number
// constraint. This prevents one already-allocated serial from aborting an entire
// Daily Plan and, importantly, lets us know exactly how many serials were really
// reserved.
const oldInsert = "  const { error: serialError } = await client.from('plan_serials').insert(payload);\n  if (serialError) {\n    await client.from('production_plans').delete().eq('id', newPlan.id);\n    if (String(serialError.message || '').toLowerCase().includes('ux_plan_serials_serial_number')) {\n      return { data: null, error: new Error('One or more monthly serial numbers are already allocated. Please refresh the Daily Plan and try again.') };\n    }\n    return { data: null, error: serialError };\n  }\n\n  return { data: newPlan, error: null };";

const newInsert = "  const { data: insertedSerials, error: serialError, count: insertedCount } = await client\n    .from('plan_serials')\n    .upsert(payload, { onConflict: 'serial_number', ignoreDuplicates: true, count: 'exact' })\n    .select('serial_number');\n\n  if (serialError) {\n    await client.from('plan_serials').delete().eq('plan_id', newPlan.id);\n    await client.from('production_plans').delete().eq('id', newPlan.id);\n    return { data: null, error: serialError };\n  }\n\n  const actuallyReserved = Number(insertedCount ?? (insertedSerials || []).length);\n  if (actuallyReserved !== plannedQty) {\n    await client.from('plan_serials').delete().eq('plan_id', newPlan.id);\n    await client.from('production_plans').delete().eq('id', newPlan.id);\n    return {\n      data: null,\n      error: new Error(`Only ${actuallyReserved} of ${plannedQty} requested monthly serials were available. No Daily Plan was created.`),\n    };\n  }\n\n  // If this Daily Plan consumed the complete visible remainder of the monthly\n  // pool, close the monthly plan immediately. Completed plans are excluded from\n  // the Daily Plan selector, so the same monthly pool cannot be reused.\n  if (available.length <= plannedQty) {\n    const { error: completeError } = await client\n      .from('monthly_production_plans')\n      .update({ status: 'completed' })\n      .eq('id', monthlyPlanId)\n      .eq('status', 'active');\n    if (completeError) {\n      // Allocation succeeded, so do not roll it back. Surface the status issue\n      // clearly so it can be corrected without risking duplicate serials.\n      return { data: newPlan, error: new Error(`Daily Plan created with ${plannedQty} serials, but the monthly plan could not be marked completed: ${completeError.message}`) };\n    }\n  }\n\n  return { data: newPlan, error: null };";

if (!source.includes(oldInsert)) throw new Error('Daily serial allocation insert anchor not found.');
source = source.replace(oldInsert, newInsert, 1);

// A completed monthly plan must never report a positive pool, even if an old UI
// instance still has its ID selected in memory.
const oldAvailabilityStart = "  if (!monthlyPlanId) return 0;\n\n  const { data: pool, error: poolError } = await client";
const newAvailabilityStart = "  if (!monthlyPlanId) return 0;\n\n  const { data: planStatus, error: planStatusError } = await client\n    .from('monthly_production_plans')\n    .select('status')\n    .eq('id', monthlyPlanId)\n    .maybeSingle();\n  if (planStatusError) throw planStatusError;\n  if (planStatus?.status === 'completed' || planStatus?.status === 'cancelled') return 0;\n\n  const { data: pool, error: poolError } = await client";
if (!source.includes(oldAvailabilityStart)) throw new Error('Monthly availability status anchor not found.');
source = source.replace(oldAvailabilityStart, newAvailabilityStart, 1);

if (source === original) throw new Error('Monthly serial allocation patch made no changes.');
fs.writeFileSync(file, source);
console.log('Monthly serial allocation is duplicate-safe and completed monthly pools are locked.');
