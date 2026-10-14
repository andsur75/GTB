// Ambient world details for Grand Theft Bus: the city keeps living between the crimes. Traffic lights at
// the junctions (signal heads on mast arms, stop lines, crossings that tick; lane traffic queues on red
// through X.trafficRules and never stops inside a junction), weather that changes by itself (clear, rain,
// thunderstorm, fog, the odd Norwegian snowfall: screen rain and flakes, splashes, dark wet roads with
// light reflections and puddles, snow on the roofs and slush in the lanes, less grip, umbrellas, haze,
// lightning that sometimes strikes close by, thunder), pigeon flocks that scatter from people, cars,
// gunfire and blasts and land again (on the roofs too), gulls over the harbour, alley cats you can pet,
// street furniture (fire hydrants that gush when knocked over, bins, benches, mailboxes, newspaper boxes,
// bus shelters, parking meters that spill coins, steaming manholes, litter in the wind, billboards on the
// roofs), car alarms, an elevated metro line with a station and a train every minute or so, moths round
// the lamps, and a quiet soundscape (rain, wind, traffic hum, distant sirens, dogs, crickets, the church
// bell, the train). Exposes X.ambient (weather, signalAt, canCross, setWeather, ...); emits 'weather',
// 'propSmashed', 'carAlarm', 'lightningStrike'.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const sstep = (a, b, x) => { const k = cl((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const hsh = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const mkR = seed => { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => (s = (s * 48271) % 2147483647) / 2147483647; };
  const CELL = 32, ck = (x, y) => (Math.floor(x / CELL) + 64) * 4096 + Math.floor(y / CELL) + 64;

  let S = null;   // per-game state (init)
  const OFF = {};  // feature switches (profiling, low quality): fogBanks, vignette, streaks, splashes, reflections, halos, emissive
  const api = X.ambient = {
    weather: 'clear', rain: 0, fog: 0, wet: 0, snow: 0, cover: 0, wind: { x: 0.6, y: 0.2 }, night: 0, quality: 'high',
    get stats() { return S ? S.stats : null; },
    get signals() { return S ? S.sigList : []; },
    get props() { return S ? S.props : []; },
    get flocks() { return S ? S.flocks : []; },
    get cats() { return S ? S.cats : []; },
    get coins() { return S ? S.coins : []; },
    get alarms() { return S ? S.alarms : []; },
    get boards() { return S ? S.boards : []; },
    get line() { return S ? S.line : null; },
    get train() { return S ? S.train : null; },
    get litter() { return S ? S.litter : []; },
    get gulls() { return S ? S.gulls : []; },
    get strikes() { return S ? S.strikes : []; },
    off: OFF,
  };

  function fresh() {
    return {
      sig: new Map(), sigList: [], force: new Map(),
      W: { kind: 'clear', t: 0, dur: 120, rain: 0, fog: 0, wet: 0, snow: 0, cover: 0, tRain: 0, tFog: 0, tSnow: 0, wa: rand(0, TAU), ws: 1, gust: 0, gustT: 0, flash: 0, nextBolt: 8, flashes: [], thunder: [] },
      props: [], grid: new Map(), loose: [], runs: [], stops: [], manholes: [], mgrid: new Map(), puddles: [], pgrid: new Map(), boards: [],
      lampG: new Map(), lampCol: null, dgrid: new Map(),
      flocks: [], cats: [], litter: [], coins: [], alarms: [], strikes: [], gulls: [], gullT: 0,
      line: null, train: null, trainT: rand(8, 20), trainDir: Math.random() < 0.5 ? 1 : -1,
      snd: { siren: rand(30, 70), dog: rand(10, 30), coo: rand(3, 8), hour: -1, clack: 0, horned: false, cricket: 1, tick: 0, gull: rand(3, 8) },
      meleeCd: 0, steamAcc: 0, sprayAcc: 0, splashAcc: 0, scanT: 0, started: false, dark: 0, vrot: 0, low: false, ema: 1 / 60, lastT: 0, slowT: 0, fastT: 0,
      stats: { smashed: 0, hydrants: 0, dropped: 0, coins: 0, coinCash: 0, scares: 0, trains: 0, alarms: 0, bolts: 0, strikes: 0, splashes: 0, pets: 0, fed: 0, stopsHeld: 0, ticks: 0, crickets: 0 },
    };
  }

  // ================= particles (fixed pool) =================
  const NQ = 900, K_STEAM = 1, K_WATER = 2, K_SPRAY = 3, K_PAPER = 4, K_CRUMB = 5, K_BIT = 6;
  const QK = new Uint8Array(NQ), QC = new Uint8Array(NQ);
  const QX = new Float32Array(NQ), QY = new Float32Array(NQ), QZ = new Float32Array(NQ), QVX = new Float32Array(NQ), QVY = new Float32Array(NQ), QVZ = new Float32Array(NQ);
  const QL = new Float32Array(NQ), QM = new Float32Array(NQ), QS = new Float32Array(NQ), QR = new Float32Array(NQ), QVR = new Float32Array(NQ);
  let qCur = 0;
  function qEmit(k, x, y, z, vx, vy, vz, life, size, col) {
    const i = qCur; qCur = qCur + 1 === NQ ? 0 : qCur + 1;
    QK[i] = k; QX[i] = x; QY[i] = y; QZ[i] = z; QVX[i] = vx; QVY[i] = vy; QVZ[i] = vz; QL[i] = life; QM[i] = life; QS[i] = size; QR[i] = Math.random() * TAU; QVR[i] = rand(-8, 8); QC[i] = col || 0;
  }
  const BITC = ['#f2f2ee', '#e8e2c8', '#9fc6d9', '#6b4a2b', '#c0392b', '#3a7d44', '#d8c08a', '#2b2d33'];   // paper, newsprint, glass, soil, red, leaf, crumb, dark
  function qTick(dt) {
    const wx = api.wind.x, wy = api.wind.y;
    for (let i = 0; i < NQ; i++) {
      const k = QK[i]; if (!k) continue;
      QL[i] -= dt; if (QL[i] <= 0) { QK[i] = 0; continue; }
      if (k === K_STEAM) { const a = 1 - Math.exp(-dt * 0.9); QVX[i] += (wx * 0.7 - QVX[i]) * a; QVY[i] += (wy * 0.7 - QVY[i]) * a; }
      else if (k === K_SPRAY) { const a = Math.exp(-dt * 3); QVX[i] *= a; QVY[i] *= a; }
      else if (k === K_PAPER) {
        const a = 1 - Math.exp(-dt * 1.4), fl = QZ[i] > 0.05 ? 1 : 0.25;
        QVX[i] += (wx * 1.4 * fl - QVX[i]) * a; QVY[i] += (wy * 1.4 * fl - QVY[i]) * a;
        QVZ[i] -= 2.2 * dt; QZ[i] = Math.max(0, QZ[i] + QVZ[i] * dt); if (QZ[i] <= 0) { QVZ[i] = 0; QVR[i] *= Math.exp(-dt * 4); }
        QR[i] += QVR[i] * dt;
      } else {   // water, crumbs, bits: ballistic
        QVZ[i] -= 9.8 * dt; QZ[i] += QVZ[i] * dt; QR[i] += QVR[i] * dt;
        if (QZ[i] < 0) {
          QZ[i] = 0;
          if (k === K_WATER) { if (QL[i] > 0.12) QL[i] = 0.12; QVX[i] *= 0.2; QVY[i] *= 0.2; QVZ[i] = 0; }
          else { QVZ[i] = -QVZ[i] * 0.3; QVX[i] *= 0.55; QVY[i] *= 0.55; QVR[i] *= 0.5; }
        }
      }
      QX[i] += QVX[i] * dt; QY[i] += QVY[i] * dt;
    }
  }

  // ================= sprites =================
  let SPR = null;
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function radial(n, stops) {
    const c = canvas(n, n), g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    g.fillStyle = gr; g.fillRect(0, 0, n, n); return c;
  }
  const TINTS = new Map();
  function tinted(src, col) {
    const key = col + (src === SPR.streak ? 's' : 'g');
    let c = TINTS.get(key); if (c) return c;
    c = canvas(src.width, src.height); const g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    TINTS.set(key, c); return c;
  }
  function fogTex(rgb) {
    const N = 256, c = canvas(N, N), g = c.getContext('2d'), R = mkR(77);
    for (let k = 0; k < 46; k++) {
      const x = R() * N, y = R() * N, r = 18 + R() * 60, a = 0.05 + R() * 0.12;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        if (x + ox + r < 0 || x + ox - r > N || y + oy + r < 0 || y + oy - r > N) continue;
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    return c;
  }
  function sprites() {
    if (SPR) return SPR;
    SPR = {
      soft: radial(64, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]),
      glow: radial(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]),
      vigL: radial(128, [[0, 'rgba(196,202,210,0)'], [0.45, 'rgba(196,202,210,0.15)'], [1, 'rgba(196,202,210,0.95)']]),
      vigD: radial(128, [[0, 'rgba(36,42,56,0)'], [0.45, 'rgba(36,42,56,0.15)'], [1, 'rgba(36,42,56,0.95)']]),
    };
    // a long soft streak (light reflected on a wet road), unit = 1 wide x 4 long
    const st = canvas(32, 128), g = st.getContext('2d');
    for (let y = 0; y < 128; y++) {
      const v = y / 127, a = Math.pow(1 - Math.abs(v - 0.25) / (v < 0.25 ? 0.25 : 0.75), 1.6);
      const gr = g.createLinearGradient(0, 0, 32, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, y, 32, 1);
    }
    SPR.streak = st;
    SPR.fogL = fogTex('210,214,222'); SPR.fogD = fogTex('44,50,66');
    return SPR;
  }

  // ================= traffic lights =================
  const AMB = 2.6, ALLRED = 1.6, GRN = 0, AMBR = 1, RED = 2, SIGNAME = ['green', 'amber', 'red'];
  const LAMPC = ['#3dff7a', '#ffb020', '#ff3a2a'], LAMPD = ['#0f2a18', '#33270c', '#3a1210'];
  function buildSignals(R) {
    const C = X.city;
    for (let i = 1; i < C.xs.length - 1; i++) for (let j = 1; j < C.ys.length - 1; j++) {
      const avH = C.wy[j] >= 20, avV = C.wx[i] >= 20;
      if (!avH && !avV && R() < 0.3) continue;
      const gh = avH ? (avV ? 11 : 13) : (avV ? 7 : 9), gv = avV ? (avH ? 11 : 13) : (avH ? 7 : 9), T = gh + gv + 2 * (AMB + ALLRED);
      const s = { i, j, key: i * 64 + j, x: C.xs[i], y: C.ys[j], hw: C.wy[j], vw: C.wx[i], gh, gv, T, off: R() * T, h: GRN, v: RED, left: 0, hs: 0, vs: 99, ft: -1 };
      S.sig.set(s.key, s); S.sigList.push(s);
    }
  }
  function sigUpdate(s) {
    if (s.ft === X.time) return s;
    s.ft = X.time;
    const f = S.force.get(s.key);
    if (f) { if (s.h !== f.h) s.hs = 0; if (s.v !== f.v) s.vs = 0; s.h = f.h; s.v = f.v; s.left = 99; return s; }
    const t = (X.time + s.off) % s.T, a = s.gh, b = a + AMB, c = b + ALLRED, d = c + s.gv, e = d + AMB;
    s.hs = s.vs = 99;
    if (t < a) { s.h = GRN; s.v = RED; s.left = a - t; s.hs = t; }
    else if (t < b) { s.h = AMBR; s.v = RED; s.left = b - t; }
    else if (t < c) { s.h = RED; s.v = RED; s.left = c - t; }
    else if (t < d) { s.h = RED; s.v = GRN; s.left = d - t; s.vs = t - c; }
    else if (t < e) { s.h = RED; s.v = AMBR; s.left = e - t; }
    else { s.h = RED; s.v = RED; s.left = s.T - t; }
    return s;
  }
  // How far the front of a lane car is from the stop line of the junction its lane runs into
  // (negative = past it), with the signal and axis; null while it is turning inside a junction.
  // A lane leg is one straight segment followed by one junction move: segs.length is 2 on the straight.
  function laneLight(a) {
    if (!a.segs || a.segs.length !== 2) return null;
    const s = S.sig.get(a.ni * 64 + a.nj); if (!s) return null;
    const g = a.segs[0], p0 = g.p0, p2 = g.p2, horiz = Math.abs(p2.x - p0.x) > Math.abs(p2.y - p0.y);
    if (Math.abs(horiz ? p2.x - s.x : p2.y - s.y) > 20) return null;
    sigUpdate(s);
    return { s, horiz, dist: (1 - a.t) * g.len - a.len / 2 - 2.6 };
  }
  function lightRule(a) {
    if (!S || a.siren || a.ignoreLights || !a.segs || a.segs.length !== 2) return null;
    const s = S.sig.get(a.ni * 64 + a.nj); if (!s) return null;
    const g = a.segs[0], p0 = g.p0, p2 = g.p2, horiz = Math.abs(p2.x - p0.x) > Math.abs(p2.y - p0.y);
    if (Math.abs(horiz ? p2.x - s.x : p2.y - s.y) > 20) return null;
    sigUpdate(s);
    const st = horiz ? s.h : s.v, since = horiz ? s.hs : s.vs, dist = (1 - a.t) * g.len - a.len / 2 - 2.6;
    if (dist < 75 && (st !== GRN || since < 4)) a.wait = 0;   // queueing at a light is not a jam: no honks, no ghosting
    if (st === GRN || dist > 95 || dist < -1.5) return null;
    const v = a.v;
    if (dist < v * v / (st === AMBR ? 9 : 14) - 0.3) return null;   // too late to stop: clear the junction
    if (dist <= 0) { S.stats.stopsHeld++; return 0; }
    return Math.min(Math.sqrt(8 * dist), 1.2 * dist + 0.15);
  }
  function weatherRule(a) {
    const W = S && S.W; if (!W) return null;
    const k = (W.cover > 0.4 ? 0.78 : W.wet > 0.45 ? 0.86 : 1) * (W.fog > 0.45 ? 0.85 : 1);
    return k < 1 ? a.cruise * (a.cruiseMul || 1) * k : null;
  }
  api.signalAt = function (x, y) {
    if (!S || !X.city || X.scene) return null;
    const n = X.nearestNode(x, y), s = S.sig.get(n.i * 64 + n.j); if (!s) return null;
    if (Math.abs(x - s.x) > s.vw / 2 + 9 || Math.abs(y - s.y) > s.hw / 2 + 9) return null;
    sigUpdate(s);
    // walkH: safe to walk over the east-west road (its traffic is held), walkV: over the north-south road
    return { i: s.i, j: s.j, x: s.x, y: s.y, h: SIGNAME[s.h], v: SIGNAME[s.v], left: s.left, walkH: s.h === RED, walkV: s.v === RED };
  };
  // A crossing from (x0, y0) to (x1, y1) at a signalled junction: true = walk, false = wait, null = no signal.
  api.canCross = function (x0, y0, x1, y1) {
    const q = api.signalAt((x0 + x1) / 2, (y0 + y1) / 2); if (!q) return null;
    return Math.abs(x1 - x0) > Math.abs(y1 - y0) ? q.walkV : q.walkH;
  };
  api.forceSignal = function (i, j, h, v) {
    if (!S) return false;
    const key = i * 64 + j; if (!S.sig.has(key)) return false;
    const id = q => (typeof q === 'number' ? q : SIGNAME.indexOf(q));
    if (h == null) S.force.delete(key); else S.force.set(key, { h: id(h), v: id(v == null ? (id(h) === GRN ? RED : GRN) : v) });
    S.sig.get(key).ft = -1;
    return true;
  };
  api.stopLine = function (car) { if (!S || !car || car.ctrl !== 'path') return null; const r = laneLight(car); return r ? { dist: r.dist, i: r.s.i, j: r.s.j, horiz: r.horiz, light: SIGNAME[r.horiz ? r.s.h : r.s.v] } : null; };

  // ================= weather =================
  const WK = {
    clear: { rain: 0, fog: 0, dur: [100, 210], wind: [0.6, 1.6] },
    rain: { rain: 0.5, fog: 0.06, dur: [60, 130], wind: [1, 2] },
    storm: { rain: 1, fog: 0.14, dur: [45, 100], wind: [2.6, 4.2] },
    fog: { rain: 0, fog: 0.85, dur: [60, 130], wind: [0.15, 0.4] },
    snow: { rain: 0, fog: 0.22, snow: 1, dur: [60, 120], wind: [0.3, 1.1] },
  };
  const WX_LINES = {
    clear: ['The rain stops. The puddles stay.', 'Clear skies over Bussby.', 'The fog lifts. Everybody can see you again.'],
    rain: ['Rain. Grip is now a suggestion.', 'Rain. The city smells of wet asphalt and bad decisions.', 'Light rain. The umbrellas come out.'],
    storm: ['Thunderstorm! Brake early. Or do not.', 'Storm warning from the fjord. Stay away from tall buses.'],
    fog: ['Fog rolling in from the fjord.', 'Thick fog. The cops cannot see you. You cannot see anything.'],
    snow: ['Snow in Bussby! Summer tyres, obviously.', 'It is snowing. Every driver in town just forgot how to drive.'],
  };
  function setWeather(kind, instant) {
    if (!S) return false;
    if (!WK[kind]) kind = 'clear';
    const W = S.W, d = WK[kind], prev = W.kind;
    W.kind = kind; W.t = 0; W.dur = rand(d.dur[0], d.dur[1]); W.tRain = d.rain; W.tFog = d.fog; W.tSnow = d.snow || 0; W.tWind = rand(d.wind[0], d.wind[1]);
    if (instant) { W.rain = d.rain; W.fog = d.fog; W.snow = W.tSnow; W.wet = d.rain > 0 ? 1 : 0; W.cover = W.tSnow > 0 ? 1 : 0; W.ws = W.tWind; }
    W.nextBolt = rand(2.5, 8);
    api.weather = kind;
    if (prev !== kind) {
      X.emit('weather', { kind, prev });
      if (!instant && S.started && !X.scene && P.state === 'play') X.popup(pick(WX_LINES[kind]), 3200);
    }
    return true;
  }
  api.setWeather = setWeather;
  function nextKind(k) {
    const r = Math.random();
    if (k === 'clear') return r < 0.38 ? 'rain' : r < 0.63 ? 'fog' : r < 0.77 ? 'storm' : r < 0.88 ? 'snow' : 'clear';
    if (k === 'rain') return r < 0.3 ? 'storm' : r < 0.85 ? 'clear' : 'fog';
    if (k === 'storm') return r < 0.6 ? 'rain' : 'clear';
    if (k === 'snow') return r < 0.6 ? 'clear' : r < 0.85 ? 'fog' : 'rain';
    return r < 0.7 ? 'clear' : r < 0.9 ? 'rain' : 'snow';
  }
  function weatherTick(dt) {
    const W = S.W;
    W.t += dt; if (W.t > W.dur) setWeather(nextKind(W.kind));
    W.rain += cl(W.tRain - W.rain, -dt * 0.07, dt * 0.07);
    W.fog += cl(W.tFog - W.fog, -dt * 0.05, dt * 0.05);
    W.wet = W.rain > 0.05 ? Math.min(1, W.wet + dt * (0.03 + W.rain * 0.08)) : Math.max(0, W.wet - dt * 0.011);
    W.snow += cl(W.tSnow - W.snow, -dt * 0.06, dt * 0.06);
    W.cover = W.snow > 0.05 ? Math.min(1, W.cover + dt * W.snow * 0.035) : Math.max(0, W.cover - dt * (W.rain > 0.1 ? 0.03 : 0.006));
    // wind: a slow turning direction, strength easing to the weather's, gusts on top
    W.wa += (Math.sin(X.time * 0.05) * 0.04 + (Math.random() - 0.5) * 0.02) * dt * 10;
    W.ws += ((W.tWind || 1) - W.ws) * dt * 0.1;
    W.gustT -= dt; if (W.gustT <= 0) { W.gustT = rand(3, 9); W.gustK = rand(0.4, 1.4) * (W.kind === 'storm' ? 1.4 : 1); }
    W.gust += ((W.gustK || 0) * (W.gustT > 1.5 ? 1 : 0) - W.gust) * dt * 0.8;
    const ws = W.ws * (1 + W.gust * 0.8);
    api.wind.x = Math.cos(W.wa) * ws; api.wind.y = Math.sin(W.wa) * ws;
    // lightning: a few flickers, the thunder a little later
    if (W.kind === 'storm' && W.rain > 0.6) { W.nextBolt -= dt; if (W.nextBolt <= 0) bolt(); }
    for (let k = W.flashes.length - 1; k >= 0; k--) {
      const f = W.flashes[k]; if (f.t > X.time) continue;
      W.flash = Math.max(W.flash, f.k); if (X.lighting && X.lighting.flash && !X.scene) X.lighting.flash(f.k * 0.8);
      W.flashes.splice(k, 1);
    }
    for (let k = W.thunder.length - 1; k >= 0; k--) { const th = W.thunder[k]; if (th.t > X.time) continue; sfxThunder(th.k); W.thunder.splice(k, 1); }
    W.flash = Math.max(0, W.flash - dt * 4.5);
    api.rain = W.rain; api.fog = W.fog; api.wet = W.wet; api.snow = W.snow; api.cover = W.cover;
  }
  function bolt(hit) {
    const W = S.W; W.nextBolt = rand(6, 18); S.stats.bolts++;
    const n = Math.random() < 0.6 ? 3 : 2, near = Math.random();
    for (let k = 0; k < n; k++) W.flashes.push({ t: X.time + k * rand(0.06, 0.14), k: k === 0 ? 0.9 : rand(0.4, 0.75) });
    if (hit || (Math.random() < 0.28 && !X.scene)) { if (strike()) return; }
    W.thunder.push({ t: X.time + 0.25 + near * 2.4, k: 1 - near * 0.6 });
  }
  api.lightning = function (hit) { if (S) bolt(hit); };
  // A bolt that comes down close by: a tree (it may catch fire), a street lamp (it pops) or the bare street.
  function strike() {
    const f = X.focus(), C = X.city; let tx = 0, ty = 0, lamp = null, tree = null;
    const r = Math.random();
    if (r < 0.45) { let bd = 1e9; for (const tr of C.trees) { if (tr.gone || tr.burnt || tr.burning) continue; const d = Math.hypot(tr.x - f.x, tr.y - f.y); if (d > 10 && d < 42 && d < bd) { bd = d; tree = tr; } } }
    if (!tree && r < 0.8) eachCell(S.lampG, f.x, f.y, 40, l => { if (!lamp && !l.broken && Math.hypot(l.x - f.x, l.y - f.y) > 10) lamp = l; });
    if (tree) { tx = tree.x; ty = tree.y; }
    else if (lamp) { tx = lamp.x + lamp.nx * 1.2; ty = lamp.y + lamp.ny * 1.2; }
    else {
      let ok = false;
      for (let k = 0; k < 8 && !ok; k++) { const a = rand(0, TAU), d = rand(14, 36); tx = f.x + Math.cos(a) * d; ty = f.y + Math.sin(a) * d; ok = !X.blocked(tx, ty, 0.5); }
      if (!ok) return false;
    }
    const R = mkR(Math.floor(Math.random() * 1e6) + 1), arms = [];
    for (let k = 0, n = 4 + Math.floor(R() * 3); k < n; k++) {   // the scorch pattern spreading over the ground
      const pts = [], a0 = R() * TAU; let x = tx, y = ty, a = a0;
      for (let q = 0; q < 5; q++) { a += (R() - 0.5) * 1.2; const l = 0.6 + R() * 1.1; x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push(x, y); }
      arms.push(pts);
    }
    S.strikes.push({ x: tx, y: ty, t: X.time, arms, seed: R() });
    if (S.strikes.length > 4) S.strikes.shift();
    S.stats.strikes++;
    S.W.flash = 1; if (X.lighting && X.lighting.flash) X.lighting.flash(1);
    G().shake = Math.max(G().shake, 0.4);
    PG.burst(tx, ty, 'spark', 46, 13, 0.6, 0.12);
    X.decal(tx, ty, 'scorch', 1.7);
    if (lamp) { lamp.broken = true; X.decal(tx, ty, 'glass', 1); X.emit('lampBroken', { lamp, by: null }); }
    if (tree && X.fireAt) X.fireAt(tree.x + 1.1, tree.y + 0.3, { r: 1, life: 6 });
    for (const p of X.peds) {
      if (p.dead || p.hidden || p.car || p.removed) continue;
      const d = Math.hypot(p.x - tx, p.y - ty); if (d > 2.6) continue;
      p.knock = Math.max(p.knock || 0, 0.9); p.vx += (p.x - tx) / (d || 1) * 7; p.vy += (p.y - ty) / (d || 1) * 7; p.spin = rand(-10, 10);
      X.damagePed(p, 30 * (1 - d / 3), null, 'fire');
    }
    for (const c of X.cars) if (!c.removed && Math.hypot(c.x - tx, c.y - ty) < 3) { X.damageCar(c, 90, null, 'explosion'); if (idleCar(c)) startAlarm(c); }
    scareAll(tx, ty, 55, true);
    S.snd.dog = Math.min(S.snd.dog, rand(0.6, 1.8));
    sfxThunder(1.15);
    X.emit('lightningStrike', { x: tx, y: ty, tree, lamp });
    return true;
  }
  // wet roads: less grip for every car. A factor on top of whatever else set c.mu; police stingers save
  // and restore c.mu around a flat (c._polMu), so the saved value gets the same factor.
  function gripTick() {
    const f = S.W.cover > 0.3 ? 0.72 : S.W.wet > 0.3 ? 0.85 : 1;
    for (const c of X.cars) {
      const g = c._ambMu || 1; if (g === f) continue;
      const k = f / g, rnd = v => Math.round(v * 1e6) / 1e6;
      c.mu = rnd((c.mu == null ? 1 : c.mu) * k); if (c._polMu != null) c._polMu = rnd(c._polMu * k);
      c._ambMu = f;
    }
  }

  // ================= street furniture =================
  // knockV: speed (m/s) a car needs to send it flying; slower cars just bump into it.
  const PT = {
    hydrant: { r: 0.27, knockV: 3, dmg: 16, slow: 0.9 },
    meter: { r: 0.15, knockV: 2.4, dmg: 5, slow: 0.97, hp: 30 },
    bin: { r: 0.34, knockV: 2.2, dmg: 4, slow: 0.97, hp: 25 },
    mailbox: { w: 0.62, h: 0.52, knockV: 3.2, dmg: 8, slow: 0.95, hp: 50 },
    newsbox: { w: 0.62, h: 0.5, knockV: 2.8, dmg: 5, slow: 0.96, hp: 30 },
    bench: { w: 2.0, h: 0.62, knockV: 4.2, dmg: 14, slow: 0.92, hp: 80 },
    busstop: { w: 3.6, h: 1.0, knockV: 5.5, dmg: 22, slow: 0.9, hp: 40 },
  };
  const METER_D = { Parkingdal: 0.85, 'Bank Row': 0.55, 'Neon Mile': 0.45, Tolltown: 0.5, 'Tesla Flats': 0.35 };
  function lampsBuild() {
    const C = X.city;
    for (const l of C.lamps) { const k = ck(l.x, l.y); let a = S.lampG.get(k); if (!a) S.lampG.set(k, a = []); a.push(l); }
    S.lampCol = C.lamps.map(l => { const d = X.districtAt(l.x, l.y); return d === 'Tesla Flats' ? '#dfeaff' : d === 'Neon Mile' ? '#ff9ad8' : '#ffb766'; });
    S.lampIdx = new Map(C.lamps.map((l, i) => [l, i]));
  }
  function nearLamp(x, y, d) {
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const a = S.lampG.get(ck(x + gx * CELL, y + gy * CELL)); if (!a) continue;
      for (const l of a) if (Math.abs(l.x - x) < d && Math.abs(l.y - y) < d) return true;
    }
    return false;
  }
  function gridAdd(grid, o) { const k = ck(o.x, o.y); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(o); o.cell = k; }
  function gridDel(grid, o) { const a = grid.get(o.cell); if (!a) return; const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); }
  function propNear(x, y, d) {
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const a = S.grid.get(ck(x + gx * CELL, y + gy * CELL)); if (!a) continue;
      for (const p of a) if (Math.abs(p.x - x) < d + (p.pw || 0) / 2 && Math.abs(p.y - y) < d + (p.ph || 0) / 2) return true;
    }
    return false;
  }
  function okSpot(x, y, r, w, h) {
    const C = X.city;
    if (x < 12 || y < 12 || x > C.W - 12 || y > C.H - 12) return false;
    if (X.blocked(x, y, r + 0.2)) return false;
    if (w && (X.blocked(x - w / 2, y - h / 2, 0.25) || X.blocked(x + w / 2, y + h / 2, 0.25) || X.blocked(x - w / 2, y + h / 2, 0.25) || X.blocked(x + w / 2, y - h / 2, 0.25))) return false;
    if (nearLamp(x, y, 1.3 + (w || 0) / 2)) return false;
    let door = false;   // keep every door clear (people come and go through them)
    eachCell(S.dgrid, x, y, 5 + (w || 0) / 2 + (h || 0) / 2, d => { if (Math.abs(d.x - x) < 2.6 + (w || 0) / 2 && Math.abs(d.y - y) < 2.6 + (h || 0) / 2) door = true; });
    if (door) return false;
    for (const id in X.places) { const pd = X.places[id].pad; if (pd && Math.abs(pd.x - x) < pd.w / 2 + 2 && Math.abs(pd.y - y) < pd.h / 2 + 2) return false; }
    for (const c of X.cars) if (!c.removed && Math.abs(c.x - x) < c.len / 2 + 1.2 && Math.abs(c.y - y) < c.len / 2 + 1.2) return false;
    if (propNear(x, y, 1.6 + r)) return false;
    return true;
  }
  function octagon(x, y, r) { const o = []; for (let k = 0; k < 8; k++) o.push({ x: x + Math.cos(k * Math.PI / 4 + Math.PI / 8) * r, y: y + Math.sin(k * Math.PI / 4 + Math.PI / 8) * r }); return o; }
  function makeSolid(p) {
    p.solid = { kind: 'street', amb: p, poly: p.r ? octagon(p.x, p.y, p.r) : PG.obb(p.x, p.y, p.pw, p.ph, 0) };
    PG.cityPut(X.city, p.solid);
  }
  function addProp(type, x, y, nx, ny, R, o) {
    const d = PT[type], vert = nx !== 0;   // vert: the kerb runs north-south
    const pw = d.w ? (vert ? d.h : d.w) : 0, ph = d.w ? (vert ? d.w : d.h) : 0;
    if (!okSpot(x, y, d.r || Math.min(pw, ph) / 2, pw, ph)) return null;
    const p = Object.assign({ type, x, y, hx: x, hy: y, nx, ny, r: d.r || 0, pw, ph, st: 0, hp: d.hp || 999, solid: null, seed: R(), rot: 0, vx: 0, vy: 0, vr: 0, downT: 0, gush: 0, hitT: -9, cell: 0, paid: 0 }, o);
    if (type === 'meter') p.expired = R() < 0.45;
    makeSolid(p); gridAdd(S.grid, p); S.props.push(p);
    return p;
  }
  function blockSidePoint(b, side, u, ins) {
    if (side === 0) return { x: b.x0 + u, y: b.y0 + ins, nx: 0, ny: -1 };
    if (side === 1) return { x: b.x0 + u, y: b.y1 - ins, nx: 0, ny: 1 };
    if (side === 2) return { x: b.x0 + ins, y: b.y0 + u, nx: -1, ny: 0 };
    return { x: b.x1 - ins, y: b.y0 + u, nx: 1, ny: 0 };
  }
  function placeProps(R) {
    const C = X.city;
    for (const b of C.blocks) {
      const dn = X.districtAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), meterK = METER_D[dn] == null ? 0.16 : METER_D[dn];
      for (let side = 0; side < 4; side++) {
        const L = side < 2 ? b.x1 - b.x0 : b.y1 - b.y0; if (L < 24) continue;
        const at = (u, ins) => blockSidePoint(b, side, u, ins);
        const put = (type, u, ins, o) => { const q = at(u, ins); return addProp(type, q.x, q.y, q.nx, q.ny, R, o); };
        const nh = L > 110 ? 2 : L > 40 ? 1 : 0;
        for (let k = 0; k < nh; k++) put('hydrant', cl(L * (k + 0.5) / nh + R() * 14 - 7, 8, L - 8), 0.6);
        if (R() < 0.6) put('bin', 8.5 + R() * 4, 1.6);
        if (R() < 0.45) put('bin', L - 8.5 - R() * 4, 1.6);
        if (R() < 0.22) put('mailbox', 10 + R() * (L - 20), 1.8);
        if (R() < 0.2) put('newsbox', R() < 0.5 ? 12.5 : L - 12.5, 1.8);
        if (R() < meterK && L > 40) {   // a row of parking meters with painted bays: a nod to the parking game
          const n = 3 + Math.floor(R() * 4), sp = 6.2, u0 = 10 + R() * Math.max(0, L - 20 - (n - 1) * sp), run = { side, pts: [] };
          for (let k = 0; k < n; k++) { const m = put('meter', u0 + k * sp, 1.65); if (m) run.pts.push(m); }
          if (run.pts.length > 1) S.runs.push(run);
        }
        const q = at(L / 2, -2), rd = X.roadAt(q.x, q.y);
        if (rd && rd.w >= 20 && R() < 0.3) {
          const u = L * (0.3 + R() * 0.4), sh = put('busstop', u, 4.05);
          if (sh) { const k2 = at(u, 0.45); sh.sx = k2.x; sh.sy = k2.y; S.stops.push(sh); }
        }
        if (b.kind === 'city' && R() < 0.3) put('bench', 10 + R() * (L - 20), 3.95);
      }
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (b.kind === 'plaza') {
        const f = C.fountains.find(f => Math.abs(f.x - cx) < 1 && Math.abs(f.y - cy) < 1), fr = f ? f.r : 4.2;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, d = fr + 3.4; addProp('bench', cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.round(Math.cos(a)), Math.round(Math.sin(a)), R); }
        addProp('bin', cx + fr + 3.4, cy + fr + 3.4, 1, 0, R); addProp('bin', cx - fr - 3.4, cy - fr - 3.4, -1, 0, R);
      } else if (b.kind === 'park') {
        for (let k = 0; k < 6; k++) {
          const x = b.x0 + 8 + R() * (b.x1 - b.x0 - 16), y = b.y0 + 8 + R() * (b.y1 - b.y0 - 16), horiz = R() < 0.5;
          addProp(k < 4 ? 'bench' : 'bin', x, y, horiz ? 0 : 1, horiz ? 1 : 0, R);
        }
      }
    }
  }
  // Manholes (some steam) and the dips where puddles collect, per road segment.
  function placeRoadBits(R) {
    const C = X.city, lo = PG.cityLaneOff;
    const seg = (horiz, c, w, a0, a1) => {
      if (a1 - a0 < 16) return;
      const nl = PG.cityLanes(w);
      for (let k = 0, n = R() < 0.65 ? 1 : 2; k < n; k++) {
        const along = a0 + 6 + R() * (a1 - a0 - 12), off = (R() < 0.5 ? -1 : 1) * lo(Math.floor(R() * nl));
        const m = { x: horiz ? along : c + off, y: horiz ? c + off : along, steam: R() < 0.3, ph: R() * TAU, acc: 0 };
        gridAdd(S.mgrid, m); S.manholes.push(m);
      }
      for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) {
        const along = a0 + 3 + R() * (a1 - a0 - 6), off = (R() < 0.5 ? -1 : 1) * (w / 2 - 0.8 - R() * 1.8);
        const pd = { x: horiz ? along : c + off, y: horiz ? c + off : along, rx: 0, ry: 0, seed: R(), hit: -9 };
        const a = 1.0 + R() * 1.8, bq = 0.6 + R() * 0.7; pd.rx = horiz ? a : bq; pd.ry = horiz ? bq : a;
        gridAdd(S.pgrid, pd); S.puddles.push(pd);
      }
    };
    for (let j = 0; j < C.ys.length; j++) for (let i = 0; i < C.xs.length - 1; i++) seg(true, C.ys[j], C.wy[j], C.xs[i] + C.wx[i] / 2 + 4, C.xs[i + 1] - C.wx[i + 1] / 2 - 4);
    for (let i = 0; i < C.xs.length; i++) for (let j = 0; j < C.ys.length - 1; j++) seg(false, C.xs[i], C.wx[i], C.ys[j] + C.wy[j] / 2 + 4, C.ys[j + 1] - C.wy[j + 1] / 2 - 4);
  }
  // knock a prop over / off its base: it flies with (vx, vy) and comes to rest lying down
  function knock(p, vx, vy, by, why) {
    if (!p || p.st !== 0) return false;
    if (p.solid) { PG.cityRemove(X.city, p.solid); p.solid = null; }
    gridDel(S.grid, p); S.loose.push(p);
    p.st = 2; p.vx = vx; p.vy = vy; p.vr = rand(-1, 1) * (3 + Math.hypot(vx, vy) * 0.6); p.downT = X.time; p.rot = 0;
    const x = p.x, y = p.y, sp = Math.hypot(vx, vy), near = seen(x, y, 4);
    S.stats.smashed++;
    switch (p.type) {
      case 'hydrant':
        p.gush = rand(16, 26); S.stats.hydrants++;
        if (near) { PG.burst(x, y, 'debris', 6, 4, 0.8, 0.18, ['#c0392b', '#e0b020']); sfxHydrant(x, y); }
        break;
      case 'meter': {
        const n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) dropCoin(x, y, vx * 0.3, vy * 0.3);
        if (near) { PG.burst(x, y, 'spark', 8, 4, 0.35, 0.08); sfxClang(x, y, 1.6); sfxCoins(x, y); }
        break;
      }
      case 'bin':
        for (let k = 0; k < 9; k++) qEmit(k < 6 ? K_PAPER : K_BIT, x, y, 0.4, vx * 0.4 + rand(-2.5, 2.5), vy * 0.4 + rand(-2.5, 2.5), rand(1, 3), rand(5, 14), rand(0.18, 0.32), k < 6 ? (k % 2) : 3);
        if (near) sfxClang(x, y, 1);
        X.decal(x + vx * 0.08, y + vy * 0.08, { color: 'rgba(70,58,40,0.45)' }, 0.7);
        break;
      case 'mailbox': case 'newsbox':
        for (let k = 0; k < 12; k++) qEmit(K_PAPER, x, y, 0.6, vx * 0.35 + rand(-2, 2), vy * 0.35 + rand(-2, 2), rand(1.5, 3.5), rand(6, 16), rand(0.2, 0.34), p.type === 'mailbox' ? 0 : 1);
        if (near) sfxClang(x, y, p.type === 'mailbox' ? 0.8 : 1.2);
        break;
      case 'bench':
        for (let k = 0; k < 5; k++) qEmit(K_BIT, x, y, 0.3, vx * 0.5 + rand(-2, 2), vy * 0.5 + rand(-2, 2), rand(1, 2.5), rand(2, 4), rand(0.25, 0.45), 3);
        if (near) sfxThud(x, y);
        break;
      case 'busstop':
        X.decal(x, y, 'glass', 2.2);
        for (let k = 0; k < 16; k++) qEmit(K_BIT, x + rand(-1.6, 1.6), y + rand(-0.5, 0.5), 1.2, vx * 0.3 + rand(-3, 3), vy * 0.3 + rand(-3, 3), rand(0, 2), rand(1, 2), rand(0.06, 0.14), 2);
        if (near) sfxGlass(x, y);
        p.vx *= 0.15; p.vy *= 0.15; p.vr = 0;   // the frame stays put, the glass goes
        break;
    }
    X.emit('propSmashed', { prop: p, type: p.type, by, why, x, y });
    return true;
  }
  api.knock = (p, vx, vy, by) => knock(p, vx || 0, vy || 0, by, 'api');
  api.propsNear = function (x, y, r, type) {
    const out = []; if (!S) return out;
    for (const p of S.props) if ((!type || p.type === type) && Math.hypot(p.x - x, p.y - y) < r) out.push(p);
    return out.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  };
  function restore(p) {
    if (X.blocked(p.hx, p.hy, (p.r || 0.3) + 0.05)) return;
    for (const c of X.cars) if (!c.removed && Math.abs(c.x - p.hx) < c.len && Math.abs(c.y - p.hy) < c.len && X.circlePoly(p.hx, p.hy, Math.max(p.r, p.pw / 2, p.ph / 2) + 0.2, X.carPoly(c))) return;
    p.x = p.hx; p.y = p.hy; p.st = 0; p.rot = 0; p.vx = p.vy = p.vr = 0; p.gush = 0; p.pud = 0; p.hp = (PT[p.type].hp || 999); p.paid = 0;
    makeSolid(p); gridAdd(S.grid, p);
    const i = S.loose.indexOf(p); if (i >= 0) S.loose.splice(i, 1);
  }
  function hitProp(p, dmg, by, kind, dx, dy) {
    if (p.st !== 0) return;
    const d = PT[p.type];
    p.hitT = X.time;
    if (p.type === 'hydrant') { if (kind === 'bullet' && Math.random() < 0.25) knock(p, dx * 1.5, dy * 1.5, by, kind); else if (seen(p.x, p.y, 3)) sfxClang(p.x, p.y, 2.2); return; }
    p.hp -= dmg;
    if (p.hp <= 0) knock(p, dx * (kind === 'melee' ? 3.5 : 2), dy * (kind === 'melee' ? 3.5 : 2), by, kind);
    else if (seen(p.x, p.y, 3)) { sfxClang(p.x, p.y, p.type === 'bin' ? 1 : 1.5); if (p.type === 'meter' && Math.random() < 0.35) dropCoin(p.x, p.y, dx, dy); }
    return d;
  }
  function dropCoin(x, y, vx, vy) {
    if (S.coins.length > 60) S.coins.shift();
    S.stats.dropped++;
    const a = rand(0, TAU), sp = rand(1.5, 4.5);
    S.coins.push({ x, y, z: 0.6, vx: vx + Math.cos(a) * sp, vy: vy + Math.sin(a) * sp, vz: rand(2, 4), t: 0, val: 5, ph: rand(0, TAU) });
  }
  function coinsTick(dt) {
    const pp = P.ped; let got = 0, gx = 0, gy = 0;
    const px = P.car ? P.car.x : pp.x, py = P.car ? P.car.y : pp.y, rr = P.car ? 2.3 : 0.95;
    for (let i = S.coins.length - 1; i >= 0; i--) {
      const c = S.coins[i];
      c.t += dt; c.vz -= 9.8 * dt; c.z += c.vz * dt;
      if (c.z < 0) { c.z = 0; c.vz = Math.abs(c.vz) > 1 ? -c.vz * 0.35 : 0; c.vx *= 0.6; c.vy *= 0.6; }
      const f = Math.exp(-dt * (c.z > 0 ? 0.3 : 2.5)); c.vx *= f; c.vy *= f;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
      if (X.blocked(nx, ny, 0.05)) { c.vx = -c.vx * 0.4; c.vy = -c.vy * 0.4; } else { c.x = nx; c.y = ny; }
      if (c.t > 0.35 && P.state === 'play' && !pp.dead && Math.abs(c.x - px) < rr && Math.abs(c.y - py) < rr) { got += c.val; gx = c.x; gy = c.y; S.coins.splice(i, 1); continue; }
      if (c.t > 50) S.coins.splice(i, 1);
    }
    if (got) { X.money(got, 'coins', gx, gy); S.stats.coins++; S.stats.coinCash += got; sfxCoins(gx, gy); }
  }
  // cars against furniture: fast cars send it flying before the solid can stop them
  function carsVsProps(dt) {
    const f = X.focus();
    for (const c of X.cars) {
      if (c.removed || c.ctrl !== 'phys') continue;   // lane traffic stays on the road, parked cars stay put
      const sp = Math.abs(c.speed || 0); if (sp < 1.8) continue;
      if (Math.abs(c.x - f.x) > 160 || Math.abs(c.y - f.y) > 160) continue;
      const ext = c.len / 2 + 1.5 + sp * dt * 2;
      let poly = null, vel = null;
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
        const a = S.grid.get(ck(c.x + gx * CELL, c.y + gy * CELL)); if (!a) continue;
        for (let n = a.length - 1; n >= 0; n--) {
          const p = a[n]; if (Math.abs(p.x - c.x) > ext + p.pw / 2 || Math.abs(p.y - c.y) > ext + p.ph / 2) continue;
          const d = PT[p.type]; if (sp < d.knockV) continue;
          poly = poly || X.carPoly(c);
          const m = sp * dt * 1.6 + 0.08;
          if (!propTouches(p, poly, m)) continue;
          vel = vel || X.carVel(c);
          const push = 1.05 + Math.random() * 0.35;
          knock(p, vel.x * push + rand(-1.5, 1.5), vel.y * push + rand(-1.5, 1.5), c.driver || c, 'car');
          if (c.dv) { c.dv.vx *= d.slow; c.dv.vy *= d.slow; c.dv.r += rand(-0.25, 0.25); }
          if (d.dmg && c.ctrl === 'phys') X.damageCar(c, d.dmg * Math.min(1.5, sp / 12), null, 'crash');
          if (c === P.car) G().shake = Math.max(G().shake, 0.1);
        }
      }
      // whatever lies in the road gets kicked along
      if (sp > 3) for (const p of S.loose) {
        if (p.type === 'busstop' || Math.abs(p.x - c.x) > c.len / 2 + 1 || Math.abs(p.y - c.y) > c.len / 2 + 1) continue;
        poly = poly || X.carPoly(c);
        if (!X.circlePoly(p.x, p.y, 0.35, poly)) continue;
        vel = vel || X.carVel(c);
        if (p.st === 1 || Math.hypot(p.vx - vel.x, p.vy - vel.y) > 2) { p.st = 2; p.vx = vel.x * 1.15 + rand(-1, 1); p.vy = vel.y * 1.15 + rand(-1, 1); p.vr = rand(-9, 9); if (seen(p.x, p.y, 2) && Math.random() < 0.5) sfxClang(p.x, p.y, 0.7); }
      }
    }
  }
  function propTouches(p, poly, m) {
    if (p.r) return !!X.circlePoly(p.x, p.y, p.r + m, poly);
    const lng = Math.max(p.pw, p.ph), sh = Math.min(p.pw, p.ph), n = Math.max(1, Math.ceil(lng / sh)), alongX = p.pw >= p.ph;
    for (let k = 0; k < n; k++) {
      const o = n === 1 ? 0 : -lng / 2 + sh / 2 + (lng - sh) * k / (n - 1);
      if (X.circlePoly(alongX ? p.x + o : p.x, alongX ? p.y : p.y + o, sh / 2 + m, poly)) return true;
    }
    return false;
  }
  function looseTick(dt) {
    const f = X.focus();
    for (let i = S.loose.length - 1; i >= 0; i--) {
      const p = S.loose[i];
      if (p.st === 2) {
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (X.blocked(nx, ny, 0.2)) { p.vx *= -0.35; p.vy *= -0.35; p.vr *= -0.5; }
        else { p.x = nx; p.y = ny; }
        const k = Math.exp(-dt * 2.6); p.vx *= k; p.vy *= k; p.rot += p.vr * dt; p.vr *= Math.exp(-dt * 2.2);
        if (Math.hypot(p.vx, p.vy) < 0.2) { p.st = 1; p.vx = p.vy = 0; }
      }
      if (p.gush > 0) gushTick(p, dt);
      else if (p.st === 1 && X.time - p.downT > 240 && Math.hypot(p.hx - f.x, p.hy - f.y) > 110) restore(p);
    }
    while (S.loose.length > 160) { const p = S.loose[0]; p.downT = -1e9; restore(p); if (S.loose[0] === p) S.loose.shift(); }
  }
  function gushTick(p, dt) {
    p.gush -= dt;
    const x = p.hx, y = p.hy, k = Math.min(1, p.gush / 3);
    if (seen(x, y, 12)) {
      p.wacc = (p.wacc || 0) + dt * (S.low ? 30 : 70) * k;
      while (p.wacc >= 1) { p.wacc--; const a = rand(0, TAU), s = rand(0.3, 2.6); qEmit(K_WATER, x, y, 0.4, Math.cos(a) * s + api.wind.x * 0.4, Math.sin(a) * s + api.wind.y * 0.4, rand(5.5, 9.5) * (0.5 + k * 0.5), 2, rand(0.06, 0.12)); }
    }
    p.pud = Math.min(3.2, (p.pud || 0.4) + dt * 0.25);
    p.dT = (p.dT || 0) - dt;
    if (p.dT <= 0) {
      p.dT = 0.4;
      if (X.extinguish) X.extinguish(x, y, 3);
      for (const q of X.peds) {
        if (q.dead || q.removed || q.hidden || q.car || Math.abs(q.x - x) > 1.3 || Math.abs(q.y - y) > 1.3) continue;
        const d = Math.hypot(q.x - x, q.y - y) || 0.1; if (d > 1.2) continue;
        if (q.onFire > 0) q.onFire = 0;
        if (q.knock <= 0) { q.knock = 0.55; q.vx += (q.x - x) / d * 6; q.vy += (q.y - y) / d * 6; q.spin = rand(-6, 6); }
      }
    }
  }
  // the player's punches and bat swings hit furniture too (weapons only checks people and cars)
  function meleeTick(dt) {
    S.meleeCd -= dt;
    if (P.car || P.state !== 'play' || !P.ped || P.ped.dead || S.meleeCd > 0 || !X.input.firePressed()) return;
    const W = X.WEAPONS && X.WEAPONS[P.weapon]; if (W && W.kind !== 'melee') return;
    if (!W && P.weapon !== 'fists') return;
    S.meleeCd = W && W.rate ? W.rate : 0.3;
    const p = P.ped, a = p.aim != null ? p.aim : p.th, ca = Math.cos(a), sa = Math.sin(a), bat = P.weapon !== 'fists';
    let best = null, bd = 2;
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const arr = S.grid.get(ck(p.x + gx * CELL, p.y + gy * CELL)); if (!arr) continue;
      for (const q of arr) {
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) - (q.r || Math.min(q.pw, q.ph) / 2);
        if (d > (bat ? 1.5 : 1.0) || d > bd) continue;
        if ((dx * ca + dy * sa) < -0.1) continue;
        bd = d; best = q;
      }
    }
    if (best) hitProp(best, bat ? 40 : 13, p, 'melee', ca, sa);
  }

  // ================= billboards =================
  const ADS = [
    { bg: '#d9381e', fg: '#ffffff', t: 'TAKE THE BUS!', s: 'Cheaper than a tow truck.', icon: 'bus' },
    { bg: '#2a2233', fg: '#c7a8ff', t: "TROND'S GARAGE", s: 'No questions. No receipts.' },
    { bg: '#1f3b2e', fg: '#e8c86a', t: 'FJORD SAVINGS', s: 'Your money is safe.*   *probably' },
    { bg: '#8a5a2b', fg: '#fff3d6', t: 'BRUNOST', s: 'It is brown. It is cheese. It is fine.' },
    { bg: '#2f7d6d', fg: '#eafff8', t: "PAY 'N' SPRAY", s: 'New colour. Same you.' },
    { bg: '#3b1414', fg: '#ff5a46', t: 'AMMU-FJORD', s: 'Family packs available.' },
    { bg: '#dfe6ea', fg: '#1d3557', t: 'LUTEFISK', s: 'Now with less lye!' },
    { bg: '#111114', fg: '#ff2d95', t: 'DRIFT CLUB', s: 'Tyres are temporary.' },
    { bg: '#1f5fbf', fg: '#ffffff', t: 'PARKINGDAL', s: 'Parking for everyone.*  *not you', icon: 'p' },
    { bg: '#f2c230', fg: '#16181c', t: 'VOTE TROND', s: 'He knows where you park.' },
    { bg: '#c0392b', fg: '#fff1c8', t: 'PØLSE 10,-', s: 'With lompe. Obviously.' },
    { bg: '#e9f2f7', fg: '#1f4f9c', t: 'SKI FJORDHEIM', s: 'It is all downhill from here.' },
    { bg: '#2b2d33', fg: '#ffd23a', t: 'BUSSBY METRO', s: 'Above the traffic. Literally.' },
  ];
  const AD_CV = [], AD_T = [];
  // drawn once per ad; redrawn (at most once a second) until the web fonts have loaded
  function adCanvas(i) {
    if (AD_CV[i] && (AD_T[i] === 0 || performance.now() - AD_T[i] < 1000)) return AD_CV[i];
    let fontsOk = true;
    try { fontsOk = !document.fonts || document.fonts.check('900 58px Bungee'); } catch (e) { /* no font API */ }
    AD_T[i] = fontsOk ? 0 : performance.now();
    const A = ADS[i], c = canvas(384, 128), g = c.getContext('2d');
    g.fillStyle = A.bg; g.fillRect(0, 0, 384, 128);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, 384, 40);
    let tx = 192, tw = 352;
    if (A.icon === 'bus') {
      g.fillStyle = '#f2c230'; g.fillRect(18, 34, 84, 50); g.fillStyle = '#18222d'; for (let k = 0; k < 4; k++) g.fillRect(24 + k * 19, 42, 14, 16);
      g.fillStyle = '#111'; g.beginPath(); g.arc(36, 86, 9, 0, TAU); g.moveTo(95, 86); g.arc(86, 86, 9, 0, TAU); g.fill(); tx = 244; tw = 250;
    } else if (A.icon === 'p') {
      g.fillStyle = '#ffffff'; g.fillRect(16, 16, 92, 92); g.fillStyle = A.bg; g.font = '900 84px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 62, 66); tx = 244; tw = 250;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = A.fg;
    let fs = 58; g.font = `900 ${fs}px Bungee, Impact, sans-serif`; const w = g.measureText(A.t).width; if (w > tw) { fs = Math.floor(fs * tw / w); g.font = `900 ${fs}px Bungee, Impact, sans-serif`; }
    g.fillText(A.t, tx, 52);
    g.font = '700 22px "Barlow Condensed", Arial, sans-serif'; g.globalAlpha = 0.9; g.fillText(A.s, tx, 100, tw);
    g.globalAlpha = 1; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(3, 3, 378, 122);
    AD_CV[i] = c; return c;
  }
  function placeBoards(R) {
    const C = X.city;
    for (const b of C.buildings) {
      if (b.deco || b.place) continue;
      const w = b.x1 - b.x0, d = b.y1 - b.y0; if (w < 11 || d < 9) continue;
      if (b.neon >= 0 && b.h > 14) continue;   // the lighting module may hang a neon sign here
      const dn = X.districtAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      if (dn === 'Neon Mile' && b.h > 10) continue;
      if (R() > 0.12) continue;
      const bw = Math.min(w - 3, 12.5), bh = bw / 3; if (d < bh + 3) continue;
      const top = R() < 0.5, x = (b.x0 + b.x1) / 2 - bw / 2, y = top ? b.y0 + 1.3 : b.y1 - 1.3 - bh;
      S.boards.push({ b, x, y, w: bw, h: bh, ad: Math.floor(R() * ADS.length), flick: R() < 0.15, seed: R() });
    }
  }

  // ================= pigeons and cats =================
  function groundOk(x, y) {
    if (X.roadAt(x, y) || X.blocked(x, y, 0.9)) return false;
    const b = X.blockAt(x, y); return !!b;
  }
  function spawnFlock(x, y, n) {
    const F = { x, y, st: 'ground', t: 0, chk: Math.random() * 0.2, tx: x, ty: y, roof: null, birds: [], cool: 0, seen: false, flapSnd: 0 };
    for (let k = 0; k < n; k++) {
      const a = rand(0, TAU), r = rand(0.3, 2.4), kind = Math.random() < 0.08 ? 1 : Math.random() < 0.05 ? 2 : 0;
      F.birds.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: 0, vx: 0, vy: 0, vz: 0, th: rand(0, TAU), ox: Math.cos(a) * r, oy: Math.sin(a) * r, flap: rand(0, TAU), peck: 0, wt: rand(0, 3), kind, delay: 0, air: false, cz: rand(7, 13), sw: rand(0, TAU) });
    }
    S.flocks.push(F);
    return F;
  }
  api.spawnFlock = (x, y, n) => S ? spawnFlock(x, y, n || 7) : null;
  function scareFlock(F, sx, sy) {
    if (F.st === 'air' || F.cool > 0) return false;
    F.st = 'air'; F.t = 0; S.stats.scares++;
    let ax = F.x - sx, ay = F.y - sy; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    if (al < 0.01) { const a = rand(0, TAU); ax = Math.cos(a); ay = Math.sin(a); }
    F.ax = ax; F.ay = ay;
    chooseLanding(F, ax, ay);
    for (const b of F.birds) {
      b.delay = rand(0, 0.28); b.air = false; b.landed = false;
      const s = rand(-0.7, 0.7), c = Math.cos(s), n = Math.sin(s);
      b.vx = (ax * c - ay * n) * rand(3, 5); b.vy = (ax * n + ay * c) * rand(3, 5); b.vz = rand(5, 7);
    }
    if (seen(F.x, F.y, 10)) sfxFlutter(F.x, F.y, F.birds.length);
    return true;
  }
  function chooseLanding(F, ax, ay) {
    F.roof = null;
    if (Math.random() < 0.3) {   // up on a roof
      const cx = F.x + ax * 18, cy = F.y + ay * 18;
      let best = null, bd = 40;
      for (const o of X.solidsNear(cx, cy, 30)) {
        if (o.kind !== 'building') continue;
        const bb = o.bb, d = Math.hypot((bb.x0 + bb.x1) / 2 - cx, (bb.y0 + bb.y1) / 2 - cy);
        if (d < bd && bb.x1 - bb.x0 > 6 && bb.y1 - bb.y0 > 6) { bd = d; best = bb; }
      }
      if (best) { F.roof = best; F.tx = rand(best.x0 + 1.5, best.x1 - 1.5); F.ty = rand(best.y0 + 1.5, best.y1 - 1.5); return; }
    }
    for (let k = 0; k < 14; k++) {
      const d = rand(22, 60), s = rand(-0.9, 0.9), c = Math.cos(s), n = Math.sin(s);
      const x = F.x + (ax * c - ay * n) * d, y = F.y + (ax * n + ay * c) * d;
      if (groundOk(x, y)) { F.tx = x; F.ty = y; return; }
    }
    F.tx = F.x; F.ty = F.y;   // a lap of honour and back to the same spot
  }
  api.scare = function (x, y, r) { if (!S) return 0; let n = 0; for (const F of S.flocks) if (!F.roof && Math.hypot(F.x - x, F.y - y) < (r || 30) && scareFlock(F, x, y)) n++; return n; };
  function scareAll(x, y, r, roofsToo) {
    for (const F of S.flocks) {
      if (F.roof && !roofsToo) continue;
      if (Math.abs(F.x - x) < r && Math.abs(F.y - y) < r && Math.hypot(F.x - x, F.y - y) < r) { F.cool = 0; scareFlock(F, x, y); }
    }
    for (const c of S.cats) if (Math.hypot(c.x - x, c.y - y) < r * 0.8) catFlee(c, x, y);
  }
  function threatNear(F) {
    const pp = P.ped;
    if (pp && !pp.hidden && !pp.dead) {
      const d = Math.hypot(pp.x - F.x, pp.y - F.y), lim = pp.speed > 5 ? 6.5 : pp.speed > 1 ? 3.4 : 2.2;
      if (d < lim) return pp;
    }
    for (const c of X.cars) {
      if (c.removed || Math.abs(c.x - F.x) > 11 || Math.abs(c.y - F.y) > 11) continue;
      const sp = Math.abs(c.speed || 0), d = Math.hypot(c.x - F.x, c.y - F.y) - c.len / 2;
      if ((sp > 2.5 && d < 3.4) || (sp > 12 && d < 5.5) || (sp > 0.4 && d < 2)) return c;
    }
    for (const p of X.peds) {
      if (p.dead || p.hidden || p.car || p === pp || Math.abs(p.x - F.x) > 5 || Math.abs(p.y - F.y) > 5) continue;
      const d = Math.hypot(p.x - F.x, p.y - F.y);
      if (d < 0.9 || (p.speed > 3 && d < 4)) return p;
    }
    for (const c of S.cats) if (c.st === 'pounce' && Math.hypot(c.x - F.x, c.y - F.y) < 3) return c;
    return null;
  }
  function flocksTick(dt) {
    const f = X.focus(), indoor = !!X.scene;
    for (let i = S.flocks.length - 1; i >= 0; i--) {
      const F = S.flocks[i];
      const df = Math.hypot(F.x - f.x, F.y - f.y);
      if (df > 300 && F.st === 'ground') { S.flocks.splice(i, 1); continue; }
      F.cool -= dt; F.t += dt;
      if (F.st === 'ground') {
        if (!F.roof && !indoor) { F.chk -= dt; if (F.chk <= 0) { F.chk = 0.15; const th = threatNear(F); if (th) scareFlock(F, th.x, th.y); } }
        else if (F.roof && F.t > 25 && Math.random() < dt * 0.04) { const a = rand(0, TAU); scareFlock(F, F.x + Math.cos(a), F.y + Math.sin(a)); }
        if (F.feed > 0) { F.feed -= dt; }
        if (df < 120) for (const b of F.birds) groundBird(F, b, dt);
      } else {
        let landed = 0;
        for (const b of F.birds) { airBird(F, b, dt); if (b.landed) landed++; }
        if (landed === F.birds.length || F.t > 22) {
          F.st = 'ground'; F.x = F.tx; F.y = F.ty; F.t = 0; F.cool = 1.2;
          for (const b of F.birds) { b.z = 0; b.vz = 0; b.air = false; b.landed = false; b.x = F.x + b.ox; b.y = F.y + b.oy; }
        }
      }
    }
    if (indoor) return;
    // keep a handful of flocks around the player; new ones land just out of sight
    S.scanT -= dt;
    if (S.scanT <= 0) {
      S.scanT = 0.7;
      const want = api.night > 0.85 || S.W.snow > 0.3 ? 5 : 8;
      let near = 0; for (const F of S.flocks) if (Math.hypot(F.x - f.x, F.y - f.y) < 200) near++;
      if (near < want) {
        const v = X.lastView, r0 = v ? Math.min(150, v.r + 15) : 60;
        for (let k = 0; k < 6; k++) {
          const a = rand(0, TAU), d = rand(r0, r0 + 70), x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
          const b = X.blockAt(x, y); if (!b) continue;
          let q = null;
          if (b.kind !== 'city' && Math.random() < 0.7) { const ox = rand(b.x0 + 6, b.x1 - 6), oy = rand(b.y0 + 6, b.y1 - 6); if (groundOk(ox, oy)) q = { x: ox, y: oy }; }
          if (!q) { const sp = X.randomSidewalkPoint(x, y, 0, 12); if (sp && groundOk(sp.x, sp.y)) q = sp; }
          if (q) { spawnFlock(q.x, q.y, 4 + Math.floor(Math.random() * 7)); break; }
        }
      }
    }
  }
  function groundBird(F, b, dt) {
    b.flap += dt * 3;
    if (b.landed === false && b.z > 0) { b.z = Math.max(0, b.z - dt * 4); }
    if (F.feed > 0 && F.fx != null) { b.tx = F.fx + b.ox * 0.45; b.ty = F.fy + b.oy * 0.45; }
    else { b.tx = F.x + b.ox; b.ty = F.y + b.oy; }
    b.wt -= dt;
    if (b.wt <= 0) { b.wt = rand(1.5, 5); const a = rand(0, TAU), r = rand(0.3, 2.6); b.ox = Math.cos(a) * r; b.oy = Math.sin(a) * r; if (Math.random() < 0.4) b.peck = rand(0.5, 1.4); }
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
    if (d > 0.15) { const s = Math.min(d * 2, F.feed > 0 ? 1.6 : 0.6); b.x += dx / d * s * dt; b.y += dy / d * s * dt; b.th += PG.wrap(Math.atan2(dy, dx) - b.th) * Math.min(1, dt * 6); b.walk = (b.walk || 0) + dt * 9; }
    if (b.peck > 0) b.peck -= dt;
  }
  function airBird(F, b, dt) {
    if (b.landed) return;
    if (b.delay > 0) { b.delay -= dt; return; }
    b.air = true; b.flap += dt * (b.vz > 0.5 ? 24 : 15);
    const tx = F.tx + b.ox * 0.8, ty = F.ty + b.oy * 0.8, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (F.t > 0.7 && d < 3) { b.vx = dx * 2.2; b.vy = dy * 2.2; b.vz += (d * 0.4 - b.z) * 3 * dt - b.vz * Math.min(1, dt * 4); }
    else if (F.t > 0.7) {   // steer for the landing spot with a little swirl
      const sp = Math.min(9, 3 + d * 0.5), s = Math.sin(X.time * 1.7 + b.sw) * 0.6;
      const wx = (dx / (d || 1)) * sp - (dy / (d || 1)) * s * sp * 0.3, wy = (dy / (d || 1)) * sp + (dx / (d || 1)) * s * sp * 0.3;
      const a = 1 - Math.exp(-dt * 2.2); b.vx += (wx - b.vx) * a; b.vy += (wy - b.vy) * a;
      const wantZ = d < 10 ? d * 0.6 : b.cz; b.vz += ((wantZ - b.z) * 1.6 - b.vz) * Math.min(1, dt * 3);
    } else b.vz -= dt * 2;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z = Math.max(0, b.z + b.vz * dt);
    if (Math.abs(b.vx) + Math.abs(b.vy) > 0.3) b.th = Math.atan2(b.vy, b.vx);
    if (d < 0.8 && b.z < 0.4 && F.t > 0.8) { b.landed = true; b.z = 0; b.vx = b.vy = b.vz = 0; }
  }
  // seagulls circling high over the harbour districts
  const GULL_D = { 'Old Pier': 5, Fjordheim: 3 };
  function gullsTick(dt) {
    const f = X.focus(), want = X.scene ? 0 : GULL_D[X.districtAt(f.x, f.y)] || 0;
    for (let i = S.gulls.length - 1; i >= 0; i--) {
      const g = S.gulls[i];
      g.a += g.w * dt; g.flap += dt * (g.flapT > 0 ? 13 : 0); g.flapT -= dt;
      if (g.flapT < -rand(2, 5)) g.flapT = rand(0.6, 1.4);
      g.cx += (g.tx - g.cx) * dt * 0.08; g.cy += (g.ty - g.cy) * dt * 0.08;
      g.x = g.cx + Math.cos(g.a) * g.r; g.y = g.cy + Math.sin(g.a) * g.r; g.th = g.a + (g.w > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (want === 0 || Math.hypot(g.cx - f.x, g.cy - f.y) > 160) { g.leave = (g.leave || 0) + dt; g.r += dt * 8; if (g.leave > 8) S.gulls.splice(i, 1); }
      else if (Math.hypot(g.tx - f.x, g.ty - f.y) > 60) { g.tx = f.x + rand(-30, 30); g.ty = f.y + rand(-30, 30); }
    }
    S.gullT -= dt;
    if (S.gullT <= 0 && S.gulls.length < want) {
      S.gullT = rand(1, 4);
      const cx = f.x + rand(-40, 40), cy = f.y + rand(-40, 40);
      S.gulls.push({ cx, cy, tx: cx, ty: cy, r: rand(10, 26), a: rand(0, TAU), w: (Math.random() < 0.5 ? -1 : 1) * rand(0.25, 0.45), z: rand(14, 22), flap: rand(0, TAU), flapT: 0, x: cx, y: cy, th: 0 });
    }
  }
  function drawGull(ctx, g) {
    const k = 1.25 * (1 + g.z * 0.03);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(g.x + g.z * 0.35, g.y + g.z * 0.5, 0.5, 0.18, g.th, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.th); ctx.scale(k, k);
    const sp = 0.55 + 0.12 * Math.sin(g.flap), sw = g.flapT > 0 ? 0.06 * Math.cos(g.flap) : 0;
    ctx.fillStyle = '#c9ced6';
    ctx.beginPath(); ctx.moveTo(0.06, -0.05); ctx.lineTo(-0.02 + sw, -sp * 0.55); ctx.lineTo(-0.12 + sw, -sp); ctx.lineTo(-0.16, -0.05); ctx.closePath();
    ctx.moveTo(0.06, 0.05); ctx.lineTo(-0.02 + sw, sp * 0.55); ctx.lineTo(-0.12 + sw, sp); ctx.lineTo(-0.16, 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1d22'; ctx.beginPath(); ctx.moveTo(-0.07 + sw, -sp * 0.85); ctx.lineTo(-0.12 + sw, -sp); ctx.lineTo(-0.15 + sw, -sp * 0.82); ctx.closePath(); ctx.moveTo(-0.07 + sw, sp * 0.85); ctx.lineTo(-0.12 + sw, sp); ctx.lineTo(-0.15 + sw, sp * 0.82); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f4f0'; ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.065, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.18, 0, 0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2c230'; ctx.fillRect(0.22, -0.015, 0.07, 0.03);
    ctx.restore();
  }
  // feeding the pigeons (F key on foot, $1 of bread): they come running
  function feedTest() {
    if (P.car || !P.ped || X.scene) return null;
    const p = P.ped; let best = null, bd = 4.2;
    for (const F of S.flocks) { if (F.st !== 'ground' || F.roof) continue; const d = Math.hypot(F.x - p.x, F.y - p.y); if (d < bd) { bd = d; best = F; } }
    if (!best || bd < 0.5 || X.nearestEnterableCar()) return null;
    return { text: 'F: Feed the pigeons ($1)', priority: -2, run() {
      if (P.money < 1) { X.popup('Not even $1 for bread?'); return; }
      X.money(-1, 'bread', p.x, p.y); S.stats.fed++;
      best.feed = 6; best.fx = p.x + Math.cos(p.th) * 1.6; best.fy = p.y + Math.sin(p.th) * 1.6; best.cool = 6;
      for (let k = 0; k < 14; k++) qEmit(K_CRUMB, p.x + Math.cos(p.th) * 0.4, p.y + Math.sin(p.th) * 0.4, 1.1, Math.cos(p.th) * rand(1, 3) + rand(-0.8, 0.8), Math.sin(p.th) * rand(1, 3) + rand(-0.8, 0.8), rand(0.5, 2), rand(5, 9), 0.06, 6);
      if (Math.random() < 0.6) sfxCoo(best.x, best.y);
    } };
  }
  const CATLOOK = [['#d98c3a', '#a8642a'], ['#1d1d22', '#1d1d22'], ['#8a8f96', '#61666d'], ['#eeeae2', '#2b2b2b'], ['#c7a27a', '#8a6a48']];
  function spawnCat(x, y) {
    const lk = pick(CATLOOK);
    const c = { x, y, th: rand(0, TAU), st: 'sit', t: rand(2, 6), tx: x, ty: y, c1: lk[0], c2: lk[1], tail: rand(0, TAU), meowT: rand(3, 9), purr: 0, sp: 0, prey: null };
    S.cats.push(c); return c;
  }
  function catFlee(c, x, y) {
    if (c.st === 'run') return;
    let ax = c.x - x, ay = c.y - y; const d = Math.hypot(ax, ay) || 1; ax /= d; ay /= d;
    for (let k = 0; k < 10; k++) {
      const s = rand(-1, 1), r = rand(14, 26), tx = c.x + (ax * Math.cos(s) - ay * Math.sin(s)) * r, ty = c.y + (ax * Math.sin(s) + ay * Math.cos(s)) * r;
      if (X.blockAt(tx, ty) && !X.blocked(tx, ty, 0.5)) { c.tx = tx; c.ty = ty; c.st = 'run'; c.t = 6; if (seen(c.x, c.y, 8) && Math.random() < 0.5) sfxMeow(c.x, c.y, true); return; }
    }
  }
  function catsTick(dt) {
    const f = X.focus();
    for (let i = S.cats.length - 1; i >= 0; i--) {
      const c = S.cats[i];
      if (Math.hypot(c.x - f.x, c.y - f.y) > 260) { S.cats.splice(i, 1); continue; }
      c.tail += dt * (c.st === 'run' ? 9 : c.st === 'stalk' ? 1.2 : 2.4);
      c.t -= dt;
      // threats
      const pp = P.ped;
      if (c.st !== 'run' && c.st !== 'purr') {
        if (pp && !pp.hidden && !pp.dead) { const d = Math.hypot(pp.x - c.x, pp.y - c.y); if (d < (pp.speed > 4.6 ? 5 : 1.0)) catFlee(c, pp.x, pp.y); }
        for (const car of X.cars) { if (car.removed || Math.abs(car.x - c.x) > 9 || Math.abs(car.y - c.y) > 9) continue; if (Math.abs(car.speed || 0) > 2 && Math.hypot(car.x - c.x, car.y - c.y) < 7) { catFlee(c, car.x, car.y); break; } }
      }
      let spd = 0;
      switch (c.st) {
        case 'sit': case 'groom': case 'purr':
          if (c.t <= 0) {
            if (c.st === 'purr') { c.st = 'sit'; c.t = rand(2, 4); break; }
            const F = S.flocks.find(F => F.st === 'ground' && !F.roof && Math.hypot(F.x - c.x, F.y - c.y) < 16);
            if (F && Math.random() < 0.6) { c.st = 'stalk'; c.prey = F; c.t = 14; break; }
            const sp = X.randomSidewalkPoint(c.x, c.y, 6, 22);
            if (sp) { c.tx = sp.x; c.ty = sp.y; c.st = 'walk'; c.t = 14; }
            else { c.t = rand(2, 5); c.st = Math.random() < 0.5 ? 'groom' : 'sit'; }
          }
          break;
        case 'walk': spd = 1.15; break;
        case 'stalk':
          if (!c.prey || c.prey.st !== 'ground' || !S.flocks.includes(c.prey)) { c.st = 'sit'; c.t = rand(2, 5); break; }
          c.tx = c.prey.x; c.ty = c.prey.y; spd = 0.55;
          if (Math.hypot(c.tx - c.x, c.ty - c.y) < 3.2) { c.st = 'pounce'; c.t = 0.6; }
          break;
        case 'pounce': spd = 6; if (c.t <= 0) { c.st = 'sit'; c.t = rand(4, 8); } break;
        case 'run': spd = 7.5; break;
      }
      if (spd > 0) {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d < 0.4 || c.t <= 0) { if (c.st !== 'pounce') { c.st = Math.random() < 0.4 ? 'groom' : 'sit'; c.t = rand(3, 9); } }
        else {
          const nx = c.x + dx / d * spd * dt, ny = c.y + dy / d * spd * dt;
          if (X.blocked(nx, ny, 0.2)) { c.st = 'sit'; c.t = rand(1, 3); }
          else { c.x = nx; c.y = ny; c.th += PG.wrap(Math.atan2(dy, dx) - c.th) * Math.min(1, dt * 10); }
        }
      }
      c.sp = spd;
      c.meowT -= dt;
      if (c.meowT <= 0) { c.meowT = rand(8, 20); if (seen(c.x, c.y, 6) && c.st !== 'run' && pp && Math.hypot(pp.x - c.x, pp.y - c.y) < 12) sfxMeow(c.x, c.y, false); }
    }
    if (X.scene) return;
    S.catT = (S.catT || 0) - dt;
    if (S.catT <= 0) {
      S.catT = 2;
      let near = 0; for (const c of S.cats) if (Math.hypot(c.x - f.x, c.y - f.y) < 180) near++;
      if (near < 2) { const v = X.lastView, r0 = v ? Math.min(140, v.r + 10) : 50; const sp = X.randomSidewalkPoint(f.x, f.y, r0, r0 + 60); if (sp) spawnCat(sp.x, sp.y); }
    }
  }
  api.spawnCat = (x, y) => S ? spawnCat(x, y) : null;
  function petTest() {
    if (P.car || !P.ped || X.scene) return null;
    const p = P.ped; let best = null, bd = 1.7;
    for (const c of S.cats) { if (c.st === 'run' || c.st === 'pounce') continue; const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
    if (!best || X.nearestEnterableCar()) return null;
    return { text: 'F: Pet the cat', priority: -1, run() {
      best.st = 'purr'; best.t = 3.5; best.th = Math.atan2(p.y - best.y, p.x - best.x);
      S.stats.pets++;
      if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 5);
      X.floatText(best.x, best.y - 0.4, '♥', '#ff7aa8', { size: 22 });
      sfxPurr(best.x, best.y);
    } };
  }
  function meterTest() {
    if (P.car || !P.ped || X.scene) return null;
    const p = P.ped; let best = null, bd = 1.05;
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const a = S.grid.get(ck(p.x + gx * CELL, p.y + gy * CELL)); if (!a) continue;
      for (const q of a) if (q.type === 'meter' && !q.paid) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
    }
    if (!best || X.nearestEnterableCar()) return null;
    return { text: 'F: Feed the meter ($1)', priority: -3, run() {
      if (P.money < 1) { X.popup('The meter wants a coin. You have none.'); return; }
      X.money(-1, 'meter', best.x, best.y); best.paid = 1; best.expired = false;
      PG.audio.chime && PG.audio.chime(2);
      X.popup(pick(['Paid for parking. Trond would be proud.', 'You fed the meter. On foot. Respect.', 'A law-abiding citizen! In this city?']));
    } };
  }

  // ================= litter =================
  const LEAF = ['#b5651d', '#d9a32a', '#8a3a1a'];
  function spawnLitter(x, y) {
    const b = X.blockAt(x, y), park = b && b.kind === 'park';
    return { x, y, vx: 0, vy: 0, z: 0, rot: rand(0, TAU), vr: 0, k: park ? 2 : Math.random() < 0.55 ? 0 : Math.random() < 0.5 ? 1 : 3, ph: rand(0, TAU), c: Math.floor(Math.random() * 3) };
  }
  function litterTick(dt) {
    if (X.scene) return;
    const f = X.focus(), W = S.W;
    while (S.litter.length < 46) {
      const a = rand(0, TAU), d = S.litterInit ? rand(40, 75) : rand(3, 70), x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
      if (X.blocked(x, y, 0.3)) { if (Math.random() < 0.3) break; continue; }
      S.litter.push(spawnLitter(x, y));
    }
    const wx = api.wind.x, wy = api.wind.y, wl = Math.hypot(wx, wy);
    for (let i = S.litter.length - 1; i >= 0; i--) {
      const l = S.litter[i];
      if (Math.abs(l.x - f.x) > 90 || Math.abs(l.y - f.y) > 90) { S.litter.splice(i, 1); continue; }
      const gust = 0.5 + 0.5 * Math.sin(X.time * 0.9 + l.ph) * Math.sin(X.time * 0.37 + l.ph * 2), drive = wl * gust * (l.k === 3 ? 1.5 : l.k === 1 ? 0.6 : 1);
      if (drive > 1.1 || l.z > 0) {
        const a = 1 - Math.exp(-dt * 1.2); l.vx += (wx * gust * 1.1 - l.vx) * a; l.vy += (wy * gust * 1.1 - l.vy) * a;
        l.vr += (Math.sin(X.time * 3 + l.ph) * 3 - l.vr) * a;
      } else { const k = Math.exp(-dt * 3); l.vx *= k; l.vy *= k; l.vr *= k; }
      l.z = Math.max(0, l.z - dt * 0.6);
      const nx = l.x + l.vx * dt, ny = l.y + l.vy * dt;
      if ((Math.abs(l.vx) + Math.abs(l.vy)) * dt > 0.002 && X.blocked(nx, ny, 0.05)) { l.vx *= -0.3; l.vy *= -0.3; } else { l.x = nx; l.y = ny; }
      l.rot += l.vr * dt;
    }
    S.litterInit = true;
    // the draught of a passing car
    for (const c of X.cars) {
      const sp = Math.abs(c.speed || 0); if (c.removed || sp < 6 || Math.abs(c.x - f.x) > 80 || Math.abs(c.y - f.y) > 80) continue;
      const v = X.carVel(c);
      for (const l of S.litter) {
        if (Math.abs(l.x - c.x) > 3.5 || Math.abs(l.y - c.y) > 3.5) continue;
        l.vx = v.x * 0.55 + rand(-1.5, 1.5); l.vy = v.y * 0.55 + rand(-1.5, 1.5); l.vr = rand(-12, 12); l.z = 1.2;
      }
    }
  }

  // ================= car alarms =================
  function idleCar(c) { return !c.removed && !c.wrecked && !c.driver && !c.npcDriver && !c.ai && !c.owner && c !== P.car && c.model && c.model.kind !== 'police' && c.model.kind !== 'bus'; }
  function startAlarm(c, s) {
    if (!S || !c || c.wrecked) return false;
    const a = S.alarms.find(q => q.car === c);
    if (a) { a.until = Math.max(a.until, X.time + (s || 12)); return true; }
    if (S.alarms.length >= 5) S.alarms.shift();
    S.alarms.push({ car: c, until: X.time + (s || rand(10, 15)), t0: X.time });
    S.stats.alarms++;
    X.emit('carAlarm', { car: c });
    return true;
  }
  api.alarm = startAlarm;
  function alarmsTick() {
    for (let i = S.alarms.length - 1; i >= 0; i--) { const a = S.alarms[i]; if (a.car.removed || a.car.wrecked || X.time > a.until) S.alarms.splice(i, 1); }
  }

  // ================= the elevated metro =================
  function buildLine(R) {
    const C = X.city, horiz = R() < 0.5, arr = horiz ? C.ys : C.xs, wa = horiz ? C.wy : C.wx, cross = horiz ? C.xs : C.ys, cw = horiz ? C.wx : C.wy;
    const cands = []; for (let k = 2; k < arr.length - 2; k++) if (wa[k] >= 20) cands.push(k);
    if (!cands.length) for (let k = 2; k < arr.length - 2; k++) cands.push(k);
    const idx = cands[Math.floor(R() * cands.length)], span = horiz ? C.W : C.H;
    // the station: on a block-long stretch in the middle third of the line
    let st = span / 2, best = 1e9;
    for (let m = 1; m < cross.length - 2; m++) {
      const a = cross[m] + cw[m] / 2, b = cross[m + 1] - cw[m + 1] / 2, mid = (a + b) / 2;
      if (b - a < 56) continue;
      const d = Math.abs(mid - span / 2) + R() * 60; if (d < best) { best = d; st = mid; }
    }
    S.line = { horiz, idx, c: arr[idx], w: 3.9, a0: -120, a1: span + 120, st, stLen: 42, name: (X.districtAt(horiz ? st : arr[idx], horiz ? arr[idx] : st) || 'Bussby') + ' Station' };
  }
  const TCARS = 4, TCLEN = 12.6, TGAP = 0.9, TLEN = TCARS * TCLEN + (TCARS - 1) * TGAP, TCRUISE = 29;
  function spawnTrain(dir, nearFocus) {
    const L = S.line; if (!L) return null;
    dir = dir || S.trainDir; S.trainDir = -dir;
    let a = dir > 0 ? L.a0 : L.a1, v = TCRUISE * 0.85;
    if (nearFocus) { const f = X.focus(), fa = L.horiz ? f.x : f.y; a = cl(fa - dir * 45, L.a0, L.a1); v = TCRUISE; }
    S.train = { a, dir, v, st: 'run', dwell: 0, stopped: !!nearFocus || Math.random() < 0.35, horn: false, clackT: 0 };   // stopped: an express, or already past the station
    S.stats.trains++;
    return S.train;
  }
  api.callTrain = (dir) => S ? spawnTrain(dir || (Math.random() < 0.5 ? 1 : -1), true) : null;
  function trainTick(dt) {
    const L = S.line; if (!L) return;
    const T = S.train;
    if (!T) { S.trainT -= dt; if (S.trainT <= 0) spawnTrain(); return; }
    const stopFront = L.st + T.dir * TLEN / 2, toStop = (stopFront - T.a) * T.dir;
    if (T.st === 'run') {
      if (!T.stopped && toStop > 0 && toStop < T.v * T.v / 4 + 1) T.st = 'brake';
      else T.v = Math.min(TCRUISE, T.v + 1.6 * dt);
    }
    if (T.st === 'brake') {
      T.v = Math.max(0, T.v - Math.max(0.4, T.v * T.v / (2 * Math.max(0.3, toStop))) * dt);
      if (toStop <= 0.2 || T.v < 0.08) { T.v = 0; T.st = 'dwell'; T.dwell = 5; T.stopped = true; }
    }
    if (T.st === 'dwell') { T.dwell -= dt; if (T.dwell <= 0) { T.st = 'run'; if (trainDist() < 120) sfxTrainChime(); } }
    T.a += T.dir * T.v * dt;
    const tail = T.a - T.dir * TLEN;
    if ((T.dir > 0 && tail > L.a1) || (T.dir < 0 && tail < L.a0)) { S.train = null; S.trainT = rand(3, 9); }
    // right underneath it the whole street shakes a little
    if (T.v > 6 && !X.scene) { const pp = X.playerPos(), a = L.horiz ? pp.x : pp.y, o = L.horiz ? pp.y : pp.x, lo = Math.min(T.a, tail), hi = Math.max(T.a, tail); if (Math.abs(o - L.c) < L.w / 2 + 2.5 && a > lo - 4 && a < hi + 4) G().shake = Math.max(G().shake, 0.05); }
    // pigeons on the deck's shadow side do not like it either
    if (T.v > 8 && Math.random() < dt * 4) { const f = trainPoint(); if (f) scareAll(f.x, f.y, 9, true); }
  }
  function trainPoint() {   // nearest point of the train to the focus
    const L = S.line, T = S.train; if (!L || !T) return null;
    const f = X.focus(), fa = L.horiz ? f.x : f.y, lo = Math.min(T.a, T.a - T.dir * TLEN), hi = Math.max(T.a, T.a - T.dir * TLEN), a = cl(fa, lo, hi);
    return L.horiz ? { x: a, y: L.c } : { x: L.c, y: a };
  }
  function trainDist() { const q = trainPoint(); if (!q) return 1e9; const f = X.focus(); return Math.hypot(q.x - f.x, q.y - f.y); }
  function nearPark(x, y) {
    for (const b of X.city.blocks) if (b.kind === 'park' && x > b.x0 - 25 && x < b.x1 + 25 && y > b.y0 - 25 && y < b.y1 + 25) return true;
    return false;
  }

  // ================= helpers =================
  function seen(x, y, pad) { return !X.scene && X.inView(x, y, pad || 0); }
  function darkness() { return X.lighting && X.lighting.darkness ? X.lighting.darkness() : 0; }

  // ================= lifecycle =================
  function init() {
    killVoices();
    QK.fill(0); ST.fill(-9);
    S = fresh();
    sprites();
    const C = X.city, R = mkR((C.seed || 1) * 7 + 13);
    lampsBuild();
    // doors: the places, the interiors module's, and every door X.buildingDoor could hand out (peds use them)
    for (const id in X.places) gridAdd(S.dgrid, { x: X.places[id].door.x, y: X.places[id].door.y });
    if (X.interiors && Array.isArray(X.interiors.doors)) for (const d of X.interiors.doors) if (d && isFinite(d.x)) gridAdd(S.dgrid, { x: d.x, y: d.y });
    for (const b of C.buildings) { if (b.deco) continue; for (let k = 0; k < 4; k++) { const d = X.buildingDoor(b, k); if (d) gridAdd(S.dgrid, { x: d.x, y: d.y }); } }
    buildSignals(R);
    placeProps(R);
    placeRoadBits(R);
    placeBoards(R);
    buildLine(R);
    X.trafficRules.push(lightRule, weatherRule);
    X.interactions.push({ test: () => S ? petTest() : null }, { test: () => S ? feedTest() : null }, { test: () => S ? meterTest() : null });
    // every game opens dry and clear; the sky starts doing its own thing after a couple of minutes
    setWeather('clear', true);
    S.W.dur = rand(120, 200);
    // a few flocks and a cat around the start, the rest arrive as you move
    const f = X.focus();
    for (let k = 0, n = 0; k < 40 && n < 5; k++) { const sp = X.randomSidewalkPoint(f.x, f.y, k < 10 ? 8 : 20, 150); if (sp && groundOk(sp.x, sp.y)) { spawnFlock(sp.x, sp.y, 4 + Math.floor(Math.random() * 7)); n++; } }
    for (let k = 0; k < 8 && S.cats.length < 2; k++) { const sp = X.randomSidewalkPoint(f.x, f.y, 12, 90); if (sp) spawnCat(sp.x, sp.y); }
    S.snd.hour = Math.floor(X.clock / 60);
    S.started = true;
  }
  function stop() { killVoices(); if (S) S.started = false; for (let i = 0; i < NQ; i++) QK[i] = 0; }

  function tick(dt) {
    if (!S) return;
    weatherTick(dt);
    gripTick();
    rainTick(dt);
    qTick(dt);
    trainTick(dt);
    looseTick(dt);
    coinsTick(dt);
    alarmsTick();
    flocksTick(dt);
    catsTick(dt);
    gullsTick(dt);
    for (let i = S.strikes.length - 1; i >= 0; i--) if (X.time - S.strikes[i].t > 0.6) S.strikes.splice(i, 1);
    if (!X.scene) {
      carsVsProps(dt);
      meleeTick(dt);
      litterTick(dt);
      fxTick(dt);
    }
    soundsTick(dt);
    api.night = S.dark;
  }
  // steam from manholes, spray off wet tyres, splashes through puddles, rain splashes
  function fxTick(dt) {
    const v = X.lastView; if (!v) return;
    const W = S.W, R = v.r;
    S.steamAcc += dt;
    if (S.steamAcc > 0.09) {
      const st = S.steamAcc; S.steamAcc = 0;
      eachCell(S.mgrid, v.cx, v.cy, R + 6, m => {
        if (!m.steam) return;
        m.acc += st * (2.2 + Math.sin(X.time * 0.6 + m.ph) * 1.2);
        while (m.acc >= 1) { m.acc--; qEmit(K_STEAM, m.x + rand(-0.3, 0.3), m.y + rand(-0.3, 0.3), 0, rand(-0.3, 0.3), rand(-0.3, 0.3), 0, rand(2.2, 3.6), rand(0.5, 0.9)); }
      });
    }
    if (W.cover > 0.3 && !S.low) for (const c of X.cars) {
      if (c.removed || c.wrecked) continue;
      const sp = Math.abs(c.speed || 0); if (sp < 6 || Math.abs(c.x - v.cx) > R + 8 || Math.abs(c.y - v.cy) > R + 8) continue;
      if (Math.random() < dt * 14 * Math.min(1, sp / 20)) { const fx = Math.cos(c.th), fy = Math.sin(c.th), s2 = Math.random() < 0.5 ? -1 : 1; qEmit(K_SPRAY, c.x - fx * c.len * 0.45 - fy * s2 * c.wid * 0.45, c.y - fy * c.len * 0.45 + fx * s2 * c.wid * 0.45, 0, -fx * sp * 0.12 + rand(-0.5, 0.5), -fy * sp * 0.12 + rand(-0.5, 0.5), 0, rand(0.5, 0.9), rand(0.3, 0.55)); }
    }
    if (W.wet > 0.25) for (const c of X.cars) {
      if (c.removed || c.wrecked) continue;
      const sp = Math.abs(c.speed || 0); if (sp < 4 || Math.abs(c.x - v.cx) > R + 8 || Math.abs(c.y - v.cy) > R + 8) continue;
      const fx = Math.cos(c.th), fy = Math.sin(c.th);
      if (sp > 9 && !S.low && Math.random() < dt * 20 * W.wet * Math.min(1, sp / 25)) {
        const s = Math.random() < 0.5 ? -1 : 1, bx = c.x - fx * c.len * 0.45 - fy * s * c.wid * 0.45, by = c.y - fy * c.len * 0.45 + fx * s * c.wid * 0.45;
        qEmit(K_SPRAY, bx, by, 0, -fx * sp * 0.15 + rand(-0.6, 0.6), -fy * sp * 0.15 + rand(-0.6, 0.6), 0, rand(0.4, 0.8), rand(0.35, 0.6));
      }
      // through a puddle
      eachCell(S.pgrid, c.x, c.y, 4, pd => {
        if (X.time - pd.hit < 0.6) return;
        const dx = (c.x - pd.x) / (pd.rx + 0.6), dy = (c.y - pd.y) / (pd.ry + 0.6);
        if (dx * dx + dy * dy > 1) return;
        pd.hit = X.time; S.stats.splashes++;
        const vel = X.carVel(c);
        for (let k = 0; k < 14; k++) { const a = rand(0, TAU); qEmit(K_WATER, pd.x + rand(-0.5, 0.5), pd.y + rand(-0.5, 0.5), 0.2, vel.x * 0.25 + Math.cos(a) * rand(1, 3.5), vel.y * 0.25 + Math.sin(a) * rand(1, 3.5), rand(2, 4.5), 1.2, rand(0.06, 0.12)); }
        if (seen(pd.x, pd.y, 2)) sfxSplash(pd.x, pd.y, Math.min(1, sp / 15));
      });
    }
  }
  function eachCell(grid, x, y, r, fn) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const a = grid.get((gx + 64) * 4096 + gy + 64); if (!a) continue;
      for (let n = 0; n < a.length; n++) { const o = a[n]; if (Math.abs(o.x - x) < r && Math.abs(o.y - y) < r) fn(o); }
    }
  }

  // ================= rain: screen streaks and splashes =================
  const RN = 640, RX = new Float32Array(RN), RY = new Float32Array(RN), RZ = new Float32Array(RN);
  for (let i = 0; i < RN; i++) { RX[i] = Math.random() * 1.2 - 0.1; RY[i] = Math.random() * 1.2 - 0.1; RZ[i] = Math.random(); }
  const SPN = 260, SX = new Float32Array(SPN), SY = new Float32Array(SPN), ST = new Float32Array(SPN).fill(-9);
  let spCur = 0;
  function rainTick(dt) {
    const W = S.W;
    if (W.snow > 0.01) {   // flakes: slow, swaying, drifting with the wind
      const sl = (S.slant || 0) * 3;
      for (let i = 0; i < RN; i++) {
        const sp = dt * (0.07 + 0.11 * RZ[i]);
        RY[i] += sp; RX[i] += sp * sl + Math.sin(X.time * 1.3 + i) * dt * 0.012;
        if (RY[i] > 1.05) { RY[i] -= 1.1; RX[i] = Math.random() * 1.2 - 0.1; }
        if (RX[i] < -0.1) RX[i] += 1.2; else if (RX[i] > 1.1) RX[i] -= 1.2;
      }
    }
    if (W.rain < 0.01) return;
    const sl = S.slant || 0;
    for (let i = 0; i < RN; i++) {
      const sp = dt * (1.5 + 1.6 * RZ[i]);
      RY[i] += sp; RX[i] += sp * sl;
      if (RY[i] > 1.12) { RY[i] -= 1.24; RX[i] = Math.random() * 1.2 - 0.1; }
      if (RX[i] < -0.12) RX[i] += 1.24; else if (RX[i] > 1.12) RX[i] -= 1.24;
    }
    const v = X.lastView; if (!v || X.scene || v.scale < 5) return;
    S.splashAcc += dt * 300 * W.rain;
    const c = Math.cos(-v.rot), s = Math.sin(-v.rot);
    while (S.splashAcc >= 1) {
      S.splashAcc--;
      const dx = (Math.random() * v.cw - v.ax) / v.scale, dy = (Math.random() * v.ch - v.ay) / v.scale;
      SX[spCur] = v.cx + dx * c - dy * s; SY[spCur] = v.cy + dx * s + dy * c; ST[spCur] = X.time; spCur = (spCur + 1) % SPN;
    }
  }

  // ================= drawing =================
  function vis(view, x, y, pad) { return Math.abs(x - view.cx) < view.r + pad && Math.abs(y - view.cy) < view.r + pad; }
  // Quality governor: when the frame rate sags, drop the optional extras (halos, reflections, splashes,
  // moths, puddle ripples, tyre spray, fog banks, half the rain) until it recovers.
  function governor(t) {
    const fdt = S.lastT ? Math.min(0.25, Math.max(0, t - S.lastT)) : 1 / 60; S.lastT = t;
    S.ema += (fdt - S.ema) * 0.06;
    if (S.ema > 1 / 46) { S.slowT += fdt; S.fastT = 0; if (S.slowT > 1 && !S.low) S.low = true; }
    else if (S.ema < 1 / 55) { S.fastT += fdt; S.slowT = 0; if (S.fastT > 3 && S.low) S.low = false; }
    api.quality = S.low ? 'low' : 'high';
  }
  function renderGround(ctx, view, t) {
    if (!S) return;
    governor(t);
    S.dark = darkness();
    S.vrot = view.rot || 0;
    const w = api.wind; S.slant = cl((w.x * Math.cos(S.vrot) - w.y * Math.sin(S.vrot)) * 0.06, -0.35, 0.35);
    if (X.scene) return;
    const W = S.W, R = view.r, cx = view.cx, cy = view.cy, C = X.city;
    // wet tarmac: everything darker, roads a bit more
    if (W.wet > 0.02) {
      ctx.fillStyle = `rgba(6,10,20,${(0.2 * W.wet).toFixed(3)})`; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.fillStyle = `rgba(4,6,14,${(0.16 * W.wet).toFixed(3)})`; ctx.beginPath();
      for (let j = 0; j < C.ys.length; j++) if (Math.abs(C.ys[j] - cy) < R + C.wy[j]) ctx.rect(Math.max(-9, cx - R), C.ys[j] - C.wy[j] / 2, Math.min(C.W + 9, cx + R) - Math.max(-9, cx - R), C.wy[j]);
      for (let i = 0; i < C.xs.length; i++) if (Math.abs(C.xs[i] - cx) < R + C.wx[i]) ctx.rect(C.xs[i] - C.wx[i] / 2, Math.max(-9, cy - R), C.wx[i], Math.min(C.H + 9, cy + R) - Math.max(-9, cy - R));
      ctx.fill();
    }
    // snow: a white blanket, the lanes trodden into grey slush
    if (W.cover > 0.02) {
      ctx.fillStyle = `rgba(232,238,246,${(0.62 * W.cover).toFixed(3)})`; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.fillStyle = `rgba(110,116,128,${(0.42 * W.cover).toFixed(3)})`; ctx.beginPath();
      const lo = PG.cityLaneOff, x0 = Math.max(-9, cx - R), x1 = Math.min(C.W + 9, cx + R), y0 = Math.max(-9, cy - R), y1 = Math.min(C.H + 9, cy + R);
      for (let j = 0; j < C.ys.length; j++) if (Math.abs(C.ys[j] - cy) < R + C.wy[j]) for (let k = 0, n = PG.cityLanes(C.wy[j]); k < n; k++) for (const sg of [-1, 1]) { const y = C.ys[j] + sg * lo(k); ctx.rect(x0, y - 0.95, x1 - x0, 0.5); ctx.rect(x0, y + 0.45, x1 - x0, 0.5); }
      for (let i = 0; i < C.xs.length; i++) if (Math.abs(C.xs[i] - cx) < R + C.wx[i]) for (let k = 0, n = PG.cityLanes(C.wx[i]); k < n; k++) for (const sg of [-1, 1]) { const x = C.xs[i] + sg * lo(k); ctx.rect(x - 0.95, y0, 0.5, y1 - y0); ctx.rect(x + 0.45, y0, 0.5, y1 - y0); }
      ctx.fill();
    }
    if (view.scale < 3) return;
    // puddles: they fill while it rains and dry out slowly after
    const pk = sstep(0.12, 0.6, W.wet);
    if (pk > 0.01) {
      ctx.fillStyle = `rgba(20,28,42,${(0.6 * pk).toFixed(3)})`; ctx.beginPath();
      eachCell(S.pgrid, cx, cy, R + 3, pd => { const g = 0.5 + 0.5 * pk; ctx.moveTo(pd.x + pd.rx * g, pd.y); ctx.ellipse(pd.x, pd.y, pd.rx * g, pd.ry * g, 0, 0, TAU); });
      for (const p of S.loose) if (p.type === 'hydrant' && p.pud) { ctx.moveTo(p.hx + p.pud, p.hy); ctx.ellipse(p.hx, p.hy, p.pud, p.pud * 0.8, 0, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = `rgba(140,160,190,${(0.12 * pk).toFixed(3)})`; ctx.beginPath();
      eachCell(S.pgrid, cx, cy, R + 3, pd => { const g = 0.5 + 0.5 * pk; ctx.moveTo(pd.x - pd.rx * g * 0.1 + pd.rx * g * 0.45, pd.y - pd.ry * g * 0.25); ctx.ellipse(pd.x - pd.rx * g * 0.1, pd.y - pd.ry * g * 0.25, pd.rx * g * 0.45, pd.ry * g * 0.3, 0, 0, TAU); });
      ctx.fill();
      // rings where the drops land in them
      if (W.rain > 0.1 && view.scale >= 6 && !S.low) {
        ctx.strokeStyle = `rgba(170,190,220,${(0.3 * pk).toFixed(3)})`; ctx.lineWidth = 0.04; ctx.beginPath();
        eachCell(S.pgrid, cx, cy, R + 3, pd => { for (let k = 0; k < 2; k++) { const ph = (X.time * 1.7 + pd.seed * 7 + k * 0.5) % 1, a = pd.seed * 40 + k * 2.4 + Math.floor(X.time * 1.7 + pd.seed * 7 + k * 0.5) * 1.7, rr = ph * 0.35; const x = pd.x + Math.cos(a) * pd.rx * 0.5, y = pd.y + Math.sin(a) * pd.ry * 0.5; ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); } });
        ctx.stroke();
      }
    }
    for (const p of S.loose) if (p.type === 'hydrant' && p.pud && pk <= 0.01 && vis(view, p.hx, p.hy, 4)) {
      ctx.fillStyle = 'rgba(20,28,42,0.55)'; ctx.beginPath(); ctx.ellipse(p.hx, p.hy, p.pud, p.pud * 0.8, 0, 0, TAU); ctx.fill();
    }
    // manhole covers
    ctx.fillStyle = '#1b1c1f'; ctx.strokeStyle = '#3b3d42'; ctx.lineWidth = 0.08;
    eachCell(S.mgrid, cx, cy, R + 2, m => { ctx.beginPath(); ctx.arc(m.x, m.y, 0.45, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(m.x - 0.3, m.y - 0.1); ctx.lineTo(m.x + 0.3, m.y - 0.1); ctx.moveTo(m.x - 0.3, m.y + 0.1); ctx.lineTo(m.x + 0.3, m.y + 0.1); ctx.stroke(); });
    // stop lines in front of every signalled junction
    ctx.fillStyle = 'rgba(236,232,220,0.78)';
    for (const s of S.sigList) {
      if (!vis(view, s.x, s.y, 30)) continue;
      const hx = s.vw / 2 + 4.1, hy = s.hw / 2 + 4.1;
      ctx.fillRect(s.x - hx - 0.22, s.y + 0.4, 0.44, s.hw / 2 - 0.9);
      ctx.fillRect(s.x + hx - 0.22, s.y - s.hw / 2 + 0.5, 0.44, s.hw / 2 - 0.9);
      ctx.fillRect(s.x - s.vw / 2 + 0.5, s.y - hy - 0.22, s.vw / 2 - 0.9, 0.44);
      ctx.fillRect(s.x + 0.4, s.y + hy - 0.22, s.vw / 2 - 0.9, 0.44);
    }
    // parking bays by the meters, BUS boxes at the stops
    ctx.strokeStyle = 'rgba(236,232,220,0.55)'; ctx.lineWidth = 0.12; ctx.beginPath();
    for (const run of S.runs) {
      const a = run.pts[0], b = run.pts[run.pts.length - 1]; if (!vis(view, (a.hx + b.hx) / 2, (a.hy + b.hy) / 2, 30)) continue;
      for (let k = 0; k <= run.pts.length; k++) {   // bay ends half way between the meters, out from the kerb
        const m = run.pts[Math.min(k, run.pts.length - 1)], s = k === run.pts.length ? 3.1 : -3.1, ax = m.ny ? s : 0, ay = m.nx ? s : 0;
        const ex = m.hx + m.nx * 1.65 + ax, ey = m.hy + m.ny * 1.65 + ay;
        ctx.moveTo(ex, ey); ctx.lineTo(ex + m.nx * 2.3, ey + m.ny * 2.3);
      }
    }
    ctx.stroke();
    for (const sh of S.stops) {
      if (!vis(view, sh.hx, sh.hy, 12)) continue;
      const ex = sh.hx + sh.nx * 4.05, ey = sh.hy + sh.ny * 4.05, along = sh.nx === 0;
      ctx.strokeStyle = 'rgba(242,194,48,0.6)'; ctx.lineWidth = 0.14;
      if (along) ctx.strokeRect(ex - 7, ey + sh.ny * 0.25 + (sh.ny > 0 ? 0 : -2.6), 14, 2.6); else ctx.strokeRect(ex + sh.nx * 0.25 + (sh.nx > 0 ? 0 : -2.6), ey - 7, 2.6, 14);
      ctx.save(); ctx.translate(ex + sh.nx * 1.55, ey + sh.ny * 1.55); if (!along) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(242,194,48,0.55)'; ctx.font = '700 1.2px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BUS', 0, 0); ctx.restore();
    }
  }
  function renderProps(ctx, view, t) {
    if (!S || X.scene || view.scale < 3.5) return;
    const R = view.r, cx = view.cx, cy = view.cy;
    // signal poles on the corners
    ctx.fillStyle = '#23262c';
    for (const s of S.sigList) {
      if (!vis(view, s.x, s.y, 20)) continue;
      const hx = s.vw / 2 + 0.9, hy = s.hw / 2 + 0.9;
      ctx.beginPath();
      for (let q = 0; q < 4; q++) { const px = s.x + (q & 1 ? hx : -hx), py = s.y + (q & 2 ? hy : -hy); ctx.moveTo(px + 0.22, py); ctx.arc(px, py, 0.22, 0, TAU); }
      ctx.fill();
    }
    eachCell(S.grid, cx, cy, R + 3, p => { const sp = propSprite(p); ctx.drawImage(sp.cv, p.x - sp.hw, p.y - sp.hh, sp.w, sp.h); if (p.sx != null) stopSign(ctx, p); });
    for (const p of S.loose) if (vis(view, p.x, p.y, 4) || (p.gush > 0 && vis(view, p.hx, p.hy, 4))) drawProp(ctx, p, t);
    // coins
    for (const c of S.coins) {
      if (!vis(view, c.x, c.y, 1)) continue;
      const sx = Math.abs(Math.cos(X.time * 6 + c.ph)) * 0.22 + 0.04, blink = c.t > 44 && Math.floor(c.t * 8) % 2;
      if (blink) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(c.x + 0.06, c.y + 0.06, 0.24, 0.24, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(c.x, c.y - c.z * 0.3, sx + 0.03, 0.27, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.ellipse(c.x, c.y - c.z * 0.3, sx, 0.24, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3a8'; ctx.fillRect(c.x - sx * 0.45, c.y - c.z * 0.3 - 0.12, sx * 0.5, 0.06);
    }
    if (view.scale < 6) return;
    // litter
    const LM = ctx.getTransform();
    for (const l of S.litter) {
      if (!vis(view, l.x, l.y, 1)) continue;
      place(ctx, LM, l.x, l.y, l.rot, 1 + l.z * 0.25);
      if (l.k === 0) { ctx.fillStyle = '#e4e0d6'; ctx.fillRect(-0.24, -0.17, 0.48, 0.34); ctx.fillStyle = 'rgba(40,40,40,0.35)'; ctx.fillRect(-0.18, -0.11, 0.2, 0.05); ctx.fillRect(-0.18, -0.02, 0.36, 0.03); ctx.fillRect(-0.18, 0.05, 0.3, 0.03); }
      else if (l.k === 1) { ctx.fillStyle = '#d8d4ca'; ctx.beginPath(); ctx.arc(0, 0, 0.1, 0, TAU); ctx.fill(); }
      else if (l.k === 2) { ctx.fillStyle = LEAF[l.c]; ctx.beginPath(); ctx.ellipse(0, 0, 0.16, 0.08, 0, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(235,235,240,0.55)'; ctx.beginPath(); ctx.ellipse(0, 0, 0.26, 0.18 + 0.05 * Math.sin(X.time * 9 + l.ph), 0, 0, TAU); ctx.fill(); }
    }
    ctx.setTransform(LM);
    // pigeons on the ground, cats
    const M = LM;
    for (const F of S.flocks) {
      if (F.roof || !vis(view, F.x, F.y, 8)) continue;
      for (const b of F.birds) if (!b.air) drawBird(ctx, M, b);
    }
    ctx.setTransform(M);
    for (const c of S.cats) if (vis(view, c.x, c.y, 2)) drawCat(ctx, c, t);
  }
  function stopSign(ctx, p) {
    ctx.fillStyle = '#5d636c'; ctx.beginPath(); ctx.arc(p.sx, p.sy, 0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2c230'; ctx.fillRect(p.sx - 0.28, p.sy - 0.28, 0.56, 0.56);
    ctx.fillStyle = '#1b1f27'; ctx.font = '800 0.3px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BUS', p.sx, p.sy + 0.01);
  }
  // standing furniture is drawn from a sprite per type and facing: one drawImage instead of a dozen fills
  const PSPR = new Map(), PPM = 48;
  function propSprite(p) {
    const key = p.type + (p.nx * 3 + p.ny) + (p.type === 'meter' ? (p.expired ? 'e' : 'p') : '');
    let sp = PSPR.get(key); if (sp) return sp;
    const hw = (p.r || p.pw / 2) + 0.45, hh = (p.r || p.ph / 2) + 0.45;
    const cv = canvas(Math.ceil(hw * 2 * PPM), Math.ceil(hh * 2 * PPM)), g = cv.getContext('2d');
    g.setTransform(PPM, 0, 0, PPM, hw * PPM, hh * PPM);
    drawProp(g, { type: p.type, x: 0, y: 0, nx: p.nx, ny: p.ny, pw: p.pw, ph: p.ph, r: p.r, st: 0, expired: p.expired }, 0);
    sp = { cv, hw, hh, w: cv.width / PPM, h: cv.height / PPM }; PSPR.set(key, sp);
    return sp;
  }
  function drawProp(ctx, p, t) {
    const x = p.x, y = p.y;
    if (p.st !== 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.translate(-x, -y); }
    switch (p.type) {
      case 'hydrant':
        if (p.st !== 0) {   // the stump stays, the top went flying
          ctx.restore();
          ctx.fillStyle = '#6a1a14'; ctx.beginPath(); ctx.arc(p.hx, p.hy, 0.2, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2a0c0a'; ctx.beginPath(); ctx.arc(p.hx, p.hy, 0.11, 0, TAU); ctx.fill();
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.fillStyle = '#c0392b'; ctx.fillRect(-0.3, -0.16, 0.6, 0.32); ctx.fillStyle = '#e0b020'; ctx.fillRect(0.22, -0.14, 0.12, 0.28);
          ctx.restore(); return;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 0.08, y + 0.08, 0.28, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(x, y, 0.26, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(x - 0.36, y - 0.07, 0.72, 0.14); ctx.fillRect(x - 0.07, y - 0.36, 0.14, 0.72);
        ctx.fillStyle = '#e0b020'; ctx.beginPath(); ctx.arc(x, y, 0.13, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - 0.06, y - 0.06, 0.05, 0, TAU); ctx.fill();
        break;
      case 'meter': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 0.14, y - 0.12, 0.42, 0.4);
        ctx.fillStyle = '#4b5058'; ctx.fillRect(x - 0.21, y - 0.21, 0.42, 0.42);
        ctx.fillStyle = '#9aa2ad'; ctx.fillRect(x - 0.17, y - 0.17, 0.34, 0.34);
        ctx.fillStyle = p.st === 0 ? (p.expired ? '#e8402f' : '#4fbf6a') : '#2b2d33'; ctx.fillRect(x - 0.1 + p.nx * 0.05, y - 0.1 + p.ny * 0.05, 0.2, 0.2);
        ctx.fillStyle = '#1b1d22'; ctx.fillRect(x - 0.03 - p.nx * 0.1, y - 0.03 - p.ny * 0.1, 0.06, 0.06);
        break;
      }
      case 'bin':
        if (p.st === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 0.09, y + 0.09, 0.35, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2f5a3a'; ctx.beginPath(); ctx.arc(x, y, 0.34, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1d3a25'; ctx.beginPath(); ctx.arc(x, y, 0.24, 0, TAU); ctx.fill();
          ctx.fillStyle = '#d8d4ca'; ctx.fillRect(x - 0.1, y - 0.06, 0.12, 0.09);
        } else { ctx.fillStyle = '#2f5a3a'; ctx.fillRect(x - 0.45, y - 0.3, 0.9, 0.6); ctx.fillStyle = '#1d3a25'; ctx.fillRect(x + 0.32, y - 0.3, 0.13, 0.6); }
        break;
      case 'mailbox': case 'newsbox': {
        const mail = p.type === 'mailbox', w = p.pw, h = p.ph;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - w / 2 + 0.09, y - h / 2 + 0.09, w, h);
        ctx.fillStyle = mail ? '#c62828' : '#f2c230'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = mail ? '#8e1b1b' : '#1f5fbf'; ctx.fillRect(x - w / 2 + 0.06, y - h / 2 + 0.06, w - 0.12, h - 0.12);
        if (mail) { ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(x, y, 0.11, 0, TAU); ctx.fill(); }
        else { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.15, y - 0.1, 0.3, 0.2); ctx.fillStyle = '#16181c'; ctx.fillRect(x - 0.11, y - 0.05, 0.22, 0.03); ctx.fillRect(x - 0.11, y + 0.02, 0.16, 0.03); }
        break;
      }
      case 'bench': {
        const w = p.pw, h = p.ph;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - w / 2 + 0.1, y - h / 2 + 0.1, w, h);
        ctx.fillStyle = '#3a3d44'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = p.st === 0 ? '#8a5a35' : '#6b4a2b';
        const along = w > h, n = 4;
        for (let k = 0; k < n; k++) { const o = -0.24 + k * 0.16; if (along) ctx.fillRect(x - w / 2 + 0.05, y + o - 0.05, w - 0.1, 0.11); else ctx.fillRect(x + o - 0.05, y - h / 2 + 0.05, 0.11, h - 0.1); }
        break;
      }
      case 'busstop': {
        const w = p.pw, h = p.ph, along = w > h;
        if (p.sx != null) stopSign(ctx, p);
        if (p.st === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x - w / 2 + 0.25, y - h / 2 + 0.25, w, h);
          ctx.fillStyle = 'rgba(160,200,220,0.35)'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
          ctx.fillStyle = '#34495e'; ctx.fillRect(x - w / 2 + 0.1, y - h / 2 + 0.1, w - 0.2, h - 0.2);
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; if (along) ctx.fillRect(x - w / 2 + 0.2, y - h / 2 + 0.15, w - 0.4, 0.25); else ctx.fillRect(x - w / 2 + 0.15, y - h / 2 + 0.2, 0.25, h - 0.4);
          // the ad panel at one end
          ctx.fillStyle = '#d9381e'; if (along) ctx.fillRect(x + w / 2 - 0.9, y - h / 2 + 0.1, 0.8, h - 0.2); else ctx.fillRect(x - w / 2 + 0.1, y + h / 2 - 0.9, w - 0.2, 0.8);
          ctx.save(); ctx.translate(along ? x - 0.4 : x, along ? y : y - 0.4); if (!along) ctx.rotate(Math.PI / 2);
          ctx.fillStyle = '#ffd23a'; ctx.font = '800 0.48px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TAKE THE BUS', 0, 0.02); ctx.restore();
        } else {
          ctx.strokeStyle = '#2b3038'; ctx.lineWidth = 0.1; ctx.strokeRect(x - w / 2 + 0.05, y - h / 2 + 0.05, w - 0.1, h - 0.1);
          ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x - w / 2 + 0.6, y - h / 2 + 0.5); ctx.stroke();
        }
        break;
      }
    }
    if (p.st !== 0) ctx.restore();
  }
  const BIRDC = [['#8d939c', '#6b717a', '#4e5560'], ['#efeee9', '#d8d6cf', '#c9c6be'], ['#24262b', '#16181c', '#0e0f12']];
  // Birds come from small cached sprites (8 wing beats in the air, standing / pecking on the ground), each
  // placed with one composed setTransform: dozens of birds for the price of a few draw calls.
  function paintBird(g, kind, air, flap, peck) {
    const C = BIRDC[kind];
    if (air) {
      const sp = 0.16 + 0.17 * Math.abs(Math.sin(flap)), sw = 0.05 * Math.cos(flap);
      g.fillStyle = C[1];
      g.beginPath(); g.moveTo(0.06, -0.04); g.lineTo(-0.05 + sw, -sp - 0.05); g.lineTo(-0.13 + sw, -sp); g.lineTo(-0.06, -0.03); g.closePath();
      g.moveTo(0.06, 0.04); g.lineTo(-0.05 + sw, sp + 0.05); g.lineTo(-0.13 + sw, sp); g.lineTo(-0.06, 0.03); g.closePath(); g.fill();
    } else { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0.02, 0.03, 0.15, 0.08, 0, 0, TAU); g.fill(); }
    g.fillStyle = C[0]; g.beginPath(); g.ellipse(0, 0, 0.15, 0.065, 0, 0, TAU); g.fill();
    g.fillStyle = C[1]; g.beginPath(); g.moveTo(-0.12, -0.035); g.lineTo(-0.22, -0.05); g.lineTo(-0.22, 0.05); g.lineTo(-0.12, 0.035); g.fill();
    if (!air) { g.beginPath(); g.ellipse(-0.03, 0, 0.09, 0.055, 0, 0, TAU); g.fill(); }
    g.fillStyle = kind === 0 ? '#5c8f86' : C[2]; g.beginPath(); g.arc(0.1 + peck * 0.5, 0, 0.045, 0, TAU); g.fill();
    g.fillStyle = C[2]; g.beginPath(); g.arc(0.14 + peck, 0, 0.04, 0, TAU); g.fill();
    g.fillStyle = '#d9a35a'; g.fillRect(0.175 + peck, -0.012, 0.035, 0.024);
  }
  const BSPR = new Map(), BPM = 72, BH = 0.45;   // sprite: 0.9 x 0.9 m (unscaled bird), centred
  function birdSprite(kind, air, fr) {
    const key = kind * 100 + (air ? 10 : 0) + fr;
    let c = BSPR.get(key); if (c) return c;
    c = canvas(Math.round(BH * 2 * BPM), Math.round(BH * 2 * BPM));
    const g = c.getContext('2d'); g.setTransform(BPM, 0, 0, BPM, BH * BPM, BH * BPM);
    paintBird(g, kind, air, air ? fr / 8 * TAU : 0, air ? 0 : fr * 0.05);
    BSPR.set(key, c); return c;
  }
  // world matrix M times translate(x, y) rotate(a) scale(k)
  function place(ctx, M, x, y, a, k) {
    const c = Math.cos(a) * k, s = Math.sin(a) * k;
    ctx.setTransform(M.a * c + M.c * s, M.b * c + M.d * s, M.c * c - M.a * s, M.d * c - M.b * s, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
  }
  function drawBird(ctx, M, b) {
    const k = 1.6 * (1 + b.z * 0.05);
    const fr = b.air ? Math.floor(((b.flap % TAU) + TAU) % TAU / TAU * 8) % 8 : (b.peck > 0 && Math.sin(b.peck * 14) > 0.3 ? 1 : 0);
    place(ctx, M, b.x, b.y, b.th, k);
    ctx.drawImage(birdSprite(b.kind, b.air, fr), -BH, -BH, BH * 2, BH * 2);
  }
  function birdShadows(ctx, list) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath();
    for (const b of list) { if (!b.air) continue; const sx = b.x + b.z * 0.35, sy = b.y + b.z * 0.5; ctx.moveTo(sx + 0.24, sy); ctx.arc(sx, sy, 0.24, 0, TAU); }
    ctx.fill();
  }
  function drawCat(ctx, c, t) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    const sit = c.st === 'sit' || c.st === 'groom' || c.st === 'purr', run = c.st === 'run' || c.st === 'pounce';
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0.03, 0.04, sit ? 0.2 : 0.3, 0.12, 0, 0, TAU); ctx.fill();
    // tail
    ctx.strokeStyle = c.c1; ctx.lineWidth = 0.06; ctx.lineCap = 'round'; ctx.beginPath();
    const sw = Math.sin(c.tail) * (sit ? 0.15 : run ? 0.05 : 0.12);
    if (sit) { ctx.moveTo(-0.14, 0); ctx.quadraticCurveTo(-0.24, 0.16 + sw, -0.02, 0.2); }
    else { ctx.moveTo(-0.24, 0); ctx.quadraticCurveTo(-0.38, sw * 2, -0.5, sw * 3 + (run ? 0 : 0.06)); }
    ctx.stroke(); ctx.lineCap = 'butt';
    // body
    ctx.fillStyle = c.c1; ctx.beginPath(); if (sit) ctx.ellipse(-0.04, 0, 0.17, 0.13, 0, 0, TAU); else ctx.ellipse(-0.02, 0, run ? 0.29 : 0.25, 0.095, 0, 0, TAU); ctx.fill();
    if (c.c2 !== c.c1) { ctx.fillStyle = c.c2; for (let k = 0; k < 3; k++) ctx.fillRect(-0.16 + k * 0.09, -0.08, 0.035, 0.16); }
    // legs while moving
    if (!sit) { const s = Math.sin(X.time * (run ? 22 : 9)) * (run ? 0.09 : 0.05); ctx.fillStyle = c.c1; ctx.fillRect(0.1 + s, -0.12, 0.05, 0.04); ctx.fillRect(0.1 - s, 0.08, 0.05, 0.04); ctx.fillRect(-0.18 - s, -0.12, 0.05, 0.04); ctx.fillRect(-0.18 + s, 0.08, 0.05, 0.04); }
    // head and ears
    const hx = sit ? 0.12 : 0.24, groom = c.st === 'groom' ? Math.sin(X.time * 6) * 0.04 : 0;
    ctx.fillStyle = c.c1; ctx.beginPath(); ctx.arc(hx + groom, 0, 0.085, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + groom - 0.02, -0.05); ctx.lineTo(hx + groom + 0.03, -0.12); ctx.lineTo(hx + groom + 0.06, -0.04); ctx.moveTo(hx + groom - 0.02, 0.05); ctx.lineTo(hx + groom + 0.03, 0.12); ctx.lineTo(hx + groom + 0.06, 0.04); ctx.fill();
    if (c.st === 'purr') { ctx.fillStyle = 'rgba(255,122,168,0.8)'; ctx.font = '700 0.3px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♥', 0, -0.25 - (X.time % 1) * 0.2); }
    ctx.restore();
  }
  function renderBuildings(ctx, view, t) {
    if (!S || X.scene) return;
    if (S.W.cover > 0.02) {   // snow on the roofs
      ctx.fillStyle = `rgba(240,244,250,${(0.55 * S.W.cover).toFixed(3)})`; ctx.beginPath();
      for (const b of X.city.buildings) if (b.x1 > view.cx - view.r && b.x0 < view.cx + view.r && b.y1 > view.cy - view.r && b.y0 < view.cy + view.r) ctx.rect(b.x0 + 0.35, b.y0 + 0.35, b.x1 - b.x0 - 0.7, b.y1 - b.y0 - 0.7);
      ctx.fill();
    }
    // billboards on the roofs
    for (const B of S.boards) {
      if (!vis(view, B.x + B.w / 2, B.y + B.h / 2, B.w)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(B.x + 0.7, B.y + 0.7, B.w, B.h + 0.3);
      ctx.fillStyle = '#2a2b30'; ctx.fillRect(B.x - 0.2, B.y - 0.2, B.w + 0.4, B.h + 0.7);
      ctx.drawImage(adCanvas(B.ad), B.x, B.y, B.w, B.h);
      ctx.fillStyle = '#4a4c52'; ctx.fillRect(B.x - 0.2, B.y + B.h + 0.1, B.w + 0.4, 0.35);
      ctx.fillStyle = '#16171a'; for (let k = 0; k < 3; k++) ctx.fillRect(B.x + B.w * (0.17 + k * 0.33) - 0.15, B.y + B.h + 0.05, 0.3, 0.45);
    }
    // pigeons up on the roofs
    const M = ctx.getTransform();
    for (const F of S.flocks) {
      if (!F.roof || F.st !== 'ground' || !vis(view, F.x, F.y, 8)) continue;
      for (const b of F.birds) drawBird(ctx, M, b);
    }
    ctx.setTransform(M);
  }
  function renderCars(ctx, view, t) {
    if (!S || X.scene) return;
    // car alarms: hazard lights blinking
    const on = Math.floor(X.time * 2.6) % 2 === 0;
    for (const a of S.alarms) {
      const c = a.car; if (!vis(view, c.x, c.y, c.len)) continue;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
      if (!on) { ctx.fillStyle = '#8a5a10'; const L = c.len / 2, W = c.wid / 2; ctx.fillRect(L - 0.25, -W - 0.05, 0.25, 0.22); ctx.fillRect(L - 0.25, W - 0.17, 0.25, 0.22); ctx.fillRect(-L, -W - 0.05, 0.25, 0.22); ctx.fillRect(-L, W - 0.17, 0.25, 0.22); ctx.restore(); continue; }
      ctx.fillStyle = '#ffb020';
      const L = c.len / 2, W = c.wid / 2;
      ctx.fillRect(L - 0.25, -W - 0.05, 0.25, 0.22); ctx.fillRect(L - 0.25, W - 0.17, 0.25, 0.22); ctx.fillRect(-L, -W - 0.05, 0.25, 0.22); ctx.fillRect(-L, W - 0.17, 0.25, 0.22);
      ctx.fillStyle = 'rgba(255,176,32,0.25)'; ctx.beginPath(); for (let q = 0; q < 4; q++) { const ax = q & 1 ? L : -L, ay = q & 2 ? W : -W; ctx.moveTo(ax + 0.6, ay); ctx.arc(ax, ay, 0.6, 0, TAU); } ctx.fill();
      ctx.restore();
      const fx = Math.cos(c.th), fy = Math.sin(c.th);
      X.addLight(c.x + fx * c.len / 2, c.y + fy * c.len / 2, 3.2, '#ffa020', 0.6);
      X.addLight(c.x - fx * c.len / 2, c.y - fy * c.len / 2, 3.2, '#ffa020', 0.6);
    }
  }
  const UMB = ['#c0392b', '#1f5fbf', '#2b2d33', '#f2c230', '#3e8e5a', '#6b4a8f', '#e07b2a', '#e9e4d8', '#d64a8f'];
  function renderPeds(ctx, view, t) {
    if (!S || X.scene || (S.W.rain < 0.2 && S.W.snow < 0.3) || view.scale < 4) return;
    // umbrellas over the civilians who own one
    for (const p of X.peds) {
      if (p.dead || p.hidden || p.car || p.removed || p.isPlayer || p.knock > 0 || p.speed > 3.4) continue;
      if (p.team === 'cop' || p.team === 'guard' || p.team === 'gang' || (p.weapon && p.weapon !== 'fists')) continue;
      if (hsh(p.id * 1.37) > 0.5 || !vis(view, p.x, p.y, 1)) continue;
      const col = UMB[Math.floor(hsh(p.id * 3.1) * UMB.length)], r = 0.62, a0 = (p.th || 0) + X.time * 0.2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(p.x + 0.12, p.y + 0.15, r, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = a0 + k * TAU / 8; ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.035; ctx.beginPath();
      for (let k = 0; k < 8; k += 2) { const a = a0 + k * TAU / 8; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); for (let k = 0; k < 3; k++) { const a = a0 + (k + 5) * TAU / 8; ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.05, 0, TAU); ctx.fill();
    }
  }
  // The signal heads in view, gathered once per frame: [s, pole x, pole y, arm dir x, y, head distance along the arm, state]
  const HEADS = []; let headsT = -1, headsN = 0;
  function head(s, px, py, ax, ay, d, st) { let h = HEADS[headsN]; if (!h) h = HEADS[headsN] = {}; h.s = s; h.px = px; h.py = py; h.ax = ax; h.ay = ay; h.d = d; h.st = st; headsN++; }
  function signalHeads(view, fn) {
    if (headsT !== X.renderT) {
      headsT = X.renderT; headsN = 0;
      for (const s of S.sigList) {
        if (!vis(view, s.x, s.y, 16)) continue;
        sigUpdate(s);
        const hx = s.vw / 2 + 0.9, hy = s.hw / 2 + 0.9;
        head(s, s.x - hx, s.y + hy, 0, -1, hy - s.hw * 0.25, s.h);   // eastbound
        head(s, s.x + hx, s.y - hy, 0, 1, hy - s.hw * 0.25, s.h);    // westbound
        head(s, s.x - hx, s.y - hy, 1, 0, hx - s.vw * 0.25, s.v);    // southbound
        head(s, s.x + hx, s.y + hy, -1, 0, hx - s.vw * 0.25, s.v);   // northbound
      }
    }
    for (let i = 0; i < headsN; i++) { const h = HEADS[i]; fn(h.s, h.px, h.py, h.ax, h.ay, h.d, h.st); }
  }
  function renderAir(ctx, view, t) {
    if (!S || X.scene) return;
    // steam, spray and flying bits
    drawParticles(ctx, view, 0);
    // traffic light heads over the lanes
    if (view.scale >= 3.5) {
      ctx.strokeStyle = '#2b2e35'; ctx.lineWidth = 0.16; ctx.beginPath();
      signalHeads(view, (s, px, py, ax, ay, d) => { ctx.moveTo(px, py); ctx.lineTo(px + ax * (d + 0.6), py + ay * (d + 0.6)); });
      ctx.stroke();
      ctx.fillStyle = '#121418';
      signalHeads(view, (s, px, py, ax, ay, d) => { const hx = px + ax * d, hy = py + ay * d; if (ax) ctx.fillRect(hx - 0.6, hy - 0.24, 1.2, 0.48); else ctx.fillRect(hx - 0.24, hy - 0.6, 0.48, 1.2); });
      for (let c = 0; c < 3; c++) {
        ctx.fillStyle = LAMPD[c]; ctx.beginPath();
        signalHeads(view, (s, px, py, ax, ay, d, st) => { if (st === c) return; const o = (1 - c) * 0.38, x = px + ax * (d + o), y = py + ay * (d + o); ctx.moveTo(x + 0.14, y); ctx.arc(x, y, 0.14, 0, TAU); });
        ctx.fill();
        ctx.fillStyle = LAMPC[c]; ctx.beginPath();
        signalHeads(view, (s, px, py, ax, ay, d, st) => {
          if (st !== c) return; const o = (1 - c) * 0.38, x = px + ax * (d + o), y = py + ay * (d + o);
          ctx.moveTo(x + 0.16, y); ctx.arc(x, y, 0.16, 0, TAU);
          if (S.dark > 0.05) X.addLight(x, y, 3.4, LAMPC[c], 0.55);
        });
        ctx.fill();
      }
    }
    // pigeons in the air (and their shadows)
    const M = ctx.getTransform();
    for (const F of S.flocks) {
      if (F.st !== 'air' || !vis(view, F.x, F.y, 70)) continue;
      birdShadows(ctx, F.birds);
      for (const b of F.birds) if (b.air && vis(view, b.x, b.y, 4)) drawBird(ctx, M, b);
      ctx.setTransform(M);
    }
    if (S.W.cover > 0.02) {   // and on the treetops
      ctx.fillStyle = `rgba(242,246,252,${(0.7 * S.W.cover).toFixed(3)})`; ctx.beginPath();
      for (const tr of X.city.trees) { if (tr.gone || !vis(view, tr.x, tr.y, 3)) continue; const r = 1.2 * tr.s; ctx.moveTo(tr.x - 0.35 + r, tr.y - 0.35); ctx.arc(tr.x - 0.35, tr.y - 0.35, r, 0, TAU); }
      ctx.fill();
    }
    drawLine(ctx, view, t);
    for (const g of S.gulls) if (vis(view, g.x, g.y, 6)) drawGull(ctx, g);
  }
  const SC = ['rgba(232,236,242,', 'rgba(190,215,240,', 'rgba(220,226,232,'];
  function drawParticles(ctx, view, pass) {
    const spr = SPR.soft, vx = view.cx, vy = view.cy, vr = view.r + 3;
    // water droplets: one path, one fill
    ctx.fillStyle = '#bfe0f4'; ctx.globalAlpha = 0.7; ctx.beginPath();
    for (let i = 0; i < NQ; i++) {
      if (QK[i] !== K_WATER) continue;
      const x = QX[i], y = QY[i]; if (Math.abs(x - vx) > vr || Math.abs(y - vy) > vr) continue;
      const s = QS[i] * (1 + QZ[i] * 0.12); ctx.rect(x - s, y - s, s * 2, s * 2);
    }
    ctx.fill();
    for (let i = 0; i < NQ; i++) {
      const k = QK[i]; if (!k || k === K_WATER) continue;
      const x = QX[i], y = QY[i]; if (Math.abs(x - vx) > vr || Math.abs(y - vy) > vr) continue;
      const f = QL[i] / QM[i];
      if (k === K_STEAM || k === K_SPRAY) {
        const s = k === K_STEAM ? QS[i] * (1 + (1 - f) * 2.4) : QS[i] * (1 + (1 - f) * 1.5), a = k === K_STEAM ? 0.32 * Math.min(1, f * 1.6) * Math.min(1, (1 - f) * 6) : 0.3 * f;
        ctx.globalAlpha = a; ctx.drawImage(spr, x - s, y - s, s * 2, s * 2);
      } else {
        ctx.globalAlpha = Math.min(1, f * 3); ctx.fillStyle = BITC[QC[i]];
        const s = QS[i] * (1 + QZ[i] * 0.2);
        if (k === K_PAPER) { ctx.save(); ctx.translate(x, y); ctx.rotate(QR[i]); ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.restore(); }
        else ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    // a gushing hydrant: a white column in the middle of the spray
    for (const p of S.loose) {
      if (!(p.gush > 0) || !vis(view, p.hx, p.hy, 4)) continue;
      const k = Math.min(1, p.gush / 3), pulse = 0.85 + 0.15 * Math.sin(X.time * 30);
      ctx.globalAlpha = 0.85 * k; ctx.drawImage(spr, p.hx - 1.1 * pulse, p.hy - 1.1 * pulse, 2.2 * pulse, 2.2 * pulse);
      ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#d6efff'; ctx.beginPath(); ctx.arc(p.hx, p.hy, 0.35 * pulse, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function drawLine(ctx, view, t) {
    const L = S.line; if (!L) return;
    const along = L.horiz ? view.cx : view.cy, across = L.horiz ? view.cy : view.cx;
    if (Math.abs(across - L.c) > view.r + 12) return;
    const lo = Math.max(L.a0, along - view.r - 20), hi = Math.min(L.a1, along + view.r + 20); if (hi <= lo) return;
    const T = S.train, pp = X.playerPos(), under = Math.abs((L.horiz ? pp.y : pp.x) - L.c) < L.w / 2 + 1.5 && !X.scene;
    const rect = (a0, a1, o0, o1) => { if (L.horiz) ctx.rect(a0, L.c + o0, a1 - a0, o1 - o0); else ctx.rect(L.c + o0, a0, o1 - o0, a1 - a0); };
    const w = L.w / 2, sOn = L.st + L.stLen / 2 > lo && L.st - L.stLen / 2 < hi, sw = 2.5;
    // shadows: the deck, then the train (higher up, longer shadow)
    ctx.save(); ctx.translate(2.6, 3.0);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); rect(lo, hi, -w, w); if (sOn) rect(L.st - L.stLen / 2, L.st + L.stLen / 2, -w - sw, w + sw); ctx.fill();
    ctx.restore();
    if (T) {
      const a = T.a, b = T.a - T.dir * TLEN, t0 = Math.min(a, b), t1 = Math.max(a, b);
      if (t1 > lo && t0 < hi) { ctx.save(); ctx.translate(3.6, 4.4); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); rect(t0, t1, -1.45, 1.45); ctx.fill(); ctx.restore(); }
    }
    ctx.globalAlpha = under ? 0.55 : 1;
    // deck
    ctx.fillStyle = '#6f6d67'; ctx.beginPath(); rect(lo, hi, -w, w); ctx.fill();
    ctx.fillStyle = '#57554f'; ctx.beginPath(); rect(lo, hi, -1.25, 1.25); ctx.fill();
    // station platforms and canopies
    if (sOn) {
      const s0 = L.st - L.stLen / 2, s1 = L.st + L.stLen / 2;
      ctx.fillStyle = '#8e8a82'; ctx.beginPath(); rect(s0, s1, -w - sw, -w + 0.1); rect(s0, s1, w - 0.1, w + sw); ctx.fill();
      ctx.fillStyle = '#e6c229'; ctx.beginPath(); rect(s0, s1, -w + 0.0, -w + 0.25); rect(s0, s1, w - 0.25, w); ctx.fill();
      ctx.fillStyle = '#3d5a73'; ctx.beginPath(); rect(s0 + 5, s1 - 5, -w - sw + 0.2, -w - 0.9); rect(s0 + 5, s1 - 5, w + 0.9, w + sw - 0.2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.08; ctx.beginPath();
      for (let a = s0 + 7; a < s1 - 5; a += 3) { if (L.horiz) { ctx.moveTo(a, L.c - w - sw + 0.2); ctx.lineTo(a, L.c - w - 0.9); ctx.moveTo(a, L.c + w + 0.9); ctx.lineTo(a, L.c + w + sw - 0.2); } else { ctx.moveTo(L.c - w - sw + 0.2, a); ctx.lineTo(L.c - w - 0.9, a); ctx.moveTo(L.c + w + 0.9, a); ctx.lineTo(L.c + w + sw - 0.2, a); } }
      ctx.stroke();
      ctx.save(); ctx.translate(L.horiz ? L.st : L.c - w - sw / 2 - 0.3, L.horiz ? L.c - w - sw / 2 - 0.3 : L.st); if (!L.horiz) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#16314a'; ctx.fillRect(-6, -0.55, 12, 1.1); ctx.fillStyle = '#ffffff'; ctx.font = '800 0.8px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(L.name.toUpperCase(), 0, 0.03);
      ctx.restore();
    }
    // sleepers and rails
    ctx.strokeStyle = '#3d362f'; ctx.lineWidth = 2.3; ctx.setLineDash([0.26, 0.42]); ctx.beginPath();
    if (L.horiz) { ctx.moveTo(lo - (lo % 0.68), L.c); ctx.lineTo(hi, L.c); } else { ctx.moveTo(L.c, lo - (lo % 0.68)); ctx.lineTo(L.c, hi); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#c3c7cf'; ctx.lineWidth = 0.11; ctx.beginPath();
    for (const o of [-0.72, 0.72]) { if (L.horiz) { ctx.moveTo(lo, L.c + o); ctx.lineTo(hi, L.c + o); } else { ctx.moveTo(L.c + o, lo); ctx.lineTo(L.c + o, hi); } }
    ctx.stroke();
    // parapets and catenary masts
    ctx.strokeStyle = '#9a978f'; ctx.lineWidth = 0.22; ctx.beginPath();
    for (const o of [-w + 0.11, w - 0.11]) { if (L.horiz) { ctx.moveTo(lo, L.c + o); ctx.lineTo(hi, L.c + o); } else { ctx.moveTo(L.c + o, lo); ctx.lineTo(L.c + o, hi); } }
    ctx.stroke();
    ctx.fillStyle = '#3a3c42';
    for (let a = Math.ceil(lo / 36) * 36; a < hi; a += 36) { ctx.beginPath(); rect(a - 0.2, a + 0.2, -w - 0.05, -w + 0.45); rect(a - 0.2, a + 0.2, w - 0.45, w + 0.05); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (T) drawTrain(ctx, view, T, lo, hi);
  }
  function drawTrain(ctx, view, T, lo, hi) {
    const L = S.line, th = L.horiz ? (T.dir > 0 ? 0 : Math.PI) : (T.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (let k = 0; k < TCARS; k++) {
      const front = T.a - T.dir * k * (TCLEN + TGAP), mid = front - T.dir * TCLEN / 2;
      if (mid + TCLEN < lo || mid - TCLEN > hi) continue;
      const x = L.horiz ? mid : L.c, y = L.horiz ? L.c : mid, hl = TCLEN / 2, hw = 1.45;
      ctx.save(); ctx.translate(x, y); ctx.rotate(th);
      if (k > 0) { ctx.fillStyle = '#26282d'; ctx.fillRect(hl - 0.1, -0.9, TGAP + 0.2, 1.8); }
      ctx.fillStyle = '#c62f2f'; PG.rr(ctx, -hl, -hw, TCLEN, hw * 2, 0.35); ctx.fill();
      ctx.fillStyle = '#d5d9df'; PG.rr(ctx, -hl + 0.05, -hw + 0.2, TCLEN - 0.1, hw * 2 - 0.4, 0.3); ctx.fill();
      ctx.fillStyle = '#b4bac3'; ctx.fillRect(-hl + 0.6, -0.55, TCLEN - 1.2, 1.1);
      ctx.fillStyle = '#7c828b'; for (const o of [-3.3, 0, 3.3]) ctx.fillRect(o - 0.8, -0.45, 1.6, 0.9);
      if (k === 1) { ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(-0.6, -0.7); ctx.lineTo(0.4, 0); ctx.lineTo(-0.6, 0.7); ctx.closePath(); ctx.stroke(); }
      if (k === 0 || k === TCARS - 1) {   // cabs: yellow nose, dark windscreen
        const e = k === 0 ? 1 : -1;
        ctx.fillStyle = '#f2c230'; PG.rr(ctx, e > 0 ? hl - 0.9 : -hl, -hw, 0.9, hw * 2, 0.35); ctx.fill();
        ctx.fillStyle = '#18222d'; ctx.fillRect(e > 0 ? hl - 1.6 : -hl + 0.9, -hw + 0.3, 0.7, hw * 2 - 0.6);
      }
      ctx.restore();
    }
    // night: headlight cone ahead, the glow from the windows onto the street below
    if (S.dark > 0.08) {
      const fx = L.horiz ? T.a : L.c, fy = L.horiz ? L.c : T.a, dx = L.horiz ? T.dir : 0, dy = L.horiz ? 0 : T.dir;
      X.addLight(fx + dx * 0.3, fy + dy * 0.3, 30, '#fff1cf', 0.9, { cone: { dir: th, spread: 0.32 } });
      for (let k = 0; k < TCARS; k++) { const m = T.a - T.dir * (k * (TCLEN + TGAP) + TCLEN / 2); X.addLight(L.horiz ? m : L.c, L.horiz ? L.c : m, 8, '#ffe2a0', 0.45); }
    }
  }
  function renderOverlay(ctx, view, t) {
    if (!S || X.scene) return;
    const W = S.W, dk = S.dark, R = view.r;
    // lightning strikes: a white-hot spot and the charge running out over the ground
    for (const k of S.strikes) {
      const age = X.time - k.t; if (age > 0.6 || !vis(view, k.x, k.y, 8)) continue;
      const a = 1 - age / 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a; ctx.drawImage(tinted(SPR.glow, '#bcd4ff'), k.x - 4, k.y - 4, 8, 8);
      ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 0.12 * (0.5 + a); ctx.beginPath();
      for (const pts of k.arms) { ctx.moveTo(k.x, k.y); for (let q = 0; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]); }
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // emissive bits at night: signal lamps, lit billboards, train windows
    if (dk > 0.05 && view.scale >= 3.5 && !OFF.emissive) {
      ctx.globalCompositeOperation = 'lighter';
      for (let c = 0; c < 3; c++) {
        const spr = tinted(SPR.glow, LAMPC[c]);
        signalHeads(view, (s, px, py, ax, ay, d, st) => { if (st !== c) return; const o = (1 - c) * 0.38, x = px + ax * (d + o), y = py + ay * (d + o); ctx.globalAlpha = 0.8 * dk; ctx.drawImage(spr, x - 0.9, y - 0.9, 1.8, 1.8); });
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      for (let c = 0; c < 3; c++) {
        ctx.fillStyle = LAMPC[c]; ctx.globalAlpha = Math.min(1, dk * 1.4); ctx.beginPath();
        signalHeads(view, (s, px, py, ax, ay, d, st) => { if (st !== c) return; const o = (1 - c) * 0.38, x = px + ax * (d + o), y = py + ay * (d + o); ctx.moveTo(x + 0.15, y); ctx.arc(x, y, 0.15, 0, TAU); });
        ctx.fill();
      }
      for (const B of S.boards) {
        if (!vis(view, B.x + B.w / 2, B.y + B.h / 2, B.w)) continue;
        let k = 0.82 * dk; if (B.flick) k *= (Math.sin(t * 13 + B.seed * 40) > -0.6 ? 1 : 0.15);
        ctx.globalAlpha = k; ctx.drawImage(adCanvas(B.ad), B.x, B.y, B.w, B.h);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * k; ctx.drawImage(SPR.streak, B.x - B.w * 0.05, B.y + B.h * 0.2, B.w * 1.1, B.h * 1.4); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      drawTrainWindows(ctx, view, dk);
      // moths round the lamps on dry nights
      if (dk > 0.5 && W.rain < 0.15 && view.scale >= 6 && !S.low) {
        ctx.fillStyle = 'rgba(255,243,200,0.75)'; ctx.beginPath();
        let n = 0;
        eachCell(S.lampG, view.cx, view.cy, R, l => {
          if (l.broken || n > 30) return; n++;
          const hx = l.x + l.nx * 1.2, hy = l.y + l.ny * 1.2, ph = hsh(l.x * 0.13 + l.y * 0.71) * 50;
          for (let m = 0; m < 3; m++) { const a = X.time * (2.3 + m * 0.7) + ph + m * 2.1, r = 0.35 + 0.25 * Math.sin(X.time * 1.7 + m + ph); ctx.moveTo(hx + Math.cos(a) * r + 0.04, hy + Math.sin(a * 1.3) * r); ctx.arc(hx + Math.cos(a) * r, hy + Math.sin(a * 1.3) * r, 0.04, 0, TAU); }
        });
        ctx.fill();
      }
    }
    // wet roads mirror the lights
    if (W.wet > 0.1 && view.scale >= 3.5 && !OFF.reflections && !S.low) drawReflections(ctx, view, dk);
    // rain splashes on the ground
    if (W.rain > 0.02 && view.scale >= 5 && !OFF.splashes && !S.low) {
      const now = X.time;
      ctx.strokeStyle = 'rgba(205,220,240,0.5)'; ctx.lineWidth = 0.04; ctx.beginPath();
      for (let i = 0; i < SPN; i++) { const age = now - ST[i]; if (age < 0 || age > 0.12) continue; const r = 0.03 + age * 0.6; ctx.moveTo(SX[i] + r, SY[i]); ctx.arc(SX[i], SY[i], r, 0, TAU); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(205,220,240,0.2)'; ctx.beginPath();
      for (let i = 0; i < SPN; i++) { const age = now - ST[i]; if (age < 0.12 || age > 0.26) continue; const r = 0.03 + age * 0.6; ctx.moveTo(SX[i] + r, SY[i]); ctx.arc(SX[i], SY[i], r, 0, TAU); }
      ctx.stroke();
    }
    // halos round the lamps in fog and rain
    const halo = Math.max(W.fog, W.rain * 0.3) * dk;
    if (halo > 0.05 && view.scale >= 3.5 && !OFF.halos && !S.low) {
      ctx.globalCompositeOperation = 'lighter';
      let nh = 0;
      eachCell(S.lampG, view.cx, view.cy, R + 4, l => {
        if (l.broken || nh > 24) return; nh++;
        const i = S.lampIdx.get(l), spr = tinted(SPR.glow, S.lampCol[i]), hx = l.x + l.nx * 1.2, hy = l.y + l.ny * 1.2, r = 2.2 + 1.6 * W.fog;
        ctx.globalAlpha = 0.3 * halo; ctx.drawImage(spr, hx - r, hy - r, r * 2, r * 2);
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  function drawTrainWindows(ctx, view, dk) {
    const T = S.train, L = S.line; if (!T || !L) return;
    const th = L.horiz ? (T.dir > 0 ? 0 : Math.PI) : (T.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.globalAlpha = Math.min(1, dk * 1.2);
    for (let k = 0; k < TCARS; k++) {
      const mid = T.a - T.dir * (k * (TCLEN + TGAP) + TCLEN / 2), x = L.horiz ? mid : L.c, y = L.horiz ? L.c : mid;
      if (!vis(view, x, y, TCLEN)) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(th);
      ctx.fillStyle = '#ffe7a8';
      for (let wv = -TCLEN / 2 + 1.2; wv < TCLEN / 2 - 1.4; wv += 1.6) { ctx.fillRect(wv, -1.4, 1.15, 0.2); ctx.fillRect(wv, 1.2, 1.15, 0.2); }
      if (k === 0) { ctx.fillStyle = '#fffbe8'; ctx.fillRect(TCLEN / 2 - 0.15, -1.1, 0.15, 0.4); ctx.fillRect(TCLEN / 2 - 0.15, 0.7, 0.15, 0.4); }
      if (k === TCARS - 1) { ctx.fillStyle = '#ff2a1a'; ctx.fillRect(-TCLEN / 2, -1.1, 0.15, 0.4); ctx.fillRect(-TCLEN / 2, 0.7, 0.15, 0.4); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function drawReflections(ctx, view, dk) {
    const W = S.W, k = W.wet * (0.18 + 0.82 * dk), rot = view.rot || 0;
    if (k < 0.03) return;
    // streaks run down the screen, whichever way the camera faces
    const ux = Math.sin(-rot) * -1, uy = Math.cos(-rot);
    const dirA = Math.atan2(uy, ux) - Math.PI / 2;
    ctx.globalCompositeOperation = 'lighter';
    const draw = rot ? (spr, x, y, w, len, a) => { ctx.globalAlpha = a; ctx.save(); ctx.translate(x, y); ctx.rotate(dirA); ctx.drawImage(spr, -w / 2, -len * 0.25, w, len); ctx.restore(); }
      : (spr, x, y, w, len, a) => { ctx.globalAlpha = a; ctx.drawImage(spr, x - w / 2, y - len * 0.25, w, len); };
    if (dk > 0.2) eachCell(S.lampG, view.cx, view.cy, view.r + 2, l => {
      if (l.broken) return; const i = S.lampIdx.get(l), hx = l.x + l.nx * 2.2, hy = l.y + l.ny * 2.2;
      draw(tinted(SPR.streak, S.lampCol[i]), hx, hy, 1.6, 7 + 2 * Math.sin(X.time * 2 + i), 0.3 * k * (0.85 + 0.15 * Math.sin(X.time * 7 + i * 3)));
    });
    const head = tinted(SPR.streak, '#fff1cf'), tail = tinted(SPR.streak, '#ff3020');
    for (const c of X.cars) {
      if (c.removed || c.wrecked || !c.lightsOn || !vis(view, c.x, c.y, 6)) continue;
      const fx = Math.cos(c.th), fy = Math.sin(c.th);
      if (dk > 0.2) draw(head, c.x + fx * (c.len / 2 + 2.5), c.y + fy * (c.len / 2 + 2.5), 1.6, 6, 0.22 * k);
      draw(tail, c.x - fx * (c.len / 2 + 1), c.y - fy * (c.len / 2 + 1), 1.2, c.braking ? 4.5 : 3, (c.braking ? 0.3 : 0.12) * k);
    }
    if (dk > 0.1) for (let c = 0; c < 3; c++) {
      const spr = tinted(SPR.streak, LAMPC[c]);
      signalHeads(view, (s, px, py, ax, ay, d, st) => { if (st !== c) return; const o = (1 - c) * 0.38; draw(spr, px + ax * (d + o), py + ay * (d + o) + 0.3, 1.1, 4.5, 0.32 * k); });
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  let fogCv = null, fogG = null, fogPat = null, fogPatTex = null;
  function drawFog(ctx, view, f, dk, col) {
    const K = 6, cw = view.cw, ch = view.ch, w = Math.ceil(cw / K) + 1, h = Math.ceil(ch / K) + 1;
    if (!fogCv) { fogCv = canvas(w, h); fogG = fogCv.getContext('2d'); }
    if (fogCv.width !== w || fogCv.height !== h) { fogCv.width = w; fogCv.height = h; }
    const g = fogG;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(${col},${(0.26 * f).toFixed(3)})`; g.fillRect(0, 0, w, h);
    const tex = dk > 0.5 ? SPR.fogD : SPR.fogL, sc = 0.32, ox = X.time * api.wind.x * 0.8, oy = X.time * api.wind.y * 0.8;
    if (fogPatTex !== tex) { fogPat = g.createPattern(tex, 'repeat'); fogPatTex = tex; }
    g.setTransform(1 / K, 0, 0, 1 / K, 0, 0); g.translate(view.ax, view.ay); g.rotate(view.rot || 0); g.scale(view.scale, view.scale); g.translate(-view.cx, -view.cy);
    g.translate(ox, oy); g.scale(sc, sc);
    g.globalAlpha = Math.min(1, 1.1 * f); g.fillStyle = fogPat;
    const r = view.r / sc; g.fillRect((view.cx - ox) / sc - r, (view.cy - oy) / sc - r, r * 2, r * 2);
    if (!OFF.vignette) {
      g.setTransform(1 / K, 0, 0, 1 / K, 0, 0);
      const v = dk > 0.5 ? SPR.vigD : SPR.vigL, pos = X.playerPos(), pp = X.toScreen(pos.x, pos.y), s = Math.max(cw, ch) * (1.25 - 0.35 * f);
      g.globalAlpha = Math.min(1, 0.95 * f); g.drawImage(v, pp.x - s / 2, pp.y - s / 2, s, s);
      g.fillStyle = dk > 0.5 ? 'rgba(36,42,56,0.95)' : 'rgba(196,202,210,0.95)';
      const x0 = Math.max(0, pp.x - s / 2), x1 = Math.min(cw, pp.x + s / 2);
      if (pp.x - s / 2 > 0) g.fillRect(0, 0, pp.x - s / 2, ch); if (pp.x + s / 2 < cw) g.fillRect(pp.x + s / 2, 0, cw - pp.x - s / 2, ch);
      if (pp.y - s / 2 > 0) g.fillRect(x0, 0, x1 - x0, pp.y - s / 2); if (pp.y + s / 2 < ch) g.fillRect(x0, pp.y + s / 2, x1 - x0, ch - pp.y - s / 2);
    }
    ctx.drawImage(fogCv, 0, 0, w * K, h * K);
  }
  function renderScreen(ctx, view, t) {
    if (!S || X.scene) return;
    const W = S.W, dk = S.dark, cw = view.cw, ch = view.ch;
    // fog: a flat haze; thick fog adds banks drifting with the wind (anchored to the world) and closes in
    // round the edges, drawn at a sixth of the resolution (it is soft anyway) and blitted up in one go
    if (W.fog > 0.01) {
      const f = W.fog, col = dk > 0.5 ? '40,46,62' : '200,205,214';
      if (f < 0.3 || OFF.fogBanks || S.low) { ctx.fillStyle = `rgba(${col},${(0.26 * f).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
      else drawFog(ctx, view, f, dk, col);
    }
    S.stats.drops = 0; S.stats.flakes = 0;
    if (W.snow > 0.02) {
      const g = W.snow * (1 - dk);
      if (g > 0.01) { ctx.fillStyle = `rgba(205,212,224,${(0.14 * g).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
      const n = Math.floor(RN * 0.75 * W.snow * (S.low ? 0.5 : 1));
      ctx.fillStyle = `rgba(250,252,255,${(0.85 - dk * 0.15).toFixed(3)})`;
      for (let i = 0; i < n; i++) { const z = RZ[i], sz = 1.4 + z * 2.4; ctx.fillRect(RX[i] * cw, RY[i] * ch, sz, sz); }
      S.stats.flakes = n;
    }
    // overcast: grey day under the rain clouds
    if (W.rain > 0.02) {
      const g = W.rain * (1 - dk);
      if (g > 0.01) { ctx.fillStyle = `rgba(60,70,86,${(0.22 * g).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
      // rain streaks: two depths
      const n = Math.floor(RN * Math.min(1, W.rain * 1.05) * (S.low ? 0.5 : 1)), sl = S.slant || 0, len0 = ch * (0.02 + 0.016 * W.rain);
      S.stats.drops = n;
      // thin rects, not stroked lines: a fraction of the cost on a software canvas; a slanted drop is a few stacked pieces
      for (let pass = 0; pass < 2 && !OFF.streaks; pass++) {
        ctx.fillStyle = pass ? `rgba(215,228,246,${(0.36 - dk * 0.08).toFixed(3)})` : `rgba(190,205,228,${(0.22 - dk * 0.05).toFixed(3)})`;
        const w = pass ? 1.4 : 1;
        for (let i = 0; i < n; i++) {
          const z = RZ[i]; if ((z > 0.55) !== !!pass) continue;
          const x = RX[i] * cw, y = RY[i] * ch, len = len0 * (0.6 + z * 1.1), shift = sl * len, pieces = Math.min(4, 1 + Math.floor(Math.abs(shift) / 2.5));
          if (pieces === 1) ctx.fillRect(x - shift / 2, y - len, w, len);
          else { const pl = len / pieces; for (let q = 0; q < pieces; q++) ctx.fillRect(x - shift * (q + 0.5) / pieces, y - pl * (q + 1), w, pl + 0.5); }
        }
      }
    }
    // a strike, seen from above the clouds: a jagged bolt down to the spot
    for (const k of S.strikes) {
      const age = X.time - k.t; if (age > 0.22) continue;
      const q = X.toScreen(k.x, k.y), R = mkR(Math.floor(k.seed * 1e6) + 1 + Math.floor(age * 30));
      ctx.strokeStyle = `rgba(235,242,255,${(1 - age / 0.22).toFixed(3)})`; ctx.lineWidth = 3; ctx.beginPath();
      let x = q.x + (R() - 0.5) * 300, y = -10; ctx.moveTo(x, y);
      for (let n = 1; n <= 9; n++) { const f = n / 9; x += (q.x - x) * (1 / (10 - n)) + (R() - 0.5) * 60 * (1 - f); y = -10 + (q.y + 10) * f; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // lightning
    if (W.flash > 0.01) { ctx.fillStyle = `rgba(225,232,255,${(0.32 * W.flash).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
  }

  // ================= sound =================
  const V = { rain: null, wind: null, hum: null, train: null, alarm: null, gush: null };
  function noiseVoice(k, type, f, Q, pan) {
    const ctx = k.ctx, out = ctx.createGain(); out.gain.value = 0;
    let dest = k.master, pn = null;
    if (pan && ctx.createStereoPanner) { pn = ctx.createStereoPanner(); pn.connect(k.master); dest = pn; }
    out.connect(dest);
    const src = ctx.createBufferSource(); src.buffer = k.noiseBuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; if (Q) flt.Q.value = Q;
    src.connect(flt); flt.connect(out); src.start(ctx.currentTime, Math.random());
    return { out, flt, pan: pn, nodes: [src] };
  }
  function killVoice(v) {
    if (!v) return null;
    try {
      const t = v.out.context.currentTime;
      v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.03);
      for (const n of v.nodes) { try { n.stop(t + 0.3); } catch (e) { /* already stopped */ } }
      setTimeout(() => { try { v.out.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) { /* gone */ } }, 450);
    } catch (e) { /* context closed */ }
    return null;
  }
  function killVoices() { for (const k in V) V[k] = killVoice(V[k]); }
  api.voices = () => Object.keys(V).filter(k => V[k]);
  api.particles = function () {
    const n = { steam: 0, water: 0, spray: 0, paper: 0, crumb: 0, bit: 0 }, names = [null, 'steam', 'water', 'spray', 'paper', 'crumb', 'bit'];
    for (let i = 0; i < NQ; i++) if (QK[i]) n[names[QK[i]]]++;
    return n;
  };
  const setG = (v, g, k, tc) => v.out.gain.setTargetAtTime(g, k.now, tc || 0.25);
  function panOf(x) { const f = X.focus(); return cl((x - f.x) / 40, -0.9, 0.9); }
  function audioUpdate() {
    const on = X.active && S && S.started && G().status === 'play' && !PG.audio.muted;
    const k = on ? PG.audio.kit() : null;
    if (!k) { killVoices(); return; }
    const W = S.W, inside = !!X.scene, f = X.focus();
    // rain on the street (muffled indoors)
    const rv = W.rain * (W.kind === 'storm' ? 0.085 : 0.06) * (inside ? 0.3 : 1);
    if (rv > 0.002) { if (!V.rain) V.rain = noiseVoice(k, 'bandpass', 2600, 0.45); setG(V.rain, rv, k, 0.5); V.rain.flt.frequency.setTargetAtTime(inside ? 700 : 2600, k.now, 0.2); }
    else if (V.rain) V.rain = killVoice(V.rain);
    // wind
    const ws = Math.hypot(api.wind.x, api.wind.y), wv = cl(0.006 + ws * 0.006, 0, 0.04) * (inside ? 0.2 : 1) * (1 - 0.4 * W.snow);
    if (!V.wind) V.wind = noiseVoice(k, 'bandpass', 380, 0.9);
    setG(V.wind, wv, k, 0.6); V.wind.flt.frequency.setTargetAtTime(260 + ws * 90 + Math.sin(X.time * 0.7) * 80, k.now, 0.4);
    // the hum of the traffic nearby
    let moving = 0; if (!inside) for (const c of X.cars) if (!c.removed && Math.abs(c.speed || 0) > 2 && Math.abs(c.x - f.x) < 70 && Math.abs(c.y - f.y) < 70) moving++;
    if (!V.hum) V.hum = noiseVoice(k, 'lowpass', 170, 0.7);
    setG(V.hum, Math.min(0.035, moving * 0.0028) * (inside ? 0.25 : 1), k, 0.5);
    // the train rumbling over the viaduct
    const td = trainDist(), T = S.train;
    if (T && td < 160) {
      if (!V.train) V.train = noiseVoice(k, 'lowpass', 140, 1.2, true);
      const tq = trainPoint();
      setG(V.train, 0.11 * Math.pow(1 - td / 160, 1.6) * (0.25 + 0.75 * Math.min(1, T.v / TCRUISE)) * (inside ? 0.3 : 1), k, 0.15);
      if (V.train.pan && tq) V.train.pan.pan.setTargetAtTime(panOf(tq.x), k.now, 0.1);
    } else if (V.train) V.train = killVoice(V.train);
    // the nearest car alarm
    let al = null, ad = 70;
    for (const a of S.alarms) { const d = Math.hypot(a.car.x - f.x, a.car.y - f.y); if (d < ad) { ad = d; al = a; } }
    if (al) {
      if (!V.alarm) {
        const ctx = k.ctx, out = ctx.createGain(); out.gain.value = 0; out.connect(k.master);
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'sawtooth'; lfo.frequency.value = 1.6; lg.gain.value = 420; lfo.connect(lg); lg.connect(o.frequency);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; o.connect(lp); lp.connect(out);
        o.start(); lfo.start();
        V.alarm = { out, nodes: [o, lfo] };
      }
      setG(V.alarm, 0.03 * Math.pow(1 - ad / 70, 1.5) * (inside ? 0.2 : 1), k, 0.05);
    } else if (V.alarm) V.alarm = killVoice(V.alarm);
    // a gushing hydrant nearby
    let gd = 40; for (const p of S.loose) if (p.gush > 0) gd = Math.min(gd, Math.hypot(p.hx - f.x, p.hy - f.y));
    if (gd < 40 && !inside) { if (!V.gush) V.gush = noiseVoice(k, 'highpass', 1800, 0.5); setG(V.gush, 0.04 * Math.pow(1 - gd / 40, 2), k, 0.1); }
    else if (V.gush) V.gush = killVoice(V.gush);
  }
  function one(fn) { if (G().status !== 'play') return; const k = PG.audio.kit(); if (!k) return; try { fn(k, k.now); } catch (e) { /* audio hiccup */ } }
  function vol(x, y, r) { const f = X.focus(); return Math.max(0, 1 - Math.hypot(x - f.x, y - f.y) / (r || 40)) * (X.scene ? 0.2 : 1); }
  function panDest(k, x) { if (!k.ctx.createStereoPanner) return undefined; const p = k.ctx.createStereoPanner(); p.pan.value = panOf(x); p.connect(k.master); setTimeout(() => { try { p.disconnect(); } catch (e) { /* gone */ } }, 6000); return p; }
  function sfxThunder(n) { one((k, t) => { const g = 0.32 * n * (X.scene ? 0.35 : 1); if (n > 0.75) k.noise(t, 0.22, g * 0.8, 'highpass', 1800); k.noise(t + 0.03, 3.4, g, 'lowpass', 420, { to: 70, attack: 0.08 }); k.tone('sine', 52, t, 2.8, g * 0.7, { to: 30, attack: 0.1 }); }); }
  function sfxHydrant(x, y) { const v = vol(x, y, 45); if (v <= 0) return; one((k, t) => { k.tone('square', 880, t, 0.12, 0.05 * v, { to: 600, lp: 2500 }); k.noise(t, 0.7, 0.22 * v, 'highpass', 2200, { dest: panDest(k, x) }); k.noise(t, 0.3, 0.25 * v, 'lowpass', 300); }); }
  function sfxClang(x, y, pitch) { const v = vol(x, y, 40); if (v <= 0) return; one((k, t) => { const d = panDest(k, x); k.tone('triangle', 520 * pitch, t, 0.22, 0.09 * v, { to: 380 * pitch, dest: d }); k.noise(t, 0.12, 0.18 * v, 'bandpass', 2400 * pitch, { Q: 2, dest: d }); }); }
  function sfxThud(x, y) { const v = vol(x, y, 40); if (v <= 0) return; one((k, t) => { k.tone('sine', 140, t, 0.25, 0.25 * v, { to: 60 }); k.noise(t, 0.2, 0.2 * v, 'lowpass', 700); }); }
  function sfxGlass(x, y) { const v = vol(x, y, 45); if (v <= 0) return; one((k, t) => { k.noise(t, 0.4, 0.3 * v, 'highpass', 3200); for (let i = 0; i < 9; i++) k.tone('sine', 2800 + Math.random() * 3600, t + Math.random() * 0.3, 0.09, 0.04 * v); }); }
  function sfxCoins(x, y) { const v = vol(x, y, 30); if (v <= 0) return; one((k, t) => { for (let i = 0; i < 3; i++) { k.tone('square', 1900 + i * 420, t + i * 0.06, 0.06, 0.025 * v, { lp: 5000 }); k.tone('triangle', 2600 + i * 300, t + i * 0.06 + 0.02, 0.1, 0.03 * v); } }); }
  function sfxSplash(x, y, s) { const v = vol(x, y, 35) * s; if (v <= 0.02) return; one((k, t) => k.noise(t, 0.35, 0.16 * v, 'bandpass', 1300, { to: 450, Q: 0.8, dest: panDest(k, x) })); }
  function sfxFlutter(x, y, n) {
    const v = vol(x, y, 35) * Math.min(1, n / 8); if (v <= 0.02) return;
    one((k, t) => {
      const g = k.noise(t, 0.7, 0.09 * v, 'bandpass', 1500, { Q: 0.7, dest: panDest(k, x) });
      const l = k.ctx.createOscillator(), lg = k.ctx.createGain(); l.frequency.value = 17; lg.gain.value = 0.05 * v; l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + 0.8);
    });
  }
  function sfxCoo(x, y) { const v = vol(x, y, 25); if (v <= 0.02) return; one((k, t) => { k.tone('sine', 410, t, 0.3, 0.025 * v, { to: 330, vib: [11, 30] }); k.tone('sine', 390, t + 0.38, 0.4, 0.022 * v, { to: 300, vib: [10, 25] }); }); }
  function sfxMeow(x, y, hiss) {
    const v = vol(x, y, 30); if (v <= 0.02) return;
    one((k, t) => { if (hiss) k.noise(t, 0.45, 0.07 * v, 'highpass', 3000); else { k.tone('sawtooth', 620, t, 0.45, 0.03 * v, { to: 880, lp: 1700, vib: [6, 20], dest: panDest(k, x) }); k.tone('sawtooth', 860, t + 0.3, 0.35, 0.025 * v, { to: 520, lp: 1700 }); } });
  }
  function sfxPurr(x, y) {
    one((k, t) => {
      const g = k.noise(t, 2.2, 0.06, 'lowpass', 160, { attack: 0.2 });
      const l = k.ctx.createOscillator(), lg = k.ctx.createGain(); l.frequency.value = 24; lg.gain.value = 0.045; l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + 2.4);
    });
  }
  function sfxTrainChime() { one((k, t) => { [659.25, 523.25, 392].forEach((f, i) => k.tone('triangle', f, t + i * 0.32, 0.5, 0.035)); }); }
  function sfxTrainHorn(v) { one((k, t) => { k.tone('sawtooth', 311, t, 1.1, 0.045 * v, { lp: 1300, attack: 0.06 }); k.tone('sawtooth', 370, t, 1.1, 0.04 * v, { lp: 1300, attack: 0.06 }); }); }
  function soundsTick(dt) {
    const s = S.snd, f = X.focus(), quiet = X.scene ? 0.25 : 1;
    // a siren somewhere far away (only while the police are not after you)
    s.siren -= dt;
    if (s.siren <= 0) { s.siren = rand(35, 80); if (!(P.wanted > 0)) one((k, t) => { const p = panDest(k, f.x + rand(-60, 60)); k.tone('triangle', 720, t, 6.5, 0.012 * quiet, { lp: 1300, vib: [0.32, 170], attack: 1.2, dest: p }); }); }
    // dogs
    s.dog -= dt;
    if (s.dog <= 0) {
      s.dog = rand(18, 45); const n = 2 + Math.floor(Math.random() * 3), far = rand(0.3, 1);
      one((k, t) => { const p = panDest(k, f.x + rand(-50, 50)); for (let i = 0; i < n; i++) { const tt = t + i * rand(0.24, 0.36); k.noise(tt, 0.08, 0.12 * far * quiet, 'bandpass', 850, { Q: 1.4, dest: p }); k.tone('sawtooth', 330, tt, 0.11, 0.04 * far * quiet, { to: 220, lp: 1100, dest: p }); } });
    }
    // pigeons cooing close by
    s.coo -= dt;
    if (s.coo <= 0) { s.coo = rand(5, 12); let best = null, bd = 18; for (const F of S.flocks) { if (F.st !== 'ground') continue; const d = Math.hypot(F.x - f.x, F.y - f.y); if (d < bd) { bd = d; best = F; } } if (best) sfxCoo(best.x, best.y); }
    // crickets in the parks on dry nights
    s.cricket -= dt;
    if (s.cricket <= 0) {
      s.cricket = rand(0.25, 0.9);
      if (S.dark > 0.6 && S.W.rain < 0.1 && !X.scene && nearPark(f.x, f.y)) { S.stats.crickets++; one((k, t) => { const f0 = rand(4000, 4600); for (let i = 0; i < 3; i++) k.tone('sine', f0, t + i * 0.045, 0.025, 0.006); }); }
    }
    // a signalled crossing ticks for the blind: slow while you wait, fast while you may walk
    s.tick -= dt;
    if (s.tick <= 0) {
      s.tick = 0.9;
      if (!P.car && !X.scene && P.ped) {
        const q = api.signalAt(P.ped.x, P.ped.y);
        if (q && Math.abs(P.ped.x - q.x) < S.sig.get(q.i * 64 + q.j).vw / 2 + 6 && Math.abs(P.ped.y - q.y) < S.sig.get(q.i * 64 + q.j).hw / 2 + 6) {
          const walk = q.walkH || q.walkV; s.tick = walk ? 0.16 : 0.9; S.stats.ticks++;
          one((k, t) => k.tone('square', walk ? 2200 : 1500, t, 0.012, 0.012, { lp: 4000 }));
        }
      }
    }
    // gulls
    s.gull -= dt;
    if (s.gull <= 0) { s.gull = rand(4, 11); const g = S.gulls[Math.floor(Math.random() * S.gulls.length)]; if (g && Math.hypot(g.x - f.x, g.y - f.y) < 50) one((k, t) => { const d = panDest(k, g.x); k.tone('sine', 1700, t, 0.22, 0.016, { to: 1100, dest: d }); k.tone('sine', 1650, t + 0.26, 0.3, 0.013, { to: 900, dest: d }); }); }
    // the church bell: midnight, six, noon, six
    const h = Math.floor(X.clock / 60);
    if (h !== s.hour) { s.hour = h; if (h % 6 === 0) { const n = h % 12 === 0 ? 4 : 2; one((k, t) => { for (let i = 0; i < n; i++) { const tt = t + i * 1.9; k.tone('sine', 196, tt, 3.6, 0.045 * quiet, { attack: 0.004 }); k.tone('sine', 196 * 2.76, tt, 2.2, 0.018 * quiet, { attack: 0.004 }); k.tone('sine', 196 * 5.4, tt, 1.2, 0.008 * quiet, { attack: 0.004 }); } }); } }
    // the train: clack-clack over the rail joints, a horn as it passes close
    const T = S.train;
    if (T && T.v > 2) {
      const td = trainDist();
      if (td < 110) {
        s.clack -= dt;
        if (s.clack <= 0) { s.clack = 13 / T.v; const v = Math.pow(1 - td / 110, 1.5) * quiet; one((k, t) => { k.noise(t, 0.05, 0.16 * v, 'lowpass', 1200); k.noise(t + 0.12, 0.05, 0.13 * v, 'lowpass', 1100); }); }
        if (!T.horn && td < 70) { T.horn = true; if (Math.random() < 0.6) sfxTrainHorn(Math.pow(1 - td / 110, 1.2) * quiet); }
      }
    }
  }

  // ================= HUD: a small weather label under the clock =================
  let hudEl = null, hudTxt = '';
  const WX_TXT = { clear: '', rain: 'RAIN', storm: 'STORM', fog: 'FOG', snow: 'SNOW' }, WX_COL = { clear: '#c9cdd6', rain: '#8fb6ff', storm: '#c7a8ff', fog: '#b8c0cc', snow: '#e6f0ff' };
  function hud() {
    audioUpdate();
    if (!S) return;
    if (!hudEl || !hudEl.isConnected) {
      const host = document.querySelector('#gta-hud .g-tr') || document.getElementById('gta-hud'); if (!host) return;
      if (!document.getElementById('amb-css')) { const st = document.createElement('style'); st.id = 'amb-css'; st.textContent = '#gta-hud .amb-wx { font-weight: 800; font-size: 13px; letter-spacing: .12em; text-shadow: 0 2px 0 #000; font-variant-numeric: tabular-nums; }'; document.head.appendChild(st); }
      hudEl = document.createElement('div'); hudEl.className = 'amb-wx'; hudEl.hidden = true;
      const clock = host.querySelector('.g-clock'); if (clock && clock.nextSibling) host.insertBefore(hudEl, clock.nextSibling); else host.appendChild(hudEl);
      hudTxt = '';
    }
    const W = S.W, txt = X.scene ? '' : WX_TXT[W.kind];
    if (txt !== hudTxt) { hudTxt = txt; hudEl.hidden = !txt; hudEl.textContent = txt; hudEl.style.color = WX_COL[W.kind]; }
  }

  // ================= events =================
  X.on('gunfire', e => {
    if (!X.active || !S || !e || X.scene) return;
    const x = e.x != null ? e.x : e.by && e.by.x, y = e.y != null ? e.y : e.by && e.by.y; if (x == null) return;
    scareAll(x, y, Math.max(30, e.radius || 0), true);
    if (Math.random() < 0.4) S.snd.dog = Math.min(S.snd.dog, rand(0.8, 2.5));
    // the shot itself: did it hit a hydrant, a bin, a meter?
    const s = e.by && e.by.kind === 'ped' ? e.by : null; if (!s) return;
    const W = X.WEAPONS && X.WEAPONS[e.weapon]; if (W && W.kind !== 'gun') return;
    const a = s.aim != null ? s.aim : s.th, ca = Math.cos(a), sa = Math.sin(a), R = W && W.range ? W.range : 35;
    const h = X.raycast(s.x, s.y, s.x + ca * R, s.y + sa * R, { cars: true, peds: true, ignore: s.car ? [s, s.car] : s });
    if (h && h.kind === 'solid' && h.obj.amb) hitProp(h.obj.amb, (W && W.dmg) || 30, s, 'bullet', ca, sa);
  });
  X.on('explosion', e => {
    if (!X.active || !S || !e || X.scene) return;
    const R = 5 + 4.5 * (e.power || 1);
    const hit = [];
    eachCell(S.grid, e.x, e.y, R, p => { if (p.st === 0 && Math.hypot(p.x - e.x, p.y - e.y) < R) hit.push(p); });
    for (const p of hit) {
      const d = Math.hypot(p.x - e.x, p.y - e.y), k = (1 - d / R) * 16 + 3, ux = (p.x - e.x) / (d || 1), uy = (p.y - e.y) / (d || 1);
      knock(p, ux * k, uy * k, e.by, 'explosion');
    }
    for (const p of S.loose) { const d = Math.hypot(p.x - e.x, p.y - e.y); if (d < R && p.type !== 'busstop') { const k = (1 - d / R) * 14; p.st = 2; p.vx += (p.x - e.x) / (d || 1) * k; p.vy += (p.y - e.y) / (d || 1) * k; p.vr = rand(-12, 12); } }
    for (const l of S.litter) { const d = Math.hypot(l.x - e.x, l.y - e.y); if (d < R * 2) { l.vx += (l.x - e.x) / (d || 1) * 9; l.vy += (l.y - e.y) / (d || 1) * 9; l.vr = rand(-15, 15); l.z = 2; } }
    scareAll(e.x, e.y, 70, true);
    for (const c of X.cars) if (idleCar(c) && Math.hypot(c.x - e.x, c.y - e.y) < 28 && Math.random() < 0.7) startAlarm(c);
    S.snd.dog = Math.min(S.snd.dog, rand(1, 3));
  });
  X.on('carImpact', e => {
    if (!X.active || !S || !e || !e.car) return;
    const c = e.car;
    if (idleCar(c) && e.speed > 2.2 && Math.random() < 0.65) startAlarm(c);
    if (e.other && idleCar(e.other) && e.speed > 2.2 && Math.random() < 0.65) startAlarm(e.other);
  });
  X.on('carHurt', e => { if (!X.active || !S || !e || !e.car) return; if ((e.kind === 'bullet' || e.kind === 'melee') && idleCar(e.car)) startAlarm(e.car); });
  X.on('enterCar', e => { if (!X.active || !S || !e || !e.car) return; const h = X.places && X.places.hideout, home = h && Math.hypot(e.car.x - h.door.x, e.car.y - h.door.y) < 14; if (e.car._ambParked && !home && Math.random() < 0.22) startAlarm(e.car, rand(3, 6)); const i = S.alarms.findIndex(a => a.car === e.car); if (i >= 0 && X.time - S.alarms[i].t0 > 3) S.alarms.splice(i, 1); });
  X.on('horn', e => { if (!X.active || !S || !e || !e.car) return; scareAll(e.car.x, e.car.y, 12, false); });
  // remember which cars were parked, for the alarm on a stolen car
  function markParked() { for (const c of X.cars) if (c.ctrl === 'parked' && !c._ambParked) c._ambParked = true; }

  X.mod('ambient', {
    order: 80,
    init,
    stop,
    tick(dt) { tick(dt); if (S) { S.mpT = (S.mpT || 0) - dt; if (S.mpT <= 0) { S.mpT = 1; markParked(); } } },
    hud,
    render: { ground: renderGround, props: renderProps, buildings: renderBuildings, cars: renderCars, peds: renderPeds, air: renderAir, overlay: renderOverlay, screen: renderScreen },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
