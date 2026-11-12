import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function Community() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/community').then(setD).catch(() => setD({ posts: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (<><h1>Community</h1>
    {(d.posts || []).map((p) => <Link key={p._id} className="thread" to={`/community/p/${p._id}`}><b>{p.title}</b><span>@{p.author?.username} · {(p.replies || []).length} replies</span></Link>)}
    <p><Link className="ghost-btn" to="/community/new">+ New post</Link></p></>);
}
