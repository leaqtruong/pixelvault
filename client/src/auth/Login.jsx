import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export function Login({ onLogin }) {
  const [err, setErr] = useState('');
  const [googleId, setGoogleId] = useState(null);
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
      <p className="tiny">No account? <Link to="/register">Join free</Link> · Admin: admin@pixelvault.gg / 123456</p>
    </div>
  );
}

