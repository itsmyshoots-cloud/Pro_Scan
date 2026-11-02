import fs from 'fs';
const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const old="if(new Set(serialKeys).size!==serialKeys.length)throw new Error('Duplicate serial numbers were found inside this file.'); if(new Set(labelKeys).size!==labelKeys.length)throw new Error('Duplicate labels were found inside this file.');";
const replacement="const duplicateSerials=[...new Set(serialKeys.filter((value,index)=>serialKeys.indexOf(value)!==index))]; const duplicateLabels=[...new Set(labelKeys.filter((value,index)=>labelKeys.indexOf(value)!==index))]; if(duplicateSerials.length)throw new Error('PDF parser returned '+parsed.length.toLocaleString()+' rows with '+duplicateSerials.length.toLocaleString()+' duplicate serial value(s): '+duplicateSerials.slice(0,10).join(', ')); if(duplicateLabels.length)throw new Error('PDF parser returned '+parsed.length.toLocaleString()+' rows with '+duplicateLabels.length.toLocaleString()+' duplicate label value(s): '+duplicateLabels.slice(0,10).join(', '));";
if(!source.includes(old)) throw new Error('Monthly duplicate validation anchor not found.');
source=source.replace(old,replacement);
fs.writeFileSync(file,source);
console.log('Monthly PDF diagnostic validation injected.');
