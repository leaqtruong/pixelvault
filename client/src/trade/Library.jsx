import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GameCard, useToast } from '../components.jsx';

export function Library() {
  const [sp] = useSearchParams();
  const [d, setD] = useState(undefined);
  const [tab, setTab] = useState(() => sp.get('tab') || 'games');
  const [q, setQ] = useState('');
  const toast = useToast();
  useEffect(() => { api('/library').then(setD).catch(() => setD(null)); }, []);
  if (d === undefined) return <p className="muted">Loading…</p>;
  if (d === null) return <div className="empty"><h3>Your library is private</h3><p className="muted">Login to see games you own, keys and collectibles.</p><Link className="cta-btn" to="/login">Login</Link></div>;
  const { user, keysByGame, plainById } = d;
  const play = async (gid) => { await api(`/library/play/${gid}`, { method: 'POST' }); setD({ ...d, user: (await api('/library')).user }); };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Key copied'); } catch { toast('Copy failed — select manually', 'err'); }
  };
  const libFilter = (t) => !q || (t || '').toLowerCase().includes(q.toLowerCase());
  const games = (user.library || []).filter((e) => e.game && libFilter(e.game.title));
  const toys = (user.toyLibrary || []).filter((e) => e.toy && libFilter(e.toy.title));
  const wish = (user.wishlist || []).filter((g) => g && libFilter(g.title));
  const toysWish = (user.toyWishlist || []).filter((t) => t && libFilter(t.title));
  return (
    <>
      <h1>{user.username}'s library</h1>
      <div className="chips">
        <input placeholder="Filter library…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        {['games', 'toys', 'wishlist'].map((t) => (
          <button key={t} className={'chip' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t === 'games' ? `Games (${games.length})` : t === 'toys' ? `Collectibles (${toys.length})` : `Wishlist (${wish.length + toysWish.length})`}
          </button>
        ))}
      </div>
      <p className="tiny">Demo keys look like <code>DEMO-XXXXX-XXXXX-XXXXX</code> (placeholders).</p>
      {tab === 'games' && (
        games.length ? <div className="card-grid">
          {games.map((e, ix) => (
            <div key={ix} className="gcard"><img src={e.game.coverImage} /><div className="gmeta"><b>{e.game.title}</b>
              <span className="tiny">{e.edition} · {Math.floor((e.playMinutes || 0) / 60)}h {(e.playMinutes || 0) % 60}m</span>
              <span className="tiny">Achievements: {(e.achievements || []).map((a) => a.key).join(', ') || 'none yet'}</span>
              {(keysByGame[String(e.game._id)] || []).map((k) => (
                <div key={k._id} className="row" style={{ alignItems: 'center' }}>
                  <code className="tiny">{plainById[String(k._id)]}</code>
                  <button className="ghost-btn sm" onClick={() => copy(plainById[String(k._id)])}>Copy</button>
                </div>
              ))}
              <button className="cta-btn sm" onClick={() => play(e.game._id)}>Play +30min</button>
              <Link className="ghost-btn sm" to={`/games/${e.game.slug}`}>Store page</Link>
            </div></div>
          ))}
        </div> : <div className="empty"><h3>No games here</h3><p className="muted">{q ? 'Nothing matches your filter.' : 'Games you buy land here automatically.'}</p><Link className="cta-btn" to="/games">Browse the store</Link></div>
      )}
      {tab === 'toys' && (
        toys.length ? <div className="card-row">
          {toys.map((e, ix) => (
            <Link key={ix} className="gcard toy" to={`/toys/${e.toy.slug}`}><img src={e.toy.coverImage} /><div className="gmeta"><b>{e.toy.title}</b>
              <span className="tiny">×{e.qty}</span><div className="price_row"><span className="plain_price">${e.toy.price.toFixed(2)}</span></div></div></Link>
          ))}
        </div> : <div className="empty"><h3>No collectibles yet</h3><p className="muted">{q ? 'Nothing matches your filter.' : 'Plushies and figures you buy show up here.'}</p><Link className="cta-btn" to="/toys">Browse the toy shelf</Link></div>
      )}
      {tab === 'wishlist' && (
        (wish.length || toysWish.length) ? <>
          {!!wish.length && <><h3>Games</h3><div className="card-row">
            {wish.map((g) => <Link key={g._id} className="gcard sm" to={`/games/${g.slug}`}><img src={g.coverImage} /><div className="gmeta"><b>{g.title}</b><span className="tiny">${(g.price * (1 - (g.discountPct || 0) / 100)).toFixed(2)}</span></div></Link>)}
          </div></>}
          {!!toysWish.length && <><h3>Collectibles</h3><div className="card-row">
            {toysWish.map((t) => <Link key={t._id} className="gcard sm toy" to={`/toys/${t.slug}`}><img src={t.coverImage} /><div className="gmeta"><b>{t.title}</b><span className="tiny">${t.price.toFixed(2)}</span></div></Link>)}
          </div></>}
        </> : <div className="empty"><h3>Wishlist is empty</h3><p className="muted">Tap + Wishlist on anything you're watching.</p></div>
      )}
    </>
  );
}
