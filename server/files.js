import { createWriteStream, createReadStream, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { q, DATA_DIR } from './db.js';
import { HttpError, fileUrlValid, userFromToken } from './auth.js';

const FILES_DIR = join(DATA_DIR, 'files');
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export async function saveUpload(req, user) {
  if (Number(req.headers['content-length'] || 0) > MAX_FILE_BYTES) throw new HttpError(413, 'Arquivo maior que 100 MB.');
  const id = randomUUID().replaceAll('-', '');
  const name = basename(decodeURIComponent(req.headers['x-filename'] || 'arquivo')).slice(0, 200) || 'arquivo';
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
  const path = join(FILES_DIR, id);
  let size = 0;
  try {
    await pipeline(req, async function* (src) {
      for await (const chunk of src) {
        size += chunk.length;
        if (size > MAX_FILE_BYTES) throw new HttpError(413, 'Arquivo maior que 100 MB.');
        yield chunk;
      }
    }, createWriteStream(path));
    if (size === 0) throw new HttpError(400, 'Arquivo vazio.');
  } catch (e) { try { unlinkSync(path); } catch {} throw e; }
  q.insertFile.run(id, user.id, name, mime, size);
  return { id, name, mime, size };
}

export async function serveFile(req, res, id, url) {
  const bearer = req.headers.authorization?.replace(/^Bearer /, '');
  const ok = fileUrlValid(id, url.searchParams.get('exp'), url.searchParams.get('sig')) || userFromToken(bearer || url.searchParams.get('token'));
  if (!ok) throw new HttpError(401, 'Link inválido ou expirado.');
  const f = q.fileById.get(id);
  if (!f) throw new HttpError(404, 'Arquivo não encontrado.');
  const path = join(FILES_DIR, id);
  const disposition = url.searchParams.has('download') ? 'attachment' : 'inline';
  res.writeHead(200, {
    'content-type': f.mime,
    'content-length': statSync(path).size,
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'cache-control': 'private, max-age=604800',
  });
  await pipeline(createReadStream(path), res);
}
