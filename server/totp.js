// TOTP RFC 6238 (SHA1, 6 dígitos, 30s) — compatível com Google Authenticator.
import { createHmac, randomBytes } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export function base32Decode(s) {
  let bits = '';
  for (const c of s.toUpperCase().replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export const generateSecret = () => base32Encode(randomBytes(20));

export function totp(secret, time = Date.now(), step = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

// Aceita janela de ±1 passo (relógio do celular ligeiramente fora).
export function check(code, secret, time = Date.now()) {
  return [-1, 0, 1].some((w) => totp(secret, time + w * 30_000) === String(code).trim());
}

export const keyUri = (phone, secret) =>
  `otpauth://totp/${encodeURIComponent('comunicador:' + phone)}?secret=${secret}&issuer=comunicador&algorithm=SHA1&digits=6&period=30`;
