import { useState } from 'react';
import QRCode from 'qrcode';
import { api, setToken } from './api.js';

export default function Login({ onLogin }) {
  const [phone, setPhone] = useState('+55');
  const [name, setName] = useState('');
  const [step, setStep] = useState('phone'); // phone | qr | code
  const [reg, setReg] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  const register = () => run(async () => {
    const r = await api('/api/auth/register', { method: 'POST', body: { phone } });
    setReg(r);
    if (r.status === 'new') { setQr(await QRCode.toDataURL(r.otpauth, { width: 240, margin: 1 })); setStep('qr'); }
    else setStep('code');
  });

  const verify = () => run(async () => {
    const r = await api('/api/auth/verify', { method: 'POST', body: { phone, code, name } });
    setToken(r.token); onLogin(r.user);
  });

  return (
    <div className="login">
      <h1>Comunicador</h1>
      {step === 'phone' && (
        <form onSubmit={(e) => { e.preventDefault(); register(); }}>
          <label>Seu número (com DDI e DDD)<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" autoFocus /></label>
          <label>Seu nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como a família te chama" maxLength={60} /></label>
          <button disabled={busy}>Continuar</button>
        </form>
      )}
      {step === 'qr' && (
        <div>
          <p>1. Abra o <b>Google Authenticator</b> e escaneie este código (ou toque em <i>Inserir chave de configuração</i> e digite a chave abaixo).</p>
          <img src={qr} alt="QR" className="qr" />
          <p className="secret">{reg.secret}</p>
          <p>Vai aparecer como <b>comunicador ({reg.phone})</b>.</p>
          <button onClick={() => setStep('code')}>2. Já adicionei, digitar o código</button>
        </div>
      )}
      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <p>Digite o código de 6 dígitos que aparece no Google Authenticator em <b>comunicador ({reg?.phone || phone})</b>.</p>
          <input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="code" autoFocus />
          <button disabled={busy || code.length !== 6}>Entrar</button>
          <button type="button" className="link" onClick={() => setStep('phone')}>Voltar</button>
        </form>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
