from pathlib import Path

path = Path('src/App.jsx')
source = path.read_text(encoding='utf-8')
marker = " const fetchAllRows=async queryBuilder=>{"

if "proscan-carry-forward-live" in source:
    print("Carry-forward UI already present; nothing to do.")
    raise SystemExit(0)

if marker not in source:
    raise SystemExit("Insertion marker not found in src/App.jsx")

block = """
 useEffect(()=>{
  if(typeof document==='undefined'||document.getElementById('proscan-carry-forward-live'))return;
  const root=document.createElement('div');root.id='proscan-carry-forward-live';
  const button=document.createElement('button');button.textContent='↪ Carry Forward';button.title='View carry-forward production plans';
  Object.assign(button.style,{position:'fixed',right:'22px',bottom:'22px',zIndex:'9998',border:'0',borderRadius:'14px',padding:'12px 16px',background:'#111827',color:'#fff',fontWeight:'800',cursor:'pointer',boxShadow:'0 10px 30px rgba(0,0,0,.18)'});
  const modal=document.createElement('div');Object.assign(modal.style,{position:'fixed',inset:'0',zIndex:'9999',display:'none',alignItems:'center',justifyContent:'center',padding:'20px',background:'rgba(15,23,42,.45)'});
  const panel=document.createElement('div');Object.assign(panel.style,{width:'min(1050px,96vw)',maxHeight:'88vh',overflow:'auto',background:'#fff',borderRadius:'20px',padding:'24px',boxShadow:'0 24px 80px rgba(0,0,0,.28)'});modal.appendChild(panel);root.append(button,modal);document.body.appendChild(root);
  const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const qty=v=>Number(v||0).toLocaleString('en-IN');
  const clock=v=>{if(!v)return '—';const a=String(v).slice(0,5).split(':').map(Number);return Number.isFinite(a[0])?`${String(a[0]%12||12).padStart(2,'0')}:${String(a[1]||0).padStart(2,'0')} ${a[0]>=12?'PM':'AM'}`:String(v)};
  const shift=p=>{const h=(Array.isArray(p?.hourly_targets)?p.hourly_targets:[]).map(r=>String(r.hour||'').slice(0,5)).filter(Boolean).sort();if(!h.length)return '—';const z=h[h.length-1].split(':').map(Number),end=z[0]*60+z[1]+60;return `${clock(h[0])} – ${clock(String(Math.floor((end%(24*60))/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0'))}`};
  const close=()=>modal.style.display='none';
  const render=async()=>{
   panel.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px"><div><div style="font-size:22px;font-weight:800;color:#111827">Carry Forward Production</div><div style="font-size:13px;color:#64748b;margin-top:5px">Pending production moved from an earlier plan into a later shift.</div></div><div><button id="cf-refresh" style="border:0;border-radius:10px;padding:8px 12px;background:#e2e8f0;font-weight:700;cursor:pointer">↻ Refresh</button> <button id="cf-close" style="border:0;border-radius:10px;padding:8px 12px;background:#e2e8f0;font-weight:700;cursor:pointer">Close</button></div></div><div id="cf-body" style="text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:14px;padding:32px">Loading…</div>';
   modal.style.display='flex';panel.querySelector('#cf-close').onclick=close;panel.querySelector('#cf-refresh').onclick=render;
   const r=await supabase.from('production_plans').select('*').order('production_date',{ascending:false}).order('created_at',{ascending:false}).limit(500);
   const body=panel.querySelector('#cf-body');
   if(r.error){body.textContent='Unable to load carry-forward plans: '+r.error.message;return;}
   const all=r.data||[],map=new Map(all.map(p=>[p.id,p])),items=all.filter(p=>p.carry_forward_from_plan_id||Number(p.carry_forward_qty||0)>0||p.carry_forward_plan_id);
   if(!items.length){body.innerHTML='<b>No carry-forward plans yet</b><br>When pending production is carried into another shift, it will appear here.';return;}
   body.remove();
   for(const p of items){
    const prev=p.carry_forward_from_plan_id?map.get(p.carry_forward_from_plan_id):null,carry=Number(p.carry_forward_qty||0),cap=Number(p.shift_planned_qty??p.planned_qty??0);
    const card=document.createElement('div');Object.assign(card.style,{border:'1px solid #e2e8f0',borderRadius:'16px',padding:'16px',margin:'12px 0',background:'#f8fafc'});
    card.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><b>'+esc(p.production_date||'—')+' · '+esc(p.production_line||'—')+' · '+esc(p.shift_name||'—')+'</b><div style="font-size:13px;color:#64748b;margin-top:4px">'+esc(p.brand||'')+' · '+esc(p.product_name||'')+' · '+esc(p.model||'')+'</div></div><span style="padding:6px 10px;border-radius:999px;background:#fff7ed;color:#c2410c;font-size:12px;font-weight:800">'+qty(carry)+' units carried</span></div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px">'+
      [['Previous plan',prev?.production_date||'—'],['Previous shift',(prev?.shift_name||'—')+' · '+(prev?shift(prev):'—')],['Carry-forward',qty(carry)+' units'],['Current capacity',qty(cap)+' units'],['Current shift',(p.shift_name||'—')+' · '+shift(p)],['Manpower',qty(p.manpower_count)+' people'],['Source status',prev?.status||'—'],['Current status',p.status||'—']].map(([label,value])=>'<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px"><div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:800">'+label+'</div><div style="font-size:14px;font-weight:750;color:#111827;margin-top:4px">'+esc(value)+'</div></div>').join('')+'</div>';
    panel.appendChild(card);
   }
   panel.querySelector('#cf-close').onclick=close;panel.querySelector('#cf-refresh').onclick=render;
  };
  button.onclick=render;modal.onclick=e=>{if(e.target===modal)close();};
  return()=>{root.remove();};
 },[]);
"""

path.write_text(source.replace(marker, block + marker, 1), encoding='utf-8')
print('Carry-forward UI inserted into src/App.jsx')
