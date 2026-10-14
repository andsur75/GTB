// Vehicle side jobs for Grand Theft Bus. Sit in the right vehicle and press G: Taxi Driver (fares wave from
// the kerb, hop in, name a destination and a deadline, tip for speed, pay streak bonuses, and complain, bail
// out or jump out of a burning cab), Take the Bus! (a numbered route of shelters along the street: pull into
// the bus box, the doors hiss open, people get off at their stop and queue on, fares and a timetable bonus),
// Paramedic (casualties lying on the pavement get up and limp aboard, then a race to St. Bussby with a
// beeping heart monitor), Firefighter (car fires across town and a roof-mounted water cannon on the fire
// button that also bowls people over) and Vigilante (in a police car: a fleeing criminal car to wreck or box
// in; the level rises, crooks shoot back, and every takedown cleans your record a little). A taxi, a bus,
// an ambulance and a fire truck wait in painted bays near Trond's Garage at the start, with another
// ambulance at the hospital and a fire truck downtown. Owns X.jobs.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ================= tuning (tests poke these) =================
  const TUNE = {
    fareR: [45, 150], destR: [220, 640], taxiPace: 9.5, taxiSlack: 16, taxiBase: 15, taxiPerM: 0.11, streakEvery: 5, streakBonus: 100,
    pickR: 10, dropR: 8, slow: 1.5,
    busStops: 6, busFare: 10, busCap: 24, busDwell: 2, busOnTime: 25, busRoute: 120,
    medCap: 3, medMax: 6, medR: [70, 380], medPay: 80,
    fireR: [110, 330], fireFuse: 50, firePay: 90, fireNeed: 1.5, jetLen: 15,
    vigR: [110, 260], vigTime: 80, vigPay: 150, vigEscape: 480,
  };
  const KIND_JOB = { taxi: 'taxi', bus: 'bus', ambulance: 'medic', fire: 'fire', police: 'vigil', swat: 'vigil' };
  const jobOf = c => (c && !c.wrecked && !c.removed && KIND_JOB[c.model.kind]) || null;

  // ================= lines =================
  const LINES = {
    hail: {
      walker: ['{dest}, please.', 'To {dest}. No scenic route.', '{dest}. And turn that radio down.', 'Take me to {dest}. I trust you. Mostly.'],
      business: ['{dest}. I am late for a meeting about meetings.', '{dest}, fast. Time is money and you are costing me both.', '{dest}. It is on expenses, so drive like it.'],
      tourist: ['Is this a real taxi? {dest}, please!', '{dest}! I read about it in a brochure.', 'Take me to {dest}. Is it far? Is that a moose?'],
      old: ['{dest}, dear. Mind the bumps.', 'In my day the taxis were horses. {dest}, please.', '{dest}. Slowly. I have a new hip.'],
      drunk: ['{dest}... or my mum\'s. Whichever. Hic.', 'To {dest}! Make it go WHEEE.', '{dest}. I love you, taxi man.'],
      shopper: ['{dest}, and careful with my bags.', '{dest}. I bought a lamp. Do not ask.', '{dest}. The sale ends in ten minutes!'],
    },
    crash: ['Easy!', 'Are you trying to kill me?', 'I want to arrive in ONE piece!', 'My neck! I am calling a lawyer.', 'Did they sell you that licence at a kiosk?', 'FOR THE SAFETY OF US ALL, TAKE THE BUS!', 'I can see my life flashing. It is mostly parking.'],
    cheer: ['WHEEE!', 'Again! AGAIN!', 'Best. Taxi. EVER.', 'I am going to be sick. Do it again.', 'Hit the next one too!'],
    bail: ['That\'s it, I\'m walking!', 'Let me OUT!', 'I will take the bus. It is safer.', 'This is not a taxi, it is a crime scene.', 'Stop the car! I want my mum!'],
    fire: ['Your taxi is ON FIRE!', 'Is it supposed to smoke like that?!', 'Nope. Nope. Nope.'],
    late: ['Forget it, I will take the bus!', 'I could have walked faster. On my hands.', 'Too slow. I am getting out.'],
    cops: ['Not with the cops on your tail!', 'I am not doing time for a taxi ride!', 'Is that a police chase? I will wait for the next cab.'],
    paidFast: ['Keep the change!', 'Five stars!', 'Fastest ride of my life. Possibly the last.', 'You should drive for the rally team.'],
    paidSlow: ['Took you long enough.', 'No tip. You know why.', 'I aged a year in there.'],
    board: ['Is this the 37? I have been waiting since 2019.', 'Does this bus go to the airport? There is no airport.', 'Can I pay in brunost?', 'Driver, you smell like a getaway car.', 'Two adults and a moose, please.', 'Is it true the driver stole this bus?', 'I only take the bus ironically.', 'Finally. I almost had to walk.'],
    bump: ['My coffee!', 'Some of us are STANDING!', 'This is why I do not drive.', 'Was that a pedestrian?', 'Ow, my everything!', 'I am writing to the council.'],
    full: ['Bus full! Next one is in a week.', 'No room! Try the roof.'],
    patient: ['Careful! Patient on board!', 'Mind the potholes, he is held together with tape!', 'He was stable until you did that.', 'Bumps hurt, you know!'],
    saved: ['Patient admitted. Nurse says hi.', 'Alive! Mostly.', 'Saved. Bill is in the post.'],
    lost: ['We lost one.', 'Flatline. Sorry, buddy.', 'That one did not make it.'],
    firstAid: ['I can walk, I can walk!', 'Took you long enough.', 'Is that an ambulance or a getaway van?'],
  };
  const FARE_TYPES = [
    { id: 'walker', w: 30, pay: 1, time: 1, temper: 1 },
    { id: 'business', w: 14, pay: 1.45, time: 0.82, temper: 1.3 },
    { id: 'tourist', w: 12, pay: 1.25, time: 1.15, temper: 0.7 },
    { id: 'old', w: 10, pay: 0.9, time: 1.3, temper: 1.8 },
    { id: 'drunk', w: 9, pay: 1.1, time: 1.2, temper: -1 },
    { id: 'shopper', w: 10, pay: 1, time: 1, temper: 1.1 },
  ];
  const STREETS_H = ['Storgata', 'Kongens gate', 'Fjordgata', 'Bussgata', 'Torggata', 'Brugata', 'Dronningens gate', 'Kirkegata', 'Havnegata', 'Pølsegata', 'Elggata', 'Neongata', 'Smoggata', 'Tollgata'];
  const STREETS_V = ['Trondveien', 'Parkveien', 'Kioskveien', 'Brunostbakken', 'Fiskeveien', 'Skiveien', 'Lutefisk allé', 'Vaffelveien', 'Rådhusveien', 'Trollstien', 'Fjellveien', 'Bakkeveien', 'Moloveien', 'Kanalveien'];
  const STOP_NAMES = ['Pølsebua', 'Kiosken', 'Brunost Bakke', 'Elgkrysset', 'Rådhuset', 'Torget', 'Fjordkanten', 'Smog Hill Øst', 'Parkeringshuset', 'Kirkebakken', 'Vaffelhjørnet', 'Skolen', 'Gamle Brygge', 'Tollboden', 'Bingohallen', 'Svømmehallen', 'Bussby Stasjon', 'Trollbroa', 'Sentrum', 'Kebabsjappa', 'Bakeriet', 'Biblioteket'];
  const streetName = r => (r.h ? STREETS_H : STREETS_V)[r.idx % 14];
  const BAYC = { taxi: '#ffd23a', bus: '#ff8a3a', ambulance: '#ff5a5a', firetruck: '#ff5a2a', police: '#5aa9ff' };
  function pickW(list) { let tot = 0; for (const o of list) tot += o.w; let r = Math.random() * tot; for (const o of list) if ((r -= o.w) <= 0) return o; return list[0]; }

  // ================= state =================
  let S = null;
  const NW = 480;   // water drops: a fixed pool
  function fresh() {
    return {
      t: 0, job: null, mine: [], fleet: [], bays: [], ownFires: [], toastT: -9, objT: -1, hasPeds: X.has('peds'),
      aim: null, jet: { on: false, x0: 0, y0: 0, x1: 0, y1: 0, ux: 1, uy: 0, len: 0 }, hissT: 0, wetT: 0, douseT: 0, sirenT: 0, sirenHi: false, beepT: 0,
      wx: new Float32Array(NW), wy: new Float32Array(NW), wvx: new Float32Array(NW), wvy: new Float32Array(NW), wl: new Float32Array(NW), wi: 0,
    };
  }
  const rec = () => { const s = X.save; if (!s) return {}; if (!s.jobs) s.jobs = {}; return s.jobs; };
  function canWork() { return P.state === 'play' && !X.scene && !(X.missions && X.missions.active); }
  const bombWaiting = () => X.cars.some(c => c.bombed && !c.removed && !c.wrecked);

  // ================= road geometry =================
  // A road is {h, idx}: horizontal roads run along y = ys[idx], vertical ones along x = xs[idx]. Traffic keeps right.
  const roadC = r => r.h ? X.city.ys[r.idx] : X.city.xs[r.idx];
  const roadHW = r => (r.h ? X.city.wy[r.idx] : X.city.wx[r.idx]) / 2;
  function rpt(r, a, s, o) { const c = roadC(r) + s * o; return r.h ? { x: a, y: c } : { x: c, y: a }; }
  function clearOfJunctions(r, a, m) {
    const C = X.city, cs = r.h ? C.xs : C.ys, ws = r.h ? C.wx : C.wy;
    for (let k = 0; k < cs.length; k++) if (Math.abs(a - cs[k]) < ws[k] / 2 + m) return false;
    return true;
  }
  const sideTh = (r, s) => r.h ? (s > 0 ? 0 : Math.PI) : (s > 0 ? -Math.PI / 2 : Math.PI / 2);
  // A kerb spot on road r at `a` along it, side s: (x, y) on the sidewalk `inset` m from the kerb, (rx, ry) the kerb
  // lane in front of it, th the way traffic flows on that side, (nx, ny) pointing from the sidewalk to the road.
  function kerb(r, a, s, inset) {
    const hw = roadHW(r), p = rpt(r, a, s, hw + (inset == null ? 1.1 : inset)), q = rpt(r, a, s, hw - 2.0);
    return { x: p.x, y: p.y, rx: q.x, ry: q.y, nx: r.h ? 0 : -s, ny: r.h ? -s : 0, th: sideTh(r, s), r, a, s };
  }
  function kerbOK(k, clear) {
    const C = X.city;
    if (k.x < 8 || k.y < 8 || k.x > C.W - 8 || k.y > C.H - 8) return false;
    if (!X.blockAt(k.x, k.y) || X.blocked(k.x, k.y, clear || 0.6)) return false;
    for (const id in X.places) { const pl = X.places[id]; if (pl.pad && Math.abs(pl.pad.x - k.x) < pl.pad.w / 2 + 7 && Math.abs(pl.pad.y - k.y) < pl.pad.h / 2 + 7) return false; }
    return true;
  }
  // A random kerb spot rMin..rMax from (x, y). o: {hx, hy (preferred direction), inset, clear, margin, hidden, tries, test}
  function randomKerb(x, y, rMin, rMax, o) {
    o = o || {};
    const C = X.city;
    let best = null, bs = -Infinity;
    for (let tries = 0; tries < (o.tries || 40); tries++) {
      const h = Math.random() < 0.5, arr = h ? C.ys : C.xs, idx = Math.floor(Math.random() * arr.length);
      if (Math.abs(arr[idx] - (h ? y : x)) > rMax) continue;
      const r = { h, idx }, a = (h ? x : y) + rand(-rMax, rMax);
      if (!clearOfJunctions(r, a, o.margin || 9)) continue;
      const k = kerb(r, a, Math.random() < 0.5 ? 1 : -1, o.inset);
      const d = Math.hypot(k.x - x, k.y - y);
      if (d < rMin || d > rMax || !kerbOK(k, o.clear) || (o.test && !o.test(k))) continue;
      let sc = Math.random() * 30;
      if (o.hx != null) sc += ((k.x - x) * o.hx + (k.y - y) * o.hy) / d * 40;
      if (o.hidden && X.inView(k.x, k.y, 6)) sc -= 80;
      if (sc > bs) { bs = sc; best = k; }
    }
    return best;
  }
  // The road in front of a door: walk out along the door normal until the tarmac.
  function doorKerb(door, inset) {
    for (let s = 1; s < 15; s += 0.5) {
      const x = door.x + door.nx * s, y = door.y + door.ny * s, rd = X.roadAt(x, y);
      if (!rd || rd.junction) continue;
      const r = { h: rd.horiz, idx: rd.idx }, side = Math.sign((r.h ? door.y : door.x) - roadC(r)) || 1;
      return kerb(r, r.h ? door.x : door.y, side, inset == null ? 1.1 : inset);
    }
    return null;
  }
  function routeLen(x0, y0, x1, y1) {
    const pts = X.route(x0, y0, x1, y1); let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return Math.max(L, Math.hypot(x1 - x0, y1 - y0));
  }
  const fwdOf = c => ({ x: Math.cos(c.th), y: Math.sin(c.th) });
  // A point on a car in its own frame: u forward, v to the right.
  function carPt(c, u, v) { const fx = Math.cos(c.th), fy = Math.sin(c.th); return { x: c.x + fx * u - fy * v, y: c.y + fy * u + fx * v }; }

  // Spots other modules have painted or claimed: the shops' garage bay, Trond's delivery zone, payphones.
  function reserved(x, y, r) {
    const sg = X.shops && X.shops.garage;
    if (sg && sg.c && Math.hypot(sg.c.x - x, sg.c.y - y) < r + 6) return true;
    const M = X.missions, mg = M && M.garage;
    if (mg && (Math.hypot(mg.x - x, mg.y - y) < r + 5 || (mg.zone && Math.hypot(mg.zone.x - x, mg.zone.y - y) < r + (mg.zone.r || 4) + 1))) return true;
    const ph = M && M.phones;
    if (ph) for (const q of ph) if (Math.abs(q.x - x) < r + 2 && Math.abs(q.y - y) < r + 2) return true;
    return false;
  }
  // A bus stop's patch of kerb: the box in the kerb lane plus the pavement up to the shelter's back wall.
  function inStopZone(st, x, y, pad) {
    const dx = x - st.x, dy = y - st.y, u = dx * st.tx + dy * st.ty, v = -(dx * st.nx + dy * st.ny);   // v: metres from the shelter centre away from the road
    return Math.abs(u) < 8.5 + pad && v > -6.5 - pad && v < 1.2 + pad;
  }
  const stopsOf = () => { const J = S && S.job; return J && J.id === 'bus' && J.d.stops ? J.d.stops : null; };

  // ================= parking (the job fleet, fire victims) =================
  // Kerbside slots in core's convention: the centre 0.55 m past the kerb line, facing the traffic on that side.
  function slotOK(def, q) {
    const C = X.city, L = def.len, W = def.wid, x = q.x, y = q.y;
    if (x < 12 || y < 12 || x > C.W - 12 || y > C.H - 12) return false;
    const sb = rpt(q.r, q.a, q.s, roadHW(q.r) + 2.5); if (!X.blockAt(sb.x, sb.y)) return false;   // a sidewalk behind it, not the city wall
    const poly = PG.obb(x, y, L + 0.8, W + 0.2, q.th);
    for (const s of PG.cityNear(C, x, y, L)) if (PG.overlap(poly, s.poly)) return false;
    for (const o of X.cars) if (!o.removed && Math.abs(o.x - x) < 16 && Math.abs(o.y - y) < 16 && PG.overlap(poly, X.carPoly(o))) return false;
    const fx = Math.cos(q.th), fy = Math.sin(q.th);
    for (const l of C.lamps) { const dx = l.x - x, dy = l.y - y; if (Math.abs(dx) > L || Math.abs(dy) > L) continue; if (Math.abs(dx * fx + dy * fy) < L / 2 + 0.5 && Math.abs(-dx * fy + dy * fx) < W / 2 + 0.5) return false; }
    for (const id in X.places) { const pl = X.places[id]; if (Math.hypot(pl.door.x - x, pl.door.y - y) < L / 2 + 2.5) return false; if (pl.pad && Math.abs(pl.pad.x - x) < pl.pad.w / 2 + L / 2 + 1.5 && Math.abs(pl.pad.y - y) < pl.pad.h / 2 + L / 2 + 1.5) return false; }
    for (const b of S.bays) if (Math.hypot(b.x - x, b.y - y) < (b.len + L) / 2 + 2) return false;
    if (reserved(x, y, L / 2 + 1)) return false;
    const sts = stopsOf(); if (sts) for (const st of sts) if (inStopZone(st, x, y, L / 2)) return false;
    for (const p of X.peds) if (!p.removed && !p.dead && !p.hidden && Math.abs(p.x - x) < L && Math.abs(p.y - y) < L && X.circlePoly(p.x, p.y, p.r + 0.6, poly)) return false;
    return true;
  }
  function parkSpot(model, x, y, rMin, rMax) {
    const C = X.city, def = X.modelDef(model), out = [];
    for (const h of [true, false]) {
      const arr = h ? C.ys : C.xs, a0 = h ? x : y;
      for (let idx = 0; idx < arr.length; idx++) {
        if (Math.abs(arr[idx] - (h ? y : x)) > rMax + 12) continue;
        const r = { h, idx }, hw = roadHW(r);
        for (const s of [1, -1]) for (let a = a0 - rMax; a <= a0 + rMax; a += 2.5) {
          if (!clearOfJunctions(r, a, def.len / 2 + 4)) continue;
          const p = rpt(r, a, s, hw + 0.55), d = Math.hypot(p.x - x, p.y - y);
          if (d >= rMin && d <= rMax) out.push({ x: p.x, y: p.y, th: sideTh(r, s), d, r, a, s });
        }
      }
    }
    out.sort((p, q) => p.d - q.d);
    for (const q of out) if (slotOK(def, q)) return q;
    return null;
  }
  function parkFleetCar(model, at, rMin, rMax, label) {
    const q = parkSpot(model, at.x, at.y, rMin, rMax) || parkSpot(model, at.x, at.y, rMin, rMax * 2);
    if (!q) return null;
    const c = X.makeCar(model, q.x, q.y, q.th, { ctrl: 'parked', keep: true });
    c.jobFleet = label;
    S.fleet.push(c);
    S.bays.push({ x: q.x, y: q.y, th: q.th, len: c.len + 1, wid: c.wid + 0.5, label, color: BAYC[model] || '#ffd23a' });
    return c;
  }
  function parkFleet() {
    const f = X.focus(), C = X.city;
    parkFleetCar('taxi', f, 6, 70, 'TAXI');
    parkFleetCar('bus', f, 8, 95, 'BUS');
    parkFleetCar('ambulance', f, 8, 100, 'AMBULANCE');
    parkFleetCar('firetruck', f, 8, 110, 'FIRE');
    if (X.places.hospital) parkFleetCar('ambulance', X.places.hospital.door, 2, 70, 'AMBULANCE');
    parkFleetCar('firetruck', { x: C.W / 2, y: C.H / 2 }, 0, 140, 'FIRE STATION');
    if (!X.has('police') && X.places.police) parkFleetCar('police', X.places.police.door, 2, 70, 'POLICE');
  }

  // ================= people =================
  // One of ours: a fare, a bus passenger, a patient or a crook (ai.owner 'jobs'). With peds.js present we borrow
  // a properly dressed civilian of the right type.
  function jobPed(x, y, o) {
    o = o || {};
    let p = null;
    if (o.type && X.crowd && X.crowd.spawn && X.crowd.claim) { p = X.crowd.spawn(o.type, x, y); if (p) X.crowd.claim(p, 'jobs', o.ai); }
    if (!p) p = X.makePed({ x, y, team: 'civ', look: o.look || X.randomLook(), ai: Object.assign({ owner: 'jobs' }, o.ai) });
    p.x = x; p.y = y; p.vx = p.vy = 0; p.th = o.th != null ? o.th : p.th; p.pose = o.pose || null; p.knock = 0;
    p.ai.goal = null; p.ai.face = p.th; p.ai.t = 0;
    S.mine.push(p);
    return p;
  }
  const gone = p => !p || p.removed || p.dead || !p.ai || p.ai.owner !== 'jobs';
  function setGoal(p, x, y, sp) { const g = p.ai.goal || (p.ai.goal = { x: 0, y: 0, sp: 0 }); g.x = x; g.y = y; g.sp = sp; }
  // Into a vehicle (hidden, riding along) and back out at a spot.
  function stow(p, c) { p.hidden = true; p.car = c; p.vx = p.vy = 0; p.ai.goal = null; p.pose = null; p.x = c.x; p.y = c.y; }
  function unstow(p, at, th) {
    p.hidden = false; p.car = null; p.x = at.x; p.y = at.y; p.vx = p.vy = 0; p.knock = 0; if (th != null) p.th = th;
    if (X.blocked(p.x, p.y, p.r)) { const c = at.car; if (c) { const q = X.doorSpot(c, 1) || X.doorSpot(c, -1); if (q) { p.x = q.x; p.y = q.y; } } }
  }
  // Thrown out of a moving vehicle (a fare who has had enough).
  function jumpOut(p, c, side) {
    const fx = Math.cos(c.th), fy = Math.sin(c.th), sd = side || 1;
    const at = { x: c.x - fy * sd * (c.wid / 2 + 0.55), y: c.y + fx * sd * (c.wid / 2 + 0.55), car: c };
    unstow(p, at, c.th + sd * Math.PI / 2);
    const v = X.carVel(c);
    if (c.speed > 4) { p.vx = v.x * 0.6 - fy * sd * 2.5; p.vy = v.y * 0.6 + fx * sd * 2.5; p.knock = 0.8 + Math.min(1, c.speed / 20); p.spin = rand(-8, 8); if (c.speed > 12) X.damagePed(p, (c.speed - 12) * 2, null, 'bail'); }
  }
  // Done with this person: back to the crowd, or (without peds.js) wander off and vanish out of sight.
  function dismiss(p, away) {
    if (!p || p.removed || p.dead) return;
    if (p.hidden) unstow(p, p.car ? (X.doorSpot(p.car, 1) || { x: p.car.x, y: p.car.y }) : { x: p.x, y: p.y });
    p.pose = null;
    if (S.hasPeds && X.crowd && X.crowd.release) { X.crowd.release(p); return; }
    const a = away || X.randomSidewalkPoint(p.x, p.y, 10, 30) || { x: p.x, y: p.y };
    p.ai = { owner: 'jobs', role: 'leave', t: 0, goal: { x: a.x, y: a.y, sp: 1.5 }, face: p.th };
  }
  // Stand there for a moment (shaking a fist, say), then go.
  function linger(p, pose, s) { if (gone(p)) return; p.ai.role = 'linger'; p.ai.t = 0; p.ai.until = s || 2.5; p.ai.goal = null; p.pose = pose || null; }
  function pedsTick(dt) {
    for (let i = S.mine.length - 1; i >= 0; i--) {
      const p = S.mine[i];
      if (gone(p)) { S.mine.splice(i, 1); continue; }
      if (p.hidden) { if (p.car && !p.car.removed) { p.x = p.car.x; p.y = p.car.y; } continue; }
      const a = p.ai;
      a.t = (a.t || 0) + dt;
      let vx = 0, vy = 0;
      if (a.goal && p.knock <= 0) {
        const dx = a.goal.x - p.x, dy = a.goal.y - p.y, d = Math.hypot(dx, dy);
        if (d > 0.12) { const s = Math.min(a.goal.sp, d * 4); vx = dx / d * s; vy = dy / d * s; }
      }
      X.movePed(p, dt, vx, vy);
      if (p.knock <= 0) {
        if (vx * vx + vy * vy > 0.05) p.th += wrap(Math.atan2(vy, vx) - p.th) * Math.min(1, dt * 12);
        else if (a.face != null) p.th += wrap(a.face - p.th) * Math.min(1, dt * 6);
      }
      if (a.role === 'leave' && ((a.t > 1.5 && !X.inView(p.x, p.y, 3)) || a.t > 25)) p.removed = true;
      else if (a.role === 'perp' && ((a.t > 7 && !X.inView(p.x, p.y, 3)) || a.t > 30)) p.removed = true;
      else if (a.role === 'perp' && a.t > 3) p.pose = 'kneel';
      else if (a.role === 'admit' && ((a.goal && Math.hypot(a.goal.x - p.x, a.goal.y - p.y) < 0.9) || a.t > 14)) p.removed = true;
      else if (a.role === 'linger' && a.t > a.until && p.knock <= 0) { p.pose = null; dismiss(p); }
    }
  }
  // Core's default person has no poses: without peds.js (which owns X.drawPed and draws every pose), lying
  // patients and waving fares get a little help.
  function wrapDrawPed() {
    if (X.drawPed._jobs || X.has('peds')) return;
    const base = X.drawPed;
    const f = function (ctx, p, t) {
      const ps = p.pose;
      if (!ps || p.dead || !S || S.hasPeds) return base(ctx, p, t);
      if (ps === 'lie' || ps === 'kneel') { p.dead = true; base(ctx, p, t); p.dead = false; return; }
      base(ctx, p, t);
      if (ps === 'wave' || ps === 'surrender' || ps === 'hands' || ps === 'fist') {
        const sk = (p.look && p.look.skin) || '#e0ac7e', w = ps === 'wave' ? Math.sin(t * 10) * 0.12 : 0;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.th); ctx.fillStyle = sk;
        ctx.beginPath(); ctx.arc(0.18 + w, 0.4, 0.085, 0, TAU); if (ps !== 'wave') ctx.arc(0.18, -0.4, 0.085, 0, TAU); ctx.fill();
        ctx.restore();
      }
    };
    f._jobs = true; f.owner = base.owner;
    X.drawPed = f;
  }

  // ================= feedback =================
  function say(text, kind, force) {
    if (!force && X.time - S.toastT < 2.2) return;
    S.toastT = X.time;
    PG.ui.toast(text, kind || 'warn');
  }
  function sfx(name, x, y) {
    const k = PG.audio.kit(); if (!k) return;
    let v = 1;
    if (x != null) { const f = X.focus(), d = Math.hypot(x - f.x, y - f.y); if (d > 70) return; v = 1 - d / 80; }
    const t = k.now;
    switch (name) {
      case 'start': [523, 659, 784, 1046].forEach((f, i) => k.tone('square', f, t + i * 0.08, 0.14, 0.05, { lp: 3200 })); break;
      case 'cash': k.noise(t, 0.05, 0.18 * v, 'highpass', 3000); k.tone('square', 1568, t + 0.04, 0.08, 0.045 * v, { lp: 5000 }); k.tone('square', 2093, t + 0.11, 0.25, 0.045 * v, { lp: 5000 }); break;
      case 'door': k.noise(t, 0.38, 0.13 * v, 'highpass', 2600, { to: 700, attack: 0.02 }); break;
      case 'bell': k.tone('sine', 1320, t, 0.35, 0.09 * v); k.tone('sine', 1320, t + 0.22, 0.45, 0.08 * v); break;
      case 'thunk': k.tone('sine', 150, t, 0.12, 0.25 * v, { to: 70 }); k.noise(t, 0.05, 0.12 * v, 'lowpass', 700); break;
      case 'beep': k.tone('sine', 1046, t, 0.07, 0.05 * v); break;
      case 'flat': k.tone('sine', 1046, t, 1.4, 0.06 * v); break;
      case 'hiss': k.noise(t, 0.2, 0.05 * v, 'bandpass', 1500, { Q: 0.6, attack: 0.04 }); break;
      case 'steam': k.noise(t, 0.45, 0.07 * v, 'highpass', 3200, { attack: 0.06 }); break;
      case 'radio': k.noise(t, 0.12, 0.08, 'bandpass', 2200, { Q: 3 }); k.tone('square', 1400, t + 0.13, 0.05, 0.035, { lp: 3000 }); k.tone('square', 1800, t + 0.2, 0.05, 0.035, { lp: 3000 }); break;
      case 'meter': k.tone('square', 2400, t, 0.03, 0.03 * v, { lp: 4000 }); k.tone('square', 1800, t + 0.06, 0.03, 0.03 * v, { lp: 4000 }); break;
      case 'nee': k.tone('square', S.sirenHi ? 960 : 770, t, 0.4, 0.03, { lp: 2400 }); break;
      case 'splash': k.noise(t, 0.25, 0.06 * v, 'lowpass', 1200, { attack: 0.01 }); break;
    }
  }
  function pay(J, amount, x, y, reason) {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    J.earned += amount;
    X.money(amount, 'job:' + J.id + (reason ? ':' + reason : ''), x, y);
    sfx('cash');
    return amount;
  }
  function mark(x, y, color, label, radius) { X.objective(x, y, { color, label, radius }); }

  // ================= TAXI =================
  const TAXI = {
    name: 'Taxi', title: 'TAXI DRIVER', color: '#ffd23a', unit: 'fares',
    start(J) { J.d = { fare: null, stage: 'seek', spawnT: 1.2, anger: 0, fun: 0, type: null, dest: null, timer: 0, max: 0, len: 0, boardT: 0 }; X.pager('DISPATCH: Fares wave from the kerb. Stop next to them. Fast rides tip big, five in a row pays a bonus.', 6000); },
    tick(J, dt) {
      const D = J.d, c = J.car, f = D.fare;
      if (D.stage === 'seek') {
        J.timer = 0;
        if (!f) { J.obj = 'Cruise around and look for a fare'; if ((D.spawnT -= dt) <= 0) { D.spawnT = 1.5; spawnFare(J); } return; }
        if (gone(f)) { D.fare = null; D.spawnT = 2; say('Your fare got... cancelled.', 'scrape'); return; }
        const d = dist(c, f);
        if (d > 420) { dismiss(f); D.fare = null; D.spawnT = 1; return; }
        const cops = P.wanted >= 2;
        f.pose = f.knock > 0 ? null : cops ? (d < 30 ? 'cross' : null) : d < 60 ? 'wave' : 'phone';
        J.obj = cops ? 'Lose the cops: no fare gets in with a wanted level' : 'Pick up the fare (stop next to them)';
        if (d < TUNE.pickR && Math.abs(c.speed) < TUNE.slow && f.knock <= 0) {
          if (cops) { say(PG.say(LINES.cops), 'scrape'); return; }
          D.stage = 'board'; D.boardT = 0; f.pose = null; sfx('meter');
        }
      } else if (D.stage === 'board') {
        J.obj = 'The fare is getting in';
        if (gone(f)) { D.fare = null; D.stage = 'seek'; D.spawnT = 2; return; }
        const door = carPt(c, -c.len * 0.12, c.wid / 2 + 0.5);
        setGoal(f, door.x, door.y, 2.6);
        D.boardT += dt;
        if (dist(c, f) > 14 || Math.abs(c.speed) > 3) { D.stage = 'seek'; f.ai.goal = null; say('Hey! Come back!', 'scrape'); return; }
        if (Math.hypot(f.x - door.x, f.y - door.y) < 0.9 || D.boardT > 6) boardFare(J);
      } else if (D.stage === 'ride') {
        if (gone(f)) { D.fare = null; D.stage = 'seek'; D.spawnT = 2; return; }
        D.timer -= dt; J.timer = D.timer; J.timerMax = D.max;
        D.anger = Math.max(0, D.anger - dt * 2);
        J.obj = 'Drop off at ' + D.dest.name;
        if (c.burning > 0 || c.hp < c.maxHp * 0.15) return bailFare(J, LINES.fire);
        if (P.wanted >= 3) return bailFare(J, LINES.cops);
        if (D.timer <= 0) return bailFare(J, LINES.late);
        if (Math.hypot(c.x - D.dest.rx, c.y - D.dest.ry) < TUNE.dropR && Math.abs(c.speed) < TUNE.slow) dropFare(J);
      }
    },
    bump(J, sp) {
      const D = J.d; if (D.stage !== 'ride') return;
      if (D.type.temper < 0) { D.fun++; say(PG.say(LINES.cheer), 'style'); return; }
      D.anger += (sp - 3) * 6 * D.type.temper;
      if (D.anger >= 100) bailFare(J, LINES.bail);
      else say(PG.say(LINES.crash), 'scrape');
    },
    marks(J) {
      const D = J.d, f = D.fare;
      if (D.stage === 'seek' && f && !gone(f)) mark(f.x, f.y, '#ffd23a', f.pose === 'wave' ? null : 'FARE', 1.6);
      if (D.stage === 'ride' && D.dest) mark(D.dest.rx, D.dest.ry, '#ffd23a', D.dest.short, 4.5);
    },
    stats(J) { return `FARES ${J.count} · STREAK ${J.streak}`; },
    end(J) {
      const f = J.d.fare;
      if (f && !gone(f)) { if (f.hidden) jumpOut(f, J.car, 1); dismiss(f); }
      J.d.fare = null;
    },
  };
  function spawnFare(J) {
    const c = J.car, fw = fwdOf(c);
    const k = randomKerb(c.x, c.y, TUNE.fareR[0], TUNE.fareR[1], { hx: fw.x, hy: fw.y, inset: 0.9, tries: 50, hidden: true });
    if (!k) return null;
    const late = X.clock > 22 * 60 || X.clock < 5 * 60;   // after ten the bar crowd wants a ride home
    const ty = pickW(late ? FARE_TYPES.map(o => o.id === 'drunk' ? Object.assign({}, o, { w: o.w * 3 }) : o.id === 'business' ? Object.assign({}, o, { w: o.w * 0.4 }) : o) : FARE_TYPES);
    const p = jobPed(k.x, k.y, { type: ty.id, th: Math.atan2(k.ny, k.nx), ai: { role: 'fare' } });
    p.ai.face = Math.atan2(k.ny, k.nx);
    Object.assign(J.d, { fare: p, type: ty, anger: 0, fun: 0, kerb: k });
    return p;
  }
  function pickDest(from) {
    if (Math.random() < 0.4) {
      const ids = Object.keys(X.places).filter(id => !X.places[id].pad).sort(() => Math.random() - 0.5);
      for (const id of ids) {
        const pl = X.places[id], d = dist(pl.door, from);
        if (d < TUNE.destR[0] || d > TUNE.destR[1] * 1.3) continue;
        const k = doorKerb(pl.door);
        if (k && kerbOK(k)) { k.name = pl.name; k.short = pl.name.toUpperCase(); k.door = pl.door; return k; }
      }
    }
    const k = randomKerb(from.x, from.y, TUNE.destR[0], TUNE.destR[1], { inset: 1.1, tries: 60 }) || randomKerb(from.x, from.y, 60, 900, { tries: 80 });
    if (k) { k.name = streetName(k.r) + ', ' + X.districtAt(k.x, k.y); k.short = streetName(k.r).toUpperCase(); }
    return k;
  }
  function boardFare(J) {
    const D = J.d, c = J.car, f = D.fare;
    const dest = pickDest(c);
    if (!dest) { D.stage = 'seek'; return; }
    stow(f, c);
    D.dest = dest; D.len = routeLen(c.x, c.y, dest.rx, dest.ry);
    D.max = D.timer = (TUNE.taxiSlack + D.len / TUNE.taxiPace) * D.type.time * (1 - Math.min(0.25, J.count * 0.012));
    J.timer = D.timer; J.timerMax = D.max;
    D.stage = 'ride'; D.anger = 0;
    sfx('thunk', c.x, c.y);
    say('"' + PG.say(LINES.hail[D.type.id] || LINES.hail.walker, { dest: dest.name }) + '"', 'warn', true);
  }
  function dropFare(J) {
    const D = J.d, c = J.car, f = D.fare, left = Math.max(0, D.timer) / D.max;
    const base = (TUNE.taxiBase + D.len * TUNE.taxiPerM) * D.type.pay;
    const tip = base * 0.9 * left + D.fun * 15;
    const door = carPt(c, -c.len * 0.12, c.wid / 2 + 0.6); door.car = c;
    unstow(f, door, Math.atan2(-D.dest.ny, -D.dest.nx));
    dismiss(f, D.dest.door ? { x: D.dest.door.x, y: D.dest.door.y } : { x: D.dest.x - D.dest.ny * rand(-6, 6), y: D.dest.y + D.dest.nx * rand(-6, 6) });
    J.count++; J.streak++;
    const got = pay(J, base + tip, c.x, c.y - 1.5, 'fare');
    say((left > 0.35 ? '"' + PG.say(LINES.paidFast) + '"' : '"' + PG.say(LINES.paidSlow) + '"') + '  Fare ' + fmt(base) + (tip >= 1 ? ' + tip ' + fmt(tip) : ''), left > 0.35 ? 'style' : 'warn', true);
    if (J.streak % TUNE.streakEvery === 0) {
      const b = pay(J, TUNE.streakBonus * J.streak / TUNE.streakEvery, c.x, c.y - 3, 'streak');
      X.big(J.streak + ' FARES IN A ROW!', '#ffd23a', 2000, 'streak bonus +' + fmt(b));
      PG.audio.fanfare();
    } else X.popup('Fare ' + J.count + ': +' + fmt(got));
    Object.assign(D, { fare: null, stage: 'seek', spawnT: 1.5, dest: null, timer: 0 });
    X.emit('jobPaid', { id: 'taxi', amount: got });
  }
  function bailFare(J, pool) {
    const D = J.d, c = J.car, f = D.fare;
    if (f && !gone(f)) { if (f.hidden) jumpOut(f, c, 1); linger(f, 'fist', 2.5); }
    say('"' + PG.say(pool) + '"', 'scrape', true);
    if (J.streak >= 2) X.popup('Streak lost');
    J.streak = 0;
    Object.assign(D, { fare: null, stage: 'seek', spawnT: 3, dest: null, timer: 0 });
    PG.audio.trombone();
  }

  // ================= BUS ROUTE =================
  const BUS = {
    name: 'Bus Route', title: 'TAKE THE BUS!', color: '#ff8a3a', unit: 'routes',
    start(J) { J.count = 0; J.d = {}; if (!newRoute(J)) return false; },
    tick(J, dt) {
      const D = J.d, c = J.car, st = D.stops[D.next];
      for (const s of D.stops) if (!s.spawned && !s.served && (s === st || dist(s, X.focus()) < 170)) fillStop(J, s);
      for (const s of D.stops) for (let i = s.waiting.length - 1; i >= 0; i--) if (gone(s.waiting[i])) s.waiting.splice(i, 1);
      for (let i = D.aboard.length - 1; i >= 0; i--) if (gone(D.aboard[i].p)) D.aboard.splice(i, 1);
      J.timer = st.due - X.time; J.timerMax = st.span;
      // someone aboard wants this stop: the bell rings once
      const req = D.aboard.some(a => a.dest === D.next || a.angry) || D.next === D.stops.length - 1;
      if (req && D.rung !== D.next && D.aboard.length) { D.rung = D.next; sfx('bell'); }
      J.obj = 'Next stop: ' + st.name + (D.phase === 'dwell' ? ' (doors open)' : req && D.aboard.length ? ' · STOP REQUESTED' : '');
      if (c.burning > 0 && D.aboard.length) { evacuate(J); return; }
      const tx = Math.cos(st.th), ty = Math.sin(st.th), dx = c.x - st.rx, dy = c.y - st.ry;
      const along = dx * tx + dy * ty, lat = -dx * ty + dy * tx, inZone = Math.abs(along) < 8 && Math.abs(lat) < 3 && Math.abs(wrap(c.th - st.th)) < 0.7;
      if (D.phase === 'drive') {
        if (inZone && Math.abs(c.speed) < 0.8) { D.stopT += dt; if (D.stopT > 0.4) openDoors(J, st); } else D.stopT = 0;
        if (!inZone && dist(c, st) < 25 && Math.abs(c.speed) < 0.5 && (D.hintT = (D.hintT || 0) + dt) > 2.5) { D.hintT = -6; X.popup('Pull into the bus box at the stop'); }
        return;
      }
      // doors open: off first, then on
      D.dwellT += dt; D.queueT -= dt;
      if (Math.abs(c.speed) > 1.5 || !inZone) return closeDoors(J, st, true);
      const mid = carPt(c, -0.8, c.wid / 2 + 0.55), front = carPt(c, c.len / 2 - 1.7, c.wid / 2 + 0.55);
      if (D.off.length) {
        if (D.queueT <= 0) {
          D.queueT = 0.35;
          const a = D.off.shift(); mid.car = c;
          unstow(a.p, mid, Math.atan2(-st.ny, -st.nx));
          const u = rand(-5, 5);
          dismiss(a.p, { x: st.x + tx * u - st.nx * 1.2, y: st.y + ty * u - st.ny * 1.2 });
          D.served++; J.alighted = (J.alighted || 0) + 1;
          if (Math.random() < 0.3) say('"Thanks, driver!"', 'arm');
        }
        return;
      }
      for (const p of st.waiting) {
        if (gone(p) || p.knock > 0) continue;
        if (D.aboard.length >= TUNE.busCap) { if (!D.fullSaid) { D.fullSaid = true; say(PG.say(LINES.full), 'scrape', true); } p.ai.goal = null; continue; }
        setGoal(p, front.x, front.y, 2.2); p.pose = null;
        if (Math.hypot(p.x - front.x, p.y - front.y) < 0.9 || p.ai.t > 9) {
          const later = D.stops.length - 1 - D.next;
          D.aboard.push({ p, dest: D.next + 1 + Math.floor(Math.random() * Math.max(1, later)) });
          stow(p, c);
          st.boarded++; D.passengers++;
          pay(J, TUNE.busFare + 2 * (J.level - 1), front.x, front.y - 1, 'ticket');
          if (Math.random() < 0.3) say('"' + PG.say(LINES.board) + '"', 'warn');
          p.ai.t = 0;
        }
      }
      for (let i = st.waiting.length - 1; i >= 0; i--) if (st.waiting[i].hidden) st.waiting.splice(i, 1);
      const left = st.waiting.filter(p => !gone(p) && p.knock <= 0).length;
      if (D.dwellT >= TUNE.busDwell && (left === 0 || D.aboard.length >= TUNE.busCap)) closeDoors(J, st, false);
    },
    bump(J, sp) {
      const D = J.d; if (!D.aboard || !D.aboard.length) return;
      say('"' + PG.say(LINES.bump) + '"', 'scrape');
      if (sp > 12) for (const a of D.aboard) a.angry = true;
    },
    marks(J) {
      const D = J.d, st = D.stops[D.next];
      if (st) mark(st.rx, st.ry, '#ff8a3a', 'STOP ' + (D.next + 1), 1.2);
      for (let i = D.next + 1; i < D.stops.length; i++) X.blip(D.stops[i].x, D.stops[i].y, '#ff8a3a', { size: 2.5, shape: 'square' });
    },
    stats(J) { const D = J.d; return `ROUTE ${D.num} · STOP ${Math.min(D.next + 1, D.stops.length)}/${D.stops.length} · ${D.aboard.length} ON BOARD`; },
    end(J) {
      const D = J.d, c = J.car;
      if (!D.stops) return;
      for (const a of D.aboard) if (!gone(a.p)) { if (a.p.hidden) { const q = carPt(c, -0.8, c.wid / 2 + 0.55); q.car = c; unstow(a.p, q); } dismiss(a.p); }
      for (const a of D.off) if (!gone(a.p)) dismiss(a.p);
      for (const s of D.stops) for (const p of s.waiting) if (!gone(p)) dismiss(p);
      D.aboard = []; D.off = [];
    },
  };
  const DIRX = [1, 0, -1, 0], DIRY = [0, 1, 0, -1];
  function idxNear(arr, v) { let b = 0; for (let k = 1; k < arr.length; k++) if (Math.abs(arr[k] - v) < Math.abs(arr[b] - v)) b = k; return b; }
  // Six stops along a random walk over the junction grid, starting with the road the bus is on.
  function buildRoute(c, n) {
    const C = X.city, NX = C.xs.length, NY = C.ys.length, fx = Math.cos(c.th), fy = Math.sin(c.th);
    let d = Math.abs(fx) >= Math.abs(fy) ? (fx > 0 ? 0 : 2) : (fy > 0 ? 1 : 3);
    let i = idxNear(C.xs, c.x), j = idxNear(C.ys, c.y);
    // the junction behind the bus on its road
    if (d === 0) { i = 0; while (i < NX - 2 && C.xs[i + 1] <= c.x) i++; j = idxNear(C.ys, c.y); }
    else if (d === 2) { i = NX - 1; while (i > 1 && C.xs[i - 1] >= c.x) i--; j = idxNear(C.ys, c.y); }
    else if (d === 1) { j = 0; while (j < NY - 2 && C.ys[j + 1] <= c.y) j++; i = idxNear(C.xs, c.x); }
    else { j = NY - 1; while (j > 1 && C.ys[j - 1] >= c.y) j--; i = idxNear(C.xs, c.x); }
    const stops = [], used = new Set(), names = STOP_NAMES.slice().sort(() => Math.random() - 0.5);
    let first = true, cum = 0, px = c.x, py = c.y;
    for (let guard = 0; stops.length < n && guard < n * 4; guard++) {
      if (!first) {   // choose where to go from junction (i, j): straight on or a turn, never back down a used street
        const opts = [d, (d + 1) % 4, (d + 3) % 4].filter(q => { const a = i + DIRX[q], b = j + DIRY[q]; return a >= 0 && b >= 0 && a < NX && b < NY && !used.has(Math.min(i, a) + ',' + Math.min(j, b) + ',' + (q % 2)); });
        if (!opts.length) break;
        d = Math.random() < 0.45 && opts.includes(d) ? d : pick(opts);
      }
      const i2 = i + DIRX[d], j2 = j + DIRY[d];
      if (i2 < 0 || j2 < 0 || i2 >= NX || j2 >= NY) { if (first) { d = (d + 1) % 4; first = false; continue; } break; }
      used.add(Math.min(i, i2) + ',' + Math.min(j, j2) + ',' + (d % 2));
      const r = d % 2 === 0 ? { h: true, idx: j } : { h: false, idx: i };
      const a0 = d % 2 === 0 ? C.xs[i] : C.ys[j], a1 = d % 2 === 0 ? C.xs[i2] : C.ys[j2], s = d === 0 || d === 3 ? 1 : -1;
      for (const f of [0.55, 0.42, 0.68, 0.3, 0.8]) {
        const a = a0 + (a1 - a0) * f;
        if (first && (a - (d % 2 === 0 ? c.x : c.y)) * Math.sign(a1 - a0) < 35) continue;
        if (!clearOfJunctions(r, a, 12)) continue;
        const k = kerb(r, a, s, 2.5);
        if (!kerbOK(k, 1.0)) continue;
        const tx = Math.cos(k.th), ty = Math.sin(k.th);
        if (X.blocked(k.x + tx * 3, k.y + ty * 3, 0.7) || X.blocked(k.x - tx * 3, k.y - ty * 3, 0.7) || X.blocked(k.x - tx * 3.8 + k.nx * 1.75, k.y - ty * 3.8 + k.ny * 1.75, 0.5)) continue;
        if (stops.some(o => dist(o, k) < 45) || reserved(k.x, k.y, 8)) continue;
        const zone = { x: k.x, y: k.y, tx, ty, nx: k.nx, ny: k.ny };
        if (X.cars.some(o => !o.removed && o !== c && o.ctrl !== 'path' && Math.abs(o.speed) < 0.5 && Math.abs(o.x - k.x) < 16 && Math.abs(o.y - k.y) < 16 && inStopZone(zone, o.x, o.y, o.len / 2))) continue;
        if (S.bays.some(b => inStopZone(zone, b.x, b.y, b.len / 2))) continue;
        const near = Object.values(X.places).find(pl => dist(pl.door, k) < 70 && !stops.some(o => o.name === pl.name));
        const box = { x: k.rx - tx * 1.5, y: k.ry - ty * 1.5 };
        cum += Math.hypot(box.x - px, box.y - py); px = box.x; py = box.y;
        stops.push({ x: k.x, y: k.y, rx: box.x, ry: box.y, th: k.th, tx, ty, nx: k.nx, ny: k.ny, r, a, s: k.s, name: near ? near.name : names.pop() || streetName(r), street: streetName(r), waiting: [], spawned: false, served: false, boarded: 0, dist: cum, due: 0, span: 0 });
        break;
      }
      first = false; i = i2; j = j2;
    }
    return stops;
  }
  function newRoute(J) {
    const c = J.car;
    let stops = buildRoute(c, TUNE.busStops);
    for (let k = 0; k < 4 && stops.length < 4; k++) { const s2 = buildRoute(c, TUNE.busStops); if (s2.length > stops.length) stops = s2; }
    if (stops.length < 3) return false;
    const num = 2 + Math.floor(Math.random() * 97);
    let prevDue = X.time;
    for (const s of stops) { s.due = X.time + 18 + s.dist / 7.5 + stops.indexOf(s) * 10; s.span = s.due - prevDue; prevDue = s.due; }
    J.d = { num, stops, next: 0, aboard: [], off: [], phase: 'drive', stopT: 0, dwellT: 0, queueT: 0, served: 0, passengers: 0, onTime: 0, fullSaid: false };
    X.pager(`ROUTE ${num}: ${stops.length} stops, ${stops[0].name} to ${stops[stops.length - 1].name}. Pull into the bus box at each shelter and let them on. Take the Bus!`, 7000);
    return true;
  }
  function fillStop(J, st) {
    st.spawned = true;
    if (st === J.d.stops[J.d.stops.length - 1]) return;   // the terminus: everybody off, nobody on
    const n = Math.min(6, 1 + Math.floor(Math.random() * 3) + Math.floor((J.level - 1) / 2));
    for (let k = 0; k < n; k++) {
      const u = rand(-2.8, 2.8), v = rand(0.3, 1.4);
      const x = st.x + st.tx * u + st.nx * v, y = st.y + st.ty * u + st.ny * v;
      if (X.blocked(x, y, 0.35)) continue;
      const p = jobPed(x, y, { type: pick(['walker', 'walker', 'old', 'shopper', 'business', 'tourist', 'walker']), th: Math.atan2(st.ny, st.nx) + rand(-0.6, 0.6), ai: { role: 'busq' } });
      p.pose = pick([null, null, 'phone', 'smoke', null, 'cross']);
      st.waiting.push(p);
    }
  }
  function openDoors(J, st) {
    const D = J.d;
    D.phase = 'dwell'; D.dwellT = 0; D.queueT = 0.4; D.fullSaid = false;
    D.off = D.aboard.filter(a => a.dest <= D.next || D.next === D.stops.length - 1 || a.angry);
    D.aboard = D.aboard.filter(a => !D.off.includes(a));
    st.boarded = 0;
    if (!st.spawned) fillStop(J, st);
    for (const p of st.waiting) p.ai.t = 0;
    sfx('door', J.car.x, J.car.y); sfx('bell');
  }
  function closeDoors(J, st, early) {
    const D = J.d, c = J.car;
    for (const a of D.off) if (!gone(a.p)) { const q = carPt(c, -0.8, c.wid / 2 + 0.55); q.car = c; unstow(a.p, q); dismiss(a.p); }
    D.off = [];
    D.phase = 'drive'; D.stopT = 0;
    sfx('door', c.x, c.y);
    const left = st.waiting.filter(p => !gone(p)).length;
    if (early && left) say('You left people behind at ' + st.name + '!', 'scrape', true);
    st.served = true;
    if (X.time <= st.due && !(early && left)) { D.onTime++; pay(J, TUNE.busOnTime + 5 * J.level, c.x, c.y - 2, 'ontime'); X.popup('On time at ' + st.name + '!'); }
    else X.popup((early && left ? 'Doors shut at ' : 'Late at ') + st.name);
    for (const p of st.waiting) if (!gone(p)) { if (early) linger(p, 'fist', rand(2, 3.5)); else dismiss(p); }
    st.waiting.length = 0;
    D.next++;
    if (D.next >= D.stops.length) routeDone(J);
  }
  function routeDone(J) {
    const D = J.d, c = J.car;
    J.count++;
    const bonus = pay(J, TUNE.busRoute + 40 * J.level + 30 * D.onTime, c.x, c.y - 3, 'route');
    X.big('ROUTE ' + D.num + ' DONE!', '#ff8a3a', 2400, D.passengers + ' passengers · ' + D.onTime + '/' + D.stops.length + ' on time · +' + fmt(bonus));
    PG.audio.fanfare();
    J.level++;
    X.emit('jobPaid', { id: 'bus', amount: bonus });
    for (const s of D.stops) for (const p of s.waiting) if (!gone(p)) dismiss(p);
    if (!newRoute(J)) endJob('End of the line');
  }
  function evacuate(J) {
    const D = J.d, c = J.car;
    for (const a of D.aboard.concat(D.off)) if (!gone(a.p)) { jumpOut(a.p, c, Math.random() < 0.5 ? 1 : -1); dismiss(a.p); }
    D.aboard = []; D.off = [];
    say('"FIRE! EVERYBODY OFF!"', 'scrape', true);
  }

  // ================= PARAMEDIC =================
  const MEDIC = {
    name: 'Paramedic', title: 'PARAMEDIC', color: '#ff5a5a', unit: 'patients',
    start(J) {
      const h = X.places.hospital;
      const k = h && (doorKerb(h.door, 1.1) || { rx: h.door.x + h.door.nx * 6, ry: h.door.y + h.door.ny * 6, x: h.door.x, y: h.door.y });
      if (!k) return false;
      J.d = { pats: [], hosp: k, door: h.door, saved: 0, lost: 0, nextT: 0, doorsT: 0, beepT: 0 };
      newCall(J);
      X.pager('ST. BUSSBY: Casualties on the street. Stop next to them, they climb in the back (3 at a time). Get them to the hospital alive.', 7000);
    },
    tick(J, dt) {
      const D = J.d, c = J.car;
      if (D.nextT > 0) { if ((D.nextT -= dt) <= 0) newCall(J); J.obj = 'Stand by for the next call'; J.timer = 0; return; }
      if (D.doorsT > 0) D.doorsT -= dt;
      const rear = carPt(c, -c.len / 2 - 0.6, 0);
      let aboard = 0, waiting = 0, minLife = Infinity, minMax = 1;
      for (const q of D.pats) if (q.st === 'walk' || q.st === 'aboard') aboard++;
      for (const q of D.pats) {
        const p = q.p;
        if (q.st === 'saved' || q.st === 'lost') continue;
        q.life -= dt * (q.st === 'aboard' ? 0.75 : 1);
        if (q.life < minLife) { minLife = q.life; minMax = q.max; }
        if (q.st === 'wait') {
          waiting++;
          if (gone(p)) { lose(J, q, p && p.dead && X.byPlayer(p.lastBy) ? 'You were supposed to SAVE them!' : 'Patient lost.'); continue; }
          if (q.life <= 0) { X.killPed(p, null, 'injury'); lose(J, q, 'Patient died waiting.'); continue; }
          if (p.knock <= 0) p.pose = 'lie';
          if (dist(c, p) < 8.5 && Math.abs(c.speed) < TUNE.slow) {
            if (aboard >= TUNE.medCap) { if (!q.fullT || X.time - q.fullT > 4) { q.fullT = X.time; X.popup('Ambulance full: deliver first'); } }
            else { q.st = 'walk'; p.pose = null; p.ai.t = 0; aboard++; D.doorsT = 3; if (Math.random() < 0.4) say('"' + PG.say(LINES.firstAid) + '"', 'warn'); }
          }
        } else if (q.st === 'walk') {
          if (gone(p)) { lose(J, q, 'Patient lost.'); continue; }
          setGoal(p, rear.x, rear.y, 1.7);
          D.doorsT = Math.max(D.doorsT, 1);
          if (dist(c, p) > 15 || Math.abs(c.speed) > 3) { q.st = 'wait'; p.ai.goal = null; continue; }
          if (Math.hypot(p.x - rear.x, p.y - rear.y) < 1.0 || p.ai.t > 7) { q.st = 'aboard'; stow(p, c); sfx('thunk', c.x, c.y); X.popup('Patient aboard'); }
        } else if (q.st === 'aboard') {
          if (q.life <= 0) { if (p && !p.removed) p.removed = true; sfx('flat'); lose(J, q, PG.say(LINES.lost)); continue; }
        }
      }
      const inside = D.pats.filter(q => q.st === 'aboard');
      if (inside.length) {
        if ((D.beepT -= dt) <= 0) { D.beepT = cl(minLife / 40, 0.25, 1.1); sfx('beep'); }
        if (Math.hypot(c.x - D.hosp.rx, c.y - D.hosp.ry) < 9 && Math.abs(c.speed) < TUNE.slow) deliver(J, inside);
      }
      J.timer = minLife === Infinity ? 0 : minLife; J.timerMax = minMax;
      J.obj = inside.length >= TUNE.medCap || (inside.length && !waiting) ? 'Rush them to St. Bussby Hospital' : inside.length ? 'Pick up the injured, or deliver to the hospital' : 'Pick up the injured';
      if (D.pats.length && D.pats.every(q => q.st === 'saved' || q.st === 'lost')) levelDone(J);
    },
    bump(J, sp) {
      const D = J.d; let any = false;
      for (const q of D.pats) if (q.st === 'aboard') { q.life -= (sp - 3) * 0.8; any = true; }
      if (any) say('"' + PG.say(LINES.patient) + '"', 'scrape');
    },
    marks(J) {
      const D = J.d;
      for (const q of D.pats) if (q.st === 'wait' && !gone(q.p)) mark(q.p.x, q.p.y, '#ff5a5a', null, 1.8);
      if (D.pats.some(q => q.st === 'aboard')) mark(D.hosp.rx, D.hosp.ry, '#7dff9a', 'HOSPITAL', 5);
    },
    stats(J) { const D = J.d; return `SAVED ${J.count} · ON BOARD ${D.pats.filter(q => q.st === 'aboard').length}/${TUNE.medCap}`; },
    end(J) {
      const D = J.d, c = J.car;
      if (!D.pats) return;
      for (const q of D.pats) {
        const p = q.p; if (gone(p)) continue;
        if (p.hidden) { const r = carPt(c, -c.len / 2 - 0.7, 0); r.car = c; unstow(p, r); }
        p.pose = null; dismiss(p);
      }
    },
  };
  function newCall(J) {
    const D = J.d, c = J.car, n = Math.min(TUNE.medMax, J.level);
    D.pats = []; D.nextT = 0;
    for (let k = 0; k < n * 3 && D.pats.length < n; k++) {
      const s = randomKerb(c.x, c.y, TUNE.medR[0], TUNE.medR[1], { inset: rand(1.6, 2.8), tries: 30, hidden: true, test: q => D.pats.every(o => dist(o.p, q) > 30) });
      if (!s) continue;
      const p = jobPed(s.x, s.y, { type: pick(['walker', 'old', 'business', 'shopper', 'tourist']), th: rand(0, TAU), pose: 'lie', ai: { role: 'patient' } });
      p.hp = Math.min(p.hp, 40);
      X.decal(s.x + rand(-0.3, 0.3), s.y + rand(-0.3, 0.3), 'blood', 0.45);
      const life = Math.max(40, 40 + dist(c, s) / 10 + dist(s, D.hosp) / 10 + rand(0, 10) - J.level * 2);
      D.pats.push({ p, st: 'wait', life, max: life, k: s });
    }
    if (!D.pats.length) { D.nextT = 1; return; }
    sfx('radio');
    X.popup(n === 1 ? 'Casualty reported' : n + ' casualties reported');
  }
  function lose(J, q, text) {
    q.st = 'lost'; J.d.lost++;
    if (q.p && !q.p.removed && !q.p.dead && !q.p.hidden) dismiss(q.p);
    say(text, 'scrape', true);
    J.streak = 0;
  }
  function deliver(J, list) {
    const D = J.d, c = J.car;
    let total = 0;
    for (const q of list) {
      const r = carPt(c, -c.len / 2 - 0.7, rand(-0.5, 0.5)); r.car = c;
      unstow(q.p, r);
      q.p.ai = { owner: 'jobs', role: 'admit', t: 0, goal: { x: D.door.x - D.door.nx * 0.6, y: D.door.y - D.door.ny * 0.6, sp: 1.3 } };
      q.st = 'saved'; J.count++; J.streak++; D.saved++;
      total += pay(J, TUNE.medPay + 20 * J.level + Math.min(60, q.life) * 1.5, c.x, c.y - 1.5, 'patient');
    }
    D.doorsT = 3;
    say(PG.say(LINES.saved) + ' +' + fmt(total), 'style', true);
    X.emit('jobPaid', { id: 'medic', amount: total });
  }
  function levelDone(J) {
    const D = J.d, c = J.car;
    if (D.lost === 0) {
      const b = pay(J, 100 * J.level, c.x, c.y - 3, 'level');
      P.ped.hp = P.ped.maxHp;
      X.big('PARAMEDIC LEVEL ' + J.level + ' DONE', '#ff5a5a', 2400, '+' + fmt(b) + ' · health topped up');
      PG.audio.fanfare();
      J.level++;
    } else {
      X.big('LEVEL ' + J.level + ' AGAIN', '#ffb07a', 2000, D.saved + ' saved, ' + D.lost + ' lost');
    }
    D.saved = D.lost = 0; D.pats = []; D.nextT = 3.5;
  }

  // ================= FIREFIGHTER =================
  const FIRE = {
    name: 'Firefighter', title: 'FIREFIGHTER', color: '#ff7a2a', unit: 'fires',
    start(J) { J.d = { fires: [], nextT: 0.5, lost: 0, spot: null }; X.pager('DISPATCH: Car fires across town. Drive up close and spray them with the water cannon (fire button, aim with the mouse).', 7000); },
    tick(J, dt) {
      const D = J.d;
      if (D.nextT > 0) { J.obj = 'Stand by for the next fire'; J.timer = 0; if ((D.nextT -= dt) <= 0) newFire(J); return; }
      let minT = Infinity, maxT = 1, open = 0;
      for (const f of D.fires) {
        if (f.st !== 'burn') continue;
        const o = f.c;
        if (o.wrecked || o.removed) { f.st = 'lost'; D.lost++; J.streak = 0; o.keep = false; say('Too late! It blew up.', 'scrape', true); continue; }
        if (!(o.burning > 0)) { f.st = 'out'; o.keep = false; o.jobNeed = 0; J.count++; J.streak++; const got = pay(J, TUNE.firePay + 35 * J.level, o.x, o.y - 2, 'fire'); X.popup('Fire out! +' + fmt(got)); X.emit('jobPaid', { id: 'fire', amount: got }); continue; }
        open++;
        if (o.burning < minT) { minT = o.burning; maxT = o.burnMax || o.burning; }
      }
      J.timer = minT === Infinity ? 0 : minT; J.timerMax = maxT;
      J.obj = open ? 'Put out the fire' + (open > 1 ? 's (' + open + ' cars)' : '') + (D.spot ? ' on ' + D.spot.street : '') : '';
      if (!open && D.fires.length) {
        const c = J.car;
        if (!D.lost) { const b = pay(J, 120 * J.level, c.x, c.y - 3, 'level'); X.big('FIREFIGHTER LEVEL ' + J.level + ' DONE', '#ff7a2a', 2400, '+' + fmt(b)); PG.audio.fanfare(); J.level++; }
        else X.big('LEVEL ' + J.level + ' AGAIN', '#ffb07a', 2000, D.lost + ' burned out');
        D.fires = []; D.lost = 0; D.nextT = 4;
      }
    },
    marks(J) { for (const f of J.d.fires) if (f.st === 'burn' && !f.c.removed) mark(f.c.x, f.c.y, '#ff7a2a', 'FIRE', Math.max(3, f.c.len / 2 + 1)); },
    stats(J) { return `FIRES OUT ${J.count} · LEVEL ${J.level}`; },
    end(J) { for (const f of J.d.fires || []) if (f.c) { f.c.keep = false; } },
  };
  function newFire(J) {
    const D = J.d, c = J.car, n = Math.min(4, 1 + Math.floor(J.level / 2));
    const k = randomKerb(c.x, c.y, TUNE.fireR[0], TUNE.fireR[1], { inset: 0.9, hidden: true, margin: 16, tries: 60 });
    if (!k) { D.nextT = 1; return; }
    const cars = [];
    for (const o of X.cars) if (cars.length < n && !o.removed && !o.wrecked && o.ctrl === 'parked' && !o.owner && !o.jobFleet && !o.keep && !o.driver && !o.npcDriver && !(o.burning > 0) && !o.bombed && !o.shopLock && Math.hypot(o.x - k.x, o.y - k.y) < 22) cars.push(o);
    const models = ['hatch', 'comet', 'bambino', 'fjord', 'rancher', 'voltage', 'regret', 'boxvan', 'taxi'];
    for (let tries = 0; cars.length < n && tries < 18; tries++) {
      const a = k.a + (tries % 2 ? 1 : -1) * (2 + Math.floor(tries / 2) * 6.5);
      if (!clearOfJunctions(k.r, a, 4)) continue;
      const model = pick(models), pos = rpt(k.r, a, k.s, roadHW(k.r) + 0.55), q = { x: pos.x, y: pos.y, th: sideTh(k.r, k.s), r: k.r, a, s: k.s };
      if (!slotOK(X.modelDef(model), q)) continue;
      cars.push(X.makeCar(model, q.x, q.y, q.th, { ctrl: 'parked' }));
    }
    if (!cars.length) { D.nextT = 1; return; }
    const fuse = TUNE.fireFuse + dist(c, k) / 9 + rand(0, 8) - Math.min(15, J.level * 2);
    for (const o of cars) igniteCar(o, fuse + rand(-3, 5), 1.4 + 0.25 * Math.min(6, J.level));
    if (X.fireAt && J.level >= 2) for (let m = 0; m < 2; m++) X.fireAt(k.x + rand(-3, 3), k.y + rand(-3, 3), { r: rand(0.8, 1.2), life: rand(12, 25) });
    D.fires = cars.map(o => ({ c: o, st: 'burn' }));
    D.spot = { x: k.x, y: k.y, street: streetName(k.r) };
    sfx('radio');
    X.popup(cars.length > 1 ? cars.length + ' cars on fire on ' + D.spot.street : 'Car fire on ' + D.spot.street);
  }
  // A car fire that burns for `fuse` seconds before it blows. damage.js runs it when present; otherwise we do.
  function igniteCar(o, fuse, need) {
    o.keep = true; o.jobNeed = need || TUNE.fireNeed; o.jobWater = 0;
    if (X.setOnFire) X.setOnFire(o, fuse, null);
    if (!(o.burning > 0)) { o.burning = fuse; o.burnMax = fuse; o.ownFire = true; o.hp = Math.min(o.hp, o.maxHp * 0.12); S.ownFires.push(o); }
  }
  function ownFiresTick(dt) {
    for (let i = S.ownFires.length - 1; i >= 0; i--) {
      const o = S.ownFires[i];
      if (o.removed || o.wrecked || !o.ownFire || !(o.burning > 0)) { o.ownFire = false; S.ownFires.splice(i, 1); continue; }
      o.burning -= dt;
      o.hp = Math.max(1, Math.min(o.hp, o.maxHp * 0.12 * o.burning / (o.burnMax || 1)));
      if (X.inView(o.x, o.y, 6) && G().particles.length < 650) {
        const ex = carPt(o, o.len * 0.3, rand(-0.5, 0.5));
        if (Math.random() < dt * 40) G().particles.push({ x: ex.x + rand(-0.4, 0.4), y: ex.y + rand(-0.4, 0.4), vx: rand(-1, 1), vy: rand(-1, 1), life: rand(0.4, 0.8), max: 0.8, kind: 'fire', size: rand(0.35, 0.6) });
        if (Math.random() < dt * 10) G().particles.push({ x: ex.x, y: ex.y, vx: rand(-0.8, 0.8), vy: rand(-0.8, 0.8), life: rand(1.6, 2.6), max: 2.6, kind: 'smoke', size: rand(0.5, 0.8) });
      }
      if (o.burning <= 0) { o.ownFire = false; o.burning = 0; S.ownFires.splice(i, 1); X.destroyCar(o, o.lastBy || null, 'fire'); }
    }
  }
  function douse(o) {
    if (o.ownFire) { o.ownFire = false; o.burning = 0; o.hp = Math.max(o.hp, o.maxHp * 0.14); }
    else if (X.extinguish) X.extinguish(o);
    if (o.burning > 0) o.burning = 0;
    o.jobWater = 0;
    PG.burst(o.x, o.y, 'tsmoke', 14, 2.5, 2, 0.8);
    sfx('steam', o.x, o.y);
    X.emit('jobDoused', { car: o });
  }

  // ================= the water cannon (any fire truck you drive) =================
  function waterTick(dt) {
    const c = P.car, truck = c && c.model.kind === 'fire' && !c.wrecked ? c : null, J = S.jet;
    // the drops in flight
    for (let i = 0; i < NW; i++) {
      if (S.wl[i] <= 0) continue;
      S.wl[i] -= dt; S.wx[i] += S.wvx[i] * dt; S.wy[i] += S.wvy[i] * dt;
      const k = 1 - dt * 0.8; S.wvx[i] *= k; S.wvy[i] *= k;
    }
    J.on = false;
    if (!truck) { S.aim = null; S.aimRel = 0; return; }
    P.ped.fireCd = Math.max(P.ped.fireCd || 0, 0.2);   // the fire button is the hose, not a drive-by
    const piv = carPt(truck, truck.len * 0.1, 0);
    let want = truck.th;
    if (X.touch.aim != null) want = X.touch.aim;
    else if (X.input.mouseActive()) want = Math.atan2(X.mouse.wy - piv.y, X.mouse.wx - piv.x);
    // the turret turns with the truck and swivels towards the aim
    S.aimRel = (S.aimRel || 0) + cl(wrap(want - truck.th - (S.aimRel || 0)), -dt * 5, dt * 5);
    S.aim = truck.th + S.aimRel;
    if (P.state !== 'play' || !X.input.fireDown()) return;
    const ux = Math.cos(S.aim), uy = Math.sin(S.aim), x0 = piv.x + ux * 1.3, y0 = piv.y + uy * 1.3;
    const hit = X.raycast(x0, y0, x0 + ux * TUNE.jetLen, y0 + uy * TUNE.jetLen);
    const len = TUNE.jetLen * (hit ? hit.t : 1);
    Object.assign(J, { on: true, x0, y0, ux, uy, len, x1: x0 + ux * len, y1: y0 + uy * len });
    // drops: a stream with a little wobble, plus splashes where it lands
    const v = X.carVel(truck), wob = Math.sin(X.time * 23) * 0.04;
    for (let n = 0; n < 7; n++) {
      const i = S.wi = (S.wi + 1) % NW, sp = rand(15, 18), a = S.aim + wob + rand(-0.045, 0.045);
      S.wx[i] = x0; S.wy[i] = y0; S.wvx[i] = Math.cos(a) * sp + v.x; S.wvy[i] = Math.sin(a) * sp + v.y; S.wl[i] = len / sp * rand(0.85, 1.05);
    }
    for (let n = 0; n < 3; n++) {
      const i = S.wi = (S.wi + 1) % NW, a = rand(0, TAU), sp = rand(1.5, 4);
      S.wx[i] = J.x1; S.wy[i] = J.y1; S.wvx[i] = Math.cos(a) * sp; S.wvy[i] = Math.sin(a) * sp; S.wl[i] = rand(0.15, 0.35);
    }
    if ((S.hissT -= dt) <= 0) { S.hissT = 0.13; sfx('hiss'); }
    if ((S.wetT -= dt) <= 0) { S.wetT = 0.4; X.decal(J.x1 + rand(-0.5, 0.5), J.y1 + rand(-0.5, 0.5), 'wet', rand(0.8, 1.3), { color: 'rgba(24,36,50,0.2)' }); }
    // ground fires, burning people and props where it lands (burning cars soak up water below instead)
    if ((S.douseT -= dt) <= 0 && X.extinguish) {
      S.douseT = 0.12;
      for (let k = 0; k < 2; k++) {
        const x = k ? x0 + ux * len * 0.6 : J.x1, y = k ? y0 + uy * len * 0.6 : J.y1, r = k ? 1.2 : 1.8;
        if (!X.cars.some(o => o.burning > 0 && !o.wrecked && Math.abs(o.x - x) < r + o.len && Math.abs(o.y - y) < r + o.len)) X.extinguish(x, y, r);
      }
    }
    // burning cars soak up water until they go out
    for (const o of X.cars) {
      if (o.removed || o.wrecked || !(o.burning > 0) || Math.abs(o.x - x0) > len + o.len || Math.abs(o.y - y0) > len + o.len) continue;
      const dx = o.x - x0, dy = o.y - y0, al = cl(dx * ux + dy * uy, 0, len), ox = x0 + ux * al - o.x, oy = y0 + uy * al - o.y;
      if (ox * ox + oy * oy > Math.pow(Math.max(o.wid, o.len) * 0.5 + 0.7, 2)) continue;
      o.jobWater = (o.jobWater || 0) + dt;
      if (Math.random() < dt * 12) PG.burst(x0 + ux * al, y0 + uy * al, 'tsmoke', 2, 2, 1.2, 0.6);
      if (o.jobWater >= (o.jobNeed || TUNE.fireNeed)) douse(o);
    }
    // people in the way get bowled over (and put out)
    for (const p of X.peds) {
      if (p.isPlayer || p.dead || p.removed || p.hidden || p.car) continue;
      const dx = p.x - x0, dy = p.y - y0; if (Math.abs(dx) > len + 1 || Math.abs(dy) > len + 1) continue;
      const al = dx * ux + dy * uy; if (al < 0.5 || al > len + 0.6) continue;
      if (Math.abs(-dx * uy + dy * ux) > 0.8) continue;
      if (p.onFire > 0) { if (X.extinguish) X.extinguish(p); else p.onFire = 0; }
      if (p.knock <= 0.15 && !(p.hitCd > 0)) {
        p.knock = 0.9; p.vx = ux * 7.5; p.vy = uy * 7.5; p.spin = rand(-7, 7); p.hitCd = 0.6;
        X.damagePed(p, 1, P.ped, 'water');
        sfx('splash', p.x, p.y);
      } else { p.vx += ux * 18 * dt; p.vy += uy * 18 * dt; }
    }
  }

  // ================= VIGILANTE =================
  const MODELS_BY_LEVEL = [['hatch', 'comet', 'bambino'], ['fjord', 'rancher', 'regret'], ['voltage', 'x5', 'boxvan'], ['furia', 'x5', 'voltage']];
  const COLOR_NAMES = { '#d0141e': 'red', '#d64a3b': 'red', '#b0151a': 'red', '#8a1f1a': 'dark red', '#7a2a24': 'maroon', '#f2c230': 'yellow', '#f07a12': 'orange', '#4a6fa5': 'blue', '#1f4f9c': 'blue', '#1f3f6e': 'navy', '#1d2a44': 'navy', '#6b7f99': 'grey-blue', '#c9ccd1': 'silver', '#e8e8e8': 'white', '#eeeeee': 'white', '#f2f2f2': 'white', '#e9e4d8': 'cream', '#e9dcb8': 'beige', '#9fd0c8': 'mint', '#2b2d33': 'black', '#101214': 'black', '#3b4049': 'graphite', '#8a9199': 'grey', '#7d8a99': 'grey', '#3e5c4a': 'green', '#2f4a32': 'green', '#5a4a6b': 'purple', '#b08d3c': 'gold', '#e6e1d3': 'white' };
  const VIGIL = {
    name: 'Vigilante', title: 'VIGILANTE', color: '#5aa9ff', unit: 'suspects',
    start(J) { J.d = { target: null, spawnT: 1, timer: 0, max: 1, stopT: 0, gunT: 2, node: null, prev: null, gun: { kind: 'shooter', x: 0, y: 0, th: 0, car: null, fireCd: 0, rateMul: 1.6, inaccuracy: 0.12 } }; X.pager('DISPATCH: All units. Suspects are fleeing in stolen cars. Wreck them or box them in until they give up.', 6500); },
    tick(J, dt) {
      const D = J.d, c = J.car, tg = D.target;
      if (!tg) { J.obj = 'Wait for dispatch'; J.timer = 0; if ((D.spawnT -= dt) <= 0) { D.spawnT = 1; spawnSuspect(J); } return; }
      if (tg.removed) { escaped(J, 'Suspect lost.'); return; }
      D.timer -= dt; J.timer = D.timer; J.timerMax = D.max;
      const d = dist(c, tg);
      J.obj = 'Stop the ' + D.desc + (d < 60 ? ' (box it in or wreck it)' : '');
      if (D.timer <= 0 || d > TUNE.vigEscape) { escaped(J, 'The suspect got away.'); return; }
      if (Math.abs(tg.speed) < 1.5 && d < 13 && !tg.wrecked && !(tg.burning > 0) && tg.npcDriver) D.stopT += dt; else D.stopT = Math.max(0, D.stopT - dt * 2);
      if (D.stopT > 1.6) { arrest(J); return; }
      // crooks shoot back from level 3
      if (J.level >= 3 && X.fireWeapon && X.WEAPONS && d < 24 && (D.gunT -= dt) <= 0) {
        D.gunT = rand(0.7, 1.5) - Math.min(0.4, J.level * 0.05);
        const g = D.gun; g.x = tg.x; g.y = tg.y; g.car = tg; g.th = Math.atan2(c.y - tg.y, c.x - tg.x); g.fireCd = 0;
        if (X.lineOfSight(tg, c)) X.fireWeapon(g, J.level >= 5 && X.WEAPONS.uzi ? 'uzi' : 'pistol', g.th + rand(-0.12, 0.12));
      }
    },
    marks(J) { const tg = J.d.target; if (tg && !tg.removed && !tg.wrecked) mark(tg.x, tg.y, '#ff3b2f', 'SUSPECT', 3); },
    stats(J) { return `ARRESTS ${J.count} · LEVEL ${J.level}`; },
    end(J) { releaseSuspect(J.d.target); J.d.target = null; },
  };
  function releaseSuspect(tg) {
    if (!tg) return;
    if (tg.ai && tg.ai.owner === 'jobs') tg.ai = null;
    tg.owner = null; tg.keep = false;
    if (!tg.wrecked) tg.jobCrook = false;
  }
  function spawnSuspect(J) {
    const f = X.focus(), D = J.d, L = Math.min(J.level, 4) - 1;
    const model = pick(MODELS_BY_LEVEL[L]);
    const extra = Math.min(2, Math.floor((J.level - 1) / 2));
    const look = Object.assign(X.randomLook(), { shirt: pick(['#1b1f27', '#2b2d33', '#5a1a1a', '#f2f2f2']), pants: '#1b1f27', hat: Math.random() < 0.6 ? '#1b1f27' : null });
    const tg = X.spawnTraffic(f.x, f.y, TUNE.vigR[0], TUNE.vigR[1], model, { owner: 'jobs', keep: true, npcDriver: { look, team: 'civ', extra } });
    if (!tg) return;
    X.toPhys(tg);
    tg.jobCrook = true;
    if (J.level >= 5) { tg.hp = tg.maxHp = tg.maxHp * 1.5; }
    tg.ai = { owner: 'jobs', drive: crookDrive };
    D.target = tg; D.node = null; D.prev = null; D.stopT = 0; D.gunT = 2;
    D.max = D.timer = TUNE.vigTime + J.level * 4;
    const cn = COLOR_NAMES[tg.color] || 'dark';
    D.desc = cn + ' ' + tg.model.name;
    sfx('radio');
    X.pager('DISPATCH: Suspect fleeing in a ' + D.desc + '. ' + (J.level >= 3 ? 'Armed and dangerous.' : 'Approach with your bumper.'), 5000);
  }
  // Flee along the road grid: at every junction take the exit that leads furthest from the player.
  function crookDrive(c, dt) {
    const J = S && S.job;
    if (!J || J.id !== 'vigil' || J.d.target !== c) return null;
    const D = J.d, C = X.city, pp = X.playerPos();
    if (!D.node) {
      const rd = X.roadAt(c.x, c.y);
      if (rd && !rd.junction) {
        const fx = Math.cos(c.th), fy = Math.sin(c.th);
        if (rd.horiz) { let i = 0; while (i < C.xs.length - 2 && C.xs[i + 1] <= c.x) i++; D.node = fx >= 0 ? { i: i + 1, j: rd.idx } : { i, j: rd.idx }; D.prev = fx >= 0 ? { i, j: rd.idx } : { i: i + 1, j: rd.idx }; }
        else { let j = 0; while (j < C.ys.length - 2 && C.ys[j + 1] <= c.y) j++; D.node = fy >= 0 ? { i: rd.idx, j: j + 1 } : { i: rd.idx, j }; D.prev = fy >= 0 ? { i: rd.idx, j } : { i: rd.idx, j: j + 1 }; }
      } else { const n = X.nearestNode(c.x, c.y); D.node = { i: n.i, j: n.j }; D.prev = null; }
    }
    let nx = C.xs[D.node.i], ny = C.ys[D.node.j];
    if (Math.hypot(nx - c.x, ny - c.y) < 13) {
      let best = null, bs = -Infinity;
      for (let q = 0; q < 4; q++) {
        const a = D.node.i + DIRX[q], b = D.node.j + DIRY[q];
        if (a < 0 || b < 0 || a >= C.xs.length || b >= C.ys.length || (D.prev && D.prev.i === a && D.prev.j === b)) continue;
        const s = Math.hypot(C.xs[a] - pp.x, C.ys[b] - pp.y) + rand(0, 90);
        if (s > bs) { bs = s; best = { i: a, j: b }; }
      }
      if (best) { D.prev = D.node; D.node = best; nx = C.xs[best.i]; ny = C.ys[best.j]; }
    }
    // keep to the right-hand lane of the street we are on
    let tx = nx, ty = ny;
    if (D.prev) { const ex = nx - C.xs[D.prev.i], ey = ny - C.ys[D.prev.j], el = Math.hypot(ex, ey) || 1; tx -= ey / el * 3.5; ty += ex / el * 3.5; }
    const near = Math.hypot(pp.x - c.x, pp.y - c.y) < 110;
    const speed = near ? Math.min(31, 16 + J.level * 2.2) : 12;
    return X.steerCtl(c, tx, ty, { speed, dt, handbrake: J.level >= 2, reverseOk: true });
  }
  function arrest(J) {
    const D = J.d, tg = D.target, c = J.car;
    const out = X.ejectOccupants(tg, 'arrest');
    for (const p of out) {
      if (!p || p.dead) continue;
      p.jobCrook = true;
      if (S.hasPeds && X.crowd && X.crowd.claim) X.crowd.claim(p, 'jobs', { role: 'perp' }); else p.ai = { owner: 'jobs', role: 'perp' };
      p.ai.t = 0; p.ai.goal = null; p.ai.face = Math.atan2(c.y - p.y, c.x - p.x); p.pose = 'surrender'; p.vx = p.vy = 0;
      if (!S.mine.includes(p)) S.mine.push(p);
    }
    releaseSuspect(tg); D.target = null; D.spawnT = 4;
    const got = pay(J, TUNE.vigPay + 100 * J.level, tg.x, tg.y - 2, 'arrest');
    J.count++; J.streak++;
    X.big('SUSPECT ARRESTED', '#5aa9ff', 2000, '+' + fmt(got));
    cleanRecord(J);
    J.level++;
    X.emit('jobPaid', { id: 'vigil', amount: got });
  }
  function takedown(J, tg) {
    const D = J.d;
    S.excuse = { x: tg.x, y: tg.y, until: X.time + 1.5 };   // the blast and whoever was inside come with the job
    releaseSuspect(tg); D.target = null; D.spawnT = 4;
    const got = pay(J, TUNE.vigPay * 0.8 + 90 * J.level, tg.x, tg.y - 2, 'takedown');
    J.count++; J.streak++;
    X.big('SUSPECT TAKEN DOWN', '#5aa9ff', 2000, 'dead or alive · +' + fmt(got));
    cleanRecord(J);
    J.level++;
    X.emit('jobPaid', { id: 'vigil', amount: got });
  }
  function cleanRecord() {
    const w = Math.round(P.wanted || 0);
    if (w > 0 && X.police && X.police.setWanted) { X.police.setWanted(w - 1); X.popup('Good work, officer. One star off your record.'); }
  }
  function escaped(J, text) {
    const D = J.d;
    releaseSuspect(D.target); D.target = null; D.spawnT = 4;
    J.streak = 0;
    say(text, 'scrape', true);
    PG.audio.trombone();
  }

  // ================= jobs: start, stop, records =================
  const JOBS = { taxi: TAXI, bus: BUS, medic: MEDIC, fire: FIRE, vigil: VIGIL };
  for (const id in JOBS) JOBS[id].id = id;
  function startJob(id, c) {
    const def = JOBS[id];
    const J = { id, def, car: c, level: 1, count: 0, earned: 0, streak: 0, t: 0, timer: 0, timerMax: 1, obj: '', d: {} };
    S.job = J;
    if (def.start(J) === false) { S.job = null; X.popup('No ' + def.name + ' work around here'); return false; }
    X.big(def.title, def.color, 1800, id === 'bus' ? 'Route ' + J.d.num + ' · G to stop' : 'G to stop');
    sfx('start');
    X.emit('jobStart', { id, car: c });
    return true;
  }
  function endJob(reason, o) {
    const J = S && S.job; if (!J) return;
    S.job = null;
    J.def.end(J, reason);
    const r = rec(), k = r[J.id] || (r[J.id] = { best: 0, total: 0, shifts: 0 });
    const best = J.count > k.best && J.count > 0;
    k.best = Math.max(k.best, J.count); k.total += J.earned; k.shifts++;
    X.persist();
    if (!(o && o.quiet)) X.big(best ? 'NEW RECORD!' : 'SHIFT OVER', best ? '#ffd23a' : '#c9cdd6', 2600, `${J.count} ${J.def.unit} · ${fmt(J.earned)}${reason ? ' · ' + reason : ''}`);
    X.emit('jobEnd', { id: J.id, reason, earned: J.earned, count: J.count });
  }

  // ================= events =================
  X.on('carImpact', e => {
    const J = X.active && S && S.job; if (!J || e.car !== J.car || !(e.speed > 3.5) || !J.def.bump) return;
    J.def.bump(J, e.speed);
  });
  X.on('carDestroyed', e => {
    if (!X.active || !S) return;
    const J = S.job; if (!J) return;
    if (e.car === J.car) {   // whoever rode along goes with it
      for (const p of S.mine) if (p.car === e.car && !p.dead && !p.removed) { unstow(p, { x: e.car.x + rand(-1, 1), y: e.car.y + rand(-1, 1) }); X.killPed(p, e.by, 'explosion'); }
      endJob(J.car.model.name + ' destroyed');
    } else if (J.id === 'vigil' && e.car === J.d.target) takedown(J, e.car);
  });
  X.on('missionStart', () => { if (X.active && S && S.job) endJob('Trond needs you', { quiet: false }); });
  X.on('wasted', () => { if (X.active && S && S.job) endJob('Wasted'); });
  X.on('busted', () => { if (X.active && S && S.job) endJob('Busted'); });
  X.on('exitCar', e => { if (X.active && S && S.job && e.car === S.job.car) endJob('You left the ' + e.car.model.name); });
  X.on('respawn', e => {
    if (!X.active || !S || !e || !e.place || e.place.id !== 'hospital') return;
    const h = e.place.door;
    if (!X.cars.some(c => !c.removed && !c.wrecked && c.model.kind === 'ambulance' && Math.hypot(c.x - h.x, c.y - h.y) < 150)) parkFleetCar('ambulance', h, 3, 70, 'AMBULANCE');
  });
  // GTA2: the horn in an emergency vehicle switches the siren (police.js does this when present).
  X.on('horn', e => {
    if (!X.active || !S || X.has('police')) return;
    const c = e && e.car, k = c && c.model.kind;
    if (k === 'police' || k === 'swat' || k === 'ambulance' || k === 'fire') { c.siren = !c.siren; X.popup(c.siren ? 'Siren on' : 'Siren off', 1000); }
  });
  // Keep new kerbside parking out of the bus stops on the current route.
  const baseParked = X.spawnParked;
  X.spawnParked = function () {
    const c = baseParked.apply(this, arguments), sts = c && X.active && stopsOf();
    if (sts && sts.some(st => inStopZone(st, c.x, c.y, c.len / 2))) { X.removeCar(c); return null; }
    return c;
  };
  // Vigilante: running down a fleeing crook is the job, not a crime.
  const baseCrime = X.crime;
  X.crime = function (type, x, y, o) {
    if (X.active && S && S.job && S.job.id === 'vigil') {
      const e = S.excuse;
      if ((o && ((o.car && o.car.jobCrook) || (o.ped && o.ped.jobCrook))) || (e && X.time <= e.until && Math.hypot(x - e.x, y - e.y) < 16)) return { type, x, y, by: P.ped, excused: true };
    }
    return baseCrime.apply(this, arguments);
  };

  // ================= HUD =================
  const CSS = `
#gta-hud .j-box { --jc: #ffd23a; width: 236px; box-sizing: border-box; background: rgba(10,11,14,0.84); border-left: 4px solid var(--jc); border-radius: 4px; padding: 5px 10px 6px 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
#gta-hud .j-box .j-h { display: flex; align-items: center; gap: 7px; }
#gta-hud .j-box canvas { width: 26px; height: 26px; flex: none; }
#gta-hud .j-box .j-t { font-family: var(--display); font-size: 15px; letter-spacing: 0.05em; color: var(--jc); text-shadow: 0 2px 0 #000; text-transform: uppercase; white-space: nowrap; }
#gta-hud .j-box .j-lv { margin-left: auto; font-weight: 800; font-size: 11px; letter-spacing: 0.08em; color: #0b0c0f; background: var(--jc); border-radius: 3px; padding: 1px 5px; text-transform: uppercase; }
#gta-hud .j-box .j-o { font-weight: 800; font-size: 14px; line-height: 1.25; margin-top: 3px; text-shadow: 0 2px 0 #000; }
#gta-hud .j-box .j-tm { display: flex; align-items: center; gap: 7px; margin-top: 4px; }
#gta-hud .j-box .j-tm span { flex: 1; height: 7px; border-radius: 3px; background: rgba(255,255,255,0.15); overflow: hidden; }
#gta-hud .j-box .j-tm i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, var(--jc), #fff3b0); transition: width .2s linear; }
#gta-hud .j-box .j-tm b { font-family: var(--display); font-size: 19px; color: #fff; text-shadow: 0 2px 0 #000; font-variant-numeric: tabular-nums; min-width: 46px; text-align: right; }
#gta-hud .j-box .j-tm.low b { color: #ff4a3a; animation: jlow .5s steps(2) infinite; }
#gta-hud .j-box .j-tm.low i { background: linear-gradient(90deg, #ff4a3a, #ff9a7a); }
@keyframes jlow { 50% { color: #ffffff; } }
#gta-hud .j-box .j-r { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; margin-top: 3px; }
#gta-hud .j-box .j-s { font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #c9cdd6; }
#gta-hud .j-box .j-m { font-family: var(--display); font-size: 17px; color: #7dff9a; text-shadow: 0 2px 0 #000; font-variant-numeric: tabular-nums; }
#gta-hud .j-box .j-k { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); text-transform: uppercase; }
#gta-hud .j-hint { position: absolute; left: 50%; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: rgba(10,11,14,0.86); border: 1px solid #6b5a1e; border-radius: 999px; padding: 6px 14px; font-weight: 800; font-size: 16px; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; color: #ffe9a8; text-shadow: 0 1px 0 #000; }
@media (max-width: 600px) { #gta-hud .j-box { width: 190px; } #gta-hud .j-box .j-o { font-size: 12px; } #gta-hud .j-hint { font-size: 13px; bottom: calc(150px + env(safe-area-inset-bottom, 0px)); } }
`;
  let H = null;
  function hudEls() {
    if (H && H.box.isConnected) return H;
    const root = document.getElementById('gta-hud'); if (!root) return null;
    if (!document.getElementById('gta-jobs-css')) { const st = document.createElement('style'); st.id = 'gta-jobs-css'; st.textContent = CSS; document.head.appendChild(st); }
    const tl = root.querySelector('.g-tl') || root;
    let box = root.querySelector('.j-box');
    if (!box) {
      box = document.createElement('div'); box.className = 'j-box'; box.hidden = true;
      box.innerHTML = '<div class="j-h"><canvas width="52" height="52"></canvas><div class="j-t"></div><div class="j-lv"></div></div><div class="j-o"></div><div class="j-tm"><span><i></i></span><b></b></div><div class="j-r"><span class="j-s"></span><span class="j-m"></span></div><div class="j-k">G: stop the job</div>';
      tl.appendChild(box);
    }
    let hint = root.querySelector('.j-hint');
    if (!hint) { hint = document.createElement('div'); hint.className = 'j-hint'; hint.hidden = true; root.appendChild(hint); }
    const q = s => box.querySelector(s);
    H = { box, hint, icon: q('canvas'), t: q('.j-t'), lv: q('.j-lv'), o: q('.j-o'), tm: q('.j-tm'), bar: q('.j-tm i'), sec: q('.j-tm b'), s: q('.j-s'), m: q('.j-m'), k: {} };
    return H;
  }
  function put(key, v, fn) { if (H.k[key] !== v) { H.k[key] = v; fn(v); } }
  function drawIcon(cv, id) {
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 52, 52);
    c.translate(26, 26);
    if (id === 'taxi') { c.fillStyle = '#f2c230'; PG.rr(c, -11, -20, 22, 40, 6); c.fill(); c.fillStyle = '#1b2430'; c.fillRect(-8, -10, 16, 7); c.fillRect(-8, 8, 16, 5); c.fillStyle = '#1b1b1b'; c.fillRect(-6, -2, 12, 7); c.fillStyle = '#ffe680'; c.fillRect(-5, -1, 10, 5); }
    else if (id === 'bus') { c.fillStyle = '#d9381e'; PG.rr(c, -10, -22, 20, 44, 4); c.fill(); c.fillStyle = '#e9e6dc'; c.fillRect(-7, -17, 14, 34); c.fillStyle = '#18222d'; c.fillRect(-8, -21, 16, 4); c.fillStyle = '#ffb02e'; c.fillRect(-2, -14, 4, 28); }
    else if (id === 'medic') { c.fillStyle = '#f2f2f2'; c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.fill(); c.fillStyle = '#e8402f'; c.fillRect(-4, -14, 8, 28); c.fillRect(-14, -4, 28, 8); }
    else if (id === 'fire') { c.fillStyle = '#ff7a2a'; c.beginPath(); c.moveTo(0, -21); c.bezierCurveTo(14, -6, 16, 6, 12, 13); c.bezierCurveTo(8, 21, -8, 21, -12, 13); c.bezierCurveTo(-16, 4, -8, -2, -6, -10); c.bezierCurveTo(-2, -4, 0, -8, 0, -21); c.fill(); c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(0, 9, 7, 0, TAU); c.fill(); }
    else { c.fillStyle = '#5aa9ff'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 21; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.fillStyle = '#0b0c0f'; c.beginPath(); c.arc(0, 1, 5, 0, TAU); c.fill(); }
  }
  function hintText() {
    const c = P.car, jid = c && jobOf(c);
    return S && !S.job && jid && canWork() && !bombWaiting() ? 'G: start ' + JOBS[jid].name + ' job' + (jid === 'fire' ? ' · Fire: water cannon' : '') : '';
  }
  function hudTick() {
    const h = hudEls(); if (!h) return;
    const J = S && S.job;
    put('show', !!J, v => { h.box.hidden = !v; });
    if (J) {
      put('id', J.id, v => { h.box.style.setProperty('--jc', J.def.color); h.t.textContent = J.def.title; drawIcon(h.icon, v); });
      put('lv', J.id === 'taxi' ? 'x' + J.streak : J.id === 'bus' ? 'R' + J.d.num : 'LVL ' + J.level, v => { h.lv.textContent = v; });
      put('o', J.obj || '', v => { h.o.textContent = v; });
      const has = J.timer > 0 || (J.id === 'bus' && J.d.stops);
      put('tmh', !has, v => { h.tm.hidden = v; });
      if (has) {
        const late = J.id === 'bus' && J.timer < 0;
        put('sec', late ? 'LATE' : mmss(J.timer), v => { h.sec.textContent = v; });
        put('bar', late ? 0 : Math.round(cl(J.timer / (J.timerMax || 1), 0, 1) * 100), v => { h.bar.style.width = v + '%'; });
        put('low', late || J.timer < 10, v => h.tm.classList.toggle('low', v));
      }
      put('s', J.def.stats(J), v => { h.s.textContent = v; });
      put('m', fmt(J.earned), v => { h.m.textContent = v; });
    } else h.k.id = null;
    put('hint', hintText(), v => { h.hint.hidden = !v; h.hint.textContent = v; });
  }

  // ================= drawing =================
  // Text painted along `th` should read left to right (or top to bottom) on screen.
  function readable(ctx, th) { const a = th + (X.lastView ? X.lastView.rot : 0), c = Math.cos(a); if (c < -0.02 || (Math.abs(c) <= 0.02 && Math.sin(a) < 0)) ctx.rotate(Math.PI); }
  function drawBay(ctx, b) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.th);
    ctx.strokeStyle = b.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.16; ctx.setLineDash([0.9, 0.5]);
    ctx.strokeRect(-b.len / 2, -b.wid / 2, b.len, b.wid); ctx.setLineDash([]);
    // the rank name painted on the pavement beside it (local +y is the sidewalk side)
    ctx.globalAlpha = 0.6; ctx.fillStyle = b.color; ctx.font = '700 0.8px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(0, b.wid / 2 + 0.55); readable(ctx, b.th); ctx.fillText(b.label, 0, 0); ctx.restore();
    ctx.fillRect(-b.len / 2, b.wid / 2 + 0.05, 0.16, 1.0); ctx.fillRect(b.len / 2 - 0.16, b.wid / 2 + 0.05, 0.16, 1.0);
    ctx.restore();
  }
  function drawBusBox(ctx, st, t, next) {
    ctx.save(); ctx.translate(st.rx, st.ry); ctx.rotate(st.th);
    const L = 15, W = 3.1;
    ctx.globalAlpha = next ? 0.75 + 0.2 * Math.sin(t * 5) : 0.35;
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 0.18;
    ctx.beginPath(); ctx.rect(-L / 2, -W / 2, L, W); ctx.stroke();
    ctx.beginPath();   // zigzag along the kerb side
    for (let k = 0; k <= 20; k++) { const x = -L / 2 + k * L / 20; ctx.lineTo(x, W / 2 - (k % 2 ? 0.45 : 0.1)); }
    ctx.stroke();
    ctx.fillStyle = '#ffd23a'; ctx.font = '700 1.3px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(0, -0.15); readable(ctx, st.th); ctx.fillText('BUS', 0, 0); ctx.restore();
    ctx.globalAlpha = 1; ctx.restore();
  }
  function drawShelter(ctx, st, t, num) {
    // local frame: +x along the traffic, +y away from the road
    ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.th);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(-2.7, -0.6, 6, 1.9);
    ctx.fillStyle = '#2b3038'; ctx.fillRect(-3, 0.66, 6, 0.2);   // back wall
    ctx.fillStyle = '#5a4630'; ctx.fillRect(-2, 0.24, 4, 0.38);   // bench
    ctx.fillStyle = 'rgba(150,200,235,0.34)'; ctx.fillRect(-3, -0.85, 6, 1.7);   // glass roof
    ctx.strokeStyle = '#1b1f27'; ctx.lineWidth = 0.12; ctx.strokeRect(-3, -0.85, 6, 1.7);
    ctx.beginPath(); ctx.moveTo(-1, -0.85); ctx.lineTo(-1, 0.85); ctx.moveTo(1, -0.85); ctx.lineTo(1, 0.85); ctx.stroke();
    ctx.fillStyle = '#ff8a3a'; ctx.fillRect(-3, -0.85, 6, 0.14);   // route colour stripe along the front edge
    // backlit ad panel at the downstream end
    ctx.fillStyle = '#e9f4ff'; ctx.fillRect(2.82, -0.78, 0.36, 1.56);
    ctx.fillStyle = '#d9381e'; ctx.fillRect(2.88, -0.62, 0.24, 1.24);
    // the stop sign by the kerb
    ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.arc(-3.8, -1.75, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1f5fbf'; ctx.beginPath(); ctx.arc(-3.8, -1.75, 0.62, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.fillStyle = '#ffd23a'; ctx.font = '700 0.7px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(-3.8, -1.75); ctx.rotate(-st.th - (X.lastView ? X.lastView.rot : 0)); ctx.fillText(String(num), 0, 0.03); ctx.restore();
    ctx.restore();
  }
  function drawCross(ctx, x, y, t, s) {
    const b = Math.sin(t * 4 + x) * 0.1;
    ctx.save(); ctx.translate(x, y - 1.25 + b);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 0.5 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(0, 0, 0.42 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8402f'; ctx.fillRect(-0.09 * s, -0.3 * s, 0.18 * s, 0.6 * s); ctx.fillRect(-0.3 * s, -0.09 * s, 0.6 * s, 0.18 * s);
    ctx.restore();
  }
  function drawTurret(ctx, c, aim) {
    const p = carPt(c, c.len * 0.1, 0);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.rotate(aim);
    ctx.fillStyle = '#c9ccd1'; ctx.fillRect(0, -0.13, 1.35, 0.26);
    ctx.fillStyle = '#d4af37'; ctx.fillRect(1.15, -0.17, 0.25, 0.34);
    ctx.restore();
  }
  function drawWater(ctx, t) {
    ctx.lineCap = 'round';
    const J = S.jet;
    if (J.on && J.len > 0.5) {   // the solid core of the jet, wobbling a little
      const w = Math.sin(t * 31) * 0.18, mx = J.x0 + J.ux * J.len * 0.5 - J.uy * w, my = J.y0 + J.uy * J.len * 0.5 + J.ux * w;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? 'rgba(235,248,255,0.8)' : 'rgba(110,175,235,0.42)'; ctx.lineWidth = pass ? 0.1 : 0.34;
        ctx.beginPath(); ctx.moveTo(J.x0, J.y0); ctx.quadraticCurveTo(mx, my, J.x1, J.y1); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(220,240,255,0.35)'; ctx.beginPath(); ctx.arc(J.x1, J.y1, 0.55 + 0.15 * Math.sin(t * 40), 0, TAU); ctx.fill();
    }
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? 'rgba(235,248,255,0.75)' : 'rgba(120,185,240,0.55)'; ctx.lineWidth = pass ? 0.07 : 0.2;
      ctx.beginPath();
      for (let i = 0; i < NW; i++) {
        if (S.wl[i] <= 0) continue;
        const x = S.wx[i], y = S.wy[i];
        if (!X.inView(x, y, 2)) continue;
        ctx.moveTo(x, y); ctx.lineTo(x - S.wvx[i] * 0.035, y - S.wvy[i] * 0.035);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  function busDoors(ctx, c, open) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    const W = c.wid / 2;
    for (const u of [c.len / 2 - 1.7, -0.8]) {
      ctx.fillStyle = '#0c0d10'; ctx.fillRect(u - 0.65, W - 0.22, 1.3, 0.24);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(u - 0.55, W - 0.02, 1.1, 0.06);   // step light
      ctx.fillStyle = '#dcdcdc';
      ctx.save(); ctx.translate(u - 0.65, W); ctx.rotate(1.2 * open); ctx.fillRect(0, -0.06, 0.62, 0.12); ctx.restore();
      ctx.save(); ctx.translate(u + 0.65, W); ctx.rotate(-1.2 * open); ctx.fillRect(-0.62, -0.06, 0.62, 0.12); ctx.restore();
    }
    ctx.restore();
  }
  function rearDoors(ctx, c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    const L = c.len / 2, W = c.wid / 2;
    ctx.fillStyle = '#e8e8e8'; ctx.strokeStyle = '#7a2020'; ctx.lineWidth = 0.05;
    ctx.save(); ctx.translate(-L, -W + 0.05); ctx.rotate(-1.9); ctx.fillRect(0, -0.06, W - 0.05, 0.12); ctx.strokeRect(0, -0.06, W - 0.05, 0.12); ctx.restore();
    ctx.save(); ctx.translate(-L, W - 0.05); ctx.rotate(1.9); ctx.fillRect(0, -0.06, W - 0.05, 0.12); ctx.strokeRect(0, -0.06, W - 0.05, 0.12); ctx.restore();
    ctx.restore();
  }
  function bubble(ctx, x, y, text, color) {
    const sc = X.lastView ? X.lastView.scale : 30;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-(X.lastView ? X.lastView.rot : 0)); ctx.scale(1 / sc, 1 / sc);
    ctx.font = '800 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; PG.rr(ctx, -w / 2, -28, w, 19, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(4, -10); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color || '#16181c'; ctx.fillText(text, 0, -18);
    ctx.restore();
  }

  // ================= module =================
  X.mod('jobs', {
    order: 70,
    init() {
      S = fresh();
      wrapDrawPed();
      parkFleet();
      const h = hudEls(); if (h) { h.k = {}; h.box.hidden = true; h.hint.hidden = true; }
    },
    stop() {
      if (S && S.job) { const J = S.job; S.job = null; try { J.def.end(J, 'stop'); } catch (e) { /* the world is going away anyway */ } }
      if (H) { H.box.hidden = true; H.hint.hidden = true; H.k = {}; }
      S = null;
    },
    tick(dt) {
      if (!S) return;
      S.t += dt;
      waterTick(dt);
      ownFiresTick(dt);
      const c = P.car, J = S.job;
      const gp = X.input.pressed('KeyG') && !bombWaiting();
      if (J) {
        J.t += dt;
        if (J.car.removed || J.car.wrecked) endJob(J.car.model.name + ' wrecked');
        else if (P.car !== J.car) endJob('You left the ' + J.car.model.name);
        else if (P.state !== 'play') endJob(P.state === 'busted' ? 'Busted' : 'Wasted');
        else if (X.missions && X.missions.active) endJob('Trond needs you');
        else if (gp) endJob('Clocked off');
        else J.def.tick(J, dt);
      } else if (gp && c && jobOf(c) && canWork()) startJob(jobOf(c), c);
      pedsTick(dt);
      // fallback siren (police.js has the real one)
      if (c && c.siren && !X.has('police') && (S.sirenT -= dt) <= 0) { S.sirenT = 0.42; S.sirenHi = !S.sirenHi; sfx('nee'); }
      // the job fleet on the minimap, so the work can be found
      if (!S.job && !X.scene) for (const f of S.fleet) if (!f.removed && !f.wrecked && f !== P.car && Math.abs(f.x - X.focus().x) < 300 && Math.abs(f.y - X.focus().y) < 300) X.blip(f.x, f.y, BAYC[f.model.id] || '#ffd23a', { size: 2.6, shape: 'square' });
    },
    hud() { if (S) hudTick(); },
    render: {
      ground(ctx, view, t) {
        if (!S || X.scene) return;
        for (const b of S.bays) if (X.inView(b.x, b.y, b.len)) drawBay(ctx, b);
        const J = S.job;
        if (J && J.id === 'bus' && J.d.stops) for (let i = J.d.next; i < J.d.stops.length; i++) { const st = J.d.stops[i]; if (X.inView(st.rx, st.ry, 10)) drawBusBox(ctx, st, t, i === J.d.next); }
        if (J && X.time !== S.objT) { S.objT = X.time; J.def.marks(J); }
      },
      props(ctx, view, t) {
        if (!S || X.scene) return;
        const J = S.job;
        if (J && J.id === 'bus' && J.d.stops) for (let i = J.d.next; i < J.d.stops.length; i++) {
          const st = J.d.stops[i]; if (!X.inView(st.x, st.y, 6)) continue;
          drawShelter(ctx, st, t, J.d.num);
          X.addLight(st.x, st.y, 6, '#cfe6ff', 0.5);
        }
        for (const o of S.ownFires) if (X.inView(o.x, o.y, 8)) X.addLight(o.x, o.y, 9, '#ff8a30', 0.85 + 0.15 * Math.sin(t * 11 + o.id));
        if (J && J.id === 'medic') for (const q of J.d.pats || []) if (q.st === 'wait' && !gone(q.p) && X.inView(q.p.x, q.p.y, 4)) X.addLight(q.p.x, q.p.y, 4, '#ff3b3b', 0.35 + 0.25 * Math.sin(t * 6));
        if (J && J.id === 'taxi' && !J.d.fare) X.addLight(J.car.x, J.car.y, 3.2, '#ffe680', 0.5);
      },
      cars(ctx, view, t) {
        if (!S || X.scene) return;
        const J = S.job;
        for (const c of X.cars) if (c.model.kind === 'fire' && !c.wrecked && !c.removed && X.inView(c.x, c.y, c.len)) drawTurret(ctx, c, c === P.car && S.aim != null ? S.aim : c.th);
        if (!J) return;
        const c = J.car;
        if (!X.inView(c.x, c.y, c.len)) return;
        if (J.id === 'taxi') {   // the roof sign: lit while for hire, dark with a fare aboard
          const busy = J.d.stage === 'ride', p = carPt(c, -0.07, 0);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(c.th);
          ctx.fillStyle = busy ? '#3a3420' : '#fff1a0'; ctx.fillRect(-0.2, -0.38, 0.26, 0.76);
          if (busy) { ctx.fillStyle = '#ff3b2f'; ctx.fillRect(-0.12, -0.08, 0.1, 0.16); }
          ctx.restore();
        } else if (J.id === 'bus' && J.d.phase === 'dwell') busDoors(ctx, c, 1);
        else if (J.id === 'medic' && J.d.doorsT > 0) rearDoors(ctx, c);
      },
      air(ctx, view, t) { if (S && !X.scene) drawWater(ctx, t); },
      overlay(ctx, view, t) {
        if (!S || X.scene) return;
        // soak meter over burning cars being hosed
        for (const o of X.cars) {
          if (!(o.jobWater > 0) || !(o.burning > 0) || o.wrecked || o.removed || !X.inView(o.x, o.y, 4)) continue;
          const k = cl(o.jobWater / (o.jobNeed || TUNE.fireNeed), 0, 1), y = o.y - o.len / 2 - 1.4;
          ctx.lineWidth = 0.32; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(o.x, y, 0.75, 0, TAU); ctx.stroke();
          ctx.strokeStyle = '#7fd0ff'; ctx.beginPath(); ctx.arc(o.x, y, 0.75, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
        }
        const J = S.job;
        // above the night: the casualty's cross and the fare's shout
        if (J && J.id === 'medic') { for (const q of J.d.pats || []) if (q.st === 'wait' && !gone(q.p) && X.inView(q.p.x, q.p.y, 3)) drawCross(ctx, q.p.x, q.p.y, t, 1); }
        else if (J && J.id === 'taxi') { const f = J.d.fare; if (f && !gone(f) && !f.hidden && f.pose === 'wave' && X.inView(f.x, f.y, 3)) bubble(ctx, f.x, f.y - 0.6 - Math.abs(Math.sin(t * 3)) * 0.15, 'TAXI!'); }
        if (J && J.id === 'vigil') { const tg = J.d.target; if (tg && !tg.removed && !tg.wrecked && X.inView(tg.x, tg.y, 4)) { const b = Math.abs(Math.sin(t * 5)) * 0.4; ctx.fillStyle = '#ff3b2f'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 0.1; const y = tg.y - tg.len / 2 - 1.6 - b; ctx.beginPath(); ctx.moveTo(tg.x - 0.6, y - 0.7); ctx.lineTo(tg.x + 0.6, y - 0.7); ctx.lineTo(tg.x, y + 0.1); ctx.closePath(); ctx.stroke(); ctx.fill(); } }
      },
    },
  });

  // ================= API =================
  X.jobs = {
    get active() { const J = S && S.job; return J ? { id: J.id, name: J.def.name, level: J.level, count: J.count, earned: J.earned, streak: J.streak, timer: J.timer, obj: J.obj, stage: J.d.stage || J.d.phase || null } : null; },
    get run() { return S ? S.job : null; },
    start(id) { const c = P.car, jid = jobOf(c); if (!S || S.job || !jid || (id && id !== jid) || !canWork()) return false; return startJob(jid, c); },
    stop(reason) { if (S && S.job) { endJob(reason || 'Clocked off'); return true; } return false; },
    // for a touch button: what G would do right now ('' = nothing), and doing it
    get hint() { return S ? (S.job ? 'G: stop the ' + S.job.def.name + ' job' : hintText()) : ''; },
    toggle() { return S && S.job ? X.jobs.stop() : X.jobs.start(); },
    jobOf,
    get fleet() { return S ? S.fleet.filter(c => !c.removed) : []; },
    get bays() { return S ? S.bays : []; },
    get mine() { return S ? S.mine : []; },
    get jet() { return S ? S.jet : null; },
    get records() { return rec(); },
    drops() { if (!S) return 0; let n = 0; for (let i = 0; i < NW; i++) if (S.wl[i] > 0) n++; return n; },
    ignite: (c, fuse, need) => S ? igniteCar(c, fuse || 60, need) : null,
    tune: TUNE, JOBS, LINES,
  };
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
