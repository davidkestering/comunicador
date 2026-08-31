import { useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, connectWs } from './api.js';
import { startBackground, stopBackground } from './native.js';
import Login from './Login.jsx';
import Chats from './Chats.jsx';
import Chat from './Chat.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [users, setUsers] = useState([]);
  const [convs, setConvs] = useState([]);
  const [open, setOpen] = useState(null);      // contato aberto
  const [incoming, setIncoming] = useState(null); // último evento ws (para o Chat aberto)

  const refresh = useCallback(async () => {
    const [u, c] = await Promise.all([api('/api/users'), api('/api/conversations')]);
    setUsers(u); setConvs(c);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/api/me').then((u) => { setMe(u); startBackground(); }).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const stop = connectWs((ev) => {
      if (ev.t === 'open') refresh();
      if (ev.t === 'new') { setIncoming(ev); refresh(); if (ev.from && document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(ev.from.name, { body: ev.msg.type === 'text' ? ev.msg.body : ev.msg.type === 'audio' ? '🎤 Áudio' : '📎 Arquivo' }); }
    });
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    return () => { stop(); document.removeEventListener('visibilitychange', onVisible); };
  }, [me, refresh]);

  const logout = async () => { await stopBackground(); setToken(null); setMe(null); setOpen(null); };

  if (loading) return <div className="center">Carregando…</div>;
  if (!me) return <Login onLogin={(u) => { setMe(u); startBackground(); }} />;
  if (open) return <Chat me={me} other={open} incoming={incoming} onBack={() => { setOpen(null); refresh(); }} />;
  return <Chats me={me} setMe={setMe} users={users} convs={convs} onOpen={setOpen} onLogout={logout} />;
}
