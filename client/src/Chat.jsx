import { useEffect, useRef, useState } from 'react';
import { API, api, upload } from './api.js';

const fmt = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const markSeen = (id, msgId) => { const s = JSON.parse(localStorage.getItem('seen') || '{}'); s[id] = Math.max(s[id] || 0, msgId); localStorage.setItem('seen', JSON.stringify(s)); };

export default function Chat({ me, other, incoming, onBack }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [rec, setRec] = useState(null); // { recorder, started }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bottom = useRef(null);
  const fileInput = useRef(null);

  const load = async () => {
    const after = msgs.at(-1)?.id || 0;
    const list = await api(`/api/messages?with=${other.id}&after=${after}`);
    if (list.length) setMsgs((m) => [...m, ...list.filter((x) => !m.some((y) => y.id === x.id))]);
  };
  useEffect(() => { setMsgs([]); api(`/api/messages?with=${other.id}`).then(setMsgs); }, [other.id]);
  useEffect(() => { if (incoming?.msg && [incoming.msg.sender_id, incoming.msg.recipient_id].includes(other.id)) load(); }, [incoming]);
  useEffect(() => { bottom.current?.scrollIntoView(); if (msgs.length) markSeen(other.id, msgs.at(-1).id); }, [msgs]);

  const send = async (payload) => { setErr(''); setBusy(true); try { await api('/api/messages', { method: 'POST', body: { to: other.id, ...payload } }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const sendText = (e) => { e.preventDefault(); if (text.trim()) { send({ type: 'text', body: text.trim() }); setText(''); } };

  const sendFile = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try { const f = await upload(file, file.name); await send({ type: 'file', file_id: f.id }); } catch (e) { setErr(e.message); setBusy(false); }
  };

  const toggleRecord = async () => {
    if (rec) { rec.recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size < 1000) return; // toque acidental
        setBusy(true);
        try { const f = await upload(blob, `audio-${Date.now()}.webm`); await send({ type: 'audio', file_id: f.id }); } catch (e) { setErr(e.message); setBusy(false); }
      };
      recorder.start();
      setRec({ recorder, started: Date.now() });
    } catch { setErr('Sem permissão para usar o microfone.'); }
  };

  return (
    <div className="screen">
      <header>
        <button className="icon" onClick={onBack}>‹</button>
        <div className="avatar">{(other.name || other.phone).slice(0, 1).toUpperCase()}</div>
        <div className="info"><div className="name">{other.name || other.phone}</div><div className="prev">{other.phone}</div></div>
      </header>
      <div className="msgs">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === me.id ? 'mine' : ''}`}>
            {m.type === 'text' && <span className="body">{m.body}</span>}
            {m.type === 'audio' && <audio controls preload="metadata" src={API + m.file.url} />}
            {m.type === 'file' && <a href={`${API}${m.file.url}&download`} target="_blank" rel="noreferrer">📎 {m.file.name} <small>({(m.file.size / 1024).toFixed(0)} KB)</small></a>}
            <span className="time">{fmt(m.created_at)}</span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {err && <p className="err">{err}</p>}
      <form className="composer" onSubmit={sendText}>
        <input type="file" ref={fileInput} hidden onChange={(e) => { sendFile(e.target.files[0]); e.target.value = ''; }} />
        <button type="button" className="icon" onClick={() => fileInput.current.click()} disabled={busy || !!rec} title="Enviar arquivo">📎</button>
        {rec ? <RecTimer started={rec.started} /> : <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem" disabled={busy} />}
        {text.trim() ? <button className="send" disabled={busy}>➤</button>
          : <button type="button" className={`send ${rec ? 'recording' : ''}`} onClick={toggleRecord} disabled={busy} title={rec ? 'Parar e enviar' : 'Gravar áudio'}>{rec ? '■' : '🎤'}</button>}
      </form>
    </div>
  );
}

function RecTimer({ started }) {
  const [t, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT(Math.floor((Date.now() - started) / 1000)), 500); return () => clearInterval(i); }, [started]);
  return <div className="rectimer">● Gravando {String(Math.floor(t / 60)).padStart(2, '0')}:{String(t % 60).padStart(2, '0')} — toque em ■ para enviar</div>;
}
