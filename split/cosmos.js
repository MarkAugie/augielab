// AugieLab Universe Splitter: paints an original picture of the whole observable universe,
// from the center out: the Sun and planets, the Milky Way, nearby galaxies, the cosmic web of
// galaxy clusters, and at the edge the Big Bang's afterglow (the cosmic microwave background).
// Every detail is seeded from the quantum reading, so no two universes look alike.
(() => {
  function rng(seed) {
    let s = seed | 0;
    return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // smooth value noise, layered (fbm), for the afterglow's speckles and the haze
  function makeNoise(r) {
    const P = 256, perm = new Uint8Array(P * 2), val = new Float32Array(P);
    for (let i = 0; i < P; i++) { perm[i] = i; val[i] = r(); }
    for (let i = P - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < P; i++) perm[i + P] = perm[i];
    const v = (x, y) => val[perm[(x & 255) + perm[y & 255]]];
    const sm = (t) => t * t * (3 - 2 * t);
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    return (x, y, oct = 4) => { let s = 0, amp = .5, f = 1, norm = 0; for (let o = 0; o < oct; o++) { s += amp * n2(x * f, y * f); norm += amp; amp *= .5; f *= 2.03; } return s / norm; };
  }

  // the afterglow map's colors: deep blue (cooler) through green and yellow to red (warmer)
  const CMB = [[0, [12, 10, 70]], [.2, [30, 62, 176]], [.36, [32, 160, 214]], [.48, [44, 196, 178]], [.58, [130, 210, 96]],
    [.68, [240, 222, 76]], [.8, [242, 140, 46]], [1, [200, 36, 30]]];
  function cmbColor(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < CMB.length; i++) if (t <= CMB[i][0]) {
      const [t0, c0] = CMB[i - 1], [t1, c1] = CMB[i], k = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
    return CMB[CMB.length - 1][1];
  }

  function glowDot(g, x, y, rad, rgb, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(.25, `rgba(${rgb},${a * .8})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }

  function spiral(g, r, x, y, size, tilt, angle, arms, count, rgbCore) {
    g.save(); g.translate(x, y); g.rotate(angle); g.scale(1, tilt);
    for (let i = 0; i < count; i++) {
      const k = Math.pow(r(), .85), arm = (i % arms) * (Math.PI * 2 / arms);
      const spread = (r() + r() + r() - 1.5) * (.5 - k * .22);          // softer, bell-shaped arms
      const a = arm + k * 3.4 + spread, d = size * (.05 + k * .95) * (.9 + r() * .2);
      const px = Math.cos(a) * d, py = Math.sin(a) * d, blue = k > .45 && r() < .5;
      g.fillStyle = blue ? `rgba(170,200,255,${.35 + r() * .5})` : `rgba(255,${220 + r() * 30 | 0},${190 + r() * 50 | 0},${.3 + r() * .5})`;
      const s = size * (.008 + r() * .016);
      g.fillRect(px - s / 2, py - s / 2, s, s);
    }
    glowDot(g, 0, 0, size * .75, '140,150,255', .16);
    glowDot(g, 0, 0, size * .42, rgbCore, .95);
    g.restore();
  }

  // Paint one universe on a square canvas of `px` pixels. Returns the canvas.
  function paintUniverse(seed, px) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d'), r = rng(seed), noise = makeNoise(r), noise2 = makeNoise(r);
    const C = px / 2, R = px * .44;   // leave room around the edge for the outer glow

    // 1. pixels: dark deep space inside, the speckled afterglow in the outer ring
    const img = g.createImageData(px, px), d = img.data;
    const ns = 9 / R * 2.2, hz = 2.2 / R;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const dx = x - C, dy = y - C, dist = Math.sqrt(dx * dx + dy * dy) / R;
      if (dist > 1) continue;
      const i = (y * px + x) * 4;
      // faint violet haze of distant matter
      const h = noise2(x * hz + 40, y * hz + 40, 4), h2 = Math.max(0, h - .45) * 2.2;
      const depth = .55 + .45 * dist;   // a little brighter toward the edge, like looking deeper
      let cr = (6 + h * 10 + h2 * 46) * depth, cg = (5 + h * 8 + h2 * 14) * depth, cb = (20 + h * 26 + h2 * 70) * depth;
      if (dist > .84 && dist < .93) {   // the hot, glowing edge where the afterglow begins
        const e = 1 - Math.abs(dist - .885) / .045, ee = e * e;
        cr += 120 * ee; cg += 60 * ee; cb += 70 * ee;
      }
      if (dist > .86) {
        const t = noise(x * ns, y * ns, 5);
        const [mr, mg, mb] = cmbColor((t - .22) * 1.8);
        // blend in from the dark: the afterglow is the farthest thing we can see
        let k = Math.min(1, (dist - .86) / .05);
        k = k * k * (3 - 2 * k);
        const dim = .62 + .3 * Math.min(1, (dist - .88) / .1);
        cr = cr + (mr * dim - cr) * k; cg = cg + (mg * dim - cg) * k; cb = cb + (mb * dim - cb) * k;
      }
      // soft edge
      const edge = dist > .985 ? (1 - dist) / .015 : 1;
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = 255 * edge;
    }
    g.putImageData(img, 0, 0);

    g.save(); g.beginPath(); g.arc(C, C, R * .995, 0, Math.PI * 2); g.clip();
    g.globalCompositeOperation = 'lighter';

    // 2. the cosmic web: knots of galaxy clusters joined by faint filaments
    const nodes = [], NN = 340;
    for (let i = 0; i < NN; i++) {
      const a = r() * Math.PI * 2, dd = R * (.3 + Math.pow(r(), .75) * .54);
      nodes.push([C + Math.cos(a) * dd, C + Math.sin(a) * dd, .4 + r() * .6]);
    }
    const lw = px / 1000, link = (R * .13) ** 2;      // line widths scale with the picture, so small universes stay delicate
    for (let i = 0; i < NN; i++) for (let j = i + 1; j < NN; j++) {
      const p = nodes[i], q = nodes[j], dx = p[0] - q[0], dy = p[1] - q[1], dd = dx * dx + dy * dy;
      if (dd > link || r() < .25) continue;
      const mx = (p[0] + q[0]) / 2 + (r() - .5) * Math.sqrt(dd) * .35, my = (p[1] + q[1]) / 2 + (r() - .5) * Math.sqrt(dd) * .35;
      g.strokeStyle = r() < .3 ? `rgba(255,150,210,${.07 + r() * .1})` : `rgba(140,150,255,${.08 + r() * .12})`; g.lineWidth = lw * (.7 + r() * .9);
      g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(mx, my, q[0], q[1]); g.stroke();
      // galaxies strung along the filament
      for (let k = 0; k < 10; k++) {
        const t = r(), u = 1 - t;
        const fx = u * u * p[0] + 2 * u * t * mx + t * t * q[0], fy = u * u * p[1] + 2 * u * t * my + t * t * q[1];
        g.fillStyle = `rgba(210,190,255,${.25 + r() * .35})`; const s = lw * (1 + r() * 1.4); g.fillRect(fx, fy, s, s);
      }
    }
    for (const [x, y, w] of nodes) {
      glowDot(g, x, y, R * (.006 + w * .012), w > .8 ? '255,190,230' : '170,170,255', .35 + w * .4);
      if (w > .85) glowDot(g, x, y, R * .035, '160,110,255', .12);   // the biggest clusters get a soft halo
    }

    // a scatter of distant galaxies everywhere
    for (let i = 0; i < 3200; i++) {
      const a = r() * Math.PI * 2, dd = R * Math.sqrt(r()) * .82;
      g.fillStyle = `rgba(${200 + r() * 55 | 0},${190 + r() * 50 | 0},255,${.15 + r() * .35})`;
      const s = lw * (.8 + r() * 1.2); g.fillRect(C + Math.cos(a) * dd, C + Math.sin(a) * dd, s, s);
    }

    // 3. our neighborhood: a ring of nearby galaxies (Andromeda is the big one)
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, dd = R * (.2 + r() * .14), big = i === 0;
      const x = C + Math.cos(a) * dd, y = C + Math.sin(a) * dd;
      if (big || r() < .4) spiral(g, r, x, y, R * (big ? .055 : .03), .35 + r() * .4, r() * 3, 2, big ? 260 : 90, '255,236,210');
      else { g.save(); g.translate(x, y); g.rotate(r() * 3); g.scale(1, .5 + r() * .4); glowDot(g, 0, 0, R * (.015 + r() * .015), '255,230,200', .8); g.restore(); }
    }

    // 4. the Milky Way, seen face-on
    glowDot(g, C, C, R * .15, '150,150,255', .18);
    spiral(g, r, C, C, R * .13, .92, r() * 6, 4, 3200, '255,232,200');

    // 5. the Sun and the planets' orbits at the very center
    g.globalCompositeOperation = 'source-over';
    glowDot(g, C, C, R * .03, '255,214,140', 1);
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = lw * .8;
    [.008, .013, .018, .026].forEach((o) => { g.beginPath(); g.arc(C, C, R * o, 0, Math.PI * 2); g.stroke(); });
    g.fillStyle = '#FFF3C2'; g.beginPath(); g.arc(C, C, Math.max(1.5, R * .005), 0, Math.PI * 2); g.fill();
    g.restore();

    // 6. outer glow: the edge of what we can see
    g.globalCompositeOperation = 'destination-over';
    const rim = g.createRadialGradient(C, C, R * .96, C, C, R * 1.12);
    rim.addColorStop(0, 'rgba(255,150,90,.55)'); rim.addColorStop(.35, 'rgba(255,110,150,.22)'); rim.addColorStop(1, 'rgba(140,90,255,0)');
    g.fillStyle = rim; g.beginPath(); g.arc(C, C, R * 1.12, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    return cv;
  }

  window.Cosmos = { paintUniverse };
})();
