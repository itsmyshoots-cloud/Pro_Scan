import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const original=source;
const replaceExactly=(text,oldValue,newValue,label)=>{
 const count=text.split(oldValue).length-1;
 if(count!==1)throw new Error(label+': expected exactly one match, found '+count);
 return text.replace(oldValue,newValue);
};

// Live View becomes the default workspace for non-operator users.
source=replaceExactly(
 source,
 "const [view,setView]=useState(user?.role==='operator'?'operator':'dashboard');",
 "const [view,setView]=useState(user?.role==='operator'?'operator':'live-monitoring');",
 "default workspace view"
);
source=replaceExactly(
 source,
 "const initialView=user?.role==='operator'?'operator':'dashboard';",
 "const initialView=user?.role==='operator'?'operator':'live-monitoring';",
 "browser history initial view"
);

// Remove the Dashboard navigation button created by the earlier Live View finalizer.
const dashboardButton="<button className={view==='dashboard'?'nav-button is-active':'nav-button'} onClick={()=>setView('dashboard')}>Dashboard</button>";
if(source.includes(dashboardButton))source=replaceExactly(source,dashboardButton,'',"Dashboard navigation");
else if(source.includes('>Dashboard</button>'))throw new Error('A Dashboard-labelled navigation/control remains but did not match the expected source anchor.');

// Completely remove the Dashboard screen JSX. Live View contains the operational monitoring components.
const dashboardView=/\{view==='dashboard'&&<main className='dashboard-page'>[\s\S]*?<\/main>\}/g;
const count=(source.match(dashboardView)||[]).length;
if(count!==1)throw new Error('Expected exactly one Dashboard screen to remove, found '+count);
source=source.replace(dashboardView,'');

// Any navigation that previously returned to Dashboard now returns to Live View.
source=source.replaceAll("setView('dashboard')","setView('live-monitoring')");
source=source.replaceAll(">Dashboard</button>",">Live View</button>");

// Retire Dashboard-only refresh conditions while retaining live monitoring refresh.
source=source.replaceAll("['dashboard','live-monitoring']", "['live-monitoring']");
source=source.replaceAll("['dashboard','live-monitoring'].includes(view)", "['live-monitoring'].includes(view)");
source=source.replaceAll("view==='dashboard'||view==='live-monitoring'", "view==='live-monitoring'");

// Ensure no Dashboard UI route remains in navigation or JSX.
if(source.includes("view==='dashboard'"))throw new Error('Dashboard route condition remains after removal.');
if(source.includes("setView('dashboard')"))throw new Error('Navigation still routes to Dashboard.');
if(source.includes("'>Dashboard</button>"))throw new Error('Dashboard button label remains.');
if(!source.includes("'>Live View</button>"))throw new Error('Live View navigation is missing.');
if(!source.includes("const initialView=user?.role==='operator'?'operator':'live-monitoring';"))throw new Error('Live View is not the default landing screen.');
fs.writeFileSync(file,source);
console.log('Dashboard tab and screen removed. Live View is now the default non-operator workspace.');
