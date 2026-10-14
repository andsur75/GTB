// Missions for Grand Theft Bus. GTA2 payphones on the sidewalks ring when Trond has work (green, yellow and
// red booths by difficulty, a gold one outside the bank); answering puts Trond on the pager: typed text, his
// yapping voice and his face. A data-driven framework runs one mission at a time: stages with objectives and
// markers, a HUD timer, success and fail checks (timer, target lost, car wrecked or dented, wasted, busted),
// rewards, chain unlocking, persistence in X.save and random odd jobs once the story is done. The story: the
// dentist's car, a ticking box van, the city bus against a rival car park, a parking-inspector chase, a hit
// with bodyguards, a kill frenzy, a car barbecue, a police joyride, an armoured-van robbery and the
// four-part Fjord Savings Bank heist. Delivered cars roll into Trond's Garage through a roll-up door.
// Owns X.missions.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  const smooth = k => { k = cl(k, 0, 1); return k * k * (3 - 2 * k); };

  // ================= constants & lines =================
  const TIER = {
    green: { color: '#4fdc6a', name: 'Green phone' },
    yellow: { color: '#ffd23a', name: 'Yellow phone' },
    red: { color: '#ff5a3a', name: 'Red phone' },
    bank: { color: '#e9c25a', name: 'Gold phone' },
  };
  const PHONE_TIERS = ['green', 'yellow', 'green', 'red', 'yellow', 'bank'];
  const PASS_LINES = [
    'Good. The money is in your account. Do not spend it on parking.',
    'Excellent. Smooth, like reversing into a tight bay.',
    'Ha! Kjell will hear about this. Everyone will.',
    'Nice work. I am almost proud. Almost.',
    'That is how we do business now. No cones. No tickets.',
  ];
  const FAIL_LINES = [
    'Pathetic. Call me when you can park a shopping trolley.',
    'I have seen better work from a parking meter.',
    'That was not the plan. The phone will ring again.',
    'Even the bus driver is laughing at you.',
    'Uff da. Try again. Try better.',
  ];
  const VOICEMAIL = [
    'This is Trond. I am not here. Leave a message. Or a car.',
    'Trond Holdings. When we need you, the phone rings. This one is not ringing.',
    'You have reached Trond. If this is about the car park, I was never there.',
  ];
  const MODELS_OLD = ['bambino', 'hatch', 'comet', 'hatch', 'rancher'];
  const MODELS_LOT = ['hatch', 'comet', 'voltage', 'regret', 'fjord', 'bambino', 'x5'];

  // ================= sound (one-shots only, so pause and mute need no cleanup) =================
  const kit = () => (PG.audio && PG.audio.kit ? PG.audio.kit() : null);
  function sfxRing(v) {
    const k = kit(); if (!k || v <= 0) return;
    for (let b = 0; b < 2; b++) for (let i = 0; i < 9; i++) {
      const t = k.now + b * 0.6 + i * 0.045;
      k.tone('triangle', 1320, t, 0.03, 0.07 * v); k.tone('square', 1760, t + 0.02, 0.025, 0.025 * v, { lp: 5000 });
    }
  }
  function sfxPick() { const k = kit(); if (!k) return; k.noise(k.now, 0.07, 0.3, 'lowpass', 1800); k.tone('square', 380, k.now + 0.03, 0.06, 0.05, { lp: 1400 }); }
  function sfxBeep(hi) { const k = kit(); if (!k) return; k.tone('square', hi ? 2350 : 1850, k.now, 0.05, 0.045, { lp: 6000 }); }
  function sfxDrill() { const k = kit(); if (!k) return; k.noise(k.now, 0.2, 0.09, 'bandpass', 2600 + Math.random() * 600, { Q: 7 }); k.tone('sawtooth', 190 + Math.random() * 30, k.now, 0.2, 0.03, { lp: 900 }); }
  function sfxAlarm(i) { const k = kit(); if (!k) return; k.tone('square', i % 2 ? 880 : 1175, k.now, 0.26, 0.03, { lp: 3200 }); }
  function sfxShutter() { const k = kit(); if (!k) return; for (let i = 0; i < 14; i++) k.noise(k.now + i * 0.07, 0.05, 0.12, 'bandpass', 900 + (i % 3) * 300, { Q: 3 }); }
  function sfxCam() { const k = kit(); if (!k) return; k.noise(k.now, 0.04, 0.3, 'highpass', 3000); k.tone('sine', 2400, k.now + 0.05, 0.12, 0.05, { to: 900 }); }
  function sfxCash() { const k = kit(); if (!k) return; [1568, 2093, 2637].forEach((f, i) => k.tone('triangle', f, k.now + i * 0.06, 0.12, 0.08)); }
  function sfxPunch() { const k = kit(); if (!k) return; k.noise(k.now, 0.08, 0.3, 'lowpass', 700); k.tone('sine', 130, k.now, 0.1, 0.18, { to: 60 }); }
  function sfxSkull() { if (PG.audio && PG.audio.yap) PG.audio.yap('MWAHAHAHA!', { base: 72 }); }

  // ================= state & save =================
  let M = null, H = null;
  function fresh() {
    return {
      phones: [], done: new Set(), run: null, call: null, quietT: 3, ringT: 1.5, assignT: 0, odd: null, oddN: 0, getaway: null,
      ghosts: [], garage: null, shutter: 0, objT: -1, deferBig: null, deferT: 0, reactT: 0, react: null, reactMood: 0,
      notified: new Set(), introT: 3.5, hushT: 0, signs: [],
    };
  }
  const live = () => X.active && !!M;
  function sv() { const s = X.save || (X.save = {}); return s.missions || (s.missions = { done: [], odd: 0, earned: 0 }); }
  function persist() { const s = sv(); s.done = Array.from(M.done); s.odd = M.oddN; if (X.persist) X.persist(); }

  // ================= helpers: world, spawning =================
  const canShoot = () => X.has('weapons') && typeof X.giveWeapon === 'function' && !!X.WEAPONS;
  const isGun = id => !!id && id !== 'fists' && !!X.WEAPONS && !!X.WEAPONS[id] && X.WEAPONS[id].kind !== 'melee';
  const wantedLevel = () => Math.round(P.wanted || 0);
  function setWanted(R, n) {
    if (X.police && X.police.setWanted) X.police.setWanted(n); else { P.wanted = n; if (R) R.fakeWanted = true; }
  }
  const pos = () => X.playerPos();
  // X.randomSidewalkPoint snaps to any side of the block it lands in, so check the distance it really ended up at.
  function sidewalkAround(x, y, rMin, rMax) {
    for (let k = 0; k < 8; k++) {
      const q = X.randomSidewalkPoint(x, y, rMin, rMax);
      if (q && Math.hypot(q.x - x, q.y - y) <= rMax + 6 && Math.hypot(q.x - x, q.y - y) >= rMin * 0.7) return q;
    }
    return null;
  }
  const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);
  function pointAround(dMin, dMax, f) {
    f = f || X.focus(); const C = X.city;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * TAU, r = rand(dMin, dMax), x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
      if (x > 30 && y > 30 && x < C.W - 30 && y < C.H - 30) return { x, y };
    }
    return { x: cl(C.W - f.x, 40, C.W - 40), y: cl(C.H - f.y, 40, C.H - 40) };
  }
  // A spot against the kerb of the road nearest to (x, y), facing that side's traffic. inset > 0 is on the
  // road (a stopping place), -0.55 is half on the pavement like the city's parked cars.
  function kerbSpot(x, y, len, inset) {
    const C = X.city, r = X.nearestRoadPoint(x, y);
    if (r.horiz) {
      const j = r.idx, side = Math.sign(y - C.ys[j]) || 1;
      let px = cl(x, 14, C.W - 14);
      for (let i = 0; i < C.xs.length; i++) { const lim = C.wx[i] / 2 + len / 2 + 5; if (Math.abs(px - C.xs[i]) < lim) px = C.xs[i] + (px >= C.xs[i] ? 1 : -1) * lim; }
      return { x: px, y: C.ys[j] + side * (C.wy[j] / 2 - inset), th: side > 0 ? 0 : Math.PI, nx: 0, ny: side };
    }
    const i = r.idx, side = Math.sign(x - C.xs[i]) || 1;
    let py = cl(y, 14, C.H - 14);
    for (let j = 0; j < C.ys.length; j++) { const lim = C.wy[j] / 2 + len / 2 + 5; if (Math.abs(py - C.ys[j]) < lim) py = C.ys[j] + (py >= C.ys[j] ? 1 : -1) * lim; }
    return { x: C.xs[i] + side * (C.wx[i] / 2 - inset), y: py, th: side > 0 ? -Math.PI / 2 : Math.PI / 2, nx: side, ny: 0 };
  }
  // Street lamps bucketed in 16 m cells (the city has well over a thousand of them).
  let lampGrid = null, lampCity = null;
  function lampsNear(x, y) {
    if (lampCity !== X.city) {
      lampCity = X.city; lampGrid = new Map();
      for (const l of X.city.lamps) { const k = Math.floor(l.x / 16) * 4096 + Math.floor(l.y / 16); let a = lampGrid.get(k); if (!a) lampGrid.set(k, a = []); a.push(l); }
    }
    const out = [], cx = Math.floor(x / 16), cy = Math.floor(y / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = lampGrid.get((cx + i) * 4096 + cy + j); if (a) for (const l of a) out.push(l); }
    return out;
  }
  // Every place a building door can be (X.buildingDoor uses side midpoints), bucketed the same way.
  let doorGrid = null, doorCity = null;
  function doorsNear(x, y) {
    if (doorCity !== X.city) {
      doorCity = X.city; doorGrid = new Map();
      const add = (dx, dy) => { const k = Math.floor(dx / 16) * 4096 + Math.floor(dy / 16); let a = doorGrid.get(k); if (!a) doorGrid.set(k, a = []); a.push({ x: dx, y: dy }); };
      for (const b of X.city.buildings) {
        if (b.deco) continue;
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        add(cx, b.y0 - 0.9); add(cx, b.y1 + 0.9); add(b.x0 - 0.9, cy); add(b.x1 + 0.9, cy);
      }
    }
    const out = [], cx = Math.floor(x / 16), cy = Math.floor(y / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = doorGrid.get((cx + i) * 4096 + cy + j); if (a) for (const d of a) out.push(d); }
    return out;
  }
  function bayFree(q, len, wid, ign) {
    const poly = PG.obb(q.x, q.y, len, wid, q.th);
    for (const s of PG.cityNear(X.city, q.x, q.y, len)) if (PG.overlap(poly, s.poly)) return false;
    for (const c of X.cars) if (!c.removed && c !== ign && Math.abs(c.x - q.x) < 9 && Math.abs(c.y - q.y) < 9 && PG.overlap(poly, X.carPoly(c))) return false;
    for (const l of lampsNear(q.x, q.y)) if (Math.abs(l.x - q.x) < len / 2 + 0.4 && Math.abs(l.y - q.y) < len / 2 + 0.4 && PG.pointInPoly(l, poly)) return false;
    return true;
  }
  // A mission car parked at the kerb near (x, y); slides along the street until it fits.
  function parkAt(model, x, y, o) {
    const m = X.MODELS[model] || X.MODELS.hatch, len = m.len, wid = m.wid;
    const s0 = kerbSpot(x, y, len, -0.55), ax = Math.cos(s0.th), ay = Math.sin(s0.th);
    for (let k = 0; k < 18; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3.2;
      const s = kerbSpot(s0.x + ax * off, s0.y + ay * off, len, -0.55);
      if (X.roadAt(s.x, s.y)) continue;   // a crossing street
      if (!bayFree(s, len + 0.3, wid + 0.2)) continue;
      return X.makeCar(model, s.x, s.y, s.th, Object.assign({ ctrl: 'parked', owner: 'missions', keep: true }, o));
    }
    return null;
  }
  function trafficCar(model, f, rMin, rMax, o) {
    for (let k = 0; k < 14; k++) {
      const c = X.spawnTraffic(f.x, f.y, rMin + k * 8, rMax + k * 14, model, Object.assign({ owner: 'missions', keep: true }, o));
      if (c) return c;
    }
    return null;
  }
  // A building (not a landmark) with a pavement door rMin..rMax from f: {b, door}.
  function doorAround(dMin, dMax, f, filter) {
    f = f || X.focus();
    const list = [];
    for (const b of X.city.buildings) {
      if (b.deco || b.place) continue;
      const d = Math.hypot((b.x0 + b.x1) / 2 - f.x, (b.y0 + b.y1) / 2 - f.y);
      if (d < dMin || d > dMax || (filter && !filter(b))) continue;
      list.push(b);
    }
    for (let k = 0; k < 16 && list.length; k++) {
      const b = pick(list), door = X.buildingDoor(b, Math.floor(Math.random() * 4));
      if (door && !X.blocked(door.x, door.y, 0.4) && !X.blocked(door.x + door.nx * 2, door.y + door.ny * 2, 0.5)) return { b, door };
    }
    return null;
  }
  // The edge of the street outside a door.
  function streetOf(d) {
    for (let k = 0.5; k < 30; k += 0.5) { const x = d.x + d.nx * k, y = d.y + d.ny * k; if (X.roadAt(x, y)) return { x, y, nx: d.nx, ny: d.ny }; }
    const r = X.nearestRoadPoint(d.x, d.y); return { x: r.x, y: r.y, nx: d.nx, ny: d.ny };
  }
  function zoneAt(d, label, r) { const st = streetOf(d), k = kerbSpot(st.x + st.nx * 2.5, st.y + st.ny * 2.5, 5, 1.8); return { x: k.x, y: k.y, r: r || 4.2, label }; }
  function routeLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; }
  // Waypoints along the road grid, nudged into the right-hand lane.
  function laneRoute(x0, y0, x1, y1) {
    const pts = X.route(x0, y0, x1, y1), out = [];
    if (pts.length > 1 && !X.roadAt(pts[pts.length - 1].x, pts[pts.length - 1].y)) pts.pop();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], pr = pts[i - 1];
      let dx = 1, dy = 0;
      if (b) { dx = b.x - a.x; dy = b.y - a.y; } else if (pr) { dx = a.x - pr.x; dy = a.y - pr.y; }
      const L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      out.push({ x: a.x - dy / L * 2.2, y: a.y + dx / L * 2.2 });
    }
    return out;
  }
  // A point well away from the player, for anyone running or driving off.
  function fleePoint(x, y) {
    const C = X.city, p = pos(), dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1;
    const a = Math.atan2(dy / d, dx / d) + rand(-0.8, 0.8), r = rand(260, 420);
    return { x: cl(x + Math.cos(a) * r, 40, C.W - 40), y: cl(y + Math.sin(a) * r, 40, C.H - 40) };
  }
  // Parking bays for n cars in an open block (plaza or park) or, failing that, along a kerb.
  function findLot(f, dMin, dMax, n, gap) {
    const C = X.city, bw = gap || 2.7, rowL = 5.0, cands = [];
    for (const b of C.blocks) {
      if (b.kind === 'city') continue;
      const d = Math.hypot((b.x0 + b.x1) / 2 - f.x, (b.y0 + b.y1) / 2 - f.y);
      if (d >= dMin && d <= dMax) cands.push(b);
    }
    cands.sort(() => Math.random() - 0.5);
    const perRow = Math.ceil(n / 2), W = perRow * bw;
    for (const b of cands) {
      const ix0 = b.x0 + 6, ix1 = b.x1 - 6, iy0 = b.y0 + 6, iy1 = b.y1 - 6;
      if (ix1 - ix0 < W + 2 || iy1 - iy0 < rowL * 2 + 3) continue;
      for (let tries = 0; tries < 40; tries++) {
        const x0 = rand(ix0, ix1 - W), yc = rand(iy0 + rowL + 0.5, iy1 - rowL - 0.5), bays = [];
        for (let k = 0; k < n; k++) {
          const row = k % 2, col = Math.floor(k / 2);
          bays.push({ x: x0 + bw * (col + 0.5), y: yc + (row ? 1 : -1) * (rowL / 2 + 0.15), th: row ? Math.PI / 2 : -Math.PI / 2 });
        }
        if (bays.every(q => bayFree(q, 4.9, 2.1))) return { kind: 'plaza', bays, bw, rowL, x0: x0 - 0.5, x1: x0 + W + 0.5, y0: yc - rowL - 0.6, y1: yc + rowL + 0.6, cx: x0 + W / 2, cy: yc };
      }
    }
    for (let tries = 0; tries < 30; tries++) {
      const pt = pointAround(dMin, dMax, f), s0 = kerbSpot(pt.x, pt.y, 5, -0.55), ax = Math.cos(s0.th), ay = Math.sin(s0.th), bays = [];
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * 5.8, q = { x: s0.x + ax * o, y: s0.y + ay * o, th: s0.th };
        if (X.roadAt(q.x, q.y) || !bayFree(q, 4.9, 2.1)) break;
        bays.push(q);
      }
      if (bays.length === n) {
        const xs = bays.map(q => q.x), ys = bays.map(q => q.y);
        return { kind: 'kerb', bays, bw: 5.8, rowL: 2.4, x0: Math.min(...xs) - 3, x1: Math.max(...xs) + 3, y0: Math.min(...ys) - 3, y1: Math.max(...ys) + 3, cx: s0.x, cy: s0.y };
      }
    }
    return null;
  }
  function lotCars(R, lot, models, o) {
    const out = [];
    for (const q of lot.bays) {
      const c = X.makeCar(pick(models), q.x, q.y, q.th + (Math.random() < 0.5 ? 0 : Math.PI) * (lot.kind === 'plaza' ? 1 : 0), Object.assign({ ctrl: 'parked', owner: 'missions', keep: true }, o));
      out.push(c); R.cars.push(c);
    }
    return out;
  }

  // ================= people the missions own (ai.owner 'missions') =================
  const LOOKS = {
    suit: (shirt, tie) => ({ skin: pick(['#f1c7a1', '#e0ac7e', '#f6d7bd']), hair: pick(['#3a2a1e', '#8a8a8a', '#b9a47a']), hairStyle: 'short', shirt: shirt || '#2b2f3a', pants: shirt || '#2b2f3a', hat: null, outfit: 'suit', tie: tie || '#b0151a', acc: 'briefcase', scale: 1.02 }),
    goon: () => ({ skin: pick(['#f1c7a1', '#c68a5c', '#8d5a3b', '#e0ac7e']), hair: '#111', hairStyle: pick(['buzz', 'bald']), shirt: '#121316', pants: '#121316', hat: null, outfit: 'suit', tie: '#121316', scale: 1.12 }),
    guard: () => ({ skin: pick(['#f1c7a1', '#c68a5c', '#e0ac7e', '#8d5a3b']), hair: '#2a2420', hairStyle: 'short', shirt: '#5f6b5a', pants: '#2b2f2a', hat: '#2b2f2a', hatType: 'cap', outfit: 'guard', scale: 1.05 }),
    mafia: () => ({ skin: pick(['#f1c7a1', '#e0ac7e', '#c68a5c']), hair: '#1b1612', hairStyle: pick(['short', 'bald']), shirt: pick(['#6b4a2a', '#5a3d22', '#7a5530']), pants: '#3b2716', hat: '#2a1d12', hatType: 'fedora', outfit: 'suit', tie: '#e8b04a', scale: 1.05 }),
    russ: () => ({ skin: pick(['#f1c7a1', '#e0ac7e', '#f6d7bd']), hair: pick(['#b9a47a', '#3a2a1e', '#d8c08a']), hairStyle: pick(['short', 'pony']), shirt: '#d0261d', pants: '#c3241c', hat: '#d0261d', hatType: 'russ', outfit: 'overalls', scale: 0.98 }),
    metal: () => ({ skin: pick(['#f1c7a1', '#f6d7bd', '#e0ac7e']), hair: '#0d0c0c', hairStyle: 'long', shirt: '#141416', pants: '#1b1b1f', hat: null, outfit: 'metal', scale: rand(0.98, 1.08) }),
    inspector: () => ({ skin: '#f1c7a1', hair: '#8a8a8a', hairStyle: 'bun', shirt: '#2f4a7a', pants: '#1f2a44', hat: '#1f2a44', hatType: 'cap', outfit: '', scale: 0.96 }),
  };
  function addPed(R, o, ai) {
    const p = X.makePed(o);
    p.ai = Object.assign({ owner: 'missions', role: 'guard', st: 'idle', t: 0, cd: rand(0.4, 1.2), strafe: 1, strafeT: 1, face: p.th, stuck: 0, side: 1 }, ai);
    R.peds.push(p); R.pedSet.add(p);
    return p;
  }
  let shoutT = -9;
  function shout(p, text, color) {
    if (X.time - shoutT < 0.8) return;
    shoutT = X.time;
    X.floatText(p.x, p.y - 1.1, text, color || '#ffffff', { life: 1.5, size: 15 });
  }
  function alarm(R) {
    if (!R || R.alarm || R.over) return;
    R.alarm = true;
    for (const p of R.peds) if (!p.dead && p.ai && p.ai.owner === 'missions' && p.ai.role === 'guard' && p.ai.st === 'idle') { p.ai.st = 'attack'; p.ai.cd = rand(0.2, 0.7); }
    const g = R.peds.find(p => !p.dead && p.ai && p.ai.role === 'guard');
    if (g) shout(g, pick(['GET HIM!', 'FREEZE!', 'COVER THE BOSS!', 'HEY! YOU!']), '#ff6a5a');
    if (R.def.onAlarm) R.def.onAlarm(R);
  }
  // Thugs within earshot of a friend getting hurt join the fight.
  function rile(R, x, y) {
    for (const p of R.peds) if (!p.dead && p.ai && p.ai.owner === 'missions' && p.ai.role === 'thug' && p.ai.st === 'idle' && Math.abs(p.x - x) < 18 && Math.abs(p.y - y) < 18) p.ai.st = 'attack';
  }
  function pedTick(R, p, dt) {
    if (p.removed) return;
    if (p.dead) { if (p.knock > 0 || p.speed > 0.05) X.movePed(p, dt, 0, 0); return; }
    const a = p.ai;
    if (!a || a.owner !== 'missions' || p.car || p.hidden) return;
    a.t += dt; a.cd -= dt;
    if (p.knock > 0) { X.movePed(p, dt, 0, 0); return; }
    if (a.role === 'target') targetAI(R, p, a, dt);
    else if (a.role === 'flee') fleeAI(p, a, dt, a.speed || 5.2);
    else fightAI(R, p, a, dt);
  }
  function fightAI(R, p, a, dt) {
    const pp = P.car || P.ped, dx = pp.x - p.x, dy = pp.y - p.y, d = Math.hypot(dx, dy) || 0.01;
    if (a.st === 'idle') {
      const aggro = a.role === 'thug' && d < (a.aggro || 13);
      if (P.state === 'play' && !X.scene && (aggro || (d < 6.5 && !P.car && isGun(P.weapon)) || (a.role === 'guard' && d < (a.notice || 0)))) {
        if (a.role === 'guard') alarm(R); a.st = 'attack'; a.cd = rand(0.3, 0.8);
        if (a.role === 'thug') shout(p, pick(['OI!', 'WRONG STREET!', 'YOU WANT SOME?']), '#ffb02e');
      }
      if (a.role === 'thug' && a.wander) {   // shuffle about the corner
        a.wt = (a.wt || 0) - dt;
        if (a.wt <= 0) { a.wt = rand(1.5, 4); a.wx = a.homeX + rand(-2.5, 2.5); a.wy = a.homeY + rand(-2.5, 2.5); }
        const wx = a.wx - p.x, wy = a.wy - p.y, wd = Math.hypot(wx, wy);
        if (wd > 0.4) { X.movePed(p, dt, wx / wd * 1.3, wy / wd * 1.3); p.th += wrap(Math.atan2(wy, wx) - p.th) * Math.min(1, dt * 5); return; }
      }
      X.movePed(p, dt, 0, 0);
      p.th += wrap(a.face - p.th) * Math.min(1, dt * 4);
      return;
    }
    if (P.state !== 'play' || d > 85 || X.scene) { X.movePed(p, dt, 0, 0); if (P.state !== 'play') a.st = 'idle'; return; }
    if (canShoot() && isGun(p.weapon)) {
      let mx = 0, my = 0;
      if (d > 15) { mx = dx / d; my = dy / d; } else if (d < 6) { mx = -dx / d * 0.7; my = -dy / d * 0.7; }
      a.strafeT -= dt; if (a.strafeT <= 0) { a.strafeT = rand(0.7, 1.8); a.strafe = Math.random() < 0.5 ? -1 : 1; }
      mx += -dy / d * a.strafe * 0.55; my += dx / d * a.strafe * 0.55;
      const L = Math.hypot(mx, my) || 1;
      X.movePed(p, dt, mx / L * 4.3, my / L * 4.3);
      p.th = Math.atan2(dy, dx); p.aim = p.th;
      if (d < 28 && a.cd <= 0) { a.cd = rand(0.05, 0.25); if (X.lineOfSight(p, pp)) X.fireWeapon(p, p.weapon, p.th); }
      return;
    }
    const reach = P.car ? P.car.len / 2 + 0.9 : 1.1;
    if (d > reach * 0.85) X.movePed(p, dt, dx / d * 5.3, dy / d * 5.3); else X.movePed(p, dt, 0, 0);
    p.th += wrap(Math.atan2(dy, dx) - p.th) * Math.min(1, dt * 12);
    if (a.cd <= 0 && d < reach + 0.15) {
      a.cd = a.role === 'thug' ? rand(0.9, 1.4) : rand(0.7, 1.0);
      if (P.car) X.damageCar(P.car, 14, p, 'melee');
      else { X.damagePed(P.ped, a.role === 'thug' ? 5 : 7, p, 'melee'); P.ped.vx += dx / d * 2.4; P.ped.vy += dy / d * 2.4; }
      if (dist(pos(), p.x, p.y) < 30) sfxPunch();
    }
  }
  function fleeAI(p, a, dt, speed) {
    const pp = pos();
    let mx = p.x - pp.x, my = p.y - pp.y;
    const d = Math.hypot(mx, my) || 1; mx /= d; my /= d;
    if (a.goal) { const gx = a.goal.x - p.x, gy = a.goal.y - p.y, gd = Math.hypot(gx, gy) || 1; mx = mx * 0.4 + gx / gd; my = my * 0.4 + gy / gd; }
    if (p.speed < 0.8 && a.t > 0.5) { a.stuck += dt; if (a.stuck > 0.6) { a.stuck = 0; a.side = -a.side; a.dodge = 1.2; } } else a.stuck = 0;
    if (a.dodge > 0) { a.dodge -= dt; const ox = -my * a.side, oy = mx * a.side; mx = mx * 0.3 + ox; my = my * 0.3 + oy; }
    const L = Math.hypot(mx, my) || 1;
    X.movePed(p, dt, mx / L * speed, my / L * speed);
    p.th += wrap(Math.atan2(my, mx) - p.th) * Math.min(1, dt * 10);
  }
  function targetAI(R, p, a, dt) {
    const c = R.data.car;
    if (a.st === 'idle') {
      X.movePed(p, dt, 0, 0);
      p.th += wrap(a.face - p.th) * Math.min(1, dt * 3);
      if (R.alarm) {
        a.st = c && !c.wrecked && !c.removed && !c.driver && !c.npcDriver && P.car !== c ? 'tocar' : 'flee'; a.tt = 0;
        shout(p, pick(['HELP!', 'NOT THE FACE!', 'MY PREMIUMS!', 'CALL MY LAWYER!']), '#ffd23a');
      }
      return;
    }
    if (a.st === 'tocar') {
      a.tt += dt;
      if (!c || c.wrecked || c.removed || c.driver || c.npcDriver || P.car === c || (P.entering && P.entering.car === c)) { a.st = 'flee'; return; }
      const s = X.doorSpot(c, -1) || { x: c.x, y: c.y }, dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < 0.8 || a.tt > 7) { board(R, p, c); return; }
      X.movePed(p, dt, dx / d * 6, dy / d * 6); p.th = Math.atan2(dy, dx);
      return;
    }
    fleeAI(p, a, dt, 5.6);
  }
  // The target gets into his car and drives off; carControl calls our drive() every physics frame.
  function board(R, p, c) {
    p.car = c; p.hidden = true; p.vx = p.vy = 0; c.driver = p; c.npcDriver = null;
    X.toPhys(c); c.owner = 'missions'; c.keep = true;
    const f = fleePoint(c.x, c.y);
    R.data.nav = { pts: laneRoute(c.x, c.y, f.x, f.y), i: 0, speed: 17, hand: true };
    c.ai = { owner: 'missions', drive: (car, dt) => fleeDrive(R, car, dt) };
    p.ai.st = 'drive'; R.armour = [c];
    if (dist(pos(), c.x, c.y) < 40) PG.audio.honk(0);
  }

  // ================= AI driving =================
  function driveRoute(c, dt, nav) {
    const pts = nav.pts;
    if (!pts || !pts.length) { nav.done = true; return { rev: c.speed > 0.5 ? 1 : 0 }; }
    let w = pts[Math.min(nav.i, pts.length - 1)];
    while (nav.i < pts.length - 1 && Math.hypot(w.x - c.x, w.y - c.y) < 6 + Math.abs(c.speed) * 0.25) w = pts[++nav.i];
    const d = Math.hypot(w.x - c.x, w.y - c.y), nx = pts[nav.i + 1];
    let sp = nav.speed;
    if (nx) {
      const a1 = Math.atan2(w.y - c.y, w.x - c.x), a2 = Math.atan2(nx.y - w.y, nx.x - w.x), turn = Math.abs(wrap(a2 - a1));
      if (turn > 0.6 && d < 8 + Math.abs(c.speed) * 1.4) sp = Math.min(sp, 7 + (1 - turn / Math.PI) * 5);
    }
    nav.done = nav.i >= pts.length - 1 && d < 7;
    return X.steerCtl(c, w.x, w.y, { speed: sp, dt, handbrake: nav.hand, brakeDist: nav.i >= pts.length - 1 ? 12 : 0 });
  }
  function fleeDrive(R, c, dt) {
    const nav = R.data.nav;
    if (!nav || nav.done) { const f = fleePoint(c.x, c.y); R.data.nav = { pts: laneRoute(c.x, c.y, f.x, f.y), i: 0, speed: nav ? nav.speed : 17, hand: true }; }
    return driveRoute(c, dt, R.data.nav);
  }

  // ================= the mission framework =================
  const DEFS = [], BY = {};
  function mission(d) { d.req = d.req || []; if (d.story == null) d.story = true; DEFS.push(d); BY[d.id] = d; return d; }
  function begin(def, phone, brief) {
    if (!live() || M.run) return null;
    const R = {
      def, id: def.id, title: def.title, tier: def.tier, reward: def.reward, p: def.p || {}, stages: def.stages, stage: -1, st: 0, t: 0,
      timer: null, timerMax: 0, onTimeout: null, text: '', sub: '', count: '', bar: null, barLabel: '', cars: [], peds: [], pedSet: new Set(),
      items: [], guard: [], data: {}, over: false, brief: !!brief, phone, district: '', alarm: false, fakeWanted: false, armour: null,
    };
    M.run = R;
    let ok = false;
    try { ok = def.setup(R) !== false; } catch (e) { console.error('[gta] missions.' + def.id + ' setup failed:', e); ok = false; }
    if (!ok) { cleanup(R); M.run = null; return null; }
    if (!R.district) R.district = X.districtAt(pos().x, pos().y);
    X.emit('missionStart', { id: R.id, title: R.title });
    goStage(R, 0);
    if (!R.brief) announce(R);
    return R;
  }
  function announce(R) {
    if (R.over) return;
    X.big(R.title.toUpperCase(), TIER[R.tier] ? TIER[R.tier].color : '#ffd23a', 2000);
    X.pager(R.sub || R.text, 5500);
    if (R.def.onGo) R.def.onGo(R);
  }
  function goStage(R, i) {
    if (R.over) return;
    const s = R.stages[i];
    if (!s) { win(R); return; }
    R.stage = i; R.st = 0; R.count = ''; R.bar = null; R.barLabel = '';
    R.timer = null; R.onTimeout = null;
    if (s.timer != null) { R.timer = R.timerMax = typeof s.timer === 'function' ? s.timer(R) : s.timer; R.onTimeout = s.timeout || null; }
    const txt = () => typeof s.text === 'function' ? s.text(R) : s.text || '';
    R.text = txt();
    if (s.enter) s.enter(R);
    if (R.over) return;
    R.text = txt();
    if (!R.brief && i > 0) X.pager(R.text, 5000);
  }
  const next = R => goStage(R, R.stage + 1);
  function win(R) {
    if (!R || R.over) return;
    R.over = true;
    const bonus = R.def.bonus ? R.def.bonus(R) || 0 : 0, total = R.reward + bonus, p = pos();
    if (total > 0) X.money(total, 'mission', p.x, p.y);
    const mm = Math.floor(R.t / 60), ss = String(Math.floor(R.t % 60)).padStart(2, '0');
    X.big('MISSION PASSED!', '#7dff9a', 3800, fmt(total) + (bonus ? ' incl. ' + fmt(bonus) + ' bonus' : '') + ' · ' + mm + ':' + ss);
    PG.audio.fanfare();
    PG.burst(p.x, p.y, 'confetti', 50, 7, 2, 0.3, ['#7dff9a', '#ffd23a', '#ffffff', '#4fdc6a']);
    R.passed = true;
    if (R.def.story) M.done.add(R.id);
    if (R.def.odd) { M.oddN++; M.odd = null; }
    sv().earned = (sv().earned || 0) + total;
    persist();
    finish(R);
    X.emit('missionPassed', { id: R.id, reward: total });
    M.react = R.def.after ? R.def.after(R) : [pick(PASS_LINES)]; M.reactMood = 0.05; M.reactT = 2.4;
    M.quietT = 7;
  }
  function lose(R, reason) {
    if (!R || R.over) return;
    R.over = true;
    if (P.state === 'play') { X.big('MISSION FAILED!', '#e8402f', 3400, reason); PG.audio.trombone(); }
    else { M.deferBig = reason; M.deferT = 4.4; }
    finish(R);
    X.emit('missionFailed', { id: R.id, reason });
    if (R.def.odd) M.odd = null;
    M.notified.delete(R.id);
    M.react = [pick(FAIL_LINES)]; M.reactMood = 0.7; M.reactT = P.state === 'play' ? 2.8 : 6.5;
    M.quietT = 9;
  }
  function finish(R) {
    if (R.def.end) { try { R.def.end(R); } catch (e) { console.error('[gta] missions.' + R.id + ' end failed:', e); } }
    cleanup(R);
    if (R.fakeWanted && !X.police) P.wanted = 0;
    if (M.call && M.call.run === R) closeCall();
    M.run = null;
  }
  function cleanup(R) {
    for (const c of R.cars) {
      if (c.removed) continue;
      if (c.ai && c.ai.owner === 'missions') c.ai = null;
      if (c.driver && !c.driver.isPlayer && R.pedSet.has(c.driver)) {   // the target at the wheel becomes an ordinary driver
        const d = c.driver; c.driver = null; d.car = null; d.removed = true; c.npcDriver = { look: d.look, team: 'civ', extra: 0 };
      }
      if (c === M.getaway) continue;
      if (c.owner === 'missions') c.owner = null;
      c.keep = false;
    }
    for (const p of R.peds) if (!p.removed && p.ai && p.ai.owner === 'missions') p.ai = null;
    R.items.length = 0;
  }
  function guardCar(R, c, name, minHp, until) { R.guard.push({ c, name, minHp: minHp || 0, until: until == null ? 99 : until }); }
  function runTick(R, dt) {
    R.sub = ''; R.bar = null;   // stages set these every tick they apply
    for (let i = 0; i < R.peds.length; i++) pedTick(R, R.peds[i], dt);
    itemsTick(R, dt);
    if (P.state !== 'play') return;
    if (!R.brief && R.timer != null) {
      R.timer -= dt;
      if (R.timer <= 0) {
        R.timer = 0;
        const f = R.onTimeout; R.onTimeout = null;
        if (f) f(R); else lose(R, 'Out of time.');
        if (R.over) return;
        if (R.timer <= 0) R.timer = null;
      }
    }
    if (R.brief) return;   // the world waits while Trond talks
    R.t += dt; R.st += dt;
    for (const g of R.guard) {
      const c = g.c;
      if (R.stage >= g.until || c.removed) continue;
      if (c.wrecked) return lose(R, `The ${g.name} is wrecked.`);
      if (c.burning > 0) return lose(R, `The ${g.name} is on fire!`);
      if (g.minHp && c.hp < c.maxHp * g.minHp) return lose(R, `Too many dents in the ${g.name}. Trond wanted it mint.`);
      if (g.minHp && P.car === c) { R.bar = c.hp / c.maxHp; R.barLabel = 'condition'; }
    }
    const s = R.stages[R.stage];
    if (s && s.tick) s.tick(R, dt);
    if (!R.over && R.def.tick) R.def.tick(R, dt);
  }

  // ================= pickups the missions drop (cash bags, the skull crate) =================
  function addItem(R, kind, x, y, o) { const it = Object.assign({ kind, x, y, vx: 0, vy: 0, t: 0, amount: 0, taken: false, ph: Math.random() * TAU }, o); R.items.push(it); return it; }
  function itemsTick(R, dt) {
    const p = pos(), car = P.car;
    for (const it of R.items) {
      if (it.taken) continue;
      it.t += dt;
      if (it.vx || it.vy) {
        const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt;
        if (X.blocked(nx, ny, 0.25)) { it.vx *= -0.3; it.vy *= -0.3; } else { it.x = nx; it.y = ny; }
        const k = Math.exp(-3.5 * dt); it.vx *= k; it.vy *= k;
        if (Math.abs(it.vx) + Math.abs(it.vy) < 0.05) it.vx = it.vy = 0;
      }
      if (P.state !== 'play' || it.t < 0.5 || P.entering) continue;
      if (it.kind === 'skull' && car && !it.carOk) continue;
      const r = car ? car.len / 2 + 0.5 : 1.1;
      if (Math.abs(it.x - p.x) > r || Math.abs(it.y - p.y) > r || Math.hypot(it.x - p.x, it.y - p.y) > r) continue;
      it.taken = true;
      if (it.kind === 'bag') { X.addLoot(it.amount, it.x, it.y); sfxCash(); PG.burst(it.x, it.y, 'confetti', 8, 3, 0.6, 0.2, ['#5fdc6e', '#ffd23a']); }
      if (R.def.collect) R.def.collect(R, it);
    }
  }
  function spill(R, x, y, dir, n, lo, hi) {
    for (let k = 0; k < n; k++) {
      const a = dir + rand(-0.9, 0.9), s = rand(3, 7);
      addItem(R, 'bag', x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), { vx: Math.cos(a) * s, vy: Math.sin(a) * s, amount: Math.round(rand(lo, hi) / 10) * 10 });
    }
  }
  const bagsLeft = R => R.items.reduce((n, it) => n + (it.kind === 'bag' && !it.taken ? 1 : 0), 0);
  function bagMark(R, add) {
    const p = pos(); let best = null, bd = Infinity;
    for (const it of R.items) if (it.kind === 'bag' && !it.taken) { const d = Math.hypot(it.x - p.x, it.y - p.y); if (d < bd) { bd = d; best = it; } }
    if (best) add(best.x, best.y, '#5fdc6e', 'Cash', 1.1);
  }

  // ================= stage factories =================
  function stGetIn(key, text, o) {
    o = o || {};
    return {
      text,
      tick(R) { if (P.car === R.data[key]) { if (o.onIn) o.onIn(R); next(R); } },
      marks(R, add) { const c = R.data[key]; if (c && !c.removed) add(c.x, c.y, o.color || '#ffd23a', o.label || 'Steal', Math.max(2.6, c.len / 2 + 0.9)); },
    };
  }
  // Drive R.data[key] into a zone and stop; at the garage the car rolls in, otherwise it stays parked.
  function stDeliver(key, dest, text, o) {
    o = o || {};
    return {
      text,
      enter(R) { R.data.dz = typeof dest === 'function' ? dest(R) : dest === 'garage' ? M.garage.zone : R.data[dest]; R.data.exitT = 0; },
      tick(R, dt) {
        const c = R.data[key], z = R.data.dz;
        if (!c || c.removed || !z) return;
        const inZ = Math.hypot(c.x - z.x, c.y - z.y) < z.r;
        if (P.car !== c && !inZ) { R.sub = 'Get back in the ' + (o.name || c.model.name); return; }
        if (!inZ) return;
        if (z.garage && X.police && wantedLevel() >= 2) { R.sub = 'Lose the cops first. Trond keeps the door shut at 2+ stars.'; return; }
        if (Math.abs(c.speed) > 1.5) { R.sub = 'Stop in the marker'; return; }
        if (P.car === c) {
          R.data.exitT -= dt;
          if (R.data.exitT <= 0) { R.data.exitT = 0.8; X.exitCar(); }
          if (P.car === c) { R.sub = 'Get out of the car'; return; }
        }
        if (z.garage) swallow(c);
        else if (o.keep) {   // left for later: it tucks itself in against the kerb, out of the traffic
          c.owner = 'missions'; c.keep = true;
          const k0 = kerbSpot(c.x, c.y, c.len, -0.35), ax = Math.cos(k0.th), ay = Math.sin(k0.th);
          for (const off of [0, 2, -2, 4, -4, 6, -6]) {
            const k = kerbSpot(k0.x + ax * off, k0.y + ay * off, c.len, -0.35);
            if (Math.hypot(k.x - c.x, k.y - c.y) > 8 || X.roadAt(k.x, k.y) || !bayFree(k, c.len, c.wid, c)) continue;
            M.slide = { c, t: 0, x0: c.x, y0: c.y, th0: c.th, x1: k.x, y1: k.y, th1: Math.abs(wrap(k.th - c.th)) < Math.PI / 2 ? k.th : k.th + Math.PI };
            break;
          }
        }
        if (o.done) o.done(R, c);
        next(R);
      },
      marks(R, add) {
        const c = R.data[key], z = R.data.dz;
        if (!c || c.removed || !z) return;
        if (P.car !== c && Math.hypot(c.x - z.x, c.y - z.y) >= z.r) add(c.x, c.y, '#ffd23a', 'Get in', c.len / 2 + 0.9);
        else add(z.x, z.y, '#7dff9a', z.label, z.r);
      },
    };
  }
  // Stand on a spot (on foot) for a moment.
  function stVisit(spot, text, o) {
    o = o || {};
    return {
      text,
      enter(R) { R.data.look = 0; },
      tick(R, dt) {
        const s = typeof spot === 'function' ? spot(R) : spot; if (!s) return;
        const near = !P.car && Math.hypot(P.ped.x - s.x, P.ped.y - s.y) < (s.r || 2.2);
        R.data.look = near ? R.data.look + dt : Math.max(0, R.data.look - dt);
        const need = o.hold || 1.2;
        if (R.data.look > 0) { R.bar = R.data.look / need; R.barLabel = o.barLabel || 'casing'; }
        if (P.car && Math.hypot(P.car.x - s.x, P.car.y - s.y) < 12) R.sub = 'Get out and walk up to it';
        if (R.data.look >= need) { if (o.done) o.done(R, s); next(R); }
      },
      marks(R, add) { const s = typeof spot === 'function' ? spot(R) : spot; if (s) add(s.x, s.y, o.color || '#ffd23a', s.label, s.r || 2.2); },
    };
  }
  function hideoutMark(R, add) { const h = X.places.hideout; if (h) add(h.door.x, h.door.y, '#7dff9a', 'Stash', 2.4); }
  function camFlash(x, y) { sfxCam(); X.floatText(x, y - 1, '*click*', '#ffffff'); PG.burst(x, y, 'spark', 10, 4, 0.25, 0.1, ['#ffffff']); M.flash = { x, y, t: 0.25 }; }

  // ================= the story =================
  // ---- 1. Hot Wheels: steal the dentist's car, deliver it undamaged
  mission({
    id: 'hotwheels', title: 'Hot Wheels', tier: 'green', reward: 500,
    brief: R => R.p.brief ? R.p.brief(R) : [
      "It's Trond. Yes, that Trond. The car park is gone, but I kept the garage. And the grudge.",
      `My dentist parks his ${R.data.car.model.name} in ${R.district}. Four thousand kroner for one filling.`,
      'Bring it to my garage. Not a scratch. He counts the scratches. So do I.',
    ],
    setup(R) {
      const pt = pointAround(110, 240), c = parkAt(R.p.model || 'fjord', pt.x, pt.y, { color: R.p.color || '#e8e4d8' });
      if (!c) return false;
      R.data.car = c; R.cars.push(c); R.data.name = R.p.name || "dentist's " + c.model.name;
      R.district = X.districtAt(c.x, c.y);
      guardCar(R, c, R.data.name, R.p.minHp == null ? 0.55 : R.p.minHp);
    },
    stages: [
      stGetIn('car', R => `Steal the ${R.data.name} in ${R.district}`),
      stDeliver('car', 'garage', R => `Bring the ${R.data.name} to Trond's Garage. Not a scratch!`),
    ],
    bonus(R) { const c = R.data.car; return c && c.hp / c.maxHp > 0.95 ? Math.round(R.reward * 0.5 / 50) * 50 : 0; },
  });

  // ---- 2. Special Delivery: a box van with a bomb in it
  mission({
    id: 'special', title: 'Special Delivery', tier: 'green', req: ['hotwheels'], reward: 1200,
    brief: R => R.p.brief ? R.p.brief(R) : [
      'Kjell from Ticket & Clamp AS sent me a parking fine. For my own garage.',
      `There is a box van in ${R.district} with a present for his office. The present ticks.`,
      'Drive it to his door before it stops ticking. Bumps make it worse. Then walk away. Briskly.',
    ],
    setup(R) {
      const pt = pointAround(45, 110), van = parkAt('boxvan', pt.x, pt.y);
      if (!van) return false;
      const dst = doorAround(260, 480, van);
      if (!dst) return false;
      R.data.van = van; R.data.bomb = true; R.cars.push(van);
      R.data.office = Object.assign(zoneAt(dst.door, R.p.place || 'Ticket & Clamp AS', 4.5), { b: dst.b, door: dst.door });
      R.data.fuse = Math.round(cl(routeLen(X.route(van.x, van.y, R.data.office.x, R.data.office.y)) / 9.5 + 24, 55, 140));
      R.district = X.districtAt(van.x, van.y);
      M.signs.push({ b: dst.b, text: R.p.sign || 'TICKET & CLAMP AS', color: '#ffd23a', run: R });
      guardCar(R, van, 'van');
    },
    stages: [
      stGetIn('van', R => `Get in the box van in ${R.district}. Gently.`, { label: 'Van' }),
      {
        text: R => `Deliver the van to ${R.data.office.label} before it blows!`, timer: R => R.data.fuse,
        enter(R) { R.data.beepT = 0; X.big('BOMB ARMED', '#ff4a3a', 1500); },
        timeout(R) { const v = R.data.van; lose(R, 'The bomb went off. In the wrong place.'); X.destroyCar(v, null, 'bomb'); },
        tick(R, dt) {
          const v = R.data.van, z = R.data.office;
          tickBomb(R, dt, v);
          if (v.hp < v.maxHp * 0.35) { lose(R, 'Too many bumps. The bomb went off early.'); X.destroyCar(v, null, 'bomb'); return; }
          if (P.car !== v) R.sub = 'Get back in the van! It is still ticking.';
          if (Math.hypot(v.x - z.x, v.y - z.y) < z.r) { if (Math.abs(v.speed) > 1.5) R.sub = 'Stop at the door'; else { R.data.left = R.timer; next(R); } }
        },
        marks(R, add) { const v = R.data.van, z = R.data.office; if (P.car !== v) add(v.x, v.y, '#ff4a3a', 'Van', 4.2); else add(z.x, z.y, '#ff4a3a', z.label, z.r); },
      },
      {
        text: 'Get clear! It is going to blow!',
        enter(R) { R.data.fuseT = 5; R.timer = R.timerMax = 5; R.onTimeout = R2 => { const v = R2.data.van; win(R2); X.destroyCar(v, P.ped, 'bomb'); }; if (P.car === R.data.van) X.exitCar(); },
        tick(R, dt) {
          const v = R.data.van; tickBomb(R, dt, v);
          if (P.car === v) { R.data.outT = (R.data.outT || 0) - dt; if (R.data.outT <= 0) { R.data.outT = 0.6; X.exitCar(); } }
          const d = dist(pos(), v.x, v.y); R.count = d > 15 ? 'clear' : Math.round(d) + ' m';
        },
        marks(R, add) { const v = R.data.van; add(v.x, v.y, '#ff4a3a', 'RUN!', 15); },
      },
    ],
    bonus: R => Math.round((R.data.left || 0) / 5) * 50,
    on: {
      carImpact(R, e) {
        if (R.stage !== 1 || e.car !== R.data.van || e.speed < 6 || R.timer == null) return;
        R.timer = Math.max(1, R.timer - 3); X.floatText(e.car.x, e.car.y - 2, '-3 s', '#ff4a3a');
      },
    },
  });
  function tickBomb(R, dt, v) {
    R.data.beepT -= dt;
    if (R.data.beepT <= 0) {
      const k = R.timerMax ? cl(R.timer / R.timerMax, 0, 1) : 0.5;
      R.data.beepT = 0.12 + 0.9 * k; R.data.led = 0.12;
      if (dist(pos(), v.x, v.y) < 45) sfxBeep(k < 0.25);
    }
    R.data.led = Math.max(0, (R.data.led || 0) - dt);
  }

  // ---- 3. Take the Bus!: plough the city bus through a rival car park
  mission({
    id: 'bus', title: 'Take the Bus!', tier: 'green', req: ['hotwheels'], reward: 1500,
    brief: R => R.p.brief ? R.p.brief(R) : [
      `Kjell opened a new car park in ${R.data.lotDistrict}. Nine hundred kroner an hour. Not on my watch.`,
      `A city bus is parked in ${R.district}. Borrow it.`,
      'Then park it in his car park. On the cars. Take the bus! Ha. That was a joke. Go.',
    ],
    setup(R) {
      const f = X.focus(), n = R.p.n || 8, lot = findLot(f, 170, 430, n);
      if (!lot) return false;
      lot.title = R.p.lotName || 'TICKET & CLAMP · 900 KR/T'; lot.color = '#ffd23a';
      R.data.lot = lot; R.data.lotCars = lotCars(R, lot, MODELS_LOT);
      R.data.chev = R.data.lotCars; R.data.chevDone = c => R.data.smashed.has(c);
      const pt = pointAround(35, 100, f), bus = parkAt('bus', pt.x, pt.y);
      if (!bus) return false;
      R.data.bus = bus; R.cars.push(bus); R.data.smashed = new Set(); R.data.need = R.p.need || Math.min(6, n);
      R.district = X.districtAt(bus.x, bus.y); R.data.lotDistrict = X.districtAt(lot.cx, lot.cy);
      guardCar(R, bus, 'bus');
    },
    stages: [
      stGetIn('bus', R => `Steal the city bus in ${R.district}`, { label: 'Bus' }),
      {
        text: R => `Drive the bus to Kjell's car park in ${R.data.lotDistrict}`,
        tick(R) {
          const b = R.data.bus, L = R.data.lot;
          if (P.car !== b) R.sub = 'Get back in the bus';
          else if (b.x > L.x0 - 18 && b.x < L.x1 + 18 && b.y > L.y0 - 18 && b.y < L.y1 + 18) next(R);
        },
        marks(R, add) { const b = R.data.bus, L = R.data.lot; if (P.car !== b) add(b.x, b.y, '#ffd23a', 'Bus', 6.5); else add(L.cx, L.cy, '#ffd23a', 'Car park', 6); },
      },
      {
        text: R => `Smash ${R.data.need} cars with the bus!`, timer: R => R.p.time || 75,
        timeout(R) { lose(R, 'Kjell called a tow truck. On you.'); },
        tick(R) {
          for (const c of R.data.lotCars) if (!R.data.smashed.has(c) && (c.wrecked || c.hp < c.maxHp * 0.6)) smashLot(R, c);
          R.count = R.data.smashed.size + ' / ' + R.data.need;
          if (P.car !== R.data.bus) R.sub = 'Back in the bus! Only the bus counts.';
          if (R.data.smashed.size >= R.data.need) win(R);
        },
      },
    ],
    on: {
      carImpact(R, e) {
        if (R.stage !== 2 || e.speed < 3) return;
        const b = R.data.bus, o = e.car === b ? e.other : e.other === b ? e.car : null;
        if (o && R.data.lotCars.includes(o) && !R.data.smashed.has(o)) smashLot(R, o);
      },
    },
  });
  function smashLot(R, c) {
    R.data.smashed.add(c);
    X.floatText(c.x, c.y - 1.5, pick(['SMASHED!', 'PARKED!', 'NO REFUNDS!', 'TAKE THE BUS!']), '#ffb02e', { life: 1.8, size: 18 });
    PG.burst(c.x, c.y, 'confetti', 14, 6, 1.2, 0.22, ['#ffffff', '#ffe680', '#ffb02e']);
    if (PG.audio.chime) PG.audio.chime(Math.min(9, R.data.smashed.size + 1));
  }

  // ---- 4. Meter Maid: wreck the parking inspector's car before she reaches City Hall
  mission({
    id: 'inspector', title: 'Meter Maid', tier: 'yellow', req: ['special'], reward: 2000,
    brief: R => R.p.brief ? R.p.brief(R) : [
      'The Parking Inspector General is driving to City Hall with every ticket I ever got.',
      `Eleven years of tickets. A white ${R.data.car.model.name}, now in ${R.district}. Silent, like her soul.`,
      'Wreck that car before she files them. Tickets and all.',
    ],
    setup(R) {
      const f = X.focus(), c = trafficCar(R.p.model || 'voltage', f, 80, 170, { color: R.p.color || '#f4f4f4', npcDriver: { look: LOOKS.inspector(), team: 'civ', extra: 0 } });
      if (!c) return false;
      c.hp = c.maxHp = R.p.hp || 1000;
      const dst = doorAround(430, 800, c, b => (b.x1 - b.x0) * (b.y1 - b.y0) > 250) || doorAround(300, 900, c);
      if (!dst) { X.removeCar(c); return false; }
      R.data.hall = Object.assign(zoneAt(dst.door, R.p.place || 'City Hall', 6), { b: dst.b });
      M.signs.push({ b: dst.b, text: R.p.sign || 'CITY HALL', color: '#9fc3ff', run: R });
      X.toPhys(c);
      R.data.nav = { pts: laneRoute(c.x, c.y, R.data.hall.x, R.data.hall.y), i: 0, speed: R.p.speed || 11.5, hand: false };
      c.ai = { owner: 'missions', drive: (car, dt) => R.brief ? { rev: car.speed > 0.3 ? 1 : 0 } : driveRoute(car, dt, R.data.nav) };
      R.data.car = c; R.cars.push(c); R.district = X.districtAt(c.x, c.y); R.data.far = 0; R.armour = [c];
    },
    stages: [{
      text: R => R.p.goal || 'Wreck the inspector\'s car before she reaches City Hall!',
      tick(R, dt) {
        const c = R.data.car, p = pos(), d = dist(p, c.x, c.y);
        if (c.wrecked || c.burning > 0) return win(R);
        if (c.removed) return lose(R, 'She got away.');
        if (!R.data.spooked && (d < 38 || c.hp < c.maxHp)) {
          R.data.spooked = true; R.data.nav.speed = R.p.fast || 20; R.data.nav.hand = true;
          X.floatText(c.x, c.y - 2, R.p.yelp || 'EEK!', '#ffffff');
        }
        if (P.car === c) { R.sub = 'You have her car! Now wreck it, tickets and all.'; R.data.far = 0; }
        else if (c.ai && c.ai.owner === 'missions' && R.data.nav.done) return lose(R, R.p.arrived || 'She filed the tickets. You owe 2.4 million kroner.');
        R.data.far = d > 300 ? R.data.far + dt : 0;
        if (R.data.far > 6) return lose(R, 'She got away.');
        R.bar = c.hp / c.maxHp; R.barLabel = 'her car';
      },
      marks(R, add) { const c = R.data.car; add(c.x, c.y, '#ff4a3a', R.p.label || 'Inspector', c.len / 2 + 1.2); },
    }],
    on: {
      carImpact(R, e) {
        const c = R.data.car;
        if ((e.car === c || e.other === c) && e.speed > 3 && X.inView(c.x, c.y, 4)) PG.burst(c.x, c.y, 'confetti', 12, 5, 1.6, 0.25, ['#ffffff', '#f4f0e0', '#ffe680']);
      },
    },
  });

  // ---- 5. Corporate Restructuring: a hit on a businessman with bodyguards
  mission({
    id: 'restructure', title: 'Corporate Restructuring', tier: 'yellow', req: ['inspector'], reward: 2500,
    brief: R => R.p.brief ? R.p.brief(R) : [
      'Mr. Bjørnstad at Fjord Insurance says my car park was not an act of God.',
      `He is outside his office in ${R.district} with two very large friends.`,
      'Show him an act of God. If he runs for his car, do not let him get away.',
    ],
    setup(R) {
      const dst = doorAround(150, 330, X.focus());
      if (!dst) return false;
      const d = dst.door, th = Math.atan2(d.ny, d.nx), ux = -d.ny, uy = d.nx;
      const tx = d.x + d.nx * 1.4, ty = d.y + d.ny * 1.4;
      const tgt = addPed(R, { x: tx, y: ty, th, hp: 110, maxHp: 110, team: 'civ', look: LOOKS.suit('#2b2f3a', '#b0151a') }, { role: 'target', face: th });
      const n = R.p.guards || 2;
      for (let k = 0; k < n; k++) {
        const s = k % 2 ? 1 : -1, o = 1.3 + Math.floor(k / 2) * 1.1;
        const gx = tx + ux * s * o + d.nx * 1.0, gy = ty + uy * s * o + d.ny * 1.0;
        const g = addPed(R, { x: gx, y: gy, th, hp: 150, maxHp: 150, team: 'guard', look: LOOKS.goon(), weapon: canShoot() ? (k === 2 ? 'uzi' : 'pistol') : null }, { role: 'guard', face: th + s * 0.4, notice: 2.2 });
        g.dmgMul = 0.32; g.inaccuracy = 0.1; g.rateMul = 2.2; g.noDrop = false;
      }
      R.data.target = tgt; R.data.office = dst;
      R.data.car = parkAt(R.p.carModel || 'x5', d.x + d.nx * 6 + ux * 6, d.y + d.ny * 6 + uy * 6, { color: '#101214' });
      if (R.data.car) R.cars.push(R.data.car);
      M.signs.push({ b: dst.b, text: R.p.sign || 'FJORD INSURANCE', color: '#7fd0ff', run: R });
      R.district = X.districtAt(tx, ty); R.data.far = 0;
    },
    stages: [{
      text: R => R.p.goal || `Kill Mr. Bjørnstad outside Fjord Insurance in ${R.district}`,
      tick(R, dt) {
        const t = R.data.target, p = pos();
        if (t.dead) return win(R);
        if (t.removed) return lose(R, 'He got away.');
        const at = t.car || t, d = dist(p, at.x, at.y);
        R.data.far = d > (t.car ? 300 : 220) ? R.data.far + dt : 0;
        if (R.data.far > 5) return lose(R, R.p.escaped || 'He got away. Your premiums just went up.');
        if (!R.alarm && !t.car && d < 2.2 && !P.car) alarm(R);
        if (t.car) R.sub = 'He is in his car! Stop him!';
      },
      marks(R, add) { const t = R.data.target, at = t.car || t; add(at.x, at.y, '#ff4a3a', R.p.label || 'Bjørnstad', t.car ? t.car.len / 2 + 1 : 1.2); },
    }],
  });

  // ---- 6. Brunost Bloodbath: a GTA2 kill frenzy
  mission({
    id: 'frenzy', title: 'Brunost Bloodbath', tier: 'yellow', req: ['bus'], reward: 2000,
    brief: R => R.p.brief ? R.p.brief(R) : [
      'The Brunost Mafia painted their logo on my garage. In brown cheese. It does not wash off.',
      `There is a skull crate in ${R.district}. You know what skulls mean.`,
      R.data.useCar ? `Run over ${R.data.need} of them in ${R.data.time} seconds. There is a truck next to the skull.` : `Kill ${R.data.need} of them in ${R.data.time} seconds. Then we talk about respect.`,
    ],
    setup(R) {
      const f = X.focus(), pt = sidewalkAround(f.x, f.y, 35, 95) || pointAround(35, 95, f);
      R.data.skull = addItem(R, 'skull', pt.x, pt.y);
      R.data.useCar = !canShoot();
      R.data.carsMode = !!R.p.cars && !R.data.useCar;   // GTA2's other frenzy: blow up cars
      R.data.need = R.p.need || (R.data.useCar ? 10 : 12);
      R.data.time = R.p.time || (R.data.useCar ? 70 : 50);
      R.data.weapon = R.data.carsMode ? 'rocket' : R.p.weapon || 'uzi'; R.data.frenzy = !R.data.carsMode;
      R.data.gang = R.p.gang || 'mafia';
      R.data.got = 0; R.data.popT = 0;
      if (R.data.useCar) { const c = parkAt('rancher', pt.x, pt.y, { color: '#7a2a24' }); if (c) { R.data.truck = c; R.cars.push(c); } R.data.skull.carOk = true; }
      R.district = X.districtAt(pt.x, pt.y);
    },
    stages: [
      {
        text: R => `Pick up the skull crate in ${R.district}`,
        tick(R) { if (R.data.skull.taken) next(R); },
        marks(R, add) { const s = R.data.skull; add(s.x, s.y, '#ff3b2f', 'Skull', 1.6); },
      },
      {
        text: R => R.data.carsMode ? `Blow up ${R.data.need} cars!` : R.data.useCar ? `Run over ${R.data.need} gang members!` : `Kill ${R.data.need} gang members!`,
        timer: R => R.data.time,
        enter(R) { startFrenzy(R); },
        timeout(R) { if (R.data.got >= R.data.need) win(R); else lose(R, 'Frenzy failed. The cheese wins.'); },
        tick(R, dt) {
          R.count = R.data.got + ' / ' + R.data.need;
          if (R.data.got >= R.data.need) { R.data.left = R.timer; return win(R); }
          R.data.popT -= dt;
          if (R.data.popT <= 0 && !R.data.carsMode) { R.data.popT = 0.6; populateGang(R, R.data.gang, R.data.useCar ? 9 : 10); }
        },
      },
    ],
    on: {
      pedKilled(R, e) {
        if (R.stage !== 1 || R.data.carsMode || !e.ped || e.ped.team !== 'gang' || !X.byPlayer(e.by)) return;
        R.data.got++; X.floatText(e.ped.x, e.ped.y - 0.6, R.data.got + '/' + R.data.need, '#ff3b2f', { size: 20 });
      },
      carDestroyed(R, e) {
        if (R.stage !== 1 || !R.data.carsMode || !e.car || e.car === P.car || !X.byPlayer(e.by)) return;
        R.data.got++; X.floatText(e.car.x, e.car.y - 1.5, R.data.got + '/' + R.data.need, '#ff3b2f', { size: 20 });
      },
    },
    bonus: R => (R.data.left || 0) > R.data.time * 0.4 ? 500 : 0,
    end(R) { endFrenzy(R); if (X.gangs && X.gangs.addRespect && R.data.got) X.gangs.addRespect(R.data.gang, -Math.min(40, R.data.got * 3)); },
  });
  function startFrenzy(R) {
    sfxSkull();
    X.big('KILL FRENZY!', '#ff3b2f', 2600, R.text.replace('!', '') + ' in ' + Math.round(R.timer) + ' seconds');
    if (R.data.useCar) return;
    const w = X.WEAPONS[R.data.weapon] ? X.WEAPONS[R.data.weapon].id : 'pistol';
    R.data.weapon = w;
    R.data.prev = { w: P.weapon, ammo: P.inv[w] };
    P.inv[w] = Infinity;
    if (X.weapons && X.weapons.select) X.weapons.select(w); else P.weapon = w;
  }
  function endFrenzy(R) {
    const pv = R.data.prev; if (!pv) return;
    R.data.prev = null;
    const w = R.data.weapon;
    if (P.inv[w] === Infinity) { if (pv.ammo == null) delete P.inv[w]; else P.inv[w] = pv.ammo; }
    const back = P.inv[pv.w] === Infinity || P.inv[pv.w] > 0 ? pv.w : 'fists';
    if (X.weapons && X.weapons.select) { if (!X.weapons.select(back)) X.weapons.select('fists'); } else P.weapon = back;
  }
  // Keep a crowd of gang members around the player: the peds module's gangs when present, our own otherwise.
  function populateGang(R, gangId, want) {
    const p = pos();
    let n = 0;
    for (const q of X.peds) if (q.team === 'gang' && !q.dead && !q.removed && Math.abs(q.x - p.x) < 75 && Math.abs(q.y - p.y) < 75) n++;
    if (n >= want || R.peds.reduce((k, q) => k + (q.dead || q.removed ? 0 : 1), 0) > 21) return;
    const pt = n < 4 ? sidewalkAround(p.x, p.y, 12, 30) : sidewalkAround(p.x, p.y, 22, 60);
    if (!pt || (n >= 4 && X.inView(pt.x, pt.y, 3) && Math.random() < 0.7)) return;
    const g = X.gangs && X.gangs.get && X.gangs.get(gangId);
    if (g && X.gangs.spawnGroup && X.gangs.spawnGroup(g, pt.x, pt.y, 3)) return;   // they fight back once provoked
    const look = LOOKS[gangId] || LOOKS.mafia;
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU, x = pt.x + Math.cos(a) * 1.1, y = pt.y + Math.sin(a) * 1.1;
      if (X.blocked(x, y, 0.4)) continue;
      addPed(R, { x, y, th: a + Math.PI, team: 'gang', look: look(), hp: 70, maxHp: 70 }, { role: 'thug', aggro: R.data.useCar ? 14 : 6, wander: true, homeX: x, homeY: y });
    }
  }

  // ---- 7. Barbecue Season: torch every car in a rival yard
  mission({
    id: 'barbecue', title: 'Barbecue Season', tier: 'yellow', req: ['frenzy'], reward: 2500,
    brief: R => R.p.brief ? R.p.brief(R) : [
      `The Russ Crew keeps their cars in a yard in ${R.district}. Russ season is over.`,
      canShoot() ? 'Torch every car in the yard. Molotovs are in the bag. It was aquavit, so do not drink it.' : 'Wreck every car in the yard. Ram them. They are old, they burn like birthday candles.',
      `${R.data.cars.length} cars. ${R.data.time} seconds once you are there. Make it a barbecue.`,
    ],
    setup(R) {
      const n = R.p.n || 6, lot = findLot(X.focus(), 170, 430, n, 2.45);
      if (!lot) return false;
      lot.title = R.p.lotName || 'RUSS CREW · KEEP OUT'; lot.color = '#ff4a3a';
      R.data.lot = lot; R.data.cars = lotCars(R, lot, MODELS_OLD, {});
      R.data.chev = R.data.cars; R.data.chevDone = c => c.wrecked || c.burning > 0;
      for (const c of R.data.cars) { c.hp = c.maxHp = R.p.carHp || 460; c.color = pick(['#d0261d', '#7a2a24', '#c3241c', '#2b2d33', '#e9e4d8']); }
      R.data.time = R.p.time || 120; R.data.gang = R.p.gang || 'russ';
      R.district = X.districtAt(lot.cx, lot.cy);
      const g = X.gangs && X.gangs.get && X.gangs.get(R.data.gang);
      if (!(g && X.gangs.spawnGroup && X.gangs.spawnGroup(g, lot.cx, lot.y1 + 2.5, 3))) {
        for (let k = 0; k < 3; k++) {   // the yard's watchmen
          const x = lot.cx + (k - 1) * 1.3, y = lot.y1 + 2.2;
          if (!X.blocked(x, y, 0.45)) addPed(R, { x, y, th: Math.PI / 2, team: 'gang', look: (LOOKS[R.data.gang] || LOOKS.russ)(), hp: 70, maxHp: 70 }, { role: 'thug', aggro: 11, wander: true, homeX: x, homeY: y });
        }
      }
    },
    onGo(R) {
      if (!canShoot()) return;
      X.giveWeapon('molotov', R.p.molotovs || 8); X.giveWeapon('grenade', 3);
      if (X.weapons && X.weapons.select) X.weapons.select('molotov');
      X.popup('Molotovs x' + (R.p.molotovs || 8) + ', grenades x3');
    },
    stages: [
      {
        text: R => `Go to the Russ Crew yard in ${R.district}`,
        tick(R) { const L = R.data.lot, p = pos(); if (Math.hypot(p.x - L.cx, p.y - L.cy) < 50 || torched(R) > 0) next(R); },
        marks(R, add) { const L = R.data.lot; add(L.cx, L.cy, '#ff4a3a', 'Yard', 7); },
      },
      {
        text: R => `Torch all ${R.data.cars.length} cars!`, timer: R => R.data.time,
        timeout(R) { lose(R, 'The Russ Crew put the fire out. With beer.'); },
        tick(R) { const n = torched(R); R.count = n + ' / ' + R.data.cars.length; if (n >= R.data.cars.length) win(R); },
      },
    ],
  });
  const torched = R => R.data.cars.reduce((n, c) => n + (c.wrecked || c.burning > 0 || c.removed ? 1 : 0), 0);

  // ---- 8. Joyride: the police chief's cruiser, three stars for a minute, then lose them
  mission({
    id: 'joyride', title: 'Joyride', tier: 'red', req: ['restructure', 'barbecue'], reward: 3000, mood: 0.3,
    brief: R => R.p.brief ? R.p.brief(R) : [
      'The police chief has parked in my spot at the station every day for eleven years.',
      `His cruiser is outside the station in ${R.district}. Take it for a spin. Wave at his colleagues.`,
      `Keep ${R.data.stars} stars for ${R.data.hold} seconds. Then lose them. Nobody parks in Trond's spot.`,
    ],
    setup(R) {
      const pl = X.places.police;
      let c = null;
      if (pl) { const st = streetOf(pl.door); c = parkAt('police', st.x + st.nx * 3, st.y + st.ny * 3); }
      if (!c) { const pt = pointAround(90, 220); c = parkAt('police', pt.x, pt.y); }
      if (!c) return false;
      R.data.car = c; R.cars.push(c); R.data.hold = R.p.hold || 60; R.data.stars = R.p.stars || 3; R.data.out = 0;
      R.district = X.districtAt(c.x, c.y);
      guardCar(R, c, "chief's cruiser", 0, 2);
    },
    stages: [
      stGetIn('car', R => `Steal the police chief's cruiser in ${R.district}`, { label: "Chief's cruiser" }),
      {
        text: R => `Keep ${R.data.stars} stars for ${R.data.hold} seconds. Stay in the cruiser!`, timer: R => R.data.hold,
        enter(R) { setWanted(R, Math.max(R.data.stars, wantedLevel())); R.data.car.siren = true; X.big('WANTED!', '#5aa9ff', 1400); },
        timeout(R) { next(R); },
        tick(R, dt) {
          const c = R.data.car;
          if (wantedLevel() < R.data.stars) setWanted(R, R.data.stars);
          if (P.car !== c) { R.data.out += dt; R.sub = `Get back in the cruiser! ${Math.max(0, Math.ceil(8 - R.data.out))} s`; if (R.data.out > 8) lose(R, 'You were supposed to joyride, not jog.'); }
          else R.data.out = 0;
        },
        marks(R, add) { const c = R.data.car; if (P.car !== c) add(c.x, c.y, '#5aa9ff', 'Cruiser', 3.2); },
      },
      {
        text: 'Now lose the cops!',
        enter(R) { R.data.from = pos(); R.data.car.siren = false; },
        tick(R) {
          if (X.police) { R.count = wantedLevel() + ' ★'; if (wantedLevel() === 0) win(R); return; }
          const d = dist(pos(), R.data.from.x, R.data.from.y); R.count = Math.max(0, Math.round(160 - d)) + ' m';
          if (d > 160) { P.wanted = 0; win(R); }
        },
      },
    ],
  });

  // ---- 9. Cash in Transit: rob an armoured van, bank the bags
  mission({
    id: 'transit', title: 'Cash in Transit', tier: 'red', req: ['joyride'], reward: 3500,
    brief: R => R.p.brief ? R.p.brief(R) : [
      `A Securicar is doing its rounds in ${R.district}. It is full of other people's money.`,
      'Ram it or shoot it until the back doors give up. Grab the bags.',
      'Bring the cash home to the garage. Do not get wasted. Dead men keep no loot.',
    ],
    setup(R) {
      const f = X.focus(), c = trafficCar('securicar', f, 90, 190, { npcDriver: { look: LOOKS.guard(), team: 'guard', extra: 1 } });
      if (!c) return false;
      c.hp = c.maxHp = R.p.hp || 2600;
      R.data.van = c; R.cars.push(c); R.data.doors = 100; R.data.far = 0; R.armour = [c];
      c.ai = { owner: 'missions', drive: (car, dt) => R.alarm && !R.data.burst ? fleeDrive(R, car, dt) : null };
      R.district = X.districtAt(c.x, c.y);
    },
    onAlarm(R) {
      const c = R.data.van;
      if (c.ctrl !== 'phys') X.toPhys(c);
      const f = fleePoint(c.x, c.y); R.data.nav = { pts: laneRoute(c.x, c.y, f.x, f.y), i: 0, speed: 15, hand: false };
      X.floatText(c.x, c.y - 2.5, 'ALARM!', '#ff4a3a');
    },
    stages: [
      {
        text: R => `Hit the Securicar in ${R.district} until the doors pop`,
        tick(R, dt) {
          const c = R.data.van, d = dist(pos(), c.x, c.y);
          if (c.removed) return lose(R, 'The Securicar got away.');
          R.bar = 1 - R.data.doors / 100; R.barLabel = 'doors';
          if (R.data.doors <= 0 || c.wrecked) { burstVan(R); next(R); return; }
          R.data.far = R.alarm && d > 320 ? R.data.far + dt : 0;
          if (R.data.far > 6) lose(R, 'The Securicar got away.');
        },
        marks(R, add) { const c = R.data.van; add(c.x, c.y, '#ff4a3a', 'Securicar', c.len / 2 + 1.2); },
      },
      {
        text: 'Grab the cash bags!',
        tick(R) {
          const left = bagsLeft(R);
          R.count = (R.data.bags - left) + ' / ' + R.data.bags + ' bags';
          if (left === 0 || (P.loot > 0 && R.st > 30)) next(R);
        },
        marks: bagMark,
      },
      {
        text: "Stash the loot at Trond's Garage",
        tick(R) { if (!P.loot && bagsLeft(R) === 0) lose(R, 'The loot is gone.'); R.count = P.loot ? fmt(P.loot) : ''; },
        marks: hideoutMark,
      },
    ],
    on: {
      carImpact(R, e) {
        const c = R.data.van; if (R.data.burst) return;
        if (e.car === P.car && e.other === c && e.speed > 6) { R.data.doors -= e.speed * 1.5; alarm(R); X.floatText(c.x, c.y - 2, 'CLANG!', '#ffd23a', { size: 14 }); }
      },
      carHurt(R, e) { if (e.car === R.data.van && !R.data.burst && e.kind !== 'crash') { R.data.doors -= e.amount / 5; alarm(R); } },
      lootBanked(R) { if (R.stage >= 1) win(R); },
      lootLost(R) { lose(R, 'The loot is gone.'); },
    },
  });
  function burstVan(R) {
    const c = R.data.van; if (R.data.burst) return;
    R.data.burst = true; c.doorsOpen = true; c.ai = null;
    if (c.dv) { c.dv.vx *= 0.25; c.dv.vy *= 0.25; }
    const bx = c.x - Math.cos(c.th) * (c.len / 2 + 0.5), by = c.y - Math.sin(c.th) * (c.len / 2 + 0.5);
    R.data.bags = R.p.bags || 6;
    spill(R, bx, by, c.th + Math.PI, R.data.bags, R.p.bagLo || 350, R.p.bagHi || 700);
    PG.burst(bx, by, 'spark', 24, 8, 0.5, 0.1);
    if (dist(pos(), bx, by) < 50) PG.audio.boom();
    X.big('THE DOORS POPPED!', '#5fdc6e', 1600);
    X.crime('robbery', c.x, c.y, { car: c });
    if (!c.wrecked) {
      const out = c.npcDriver ? X.ejectOccupants(c, 'robbery') : [];
      for (const p of out) {
        p.team = 'guard'; p.look = LOOKS.guard(); p.hp = p.maxHp = 110;
        if (canShoot()) { p.weapon = 'pistol'; p.dmgMul = 0.3; p.inaccuracy = 0.12; p.rateMul = 2.4; }
        p.ai = { owner: 'missions', role: 'guard', st: 'attack', t: 0, cd: rand(0.6, 1.2), strafe: 1, strafeT: 1, face: p.th, stuck: 0, side: 1 };
        R.peds.push(p); R.pedSet.add(p);
      }
    }
    R.alarm = true;
  }

  // ---- 10-13. The Fjord Savings Bank heist
  const hasInteriors = () => X.has('interiors') && !!X.interiors;
  function bankScene() { const s = X.scene; return !!s && (s.type === 'bank' || s.id === 'bank' || s.place === 'bank' || (!s.type && /bank/i.test(s.name || ''))); }
  function vaultPos() {
    let v = null;
    const I = X.interiors;
    try { const b = I && (typeof I.bank === 'function' ? I.bank() : I.bank); if (b) v = b.vault || b.vaultPos || null; } catch (e) { v = null; }
    if (v && !(typeof v.x === 'number' && typeof v.y === 'number')) v = null;
    const s = X.scene;
    if (!v && s && bankScene()) {
      const f = (s.furn || []).find(q => /vault/i.test(q.t || ''));
      if (f) v = { x: f.x, y: f.y };
      else { const a = (s.acts || []).find(q => /vault|drill/i.test(typeof q.text === 'string' ? q.text : '')); if (a) v = { x: a.x, y: a.y }; }
      if (!v && s.vault && typeof s.vault.x === 'number') v = s.vault;
    }
    return v;
  }
  // Where to stand at the vault: the interaction spot next to it when the interior has one.
  function vaultSpot() {
    const v = vaultPos(), s = X.scene; if (!v) return null;
    if (s && s.acts && bankScene()) {
      let best = null, bd = 4.5;
      for (const a of s.acts) { const d = Math.hypot(a.x - v.x, a.y - v.y); if (d < bd) { bd = d; best = a; } }
      if (best) return { x: best.x, y: best.y };
    }
    return v;
  }
  function bankDoorMark(R, add) { const b = X.places.bank; if (b && !X.scene) add(b.door.x, b.door.y, '#e9c25a', 'Bank', 2.2); }
  // A kerbside stopping place on a side street next to the bank.
  function alleySpot() {
    const bank = X.places.bank; if (!bank) return null;
    const b = bank.b, d = bank.door, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const blk = X.blockAt(cx, cy) || { x0: b.x0 - 6, y0: b.y0 - 6, x1: b.x1 + 6, y1: b.y1 + 6 };
    const sides = [{ nx: 0, ny: -1 }, { nx: 0, ny: 1 }, { nx: -1, ny: 0 }, { nx: 1, ny: 0 }];
    const score = s => { const dot = s.nx * d.nx + s.ny * d.ny; return dot === 0 ? 0 : dot < 0 ? 1 : 2; };
    sides.sort((p, q) => score(p) - score(q));
    for (const s of sides) {
      const mx = s.nx ? (s.nx < 0 ? blk.x0 : blk.x1) : (blk.x0 + blk.x1) / 2 + rand(-8, 8), my = s.ny ? (s.ny < 0 ? blk.y0 : blk.y1) : (blk.y0 + blk.y1) / 2 + rand(-8, 8);
      const qx = mx + s.nx * 3, qy = my + s.ny * 3;
      if (!X.roadAt(qx, qy)) continue;
      const k = kerbSpot(qx, qy, 5, 1.8);
      return { x: k.x, y: k.y, th: k.th, r: 4.2, label: 'Alley' };
    }
    return zoneAt(d, 'Alley');
  }
  function caseSpots(bank) {
    const b = bank.b, d = bank.door, out = [{ x: d.x + d.nx * 1.4, y: d.y + d.ny * 1.4, r: 2, label: 'Front door' }];
    const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => {
      const ox = x === b.x0 ? -1.6 : 1.6, oy = y === b.y0 ? -1.6 : 1.6;
      return { x: x + ox, y: y + oy, r: 2, label: 'Camera' };
    }).filter(q => !X.blocked(q.x, q.y, 0.5) && X.blockAt(q.x, q.y) && !X.roadAt(q.x, q.y));
    corners.sort((p, q) => Math.hypot(q.x - d.x, q.y - d.y) - Math.hypot(p.x - d.x, p.y - d.y));
    if (corners[0]) out.push(corners[0]);
    const a = alleySpot();
    out.push({ x: a.x, y: a.y, r: 3, label: 'Getaway spot' });
    if (out.length < 3) out.splice(1, 0, { x: d.x + d.nx * 1.4 - d.ny * 5, y: d.y + d.ny * 1.4 + d.nx * 5, r: 2, label: 'Camera' });
    return out;
  }
  mission({
    id: 'casing', title: 'Casing the Joint', tier: 'bank', req: ['transit'], reward: 1000,
    brief: R => [
      'Now for the big one. Fjord Savings Bank, Bank Row. Biggest vault north of the fjord.',
      R.data.inside ? 'Walk in like a customer. Have a look at the vault. Do not touch it. Yet.' : 'They are renovating inside, so case it from the street. Front door, cameras, the side street.',
      'Smile at the cameras. Everybody smiles at the bank.',
    ],
    setup(R) {
      const bank = X.places.bank; if (!bank) return false;
      R.data.inside = hasInteriors();
      R.district = X.districtAt(bank.door.x, bank.door.y);
      if (R.data.inside) R.stages = [
        { text: 'Walk into Fjord Savings Bank', tick(R2) { if (bankScene()) next(R2); }, marks: bankDoorMark },
        {
          text: 'Have a good look at the vault. Do not touch.',
          enter(R2) { R2.data.look = 0; },
          tick(R2, dt) {
            if (!bankScene()) { goStage(R2, 0); return; }
            const v = vaultSpot();
            if (!v) { R2.data.look += dt * 0.5; R2.sub = 'Look around the bank'; }
            else if (Math.hypot(P.ped.x - v.x, P.ped.y - v.y) < 4.5) R2.data.look += dt;
            else if (R2.data.look === 0) R2.sub = 'Find the vault. Staff only? Be quick about it.';
            R2.bar = R2.data.look / 2; R2.barLabel = 'casing';
            if (R2.data.look >= 2) { camFlash(P.ped.x, P.ped.y); next(R2); }
          },
          marks(R2, add) { const v = vaultSpot(); if (v) add(v.x, v.y, '#e9c25a', 'Vault', 2.5); },
        },
        { text: 'Walk out like nothing happened', tick(R2) { if (!X.scene) win(R2); } },
      ];
      else {
        const spots = caseSpots(bank);
        R.stages = spots.map((s, i) => stVisit(s, i === 0 ? 'Case the bank: check out the front door' : i === spots.length - 1 ? 'Check the side street for a getaway spot' : 'Count the cameras around the side', { hold: 1.2, done: (R2, q) => camFlash(q.x, q.y) }));
      }
    },
    stages: [],
  });
  mission({
    id: 'heavymetal', title: 'Heavy Metal', tier: 'bank', req: ['casing'], reward: 2000,
    brief: R => [
      'The vault door is twenty centimetres of Norwegian steel. We need a thermal drill.',
      `The drill rides in a Securicar at the depot in ${R.district}. Armed guards included, free of charge.`,
      'Steal the Securicar and bring it to my garage. The drill, not the guards.',
    ],
    setup(R) {
      const pt = pointAround(200, 420), c = parkAt('securicar', pt.x, pt.y);
      if (!c) return false;
      R.data.car = c; R.cars.push(c);
      const fx = Math.cos(c.th), fy = Math.sin(c.th);
      for (let k = 0; k < (R.p.guards || 2); k++) {
        const s = k ? 1 : -1, x = c.x + fx * s * (c.len / 2 + 1.4), y = c.y + fy * s * (c.len / 2 + 1.4);
        const q = X.blocked(x, y, 0.4) ? { x: c.x + fx * s * (c.len / 2 + 2.5), y: c.y + fy * s * (c.len / 2 + 2.5) } : { x, y };
        const g = addPed(R, { x: q.x, y: q.y, th: c.th + (k ? 0 : Math.PI), hp: 130, maxHp: 130, team: 'guard', look: LOOKS.guard(), weapon: canShoot() ? 'pistol' : null }, { role: 'guard', face: c.th + (k ? 0 : Math.PI), notice: 7 });
        g.dmgMul = 0.3; g.inaccuracy = 0.12; g.rateMul = 2.3;
      }
      R.district = X.districtAt(c.x, c.y);
      guardCar(R, c, 'Securicar');
    },
    stages: [
      stGetIn('car', R => `Steal the Securicar at the depot in ${R.district}`, { label: 'Securicar', onIn: alarm }),
      stDeliver('car', 'garage', "Bring the Securicar to Trond's Garage", { name: 'Securicar' }),
    ],
  });
  mission({
    id: 'getaway', title: 'Getaway Driver', tier: 'bank', req: ['heavymetal'], reward: 2500,
    brief: R => [
      `Every bank job needs a fast car. A Furia GT is parked in ${R.district}.`,
      'Take it and park it in the side street next to the bank. Gently. It is our ride home.',
      'If it has a dent, you are walking home.',
    ],
    setup(R) {
      const bank = X.places.bank; if (!bank) return false;
      const pt = pointAround(200, 450), c = parkAt('furia', pt.x, pt.y, { color: '#d0141e' });
      if (!c) return false;
      R.data.car = c; R.cars.push(c); R.data.alley = alleySpot();
      R.district = X.districtAt(c.x, c.y);
      guardCar(R, c, 'Furia GT', 0.5);
    },
    stages: [
      stGetIn('car', R => `Steal the Furia GT in ${R.district}`, { label: 'Furia GT' }),
      stDeliver('car', 'alley', 'Park the Furia in the side street next to the bank', { keep: true, done(R, c) { M.getaway = c; } }),
    ],
  });
  mission({
    id: 'bigone', title: 'The Big One', tier: 'bank', req: ['getaway'], reward: 25000, mood: 0.5,
    brief: R => [
      'This is it. Our friends in the Securicar left the drill at the bank. Do not ask.',
      R.data.inside ? 'Walk in, open the vault, take everything. Four stars minimum. Smile at the cameras again.' : 'Go to the side door, drill the vault, take everything. Four stars minimum, so drive like you parked in my car park.',
      'The Furia is waiting next to the bank. Bring the money to my garage. Then we buy a car park. A big one.',
    ],
    setup(R) {
      const bank = X.places.bank; if (!bank) return false;
      R.data.inside = hasInteriors();
      R.district = X.districtAt(bank.door.x, bank.door.y);
      let c = M.getaway;
      if (!c || c.removed || c.wrecked) {
        const a = alleySpot();
        c = parkAt('furia', a.x, a.y, { color: '#d0141e' });
        M.getaway = c;
      }
      if (c) { R.data.getaway = c; R.cars.push(c); }
      R.data.drill = 0; R.data.bellT = 0; R.data.bell = 0;
      const bk = R.data.inside && X.interiors.bank;
      if (bk && bk.robbed && bk.reset && !bankScene()) bk.reset();   // a fresh vault for the big one
      if (R.data.inside) R.stages = [
        { text: 'Walk into Fjord Savings Bank. Masks on.', tick(R2) { if (bankScene()) next(R2); }, marks: bankDoorMark },
        {
          text: 'Open the vault!',
          tick(R2) { if (R2.data.opened || P.loot > 0) next(R2); else if (!X.scene) R2.sub = 'Get back into the bank'; },
          marks(R2, add) { if (!X.scene) bankDoorMark(R2, add); else { const v = vaultSpot(); if (v) add(v.x, v.y, '#e9c25a', 'Vault', 2.5); } },
        },
        {
          text: 'Grab the cash and get out!',
          tick(R2) {
            R2.count = P.loot ? fmt(P.loot) : '';
            if (!X.scene) { if (P.loot > 0) { escape(R2); next(R2); } else R2.sub = 'You forgot the money! Back inside.'; }
          },
          marks(R2, add) { if (!X.scene) bankDoorMark(R2, add); },
        },
        escapeStage(),
      ];
      else R.stages = [
        stVisit(() => { const d = X.places.bank.door; return { x: d.x + d.nx * 1.2, y: d.y + d.ny * 1.2, r: 2.4, label: 'Side door' }; }, 'Go to the bank. The side door is ours tonight.', { hold: 0.4 }),
        {
          text: 'Drill the vault! Stay close to the drill.',
          enter(R2) {
            const d = X.places.bank.door;
            X.emit('heistAlarm', { x: d.x, y: d.y, place: X.places.bank });
            X.crime('heist', d.x, d.y, { place: 'bank' });
            setWanted(R2, Math.max(2, wantedLevel()));
            R2.data.bell = 30;
            for (let k = 0; k < 2; k++) {
              const g = addPed(R2, { x: d.x + d.nx * 1.2 + (k ? 1.2 : -1.2) * -d.ny, y: d.y + d.ny * 1.2 + (k ? 1.2 : -1.2) * d.nx, th: Math.atan2(d.ny, d.nx), hp: 120, maxHp: 120, team: 'guard', look: LOOKS.guard(), weapon: canShoot() ? 'pistol' : null }, { role: 'guard', st: 'attack' });
              g.dmgMul = 0.28; g.inaccuracy = 0.13; g.rateMul = 2.4;
            }
            X.big('ALARM!', '#ff4a3a', 1400);
          },
          tick(R2, dt) {
            const d = X.places.bank.door, near = !P.car && Math.hypot(P.ped.x - d.x, P.ped.y - d.y) < 3.2;
            if (near) {
              R2.data.drill = Math.min(1, R2.data.drill + dt / (R2.p.drill || 12));
              R2.data.sndT = (R2.data.sndT || 0) - dt; if (R2.data.sndT <= 0) { R2.data.sndT = 0.22; sfxDrill(); }
              if (Math.random() < dt * 20) PG.burst(d.x - d.nx * 0.6, d.y - d.ny * 0.6, 'spark', 3, 6, 0.4, 0.08);
            } else R2.sub = 'Get back to the drill!';
            R2.bar = R2.data.drill; R2.barLabel = 'drill';
            if (R2.data.drill >= 1) {
              X.emit('vaultOpened', { x: d.x, y: d.y, place: X.places.bank, fallback: true });
              spill(R2, d.x, d.y, Math.atan2(d.ny, d.nx), R2.p.bags || 7, 1300, 2300);
              R2.data.bags = R2.p.bags || 7;
              X.big('VAULT OPEN!', '#ffd23a', 1600);
              next(R2);
            }
          },
          marks(R2, add) { const d = X.places.bank.door; add(d.x, d.y, '#e9c25a', 'Drill', 2.4); },
        },
        {
          text: 'Grab the cash!',
          tick(R2) {
            const left = bagsLeft(R2);
            R2.count = (R2.data.bags - left) + ' / ' + R2.data.bags + ' bags';
            if (left === 0 || (P.loot > 0 && R2.st > 25)) { escape(R2); next(R2); }
          },
          marks: bagMark,
        },
        escapeStage(),
      ];
    },
    stages: [],
    tick(R, dt) {   // the alarm bell outside the bank
      if (R.data.bell <= 0) return;
      R.data.bell -= dt; R.data.bellT -= dt;
      if (R.data.bellT <= 0) { R.data.bellT = 0.3; R.data.ring = (R.data.ring || 0) + 1; const b = X.places.bank; if (b && dist(pos(), b.door.x, b.door.y) < 70) sfxAlarm(R.data.ring); }
    },
    on: {
      vaultOpened(R) { R.data.opened = true; },
      heistAlarm(R) { if (R.data.inside) R.data.bell = 0; },
      lootBanked(R) { if (R.stage >= 2) win(R); },
      lootLost(R) { lose(R, 'The loot is gone. So is the car park.'); },
    },
    end(R) { if (R.passed && M.getaway) M.getaway = null; },   // the Furia is yours now
    after: () => [
      'We did it. Twenty-five thousand for you, and the rest buys me a car park. With proper lines.',
      'You can keep the bus. Nobody will ever look for it.',
      'The phones will keep ringing. Odd jobs. A man has to eat. Take the bus!',
    ],
    bonus(R) { return 0; },
  });
  function escape(R) {
    setWanted(R, Math.max(4, wantedLevel()));
    X.big('ESCAPE!', '#ff4a3a', 1500, 'four stars and counting');
  }
  function escapeStage() {
    return {
      text: "Get to the getaway car and stash the loot at Trond's Garage",
      tick(R) {
        R.count = P.loot ? fmt(P.loot) : '';
        const c = R.data.getaway;
        if (P.car && P.car === c) R.sub = "Drive! Stash the loot at Trond's Garage";
        if (!P.loot) lose(R, 'The loot is gone.');
      },
      marks(R, add) {
        const c = R.data.getaway;
        if (c && !c.removed && !c.wrecked && !P.car && !X.scene && dist(pos(), c.x, c.y) < 150) add(c.x, c.y, '#d0141e', 'Furia', 3);
        hideoutMark(R, add);
      },
    };
  }

  // ================= odd jobs (after the story) =================
  const ODD = [
    { base: 'hotwheels', title: 'Repo Man', lo: 600, hi: 1400, p: () => { const m = pick(['furia', 'x5', 'voltage', 'regret', 'fjord', 'rancher']); return { model: m, color: X.MODELS[m].colors ? pick(X.MODELS[m].colors) : null, minHp: 0.45, name: pick(['banker\'s ', 'lawyer\'s ', 'ex-wife\'s ', 'influencer\'s ']) + X.MODELS[m].name, brief: R => [`A client stopped paying for a ${R.data.car.model.name}. It is parked in ${R.district}.`, `Repossess it. Bring it to my garage in one piece.`] }; } },
    { base: 'inspector', title: 'Road Rage', lo: 900, hi: 1800, p: () => ({ model: pick(['regret', 'x5', 'comet', 'fjord']), color: pick(['#c9ccd1', '#2b2d33', '#1f3f6e']), hp: 1300, label: 'Auditor', place: 'Tax Office', sign: 'SKATTEETATEN', goal: 'Wreck the tax auditor\'s car before she reaches the tax office!', arrived: 'She reached the tax office. You are being audited.', brief: R => ['A tax auditor wants to look at my books. My books are in a fjord.', `Her car is in ${R.district}. Wreck it before she gets to the tax office.`] }) },
    { base: 'restructure', title: 'Hostile Takeover', lo: 1500, hi: 2600, p: () => ({ guards: pick([2, 3]), label: 'CEO', sign: pick(['REGRET MOTORS', 'NORSKTEK AS', 'PARKERING AS']), goal: 'Restructure the CEO. Permanently.', brief: R => [`A CEO in ${R.district} is buying my competitors. And my competitors' parking spaces.`, 'He has bodyguards. Make it quick.'] }) },
    { base: 'frenzy', title: 'Kill Frenzy', lo: 1500, hi: 2500, p: () => ({ weapon: pick(['uzi', 'shotgun', 'flamer', 'electro', 'rifle']), gang: pick(['mafia', 'russ', 'metal']), need: pick([10, 12, 15]), time: pick([45, 50, 60]), brief: R => ['Another skull crate. Another gang that forgot who runs this city.', `It is in ${R.district}. You know the rules.`] }) },
    { base: 'frenzy', title: 'Rocket Frenzy', lo: 1800, hi: 2800, p: () => ({ cars: true, need: pick([6, 8, 10]), time: pick([50, 60]), brief: R => ['Traffic in this city is a disgrace. Nobody signals. Nobody parks properly.', `There is a skull crate in ${R.district}. Reduce the traffic.`] }) },
    { base: 'barbecue', title: 'Bonfire Night', lo: 1200, hi: 2200, p: () => ({ n: pick([4, 5, 6]), time: 100, gang: pick(['metal', 'russ', 'mafia']), lotName: 'NO PARKING · TOWING ENFORCED', brief: R => [`A gang has parked in a lot in ${R.district}. My lot. In spirit.`, 'Burn it all.'] }) },
    { base: 'transit', title: 'Armoured Truck', lo: 1500, hi: 2500, p: () => ({ bags: pick([4, 5, 6]), brief: R => [`Another Securicar is doing the rounds in ${R.district}.`, 'You know what to do. Bring the bags to the garage.'] }) },
    { base: 'special', title: 'Ticking Parcel', lo: 1000, hi: 1800, p: () => ({ place: pick(['Regret Motors', 'Flatpack Depot', 'Disco Fjord']), sign: pick(['REGRET MOTORS', 'FLATPACK DEPOT', 'DISCO FJORD']), brief: R => [`A box van in ${R.district}. A ticking present. You know the drill.`, 'Deliver it, walk away, do not look back. Looking back is for amateurs.'] }) },
    { base: 'bus', title: 'Rush Hour', lo: 1200, hi: 2000, p: () => ({ n: 8, need: 6, time: 70, lotName: 'PREMIUM PARKING · 1200 KR/T', brief: R => [`Somebody opened another premium car park in ${R.data.lotDistrict}.`, 'Take the bus. Through it.'] }) },
  ];
  function makeOdd(title) {
    const t = ODD.find(o => o.title === title) || pick(ODD), base = BY[t.base];
    return Object.assign({}, base, {
      id: 'odd-' + t.base, story: false, odd: true, title: 'Odd Job: ' + t.title,
      tier: pick(['green', 'yellow', 'red']), reward: Math.round(rand(t.lo, t.hi) / 50) * 50, p: t.p(),
    });
  }
  const storyDone = () => DEFS.every(d => !d.story || M.done.has(d.id));

  // ================= payphones =================
  function phoneSpotOk(x, y) {
    const C = X.city;
    if (x < 14 || y < 14 || x > C.W - 14 || y > C.H - 14 || X.roadAt(x, y)) return false;
    if (X.blocked(x, y, 0.95)) return false;
    for (const l of lampsNear(x, y)) if (Math.abs(l.x - x) < 2.2 && Math.abs(l.y - y) < 2.2) return false;
    for (const d of doorsNear(x, y)) if (Math.abs(d.x - x) < 3.2 && Math.abs(d.y - y) < 3.2) return false;
    for (const id in X.places) {
      const pl = X.places[id], d = pl.door;
      if (Math.hypot(d.x - x, d.y - y) < 5) return false;
      if (pl.pad && Math.abs(pl.pad.x - x) < pl.pad.w / 2 + 2.5 && Math.abs(pl.pad.y - y) < pl.pad.h / 2 + 2.5) return false;
    }
    for (const c of X.cars) if (!c.removed && Math.abs(c.x - x) < c.len / 2 + 1 && Math.abs(c.y - y) < c.len / 2 + 1) return false;
    return true;
  }
  function kerbCandidates() {
    const out = [];
    for (const b of X.city.blocks) {
      for (let side = 0; side < 4; side++) for (let k = 0; k < 2; k++) {
        const t = rand(0.22, 0.78), ins = 0.9;
        let x, y, nx = 0, ny = 0;
        if (side === 0) { x = b.x0 + (b.x1 - b.x0) * t; y = b.y0 + ins; ny = -1; }
        else if (side === 1) { x = b.x0 + (b.x1 - b.x0) * t; y = b.y1 - ins; ny = 1; }
        else if (side === 2) { x = b.x0 + ins; y = b.y0 + (b.y1 - b.y0) * t; nx = -1; }
        else { x = b.x1 - ins; y = b.y0 + (b.y1 - b.y0) * t; nx = 1; }
        if (phoneSpotOk(x, y)) out.push({ x, y, nx, ny });
      }
    }
    return out;
  }
  // Every valid booth spot along the kerbs rMin..rMax from (x, y), scanned in 1.5 m steps.
  function kerbScan(x, y, rMin, rMax) {
    const out = [], ins = 0.9;
    for (const b of X.city.blocks) {
      if (b.x1 < x - rMax || b.x0 > x + rMax || b.y1 < y - rMax || b.y0 > y + rMax) continue;
      for (let side = 0; side < 4; side++) {
        const horiz = side < 2, L = horiz ? b.x1 - b.x0 : b.y1 - b.y0;
        for (let u = 4; u < L - 4; u += 1.5) {
          const q = horiz ? { x: b.x0 + u, y: side === 0 ? b.y0 + ins : b.y1 - ins, nx: 0, ny: side === 0 ? -1 : 1 } : { x: side === 2 ? b.x0 + ins : b.x1 - ins, y: b.y0 + u, nx: side === 2 ? -1 : 1, ny: 0 };
          const d = Math.hypot(q.x - x, q.y - y);
          if (d >= rMin && d <= rMax && phoneSpotOk(q.x, q.y)) out.push(q);
        }
      }
    }
    return out;
  }
  function placePhones() {
    const cands = kerbCandidates(), out = [];
    if (!cands.length) return out;
    const take = (q, tier) => {
      const ph = { i: out.length, x: q.x, y: q.y, nx: q.nx, ny: q.ny, rot: Math.atan2(q.ny, q.nx) + Math.PI / 2, tier, mission: null, district: X.districtAt(q.x, q.y) };
      ph.solid = { kind: 'phone', phone: ph, poly: PG.obb(q.x, q.y, 1.15, 1.15, 0) };
      PG.cityPut(X.city, ph.solid);
      out.push(ph);
      cands.splice(cands.indexOf(q), 1);
    };
    const near = (x, y, lo, hi) => {
      const list = kerbScan(x, y, lo, hi); if (!list.length) return null;
      let best = null, bd = Infinity;
      for (const q of list) { const d = Math.abs(Math.hypot(q.x - x, q.y - y) - (lo + hi) / 2) + Math.random() * 6; if (d < bd) { bd = d; best = q; } }
      cands.push(best);
      return best;
    };
    for (let k = 0; k < PHONE_TIERS.length && cands.length; k++) {
      const tier = PHONE_TIERS[k];
      let q = null;
      if (k === 0 && X.places.hideout) { const d = X.places.hideout.door; q = near(d.x, d.y, 8, 40) || near(d.x, d.y, 8, 90); }
      if (tier === 'bank' && X.places.bank) { const d = X.places.bank.door; q = near(d.x, d.y, 12, 60) || near(d.x, d.y, 12, 130); }
      if (!q) {   // farthest from every phone so far, a little shuffled
        let bd = -1;
        for (const c of cands) {
          let d = Infinity; for (const o of out) d = Math.min(d, Math.hypot(o.x - c.x, o.y - c.y));
          if (!out.length) d = Math.hypot(c.x - X.city.W / 2, c.y - X.city.H / 2);
          d *= rand(0.8, 1);
          if (d > bd) { bd = d; q = c; }
        }
      }
      if (q) take(q, tier);
    }
    return out;
  }
  function available() {
    const out = [];
    for (const d of DEFS) if (d.story && !M.done.has(d.id) && d.req.every(r => M.done.has(r))) out.push(d);
    if (!out.length && storyDone()) { if (!M.odd) M.odd = makeOdd(); out.push(M.odd); }
    return out;
  }
  function assignPhones() {
    for (const ph of M.phones) ph.mission = null;
    if (M.run) return;
    for (const d of available()) {
      let ph = M.phones.find(q => !q.mission && q.tier === d.tier);
      if (!ph && d.odd) ph = M.phones.find(q => !q.mission && q.tier !== 'bank');
      if (!ph) ph = M.phones.find(q => !q.mission && d.tier !== 'bank' && q.tier !== 'bank');
      if (ph) ph.mission = d;
    }
    if (M.introT > 0 || M.hushT > 0 || P.state !== 'play' || M.call) return;
    for (const ph of M.phones) {
      if (!ringing(ph) || M.notified.has(ph.mission.id)) continue;
      M.notified.add(ph.mission.id);
      X.pager(`RING RING: a ${TIER[ph.tier].name.toLowerCase()} is ringing in ${ph.district}.`, 4500);
      break;
    }
  }
  const ringing = ph => !!ph.mission && !M.run && M.quietT <= 0;
  function nearPhone(r) {
    if (!M || P.car || !P.ped) return null;
    let best = null, bd = r;
    for (const ph of M.phones) { const d = Math.hypot(ph.x - P.ped.x, ph.y - P.ped.y); if (d < bd) { bd = d; best = ph; } }
    return best;
  }
  function phonesTick(dt) {
    M.assignT -= dt;
    if (M.assignT <= 0) { M.assignT = 0.5; assignPhones(); }
    if (M.introT > 0) {
      M.introT -= dt;
      if (M.introT <= 0 && !M.run && P.state === 'play') {
        const ph = M.phones.find(q => q.mission);
        for (const q of M.phones) if (q.mission) M.notified.add(q.mission.id);
        if (ph) X.pager(M.done.size ? `RING RING: a ${TIER[ph.tier].name.toLowerCase()} is ringing in ${ph.district}. Trond has work.` : "Trond: There is a phone ringing near the garage. Answer it. Walk up and press F.", 6500);
      }
    }
    const p = pos();
    let near = null, nd = 55;
    for (const ph of M.phones) {
      if (ringing(ph)) {
        X.blip(ph.x, ph.y, TIER[ph.tier].color, { edge: true, size: 4.6, ring: Math.floor(X.time * 3) % 2 === 0, shape: 'square' });
        const d = Math.hypot(ph.x - p.x, ph.y - p.y); if (d < nd) { nd = d; near = ph; }
      } else X.blip(ph.x, ph.y, '#6b7080', { size: 2 });
    }
    M.ringT -= dt;
    if (M.ringT <= 0) { M.ringT = 2.7; if (near && !X.scene && P.state === 'play') sfxRing(cl(1.15 - nd / 55, 0.1, 1)); }
  }
  const phoneUse = {
    test() {
      if (!live() || P.state !== 'play' || P.car) return null;
      const c = M.call, cp = c && c.run && c.run.phone;
      if (c && c.lines.length > 1 && ((cp && Math.hypot(cp.x - P.ped.x, cp.y - P.ped.y) < 3.5) || !X.nearestEnterableCar())) return { text: 'F: Next', priority: 60, run: callNext };
      const ph = nearPhone(1.9); if (!ph) return null;
      if (ringing(ph)) return { text: 'F: Answer the phone', priority: 40, run: () => answer(ph) };
      if (!M.run && !M.call && !X.nearestEnterableCar()) return { text: 'F: Call Trond', priority: 2, run: () => { sfxPick(); openCall([pick(VOICEMAIL)], { mood: 0.2 }); } };
      return null;
    },
  };
  function answer(ph) {
    if (!live() || !ph.mission || M.run) return null;
    if (M.call) closeCall(true);   // Trond's last remark can wait
    sfxPick();
    const d = ph.mission, R = begin(d, ph, true);
    if (!R) { openCall(['Wrong number. Call back in a minute.'], { mood: 0.4 }); M.quietT = 12; return null; }
    let lines = [];
    try { lines = d.brief ? d.brief(R) : []; } catch (e) { console.error('[gta] missions.' + d.id + ' brief failed:', e); }
    openCall(lines.length ? lines : [R.text], { mood: d.mood || 0.12, run: R, after() { R.brief = false; announce(R); } });
    return R;
  }

  // ================= Trond on the pager =================
  function openCall(lines, o) {
    if (!live()) return;
    if (M.call) closeCall(true);
    const h = hudEls();
    M.call = { lines, i: -1, wait: 0, tk: null, mood: o.mood || 0.1, run: o.run || null, after: o.after || null, age: 0 };
    X.pager('');
    if (h) { h.call.hidden = false; h.call.style.setProperty('--mc', o.run ? TIER[o.run.tier].color : '#9cff8a'); h.callTier.textContent = o.run ? o.run.title.toUpperCase() : ''; h.skip.hidden = lines.length < 2; }
    nextLine();
  }
  function nextLine() {
    const c = M.call; if (!c) return;
    c.i++; c.wait = 0; c.age = 0;
    if (c.i >= c.lines.length) { closeCall(); return; }
    const h = hudEls(), text = c.lines[c.i];
    c.tk = null;
    if (h && PG.ui && PG.ui.speak) c.tk = PG.ui.speak(h.line, text, { panic: c.mood * 0.5 });
    else if (h) h.line.textContent = text;
  }
  function callNext() { const c = M && M.call; if (!c) return; if (c.tk && !c.tk.done) { c.tk.finish(); c.wait = 0.6; return; } nextLine(); }
  function closeCall(silent) {
    const c = M && M.call; if (!c) return;
    M.call = null;
    if (c.tk && !c.tk.done) c.tk.finish();
    if (PG.audio && PG.audio.yapStop) PG.audio.yapStop();
    if (H) H.call.hidden = true;
    if (!silent && c.after) c.after();
  }
  function callTick(dt) {
    const c = M.call;
    c.age += dt;
    const done = !c.tk || c.tk.done;
    if (done) c.wait += dt;
    const total = c.tk && c.tk.plan ? c.tk.plan.total : 2;
    if ((done && c.wait > 1.35) || c.age > total + 6) nextLine();
  }

  // ================= Trond's Garage =================
  // The roller door goes beside the hideout's front door, on the side of the facade with more room
  // (or the side given, when there is room for it there).
  function setupGarage(side) {
    const h = X.places.hideout; if (!h) return null;
    const b = h.b, d = h.door, W = 3.8, ux = d.ny, uy = -d.nx;
    const wx = d.x - d.nx * 0.9, wy = d.y - d.ny * 0.9;
    const along = (wx - (b.x0 + b.x1) / 2) * ux + (wy - (b.y0 + b.y1) / 2) * uy;
    const half = Math.abs(ux) > 0.5 ? (b.x1 - b.x0) / 2 : (b.y1 - b.y0) / 2;
    const off = W / 2 + 1.6, sg = side || (half - along >= half + along ? 1 : -1);
    if (side && half - along * sg < off + W / 2 + 0.4) return null;
    const gx = wx + ux * off * sg, gy = wy + uy * off * sg;
    const st = streetOf({ x: gx + d.nx * 0.9, y: gy + d.ny * 0.9, nx: d.nx, ny: d.ny });
    const z = kerbSpot(st.x + d.nx * 2.5, st.y + d.ny * 2.5, 5, 1.8);
    return { x: gx, y: gy, nx: d.nx, ny: d.ny, rot: Math.atan2(d.ny, d.nx) - Math.PI / 2, w: W, sg, side: (b.x1 - b.x0), zone: { x: z.x, y: z.y, r: 4.4, garage: true, label: "Trond's Garage" }, walk: Math.hypot(st.x - gx, st.y - gy) };
  }
  function swallow(c) {
    const g = M.garage; if (!g) { X.removeCar(c); return; }
    X.removeCar(c);
    const out = g.walk + 1.2;
    M.ghosts.push({ c, t: 0, x0: c.x, y0: c.y, th0: c.th, bx: g.x + g.nx * out, by: g.y + g.ny * out, ex: g.x - g.nx * (c.len / 2 + 4.5), ey: g.y - g.ny * (c.len / 2 + 4.5), th1: Math.atan2(-g.ny, -g.nx) });
    if (dist(pos(), g.x, g.y) < 60) sfxShutter();
  }
  function ghostsTick(dt) {
    for (const g of M.ghosts) {
      g.t += dt;
      const c = g.c;
      if (g.t < 1.0) { const k = smooth(g.t / 1.0); c.x = g.x0 + (g.bx - g.x0) * k; c.y = g.y0 + (g.by - g.y0) * k; c.th = g.th0 + wrap(g.th1 - g.th0) * k; }
      else { const k = smooth((g.t - 1.0) / 1.6); c.x = g.bx + (g.ex - g.bx) * k; c.y = g.by + (g.ey - g.by) * k; c.th = g.th1; }
      c.braking = g.t > 2.2; c.lightsOn = true;
    }
    if (M.ghosts.length && M.ghosts[0].t > 3.1) M.ghosts.shift();
    const want = M.ghosts.length ? 1 : 0;
    M.shutter += cl(want - M.shutter, -dt * 1.3, dt * 1.8);
  }

  // ================= HUD =================
  const CSS = `
#gta-hud .m-box { --mc: #ffd23a; max-width: 280px; background: rgba(10,11,14,0.82); border-left: 4px solid var(--mc); border-radius: 4px; padding: 5px 10px 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
#gta-hud .m-box .m-t { font-family: var(--display); font-size: 14px; letter-spacing: 0.05em; color: var(--mc); text-shadow: 0 2px 0 #000; text-transform: uppercase; }
#gta-hud .m-box .m-o { font-weight: 800; font-size: 14px; line-height: 1.25; text-shadow: 0 2px 0 #000; }
#gta-hud .m-box .m-o.sub { color: #ffb07a; }
#gta-hud .m-box .m-c { font-family: var(--display); font-size: 17px; color: #ffd23a; text-shadow: 0 2px 0 #000; font-variant-numeric: tabular-nums; }
#gta-hud .m-box .m-b { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #c9cdd6; }
#gta-hud .m-box .m-b span { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.15); overflow: hidden; }
#gta-hud .m-box .m-b i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ffb02e, #ffe27a); }
#gta-hud .m-timer { position: absolute; left: 50%; top: calc(98px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); font-family: var(--display); font-size: clamp(28px, 5vw, 44px); color: #ffd23a; text-shadow: 0 4px 0 #000, 0 0 16px rgba(0,0,0,0.6); font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
#gta-hud .m-timer.low { color: #ff4a3a; animation: mlow .5s steps(2) infinite; }
@keyframes mlow { 50% { color: #ffffff; } }
#gta-hud .m-call { --mc: #9cff8a; position: absolute; left: 50%; top: calc(14px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); width: min(600px, calc(100vw - 380px)); min-width: 300px; display: flex; gap: 10px; align-items: flex-start; background: #1d2b1e; border: 3px solid #0e140e; border-radius: 10px; box-shadow: inset 0 0 0 2px #3c5a3c, 0 10px 28px rgba(0,0,0,0.55); padding: 8px 12px 8px 8px; font-family: 'Courier New', monospace; font-weight: 700; font-size: 15px; color: #9cff8a; text-shadow: 0 0 6px rgba(120,255,100,0.5); line-height: 1.3; pointer-events: auto; cursor: pointer; z-index: 3; animation: mcall .28s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes mcall { from { transform: translate(-50%, -24px); opacity: 0; } }
#gta-hud .m-call canvas { width: 68px; height: 68px; flex: none; border-radius: 6px; border: 2px solid #0e140e; background: #9fc3d9; }
#gta-hud .m-call .m-cb { flex: 1; min-width: 0; }
#gta-hud .m-call .m-who { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; letter-spacing: 0.12em; color: #d6ffcc; }
#gta-hud .m-call .m-who b { color: var(--mc); text-shadow: none; }
#gta-hud .m-call .m-line { min-height: 2.6em; margin-top: 2px; }
#gta-hud .m-call .m-skip { font-size: 11px; opacity: 0.55; text-align: right; }
@media (max-width: 600px) { #gta-hud .m-call { width: calc(100vw - 24px); min-width: 0; top: calc(100px + env(safe-area-inset-top, 0px)); font-size: 13px; } #gta-hud .m-call canvas { width: 52px; height: 52px; } #gta-hud .m-timer { top: calc(178px + env(safe-area-inset-top, 0px)); } #gta-hud .m-box { max-width: 190px; } }
`;
  function hudEls() {
    if (H && H.root.isConnected && H.box.isConnected) return H;
    const root = document.getElementById('gta-hud'); if (!root) return null;
    if (!document.getElementById('gta-missions-css')) { const st = document.createElement('style'); st.id = 'gta-missions-css'; st.textContent = CSS; document.head.appendChild(st); }
    const tl = root.querySelector('.g-tl') || root;
    let box = root.querySelector('.m-box');
    if (!box) { box = document.createElement('div'); box.className = 'm-box'; box.hidden = true; box.innerHTML = '<div class="m-t"></div><div class="m-o"></div><div class="m-c" hidden></div><div class="m-b" hidden><span><i></i></span><em></em></div>'; tl.appendChild(box); }
    let timer = root.querySelector('.m-timer');
    if (!timer) { timer = document.createElement('div'); timer.className = 'm-timer'; timer.hidden = true; root.appendChild(timer); }
    let call = root.querySelector('.m-call');
    if (!call) {
      call = document.createElement('div'); call.className = 'm-call'; call.hidden = true;
      call.innerHTML = '<canvas width="136" height="136"></canvas><div class="m-cb"><div class="m-who"><span>TROND</span><b></b></div><div class="m-line"></div><div class="m-skip">F or tap: next</div></div>';
      call.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (live()) callNext(); });
      root.appendChild(call);
    }
    const face = call.querySelector('canvas'), fc = face.getContext('2d');
    // drawTrondFace ends with the parking game's window pillar down the middle; a phone call has no window
    fc.stroke = function () { if (this.strokeStyle === '#6f6a5c') return; CanvasRenderingContext2D.prototype.stroke.call(this); };
    H = { root, box, t: box.querySelector('.m-t'), o: box.querySelector('.m-o'), c: box.querySelector('.m-c'), b: box.querySelector('.m-b'), bi: box.querySelector('.m-b i'), bl: box.querySelector('.m-b em'), timer, call, face, line: call.querySelector('.m-line'), callTier: call.querySelector('.m-who b'), skip: call.querySelector('.m-skip'), k: {} };
    return H;
  }
  function put(key, v, fn) { if (H.k[key] !== v) { H.k[key] = v; fn(v); } }
  function hudTick() {
    const h = hudEls(); if (!h) return;
    const R = M && M.run, show = !!R && !R.over;
    put('show', show, v => { h.box.hidden = !v; });
    if (show) {
      put('mc', TIER[R.tier] ? TIER[R.tier].color : '#ffd23a', v => h.box.style.setProperty('--mc', v));
      put('t', R.title, v => { h.t.textContent = v; });
      const o = R.brief ? 'Trond is on the line...' : (R.sub || R.text);
      put('o', o, v => { h.o.textContent = v; });
      put('sub', !!R.sub && !R.brief, v => h.o.classList.toggle('sub', v));
      put('c', R.count || '', v => { h.c.hidden = !v; h.c.textContent = v; });
      const bar = R.bar == null ? -1 : Math.round(cl(R.bar, 0, 1) * 100);
      put('bar', bar, v => { h.b.hidden = v < 0; if (v >= 0) h.bi.style.width = v + '%'; });
      put('bl', R.barLabel || '', v => { h.bl.textContent = v; });
    }
    const tm = show && !R.brief && R.timer != null ? Math.ceil(R.timer) : -1;
    put('tm', tm, v => { h.timer.hidden = v < 0; if (v >= 0) h.timer.textContent = Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); });
    put('low', tm >= 0 && tm <= 10, v => h.timer.classList.toggle('low', v));
    const c = M && M.call;
    if (c) {
      if (G().status !== 'play' && c.tk && !c.tk.done) c.tk.finish();
      const talking = !!(c.tk && !c.tk.done);
      if (PG.ui && PG.ui.drawTrondFace) PG.ui.drawTrondFace(h.face, c.mood, performance.now() / 1000, false, talking);
    }
  }

  // ================= drawing =================
  function drawPhone(ctx, ph, t) {
    const col = TIER[ph.tier].color, ring = ringing(ph);
    const sh = ring ? Math.sin(t * 70) * 0.035 : 0;
    ctx.save(); ctx.translate(ph.x + sh, ph.y); ctx.rotate(ph.rot);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(-0.48, -0.46, 1.2, 1.2);
    ctx.fillStyle = '#1b1e24'; PG.rr(ctx, -0.6, -0.6, 1.2, 1.2, 0.12); ctx.fill();
    ctx.fillStyle = 'rgba(150,205,225,0.6)'; ctx.fillRect(-0.51, -0.51, 1.02, 1.02);
    ctx.fillStyle = col; PG.rr(ctx, -0.44, -0.48, 0.88, 0.9, 0.08); ctx.fill();
    // lamp strip on the street side
    ctx.fillStyle = ring && Math.floor(t * 7) % 2 ? '#ffffff' : 'rgba(255,255,255,0.3)'; ctx.fillRect(-0.36, 0.47, 0.72, 0.09);
    ctx.restore();
    // the handset on the roof, always upright
    ctx.save(); ctx.translate(ph.x + sh, ph.y - 0.03);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 0.33, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0.16, 0.22, Math.PI + 0.5, TAU - 0.5); ctx.stroke();
    ctx.fillStyle = '#ffffff'; PG.rr(ctx, -0.27, -0.02, 0.15, 0.1, 0.04); ctx.fill(); PG.rr(ctx, 0.12, -0.02, 0.15, 0.1, 0.04); ctx.fill();
    ctx.lineCap = 'butt';
    ctx.restore();
  }
  function drawRingWaves(ctx, ph, t) {
    const col = TIER[ph.tier].color;
    ctx.strokeStyle = col; ctx.lineWidth = 0.12;
    for (let k = 0; k < 2; k++) {
      const f = (t * 1.4 + k * 0.5) % 1, r = 0.9 + f * 1.8;
      ctx.globalAlpha = (1 - f) * 0.9;
      ctx.beginPath(); ctx.arc(ph.x, ph.y, r, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(ph.x, ph.y, r, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const by = ph.y - 1.6 - Math.abs(Math.sin(t * 6)) * 0.25;
    ctx.font = '0.62px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 0.14; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText('RING!', ph.x, by);
    ctx.fillStyle = col; ctx.fillText('RING!', ph.x, by);
  }
  function drawGarage(ctx, t) {
    const g = M.garage; if (!g || !X.inView(g.x, g.y, 30)) return;
    const W = g.w, open = smooth(M.shutter);
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot);
    // local frame: x along the wall, +y out to the street, -y into the building
    if (open > 0.01) {
      ctx.fillStyle = '#07080a'; ctx.fillRect(-W / 2, -6 * open, W, 6 * open);
      if (M.ghosts.length) {
        ctx.save();
        ctx.beginPath(); ctx.rect(-W / 2, -7, W, 7.02); ctx.rect(-16, 0, 32, 34); ctx.clip();
        ctx.rotate(-g.rot); ctx.translate(-g.x, -g.y);
        for (const gh of M.ghosts) X.drawCar(ctx, gh.c, t);
        ctx.restore();
        const gr = ctx.createLinearGradient(0, 0, 0, -4.5); gr.addColorStop(0, 'rgba(7,8,10,0)'); gr.addColorStop(1, 'rgba(7,8,10,1)');
        ctx.fillStyle = gr; ctx.fillRect(-W / 2, -6, W, 6);
      }
    }
    // frame posts, the rolled-up drum and the slats still down
    ctx.fillStyle = '#2a2c31'; ctx.fillRect(-W / 2 - 0.35, -0.7, 0.35, 0.75); ctx.fillRect(W / 2, -0.7, 0.35, 0.75);
    const down = 1 - open;
    if (down > 0.02) {
      ctx.fillStyle = '#8d939c'; ctx.fillRect(-W / 2, -0.55, W, 0.55);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) ctx.fillRect(-W / 2, -0.55 + i * 0.1, W, 0.03);
    }
    ctx.fillStyle = '#4a4e56'; ctx.fillRect(-W / 2, -0.75, W, 0.2);
    // hazard stripes on the pavement in front
    ctx.save(); ctx.beginPath(); ctx.rect(-W / 2, 0.15, W, 0.45); ctx.clip();
    for (let x = -W / 2 - 1; x < W / 2 + 1; x += 0.5) { ctx.fillStyle = Math.round(x * 2) % 2 ? '#e3b23c' : '#1b1b1b'; ctx.beginPath(); ctx.moveTo(x, 0.15); ctx.lineTo(x + 0.25, 0.15); ctx.lineTo(x + 0.55, 0.6); ctx.lineTo(x + 0.3, 0.6); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.restore();
    // a DELIVERIES sign on the roof above the door, always upright
    const ins = Math.abs(g.nx) > 0.5 ? 2.6 : 2.5, sx = g.x - g.nx * ins, sy = g.y - g.ny * ins;
    ctx.fillStyle = 'rgba(12,13,16,0.92)'; PG.rr(ctx, sx - 1.95, sy - 0.5, 3.9, 1.0, 0.18); ctx.fill();
    ctx.strokeStyle = '#e3b23c'; ctx.lineWidth = 0.07; ctx.stroke();
    ctx.font = '0.52px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = M.shutter > 0.05 || Math.sin(t * 2.2) > -0.85 ? '#ffd23a' : '#7a6420'; ctx.fillText('DELIVERIES', sx, sy + 0.03);
  }
  function drawLot(ctx, L, t) {
    if (!X.inView(L.cx, L.cy, 40)) return;
    if (L.kind === 'plaza') { ctx.fillStyle = 'rgba(28,30,34,0.85)'; ctx.fillRect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0); }
    ctx.strokeStyle = 'rgba(236,232,220,0.75)'; ctx.lineWidth = 0.12;
    for (const q of L.bays) {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.th);
      ctx.strokeRect(-2.55, -1.3, 5.1, 2.6);
      ctx.restore();
    }
    const sx = L.cx, sy = L.kind === 'plaza' ? L.y0 - 1.2 : L.cy;
    ctx.font = '0.8px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.min(22, L.title.length * 0.62 + 1.5);
    ctx.fillStyle = 'rgba(10,11,14,0.85)'; ctx.fillRect(sx - w / 2, sy - 0.65, w, 1.3);
    ctx.fillStyle = L.color; ctx.fillText(L.title, sx, sy + 0.04);
  }
  function drawSign(ctx, s) {
    const b = s.b, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (!X.inView(cx, cy, 20)) return;
    const w = Math.min(b.x1 - b.x0 - 1, s.text.length * 0.75 + 1.4);
    ctx.fillStyle = 'rgba(10,11,14,0.88)'; PG.rr(ctx, cx - w / 2, cy - 0.85, w, 1.7, 0.25); ctx.fill();
    ctx.strokeStyle = s.color; ctx.lineWidth = 0.1; ctx.stroke();
    ctx.font = '0.95px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = s.color; ctx.fillText(s.text, cx, cy + 0.05, w - 0.6);
  }
  function drawBag(ctx, it, t) {
    const bob = Math.sin(t * 4 + it.ph) * 0.05;
    ctx.save(); ctx.translate(it.x, it.y + bob); ctx.rotate(Math.sin(it.ph) * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0.08, 0.1 - bob, 0.36, 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9a7a44'; ctx.beginPath(); ctx.ellipse(0, 0.04, 0.34, 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a5e30'; ctx.beginPath(); ctx.moveTo(-0.12, -0.2); ctx.lineTo(0.12, -0.2); ctx.lineTo(0.06, -0.34); ctx.lineTo(-0.06, -0.34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5fdc6e'; ctx.font = '700 0.36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.06);
    if ((t * 2 + it.ph) % 3 < 0.25) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(0.12, -0.12, 0.06, 0.06); }
    ctx.restore();
  }
  function drawSkull(ctx, it, t) {
    const bob = Math.sin(t * 3) * 0.08;
    ctx.save(); ctx.translate(it.x, it.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0.1, 0.25 - bob, 0.6, 0.4, 0, 0, TAU); ctx.fill();
    ctx.rotate(Math.sin(t * 1.7) * 0.35);
    ctx.fillStyle = '#b3141c'; PG.rr(ctx, -0.55, -0.55, 1.1, 1.1, 0.12); ctx.fill();
    ctx.strokeStyle = '#3a0508'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.fillStyle = '#f4f0e6'; ctx.beginPath(); ctx.arc(0, -0.06, 0.3, 0, TAU); ctx.fill(); ctx.fillRect(-0.17, 0.12, 0.34, 0.2);
    ctx.fillStyle = '#16080a'; ctx.beginPath(); ctx.arc(-0.12, -0.08, 0.085, 0, TAU); ctx.arc(0.12, -0.08, 0.085, 0, TAU); ctx.fill();
    ctx.fillRect(-0.03, 0.04, 0.06, 0.08); for (let i = -1; i <= 1; i++) ctx.fillRect(i * 0.1 - 0.015, 0.2, 0.03, 0.12);
    ctx.restore();
  }
  function chevron(ctx, x, y, color, t, s) {
    s = s || 1;
    const by = y - 0.4 * Math.abs(Math.sin(t * 5 + x));
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 0.08 * s;
    ctx.beginPath(); ctx.moveTo(x - 0.45 * s, by - 0.5 * s); ctx.lineTo(x + 0.45 * s, by - 0.5 * s); ctx.lineTo(x, by + 0.1 * s); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  function addMark(x, y, color, label, radius) {
    if (X.scene ? x < 2900 : x >= 2900) return;
    X.objective(x, y, { color, label, radius });
  }

  // ================= events =================
  const FWD = ['pedKilled', 'pedHurt', 'carDestroyed', 'carImpact', 'carHurt', 'loot', 'lootBanked', 'lootLost', 'vaultOpened', 'heistAlarm', 'gunfire', 'explosion', 'pedHitByCar', 'pedEjected', 'carjack', 'enterCar', 'exitCar', 'sceneChange'];
  for (const type of FWD) X.on(type, e => {
    if (!live() || !M.run || M.run.over) return;
    const R = M.run, h = R.def.on && R.def.on[type];
    // plot armour: mission targets shrug off most knocks that are not the player's doing
    if (type === 'carHurt' && R.armour && e.kind === 'crash' && !X.byPlayer(e.by) && R.armour.includes(e.car)) e.car.hp = Math.min(e.car.maxHp, e.car.hp + e.amount * 0.8);
    if (h) h(R, e);
    if (R.over || !R.peds.length) return;
    if (type === 'pedHurt' || type === 'pedHitByCar' || type === 'pedKilled') {
      if (R.pedSet.has(e.ped)) { if (type !== 'pedKilled') alarm(R); rile(R, e.ped.x, e.ped.y); }
    }
    else if (type === 'gunfire' || type === 'explosion') {
      if (e.by && R.pedSet.has(e.by)) return;
      const r = type === 'gunfire' ? (e.radius || 34) : 40;
      for (const p of R.peds) if (!p.dead && Math.abs(p.x - e.x) < r && Math.abs(p.y - e.y) < r) { alarm(R); break; }
    }
  });
  X.on('wasted', () => { if (live() && M.run) lose(M.run, 'You got wasted.'); if (live() && M.call) closeCall(true); });
  X.on('busted', () => { if (live() && M.run) lose(M.run, 'You got busted.'); if (live() && M.call) closeCall(true); });
  X.on('respawn', () => {
    if (!live()) return;
    M.hushT = 5;   // let the bail or hospital bill sit on the pager for a moment
    if (M.deferBig) { X.big('MISSION FAILED!', '#e8402f', 3200, M.deferBig); M.deferBig = null; }
  });

  // ================= API =================
  X.missions = {
    get active() { const R = M && M.run; return R && !R.over ? { id: R.id, title: R.title, stage: R.stage, text: R.sub || R.text, timer: R.timer, brief: R.brief } : null; },
    list() {
      if (!M) return [];
      const av = new Set(available());
      return DEFS.filter(d => d.story).map(d => ({ id: d.id, title: d.title, tier: d.tier, reward: d.reward, done: M.done.has(d.id), available: av.has(d), ringing: M.phones.some(ph => ph.mission === d && ringing(ph)) }));
    },
    start(id, o) {
      if (!live() || M.run) return false;
      const d = id && typeof id === 'object' ? id : BY[id] || (id === 'odd' ? (M.odd || (M.odd = makeOdd())) : null);
      if (!d) return false;
      if (M.call) closeCall(true);
      const brief = !!(o && o.brief);
      if (brief) { const ph = M.phones.find(q => q.mission === d) || M.phones[0]; ph && (ph.mission = d); M.quietT = 0; return !!(ph && answer(ph)); }
      return !!begin(d, null, false);
    },
    pass() { if (M && M.run) { win(M.run); return true; } return false; },
    fail(reason) { if (M && M.run) { lose(M.run, reason || 'Called off.'); return true; } return false; },
    answer(i) { const ph = M && M.phones[i]; if (!ph) return null; M.quietT = 0; return answer(ph); },
    skip() { if (M && M.call) { closeCall(); return true; } return false; },
    get phones() { return M ? M.phones : []; },
    get run() { return M ? M.run : null; },
    get call() { return M ? M.call : null; },
    get garage() { return M ? M.garage : null; },
    get getaway() { return M ? M.getaway : null; },
    get odd() { return M ? M.odd : null; },
    oddJob: title => (M ? makeOdd(title) : null),
    oddTitles: () => ODD.map(o => o.title),
    done: id => !!M && M.done.has(id),
    defs: DEFS, BY, vaultPos, vaultSpot, alleySpot, findLot,
  };

  X.mod('missions', {
    order: 60,
    init() {
      if (M && M.call) closeCall(true);
      M = fresh();
      const s = sv();
      for (const id of s.done || []) if (BY[id]) M.done.add(id);
      M.oddN = s.odd || 0;
      M.phones = placePhones();
      M.garage = setupGarage();
      X.interactions.push(phoneUse);
      const h = hudEls();
      if (h) { h.k = {}; h.box.hidden = true; h.timer.hidden = true; h.call.hidden = true; }
      assignPhones();
    },
    stop() {
      if (M && M.call) closeCall(true);
      if (M && M.run) { const R = M.run; R.over = true; if (R.def.end) { try { R.def.end(R); } catch (e) { /* the world is going away anyway */ } } }
      if (H) { H.box.hidden = true; H.timer.hidden = true; H.call.hidden = true; H.k = {}; }
      M = null;
    },
    tick(dt) {
      if (!M) return;
      M.quietT -= dt; M.hushT -= dt;
      if (M.call) callTick(dt);
      ghostsTick(dt);
      if (M.flash) { M.flash.t -= dt; if (M.flash.t <= 0) M.flash = null; }
      if (!M.garageSeen && M.garage) {   // keep clear of the shops module's parking bay (it sets up after us)
        M.garageSeen = true;
        const bay = X.shops && X.shops.garage && X.shops.garage.c;
        if (bay && Math.hypot(bay.x - M.garage.x, bay.y - M.garage.y) < 9 && !M.ghosts.length && !(M.run && M.run.data.dz === M.garage.zone)) {
          const alt = setupGarage(-M.garage.sg);
          if (alt) M.garage = alt;
        }
      }
      if (M.slide) {
        const sl = M.slide, c = sl.c; sl.t += dt;
        if (c.removed || c.wrecked || P.car === c || c.driver) M.slide = null;
        else { const k = smooth(sl.t / 1.1); X.placeCar(c, sl.x0 + (sl.x1 - sl.x0) * k, sl.y0 + (sl.y1 - sl.y0) * k, sl.th0 + wrap(sl.th1 - sl.th0) * k); if (sl.t >= 1.1) M.slide = null; }
      }
      if (M.deferBig) { M.deferT -= dt; if (M.deferT <= 0 && P.state === 'play') { X.big('MISSION FAILED!', '#e8402f', 3000, M.deferBig); M.deferBig = null; } }
      if (M.run) runTick(M.run, dt);
      else phonesTick(dt);
      if (M.signs.length && M.signs.some(s => s.run !== M.run)) M.signs = M.signs.filter(s => s.run === M.run);
      if (M.reactT > 0) {
        M.reactT -= dt;
        if (M.reactT <= 0 && M.react && !M.call && P.state === 'play') { if (!M.run) openCall(M.react, { mood: M.reactMood }); M.react = null; }
      }
    },
    hud() { if (M) hudTick(); },
    render: {
      ground(ctx, view, t) {
        if (!M || X.scene) { if (M) pushMarks(); return; }
        const R = M.run;
        if (R && R.data.lot) drawLot(ctx, R.data.lot, t);
        pushMarks();
      },
      props(ctx, view, t) {
        if (!M || X.scene) return;
        for (const ph of M.phones) {
          if (!X.inView(ph.x, ph.y, 3)) continue;
          drawPhone(ctx, ph, t);
          if (ringing(ph)) X.addLight(ph.x, ph.y, 5.5, TIER[ph.tier].color, 0.55 + 0.35 * Math.sin(t * 9));
          else X.addLight(ph.x, ph.y, 2.2, '#cfe8ff', 0.3);
        }
        const R = M.run;
        if (R) {
          const v = R.data.van;
          if (v && R.data.bomb && R.stage >= 1 && !v.wrecked && !v.removed && R.data.led > 0) X.addLight(v.x, v.y, 4, '#ff2a1a', 0.9);
          const sk = R.data.skull;
          if (sk && !sk.taken && X.inView(sk.x, sk.y, 4)) X.addLight(sk.x, sk.y, 4, '#ff3b2f', 0.6 + 0.3 * Math.sin(t * 5));
        }
        if (M.flash) X.addLight(M.flash.x, M.flash.y, 9, '#ffffff', M.flash.t * 4);
      },
      buildings(ctx, view, t) {
        if (!M || X.scene) return;
        drawGarage(ctx, t);
        for (const s of M.signs) drawSign(ctx, s);
      },
      bodies(ctx, view, t) {
        const R = M && M.run; if (!R) return;
        for (const it of R.items) {
          if (it.taken || !X.inView(it.x, it.y, 2)) continue;
          if (it.kind === 'bag') drawBag(ctx, it, t); else if (it.kind === 'skull') drawSkull(ctx, it, t);
        }
      },
      cars(ctx, view, t) {
        const R = M && M.run; if (!R || X.scene) return;
        const v = R.data.van;
        if (v && !v.removed && !v.wrecked && X.inView(v.x, v.y, 8)) {
          ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.th);
          if (R.data.bomb && R.stage >= 1) {
            ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.arc(-0.6, 0, 0.42, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.quadraticCurveTo(0, -0.6, 0.15, -0.45); ctx.stroke();
            ctx.fillStyle = R.data.led > 0 ? '#ff2a1a' : '#5a1010'; ctx.beginPath(); ctx.arc(-0.6, 0, 0.16, 0, TAU); ctx.fill();
          }
          if (v.doorsOpen) {
            ctx.fillStyle = '#4c5649'; const L = v.len / 2, W = v.wid / 2;
            ctx.save(); ctx.translate(-L, -W + 0.05); ctx.rotate(-1.9); ctx.fillRect(0, -0.06, W - 0.05, 0.12); ctx.restore();
            ctx.save(); ctx.translate(-L, W - 0.05); ctx.rotate(1.9); ctx.fillRect(0, -0.06, W - 0.05, 0.12); ctx.restore();
          }
          ctx.restore();
        }
      },
      overlay(ctx, view, t) {
        if (!M || X.scene) return;
        for (const ph of M.phones) if (ringing(ph) && X.inView(ph.x, ph.y, 4)) drawRingWaves(ctx, ph, t);
        const R = M.run; if (!R || R.over) return;
        const p = pos();
        const lc = R.data.chev;
        if (lc && R.stage >= 1) for (const c of lc) if (!c.removed && !R.data.chevDone(c) && X.inView(c.x, c.y, 3)) chevron(ctx, c.x, c.y - c.wid / 2 - 0.9, '#ff4a3a', t);
        for (const it of R.items) if (it.kind === 'bag' && !it.taken && X.inView(it.x, it.y, 2)) chevron(ctx, it.x, it.y - 0.8, '#5fdc6e', t, 0.55);
        if (R.data.frenzy && R.stage === 1) for (const q of X.peds) {
          if (q.team !== 'gang' || q.dead || q.removed || q.hidden || Math.abs(q.x - p.x) > 60 || Math.abs(q.y - p.y) > 60) continue;
          if (X.inView(q.x, q.y, 2)) chevron(ctx, q.x, q.y - 0.9, '#ff3b2f', t, 0.7);
          else X.blip(q.x, q.y, '#ff3b2f', { size: 2.2 });
        }
      },
    },
  });
  function pushMarks() {
    const R = M.run;
    if (!R || R.over || X.time === M.objT) return;
    M.objT = X.time;
    const s = R.stages[R.stage];
    if (s && s.marks) s.marks(R, addMark);
  }
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
