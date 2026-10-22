// Camp Bussby and SWAT Command for Grand Theft Bus. Two city blocks are rebuilt when the city is made
// (core's X.worldHooks): a fenced army compound with a gate, watchtowers, barracks, a hangar, a helipad,
// sentries and a motor pool of army jeeps, trucks, an APC and a tank you may "borrow", plus the HQ
// building (X.places.armybase, interior 'armybase': barracks, briefing room, armoury, quartermaster);
// and the SWAT headquarters (X.places.swathq, interior 'swathq': briefing, armoury, shooting range) with
// its van fleet at the kerb. Walk into the camp and the soldiers warn you once, then the stars come.
// police.js rolls its SWAT vans and army units out of these gates when the wanted level gets that high.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X || !X.worldHooks) return;
  const { cl, rand, pick, TAU } = X.util;
  const P = X.player;

  const ARMY = { id: 'armybase', name: 'Camp Bussby', color: '#4f5a36' };
  const SWAT = { id: 'swathq', name: 'SWAT Command', color: '#20252e' };
  const LINES = {
    halt: ['HALT! MILITÆRT OMRÅDE!', 'TURN AROUND, SIVILIST!', 'THIS IS NOT THE BUS DEPOT!', 'STOP! OR I SAY STOP AGAIN!'],
    open: ['CONTACT AT THE WIRE!', 'INTRUDER! WAKE UP SERGEANT DAHL!', 'WEAPONS FREE! (FINALLY!)'],
    steal: ['Dispatch: somebody just drove a {car} out of Camp Bussby. The army would like it back.',
      'Camp Bussby reports a missing {car}. They checked under the sofa. Not there.',
      'All units: civilian in a stolen {car}. Do NOT race them.'],
  };

  // ================= world: rebuild two blocks =================
  const S = { army: null, swat: null };
  function inside(bd, b) { const cx = (bd.x0 + bd.x1) / 2, cy = (bd.y0 + bd.y1) / 2; return cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1; }
  function clearBlock(C, blk) {
    const gone = C.buildings.filter(bd => !bd.deco && inside(bd, blk));
    for (const bd of gone) {
      const cx = (bd.x0 + bd.x1) / 2, cy = (bd.y0 + bd.y1) / 2;
      for (const o of PG.cityNear(C, cx, cy, 2)) {
        if (o.kind !== 'building' || !o.bb) continue;
        if (Math.abs(o.bb.x0 - bd.x0) < 0.05 && Math.abs(o.bb.y0 - bd.y0) < 0.05 && Math.abs(o.bb.x1 - bd.x1) < 0.05 && Math.abs(o.bb.y1 - bd.y1) < 0.05) PG.cityRemove(C, o);
      }
    }
    C.buildings = C.buildings.filter(bd => gone.indexOf(bd) < 0);
  }
  function addBuilding(C, x0, y0, x1, y1, h, o) {
    const b = Object.assign({ x0, y0, x1, y1, h, tint: 0, uo: 0.3, neon: -1, nside: 0, top: true, deco: false }, o);
    C.buildings.push(b);
    PG.cityPut(C, { kind: 'building', poly: PG.obb((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0) });
    return b;
  }
  function solid(C, x0, y0, x1, y1, list) {
    const o = { kind: 'building', fence: true, poly: PG.obb((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0) };
    PG.cityPut(C, o); list.push({ x0, y0, x1, y1 });
    return o;
  }
  // A fence round the lot (inside the pavement) with a gate gap in the south side.
  function fence(C, F, gateW, list) {
    const t = 0.35, gx = (F.x0 + F.x1) / 2;
    solid(C, F.x0, F.y0, F.x1, F.y0 + t, list);
    solid(C, F.x0, F.y0, F.x0 + t, F.y1, list);
    solid(C, F.x1 - t, F.y0, F.x1, F.y1, list);
    solid(C, F.x0, F.y1 - t, gx - gateW / 2, F.y1, list);
    solid(C, gx + gateW / 2, F.y1 - t, F.x1, F.y1, list);
    return { x: gx, y: F.y1 + 1.4, nx: 0, ny: 1, w: gateW };
  }
  function buildArmy(C, blk, places) {
    clearBlock(C, blk);
    blk.base = true;   // (kind stays 'city': strollers and pickups keep out)
    const F = { x0: blk.x0 + 5, y0: blk.y0 + 5, x1: blk.x1 - 5, y1: blk.y1 - 5 }, fw = F.x1 - F.x0, fh = F.y1 - F.y0, cx = (F.x0 + F.x1) / 2;
    const A = { blk, F, fences: [], slots: [], posts: [], towers: [], cars: [], soldiers: [] };
    A.gate = fence(C, F, 10, A.fences);
    // HQ (the place), barracks on the west side, the hangar on the east side
    const hw = Math.min(34, fw * 0.42) / 2, hq = addBuilding(C, cx - hw, F.y0 + 5, cx + hw, F.y0 + 21, 16, { tint: 3, place: ARMY.id, color: ARMY.color });
    A.hq = hq;
    A.barracks = addBuilding(C, F.x0 + 4, F.y0 + 5, F.x0 + 15, F.y0 + 5 + Math.min(34, fh * 0.5), 9, { tint: 5, color: '#5b6545' });
    A.hangar = addBuilding(C, F.x1 - 18, F.y0 + 5, F.x1 - 4, F.y0 + 5 + Math.min(26, fh * 0.42), 13, { tint: 2, color: '#59614c' });
    const door = { x: cx, y: hq.y1 + 0.9, nx: 0, ny: 1 };
    places[ARMY.id] = { id: ARMY.id, name: ARMY.name, b: hq, door, color: ARMY.color, gate: A.gate, compound: F };
    // the motor pool: a row facing the gate
    const row = ['jeep', 'armytruck', 'apc', 'tank', 'armytruck', 'jeep'], ry = Math.min(F.y1 - 18, hq.y1 + 14), span = 5.2;
    row.forEach((m, i) => A.slots.push({ model: m, x: cx + (i - (row.length - 1) / 2) * span, y: ry, th: Math.PI / 2, car: null, goneT: 0 }));
    A.helipad = { x: F.x0 + 14, y: F.y1 - 13, r: 6.5 };
    for (const [x, y] of [[F.x0 + 2.2, F.y0 + 2.2], [F.x1 - 2.2, F.y0 + 2.2], [F.x0 + 2.2, F.y1 - 2.2], [F.x1 - 2.2, F.y1 - 2.2]]) A.towers.push({ x, y });
    // sentries: the gate, the towers, the HQ door, two walking the yard
    const g = A.gate;
    A.posts.push({ x: g.x - 6.6, y: F.y1 - 1.6, th: Math.PI / 2 }, { x: g.x + 6.6, y: F.y1 - 1.6, th: Math.PI / 2 });
    for (const tw of A.towers) A.posts.push({ x: tw.x, y: tw.y, th: Math.atan2(tw.y - (F.y0 + F.y1) / 2, tw.x - cx) });
    A.posts.push({ x: door.x - 3, y: door.y + 1.2, th: Math.PI / 2 }, { x: door.x + 3, y: door.y + 1.2, th: Math.PI / 2 });
    A.posts.push({ x: cx + fw * 0.28, y: F.y1 - 12, th: Math.PI }, { x: F.x0 + 22, y: ry + 6, th: 0 });
    A.booth = { x: g.x - g.w / 2 - 2.2, y: F.y1 - 3.2 };
    A.sandbags = [{ x: g.x - 12, y: F.y1 - 3.4, w: 3.4 }, { x: g.x + 8.5, y: F.y1 - 3.4, w: 3.4 }];
    solid(C, A.booth.x - 1.2, A.booth.y - 1.2, A.booth.x + 1.2, A.booth.y + 1.2, []);
    return A;
  }
  function buildSwat(C, blk, places) {
    clearBlock(C, blk);
    blk.base = true;   // (kind stays 'city': strollers and pickups keep out)
    const F = { x0: blk.x0 + 5, y0: blk.y0 + 5, x1: blk.x1 - 5, y1: blk.y1 - 5 }, fw = F.x1 - F.x0, cx = (F.x0 + F.x1) / 2;
    const W = { blk, F, fences: [], slots: [], posts: [], towers: [], cars: [], soldiers: [], swat: true };
    W.gate = fence(C, F, 12, W.fences);
    const hw = Math.min(36, fw * 0.5) / 2, hq = addBuilding(C, cx - hw, F.y0 + 4, cx + hw, F.y0 + 24, 22, { tint: 6, place: SWAT.id, color: SWAT.color });
    W.hq = hq;
    addBuilding(C, F.x0 + 3, F.y0 + 4, F.x0 + 13, F.y0 + 20, 8, { tint: 1, color: '#2b313b' });   // the garage
    const door = { x: cx, y: hq.y1 + 0.9, nx: 0, ny: 1 };
    places[SWAT.id] = { id: SWAT.id, name: SWAT.name, b: hq, door, color: SWAT.color, gate: W.gate, compound: F };
    const row = ['swat', 'swat', 'swat', 'police', 'swat', 'police'], ry = hq.y1 + 12, span = 4.4;
    row.forEach((m, i) => W.slots.push({ model: m, x: cx + (i - (row.length - 1) / 2) * span, y: ry, th: Math.PI / 2, car: null, goneT: 0 }));
    W.posts.push({ x: door.x - 2.6, y: door.y + 1.1, th: Math.PI / 2 }, { x: door.x + 2.6, y: door.y + 1.1, th: Math.PI / 2 }, { x: W.gate.x + 7.5, y: F.y1 - 1.6, th: Math.PI / 2 });
    return W;
  }
  X.worldHooks.push(function (C, R, places) {
    S.army = S.swat = null;
    const taken = C.buildings.filter(b => b.place && !b.deco);
    const home = places.hideout;
    const ok = C.blocks.filter(b => b.kind === 'city' && b.x1 - b.x0 >= 72 && b.y1 - b.y0 >= 72 && !taken.some(t => inside(t, b)) &&
      !(home && home.door.x > b.x0 - 8 && home.door.x < b.x1 + 8 && home.door.y > b.y0 - 8 && home.door.y < b.y1 + 8));
    if (!ok.length) return;
    const cxm = C.W / 2, cym = C.H / 2, dc = b => Math.hypot((b.x0 + b.x1) / 2 - cxm, (b.y0 + b.y1) / 2 - cym);
    // the army: a big block towards the edge of town (nobody wants a tank range next door)
    const army = ok.slice().sort((a, b) => (dc(b) * 0.6 + (b.x1 - b.x0) * (b.y1 - b.y0) * 0.02 + R() * 40) - (dc(a) * 0.6 + (a.x1 - a.x0) * (a.y1 - a.y0) * 0.02 + R() * 40))[0];
    S.army = buildArmy(C, army, places);
    // SWAT: nearer the middle, well away from the camp
    const far = ok.filter(b => b !== army && Math.hypot((b.x0 + b.x1) / 2 - (army.x0 + army.x1) / 2, (b.y0 + b.y1) / 2 - (army.y0 + army.y1) / 2) > 300);
    const sw = (far.length ? far : ok.filter(b => b !== army)).sort((a, b) => dc(a) + R() * 120 - dc(b) - R() * 120)[0];
    if (sw) S.swat = buildSwat(C, sw, places);
  });

  // ================= the compounds at play time =================
  const inF = (F, x, y, m) => x > F.x0 - (m || 0) && x < F.x1 + (m || 0) && y > F.y0 - (m || 0) && y < F.y1 + (m || 0);
  function spawnSlot(base, s) {
    const c = X.makeCar(s.model, s.x, s.y, s.th, { ctrl: 'parked', owner: base.swat ? 'swathq' : 'armybase', lightsOn: false });
    if (s.model === 'tank') { c.turret = s.th; c.gunCd = 0; }
    if (base.swat && s.model === 'police') c.color = '#f4f4f4';
    c.milBase = base; c.milSlot = s;
    s.car = c; s.goneT = 0;
    return c;
  }
  function soldierAt(base, post) {
    if (!X.police || !X.police.spawnCop) return null;
    const p = X.police.spawnCop(post.x, post.y, base.swat ? 'swat' : 'army', 'guard');
    if (!p) return null;
    p.ai.px = post.x; p.ai.py = post.y; p.ai.th0 = post.th; p.ai.post = base.swat ? SWAT.id : ARMY.id; p.th = post.th;
    p.milBase = base;
    post.ped = p; post.deadT = 0;
    return p;
  }
  function manageBase(base, dt, pos) {
    const F = base.F, d = Math.hypot(pos.x - (F.x0 + F.x1) / 2, pos.y - (F.y0 + F.y1) / 2);
    const near = d < 260;
    // the motor pool: refill a slot once its vehicle is gone (stolen far away, wrecked, despawned) and nobody looks
    for (const s of base.slots) {
      const c = s.car;
      const gone = !c || c.removed || c.wrecked || (c !== P.car && Math.hypot(c.x - s.x, c.y - s.y) > 25);
      if (!gone) continue;
      s.goneT += dt;
      if (c && !c.removed && c !== P.car && c.wrecked && d > 200 && !X.inView(c.x, c.y, 8)) X.removeCar(c);
      if (s.goneT > (c ? 45 : 0) && (!c || d > 180 || !X.inView(s.x, s.y, 8)) && !X.cars.some(o => !o.removed && o !== c && Math.abs(o.x - s.x) < 3 && Math.abs(o.y - s.y) < 4)) {
        if (c && !c.removed && c !== P.car && !c.wrecked) c.milSlot = null;   // that one stays where it was dumped
        spawnSlot(base, s);
      }
    }
    // sentries: on post while the player is around, back after a while once killed
    if (!near || X.scene) return;
    for (const post of base.posts) {
      const p = post.ped;
      if (p && !p.removed && !p.dead) continue;
      post.deadT = (post.deadT || 0) + dt;
      if (p && post.deadT < 90) continue;            // the dead stay dead for a bit
      if (p && (P.wanted || 0) > 0) continue;
      if (p && X.inView(post.x, post.y, 3)) continue;
      soldierAt(base, post);
    }
  }
  // Inside the wire: one warning, then trespass, then the stars climb while you stay.
  function trespass(dt, pos) {
    const A = S.army; if (!A) return;
    const T = A.tr || (A.tr = { in: false, t: 0, warned: false, said: -99, level: 0 });
    const inside = !X.scene && P.state === 'play' && inF(A.F, pos.x, pos.y, -0.2);
    if (!inside) { if (T.in && T.t < 4) T.warned = false; T.in = false; T.t = 0; return; }
    if (!T.in) { T.in = true; T.t = 0; }
    T.t += dt;
    const lvl = P.wanted || 0;
    if (!T.warned) {
      T.warned = true;
      const s = nearestSoldier(A, pos);
      if (s) X.floatText(s.x, s.y - 0.9, pick(LINES.halt), '#c9d98a', { size: 16, life: 2.2 });
      X.popup('Camp Bussby: restricted military area. Leave, or get shot.', 2600);
    }
    if (T.t > 4 && lvl < 2 && X.time - T.said > 3) {
      T.said = X.time;
      X.crime('trespass', pos.x, pos.y, { place: ARMY.id });
      if (X.police) X.police.alert(pos.x, pos.y, Math.max(2, lvl));
      const s = nearestSoldier(A, pos); if (s) X.floatText(s.x, s.y - 0.9, pick(LINES.open), '#c9d98a', { size: 16, life: 2 });
    }
    if (T.t > 20 && X.police) { T.t = 8; X.police.alert(pos.x, pos.y, Math.min(4, (P.wanted || 0) + 1)); }
  }
  function nearestSoldier(base, pos) {
    let best = null, bd = 60;
    for (const post of base.posts) { const p = post.ped; if (!p || p.dead || p.removed) continue; const d = Math.hypot(p.x - pos.x, p.y - pos.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  // Driving off in one of theirs: that is a theft from the armed forces.
  function theft() {
    const c = P.car;
    if (!c || !c.milBase || c.milStolen) return;
    c.milStolen = true;
    const army = !c.milBase.swat;
    if (army) {
      X.crime('stealCopCar', c.x, c.y, { car: c });
      if (X.police) {
        X.police.alert(c.x, c.y, Math.max(c.model.kind === 'tank' ? 4 : 3, P.wanted || 0));
        X.police.radio(pick(LINES.steal).replace('{car}', c.model.name));
      }
      X.big(c.model.name.toUpperCase(), '#c9d98a', 1800, c.model.kind === 'tank' ? 'Mouse aims the turret, fire as usual. Artur will love this.' : 'Property of the Royal Bussby Army. Was.');
    }
    X.emit('militaryTheft', { car: c, base: army ? ARMY.id : SWAT.id });
  }

  // ================= drawing =================
  const SET = () => PG.settings || {};
  function visF(F) { return X.inView((F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, Math.max(F.x1 - F.x0, F.y1 - F.y0) / 2 + 4); }
  function drawGround(ctx) {
    if (X.scene) return;
    for (const base of [S.army, S.swat]) {
      if (!base || !visF(base.F)) continue;
      const F = base.F;
      ctx.fillStyle = base.swat ? '#2e3138' : '#3a3c33'; ctx.fillRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0);
      // the drive from the gate, parking lines
      ctx.fillStyle = base.swat ? '#34373f' : '#44463b'; ctx.fillRect(base.gate.x - base.gate.w / 2, base.slots[0].y + 4, base.gate.w, F.y1 - base.slots[0].y - 4);
      ctx.fillStyle = 'rgba(230,220,170,0.55)';
      const s0 = base.slots[0], span = base.slots.length > 1 ? base.slots[1].x - s0.x : 5;
      for (let i = 0; i <= base.slots.length; i++) ctx.fillRect(s0.x - span / 2 + i * span - 0.06, s0.y - 4.6, 0.12, 9.2);
      ctx.fillStyle = base.swat ? '#c9ccd1' : '#d8c96a';
      ctx.font = '800 1.6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(base.swat ? 'SWAT ONLY' : 'MOTOR POOL', s0.x + span * (base.slots.length - 1) / 2, s0.y + 6.2);
      if (base.helipad) {
        const h = base.helipad;
        ctx.fillStyle = '#4a4c44'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#e9e4d8'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(h.x, h.y, h.r - 0.8, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#e9e4d8'; ctx.font = '900 6px sans-serif'; ctx.fillText('H', h.x, h.y + 0.3);
      }
      if (!base.swat) {   // a painted warning on the drive
        ctx.fillStyle = 'rgba(200,40,30,0.8)'; ctx.font = '800 1.3px sans-serif';
        ctx.fillText('STOP · MILITÆRT OMRÅDE', base.gate.x, F.y1 - 5.5);
      }
    }
  }
  function drawProps(ctx, view, t) {
    if (X.scene) return;
    const sh = SET().shadows !== false;
    for (const base of [S.army, S.swat]) {
      if (!base || !visF(base.F)) continue;
      // fence: posts and chain-link (army: razor wire on top) / a low wall with railings (SWAT)
      for (const f of base.fences) {
        const w = f.x1 - f.x0, h = f.y1 - f.y0, horiz = w > h;
        if (sh) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(f.x0 + 0.2, f.y0 + 0.25, w, h); }
        ctx.fillStyle = base.swat ? '#6b7079' : 'rgba(170,176,170,0.75)'; ctx.fillRect(f.x0, f.y0, w, h);
        ctx.fillStyle = base.swat ? '#8d929b' : '#5c625a';
        const L = horiz ? w : h;
        for (let s = 0; s <= L; s += 3) ctx.fillRect(horiz ? f.x0 + s - 0.12 : f.x0 - 0.06, horiz ? f.y0 - 0.06 : f.y0 + s - 0.12, horiz ? 0.24 : w + 0.12, horiz ? h + 0.12 : 0.24);
        if (!base.swat) {
          ctx.strokeStyle = 'rgba(200,205,200,0.6)'; ctx.lineWidth = 0.05; ctx.beginPath();
          for (let s = 0; s < L; s += 0.5) { const a = s, b = s + 0.25; if (horiz) { ctx.moveTo(f.x0 + a, f.y0 - 0.1); ctx.lineTo(f.x0 + b, f.y1 + 0.1); } else { ctx.moveTo(f.x0 - 0.1, f.y0 + a); ctx.lineTo(f.x1 + 0.1, f.y0 + b); } }
          ctx.stroke();
        }
      }
      const g = base.gate;
      // the boom barrier, up (for now)
      ctx.fillStyle = '#2b2d33'; ctx.fillRect(g.x - g.w / 2 - 0.4, base.F.y1 - 0.6, 0.8, 0.8);
      ctx.save(); ctx.translate(g.x - g.w / 2, base.F.y1 - 0.2); ctx.rotate(-1.25);
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, -0.12, g.w * 0.8, 0.24); ctx.fillStyle = '#d42a2a'; for (let i = 0; i < 6; i += 2) ctx.fillRect(i * g.w * 0.8 / 6, -0.12, g.w * 0.8 / 6, 0.24);
      ctx.restore();
      // the sign at the gate
      const sx = g.x + g.w / 2 + 3.2, sy = base.F.y1 + 0.9;
      ctx.fillStyle = '#2b2d33'; ctx.fillRect(sx - 3, sy - 0.12, 6, 0.24);
      ctx.fillStyle = base.swat ? '#1b1f27' : '#3d4a2c'; ctx.fillRect(sx - 2.9, sy - 0.75, 5.8, 1.2);
      ctx.fillStyle = base.swat ? '#f2cf1d' : '#e9e4d8'; ctx.font = '800 0.55px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(base.swat ? 'SWAT COMMAND · BUSSBY' : 'CAMP BUSSBY', sx, sy - 0.32);
      ctx.font = '700 0.36px sans-serif'; ctx.fillText(base.swat ? 'VISITORS: PLEASE KNOCK. LOUDLY.' : 'ADGANG FORBUDT · NO BUSES', sx, sy + 0.18);
      if (base.booth) {
        const b = base.booth;
        if (sh) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(b.x - 1.1, b.y - 1.0, 2.6, 2.6); }
        ctx.fillStyle = '#5b6545'; ctx.fillRect(b.x - 1.2, b.y - 1.2, 2.4, 2.4); ctx.fillStyle = '#9fc4d8'; ctx.fillRect(b.x - 1.0, b.y + 0.7, 2.0, 0.35);
        ctx.fillStyle = '#3d4a2c'; ctx.fillRect(b.x - 1.3, b.y - 1.3, 2.6, 0.3);
      }
      for (const sb of base.sandbags || []) {
        ctx.fillStyle = '#8a7a52';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(sb.x - sb.w / 2 + 0.35 + i * (sb.w - 0.7) / 4, sb.y, 0.42, 0.3, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#9d8d62'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(sb.x - sb.w / 2 + 0.75 + i * (sb.w - 1.5) / 3, sb.y - 0.35, 0.4, 0.28, 0, 0, TAU); ctx.fill(); }
      }
      for (const tw of base.towers) {   // watchtowers: legs, a deck the sentry stands on, a roof drawn later
        if (sh) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(tw.x - 1.3, tw.y - 1.0, 2.9, 2.9); }
        ctx.fillStyle = '#4d3d2a'; for (const [dx, dy] of [[-1.2, -1.2], [1, -1.2], [-1.2, 1], [1, 1]]) ctx.fillRect(tw.x + dx, tw.y + dy, 0.22, 0.22);
        ctx.fillStyle = '#7a6142'; ctx.fillRect(tw.x - 1.1, tw.y - 1.1, 2.2, 2.2);
        ctx.strokeStyle = '#4d3d2a'; ctx.lineWidth = 0.12; ctx.strokeRect(tw.x - 1.1, tw.y - 1.1, 2.2, 2.2);
      }
      // a flagpole by the HQ door
      const fx = base.hq.x0 + 2, fy = base.hq.y1 + 2.2;
      ctx.fillStyle = '#c9ccd1'; ctx.beginPath(); ctx.arc(fx, fy, 0.18, 0, TAU); ctx.fill();
      const wv = Math.sin(t * 3) * 0.15;
      ctx.fillStyle = '#ba0c2f'; ctx.fillRect(fx, fy - 0.9 + wv, 2.2, 1.6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(fx + 0.6, fy - 0.9 + wv, 0.4, 1.6); ctx.fillRect(fx, fy - 0.3 + wv, 2.2, 0.4);
      ctx.fillStyle = '#00205b'; ctx.fillRect(fx + 0.7, fy - 0.9 + wv, 0.2, 1.6); ctx.fillRect(fx, fy - 0.2 + wv, 2.2, 0.2);
    }
  }
  function drawAir(ctx) {
    if (X.scene || !S.army || !visF(S.army.F)) return;
    for (const tw of S.army.towers) {   // tower roofs (the sentry peeks out from under it)
      ctx.fillStyle = 'rgba(61,74,44,0.82)'; ctx.fillRect(tw.x - 1.5, tw.y - 1.5, 3, 1.2);
      ctx.fillStyle = 'rgba(40,48,30,0.9)'; ctx.fillRect(tw.x - 1.5, tw.y - 1.5, 3, 0.18);
    }
  }
  function lights() {
    if (X.scene || !X.addLight) return;
    for (const base of [S.army, S.swat]) {
      if (!base || !visF(base.F)) continue;
      const F = base.F, cx = (F.x0 + F.x1) / 2, cy = (F.y0 + F.y1) / 2;
      for (const tw of base.towers) {
        const sw = Math.sin(X.time * 0.5 + tw.x) * 0.6, dir = Math.atan2(cy - tw.y, cx - tw.x) + sw;
        X.addLight(tw.x, tw.y, 30, '#f4f8ff', 0.6, { cone: { dir, spread: 0.3 } });
      }
      X.addLight(base.gate.x, base.F.y1 - 1, 12, base.swat ? '#cfe0ff' : '#ffe2a0', 0.7);
      X.addLight(base.hq.x0 + (base.hq.x1 - base.hq.x0) / 2, base.hq.y1 + 1.5, 10, '#ffe2a0', 0.6);
    }
  }

  X.mod('military', {
    order: 37,
    init() {
      for (const base of [S.army, S.swat]) {
        if (!base) continue;
        base.tr = null;
        for (const s of base.slots) { s.car = null; s.goneT = 0; if (!X.cars.some(o => !o.removed && Math.abs(o.x - s.x) < 3 && Math.abs(o.y - s.y) < 4)) spawnSlot(base, s); }
        for (const p of base.posts) { p.ped = null; p.deadT = 0; }
      }
      S.t = 0;
    },
    tick(dt) {
      if (!X.city || !P.ped) return;
      const pos = X.playerPos();
      S.t -= dt;
      if (S.t <= 0) { S.t = 0.5; for (const base of [S.army, S.swat]) if (base) manageBase(base, 0.5, pos); }
      trespass(dt, pos);
      theft();
      lights();
    },
    render: { ground: drawGround, props: drawProps, air: drawAir },
  });
  X.military = {
    get army() { return S.army; },
    get swat() { return S.swat; },
    soldiers: () => [S.army, S.swat].filter(Boolean).flatMap(b => b.posts.map(p => p.ped).filter(p => p && !p.dead && !p.removed)),
    vehicles: () => [S.army, S.swat].filter(Boolean).flatMap(b => b.slots.map(s => s.car).filter(c => c && !c.removed)),
    inBase: (x, y) => !!S.army && inF(S.army.F, x, y, 0),
  };

  // ================= interiors =================
  if (!X.interiors || !X.interiors.define) return;
  const D = X.interiors.define;
  const greenLook = (o) => (base) => Object.assign({ outfit: 'army', shirt: '#4d5b34', pants: '#3b4729', hat: '#3f4b2b', hatType: 'helmet', hairStyle: 'buzz', jacket: null, tie: null, acc: null }, o || {});
  const looks = {
    soldier: greenLook(),
    sleeper: greenLook({ hat: null, hatType: null, shirt: '#6b7350' }),
    colonel: greenLook({ shirt: '#55603e', hat: '#2f3a22', hatType: 'cap', scale: 1.12, hair: '#8a8a8a' }),
    quartermaster: greenLook({ shirt: '#6b6f4a', hat: '#3f4b2b', hatType: 'beanie', scale: 1.18 }),
    swat: () => ({ outfit: 'swat', shirt: '#262a31', pants: '#1b1e24', hat: '#0b0d10', hatType: 'helmet', jacket: null, tie: null, acc: null, scale: rand(1.02, 1.1) }),
    swatchief: () => ({ outfit: 'cop', shirt: '#1b1f27', pants: '#1b1f27', hat: '#0b0d10', hatType: 'police', jacket: null, tie: null, scale: 1.1 }),
  };
  const furn = {
    bunk(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit;
      K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#4a4f3a'); K.rect(c, -hw + 0.07, -hh + 0.07, 2 * hw - 0.14, 2 * hh - 0.14, '#6b7350');
      K.rect(c, -hw + 0.12, -hh + 0.12, 2 * hw - 0.24, 0.45, '#e9e4d8');
      K.rect(c, -hw + 0.07, -hh + 0.75, 2 * hw - 0.14, 0.06, '#3b4229');
      K.rect(c, -hw, -hh, 0.08, 2 * hh, '#2b2d33'); K.rect(c, hw - 0.08, -hh, 0.08, 2 * hh, '#2b2d33');
    },
    warmap(c, f, hw, hh, t) {   // the briefing table: a map of Bussby with arrows, and a toy bus
      const K = X.interiors.kit;
      K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#4a3523'); K.rect(c, -hw + 0.15, -hh + 0.15, 2 * hw - 0.3, 2 * hh - 0.3, '#c9c39a');
      c.strokeStyle = '#8a8466'; c.lineWidth = 0.05; c.beginPath();
      for (let x = -hw + 0.6; x < hw - 0.2; x += 0.7) { c.moveTo(x, -hh + 0.15); c.lineTo(x, hh - 0.15); }
      for (let y = -hh + 0.6; y < hh - 0.2; y += 0.7) { c.moveTo(-hw + 0.15, y); c.lineTo(hw - 0.15, y); }
      c.stroke();
      K.rect(c, -hw + 0.4, -0.25, hw * 0.6, 0.5, '#6f9bc0');   // the fjord
      K.ln(c, -hw * 0.5, hh * 0.5, hw * 0.3, -hh * 0.2, '#c0392b', 0.09); K.ln(c, hw * 0.3, -hh * 0.2, hw * 0.15, -hh * 0.05, '#c0392b', 0.09); K.ln(c, hw * 0.3, -hh * 0.2, hw * 0.2, -hh * 0.4, '#c0392b', 0.09);
      K.rect(c, hw * 0.42, hh * 0.15, 0.55, 0.22, '#d9381e'); K.wtext(c, 'ARTUR?', hw * 0.55, -hh * 0.45, 0.22, '#c0392b', 800);
      for (const [x, y, col] of [[-0.8, 0.5, '#3d4a2c'], [0.4, -0.6, '#3d4a2c'], [1.2, 0.4, '#1d4fb8']]) K.disc(c, x, y, 0.12, col);
    },
    armyflag(c, f, hw, hh) { const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#ba0c2f'); K.rect(c, -hw * 0.45, -hh, hw * 0.4, 2 * hh, '#fff'); K.rect(c, -hw, -hh * 0.2, 2 * hw, hh * 0.4, '#fff'); K.rect(c, -hw * 0.38, -hh, hw * 0.22, 2 * hh, '#00205b'); K.rect(c, -hw, -hh * 0.1, 2 * hw, hh * 0.2, '#00205b'); },
    lane(c, f, hw, hh) { const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5a4a32'); K.rect(c, -hw, -hh, 2 * hw, 0.08, '#ffd23a'); },
  };
  function talk(sc, role, lines, col) {
    const K = X.interiors.kit;
    const p = sc.peds.find(q => K.mine(q) && !q.dead && q.ai.role === role && (!q.ai.sp || q.ai.sp.talk));
    if (!p) { X.popup('Nobody here wants to talk'); return; }
    K.say(p, pick(lines), col || '#ffd23a');
  }
  // Grab a gun off the rack: free, but everybody in the room notices.
  function grab(sc, id, ammo, label) {
    const K = X.interiors.kit;
    const st = sc.st.racks || (sc.st.racks = {});
    if (st[id] && X.time - st[id] < 120) { X.popup('That rack is empty now'); return; }
    if (X.giveWeapon) { if (!X.giveWeapon(id, ammo)) { X.popup('You can not carry any more'); return; } }
    else { P.inv[id] = (P.inv[id] || 0) + ammo; }
    st[id] = X.time;
    X.popup('Took: ' + label);
    K.sfx('crate');
    K.crime('robbery', X.focus().x, X.focus().y, { place: sc.type });
    K.alarm(sc);
  }
  function hostileWhenWanted(sc, min) {
    const K = X.interiors.kit;
    if ((P.wanted || 0) < min || P.state !== 'play') return;
    for (const q of sc.peds) if (K.mine(q) && !q.dead && q.ai.armed && q.ai.st !== 'fight') K.provoke(sc, q);
  }

  D(ARMY.id, {
    place: true, size: [36, 28], names: [ARMY.name],
    greet: ['CAMP BUSSBY HQ. WIPE YOUR BOOTS.', 'ARE YOU THE NEW RECRUIT? YOU LOOK LIKE A RECRUIT.', 'STATE YOUR BUSINESS. AND YOUR SHOE SIZE.'],
    style: { door: '#3d4a2c', frame: '#2b2f22', plate: '#3d4a2c', text: '#e9e4d8', light: '#ffe2a0' },
    looks, furn,
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 28, ambient: 0.75, wallTop: '#4a5236', wallLo: '#2b301f', wallHi: '#7a8460' });
      b.room(0, 20, 36, 28, 'concrete', '#6a6b5f', '#5a5b50');
      b.room(0, 0, 14, 20, 'wood', '#6e5a3c', '#5a4830');
      b.room(14, 0, 24, 20, 'lino', '#7d846a', '#6a7158');
      b.room(24, 0, 36, 20, 'concrete', '#55574e', '#46483f');
      b.box(); b.entrance(18, 2.6);
      b.hwall(20, 0.25, 35.75, [[6, 2.2], [19, 2.4], [30, 2.2]]);
      b.vwall(14, 0.5, 19.75, []); b.vwall(24, 0.5, 19.75, []);
      // lobby: the flag, the quartermaster's counter with stands to buy from, sentries
      b.f('armyflag', 6, 27.6, 2.6, 0.3, { layer: 2 });
      b.f('sign', 12, 20.45, 7, 0.45, { text: 'DAYS WITHOUT A TANK IN THE CANTEEN: 2', c: '#e9e4d8', bg: '#3d4a2c', size: 0.24, layer: 2 });
      b.f('counter', 30, 22.4, 10.5, 1.2, { solid: 'low', c: '#3d4a2c', top: '#8a8466' });
      b.ped('owner', 30, 21.2, Math.PI / 2, { look: 'quartermaster', weapon: 'rifle', hp: 180, armor: 50 });
      b.f('sign', 30, 27.55, 9, 0.42, { text: 'QUARTERMASTER · ARMY SURPLUS · NO QUESTIONS', c: '#1b1b1f', bg: '#d8c96a', size: 0.22, layer: 2 });
      ['rifle', 'grenade', 'rocket', 'flamer', 'armor'].forEach((it, i) => b.pad(25 + i * 2.5, 25, it));
      b.ped('guard', 13.5, 25.5, -Math.PI / 2, { look: 'soldier', weapon: 'rifle', hp: 150, armor: 60 });
      b.ped('guard', 22.5, 25.5, -Math.PI / 2, { look: 'soldier', weapon: 'rifle', hp: 150, armor: 60 });
      b.f('bench', 1.2, 24, 0.8, 5, { solid: 'low', c: '#4a5236', back: 'w' });
      b.ped('sitter', 1.6, 23, 0, { look: 'soldier', chance: 0.6 });
      // barracks: bunks in rows, lockers, somebody snoring
      for (let i = 0; i < 4; i++) for (const x of [2.2, 11.8]) b.f('bunk', x, 2.6 + i * 4.2, 2.2, 3, { solid: 'low' });
      b.f('locker', 7, 0.95, 6, 0.9, { solid: 'tall' });
      b.ped('sitter', 2.2, 3.3, Math.PI / 2, { look: 'sleeper', pose: 'lie' }); b.ped('sitter', 11.8, 11.7, Math.PI / 2, { look: 'sleeper', pose: 'lie', chance: 0.7 });
      b.ped('sitter', 11.8, 7.5, Math.PI / 2, { look: 'sleeper', pose: 'lie', chance: 0.5 });
      b.ped('guard', 7, 10, Math.PI / 2, { look: 'soldier', weapon: 'rifle', hp: 150, armor: 60, patrol: [[7, 4], [7, 17]] });
      b.f('sign', 7, 19.55, 5, 0.4, { text: 'LIGHTS OUT 22:00. SNORING BY PERMIT.', c: '#e9e4d8', bg: '#3d4a2c', size: 0.2, layer: 2 });
      // briefing room: the war table, chairs, the colonel
      b.f('warmap', 19, 9, 6.5, 4.2, { solid: 'low' });
      for (const y of [6.3, 11.7]) for (const x of [16.5, 19, 21.5]) b.f('chair', x, y, 0.6, 0.6, { rot: y < 9 ? Math.PI / 2 : -Math.PI / 2 });
      b.ped('sitter', 16.5, 11.7, -Math.PI / 2, { look: 'soldier', chance: 0.7 }); b.ped('sitter', 21.5, 6.3, Math.PI / 2, { look: 'soldier', chance: 0.6 });
      b.f('whiteboard', 19, 0.6, 6, 0.3, { plan: 1, layer: 2 });
      b.ped('guard', 19, 3.2, Math.PI / 2, { look: 'colonel', weapon: 'pistol', hp: 220, armor: 80, talk: true });
      b.act(19, 4.6, 1.8, () => 'F: Talk to Oberst Brekke', () => talk(sc, 'guard', [
        'OPERATION GREY BUS IS A GO. NOBODY TELL ARTUR.',
        'THE TANK IS NOT FOR SALE. STOP ASKING.',
        'WE LOST A JEEP LAST WEEK. IT WAS IN THE FJORD. AGAIN.',
        'YOU HAVE THE POSTURE OF A PARKING METER. I LIKE IT.',
        'IN 1987 I DROVE AN APC THROUGH A DRIVE-THROUGH. THEY STILL HAD MY ORDER.',
        'IF YOU TOUCH THE ARMOURY I WILL HAVE YOU PEELING POTATOES. WITH A BAYONET.',
      ], '#c9d98a'));
      // armoury: racks you can help yourself to (they will mind), crates, staff only
      b.f('gunrack', 30, 0.95, 11, 0.9, { solid: 'tall' });
      b.f('gunrack', 35.05, 8, 0.9, 8, { solid: 'tall', rot: 0 });
      b.f('crate', 26, 9, 1.5, 1.5, { solid: 'tall', text: 'AMMO' }); b.f('crate', 26, 11, 1.5, 1.5, { solid: 'tall', text: 'TNT' }); b.f('crate', 28, 17.5, 1.4, 1.4, { solid: 'low', text: 'LEFSE' });
      b.f('crates', 33, 16.5, 2.6, 2.6, { solid: 'tall' });
      b.ped('guard', 30, 12, -Math.PI / 2, { look: 'soldier', weapon: 'rifle', hp: 160, armor: 80 });
      b.zone(24.5, 0.5, 35.5, 19.5);
      b.act(28, 2.4, 1.6, () => 'F: Take a machine gun off the rack', () => grab(sc, 'rifle', 120, 'Machine Gun'));
      b.act(32.5, 2.4, 1.6, () => 'F: Take a rocket launcher', () => grab(sc, 'rocket', 6, 'Rocket Launcher'));
      b.act(33.6, 8, 1.6, () => 'F: Take a box of grenades', () => grab(sc, 'grenade', 10, 'Grenades'));
      b.light(18, 24, 10, '#f4f8ff', 0.8, { fix: 'tube' }); b.light(7, 9, 9, '#ffe6b0', 0.55, { fix: 'bulb' }); b.light(19, 9, 8, '#fff0d0', 0.85, { fix: 'lamp' }); b.light(30, 9, 9, '#f4f8ff', 0.75, { fix: 'tube', flick: 1 });
      b.win(3, 27.5, 9, 28); b.win(27, 27.5, 33, 28);
      b.browse(18, 24, -Math.PI / 2); b.browse(27, 25.5, -Math.PI / 2);
    },
    tick(sc, dt, t, K) { hostileWhenWanted(sc, 2); },
  });

  D(SWAT.id, {
    place: true, size: [34, 26], names: [SWAT.name],
    greet: ['SWAT COMMAND. DID YOU KNOCK? WE HEARD NOTHING.', 'NO CIVILIANS PAST THE DESK. OR AT THE DESK.', 'IF THIS IS ABOUT THE DOOR WE BREACHED: IT WAS THE WRONG FLAT.'],
    style: { door: '#1b1f27', frame: '#4a4f58', plate: '#1b1f27', text: '#f2cf1d', light: '#cfe0ff' },
    looks, furn,
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 27, ambient: 0.75, wallTop: '#2b313b', wallLo: '#171b21', wallHi: '#56606e' });
      b.room(0, 18, 34, 26, 'lino', '#7c828c', '#696f78');
      b.room(0, 0, 12, 18, 'lino', '#6a7180', '#5a6070');
      b.room(12, 0, 21, 18, 'concrete', '#4f5258', '#43464b');
      b.room(21, 0, 34, 18, 'concrete', '#5a5850', '#4a4840');
      b.box(); b.entrance(17, 2.6);
      b.hwall(18, 0.25, 33.75, [[6, 2.2], [16.5, 2.2], [27.5, 2.4]]);
      b.vwall(12, 0.5, 17.75, []); b.vwall(21, 0.5, 17.75, []);
      // lobby: front desk, a trophy wall of doors they kicked in
      b.f('counter', 17, 20.3, 9, 1.2, { solid: 'low', c: '#1b1f27', top: '#9aa0a8' });
      b.f('monitor', 15.5, 20.0, 0.7, 0.5); b.f('monitor', 18.5, 20.0, 0.7, 0.5);
      b.ped('sergeant', 17, 19.1, Math.PI / 2, { look: 'swatchief', weapon: 'pistol', hp: 160, armor: 60 });
      b.f('emblem', 17, 23, 3.6, 3.6, { kind: 'badge', layer: 0 });
      for (let i = 0; i < 4; i++) b.f('door', 2.5 + i * 2.2, 25.6, 1.8, 0.25, { layer: 2 });
      b.f('sign', 6, 25.0, 9, 0.4, { text: 'DOORS WE HAVE MET', c: '#f2cf1d', bg: '#1b1f27', size: 0.26, layer: 2 });
      b.f('bench', 32.8, 22, 0.8, 5, { solid: 'low', c: '#2f4f8a', back: 'e' });
      b.ped('cop', 24, 22.5, Math.PI, { look: 'swat', weapon: 'rifle', hp: 150, armor: 100, patrol: [[24, 22.5], [10, 22.5]] });
      // briefing: rows of chairs, the whiteboard, the chief
      b.f('whiteboard', 6, 0.6, 6, 0.3, { plan: 1, layer: 2 });
      for (const y of [5, 7.5, 10]) for (const x of [3, 5, 7, 9]) b.f('chair', x, y, 0.6, 0.6, { rot: -Math.PI / 2 });
      b.ped('sitter', 3, 5, -Math.PI / 2, { look: 'swat', chance: 0.8 }); b.ped('sitter', 7, 7.5, -Math.PI / 2, { look: 'swat', chance: 0.7 }); b.ped('sitter', 9, 10, -Math.PI / 2, { look: 'swat', chance: 0.5 });
      b.ped('cop', 6, 2.4, Math.PI / 2, { look: 'swatchief', weapon: 'shotgun', hp: 200, armor: 100, talk: true });
      b.act(6, 3.8, 1.8, () => 'F: Listen to the briefing', () => talk(sc, 'cop', [
        'TARGET: A MAN WHO DRIVES A BUS. FAST. SIDEWAYS.',
        'SVEN, YOU ARE ON DOOR DUTY. NO, NOT KICKING IT. OPENING IT.',
        'REMEMBER: WE ARE THE CALM ONES. NOW SCREAM "CALM" WITH ME.',
        'IF YOU SEE ARTUR, SMILE AND WAVE. THEN CALL ME. THEN STOP SMILING.',
        'THE HELICOPTER IS STILL IN THE CAR WASH. WE GO BY VAN.',
      ], '#9cc4ff'));
      // armoury: lockers, racks, vests (staff only)
      b.f('gunrack', 16.5, 0.95, 8, 0.9, { solid: 'tall' });
      b.f('locker', 20.05, 9, 0.9, 8, { solid: 'tall' });
      b.f('crate', 13.6, 15.8, 1.4, 1.4, { solid: 'low', text: 'AMMO' }); b.f('crate', 15.4, 15.8, 1.4, 1.4, { solid: 'low', text: 'FLASH' });
      b.ped('cop', 16.5, 8, Math.PI / 2, { look: 'swat', weapon: 'uzi', hp: 150, armor: 100 });
      b.zone(12.5, 0.5, 20.5, 17.5);
      b.act(16.5, 2.4, 1.6, () => 'F: Borrow an SMG', () => grab(sc, 'uzi', 120, 'Uzi'));
      b.act(18.8, 9, 1.6, () => (P.ped.armor >= 100 ? null : 'F: Borrow a SWAT vest'), () => { P.ped.armor = 100; X.popup('Armour: borrowed. Indefinitely.'); K.crime('robbery', X.focus().x, X.focus().y, { place: sc.type }); K.alarm(sc); });
      // shooting range: lanes, targets, a booth
      for (let i = 0; i < 4; i++) { const y = 2.5 + i * 3.6; b.f('lane', 27.5, y, 12, 0.12, { layer: 0 }); b.f('target', 33.4, y + 1.6, 0.3, 1.4, { layer: 2 }); }
      for (let i = 0; i <= 4; i++) b.f('partition', 23, 0.75 + i * 3.6, 1.6, 0.18, { solid: 'low' });
      b.ped('cop', 22.6, 9.8, 0, { look: 'swat', weapon: 'rifle', hp: 150, armor: 100 });
      b.f('sign', 27.5, 17.55, 9, 0.4, { text: 'RANGE: POINT THE LOUD END AWAY FROM SVEN', c: '#1b1b1f', bg: '#f2cf1d', size: 0.22, layer: 2 });
      b.act(24.2, 6.1, 1.4, () => 'F: Shoot a round on the range ($20)', () => {
        if (P.money < 20) { X.popup('The range costs $20'); return; }
        X.money(-20, 'shop', P.ped.x, P.ped.y);
        const score = Math.floor(rand(12, 100));
        X.big(score + ' / 100', score > 80 ? '#7dff9a' : '#ffd23a', 1600, score > 80 ? 'They want you on the team. You decline. Politely.' : score < 30 ? 'You hit the ceiling. Twice.' : 'Not bad for a bus driver.');
        if (score > 80) X.money(50, 'prize', P.ped.x, P.ped.y);
        K.sfx('crate');
      });
      b.light(17, 22, 10, '#eef4ff', 0.85, { fix: 'panel' }); b.light(6, 8, 8, '#eef4ff', 0.75, { fix: 'panel' }); b.light(16.5, 8, 7, '#eef4ff', 0.7, { fix: 'tube' }); b.light(28, 9, 9, '#fff6d8', 0.75, { fix: 'tube' });
      b.win(2, 25.5, 9, 26); b.win(25, 25.5, 32, 26);
      b.browse(17, 22, -Math.PI / 2);
    },
    tick(sc, dt, t, K) { hostileWhenWanted(sc, 2); },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
