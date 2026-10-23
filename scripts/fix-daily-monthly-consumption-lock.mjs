import fs from 'fs';

const file = 'src/lib/supabase.js';
let source = fs.readFileSync(file, 'utf8');
const original = source;

const helperAnchor = "const getMonthlyPlanAvailableQty = async (monthlyPlanId) => {";
if (!source.includes(helperAnchor)) throw new Error('Monthly availability helper anchor not found.');

const helper = `const getMonthlyPlanCommittedQty = async (monthlyPlanId, sourcePlan = null) => {
  if (!monthlyPlanId) return 0;
  let plan = sourcePlan;
  if (!plan) {
    const { data, error } = await client
      .from('monthly_production_plans')
      .select('id,plan_month,brand,product_name,model,total_qty,status')
      .eq('id', monthlyPlanId)
      .maybeSingle();
    if (error) throw error;
    plan = data;
  }
  if (!plan || plan.status === 'cancelled') return 0;

  const monthText = String(plan.plan_month || '').slice(0, 7);
  const monthMatch = /^(\\d{4})-(\\d{2})$/.exec(monthText);
  if (!monthMatch) return 0;
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]);
  const monthStart = monthText + '-01';
  const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

  let query = client
    .from('production_plans')
    .select('id,production_date,product_name,model,brand,planned_qty,status')
    .gte('production_date', monthStart)
    .lt('production_date', nextMonthStart)
    .neq('status', 'cancelled');
  if (plan.product_name) query = query.eq('product_name', plan.product_name);
  if (plan.model) query = query.eq('model', plan.model);

  const { data: dailyRows, error: dailyError } = await query;
  if (dailyError) throw dailyError;

  const matchingRows = (dailyRows || []).filter(row => {
    // Older Daily Plans may have been created before the brand column was
    // confirmed in production_plans. Treat a null/blank brand as compatible
    // instead of silently losing its committed quantity.
    if (!plan.brand) return true;
    const rowBrand = String(row.brand || '').trim().toLowerCase();
    return !rowBrand || rowBrand === String(plan.brand).trim().toLowerCase();
  });
  const committed = matchingRows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.planned_qty) || 0)), 0);
  return Math.min(Math.max(0, Math.floor(Number(plan.total_qty) || 0)), committed);
};

`;
source = source.replace(helperAnchor, helper + helperAnchor, 1);

const availabilityMarker = "  const serials = pool || [];\n  if (!serials.length) return 0;";
if (!source.includes(availabilityMarker)) throw new Error('Availability serial marker not found.');
source = source.replace(availabilityMarker, "  const serials = pool || [];\n  if (!serials.length) return 0;\n\n  const { data: sourcePlanForUsage, error: sourcePlanForUsageError } = await client\n    .from('monthly_production_plans')\n    .select('id,plan_month,brand,product_name,model,total_qty,status')\n    .eq('id', monthlyPlanId)\n    .maybeSingle();\n  if (sourcePlanForUsageError) throw sourcePlanForUsageError;\n  const committedQty = await getMonthlyPlanCommittedQty(monthlyPlanId, sourcePlanForUsage);", 1);

const availabilityReturn = "  let available = 0;\n  for (const serial of uniquePoolSerials) {\n    if (!usedSerials.has(serial)) available += 1;\n  }\n  return available;";
const availabilityReturnReplacement = "  let serialAvailable = 0;\n  for (const serial of uniquePoolSerials) {\n    if (!usedSerials.has(serial)) serialAvailable += 1;\n  }\n\n  const totalQty = Math.max(0, Math.floor(Number(sourcePlanForUsage?.total_qty) || 0));\n  const committedRemaining = Math.max(0, totalQty - committedQty);\n  return Math.min(serialAvailable, committedRemaining);";
if (!source.includes(availabilityReturn)) throw new Error('Availability return anchor not found.');
source = source.replace(availabilityReturn, availabilityReturnReplacement, 1);

const sourcePlanMarker = "  if (!sourcePlan) return { data: null, error: new Error('Monthly production plan was not found or is not active.') };\n\n  const { data: pool, error: poolError } = await client";
const sourcePlanReplacement = "  if (!sourcePlan) return { data: null, error: new Error('Monthly production plan was not found or is not active.') };\n\n  const committedQty = await getMonthlyPlanCommittedQty(monthlyPlanId, sourcePlan);\n  const totalMonthlyQty = Math.max(0, Math.floor(Number(sourcePlan.total_qty) || 0));\n  if (committedQty >= totalMonthlyQty) {\n    return { data: null, error: new Error(`Monthly plan is already fully committed (${totalMonthlyQty} units). No additional Daily Plan can be created.`) };\n  }\n\n  const { data: pool, error: poolError } = await client";
if (!source.includes(sourcePlanMarker)) throw new Error('Create-plan source marker not found.');
source = source.replace(sourcePlanMarker, sourcePlanReplacement, 1);

const availableCheck = "  if (plannedQty > available.length) {";
const availableCheckReplacement = "  const committedRemaining = Math.max(0, totalMonthlyQty - committedQty);\n  if (plannedQty > committedRemaining) {\n    return { data: null, error: new Error(`Daily planned quantity ${plannedQty} exceeds the ${committedRemaining} units still uncommitted in the monthly plan.`) };\n  }\n\n  if (plannedQty > available.length) {";
if (!source.includes(availableCheck)) throw new Error('Create-plan availability check anchor not found.');
source = source.replace(availableCheck, availableCheckReplacement, 1);

if (source === original) throw new Error('Daily monthly consumption lock made no changes.');
fs.writeFileSync(file, source);
console.log('Daily Plan now uses serial allocation plus existing Daily Plan committed quantity as a hard monthly limit.');
