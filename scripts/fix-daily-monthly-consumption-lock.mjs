// Monthly availability is now derived from the monthly serial pool and actual
// serial allocations in src/lib/supabase.js. Do not apply a second limit based
// on production_plans.planned_qty here because that can double-count historical
// or unrelated Daily Plans and under-report the true remaining serial pool.
// The createDailyProductionPlanFromMonthly flow already prevents allocation
// beyond the unique unallocated serials.
console.log('Skipped legacy Daily Plan consumption lock; serial allocation is the source of truth.');
