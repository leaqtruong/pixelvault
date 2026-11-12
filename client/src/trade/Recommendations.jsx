import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GameCard, useToast } from '../components.jsx';

export function Recommendations() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/recommendations').then(setD).catch(() => setD({ recs: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (<><h1>For you</h1><p className="tiny">Based on: {(d.topGenres || []).join(', ')}</p>
    <div className="card-grid">{(d.recs || []).map((g, ix) => <GameCard key={g._id} g={g} i={ix} />)}</div></>);
}
