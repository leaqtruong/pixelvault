import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function DevApply() {
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('/dev/apply', { method: 'POST', body: { studioName: f.get('studioName'), website: f.get('website'), payoutEmail: f.get('payoutEmail') } }); setMsg('Application submitted — an admin will review it.'); }
    catch (er) { setMsg(er.message); }
  };
  return <div className="auth-box"><h1>Become a developer</h1>
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}><input name="studioName" placeholder="Studio *" required /><input name="website" placeholder="Website" /><input name="payoutEmail" placeholder="Payout email *" required /><button className="cta-btn">Apply</button></form>
    {msg && <p className="tiny">{msg}</p>}</div>;
}

/* Developer replies: POST /reviews/:id/respond existed but nothing in the UI
   could reach it, so a published devResponse could never be written. */
