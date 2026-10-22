// Police for Grand Theft Bus. Crimes the cops see (or hear about from callers) build heat, and heat is the
// wanted level: 0-6 stars in P.wanted that flash and cool off once no cop has eyes on the suspect. At 0 stars
// cruisers patrol in lane traffic and officers walk the sidewalks; from 1 star they hunt: cruisers drive the
// road grid with sirens wailing (doppler included), ram and box the player in, crews jump out, chase on foot
// and arrest at the car door, or shoot (punch, without weapons.js). 3 stars brings roadblocks with stingers,
// 4 SWAT vans, 5 the Ørn-1 helicopter with its searchlight, 6 the army. Plus a police station with parked
// cruisers, a stake-out and SWAT raid when the suspect hides indoors, radio chatter, POLITI liveries and
// light bars that light up the night. Owns P.wanted / P.wantedFlash and X.police.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;

  // ================= tuning =================
  const LV = [0, 100, 300, 650, 1100, 1700, 2500], MAXH = 3300;   // heat at which each star lights up
  const CRIME = { shoot: 35, assault: 22, hitPed: 30, killPed: 45, carjack: 14, stealCopCar: 330, hitCop: 70, killCop: 190, hitCopCar: 40, destroyCar: 60, explosion: 70, robbery: 330, trespass: 110, heist: 700 };
  const COP_CRIME = { stealCopCar: 1, hitCop: 1, killCop: 1, hitCopCar: 1 };
  const CRIME_CD = { shoot: 0.8, assault: 0.4, hitCopCar: 1.5, explosion: 0.4, hitPed: 0.25, hitCop: 0.4 };
  const CRIME_NAME = { shoot: 'shots fired', assault: 'a fist fight', hitPed: 'a hit-and-run', killPed: 'a body on the pavement', carjack: 'a stolen car', destroyCar: 'a burning car', explosion: 'an explosion', robbery: 'a robbery', trespass: 'a break-in', heist: 'a bank job' };
  // Tests and other modules may poke these.
  const TUNE = { grace: 6, graceStar: 2, decay: 7, decayFar: 2.6, farDist: 140, seeCar: 50, seeFoot: 34, witness: 45, arrestFoot: 0.75, arrestCar: 1.5, raidAfter: 14, patrolCars: 2, patrolFoot: 2, maxCars: 12, maxCops: 22 };
  const PURSUIT = [0, 2, 3, 4, 5, 6, 6];
  const SPEED = [14, 20, 24, 28, 31, 34, 36];
  const KINDS = {
    cop: { hp: 100, armor: 0, crew: 2, run: 6.6, dmgMul: 0.3, rateMul: 2.3, inacc: 0.11, range: 24, gun: l => (l >= 4 ? 'uzi' : 'pistol') },
    swat: { hp: 130, armor: 60, crew: 4, run: 6.8, dmgMul: 0.32, rateMul: 1.7, inacc: 0.08, range: 26, gun: () => 'uzi' },
    army: { hp: 150, armor: 90, crew: 4, run: 6.9, dmgMul: 0.36, rateMul: 1.5, inacc: 0.07, range: 34, gun: () => 'rifle' },
  };
  // Six stars in GTA2 means tanks. Never in traffic (weight 0); the army brings them, the player may keep one.
  if (!X.MODELS.tank) X.MODELS.tank = { name: 'Army Tank', kind: 'tank', box: true, len: 7.4, wid: 3.4, wb: 4.4, turn: 17, hp: 9000, value: 0, weight: 0, color: '#4a5634',
    dyn: { m: 26000, ff: 0.5, h: 1.3, drive: 'A', type: 'ice', kw: 1100, nm: 5200, red: 2600, n: 4, v1: 14, vN: 70, cyl: 12, vmax: 70, z100: 22, cda: 9, shift: 0.5, mu: 1.15 } };
  const skin = () => X.randomLook().skin;
  const LOOKS = {
    cop: () => ({ skin: skin(), hair: '#2a2018', shirt: '#2c4f8a', pants: '#18203a', hat: '#121a2c', outfit: 'cop' }),
    swat: () => ({ skin: skin(), hair: '#111111', shirt: '#262a31', pants: '#1b1e24', hat: '#0b0d10', outfit: 'swat' }),
    army: () => ({ skin: skin(), hair: '#111111', shirt: '#4d5b34', pants: '#3b4729', hat: '#3f4b2b', hatType: 'helmet', outfit: 'army' }),
  };
  const SHOUT = ['STOPP! POLITI!', 'Stopp der!', 'Politi! Ned på bakken!', 'Freeze!', 'Hey! You!'];
  const SHOUT_ARMY = ['Contact!', 'Target sighted!', 'Engage!'];
  const SHOUT_ARREST = ['Hendene opp!', 'You are nicked!', 'Hands where I can see them!'];
  const SHOUT_HURT = ['Au!', 'Pokker!', 'Officer hit!'];
  const SHOUT_CAR = ['STOPP BILEN!', 'Kjør til siden!', 'PULL OVER!', 'Stop the vehicle!', 'This is the police!'];

  // Police radio. {dir} northbound.., {dirw} north.., {district}, {car}, {colour}, {kmh}, {unit}, {bank}, {what}.
  const LINES = {
    pursuit: [
      'All units: suspect {dir} on {district} in a {colour} {car}.',
      'Unit {unit} in pursuit through {district}, doing {kmh}.',
      'Suspect vehicle: {colour} {car}. Driving: criminal. Also illegal.',
      'Dispatch: suspect last seen {dir} in {district}.',
      'Requesting backup in {district}. And coffee. Mostly coffee.',
      'Be advised: suspect may be working for Artur.',
      'Unit {unit}: I have eyes on the {car}. Oh. Lost the eyes.',
      'Suspect is NOT taking the bus. Repeat: NOT taking the bus.',
      'Unit {unit}: they just went through a red. Also a hedge.',
    ],
    foot: [
      'Suspect on foot in {district}, heading {dirw}.',
      'Foot pursuit in {district}. Somebody bring the good shoes.',
      'Suspect running {dirw}. Running! In this economy!',
    ],
    bus: ['Suspect IS taking the bus. Respect. Still pursue.', 'Suspect in a city bus. Do NOT ask them for a ticket.'],
    copcar: ['Has anyone seen car {unit}? Anyone? My lunch was in it.', 'Suspect is driving one of OUR cars. This is embarrassing.'],
    up: [null,
      ['Dispatch: report of a disturbance in {district}.', 'Unit {unit} responding in {district}.', 'Dispatch: suspect in {district}. Unit {unit}, take it.'],
      ['All units: suspect is armed and very rude. {district}.', 'Suspect fleeing {dir} in {district}. All units.'],
      ['Roadblocks authorised. Stingers out in {district}.', 'Use of force authorised in {district}. Try not to enjoy it.'],
      ['SWAT en route to {district}. Somebody wake up Sven.', 'SWAT rolling. Suspect: a {colour} {car}.'],
      ['Air unit Ørn-1 lifting off. ETA: dramatic.', 'Ørn-1 scrambled to {district}.'],
      ['This is now a military matter. Good luck, suspect.', 'The army is coming. Through {district}. Sorry, {district}.'],
    ],
    officerDown: ['Officer down in {district}! Officer down!', '10-99 in {district}. Shots fired at police!', 'Man down! {district}! Everybody, everything!'],
    unitDown: ['We lost unit {unit}! Repeat, unit {unit} is toast!', 'Car {unit} is on fire. That was a new car.'],
    lost: ['All units: suspect lost. Back to the doughnuts.', 'We lost them. Write it up as a parking violation.', 'Suspect lost in {district}. Nobody tell the chief.'],
    busted: ['Suspect in custody. Somebody tell Artur.', 'Got one. Book them for everything. And the parking.', 'Suspect secured. Their driving remains at large.'],
    patrol: [
      'Unit {unit}, 10-8, back on patrol in {district}.',
      'Dispatch: a moose on the ring road. Again.',
      'Noise complaint in {district}: someone honking at a parking space.',
      'Reminder: the Pay \'n\' Spray is NOT a car wash.',
      'Unit {unit}: the bakery in {district} has fresh skillingsboller.',
      'A man in {district} reports his bus is late. Advise him to take the bus.',
      'All units: Artur was seen near a car park. Keep an eye on the car park.',
    ],
    heli: ['Ørn-1 on station over {district}. Lights on.', 'Ørn-1: I have the suspect in the light.'],
    heliDown: ['Ørn-1 is going down! Ørn-1 is...', 'We lost the helicopter. The CHIEF will hear about this.'],
    roadblock: ['Roadblock up in {district}. Let us see them get through that.', 'Stingers deployed in {district}.'],
    door: ['Suspect went inside in {district}. Units waiting at the door.', 'They are hiding indoors. We have all night. We have coffee.'],
    raid: ['SWAT going in. Wipe your feet.', 'Breach, breach, breach!'],
    bank: ['ALARM at {bank}! All units to {district}!', '211 in progress at {bank}! Everybody go!'],
    respray: ['Dispatch: suspect vehicle... changed colour? Never mind.', 'All units: we lost the description. Stand down.'],
    call: ['Caller reports {what} in {district}. Units responding.', 'Dispatch: a citizen in {district} says "{what}". Again.'],
    swap: ['Suspect switched cars! Now in a {colour} {car}.', 'They jacked a {car}. Keep up, people.'],
  };

  // ================= state =================
  const S = {};
  function reset() {
    Object.assign(S, {
      heat: 0, seen: false, seenT: -99, lastX: 0, lastY: 0, near: 1e9, px: 0, py: 0, pvx: 0, pvy: 0, fx: 0, fy: 0,
      cars: [], cops: [], blocks: [], flat: [], shells: [], heli: null, units: [], guns: false,
      arrest: 0, arrestCar: 0, arrestBy: null, mgrT: 0, seeT: 0, spawnT: 1.5, blockT: 6, heliT: 3, guardT: 0, restockT: 20,
      chatT: rand(25, 45), radioQ: [], radioT: 0, radioP: 0, shoutT: 0, crimeCd: {}, callT: -99, hitCopT: -99,
      unitNo: 2 + Math.floor(Math.random() * 20), slotN: 0, entry: null, inT: 0, raided: false, purge: false, sirenD: 1e9,
      arrestSaid: 0,
    });
  }
  reset();

  const isCop = p => p.team === 'cop' || (p.ai && p.ai.owner === 'police');
  const usable = c => !!c && !c.removed && !c.wrecked && c.owner === 'police' && c !== P.car && !(c.burning > 0);
  const hasGuns = () => X.has('weapons') && !!(X.WEAPONS && X.WEAPONS.pistol) && X.fireWeapon.length >= 3;
  const night = () => X.clock > 19 * 60 || X.clock < 6.5 * 60;
  const face = (p, dx, dy, dt) => { if (dx || dy) p.th += wrap(Math.atan2(dy, dx) - p.th) * Math.min(1, dt * 10); };

  // ================= heat and stars =================
  function levelOf(h) { let l = 0; while (l < 6 && h >= LV[l + 1]) l++; return l; }
  function setHeat(h) {
    S.heat = cl(h, 0, MAXH);
    const l = levelOf(S.heat), was = P.wanted || 0;
    if (l === was) return;
    P.wanted = l;
    if (l > was) {
      S.spawnT = Math.min(S.spawnT, 0.4);
      if (l >= 3 && was < 3) S.blockT = Math.min(S.blockT, 5);
      if (l >= 5 && was < 5) S.heliT = Math.min(S.heliT, 1.5);
      if (PG.audio.star) PG.audio.star(Math.min(5, l - 1));
      radio(say(LINES.up[l]), 1);
    } else if (l === 0) {
      S.heat = 0; P.wantedFlash = false; S.arrest = S.arrestCar = 0;
      standDown();
      if (P.state === 'play') { X.popup('Lost the cops'); radio(say(LINES.lost), 2); if (PG.audio.chime) PG.audio.chime(4); }
    }
    X.emit('wanted', { level: l, was });
  }
  function syncPos() {
    if (!X.active || !P.ped) return;
    const pp = X.playerPos(), pv = X.playerVel(), f = X.focus();
    S.px = pp.x; S.py = pp.y; S.pvx = pv.x; S.pvy = pv.y; S.fx = f.x; S.fy = f.y;
  }
  // A reported position as a point in the city: crimes inside an interior happen at its street door.
  function inCity(x, y) { const C = X.city; return !!C && x > -60 && y > -60 && x < C.W + 60 && y < C.H + 60; }
  function report(x, y) {
    if (x == null || !inCity(x, y)) { const f = X.focus(); x = f.x; y = f.y; }
    S.lastX = x; S.lastY = y;
  }
  function see() { const f = X.scene ? X.focus() : X.playerPos(); S.seenT = X.time; S.lastX = f.x; S.lastY = f.y; P.wantedFlash = false; }
  function addHeat(n) { if (!X.active || P.state !== 'play') return; if (n > 0) see(); setHeat(S.heat + n); }
  function setWanted(level) {
    syncPos();
    const l = cl(Math.round(level || 0), 0, 6), was = P.wanted || 0;
    if (!l) return clear();
    if (l > was) see();
    setHeat(LV[l] + (l < 6 ? (LV[l + 1] - LV[l]) * 0.35 : 300));
  }
  // Report the suspect at (x, y): bank alarms, mission scripts.
  function alert(x, y, level) {
    if (level) setWanted(Math.max(P.wanted || 0, level));
    S.seenT = X.time; report(x, y); P.wantedFlash = false;
  }
  function clear() {
    const was = P.wanted || 0;
    S.heat = 0; P.wanted = 0; P.wantedFlash = false; S.arrest = S.arrestCar = 0;
    standDown();
    if (was) X.emit('wanted', { level: 0, was });
  }
  // Back to normal: cruisers rejoin traffic, officers walk back to their cars, the helicopter goes home.
  function standDown() {
    for (const c of S.cars) {
      const u = c.pol; if (!u || c.removed) continue;
      if (u.role === 'pursuit') { u.role = c.npcDriver ? 'patrol' : 'empty'; c.siren = false; if (c.ai && c.ai.owner === 'police') c.ai = null; }
    }
    for (const p of S.cops) { const a = p.ai; if (a && (a.state === 'chase' || a.state === 'board' || (a.state === 'guard' && !a.station && !a.post))) a.state = 'calm'; }
    if (S.heli && S.heli.state === 'chase') S.heli.state = 'leave';
  }
  // Stars flash once nobody has seen the suspect for a while, then fade one by one (fast when far away).
  function decay(dt) {
    const l = P.wanted || 0;
    if (!l) { if (X.time - S.seenT > 3) setHeat(S.heat - 8 * dt); P.wantedFlash = false; return; }
    const unseen = X.time - S.seenT, flash = unseen > TUNE.grace + TUNE.graceStar * l && P.state === 'play';
    P.wantedFlash = flash;
    if (!flash) return;
    let per = S.near > TUNE.farDist ? TUNE.decayFar : TUNE.decay;
    if (X.scene && l >= 3) per *= 2;     // the door is being watched
    const band = (l < 6 ? LV[l + 1] : MAXH) - LV[l];
    setHeat(S.heat - band / per * dt - 0.01);
  }

  // A cop (on foot, in a car or the helicopter's light) who can see (x, y), or null.
  function witness(x, y) {
    let best = null, bd = TUNE.witness;
    for (const p of X.peds) {
      if (p.dead || p.removed || p.hidden || p.car || !isCop(p)) continue;
      const dx = p.x - x, dy = p.y - y; if (dx > bd || dx < -bd || dy > bd || dy < -bd) continue;
      const d = Math.hypot(dx, dy); if (d < bd && !X.raycast(p.x, p.y, x, y)) { bd = d; best = p; }
    }
    if (best) return best;
    for (const c of S.cars) {
      if (c.removed || c.wrecked || !c.npcDriver) continue;
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
      if (d < TUNE.witness + 10 && !X.raycast(c.x, c.y, x, y)) return c;
    }
    const h = S.heli; if (h && h.state === 'chase' && Math.hypot(h.sx - x, h.sy - y) < 14) return h;
    return null;
  }

  X.on('crime', e => {
    if (!X.active || !X.city || P.state !== 'play' || !e) return;
    if (e.by && !X.byPlayer(e.by)) return;
    const type = e.type, cd = CRIME_CD[type];
    if (cd) { const last = S.crimeCd[type]; if (last != null && X.time - last < cd && X.time >= last) return; S.crimeCd[type] = X.time; }
    let n = CRIME[type] != null ? CRIME[type] : 40, floor = true;
    const x = e.x != null ? e.x : S.px, y = e.y != null ? e.y : S.py, cop = !!COP_CRIME[type];
    const wit = cop ? true : witness(x, y);
    if (type === 'hitCopCar') {
      if (P.wanted >= 1) { n = 8; floor = false; }                      // part of the chase: they ram you too
      else if ((e.speed || 0) < 6) { n = 38; floor = false; }           // a bump; a couple of those and they have had enough
      else n = LV[1] + 30;
    }
    if (wit) {
      n *= cop ? 1.6 : 2.5;
      if (floor && S.heat + n < LV[1] + 20) n = LV[1] + 20 - S.heat;
      see();
      if (wit.kind === 'ped' && wit.ai && wit.ai.owner === 'police') { if (wit.ai.state === 'patrol' || wit.ai.state === 'calm' || wit.ai.state === 'leave') wit.ai.state = 'chase'; shout(wit, SHOUT); }
    }
    else if (S.heat + n >= LV[1]) {   // reported, not seen: they know where it happened
      report(x, y); S.seenT = Math.max(S.seenT, X.time - TUNE.grace * 0.5);
    }
    setHeat(S.heat + n);
    if (type === 'killCop') radio(say(LINES.officerDown), 2);
    else if (type === 'stealCopCar') radio(say(LINES.copcar, { unit: e.car && e.car.pol ? e.car.pol.no : S.unitNo }), 1);
  });
  // Bullets, fists and fire on an officer (car hits are reported by core as hitCop).
  X.on('pedHurt', e => {
    const p = e.ped;
    if (!X.active || !p || !isCop(p) || e.kind === 'car' || !X.byPlayer(e.by) || P.state !== 'play') return;
    if (X.time - S.hitCopT < 0.5 && X.time >= S.hitCopT) return;
    S.hitCopT = X.time;
    addHeat(CRIME.hitCop * 1.6);
    if (p.ai && p.ai.owner === 'police' && !p.dead) { if (p.ai.state !== 'board') p.ai.state = 'chase'; if (Math.random() < 0.35) shout(p, SHOUT_HURT, true); }
  });
  X.on('pedKilled', e => {
    const p = e.ped;
    if (!X.active || !p || !p.ai || p.ai.owner !== 'police') return;
    if (p.team !== 'cop' && X.byPlayer(e.by)) { addHeat(CRIME.killCop * 1.6 - CRIME.killPed); radio(say(LINES.officerDown), 2); }   // soldiers
  });
  X.on('carDestroyed', e => {
    const c = e.car;
    if (!X.active || !c || !c.pol || !X.byPlayer(e.by)) return;
    if (c.pol.role !== 'parked') { addHeat(160); radio(say(LINES.unitDown, { unit: c.pol.no }), 2); }
  });
  // Civilians on the phone (peds.js): a reported crime brings at least one star.
  X.on('witnessCall', e => {
    if (!X.active || P.state !== 'play' || !e || !e.crime) return;
    const c = e.crime; if (c.by && !X.byPlayer(c.by)) return;
    if (X.time - S.callT < 4 && X.time >= S.callT) return;
    S.callT = X.time;
    const violent = /kill|hit|shoot|assault|explosion|destroy|robbery|heist/.test(c.type || '');
    let n = (CRIME[c.type] || 30) * 0.8;
    if (violent && S.heat + n < LV[1] + 10) n = LV[1] + 10 - S.heat;
    setHeat(S.heat + n);
    if (P.wanted && X.time - S.seenT > 3) report(c.x, c.y);
    if (P.wanted) radio(say(LINES.call, { what: CRIME_NAME[c.type] || 'trouble', district: X.districtAt(c.x || S.px, c.y || S.py) }), 0);
  });
  X.on('heistAlarm', e => {
    if (!X.active) return;
    const b = X.places && X.places.bank, x = e && e.x != null ? e.x : b ? b.door.x : S.px, y = e && e.y != null ? e.y : b ? b.door.y : S.py;
    alert(x, y, Math.max(3, (e && e.level) || 3));
    radio(say(LINES.bank, { district: X.districtAt(x, y) }), 3);
  });
  X.on('carSprayed', e => {
    if (!X.active || !(P.wanted > 0) || (e && e.car && e.car !== P.car)) return;
    clear(); radio(say(LINES.respray), 2);
  });
  X.on('busted', () => {
    if (!X.active) return;
    clear(); radio(say(LINES.busted), 3); cuffs();
  });
  X.on('respawn', () => { if (!X.active) return; clear(); S.purge = true; S.entry = null; });
  // GTA2: the horn in an emergency vehicle switches the siren.
  X.on('horn', e => {
    const c = e && e.car; if (!X.active || !c || !c.model) return;
    const k = c.model.kind;
    if (k === 'police' || k === 'swat' || k === 'ambulance' || k === 'fire') { c.siren = !c.siren; X.popup(c.siren ? 'Siren on' : 'Siren off', 1000); }
  });
  X.on('carjack', e => {
    const c = e && e.car;
    if (X.active && c && c.pol && c.model.kind !== 'police' && c.model.kind !== 'swat') addHeat(CRIME.stealCopCar * 1.6);
  });
  X.on('enterCar', e => {
    if (!X.active || !P.wanted || !e.car) return;
    if (X.time - S.seenT < 1.5) radio(say(e.car.model.kind === 'bus' ? LINES.bus : LINES.swap), 1);
  });
  // Officers thrown out of a burning or jacked cruiser are still officers.
  X.on('pedEjected', e => {
    const p = e && e.ped, c = e && e.car;
    if (!X.active || !p || p.isPlayer || p.ai || p.dead) return;
    if (p.team !== 'cop' && !(c && c.pol)) return;
    const kind = c && c.pol ? c.pol.kind : 'cop';
    p.look = LOOKS[kind](); arm(p, kind);
    p.ai = newAi(kind, 'chase'); p.ai.car = c && c.pol && c.owner === 'police' ? c : null;
    if (kind === 'army') { p.team = 'army'; p.hostile = true; } else p.team = 'cop';
    S.cops.push(p);
  });
  X.on('sceneChange', e => {
    if (!X.active) return;
    S.inT = 0; S.raided = false;
    S.entry = e && e.scene && P.ped ? { x: P.ped.x, y: P.ped.y } : null;
    if (e && e.scene && P.wanted && X.time - S.seenT < 6) radio(say(LINES.door), 1);
  });
  X.on('carRepaired', e => { if (e && e.car && e.car.polFlat > 0) unflat(e.car); });

  // ================= units =================
  function newAi(kind, state) {
    return { owner: 'police', kind, state, car: null, t: 0, losT: 0, see: false, navT: 0, route: null, ri: 0, clear: false, stuck: 0, side: 0, sideT: 0,
      fireT: rand(0.5, 1), burst: 0, punchT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strT: rand(0.8, 2), ox: rand(-5, 5), oy: rand(-5, 5),
      px: 0, py: 0, th0: null, patrol: false, station: false, indoor: null, blk: null, ci: null, dir: 1, pause: 0, tx: null, ty: null, shoutT: 0 };
  }
  function arm(p, kind) {
    const K = KINDS[kind];
    p.dmgMul = K.dmgMul; p.rateMul = K.rateMul; p.inaccuracy = K.inacc; p.copKind = kind;
    p.weapon = S.guns && (kind !== 'cop' || P.wanted >= 2) ? K.gun(P.wanted) : null;
  }
  function makeCop(x, y, kind, state, o) {
    const K = KINDS[kind];
    const p = X.makePed(Object.assign({ x, y, th: rand(-Math.PI, Math.PI), team: kind === 'army' ? 'army' : 'cop', look: LOOKS[kind](), hp: K.hp, maxHp: K.hp, armor: K.armor, ai: newAi(kind, state) }, o));
    if (kind === 'army') p.hostile = true;
    arm(p, kind);
    S.cops.push(p);
    return p;
  }
  function newPol(role, kind) {
    return { role, kind, no: S.unitNo++, slot: S.slotN++, navT: 0, n: 0, wp: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
      los: false, losT: 0, stuckT: 0, stopping: false, out: [], doorT: -99 };
  }
  function makeCopCar(model, x, y, th, role, kind, o) {
    const K = KINDS[kind];
    const c = X.makeCar(model, x, y, th, Object.assign({ owner: 'police', npcDriver: { look: LOOKS[kind](), team: kind === 'army' ? 'army' : 'cop', extra: K.crew - 1 }, siren: role === 'pursuit' || role === 'block' }, o));
    c.pol = newPol(role, kind);
    if (model === 'tank') { c.pol.tank = true; c.npcDriver && (c.npcDriver.extra = 1); c.siren = false; c.turret = th; c.gunCd = 3; }
    else if (kind === 'army') { c.color = '#3d4a2c'; c.polArmy = true; c.siren = false; c.hp = c.maxHp = 5200; }
    S.cars.push(c);
    return c;
  }
  const PURSUIT_AI = { owner: 'police', drive: carDrive };
  function toPursuit(c) {
    c.pol.role = 'pursuit'; c.siren = !c.polArmy && !c.pol.tank;
    if (c.ctrl !== 'phys') X.toPhys(c);
    c.ai = PURSUIT_AI;
  }

  // ================= road-grid navigation for cruisers =================
  // Waypoints along road centre lines from car c to (tx, ty), preferring junctions ahead of the car (no U-turn
  // unless it pays) and junctions far enough away to make the turn. Fills out[], returns the count.
  let bestCost = 0, bestN = 0;
  function consider(cost, out, pre, a) {
    if (cost >= bestCost) return;
    bestCost = cost; let n = 0;
    if (pre) { out[n].x = pre.x; out[n].y = pre.y; n++; }
    for (let i = 0; i < a.length; i += 2) { out[n].x = a[i]; out[n].y = a[i + 1]; n++; }
    bestN = n;
  }
  function leg(c, fx, fy, horiz, idx, tr, tx, ty, out, pre, turnD, atJ) {
    const C = X.city, A = horiz ? C.xs : C.ys, pos = horiz ? c.x : c.y, fa = horiz ? fx : fy, line = horiz ? C.ys[idx] : C.xs[idx];
    const pen = d => (d * fa < -4 ? 70 + Math.abs(d) : 0) + (!atJ && d * fa > 0 && Math.abs(d) < turnD ? 30 : 0);
    const tAlong = horiz ? tr.x : tr.y, tAcross = horiz ? tr.y : tr.x;
    const pt = (a, b) => (horiz ? [a, b] : [b, a]);
    if (tr.horiz === horiz && tr.idx === idx) { const d = tAlong - pos; consider(Math.abs(d) + (d * fa < -4 ? 70 : 0), out, pre, [...pt(tAlong, line), tx, ty]); return; }
    if (tr.horiz !== horiz) { const J = A[tr.idx], d = J - pos; consider(Math.abs(d) + Math.abs(tAcross - line) + pen(d), out, pre, [...pt(J, line), ...pt(J, tAcross), tx, ty]); return; }
    const L2 = horiz ? C.ys[tr.idx] : C.xs[tr.idx];
    for (let i = 0; i < A.length; i++) {
      const J = A[i], d = J - pos;
      consider(Math.abs(d) + Math.abs(L2 - line) + Math.abs(tAlong - J) + pen(d) + Math.abs(d) * 0.01, out, pre, [...pt(J, line), ...pt(J, L2), ...pt(tAlong, L2), tx, ty]);
    }
  }
  function plan(c, tx, ty, out) {
    const fx = Math.cos(c.th), fy = Math.sin(c.th), sp = Math.max(0, c.speed || 0);
    const tr = X.nearestRoadPoint(tx, ty), turnD = sp * sp / 16 + 3;
    let r = X.roadAt(c.x, c.y), pre = null;
    if (!r) { pre = X.nearestRoadPoint(c.x + fx * 6, c.y + fy * 6); r = pre; }   // off-road: rejoin ahead, not behind
    bestCost = Infinity; bestN = 0;
    if (r.junction) { leg(c, fx, fy, true, r.h.idx, tr, tx, ty, out, pre, 0, true); leg(c, fx, fy, false, r.v.idx, tr, tx, ty, out, pre, 0, true); }
    else leg(c, fx, fy, r.horiz, r.idx, tr, tx, ty, out, pre, turnD, false);
    return bestN;
  }

  // ================= cruiser AI =================
  const HOLD = { fwd: 0, rev: 0, hand: true, steerAbs: 0 }, BRAKE_F = { fwd: 0, rev: 1, hand: false, steerAbs: 0 }, BRAKE_R = { fwd: 1, rev: 0, hand: false, steerAbs: 0 };
  function stopCtl(c) { const v = c.dv ? c.dv.v : 0; return v > 0.9 ? BRAKE_F : v < -0.9 ? BRAKE_R : HOLD; }
  const SLOT = { x: 0, y: 0 };
  // Where to park when boxing in the suspect: in front, behind, the passenger side (keep the driver's door free).
  function slotFor(u, pc, tx, ty, c) {
    if (!pc) { const dx = c.x - tx, dy = c.y - ty, d = Math.hypot(dx, dy) || 1; SLOT.x = tx + dx / d * 7; SLOT.y = ty + dy / d * 7; return SLOT; }
    const fx = Math.cos(pc.th), fy = Math.sin(pc.th), L = pc.len / 2 + 3.3, W = pc.wid / 2 + 2.6, s = u.slot % 4;
    if (s === 0) { SLOT.x = pc.x + fx * L; SLOT.y = pc.y + fy * L; }
    else if (s === 1) { SLOT.x = pc.x - fx * L; SLOT.y = pc.y - fy * L; }
    else if (s === 2) { SLOT.x = pc.x - fy * W; SLOT.y = pc.y + fx * W; }
    else { SLOT.x = pc.x + fx * L * 0.8 - fy * W; SLOT.y = pc.y + fy * L * 0.8 + fx * W; }
    if (X.blocked(SLOT.x, SLOT.y, 1.2)) { SLOT.x = pc.x - fx * L; SLOT.y = pc.y - fy * L; }
    return SLOT;
  }
  function carDrive(c, dt) {
    const u = c.pol;
    if (!u || u.role !== 'pursuit' || c.wrecked || !c.npcDriver) return null;
    if (P.state !== 'play') { u.stopping = true; return stopCtl(c); }
    const lvl = Math.max(1, P.wanted || 0), pc = X.scene ? null : P.car;
    let tx, ty, door = false, search = false;
    if (X.scene) { const cp = X.scene.cityPos || X.focus(); tx = cp.x; ty = cp.y; door = true; }
    else if (X.time - S.seenT < 3 || u.los) { tx = S.px; ty = S.py; }
    else { tx = S.lastX; ty = S.lastY; if (Math.hypot(tx - c.x, ty - c.y) < 22) { tx = S.px; ty = S.py; search = true; } }
    const d = Math.hypot(tx - c.x, ty - c.y);
    u.losT -= dt;
    if (u.losT <= 0) { u.losT = 0.25; u.los = !door && d < 46 && !X.raycast(c.x, c.y, tx, ty); }
    let spd = SPEED[lvl] + (d > 90 ? 6 : 0), ax = tx, ay = ty, ram = false, nav = true;
    u.stopping = false;
    if (door) { if (d < 13) { u.stopping = true; return stopCtl(c); } }
    else if (u.tank && u.los && d < 40) { u.stopping = true; return stopCtl(c); }   // in range: stop and let the gun talk
    else if (u.los && (!pc || pc.speed < 4.5)) {
      // pull up next to the suspect; the crew does the rest
      const s = slotFor(u, pc, tx, ty, c), ds = Math.hypot(s.x - c.x, s.y - c.y);
      if (ds < 3.2 || d < (pc ? 7.5 : 9)) { u.stopping = true; return stopCtl(c); }
      ax = s.x; ay = s.y; nav = false; ram = true;
      spd = Math.min(spd, Math.max(3, Math.sqrt(12 * Math.max(0, ds - 3))));
    } else if (u.los) {
      // ram: aim where the suspect will be
      const lead = cl(d / 22, 0.15, 1.2);
      ax = tx + S.pvx * lead; ay = ty + S.pvy * lead; nav = false; ram = true;
      spd = Math.max(spd, Math.hypot(S.pvx, S.pvy) + 7);
    }
    if (nav) {
      u.navT -= dt;
      if (u.navT <= 0) { u.navT = 0.3; u.n = plan(c, tx, ty, u.wp); }
      if (u.n) {
        const reach = Math.max(6, c.speed * c.speed / 8);   // turn in early: a cruiser needs room
        let k = 0;
        while (k < u.n - 1 && Math.hypot(u.wp[k].x - c.x, u.wp[k].y - c.y) < reach) k++;
        ax = u.wp[k].x; ay = u.wp[k].y;
        if (k < u.n - 1) {   // brake for the corner in time
          const a1 = Math.atan2(ay - c.y, ax - c.x), a2 = Math.atan2(u.wp[k + 1].y - ay, u.wp[k + 1].x - ax), turn = Math.abs(wrap(a2 - a1));
          if (turn > 0.5) { const vc = turn > 2.2 ? 5 : turn > 1.2 ? 9 : 13, dk = Math.hypot(ax - c.x, ay - c.y); spd = Math.min(spd, Math.sqrt(vc * vc + 14 * Math.max(0, dk - 9))); }
        }
      }
      if (search) spd = Math.min(spd, 13);
      if (door) spd = Math.min(spd, Math.max(6, (d - 10) * 0.8));
    }
    if (!door && (!pc || pc.speed < 4.5)) spd = Math.min(spd, Math.max(3, Math.sqrt(10 * Math.max(0, d - 7))));   // don't flatten a parked suspect
    // swerve around whatever blocks the road ahead (except the suspect when ramming)
    const fx = Math.cos(c.th), fy = Math.sin(c.th), look = 5 + c.speed * 0.8;
    let best = look, lat0 = 0, half0 = 0, hit = false;
    for (let i = 0; i < X.cars.length; i++) {
      const o = X.cars[i];
      if (o === c || o.removed || (ram && o === P.car)) continue;
      const ox = o.x - c.x, oy = o.y - c.y;
      if (ox > look + 6 || ox < -look - 6 || oy > look + 6 || oy < -look - 6) continue;
      const al = ox * fx + oy * fy; if (al < 1.5 || al > best) continue;
      const lat = -ox * fy + oy * fx, half = (c.wid + o.wid) / 2 + 0.5 + Math.abs(Math.sin(o.th - c.th)) * (o.len - o.wid) / 2;
      if (Math.abs(lat) > half) continue;
      best = al; lat0 = lat; half0 = half; hit = true;
    }
    if (hit) {
      const sgn = lat0 > 0.2 ? -1 : lat0 < -0.2 ? 1 : (u.slot % 2 ? 1 : -1);
      for (let tries = 0; tries < 2; tries++) {
        const s = tries ? -sgn : sgn, want = lat0 + s * (half0 + 0.7);
        const sx = c.x + fx * (best + 1) - fy * want, sy = c.y + fy * (best + 1) + fx * want;
        if (!X.blocked(sx, sy, 1.1)) { ax = sx; ay = sy; spd = Math.min(spd, Math.max(9, c.speed)); break; }
      }
    }
    return drive(c, ax, ay, spd, dt, d < 25);
  }
  // core's pure pursuit, with the steering damped by the yaw rate and counter-steer in a slide, so cruisers
  // corner hard without spinning out
  function drive(c, ax, ay, spd, dt, reverseOk) {
    const ctl = X.steerCtl(c, ax, ay, { speed: spd, dt, handbrake: true, reverseOk });
    const v = c.dv;
    if (v && !(c.backT > 0) && v.v > 3) {
      const err = wrap(Math.atan2(ay - c.y, ax - c.x) - c.th), beta = v.beta || 0;
      ctl.steerAbs = cl(err * 1.4 + beta * 0.6 - v.r * 0.22, -1, 1);
      if (Math.abs(beta) > 0.5) ctl.hand = false;
    }
    if (v && ctl.fwd && v.spinR > 0.2) ctl.thrMax = 0.6;   // traction control: less smoke, more go
    return ctl;
  }
  // Everyone out: the crew becomes real officers at the doors.
  function crewExit(c) {
    const nd = c.npcDriver; if (!nd) return;
    const n = 1 + (nd.extra || 0), kind = c.pol.kind;
    const out = [];
    for (let k = 0; k < n; k++) {
      const s = X.doorSpot(c, k % 2 ? 1 : -1); if (!s) continue;
      const p = makeCop(s.x + rand(-0.25, 0.25), s.y + rand(-0.25, 0.25), kind, 'chase', { th: c.th + (k % 2 ? 1 : -1) * Math.PI / 2 });
      if (k === 0) p.look = nd.look;
      p.ai.car = c; p.ai.fireT = rand(0.6, 1.2);
      out.push(p);
    }
    if (!out.length) return;   // jammed in
    c.npcDriver = null; c.ai = null; c.pol.role = 'empty'; c.pol.out = out; c.pol.doorT = X.time;
    if (!X.scene) shout(out[0], kind === 'army' ? SHOUT_ARMY : SHOUT);
    doorSlam(c.x, c.y, out.length);
  }
  // the two-note chirp of a patrol car lighting up
  function whoop(c) {
    const d = Math.hypot(c.x - S.fx, c.y - S.fy), k = d < 90 ? PG.audio.kit() : null; if (!k) return;
    const v = 0.05 * (1 - d / 90), t = k.now;
    for (const o of [0, 0.22]) k.tone('sawtooth', 520, t + o, 0.18, v, { to: 1500, lp: 2600 });
  }
  function doorSlam(x, y, n) {
    const k = PG.audio.kit(); if (!k || Math.hypot(x - S.fx, y - S.fy) > 45) return;
    for (let i = 0; i < Math.min(n, 3); i++) { const t = k.now + i * 0.13 + Math.random() * 0.05; k.noise(t, 0.09, 0.22, 'lowpass', 700, { to: 160 }); k.tone('sine', 90, t, 0.08, 0.18, { to: 55 }); }
  }
  function board(p, c) {
    p.removed = true;
    if (c.npcDriver) c.npcDriver.extra = (c.npcDriver.extra || 0) + 1;
    else c.npcDriver = { look: p.look, team: p.team, extra: 0 };
    const i = c.pol.out.indexOf(p); if (i >= 0) c.pol.out.splice(i, 1);
    if (P.wanted >= 1) toPursuit(c);
    else { c.pol.role = 'patrol'; c.siren = false; c.ai = null; }
  }
  function carTick(c, dt) {
    const u = c.pol;
    if (!u || c.removed) return;
    if (u.tank) c.treadPh = (c.treadPh || 0) + c.v * dt;
    if (c.owner !== 'police') { u.role = 'stolen'; return; }
    if (c.wrecked) { u.role = 'wreck'; c.siren = false; return; }
    if (u.role === 'pursuit') {
      if (!c.npcDriver) { u.role = 'empty'; if (c.ai === PURSUIT_AI) c.ai = null; return; }
      if (!c.ai && !(c.burning > 0)) toPursuit(c);
      if (!u.stopping && c.speed < 1.5) u.stuckT += dt; else u.stuckT = Math.max(0, u.stuckT - dt * 2);
      if (P.state !== 'play') return;
      const tx = X.scene ? S.fx : S.px, ty = X.scene ? S.fy : S.py, d = Math.hypot(tx - c.x, ty - c.y);
      const slow = X.scene || !P.car || P.car.speed < 3;
      if (P.car && u.los && d < 24 && X.time - S.shoutT > 4 && Math.random() < dt * 0.6 && X.inView(c.x, c.y, -3)) {   // loudspeaker
        S.shoutT = X.time; X.floatText(c.x, c.y - 1.5, pick(SHOUT_CAR), '#9cc4ff', { size: 16, life: 1.6 });
      }
      if (u.tank) { tankGun(c, u, d, dt); return; }
      if ((u.stopping && c.speed < 2.5 && d < 20 && slow) || (u.stuckT > 5 && d < 40)) crewExit(c);
      else if (S.guns && (P.wanted || 0) >= 4 && (c.npcDriver.extra || 0) >= 1 && u.los && d < 26 && !X.scene) windowGunner(c, u, dt);
    } else if (u.role === 'empty') {
      let n = 0; for (let i = 0; i < u.out.length; i++) { const p = u.out[i]; if (!p.removed && !p.dead) u.out[n++] = p; } u.out.length = n;
    } else if (u.role === 'patrol' && !c.npcDriver) u.role = 'empty';   // the crew bailed out of a burning car
  }

  // ================= the tank and the window gunners =================
  const turnTo = (a, want, max) => a + cl(wrap(want - a), -max, max);
  function tankGun(c, u, d, dt) {
    const ang = Math.atan2(S.py + S.pvy * 0.3 - c.y, S.px + S.pvx * 0.3 - c.x);
    c.turret = turnTo(c.turret == null ? c.th : c.turret, u.los ? ang : c.th, 1.1 * dt);
    c.gunCd -= dt;
    if (c.gunCd > 0 || !u.los || d > 70 || d < 9 || P.state !== 'play' || Math.abs(wrap(ang - c.turret)) > 0.06) return;
    if (friendInLine(c, S.px, S.py, P.car, c)) { c.gunCd = 0.5; return; }
    c.gunCd = rand(3, 4.5);
    fireShell(c, c.turret, c);
  }
  // At 4 stars the passenger leans out of the window.
  function windowGunner(c, u, dt) {
    u.gunT = (u.gunT || rand(0.8, 1.6)) - dt;
    if (u.gunT > 0) return;
    const g = u.gunner || (u.gunner = { kind: 'gunner', team: 'cop', x: 0, y: 0, th: 0, car: c, fireCd: 0, dmgMul: 0.26, inaccuracy: 0.14, rateMul: 1.6 });
    const tx = P.car ? P.car.x : S.px, ty = P.car ? P.car.y : S.py, ang = Math.atan2(ty - c.y, tx - c.x);
    g.x = c.x; g.y = c.y; g.th = ang; g.aim = ang;
    if (friendInLine(g, tx, ty, P.car, c)) { u.gunT = 0.4; return; }
    if (X.fireWeapon(g, u.kind === 'cop' ? 'pistol' : 'uzi', ang)) { u.gunB = (u.gunB || 4) - 1; if (u.gunB <= 0) { u.gunB = 4; u.gunT = rand(2.2, 3.8); } }
  }
  function fireShell(c, ang, by) {
    const L = 5.2, mx = c.x + Math.cos(ang) * L, my = c.y + Math.sin(ang) * L;
    if (S.shells.length < 12) S.shells.push({ x: mx, y: my, vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, t: 0, by, src: c });
    c.recoil = 0.7;
    if (X.inView(mx, my, 10)) { PG.burst(mx, my, 'fire', 10, 5, 0.25, 0.5); PG.burst(mx, my, 'smoke', 12, 3, 1.4, 0.7); }
    const d = Math.hypot(mx - S.fx, my - S.fy);
    if (d < 60) G().shake = Math.max(G().shake, 0.35 * (1 - d / 60));
    const k = d < 160 ? PG.audio.kit() : null;
    if (k) { const v = 1 - d / 160, t = k.now; k.tone('sine', 75, t, 0.7, 0.55 * v, { to: 28 }); k.noise(t, 0.6, 0.45 * v, 'lowpass', 1600, { to: 140 }); k.noise(t, 0.08, 0.3 * v, 'highpass', 2500); }
    X.emit('gunfire', { x: mx, y: my, by, weapon: 'tank', radius: 70 });
    if (X.byPlayer(by)) X.crime('shoot', mx, my, { weapon: 'tank' });
  }
  const SHELL_RC = { cars: true, peds: true, ignore: [null, null], pad: 0.2 };
  function shellsTick(dt) {
    let n = 0;
    for (let i = 0; i < S.shells.length; i++) {
      const sh = S.shells[i];
      sh.t += dt;
      const nx = sh.x + sh.vx * dt, ny = sh.y + sh.vy * dt;
      SHELL_RC.ignore[0] = sh.src; SHELL_RC.ignore[1] = sh.by;
      const h = X.raycast(sh.x, sh.y, nx, ny, SHELL_RC);
      if (h || sh.t > 1.25) {
        const ex = h ? h.x : nx, ey = h ? h.y : ny;
        X.explode(ex, ey, { by: sh.by, power: 1.5, source: 'shell' });
        continue;
      }
      sh.x = nx; sh.y = ny;
      S.shells[n++] = sh;
    }
    S.shells.length = n;
  }
  // Steal a tank and it is yours: aim the turret with the mouse, fire as usual.
  function playerTank(dt) {
    const c = P.car;
    c.treadPh = (c.treadPh || 0) + c.v * dt;
    if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 2);
    const want = X.touch.aim != null ? X.touch.aim : X.input.mouseActive() ? Math.atan2(X.mouse.wy - c.y, X.mouse.wx - c.x) : c.th;
    c.turret = turnTo(c.turret == null ? c.th : c.turret, want, 1.8 * dt);
    c.gunCd = (c.gunCd || 0) - dt;
    if (P.state === 'play' && c.gunCd <= 0 && X.input.fireDown()) { c.gunCd = 1.2; fireShell(c, c.turret, P.ped); }
  }

  // ================= officers on foot =================
  const DOOR = { x: 0, y: 0 };
  function carDoor(c, out) {   // the driver's door, as core opens it
    const fx = Math.cos(c.th), fy = Math.sin(c.th), m = c.wid / 2 + 0.45;
    out.x = c.x + fy * m + fx * 0.3; out.y = c.y - fx * m + fy * 0.3; return out;
  }
  function runTo(p, a, tx, ty, speed, dt, stopR) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < (stopR || 0.6)) { X.movePed(p, dt, 0, 0); face(p, dx, dy, dt); return d; }
    let ax = tx, ay = ty;
    a.losT -= dt;
    if (!a.indoor && d > 4) {
      if (a.losT <= 0) { a.losT = 0.35; a.clear = !X.raycast(p.x, p.y, tx, ty); }
      if (!a.clear) {
        a.navT -= dt;
        if (a.navT <= 0 || !a.route) { a.navT = 1.2; a.route = X.route(p.x, p.y, tx, ty); a.ri = 0; }
        const R = a.route;
        while (a.ri < R.length - 1 && Math.hypot(R[a.ri].x - p.x, R[a.ri].y - p.y) < 2.2) a.ri++;
        ax = R[a.ri].x; ay = R[a.ri].y;
      }
    }
    let wx = ax - p.x, wy = ay - p.y; const wl = Math.hypot(wx, wy) || 1;
    wx = wx / wl * speed; wy = wy / wl * speed;
    if (a.side) {   // unstick: slide sideways for a moment
      a.sideT -= dt; const sx = -wy * a.side, sy = wx * a.side; wx = wx * 0.3 + sx; wy = wy * 0.3 + sy;
      if (a.sideT <= 0) a.side = 0;
    } else if (p.speed < speed * 0.25) { a.stuck += dt; if (a.stuck > 0.7) { a.stuck = 0; a.side = Math.random() < 0.5 ? 1 : -1; a.sideT = 0.6; a.navT = 0; a.losT = 0; } }
    else a.stuck = 0;
    X.movePed(p, dt, wx, wy); face(p, wx, wy, dt);
    return d;
  }
  // Walk the sidewalk ring of the block, corner to corner.
  function patrolWalk(p, a, dt) {
    const b = a.blk || (a.blk = X.blockAt(p.x, p.y));
    if (!b) { X.movePed(p, dt, 0, 0); return; }
    const s = 2.4;
    const cx = i => (i === 0 || i === 3 ? b.x0 + s : b.x1 - s), cy = i => (i < 2 ? b.y0 + s : b.y1 - s);
    if (a.ci == null) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < 4; i++) { const d = Math.hypot(cx(i) - p.x, cy(i) - p.y); if (d < bd) { bd = d; bi = i; } }
      a.ci = bi; a.dir = Math.random() < 0.5 ? 1 : 3;
    }
    if (a.pause > 0) { a.pause -= dt; X.movePed(p, dt, 0, 0); return; }
    const dx = cx(a.ci) - p.x, dy = cy(a.ci) - p.y, d = Math.hypot(dx, dy);
    if (d < 0.8) { a.ci = (a.ci + a.dir) % 4; if (Math.random() < 0.3) a.pause = rand(1, 3); X.movePed(p, dt, 0, 0); return; }
    X.movePed(p, dt, dx / d * 1.45, dy / d * 1.45); face(p, dx, dy, dt);
  }
  const IGN = [null, null, null, null], FRIEND_RC = { cars: true, peds: true, ignore: IGN, pad: 0.15 };
  function friendInLine(p, tx, ty, pc, own) {
    IGN[0] = p; IGN[1] = P.ped; IGN[2] = pc || P.ped; IGN[3] = own || p;
    const h = X.raycast(p.x, p.y, tx, ty, FRIEND_RC);
    if (!h) return false;
    if (h.kind === 'solid') return true;
    if (h.kind === 'ped') return isCop(h.obj);
    return h.obj.owner === 'police' && !h.obj.wrecked;
  }
  function aimAndFire(p, a, dt) {
    const pc = P.car, tx = pc ? pc.x : S.px, ty = pc ? pc.y : S.py;
    const lead = Math.min(0.35, Math.hypot(tx - p.x, ty - p.y) / 60);
    const ang = Math.atan2(ty + S.pvy * lead - p.y, tx + S.pvx * lead - p.x);
    p.th += wrap(ang - p.th) * Math.min(1, dt * 12); p.aim = p.th;
    a.fireT -= dt;
    if (a.fireT > 0 || Math.abs(wrap(ang - p.th)) > 0.3 || !p.weapon) return;
    if (friendInLine(p, tx, ty, pc)) { a.fireT = 0.25; return; }
    if (a.burst <= 0) a.burst = a.kind === 'cop' ? 2 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 5);
    if (X.fireWeapon(p, p.weapon, p.th)) { if (--a.burst <= 0) a.fireT = rand(0.9, 1.9) * (a.kind === 'cop' ? 1.2 : 0.8); }
  }
  function punch(p, a, dx, dy, d) {
    if (a.punchT > 0) return;
    a.punchT = 0.9;
    const ang = Math.atan2(dy, dx); p.th = ang;
    if (S.guns && X.fireWeapon(p, 'fists', ang)) return;
    X.damagePed(P.ped, 6, p, 'melee');
    P.ped.vx += dx / d * 2.5; P.ped.vy += dy / d * 2.5;
    if (Math.random() < 0.25) { P.ped.knock = 0.45; P.ped.spin = rand(-4, 4); }
    const k = PG.audio.kit(); if (k) { k.noise(k.now, 0.08, 0.3, 'lowpass', 900, { to: 200 }); k.tone('sine', 120, k.now, 0.1, 0.25, { to: 60 }); }
  }
  function chase(p, a, dt, K) {
    const lvl = P.wanted || 0;
    if (X.scene && !a.indoor) {   // stake out the door
      const cp = X.scene.cityPos || X.focus();
      runTo(p, a, cp.x + a.ox, cp.y + a.oy, K.run * 0.7, dt, 0.8);
      return;
    }
    const dx = S.px - p.x, dy = S.py - p.y, d = Math.hypot(dx, dy);
    if (P.state !== 'play') { X.movePed(p, dt, 0, 0); face(p, dx, dy, dt); return; }
    a.t -= dt;
    if (a.t <= 0) { a.t = 0.3; a.see = d < 42 && !X.raycast(p.x, p.y, S.px, S.py); if (a.see && d < TUNE.seeFoot) see(); }
    const pc = P.car, armed = !!p.weapon;
    // the suspect sits in a stopped car: go for the driver's door
    if (pc && pc.speed < 2.5 && d < 20) { carDoor(pc, DOOR); runTo(p, a, DOOR.x, DOOR.y, K.run, dt, 0.3); return; }
    // drove off: get back in the car
    if (pc && pc.speed > 7 && d > 22 && usable(a.car) && Math.hypot(a.car.x - p.x, a.car.y - p.y) < 60) { a.state = 'board'; return; }
    if (armed && a.see && d < K.range && (!pc || lvl >= 3)) {
      const ux = dx / (d || 1), uy = dy / (d || 1);
      let mx = 0, my = 0;
      if (d > 13) { mx = ux * K.run * 0.7; my = uy * K.run * 0.7; }
      else if (d < 5) { mx = -ux * 2; my = -uy * 2; }
      else { a.strT -= dt; if (a.strT <= 0) { a.strafe = -a.strafe; a.strT = rand(0.8, 2); } mx = -uy * a.strafe * 1.6; my = ux * a.strafe * 1.6; }
      X.movePed(p, dt, mx, my);
      aimAndFire(p, a, dt);
      return;
    }
    let tx = S.px, ty = S.py;
    if (X.time - S.seenT > 4 && !a.see) { tx = S.lastX; ty = S.lastY; if (Math.hypot(tx - p.x, ty - p.y) < 3) { tx = S.px; ty = S.py; } }
    runTo(p, a, tx, ty, pc ? K.run : K.run * (d < 6 ? 0.92 : 1), dt, pc ? 2 : 0.75);
    if (!pc && d < 1.3 && lvl >= 2 && !armed) punch(p, a, dx, dy, d);
  }
  function guard(p, a, dt, K) {
    const dx = S.px - p.x, dy = S.py - p.y, d = Math.hypot(dx, dy), lvl = P.wanted || 0;
    const hx = a.px - p.x, hy = a.py - p.y, hd = Math.hypot(hx, hy);
    X.movePed(p, dt, hd > 0.4 ? hx / hd * 2.5 : 0, hd > 0.4 ? hy / hd * 2.5 : 0);
    if (lvl >= 1 && P.state === 'play' && !X.scene && d < 70) {
      a.t -= dt;
      if (a.t <= 0) { a.t = 0.35; a.see = d < 50 && !X.raycast(p.x, p.y, S.px, S.py); if (a.see && d < TUNE.seeFoot) see(); }
      if (d < (a.station ? 30 : 22) && (!P.car || P.car.speed < 4)) { a.state = 'chase'; shout(p, SHOUT); return; }
      if (p.weapon && a.see && d < K.range + 8 && (P.car ? lvl >= 3 : lvl >= 2)) aimAndFire(p, a, dt);
      else face(p, dx, dy, dt);
    } else if (a.th0 != null) face(p, Math.cos(a.th0), Math.sin(a.th0), dt);
  }
  function pickLeave(p, a) {
    const q = X.randomSidewalkPoint(p.x, p.y, 30, 70);
    a.tx = q ? q.x : p.x + rand(-20, 20); a.ty = q ? q.y : p.y + rand(-20, 20);
  }
  function copTick(p, dt) {
    const a = p.ai;
    if (!a || a.owner !== 'police') return;
    if (a.punchT > 0) a.punchT -= dt;
    if (a.shoutT > 0) a.shoutT -= dt;
    if (a.indoor && X.scene !== a.indoor) { p.removed = true; return; }
    if (p.knock > 0) { X.movePed(p, dt, 0, 0); return; }
    const lvl = P.wanted || 0, K = KINDS[a.kind];
    if (S.guns) { const want = lvl >= 2 || a.kind !== 'cop' ? K.gun(lvl) : null; if (p.weapon !== want) p.weapon = want; }
    if (!lvl && (a.state === 'chase' || a.state === 'board' && !usable(a.car))) a.state = 'calm';
    switch (a.state) {
      case 'patrol': {
        if (lvl >= 1 && P.state === 'play' && !X.scene && Math.hypot(S.px - p.x, S.py - p.y) < 60) { a.state = 'chase'; shout(p, SHOUT); break; }
        patrolWalk(p, a, dt);
        break;
      }
      case 'guard': guard(p, a, dt, K); break;
      case 'chase': chase(p, a, dt, K); break;
      case 'board': {
        const c = a.car;
        if (!usable(c)) { a.car = null; a.state = lvl ? 'chase' : 'calm'; break; }
        const d = Math.hypot(S.px - p.x, S.py - p.y);
        if (lvl && !(P.car && P.car.speed > 4) && d < 20) { a.state = 'chase'; break; }
        runTo(p, a, c.x, c.y, K.run, dt, 0.1);
        if (X.circlePoly(p.x, p.y, 1.1, X.carPoly(c))) board(p, c);
        break;
      }
      case 'calm': {
        if (a.patrol) a.state = 'patrol';
        else if (a.station || a.post) a.state = 'guard';   // (a.post: a sentry at Camp Bussby or SWAT Command)
        else if (usable(a.car) && Math.hypot(a.car.x - p.x, a.car.y - p.y) < 80) a.state = 'board';
        else { a.state = 'leave'; pickLeave(p, a); }
        X.movePed(p, dt, 0, 0);
        break;
      }
      case 'leave': {
        if (lvl >= 1 && P.state === 'play' && Math.hypot(S.px - p.x, S.py - p.y) < 40) { a.state = 'chase'; break; }
        if (a.tx == null) pickLeave(p, a);
        if (runTo(p, a, a.tx, a.ty, 1.7, dt, 1.2) < 1.5) pickLeave(p, a);
        break;
      }
      default: X.movePed(p, dt, 0, 0);
    }
  }
  function shout(p, lines, force) {
    if (!p || p.dead || (!force && (X.time - S.shoutT < 2.5 && X.time >= S.shoutT))) return;
    if (!X.inView(p.x, p.y, -2)) return;
    S.shoutT = X.time;
    X.floatText(p.x, p.y - 0.9, pick(lines), p.team === 'army' ? '#c9d98a' : '#9cc4ff', { size: 15, life: 1.5 });
  }

  // ================= arrests =================
  function arrestTick(dt) {
    let foot = 0, door = 0, who = null;
    const lvl = P.wanted || 0;
    if (P.state === 'play' && lvl >= 1) {
      const pc = P.car;
      if (pc) carDoor(pc, DOOR);
      for (let i = 0; i < S.cops.length; i++) {
        const p = S.cops[i];
        if (p.dead || p.removed || p.hidden || p.knock > 0 || (X.scene && !p.ai.indoor)) continue;
        if (!pc) {
          if ((lvl <= 1 || !S.guns || !p.weapon) && Math.hypot(p.x - P.ped.x, p.y - P.ped.y) < 1.25) { foot++; who = p; }
        } else if (pc.speed < 1 && Math.hypot(p.x - DOOR.x, p.y - DOOR.y) < 1.35) { door++; who = p; }
      }
    }
    if (foot) S.arrest += dt * (1 + 0.5 * (foot - 1)); else S.arrest = Math.max(0, S.arrest - dt * 1.5);
    if (door) S.arrestCar += dt; else S.arrestCar = Math.max(0, S.arrestCar - dt * 2);
    S.arrestBy = who;
    if (who && X.time - S.arrestSaid > 3) { S.arrestSaid = X.time; shout(who, SHOUT_ARREST, true); }
    if (P.state === 'play' && (S.arrest >= TUNE.arrestFoot || S.arrestCar >= TUNE.arrestCar)) {
      S.arrest = S.arrestCar = 0;
      X.bust();
    }
  }
  function cuffs() {
    const k = PG.audio.kit(); if (!k) return;
    const t = k.now;
    for (const o of [0, 0.13, 0.42]) { k.noise(t + o, 0.04, 0.18, 'highpass', 3200); k.tone('square', 2300, t + o, 0.03, 0.03, { lp: 6000 }); }
  }

  // ================= spawning and despawning =================
  function roadSpawnPoint(rMin, rMax, ahead) {
    const C = X.city, sp = Math.hypot(S.pvx, S.pvy);
    for (let k = 0; k < 18; k++) {
      let a = Math.random() * TAU;
      if (ahead && sp > 5 && k < 9) a = Math.atan2(S.pvy, S.pvx) + rand(-0.7, 0.7);
      const r = rand(rMin, rMax), rp = X.nearestRoadPoint(S.fx + Math.cos(a) * r, S.fy + Math.sin(a) * r);
      let x = rp.x, y = rp.y;
      if (x < 8 || y < 8 || x > C.W - 8 || y > C.H - 8 || X.inView(x, y, 6)) continue;
      if (Math.hypot(x - S.fx, y - S.fy) < rMin * 0.7) continue;
      const th = rp.horiz ? (S.fx > x ? 0 : Math.PI) : (S.fy > y ? Math.PI / 2 : -Math.PI / 2);
      x += -Math.sin(th) * 2; y += Math.cos(th) * 2;   // the right-hand lane
      if (X.cars.some(o => !o.removed && Math.abs(o.x - x) < 8 && Math.abs(o.y - y) < 8)) continue;
      return { x, y, th };
    }
    return null;
  }
  function stationSpawn(gate) {
    const st = X.places && X.places.police; if (!st && !gate) return null;
    const d = gate || st.door, rp = X.nearestRoadPoint(d.x + d.nx * 8, d.y + d.ny * 8);
    if (Math.hypot(rp.x - S.fx, rp.y - S.fy) < 30) return null;
    const th = rp.horiz ? (S.fx > rp.x ? 0 : Math.PI) : (S.fy > rp.y ? Math.PI / 2 : -Math.PI / 2);
    if (X.cars.some(o => !o.removed && Math.abs(o.x - rp.x) < 8 && Math.abs(o.y - rp.y) < 8)) return null;
    return { x: rp.x, y: rp.y, th, station: true };
  }
  function spawnPursuitCar(force) {
    const lvl = Math.max(1, P.wanted || 0);
    let model = 'police', kind = 'cop';
    let heavy = 0; for (const c of S.cars) if (c.pol.role === 'pursuit' && c.pol.kind !== 'cop') heavy++;
    const tanks = S.cars.reduce((n, c) => n + (c.pol.tank && !c.wrecked && c.pol.role === 'pursuit' ? 1 : 0), 0);
    if (lvl >= 6 && !tanks && Math.random() < 0.4) { model = 'tank'; kind = 'army'; }
    else if (lvl >= 6 && Math.random() < 0.6) { model = X.MODELS.apc ? pick(['apc', 'armytruck', 'jeep']) : 'swat'; kind = 'army'; }
    else if (lvl >= 4 && heavy < (lvl >= 5 ? 2 : 1)) { model = 'swat'; kind = 'swat'; }
    let sp = null;
    const st = X.places && X.places.police;
    // the heavy units roll out of their own gates: SWAT Command and Camp Bussby (rooms_military.js)
    const hq = X.places && (kind === 'army' ? X.places.armybase : kind === 'swat' ? X.places.swathq : null);
    if (hq && hq.gate && Math.random() < 0.6 && Math.hypot(hq.gate.x - S.fx, hq.gate.y - S.fy) < 420) sp = stationSpawn(hq.gate);
    if (!sp && st && lvl >= 2 && Math.random() < 0.35 && Math.hypot(st.door.x - S.fx, st.door.y - S.fy) < 380) sp = stationSpawn();
    if (!sp) sp = roadSpawnPoint(85, 150, lvl >= 3 && Math.random() < 0.5);
    if (!sp && force) sp = roadSpawnPoint(50, 200, false);
    if (!sp) return null;
    const c = makeCopCar(model, sp.x, sp.y, sp.th, 'pursuit', kind);
    toPursuit(c);
    if (c.dv) { const v0 = sp.station ? 6 : 14; c.dv.vx = Math.cos(sp.th) * v0; c.dv.vy = Math.sin(sp.th) * v0; }
    return c;
  }
  function spawnPatrolCar() {
    const c = X.spawnTraffic(S.fx, S.fy, 150, 380, 'police', { owner: 'police', npcDriver: { look: LOOKS.cop(), team: 'cop', extra: 1 } });
    if (!c) return null;
    c.cruise = rand(9, 12); c.pol = newPol('patrol', 'cop');
    S.cars.push(c);
    return c;
  }
  function spawnFootPatrol() {
    for (let k = 0; k < 6; k++) {
      const q = X.randomSidewalkPoint(S.fx, S.fy, 50, 120);
      if (!q || X.inView(q.x, q.y, 3)) continue;
      const p = makeCop(q.x, q.y, 'cop', 'patrol');
      p.ai.patrol = true; p.ai.blk = q.block;
      return p;
    }
    return null;
  }
  // Two cruisers at the kerb outside the station, and two officers at the door having a coffee.
  function stationCars() {
    const st = X.places && X.places.police; if (!st) return;
    const C = X.city, d = st.door, fp = X.nearestRoadPoint(d.x + d.nx * 6, d.y + d.ny * 6);
    let have = 0; for (const c of S.cars) if (c.pol.role === 'parked' && !c.removed && !c.wrecked && c.owner === 'police') have++;
    for (const off of [-4, 4]) {
      if (have >= 2) break;
      let x, y, th;
      if (fp.horiz) { y = C.ys[fp.idx] + Math.sign(d.y - C.ys[fp.idx] || 1) * (C.wy[fp.idx] / 2 + 0.55); x = d.x + off * 1.6; th = d.y > C.ys[fp.idx] ? 0 : Math.PI; }
      else { x = C.xs[fp.idx] + Math.sign(d.x - C.xs[fp.idx] || 1) * (C.wx[fp.idx] / 2 + 0.55); y = d.y + off * 1.6; th = d.x > C.xs[fp.idx] ? -Math.PI / 2 : Math.PI / 2; }
      const c = makeCopCar('police', x, y, th, 'parked', 'cop', { npcDriver: null, siren: false, ctrl: 'parked' });
      const pc = X.carPoly(c);
      if (PG.cityNear(C, x, y, 5).some(s => PG.overlap(pc, s.poly)) || X.cars.some(o => o !== c && !o.removed && Math.abs(o.x - x) < 6 && Math.abs(o.y - y) < 6 && PG.overlap(pc, X.carPoly(o)))) { X.removeCar(c); S.cars.pop(); continue; }
      have++;
    }
  }
  function stationGuards() {
    const st = X.places && X.places.police; if (!st) return;
    const d = st.door;
    let n = 0; for (const p of S.cops) if (p.ai.station && !p.dead && !p.removed) n++;
    if (n || X.inView(d.x, d.y, 4)) return;
    for (const s of [-1, 1]) {
      const x = d.x + d.nx * 1.0 + -d.ny * s * 2.2, y = d.y + d.ny * 1.0 + d.nx * s * 2.2;
      if (X.blocked(x, y, 0.4)) continue;
      const p = makeCop(x, y, 'cop', 'guard');
      p.ai.station = true; p.ai.px = x; p.ai.py = y; p.ai.th0 = Math.atan2(d.ny, d.nx) + s * 0.6; p.th = p.ai.th0;
    }
  }
  function spawnHeli() {
    const a = Math.random() * TAU, r = 165;
    S.heli = { kind: 'heli', team: 'cop', x: S.fx + Math.cos(a) * r, y: S.fy + Math.sin(a) * r, z: 24, vx: 0, vy: 0, th: a + Math.PI, rot: 0, rotSp: 1,
      hp: 1200, maxHp: 1200, sx: S.fx + Math.cos(a) * r * 0.85, sy: S.fy + Math.sin(a) * r * 0.85, state: 'chase', fireT: 4, burst: 0, burstT: 0, t: 0,
      orbit: Math.random() * TAU, fireCd: 0, dmgMul: 0.28, inaccuracy: 0.14, rateMul: 1, lastBy: null, hurtT: 0, lit: false };
    radio(say(LINES.heli), 1);
    return S.heli;
  }
  // PG.settings.policeMax: how many police vehicles may be out at once (TUNE.maxCars is the hard ceiling)
  const SET = () => PG.settings || {};
  function carCap() { const m = +SET().policeMax; return m > 0 ? Math.min(TUNE.maxCars, Math.round(m)) : TUNE.maxCars; }
  function despawnCar(c) {
    X.removeCar(c);
    if (c.pol) for (const p of c.pol.out) if (p.ai && p.ai.car === c) p.ai.car = null;
  }
  function manage() {
    const lvl = P.wanted || 0, purge = S.purge;
    S.purge = false;
    // forget what is gone, despawn what is far away and out of sight
    let keep = 0;
    for (const c of S.cars) {
      if (c.removed) continue;
      const u = c.pol, d = Math.hypot(c.x - S.fx, c.y - S.fy), seen = X.inView(c.x, c.y, c.len + 4);
      if (u.role === 'stolen') continue;
      if (u.role === 'parked') { if (c.wrecked && d > 150 && !seen) { X.removeCar(c); continue; } S.cars[keep++] = c; continue; }
      if (u.role === 'block') { S.cars[keep++] = c; continue; }
      const lim = u.role === 'pursuit' ? (purge ? 60 : 260) : u.role === 'patrol' ? 430 : 120;
      if (d > lim && !seen) { despawnCar(c); continue; }
      S.cars[keep++] = c;
    }
    S.cars.length = keep;
    keep = 0;
    for (const p of S.cops) {
      if (p.removed || p.dead || !p.ai || p.ai.owner !== 'police') continue;
      const a = p.ai, d = a.indoor ? 0 : Math.hypot(p.x - S.fx, p.y - S.fy), seen = a.indoor || X.inView(p.x, p.y, 3);
      const lim = a.state === 'leave' ? 40 : a.blockRef ? 1e9 : a.post ? 320 : purge && a.state !== 'patrol' && !a.station ? 40 : a.station ? 240 : 190;
      if (d > lim && !seen) { p.removed = true; continue; }
      S.cops[keep++] = p;
    }
    S.cops.length = keep;
    // units list for other modules
    S.units.length = 0;
    for (const c of S.cars) if (!c.wrecked && (c.pol.role === 'pursuit' || c.pol.role === 'patrol' || c.pol.role === 'block')) S.units.push(c);
    for (const p of S.cops) S.units.push(p);
    if (S.heli) S.units.push(S.heli);
    if (!X.city || P.state !== 'play') return;

    const st = X.places && X.places.police, stD = st ? Math.hypot(st.door.x - S.fx, st.door.y - S.fy) : 1e9;
    const capCars = carCap();
    let patrolCars = 0, pursuit = 0, cars = 0, footPatrol = 0;
    for (const c of S.cars) {
      if (c.wrecked) continue;
      if (c.pol.role !== 'parked') cars++;
      if (c.pol.role === 'patrol') patrolCars++;
      if (c.pol.role === 'pursuit') pursuit++;
    }
    for (const p of S.cops) if (p.ai.patrol) footPatrol++;
    if (!X.scene) {
      if (stD < 150) { S.guardT -= 0.5; if (S.guardT <= 0) { S.guardT = 8; stationGuards(); } }
      if (stD > 200) { S.restockT -= 0.5; if (S.restockT <= 0 && st && !X.inView(st.door.x, st.door.y, 8)) { S.restockT = 30; stationCars(); } }
      if (!lvl && patrolCars < TUNE.patrolCars + (stD < 250 ? 1 : 0) && cars < capCars) spawnPatrolCar();
      if (footPatrol < TUNE.patrolFoot && S.cops.length < TUNE.maxCops) spawnFootPatrol();
      if (!lvl && patrolCars > TUNE.patrolCars + 2) {   // trim the patrol back down after a chase
        for (const c of S.cars) if (c.pol.role === 'patrol' && patrolCars > TUNE.patrolCars + 1 && Math.hypot(c.x - S.fx, c.y - S.fy) > 140 && !X.inView(c.x, c.y, 8)) { despawnCar(c); patrolCars--; }
      }
    }
    if (!lvl) return;
    // the hunt: every patrol in range joins, reinforcements arrive out of sight or from the station
    for (const c of S.cars) {
      if (c.removed || c.wrecked || !c.npcDriver) continue;
      if (c.pol.role === 'patrol' && Math.hypot(c.x - S.fx, c.y - S.fy) < 280) { toPursuit(c); pursuit++; whoop(c); }
    }
    if (pursuit < PURSUIT[lvl] && S.spawnT <= 0 && cars < capCars) { if (spawnPursuitCar()) S.spawnT = lvl >= 4 ? 2 : 3.2; else S.spawnT = 0.5; }
    if (cars > capCars) {   // the police cap went down: the farthest pursuer out of sight goes home
      let far = null, fd = 0;
      for (const c of S.cars) { if (c.removed || c.wrecked || c.pol.role !== 'pursuit' || c.pol.forced || X.inView(c.x, c.y, c.len + 4)) continue; const d = Math.hypot(c.x - S.fx, c.y - S.fy); if (d > fd) { fd = d; far = c; } }
      if (far) despawnCar(far);
    }
    if (X.scene) {
      if (lvl >= 4 && !S.raided && S.entry && S.inT > TUNE.raidAfter && S.cops.length < TUNE.maxCops) raid();
      return;
    }
    if (lvl >= 3 && P.car && P.car.speed > 7 && S.blockT <= 0 && S.blocks.length < (lvl >= 5 ? 2 : 1) && cars + 2 <= capCars) S.blockT = spawnRoadblock(false) ? rand(16, 24) : 2;
    if (lvl >= 5 && !S.heli && S.heliT <= 0) spawnHeli();
  }
  function raid() {
    S.raided = true;
    const e = S.entry;
    for (let k = 0; k < 3; k++) {
      const p = makeCop(e.x + rand(-0.8, 0.8), e.y + rand(-0.8, 0.8), 'swat', 'chase');
      p.ai.indoor = X.scene; p.ai.fireT = rand(1, 1.6);
    }
    radio(say(LINES.raid), 2);
    X.popup('SWAT RAID!');
    G().shake = Math.max(G().shake, 0.3);
  }

  // ================= roadblocks and stingers =================
  function spawnRoadblock(force) {
    const c = P.car; if (!c || X.scene) return null;
    const C = X.city, v = X.carVel(c), moving = Math.hypot(v.x, v.y) > 2;
    const horiz = moving ? Math.abs(v.x) > Math.abs(v.y) : Math.abs(Math.cos(c.th)) > Math.abs(Math.sin(c.th));
    const sign = horiz ? Math.sign(moving ? v.x : Math.cos(c.th)) || 1 : Math.sign(moving ? v.y : Math.sin(c.th)) || 1;
    const lines = horiz ? C.ys : C.xs, widths = horiz ? C.wy : C.wx, pos = horiz ? c.y : c.x;
    let idx = 0; for (let i = 1; i < lines.length; i++) if (Math.abs(lines[i] - pos) < Math.abs(lines[idx] - pos)) idx = i;
    if (Math.abs(lines[idx] - pos) > widths[idx] / 2 + 2) return null;   // not on a road
    const line = lines[idx], w = widths[idx], along0 = horiz ? c.x : c.y, max = horiz ? C.W : C.H;
    const J = horiz ? C.xs : C.ys, JW = horiz ? C.wx : C.wy;
    for (const dd of [120, 100, 140, 85, 160, 70]) {
      const at = along0 + sign * dd; if (at < 25 || at > max - 25) continue;
      if (J.some((jv, i) => Math.abs(jv - at) < JW[i] / 2 + 12)) continue;   // keep off the junctions
      const x = horiz ? at : line, y = horiz ? line : at;
      if (!force && X.inView(x, y, 2)) continue;
      return placeRoadblock(x, y, horiz, sign, w);
    }
    return null;
  }
  function placeRoadblock(x, y, horiz, sign, w) {
    const lvl = P.wanted || 0, n = w > 20 ? 3 : 2, offs = n === 3 ? [-w * 0.32, 0, w * 0.32] : [-w * 0.25, w * 0.25];
    const ax = horiz ? sign : 0, ay = horiz ? 0 : sign, qx = horiz ? 0 : 1, qy = horiz ? 1 : 0;
    const b = { x, y, horiz, sign, w, cars: [], cops: [], bars: [], strip: null, t: 0 };
    for (const o of X.cars) if (!o.removed && o !== P.car && !o.owner && !o.keep && Math.abs(o.x - x) < 16 && Math.abs(o.y - y) < 16 && !X.inView(o.x, o.y, 4)) X.removeCar(o);
    for (let k = 0; k < n; k++) {
      const off = offs[k], swat = lvl >= 4 && k === 1, kind = swat ? 'swat' : 'cop';
      const th = (horiz ? Math.PI / 2 : 0) + (Math.random() < 0.5 ? Math.PI : 0) + rand(-0.22, 0.22);
      const c = makeCopCar(swat ? 'swat' : 'police', x + qx * off, y + qy * off, th, 'block', kind, { npcDriver: null });
      X.toPhys(c); c.ai = null; c.siren = !c.polArmy;
      b.cars.push(c);
      for (let m = 0; m < 2; m++) {   // two officers behind each car
        const px = x + qx * (off + (m ? 1.5 : -1.5)) + ax * 3.4, py = y + qy * (off + (m ? 1.5 : -1.5)) + ay * 3.4;
        const p = makeCop(px, py, kind, 'guard');
        p.ai.px = px; p.ai.py = py; p.ai.th0 = Math.atan2(-ay, -ax); p.th = p.ai.th0; p.ai.blockRef = b;
        b.cops.push(p);
      }
    }
    if (lvl >= 3) {   // a stinger across part of the road, in front of the cars
      const side = Math.random() < 0.5 ? -1 : 1;
      b.strip = { x: x - ax * 10 + qx * side * w * 0.2, y: y - ay * 10 + qy * side * w * 0.2, horiz, len: w * 0.55 };
    }
    for (const e of [-1, 1]) b.bars.push({ x: x + qx * e * (w / 2 - 1.2) - ax * 1.2, y: y + qy * e * (w / 2 - 1.2) - ay * 1.2, th: horiz ? Math.PI / 2 : 0, vx: 0, vy: 0, vr: 0, hit: false });
    S.blocks.push(b);
    radio(say(LINES.roadblock, { district: X.districtAt(x, y) }), 1);
    X.emit('roadblock', { x, y });
    return b;
  }
  function removeBlock(b) {
    for (const c of b.cars) if (!c.removed && c.pol.role === 'block') despawnCar(c);
    for (const p of b.cops) if (!p.removed && !p.dead && p.ai.state === 'guard') p.removed = true;
    for (const p of b.cops) if (p.ai) p.ai.blockRef = null;
  }
  function blocksTick(dt) {
    let keep = 0;
    for (const b of S.blocks) {
      b.t += dt;
      const d = Math.hypot(b.x - S.fx, b.y - S.fy);
      if ((d > 230 || (!P.wanted && d > 50) || P.state !== 'play' && d > 50) && !X.inView(b.x, b.y, 16)) { removeBlock(b); continue; }
      S.blocks[keep++] = b;
      const pc = P.car;
      // stinger
      const s = b.strip;
      if (s && pc && !(pc.polFlat > 0) && pc.speed > 3) {
        const along = s.horiz ? Math.abs(pc.x - s.x) : Math.abs(pc.y - s.y), across = s.horiz ? Math.abs(pc.y - s.y) : Math.abs(pc.x - s.x);
        if (along < pc.len / 2 + 0.2 && across < s.len / 2 + pc.wid / 2 - 0.3) popTyres(pc);
      }
      // sawhorses fly when hit
      for (const br of b.bars) {
        if (br.hit) { br.x += br.vx * dt; br.y += br.vy * dt; br.th += br.vr * dt; const k = Math.exp(-2.4 * dt); br.vx *= k; br.vy *= k; br.vr *= k; }
        for (const c of X.cars) {
          if (c.removed || c.speed < 2.5 || Math.abs(c.x - br.x) > c.len || Math.abs(c.y - br.y) > c.len) continue;
          if (!X.circlePoly(br.x, br.y, 0.9, X.carPoly(c))) continue;
          const v = X.carVel(c);
          br.vx = v.x * 0.9 + rand(-2, 2); br.vy = v.y * 0.9 + rand(-2, 2); br.vr = rand(-9, 9);
          if (!br.hit) { br.hit = true; clatter(br.x, br.y); }
        }
      }
    }
    S.blocks.length = keep;
  }
  function popTyres(c) {
    c.polFlat = 14; c._polMu = c.mu == null ? 1 : c.mu; c.mu = c._polMu * 0.58;
    if (!S.flat.includes(c)) S.flat.push(c);
    X.damageCar(c, 45, null, 'spike');
    PG.burst(c.x, c.y, 'spark', 26, 7, 0.5, 0.1);
    X.popup('STINGER! Tyres shredded');
    G().shake = Math.max(G().shake, 0.25);
    const k = PG.audio.kit();
    if (k) { const t = k.now; for (let i = 0; i < 4; i++) k.noise(t + i * 0.06, 0.07, 0.4, 'bandpass', 700 + i * 150, { Q: 1.2 }); k.noise(t + 0.25, 1.2, 0.06, 'highpass', 3000, { attack: 0.02 }); }
    X.emit('tyresPopped', { car: c });
  }
  function unflat(c) { if (c._polMu != null) c.mu = c._polMu; c._polMu = null; c.polFlat = 0; }
  function flatTick(dt) {
    let n = 0;
    for (let i = 0; i < S.flat.length; i++) {
      const c = S.flat[i];
      if (c.removed) continue;
      c.polFlat -= dt;
      if (c.polFlat <= 0) { unflat(c); continue; }
      if (c.dv && c.speed > 4 && X.inView(c.x, c.y, 4) && Math.random() < dt * 22) {   // rims on tarmac
        const w = PG.wheelPoses(c.dv), q = w[Math.floor(Math.random() * 4)];
        PG.burst(q.x, q.y, 'spark', 2, 4, 0.3, 0.08);
      }
      S.flat[n++] = c;
    }
    S.flat.length = n;
  }
  function clatter(x, y) {
    const k = PG.audio.kit(); if (!k || Math.hypot(x - S.fx, y - S.fy) > 50) return;
    const t = k.now;
    k.noise(t, 0.12, 0.25, 'bandpass', 1300, { Q: 2 }); k.tone('square', 420, t, 0.08, 0.04, { to: 260, lp: 2000 }); k.noise(t + 0.15, 0.1, 0.12, 'bandpass', 900, { Q: 2 });
  }

  // Lane traffic crawls aside when a siren comes up behind it in the same direction.
  const SIRENS = [];
  function sirenRule(a) {
    for (let i = 0; i < SIRENS.length; i++) {
      const s = SIRENS[i];
      if (s === a || s.removed) continue;
      const dx = a.x - s.x, dy = a.y - s.y; if (dx > 24 || dx < -24 || dy > 24 || dy < -24) continue;
      const fx = Math.cos(s.th), fy = Math.sin(s.th), al = dx * fx + dy * fy;
      if (al < 2 || al > 22 || Math.abs(-dx * fy + dy * fx) > 6 || Math.cos(a.th - s.th) < 0.6) continue;
      return 2.5;
    }
    return null;
  }
  function sirensTick() {
    SIRENS.length = 0;
    for (const c of X.cars) if (c.siren && !c.removed && !c.wrecked && c.speed > 4 && Math.abs(c.x - S.fx) < 300 && Math.abs(c.y - S.fy) < 300) SIRENS.push(c);
  }

  // ================= the helicopter =================
  function hurtHeli(h, dmg, by) {
    if (!h || h.state === 'crash' || !(dmg > 0)) return;
    h.hp -= dmg; h.hurtT = 0.15; h.lastBy = by || h.lastBy;
    if (X.inView(h.x, h.y, 8)) PG.burst(h.x, h.y, 'spark', 6, 6, 0.35, 0.08);
    if (h.hp <= 0) {
      h.state = 'crash'; h.vx += rand(-4, 4); h.vy += rand(-4, 4);
      if (X.byPlayer(h.lastBy)) addHeat(600);
      radio(say(LINES.heliDown), 3);
      X.emit('heliDown', { heli: h, by: h.lastBy });
    }
  }
  function heliTick(dt) {
    const h = S.heli; if (!h) return;
    h.t += dt; h.rot += dt * 24 * h.rotSp; if (h.hurtT > 0) h.hurtT -= dt;
    if (h.state === 'crash') {
      h.rotSp = Math.max(0.35, h.rotSp - dt * 0.25); h.th += dt * (2.5 + 4 * (1 - h.rotSp)); h.z -= dt * 7.5;
      h.x += h.vx * dt; h.y += h.vy * dt; const k = Math.exp(-0.5 * dt); h.vx *= k; h.vy *= k;
      if (X.inView(h.x, h.y, 20) && Math.random() < dt * 40) PG.burst(h.x, h.y, Math.random() < 0.5 ? 'smoke' : 'fire', 1, 2, 1.2, 0.7);
      if (h.z <= 0.6) {
        S.heli = null; S.heliT = 45;
        X.explode(h.x, h.y, { by: h.lastBy || null, power: 1.8, source: h });
        X.decal(h.x, h.y, 'scorch', 6);
        PG.burst(h.x, h.y, 'debris', 26, 12, 2.2, 0.5, ['#1f3c8c', '#f2f2f2', '#f2cf1d', '#222222']);
        G().shake = Math.max(G().shake, 0.9);
      }
      return;
    }
    const leave = h.state === 'leave' || (P.wanted || 0) < 5 || P.state !== 'play';
    if (leave) h.state = 'leave';
    const recent = X.time - S.seenT < 4;
    const cx = X.scene ? S.fx : recent ? S.px : S.lastX, cy = X.scene ? S.fy : recent ? S.py : S.lastY;
    let tx, ty, maxV = 30;
    if (leave) {
      const dx = h.x - S.fx, dy = h.y - S.fy, d = Math.hypot(dx, dy) || 1;
      tx = h.x + dx / d * 60; ty = h.y + dy / d * 60; maxV = 34;
      if (d > 260 && !X.inView(h.x, h.y, 30)) { S.heli = null; return; }
    } else { h.orbit += dt * 0.3; tx = cx + Math.cos(h.orbit) * 22; ty = cy + Math.sin(h.orbit) * 22; }   // circle wide; the light does the following
    let dvx = (tx - h.x) * 0.9, dvy = (ty - h.y) * 0.9; const dl = Math.hypot(dvx, dvy); if (dl > maxV) { dvx *= maxV / dl; dvy *= maxV / dl; }
    const k = Math.min(1, dt * 1.3); h.vx += (dvx - h.vx) * k; h.vy += (dvy - h.vy) * k;
    h.x += h.vx * dt; h.y += h.vy * dt;
    const sp = Math.hypot(h.vx, h.vy), want = sp > 4 ? Math.atan2(h.vy, h.vx) : Math.atan2(cy - h.y, cx - h.x);
    h.th += cl(wrap(want - h.th), -1.6 * dt, 1.6 * dt);
    // the searchlight follows the suspect at a limited speed, sweeps around where they were last seen
    let lx, ly;
    if (leave) { lx = h.x + Math.cos(h.th) * 10; ly = h.y + Math.sin(h.th) * 10; }
    else if (X.scene) { lx = S.fx + Math.cos(h.t * 0.8) * 7; ly = S.fy + Math.sin(h.t * 1.1) * 7; }
    else if (recent) { lx = S.px; ly = S.py; }
    else { lx = S.lastX + Math.cos(h.t * 0.7) * 14; ly = S.lastY + Math.sin(h.t * 0.9) * 10; }
    const sdx = lx - h.sx, sdy = ly - h.sy, sd = Math.hypot(sdx, sdy), smax = (14 + 2 * (P.wanted || 0)) * dt;
    if (sd > smax) { h.sx += sdx / sd * smax; h.sy += sdy / sd * smax; } else { h.sx = lx; h.sy = ly; }
    const bx = h.sx - h.x, by = h.sy - h.y, bl = Math.hypot(bx, by); if (bl > 30) { h.sx = h.x + bx / bl * 30; h.sy = h.y + by / bl * 30; }
    h.lit = !leave && !X.scene && P.state === 'play' && Math.hypot(h.sx - S.px, h.sy - S.py) < 7.5;
    // door gunner: short bursts at whoever stands in the light
    if (h.lit && S.guns) {
      h.fireT -= dt;
      if (h.fireT <= 0) {
        if (h.burst <= 0) h.burst = 6;
        h.burstT -= dt;
        if (h.burstT <= 0) {
          h.burstT = 0.12;
          const tx2 = P.car ? P.car.x : S.px, ty2 = P.car ? P.car.y : S.py;
          X.fireWeapon(h, 'uzi', Math.atan2(ty2 - h.y, tx2 - h.x) + rand(-0.05, 0.05));
          if (--h.burst <= 0) h.fireT = rand(3, 6);
        }
      }
    }
    if (h.hp < h.maxHp * 0.45 && X.inView(h.x, h.y, 10) && Math.random() < dt * 10) PG.burst(h.x - Math.cos(h.th) * 1.5, h.y - Math.sin(h.th) * 1.5, 'smoke', 1, 1.5, 1.4, 0.5);
    // rockets that fly close enough take it down
    const pj = X.weapons && X.weapons.projectiles;
    if (pj) for (const pr of pj) if (pr && !pr.dead && pr.kind === 'rocket' && Math.abs(pr.x - h.x) < 3.4 && Math.abs(pr.y - h.y) < 3.4) {
      pr.dead = true; X.explode(h.x, h.y, { by: pr.by, power: 1.2, source: 'rocket' }); hurtHeli(h, 1300, pr.by);
    }
  }
  X.on('gunfire', e => {
    const h = S.heli;
    if (!X.active || !h || h.state === 'crash' || !e || !X.byPlayer(e.by)) return;
    const w = X.WEAPONS && X.WEAPONS[e.weapon];
    if (!w || !(w.dmg > 0) || w.kind === 'melee' || w.kind === 'throw' || w.kind === 'rocket') return;
    const sh = e.by, ang = sh.aim != null ? sh.aim : sh.th || 0, ox = e.x != null ? e.x : sh.x, oy = e.y != null ? e.y : sh.y;
    const dx = h.x - ox, dy = h.y - oy, ca = Math.cos(ang), sa = Math.sin(ang), al = dx * ca + dy * sa, lat = Math.abs(-dx * sa + dy * ca);
    if (al < 0 || al > w.range + 8 || lat > 3) return;
    hurtHeli(h, w.dmg * (w.pellets || 1) * Math.max(1, 0.3 / w.rate), sh);
  });
  X.on('explosion', e => {
    const h = S.heli;
    if (!X.active || !h || h.state === 'crash' || !e || e.source === h) return;
    const R = 8 * Math.sqrt(e.power || 1), d = Math.hypot(h.x - e.x, h.y - e.y);
    if (d < R) hurtHeli(h, 900 * (e.power || 1) * (1 - d / R), e.by);
  });

  // ================= seen checks =================
  function updateSeen() {
    let seen = false, near = 1e9;
    if (P.state === 'play') {
      if (!X.scene) {
        for (const p of S.cops) {
          if (p.dead || p.removed || p.hidden || p.ai.indoor) continue;
          const d = Math.hypot(p.x - S.px, p.y - S.py); if (d < near) near = d;
          if (!seen && d < TUNE.seeFoot && !X.raycast(p.x, p.y, S.px, S.py)) seen = true;
        }
        for (const c of S.cars) {
          if (c.removed || c.wrecked || !c.npcDriver) continue;
          const d = Math.hypot(c.x - S.px, c.y - S.py); if (d < near) near = d;
          if (!seen && d < TUNE.seeCar && !X.raycast(c.x, c.y, S.px, S.py)) seen = true;
        }
        const h = S.heli;
        if (h && h.state === 'chase') { near = Math.min(near, Math.hypot(h.x - S.px, h.y - S.py)); if (h.lit) seen = true; }
      } else {
        for (const p of S.cops) {
          if (p.dead || p.removed) continue;
          if (!p.ai.indoor) { const d = Math.hypot(p.x - S.fx, p.y - S.fy); if (d < near) near = d; continue; }
          const d = Math.hypot(p.x - S.px, p.y - S.py); if (d < near) near = d;
          if (!seen && d < 30 && !X.raycast(p.x, p.y, S.px, S.py)) seen = true;
        }
      }
    }
    S.seen = seen; S.near = near;
    if (seen && P.wanted) see();
  }

  // ================= radio =================
  let R = null;
  const RADIO_CSS = `
#gta-hud .pol-radio { position: absolute; left: 12px; bottom: calc(66px + env(safe-area-inset-bottom, 0px)); max-width: min(440px, calc(100vw - 230px)); padding: 6px 11px 7px 10px; background: rgba(7,12,24,0.88); border: 1px solid #27406e; border-left: 4px solid #4f8cff; border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,0.45); font: 700 14px/1.3 'Courier New', monospace; color: #d6e6ff; text-shadow: 0 1px 0 #000; opacity: 0; transform: translateY(8px); transition: opacity .25s, transform .25s; }
#gta-hud .pol-radio.on { opacity: 1; transform: none; }
#gta-hud .pol-radio b { display: flex; align-items: center; gap: 6px; font: 800 11px var(--hud); letter-spacing: 0.18em; color: #8fb6ff; margin-bottom: 2px; }
#gta-hud .pol-radio b i { width: 8px; height: 8px; border-radius: 50%; background: #ff3b3b; box-shadow: 0 0 6px #ff3b3b; animation: polled .6s steps(2) infinite; }
@keyframes polled { 50% { background: #3b6bff; box-shadow: 0 0 6px #3b6bff; } }
@media (max-width: 600px) { #gta-hud .pol-radio { max-width: calc(100vw - 150px); font-size: 12px; bottom: calc(58px + env(safe-area-inset-bottom, 0px)); } }
`;
  function radioEl() {
    if (R && R.root.isConnected) return R;
    const hud = document.getElementById('gta-hud'); if (!hud) return null;
    if (!document.getElementById('pol-css')) { const st = document.createElement('style'); st.id = 'pol-css'; st.textContent = RADIO_CSS; document.head.appendChild(st); }
    const root = document.createElement('div'); root.className = 'pol-radio';
    root.innerHTML = '<b><i></i>POLICE RADIO</b><span></span>';
    hud.appendChild(root);
    R = { root, text: root.querySelector('span') };
    return R;
  }
  function radio(text, prio) {
    if (!text || !X.active) return;
    prio = prio || 0;
    if (S.radioT > 0.6 && prio <= S.radioP) { if (S.radioQ.length < 2) S.radioQ.push([text, prio]); return; }
    showRadio(text, prio);
  }
  function showRadio(text, prio) {
    const el = radioEl(); if (!el) return;
    el.text.textContent = text; el.root.classList.add('on');
    S.radioT = 4.4; S.radioP = prio; S.radioText = text;
    crackle();
    X.emit('policeRadio', { text });
  }
  function hideRadio() { if (R) R.root.classList.remove('on'); S.radioT = 0; }
  function radioTick(dt) {
    if (S.radioT > 0) {
      S.radioT -= dt;
      if (S.radioT <= 0) { hideRadio(); const q = S.radioQ.shift(); if (q) showRadio(q[0], q[1]); }
    }
    S.chatT -= dt;
    if (S.chatT > 0 || P.state !== 'play') return;
    const lvl = P.wanted || 0;
    if (lvl) {
      S.chatT = rand(8, 13);
      if (X.time - S.seenT > 8) return;
      const pc = P.car;
      radio(say(!pc ? LINES.foot : pc.model.kind === 'bus' ? LINES.bus : pc.pol ? LINES.copcar : LINES.pursuit), 0);
    } else { S.chatT = rand(45, 80); radio(say(LINES.patrol), 0); }
  }
  function crackle() {
    const k = PG.audio.kit(); if (!k || G().status !== 'play') return;
    const t = k.now;
    k.noise(t, 0.09, 0.06, 'bandpass', 2400, { Q: 1.5 });
    k.tone('square', 1320, t + 0.03, 0.06, 0.018, { lp: 3500 });
    for (let i = 0; i < 10; i++) k.tone('square', 160 + Math.random() * 100, t + 0.16 + i * 0.075, 0.05, 0.014, { lp: 1300 });   // the dispatcher, garbled
    k.noise(t + 0.15, 0.8, 0.01, 'bandpass', 1900, { Q: 0.7, attack: 0.05 });
    k.tone('square', 1320, t + 1.0, 0.05, 0.015, { lp: 3500 });
  }
  function dirName(vx, vy, bound) {
    if (Math.hypot(vx, vy) < 1.5) return bound ? 'stationary' : 'nowhere';
    const d = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'east' : 'west') : (vy > 0 ? 'south' : 'north');
    return bound ? d + 'bound' : d;
  }
  function colourName(hex) {
    if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return 'unusual';
    const n = parseInt(hex.slice(1, 7), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 55) return 'black';
    if (mx - mn < 30) return mx > 200 ? 'white' : mx > 110 ? 'grey' : 'dark grey';
    let h = mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h *= 60;
    return h < 15 || h >= 340 ? 'red' : h < 40 ? 'orange' : h < 70 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal' : h < 260 ? 'blue' : h < 300 ? 'purple' : 'pink';
  }
  // Lines that need a car or a heading only make sense when there is one: keep a filtered copy per pool.
  const POOLS = new Map();
  function fitting(pool, car, moving) {
    const key = (car ? 1 : 0) + (moving ? 2 : 0);
    let m = POOLS.get(pool); if (!m) POOLS.set(pool, m = []);
    if (!m[key]) {
      const ok = pool.filter(l => (car || !/\{(car|colour)\}/.test(l)) && (moving || !/\{(dir|dirw|kmh)\}/.test(l)));
      m[key] = ok.length ? ok : pool.filter(l => !/\{(car|colour|dir|dirw|kmh)\}/.test(l));
      if (!m[key].length) m[key] = ['All units, stay alert.'];
    }
    return m[key];
  }
  function say(pool, extra) {
    if (!pool || !pool.length) return '';
    const pc = P.car, near = S.cars.find(c => c.pol && c.pol.role === 'pursuit');
    pool = fitting(pool, !!pc, Math.hypot(S.pvx, S.pvy) > 1.5);
    const tok = {
      district: X.districtAt(S.fx, S.fy) || 'town', dir: dirName(S.pvx, S.pvy, true), dirw: dirName(S.pvx, S.pvy, false),
      car: pc ? pc.model.name : 'nothing', colour: pc ? colourName(pc.color) : '', kmh: Math.round(Math.hypot(S.pvx, S.pvy) * 3.6) + ' km/h',
      unit: near ? near.pol.no : S.unitNo, bank: X.places && X.places.bank ? X.places.bank.name : 'the bank', what: 'trouble',
    };
    if (extra) Object.assign(tok, extra);
    return PG.say(pool, tok).replace(/ {2,}/g, ' ');
  }

  // ================= sound: sirens and the rotor =================
  const V = { siren: null, rotor: null };
  function makeSiren(k) {
    const ctx = k.ctx, out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(k.master); } else out.connect(k.master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800; lp.connect(out);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 920; o2.frequency.value = 920; o2.detune.value = 14; g2.gain.value = 0.35;
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'triangle'; lfo.frequency.value = 0.27; lg.gain.value = 330;
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const t = ctx.currentTime; o1.start(t); o2.start(t); lfo.start(t);
    return { out, pan, o1, o2, lfo, lg, nodes: [o1, o2, lfo] };
  }
  function makeRotor(k) {
    const ctx = k.ctx, out = ctx.createGain(); out.gain.value = 0; out.connect(k.master);
    const src = ctx.createBufferSource(); src.buffer = k.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'square'; lfo.frequency.value = 11.5; lg.gain.value = 0.48;
    lfo.connect(lg); lg.connect(am.gain);
    const thump = ctx.createOscillator(), tg = ctx.createGain(); thump.type = 'sine'; thump.frequency.value = 46; tg.gain.value = 0.7;
    src.connect(lp); lp.connect(am); thump.connect(tg); tg.connect(am); am.connect(out);
    const t = ctx.currentTime; src.start(t); lfo.start(t); thump.start(t);
    return { out, lfo, nodes: [src, lfo, thump] };
  }
  function killVoice(v) {
    if (!v) return null;
    try {
      const t = v.out.context.currentTime;
      v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.03);
      for (const n of v.nodes) { try { n.stop(t + 0.25); } catch (e) { /* already stopped */ } }
      setTimeout(() => { try { v.out.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) { /* gone */ } }, 400);
    } catch (e) { /* context closed */ }
    return null;
  }
  function audioTick() {
    const on = X.active && G().status === 'play' && !PG.audio.muted;
    let best = null, bd = 170;
    if (on) for (const c of X.cars) {
      if (!c.siren || c.removed || c.wrecked) continue;
      const d = c === P.car ? 0 : Math.hypot(c.x - S.fx, c.y - S.fy); if (d < bd) { bd = d; best = c; }
    }
    S.sirenD = best ? bd : 1e9;
    const h = on && !X.scene ? S.heli : null, hd = h ? Math.hypot(h.x - S.fx, h.y - S.fy) : 1e9;
    if (!best && !(h && hd < 240)) { if (V.siren || V.rotor) { V.siren = killVoice(V.siren); V.rotor = killVoice(V.rotor); } return; }
    const k = PG.audio.kit();
    if (!k) { V.siren = killVoice(V.siren); V.rotor = killVoice(V.rotor); return; }
    const t = k.now;
    if (best) {
      if (!V.siren) V.siren = makeSiren(k);
      const v = V.siren, inside = best === P.car;
      let vol = inside ? 0.03 : 0.055 * Math.pow(1 - bd / 170, 1.6);
      if (X.scene) vol *= 0.25;
      v.out.gain.setTargetAtTime(vol, t, 0.08);
      const yelp = bd < 28 && !inside;
      v.lfo.frequency.setTargetAtTime(yelp ? 3.1 : 0.27, t, 0.3);
      v.lg.gain.setTargetAtTime(yelp ? 240 : 330, t, 0.3);
      if (v.pan) v.pan.pan.setTargetAtTime(inside ? 0 : cl((best.x - S.fx) / 45, -0.8, 0.8), t, 0.1);
      let det = 0;
      if (!inside) {   // doppler: higher coming in, lower going away
        const cv = X.carVel(best), rx = best.x - S.fx, ry = best.y - S.fy, rl = Math.hypot(rx, ry) || 1;
        const vr = ((cv.x - S.pvx) * rx + (cv.y - S.pvy) * ry) / rl;
        det = cl(-1200 * Math.log2(Math.max(0.5, 1 + vr / 343)), -260, 260);
      }
      v.o1.detune.setTargetAtTime(det, t, 0.12); v.o2.detune.setTargetAtTime(det + 14, t, 0.12);
    } else V.siren = killVoice(V.siren);
    if (h && hd < 240) {
      if (!V.rotor) V.rotor = makeRotor(k);
      V.rotor.out.gain.setTargetAtTime(0.09 * Math.pow(1 - hd / 240, 1.4) * (h.state === 'crash' ? 1.3 : 1), t, 0.1);
      V.rotor.lfo.frequency.setTargetAtTime(11.5 * h.rotSp, t, 0.2);
    } else V.rotor = killVoice(V.rotor);
  }

  // ================= drawing =================
  let SPR = null;
  const GLOWRGB = { red: '255,40,40', blue: '60,110,255', spot: '235,242,255' };
  function paintGlow(g, rgb, n) {
    const h = n / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, `rgba(${rgb},0.9)`); gr.addColorStop(0.35, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }
  function sprites() {
    if (SPR) return SPR;
    const mk = rgb => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; paintGlow(cv.getContext('2d'), rgb, 64); return cv; };
    SPR = { red: mk(GLOWRGB.red), blue: mk(GLOWRGB.blue), spot: mk(GLOWRGB.spot) };
    return SPR;
  }
  // Glows are cached at their on-screen pixel size (6 % steps) and blitted in device space without
  // filtering (about 3x cheaper than scaling a small sprite on a software-rasterised canvas).
  const GSTEP = Math.log(1.06);
  let gM = null, gPpm = 0;
  function glowBegin(ctx) {
    gM = null;
    if (SET().fastRender === false || !PG.sprites) return;
    gM = ctx.getTransform(); gPpm = Math.hypot(gM.a, gM.b);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  }
  function glowEnd(ctx) { if (gM) { ctx.setTransform(gM); ctx.imageSmoothingEnabled = true; gM = null; } }
  function glow(ctx, kind, x, y, r) {
    const M = gM, px = 2 * r * gPpm;
    if (!M || px > 320) { if (M) { ctx.setTransform(M); ctx.imageSmoothingEnabled = true; } ctx.drawImage(sprites()[kind], x - r, y - r, 2 * r, 2 * r); if (M) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; } return; }
    if (px < 1.5) return;
    const n = Math.max(2, Math.round(Math.exp(Math.round(Math.log(px) / GSTEP) * GSTEP)));
    ctx.drawImage(PG.sprites.get('pglow|' + kind + '|' + n, n, n, g => paintGlow(g, GLOWRGB[kind], n)), M.a * x + M.c * y + M.e - n / 2, M.b * x + M.d * y + M.f - n / 2);
  }
  function place(ctx, M, x, y, th) {
    const cs = Math.cos(th), sn = Math.sin(th);
    ctx.setTransform(M.a * cs + M.c * sn, M.b * cs + M.d * sn, M.c * cs - M.a * sn, M.d * cs - M.b * sn, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
  }
  // POLITI livery (Battenburg checks and bonnet lettering), army canvas, open doors when the crew is out.
  const baseDrawCar = X.drawCar;
  X.drawCar = function (ctx, c, t) {
    if (c.model && c.model.kind === 'tank') return drawTank(ctx, c, t);
    baseDrawCar(ctx, c, t);
    if (c.wrecked || !c.model) return;
    const L = c.len, W = c.wid, k = c.model.kind;
    if (k !== 'police' && !c.polArmy && !(c.pol && c.pol.role === 'empty' && c.pol.out.length)) return;
    const M = ctx.getTransform();
    place(ctx, M, c.x, c.y, c.th);
    // (a cached livery sprite was measured slower than these two batched fills and the lettering)
    if (k === 'police' || c.polArmy) livery(ctx, c, k);
    if (c.pol && c.pol.role === 'empty' && c.pol.out.length && X.time - c.pol.doorT < 40) {   // doors flung open
      ctx.fillStyle = c.color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.05;
      for (const sd of [-1, 1]) {
        ctx.save(); ctx.translate(L * 0.14, sd * W / 2); ctx.rotate(-sd * 1.05);
        ctx.fillRect(-1.05, sd > 0 ? 0 : -0.17, 1.05, 0.17); ctx.strokeRect(-1.05, sd > 0 ? 0 : -0.17, 1.05, 0.17);
        ctx.restore();
      }
    }
    ctx.setTransform(M);
  };
  // POLITI Battenburg checks and bonnet lettering, or army canvas, in the car's own frame
  function livery(ctx, c, k) {
    const L = c.len, W = c.wid;
    if (k === 'police') {
      const n = 8, s = L * 0.56 / n, x0 = -L * 0.3;
      ctx.fillStyle = '#1d4fb8'; ctx.beginPath();
      for (let i = 0; i < n; i += 2) { ctx.rect(x0 + i * s, -W / 2 + 0.03, s, 0.2); ctx.rect(x0 + i * s, W / 2 - 0.23, s, 0.2); }
      ctx.fill();
      ctx.fillStyle = '#f2cf1d'; ctx.beginPath();
      for (let i = 1; i < n; i += 2) { ctx.rect(x0 + i * s, -W / 2 + 0.03, s, 0.2); ctx.rect(x0 + i * s, W / 2 - 0.23, s, 0.2); }
      ctx.fill();
      ctx.save(); ctx.translate(L / 2 - 0.62, 0); ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#f4f4f4'; ctx.font = '800 0.34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POLITI', 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#4a5634'; PG.rr(ctx, -L / 2 + 0.05, -W / 2 + 0.05, L * 0.7, W - 0.1, 0.18); ctx.fill();
      ctx.strokeStyle = '#323b22'; ctx.lineWidth = 0.09; ctx.beginPath();
      for (let i = 1; i < 6; i++) { const x = -L / 2 + 0.05 + i * L * 0.7 / 6; ctx.moveTo(x, -W / 2 + 0.1); ctx.lineTo(x, W / 2 - 0.1); }
      ctx.stroke();
      ctx.fillStyle = c.color; ctx.fillRect(L * 0.21, -W / 2 + 0.12, L * 0.11, W - 0.24);
      ctx.fillStyle = '#e8ead8'; star(ctx, -L * 0.15, 0, 0.55);
    }
  }
  function drawTank(ctx, c, t) {
    const L = c.len, W = c.wid, wr = c.wrecked, tw = 0.8, ph = ((c.treadPh || 0) % 0.55 + 0.55) % 0.55;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    if (SET().shadows !== false) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(-L / 2 + 0.3, -W / 2 + 0.35, L, W); }
    ctx.fillStyle = '#1c1d19'; ctx.fillRect(-L / 2, -W / 2, L, tw); ctx.fillRect(-L / 2, W / 2 - tw, L, tw);   // tracks
    if (!wr) { ctx.fillStyle = '#4a4c42'; for (let x = -L / 2 + ph; x < L / 2 - 0.15; x += 0.55) { ctx.fillRect(x, -W / 2 + 0.06, 0.2, tw - 0.12); ctx.fillRect(x, W / 2 - tw + 0.06, 0.2, tw - 0.12); } }
    ctx.fillStyle = wr ? '#1b1b1b' : c.color; PG.rr(ctx, -L / 2 + 0.25, -W / 2 + tw - 0.15, L - 0.5, W - 2 * tw + 0.3, 0.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.08; ctx.stroke();
    if (!wr) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 4; i++) ctx.fillRect(-L / 2 + 0.55 + i * 0.32, -0.75, 0.16, 1.5);   // engine deck
      ctx.fillStyle = c.lightsOn ? '#fff6c8' : '#d8d2b8'; ctx.fillRect(L / 2 - 0.4, -W / 2 + tw, 0.14, 0.3); ctx.fillRect(L / 2 - 0.4, W / 2 - tw - 0.3, 0.14, 0.3);
    }
    ctx.restore();
    const ta = c.turret == null ? c.th : c.turret, rc = c.recoil || 0;
    ctx.save(); ctx.translate(c.x - Math.cos(c.th) * 0.3, c.y - Math.sin(c.th) * 0.3); ctx.rotate(ta);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(1.0 - rc, -0.05, 4.1, 0.34);
    ctx.fillStyle = wr ? '#151515' : '#2f3826'; ctx.fillRect(0.9 - rc, -0.17, 4.1, 0.34); ctx.fillRect(4.7 - rc, -0.24, 0.45, 0.48);   // gun
    ctx.fillStyle = wr ? '#1d1d1d' : c.color; PG.rr(ctx, -1.35, -1.05, 2.6, 2.1, 0.55); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; PG.rr(ctx, -1.2, -0.9, 2.3, 1.8, 0.45); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.08; PG.rr(ctx, -1.35, -1.05, 2.6, 2.1, 0.55); ctx.stroke();
    if (!wr) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(-0.45, 0.42, 0.36, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8ead8'; star(ctx, -0.3, -0.4, 0.34); }
    ctx.restore();
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  }
  function drawGround(ctx) {
    if (X.scene || !S.blocks.length) return;
    const M = ctx.getTransform(), sh = SET().shadows !== false;
    for (const b of S.blocks) {
      const s = b.strip; if (!s || !X.inView(s.x, s.y, s.len)) continue;
      place(ctx, M, s.x, s.y, s.horiz ? Math.PI / 2 : 0);   // local x runs across the road
      const L = s.len;
      if (sh) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-L / 2 + 0.08, -0.2, L, 0.46); }
      ctx.fillStyle = '#2b2d31'; ctx.fillRect(-L / 2, -0.22, L, 0.44);
      ctx.fillStyle = '#c9ccd1'; ctx.beginPath();
      for (let x = -L / 2 + 0.15; x < L / 2 - 0.1; x += 0.32) { ctx.moveTo(x, -0.2); ctx.lineTo(x + 0.11, -0.42); ctx.lineTo(x + 0.22, -0.2); ctx.moveTo(x, 0.2); ctx.lineTo(x + 0.11, 0.42); ctx.lineTo(x + 0.22, 0.2); }
      ctx.fill();
      ctx.fillStyle = '#f2cf1d'; ctx.fillRect(L / 2 - 0.05, -0.15, 0.5, 0.3);
    }
    ctx.setTransform(M);
  }
  function drawProps(ctx) {
    if (X.scene || !S.blocks.length) return;
    const M = ctx.getTransform(), sh = SET().shadows !== false;
    for (const b of S.blocks) for (const br of b.bars) {
      if (!X.inView(br.x, br.y, 3)) continue;
      place(ctx, M, br.x, br.y, br.th);
      if (sh) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-1.2 + 0.1, -0.12 + 0.12, 2.4, 0.3); }
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-1.0, -0.32, 0.12, 0.64); ctx.fillRect(0.88, -0.32, 0.12, 0.64);
      ctx.fillStyle = '#d42a2a'; ctx.fillRect(-1.2, -0.13, 2.4, 0.26);
      ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); for (let i = 1; i < 6; i += 2) ctx.rect(-1.2 + i * 0.4, -0.13, 0.4, 0.26); ctx.fill();
    }
    ctx.setTransform(M);
  }
  // Light bars: a coloured pool on the tarmac under the car, and a small flare on the bar itself.
  function drawGlowPools(ctx, view, t) {
    if (X.scene || SET().detail === 'low') return;
    const on = Math.floor(t * 8) % 2 === 0;
    let any = false;
    for (const c of X.cars) {
      if (!c.siren || c.removed || c.wrecked || !X.inView(c.x, c.y, 8)) continue;
      if (!any) { any = true; glowBegin(ctx); ctx.globalCompositeOperation = 'lighter'; }
      const r = 4.6, fx = Math.cos(c.th), fy = Math.sin(c.th);
      ctx.globalAlpha = on ? 0.5 : 0.2; glow(ctx, 'red', c.x - fy * 1.3, c.y + fx * 1.3, r);   // red on one side,
      ctx.globalAlpha = on ? 0.2 : 0.5; glow(ctx, 'blue', c.x + fy * 1.3, c.y - fx * 1.3, r);  // blue on the other
    }
    if (any) glowEnd(ctx);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawCarsFx(ctx, view, t) {
    if (X.scene) return;
    const on = Math.floor(t * 8) % 2 === 0;
    let any = false;
    for (const c of X.cars) {
      if (!c.siren || c.removed || c.wrecked || !X.inView(c.x, c.y, 8)) continue;
      if (!any) { any = true; glowBegin(ctx); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85; }
      const fx = Math.cos(c.th), fy = Math.sin(c.th), bx = c.model.kind === 'police' ? 0 : c.len * 0.25 + 0.12, side = on ? -0.38 : 0.38;
      glow(ctx, on ? 'red' : 'blue', c.x + fx * bx - fy * side, c.y + fy * bx + fx * side, 0.8);
    }
    if (any) glowEnd(ctx);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawHeli(ctx, h, t) {
    if (!X.inView(h.x, h.y, 40)) return;
    const s = 1 + h.z * 0.007;
    if (h.state !== 'crash') {   // beam and pool of light
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = Math.atan2(h.sy - h.y, h.sx - h.x), nx = -Math.sin(a), ny = Math.cos(a), w = 4.6;
      ctx.fillStyle = 'rgba(205,220,255,0.07)';
      ctx.beginPath(); ctx.moveTo(h.x + nx * 0.4, h.y + ny * 0.4); ctx.lineTo(h.sx + nx * w, h.sy + ny * w); ctx.lineTo(h.sx - nx * w, h.sy - ny * w); ctx.lineTo(h.x - nx * 0.4, h.y - ny * 0.4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.5; glowBegin(ctx); glow(ctx, 'spot', h.sx, h.sy, 7); glowEnd(ctx);
      ctx.restore();
    }
    if (SET().shadows !== false) {   // shadow on the ground
      ctx.save(); ctx.translate(h.x + h.z * 0.3, h.y + h.z * 0.45); ctx.rotate(h.th);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 2.4, 1.1, 0, 0, TAU); ctx.fill(); ctx.fillRect(-5.3, -0.25, 3.4, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.th); ctx.scale(s, s);
    ctx.fillStyle = '#20232a'; ctx.fillRect(-1.6, -1.18, 3.4, 0.14); ctx.fillRect(-1.6, 1.04, 3.4, 0.14);   // skids
    ctx.fillStyle = '#1a2f6e'; ctx.fillRect(-5.2, -0.22, 3.6, 0.44);                                        // tail boom
    ctx.fillStyle = '#f2cf1d'; ctx.fillRect(-4.6, -0.22, 0.5, 0.44);
    ctx.fillStyle = '#1a2f6e'; ctx.fillRect(-5.55, -0.9, 0.45, 1.8);
    ctx.save(); ctx.translate(-5.3, 0.95); ctx.rotate(h.rot * 1.7); ctx.fillStyle = 'rgba(40,40,46,0.85)'; ctx.fillRect(-0.65, -0.06, 1.3, 0.12); ctx.restore();
    ctx.fillStyle = h.hurtT > 0 ? '#ffffff' : '#1f3c8c'; ctx.beginPath(); ctx.ellipse(0, 0, 2.3, 1.05, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-1.7, -1.0, 0.5, 2.0);
    ctx.fillStyle = '#f2cf1d'; ctx.fillRect(-1.1, -1.03, 0.35, 2.06);
    ctx.fillStyle = 'rgba(150,200,235,0.85)'; ctx.beginPath(); ctx.ellipse(1.35, 0, 0.9, 0.78, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = '#f4f4f4'; ctx.font = '800 0.34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POLITI', -3.4, 0.02);
    const blink = Math.floor(t * 2.5) % 2 === 0;
    ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(0.2, -1.05, 0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#30ff60'; ctx.beginPath(); ctx.arc(0.2, 1.05, 0.12, 0, TAU); ctx.fill();
    if (blink) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-5.5, 0, 0.16, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(25,27,32,0.16)'; ctx.beginPath(); ctx.arc(0.1, 0, 5.4, 0, TAU); ctx.fill();          // rotor disc
    ctx.fillStyle = 'rgba(22,24,28,0.85)';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {   // four blades, one path
      const a = h.rot + i * Math.PI / 2, c = Math.cos(a), n = Math.sin(a);
      ctx.moveTo(0.12 * n, -0.12 * c); ctx.lineTo(5.4 * c + 0.12 * n, 5.4 * n - 0.12 * c); ctx.lineTo(5.4 * c - 0.12 * n, 5.4 * n + 0.12 * c); ctx.lineTo(-0.12 * n, 0.12 * c); ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 0.32, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawAir(ctx, view, t) {
    if (X.scene) return;
    ctx.lineCap = 'round';
    for (const sh of S.shells) {
      if (!X.inView(sh.x, sh.y, 6)) continue;
      ctx.strokeStyle = 'rgba(255,200,110,0.55)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(sh.x - sh.vx * 0.05, sh.y - sh.vy * 0.05); ctx.lineTo(sh.x, sh.y); ctx.stroke();
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(sh.x - sh.vx * 0.025, sh.y - sh.vy * 0.025); ctx.lineTo(sh.x, sh.y); ctx.stroke();
      X.addLight(sh.x, sh.y, 5, '#ffcf7a', 0.8);
    }
    ctx.lineCap = 'butt';
    if (S.heli) drawHeli(ctx, S.heli, t);
    // lights for the night: light bars, flashlights, the searchlight
    const on = Math.floor(t * 8) % 2 === 0, nt = night();
    for (const c of X.cars) {
      if (!c.siren || c.removed || c.wrecked || !X.inView(c.x, c.y, 12)) continue;
      X.addLight(c.x, c.y, 11, on ? '#ff3a3a' : '#3c6cff', 0.85);
    }
    if (nt) for (const p of S.cops) {
      if (p.dead || p.removed || p.ai.indoor || !X.inView(p.x, p.y, 10)) continue;
      const a = p.ai;
      if (a.state === 'patrol' || (a.state === 'chase' && !a.see) || (a.state === 'guard' && !P.wanted)) X.addLight(p.x + Math.cos(p.th) * 0.4, p.y + Math.sin(p.th) * 0.4, 10, '#fff2cf', 0.55, { cone: { dir: p.th, spread: 0.42 } });
    }
    const h = S.heli;
    if (h && h.state !== 'crash' && X.inView(h.sx, h.sy, 12)) {
      X.addLight(h.sx, h.sy, 8.5, '#e8f0ff', 1.3);
      const d = Math.hypot(h.sx - h.x, h.sy - h.y);
      X.addLight(h.x, h.y, d + 8, '#dfe9ff', 0.45, { cone: { dir: Math.atan2(h.sy - h.y, h.sx - h.x), spread: 0.16 } });
    }
  }
  function drawOverlay(ctx, view, t) {
    const k = Math.max(S.arrest / TUNE.arrestFoot, S.arrestCar / TUNE.arrestCar);
    if (k < 0.02 || P.state !== 'play') return;
    const pos = P.car ? carDoor(P.car, DOOR) : P.ped;
    ctx.lineWidth = 0.22; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.3, 0, TAU); ctx.stroke();
    ctx.strokeStyle = Math.floor(t * 8) % 2 ? '#5aa9ff' : '#ff4a4a'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.3, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k)); ctx.stroke();
  }
  function drawScreen(ctx, view, t) {
    if (!X.active || !X.city) return;
    // radar: cruisers flash when they hunt
    const fl = Math.floor(t * 4) % 2 === 0;
    for (const c of S.cars) {
      if (c.removed || c.wrecked || c.pol.role === 'stolen') continue;
      X.blip(c.x, c.y, c.siren ? (fl ? '#ff4040' : '#4f7dff') : '#5a8cff', { size: c.siren ? 3.4 : 2.6, shape: 'square' });
    }
    for (const p of S.cops) if (!p.dead && !p.removed && !p.ai.indoor) X.blip(p.x, p.y, '#8fb6ff', { size: 1.8 });
    if (S.heli) X.blip(S.heli.x, S.heli.y, '#ffffff', { size: 4.2, ring: fl });
    // sirens close by wash the edges of the screen red and blue
    if (S.sirenD < 32 && P.wanted && !X.scene && G().status === 'play' && SET().screenFx !== false) {
      const a = 0.13 * (1 - S.sirenD / 32), on = Math.floor(t * 8) % 2 === 0, w = Math.max(10, view.cw * 0.012);
      ctx.fillStyle = on ? `rgba(255,30,30,${a})` : `rgba(40,80,255,${a})`; ctx.fillRect(0, 0, w, view.ch);
      ctx.fillStyle = on ? `rgba(40,80,255,${a})` : `rgba(255,30,30,${a})`; ctx.fillRect(view.cw - w, 0, w, view.ch);
    }
  }

  // ================= module =================
  X.police = {
    addHeat, setWanted, clear, alert,
    get units() { return S.units; },
    get heat() { return S.heat; },
    get cars() { return S.cars; },
    get cops() { return S.cops; },
    get heli() { return S.heli; },
    get blocks() { return S.blocks; },
    get seen() { return S.seen; },
    get arrest() { return Math.max(S.arrest / TUNE.arrestFoot, S.arrestCar / TUNE.arrestCar); },
    level: () => P.wanted || 0,
    radio: text => radio(text, 2),
    spawnCar: (role, kind, x, y, th) => {
      kind = kind || 'cop'; syncPos();
      const sp = x != null ? { x, y, th: th || 0 } : roadSpawnPoint(60, 140, false);
      if (!sp) return null;
      const c = makeCopCar(kind === 'tank' ? 'tank' : kind === 'cop' ? 'police' : 'swat', sp.x, sp.y, sp.th, role || 'pursuit', kind === 'tank' ? 'army' : kind);
      c.pol.forced = true;   // asked for by name: the policeMax trim leaves it alone
      if (c.pol.role === 'pursuit') toPursuit(c);
      return c;
    },
    spawnCop: (x, y, kind, state) => makeCop(x, y, kind || 'cop', state || 'chase'),
    spawnHeli: () => { syncPos(); return spawnHeli(); },
    roadblock: () => { syncPos(); return spawnRoadblock(true); },
    tune: TUNE, LV, KINDS, LINES, _S: S, _V: V,
  };
  X.mod('police', {
    order: 35,
    init() {
      for (const c of S.flat) unflat(c);
      V.siren = killVoice(V.siren); V.rotor = killVoice(V.rotor);
      reset();
      S.guns = hasGuns();
      P.wanted = 0; P.wantedFlash = false;
      radioEl(); hideRadio();
      SIRENS.length = 0; X.trafficRules.push(sirenRule);
      if (P.ped) { S.lastX = S.px = P.ped.x; S.lastY = S.py = P.ped.y; }
      stationCars();
    },
    stop() {
      V.siren = killVoice(V.siren); V.rotor = killVoice(V.rotor);
      hideRadio();
      for (const c of S.flat) unflat(c);
      S.flat = [];
    },
    tick(dt) {
      if (!X.city || !P.ped) return;
      syncPos();
      S.spawnT -= dt; S.blockT -= dt; S.heliT -= dt;
      if (X.scene) S.inT += dt;
      if ((S.seeT -= dt) <= 0) { S.seeT = 0.2; updateSeen(); }
      if (S.heat > 0 || P.wanted) decay(dt);
      if ((S.mgrT -= dt) <= 0) { S.mgrT = 0.5; manage(); }
      for (let i = 0; i < S.cars.length; i++) carTick(S.cars[i], dt);
      for (let i = 0; i < S.cops.length; i++) { const p = S.cops[i]; if (!p.dead && !p.removed) copTick(p, dt); }
      if (P.car && P.car.model.kind === 'tank') playerTank(dt);
      for (let i = 0; i < S.cars.length; i++) { const c = S.cars[i]; if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 2); }
      shellsTick(dt); sirensTick(); heliTick(dt); blocksTick(dt); flatTick(dt); arrestTick(dt); radioTick(dt);
    },
    hud() { audioTick(); },
    render: { ground: drawGround, props: drawProps, bodies: drawGlowPools, cars: drawCarsFx, air: drawAir, overlay: drawOverlay, screen: drawScreen },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
