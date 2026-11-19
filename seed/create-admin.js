/* Create an admin account, or promote an existing account to admin.
 *
 *   node seed/create-admin.js <email> <password> [username]
 *
 * Uses MONGO_URI from .env. If the email already exists the password is left
 * untouched and only the role is raised, so this cannot silently reset a real
 * account. For a brand-new address it creates the account with the supplied
 * password (minimum 8 characters).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const [emailArg, password, usernameArg] = process.argv.slice(2);

async function main() {
  if (!emailArg || !password) {
    console.error('Usage: node seed/create-admin.js <email> <password> [username]');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) {
    console.error('That does not look like an email address.');
    process.exit(1);
  }
  if (String(password).length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Copy .env.example to .env first.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const email = emailArg.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { role: 'admin' } });
    console.log(`[admin] promoted ${existing.username} <${email}> to admin (password unchanged).`);
  } else {
    let base = String(usernameArg || email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || 'vaultuser';
    let username = base;
    let n = 0;
    while (await User.findOne({ username })) username = `${base}${++n}`;
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      username,
      email,
      passwordHash,
      role: 'admin',
      displayName: 'Store Admin',
    });
    console.log(`[admin] created ${user.username} <${email}> with role admin.`);
  }

  console.log(`[admin] database: ${mongoose.connection.name}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[admin] failed:', e.message);
  process.exit(1);
});
