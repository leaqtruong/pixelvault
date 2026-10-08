import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from './api.js';

export function Login({ onLogin }) {
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); onLogin(r.user); nav('/'); }
    catch (er) { setErr(er.message); }
  };
  return <div className="auth-box"><h1>Login</h1>{err && <p className="err">{err}</p>}
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}><input name="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password" required /><button className="cta-btn">Login</button></form>
    <p className="tiny">No account? <Link to="/register">Join free</Link> · Demo: gamer@vault.gg / password123</p></div>;
}

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

export function Profile({ me }) {
  const { username } = useParams();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/users/' + username).then(setD).catch(() => setD({ err: 1 }));
  useEffect(load, [username]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">User not found.</p>;
  const save = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/users/me', { method: 'POST', body: { displayName: f.get('displayName'), phone: f.get('phone'), bio: f.get('bio'), avatar: f.get('avatar'), favoriteGenres: f.get('favoriteGenres'), matureFilter: f.get('matureFilter') === 'on' } });
      setMsg('Profile saved!'); load();
    } catch (er) { setMsg(er.message); }
  };
  const addAddr = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/users/me/addresses', { method: 'POST', body: { label: f.get('label'), fullName: f.get('fullName'), street: f.get('street'), city: f.get('city'), region: f.get('region'), postal: f.get('postal'), country: f.get('country'), phone: f.get('phone') } });
      setD({ ...d, user: { ...d.user, addresses: r.addresses } }); e.target.reset(); setMsg('Address added!');
    } catch (er) { setMsg(er.message); }
  };
  const delAddr = async (id) => {
    const r = await api('/users/me/addresses/' + id, { method: 'DELETE' });
    setD({ ...d, user: { ...d.user, addresses: r.addresses } });
  };
  return (<>
    <h1>{d.user.displayName || d.user.username}</h1>
    <p className="muted">@{d.user.username} · {d.user.email} {d.user.phone ? '· ' + d.user.phone : ''}</p>
    {d.user.bio && <p>{d.user.bio}</p>}
    {(d.user.preferences?.favoriteGenres || []).length > 0 && <p className="tiny">Likes: {d.user.preferences.favoriteGenres.join(', ')}</p>}
    {d.isSelf && (
      <div className="two-col">
        <div className="panel"><h3>Edit profile</h3>
          <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
            <input name="displayName" placeholder="Display name" defaultValue={d.user.displayName} />
            <div className="row"><input name="phone" placeholder="Phone" defaultValue={d.user.phone} /><input name="avatar" placeholder="Avatar image URL" defaultValue={d.user.avatar} /></div>
            <textarea name="bio" placeholder="Bio" defaultValue={d.user.bio} />
            <input name="favoriteGenres" placeholder="Favorite genres (comma separated)" defaultValue={(d.user.preferences?.favoriteGenres || []).join(', ')} />
            <label className="tiny"><input type="checkbox" name="matureFilter" defaultChecked={d.user.preferences?.matureFilter} /> Hide mature titles</label>
            <button className="cta-btn sm">Save profile</button>
          </form>
        </div>
        <div className="panel"><h3>Address book ({(d.user.addresses || []).length})</h3>
          {(d.user.addresses || []).map((a) => <p key={a._id} className="tiny"><b>{a.label}:</b> {a.fullName}, {a.street}, {a.city} {a.postal} <button className="ghost-btn sm" onClick={() => delAddr(a._id)}>x</button></p>)}
          <form onSubmit={addAddr} style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <div className="row"><input name="label" placeholder="Label (Home)" /><input name="fullName" placeholder="Full name *" required /></div>
            <input name="street" placeholder="Street *" required />
            <div className="row"><input name="city" placeholder="City *" required /><input name="postal" placeholder="ZIP *" required /></div>
            <div className="row"><input name="country" placeholder="Country" /><input name="phone" placeholder="Phone" /></div>
            <button className="ghost-btn sm">+ Add address</button>
          </form>
        </div>
      </div>
    )}
    {msg && <p className="tiny">{msg}</p>}
    <h2>Library preview</h2>
    <div className="card-row">{(d.user.library || []).slice(0, 4).map((e, ix) => e.game && <Link key={ix} className="gcard sm" to={`/games/${e.game.slug}`}><img src={e.game.coverImage} /><div className="gmeta"><b>{e.game.title}</b></div></Link>)}</div>
    {d.isSelf && <><h2>My orders</h2>{(d.orders || []).map((o) => <Link key={o._id} className="thread" to={`/orders/${o._id}`}><b>#{String(o._id).slice(-6)} · ${o.grandTotal.toFixed(2)}</b><span>{o.status}</span></Link>)}</>}
  </>);
}

export function DevApply() {
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('/dev/apply', { method: 'POST', body: { studioName: f.get('studioName'), website: f.get('website'), payoutEmail: f.get('payoutEmail') } }); setMsg('You are now a developer!'); }
    catch (er) { setMsg(er.message); }
  };
  return <div className="auth-box"><h1>Become a developer</h1>
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}><input name="studioName" placeholder="Studio *" required /><input name="website" placeholder="Website" /><input name="payoutEmail" placeholder="Payout email *" required /><button className="cta-btn">Apply</button></form>
    {msg && <p className="tiny">{msg}</p>}</div>;
}

export function Dev() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/dev').then(setD).catch(() => setD({ err: 1 })); }, []);
  const payout = async () => { try { await api('/dev/payout', { method: 'POST' }); setD(await api('/dev')); } catch (e) { alert(e.message); } };
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="muted">Developer account required. <Link to="/dev/apply">Become a developer</Link></p>;
  return (<><h1>Dev console <Link className="cta-btn sm" to="/dev/new">+ Publish game</Link> <Link className="ghost-btn sm" to="/dev/toys">Toy shelf</Link></h1>
    <div className="kpi-row">
      <div className="kpi"><span>Gross sales</span><b>${d.gross.toFixed(2)}</b></div>
      <div className="kpi"><span>Your cut (70%)</span><b>${d.devCut.toFixed(2)}</b></div>
      <div className="kpi"><span>Digital units</span><b>{d.unitsD}</b></div>
      <div className="kpi"><span>Owed now</span><b>${d.balance.toFixed(2)}</b><button className="ghost-btn sm" onClick={payout}>Request payout</button></div>
    </div>
    <div className="panel"><h3>Your games</h3>{d.games.map((g) => <p key={g._id}><Link to={`/games/${g.slug}`}>{g.title}</Link> — ${g.stats.revenueGross.toFixed(2)} · keys {g.stats.keysAvailable || 0} · <Link className="ghost-btn sm" to={`/dev/keys/${g._id}`}>Keys</Link></p>)}</div>
  </>);
}

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
    <div className="row"><input name="studioName" placeholder="Studio" /><input name="coverImage" placeholder="Cover image URL" /></div>
    <div className="row"><input name="price" type="number" step="0.01" placeholder="Price *" required /><input name="discountPct" type="number" placeholder="% off" /><input name="genres" placeholder="Genres (comma)" /></div>
    <button className="cta-btn big">Publish</button></form>{msg && <p className="err">{msg}</p>}</>;
}

export function DevKeys() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/dev/' + id + '/keys').then(setD).catch((e) => setMsg(e.message));
  useEffect(load, [id]);
  const imp = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api(`/dev/${id}/keys/import`, { method: 'POST', body: { keys: f.get('keys'), batchId: f.get('batchId'), platform: 'Steam' } }); setMsg(`Imported ${r.added}`); load(); }
    catch (er) { setMsg(er.message); }
  };
  const gen = async () => {
    try { const r = await api(`/dev/${id}/keys/generate`, { method: 'POST', body: { count: 20 } }); setMsg(`Generated ${r.added}`); load(); }
    catch (er) { setMsg(er.message); }
  };
  if (!d) return <p className="muted">{msg || 'Loading…'}</p>;
  return (<><h1>Key vault — {d.game.title}</h1>
    <div className="kpi-row"><div className="kpi"><span>Available</span><b>{d.available}</b></div><div className="kpi"><span>Sold</span><b>{d.sold}</b></div><div className="kpi"><span>Revoked</span><b>{d.revoked}</b></div></div>
    <div className="two-col"><div className="panel"><h3>Bulk import</h3>
      <form onSubmit={imp} style={{ display: 'grid', gap: 8 }}><input name="batchId" placeholder="batch id" /><textarea name="keys" placeholder="One key per line" /><button className="cta-btn sm">Import</button></form></div>
      <div className="panel"><h3>Generate demo</h3><button className="ghost-btn" onClick={gen}>Generate 20 DEMO keys</button></div></div>
    {msg && <p className="tiny">{msg}</p>}</>);
}

export function DevToys() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/dev/toys').then(setD).catch(() => setD({ toys: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  const save = async (id, stock) => { await api(`/dev/toys/${id}/restock`, { method: 'POST', body: { stock } }); setD(await api('/dev/toys')); };
  return (<><h1>Toy shelf</h1><div className="panel"><table className="tbl"><tbody>
    <tr><th>Collectible</th><th>Price</th><th>Stock</th><th>Sold</th><th></th></tr>
    {d.toys.map((t) => <tr key={t._id}><td><Link to={`/toys/${t.slug}`}>{t.title}</Link></td><td>${t.price.toFixed(2)}</td><td>{t.stock}</td><td>{t.stats.unitsSold}</td>
      <td><button className="ghost-btn sm" onClick={() => { const v = prompt('New stock', t.stock); if (v !== null) save(t._id, v); }}>Restock</button></td></tr>)}
  </tbody></table></div></>);
}

export function Community() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/community').then(setD).catch(() => setD({ posts: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (<><h1>Community</h1>
    {(d.posts || []).map((p) => <Link key={p._id} className="thread" to={`/community/p/${p._id}`}><b>{p.title}</b><span>@{p.author?.username} · {(p.replies || []).length} replies</span></Link>)}
    <p><Link className="ghost-btn" to="/community/new">+ New post</Link></p></>);
}

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

export function PostDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api('/community/p/' + id).then(setD).catch(() => setD({ err: 1 })); }, [id]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">Not found.</p>;
  const reply = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await api(`/community/p/${id}/reply`, { method: 'POST', body: { text: f.get('text') } });
    e.target.reset(); setD(await api('/community/p/' + id));
  };
  return (<><h1>{d.post.title}</h1><p className="tiny">@{d.post.author?.username} · {d.post.board}</p>
    <div className="panel"><p>{d.post.body}</p></div>
    <h2>Replies ({(d.post.replies || []).length})</h2>
    {(d.post.replies || []).map((r, ix) => <div key={ix} className="panel"><b>@{r.user?.username}</b><p>{r.text}</p></div>)}
    <form className="panel" onSubmit={reply} style={{ display: 'grid', gap: 8 }}><textarea name="text" placeholder="Reply…" required /><button className="ghost-btn">Reply</button></form></>);
}

export function Mods() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/mods').then(setD).catch(() => setD({ mods: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (<><h1>Workshop</h1>
    {(d.mods || []).map((m) => <Link key={m._id} className="thread" to={`/mods/${m._id}`}><b>{m.title}</b><span>DL {m.stats.downloads} · @{m.author?.username}</span></Link>)}
    {!d.mods.length && <p className="muted">No mods yet.</p>}</>);
}

export function ModDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api('/mods/' + id).then(setD).catch(() => setD({ err: 1 })); }, [id]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">Not found.</p>;
  return (<><h1>{d.mod.title}</h1><p className="tiny">v{d.mod.version} · @{d.mod.author?.username} · DL {d.mod.stats.downloads}</p>
    <div className="panel"><p>{d.mod.description}</p>{d.mod.downloadUrl && <p><a href={d.mod.downloadUrl}>Download</a></p>}</div></>);
}

export function Settings({ me, onMe, theme, onTheme }) {
  const [msg, setMsg] = useState('');
  const savePrefs = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/users/me', { method: 'POST', body: { favoriteGenres: f.get('favoriteGenres'), matureFilter: f.get('matureFilter') === 'on' } });
      setMsg('Preferences saved!');
    } catch (er) { setMsg(er.message); }
  };
  return (<><h1>Settings</h1>
    <div className="two-col">
      <div className="panel"><h3>Appearance</h3>
        <p className="tiny">Pick a theme — saved on this device.</p>
        <div className="row">
          <button className={'ghost-btn' + (theme === 'dark' ? ' current' : '')} onClick={() => onTheme('dark')}>🌙 Dark</button>
          <button className={'ghost-btn' + (theme === 'light' ? ' current' : '')} onClick={() => onTheme('light')}>☀️ Light</button>
        </div>
      </div>
      <div className="panel"><h3>Content preferences</h3>
        {me ? <form onSubmit={savePrefs} style={{ display: 'grid', gap: 8 }}>
          <input name="favoriteGenres" placeholder="Favorite genres (comma separated)" />
          <label className="tiny"><input type="checkbox" name="matureFilter" /> Hide mature titles</label>
          <button className="cta-btn sm">Save</button>
        </form> : <p className="tiny"><Link to="/login">Login</Link> to save preferences.</p>}
        {msg && <p className="tiny">{msg}</p>}
      </div>
    </div>
    <div className="panel"><h3>About this demo</h3>
      <p className="tiny">PixelVault coursework storefront — React + Express + MongoDB. Game data via Steam Store API, live players + review verdicts via Steam Web APIs, merch via official stores. Keys are DEMO placeholders.</p>
    </div>
  </>);
}
