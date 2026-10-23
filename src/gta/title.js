// The title screen cover: a comic-panel collage in the spirit of the old GTA box art (flat tinted panels,
// halftone dots, heavy black outlines, slanted cuts and thick black frames), painted with this game's own cast: Artur, a police
// cruiser, the Take the Bus! bus, Camp Bussby's tank, the police helicopter, a taxi, the bank vault, the loot,
// the night city and a cop on foot. Each panel paints into its own canvas, then all are clipped to their
// slanted polygons on one canvas in #cover; live panels repaint a few times a second while the title is up (light bars blink, the rotor turns, Artur talks). Also wires the
// title's Controls button (the full controls list opens over the cover).
(function (PG) {
  if (typeof document === 'undefined') return;
  const cover = document.getElementById('cover');
  if (!cover) return;
  const TAU = Math.PI * 2, INK = '#0b0b0d';
  // Panels: a tint, a painter draw(g, w, h, t) for the panel's bounding box, live (repainted while the title
  // is up) or not, and its polygon per layout in 0..1 screen units. The cuts between panels are slanted
  // and every edge is stroked with a thick black frame, like the box art.
  const PANELS = [
    { id: 'artur', c: '#e2a93a', draw: artur, live: true },
    { id: 'tank', c: '#6f7d3a', draw: tank },
    { id: 'vault', c: '#c9c2ad', draw: vault, live: true },
    { id: 'city', c: '#2c3d8a', draw: city, live: true },
    { id: 'bus', c: '#d8402f', draw: bus },
    { id: 'taxi', c: '#e8579e', draw: taxi },
    { id: 'cruiser', c: '#3f7fd0', draw: cruiser, live: true },
    { id: 'heli', c: '#4fa59b', draw: heli, live: true },
    { id: 'cop', c: '#e3742c', draw: cop, live: true },
    { id: 'loot', c: '#3d9a4f', draw: loot },
  ];
  // landscape: three slanted columns (the logo sits on the night city in the middle)
  const WIDE = {
    artur: [[0, 0], [0.30, 0], [0.284, 0.40], [0, 0.46]],
    tank: [[0, 0.46], [0.284, 0.40], [0.2712, 0.72], [0, 0.76]],
    vault: [[0, 0.76], [0.2712, 0.72], [0.26, 1], [0, 1]],
    city: [[0.30, 0], [0.71, 0], [0.7364, 0.66], [0.276, 0.60]],
    bus: [[0.276, 0.60], [0.52, 0.6318], [0.48, 1], [0.26, 1]],
    taxi: [[0.52, 0.6318], [0.7364, 0.66], [0.75, 1], [0.48, 1]],
    cruiser: [[0.71, 0], [1, 0], [1, 0.24], [0.722, 0.30]],
    heli: [[0.722, 0.30], [1, 0.24], [1, 0.56], [0.7348, 0.62]],
    cop: [[0.7348, 0.62], [0.87, 0.5894], [0.86, 1], [0.75, 1]],
    loot: [[0.87, 0.5894], [1, 0.56], [1, 1], [0.86, 1]],
  };
  // portrait (phones): two up top, the city behind the logo, four below
  const TALL = {
    artur: [[0, 0], [0.56, 0], [0.5, 0.3], [0, 0.33]],
    cruiser: [[0.56, 0], [1, 0], [1, 0.27], [0.5, 0.3]],
    city: [[0, 0.33], [0.5, 0.3], [1, 0.27], [1, 0.66], [0, 0.7]],
    bus: [[0, 0.7], [0.6, 0.68], [0.55, 0.85], [0, 0.87]],
    taxi: [[0.6, 0.68], [1, 0.66], [1, 0.83], [0.55, 0.85]],
    tank: [[0, 0.87], [0.55, 0.85], [0.5, 1], [0, 1]],
    cop: [[0.55, 0.85], [1, 0.83], [1, 1], [0.5, 1]],
  };
  const main = document.createElement('canvas'); cover.appendChild(main);
  const els = PANELS.map(p => ({ p, cv: document.createElement('canvas'), w: 0, h: 0, bx: 0, by: 0, poly: null, painted: false }));

  // ---------- comic helpers ----------
  const HT = new Map();
  // halftone dots, bigger towards one corner: one cached tile per colour and size
  function halftone(g, w, h, col, k) {
    const step = Math.max(7, Math.round(Math.min(w, h) / 28));
    g.fillStyle = col;
    for (let y = 0; y < h + step; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < w + step; x += step) {
      const f = (x / w + y / h) / 2, r = step * 0.42 * (k == null ? 1 : k) * (0.25 + 0.75 * f);
      if (r < 0.6) continue;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }
  // sun-ray burst behind the hero of a panel
  function rays(g, cx, cy, R, col, n) {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a, a + TAU / n / 2); g.closePath(); g.fill(); }
  }
  const outline = (g, wpx) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = wpx; g.stroke(); };
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = q => Math.max(0, Math.min(255, Math.round(k < 0 ? q * (1 + k) : q + (255 - q) * k)));
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function bg(g, w, h, col) { g.fillStyle = col; g.fillRect(0, 0, w, h); halftone(g, w, h, shade(col, -0.22), 1); }
  // world-metre drawing at a given pixels-per-metre, centred, turned
  function world(g, x, y, ppm, rot, fn) { g.save(); g.translate(x, y); g.rotate(rot); g.scale(ppm, ppm); fn(); g.restore(); }
  // a hard comic drop shadow under whatever fn paints
  // (shadow offsets ignore the transform: off is in CSS pixels, scaled to the bitmap here)
  let DPR = 1;
  function inked(g, off, fn) { g.save(); g.shadowColor = INK; g.shadowBlur = 0; g.shadowOffsetX = g.shadowOffsetY = off * 1.5 * DPR; fn(); g.restore(); }
  function label(g, text, x, y, size, col, rot, font) {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.font = (font || "400 " + size + "px Bevan, 'Rockwell Extra Bold', Georgia, serif"); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = size * 0.3; g.strokeStyle = INK; g.strokeText(text, 0, 0); g.fillStyle = col; g.fillText(text, 0, 0);
    g.restore();
  }

  // ---------- panels ----------
  function artur(g, w, h, t) {
    bg(g, w, h, '#e2a93a'); rays(g, w * 0.5, h * 0.55, Math.hypot(w, h), 'rgba(255,240,200,0.18)', 18);
    const UI = PG.ui, s = Math.min(w, h) / 200 * 1.08;
    if (UI && UI.drawArturHead) {
      g.save(); g.translate(w / 2 - 100 * s, h * 0.58 - 112 * s); g.scale(s, s);
      inked(g, 6, () => UI.drawArturHead(g, 0.25, t, false, Math.sin(t * 3) > 0.3));
      g.restore();
    }
  }
  function car(g, o, ppm) {
    inked(g, 5, () => PG.drawCar && PG.drawCar(g, Object.assign({ x: 0, y: 0, th: 0 }, o)));
  }
  function cruiser(g, w, h, t) {
    bg(g, w, h, '#3f7fd0');
    const across = w > h, ppm = across ? Math.min(w / 6, h / 2.6) : Math.min(w / 2.3, h / 5.4), on = Math.floor(t * 4) % 2;
    world(g, w * 0.5, h * 0.55, ppm, across ? Math.PI - 0.12 : -Math.PI / 2 + 0.18, () => {
      car(g, { len: 4.9, wid: 1.9, color: '#f4f4f4', lights: true }, ppm);
      g.fillStyle = '#1b2f6b'; g.fillRect(-0.9, -0.95, 1.8, 0.16); g.fillRect(-0.9, 0.79, 1.8, 0.16);
      g.fillStyle = on ? '#ff3030' : '#4a1010'; g.fillRect(-0.15, -0.7, 0.3, 0.68); g.fillStyle = on ? '#14183a' : '#3a78ff'; g.fillRect(-0.15, 0.02, 0.3, 0.68);
    });
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.6);
    gl.addColorStop(0, on ? 'rgba(255,60,60,0.35)' : 'rgba(60,110,255,0.35)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  }
  function bus(g, w, h) {
    bg(g, w, h, '#d8402f');
    const L = w * 0.86, H = Math.min(h * 0.36, L * 0.22), x = w * 0.07, y = h * 0.66 - H / 2;
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.08); g.translate(-w / 2, -h / 2);
    inked(g, 6, () => { g.fillStyle = '#e9e4d8'; g.beginPath(); g.roundRect(x, y, L, H, H * 0.18); g.fill(); });
    g.beginPath(); g.roundRect(x, y, L, H, H * 0.18); outline(g, Math.max(3, H * 0.05));
    g.fillStyle = '#c0392b'; g.fillRect(x, y + H * 0.72, L, H * 0.14);
    g.fillStyle = '#26323e'; for (let i = 0; i < 7; i++) g.fillRect(x + L * 0.04 + i * L * 0.13, y + H * 0.12, L * 0.1, H * 0.42);
    g.fillStyle = '#9bd3ff'; g.fillRect(x + L * 0.95, y + H * 0.12, L * 0.03, H * 0.56);
    g.fillStyle = INK; for (const fx of [0.18, 0.78]) { g.beginPath(); g.arc(x + L * fx, y + H, H * 0.17, 0, TAU); g.fill(); }
    g.restore();
    label(g, 'TAKE THE BUS!', w * 0.46, h * 0.86, Math.min(w * 0.075, h * 0.09), '#f4c20d', -0.04);
  }
  function heli(g, w, h, t) {
    bg(g, w, h, '#4fa59b');
    const s = Math.min(w, h) / 9;
    g.save(); g.translate(w * 0.52, h * 0.5); g.rotate(0.55); g.scale(s, s);
    inked(g, 5, () => {
      g.fillStyle = '#1f3a7a'; g.beginPath(); g.ellipse(0, 0, 2.2, 1.25, 0, 0, TAU); g.fill();
      g.fillRect(-5.6, -0.22, 4, 0.44); g.fillRect(-5.9, -0.9, 0.5, 1.8);
    });
    g.fillStyle = '#9fd0ff'; g.beginPath(); g.ellipse(1.1, 0, 0.95, 0.85, 0, -1.2, 1.2); g.fill();
    g.fillStyle = '#fff'; g.fillRect(-1.3, -0.12, 1.6, 0.24);
    g.rotate(t * 9); g.fillStyle = 'rgba(15,15,20,0.55)';
    for (let i = 0; i < 4; i++) { g.rotate(TAU / 4); g.fillRect(0, -0.16, 4.4, 0.32); }
    g.beginPath(); g.arc(0, 0, 4.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
    g.restore();
    const on = Math.floor(t * 3) % 2;
    g.globalCompositeOperation = 'lighter'; const sp = g.createRadialGradient(w * 0.25, h * 0.85, 0, w * 0.25, h * 0.85, Math.min(w, h) * 0.55);
    sp.addColorStop(0, on ? 'rgba(255,255,230,0.45)' : 'rgba(255,255,230,0.3)'); sp.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sp; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  }
  function tank(g, w, h) {
    bg(g, w, h, '#6f7d3a');
    const s = Math.min(w / 5.2, h / 8.2);
    g.save(); g.translate(w * 0.5, h * 0.56); g.rotate(-0.35); g.scale(s, s);
    inked(g, 5, () => {
      g.fillStyle = '#2b2f22'; g.fillRect(-1.7, -3.4, 0.7, 6.8); g.fillRect(1.0, -3.4, 0.7, 6.8);
      g.fillStyle = '#556229'; g.fillRect(-1.2, -3.1, 2.4, 6.2);
    });
    g.fillStyle = '#1e2117'; for (let y = -3.3; y < 3.4; y += 0.45) { g.fillRect(-1.7, y, 0.7, 0.14); g.fillRect(1.0, y, 0.7, 0.14); }
    g.fillStyle = '#3d4a1f'; g.fillRect(-0.12, -6.4, 0.24, 4.6);
    inked(g, 4, () => { g.fillStyle = '#4a5a24'; g.beginPath(); g.arc(0, 0.2, 1.15, 0, TAU); g.fill(); });
    g.fillStyle = '#e9e4d8'; star(g, 0, 0.2, 0.55);
    g.restore();
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); g.fill();
  }
  function taxi(g, w, h) {
    bg(g, w, h, '#e8579e'); rays(g, w * 0.5, h * 0.5, Math.hypot(w, h), 'rgba(255,255,255,0.12)', 14);
    const ppm = Math.min(w / 2.5, h / 5.6);
    world(g, w * 0.5, h * 0.52, ppm, Math.PI / 2 - 0.3, () => {
      car(g, { len: 4.37, wid: 1.79, color: '#f2c230', lights: true }, ppm);
      g.fillStyle = '#1b1f27'; g.fillRect(-0.25, -0.42, 0.5, 0.84); g.fillStyle = '#ffe680'; g.fillRect(-0.2, -0.36, 0.4, 0.72);
    });
  }
  function city(g, w, h, t) {
    g.fillStyle = '#141a3a'; g.fillRect(0, 0, w, h);
    const R = mulberry(7), cell = Math.max(26, Math.min(w, h) / 5);
    for (let y = -cell; y < h + cell; y += cell) for (let x = -cell; x < w + cell; x += cell) {
      const bw = cell * (0.55 + R() * 0.3), bh = cell * (0.55 + R() * 0.3);
      g.fillStyle = shade('#2c3d8a', -0.2 + R() * 0.3); g.fillRect(x + 6, y + 6, bw, bh);
      g.fillStyle = R() < 0.5 ? '#ff4fa0' : '#3fd0ff'; g.globalAlpha = 0.85; g.fillRect(x + 6, y + 6 + bh - 3, bw, 3); g.globalAlpha = 1;
      for (let k = 0; k < 4; k++) if (R() < 0.6) { g.fillStyle = 'rgba(255,226,150,' + (0.4 + 0.5 * Math.abs(Math.sin(t * 0.7 + x + y + k))).toFixed(2) + ')'; g.fillRect(x + 10 + R() * (bw - 10), y + 10 + R() * (bh - 10), 4, 3); }
    }
    halftone(g, w, h, 'rgba(0,0,0,0.25)', 0.9);
    
  }
  function vault(g, w, h, t) {
    bg(g, w, h, '#c9c2ad');
    const r = Math.min(w * 0.38, h * 0.62), cx = w * 0.62, cy = h * 0.62;
    inked(g, 6, () => { g.fillStyle = '#7d848c'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); });
    g.fillStyle = '#a7adb4'; g.beginPath(); g.arc(cx, cy, r * 0.86, 0, TAU); g.fill();
    g.fillStyle = '#8b9199'; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, TAU); g.fill();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = '#d9dce0'; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74, r * 0.05, 0, TAU); g.fill(); }
    const sp = t * 0.6;
    g.strokeStyle = '#3a3f46'; g.lineWidth = r * 0.09; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = sp + i * TAU / 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); g.stroke(); }
    g.fillStyle = '#d4af37'; g.beginPath(); g.arc(cx, cy, r * 0.14, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); outline(g, Math.max(3, r * 0.04));
  }
  function cop(g, w, h, t) {
    bg(g, w, h, '#e3742c');
    const X = PG.gta, s = Math.min(w, h) / 1.5;
    if (X && X.drawPed) {
      const p = { x: 0, y: 0, th: -Math.PI / 2 - 0.4, r: 0.32, look: { skin: '#e0b48c', hair: '#3a2a1e', shirt: '#22376b', pants: '#1a2440', hat: '#141c33', hatType: 'police', outfit: 'cop', scale: 1 }, weapon: 'pistol', aim: -Math.PI / 2 - 0.4, speed: 2.5, walk: t * 6, step: t * 6, anim: t * 6, hp: 100, maxHp: 100 };
      g.save(); g.translate(w * 0.5, h * 0.6); g.scale(s, s);
      try { inked(g, 4, () => X.drawPed(g, p, t)); } catch (e) { /* a ped renderer that wants more state: the panel stays plain */ }
      g.restore();
    }
    label(g, 'STOPP!', w * 0.5, h * 0.17, Math.min(w * 0.17, h * 0.09), '#fff', -0.08);
  }
  function loot(g, w, h) {
    bg(g, w, h, '#3d9a4f');
    const s = Math.min(w, h) / 6;
    for (const [x, y, k, rot] of [[0.3, 0.62, 1, -0.2], [0.68, 0.58, 1.15, 0.15], [0.5, 0.38, 0.95, 0]]) {
      g.save(); g.translate(w * x, h * y); g.rotate(rot); g.scale(s * k, s * k);
      inked(g, 4, () => { g.fillStyle = '#d8c79a'; g.beginPath(); g.moveTo(-0.9, 0.9); g.quadraticCurveTo(-1.1, -0.4, -0.35, -0.75); g.lineTo(0.35, -0.75); g.quadraticCurveTo(1.1, -0.4, 0.9, 0.9); g.closePath(); g.fill(); });
      g.fillStyle = '#8a6b3a'; g.fillRect(-0.4, -0.95, 0.8, 0.22);
      g.font = "400 1px Bevan, Georgia, serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2f7d3a'; g.fillText('$', 0, 0.2);
      g.restore();
    }
  }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- layout, paint and compose ----------
  let W = 0, H = 0, dpr = 1, G = 10;
  function layout() {
    const r = cover.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    main.width = Math.round(W * dpr); main.height = Math.round(H * dpr);
    G = Math.max(10, Math.round(Math.min(W, H) * 0.024));   // the black frame between panels
    const L = W >= H * 0.9 ? WIDE : TALL;
    for (const e of els) {
      const pts = L[e.p.id];
      e.poly = pts ? pts.map(q => [q[0] * W, q[1] * H]) : null;
      if (!e.poly) continue;
      const xs = e.poly.map(q => q[0]), ys = e.poly.map(q => q[1]);
      e.bx = Math.min(...xs); e.by = Math.min(...ys); e.w = Math.max(...xs) - e.bx; e.h = Math.max(...ys) - e.by;
      e.cv.width = Math.max(1, Math.round(e.w * dpr)); e.cv.height = Math.max(1, Math.round(e.h * dpr));
      e.painted = false;
    }
  }
  function paint(e, t) {
    const g = e.cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); DPR = dpr;
    try { e.p.draw(g, e.w, e.h, t); } catch (err) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = e.p.c; g.fillRect(0, 0, e.w, e.h); }
    e.painted = true;
  }
  const path = (g, poly) => { g.beginPath(); poly.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };
  function compose() {
    const g = main.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = INK; g.fillRect(0, 0, W, H);
    for (const e of els) {
      if (!e.poly) continue;
      g.save(); path(g, e.poly); g.clip(); g.drawImage(e.cv, e.bx, e.by, e.w, e.h); g.restore();
    }
    // the frames: every panel edge stroked thick (half lands on each neighbour), then the outer border
    g.lineJoin = 'miter'; g.strokeStyle = INK; g.lineWidth = G;
    for (const e of els) if (e.poly) { path(g, e.poly); g.stroke(); }
    g.lineWidth = G * 2.2; g.strokeRect(0, 0, W, H);
  }
  const scr = document.getElementById('scr-title');
  const up = () => scr && !scr.hidden;
  let last = 0, laid = false;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!up()) { laid = false; return; }
    if (!laid) { layout(); laid = true; last = 0; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (last && (reduce || ts - last < 125)) return;   // ~8 fps is plenty for blinking lights and a rotor
    last = ts;
    const t = ts / 1000;
    for (const e of els) if (e.poly && (e.p.live || !e.painted)) paint(e, t);
    compose();
  }
  window.addEventListener('resize', () => { laid = false; });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { laid = false; });
  requestAnimationFrame(frame);

  // ---------- the controls list, behind a button ----------
  const btn = document.getElementById('btn-controls'), box = document.getElementById('title-controls');
  if (btn && box) {
    const close = document.createElement('button'); close.className = 'btn small'; close.id = 'title-controls-close'; close.textContent = 'Close';
    box.insertBefore(close, box.firstChild);
    const set = open => { box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) close.focus({ preventScroll: true }); else btn.focus({ preventScroll: true }); };
    btn.addEventListener('click', () => { if (PG.audio && PG.audio.click) PG.audio.click(); set(box.hidden); });
    close.addEventListener('click', () => set(false));
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && !box.hidden && up()) { e.preventDefault(); e.stopImmediatePropagation(); set(false); } }, { capture: true });
  }
  PG.titleCover = { panels: PANELS.map(p => p.id), repaint: () => { laid = false; } };
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
