import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || join(import.meta.dirname, '..', 'data');
mkdirSync(join(DATA_DIR, 'files'), { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH || join(DATA_DIR, 'comunicador.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
    totp_secret TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, conv TEXT NOT NULL, sender_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text','audio','file')), body TEXT NOT NULL DEFAULT '', file_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE INDEX IF NOT EXISTS messages_conv ON messages(conv, id);
`);

// Chave canônica da conversa 1:1 — ponytail: grupos viram tabela própria quando existirem.
export const convKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;

export const q = {
  userByPhone: db.prepare('SELECT * FROM users WHERE phone = ?'),
  userById: db.prepare('SELECT id, phone, name, verified FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (phone, totp_secret) VALUES (?, ?)'),
  resetSecret: db.prepare('UPDATE users SET totp_secret = ?, verified = 0 WHERE id = ?'),
  verifyUser: db.prepare('UPDATE users SET verified = 1, name = COALESCE(NULLIF(?, \'\'), name) WHERE id = ?'),
  setName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE phone = ?'),
  verifiedUsers: db.prepare('SELECT id, phone, name FROM users WHERE verified = 1 ORDER BY name, phone'),
  insertDevice: db.prepare('INSERT INTO devices (user_id, token) VALUES (?, ?)'),
  userByToken: db.prepare('SELECT u.id, u.phone, u.name, u.verified FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token = ?'),
  insertFile: db.prepare('INSERT INTO files (id, owner_id, name, mime, size) VALUES (?, ?, ?, ?, ?)'),
  fileById: db.prepare('SELECT * FROM files WHERE id = ?'),
  insertMessage: db.prepare('INSERT INTO messages (conv, sender_id, recipient_id, type, body, file_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'),
  messagesAfter: db.prepare('SELECT * FROM messages WHERE conv = ? AND id > ? ORDER BY id LIMIT 500'),
  lastPerConv: db.prepare(`SELECT m.* FROM messages m JOIN (SELECT conv, MAX(id) id FROM messages WHERE sender_id = ? OR recipient_id = ? GROUP BY conv) l ON l.id = m.id`),
};
