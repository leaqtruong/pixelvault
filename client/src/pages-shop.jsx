import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, priceOf } from './api.js';
import { GameCard, ToyCard, Price, Pager, useToast } from './components.jsx';

/* ===================================================================
   FAMILY 1 — CATALOG FRONT
   Split hero (art + veil) beside a ledger of real figures, then a
   horizontal category marquee, special offers as a price table,
   trending as a numbered index, merch as a shelf, forum as a strip.
   =================================================================== */
function SplitHero({ items, ledger }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const n = items.length;
  useEffect(() => {
    if (paused || n < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 7000);
    return () => clearInterval(t);
  }, [paused, n]);
  if (!n) return <div className="empty"><h3>Catalog is empty</h3><p>Nothing is published yet.</p></div>;
  const go = (d) => setIdx((i) => (i + d + n) % n);
  const f = items[idx];
  const sub = (f.shortDescription || f.description || '').replace(/<[^>]*>/g, '').slice(0, 160);
  return (
    <div className="split"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        setPaused(false);
      }}>
      <Link className="split-main" to={`/games/${f.slug}`}><img src={f.coverImage} alt="" /></Link>
      <div className="split-veil">
        <div className="split-kicker">Featured · {(f.genres || []).slice(0, 2).join(' · ')}</div>
        <h1 className="split-title">{f.title}</h1>
        <p className="split-sub">{sub || 'Delivered as an encrypted demo key the moment checkout clears.'}</p>
        <div className="split-cta">
          <Link className="cta-btn" to={`/games/${f.slug}`}>View title</Link>
          <Price g={f} />
        </div>
      </div>
      <aside className="ledger">
        <h3>The ledger</h3>
        <div className="ledger-row"><span className="k">Titles in catalog</span><span className="v">{ledger.titles}</span></div>
        <div className="ledger-row"><span className="k">Keys available</span><span className="v">{Number(ledger.keys).toLocaleString()}</span></div>
        <div className="ledger-row"><span className="k">On special offer</span><span className="v">{ledger.onSale}</span></div>
        <div className="ledger-row"><span className="k">Average discount</span><span className="v up">-{ledger.avgOff}%</span></div>
        <div className="ledger-row"><span className="k">Collectibles</span><span className="v">{ledger.toys}</span></div>
        <div className="ledger-row"><span className="k">Orders fulfilled</span><span className="v">{ledger.orders}</span></div>
        <p className="ledger-foot"><span className="live-dot" />Player counts and review verdicts come from Steam live. Every figure above is counted from the database.</p>
      </aside>
      {n > 1 ? (
        <>
          <span className="split-tag">{idx + 1} / {n}</span>
          <button className="carousel_arrow prev" onClick={() => go(-1)} aria-label="Previous featured title">‹</button>
          <button className="carousel_arrow next" onClick={() => go(1)} aria-label="Next featured title">›</button>
        </>
      ) : null}
    </div>
  );
}

export function Home() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/home').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return (
    <div className="empty">
      <h3>Cannot reach the server</h3>
      <p>Start MongoDB, then restart this website window.</p>
      <button className="cta-btn sm" onClick={() => window.location.reload()}>Retry</button>
    </div>
  );
  if (!d) return <p className="muted">Loading…</p>;

  const seen = new Set();
  const hero = [...(d.featured || []), ...(d.deals || []), ...(d.fresh || [])].filter((g) => {
    if (seen.has(g._id)) return false;
    seen.add(g._id);
    return true;
  }).slice(0, 8);
  const L = d.ledger || { titles: 0, keys: 0, onSale: 0, avgOff: 0, toys: 0, orders: 0 };

  return (
    <>
      <SplitHero items={hero} ledger={L} />

      {(d.catTiles || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">01</span><h2>Browse by category</h2>
            <Link className="more" to="/games">Full catalog</Link></div>
          <div className="marquee">
            {d.catTiles.map((t) => (
              <Link key={t.name} to={`/games?genre=${encodeURIComponent(t.name)}`}>
                <img src={t.img} loading="lazy" alt="" /><b>{t.name}</b>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(d.deals || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">02</span><h2>Special offers</h2>
            <Link className="more" to="/games?onSale=1">All offers</Link></div>
          <table className="ptable">
            <thead><tr>
              <th><span className="tiny">Art</span></th><th>Title</th><th>Genre</th><th>Was</th><th>Now</th><th>Off</th><th>Stock</th>
            </tr></thead>
            <tbody>
              {d.deals.map((g) => {
                const keys = g.stats.keysAvailable || 0;
                return (
                  <tr key={g._id}>
                    <td><img className="t-art" src={g.coverImage} loading="lazy" alt="" /></td>
                    <td><Link className="t-name" to={`/games/${g.slug}`}>{g.title}</Link></td>
                    <td className="t-genre">{(g.genres || []).slice(0, 2).join(', ')}</td>
                    <td className="t-was">${g.price.toFixed(2)}</td>
                    <td className="t-now">${priceOf(g).toFixed(2)}</td>
                    <td><span className="t-off">-{g.discountPct}%</span></td>
                    <td className={'t-keys' + (keys ? '' : ' none')}>{keys ? keys + ' keys' : 'out'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {(d.fresh || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">03</span><h2>New and trending</h2>
            <Link className="more" to="/games?sort=newest">Just released</Link></div>
          <div className="numlist">
            {d.fresh.slice(0, 6).map((g, ix) => {
              const c = g.stats.reviewCount || 0;
              return (
                <Link className="numrow" key={g._id} to={`/games/${g.slug}`}>
                  <span className="n">{String(ix + 1).padStart(2, '0')}</span>
                  <img src={g.coverImage} loading="lazy" alt="" />
                  <span>
                    <span className="nm">{g.title}</span>
                    <span className="gn">{(g.genres || []).slice(0, 3).join(' · ')}</span>
                  </span>
                  <span className="num-extra tiny num">{c ? (g.stats.reviewSum / c).toFixed(1) + '/5' : 'no reviews'}</span>
                  <Price g={g} />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {(d.toys || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">04</span><h2>Toys and collectibles</h2>
            <Link className="more" to="/toys">Shop all merch</Link></div>
          <div className="shelf">{d.toys.map((t, ix) => <ToyCard key={t._id} t={t} i={ix} />)}</div>
        </section>
      ) : null}

      {(d.threads || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">05</span><h2>From the forums</h2>
            <Link className="more" to="/community">All threads</Link></div>
          {d.threads.map((t) => (
            <Link className="thread" key={t._id} to={`/community/p/${t._id}`}>
              <span style={{ whiteSpace: 'normal', color: 'var(--bright)', fontSize: 13 }}>{t.title}</span>
              <span>{t.board} · @{t.author?.username || 'anon'}</span>
            </Link>
          ))}
        </section>
      ) : null}
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
  const heading = q.q ? `Results for "${q.q}"`
    : q.genre ? `${q.genre} titles`
    : q.tag ? `Tagged "${q.tag}"`
    : q.platform ? `${q.platform} titles`
    : 'All titles';
  return (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Catalog</span>
        <h1>{heading}</h1>
        <span className="tiny" style={{ marginLeft: 'auto' }}>{d.total} results</span>
      </div>
      <div className="store_layout">
        <aside>
          <div className="side_box">
            <h4>Price</h4>
            <Link to="/games?maxPrice=0">Free to play</Link>
            <Link to="/games?maxPrice=10">Under $10</Link>
            <Link to="/games?maxPrice=20">Under $20</Link>
            <Link to="/games?maxPrice=40">Under $40</Link>
          </div>
          <div className="side_box">
            <h4>Genres</h4>
            {(d.genres || []).slice(0, 16).map((g) => (
              <Link key={g} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>
            ))}
          </div>
          <div className="side_box">
            <h4>Show only</h4>
            <Link to="/games?onSale=1">Special offers</Link>
            <Link to="/games?moddable=1">Moddable</Link>
            <Link to="/games?sort=popular">Top sellers</Link>
            <Link to="/games?sort=rating">Top rated</Link>
          </div>
        </aside>
        <div>
          <div className="chips">
            <Link className={'chip' + (!q.genre ? ' on' : '')} to="/games">Everything</Link>
            {(d.genres || []).slice(0, 8).map((g) => (
              <Link key={g} className={'chip' + (q.genre === g ? ' on' : '')} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>
            ))}
            {(q.q || q.onSale || q.platform || q.maxPrice) && <Link className="chip on" to="/games">Reset filters</Link>}
          </div>
          <div className="card-grid">{(d.games || []).map((g, ix) => <GameCard key={g._id} g={g} i={ix} />)}</div>
          {!(d.games || []).length && (
            <div className="empty">
              <h3>Nothing on the shelf</h3>
              <p>No titles match {q.q ? `"${q.q}" ` : ''}{q.genre ? `in ${q.genre} ` : ''}{q.platform ? `on ${q.platform} ` : ''}right now.</p>
              <Link className="cta-btn" to="/games">Reset filters</Link>
            </div>
          )}
          <Pager total={d.total} totalPages={d.totalPages} page={d.page} base="/games" query={q} />
        </div>
      </div>
    </>
  );
}

/* ===================================================================
   FAMILY 3 — LONG DOCUMENT
   Editorial column on the left, sticky purchase rail on the right.
   =================================================================== */
export function GameDetail({ me }) {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [live, setLive] = useState(null);
  const [news, setNews] = useState([]);
  const [rel, setRel] = useState([]);
  const [err, setErr] = useState('');
  const [shot, setShot] = useState(0);
  const toast = useToast();
  useEffect(() => { api('/games/' + slug).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  useEffect(() => {
    if (d?.game?.steamAppId) {
      api('/live/' + d.game.steamAppId).then(setLive).catch(() => {});
      api('/news/' + d.game.steamAppId).then((n) => setNews(n.news || [])).catch(() => {});
    }
  }, [d]);
  useEffect(() => {
    if (!d?.game) return;
    const g = d.game.genres && d.game.genres[0];
    if (!g) { setRel([]); return; }
    api(`/games?genre=${encodeURIComponent(g)}&limit=5`)
      .then((r) => setRel((r.games || []).filter((x) => x._id !== d.game._id).slice(0, 4)))
      .catch(() => {});
  }, [d?.game?._id]);
  const nav = useNavigate();
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { game, reviews, mods, threads, keysAvailable } = d;
  const outOfKeys = (game.price || 0) > 0 && (keysAvailable || 0) === 0;
  const shots = (game.screenshots && game.screenshots.length ? game.screenshots : [game.coverImage]);
  const add = async (edition) => {
    try { await api('/cart/add', { method: 'POST', body: { gameId: game._id, edition } }); toast('Added to cart'); nav('/cart'); }
    catch (e) { setErr(e.message); toast(e.message, 'err'); }
  };
  const wish = async () => {
    try { await api(`/games/${game._id}/wishlist`, { method: 'POST' }); toast('Wishlist updated'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const review = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/reviews/' + game._id, { method: 'POST', body: { stars: f.get('stars'), title: f.get('title'), body: f.get('body') } });
      e.target.reset();
      toast('Review posted');
      setD(await api('/games/' + slug));
    } catch (er) { toast(er.message, 'err'); }
  };
  return (
    <>
      <p className="crumbs">
        <Link to="/games">Catalog</Link><span className="sep">/</span>
        <Link to={`/games?genre=${encodeURIComponent((game.genres || [''])[0])}`}>{(game.genres || ['Indie'])[0]}</Link>
        <span className="sep">/</span>{game.title}
      </p>
      <div className="game_title_row">
        <h1>{game.title}</h1>
        <Link className="ghost-btn sm hub-btn" to="/community">Discuss</Link>
      </div>
      <div className="detail_grid">
        <div>
          <div className="shot_main" onClick={() => setShot((shot + 1) % shots.length)} role="button" tabIndex={0}>
            <img src={shots[shot]} alt="" />
          </div>
          {shots.length > 1 && (
            <div className="shot_strip">
              {shots.slice(0, 6).map((s, i) => (
                <img key={i} src={s} alt="" onClick={() => setShot(i)} style={i === shot ? { opacity: 1, borderColor: 'var(--accent)' } : undefined} />
              ))}
            </div>
          )}

          <div className="doc">
            <h3>About this game</h3>
            <p style={{ fontSize: 13.5 }}>{(game.description || '').replace(/<[^>]*>/g, '')}</p>
            <div>{(game.tags || game.genres || []).map((t) => (
              <Link key={t} className="tag" to={`/games?tag=${encodeURIComponent(t)}`}>{t}</Link>
            ))}</div>
          </div>

          <div className="sys_cols doc">
            <div>
              <h5>Developer</h5>
              <p><b style={{ color: 'var(--bright)' }}>{game.studioName}</b></p>
              {game.developerResponse && <p className="devresp">{game.developerResponse}</p>}
            </div>
            <div>
              <h5>Platforms</h5>
              <ul>{(game.platforms || ['Windows']).map((p) => <li key={p} className="meta_line"><span className="k">{p}</span></li>)}</ul>
              <h5 style={{ marginTop: 14 }}>Release</h5>
              <p className="tiny">{game.releaseDate ? new Date(game.releaseDate).toLocaleDateString() : '—'}</p>
            </div>
          </div>

          {!!news.length && (
            <div className="doc">
              <h3>Steam news</h3>
              {news.map((n, ix) => (
                <a key={ix} className="news-item" href={n.url} target="_blank" rel="noreferrer">
                  <b>{n.title}</b><br /><span>{n.feed} · {n.date ? new Date(n.date).toLocaleDateString() : ''}</span>
                </a>
              ))}
            </div>
          )}

          {(mods || []).length ? (
            <div className="doc">
              <h3>Mods ({mods.length})</h3>
              {mods.slice(0, 4).map((m) => (
                <Link className="thread" key={m._id} to={`/mods/${m._id}`}>
                  <span style={{ color: 'var(--bright)', fontSize: 13, whiteSpace: 'normal' }}>{m.title}</span>
                  <span>{m.downloads || 0} downloads</span>
                </Link>
              ))}
              <Link className="ghost-btn sm" style={{ marginTop: 10 }} to="/mods">All mods</Link>
            </div>
          ) : null}

          <div className="doc">
            <h3>Customer reviews ({reviews.length})</h3>
            {me ? (
              <form onSubmit={review} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                <div className="row">
                  <select name="stars" aria-label="Rating">
                    <option value="5">Recommend — 5</option><option value="4">4</option>
                    <option value="3">3</option><option value="2">2</option><option value="1">1</option>
                  </select>
                  <input name="title" placeholder="Headline" required />
                </div>
                <textarea name="body" placeholder="What did you like or dislike?" required />
                <button className="cta-btn sm" style={{ justifySelf: 'start' }}>Post review</button>
              </form>
            ) : (
              <p className="tiny"><Link to="/login">Log in</Link> and own the game to review.</p>
            )}
            {reviews.map((r) => (
              <div key={r._id} className="review_card">
                <div className="avatar">{(r.user?.username || '?')[0].toUpperCase()}</div>
                <div>
                  <b style={{ color: 'var(--bright)' }}>{r.title}</b>
                  <p className="tiny">@{r.user?.username} · {r.playMinutesAtReview} min on record · {r.stars}/5</p>
                  <p style={{ fontSize: 13 }}>{r.body}</p>
                  {r.devResponse?.text && <p className="devresp"><b>Developer response:</b> {r.devResponse.text}</p>}
                </div>
              </div>
            ))}
            {!reviews.length && <p className="muted">No reviews yet.</p>}
          </div>

          {!!rel.length && (
            <div className="doc">
              <h3>More like this</h3>
              <div className="related">
                {rel.map((r) => (
                  <Link key={r._id} to={`/games/${r.slug}`}>
                    <b>{r.title}</b>
                    <span className="num">${priceOf(r).toFixed(2)} · {(r.genres || []).slice(0, 1).join('')}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="buy-rail">
          <img className="header_img" src={game.coverImage} alt="" />
          <p style={{ fontSize: 13, marginBottom: 6 }}>{game.tagline}</p>
          <div className="tiny">By {game.studioName}</div>
          <div className="tiny">{(game.platforms || ['Windows']).join(' · ')}</div>
          <div className="rail-price"><Price g={game} /></div>
          {live && (live.players !== null || live.reviews) ? (
            <p className="tiny"><span className="live-dot" />
              {live.players !== null ? live.players.toLocaleString() + ' in-game now' : 'players n/a'}
              {live.reviews ? ` · Steam: ${live.reviews.desc}` : ''}
            </p>
          ) : null}
          <div className="buy-area">
            <h4>{(game.price || 0) > 0 ? 'Digital edition' : 'Free to play'}</h4>
            {(game.price || 0) > 0
              ? <p className="tiny" style={outOfKeys ? { color: 'var(--ember)' } : undefined}>
                  {keysAvailable} keys in stock{outOfKeys ? ' — sold out' : ''}
                </p>
              : <p className="tiny">No key needed.</p>}
            <div className="row">
              <button className="cta-btn sm" disabled={outOfKeys} onClick={() => add('digital')}>Add to cart</button>
              <button className="ghost-btn sm" onClick={wish}>Wishlist</button>
            </div>
          </div>
          {!!threads?.length && (
            <div style={{ marginTop: 16 }}>
              <h4>Active threads</h4>
              {threads.slice(0, 3).map((t) => (
                <p key={t._id} className="tiny" style={{ margin: '0 0 6px' }}>
                  <Link to={`/community/p/${t._id}`}>{t.title}</Link>
                </p>
              ))}
            </div>
          )}
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
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Merch</span>
        <h1>Toys and collectibles</h1>
        <span className="tiny" style={{ marginLeft: 'auto' }}>{d.total} results</span>
      </div>
      <div className="store_layout">
        <aside>
          <div className="side_box">
            <h4>Category</h4>
            <Link to="/toys">Everything</Link>
            {(d.categories || []).map((c) => (
              <Link key={c} to={`/toys?category=${encodeURIComponent(c)}`}>{c}</Link>
            ))}
          </div>
          <div className="side_box">
            <h4>Brand</h4>
            {(d.brands || []).slice(0, 12).map((b) => (
              <Link key={b} to={`/toys?brand=${encodeURIComponent(b)}`}>{b.split(' (')[0]}</Link>
            ))}
          </div>
        </aside>
        <div>
          <div className="card-grid">{(d.toys || []).map((t, ix) => <ToyCard key={t._id} t={t} i={ix} />)}</div>
          {!(d.toys || []).length && (
            <div className="empty">
              <h3>The toy shelf is bare</h3>
              <p>No collectibles match {q.category ? `category "${q.category}" ` : ''}{q.brand ? `${q.brand} ` : ''}right now.</p>
              <Link className="cta-btn" to="/toys">Browse everything</Link>
            </div>
          )}
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
  const toast = useToast();
  useEffect(() => { api('/toys/' + slug).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  const nav = useNavigate();
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { toy, relatedGame } = d;
  const out = (toy.stock || 0) === 0;
  const add = async () => {
    try { await api('/cart/add', { method: 'POST', body: { toyId: toy._id } }); toast('Added to cart'); nav('/cart'); }
    catch (e) { setErr(e.message); toast(e.message, 'err'); }
  };
  return (
    <>
      <p className="crumbs">
        <Link to="/toys">Collectibles</Link><span className="sep">/</span>
        <Link to={`/toys?category=${encodeURIComponent(toy.category)}`}>{toy.category}</Link>
        <span className="sep">/</span>{toy.title}
      </p>
      <h1>{toy.title}</h1>
      <div className="detail_grid">
        <div>
          <div className="shot_main"><img src={toy.coverImage} alt="" /></div>
          <div className="doc">
            <h3>About this collectible</h3>
            <p style={{ fontSize: 13.5 }}>{toy.description}</p>
            {relatedGame && (
              <p><Link className="ghost-btn sm" to={`/games/${relatedGame.slug}`}>View the game: {relatedGame.title}</Link></p>
            )}
          </div>
          <div className="doc">
            <h3>Details</h3>
            <div className="review_line"><span className="k">Brand</span><span>{toy.brand}</span></div>
            <div className="review_line"><span className="k">Category</span><span>{toy.category}</span></div>
            <div className="review_line"><span className="k">Size</span><span>{toy.size}</span></div>
            <div className="review_line"><span className="k">Material</span><span>{toy.material}</span></div>
            <div className="review_line"><span className="k">Warehouse</span><span>{toy.warehouse}</span></div>
          </div>
        </div>
        <aside className="buy-rail">
          <img className="header_img toy" src={toy.coverImage} alt="" />
          <p style={{ fontSize: 13, marginBottom: 6 }}>{toy.tagline}</p>
          <div className="tiny">{toy.brand}</div>
          <div className="rail-price"><div className="price_row"><span className="plain_price">${toy.price.toFixed(2)}</span></div></div>
          <div className="buy-area">
            <h4>Ships from {toy.warehouse}</h4>
            <p className="tiny" style={out ? { color: 'var(--ember)' } : undefined}>
              {out ? 'Sold out — check back soon' : `${toy.stock} in stock`}
            </p>
            <div className="row">
              <button className="cta-btn sm" disabled={out} onClick={add}>Add to cart</button>
            </div>
          </div>
        </aside>
      </div>
      {err && <p className="err">{err}</p>}
    </>
  );
}