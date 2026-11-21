// AugieLab usage counter. Counts what gets used (page views, rolls, splits...), never who.
// No cookies, no IP addresses, nothing personal. Pages call labTrack('kind', n).
(() => {
  let off = false;
  try { off = localStorage.getItem('lab-notrack') === '1'; } catch (e) {}
  if (off || navigator.webdriver) { window.labTrack = () => {}; return; }
  const page = location.pathname.replace(/index\.html$/, '') || '/';
  const queue = {};
  function send(kind, n, ref) {
    const body = JSON.stringify({ page, kind, n, ref: ref || '' });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' }))) return;
      fetch('/api/hit', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
    } catch (e) {}
  }
  window.labTrack = (kind, n = 1) => { queue[kind] = (queue[kind] || 0) + n; };
  function flush() { for (const k of Object.keys(queue)) { if (queue[k] > 0) send(k, queue[k]); delete queue[k]; } }
  setInterval(flush, 8000);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  send('view', 1, document.referrer);
})();
