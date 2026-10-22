// Retail & shopping building themes for interiors.js: a shopping mall, a fashion boutique, a supermarket,
// an electronics store, a pharmacy, a barber, a jewellery store and a pawn shop. Each registers itself
// through PG.gta.interiors.define(); furniture drawers are prefixed rt_.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta; if (!X || !X.interiors || !X.interiors.define) return;
  const K0 = X.interiors.kit;
  const { rect, rr, disc, oval, ln, wtext, shade, sh, pick, rand, PRODUCTS } = K0;
  const TAU = Math.PI * 2, PI = Math.PI;

  // ---------- shared helpers ----------
  const staff = (sc, role) => sc.peds.find(q => q.ai && q.ai.owner === 'interiors' && q.ai.role === role && !q.dead && !q.removed && q.ai.st !== 'flee' && q.ai.st !== 'cower' && q.ai.st !== 'fight');
  const talk = (sc, role, text, col) => { const p = staff(sc, role); if (p) K0.say(p, text, col); return p; };
  function pay(K, price, why) {
    if (K.P.money < price) { K.popup(pick(['Not enough money. Kortet ble avvist.', 'Insufficient funds. Ask Artur for an advance?'])); K.sfx('deny'); return false; }
    K.money(-price, why || 'shop', K.P.ped.x, K.P.ped.y); K.sfx('cash'); return true;
  }
  const hpUp = (K, n) => { const p = K.P.ped; p.hp = Math.min(p.maxHp, p.hp + n); };
  const crime = (K, kind, o) => { try { if (X.crime) K.crime(kind, K.P.ped.x, K.P.ped.y, o || {}); } catch (e) { /* no police module */ } };
  function restyle(K, o) { const p = K.P.ped; p.look = Object.assign({}, p.look || {}, o); X.emit && X.emit('playerLook', { look: p.look }); }
  // smash a glass display, grab what is inside, ring the alarm
  function smashGrab(K, sc, f, amt, what) {
    const p = K.P.ped;
    if (!f.broken) { f.broken = true; PG.burst && PG.burst(f.x, f.y, 'debris', 12, 4, 0.8, 0.12, ['#cfe8ff', '#9fd0e8', '#ffffff']); X.decal && X.decal(f.x, f.y + 0.4, 'glass', 1.1); K.sfx('glass'); X.emit('interiorSmash', { scene: sc, item: f.t }); }
    if (f.looted) return;
    f.looted = true; K.money(amt, 'loot', p.x, p.y); K.sfx('cash');
    K.popup('Grabbed ' + what + ': $' + amt);
    if (!sc.st.rtAlarm) { sc.st.rtAlarm = 1; sc.st.bellT = 25; K.alarm(sc); }
    crime(K, 'robbery', { amount: amt });
  }
  const glow = (c, x, y, r, col, a) => { c.globalAlpha = a; disc(c, x, y, r, col); c.globalAlpha = 1; };

  // ---------- furniture ----------
  const FURN = {
    rt_fountain(c, f, hw, hh, t) {
      disc(c, 0.15, 0.2, hw, 'rgba(0,0,0,0.3)'); disc(c, 0, 0, hw, '#bdb6a6'); disc(c, 0, 0, hw * 0.86, '#2f7fae');
      for (let i = 0; i < 3; i++) { const r = ((t * 0.6 + i / 3) % 1) * hw * 0.8; c.strokeStyle = 'rgba(255,255,255,' + (0.5 - r / hw * 0.5) + ')'; c.lineWidth = 0.06; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
      for (let i = 0; i < 9; i++) disc(c, Math.cos(i * 2.3 + f.seed * 9) * hw * 0.6, Math.sin(i * 1.7) * hw * 0.55, 0.06, '#d4af37');
      disc(c, 0, 0, hw * 0.25, '#d8d1c0'); disc(c, 0, 0, hw * 0.13, '#cfe8ff');
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t, r = hw * (0.2 + 0.12 * Math.sin(t * 4 + i)); disc(c, Math.cos(a) * r, Math.sin(a) * r, 0.05, 'rgba(230,248,255,0.85)'); }
    },
    rt_escalator(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5a5f68');
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -hw + 0.15 : 0.1, w = hw - 0.25;
        rect(c, x0, -hh + 0.15, w, 2 * hh - 0.3, '#2b2e34');
        const off = ((t * 0.8 * s) % 0.4 + 0.4) % 0.4;
        for (let y = -hh + 0.2 + off; y < hh - 0.2; y += 0.4) rect(c, x0 + 0.05, y, w - 0.1, 0.05, '#8a9099');
        rect(c, x0 - 0.06, -hh + 0.1, 0.06, 2 * hh - 0.2, '#1b1d22'); rect(c, x0 + w, -hh + 0.1, 0.06, 2 * hh - 0.2, '#1b1d22');
        wtext(c, s < 0 ? '▲' : '▼', x0 + w / 2, hh - 0.35, 0.3, s < 0 ? '#7dff9a' : '#ff6a5a');
      }
    },
    rt_mannequin(c, f, hw, hh) {
      disc(c, 0.08, 0.1, hw * 0.9, 'rgba(0,0,0,0.25)'); disc(c, 0, 0, hw * 0.55, '#2b2d33');
      oval(c, 0, 0, hw * 0.45, hw * 0.85, 0, f.c || '#d64a8f'); disc(c, 0, -hw * 0.9 * 0, hw * 0.28, '#efe6d8'); disc(c, -0.04, -0.04, hw * 0.1, 'rgba(255,255,255,0.6)');
      if (f.c2) rect(c, -hw * 0.45, hw * 0.2, hw * 0.9, hw * 0.15, f.c2);
    },
    rt_rail(c, f, hw, hh) {
      const along = hw > hh, n = Math.floor((along ? hw : hh) * 2 / 0.22);
      ln(c, along ? -hw : 0, along ? 0 : -hh, along ? hw : 0, along ? 0 : hh, '#9aa0a8', 0.06);
      for (let i = 0; i < n; i++) {
        const s = -(along ? hw : hh) + 0.11 + i * 0.22, col = (f.pal || PRODUCTS)[(i * 7 + Math.floor(f.seed * 50)) % (f.pal || PRODUCTS).length];
        if (along) rr(c, s - 0.09, -hh, 0.18, 2 * hh, 0.05, col); else rr(c, -hw, s - 0.09, 2 * hw, 0.18, 0.05, col);
      }
      disc(c, along ? -hw : 0, along ? 0 : -hh, 0.08, '#6d737b'); disc(c, along ? hw : 0, along ? 0 : hh, 0.08, '#6d737b');
    },
    rt_mirror(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, f.frame || '#d4af37'); rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#b8d8e8'); c.globalAlpha = 0.5; ln(c, -hw + 0.15, hh - 0.1, hw - 0.1, -hh + 0.15, '#fff', 0.05); c.globalAlpha = 1; },
    rt_booth(c, f, hw, hh, t) {
      rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a2f2a'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#d9cdb8');
      const n = 7; for (let i = 0; i < n; i++) rect(c, -hw + 0.05 + i * (2 * hw - 0.1) / n, hh - 0.2, (2 * hw - 0.1) / n - 0.04, 0.2 + Math.sin(t * 2 + i) * 0.02, f.c || '#8a1f3a');
      rect(c, hw - 0.4, -hh + 0.12, 0.25, 0.04, '#9aa0a8');
    },
    rt_aisle(c, f, hw, hh) {
      sh(c, hw, hh, 0.32); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c9ccd1'); rect(c, -0.03, -hh, 0.06, 2 * hh, '#8a8f96');
      const along = hw > hh, L = along ? hw : hh, s0 = Math.floor(f.seed * 97);
      for (let i = 0, s = -L + 0.08; s < L - 0.2; i++) {
        const w = 0.18 + ((i * 13 + s0) % 5) * 0.05, col = PRODUCTS[(i * 5 + s0) % PRODUCTS.length];
        if (along) { rect(c, s, -hh + 0.06, w - 0.03, hh - 0.12, col); rect(c, s, 0.06, w - 0.03, hh - 0.12, PRODUCTS[(i * 3 + s0 + 4) % PRODUCTS.length]); }
        else { rect(c, -hw + 0.06, s, hw - 0.12, w - 0.03, col); rect(c, 0.06, s, hw - 0.12, w - 0.03, PRODUCTS[(i * 3 + s0 + 4) % PRODUCTS.length]); }
        s += w;
      }
      if (f.label) wtext(c, f.label, 0, along ? 0 : -hh - 0.25, 0.26, '#2b2d33', 800);
    },
    rt_checkout(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2f5a8a'); rect(c, -hw + 0.08, -hh + 0.1, 2 * hw * 0.62, 2 * hh - 0.2, '#1b1d22');
      const off = (t * 0.5) % 0.3; for (let x = -hw + 0.1 + off; x < -hw + 2 * hw * 0.62; x += 0.3) rect(c, x, -hh + 0.1, 0.03, 2 * hh - 0.2, '#3a3d44');
      rect(c, -hw + 0.4, -0.12, 0.25, 0.2, '#f2c230'); rect(c, -hw + 0.9, -0.15, 0.18, 0.28, '#c0392b');
      rect(c, hw - 0.62, -hh + 0.1, 0.5, 0.36, '#2b2d33'); rect(c, hw - 0.58, -hh + 0.14, 0.42, 0.14, '#7dff9a');
      glow(c, hw * 0.25, 0, 0.12, '#ff3a3a', 0.4 + 0.3 * Math.sin(t * 9));
    },
    rt_trolley(c, f, hw, hh) {
      sh(c, hw, hh, 0.2); c.strokeStyle = '#9aa0a8'; c.lineWidth = 0.05; c.strokeRect(-hw + 0.05, -hh + 0.05, 2 * hw - 0.1, 2 * hh - 0.25);
      for (let x = -hw + 0.2; x < hw - 0.1; x += 0.16) ln(c, x, -hh + 0.05, x, hh - 0.2, 'rgba(154,160,168,0.6)', 0.02);
      rect(c, -hw, hh - 0.15, 2 * hw, 0.1, '#c0392b');
      if (f.full) for (let i = 0; i < 4; i++) rect(c, -hw + 0.15 + i * 0.18, -hh + 0.15 + (i % 2) * 0.2, 0.16, 0.22, PRODUCTS[(i * 5 + 1) % PRODUCTS.length]);
    },
    rt_tvwall(c, f, hw, hh, t) {
      rect(c, -hw, -hh, 2 * hw, 2 * hh, '#111216');
      const n = Math.max(2, Math.round(hw * 2 / 1.3)), w = (2 * hw - 0.1) / n;
      for (let i = 0; i < n; i++) {
        const x = -hw + 0.05 + i * w;
        if (f.broken && i % 2) { rect(c, x + 0.04, -hh + 0.05, w - 0.08, 2 * hh - 0.1, '#222'); continue; }
        const hue = (t * 40 + i * 25) % 360;
        c.fillStyle = 'hsl(' + hue + ',70%,45%)'; c.fillRect(x + 0.04, -hh + 0.05, w - 0.08, 2 * hh - 0.1);
        const bx = x + 0.04 + ((t * 0.6 + i * 0.3) % 1) * (w - 0.2);
        rect(c, bx, -hh + 0.1, 0.12, 2 * hh - 0.2, 'rgba(255,255,255,0.35)');
        if (i === 1) wtext(c, 'SALE', x + w / 2, 0, 0.22, '#fff', 900);
      }
    },
    rt_phones(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.15, '#e9e4d8'); rr(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, 0.1, '#f7f4ee');
      const n = Math.floor(hw * 2 / 0.45);
      for (let i = 0; i < n; i++) { const x = -hw + 0.2 + i * 0.45; rr(c, x, -0.2, 0.22, 0.4, 0.04, '#1b1d22'); rect(c, x + 0.03, -0.16, 0.16, 0.32, 'hsl(' + ((t * 30 + i * 60) % 360) + ',60%,55%)'); }
    },
    rt_medshelf(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#eef2f5'); const along = hw > hh, L = along ? hw : hh;
      for (let s = -L + 0.1, i = 0; s < L - 0.15; s += 0.2, i++) { const col = ['#ffffff', '#3fae6a', '#e9e4d8', '#3f7fd0', '#c0392b', '#f2c230'][(i + Math.floor(f.seed * 9)) % 6]; if (along) rect(c, s, -hh + 0.1, 0.15, 2 * hh - 0.2, col); else rect(c, -hw + 0.1, s, 2 * hw - 0.2, 0.15, col); }
    },
    rt_barberchair(c, f, hw, hh) {
      disc(c, 0.1, 0.12, hw, 'rgba(0,0,0,0.3)'); disc(c, 0, 0, hw * 0.55, '#9aa0a8');
      rr(c, -hw * 0.75, -hh * 0.7, hw * 1.5, hh * 1.4, 0.12, f.c || '#8a1f1a'); rect(c, -hw * 0.75, -hh * 0.7, hw * 0.3, hh * 1.4, shade(f.c || '#8a1f1a', -0.3));
      rect(c, -hw * 0.6, -hh * 0.85, hw * 1.2, 0.08, '#d8dde4'); rect(c, -hw * 0.6, hh * 0.77, hw * 1.2, 0.08, '#d8dde4');
    },
    rt_pole(c, f, hw, hh, t) {
      disc(c, 0, 0, hw, '#d8dde4'); c.save(); c.beginPath(); c.arc(0, 0, hw * 0.8, 0, TAU); c.clip();
      for (let i = -3; i < 4; i++) { const o = i * hw * 0.6 + ((t * 0.5) % 1) * hw * 0.6; ln(c, o - hw, -hw, o + hw, hw, i % 2 ? '#c0392b' : '#2f6fb5', hw * 0.25); }
      c.restore();
    },
    rt_hairfloor(c, f, hw, hh) { c.globalAlpha = 0.6; for (let i = 0; i < 14; i++) { const a = i * 2.39 + f.seed * 7, r = (i / 14) * hw; ln(c, Math.cos(a) * r, Math.sin(a) * r * hh / hw, Math.cos(a) * r + 0.12, Math.sin(a) * r * hh / hw + 0.05, i % 3 ? '#3a2a1a' : '#c9a46a', 0.025); } c.globalAlpha = 1; },
    rt_jewelcase(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.32); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2a2433'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#3a1f3a');
      if (!f.looted) {
        const n = Math.floor(hw * 2 / 0.35);
        for (let i = 0; i < n; i++) {
          const x = -hw + 0.25 + i * 0.35, gem = ['#5af0ff', '#ff4a8a', '#b6ff3a', '#ffffff', '#ffd23a'][(i + Math.floor(f.seed * 7)) % 5];
          c.strokeStyle = '#d4af37'; c.lineWidth = 0.03; c.beginPath(); c.arc(x, 0, 0.08, 0, TAU); c.stroke(); disc(c, x, -0.08, 0.04, gem);
          glow(c, x, -0.08, 0.04 + 0.03 * Math.max(0, Math.sin(t * 3 + i * 1.7)), '#fff', 0.7);
        }
      }
      if (f.broken) { c.strokeStyle = 'rgba(220,240,255,0.7)'; c.lineWidth = 0.02; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i) * hw, Math.sin(i * 1.3) * hh); c.stroke(); } }
      else { rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, 'rgba(200,230,255,0.18)'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 0.04, 'rgba(255,255,255,0.6)'); }
    },
    rt_junk(c, f, hw, hh) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5a4030'); const s0 = Math.floor(f.seed * 50), along = hw > hh, L = along ? hw : hh;
      for (let s = -L + 0.3, i = 0; s < L - 0.2; s += 0.6, i++) {
        const k = (i + s0) % 5, x = along ? s : 0, y = along ? 0 : s;
        if (k === 0) { oval(c, x, y, 0.22, 0.16, 0, '#b5651d'); disc(c, x, y, 0.06, '#1b1d22'); rect(c, x + 0.15, y - 0.03, 0.3, 0.06, '#3a2a1a'); }
        else if (k === 1) { rr(c, x - 0.22, y - 0.16, 0.44, 0.32, 0.04, '#2b2d33'); rect(c, x - 0.17, y - 0.11, 0.3, 0.22, '#4a6a5a'); }
        else if (k === 2) { disc(c, x, y, 0.18, '#d4af37'); disc(c, x, y, 0.12, '#f2ead8'); ln(c, x, y, x + 0.08, y - 0.05, '#222', 0.02); }
        else if (k === 3) { rect(c, x - 0.2, y - 0.2, 0.4, 0.4, '#8a1f1a'); disc(c, x, y, 0.12, '#1b1d22'); }
        else { rr(c, x - 0.1, y - 0.22, 0.2, 0.44, 0.05, '#c9ccd1'); disc(c, x, y - 0.1, 0.05, '#2b2d33'); }
      }
    },
    rt_stall(c, f, hw, hh, t) {
      sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#c0392b'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.6, '#e9e4d8');
      for (let i = 0; i < 4; i++) disc(c, -hw + 0.4 + i * (2 * hw - 0.8) / 3, -0.1, 0.16, ['#b5651d', '#f2c230', '#3e8e5a', '#c0392b'][i]);
      for (let i = 0; i < 3; i++) glow(c, -0.4 + i * 0.4, -0.3 - ((t * 0.7 + i * 0.3) % 1) * 0.5, 0.1, '#fff', 0.25);
      wtext(c, f.text || 'KEBAB', 0, hh - 0.25, 0.28, '#fff', 900);
    },
    rt_cleaner(c, f, hw, hh) { // a floor 'wet floor' sign
      c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(0, -hh); c.lineTo(hw, hh); c.lineTo(-hw, hh); c.closePath(); c.fill(); wtext(c, '!', 0, hh * 0.25, hh, '#1b1d22', 900);
    },
  };

  // ---------- looks ----------
  const LOOKS = {
    mallcop: () => ({ outfit: 'guard', shirt: '#e9e4d8', pants: '#2b2d33', hat: '#1f2533', hatType: 'cap', scale: rand(1.1, 1.2) }),
    snob: () => ({ shirt: '#111216', jacket: '#111216', pants: '#111216', hat: null, hairStyle: pick(['bun', 'pony']), hair: '#e9d8b0', outfit: 'suit', tie: '#d4af37' }),
    shopper: () => ({ acc: 'bags', jacket: Math.random() < 0.5 ? pick(['#7a2a24', '#1f3f6e', '#e9e4d8', '#5a3d22']) : null }),
    grocer: () => ({ shirt: '#3e8e5a', pants: '#2b2d33', hat: '#3e8e5a', hatType: 'cap' }),
    techie: () => ({ shirt: '#2f6fb5', pants: '#1b1f27', hat: null, hairStyle: pick(['buzz', 'short', 'curly']) }),
    pharmacist: () => ({ outfit: 'medic', shirt: '#f4f6f8', pants: '#3a6ea5', hat: null, hairStyle: pick(['bun', 'short']) }),
    barber: () => ({ shirt: '#f2f2f2', jacket: '#2b2d33', pants: '#2b2d33', hat: null, hairStyle: pick(['mohawk', 'buzz', 'bald']), hair: '#1b1110' }),
    jeweller: () => ({ outfit: 'suit', shirt: '#1f2533', pants: '#1f2533', tie: '#6b2a5a', hat: null, hairStyle: 'bald', scale: 0.95 }),
    pawnguy: () => ({ shirt: '#5a3d22', jacket: '#2b2d33', pants: '#3a3a2a', hat: '#2b2d33', hatType: 'flat', hairStyle: 'buzz', scale: 1.15 }),
    foodworker: () => ({ shirt: '#c0392b', pants: '#2b2d33', hat: '#ffffff', hatType: 'beanie' }),
  };

  const define = (type, def) => X.interiors.define(type, Object.assign({ furn: FURN, looks: LOOKS }, def));
  const wander = (b, pts) => { for (const q of pts) b.browse(q[0], q[1], q[2] || 0); };

  // =============== 1. SHOPPING MALL (big) ===============
  define('mall', {
    size: [40, 34], weight: 2, minSide: 14,
    names: ['Bussby Storsenter', 'Fjordgallerian', 'Kjøpesenter Nord', 'Artur Arkaden'],
    greet: ['WELCOME TO THE MALL. NO SKATEBOARDS.', 'OPEN TILL 21. SATURDAY TILL 18. SUNDAY NEVER.', 'HAVE YOU SEEN MY MOTHER? SHE IS BY THE FOUNTAIN.'],
    style: { w: 3, door: '#2a3a48', frame: '#c9ccd1', plate: '#1f3f6e', text: '#ffffff', light: '#eaf6ff', awning: ['#2f6fb5', '#e9e4d8'] },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 34, ambient: 0.95, wallTop: '#5a6270', wallLo: '#353a44', wallHi: '#9aa3b2' });
      b.room(0, 10, 40, 34, 'marble', '#e6e1d6', '#c9c2b2');
      b.room(0, 0, 13, 10, 'wood', '#c9a77a', '#a8875c');
      b.room(13, 0, 27, 10, 'tile', '#2b2d33', '#1b1d22');
      b.room(27, 0, 40, 10, 'carpet', '#6a4a7a', '#563a66');
      b.box(); b.entrance(20, 3);
      b.hwall(10, 0.25, 39.75, [[6.5, 3.2, false], [20, 3.4, false], [33.5, 3.2, false]], 'glass');
      b.vwall(13, 0.5, 9.75); b.vwall(27, 0.5, 9.75);
      // shop A: Fjord & Fjell clothing
      b.f('sign', 6.5, 10.55, 4.4, 0.42, { text: 'FJORD & FJELL', c: '#fff', bg: '#3e5a3a', size: 0.28, layer: 2 });
      b.f('rt_rail', 3.2, 3, 4, 0.5, { solid: 'low' }); b.f('rt_rail', 3.2, 6, 4, 0.5, { solid: 'low', pal: ['#3e5a3a', '#e9e4d8', '#8a1f1a', '#1f3f6e'] });
      b.f('rt_mannequin', 8.2, 8.6, 0.8, 0.8, { solid: 'low', c: '#c0392b', c2: '#1b1f27' }); b.f('rt_mannequin', 10.6, 8.6, 0.8, 0.8, { solid: 'low', c: '#f2c230', c2: '#2f6fb5' });
      b.f('counter', 10.5, 2.8, 3.4, 1.1, { solid: 'low', c: '#3e5a3a', top: '#e9e4d8' }); b.f('register', 11, 2.8, 0.6, 0.5);
      b.ped('cashier', 10.5, 1.4, PI / 2, { look: 'snob', rob: [150, 420] });
      b.act(10.5, 4.2, 1.4, () => 'F: Buy a lusekofte ($45)', () => {
        if (!pay(K, 45, 'clothes')) return; restyle(K, { jacket: '#e9e4d8', shirt: '#1f3f6e' });
        talk(sc, 'cashier', 'HAND KNITTED. BY A MACHINE.', '#7dff9a'); K.popup('New sweater. You look like a ski-jumper.');
      });
      // shop B: Elkjøp-ish electronics in the middle
      b.f('sign', 20, 10.55, 4.4, 0.42, { text: 'ELEKTRO-ERIK', c: '#ffd23a', bg: '#c0392b', size: 0.28, layer: 2 });
      b.f('rt_tvwall', 20, 0.8, 12, 0.5, { layer: 2, fragile: true });
      b.f('rt_phones', 17, 5, 3, 1.2, { solid: 'low' }); b.f('rt_phones', 23, 5, 3, 1.2, { solid: 'low' });
      b.ped('clerk', 20, 7.6, PI / 2, { look: 'techie', wander: true });
      b.act(17, 6.4, 1.4, () => 'F: Buy a phone case ($15)', () => { if (pay(K, 15, 'shop')) K.popup('A phone case. You do not own a phone. Still.'); });
      // shop C: Apotek kiosk & perfume
      b.f('sign', 33.5, 10.55, 4.4, 0.42, { text: 'DUFT & DUSJ', c: '#fff', bg: '#6b2a5a', size: 0.28, layer: 2 });
      b.f('rt_medshelf', 39.05, 5, 0.9, 8, { solid: 'tall' }); b.f('rt_medshelf', 32, 0.95, 9, 0.9, { solid: 'tall' });
      b.f('counter', 32, 5.2, 4, 1.1, { solid: 'low', c: '#6b2a5a', top: '#f2e6f0' });
      b.ped('cashier', 32, 3.9, PI / 2, { look: 'snob', rob: [120, 300] });
      b.act(32, 6.6, 1.4, () => 'F: Try the perfume tester (free)', () => { K.popup(pick(['You now smell of "Eau de Fjord". Seagulls follow you.', 'Notes of pine, diesel and brown cheese.'])); talk(sc, 'cashier', 'THAT IS THE TESTER. NOT A SHOWER.'); });
      // atrium: fountain, escalator, benches, plants, food court
      sc.st.fountain = b.f('rt_fountain', 20, 19, 5, 5, { solid: 'low' });
      b.act(20, 22.2, 1.6, () => 'F: Throw a krone in the fountain ($1)', () => {
        if (!pay(K, 1, 'wish')) return;
        if (Math.random() < 0.08) { K.money(50, 'wish', K.P.ped.x, K.P.ped.y); K.popup('Your wish came true! $50 floats up.'); }
        else K.popup(pick(['You wished for a bus that runs on time. Unlikely.', 'Plink. Somewhere, Artur gets richer.', 'You wish for fewer stars. The fountain says no.']));
      });
      b.f('rt_escalator', 35.5, 16.5, 3.6, 6, { solid: 'tall' }); b.f('sign', 35.5, 13.1, 3, 0.36, { text: '2. ETG: CLOSED SINCE 1998', c: '#fff', bg: '#2b2d33', size: 0.17, layer: 2 });
      b.act(35.5, 20.3, 1.5, () => 'F: Ride the escalator', () => { K.sfx('clunk'); K.popup(pick(['You go up. Nothing there. You come back down.', 'The escalator stops halfway. Classic Bussby.'])); });
      for (const q of [[14, 15, 0.9, 3.2, 'e'], [26, 15, 0.9, 3.2, 'w'], [14, 23, 0.9, 3.2, 'e'], [26, 23, 0.9, 3.2, 'w']]) b.f('bench', q[0], q[1], q[2], q[3], { solid: 'low', c: '#3f5f7a', back: q[4] });
      b.ped('sitter', 14.3, 15, 0, { chance: 0.7, look: 'shopper' }); b.ped('sitter', 25.7, 23, PI, { chance: 0.6 }); b.ped('sitter', 14.3, 23.5, 0, { chance: 0.4 });
      for (const q of [[1.3, 11.4], [38.7, 11.4], [1.3, 32.6], [38.7, 32.6], [16.5, 19], [23.5, 19]]) b.f('plant', q[0], q[1], 1, 1, { solid: 'low' });
      b.f('pillar', 9, 27, 1.2, 1.2, { solid: 'tall' }); b.f('pillar', 31, 27, 1.2, 1.2, { solid: 'tall' });
      // food court, left
      b.f('rt_stall', 1.4, 17, 1.6, 4.2, { solid: 'low', c: '#c0392b', text: 'KEBAB' }); b.f('rt_stall', 1.4, 23, 1.6, 4.2, { solid: 'low', c: '#e07b2a', text: 'VAFLER' });
      b.ped('clerk', 0.95 + 0.0, 15.2, 0, { look: 'foodworker' });
      b.act(3, 17, 1.4, () => 'F: Buy a kebab ($9, +25 hp)', () => K.buyFood(9, 25, pick(['Kebab with extra garlic sauce. Your breath is now a weapon.', 'Kebab i pita. The food of champions and night buses.'])));
      b.act(3, 23, 1.4, () => 'F: Buy a waffle ($5, +12 hp)', () => K.buyFood(5, 12, 'Heart-shaped waffle with sour cream and jam. Koselig.'));
      for (const [x, y] of [[6, 15], [6, 19.5], [6, 24], [9.4, 17.2], [9.4, 21.8]]) {
        b.f('table', x, y, 1.2, 1.2, { solid: 'low', round: 1, c: '#e9e4d8', plates: 1 });
        b.f('chair', x - 0.95, y, 0.5, 0.5, { rot: 0, c: '#c0392b' }); b.f('chair', x + 0.95, y, 0.5, 0.5, { rot: PI, c: '#c0392b' });
        b.ped('sitter', x - 0.95, y, 0, { chance: 0.5, look: 'shopper' });
      }
      b.f('atm', 38.9, 26, 0.7, 1.2, { solid: 'tall' }); b.f('vending', 38.9, 29, 1.0, 1.1, { solid: 'tall', c: '#2f6fb5' });
      b.f('rug', 20, 29.5, 3.2, 7, { c: '#2f6fb5', c2: '#e9e4d8', layer: 0 });
      b.f('rt_cleaner', 28, 30, 0.6, 0.6, { layer: 1 });
      b.f('neon', 20, 33.45, 6, 0.6, { text: 'SALE -70%', c: '#ff4a8a', layer: 2 });
      // people
      b.ped('guard', 24, 29, PI, { look: 'mallcop', weapon: 'bat', hp: 130, patrol: [[24, 29], [30, 14], [10, 13], [12, 29]] });
      b.ped('guard', 33, 24, PI, { look: 'mallcop', weapon: 'pistol', chance: 0.6, patrol: [[33, 24], [33, 12], [17, 25]] });
      b.ped('worker', 28, 31, 0, { look: 'cleaner', wander: true, chance: 0.8 });
      const shop = [[17, 13], [23, 14], [12, 19], [28, 19], [20, 26], [30, 30], [10, 30], [4, 4.5], [6, 7], [20, 3], [23, 7], [34, 7], [36, 3], [33, 31], [7, 12.5], [35.5, 21.5]];
      wander(b, shop.map(q => [q[0], q[1], rand(-3, 3)]));
      for (let i = 0; i < 12; i++) { const q = shop[i]; b.ped('customer', q[0], q[1], rand(-3, 3), { look: 'shopper', chance: 0.75 }); }
      b.zone(9, 0.5, 12.6, 2.2); b.zone(29.5, 0.5, 34.5, 4.6);
      for (const q of [[8, 15], [20, 14], [32, 15], [8, 25], [20, 25.5], [32, 26], [20, 31]]) b.light(q[0], q[1], 10, '#f6fbff', 0.8, { fix: 'panel' });
      b.light(20, 19, 6, '#9fdcff', 0.6); b.light(6.5, 5, 7, '#ffe6c0', 0.7, { fix: 'pendant' }); b.light(20, 4, 8, '#bfe0ff', 0.7, { fix: 'panel' }); b.light(33.5, 5, 7, '#ffd0f0', 0.7, { fix: 'pendant' });
      b.win(2, 33.5, 15, 34); b.win(25, 33.5, 38, 34); b.win(0, 13, 0.5, 30); b.win(39.5, 13, 40, 30);
    },
  });

  // =============== 2. FASHION BOUTIQUE ===============
  const OUTFITS = [
    { n: 'the Oslo Influencer', o: { shirt: '#f2f2f2', jacket: '#d6c3a5', pants: '#e9e4d8', hat: null }, line: 'Beige on beige. Very Frogner.' },
    { n: 'the Bergen Raincoat', o: { shirt: '#2b2d33', jacket: '#f2c230', pants: '#1f3f6e', hat: '#f2c230', hatType: 'bucket' }, line: 'It will rain. It always rains.' },
    { n: 'the Russ Overall', o: { shirt: '#c0392b', jacket: null, pants: '#c0392b', hat: '#c0392b', hatType: 'russ' }, line: 'You look 19 and very loud.' },
    { n: 'the Black Metal', o: { shirt: '#111216', jacket: '#111216', pants: '#111216', hat: null, hairStyle: 'long', hair: '#111' }, line: 'Grim. Frostbitten. Machine washable.' },
    { n: 'the Boss Suit', o: { outfit: 'suit', shirt: '#1f2533', pants: '#1f2533', tie: '#d4af37', jacket: null, hat: '#1b1f27', hatType: 'fedora' }, line: 'Artur would approve. Probably.' },
  ];
  define('boutique', {
    size: [22, 18], weight: 2, minSide: 8,
    names: ['Maison Bussby', 'Chez Ingrid', 'Fjordique', 'Moteriet', 'Glamour & Gummistøvler'],
    greet: ['OH. YOU CAME IN.', 'WE DO NOT HAVE YOUR SIZE. WHATEVER IT IS.', 'PLEASE DO NOT TOUCH THE CASHMERE.'],
    style: { w: 1.8, door: '#1b1b1f', frame: '#d4af37', plate: '#111216', text: '#f2d27a', light: '#ffe2c0', awning: ['#111216', '#f2ead8'] },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 22, ambient: 0.8, wallTop: '#e6dccf', wallLo: '#8a7a6a', wallHi: '#fff6ea' });
      b.room(0, 0, 22, 18, 'wood', '#e8dccb', '#cdbca4');
      b.room(16, 0, 22, 6, 'carpet', '#6b1f3a', '#561830', { nonav: true });
      b.box(); b.entrance(9, 2.2);
      b.vwall(16, 0.5, 6, [[3, 1.4, false]]);
      for (let i = 0; i < 3; i++) b.f('rt_booth', 18.2 + 0, 1.0 + i * 1.7, 3.4, 1.5, { solid: 'tall', c: ['#8a1f3a', '#3a1f5a', '#1f3a5a'][i] });
      b.f('rt_mirror', 16.5, 8.4, 0.25, 2.4, { layer: 2 });
      b.act(15.4, 3, 1.5, () => 'F: Try on ' + OUTFITS[(sc.st.rtO || 0) % OUTFITS.length].n + ' (free)', () => {
        const o = OUTFITS[(sc.st.rtO || 0) % OUTFITS.length]; sc.st.rtO = (sc.st.rtO || 0) + 1;
        if (!sc.st.rtOld) sc.st.rtOld = Object.assign({}, K.P.ped.look);
        restyle(K, o.o); K.sfx('chime'); K.popup('You try on ' + o.n + '. ' + o.line);
        talk(sc, 'clerk', pick(['HMM. NO.', 'BRAVE.', 'IT IS... A CHOICE.', 'DID YOU WASH FIRST?']));
      });
      b.act(13.5, 10.3, 1.5, () => sc.st.rtOld ? 'F: Buy what you are wearing ($80)' : null, () => {
        if (!pay(K, 80, 'clothes')) return; sc.st.rtOld = null; sc.st.rtBought = 1;
        talk(sc, 'clerk', 'FINALLY. NOW LEAVE.', '#7dff9a'); K.popup('Bought! The police will not recognise you. They might.');
        if (K.P.wanted > 0 && Math.random() < 0.5) { K.P.wanted = Math.max(0, K.P.wanted - 1); K.popup('New clothes: -1 star. Disguise level: Bussby.'); }
      });
      b.f('counter', 12, 12, 3.6, 1.1, { solid: 'low', c: '#111216', top: '#f2ead8' }); b.f('register', 12.8, 12, 0.6, 0.5);
      b.ped('clerk', 12, 13.3, -PI / 2, { look: 'snob' });
      b.ped('cashier', 11, 10.9, PI / 2, { look: 'snob', rob: [200, 500], chance: 0.8 });
      for (const q of [[3, 2.5, 'c'], [7, 2.5, 'c'], [3, 7.5, 'c'], [2.2, 12.5, 'w']]) b.f('rt_rail', q[0], q[1], q[2] === 'w' ? 0.5 : 3.2, q[2] === 'w' ? 4 : 0.5, { solid: 'low', pal: [['#111216', '#f2ead8', '#c0392b'], ['#d6c3a5', '#e9e4d8', '#8a7a6a'], ['#6b1f3a', '#3a1f5a', '#1f3a5a', '#d4af37'], ['#f2f2f2', '#111216']][q[0] === 7 ? 1 : q[1] === 7.5 ? 2 : q[2] === 'w' ? 3 : 0] });
      for (const q of [[6, 15.4, '#c0392b', '#111216'], [12, 15.4, '#f2ead8', '#d6c3a5'], [11, 3, '#111216', '#d4af37'], [11, 6.5, '#6b1f3a', '#111216']]) b.f('rt_mannequin', q[0], q[1], 0.8, 0.8, { solid: 'low', c: q[2], c2: q[3] });
      b.f('table', 7, 9.5, 2.4, 1.2, { solid: 'low', c: '#f2ead8' });
      b.act(7, 10.9, 1.3, () => 'F: Buy sunglasses ($30)', () => { if (pay(K, 30, 'clothes')) { restyle(K, { acc: 'shades' }); K.popup('Sunglasses. In Bussby. In November. Iconic.'); } });
      b.f('rug', 9, 9.5, 4, 5, { c: '#6b1f3a', c2: '#d4af37', layer: 0 });
      b.f('plant', 1.2, 16.6, 1, 1, { solid: 'low' }); b.f('plant', 20.8, 16.6, 1, 1, { solid: 'low' });
      b.f('sofa', 20.9, 10.5, 1.0, 3, { solid: 'low', c: '#d4af37', back: 'e' }); b.ped('sitter', 20.5, 10.5, PI, { chance: 0.7, look: 'shopper' });
      b.f('sign', 4, 17.55, 5, 0.4, { text: 'NO BUS DRIVERS', c: '#d4af37', bg: '#111216', size: 0.24, layer: 2 });
      b.ped('customer', 5, 4.5, 0, { chance: 0.7, look: 'shopper' }); b.ped('customer', 4, 9.5, 0, { chance: 0.5, look: 'shopper' });
      wander(b, [[5, 4.5, -1.6], [5, 9.5, 1.6], [4, 12.5, PI], [9, 15, 1.6], [9, 6, 0], [14, 7, 0]]);
      b.zone(9.5, 9.5, 14.5, 11.4);
      for (const q of [[5, 5], [11, 5], [5, 12], [12, 14.5]]) b.light(q[0], q[1], 6, '#ffe6c0', 0.75, { fix: 'pendant' });
      b.light(19, 3, 4, '#ffb0d0', 0.55, { fix: 'bulb' });
      b.win(1, 17.5, 7, 18); b.win(11, 17.5, 20, 18);
    },
  });

  // =============== 3. SUPERMARKET ===============
  define('supermarket', {
    size: [30, 24], weight: 3, minSide: 10,
    names: ['Kiwi-Kongen', 'Rema 1001', 'Bussby Matsenter', 'Coop Prix Extra Mega', 'Meny-ish'],
    greet: ['DO YOU HAVE A MEMBERS CARD?', 'BROWN CHEESE IS ON OFFER.', 'KASSE 2 IS OPEN!'],
    style: { w: 3, door: '#2a3a48', frame: '#3e8e5a', plate: '#3e8e5a', text: '#ffffff', light: '#eaf6ff', awning: ['#3e8e5a', '#f2c230'] },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 29, ambient: 1, wallTop: '#3e5a48', wallLo: '#25352a', wallHi: '#7a9a84' });
      b.room(0, 0, 30, 24, 'lino', '#ecebe4', '#d0cec3');
      b.room(0, 0, 30, 2.4, 'tile', '#c8d4cc', '#aab8ae');
      b.box(); b.entrance(24, 3);
      b.f('fridge', 15, 0.95, 28, 0.9, { solid: 'tall', fragile: true });
      const labels = ['BRØD', 'BRUNOST', 'TACO (FRIDAY)', 'FISKEBOLLER', 'SNACKS', 'PØLSER'];
      for (let i = 0; i < 6; i++) b.f('rt_aisle', 3 + i * 3.4, 8.5, 1.2, 9, { solid: 'tall', label: labels[i] });
      b.f('freezer', 26.5, 6, 2.2, 5, { solid: 'low' });
      for (const [x, i] of [[4, 0], [9, 1], [14, 2]]) {
        b.f('rt_checkout', x, 18.5, 3.4, 1.1, { solid: 'low' });
        b.f('sign', x + 1.3, 17.6, 0.8, 0.4, { text: String(i + 1), c: '#fff', bg: '#3e8e5a', size: 0.3, layer: 2 });
        b.ped('cashier', x + 1.2, 19.75, -PI / 2, { look: 'grocer', rob: [80, 260], chance: i === 0 ? 1 : 0.6 });
      }
      b.f('mags', 18.5, 18.5, 1.8, 0.7, { solid: 'low' });
      for (let i = 0; i < 4; i++) b.f('rt_trolley', 27 + (i % 2) * 0.2, 14 + i * 0.6, 1, 1.2, { layer: 1 });
      b.f('rt_trolley', 9, 14, 1, 1.2, { solid: 'low', full: 1, rot: 0.3 });
      b.f('vending', 28.95, 19.5, 1.0, 1.4, { solid: 'tall', c: '#3e8e5a' }); b.f('sign', 28.6, 21.2, 1.4, 0.36, { text: 'PANT', c: '#fff', bg: '#3e8e5a', size: 0.24, layer: 2 });
      b.act(27.8, 19.5, 1.3, () => 'F: Return bottles at the pant machine', () => {
        const now = X.time || 0; if (now - (sc.st.rtPant || -99) < 30) { K.popup('The machine is full. It is always full.'); K.sfx('deny'); return; }
        sc.st.rtPant = now; const n = Math.round(rand(2, 12)); K.money(n, 'pant', K.P.ped.x, K.P.ped.y); K.sfx('clunk'); K.popup(n + ' bottles. Pant: $' + n + '. Norwegian recycling pays!');
      });
      b.act(8.1, 13.8, 1.3, () => 'F: Buy brunost & lefse ($8, +20 hp)', () => K.buyFood(8, 20, 'Brown cheese on lefse. You feel 100% Norwegian.'));
      b.act(20, 3, 1.5, () => 'F: Grab a Grandiosa ($6, +18 hp)', () => K.buyFood(6, 18, 'Frozen Grandiosa, eaten cold. The national dish.'));
      b.act(13.2, 8.5, 1.2, () => 'F: Pocket a pølse (shoplift)', () => {
        hpUp(K, 8); K.sfx('beep'); K.popup('You hide a pølse in your jacket. Nobody saw. Probably.');
        if (Math.random() < 0.45) { const c = talk(sc, 'cashier', 'HEY! I SAW THAT! PØLSETYV!', '#ff6a5a'); if (c) crime(K, 'trespass'); }
      });
      b.f('sign', 10, 23.55, 6, 0.4, { text: 'MAX 2 TROLLEYS PER BUS', c: '#fff', bg: '#3e8e5a', size: 0.24, layer: 2 });
      b.f('plant', 1.2, 22.8, 1, 1, { solid: 'low' });
      b.ped('worker', 20, 12, 0, { look: 'grocer', wander: true });
      const cs = [[4.7, 6], [8.1, 11], [11.5, 5], [14.9, 9], [18.3, 12], [21.7, 6], [26.5, 10], [10, 2.5], [22, 2.5], [26, 3.5], [6, 15], [16, 15]];
      wander(b, cs.map(q => [q[0], q[1], rand(-3, 3)]));
      for (let i = 0; i < 8; i++) b.ped('customer', cs[i][0], cs[i][1], 0, { chance: 0.7 });
      b.zone(0.5, 19.2, 17, 21.5);
      for (const q of [[5, 6], [12, 6], [19, 6], [26, 6], [5, 13], [12, 13], [19, 13], [26, 13], [8, 19], [20, 20]]) b.light(q[0], q[1], 8, '#f4fbff', 0.85, { fix: 'tube' });
      b.win(1, 23.5, 20, 24); b.win(27, 23.5, 29, 24);
    },
  });

  // =============== 4. ELECTRONICS STORE ===============
  define('electronics', {
    size: [24, 18], weight: 2, minSide: 9,
    names: ['Elektro-Erik', 'Lyd & Bilde Bussby', 'Gigabyte Gunnar', 'Strøm & Stæsj'],
    greet: ['NEED AN EXTENDED WARRANTY?', 'EVERYTHING IS ON SALE. NOTHING IS CHEAP.', 'HAVE YOU TRIED TURNING IT OFF AND ON?'],
    style: { w: 2.2, door: '#1b1d22', frame: '#c0392b', plate: '#c0392b', text: '#ffd23a', light: '#cfe4ff', neon: '#3fd0ff' },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 23, ambient: 0.55, wallTop: '#2b2e34', wallLo: '#16181c', wallHi: '#5a606a' });
      b.room(0, 0, 24, 18, 'tile', '#3a3d44', '#2b2e34');
      b.box(); b.entrance(12, 2.4);
      sc.st.tvwall = b.f('rt_tvwall', 12, 0.8, 18, 0.55, { layer: 2, fragile: true });
      b.f('rt_tvwall', 0.8, 9, 8, 0.55, { layer: 2, fragile: true, rot: PI / 2 });
      b.f('sign', 12, 1.5, 6, 0.4, { text: '75" TV - NOW ONLY $9999', c: '#fff', bg: '#c0392b', size: 0.24, layer: 2 });
      for (const [x, y] of [[6, 6], [12, 6], [18, 6]]) b.f('rt_phones', x, y, 3.2, 1.3, { solid: 'low' });
      b.f('table', 6, 11, 3, 1.3, { solid: 'low', c: '#2b2d33' }); b.f('monitor', 5.3, 11, 0.9, 0.6); b.f('monitor', 6.7, 11, 0.9, 0.6);
      b.f('arcade', 22.9, 7, 1.0, 1.2, { solid: 'tall', fragile: true });
      b.act(21.7, 7, 1.4, () => 'F: Play the demo console (free)', () => { K.sfx('arcade'); K.popup(pick(['You crash the demo bus. High score: 0.', 'Demo mode: "Bus Simulator Bussby". Realistic. You wait 20 minutes.', 'The clerk unplugs it. "DEMO TIME IS OVER."'])); });
      b.f('counter', 18, 13, 5, 1.2, { solid: 'low', c: '#c0392b', top: '#e9e4d8' }); b.f('register', 19.5, 12.9, 0.6, 0.5);
      b.ped('cashier', 18.5, 14.4, -PI / 2, { look: 'techie', rob: [180, 480] });
      b.ped('clerk', 9, 8.5, 0, { look: 'techie', wander: true });
      b.act(18, 11.6, 1.5, () => 'F: Buy a phone ($120)', () => {
        if (!pay(K, 120, 'phone')) return; talk(sc, 'cashier', 'WANT THE 7-YEAR WARRANTY? NO? YOU WILL REGRET.', '#7dff9a');
        K.popup('New phone! 3 hours battery. Charger sold separately ($40).');
      });
      b.act(12, 7.4, 1.3, () => 'F: Take a selfie on the display phone', () => { K.sfx('beep'); K.popup(pick(['Click. 400 likes from Bussby Police. Hmm.', 'Selfie saved to the demo phone. Forever.'])); });
      b.act(9.5, 1.9, 1.6, () => sc.st.tvwall && !sc.st.tvwall.looted ? 'F: Grab a TV off the wall (steal $300)' : null, () => smashGrab(K, sc, sc.st.tvwall, 300, 'a TV'));
      b.f('crate', 22.6, 16.6, 1.3, 1.3, { solid: 'low', text: 'RETUR' }); b.f('crate', 1.6, 16.6, 1.3, 1.3, { solid: 'low', text: 'SALG' });
      b.ped('guard', 3, 15, 0, { look: 'mallcop', weapon: 'pistol', chance: 0.6, patrol: [[3, 15], [12, 9], [21, 15]] });
      const cs = [[6, 7.6], [12, 4.4], [18, 7.6], [6, 12.6], [14, 10], [20, 4]];
      wander(b, cs.map(q => [q[0], q[1], rand(-3, 3)]));
      for (let i = 0; i < 4; i++) b.ped('customer', cs[i][0], cs[i][1], 0, { chance: 0.7 });
      b.zone(15.5, 13.7, 22.5, 16);
      for (const q of [[6, 6], [12, 6], [18, 6], [8, 12], [18, 12]]) b.light(q[0], q[1], 7, '#d8ecff', 0.8, { fix: 'panel' });
      b.light(12, 1.6, 8, '#5ab0e8', 0.6); b.light(1.6, 9, 5, '#c25cff', 0.5);
      b.win(2, 17.5, 9, 18); b.win(15, 17.5, 22, 18);
    },
  });

  // =============== 5. PHARMACY ===============
  define('pharmacy', {
    size: [20, 16], weight: 2, minSide: 7,
    names: ['Apotek 1½', 'Vitusapotek Bussby', 'Ditt Apotek', 'Pille-Per'],
    greet: ['TAKE A NUMBER. YOU ARE 47.', 'ARE YOU BLEEDING ON MY FLOOR?', 'NO, WE DO NOT SELL THAT.'],
    style: { w: 1.8, door: '#2a4a3a', frame: '#3fae6a', plate: '#3fae6a', text: '#ffffff', light: '#eaffef', cross: 1 },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 20, ambient: 1, wallTop: '#5a8a6a', wallLo: '#2f5a3f', wallHi: '#a5d4b5' });
      b.room(0, 0, 20, 16, 'lino', '#f2f6f4', '#d2ded6');
      b.room(0, 0, 20, 4.5, 'tile', '#dbeee2', '#b9d6c4');
      b.box(); b.entrance(10, 2.2);
      b.f('rt_medshelf', 10, 0.95, 18, 0.9, { solid: 'tall' });
      b.f('counter', 9, 4.5, 12, 1.2, { solid: 'low', c: '#3fae6a', top: '#f4f8f6' }); b.wall(15, 4.25, 19.75, 4.75);
      b.f('register', 6, 4.3, 0.6, 0.45); b.f('monitor', 11, 4.3, 0.7, 0.45);
      b.ped('cashier', 6, 3.2, PI / 2, { look: 'pharmacist', rob: [100, 300] });
      b.ped('clerk', 11, 3.2, PI / 2, { look: 'pharmacist' });
      b.act(11, 5.9, 1.5, () => 'F: Buy painkillers ($25, +40 hp)', () => {
        if (!pay(K, 25, 'pharmacy')) return; hpUp(K, 40); K.sfx('heal');
        talk(sc, 'clerk', pick(['TWO EVERY FOUR HOURS. NOT TWELVE.', 'PARACET. THE NORWEGIAN CURE FOR EVERYTHING.']), '#7dff9a');
      });
      b.act(6, 5.9, 1.4, () => 'F: Buy plasters ($8, +12 hp)', () => { if (pay(K, 8, 'pharmacy')) { hpUp(K, 12); K.sfx('heal'); K.popup('Plasters with moose on them. You feel better.'); } });
      b.f('rt_medshelf', 2, 10, 0.9, 6, { solid: 'tall' }); b.f('rt_medshelf', 7, 10, 1.0, 5, { solid: 'tall' }); b.f('rt_medshelf', 12, 10, 1.0, 5, { solid: 'tall' });
      b.f('fridge', 18.95, 10, 0.9, 6, { solid: 'tall', fragile: true });
      b.act(17.8, 10, 1.4, () => 'F: Drink tran, cod liver oil ($12, +30 hp)', () => { if (pay(K, 12, 'pharmacy')) { hpUp(K, 30); K.sfx('glug'); K.popup('Tran. Tastes like a fishing boat. Strong like a Viking.'); } });
      b.f('sign', 10, 5.4, 4, 0.36, { text: 'NUMBER: 46', c: '#ff3a3a', bg: '#1b1d22', size: 0.24, layer: 2 });
      b.f('bench', 4, 14.8, 4, 0.8, { solid: 'low', c: '#3fae6a', back: 's' }); b.ped('sitter', 3.4, 14.7, -PI / 2, { chance: 0.7, look: 'sick' }); b.ped('sitter', 5, 14.7, -PI / 2, { chance: 0.4 });
      b.f('emblem', 15.5, 12.5, 2.4, 2.4, { kind: 'cross', layer: 0 });
      b.f('plant', 18.8, 14.8, 1, 1, { solid: 'low' });
      wander(b, [[4.5, 8], [9.5, 12], [14.5, 8], [10, 6.4, -PI / 2], [16, 14]]);
      b.ped('customer', 9.5, 7.5, 0, { chance: 0.6 }); b.ped('customer', 14.5, 12, 0, { chance: 0.5, look: 'sick' });
      b.zone(0.5, 0.5, 19.5, 3.9);
      for (const q of [[5, 2.5], [14, 2.5], [5, 10], [14, 10]]) b.light(q[0], q[1], 7, '#f4fff8', 0.85, { fix: 'panel' });
      b.win(1, 15.5, 7, 16); b.win(13, 15.5, 19, 16);
    },
  });

  // =============== 6. BARBER ===============
  const CUTS = [
    { s: 'buzz', n: 'Military buzz', l: 'Aerodynamic. Good for drifting.' }, { s: 'mohawk', n: 'Viking mohawk', l: 'Your ancestors are proud. Your mother is not.' },
    { s: 'pony', n: 'Ponytail', l: 'Very 1987. Very Bergen.' }, { s: 'afro', n: 'Big afro', l: 'Volume level: fjord.' },
    { s: 'curly', n: 'Perm', l: 'A perm! Like a footballer in 1979.' }, { s: 'long', n: 'Black metal hair', l: 'Headbanging now possible.' },
    { s: 'short', n: 'The Classic', l: 'Boring. Safe. Very Norwegian.' }, { s: 'bun', n: 'Man bun', l: 'You now drink oat-milk latte.' },
  ];
  const DYES = [['#e9d8b0', 'Blond as a Swede'], ['#8a1f1a', 'Ginger'], ['#2f6fb5', 'Electric blue'], ['#d64a8f', 'Hot pink'], ['#e9e4d8', 'Grey, like a pensioner'], ['#1b1110', 'Black']];
  define('barber', {
    size: [18, 14], weight: 2, minSide: 6,
    names: ['Klipp & Klart', 'Saks Sakarias', 'Hårreisende', 'Frisør Fjell', 'Barber Bjørn'],
    greet: ['SIT DOWN. WHAT ARE WE DOING TODAY?', 'WHO CUT YOUR HAIR LAST? A LAWNMOWER?', 'NO APPOINTMENT? FINE.'],
    style: { w: 1.6, door: '#2b2d33', frame: '#c0392b', plate: '#f2f2f2', text: '#2f6fb5', light: '#ffe6c0', awning: ['#c0392b', '#f2f2f2'] },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 18, ambient: 0.85, wallTop: '#3a4a5a', wallLo: '#232c36', wallHi: '#7a8a9a' });
      b.room(0, 0, 18, 14, 'check', '#efe9dc', '#2b2d33');
      b.box(); b.entrance(14, 2);
      const xs = [3, 7, 11];
      xs.forEach((x, i) => {
        b.f('rt_mirror', x, 0.75, 2.2, 0.3, { layer: 2, frame: '#c9ccd1' });
        b.f('counter', x, 1.3, 2.2, 0.6, { solid: 'low', c: '#2b2d33', top: '#e9e4d8' });
        b.f('rt_barberchair', x, 2.8, 1.1, 1.1, { solid: 'low', rot: -PI / 2, c: ['#8a1f1a', '#1f3f6e', '#2b2d33'][i] });
        b.f('rt_hairfloor', x, 3.2, 1.8, 1.4, { layer: 0 });
        b.ped(i === 2 ? 'sitter' : 'sitter', x, 2.8, -PI / 2, { chance: i === 0 ? 0 : 0.6, look: i === 1 ? 'sick' : undefined });
      });
      b.ped('clerk', 4.3, 3.8, PI * 0.75, { look: 'barber' }); b.ped('worker', 8.3, 3.8, PI * 0.75, { look: 'barber', chance: 0.8 });
      b.act(3, 4.3, 1.4, () => 'F: Haircut: ' + CUTS[(sc.st.rtCut || 0) % CUTS.length].n + ' ($20)', () => {
        if (!pay(K, 20, 'haircut')) return; const c = CUTS[(sc.st.rtCut || 0) % CUTS.length]; sc.st.rtCut = (sc.st.rtCut || 0) + 1;
        restyle(K, { hairStyle: c.s, hat: null }); K.sfx('scratch'); K.popup(c.n + '! ' + c.l);
        talk(sc, 'clerk', pick(['SNIP SNIP. DONE.', 'BEAUTIFUL. I AM AN ARTIST.', 'NO REFUNDS ON HAIR.']), '#7dff9a');
      });
      b.act(7, 4.3, 1.4, () => 'F: Dye hair: ' + DYES[(sc.st.rtDye || 0) % DYES.length][1] + ' ($25)', () => {
        if (!pay(K, 25, 'haircut')) return; const d = DYES[(sc.st.rtDye || 0) % DYES.length]; sc.st.rtDye = (sc.st.rtDye || 0) + 1;
        restyle(K, { hair: d[0] }); K.sfx('chime'); K.popup('Hair: ' + d[1] + '. The bus mirror will be shocked.');
      });
      b.act(11, 4.3, 1.4, () => 'F: Shave it all off ($10)', () => { if (pay(K, 10, 'haircut')) { restyle(K, { hairStyle: 'bald', hat: null }); K.sfx('scratch'); K.popup('Bald. Shiny. Aerodynamic. Cops will see you from space.'); } });
      b.f('rt_pole', 16.6, 12.6, 0.7, 0.7, { solid: 'low' });
      b.f('bench', 4.5, 12.9, 5, 0.8, { solid: 'low', c: '#8a1f1a', back: 's' }); b.ped('sitter', 3.5, 12.8, -PI / 2, { chance: 0.6 }); b.ped('sitter', 5.5, 12.8, -PI / 2, { chance: 0.4 });
      b.f('table', 9.5, 12.7, 1.4, 0.9, { solid: 'low', c: '#5a3a24' }); b.f('mags', 9.5, 12.7, 1.0, 0.5);
      b.f('counter', 16.4, 6, 1.1, 3, { solid: 'low', c: '#2b2d33', top: '#e9e4d8' }); b.f('register', 16.4, 6.6, 0.5, 0.6);
      b.ped('cashier', 17.2, 5.5, PI, { look: 'barber', rob: [60, 180], chance: 0.7 });
      b.f('poster', 12, 13.6, 2, 0.3, { kind: 'calendar', layer: 2 });
      b.f('sign', 5, 7.2, 4, 0.36, { text: 'HAIRCUT $20. ADVICE FREE.', c: '#fff', bg: '#c0392b', size: 0.2, layer: 0 });
      wander(b, [[9.5, 11.4, PI / 2], [13, 8, 0], [6, 9, 0]]);
      b.zone(15.8, 4.2, 17.6, 7.8);
      for (const x of xs) b.light(x, 2.5, 4, '#fff4dc', 0.75, { fix: 'bulb' });
      b.light(9, 10, 8, '#ffe6c0', 0.6, { fix: 'pendant' });
      b.win(1, 13.5, 8, 14); b.win(10, 13.5, 12.5, 14);
    },
  });

  // =============== 7. JEWELLERY STORE ===============
  define('jewellery', {
    size: [20, 16], weight: 1, minSide: 7,
    names: ['Gull-Gunnar', 'Diamant Dagny', 'Bussby Smykker', 'Glitter & Gråstein'],
    greet: ['LOOK WITH YOUR EYES, NOT YOUR HANDS.', 'AN ENGAGEMENT RING? FOR... YOU?', 'THE GLASS IS BULLETPROOF. MOSTLY.'],
    style: { w: 1.6, door: '#1b1b1f', frame: '#d4af37', plate: '#1b1012', text: '#f2d27a', light: '#fff2c0', pillars: 1 },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 20, ambient: 0.7, wallTop: '#3a2a3a', wallLo: '#1f1520', wallHi: '#7a5a7a' });
      b.room(0, 0, 20, 16, 'marble', '#e9e0d0', '#c7b89c');
      b.room(0, 0, 20, 4, 'carpet', '#3a1f3a', '#2a1529', { nonav: true });
      b.box(); b.entrance(10, 2);
      b.f('counter', 7, 4, 13, 1.2, { solid: 'low', c: '#2a2433', top: '#d4af37' });
      sc.gaps.push({ x: sc.ox + 16.6, y: sc.oy + 4, w: 2.6, vert: false, door: true, gate: true, a: 0, side: 1 });
      b.wall(18, 3.75, 19.75, 4.25);
      b.f('register', 4, 3.8, 0.6, 0.45);
      b.ped('cashier', 4, 2.6, PI / 2, { look: 'jeweller', rob: [250, 600] });
      sc.st.safe = b.f('safe', 18.8, 1.4, 1.1, 1.1, { solid: 'tall' }); b.act(17.6, 2.2, 1.4, () => K.safeHint(sc), () => K.crackSafe(sc));
      sc.st.cases = [];
      const caseAt = (x, y, w, h, amt) => {
        const f = b.f('rt_jewelcase', x, y, w, h, { solid: 'low', fragile: true }); f.amt = amt; sc.st.cases.push(f);
        b.act(x, y + h / 2 + 0.75, 1.2, () => f.looted ? null : f.broken ? 'F: Grab the jewellery' : 'F: Smash the case and rob it', () => smashGrab(K, sc, f, f.amt, pick(['a diamond ring', 'a gold chain', 'a Rolex (fake?)', 'troll earrings'])));
      };
      caseAt(4, 8, 3.2, 1.1, 260); caseAt(10, 8, 3.2, 1.1, 340); caseAt(16, 8, 3.2, 1.1, 220); caseAt(7, 11.5, 2.6, 1.1, 300); caseAt(13, 11.5, 2.6, 1.1, 480);
      b.act(10, 5.4, 1.4, () => 'F: Buy a ring for Artur ($150)', () => { if (pay(K, 150, 'jewellery')) { K.popup('A gold ring. Artur says: "Is this a proposal? No. But I keep it."'); talk(sc, 'cashier', 'EXCELLENT TASTE. FOR ONCE.', '#7dff9a'); } });
      b.f('rt_mirror', 1, 10, 0.25, 2, { layer: 2 });
      b.f('plant', 1.2, 14.8, 1, 1, { solid: 'low' }); b.f('plant', 18.8, 14.8, 1, 1, { solid: 'low' });
      b.f('rug', 10, 13.8, 3, 3, { c: '#3a1f3a', c2: '#d4af37', layer: 0 });
      for (const c of [[0.85, 4.7, PI / 4], [19.15, 4.7, PI * 0.75]]) b.f('camera', c[0], c[1], 0.5, 0.5, { a: c[2], layer: 3 });
      b.f('sign', 10, 15.55, 5, 0.38, { text: 'SMILE, YOU ARE ON CAMERA', c: '#d4af37', bg: '#1b1012', size: 0.22, layer: 2 });
      b.ped('guard', 17.5, 13.5, PI, { look: 'mallcop', weapon: 'pistol', armor: 40 });
      b.ped('guard', 2.5, 13.5, 0, { weapon: 'pistol', chance: 0.4, when: 'day' });
      wander(b, [[4, 9.6, -PI / 2], [10, 9.6, -PI / 2], [16, 9.6, -PI / 2], [7, 13, -PI / 2], [13, 13, -PI / 2], [10, 5.4, -PI / 2]]);
      b.ped('customer', 10, 9.6, -PI / 2, { chance: 0.6, look: 'suit' }); b.ped('customer', 13, 13.2, -PI / 2, { chance: 0.4, look: 'snob' });
      b.zone(0.5, 0.5, 19.5, 3.5);
      for (const q of [[4, 8], [10, 8], [16, 8], [7, 11.5], [13, 11.5]]) b.light(q[0], q[1], 3.5, '#fff6dc', 0.85, { fix: 'bulb' });
      b.light(8, 2, 6, '#ffe6c0', 0.6, { fix: 'pendant' });
      b.win(2, 15.5, 7, 16); b.win(13, 15.5, 18, 16);
    },
    tick(sc, dt, t, K) { // a case shot to pieces can still be emptied: the act text switches to "grab"
      if (sc.st.bellT > 0) sc.st.bellT -= dt;
    },
  });

  // =============== 8. PAWN SHOP ===============
  const PAWN = [['your watch', 40], ['your bus pass', 15], ["Artur's old vase", 90], ['a hubcap', 12], ['your dignity', 1], ['a slightly used kidney (joke)', 0]];
  define('pawnshop', {
    size: [20, 16], weight: 2, minSide: 7,
    names: ['Pant & Prakk', 'Brukt-Bjarne', 'Bussby Bruktbutikk', 'Gammelt & Godt', 'Kjøp & Salg Kjell'],
    greet: ['EVERYTHING HAS A PRICE. MOSTLY LOW.', 'NO STOLEN GOODS. WINK.', 'BROWSE, BUY, OR BUZZ OFF.'],
    style: { w: 1.6, door: '#3a2a1a', frame: '#d4af37', plate: '#1b1612', text: '#ffd23a', light: '#ffcf8a', neon: '#ffd23a' },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 20, ambient: 0.5, wallTop: '#4a3a2a', wallLo: '#2a2016', wallHi: '#7a6a52' });
      b.room(0, 0, 20, 16, 'wood', '#7a5a3a', '#5a4028');
      b.room(0, 0, 20, 4.5, 'concrete', '#5a5650', '#4a4640');
      b.box(); b.entrance(7, 2);
      b.f('counter', 10, 4.5, 14, 1.2, { solid: 'low', c: '#3a2a1a', top: '#8a7a62' }); b.wall(17, 4.25, 19.75, 4.75); b.wall(0.25, 4.25, 3, 4.75);
      b.f('glass', 10, 4.5, 13.6, 0.1);
      b.f('register', 13, 4.3, 0.6, 0.45);
      b.ped('owner', 10, 3, PI / 2, { look: 'pawnguy', weapon: 'shotgun', hp: 150 });
      b.f('rt_junk', 10, 0.95, 18, 0.9, { solid: 'tall' });
      b.f('safe', 18.6, 2.2, 1.1, 1.1, { solid: 'tall' });
      b.act(10, 5.9, 1.4, () => { const i = sc.st.rtPawn || 0; return i < PAWN.length ? 'F: Pawn ' + PAWN[i][0] : 'F: Nothing left to pawn'; }, () => {
        const i = sc.st.rtPawn || 0, own = staff(sc, 'owner'); if (!own) { K.popup('Nobody at the counter.'); return; }
        if (i >= PAWN.length) { K0.say(own, 'YOU HAVE NOTHING. GO AWAY.'); return; }
        sc.st.rtPawn = i + 1; const [n, v] = PAWN[i];
        if (v) { K.money(v, 'pawn', K.P.ped.x, K.P.ped.y); K.sfx('cash'); }
        K0.say(own, v ? pick(['$' + v + '. FINAL OFFER.', 'IT IS WORTH NOTHING. HERE IS $' + v + '.']) : 'NO. JUST NO.', '#ffd23a');
        K.popup('You pawned ' + n + (v ? ' for $' + v + '.' : '. He did not want it.'));
      });
      b.act(4.5, 5.9, 1.3, () => 'F: Buy a mystery box ($30)', () => {
        if (!pay(K, 30, 'pawn')) return; const r = Math.random();
        if (r < 0.15) { K.money(120, 'pawn', K.P.ped.x, K.P.ped.y); K.popup('Mystery box: a gold tooth! Worth $120.'); }
        else if (r < 0.4) { hpUp(K, 25); K.popup('Mystery box: a Kvikk Lunsj from 2009. Still good. +25 hp'); }
        else K.popup(pick(['Mystery box: one left shoe.', 'Mystery box: a VHS of "Bussby Idol 2004".', 'Mystery box: an empty mystery box.']));
      });
      for (const q of [[3, 9, 0.9, 5], [8, 8, 4, 0.9], [8, 12, 4, 0.9], [15, 10, 0.9, 5]]) b.f('rt_junk', q[0], q[1], q[2], q[3], { solid: 'tall' });
      b.f('tv', 18.9, 13.5, 1.8, 0.4, { layer: 2, fragile: true, show: 'news', rot: PI / 2 });
      b.f('armchair', 17.5, 13.5, 1.3, 1.2, { solid: 'low', c: '#6b4a32' }); b.ped('sitter', 17.5, 13.5, 0, { chance: 0.5, look: 'drunk' });
      b.act(16, 13.5, 1.4, () => 'F: Test the old guitar', () => { K.sfx('chime'); K.popup(pick(['You play "Take On Me". Badly. The owner applauds sarcastically.', 'One string breaks. "YOU BREAK, YOU BUY." You run.'])); });
      b.f('neon', 13, 15.45, 3.4, 0.6, { text: 'WE BUY GOLD', c: '#ffd23a', layer: 2 });
      b.f('poster', 4, 15.6, 1.6, 0.3, { kind: 'wanted', layer: 2 });
      wander(b, [[5.5, 9, 0], [8, 10, 0], [12, 9, 0], [12, 13.5, 0], [5, 13, 0]]);
      b.ped('customer', 8, 10, 0, { chance: 0.6, look: 'drunk' }); b.ped('customer', 12, 13.5, 0, { chance: 0.4 });
      b.zone(0.5, 0.5, 19.5, 3.9);
      for (const q of [[5, 2.5], [14, 2.5], [6, 10], [13, 10]]) b.light(q[0], q[1], 6, '#ffcf8a', 0.7, { fix: 'bulb', flick: q[0] === 13 ? 1 : 0 });
      b.win(1, 15.5, 5, 16); b.win(9, 15.5, 11, 16);
    },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
