import { q, convKey } from './db.js';
import { HttpError, fileUrl } from './auth.js';

export const withUrl = (m) => (m.file_id ? { ...m, file: { ...q.fileById.get(m.file_id), url: fileUrl(m.file_id) } } : m);

export const listUsers = () => q.verifiedUsers.all();

export function setName(user, name) {
  const n = String(name ?? '').trim().slice(0, 60);
  if (!n) throw new HttpError(400, 'Nome vazio.');
  q.setName.run(n, user.id);
  return q.userById.get(user.id);
}

export function listMessages(user, withId, after = 0) {
  const other = q.userById.get(Number(withId));
  if (!other) throw new HttpError(404, 'Contato não encontrado.');
  return q.messagesAfter.all(convKey(user.id, other.id), Number(after) || 0).map(withUrl);
}

export const listConversations = (user) => q.lastPerConv.all(user.id, user.id).map(withUrl);

export function sendMessage(user, { to, type = 'text', body = '', file_id = null }) {
  const other = q.userById.get(Number(to));
  if (!other?.verified) throw new HttpError(404, 'Contato não encontrado.');
  if (!['text', 'audio', 'file'].includes(type)) throw new HttpError(400, 'Tipo inválido.');
  if (type === 'text' && !String(body).trim()) throw new HttpError(400, 'Mensagem vazia.');
  if (type !== 'text' && !q.fileById.get(String(file_id))) throw new HttpError(400, 'Arquivo inválido.');
  const msg = q.insertMessage.get(convKey(user.id, other.id), user.id, other.id, type, String(body).slice(0, 10_000), type === 'text' ? null : file_id);
  return withUrl(msg);
}
