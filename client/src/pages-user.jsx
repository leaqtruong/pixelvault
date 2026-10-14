import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from './api.js';

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
  }, [googleId]);
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); onLogin(r.user); nav('/'); }
    catch (er) { setErr(er.message); }
  };
  return <div className="auth-box"><h1>Login</h1>{err && <p className="err">{err}</p>}
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}><input name="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password" required /><button className="cta-btn">Login</button></form>
    {googleId ? <><div className="row" style={{ alignItems: 'center' }}><div className="rail-sep" style={{ flex: 1 }} /><span className="tiny">or</span><div className="rail-sep" style={{ flex: 1 }} /></div><div id="pv-google-btn" style={{ display: 'flex', justifyContent: 'center' }} /></>
      : <p className="tiny">Google login is not configured on this server. See README to add GOOGLE_CLIENT_ID.</p>}
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
    {d.isSelf ? (<div><h2>My orders</h2>{(d.orders || []).map((o) => <Link key={o._id} className="thread" to={`/orders/${o._id}`}><b>#{String(o._id).slice(-6)} · ${o.grandTotal.toFixed(2)}</b><span>{o.status}</span></Link>)}</div>) : null}
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

/* Developer replies: POST /reviews/:id/respond existed but nothing in the UI
   could reach it, so a published devResponse could never be written. */
function DevReplies({ games, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const [list, setList] = useState([]);
  const loadFor = async (gid) => {
    try { const r = await api('/games/' + gid); setList(r.reviews || []); }
    catch { setList([]); }
  };
  const openFor = (gid) => {
    setOpen(open === gid ? null : gid);
    if (open !== gid) loadFor(gid);
  };
  const send = async (e, rid) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/reviews/${rid}/respond`, { method: 'POST', body: { text: f.get('text') } });
      e.target.reset();
      toast('Reply published');
      loadFor(open);
      onDone && onDone();
    } catch (er) { toast(er.message, 'err'); }
  };
  const withReviews = games.filter((g) => (g.stats.reviewCount || 0) > 0);
  if (!withReviews.length) return null;
  return (
    <div className="panel">
      <h3>Customer replies ({withReviews.length} title{withReviews.length > 1 ? 's' : ''} with reviews)</h3>
      {withReviews.map((g) => (
        <div key={g._id} style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px' }}>
            <Link to={`/games/${g.slug}`}>{g.title}</Link>
            <span className="tiny"> · {g.stats.reviewCount} reviews · {g.stats.reviewCount ? (g.stats.reviewSum / g.stats.reviewCount).toFixed(1) : '0'}/5</span>
            <button className="ghost-btn sm" onClick={() => openFor(g._id)}>
              {open === g._id ? 'Close' : 'Reply'}
            </button>
          </p>
          {open === g._id && (
            <div>
              {!list.length && <p className="tiny">Loading reviews…</p>}
              {list.map((r) => (
                <div key={r._id} className="devresp" style={{ marginBottom: 8 }}>
                  <b>{r.title}</b> <span className="tiny">by @{r.user?.username} · {r.stars}/5</span>
                  <p style={{ margin: '4px 0', fontSize: 12 }}>{r.body}</p>
                  {r.devResponse?.text && <p className="tiny" style={{ color: 'var(--accent)' }}>You replied: {r.devResponse.text}</p>}
                  <form onSubmit={(e) => send(e, r._id)} style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    <textarea name="text" placeholder="Reply as the developer…" defaultValue={r.devResponse?.text || ''} style={{ minHeight: 62 }} required />
                    <button className="cta-btn sm" style={{ justifySelf: 'start' }}>Publish reply</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Dev() {
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null);
  const toast = useToast();
  const load = () => api('/dev').then(setD).catch(() => setD({ err: 1 }));
  useEffect(load, []);
  const payout = async () => {
    try { await api('/dev/payout', { method: 'POST' }); setD(await api('/dev')); toast('Payout requested — balance cleared'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const saveEdit = async (e, g) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/dev/${g._id}/edit`, { method: 'POST', body: { price: f.get('price'), discountPct: f.get('discountPct'), status: f.get('status'), physicalStock: f.get('physicalStock') } });
      setEditing(null); load(); toast('Saved ' + g.title);
    } catch (er) { toast(er.message, 'err'); }
  };
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="muted">Developer account required. <Link to="/dev/apply">Become a developer</Link></p>;
  const lowKeys = d.games.filter((g) => g.price > 0 && (g.stats.keysAvailable || 0) === 0);
  const lowBox = d.games.filter((g) => g.physical?.enabled && (g.physical?.stock || 0) < 5);
  const canPayout = d.balance >= 10;
  return (<>
    <div className="sec-head" style={{ marginTop: 0 }}>
      <span className="ix">Studio</span>
      <h1>Dev console</h1>
      <Link className="more" to="/dev/sales">Sales report</Link>
      <Link className="more" to="/dev/toys">Toy shelf</Link>
      <Link className="cta-btn sm" to="/dev/new">Publish game</Link>
    </div>
    <div className="alert-bar">
      {d.balance < 10 && <div className="alert-info">Payout unlocks at <b>$10.00</b> — balance is <b>${d.balance.toFixed(2)}</b>.</div>}
      {!!lowKeys.length && <div className="alert-warn"><b>{lowKeys.length} title{lowKeys.length > 1 ? 's' : ''} out of keys.</b> Players cannot buy until you restock. <Link to={`/dev/keys/${lowKeys[0]._id}`}>Restock now</Link></div>}
      {!!lowBox.length && <div className="alert-warn"><b>{lowBox.length} box edition{lowBox.length > 1 ? 's' : ''} low on stock</b> — under 5 units left.</div>}
    </div>
    <div className="kpi-row">
      <div className="kpi"><span>Gross sales</span><b>${d.gross.toFixed(2)}</b></div>
      <div className="kpi"><span>Your cut · 70%</span><b>${d.devCut.toFixed(2)}</b></div>
      <div className="kpi"><span>Digital units</span><b>{d.unitsD}</b></div>
      <div className="kpi"><span>Physical units</span><b>{d.unitsP}</b></div>
      <div className="kpi">
        <span>Owed now</span><b>${d.balance.toFixed(2)}</b>
        <button className="ghost-btn sm" style={{ marginTop: 9 }} onClick={payout} disabled={!canPayout}>
          {canPayout ? 'Request payout' : 'Needs $10'}
        </button>
      </div>
    </div>
    <div className="two-col">
      <div className="panel">
        <h3>Revenue by month</h3>
        {d.monthly.length ? <table className="tbl"><tbody>
          {d.monthly.map(([m, v]) => <tr key={m}><td className="mono">{m}</td><td className="right num">${Number(v).toFixed(2)}</td></tr>)}
        </tbody></table> : <p className="muted">No paid orders recorded yet.</p>}
      </div>
      <div className="panel">
        <h3>Sales by region</h3>
        {Object.keys(d.byCountry || {}).length ? <table className="tbl"><tbody>
          {Object.entries(d.byCountry).map(([c, n]) => (
            <tr key={c}><td>{c === 'DIGITAL' ? 'Digital only' : c}</td><td className="right num">{n}</td></tr>
          ))}
        </tbody></table> : <p className="muted">No shipped orders yet.</p>}
      </div>
    </div>
    <DevReplies games={d.games} onDone={load} />
    <div className="panel">
      <h3>Your titles ({d.games.length})</h3>
      {d.games.length ? (
        <table className="tbl">
          <thead><tr><th>Title</th><th>Price</th><th>Keys</th><th>Box</th><th>Revenue</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {d.games.map((g) => (
              <tr key={g._id}>
                <td><Link className="t-name" to={`/games/${g.slug}`}>{g.title}</Link>
                  {editing === g._id && (
                    <form className="row" onSubmit={(e) => saveEdit(e, g)} style={{ marginTop: 8 }}>
                      <input name="price" type="number" step="0.01" defaultValue={g.price} aria-label="Price" />
                      <input name="discountPct" type="number" defaultValue={g.discountPct} aria-label="Percent off" />
                      <input name="physicalStock" type="number" defaultValue={g.physical?.stock || 0} aria-label="Box stock" />
                      <select name="status" defaultValue={g.status} aria-label="Status">
                        <option>published</option><option>draft</option><option>delisted</option>
                      </select>
                      <button className="cta-btn sm">Save</button>
                    </form>
                  )}
                </td>
                <td className="num">${Number(g.price || 0).toFixed(2)}</td>
                <td className="num" style={(g.price > 0 && !g.stats.keysAvailable) ? { color: 'var(--ember)' } : undefined}>
                  {(g.price || 0) > 0 ? g.stats.keysAvailable || 0 : '—'}
                </td>
                <td className="num">{g.physical?.enabled ? g.physical.stock : '—'}</td>
                <td className="num">${Number((g.stats && g.stats.revenueGross) || 0).toFixed(2)}</td>
                <td className="tiny">{g.status}</td>
                <td>
                  <Link className="ghost-btn sm" to={`/dev/keys/${g._id}`}>Keys</Link>{' '}
                  <button className="ghost-btn sm" onClick={() => setEditing(editing === g._id ? null : g._id)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No titles yet — <Link to="/dev/new">publish your first game</Link>.</p>}
    </div>
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
  const [rows, setRows] = useState([]);
  const toast = useToast();
  const load = () => api('/dev/' + id + '/keys').then(setD).catch((e) => setMsg(e.message));
  useEffect(load, [id]);
  useEffect(() => {
    if (id) api('/dev/' + id + '/keys/list?limit=8').then((r) => setRows(r.keys || [])).catch(() => {});
  }, [id, d]);
  const imp = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api(`/dev/${id}/keys/import`, { method: 'POST', body: { keys: f.get('keys'), batchId: f.get('batchId'), platform: 'Steam' } }); toast(`Imported ${r.added}`); e.target.reset(); load(); }
    catch (er) { toast(er.message, 'err'); }
  };
  const revoke = async (gid) => {
    try { await api(`/dev/${id}/keys/${gid}/revoke`, { method: 'POST' }); toast('Key revoked'); load(); }
    catch (er) { toast(er.message, 'err'); }
  };
  const gen = async () => {
    try { const r = await api(`/dev/${id}/keys/generate`, { method: 'POST', body: { count: 20 } }); toast(`Generated ${r.added} keys`); load(); }
    catch (er) { toast(er.message, 'err'); }
  };
  if (!d) return <p className="muted">{msg || 'Loading…'}</p>;
  const outOf = d.available === 0;
  return (<>
    <h1>Key vault — {d.game.title}</h1>
    {outOf && <div className="alert-bar"><div className="alert-warn"><b>Out of keys.</b> Nobody can buy the digital edition until you restock.</div></div>}
    <div className="kpi-row">
      <div className="kpi"><span>Available</span><b>{d.available}</b></div>
      <div className="kpi"><span>Sold</span><b>{d.sold}</b></div>
      <div className="kpi"><span>Revoked</span><b>{d.revoked}</b></div>
    </div>
    <div className="two-col">
      <div className="panel"><h3>Bulk import</h3>
        <form onSubmit={imp} style={{ display: 'grid', gap: 8 }}>
          <input name="batchId" placeholder="batch id (e.g. batch-2026-10)" />
          <textarea name="keys" placeholder="One key per line, or comma separated" style={{ minHeight: 140 }} />
          <button className="cta-btn sm">Import keys</button>
        </form>
        <p className="tiny">Keys are stored AES-256-GCM encrypted; duplicate keys are skipped automatically.</p>
      </div>
      <div className="panel"><h3>Generate demo keys</h3>
        <p className="tiny">Creates fake <code>DEMO-XXXXX-XXXXX-XXXXX</code> placeholders for testing. Not real Steam keys.</p>
        <button className="ghost-btn" onClick={gen}>Generate 20</button>
      </div>
    </div>
    {!!rows.length && <div className="panel"><h3>Recent keys (masked)</h3>
      <table className="tbl"><tbody>
        <tr><th>Key</th><th>Status</th><th>Batch</th><th>Platform</th><th></th></tr>
        {rows.map((k) => <tr key={k._id}>
          <td className="tiny"><code>{k.mask}</code></td><td>{k.status}</td><td className="tiny">{k.batchId}</td><td className="tiny">{k.platform}</td>
          {k.status === 'available' && <td><button className="ghost-btn sm" onClick={() => revoke(k._id)}>Revoke</button></td>}
        </tr>)}
      </tbody></table></div>}
  </>);
}

export function DevToys() {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/dev/toys').then(setD).catch(() => setD({ toys: [] })); }, []);
  const save = async (id, price, stock) => {
    try { await api(`/dev/toys/${id}/restock`, { method: 'POST', body: { stock, price } }); setD(await api('/dev/toys')); toast('Saved'); }
    catch (er) { toast(er.message, 'err'); }
  };
  if (!d) return <p className="muted">Loading…</p>;
  const low = d.toys.filter((t) => (t.stock || 0) <= 3);
  const totalRev = d.toys.reduce((s, t) => s + (t.stats.revenueGross || 0), 0);
  const totalUnits = d.toys.reduce((s, t) => s + (t.stats.unitsSold || 0), 0);
  return (<>
    <h1>Toy shelf <Link className="ghost-btn sm" to="/dev">← Dev console</Link></h1>
    {!!low.length && <div className="alert-bar"><div className="alert-warn"><b>{low.length} collectible{low.length > 1 ? 's' : ''} nearly sold out</b> — 3 or fewer left.</div></div>}
    <div className="kpi-row">
      <div className="kpi"><span>Listings</span><b>{d.toys.length}</b></div>
      <div className="kpi"><span>Units sold</span><b>{totalUnits}</b></div>
      <div className="kpi"><span>Gross revenue</span><b>${totalRev.toFixed(2)}</b></div>
    </div>
    <div className="panel"><table className="tbl"><tbody>
      <tr><th>Collectible</th><th>Price</th><th>Stock</th><th>Sold</th><th>Revenue</th><th></th></tr>
      {d.toys.map((t) => (
        <tr key={t._id}>
          <td><Link to={`/toys/${t.slug}`}>{t.title}</Link><br /><span className="tiny">{t.brand}</span></td>
          <td>${t.price.toFixed(2)}</td>
          <td>{t.stock}</td>
          <td>{t.stats.unitsSold}</td>
          <td>${(t.stats.revenueGross || 0).toFixed(2)}</td>
          <td><button className="ghost-btn sm" onClick={() => setEdit(edit === t._id ? null : t._id)}>Edit</button></td>
        </tr>
      ))}
      {edit && <tr><td colSpan="6">
        <EditToy t={d.toys.find((x) => x._id === edit)} onSave={save} onDone={() => setEdit(null)} />
      </td></tr>}
    </tbody></table></div>
  </>);
}

function EditToy({ t, onSave, onDone }) {
  if (!t) return null;
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.target); onSave(t._id, f.get('price'), f.get('stock')); onDone(); }}>
      <input name="price" type="number" step="0.01" defaultValue={t.price} title="Price" />
      <input name="stock" type="number" defaultValue={t.stock} title="Stock" />
      <button className="cta-btn sm">Save</button>
      <button type="button" className="ghost-btn sm" onClick={onDone}>Cancel</button>
    </form>
  );
}

export function DevSales() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/dev').then(setD).catch(() => setD({ err: 1 })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="muted">Developer account required. <Link to="/dev/apply">Become a developer</Link></p>;
  const download = () => {
    const lines = ['month,gross_usd', ...d.monthly.map(([m, v]) => `${m},${Number(v).toFixed(2)}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pixelvault-sales.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (<>
    <h1>Sales report <Link className="ghost-btn sm" to="/dev">← Dev console</Link></h1>
    <div className="stat-row">
      <div>Gross<b>${d.gross.toFixed(2)}</b></div>
      <div>You earned (70%)<b>${d.devCut.toFixed(2)}</b></div>
      <div>Digital units<b>{d.unitsD}</b></div>
      <div>Physical units<b>{d.unitsP}</b></div>
      <div>Titles<b>{d.games.length}</b></div>
    </div>
    <div className="panel"><h3>Revenue by month</h3>
      {d.monthly.length ? <table className="tbl"><tbody>
        {d.monthly.map(([m, v]) => <tr key={m}><td>{m}</td><td>${Number(v).toFixed(2)}</td></tr>)}
      </tbody></table> : <p className="muted">No paid orders recorded yet.</p>}
      {!!d.monthly.length && <button className="ghost-btn" style={{ marginTop: 12 }} onClick={download}>Download CSV</button>}
    </div>
    <div className="panel"><h3>By region</h3>
      {Object.keys(d.byCountry || {}).length ? <table className="tbl"><tbody>
        {Object.entries(d.byCountry).map(([c, n]) => <tr key={c}><td>{c === 'DIGITAL' ? 'Digital only' : c}</td><td>{n} orders</td></tr>)}
      </tbody></table> : <p className="muted">Nothing yet.</p>}
    </div>
  </>);
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

const fmtN = (n) => (n || 0).toLocaleString('en-US');
const fmtBytes = (b) => (!b ? 'not published' : b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : (b / 1048576).toFixed(1) + ' MB');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/* A mirrored mod's figures come from Steam and must be attributed as such.
   A locally uploaded mod has none of them and shows only PixelVault's own
   counters — never a stand-in number. */
function modAttribution(m) {
  return m.source?.provider === 'steam-workshop'
    ? { who: m.source.author || m.source.authorId, subs: m.mirror?.subscriptions, where: 'Steam Workshop' }
    : { who: m.author?.username ? '@' + m.author.username : null, subs: null, where: null };
}

export function Mods() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState(() => Object.fromEntries(new URLSearchParams(window.location.search)));
  const [game, setGame] = useState('');

  useEffect(() => {
    setD(null);
    const s = new URLSearchParams();
    if (q.source) s.set('source', q.source);
    if (q.sort) s.set('sort', q.sort);
    if (game) s.set('game', game);
    api('/mods?' + s.toString()).then(setD).catch(() => setD({ mods: [] }));
  }, [q, game]);

  const upload = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/mods/new', { method: 'POST', body: { game: f.get('game'), title: f.get('title'), description: f.get('description'), version: f.get('version'), downloadUrl: f.get('downloadUrl') } });
      e.target.reset(); setD(await api('/mods')); setMsg('Mod published!');
    } catch (er) { setMsg(er.message); }
  };
  if (!d) return <p className="muted">Loading…</p>;

  const set = (k, v) => setQ((prev) => { const n = { ...prev }; v ? n[k] = v : delete n[k]; return n; });
  const steamCount = (d.mods || []).filter((m) => m.source?.provider === 'steam-workshop').length;

  return (<><h1>Workshop</h1>
    <p className="tiny" style={{ maxWidth: '68ch' }}>
      Mods mirrored from the Steam Workshop, with their statistics exactly as Steam reports them
      and a link back to the original page. Nothing is hosted here — downloads happen on Steam.
    </p>

    <div className="chips" style={{ marginTop: 'var(--s4)' }}>
      <button className={'chip' + (!q.source ? ' on' : '')} onClick={() => set('source', '')}>All sources</button>
      <button className={'chip' + (q.source === 'steam' ? ' on' : '')} onClick={() => set('source', 'steam')}>Steam Workshop</button>
      <button className={'chip' + (q.source === 'local' ? ' on' : '')} onClick={() => set('source', 'local')}>PixelVault uploads</button>
    </div>
    <div className="chips">
      <span className="tiny" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Sort</span>
      {[['subs', 'Most subscribed'], ['new', 'Recently updated'], ['size', 'Largest file']].map(([k, label]) =>
        <button key={k} className={'chip' + ((q.sort || 'subs') === k ? ' on' : '')} onClick={() => set('sort', k === 'subs' ? '' : k)}>{label}</button>)}
      <input className="chip" style={{ width: 200, paddingLeft: 10 }} placeholder="Filter by game id…" value={game} onChange={(e) => setGame(e.target.value)} />
    </div>

    {(d.mods || []).map((m) => {
      const a = modAttribution(m);
      const line = m.source?.provider === 'steam-workshop'
        ? `${fmtN(a.subs)} subscribers · ${fmtBytes(m.mirror?.fileSize)} · ${a.where}`
        : `PixelVault upload${a.who ? ' by ' + a.who : ''}`;
      return (<Link key={m._id} className="thread" to={`/mods/${m._id}`}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {m.previewImage && <img src={m.previewImage} alt="" style={{ width: 52, height: 30, objectFit: 'cover', border: '1px solid var(--rule-soft)', flexShrink: 0 }} />}
          <span style={{ minWidth: 0 }}>
            <b style={{ display: 'block', color: 'var(--bright)', fontSize: 13.5 }}>{m.title}</b>
            <span style={{ fontSize: 11.5 }}>{m.game?.title}{a.who ? ' · by ' + a.who : ''}</span>
          </span>
        </span>
        <span className="num" style={{ fontSize: 11.5 }}>{line}</span>
      </Link>);
    })}
    {!d.mods.length && <p className="muted">No mods match this filter.</p>}
    {steamCount > 0 && <p className="tiny" style={{ marginTop: 'var(--s4)' }}>{fmtN(steamCount)} shown here are mirrored from Steam Workshop; the rest were uploaded to PixelVault.</p>}

    <div className="panel"><h3>Upload a mod</h3>
      <form onSubmit={upload} style={{ display: 'grid', gap: 8 }}>
        <input name="game" placeholder="Game store slug (e.g. hollow-knight-...) — see URL" title="Game slug" required />
        <input name="title" placeholder="Mod title *" required />
        <div className="row">
          <input name="version" placeholder="Version (optional — leave blank if there is none)" />
          <input name="downloadUrl" placeholder="Download URL" />
        </div>
        <textarea name="description" placeholder="What does it do?" />
        <button className="cta-btn sm">Publish mod</button>
      </form>
      {msg && <p className="tiny">{msg}</p>}
    </div></>);
}

export function ModDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api('/mods/' + id).then(setD).catch(() => setD({ err: 1 })); }, [id]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">Not found.</p>;

  const m = d.mod;
  const a = modAttribution(m);
  const mirrored = m.source?.provider === 'steam-workshop';
  const stats = mirrored
    ? [['Subscribers', fmtN(m.mirror.subscriptions)], ['Favourites', fmtN(m.mirror.favorites)],
       ['Views', fmtN(m.mirror.views)], ['Votes', fmtN(m.mirror.votes)],
       ['Rating', m.mirror.rating ? m.mirror.rating + ' / 5' : 'no rating yet'],
       ['Comments', fmtN(m.mirror.comments)], ['File size', fmtBytes(m.mirror.fileSize)],
       ['Updated', fmtDate(m.mirror.updatedAt)]]
    : null;

  return (<>
    {m.previewImage && <img src={m.previewImage} alt="" style={{ width: '100%', maxHeight: 340, objectFit: 'cover', border: '1px solid var(--rule)', marginBottom: 'var(--s4)' }} />}
    <h1>{m.title}</h1>
    <p className="tiny">
      {m.game?.title && <>For <Link to={'/games/' + m.game.slug}>{m.game.title}</Link> · </>}
      {a.who ? 'by ' + a.who + ' · ' : ''}{m.version ? 'v' + m.version : 'version not published'}
    </p>

    {mirrored && (
      <div className="panel">
        <h3>Source</h3>
        <p className="tiny" style={{ maxWidth: '70ch' }}>
          Mirrored from the Steam Workshop. The figures below are Steam&rsquo;s own counts for this
          item, captured on {fmtDate(m.source.retrievedAt)} — PixelVault does not host or re-count
          them. The mod is downloaded from Steam, not from here.
        </p>
        <div className="kpi-row" style={{ marginTop: 'var(--s3)' }}>
          {stats.map(([k, v]) => <div className="kpi" key={k}><span>{k}</span><b className="num">{v}</b></div>)}
        </div>
        <p style={{ marginBottom: 0 }}>
          <a className="cta-btn sm" href={m.source.url} target="_blank" rel="noopener noreferrer">Open on Steam Workshop</a>
        </p>
      </div>
    )}

    <div className="panel"><p>{m.description}</p>
      {!mirrored && m.downloadUrl && <p><a href={m.downloadUrl}>Download</a></p>}
      {(m.tags || []).length > 0 && <p className="row" style={{ marginBottom: 0 }}>{m.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</p>}
    </div>
  </>);
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
          <button className={'ghost-btn' + (theme === 'dark' ? ' current' : '')} onClick={() => onTheme('dark')}><span className="glyph glyph-moon" />Dark</button>
          <button className={'ghost-btn' + (theme === 'light' ? ' current' : '')} onClick={() => onTheme('light')}><span className="glyph glyph-sun" />Light</button>
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
