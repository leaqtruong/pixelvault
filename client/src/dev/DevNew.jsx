import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function DevNew() {
  const [msg, setMsg] = useState('');
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/dev/new', { method: 'POST', body: { title: f.get('title'), tagline: f.get('tagline'), description: f.get('description'), studioName: f.get('studioName'), genres: f.get('genres'), tags: f.get('tags'), platforms: ['Windows'], coverImage: f.get('coverImage'), price: f.get('price'), discountPct: f.get('discountPct') } });
      nav('/games/' + r.slug);
    } catch (er) { setMsg(er.message); }
  };
  return <><h1>Publish a game</h1><form className="panel" onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
    <input name="title" placeholder="Title *" required /><input name="tagline" placeholder="Tagline" /><textarea name="description" placeholder="Description" />
    <input name="studioName" placeholder="Studio" />
    <ImageUpload name="coverImage" kind="cover" label="Upload cover" />
    <div className="row"><input name="price" type="number" step="0.01" placeholder="Price *" required /><input name="discountPct" type="number" placeholder="% off" /><input name="genres" placeholder="Genres (comma)" /></div>
    <button className="cta-btn big">Publish</button></form>{msg && <p className="err">{msg}</p>}</>;
}

