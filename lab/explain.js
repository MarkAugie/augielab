// AugieLab shared "What's happening?" button.
// Add <template id="explain"> ...headings and paragraphs... </template> to a page, then load this script.
// Optional: <body data-explain-bottom="40"> to lift the button, data-explain-autohide to hide it when the mouse is idle.
(() => {
  const tpl = document.getElementById('explain');
  if (!tpl) return;
  const bottom = (document.body.dataset.explainBottom || 16) + 'px';
  const css = `
    .lab-why { position: fixed; left: 16px; bottom: ${bottom}; z-index: 40; padding: .7rem 1.15rem; border-radius: 999px; cursor: pointer;
      font: 600 16px/1.2 "IBM Plex Sans", system-ui, sans-serif; color: #fff; background: rgba(12,16,24,.82);
      border: 1px solid rgba(255,255,255,.35); box-shadow: 0 6px 18px rgba(0,0,0,.45); transition: opacity .6s; }
    .lab-why:hover { border-color: #fff; }
    .lab-why:focus-visible, .lab-x:focus-visible { outline: 3px solid #FFD36E; outline-offset: 2px; }
    .lab-why.idle { opacity: 0; pointer-events: none; }
    .lab-info { position: fixed; inset: 0; z-index: 41; display: flex; align-items: center; justify-content: center; padding: 18px;
      background: rgba(5,8,12,.8); opacity: 0; pointer-events: none; transition: opacity .3s; }
    .lab-info.open { opacity: 1; pointer-events: auto; }
    .lab-box { position: relative; width: min(660px, 100%); max-height: 88vh; overflow-y: auto; background: #1C2230; color: #E9EDF4;
      border: 1px solid rgba(255,255,255,.22); border-radius: 10px; padding: 2rem 1.7rem 1.6rem; font: 18px/1.6 "IBM Plex Sans", system-ui, sans-serif; }
    .lab-box h2 { font: 700 1.6em/1.2 "IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif; margin: 0 0 .5em; padding-right: 3rem; }
    .lab-box h3 { font-size: 1.02em; color: #FFD36E; margin: 1.1em 0 .25em; }
    .lab-box p { margin: 0; color: #D5DCE7; }
    .lab-x { position: absolute; top: 12px; right: 12px; width: 46px; height: 46px; border-radius: 50%; cursor: pointer;
      font-size: 26px; line-height: 1; color: #fff; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.3); }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const btn = document.createElement('button'); btn.className = 'lab-why'; btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog'); btn.textContent = "✦ What's happening?";
  const wrap = document.createElement('div'); wrap.className = 'lab-info'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const box = document.createElement('div'); box.className = 'lab-box'; box.appendChild(tpl.content.cloneNode(true));
  const x = document.createElement('button'); x.className = 'lab-x'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
  box.prepend(x); wrap.appendChild(box); document.body.append(btn, wrap);

  const open = () => { wrap.classList.add('open'); x.focus(); };
  const close = () => { wrap.classList.remove('open'); btn.focus(); };
  btn.addEventListener('click', open); x.addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('open')) { e.stopPropagation(); close(); } }, true);

  if ('explainAutohide' in document.body.dataset) {
    let t; const wake = () => { btn.classList.remove('idle'); clearTimeout(t); t = setTimeout(() => btn.classList.add('idle'), 5000); };
    addEventListener('mousemove', wake); wake();
  }
})();
