import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { GameCard, ToyCard, Price, Pager } from './components.jsx';

export function Home() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/home').then(setD).catch(() => setD({})); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  const f = (d.featured || [])[0];
  return (
    <>
      <h2>Featured &amp; Recommended</h2>
      {f ? (
        <div className="spotlight">
          <Link className="spotlight_main" to={`/games/${f.slug}`}><img src={f.coverImage} /></Link>
          <div className="spotlight_side">
            <h2 style={{ textTransform: 'none', fontSize: 21 }}>{f.title}</h2>
            <p className="tiny">{(f.genres || []).join(', ')}</p>
            <p className="tiny">NOW AVAILABLE</p>
            <div style={{ marginTop: 'auto' }}><Price g={f} /></div>
          </div>
        </div>
      ) : <div className="section"><p className="muted">Catalog is empty.</p></div>}
      <h2 className="row-title">Browse by Category <Link to="/games">More</Link></h2>
      <div className="cat_tiles">
        {(d.catTiles || []).map((t) => <Link key={t.name} className="cat_tile" to={`/games?genre=${encodeURIComponent(t.name)}`}><img src={t.img} loading="lazy" /><span>{t.name}</span></Link>)}
      </div>
      <h2 className="row-title">Special Offers <Link to="/games?onSale=1">Browse More</Link></h2>
      <div className="card-row">{(d.deals || []).map((g) => <GameCard key={g._id} g={g} />)}</div>
      <h2 className="row-title">New &amp; Trending <Link to="/games?sort=newest">Browse More</Link></h2>
      <div className="card-row">{(d.fresh || []).slice(0, 4).map((g) => <GameCard key={g._id} g={g} />)}</div>
      {!!(d.toys || []).length && <>
        <h2 className="row-title">Toys &amp; Collectibles <Link to="/toys">Shop All Merch</Link></h2>
        <div className="card-row">{d.toys.map((t) => <ToyCard key={t._id} t={t} />)}</div>
      </>}
    </>
  );
}

function useQuery() {
  const [sp] = useSearchParams();
  return Object.fromEntries(sp.entries());
}

export function Store() {
  const q = useQuery();
  const [d, setD] = useState(null);
  const qs = new URLSearchParams(q).toString();
  useEffect(() => { setD(null); api('/games?' + qs).then(setD).catch(() => setD({ games: [] })); }, [qs]);
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>{q.genre || q.tag ? `${q.genre || q.tag} Games` : 'All Products'}</h1>
      <div className="store_layout">
        <aside>
          <div className="side_box"><h4>Narrow by Price</h4>
            <Link to="/games?maxPrice=0">Free to Play</Link>
            <Link to="/games?maxPrice=10">Under $10</Link>
            <Link to="/games?maxPrice=20">Under $20</Link>
            <Link to="/games?maxPrice=40">Under $40</Link>
          </div>
          <div className="side_box"><h4>Genres</h4>
            {(d.genres || []).slice(0, 14).map((g) => <Link key={g} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>)}
          </div>
          <div className="side_box"><h4>Show Only</h4>
            <Link to="/games?onSale=1">Special Offers</Link>
            <Link to="/games?moddable=1">Moddable</Link>
          </div>
        </aside>
        <div>
          <p className="tiny">{d.total} results</p>
          <div className="card-grid">{(d.games || []).map((g) => <GameCard key={g._id} g={g} />)}</div>
          {!(d.games || []).length && <div className="section"><p className="muted">No titles match. <Link to="/games">Clear search</Link></p></div>}
          <Pager total={d.total} totalPages={d.totalPages} page={d.page} base="/games" query={q} />
        </div>
      </div>
    </>
  );
}

export function GameDetail({ me }) {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/games/' + slug).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  const nav = useNavigate();
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { game, reviews, mods, threads, keysAvailable } = d;
  const outOfKeys = (game.price || 0) > 0 && (keysAvailable || 0) === 0;
  const add = async (edition) => {
    try { await api('/cart/add', { method: 'POST', body: { gameId: game._id, edition } }); nav('/cart'); }
    catch (e) { setErr(e.message); }
  };
  const wish = async () => {
    try { await api(`/games/${game._id}/wishlist`, { method: 'POST' }); } catch (e) { setErr(e.message); }
  };
  const review = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api(`/reviews/${game._id}`, { method: 'POST', body: { stars: f.get('stars'), title: f.get('title'), body: f.get('body') } }); e.target.reset(); setD({ ...d, reviews: await api('/games/' + slug).then((x) => x.reviews) }); }
    catch (er) { setErr(er.message); }
  };
  return (
    <>
      <p className="crumbs"><Link to="/games">All Games</Link> &gt; {(game.genres || ['Indie'])[0]} &gt; {game.title}</p>
      <h1>{game.title}</h1>
      <div className="detail_grid">
        <div>
          <div className="shot_main"><img src={(game.screenshots && game.screenshots[0]) || game.coverImage} /></div>
          <div className="section"><h3>About This Game</h3><p style={{ fontSize: 13 }}>{game.description}</p>
            <div>{(game.tags || game.genres || []).map((t) => <Link key={t} className="tag" to={`/games?tag=${encodeURIComponent(t)}`}>{t}</Link>)}</div>
          </div>
          <div className="section"><h3>Customer Reviews ({reviews.length})</h3>
            {me ? <form className="panel" onSubmit={review}>
              <div className="row"><select name="stars"><option value="5">Recommend — 5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select><input name="title" placeholder="Headline" required /></div>
              <textarea name="body" placeholder="What did you like or dislike?" required style={{ marginTop: 8 }} />
              <button className="cta-btn sm" style={{ marginTop: 8 }}>Post review</button>
            </form> : <p className="tiny"><Link to="/login">Login</Link> and own the game to review.</p>}
            {reviews.map((r) => <div key={r._id} className="review_card"><div className="avatar">{(r.user?.username || '?')[0].toUpperCase()}</div>
              <div><b style={{ color: 'var(--bright)' }}>{r.title}</b><p className="tiny">@{r.user?.username} · {r.playMinutesAtReview} min on record</p><p style={{ fontSize: 13 }}>{r.body}</p>
                {r.devResponse?.text && <p className="tiny"><b>Developer response:</b> {r.devResponse.text}</p>}</div></div>)}
            {!reviews.length && <p className="muted">No reviews yet.</p>}
          </div>
        </div>
        <aside className="game_info">
          <img className="header_img" src={game.coverImage} />
          <p style={{ fontSize: 13 }}>{game.tagline}</p>
          <div className="tiny">Developer: {game.studioName}</div>
          <div className="tiny">Platforms: {(game.platforms || ['Windows']).join(' · ')}</div>
          <div className="buy_area">
            <h4>Buy {game.title}</h4>
            <Price g={game} />
            {(game.price || 0) > 0
              ? <p className="tiny">{keysAvailable} keys in stock{outOfKeys && ' — out of stock'}</p>
              : <p className="tiny">Free to Play — no key needed.</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="cta-btn sm" disabled={outOfKeys} onClick={() => add('digital')}>Add to Cart</button>
              <button className="ghost-btn sm" onClick={wish}>+ Wishlist</button>
            </div>
          </div>
        </aside>
      </div>
      {err && <p className="err">{err}</p>}
    </>
  );
}

export function Toys() {
  const q = useQuery();
  const [d, setD] = useState(null);
  const qs = new URLSearchParams(q).toString();
  useEffect(() => { setD(null); api('/toys?' + qs).then(setD).catch(() => setD({ toys: [] })); }, [qs]);
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>Toys &amp; Collectibles</h1>
      <div className="store_layout">
        <aside>
          <div className="side_box"><h4>Category</h4>
            <Link to="/toys">All</Link>
            {(d.categories || []).map((c) => <Link key={c} to={`/toys?category=${encodeURIComponent(c)}`}>{c}</Link>)}
          </div>
          <div className="side_box"><h4>Brand</h4>
            {(d.brands || []).slice(0, 10).map((b) => <Link key={b} to={`/toys?brand=${encodeURIComponent(b)}`}>{b.split(' (')[0]}</Link>)}
          </div>
        </aside>
        <div>
          <p className="tiny">{d.total} results</p>
          <div className="card-grid">{(d.toys || []).map((t) => <ToyCard key={t._id} t={t} />)}</div>
          {!(d.toys || []).length && <div className="section"><p className="muted">Nothing here. <Link to="/toys">Clear</Link></p></div>}
          <Pager total={d.total} totalPages={d.totalPages} page={d.page} base="/toys" query={q} />
        </div>
      </div>
    </>
  );
}

export function ToyDetail() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/toys/' + slug).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  const nav = useNavigate();
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { toy, relatedGame } = d;
  const add = async () => {
    try { await api('/cart/add', { method: 'POST', body: { toyId: toy._id } }); nav('/cart'); }
    catch (e) { setErr(e.message); }
  };
  return (
    <>
      <p className="crumbs"><Link to="/toys">All Toys &amp; Merch</Link> &gt; {toy.category} &gt; {toy.title}</p>
      <h1>{toy.title}</h1>
      <div className="detail_grid">
        <div>
          <div className="shot_main"><img src={toy.coverImage} /></div>
          <div className="section"><h3>About This Collectible</h3><p style={{ fontSize: 13 }}>{toy.description}</p>
            {relatedGame && <p><Link className="ghost-btn sm" to={`/games/${relatedGame.slug}`}>🎮 View the game: {relatedGame.title}</Link></p>}
          </div>
          <div className="section"><h3>Details</h3>
            <p className="tiny">Brand: {toy.brand} · {toy.category} · {toy.size} · {toy.material}</p>
          </div>
        </div>
        <aside className="game_info">
          <img className="header_img toy" src={toy.coverImage} />
          <p style={{ fontSize: 13 }}>{toy.tagline}</p>
          <div className="buy_area">
            <h4>Buy — ${toy.price.toFixed(2)}</h4>
            <p className="tiny">{toy.stock} in stock · Ships from {toy.warehouse}</p>
            <button className="cta-btn sm" disabled={(toy.stock || 0) === 0} onClick={add}>Add to Cart</button>
          </div>
        </aside>
      </div>
      {err && <p className="err">{err}</p>}
    </>
  );
}
