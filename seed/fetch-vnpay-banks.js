/* Fetch VNPay's official bank list. This is the authoritative source for
   vnp_BankCode - previously the store refused to enumerate banks because any
   list would have been guesswork. Run it again to refresh; nothing is hardcoded
   in the application. */
const fs = require('node:fs');

const URL = 'https://sandbox.vnpayment.vn/qrpayauth/api/merchant/get_bank_list';
const TMN = process.env.VNP_TMN_CODE;

(async () => {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tmn_code: TMN }),
  });
  const list = await r.json();
  if (!Array.isArray(list)) { console.log('unexpected shape: ' + JSON.stringify(list).slice(0, 200)); process.exit(1); }

  const out = process.argv[2] || 'seed/vnpay-banks.json';
  fs.writeFileSync(out, JSON.stringify(list, null, 2) + '\n', 'utf8');

  console.log('nhan hang     : ' + list.length);
  console.log('luu tai       : ' + out);
  const byType = {};
  for (const b of list) byType[b.bank_type] = (byType[b.bank_type] || 0) + 1;
  console.log('theo loai     : ' + JSON.stringify(byType));
  console.log('\nkiem chuc nhung cai lang truoc day em doan sai:');
  for (const code of ['VIETINBANK', 'EXIMBANK', 'TECHCOMBANK', 'MBBANK', 'VIETCOMBANK', 'BIDV', 'ACB', 'NCB']) {
    const hit = list.find((b) => b.bank_code === code);
    console.log('  ' + code.padEnd(12) + (hit ? hit.bank_name : 'KHONG CO trong danh sach'));
  }
})().catch((e) => { console.log('FAIL ' + e.message); process.exit(1); });