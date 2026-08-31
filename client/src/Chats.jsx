import { useState } from 'react';
import { api } from './api.js';
import { isNative, openBatterySettings } from './native.js';

const preview = (m) => (m.type === 'text' ? m.body : m.type === 'audio' ? '🎤 Áudio' : `📎 ${m.file?.name || 'Arquivo'}`);
const seen = () => JSON.parse(localStorage.getItem('seen') || '{}');

export default function Chats({ me, setMe, users, convs, onOpen, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const byConv = Object.fromEntries(convs.map((m) => [m.conv, m]));
  const key = (id) => `${Math.min(me.id, id)}:${Math.max(me.id, id)}`;
  const contacts = users.filter((u) => u.id !== me.id).map((u) => ({ ...u, last: byConv[key(u.id)] }))
    .sort((a, b) => (b.last?.id || 0) - (a.last?.id || 0));
  const s = seen();

  const saveName = async () => { const u = await api('/api/me', { method: 'PATCH', body: { name } }); setMe(u); setEditing(false); };

  return (
    <div className="screen">
      <header>
        <span className="title">Comunicador</span>
        <span className="me" onClick={() => setEditing(true)}>{me.name || me.phone}</span>
        <button className="icon" onClick={onLogout} title="Sair">⎋</button>
      </header>
      {editing && (
        <div className="bar"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /><button onClick={saveName}>Salvar</button></div>
      )}
      {isNative && <div className="tip" onClick={openBatterySettings}>Para receber mensagens com o app fechado, desative a otimização de bateria do Comunicador. Toque aqui.</div>}
      <ul className="list">
        {contacts.length === 0 && <li className="empty">Nenhum outro membro da família entrou ainda.</li>}
        {contacts.map((c) => {
          const unread = c.last && c.last.sender_id !== me.id && c.last.id > (s[c.id] || 0);
          return (
            <li key={c.id} onClick={() => onOpen(c)} className={unread ? 'unread' : ''}>
              <div className="avatar">{(c.name || c.phone).slice(0, 1).toUpperCase()}</div>
              <div className="info">
                <div className="name">{c.name || c.phone}</div>
                <div className="prev">{c.last ? preview(c.last) : c.phone}</div>
              </div>
              {c.last && <div className="time">{new Date(c.last.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
