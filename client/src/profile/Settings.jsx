import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

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
      <p className="tiny">PixelVault is a coursework storefront for digital games and physical collectibles. It is a full-stack build: a React SPA, an Express REST API, MongoDB for data and images, VNPay sandbox for payments, and an Android Kotlin client.</p>
      <div className="kpi-row">
        <div className="kpi"><span>Frontend</span><b>React + Vite</b></div>
        <div className="kpi"><span>Backend</span><b>Node + Express</b></div>
        <div className="kpi"><span>Database</span><b>MongoDB</b></div>
        <div className="kpi"><span>Mobile</span><b>Android Kotlin</b></div>
      </div>
      <p className="tiny"><b>How it is built:</b> React Router pages are split by feature; the API exposes REST endpoints for catalog, cart, checkout, orders, library, reviews, community, developer tools and admin. Authentication uses a signed HttpOnly cookie; passwords are bcrypt-hashed; login attempts are rate-limited.</p>
      <p className="tiny"><b>Data and payments:</b> MongoDB stores the business collections and GridFS stores the images. Orders snapshot title and price; library entries, addresses and forum replies are embedded documents; unique, text and TTL indexes keep the data consistent. Payment callbacks are verified with HMAC-SHA512 and settlement is idempotent, so a replay cannot issue a second key.</p>
      <p className="tiny"><b>Features:</b> catalog filters, game detail, cart and checkout, VNPay sandbox, library and key reveal, order tracking, reviews, community forum, QR login, developer portal, admin desk (users, catalog, toys, orders, payments, payouts, moderation), and an Android client.</p>
      <p className="tiny"><b>Deployment:</b> the Node service and MongoDB database run on managed cloud hosting; Vite builds the client and Express serves it. All delivered keys are <code>DEMO-…</code> placeholders for coursework.</p>
    </div>
  </>);
}

