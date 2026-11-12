import { ImageUpload } from '../components.jsx';

export function DevGameForm({ game, onSave, onDelete, onCancel }) {
  return (
    <form className="panel" onSubmit={onSave} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <h3>Edit — {game.title}</h3>
      <input name="title" placeholder="Title" defaultValue={game.title} required />
      <input name="tagline" placeholder="Tagline" defaultValue={game.tagline || ''} />
      <div className="row">
        <input name="price" type="number" step="0.01" placeholder="Price" defaultValue={game.price} />
        <input name="discountPct" type="number" placeholder="% off" defaultValue={game.discountPct} />
        <input name="physicalStock" type="number" placeholder="Box stock" defaultValue={game.physical?.stock || 0} />
        <select name="status" defaultValue={game.status}>
          <option value="published">published</option>
          <option value="draft">draft</option>
          <option value="delisted">delisted</option>
        </select>
      </div>
      <div className="row">
        <input name="genres" placeholder="Genres (comma)" defaultValue={(game.genres || []).join(', ')} />
        <input name="tags" placeholder="Tags (comma)" defaultValue={(game.tags || []).join(', ')} />
      </div>
      <textarea name="description" placeholder="Description" defaultValue={game.description || ''} />
      <ImageUpload name="coverImage" kind="cover" defaultValue={game.coverImage || ''} label="Upload cover" />
      <div className="row">
        <button className="cta-btn sm">Save</button>
        <button type="button" className="ghost-btn sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="ghost-btn sm" onClick={onDelete}>Delete game</button>
      </div>
    </form>
  );
}
