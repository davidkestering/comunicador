import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'comunicador-'));
process.env.DATA_DIR = dir;
process.env.ALLOWED_FILE = join(dir, 'allowed.txt');
process.env.PORT = '0';
writeFileSync(process.env.ALLOWED_FILE, '# fam\n+5511999990001\n+55 (11) 99999-0002\n');

const { totp, base32Decode } = await import('./totp.js');
const server = (await import('./index.js')).default;
const { default: WebSocket } = await import('ws');
const { q } = await import('./db.js');
let base;
before(async () => { if (!server.listening) await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

const api = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const raw = body instanceof Uint8Array;
  const res = await fetch(base + path, { method, body: body && !raw ? JSON.stringify(body) : body, headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
  return { status: res.status, data: await res.json() };
};

test('TOTP bate com vetor RFC 6238 (SHA1, t=59s → …287082)', () => {
  assert.equal(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').toString(), '12345678901234567890');
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000), '287082');
});

test('registro fora da lista é negado', async () => {
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { phone: '+5511900000000' } })).status, 403);
});

let tokenA, tokenB, userA, userB;
async function enroll(phone, name) {
  const reg = await api('/api/auth/register', { method: 'POST', body: { phone } });
  assert.equal(reg.status, 200); assert.equal(reg.data.status, 'new');
  assert.match(reg.data.otpauth, /^otpauth:\/\/totp\/comunicador%3A%2B55\d+\?secret=[A-Z2-7]{32}&issuer=comunicador/);
  assert.equal((await api('/api/auth/verify', { method: 'POST', body: { phone, code: '000000', name } })).status, 401);
  const ok = await api('/api/auth/verify', { method: 'POST', body: { phone, code: totp(reg.data.secret), name } });
  assert.equal(ok.status, 200); assert.equal(ok.data.user.name, name);
  return ok.data;
}

test('registro + TOTP + login em segundo aparelho', async () => {
  ({ token: tokenA, user: userA } = await enroll('+5511999990001', 'Ana'));
  ({ token: tokenB, user: userB } = await enroll('+55 (11) 99999-0002', 'Beto'));
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { phone: '+5511999990001' } })).data.status, 'existing');
  const secret = q.userByPhone.get('+5511999990001').totp_secret;
  const login2 = await api('/api/auth/verify', { method: 'POST', body: { phone: '+5511999990001', code: totp(secret) } });
  assert.equal(login2.status, 200); assert.notEqual(login2.data.token, tokenA);
  assert.equal((await api('/api/users', { token: tokenA })).data.length, 2);
  assert.equal((await api('/api/users')).status, 401);
});

test('mensagem de texto chega por WebSocket e por REST', async () => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${tokenB}`);
  const got = new Promise((resolve) => ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'new') resolve(m); }));
  await new Promise((r) => ws.on('open', r));
  assert.equal((await api('/api/messages', { method: 'POST', token: tokenA, body: { to: userB.id, body: 'oi' } })).status, 200);
  const evt = await got;
  assert.equal(evt.msg.body, 'oi'); assert.equal(evt.from.name, 'Ana');
  assert.deepEqual((await api(`/api/messages?with=${userA.id}`, { token: tokenB })).data.map((m) => m.body), ['oi']);
  ws.close();
  const bad = new WebSocket(`${base.replace('http', 'ws')}/ws?token=x`);
  await new Promise((r) => bad.on('error', r));
});

test('upload de áudio, mensagem com link assinado, download', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const up = await api('/api/files', { method: 'PUT', token: tokenA, body: bytes, headers: { 'content-type': 'audio/webm', 'x-filename': 'voz.webm' } });
  assert.equal(up.status, 200); assert.equal(up.data.size, 4);
  const msg = await api('/api/messages', { method: 'POST', token: tokenA, body: { to: userB.id, type: 'audio', file_id: up.data.id } });
  assert.equal(msg.status, 200); assert.match(msg.data.file.url, /^\/api\/files\/[a-f0-9]{32}\?exp=\d+&sig=[a-f0-9]{64}$/);
  const dl = await fetch(base + msg.data.file.url);
  assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'audio/webm');
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()), bytes);
  assert.equal((await fetch(base + msg.data.file.url.replace(/sig=.{4}/, 'sig=0000'))).status, 401);
  const convs = await api('/api/conversations', { token: tokenB });
  assert.equal(convs.data.length, 1); assert.equal(convs.data[0].type, 'audio');
});
