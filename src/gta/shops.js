// Garages for Grand Theft Bus. Pay 'n' Spray: drive onto the pad and stop, the booth rolls shut, pick a colour
// (or let Svein choose), and the car rolls out repaired in a fresh coat while the cops lose the description,
// unless they watched you go in at 4+ stars. Svein also fits remote car bombs (G detonates from anywhere in
// radio range; G inside the car lights a 5 s fuse). Crusher & Export: leave a car on Knut's pad; models on
// today's export list (new list every game day) are craned away in a container for real money, everything
// else is squashed into a cube for scrap (a car with a bomb in it is a very short crushing). Artur's Garage
// at the hideout keeps one car, saved between games. Owns the X.places.spray / crusher pads; adds X.shops.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;

  // ================= tuning =================
  const SPRAY_PRICE = 250, BOMB_PRICE = 1000, PICK_T = 4, SPRAY_T = 2.5, DOOR_T = 0.9, FUSE_T = 5, BOMB_RANGE = 260;
  const PAINTS = [
    { name: 'Getaway Red', c: '#d0141e' }, { name: 'Not-a-Taxi Yellow', c: '#f2c230' }, { name: 'Fjord Blue', c: '#1f5fbf' },
    { name: 'Troll Green', c: '#2f8f4e' }, { name: 'Snow Plough White', c: '#f2f2f2' }, { name: 'Midnight Black', c: '#16181c' },
    { name: 'Neon Mile Pink', c: '#e0458f' }, { name: 'Take-the-Bus Orange', c: '#f07a12' },
  ];
  const WILD = [
    { name: 'Brunost Brown', c: '#9a6a3a' }, { name: 'Aurora Teal', c: '#1fa3a3' }, { name: 'Royal Purple', c: '#6b3fa0' },
    { name: 'Gold Rush', c: '#c9a227' }, { name: 'Undercover Grey', c: '#7d8590' }, { name: 'Lime Regret', c: '#9bd12e' },
    { name: 'Salmon Fillet', c: '#f08a72' }, { name: 'Baby Blue', c: '#8fc3ec' },
  ];
  const RANDOM = PAINTS.length, ALLP = PAINTS.concat(WILD);
  const NOT_FOR_EXPORT = { police: 1, swat: 1, tank: 1, bus: 1 };
  const BOX_COLORS = ['#b8452d', '#2f5f8a', '#3e7d4f', '#c99a2e', '#7a3b8a', '#d06a1e'];
  // local rects [u0, u1, v0, v1]: u along the shop front, v out of the building towards the street
  const SPRAY_IN = [-3.6, 3.6, 0.9, 6.2], SPRAY_FIT = [-3.85, 3.85, -0.35, 6.25], ROOF_H = 3.95, ROOF_D = 6.35;
  const CRUSH_IN = [-3.7, 3.7, 0.8, 6.3], GARAGE_IN = [-3.3, 3.3, 0.9, 5.9], GARAGE_OUT = [-4.6, 4.6, -0.2, 7.4];
  const LINES = {
    cop: ["Svein: Paint a police car? I'd lose my licence. And my kneecaps.", "Svein: That's a cop car. Even I have limits. Small ones."],
    bus: ["Svein: A bus? We don't have that much paint. Take the bus... somewhere else.", "Svein: The booth is seven metres. Your bus is eleven. Do the maths."],
    big: ['Svein: That will not fit. Try the car wash. Or the harbour.'],
    tank: ['Svein: Is that... a tank? No. Just no.'],
    wreck: ["Svein: That's not a car, that's a barbecue.", 'Svein: We paint cars. Not ashtrays.'],
    broke: ['Svein: No money, no paint. Come back with ${price}.', 'Svein: Paint costs money, friend. Come back with ${price}.'],
    done: ['Svein: Fresh paint. Nobody will ever know.', 'Svein: New colour, new you. Same driving, sadly.', 'Svein: Wet paint! Try not to hit anything for five minutes.', 'Svein: Cops? What cops? Never seen this car before.'],
    same: ['Svein: Same colour as before? Bold. The cops will never... oh. Well, it is clean now.'],
    free: ["Svein: First one's on the house. Artur says hi.", "Svein: Free respray for Artur's new driver. Next one is $250."],
    bomb: ['Svein: Bomb fitted. Press G to say goodbye. Not while sitting in it.', 'Svein: One car bomb, as ordered. G for goodbye.'],
    seen: ['They saw you go in! The paint only bought you so much.', 'The cops watched you drive in. Half the description is still good.'],
    crush: ['Knut: Nobody will ever find it.', 'Knut: Was there someone in the boot? ... Never mind.', 'Knut: Crunch. Lovely.', 'Knut: Another one for the pile.'],
    export: ['Knut: A buyer in Bergen will love it.', "Knut: Shipped. Don't ask where.", 'Knut: Loaded and gone. Nice wheels.'],
    tick: ['Knut: Is it... ticking?', 'Knut: Why is it beeping?'],
    copcar: ['Knut: A police cruiser. The evidence was getting heavy anyway.'],
    garage: ["Artur: Stored in my garage. It'll be here next time.", "Artur: Parked. I'll keep an eye on it. Mostly."],
    full: ['Artur: One car per garage. I am not running a car park. Not any more.'],
    toobig: ['Artur: That does not fit in my garage. Nothing that size fits anywhere.'],
  };
  const REFUSE_SHORT = { cop: 'No cop cars. Not even for you', bus: "Buses don't fit in the booth", tank: 'No tanks', big: 'Too big for the booth', wreck: "That's a wreck, not a car" };

  // ================= state =================
  const S = { spray: null, crusher: null, garage: null, bomb: null, list: null, day: 0, lastClock: 0, save: {}, stats: null, ui: null };
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const ease = k => { k = cl(k, 0, 1); return k * k * (3 - 2 * k); };
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const say = (pool, tok) => PG.say(pool, tok || {});
  const toast = (text, kind) => { if (PG.ui && PG.ui.toast) PG.ui.toast(text, kind || 'warn'); };
  const price = () => S.save.freeUsed ? SPRAY_PRICE : 0;
  const cond = c => c.wrecked ? 0 : cl(c.hp / c.maxHp, 0, 1);
  const exportPrice = c => Math.round(c.model.value * (0.25 + 0.75 * cond(c)) * 0.6 / 10) * 10 + 250;
  const scrapPrice = c => c.wrecked ? 25 : Math.round(c.model.value * 0.07 * (0.3 + 0.7 * cond(c)) / 5) * 5 + 30;
  const listed = c => !!S.list && !!c && !c.wrecked && S.list.models.includes(c.model.id) && !S.list.done.includes(c.model.id);
  const SHADES = new Map();
  function shade(hex, k) {
    const key = hex + k; let s = SHADES.get(key); if (s) return s;
    const n = parseInt(String(hex).slice(1), 16) || 0, f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    s = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; if (SHADES.size > 300) SHADES.clear(); SHADES.set(key, s); return s;
  }
  const rgbOf = hex => { const n = parseInt(String(hex).slice(1), 16) || 0; return (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };

  // ================= shop geometry: a frame at the shop front =================
  // F = the facade point at the door, n = out to the street, T = along the facade (a proper rotation of n).
  function frameOf(d) { const n = { x: d.nx, y: d.ny }; return { F: { x: d.x - n.x * 0.9, y: d.y - n.y * 0.9 }, n, T: { x: n.y, y: -n.x } }; }
  const W = { x: 0, y: 0 }, LQ = { u: 0, v: 0 };
  function toW(fr, u, v, o) { o = o || W; o.x = fr.F.x + fr.T.x * u + fr.n.x * v; o.y = fr.F.y + fr.T.y * u + fr.n.y * v; return o; }
  function toL(fr, x, y) { const dx = x - fr.F.x, dy = y - fr.F.y; LQ.u = dx * fr.T.x + dy * fr.T.y; LQ.v = dx * fr.n.x + dy * fr.n.y; return LQ; }
  const inRect = (fr, x, y, r) => { const q = toL(fr, x, y); return q.u > r[0] && q.u < r[1] && q.v > r[2] && q.v < r[3]; };
  function polyInRect(fr, c, r) { for (const p of X.carPoly(c)) { const q = toL(fr, p.x, p.y); if (q.u < r[0] || q.u > r[1] || q.v < r[2] || q.v > r[3]) return false; } return true; }
  const local = (ctx, fr) => ctx.transform(fr.T.x, fr.T.y, fr.n.x, fr.n.y, fr.F.x, fr.F.y);
  function extents(fr, b) {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9;
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) { const q = toL(fr, x, y); u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); }
    return { u0, u1, v0 };
  }
  // A world-aligned roof board (text stays upright) of up to w x h, set back `inset` metres from the facade.
  function board(fr, b, u, inset, w, h) {
    w = Math.min(w, b.x1 - b.x0 - 1.4); h = Math.min(h, b.y1 - b.y0 - 1.4);
    const along = Math.abs(fr.n.x) * w / 2 + Math.abs(fr.n.y) * h / 2;
    const c = toW(fr, u, -(along + inset), {});
    return { x: cl(c.x, b.x0 + w / 2 + 0.7, b.x1 - w / 2 - 0.7), y: cl(c.y, b.y0 + h / 2 + 0.7, b.y1 - h / 2 - 0.7), w, h };
  }
  const inB = (b, p, m) => p.x > b.x0 + m && p.x < b.x1 - m && p.y > b.y0 + m && p.y < b.y1 - m;
  function clampIn(b, p, m) { p.x = cl(p.x, b.x0 + m, b.x1 - m); p.y = cl(p.y, b.y0 + m, b.y1 - m); return p; }

  function setupSpray() {
    const pl = X.places.spray; if (!pl || !pl.door || !pl.pad) return null;
    const fr = frameOf(pl.door), b = pl.b, ex = extents(fr, b);
    const sp = { pl, fr, b, ex, phase: 'idle', t: 0, car: null, hold: 0, refused: null, done: null, sel: 0, touched: false, pickT: 0, bomb: false, paint: null,
      charged: 0, seen: false, before: 0, roof: 0, pose: null, hissT: 0, mistAcc: 0, stains: [], shineCar: null, shineT: 0, fan: 0, waitT: -9, pad: pl.pad };
    sp.sign = board(fr, b, 0, 0.9, 12.5, 3.4);
    sp.fanAt = clampIn(b, toW(fr, ex.u0 + 2.2, ex.v0 + 2.2, {}), 1.6);
    sp.ventAt = clampIn(b, toW(fr, ex.u1 - 2.0, ex.v0 + 2.6, {}), 1.4);
    for (let i = 0; i < 7; i++) sp.stains.push({ u: rand(-3.2, 3.2), v: rand(1.4, 5.8), r: rand(0.3, 0.9), c: pick(ALLP).c });
    return sp;
  }
  function setupCrusher() {
    const pl = X.places.crusher; if (!pl || !pl.door || !pl.pad) return null;
    const fr = frameOf(pl.door), b = pl.b, ex = extents(fr, b);
    const cr = { pl, fr, b, ex, phase: 'idle', t: 0, car: null, pending: null, pendT: 0, pose: null, pay: 0, export: false, boom: false, name: '', color: '#888', len: 4, wid: 1.8,
      box: BOX_COLORS[0], pile: [], seed: 0, pad: pl.pad, sparkAcc: 0 };
    // the facade runs along world x: stack the boards into the roof; along y: side by side down the facade
    const flat = Math.abs(fr.n.y) > 0.5, depth = -ex.v0, faceLen = ex.u1 - ex.u0;
    if (flat) {
      cr.sign = board(fr, b, 0, 1.7, Math.max(7.5, Math.min(12.5, faceLen - 8)), 2.6);
      cr.list = board(fr, b, 0, 1.7 + 2.6 + 0.5, Math.max(7.5, Math.min(11, faceLen - 8)), 4.6);
    } else {
      cr.sign = board(fr, b, -2.1, 1.7, Math.min(12.5, depth - 3), 2.6);
      cr.list = board(fr, b, 2.0, 1.7, Math.min(11, depth - 3), 4.6);
    }
    cr.base = clampIn(b, toW(fr, ex.u1 - 1.6, -2.2, {}), 1.3);
    cr.pileAt = clampIn(b, toW(fr, ex.u0 + 2.3, -3.3, {}), 2);
    cr.padC = toW(fr, 0, 3.6, {});
    cr.rest = { x: cr.base.x + (cr.padC.x - cr.base.x) * 0.4, y: cr.base.y + (cr.padC.y - cr.base.y) * 0.4 };
    cr.hook = { x: cr.rest.x, y: cr.rest.y };
    cr.slots = []; for (let i = 0; i < 18; i++) cr.slots.push(slotPos(cr, i));
    for (let i = 0; i < 4; i++) cr.pile.push({ c: pick(ALLP).c, seed: Math.random() * 100 });   // yesterday's work
    return cr;
  }
  // Artur's Garage: a parking bay on the hideout's facade, beside (never in front of) the roller door.
  function setupGarage() {
    const h = X.places.hideout; if (!h || !h.door) return null;
    const f0 = frameOf(h.door), C = X.city, pads = [S.spray, S.crusher].filter(Boolean);
    const ks = [-8.5, 8.5, -10.5, 10.5, -12.5, 12.5, -7.2, 7.2, -15, 15];
    for (let pass = 0; pass < 2; pass++) for (const k of ks) {
      const fr = { F: { x: f0.F.x + f0.T.x * k, y: f0.F.y + f0.T.y * k }, n: f0.n, T: f0.T };
      if (pass === 0 && !inB(h.b, toW(fr, 0, -0.6, {}), 0)) continue;   // against Artur's own wall first
      let ok = true;
      for (let u = -3; u <= 3.01 && ok; u += 1.5) for (let v = 1.4; v <= 5.21 && ok; v += 1.27) { const q = toW(fr, u, v); if (X.blocked(q.x, q.y, 0.35)) ok = false; }
      if (!ok) continue;
      const c = toW(fr, 0, 3.3, {});
      if (X.roadAt(c.x, c.y) || !X.blockAt(c.x, c.y)) continue;
      if (X.cars.some(o => !o.removed && Math.abs(o.x - c.x) < 7.5 && Math.abs(o.y - c.y) < 7.5)) continue;
      if (C.lamps.some(l => inRect(fr, l.x, l.y, [-3.8, 3.8, 0.6, 6]))) continue;
      if (Object.keys(X.places).some(id => { const d = X.places[id].door; return d && Math.hypot(d.x - c.x, d.y - c.y) < 6; })) continue;
      if (pads.some(s => Math.hypot(s.pad.x - c.x, s.pad.y - c.y) < 12)) continue;
      return { fr, c, car: null, pending: null, pendT: 0, savedColor: null, post: toW(fr, -3.55, 0.55, {}) };
    }
    return null;
  }
  function makeList(day) {
    const ids = Object.keys(X.MODELS).filter(id => { const m = X.MODELS[id]; return m.weight > 0 && m.value > 0 && !NOT_FOR_EXPORT[m.kind]; });
    let s = ((Math.floor(Date.now() / 864e5) * 7919 + day * 104729) % 2147483646) + 1;
    const R = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 3; i++) R();
    const models = [];
    while (models.length < 3 && ids.length) models.push(ids.splice(Math.floor(R() * ids.length), 1)[0]);
    return { day, models, done: [] };
  }
  const mintPrice = id => Math.round(X.MODELS[id].value * 0.6 / 10) * 10 + 250;

  // ================= sound =================
  function sfx(kind, x, y) {
    const k = PG.audio.kit(); if (!k) return;
    let v = 1;
    if (x != null) { const f = X.focus(); v = cl(1.15 - Math.hypot(x - f.x, y - f.y) / 80, 0, 1); if (v < 0.03) return; }
    const t = k.now;
    if (kind === 'door') {
      k.noise(t, DOOR_T, 0.16 * v, 'lowpass', 420, { to: 180, attack: 0.05 });
      for (let i = 0; i < 7; i++) k.tone('square', 85 + i * 6, t + i * 0.12, 0.04, 0.035 * v, { lp: 700 });
      k.tone('sine', 82, t + DOOR_T, 0.28, 0.32 * v, { to: 40 }); k.noise(t + DOOR_T, 0.12, 0.22 * v, 'lowpass', 1000);
    } else if (kind === 'hiss') {
      k.noise(t, 0.5, 0.15 * v, 'bandpass', rand(5600, 6800), { Q: 0.8, attack: 0.04 });
      k.noise(t, 0.42, 0.05 * v, 'highpass', 9000, { attack: 0.03 });
      k.tone('sawtooth', 52, t, 0.28, 0.045 * v, { lp: 260 });
    } else if (kind === 'buzz') {
      k.tone('square', 140, t, 0.2, 0.06 * v, { lp: 900 }); k.tone('square', 104, t + 0.24, 0.32, 0.06 * v, { lp: 900 });
    } else if (kind === 'click') {
      k.tone('square', 1400, t, 0.03, 0.04, { lp: 4000 });
    } else if (kind === 'done') {
      [1318.5, 1760, 2637].forEach((f, i) => k.tone('triangle', f, t + i * 0.07, 0.18, 0.08 * v));
      k.noise(t, 0.3, 0.08 * v, 'highpass', 6000, { to: 9000 });
    } else if (kind === 'cash') {
      k.tone('square', 2093, t, 0.06, 0.05 * v, { lp: 5000 }); k.tone('triangle', 2637, t + 0.06, 0.25, 0.09 * v);
      k.noise(t + 0.02, 0.18, 0.12 * v, 'highpass', 5000);
    } else if (kind === 'hydraulic') {
      k.noise(t, 0.7, 0.18 * v, 'bandpass', 800, { to: 260, Q: 2, attack: 0.05 }); k.tone('sawtooth', 58, t, 0.7, 0.06 * v, { lp: 320 });
    } else if (kind === 'crunch') {
      for (let i = 0; i < 5; i++) {
        const tt = t + i * 0.3 + Math.random() * 0.1;
        k.noise(tt, 0.26, 0.32 * v, 'lowpass', 2600, { to: 280 }); k.tone('sine', 72, tt, 0.3, 0.3 * v, { to: 34 });
        k.tone('square', rand(320, 900), tt, 0.22, 0.035 * v, { to: rand(150, 260), lp: 3000 });
      }
    } else if (kind === 'clank') {
      k.tone('triangle', 165, t, 0.45, 0.2 * v, { to: 120 }); k.tone('triangle', 247, t, 0.3, 0.1 * v); k.noise(t, 0.16, 0.22 * v, 'bandpass', 1500, { Q: 3 });
    } else if (kind === 'beep') {
      k.tone('square', 1900, t, 0.07, 0.06 * v, { lp: 5000 });
    } else if (kind === 'remote') {
      [1200, 1600, 2100].forEach((f, i) => k.tone('square', f, t + i * 0.13, 0.09, 0.055, { lp: 5000 }));
    }
  }

  // ================= paint mist: a small fixed pool =================
  const MN = 240, MX = new Float32Array(MN), MY = new Float32Array(MN), MVX = new Float32Array(MN), MVY = new Float32Array(MN);
  const ML = new Float32Array(MN), MM = new Float32Array(MN), MS = new Float32Array(MN), MW = new Uint8Array(MN);
  let mCur = 0, mLive = 0, mistRgb = '255,255,255';
  const SPRITES = new Map();
  function puff(rgb) {
    let cv = SPRITES.get(rgb); if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, `rgba(${rgb},0.95)`); gr.addColorStop(0.45, `rgba(${rgb},0.5)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 48, 48);
    if (SPRITES.size > 24) SPRITES.clear();
    SPRITES.set(rgb, cv); return cv;
  }
  function mist(x, y, vx, vy, life, size, white) {
    const i = mCur; mCur = (mCur + 1) % MN;
    MX[i] = x; MY[i] = y; MVX[i] = vx; MVY[i] = vy; ML[i] = life; MM[i] = life; MS[i] = size; MW[i] = white ? 1 : 0;
  }
  function mistTick(dt) {
    mLive = 0; const k = Math.exp(-1.8 * dt);
    for (let i = 0; i < MN; i++) {
      if (ML[i] <= 0) continue;
      ML[i] -= dt; MX[i] += MVX[i] * dt; MY[i] += MVY[i] * dt; MVX[i] *= k; MVY[i] *= k; mLive++;
    }
  }
  function mistReset() { ML.fill(0); mLive = 0; }

  // ================= Pay 'n' Spray =================
  function refusal(c) {
    const k = c.model.kind;
    if (c.wrecked) return 'wreck';
    if (k === 'police' || k === 'swat') return 'cop';
    if (k === 'tank') return 'tank';
    if (k === 'bus') return 'bus';
    if (c.len > 7.4) return 'big';
    if (P.money < price()) return 'broke';
    return null;
  }
  const refuseText = why => why === 'broke' ? `Come back with $${price()}` : REFUSE_SHORT[why];
  function lock(c, pose) {
    if (c.dv) X.placeCar(c, pose.x, pose.y, pose.th);
    else { c.x = pose.x; c.y = pose.y; c.th = pose.th; c.v = 0; }
  }
  // Are cops looking at (x, y)? police.js knows best; otherwise any officer or cruiser with a clear line.
  function copsWatching(x, y) {
    if (X.police && X.police.seen) return true;
    for (const p of X.peds) {
      if (p.dead || p.removed || p.hidden || p.car || p.team !== 'cop') continue;
      const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy > 36 * 36) continue;
      if (!X.raycast(p.x, p.y, x, y)) return true;
    }
    for (const c of X.cars) {
      if (c.removed || c.wrecked || c === P.car || !(c.model.kind === 'police' || c.model.kind === 'swat') || !(c.npcDriver || (c.driver && !c.driver.isPlayer))) continue;
      const dx = c.x - x, dy = c.y - y; if (dx * dx + dy * dy > 46 * 46) continue;
      if (!X.raycast(c.x, c.y, x, y)) return true;
    }
    return false;
  }
  function setWanted(n) {
    if (X.police && X.police.setWanted) { if (n > 0) X.police.setWanted(n); else X.police.clear(); }
    else { P.wanted = n; P.wantedFlash = false; }
  }
  function randomPaint(cur) {
    const all = ALLP.filter(p => p.c !== cur);
    return pick(all);
  }
  function sprayIdle(sp, dt) {
    // one respray (or one refusal) per visit: forget the car once it has left the pad
    if (sp.done && (sp.done.removed || !inRect(sp.fr, sp.done.x, sp.done.y, SPRAY_IN))) sp.done = null;
    if (sp.refused && (sp.refused.removed || !inRect(sp.fr, sp.refused.x, sp.refused.y, SPRAY_IN))) sp.refused = null;
    const c = P.car;
    const on = !!c && P.state === 'play' && !X.scene && inRect(sp.fr, c.x, c.y, SPRAY_IN);
    if (!on) { sp.hold = 0; return; }
    if (sp.done === c) return;
    if (Math.abs(c.speed) > 0.6) { sp.hold = 0; return; }
    if ((sp.hold += dt) < 0.35) return;
    const why = refusal(c);
    if (why) {
      if (sp.refused !== c) { sp.refused = c; toast(say(LINES[why], { price: price() }), 'scrape'); sfx('buzz'); }
      return;
    }
    sp.refused = null;
    if (!polyInRect(sp.fr, c, SPRAY_FIT)) return;
    // in: the booth rolls shut around the car
    sp.phase = 'closing'; sp.car = c; sp.t = 0; sp.pose = { x: c.x, y: c.y, th: c.th }; sp.bomb = false; sp.paint = null; sp.charged = 0;
    if (c.dv) { c.dv.vx = c.dv.vy = c.dv.r = 0; }
    sfx('door', c.x, c.y);
  }
  function doorShut(sp) {
    const c = sp.car;
    sp.phase = 'pick'; sp.t = 0; sp.pickT = PICK_T; sp.touched = false;
    sp.before = P.wanted || 0; sp.seen = sp.before >= 4 && copsWatching(c.x, c.y);
    if (sp.before > 0) setWanted(0);
    if (c.burning > 0) c.burning = 0;        // damage.js: a dying car is saved the moment the door shuts
    if (c.hp < c.maxHp * 0.2) c.hp = c.maxHp * 0.2;
    const opts = []; PAINTS.forEach((p, i) => { if (p.c !== c.color) opts.push(i); });
    sp.sel = pick(opts);
    showPicker(sp);
  }
  function pickTick(sp, dt) {
    const I = X.input, N = PAINTS.length + 1;
    if (I.anyPressed('ArrowLeft', 'KeyA')) { sp.sel = (sp.sel + N - 1) % N; sp.touched = true; sp.pickT = PICK_T; sfx('click'); }
    if (I.anyPressed('ArrowRight', 'KeyD')) { sp.sel = (sp.sel + 1) % N; sp.touched = true; sp.pickT = PICK_T; sfx('click'); }
    if (I.pressed('KeyB')) toggleBomb(sp);
    if ((sp.pickT -= dt) <= 0) confirmPaint(sp, sp.touched ? sp.sel : RANDOM);
  }
  function toggleBomb(sp) {
    if (sp.phase !== 'pick') return;
    if (S.bomb.car === sp.car) { X.popup('Already fitted. One bomb per car. Safety first.'); return; }
    if (!sp.bomb && P.money < price() + BOMB_PRICE) { X.popup(`Car bomb: $${fmt(BOMB_PRICE)}. You are short.`); sfx('buzz'); return; }
    sp.bomb = !sp.bomb; sp.touched = true; sp.pickT = PICK_T; sfx('click');
  }
  function confirmPaint(sp, idx) {
    if (sp.phase !== 'pick') return;
    const c = sp.car, paint = idx >= RANDOM ? randomPaint(c.color) : PAINTS[idx];
    let cost = price() + (sp.bomb ? BOMB_PRICE : 0);
    if (P.money < cost) { sp.bomb = false; cost = price(); }
    if (cost > 0) X.money(-cost, sp.bomb ? 'spray+bomb' : 'spray', c.x, c.y);
    if (!S.save.freeUsed) { S.save.freeUsed = true; X.persist(); }
    sp.charged = cost; sp.paint = paint; sp.phase = 'spray'; sp.t = 0; sp.hissT = 0; sp.mistAcc = 0;
    mistRgb = rgbOf(paint.c);
    hidePicker();
  }
  function sprayDone(sp) {
    const c = sp.car, paint = sp.paint, same = c.color === paint.c;
    c.color = paint.c; c.hp = c.maxHp; c.burning = 0; c.dmg = null; c.hurtT = 0;
    if (sp.bomb) fitBomb(c);
    for (let i = 0; i < 2; i++) { sp.stains.push({ u: rand(-3.2, 3.2), v: rand(1.4, 5.8), r: rand(0.3, 0.9), c: paint.c }); if (sp.stains.length > 26) sp.stains.shift(); }
    X.emit('carRepaired', { car: c });
    X.emit('carSprayed', { car: c, color: paint.c, name: paint.name, price: sp.charged });
    if (sp.seen) {
      setWanted(2);
      X.big('THEY SAW YOU', '#5aa9ff', 1800, 'wanted level only dropped to 2');
      toast(say(LINES.seen), 'scrape');
      if (X.police && X.police.radio) X.police.radio(`Dispatch: suspect went into the Pay 'n' Spray. Look for ${/^[aeiou]/i.test(paint.name) ? 'an' : 'a'} ${paint.name.toLowerCase()} ${c.model.name}.`);
    } else {
      if (sp.before > 0 && X.police && X.police.radio && X.police.LINES && X.police.LINES.respray) X.police.radio(say(X.police.LINES.respray));
      toast(sp.bomb ? say(LINES.bomb) : same ? say(LINES.same) : sp.charged === 0 ? say(LINES.free) : say(LINES.done));
    }
    S.stats.sprays++;
    X.popup(paint.name);
    X.floatText(c.x, c.y - 1.6, 'RESPRAYED', '#3fe0c5');
    sfx('done', c.x, c.y);
    sp.phase = 'opening'; sp.t = 0; sp.done = c; sp.shineCar = c; sp.shineT = 2.4;
  }
  function sprayAbort(sp) {
    hidePicker();
    sp.done = sp.car; sp.car = null; sp.phase = 'opening'; sp.t = 0;
  }
  function sprayTick(sp, dt) {
    sp.fan += dt * (sp.phase === 'spray' ? 16 : 3);
    if (sp.shineT > 0) sp.shineT -= dt;
    const shut = sp.phase === 'closing' || sp.phase === 'pick' || sp.phase === 'spray';
    sp.roof = shut ? Math.min(1, sp.roof + dt / DOOR_T) : Math.max(0, sp.roof - dt / DOOR_T);
    if (sp.phase === 'idle') return sprayIdle(sp, dt);
    if (sp.phase === 'opening') { if (sp.roof <= 0) sp.phase = 'idle'; return; }
    const c = sp.car;
    if (!c || c.removed || c.wrecked || P.car !== c || P.state !== 'play') return sprayAbort(sp);
    lock(c, sp.pose);
    sp.t += dt;
    if (sp.phase === 'closing') { if (sp.roof >= 1) doorShut(sp); }
    else if (sp.phase === 'pick') pickTick(sp, dt);
    else if (sp.phase === 'spray') {
      if ((sp.hissT -= dt) <= 0) { sp.hissT = 0.55; sfx('hiss', c.x, c.y); }
      sp.mistAcc += dt * 70;
      const fr = sp.fr;
      while (sp.mistAcc >= 1) {
        sp.mistAcc -= 1;
        const r = Math.random(), white = Math.random() < 0.25;
        let u, v, du, dv;
        if (r < 0.55) { u = rand(-ROOF_H, ROOF_H); v = ROOF_D; du = rand(-0.6, 0.6); dv = rand(1, 2.6); }
        else { const s = r < 0.775 ? -1 : 1; u = s * ROOF_H; v = rand(0.6, ROOF_D - 0.4); du = s * rand(0.8, 2.2); dv = rand(-0.3, 0.6); }
        const q = toW(fr, u, v);
        mist(q.x, q.y, fr.T.x * du + fr.n.x * dv, fr.T.y * du + fr.n.y * dv, rand(0.9, 1.6), rand(0.35, 0.7), white);
      }
      if (Math.random() < dt * 9) { const q = sp.fanAt; mist(q.x + rand(-0.4, 0.4), q.y + rand(-0.4, 0.4), rand(-0.6, 0.6), rand(-0.6, 0.6), 1.4, 0.6, Math.random() < 0.5); }
      if (sp.t >= SPRAY_T) sprayDone(sp);
    }
  }

  // ================= Crusher & Export =================
  function startCrush(cr, c) {
    cr.pending = null; cr.car = c; cr.t = 0; cr.pose = { x: c.x, y: c.y, th: c.th };
    c.shopLock = true; c.keep = true;
    if (c.dv) { c.dv.vx = c.dv.vy = c.dv.r = 0; }
    cr.boom = c === S.bomb.car;
    cr.export = !cr.boom && listed(c);
    cr.pay = cr.export ? exportPrice(c) : scrapPrice(c);
    cr.name = c.model.name; cr.color = c.color; cr.len = c.len; cr.wid = c.wid; cr.seed = c.id * 7.3;
    cr.box = BOX_COLORS[c.id % BOX_COLORS.length]; cr.boxLen = Math.max(6.06, c.len + 0.5); cr.boxWid = Math.max(2.44, c.wid + 0.45);
    cr.phase = cr.export ? 'container' : 'grab';
    if (cr.boom) toast(say(LINES.tick), 'scrape');
    else if (c.model.kind === 'police') toast(say(LINES.copcar));
    sfx(cr.export ? 'clank' : 'hydraulic', c.x, c.y);
  }
  function crushReset(cr) {
    const c = cr.car;
    if (c) { c.shopLock = false; c.shopSquash = null; c.shopHide = false; if (!c.removed && c !== S.bomb.car && !(S.garage && S.garage.car === c)) c.keep = false; }
    cr.car = null; cr.phase = 'idle'; cr.t = 0;
  }
  function pay(cr, kind) {
    const c = cr.car;
    X.emit('carSold', { car: c, price: cr.pay, export: cr.export, model: c.model.id });
    X.money(cr.pay, kind, cr.pose.x, cr.pose.y);
    X.big('$' + fmt(cr.pay), '#7dff9a', 1700, (cr.export ? 'EXPORTED · ' : 'SCRAPPED · ') + cr.name);
    sfx('cash');
    X.removeCar(c);
    S.stats.earned += cr.pay;
  }
  function crushTick(cr, dt) {
    if (cr.phase === 'idle') {
      moveHook(cr, cr.rest.x, cr.rest.y, dt);
      const c = cr.pending; if (!c) return;
      if (c.removed || c.driver || c.npcDriver || c === P.car || !inRect(cr.fr, c.x, c.y, CRUSH_IN)) { cr.pending = null; return; }
      if ((cr.pendT -= dt) <= 0 && Math.abs(c.speed) < 1.5) startCrush(cr, c);
      return;
    }
    const c = cr.car;
    if (!c || c.removed) return crushReset(cr);
    lock(c, cr.pose);
    cr.t += dt;
    const ph = cr.phase;
    if (ph === 'grab' || ph === 'crush') {
      const k = 2.6 / Math.max(1, Math.hypot(cr.base.x - cr.pose.x, cr.base.y - cr.pose.y));
      moveHook(cr, cr.pose.x + (cr.base.x - cr.pose.x) * k, cr.pose.y + (cr.base.y - cr.pose.y) * k, dt);
    }
    if (ph === 'grab') {
      if (cr.t >= 0.6) { cr.phase = 'crush'; cr.t = 0; sfx('crunch', c.x, c.y); }
    } else if (ph === 'crush') {
      const k = ease(cr.t / 1.6);
      c.shopSquash = c.shopSquash || { sx: 1, sy: 1 };
      c.shopSquash.sx = 1 - 0.66 * k; c.shopSquash.sy = 1 - 0.14 * k;
      if ((cr.sparkAcc += dt * 14) >= 1) {
        cr.sparkAcc = 0;
        const s = Math.random() < 0.5 ? 1 : -1, hl = c.len * c.shopSquash.sx / 2, cs = Math.cos(c.th), sn = Math.sin(c.th);
        PG.burst(c.x + cs * hl * s, c.y + sn * hl * s, 'spark', 6, 7, 0.4, 0.1);
        if (Math.random() < 0.4) PG.burst(c.x, c.y, 'debris', 3, 3, 0.7, 0.22, [c.color, '#cfe3ee', '#2b2d33']);
      }
      G().shake = Math.max(G().shake, 0.05);
      if (cr.boom && cr.t > 0.7) { bombBoom(c); return crushReset(cr); }
      if (cr.t >= 1.6) { cr.phase = 'cube'; cr.t = 0; c.shopHide = true; X.decal(c.x, c.y, 'glass', 1.4); X.decal(c.x, c.y, 'oil', 0.9); }
    } else if (ph === 'cube') {
      moveHook(cr, cr.pose.x, cr.pose.y, dt * 3);
      if (cr.t >= 0.4) { cr.phase = 'lift'; cr.t = 0; sfx('clank', c.x, c.y); cr.slot = cr.slots[Math.min(17, cr.pile.length)]; }
    } else if (ph === 'lift') {
      const k = ease(cr.t / 1.1);
      cr.hook.x = cr.pose.x + (cr.slot.x - cr.pose.x) * k; cr.hook.y = cr.pose.y + (cr.slot.y - cr.pose.y) * k;
      if (cr.t >= 1.1) {
        if (cr.pile.length >= 18) cr.pile.shift(); cr.pile.push({ c: cr.color, seed: cr.seed });
        pay(cr, 'scrap'); S.stats.scrapped++;
        toast(say(LINES.crush));
        crushReset(cr);
      }
    } else if (ph === 'container') {
      moveHook(cr, cr.pose.x, cr.pose.y, dt);
      if (cr.t >= 0.9) { cr.phase = 'seal'; cr.t = 0; c.shopHide = true; sfx('clank', c.x, c.y); }
    } else if (ph === 'seal') {
      if (cr.t >= 0.35) { cr.phase = 'raise'; cr.t = 0; cr.far = { x: cr.base.x + (cr.base.x - cr.pose.x) * 0.35, y: cr.base.y + (cr.base.y - cr.pose.y) * 0.35 }; }
    } else if (ph === 'raise') {
      const k = ease(cr.t / 1.2);
      cr.hook.x = cr.pose.x + (cr.far.x - cr.pose.x) * k; cr.hook.y = cr.pose.y + (cr.far.y - cr.pose.y) * k;
      if (cr.t >= 1.2) {
        S.list.done.push(c.model.id);
        pay(cr, 'export'); S.stats.exported++;
        toast(say(LINES.export));
        crushReset(cr);
      }
    }
  }
  function moveHook(cr, x, y, dt) { const k = 1 - Math.exp(-dt * 3.5); cr.hook.x += (x - cr.hook.x) * k; cr.hook.y += (y - cr.hook.y) * k; }
  function slotPos(cr, i) {   // a 2 x 3 stack of cubes, three layers high
    const fr = cr.fr, a = i % 6, layer = Math.floor(i / 6) % 3;
    const q = toL(fr, cr.pileAt.x, cr.pileAt.y), u = q.u + ((a % 2) - 0.5) * 1.75 + layer * 0.25, v = q.v + (Math.floor(a / 2) - 1) * 1.75 - layer * 0.25;
    return clampIn(cr.b, toW(fr, u, v, {}), 0.9);
  }

  // ================= Artur's Garage =================
  function saveGarage(c) {
    S.save.garage = c ? { model: c.model.id, color: c.color, bomb: c === S.bomb.car } : null;
    if (S.garage) S.garage.savedColor = c ? c.color : null;
    X.persist();
  }
  function store(g, c) {
    if (c.len > 7.6) { toast(say(LINES.toobig)); return; }
    g.car = c; c.keep = true; saveGarage(c);
    S.stats.stored++;
    toast(say(LINES.garage));
    X.floatText(c.x, c.y - 1.6, 'CAR SAVED', '#b48cff');
    sfx('done', c.x, c.y);
  }
  function garageTick(g, dt) {
    const sc = g.car;
    if (sc && (sc.removed || sc.wrecked || !inRect(g.fr, sc.x, sc.y, GARAGE_OUT))) {
      g.car = null; if (!sc.removed && sc !== S.bomb.car) sc.keep = false;
      saveGarage(null);
    } else if (sc && sc.color !== g.savedColor) saveGarage(sc);
    const c = g.pending; if (!c) return;
    if (c.removed || c.wrecked || c.driver || c.npcDriver || !inRect(g.fr, c.x, c.y, GARAGE_IN)) { g.pending = null; return; }
    if ((g.pendT -= dt) > 0 || Math.abs(c.speed) > 1) return;
    g.pending = null;
    if (!g.car) store(g, c); else if (g.car !== c) toast(say(LINES.full));
  }
  function spawnStored(g) {
    const s = S.save.garage; if (!s || !X.MODELS[s.model]) return;
    const th = Math.atan2(g.fr.T.y, g.fr.T.x), c = X.makeCar(s.model, g.c.x, g.c.y, th, { color: s.color, ctrl: 'parked', keep: true });
    g.car = c; g.savedColor = c.color;
    if (s.bomb) fitBomb(c, true);
  }

  // ================= car bombs =================
  function fitBomb(c, quiet) {
    const B = S.bomb;
    const o = B.car;
    if (o && o !== c) { o.bombed = false; if (!(S.garage && S.garage.car === o)) o.keep = false; }
    B.car = c; c.bombed = true; c.keep = true; B.fuse = 0; B.remote = 0;
    if (S.garage && (S.garage.car === c || S.garage.car === o)) saveGarage(S.garage.car);
    if (!quiet && PG.audio.arm) PG.audio.arm();
  }
  function triggerBomb() {
    const B = S.bomb, c = B.car;
    if (!c || B.fuse > 0 || B.remote > 0 || P.state !== 'play') return;
    if (P.car === c) { B.fuse = FUSE_T; B.beepT = 0; X.big('GET OUT!', '#ff3b2f', 1500, 'car bomb armed · 5 seconds'); return; }
    const f = X.focus();
    if (Math.hypot(c.x - f.x, c.y - f.y) > BOMB_RANGE) { X.popup('Car bomb out of range'); sfx('buzz'); return; }
    B.remote = 0.5; sfx('remote');
  }
  function bombBoom(c) {
    const B = S.bomb; B.car = null; B.fuse = B.remote = 0;
    c.bombed = false; if (!(S.garage && S.garage.car === c)) c.keep = false;
    const x = c.x, y = c.y;
    if (!c.wrecked && !c.removed) X.destroyCar(c, P.ped, 'bomb');
    X.explode(x, y, { by: P.ped, power: 1.7, source: c });
    G().shake = Math.max(G().shake, 0.9);
    S.stats.bombs++;
    X.emit('carBomb', { car: c, x, y });
  }
  function bombTick(dt) {
    const B = S.bomb;
    if (B.cook && (B.cook.t -= dt) <= 0) { const k = B.cook; B.cook = null; X.explode(k.x, k.y, { by: k.by, power: 1.4, source: k.car }); }
    const c = B.car; if (!c) return;
    if (c.removed) { B.car = null; return; }
    if (c.wrecked) {   // blown up some other way: the bomb goes with it
      B.car = null; c.bombed = false; B.cook = { x: c.x, y: c.y, t: 0.3, by: c.lastBy, car: c }; return;
    }
    if (X.input.pressed('KeyG')) triggerBomb();
    if (B.fuse > 0) {
      B.fuse -= dt;
      if ((B.beepT -= dt) <= 0) { B.beepT = 0.1 + 0.4 * Math.max(0, B.fuse) / FUSE_T; sfx('beep', c.x, c.y); }
      if (B.fuse <= 0) bombBoom(c);
    } else if (B.remote > 0 && (B.remote -= dt) <= 0) bombBoom(c);
  }

  // ================= daily export list, odds and ends =================
  function dayTick() {
    if (X.clock < S.lastClock - 600) { S.day++; S.list = makeList(S.day); if (S.crusher) X.popup('New export list at the Crusher'); }
    S.lastClock = X.clock;
  }
  // Kerbside parked cars must not spawn on the pads (lane traffic never drives there).
  const PAD_ZONE = [-4.4, 4.4, -0.5, 7.2], GARAGE_ZONE = [-4, 4, 0, 6.4];
  function onAnyPad(c) {
    return (S.spray && inRect(S.spray.fr, c.x, c.y, PAD_ZONE)) || (S.crusher && inRect(S.crusher.fr, c.x, c.y, PAD_ZONE)) || (S.garage && inRect(S.garage.fr, c.x, c.y, GARAGE_ZONE));
  }

  // ================= wrapped core services =================
  const baseExit = X.exitCar;
  X.exitCar = function () {
    const sp = S.spray;
    if (X.active && sp && sp.car && P.car === sp.car && (sp.phase === 'closing' || sp.phase === 'pick' || sp.phase === 'spray')) {
      if (sp.phase === 'pick') return confirmPaint(sp, sp.sel);
      if (X.time - sp.waitT > 1.2) { sp.waitT = X.time; X.popup('Wait for the paint to dry!'); }
      return;
    }
    return baseExit.apply(this, arguments);
  };
  const baseParked = X.spawnParked;
  X.spawnParked = function () {
    const c = baseParked.apply(this, arguments);
    if (c && X.active && onAnyPad(c)) { X.removeCar(c); return null; }
    return c;
  };
  const baseNearest = X.nearestEnterableCar;
  X.nearestEnterableCar = function () { const c = baseNearest.apply(this, arguments); return c && c.shopLock ? null : c; };
  const baseDrawCar = X.drawCar;
  X.drawCar = function (ctx, c, t) {
    if (c.shopHide) return;
    const q = c.shopSquash;
    if (!q) return baseDrawCar(ctx, c, t);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th); ctx.scale(q.sx, q.sy); ctx.rotate(-c.th); ctx.translate(-c.x, -c.y);
    baseDrawCar(ctx, c, t);
    ctx.restore();
  };

  // ================= events =================
  X.on('exitCar', e => {
    const c = e && e.car; if (!X.active || !c) return;
    const cr = S.crusher, g = S.garage;
    if (cr && cr.phase === 'idle' && !c.wrecked && inRect(cr.fr, c.x, c.y, CRUSH_IN)) { cr.pending = c; cr.pendT = 0.7; }
    else if (g && inRect(g.fr, c.x, c.y, GARAGE_IN)) { g.pending = c; g.pendT = 0.4; }
  });
  X.on('enterCar', e => {
    const c = e && e.car; if (!X.active || !c || !listed(c)) return;
    X.floatText(c.x, c.y - 2, 'WANTED FOR EXPORT', '#ffb02e', { life: 2.4, size: 16 });
    X.popup(`${c.model.name}: Knut pays up to $${fmt(exportPrice(c))}`, 3200);
  });

  // ================= UI (picker, offers, bomb chip) =================
  const CSS = `
#gta-hud .s-pick { position: absolute; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: min(620px, calc(100vw - 24px)); box-sizing: border-box; background: rgba(9,11,13,0.93); border: 3px solid #2f7d6d; border-radius: 10px; box-shadow: 0 0 0 2px #050607, 0 0 26px rgba(63,224,197,0.3), 0 12px 30px rgba(0,0,0,0.55); padding: 9px 12px 11px; pointer-events: auto; z-index: 4; animation: spop .25s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes spop { from { transform: translateX(-50%) scale(0.6); opacity: 0; } }
#gta-hud .s-pick-h { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--display); font-size: 22px; color: #ff6fb8; text-shadow: 0 0 10px rgba(255,80,170,0.85), 0 2px 0 #000; letter-spacing: 0.03em; }
#gta-hud .s-pick-h span { color: #7dff9a; text-shadow: 0 2px 0 #000; font-size: 19px; }
#gta-hud .s-pick-row { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
#gta-hud .s-pick-car { width: 116px; height: 62px; flex: none; background: #1d2026; border-radius: 6px; border: 1px solid #34383f; }
#gta-hud .s-pick-sw { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 6px; flex: 1; }
#gta-hud .s-pick-sw button { height: 38px; min-width: 0; border-radius: 6px; border: 2px solid rgba(255,255,255,0.22); cursor: pointer; padding: 0; font-family: var(--display); font-size: 18px; color: #fff; text-shadow: 0 2px 0 #000; transition: transform .08s; }
#gta-hud .s-pick-sw button.on { border-color: #fff; box-shadow: 0 0 0 2px #ffd23a, 0 0 14px rgba(255,210,58,0.75); transform: translateY(-4px) scale(1.08); }
#gta-hud .s-pick-sw button.rnd { background: conic-gradient(#d0141e, #f2c230, #2f8f4e, #1fa3a3, #1f5fbf, #6b3fa0, #e0458f, #d0141e); }
#gta-hud .s-pick-name { font-family: var(--hud); font-weight: 800; font-size: 21px; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 8px; color: #fff; text-shadow: 0 2px 0 #000; }
#gta-hud .s-pick-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; font-family: var(--hud); font-weight: 700; font-size: 14px; color: #a9b0bb; text-transform: uppercase; letter-spacing: 0.05em; }
#gta-hud .s-pick-bomb { pointer-events: auto; cursor: pointer; font-family: var(--hud); font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #ffd23a; background: #2a1c10; border: 2px solid #6b4a1e; border-radius: 6px; padding: 4px 10px; }
#gta-hud .s-pick-bomb.on { background: #8a1f1a; border-color: #ff6a3a; color: #fff; }
#gta-hud .s-pick-bomb.off { opacity: 0.45; }
#gta-hud .s-pick-bar { height: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; margin-top: 8px; overflow: hidden; }
#gta-hud .s-pick-bar i { display: block; height: 100%; background: #3fe0c5; width: 100%; }
#gta-hud .s-offer { position: absolute; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: rgba(10,11,14,0.88); border: 2px solid #3fe0c5; border-radius: 999px; padding: 5px 15px; font-family: var(--hud); font-weight: 800; font-size: 16px; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; color: #e9fffb; text-shadow: 0 1px 0 #000; }
#gta-hud .s-offer.bad { border-color: #ff5a4a; color: #ffd8d3; }
#gta-hud .s-offer.cash { border-color: #7dff9a; color: #d9ffe2; }
#gta-hud .s-bomb { position: absolute; right: 12px; top: calc(178px + env(safe-area-inset-top, 0px)); display: flex; align-items: center; gap: 6px; background: rgba(10,11,14,0.82); border: 2px solid #8a1f1a; border-radius: 8px; padding: 3px 9px 3px 4px; font-family: var(--hud); font-weight: 800; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase; color: #ffd8d3; pointer-events: auto; cursor: pointer; text-shadow: 0 1px 0 #000; }
#gta-hud .s-bomb canvas { width: 30px; height: 30px; }
#gta-hud .s-bomb b { display: inline-block; min-width: 14px; padding: 0 5px; border-radius: 4px; background: #ffd23a; color: #111; text-align: center; margin-right: 5px; text-shadow: none; }
#gta-hud .s-bomb.lit { animation: sbomb .35s steps(2) infinite; }
#gta-hud .s-bomb.far { opacity: 0.55; }
@keyframes sbomb { 50% { border-color: #ff3b2f; background: rgba(140,14,0,0.9); } }
@media (max-width: 640px) { #gta-hud .s-pick-car { display: none; } #gta-hud .s-pick-h { font-size: 17px; } #gta-hud .s-pick-sw button { height: 32px; } #gta-hud .s-offer { font-size: 13px; white-space: normal; text-align: center; width: max-content; max-width: calc(100vw - 40px); } }
`;
  function buildUi() {
    const root = document.getElementById('gta-hud'); if (!root) return null;
    if (S.ui && S.ui.root === root && root.contains(S.ui.pick)) return S.ui;
    if (!document.getElementById('gta-shops-css')) { const st = document.createElement('style'); st.id = 'gta-shops-css'; st.textContent = CSS; document.head.appendChild(st); }
    const pk = document.createElement('div'); pk.className = 's-pick'; pk.hidden = true;
    pk.innerHTML = `<div class="s-pick-h"><b>PAY 'N' SPRAY</b><span class="s-pick-price"></span></div><div class="s-pick-row"><canvas class="s-pick-car" width="232" height="124"></canvas><div class="s-pick-sw"></div></div><div class="s-pick-name"></div><div class="s-pick-foot"><button class="s-pick-bomb" type="button"></button><span>A/D choose · F spray · or wait for Svein</span></div><div class="s-pick-bar"><i></i></div>`;
    const sw = pk.querySelector('.s-pick-sw'), btns = [];
    PAINTS.concat([null]).forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button';
      if (p) { b.style.background = p.c; b.title = p.name; } else { b.className = 'rnd'; b.textContent = '?'; b.title = 'Surprise me'; }
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const sp = S.spray; if (sp && sp.phase === 'pick') { sp.sel = i; sp.touched = true; confirmPaint(sp, i); } });
      sw.appendChild(b); btns.push(b);
    });
    const bombBtn = pk.querySelector('.s-pick-bomb');
    bombBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (S.spray) toggleBomb(S.spray); });
    const of = document.createElement('div'); of.className = 's-offer'; of.hidden = true;
    const bm = document.createElement('div'); bm.className = 's-bomb'; bm.hidden = true;
    bm.innerHTML = '<canvas width="60" height="60"></canvas><span></span>';
    bm.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (X.active && G().status === 'play') triggerBomb(); });
    drawBombIcon(bm.querySelector('canvas'));
    root.appendChild(of); root.appendChild(pk); root.appendChild(bm);
    S.ui = { root, pick: pk, btns, bombBtn, name: pk.querySelector('.s-pick-name'), price: pk.querySelector('.s-pick-price'), bar: pk.querySelector('.s-pick-bar i'), prev: pk.querySelector('canvas'),
      offer: of, bomb: bm, bombText: bm.querySelector('span'), cache: {}, pickOn: false, prevKey: '' };
    return S.ui;
  }
  function drawBombIcon(cv) {
    const g = cv.getContext('2d'); g.clearRect(0, 0, 60, 60);
    g.fillStyle = '#16181c'; g.beginPath(); g.arc(26, 34, 19, 0, TAU); g.fill();
    g.strokeStyle = '#5a5f68'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(19, 27, 6, 0, TAU); g.fill();
    g.fillStyle = '#3a3f46'; g.fillRect(31, 10, 10, 9);
    g.strokeStyle = '#c9a26a'; g.lineWidth = 3; g.beginPath(); g.moveTo(36, 10); g.quadraticCurveTo(42, 2, 50, 6); g.stroke();
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(51, 6, 4.5, 0, TAU); g.fill(); g.fillStyle = '#ff5a1a'; g.beginPath(); g.arc(51, 6, 2.2, 0, TAU); g.fill();
  }
  function setText(el, key, v) { const C = S.ui.cache; if (C[key] !== v) { C[key] = v; el.textContent = v; } }
  function showPicker(sp) {
    if (!buildUi()) return;
    const U = S.ui; U.pick.hidden = false; U.pickOn = true; U.cache.sel = -1; U.prevKey = '';
    U.pick.style.animation = 'none'; void U.pick.offsetWidth; U.pick.style.animation = '';
    updatePicker(sp);
  }
  function hidePicker() { if (S.ui) { S.ui.pick.hidden = true; S.ui.pickOn = false; } }
  function updatePicker(sp) {
    const U = S.ui; if (!U) return;
    if (U.cache.sel !== sp.sel) {
      U.cache.sel = sp.sel;
      U.btns.forEach((b, i) => b.classList.toggle('on', i === sp.sel));
      setText(U.name, 'pname', sp.sel === RANDOM ? 'Surprise me (Svein picks)' : PAINTS[sp.sel].name);
    }
    const cost = price() + (sp.bomb ? BOMB_PRICE : 0);
    setText(U.price, 'pprice', cost ? '$' + fmt(cost) : 'FREE');
    const can = P.money >= price() + BOMB_PRICE && S.bomb.car !== sp.car;
    const bk = (sp.bomb ? 'on' : can ? '' : 'off') + '|' + (S.bomb.car === sp.car);
    if (U.cache.bk !== bk) {
      U.cache.bk = bk;
      U.bombBtn.className = 's-pick-bomb ' + (sp.bomb ? 'on' : can ? '' : 'off');
      U.bombBtn.textContent = S.bomb.car === sp.car ? 'Bomb already fitted' : sp.bomb ? 'B · Car bomb fitted ✓' : `B · Car bomb +$${fmt(BOMB_PRICE)}`;
    }
    const w = Math.round(cl(sp.pickT / PICK_T, 0, 1) * 100) + '%';
    if (U.cache.bar !== w) { U.cache.bar = w; U.bar.style.width = w; }
    // preview: the car in the chosen colour (cycling colours for "surprise me")
    const c = sp.car; if (!c) return;
    const col = sp.sel === RANDOM ? ALLP[Math.floor(X.time * 5) % ALLP.length].c : PAINTS[sp.sel].c;
    const key = col + c.id;
    if (U.prevKey === key) return;
    U.prevKey = key;
    const cv = U.prev, g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const s = Math.min(cv.width * 0.82 / c.len, cv.height * 0.7 / c.wid);
    g.translate(cv.width / 2, cv.height / 2); g.scale(s, s);
    const def = c.def, mid = X.carMid(def), hw = c.wid / 2 + 0.02;
    PG.drawCar(g, { x: 0, y: 0, th: 0, len: c.len, wid: c.wid, color: col, truck: !!c.model.box, lights: true,
      wheels: [{ lx: def.wb - mid, ly: -hw, a: 0.3 }, { lx: def.wb - mid, ly: hw, a: 0.3 }, { lx: -mid, ly: -hw, a: 0 }, { lx: -mid, ly: hw, a: 0 }] });
  }
  function offerText() {
    const c = P.car;
    if (!c || P.state !== 'play' || X.scene) return null;
    const sp = S.spray, cr = S.crusher, g = S.garage;
    if (sp && sp.car === c) {
      if (sp.phase === 'closing') return ['Closing the booth...', ''];
      if (sp.phase === 'spray') return ['Spraying: ' + sp.paint.name, ''];
      if (sp.phase === 'pick') return null;
    }
    if (sp && inRect(sp.fr, c.x, c.y, SPRAY_IN)) {
      if (sp.done === c) return ['Fresh paint. Drive safe!', 'cash'];
      const why = refusal(c); if (why) return [refuseText(why), 'bad'];
      if (Math.abs(c.speed) > 0.6) return [`Pay 'n' Spray · stop on the pad · ${price() ? '$' + price() : 'first one free'}`, ''];
      if (!polyInRect(sp.fr, c, SPRAY_FIT)) return ['Line it up inside the booth', 'bad'];
      return null;
    }
    if (cr && inRect(cr.fr, c.x, c.y, CRUSH_IN)) {
      if (listed(c)) return [`Export ${c.model.name} · $${fmt(exportPrice(c))} (${Math.round(cond(c) * 100)}%) · get out to sell`, 'cash'];
      return [`Crush ${c.model.name} for scrap · $${fmt(scrapPrice(c))} · get out to confirm`, ''];
    }
    if (g && inRect(g.fr, c.x, c.y, GARAGE_IN)) {
      if (g.car === c) return ["Stored in Artur's Garage", 'cash'];
      if (g.car) return ['Garage is full', 'bad'];
      return [`Artur's Garage · get out to store the ${c.model.name}`, ''];
    }
    return null;
  }
  function hudTick() {
    const U = S.ui; if (!U) return;
    const sp = S.spray;
    if (sp && sp.phase === 'pick') { if (!U.pickOn) showPicker(sp); else updatePicker(sp); } else if (U.pickOn) hidePicker();
    const o = offerText(), ot = o ? o[0] : '', ok = o ? o[1] : '';
    if (U.cache.ot !== ot || U.cache.ok !== ok) { U.cache.ot = ot; U.cache.ok = ok; U.offer.hidden = !ot; U.offer.textContent = ot; U.offer.className = 's-offer ' + ok; }
    const B = S.bomb, c = B && B.car;
    let bt = '', cls = 's-bomb';
    if (c) {
      const f = X.focus(), far = Math.hypot(c.x - f.x, c.y - f.y) > BOMB_RANGE;
      if (B.fuse > 0) { bt = 'BOOM IN ' + Math.ceil(B.fuse); cls += ' lit'; }
      else if (B.remote > 0) { bt = 'BEEP BEEP...'; cls += ' lit'; }
      else if (P.car === c) bt = 'G|Light the fuse';
      else if (far) { bt = 'Out of range'; cls += ' far'; }
      else bt = 'G|Detonate';
    }
    if (U.cache.bt !== bt || U.cache.bc !== cls) {
      U.cache.bt = bt; U.cache.bc = cls; U.bomb.hidden = !bt; U.bomb.className = cls;
      const parts = bt.split('|');
      U.bombText.innerHTML = '';
      if (parts.length > 1) { const k = document.createElement('b'); k.textContent = parts[0]; U.bombText.appendChild(k); U.bombText.appendChild(document.createTextNode(parts[1])); }
      else U.bombText.textContent = bt;
    }
  }
  function hideUi() {
    if (!S.ui) return;
    hidePicker(); S.ui.offer.hidden = true; S.ui.bomb.hidden = true; S.ui.cache = {};
  }

  // ================= interactions on foot =================
  const sprayInfo = {
    test() {
      const sp = S.spray; if (!sp || sp.phase !== 'idle' || P.car || X.scene || P.state !== 'play' || !P.ped) return null;
      if (!inRect(sp.fr, P.ped.x, P.ped.y, [-4.6, 4.6, -0.3, 7])) return null;
      if (X.nearestEnterableCar()) return null;
      return { text: "F: Pay 'n' Spray prices", priority: 1, run() { toast(`Svein: Respray and repair ${price() ? '$' + price() : 'free (first one)'}. Car bomb $${fmt(BOMB_PRICE)}. Drive in, stop on the pad.`); } };
    },
  };
  const crusherInfo = {
    test() {
      const cr = S.crusher; if (!cr || cr.phase !== 'idle' || cr.pending || P.car || X.scene || P.state !== 'play' || !P.ped) return null;
      if (!inRect(cr.fr, P.ped.x, P.ped.y, [-4.6, 4.6, -0.3, 7])) return null;
      if (X.nearestEnterableCar()) return null;
      return { text: 'F: Read the export list', priority: 1, run() {
        const L = S.list.models.map(id => S.list.done.includes(id) ? `${X.MODELS[id].name} (sold)` : `${X.MODELS[id].name} $${fmt(mintPrice(id))}`).join(', ');
        toast(`Knut wants: ${L}. Anything else gets crushed for scrap.`);
      } };
    },
  };

  // ================= drawing =================
  const DISPLAY = '"Bungee", Impact, "Arial Black", sans-serif', HUDF = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const TW = new Map();
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => TW.clear());   // web fonts change the widths
  function fitSize(ctx, text, font, size, maxW) {
    const key = font + '|' + text; let w = TW.get(key);
    if (w == null) { const sp = font.indexOf(' '); ctx.font = font.slice(0, sp) + ' 10px' + font.slice(sp); w = ctx.measureText(text).width / 10; if (TW.size > 300) TW.clear(); TW.set(key, w); }
    return Math.min(size, maxW / Math.max(0.01, w));
  }
  function hazard(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#e3b23c'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#17181b'; const st = Math.min(w, h) * 1.6 + 0.25;
    ctx.beginPath();
    for (let s = -h - st; s < w; s += st) { ctx.moveTo(x + s, y); ctx.lineTo(x + s + st / 2, y); ctx.lineTo(x + s + st / 2 + h, y + h); ctx.lineTo(x + s + h, y + h); ctx.closePath(); }
    ctx.fill(); ctx.restore();
  }
  const flick = (t, seed) => hash(Math.floor(t * 9), seed) > 0.035;
  function neon(ctx, text, x, y, size, color, lit) {
    ctx.font = `400 ${size}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (lit) {
      ctx.strokeStyle = color; ctx.globalAlpha = 0.18; ctx.lineWidth = size * 0.55; ctx.strokeText(text, x, y);
      ctx.globalAlpha = 0.45; ctx.lineWidth = size * 0.22; ctx.strokeText(text, x, y);
      ctx.globalAlpha = 1; ctx.fillStyle = shade(color, 0.55);
    } else { ctx.globalAlpha = 1; ctx.fillStyle = shade(color, -0.55); }
    ctx.fillText(text, x, y); ctx.globalAlpha = 1;
  }
  function plate(ctx, bd, rim) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bd.x - bd.w / 2 + 0.35, bd.y - bd.h / 2 + 0.35, bd.w, bd.h);
    ctx.fillStyle = '#121418'; ctx.fillRect(bd.x - bd.w / 2, bd.y - bd.h / 2, bd.w, bd.h);
    ctx.strokeStyle = rim; ctx.lineWidth = 0.18; ctx.strokeRect(bd.x - bd.w / 2 + 0.15, bd.y - bd.h / 2 + 0.15, bd.w - 0.3, bd.h - 0.3);
    ctx.fillStyle = '#5a5f68'; for (const sx of [-1, 1]) ctx.fillRect(bd.x + sx * bd.w * 0.3 - 0.12, bd.y + bd.h / 2, 0.24, 0.5);
  }
  function sprayCan(ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.35);
    ctx.fillStyle = col; PG.rr(ctx, -0.35, -0.6, 0.7, 1.3, 0.12); ctx.fill();
    ctx.fillStyle = '#d9dde2'; ctx.fillRect(-0.18, -0.85, 0.36, 0.26); ctx.fillStyle = '#16181c'; ctx.fillRect(-0.06, -0.98, 0.12, 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-0.25, -0.45, 0.1, 0.95);
    ctx.restore();
  }
  function roofBox(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - w / 2 + 0.25, y - h / 2 + 0.25, w, h);
    ctx.fillStyle = '#6f747c'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.06; ctx.beginPath();
    for (let k = 0.3; k < w - 0.1; k += 0.3) { ctx.moveTo(x - w / 2 + k, y - h / 2 + 0.1); ctx.lineTo(x - w / 2 + k, y + h / 2 - 0.1); }
    ctx.stroke();
  }
  function drawFan(ctx, p, a, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x + 0.25, p.y + 0.25, r + 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5d6168'; ctx.beginPath(); ctx.arc(p.x, p.y, r + 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1d21'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9aa0a8';
    for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, r * 0.9, b, b + 0.55); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#3a3e45'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.2, 0, TAU); ctx.fill();
  }

  // --- Pay 'n' Spray ---
  function sprayGround(ctx, sp, t) {
    ctx.save(); local(ctx, sp.fr);
    ctx.fillStyle = '#33373d'; ctx.fillRect(-ROOF_H, 0, ROOF_H * 2, ROOF_D);
    for (const s of sp.stains) { ctx.globalAlpha = 0.3; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.u, s.v, s.r, 0, TAU); ctx.arc(s.u + s.r * 0.9, s.v + s.r * 0.4, s.r * 0.35, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    hazard(ctx, -ROOF_H, 0, 0.32, ROOF_D); hazard(ctx, ROOF_H - 0.32, 0, 0.32, ROOF_D);
    ctx.strokeStyle = 'rgba(236,232,220,0.75)'; ctx.lineWidth = 0.14; ctx.setLineDash([0.6, 0.4]); ctx.strokeRect(-3.4, 1.3, 6.8, 4.6); ctx.setLineDash([]);
    const glow = sp.phase === 'idle' && P.car && P.wanted > 0 ? 0.35 + 0.35 * Math.sin(t * 6) : 0;
    ctx.fillStyle = `rgba(63,224,197,${0.35 + glow})`;
    for (let i = 0; i < 2; i++) { const v = 5.4 - i * 1.15; ctx.beginPath(); ctx.moveTo(-1.2, v); ctx.lineTo(0, v - 0.75); ctx.lineTo(1.2, v); ctx.lineTo(1.2, v + 0.38); ctx.lineTo(0, v - 0.37); ctx.lineTo(-1.2, v + 0.38); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function sprayBuilding(ctx, sp, t) {
    const fr = sp.fr;
    ctx.save(); local(ctx, fr);
    ctx.fillStyle = '#1d2328'; ctx.fillRect(-ROOF_H - 0.25, -1.0, ROOF_H * 2 + 0.5, 1.0);   // roller housing the roof slides out of
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.06; ctx.beginPath();
    for (let v = -0.85; v < -0.05; v += 0.17) { ctx.moveTo(-ROOF_H, v); ctx.lineTo(ROOF_H, v); }
    ctx.stroke();
    hazard(ctx, -ROOF_H - 0.25, -0.22, ROOF_H * 2 + 0.5, 0.22);
    ctx.fillStyle = '#e3b23c'; ctx.fillRect(-ROOF_H - 0.45, -1.15, 0.3, 1.15); ctx.fillRect(ROOF_H + 0.15, -1.15, 0.3, 1.15);
    const on = sp.phase !== 'idle' && sp.phase !== 'opening';
    ctx.fillStyle = on ? (Math.floor(t * 4) % 2 ? '#ff3b2f' : '#4a0f0b') : '#2ad46a';
    ctx.beginPath(); ctx.arc(ROOF_H + 0.3, -1.45, 0.22, 0, TAU); ctx.fill();
    ctx.restore();
    drawFan(ctx, sp.fanAt, sp.fan, 0.95);
    roofBox(ctx, sp.ventAt.x, sp.ventAt.y, 1.8, 1.2);
    plate(ctx, sp.sign, '#2f7d6d');
  }
  function sprayNeon(ctx, sp, t) {
    const bd = sp.sign, lit = flick(t, 3.1), canW = Math.min(bd.h * 0.8, bd.w * 0.12);
    const tw = bd.w - canW - 1.1, size = fitSize(ctx, "PAY 'N' SPRAY", '400 ' + DISPLAY, bd.h * 0.42, tw);
    const tx = bd.x + canW / 2 + 0.2;
    neon(ctx, "PAY 'N' SPRAY", tx, bd.y - bd.h * 0.13, size, '#ff4fa8', lit);
    const sub = `RESPRAY ${price() ? '$' + price() : 'FREE'} · BOMBS $${fmt(BOMB_PRICE)}`;
    ctx.font = `700 ${fitSize(ctx, sub, '700 ' + HUDF, bd.h * 0.22, tw)}px ${HUDF}`; ctx.fillStyle = '#5af0d0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sub, tx, bd.y + bd.h * 0.27);
    sprayCan(ctx, bd.x - bd.w / 2 + canW / 2 + 0.45, bd.y + 0.05, canW * 0.62, '#ff4fa8');
    if (sp.phase === 'spray' && Math.floor(t * 3) % 2) { const p = sp.fanAt; ctx.font = `400 0.55px ${DISPLAY}`; ctx.fillStyle = '#ffd23a'; ctx.fillText('WORKING', p.x, p.y - 1.5); }
  }
  function sprayAir(ctx, sp, t) {
    const e = ease(sp.roof);
    if (e > 0.002) {
      const fr = sp.fr, D = ROOF_D * e, H = ROOF_H;
      ctx.save(); local(ctx, fr);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-H + 0.3, 0.3, H * 2, D);
      ctx.fillStyle = '#1e5248'; ctx.fillRect(-H, 0, 0.32, D); ctx.fillRect(H - 0.32, 0, 0.32, D);
      ctx.fillStyle = '#2f7d6d'; ctx.fillRect(-H + 0.32, 0, H * 2 - 0.64, D);
      ctx.lineWidth = 0.07; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath();
      for (let v = 0.45; v < D - 0.3; v += 0.45) { ctx.moveTo(-H + 0.32, v); ctx.lineTo(H - 0.32, v); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.beginPath();
      for (let v = 0.53; v < D - 0.3; v += 0.45) { ctx.moveTo(-H + 0.32, v); ctx.lineTo(H - 0.32, v); }
      ctx.stroke();
      hazard(ctx, -H, D - 0.34, H * 2, 0.34);
      if (sp.phase === 'pick' || sp.phase === 'spray' || sp.phase === 'closing') {
        const bx = 0, by = D * 0.5, a = t * 7;
        ctx.fillStyle = 'rgba(255,160,50,0.3)'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, 2.6, a, a + 0.6); ctx.closePath(); ctx.moveTo(bx, by); ctx.arc(bx, by, 2.6, a + Math.PI, a + Math.PI + 0.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff8a1a'; ctx.beginPath(); ctx.arc(bx, by, 0.32, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(bx, by, 0.14, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (e > 0.6) {
        const c = toW(fr, 0, D * 0.5 + 1.6), maxW = (Math.abs(fr.T.x) > 0.5 ? H * 2 : D) - 1.2;
        ctx.globalAlpha = (e - 0.6) / 0.4 * 0.9;
        ctx.font = `400 ${fitSize(ctx, "PAY 'N' SPRAY", '400 ' + DISPLAY, 0.75, maxW)}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e9fffb'; ctx.fillText("PAY 'N' SPRAY", c.x, c.y);
        ctx.globalAlpha = 1;
      }
    }
    if (mLive) {
      for (let pass = 0; pass < 2; pass++) {
        const spr = puff(pass ? '236,239,243' : mistRgb);
        for (let i = 0; i < MN; i++) {
          if (ML[i] <= 0 || MW[i] !== pass) continue;
          const k = ML[i] / MM[i], r = MS[i] * (2.6 - 1.4 * k);
          ctx.globalAlpha = 0.7 * Math.min(1, k * 1.6); ctx.drawImage(spr, MX[i] - r, MY[i] - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawShine(ctx, c, k, t) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    const L = c.len, Wd = c.wid, x = -L / 2 + (1 - k) * L * 1.3;
    if (x < L / 2 - 0.3) {
      ctx.globalAlpha = 0.45 * Math.min(1, k * 2); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x, -Wd / 2 + 0.05); ctx.lineTo(x + 0.4, -Wd / 2 + 0.05); ctx.lineTo(x + 0.1, Wd / 2 - 0.05); ctx.lineTo(x - 0.3, Wd / 2 - 0.05); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const s = 0.18 + 0.16 * Math.max(0, Math.sin(t * 9 + i * 2.1)), px = L * 0.32 * (i - 1), py = Wd * 0.22 * (i % 2 ? 1 : -1);
      ctx.beginPath(); ctx.moveTo(px - s * 2, py); ctx.lineTo(px, py - s * 0.4); ctx.lineTo(px + s * 2, py); ctx.lineTo(px, py + s * 0.4); ctx.closePath();
      ctx.moveTo(px, py - s * 2); ctx.lineTo(px + s * 0.4, py); ctx.lineTo(px, py + s * 2); ctx.lineTo(px - s * 0.4, py); ctx.closePath(); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // --- Crusher & Export ---
  function crusherGround(ctx, cr) {
    ctx.save(); local(ctx, cr.fr);
    ctx.fillStyle = '#3b3934'; ctx.fillRect(-ROOF_H, 0, ROOF_H * 2, ROOF_D);
    ctx.save(); ctx.beginPath(); ctx.rect(-ROOF_H, 0, ROOF_H * 2, ROOF_D); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.05; ctx.beginPath();
    for (let k = -ROOF_H - ROOF_D; k < ROOF_H; k += 0.7) { ctx.moveTo(k, 0); ctx.lineTo(k + ROOF_D, ROOF_D); ctx.moveTo(k + ROOF_D, 0); ctx.lineTo(k, ROOF_D); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(10,10,12,0.55)'; ctx.beginPath(); ctx.ellipse(-1.2, 3.2, 1.2, 0.7, 0.4, 0, TAU); ctx.ellipse(1.6, 4.4, 0.8, 0.5, -0.3, 0, TAU); ctx.fill();
    hazard(ctx, -ROOF_H, 0, 0.32, ROOF_D); hazard(ctx, ROOF_H - 0.32, 0, 0.32, ROOF_D); hazard(ctx, -ROOF_H, ROOF_D - 0.3, ROOF_H * 2, 0.3);
    ctx.restore();
    const c = toW(cr.fr, 0, 2.2);
    ctx.font = `400 0.9px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(227,178,60,0.35)'; ctx.fillText('CRUSH', c.x, c.y);
  }
  function crusherBuilding(ctx, cr, t) {
    const fr = cr.fr;
    ctx.save(); local(ctx, fr);
    ctx.fillStyle = '#b8892a'; ctx.fillRect(-3.6, -1.5, 7.2, 1.5);
    ctx.fillStyle = '#e3b23c'; ctx.fillRect(-3.45, -1.38, 6.9, 1.2);
    ctx.fillStyle = '#2b2d33'; for (let u = -3; u <= 3.01; u += 1.2) ctx.fillRect(u - 0.3, -1.1, 0.6, 0.7);
    ctx.fillStyle = '#5a5f68'; for (let u = -3.2; u <= 3.21; u += 0.8) { ctx.beginPath(); ctx.arc(u, -0.2, 0.07, 0, TAU); ctx.fill(); }
    ctx.restore();
    for (let i = 0; i < cr.pile.length; i++) { const p = cr.slots[i], lay = Math.floor(i / 6) % 3; drawCube(ctx, p.x, p.y, (cr.pile[i].seed % 1) * 0.6 - 0.3, cr.pile[i].c, 1 + lay * 0.06, cr.pile[i].seed, lay); }
    plate(ctx, cr.sign, '#e3b23c'); plate(ctx, cr.list, '#e3b23c');
  }
  function crusherNeon(ctx, cr, t) {
    const bd = cr.sign;
    neon(ctx, 'CRUSHER & EXPORT', bd.x, bd.y, fitSize(ctx, 'CRUSHER & EXPORT', '400 ' + DISPLAY, bd.h * 0.5, bd.w - 1), '#ffb02e', flick(t, 7.7));
    const L = cr.list, rows = S.list ? S.list.models : [];
    const lh = L.h / (rows.length + 1.6), tw = L.w - 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `400 ${fitSize(ctx, 'WANTED FOR EXPORT', '400 ' + DISPLAY, lh * 0.62, tw)}px ${DISPLAY}`; ctx.fillStyle = '#ffd23a';
    ctx.fillText('WANTED FOR EXPORT', L.x, L.y - L.h / 2 + lh * 0.85);
    rows.forEach((id, i) => {
      const done = S.list.done.includes(id), txt = `${X.MODELS[id].name.toUpperCase()}  ${done ? 'SOLD' : '$' + fmt(mintPrice(id))}`;
      const y = L.y - L.h / 2 + lh * (1.85 + i), sz = fitSize(ctx, txt, '700 ' + HUDF, lh * 0.7, tw);
      ctx.font = `700 ${sz}px ${HUDF}`; ctx.fillStyle = done ? '#6f7680' : '#e9e4d8'; ctx.fillText(txt, L.x, y);
      if (done) { ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 0.12; const w = TW.get('700 ' + HUDF + '|' + txt) * sz; ctx.beginPath(); ctx.moveTo(L.x - w / 2, y); ctx.lineTo(L.x + w / 2, y); ctx.stroke(); }
    });
  }
  function drawCube(ctx, x, y, rot, color, s, seed, lay) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-0.72 + 0.22 * (1 + lay), -0.7 + 0.22 * (1 + lay), 1.44, 1.4);
    ctx.fillStyle = shade(color, -0.3 + (lay || 0) * 0.08); ctx.fillRect(-0.72, -0.7, 1.44, 1.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.06; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = hash(seed, i), b = hash(seed, i + 9); ctx.moveTo(-0.7, -0.6 + a * 1.2); ctx.lineTo(-0.1 + b * 0.3, -0.6 + b * 1.2); ctx.lineTo(0.7, -0.6 + a * b * 1.2); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,225,240,0.55)'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.6 + hash(seed, i + 20) * 1.1, -0.6 + hash(seed, i + 30) * 1.1, 0.14, 0.08);
    ctx.fillStyle = '#15161a'; ctx.fillRect(-0.72, 0.3 + hash(seed, 40) * 0.2, 0.3, 0.26);
    ctx.strokeStyle = shade(color, 0.25); ctx.lineWidth = 0.05; ctx.strokeRect(-0.7, -0.68, 1.4, 1.36);
    ctx.restore();
  }
  function drawClaws(ctx, cr, t) {
    const ph = cr.phase; if (ph !== 'grab' && ph !== 'crush' && ph !== 'cube') return;
    const c = cr.car, k = ph === 'grab' ? ease(cr.t / 0.6) : ph === 'cube' ? 1 - ease(cr.t / 0.4) : 1;
    const sq = ph === 'crush' && c.shopSquash ? c.shopSquash.sx : ph === 'cube' ? 0.34 : 1;
    const gap = cr.len * sq / 2 + 0.22 + (1 - k) * 2.4, wd = cr.wid + 0.7;
    ctx.save(); ctx.translate(cr.pose.x, cr.pose.y); ctx.rotate(cr.pose.th);
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(s * gap, -wd * 0.25); ctx.lineTo(s * (gap + 2.8), -wd * 0.25); ctx.moveTo(s * gap, wd * 0.25); ctx.lineTo(s * (gap + 2.8), wd * 0.25); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(s * gap - (s > 0 ? 0 : 0.5) + 0.2, -wd / 2 + 0.2, 0.5, wd);
      ctx.fillStyle = '#e3b23c'; ctx.fillRect(s * gap - (s > 0 ? 0 : 0.5), -wd / 2, 0.5, wd);
      ctx.fillStyle = '#17181b'; for (let q = -wd / 2 + 0.1; q < wd / 2 - 0.1; q += 0.3) ctx.fillRect(s * gap - (s > 0 ? 0 : 0.5) + 0.05, q, 0.4, 0.12);
    }
    if (ph === 'cube') drawCube(ctx, 0, 0, 0, cr.color, 1, cr.seed, 0);
    ctx.restore();
  }
  function drawContainer(ctx, cr, x, y, s, alpha, lift) {
    ctx.save(); ctx.translate(x + lift, y + lift); ctx.rotate(cr.pose.th); ctx.scale(s, s);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`; ctx.fillRect(-cr.boxLen / 2, -cr.boxWid / 2, cr.boxLen, cr.boxWid);
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(cr.pose.th); ctx.scale(s, s); ctx.globalAlpha = alpha;
    const L = cr.boxLen, Wd = cr.boxWid;
    ctx.fillStyle = cr.box; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.07; ctx.beginPath();
    for (let q = -L / 2 + 0.3; q < L / 2 - 0.2; q += 0.3) { ctx.moveTo(q, -Wd / 2 + 0.12); ctx.lineTo(q, Wd / 2 - 0.12); }
    ctx.stroke();
    ctx.strokeStyle = shade(cr.box, -0.45); ctx.lineWidth = 0.14; ctx.strokeRect(-L / 2 + 0.07, -Wd / 2 + 0.07, L - 0.14, Wd - 0.14);
    ctx.fillStyle = '#d9dde2'; for (const sx of [-1, 1]) for (const sy of [-1, 1]) ctx.fillRect(sx * L / 2 - (sx > 0 ? 0.3 : 0), sy * Wd / 2 - (sy > 0 ? 0.3 : 0), 0.3, 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `700 0.62px ${HUDF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FJORD LINES', 0, 0);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function crusherAir(ctx, cr, t) {
    const ph = cr.phase;
    if (ph === 'container' || ph === 'seal') {
      const k = ph === 'seal' ? 1 : ease(cr.t / 0.9);
      drawContainer(ctx, cr, cr.pose.x, cr.pose.y, 1.55 - 0.55 * k, 0.55 + 0.45 * k, 2.4 * (1 - k));
    } else if (ph === 'raise') {
      const k = ease(cr.t / 1.2);
      drawContainer(ctx, cr, cr.hook.x, cr.hook.y, 1 + 0.5 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2), 1 - k * 0.85, 2.4 * k);
    } else if (ph === 'lift') {
      const k = cr.t / 1.1, s = 1 + 0.4 * Math.sin(Math.PI * cl(k, 0, 1));
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cr.hook.x - 0.7 + s, cr.hook.y - 0.7 + s, 1.4, 1.4);
      drawCube(ctx, cr.hook.x, cr.hook.y, cr.pose.th * (1 - k), cr.color, s, cr.seed, 0);
    }
    // the crane: cab on the roof, boom out to the hook
    const B = cr.base, H = cr.hook, a = Math.atan2(H.y - B.y, H.x - B.x), L = Math.max(2, Math.hypot(H.x - B.x, H.y - B.y));
    if (!X.inView(B.x, B.y, L + 4)) return;
    ctx.save(); ctx.translate(B.x, B.y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0.6, -0.15, L - 0.6, 0.9);
    ctx.fillStyle = '#6f747c'; ctx.fillRect(-2.6, -1, 1.5, 2);
    ctx.fillStyle = '#e3b23c'; ctx.fillRect(-1.2, -1.05, 2.3, 2.1);
    ctx.fillStyle = '#1c2632'; ctx.fillRect(0.45, -0.75, 0.5, 1.0);
    ctx.strokeStyle = '#e3b23c'; ctx.lineWidth = 0.13; ctx.beginPath();
    ctx.moveTo(1, -0.38); ctx.lineTo(L, -0.18); ctx.moveTo(1, 0.38); ctx.lineTo(L, 0.18);
    for (let x = 1, s = 1; x < L - 0.6; x += 0.9, s = -s) { ctx.moveTo(x, -0.36 * s); ctx.lineTo(x + 0.9, 0.36 * s); }
    ctx.stroke();
    ctx.restore();
    const mag = ph === 'lift' || ph === 'cube' || ph === 'crush' || ph === 'grab';
    ctx.fillStyle = '#2b2d33'; ctx.beginPath(); ctx.arc(H.x, H.y, mag ? 0.5 : 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = mag ? '#ff8a1a' : '#e3b23c'; ctx.lineWidth = 0.1; ctx.stroke();
  }

  // --- Artur's Garage ---
  function garageGround(ctx, g, t) {
    ctx.save(); local(ctx, g.fr);
    ctx.fillStyle = '#2a2d33'; ctx.fillRect(-3.25, 1.15, 6.5, 4.3);
    ctx.strokeStyle = 'rgba(236,232,220,0.85)'; ctx.lineWidth = 0.13; ctx.strokeRect(-3.1, 1.3, 6.2, 4.0);
    ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 0.1; ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(s * 2.7, 1.6); ctx.lineTo(s * 2.7, 2.2); ctx.moveTo(s * 2.7, 4.4); ctx.lineTo(s * 2.7, 5.0); }
    ctx.stroke();
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(-3.75, 0.3, 0.4, 0.4);
    ctx.restore();
    const c = g.c;
    if (!g.car) {
      ctx.font = `400 1.9px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(180,140,255,0.28)'; ctx.fillText('P', c.x, c.y);
    }
    const q = toW(g.fr, 0, 4.85);
    let a = Math.atan2(g.fr.T.y, g.fr.T.x); if (Math.cos(a) < -0.01 || (Math.abs(Math.cos(a)) <= 0.01 && Math.sin(a) > 0)) a += Math.PI;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a);
    ctx.font = `700 ${fitSize(ctx, "ARTUR'S GARAGE · PRIVATE", '700 ' + HUDF, 0.5, 5.6)}px ${HUDF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(236,232,220,0.55)'; ctx.fillText("ARTUR'S GARAGE · PRIVATE", 0, 0);
    ctx.restore();
  }
  function garageSign(ctx, g) {
    const p = g.post;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(p.x - 0.5 + 0.2, p.y - 0.5 + 0.2, 1, 1);
    ctx.fillStyle = '#1f5fbf'; PG.rr(ctx, p.x - 0.5, p.y - 0.5, 1, 1, 0.12); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.07; ctx.stroke();
    ctx.font = `400 0.72px ${DISPLAY}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', p.x, p.y + 0.04);
  }

  // --- the bomb ---
  function bombLed(ctx, c, t) {
    const B = S.bomb, on = B.fuse > 0 || B.remote > 0 ? Math.floor(t * 8) % 2 === 0 : Math.floor(t * 1.4) % 2 === 0;
    const cs = Math.cos(c.th), sn = Math.sin(c.th), x = c.x - cs * c.len * 0.12, y = c.y - sn * c.len * 0.12;
    ctx.fillStyle = '#16181c'; ctx.fillRect(x - 0.17, y - 0.17, 0.34, 0.34);
    ctx.fillStyle = on ? '#ff2a1a' : '#4a0f0b'; ctx.beginPath(); ctx.arc(x, y, 0.11, 0, TAU); ctx.fill();
    if (on) X.addLight(x, y, 2.2, '#ff2a1a', 0.7);
  }

  // ================= render hooks =================
  function renderGround(ctx, view, t) {
    // map blips: the shop squares, the hot ones pinned to the map edge
    const inCar = !!P.car && P.state === 'play';
    if (S.spray) { const p = S.spray.pad, hot = inCar && (P.wanted || 0) > 0; X.blip(p.x, p.y, '#3fe0c5', hot ? { edge: true, size: 4.5 + Math.sin(t * 6), ring: true, shape: 'square' } : { size: 3.5, shape: 'square' }); }
    if (S.crusher) { const p = S.crusher.pad, hot = inCar && listed(P.car); X.blip(p.x, p.y, '#ffb02e', hot ? { edge: true, size: 4.5, ring: true, shape: 'square' } : { size: 3.5, shape: 'square' }); }
    if (S.garage) X.blip(S.garage.c.x, S.garage.c.y, '#b48cff', { size: 3, shape: 'square' });
    if (S.bomb && S.bomb.car) X.blip(S.bomb.car.x, S.bomb.car.y, '#ff3b2f', { edge: true, size: 3.5, ring: S.bomb.fuse > 0 || S.bomb.remote > 0 });
    if (X.scene) return;
    if (S.spray && X.inView(S.spray.pad.x, S.spray.pad.y, 10)) sprayGround(ctx, S.spray, t);
    if (S.crusher && X.inView(S.crusher.pad.x, S.crusher.pad.y, 10)) crusherGround(ctx, S.crusher);
    if (S.garage && X.inView(S.garage.c.x, S.garage.c.y, 10)) garageGround(ctx, S.garage, t);
  }
  const bVis = b => X.inView((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 4);
  function renderBuildings(ctx, view, t) {
    if (X.scene) return;
    const sp = S.spray, cr = S.crusher, g = S.garage;
    if (sp && bVis(sp.b)) {
      sprayBuilding(ctx, sp, t);
      X.addLight(sp.sign.x, sp.sign.y, 11, '#ff4fa8', flick(t, 3.1) ? 0.55 : 0.2);
      if (sp.roof > 0.5 && sp.phase !== 'opening') { const q = toW(sp.fr, 0, ROOF_D * 0.5); X.addLight(q.x, q.y, 9, '#ff9a2a', 0.45 + 0.35 * Math.abs(Math.sin(t * 7))); }
      else X.addLight(sp.pad.x, sp.pad.y, 7, '#bff7ec', 0.45);
    }
    if (cr && bVis(cr.b)) {
      crusherBuilding(ctx, cr, t);
      X.addLight(cr.pad.x, cr.pad.y, 9, '#ffe2a0', 0.6);
      X.addLight(cr.sign.x, cr.sign.y, 9, '#ffb02e', 0.4);
      if (cr.phase === 'crush') X.addLight(cr.pose.x, cr.pose.y, 6, '#ffb060', 0.5 + 0.4 * Math.random());
    }
    if (g && X.inView(g.c.x, g.c.y, 12)) { garageSign(ctx, g); X.addLight(g.post.x, g.post.y, 7, '#ffd9a0', 0.55); }
  }
  function renderCars(ctx, view, t) {
    if (X.scene) return;
    const sp = S.spray;
    if (sp && sp.shineT > 0 && sp.shineCar && !sp.shineCar.removed && X.inView(sp.shineCar.x, sp.shineCar.y, 6) && sp.roof < 0.4) drawShine(ctx, sp.shineCar, sp.shineT / 2.4, t);
    const cr = S.crusher;
    if (cr && cr.car && X.inView(cr.pose.x, cr.pose.y, 10)) drawClaws(ctx, cr, t);
    const b = S.bomb && S.bomb.car;
    if (b && !b.shopHide && X.inView(b.x, b.y, 4)) bombLed(ctx, b, t);
  }
  function renderAir(ctx, view, t) {
    if (X.scene) return;
    if (S.spray && (S.spray.roof > 0 || mLive) && X.inView(S.spray.pad.x, S.spray.pad.y, 14)) sprayAir(ctx, S.spray, t);
    if (S.crusher && bVis(S.crusher.b)) crusherAir(ctx, S.crusher, t);
  }
  function renderOverlay(ctx, view, t) {
    if (X.scene) return;
    if (S.spray && bVis(S.spray.b)) sprayNeon(ctx, S.spray, t);
    if (S.crusher && bVis(S.crusher.b)) crusherNeon(ctx, S.crusher, t);
    const B = S.bomb, c = B && B.car;
    if (c && B.fuse > 0 && X.inView(c.x, c.y, 4)) {
      const s = 1.2 + 0.3 * (B.fuse % 1);
      ctx.font = `400 ${s}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 0.25; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000'; ctx.strokeText(String(Math.ceil(B.fuse)), c.x, c.y - c.wid - 0.8); ctx.fillStyle = '#ff3b2f'; ctx.fillText(String(Math.ceil(B.fuse)), c.x, c.y - c.wid - 0.8);
    }
  }

  // ================= module =================
  X.shops = {
    PAINTS, WILD, SPRAY_PRICE, BOMB_PRICE, LINES,
    price, exportPrice, scrapPrice, listed, cond,
    get spray() { return S.spray; }, get crusher() { return S.crusher; }, get garage() { return S.garage; },
    get exportList() { return S.list; }, get bombCar() { return S.bomb && S.bomb.car; }, get bomb() { return S.bomb; }, get stats() { return S.stats; },
    fitBomb: c => fitBomb(c), detonate: () => triggerBomb(),
    newList: () => { S.day++; S.list = makeList(S.day); return S.list; },
    sfx,
    _S: S,
  };
  X.mod('shops', {
    order: 65,
    init() {
      S.save = X.save.shops || (X.save.shops = {});
      S.day = 0; S.lastClock = X.clock;
      S.stats = { sprays: 0, exported: 0, scrapped: 0, bombs: 0, stored: 0, earned: 0 };
      S.bomb = { car: null, fuse: 0, beepT: 0, remote: 0, cook: null };
      mistReset(); TW.clear();
      S.spray = setupSpray(); S.crusher = setupCrusher(); S.garage = setupGarage();
      S.list = makeList(0);
      buildUi(); hideUi();
      X.interactions.push(sprayInfo, crusherInfo);
      if (S.garage) spawnStored(S.garage);
    },
    stop() {
      hideUi(); mistReset();
      S.spray = S.crusher = S.garage = null;
      if (S.bomb) S.bomb.car = null;
    },
    tick(dt) {
      if (!X.city || !P.ped) return;
      dayTick();
      if (S.spray) sprayTick(S.spray, dt);
      if (S.crusher) crushTick(S.crusher, dt);
      if (S.garage) garageTick(S.garage, dt);
      bombTick(dt);
      if (mLive || S.spray) mistTick(dt);
    },
    hud() { if (!S.ui || !document.getElementById('gta-hud') || !S.ui.root.isConnected) buildUi(); hudTick(); },
    render: { ground: renderGround, buildings: renderBuildings, cars: renderCars, air: renderAir, overlay: renderOverlay },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
