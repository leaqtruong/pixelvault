import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GameCard, useToast } from '../components.jsx';

export function PaymentReturn() {
  const [sp] = useSearchParams();
  const [d, setD] = useState({ state: 'checking' });
  const nav = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs = sp.toString();
      try {
        const r = await api('/payment/return' + (qs ? '?' + qs : ''));
        if (cancelled) return;
        if (r.already && r.ok) setD({ state: 'done', message: 'This payment was already confirmed.', orderId: r.orderId });
        else if (r.ok) setD({ state: 'done', message: 'Payment confirmed.', orderId: r.orderId, live: r.live });
        else setD({ state: 'failed', message: REASON[r.reason] || r.error || r.reason || 'The payment did not complete.', orderId: r.orderId });
      } catch (er) {
        if (!cancelled) setD({ state: 'failed', message: er.message });
      }
    })();
    return () => { cancelled = true; };
  }, [sp]);

  const back = d.orderId ? '/orders/' + d.orderId : (sessionStorage.getItem('pv:return') || '/orders');
  const again = () => { window.location.href = '/checkout'; };

  return (
    <>
      <h1>Payment</h1>
      <div className="panel">
        {d.state === 'checking' && <p className="muted">Verifying the gateway signature…</p>}

        {d.state === 'done' && (
          <>
            <h3>Payment confirmed</h3>
            <p>{d.message} Your keys are in the library.</p>
            <p className="tiny">
              The store recomputed the HMAC-SHA512 signature over the returned parameters and
              matched it against the one it issued. Only then were keys claimed — a forged or
              altered callback releases nothing.
            </p>
            <p className="row" style={{ marginBottom: 0 }}>
              <Link className="cta-btn" to={back}>View order</Link>
              <Link className="ghost-btn" to="/library">Open library</Link>
            </p>
          </>
        )}

        {d.state === 'failed' && (
          <>
            <h3>Payment not completed</h3>
            <p className="err">{d.message}</p>
            <p className="tiny">
              Nothing was reserved. Your basket is still intact and no stock was held, so you can
              try again.
            </p>
            <p className="row" style={{ marginBottom: 0 }}>
              <button className="cta-btn" onClick={again}>Try again</button>
              <Link className="ghost-btn" to="/cart">Back to cart</Link>
            </p>
          </>
        )}
      </div>
    </>
  );
}

