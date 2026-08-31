import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import { join } from 'node:path';
import { q, DATA_DIR } from './db.js';
import { generateSecret, check, keyUri } from './totp.js';

const ALLOWED_FILE = process.env.ALLOWED_FILE || join(import.meta.dirname, '..', 'allowed.txt');
const SECRET_FILE = join(DATA_DIR, 'secret');
if (!existsSync(SECRET_FILE)) writeFileSync(SECRET_FILE, randomBytes(32).toString('hex'), { mode: 0o600 });
const SERVER_SECRET = readFileSync(SECRET_FILE, 'utf8').trim();

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function normalizePhone(raw) {
  const p = '+' + String(raw ?? '').replace(/\D/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(p)) throw new HttpError(400, 'Número inválido. Use o formato +5511999999999');
  return p;
}

// Lido a cada chamada: editar allowed.txt não exige reiniciar.
export function isAllowed(phone) {
  if (!existsSync(ALLOWED_FILE)) return false;
  return readFileSync(ALLOWED_FILE, 'utf8').split('\n')
    .map((l) => l.replace(/#.*/, '').replace(/\D/g, ''))
    .some((digits) => digits && '+' + digits === phone);
}

export function register(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!isAllowed(phone)) throw new HttpError(403, 'Este número não está na lista de permitidos.');
  const user = q.userByPhone.get(phone);
  if (user?.verified) return { status: 'existing', phone };
  const secret = generateSecret();
  if (user) q.resetSecret.run(secret, user.id);
  else q.insertUser.run(phone, secret);
  return { status: 'new', phone, secret, otpauth: keyUri(phone, secret) };
}

// ponytail: limite em memória, 5 tentativas / 5 min por número
const attempts = new Map();
function throttle(phone) {
  const now = Date.now();
  const list = (attempts.get(phone) || []).filter((t) => now - t < 300_000);
  if (list.length >= 5) throw new HttpError(429, 'Muitas tentativas. Aguarde 5 minutos.');
  list.push(now); attempts.set(phone, list);
}

export function verify(rawPhone, code, name = '') {
  const phone = normalizePhone(rawPhone);
  const user = q.userByPhone.get(phone);
  if (!user) throw new HttpError(404, 'Número não registrado.');
  throttle(phone);
  if (!/^\d{6}$/.test(String(code ?? '').trim()) || !check(code, user.totp_secret)) throw new HttpError(401, 'Código incorreto.');
  attempts.delete(phone);
  q.verifyUser.run(String(name ?? '').trim().slice(0, 60), user.id);
  const token = randomBytes(32).toString('hex');
  q.insertDevice.run(user.id, token);
  return { token, user: q.userById.get(user.id) };
}

export const userFromToken = (token) => (token ? q.userByToken.get(token) : undefined) || null;

// Links de arquivo assinados (para <audio src> e download pelo navegador, que não enviam headers).
const sign = (id, exp) => createHmac('sha256', SERVER_SECRET).update(`${id}:${exp}`).digest('hex');
export function fileUrl(id, ttlMs = 7 * 86_400_000) {
  const exp = Date.now() + ttlMs;
  return `/api/files/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}
export function fileUrlValid(id, exp, sig) {
  return Number(exp) > Date.now() && typeof sig === 'string' && sig === sign(id, exp);
}
