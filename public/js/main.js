// Vault widgets: live stats + shipping quote preview
(async () => {
  try {
    const r = await fetch('/api/stats').then(x => x.json());
    const el = document.getElementById('stat-games');
    if (el && r.games != null) el.textContent = r.games;
  } catch {}
  const form = document.getElementById('checkout-form');
  if (form) {
    form.querySelectorAll('input[name=method]').forEach(radio => {
      radio.addEventListener('change', () => {
        const m = new URLSearchParams({ method: radio.value });
        // keep it simple: reload keeps server-side quote math authoritative
        window.location.search = '?' + m.toString();
      });
    });
  }
})();
