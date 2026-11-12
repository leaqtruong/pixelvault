import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components.jsx';

export function AdminModeration({ tab, devRequests, posts, reviews, onChanged }) {
  const toast = useToast();
  const approve = async (u) => {
    try { await api(`/admin/devs/${u._id}/approve`, { method: 'POST' }); toast(`@${u.username} approved`); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const reject = async (u) => {
    if (!window.confirm(`Reject @${u.username}'s developer application?`)) return;
    try { await api(`/admin/devs/${u._id}/reject`, { method: 'POST' }); toast('Application rejected'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const delPost = async (p) => {
    if (!window.confirm('Delete post "' + p.title + '"?')) return;
    try { await api('/admin/posts/' + p._id, { method: 'DELETE' }); toast('Post deleted'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const delReview = async (r) => {
    if (!window.confirm('Delete review "' + r.title + '"?')) return;
    try { await api('/admin/reviews/' + r._id, { method: 'DELETE' }); toast('Review deleted'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  if (tab === 'devs') {
    return devRequests.length ? (
      <table className="ptable">
        <thead><tr><th>User</th><th>Studio</th><th>Email</th><th>Requested</th><th /></tr></thead>
        <tbody>{devRequests.map((u) => (
          <tr key={u._id}>
            <td className="t-name">@{u.username}</td>
            <td className="t-genre">{u.devProfile?.studioName}</td>
            <td className="t-genre">{u.email}</td>
            <td className="t-genre">{u.devProfile?.requestedAt ? new Date(u.devProfile.requestedAt).toLocaleDateString() : '—'}</td>
            <td>
              <button className="cta-btn sm" onClick={() => approve(u)}>Approve</button>{' '}
              <button className="ghost-btn sm" onClick={() => reject(u)}>Reject</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    ) : <p className="muted">No pending developer applications.</p>;
  }
  if (tab === 'posts') {
    return posts.length ? (
      <table className="ptable">
        <thead><tr><th>Post</th><th>Author</th><th>Board</th><th>Replies</th><th>Placed</th><th /></tr></thead>
        <tbody>{posts.map((p) => (
          <tr key={p._id}>
            <td><Link className="t-name" to={'/community/p/' + p._id}>{p.title}</Link></td>
            <td className="t-genre">@{p.author?.username || '?'}</td>
            <td className="t-genre">{p.board}</td>
            <td className="t-genre">{(p.replies || []).length}</td>
            <td className="t-genre">{new Date(p.createdAt).toLocaleDateString()}</td>
            <td><button className="ghost-btn sm" onClick={() => delPost(p)}>Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
    ) : <p className="muted">No community posts.</p>;
  }
  return reviews.length ? (
    <table className="ptable">
      <thead><tr><th>Review</th><th>Game</th><th>Author</th><th>Stars</th><th>Placed</th><th /></tr></thead>
      <tbody>{reviews.map((r) => (
        <tr key={r._id}>
          <td className="t-name">{r.title}</td>
          <td className="t-genre">{r.game?.title || '?'}</td>
          <td className="t-genre">@{r.user?.username || '?'}</td>
          <td className="t-genre">{r.stars}/5</td>
          <td className="t-genre">{new Date(r.createdAt).toLocaleDateString()}</td>
          <td><button className="ghost-btn sm" onClick={() => delReview(r)}>Delete</button></td>
        </tr>
      ))}</tbody>
    </table>
  ) : <p className="muted">No reviews.</p>;
}
