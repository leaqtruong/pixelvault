/* A stand-in for the gateway's own payment page, served by this server.
 *
 * It exists so the full flow can be walked through on a machine with no
 * merchant account. It deliberately mimics a real hosted checkout: the shopper
 * is redirected away from the store, confirms here, and is redirected back
 * with signed parameters that the store verifies before delivering anything.
 *
 * It moves no money and says so on the page. */
const express = require('express');
const gateway = require('../lib/paymentGateway');

const router = express.Router();

const page = (body, title) => `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { --ink:#1c1a17; --dim:#6b6459; --faint:#8d8578; --line:#ddd6c9; --bg:#f7f4ee; --card:#fff; --accent:#b5761f; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
         display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
  .box { width:100%; max-width:520px; background:var(--card); border:1px solid var(--line); border-radius:4px; }
  .head { border-bottom:1px solid var(--line); padding:16px 22px; }
  .head b { font-size:15px; letter-spacing:.02em; }
  .badge { display:inline-block; margin-top:6px; padding:3px 8px; border:1px solid #d9a441;
           border-radius:3px; background:#fdf6e6; color:#8a5d10; font-size:11px; font-weight:700;
           letter-spacing:.06em; text-transform:uppercase; }
  .pad { padding:22px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:8px 16px; margin:0 0 20px; font-size:13.5px; }
  dt { color:var(--faint); }
  dd { margin:0; font-family:Consolas,Menlo,monospace; word-break:break-all; }
  .amount { border-top:1px solid var(--line); border-bottom:1px solid var(--line);
            padding:14px 0; margin:0 0 20px; display:flex; justify-content:space-between; align-items:baseline; }
  .amount span { color:var(--dim); font-size:13px; }
  .amount b { font-family:Consolas,Menlo,monospace; font-size:26px; }
  .btns { display:flex; gap:10px; }
  .lbl { display:block; font-size:12px; color:var(--dim); margin:0 0 6px; }
  .sel { width:100%; font:inherit; font-size:14px; padding:11px 12px; border-radius:3px;
         border:1px solid var(--line); background:#fff; color:var(--ink); }
  button { flex:1; font:inherit; font-size:14px; font-weight:600; padding:12px; cursor:pointer;
           border-radius:3px; border:1px solid var(--line); background:#fff; color:var(--ink); }
  button.ok { background:var(--accent); border-color:var(--accent); color:#fff; }
  button:hover { filter:brightness(1.06); }
  .note { margin:18px 0 0; padding:11px 13px; background:#fdf6e6; border-left:3px solid #d9a441;
          font-size:12.5px; color:#6d5518; line-height:1.55; }
</style></head><body><div class="box">
<div class="head"><b>Cổng thanh toán — mô phỏng</b><br><span class="badge">Sandbox · không chuyển tiền thật</span></div>
<div class="pad">${body}</div>
</div></body></html>`;

const money = (n) => new Intl.NumberFormat('vi-VN').format(Number(n)) + ' ₫';

/* Carry every signed parameter through the form as hidden fields, so adding a
 * bank code cannot disturb the signature the store is about to check. */
const hidden = (q) => Object.entries(q)
  .filter(([k, v]) => k !== 'act' && k !== 'vnp_SecureHash' && k !== 'vnp_BankCode')
  .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`)
  .join('\n      ');

/* The page a redirected shopper lands on. */
router.get('/sandbox-gateway', (req, res) => {
  const q = req.query;
  const txnRef = String(q.vnp_TxnRef || '');
  const amount = Number(q.vnp_Amount || 0);
  const returnUrl = String(q.vnp_ReturnUrl || '/');

  if (!txnRef || !amount || !returnUrl) {
    return res.status(400).send(page('<p>Yêu cầu thanh toán không hợp lệ.</p>', 'Thanh toán'));
  }

  // verifyCallback strips vnp_SecureHash itself, so it must be passed the full
  // query — handing it an already-stripped object means it finds no signature
  // to compare and rejects every request
  if (!gateway.verifyCallback(q)) {
    return res.status(400).send(page(
      '<p>Chữ ký yêu cầu không hợp lệ. Cổng thanh toán từ chối xử lý.</p>', 'Thanh toán'));
  }

  const back = (status) => {
    const signed = gateway.sandboxResponse({ txnRef, amount, status });
    res.redirect(302, `${returnUrl}?${gateway.queryOf(signed)}`);
  };

  res.send(page(`
    <dl>
      <dt>Mã đơn</dt><dd>${txnRef}</dd>
      <dt>Nội dung</dt><dd>${String(q.vnp_OrderInfo || '')}</dd>
      <dt>Cổng</dt><dd>${String(q.vnp_TmnCode || '')}</dd>
      <dt>Thời điểm</dt><dd>${String(q.vnp_CreateDate || '')}</dd>
    </dl>
    <div class="amount"><span>Số tiền</span><b>${money(amount / 100)}</b></div>
    <form method="POST" action="/sandbox-gateway/result">
      ${hidden(q)}
      <label class="lbl" for="bank">Ngân hàng / phương thức</label>
      <select class="sel" id="bank" name="vnp_BankCode">
        <option value="">— Chọn sau, không giới hạn —</option>
        ${String(q.vnp_BankCode || '') ? `<option value="${String(q.vnp_BankCode)}" selected>${String(q.vnp_BankCode)}</option>` : ''}
      </select>
      <div class="btns" style="margin-top:16px">
        <button class="ok" type="submit" name="act" value="ok">Thanh toán</button>
        <button type="submit" name="act" value="fail">Huỷ</button>
      </div>
    </form>
    <p class="note">
      Đây là cổng thanh toán mô phỏng phục vụ đồ án. <b>Không có tiền thật nào được chuyển.</b>
      Thao tác "Thanh toán" sẽ ký bằng HMAC-SHA512 giống hệt cách cổng thật ký, rồi chuyển hướng về
      cửa hàng — nơi chữ ký được kiểm tra trước khi giao key.
      Khi được cấu hình <code>VNP_TMN_CODE</code> và <code>VNP_HASH_SECRET</code>, cửa hàng
      chuyển sang cổng VNPay thật mà không phải sửa dòng nào ở đây.
    </p>`, 'Thanh toán'));
});

/* Confirm / cancel. The store's signature is re-checked first: this handler
 * signs whatever it is given, so trusting it blindly would let anyone edit the
 * amount by hand. Re-signing here is also wrong — the store would reject a
 * callback it did not sign. */
/* Confirm / cancel.
 *
 * The store's signature is re-checked first: this handler signs whatever it is
 * given, so trusting it blindly would let anyone edit the amount by hand.
 *
 * The outcome travels in the request body, never the query string: every query
 * parameter is covered by the signature, so appending act=ok to the URL would
 * invalidate it and the payment could never be completed. A form POST keeps the
 * signed parameters untouched. */
function handleResult(req, res) {
  const act = String((req.body && req.body.act) || '');
  if (!gateway.verifyCallback(req.query)) {
    return res.status(400).send(page(
      '<p>Chữ ký yêu cầu không hợp lệ. Cổng thanh toán từ chối xử lý.</p>', 'Thanh toán'));
  }
  const txnRef = String(req.query.vnp_TxnRef || '');
  const amount = Number(req.query.vnp_Amount || 0);
  const returnUrl = String(req.query.vnp_ReturnUrl || '');
  if (!txnRef || !amount || !returnUrl) return res.status(400).send(page('<p>Yêu cầu không hợp lệ.</p>', 'Thanh toán'));

  const signed = gateway.sandboxResponse({
    txnRef, amount,
    status: act === 'fail' ? 'fail' : 'ok',
    bankCode: (req.body && req.body.vnp_BankCode) || req.query.vnp_BankCode,
  });
  res.redirect(302, `${returnUrl}?${gateway.queryOf(signed)}`);
}

router.post('/sandbox-gateway/result', handleResult);
router.get('/sandbox-gateway/result', (req, res) => {
  res.status(405).send(page(
    '<p>Cổng thanh toán yêu cầu xác nhận qua POST. Tham số trên đường dẫn đã được ký, nên không thể ghi thêm vào đó.</p>',
    'Thanh toán'));
});

module.exports = router;