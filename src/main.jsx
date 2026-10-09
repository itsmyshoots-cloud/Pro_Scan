import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { BrowserMultiFormatReader } from '@zxing/browser';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function App() {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const [operator, setOperator] = useState('Operator');
  const [line, setLine] = useState('Line 1');
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('Ready to scan');
  const [lastScan, setLastScan] = useState(null);
  const [stats, setStats] = useState({ scanned: 0, pending: 0, duplicate: 0, invalid: 0 });
  const [recent, setRecent] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);

  async function refreshStats() {
    if (!supabase) return;
    const [{ count: scanned }, { count: pending }, { count: duplicate }, { count: invalid }] = await Promise.all([
      supabase.from('serial_numbers').select('*', { count: 'exact', head: true }).eq('status', 'scanned'),
      supabase.from('serial_numbers').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).eq('scan_status', 'duplicate'),
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).in('scan_status', ['invalid', 'missing'])
    ]);
    setStats({ scanned: scanned || 0, pending: pending || 0, duplicate: duplicate || 0, invalid: invalid || 0 });
    const { data } = await supabase.from('scan_events').select('*').order('scanned_at', { ascending: false }).limit(10);
    setRecent(data || []);
  }

  useEffect(() => {
    refreshStats();
    if (!supabase) return;
    const channel = supabase.channel('pro-scan-live').on('postgres_changes', { event: '*', schema: 'public', table: 'serial_numbers' }, refreshStats).on('postgres_changes', { event: '*', schema: 'public', table: 'scan_events' }, refreshStats).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function processSerial(raw) {
    const serial = raw.trim();
    if (!serial) return;
    setManual('');
    setStatus('Checking ' + serial + '…');
    if (!supabase) {
      setStatus('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    const { data: row, error } = await supabase.from('serial_numbers').select('*').eq('serial_number', serial).maybeSingle();
    if (error) { setStatus('Database error: ' + error.message); return; }
    if (!row) {
      await supabase.from('scan_events').insert({ serial_number: serial, operator_name: operator, production_line: line, scan_status: 'missing' });
      setLastScan({ serial, result: 'MISSING / NOT REGISTERED' });
      setStatus('⚠️ Serial not registered');
      refreshStats();
      return;
    }
    if (row.status === 'scanned') {
      await supabase.from('scan_events').insert({ serial_number_id: row.id, serial_number: serial, operator_name: operator, production_line: line, scan_status: 'duplicate' });
      setLastScan({ serial, result: 'DUPLICATE SCAN' });
      setStatus('🚫 Duplicate scan blocked');
      refreshStats();
      return;
    }
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('serial_numbers').update({ status: 'scanned', scanned_at: now }).eq('id', row.id).eq('status', 'pending');
    if (updateError) { setStatus('Database error: ' + updateError.message); return; }
    await supabase.from('scan_events').insert({ serial_number_id: row.id, serial_number: serial, operator_name: operator, production_line: line, scan_status: 'success', scanned_at: now });
    setLastScan({ serial, result: '✓ SCANNED SUCCESSFULLY' });
    setStatus('✓ Production scan accepted');
    refreshStats();
  }

  async function startCamera() {
    if (cameraOn) return;
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      setCameraOn(true);
      setStatus('Requesting camera permission…');
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current, (result) => {
        if (result) processSerial(result.getText());
      });
      controlsRef.current = controls;
      setStatus('Camera ready — point at the serial barcode');
    } catch (e) {
      setCameraOn(false);
      setStatus('Camera could not start: ' + e.message);
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
    setStatus('Camera stopped');
  }

  return <main className="app">
    <header><div><span className="eyebrow">PRODUCTION CONTROL</span><h1>Pro Scan</h1></div><span className="live">● LIVE</span></header>
    <section className="controls card"><label>Operator<input value={operator} onChange={e => setOperator(e.target.value)} /></label><label>Production line<select value={line} onChange={e => setLine(e.target.value)}><option>Line 1</option><option>Line 2</option><option>Line 3</option></select></label></section>
    <section className="scanner card"><div className="video-wrap"><video ref={videoRef} muted playsInline /></div><div className="scanner-actions"><button onClick={cameraOn ? stopCamera : startCamera}>{cameraOn ? 'Stop Camera' : 'Start Camera Scan'}</button></div><p className="status">{status}</p><div className="manual"><input placeholder="Or enter serial manually" value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && processSerial(manual)} /><button onClick={() => processSerial(manual)}>Scan</button></div></section>
    {lastScan && <section className={'result card ' + (lastScan.result.includes('SUCCESS') ? 'ok' : 'warn')}><small>LAST RESULT</small><strong>{lastScan.result}</strong><span>{lastScan.serial}</span></section>}
    <section className="stats"><Stat label="Scanned" value={stats.scanned} /><Stat label="Pending" value={stats.pending} /><Stat label="Duplicates" value={stats.duplicate} /><Stat label="Invalid / Missing" value={stats.invalid} /></section>
    <section className="card"><div className="section-title"><h2>Recent scans</h2><button className="ghost" onClick={refreshStats}>Refresh</button></div><div className="table">{recent.length ? recent.map(r => <div className="row" key={r.id}><b>{r.serial_number}</b><span>{r.scan_status}</span><small>{new Date(r.scanned_at).toLocaleString()}</small></div>) : <p className="empty">No scans yet.</p>}</div></section>
  </main>
}
function Stat({label,value}) { return <div className="stat card"><span>{label}</span><strong>{value}</strong></div> }
createRoot(document.getElementById('root')).render(<App />);
