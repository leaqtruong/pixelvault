import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GameCard, useToast } from '../components.jsx';

export function Checkout() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [method, setMethod] = useState('standard');
  const nav = useNavigate();
  useEffect(() => { api('/checkout/summary?method=' + method).then(setD).catch((e) => setErr(e.message)); }, [method]);
  const place = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/checkout/place', { method: 'POST', body: { method, fullName: f.get('fullName'), street: f.get('street'), city: f.get('city'), region: f.get('region'), postal: f.get('postal'), country: f.get('country') || 'US', phone: f.get('phone') } });
      // Nothing is delivered here. The order is pending until the gateway
      // signs its callback and this store verifies that signature.
      sessionStorage.setItem('pv:return', '/orders/' + r.orderId);
      window.location.href = r.paymentUrl;
    } catch (er) {
      setErr(er.message);
      /* The server has already corrected the stored price; reload the summary
         so the total on screen matches what the retry will charge. */
      if (er.code === 'price_changed') {
        api('/checkout/summary?method=' + method).then(setD).catch(() => {});
      }
    }
  };
  if (err && !d) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const addr = (d.addresses || [])[0] || {};
  /* Delivery only applies to physical editions and toys. A digital-only cart
     must never ask for a shipping method or an address. */
  const needsShipping = (d.items || []).some((i) => i.edition === 'physical' || (i.kind || 'game') === 'toy');
  return (
    <>
      <h1>Checkout</h1>
      <div className="two-col"><div className="panel">
        <form onSubmit={place}>
          {needsShipping ? (
            <>
              <h3>1 · Shipping method</h3>
              {['standard', 'express', 'overnight'].map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" checked={method === m} onChange={() => setMethod(m)} /> {m}
                </label>
              ))}
              <p className="tiny" style={{ marginTop: 8 }}>
                Rates are sample prices for this coursework build, set in <code>.env</code>
                {d.quote && d.quote.rate ? ` — ${method} is currently ${d.quote.rate}` : ''}.
              </p>
              <h3>2 · Ship to</h3>
              <input name="fullName" placeholder="Full name" defaultValue={addr.fullName} required />
              <input name="street" placeholder="Street" defaultValue={addr.street} required />
              <div className="row"><input name="city" placeholder="City" defaultValue={addr.city} required /><input name="postal" placeholder="ZIP" defaultValue={addr.postal} required /></div>
              <div className="row"><input name="country" placeholder="Country" defaultValue={addr.country || 'US'} /><input name="phone" placeholder="Phone" defaultValue={addr.phone} /></div>
              <h3>3 · Payment</h3>
            </>
          ) : (
            <>
              <h3>1 · Digital delivery</h3>
              <p className="tiny">
                This cart is digital only. Keys appear in your Library as soon as
                the payment is confirmed — no shipping method or address needed.
              </p>
              <h3>2 · Payment</h3>
            </>
          )}
          <button className="cta-btn big">Pay ${d.grand.toFixed(2)} →</button>
          <p className="tiny" style={{ marginTop: 10, marginBottom: 0 }}>
            You will be taken to the payment gateway to confirm. Keys are only
            delivered once the store has verified the gateway&apos;s signed
            callback — abandoning the gateway costs nothing and holds no stock.
          </p>
        </form>
        {err && <p className="err">{err}</p>}
      </div>
        <div className="panel"><h3>Order summary</h3>
          {d.items.map((i) => <p key={i.key}>{i.qty}× {i.title} — ${(i.unitPrice * i.qty).toFixed(2)}</p>)}
          <hr /><p>Subtotal: ${d.subtotal.toFixed(2)}</p><p>Tax: ${d.tax.toFixed(2)}</p>
          {needsShipping
            ? <p>Shipping: ${d.shipCost.toFixed(2)}</p>
            : <p>Delivery: instant digital</p>}
          <h3>Total: ${d.grand.toFixed(2)}</h3>
          {needsShipping && d.quote && d.quote.sampleRate && (
            <p className="tiny">Shipping is a sample rate, not a carrier tariff. {d.quote.weight} lb billed at {d.quote.rate}.</p>
          )}
        </div>
      </div>
    </>
  );
}

/* Where the gateway sends the shopper back to. It does not trust the query
   string: it hands the parameters to the store, which checks the signature and
   settles the payment, then this page reports what actually happened. */
const REASON = {
  'invalid-signature': 'The gateway signature did not match. The request was rejected and nothing was delivered.',
  'unknown-payment': 'No matching payment was found for this reference.',
  'order-missing': 'The order behind this payment no longer exists.',
  'already-settled': 'This payment had already been processed.',
};

