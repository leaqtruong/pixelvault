import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function CommunityNew() {
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api('/community/new', { method: 'POST', body: { board: f.get('board'), title: f.get('title'), body: f.get('body') } }); nav('/community/p/' + r.id); }
    catch (er) { setErr(er.message); }
  };
  return <><h1>New post</h1><form className="panel" onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
    <select name="board"><option>general</option><option>lfg</option><option>guides</option><option>support</option><option>deals</option></select>
    <input name="title" placeholder="Title" required /><textarea name="body" placeholder="Body" required /><button className="cta-btn">Post</button></form>{err && <p className="err">{err}</p>}</>;
}

