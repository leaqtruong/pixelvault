import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function PostDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/community/p/' + id).then(setD).catch(() => setD({ err: 1 })); }, [id]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">Not found.</p>;
  const reply = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/community/p/${id}/reply`, { method: 'POST', body: { text: f.get('text') } });
      e.target.reset();
      setD(await api('/community/p/' + id));
      setErr('');
    } catch (er) { setErr(er.message); }
  };
  return (<><h1>{d.post.title}</h1><p className="tiny">@{d.post.author?.username} · {d.post.board}</p>
    <div className="panel"><p>{d.post.body}</p></div>
    <h2>Replies ({(d.post.replies || []).length})</h2>
    {(d.post.replies || []).map((r, ix) => <div key={ix} className="panel"><b>@{r.user?.username}</b><p>{r.text}</p></div>)}
    <form className="panel" onSubmit={reply} style={{ display: 'grid', gap: 8 }}><textarea name="text" placeholder="Reply…" required /><button className="ghost-btn">Reply</button></form>
    {err && <p className="err">{err}</p>}</>);
}

