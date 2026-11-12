import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, priceOf } from '../api.js';
import { Price, useToast } from '../components.jsx';

/* ===================================================================
   FAMILY 1 — CATALOG FRONT
   Split hero (art + veil) beside a ledger of real figures, then a
   horizontal category marquee, special offers as a price table,
   trending as a numbered index, merch as a shelf, forum as a strip.
   =================================================================== */
export function GameDetail({ me }) {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [rel, setRel] = useState([]);
  const [voted, setVoted] = useState(() => new Set());
  const [votes, setVotes] = useState({});
  const [err, setErr] = useState('');
  const [shot, setShot] = useState(0);
  const [allLangs, setAllLangs] = useState(false);
  const toast = useToast();
  useEffect(() => { api('/games/' + slug).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  useEffect(() => {
    if (!d?.game) return;
    const g = d.game.genres && d.game.genres[0];
    if (!g) { setRel([]); return; }
    api(`/games?genre=${encodeURIComponent(g)}&limit=5`)
      .then((r) => setRel((r.games || []).filter((x) => x._id !== d.game._id).slice(0, 4)))
      .catch(() => {});
  }, [d?.game?._id]);
  useEffect(() => {
    if (!d?.game) return;
    const g = d.game;
    try {
      const prev = JSON.parse(localStorage.getItem('pv:recent') || '[]');
      const next = [{ slug: g.slug, title: g.title, coverImage: g.coverImage },
        ...prev.filter((x) => x && x.slug !== g.slug)].slice(0, 3);
      localStorage.setItem('pv:recent', JSON.stringify(next));
      window.dispatchEvent(new Event('pv:recent'));
    } catch {}
  }, [d?.game?.slug]);
  const nav = useNavigate();
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { game, reviews, threads } = d;
  // No stock figure exists any more: the key is obtained from the supplier when
  // the order is fulfilled, so a priced listing is always buyable.
  const outOfKeys = false;
  const keyMode = d.supplier ? 'key is issued by the publisher on payment' : 'key is issued on payment';
  const shots = (game.screenshots && game.screenshots.length ? game.screenshots : [game.coverImage]);
  // Mongoose Maps do not survive JSON, so normalise them here.
  const asObj = (m) => (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  const minMap = asObj(game.systemReq?.minimum);
  const recMap = asObj(game.systemReq?.recommended);
  const specMap = asObj(game.systemReq?.specs);
  const req = {
    minimum: minMap, recommended: recMap, specs: specMap,
    hasSpecs: Object.keys(specMap).length > 0,
    platforms: [...new Set([...Object.keys(minMap), ...Object.keys(recMap), ...Object.keys(specMap)])],
    source: game.systemReq?.source || '',
  };
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
  const voteHelpful = async (r) => {
    if (!me) return;
    try {
      const res = await api(`/reviews/${r._id}/helpful`, { method: 'POST' });
      setVotes((v) => ({ ...v, [r._id]: res.helpful }));
      setVoted((v) => { const n = new Set(v); res.voted ? n.add(r._id) : n.delete(r._id); return n; });
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
            <div className="tags">{(game.tags || game.genres || []).map((t) => (
              <Link key={t} className="tag" to={`/games?tag=${encodeURIComponent(t)}`}>{t}</Link>
            ))}</div>
          </div>

          <div className="doc">
            <h5 style={{ marginTop: 0 }}>Developer</h5>
            <p style={{ margin: '0 0 14px' }}>
              <b style={{ color: 'var(--bright)' }}>{game.studioName}</b>
              {game.publisher && game.publisher !== game.studioName && <span className="tiny"> · published by {game.publisher}</span>}
            </p>

            <h5>System requirements</h5>
            {req.platforms.length ? (
              req.hasSpecs ? (
                <div className="req_specs">
                  {req.platforms.map((p) => {
                    const spec = req.specs[p];
                    if (!spec) return null;
                    const rows = [
                      ['os', 'OS'], ['cpu', 'Processor'], ['ram', 'Memory'],
                      ['gpu', 'Graphics'], ['api', 'DirectX'], ['storage', 'Storage'], ['sound', 'Sound'],
                    ].filter(([k]) => spec.minimum?.[k] || spec.recommended?.[k]);
                    return (
                      <div className="req_platform" key={p}>
                        <h6>{p}</h6>
                        <table className="req_tbl">
                          <thead><tr><th>Minimum</th><th>Recommended</th></tr></thead>
                          <tbody>
                            {rows.map(([k, label]) => (
                              <tr key={k}>
                                <td><span className="req_key">{label}:</span>{spec.minimum?.[k] || '—'}</td>
                                <td><span className="req_key">{label}:</span>{spec.recommended?.[k] || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table className="req_tbl summary">
                  <thead>
                    <tr><th>Platform</th><th>Minimum</th><th>Recommended</th></tr>
                  </thead>
                  <tbody>
                    {req.platforms.map((p) => (
                      <tr key={p}>
                        <td className="req_os">{p}</td>
                        <td>{req.minimum[p] || <span className="tiny">—</span>}</td>
                        <td>{req.recommended[p] || <span className="tiny">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : <p className="tiny">No system requirements are recorded for this title.</p>}
            {req.source && <p className="tiny" style={{ marginTop: 10 }}>Specifications from the catalog record.</p>}
          </div>

          <div className="sys_cols doc">
            <div>
              <h5 style={{ marginTop: 0 }}>Platforms</h5>
              <ul>{(game.platforms || ['Windows']).map((p) => <li key={p} className="meta_line"><span className="k">{p}</span></li>)}</ul>
              {game.deckVerified && <p className="tiny" style={{ marginTop: 6 }}>Handheld: {game.deckVerified}</p>}
            </div>
            <div>
              <h5 style={{ marginTop: 0 }}>Release</h5>
              <p className="tiny">{game.releaseDate ? new Date(game.releaseDate).toLocaleDateString() : '—'}</p>
              {!!(game.contentWarnings || []).length && (
                <p className="tiny">Content: {(game.contentWarnings || []).join(' · ')}</p>
              )}
              {(game.categories || []).some((c) => /achievement/i.test(c)) && <p className="tiny">Achievements included</p>}
            </div>
          </div>

          {!!(game.languageList || []).length && (
            <div className="doc">
              <h3>Languages</h3>
              <table className="lang_tbl">
                <thead>
                  <tr><th>Language</th><th>Interface</th><th>Full Audio</th><th>Subtitles</th></tr>
                </thead>
                <tbody>
                  {(allLangs ? game.languageList : game.languageList.slice(0, 5)).map((l) => (
                    <tr key={l.name}>
                      <td>{l.name}</td>
                      <td className="ok">✓</td>
                      <td className={l.audio ? 'ok' : 'no'}>{l.audio ? '✓' : ''}</td>
                      <td className="ok">✓</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {game.languageList.length > 5 && (
                <button className="lang_more" onClick={() => setAllLangs(!allLangs)}>
                  {allLangs ? 'Show fewer' : `See all ${game.languageList.length} supported languages`}
                </button>
              )}
            </div>
          )}

          {!!(game.categories || game.features || []).length && (
            <div className="doc">
              <h3>Features</h3>
              <div className="tags">
                {[...new Set([...(game.categories || []), ...(game.features || [])])].map((f) => (
                  <span className="tag" key={f}>{f}</span>
                ))}
              </div>
            </div>
          )}

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
                  <div className="review_foot">
                    <button
                      className={'helpful-btn' + (voted.has(r._id) ? ' on' : '')}
                      disabled={!me}
                      title={me ? 'Mark this review as helpful' : 'Log in to vote'}
                      onClick={() => voteHelpful(r)}>
                      Helpful · {votes[r._id] ?? (r.helpful || []).length}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!reviews.length && <p className="muted">No reviews yet.</p>}
          </div>

          {!!rel.length && (
            <div className="doc">
              <h3>More like this</h3>
              <div className="related">
                {rel.map((r) => {
                  const c = r.stats?.reviewCount || 0;
                  const avg = c ? (r.stats.reviewSum / c).toFixed(1) : null;
                  const final = priceOf(r);
                  return (
                    <Link key={r._id} className="rel-card" to={`/games/${r.slug}`}>
                      <span className="rel-art">
                        <img src={r.coverImage} alt="" loading="lazy" />
                        <span className="rel-hover">
                          <b>{r.title}</b>
                          <span className="tiny">{r.tagline || (r.genres || []).slice(0, 2).join(' · ')}</span>
                          <span className="tiny">{avg ? avg + '/5 · ' + c + ' review' + (c === 1 ? '' : 's') : 'No user reviews'}</span>
                        </span>
                      </span>
                      <span className="rel-body">
                        <b>{r.title}</b>
                        <span className="tiny">{(r.genres || []).slice(0, 2).join(' · ')}</span>
                        <span className="rel-price">{final <= 0 ? 'Free to play' : '$' + final.toFixed(2)}</span>
                      </span>
                    </Link>
                  );
                })}
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
          <div className="buy-area">
            <h4>{(game.price || 0) > 0 ? 'Digital edition' : 'Free to play'}</h4>
            {(game.price || 0) > 0
              ? <p className="tiny">{keyMode} — nothing is held in stock.</p>
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

