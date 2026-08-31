import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { DATA_DIR } from './db.js';
import { HttpError, register, verify, userFromToken } from './auth.js';
import { saveUpload, serveFile } from './files.js';
import { listUsers, setName, listMessages, listConversations, sendMessage } from './api.js';

const PORT = Number(process.env.PORT || 3000);
const ORIGINS = (process.env.ORIGINS || 'https://localhost').split(',');
const PUBLIC_DIR = join(import.meta.dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.apk': 'application/vnd.android.package-archive', '.webmanifest': 'application/manifest+json' };

const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function readJson(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 65_536) throw new HttpError(413, 'Corpo grande demais.'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'JSON inválido.'); }
}
function requireUser(req) {
  const u = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!u?.verified) throw new HttpError(401, 'Faça login.');
  return u;
}

// --- WebSocket: userId -> Set<ws>
const sockets = new Map();
function notify(userId, payload) {
  const data = JSON.stringify(payload);
  for (const ws of sockets.get(userId) || []) if (ws.readyState === ws.OPEN) ws.send(data);
}

// Diagnóstico vindo dos celulares -> data/logs/crash-AAAA-MM-DD.log + docker logs
function logDiag(req, text) {
  const entry = `[crash ${new Date().toLocaleString('sv-SE')} ip=${req.headers['x-real-ip'] || req.socket.remoteAddress}]\n${text}\n\n`; // hora local (TZ do container)
  mkdirSync(join(DATA_DIR, 'logs'), { recursive: true });
  appendFileSync(join(DATA_DIR, 'logs', `crash-${new Date().toISOString().slice(0, 10)}.log`), entry);
  console.error(entry);
}

const routes = [
  ['GET', /^\/health$/, (req, url) => { const d = url.searchParams.get('diag'); if (d) logDiag(req, d); return { ok: true }; }],
  ['POST', /^\/api\/auth\/register$/, async (req) => register((await readJson(req)).phone)],
  ['POST', /^\/api\/auth\/verify$/, async (req) => { const b = await readJson(req); return verify(b.phone, b.code, b.name); }],
  ['GET', /^\/api\/me$/, (req, url) => { const u = requireUser(req); const d = url.searchParams.get('diag'); if (d) logDiag(req, `[user ${u.id}] ${d}`); return u; }],
  ['PATCH', /^\/api\/me$/, async (req) => setName(requireUser(req), (await readJson(req)).name)],
  ['GET', /^\/api\/users$/, (req) => { requireUser(req); return listUsers(); }],
  ['GET', /^\/api\/conversations$/, (req) => listConversations(requireUser(req))],
  ['GET', /^\/api\/messages$/, (req, url) => listMessages(requireUser(req), url.searchParams.get('with'), url.searchParams.get('after'))],
  ['POST', /^\/api\/messages$/, async (req) => {
    const user = requireUser(req);
    const msg = sendMessage(user, await readJson(req));
    notify(msg.recipient_id, { t: 'new', msg, from: { id: user.id, name: user.name || user.phone } });
    notify(user.id, { t: 'new', msg });
    return msg;
  }],
  ['PUT', /^\/api\/files$/, (req) => saveUpload(req, requireUser(req))],
  ['POST', /^\/api\/crash$/, async (req) => { // relatório de crash do APK (sem adb nos celulares)
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 65_536) break; }
    if (raw.startsWith('{')) { try { raw = JSON.parse(raw).text ?? raw; } catch {} }
    logDiag(req, raw); return { ok: true };
  }],
];

function serveStatic(req, res, pathname) {
  let file = pathname === '/comunicador.apk' ? join(DATA_DIR, 'comunicador.apk') : join(PUBLIC_DIR, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(PUBLIC_DIR, pathname.startsWith('/app') ? 'app/index.html' : 'index.html'); // SPA fallback
  if (!existsSync(file)) return json(res, 404, { error: 'Não encontrado.' });
  const ext = extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': statSync(file).size, 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-filename');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    const fileMatch = req.method === 'GET' && url.pathname.match(/^\/api\/files\/([a-f0-9]{32})$/);
    if (fileMatch) return await serveFile(req, res, fileMatch[1], url);
    for (const [method, re, handler] of routes) {
      if (req.method === method && re.test(url.pathname)) return json(res, 200, await handler(req, url));
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    json(res, 404, { error: 'Rota não encontrada.' });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Erro interno.' });
    else res.destroy();
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const user = url.pathname === '/ws' ? userFromToken(url.searchParams.get('token')) : null;
  if (!user?.verified) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', () => { ws.alive = true; });
    if (!sockets.has(user.id)) sockets.set(user.id, new Set());
    sockets.get(user.id).add(ws);
    console.log(`[ws] open user=${user.id} ua=${req.headers['user-agent'] || '?'}`);
    ws.on('close', (code) => { sockets.get(user.id)?.delete(ws); console.log(`[ws] close user=${user.id} code=${code}`); });
    ws.send(JSON.stringify({ t: 'hello', user }));
  });
});
setInterval(() => {
  for (const set of sockets.values()) for (const ws of set) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 30_000).unref();

server.listen(PORT, () => console.log(`comunicador-api on :${PORT}`));
export default server;
