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
      <p className="tiny">PixelVault coursework storefront — React + Express + MongoDB. Game data via Steam Store API, live players + review verdicts via Steam Web APIs, merch via official stores. Keys are DEMO placeholders.</p>
    </div>
  </>);
}

