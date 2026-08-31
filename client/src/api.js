import { Capacitor } from '@capacitor/core';

export const API = Capacitor.isNativePlatform() ? 'https://comunicador.davidkestering.com' : '';
export const getToken = () => localStorage.getItem('token');
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'));

export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    body: raw ? body : body && JSON.stringify(body),
    headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}), ...headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export const upload = (blob, name) => api('/api/files', { method: 'PUT', body: blob, raw: true, headers: { 'content-type': blob.type || 'application/octet-stream', 'x-filename': encodeURIComponent(name) } });

// WebSocket com reconexão (usado enquanto o app está aberto; em segundo plano o serviço nativo assume).
export function connectWs(onEvent) {
  let ws, delay = 1000, closed = false;
  const open = () => {
    if (closed) return;
    ws = new WebSocket(`${(API || location.origin).replace(/^http/, 'ws')}/ws?token=${getToken()}`);
    ws.onopen = () => { delay = 1000; onEvent({ t: 'open' }); };
    ws.onmessage = (e) => onEvent(JSON.parse(e.data));
    ws.onclose = () => { if (!closed) setTimeout(open, delay = Math.min(delay * 2, 30_000)); };
  };
  open();
  return () => { closed = true; ws?.close(); };
}

// Rastro de diagnóstico: vai para data/logs/crash-*.log no servidor (sem adb nos celulares).
// Vai como query de GET /api/me (a requisição que comprovadamente funciona no WebView), em pedaços de 1500 chars.
export async function trace(msg) {
  const text = String(msg);
  for (let i = 0; i < text.length && i < 30_000; i += 1500) await api(`/api/me?diag=${encodeURIComponent(text.slice(i, i + 1500))}`).catch(() => {});
}
