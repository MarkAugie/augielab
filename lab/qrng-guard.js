// AugieLab: be polite to the quantum generator. If a request to /api/qrng fails, every request
// from this page for the next 30 seconds is answered "offline" right away (the page then uses
// the browser's own generator), instead of retrying many times a second.
(() => {
  const realFetch = window.fetch.bind(window);
  let downUntil = 0;
  const offline = () => new Response('{"ok":false,"error":"quantum generator offline"}', { status: 503, headers: { 'content-type': 'application/json' } });
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/qrng')) return realFetch(input, init);
    if (Date.now() < downUntil) return Promise.resolve(offline());
    return realFetch(input, init).then(
      (r) => { if (!r.ok) downUntil = Date.now() + 30000; return r; },
      (e) => { downUntil = Date.now() + 30000; throw e; });
  };
})();
