import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function Register({ onLogin }) {
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api('/auth/register', { method: 'POST', body: { username: f.get('username'), email: f.get('email'), password: f.get('password') } }); onLogin(r.user); nav('/'); }
    catch (er) { setErr(er.message); }
  };
  return <div className="auth-box"><h1>Join free</h1>{err && <p className="err">{err}</p>}
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}><input name="username" placeholder="Username" required /><input name="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password" required /><button className="cta-btn">Register</button></form></div>;
}

