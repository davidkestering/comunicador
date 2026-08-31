// Uso: node admin.js reset +5511999999999   (apaga usuário para registrar de novo)
//      node admin.js users
import { q } from './db.js';
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'reset') { const r = q.deleteUser.run('+' + String(arg).replace(/\D/g, '')); console.log(r.changes ? 'removido' : 'não encontrado'); }
else if (cmd === 'users') console.table(q.verifiedUsers.all());
else console.log('comandos: reset <telefone> | users');
