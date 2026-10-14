/* A session store backed by the MongoDB we already connect to.
 *
 * The default MemoryStore keeps sessions in the process heap, which is wrong
 * anywhere the process can be replaced or scaled: on Render the free tier
 * spins down after fifteen idle minutes, and every restart would sign everyone
 * out. Storing sessions in the same database makes a session survive a
 * redeploy, a restart, or a second instance.
 *
 * Written here rather than pulled in as a package: it is four methods and the
 * connection already exists.
 */
const mongoose = require('mongoose');
const session = require('express-session');

/* Extend express-session's own Store base rather than EventEmitter directly.
 * It is an EventEmitter already, and it supplies createSession — which the
 * library calls when inflating a session and without which every signed-in
 * request fails with "store.createSession is not a function". */
const Store = class Store extends session.Store {};

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);

function createMongoSessionStore(connection) {
  const schema = new mongoose.Schema({
    sid: { type: String, required: true, unique: true, index: true },
    sess: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  }, { versionKey: false, collection: 'sessions' });

  const Session = connection.models.PixelSession || connection.model('PixelSession', schema);

  // Mongo's own TTL monitor removes expired rows, so the collection cannot grow
  // without bound and no cleanup timer is needed.
  Session.createIndexes().catch((e) => console.error('[session] index creation failed:', e.message));

  /* Only the four data methods below are ours; createSession, regenerate and
   load come from the base class. */
  const Store = class Store extends session.Store {};
  Store.prototype.get = function get(sid, cb) {
    Session.findOne({ sid }).lean()
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
          return Session.deleteOne({ sid }).then(() => cb(null, null), () => cb(null, null));
        }
        return cb(null, row.sess);
      })
      .catch((e) => cb(e));
  };

  Store.prototype.set = function set(sid, sess, cb) {
    const expiresAt = sess && sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
    Session.findOneAndUpdate(
      { sid },
      { $set: { sess, expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .then(() => cb && cb(null), (e) => cb && cb(e));
  };

  Store.prototype.destroy = function destroy(sid, cb) {
    Session.deleteOne({ sid })
      .then(() => cb && cb(null), (e) => cb && cb(e));
  };

  // called when a cookie is still alive but the session was not modified
  Store.prototype.touch = function touch(sid, sess, cb) {
    const expiresAt = sess && sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
    Session.updateOne({ sid }, { $set: { expiresAt } })
      .then(() => cb && cb(null), (e) => cb && cb(e));
  };

  Store.prototype.clear = function clear(cb) {
    Session.deleteMany({}).then(() => cb && cb(null), (e) => cb && cb(e));
  };
  Store.prototype.length = function length(cb) {
    Session.countDocuments({}).then((n) => cb && cb(null, n), (e) => cb && cb(e));
  };

  // express-session expects an instance, not the class itself
  return new Store();
}

module.exports = { createMongoSessionStore, SESSION_TTL_DAYS };