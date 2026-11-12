import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast } from '../components.jsx';
import { DevGameForm } from './DevGameForm.jsx';

function DevReplies({ games, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const [list, setList] = useState([]);
  const loadFor = async (slug) => {
    try { const r = await api('/games/' + slug); setList(r.reviews || []); }
    catch { setList([]); }
  };
  const openFor = (g) => {
    const opening = open !== g._id;
    setOpen(opening ? g._id : null);
    /* /games/:slug takes a slug, not an ObjectId; passing the id returned 404
       and left the reply list loading forever. */
    if (opening) loadFor(g.slug);
  };
  const send = async (e, rid) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/reviews/${rid}/respond`, { method: 'POST', body: { text: f.get('text') } });
      e.target.reset();
      toast('Reply published');
      const current = games.find((g) => String(g._id) === String(open));
      if (current) loadFor(current.slug);
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
            <button className="ghost-btn sm" onClick={() => openFor(g)}>
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
  const load = () => api('/dev').then(setD).catch(async () => {
    let pending = false;
    try { pending = !!(await api('/dev/status')).pending; } catch {}
    setD({ err: 1, pending });
  });
  useEffect(() => { load(); }, []);
  const payout = async () => {
    try { await api('/dev/payout', { method: 'POST' }); setD(await api('/dev')); toast('Payout requested — balance cleared'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const saveEdit = async (e, g) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/dev/${g._id}/edit`, {
        method: 'POST',
        body: {
          title: f.get('title'), tagline: f.get('tagline'), description: f.get('description'),
          coverImage: f.get('coverImage'), genres: f.get('genres'), tags: f.get('tags'),
          price: f.get('price'), discountPct: f.get('discountPct'),
          status: f.get('status'), physicalStock: f.get('physicalStock'),
        },
      });
      setEditing(null); load(); toast('Saved ' + g.title);
    } catch (er) { toast(er.message, 'err'); }
  };
  const delGame = async (g) => {
    if (!window.confirm(`Delete "${g.title}" permanently? Keys, reviews and forum posts for it will also be removed.`)) return;
    try { await api(`/dev/${g._id}`, { method: 'DELETE' }); setEditing(null); load(); toast('Game deleted'); }
    catch (e) { toast(e.message, 'err'); }
  };
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="muted">{d.pending ? 'Developer application pending admin approval.' : <>Developer account required. <Link to="/dev/apply">Become a developer</Link></>}</p>;
  // Only physical stock can run low. Digital keys are issued on payment, so
  // there is no level to warn about.
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
      {!!lowBox.length && <div className="alert-warn"><b>{lowBox.length} title{lowBox.length > 1 ? 's' : ''} low on physical stock</b> — under 5 boxed units left. Physical editions cannot ship until you restock. <Link to="/dev/toys">Restock</Link></div>}
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
      {editing && (() => {
        const g = d.games.find((x) => x._id === editing);
        return g ? <DevGameForm key={g._id} game={g} onSave={(e) => saveEdit(e, g)} onDelete={() => delGame(g)} onCancel={() => setEditing(null)} /> : null;
      })()}
      {d.games.length ? (
        <table className="tbl">
          <thead><tr><th>Title</th><th>Price</th><th>Keys</th><th>Box</th><th>Revenue</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {d.games.map((g) => (
              <tr key={g._id}>
                <td><Link className="t-name" to={`/games/${g.slug}`}>{g.title}</Link></td>
                <td className="num">${Number(g.price || 0).toFixed(2)}</td>
                <td className="num">
                  {g.stats && g.stats.keysSold != null ? g.stats.keysSold : '—'}
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

