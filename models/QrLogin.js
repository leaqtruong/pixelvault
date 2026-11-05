const mongoose = require('mongoose');

/* One-time QR login handshake.
 *
 * The web login page creates a `pending` row and shows its token as a QR code.
 * A phone that is already signed in scans it and confirms the token; the web
 * page polls for that confirmation and then activates the row, which plants
 * the confirmed user into the web session. Rows expire after 90 seconds so a
 * QR code left on a public screen cannot be replayed later. */
const qrLoginSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'confirmed'], default: 'pending' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now, expires: 90 },
});

module.exports = mongoose.models.QrLogin || mongoose.model('QrLogin', qrLoginSchema);
