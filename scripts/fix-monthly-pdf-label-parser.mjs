import fs from 'fs';

const file='src/App.jsx';
let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('async function parseSupplierPdf(');
const end=source.indexOf('function validatePairs(',start);
if(start<0||end<0) throw new Error('Monthly PDF parser boundaries not found.');

const replacement=`async function parseSupplierPdf(file,onProgress){
 // Supplier PDFs can contain QR images plus visible text labels. PDF.js may
 // expose repeated/hidden text-layer tokens at different coordinates and even
 // repeat the same value on multiple pages. Pair visible label/serial values by
 // proximity and keep a GLOBAL value set across the entire PDF.
 const [pdfjsModule,workerModule]=await Promise.all([
  import('pdfjs-dist/legacy/build/pdf.mjs'),
  import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
 ]);
 pdfjsModule.GlobalWorkerOptions.workerSrc=workerModule.default;
 const pdf=await pdfjsModule.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const pageCount=pdf.numPages,rows=[];
 const POSITION_TOLERANCE=4;
 const pairXDistance=12;
 const minSerialYOffset=-12;
 const maxSerialYOffset=12;
 const globalSerialValues=new Set();
 const globalLabelValues=new Set();
 const uniqueVisible=(tokens)=>{
  const result=[];
  const seen=new Set();
  for(const token of tokens){
   const coordinateKey=token.token+'|'+Math.round(token.x/POSITION_TOLERANCE)+'|'+Math.round(token.y/POSITION_TOLERANCE);
   if(seen.has(coordinateKey))continue;
   seen.add(coordinateKey);
   result.push(token);
  }
  return result;
 };
 const collect=(items,regex,pageNo)=>{
  const tokens=[];
  for(const item of items){
   const text=String(item.str||'');
   if(!text)continue;
   const transform=Array.isArray(item.transform)?item.transform:[];
   const x=Number(transform[4]||0),y=Number(transform[5]||0);
   regex.lastIndex=0;
   let match;
   while((match=regex.exec(text))!==null){
    tokens.push({token:match[0].toUpperCase(),pageNo,x,y});
    if(match[0].length===0)regex.lastIndex++;
   }
  }
  return uniqueVisible(tokens);
 };
 try{
  for(let pageNo=1;pageNo<=pageCount;pageNo++){
   const page=await pdf.getPage(pageNo),content=await page.getTextContent();
   const items=content.items||[];
   const labels=collect(items,/\\b(?:P|U)-\\d+\\b/gi,pageNo);
   const serials=collect(items,/\\bGM\\d+\\b/gi,pageNo);
   const pageSerialValues=new Set();
   const pageLabelValues=new Set();
   const pageRows=[];
   for(const label of labels){
    if(globalLabelValues.has(label.token)||pageLabelValues.has(label.token))continue;
    const candidates=serials.filter(serial=>{
     if(globalSerialValues.has(serial.token)||pageSerialValues.has(serial.token))return false;
     const dx=Math.abs(serial.x-label.x),dy=serial.y-label.y;
     return dx<=pairXDistance&&dy>=minSerialYOffset&&dy<=maxSerialYOffset;
    }).sort((a,b)=>{
     const scoreA=Math.abs(a.x-label.x)+Math.abs(a.y-label.y)*2;
     const scoreB=Math.abs(b.x-label.x)+Math.abs(b.y-label.y)*2;
     return scoreA-scoreB;
    });
    if(candidates.length){
     const serial=candidates[0];
     pageLabelValues.add(label.token);
     pageSerialValues.add(serial.token);
     globalLabelValues.add(label.token);
     globalSerialValues.add(serial.token);
     pageRows.push({label_number:label.token,serial_number:serial.token});
    }
   }
   // Hidden/repeated PDF.js tokens are intentionally ignored. Only fail when
   // a page has visible unique labels/serials that cannot be paired at all.
   const uniquePageLabels=[...new Set(labels.map(x=>x.token))].filter(value=>!globalLabelValues.has(value)||pageLabelValues.has(value));
   const uniquePageSerials=[...new Set(serials.map(x=>x.token))].filter(value=>!globalSerialValues.has(value)||pageSerialValues.has(value));
   if(!pageRows.length&&labels.length&&serials.length)throw new Error('No label/serial pairs found on PDF page '+pageNo+'.');
   if(!pageRows.length&&(!labels.length||!serials.length))throw new Error('PDF extraction found '+new Set(labels.map(x=>x.token)).size+' labels and '+new Set(serials.map(x=>x.token)).size+' serials on page '+pageNo+'.');
   rows.push(...pageRows);
   page.cleanup();
   if(pageNo%50===0){onProgress('Reading PDF page '+pageNo.toLocaleString()+' of '+pageCount.toLocaleString()+'…');await new Promise(resolve=>setTimeout(resolve,0));}
  }
 }finally{await pdf.destroy();}
 if(!rows.length)throw new Error('No label/serial text found. This may be an image-only PDF; use a searchable PDF or CSV/TXT export.');
 if(new Set(rows.map(row=>row.serial_number)).size!==rows.length)throw new Error('PDF parser could not produce unique serial numbers.');
 if(new Set(rows.map(row=>row.label_number)).size!==rows.length)throw new Error('PDF parser could not produce unique labels.');
 return {rows,pages:pageCount};
}
`;
source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(file,source);
console.log('PDF parser updated: globally deduplicates repeated PDF.js serial/label values before pairing.');
