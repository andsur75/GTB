// Enterable buildings for Grand Theft Bus. Doors on the city (every place except the drive-on pads, plus
// about one building in four as a 24/7 store, apartment lobby, office, warehouse, nightclub or diner) lead
// into interiors built far outside the city (x > 3000): floors, thick walls and furniture go into the
// city's spatial hash, so walking, bullets and explosions just work (low furniture such as counters and
// desks blocks feet but not bullets). Fjord Savings Bank (hold up the tellers, guards, cameras, drill the
// vault, bags of cash), the police station (pay a fine per star), St. Bussby Hospital (patch up, give
// blood), Ammu-Fjord (walk onto a stand to buy guns and armour), The Rusty Pillar (drinks, jukebox, pool,
// darts, Artur in his booth), the safehouses (sleep to skip the clock and save), 24/7 stores (rob the
// till, buy a pølse), offices (crack the boss's safe), warehouses (crates, barrels), nightclubs (dance
// floor, lasers, techno) and diners. People inside belong to this module (ai.owner 'interiors'): clerks,
// customers, guards and cops who wander, flee, cower, put their hands up or fight back. Owns X.interiors.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const hr = (s, i) => { const v = Math.sin((s % 10007) * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
  function rng(seed) { let s = Math.abs(Math.floor(seed)) % 2147483646 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // ================= constants =================
  const OX = 3300, OY = 300, SLOT = 72, COLS = 6, TW = 0.5;   // scene slots far east of the city; wall thickness
  const RECOVER = 240;          // game minutes until a robbed bank or till is back to normal
  const MAX_GEN = 8;            // generic interiors kept built at once
  const GEN_TYPES = ['store', 'lobby', 'office', 'warehouse', 'club', 'diner'];
  const NAMES = {
    store: ['Fjord Mart 24/7', 'Pølse Stop 24/7', 'Kjøp & Kjør 24/7', 'Late Night Lefse 24/7', 'Bussby Kiosk 24/7'],
    lobby: ['Fjordview Apartments', 'Blokk 12', 'Bussby Terrace', 'Parkview Residences', 'Nordlys Court'],
    office: ['Artur Holdings AS', 'Parkering Consulting AS', 'Fjord Insurance', 'Regret Motors HQ', 'NorskTek AS', 'Ticket & Clamp AS'],
    warehouse: ['Lager 7', 'Fish & Export', 'Brunost Storage', 'Flatpack Depot', 'Bussby Freight'],
    club: ['Club Nordlys', 'Disco Fjord', 'The Midnight Sun', 'Club Aurora', 'Bass Fjord'],
    diner: ['Vafler & Kaffe', 'The Brown Cheese Diner', 'Kjøttkake Kitchen', "Mamma Hansen's Diner", 'Night Owl Diner'],
  };
  const PRICES = { pistol: 150, uzi: 300, shotgun: 400, rifle: 900, grenade: 500, molotov: 350, rocket: 1500, flamer: 800, armor: 300 };
  const LINES = {
    robbed: ["DON'T SHOOT!", 'TAKE IT! TAKE IT!', 'I HAVE KIDS!', 'OKAY OKAY OKAY!', 'IT IS NOT EVEN MY MONEY!'],
    panic: ['AAAH!', 'HELP!', 'HJELP!', 'GET DOWN!', 'UFF DA!', 'NOT AGAIN!'],
    guard: ['FREEZE!', 'DROP IT!', 'ALARM! ALARM!', 'STOP RIGHT THERE!', 'WRONG BANK, FRIEND!'],
    cop: ['YOU ARE UNDER ARREST!', 'IN A POLICE STATION?!', 'GET HIM!', 'HANDS WHERE I CAN SEE THEM!'],
    staff: ['HEY! STAFF ONLY!', 'YOU CAN NOT BE BACK HERE!', 'BACK TO THE LOBBY, PLEASE!'],
    brawl: ['BAR FIGHT!', 'YOU SPILLED MY BEER!', 'COME ON THEN!', 'SKÅL THIS!'],
    drunk: ['I WANT MY LAWYER! *HIC*', 'I ONLY HAD TWO!', 'WHO MOVED THE FJORD?', 'TAKE THE BUS? I TOOK THE BUS!'],
    arturHit: ['WATCH IT, KID.', 'I AM WEARING A SUIT.', 'THAT WAS RUDE.', 'DO IT AGAIN AND YOU ARE FIRED.'],
    cashier: ['WELCOME!', 'PØLSE IS ON SALE!', 'THE SLUSH MACHINE IS BROKEN AGAIN.'],
  };
  const ARTUR = [
    'The bank on Bank Row. A thermal drill on the vault, seven seconds, and the guards are paid by the hour, not by the bullet.',
    'Ammu-Fjord sells body armour. Buy some. I am not paying for another funeral.',
    'Hot? The police station front desk takes cash. Five hundred a star. Very Norwegian.',
    'The tills at the 24/7 stores hold a few hundred. Point something at the cashier. Do not shoot the pølse.',
    'Answer the ringing phones. Ringing phones mean money. Mostly.',
    'Sleep at a safehouse. It saves your money. Not your dignity.',
    'I used to run a car park. Now I run a city. Same skill set, fewer cones.',
    'Loot is not money until it is home. Hideout or the apartment. Do not get wasted on the way.',
    'Pay \'n\' Spray. New paint, new you, no stars. Try not to touch it while it is wet.',
    'Take the bus. Seriously. Nobody suspects the bus.',
  ];
  const MAIL = [
    'A parking fine from Artur Parkering AS. Dated four years ago. Ha.',
    'A flyer: "TAKE THE BUS! Now with 20% fewer car chases."',
    'A letter for the neighbour. It smells of brunost.',
    'Your horoscope: "A tall stranger will steal your car."',
    'A catalogue of thermal drills. Somebody circled one.',
  ];
  const GREET = {
    store: ['VELKOMMEN!', 'PØLSE? WE HAVE PØLSE.', 'NO LOITERING.'], diner: ['SIT ANYWHERE, HON.', 'WAFFLES ARE FRESH!'], bar: ["WHAT'LL IT BE?", 'WIPE YOUR FEET.'],
    gunshop: ["LOOK, DON'T TOUCH.", 'WELCOME TO AMMU-FJORD.'], hospital: ['TAKE A NUMBER.', 'BLEEDING? OVER HERE.'], police: ['CAN I HELP YOU?', 'IF IT IS ABOUT YOUR BIKE, NO.'],
    lobby: ['EVENING.', 'RESIDENTS ONLY. MOSTLY.'], bank: ['WELCOME TO FJORD SAVINGS.', 'NEXT, PLEASE.'],
  };
  const TV = ['NEWS: Bus driver wanted for questioning. Again.', 'NEWS: Record number of cars stolen. Police baffled.', 'SPORT: Bussby United lose 0-7. Fans take the bus home.', 'WEATHER: Dark. It is always dark.'];

  // ================= state =================
  let S = null;
  function fresh() {
    return {
      doors: [], scenes: new Map(), free: [], nslot: 0, cur: null, gmin: 0, rob: null, warn: null, fade: null, padIn: null, doorArmed: true,
      bubbles: [], tracers: [], mus: { song: null, next: 0, step: 0, on: false }, ringT: 0, drillT: 0, beepT: 0, lastHurt: 0,
      stats: { entered: 0, left: 0, robberies: 0, tellers: 0, vaults: 0, loot: 0, bought: 0, healed: 0, slept: 0, fines: 0, drinks: 0, safes: 0, crates: 0 },
    };
  }
  const live = () => X.active && !!S;
  const mine = p => !!p && !!p.ai && p.ai.owner === 'interiors';
  const inScene = sc => !!S && X.scene === sc;
  const night = () => { const h = (X.clock || 0) / 60; return h >= 19 || h < 7; };
  const hour = () => Math.floor((X.clock || 0) / 60) % 24;
  const isGun = id => !!id && id !== 'fists' && !(X.WEAPONS && X.WEAPONS[id] && X.WEAPONS[id].kind === 'melee');

  // ================= geometry =================
  // Segment vs an axis-aligned rect grown by pad (slab test).
  function segRect(x0, y0, x1, y1, r, pad) {
    const dx = x1 - x0, dy = y1 - y0, ax = r.x0 - pad, bx = r.x1 + pad, ay = r.y0 - pad, by = r.y1 + pad;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (x0 < ax || x0 > bx) return false; }
    else { let u0 = (ax - x0) / dx, u1 = (bx - x0) / dx; if (u0 > u1) { const q = u0; u0 = u1; u1 = q; } if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1; if (t0 > t1) return false; }
    if (Math.abs(dy) < 1e-9) { if (y0 < ay || y0 > by) return false; }
    else { let u0 = (ay - y0) / dy, u1 = (by - y0) / dy; if (u0 > u1) { const q = u0; u0 = u1; u1 = q; } if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1; if (t0 > t1) return false; }
    return true;
  }
  function clearSeg(sc, x0, y0, x1, y1, pad, list) { const L = list || sc.rects; for (let i = 0; i < L.length; i++) if (segRect(x0, y0, x1, y1, L[i], pad)) return false; return true; }
  const sightClear = (sc, x0, y0, x1, y1) => clearSeg(sc, x0, y0, x1, y1, 0, sc.sight);
  const inRect = (r, x, y, pad) => x > r.x0 - (pad || 0) && x < r.x1 + (pad || 0) && y > r.y0 - (pad || 0) && y < r.y1 + (pad || 0);
  function freeAt(sc, x, y, r) { for (const q of sc.rects) if (inRect(q, x, y, r)) return false; return inRect(sc, x, y, -0.3); }
  function sceneAt(x, y) {
    if (!S || x < OX - 10) return null;
    const c = S.cur; if (c && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c;
    for (const sc of S.scenes.values()) if (x >= sc.x0 && x <= sc.x1 && y >= sc.y0 && y <= sc.y1) return sc;
    return null;
  }
  // Low furniture (counters, desks, sofas) is not in the city hash so bullets fly over it; people bump into it here.
  function pushLow(p, sc) {
    const L = sc.low, r = p.r || 0.32;
    for (let i = 0; i < L.length; i++) {
      const q = L[i];
      if (p.x < q.x0 - r || p.x > q.x1 + r || p.y < q.y0 - r || p.y > q.y1 + r) continue;
      const cx = cl(p.x, q.x0, q.x1), cy = cl(p.y, q.y0, q.y1);
      let dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), nx, ny;
      if (d >= r) continue;
      if (d < 1e-6) {
        const l = p.x - q.x0, rt = q.x1 - p.x, u = p.y - q.y0, dn = q.y1 - p.y, m = Math.min(l, rt, u, dn);
        if (m === l) { p.x = q.x0 - r; nx = -1; ny = 0; } else if (m === rt) { p.x = q.x1 + r; nx = 1; ny = 0; } else if (m === u) { p.y = q.y0 - r; nx = 0; ny = -1; } else { p.y = q.y1 + r; nx = 0; ny = 1; }
      } else { nx = dx / d; ny = dy / d; p.x = cx + nx * r; p.y = cy + ny * r; }
      const vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
    }
  }
  const baseMove = X.movePed;
  X.movePed = function (p) {
    const r = baseMove.apply(this, arguments);
    if (p && p.x > OX - 10 && S) { const sc = sceneAt(p.x, p.y); if (sc && sc.low.length) pushLow(p, sc); }
    return r;
  };

  // ================= floors =================
  const PAT = new Map();
  const FLOOR_M = { marble: 2, tile: 1, check: 1, wood: 2, carpet: 1, lino: 2, concrete: 4, steel: 1 };
  function floorPattern(ctx, kind, c1, c2) {
    const key = kind + c1 + c2;
    let e = PAT.get(key);
    if (e) return e;
    const M = FLOOR_M[kind] || 1, PX = 32, n = PX * M, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'), R = rng(n * 7 + kind.charCodeAt(0) * 131 + c1.charCodeAt(2) * 17);
    g.fillStyle = c1; g.fillRect(0, 0, n, n);
    const speck = (k, s, a, col) => { g.fillStyle = col; g.globalAlpha = a; for (let i = 0; i < k; i++) g.fillRect(R() * n, R() * n, s * (0.5 + R()), s * (0.5 + R())); g.globalAlpha = 1; };
    switch (kind) {
      case 'marble':
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(R() * n, 0); g.bezierCurveTo(R() * n, n * 0.3, R() * n, n * 0.6, R() * n, n); g.stroke(); }
        g.strokeStyle = 'rgba(0,0,0,0.07)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0, R() * n); g.quadraticCurveTo(n / 2, R() * n, n, R() * n); g.stroke(); }
        g.fillStyle = c2; g.fillRect(0, 0, n, 2); g.fillRect(0, 0, 2, n);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(2, 2, n / 2 - 2, n / 2 - 2); g.fillRect(n / 2, n / 2, n / 2, n / 2);
        break;
      case 'tile': g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(2, 2, n - 6, 3); g.fillStyle = c2; g.fillRect(0, 0, n, 1.5); g.fillRect(0, 0, 1.5, n); speck(10, 1.2, 0.15, c2); break;
      case 'check': g.fillStyle = c2; g.fillRect(0, 0, n / 2, n / 2); g.fillRect(n / 2, n / 2, n / 2, n / 2); g.fillStyle = 'rgba(128,128,128,0.25)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 0, 1, n); break;
      case 'wood':
        for (let x = 0; x < n; x += 8) {
          g.fillStyle = `rgba(${R() < 0.5 ? '255,235,200' : '0,0,0'},${(0.03 + R() * 0.08).toFixed(3)})`; g.fillRect(x, 0, 8, n);
          g.fillStyle = c2; g.fillRect(x, 0, 1, n); const j = R() * n; g.fillRect(x, j, 8, 1);
          g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x + 2 + R() * 4, 0); g.lineTo(x + 2 + R() * 4, n); g.stroke();
        }
        break;
      case 'carpet': speck(140, 1.4, 0.35, c2); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < n; y += 8) for (let x = (y / 8) % 2 * 4; x < n; x += 8) g.fillRect(x, y, 2, 2); break;
      case 'lino': speck(90, 1.6, 0.4, c2); speck(30, 1.2, 0.25, '#ffffff'); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 0, 1, n); break;
      case 'concrete':
        for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(0,0,0,${(0.012 + R() * 0.025).toFixed(3)})`; g.beginPath(); g.arc(R() * n, R() * n, 4 + R() * 14, 0, TAU); g.fill(); }
        speck(160, 1.3, 0.25, c2); g.fillStyle = c2; g.fillRect(0, 0, n, 1.5); g.fillRect(0, 0, 1.5, n);
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.8; g.beginPath(); let cx = R() * n, cy = R() * n; g.moveTo(cx, cy); for (let i = 0; i < 5; i++) { cx += (R() - 0.5) * 30; cy += (R() - 0.3) * 24; g.lineTo(cx, cy); } g.stroke();
        break;
      case 'steel':
        g.fillStyle = c2; for (let y = 0; y < n; y += 8) for (let x = (y / 8) % 2 * 4; x < n; x += 8) { g.save(); g.translate(x + 2, y + 2); g.rotate((x + y) % 16 ? 0.7 : -0.7); g.fillRect(-2.5, -0.7, 5, 1.4); g.restore(); }
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, n, 1); break;
    }
    const pat = ctx.createPattern(cv, 'repeat');
    e = { pat, k: M / n };
    PAT.set(key, e);
    return e;
  }

  // ================= scene builder =================
  // Layout code works in local metres (0..w, 0..h, y down, the street door in the bottom wall); the builder
  // turns everything into world coordinates in this scene's slot.
  function allocSlot() { return S.free.length ? S.free.pop() : S.nslot++; }
  function newScene(type, key, name, w, h, o) {
    const slot = allocSlot(), ox = OX + (slot % COLS) * SLOT, oy = OY + Math.floor(slot / COLS) * SLOT;
    return Object.assign({
      _int: true, id: type, type, key, name, slot, ox, oy, w, h, x0: ox, y0: oy, x1: ox + w, y1: oy + h,
      camSpan: 26, bg: '#040507', ambient: 0.6, wallTop: '#3a3d44', wallLo: '#24262b', wallHi: '#5d626c',
      rooms: [], walls: [], furn: [], lights: [], solids: [], rects: [], sight: [], low: [], gaps: [], specs: [], acts: [], pads: [], loot: [], zones: [], browse: [],
      peds: [], st: {}, nav: null, exit: null, spawn: null, entry: null, used: 0, outside: null,
    }, o);
  }
  function addSolid(sc, r, kind) {
    const q = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
    sc.rects.push(q);
    if (kind === 'low') { sc.low.push(q); return q; }
    const o = { kind: 'building', interior: sc.key, poly: PG.obb((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, q.x1 - q.x0, q.y1 - q.y0, 0) };
    PG.cityPut(X.city, o); sc.solids.push(o); sc.sight.push(q); q.solid = o;
    return q;
  }
  function removeSolid(sc, q) {
    if (!q) return;
    if (q.solid) { PG.cityRemove(X.city, q.solid); sc.solids = sc.solids.filter(o => o !== q.solid); q.solid = null; }
    sc.rects = sc.rects.filter(r => r !== q); sc.sight = sc.sight.filter(r => r !== q); sc.low = sc.low.filter(r => r !== q);
  }
  function B(sc) {
    const ox = sc.ox, oy = sc.oy;
    const b = {
      room(x0, y0, x1, y1, floor, c1, c2, o) { const r = Object.assign({ x0: ox + x0, y0: oy + y0, x1: ox + x1, y1: oy + y1, floor, c1, c2 }, o); sc.rooms.push(r); return r; },
      wall(x0, y0, x1, y1, kind) {
        const w = { x0: ox + Math.min(x0, x1), y0: oy + Math.min(y0, y1), x1: ox + Math.max(x0, x1), y1: oy + Math.max(y0, y1), kind: kind || 'wall' };
        sc.walls.push(w); w.q = addSolid(sc, w, 'tall'); return w;
      },
      // Straight walls along y (h) or x (v) with door gaps [[centre, width, door?], ...].
      hwall(y, x0, x1, gaps, kind) {
        let a = x0;
        for (const g of (gaps || []).slice().sort((p, q) => p[0] - q[0])) {
          if (g[0] - g[1] / 2 > a) b.wall(a, y - TW / 2, g[0] - g[1] / 2, y + TW / 2, kind);
          sc.gaps.push({ x: ox + g[0], y: oy + y, w: g[1], vert: false, door: g[2] !== false, a: 0, side: g[3] || 1 });
          a = g[0] + g[1] / 2;
        }
        if (x1 > a) b.wall(a, y - TW / 2, x1, y + TW / 2, kind);
      },
      vwall(x, y0, y1, gaps, kind) {
        let a = y0;
        for (const g of (gaps || []).slice().sort((p, q) => p[0] - q[0])) {
          if (g[0] - g[1] / 2 > a) b.wall(x - TW / 2, a, x + TW / 2, g[0] - g[1] / 2, kind);
          sc.gaps.push({ x: ox + x, y: oy + g[0], w: g[1], vert: true, door: g[2] !== false, a: 0, side: g[3] || 1 });
          a = g[0] + g[1] / 2;
        }
        if (y1 > a) b.wall(x - TW / 2, a, x + TW / 2, y1, kind);
      },
      box() { const w = sc.w, h = sc.h; b.hwall(TW / 2, 0, w); b.hwall(h - TW / 2, 0, w); b.vwall(TW / 2, TW, h - TW); b.vwall(w - TW / 2, TW, h - TW); },
      // The street door: glass doors in the bottom wall (the wall stays solid), a mat just inside.
      entrance(x, w, style) {
        const h = sc.h;
        sc.entry = { x: ox + x, y: oy + h - TW / 2, w: w || 2.4, style: style || 'glass' };
        sc.exit = { x0: ox + x - 1.25, y0: oy + h - TW - 1.15, x1: ox + x + 1.25, y1: oy + h - TW - 0.05 };
        sc.spawn = { x: ox + x, y: oy + h - TW - 2.3, th: -Math.PI / 2 };
      },
      f(t, x, y, w, h, o) {
        const f = Object.assign({ t, x: ox + x, y: oy + y, w, h, rot: 0, layer: 1 }, o);
        f.lx = x; f.ly = y;
        sc.furn.push(f);
        if (f.solid) { const sw = Math.abs(Math.sin(f.rot)) > 0.7 ? h : w, sh = Math.abs(Math.sin(f.rot)) > 0.7 ? w : h; f.q = addSolid(sc, { x0: f.x - sw / 2, y0: f.y - sh / 2, x1: f.x + sw / 2, y1: f.y + sh / 2 }, f.solid); }
        return f;
      },
      light(x, y, r, c, i, o) { const l = Object.assign({ x: ox + x, y: oy + y, r, c: c || '#ffe2b0', i: i == null ? 0.8 : i }, o); sc.lights.push(l); return l; },
      ped(role, x, y, th, o) { const s = Object.assign({ role, x: ox + x, y: oy + y, th: th || 0 }, o); if (s.patrol) s.patrol = s.patrol.map(q => ({ x: ox + q[0], y: oy + q[1] })); sc.specs.push(s); return s; },
      act(x, y, r, text, run, o) { const a = Object.assign({ x: ox + x, y: oy + y, r, text, run }, o); sc.acts.push(a); return a; },
      zone(x0, y0, x1, y1, kind) { sc.zones.push({ x0: ox + x0, y0: oy + y0, x1: ox + x1, y1: oy + y1, kind: kind || 'staff' }); },
      browse(x, y, th, pose) { sc.browse.push({ x: ox + x, y: oy + y, th: th || 0, pose: pose || null }); },
      loot(x, y, amount, kind) { sc.loot.push({ x: ox + x, y: oy + y, amount, kind, taken: false, a0: amount }); },
      pad(x, y, item) { sc.pads.push({ x: ox + x, y: oy + y, item, r: 0.85 }); },
      win(x0, y0, x1, y1) { (sc.wins = sc.wins || []).push({ x0: ox + x0, y0: oy + y0, x1: ox + x1, y1: oy + y1 }); },
      L: (x, y) => ({ x: ox + x, y: oy + y }),
    };
    return b;
  }

  // ================= navigation =================
  // Nodes on a 1.6 m grid inside every room plus both sides of each doorway; edges where a person fits.
  function buildNav(sc) {
    const nodes = [], cell = new Map(), CS = 1.6, key = (i, j) => i * 4096 + j;
    const add = (x, y) => {
      if (!freeAt(sc, x, y, 0.42)) return;
      const i = Math.floor((x - sc.x0) / CS), j = Math.floor((y - sc.y0) / CS), k = key(i, j);
      let a = cell.get(k); if (!a) cell.set(k, a = []);
      for (const n of a) if (Math.abs(nodes[n].x - x) < 0.5 && Math.abs(nodes[n].y - y) < 0.5) return;
      a.push(nodes.length); nodes.push({ x, y });
    };
    for (const r of sc.rooms) { if (r.nonav) continue; for (let y = r.y0 + 0.95; y <= r.y1 - 0.8; y += CS) for (let x = r.x0 + 0.95; x <= r.x1 - 0.8; x += CS) add(x, y); }
    for (const g of sc.gaps) { add(g.x, g.y); for (const s of [-1.1, 1.1]) add(g.x + (g.vert ? s : 0), g.y + (g.vert ? 0 : s)); }
    if (sc.spawn) add(sc.spawn.x, sc.spawn.y);
    if (sc.exit) add((sc.exit.x0 + sc.exit.x1) / 2, (sc.exit.y0 + sc.exit.y1) / 2);
    const adj = nodes.map(() => []);
    for (let a = 0; a < nodes.length; a++) {
      const A = nodes[a], i = Math.floor((A.x - sc.x0) / CS), j = Math.floor((A.y - sc.y0) / CS);
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
        const L = cell.get(key(i + di, j + dj)); if (!L) continue;
        for (const bI of L) {
          if (bI <= a) continue;
          const Bn = nodes[bI], d = Math.hypot(Bn.x - A.x, Bn.y - A.y);
          if (d > 2.6 || !clearSeg(sc, A.x, A.y, Bn.x, Bn.y, 0.3)) continue;
          adj[a].push(bI, d); adj[bI].push(a, d);
        }
      }
    }
    sc.nav = { nodes, adj };
  }
  function nearNode(sc, x, y) {
    const N = sc.nav.nodes; let best = -1, bd = 1e9;
    const cand = [];
    for (let i = 0; i < N.length; i++) { const d = Math.abs(N[i].x - x) + Math.abs(N[i].y - y); if (d < 5) cand.push(i, d); if (d < bd) { bd = d; best = i; } }
    let pickI = -1, pd = 1e9;
    for (let k = 0; k < cand.length; k += 2) { const i = cand[k], d = cand[k + 1]; if (d < pd && clearSeg(sc, x, y, N[i].x, N[i].y, 0.22)) { pd = d; pickI = i; } }
    return pickI >= 0 ? pickI : best;
  }
  function navPath(sc, x0, y0, x1, y1) {
    const N = sc.nav; if (!N || !N.nodes.length) return null;
    const s = nearNode(sc, x0, y0), e = nearNode(sc, x1, y1); if (s < 0 || e < 0) return null;
    const n = N.nodes.length, g = new Float32Array(n).fill(1e9), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n), open = [s];
    g[s] = 0;
    const h = i => Math.hypot(N.nodes[i].x - N.nodes[e].x, N.nodes[i].y - N.nodes[e].y);
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
      const u = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (u === e) break;
      if (done[u]) continue; done[u] = 1;
      const A = N.adj[u];
      for (let k = 0; k < A.length; k += 2) { const v = A[k], nd = g[u] + A[k + 1]; if (nd < g[v]) { g[v] = nd; prev[v] = u; if (!done[v]) open.push(v); } }
    }
    if (s !== e && prev[e] < 0) return null;
    const out = [];
    for (let v = e; v >= 0; v = prev[v]) { out.unshift(N.nodes[v]); if (v === s) break; }
    out.push({ x: x1, y: y1 });
    return out;
  }
  // Walk p towards (tx, ty) through doorways. Returns true on arrival.
  function goTo(p, sc, tx, ty, sp, dt) {
    const a = p.ai, d = Math.hypot(tx - p.x, ty - p.y);
    if (d < 0.4) { X.movePed(p, dt, 0, 0); a.stuck = 0; return true; }
    a.repath -= dt;
    if (a.gx !== tx || a.gy !== ty || !a.path || a.repath <= 0) {
      a.gx = tx; a.gy = ty; a.repath = 3;
      a.path = clearSeg(sc, p.x, p.y, tx, ty, 0.3) ? [{ x: tx, y: ty }] : (navPath(sc, p.x, p.y, tx, ty) || [{ x: tx, y: ty }]);
      a.pi = 0;
    }
    let w = a.path[Math.min(a.pi, a.path.length - 1)];
    while (a.pi < a.path.length - 1 && Math.hypot(w.x - p.x, w.y - p.y) < 0.65) w = a.path[++a.pi];
    a.skipT = (a.skipT || 0) - dt;
    if (a.skipT <= 0 && a.pi < a.path.length - 1) { a.skipT = 0.3; const nx = a.path[a.pi + 1]; if (clearSeg(sc, p.x, p.y, nx.x, nx.y, 0.3)) w = a.path[++a.pi]; }
    const dx = w.x - p.x, dy = w.y - p.y, dl = Math.hypot(dx, dy) || 1, s = Math.min(sp, d * 2.5 + 0.8);
    X.movePed(p, dt, dx / dl * s, dy / dl * s);
    p.th += wrap(Math.atan2(dy, dx) - p.th) * Math.min(1, dt * 10);
    if (p.speed < 0.3) { a.stuck = (a.stuck || 0) + dt; if (a.stuck > 1.0) { a.stuck = 0; a.repath = 0; a.path = null; a.stuckN = (a.stuckN || 0) + 1; } }
    else { a.stuck = 0; a.stuckN = 0; }
    return false;
  }

  // ================= layouts =================
  // Each takes (scene, builder, seeded random). Roles: teller, cashier, clerk, owner, guard, cop, sergeant,
  // customer, sitter, patient, doctor, dancer, dj, drinker, bouncer, worker, drunk, artur.
  const day = () => hour() >= 7 && hour() < 18;
  const L = {};
  L.bank = (sc, b) => {
    Object.assign(sc, { camSpan: 28, ambient: 0.75, wallTop: '#5f574a', wallLo: '#3b352c', wallHi: '#9a8d70' });
    b.room(0, 20, 36, 34, 'marble', '#ddd6c6', '#b7ac95');
    b.room(0, 11, 36, 20, 'carpet', '#5b2a30', '#45202a');
    b.room(14.4, 0, 36, 11, 'steel', '#6f757d', '#5b6168');
    b.room(0, 0, 13.4, 11, 'steel', '#7b8189', '#676d75');
    b.box();
    b.entrance(18, 3);
    // the counter line: tellers behind glass, a staff gate at the east end
    b.wall(0, 19.55, 4, 20.05); b.wall(27.4, 19.55, 36, 20.05);
    b.f('counter', 14.2, 19.8, 20.4, 1.4, { solid: 'low', c: '#4a3020', top: '#e8e0cc' });
    sc.gaps.push({ x: sc.ox + 25.9, y: sc.oy + 19.8, w: 3, vert: false, door: true, gate: true, a: 0, side: 1 });
    for (const x of [4.25, 10.05, 15, 19.85, 24.2]) b.f('glass', x, 19.8, 0.12, 1.4);
    for (const x of [7.6, 12.5, 17.5]) { b.f('register', x, 19.35, 0.7, 0.45); b.ped('teller', x, 18.4, Math.PI / 2, { look: 'suit', rob: [300, 650] }); b.browse(x, 21.9, -Math.PI / 2); }
    b.f('sign', 22.1, 19.8, 1.6, 0.5, { text: 'CLOSED', c: '#c0392b', bg: '#f2ead8', size: 0.34 });
    // manager's office behind glass
    b.vwall(10.2, 11.25, 16.85, [], 'glass'); b.hwall(16.6, 0.25, 10.2, [[7.2, 1.7]], 'glass');
    b.f('desk', 4.5, 13.4, 2.6, 1.2, { solid: 'low', c: '#5a3a24', pc: 1, face: 's' }); b.f('chair', 4.5, 12.4, 0.6, 0.6, { rot: Math.PI / 2 });
    b.ped('clerk', 4.5, 12.4, Math.PI / 2, { look: 'suit', sit: true });
    b.f('fishtank', 0.95, 14.2, 0.8, 2.6, { solid: 'tall', fragile: true });
    b.f('plant', 9.3, 12.0, 0.9, 0.9, { solid: 'low' }); b.f('plant', 1.3, 21.4, 1, 1, { solid: 'low' }); b.f('plant', 34.7, 21.4, 1, 1, { solid: 'low' });
    b.f('plant', 1.3, 32.6, 1, 1, { solid: 'low' }); b.f('plant', 34.7, 32.6, 1, 1, { solid: 'low' });
    for (const x of [16, 17.2, 18.4, 21.8, 23]) b.f('filing', x, 11.85, 1.1, 0.7, { solid: 'tall' });
    b.f('printer', 26.4, 12.2, 1.4, 0.9, { solid: 'low' }); b.f('cooler', 12.3, 11.9, 0.7, 0.7, { solid: 'tall' });
    b.f('monitors', 33.4, 13.0, 3.4, 1.1, { solid: 'low' }); b.f('chair', 33.4, 14.2, 0.6, 0.6, { rot: -Math.PI / 2 });
    b.zone(0, 0.5, 36, 19.2);
    // the vault: a 1.2 m wall with a round door, cash inside
    b.hwall(11, 0.25, 35.75, [[31.6, 2.2]]);
    b.wall(13.2, 0.5, 14.4, 3.5); b.wall(13.2, 7.1, 14.4, 10.75);
    sc.st.plug = b.wall(13.2, 3.5, 14.4, 7.1, 'plug');
    sc.st.vault = b.f('vault', 13.8, 5.3, 3.5, 3.5, { layer: 3 });
    b.f('deposit', 25, 0.95, 20, 0.9, { solid: 'tall' });
    b.f('cart', 21, 9.3, 1.6, 0.9, { solid: 'low' });
    b.f('stencil', 19.5, 5.3, 4, 1.2, { text: 'VAULT', layer: 0 });
    b.f('sign', 31.6, 11.55, 3.2, 0.42, { text: 'AUTHORIZED PERSONNEL ONLY', c: '#f2ead8', bg: '#7a1e1e', size: 0.22, layer: 2 });
    b.f('vaultshelf', 6.6, 0.95, 12, 0.9, { solid: 'tall' }); b.f('vaultshelf', 0.95, 6, 0.9, 9, { solid: 'tall' }); b.f('vaultshelf', 6.6, 10.1, 9.6, 0.9, { solid: 'tall' });
    for (const x of [3, 5, 7, 9, 11]) b.loot(x, 1.75, 600, 'stack');
    for (const x of [4, 8]) b.loot(x, 9.3, 500, 'stack');
    b.loot(5.2, 5.6, 2000, 'bag'); b.loot(8.6, 4.4, 2500, 'bag'); b.loot(9.8, 7.4, 1800, 'bag'); b.loot(2.0, 3.6, 1200, 'gold'); b.loot(2.0, 8.2, 1200, 'gold');
    // lobby: pillars, a queue rope, benches, ATMs
    b.f('pillar', 9, 27, 1.3, 1.3, { solid: 'tall' }); b.f('pillar', 27, 27, 1.3, 1.3, { solid: 'tall' });
    b.f('rope', 14.2, 23.4, 18, 0.2, { posts: 7 });
    b.f('bench', 34.6, 26, 0.9, 4, { solid: 'low', c: '#5b2a30', back: 'e' }); b.f('bench', 1.4, 26, 0.9, 4, { solid: 'low', c: '#5b2a30', back: 'w' });
    b.f('atm', 11.5, 33.15, 1.2, 0.7, { solid: 'tall' }); b.f('atm', 24.5, 33.15, 1.2, 0.7, { solid: 'tall' });
    b.f('rug', 18, 27.9, 3.4, 11.2, { c: '#7a1e26', c2: '#d4af37', layer: 0 }); b.f('emblem', 18, 26.4, 4.4, 4.4, { kind: 'bank', layer: 0 });
    b.f('clock', 2, 19.6, 0.9, 0.9, { layer: 2 }); b.f('clock', 34, 19.6, 0.9, 0.9, { layer: 2 });
    for (const c of [[0.85, 20.7, Math.PI / 4], [35.15, 20.7, Math.PI * 0.75], [35.15, 10.3, -Math.PI * 0.75], [12.8, 1.1, Math.PI * 0.75]]) b.f('camera', c[0], c[1], 0.5, 0.5, { a: c[2], layer: 3 });
    b.act(11.5, 32.0, 1.3, () => 'F: Use the ATM', () => atm());
    b.act(24.5, 32.0, 1.3, () => 'F: Use the ATM', () => atm());
    b.act(16.3, 5.6, 2.4, () => vaultHint(sc), () => startDrill(sc));
    b.ped('guard', 3.2, 22.6, 0.4, { weapon: 'pistol', armor: 50 }); b.ped('guard', 32.8, 22.6, Math.PI - 0.4, { weapon: 'pistol', armor: 50 });
    b.ped('guard', 33.4, 14.2, -Math.PI / 2, { weapon: 'pistol', armor: 50, sit: true });
    b.ped('customer', 7.6, 21.9, -Math.PI / 2, { chance: 0.85 }); b.ped('customer', 12.5, 22, -Math.PI / 2, { chance: 0.6 }); b.ped('customer', 17.5, 22.1, -Math.PI / 2, { chance: 0.5 });
    b.ped('customer', 11.5, 31.8, Math.PI / 2, { chance: 0.5 }); b.ped('customer', 20, 28.5, 0, { chance: 0.6 }); b.ped('sitter', 34.0, 25, Math.PI, { chance: 0.5 });
    b.browse(11.5, 31.8, Math.PI / 2); b.browse(24.5, 31.8, Math.PI / 2); b.browse(6, 28, 0); b.browse(30, 29, Math.PI); b.browse(13, 25, -1); b.browse(23, 25.5, -2);
    for (const x of [9, 18, 27]) { b.light(x, 24, 8, '#fff1d6', 0.7, { fix: 'panel' }); b.light(x, 30.5, 8, '#fff1d6', 0.7, { fix: 'panel' }); }
    b.light(6, 14, 7, '#ffe6c0', 0.6, { fix: 'panel' }); b.light(19, 15.5, 8, '#ffe6c0', 0.6, { fix: 'panel' }); b.light(31, 15.5, 7, '#ffe6c0', 0.6, { fix: 'panel' });
    b.light(25, 5, 10, '#d8ecff', 0.75, { fix: 'panel' }); b.light(6.5, 5.5, 8, '#cfe4ff', 0.8, { fix: 'panel' });
    b.win(4, 33.5, 14, 34); b.win(22, 33.5, 32, 34); b.win(35.5, 22, 36, 32); b.win(0, 22, 0.5, 32);
  };
  L.police = (sc, b) => {
    Object.assign(sc, { camSpan: 26, ambient: 0.8, wallTop: '#2c3646', wallLo: '#1a2029', wallHi: '#56657d' });
    b.room(0, 12, 30, 24, 'lino', '#a7afb8', '#87909a');
    b.room(0, 0, 30, 12, 'lino', '#8f99a4', '#76808b');
    b.room(22, 0, 30, 7, 'concrete', '#6b6a66', '#585752', { nonav: true });
    b.box(); b.entrance(15, 2.6);
    b.wall(0, 11.75, 9, 12.25); b.wall(23.2, 11.75, 30, 12.25);
    b.f('counter', 15, 12, 12, 1.4, { solid: 'low', c: '#22304d', top: '#c9ccd1' });
    sc.gaps.push({ x: sc.ox + 22.1, y: sc.oy + 12, w: 2.2, vert: false, door: true, gate: true, a: 0, side: 1 });
    b.f('monitor', 13.2, 11.7, 0.7, 0.5); b.f('register', 17, 11.7, 0.6, 0.45, { kind: 'stamp' });
    b.vwall(22, 0.5, 7, [], 'bars'); b.hwall(7, 22, 29.75, [], 'bars');
    b.f('bench', 29, 3.5, 0.8, 4, { solid: 'low', c: '#555a60' }); b.f('toilet', 29.1, 6.1, 0.6, 0.6, { solid: 'low' });
    b.ped('drunk', 26, 3.5, Math.PI, { look: 'drunk', pose: 'drink' });
    for (const [x, y] of [[4, 3], [4, 7.6], [11, 3], [11, 7.6]]) { b.f('desk', x, y, 2.6, 1.2, { solid: 'low', c: '#4f5866', pc: 1 }); b.f('chair', x, y + 1.05, 0.6, 0.6, { rot: -Math.PI / 2 }); }
    b.ped('cop', 4, 4.1, -Math.PI / 2, { sit: true, weapon: 'pistol' }); b.ped('cop', 11, 8.7, -Math.PI / 2, { sit: true, weapon: 'pistol', chance: 0.6 });
    b.f('locker', 17.5, 0.95, 7, 0.9, { solid: 'tall' });
    b.f('coffee', 1.0, 10.6, 0.8, 0.8, { solid: 'tall' }); b.f('table', 2.4, 10.8, 1.2, 0.8, { solid: 'low', c: '#6b6f78', donuts: 1 });
    b.ped('cop', 2.6, 9.5, Math.PI * 0.9, { pose: 'drink', weapon: 'pistol' });
    b.ped('sergeant', 15, 10.7, Math.PI / 2, { weapon: 'pistol' });
    b.f('bench', 1.25, 18, 0.9, 6, { solid: 'low', c: '#2f4f8a', back: 'w' });
    b.ped('sitter', 1.6, 16.6, 0, { chance: 0.6 }); b.ped('sitter', 1.6, 19.6, 0, { chance: 0.35 });
    b.f('vending', 28.95, 14.2, 1.0, 1.1, { solid: 'tall', c: '#2f6fb5' }); b.f('plant', 28.8, 22.8, 1, 1, { solid: 'low' }); b.f('plant', 1.2, 22.8, 1, 1, { solid: 'low' });
    b.f('emblem', 15, 18.4, 4, 4, { kind: 'badge', layer: 0 });
    for (const x of [2.2, 4.4, 6.6]) b.f('poster', x, 12.5, 1.6, 0.35, { kind: 'wanted', layer: 2 });
    b.f('sign', 26.5, 12.55, 6, 0.5, { text: 'DAYS WITHOUT INCIDENT: 0', c: '#fff', bg: '#22304d', size: 0.3, layer: 2 });
    b.zone(0.5, 0.5, 29.5, 11.2);
    b.act(15, 13.6, 1.8, () => fineHint(), () => payFine());
    b.light(8, 18, 9, '#f2f6ff', 0.8, { fix: 'panel' }); b.light(22, 18, 9, '#f2f6ff', 0.8, { fix: 'panel' }); b.light(6, 5, 8, '#f2f6ff', 0.75, { fix: 'panel' }); b.light(16, 6, 8, '#f2f6ff', 0.75, { fix: 'panel' }); b.light(26, 3.5, 5, '#ffe6b0', 0.5, { fix: 'bulb' });
    b.win(3, 23.5, 11, 24); b.win(19, 23.5, 27, 24); b.win(0, 14, 0.5, 21);
    b.browse(15, 13.8, -Math.PI / 2); b.browse(26, 15, 0); b.browse(8, 20, 1);
  };
  L.hospital = (sc, b) => {
    Object.assign(sc, { camSpan: 26, ambient: 0.9, wallTop: '#7f8d99', wallLo: '#5c6873', wallHi: '#b5c3cf' });
    b.room(0, 13, 30, 26, 'lino', '#e4e9ed', '#c4ccd3');
    b.room(0, 0, 30, 13, 'lino', '#d3e4e6', '#b2c8cb');
    b.box(); b.entrance(15, 3);
    b.hwall(13, 0.25, 29.75, [[5, 2.2], [23, 2.4]]);
    b.f('counter', 12, 15.6, 8, 1.3, { solid: 'low', c: '#3f6f98', top: '#eef2f5' }); b.f('monitor', 10.6, 15.3, 0.7, 0.5);
    b.ped('clerk', 12, 14.3, Math.PI / 2, { look: 'nurse' });
    b.f('bench', 21.5, 19.6, 9, 0.8, { solid: 'low', c: '#3f6f98', back: 's' }); b.f('bench', 21.5, 22.6, 9, 0.8, { solid: 'low', c: '#3f6f98', back: 's' });
    b.ped('sitter', 18.5, 19.55, -Math.PI / 2, { chance: 0.7, look: 'sick' }); b.ped('sitter', 22.4, 19.55, -Math.PI / 2, { chance: 0.5 }); b.ped('sitter', 24.4, 22.55, -Math.PI / 2, { chance: 0.5, look: 'sick' });
    b.f('vending', 28.95, 15.2, 1.0, 1.1, { solid: 'tall', c: '#c0392b' }); b.f('cooler', 1.0, 15.2, 0.7, 0.7, { solid: 'tall' });
    b.f('plant', 1.2, 24.6, 1, 1, { solid: 'low' }); b.f('plant', 28.8, 24.6, 1, 1, { solid: 'low' });
    b.f('emblem', 6.5, 21, 3.2, 3.2, { kind: 'cross', layer: 0 });
    for (const r of [[14.6, 21.75, 0.22, 7.5], [9.8, 18.1, 9.8, 0.22], [5, 15.5, 0.22, 5.2]]) b.f('paint', r[0], r[1], r[2], r[3], { c: '#3fae6a', layer: 0 });
    for (const r of [[15.4, 21.5, 0.22, 8], [19.2, 17.6, 7.8, 0.22], [23, 15.3, 0.22, 4.6]]) b.f('paint', r[0], r[1], r[2], r[3], { c: '#3f7fd0', layer: 0 });
    b.f('armchair', 3, 16.4, 1.3, 1.2, { solid: 'low', c: '#b8483e' }); b.f('sign', 3, 15.2, 2.6, 0.45, { text: 'GIVE BLOOD: $40', c: '#fff', bg: '#c0392b', size: 0.26, layer: 2 });
    for (const x of [3, 8, 13, 18, 27]) {
      b.f('hospbed', x, 1.8, 1.1, 2.3, { solid: 'low' }); b.f('ecg', x + 0.95, 0.95, 0.5, 0.4); b.f('iv', x - 0.85, 1.1, 0.3, 0.3);
      b.ped('patient', x, 2.05, Math.PI / 2, { chance: 0.7, look: 'gown', pose: 'lie' });
      if (x < 27) b.f('curtain', x + 2.5, 1.9, 0.08, 2.8);
    }
    for (const x of [10, 15]) { b.f('hospbed', x, 11.05, 1.1, 2.3, { solid: 'low', head: 's' }); b.ped('patient', x, 10.85, -Math.PI / 2, { chance: 0.6, look: 'gown', pose: 'lie' }); }
    b.ped('doctor', 12, 6, 0, { look: 'doctor', wander: true }); b.ped('doctor', 20, 7, Math.PI, { look: 'nurse', wander: true, chance: 0.7 });
    for (const q of [[4, 5.5], [12, 5], [20, 6.5], [26, 6], [14, 8.5], [8, 8], [24, 9.5]]) b.browse(q[0], q[1], 0);
    b.act(12, 17.3, 1.8, () => healHint(), () => heal());
    b.act(3, 17.8, 1.3, () => P.ped.hp > 55 ? 'F: Give blood (+$40)' : null, () => giveBlood());
    b.light(8, 19, 10, '#f4fbff', 0.85, { fix: 'panel' }); b.light(22, 19, 10, '#f4fbff', 0.85, { fix: 'panel' });
    for (const x of [6, 15, 24]) b.light(x, 6, 8, '#eef8ff', 0.8, { fix: 'panel' });
    b.win(3, 25.5, 11, 26); b.win(19, 25.5, 27, 26); b.win(0, 2, 0.5, 11); b.win(29.5, 2, 30, 11);
  };
  L.gunshop = (sc, b) => {
    Object.assign(sc, { camSpan: 22, ambient: 0.7, wallTop: '#3b2b24', wallLo: '#231915', wallHi: '#6a5244' });
    b.room(0, 6, 22, 18, 'concrete', '#504f4c', '#3e3d3b');
    b.room(0, 0, 22, 6, 'tile', '#3a3633', '#2a2725');
    b.box(); b.entrance(11, 2.4);
    b.f('counter', 9.25, 5.9, 17.5, 1.3, { solid: 'low', c: '#2c2420', top: '#8a7a62' });
    sc.gaps.push({ x: sc.ox + 19.8, y: sc.oy + 5.9, w: 3.4, vert: false, door: true, gate: true, a: 0, side: 1 });
    b.f('register', 13, 5.65, 0.7, 0.5); b.f('gunrack', 9.5, 0.95, 17, 0.9, { solid: 'tall' });
    b.f('crate', 20.4, 1.6, 1.4, 1.4, { solid: 'tall', text: 'AMMO' }); b.f('crate', 1.7, 16.5, 1.3, 1.3, { solid: 'low', text: 'AMMO' }); b.f('crate', 20.3, 16.5, 1.3, 1.3, { solid: 'low', text: 'AMMO' });
    b.ped('owner', 9, 4.3, Math.PI / 2, { look: 'owner', weapon: 'shotgun', hp: 160 });
    const items = ['pistol', 'uzi', 'shotgun', 'rifle', 'grenade', 'molotov', 'rocket', 'armor'];
    items.forEach((it, i) => b.pad(4 + (i % 4) * 4, i < 4 ? 9.6 : 13.2, it));
    b.f('target', 0.8, 9.5, 0.3, 1.4, { layer: 2 }); b.f('target', 21.2, 12.5, 0.3, 1.4, { layer: 2 });
    b.f('sign', 5.2, 17.55, 3.6, 0.42, { text: 'NO REFUNDS. NO QUESTIONS.', c: '#ffd23a', bg: '#1b1b1f', size: 0.24, layer: 2 });
    b.f('sign', 9.2, 6.75, 4.2, 0.36, { text: 'WALK ONTO A STAND TO BUY', c: '#1b1b1f', bg: '#ffd23a', size: 0.22, layer: 2 });
    b.light(6, 11.5, 8, '#f4f8ff', 0.85, { fix: 'tube' }); b.light(16, 11.5, 8, '#f4f8ff', 0.85, { fix: 'tube', flick: 1 }); b.light(9, 3, 7, '#fff0d0', 0.7, { fix: 'tube' });
    b.zone(0.5, 0.5, 21.5, 5.2);
    b.browse(4, 11.4, -Math.PI / 2); b.browse(15, 15, 0);
    b.ped('customer', 15.5, 15.5, -2, { chance: 0.5 });
  };
  L.bar = (sc, b) => {
    Object.assign(sc, { camSpan: 25, ambient: 0.4, wallTop: '#3a241c', wallLo: '#22140f', wallHi: '#6a4636' });
    b.room(0, 0, 28, 22, 'wood', '#6e4a2c', '#4a301b');
    b.box(); b.entrance(12, 2.4);
    b.f('bottles', 11.5, 0.95, 15, 0.9, { solid: 'tall', fragile: true });
    b.f('counter', 11.5, 4.1, 15, 1.3, { solid: 'low', c: '#3d2414', top: '#8a5a34' });
    b.f('taps', 9, 3.75, 1.4, 0.35); b.f('register', 15.5, 3.75, 0.7, 0.5);
    for (let x = 5; x <= 18; x += 1.6) b.f('stool', x, 5.45, 0.5, 0.5);
    b.ped('clerk', 11, 2.4, Math.PI / 2, { look: 'bartender' });
    b.act(11.5, 5.7, 2.4, () => 'F: Buy a drink ($10, +15 hp)', () => drink(10, 15));
    b.ped('drinker', 6.6, 5.75, -Math.PI / 2, { pose: 'drink', chance: 0.9 }); b.ped('drinker', 11.4, 5.75, -Math.PI / 2, { pose: 'drink', chance: 0.75 }); b.ped('drinker', 16.2, 5.75, -Math.PI / 2, { pose: 'drink', chance: 0.75 });
    b.ped('drinker', 19.6, 8.2, Math.PI * 0.8, { pose: 'drink', chance: 0.6 }); b.ped('drinker', 13.2, 16.6, -2.2, { pose: 'drink', chance: 0.5 });
    [6.5, 11.5, 16.5].forEach((cy, i) => {
      b.f('bench', 25.4, cy - 1.3, 4.2, 0.75, { solid: 'low', c: '#6b1f24', back: 'n' }); b.f('table', 25.4, cy, 3.4, 1.1, { solid: 'low', c: '#3d2a1d', glasses: 1 }); b.f('bench', 25.4, cy + 1.3, 4.2, 0.75, { solid: 'low', c: '#6b1f24', back: 's' });
      if (i !== 1) { b.ped('sitter', 24.6, cy - 1.25, Math.PI / 2, { chance: 0.7 }); b.ped('sitter', 26.2, cy + 1.25, -Math.PI / 2, { chance: 0.6 }); }
    });
    b.ped('artur', 25.4, 10.25, Math.PI / 2, { look: 'artur', sit: true });
    b.act(23.6, 11.5, 1.6, () => 'F: Talk to Artur', () => talkArtur(sc));
    sc.st.pool = b.f('pooltable', 9, 12.5, 3.0, 1.6, { solid: 'low' }); b.f('cues', 0.75, 12.5, 0.25, 2.4, { layer: 2 });
    b.act(9, 14.3, 1.7, () => 'F: Play pool ($20 bet)', () => playPool(sc));
    sc.st.juke = b.f('jukebox', 1.05, 8.5, 0.9, 1.3, { solid: 'tall', fragile: true }); b.act(2.3, 8.5, 1.4, () => 'F: Change the song', () => jukebox(sc));
    sc.st.darts = b.f('dartboard', 0.75, 16.5, 0.2, 0.8, { layer: 2 }); b.f('paint', 4.6, 16.5, 0.12, 1.4, { c: '#e9e4d8', layer: 0 }); b.act(4.9, 16.5, 1.3, () => 'F: Throw darts', () => darts(sc));
    for (const [x, y] of [[16, 10], [16, 15], [5.5, 19.2], [19, 19.2]]) {
      b.f('table', x, y, 1.3, 1.3, { solid: 'low', round: 1, c: '#4a3020', glasses: 1 });
      b.f('chair', x - 1.05, y, 0.55, 0.55, { rot: 0 }); b.f('chair', x + 1.05, y, 0.55, 0.55, { rot: Math.PI });
      b.ped('sitter', x - 1.05, y, 0, { chance: 0.55 }); b.ped('sitter', x + 1.05, y, Math.PI, { chance: 0.3 });
    }
    b.f('tv', 23.6, 0.85, 2.2, 0.4, { layer: 2, fragile: true, show: 'football' });
    b.f('portrait', 2.6, 0.8, 1.2, 0.35, { layer: 2, text: 'REGULAR OF THE YEAR' });
    b.f('neon', 21.5, 21.45, 3.2, 0.7, { text: 'SKÅL!', c: '#ff4fa0', layer: 2 });
    b.f('door', 0.5, 3.2, 0.3, 1.5, { text: 'WC', layer: 2 });
    for (const x of [7, 11.5, 16]) b.light(x, 3, 5, '#ffcf8a', 0.75, { fix: 'pendant' });
    b.light(9, 12.5, 4.5, '#d8ffc0', 0.8, { fix: 'pool' });
    for (const y of [6.5, 11.5, 16.5]) b.light(25.4, y, 3.6, '#ffc070', 0.7, { fix: 'pendant' });
    b.light(14, 13, 12, '#ffb070', 0.35); b.light(2.2, 8.5, 3, '#ff5ad0', 0.6, { juke: 1 });
    for (const q of [[19.5, 6.5], [13, 9], [20, 15], [8, 17], [13, 16.5]]) b.browse(q[0], q[1], rand(-3, 3));
  };
  L.apartment = (sc, b) => {
    Object.assign(sc, { camSpan: 22, ambient: 0.55, wallTop: '#3e4450', wallLo: '#262a32', wallHi: '#6d7584' });
    b.room(0, 6, 16, 18, 'wood', '#8a6a48', '#6c5035'); b.room(16, 8, 22, 18, 'tile', '#dad5cb', '#b9b2a3');
    b.room(0, 0, 10, 6, 'carpet', '#5d6d7e', '#4d5c6b'); b.room(10, 0, 16, 6, 'tile', '#cfe3ea', '#a6c2cb'); b.room(16, 0, 22, 8, 'wood', '#7a5a3e', '#5e432c');
    b.box(); b.entrance(5, 2.2);
    b.hwall(6, 0.25, 16, [[8.6, 1.6], [12.6, 1.5]]); b.vwall(10, 0.5, 5.75); b.vwall(16, 0.5, 17.5, [[11.3, 2.6]]); b.hwall(8, 16, 21.75, [[18.8, 1.6]]);
    b.f('bed', 3.6, 2.6, 2.2, 3.0, { solid: 'low', c: '#b8483e' }); b.f('nightstand', 1.3, 0.95, 0.6, 0.6, { solid: 'low' }); b.f('nightstand', 5.9, 0.95, 0.6, 0.6, { solid: 'low' });
    b.f('wardrobe', 8.95, 2.4, 1.1, 2.8, { solid: 'tall' }); b.f('rug', 3.6, 4.85, 3, 1.4, { c: '#d9c9a8', c2: '#a8946e', layer: 0 });
    b.act(3.6, 4.6, 1.5, () => sleepHint('Sleep'), () => sleep(sc));
    b.f('tub', 13, 1.3, 4.2, 1.4, { solid: 'low' }); b.f('toilet', 15.2, 4.7, 0.6, 0.7, { solid: 'low' }); b.f('sink', 10.85, 3.6, 0.6, 0.9, { solid: 'low' });
    b.f('desk', 19, 1.3, 2.6, 1.0, { solid: 'low', c: '#5a3b22', pc: 1 }); b.f('chair', 19, 2.3, 0.6, 0.6, { rot: -Math.PI / 2 }); b.f('bookshelf', 21.25, 4.5, 0.7, 3, { solid: 'tall' }); b.f('plant', 17, 6.9, 0.8, 0.8, { solid: 'low' });
    b.f('rug', 4.5, 10.4, 5.2, 4.4, { c: '#7a3b2e', c2: '#d9a441', layer: 0 });
    b.f('sofa', 4.5, 12.8, 4.4, 1.1, { solid: 'low', c: '#3f5f7a', back: 's' }); b.f('table', 4.5, 10.3, 2.0, 0.9, { solid: 'low', c: '#5a3b22', mugs: 1 });
    b.f('tv', 4.5, 6.8, 2.4, 0.5, { solid: 'low', fragile: true, show: 'news' }); b.f('armchair', 9.2, 10.3, 1.2, 1.2, { solid: 'low', c: '#3f5f7a' });
    b.f('bookshelf', 0.95, 10.4, 0.7, 3.4, { solid: 'tall' }); b.f('lamp', 1.2, 13.6, 0.5, 0.5); b.f('plant', 15.0, 17.1, 0.9, 0.9, { solid: 'low' });
    b.f('poster', 12, 17.6, 2.2, 0.3, { kind: 'bus', layer: 2 });
    b.act(4.5, 11.7, 1.3, () => sleepHint('Nap on the sofa'), () => sleep(sc)); b.act(4.5, 8.0, 1.3, () => 'F: Watch TV', () => watchTv(sc));
    b.f('kcounter', 21, 13, 1.0, 9, { solid: 'low' }); b.f('fridge1', 17, 17.05, 1.0, 0.9, { solid: 'tall' });
    b.f('table', 18.2, 12.6, 1.5, 1.5, { solid: 'low', c: '#c8b48a' }); b.f('chair', 18.2, 11.35, 0.5, 0.5, { rot: Math.PI / 2 }); b.f('chair', 18.2, 13.85, 0.5, 0.5, { rot: -Math.PI / 2 });
    b.act(17, 15.9, 1.3, () => 'F: Grab a snack (+10 hp)', () => snack(10, 'Leftover pizza. Cold, but it counts.'));
    b.light(5, 11, 8, '#ffd9a0', 0.7, { fix: 'lamp' }); b.light(1.2, 13.6, 3.5, '#ffcf80', 0.6); b.light(19, 13, 6, '#f6fbff', 0.7, { fix: 'panel' });
    b.light(5, 3, 5, '#ffcf90', 0.55, { fix: 'lamp' }); b.light(13, 3, 4, '#f0fbff', 0.7, { fix: 'bulb' }); b.light(19, 3, 4, '#ffe0a8', 0.6, { fix: 'lamp' });
    b.win(0, 1, 0.5, 5); b.win(21.5, 9, 22, 16); b.win(0, 8, 0.5, 15); b.win(17, 0, 21, 0.5);
    sc.critter = { kind: 'cat', x: sc.ox + 9, y: sc.oy + 14 };
  };
  L.hideout = (sc, b) => {
    Object.assign(sc, { camSpan: 27, ambient: 0.5, wallTop: '#2e2a33', wallLo: '#1a171d', wallHi: '#57505f' });
    b.room(0, 0, 20, 24, 'concrete', '#5d5c59', '#474643'); b.room(20, 0, 30, 11, 'wood', '#6b5038', '#513b28'); b.room(20, 11, 30, 24, 'carpet', '#4a3f5c', '#3c3350');
    b.box(); b.entrance(10, 4.4, 'roller');
    b.vwall(20, 0.5, 23.5, [[8.5, 2.0], [17.2, 2.2]]); b.hwall(11, 20, 29.75, [[25, 1.8]]);
    b.f('paint', 8, 9, 4.4, 7.4, { hazard: 1, layer: 0 });
    b.f('carlift', 8, 9, 2.6, 5.4, { solid: 'low', car: '#3b4049' });
    b.f('workbench', 1.15, 15, 1.2, 6, { solid: 'low' }); b.f('tools', 0.7, 15, 0.25, 5, { layer: 2 });
    b.f('tyres', 2.1, 21.8, 1.5, 1.5, { solid: 'low' }); b.f('tyres', 17.6, 21.6, 1.5, 1.5, { solid: 'low' }); b.f('toolbox', 18.4, 3.0, 1.2, 0.7, { solid: 'low' });
    b.f('shelf', 14.5, 0.95, 7, 0.9, { solid: 'tall', parts: 1 }); b.f('hoist', 13.4, 9, 1.4, 1.4);
    for (const q of [[9.5, 15.5, 1.6], [4, 6, 1.1], [14, 18.5, 1.3], [7, 20.5, 0.9]]) b.f('oil', q[0], q[1], q[2], q[2] * 0.7, { layer: 0 });
    b.ped('worker', 11.2, 10, Math.PI, { look: 'mechanic', wander: true });
    for (const q of [[11.2, 7, Math.PI], [4.8, 11, 0], [11.2, 12, Math.PI], [2.4, 15, Math.PI], [16, 4, -Math.PI / 2]]) b.browse(q[0], q[1], q[2]);
    b.f('desk', 25, 4, 3, 1.3, { solid: 'low', c: '#5a3b22', phone: 1, note: 'Gone to the Rusty Pillar. -T' }); b.f('chair', 25, 2.8, 0.7, 0.7, { rot: Math.PI / 2, boss: 1 });
    b.f('whiteboard', 29.4, 5.5, 0.3, 4.4, { layer: 2, plan: 1 }); b.act(28.1, 5.5, 1.6, () => 'F: Study the heist plans', () => plans());
    b.f('filing', 21.1, 1.1, 1.0, 0.8, { solid: 'tall' }); b.f('portrait', 24.5, 0.8, 1.2, 0.35, { layer: 2, text: 'EMPLOYEE OF THE MONTH' }); b.f('plant', 29, 10.1, 0.9, 0.9, { solid: 'low' });
    b.f('sofa', 25, 22.7, 4.4, 1.1, { solid: 'low', c: '#7a3b2e', back: 's' }); b.f('table', 25, 20.4, 2, 0.8, { solid: 'low', c: '#3d2a1d', mugs: 1 }); b.f('rug', 25, 19.5, 6, 4.5, { c: '#5a4a7a', c2: '#c9a46a', layer: 0 });
    b.f('tv', 25, 12.0, 2.2, 0.5, { solid: 'low', fragile: true, show: 'news' });
    b.f('arcade', 29.0, 15.5, 1.0, 1.2, { solid: 'tall', fragile: true }); b.act(27.8, 15.5, 1.4, () => 'F: Play Take the Bus! Drift', () => arcade());
    b.f('fridge1', 21.05, 22.9, 0.9, 1.0, { solid: 'tall' }); b.act(21.2, 21.6, 1.2, () => 'F: Grab a beer (+5 hp)', () => snack(5, 'Skål! Artur\'s beer. He will notice.'));
    b.act(25, 21.4, 1.5, () => sleepHint('Sleep on the sofa'), () => sleep(sc));
    b.f('poster', 25, 11.3, 2.4, 0.3, { kind: 'bus', layer: 2 });
    for (const q of [[6, 6], [14, 6], [6, 16], [14, 16]]) b.light(q[0], q[1], 8.5, '#e8f0ff', 0.7, { fix: 'tube', flick: q[0] === 14 && q[1] === 16 ? 1 : 0 });
    b.light(25, 4, 5, '#ffd9a0', 0.7, { fix: 'lamp' }); b.light(25, 18, 6, '#ffcf90', 0.6, { fix: 'lamp' });
  };
  L.store = (sc, b, R) => {
    Object.assign(sc, { camSpan: 21, ambient: 0.95, wallTop: '#3c4048', wallLo: '#25282e', wallHi: '#6a707c' });
    b.room(0, 0, 20, 16, 'lino', '#e8e3d8', '#cbc4b4');
    b.box(); b.entrance(8, 2.4);
    b.f('counter', 14.2, 10.5, 1.2, 5.8, { solid: 'low', c: '#c0392b', top: '#e9e4d8' });
    b.f('shelf', 18.95, 10.5, 0.8, 5.6, { solid: 'tall', smokes: 1 });
    b.f('register', 14.2, 9.6, 0.6, 0.7); b.f('hotdog', 14.2, 12.4, 0.8, 1.0); b.f('cards', 14.2, 8.3, 0.5, 0.8);
    b.ped('cashier', 16.2, 10.5, Math.PI, { look: 'clerk247', rob: [120, 400] });
    for (const x of [3, 6.4, 9.8]) b.f('shelf', x, 6.7, 1.0, 7, { solid: 'tall' });
    b.f('fridge', 6.5, 0.95, 11, 0.9, { solid: 'tall', fragile: true });
    b.f('slush', 16.6, 1.1, 1.2, 0.8, { solid: 'tall' }); b.f('freezer', 17.4, 5, 2.2, 1.1, { solid: 'low' }); b.f('mags', 2.4, 14.6, 2.8, 0.6, { solid: 'low' });
    b.f('mirror', 0.9, 0.9, 0.7, 0.7, { layer: 3 });
    for (const x of [4.7, 8.1, 11.7]) { b.browse(x, 5 + R() * 3, x < 11 ? Math.PI : 0); b.browse(x, 9, x < 11 ? 0 : Math.PI); }
    for (const x of [3, 6, 9, 12]) b.browse(x, 2.2, -Math.PI / 2);
    b.browse(17.4, 6.3, -Math.PI / 2); b.browse(2.4, 13.8, Math.PI / 2); b.browse(12.9, 10.5, 0);
    b.ped('customer', 4.7, 6, Math.PI, { chance: 0.85 }); b.ped('customer', 9, 2.2, -Math.PI / 2, { chance: 0.6 }); b.ped('customer', 12.9, 10.4, 0, { chance: 0.4 });
    b.act(13, 12.4, 1.3, () => 'F: Buy a pølse ($5, +10 hp)', () => buyFood(5, 10, 'One pølse with everything.'));
    b.act(13, 8.3, 1.3, () => 'F: Scratch card ($5)', () => scratch());
    for (const q of [[4, 4.5], [10.5, 4.5], [4, 10.5], [10.5, 10.5]]) b.light(q[0], q[1], 7, '#f4fbff', 0.9, { fix: 'panel' });
    b.light(16.6, 10.5, 5, '#fff4dc', 0.7, { fix: 'panel' });
    b.win(1, 15.5, 6, 16); b.win(10.5, 15.5, 18.5, 16);
  };
  L.lobby = (sc, b) => {
    Object.assign(sc, { camSpan: 20, ambient: 0.75, wallTop: '#4b4a52', wallLo: '#2e2d33', wallHi: '#7a7984' });
    b.room(0, 0, 18, 16, 'marble', '#cfc6b4', '#a99f8a');
    b.box(); b.entrance(9, 2.4);
    b.f('mailboxes', 0.95, 6, 0.8, 5, { solid: 'tall' }); b.act(2.0, 6, 1.5, () => 'F: Check the mail', () => mail());
    b.f('lift', 5.5, 0.8, 2.2, 0.45, { layer: 2 }); b.f('lift', 9.5, 0.8, 2.2, 0.45, { layer: 2 }); b.act(7.5, 1.7, 2.2, () => 'F: Call the lift', () => lift());
    b.f('stairs', 15.55, 3.75, 3.9, 6.5, { solid: 'tall' });
    b.f('desk', 13, 11, 3.2, 1.2, { solid: 'low', c: '#4a3a2e', pc: 1, face: 's' }); b.ped('clerk', 13, 9.9, Math.PI / 2, { look: 'suit' });
    b.f('bench', 1.3, 12.5, 0.9, 3.5, { solid: 'low', c: '#6b4a32', back: 'w' }); b.f('plant', 1.4, 1.4, 1, 1, { solid: 'low' }); b.f('plant', 16.6, 14.6, 1, 1, { solid: 'low' });
    b.f('rug', 9, 9.4, 3, 11, { c: '#3f5f7a', c2: '#c9a46a', layer: 0 });
    b.f('sign', 12.6, 0.8, 3.0, 0.4, { text: 'NO BUSES IN THE HALLWAY', c: '#222', bg: '#e9e4d8', size: 0.2, layer: 2 });
    b.ped('customer', 7.5, 2.5, -Math.PI / 2, { chance: 0.5 }); b.ped('customer', 4, 10, 0, { chance: 0.5 }); b.ped('sitter', 1.75, 12, 0, { chance: 0.3 });
    for (const q of [[7.5, 2.5, -Math.PI / 2], [2.0, 6, Math.PI], [4, 11, 1], [11, 13, -1], [6, 7, 0]]) b.browse(q[0], q[1], q[2]);
    b.light(9, 5, 8, '#ffe2b0', 0.75, { fix: 'pendant' }); b.light(9, 11.5, 8, '#ffe2b0', 0.75, { fix: 'pendant' });
    b.win(3, 15.5, 7, 16); b.win(11, 15.5, 15, 16);
  };
  L.office = (sc, b) => {
    Object.assign(sc, { camSpan: 25, ambient: 0.75, wallTop: '#3a3f4a', wallLo: '#232730', wallHi: '#69707e' });
    b.room(0, 0, 26, 20, 'carpet', '#5b626d', '#4b525d'); b.room(17, 0, 26, 9, 'carpet', '#6b4a3a', '#563a2d', { nonav: true });
    b.box(); b.entrance(7, 2.4);
    b.vwall(17, 0.5, 9.25, [], 'glass'); b.hwall(9, 17, 25.75, [[20.4, 1.8]], 'glass');
    for (const y of [3, 9.2]) for (const x of [3, 7.6, 12.2]) {
      b.f('desk', x, y, 2.6, 1.2, { solid: 'low', c: '#8a8f99', pc: 1 }); b.f('chair', x, y + 1.1, 0.6, 0.6, { rot: -Math.PI / 2 });
      b.f('partition', x + 1.45, y, 0.12, 1.6, { solid: 'low' });
      b.ped('sitter', x, y + 1.15, -Math.PI / 2, { chance: 0.75, when: 'day', look: 'suit' });
    }
    b.f('cooler', 1.0, 15.5, 0.7, 0.7, { solid: 'tall' }); b.f('printer', 3.2, 18.85, 1.4, 0.9, { solid: 'low' });
    b.f('plant', 1.2, 18.6, 1, 1, { solid: 'low' }); b.f('plant', 24.8, 18.6, 1, 1, { solid: 'low' });
    b.f('table', 12.5, 15, 3.6, 1.6, { solid: 'low', c: '#c8ccd2', mugs: 1 });
    for (const dx of [-1.1, 0, 1.1]) { b.f('chair', 12.5 + dx, 13.75, 0.5, 0.5, { rot: Math.PI / 2 }); b.f('chair', 12.5 + dx, 16.25, 0.5, 0.5, { rot: -Math.PI / 2 }); }
    b.f('whiteboard', 0.7, 10, 0.3, 3.4, { layer: 2 }); b.f('poster', 20, 19.6, 3, 0.3, { kind: 'journey', layer: 2 });
    b.f('desk', 21.5, 3.8, 3, 1.3, { solid: 'low', c: '#5a3a24', pc: 1, face: 's' }); b.f('chair', 21.5, 2.6, 0.7, 0.7, { rot: Math.PI / 2, boss: 1 });
    b.ped('sitter', 21.5, 2.6, Math.PI / 2, { when: 'day', look: 'suit', chance: 0.8 });
    sc.st.safe = b.f('safe', 25.0, 1.3, 1.0, 1.0, { solid: 'tall' }); b.act(24.1, 2.6, 1.5, () => safeHint(sc), () => crackSafe(sc));
    b.f('sofa', 25.0, 6.3, 1.0, 3.0, { solid: 'low', c: '#3a2a22', back: 'e' }); b.f('bookshelf', 18.3, 0.95, 1.6, 0.7, { solid: 'tall' }); b.f('plant', 17.9, 8.0, 0.8, 0.8, { solid: 'low' });
    b.ped('worker', 9, 14, 0, { look: 'cleaner', wander: true, when: 'night' }); b.ped('guard', 23, 15, Math.PI, { weapon: 'pistol', when: 'night', patrol: [[23, 15], [10, 17.5], [3, 14], [10, 12]] });
    b.ped('customer', 2, 15.5, Math.PI, { when: 'day', chance: 0.6, look: 'suit' });
    for (const q of [[1.9, 15.5, Math.PI], [3.2, 17.8, Math.PI / 2], [1.8, 10, Math.PI], [9, 13, 0], [15, 6, 0], [5, 6.2, -1]]) b.browse(q[0], q[1], q[2]);
    b.zone(17, 0.5, 25.5, 8.8);
    for (const q of [[5, 5], [12, 5], [5, 13], [12, 13], [21, 4.5], [21, 15]]) b.light(q[0], q[1], 7.5, '#f2f6ff', 0.75, { fix: 'panel' });
    b.win(0, 2, 0.5, 8); b.win(25.5, 11, 26, 18); b.win(18, 0, 24, 0.5); b.win(1, 0, 15, 0.5);
  };
  L.warehouse = (sc, b) => {
    Object.assign(sc, { camSpan: 28, ambient: 0.45, wallTop: '#4a4038', wallLo: '#2c261f', wallHi: '#776a5c' });
    b.room(0, 0, 30, 24, 'concrete', '#6a6862', '#55534d'); b.room(24, 0, 30, 6, 'lino', '#8a8f86', '#6e7369', { nonav: true });
    b.box(); b.entrance(8, 4.4, 'roller');
    b.vwall(24, 0.5, 6); b.hwall(6, 24, 29.75, [[26.6, 1.8]]);
    for (const y of [3.6, 8.8, 14]) b.f('rack', 11, y, 18, 1.3, { solid: 'tall' });
    b.f('paint', 15, 17.4, 28, 0.14, { c: '#e3b23c', layer: 0 }); b.f('paint', 15, 19.8, 28, 0.14, { c: '#e3b23c', layer: 0 }); b.f('paint', 8, 22.6, 5, 1.2, { hazard: 1, layer: 0 });
    b.f('crates', 25.4, 11, 2.8, 2.8, { solid: 'tall' }); b.f('crate', 24.7, 16.4, 1.4, 1.4, { solid: 'low', text: 'FRAGILE' }); b.f('crate', 26.2, 16.4, 1.4, 1.4, { solid: 'low' });
    b.f('forklift', 14, 21.2, 1.4, 2.6, { solid: 'low' });
    b.f('pallet', 4.5, 21.6, 1.3, 1.1); b.f('pallet', 2.4, 19.2, 1.3, 1.1);
    sc.st.barrels = [[28.4, 21.2], [28.4, 22.4], [27.2, 22.5], [28.5, 19.9]];
    if (!X.addProp) for (const q of sc.st.barrels) b.f('barrel', q[0], q[1], 0.84, 0.84, { solid: 'low' });
    b.f('desk', 27, 1.4, 2.6, 1.0, { solid: 'low', c: '#6b6f78', pc: 1 }); b.f('chair', 27, 2.4, 0.6, 0.6, { rot: -Math.PI / 2 }); b.f('poster', 28, 5.65, 1.6, 0.3, { kind: 'calendar', layer: 2 });
    b.ped('worker', 6, 18.5, 0, { look: 'worker', wander: true }); b.ped('worker', 22, 6, Math.PI, { look: 'worker', wander: true, chance: 0.5, when: 'day' });
    b.ped('sitter', 27, 2.45, -Math.PI / 2, { look: 'guard', when: 'night', chance: 0.7 });
    for (const q of [[6, 6.2, -1.6], [16, 11.4, 1.6], [6, 16.6, 0], [20, 16.6, 0], [22, 11, 0], [3, 18.8, 0], [12, 18.5, 0]]) b.browse(q[0], q[1], q[2]);
    b.act(25.4, 13.2, 1.5, () => crateHint(sc, 0), () => searchCrates(sc, 0)); b.act(23.3, 16.4, 1.4, () => crateHint(sc, 1), () => searchCrates(sc, 1));
    for (const q of [[6, 6], [16, 6], [6, 16.5], [16, 16.5], [26, 14]]) b.light(q[0], q[1], 9, '#ffe9c0', 0.65, { fix: 'bay', flick: q[0] === 16 && q[1] === 16.5 ? 1 : 0 });
    b.light(27, 3, 4, '#f4f8ff', 0.6, { fix: 'tube' });
    sc.critter = { kind: 'rat', x: sc.ox + 21, y: sc.oy + 6 };
  };
  L.club = (sc, b) => {
    Object.assign(sc, { camSpan: 26, ambient: 0.16, wallTop: '#1f1830', wallLo: '#0f0b17', wallHi: '#4a3a6a' });
    b.room(0, 0, 28, 24, 'tile', '#1d1a24', '#131118'); b.room(8, 6, 20, 15, 'dance', '#000', '#000', { nonav: true });
    b.box(); b.entrance(14, 2.4);
    b.f('djbooth', 14, 2.4, 5, 1.2, { solid: 'low' }); b.ped('dj', 14, 1.15, Math.PI / 2, { look: 'dj', pose: 'headbang' });
    b.f('speaker', 9.6, 1.6, 1.4, 1.4, { solid: 'tall' }); b.f('speaker', 18.4, 1.6, 1.4, 1.4, { solid: 'tall' });
    b.f('counter', 3.8, 10, 1.2, 10, { solid: 'low', c: '#2a1f3d', top: '#5a3a8a' }); b.f('bottles', 0.95, 10, 0.8, 10, { solid: 'tall', fragile: true });
    b.ped('clerk', 2.15, 10, 0, { look: 'bartender' }); b.ped('drinker', 5.1, 7.5, Math.PI, { pose: 'drink', chance: 0.8 }); b.ped('drinker', 5.1, 12.6, Math.PI, { pose: 'drink', chance: 0.6 });
    b.f('rope', 22.4, 10, 0.2, 12, { posts: 5, vert: 1 });
    for (const cy of [6.3, 12.6]) {
      b.f('bench', 25.6, cy - 1.25, 3.6, 0.7, { solid: 'low', c: '#5a1f6a', back: 'n' }); b.f('table', 25.6, cy, 2.8, 1.0, { solid: 'low', c: '#2a2433', glasses: 1 }); b.f('bench', 25.6, cy + 1.25, 3.6, 0.7, { solid: 'low', c: '#5a1f6a', back: 's' });
      b.ped('sitter', 24.9, cy - 1.2, Math.PI / 2, { chance: 0.6 }); b.ped('sitter', 26.3, cy + 1.2, -Math.PI / 2, { chance: 0.5 });
    }
    b.f('table', 6.5, 19, 1.0, 1.0, { solid: 'low', round: 1, c: '#3a2f4a', glasses: 1 }); b.f('table', 21.5, 19, 1.0, 1.0, { solid: 'low', round: 1, c: '#3a2f4a', glasses: 1 });
    b.ped('bouncer', 11.4, 21.0, -Math.PI / 2, { look: 'bouncer', hp: 180, weapon: 'bat' });
    for (const q of [[10, 8], [13, 7.5], [16.5, 8.2], [18.5, 10.5], [11, 11], [14.5, 11.5], [17, 13.2], [10.4, 13.8], [13.4, 14]]) b.ped('dancer', q[0], q[1], rand(-3, 3), { pose: 'dance', chance: () => night() ? 0.9 : 0.35 });
    b.ped('drinker', 6.5, 18, Math.PI / 2, { pose: 'drink', chance: 0.6 }); b.ped('drinker', 21.5, 20, -Math.PI / 2, { pose: 'drink', chance: 0.6 });
    b.f('neon', 6.5, 23.4, 7, 0.7, { text: sc.name.toUpperCase(), c: '#c25cff', layer: 2 });
    b.act(14, 10.5, 5.2, () => 'F: Dance', () => dance(sc)); b.act(5.3, 10, 1.4, () => 'F: Buy a drink ($15)', () => drink(15, 15));
    for (const q of [[6.5, 17.5, 0], [21, 17, 0], [8, 17, 1], [19, 4.5, 1]]) b.browse(q[0], q[1], q[2], 'drink');
    for (const q of [[10, 8], [18, 8], [10, 13], [18, 13]]) b.light(q[0], q[1], 6, '#ff3fd0', 0.9, { disco: 1 });
    b.light(3, 10, 5, '#ff4fd8', 0.6); b.light(14, 2.6, 4, '#5af0ff', 0.7);
  };
  L.diner = (sc, b) => {
    Object.assign(sc, { camSpan: 22, ambient: 0.8, wallTop: '#5c2b2b', wallLo: '#3a1a1a', wallHi: '#8e4a4a' });
    b.room(0, 4.2, 24, 16, 'check', '#efe9dc', '#1e1e22'); b.room(0, 0, 24, 4.2, 'tile', '#cfcfca', '#adada6');
    b.box(); b.entrance(20, 2.2);
    b.wall(0, 3.95, 2.5, 4.45); b.f('counter', 9.25, 4.2, 13.5, 1.2, { solid: 'low', c: '#b22a2a', top: '#e9e4d8' }); b.hwall(4.2, 16, 23.75, [[18.8, 1.6]]);
    b.f('pies', 14.6, 4.05, 1.2, 0.6); b.f('register', 4, 4.05, 0.6, 0.5);
    for (let x = 3.5; x <= 15.2; x += 1.5) b.f('stool', x, 5.4, 0.5, 0.5, { c: '#c0392b' });
    b.f('grill', 8.5, 1.15, 4, 1.0, { solid: 'low' }); b.f('kcounter', 4.6, 1.15, 2.2, 1.0, { solid: 'low' }); b.f('sink', 13.4, 1.1, 1.2, 0.8, { solid: 'low' }); b.f('fridge1', 22.6, 1.4, 1.2, 1.2, { solid: 'tall' });
    b.ped('clerk', 8.6, 2.55, -Math.PI / 2, { look: 'chef' });
    for (const [x, cys] of [[2.2, [8.5, 13]], [21.8, [8.5]]]) for (const cy of cys) {
      b.f('bench', x, cy - 1.15, 3.2, 0.7, { solid: 'low', c: '#b22a2a', back: 'n' }); b.f('table', x, cy, 2.4, 0.9, { solid: 'low', c: '#d9d2c3', plates: 1 }); b.f('bench', x, cy + 1.15, 3.2, 0.7, { solid: 'low', c: '#b22a2a', back: 's' });
      b.ped('sitter', x - 0.5, cy - 1.1, Math.PI / 2, { chance: 0.55 }); b.ped('sitter', x + 0.5, cy + 1.1, -Math.PI / 2, { chance: 0.45 });
    }
    for (const [x, y] of [[10, 10], [14, 13]]) { b.f('table', x, y, 1.2, 1.2, { solid: 'low', round: 1, c: '#d9d2c3', plates: 1 }); b.f('chair', x - 0.95, y, 0.5, 0.5, { rot: 0, c: '#b22a2a' }); b.f('chair', x + 0.95, y, 0.5, 0.5, { rot: Math.PI, c: '#b22a2a' }); }
    b.ped('sitter', 6.5, 5.45, -Math.PI / 2, { chance: 0.5 }); b.ped('sitter', 12.5, 5.45, -Math.PI / 2, { chance: 0.4 });
    b.ped('customer', 16, 9, 0, { look: 'waitress', wander: true });
    for (const q of [[4.6, 8.5, Math.PI], [4.6, 13, Math.PI], [19.2, 8.5, 0], [10, 11.4, -Math.PI / 2], [14, 11.6, -Math.PI / 2], [9, 5.9, -Math.PI / 2], [17.5, 5.9, -Math.PI / 2]]) b.browse(q[0], q[1], q[2]);
    sc.st.juke = b.f('jukebox', 23.05, 13.4, 0.9, 1.2, { solid: 'tall', fragile: true }); b.act(21.9, 13.4, 1.3, () => 'F: Change the song', () => jukebox(sc));
    b.act(9, 5.7, 1.5, () => 'F: Order waffles ($12, +30 hp)', () => buyFood(12, 30, 'Waffles with brown cheese. Very traditional.'));
    b.f('neon', 7, 15.45, 3.4, 0.7, { text: 'OPEN 24H', c: '#ff5a4a', layer: 2 });
    for (const q of [[5, 9], [12, 9], [19, 9], [5, 13.5], [12, 13.5]]) b.light(q[0], q[1], 6, '#ffd9a0', 0.7, { fix: 'pendant' });
    b.light(9, 2, 6, '#f6fbff', 0.8, { fix: 'panel' });
    b.win(0, 6, 0.5, 15); b.win(23.5, 6, 24, 12); b.win(2, 15.5, 12, 16);
  };
  const LAYOUT_SIZE = { bank: [36, 34], police: [30, 24], hospital: [30, 26], gunshop: [22, 18], bar: [28, 22], apartment: [22, 18], hideout: [30, 24], store: [20, 16], lobby: [18, 16], office: [26, 20], warehouse: [30, 24], club: [28, 24], diner: [24, 16] };

  // Every layout is drawn with its street door in the bottom wall, entered walking up. orient() turns the
  // finished room so its door is on the side the player walked in from: a door on a building's top face is
  // entered walking down, so the room's door goes to the top; a left-face door puts it on the left, and so on.
  // Everything with a position turns with it; the door and street strip are drawn through sc.T, the turn as a
  // canvas transform, from the untouched copies entry0 / exit0 / y10. The bank is left as built (its vault
  // swings on hard-coded offsets).
  function orient(sc, door) {
    const nx = door.nx || 0, ny = door.ny || 0;
    const k = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 'W' : 'E') : (ny < 0 ? 'N' : null);
    if (!k) return;
    const W = sc.w, H = sc.h, ox = sc.ox, oy = sc.oy;
    const loc = k === 'N' ? (x, y) => [W - x, H - y] : k === 'W' ? (x, y) => [H - y, x] : (x, y) => [y, W - x];
    const da = k === 'N' ? Math.PI : k === 'W' ? Math.PI / 2 : -Math.PI / 2;
    sc.T = k === 'N' ? [-1, 0, 0, -1, 2 * ox + W, 2 * oy + H] : k === 'W' ? [0, 1, -1, 0, ox + oy + H, oy - ox] : [0, -1, 1, 0, ox - oy, oy + ox + W];
    sc.orient = k; sc.loc = loc;
    sc.entry0 = sc.entry && Object.assign({}, sc.entry); sc.exit0 = sc.exit && Object.assign({}, sc.exit); sc.y10 = sc.y1;
    const pt = o => { if (!o || o.x == null) return; const q = loc(o.x - ox, o.y - oy); o.x = ox + q[0]; o.y = oy + q[1]; };
    const rc = o => { if (!o) return; const a = loc(o.x0 - ox, o.y0 - oy), b = loc(o.x1 - ox, o.y1 - oy); o.x0 = ox + Math.min(a[0], b[0]); o.x1 = ox + Math.max(a[0], b[0]); o.y0 = oy + Math.min(a[1], b[1]); o.y1 = oy + Math.max(a[1], b[1]); };
    const ang = (o, key) => { if (o && o[key] != null) o[key] += da; };
    for (const q of sc.rooms) rc(q);
    for (const q of sc.walls) rc(q);
    for (const q of sc.zones) rc(q);
    for (const q of sc.wins || []) rc(q);
    rc(sc.exit);
    for (const q of sc.lights) pt(q);
    for (const q of sc.acts) pt(q);
    for (const q of sc.loot) pt(q);
    for (const q of sc.pads) pt(q);
    for (const q of sc.browse) { pt(q); ang(q, 'th'); }
    for (const q of sc.specs) { pt(q); ang(q, 'th'); if (q.patrol) q.patrol.forEach(pt); }
    for (const f of sc.furn) { pt(f); f.rot = (f.rot || 0) + da; }
    for (const g of sc.gaps) { pt(g); if (k !== 'N') g.vert = !g.vert; }
    if (sc.critter) pt(sc.critter);
    pt(sc.spawn); ang(sc.spawn, 'th');
    pt(sc.entry);
    if (sc.st.barrels) sc.st.barrels = sc.st.barrels.map(q => loc(q[0], q[1]));
    // solids live in the city's spatial hash: take each out, turn it, put it back
    sc.solids = [];
    for (const q of sc.rects) {
      rc(q);
      if (!q.solid) continue;
      PG.cityRemove(X.city, q.solid);
      const o = { kind: 'building', interior: sc.key, poly: PG.obb((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, q.x1 - q.x0, q.y1 - q.y0, 0) };
      PG.cityPut(X.city, o); sc.solids.push(o); q.solid = o;
    }
    if (k !== 'N') { sc.w = H; sc.h = W; }
    sc.x1 = ox + sc.w; sc.y1 = oy + sc.h;
  }
  // A layout-local point (as the layout was written) in world coordinates, after orient().
  const wl = (sc, x, y) => { const q = sc.loc ? sc.loc(x, y) : [x, y]; return { x: sc.ox + q[0], y: sc.oy + q[1] }; };
  // Runs draw() in the layout's own frame (door at the bottom), for the door and the street outside it.
  function inFrame(sc, ctx, draw) { if (!sc.T) return draw(); ctx.save(); ctx.transform(...sc.T); draw(); ctx.restore(); }

  // ================= scenes: build, cache, enter, leave =================
  function buildScene(door) {
    const type = door.type, sz = LAYOUT_SIZE[type];
    const sc = newScene(type, door.key, door.name, sz[0], sz[1]);
    sc.cityDoor = { x: door.x, y: door.y, nx: door.nx, ny: door.ny };
    sc.cityPos = { x: door.x + door.nx * 1.3, y: door.y + door.ny * 1.3 };
    sc.door = door; sc.gen = !!door.gen;
    const R = rng((door.bi || 7) * 977 + type.length * 31 + ((X.city && X.city.seed) || 1) % 9973);
    L[type](sc, B(sc), R);
    if (type !== 'bank') orient(sc, door);
    for (const f of sc.furn) prepFurn(f, R);
    if (sc.st.pool) initBalls(sc);
    buildNav(sc);
    sc.drawFloor = (ctx, view, t) => drawFloor(sc, ctx, view, t);
    sc.drawWalls = (ctx, view, t) => drawWalls(sc, ctx, view, t);
    sc.drawTop = (ctx, view, t) => drawTop(sc, ctx, view, t);
    S.scenes.set(sc.key, sc);
    return sc;
  }
  function destroyScene(sc) {
    despawn(sc);
    for (const o of sc.solids) PG.cityRemove(X.city, o);
    sc.solids = [];
    if (sc.props && X.removeProp) for (const pr of sc.props) X.removeProp(pr);
    S.scenes.delete(sc.key); S.free.push(sc.slot);
  }
  function sceneFor(door) {
    let sc = S.scenes.get(door.key);
    if (sc) return sc;
    if (door.gen) {
      const gens = [...S.scenes.values()].filter(q => q.gen && q !== X.scene).sort((a, b) => a.used - b.used);
      while (gens.length >= MAX_GEN) destroyScene(gens.shift());
    }
    return buildScene(door);
  }
  function findDoor(arg) {
    if (!S) return null;
    if (!arg) return null;
    if (typeof arg === 'string') {
      const d = S.doors.find(q => q.place === arg || q.key === arg); if (d) return d;
      if (GEN_TYPES.includes(arg)) { const f = X.focus(); let best = null, bd = 1e9; for (const q of S.doors) if (q.type === arg) { const dd = Math.hypot(q.x - f.x, q.y - f.y); if (dd < bd) { bd = dd; best = q; } } return best; }
      return null;
    }
    if (arg.key && S.doors.includes(arg)) return arg;
    if (arg.x0 != null) {   // a building
      const d = S.doors.find(q => q.b === arg); if (d) return d;
      const dr = X.buildingDoor(arg, 0); if (!dr) return null;
      const i = X.city.buildings.indexOf(arg);
      const nd = { key: 'b:' + i, bi: i, type: GEN_TYPES[Math.max(0, i) % GEN_TYPES.length], b: arg, x: dr.x, y: dr.y, nx: dr.nx, ny: dr.ny, gen: true };
      nd.name = NAMES[nd.type][Math.max(0, i) % NAMES[nd.type].length];
      S.doors.push(nd);
      return nd;
    }
    return null;
  }
  function enterDoor(door) {
    if (!live() || !door || !P.ped || P.ped.dead) return null;
    if (P.car) { const c = P.car; if (c.driver === P.ped) c.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
    if (X.scene) { if (X.scene.key === door.key) return X.scene; X.leaveScene(); }
    const sc = sceneFor(door);
    sc.used = X.time;
    recover(sc);
    populate(sc);
    if (sc.type === 'warehouse') barrels(sc);
    sc.exitArmed = false;
    P.entering = null; P.ped.knock = 0; P.ped.vx = P.ped.vy = 0; P.ped.pose = null;
    S.cur = sc; S.rob = null; S.warn = null; S.padIn = null; S.fade = { t: 0, dur: 0.45, mode: 'in' };
    if (sc.critter) Object.assign(sc.critter, { st: null, x: sc.critter.x0 || sc.critter.x, y: sc.critter.y0 || sc.critter.y });
    X.enterScene(sc, sc.spawn.x, sc.spawn.y, sc.spawn.th);
    S.stats.entered++;
    sfx(sc.type === 'store' || sc.type === 'gunshop' || sc.type === 'diner' ? 'bell' : 'door');
    const host = sc.peds.find(q => mine(q) && (q.ai.role === 'cashier' || q.ai.role === 'clerk' || q.ai.role === 'owner' || q.ai.role === 'sergeant'));
    const hello = GREET[sc.type]; if (host && hello && !(sc.st.alarm || sc.st.bellT > 0)) say(host, pick(hello));
    if (sc.type === 'bank' && (P.wanted || 0) >= 3) hostileAll(sc, 'guard');
    X.emit('interiorEnter', { scene: sc, door });
    return sc;
  }
  function leave() {
    const sc = X.scene; if (!sc || !sc._int) return false;
    const d = sc.cityDoor;
    X.leaveScene(d.x + d.nx * 1.3, d.y + d.ny * 1.3, Math.atan2(d.ny, d.nx));
    S.doorArmed = false;
    return true;
  }
  function cleanup(sc) {
    despawn(sc);
    if (sc._floorC) tcDrop(sc._floorC);
    if (sc.st.drill) sc.st.drill.on = false;
    S.rob = null; S.warn = null; S.padIn = null; S.danceT = 0;
    if (P.ped) P.ped.pose = null;
    if (sc.st.cracking) sc.st.cracking = false;
    silence();
  }
  function despawn(sc) {
    for (const p of sc.peds) if (!p.removed) p.removed = true;
    sc.peds = [];
  }
  // Somebody is put in the vault, a till refills: robbed places come back after a few game hours.
  function recover(sc) {
    const st = sc.st;
    if (st.robbedAt == null || X.scene === sc || S.gmin - st.robbedAt < RECOVER) return;
    if (sc.type === 'bank') resetBank(sc);
    else { st.robbedAt = null; st.safeOpen = false; st.safeProg = 0; st.crates = null; st.bellT = 0; }
  }
  function resetBank(sc) {
    const st = sc.st;
    st.alarm = false; st.vaultOpen = false; st.doorA = 0; st.drill = null; st.robbedAt = null;
    if (!st.plug.q) st.plug.q = addSolid(sc, st.plug, 'tall');
    if (st.doorQ) { removeSolid(sc, st.doorQ); st.doorQ = null; }
    for (const l of sc.loot) { l.taken = false; l.amount = l.a0; }
    buildNav(sc);
    if (X.scene === sc) populate(sc);
  }

  // ================= people =================
  const SUIT = ['#2b2f3a', '#3a3f4a', '#1f2533', '#4a4036', '#2f3b2f'], TIE = ['#b0151a', '#1f4f9c', '#d9a92a', '#6b2a5a', '#2f7d6d'];
  const NEONS = ['#ff4a8a', '#3fd0ff', '#b6ff3a', '#ff8a1e', '#ffffff', '#c25cff', '#ffd23a'], JACK = ['#2b2d33', '#5a3d22', '#1f3f6e', '#4a5a3a', '#7a2a24', '#8a8f96'];
  function makeLook(kind) {
    const L0 = X.randomLook(); L0.scale = rand(0.95, 1.06);
    const A = o => Object.assign(L0, o);
    if (LOOKS[kind]) return A(LOOKS[kind](L0, KIT));
    switch (kind) {
      case 'guard': return A({ outfit: 'guard', shirt: '#59606b', pants: '#23272e', hat: '#1d2026', hatType: 'cap', scale: rand(1.02, 1.1) });
      case 'cop': case 'sergeant': return A({ outfit: 'cop', shirt: '#22376b', pants: '#1a2440', hat: '#141c33', hatType: 'police' });
      case 'suit': case 'teller': { const s = pick(SUIT); return A({ outfit: 'suit', shirt: s, pants: s, tie: pick(TIE), hat: null }); }
      case 'nurse': return A({ outfit: 'medic', shirt: '#7fc4b8', pants: '#7fc4b8', hat: null, hairStyle: pick(['bun', 'pony', 'short']) });
      case 'doctor': return A({ shirt: '#3a6ea5', jacket: '#f4f6f8', pants: '#2b3a55', hat: null });
      case 'gown': return A({ shirt: '#b8d4e8', pants: '#b8d4e8', hat: null });
      case 'sick': return A({ jacket: pick(JACK), hat: null, scale: rand(0.9, 1) });
      case 'clerk247': return A({ shirt: '#e07b2a', pants: '#2b2d33', hat: '#e07b2a', hatType: 'cap' });
      case 'bartender': return A({ shirt: '#f2f2f2', jacket: '#1b1f27', pants: '#1b1f27', tie: '#b0151a', hat: null });
      case 'chef': return A({ shirt: '#f4f4f4', pants: '#4a4f58', hat: '#ffffff', hatType: 'beanie' });
      case 'waitress': return A({ shirt: '#d64a8f', pants: '#1b1f27', hairStyle: 'pony', hat: null });
      case 'owner': return A({ shirt: '#4a5a3a', pants: '#3a3a2a', hat: '#4a5a3a', hatType: 'cap', hairStyle: 'buzz', scale: 1.12 });
      case 'dj': return A({ shirt: '#1b1f27', pants: '#1b1f27', hat: '#1b1f27', hatType: 'beanie' });
      case 'dancer': return A({ shirt: pick(NEONS), pants: pick(['#1b1f27', '#2b2d33', '#3a3a5a', '#f2f2f2']), hat: null, hairStyle: pick(['long', 'pony', 'afro', 'curly', 'short', 'bun']) });
      case 'bouncer': return A({ shirt: '#111216', pants: '#111216', hat: null, hairStyle: 'bald', scale: 1.22 });
      case 'worker': return A({ outfit: 'worker', shirt: '#e07b2a', pants: '#2b3a55', hat: '#f2c230', hatType: 'hard' });
      case 'mechanic': return A({ outfit: 'overalls', shirt: '#2f5a8a', pants: '#2f5a8a', hat: '#c0392b', hatType: 'cap' });
      case 'cleaner': return A({ shirt: '#5a7a9a', pants: '#5a7a9a', hat: null });
      case 'drunk': return A({ jacket: pick(JACK), acc: 'beer', hat: null });
      case 'artur': return { skin: '#f1c7a1', hair: '#b9a47a', hairStyle: 'short', shirt: '#1f2a44', pants: '#16203a', tie: '#c0392b', outfit: 'suit', hat: null, scale: 1.14 };
      default: if (Math.random() < 0.4) L0.jacket = pick(JACK); return L0;
    }
  }
  const SIT_POSES = { sit: 1, lie: 1 };
  function spawnPed(sc, sp) {
    const role = sp.role, armed = !!sp.weapon && sp.weapon !== 'bat';
    const team = sp.team || (role === 'guard' ? 'guard' : role === 'cop' || role === 'sergeant' ? 'cop' : 'civ');
    const hp = role === 'artur' ? 5000 : sp.hp || 100;
    const pose = sp.pose || (sp.sit || role === 'sitter' ? 'sit' : null);
    const p = X.makePed({
      x: sp.x, y: sp.y, th: sp.th, team, look: makeLook(sp.look || role), weapon: sp.weapon || null, hp, maxHp: hp, armor: sp.armor || 0,
      ai: {
        owner: 'interiors', role, sc, sp, st: 'idle', home: { x: sp.x, y: sp.y, th: sp.th }, t: rand(1, 6), sayT: rand(4, 12), fireT: rand(0.6, 1.2), losT: 0, los: false,
        path: null, pi: 0, repath: 0, gx: null, gy: null, hostile: false, armed, melee: role === 'bouncer' || role === 'drinker', pose,
        wander: !!sp.wander || role === 'customer', patrol: sp.patrol || null, pk: 0, face: null, look: 0,
        rob: sp.rob ? { amt: Math.round(rand(sp.rob[0], sp.rob[1]) / 10) * 10, done: sc.st.robbedAt != null && sc.type !== 'bank' } : null,
      },
    });
    p.pose = pose; p.sitting = !!SIT_POSES[pose];
    if (sp.weapon) { p.holster = true; p.dmgMul = 0.4; p.inaccuracy = 0.1; p.rateMul = 1.5; }
    if (role === 'artur') { p.noCash = true; p.keep = true; }
    sc.peds.push(p);
    return p;
  }
  function populate(sc) {
    despawn(sc);
    const st = sc.st;
    st.shotWarn = false; st.panicT = 0;
    for (const sp of sc.specs) {
      if (sp.when === 'day' && !day()) continue;
      if (sp.when === 'night' && day()) continue;
      const ch = typeof sp.chance === 'function' ? sp.chance() : sp.chance;
      if (ch != null && Math.random() > ch) continue;
      if (sc.type === 'bank' && st.alarm) {   // closed for investigation: cops instead of guards, nobody else
        if (sp.role === 'guard') spawnPed(sc, Object.assign({}, sp, { role: 'cop', look: 'cop', team: 'cop', sit: false }));
        continue;
      }
      spawnPed(sc, sp);
    }
  }
  function standUp(sc, p) {
    if (!p.sitting) return;
    p.sitting = false; p.pose = null;
    if (sc.nav && sc.nav.nodes.length) { const n = sc.nav.nodes[nearNode(sc, p.x, p.y)]; if (n && Math.hypot(n.x - p.x, n.y - p.y) < 2.5) { p.x = n.x; p.y = n.y; } }
  }
  function face(p, th, dt, k) { p.th += wrap(th - p.th) * Math.min(1, dt * (k || 5)); }
  function say(p, text, col) {
    if (!p || p.dead || !S) return;
    for (const b of S.bubbles) if (b.p === p) { b.text = text; b.t = 0; b.col = col || '#fff'; return; }
    if (S.bubbles.length >= 5) S.bubbles.shift();
    S.bubbles.push({ p, text, t: 0, life: 2.6, col: col || '#fff' });
  }
  function pedTick(sc, p, dt) {
    const a = p.ai;
    if (p.dead || p.removed) return;
    if (a.role === 'artur' && p.hp < p.maxHp) p.hp = p.maxHp;   // the boss does not die in his own bar
    a.t -= dt; a.sayT -= dt;
    if (p.knock > 0) { if (p.sitting) { p.sitting = false; p.pose = null; } X.movePed(p, dt, 0, 0); return; }
    switch (a.st) {
      case 'idle': idle(sc, p, a, dt); break;
      case 'walk':
        if (goTo(p, sc, a.tx, a.ty, a.sp || 1.6, dt) || a.t <= 0 || a.stuckN > 2) { a.st = 'idle'; a.t = rand(3, 9); a.stuckN = 0; a.face = a.tth; p.pose = a.tpose || null; }
        break;
      case 'flee': {
        if (p.sitting) standUp(sc, p);
        p.pose = null;
        const ex = sc.exit, tx = (ex.x0 + ex.x1) / 2, ty = (ex.y0 + ex.y1) / 2;
        goTo(p, sc, tx, ty, 6, dt);
        if (Math.hypot(tx - p.x, ty - p.y) < 1.4) p.removed = true;   // out of the front door
        else if (a.stuckN > 3) { a.st = 'cower'; a.t = rand(5, 9); p.pose = 'cower'; }
        break;
      }
      case 'cower':
        if (!p.sitting) X.movePed(p, dt, 0, 0);
        if (p.pose !== 'lie') p.pose = 'cower';
        if (a.t <= 0 && X.time - (sc.st.panicT || 0) > 7) { a.st = 'idle'; p.pose = a.pose; a.t = rand(2, 5); if (p.pose === 'sit' && !p.sitting) p.pose = null; }
        break;
      case 'hands':
        X.movePed(p, dt, 0, 0); p.pose = 'hands';
        face(p, Math.atan2(P.ped.y - p.y, P.ped.x - p.x), dt, 8);
        if (a.t <= 0) { a.st = 'cower'; a.t = rand(5, 9); p.pose = 'cower'; }
        break;
      case 'fight': fight(sc, p, a, dt); break;
    }
  }
  function idle(sc, p, a, dt) {
    if (p.sitting) { face(p, a.home.th, dt); chatter(sc, p, a); return; }
    if (a.patrol) {
      const q = a.patrol[a.pk % a.patrol.length];
      if (goTo(p, sc, q.x, q.y, 1.4, dt)) { a.wait = (a.wait || 0) + dt; if (a.wait > 2.5) { a.wait = 0; a.pk++; } }
      return;
    }
    if (a.wander && a.t <= 0 && sc.browse.length) {
      const q = pick(sc.browse);
      Object.assign(a, { st: 'walk', tx: q.x + rand(-0.3, 0.3), ty: q.y + rand(-0.3, 0.3), tth: q.th, tpose: q.pose, sp: rand(1.2, 1.8), t: 20 });
      p.pose = null;
      return;
    }
    const dh = Math.hypot(a.home.x - p.x, a.home.y - p.y);
    if (SIT_POSES[a.pose] && dh < 1.4) { p.x = a.home.x; p.y = a.home.y; p.vx = p.vy = 0; p.sitting = true; p.pose = a.pose; return; }   // back in the seat
    if (!a.wander && dh > 0.5) { goTo(p, sc, a.home.x, a.home.y, 1.4, dt); return; }
    X.movePed(p, dt, 0, 0);
    if (a.t <= 0) { a.t = rand(2, 6); a.look = Math.random() < 0.6 ? 0 : rand(-0.7, 0.7); }
    face(p, (a.face != null ? a.face : a.home.th) + a.look, dt, 4);
    chatter(sc, p, a);
  }
  function chatter(sc, p, a) {
    if (a.sayT > 0) return;
    a.sayT = rand(9, 20);
    const near = Math.hypot(P.ped.x - p.x, P.ped.y - p.y) < 6;
    if (a.role === 'drunk') say(p, pick(LINES.drunk), '#ffd8a0');
    else if (a.role === 'cashier' && near && !a.rob.done) say(p, pick(LINES.cashier));
    else if (a.role === 'artur' && near) say(p, pick(['SIT DOWN. TALK TO ME.', 'YOU AGAIN.', 'THE PHONES ARE RINGING, KID.']), '#ffd23a');
    else if (a.role === 'guard' && near && Math.random() < 0.4) say(p, pick(['NICE DAY FOR BANKING.', 'KEEP MOVING.', 'NO LOITERING.']));
  }

  // ================= combat =================
  function shoot(p, ang) {
    p.aim = ang;
    if (X.WEAPONS) return X.fireWeapon(p, p.weapon || 'pistol', ang);
    // core only: a plain hitscan pistol so guards still mean business
    const R = 30, ca = Math.cos(ang), sa = Math.sin(ang);
    const hit = X.raycast(p.x, p.y, p.x + ca * R, p.y + sa * R, { peds: true, ignore: p });
    const ex = hit ? hit.x : p.x + ca * R, ey = hit ? hit.y : p.y + sa * R;
    if (S.tracers.length < 30) S.tracers.push({ x0: p.x + ca * 0.6, y0: p.y + sa * 0.6, x1: ex, y1: ey, t: 0.09 });
    if (hit && hit.kind === 'ped') X.damagePed(hit.obj, 11, p, 'bullet');
    else if (hit) PG.burst(ex, ey, 'spark', 4, 4, 0.25, 0.08);
    X.addLight(p.x + ca * 0.7, p.y + sa * 0.7, 3, '#ffcf6a', 0.8);
    sfx('shot');
    X.emit('gunfire', { x: p.x, y: p.y, by: p, weapon: p.weapon || 'pistol', radius: 30 });
    return true;
  }
  function punch(p, tg, ang) {
    p.aim = ang;
    if (X.WEAPONS) return X.fireWeapon(p, p.weapon === 'bat' ? 'bat' : 'fists', ang);
    if (Math.hypot(tg.x - p.x, tg.y - p.y) > 1.3) return false;
    X.damagePed(tg, p.weapon === 'bat' ? 14 : 7, p, 'melee'); tg.vx += Math.cos(ang) * 2.5; tg.vy += Math.sin(ang) * 2.5;
    sfx('punch');
    return true;
  }
  function fight(sc, p, a, dt) {
    if (p.sitting) standUp(sc, p);
    p.pose = null; p.holster = false;
    const tg = P.ped;
    if (!inScene(sc) || !tg || tg.dead || P.state !== 'play' || tg.hidden) { X.movePed(p, dt, 0, 0); return; }
    const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy) || 0.01, ang = Math.atan2(dy, dx);
    a.losT -= dt;
    if (a.losT <= 0) { a.losT = 0.2; a.los = d < 34 && sightClear(sc, p.x, p.y, tg.x, tg.y); }
    if (a.melee || !a.armed) {
      if (d > 0.95) {
        if (a.los && clearSeg(sc, p.x, p.y, tg.x, tg.y, 0.3)) { X.movePed(p, dt, dx / d * 5.2, dy / d * 5.2); face(p, ang, dt, 12); }
        else goTo(p, sc, tg.x, tg.y, 5.2, dt);
      } else { X.movePed(p, dt, 0, 0); face(p, ang, dt, 14); a.fireT -= dt; if (a.fireT <= 0) { a.fireT = rand(0.55, 0.95); punch(p, tg, ang); } }
      if (a.sayT <= 0) { a.sayT = rand(4, 8); say(p, pick(LINES.brawl), '#ffd23a'); }
      return;
    }
    if (a.los && d < 26) {
      face(p, ang, dt, 10);
      a.strT = (a.strT || 0) - dt;
      if (a.strT <= 0) { a.strT = rand(0.8, 2); a.str = Math.random() < 0.5 ? -1 : 1; a.halt = Math.random() < 0.4; }
      let vx = 0, vy = 0;
      if (!a.halt) { vx = -dy / d * a.str * 1.6; vy = dx / d * a.str * 1.6; }
      if (d < 4) { vx -= dx / d * 2; vy -= dy / d * 2; } else if (d > 14) { vx += dx / d * 2.5; vy += dy / d * 2.5; }
      X.movePed(p, dt, vx, vy);
      a.fireT -= dt;
      if (a.fireT <= 0 && Math.abs(wrap(ang - p.th)) < 0.3) {
        if (shoot(p, p.th + (Math.random() - 0.5) * 0.14)) { a.burst = (a.burst || 0) + 1; if (a.burst >= 3) { a.burst = 0; a.fireT = rand(0.9, 1.6); } else a.fireT = rand(0.3, 0.5); }
        else a.fireT = 0.1;
      }
      if (a.sayT <= 0) { a.sayT = rand(4, 8); say(p, pick(a.role === 'cop' || a.role === 'sergeant' ? LINES.cop : LINES.guard), '#ffd23a'); }
    } else goTo(p, sc, tg.x, tg.y, 4.6, dt);
  }
  function provoke(sc, p) {
    const a = p.ai;
    if (!mine(p) || p.dead || a.st === 'fight' || a.role === 'artur') return;
    if (a.armed || a.melee || a.role === 'owner') {
      if (p.sitting) standUp(sc, p);
      a.st = 'fight'; a.hostile = true; p.holster = false; p.pose = null; a.fireT = rand(0.3, 0.8); a.losT = 0;
      if (Math.random() < 0.7) say(p, pick(a.role === 'cop' || a.role === 'sergeant' ? LINES.cop : a.melee ? LINES.brawl : LINES.guard), '#ffd23a');
    } else panic(sc, p);
  }
  function panic(sc, p) {
    const a = p.ai;
    if (!mine(p) || p.dead || a.st === 'fight' || a.st === 'flee' || a.st === 'hands' || a.role === 'artur') return;
    if (a.role === 'patient') { a.st = 'cower'; a.t = rand(6, 12); if (Math.random() < 0.3) say(p, 'NURSE!'); return; }
    const staff = a.role === 'clerk' || a.role === 'teller' || a.role === 'cashier' || a.role === 'dj';
    if (Math.random() < (staff ? 0.2 : 0.6)) { a.st = 'flee'; a.path = null; if (p.sitting) standUp(sc, p); p.pose = null; }
    else { a.st = 'cower'; a.t = rand(6, 12); p.pose = p.sitting ? 'sit' : 'cower'; }
    if (Math.random() < 0.45) say(p, pick(LINES.panic));
  }
  // Shots, a robbery, an alarm: everybody armed fights, everybody else panics.
  function alarmScene(sc) {
    sc.st.panicT = X.time;
    for (const p of sc.peds) { if (p.dead || p.removed || !mine(p)) continue; const a = p.ai; if (a.armed || a.role === 'bouncer' || a.role === 'owner') provoke(sc, p); else panic(sc, p); }
  }
  function hostileAll(sc, role) { sc.st.panicT = X.time; for (const p of sc.peds) if (mine(p) && !p.dead && (p.ai.role === role || (role === 'cop' && p.ai.role === 'sergeant'))) provoke(sc, p); }
  // A punch-up in a bar or club: some regulars join in.
  function brawl(sc, victim) {
    sc.st.panicT = X.time;
    for (const p of sc.peds) {
      if (!mine(p) || p.dead || p.ai.st === 'fight') continue;
      const a = p.ai, d = Math.hypot(p.x - victim.x, p.y - victim.y);
      if (a.role === 'bouncer' || p === victim) provoke(sc, p);
      else if ((a.role === 'drinker' || a.role === 'sitter') && d < 9 && Math.random() < 0.45) { a.melee = true; provoke(sc, p); }
      else if (d < 12) panic(sc, p);
    }
  }

  // ================= robbery: point a gun at whoever minds the till =================
  function robTick(sc, dt) {
    const p = P.ped;
    let tgt = null;
    if (!P.car && P.state === 'play' && isGun(P.weapon) && !p.dead) {
      let best = 0.34;
      for (const q of sc.peds) {
        const a = q.ai;
        if (!mine(q) || q.dead || !(a.rob || a.role === 'owner') || a.st === 'flee' || a.st === 'fight') continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d > 10 || d < 0.3) continue;
        const da = Math.abs(wrap(Math.atan2(dy, dx) - p.th)); if (da >= best) continue;
        if (!sightClear(sc, p.x, p.y, q.x, q.y)) continue;
        best = da; tgt = q;
      }
    }
    const R = S.rob;
    if (!tgt) { if (R) { R.lost += dt; if (R.lost > 0.7) S.rob = null; } return; }
    if (!R || R.ped !== tgt) S.rob = { ped: tgt, prog: 0, lost: 0 };
    const r = S.rob, a = tgt.ai;
    r.prog += dt; r.lost = 0;
    if (a.role === 'owner') { if (r.prog > 0.9) { say(tgt, 'WRONG SHOP, FRIEND.', '#ff6b5a'); provoke(sc, tgt); S.rob = null; } return; }
    if (a.rob.done) { if (r.prog > 1 && !r.told) { r.told = true; say(tgt, pick(['THE TILL IS EMPTY! YOU ALREADY GOT IT!', 'AGAIN?! THERE IS NOTHING LEFT!']), '#ffd23a'); if (a.st !== 'cower') { a.st = 'cower'; a.t = 4; tgt.pose = 'cower'; } } return; }
    if (a.st !== 'hands') { a.st = 'hands'; tgt.pose = 'hands'; if (tgt.sitting) tgt.sitting = false; say(tgt, pick(LINES.robbed), '#ffd23a'); }
    a.t = 1.2;
    if (r.prog >= 2) robbed(sc, tgt);
  }
  function robbed(sc, q) {
    const a = q.ai, amt = a.rob.amt;
    a.rob.done = true; S.rob = null; a.t = 1.6;
    X.addLoot(amt, q.x, q.y);
    sfx('cash');
    PG.burst(q.x, q.y, 'confetti', 10, 3, 0.9, 0.18, ['#3fae6a', '#7dff9a', '#2d8a4e']);
    S.stats.robberies++; S.stats.loot += amt;
    say(q, pick(['TAKE IT AND GO!', 'THAT IS ALL OF IT!', 'PLEASE LEAVE!']), '#ffd23a');
    X.crime('robbery', q.x, q.y, { ped: q, amount: amt });
    sc.st.robbedAt = S.gmin;
    if (sc.type === 'bank') { S.stats.tellers++; X.emit('tellerRobbed', { scene: sc, amount: amt, ped: q }); bankAlarm(sc, 'teller'); }
    else {
      sc.st.bellT = 25;
      X.popup('$' + amt + ' from the till. The alarm is ringing!');
      X.emit('storeRobbed', { scene: sc, amount: amt, ped: q });
      for (const o of sc.peds) if (o !== q && mine(o) && !o.dead) { if (o.ai.armed) provoke(sc, o); else panic(sc, o); }
      sc.st.panicT = X.time;
    }
  }

  // ================= the bank job =================
  function bankScene() { const d = S && S.doors.find(q => q.place === 'bank'); return d ? S.scenes.get(d.key) || null : null; }
  const cashLeft = sc => sc.loot.reduce((s, l) => s + (l.taken ? 0 : l.amount), 0);
  function bankAlarm(sc, reason) {
    const st = sc.st; if (st.alarm) return;
    st.alarm = true; st.alarmAt = X.time; st.robbedAt = S.gmin;
    const d = sc.cityDoor, p = P.ped;
    X.crime('heist', p.x, p.y, { place: 'bank', reason });
    X.emit('heistAlarm', { x: d.x, y: d.y, level: 3, reason, scene: sc });
    alarmScene(sc);
    X.pager(reason === 'vault' ? 'The drill tripped every alarm in the building. Seven seconds. Stay next to the vault and stay alive.' : 'The alarm is ringing at Fjord Savings Bank. Every cop in Bussby is on the way.', 6000);
  }
  function vaultHint(sc) {
    const st = sc.st;
    if (st.vaultOpen) return null;
    if (st.drill && st.drill.on) return 'Drilling the vault: ' + Math.round(st.drill.prog * 100) + '%';
    return 'F: Drill the vault';
  }
  function startDrill(sc) {
    const st = sc.st;
    if (st.vaultOpen || (st.drill && st.drill.on)) return;
    st.drill = st.drill || { prog: 0 };
    st.drill.on = true; st.drill.away = 0;
    sfx('clunk');
    X.popup('Thermal drill on. Stay close!');
    bankAlarm(sc, 'vault');
  }
  const VAULT_HINGE = [14.5, 3.55], VAULT_SWING = -1.9;
  function bankTick(sc, dt) {
    const st = sc.st, dr = st.drill, p = P.ped, v = st.vault;
    if (dr && dr.on && !st.vaultOpen) {
      const near = !p.dead && P.state === 'play' && Math.hypot(p.x - (v.x + 2.2), p.y - v.y) < 4.2;
      if (near) {
        dr.prog = Math.min(1, dr.prog + dt / 7); dr.away = 0; dr.warned = false;
        if (Math.random() < dt * 30) PG.burst(v.x + 1.1, v.y + rand(-0.2, 0.2), 'spark', 2, 6, 0.35, 0.08);
        if (Math.random() < dt * 4) PG.burst(v.x + 1.2, v.y, 'smoke', 1, 1, 1.2, 0.35);
      } else { dr.away += dt; if (dr.away > 0.6 && !dr.warned) { dr.warned = true; X.popup('Drill paused: get back to the vault!'); } }
      if (dr.prog >= 1) openVault(sc);
    }
    if (st.vaultOpen && st.doorA < 1) {
      st.doorA = Math.min(1, st.doorA + dt / 1.6);
      if (st.doorA > 0.3 && st.plug.q) {
        removeSolid(sc, st.plug.q); st.plug.q = null;
        const h = { x: sc.ox + VAULT_HINGE[0], y: sc.oy + VAULT_HINGE[1] };
        st.doorQ = addSolid(sc, { x0: h.x + 0.5, y0: h.y - 1.45, x1: h.x + 3.2, y1: h.y + 1.45 }, 'tall');
        buildNav(sc);
      }
    }
    if (st.vaultOpen && st.doorA > 0.3 && !p.dead) for (const l of sc.loot) if (!l.taken && Math.abs(l.x - p.x) < 1.1 && Math.abs(l.y - p.y) < 1.1 && Math.hypot(l.x - p.x, l.y - p.y) < 1.05) takeLoot(sc, l);
  }
  function openVault(sc) {
    const st = sc.st, v = st.vault;
    st.vaultOpen = true; st.doorA = 0; st.drill.on = false; st.robbedAt = S.gmin;
    S.stats.vaults++;
    sfx('clunk'); G().shake = Math.max(G().shake, 0.35);
    PG.burst(v.x, v.y, 'smoke', 14, 2.5, 1.6, 0.6);
    X.big('VAULT OPEN', '#ffd23a', 2200, 'grab the cash');
    X.emit('vaultOpened', { scene: sc, x: v.x, y: v.y, cash: cashLeft(sc) });
  }
  function takeLoot(sc, l) {
    l.taken = true;
    X.addLoot(l.amount, l.x, l.y);
    S.stats.loot += l.amount;
    sfx('cash');
    PG.burst(l.x, l.y, 'confetti', 8, 2.5, 0.8, 0.18, l.kind === 'gold' ? ['#ffd23a', '#d4af37'] : ['#3fae6a', '#7dff9a']);
    if (!cashLeft(sc)) X.popup('Vault cleaned out. Now get it home!');
  }

  // ================= other in-building actions =================
  function atm() { X.money(-2, 'atm'); sfx('beep'); X.pager('FJORD SAVINGS BANK. Balance: $' + P.money + '. Fee: $2. Thank you for banking with us.', 4000); }
  function staff(sc, role) { return sc.peds.find(q => mine(q) && q.ai.role === role && !q.dead && q.ai.st !== 'flee' && q.ai.st !== 'fight' && q.ai.st !== 'cower'); }
  function fineHint() { const w = Math.round(P.wanted || 0); if (!X.police) return 'F: Talk to the desk sergeant'; return w ? 'F: Pay a fine ($500, -1 star)' : 'F: Ask about fines'; }
  function payFine() {
    const sc = S.cur, sg = sc && staff(sc, 'sergeant');
    if (!sg) { X.popup('Nobody is taking fines right now'); return; }
    const w = Math.round(P.wanted || 0);
    if (!X.police || !w) { say(sg, pick(['NO FINES ON FILE. DRIVE SAFE.', 'NOTHING HERE. YET.', 'TAKE A NUMBER. OR THE BUS.'])); return; }
    if (P.money < 500) { say(sg, 'FIVE HUNDRED. CASH. NO? THEN NO.', '#ff6b5a'); sfx('deny'); return; }
    X.money(-500, 'fine', P.ped.x, P.ped.y);
    X.police.setWanted(w - 1);
    S.stats.fines++;
    say(sg, w > 1 ? 'ONE STAR OFF. THE REST IS YOUR PROBLEM.' : 'ALL SQUARE. DO NOT COME BACK.', '#7dff9a');
    sfx('cash');
    X.emit('finePaid', { stars: w - 1 });
  }
  function healHint() { const p = P.ped; if (p.hp >= p.maxHp) return 'F: Talk to the nurse'; return P.money >= 50 ? 'F: Get patched up ($50)' : 'F: Get patched up (no money?)'; }
  function heal() {
    const sc = S.cur, n = sc && staff(sc, 'clerk'), p = P.ped;
    if (!n) { X.popup('Nobody at the desk'); return; }
    if (p.hp >= p.maxHp) { say(n, 'YOU LOOK FINE. NEXT!'); return; }
    if (P.money >= 50) { X.money(-50, 'hospital', p.x, p.y); say(n, 'THERE YOU GO. TRY NOT TO GET SHOT.', '#7dff9a'); }
    else say(n, pick(['NO MONEY? FINE. WE HAVE A FILE ON YOU.', 'THIS ONE IS ON THE TAXPAYERS. AGAIN.']), '#ffd23a');
    p.hp = p.maxHp; sfx('heal'); S.stats.healed++;
    X.emit('healed', { place: 'hospital' });
  }
  function giveBlood() { const p = P.ped; if (p.hp <= 55) return; p.hp -= 30; X.money(40, 'blood', p.x, p.y); sfx('heal'); X.popup('Thanks! Have a cookie.'); }
  function drink(price, hp) {
    const p = P.ped;
    if (P.money < price) { X.popup('Not enough money'); sfx('deny'); return; }
    X.money(-price, 'drink', p.x, p.y); p.hp = Math.min(p.maxHp, p.hp + hp); sfx('glug');
    S.stats.drinks++; S.drinks = (S.drinks || 0) + 1;
    X.popup(S.drinks >= 4 ? 'You feel wobbly. Take the bus home.' : pick(['Skål!', 'Tastes like a parking garage.', 'On the house? No.']));
  }
  function buyFood(price, hp, line) {
    const p = P.ped;
    if (P.money < price) { X.popup('Not enough money'); sfx('deny'); return; }
    X.money(-price, 'food', p.x, p.y); p.hp = Math.min(p.maxHp, p.hp + hp); sfx('chime'); X.popup(line);
  }
  function snack(hp, line) { const p = P.ped; p.hp = Math.min(p.maxHp, p.hp + hp); sfx('glug'); X.popup(line); }
  function scratch() {
    if (P.money < 5) { X.popup('Not enough money'); sfx('deny'); return; }
    X.money(-5, 'lottery');
    const r = Math.random(), win = r < 0.02 ? 500 : r < 0.16 ? 50 : 0;
    sfx('scratch');
    if (win) { X.money(win, 'lottery', P.ped.x, P.ped.y); X.popup('WINNER! $' + win); sfx('cash'); } else X.popup(pick(['Nothing. Again.', 'So close. Not really.', 'Better luck next time.']));
  }
  function talkArtur(sc) {
    const tr = sc.peds.find(q => mine(q) && q.ai.role === 'artur'); if (!tr) return;
    S.arturI = (S.arturI || 0) + 1;
    const line = ARTUR[(S.arturI - 1) % ARTUR.length];
    X.pager('ARTUR: ' + line, Math.max(5000, line.length * 70));
    say(tr, '...', '#ffd23a');
    if (PG.audio.yap && PG.audio.kit()) { PG.audio.yap(line, { base: 150 }); S.yapping = true; }
    X.emit('talkArtur', { line, ped: tr });
  }
  const SONG_NAMES = { blues: 'Fjord Blues', polka: 'Polka Pils', synth: 'Synth Viking', muzak: 'Lift Music No. 5', techno: 'Nordlys Techno' };
  function jukebox(sc) {
    const list = sc.type === 'bar' ? ['blues', 'polka', 'synth'] : ['polka', 'blues', 'muzak'];
    const cur = sc.st.song || list[0];
    sc.st.song = list[(list.indexOf(cur) + 1) % list.length];
    if (sc.st.juke) sc.st.juke.broken = false;
    S.mus.song = null;
    sfx('beep'); X.popup('Now playing: ' + SONG_NAMES[sc.st.song]);
  }
  function playPool(sc) {
    const st = sc.st;
    if (st.poolT > 0) return;
    if (P.money < 20) { X.popup('Not enough money'); sfx('deny'); return; }
    X.money(-20, 'pool');
    st.poolT = 2.8;
    for (const b of st.balls) { b.sunk = false; const a = rand(0, TAU), s = rand(1.5, 4); b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; }
    st.balls[0].vx = 5.5; st.balls[0].vy = rand(-0.4, 0.4);
    sfx('pool');
  }
  function darts(sc) {
    const st = sc.st;
    st.dartT = 3; st.dartPos = [];
    let total = 0;
    for (let i = 0; i < 3; i++) { const r = Math.random(), s = r < 0.04 ? 60 : r < 0.25 ? Math.floor(rand(15, 45)) : Math.floor(rand(0, 21)); total += s; st.dartPos.push([rand(-0.3, 0.3), rand(-0.3, 0.3)]); }
    sfx('dart');
    if (total >= 180) { X.big('ONE HUNDRED AND EIGHTY!', '#ffd23a', 2200); X.money(100, 'darts', P.ped.x, P.ped.y); }
    else X.popup('Darts: ' + total + (total > 100 ? '. Nice arm.' : '. The wall took most of them.'));
  }
  function dance(sc) {
    if (!P.ped.dead) { P.ped.pose = 'dance'; S.danceT = 4; }
    for (const q of sc.peds) if (mine(q) && q.ai.role === 'dancer' && !q.dead && Math.hypot(q.x - P.ped.x, q.y - P.ped.y) < 5 && Math.random() < 0.5) say(q, pick(['WOO!', 'NICE MOVES!', 'GO GO GO!', 'IS THAT THE ROBOT?']), '#ff9ad8');
    X.popup('Dance! (move to stop)');
  }
  function watchTv() { X.pager(pick(TV), 4500); }
  function plans() {
    const bank = X.places.bank, where = bank ? X.districtAt(bank.door.x, bank.door.y) : 'Bank Row';
    X.pager('THE PLAN: 1) Fjord Savings Bank, ' + where + '. 2) Past the counter, through the staff door, to the vault at the back. 3) F on the vault door: the drill needs 7 seconds with you next to it. 4) Grab the cash. 5) Get the loot home to the garage or the apartment.', 14000);
  }
  function arcade() { sfx('arcade'); X.pager('TAKE THE BUS! DRIFT. HIGH SCORE: TRD 999,999. You play. You lose. Artur keeps the high score.', 5000); }
  function mail() { if (Math.random() < 0.2) { X.money(20, 'mail', P.ped.x, P.ped.y); X.pager('A birthday card from Grandma. $20 inside!', 4000); } else X.pager(pick(MAIL), 4000); sfx('beep'); }
  function lift() { sfx('beep'); X.pager('OUT OF ORDER. Take the stairs. Or the bus.', 3500); }
  function sleepHint(what) { return (P.wanted || 0) > 0 ? 'F: ' + what + ' (not with the cops after you)' : 'F: ' + what + ' (save)'; }
  function sleep() {
    if ((P.wanted || 0) > 0) { X.popup('You can not sleep with the cops after you'); sfx('deny'); return; }
    if (S.fade && S.fade.mode === 'sleep') return;
    S.fade = { t: 0, dur: 2.6, mode: 'sleep', done: false, x: P.ped.x, y: P.ped.y };
    sfx('sleep');
  }
  function doSleep() {
    const from = X.clock, to = from >= 7 * 60 && from < 21 * 60 ? 21 * 60 : 7 * 60, skip = (to - from + 1440) % 1440;
    X.clock = to; S.gmin += skip;
    P.ped.hp = P.ped.maxHp;
    X.save.money = P.money; X.persist();
    S.stats.slept++;
    X.emit('sleep', { from, to, skipped: skip });
  }
  function safeHint(sc) { const st = sc.st; if (st.safeOpen) return null; return st.cracking ? 'Cracking the safe: ' + Math.round((st.safeProg || 0) * 100) + '%' : 'F: Crack the safe'; }
  function crackSafe(sc) {
    const st = sc.st; if (st.safeOpen || st.cracking) return;
    st.cracking = true; st.safeProg = st.safeProg || 0;
    X.popup('Cracking the safe. Stay put.');
    const p = P.ped;
    if (sc.peds.some(q => mine(q) && !q.dead && q.ai.st !== 'flee' && sightClear(sc, q.x, q.y, p.x, p.y) && Math.hypot(q.x - p.x, q.y - p.y) < 16)) { X.crime('robbery', p.x, p.y, { place: 'office' }); alarmScene(sc); }
  }
  function safeTick(sc, dt) {
    const st = sc.st; if (!st.cracking || st.safeOpen) return;
    const f = st.safe, p = P.ped, near = Math.hypot(p.x - f.x, p.y - f.y) < 2.4 && !p.dead;
    if (!near) return;
    st.safeProg = Math.min(1, st.safeProg + dt / 4.5);
    if (Math.random() < dt * 3) sfx('tick');
    if (st.safeProg >= 1) {
      st.safeOpen = true; st.cracking = false; st.robbedAt = S.gmin;
      const amt = Math.round(rand(300, 700) / 10) * 10;
      X.addLoot(amt, f.x, f.y); sfx('clunk'); sfx('cash'); S.stats.safes++; S.stats.loot += amt;
      X.popup('The safe is open: $' + amt);
      X.emit('safeCracked', { scene: sc, amount: amt });
    }
  }
  function crateHint(sc, i) { return sc.st.crates && sc.st.crates[i] ? null : 'F: Search the crates'; }
  function searchCrates(sc, i) {
    const st = sc.st; st.crates = st.crates || [];
    if (st.crates[i]) return;
    st.crates[i] = true; st.robbedAt = st.robbedAt == null ? S.gmin : st.robbedAt;
    sfx('crate');
    const r = Math.random(), p = P.ped;
    if (r < 0.4 && X.giveWeapon && X.WEAPONS) {
      const id = pick(['pistol', 'uzi', 'shotgun', 'molotov', 'grenade'].filter(k => X.WEAPONS[k]));
      if (id && X.giveWeapon(id)) { X.popup('Found a crate of ' + X.WEAPONS[id].name + '!'); S.stats.crates++; return; }
    }
    if (r < 0.75) { const amt = Math.round(rand(60, 220) / 10) * 10; X.addLoot(amt, p.x, p.y); X.popup('Somebody hid cash in the crates: $' + amt); S.stats.crates++; return; }
    X.popup(pick(['Flatpack furniture. Instructions in Swedish.', 'Forty kilos of brunost.', 'Garden gnomes. Hundreds of them.', 'Traffic cones. Artur would love these.']));
    const wk = sc.peds.find(q => mine(q) && !q.dead && q.ai.role === 'worker' && sightClear(sc, q.x, q.y, p.x, p.y));
    if (wk) { say(wk, 'HEY! THAT IS NOT YOURS!', '#ff6b5a'); X.crime('trespass', p.x, p.y); }
  }
  // Explosive barrels in the warehouse (damage.js), restocked on each visit.
  function barrels(sc) {
    if (!X.addProp || !sc.st.barrels) return;
    sc.props = (sc.props || []).filter(pr => !pr.dead);
    if (sc.props.length) return;
    for (const q of sc.st.barrels) sc.props.push(X.addProp(Math.random() < 0.25 ? 'propane' : 'barrel', sc.ox + q[0], sc.oy + q[1]));
  }

  // ================= per-frame scene logic =================
  function exitTick(sc) {
    const ex = sc.exit, p = P.ped; if (!ex || p.dead || P.state !== 'play') return;
    const on = inRect(ex, p.x, p.y, 0);
    // Same rule as the street doors: after walking in, the exit stays off until you have stepped clear of it.
    const dx = Math.max(ex.x0 - p.x, 0, p.x - ex.x1), dy = Math.max(ex.y0 - p.y, 0, p.y - ex.y1);
    if (!sc.exitArmed) { if (Math.hypot(dx, dy) > 1.6) sc.exitArmed = true; }
    else if (on && !(S.fade && S.fade.mode === 'sleep')) leave();
  }
  // Staff-only areas: a warning, then the guards (or cops) stop being polite.
  function trespassTick(sc, dt) {
    const p = P.ped;
    if (!sc.zones.length || p.dead || P.state !== 'play') return;
    const inZone = sc.zones.some(z => inRect(z, p.x, p.y, 0));
    if (!inZone) { S.warn = null; return; }
    if (S.warn) {
      S.warn.t -= dt;
      if (S.warn.t <= 0 && !S.warn.done) { S.warn.done = true; X.crime('trespass', p.x, p.y, { place: sc.type }); hostileAll(sc, S.warn.who.ai.role === 'sergeant' ? 'cop' : S.warn.who.ai.role); }
      return;
    }
    for (const q of sc.peds) {
      const a = q.ai;
      if (!mine(q) || q.dead || a.st === 'fight' || !(a.role === 'guard' || a.role === 'cop' || a.role === 'sergeant' || a.role === 'owner')) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) > 18 || !sightClear(sc, q.x, q.y, p.x, p.y)) continue;
      S.warn = { t: 3, who: q, done: false };
      say(q, pick(LINES.staff), '#ffd23a');
      return;
    }
  }
  // A drawn gun in the bank or the station gets you a look and a word (the shooting comes later).
  function gunTalk(sc, dt) {
    if ((sc.type !== 'bank' && sc.type !== 'police') || !isGun(P.weapon) || P.ped.dead || sc.st.alarm) { S.gunT = 0; return; }
    S.gunT = (S.gunT || 0) + dt;
    if (S.gunT < 2.5 || X.time - (S.gunSaid || -99) < 12) return;
    const p = P.ped;
    for (const q of sc.peds) {
      if (!mine(q) || q.dead || q.ai.st === 'fight' || !(q.ai.role === 'guard' || q.ai.role === 'cop' || q.ai.role === 'sergeant')) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) > 14 || !sightClear(sc, q.x, q.y, p.x, p.y)) continue;
      S.gunSaid = X.time; q.ai.face = Math.atan2(p.y - q.y, p.x - q.x);
      say(q, pick(sc.type === 'bank' ? ['SIR. PUT THAT AWAY.', 'NO GUNS IN THE BANK, PLEASE.', 'I AM WATCHING YOU.'] : ['YOU BROUGHT A GUN. INTO A POLICE STATION.', 'BOLD. VERY BOLD.']), '#ffd23a');
      return;
    }
  }
  function policeTick(sc, min) {
    if ((P.wanted || 0) < min || P.state !== 'play') return;
    for (const q of sc.peds) if (mine(q) && !q.dead && q.ai.st !== 'fight' && (q.ai.role === 'cop' || q.ai.role === 'sergeant')) provoke(sc, q);
  }
  function padInfo(it) {
    if (it === 'armor') return { name: 'Body Armour', price: PRICES.armor, ok: true };
    const w = X.WEAPONS && X.WEAPONS[it];
    return { name: w ? w.name : it[0].toUpperCase() + it.slice(1), price: w && w.price ? w.price : PRICES[it] || 500, ok: !!(w && X.giveWeapon) };
  }
  function padTick(sc) {
    const p = P.ped; if (p.dead) return;
    let on = null; for (const pd of sc.pads) if (Math.abs(pd.x - p.x) < pd.r && Math.abs(pd.y - p.y) < pd.r) on = pd;
    if (on && on !== S.padIn) buy(sc, on);
    S.padIn = on;
  }
  function buy(sc, pd) {
    const info = padInfo(pd.item), owner = staff(sc, 'owner');
    if (!owner) { X.popup('Nobody to take your money'); return; }
    if (!info.ok) { X.popup(info.name + ': sold out'); sfx('deny'); return; }
    if (pd.item === 'armor' && P.ped.armor >= 100) { X.popup('You are already wearing armour'); return; }
    if (P.money < info.price) { X.popup('Not enough money: ' + info.name + ' costs $' + info.price); X.floatText(pd.x, pd.y, 'NO CASH', '#ff6b5a'); sfx('deny'); return; }
    if (pd.item === 'armor') P.ped.armor = 100;
    else if (!X.giveWeapon(pd.item)) { X.popup('You can not carry any more ' + info.name); sfx('deny'); return; }
    X.money(-info.price, 'shop', pd.x, pd.y);
    X.popup('Bought: ' + info.name); sfx('cash'); S.stats.bought++;
    if (Math.random() < 0.5) say(owner, pick(['PLEASURE DOING BUSINESS.', 'NO REFUNDS.', 'POINT IT AWAY FROM ME.', 'COME AGAIN.']));
    X.emit('shopBuy', { item: pd.item, price: info.price, scene: sc });
  }
  // Inner doors swing open for whoever walks up to them.
  function doorsTick(sc, dt) {
    for (const g of sc.gaps) {
      if (!g.door) continue;
      let open = false;
      const near = q => Math.abs(q.x - g.x) < 1.6 && Math.abs(q.y - g.y) < 1.6;
      if (near(P.ped)) open = true;
      else for (const q of X.peds) if (!q.removed && !q.dead && q.x > sc.x0 && near(q)) { open = true; break; }
      if (open && !g.open) { const q = near(P.ped) ? P.ped : null; g.side = q ? ((g.vert ? q.x - g.x : q.y - g.y) > 0 ? -1 : 1) : g.side; }
      g.open = open;
      g.a += ((open ? 1 : 0) - g.a) * Math.min(1, dt * 9);
    }
  }
  function critterTick(sc, dt) {
    const c = sc.critter; if (!c || !sc.nav) return;
    if (!c.st) Object.assign(c, { st: 'idle', t: rand(0.5, 2), th: rand(0, TAU), tx: c.x, ty: c.y, walk: 0, x0: c.x0 || c.x, y0: c.y0 || c.y, meowT: 0 });
    c.t -= dt; c.meowT -= dt;
    const rat = c.kind === 'rat', p = P.ped, dp = Math.hypot(p.x - c.x, p.y - c.y);
    if (c.st === 'idle' && (c.t <= 0 || (rat && dp < 3))) {
      const N = sc.nav.nodes;
      for (let k = 0; k < 8; k++) {
        const n = N[Math.floor(Math.random() * N.length)], d = Math.hypot(n.x - c.x, n.y - c.y);
        if (d > 1 && d < (rat ? 9 : 6) && clearSeg(sc, c.x, c.y, n.x, n.y, 0.15) && (!rat || Math.hypot(n.x - p.x, n.y - p.y) > dp)) { c.tx = n.x; c.ty = n.y; c.st = 'walk'; break; }
      }
      c.t = rand(1, 3);
    }
    if (c.st === 'walk') {
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy), sp = rat ? 4 : 1.1;
      if (d < 0.2) { c.st = 'idle'; c.t = rand(1.5, rat ? 3 : 7); }
      else { c.x += dx / d * Math.min(d, sp * dt); c.y += dy / d * Math.min(d, sp * dt); c.th = Math.atan2(dy, dx); c.walk += sp * dt * 3; }
    } else if (!rat && dp < 4) c.th += wrap(Math.atan2(p.y - c.y, p.x - c.x) - c.th) * Math.min(1, dt * 3);
    if (!rat && dp < 1.6 && c.meowT <= 0) { c.meowT = 7; sfx('meow'); X.floatText(c.x, c.y - 0.6, 'MJAU', '#ffd8a0', { size: 13, life: 1.2 }); }
  }
  function poolTick(sc, dt) {
    const st = sc.st, f = st.pool; if (!f || !st.balls) return;
    if (st.poolT > 0) {
      st.poolT -= dt;
      const hw = f.w / 2 - 0.12, hh = f.h / 2 - 0.12;
      for (const b of st.balls) {
        if (b.sunk) continue;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const k = Math.exp(-1.1 * dt); b.vx *= k; b.vy *= k;
        if (b.x < -hw) { b.x = -hw; b.vx = Math.abs(b.vx); } if (b.x > hw) { b.x = hw; b.vx = -Math.abs(b.vx); }
        if (b.y < -hh) { b.y = -hh; b.vy = Math.abs(b.vy); } if (b.y > hh) { b.y = hh; b.vy = -Math.abs(b.vy); }
        if (b.i && Math.abs(Math.abs(b.y) - hh) < 0.1 && (Math.abs(Math.abs(b.x) - hw) < 0.14 || Math.abs(b.x) < 0.1)) b.sunk = true;
      }
      if (st.poolT <= 0) {
        const sunk = st.balls.filter(b => b.sunk).length;
        if (sunk >= 2 || Math.random() < 0.35) { X.money(40, 'pool', f.x, f.y); X.popup('You win the game: +$40'); sfx('cash'); }
        else X.popup(pick(['You lose. The table is crooked.', 'Scratch. The regulars laugh.', 'You lose $20. And some dignity.']));
        for (const b of st.balls) { b.sunk = false; b.vx = b.vy = 0; } st.rack = true;
        st.balls.forEach((b, i) => { b.x = b.rx; b.y = b.ry; });
      }
    }
  }
  const DISCO = ['#ff3fd0', '#3fd0ff', '#b6ff3a', '#ffd23a', '#ff6a3a', '#c25cff'];
  function lightsTick(sc, t) {
    const st = sc.st;
    for (const l of sc.lights) {
      if (!X.inView(l.x, l.y, l.r)) continue;
      let i = l.i, c = l.c, x = l.x, y = l.y;
      if (l.flick && Math.sin(t * 23 + Math.sin(t * 3.1) * 4) > 0.8) i *= 0.25;
      if (l.disco) { c = DISCO[(Math.floor(t * 2) + Math.floor(l.x)) % DISCO.length]; x += Math.sin(t * 1.3 + l.y) * 2; y += Math.cos(t * 1.1 + l.x) * 1.5; }
      if (l.juke) c = DISCO[Math.floor(t * 1.5) % DISCO.length];
      X.addLight(x, y, l.r, c, i);
    }
    if ((sc.type === 'bank' && st.alarm) || st.bellT > 0) {
      const k = 0.5 + 0.5 * Math.sin(t * 9);
      for (const q of alarmSpots(sc)) if (X.inView(q.x, q.y, 8)) X.addLight(q.x, q.y, 7, '#ff2a2a', 0.35 + 0.5 * k);
    }
    if (sc.type === 'bank' && st.drill && st.drill.on && !st.vaultOpen) X.addLight(st.vault.x + 0.6, st.vault.y, 3.5, '#ffb050', 0.6 + Math.random() * 0.4);
  }
  function alarmSpots(sc) {
    if (!sc._alarm) { const w = sc.w, h = sc.h; sc._alarm = [{ x: sc.ox + w * 0.25, y: sc.oy + h * 0.55 }, { x: sc.ox + w * 0.75, y: sc.oy + h * 0.55 }, { x: sc.ox + w * 0.5, y: sc.oy + h * 0.15 }]; }
    return sc._alarm;
  }
  function sceneTick(sc, dt, t) {
    for (let i = 0; i < sc.peds.length; i++) { const q = sc.peds[i]; if (!q.removed && mine(q)) pedTick(sc, q, dt); }
    if (sc.peds.some(q => q.removed)) sc.peds = sc.peds.filter(q => !q.removed);
    exitTick(sc); robTick(sc, dt); trespassTick(sc, dt); gunTalk(sc, dt);
    if (sc.type === 'bank') { bankTick(sc, dt); if (sc.st.alarm) policeTick(sc, 1); }
    else if (sc.type === 'gunshop') padTick(sc);
    else if (sc.type === 'police') policeTick(sc, 2);
    else if (sc.type === 'office') safeTick(sc, dt);
    else { if (sc.st.safe) safeTick(sc, dt); if (sc.pads.length) padTick(sc); }
    const ext = EXT[sc.type]; if (ext && ext.tick) { try { ext.tick(sc, dt, t, KIT); } catch (e) { if (!ext.err) { ext.err = true; console.error('[interiors] ' + sc.type + ' tick failed:', e); } } }
    doorsTick(sc, dt); critterTick(sc, dt); poolTick(sc, dt);
    lightsTick(sc, t);
    if (sc.st.bellT > 0) sc.st.bellT -= dt;
    if (sc.st.dartT > 0) sc.st.dartT -= dt;
    if (S.danceT > 0) { S.danceT -= dt; if (S.danceT <= 0 || P.ped.speed > 0.8) { S.danceT = 0; if (P.ped.pose === 'dance') P.ped.pose = null; } }
  }

  // ================= city doors =================
  const DS = {
    bank: { w: 2.6, door: '#2a3a48', frame: '#d4af37', plate: '#1f1a12', text: '#f2d27a', light: '#ffe2a0', pillars: 1 },
    police: { w: 2.2, door: '#22324a', frame: '#c9ccd1', plate: '#22376b', text: '#ffffff', light: '#9ec2ff', lamp: '#5aa9ff' },
    hospital: { w: 2.4, door: '#34495a', frame: '#e8eef2', plate: '#f2f2f2', text: '#c0392b', light: '#eaf6ff', cross: 1 },
    gunshop: { w: 1.8, door: '#2b2220', frame: '#6b3b2a', plate: '#141416', text: '#ff4a3a', light: '#ffb070', neon: '#ff4a3a', icon: 'gun' },
    bar: { w: 1.6, door: '#3d2414', frame: '#7a2a4a', plate: '#1b1012', text: '#ff6fb0', light: '#ffb070', neon: '#ff4fa0', icon: 'beer' },
    apartment: { w: 1.8, door: '#3a3f4a', frame: '#9aa3ad', plate: '#203a2a', text: '#9dffb8', light: '#ffe2a0', icon: 'house' },
    hideout: { w: 4.2, door: '#3a3540', frame: '#e3b23c', plate: '#1b1b1f', text: '#f2c230', light: '#ffd27a', roller: 1, hazard: 1, icon: 'house' },
    store: { w: 1.8, door: '#2d4258', frame: '#c0392b', plate: '#c0392b', text: '#ffffff', light: '#f4fbff', awning: ['#c0392b', '#f2f2f2'] },
    lobby: { w: 1.8, door: '#2d3a48', frame: '#8a8f99', plate: '#2b2f3a', text: '#e9e4d8', light: '#ffe2a0', canopy: '#2b2f3a' },
    office: { w: 2.0, door: '#3b5a74', frame: '#aeb6c0', plate: '#1f2533', text: '#9fd0ff', light: '#eaf2ff', revolve: 1 },
    warehouse: { w: 3.6, door: '#5a5048', frame: '#e3b23c', plate: '#3a3330', text: '#f2c230', light: '#ffd9a0', roller: 1 },
    club: { w: 1.6, door: '#1b1426', frame: '#c25cff', plate: '#14101c', text: '#e9a8ff', light: '#c25cff', neon: '#c25cff', rope: 1 },
    diner: { w: 1.6, door: '#5c2b2b', frame: '#e9e4d8', plate: '#14262a', text: '#5af0e0', light: '#ffd9a0', neon: '#5af0e0', awning: ['#2f7d6d', '#f2f2f2'] },
  };
  // Which theme a building gets: weighted by each type's weight, only types whose minSide fits the footprint.
  const WEIGHT = { store: 3, lobby: 4, office: 3, warehouse: 2, club: 1, diner: 2 }, MIN_SIDE = {};
  function pickType(b, u) {
    const side = Math.min(b.x1 - b.x0, b.y1 - b.y0);
    const list = GEN_TYPES.filter(t => !MIN_SIDE[t] || side >= MIN_SIDE[t]);
    let tot = 0; for (const t of list) tot += WEIGHT[t] || 1;
    let v = u * tot; for (const t of list) { v -= WEIGHT[t] || 1; if (v <= 0) return t; }
    return list[list.length - 1] || 'store';
  }
  function buildDoors() {
    const C = X.city, out = [], seed = (C.seed || 1) % 10007;
    for (const id in X.places) {
      const pl = X.places[id];
      if (pl.pad || !L[id]) continue;
      out.push({ key: 'place:' + id, place: id, type: id, b: pl.b, x: pl.door.x, y: pl.door.y, nx: pl.door.nx, ny: pl.door.ny, name: pl.name });
    }
    // Every building that faces a street gets a door: try each side until one is clear.
    C.buildings.forEach((b, i) => {
      if (b.deco || b.place) return;
      if (b.x1 - b.x0 < 5 || b.y1 - b.y0 < 5) return;
      const p0 = Math.floor(hr(seed, i + 7) * 4);
      let dr = null;
      for (let k = 0; k < 4 && !dr; k++) {
        const q = X.buildingDoor(b, p0 + k); if (!q) break;
        if (X.blocked(q.x, q.y, 0.5) || X.blocked(q.x + q.nx * 1.3, q.y + q.ny * 1.3, 0.4)) continue;
        if (out.some(o => Math.abs(o.x - q.x) < 4 && Math.abs(o.y - q.y) < 4)) continue;
        dr = q;
      }
      if (!dr) return;
      const type = pickType(b, hr(seed, i + 3)), nm = NAMES[type];
      out.push({ key: 'b:' + i, bi: i, type, b, x: dr.x, y: dr.y, nx: dr.nx, ny: dr.ny, name: nm[Math.floor(hr(seed, i + 11) * nm.length)], gen: true });
    });
    for (const d of out) { const st = DS[d.type] || DS.store; d.tw = 0; d.st = st; }
    return out;
  }
  function nearestDoor(x, y, r) {
    let best = null, bd = r;
    for (const d of S.doors) { const dx = d.x - x, dy = d.y - y; if (Math.abs(dx) > r || Math.abs(dy) > r) continue; const dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  // Walking into a doorway enters the building, no key. Like leaving, it re-arms only after you step away from
  // the door, so the spot you come out on does not pull you straight back in.
  function doorTick() {
    const p = P.ped;
    if (!p || p.dead || X.scene || P.car || P.entering || P.state !== 'play' || (S.fade && S.fade.mode === 'sleep')) return;
    const near = nearestDoor(p.x, p.y, 1.6);
    if (!near) { S.doorArmed = true; return; }
    if (S.doorArmed && Math.hypot(near.x - p.x, near.y - p.y) < 0.9) enterDoor(near);
  }
  const insideUse = {
    test() {
      const sc = X.scene;
      if (!live() || !sc || !sc._int || P.car || P.state !== 'play' || P.ped.dead) return null;
      const p = P.ped; let best = null, bd = 1e9, txt = null;
      for (const a of sc.acts) {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (d < a.r && d < bd) { const tx = a.text(); if (tx) { best = a; bd = d; txt = tx; } }
      }
      if (best) return { text: txt, priority: 3, run: () => best.run() };
      if (sc.exit && inRect(sc.exit, p.x, p.y, 0.8)) return { text: 'F: Exit to the street', priority: 3, run: leave };
      return null;
    },
  };
  function cityTick(t) {
    const nt = night();
    for (const d of S.doors) {
      if (!X.inView(d.x, d.y, 6)) continue;
      if (nt) X.addLight(d.x + d.nx * 0.3, d.y + d.ny * 0.3, d.st.neon ? 5.5 : 4.5, d.st.neon || d.st.light, d.st.neon ? 0.7 : 0.55);
      if (d.place === 'bank') { const sc = S.scenes.get(d.key); if (sc && sc.st.alarm) X.addLight(d.x, d.y, 9, '#ff2a2a', 0.5 + 0.5 * Math.sin(t * 9)); }
    }
  }
  // ================= drawing helpers =================
  const RGB = new Map();
  function rgba(hex, a) {
    let c = RGB.get(hex);
    if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(hex, c); }
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  const SHADE = new Map();
  function shade(hex, k) {
    const key = hex + k; let v = SHADE.get(key); if (v) return v;
    const n = parseInt(hex.slice(1), 16), f = q => Math.max(0, Math.min(255, Math.round(k < 0 ? q * (1 + k) : q + (255 - q) * k)));
    v = 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; SHADE.set(key, v); return v;
  }
  const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  // Quality settings, read again by every drawing entry point each frame: drop shadows, fine detail.
  let SH = true, HI = true;
  function readSettings() { const q = PG.settings || {}; SH = q.shadows !== false; HI = q.detail !== 'low'; }
  function sh(c, hw, hh, k) { if (!SH) return; c.fillStyle = 'rgba(0,0,0,' + (k || 0.3) + ')'; c.fillRect(-hw + 0.12, -hh + 0.16, hw * 2, hh * 2); }
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function rr(c, x, y, w, h, r, col) { c.fillStyle = col; PG.rr(c, x, y, w, h, r); c.fill(); }
  function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function oval(c, x, y, rx, ry, a, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, a || 0, 0, TAU); c.fill(); }
  function ln(c, x0, y0, x1, y1, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  // World-space text: drawn at 20 px and scaled, so tiny sizes render the same everywhere.
  function wtext(c, s, x, y, size, col, weight, align) {
    c.save(); c.translate(x, y); c.scale(size / 20, size / 20);
    c.font = (weight || 700) + ' 20px ' + FONT; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, 0, 0);
    c.restore();
  }
  function wmeasure(c, s, size, weight) { c.save(); c.font = (weight || 700) + ' 20px ' + FONT; const w = c.measureText(s).width * size / 20; c.restore(); return w; }
  let arturFace = null;
  function faceCanvas() {
    if (arturFace !== null) return arturFace;
    arturFace = false;
    try { if (PG.ui && PG.ui.drawArturFace) { const cv = document.createElement('canvas'); cv.width = cv.height = 96; PG.ui.drawArturFace(cv, 0.15, 0, false, false); arturFace = cv; } } catch { arturFace = false; }   // no face, a plain disc
    return arturFace;
  }
  const PRODUCTS = ['#c0392b', '#f2c230', '#2f6fb5', '#3e8e5a', '#e07b2a', '#e9e4d8', '#d64a8f', '#6b4a8f', '#3fb6c4', '#8a1f1a', '#b6ff3a', '#ffffff'];
  function prepFurn(f, R) {
    f.seed = R();
    if (f.t === 'shelf' || f.t === 'bookshelf' || f.t === 'bottles' || f.t === 'fridge' || f.t === 'mags' || f.t === 'rack' || f.t === 'vending' || f.t === 'cards') { f.cols = []; for (let i = 0; i < 48; i++) f.cols.push(PRODUCTS[Math.floor(R() * PRODUCTS.length)]); }
  }
  function initBalls(sc) {
    const cols = ['#f4f4f4', '#f2c230', '#2f6fb5', '#c0392b', '#6b2a8f', '#e07b2a', '#2f8a4e', '#111111'], st = sc.st;
    st.balls = cols.map((c, i) => { const rx = i ? 0.55 + Math.floor((i - 1) / 3) * 0.12 : -0.8, ry = i ? ((i - 1) % 3 - 1) * 0.11 + (Math.floor((i - 1) / 3) % 2) * 0.05 : 0; return { i, c, x: rx, y: ry, rx, ry, vx: 0, vy: 0, sunk: false }; });
  }

  // ================= furniture =================
  // Local frame: centred, w along x, h along y, rotated by f.rot. Shadows fall to +x +y like the city's.
  const GUNS = {
    pistol: c => { rect(c, -0.28, -0.08, 0.5, 0.14, '#1b1d22'); rect(c, -0.26, 0.02, 0.14, 0.24, '#1b1d22'); },
    uzi: c => { rect(c, -0.3, -0.09, 0.56, 0.16, '#1b1d22'); rect(c, -0.06, 0.05, 0.1, 0.3, '#1b1d22'); rect(c, 0.26, -0.05, 0.12, 0.07, '#1b1d22'); },
    shotgun: c => { rect(c, -0.5, -0.05, 1.0, 0.09, '#1b1d22'); rect(c, -0.55, -0.07, 0.28, 0.16, '#6b4226'); rect(c, -0.05, 0.03, 0.3, 0.07, '#6b4226'); },
    rifle: c => { rect(c, -0.55, -0.06, 1.1, 0.12, '#1b1d22'); rect(c, -0.1, 0.05, 0.1, 0.28, '#1b1d22'); rect(c, -0.6, -0.08, 0.22, 0.17, '#2b2d33'); },
    grenade: c => { disc(c, 0, 0.04, 0.2, '#3f5a2a'); rect(c, -0.05, -0.24, 0.1, 0.12, '#9aa0a8'); disc(c, 0.1, -0.22, 0.05, '#d4af37'); },
    molotov: c => { rr(c, -0.12, -0.1, 0.24, 0.36, 0.08, '#7a4a20'); rect(c, -0.05, -0.28, 0.1, 0.2, '#7a4a20'); rect(c, -0.06, -0.34, 0.12, 0.08, '#e9e4d8'); },
    rocket: c => { rect(c, -0.6, -0.1, 1.2, 0.2, '#4a5a2a'); rect(c, 0.6, -0.07, 0.14, 0.14, '#c0392b'); rect(c, -0.1, 0.08, 0.12, 0.2, '#2b2d33'); },
    armor: c => { rr(c, -0.26, -0.3, 0.52, 0.6, 0.12, '#2f4f8a'); rect(c, -0.12, -0.32, 0.24, 0.12, '#1a2c50'); rect(c, -0.2, -0.05, 0.4, 0.06, '#4f7fca'); },
  };
  const FD = {
    counter(c, f, hw, hh) { sh(c, hw, hh, 0.32); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#5a3d26'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.2, f.top || '#c9b89a'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 0.05, 'rgba(255,255,255,0.3)'); },
    glass(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, 'rgba(190,225,245,0.7)'); rect(c, -hw, -hh, 0.04, 2 * hh, 'rgba(255,255,255,0.8)'); },
    register(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b2d33'); rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, hh * 0.7, f.kind === 'stamp' ? '#c0392b' : '#7dff9a'); for (let i = 0; i < 3; i++) rect(c, -hw + 0.1 + i * hw * 0.6, 0.05, hw * 0.4, hh * 0.5, '#9aa0a8'); },
    monitor(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1b1d22'); rect(c, -hw + 0.05, -hh + 0.05, 2 * hw - 0.1, 2 * hh - 0.16, '#5ab0e8'); },
    sign(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, f.bg || '#222'); wtext(c, f.text, 0, 0.02, f.size || 0.3, f.c || '#fff'); },
    stencil(c, f, hw, hh) { c.globalAlpha = 0.5; wtext(c, f.text, 0, 0, hh * 1.3, '#e3b23c', 800); c.globalAlpha = 1; },
    desk(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#7a5a3a'); rect(c, -hw, -hh, 2 * hw, 0.06, 'rgba(255,255,255,0.2)');
      const back = f.face === 's' ? 1 : -1;
      if (f.pc) { const y = back * (hh - 0.16); rect(c, -0.45, y - 0.08, 0.9, 0.16, '#16181c'); rect(c, -0.4, y - 0.04, 0.8, 0.08, f.broken ? '#222' : '#7fd0ff'); rect(c, -0.32, y - back * 0.38 - 0.08, 0.64, 0.17, '#c9ccd1'); }
      rect(c, hw - 0.7, -0.15, 0.42, 0.5, '#f2f2f2'); rect(c, hw - 0.62, -0.08, 0.3, 0.03, '#9aa0a8'); disc(c, -hw + 0.32, 0.18, 0.09, '#e9e4d8'); disc(c, -hw + 0.32, 0.18, 0.05, '#5a3a20');
      if (f.phone) { rr(c, -hw + 0.6, -0.35, 0.38, 0.26, 0.05, '#c0392b'); rect(c, -hw + 0.62, -0.42, 0.34, 0.08, '#1b1d22'); }
      if (f.note) { c.save(); c.rotate(0.12); rect(c, 0.05, -0.15, 0.42, 0.42, '#f2e27a'); for (let i = 0; i < 3; i++) rect(c, 0.1, -0.08 + i * 0.1, 0.3, 0.025, '#5a5040'); c.restore(); }
    },
    chair(c, f, hw, hh) { disc(c, 0.1, 0.12, hw * 0.9, 'rgba(0,0,0,0.25)'); disc(c, 0.04, 0, hw * 0.85, f.boss ? '#3a2418' : f.c || '#2b2d33'); rect(c, -hw, -hh * 0.8, 0.16, hh * 1.6, f.boss ? '#2a1a10' : shade(f.c || '#2b2d33', -0.3)); },
    fishtank(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1b1d22');
      if (f.broken) { rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#2a2f36'); for (let i = 0; i < 3; i++) oval(c, rand(-0.1, 0.1) + (i - 1) * 0.15, (i - 1) * 0.6, 0.05, 0.1, i, '#ff8a1e'); return; }
      rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#2a7fa6'); rect(c, -hw + 0.06, hh - 0.32, 2 * hw - 0.12, 0.26, '#c9a46a');
      for (let i = 0; i < 4; i++) { const y = -hh + 0.4 + ((t * 0.25 + i * 0.55) % (2 * hh - 0.8)), x = Math.sin(t * 1.3 + i * 2) * (hw - 0.22); oval(c, x, y, 0.06, 0.12, 0, i % 2 ? '#ff8a1e' : '#ffd23a'); }
      for (let i = 0; i < 3; i++) disc(c, -0.1 + i * 0.1, -hh + 0.2 + ((t * 0.8 + i * 0.4) % 1.8), 0.025, 'rgba(255,255,255,0.6)');
      rect(c, -hw + 0.06, -hh + 0.06, 0.05, 2 * hh - 0.12, 'rgba(255,255,255,0.35)');
    },
    plant(c, f, hw) {
      disc(c, 0.14, 0.18, hw, 'rgba(0,0,0,0.28)'); disc(c, 0, 0, hw * 0.62, '#7a4a2a'); disc(c, 0, 0, hw * 0.5, '#3a2a1a');
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + f.seed * 6; oval(c, Math.cos(a) * hw * 0.45, Math.sin(a) * hw * 0.45, hw * 0.55, hw * 0.2, a, i % 2 ? '#3e8e5a' : '#2f6f45'); }
      disc(c, 0, 0, hw * 0.22, '#4aa86a');
    },
    filing(c, f, hw, hh) { sh(c, hw, hh, 0.32); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#7d838c'); for (let i = 1; i < 3; i++) rect(c, -hw + i * hw * 2 / 3, -hh, 0.04, 2 * hh, '#5d636c'); rect(c, -hw, hh - 0.08, 2 * hw, 0.08, '#5d636c'); for (let i = 0; i < 3; i++) rect(c, -hw + 0.12 + i * hw * 2 / 3, hh - 0.2, 0.18, 0.06, '#c9ccd1'); },
    printer(c, f, hw, hh) { sh(c, hw, hh); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.1, '#d8dce2'); rect(c, -hw + 0.2, -0.06, 2 * hw - 0.4, 0.12, '#2b2d33'); rect(c, -hw + 0.3, 0.1, 2 * hw - 0.6, hh - 0.15, '#ffffff'); disc(c, hw - 0.15, -hh + 0.15, 0.05, '#3fdc6a'); },
    cooler(c, f, hw, hh) { sh(c, hw, hh); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e8edf2'); disc(c, 0, 0, hw * 0.75, 'rgba(90,170,230,0.75)'); disc(c, -0.06, -0.06, hw * 0.25, 'rgba(255,255,255,0.6)'); },
    monitors(c, f, hw, hh, t) {
      sh(c, hw, hh); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a3f4a');
      for (let i = 0; i < 4; i++) {
        const x = -hw + 0.15 + i * (2 * hw - 0.3) / 4, w = (2 * hw - 0.3) / 4 - 0.08;
        rect(c, x, -hh + 0.1, w, 0.5, '#111'); rect(c, x + 0.04, -hh + 0.14, w - 0.08, 0.42, i === 2 && Math.sin(t * 7) > 0.7 ? '#c8d8e8' : '#1d3a52');
        rect(c, x + 0.06, -hh + 0.2 + (t * 0.3 + i * 0.13) % 0.3, w - 0.12, 0.03, 'rgba(160,220,255,0.4)');
        if (i === 1) disc(c, x + w / 2 + Math.sin(t) * w * 0.3, -hh + 0.35, 0.04, '#f2c230');
      }
      rect(c, -0.4, 0.05, 0.8, 0.22, '#c9ccd1');
    },
    deposit(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d636b'); for (let x = -hw + 0.06; x < hw - 0.3; x += 0.42) { rect(c, x, -hh + 0.08, 0.36, 2 * hh - 0.16, '#9aa1a9'); disc(c, x + 0.18, 0, 0.04, '#3a3f46'); } },
    cart(c, f, hw, hh) { sh(c, hw, hh, 0.25); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#6d737b'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#4d5258'); oval(c, -0.3, 0, 0.32, 0.26, 0.3, '#3f5a3a'); oval(c, 0.32, 0.05, 0.3, 0.24, -0.4, '#4a6a44'); },
    vaultshelf(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#4a4f56'); const along = hw > hh; for (let k = -1; k <= 1; k += 2) if (along) rect(c, -hw, k * hh * 0.5 - 0.02, 2 * hw, 0.04, '#6d737b'); else rect(c, k * hw * 0.5 - 0.02, -hh, 0.04, 2 * hh, '#6d737b'); },
    pillar(c, f, hw, hh) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#bdb3a0'); rect(c, -hw + 0.12, -hh + 0.12, 2 * hw - 0.24, 2 * hh - 0.24, '#e6dfd0'); disc(c, 0, 0, hw * 0.55, '#d6ccb8'); disc(c, -0.1, -0.1, hw * 0.25, 'rgba(255,255,255,0.4)'); },
    rope(c, f, hw, hh) {
      const n = f.posts || 5, vert = f.vert, L = vert ? 2 * hh : 2 * hw;
      for (let i = 0; i < n; i++) {
        const s = -L / 2 + L * i / (n - 1), x = vert ? 0 : s, y = vert ? s : 0;
        if (i < n - 1) { const s2 = -L / 2 + L * (i + 1) / (n - 1); ln(c, x, y, vert ? 0 : s2, vert ? s2 : 0, '#a0141e', 0.08); }
        disc(c, x + 0.05, y + 0.06, 0.16, 'rgba(0,0,0,0.3)'); disc(c, x, y, 0.13, '#d4af37'); disc(c, x - 0.03, y - 0.03, 0.05, '#fff2b0');
      }
    },
    bench(c, f, hw, hh) {
      sh(c, hw, hh, 0.28); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#6b4a32');
      const b = f.back, t2 = 0.2, dk = shade(f.c || '#6b4a32', -0.35);
      if (b === 'n') rect(c, -hw, -hh, 2 * hw, t2, dk); else if (b === 's') rect(c, -hw, hh - t2, 2 * hw, t2, dk); else if (b === 'w') rect(c, -hw, -hh, t2, 2 * hh, dk); else if (b === 'e') rect(c, hw - t2, -hh, t2, 2 * hh, dk);
      c.fillStyle = 'rgba(255,255,255,0.1)'; if (hw > hh) for (let x = -hw + 1; x < hw; x += 1) c.fillRect(x, -hh + 0.05, 0.04, 2 * hh - 0.1); else for (let y = -hh + 1; y < hh; y += 1) c.fillRect(-hw + 0.05, y, 2 * hw - 0.1, 0.04);
    },
    sofa(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); const col = f.c || '#3f5f7a', dk = shade(col, -0.3), lt = shade(col, 0.12);
      rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.15, dk);
      const vert = hw < hh, n = Math.max(2, Math.round((vert ? hh : hw) / 0.8)), b = f.back;
      const ix0 = -hw + (b === 'w' ? 0.32 : 0.18), ix1 = hw - (b === 'e' ? 0.32 : 0.18), iy0 = -hh + (b === 'n' ? 0.32 : 0.12), iy1 = hh - (b === 's' ? 0.32 : 0.12);
      for (let i = 0; i < n; i++) {
        if (vert) { const y0 = iy0 + (iy1 - iy0) * i / n; rr(c, ix0, y0 + 0.03, ix1 - ix0, (iy1 - iy0) / n - 0.06, 0.08, col); rect(c, ix0 + 0.06, y0 + 0.06, 0.06, (iy1 - iy0) / n - 0.12, lt); }
        else { const x0 = ix0 + (ix1 - ix0) * i / n; rr(c, x0 + 0.03, iy0, (ix1 - ix0) / n - 0.06, iy1 - iy0, 0.08, col); rect(c, x0 + 0.06, iy0 + 0.05, (ix1 - ix0) / n - 0.12, 0.06, lt); }
      }
    },
    armchair(c, f, hw, hh) { sh(c, hw, hh, 0.3); const col = f.c || '#7a3b2e'; rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.18, shade(col, -0.3)); rr(c, -hw + 0.2, -hh + 0.2, 2 * hw - 0.4, 2 * hh - 0.32, 0.12, col); },
    atm(c, f, hw, hh, t) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3b3f46'); rect(c, -hw + 0.12, -hh + 0.1, 2 * hw - 0.24, 0.26, Math.sin(t * 2) > 0.9 ? '#9fd8ff' : '#3fa9ff'); for (let i = 0; i < 3; i++) rect(c, -0.2 + i * 0.15, 0.08, 0.1, 0.1, '#c9ccd1'); wtext(c, 'ATM', 0, hh - 0.1, 0.16, '#ffd23a'); },
    rug(c, f, hw, hh) {
      rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c); c.strokeStyle = f.c2; c.lineWidth = 0.1; c.strokeRect(-hw + 0.2, -hh + 0.2, 2 * hw - 0.4, 2 * hh - 0.4);
      c.lineWidth = 0.05; c.strokeRect(-hw + 0.38, -hh + 0.38, 2 * hw - 0.76, 2 * hh - 0.76);
      c.globalAlpha = 0.35; c.fillStyle = f.c2; for (let y = -hh + 0.9; y < hh - 0.6; y += 1.1) for (let x = -hw + 0.9; x < hw - 0.6; x += 1.1) { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(-0.12, -0.12, 0.24, 0.24); c.restore(); } c.globalAlpha = 1;
    },
    emblem(c, f, hw, hh) {
      if (f.kind === 'cross') { disc(c, 0, 0, hw, 'rgba(255,255,255,0.75)'); rect(c, -hw * 0.18, -hw * 0.62, hw * 0.36, hw * 1.24, '#d42a2a'); rect(c, -hw * 0.62, -hw * 0.18, hw * 1.24, hw * 0.36, '#d42a2a'); return; }
      if (f.kind === 'badge') {
        c.fillStyle = 'rgba(34,55,107,0.55)'; c.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 - Math.PI / 2, r = i % 2 ? hw * 0.55 : hw; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
        disc(c, 0, 0, hw * 0.4, 'rgba(212,175,55,0.7)'); wtext(c, 'POLICE', 0, 0, hw * 0.22, '#22376b', 800); return;
      }
      c.strokeStyle = 'rgba(212,175,55,0.85)'; c.lineWidth = 0.14; c.beginPath(); c.arc(0, 0, hw * 0.92, 0, TAU); c.stroke(); c.lineWidth = 0.05; c.beginPath(); c.arc(0, 0, hw * 0.75, 0, TAU); c.stroke();
      wtext(c, '$', 0, 0.05, hw * 1.1, 'rgba(212,175,55,0.9)', 800);
    },
    clock(c, f, hw) {
      disc(c, 0.06, 0.08, hw, 'rgba(0,0,0,0.3)'); disc(c, 0, 0, hw, '#2b2d33'); disc(c, 0, 0, hw * 0.85, '#f4f1e8');
      const m = (X.clock || 0) % 720, ha = m / 720 * TAU - Math.PI / 2, ma = (m % 60) / 60 * TAU - Math.PI / 2;
      ln(c, 0, 0, Math.cos(ha) * hw * 0.45, Math.sin(ha) * hw * 0.45, '#111', 0.06); ln(c, 0, 0, Math.cos(ma) * hw * 0.7, Math.sin(ma) * hw * 0.7, '#111', 0.035); disc(c, 0, 0, 0.04, '#c0392b');
    },
    locker(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d6d7e'); for (let x = -hw; x < hw - 0.1; x += 0.6) { rect(c, x, -hh, 0.04, 2 * hh, '#3e4a57'); for (let k = 0; k < 3; k++) rect(c, x + 0.15, -hh + 0.15 + k * 0.12, 0.3, 0.04, '#46535f'); } },
    coffee(c, f, hw, hh, t) { sh(c, hw, hh); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b2d33'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 0.2, '#8a1f1a'); disc(c, hw - 0.18, -hh + 0.18, 0.05, Math.sin(t * 3) > 0 ? '#ff3a2a' : '#5a1010'); disc(c, 0, 0.15, 0.12, '#e9e4d8'); disc(c, 0, 0.15, 0.08, '#4a2a14'); },
    table(c, f, hw, hh, t) {
      if (f.round) { disc(c, 0.12, 0.15, hw, 'rgba(0,0,0,0.3)'); disc(c, 0, 0, hw, f.c || '#5a3a24'); disc(c, -hw * 0.25, -hw * 0.25, hw * 0.35, 'rgba(255,255,255,0.08)'); }
      else { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#5a3a24'); rect(c, -hw, -hh, 2 * hw, 0.05, 'rgba(255,255,255,0.2)'); }
      if (f.donuts) { rect(c, -0.35, -0.22, 0.7, 0.44, '#f2e2c8'); for (let i = 0; i < 4; i++) { const x = -0.22 + (i % 2) * 0.3, y = -0.1 + Math.floor(i / 2) * 0.2; disc(c, x, y, 0.09, i % 2 ? '#e86aa0' : '#c98a4a'); disc(c, x, y, 0.03, '#f2e2c8'); } }
      if (f.glasses) for (let i = 0; i < 3; i++) { const a = f.seed * 7 + i * 2.1, r = Math.min(hw, hh) * 0.5; disc(c, Math.cos(a) * r, Math.sin(a) * r, 0.07, 'rgba(255,200,90,0.85)'); disc(c, Math.cos(a) * r, Math.sin(a) * r, 0.04, 'rgba(255,245,220,0.7)'); }
      if (f.mugs) for (let i = 0; i < 2; i++) { const x = (i - 0.5) * hw * 0.8; disc(c, x, 0, 0.08, '#e9e4d8'); disc(c, x, 0, 0.05, '#4a2a14'); }
      if (f.plates) for (let i = 0; i < 2; i++) { const x = (i - 0.5) * hw * 0.9; disc(c, x, 0, 0.17, '#f4f4f4'); disc(c, x, 0, 0.1, i ? '#c98a4a' : '#d9a441'); }
    },
    poster(c, f, hw, hh) {
      const k = f.kind;
      if (k === 'wanted') { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e9dcb8'); disc(c, -hw + 0.3, 0, 0.12, '#f2c230'); disc(c, -hw + 0.3, -0.02, 0.07, '#e0ac7e'); wtext(c, 'WANTED', 0.15, 0, hh * 1.2, '#8a1f1a', 800); return; }
      if (k === 'bus') { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e07b2a'); wtext(c, 'TAKE THE BUS!', 0, 0.01, hh * 1.25, '#1b1f27', 800); return; }
      if (k === 'journey') { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1f3f6e'); wtext(c, 'PARKING IS A JOURNEY', 0, 0.01, hh * 1.1, '#e9e4d8', 700); return; }
      rect(c, -hw, -hh, 2 * hw, 2 * hh, '#f4f4f4'); for (let i = 0; i < 6; i++) rect(c, -hw + 0.1 + i * (2 * hw - 0.2) / 6, -hh + 0.06, 0.02, 2 * hh - 0.12, '#c0392b');
    },
    vending(c, f, hw, hh, t) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#2f6fb5'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.35, 2 * hh - 0.2, '#1b1d22'); for (let i = 0; i < 12; i++) disc(c, -hw + 0.22 + (i % 3) * 0.2, -hh + 0.25 + Math.floor(i / 3) * 0.2, 0.06, f.cols[i]); rect(c, hw - 0.2, -0.2, 0.1, 0.4, '#c9ccd1'); },
    toilet(c, f, hw, hh) { sh(c, hw, hh, 0.2); rect(c, -hw, -hh, 2 * hw, 0.22, '#e8ecef'); oval(c, 0, 0.08, hw * 0.9, hh * 0.72, 0, '#f6f8fa'); oval(c, 0, 0.1, hw * 0.55, hh * 0.45, 0, '#cfe3ea'); },
    paint(c, f, hw, hh) {
      if (!f.hazard) { rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c); return; }
      c.save(); c.beginPath(); c.rect(-hw, -hh, 2 * hw, 2 * hh); c.rect(-hw + 0.35, -hh + 0.35, 2 * hw - 0.7, 2 * hh - 0.7); c.clip('evenodd');
      rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e3b23c'); c.fillStyle = '#1b1b1f';
      for (let s = -hw - 2 * hh; s < hw + 2 * hh; s += 0.7) { c.beginPath(); c.moveTo(s, -hh); c.lineTo(s + 0.35, -hh); c.lineTo(s + 0.35 + 2 * hh, hh); c.lineTo(s + 2 * hh, hh); c.closePath(); c.fill(); }
      c.restore();
    },
    oil(c, f, hw, hh) { oval(c, 0, 0, hw, hh, f.seed * 3, 'rgba(12,12,16,0.5)'); oval(c, hw * 0.3, 0, hw * 0.4, hh * 0.4, 0, 'rgba(90,60,120,0.12)'); },
    hospbed(c, f, hw, hh) {
      sh(c, hw, hh, 0.28); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9aa3ad'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#f2f4f6');
      const s = f.head === 's' ? 1 : -1; rr(c, -hw + 0.15, s * (hh - 0.45) - 0.2, 2 * hw - 0.3, 0.4, 0.1, '#ffffff');
      rect(c, -hw + 0.08, s > 0 ? -hh + 0.08 : -hh + 0.75, 2 * hw - 0.16, 2 * hh - 0.83, '#7fb2d9'); rect(c, -hw + 0.08, s > 0 ? hh - 0.82 : -hh + 0.75, 2 * hw - 0.16, 0.08, '#e8f0f8');
    },
    ecg(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b2d33'); rect(c, -hw + 0.04, -hh + 0.04, 2 * hw - 0.08, 2 * hh - 0.08, '#0b1a10'); c.strokeStyle = '#3fff7a'; c.lineWidth = 0.025; c.beginPath(); for (let i = 0; i <= 10; i++) { const x = -hw + 0.06 + i * (2 * hw - 0.12) / 10, ph = (i / 10 + t * 0.8) % 1; c.lineTo(x, ph > 0.45 && ph < 0.52 ? -hh * 0.6 : ph > 0.52 && ph < 0.56 ? hh * 0.4 : 0); } c.stroke(); },
    iv(c, f, hw) { disc(c, 0.05, 0.06, hw, 'rgba(0,0,0,0.2)'); disc(c, 0, 0, hw * 0.5, '#9aa0a8'); rr(c, -0.08, -0.12, 0.16, 0.24, 0.05, 'rgba(200,230,255,0.85)'); },
    curtain(c, f, hw, hh) { rect(c, -0.04, -hh, 0.08, 2 * hh, 'rgba(160,200,220,0.55)'); for (let y = -hh; y < hh; y += 0.3) disc(c, 0, y, 0.05, 'rgba(120,170,200,0.6)'); },
    gunrack(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a2a1e'); rect(c, -hw, hh - 0.08, 2 * hw, 0.08, '#2a1a10');
      const ids = ['rifle', 'shotgun', 'uzi', 'pistol', 'rocket', 'rifle', 'shotgun', 'pistol', 'uzi'];
      for (let i = 0; i < ids.length; i++) { const x = -hw + 0.9 + i * (2 * hw - 1.8) / (ids.length - 1); c.save(); c.translate(x, 0); c.scale(0.8, 0.8); GUNS[ids[i]](c); c.restore(); rect(c, x - 0.12, hh - 0.2, 0.24, 0.1, '#ffd23a'); }
    },
    crate(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9a7040'); c.strokeStyle = '#6b4a26'; c.lineWidth = 0.06; c.strokeRect(-hw + 0.05, -hh + 0.05, 2 * hw - 0.1, 2 * hh - 0.1);
      c.beginPath(); c.moveTo(-hw + 0.1, -hh + 0.1); c.lineTo(hw - 0.1, hh - 0.1); c.moveTo(hw - 0.1, -hh + 0.1); c.lineTo(-hw + 0.1, hh - 0.1); c.stroke();
      if (f.text) { rect(c, -hw * 0.8, -0.13, hw * 1.6, 0.26, '#b08850'); wtext(c, f.text, 0, 0.01, 0.2, '#3a2410', 800); }
    },
    crates(c, f, hw, hh) { for (let i = 0; i < 4; i++) { c.save(); c.translate((i % 2 ? 1 : -1) * hw / 2, (i < 2 ? -1 : 1) * hh / 2); FD.crate(c, { text: i === 1 ? 'BRUNOST' : i === 2 ? 'TV' : '' }, hw / 2 - 0.03, hh / 2 - 0.03); c.restore(); } },
    target(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#f4f4f4'); for (let i = 3; i > 0; i--) { oval(c, 0, 0, hw * 0.3 * i / 3 + 0.02, hh * 0.3 * i / 3 + 0.02, 0, i % 2 ? '#1b1b1f' : '#f4f4f4'); } disc(c, 0, 0, 0.05, '#c0392b'); },
    bottles(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2a1a12'); const vert = hh > hw, L = vert ? 2 * hh : 2 * hw;
      c.fillStyle = 'rgba(200,220,240,0.18)'; if (vert) c.fillRect(-hw, -hh, 0.12, 2 * hh); else c.fillRect(-hw, -hh, 2 * hw, 0.12);
      const n = Math.floor(L / 0.24);
      for (let i = 0; i < n; i++) {
        if (f.broken && (i * 7 + 3) % 3) continue;
        const s = -L / 2 + 0.12 + i * 0.24, col = ['#2f7d3a', '#7a4a20', '#d9e8f0', '#8a1f1a', '#c9a46a'][i % 5];
        disc(c, vert ? 0.05 : s, vert ? s : 0.05, 0.09, col); disc(c, vert ? 0.02 : s - 0.03, vert ? s - 0.03 : 0.02, 0.03, 'rgba(255,255,255,0.55)');
      }
    },
    taps(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c9ccd1'); for (let i = 0; i < 4; i++) disc(c, -hw + 0.2 + i * (2 * hw - 0.4) / 3, 0, 0.08, ['#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a'][i]); },
    stool(c, f, hw) { disc(c, 0.06, 0.08, hw, 'rgba(0,0,0,0.25)'); disc(c, 0, 0, hw, '#1b1b1f'); disc(c, 0, 0, hw * 0.75, f.c || '#7a2a24'); },
    pooltable(c, f, hw, hh, t, sc) {
      sh(c, hw, hh, 0.35); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.12, '#4a2a16'); rect(c, -hw + 0.14, -hh + 0.14, 2 * hw - 0.28, 2 * hh - 0.28, '#1f7a4a');
      for (const q of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) disc(c, q[0] * (hw - 0.14), q[1] * (hh - 0.14), 0.09, '#0b0b0c');
      rect(c, -hw * 0.5, -hh + 0.14, 0.02, 2 * hh - 0.28, 'rgba(255,255,255,0.15)');
      const st = sc && sc.st; if (st && st.balls) for (const b of st.balls) if (!b.sunk) { disc(c, b.x, b.y, 0.06, b.c); disc(c, b.x - 0.02, b.y - 0.02, 0.02, 'rgba(255,255,255,0.6)'); }
    },
    cues(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#4a2a16'); for (let i = 0; i < 3; i++) ln(c, -hw + 0.05, -hh + 0.2 + i * 0.25, hw - 0.05, hh - 0.6 + i * 0.25, '#d9c08a', 0.04); },
    jukebox(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.35); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.25, '#5a2a1e');
      for (let i = 0; i < 5; i++) { c.strokeStyle = DISCO[(i + Math.floor(t * 4)) % DISCO.length]; c.lineWidth = 0.07; c.beginPath(); c.arc(0, -hh * 0.2, hw * 0.9 - i * 0.09, Math.PI * 0.5 - 1.2, Math.PI * 0.5 + 1.2); c.stroke(); }
      rect(c, -hw * 0.6, hh * 0.35, hw * 1.2, hh * 0.4, '#2a1a12'); for (let i = 0; i < 4; i++) rect(c, -hw * 0.55, hh * 0.38 + i * hh * 0.09, hw * 1.1, 0.025, '#c9a46a');
    },
    dartboard(c, f, hw, hh, t, sc) {
      disc(c, 0.3, 0, 0.42, '#1b1b1f'); for (let i = 0; i < 4; i++) disc(c, 0.3, 0, 0.36 - i * 0.08, i % 2 ? '#2f7d3a' : '#c0392b'); disc(c, 0.3, 0, 0.05, '#2f7d3a');
      const st = sc && sc.st; if (st && st.dartT > 0 && st.dartPos) for (const d of st.dartPos) { disc(c, 0.3 + d[0], d[1], 0.035, '#ffd23a'); ln(c, 0.3 + d[0], d[1], 0.3 + d[0] + 0.15, d[1], '#9aa0a8', 0.02); }
    },
    tv(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#111214');
      const x0 = -hw + 0.08, y0 = -hh + 0.06, w = 2 * hw - 0.16, h = 2 * hh - 0.12;
      if (f.broken) { rect(c, x0, y0, w, h, '#1b1d22'); ln(c, x0 + w * 0.3, y0, x0 + w * 0.5, y0 + h, '#5a5f68', 0.02); return; }
      if (f.show === 'football') { rect(c, x0, y0, w, h, '#2f8a3e'); rect(c, -0.01, y0, 0.02, h, '#e9f4e9'); for (let i = 0; i < 6; i++) disc(c, Math.sin(t * 0.9 + i * 1.7) * w * 0.4, y0 + h * 0.5 + Math.cos(t * 1.3 + i) * h * 0.3, 0.035, i < 3 ? '#c0392b' : '#f2f2f2'); disc(c, Math.sin(t * 1.7) * w * 0.35, y0 + h * 0.5, 0.025, '#fff'); }
      else { rect(c, x0, y0, w, h, '#1f3f8a'); rect(c, x0, y0 + h * 0.65, w, h * 0.35, '#c0392b'); rect(c, x0 + w * 0.1 + (t * 0.3 % 0.6), y0 + h * 0.75, w * 0.35, h * 0.12, '#f2f2f2'); disc(c, x0 + w * 0.3, y0 + h * 0.35, h * 0.2, '#e0ac7e'); }
    },
    portrait(c, f, hw, hh) {
      rect(c, -0.5, -0.45, 1.0, 0.9, '#d4af37'); rect(c, -0.42, -0.38, 0.84, 0.66, '#9fc3d9');
      const fc = faceCanvas(); if (fc) c.drawImage(fc, -0.36, -0.36, 0.72, 0.62); else disc(c, 0, -0.08, 0.22, '#f1c7a1');
      rect(c, -0.5, 0.3, 1.0, 0.18, '#1b1b1f'); wtext(c, f.text || '', 0, 0.39, 0.1, '#ffd23a');
    },
    neon(c, f, hw, hh, t) {
      const on = Math.sin(t * 13 + f.seed * 9) > -0.95;
      rect(c, -hw, -hh, 2 * hw, 2 * hh, '#141018');
      if (on) { c.globalCompositeOperation = 'lighter'; wtext(c, f.text, 0, 0.01, hh * 1.5, rgba(f.c, 0.35), 900); c.globalCompositeOperation = 'source-over'; }
      wtext(c, f.text, 0, 0.01, hh * 1.3, on ? f.c : shade(f.c, -0.6), 800);
    },
    door(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#6b4a2e'); rect(c, -hw + 0.04, -hh + 0.05, 2 * hw - 0.08, 0.04, '#8a6a48'); disc(c, hw - 0.08, 0.4, 0.04, '#d4af37'); if (f.text) { rect(c, hw + 0.05, -0.2, 0.42, 0.4, '#e9e4d8'); wtext(c, f.text, hw + 0.26, 0, 0.2, '#1b1b1f', 800); } },
    bed(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5a3a24'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#f2efe8');
      rr(c, -hw + 0.18, -hh + 0.15, hw - 0.25, 0.5, 0.1, '#ffffff'); rr(c, 0.07, -hh + 0.15, hw - 0.25, 0.5, 0.1, '#ffffff');
      rect(c, -hw + 0.08, -hh + 0.8, 2 * hw - 0.16, 2 * hh - 0.88, f.c || '#b8483e'); rect(c, -hw + 0.08, -hh + 0.8, 2 * hw - 0.16, 0.14, shade(f.c || '#b8483e', 0.3));
    },
    nightstand(c, f, hw, hh) { sh(c, hw, hh, 0.25); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#6b4a32'); disc(c, 0, 0, hw * 0.55, '#f2e2b8'); },
    wardrobe(c, f, hw, hh) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#6b4a32'); rect(c, -hw + 0.06, -0.02, 2 * hw - 0.12, 0.04, '#4a3020'); disc(c, -hw + 0.2, -0.12, 0.04, '#d4af37'); disc(c, -hw + 0.2, 0.12, 0.04, '#d4af37'); },
    tub(c, f, hw, hh) { sh(c, hw, hh, 0.25); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.3, '#f4f6f8'); rr(c, -hw + 0.15, -hh + 0.15, 2 * hw - 0.3, 2 * hh - 0.3, 0.25, '#bfe0ec'); disc(c, -hw + 0.3, 0, 0.06, '#9aa0a8'); },
    sink(c, f, hw, hh) { sh(c, hw, hh, 0.2); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.1, '#f4f6f8'); oval(c, 0, 0, hw * 0.6, hh * 0.6, 0, '#cfe3ea'); disc(c, -hw + 0.1, 0, 0.04, '#9aa0a8'); },
    lamp(c, f, hw) { disc(c, 0.1, 0.12, hw, 'rgba(0,0,0,0.25)'); disc(c, 0, 0, hw, '#f2e2b8'); disc(c, 0, 0, hw * 0.5, '#fff6d8'); },
    kcounter(c, f, hw, hh) {
      sh(c, hw, hh, 0.28); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a8f99'); rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#d8d4ca');
      const vert = hh > hw, L = vert ? hh : hw;
      if (L > 2) { for (let k = 0; k < 4; k++) { const a = (k % 2) * 0.32 - 0.16, b = Math.floor(k / 2) * 0.32 - 0.16 + L * 0.4; disc(c, vert ? a : b, vert ? b : a, 0.11, '#2b2d33'); disc(c, vert ? a : b, vert ? b : a, 0.06, '#555'); }
        rr(c, vert ? -0.25 : -L * 0.5 - 0.3, vert ? -L * 0.5 - 0.3 : -0.25, vert ? 0.5 : 0.6, vert ? 0.6 : 0.5, 0.08, '#bfd0da'); }
    },
    fridge1(c, f, hw, hh) { sh(c, hw, hh, 0.35); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.08, '#e8edf2'); rect(c, -hw + 0.1, -0.03, 2 * hw - 0.2, 0.06, '#c4ccd3'); rect(c, hw - 0.2, -hh + 0.15, 0.06, 0.4, '#9aa0a8'); disc(c, -0.15, -0.25, 0.05, '#c0392b'); disc(c, 0.05, 0.25, 0.05, '#2f6fb5'); disc(c, -0.1, 0.3, 0.04, '#f2c230'); },
    carlift(c, f, hw, hh) {
      for (const sx of [-1, 1]) { rect(c, sx * (hw + 0.1) - 0.15, -hh * 0.6, 0.3, 0.3, '#e3b23c'); rect(c, sx * (hw + 0.1) - 0.15, hh * 0.4, 0.3, 0.3, '#e3b23c'); }
      rect(c, -hw + 0.2, -hh, 0.5, 2 * hh, '#5d636b'); rect(c, hw - 0.7, -hh, 0.5, 2 * hh, '#5d636b');
      PG.drawCar(c, { x: 0, y: 0, th: -Math.PI / 2, len: 4.75, wid: 1.92, color: f.car || '#3b4049', lights: false });
      rect(c, -0.35, hh * 0.2, 0.7, 0.9, 'rgba(0,0,0,0.25)');
    },
    workbench(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#7a5a3a'); rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#8a6a48'); rect(c, -0.2, -hh + 0.3, 0.4, 0.3, '#3a3f46'); ln(c, -0.3, 0, 0.2, 0.4, '#c0392b', 0.06); ln(c, 0, 1, 0.2, 1.6, '#9aa0a8', 0.05); disc(c, 0.1, -1.6, 0.12, '#e3b23c'); },
    tools(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a7a62'); for (let i = 0; i < 6; i++) ln(c, 0, -hh + 0.4 + i * 0.8, 0, -hh + 0.75 + i * 0.8, i % 2 ? '#1b1b1f' : '#c0392b', 0.12); },
    tyres(c, f, hw) { for (let i = 0; i < 2; i++) { const o = i * 0.15; disc(c, o + 0.1, o + 0.12, hw * 0.9, 'rgba(0,0,0,0.3)'); disc(c, o, o, hw * 0.85, '#151515'); disc(c, o, o, hw * 0.45, '#3a3a3a'); disc(c, o, o, hw * 0.25, '#151515'); } },
    toolbox(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c0392b'); for (let i = 1; i < 3; i++) rect(c, -hw, -hh + i * hh * 2 / 3, 2 * hw, 0.03, '#7a1f16'); rect(c, -0.2, -hh + 0.05, 0.4, 0.06, '#c9ccd1'); },
    shelf(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.parts ? '#4d5258' : '#8a9099');
      const vert = hh > hw, L = vert ? 2 * hh : 2 * hw, D = vert ? 2 * hw : 2 * hh;
      rect(c, vert ? -0.02 : -hw, vert ? -hh : -0.02, vert ? 0.04 : 2 * hw, vert ? 2 * hh : 0.04, '#5d636b');
      const n = Math.floor(L / 0.32);
      for (let side = 0; side < (f.smokes || f.parts ? 1 : 2); side++) for (let i = 0; i < n; i++) {
        const s = -L / 2 + 0.06 + i * 0.32, col = f.parts ? (i % 3 ? '#9a7040' : '#2f6fb5') : f.smokes ? (i % 2 ? '#e9e4d8' : '#c0392b') : f.cols[(i + side * 20) % f.cols.length];
        const d0 = f.smokes || f.parts ? -D / 2 + 0.08 : side ? 0.06 : -D / 2 + 0.06, dd = f.smokes || f.parts ? D - 0.16 : D / 2 - 0.12;
        if (vert) rect(c, d0, s, dd, 0.26, col); else rect(c, s, d0, 0.26, dd, col);
      }
    },
    hoist(c, f, hw, hh) { ln(c, -hw, hh, 0, -hh, '#e3b23c', 0.14); ln(c, hw, hh, 0, -hh, '#e3b23c', 0.14); disc(c, 0, -hh, 0.12, '#3a3f46'); ln(c, 0, -hh, 0, 0.2, '#9aa0a8', 0.04); },
    whiteboard(c, f, hw, hh) {
      rect(c, -hw - 0.05, -hh - 0.05, 2 * hw + 0.1, 2 * hh + 0.1, '#9aa0a8'); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#f6f8fa');
      if (f.plan) {   // the bank: a box, a red X on the vault, an arrow out
        c.strokeStyle = '#1f3f8a'; c.lineWidth = 0.04; c.strokeRect(-hw * 0.6, -hh * 0.7, hw * 1.2, hh * 1.1);
        ln(c, -0.08, -hh * 0.5, 0.08, -hh * 0.3, '#c0392b', 0.05); ln(c, 0.08, -hh * 0.5, -0.08, -hh * 0.3, '#c0392b', 0.05);
        ln(c, 0, -hh * 0.2, 0, hh * 0.7, '#3e8e5a', 0.04); ln(c, -0.06, hh * 0.6, 0, hh * 0.7, '#3e8e5a', 0.04); ln(c, 0.06, hh * 0.6, 0, hh * 0.7, '#3e8e5a', 0.04);
      } else for (let i = 0; i < 4; i++) ln(c, -hw * 0.5, -hh * 0.6 + i * hh * 0.35, hw * 0.4, -hh * 0.55 + i * hh * 0.35, i % 2 ? '#c0392b' : '#1f3f8a', 0.03);
    },
    arcade(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1b1f27'); rect(c, -hw + 0.12, -hh + 0.25, 2 * hw - 0.24, hh * 0.9, '#0a0c10');
      const bx = Math.sin(t * 1.5) * 0.2; rect(c, bx - 0.12, -hh + 0.5, 0.24, 0.1, '#d9381e'); rect(c, -hw + 0.15, -hh + 0.75, 2 * hw - 0.3, 0.02, '#e3b23c');
      rect(c, -hw, -hh, 2 * hw, 0.2, '#f2c230'); wtext(c, 'TTB!', 0, -hh + 0.1, 0.14, '#1b1f27', 900); disc(c, -0.15, hh - 0.25, 0.07, '#c0392b'); disc(c, 0.15, hh - 0.25, 0.07, '#2f6fb5');
    },
    fridge(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b3038'); const n = Math.floor(2 * hw / 0.22);
      for (let i = 0; i < n; i++) { if (f.broken && i % 3) continue; disc(c, -hw + 0.12 + i * 0.22, 0.05, 0.08, f.cols[i % f.cols.length]); }
      if (!f.broken) rect(c, -hw + 0.05, -hh + 0.05, 2 * hw - 0.1, 2 * hh - 0.1, 'rgba(170,220,245,0.22)');
      rect(c, -hw + 0.05, -hh + 0.05, 2 * hw - 0.1, 0.06, '#e8f6ff'); for (let x = -hw + 1.5; x < hw; x += 1.5) rect(c, x, -hh, 0.05, 2 * hh, '#1b1f27');
    },
    slush(c, f, hw, hh, t) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#d8dce2'); for (let i = 0; i < 2; i++) { const x = (i - 0.5) * hw; disc(c, x, -0.05, hw * 0.4, i ? '#3f9fff' : '#ff3f6a'); ln(c, x, -0.05, x + Math.cos(t * 3 + i) * hw * 0.3, -0.05 + Math.sin(t * 3 + i) * hw * 0.3, 'rgba(255,255,255,0.7)', 0.05); } },
    freezer(c, f, hw, hh) { sh(c, hw, hh, 0.28); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.12, '#eef2f5'); rect(c, -hw + 0.12, -hh + 0.12, 2 * hw - 0.24, 2 * hh - 0.24, '#bfe3f2'); for (let i = 0; i < 6; i++) rect(c, -hw + 0.2 + i * 0.32, -0.2 + (i % 2) * 0.12, 0.26, 0.2, ['#f2c230', '#e86aa0', '#7a4a20', '#3fb6c4'][i % 4]); },
    mags(c, f, hw, hh) { sh(c, hw, hh, 0.25); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d636b'); for (let i = 0; i < 8; i++) rect(c, -hw + 0.08 + i * 0.33, -hh + 0.08, 0.28, 2 * hh - 0.16, f.cols[i]); rect(c, -hw, hh, 2 * hw, 0.36, '#f4f4f4'); wtext(c, 'BUS MANIAC STRIKES AGAIN', 0, hh + 0.18, 0.2, '#111', 800); },
    mailboxes(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a6a3a'); for (let y = -hh + 0.1; y < hh - 0.3; y += 0.42) { rect(c, -hw + 0.08, y, 2 * hw - 0.16, 0.36, '#c9a46a'); rect(c, -0.1, y + 0.14, 0.2, 0.06, '#5a4020'); } },
    lift(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9aa1a9'); rect(c, -0.02, -hh, 0.04, 2 * hh, '#5d636b'); rect(c, -0.3, hh, 0.6, 0.22, '#1b1d22'); wtext(c, String(1 + Math.floor(t / 3 + f.seed * 9) % 9), 0, hh + 0.11, 0.16, '#ff8a3a', 800); },
    stairs(c, f, hw, hh) {
      sh(c, hw, hh, 0.25); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a8478');
      for (let i = 0; i < 14; i++) { const y = -hh + i * 2 * hh / 14; rect(c, -hw + 0.2, y, 2 * hw - 0.4, 2 * hh / 14 - 0.05, shade('#b5ad9c', -i * 0.035)); }
      rect(c, -hw, -hh, 0.12, 2 * hh, '#4a3a2e'); rect(c, hw - 0.12, -hh, 0.12, 2 * hh, '#4a3a2e');
    },
    partition(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#6d7a8a'); },
    safe(c, f, hw, hh, t, sc) {
      sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b2f36'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#3d434c');
      const st = sc && sc.st;
      if (st && st.safeOpen) { c.save(); c.translate(-hw, hh); c.rotate(0.9); rect(c, 0, -0.1, 2 * hw, 0.14, '#4d535c'); c.restore(); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.2, '#15171b'); return; }
      disc(c, 0.05, 0, 0.2, '#9aa0a8'); ln(c, 0.05, 0, 0.05 + Math.cos(t * (st && st.cracking ? 6 : 0)) * 0.17, Math.sin(t * (st && st.cracking ? 6 : 0)) * 0.17, '#1b1d22', 0.04); rect(c, -hw + 0.12, -0.06, 0.12, 0.12, '#c9ccd1');
    },
    rack(c, f, hw, hh) {
      sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a3633');
      for (let x = -hw; x <= hw; x += hw / 3) rect(c, Math.min(x, hw - 0.14), -hh, 0.14, 2 * hh, '#d9661e');
      rect(c, -hw, -hh, 2 * hw, 0.1, '#1f5fa8'); rect(c, -hw, hh - 0.1, 2 * hw, 0.1, '#1f5fa8');
      for (let i = 0; i < 12; i++) { const x = -hw + 0.3 + i * (2 * hw - 0.6) / 12; if (f.cols[i] === '#ffffff') continue; rect(c, x, -hh + 0.18, (2 * hw - 0.6) / 12 - 0.1, 2 * hh - 0.36, i % 3 ? '#a87a46' : '#8a6a3a'); rect(c, x, -0.02, (2 * hw - 0.6) / 12 - 0.1, 0.04, 'rgba(0,0,0,0.25)'); }
    },
    forklift(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); for (const q of [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]]) rect(c, q[0] * hw - 0.12, q[1] * hh - 0.2, 0.24, 0.4, '#111');
      rr(c, -hw + 0.1, -hh * 0.5, 2 * hw - 0.2, hh * 1.4, 0.12, '#e0a020'); rect(c, -hw + 0.25, -hh * 0.1, 2 * hw - 0.5, hh * 0.5, '#2b2d33');
      rect(c, -hw + 0.1, -hh * 0.62, 2 * hw - 0.2, 0.12, '#3a3f46'); rect(c, -hw + 0.25, -hh, 0.14, hh * 0.45, '#9aa0a8'); rect(c, hw - 0.39, -hh, 0.14, hh * 0.45, '#9aa0a8');
    },
    pallet(c, f, hw, hh) { sh(c, hw, hh, 0.2); for (let i = 0; i < 5; i++) rect(c, -hw, -hh + i * 2 * hh / 5, 2 * hw, 2 * hh / 5 - 0.06, '#b08850'); },
    djbooth(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#14121a'); rect(c, -hw, hh - 0.12, 2 * hw, 0.12, '#c25cff');
      for (const s of [-1, 1]) { const x = s * hw * 0.55; disc(c, x, -0.05, 0.42, '#2b2d33'); disc(c, x, -0.05, 0.36, '#0b0b0c'); const a = t * 3.5 * s; ln(c, x, -0.05, x + Math.cos(a) * 0.32, -0.05 + Math.sin(a) * 0.32, '#e9e4d8', 0.03); disc(c, x, -0.05, 0.06, '#c0392b'); }
      rect(c, -0.35, -0.35, 0.7, 0.6, '#2b2d33'); for (let i = 0; i < 6; i++) disc(c, -0.25 + (i % 3) * 0.25, -0.2 + Math.floor(i / 3) * 0.3, 0.05, DISCO[(i + Math.floor(t * 4.2)) % DISCO.length]);
    },
    speaker(c, f, hw, hh, t) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#111216'); const k = 1 + 0.08 * Math.max(0, Math.sin(t * 13.2)); disc(c, 0, 0, hw * 0.7 * k, '#2b2d33'); disc(c, 0, 0, hw * 0.35 * k, '#0b0b0c'); disc(c, 0, 0, hw * 0.12, '#5a5f68'); },
    grill(c, f, hw, hh, t) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d636b'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.2, '#2b2d33'); for (let i = 0; i < 5; i++) { const x = -hw + 0.5 + i * 0.75; disc(c, x, 0, 0.2, '#6b3a1e'); disc(c, x - 0.05, -0.05, 0.08, '#8a4a26'); } if (Math.random() < 0.05) PG.burst(f.x + rand(-1, 1), f.y, 'smoke', 1, 0.6, 1.5, 0.3); },
    pies(c, f, hw, hh) { oval(c, 0, 0, hw, hh, 0, 'rgba(220,240,255,0.5)'); for (let i = 0; i < 3; i++) disc(c, (i - 1) * 0.3, 0, 0.13, i === 1 ? '#c0392b' : '#d9a441'); },
    hotdog(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9aa0a8'); for (let i = 0; i < 5; i++) { const y = -hh + 0.15 + i * (2 * hh - 0.3) / 4; rr(c, -hw + 0.1, y - 0.05, 2 * hw - 0.2, 0.1, 0.05, '#b8543a'); rect(c, -hw + 0.15 + ((t * 0.4 + i * 0.13) % 0.4), y - 0.05, 0.03, 0.1, '#7a2a1a'); } },
    barrel(c, f, hw) { disc(c, 0.1, 0.13, hw, 'rgba(0,0,0,0.3)'); disc(c, 0, 0, hw, '#9b2a1e'); c.strokeStyle = '#6b1a12'; c.lineWidth = 0.05; c.beginPath(); c.arc(0, 0, hw * 0.7, 0, TAU); c.stroke(); disc(c, -hw * 0.3, -hw * 0.3, hw * 0.18, '#c9ccd1'); },
    bookshelf(c, f, hw, hh) {
      sh(c, hw, hh, 0.32); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5a3a24');
      const vert = hh > hw, L = vert ? 2 * hh : 2 * hw, D = vert ? 2 * hw : 2 * hh;
      for (let s = -L / 2 + 0.08, i = 0; s < L / 2 - 0.12; i++) { const w = 0.08 + (f.cols[i % 48] === '#ffffff' ? 0.08 : 0.04); if (vert) rect(c, -D / 2 + 0.08, s, D - 0.16, w, f.cols[i % 48]); else rect(c, s, -D / 2 + 0.08, w, D - 0.16, f.cols[i % 48]); s += w + 0.02; }
    },
    cards(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1f3f6e'); for (let i = 0; i < 4; i++) rect(c, -hw + 0.06, -hh + 0.08 + i * 0.18, 2 * hw - 0.12, 0.14, f.cols[i]); },
  };
  function drawFurn(ctx, f, t, sc) {
    const fn = FD[f.t]; if (!fn) return;
    ctx.save(); ctx.translate(f.x, f.y); if (f.rot) ctx.rotate(f.rot);
    fn(ctx, f, f.w / 2, f.h / 2, t, sc);
    ctx.restore();
  }

  // ================= the vault, loot, stands, critters =================
  function drawVault(ctx, sc, t) {
    const st = sc.st, v = st.vault, hx = sc.ox + VAULT_HINGE[0], hy = sc.oy + VAULT_HINGE[1];
    const a = st.vaultOpen ? VAULT_SWING * (1 - Math.pow(1 - (st.doorA || 0), 2)) : 0;
    const vx = v.x - hx, vy = v.y - hy, ca = Math.cos(a), sa = Math.sin(a), cx = hx + vx * ca - vy * sa, cy = hy + vx * sa + vy * ca, R = 1.75;
    if (!X.inView(cx, cy, 3)) return;
    disc(ctx, cx + 0.22, cy + 0.3, R, 'rgba(0,0,0,0.4)');
    disc(ctx, cx, cy, R, '#5d636b'); disc(ctx, cx, cy, R * 0.9, '#9aa1a9'); disc(ctx, cx, cy, R * 0.72, '#848b93');
    ctx.strokeStyle = '#6d737b'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, TAU); ctx.stroke();
    for (let i = 0; i < 12; i++) { const b = i / 12 * TAU + a; disc(ctx, cx + Math.cos(b) * R * 0.81, cy + Math.sin(b) * R * 0.81, 0.07, '#c9ccd1'); }
    const spin = a + (st.drill ? st.drill.prog * 30 : 0);
    for (let i = 0; i < 3; i++) { const b = spin + i * TAU / 3; ln(ctx, cx, cy, cx + Math.cos(b) * R * 0.45, cy + Math.sin(b) * R * 0.45, '#3a3f46', 0.12); disc(ctx, cx + Math.cos(b) * R * 0.45, cy + Math.sin(b) * R * 0.45, 0.1, '#3a3f46'); }
    disc(ctx, cx, cy, 0.22, '#d4af37'); disc(ctx, cx - 0.06, cy - 0.06, 0.07, '#fff2b0');
    disc(ctx, hx + 0.1, hy, 0.2, '#3a3f46');
    if (st.drill && !st.vaultOpen && st.drill.prog > 0) {   // the thermal drill on its stand
      const on = st.drill.on;
      rect(ctx, cx + 1.25, cy - 0.35, 1.0, 0.7, '#c0392b'); rect(ctx, cx + 1.3, cy - 0.3, 0.9, 0.12, '#e05a4a');
      ln(ctx, cx + 1.25, cy, cx + 0.95, cy, '#c9ccd1', 0.12); disc(ctx, cx + 2.05, cy + 0.2, 0.08, on ? (Math.sin(t * 12) > 0 ? '#3fff7a' : '#1a6a30') : '#555');
      if (on) { ctx.globalCompositeOperation = 'lighter'; disc(ctx, cx + 0.95, cy, 0.18 + Math.random() * 0.1, 'rgba(255,170,60,0.7)'); ctx.globalCompositeOperation = 'source-over'; }
    }
  }
  function drawLoot(ctx, l, t) {
    const bob = Math.sin(t * 3 + l.x) * 0.04;
    ctx.save(); ctx.translate(l.x, l.y + bob);
    if (l.kind === 'bag') { oval(ctx, 0.12, 0.16, 0.5, 0.34, 0, 'rgba(0,0,0,0.3)'); rr(ctx, -0.5, -0.32, 1.0, 0.64, 0.25, '#2f4a2a'); rect(ctx, -0.48, -0.04, 0.96, 0.08, '#1f3a1a'); wtext(ctx, '$', 0, 0.02, 0.4, '#7dff9a', 900); }
    else if (l.kind === 'gold') { for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.3, y = i === 1 ? -0.12 : 0.06; rect(ctx, x - 0.14 + 0.06, y - 0.08 + 0.08, 0.28, 0.16, 'rgba(0,0,0,0.3)'); rect(ctx, x - 0.14, y - 0.08, 0.28, 0.16, '#d4af37'); rect(ctx, x - 0.1, y - 0.06, 0.2, 0.05, '#fff2b0'); } }
    else { for (let i = 0; i < 3; i++) { rect(ctx, -0.25 + 0.05, -0.12 - i * 0.07 + 0.06, 0.5, 0.24, 'rgba(0,0,0,0.25)'); rect(ctx, -0.25, -0.12 - i * 0.07, 0.5, 0.24, '#3fae6a'); rect(ctx, -0.05, -0.12 - i * 0.07, 0.1, 0.24, '#e9e4d8'); } }
    ctx.restore();
  }
  function drawPad(ctx, pd, t) {
    const info = padInfo(pd.item), ok = info.ok;
    disc(ctx, pd.x, pd.y, 0.9, ok ? 'rgba(255,210,58,0.16)' : 'rgba(120,120,120,0.12)');
    ctx.strokeStyle = ok ? 'rgba(255,210,58,' + (0.5 + 0.3 * Math.sin(t * 4 + pd.x)).toFixed(2) + ')' : 'rgba(150,150,150,0.4)'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.arc(pd.x, pd.y, 0.82, 0, TAU); ctx.stroke();
    rr(ctx, pd.x - 0.55, pd.y - 0.55, 1.1, 1.1, 0.15, '#2b2d33');
    ctx.save(); ctx.translate(pd.x, pd.y); ctx.rotate(t * 1.2); if (!ok) ctx.globalAlpha = 0.35; (GUNS[pd.item] || GUNS.pistol)(ctx); ctx.restore();
  }
  function drawCritter(ctx, c, t) {
    if (!X.inView(c.x, c.y, 2)) return;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    if (c.kind === 'rat') { oval(ctx, 0.04, 0.05, 0.16, 0.08, 0, 'rgba(0,0,0,0.25)'); oval(ctx, 0, 0, 0.15, 0.07, 0, '#6b625a'); disc(ctx, 0.13, 0, 0.05, '#7a7068'); ln(ctx, -0.14, 0, -0.32, Math.sin(c.walk * 3) * 0.06, '#c9a0a0', 0.02); }
    else {
      oval(ctx, 0.06, 0.08, 0.32, 0.17, 0, 'rgba(0,0,0,0.25)');
      ctx.strokeStyle = '#d98a3a'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-0.26, 0); ctx.quadraticCurveTo(-0.45, Math.sin(t * 2.5) * 0.2, -0.5, Math.sin(t * 2.5 + 1) * 0.25); ctx.stroke();
      oval(ctx, 0, 0, 0.28, 0.15, 0, '#e09a4a'); for (let i = 0; i < 3; i++) rect(ctx, -0.15 + i * 0.1, -0.13, 0.04, 0.26, '#c07a2a');
      disc(ctx, 0.26, 0, 0.12, '#e09a4a'); disc(ctx, 0.3, -0.09, 0.045, '#c07a2a'); disc(ctx, 0.3, 0.09, 0.045, '#c07a2a');
    }
    ctx.restore();
  }

  // ================= cached static layers =================
  // On a software-rasterised canvas (headless Chromium, SwiftShader, llvmpipe) every scaled pattern, gradient
  // or image is paid for per pixel: a bar's floor patterns and light pools cost ~10 ms a frame that way, while a
  // 1:1 blit at whole-pixel coordinates is close to a memcpy (a screenful of 512 px tiles ~0.5 ms). So a scene's
  // static floor is drawn once into 512 px tiles at the pixels per metre the camera settles on and blitted
  // unscaled at whole pixels; while the zoom eases in they are blitted scaled, and a turned camera on a software
  // canvas (or fastRender off) draws the classic way.
  const TC_N = 512, TC_MAX = 30, TC_POOL = [];
  function tileCache() { return { ppm: 0, gx: 0, gy: 0, key: '', prev: 0, calm: 0, tiles: new Map(), built: 0 }; }
  function tcDrop(L) { for (const cv of L.tiles.values()) if (TC_POOL.length < 16) TC_POOL.push(cv); L.tiles.clear(); L.ppm = 0; }
  function tcTile(L, i, j, paint) {
    const k = i * 4096 + j; let cv = L.tiles.get(k);
    if (cv) { L.tiles.delete(k); L.tiles.set(k, cv); return cv; }   // most recently used last
    cv = TC_POOL.pop() || document.createElement('canvas');
    cv.width = TC_N; cv.height = TC_N;   // (re)sizing also clears it
    const g = cv.getContext('2d'), p = L.ppm, T = TC_N / p, x0 = L.gx + i * T, y0 = L.gy + j * T;
    g.setTransform(p, 0, 0, p, -x0 * p, -y0 * p);
    paint(g, x0, y0, x0 + T, y0 + T);
    L.tiles.set(k, cv); L.built++;
    while (L.tiles.size > TC_MAX) { const it = L.tiles.entries().next().value; L.tiles.delete(it[0]); if (TC_POOL.length < 16) TC_POOL.push(it[1]); }
    return cv;
  }
  // Draws a static layer from its tiles; false = draw it the classic way this frame. b: world box of the
  // content, key: everything that changes its look, want: the pixels per metre the camera is easing towards.
  function tcDraw(L, ctx, view, b, key, want, paint) {
    if ((PG.settings || {}).fastRender === false) return false;
    const m = ctx.getTransform(), turned = Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9, ppm = Math.hypot(m.a, m.b);
    if (!(ppm > 0) || (turned && !(PG.renderCaps && PG.renderCaps.gpu))) return false;
    const reach = Math.hypot(view.cw, view.ch) * (view.dpr || 1) / 2 + TC_N, tol = 0.5 / reach;
    L.calm = Math.abs(ppm / (L.prev || ppm) - 1) < tol / 8 ? L.calm + 1 : 0; L.prev = ppm;
    if (!(want > 0) || (L.calm > 20 && Math.abs(ppm / want - 1) > tol)) want = ppm;   // settled somewhere else
    if (L.key !== key || !L.ppm || Math.abs(want / L.ppm - 1) > tol / 2) { tcDrop(L); L.key = key; L.ppm = want; L.gx = b.x0; L.gy = b.y0; }
    const ratio = ppm / L.ppm, snap = !turned && Math.abs(ratio - 1) <= tol;
    if (!snap && (ratio < 0.7 || ratio > 1.45)) return false;   // the zoom is still far from the cached scale
    const T = TC_N / L.ppm, cw = ctx.canvas.width, ch = ctx.canvas.height;
    let vx0, vy0, vx1, vy1;
    if (turned) { vx0 = view.cx - view.r; vx1 = view.cx + view.r; vy0 = view.cy - view.r; vy1 = view.cy + view.r; }
    else { vx0 = -m.e / m.a; vx1 = (cw - m.e) / m.a; vy0 = -m.f / m.d; vy1 = (ch - m.f) / m.d; }
    const i0 = Math.max(0, Math.floor((Math.max(vx0, b.x0) - L.gx) / T)), i1 = Math.floor((Math.min(vx1, b.x1) - L.gx) / T);
    const j0 = Math.max(0, Math.floor((Math.max(vy0, b.y0) - L.gy) / T)), j1 = Math.floor((Math.min(vy1, b.y1) - L.gy) / T);
    if (i1 < i0 || j1 < j0) return true;   // none of it on screen
    const built = L.built;
    if (snap) {
      const ia = cl(Math.floor((view.cx - L.gx) / T), i0, i1), ja = cl(Math.floor((view.cy - L.gy) / T), j0, j1);
      const ax = Math.round(m.a * (L.gx + ia * T) + m.e), ay = Math.round(m.d * (L.gy + ja * T) + m.f);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ctx.drawImage(tcTile(L, i, j, paint), ax + (i - ia) * TC_N, ay + (j - ja) * TC_N);
      ctx.restore();
    } else {
      const e = 1.2 / ppm;   // a hair of overlap: no hairline seams between scaled tiles
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ctx.drawImage(tcTile(L, i, j, paint), L.gx + i * T, L.gy + j * T, T + e, T + e);
    }
    // nothing new needed this frame: get one tile of the ring around the screen ready
    if (L.built === built) {
      const I1 = Math.floor((b.x1 - L.gx) / T), J1 = Math.floor((b.y1 - L.gy) / T);
      outer: for (let j = Math.max(0, j0 - 1); j <= Math.min(J1, j1 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(I1, i1 + 1); i++) {
        if (!L.tiles.has(i * 4096 + j) && L.tiles.size < TC_MAX - 4) { tcTile(L, i, j, paint); break outer; }
      }
    }
    return true;
  }
  // The pixels per metre the camera is easing towards (core's X.view), so the tiles are drawn once at the end scale.
  function settlePpm(ppm) {
    const cam = X.cam; if (!cam || !(cam.span > 0)) return ppm;
    let want = (X.scene && X.scene.camSpan) || cam.span;
    if (P.state !== 'play') want *= 0.8;
    want *= cam.zoom || 1;
    if (X.input.down('Tab')) want = 260;
    return ppm * cam.span / want;
  }

  // ================= interiors: floor, walls, top =================
  function floorBox(sc) {
    if (sc._fbox) return sc._fbox;
    const b = { x0: sc.x0 - 1, y0: sc.y0 - 1, x1: sc.x1 + 1, y1: sc.y1 + 1 }, e = sc.entry;
    if (e && sc.T) { b.x0 = Math.min(b.x0, e.x - 12.5); b.x1 = Math.max(b.x1, e.x + 12.5); b.y0 = Math.min(b.y0, e.y - 12.5); b.y1 = Math.max(b.y1, e.y + 12.5); }
    else if (e) { b.x0 = Math.min(b.x0, e.x - 11.5); b.x1 = Math.max(b.x1, e.x + 11.5); b.y1 = Math.max(b.y1, sc.y1 + 12.5); }
    for (const l of sc.lights) if (!l.disco) { b.x0 = Math.min(b.x0, l.x - l.r); b.x1 = Math.max(b.x1, l.x + l.r); b.y0 = Math.min(b.y0, l.y - l.r); b.y1 = Math.max(b.y1, l.y + l.r); }
    return (sc._fbox = b);
  }
  // Everything static under the people: the street outside, floors (dance floors left clear: they are drawn
  // live underneath), the light pools, rugs and paint, the door mat. In world coordinates, clipped to a tile.
  function paintFloor(sc, g, x0, y0, x1, y1) {
    const ov = (a0, b0, a1, b1) => a1 > x0 && a0 < x1 && b1 > y0 && b0 < y1;
    g.fillStyle = sc.bg || '#040507'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const e = sc.entry;
    if (e && (sc.T ? ov(e.x - 12, e.y - 12, e.x + 12, e.y + 12) : ov(e.x - 11, sc.y1, e.x + 11, sc.y1 + 12))) inFrame(sc, g, () => streetStrip(sc, g));
    for (const r of sc.rooms) {
      if (!ov(r.x0, r.y0, r.x1, r.y1)) continue;
      if (r.floor === 'dance') { g.clearRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); continue; }
      roomFloor(g, r);
    }
    g.globalCompositeOperation = 'lighter';
    for (const l of sc.lights) if (!l.disco && ov(l.x - l.r, l.y - l.r, l.x + l.r, l.y + l.r)) lightPool(g, l);
    g.globalCompositeOperation = 'source-over';
    for (const f of sc.furn) { const r = Math.max(f.w, f.h) / 2 + 1; if (f.layer === 0 && ov(f.x - r, f.y - r, f.x + r, f.y + r)) drawFurn(g, f, 0, sc); }
    if (sc.exit) inFrame(sc, g, () => doorMat(sc, g));
  }
  function streetStrip(sc, ctx) {
    const e = sc.entry0 || sc.entry, y1 = sc.y10 != null ? sc.y10 : sc.y1;
    sc = { y1, outG: sc.outG, _sc: sc };
    rect(ctx, e.x - 10, sc.y1, 20, 4.4, '#3e4148'); ctx.fillStyle = '#4c4f57'; for (let x = e.x - 10; x < e.x + 10; x += 1.5) ctx.fillRect(x, sc.y1, 0.05, 4.4);
    rect(ctx, e.x - 10, sc.y1 + 4.4, 20, 0.3, '#6a6d74'); rect(ctx, e.x - 10, sc.y1 + 4.7, 20, 7, '#26282d'); rect(ctx, e.x - 10, sc.y1 + 8.5, 20, 0.14, 'rgba(236,232,220,0.6)');
    if (!sc.outG) { const g = ctx.createRadialGradient(e.x, sc.y1, 3, e.x, sc.y1, 10.5); g.addColorStop(0, 'rgba(4,5,7,0)'); g.addColorStop(1, 'rgba(4,5,7,1)'); sc.outG = g; }
    sc._sc.outG = sc.outG;
    ctx.fillStyle = sc.outG; ctx.fillRect(e.x - 11, sc.y1, 22, 12);
  }
  function roomFloor(ctx, r) {
    const p = floorPattern(ctx, r.floor, r.c1, r.c2);
    if (!r.mat) r.mat = new DOMMatrix([p.k, 0, 0, p.k, r.x0, r.y0]);
    p.pat.setTransform(r.mat); ctx.fillStyle = p.pat; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }
  function lightPool(ctx, l) {
    if (!l.g) { const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.85); g.addColorStop(0, rgba(l.c, (0.1 * l.i).toFixed(3))); g.addColorStop(1, rgba(l.c, 0)); l.g = g; }
    ctx.fillStyle = l.g; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  function doorMat(sc, ctx) {
    const x = sc.exit0 || sc.exit, w = x.x1 - x.x0, h = x.y1 - x.y0;
    rect(ctx, x.x0, x.y0, w, h, '#2a2622'); ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 0.08; ctx.strokeRect(x.x0 + 0.1, x.y0 + 0.1, w - 0.2, h - 0.2);
    wtext(ctx, sc.type === 'apartment' || sc.type === 'hideout' ? 'HOME' : 'VELKOMMEN', x.x0 + w / 2, x.y0 + h / 2, 0.36, '#8a7a62', 800);
  }
  function drawFloor(sc, ctx, view, t) {
    readSettings();
    // dance floors are live: drawn first, the cached floor leaves them clear
    for (const r of sc.rooms) if (r.floor === 'dance' && X.inView((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, Math.max(r.x1 - r.x0, r.y1 - r.y0) / 2 + 2)) drawDance(ctx, r, t);
    const L = sc._floorC || (sc._floorC = tileCache());
    if (tcDraw(L, ctx, view, floorBox(sc), 'floor', settlePpm(view.scale * (view.dpr || 1)), (g, x0, y0, x1, y1) => paintFloor(sc, g, x0, y0, x1, y1))) return;
    const e = sc.entry;
    if (e && (sc.T ? X.inView(e.x, e.y, 16) : X.inView(e.x, sc.y1 + 4, 16))) inFrame(sc, ctx, () => streetStrip(sc, ctx));
    for (const r of sc.rooms) {
      const w = r.x1 - r.x0, h = r.y1 - r.y0;
      if (r.floor === 'dance' || !X.inView(r.x0 + w / 2, r.y0 + h / 2, Math.max(w, h) / 2 + 2)) continue;
      roomFloor(ctx, r);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const l of sc.lights) if (!l.disco && X.inView(l.x, l.y, l.r)) lightPool(ctx, l);
    ctx.globalCompositeOperation = 'source-over';
    for (const f of sc.furn) if (f.layer === 0 && X.inView(f.x, f.y, Math.max(f.w, f.h) / 2 + 1)) drawFurn(ctx, f, t, sc);
    if (sc.exit) inFrame(sc, ctx, () => doorMat(sc, ctx));
  }
  function drawDance(ctx, r, t) {
    const b = Math.floor(t * 126 / 60 * 2);
    rect(ctx, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, '#0b0a10');
    for (let y = r.y0; y < r.y1 - 0.01; y += 1) for (let x = r.x0; x < r.x1 - 0.01; x += 1) {
      const i = Math.round(x - r.x0), j = Math.round(y - r.y0), v = hr(i * 31 + j * 7, b);
      if (v < 0.35) continue;
      ctx.fillStyle = rgba(DISCO[(i + j + b) % DISCO.length], (0.25 + v * 0.5).toFixed(2)); ctx.fillRect(x + 0.06, y + 0.06, 0.88, 0.88);
    }
  }
  function visR(w) { return X.inView((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, Math.max(w.x1 - w.x0, w.y1 - w.y0) / 2 + 1); }
  // The street door, in the layout's frame (bottom wall); drawWalls runs it through inFrame.
  function drawEntry(sc, ctx) {
    const e = sc.entry0 || sc.entry, y1 = sc.y10 != null ? sc.y10 : sc.y1;
    const x0 = e.x - e.w / 2, y0 = y1 - TW;
    if (e.style === 'roller') { rect(ctx, x0, y0, e.w, TW, '#77736b'); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = x0 + 0.2; x < x0 + e.w; x += 0.3) ctx.fillRect(x, y0, 0.05, TW); rect(ctx, x0, y0, e.w, 0.08, '#e3b23c'); }
    else { rect(ctx, x0 - 0.1, y0, e.w + 0.2, TW, '#1b222b'); rect(ctx, x0 + 0.06, y0 + 0.12, e.w / 2 - 0.1, TW - 0.24, 'rgba(140,195,225,0.6)'); rect(ctx, e.x + 0.04, y0 + 0.12, e.w / 2 - 0.1, TW - 0.24, 'rgba(140,195,225,0.6)'); rect(ctx, e.x - 0.25, y0 + 0.2, 0.1, 0.1, '#c9ccd1'); rect(ctx, e.x + 0.15, y0 + 0.2, 0.1, 0.1, '#c9ccd1'); }
    rect(ctx, e.x - 0.42, y0 - 0.32, 0.84, 0.3, '#1d7a3a'); wtext(ctx, 'EXIT', e.x, y0 - 0.17, 0.22, '#eaffea', 800);
  }
  function drawWalls(sc, ctx, view, t) {
    readSettings();
    for (const f of sc.furn) if (f.layer === 1 && X.inView(f.x, f.y, Math.max(f.w, f.h) / 2 + 1)) drawFurn(ctx, f, t, sc);
    for (const pd of sc.pads) if (X.inView(pd.x, pd.y, 2)) drawPad(ctx, pd, t);
    if (sc.type === 'bank') for (const l of sc.loot) if (!l.taken && X.inView(l.x, l.y, 1)) drawLoot(ctx, l, t);
    if (sc.critter && sc.critter.st) drawCritter(ctx, sc.critter, t);
    const plugOpen = sc.st.plug && !sc.st.plug.q;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    if (SH) for (const w of sc.walls) if ((w.kind === 'wall' || (w.kind === 'plug' && !plugOpen)) && visR(w)) ctx.fillRect(w.x0 + 0.18, w.y0 + 0.24, w.x1 - w.x0, w.y1 - w.y0);
    for (const w of sc.walls) {
      if (!visR(w) || (w.kind === 'plug' && plugOpen)) continue;
      const x = w.x0, y = w.y0, ww = w.x1 - w.x0, hh = w.y1 - w.y0;
      if (w.kind === 'glass') { rect(ctx, x, y, ww, hh, 'rgba(150,200,230,0.35)'); ctx.strokeStyle = 'rgba(225,245,255,0.8)'; ctx.lineWidth = 0.05; ctx.strokeRect(x + 0.05, y + 0.05, ww - 0.1, hh - 0.1); continue; }
      if (w.kind === 'bars') {
        const vert = hh > ww; rect(ctx, vert ? x + ww / 2 - 0.05 : x, vert ? y : y + hh / 2 - 0.05, vert ? 0.1 : ww, vert ? hh : 0.1, '#2a2c30');
        for (let s = 0.15; s < (vert ? hh : ww); s += 0.3) rect(ctx, vert ? x + ww / 2 - 0.07 : x + s - 0.07, vert ? y + s - 0.07 : y + hh / 2 - 0.07, 0.14, 0.14, '#a0a6ae');
        continue;
      }
      rect(ctx, x, y, ww, hh, sc.wallTop);
      rect(ctx, x, y, ww, 0.07, sc.wallHi); rect(ctx, x, y, 0.07, hh, sc.wallHi); rect(ctx, x, y + hh - 0.07, ww, 0.07, sc.wallLo); rect(ctx, x + ww - 0.07, y, 0.07, hh, sc.wallLo);
    }
    if (sc.wins) for (const w of sc.wins) {
      if (!visR(w)) continue;
      const ww = w.x1 - w.x0, hh = w.y1 - w.y0, vert = hh > ww;
      rect(ctx, w.x0, w.y0, ww, hh, '#2b4258'); rect(ctx, vert ? w.x0 + ww / 2 - 0.03 : w.x0, vert ? w.y0 : w.y0 + hh / 2 - 0.03, vert ? 0.06 : ww, vert ? hh : 0.06, 'rgba(190,225,255,0.45)');
      ctx.fillStyle = '#1a2430'; for (let s = 1.6; s < (vert ? hh : ww); s += 1.6) ctx.fillRect(vert ? w.x0 : w.x0 + s, vert ? w.y0 + s : w.y0, vert ? ww : 0.08, vert ? 0.08 : hh);
    }
    if (sc.entry && X.inView(sc.entry.x, sc.entry.y, 4)) inFrame(sc, ctx, () => drawEntry(sc, ctx));
    for (const g of sc.gaps) {
      if (!X.inView(g.x, g.y, g.w + 1)) continue;
      if (g.vert) rect(ctx, g.x - TW / 2, g.y - g.w / 2, TW, g.w, 'rgba(0,0,0,0.16)'); else rect(ctx, g.x - g.w / 2, g.y - TW / 2, g.w, TW, 'rgba(0,0,0,0.16)');
      if (!g.door) continue;
      const Ln = g.gate ? g.w * 0.85 : g.w - 0.12, ang = g.a * Math.PI / 2 * (g.side || 1);
      ctx.save();
      if (g.vert) { ctx.translate(g.x, g.y - g.w / 2 + 0.06); ctx.rotate(Math.PI / 2 - ang); } else { ctx.translate(g.x - g.w / 2 + 0.06, g.y); ctx.rotate(ang); }
      rect(ctx, 0.04, 0.0, Ln, 0.16, 'rgba(0,0,0,0.25)'); rect(ctx, 0, -0.07, Ln, 0.14, g.gate ? '#9a8a6a' : '#7a5a3a'); rect(ctx, 0, -0.07, Ln, 0.035, 'rgba(255,255,255,0.18)');
      ctx.restore();
    }
    for (const f of sc.furn) if (f.layer === 2 && X.inView(f.x, f.y, Math.max(f.w, f.h) / 2 + 1)) drawFurn(ctx, f, t, sc);
    if (sc.type === 'bank') drawVault(ctx, sc, t);
  }
  function drawTop(sc, ctx, view, t) {
    readSettings();
    for (const f of sc.furn) {
      if (f.layer !== 3 || f.t === 'vault' || !X.inView(f.x, f.y, 6)) continue;
      if (f.t === 'camera') {
        const a = f.a + Math.sin(t * 0.6 + f.x) * 0.55;
        ctx.fillStyle = sc.st.alarm ? 'rgba(255,60,40,0.10)' : 'rgba(255,255,200,0.06)'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, 7, a - 0.35, a + 0.35); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a); rect(ctx, -0.12, -0.12, 0.42, 0.24, '#2b2d33'); disc(ctx, 0.3, 0, 0.08, '#111'); disc(ctx, -0.05, -0.05, 0.035, Math.sin(t * 4) > 0 ? '#ff3a2a' : '#5a1010'); ctx.restore();
      } else if (f.t === 'mirror') { disc(ctx, f.x, f.y, 0.38, '#9aa0a8'); disc(ctx, f.x, f.y, 0.32, '#c9d4de'); disc(ctx, f.x - 0.08, f.y - 0.08, 0.1, 'rgba(255,255,255,0.7)'); }
    }
    if (sc.type === 'club') drawClubTop(sc, ctx, t);
    const alarm = (sc.type === 'bank' && sc.st.alarm) || sc.st.bellT > 0;
    if (alarm) for (const q of alarmSpots(sc)) {
      if (!X.inView(q.x, q.y, 9)) continue;
      const a = t * 6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,30,0.16)'; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.arc(q.x, q.y, 9, a, a + 0.6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.arc(q.x, q.y, 9, a + Math.PI, a + Math.PI + 0.6); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      disc(ctx, q.x, q.y, 0.28, '#ff2a1a'); disc(ctx, q.x - 0.08, q.y - 0.08, 0.1, '#ffb0a0');
    }
  }
  function drawClubTop(sc, ctx, t) {
    const B0 = wl(sc, 14, 10.5), L0 = wl(sc, 14, 3), bx = B0.x, by = B0.y, da = sc.orient === 'N' ? Math.PI : sc.orient === 'W' ? Math.PI / 2 : sc.orient === 'E' ? -Math.PI / 2 : 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {   // lasers sweeping out of the DJ booth
      const a = da + Math.PI / 2 + Math.sin(t * 1.3 + i * 1.7) * 0.9, col = DISCO[(i + Math.floor(t)) % DISCO.length];
      ln(ctx, L0.x, L0.y, L0.x + Math.cos(a) * 16, L0.y + Math.sin(a) * 16, rgba(col, 0.45), 0.06);
    }
    for (let i = 0; i < 26; i++) { const a = i * 2.4 + t * 0.7, r = 2 + (i * 37 % 70) / 10; disc(ctx, bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.8, 0.1, 'rgba(255,255,255,0.5)'); }
    ctx.globalCompositeOperation = 'source-over';
    disc(ctx, bx + 0.12, by + 0.16, 0.42, 'rgba(0,0,0,0.3)'); disc(ctx, bx, by, 0.4, '#c9ccd1');
    for (let i = 0; i < 8; i++) { const a = i * 0.8 + t * 2; disc(ctx, bx + Math.cos(a) * 0.22, by + Math.sin(a) * 0.22, 0.07, i % 2 ? '#ffffff' : '#8a9099'); }
  }

  // ================= the city side: door fronts and signs =================
  const ICONS = {
    gun: (c, col) => { rect(c, -0.3, -0.08, 0.55, 0.14, col); rect(c, -0.28, 0.02, 0.14, 0.24, col); },
    beer: (c, col) => { rect(c, -0.18, -0.25, 0.34, 0.5, col); rect(c, 0.16, -0.12, 0.12, 0.24, col); rect(c, -0.18, -0.3, 0.34, 0.1, '#fff'); },
    house: (c, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(-0.3, 0); c.lineTo(0, -0.28); c.lineTo(0.3, 0); c.closePath(); c.fill(); rect(c, -0.22, 0, 0.44, 0.26, col); },
  };
  const SPILL = new Map();
  function spill(ctx, col) {   // light from the doorway on the pavement (local coordinates, so one gradient per colour)
    let g = SPILL.get(col); if (g) return g;
    g = ctx.createLinearGradient(0, 0, 0, 3.2); g.addColorStop(0, rgba(col, 0.16)); g.addColorStop(1, rgba(col, 0));
    SPILL.set(col, g); return g;
  }
  function drawCityDoor(ctx, d, t, near) {
    const st = d.st, nx = d.nx, ny = d.ny, ex = d.x - nx * 0.9, ey = d.y - ny * 0.9, W = st.w, nt = night();
    ctx.save(); ctx.transform(-ny, nx, nx, ny, ex, ey);   // local x along the facade, local y out to the street
    if (nt) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = spill(ctx, st.neon || st.light); ctx.beginPath(); ctx.moveTo(-W / 2, 0); ctx.lineTo(W / 2, 0); ctx.lineTo(W / 2 + 1.3, 3.2); ctx.lineTo(-W / 2 - 1.3, 3.2); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    if (st.awning) { rect(ctx, -W / 2 - 0.65, 0.16, W + 1.4, 1.25, 'rgba(0,0,0,0.25)'); for (let i = 0, x = -W / 2 - 0.8; x < W / 2 + 0.79; x += 0.4, i++) rect(ctx, x, 0, 0.4, 1.15, st.awning[i % 2]); rect(ctx, -W / 2 - 0.8, 1.08, W + 1.6, 0.12, shade(st.awning[0], -0.25)); }
    else if (st.canopy) { rect(ctx, -W / 2 - 0.5, 0.18, W + 1, 1.7, 'rgba(0,0,0,0.25)'); rect(ctx, -W / 2 - 0.6, 0, W + 1.2, 1.6, st.canopy); rect(ctx, -W / 2 - 0.6, 1.5, W + 1.2, 0.1, '#d4af37'); }
    else { rect(ctx, -W / 2 - 0.35, 0, W + 0.7, 0.4, '#5a5d64'); rect(ctx, -W / 2 - 0.2, 0.4, W + 0.4, 0.3, '#4f5259'); }
    rect(ctx, -W / 2 - 0.22, -0.65, W + 0.44, 0.65, '#0c0d10');
    if (st.roller) { rect(ctx, -W / 2, -0.55, W, 0.5, '#7d796f'); ctx.fillStyle = 'rgba(0,0,0,0.32)'; for (let x = -W / 2 + 0.2; x < W / 2; x += 0.3) ctx.fillRect(x, -0.55, 0.05, 0.5); }
    else if (st.revolve) { disc(ctx, 0, -0.2, W / 2, '#2b3a48'); ctx.strokeStyle = '#aeb6c0'; ctx.lineWidth = 0.07; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = t * 0.8 + i * Math.PI / 2; ctx.moveTo(0, -0.2); ctx.lineTo(Math.cos(a) * W / 2, -0.2 + Math.sin(a) * W / 2); } ctx.stroke(); }
    else { rect(ctx, -W / 2, -0.5, W / 2 - 0.04, 0.42, st.door); rect(ctx, 0.04, -0.5, W / 2 - 0.04, 0.42, st.door); rect(ctx, -W / 2, -0.5, W, 0.07, 'rgba(255,255,255,0.22)'); disc(ctx, -0.15, -0.25, 0.05, '#d9d2c3'); disc(ctx, 0.15, -0.25, 0.05, '#d9d2c3'); }
    for (const sx of [-1, 1]) rect(ctx, sx * (W / 2 + 0.2) - 0.16, -0.28, 0.32, 0.36, st.frame);
    rect(ctx, -W / 2, -0.12, W, 0.1, nt ? (st.lamp || st.light) : '#6d6a64');
    if (st.hazard) for (let x = -W / 2 - 0.22; x < W / 2 + 0.2; x += 0.4) rect(ctx, x, -0.03, 0.2, 0.08, '#1b1b1f');
    if (st.pillars) for (const sx of [-1, 1]) { const x = sx * (W / 2 + 0.95); rect(ctx, x - 0.3, 0.28, 0.75, 0.75, 'rgba(0,0,0,0.3)'); rect(ctx, x - 0.38, 0.12, 0.76, 0.76, '#a99f8a'); rect(ctx, x - 0.3, 0.2, 0.6, 0.6, '#e2d9c4'); rect(ctx, x - 0.3, 0.2, 0.6, 0.1, '#f4eedd'); }
    if (st.rope) { for (const x of [-W / 2 - 0.5, W / 2 + 0.5, W / 2 + 1.9]) { disc(ctx, x + 0.05, 1.0, 0.12, 'rgba(0,0,0,0.3)'); disc(ctx, x, 0.95, 0.11, '#d4af37'); } ln(ctx, W / 2 + 0.5, 0.95, W / 2 + 1.9, 0.95, '#a0141e', 0.08); }
    if (st.lamp) disc(ctx, W / 2 + 0.75, -0.3, 0.2, nt && Math.sin(t * 3) > -0.3 ? st.lamp : shade(st.lamp, -0.5));
    if (d.place === 'bank') { const sc = S.scenes.get(d.key); if (sc && sc.st.alarm) disc(ctx, -W / 2 - 0.75, -0.3, 0.24, Math.sin(t * 12) > 0 ? '#ff2a1a' : '#5a1010'); }
    if (near) {   // a bobbing marker on the pavement: this one opens
      const k = 0.5 + 0.5 * Math.sin(t * 5), y = 2.3 + 0.25 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(255,210,58,' + (0.45 + 0.4 * k).toFixed(2) + ')'; ctx.beginPath(); ctx.moveTo(-0.45, y + 0.45); ctx.lineTo(0.45, y + 0.45); ctx.lineTo(0, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // the sign on the roof, upright for the camera and clear of the door
    const label = d.name.toUpperCase(), size = 0.62;
    if (!d.tw) d.tw = wmeasure(ctx, label, size, 800);
    const iw = st.icon || st.cross ? 0.8 : 0, w = d.tw + 0.7 + iw, h = 1.0;
    const off = Math.abs(nx) > 0.5 ? 1.0 + w / 2 : 1.0 + h / 2, sx = d.x - nx * (0.9 + off), sy = d.y - ny * (0.9 + off);
    rr(ctx, sx - w / 2 + 0.12, sy - h / 2 + 0.16, w, h, 0.14, 'rgba(0,0,0,0.35)');
    rr(ctx, sx - w / 2, sy - h / 2, w, h, 0.14, st.plate); ctx.strokeStyle = st.frame; ctx.lineWidth = 0.07; PG.rr(ctx, sx - w / 2 + 0.06, sy - h / 2 + 0.06, w - 0.12, h - 0.12, 0.1); ctx.stroke();
    const tx = sx + iw / 2;
    if (st.neon && nt) { ctx.globalCompositeOperation = 'lighter'; wtext(ctx, label, tx, sy + 0.03, size * 1.12, rgba(st.neon, 0.4), 900); ctx.globalCompositeOperation = 'source-over'; }
    wtext(ctx, label, tx, sy + 0.03, size, st.text, 800);
    if (iw) {
      ctx.save(); ctx.translate(sx - w / 2 + 0.55, sy);
      if (st.cross) { rect(ctx, -0.08, -0.28, 0.16, 0.56, '#d42a2a'); rect(ctx, -0.28, -0.08, 0.56, 0.16, '#d42a2a'); }
      else ICONS[st.icon](ctx, st.text);
      ctx.restore();
    }
  }
  function drawCityDoors(ctx, t) {
    readSettings();
    const pp = P.ped, foot = !P.car && pp && !pp.dead;
    for (const d of S.doors) if (X.inView(d.x, d.y, 8)) drawCityDoor(ctx, d, t, foot && Math.abs(pp.x - d.x) < 9 && Math.abs(pp.y - d.y) < 9);
  }

  // ================= screen overlays =================
  function ring(ctx, x, y, k, col, label, r) {
    const s = X.toScreen(x, y); r = r || 22;
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * cl(k, 0, 1)); ctx.stroke();
    if (label) { ctx.font = '800 13px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(label, s.x, s.y + r + 14); ctx.fillStyle = '#fff'; ctx.fillText(label, s.x, s.y + r + 14); }
  }
  function drawScreen(ctx, view, t) {
    const sc = X.scene && X.scene._int ? X.scene : null;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of S.bubbles) {
      const p = b.p; if (p.removed || p.dead || !X.inView(p.x, p.y, 2)) continue;
      const s = X.toScreen(p.x, p.y), a = Math.min(1, (b.life - b.t) * 3, b.t * 8);
      ctx.globalAlpha = Math.max(0, a); ctx.font = '800 14px ' + FONT;
      const w = ctx.measureText(b.text).width + 14, y = s.y - 40;
      ctx.fillStyle = 'rgba(12,13,16,0.85)'; PG.rr(ctx, s.x - w / 2, y - 11, w, 22, 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s.x - 5, y + 11); ctx.lineTo(s.x + 5, y + 11); ctx.lineTo(s.x, y + 17); ctx.fill();
      ctx.fillStyle = b.col; ctx.fillText(b.text, s.x, y + 1);
      ctx.globalAlpha = 1;
    }
    if (sc) {
      if (S.rob && S.rob.ped && !S.rob.ped.dead && !(S.rob.ped.ai.rob && S.rob.ped.ai.rob.done)) ring(ctx, S.rob.ped.x, S.rob.ped.y, S.rob.prog / 2, '#ffd23a', S.rob.ped.ai.role === 'owner' ? '' : 'HOLD IT...');
      const st = sc.st;
      if (sc.type === 'bank' && st.drill && !st.vaultOpen && st.drill.prog > 0) ring(ctx, st.vault.x + 1.6, st.vault.y, st.drill.prog, st.drill.on ? '#ff8a3a' : '#9aa0a8', 'DRILL ' + Math.round(st.drill.prog * 100) + '%', 30);
      if (sc.type === 'office' && st.cracking && !st.safeOpen) ring(ctx, st.safe.x, st.safe.y, st.safeProg || 0, '#7dd0ff', 'SAFE ' + Math.round((st.safeProg || 0) * 100) + '%');
      if (sc.pads.length) {
        ctx.font = '800 13px ' + FONT;
        for (const pd of sc.pads) {
          if (!X.inView(pd.x, pd.y, 2)) continue;
          const s = X.toScreen(pd.x, pd.y), info = padInfo(pd.item), label = info.name.toUpperCase() + (info.ok ? ' $' + info.price : ' - SOLD OUT');
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(label, s.x, s.y + 32);
          ctx.fillStyle = !info.ok ? '#9aa0a8' : P.money >= info.price ? '#7dff9a' : '#ff8a7a'; ctx.fillText(label, s.x, s.y + 32);
        }
      }
    }
    if (S.fade) {
      const f = S.fade, k = f.t / f.dur;
      let a = f.mode === 'sleep' ? (k < 0.35 ? k / 0.35 : k < 0.65 ? 1 : (1 - k) / 0.35) : 1 - k;
      a = cl(a, 0, 1);
      if (a > 0) { ctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, view.cw, view.ch); }
      if (f.mode === 'sleep' && a > 0.6) { ctx.font = '700 28px ' + FONT; ctx.fillStyle = 'rgba(255,255,255,' + ((a - 0.6) * 2.5).toFixed(2) + ')'; ctx.fillText('Z z z . . .', view.cw / 2, view.ch / 2); }
    }
  }
  function drawTracers(ctx) {
    for (const r of S.tracers) { ctx.strokeStyle = 'rgba(255,230,150,' + Math.min(1, r.t * 10).toFixed(2) + ')'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x1, r.y1); ctx.stroke(); }
  }

  // ================= breakables =================
  // Weapons do not report where a bullet stopped, so re-trace the shooter's aim to find the glass it hit.
  function breakFragile(sc, sh) {
    if (!sh || sh.x == null) return;
    const a = sh.aim != null ? sh.aim : sh.th || 0, R = 40;
    const hit = X.raycast(sh.x, sh.y, sh.x + Math.cos(a) * R, sh.y + Math.sin(a) * R, { peds: true, ignore: sh });
    if (!hit || hit.kind !== 'solid') return;
    for (const f of sc.furn) if (f.fragile && !f.broken && Math.abs(hit.x - f.x) < f.w / 2 + 0.35 && Math.abs(hit.y - f.y) < f.h / 2 + 0.35) { smash(sc, f, hit.x, hit.y); return; }
  }
  function smash(sc, f, x, y) {
    f.broken = true;
    PG.burst(x, y, 'debris', 12, 4, 0.8, 0.12, ['#cfe8ff', '#9fd0e8', '#ffffff']);
    X.decal(x, y, 'glass', 1.1);
    if (f.t === 'fishtank') X.decal(f.x + 0.9, f.y, 'paint', 1.7, { color: 'rgba(70,130,190,0.35)' });
    if (f.t === 'bottles') X.decal(x, y + 0.7, 'paint', 1.3, { color: 'rgba(120,70,30,0.35)' });
    if (f.t === 'tv' || f.t === 'jukebox' || f.t === 'arcade') PG.burst(x, y, 'spark', 14, 5, 0.5, 0.1);
    sfx('glass');
    X.emit('interiorSmash', { scene: sc, item: f.t });
  }

  // ================= audio =================
  const SFX = {
    bell(k, t) { k.tone('triangle', 1568, t, 0.5, 0.06); k.tone('triangle', 1175, t + 0.16, 0.6, 0.05); },
    door(k, t) { k.noise(t, 0.14, 0.07, 'bandpass', 700, { Q: 2 }); k.tone('sine', 140, t + 0.1, 0.12, 0.08, { to: 90 }); },
    cash(k, t) { k.tone('square', 1320, t, 0.05, 0.035, { lp: 4000 }); k.tone('square', 1760, t + 0.06, 0.14, 0.035, { lp: 4000 }); k.noise(t + 0.02, 0.1, 0.05, 'highpass', 4000); },
    deny(k, t) { k.tone('sawtooth', 150, t, 0.22, 0.06, { lp: 900 }); k.tone('sawtooth', 110, t + 0.12, 0.25, 0.06, { lp: 900 }); },
    heal(k, t) { [523, 659, 784, 1047].forEach((f, i) => k.tone('sine', f, t + i * 0.07, 0.3, 0.05)); },
    glug(k, t) { for (let i = 0; i < 3; i++) k.noise(t + i * 0.13, 0.08, 0.07, 'lowpass', 520 - i * 90, { Q: 4 }); },
    chime(k, t) { k.tone('triangle', 880, t, 0.2, 0.06); k.tone('triangle', 1320, t + 0.1, 0.25, 0.05); },
    clunk(k, t) { k.tone('sine', 70, t, 0.6, 0.3, { to: 38 }); k.noise(t, 0.25, 0.15, 'lowpass', 500); k.tone('sawtooth', 110, t + 0.15, 1.0, 0.03, { to: 55, lp: 500 }); },
    pool(k, t) { for (let i = 0; i < 6; i++) k.noise(t + i * 0.06 + Math.random() * 0.04, 0.02, 0.12, 'highpass', 2600); },
    meow(k, t) { k.tone('triangle', 720, t, 0.38, 0.05, { to: 460, vib: [7, 30] }); },
    shot(k, t) { k.noise(t, 0.14, 0.22, 'lowpass', 2200, { to: 300 }); k.tone('square', 170, t, 0.06, 0.06, { to: 60 }); },
    punch(k, t) { k.noise(t, 0.06, 0.18, 'lowpass', 650); k.tone('sine', 140, t, 0.08, 0.12, { to: 60 }); },
    glass(k, t) { for (let i = 0; i < 5; i++) k.tone('triangle', 2400 + Math.random() * 2600, t + i * 0.03, 0.12, 0.035); k.noise(t, 0.18, 0.08, 'highpass', 4000); },
    arcade(k, t) { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => k.tone('square', f, t + i * 0.09, 0.08, 0.03, { lp: 3000 })); },
    dart(k, t) { for (let i = 0; i < 3; i++) k.noise(t + i * 0.25, 0.04, 0.1, 'bandpass', 1500, { Q: 3 }); },
    scratch(k, t) { k.noise(t, 0.35, 0.05, 'highpass', 2500); },
    beep(k, t) { k.tone('square', 1046, t, 0.08, 0.03, { lp: 3000 }); },
    tick(k, t) { k.noise(t, 0.02, 0.08, 'highpass', 3000); },
    crate(k, t) { k.noise(t, 0.2, 0.1, 'lowpass', 600); k.tone('sine', 180, t, 0.15, 0.06, { to: 90 }); },
    sleep(k, t) { [392, 330, 262].forEach((f, i) => k.tone('sine', f, t + i * 0.35, 0.6, 0.04)); },
  };
  function sfx(name) { const k = PG.audio.kit(); if (k && SFX[name] && G().status === 'play') SFX[name](k, k.now); }
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // Songs: one 16th-note step at a time, scheduled a little ahead on our own bus (silenced on pause and on the way out).
  const SONGS = {
    techno: { bpm: 126, step(k, t, i, d, muffle) {
      const s = i % 16, bar = Math.floor(i / 16) % 4, root = [45, 45, 43, 48][bar];
      if (s % 4 === 0) k.tone('sine', 150, t, 0.2, 0.45, { to: 45, dest: d });
      if (muffle) { if (s % 4 === 2) k.tone('sawtooth', NOTE(root - 12), t, 0.12, 0.06, { lp: 260, dest: d }); return; }
      if (s % 4 === 2) k.noise(t, 0.05, 0.06, 'highpass', 7000, { dest: d });
      if (s === 4 || s === 12) k.noise(t, 0.12, 0.07, 'bandpass', 1600, { Q: 0.8, dest: d });
      if (s % 2 === 1 || s % 4 === 2) k.tone('sawtooth', NOTE(root + (s % 8 === 6 ? 12 : 0)), t, 0.1, 0.05, { lp: 700 + 500 * Math.sin(i * 0.05), dest: d });
      if (s === 0 && bar % 2 === 0) for (const n of [0, 3, 7]) k.tone('square', NOTE(root + 24 + n), t, 0.3, 0.016, { lp: 2000, dest: d });
    } },
    blues: { bpm: 100, step(k, t, i, d) {
      const s = i % 16, bar = Math.floor(i / 16) % 12, root = [45, 45, 45, 45, 50, 50, 45, 45, 52, 50, 45, 52][bar];
      if (s % 2 === 0) k.tone('triangle', NOTE(root - 12 + [0, 4, 7, 9, 10, 9, 7, 4][(s / 2) % 8]), t, 0.22, 0.09, { dest: d });
      if (s === 4 || s === 12) for (const n of [0, 4, 7, 10]) k.tone('square', NOTE(root + 12 + n), t, 0.18, 0.011, { lp: 1400, dest: d });
      if (s % 4 === 2) k.noise(t, 0.04, 0.03, 'highpass', 6000, { dest: d });
      if (s === 0 || s === 8) k.tone('sine', 110, t, 0.15, 0.18, { to: 50, dest: d });
    } },
    polka: { bpm: 132, step(k, t, i, d) {
      const s = i % 8, bar = Math.floor(i / 8) % 8, root = [48, 43, 48, 43, 48, 41, 43, 48][bar];
      if (s === 0) k.tone('triangle', NOTE(root - 12), t, 0.2, 0.11, { dest: d });
      if (s === 4) k.tone('triangle', NOTE(root - 5), t, 0.2, 0.09, { dest: d });
      if (s === 2 || s === 6) for (const n of [0, 4, 7]) k.tone('square', NOTE(root + 12 + n), t, 0.1, 0.013, { lp: 1800, dest: d });
      if (s % 2 === 0) k.tone('square', NOTE(root + 24 + [0, 4, 7, 12, 11, 7, 4, 2][(i >> 1) % 8]), t, 0.12, 0.015, { lp: 2400, vib: [6, 4], dest: d });
    } },
    synth: { bpm: 110, step(k, t, i, d) {
      const s = i % 16, bar = Math.floor(i / 16) % 4, root = [57, 53, 48, 55][bar];
      k.tone('sawtooth', NOTE(root + [0, 3, 7, 12, 7, 3][i % 6]), t, 0.12, 0.02, { lp: 1600, dest: d });
      if (s % 4 === 0) k.tone('sine', 140, t, 0.18, 0.22, { to: 45, dest: d });
      if (s === 0) k.tone('triangle', NOTE(root - 24), t, 1.0, 0.07, { dest: d });
    } },
    muzak: { bpm: 84, step(k, t, i, d) {
      const s = i % 16, bar = Math.floor(i / 16) % 4, ch = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]][bar];
      if (s === 0) for (const n of ch) k.tone('sine', NOTE(n), t, 2.6, 0.015, { attack: 0.3, dest: d });
      if (s % 4 === 2 && (i * 7) % 5 < 3) k.tone('triangle', NOTE(ch[(i >> 2) % 4] + 12), t, 0.5, 0.02, { dest: d });
    } },
  };
  const AUD = { ctx: null, mus: null, loop: null, loopOn: false };
  function bus(k) {
    if (AUD.ctx !== k.ctx) {
      AUD.ctx = k.ctx;
      AUD.mus = k.ctx.createGain(); AUD.mus.gain.value = 0; AUD.mus.connect(k.master);
      AUD.loop = k.ctx.createGain(); AUD.loop.gain.value = 0; AUD.loop.connect(k.master); AUD.loopOn = false;
    }
    return AUD;
  }
  function silenceMusic() {
    if (S) { S.mus.on = false; S.mus.next = 0; S.mus.vol = 0; }
    if (AUD.ctx) { const t = AUD.ctx.currentTime; AUD.mus.gain.cancelScheduledValues(t); AUD.mus.gain.setTargetAtTime(0, t, 0.015); }
  }
  function silence() {
    if (S && S.mus.on) silenceMusic();
    if (AUD.ctx && AUD.loopOn) { const t = AUD.ctx.currentTime; AUD.loop.gain.cancelScheduledValues(t); AUD.loop.gain.setTargetAtTime(0, t, 0.015); AUD.loopOn = false; }
    if (S && S.yapping) { if (PG.audio.yapStop) PG.audio.yapStop(); S.yapping = false; }
  }
  function wantSong() {
    const sc = X.scene;
    if (sc && sc._int) {
      const st = sc.st;
      if (sc.type === 'club') return { id: 'techno', vol: 0.9 };
      if ((sc.type === 'bar' || sc.type === 'diner') && st.juke && !st.juke.broken) return { id: st.song || (sc.type === 'bar' ? 'blues' : 'polka'), vol: 0.75 };
      if ((sc.type === 'store' || sc.type === 'lobby') && !(st.bellT > 0)) return { id: 'muzak', vol: 0.55 };
      if (sc.type === 'bank' && !st.alarm) return { id: 'muzak', vol: 0.45 };
      if (sc.type === 'hideout') return { id: 'synth', vol: 0.45 };
      return null;
    }
    if (sc) return null;
    const f = X.playerPos(); let best = null, bd = 32;   // a club's bass through the wall
    for (const d of S.doors) if (d.type === 'club') { const dd = Math.abs(d.x - f.x) + Math.abs(d.y - f.y); if (dd < bd) { bd = dd; best = d; } }
    return best ? { id: 'techno', vol: Math.round(0.8 * (1 - bd / 32) * 20) / 20, muffle: true } : null;
  }
  function musicTick() {
    const w = wantSong(), k = PG.audio.kit(), M = S.mus;
    if (!w || !w.vol || !k || G().status !== 'play') { if (M.on) silenceMusic(); return; }
    const A = bus(k), song = SONGS[w.id], sd = 60 / song.bpm / 4;
    if (M.song !== w.id || M.muffle !== !!w.muffle) { M.song = w.id; M.muffle = !!w.muffle; M.step = 0; M.next = 0; }
    if (!M.on) { M.on = true; M.next = 0; M.vol = -1; }
    if (M.vol !== w.vol) { M.vol = w.vol; A.mus.gain.cancelScheduledValues(k.now); A.mus.gain.setTargetAtTime(w.vol, k.now, 0.25); }
    if (M.next < k.now) M.next = k.now + 0.05;
    while (M.next < k.now + 0.16) { song.step(k, M.next, M.step, A.mus, w.muffle); M.step++; M.next += sd; }
  }
  function loopsTick(dt) {
    const k = PG.audio.kit(); if (!k || G().status !== 'play') return;
    let bell = 0, beep = 0, drill = 0;
    const sc = X.scene && X.scene._int ? X.scene : null;
    if (sc) {
      if (sc.type === 'bank' && sc.st.alarm) bell = 1;
      if (sc.st.bellT > 0) beep = 1;
      if (sc.type === 'bank' && sc.st.drill && sc.st.drill.on && !sc.st.vaultOpen) drill = 1;
    } else if (!X.scene) {
      const f = X.playerPos();
      for (const d of S.doors) {
        const s = S.scenes.get(d.key); if (!s || !(s.st.alarm || s.st.bellT > 0)) continue;
        const dd = Math.hypot(d.x - f.x, d.y - f.y); if (dd > 60) continue;
        if (d.place === 'bank' && s.st.alarm) bell = Math.max(bell, 0.7 * (1 - dd / 60));
        if (s.st.bellT > 0) beep = Math.max(beep, 0.7 * (1 - dd / 60));
      }
    }
    for (const s of S.scenes.values()) if (s !== sc && s.st.bellT > 0) s.st.bellT -= dt;
    if (!bell && !beep && !drill) return;
    const A = bus(k);
    if (!AUD.loopOn) { AUD.loopOn = true; A.loop.gain.cancelScheduledValues(k.now); A.loop.gain.setTargetAtTime(1, k.now, 0.02); }
    S.ringT -= dt; S.beepT -= dt; S.drillT -= dt;
    if (bell && S.ringT <= 0) { S.ringT = 0.07; S.ringHi = !S.ringHi; k.tone('square', S.ringHi ? 1250 : 980, k.now + 0.01, 0.06, 0.02 * bell, { lp: 3200, dest: A.loop }); }
    if (beep && S.beepT <= 0) { S.beepT = 0.55; k.tone('square', 1500, k.now + 0.01, 0.25, 0.028 * beep, { lp: 3500, dest: A.loop }); }
    if (drill && S.drillT <= 0) { S.drillT = 0.18; const pr = sc.st.drill.prog; k.tone('sawtooth', 320 + pr * 260, k.now + 0.01, 0.22, 0.028, { lp: 2400, vib: [28, 18], dest: A.loop }); k.noise(k.now + 0.01, 0.2, 0.022, 'bandpass', 2600, { Q: 2, dest: A.loop }); }
  }

  // ================= module =================
  X.mod('interiors', {
    order: 55,
    init() {
      S = fresh();
      S.doors = buildDoors();
      X.interactions.push(insideUse);
      const bd = S.doors.find(d => d.place === 'bank'); if (bd) sceneFor(bd);   // missions can read the bank right away
    },
    stop() { silence(); if (S) for (const sc of S.scenes.values()) despawn(sc); S = null; },
    tick(dt) {
      if (!live()) return;
      const t = X.renderT || X.time;
      S.gmin += dt * 2;
      if (S.drinks > 0) { S.drinkT = (S.drinkT || 0) + dt; if (S.drinkT > 60) { S.drinkT = 0; S.drinks--; } }
      for (const sc of S.scenes.values()) if (sc.st.robbedAt != null) recover(sc);
      const sc = X.scene && X.scene._int ? X.scene : null;
      if (sc) sceneTick(sc, dt, t); else if (!X.scene) { cityTick(t); doorTick(); }
      if (S.bubbles.length) { let gone = false; for (const b of S.bubbles) { b.t += dt; if (b.t >= b.life || b.p.removed || b.p.dead) gone = true; } if (gone) S.bubbles = S.bubbles.filter(b => b.t < b.life && !b.p.removed && !b.p.dead); }
      if (S.tracers.length) { for (const r of S.tracers) r.t -= dt; S.tracers = S.tracers.filter(r => r.t > 0); }
      if (S.fade) {
        const f = S.fade; f.t += dt;
        if (f.mode === 'sleep') {
          P.ped.x = f.x; P.ped.y = f.y; P.ped.vx = P.ped.vy = 0;
          if (!f.done && f.t >= f.dur * 0.45) { f.done = true; doSleep(); }
          if (f.t >= f.dur) { const m = Math.floor(X.clock); X.big('SAVED', '#7dff9a', 1800, 'woke up at ' + String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); }
        }
        if (f.t >= f.dur) S.fade = null;
      }
      musicTick(); loopsTick(dt);
    },
    hud() { if (live() && (G().status !== 'play' || PG.audio.muted)) silence(); },
    render: {
      buildings(ctx, view, t) { if (live() && !X.scene) drawCityDoors(ctx, t); },
      air(ctx) { if (live() && S.tracers.length) drawTracers(ctx); },
      screen(ctx, view, t) { if (live()) drawScreen(ctx, view, t); },
    },
  });

  // ================= events =================
  const curScene = () => (live() && S.cur && X.scene === S.cur ? S.cur : null);
  X.on('sceneChange', e => {
    if (!live()) return;
    const prev = S.cur;
    if (prev && e.scene !== prev) {
      cleanup(prev); S.cur = e.scene && e.scene._int ? e.scene : null; S.stats.left++;
      X.emit('interiorLeave', { scene: prev });
      if (!e.scene) S.fade = { t: 0, dur: 0.35, mode: 'in' };
    }
  });
  X.on('gunfire', e => {
    const sc = curScene(); if (!sc || !e || !inRect(sc, e.x, e.y, 2)) return;
    if (!X.byPlayer(e.by)) { for (const p of sc.peds) if (mine(p) && !p.dead && !p.ai.armed && !p.ai.melee && p.ai.st !== 'fight') panic(sc, p); return; }
    breakFragile(sc, e.by);
    if (sc.type === 'gunshop' && !sc.st.shotWarn) {   // the owner lets the first test shot slide
      sc.st.shotWarn = true; const o = staff(sc, 'owner'); if (o) say(o, 'HEY! NOT IN HERE!', '#ff6b5a');
      for (const p of sc.peds) if (mine(p) && p.ai.role === 'customer') panic(sc, p);
      return;
    }
    alarmScene(sc);
    if (sc.type === 'bank') bankAlarm(sc, 'shots');
  });
  X.on('explosion', e => {
    const sc = curScene(); if (!sc || !e || !inRect(sc, e.x, e.y, 6)) return;
    for (const f of sc.furn) if (f.fragile && !f.broken && Math.hypot(f.x - e.x, f.y - e.y) < 4 * (e.power || 1)) smash(sc, f, f.x, f.y);
    alarmScene(sc);
    if (sc.type === 'bank' && X.byPlayer(e.by)) bankAlarm(sc, 'explosion');
  });
  X.on('pedHurt', e => {
    const sc = curScene(), p = e && e.ped; if (!sc || !mine(p) || p.ai.sc !== sc) return;
    if (p.ai.role === 'artur') { if (X.byPlayer(e.by) && X.time - S.lastHurt > 1) { S.lastHurt = X.time; say(p, pick(LINES.arturHit), '#ffd23a'); } p.hp = p.maxHp; return; }
    if (!X.byPlayer(e.by) || p.dead) return;
    if (e.kind === 'melee' && (sc.type === 'bar' || sc.type === 'club')) { brawl(sc, p); return; }
    provoke(sc, p);
    if (e.kind === 'melee' && sc.type !== 'bank' && sc.type !== 'police') { for (const q of sc.peds) if (mine(q) && q !== p && !q.dead && (q.ai.armed || q.ai.melee) && Math.hypot(q.x - p.x, q.y - p.y) < 12) provoke(sc, q); }
    else alarmScene(sc);
    if (sc.type === 'bank') bankAlarm(sc, 'assault');
  });
  X.on('missionStart', e => {   // a heist mission wants a full vault
    if (!live() || !e || !/bigone|heist|vault/i.test((e.id || '') + ' ' + (e.title || ''))) return;
    const sc = bankScene(); if (sc && X.scene !== sc && (sc.st.alarm || sc.st.vaultOpen)) resetBank(sc);
  });
  X.on('pedKilled', e => {
    const sc = curScene(), p = e && e.ped; if (!sc || !mine(p) || p.ai.sc !== sc || !X.byPlayer(e.by)) return;
    alarmScene(sc);
    if (sc.type === 'bank') bankAlarm(sc, 'murder');
  });

  // ================= public API =================
  const bankApi = {
    get scene() { return S ? bankScene() : null; },
    get alarm() { const sc = S && bankScene(); return !!(sc && sc.st.alarm); },
    get vaultOpen() { const sc = S && bankScene(); return !!(sc && sc.st.vaultOpen); },
    get cashLeft() { const sc = S && bankScene(); return sc ? cashLeft(sc) : 0; },
    get drill() { const sc = S && bankScene(); return sc && sc.st.drill ? sc.st.drill.prog : 0; },
    get robbed() { const sc = S && bankScene(); return !!(sc && sc.st.robbedAt != null); },
    get vault() { const sc = S && bankScene(); return sc ? { x: sc.st.vault.x, y: sc.st.vault.y } : null; },
    reset() { const sc = S && bankScene(); if (sc) resetBank(sc); },
  };
  // ================= themes from other modules =================
  // X.interiors.define(type, def) adds a building theme. def: { size: [w, h] (metres, door in the bottom wall),
  // names: [...], layout(sc, b, R, K) (as the layouts above), style: city-door look (keys as DS), greet: [...],
  // weight (how common, default 2), minSide (smallest building footprint side it fits), furn: { name:
  // (c, f, hw, hh, t, sc) => draw }, looks: { name: (base, K) => overrides }, tick(sc, dt, t, K), place: true
  // (a named city place, not a random building) }. K is KIT: the helpers layouts and ticks need.
  const EXT = {}, LOOKS = {};
  const KIT = {
    get S() { return S; }, P, X, mine, say, panic, provoke, alarm: alarmScene, sfx, buyFood, heal, scratch, crackSafe, safeHint,
    inRect, sightClear, freeAt, navPath, LINES, pick, rand, cl, TAU, day, night, hour,
    rect, rr, disc, oval, ln, wtext, wmeasure, shade, rgba, sh, PRODUCTS, SUIT, TIE, JACK, NEONS,
    money: (n, why, x, y) => X.money(n, why, x, y), popup: m => X.popup(m), crime: (k, x, y, o) => X.crime(k, x, y, o),
  };
  function define(type, def) {
    if (!type || !def || typeof def.layout !== 'function' || !def.size) throw new Error('interiors.define: needs a type, size and layout');
    EXT[type] = def;
    L[type] = (sc, b, R) => def.layout(sc, b, R, KIT);
    LAYOUT_SIZE[type] = def.size;
    NAMES[type] = def.names && def.names.length ? def.names : [type];
    if (def.greet) GREET[type] = def.greet;
    DS[type] = Object.assign({ w: 1.8, door: '#2d3a48', frame: '#8a8f99', plate: '#2b2f3a', text: '#e9e4d8', light: '#ffe2a0' }, def.style || {});
    if (def.furn) Object.assign(FD, def.furn);
    if (def.looks) Object.assign(LOOKS, def.looks);
    WEIGHT[type] = def.weight == null ? 2 : def.weight;
    if (def.minSide) MIN_SIDE[type] = def.minSide;
    if (!def.place && !GEN_TYPES.includes(type)) GEN_TYPES.push(type);
  }
  X.interiors = {
    define,
    get types() { return GEN_TYPES.slice(); },
    kit: KIT,
    // placeId ('bank'), a generic type ('store', 'club'... the nearest one), a building, or a door from .doors
    enter(arg) { return live() ? enterDoor(findDoor(arg)) : null; },
    leave,
    sceneFor(arg) { const d = live() && findDoor(arg); return d ? sceneFor(d) : null; },
    get current() { return X.scene && X.scene._int ? X.scene : null; },
    get scenes() { return S ? S.scenes : new Map(); },
    get doors() { return S ? S.doors : []; },
    get stats() { return S ? S.stats : null; },
    get gameMinutes() { return S ? S.gmin : 0; },
    peds() { const sc = X.scene && X.scene._int ? X.scene : null; return sc ? sc.peds.filter(p => !p.removed) : []; },
    alarm(sc) { sc = sc || (X.scene && X.scene._int ? X.scene : null); if (sc) alarmScene(sc); },
    bank: bankApi,
    _S: () => S,
  };
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
