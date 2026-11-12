import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function Login({ onLogin }) {
  const [err, setErr] = useState('');
  const [googleId, setGoogleId] = useState(null);
  const [qr, setQr] = useState(null);
  const [qrImg, setQrImg] = useState('');
  const [qrNote, setQrNote] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    api('/config').then((c) => setGoogleId(c.googleClientId)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!googleId || window.__pvGsi) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      try {
        window.__pvGsi = true;
        window.google.accounts.id.initialize({
          client_id: googleId,
          callback: async (resp) => {
            try {
              const r = await api('/auth/google', { method: 'POST', body: { idToken: resp.credential } });
              onLogin(r.user); nav('/');
            } catch (e) { setErr(e.message); }
          },
        });
        window.google.accounts.id.renderButton(document.getElementById('pv-google-btn'), { theme: 'filled_black', size: 'large', width: 360 });
      } catch {}
    };
    document.body.appendChild(s);
  }, [googleId, onLogin, nav]);
  const startQr = async () => {
    try {
      const r = await api('/qrlogin/request', { method: 'POST' });
      const payload = `pixelvault://qrlogin?token=${encodeURIComponent(r.token)}`;
      const img = await QRCode.toDataURL(payload, { width: 220, margin: 1 });
      setQrImg(img); setQr(r.token); setQrNote('');
    } catch { setQrNote('Could not start QR login.'); }
  };
  useEffect(() => {
    if (!qr) return;
    const poll = setInterval(async () => {
      try {
        const s = await api('/qrlogin/status?token=' + qr);
        if (s.status === 'confirmed') {
          clearInterval(poll);
          const a = await api('/qrlogin/activate', { method: 'POST', body: { token: qr } });
          onLogin(a.user); nav('/');
        } else if (s.status === 'expired') {
          clearInterval(poll); setQr(null); setQrImg(''); setQrNote('Code expired — tap to try again.');
        }
      } catch {}
    }, 1500);
    return () => clearInterval(poll);
  }, [qr, onLogin, nav]);
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); onLogin(r.user); nav('/'); }
    catch (er) { setErr(er.message); }
  };
  return (
    <div className="auth-box">
      <h1>Login</h1>
      {err && <p className="err">{err}</p>}
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input name="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button className="cta-btn">Login</button>
      </form>
      <div className="row" style={{ alignItems: 'center', margin: '14px 0' }}>
        <div className="rail-sep" style={{ flex: 1 }} /><span className="tiny">or</span><div className="rail-sep" style={{ flex: 1 }} />
      </div>
      {qrImg ? (
        <div style={{ textAlign: 'center' }}>
          <img src={qrImg} alt="QR login code" style={{ width: 200, height: 200, background: '#fff', borderRadius: 8 }} />
          <p className="tiny">{qrNote || 'Open the PixelVault app and scan to sign in.'}</p>
        </div>
      ) : (
        <button type="button" className="ghost-btn" style={{ width: '100%' }} onClick={startQr}>Scan to log in</button>
      )}
      {googleId ? (
        <>
          <div className="row" style={{ alignItems: 'center', margin: '14px 0' }}>
            <div className="rail-sep" style={{ flex: 1 }} /><span className="tiny">or</span><div className="rail-sep" style={{ flex: 1 }} />
          </div>
          <div id="pv-google-btn" style={{ display: 'flex', justifyContent: 'center' }} />
        </>
      ) : (
        <p className="tiny">Google login is not configured on this server. See README to add GOOGLE_CLIENT_ID.</p>
      )}
      <p className="tiny">No account? <Link to="/register">Join free</Link> · Demo: gamer@vault.gg / password123 · Admin: admin@pixelvault.gg / password123</p>
    </div>
  );
}

