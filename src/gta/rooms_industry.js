// Industry & municipal utilities ("kommunal"): enterable building themes registered through
// X.interiors.define (see interiors.js, "themes from other modules"). Factory, brunost & fish plant,
// power substation, water works, recycling depot, bus depot workshop, laundromat and the newspaper print shop.
// Furniture names are prefixed in_ and looks in_ so they never clash with other packs.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta; if (!X || !X.interiors || !X.interiors.define) return;
  const D = X.interiors.define, TAU = Math.PI * 2;

  // ---------- shared helpers ----------
  // A layout-local point in world coordinates (after the engine turned the room to face its door).
  const W = (sc, x, y) => { const q = sc.loc ? sc.loc(x, y) : [x, y]; return { x: sc.ox + q[0], y: sc.oy + q[1] }; };
  const now = () => X.time || 0;
  const hp = (K, n) => { const p = K.P.ped; p.hp = Math.min(p.maxHp || 100, p.hp + n); };
  const ready = (sc, k, cd) => { const t = sc.st['cd_' + k]; return t == null || now() - t > cd; };
  const use = (sc, k) => { sc.st['cd_' + k] = now(); };
  const alive = (sc, role) => sc.peds.filter(p => !p.dead && !p.removed && (!role || p.ai.role === role));
  function witness(sc, K, r) {
    const p = K.P.ped;
    return alive(sc).find(q => K.mine(q) && q.ai.st !== 'flee' && Math.hypot(q.x - p.x, q.y - p.y) < (r || 14) && K.sightClear(sc, q.x, q.y, p.x, p.y));
  }
  function shout(sc, K, role, lines, col) { const q = alive(sc, role)[0] || alive(sc)[0]; if (q) K.say(q, K.pick(lines), col); return q; }
  function boom(sc, K, x, y, power) {
    if (X.explode) X.explode(x, y, { by: K.P.ped, power: power || 1 });
    else K.popup('KA-BOOM! (well, a loud clunk)');
    K.alarm(sc);
  }
  // Explosive barrels/propane: restocked on each visit, like the warehouse (layout-local points in sc.st.ind_props).
  function props(sc) {
    if (!X.addProp || !sc.st.ind_props) return;
    if (sc._indT === sc.used && sc._indProps) return;
    sc._indT = sc.used;
    sc._indProps = (sc._indProps || []).filter(pr => !pr.dead);
    if (sc._indProps.length) return;
    for (const q of sc.st.ind_props) { const w = W(sc, q[0], q[1]); sc._indProps.push(X.addProp(q[2] || (Math.random() < 0.25 ? 'propane' : 'barrel'), w.x, w.y)); }
  }
  function lightsOff(sc, off) {
    for (const l of sc.lights) { if (l.i0 == null) l.i0 = l.i; l.i = off && !l.emerg ? 0 : l.emerg ? (off ? 0.9 : 0) : l.i0; }
    if (sc.amb0 == null) sc.amb0 = sc.ambient;
    sc.ambient = off ? 0.06 : sc.amb0;
  }
  const looks = {
    in_foreman: () => ({ outfit: 'worker', shirt: '#f4f4f4', pants: '#2b3a55', hat: '#ffffff', hatType: 'hard', scale: 1.1 }),
    in_hiviz: () => ({ outfit: 'worker', shirt: '#d8f03a', pants: '#2b3a55', hat: '#f2c230', hatType: 'hard' }),
    in_dairy: () => ({ outfit: 'medic', shirt: '#f4f6f8', pants: '#f4f6f8', hat: '#ffffff', hatType: 'beanie' }),
    in_fish: () => ({ outfit: 'overalls', shirt: '#f2a01a', pants: '#f2a01a', hat: '#2f6fb5', hatType: 'beanie' }),
    in_engineer: () => ({ outfit: 'worker', shirt: '#2f5a8a', pants: '#23272e', hat: '#e9e4d8', hatType: 'hard' }),
    in_water: () => ({ outfit: 'overalls', shirt: '#2f8a9a', pants: '#2f8a9a', hat: '#2f6fb5', hatType: 'cap' }),
    in_bin: () => ({ outfit: 'worker', shirt: '#e07b2a', pants: '#3e8e5a', hat: '#3e8e5a', hatType: 'cap' }),
    in_busmech: () => ({ outfit: 'overalls', shirt: '#c0392b', pants: '#c0392b', hat: '#1b1d22', hatType: 'cap' }),
    in_printer: () => ({ shirt: '#e9e4d8', pants: '#3a3f46', hat: '#c9ccd1', hatType: 'beanie' }),
  };

  // ---------- furniture drawers (local metres, centred) ----------
  const furn = {
    in_conveyor(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, sp = (sc && sc.st.lineSpeed) || 1, along = hw >= hh, L = along ? hw : hh, Wd = along ? hh : hw;
      c.save(); if (!along) c.rotate(Math.PI / 2);
      K.sh(c, L, Wd, 0.3); K.rect(c, -L, -Wd, 2 * L, 2 * Wd, '#3a3f46'); K.rect(c, -L + 0.08, -Wd + 0.1, 2 * L - 0.16, 2 * Wd - 0.2, '#1b1d22');
      const ph = (t * 1.2 * sp) % 0.5;
      for (let x = -L + 0.1 + ph; x < L - 0.1; x += 0.5) K.rect(c, x, -Wd + 0.1, 0.05, 2 * Wd - 0.2, '#2e3238');
      for (let i = -L; i <= L; i += 1.6) K.disc(c, i, -Wd, 0.09, '#9aa0a8'), K.disc(c, i, Wd, 0.09, '#9aa0a8');
      const ph2 = (t * 1.2 * sp) % 2.4;
      for (let x = -L + ph2; x < L - 0.5; x += 2.4) { K.rect(c, x, -Wd * 0.6, 0.6, Wd * 1.2, f.cargo || '#b08850'); K.rect(c, x + 0.05, -0.03, 0.5, 0.06, '#7a5a30'); }
      c.restore();
    },
    in_press(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, sp = (sc && sc.st.lineSpeed) || 1, k = 0.5 + 0.5 * Math.sin(t * 3 * sp + (f.seed || 0) * 9);
      K.sh(c, hw, hh, 0.35); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#3f6f9a'); K.rect(c, -hw + 0.12, -hh + 0.12, 2 * hw - 0.24, 2 * hh - 0.24, K.shade(f.c || '#3f6f9a', -0.25));
      K.rect(c, -hw * 0.6, -hh * 0.6 + k * hh * 0.5, hw * 1.2, hh * 0.5, '#9aa0a8');
      for (let x = -hw; x < hw; x += 0.4) K.rect(c, x, hh - 0.16, 0.2, 0.16, '#e3b23c'), K.rect(c, x + 0.2, hh - 0.16, 0.2, 0.16, '#1b1b1f');
      const hot = sc && sc.st.lineSpeed > 1.5;
      K.disc(c, hw - 0.25, -hh + 0.25, 0.1, hot ? (Math.sin(t * 12) > 0 ? '#ff3a2a' : '#5a1010') : '#3fdc6a');
      if (hot && sc.st.jam > 0.6) for (let i = 0; i < 3; i++) K.disc(c, Math.sin(t * 2 + i) * 0.4, -hh - 0.2 - ((t * 0.8 + i * 0.3) % 1), 0.2 + i * 0.05, 'rgba(70,70,70,0.45)');
    },
    in_panel(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit; K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d636b'); K.rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#2b2d33');
      for (let i = 0; i < 6; i++) K.disc(c, -hw + 0.25 + i * (2 * hw - 0.5) / 5, -hh * 0.35, 0.07, ['#3fdc6a', '#f2c230', '#ff3a2a'][(i + Math.floor(t * 2)) % 3]);
      K.disc(c, 0, hh * 0.35, 0.16, '#c0392b'); K.disc(c, 0, hh * 0.35, 0.1, '#ff5a4a');
      if (f.text) K.wtext(c, f.text, 0, hh + 0.18, 0.18, '#e9e4d8', 800);
    },
    in_timeclock(c, f, hw, hh, t) { const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a6a3a'); K.disc(c, 0, 0, Math.min(hw, hh) * 0.7, '#f4f1e8'); K.ln(c, 0, 0, Math.cos(t * 0.5) * 0.15, Math.sin(t * 0.5) * 0.15, '#111', 0.03); K.ln(c, 0, 0, Math.cos(t * 6) * 0.2, Math.sin(t * 6) * 0.2, '#c0392b', 0.015); },
    in_kettle(c, f, hw, hh, t) {
      const K = X.interiors.kit; K.disc(c, 0.12, 0.14, hw, 'rgba(0,0,0,0.3)'); K.disc(c, 0, 0, hw, '#c9ccd1'); K.disc(c, 0, 0, hw * 0.85, '#9aa0a8'); K.disc(c, 0, 0, hw * 0.75, f.c || '#8a4a1a');
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + (f.seed || 0) * 7, r = hw * 0.5 * ((t * 0.4 + i * 0.2) % 1); K.disc(c, Math.cos(a) * r, Math.sin(a) * r, 0.06 + 0.06 * Math.sin(t * 3 + i), K.shade(f.c || '#8a4a1a', 0.25)); }
      K.ln(c, -hw * 0.7, 0, hw * 0.7 * Math.cos(t * 1.5), hw * 0.7 * Math.sin(t * 1.5), '#e9e4d8', 0.06);
      for (let i = 0; i < 2; i++) K.disc(c, Math.sin(t + i * 3) * 0.3, -((t * 0.6 + i * 0.5) % 1) * hw, 0.3, 'rgba(255,255,255,0.12)');
    },
    in_fishtable(c, f, hw, hh, t) {
      const K = X.interiors.kit; K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#b9c2ca'); K.rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#dfe6ec');
      for (let x = -hw + 0.5; x < hw - 0.3; x += 0.8) { const y = Math.sin(x * 3) * hh * 0.3; K.oval(c, x, y, 0.32, 0.1, 0.2, '#8fa3b5'); c.fillStyle = '#7a8fa3'; c.beginPath(); c.moveTo(x + 0.3, y); c.lineTo(x + 0.45, y - 0.1); c.lineTo(x + 0.45, y + 0.1); c.fill(); K.disc(c, x - 0.2, y - 0.02, 0.025, '#111'); }
    },
    in_cheese(c, f, hw, hh) { const K = X.interiors.kit; K.sh(c, hw, hh, 0.25); for (let i = 0; i < 6; i++) { const x = -hw + 0.3 + (i % 3) * (2 * hw - 0.6) / 2, y = i < 3 ? -hh * 0.45 : hh * 0.45; K.rr(c, x - 0.25, y - 0.18, 0.5, 0.36, 0.05, '#a0602a'); K.rect(c, x - 0.2, y - 0.03, 0.4, 0.06, '#c4884a'); } },
    in_transformer(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, off = sc && sc.st.blackout; K.sh(c, hw, hh, 0.35); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#6a7a6a');
      for (let x = -hw + 0.15; x < hw; x += 0.3) K.rect(c, x, -hh + 0.1, 0.14, 2 * hh - 0.2, '#56655a');
      for (let i = -1; i <= 1; i++) { K.disc(c, i * hw * 0.55, 0, 0.18, '#c9a46a'); K.disc(c, i * hw * 0.55, 0, 0.09, '#7a5a30'); }
      if (!off) { const k = 0.3 + 0.2 * Math.sin(t * 50); c.globalAlpha = k; K.disc(c, 0, 0, hw * 0.4, '#bfe3ff'); c.globalAlpha = 1; }
      K.rect(c, -0.4, hh - 0.32, 0.8, 0.26, '#f2c230'); K.wtext(c, '⚡ 11kV', 0, hh - 0.19, 0.16, '#111', 800);
    },
    in_switchboard(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, off = sc && sc.st.blackout; K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a3f46'); K.rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 2 * hh - 0.12, '#1b2a22');
      if (!off) { c.strokeStyle = '#3fff7a'; c.lineWidth = 0.03; c.beginPath(); for (let i = 0; i <= 20; i++) { const x = -hw + 0.1 + i * (2 * hw - 0.2) / 20; c.lineTo(x, Math.sin(i * 0.8 + t * 3) * hh * 0.25 - hh * 0.2); } c.stroke(); }
      for (let i = 0; i < 8; i++) K.disc(c, -hw + 0.2 + i * (2 * hw - 0.4) / 7, hh * 0.45, 0.05, off ? '#ff3a2a' : (Math.sin(t * 2 + i) > -0.6 ? '#3fdc6a' : '#f2c230'));
    },
    in_breaker(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, off = sc && sc.st.blackout; K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#f2c230'); K.rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#2b2d33');
      K.rect(c, -0.12, -hh * 0.6, 0.24, hh * 1.2, '#5d636b'); K.rr(c, -0.22, off ? 0.05 : -hh * 0.6, 0.44, hh * 0.5, 0.06, '#c0392b');
      K.wtext(c, off ? 'AV' : 'PÅ', 0, hh + 0.2, 0.22, off ? '#ff6b5a' : '#7dff9a', 800);
    },
    in_pump(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, sp = sc && sc.st.valve ? 1 + sc.st.valve : 1; K.sh(c, hw, hh, 0.35); K.rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.2, '#2f6fb5'); K.disc(c, 0, 0, Math.min(hw, hh) * 0.8, '#255a94');
      const a = t * 4 * sp; for (let i = 0; i < 4; i++) K.ln(c, 0, 0, Math.cos(a + i * TAU / 4) * hw * 0.6, Math.sin(a + i * TAU / 4) * hw * 0.6, '#c9ccd1', 0.1);
      K.disc(c, 0, 0, 0.12, '#e3b23c');
    },
    in_basin(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a9298'); K.rect(c, -hw + 0.18, -hh + 0.18, 2 * hw - 0.36, 2 * hh - 0.36, f.c || '#2a7fa8');
      c.save(); c.beginPath(); c.rect(-hw + 0.18, -hh + 0.18, 2 * hw - 0.36, 2 * hh - 0.36); c.clip();
      for (let i = 0; i < 5; i++) { const r = ((t * 0.5 + i * 0.2) % 1) * Math.max(hw, hh); c.strokeStyle = 'rgba(255,255,255,' + (0.25 * (1 - r / Math.max(hw, hh))).toFixed(3) + ')'; c.lineWidth = 0.05; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
      if (f.duck) { const a = t * 0.3; K.disc(c, Math.cos(a) * hw * 0.5, Math.sin(a) * hh * 0.5, 0.18, '#f2d230'); K.disc(c, Math.cos(a) * hw * 0.5 + 0.12, Math.sin(a) * hh * 0.5 - 0.1, 0.1, '#f2d230'); }
      c.restore();
    },
    in_pipe(c, f, hw, hh) { const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#3a7ab5'); K.rect(c, -hw, -hh, 2 * hw, Math.min(hw, hh) * 0.5, 'rgba(255,255,255,0.25)'); const along = hw > hh; for (let k = -1; k <= 1; k += 2) along ? K.rect(c, k * hw * 0.7 - 0.08, -hh - 0.05, 0.16, 2 * hh + 0.1, '#5d636b') : K.rect(c, -hw - 0.05, k * hh * 0.7 - 0.08, 2 * hw + 0.1, 0.16, '#5d636b'); },
    in_gauge(c, f, hw, hh, t, sc) { const K = X.interiors.kit, v = sc ? (sc.st.pressure || 0.2) : 0.2; K.disc(c, 0, 0, hw, '#3a3f46'); K.disc(c, 0, 0, hw * 0.85, '#f4f1e8'); K.disc(c, hw * 0.4, -hw * 0.3, hw * 0.15, '#ff3a2a'); const a = Math.PI * 0.75 + v * Math.PI * 1.5 + (v > 0.85 ? Math.sin(t * 30) * 0.05 : 0); K.ln(c, 0, 0, Math.cos(a) * hw * 0.7, Math.sin(a) * hw * 0.7, '#c0392b', 0.04); },
    in_spray(c, f, hw, hh, t) { if (f.hidden) return; const K = X.interiors.kit; for (let i = 0; i < 14; i++) { const ph = (t * 1.6 + i / 14) % 1, a = -Math.PI / 2 + Math.sin(i * 7.3) * 0.7; K.disc(c, Math.cos(a) * ph * hw * 2, Math.sin(a) * ph * hh * 2 + ph * ph * hh, 0.1 + ph * 0.15, 'rgba(150,210,255,' + (0.7 * (1 - ph)).toFixed(2) + ')'); } },
    in_compactor(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, k = sc && sc.st.crushT > 0 ? 0.5 - 0.5 * Math.cos(sc.st.crushT * 4) : 0;
      K.sh(c, hw, hh, 0.35); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3e8e5a'); K.rect(c, -hw + 0.15, -hh + 0.15, 2 * hw - 0.3, 2 * hh - 0.3, '#2b2d33');
      for (let i = 0; i < 7; i++) K.rect(c, -hw + 0.3 + (i * 0.37) % (2 * hw - 0.8), -hh + 0.5 + ((i * 0.61) % 1) * (2 * hh - 1.2), 0.4, 0.3, ['#c0392b', '#2f6fb5', '#e9e4d8', '#8a6a3a'][i % 4]);
      K.rect(c, -hw + 0.15, -hh + 0.15, 2 * hw - 0.3, 0.25 + k * (2 * hh - 0.7), '#7d838c'); K.rect(c, -hw + 0.15, -hh + 0.3 + k * (2 * hh - 0.7), 2 * hw - 0.3, 0.12, '#e3b23c');
      K.wtext(c, 'KOMPRIMATOR', 0, hh - 0.25, 0.2, '#f2c230', 800);
    },
    in_bins(c, f, hw, hh) { const K = X.interiors.kit; const cols = ['#3e8e5a', '#2f6fb5', '#c0392b', '#7a4a20', '#8a8f99'], n = Math.max(1, Math.round(hw / 0.6)); for (let i = 0; i < n; i++) { const x = -hw + (i + 0.5) * 2 * hw / n; K.sh(c, hw / n, hh, 0.25); K.rr(c, x - hw / n + 0.06, -hh, 2 * hw / n - 0.12, 2 * hh, 0.08, cols[i % cols.length]); K.rect(c, x - hw / n + 0.1, -hh + 0.08, 2 * hw / n - 0.2, 0.08, 'rgba(0,0,0,0.3)'); } },
    in_trash(c, f, hw, hh) { const K = X.interiors.kit; for (let i = 0; i < 34; i++) { const a = i * 2.4 + (f.seed || 0) * 5, r = ((i * 0.37) % 1) * Math.min(hw, hh) * 0.9; K.oval(c, Math.cos(a) * r, Math.sin(a) * r * hh / hw, 0.35, 0.25, a, ['#2b2d33', '#3a3a2a', '#5a5040', '#1b1b1f', '#c9ccd1', '#c0392b'][i % 6]); } },
    in_pant(c, f, hw, hh, t) { const K = X.interiors.kit; K.sh(c, hw, hh, 0.3); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e8edf2'); K.rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, hh * 0.5, '#3e8e5a'); K.wtext(c, 'PANT', 0, -hh + 0.1 + hh * 0.25, 0.18, '#fff', 800); K.disc(c, 0, hh * 0.3, 0.16, '#1b1d22'); K.disc(c, hw - 0.15, hh - 0.15, 0.05, Math.sin(t * 2) > 0 ? '#3fdc6a' : '#1a5a2a'); },
    in_bus(c, f, hw, hh, t, sc) {
      // a city bus, roof view, nose up (length along local y)
      const K = X.interiors.kit, lift = sc && sc.st.lift ? sc.st.lift : 0, s = 1 + lift * 0.04;
      c.save(); c.scale(s, s); K.rr(c, -hw + 0.12 + lift * 0.3, -hh + 0.25 + lift * 0.4, 2 * hw, 2 * hh, 0.3, 'rgba(0,0,0,0.35)');
      K.rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.35, f.c || '#c0392b'); K.rr(c, -hw + 0.15, -hh + 0.15, 2 * hw - 0.3, 2 * hh - 0.3, 0.25, K.shade(f.c || '#c0392b', 0.12));
      K.rect(c, -hw + 0.2, -hh + 0.1, 2 * hw - 0.4, 0.5, '#24323f');
      for (let y = -hh + 1; y < hh - 0.8; y += 1.2) { K.rect(c, -hw + 0.02, y, 0.14, 0.9, '#24323f'); K.rect(c, hw - 0.16, y, 0.14, 0.9, '#24323f'); }
      K.rect(c, -0.6, -hh * 0.2, 1.2, 1.6, '#c9ccd1'); K.rect(c, -0.5, hh * 0.45, 1, 1, '#9aa0a8');
      if (f.text) { c.save(); c.translate(0, hh * 0.1); c.rotate(-Math.PI / 2); K.wtext(c, f.text, 0, 0, 0.42, '#fff', 800); c.restore(); }
      c.restore();
    },
    in_buslift(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, 'rgba(0,0,0,0.25)');
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { K.rect(c, sx * hw - 0.25, sy * hh * 0.7 - 0.25, 0.5, 0.5, '#e3b23c'); K.rect(c, sx * hw - 0.1, sy * hh * 0.7 - 0.1, 0.2, 0.2, '#1b1b1f'); }
      for (let y = -hh; y < hh; y += 0.6) K.rect(c, -hw, y, 0.12, 0.3, '#e3b23c'), K.rect(c, hw - 0.12, y, 0.12, 0.3, '#e3b23c');
    },
    in_pit(c, f, hw, hh) { const K = X.interiors.kit; K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#141518'); for (let y = -hh; y < hh; y += 0.5) K.rect(c, -hw - 0.1, y, 0.1, 0.25, (y * 2) % 2 ? '#e3b23c' : '#111'), K.rect(c, hw, y, 0.1, 0.25, '#e3b23c'); K.disc(c, 0, hh * 0.3, 0.2, '#e3b23c'); },
    in_washer(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, on = !f.off, sp = (sc && sc.st.spinT > 0 && f.dryer) ? 4 : 1; K.sh(c, hw, hh, 0.3); K.rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.08, f.dryer ? '#d8dce2' : '#f4f6f8'); K.rect(c, -hw, -hh, 2 * hw, 0.22, '#9aa0a8');
      const r = Math.min(hw, hh) * 0.68; K.disc(c, 0, 0.08, r, '#5d636b'); K.disc(c, 0, 0.08, r * 0.85, on ? (f.dryer ? '#e9d8b8' : '#7fc4e8') : '#2b2d33');
      if (on) { const a = t * (f.dryer ? 3 : 6) * sp + (f.seed || 0) * 9; for (let i = 0; i < 3; i++) K.oval(c, Math.cos(a + i * 2.1) * r * 0.45, 0.08 + Math.sin(a + i * 2.1) * r * 0.45, r * 0.25, r * 0.15, a + i, ['#c0392b', '#f2f2f2', '#2f6fb5'][i]); }
      K.disc(c, -r * 0.3, -r * 0.2, r * 0.22, 'rgba(255,255,255,0.35)'); K.disc(c, hw - 0.12, -hh + 0.11, 0.05, on ? '#3fdc6a' : '#5a1010');
    },
    in_paperroll(c, f, hw) { const K = X.interiors.kit; K.disc(c, 0.1, 0.12, hw, 'rgba(0,0,0,0.3)'); K.disc(c, 0, 0, hw, '#f4f1e8'); for (let r = hw * 0.85; r > hw * 0.3; r -= 0.08) { c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 0.02; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); } K.disc(c, 0, 0, hw * 0.25, '#8a6a3a'); },
    in_printpress(c, f, hw, hh, t, sc) {
      const K = X.interiors.kit, sp = sc && sc.st.rushT > 0 ? 3 : 1; K.sh(c, hw, hh, 0.35); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b2d33');
      for (let x = -hw + 0.6; x < hw - 0.4; x += 1.4) { K.rect(c, x - 0.3, -hh + 0.1, 0.6, 2 * hh - 0.2, '#5d636b'); const a = t * 5 * sp; K.ln(c, x, 0, x + Math.cos(a) * 0.25, Math.sin(a) * hh * 0.6, '#c9ccd1', 0.08); K.disc(c, x, -hh + 0.25, 0.1, ['#2fb6e8', '#e84aa0', '#f2d230', '#111'][Math.round((x + hw) / 1.4) % 4]); }
      K.rect(c, -hw, -0.18, 2 * hw, 0.36, '#f4f1e8'); const ph = (t * 2 * sp) % 0.8; for (let x = -hw + ph; x < hw; x += 0.8) K.rect(c, x, -0.14, 0.4, 0.04, '#444');
    },
    in_papers(c, f, hw, hh, t, sc) { const K = X.interiors.kit; K.sh(c, hw, hh, 0.25); K.rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e9e4d8'); for (let y = -hh + 0.15; y < hh - 0.1; y += 0.14) K.rect(c, -hw + 0.1, y, 2 * hw - 0.2, 0.03, 'rgba(0,0,0,0.12)'); K.rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 0.2, '#1b1b1f'); K.wtext(c, (sc && sc.st.headline) || 'BUSSBY TIDENDE', 0, hh * 0.2, Math.min(0.16, hw * 0.18), '#111', 800); },
  };

  const base = (sc, o) => Object.assign(sc, o);
  const flick = (sc, b, pts, r, col, i, fix) => { for (const q of pts) b.light(q[0], q[1], r, col, i, { fix: fix || 'tube', flick: q[2] ? 1 : 0 }); };

  // =============== 1. FACTORY ===============
  D('factory', {
    size: [36, 28], weight: 2, minSide: 14,
    names: ['Bussby Ostehøvelfabrikk', 'Artur Mek. Verksted', 'Nordisk Bolt & Mutter', 'Fabrikken AS'],
    greet: ['Hard hats ON. Brains optional.', 'Line 2 is down. Line 1 is crying.', 'Fourteen thousand cheese slicers a day!'],
    style: { w: 4.4, door: '#5a5f66', frame: '#e3b23c', plate: '#2b2f3a', text: '#f2c230', light: '#ffd9a0', roller: 1, hazard: 1 },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 29, ambient: 0.55, wallTop: '#4a4f55', wallLo: '#2b2f33', wallHi: '#7d848c' });
      b.room(0, 0, 36, 28, 'concrete', '#6e6c66', '#585650'); b.room(27, 0, 36, 9, 'lino', '#a7afb8', '#87909a');
      b.box(); b.entrance(12, 4.4, 'roller');
      b.vwall(27, 0.5, 9, [[6.5, 1.6]]); b.hwall(9, 27, 35.75, [[31.5, 1.8]]);
      sc.st.lineSpeed = 1; sc.st.jam = 0;
      b.f('in_conveyor', 13, 7, 18, 1.2, { solid: 'low', cargo: '#c9a46a' }); b.f('in_conveyor', 13, 14, 18, 1.2, { solid: 'low', cargo: '#9aa0a8' });
      sc.st.pressA = b.f('in_press', 23.6, 7, 2.6, 2.4, { solid: 'tall', c: '#3f6f9a', seed: 0.1 }); b.f('in_press', 2.6, 14, 2.6, 2.4, { solid: 'tall', c: '#9a3f3f', seed: 0.4 });
      b.f('in_panel', 23.6, 10.2, 1.8, 0.8, { solid: 'low', text: 'LINE CTRL' });
      b.f('paint', 13, 10.5, 22, 0.14, { c: '#e3b23c', layer: 0 }); b.f('paint', 13, 17.5, 22, 0.14, { c: '#e3b23c', layer: 0 });
      b.f('paint', 23.6, 3.6, 3.6, 1.4, { hazard: 1, layer: 0 }); b.f('paint', 30, 22, 7, 5, { hazard: 1, layer: 0 });
      b.f('stencil', 6, 20.5, 6, 0.6, { text: 'HJELM PÅBUDT', layer: 0 });
      b.f('pallet', 30, 13, 2.2, 2.2, { solid: 'low' }); b.f('crates', 30, 13, 2, 2, { solid: 'low' }); b.f('pallet', 33.6, 13, 2.2, 2.2, { solid: 'low' });
      b.f('forklift', 33.2, 17, 1.5, 2.6, { solid: 'low', rot: Math.PI / 2 });
      b.f('shelf', 4, 1, 7, 0.9, { solid: 'tall', parts: 1 }); b.f('shelf', 13, 1, 7, 0.9, { solid: 'tall', parts: 1 });
      b.f('in_timeclock', 16.5, 27.3, 0.8, 0.4, { layer: 2 }); b.f('poster', 6, 27.4, 2.4, 0.3, { kind: 'bus', layer: 2 });
      b.f('locker', 1, 22, 0.6, 5, { solid: 'tall' }); b.f('bench', 2.5, 22, 0.6, 3.6, { solid: 'low' });
      // foreman's office
      b.f('desk', 31.5, 3, 3, 1.2, { solid: 'low', c: '#6b6f78', pc: 1 }); b.f('chair', 31.5, 1.8, 0.7, 0.7, { rot: Math.PI / 2 }); b.f('filing', 35, 6.5, 0.9, 1.2, { solid: 'tall' }); b.f('coffee', 28.2, 1.2, 0.8, 0.6, { solid: 'low' });
      b.f('whiteboard', 35.5, 3, 0.3, 3.2, { layer: 2 });
      sc.st.ind_props = [[33.8, 25.8], [32.6, 25.8], [33.8, 24.6], [28, 25.8, 'propane']];
      for (const q of [[6, 8.4, -Math.PI / 2], [12, 5.6, Math.PI / 2], [18, 8.4, -Math.PI / 2], [9, 15.4, -Math.PI / 2], [16, 12.6, Math.PI / 2]]) b.ped('worker', q[0], q[1], q[2], { look: K.pick(['worker', 'in_hiviz']), chance: 0.85 });
      b.ped('worker', 18, 20, 0, { look: 'in_foreman', patrol: [[4, 19], [22, 19], [22, 11], [4, 11]] });
      b.ped('sitter', 31.5, 1.85, Math.PI / 2, { look: 'suit', chance: 0.7, when: 'day' });
      b.ped('guard', 10, 24, 0, { when: 'night', chance: 0.8, wander: true });
      b.act(16.5, 26, 1.4, () => ready(sc, 'shift', 90) ? 'F: Clock in for a shift (+$60)' : 'Shift done. Go home, take the bus.', () => {
        if (!ready(sc, 'shift', 90)) return; use(sc, 'shift');
        K.money(60, 'factory shift'); K.sfx('cash');
        K.popup(K.pick(['You packed 400 cheese slicers. Artur takes 50% "for the union".', 'Eight hours of tightening one bolt. Character building.', 'You were employee of the month for 4 minutes.']));
        shout(sc, K, 'worker', ['Welcome to the grind, nybegynner!', 'Lunch is brunost. Always brunost.']);
      });
      b.act(23.6, 11.6, 1.4, () => sc.st.lineSpeed > 1.5 ? 'The line is screaming...' : 'F: Crank the line to MAKS (sabotage)', () => {
        if (sc.st.lineSpeed > 1.5) return; sc.st.lineSpeed = 3.2; sc.st.jam = 0; K.sfx('clunk');
        K.popup('Line speed: MAKS. Production up 300%. Safety down 300%.');
        shout(sc, K, 'worker', ['WHO TOUCHED THE DIAL?!', 'Too fast! TOO FAST!', 'Ostehøvler everywhere!'], '#ff6b5a');
        if (witness(sc, K)) K.crime('trespass', K.P.ped.x, K.P.ped.y, { place: 'factory' });
      });
      b.act(31.5, 4.4, 1.5, () => ready(sc, 'memo', 30) ? 'F: Read the foreman\'s memo' : null, () => { use(sc, 'memo'); K.popup(K.pick(['MEMO: Whoever keeps parking a BUS in the loading bay: Artur says it\'s fine.', 'MEMO: Hard hats are not soup bowls. -Ledelsen', 'MEMO: Production target 2026: one million slicers. Nobody needs this many.'])); });
      flick(sc, b, [[6, 7], [16, 7], [6, 15], [16, 15, 1], [24, 18], [10, 23], [30, 20]], 9, '#fff1d0', 0.62, 'bay');
      b.light(31.5, 4.5, 6, '#f4f8ff', 0.6, { fix: 'tube' });
      b.zone(27, 0, 36, 9, 'staff');
    },
    tick(sc, dt, t, K) {
      props(sc); const st = sc.st;
      if (st.lineSpeed > 1.5) {
        st.jam += dt / 14;
        if (st.jam > 0.6 && !st.smoked) { st.smoked = 1; shout(sc, K, 'worker', ['It\'s smoking! Evacuate!', 'Ring Brannvesenet!'], '#ff6b5a'); for (const p of alive(sc)) if (K.mine(p)) K.panic(sc, p); }
        if (st.jam >= 1) {
          const f = st.pressA; st.lineSpeed = 1; st.jam = 0; st.smoked = 0;
          boom(sc, K, f.x, f.y, 1.2);
          K.money(250, 'insurance fraud? sabotage bonus'); K.popup('The press went BANG. A rival factory slips you $250. Bussby will have to slice its own cheese.');
        }
      }
    },
  });

  // =============== 2. BRUNOST & FISH PLANT ===============
  D('brunost', {
    size: [30, 24], weight: 2, minSide: 12,
    names: ['Gudbrandsdal Brunost & Fisk', 'Bussby Meieri', 'Tine-ish Meieri', 'Lutefisk Larsen AS'],
    greet: ['Hairnet, please. Also beardnet.', 'Smells like caramel and cod. Welcome!', 'Fresh brunost, sweeter than Artur\'s smile.'],
    style: { w: 2.6, door: '#5b3a1e', frame: '#e9e4d8', plate: '#7a4a20', text: '#fff2d8', light: '#ffe2a0' },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 25, ambient: 0.85, wallTop: '#9ab0bf', wallLo: '#6d8090', wallHi: '#d0dde6' });
      b.room(0, 0, 18, 24, 'tile', '#e8ecef', '#c9d2d8'); b.room(18, 0, 30, 24, 'tile', '#d6e4ee', '#a9bccb');
      b.box(); b.entrance(9, 2.6);
      b.vwall(18, 0.5, 23.5, [[12, 2.2], [20, 2.0]]);
      sc.st.kettles = [];
      for (const q of [[4, 5], [9, 5], [14, 5]]) sc.st.kettles.push(b.f('in_kettle', q[0], q[1], 3, 3, { solid: 'low', c: '#8a4a1a', seed: q[0] / 10 }));
      b.f('in_conveyor', 9, 11, 14, 1, { solid: 'low', cargo: '#a0602a' }); b.f('in_cheese', 4, 16, 3, 1.6, { solid: 'low' }); b.f('in_cheese', 9, 16, 3, 1.6, { solid: 'low' }); b.f('sign', 9, 0.8, 4, 0.5, { text: 'BRUNOST — 37 kr/kg', bg: '#7a4a20', size: 0.28, layer: 2 });
      b.f('counter', 4, 21.6, 6, 1, { solid: 'low', c: '#7a4a20', top: '#e9d8b8' }); b.f('register', 4, 21.6, 0.7, 0.5);
      b.f('in_fishtable', 24, 5, 8, 1.6, { solid: 'low' }); b.f('in_fishtable', 24, 11, 8, 1.6, { solid: 'low' });
      b.f('in_basin', 24, 18, 6, 4, { solid: 'low', c: '#3a5a6a' }); b.f('sign', 24, 15.4, 3.6, 0.45, { text: 'LUTEFISK — LYE BATH', bg: '#c0392b', size: 0.22 });
      b.f('freezer', 28.6, 22, 1.4, 2.6, { solid: 'low' }); b.f('shelf', 21, 23.1, 4, 0.8, { solid: 'tall', parts: 1 });
      b.f('cooler', 16.8, 22.5, 0.8, 0.8, { solid: 'low' });
      for (const q of [[4, 7.4, -Math.PI / 2], [14, 7.4, -Math.PI / 2], [6, 12.2, -Math.PI / 2]]) b.ped('worker', q[0], q[1], q[2], { look: 'in_dairy', chance: 0.9 });
      b.ped('cashier', 4, 20.6, Math.PI / 2, { look: 'in_dairy' });
      for (const q of [[22, 6.4, -Math.PI / 2], [26, 9.6, Math.PI / 2], [21, 15.5, 0]]) b.ped('worker', q[0], q[1], q[2], { look: 'in_fish', chance: 0.85 });
      b.ped('customer', 8, 19, 0, { chance: 0.7, wander: true });
      b.act(4, 19.8, 1.5, () => 'F: Buy a brunost block ($8, +15 hp)', () => {
        if (K.P.money < 8) { K.popup('Brunost costs $8. You have dreams and lint.'); K.sfx('deny'); return; }
        K.money(-8, 'brunost'); hp(K, 15); K.sfx('cash'); K.popup(K.pick(['Sweet, brown, sticky. Your teeth file a complaint.', 'You eat it with the ostehøvel like a true Norwegian.', 'Brunost: the cheese that is legally fudge.']));
      });
      b.act(9, 7.6, 1.6, () => ready(sc, 'stir', 40) ? 'F: Stir the kettle (+$25)' : null, () => { use(sc, 'stir'); K.money(25, 'kettle duty'); K.sfx('glug'); K.popup('You stir 300 litres of caramelised whey. Arms of a viking. $25.'); });
      b.act(24, 15, 1.6, () => sc.st.stink ? null : 'F: Dump the lutefisk lye into the brunost', () => {
        sc.st.stink = 1; for (const f of sc.st.kettles) f.c = '#5a7a3a'; K.sfx('glug');
        K.popup('The brunost turns green. The smell reaches Storgata. Somewhere, a grandmother weeps.');
        for (const p of alive(sc)) if (K.mine(p)) { K.panic(sc, p); if (Math.random() < 0.4) K.say(p, K.pick(['UFF!', 'Æsj!', 'MY EYES!', 'That\'s a war crime!']), '#c8ff9a'); }
        if (witness(sc, K, 20)) K.crime('trespass', K.P.ped.x, K.P.ped.y, { place: 'brunost' });
      });
      flick(sc, b, [[4, 6], [12, 6], [6, 16], [13, 16], [24, 7], [24, 18]], 8, '#f4f8ff', 0.6);
      b.zone(18, 0, 30, 15, 'staff'); b.zone(0, 0, 18, 13, 'staff');
    },
    tick(sc, dt, t, K) { if (sc.st.stink) for (let i = 0; i < 2; i++) { const f = sc.st.kettles[i]; if (f && X.addLight && X.inView(f.x, f.y, 6)) X.addLight(f.x, f.y, 4, '#9aff6a', 0.25 + 0.1 * Math.sin(t * 3 + i)); } },
  });

  // =============== 3. POWER SUBSTATION / CONTROL ROOM ===============
  D('powerplant', {
    size: [32, 26], weight: 1.5, minSide: 12,
    names: ['Bussby Kraft', 'Nettstasjon Nord', 'Bussby Energi Kontrollrom', 'Elverket'],
    greet: ['Don\'t touch anything that hums.', 'Welcome to Bussby Kraft. Prices up 400% since breakfast.', 'Strøm is expensive. Bus tickets are cheap. Think about it.'],
    style: { w: 2.2, door: '#3a4048', frame: '#f2c230', plate: '#1b1b1f', text: '#f2c230', light: '#bfe3ff', hazard: 1 },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 27, ambient: 0.35, wallTop: '#3a4250', wallLo: '#1e232b', wallHi: '#6a7a8e' });
      b.room(0, 0, 32, 14, 'steel', '#5d6570', '#4b525c'); b.room(0, 14, 32, 26, 'lino', '#8a96a2', '#6f7b88');
      b.box(); b.entrance(16, 2.4);
      b.hwall(14, 0, 32, [[16, 2.4]]);
      for (const x of [5, 12, 20, 27]) b.f('in_transformer', x, 5.5, 4.4, 3.4, { solid: 'tall' });
      b.f('paint', 16, 9.6, 30, 0.14, { c: '#e3b23c', layer: 0 }); b.f('stencil', 16, 11.6, 10, 0.7, { text: 'LIVSFARE — 11 000 V', layer: 0 });
      b.f('rope', 16, 9.8, 26, 0.2, { layer: 1 });
      b.f('in_switchboard', 16, 15.3, 10, 1, { solid: 'low' }); b.f('in_breaker', 29.5, 15.4, 1.8, 1.4, { solid: 'low' });
      b.f('desk', 8, 19.5, 3.2, 1.3, { solid: 'low', c: '#4a4f58', pc: 1 }); b.f('chair', 8, 20.7, 0.7, 0.7, { rot: -Math.PI / 2 });
      b.f('desk', 16, 19.5, 3.2, 1.3, { solid: 'low', c: '#4a4f58', pc: 1 }); b.f('chair', 16, 20.7, 0.7, 0.7, { rot: -Math.PI / 2 });
      b.f('monitors', 16, 15.9, 6, 0.4, { layer: 2 });
      b.f('coffee', 2, 24.8, 0.8, 0.6, { solid: 'low' }); b.f('vending', 30.5, 24.5, 1.1, 1, { solid: 'tall', c: '#c0392b', cols: ['#f2c230', '#c0392b', '#2f6fb5', '#3e8e5a', '#f2c230', '#e86aa0', '#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a', '#e86aa0', '#c0392b'] });
      b.f('poster', 24, 25.6, 2.2, 0.3, { kind: 'bus', layer: 2 }); b.f('plant', 1.2, 15.4, 0.9, 0.9, { solid: 'low' });
      b.ped('sitter', 8, 20.75, -Math.PI / 2, { look: 'in_engineer' }); b.ped('sitter', 16, 20.75, -Math.PI / 2, { look: 'in_engineer', chance: 0.8 });
      b.ped('worker', 10, 11.6, 0, { look: 'in_engineer', patrol: [[3, 11.5], [29, 11.5]] });
      b.ped('guard', 24, 21, Math.PI, { wander: true, chance: 0.8 });
      for (const q of [[6, 6], [16, 6], [26, 6]]) b.light(q[0], q[1], 10, '#cfe3ff', 0.55, { fix: 'bay' });
      for (const q of [[8, 20], [16, 20], [24, 20]]) b.light(q[0], q[1], 8, '#f4f8ff', 0.7, { fix: 'tube' });
      for (const q of [[2, 13], [30, 13], [16, 24]]) b.light(q[0], q[1], 6, '#ff3a2a', 0, { emerg: 1 });
      b.act(29.5, 16.8, 1.5, () => sc.st.blackout ? 'F: Flip the main breaker back ON' : 'F: Flip the MAIN BREAKER', () => {
        sc.st.blackout = !sc.st.blackout; lightsOff(sc, sc.st.blackout); K.sfx('clunk');
        if (sc.st.blackout) {
          K.popup('KLONK. Half of Bussby goes dark. The buses still run, because buses are great.');
          shout(sc, K, 'sitter', ['Hvem slo av strømmen?!', 'The whole grid! GONE!', 'Not again... Artur\'s sauna is on that line!'], '#ff6b5a');
          if (ready(sc, 'bo', 120)) { use(sc, 'bo'); K.money(150, 'blackout tip'); K.popup('A burglar texts: "thx for the blackout" and sends $150.'); }
          if (witness(sc, K, 16)) K.crime('trespass', K.P.ped.x, K.P.ped.y, { place: 'powerplant' });
        } else K.popup('Lights back. 40 000 microwaves beep at once.');
      });
      b.act(12, 9, 1.4, () => 'F: Lick the transformer', () => {
        const p = K.P.ped; p.hp = Math.max(1, p.hp - 30); K.sfx('punch');
        K.popup(K.pick(['BZZZT. 11 kV of regret. Your hair is now a hedgehog.', 'Tastes like copper and bad decisions.', 'You can now hear radio Bussby in your fillings.']));
      });
      b.act(16, 17.6, 1.6, () => ready(sc, 'sell', 60) ? 'F: Sell some power to Sweden (+$80)' : null, () => { use(sc, 'sell'); K.money(80, 'power export'); K.sfx('cash'); K.popup('You export 3 MWh to Sweden. They pay in meatballs, converted to $80.'); });
      b.zone(0, 0, 32, 14, 'staff');
    },
    tick(sc, dt, t, K) {
      if (sc.st.blackout) for (const l of sc.lights) if (l.emerg) l.i = 0.4 + 0.4 * Math.sin(t * 6);
      if (!sc.st.blackout && sc.amb0 != null && sc.ambient !== sc.amb0) lightsOff(sc, false);
    },
  });

  // =============== 4. WATER WORKS / PUMPING STATION ===============
  D('waterworks', {
    size: [34, 26], weight: 1.5, minSide: 12,
    names: ['Bussby Vannverk', 'Pumpestasjon Sør', 'Kommunalt Vann & Avløp'],
    greet: ['Bussby water: 100% fjord, 0% bus.', 'Keep your hands out of the drinking water please.', 'We are the reason you can flush. Respect.'],
    style: { w: 2.4, door: '#2f5a7a', frame: '#c9ccd1', plate: '#1b2a3a', text: '#bfe3ff', light: '#cfe8ff' },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 28, ambient: 0.6, wallTop: '#3a5a6e', wallLo: '#21384a', wallHi: '#6d90a8' });
      b.room(0, 0, 34, 26, 'concrete', '#7a8890', '#62707a');
      b.box(); b.entrance(17, 2.4);
      sc.st.pressure = 0.25; sc.st.valve = 0;
      b.f('in_basin', 8, 7, 12, 8, { solid: 'low', duck: 1 }); b.f('in_basin', 25, 7, 12, 8, { solid: 'low', c: '#3f8a6a' });
      for (const x of [5, 10, 15, 20]) b.f('in_pump', x, 16.5, 2.2, 2.2, { solid: 'low' });
      b.f('in_pipe', 12.5, 18.4, 18, 0.5, { layer: 0 }); b.f('in_pipe', 22.5, 14, 0.5, 9, { layer: 0 }); b.f('in_pipe', 30, 18.4, 6, 0.5, { layer: 0, c: '#c0392b' });
      b.f('in_gauge', 26, 17, 1, 1, { layer: 2 });
      b.f('in_panel', 28.5, 16.6, 2, 0.8, { solid: 'low', text: 'VENTIL' });
      sc.st.spray = b.f('in_spray', 30, 18.4, 2.5, 2.5, { layer: 1, hidden: 1 });
      b.f('desk', 4, 23.5, 3, 1.2, { solid: 'low', c: '#4a4f58', pc: 1 }); b.f('chair', 4, 22.4, 0.7, 0.7, { rot: Math.PI / 2 });
      b.f('cooler', 32.5, 24.5, 0.8, 0.8, { solid: 'low' }); b.f('sign', 17, 0.8, 6, 0.5, { text: 'DRIKKEVANN — IKKE BAD', bg: '#2f6fb5', size: 0.26, layer: 2 });
      b.f('locker', 33.4, 11, 0.6, 4, { solid: 'tall' }); b.f('toolbox', 29, 23.8, 1.2, 0.7, { solid: 'low' });
      b.ped('worker', 12, 12, 0, { look: 'in_water', patrol: [[2, 12], [31, 12], [31, 20], [2, 20]] });
      b.ped('worker', 27, 19.8, -Math.PI / 2, { look: 'in_water', chance: 0.8 });
      b.ped('sitter', 4, 22.45, Math.PI / 2, { look: 'in_water', chance: 0.7 });
      b.act(28.5, 18, 1.5, () => sc.st.burst ? 'F: Close the valve' : 'F: Open the valve a bit more', () => {
        K.sfx('clunk');
        if (sc.st.burst) { sc.st.burst = 0; sc.st.valve = 0; sc.st.pressure = 0.25; sc.st.spray.hidden = 1; K.popup('Valve closed. Storgata is a lake now, but a calm lake.'); return; }
        sc.st.valve = Math.min(3, sc.st.valve + 1); sc.st.pressure = 0.25 + sc.st.valve * 0.25;
        if (sc.st.valve < 3) { K.popup(['', 'Pressure up. The pipes groan like Artur on a Monday.', 'Pressure HIGH. A pipe whistles the national anthem.'][sc.st.valve]); shout(sc, K, 'worker', ['Eh... why is the needle moving?', 'Don\'t touch that!']); return; }
        sc.st.burst = 1; sc.st.spray.hidden = 0; K.sfx('glass');
        K.popup('PANG! The main bursts. A fountain show erupts on Storgata. Tourists applaud.');
        for (const p of alive(sc)) if (K.mine(p)) K.panic(sc, p);
        if (ready(sc, 'burst', 120)) { use(sc, 'burst'); K.money(120, 'plumbing "consultancy"'); K.popup('A plumber pays you $120 for the business. Take the bus to the next job!'); }
        if (witness(sc, K, 16)) K.crime('trespass', K.P.ped.x, K.P.ped.y, { place: 'waterworks' });
      });
      b.act(8, 11.8, 1.6, () => ready(sc, 'drink', 30) ? 'F: Drink straight from the basin (+10 hp)' : null, () => { use(sc, 'drink'); hp(K, 10); K.sfx('glug'); K.popup(K.pick(['Crisp, cold, fjord-fresh. Slight hint of duck.', 'Best water in Norway. The duck agrees.'])); });
      b.act(26, 18.6, 1.3, () => ready(sc, 'read', 60) ? 'F: Read the gauge for the inspector (+$40)' : null, () => { use(sc, 'read'); K.money(40, 'meter reading'); K.popup('You write "seems fine" on the form. That is $40 of kommunal efficiency.'); });
      flick(sc, b, [[8, 7], [25, 7], [8, 18], [20, 18, 1], [30, 22]], 9, '#cfe8ff', 0.6, 'bay');
      b.zone(0, 0, 34, 12, 'staff');
    },
    tick(sc, dt, t, K) {
      const f = sc.st.spray; if (!f || f.hidden) return;
      if (X.inView(f.x, f.y, 5)) X.addLight(f.x, f.y, 4, '#7fc4ff', 0.3);
      const p = K.P.ped; if (Math.hypot(p.x - f.x, p.y - f.y) < 2) { p.vx = (p.vx || 0) + (p.x - f.x) * dt * 6; p.vy = (p.vy || 0) + (p.y - f.y) * dt * 6; }
    },
  });

  // =============== 5. RECYCLING / GARBAGE DEPOT ===============
  D('recycling', {
    size: [36, 28], weight: 1.5, minSide: 13,
    names: ['Bussby Renovasjon', 'Gjenvinningsstasjon', 'Søppel & Pant AS'],
    greet: ['Sort your trash! Glass, metal, paper, regret.', 'One man\'s trash is Artur\'s furniture.', 'No buses in the compactor. We\'ve asked nicely.'],
    style: { w: 4.4, door: '#3e6e4a', frame: '#e3b23c', plate: '#1b2a1e', text: '#bff2a0', light: '#ffe2a0', roller: 1 },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 29, ambient: 0.6, wallTop: '#445a48', wallLo: '#273429', wallHi: '#748c78' });
      b.room(0, 0, 36, 28, 'concrete', '#6a6a60', '#56564c'); b.room(26, 18, 36, 28, 'lino', '#a6ab98', '#8a8f7c');
      b.box(); b.entrance(12, 4.4, 'roller');
      b.vwall(26, 18, 27.5, [[22, 1.6]]); b.hwall(18, 26, 35.75, []);
      sc.st.comp = b.f('in_compactor', 8, 5, 10, 6, { solid: 'tall' });
      b.f('paint', 8, 9.2, 12, 1.2, { hazard: 1, layer: 0 });
      b.f('in_bins', 22, 2, 12, 1.4, { solid: 'low' }); b.f('in_bins', 33.5, 9, 1.4, 8, { solid: 'low', rot: 0 });
      b.f('in_trash', 18, 14, 6, 4, { solid: 'low', seed: 0.3 }); b.f('in_trash', 5, 18, 5, 3.5, { solid: 'low', seed: 0.7 });
      b.f('in_pant', 24, 25.8, 1.2, 1, { solid: 'tall' }); b.f('in_pant', 22.6, 25.8, 1.2, 1, { solid: 'tall' });
      b.f('forklift', 29, 12, 1.5, 2.6, { solid: 'low' }); b.f('tyres', 2, 25.6, 1.5, 1.5, { solid: 'low' }); b.f('crates', 20, 22, 2, 2, { solid: 'low' });
      b.f('stencil', 18, 9.5, 6, 0.6, { text: 'SORTER!', layer: 0 });
      b.f('desk', 31, 23, 3, 1.2, { solid: 'low', c: '#5a5a4a', pc: 1 }); b.f('chair', 31, 24.2, 0.7, 0.7, { rot: -Math.PI / 2 }); b.f('tv', 31, 27.3, 2, 0.4, { layer: 2, show: 'news' }); b.f('coffee', 34.8, 19, 0.8, 0.6, { solid: 'low' });
      sc.st.ind_props = [[34.4, 15.8], [33.2, 16], [2, 2], [3.2, 2, 'propane']];
      b.ped('worker', 14, 8, Math.PI, { look: 'in_bin', patrol: [[14, 8], [14, 20], [24, 20], [24, 8]] });
      b.ped('worker', 22, 4, -Math.PI / 2, { look: 'in_bin', chance: 0.85 }); b.ped('worker', 6, 15, 0, { look: 'in_bin', wander: true, chance: 0.7 });
      b.ped('sitter', 31, 24.25, -Math.PI / 2, { look: 'in_bin' });
      b.ped('customer', 23.3, 24, Math.PI / 2, { chance: 0.6 }); b.ped('drunk', 10, 22, 0, { chance: 0.4, wander: true, when: 'night' });
      b.act(23.3, 24.4, 1.6, () => ready(sc, 'pant', 25) ? 'F: Return your bottles (pant)' : 'Panteautomaten: "Vent litt..."', () => {
        if (!ready(sc, 'pant', 25)) return; use(sc, 'pant'); const n = 3 + Math.floor(Math.random() * 18), v = Math.max(1, Math.round(n * 0.3));
        K.money(v, 'pant'); K.sfx('cash'); K.popup(n + ' bottles from your bus seat. Pant: $' + v + '. Norway thanks you.');
      });
      b.act(8, 10.4, 1.6, () => sc.st.crushT > 0 ? null : 'F: Run the compactor', () => {
        sc.st.crushT = 3; K.sfx('clunk');
        const near = alive(sc).filter(p => Math.hypot(p.x - sc.st.comp.x, p.y - sc.st.comp.y) < 5);
        for (const p of near) if (K.mine(p)) K.panic(sc, p);
        if (ready(sc, 'crush', 90)) { use(sc, 'crush'); K.money(70, 'evidence disposal'); K.popup(K.pick(['You compact a suitcase that ticked. A grateful "businessman" leaves $70.', 'Crunched: one sofa, three bikes, one e-scooter (good riddance). +$70.'])); }
        else K.popup('SKRRRUNCH. Very satisfying. Zero dollars.');
      });
      b.act(18, 11.4, 1.5, () => ready(sc, 'dig', 50) ? 'F: Dig through the trash' : null, () => {
        use(sc, 'dig'); const r = Math.random();
        if (r < 0.35) { K.money(30, 'found in trash'); K.popup('A wallet! Contents: $30 and a bus card with 1 trip left.'); }
        else if (r < 0.7) K.popup(K.pick(['A half-eaten kebab. You leave it for the seagulls.', 'An "I ♥ Bussby" mug. Cracked, like the city.', 'Somebody threw away a whole brunost. Criminal.']));
        else { const p = K.P.ped; p.hp = Math.max(1, p.hp - 8); K.popup('A rat bites you. It looks like it has a gang.'); }
        const w = witness(sc, K, 10); if (w) K.say(w, 'Hey! That\'s kommunal trash!', '#ff6b5a');
      });
      flick(sc, b, [[8, 12], [20, 8], [20, 18, 1], [8, 22], [30, 10]], 9, '#ffecc0', 0.6, 'bay'); b.light(31, 22, 6, '#f4f8ff', 0.65, { fix: 'tube' });
      b.zone(0, 0, 14, 10, 'staff');
    },
    tick(sc, dt, t, K) {
      props(sc); const st = sc.st;
      if (st.crushT > 0) {
        st.crushT -= dt;
        const p = K.P.ped, c = st.comp; if (Math.abs(p.x - c.x) < 4.4 && Math.abs(p.y - c.y) < 2.6 && !st.hurt) { st.hurt = 1; p.hp = Math.max(1, p.hp - 40); K.popup('You were nearly recycled. Into what, nobody wants to know.'); }
        if (st.crushT <= 0) st.hurt = 0;
      }
    },
  });

  // =============== 6. BUS DEPOT WORKSHOP ===============
  D('busdepot', {
    size: [40, 32], weight: 2, minSide: 15,
    names: ['Bussby Bussdepot', 'Kollektivverkstedet', 'Take the Bus! Service Hall', 'Rute 7 Verksted'],
    greet: ['TAKE THE BUS! (We fix them, you take them.)', 'Mind the pit. Kjell is still down there.', 'Every bus in Bussby passes through here. Like a spa.'],
    style: { w: 4.6, door: '#c0392b', frame: '#f2c230', plate: '#1b1b1f', text: '#f2c230', light: '#ffd27a', roller: 1, hazard: 1, icon: 'bus' },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 32, ambient: 0.55, wallTop: '#4a3a34', wallLo: '#2a201c', wallHi: '#8a6a5a' });
      b.room(0, 0, 40, 32, 'concrete', '#6a6862', '#55534d'); b.room(31, 0, 40, 10, 'lino', '#a7afb8', '#87909a');
      b.box(); b.entrance(14, 4.6, 'roller');
      b.vwall(31, 0.5, 10, [[7, 1.6]]); b.hwall(10, 31, 39.75, []);
      sc.st.lift = 0; sc.st.liftT = 0;
      b.f('in_buslift', 8, 12, 4, 13, { layer: 0 }); b.f('in_bus', 8, 12, 2.8, 12, { solid: 'tall', c: '#c0392b', text: 'TAKE THE BUS' });
      b.f('in_pit', 18, 12, 2, 12, { layer: 0 }); b.f('in_bus', 18, 12, 2.8, 12, { solid: 'tall', c: '#2f6fb5', text: 'RUTE 7' });
      b.f('in_bus', 27, 13, 2.8, 12, { solid: 'tall', c: '#3e8e5a', text: 'BUSSBY' });
      b.f('paint', 13, 22, 26, 0.14, { c: '#e3b23c', layer: 0 }); b.f('stencil', 14, 25, 8, 0.8, { text: 'KUN BUSS', layer: 0 });
      for (const q of [[3, 4], [13.2, 9], [13.2, 15], [22.8, 9]]) b.f('oil', q[0], q[1], 1.4, 1, { layer: 0, seed: q[0] / 10 });
      b.f('workbench', 1.15, 26, 1.2, 6, { solid: 'low' }); b.f('tools', 0.7, 26, 0.25, 5, { layer: 2 }); b.f('toolbox', 12.5, 3, 1.2, 0.7, { solid: 'low' });
      b.f('tyres', 36, 14, 1.5, 1.5, { solid: 'low' }); b.f('tyres', 37.8, 14, 1.5, 1.5, { solid: 'low' }); b.f('tyres', 36, 16, 1.5, 1.5, { solid: 'low' });
      b.f('shelf', 20, 1, 8, 0.9, { solid: 'tall', parts: 1 }); b.f('hoist', 18, 3, 1.4, 1.4);
      b.f('poster', 6, 31.6, 2.4, 0.3, { kind: 'bus', layer: 2 }); b.f('poster', 26, 31.6, 2.4, 0.3, { kind: 'bus', layer: 2 });
      b.f('desk', 35.5, 3, 3, 1.2, { solid: 'low', c: '#6b5038', pc: 1 }); b.f('chair', 35.5, 1.8, 0.7, 0.7, { rot: Math.PI / 2, boss: 1 }); b.f('portrait', 35.5, 0.8, 1.4, 0.35, { layer: 2, text: 'BUS OF THE MONTH' });
      b.f('vending', 39, 8, 1.1, 1, { solid: 'tall', c: '#2f6fb5', cols: ['#f2c230', '#c0392b', '#2f6fb5', '#3e8e5a', '#f2c230', '#e86aa0', '#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a', '#e86aa0', '#c0392b'] });
      sc.st.ind_props = [[38.6, 30.6], [37.4, 30.6], [38.6, 29.4, 'propane']];
      b.ped('worker', 11, 10, Math.PI, { look: 'in_busmech' }); b.ped('worker', 15, 15, 0, { look: 'in_busmech', chance: 0.8 }); b.ped('worker', 30.5, 18, Math.PI, { look: 'mechanic', wander: true });
      b.ped('worker', 20, 26, 0, { look: 'in_foreman', patrol: [[4, 24], [34, 24], [34, 28], [4, 28]] });
      b.ped('sitter', 35.5, 1.85, Math.PI / 2, { look: 'suit', chance: 0.6, when: 'day' });
      b.ped('drinker', 37, 24, Math.PI, { look: 'in_busmech', chance: 0.4, when: 'night' });
      b.act(11.2, 4.5, 1.6, () => sc.st.lift ? 'F: Lower the bus lift' : 'F: Raise the bus lift', () => { sc.st.liftT = sc.st.lift ? 0 : 1; K.sfx('clunk'); shout(sc, K, 'worker', ['Easy! That\'s 12 tonnes of public transport!', 'Higher! I can\'t reach the... no that\'s fine.']); });
      b.act(18, 23, 1.6, () => ready(sc, 'fix', 90) ? 'F: Fix a bus for Bussby Kollektiv (+$120)' : 'All buses fixed. Go ride one!', () => {
        if (!ready(sc, 'fix', 90)) return; use(sc, 'fix'); K.money(120, 'bus repair'); K.sfx('cash');
        K.popup(K.pick(['You replace the "STOP" button. It now plays the Take the Bus! jingle. +$120.', 'You fix the heater on Rute 7. Pensioners cheer. +$120.', 'You remove 14 kilos of chewing gum from under the seats. +$120.']));
      });
      b.act(27, 20.6, 1.6, () => ready(sc, 'honk', 8) ? 'F: Honk the horn' : null, () => { use(sc, 'honk'); K.sfx('beep'); for (const p of alive(sc)) if (Math.random() < 0.5) K.say(p, K.pick(['TAKE THE BUS!', 'Ha! Classic.', 'Kjell, wake up!'])); });
      b.act(2.6, 26, 1.5, () => ready(sc, 'diesel', 120) ? 'F: Nick a jerrycan of diesel' : null, () => {
        use(sc, 'diesel'); K.money(45, 'black-market diesel'); K.popup('Red diesel, sold to a farmer in a hurry. $45. Shh.');
        const w = witness(sc, K); if (w) { K.say(w, 'HEY! That\'s municipal diesel!', '#ff6b5a'); K.crime('trespass', K.P.ped.x, K.P.ped.y, { place: 'busdepot' }); }
      });
      flick(sc, b, [[8, 6], [8, 18], [18, 6], [18, 18], [27, 12, 1], [10, 27], [28, 27]], 10, '#fff1d0', 0.6, 'bay'); b.light(35.5, 4.5, 6, '#ffd9a0', 0.65, { fix: 'lamp' });
      b.zone(31, 0, 40, 10, 'staff');
    },
    tick(sc, dt) { const st = sc.st; st.lift += Math.sign(st.liftT - st.lift) * Math.min(Math.abs(st.liftT - st.lift), dt * 0.25); },
  });

  // =============== 7. LAUNDROMAT ===============
  D('laundromat', {
    size: [20, 14], weight: 2, minSide: 8,
    names: ['Vaskeriet Såpeboblen', 'Myntvask Bussby', 'Rene Klær & Skitne Penger'],
    greet: ['Machine 4 eats socks. All of them.', 'Kr 40 per wash. Sorry, $4.', 'We launder clothes. ONLY clothes. *wink*'],
    style: { w: 2.2, door: '#2fb6c4', frame: '#e9e4d8', plate: '#1b4a5a', text: '#e8fbff', light: '#d8f4ff' },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 20, ambient: 0.95, wallTop: '#4aa0b0', wallLo: '#2a6a78', wallHi: '#9ad8e4' });
      b.room(0, 0, 20, 14, 'check', '#e9f2f4', '#9ac8d2');
      b.box(); b.entrance(15, 2.2);
      sc.st.washers = [];
      for (let i = 0; i < 7; i++) sc.st.washers.push(b.f('in_washer', 2 + i * 1.5, 1.1, 1.3, 1.3, { solid: 'tall', off: i === 3, seed: i / 7 }));
      for (let i = 0; i < 4; i++) b.f('in_washer', 18.9, 2.5 + i * 1.5, 1.3, 1.3, { solid: 'tall', dryer: 1, rot: -Math.PI / 2, seed: i / 4 });
      b.f('table', 7, 7, 6, 1.2, { solid: 'low', c: '#e9e4d8' }); b.f('bench', 7, 11.8, 6, 0.6, { solid: 'low' });
      b.f('vending', 1, 9, 1, 1.1, { solid: 'tall', c: '#2fb6c4', cols: ['#f2f2f2', '#2f6fb5', '#f2c230', '#e86aa0', '#f2f2f2', '#2f6fb5', '#f2c230', '#e86aa0', '#f2f2f2', '#2f6fb5', '#f2c230', '#e86aa0'] });
      b.f('mags', 11.6, 12.9, 2.8, 0.5, { solid: 'low', cols: ['#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a', '#e86aa0', '#8a6a3a', '#5d636b', '#111'] });
      b.f('plant', 18.8, 12.8, 0.8, 0.8, { solid: 'low' }); b.f('sign', 7, 0.3, 5, 0.4, { text: 'IKKE VASK PENGER HER', bg: '#c0392b', size: 0.22, layer: 2 });
      b.ped('sitter', 5, 11.8, -Math.PI / 2, { chance: 0.8 }); b.ped('sitter', 9, 11.8, -Math.PI / 2, { chance: 0.5 }); b.ped('customer', 7, 5.5, -Math.PI / 2, { chance: 0.7 });
      b.ped('owner', 16, 9, Math.PI, { look: 'in_dairy', wander: true });
      b.act(6.5, 2.8, 1.6, () => K.P.money >= 100 ? 'F: "Launder" $100 (the machine gives back...?)' : 'Need $100 to "wash" here', () => {
        if (K.P.money < 100) { K.sfx('deny'); return; } if (!ready(sc, 'wash', 60)) { K.popup('The machine is still spinning your last batch. Patience, gangster.'); return; }
        use(sc, 'wash'); const back = K.pick([150, 150, 120, 60, 0]); K.money(back - 100, 'money laundering'); K.sfx(back ? 'cash' : 'deny');
        K.popup(back === 0 ? 'Machine 4 ate your money. And your sock. Classic Machine 4.' : back < 100 ? 'Your bills came out shrunk. $' + back + ' back, smells of Omo.' : 'Squeaky clean! $' + back + ' back. Artur wants to know your secret.');
        if (back && witness(sc, K, 8)) K.crime('trespass', K.P.ped.x, K.P.ped.y, { place: 'laundromat' });
      });
      b.act(17.2, 5, 1.4, () => 'F: Climb into a dryer', () => {
        sc.st.spinT = 4; const p = K.P.ped; p.hp = Math.max(1, p.hp - 5); K.sfx('clunk');
        K.popup(K.pick(['Round and round. You come out dizzy, warm and very fluffy.', 'Forty minutes on "delicate". You feel like a towel.']));
        shout(sc, K, 'owner', ['Get OUT of the dryer!', 'Not again...']);
      });
      b.act(7, 8.4, 1.4, () => ready(sc, 'sock', 40) ? 'F: Search the lost & found' : null, () => { use(sc, 'sock'); if (Math.random() < 0.4) { K.money(12, 'pocket change'); K.popup('$12 in a jeans pocket. Finders keepers.'); } else K.popup(K.pick(['287 single socks. None match.', 'A bus ticket from 1997. Still valid, probably.'])); });
      for (const q of [[5, 4], [14, 4], [5, 10], [14, 10]]) b.light(q[0], q[1], 7, '#eefaff', 0.65, { fix: 'tube' });
      b.zone(0, 0, 20, 2.2, 'staff');
    },
    tick(sc, dt) { if (sc.st.spinT > 0) sc.st.spinT -= dt; },
  });

  // =============== 8. PRINT SHOP / NEWSPAPER ===============
  const HEAD = ['ARTUR: CITIZEN OF THE YEAR', 'BUS MANIAC STRIKES AGAIN', 'BRUNOST PRICES EXPLODE', 'KOMMUNE BUYS 900 BUSES', 'SEAGULL ELECTED MAYOR', 'TAKE THE BUS, SAYS EVERYONE'];
  D('printshop', {
    size: [28, 22], weight: 1.5, minSide: 11,
    names: ['Bussby Tidende Trykkeri', 'Avistrykket', 'Bussby Blad & Plakat'],
    greet: ['Hot off the press! Careful, really hot.', 'We print the truth. Mostly. On Tuesdays.', 'Ink on your hands is free.'],
    style: { w: 2.4, door: '#2b2d33', frame: '#e9e4d8', plate: '#111', text: '#f4f1e8', light: '#ffe2a0' },
    furn, looks,
    layout(sc, b, R, K) {
      base(sc, { camSpan: 25, ambient: 0.7, wallTop: '#4a4640', wallLo: '#2b2824', wallHi: '#857e72' });
      b.room(0, 0, 28, 14, 'concrete', '#7a766e', '#625e57'); b.room(0, 14, 28, 22, 'wood', '#8a6a48', '#6c5035');
      b.box(); b.entrance(20, 2.4);
      b.hwall(14, 0, 28, [[10, 2.2], [22, 2.2]]);
      sc.st.headline = K.pick(HEAD); sc.st.rushT = 0;
      b.f('in_printpress', 12, 5, 16, 2.6, { solid: 'tall' });
      for (const q of [[2, 2], [2, 4.4], [2, 6.8], [4.4, 2]]) b.f('in_paperroll', q[0], q[1], 2, 2, { solid: 'low' });
      b.f('in_conveyor', 12, 9.6, 14, 0.9, { solid: 'low', cargo: '#f4f1e8' });
      for (const q of [[24, 3], [24, 6], [26.4, 3], [26.4, 6]]) b.f('in_papers', q[0], q[1], 1.6, 1.6, { solid: 'low' });
      b.f('pallet', 25.2, 10.8, 3, 2, { solid: 'low' }); b.f('in_papers', 25.2, 10.8, 2.6, 1.6, { solid: 'low' });
      b.f('desk', 4, 17.5, 3, 1.3, { solid: 'low', c: '#5a3b22', pc: 1 }); b.f('chair', 4, 18.7, 0.7, 0.7, { rot: -Math.PI / 2 });
      b.f('desk', 10, 17.5, 3, 1.3, { solid: 'low', c: '#5a3b22', pc: 1 }); b.f('chair', 10, 18.7, 0.7, 0.7, { rot: -Math.PI / 2 });
      b.f('printer', 15, 20.8, 1.4, 0.9, { solid: 'low' }); b.f('filing', 1, 21, 0.9, 0.9, { solid: 'tall' }); b.f('coffee', 26.8, 15.2, 0.8, 0.6, { solid: 'low' });
      b.f('whiteboard', 27.6, 18, 0.3, 4, { layer: 2 }); b.f('in_papers', 15, 17.5, 2.2, 1.2, { solid: 'low' });
      b.ped('worker', 8, 7.6, -Math.PI / 2, { look: 'in_printer' }); b.ped('worker', 18, 2.6, Math.PI / 2, { look: 'in_printer', chance: 0.8 }); b.ped('worker', 22, 8, 0, { look: 'in_printer', wander: true });
      b.ped('sitter', 4, 18.75, -Math.PI / 2, { look: 'suit' }); b.ped('sitter', 10, 18.75, -Math.PI / 2, { chance: 0.7 });
      b.act(15, 19, 1.5, () => 'F: Swap tomorrow\'s headline', () => {
        let h; do h = K.pick(HEAD); while (h === sc.st.headline); sc.st.headline = h; sc.st.rushT = 6; K.sfx('clunk');
        K.popup('Front page changed to: "' + h + '". 40 000 copies. Bussby believes it.');
        shout(sc, K, 'sitter', ['Who approved this?!', 'Brilliant. Run it!', 'Redaktøren will kill us.']);
        if (h.startsWith('ARTUR') && ready(sc, 'artur', 120)) { use(sc, 'artur'); K.money(100, 'Artur\'s PR budget'); K.popup('Artur loved it. He sends $100 and a signed photo.'); }
      });
      b.act(24, 8, 1.6, () => 'F: Grab a fresh newspaper', () => K.popup('BUSSBY TIDENDE: "' + sc.st.headline + '". Also: weather — rain. Always rain.'));
      b.act(12, 7.8, 1.4, () => ready(sc, 'jam', 60) ? 'F: Feed your jacket into the press' : null, () => {
        use(sc, 'jam'); sc.st.rushT = 3; K.sfx('scratch'); K.popup('The press spits out 900 copies of your jacket. Limited edition.');
        shout(sc, K, 'worker', ['STOPP! The rollers!', 'Not the jacket thing again!'], '#ff6b5a');
      });
      flick(sc, b, [[6, 5], [18, 5], [24, 8], [6, 18], [18, 18, 1]], 8.5, '#fff1d0', 0.62);
      b.zone(0, 0, 28, 14, 'staff');
    },
    tick(sc, dt) { if (sc.st.rushT > 0) sc.st.rushT -= dt; },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
