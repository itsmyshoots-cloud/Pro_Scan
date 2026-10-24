import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');

// This is the LAST build-time patch. The previous version only replaced a
// few exact call patterns, which could leave a refreshPlans() call without a
// matching definition in the generated workspace. Normalize the function and
// every zero-argument invocation in one pass, then fail the build if the
// definition is still missing. A broken workspace must never be deployed.
const definitionPattern=/\bconst\s+load\s*=\s*async\s*\(\s*\)\s*=>/;
const refreshDefinition='async function refreshPlans()';

if(definitionPattern.test(source)){
  source=source.replace(definitionPattern,refreshDefinition);
}

// If an earlier layer already renamed the definition, normalize it to a
// function declaration so it is resilient to the accumulated patch layers.
source=source.replace(/\bconst\s+refreshPlans\s*=\s*async\s*\(\s*\)\s*=>/g,refreshDefinition);

// Rename all zero-argument calls. This covers useEffect callbacks and JSX
// event handlers, not only await/void forms.
source=source.replace(/\bload\s*\(\s*\)/g,'refreshPlans()');

// Normalize the only known function-object dependency if an older layer left it.
source=source.replace(/\{\s*load\s*,\s*refreshMonitoring\s*,\s*refreshPlanMetrics\s*,/g,'{refreshPlans,refreshMonitoring,refreshPlanMetrics,');

if(!/\basync function refreshPlans\s*\(\s*\)/.test(source)){
  throw new Error('Runtime plan refresh fix failed: refreshPlans definition was not found in src/App.jsx. Refusing to build a broken workspace.');
}

if(/\bload\s*\(\s*\)/.test(source)){
  throw new Error('Runtime plan refresh fix failed: a load() call remains in src/App.jsx. Refusing to build a broken workspace.');
}

fs.writeFileSync(file,source);
console.log('Runtime plan refresh normalized to a real refreshPlans() function and all calls were updated.');
