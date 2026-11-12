import { ImageUpload } from '../components.jsx';

export function AdminGameForm({ game, onSave, onCancel }) {
  return (
    <form className="panel" onSubmit={onSave} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <h3>{game ? `Edit game — ${game.title}` : 'New game'}</h3>
      <input name="title" placeholder="Title" defaultValue={game?.title || ''} required />
      <div className="row">
        <input name="price" type="number" step="0.01" placeholder="Price" defaultValue={game?.price ?? ''} required />
        <input name="discountPct" type="number" placeholder="% off" defaultValue={game?.discountPct ?? 0} />
      </div>
      <div className="row">
        <input name="genres" placeholder="Genres (comma)" defaultValue={(game?.genres || []).join(', ')} />
        <input name="tags" placeholder="Tags (comma)" defaultValue={(game?.tags || []).join(', ')} />
      </div>
      <textarea name="description" placeholder="Description" defaultValue={game?.description || ''} />
      <ImageUpload name="coverImage" kind="cover" defaultValue={game?.coverImage || ''} label="Upload cover" />
      <div className="row">
        <label className="tiny"><input type="checkbox" name="featured" defaultChecked={!!game?.featured} /> Featured on home</label>
        <select name="status" defaultValue={game?.status || 'published'}>
          <option value="published">published</option>
          <option value="draft">draft</option>
          <option value="delisted">delisted</option>
        </select>
      </div>
      <div className="row">
        <button className="cta-btn sm">{game ? 'Save game' : 'Create game'}</button>
        <button type="button" className="ghost-btn sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
