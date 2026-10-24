import fs from 'fs';

const file = 'src/lib/supabase.js';
let source = fs.readFileSync(file, 'utf8');
const original = source;

// The generated Daily Plan source can differ slightly between versions. Patch
// the current plain insert when present, while also accepting an already-patched
// source so this build step never fails just because an earlier patch changed it.
const oldInsert = "  const { error: serialError } = await client.from('plan_serials').insert(payload);\n  if (serialError) {\n    await client.from('production_plans').delete().eq('id', newPlan.id);\n    if (String(serialError.message || '').toLowerCase().includes('ux_plan_serials_serial_number')) {\n      return { data: null, error: new Error('One or more monthly serial numbers are already allocated. Please refresh the Daily Plan and try again.') };\n    }\n    return { data: null, error: serialError };\n  }\n\n  return { data: newPlan, error: null };";

const newInsert = "  const { data: insertedSerials, error: serialError, count: insertedCount } = await client\n    .from('plan_serials')\n    .upsert(payload, { onConflict: 'serial_number', ignoreDuplicates: true, count: 'exact' })\n    .select('serial_number');\n\n  if (serialError) {\n    await client.from('plan_serials').delete().eq('plan_id', newPlan.id);\n    await client.from('production_plans').delete().eq('id', newPlan.id);\n    return { data: null, error: serialError };\n  }\n\n  const actuallyReserved = Number(insertedCount ?? (insertedSerials || []).length);\n  if (actuallyReserved !== plannedQty) {\n    await client.from('plan_serials').delete().eq('plan_id', newPlan.id);\n    await client.from('production_plans').delete().eq('id', newPlan.id);\n    return {\n      data: null,\n      error: new Error(`Only ${actuallyReserved} of ${plannedQty} requested monthly serials were available. No Daily Plan was created.`),\n    };\n  }\n\n  return { data: newPlan, error: null };";

if (source.includes(oldInsert)) {
  source = source.replace(oldInsert, newInsert, 1);
  console.log('Monthly serial allocation insert patched with duplicate-safe upsert.');
} else if (source.includes(".from('plan_serials')\n    .upsert(payload, { onConflict: 'serial_number', ignoreDuplicates: true")) {
  console.log('Monthly serial allocation upsert is already present.');
} else {
  throw new Error('Daily serial allocation insert anchor not found.');
}

// Keep this build step tolerant of generated-source variations. Availability is
// already calculated from the full paginated serial pool; no second production
// quantity lock is applied here.
if (source === original) {
  console.log('Monthly serial allocation patch made no additional source changes.');
} else {
  fs.writeFileSync(file, source);
}
