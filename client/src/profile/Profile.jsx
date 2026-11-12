import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function Profile({ me }) {
  const { username } = useParams();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/users/' + username).then(setD).catch(() => setD({ err: 1 }));
  useEffect(() => { load(); }, [username]);
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
    <div className="profile-head">
      <div className="avatar lg">
        {d.user.avatar ? <img src={d.user.avatar} alt="" /> : (d.user.displayName || d.user.username || '?')[0].toUpperCase()}
      </div>
      <div>
        <h1>{d.user.displayName || d.user.username}</h1>
        <p className="muted">@{d.user.username} · {d.user.email} {d.user.phone ? '· ' + d.user.phone : ''}</p>
        {d.user.bio && <p>{d.user.bio}</p>}
        {(d.user.preferences?.favoriteGenres || []).length > 0 && <p className="tiny">Likes: {d.user.preferences.favoriteGenres.join(', ')}</p>}
      </div>
    </div>
    {d.isSelf && (
      <div className="two-col">
        <div className="panel"><h3>Edit profile</h3>
          <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
            <input name="displayName" placeholder="Display name" defaultValue={d.user.displayName} />
            <input name="phone" placeholder="Phone" defaultValue={d.user.phone} />
            <ImageUpload name="avatar" defaultValue={d.user.avatar} kind="avatar" label="Upload avatar" />
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

