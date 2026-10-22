// Civic life & services: hotel, gym, cinema, school, library, church, post office, kommune office and
// dentist. Each registers with X.interiors.define (see interiors.js "themes from other modules"): its own
// floor, walls, furniture (cv_* drawers), people, lights and a few things to do with F.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta; if (!X || !X.interiors || !X.interiors.define) return;
  const I = X.interiors, K = I.kit;
  const PI = Math.PI, U = -PI / 2, D = PI / 2;

  // ---------- shared helpers ----------
  const cur = () => (K.S && K.S.cur) || null;
  function staff(role, look) {
    const sc = cur(); if (!sc) return null;
    return sc.peds.find(q => K.mine(q) && q.ai.role === role && !q.dead && (!look || q.ai.sp.look === look) && q.ai.st !== 'flee' && q.ai.st !== 'fight' && q.ai.st !== 'cower') || null;
  }
  function talk(role, lines, col, look) { const p = staff(role, look); if (p) K.say(p, K.pick(lines), col); return p; }
  function pay(n, why) {
    if (K.P.money < n) { K.popup('Not enough money. Take the bus to an ATM.'); K.sfx('deny'); return false; }
    K.money(-n, why, K.P.ped.x, K.P.ped.y); K.sfx('cash'); return true;
  }
  function hp(n) { const p = K.P.ped; p.hp = Math.min(p.maxHp, p.hp + n); }
  function sleepNow() {
    const S = K.S, P = K.P;
    if ((P.wanted || 0) > 0) { K.popup('You can not sleep with the cops after you'); K.sfx('deny'); return false; }
    if (S.fade && S.fade.mode === 'sleep') return false;
    S.fade = { t: 0, dur: 2.6, mode: 'sleep', done: false, x: P.ped.x, y: P.ped.y };
    K.sfx('sleep'); return true;
  }
  const { rect, rr, disc, oval, ln, wtext, shade, sh } = K;
  const st = () => (cur() ? cur().st : {});

  // ================= HOTEL =================
  I.define('hotel', {
    size: [28, 22], weight: 2, minSide: 14,
    names: ['Hotel Fjordutsikt', 'Bussby Grand Hotel', 'Hotell Holdeplass', 'Motel Siste Avgang'],
    greet: ['VELKOMMEN! CHECK-OUT IS AT ELEVEN. SHARP.', 'HAVE YOU BOOKED? NOBODY BOOKS.', 'BREAKFAST BUFFET CLOSED IN 1987.'],
    style: { w: 2.6, door: '#3a2a20', frame: '#d4af37', plate: '#5a1a22', text: '#f2d27a', light: '#ffe2a0', canopy: '#7a1e26', icon: 'house' },
    looks: {
      cv_bellboy: () => ({ outfit: 'suit', shirt: '#9a1f2a', pants: '#2b1a1a', tie: '#d4af37', hat: '#9a1f2a', hatType: 'beanie' }),
      cv_receptionist: () => ({ outfit: 'suit', shirt: '#1f2a44', pants: '#1f2a44', tie: '#d4af37', hat: null, hairStyle: 'bun' }),
      cv_guest: () => ({ jacket: '#e8e2d0', shirt: '#f4f4f4', pants: '#e8e2d0', hat: null }),
    },
    furn: {
      cv_luggage(c, f, hw, hh) { sh(c, hw, hh, 0.25); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c9a44a'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 2 * hh - 0.16, '#7a1e26'); rr(c, -0.4, -0.3, 0.45, 0.35, 0.05, '#3a5a8a'); rr(c, 0.05, -0.2, 0.35, 0.5, 0.05, '#5a3a24'); rr(c, -0.35, 0.12, 0.3, 0.22, 0.05, '#2f7d6d'); },
      cv_keyboard(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#4a3020'); for (let i = 0; i < 8; i++) { const x = -hw + 0.15 + (i % 4) * (2 * hw - 0.3) / 3, y = -hh + 0.15 + Math.floor(i / 4) * (hh); disc(c, x, y, 0.05, '#d4af37'); rect(c, x - 0.02, y, 0.04, 0.14, '#b8962a'); } },
      cv_bell(c) { disc(c, 0, 0.03, 0.14, '#7a6a30'); disc(c, 0, 0, 0.11, '#e3c25a'); disc(c, -0.03, -0.03, 0.04, '#fff4c0'); },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 26, ambient: 0.7, wallTop: '#5a3a2e', wallLo: '#3a241c', wallHi: '#9a6a52' });
      b.room(0, 12, 28, 22, 'marble', '#e2d8c4', '#bba98c');
      b.room(0, 9, 28, 12, 'carpet', '#7a1e26', '#5a161c');
      for (const [x0, x1, c] of [[0, 9, '#3f5f7a'], [9, 19, '#5a4a7a'], [19, 28, '#3e6a4a']]) b.room(x0, 0, x1, 9, 'carpet', c, shade(c, -0.2));
      b.box(); b.entrance(14, 2.6);
      b.hwall(12, 0.25, 27.75, [[14, 6, false]]);
      b.hwall(9, 0.25, 27.75, [[4.5, 1.4], [14, 1.4], [23.5, 1.4]]);
      b.vwall(9, 0.5, 9); b.vwall(19, 0.5, 9);
      // three rooms
      const rooms = [[4.5, 101], [14, 102], [23.5, 103]];
      for (const [x, n] of rooms) {
        b.f('bed', x - 1.6, 2.3, 2.2, 3.0, { solid: 'low', c: n === 102 ? '#c9a44a' : '#b8483e' });
        b.f('nightstand', x - 3.2, 1.0, 0.6, 0.6, { solid: 'low' }); b.light(x - 3.2, 1.0, 3.5, '#ffcf80', 0.55);
        b.f('tv', x + 3.0, 4.8, 1.8, 0.5, { solid: 'low', fragile: true, show: n === 103 ? 'football' : 'news', rot: -D });
        b.f('wardrobe', x + 2.8, 1.3, 1.0, 1.6, { solid: 'tall' });
        b.f('fridge1', x + 2.9, 7.6, 0.7, 0.7, { solid: 'tall' });
        b.f('door', x + 0.9, 8.75, 0.15, 0.6, { text: String(n), layer: 2 });
        b.act(x - 1.6, 4.4, 1.4, () => st().cv_room === n ? 'F: Sleep in room ' + n + ' (save)' : 'F: Room ' + n + ' (not yours)', () => {
          if (st().cv_room === n) sleepNow();
          else { K.popup(K.pick(['Room ' + n + ' is booked. By a man called Artur.', 'A "Do Not Disturb" sign. Since 2009.', 'Locked. You hear snoring.'])); K.sfx('deny'); }
        });
        b.act(x + 2.2, 7.6, 1.0, () => 'F: Minibar peanuts ($15, +5 hp)', () => K.buyFood(15, 5, K.pick(['$15 for 11 peanuts. Bussby prices.', 'The minibar Toblerone is gone. It was always gone.'])));
        b.ped('sitter', x - 1.6, 2.6, D, { chance: 0.35, pose: 'lie', look: 'cv_guest' });
        b.light(x, 5, 6, '#ffd9a0', 0.55, { fix: 'lamp' });
      }
      // lobby
      b.f('counter', 5, 15.2, 7, 1.2, { solid: 'low', c: '#4a2a1a', top: '#e8dcc0' });
      b.f('cv_keyboard', 2.6, 12.9, 2.6, 0.6, { layer: 2 });
      b.f('register', 3.6, 15.0, 0.6, 0.45); b.f('cv_bell', 6.2, 15.1, 0.3, 0.3, { layer: 2 });
      b.ped('clerk', 5, 13.8, D, { look: 'cv_receptionist' });
      b.zone(0.5, 12.3, 9, 14.6);
      b.act(5, 16.6, 1.5, () => st().cv_room ? 'F: Ring the bell' : 'F: Rent a room ($40, sleep + save)', () => {
        const s = st();
        if (s.cv_room) { K.sfx('beep'); talk('clerk', ['YES, YES, I HEARD IT.', 'ONE RING IS ENOUGH.', 'YOUR ROOM IS UPSTAIRS. I MEAN, BEHIND YOU.']); return; }
        if (!pay(40, 'hotel')) { talk('clerk', ['NO MONEY, NO PILLOW.', 'TRY THE BUS SHELTER. IT IS FREE.']); return; }
        s.cv_room = K.pick([101, 102, 103]);
        talk('clerk', ['ROOM ' + s.cv_room + '. THE KEY IS A CARD. THE CARD DOES NOT WORK.', 'ROOM ' + s.cv_room + '. NO PARTIES. NO BUSES.'], '#7dff9a');
        K.popup('You rented room ' + s.cv_room + '. Sleep in its bed to save.');
      });
      b.f('cv_luggage', 10.6, 14.2, 1.4, 1.0, { solid: 'low' });
      b.ped('worker', 11, 16, 0, { look: 'cv_bellboy', wander: true });
      b.act(10.6, 15.4, 1.2, () => 'F: Tip the bellboy ($5)', () => { if (pay(5, 'tip')) talk('worker', ['TAKK! I WILL CARRY NOTHING FOR YOU.', 'FIVE DOLLARS! I CAN NOW AFFORD THE BUS.'], '#7dff9a', 'cv_bellboy'); });
      b.f('sofa', 22, 20.9, 4.4, 1.0, { solid: 'low', c: '#7a1e26', back: 's' }); b.f('table', 22, 18.9, 2, 0.9, { solid: 'low', c: '#4a2a1a', mugs: 1 });
      b.f('armchair', 18.4, 18.9, 1.2, 1.2, { solid: 'low', c: '#7a1e26' }); b.f('armchair', 25.6, 18.9, 1.2, 1.2, { solid: 'low', c: '#7a1e26' });
      b.ped('sitter', 21, 20.6, U, { chance: 0.6, look: 'cv_guest' });
      b.f('rug', 14, 17, 4, 6, { c: '#7a1e26', c2: '#d4af37', layer: 0 });
      b.f('plant', 1.2, 21, 1, 1, { solid: 'low' }); b.f('plant', 26.8, 13.2, 1, 1, { solid: 'low' }); b.f('plant', 9.5, 21, 1, 1, { solid: 'low' });
      b.f('poster', 22, 12.4, 3, 0.3, { kind: 'journey', layer: 2 });
      for (const q of [[13, 17, 0], [17, 15, PI], [8, 18, U], [24, 15, D]]) b.browse(q[0], q[1], q[2]);
      b.light(5, 16, 7, '#ffe2b0', 0.75, { fix: 'lamp' }); b.light(14, 17, 9, '#fff1d6', 0.8, { fix: 'panel' }); b.light(22, 18, 7, '#ffd9a0', 0.7, { fix: 'lamp' });
      for (const x of [5, 14, 23]) b.light(x, 10.5, 4, '#ffd9a0', 0.6, { fix: 'bulb' });
      b.win(2, 21.5, 10, 22); b.win(18, 21.5, 26, 22); b.win(0, 1, 0.5, 8); b.win(27.5, 1, 28, 8);
    },
  });

  // ================= GYM =================
  I.define('gym', {
    size: [26, 20], weight: 2, minSide: 13,
    names: ['Bussby Muskel', 'Iron Fjord Gym', 'SATS-ish', 'Pump & Pølse'],
    greet: ['NEW HERE? THE FIRST MONTH IS FREE. THE OTHER 47 ARE NOT.', 'DO YOU EVEN TAKE THE BUS, BRO?', 'WIPE THE BENCH. WE ARE NORWEGIAN.'],
    style: { w: 2.2, door: '#1b1d22', frame: '#e3b23c', plate: '#111216', text: '#ffd23a', light: '#ffe2a0', neon: '#ffd23a' },
    looks: {
      cv_lifter: () => ({ shirt: K.pick(['#c0392b', '#2b2d33', '#e3b23c', '#2f6fb5']), pants: '#1b1f27', hat: null, hairStyle: K.pick(['bald', 'buzz']), scale: K.rand(1.2, 1.3) }),
      cv_trainer: () => ({ shirt: '#ffd23a', pants: '#1b1f27', hat: null, hairStyle: 'pony', scale: 1.08 }),
      cv_jogger: () => ({ shirt: K.pick(['#ff4a8a', '#3fd0ff', '#b6ff3a']), pants: '#2b2d33', hat: null }),
    },
    furn: {
      cv_treadmill(c, f, hw, hh, t) {
        sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.1, '#3a3f46'); rect(c, -hw + 0.12, -hh + 0.5, 2 * hw - 0.24, 2 * hh - 0.62, '#16181c');
        c.save(); c.beginPath(); c.rect(-hw + 0.12, -hh + 0.5, 2 * hw - 0.24, 2 * hh - 0.62); c.clip();
        for (let y = -hh + 0.5 + ((t * 2.2) % 0.3); y < hh; y += 0.3) rect(c, -hw + 0.12, y, 2 * hw - 0.24, 0.04, '#2b2d33');
        c.restore(); rect(c, -hw, -hh, 2 * hw, 0.4, '#5d636b'); rect(c, -0.25, -hh + 0.08, 0.5, 0.22, '#0b1a10'); wtext(c, String(Math.floor(t * 3) % 99), 0, -hh + 0.19, 0.14, '#3fff7a', 800);
      },
      cv_bench(c, f, hw, hh) {
        sh(c, hw, hh, 0.25); rr(c, -0.25, -hh, 0.5, 2 * hh, 0.08, '#1b1d22'); rr(c, -0.2, -hh + 0.05, 0.4, 2 * hh - 0.1, 0.06, '#c0392b');
        ln(c, -hw, -hh + 0.45, hw, -hh + 0.45, '#c9ccd1', 0.07);
        for (const s of [-1, 1]) { rect(c, s * hw - (s > 0 ? 0.22 : 0), -hh + 0.2, 0.22, 0.5, '#2b2d33'); rect(c, s * (hw - 0.3) - (s > 0 ? 0.12 : 0), -hh + 0.25, 0.12, 0.4, '#3a3f46'); }
      },
      cv_dumbbells(c, f, hw, hh) {
        sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2b2d33');
        const n = Math.max(3, Math.round(hw * 2 / 0.45));
        for (let i = 0; i < n; i++) { const x = -hw + 0.22 + i * (2 * hw - 0.44) / (n - 1); ln(c, x, -hh + 0.12, x, hh - 0.12, '#9aa0a8', 0.05); disc(c, x, -hh + 0.15, 0.1, '#111'); disc(c, x, hh - 0.15, 0.1, '#111'); }
      },
      cv_mirror(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9fc7d8'); for (let x = -hw + 0.5; x < hw; x += 1.6) ln(c, x, -hh, x + 0.4, hh, 'rgba(255,255,255,0.6)', 0.05); },
      cv_mat(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#2f6fb5'); rect(c, -hw, -0.02, 2 * hw, 0.04, 'rgba(0,0,0,0.25)'); },
      cv_shake(c, f, hw, hh, t) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e8edf2'); for (let i = 0; i < 3; i++) { const x = -hw + 0.3 + i * (2 * hw - 0.6) / 2; disc(c, x, 0, 0.16, ['#e86aa0', '#7a4a20', '#b6ff3a'][i]); disc(c, x + Math.cos(t * 4 + i) * 0.07, Math.sin(t * 4 + i) * 0.07, 0.04, 'rgba(255,255,255,0.7)'); } },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 24, ambient: 0.85, wallTop: '#2b2d33', wallLo: '#16181c', wallHi: '#555a63' });
      b.room(0, 0, 26, 20, 'concrete', '#33363c', '#2a2c31');
      b.room(0, 14, 9, 20, 'tile', '#d8dce2', '#b8bec6');
      b.box(); b.entrance(17, 2.4);
      b.vwall(9, 14, 19.5, [[16.5, 1.8]]); b.hwall(14, 0.25, 9, []);
      // reception / shake bar in the bottom-left corner room
      b.f('counter', 4.5, 16.4, 5, 1.1, { solid: 'low', c: '#e3b23c', top: '#1b1d22' }); b.f('cv_shake', 2.5, 14.9, 1.6, 0.6, { solid: 'low' });
      b.ped('clerk', 4.5, 15.3, D, { look: 'cv_trainer' }); b.zone(0.5, 14.3, 8.7, 15.8);
      b.act(4.5, 17.6, 1.5, () => 'F: Protein shake ($8, +15 hp)', () => { K.buyFood(8, 15, K.pick(['Tastes like vanilla and regret.', 'Brunost flavour. Gains incoming.'])); talk('clerk', ['GAINS!', 'DRINK IT IN THE BUS. FLEX ON STRANGERS.']); });
      b.f('plant', 1.2, 19, 0.9, 0.9, { solid: 'low' });
      // cardio row
      for (const x of [2.5, 5, 7.5, 10]) { b.f('cv_treadmill', x, 2.2, 1.6, 2.8, { solid: 'low' }); b.browse(x, 3.9, U); }
      b.ped('customer', 2.5, 2.5, U, { look: 'cv_jogger', chance: 0.7 }); b.ped('customer', 7.5, 2.5, U, { look: 'cv_jogger', chance: 0.5 });
      b.act(5, 4.3, 1.4, () => 'F: Run on the treadmill', () => {
        const p = K.P.ped; hp(5); K.sfx('beep');
        K.popup(K.pick(['You ran 5 km and went nowhere. Like bus line 7.', 'You burned 40 calories. A pølse is 300.', 'Your knees file a complaint with the kommune.']));
        p.pose = null;
      });
      // free weights
      b.f('cv_mirror', 25.55, 7, 0.3, 11, { layer: 2 });
      b.f('cv_dumbbells', 24.6, 7, 1.0, 6, { solid: 'low' });
      for (const y of [4, 10]) b.f('cv_bench', 19.5, y, 2.2, 2.2, { solid: 'low' });
      b.act(19.5, 6.2, 1.3, () => 'F: Pump iron ($10, +max health)', () => {
        const p = K.P.ped, s = st();
        if (p.maxHp >= 150) { K.popup('You are as swole as Bussby allows.'); return; }
        if (!pay(10, 'gym')) return;
        p.maxHp = Math.min(150, p.maxHp + 2); p.hp = Math.min(p.maxHp, p.hp + 2); s.cv_reps = (s.cv_reps || 0) + 1;
        K.popup('Max health ' + p.maxHp + '. ' + K.pick(['Rep number ' + s.cv_reps + '. Nobody saw it.', 'Your arms now block bus doors.', 'You grunted. The whole gym heard.']));
        talk('bouncer', ['NICE FORM, BRO.', 'IS THAT THE WARM-UP?', 'MY GRANDMA LIFTS MORE. SHE IS 93.'], '#ffd23a');
      });
      b.ped('bouncer', 19.5, 10, PI, { look: 'cv_lifter', pose: 'lie' });
      b.ped('bouncer', 23, 13, PI, { look: 'cv_lifter', wander: true }); b.ped('bouncer', 16, 9, 0, { look: 'cv_lifter', wander: true, chance: 0.7 });
      b.act(16.5, 12.6, 1.4, () => 'F: Ask a lifter to spot you', () => {
        const p = staff('bouncer'); if (!p) return;
        if (Math.random() < 0.3) { K.say(p, 'SPOT YOU? I WILL SPOT YOU ON THE FLOOR!', '#ff6a5a'); K.provoke(cur(), p); }
        else K.say(p, K.pick(['LIGHT WEIGHT, BABY!', 'NO PAIN, NO BUS PASS.', 'I DO NOT SKIP LEG DAY. I SKIP BUS DAY.']), '#ffd23a');
      });
      // mats
      b.f('cv_mat', 4.5, 9, 7, 4, { c: '#2f6fb5', layer: 0 }); b.f('cv_mat', 13, 9, 4, 4, { c: '#c0392b', layer: 0 });
      b.ped('customer', 4, 9, 0, { look: 'cv_jogger', pose: 'lie', chance: 0.6 });
      b.f('poster', 13, 0.8, 3, 0.3, { kind: 'bus', layer: 2 });
      for (const q of [[13, 9, 0], [22, 5, PI], [15, 15, -1], [6, 8, 0], [21, 16, U]]) b.browse(q[0], q[1], q[2]);
      for (const q of [[6, 4], [6, 10], [14, 4], [14, 11], [21, 4], [21, 11], [17, 17]]) b.light(q[0], q[1], 7.5, '#f0f6ff', 0.75, { fix: 'tube' });
      b.light(4.5, 17, 5, '#fff4dc', 0.7, { fix: 'panel' });
      b.win(11, 19.5, 15, 20); b.win(19, 19.5, 24, 20); b.win(0, 1, 0.5, 12);
    },
  });

  // ================= CINEMA =================
  const FILMS = [
    'TONIGHT: "THE LAST BUS". Two hours of a man waiting at a stop. Based on a true story.',
    'TONIGHT: "FAST & FJORDIOUS 11". The ferry drifts. Sideways. For 140 minutes.',
    'TONIGHT: "ARTUR". A documentary. The director is no longer with us. He moved to Sweden.',
    'TONIGHT: "BRUNOST II: THE MELTING". Rated 15 for cheese violence.',
    'TONIGHT: "SLEEPLESS IN BUSSBY". She is on line 4. He is on line 7. Love finds a transfer.',
  ];
  I.define('cinema', {
    size: [30, 26], weight: 2, minSide: 15,
    names: ['Bussby Kino', 'Kino Nordlys', 'Saga Kino', 'Filmhuset'],
    greet: ['PHONES OFF. BUSES OFF.', 'THE FILM STARTED 10 MINUTES AGO. IT IS ALL ADS ANYWAY.', 'NO OUTSIDE PØLSER.'],
    style: { w: 2.6, door: '#1b1012', frame: '#c0392b', plate: '#1b1012', text: '#ffd23a', light: '#fff1c0', neon: '#ff4a3a', canopy: '#8a1f1a' },
    looks: {
      cv_usher: () => ({ outfit: 'suit', shirt: '#8a1f1a', pants: '#1b1f27', tie: '#ffd23a', hat: null }),
      cv_popcorn: () => ({ shirt: '#c0392b', pants: '#1b1f27', hat: '#ffd23a', hatType: 'cap' }),
    },
    furn: {
      cv_screen(c, f, hw, hh, t) {
        rect(c, -hw - 0.1, -hh - 0.05, 2 * hw + 0.2, 2 * hh + 0.1, '#111');
        const k = (t / 6) % 3, sky = k < 1 ? '#3a7fc4' : k < 2 ? '#c45a3a' : '#1f2a5a';
        rect(c, -hw, -hh, 2 * hw, 2 * hh, sky);
        rect(c, -hw, 0, 2 * hw, hh, '#3a6a3a');
        disc(c, -hw * 0.6, -hh * 0.4, hh * 0.35, k < 2 ? '#ffe27a' : '#e9e4d8');
        const bx = -hw + ((t * 1.5) % (2 * hw + 2.4)) - 1.2;
        c.save(); c.beginPath(); c.rect(-hw, -hh, 2 * hw, 2 * hh); c.clip();
        rr(c, bx - 1.1, -0.15, 2.2, 0.5, 0.1, '#e07b2a'); for (let i = 0; i < 4; i++) rect(c, bx - 0.9 + i * 0.5, -0.08, 0.35, 0.16, '#cfe8ff');
        disc(c, bx - 0.7, 0.38, 0.12, '#111'); disc(c, bx + 0.7, 0.38, 0.12, '#111');
        c.restore();
      },
      cv_seats(c, f, hw, hh) {
        const n = Math.max(2, Math.round(hw * 2 / 0.7));
        for (let i = 0; i < n; i++) { const x = -hw + (i + 0.5) * 2 * hw / n; rr(c, x - 0.3, -hh, 0.6, 2 * hh, 0.1, '#5a1016'); rr(c, x - 0.26, -hh + 0.06, 0.52, 2 * hh - 0.3, 0.08, '#a8242e'); rect(c, x - 0.3, hh - 0.18, 0.6, 0.18, '#3a0a0e'); }
      },
      cv_popcorn(c, f, hw, hh, t) {
        sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c0392b'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.2, 'rgba(255,240,200,0.8)');
        for (let i = 0; i < 14; i++) { const x = -hw + 0.2 + ((i * 0.37) % (2 * hw - 0.4)), y = hh - 0.2 - ((i * 0.13 + Math.abs(Math.sin(t * 5 + i))) * 0.25) % (2 * hh - 0.4); disc(c, x, y, 0.06, '#fff6c8'); }
      },
      cv_filmposter(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, f.c || '#1f2a5a'); wtext(c, f.text || 'THE LAST BUS', 0, 0.01, hh * 1.1, '#ffd23a', 800); },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 27, ambient: 0.45, wallTop: '#2a1418', wallLo: '#16090b', wallHi: '#5a2a30' });
      b.room(0, 0, 30, 17, 'carpet', '#2a1a3a', '#1f1230');
      b.room(0, 17, 30, 26, 'carpet', '#6a1a22', '#4a1218');
      b.box(); b.entrance(15, 2.8);
      b.hwall(17, 0.25, 29.75, [[3, 2.2], [27, 2.2]]);
      b.f('cv_screen', 15, 1.2, 20, 1.2, { layer: 2 });
      sc.st.cv_scr = b.light(15, 4, 14, '#cfe0ff', 0.6);
      for (let r = 0; r < 5; r++) {
        const y = 6 + r * 2.2;
        b.f('cv_seats', 9.5, y, 8.4, 0.9, { solid: 'low' }); b.f('cv_seats', 20.5, y, 8.4, 0.9, { solid: 'low' });
        for (const x of [6.5, 11, 18, 23.5]) if ((r + x) % 3 < 2) b.ped('sitter', x + (r % 2) * 0.7, y - 0.1, U, { chance: 0.55 });
      }
      b.act(15, 9, 1.8, () => st().cv_ticket ? 'F: Watch the film' : 'F: Sneak a look at the film', () => {
        const s = st();
        if (!s.cv_ticket) { K.popup('No ticket? The usher is watching you. Buy one in the lobby.'); talk('guard', ['TICKET, PLEASE!', 'I SAW THAT.'], '#ffd23a'); return; }
        X.pager(K.pick(FILMS), 6000); hp(10); K.sfx('chime');
      });
      b.ped('guard', 28, 9, PI, { look: 'cv_usher' });
      for (const y of [6, 10, 14]) b.light(0.8, y, 2.5, '#ffb070', 0.4, { fix: 'bulb' }), b.light(29.2, y, 2.5, '#ffb070', 0.4, { fix: 'bulb' });
      // lobby
      b.f('counter', 22, 20, 9, 1.2, { solid: 'low', c: '#8a1f1a', top: '#f2e2b8' }); b.f('cv_popcorn', 25, 18.3, 1.6, 1.0, { solid: 'tall' });
      b.f('register', 20.5, 19.8, 0.6, 0.45); b.f('slush', 18.5, 18.2, 1.2, 0.8, { solid: 'tall' });
      b.ped('cashier', 22, 18.6, D, { look: 'cv_popcorn', rob: [80, 260] }); b.zone(17.3, 17.5, 29.5, 19.3);
      b.act(20.5, 21.3, 1.4, () => st().cv_ticket ? 'F: You have a ticket' : 'F: Buy a ticket ($12)', () => {
        const s = st(); if (s.cv_ticket) { K.popup('Seat 7, row 13. There is no row 13.'); return; }
        if (pay(12, 'cinema')) { s.cv_ticket = true; talk('cashier', ['ENJOY THE FILM. IT IS LONG.', 'NO TALKING. NO BUSES.'], '#7dff9a'); K.popup('Ticket bought. The film is inside.'); }
      });
      b.act(24, 21.3, 1.4, () => 'F: Popcorn ($6, +8 hp)', () => K.buyFood(6, 8, K.pick(['Large popcorn. It is mostly air and salt.', 'Butter flavour. No butter was involved.'])));
      for (const [x, t, col] of [[4, 'THE LAST BUS', '#1f2a5a'], [9, 'BRUNOST II', '#5a3a14'], [14, 'ARTUR', '#1b1b1f']]) b.f('cv_filmposter', x, 25.6, 3.2, 0.35, { text: t, c: col, layer: 2 });
      b.f('bench', 6, 21.5, 6, 0.8, { solid: 'low', c: '#3a0a0e', back: 'n' }); b.ped('sitter', 5, 21.6, D, { chance: 0.5 });
      b.f('rope', 3, 19.5, 0.2, 3.5, { posts: 3 });
      b.f('plant', 1.2, 24.6, 1, 1, { solid: 'low' }); b.f('plant', 28.8, 24.6, 1, 1, { solid: 'low' });
      for (const q of [[10, 22, 0], [15, 21, -2], [8, 24, U], [20, 23, U]]) b.browse(q[0], q[1], q[2]);
      b.ped('customer', 12, 22, 0, { chance: 0.7 }); b.ped('customer', 20, 23, U, { chance: 0.6 });
      b.light(8, 21.5, 8, '#ffcf90', 0.75, { fix: 'lamp' }); b.light(22, 21.5, 8, '#fff1d6', 0.8, { fix: 'panel' });
      b.win(1, 25.5, 9, 26); b.win(21, 25.5, 29, 26);
    },
    tick(sc) { const l = sc.st.cv_scr; if (l) l.i = 0.45 + 0.2 * Math.sin(performance.now() / 300) * Math.sin(performance.now() / 710); },
  });

  // ================= SCHOOL =================
  const LESSONS = [
    'MATHS: If bus 7 leaves at 08:00 and bus 7 never arrives, how late are you? Answer: always.',
    'NORWEGIAN: "Bussby" is spelled with two S and zero hope.',
    'HISTORY: In 1814 Norway got a constitution. In 1815 Bussby got its first parking ticket.',
    'SCIENCE: Brunost is not cheese. It is caramel that went to law school.',
    'P.E.: Today we run to the bus. Again. It left.',
  ];
  I.define('school', {
    size: [30, 24], weight: 1, minSide: 15,
    names: ['Bussby Skole', 'Holdeplassen Ungdomsskole', 'Fjordvik Barneskole'],
    greet: ['NO RUNNING IN THE HALLWAY!', 'ARE YOU A PARENT? YOU LOOK LIKE A PARENT.', 'THE BELL DOES NOT DISMISS YOU. I DO.'],
    style: { w: 2.4, door: '#2f5a8a', frame: '#e8e2d0', plate: '#2f5a8a', text: '#ffffff', light: '#fff1d6' },
    looks: {
      cv_teacher: () => ({ shirt: '#8a6a48', jacket: '#5a4a3a', pants: '#3a3a2a', hat: null, hairStyle: K.pick(['bun', 'curly', 'short']) }),
      cv_pupil: () => ({ shirt: K.pick(['#ff4a8a', '#3fd0ff', '#b6ff3a', '#ff8a1e', '#c25cff']), pants: '#2b3a55', hat: K.pick([null, '#c0392b']), hatType: 'beanie', scale: K.rand(0.8, 0.88) }),
      cv_janitor: () => ({ outfit: 'overalls', shirt: '#5a7a9a', pants: '#5a7a9a', hat: null }),
    },
    furn: {
      cv_schooldesk(c, f, hw, hh) { sh(c, hw, hh, 0.25); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c8a46a'); rect(c, -hw + 0.06, -hh + 0.06, 2 * hw - 0.12, 0.05, 'rgba(255,255,255,0.3)'); rect(c, -0.2, -0.1, 0.32, 0.22, '#f4f4f4'); ln(c, 0.15, -0.15, 0.3, 0.1, '#e3b23c', 0.03); },
      cv_chalk(c, f, hw, hh) { rect(c, -hw - 0.05, -hh, 2 * hw + 0.1, 2 * hh, '#7a5a3a'); rect(c, -hw, -hh + 0.05, 2 * hw, 2 * hh - 0.1, '#2f4a3a'); wtext(c, f.text || '2 + 2 = BUS', 0, 0.02, hh * 1.1, 'rgba(240,240,230,0.85)', 600); },
      cv_globe(c, f, hw) { disc(c, 0.05, 0.06, hw, 'rgba(0,0,0,0.25)'); disc(c, 0, 0, hw * 0.9, '#3a7fc4'); oval(c, -0.05, -0.05, hw * 0.4, hw * 0.25, 0.6, '#4a8a3a'); oval(c, 0.12, 0.1, hw * 0.2, hw * 0.3, -0.3, '#4a8a3a'); },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 27, ambient: 0.85, wallTop: '#5a6a7a', wallLo: '#3a4652', wallHi: '#9aaabb' });
      b.room(0, 14, 30, 24, 'lino', '#d8d0b8', '#b8ae94');
      b.room(0, 0, 15, 14, 'wood', '#a8845a', '#86663f'); b.room(15, 0, 30, 14, 'wood', '#9a7a52', '#7a5a38');
      b.box(); b.entrance(15, 2.6);
      b.hwall(14, 0.25, 29.75, [[7.5, 1.6], [22.5, 1.6]]); b.vwall(15, 0.5, 13.75);
      for (const [cx, topic] of [[7.5, '2 + 2 = BUS'], [22.5, 'NORSK: BUSS, BUSSEN, BUSSER']]) {
        b.f('cv_chalk', cx, 0.75, 9, 0.5, { layer: 2, text: topic });
        b.f('desk', cx + 4, 2.6, 2.2, 1.0, { solid: 'low', c: '#6b4a32', face: 'n' }); b.f('chair', cx + 4, 1.7, 0.6, 0.6, { rot: D });
        b.ped('clerk', cx - 1, 2.0, D, { look: 'cv_teacher' });
        for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
          const x = cx - 4.5 + k * 3, y = 5.5 + r * 2.6;
          b.f('cv_schooldesk', x, y, 1.3, 0.8, { solid: 'low' }); b.f('chair', x, y + 0.85, 0.5, 0.5, { rot: U });
          if ((r * 4 + k + (cx > 10 ? 1 : 0)) % 3) b.ped('sitter', x, y + 0.85, U, { look: 'cv_pupil', chance: 0.75 });
        }
        b.light(cx - 3, 6, 7, '#f4fbff', 0.8, { fix: 'tube' }); b.light(cx + 3, 6, 7, '#f4fbff', 0.8, { fix: 'tube' });
      }
      b.f('cv_globe', 13.6, 2.5, 0.8, 0.8, { solid: 'low' });
      b.act(7.5, 3.6, 1.6, () => 'F: Attend class', () => { X.pager(K.pick(LESSONS), 6000); talk('clerk', ['SIT DOWN! YOU ARE 35 YEARS LATE.', 'WHO ARE YOU? WHERE IS YOUR PARENT?', 'PHONES IN THE BOX. BUSES IN THE GARAGE.'], '#ffd23a'); K.sfx('beep'); });
      b.act(22.5, 3.6, 1.6, () => 'F: Ask the teacher a question', () => talk('clerk', ['THE ANSWER IS "TAKE THE BUS". IT IS ALWAYS THE BUS.', 'THERE ARE NO STUPID QUESTIONS. THAT WAS CLOSE THOUGH.', 'ASK AGAIN AFTER THE BELL. THE BELL IS BROKEN.'], '#ffd23a'));
      // corridor: lockers, lunch, trophies
      b.f('locker', 7, 23.05, 10, 0.9, { solid: 'tall' }); b.f('locker', 25, 23.05, 8, 0.9, { solid: 'tall' });
      b.act(4, 21.8, 1.4, () => 'F: Open a random locker', () => {
        const r = Math.random();
        if (r < 0.15) { K.money(10, 'locker', K.P.ped.x, K.P.ped.y); K.popup('$10 and a note: "Lunch money. Do not steal." Oops.'); }
        else K.popup(K.pick(['A matpakke from 2019. It is alive.', 'A bus timetable, heavily annotated.', 'Forty-two gym socks. No pairs.']));
        K.sfx('beep');
      });
      b.f('bench', 16, 16, 6, 0.8, { solid: 'low', c: '#2f5a8a', back: 'n' });
      b.act(16, 17.2, 1.4, () => 'F: Eat a matpakke (free, +5 hp)', () => { hp(5); K.sfx('glug'); K.popup(K.pick(['Brown cheese on dry bread. Character building.', 'Leverpostei. You are now officially Norwegian.'])); });
      b.ped('sitter', 15, 16, D, { look: 'cv_pupil', chance: 0.7 }); b.ped('sitter', 17.5, 16, D, { look: 'cv_pupil', chance: 0.5 });
      b.ped('worker', 25, 19, PI, { look: 'cv_janitor', wander: true });
      b.ped('customer', 10, 19, 0, { look: 'cv_pupil' }); b.ped('customer', 20, 20, PI, { look: 'cv_pupil', chance: 0.6 });
      b.f('poster', 26, 14.45, 3, 0.3, { kind: 'bus', layer: 2 }); b.f('plant', 1.2, 15.2, 0.9, 0.9, { solid: 'low' });
      for (const q of [[5, 19, 0], [12, 20, PI], [22, 18, 0], [27, 20, PI], [9, 17, U]]) b.browse(q[0], q[1], q[2]);
      for (const x of [6, 15, 24]) b.light(x, 19, 8, '#f4fbff', 0.75, { fix: 'panel' });
      b.win(0, 2, 0.5, 12); b.win(29.5, 2, 30, 12); b.win(2, 23.5, 12, 24); b.win(18, 23.5, 28, 24);
    },
  });

  // ================= LIBRARY =================
  const BOOKS = ['"Bus Timetables of the 1970s" (Vol. 3)', '"How to Win Friends and Influence Artur"', '"50 Shades of Brunost"', '"The Fjord Is Not a River: A Rant"', '"Parking: A Love Story"', '"Lost in Bussby" (the map is missing)'];
  I.define('library', {
    size: [26, 20], weight: 1, minSide: 13,
    names: ['Bussby Bibliotek', 'Deichmann-ish', 'Folkebiblioteket'],
    greet: ['SHHH.', 'WELCOME. QUIETLY.', 'THE BUS SECTION IS IN THE BACK. IT IS THE WHOLE BACK.'],
    style: { w: 2.2, door: '#3a2a1a', frame: '#c9b89a', plate: '#2f4a3a', text: '#e9e4d8', light: '#ffe2a0', icon: 'house' },
    looks: {
      cv_librarian: () => ({ shirt: '#6b2a5a', jacket: '#3a3a5a', pants: '#2b2d33', hat: null, hairStyle: 'bun' }),
      cv_reader: () => ({ jacket: K.pick(['#5a3d22', '#4a5a3a', '#8a8f96']), hat: null }),
    },
    furn: {
      cv_lamp(c, f, hw) { disc(c, 0, 0, hw, '#2f6a3a'); disc(c, 0, 0, hw * 0.6, '#ffe8a0'); },
      cv_books(c, f, hw, hh) { for (let i = 0; i < 5; i++) { c.save(); c.translate((i - 2) * hw * 0.3, (i % 2 - 0.5) * hh * 0.4); c.rotate(i * 0.4); rect(c, -0.2, -0.13, 0.4, 0.26, ['#8a1f1a', '#1f3f6e', '#3e8e5a', '#e3b23c', '#5a3a24'][i]); c.restore(); } },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 24, ambient: 0.65, wallTop: '#4a3a2a', wallLo: '#2a2018', wallHi: '#7a6a52' });
      b.room(0, 0, 26, 20, 'wood', '#7a5a3a', '#5e432a');
      b.room(0, 13, 10, 20, 'carpet', '#2f4a3a', '#243a2d');
      b.box(); b.entrance(17, 2.4);
      // stacks
      for (const y of [2.6, 5.8, 9]) { b.f('bookshelf', 6, y, 9, 0.8, { solid: 'tall' }); }
      b.f('bookshelf', 25.15, 6, 0.8, 10, { solid: 'tall' }); b.f('bookshelf', 13, 0.95, 4, 0.8, { solid: 'tall' });
      for (const y of [4.2, 7.4, 10.6]) b.browse(6, y, U);
      b.ped('customer', 4, 4.2, U, { look: 'cv_reader' }); b.ped('customer', 8, 7.4, U, { look: 'cv_reader', chance: 0.6 });
      b.act(6, 4.2, 1.6, () => 'F: Borrow a book', () => { X.pager('You borrow ' + K.pick(BOOKS) + '. Due back in 3 weeks. You will not.', 5000); K.sfx('beep'); });
      // reading tables
      for (const [x, y] of [[17, 4], [17, 9]]) {
        b.f('table', x, y, 4, 1.6, { solid: 'low', c: '#5a3a24' }); b.f('cv_lamp', x, y, 0.4, 0.4, { layer: 2 }); b.f('cv_books', x + 1.2, y + 0.2, 0.8, 0.6, { layer: 2 });
        for (const s of [-1, 1]) { b.f('chair', x - 1, y + s * 1.2, 0.55, 0.55, { rot: -s * D }); b.f('chair', x + 1, y + s * 1.2, 0.55, 0.55, { rot: -s * D }); }
        b.ped('sitter', x - 1, y + 1.2, U, { look: 'cv_reader', chance: 0.7 }); b.ped('sitter', x + 1, y - 1.2, D, { look: 'cv_reader', chance: 0.5 });
        b.light(x, y, 4.5, '#ffe8a0', 0.65);
      }
      b.act(19, 6.5, 1.4, () => 'F: Read the newspaper', () => { X.pager(K.pick(['BUSSBY POSTEN: "BUS MANIAC STRIKES AGAIN". There is a blurry photo. It is you.', 'BUSSBY POSTEN: Local man (Artur) denies everything. "Everything," he said.', 'BUSSBY POSTEN: Weather: rain. Tomorrow: rain, but Tuesday.']), 5500); });
      // the desk
      b.f('counter', 22, 14, 1.2, 5, { solid: 'low', c: '#5a3a24', top: '#c9b89a' }); b.f('monitor', 22.1, 13, 0.5, 0.7); b.f('register', 22.1, 15.3, 0.5, 0.6, { kind: 'stamp' });
      b.ped('clerk', 24, 14, PI, { look: 'cv_librarian' }); b.zone(22.7, 11, 25.5, 17.3);
      b.act(20.6, 14, 1.4, () => st().cv_fine ? 'F: Ask the librarian something' : 'F: Return a book (late fee $5)', () => {
        const s = st();
        if (!s.cv_fine) { if (pay(5, 'library')) { s.cv_fine = true; talk('clerk', ['THIS WAS DUE IN 2011.', 'THERE IS A BUS TICKET USED AS A BOOKMARK. DISGUSTING.'], '#ffd23a'); } return; }
        talk('clerk', ['SHHH.', 'THE TOILET IS FOR MEMBERS. MEMBERSHIP IS FOR NOBODY.', 'NO. WHATEVER IT IS. NO.']);
      });
      // children's corner
      b.f('rug', 5, 16.5, 7, 4.5, { c: '#c0392b', c2: '#f2c230', layer: 0 }); b.f('armchair', 2.2, 16.5, 1.3, 1.3, { solid: 'low', c: '#e3b23c' }); b.f('cv_books', 5.5, 16.5, 1.4, 1, { layer: 1 });
      b.ped('sitter', 2.2, 16.5, 0, { chance: 0.5 });
      b.f('plant', 11.5, 18.8, 1, 1, { solid: 'low' }); b.f('poster', 6, 19.6, 3, 0.3, { kind: 'journey', layer: 2 });
      for (const q of [[13, 12, 0], [20, 17, U], [12, 6, 0]]) b.browse(q[0], q[1], q[2]);
      for (const q of [[6, 4], [6, 10], [13, 15]]) b.light(q[0], q[1], 7, '#ffe2b0', 0.55, { fix: 'lamp' });
      b.light(22, 14, 5, '#fff1d6', 0.7, { fix: 'panel' });
      b.win(0, 1, 0.5, 11); b.win(10, 19.5, 14, 20); b.win(20, 19.5, 25, 20);
    },
    // the librarian shushes anyone loud: running, shooting or fighting
    tick(sc, dt) {
      const s = sc.st; s.cv_sh = (s.cv_sh || 0) - dt;
      const p = K.P.ped; if (!p || s.cv_sh > 0) return;
      if ((p.speed || 0) > 4.2 || p.firing) { const l = staff('clerk'); if (l) { K.say(l, K.pick(['SHHHHH!', 'THIS IS A LIBRARY!', 'WALK! LIKE A BOOK!']), '#ffd23a'); s.cv_sh = 4; } }
    },
  });

  // ================= CHURCH =================
  I.define('church', {
    size: [22, 30], weight: 1, minSide: 13,
    names: ['Bussby Kirke', 'St. Olav Holdeplass', 'Fjordvik Kapell'],
    greet: ['VELKOMMEN, MY CHILD. WIPE YOUR FEET.', 'MASS IS AT ELEVEN. THE BUS IS AT TEN TO.', 'THE LORD SEES ALL. SO DO THE SPEED CAMERAS.'],
    style: { w: 2.4, door: '#4a2a1a', frame: '#c9c2b0', plate: '#3a3f4a', text: '#f2e2b8', light: '#ffd9a0' },
    looks: {
      cv_priest: () => ({ shirt: '#111216', pants: '#111216', tie: '#f4f4f4', hat: null, hairStyle: 'short', scale: 1.04 }),
      cv_old: () => ({ jacket: K.pick(['#5a4a3a', '#3a3a5a', '#6b2a3a']), hat: K.pick([null, '#4a4036']), hatType: 'beanie', hair: '#cfcfcf', scale: K.rand(0.9, 0.97) }),
    },
    furn: {
      cv_altar(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#e8e2d0'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.2, '#8a1f1a'); rect(c, -0.06, -hh + 0.15, 0.12, 2 * hh - 0.3, '#d4af37'); rect(c, -0.3, -0.06, 0.6, 0.12, '#d4af37'); },
      cv_organ(c, f, hw, hh) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#4a2a1a'); const n = 10; for (let i = 0; i < n; i++) { const x = -hw + 0.15 + i * (2 * hw - 0.3) / (n - 1), l = 0.4 + 0.5 * (1 - Math.abs(i - n / 2 + 0.5) / (n / 2)); rr(c, x - 0.08, -hh + 0.1, 0.16, l, 0.06, '#c9ccd1'); } rect(c, -hw + 0.2, hh - 0.35, 2 * hw - 0.4, 0.22, '#f4f4f4'); for (let x = -hw + 0.25; x < hw - 0.2; x += 0.16) rect(c, x, hh - 0.35, 0.06, 0.13, '#111'); },
      cv_candles(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a2a1a'); const n = Math.min(18, 4 + ((st().cv_candles || 0) * 2)); for (let i = 0; i < n; i++) { const x = -hw + 0.15 + (i % 6) * (2 * hw - 0.3) / 5, y = -hh + 0.15 + Math.floor(i / 6) * 0.3; disc(c, x, y, 0.05, '#f4f0e0'); disc(c, x, y, 0.035 + 0.01 * Math.sin(t * 9 + i), '#ffb040'); } },
      cv_glass(c, f, hw, hh, t) { const cols = ['#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a', '#8a3ab0']; const n = 6; for (let i = 0; i < n; i++) rect(c, -hw + i * 2 * hw / n, -hh, 2 * hw / n, 2 * hh, cols[(i + (f.seed * 10 | 0)) % cols.length]); rect(c, -hw, -0.02, 2 * hw, 0.04, '#222'); },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 29, ambient: 0.6, wallTop: '#8a8478', wallLo: '#5a554c', wallHi: '#c9c2b0' });
      b.room(0, 0, 22, 30, 'marble', '#bdb5a3', '#9a9280');
      b.room(8.5, 6, 13.5, 30, 'carpet', '#7a1e26', '#5a161c', { nonav: false });
      b.box(); b.entrance(11, 2.6);
      b.f('cv_altar', 11, 3.2, 4, 1.4, { solid: 'low' }); b.f('rug', 11, 3.6, 8, 4, { c: '#7a1e26', c2: '#d4af37', layer: 0 });
      b.ped('clerk', 11, 1.6, D, { look: 'cv_priest' }); b.zone(5, 0.5, 17, 2.4);
      b.f('cv_organ', 2.2, 2.4, 3.2, 3, { solid: 'tall' }); b.f('chair', 2.2, 4.4, 0.6, 0.6, { rot: U });
      b.f('cv_candles', 19, 2.0, 2.4, 1, { solid: 'low' });
      for (let r = 0; r < 8; r++) {
        const y = 8 + r * 2.4;
        for (const x of [4.5, 17.5]) { b.f('bench', x, y, 7, 0.8, { solid: 'low', c: '#5a3a22', back: 's' }); if ((r + (x > 10 ? 1 : 0)) % 3 === 0) b.ped('sitter', x + (r % 2 ? -1.5 : 1.5), y - 0.05, U, { look: 'cv_old', chance: 0.7 }); }
      }
      for (const y of [6, 14, 22]) { b.f('cv_glass', 0.4, y + 2, 0.3, 3, { layer: 2 }); b.f('cv_glass', 21.6, y + 2, 0.3, 3, { layer: 2 }); }
      b.act(11, 5.2, 1.6, () => 'F: Confess your sins', () => {
        const w = K.P.wanted || 0, s = K.S.stats || {};
        talk('clerk', w > 0 ? ['THE POLICE ARE OUTSIDE. THAT IS BETWEEN YOU AND THEM.', 'GOD FORGIVES. THE KOMMUNE DOES NOT.'] : ['SAY TEN HAIL ARTURS AND TAKE THE BUS HOME.', 'YOU STOLE A BUS? ... HOW MANY? ... MY CHILD.', 'SIN IS LIKE PARKING. EVERYONE DOES IT WRONG.'], '#f2e2b8');
        X.pager('You confess. ' + (s.healed ? 'Including the ' + s.healed + ' hospital visits.' : 'Mostly about the buses.') + ' You feel lighter.', 4500);
      });
      b.act(19, 3.4, 1.4, () => 'F: Light a candle ($10, heal)', () => {
        if (!pay(10, 'church')) return; const s = st(); s.cv_candles = (s.cv_candles || 0) + 1;
        K.P.ped.hp = K.P.ped.maxHp; K.sfx('heal'); K.popup(K.pick(['A warm glow. Full health. Probably a coincidence.', 'You feel blessed. And $10 lighter.']));
      });
      b.act(2.2, 5.4, 1.2, () => 'F: Play the organ', () => { K.sfx('chime'); K.popup(K.pick(['You play "Take the Bus" in D minor. Grandmas weep.', 'BWAAAAAMP. The pigeons outside leave.'])); talk('clerk', ['PLEASE NOT THAT ONE.', 'BEAUTIFUL. PLEASE STOP.']); });
      b.f('plant', 1.2, 28.6, 0.9, 0.9, { solid: 'low' }); b.f('plant', 20.8, 28.6, 0.9, 0.9, { solid: 'low' });
      b.f('table', 18, 27.6, 2, 0.8, { solid: 'low', c: '#5a3a22' }); b.f('cv_books', 18, 27.6, 1.4, 0.6, { layer: 2 });
      b.act(18, 26.4, 1.2, () => 'F: Drop a coin in the box ($1)', () => { if (pay(1, 'church')) K.popup('The box says TAKK. In very small letters.'); });
      b.ped('customer', 11, 24, U, { look: 'cv_old', chance: 0.6 });
      for (const q of [[11, 25, U], [11, 18, U], [19, 6, U], [3, 26, 0]]) b.browse(q[0], q[1], q[2]);
      b.light(11, 3, 8, '#ffd9a0', 0.8, { fix: 'lamp' }); b.light(19, 2, 4, '#ffb040', 0.7);
      for (const y of [10, 17, 24]) b.light(11, y, 9, '#ffe2b0', 0.55, { fix: 'lamp' });
      b.win(0, 7, 0.5, 26); b.win(21.5, 7, 22, 26);
    },
  });

  // ================= POST OFFICE =================
  I.define('postoffice', {
    size: [22, 16], weight: 2, minSide: 11,
    names: ['Posten Bussby', 'Post i Butikk', 'Bussby Postkontor'],
    greet: ['TAKE A NUMBER.', 'YOUR PARCEL IS IN TRONDHEIM. PROBABLY.', 'WE CLOSE AT 15:00. IT IS 14:59.'],
    style: { w: 2.0, door: '#8a1f1a', frame: '#e8e2d0', plate: '#c0392b', text: '#ffffff', light: '#fff1d6' },
    looks: { cv_postie: () => ({ shirt: '#c0392b', pants: '#1b1f27', hat: '#c0392b', hatType: 'cap' }) },
    furn: {
      cv_parcels(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d636b'); const n = Math.max(2, Math.round(hw * 2 / 0.6)); for (let i = 0; i < n; i++) { const x = -hw + 0.05 + i * (2 * hw - 0.1) / n, w = (2 * hw - 0.1) / n - 0.05; rect(c, x, -hh + 0.06, w, 2 * hh - 0.12, i % 3 ? '#b08850' : '#c9a46a'); rect(c, x + w / 2 - 0.03, -hh + 0.06, 0.06, 2 * hh - 0.12, '#e8dcc0'); } },
      cv_ticket(c, f, hw, hh, t) { sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.08, '#e8edf2'); rect(c, -hw + 0.08, -hh + 0.08, 2 * hw - 0.16, 0.25, '#1b1d22'); wtext(c, String(((st().cv_num || 0) % 1000)).padStart(3, '0'), 0, -hh + 0.2, 0.16, '#ff3a2a', 800); rect(c, -0.12, hh - 0.18, 0.24, 0.08, '#c0392b'); },
      cv_serving(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#111216'); wtext(c, (f.text || 'NOW') + ' ' + String((st().cv_serv || 12) % 1000).padStart(3, '0'), 0, 0.02, hh * 1.1, Math.sin(t * 2) > 0.95 ? '#ffffff' : '#ff3a2a', 800); },
      cv_postbox(c, f, hw, hh) { sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.1, '#c0392b'); rect(c, -hw + 0.1, -0.04, 2 * hw - 0.2, 0.08, '#1b1d22'); wtext(c, 'POST', 0, hh - 0.15, 0.14, '#fff', 800); },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 21, ambient: 0.9, wallTop: '#7a2a24', wallLo: '#4a1814', wallHi: '#b85a4a' });
      b.room(0, 6, 22, 16, 'lino', '#e4ddd0', '#c4bba8'); b.room(0, 0, 22, 6, 'concrete', '#7a7872', '#65635d');
      b.box(); b.entrance(11, 2.4);
      b.wall(0, 5.75, 2, 6.25); b.wall(18.5, 5.75, 22, 6.25);
      b.f('counter', 9, 6, 14, 1.3, { solid: 'low', c: '#c0392b', top: '#eef2f5' });
      sc.gaps.push({ x: sc.ox + 17.25, y: sc.oy + 6, w: 2.5, vert: false, door: true, gate: true, a: 0, side: 1 });
      for (const x of [5, 9, 13]) { b.f('register', x, 5.8, 0.6, 0.45); b.browse(x, 7.9, U); }
      b.f('glass', 7, 6, 0.1, 1.3); b.f('glass', 11, 6, 0.1, 1.3);
      b.ped('clerk', 5, 4.6, D, { look: 'cv_postie' }); b.ped('clerk', 13, 4.6, D, { look: 'cv_postie', chance: 0.5 });
      b.ped('worker', 15, 2, 0, { look: 'cv_postie', wander: true });
      b.f('cv_parcels', 11, 0.95, 18, 0.9, { solid: 'tall' }); b.f('cv_parcels', 20.9, 3, 0.9, 4, { solid: 'tall' }); b.f('pallet', 4, 3, 2, 1.6, { solid: 'low' }); b.f('crate', 4, 3, 1.2, 1.0, { solid: 'low', text: 'FRAGILE' });
      b.zone(0.5, 0.5, 21.5, 5.4);
      b.f('cv_serving', 9, 6.6, 2.6, 0.45, { layer: 2, text: 'NOW' });
      b.f('cv_ticket', 2.5, 14.6, 0.8, 0.7, { solid: 'tall' });
      b.act(2.5, 13.6, 1.2, () => 'F: Take a queue number', () => { const s = st(); s.cv_num = (s.cv_num || 236) + 1; s.cv_serv = s.cv_serv || 12; K.sfx('beep'); K.popup('Your number: ' + s.cv_num + '. Now serving: ' + s.cv_serv + '. Bring a sleeping bag.'); });
      b.act(5, 7.9, 1.3, () => 'F: Pick up a parcel', () => {
        const s = st(); if (s.cv_parcel) { talk('clerk', ['ONE PARCEL PER LIFETIME.', 'YOUR OTHER PARCEL IS IN TRONDHEIM.']); return; }
        s.cv_parcel = true; const r = Math.random();
        if (r < 0.35) { K.money(50, 'parcel', K.P.ped.x, K.P.ped.y); X.pager('A parcel from Grandma: knitted socks and $50. "Take the bus, not the car."', 5000); }
        else if (r < 0.7) { K.money(-15, 'customs'); X.pager('A parcel from China. Customs fee: $15. Inside: one (1) phone case for a phone you do not own.', 5000); }
        else X.pager('The parcel is a brick. A note says: "From A." You decide not to ask.', 5000);
        talk('clerk', ['SIGN HERE. AND HERE. AND IN TRONDHEIM.'], '#7dff9a');
      });
      b.act(13, 7.9, 1.3, () => 'F: Send a postcard ($3)', () => { if (pay(3, 'post')) { K.popup('Postcard sent: "Bussby is lovely. Send help." ETA: 3 to 12 weeks.'); talk('clerk', ['IT WILL ARRIVE. SOMETIME. SOMEWHERE.']); } });
      b.f('cv_postbox', 20, 14.8, 0.8, 0.8, { solid: 'tall' }); b.f('bench', 14, 15.1, 5, 0.8, { solid: 'low', c: '#5d636b', back: 's' });
      b.ped('sitter', 13, 15.05, U, { chance: 0.7 }); b.ped('sitter', 15.5, 15.05, U, { chance: 0.4 });
      b.ped('customer', 9, 8, U, { chance: 0.8 }); b.ped('customer', 6, 11, 0, { chance: 0.6 });
      b.f('mags', 6, 15.3, 2.8, 0.6, { solid: 'low' }); b.f('poster', 17, 6.6, 2.5, 0.3, { kind: 'bus', layer: 2 });
      for (const q of [[6, 11, 0], [16, 11, PI], [11, 13, U]]) b.browse(q[0], q[1], q[2]);
      b.light(6, 10.5, 8, '#f4fbff', 0.85, { fix: 'panel' }); b.light(16, 10.5, 8, '#f4fbff', 0.85, { fix: 'panel' }); b.light(11, 3, 9, '#ffe9c0', 0.7, { fix: 'tube' });
      b.win(1, 15.5, 8, 16); b.win(14, 15.5, 21, 16);
    },
    tick(sc, dt) { const s = sc.st; s.cv_st = (s.cv_st || 0) + dt; if (s.cv_st > 20) { s.cv_st = 0; s.cv_serv = (s.cv_serv || 12) + 1; } },
  });

  // ================= KOMMUNE (town hall) =================
  const WIN = { A: 'B', B: 'C', C: 'A' };
  I.define('kommune', {
    size: [28, 20], weight: 1, minSide: 14,
    names: ['Bussby Kommune', 'Rådhuset', 'NAV-ish Bussby', 'Servicetorget'],
    greet: ['DO YOU HAVE AN APPOINTMENT?', 'THE FORM IS ONLINE. THE WEBSITE IS DOWN.', 'TAKE A NUMBER. IT WILL NOT HELP, BUT TAKE ONE.'],
    style: { w: 2.6, door: '#2a3a48', frame: '#c9ccd1', plate: '#1f3f6e', text: '#ffffff', light: '#eaf6ff', pillars: 1 },
    looks: { cv_byrokrat: () => ({ shirt: '#c9ccd1', jacket: K.pick(['#5a6a7a', '#6b5a4a', '#4a5a3a']), pants: '#3a3f4a', hat: null, hairStyle: K.pick(['short', 'bun', 'bald']) }) },
    furn: {},
    layout(sc, b) {
      Object.assign(sc, { camSpan: 26, ambient: 0.85, wallTop: '#6a7280', wallLo: '#454b55', wallHi: '#a5adba' });
      b.room(0, 7, 28, 20, 'lino', '#c8cfc4', '#a9b0a4'); b.room(0, 0, 28, 7, 'carpet', '#5b626d', '#4b525d');
      b.box(); b.entrance(14, 2.8);
      b.wall(0, 6.75, 2, 7.25); b.wall(24.5, 6.75, 28, 7.25);
      b.f('counter', 13.25, 7, 22.5, 1.3, { solid: 'low', c: '#5a6a7a', top: '#e8e2d0' });
      sc.gaps.push({ x: sc.ox + 26.25, y: sc.oy + 7, w: 3.5, vert: false, door: true, gate: true, a: 0, side: 1 });
      const wins = [['A', 5], ['B', 13], ['C', 21]];
      for (const [k, x] of wins) {
        b.f('glass', x - 2.8, 7, 0.1, 1.3); b.f('monitor', x, 6.7, 0.7, 0.5);
        b.f('sign', x, 7.85, 1.6, 0.4, { text: 'LUKE ' + k, c: '#fff', bg: '#1f3f6e', size: 0.22, layer: 2 });
        b.ped('clerk', x, 5.6, D, { look: 'cv_byrokrat', sit: true }); b.f('chair', x, 5.6, 0.6, 0.6, { rot: D });
        b.act(x, 8.9, 1.3, () => st().cv_form ? 'F: Window ' + k + ' (form done)' : 'F: Window ' + k + ': apply for bus subsidy', () => {
          const s = st();
          if (s.cv_form) { talk('clerk', ['YOU HAVE BEEN HELPED. PLEASE LEAVE.', 'YOUR CASE IS CLOSED. SO IS THIS WINDOW.']); return; }
          const need = s.cv_next || 'A', p = cur() && cur().peds.filter(q => K.mine(q) && q.ai.role === 'clerk').sort((a, c) => Math.abs(a.x - K.P.ped.x) - Math.abs(c.x - K.P.ped.x))[0];
          if (k !== need) { if (p) K.say(p, K.pick(['WRONG WINDOW. GO TO WINDOW ' + need + '.', 'THIS IS WINDOW ' + k + '. YOU WANT ' + need + '. EVERYBODY KNOWS THAT.']), '#ffd23a'); return; }
          s.cv_steps = (s.cv_steps || 0) + 1; K.sfx('beep');
          if (s.cv_steps >= 4) {
            s.cv_form = true; K.money(60, 'subsidy', K.P.ped.x, K.P.ped.y); K.sfx('cash');
            if (p) K.say(p, 'APPROVED. $60 BUS SUBSIDY. DO NOT TELL ANYONE.', '#7dff9a');
            X.big('FORM 27-B STAMPED', '#7dff9a', 2200, 'four windows, one stamp');
            return;
          }
          s.cv_next = WIN[k];
          if (p) K.say(p, K.pick(['YOU NEED A STAMP FROM WINDOW ' + s.cv_next + '.', 'THIS FORM IS BLUE. WINDOW ' + s.cv_next + ' DOES BLUE.', 'LUNCH BREAK. TRY WINDOW ' + s.cv_next + '.']), '#ffd23a');
          K.popup('Step ' + s.cv_steps + '/4: go to window ' + s.cv_next + '.');
        });
      }
      b.f('filing', 3, 0.95, 4, 0.8, { solid: 'tall' }); b.f('filing', 12, 0.95, 4, 0.8, { solid: 'tall' }); b.f('printer', 18, 1.2, 1.4, 0.9, { solid: 'low' }); b.f('coffee', 26.8, 1.2, 0.8, 0.8, { solid: 'tall' });
      b.f('portrait', 8, 0.75, 1.4, 0.35, { layer: 2, text: 'ORDFØRER ARTUR' });
      b.ped('worker', 22, 3, 0, { look: 'cv_byrokrat', wander: true, chance: 0.7 }); b.zone(0.5, 0.5, 27.5, 6.4);
      for (const q of [[22, 3, 0], [26, 2.2, U], [16, 2.5, U]]) b.browse(q[0], q[1], q[2]);
      // waiting area
      b.f('cv_ticket', 1.6, 18.8, 0.8, 0.7, { solid: 'tall' }); b.f('cv_serving', 14, 7.75, 3, 0.4, { layer: 2, text: 'NR' });
      b.act(1.6, 17.8, 1.2, () => 'F: Take a queue number', () => { const s = st(); s.cv_num = (s.cv_num || 4410) + 1; K.sfx('beep'); K.popup('Number ' + s.cv_num + '. Estimated wait: 3 to 5 business years.'); });
      for (const y of [12, 15]) for (const x of [8, 20]) { b.f('bench', x, y, 7, 0.8, { solid: 'low', c: '#3f6f98', back: 's' }); b.ped('sitter', x + (y > 13 ? 1.5 : -2), y - 0.05, U, { chance: 0.75 }); }
      b.ped('customer', 13, 9.5, U, { chance: 0.8 });
      b.f('plant', 26.8, 18.8, 1, 1, { solid: 'low' }); b.f('poster', 24, 19.6, 3, 0.3, { kind: 'journey', layer: 2 }); b.f('cooler', 26.9, 9, 0.7, 0.7, { solid: 'tall' });
      for (const q of [[5, 9, U], [21, 9, U], [14, 17, U]]) b.browse(q[0], q[1], q[2]);
      for (const x of [6, 14, 22]) { b.light(x, 13, 8, '#f4fbff', 0.8, { fix: 'panel' }); b.light(x, 3.5, 6, '#fff1d6', 0.6, { fix: 'panel' }); }
      b.win(2, 19.5, 11, 20); b.win(17, 19.5, 26, 20);
    },
  });

  // ================= DENTIST =================
  I.define('dentist', {
    size: [20, 16], weight: 1, minSide: 10,
    names: ['Tannlege Bor', 'Bussby Tannklinikk', 'Smil & Bor'],
    greet: ['OPEN WIDE!', 'HAVE YOU BEEN FLOSSING? DO NOT LIE.', 'THIS WILL ONLY HURT YOUR WALLET.'],
    style: { w: 1.8, door: '#3a7f9a', frame: '#e8eef2', plate: '#f2f2f2', text: '#2f7fa0', light: '#eaf6ff' },
    looks: {
      cv_dentist: () => ({ shirt: '#7fc4e8', jacket: '#f4f6f8', pants: '#7fc4e8', hat: null, hairStyle: 'short' }),
      cv_assist: () => ({ outfit: 'medic', shirt: '#e86aa0', pants: '#e86aa0', hat: null, hairStyle: 'pony' }),
    },
    furn: {
      cv_dentchair(c, f, hw, hh, t) {
        sh(c, hw, hh, 0.3); rr(c, -hw * 0.6, -hh, hw * 1.2, 2 * hh, 0.25, '#2f7fa0'); rr(c, -hw * 0.5, -hh + 0.1, hw, 2 * hh - 0.2, 0.22, '#5ab0d0');
        disc(c, hw * 0.7, -hh * 0.5, 0.25, '#e8eef2'); disc(c, hw * 0.7, -hh * 0.5, 0.15, '#bfe3f2');
        disc(c, -hw * 0.8, -hh * 0.75, 0.3, 'rgba(255,255,230,0.9)'); ln(c, -hw * 0.8, -hh * 0.75, -hw * 0.2, -hh * 0.4, '#9aa0a8', 0.05);
      },
      cv_tooth(c, f, hw, hh) { rr(c, -hw, -hh, 2 * hw, 2 * hh * 0.7, hw * 0.5, '#ffffff'); rr(c, -hw, hh * 0.1, hw * 0.8, hh * 0.9, hw * 0.3, '#ffffff'); rr(c, hw * 0.2, hh * 0.1, hw * 0.8, hh * 0.9, hw * 0.3, '#ffffff'); },
    },
    layout(sc, b) {
      Object.assign(sc, { camSpan: 20, ambient: 0.95, wallTop: '#7a9aaa', wallLo: '#4f6a78', wallHi: '#c4dce6' });
      b.room(0, 8, 20, 16, 'tile', '#e8f2f4', '#c4d6da'); b.room(0, 0, 20, 8, 'lino', '#d6ecf2', '#b4cdd4');
      b.box(); b.entrance(10, 2.2);
      b.hwall(8, 0.25, 19.75, [[6, 1.6], [15, 1.6]]); b.vwall(10, 0.5, 7.75);
      for (const x of [5, 15]) { b.f('cv_dentchair', x, 3.5, 1.6, 2.6, { solid: 'low' }); b.f('sink', x + 3, 1, 0.9, 0.6, { solid: 'low' }); b.f('kcounter', x - 3.6, 3, 1, 3.4, { solid: 'low' }); b.light(x, 3.5, 5, '#ffffff', 0.9, { fix: 'panel' }); }
      b.ped('doctor', 6.4, 2.6, PI, { look: 'cv_dentist' }); b.ped('patient', 5, 3.7, U, { chance: 0.6, pose: 'lie' });
      b.ped('doctor', 13.6, 2.6, 0, { look: 'cv_assist', chance: 0.7 });
      b.act(15, 5.8, 1.5, () => 'F: Get a check-up ($30, full health)', () => {
        if (!pay(30, 'dentist')) { talk('doctor', ['NO MONEY? I CAN PULL A TOOTH FOR FREE. ONLY ONE.']); return; }
        K.P.ped.hp = K.P.ped.maxHp; K.sfx('heal');
        X.pager(K.pick(['DENTIST: "Seven cavities. Do you drink slush for breakfast?" Full health.', 'DENTIST: "You grind your teeth. Is it the buses?" Full health.', 'DENTIST: "Floss. Floss like the bus is leaving." Full health.']), 5000);
      });
      // waiting room
      b.f('counter', 15.5, 10, 6, 1.1, { solid: 'low', c: '#2f7fa0', top: '#eef2f5' }); b.f('monitor', 14, 9.7, 0.6, 0.45);
      b.ped('clerk', 15.5, 9, D, { look: 'cv_assist' }); b.zone(12.3, 8.3, 19.5, 9.4);
      b.act(15.5, 11.3, 1.4, () => 'F: Free toothbrush', () => { const s = st(); if (s.cv_brush) { talk('clerk', ['ONE BRUSH PER MOUTH.']); return; } s.cv_brush = true; K.popup('A toothbrush with the Bussby Kommune logo. Bristles: four.'); talk('clerk', ['TWICE A DAY. NOT WITH THE SAME HAND.']); });
      b.f('bench', 3.5, 15.1, 6, 0.8, { solid: 'low', c: '#3f6f98', back: 's' }); b.f('bench', 0.9, 11.5, 0.8, 4, { solid: 'low', c: '#3f6f98', back: 'w' });
      b.ped('sitter', 2.5, 15.05, U, { chance: 0.7 }); b.ped('sitter', 1.0, 11, 0, { chance: 0.5 });
      b.f('mags', 4.5, 11, 2.4, 0.6, { solid: 'low' });
      b.act(4.5, 12.1, 1.2, () => 'F: Read a waiting-room magazine', () => X.pager(K.pick(['"SE OG HØR", March 2004: "Is Artur dating a ferry?"', '"Teeth Monthly": Ten smiles that ruined Christmas.', '"Bussby Bus Fan": centrefold is a 1989 Volvo B10M. You stare a while.']), 5000));
      b.f('cv_tooth', 10, 15.4, 0.8, 0.6, { layer: 2 }); b.f('plant', 19, 15, 0.9, 0.9, { solid: 'low' }); b.f('fishtank', 19.1, 12.5, 0.8, 2.4, { solid: 'tall', fragile: true });
      for (const q of [[8, 12, 0], [12, 13, U]]) b.browse(q[0], q[1], q[2]);
      b.light(5, 12, 7, '#f4fbff', 0.85, { fix: 'panel' }); b.light(15, 12, 7, '#f4fbff', 0.85, { fix: 'panel' });
      b.win(1, 15.5, 7, 16); b.win(13, 15.5, 19, 16); b.win(0, 1, 0.5, 7); b.win(19.5, 1, 20, 7);
    },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
