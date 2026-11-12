import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function Support() {
  return (<>
    <div className="sec-head" style={{ marginTop: 0 }}>
      <span className="ix">Help</span>
      <h1>Support &amp; refunds</h1>
    </div>
    <div className="panel">
      <h3>Digital key delivery</h3>
      <p>Keys land in your Library the moment a payment is confirmed. On this coursework build, delivered keys are clearly-labelled <code>DEMO-XXXXX-XXXXX-XXXXX</code> placeholders — they are not real game keys.</p>
      <h3>Refunds and cancellation</h3>
      <p>You can cancel any <b>pending</b> order from its order page before the payment completes. Once a digital order is paid, its key may have been revealed, so it cannot be refunded through the site — contact support to review it.</p>
      <h3>Shipping</h3>
      <p>Physical items and collectibles ship from the demo warehouse. Rates shown at checkout are sample prices, not a live carrier tariff.</p>
      <h3>Contact</h3>
      <p>This is a coursework project. For help, ask in the <Link to="/community">Community forum</Link>.</p>
    </div>
  </>);
}
