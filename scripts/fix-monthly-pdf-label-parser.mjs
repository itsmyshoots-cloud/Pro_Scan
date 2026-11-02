import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('async function parseSupplierPdf(');
const end=source.indexOf('function validatePairs(',start);
if(start<0||end<0) throw new Error('Monthly PDF parser boundaries not found.');

const replacement=`async function parseSupplierPdf(file,onProgress){
 // PDF.js can expose the same visible text more than once when a supplier PDF
 // contains overlapping/hidden text layers. De-duplicate only exact token+position
 // repeats so genuine duplicate serials at different positions are still rejected.
 const [pdfjsModule,workerModule]=await Promise.all([
  import('pdfjs-dist/legacy/build/pdf.mjs'),
  import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
 ]);
 pdfjsModule.GlobalWorkerOptions.workerSrc=workerModule.default;
 const pdf=await pdfjsModule.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const pageCount=pdf.numPages,labels=[],serials=[];
 const seenLabels=new Set(),seenSerials=new Set();
 const collectTokens=(items,regex,seen,target,pageNo)=>{
  for(const item of items){
   const text=String(item.str||'');
   if(!text)continue;
   const transform=Array.isArray(item.transform)?item.transform:[];
   const x=Number(transform[4]||0),y=Number(transform[5]||0);
   const position=x.toFixed(2)+','+y.toFixed(2);
   regex.lastIndex=0;
   let match;
   while((match=regex.exec(text))!==null){
    const token=match[0].toUpperCase();
    const key=pageNo+'|'+position+'|'+token;
    if(!seen.has(key)){seen.add(key);target.push(token);}
    if(match[0].length===0)regex.lastIndex++;
   }
  }
 };
 try{
  for(let pageNo=1;pageNo<=pageCount;pageNo++){
   const page=await pdf.getPage(pageNo),content=await page.getTextContent();
   const items=content.items||[];
   collectTokens(items,/\\b(?:P|U)-\\d+\\b/gi,seenLabels,labels,pageNo);
   collectTokens(items,/\\bGM\\d+\\b/gi,seenSerials,serials,pageNo);
   page.cleanup();
   if(pageNo%50===0){onProgress('Reading PDF page '+pageNo.toLocaleString()+' of '+pageCount.toLocaleString()+'…');await new Promise(resolve=>setTimeout(resolve,0));}
  }
 }finally{await pdf.destroy();}
 if(labels.length!==serials.length)throw new Error('PDF extraction found '+labels.length+' labels and '+serials.length+' serials. The PDF may be incomplete.');
 if(!labels.length)throw new Error('No label/serial text found. This may be an image-only PDF; use a searchable PDF or CSV/TXT export.');
 return {rows:labels.map((label_number,i)=>({label_number,serial_number:serials[i]})),pages:pageCount};
}
`;
source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(file,source);
console.log('PDF parser updated: removes only exact duplicate token/position text-layer repeats while preserving genuine duplicate serial detection.');
