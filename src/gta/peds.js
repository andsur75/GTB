// Pedestrians and gangs for Grand Theft Bus. About 70 civilians walk the sidewalk ring around each block
// (walkers, joggers, slow pensioners with canes, couples holding hands, dog walkers, businessmen with
// briefcases, tourists flashing cameras, night-time drunks), cross at the zebras when the road is clear (or
// jaywalk), go in and out of building doors, stop to phone, smoke, chat, film wrecks and sit in the park.
// They flee gunfire and explosions (panic spreads), dive away from cars on the pavement, scream, cower,
// raise their hands at a pointed gun, shake their fists, fight back (3 in 4 of them, with brawl.js) when
// punched, kicked, shoved by a car, carjacked or mugged, gather in a ring to watch a street fight (cheering,
// filming, calling the police), run around on fire, mourn their partner and phone the police as witnesses. Corpses ragdoll, bleed spreading pools
// (bloody footprints included), drop cash and are cleaned up. Three gangs own districts and hang on their
// corners until provoked, then fight with fists, bats and guns (X.gangs, with GTA2-style respect).
// Replaces X.drawPed with chunky top-down people; adds X.crowd. Also applies car-on-pedestrian hits that
// core's carPedHits misses (see carHits).
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const hr = (s, i) => { const v = Math.sin(s * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
  // Tunables (tests poke these).
  const OPT = { target: 70, fightChance: 0.75, diveChance: 0.85, crossChance: 0.22, jaywalk: 0.002, gangCap: 9, mugFight: 0.12, mugFightFists: 0.35, enterChance: 0.14 };

  // How much more (or less) likely than OPT.fightChance each kind of person is to fight back.
  const FIGHT_K = { old: 0.34, jogger: 0.6, business: 0.8, tourist: 0.85, drunk: 1.25, tough: 1.3 };

  // ================= looks =================
  const SKIN = ['#f1c7a1', '#e0ac7e', '#c68a5c', '#8d5a3b', '#5c3a24', '#f6d7bd'];
  const HAIR = ['#1b1612', '#3a2a1e', '#6d4c2f', '#b9a47a', '#d8c08a', '#a33a1e', '#1b1612'];
  const GREY = ['#8a8a8a', '#b8b8b8', '#d9d9d9', '#eeeeee'];
  const SHIRT = ['#2f6fb5', '#c0392b', '#e9e4d8', '#3e8e5a', '#f2c230', '#6b4a8f', '#1b1f27', '#e07b2a', '#3fb6c4', '#d64a8f', '#8a9199', '#5a7a3a'];
  const PANTS = ['#1f2a44', '#2b2d33', '#4a3b2a', '#5a5d64', '#24332a', '#6b5a3e', '#3a4a6b'];
  const JACKET = ['#2b2d33', '#5a3d22', '#1f3f6e', '#4a5a3a', '#7a2a24', '#8a8f96', '#c9a46a'];
  const SUIT = ['#2b2f3a', '#3a3f4a', '#1f2533', '#4a4036', '#2f3b2f'];
  const TIE = ['#b0151a', '#1f4f9c', '#d9a92a', '#6b2a5a', '#2f7d6d'];
  const NEON = ['#ff4a8a', '#3fd0ff', '#b6ff3a', '#ff8a1e', '#ffffff', '#c25cff'];
  const KNIT = ['#8a7a64', '#6b5a7a', '#5a6b5a', '#9a6a5a', '#7a8090', '#a08a6a'];
  const DOGC = [['#c99a4a', '#8a6428'], ['#1d1a18', '#0c0b0a'], ['#e8e4dc', '#b8b0a0'], ['#6b4a2a', '#45301a'], ['#8a8a8a', '#5a5a5a'], ['#d6b07a', '#a07a48']];
  const BLOOD = ['#8a0f12', '#b0151a', '#5c0a0c'];
  const STYLES = ['short', 'short', 'short', 'long', 'bun', 'pony', 'bald', 'afro', 'curly', 'buzz'];
  const DEF_LOOK = { skin: '#e0ac7e', hair: '#222', shirt: '#888', pants: '#333', hat: null };
  function baseLook() {
    return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS), hat: null, hatType: null, hairStyle: pick(STYLES), outfit: '', acc: null, jacket: null, tie: null, scale: rand(0.93, 1.07) };
  }
  function makeLook(type) {
    const lk = baseLook();
    switch (type) {
      case 'business':
        lk.outfit = 'suit'; lk.shirt = pick(SUIT); lk.pants = lk.shirt; lk.tie = pick(TIE); lk.acc = Math.random() < 0.75 ? 'briefcase' : null;
        if (lk.hairStyle === 'afro' || lk.hairStyle === 'long' || lk.hairStyle === 'curly') lk.hairStyle = 'short';
        break;
      case 'jogger':
        lk.outfit = 'jog'; lk.shirt = pick(NEON); lk.pants = pick(['#1b1f27', '#2b2d33', '#3a3a5a']);
        if (Math.random() < 0.55) { lk.hat = pick(NEON); lk.hatType = 'band'; }
        if (lk.hairStyle === 'long') lk.hairStyle = 'pony';
        break;
      case 'old':
        lk.outfit = 'old'; lk.shirt = pick(KNIT); lk.pants = pick(['#4a4036', '#3a3f4a', '#5a5d64']); lk.hair = pick(GREY);
        lk.hairStyle = pick(['short', 'bald', 'bun', 'buzz']); lk.acc = Math.random() < 0.7 ? 'cane' : null; lk.scale *= 0.94;
        if (Math.random() < 0.35) { lk.hat = pick(['#4a4036', '#5a5d64', '#6b5a3e']); lk.hatType = 'flat'; }
        break;
      case 'tourist':
        lk.outfit = 'tourist'; lk.shirt = pick(['#3fb6c4', '#f2c230', '#e07b2a', '#d64a8f', '#3e8e5a']); lk.pants = pick(['#c8b88a', '#e9e4d8', '#6b5a3e']); lk.acc = 'camera';
        if (Math.random() < 0.5) { lk.hat = pick(['#e9e4d8', '#c8b88a', '#f2f2f2']); lk.hatType = 'bucket'; }
        break;
      case 'shopper': lk.acc = 'bags'; if (Math.random() < 0.5) lk.jacket = pick(JACKET); break;
      case 'drunk': lk.acc = 'beer'; if (Math.random() < 0.5) lk.jacket = pick(JACKET); break;
      case 'dogwalker': lk.acc = 'leash'; if (Math.random() < 0.4) lk.jacket = pick(JACKET); break;
      case 'tough':   // big, buzz cut, tank top or a leather jacket: the one who always fights back
        lk.scale = rand(1.1, 1.17); lk.hairStyle = pick(['buzz', 'bald', 'buzz', 'mohawk']); lk.shirt = pick(['#e9e4d8', '#1b1f27', '#8a9199', '#5a7a3a']);
        lk.pants = pick(['#1f2a44', '#2b2d33', '#24332a']); lk.jacket = Math.random() < 0.45 ? '#1d1a18' : null; lk.outfit = 'tough';
        break;
      default:
        if (Math.random() < 0.35) lk.jacket = pick(JACKET);
        if (Math.random() < 0.14) { lk.hat = pick(['#1b1f27', '#8a1f1a', '#e9e4d8', '#2f6fb5', '#3e8e5a']); lk.hatType = pick(['cap', 'beanie']); }
    }
    return lk;
  }

  // ================= lines =================
  const L = {
    jacked: ['MY {car}!', 'I WAS GOING TO TAKE THE BUS!', 'HEY! THAT IS MY CAR!', 'UFF DA!', 'COME BACK WITH MY {car}!', 'I JUST WASHED IT!', 'IT IS NOT EVEN PAID OFF!'],
    fight: ['YOU WANT SOME?', 'COME HERE!', 'I DO KARATE!', 'NOBODY TOUCHES MY CAR!', 'PUT UP YOUR DUKES!'],
    dodge: ['WATCH IT!', 'IDIOT!', 'THIS IS A SIDEWALK!', 'LEARN TO DRIVE!', 'TAKE THE BUS!', 'MANIAC!'],
    old: ['HOOLIGAN!', 'IN MY DAY WE WALKED!', 'I AM WRITING TO THE PAPER!'],
    panic: ['AAAH!', 'HELP!', 'HJELP!', 'RUN!', 'UFF DA!', 'NOT AGAIN!'],
    burn: ['HOT! HOT! HOT!', 'AAAAAAH!', 'WATER!'],
    bump: ['HEY!', 'OI!', 'EXCUSE YOU!', 'WATCH WHERE YOU WALK!'],
    honk: ['ALRIGHT, ALRIGHT!', 'I AM WALKING HERE!', 'HONK YOURSELF!'],
    call: ['HELLO, 112?', 'POLICE? IT IS HIM!', 'YES, A MANIAC!', 'I AM CALLING THE COPS!'],
    mug: ['TAKE IT! TAKE IT!', 'DON\'T SHOOT!', 'IT IS ALL I HAVE!', 'NOT MY PENSION!'],
    drunk: ['SKÅL!', 'I LOVE THIS CITY!', 'TAKE THE BUS? *HIC*', 'WHO MOVED THE FJORD?'],
    gloat: ['STAY OFF OUR TURF!', 'WHO IS NEXT?', 'NOBODY MESSES WITH US!'],
    mourn: ['NOOO!', 'WHY?!', 'MY LOVE!'],
    film: ['GOING VIRAL!', 'THIS IS CONTENT!', 'LIKE AND SUBSCRIBE!'],
    warn: ['NOT ON OUR TURF!', 'PUT THAT AWAY!', 'LAST WARNING!'],
    hello: ['HEY BOSS!', 'RESPECT!', 'LOOKING GOOD!'],
    give: ['FINE, KEEP IT!', 'COME BACK HERE!', 'I KNOW WHERE YOU PARK!'],
    cheer: ['FIGHT!', 'FIGHT! FIGHT!', 'HIT HIM!', 'OHHH!', 'KNOCK HIM OUT!', 'WORLDSTAR!', 'GO ON!'],
    ooh: ['OOOOH!', 'DAAAMN!', 'HE IS DOWN!', 'OUCH!'],
  };

  // ================= gangs =================
  const GANG_DEFS = [
    { id: 'metal', name: 'Black Metal Brigade', color: '#cfd3da', prefer: ['Smog Hill', 'Tolltown', 'Old Pier'],
      look: () => ({ skin: pick(['#f1c7a1', '#f6d7bd', '#e0ac7e']), hair: '#0d0c0c', hairStyle: 'long', shirt: '#141416', pants: '#1b1b1f', hat: null, outfit: 'metal', scale: rand(0.98, 1.08) }),
      arms: [['pistol', 0.4], ['bat', 0.3], ['shotgun', 0.08]], poses: ['headbang', 'cross', 'headbang', 'smoke'],
      lines: ['TRUE NORWEGIAN BLACK METAL!', 'GRIM AND FROSTBITTEN!', 'THE FJORD IS OURS!', 'HAIL THE NIGHT BUS!'] },
    { id: 'mafia', name: 'Brunost Mafia', color: '#d9a441', prefer: ['Bank Row', 'Old Pier', 'Fjordheim'],
      look: () => ({ skin: pick(SKIN), hair: pick(['#1b1612', '#3a2a1e', '#8a8a8a']), hairStyle: pick(['short', 'bald', 'buzz']), shirt: pick(['#6b4a2a', '#5a3d22', '#7a5530']), pants: '#3b2716', hat: '#2a1d12', hatType: 'fedora', outfit: 'suit', tie: '#e8b04a', scale: rand(1.0, 1.1) }),
      arms: [['pistol', 0.45], ['uzi', 0.3]], poses: ['cross', 'smoke', 'cross', null],
      lines: ['YOU MESS WITH THE CHEESE...', 'THIS IS FAMILY BUSINESS', 'NICE CAR. SHAME IF IT BURNED.', 'BRUNOST NEVER FORGETS'] },
    { id: 'russ', name: 'Russ Crew', color: '#ff4a3a', prefer: ['Neon Mile', 'Parkingdal', 'Tesla Flats'],
      look: () => ({ skin: pick(SKIN), hair: pick(HAIR), hairStyle: pick(['short', 'long', 'pony', 'curly']), shirt: '#d0261d', pants: '#c3241c', hat: '#d0261d', hatType: 'russ', outfit: 'overalls', scale: rand(0.92, 1.02) }),
      arms: [['bat', 0.35], ['molotov', 0.15], ['pistol', 0.12]], poses: ['dance', 'drink', 'dance', 'cross'],
      lines: ['RUSS 2026!!', 'PARTY BUS!', 'SKÅL!', 'WE OWN THIS STREET UNTIL MAY 17TH!'] },
  ];
  let GL = [];   // this game's gangs: {id, name, color, def, district, rect, blocks, respect, hostileT, kills}

  // ================= state =================
  let S = null, BI = null;
  function fresh() {
    return {
      popT: 0, cleanT: 0.2, aimT: 0, crowdT: 0.3, cheerT: 0, beatT: 0, beat: 0, gangT: 0, scanT: 0, printT: 0, sndT: 0, lineT: 0, q: 1, ema: 1 / 60, slowT: 0, lastNow: 0, nThreat: 0, gid: 0, lastDistrict: '', popupT: 0,
      pools: [], prints: [], dogs: [], groups: [], corpses: [], wrecks: [], cash: [], flashes: [], respT: 0,
      stats: { spawned: 0, despawned: 0, fled: 0, dives: 0, crossings: 0, jaywalks: 0, witnesses: 0, calls: 0, cash: 0, cleaned: 0, fights: 0, provoked: 0, mugs: 0, adopted: 0, chats: 0, entered: 0, exited: 0, watchers: 0, joined: 0 },
    };
  }
  const live = () => X.active && S && X.city;
  const hour = () => Math.floor((X.clock || 0) / 60) % 24;
  const night = () => { const h = hour(); return h >= 19 || h < 7; };
  const mine = p => !!(p && p.ai && p.ai.owner === 'peds');
  // Our AI for someone, even while brawl.js has them in a fist fight (it keeps ours as ai.prev).
  const pai = p => !p || !p.ai ? null : p.ai.owner === 'peds' ? p.ai : p.ai.owner === 'brawl' && p.ai.prev && p.ai.prev.owner === 'peds' ? p.ai.prev : null;

  // ================= city geometry: blocks and their sidewalk rings =================
  function buildIndex() {
    const C = X.city; BI = new Map();
    for (let k = 0; k < C.blocks.length; k++) BI.set(C.blocks[k], { i: Math.floor(k / C.NY), j: k % C.NY });
  }
  function blockIJ(i, j) { const C = X.city; if (i < 0 || j < 0 || i >= C.NX || j >= C.NY) return null; return C.blocks[i * C.NY + j] || null; }
  function nearestBlock(x, y) {
    const C = X.city;
    let i = 0; while (i < C.NX - 1 && C.xs[i + 1] <= x) i++;
    let j = 0; while (j < C.NY - 1 && C.ys[j + 1] <= y) j++;
    return blockIJ(i, j);
  }
  // Ring corners at inset li: 0 TL, 1 TR, 2 BR, 3 BL (clockwise on screen). Edge k runs corner k -> k+1.
  const TMP = { x: 0, y: 0 };
  function corner(b, li, k, o) { o.x = k === 0 || k === 3 ? b.x0 + li : b.x1 - li; o.y = k < 2 ? b.y0 + li : b.y1 - li; return o; }
  const OUT = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];    // edge k faces the road this way
  function laneFor(a) { return a.dir > 0 ? rand(2.85, 3.8) : rand(1.95, 2.85); }   // keep right
  function edgeOf(b, x, y) {
    const dT = y - b.y0, dB = b.y1 - y, dL = x - b.x0, dR = b.x1 - x;
    let e = 0, m = dT;
    if (dR < m) { m = dR; e = 1; } if (dB < m) { m = dB; e = 2; } if (dL < m) e = 3;
    return e;
  }
  // Put a ped back on a block's ring: nearest edge, a lane for its direction, a join point if off the ring.
  function snapRing(p, b, keepDir) {
    const a = p.ai; if (!b) return;
    a.blk = b;
    if (!keepDir || !a.dir) a.dir = Math.random() < 0.5 ? 1 : -1;
    if (!keepDir || !a.li) a.li = laneFor(a);
    const e = edgeOf(b, p.x, p.y), li = a.li;
    a.ci = a.dir > 0 ? (e + 1) % 4 : e;
    let jx = cl(p.x, b.x0 + li, b.x1 - li), jy = cl(p.y, b.y0 + li, b.y1 - li);
    if (e === 0) jy = b.y0 + li; else if (e === 2) jy = b.y1 - li; else if (e === 1) jx = b.x1 - li; else jx = b.x0 + li;
    a.jx = jx; a.jy = jy; a.join = Math.hypot(jx - p.x, jy - p.y) > 0.7;
  }
  function curEdge(a) { return a.dir > 0 ? (a.ci + 3) % 4 : a.ci; }
  function nextCorner(k, dir) { return dir > 0 ? (k + 1) % 4 : (k + 3) % 4; }
  // A random spot on a sidewalk ring between rMin and rMax from (x, y), clear of solids, cars and people.
  function sidewalkSpot(x, y, rMin, rMax) {
    const C = X.city;
    for (let k = 0; k < 10; k++) {
      const an = Math.random() * TAU, r = rand(rMin, rMax), px = x + Math.cos(an) * r, py = y + Math.sin(an) * r;
      if (px < 3 || py < 3 || px > C.W - 3 || py > C.H - 3) continue;
      const b = nearestBlock(px, py); if (!b) continue;
      const ins = rand(1.95, 3.8);
      let qx = cl(px, b.x0 + ins, b.x1 - ins), qy = cl(py, b.y0 + ins, b.y1 - ins);
      const e = edgeOf(b, qx, qy);
      if (e === 0) qy = b.y0 + ins; else if (e === 2) qy = b.y1 - ins; else if (e === 1) qx = b.x1 - ins; else qx = b.x0 + ins;
      const d = Math.hypot(qx - x, qy - y); if (d < rMin * 0.85 || d > rMax * 1.15) continue;
      if (X.blocked(qx, qy, 0.45) || carAt(qx, qy, 0.5) || crowded(qx, qy, 1.3)) continue;
      return { x: qx, y: qy, b };
    }
    return null;
  }
  function carAt(x, y, r) {
    for (const c of X.cars) if (!c.removed && Math.abs(c.x - x) < 7 && Math.abs(c.y - y) < 7 && X.circlePoly(x, y, r, X.carPoly(c))) return true;
    return false;
  }
  function crowded(x, y, r) {
    for (const q of X.peds) if (!q.removed && !q.hidden && Math.abs(q.x - x) < r && Math.abs(q.y - y) < r) return true;
    return false;
  }

  // ================= spawning =================
  const SPEED = { tough: [1.4, 1.7], walker: [1.5, 1.9], business: [1.8, 2.1], jogger: [4.2, 5.2], old: [0.8, 1.1], shopper: [1.35, 1.7], tourist: [1.2, 1.5], drunk: [1.0, 1.35], dogwalker: [1.35, 1.6], couple: [1.35, 1.6], victim: [1.6, 1.9], gang: [1.6, 2.0] };
  const FLEE = { old: 2.7, jogger: 6.6, drunk: 3.8 };
  const TYPE_NAME = { walker: 'pedestrian', business: 'businessman', jogger: 'jogger', old: 'pensioner', shopper: 'shopper', tourist: 'tourist', drunk: 'drunk', dogwalker: 'dog walker', couple: 'lovebird', victim: 'driver', tough: 'tough guy' };
  function newAI(type) {
    const sp = SPEED[type] || SPEED.walker;
    return {
      owner: 'peds', type, st: 'walk', t: 0, spd: rand(sp[0], sp[1]), blk: null, li: 0, dir: 1, ci: 0, join: false, jx: 0, jy: 0,
      nextIdle: rand(10, 45), fx: 0, fy: 0, ha: 0, hT: 0, lvl: 0, spT: 0, after: null, diveCar: 0, diveCd: 0, dvx: 0, dvy: 0,
      atkCd: 0, punchT: 0, alertT: 0, target: null, partner: null, lead: null, follow: null, dog: null, gang: null, group: null,
      idle: null, face: null, pose: null, stuck: 0, stuckT: 0, lx: 0, ly: 0, witT: 0, bumpCd: 0, brisk: 0, sawBody: false, sawWreck: 0,
      mugged: false, scrT: 0, jumpT: 0, fade: 1, doorT: rand(0, 0.6), los: false, losT: 0, hostT: 0, burst: 0, pause: 0, strafe: 1, strafeT: 0, warnT: -9,
      cx0: 0, cy0: 0, cx1: 0, cy1: 0, nb: null, jay: false, chk: 0, angryAt: null, slot: 0, rad: 1, hpose: null, hposeT: 0, jit: 0,
      provBy: null, provT: -9, provFight: false, fightRef: null, seenFight: null, wpose: null,
    };
  }
  function pickType(x, y) {
    const h = hour(), late = h >= 22 || h < 5, day = h >= 7 && h < 19, dn = X.districtAt(x, y);
    const bar = X.places && X.places.bar, nearBar = bar && Math.hypot(bar.door.x - x, bar.door.y - y) < 120;
    const W = [
      ['walker', 30], ['business', (day ? 13 : 3) + (dn === 'Bank Row' ? 12 : 0)], ['jogger', (h >= 5 && h < 10) || (h >= 17 && h < 21) ? 10 : 3],
      ['old', (h >= 8 && h < 20 ? 9 : 2) + (dn === 'Old Pier' ? 6 : 0)], ['shopper', (h >= 9 && h < 21 ? 9 : 1.5) + (dn === 'Neon Mile' ? 5 : 0)],
      ['tourist', 5 + (dn === 'Old Pier' || dn === 'Fjordheim' ? 6 : 0)], ['couple', 6], ['dogwalker', 6],
      ['drunk', (late ? 8 : 0.5) + (late && (dn === 'Neon Mile' || nearBar) ? 12 : 0)], ['tough', 3 + (late ? 2 : 0) + (nearBar ? 3 : 0)],
    ];
    let tot = 0; for (const w of W) tot += w[1];
    let r = Math.random() * tot;
    for (const w of W) if ((r -= w[1]) <= 0) return w[0];
    return 'walker';
  }
  function makeCiv(type, x, y, b) {
    const old = type === 'old', hp = old ? 60 : type === 'tough' ? 130 : 100;
    const p = X.makePed({ x, y, th: Math.random() * TAU, team: 'civ', look: makeLook(type), hp, maxHp: hp });
    if (type === 'tough') p.meleeMul = 1.25;   // big lads hit harder (brawl.js)
    p.ai = newAI(type);
    snapRing(p, b);
    corner(b, p.ai.li, p.ai.ci, TMP); p.th = Math.atan2(TMP.y - p.y, TMP.x - p.x);
    S.stats.spawned++;
    return p;
  }
  // One spawn: a person, a couple or a dog walker with a dog. Returns how many people appeared.
  function spawnCiv(f, rMin, rMax, inViewOk, type) {
    for (let tries = 0; tries < 6; tries++) {
      const s = sidewalkSpot(f.x, f.y, rMin, rMax); if (!s) continue;
      if (!inViewOk && X.inView(s.x, s.y, 3)) continue;
      if (inViewOk && P.ped && Math.hypot(s.x - P.ped.x, s.y - P.ped.y) < 4) continue;
      const ty = type || pickType(s.x, s.y);
      const p = makeCiv(ty, s.x, s.y, s.b);
      if (ty === 'couple') {
        const rx = -Math.sin(p.th), ry = Math.cos(p.th), qx = p.x + rx * 0.7, qy = p.y + ry * 0.7;
        if (X.blocked(qx, qy, 0.35)) return 1;
        const q = makeCiv('couple', qx, qy, s.b);
        q.ai.lead = p; p.ai.follow = q; q.th = p.th; q.ai.spd = p.ai.spd;
        return 2;
      }
      if (ty === 'dogwalker') p.ai.dog = makeDog(p);
      return 1;
    }
    return 0;
  }
  function removePed(p) {
    p.removed = true; S.stats.despawned++;
    const a = p.ai;
    if (a && a.dog) { a.dog.owner = null; if (!X.inView(a.dog.x, a.dog.y, 3)) a.dog.removed = true; }
  }
  // PG.settings.pedDensity scales the crowd (0.5 .. 1.25)
  const density = () => { const d = +(PG.settings || {}).pedDensity; return d > 0 ? Math.min(2, d) : 1; };
  // q: the module's own frame-rate guard (only slows the spawning); the density setting also trims
  function targetCount(q) {
    const h = hour(), late = h >= 2 && h < 5;
    return Math.round(OPT.target * (late ? 0.72 : 1) * (q == null ? S.q : q) * density());
  }
  function viewR() { const v = X.lastView; return Math.min(150, v ? v.r : 40); }
  function population(f) {
    const vr = viewR(), keep = Math.max(130, vr + 60);
    let civ = 0;
    for (let i = 0, n = X.peds.length; i < n; i++) {
      const p = X.peds[i], a = p.ai;
      if (!a || a.owner !== 'peds' || p.removed || p.dead) continue;
      const d = Math.hypot(p.x - f.x, p.y - f.y), far = d > keep + (a.type === 'gang' ? 70 : 0);
      if ((far && !X.inView(p.x, p.y, 8)) || (a.stuck >= 3 && !X.inView(p.x, p.y, 3))) { removePed(p); continue; }
      if (a.type !== 'gang') civ++;
    }
    const want = targetCount(), rMin = vr + 3, rMax = Math.max(rMin + 20, Math.min(keep - 5, rMin + 55));
    const most = targetCount(1);
    if (civ > most + 3) {   // the density setting went down: the farthest idle walkers out of sight go first
      let n = Math.min(4, civ - most);
      const far = [];
      for (const p of X.peds) { const a = p.ai; if (a && a.owner === 'peds' && !p.removed && !p.dead && a.type !== 'gang' && !a.dog && !a.lead && !a.follow && !a.partner && a.st !== 'chat' && CALM[a.st] && !X.inView(p.x, p.y, 6)) far.push(p); }
      far.sort((a, b) => Math.hypot(b.x - f.x, b.y - f.y) - Math.hypot(a.x - f.x, a.y - f.y));
      for (const p of far) { if (n-- <= 0) break; removePed(p); civ--; }
    }
    if (civ < want && !X.scene && Math.random() < 0.3) civ += spawnAtDoor(f);
    for (let k = 0; k < 4 && civ < want; k++) { const n = spawnCiv(f, rMin, rMax, false); if (!n) break; civ += n; }
  }
  // Building doors per block (lazily): people walk in and out of them.
  const PLACE_TYPE = { bar: 'drunk', bank: 'business', hospital: 'old', gunshop: 'walker', apartment: 'walker', police: 'walker' };
  let DOORS = new Map();
  function doorsOf(b) {
    let d = DOORS.get(b); if (d) return d;
    d = [];
    for (const bd of X.city.buildings) {
      if (bd.deco || bd.place) continue;
      const cx = (bd.x0 + bd.x1) / 2, cy = (bd.y0 + bd.y1) / 2; if (cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) continue;
      const dr = X.buildingDoor(bd, Math.floor(hr(bd.x0, bd.y0) * 4)); if (dr) d.push(dr);
    }
    for (const id in X.places || {}) { const pl = X.places[id], dr = pl.door; if (dr && dr.x > b.x0 && dr.x < b.x1 && dr.y > b.y0 && dr.y < b.y1) d.push({ x: dr.x, y: dr.y, nx: dr.nx, ny: dr.ny, place: id }); }
    DOORS.set(b, d);
    return d;
  }
  // Someone steps out of a door in view (the crowd refills without popping into existence).
  function spawnAtDoor(f) {
    const near = [];
    for (const b of X.city.blocks) if (b.x1 > f.x - 40 && b.x0 < f.x + 40 && b.y1 > f.y - 40 && b.y0 < f.y + 40) near.push(b);
    return near.length ? doorSpawn(pick(near), P.car || P.ped) : 0;
  }
  function doorSpawn(b, pp) {
    const ds = doorsOf(b); if (!ds.length) return 0;
    const d = pick(ds);
    return doorPed(b, d, pp);
  }
  function doorPed(b, d, pp) {
    if (!X.inView(d.x, d.y, -2) || (pp && Math.hypot(d.x - pp.x, d.y - pp.y) < 6) || crowded(d.x, d.y, 1.5) || X.blocked(d.x, d.y, 0.4)) return 0;
    const h = hour();
    let ty = d.place ? (d.place === 'bar' && (h >= 21 || h < 4) ? 'drunk' : PLACE_TYPE[d.place] || pickType(d.x, d.y)) : pickType(d.x, d.y);
    if (ty === 'couple' || ty === 'dogwalker') ty = 'walker';   // pairs and dogs stay on the street
    const p = makeCiv(ty, d.x - d.nx * 0.35, d.y - d.ny * 0.35, b);
    p.th = Math.atan2(d.ny, d.nx); p.ai.fade = 0.01;
    S.stats.exited++;
    return 1;
  }
  // Passing a door: sometimes go in.
  function maybeEnter(p) {
    const a = p.ai, b = a.blk;
    if (!b || a.lead || a.follow || a.dog || a.join) return false;
    for (const d of doorsOf(b)) {
      if (Math.abs(d.x - p.x) > 2.2 || Math.abs(d.y - p.y) > 2.2) continue;
      if (Math.random() > (d.place === 'bar' && a.type === 'drunk' ? 0.6 : OPT.enterChance)) return false;
      a.st = 'enter'; a.cx1 = d.x; a.cy1 = d.y; a.cx0 = d.x - d.nx * 1.1; a.cy0 = d.y - d.ny * 1.1; a.t = 0;
      return true;
    }
    return false;
  }
  // Unowned people (ejected drivers, peds another module let go of) become ours.
  function adopt(p, type) {
    p.ai = newAI(type || 'victim');
    snapRing(p, nearestBlock(p.x, p.y));
    S.stats.adopted++;
    return p;
  }
  function adoptScan() {
    for (let i = 0, n = X.peds.length; i < n; i++) {
      const p = X.peds[i];
      if (p.ai || p.isPlayer || p.dead || p.removed || p.car || p.hidden) continue;
      if (p._seenFree == null) { p._seenFree = X.time; continue; }
      if (X.time - p._seenFree < (p.team && p.team !== 'civ' ? 2 : 0.4)) continue;
      if (p.x < -20 || p.y < -20 || p.x > X.city.W + 20 || p.y > X.city.H + 20) continue;   // someone else's interior
      adopt(p, 'walker');
      startFlee(p, p.x + rand(-1, 1), p.y + rand(-1, 1), rand(3, 5), 0, false);
    }
  }

  // ================= sound and speech =================
  function voice(p, kind) {
    if (!S || G().status !== 'play' || !P.ped) return;
    const pp = P.car ? P.car : P.ped, d = Math.hypot(p.x - pp.x, p.y - pp.y);
    if (d > 46 || X.time < S.sndT) return;
    const k = PG.audio.kit(); if (!k) return;
    S.sndT = X.time + (kind === 'scream' ? 0.22 : 0.08);
    const v = Math.pow(1 - d / 46, 1.3), b = 0.72 + hr(p.id || 1, 7) * 0.75, t = k.now;
    switch (kind) {
      case 'scream':
        k.tone('sawtooth', 520 * b, t, 0.16, 0.05 * v, { to: 920 * b, lp: 2600, vib: [9, 18], attack: 0.03 });
        k.tone('sawtooth', 920 * b, t + 0.15, 0.55, 0.05 * v, { to: 470 * b, lp: 2300, vib: [7, 30] });
        k.noise(t, 0.6, 0.012 * v, 'bandpass', 1800, { Q: 1.5 });
        break;
      case 'yelp': k.tone('triangle', 720 * b, t, 0.15, 0.09 * v, { to: 380 * b, lp: 2600 }); break;
      case 'oof': k.tone('sine', 250 * b, t, 0.12, 0.13 * v, { to: 140 * b }); k.noise(t, 0.07, 0.06 * v, 'lowpass', 500); break;
      case 'hey':
        k.tone('square', 330 * b, t, 0.09, 0.03 * v, { lp: 1300, to: 370 * b });
        k.tone('square', 300 * b, t + 0.1, 0.16, 0.03 * v, { lp: 1200, to: 230 * b });
        break;
      case 'die': k.tone('sawtooth', 430 * b, t, 0.45, 0.05 * v, { to: 150 * b, lp: 1600, vib: [6, 20] }); break;
      case 'war': k.tone('sawtooth', 150 * b, t, 0.55, 0.06 * v, { lp: 900, vib: [5, 14], to: 230 * b }); k.noise(t, 0.4, 0.035 * v, 'bandpass', 700, { Q: 3 }); break;
      case 'punch': k.noise(t, 0.06, 0.25 * v, 'lowpass', 650); k.tone('sine', 140, t, 0.08, 0.15 * v, { to: 60 }); break;
      case 'bark':
        for (let i = 0; i < 2; i++) { k.noise(t + i * 0.19, 0.07, 0.12 * v, 'bandpass', 950, { Q: 2.5 }); k.tone('sawtooth', 470 * b, t + i * 0.19, 0.08, 0.06 * v, { to: 290 * b, lp: 1800 }); }
        break;
      case 'whine': k.tone('sine', 1150, t, 0.4, 0.035 * v, { to: 720, vib: [11, 40] }); break;
      case 'sob': for (let i = 0; i < 3; i++) k.tone('sine', (520 - i * 60) * b, t + i * 0.22, 0.16, 0.04 * v, { to: (420 - i * 50) * b, vib: [14, 25] }); break;
      case 'hic': k.tone('sine', 480 * b, t, 0.07, 0.06 * v, { to: 950 * b }); break;
      case 'squish': k.noise(t, 0.12, 0.2 * v, 'lowpass', 380, { to: 140 }); k.tone('sine', 90, t, 0.1, 0.12 * v, { to: 50 }); break;
      case 'shutter': k.noise(t, 0.03, 0.12 * v, 'highpass', 3000); k.noise(t + 0.06, 0.03, 0.08 * v, 'highpass', 2500); break;
      case 'cash': k.tone('square', 1320, t, 0.06, 0.04 * v, { lp: 4000 }); k.tone('square', 1760, t + 0.07, 0.12, 0.04 * v, { lp: 4000 }); break;
    }
  }
  function say(p, pool, tokens, color) {
    if (!S || X.time < S.lineT || !X.inView(p.x, p.y, -3)) return;
    S.lineT = X.time + 1.2;
    const txt = PG.say ? PG.say(pool, tokens || {}) : pick(pool);
    X.floatText(p.x, p.y - 0.9, txt, color || '#ffffff', { size: 14, life: 1.8 });
  }

  // ================= reactions =================
  const CALM = { walk: 1, toKerb: 1, wait: 1, cross: 1, idle: 1, chat: 1, stroll: 1, watch: 1 };
  function attackerOf(by) {
    if (!by) return null;
    if (by.kind === 'ped') return by;
    if (by.kind === 'car') return by.driver || (by === P.car ? P.ped : null);
    if (by.owner && by.owner.kind === 'ped') return by.owner;
    return null;
  }
  function startFlee(p, sx, sy, dur, lvl, scream) {
    const a = p.ai; if (!a || p.dead) return;
    if (a.type === 'gang') return;
    if (a.st === 'dive' || a.st === 'down' || a.st === 'getup') { a.after = 'flee'; a.fx = sx; a.fy = sy; return; }
    if (a.st === 'burn' || a.st === 'fight') return;
    if (a.st === 'flee') { a.t = Math.max(a.t, dur); a.fx = sx; a.fy = sy; return; }
    endChat(p);
    const d = Math.hypot(p.x - sx, p.y - sy);
    a.fx = sx; a.fy = sy; a.t = dur; a.lvl = lvl; a.spT = 0.3; a.hT = 0; a.ha = Math.atan2(p.y - sy, p.x - sx);
    if (d < 8 && (a.type === 'old' || Math.random() < 0.22)) { a.st = 'cower'; a.ct = rand(1.2, 2.6); }
    else a.st = 'flee';
    S.stats.fled++;
    if (scream && Math.random() < 0.45) voice(p, 'scream');
    if (scream && Math.random() < 0.12) say(p, L.panic);
    if (a.follow && !a.follow.dead && mine(a.follow)) startFlee(a.follow, sx, sy, dur, 0, false);
    if (a.lead && !a.lead.dead && mine(a.lead)) startFlee(a.lead, sx, sy, dur, 0, false);
    if (a.dog) a.dog.barkT = 0;
    // businessmen sometimes drop the briefcase
    if (a.type === 'business' && p.look.acc === 'briefcase' && d < 20 && Math.random() < 0.25) { p.look.acc = null; dropCash(p.x, p.y, Math.round(rand(20, 60)), 25); }
  }
  // Scare everyone of ours within r of (x, y).
  function panic(x, y, r, o) {
    if (!live()) return 0;
    o = o || {};
    let n = 0;
    for (let i = 0, m = X.peds.length; i < m; i++) {
      const p = X.peds[i], a = p.ai;
      if (!a || a.owner !== 'peds' || p.dead || p.removed || p.hidden || p.car || p === o.ignore) continue;
      if (Math.abs(p.x - x) > r || Math.abs(p.y - y) > r) continue;
      const d = Math.hypot(p.x - x, p.y - y); if (d > r) continue;
      startFlee(p, x, y, rand(6, 11) * (o.mul || 1), o.lvl == null ? 2 : o.lvl, Math.random() < 0.6);
      n++;
    }
    return n;
  }
  function endChat(p) {
    const a = p.ai, q = a.partner; a.partner = null;
    if (q && q.ai && q.ai.partner === p) { q.ai.partner = null; if (q.ai.st === 'chat') resume(q); }
  }
  function resume(p) {
    const a = p.ai;
    a.st = 'walk'; a.pose = null; a.idle = null;
    if (a.type === 'gang') { a.st = 'return'; return; }
    snapRing(p, nearestBlock(p.x, p.y), true);
  }
  function startIdle(p, kind, dur, face) {
    const a = p.ai;
    a.st = 'idle'; a.idle = kind; a.t = dur; a.face = face == null ? p.th : face;
  }
  function edgeFace(a, inward) { return OUT[curEdge(a)] + (inward ? Math.PI : 0); }
  function maybeIdle(p) {
    const a = p.ai, ty = a.type, r = Math.random();
    if (a.lead || a.dog || ty === 'victim') return;
    if (ty === 'jogger') { if (r < 0.2) startIdle(p, 'stretch', rand(2.5, 4.5), edgeFace(a, false)); return; }
    if (a.follow && r < 0.5) return startIdle(p, 'look', rand(3, 6), edgeFace(a, true));
    if (r < 0.22 && !a.follow && tryChat(p)) return;
    if (ty === 'tourist' && r < 0.8) return startIdle(p, 'photo', rand(2.4, 3.6), edgeFace(a, Math.random() < 0.5));
    if (ty === 'business' && r < 0.6) return startIdle(p, 'phone', rand(5, 12), p.th + rand(-1, 1));
    if (ty === 'drunk') { if (Math.random() < 0.4) say(p, L.drunk, null, '#ffd23a'); return startIdle(p, 'drink', rand(3, 6), p.th); }
    if (ty === 'old') return startIdle(p, 'look', rand(4, 9), edgeFace(a, false));
    const k = pick(['phone', 'phone', 'smoke', 'look', 'window']);
    startIdle(p, k, k === 'look' ? rand(2, 5) : rand(5, 12), k === 'window' ? edgeFace(a, true) : k === 'look' ? edgeFace(a, false) : p.th + rand(-1.5, 1.5));
  }
  function tryChat(p) {
    let best = null, bd = 3.2;
    for (const q of X.peds) {
      const b = q.ai; if (q === p || !b || b.owner !== 'peds' || q.dead || b.st !== 'walk' || b.partner || b.lead || b.follow || b.dog || b.type === 'gang' || b.type === 'jogger') continue;
      if (Math.abs(q.x - p.x) > bd || Math.abs(q.y - p.y) > bd) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; }
    }
    if (!best) return false;
    const dur = rand(6, 14);
    for (const [u, v] of [[p, best], [best, p]]) { const a = u.ai; a.st = 'chat'; a.partner = v; a.t = dur; }
    S.stats.chats++;
    return true;
  }
  // Corner reached: carry on round the block, cross the road, or wander into the park.
  function atCorner(p) {
    const a = p.ai, b = a.blk, k = a.ci;
    if (b.kind !== 'city' && !a.follow && !a.dog && a.type !== 'jogger' && Math.random() < 0.3 && startStroll(p)) return;
    if (Math.random() < OPT.crossChance * (a.type === 'jogger' ? 1.8 : 1) && startCross(p, k)) return;
    if (Math.random() < 0.04 && !a.follow) { a.dir = -a.dir; a.li = laneFor(a); }
    a.ci = nextCorner(k, a.dir);
  }
  function startStroll(p) {
    const b = p.ai.blk;
    for (let k = 0; k < 6; k++) {
      const x = rand(b.x0 + 6, b.x1 - 6), y = rand(b.y0 + 6, b.y1 - 6);
      if (X.blocked(x, y, 0.7)) continue;
      const a = p.ai; a.st = 'stroll'; a.cx1 = x; a.cy1 = y; return true;
    }
    return false;
  }
  // Zebra crossings sit 0.6..3.6 m from each block corner on every road segment.
  function startCross(p, k) {
    const a = p.ai, b = a.blk, ij = BI.get(b); if (!ij) return false;
    const opts = [];
    const off = rand(1.3, 2.9);
    // over the road above (k 0, 1) or below (k 2, 3)
    { const nb = blockIJ(ij.i, ij.j + (k < 2 ? -1 : 1)); if (nb) { const x = k === 0 || k === 3 ? b.x0 + off : b.x1 - off; opts.push(k < 2 ? [x, b.y0 + 0.6, x, nb.y1 - 0.6, nb] : [x, b.y1 - 0.6, x, nb.y0 + 0.6, nb]); } }
    // over the road to the left (k 0, 3) or right (k 1, 2)
    { const left = k === 0 || k === 3, nb = blockIJ(ij.i + (left ? -1 : 1), ij.j); if (nb) { const y = k < 2 ? b.y0 + off : b.y1 - off; opts.push(left ? [b.x0 + 0.6, y, nb.x1 - 0.6, y, nb] : [b.x1 - 0.6, y, nb.x0 + 0.6, y, nb]); } }
    if (!opts.length) return false;
    const o = pick(opts);
    a.cx0 = o[0]; a.cy0 = o[1]; a.cx1 = o[2]; a.cy1 = o[3]; a.nb = o[4]; a.jay = false; a.st = 'toKerb'; a.t = 0;
    return true;
  }
  function startJaywalk(p) {
    const a = p.ai, b = a.blk, ij = BI.get(b); if (!ij || a.follow || a.lead || a.dog) return false;
    const e = curEdge(a), di = e === 1 ? 1 : e === 3 ? -1 : 0, dj = e === 0 ? -1 : e === 2 ? 1 : 0;
    const nb = blockIJ(ij.i + di, ij.j + dj); if (!nb) return false;
    if (dj) { const x = cl(p.x, b.x0 + 8, b.x1 - 8); a.cx0 = x; a.cx1 = x; a.cy0 = dj < 0 ? b.y0 + 0.6 : b.y1 - 0.6; a.cy1 = dj < 0 ? nb.y1 - 0.6 : nb.y0 + 0.6; }
    else { const y = cl(p.y, b.y0 + 8, b.y1 - 8); a.cy0 = y; a.cy1 = y; a.cx0 = di < 0 ? b.x0 + 0.6 : b.x1 - 0.6; a.cx1 = di < 0 ? nb.x1 - 0.6 : nb.x0 + 0.6; }
    a.nb = nb; a.jay = true; a.st = 'toKerb'; a.t = 0;
    S.stats.jaywalks++;
    return true;
  }
  // Is the stretch of road between the kerbs free of cars that would arrive soon?
  function roadClear(a) {
    const vert = Math.abs(a.cx1 - a.cx0) < 0.5, cx = (a.cx0 + a.cx1) / 2, cy = (a.cy0 + a.cy1) / 2;
    const half = (vert ? Math.abs(a.cy1 - a.cy0) : Math.abs(a.cx1 - a.cx0)) / 2 + 1;
    const lim = a.jay ? 1.6 : 3.2;
    for (const c of X.cars) {
      if (c.removed) continue;
      const along = vert ? c.x - cx : c.y - cy, across = vert ? c.y - cy : c.x - cx;
      if (Math.abs(across) > half || Math.abs(along) > 60) continue;
      const v = X.carVel(c), va = vert ? v.x : v.y, gap = Math.abs(along) - c.len / 2 - 1.2;
      if (gap < 0.6) { if (Math.abs(va) > 0.3 || gap < -0.2) return false; continue; }
      if (along * va < 0 && Math.abs(va) > 0.4 && gap / Math.abs(va) < lim) return false;
    }
    return true;
  }
  function startFight(p, target) {
    const a = p.ai; endChat(p);
    a.st = 'fight'; a.target = target; a.t = 20; a.atkCd = 0.6; a.alertT = 1;
    S.stats.fights++;
    voice(p, 'hey');
  }
  // Attacked: fight back or run? One roll per provocation (the same attacker within a few seconds keeps the
  // answer); hurt or burning people always run.
  function fightsBack(p, att) {
    const a = p.ai;
    if (a.provBy === att && X.time - a.provT < 4) return a.provFight;
    const c = p.hp < p.maxHp * 0.3 || p.onFire > 0 ? 0 : OPT.fightChance * (FIGHT_K[a.type] || 1);
    a.provBy = att; a.provT = X.time; a.provFight = Math.random() < c;
    return a.provFight;
  }
  // Fight back: brawl.js runs the fist fight and hands the person back afterwards (brawlEnd); without it, the
  // old punch-up. A partner close by may wade in too.
  function retaliate(p, att, partner) {
    if (!att || att.dead || att.removed || att === p) return false;
    endChat(p);
    if (X.brawl) { if (!X.brawl.provoke(p, att)) return false; S.stats.fights++; }
    else { startFight(p, att); say(p, L.fight, null, '#ffd23a'); }
    const q = partner !== false && pai(p) ? (pai(p).follow || pai(p).lead) : null;
    if (q && mine(q) && !q.dead && q.ai.type !== 'old' && Math.hypot(q.x - p.x, q.y - p.y) < 6 && Math.random() < 0.5) retaliate(q, att, false);
    return true;
  }
  function startDive(p, ux, uy, car) {
    const a = p.ai;
    if (X.blocked(p.x + ux * 1.4, p.y + uy * 1.4, 0.3)) { ux = -ux; uy = -uy; }
    endChat(p);
    a.st = 'dive'; a.t = 0.5; a.dvx = ux * 7; a.dvy = uy * 7; p.th = Math.atan2(uy, ux);
    a.fx = car.x; a.fy = car.y; a.angryAt = car;
    a.after = a.type === 'gang' ? null : car === P.car && Math.random() < 0.65 ? 'angry' : 'flee';
    S.stats.dives++;
    voice(p, 'yelp');
    X.emit('pedDive', { ped: p, car });
  }
  function startMourn(p, body) {
    const a = p.ai; a.st = 'mourn'; a.t = rand(6, 10); a.target = body; a.lead = null; a.follow = null; a.scrT = 0.5;
    say(p, L.mourn, null, '#9ec2ff');
  }
  function punch(p, tg, ang) {
    const a = p.ai; a.punchT = 0.22;
    const w = p.weapon && X.WEAPONS && X.WEAPONS[p.weapon] && X.WEAPONS[p.weapon].kind === 'melee' ? p.weapon : 'fists';
    if (X.has('weapons')) { X.fireWeapon(p, w, ang); return; }
    if (Math.hypot(tg.x - p.x, tg.y - p.y) > 1.3) return;
    X.damagePed(tg, w === 'bat' ? rand(20, 30) : rand(5, 9), p, 'melee');
    voice(p, 'punch');
    if (!tg.isPlayer && !tg.dead && Math.random() < 0.2) { tg.knock = 0.5; tg.vx += Math.cos(ang) * 2.5; tg.vy += Math.sin(ang) * 2.5; tg.spin = rand(-6, 6); }
  }
  function kickCar(p, c) {
    if (Math.abs(c.speed) > 3) return;
    p.ai.punchT = 0.22;
    X.damageCar(c, rand(8, 14), p, 'melee');
    voice(p, 'punch');
    if (c === P.car) G().shake = Math.max(G().shake, 0.08);
  }

  // ================= gangs =================
  function setupGangs() {
    const C = X.city, names = X.districtNames || [];
    const avoid = new Set();
    for (const id of ['hideout', 'police', 'apartment']) { const pl = X.places && X.places[id]; if (pl) avoid.add(X.districtAt(pl.door.x, pl.door.y)); }
    const taken = new Set();
    GL = [];
    for (const def of GANG_DEFS) {
      let dn = def.prefer.find(n => names.includes(n) && !avoid.has(n) && !taken.has(n));
      if (!dn) { const free = names.filter(n => !avoid.has(n) && !taken.has(n)); dn = free.length ? pick(free) : names.find(n => !taken.has(n)); }
      if (!dn) continue;
      taken.add(dn);
      const k = names.indexOf(dn), i = k % 3, j = Math.floor(k / 3);
      const rect = { x0: i * C.W / 3, y0: j * C.H / 3, x1: (i + 1) * C.W / 3, y1: (j + 1) * C.H / 3 };
      const blocks = C.blocks.filter(b => { const x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2; return x > rect.x0 && x < rect.x1 && y > rect.y0 && y < rect.y1; });
      GL.push({ id: def.id, name: def.name, color: def.color, def, district: dn, rect, blocks, respect: 0, hostileT: 0, kills: 0, hurtT: 0 });
    }
    X.gangs.list = GL;
  }
  function gangAt(x, y) {
    for (const g of GL) { const r = g.rect; if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return g; }
    return null;
  }
  function armGang(p, g) {
    p.weapon = null;
    if (!X.WEAPONS) return;
    let r = Math.random();
    for (const [id, w] of g.def.arms) { if ((r -= w) <= 0) { if (X.WEAPONS[id]) p.weapon = id; break; } }
  }
  function gangAI(g, gr, slot, rad) {
    const a = newAI('gang');
    a.st = 'hang'; a.gang = g; a.group = gr; a.slot = slot; a.rad = rad; a.jit = rand(-0.4, 0.4);
    a.hpose = pick(g.def.poses); a.hposeT = rand(3, 8);
    return a;
  }
  function spawnGroup(g, x, y, n) {
    const gr = { gang: g, x, y, members: [], scanT: rand(0, 0.6), warnT: -9, id: ++S.gid };
    for (let i = 0; i < n; i++) {
      const slot = i / n * TAU + rand(-0.3, 0.3), rad = rand(0.85, 1.25), px = x + Math.cos(slot) * rad, py = y + Math.sin(slot) * rad;
      if (X.blocked(px, py, 0.4) || carAt(px, py, 0.45)) continue;
      const p = X.makePed({ x: px, y: py, th: slot + Math.PI, team: 'gang', look: g.def.look(), ai: gangAI(g, gr, slot, rad) });
      p.gang = g.id; p.inaccuracy = 0.09; p.holster = true;
      armGang(p, g);
      gr.members.push(p);
      S.stats.spawned++;
    }
    if (!gr.members.length) return null;
    S.groups.push(gr);
    return gr;
  }
  function maybeSpawnGroup(g, f, vr, initial) {
    const R = g.rect, dx = Math.max(R.x0 - f.x, 0, f.x - R.x1), dy = Math.max(R.y0 - f.y, 0, f.y - R.y1);
    if (Math.hypot(dx, dy) > 200 || !g.blocks.length) return null;
    let n = 0;
    for (const p of X.peds) if (p.ai && p.ai.owner === 'peds' && p.ai.gang === g && !p.dead && !p.removed) n++;
    if (n >= OPT.gangCap) return null;
    const rMin = initial ? 14 : vr + 4, rMax = initial ? 170 : vr + 75;
    for (let tries = 0; tries < 10; tries++) {
      const b = pick(g.blocks), k = Math.floor(Math.random() * 4), ins = 3.1;
      const x = k === 0 || k === 3 ? b.x0 + ins : b.x1 - ins, y = k < 2 ? b.y0 + ins : b.y1 - ins;
      const d = Math.hypot(x - f.x, y - f.y); if (d < rMin || d > rMax) continue;
      if (!initial && X.inView(x, y, 4)) continue;
      if (S.groups.some(o => Math.abs(o.x - x) < 28 && Math.abs(o.y - y) < 28)) continue;
      const gr = spawnGroup(g, x, y, 2 + Math.floor(Math.random() * 3));
      if (gr) return gr;
    }
    return null;
  }
  function addRespect(g, n) {
    if (!g) return;
    const was = g.respect;
    g.respect = cl(g.respect + n, -100, 100);
    if (Math.round(was) !== Math.round(g.respect)) X.emit('gangRespect', { gang: g, respect: g.respect, delta: n });
  }
  function startAttack(p, target) {
    const a = p.ai;
    a.st = 'attack'; a.target = target; a.hostT = 25; a.alertT = 1.2; a.burst = rand(0.3, 0.8); a.pause = rand(0.1, 0.5);
    a.strafe = Math.random() < 0.5 ? 1 : -1; a.strafeT = rand(1, 2); a.los = true; a.losT = 0;
    p.holster = false;
  }
  function provoke(g, target, x, y) {
    if (!live() || !g || !target || target.dead || target.removed) return 0;
    if (target.ai && target.ai.gang === g) return 0;
    let n = 0, first = null;
    for (const p of X.peds) {
      const a = p.ai; if (!a || a.owner !== 'peds' || a.gang !== g || p.dead || p.removed) continue;
      if (Math.abs(p.x - x) > 45 || Math.abs(p.y - y) > 45) continue;
      if (a.st === 'attack' && a.target === target) { a.hostT = 25; continue; }
      if (a.st === 'dive' || a.st === 'down' || a.st === 'getup') { a.after = 'attack'; a.target = target; n++; continue; }
      startAttack(p, target); n++;
      if (!first) first = p;
    }
    if (n) {
      g.hostileT = 25; S.stats.provoked++;
      if (first) { voice(first, 'war'); say(first, g.def.lines, null, g.color); }
      X.emit('gangProvoked', { gang: g, by: target });
    }
    return n;
  }
  function endAttack(p) {
    const a = p.ai;
    a.st = 'return'; a.target = null; p.holster = true;
  }
  function groupsTick(dt) {
    for (const gr of S.groups) {
      let k = 0;
      for (const m of gr.members) if (!m.removed && !m.dead) gr.members[k++] = m;
      gr.members.length = k;
      gr.scanT -= dt;
      if (!k || gr.scanT > 0) continue;
      gr.scanT = 0.6;
      const g = gr.gang;
      if (P.state !== 'play' || X.scene || !P.ped || P.ped.dead) continue;
      const tg = P.car || P.ped, d = Math.hypot(tg.x - gr.x, tg.y - gr.y);
      if (g.respect <= -30 && d < 20 && X.lineOfSight(gr, tg)) provoke(g, P.ped, gr.x, gr.y);
      else if (g.respect >= 40 && d < 7 && !gr.helloT) { gr.helloT = 1; say(gr.members[0], L.hello, null, g.color); }
    }
    if (S.groups.some(gr => !gr.members.length)) S.groups = S.groups.filter(gr => gr.members.length);
  }
  const hostileM = m => m.ai && (m.ai.st === 'attack' || m.ai.owner === 'brawl');

  // ================= dogs =================
  function makeDog(owner) {
    const c = pick(DOGC);
    const d = { x: owner.x - Math.cos(owner.th) * 0.8, y: owner.y - Math.sin(owner.th) * 0.8, th: owner.th, vx: 0, vy: 0, speed: 0, walk: 0, owner, col: c[0], dark: c[1], sz: rand(0.75, 1.25),
      st: 'heel', t: 0, sniffT: rand(3, 8), barkT: 99, knock: 0, spin: 0, removed: false, spots: Math.random() < 0.15, wag: Math.random() * TAU, side: Math.random() < 0.5 ? -1 : 1, lostT: 0 };
    if (X.blocked(d.x, d.y, 0.2)) { d.x = owner.x; d.y = owner.y; }
    S.dogs.push(d);
    return d;
  }
  function dogTick(d, dt) {
    const o = d.owner && !d.owner.removed ? d.owner : null;
    if (!o) {   // runs off and is gone once out of sight
      d.st = 'flee'; d.lostT += dt;
      if (!X.inView(d.x, d.y, 3) || d.lostT > 25) { d.removed = true; return; }
    }
    if (d.knock > 0) {
      d.knock -= dt; const k = Math.exp(-3 * dt); d.vx *= k; d.vy *= k; d.th += d.spin * dt;
      dogMove(d, dt); return;
    }
    let tx = d.x, ty = d.y, sp = 0;
    if (d.st === 'flee') {
      if (!d.fa) d.fa = Math.random() * TAU;
      if (X.blocked(d.x + Math.cos(d.fa) * 1.2, d.y + Math.sin(d.fa) * 1.2, 0.25)) d.fa += rand(1, 2.5);
      tx = d.x + Math.cos(d.fa) * 3; ty = d.y + Math.sin(d.fa) * 3; sp = 6.5;
    } else if (o.dead) {   // stays by the body
      const px = o.x + Math.cos(o.th + 1.6) * 0.9, py = o.y + Math.sin(o.th + 1.6) * 0.9;
      tx = px; ty = py; sp = Math.min(4, Math.hypot(px - d.x, py - d.y) * 3);
      d.st = Math.hypot(px - d.x, py - d.y) < 0.3 ? 'sit' : 'heel';
      d.barkT -= dt;
      const pp = P.ped;
      if (pp && !P.car && Math.hypot(pp.x - d.x, pp.y - d.y) < 5) { if (d.barkT <= 0) { d.barkT = rand(0.9, 1.6); voice(d, 'bark'); } d.face = Math.atan2(pp.y - d.y, pp.x - d.x); }
      else { d.face = Math.atan2(o.y - d.y, o.x - d.x); if (d.barkT <= 0) { d.barkT = rand(3, 6); voice(d, 'whine'); } }
    } else {
      const run = o.speed > 3, fx = Math.cos(o.th), fy = Math.sin(o.th), rx = -fy, ry = fx;
      tx = o.x - rx * 0.75 * d.side - fx * (run ? 0.1 : 0.55); ty = o.y - ry * 0.75 * d.side - fy * (run ? 0.1 : 0.55);
      d.sniffT -= dt;
      if (d.st === 'sniff') { d.t -= dt; if (d.t <= 0 || Math.hypot(o.x - d.x, o.y - d.y) > 2.1 || run) d.st = 'heel'; else { tx = d.x; ty = d.y; } }
      else if (d.sniffT <= 0 && !run) { d.st = 'sniff'; d.t = rand(1, 2.4); d.sniffT = rand(6, 14); }
      sp = Math.min(8, Math.hypot(tx - d.x, ty - d.y) * 2.6 + o.speed * 0.6);
      d.barkT -= dt;
      if (d.barkT <= 0 && (run || (o.ai && o.ai.st !== 'walk' && o.ai.st !== 'idle' && o.ai.st !== 'chat'))) { d.barkT = rand(0.8, 1.6); voice(d, 'bark'); }
      d.face = null;
    }
    const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy);
    const wx = dd > 0.05 ? dx / dd * sp : 0, wy = dd > 0.05 ? dy / dd * sp : 0, k = 1 - Math.exp(-dt * 10);
    d.vx += (wx - d.vx) * k; d.vy += (wy - d.vy) * k;
    dogMove(d, dt);
    if (o && !o.dead && d.st !== 'flee') {   // the leash
      const lx = d.x - o.x, ly = d.y - o.y, ll = Math.hypot(lx, ly);
      if (ll > 2.3) { d.x = o.x + lx / ll * 2.3; d.y = o.y + ly / ll * 2.3; }
    }
    if (d.speed > 0.3) d.th += wrap(Math.atan2(d.vy, d.vx) - d.th) * Math.min(1, dt * 10);
    else if (d.face != null) d.th += wrap(d.face - d.th) * Math.min(1, dt * 6);
    // a fast car clips the dog: yelp, tumble, run home
    for (let i = 0; i < S.nThreat; i++) {
      const c = TC[i]; if (Math.abs(c.x - d.x) > c.len || Math.abs(c.y - d.y) > c.len) continue;
      if (!X.circlePoly(d.x, d.y, 0.25, X.carPoly(c))) continue;
      d.knock = 0.6; d.spin = rand(-12, 12); d.vx = TVX[i] * 0.7; d.vy = TVY[i] * 0.7; d.st = 'flee'; d.fa = Math.atan2(TVY[i], TVX[i]) + rand(-1, 1);
      if (d.owner && d.owner.ai) d.owner.ai.dog = null;
      d.owner = null; voice(d, 'yelp');
      break;
    }
  }
  function dogMove(d, dt) {
    const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    if (!X.blocked(nx, ny, 0.22)) { d.x = nx; d.y = ny; }
    else if (!X.blocked(nx, d.y, 0.22)) { d.x = nx; d.vy = 0; }
    else if (!X.blocked(d.x, ny, 0.22)) { d.y = ny; d.vx = 0; }
    else { d.vx = d.vy = 0; d.fa = (d.fa || 0) + 2; }
    d.speed = Math.hypot(d.vx, d.vy); d.walk += d.speed * dt * 2.2;
  }

  // ================= blood, footprints, cash on the ground =================
  function addPool(p, kind) {
    const small = kind === 'fire' || kind === 'explosion';
    S.pools.push({ ped: p, x: p.x, y: p.y, t0: X.time + rand(0.3, 0.8), size: (small ? rand(0.35, 0.55) : rand(0.75, 1.2)) * ((p.look && p.look.scale) || 1), seed: Math.random(), rot: Math.random() * TAU, settled: false, fade: 1 });
    if (S.pools.length > 70) S.pools.shift();
  }
  function poolsTick(dt) {
    let gone = false;
    for (const pl of S.pools) {
      if (!pl.settled) {
        const p = pl.ped;
        if (!p || p.removed) pl.settled = true;
        else { pl.x = p.x; pl.y = p.y; if (X.time > pl.t0 && (p.speed || 0) < 0.35 && !(p.knock > 0)) pl.settled = true; }
        if (pl.settled && pl.cash) { dropCash(pl.x + rand(-0.5, 0.5), pl.y + rand(-0.5, 0.5), pl.cash, 30); pl.cash = 0; }
      }
      const age = X.time - pl.t0;
      if (age > 150) { pl.fade = Math.max(0, 1 - (age - 150) / 15); if (pl.fade <= 0) gone = true; }
    }
    if (gone) S.pools = S.pools.filter(pl => pl.fade > 0);
  }
  // People who step in blood leave a trail of red prints for a few steps.
  const VISP = [];
  function footprints() {
    VISP.length = 0;
    for (const pl of S.pools) if (X.time - pl.t0 > 1.5 && X.inView(pl.x, pl.y, 2)) VISP.push(pl);
    for (const p of X.peds) {
      if (p.dead || p.removed || p.hidden || p.car || !(p.speed > 0.6) || !X.inView(p.x, p.y, 4)) continue;
      if (!(p._bloody > 0)) {
        for (const pl of VISP) {
          const r = pl.size * 0.75; if (Math.abs(pl.x - p.x) > r || Math.abs(pl.y - p.y) > r) continue;
          if (Math.hypot(pl.x - p.x, pl.y - p.y) < r) { p._bloody = 12; p._step = Math.floor(p.walk * 3 / Math.PI); break; }
        }
        continue;
      }
      const st = Math.floor(p.walk * 3 / Math.PI);
      if (st === p._step) continue;
      p._step = st; p._bloody--;
      const side = st % 2 ? 1 : -1, rx = -Math.sin(p.th), ry = Math.cos(p.th);
      S.prints.push({ x: p.x + rx * 0.1 * side, y: p.y + ry * 0.1 * side, th: p.th, t: X.time, a: Math.min(1, p._bloody / 6 + 0.25) });
      if (S.prints.length > 160) S.prints.shift();
    }
  }
  function cashFor(p) {
    const ty = p.ai && p.ai.owner === 'peds' ? p.ai.type : p.team === 'gang' ? 'gang' : 'walker';
    switch (ty) {
      case 'business': return Math.round(rand(25, 90));
      case 'tourist': return Math.round(rand(15, 70));
      case 'old': return Math.round(rand(5, 30));
      case 'drunk': return Math.round(rand(1, 15));
      case 'gang': return Math.round(rand(20, 80));
      default: return Math.round(rand(5, 60));
    }
  }
  function dropCash(x, y, amount, ttl) {
    S.stats.cash++;
    if (X.spawnPickup) { const pk = X.spawnPickup('cash', x, y, { amount, ttl: ttl || 30 }); if (pk) return pk; }
    const c = { x, y, amount, t: X.time, ttl: ttl || 30, rot: Math.random() * TAU };
    S.cash.push(c);
    return c;
  }
  function cashTick() {
    if (!S.cash.length) return;
    const pos = P.car ? P.car : P.ped, r = P.car ? 2.4 : 1.1, ok = P.state === 'play' && pos && !(P.ped && P.ped.dead);
    let gone = false;
    for (const c of S.cash) {
      if (X.time - c.t > c.ttl) { c.gone = true; gone = true; continue; }
      if (ok && Math.abs(pos.x - c.x) < r && Math.abs(pos.y - c.y) < r && Math.hypot(pos.x - c.x, pos.y - c.y) < r) {
        c.gone = true; gone = true;
        X.money(c.amount, 'pickup', c.x, c.y); voice(P.ped, 'cash');
        X.emit('pedCash', { amount: c.amount, x: c.x, y: c.y });
      }
    }
    if (gone) S.cash = S.cash.filter(c => !c.gone);
  }

  // ================= corpses: cleanup, discovery =================
  function cleanup(f) {
    const pp = X.playerPos();
    let n = 0, oldest = null;
    for (const p of X.peds) {
      if (!p.dead || p.removed || p.isPlayer || p.keep) continue;
      const d = Math.min(Math.hypot(p.x - f.x, p.y - f.y), Math.hypot(p.x - pp.x, p.y - pp.y));
      const seen = X.inView(p.x, p.y, 6);
      if (d > 260 || (p.deadT > 45 && !seen)) { p.removed = true; S.stats.cleaned++; continue; }
      n++;
      if (!seen && (!oldest || p.deadT > oldest.deadT)) oldest = p;
    }
    if (n > 50 && oldest) { oldest.removed = true; S.stats.cleaned++; }
    if (S.corpses.some(p => p.removed || !p.dead)) S.corpses = S.corpses.filter(p => !p.removed && p.dead);
    if (S.wrecks.length) S.wrecks = S.wrecks.filter(w => X.time - w.t < 70 && !w.car.removed);
  }
  // Passers-by find bodies (scream, call it in, stare) and stop to film burning wrecks.
  function discoveries() {
    for (const body of S.corpses) {
      if (body.deadT > 90 || body.isPlayer) continue;
      for (const q of X.peds) {
        const a = q.ai; if (!a || a.owner !== 'peds' || q.dead || a.sawBody || !CALM[a.st] || a.type === 'gang') continue;
        if (Math.abs(q.x - body.x) > 5 || Math.abs(q.y - body.y) > 5) continue;
        a.sawBody = true;
        const r = Math.random();
        if (r < 0.45) { voice(q, 'scream'); startFlee(q, body.x, body.y, rand(4, 7), 0, false); }
        else if (r < 0.75) startCall(q, { type: 'killPed', x: body.x, y: body.y, ped: body });
        else { endChat(q); startIdle(q, 'look', rand(2.5, 4), Math.atan2(body.y - q.y, body.x - q.x)); }
      }
    }
    for (const w of S.wrecks) {
      for (const q of X.peds) {
        const a = q.ai; if (!a || a.owner !== 'peds' || q.dead || a.sawWreck === w.id || (a.st !== 'walk' && a.st !== 'idle') || a.type === 'gang' || a.lead) continue;
        const d = Math.hypot(q.x - w.car.x, q.y - w.car.y); if (d < 9 || d > 24) continue;
        a.sawWreck = w.id;
        if (Math.random() < 0.3) { startIdle(q, 'film', rand(5, 9), Math.atan2(w.car.y - q.y, w.car.x - q.x)); if (Math.random() < 0.3) say(q, L.film, null, '#9ec2ff'); }
      }
    }
  }
  function startCall(p, crime) {
    const a = p.ai; endChat(p);
    a.st = 'call'; a.t = rand(3, 5); a.crime = crime; a.face = Math.atan2(p.y - crime.y, p.x - crime.x);
    if (Math.random() < 0.4) say(p, L.call, null, '#9ec2ff');
  }

  // ================= per-frame helpers =================
  // Uniform grid of everyone on foot near the focus, rebuilt each frame (no allocation).
  const GN = 80, GC = 4, GH = new Int32Array(GN * GN), GNX = new Int32Array(1024), GP = [];
  let gN = 0, gox = 0, goy = 0;
  function buildGrid(f) {
    GH.fill(-1); gN = 0; gox = f.x - GN * GC / 2; goy = f.y - GN * GC / 2;
    for (const p of X.peds) {
      if (p.removed || p.dead || p.hidden || p.car || gN >= 1024) continue;
      const cx = Math.floor((p.x - gox) / GC), cy = Math.floor((p.y - goy) / GC);
      if (cx < 0 || cy < 0 || cx >= GN || cy >= GN) continue;
      const c = cy * GN + cx; GP[gN] = p; GNX[gN] = GH[c]; GH[c] = gN; gN++;
    }
  }
  // Fast cars nobody steers along a lane (player, chases, runaways): people dive out of their way.
  const TX = new Float32Array(32), TY = new Float32Array(32), TVX = new Float32Array(32), TVY = new Float32Array(32), TS = new Float32Array(32), TW = new Float32Array(32), TLN = new Float32Array(32), TC = [];
  // Car velocity without core's allocation (same rules as X.carVel).
  const vxOf = c => c.dv ? c.dv.vx : c.ctrl === 'path' ? Math.cos(c.th) * c.v : 0;
  const vyOf = c => c.dv ? c.dv.vy : c.ctrl === 'path' ? Math.sin(c.th) * c.v : 0;
  function buildThreats(f) {
    let n = 0;
    for (const c of X.cars) {
      if (n >= 32) break;
      if (c.removed || c.ctrl === 'path' || !(Math.abs(c.speed) > 6)) continue;
      if (Math.abs(c.x - f.x) > 120 || Math.abs(c.y - f.y) > 120) continue;
      const vx = vxOf(c), vy = vyOf(c), sp = Math.hypot(vx, vy); if (sp < 6) continue;
      TX[n] = c.x; TY[n] = c.y; TVX[n] = vx; TVY[n] = vy; TS[n] = sp; TW[n] = c.wid; TLN[n] = c.len; TC[n] = c; n++;
    }
    S.nThreat = n;
  }
  // Core's carPedHits measures the closing speed against the wrong normal, so a car driving into someone
  // only shoves them. We detect the hit a frame ahead and apply core's own response; hitCd keeps this and a
  // fixed core from ever doubling up. Cars rolling over a body leave a smear.
  function carHits(dt) {
    const f = X.focus();
    for (const c of X.cars) {
      if (c.removed || Math.abs(c.x - f.x) > 130 || Math.abs(c.y - f.y) > 130) continue;
      const vx = vxOf(c), vy = vyOf(c), sp = Math.hypot(vx, vy); if (sp <= 3) continue;
      let poly = null;
      const R = c.len / 2 + 1 + sp * dt;
      for (const p of X.peds) {
        if (p.removed || p.hidden || p.car || Math.abs(p.x - c.x) > R || Math.abs(p.y - c.y) > R) continue;
        if (p.dead) {
          if (p.knock > 0 || sp < 4 || X.time < (p._smearT || 0)) continue;
          poly = poly || X.carPoly(c);
          if (!X.circlePoly(p.x, p.y, 0.3, poly)) continue;
          p._smearT = X.time + 0.9;
          X.decal(p.x + vx * 0.04, p.y + vy * 0.04, 'blood', 0.35, { rot: Math.atan2(vy, vx) });
          if (c === P.car) { G().shake = Math.max(G().shake, 0.06); voice(p, 'squish'); }
          continue;
        }
        if (p.hitCd > 0) continue;
        poly = poly || X.carPoly(c);
        const m = X.circlePoly(p.x - vx * dt * 1.5, p.y - vy * dt * 1.5, p.r, poly); if (!m) continue;
        const rel = (vx - p.vx) * m.nx + (vy - p.vy) * m.ny;
        if (rel <= 2.5) continue;
        p.vx = vx * 0.95 + m.nx * sp * 0.4; p.vy = vy * 0.95 + m.ny * sp * 0.4;
        p.knock = 0.8 + sp * 0.035; p.hitCd = 0.6; p.spin = (Math.random() - 0.5) * 18;
        X.emit('pedHitByCar', { ped: p, car: c, speed: sp });
        if (c === P.car && !p.isPlayer) X.crime(p.team === 'cop' ? 'hitCop' : 'hitPed', p.x, p.y, { ped: p });
        X.damagePed(p, (sp - 2) * 9, c.driver || c, 'car');
        if (c.dv) { c.dv.vx *= 0.985; c.dv.vy *= 0.985; }
        if (c === P.car) G().shake = Math.max(G().shake, 0.12);
      }
    }
  }
  // Corpses: their owners stop thinking when they die, so nobody would ever run the ragdoll (knock) on a
  // body flung by a car or a blast. We do, for any corpse nobody else moved in the last frame.
  let frameNo = 0;
  const baseMovePed = X.movePed;
  X.movePed = function (p) {
    if (p) { if (p._mvF !== frameNo) { p._mvF = frameNo; p._mvC = 0; } p._mvC++; }
    return baseMovePed.apply(this, arguments);
  };
  function corpsePhysics(dt) {
    for (let i = 0, n = X.peds.length; i < n; i++) {
      const p = X.peds[i];
      if (!p.dead || p.removed || p.hidden || p.car || p.isPlayer || !(p.knock > 0 || p.speed > 0.05)) continue;
      if (p._mvF === frameNo - 1 && (p._mvOwn !== frameNo - 1 || p._mvC > 1)) continue;   // someone else moves this one
      X.movePed(p, dt, 0, 0);
      p._mvOwn = frameNo;
    }
  }
  // Nobody owns fire (no damage or weapons module): our own burning people burn out.
  function burnFallback(dt) {
    if (X.setOnFire || X.has('weapons')) return;
    for (const p of X.peds) {
      if (!(p.onFire > 0) || !mine(p)) continue;
      p.onFire = Math.max(0, p.onFire - dt);
      if (!p.dead && !p.hidden) { p._burn = (p._burn || 0) + dt * 9; if (p._burn > 4) { X.damagePed(p, p._burn, p.fireBy || null, 'fire'); p._burn = 0; } }
      if (!p.hidden && X.inView(p.x, p.y, 2) && Math.random() < dt * 14) PG.burst(p.x, p.y, 'fire', 1, 1, 0.5, 0.25);
    }
  }
  function checkDive(p) {
    const a = p.ai;
    for (let i = 0; i < S.nThreat; i++) {
      const dx = p.x - TX[i], dy = p.y - TY[i]; if (Math.abs(dx) > 26 || Math.abs(dy) > 26) continue;
      const sp = TS[i], ux = TVX[i] / sp, uy = TVY[i] / sp, along = dx * ux + dy * uy;
      if (along < -0.5 || along > sp * 1.05 + TLN[i] / 2 + 1.5) continue;
      const lat = dx * uy - dy * ux;
      if (Math.abs(lat) > TW[i] / 2 + 1.0) continue;
      const c = TC[i];
      if (a.diveCar === c.id && X.time < a.diveCd) continue;
      a.diveCar = c.id; a.diveCd = X.time + 2;
      const chance = a.type === 'old' ? 0.4 : a.type === 'drunk' ? 0.3 : a.type === 'jogger' ? 0.97 : OPT.diveChance;
      if (Math.random() > chance) { if (Math.random() < 0.5) voice(p, 'yelp'); continue; }
      const side = lat >= 0 ? 1 : -1;
      startDive(p, uy * side, -ux * side, c);
      return true;
    }
    return false;
  }
  // Steer a heading away from walls: try the wanted angle, then fan out.
  const FAN = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6];
  function freeHeading(p, ang, look) {
    for (const o of FAN) { const a = ang + o; if (!X.blocked(p.x + Math.cos(a) * look, p.y + Math.sin(a) * look, 0.36)) return a; }
    return ang + Math.PI;
  }
  function limp(p) { return p.hp < p.maxHp * 0.45 ? 0.6 : 1; }

  // ================= the brain =================
  function think(p, dt) {
    const a = p.ai;
    if (a.punchT > 0) a.punchT -= dt;
    if (a.alertT > 0) a.alertT -= dt;
    if (a.atkCd > 0) a.atkCd -= dt;
    if (a.brisk > 0) a.brisk -= dt;
    if (a.jumpT > 0) a.jumpT -= dt;
    if (a.fade < 1 && a.st !== 'enter') a.fade = Math.min(1, a.fade + dt * 2.5);
    a.pose = null;
    if (p.knock > 0) {   // ragdoll from a car, blast or punch
      if (a.st !== 'down') { if (!a.after) a.after = a.type === 'gang' ? (a.target ? 'attack' : null) : 'flee'; if (!a.fx && !a.fy) { a.fx = p.x - p.vx; a.fy = p.y - p.vy; } a.st = 'down'; endChat(p); }
      X.movePed(p, dt, 0, 0);
      return;
    }
    if (a.st === 'down') { const K = p.act && p.act.on && p.act.type === 'knockdown' ? p.act : null; a.st = 'getup'; a.t = K ? Math.max(0.05, K.dur - K.t) : 0.75; }   // (brawl.js draws its own get-up)
    if (p.onFire > 0 && a.st !== 'burn' && a.st !== 'dive' && a.st !== 'getup') { endChat(p); a.st = 'burn'; a.hT = 0; a.ha = p.th; a.scrT = 0; if (a.type === 'gang') p.holster = true; }
    const near = X.inView(p.x, p.y, 16);
    let vx = 0, vy = 0, face = null, cheap = false;
    switch (a.st) {
      case 'walk': {
        if (a.lead) {   // the second half of a couple walks at the leader's right hand
          const Ld = a.lead;
          if (Ld.removed || !mine(Ld)) { a.lead = null; resume(p); break; }
          if (Ld.dead) { startMourn(p, Ld); break; }
          const rx = -Math.sin(Ld.th), ry = Math.cos(Ld.th), tx = Ld.x + rx * 0.72, ty = Ld.y + ry * 0.72;
          const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), sp = Math.min(5.5, (Ld.speed || 0) + d * 2);
          if (d > 0.06) { vx = dx / d * sp; vy = dy / d * sp; }
          if ((Ld.speed || 0) < 0.25 && d < 0.35) face = Ld.ai.st === 'idle' ? Ld.ai.face : Ld.th;
          break;
        }
        if (!a.blk) snapRing(p, nearestBlock(p.x, p.y));
        if (!a.blk) break;
        let tx, ty;
        if (a.join) { tx = a.jx; ty = a.jy; } else { corner(a.blk, a.li, a.ci, TMP); tx = TMP.x; ty = TMP.y; }
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d < 0.45) { if (a.join) a.join = false; else atCorner(p); break; }
        let sp = a.spd * (a.brisk > 0 ? 1.35 : 1) * limp(p);
        if (a.dog && a.dog.st === 'sniff') sp *= 0.15;
        let ux = dx / d, uy = dy / d;
        if (a.type === 'drunk') { const w = Math.sin(X.time * 1.7 + p.id) * 0.7, c = Math.cos(w), s = Math.sin(w); const nx = ux * c - uy * s; uy = ux * s + uy * c; ux = nx; if (Math.random() < dt * 0.05) voice(p, 'hic'); }
        vx = ux * sp; vy = uy * sp;
        cheap = !near && !a.join;
        a.nextIdle -= dt; a.doorT -= dt;
        if (a.nextIdle <= 0) { a.nextIdle = rand(14, 50); if (!a.join) maybeIdle(p); }
        else if (a.doorT <= 0) { a.doorT = 0.6; if (near && maybeEnter(p)) break; }
        else if (near && !a.join && a.blk.kind === 'city' && Math.random() < OPT.jaywalk * dt && d > 9) startJaywalk(p);
        break;
      }
      case 'toKerb': {
        const dx = a.cx0 - p.x, dy = a.cy0 - p.y, d = Math.hypot(dx, dy);
        if (d < 0.35) { a.st = 'wait'; a.t = 0; a.chk = 0; break; }
        const sp = a.spd * limp(p); vx = dx / d * sp; vy = dy / d * sp;
        if (a.t > 15) resume(p);
        a.t += dt;
        break;
      }
      case 'wait': {
        face = Math.atan2(a.cy1 - a.cy0, a.cx1 - a.cx0);
        a.t += dt; a.chk -= dt;
        if (a.chk <= 0) { a.chk = 0.25; if (roadClear(a)) { a.st = 'cross'; a.t = 0; break; } }
        if (a.t > (a.jay ? 3 : 10)) { if (a.jay) { a.st = 'cross'; a.t = 0; } else { a.ci = nextCorner(a.ci, a.dir); a.st = 'walk'; } }
        break;
      }
      case 'cross': {
        const dx = a.cx1 - p.x, dy = a.cy1 - p.y, d = Math.hypot(dx, dy);
        a.t += dt;
        if (d < 0.4 || a.t > 25) { S.stats.crossings++; a.blk = a.nb || nearestBlock(p.x, p.y); snapRing(p, a.blk, true); a.st = 'walk'; break; }
        const sp = Math.max(1.8, a.spd * (a.jay ? 1.5 : 1.25)) * limp(p);
        vx = dx / d * sp; vy = dy / d * sp;
        break;
      }
      case 'enter': {   // into the door, fading out
        const inside = a.t > 0, tx = inside ? a.cx0 : a.cx1, ty = inside ? a.cy0 : a.cy1, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (!inside && d < 0.4) a.t = 0.01;
        if (inside) { a.t += dt; a.fade = Math.max(0.01, 1 - a.t / 0.45); if (a.t > 0.45) { removePed(p); S.stats.entered++; return; } }
        if (d > 0.05) { vx = dx / d * a.spd; vy = dy / d * a.spd; }
        break;
      }
      case 'stroll': {
        const dx = a.cx1 - p.x, dy = a.cy1 - p.y, d = Math.hypot(dx, dy);
        if (d < 0.5) { startIdle(p, pick(['sit', 'sit', 'phone', 'look', 'smoke']), rand(8, 20), p.th); break; }
        vx = dx / d * a.spd; vy = dy / d * a.spd;
        break;
      }
      case 'idle': {
        a.t -= dt; face = a.face; a.pose = a.idle === 'look' || a.idle === 'window' ? null : a.idle;
        if (a.idle === 'look') face = a.face + Math.sin(X.time * 0.9 + p.id) * 0.8;
        if (a.idle === 'smoke' && near && Math.random() < dt * 0.4) PG.burst(p.x + Math.cos(p.th) * 0.3, p.y + Math.sin(p.th) * 0.3, 'tsmoke', 1, 0.3, 1.4, 0.12);
        if (a.idle === 'photo' && a.t < 1.2 && !a.flashed) { a.flashed = true; S.flashes.push({ x: p.x + Math.cos(p.th) * 0.45, y: p.y + Math.sin(p.th) * 0.45, t: X.time }); voice(p, 'shutter'); }
        if (a.idle === 'stretch') a.pose = 'hands';
        if (a.t <= 0) { a.flashed = false; resume(p); }
        break;
      }
      case 'chat': {
        const q = a.partner;
        a.t -= dt; a.pose = 'chat';
        if (!q || q.dead || q.removed || !q.ai || q.ai.partner !== p || a.t <= 0) { endChat(p); resume(p); break; }
        face = Math.atan2(q.y - p.y, q.x - p.x);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d > 1.25) { vx = (q.x - p.x) / d * 0.8; vy = (q.y - p.y) / d * 0.8; }
        break;
      }
      case 'cower': {
        a.pose = 'cower'; a.ct -= dt; face = Math.atan2(p.y - a.fy, p.x - a.fx);
        if (a.ct <= 0) a.st = 'flee';
        break;
      }
      case 'flee': {
        a.t -= dt; a.hT -= dt; a.spT -= dt;
        if (a.hT <= 0) {
          a.hT = 0.35;
          const away = Math.atan2(p.y - a.fy, p.x - a.fx), base = Math.abs(wrap(a.ha - away)) < 1.1 ? a.ha : away;
          a.ha = freeHeading(p, base, 1.7);
        }
        const sp = (FLEE[a.type] || (a.spd > 3 ? a.spd * 1.3 : 5.4)) * limp(p);
        vx = Math.cos(a.ha) * sp; vy = Math.sin(a.ha) * sp;
        if (a.spT <= 0 && a.lvl > 0) {   // panic spreads to people nearby
          a.spT = 0.5;
          eachNear(p.x, p.y, 6, q => { if (q !== p && mine(q) && !q.dead && CALM[q.ai.st] && q.ai.type !== 'gang' && Math.random() < 0.6) startFlee(q, a.fx, a.fy, rand(4, 8), a.lvl - 1, Math.random() < 0.3); });
        }
        if (a.t <= 0) { resume(p); a.brisk = 8; }
        break;
      }
      case 'dive': {
        a.t -= dt; a.pose = 'dive';
        const k = Math.max(0, a.t / 0.5);
        vx = a.dvx * k; vy = a.dvy * k; face = Math.atan2(a.dvy, a.dvx);
        if (a.t <= 0) { a.st = 'getup'; a.t = 0.7; }
        break;
      }
      case 'getup': {
        a.t -= dt; a.pose = 'sit';
        if (a.t <= 0) afterGetup(p);
        break;
      }
      case 'angry': {
        a.t -= dt; a.pose = 'fist';
        const c = a.angryAt;
        if (c && !c.removed) face = Math.atan2(c.y - p.y, c.x - p.x);
        if (a.t <= 0) { resume(p); a.brisk = 5; }
        break;
      }
      case 'burn': {
        if (!(p.onFire > 0)) { a.st = 'walk'; startFlee(p, p.x - Math.cos(p.th) * 9, p.y - Math.sin(p.th) * 9, 4, 0, false); if (a.type === 'gang') resume(p); break; }
        a.hT -= dt; a.scrT -= dt;
        if (a.hT <= 0) { a.hT = rand(0.25, 0.6); a.ha = freeHeading(p, a.ha + rand(-2, 2), 1.4); }
        vx = Math.cos(a.ha) * 5.6; vy = Math.sin(a.ha) * 5.6;
        if (a.scrT <= 0) { a.scrT = rand(1, 1.8); voice(p, 'scream'); if (Math.random() < 0.25) say(p, L.burn, null, '#ffb050'); }
        break;
      }
      case 'call': {
        a.t -= dt; a.pose = 'phone'; face = a.face;
        if (a.t <= 0) {
          S.stats.calls++;
          X.emit('witnessCall', { crime: a.crime, ped: p, x: p.x, y: p.y });
          a.crime = null; resume(p); a.brisk = 10;
        }
        break;
      }
      case 'mourn': {
        a.t -= dt; a.scrT -= dt; a.pose = 'kneel';
        const body = a.target;
        if (body && !body.removed) { face = Math.atan2(body.y - p.y, body.x - p.x); const d = Math.hypot(body.x - p.x, body.y - p.y); if (d > 1.1) { vx = (body.x - p.x) / d * 2.5; vy = (body.y - p.y) / d * 2.5; a.pose = null; } }
        if (a.scrT <= 0) { a.scrT = rand(1.6, 2.6); voice(p, 'sob'); }
        const pp = P.ped;
        if (a.t <= 0 || !body || body.removed || (pp && !P.car && Math.hypot(pp.x - p.x, pp.y - p.y) < 3)) { a.target = null; a.st = 'walk'; startFlee(p, pp ? pp.x : p.x, pp ? pp.y : p.y, rand(5, 8), 0, true); }
        break;
      }
      case 'watch': {   // a street fight: a spot in the ring around it, facing in; cheer, film or just stare
        const f = a.fightRef;
        a.t -= dt;
        if (!f || !f.alive || a.t <= 0) { a.fightRef = null; resume(p); a.brisk = 3; break; }
        const tx = f.x + Math.cos(a.ha) * a.rad, ty = f.y + Math.sin(a.ha) * a.rad, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        const cx = p.x - f.x, cy = p.y - f.y, dc = Math.hypot(cx, cy) || 1;
        face = Math.atan2(-cy, -cx);
        if (dc < a.rad - 1.3) { vx = cx / dc * 2.4; vy = cy / dc * 2.4; }   // the fight came this way: step back
        else if (d > 0.45) { const sp = d > 3 ? 3.4 : 1.2; vx = dx / d * sp; vy = dy / d * sp; }
        if (d < 1.6) {
          a.pose = a.wpose;
          if (a.wpose === 'cheer') { if (Math.random() < dt * 0.7) a.jumpT = 0.3; if (near && X.time > S.cheerT) { S.cheerT = X.time + rand(1.1, 2.2); X.floatText(p.x, p.y - 0.8, pick(L.cheer), '#ffe14a', { size: 12, life: 1.1 }); } }
        }
        break;
      }
      case 'hands': {
        a.t -= dt; a.pose = 'hands'; face = Math.atan2(a.fy - p.y, a.fx - p.x);
        if (a.t <= 0) { a.st = 'walk'; startFlee(p, a.fx, a.fy, rand(6, 9), 1, true); }
        break;
      }
      case 'fight': {
        const tg = a.target;
        a.t -= dt;
        if (!tg || tg.removed || tg.dead || (tg.isPlayer && (P.state !== 'play' || X.scene)) || (tg.hidden && !tg.car) || a.t <= 0 || p.hp < p.maxHp * 0.3 || Math.abs(tg.x - p.x) + Math.abs(tg.y - p.y) > 80) {
          if (tg && tg.dead) say(p, L.gloat); else if (p.hp < p.maxHp * 0.3) { a.target = null; a.st = 'walk'; startFlee(p, tg ? tg.x : p.x, tg ? tg.y : p.y, 7, 0, true); break; }
          a.target = null; resume(p); a.brisk = 6; break;
        }
        const tc = tg.car, tx = tc ? tc.x : tg.x, ty = tc ? tc.y : tg.y;
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 0.01, ang = Math.atan2(dy, dx);
        face = ang;
        if (tc && tc.speed > 4) {   // they drive off: give chase, then give up shaking a fist
          if (d > 22) { a.target = null; a.st = 'angry'; a.t = 2; a.angryAt = tc; say(p, L.give); break; }
          vx = dx / d * 5.8; vy = dy / d * 5.8; break;
        }
        const reach = tc ? tc.len / 2 + 0.9 : 0.95;
        if (d > reach) { const h = freeHeading(p, ang, 1.2); vx = Math.cos(h) * 5.2; vy = Math.sin(h) * 5.2; }
        else if (a.atkCd <= 0) { a.atkCd = rand(0.65, 0.95); if (tc) kickCar(p, tc); else punch(p, tg, ang); }
        if (a.punchT > 0) a.pose = 'punch';
        break;
      }
      // ---- gangs ----
      case 'hang': {
        const g = a.group; if (!g) { a.st = 'walk'; resume(p); break; }
        const tx = g.x + Math.cos(a.slot) * a.rad, ty = g.y + Math.sin(a.slot) * a.rad, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d > 0.35) { vx = dx / d * 1.6; vy = dy / d * 1.6; }
        else {
          a.hposeT -= dt; if (a.hposeT <= 0) { a.hposeT = rand(4, 9); a.hpose = pick(a.gang.def.poses); }
          a.pose = a.hpose; face = Math.atan2(g.y - p.y, g.x - p.x) + a.jit;
        }
        const pp = P.ped;
        if (pp && !P.car && !pp.dead && Math.abs(pp.x - p.x) < 9 && Math.abs(pp.y - p.y) < 9) { face = Math.atan2(pp.y - p.y, pp.x - p.x); if (a.pose === 'dance' || a.pose === 'headbang') a.pose = 'cross'; }
        break;
      }
      case 'return': {
        const g = a.group; if (!g) { a.st = 'hang'; break; }
        const tx = g.x + Math.cos(a.slot) * a.rad, ty = g.y + Math.sin(a.slot) * a.rad, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d < 0.4) { a.st = 'hang'; break; }
        const h = freeHeading(p, Math.atan2(dy, dx), 1.2); vx = Math.cos(h) * 2.2; vy = Math.sin(h) * 2.2;
        break;
      }
      case 'attack': attackTick(p, dt); return;
      default: a.st = 'walk';
    }
    move(p, dt, vx, vy, face, near, cheap);
  }
  function afterGetup(p) {
    const a = p.ai, n = a.after; a.after = null;
    if (a.type === 'gang') { if (a.target && !a.target.dead) startAttack(p, a.target); else a.st = 'return'; return; }
    if (n === 'angry') { a.st = 'angry'; a.t = 1.6; voice(p, 'hey'); say(p, a.type === 'old' ? L.old : L.dodge, null, '#ffd23a'); return; }
    if (n === 'flee') { a.st = 'walk'; startFlee(p, a.fx, a.fy, rand(4, 8), 1, true); return; }
    resume(p);
  }
  function eachNear(x, y, r, fn) {
    const c0 = Math.max(0, Math.floor((x - r - gox) / GC)), c1 = Math.min(GN - 1, Math.floor((x + r - gox) / GC));
    const r0 = Math.max(0, Math.floor((y - r - goy) / GC)), r1 = Math.min(GN - 1, Math.floor((y + r - goy) / GC));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) for (let k = GH[cy * GN + cx]; k >= 0; k = GNX[k]) { const q = GP[k]; if (!q.removed && Math.abs(q.x - x) <= r && Math.abs(q.y - y) <= r) fn(q); }
  }
  // Separation, queueing behind slower walkers, then the actual step (cheap kinematics far off-screen).
  function move(p, dt, vx, vy, face, near, cheap) {
    const a = p.ai;
    if (cheap) {
      p.vx = vx; p.vy = vy; p.x += vx * dt; p.y += vy * dt;
      const sp = Math.hypot(vx, vy); p.speed = sp; p.walk += sp * dt * 2.4;
      if (p.hurtT > 0) p.hurtT -= dt; if (p.hitCd > 0) p.hitCd -= dt;
      if (sp > 0.25) p.th = Math.atan2(vy, vx);
      return;
    }
    const want = Math.hypot(vx, vy);
    if (near) {
      let sx = 0, sy = 0, lim = Infinity;
      const ux = want > 0.01 ? vx / want : 0, uy = want > 0.01 ? vy / want : 0, queue = a.st === 'walk' || a.st === 'cross' || a.st === 'toKerb';
      const c0 = Math.max(0, Math.floor((p.x - 1.6 - gox) / GC)), c1 = Math.min(GN - 1, Math.floor((p.x + 1.6 - gox) / GC));
      const r0 = Math.max(0, Math.floor((p.y - 1.6 - goy) / GC)), r1 = Math.min(GN - 1, Math.floor((p.y + 1.6 - goy) / GC));
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) for (let k = GH[cy * GN + cx]; k >= 0; k = GNX[k]) {
        const q = GP[k];
        if (q === p || q.removed || q === a.lead || q === a.follow || q === a.partner) continue;
        const dx = p.x - q.x, dy = p.y - q.y; if (Math.abs(dx) > 1.6 || Math.abs(dy) > 1.6) continue;
        const d2 = dx * dx + dy * dy, R = q.isPlayer ? 1.05 : 0.8;
        if (d2 < R * R && d2 > 1e-6) {
          const d = Math.sqrt(d2), w = (R - d) / R; sx += dx / d * w; sy += dy / d * w;
          if (d < 0.58) { const o = (0.58 - d) * (mine(q) ? 0.5 : 1); p.x += dx / d * o; p.y += dy / d * o; }
          if (q.isPlayer && q.speed > 3.6 && d < 0.75 && X.time > a.bumpCd && a.type !== 'gang' && CALM[a.st]) {   // the player barges through
            a.bumpCd = X.time + 3;
            if (Math.random() < 0.4) { p.knock = 0.4; p.vx = q.vx * 0.7 + dx / d * 1.5; p.vy = q.vy * 0.7 + dy / d * 1.5; a.after = 'angry'; a.angryAt = q; }
            voice(p, 'oof'); if (Math.random() < 0.5) say(p, L.bump);
          }
        }
        if (queue && want > 0.3) {
          const al = -(dx * ux + dy * uy);
          if (al > 0.2 && al < 1.5 && Math.abs(-dx * uy + dy * ux) < 0.45) lim = Math.min(lim, Math.max(0, (q.speed || 0) + (al - 0.65) * 1.5));
        }
      }
      if (lim < want) { const k = lim / want; vx *= k; vy *= k; }
      vx += sx * 1.8; vy += sy * 1.8;
      if (a.st !== 'dive' && a.st !== 'getup' && S.nThreat && checkDive(p)) { vx = a.dvx; vy = a.dvy; face = Math.atan2(vy, vx); }
    }
    X.movePed(p, dt, vx, vy);
    if (face != null) p.th += wrap(face - p.th) * Math.min(1, dt * 8);
    else if (p.speed > 0.25) p.th += wrap(Math.atan2(p.vy, p.vx) - p.th) * Math.min(1, dt * 10);
    // stuck: pushing into something for a while
    a.stuckT += dt;
    if (a.stuckT > 1.5) {
      const moved = Math.hypot(p.x - a.lx, p.y - a.ly);
      if (want > 0.8 && moved < 0.4) {
        a.stuck++;
        if (a.st === 'walk' && !a.lead) { a.dir = -a.dir; a.li = laneFor(a); snapRing(p, a.blk || nearestBlock(p.x, p.y), true); }
        else if (a.st === 'flee' || a.st === 'burn') a.ha += Math.PI * rand(0.6, 1.4);
        else if (a.st === 'cross' || a.st === 'toKerb' || a.st === 'stroll') resume(p);
      } else if (moved > 1) a.stuck = 0;
      a.stuckT = 0; a.lx = p.x; a.ly = p.y;
    }
  }
  function rangeFor(w) {
    switch (w.id) {
      case 'uzi': return [4, 11];
      case 'shotgun': return [3, 8];
      case 'rifle': return [6, 18];
      case 'molotov': case 'grenade': return [7, 16];
      default: return w.kind === 'gun' ? [5, 13] : [0, 1];
    }
  }
  function attackTick(p, dt) {
    const a = p.ai, tg = a.target;
    let vx = 0, vy = 0;
    const lost = !tg || tg.removed || tg.dead || (tg.isPlayer && (P.state !== 'play' || X.scene)) || (tg.hidden && !tg.car);
    if (lost) { if (tg && tg.dead && Math.random() < 0.5) say(p, L.gloat, null, a.gang.color); endAttack(p); move(p, dt, 0, 0, null, false, false); return; }
    const tc = tg.car, tx = tc ? tc.x : tg.x, ty = tc ? tc.y : tg.y;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 0.01, ang = Math.atan2(dy, dx);
    a.losT -= dt;
    if (a.losT <= 0) { a.losT = 0.3; a.los = !X.raycast(p.x, p.y, tx, ty); }
    if (a.los) a.hostT = 25; else a.hostT -= dt;
    const home = a.group ? Math.hypot(p.x - a.group.x, p.y - a.group.y) : 0;
    if (a.hostT <= 0 || home > 80 || d > 70) { endAttack(p); return; }
    const W = p.weapon && X.WEAPONS ? X.WEAPONS[p.weapon] : null, gun = W && W.kind !== 'melee' && X.has('weapons');
    if (gun) {
      const R = rangeFor(W);
      if (d > R[1] || !a.los) { const h = freeHeading(p, ang, 1.3); vx = Math.cos(h) * 5; vy = Math.sin(h) * 5; }
      else if (d < R[0]) { const h = freeHeading(p, ang + Math.PI, 1.3); vx = Math.cos(h) * 3; vy = Math.sin(h) * 3; }
      else {
        a.strafeT -= dt; if (a.strafeT <= 0) { a.strafe = -a.strafe; a.strafeT = rand(1, 2.2); }
        vx = -dy / d * a.strafe * 1.7; vy = dx / d * a.strafe * 1.7;
        if (X.blocked(p.x + vx * 0.6, p.y + vy * 0.6, 0.35)) { a.strafe = -a.strafe; vx = -vx; vy = -vy; }
      }
      if (a.los && d < W.range * 0.92) {
        if (a.pause > 0) a.pause -= dt;
        else if (W.kind === 'throw') {
          if (a.atkCd <= 0) { const aim = X.weapons && X.weapons.aimAt ? X.weapons.aimAt(p, tc || tg, W.id) : ang; p.aim = aim; if (X.fireWeapon(p, W.id, aim + rand(-0.08, 0.08), { dist: d })) a.atkCd = rand(3, 5); }
        } else {
          p.aim = ang;
          X.fireWeapon(p, W.id, ang + rand(-1, 1) * (tc ? 0.05 : 0.09));
          a.burst -= dt; if (a.burst <= 0) { a.pause = rand(0.5, 1.3); a.burst = rand(0.5, 1.2); }
        }
      }
    } else {
      if (X.brawl && d < 25 && X.brawl.fight(p, tg, { skill: 0.58 })) return;   // fists and bats: brawl.js fights it out
      const reach = tc ? tc.len / 2 + 0.9 : 0.95;
      if (d > reach) { const h = freeHeading(p, ang, 1.2); vx = Math.cos(h) * 5.2; vy = Math.sin(h) * 5.2; }
      else if (a.atkCd <= 0) { a.atkCd = W && W.id === 'bat' ? 0.95 : rand(0.6, 0.85); if (tc) kickCar(p, tc); else punch(p, tg, ang); }
      if (a.punchT > 0) a.pose = 'punch';
    }
    move(p, dt, vx, vy, ang, X.inView(p.x, p.y, 16), false);
  }

  // ================= events =================
  X.on('gunfire', e => {
    if (!live() || !e) return;
    const r = e.radius ? cl(e.radius * 0.75, 14, 30) : 25;
    panic(e.x, e.y, r, { ignore: e.by });
    const sh = attackerOf(e.by);
    if (sh && X.byPlayer(sh)) for (const gr of S.groups) {   // gang corners nearby do not like gunplay
      if (!gr.members.length || Math.abs(gr.x - e.x) > 15 || Math.abs(gr.y - e.y) > 15) continue;
      gangWarn(gr, sh);
    }
  });
  X.on('explosion', e => {
    if (!live() || !e) return;
    panic(e.x, e.y, 40 * Math.sqrt(e.power || 1), { lvl: 2, mul: 1.2 });
  });
  X.on('crime', e => {
    if (!live() || !e || e.x == null) return;
    const near = [];
    for (const p of X.peds) {
      const a = p.ai; if (!a || a.owner !== 'peds' || p.dead || p.removed || p.hidden || a.type === 'gang' || p === e.ped || (e.car && p.fromCar === e.car)) continue;
      if (Math.abs(p.x - e.x) > 20 || Math.abs(p.y - e.y) > 20) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y); if (d <= 20 && X.time > a.witT) near.push([d, p]);
    }
    near.sort((u, v) => u[0] - v[0]);
    let n = 0;
    const violent = /kill|hit|shoot|assault|explosion|destroy/.test(e.type);
    for (const [d, p] of near) {
      if (n >= 3) break;
      if (!X.lineOfSight(p, e)) continue;
      n++; p.ai.witT = X.time + 3; S.stats.witnesses++;
      X.emit('witness', { crime: e, ped: p });
      const a = p.ai; if (!CALM[a.st]) continue;
      const r = Math.random();
      if (violent ? r < 0.55 : r < 0.25) startFlee(p, e.x, e.y, rand(5, 9), 1, violent);
      else if (r < 0.85) startCall(p, e);
    }
    if (/kill/.test(e.type)) panic(e.x, e.y, 10, { lvl: 1 });
  });
  X.on('pedHurt', e => {
    if (!live() || !e.ped) return;
    const p = e.ped, a = p.ai, ga = pai(p);
    const att = attackerOf(e.by);
    if (ga && ga.type === 'gang' && !p.dead) {   // (even while brawl.js has them in a fist fight)
      const aa = pai(att);
      if (aa && aa.gang === ga.gang) return;
      if (att && X.byPlayer(e.by) && X.time > ga.gang.hurtT) { ga.gang.hurtT = X.time + 1; addRespect(ga.gang, -2); }
      if (att) provoke(ga.gang, att, p.x, p.y);
      return;
    }
    if (!a || a.owner !== 'peds' || p.dead) return;
    if (e.kind === 'fire') return;
    voice(p, e.kind === 'melee' ? 'oof' : 'yelp');
    if (a.st === 'fight') { if (att && att !== a.target && att.isPlayer) a.target = att; return; }
    if (e.kind === 'melee' && att && fightsBack(p, att) && retaliate(p, att)) return;
    startFlee(p, att ? att.x : p.x - Math.cos(p.th), att ? att.y : p.y - Math.sin(p.th), rand(6, 10), 1, true);
  });
  X.on('pedHitByCar', e => {
    if (!live() || !e.ped) return;
    const p = e.ped, sp = e.speed || 5;
    if (X.inView(p.x, p.y, 6)) {
      X.decal(p.x, p.y, 'blood', cl(0.25 + sp * 0.03, 0.3, 0.9));
      PG.burst(p.x, p.y, 'debris', 8, 3 + sp * 0.15, 0.5, 0.12, BLOOD);
    }
    voice(p, sp > 9 ? 'die' : 'yelp');
    if (mine(p) && p.ai.type === 'gang' && e.car && (e.car === P.car || e.car.driver)) { const att = e.car.driver || P.ped; provoke(p.ai.gang, att, p.x, p.y); if (e.car === P.car) addRespect(p.ai.gang, -2); }
    else if (mine(p) && !p.dead && sp < 8 && e.car && X.brawl) {   // shoved by a slow car: have a go at the driver
      const drv = e.car === P.car ? P.ped : e.car.driver;
      if (drv && !drv.dead && fightsBack(p, drv)) retaliate(p, drv);
    }
  });
  X.on('pedKilled', e => {
    if (!live() || !e.ped) return;
    const p = e.ped;
    addPool(p, e.kind);
    S.corpses.push(p);
    if (e.kind !== 'explosion') voice(p, 'die');
    if (!p.isPlayer && p.team !== 'player' && !p.noCash && !p.hidden) {
      const f = X.focus();
      if (Math.hypot(p.x - f.x, p.y - f.y) < 200) S.pools[S.pools.length - 1].cash = cashFor(p);   // dropped once the body comes to rest
    }
    const a = pai(p);
    if (a) {
      endChat(p);
      const q = a.follow || a.lead;
      if (q && !q.dead && mine(q) && Math.hypot(q.x - p.x, q.y - p.y) < 10) startMourn(q, p);
      if (a.gang) {
        const g = a.gang, att = attackerOf(e.by);
        if (X.byPlayer(e.by)) { g.kills++; addRespect(g, -10); for (const o of GL) if (o !== g) addRespect(o, 3); }
        if (att && !(att.ai && att.ai.gang === g)) provoke(g, att, p.x, p.y);
      }
    }
  });
  X.on('pedEjected', e => {
    if (!live() || !e.ped) return;
    const p = e.ped, c0 = e.car;
    if (p.ai || p.isPlayer || p.dead || (p.team && p.team !== 'civ') || (c0 && c0.owner && c0.owner !== 'peds')) return;   // cops, soldiers, someone's crew
    adopt(p, 'victim');
    const c = e.car;
    if (e.reason === 'carjack') {
      voice(p, 'hey');
      if (P.ped && !P.ped.dead && fightsBack(p, P.ped) && retaliate(p, P.ped)) { /* out of the car swinging */ }
      else { startFlee(p, c ? c.x : p.x, c ? c.y : p.y, rand(5, 9), 1, true); say(p, L.jacked, { car: c ? c.model.name.toUpperCase() : 'CAR' }, '#ffd23a'); }
    } else startFlee(p, c ? c.x : p.x, c ? c.y : p.y, rand(4, 8), 1, true);
    if (p.ai.st === 'cower') p.ai.st = 'flee';   // out of the car and straight off down the street
  });
  X.on('horn', e => {
    if (!live() || !e.car) return;
    const c = e.car, fx = Math.cos(c.th), fy = Math.sin(c.th);
    for (const p of X.peds) {
      const a = p.ai; if (!a || a.owner !== 'peds' || p.dead || p.hidden || !CALM[a.st]) continue;
      const dx = p.x - c.x, dy = p.y - c.y; if (Math.abs(dx) > 13 || Math.abs(dy) > 13) continue;
      const al = dx * fx + dy * fy, lat = Math.abs(dx * fy - dy * fx);
      a.jumpT = 0.3;
      if (al > 0 && al < 13 && lat < 3) { endChat(p); a.st = 'angry'; a.t = 1.4; a.angryAt = c; if (Math.random() < 0.5) say(p, L.honk, null, '#ffd23a'); }
    }
  });
  X.on('honk', e => {   // a stuck car leans on the horn: whoever is in front hurries up
    if (!live() || !e.car) return;
    const c = e.car, fx = Math.cos(c.th), fy = Math.sin(c.th);
    for (const p of X.peds) {
      const a = p.ai; if (!a || a.owner !== 'peds' || p.dead || p.hidden || a.type === 'gang') continue;
      const dx = p.x - c.x, dy = p.y - c.y; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) continue;
      const al = dx * fx + dy * fy; if (al < 0 || Math.abs(dx * fy - dy * fx) > 2.5) continue;
      a.jumpT = 0.3; a.brisk = 4;
      if (a.type === 'old' && Math.random() < 0.5) say(p, L.old, null, '#ffd23a');
    }
  });
  X.on('carDestroyed', e => { if (live() && e.car) S.wrecks.push({ car: e.car, t: X.time, id: e.car.id }); });
  // brawl.js hands a fighter back: run if they lost their nerve, shake a fist at one who got away, else carry on.
  X.on('brawlEnd', e => {
    if (!live() || !e || !e.ped) return;
    const p = e.ped, a = p.ai, tg = e.target;
    if (!mine(p) || p.dead) return;
    a.target = null; a.pose = null; a.alertT = 0;
    if (a.type === 'gang') { endAttack(p); return; }
    if (e.reason === 'flee') { a.st = 'walk'; startFlee(p, tg ? tg.x : p.x, tg ? tg.y : p.y, rand(7, 11), 1, true); if (a.st === 'cower') a.st = 'flee'; }
    else if (e.reason === 'escaped') { a.st = 'angry'; a.t = 2.2; a.angryAt = tg && tg.car ? tg.car : tg; }
    else { resume(p); a.brisk = 6; }
  });
  // Somebody went down in a street fight: the ring of watchers jumps and gasps.
  X.on('brawlKnockdown', e => {
    if (!live() || !e) return;
    let said = false;
    eachNear(e.x, e.y, 12, q => {
      if (!mine(q) || q.ai.st !== 'watch') return;
      q.ai.jumpT = 0.3;
      if (!said && Math.random() < 0.5) { said = true; X.floatText(q.x, q.y - 0.8, pick(L.ooh), '#ffe14a', { size: 13, life: 1.3 }); }
    });
  });

  // A gun pointed at people: hands up close by, running further off. Gang corners take it badly.
  function gangWarn(gr, sh) {
    const g = gr.gang;
    if (g.respect <= -10 || X.time - gr.warnT < 6) { provoke(g, sh, gr.x, gr.y); return; }
    if (X.time - gr.warnT > 6) { gr.warnT = X.time; for (const m of gr.members) m.ai.alertT = 1.2; say(gr.members[0], L.warn, null, g.color); }
  }
  function aimScan() {
    const pp = P.ped; if (!pp || P.car || pp.dead || P.state !== 'play' || X.scene) return;
    const W = X.WEAPONS && X.WEAPONS[P.weapon]; if (!W || W.kind === 'melee') return;
    const a0 = pp.aim != null ? pp.aim : pp.th;
    for (const q of X.peds) {
      const a = q.ai; if (!a || a.owner !== 'peds' || q.dead || q.removed || q.hidden) continue;
      const dx = q.x - pp.x, dy = q.y - pp.y; if (Math.abs(dx) > 14 || Math.abs(dy) > 14) continue;
      const d = Math.hypot(dx, dy); if (d > 14 || d < 0.5) continue;
      if (Math.abs(wrap(Math.atan2(dy, dx) - a0)) > (d < 5 ? 0.35 : 0.2)) continue;
      if (a.type === 'gang') { if (a.st === 'hang' && a.group && X.time - (a.group.aimT || 0) > 1.5) { a.group.aimT = X.time; gangWarn(a.group, pp); } continue; }
      if (!CALM[a.st] || X.time < a.witT) continue;
      a.witT = X.time + 2; endChat(q);
      if (d < 7 && Math.random() < 0.65) { a.st = 'hands'; a.t = rand(1.2, 2.2); a.fx = pp.x; a.fy = pp.y; if (Math.random() < 0.4) say(q, L.mug, null, '#ffd23a'); voice(q, 'yelp'); }
      else startFlee(q, pp.x, pp.y, rand(5, 8), 1, true);
    }
  }
  // Russ corners bring their own bass.
  function russBeat() {
    const pp = P.car || P.ped; if (!pp || X.scene || G().status !== 'play') return;
    for (const gr of S.groups) {
      if (gr.gang.id !== 'russ' || !gr.members.length) continue;
      const d = Math.hypot(gr.x - pp.x, gr.y - pp.y); if (d > 30) continue;
      if (gr.members.some(hostileM)) continue;
      const k = PG.audio.kit(); if (!k) return;
      const v = Math.pow(1 - d / 30, 1.5), t = k.now, n = S.beat++;
      k.tone('sine', 95, t, 0.16, 0.22 * v, { to: 42 });
      if (n % 2) k.noise(t, 0.05, 0.05 * v, 'highpass', 6000);
      if (n % 4 === 2) k.tone('sawtooth', 55, t, 0.22, 0.05 * v, { lp: 300 });
      return;
    }
  }

  // ================= street fights draw a crowd =================
  function startWatch(p, f) {
    const a = p.ai; endChat(p);
    a.st = 'watch'; a.fightRef = f; a.t = rand(15, 35); a.pose = null;
    a.ha = Math.atan2(p.y - f.y, p.x - f.x) + rand(-0.4, 0.4); a.rad = rand(3.3, 5);
    const r = Math.random();
    a.wpose = r < 0.42 ? 'cheer' : r < 0.68 ? 'film' : a.type === 'old' ? 'look' : 'cross';
    if (a.wpose === 'look') a.wpose = null;
    S.stats.watchers++;
  }
  // Every half second: people within 15 m of a fight stop to watch, phone it in, or (the timid) leave; the odd
  // tough guy or drunk wades in.
  function crowdScan() {
    if (!X.brawl || X.scene) return;
    const fs = X.brawl.fights();
    for (let i = 0; i < fs.length && i < 6; i++) {
      const f = fs[i];
      if (!X.inView(f.x, f.y, 12)) continue;
      let n = 0;
      eachNear(f.x, f.y, 16, q => { if (mine(q) && q.ai.st === 'watch' && q.ai.fightRef === f) n++; });
      f.watch = n;
      eachNear(f.x, f.y, 15, q => {
        const a = q.ai;
        if (!mine(q) || q.dead || !CALM[a.st] || a.st === 'watch' || a.type === 'gang' || a.lead || a.seenFight === f || q === f.a || q === f.b) return;
        if (Math.hypot(q.x - f.x, q.y - f.y) > 15) return;
        a.seenFight = f;
        const r = Math.random();
        if ((a.type === 'tough' || a.type === 'drunk') && r < 0.12) {   // 'HEY! LEAVE HIM ALONE!'
          const tg = f.player ? (f.a.isPlayer ? f.a : f.b) : Math.random() < 0.5 ? f.a : f.b;
          if (retaliate(q, tg, false)) { S.stats.joined++; return; }
        }
        if (r < 0.6 && n < 14) { startWatch(q, f); n++; }
        else if (r < 0.76 && f.player) startCall(q, { type: 'assault', x: f.x, y: f.y, by: P.ped });
        else if (r < 0.86 && (a.type === 'old' || a.type === 'business' || a.type === 'tourist')) startFlee(q, f.x, f.y, rand(4, 7), 0, false);
      });
      f.watch = n;
    }
  }

  // ================= the mugging interaction =================
  function mugTarget() {
    const pp = P.ped; if (!pp || pp.dead || P.car || X.scene || P.state !== 'play' || pp.speed > 2.2) return null;
    let best = null, bd = 1.7;
    for (const q of X.peds) {
      const a = q.ai; if (!a || a.owner !== 'peds' || q.dead || q.removed || q.hidden || a.type === 'gang' || a.mugged || !CALM[a.st]) continue;
      if (Math.abs(q.x - pp.x) > 2 || Math.abs(q.y - pp.y) > 2) continue;
      const d = Math.hypot(q.x - pp.x, q.y - pp.y); if (d >= bd) continue;
      if (Math.abs(wrap(Math.atan2(q.y - pp.y, q.x - pp.x) - pp.th)) > 1.0) continue;
      best = q; bd = d;
    }
    if (best && X.nearestEnterableCar(2.0)) return null;
    return best;
  }
  function mug(q) {
    const a = q.ai, pp = P.ped; if (!a || q.dead) return;
    a.mugged = true; endChat(q);
    const armed = P.weapon && P.weapon !== 'fists';
    if (a.type !== 'old' && Math.random() < (armed ? OPT.mugFight : OPT.mugFightFists) && retaliate(q, pp)) return;
    const amt = Math.round(cashFor(q) * (armed ? 1.5 : 1));
    a.st = 'hands'; a.t = 1.1; a.fx = pp.x; a.fy = pp.y;
    voice(q, 'yelp'); say(q, L.mug, null, '#ffd23a');
    X.money(amt, 'mugging', q.x, q.y);
    S.stats.mugs++;
    X.crime('robbery', q.x, q.y, { ped: q, amount: amt });
    X.emit('mugged', { ped: q, amount: amt });
  }
  const mugInteraction = { test() { const q = mugTarget(); return q ? { text: 'F: Mug the ' + (TYPE_NAME[q.ai.type] || 'pedestrian'), priority: 1, run: () => mug(q) } : null; } };

  // ================= drawing =================
  const CHARC = { skin: '#2b2520', hair: '#141110', shirt: '#26211d', pants: '#1b1816' };
  const CC = { skin: '', hair: '', shirt: '', pants: '', hat: null, sleeve: '', jacket: null, hatType: null, style: '' };
  function colorsOf(p, lk, outfit, charred) {
    CC.skin = lk.skin || '#e0ac7e'; CC.hair = lk.hair || '#222'; CC.shirt = lk.shirt || '#888'; CC.pants = lk.pants || '#333';
    CC.hat = lk.hat || null; CC.jacket = lk.jacket || null; CC.hatType = lk.hatType || (lk.hat ? ['cap', 'beanie', 'flat'][Math.floor(hr(p.id, 5) * 3)] : null);
    CC.style = lk.hairStyle || STYLES[Math.floor(hr(p.id, 3) * STYLES.length)];
    switch (outfit) {
      case 'cop':   // a look that says 'cop' keeps its own colours; anyone else on team cop gets the uniform
        if (lk.outfit !== 'cop') { CC.shirt = '#22376b'; CC.pants = '#1a2440'; CC.hat = '#141c33'; }
        CC.hat = CC.hat || '#141c33'; CC.hatType = lk.hatType || 'police'; CC.jacket = null; break;
      case 'swat':
        if (lk.outfit !== 'swat') { CC.shirt = '#1c1f24'; CC.pants = '#1c1f24'; CC.hat = '#2a2e35'; }
        CC.hat = CC.hat || '#2a2e35'; CC.hatType = 'helmet'; CC.jacket = null; break;
      case 'army': CC.hat = lk.hat || '#3f4b2b'; CC.hatType = 'helmet'; CC.jacket = null; break;
      case 'guard': CC.shirt = lk.shirt && lk.outfit === 'guard' ? lk.shirt : '#59606b'; CC.pants = '#23272e'; CC.hat = lk.hat || '#1d2026'; CC.hatType = lk.hatType || 'cap'; break;
      case 'fire': CC.hat = lk.hat || '#c81e1e'; CC.hatType = 'helmet'; break;
      case 'worker': CC.hat = lk.hat || '#f2c230'; CC.hatType = 'hard'; break;
    }
    if (charred) { CC.skin = CHARC.skin; CC.hair = CHARC.hair; CC.shirt = CHARC.shirt; CC.pants = CHARC.pants; CC.hat = null; CC.jacket = null; }
    CC.sleeve = CC.jacket || CC.shirt;
  }
  function dot(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill(); }
  function outfitOf(p, lk) {
    if (p.team === 'cop') return lk.outfit === 'swat' ? 'swat' : 'cop';
    return lk.outfit || (p.team === 'guard' ? 'guard' : p.team === 'army' ? 'army' : '');
  }
  // ---- drawing state ----
  // Settings are read once per person drawn (PG.settings.detail 'low' = a simple figure without hands,
  // shoes, faces or clothing details; shadows). The world transform comes back with one setTransform
  // instead of a save/restore per person. (Cached sprites were tried for bodies and corpses: on a
  // software-rasterised canvas a filtered, rotated blit of the sprite costs more than these few small fills.)
  let CM = null, LOWD = false, SHADOW = true;
  function place(ctx, M, x, y, th, k) {
    const cs = Math.cos(th) * k, sn = Math.sin(th) * k;
    ctx.setTransform(M.a * cs + M.c * sn, M.b * cs + M.d * sn, M.c * cs - M.a * sn, M.d * cs - M.b * sn, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
  }
  function torso(ctx, p, lk, outfit, tw) {
    ctx.fillStyle = CC.jacket || CC.shirt; oval(ctx, 0, 0, 0.165, tw);
    if (!LOWD) torsoDetail(ctx, p, lk, outfit, 0);
  }
  function head(ctx, p, lk, outfit, hx, hy, t) {
    if (!LOWD) { drawHead(ctx, p, lk, outfit, hx, hy, t); return; }
    ctx.fillStyle = CC.skin; disc(ctx, hx, hy, 0.13);
    const top = CC.hat || (CC.style === 'bald' ? null : CC.hair);
    if (top) { ctx.fillStyle = top; disc(ctx, hx - 0.02, hy, CC.hat ? 0.14 : 0.122); }
  }
  // Any person, any state. Local frame: +x is where they face, +y their right hand side.
  function drawPed(ctx, p, t) {
    const lk = p.look || DEF_LOOK, outfit = outfitOf(p, lk);
    const charred = (p.dead && (p.lastKind === 'fire' || p.lastKind === 'explosion')) || lk.skin === CHARC.skin;
    colorsOf(p, lk, outfit, charred);
    const set = PG.settings || {}, sc = X.lastView ? X.lastView.scale : 30, s = (lk.scale || 1) * 1.18;   // a touch larger than life, GTA2 style
    LOWD = set.detail === 'low'; SHADOW = set.shadows !== false;
    const M = CM = ctx.getTransform(), ga = ctx.globalAlpha, lw = ctx.lineWidth, lc = ctx.lineCap;
    drawPedIn(ctx, p, t, lk, outfit, sc, s);
    ctx.setTransform(M); ctx.globalAlpha = ga; ctx.lineWidth = lw; ctx.lineCap = lc;
  }
  function drawPedIn(ctx, p, t, lk, outfit, sc, s) {
    if (p.dead) { drawSprawl(ctx, p, lk, outfit, sc, s * 0.9, true, t); return; }
    const ai = mine(p) ? p.ai : null;
    const bp = X.brawl ? X.brawl.armPose(p, t) : null;   // fists, kicks, knockdowns (brawl.js)
    if (bp && bp.body !== 'up') { drawDown(ctx, p, lk, outfit, sc, s, bp, t); if (p.onFire > 0) { ctx.setTransform(CM); flames(ctx, p.x, p.y, t, p.id); } return; }
    let pose = p.pose || (ai && ai.pose) || null;
    if (p.knock > 0) pose = 'down';
    if (pose === 'down' || pose === 'lie') { drawSprawl(ctx, p, lk, outfit, sc, s * 0.9, false, t); if (p.onFire > 0) { ctx.setTransform(CM); flames(ctx, p.x, p.y, t, p.id); } return; }
    if (sc * s < 9) {   // far zoom: a blob and a head
      if (ai && ai.fade < 0.5) return;
      ctx.fillStyle = CC.sleeve; oval(ctx, p.x, p.y, 0.19, 0.3, p.th);
      ctx.fillStyle = CC.hat || (CC.style === 'bald' ? CC.skin : CC.hair); disc(ctx, p.x + Math.cos(p.th) * 0.03, p.y + Math.sin(p.th) * 0.03, 0.14);
      if (p.onFire > 0) flames(ctx, p.x, p.y, t, p.id);
      return;
    }
    const jump = ai && ai.jumpT > 0 ? 1 + Math.sin(ai.jumpT / 0.3 * Math.PI) * 0.18 : 1;
    if (ai && ai.fade < 1) ctx.globalAlpha = ai.fade;
    if (SHADOW) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; oval(ctx, p.x + 0.09 * jump, p.y + 0.11 * jump, 0.24 * s, 0.36 * s, p.th); }
    place(ctx, CM, p.x, p.y, p.th, 1);
    const ra = !bp && p.act && p.act.on && (p.act.type === 'hitReact' || p.act.type === 'stagger') ? p.act : null;
    if (ra) {   // somebody brawl.js draws no arms for (a gun in hand) still reels from a punch
      const e = ra.type === 'stagger' ? Math.max(0, 1 - ra.t / ra.dur) : (ra.t < 0.05 ? ra.t / 0.05 : Math.max(0, 1 - (ra.t - 0.05) / Math.max(0.05, ra.dur - 0.05))) * (ra.k || 1);
      ctx.translate(-0.1 * e, -ra.side * 0.06 * e); ctx.rotate(ra.side * 0.3 * e * (ra.type === 'stagger' ? Math.sin(ra.t * 13) : 1));
    }
    if (s * jump !== 1) ctx.scale(s * jump, s * jump);
    ctx.lineCap = 'round';
    if (pose === 'dive') drawDive(ctx, lk);
    else if (pose === 'sit') drawSit(ctx, lk);
    else if (pose === 'cower' || pose === 'kneel') drawCrouch(ctx, p, lk, pose, t);
    else if (bp) drawFighter(ctx, p, lk, outfit, t, bp);
    else drawUpright(ctx, p, lk, outfit, pose, t, ai);
    if (p.hurtT > 0) { ctx.fillStyle = `rgba(255,40,30,${(0.5 * Math.min(1, p.hurtT / 0.25)).toFixed(3)})`; disc(ctx, 0, 0, 0.38); }
    if (p.onFire > 0) { ctx.setTransform(CM); flames(ctx, p.x, p.y, t, p.id); }
  }
  function drawUpright(ctx, p, lk, outfit, pose, t, ai) {
    const sp = p.speed || 0, run = sp > 3.3 && !pose;
    const amp = pose && pose !== 'punch' && pose !== 'fist' ? 0 : Math.min(1, sp / 1.3);
    const sw = Math.sin(p.walk * 3) * amp * (run ? 0.34 : 0.24);
    const armed = p.weapon && p.weapon !== 'fists' && !p.holster;
    const W = armed && X.WEAPONS ? X.WEAPONS[p.weapon] : null, held = armed ? (W ? W.held : 'pistol') : null;
    const lean = outfit === 'old' ? 0.07 : 0;
    // legs and shoes
    if (amp > 0.06) {
      ctx.strokeStyle = CC.pants; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(0, -0.1); ctx.lineTo(sw, -0.11); ctx.moveTo(0, 0.1); ctx.lineTo(-sw, 0.11); ctx.stroke();
      if (LOWD) { /* no shoes */ } else if (outfit === 'jog') { ctx.strokeStyle = CC.skin; ctx.lineWidth = 0.11; ctx.beginPath(); ctx.moveTo(sw * 0.5, -0.105); ctx.lineTo(sw, -0.11); ctx.moveTo(-sw * 0.5, 0.105); ctx.lineTo(-sw, 0.11); ctx.stroke(); }
      if (!LOWD) { ctx.fillStyle = outfit === 'jog' ? '#f2f2f2' : '#17171a'; ctx.beginPath(); dot(ctx, sw + 0.06, -0.11, 0.07); dot(ctx, -sw + 0.06, 0.11, 0.07); ctx.fill(); }
    } else if (!LOWD) { ctx.fillStyle = '#17171a'; ctx.beginPath(); dot(ctx, 0.12, -0.1, 0.065); dot(ctx, 0.12, 0.1, 0.065); ctx.fill(); }
    // hands (left = -y)
    let lx, ly, rx, ry;
    if (run) { lx = 0.12 - sw * 0.7; ly = -0.27; rx = 0.12 + sw * 0.7; ry = 0.27; }
    else { lx = -sw * 0.9; ly = -0.33; rx = sw * 0.9; ry = 0.33; }
    if (armed) {
      if (held === 'bat') { lx = 0.2; ly = 0.06; rx = 0.25; ry = 0.15; }
      else if (held === 'throw') { lx = 0.12; ly = -0.28; rx = 0.3; ry = 0.22; }
      else if (held === 'pistol' || !held || held === 'none') { lx = 0.24; ly = -0.04; rx = 0.4; ry = 0.06; }
      else { lx = 0.3; ly = -0.04; rx = 0.18; ry = 0.12; }
    }
    switch (pose) {
      case 'phone': case 'call': rx = 0.08; ry = 0.19; break;
      case 'smoke': if ((t + p.id * 0.7) % 4 < 1.1) { rx = 0.18; ry = 0.06; } else { rx = 0.08; ry = 0.34; } break;
      case 'chat': { const g = Math.sin(t * 5 + p.id); lx = 0.16 + g * 0.06; ly = -0.28; rx = 0.18 - g * 0.06; ry = 0.27; break; }
      case 'punch': { const right = (p.id + Math.floor(t * 3)) % 2; if (right) { rx = 0.52; ry = 0.08; lx = 0.16; ly = -0.2; } else { lx = 0.52; ly = -0.08; rx = 0.16; ry = 0.2; } break; }
      case 'fist': rx = 0.36; ry = 0.22 + Math.sin(t * 22) * 0.06; break;
      case 'hands': case 'surrender': lx = 0.02; ly = -0.24; rx = 0.02; ry = 0.24; break;
      case 'cross': lx = 0.15; ly = 0.13; rx = 0.15; ry = -0.13; break;
      case 'photo': case 'film': lx = 0.3; ly = -0.07; rx = 0.3; ry = 0.07; break;
      case 'drink': if ((t + p.id) % 3 < 1) { rx = 0.17; ry = 0.06; } break;
      case 'wave': rx = 0.14 + Math.sin(t * 10) * 0.08; ry = 0.42; break;
      case 'point': rx = 0.58; ry = 0.16; break;
      case 'dance': { const g = Math.sin(t * 8 + p.id); lx = 0.1 + g * 0.14; ly = -0.4; rx = 0.1 - g * 0.14; ry = 0.4; break; }
      case 'headbang': lx = 0.22; ly = -0.28; rx = 0.22; ry = 0.28; break;
      case 'cheer': { const g = Math.max(0, Math.sin(t * 9 + p.id)); lx = 0.2; ly = -0.24; rx = 0.07 + g * 0.05; ry = 0.34 - g * 0.17; break; }   // pumping a fist
    }
    ctx.strokeStyle = CC.sleeve; ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.moveTo(0.01, -0.24); ctx.lineTo(lx, ly); ctx.moveTo(0.01, 0.24); ctx.lineTo(rx, ry); ctx.stroke();
    // things carried
    const acc = LOWD ? null : lk.acc, free = !armed && (!pose || pose === 'fist');
    if (acc === 'briefcase' && free) { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(rx - 0.16, ry + 0.02, 0.32, 0.1); ctx.fillStyle = '#c9a46a'; ctx.fillRect(rx - 0.02, ry + 0.03, 0.04, 0.08); }
    else if (acc === 'bags' && free) { ctx.fillStyle = '#c8a46a'; ctx.fillRect(lx - 0.09, ly - 0.14, 0.18, 0.12); ctx.fillStyle = '#e8e8e8'; ctx.fillRect(rx - 0.09, ry + 0.02, 0.18, 0.12); ctx.fillStyle = '#d64a3b'; ctx.fillRect(rx - 0.09, ry + 0.06, 0.18, 0.025); }
    else if (acc === 'cane' && free) { ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + 0.2 + Math.max(0, Math.sin(p.walk * 3)) * 0.08, ry + 0.04); ctx.stroke(); }
    else if (acc === 'beer' && !armed) { ctx.fillStyle = '#3f6a2a'; disc(ctx, rx + 0.04, ry, 0.055); }
    if (LOWD) { /* no props in hand */ } else if (pose === 'phone' || pose === 'call' || pose === 'film') { ctx.fillStyle = '#101216'; ctx.fillRect(rx - 0.03, ry - 0.06, 0.07, 0.12); if (night()) { ctx.fillStyle = '#9fd6ff'; ctx.fillRect(rx - 0.02, ry - 0.05, 0.05, 0.1); } }
    if (pose === 'smoke' && !LOWD) { ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(rx + 0.03, ry); ctx.lineTo(rx + 0.11, ry); ctx.stroke(); ctx.fillStyle = '#ff6a1a'; disc(ctx, rx + 0.12, ry, 0.018); }
    if (pose === 'photo' && !LOWD) { ctx.fillStyle = '#1b1b1f'; ctx.fillRect(0.27, -0.09, 0.09, 0.18); ctx.fillStyle = '#5a6a7a'; disc(ctx, 0.37, 0, 0.035); }
    // torso
    const tw = outfit === 'suit' || outfit === 'cop' || outfit === 'swat' || outfit === 'metal' || outfit === 'army' ? 0.3 : 0.285;
    torso(ctx, p, lk, outfit, tw);
    // the weapon, then the hands holding it
    if (armed) heldWeapon(ctx, held, p.weapon);
    else if (p.holster && p.weapon === 'bat') { ctx.strokeStyle = '#b07a3e'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-0.28, 0.24); ctx.lineTo(0.12, -0.12); ctx.stroke(); }
    if (!LOWD) { ctx.fillStyle = outfit === 'swat' ? '#1c1f24' : CC.skin; ctx.beginPath(); dot(ctx, lx, ly, 0.065); dot(ctx, rx, ry, 0.065); ctx.fill(); }
    if (outfit === 'metal' && !LOWD) { ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(lx, ly, 0.075, 0, TAU); ctx.moveTo(rx + 0.075, ry); ctx.arc(rx, ry, 0.075, 0, TAU); ctx.stroke(); }
    // head
    let hx = 0.03 + lean;
    if (pose === 'headbang') hx += Math.sin(t * 10 + p.id) * 0.08;
    if (pose === 'dance') hx += Math.sin(t * 8 + p.id) * 0.03;
    head(ctx, p, lk, outfit, hx, 0, t);
  }
  // A person in brawl.js's hands: guard stance or a strike, reaction, taunt. b = X.brawl.armPose(): shoulders,
  // elbows and fists, torso twist and lean, head offset, stance, a kicking leg, a bat.
  const LONG = { suit: 1, cop: 1, swat: 1, army: 1, guard: 1, old: 1, medic: 1, fire: 1, worker: 1 };
  function drawFighter(ctx, p, lk, outfit, t, b) {
    const mv = Math.min(1, (p.speed || 0) / 1.3), shoe = outfit === 'jog' ? '#f2f2f2' : '#17171a';
    if (b.leg) {   // a kick: the standing foot, then the kicking leg hip -> knee -> foot
      const sd = b.leg;
      ctx.fillStyle = shoe; ctx.beginPath(); dot(ctx, 0.02, -sd * 0.12, 0.07); ctx.fill();
      ctx.strokeStyle = CC.pants; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.moveTo(b.hipx, b.hipy); ctx.lineTo(b.knx, b.kny); ctx.lineTo(b.kx, b.ky); ctx.stroke();
      ctx.fillStyle = shoe; ctx.beginPath(); dot(ctx, b.kx, b.ky, 0.085 * (b.fk || 1)); ctx.fill();
      ctx.strokeStyle = 'rgba(225,225,215,0.55)'; ctx.lineWidth = 0.025; ctx.stroke();   // a pale sole rim: a dark shoe on a dark street
    } else {   // the boxer's stance (left foot forward, bouncing) blended with walking steps
      const st = b.stance, sw = Math.sin(p.walk * 3) * mv * 0.22, bob = st * Math.sin(t * 9 + p.id * 1.7) * 0.02;
      const f1 = 0.13 * st + sw, f2 = -0.11 * st - sw, y1 = -0.11 - st * 0.03, y2 = 0.11 + st * 0.03;
      ctx.strokeStyle = CC.pants; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(0, -0.1); ctx.lineTo(f1, y1); ctx.moveTo(0, 0.1); ctx.lineTo(f2, y2); ctx.stroke();
      ctx.fillStyle = shoe; ctx.beginPath(); dot(ctx, f1 + 0.06 + bob, y1, 0.07); dot(ctx, f2 + 0.06 - bob, y2, 0.07); ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = CC.sleeve; ctx.lineWidth = 0.13;
    ctx.beginPath(); ctx.moveTo(b.lsx, b.lsy); ctx.lineTo(b.lex, b.ley); ctx.moveTo(b.rsx, b.rsy); ctx.lineTo(b.rex, b.rey); ctx.stroke();
    const tw = outfit === 'suit' || outfit === 'cop' || outfit === 'swat' || outfit === 'metal' || outfit === 'army' || outfit === 'tough' ? 0.3 : 0.285;
    ctx.save(); ctx.translate(b.lean, b.sy); if (b.tw) ctx.rotate(b.tw);
    torso(ctx, p, lk, outfit, tw);
    ctx.restore();
    ctx.strokeStyle = CC.jacket || LONG[outfit] ? CC.sleeve : CC.skin; ctx.lineWidth = 0.115;
    ctx.beginPath(); ctx.moveTo(b.lex, b.ley); ctx.lineTo(b.lx, b.ly); ctx.moveTo(b.rex, b.rey); ctx.lineTo(b.rx, b.ry); ctx.stroke();
    if (b.bat) {   // both hands on the handle, the barrel out along the swing
      const c = Math.cos(b.ba), sn = Math.sin(b.ba), hx = (b.lx + b.rx) / 2 - c * 0.05, hy = (b.ly + b.ry) / 2 - sn * 0.05, nx = -sn, ny = c;
      ctx.fillStyle = '#b07a3e'; ctx.beginPath();
      ctx.moveTo(hx + nx * 0.028, hy + ny * 0.028); ctx.lineTo(hx + c * 0.8 + nx * 0.062, hy + sn * 0.8 + ny * 0.062); ctx.lineTo(hx + c * 0.84, hy + sn * 0.84);
      ctx.lineTo(hx + c * 0.8 - nx * 0.062, hy + sn * 0.8 - ny * 0.062); ctx.lineTo(hx - nx * 0.028, hy - ny * 0.028); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a5228'; disc(ctx, hx - c * 0.02, hy - sn * 0.02, 0.035);
    }
    ctx.fillStyle = outfit === 'swat' ? '#1c1f24' : CC.skin; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.022;
    if (LOWD) { ctx.beginPath(); dot(ctx, b.lx, b.ly, 0.084 * b.fl); dot(ctx, b.rx, b.ry, 0.084 * b.fr); ctx.fill(); head(ctx, p, lk, outfit, 0.03 + b.lean + b.hx, b.sy + b.hy, t); return; }
    ctx.beginPath(); ctx.arc(b.lx, b.ly, 0.084 * b.fl, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.rx, b.ry, 0.084 * b.fr, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); dot(ctx, b.lx + 0.025 * b.fl, b.ly - 0.025 * b.fl, 0.032 * b.fl); dot(ctx, b.rx + 0.025 * b.fr, b.ry - 0.025 * b.fr, 0.032 * b.fr); ctx.fill();   // knuckle shine
    if (outfit === 'metal') { ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(b.lx, b.ly, 0.09 * b.fl, 0, TAU); ctx.moveTo(b.rx + 0.09 * b.fr, b.ry); ctx.arc(b.rx, b.ry, 0.09 * b.fr, 0, TAU); ctx.stroke(); }
    head(ctx, p, lk, outfit, 0.03 + b.lean + b.hx, b.sy + b.hy, t);
  }
  // Knocked down by a blow (brawl.js): topple over (the body lengthening as it falls), lie dazed, get up via
  // sitting and a knee; or on the knees, begging.
  function drawDown(ctx, p, lk, outfit, sc, s, b, t) {
    if (b.body === 'fall' || b.body === 'lie') { drawSprawl(ctx, p, lk, outfit, sc, s * 0.9, false, t, b.ang, b.body === 'fall' ? 0.35 + 0.65 * b.k : 1); return; }
    if (SHADOW) { ctx.fillStyle = 'rgba(0,0,0,0.26)'; oval(ctx, p.x + 0.07, p.y + 0.09, 0.3 * s, 0.34 * s, p.th); }
    place(ctx, CM, p.x, p.y, p.th, s); ctx.lineCap = 'round';
    if (b.body === 'kneel') drawCrouch(ctx, p, lk, 'beg', t);
    else if (b.k < 0.42) drawSit(ctx, lk);
    else if (b.k < 0.8) drawCrouch(ctx, p, lk, 'kneel', t);
    else drawUpright(ctx, p, lk, outfit, null, t, null);
    if (p.hurtT > 0) { ctx.fillStyle = `rgba(255,40,30,${(0.5 * Math.min(1, p.hurtT / 0.25)).toFixed(3)})`; disc(ctx, 0, 0, 0.38); }
  }
  function torsoDetail(ctx, p, lk, outfit, t) {
    switch (outfit) {
      case 'suit':
        ctx.fillStyle = '#ece8df'; ctx.beginPath(); ctx.moveTo(0.16, -0.075); ctx.lineTo(0.16, 0.075); ctx.lineTo(0.03, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = lk.tie || '#b0151a'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.155, 0); ctx.lineTo(0.06, 0); ctx.stroke();
        break;
      case 'jog': ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-0.03, -0.27, 0.05, 0.54); break;
      case 'overalls':
        ctx.fillStyle = '#f2f2f2'; oval(ctx, 0.1, 0, 0.05, 0.1);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.13, -0.12); ctx.lineTo(-0.13, -0.12); ctx.moveTo(0.13, 0.12); ctx.lineTo(-0.13, 0.12); ctx.stroke();
        ctx.fillStyle = '#ffd23a'; ctx.fillRect(-0.12, -0.05, 0.05, 0.1);
        break;
      case 'cop':
        ctx.fillStyle = '#3a5aa0'; ctx.fillRect(-0.06, -0.3, 0.1, 0.06); ctx.fillRect(-0.06, 0.24, 0.1, 0.06);
        ctx.fillStyle = '#e8c35a'; disc(ctx, 0.11, -0.13, 0.035);
        ctx.fillStyle = '#0d0f12'; ctx.fillRect(0.0, 0.1, 0.07, 0.08);
        break;
      case 'swat': ctx.fillStyle = '#3a3f47'; ctx.fillRect(-0.12, -0.2, 0.25, 0.4); ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-0.1, -0.05, 0.03, 0.1); break;
      case 'army': ctx.fillStyle = 'rgba(30,36,20,0.55)'; ctx.beginPath(); dot(ctx, 0.05, -0.15, 0.06); dot(ctx, -0.07, 0.08, 0.07); dot(ctx, 0.08, 0.14, 0.05); dot(ctx, -0.04, -0.04, 0.04); ctx.fill(); ctx.fillStyle = 'rgba(140,150,100,0.5)'; ctx.beginPath(); dot(ctx, -0.08, -0.2, 0.045); dot(ctx, 0.1, 0.03, 0.04); ctx.fill(); break;
      case 'guard': ctx.fillStyle = '#e8c35a'; disc(ctx, 0.11, -0.12, 0.03); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-0.04, -0.29, 0.08, 0.04); ctx.fillRect(-0.04, 0.25, 0.08, 0.04); break;
      case 'medic': ctx.fillStyle = '#3e8e5a'; ctx.fillRect(-0.03, -0.28, 0.06, 0.56); ctx.fillStyle = '#c8ccd2'; ctx.fillRect(-0.1, -0.28, 0.03, 0.56); break;
      case 'fire': case 'worker': ctx.fillStyle = outfit === 'worker' ? '#c8ff3a' : '#ffd23a'; ctx.fillRect(-0.1, -0.28, 0.05, 0.56); ctx.fillRect(0.06, -0.26, 0.04, 0.52); ctx.fillStyle = '#d8dde4'; ctx.fillRect(-0.09, -0.28, 0.02, 0.56); break;
      case 'metal':   // a bullet belt across the chest
        ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.13, -0.17); ctx.lineTo(-0.12, 0.2); ctx.stroke();
        ctx.fillStyle = '#c9c2a0'; ctx.beginPath(); for (let i = 0; i < 5; i++) dot(ctx, 0.11 - i * 0.055, -0.14 + i * 0.08, 0.018); ctx.fill();
        break;
      case 'tourist':
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); dot(ctx, 0.05, -0.15, 0.035); dot(ctx, -0.06, 0.12, 0.035); dot(ctx, 0.08, 0.16, 0.03); dot(ctx, -0.07, -0.05, 0.03); ctx.fill();
        if (lk.acc === 'camera') { ctx.fillStyle = '#1b1b1f'; ctx.fillRect(0.1, -0.06, 0.07, 0.12); }
        break;
      case 'old': ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); for (let i = 0; i < 3; i++) dot(ctx, 0.14, -0.06 + i * 0.06, 0.012); ctx.fill(); break;
      default:
        if (CC.jacket) { ctx.fillStyle = CC.shirt; ctx.beginPath(); ctx.moveTo(0.165, -0.06); ctx.lineTo(0.165, 0.06); ctx.lineTo(0.05, 0); ctx.closePath(); ctx.fill(); }
    }
  }
  function drawHead(ctx, p, lk, outfit, hx, hy, t) {
    ctx.fillStyle = CC.skin; disc(ctx, hx, hy, 0.13);
    if (outfit === 'metal') { ctx.fillStyle = '#ecebe6'; oval(ctx, hx + 0.06, hy, 0.065, 0.1); ctx.fillStyle = '#111'; ctx.beginPath(); dot(ctx, hx + 0.09, hy - 0.045, 0.025); dot(ctx, hx + 0.09, hy + 0.045, 0.025); ctx.fill(); }
    const st = CC.style, hc = CC.hair, ht = CC.hatType, hat = CC.hat;
    if (!hat || ht === 'band') {
      ctx.fillStyle = hc;
      switch (st) {
        case 'long': oval(ctx, hx - 0.07, hy, 0.17, 0.15); break;
        case 'bun': disc(ctx, hx - 0.025, hy, 0.122); disc(ctx, hx - 0.15, hy, 0.06); break;
        case 'pony': disc(ctx, hx - 0.025, hy, 0.122); ctx.strokeStyle = hc; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(hx - 0.12, hy); ctx.lineTo(hx - 0.26, hy + Math.sin(p.walk * 3) * 0.05); ctx.stroke(); break;
        case 'bald': ctx.fillStyle = 'rgba(255,255,255,0.22)'; disc(ctx, hx - 0.02, hy - 0.03, 0.045); break;
        case 'afro': disc(ctx, hx - 0.03, hy, 0.175); break;
        case 'curly': ctx.beginPath(); dot(ctx, hx - 0.05, hy - 0.06, 0.075); dot(ctx, hx - 0.05, hy + 0.06, 0.075); dot(ctx, hx - 0.1, hy, 0.075); dot(ctx, hx + 0.02, hy, 0.07); ctx.fill(); break;
        case 'buzz': ctx.globalAlpha = 0.7; disc(ctx, hx - 0.02, hy, 0.122); ctx.globalAlpha = 1; break;
        case 'mohawk': ctx.fillRect(hx - 0.14, hy - 0.035, 0.24, 0.07); break;
        default: disc(ctx, hx - 0.025, hy, 0.122);
      }
    }
    if (!hat) return;
    ctx.fillStyle = hat;
    switch (ht) {
      case 'band': ctx.strokeStyle = hat; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(hx - 0.01, hy, 0.12, 0, TAU); ctx.stroke(); break;
      case 'beanie': disc(ctx, hx - 0.01, hy, 0.135); ctx.fillStyle = 'rgba(255,255,255,0.3)'; disc(ctx, hx - 0.02, hy, 0.04); break;
      case 'fedora': ctx.fillStyle = 'rgba(0,0,0,0.25)'; disc(ctx, hx, hy, 0.215); ctx.fillStyle = hat; disc(ctx, hx, hy, 0.2); ctx.fillStyle = '#5a3a20'; disc(ctx, hx - 0.01, hy, 0.13); ctx.fillStyle = hat; disc(ctx, hx - 0.01, hy, 0.105); break;
      case 'helmet': disc(ctx, hx - 0.01, hy, 0.15); ctx.fillStyle = 'rgba(255,255,255,0.18)'; disc(ctx, hx - 0.04, hy - 0.04, 0.05); break;
      case 'hard': disc(ctx, hx - 0.01, hy, 0.15); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(hx - 0.15, hy - 0.02, 0.28, 0.04); break;
      case 'bucket': disc(ctx, hx - 0.01, hy, 0.19); ctx.fillStyle = 'rgba(0,0,0,0.12)'; disc(ctx, hx - 0.01, hy, 0.12); break;
      case 'flat': oval(ctx, hx + 0.02, hy, 0.15, 0.13); ctx.fillStyle = 'rgba(0,0,0,0.2)'; oval(ctx, hx + 0.12, hy, 0.04, 0.1); break;
      case 'police':
        disc(ctx, hx - 0.01, hy, 0.14); ctx.fillStyle = '#0a0c10'; oval(ctx, hx + 0.12, hy, 0.065, 0.11);
        ctx.fillStyle = '#e8c35a'; disc(ctx, hx + 0.08, hy, 0.03);
        break;
      case 'russ': {
        disc(ctx, hx - 0.01, hy, 0.135); ctx.fillStyle = '#111'; oval(ctx, hx + 0.12, hy, 0.05, 0.1);
        const sw = Math.sin(t * 5 + p.id) * 0.06 + (p.speed || 0) * 0.02;
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(hx - 0.02, hy); ctx.quadraticCurveTo(hx - 0.2, hy + 0.1, hx - 0.34, hy + 0.12 + sw); ctx.stroke();
        ctx.fillStyle = '#1b1b1b'; disc(ctx, hx - 0.34, hy + 0.12 + sw, 0.035);
        break;
      }
      default: disc(ctx, hx - 0.01, hy, 0.13); ctx.fillStyle = 'rgba(0,0,0,0.3)'; oval(ctx, hx + 0.12, hy, 0.06, 0.1);
    }
  }
  function heldWeapon(ctx, held, id) {
    ctx.fillStyle = '#16181c';
    switch (held) {
      case 'none': break;
      case 'bat': ctx.fillStyle = '#b07a3e'; ctx.beginPath(); ctx.moveTo(0.22, 0.12); ctx.lineTo(0.95, -0.12); ctx.lineTo(0.97, 0.02); ctx.lineTo(0.24, 0.2); ctx.closePath(); ctx.fill(); break;
      case 'long': ctx.fillRect(0.12, -0.02, 0.78, 0.09); ctx.fillStyle = '#5a3a20'; ctx.fillRect(-0.02, -0.03, 0.2, 0.12); break;
      case 'smg': ctx.fillRect(0.2, -0.03, 0.44, 0.11); break;
      case 'tube': ctx.fillStyle = '#3f4a32'; ctx.fillRect(-0.45, -0.24, 1.25, 0.18); ctx.fillStyle = '#d23a2a'; ctx.fillRect(0.8, -0.22, 0.1, 0.14); break;
      case 'throw': ctx.fillStyle = id === 'molotov' ? '#5b7a3a' : '#3f5a2a'; disc(ctx, 0.32, 0.22, 0.09); if (id === 'molotov') { ctx.fillStyle = '#ff9a2a'; disc(ctx, 0.38, 0.26, 0.04); } break;
      default: ctx.fillRect(0.3, 0.02, 0.38, 0.08);
    }
    if (id === 'flamer') { ctx.fillStyle = '#8a8f96'; disc(ctx, -0.22, 0, 0.14); }
  }
  // Lying down: dead, knocked flat (spinning) or 'lie'. Limbs splay in a pose seeded by the id.
  // ang / len (optional): a knockdown's fall direction and how far the body has toppled (0.35 standing .. 1 flat).
  function drawSprawl(ctx, p, lk, outfit, sc, s, dead, t, ang, len) {
    place(ctx, CM, p.x, p.y, ang == null ? p.th : ang, s);
    if (len != null && len !== 1) ctx.scale(len, 1);
    sprawlBody(ctx, p, lk, outfit, LOWD ? 0 : sc * s, dead, t, ang);
    if (p.hurtT > 0) { ctx.fillStyle = 'rgba(255,40,30,0.35)'; oval(ctx, 0, 0, 0.5, 0.3); }
  }
  // the lying figure in its own frame; px = its scale in CSS px per unit (small: a simple blob)
  function sprawlBody(ctx, p, lk, outfit, px, dead, t, ang) {
    const id = p.id || 1, r1 = hr(id, 11), r2 = hr(id, 12), r3 = hr(id, 13), r4 = hr(id, 14), r5 = hr(id, 15), r6 = hr(id, 16);
    if (SHADOW) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; oval(ctx, 0.05, 0.06, 0.78, 0.48); }
    if (px < 9) { ctx.fillStyle = CC.shirt; oval(ctx, 0, 0, 0.32, 0.2); ctx.fillStyle = CC.skin; disc(ctx, 0.42, 0, 0.14); return; }
    ctx.lineCap = 'round';
    const f1 = 0.1 + r1 * 0.3, f2 = 0.1 + r2 * 0.3, flail = dead ? 0 : ang != null ? Math.sin(t * 3 + id) * 0.025 : Math.sin(t * 14 + id) * 0.08;
    ctx.strokeStyle = CC.pants; ctx.lineWidth = 0.15; ctx.beginPath();
    ctx.moveTo(-0.2, -0.08); ctx.lineTo(-0.44, -0.1 - f1 * 0.5 + (r3 - 0.5) * 0.16); ctx.lineTo(-0.7 + r4 * 0.08, -f1 - flail);
    ctx.moveTo(-0.2, 0.08); ctx.lineTo(-0.46, 0.1 + f2 * 0.45); ctx.lineTo(-0.72 + r5 * 0.1, f2 + flail);
    ctx.stroke();
    ctx.fillStyle = '#17171a'; ctx.beginPath(); dot(ctx, -0.74 + r4 * 0.08, -f1 - flail, 0.07); dot(ctx, -0.76 + r5 * 0.1, f2 + flail, 0.07); ctx.fill();
    const a1 = (dead ? 0.3 + r3 * 2.3 : 1.2 + flail * 4), a2 = (dead ? 0.3 + r5 * 2.3 : 1.2 - flail * 4);
    const hlx = 0.16 + Math.cos(a1) * 0.42, hly = -0.19 - Math.sin(a1) * 0.42, hrx = 0.16 + Math.cos(a2) * 0.42, hry = 0.19 + Math.sin(a2) * 0.42;
    ctx.strokeStyle = CC.sleeve; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(0.16, -0.18); ctx.lineTo(hlx, hly); ctx.moveTo(0.16, 0.18); ctx.lineTo(hrx, hry); ctx.stroke();
    ctx.fillStyle = CC.skin; ctx.beginPath(); dot(ctx, hlx, hly, 0.065); dot(ctx, hrx, hry, 0.065); ctx.fill();
    ctx.fillStyle = CC.jacket || CC.shirt; oval(ctx, 0, 0, 0.31, 0.2);
    if (outfit === 'suit') { ctx.fillStyle = '#ece8df'; ctx.beginPath(); ctx.moveTo(0.28, -0.07); ctx.lineTo(0.28, 0.07); ctx.lineTo(0.12, 0); ctx.closePath(); ctx.fill(); }
    else if (outfit === 'cop') { ctx.fillStyle = '#e8c35a'; disc(ctx, 0.12, -0.1, 0.035); }
    else if (outfit === 'overalls') { ctx.fillStyle = '#f2f2f2'; oval(ctx, 0.22, 0, 0.06, 0.09); }
    const hy = (r6 - 0.5) * 0.12, down = r1 < 0.35;
    ctx.fillStyle = CC.skin; disc(ctx, 0.44, hy, 0.135);
    if (CC.style !== 'bald') {
      ctx.fillStyle = CC.hair;
      if (down) disc(ctx, 0.45, hy, 0.13);
      else if (CC.style === 'long') oval(ctx, 0.55, hy, 0.14, 0.17);
      else if (CC.style === 'afro') disc(ctx, 0.5, hy, 0.16);
      else oval(ctx, 0.51, hy, 0.08, 0.125);
    }
    if (outfit === 'metal' && !down) { ctx.fillStyle = '#ecebe6'; oval(ctx, 0.4, hy, 0.08, 0.08); }
    if (CC.hat && dead) {   // the hat came off
      const hx2 = 0.8 + r2 * 0.4, hy2 = (r4 - 0.5) * 1.1;
      ctx.fillStyle = CC.hat; disc(ctx, hx2, hy2, CC.hatType === 'fedora' ? 0.2 : CC.hatType === 'bucket' ? 0.18 : 0.13);
      if (CC.hatType === 'russ') { ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(hx2, hy2); ctx.lineTo(hx2 - 0.3, hy2 + 0.15); ctx.stroke(); }
    } else if (CC.hat) { ctx.fillStyle = CC.hat; disc(ctx, 0.47, hy, 0.13); }
    if (lk.acc === 'briefcase' && dead) { ctx.save(); ctx.translate(-0.05 + r5 * 0.4, 0.62 + r6 * 0.25); ctx.rotate(r1 * 3); ctx.fillStyle = '#3a2a1e'; ctx.fillRect(-0.16, -0.05, 0.32, 0.1); ctx.restore(); }
  }
  function drawDive(ctx, lk) {
    ctx.strokeStyle = CC.pants; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(-0.2, -0.08); ctx.lineTo(-0.66, -0.16); ctx.moveTo(-0.2, 0.08); ctx.lineTo(-0.64, 0.12); ctx.stroke();
    ctx.fillStyle = '#17171a'; ctx.beginPath(); dot(ctx, -0.7, -0.16, 0.07); dot(ctx, -0.68, 0.12, 0.07); ctx.fill();
    ctx.strokeStyle = CC.sleeve; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(0.18, -0.17); ctx.lineTo(0.68, -0.16); ctx.moveTo(0.18, 0.17); ctx.lineTo(0.7, 0.13); ctx.stroke();
    ctx.fillStyle = CC.skin; ctx.beginPath(); dot(ctx, 0.7, -0.16, 0.065); dot(ctx, 0.72, 0.13, 0.065); ctx.fill();
    ctx.fillStyle = CC.jacket || CC.shirt; oval(ctx, 0, 0, 0.31, 0.2);
    ctx.fillStyle = CC.skin; disc(ctx, 0.42, 0, 0.13);
    ctx.fillStyle = CC.hat || CC.hair; if (CC.style !== 'bald' || CC.hat) disc(ctx, 0.43, 0, 0.12);
  }
  const SITP = { id: 0, walk: 0 };
  function drawSit(ctx, lk) {
    ctx.strokeStyle = CC.pants; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(0, -0.1); ctx.lineTo(0.45, -0.13); ctx.moveTo(0, 0.1); ctx.lineTo(0.45, 0.13); ctx.stroke();
    ctx.fillStyle = '#17171a'; ctx.beginPath(); dot(ctx, 0.5, -0.13, 0.07); dot(ctx, 0.5, 0.13, 0.07); ctx.fill();
    ctx.strokeStyle = CC.sleeve; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(-0.04, -0.24); ctx.lineTo(-0.3, -0.33); ctx.moveTo(-0.04, 0.24); ctx.lineTo(-0.3, 0.33); ctx.stroke();
    ctx.fillStyle = CC.skin; ctx.beginPath(); dot(ctx, -0.3, -0.33, 0.065); dot(ctx, -0.3, 0.33, 0.065); ctx.fill();
    ctx.fillStyle = CC.jacket || CC.shirt; oval(ctx, -0.05, 0, 0.15, 0.27);
    head(ctx, SITP, lk, '', -0.03, 0, 0);
  }
  function drawCrouch(ctx, p, lk, pose, t) {
    ctx.fillStyle = '#17171a'; ctx.beginPath(); dot(ctx, 0.2, -0.12, 0.07); dot(ctx, 0.2, 0.12, 0.07); ctx.fill();
    ctx.fillStyle = CC.pants; oval(ctx, 0.08, 0, 0.14, 0.2);
    ctx.fillStyle = CC.jacket || CC.shirt; oval(ctx, -0.03, 0, 0.15, 0.25);
    const shake = pose === 'cower' ? Math.sin(t * 30 + p.id) * 0.01 : 0;
    head(ctx, p, lk, '', 0.05 + shake, 0, t);
    ctx.strokeStyle = CC.sleeve; ctx.lineWidth = 0.11; ctx.beginPath();
    const bx = pose === 'beg' ? 0.25 + Math.sin(t * 26 + p.id) * 0.012 : 0;   // begging: hands clasped out in front, shaking
    if (pose === 'cower') { ctx.moveTo(0, -0.22); ctx.lineTo(0.06, -0.08); ctx.moveTo(0, 0.22); ctx.lineTo(0.06, 0.08); }
    else if (pose === 'beg') { ctx.moveTo(0, -0.22); ctx.lineTo(0.12, -0.14); ctx.lineTo(bx, -0.035); ctx.moveTo(0, 0.22); ctx.lineTo(0.12, 0.14); ctx.lineTo(bx, 0.035); }
    else { ctx.moveTo(0, -0.22); ctx.lineTo(0.17, -0.06); ctx.moveTo(0, 0.22); ctx.lineTo(0.17, 0.06); }
    ctx.stroke();
    ctx.fillStyle = CC.skin; ctx.beginPath();
    if (pose === 'cower') { dot(ctx, 0.07, -0.08, 0.06); dot(ctx, 0.07, 0.08, 0.06); } else if (pose === 'beg') { dot(ctx, bx, -0.035, 0.06); dot(ctx, bx, 0.035, 0.06); } else { dot(ctx, 0.17, -0.05, 0.06); dot(ctx, 0.17, 0.05, 0.06); }
    ctx.fill();
  }
  function flames(ctx, x, y, t, k) {
    for (let i = 0, n = LOWD ? 2 : 5; i < n; i++) {
      const a = i * 1.26 + t * 3 + k, r = 0.15 + 0.06 * Math.sin(t * 17 + i * 2 + k);
      ctx.fillStyle = i % 2 ? 'rgba(255,90,20,0.8)' : 'rgba(255,170,40,0.85)';
      disc(ctx, x + Math.cos(a) * 0.17, y + Math.sin(a) * 0.17 - 0.08, r);
    }
    ctx.fillStyle = 'rgba(255,240,150,0.9)'; disc(ctx, x, y - 0.08, 0.11 + 0.04 * Math.sin(t * 23 + k));
  }
  drawPed.owner = 'peds';
  X.drawPed = drawPed;

  function drawDog(ctx, d, t) {
    ctx.save(); ctx.translate(d.x, d.y);
    if ((PG.settings || {}).shadows !== false) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; oval(ctx, 0.06, 0.08, 0.36 * d.sz, 0.17 * d.sz, d.th); }
    ctx.rotate(d.th + (d.knock > 0 ? Math.sin(t * 20) * 0.5 : 0)); ctx.scale(d.sz, d.sz);
    const sit = d.st === 'sit', mv = Math.min(1, d.speed / 1.5), ph = d.walk * 5, g = Math.sin(ph) * 0.07 * mv;
    ctx.lineCap = 'round';
    if (!sit) { ctx.strokeStyle = d.dark; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0.17, -0.08); ctx.lineTo(0.17 + g, -0.13); ctx.moveTo(0.17, 0.08); ctx.lineTo(0.17 - g, 0.13); ctx.moveTo(-0.17, -0.08); ctx.lineTo(-0.17 - g, -0.13); ctx.moveTo(-0.17, 0.08); ctx.lineTo(-0.17 + g, 0.13); ctx.stroke(); }
    const wag = Math.sin(t * (sit ? 3 : 13) + d.wag) * (d.st === 'flee' ? 0.1 : 0.5);
    ctx.strokeStyle = d.col; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(sit ? -0.18 : -0.25, 0); ctx.quadraticCurveTo(-0.38, wag * 0.1, -0.46, wag * 0.2); ctx.stroke();
    ctx.fillStyle = d.col; oval(ctx, sit ? -0.04 : 0, 0, sit ? 0.19 : 0.27, 0.12);
    if (d.spots) { ctx.fillStyle = d.dark; ctx.beginPath(); dot(ctx, -0.08, -0.04, 0.035); dot(ctx, 0.06, 0.05, 0.03); dot(ctx, -0.15, 0.06, 0.025); ctx.fill(); }
    const sniff = d.st === 'sniff' ? 0.04 : 0;
    ctx.fillStyle = d.col; disc(ctx, 0.27 + sniff, 0, 0.1);
    ctx.fillStyle = d.dark; oval(ctx, 0.23 + sniff, -0.085, 0.05, 0.03); oval(ctx, 0.23 + sniff, 0.085, 0.05, 0.03); oval(ctx, 0.37 + sniff, 0, 0.06, 0.045);
    ctx.fillStyle = '#111'; disc(ctx, 0.42 + sniff, 0, 0.022);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(0.15, -0.07, 0.03, 0.14);
    ctx.restore();
  }
  function leash(ctx, d) {
    const o = d.owner; if (!o || o.dead || o.removed || d.st === 'flee') return;
    const c = Math.cos(o.th), s = Math.sin(o.th), ly = -0.33 * d.side;   // the hand on the dog's side
    const hx = o.x + c * 0.05 - s * ly, hy = o.y + s * 0.05 + c * ly;
    const cx = d.x + Math.cos(d.th) * 0.17 * d.sz, cy = d.y + Math.sin(d.th) * 0.17 * d.sz;
    ctx.strokeStyle = '#7a2a24'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + cx) / 2 + 0.08, (hy + cy) / 2 + 0.12, cx, cy); ctx.stroke();
  }
  const PRINTB = [], PRINTC = [];
  for (let k = 0; k <= 16; k++) { PRINTB.push([]); PRINTC.push(`rgba(92,10,12,${(k / 16).toFixed(3)})`); }
  // M: the world transform (the caller puts it back)
  function drawPool(ctx, M, pl, lowD) {
    const age = X.time - pl.t0; if (age < 0) return;
    const g = Math.min(1, age / 7), e = 1 - (1 - g) * (1 - g), r = pl.size * (0.2 + 0.8 * e), sd = pl.seed;
    place(ctx, M, pl.x, pl.y, pl.rot, 1); ctx.globalAlpha = pl.fade;
    ctx.fillStyle = '#4e080b'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.72, 0, 0, TAU);
    for (let i = 0; i < 3; i++) { const a = sd * 9 + i * 2.1, q = r * (0.3 + 0.12 * ((sd * (i + 3) * 7) % 1)); dot(ctx, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.55, q); }
    ctx.fill();
    if (lowD) return;
    ctx.fillStyle = 'rgba(150,18,26,0.55)'; oval(ctx, -r * 0.12, -r * 0.1, r * 0.55, r * 0.34);
    ctx.fillStyle = 'rgba(255,210,210,0.13)'; oval(ctx, -r * 0.3, -r * 0.25, r * 0.16, r * 0.07, 0.4);
  }
  function drawCash(ctx, c, t) {
    if (c.ttl - (X.time - c.t) < 4 && Math.floor(t * 7) % 2 === 0) return;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    if ((PG.settings || {}).shadows !== false) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-0.24, -0.11, 0.5, 0.26); }
    for (let i = 0; i < 2; i++) { ctx.rotate(0.35); ctx.fillStyle = '#3d8b3d'; ctx.fillRect(-0.27, -0.13, 0.5, 0.25); ctx.fillStyle = '#9fe09f'; ctx.fillRect(-0.2, -0.07, 0.36, 0.13); ctx.fillStyle = '#3d8b3d'; disc(ctx, -0.02, 0, 0.05); }
    ctx.restore();
  }

  // ================= the module =================
  X.mod('peds', {
    order: 30,
    init() {
      S = fresh();
      GH.fill(-1); gN = 0;
      buildIndex(); DOORS = new Map();
      setupGangs();
      X.interactions.push(mugInteraction);
      const f = X.focus(), want = targetCount();
      for (let k = 0, n = 0; k < want * 3 && n < want; k++) n += spawnCiv(f, 5, 115, true);
      for (const g of GL) for (let k = 0; k < 3; k++) maybeSpawnGroup(g, f, 40, true);
      S.lastDistrict = X.districtAt(f.x, f.y);
    },
    stop() { if (S) { S.dogs.length = 0; S.groups.length = 0; } S = null; },
    tick(dt) {
      if (!S || !X.city) return;
      const now = performance.now();
      if (S.lastNow) { const fdt = Math.min(0.2, (now - S.lastNow) / 1000); S.ema += (fdt - S.ema) * 0.05; }
      S.lastNow = now;
      if (S.ema > 1 / 42) { S.slowT += dt; if (S.slowT > 3) S.q = 0.75; } else { S.slowT = 0; if (S.ema < 1 / 55) S.q = 1; }
      frameNo++;
      const f = X.focus();
      buildGrid(f);
      buildThreats(f);
      carHits(dt);
      burnFallback(dt);
      corpsePhysics(dt);
      S.popT -= dt; if (S.popT <= 0) { S.popT = 0.25; population(f); }
      S.cleanT -= dt; if (S.cleanT <= 0) { S.cleanT = 0.5; cleanup(f); discoveries(); adoptScan(); }
      S.aimT -= dt; if (S.aimT <= 0) { S.aimT = 0.25; aimScan(); }
      S.crowdT -= dt; if (S.crowdT <= 0) { S.crowdT = 0.5; crowdScan(); }
      S.beatT -= dt; if (S.beatT <= 0) { S.beatT = 0.46; russBeat(); }
      S.gangT -= dt; if (S.gangT <= 0 && !X.scene) { S.gangT = 1.3; const vr = viewR(); for (const g of GL) maybeSpawnGroup(g, f, vr, false); }
      groupsTick(dt);
      for (const g of GL) { if (g.hostileT > 0) g.hostileT -= dt; if (g.respect < 0) g.respect = Math.min(0, g.respect + dt / 25); }
      for (let i = 0, n = X.peds.length; i < n; i++) {
        const p = X.peds[i];
        if (p.removed || p.dead || p.car || p.hidden || !p.ai || p.ai.owner !== 'peds' || p.isPlayer) continue;
        think(p, dt);
      }
      for (const d of S.dogs) if (!d.removed) dogTick(d, dt);
      if (S.dogs.some(d => d.removed)) S.dogs = S.dogs.filter(d => !d.removed);
      poolsTick(dt);
      S.printT -= dt; if (S.printT <= 0) { S.printT = 0.05; footprints(); }
      cashTick();
      if (S.flashes.length && X.time - S.flashes[0].t > 0.3) S.flashes.shift();
      // gangs on the radar, turf notices
      for (const gr of S.groups) {
        const hostile = gr.members.some(hostileM);
        if (Math.abs(gr.x - f.x) < 260 && Math.abs(gr.y - f.y) < 260) X.blip(gr.x, gr.y, hostile && Math.floor(X.time * 4) % 2 ? '#ffffff' : gr.gang.color, { size: hostile ? 3.4 : 2.4, shape: 'square', ring: hostile });
      }
      S.popupT -= dt;
      if (S.popupT <= 0) {
        S.popupT = 0.5;
        const dn = X.scene ? '' : X.districtAt(f.x, f.y);
        if (dn !== S.lastDistrict) {
          S.lastDistrict = dn;
          const g = GL.find(o => o.district === dn);
          if (g) X.popup(g.name + ' turf' + (g.respect <= -30 ? ' · they want you dead' : g.respect >= 30 ? ' · they like you' : ''), 2600);
        }
      }
    },
    render: {
      ground(ctx, view, t) {
        if (!S) return;
        const lowD = (PG.settings || {}).detail === 'low';
        if (S.pools.length) { const M = ctx.getTransform(); for (const pl of S.pools) if (X.inView(pl.x, pl.y, pl.size + 1)) drawPool(ctx, M, pl, lowD); ctx.setTransform(M); ctx.globalAlpha = 1; }
        if (lowD || !S.prints.length) return;
        // bloody footprints: one path per fade level
        for (const b of PRINTB) b.length = 0;
        for (const fp of S.prints) {
          const age = X.time - fp.t; if (age > 30 || !X.inView(fp.x, fp.y, 1)) continue;
          const k = Math.round(fp.a * 0.7 * (1 - age / 30) * 16); if (k > 0) PRINTB[Math.min(16, k)].push(fp);
        }
        for (let k = 1; k <= 16; k++) {
          const B = PRINTB[k]; if (!B.length) continue;
          ctx.fillStyle = PRINTC[k]; ctx.beginPath();
          for (const fp of B) { ctx.moveTo(fp.x + Math.cos(fp.th) * 0.1, fp.y + Math.sin(fp.th) * 0.1); ctx.ellipse(fp.x, fp.y, 0.1, 0.055, fp.th, 0, TAU); }
          ctx.fill();
        }
      },
      bodies(ctx, view, t) {
        if (!S) return;
        for (const c of S.cash) if (X.inView(c.x, c.y, 1)) drawCash(ctx, c, t);
      },
      cars(ctx, view, t) {
        if (!S) return;
        for (const d of S.dogs) if (X.inView(d.x, d.y, 3)) { drawDog(ctx, d, t); leash(ctx, d); }
      },
      peds(ctx, view, t) {
        if (!S) return;
        const nt = night(), lowD = (PG.settings || {}).detail === 'low';
        let lights = 0;
        for (const p of X.peds) {
          const a = p.ai;
          if (!a || a.owner !== 'peds' || p.dead || p.removed || p.hidden || !X.inView(p.x, p.y, 2)) continue;
          if (a.st === 'chat' && !lowD && (p.id + Math.floor(t * 1.5)) % 2) {   // speech dots
            ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath();
            for (let i = 0; i < 3; i++) dot(ctx, p.x - 0.22 + i * 0.2, p.y - 0.62 - (Math.floor(t * 4) % 3 === i ? 0.06 : 0), 0.055);
            ctx.fill();
          }
          if (!lowD && a.lead && a.lead.ai && !a.lead.dead && !a.lead.removed && a.st === 'walk' && a.lead.knock <= 0 && !a.lead.ai.pose) {   // holding hands
            const L2 = a.lead, d = Math.hypot(L2.x - p.x, L2.y - p.y);
            if (d < 1.05) {
              const hx = L2.x - Math.sin(L2.th) * 0.33, hy = L2.y + Math.cos(L2.th) * 0.33, qx = p.x + Math.sin(p.th) * 0.33, qy = p.y - Math.cos(p.th) * 0.33;
              ctx.strokeStyle = p.look.skin || '#e0ac7e'; ctx.lineWidth = 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(qx, qy); ctx.stroke();
            }
          }
          if (nt && lights < 24) {
            const ps = a.pose;
            if (ps === 'phone' || ps === 'call' || ps === 'film') { X.addLight(p.x + Math.cos(p.th) * 0.3, p.y + Math.sin(p.th) * 0.3, 1.6, '#9fd0ff', 0.55); lights++; }
            else if (ps === 'smoke' || (ps === 'cross' && a.gang && a.gang.id === 'mafia')) { X.addLight(p.x + Math.cos(p.th) * 0.25, p.y + Math.sin(p.th) * 0.25, 0.7, '#ff7a28', 0.5 + 0.3 * Math.sin(t * 3 + p.id)); lights++; }
          }
        }
        for (const fl of S.flashes) { const k = 1 - (X.time - fl.t) / 0.3; if (k > 0) X.addLight(fl.x, fl.y, 8, '#ffffff', k); }
      },
      air(ctx, view, t) {
        if (!S) return;
        for (const fl of S.flashes) {
          const k = 1 - (X.time - fl.t) / 0.18; if (k <= 0 || !X.inView(fl.x, fl.y, 3)) continue;
          ctx.fillStyle = `rgba(255,255,255,${(0.85 * k).toFixed(3)})`; disc(ctx, fl.x, fl.y, 0.25 + (1 - k) * 0.9);
        }
      },
      overlay(ctx, view, t) {
        if (!S) return;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const p of X.peds) {
          const a = p.ai;
          if (!a || a.owner !== 'peds' || !(a.alertT > 0) || p.dead || p.removed || !X.inView(p.x, p.y, 2)) continue;
          const y = p.y - 0.95 - Math.abs(Math.sin(t * 9)) * 0.12;
          ctx.font = '900 0.85px Bungee, Impact, sans-serif'; ctx.lineWidth = 0.14; ctx.strokeStyle = '#000'; ctx.strokeText('!', p.x, y);
          ctx.fillStyle = a.type === 'gang' ? '#ff3b2f' : '#ffd23a'; ctx.fillText('!', p.x, y);
        }
      },
    },
  });

  // ================= public API =================
  X.crowd = {
    opts: OPT,
    get stats() { return S ? S.stats : null; },
    get pools() { return S ? S.pools : []; },
    get dogs() { return S ? S.dogs : []; },
    get groups() { return S ? S.groups : []; },
    get cash() { return S ? S.cash : []; },
    get prints() { return S ? S.prints : []; },
    // A civilian of a given type ('walker', 'business', 'jogger', 'old', 'shopper', 'tourist', 'drunk', 'tough', 'dogwalker', 'couple'),
    // put on the sidewalk nearest to (x, y). Returns the ped (the leader for a couple).
    spawn(type, x, y) {
      if (!live()) return null;
      const b = nearestBlock(x, y); if (!b) return null;
      const p = makeCiv(type === 'couple' || type === 'dogwalker' ? 'walker' : type || 'walker', x, y, b);
      if (type === 'dogwalker') { p.ai.type = 'dogwalker'; p.look.acc = 'leash'; p.ai.dog = makeDog(p); }
      if (type === 'couple') {
        p.ai.type = 'couple';
        const q = makeCiv('couple', p.x - Math.sin(p.th) * 0.7, p.y + Math.cos(p.th) * 0.7, b);
        q.ai.lead = p; p.ai.follow = q;
      }
      return p;
    },
    near(x, y, r, fn) {
      const out = [];
      for (const p of X.peds) if (mine(p) && !p.dead && !p.removed && Math.hypot(p.x - x, p.y - y) <= r && (!fn || fn(p))) out.push(p);
      return out;
    },
    count() { let n = 0; for (const p of X.peds) if (mine(p) && !p.dead && !p.removed && p.ai.type !== 'gang') n++; return n; },
    panic(x, y, r, o) { return panic(x, y, r || 25, o); },
    flee(p, x, y, s) { if (mine(p)) startFlee(p, x, y, s || 8, 1, true); },
    fight(p, target) { if (mine(p) && target) { if (X.brawl) X.brawl.fight(p, target); else startFight(p, target); } },
    // Hand one of ours to another module (a taxi fare, a mission target); release() gives it back.
    claim(p, owner, ai) { if (!p || p.dead) return null; if (mine(p)) { endChat(p); if (p.ai.dog) p.ai.dog.owner = null; } p.ai = Object.assign({ owner }, ai); p.pose = null; return p; },
    release(p) { if (p && !p.dead) { p.ai = null; p.pose = null; p._seenFree = -99; } },
    forceCross(p) { if (!mine(p) || !p.ai.blk) return false; corner(p.ai.blk, p.ai.li, p.ai.ci, TMP); return startCross(p, p.ai.ci); },
    drop: (x, y, amount, ttl) => live() ? dropCash(x, y, amount, ttl) : null,
    // A free spot on the sidewalk nearest to a random point rMin..rMax from (x, y): {x, y, b} or null.
    spot: (x, y, rMin, rMax) => live() ? sidewalkSpot(x, y, rMin || 0, rMax || 20) : null,
    // The building doors along the block at (x, y) ({x, y, nx, ny, place?} on the sidewalk); fromDoor(d) has someone step out.
    doors(x, y) { const b = live() && nearestBlock(x, y); return b ? doorsOf(b).slice() : []; },
    fromDoor(d) { const b = live() && nearestBlock(d.x, d.y); return b ? doorPed(b, d, null) : 0; },
    mugTarget,
    drawDog,
  };
  X.gangs = {
    list: [],
    get(id) { return GL.find(g => g.id === id) || null; },
    at(x, y) { return gangAt(x, y); },
    members(id) { const g = typeof id === 'string' ? this.get(id) : id; return X.peds.filter(p => mine(p) && p.ai.gang === g && !p.dead && !p.removed); },
    spawnGroup(id, x, y, n) { const g = typeof id === 'string' ? this.get(id) : id; return live() && g ? spawnGroup(g, x, y, n || 3) : null; },
    provoke(id, target, x, y) { const g = typeof id === 'string' ? this.get(id) : id; target = target || P.ped; return provoke(g, target, x == null ? target.x : x, y == null ? target.y : y); },
    addRespect(id, n) { addRespect(typeof id === 'string' ? this.get(id) : id, n); },
    hostile(id) { const g = typeof id === 'string' ? this.get(id) : id; return !!g && (g.respect <= -30 || g.hostileT > 0); },
  };
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
