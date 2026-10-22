// Food, drink & nightlife building themes: restaurant, pizzeria, sushi bar, cafe, burger joint, sports pub,
// karaoke bar and bakery. Registered through X.interiors.define (see interiors.js, "themes from other modules").
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta; if (!X || !X.interiors || !X.interiors.define) return;
  const D = X.interiors.define, K0 = X.interiors.kit;
  const PI = Math.PI, UP = -PI / 2, DN = PI / 2;

  // ---- shared helpers ----
  const staff = (sc, K, role, look) => sc.peds.find(p => K.mine(p) && !p.dead && !p.removed && p.ai.role === role && (!look || p.ai.sp.look === look));
  const pay = (K, n, why) => { if (K.P.money < n) { K.popup('Not enough money'); K.sfx('deny'); return false; } K.money(-n, why, K.P.ped.x, K.P.ped.y); return true; };
  const hp = (K, n) => { const p = K.P.ped; p.hp = Math.min(p.maxHp, p.hp + n); };
  const tip = (sc, K, role, look, lines) => {
    const s = staff(sc, K, role, look); if (!s) { K.popup('Nobody here to tip'); return; }
    if (!pay(K, 5, 'tip')) return;
    K.say(s, K.pick(lines), '#7dff9a'); K.sfx('cash');
  };
  // Pick a fight with the nearest drinker; the others may join in.
  const fight = (sc, K, opener) => {
    const P = K.P.ped; let best = null, bd = 1e9;
    for (const p of sc.peds) if (K.mine(p) && !p.dead && (p.ai.role === 'drinker' || p.ai.role === 'drunk' || p.ai.role === 'sitter')) { const d = Math.hypot(p.x - P.x, p.y - P.y); if (d < bd) { bd = d; best = p; } }
    if (!best) { K.popup('Nobody wants to fight you. Sad.'); return; }
    K.say(best, opener || K.pick(['WHAT DID YOU SAY ABOUT MY MOTHER?', 'OUTSIDE. NOW. ACTUALLY, HERE.', 'YOU SPILLED MY PILS!']), '#ffd23a');
    K.sfx('punch'); K.provoke(sc, best);
    for (const p of sc.peds) if (p !== best && K.mine(p) && !p.dead && (p.ai.role === 'drinker' || p.ai.role === 'bouncer') && Math.random() < 0.5) K.provoke(sc, p);
  };
  const chatter = (sc, K, dt, role, lines, every) => {
    sc.st.chT = (sc.st.chT == null ? 3 : sc.st.chT) - dt;
    if (sc.st.chT > 0) return; sc.st.chT = K.rand(every || 6, (every || 6) * 2);
    const c = sc.peds.filter(p => K.mine(p) && !p.dead && (!role || role.includes(p.ai.role)) && p.ai.st === 'idle');
    if (c.length) K.say(K.pick(c), K.pick(lines));
  };
  const tablesFor = (b, K, x, y, o) => {   // a small round table with 2 chairs and maybe diners
    b.f('table', x, y, 1.2, 1.2, Object.assign({ solid: 'low', round: 1, c: '#d9d2c3', plates: 1 }, o.t));
    b.f('chair', x - 0.95, y, 0.5, 0.5, { rot: 0, c: o.chair }); b.f('chair', x + 0.95, y, 0.5, 0.5, { rot: PI, c: o.chair });
    b.ped('sitter', x - 0.95, y, 0, { chance: o.ch == null ? 0.6 : o.ch, look: o.look }); b.ped('sitter', x + 0.95, y, PI, { chance: (o.ch == null ? 0.6 : o.ch) * 0.7, look: o.look });
  };

  // ================= Restaurant (fine dining) =================
  D('restaurant', {
    size: [26, 20], weight: 2, minSide: 16,
    names: ['Restaurant Fjordlys', 'Chez Artur', 'Le Brunost', 'Bussby Bistro', 'Kjøttkake Royale'],
    greet: ['Bonsoir. Do you have a reservation?', 'Table for one? How... brave.', 'Welcome to the finest kjøttkaker in Bussby.'],
    style: { w: 2.0, door: '#2a1c18', frame: '#d4af37', plate: '#1a1410', text: '#f2d27a', light: '#ffe2a0', awning: ['#5b1a22', '#f2e8d0'] },
    looks: {
      maitre: () => ({ outfit: 'suit', shirt: '#111216', pants: '#111216', tie: '#d4af37', hat: null, hairStyle: 'short' }),
      waiter: () => ({ shirt: '#f4f4f4', jacket: '#1b1f27', pants: '#1b1f27', tie: '#1b1f27', hat: null }),
      posh: (b, K) => ({ outfit: 'suit', shirt: K.pick(K.SUIT), pants: '#1b1f27', tie: K.pick(K.TIE), hat: null }),
    },
    furn: {
      fd_candle(c, f, hw, hh, t) { const k = 0.8 + 0.2 * Math.sin(t * 9 + f.seed * 5); disc(c, 0, 0, hw * 1.8 * k, 'rgba(255,190,90,0.18)'); disc(c, 0, 0, hw * 0.5, '#f2ead8'); disc(c, 0, 0, hw * 0.25 * k, '#ffcf5a'); },
      fd_lectern(c, f, hw, hh) { sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.08, '#3a2418'); rect(c, -hw + 0.1, -hh + 0.1, 2 * hw - 0.2, 2 * hh - 0.2, '#f2ead8'); for (let i = 0; i < 4; i++) rect(c, -hw + 0.18, -hh + 0.2 + i * 0.12, 2 * hw - 0.5, 0.03, '#5a4a3a'); },
      fd_wine(c, f, hw, hh) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#3a2418'); const n = Math.floor(2 * hw / 0.22); for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { disc(c, -hw + 0.14 + i * 0.22, -hh * 0.5 + j * hh, 0.08, ['#5a1020', '#2a4a1a', '#c9b060'][(i + j) % 3]); } },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 24, ambient: 0.45, wallTop: '#4a2028', wallLo: '#2a1016', wallHi: '#8a5a50' });
      b.room(0, 6, 26, 20, 'carpet', '#5b1a22', '#3f1218'); b.room(0, 0, 26, 6, 'tile', '#e2e2dc', '#bdbdb4');
      b.box(); b.entrance(13, 2.4);
      b.hwall(6, 0.25, 25.75, [[6, 1.8], [20, 1.8]]);
      // kitchen
      b.f('grill', 9, 1.1, 4, 1.0, { solid: 'low' }); b.f('kcounter', 15, 1.1, 3.4, 1.0, { solid: 'low' }); b.f('sink', 3, 1.1, 1.4, 0.8, { solid: 'low' }); b.f('fridge1', 24.4, 1.4, 1.4, 1.4, { solid: 'tall' });
      b.f('kcounter', 13, 4, 6, 1.0, { solid: 'low' });
      b.ped('clerk', 9, 2.4, UP, { look: 'chef' }); b.ped('worker', 15, 2.4, UP, { look: 'chef', chance: 0.8 });
      b.zone(0.3, 0.3, 25.7, 5.8, 'staff');
      // the maître d' and his book
      b.f('fd_lectern', 16.6, 16.8, 1.0, 0.7, { solid: 'low' }); b.ped('clerk', 16.6, 15.8, DN, { look: 'maitre' });
      b.act(15.2, 17.2, 1.4, () => 'F: Slip the maître d\' $20 for a good table', () => {
        const m = staff(sc, K, 'clerk', 'maitre'); if (!m) return; if (!pay(K, 20, 'bribe')) return;
        K.say(m, K.pick(['AH, MONSIEUR! YOUR USUAL TABLE.', 'I HAVE NEVER SEEN YOU BEFORE. WELCOME BACK.', 'ARTUR\'S TABLE IS FREE. DO NOT TOUCH THE NAPKINS.']), '#7dff9a'); K.sfx('cash');
      });
      b.f('rug', 13, 12.6, 8, 6, { c: '#7a2a32', c2: '#d4af37', layer: 0 });
      for (const [x, y] of [[4, 9], [4, 14], [9, 9], [17, 9], [22, 9], [22, 14]]) {
        tablesFor(b, K, x, y, { t: { c: '#f2ead8' }, chair: '#3a2418', look: 'posh', ch: 0.65 });
        b.f('fd_candle', x, y - 0.3, 0.16, 0.16);
        b.light(x, y, 3.2, '#ffb860', 0.65, { fix: 'pendant' });
      }
      b.f('table', 13, 12.5, 3.6, 1.4, { solid: 'low', c: '#f2ead8', plates: 1 });
      for (const dx of [-1.2, 0, 1.2]) { b.f('chair', 13 + dx, 11.4, 0.5, 0.5, { rot: DN, c: '#3a2418' }); b.f('chair', 13 + dx, 13.6, 0.5, 0.5, { rot: UP, c: '#3a2418' }); }
      b.ped('sitter', 11.8, 11.4, DN, { look: 'posh', chance: 0.7 }); b.ped('sitter', 14.2, 13.6, UP, { look: 'posh', chance: 0.6 });
      b.f('fd_candle', 12.4, 12.5, 0.16, 0.16); b.f('fd_candle', 13.6, 12.5, 0.16, 0.16);
      b.ped('customer', 8, 12, 0, { look: 'waiter', wander: true }); b.ped('customer', 19, 12, PI, { look: 'waiter', wander: true, chance: 0.8 });
      b.f('fd_wine', 0.75, 12, 0.6, 5, { solid: 'tall', layer: 2 }); b.f('plant', 1.2, 18.6, 1, 1, { solid: 'low' }); b.f('plant', 24.8, 18.6, 1, 1, { solid: 'low' });
      b.f('portrait', 25.2, 15, 0.35, 1.2, { layer: 2, text: 'FOUNDER' });
      b.act(13, 15, 1.8, () => 'F: Order the tasting menu ($60, full health)', () => {
        if (!pay(K, 60, 'food')) return; hp(K, 999); K.sfx('chime');
        K.popup(K.pick(['Seven courses of kjøttkake foam. Exquisite.', 'Deconstructed lefse on a slate. You are still hungry, but healed.', 'Brunost three ways. The fourth way is illegal.']));
      });
      b.act(21, 4.1, 1.4, () => 'F: Complain to the chef', () => {
        const ch = staff(sc, K, 'clerk', 'chef');
        if (!ch) return;
        if (Math.random() < 0.4) { K.say(ch, 'TOO SALTY?! I WILL SHOW YOU SALTY!', '#ff6a4a'); ch.ai.role = 'owner'; K.provoke(sc, ch); }
        else K.say(ch, K.pick(['IT IS SUPPOSED TO BE COLD. IT IS ART.', 'THE PØLSE IS ARTISANAL.', 'GET OUT OF MY KITCHEN!']), '#ffd23a');
      });
      b.act(4, 17.5, 1.4, () => 'F: Tip the staff ($5)', () => tip(sc, K, 'customer', 'waiter', ['MERCI!', 'TUSEN TAKK!', 'NOW I CAN AFFORD A BUS TICKET.']));
      for (const q of [[6, 11.5, 0], [19, 11.5, PI], [13, 9, DN], [9, 16, UP]]) b.browse(q[0], q[1], q[2]);
      b.light(13, 3, 7, '#f6fbff', 0.8, { fix: 'panel' }); b.light(13, 13, 12, '#ffb070', 0.3);
      b.win(0, 8, 0.5, 18); b.win(25.5, 8, 26, 13); b.win(2, 19.5, 10, 20); b.win(16, 19.5, 24, 20);
    },
    tick(sc, dt, t, K) { chatter(sc, K, dt, ['sitter'], ['Exquisite.', 'Is this... brunost foam?', 'I can taste the fjord.', 'My portion is the size of a bus ticket.', 'Darling, the wine is from Bussby.'], 7); },
  });

  // ================= Pizzeria =================
  D('pizzeria', {
    size: [20, 16], weight: 2, minSide: 0,
    names: ['Pizza Pølsa', 'Mamma Brunost', 'Napoli of Bussby', 'Grandiosa Grande', 'Luigi & Leif'],
    greet: ['Ciao! Pizza with taco topping?', 'Benvenuto! Pineapple is extra.', 'We deliver. Sometimes.'],
    style: { w: 1.8, door: '#3a2016', frame: '#2f8a3e', plate: '#f2ead8', text: '#c0392b', light: '#ffd9a0', awning: ['#c0392b', '#f2f2f2'] },
    looks: {
      pizzaiolo: () => ({ shirt: '#ffffff', pants: '#3a3f46', hat: '#ffffff', hatType: 'beanie', hairStyle: 'short' }),
      delivery: () => ({ shirt: '#c0392b', pants: '#2b2d33', hat: '#c0392b', hatType: 'cap' }),
    },
    furn: {
      fd_oven(c, f, hw, hh, t) {
        sh(c, hw, hh, 0.35); disc(c, 0, 0, hw, '#8a4a2e'); disc(c, 0, 0, hw * 0.85, '#a85a38');
        for (let i = 0; i < 10; i++) { const a = i / 10 * K0.TAU; rect(c, Math.cos(a) * hw * 0.78 - 0.06, Math.sin(a) * hw * 0.78 - 0.04, 0.12, 0.08, '#6a3420'); }
        disc(c, 0, hh * 0.35, hw * 0.45, '#1b1010'); const k = 0.7 + 0.3 * Math.sin(t * 7 + Math.sin(t * 3));
        disc(c, 0, hh * 0.4, hw * 0.35 * k, 'rgba(255,120,30,0.85)'); disc(c, 0, hh * 0.42, hw * 0.18 * k, 'rgba(255,220,90,0.9)');
      },
      fd_pizza(c, f, hw) { disc(c, 0, 0, hw, '#d9a441'); disc(c, 0, 0, hw * 0.85, '#c0392b'); for (let i = 0; i < 6; i++) { const a = i + f.seed * 6; disc(c, Math.cos(a) * hw * 0.5, Math.sin(a) * hw * 0.5, hw * 0.14, i % 2 ? '#f2e2a0' : '#7a2a1a'); } ln(c, -hw, 0, hw, 0, 'rgba(0,0,0,0.25)', 0.02); ln(c, 0, -hw, 0, hw, 'rgba(0,0,0,0.25)', 0.02); },
      fd_boxes(c, f, hw, hh) { sh(c, hw, hh, 0.25); for (let i = 0; i < 3; i++) { rect(c, -hw + i * 0.06, -hh + i * 0.06, 2 * hw - 0.12, 2 * hh - 0.12, i % 2 ? '#e8d4a8' : '#d9c090'); } wtext(c, 'PIZZA', 0, 0.05, 0.18, '#c0392b', 800); },
      fd_scooter(c, f, hw, hh) { sh(c, hw, hh, 0.3); rr(c, -hw, -hh * 0.6, 2 * hw, hh * 1.2, 0.2, '#c0392b'); disc(c, -hw + 0.2, 0, 0.2, '#151515'); disc(c, hw - 0.2, 0, 0.2, '#151515'); rect(c, -0.3, -hh, 0.6, 2 * hh, '#e8d4a8'); },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 21, ambient: 0.75, wallTop: '#5a3a24', wallLo: '#3a2414', wallHi: '#c08a5a' });
      b.room(0, 5.5, 20, 16, 'check', '#f2ead8', '#c0392b'); b.room(0, 0, 20, 5.5, 'tile', '#e8e0cc', '#c9bfa8');
      b.box(); b.entrance(12, 2.2);
      b.f('fd_oven', 3, 2.2, 3.2, 3.2, { solid: 'tall' }); b.light(3, 2.6, 4, '#ff8a3a', 0.9);
      b.f('kcounter', 9, 1.0, 5, 1.0, { solid: 'low' }); b.f('fridge1', 18.4, 1.3, 1.4, 1.4, { solid: 'tall' });
      b.f('counter', 11, 5.4, 12, 1.2, { solid: 'low', c: '#2f8a3e', top: '#f2ead8' });
      b.f('register', 15.5, 5.25, 0.6, 0.5); b.f('fd_pizza', 9, 5.35, 0.45, 0.45); b.f('fd_pizza', 10.4, 5.35, 0.45, 0.45); b.f('fd_pizza', 7.6, 5.35, 0.45, 0.45);
      b.f('fd_boxes', 13.2, 5.35, 0.8, 0.8);
      b.wall(0, 5.15, 2.5, 5.65); b.wall(17, 5.15, 19.75, 5.65);
      b.ped('clerk', 5.6, 2.8, PI, { look: 'pizzaiolo' }); b.ped('cashier', 15.5, 4.3, DN, { look: 'pizzaiolo', rob: [80, 260] });
      b.zone(0.3, 0.3, 19.7, 4.9, 'staff');
      for (const [x, y] of [[3.5, 9], [3.5, 13], [8.5, 11.5], [16.5, 9], [16.5, 13]]) tablesFor(b, K, x, y, { t: { c: '#f2f2f2', plates: 1 }, chair: '#2f8a3e', ch: 0.55 });
      b.f('fd_scooter', 18.4, 14.2, 1.6, 0.8, { solid: 'low' }); b.ped('customer', 17.2, 11.2, DN, { look: 'delivery', chance: 0.8 });
      b.f('poster', 6, 0.35, 2.6, 0.4, { layer: 2, kind: 'bus' }); b.f('neon', 4, 15.45, 3.2, 0.7, { text: 'PIZZA', c: '#ff5a3a', layer: 2 });
      b.f('plant', 1, 15, 0.9, 0.9, { solid: 'low' });
      b.act(11, 6.7, 1.6, () => 'F: Buy a slice of Grandiosa ($8, +25 hp)', () => K.buyFood(8, 25, 'Frozen pizza, heated with love. Norway\'s national dish.'));
      b.act(13.2, 6.7, 1.2, () => 'F: Pizza with taco topping ($14, +45 hp)', () => K.buyFood(14, 45, 'Pizza with taco topping and banana. Luigi wept.'));
      b.act(17.2, 12.6, 1.3, () => 'F: Ask the delivery guy for a job', () => {
        const d = staff(sc, K, 'customer', 'delivery'); if (!d) return;
        if (sc.st.deliv) { K.say(d, 'YOU ALREADY HAVE THE ONE. GO.'); return; }
        sc.st.deliv = 1; K.money(25, 'delivery', K.P.ped.x, K.P.ped.y); K.sfx('cash');
        K.say(d, K.pick(['HERE IS $25. DELIVER IT TO... I FORGOT. JUST EAT IT.', 'TAKE MY SHIFT. MY SCOOTER IS ALSO STOLEN.']), '#7dff9a');
      });
      for (const q of [[10, 7.5, UP], [6, 9.5, 0], [12, 13, PI]]) b.browse(q[0], q[1], q[2]);
      for (const q of [[5, 11], [12, 9], [12, 13.5]]) b.light(q[0], q[1], 6, '#ffd9a0', 0.75, { fix: 'pendant' });
      b.light(11, 2.5, 6, '#fff4dc', 0.7, { fix: 'panel' });
      b.win(0, 7, 0.5, 15); b.win(1, 15.5, 8, 16); b.win(15, 15.5, 19, 16);
    },
    tick(sc, dt, t, K) { chatter(sc, K, dt, ['clerk', 'sitter'], ['MAMMA MIA!', 'Is ketchup on pizza allowed here?', 'Ekstra ost, takk!', 'Who ordered the brunost calzone?', 'The oven is 400 degrees. Like Bussby in July.'], 6); },
  });

  // ================= Sushi bar =================
  D('sushi', {
    size: [20, 16], weight: 1.5, minSide: 0,
    names: ['Sushi Fjord', 'Laks & Ris', 'Bussby Sushi Train', 'Oslo Maki', 'Kaiten Kjell'],
    greet: ['Irasshaimase! The salmon is Norwegian, of course.', 'Welcome! Grab plates as they pass.', 'Konnichiwa. Shoes on, it is Bussby.'],
    style: { w: 1.8, door: '#1b1b1f', frame: '#c0392b', plate: '#f2ead8', text: '#1b1b1f', light: '#ffe8c0', neon: '#ff4a4a', awning: ['#c0392b', '#1b1b1f'] },
    looks: {
      itamae: () => ({ shirt: '#f4f4f4', pants: '#1b1f27', hat: '#1b1f27', hatType: 'beanie', hairStyle: 'buzz' }),
      host: () => ({ shirt: '#c0392b', pants: '#1b1f27', hat: null, hairStyle: 'bun' }),
    },
    furn: {
      // An oval conveyor loop with plates riding round it.
      fd_belt(c, f, hw, hh, t) {
        sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, hh, '#5a5f68'); rr(c, -hw + 0.12, -hh + 0.12, 2 * hw - 0.24, 2 * hh - 0.24, hh - 0.12, '#9aa1a9');
        rr(c, -hw + 0.5, -hh + 0.5, 2 * hw - 1, 2 * hh - 1, Math.max(0.1, hh - 0.5), '#e9e4d8');
        const r = hh - 0.31, sx = hw - hh, L = 4 * sx + 2 * PI * r, n = Math.floor(L / 0.7), cols = ['#ff8a5a', '#f2f2f2', '#3e8e5a', '#c0392b', '#f2c230'];
        for (let i = 0; i < n; i++) {
          let s = ((i * L / n + t * 0.8) % L), x, y;
          if (s < 2 * sx) { x = -sx + s; y = -r; } else if ((s -= 2 * sx) < PI * r) { const a = -DN + s / r; x = sx + Math.cos(a) * r; y = Math.sin(a) * r; }
          else if ((s -= PI * r) < 2 * sx) { x = sx - s; y = r; } else { s -= 2 * sx; const a = DN + s / r; x = -sx + Math.cos(a) * r; y = Math.sin(a) * r; }
          disc(c, x, y, 0.16, i % 3 ? '#f4f4f4' : '#2f6fb5'); disc(c, x, y, 0.08, cols[i % 5]); if (i % 2) disc(c, x, y, 0.035, '#1b1b1f');
        }
      },
      fd_lantern(c, f, hw, hh, t) { const k = 0.85 + 0.15 * Math.sin(t * 2 + f.seed * 4); oval(c, 0, 0, hw * 1.6 * k, hh * 1.6 * k, 0, 'rgba(255,80,60,0.15)'); oval(c, 0, 0, hw, hh, 0, '#d63a2a'); rect(c, -hw * 0.7, -0.02, hw * 1.4, 0.04, '#7a1a12'); rect(c, -0.05, -hh - 0.04, 0.1, 0.08, '#1b1b1f'); },
      fd_tatami(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c9c08a'); c.strokeStyle = '#2f4a2a'; c.lineWidth = 0.06; c.strokeRect(-hw + 0.03, -hh + 0.03, 2 * hw - 0.06, 2 * hh - 0.06); for (let x = -hw + 0.2; x < hw; x += 0.2) rect(c, x, -hh + 0.06, 0.01, 2 * hh - 0.12, 'rgba(0,0,0,0.08)'); },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 21, ambient: 0.7, wallTop: '#2a2a30', wallLo: '#16161a', wallHi: '#7a6a5a' });
      b.room(0, 0, 20, 16, 'wood', '#b89a6a', '#9a7e52');
      b.box(); b.entrance(10, 2.2);
      sc.st.belt = b.f('fd_belt', 9, 6, 11, 3.4, { solid: 'low' });
      b.ped('clerk', 9, 6, 0, { look: 'itamae' }); b.ped('worker', 6.5, 6, PI, { look: 'itamae', chance: 0.6 });
      b.zone(4.7, 5.0, 13.3, 7.0, 'staff');
      for (let x = 4; x <= 14; x += 1.25) { b.f('stool', x, 3.65, 0.5, 0.5, { c: '#1b1b1f' }); b.f('stool', x, 8.35, 0.5, 0.5, { c: '#1b1b1f' }); }
      for (const x of [4, 6.5, 10.25, 12.75]) b.ped('sitter', x, 3.65, DN, { chance: 0.55 });
      for (const x of [5.25, 7.75, 11.5, 14]) b.ped('sitter', x, 8.35, UP, { chance: 0.5 });
      for (const y of [11, 14]) {
        b.f('fd_tatami', 17, y, 4, 2.4, { layer: 0 }); b.f('table', 17, y, 1.8, 0.9, { solid: 'low', c: '#3a2418', mugs: 1 });
        b.ped('sitter', 16.5, y - 0.9, DN, { chance: 0.5 }); b.ped('sitter', 17.5, y + 0.9, UP, { chance: 0.4 });
      }
      b.f('counter', 3.2, 12.5, 1.2, 3, { solid: 'low', c: '#1b1b1f', top: '#c0392b' }); b.f('register', 3.2, 12.0, 0.6, 0.5);
      b.ped('cashier', 1.6, 12.5, 0, { look: 'host', rob: [100, 300] });
      b.f('fridge', 9, 0.95, 8, 0.9, { solid: 'tall', fragile: true });
      b.f('plant', 1, 1, 0.9, 0.9, { solid: 'low' }); b.f('plant', 19, 1, 0.9, 0.9, { solid: 'low' });
      b.f('neon', 9, 15.45, 3.4, 0.7, { text: 'SUSHI 寿司', c: '#ff4a4a', layer: 2 });
      for (const [x, y] of [[4, 2.2], [9, 2.2], [14, 2.2], [17, 9]]) { b.f('fd_lantern', x, y, 0.35, 0.45, { layer: 3 }); b.light(x, y, 4, '#ff9a7a', 0.6); }
      b.act(9, 9.3, 1.8, () => 'F: Grab a plate off the belt ($6, +15 hp)', () => K.buyFood(6, 15, K.pick(['Norwegian salmon. It swam all the way here.', 'Brunost nigiri. Do not tell Japan.', 'A pølse maki. Bussby fusion.'])));
      b.act(9, 2.7, 1.8, () => 'F: Order the Fjord Platter ($22, +60 hp)', () => K.buyFood(22, 60, '40 pieces of laks. You can now speak whale.'));
      b.act(4.6, 12.5, 1.3, () => 'F: Wasabi challenge ($5 bet)', () => {
        if (!pay(K, 5, 'bet')) return;
        if (Math.random() < 0.45) { K.money(20, 'bet', K.P.ped.x, K.P.ped.y); K.sfx('cash'); K.popup('You ate a whole spoon. Respect. +$20'); }
        else { K.P.ped.hp = Math.max(5, K.P.ped.hp - 10); K.sfx('deny'); K.popup('Your nose is on fire. -10 hp. Uff da.'); }
      });
      for (const q of [[6, 2.4, DN], [12, 9.6, UP], [15, 12.5, 0]]) b.browse(q[0], q[1], q[2]);
      b.light(9, 6, 7, '#fff4dc', 0.8, { fix: 'panel' });
      b.win(0, 4, 0.5, 10); b.win(1, 15.5, 6, 16); b.win(13, 15.5, 19, 16);
    },
    tick(sc, dt, t, K) { chatter(sc, K, dt, ['sitter', 'clerk'], ['Itadakimasu!', 'The salmon is from Lofoten.', 'Who took my plate?!', 'Is the green thing guacamole?', 'Oishii... nesten like lutefisk.'], 7); },
  });

  // ================= Cafe =================
  D('cafe', {
    size: [18, 14], weight: 2.5, minSide: 0,
    names: ['Kaffebrenneriet Bussby', 'Java & Vafler', 'Café Koselig', 'Kaffe Kjell', 'Kanelbollen'],
    greet: ['Hei! Oat milk latte?', 'Welcome to the coziest cafe in Bussby.', 'Wi-Fi password is "takkforsist".'],
    style: { w: 1.6, door: '#3a2a1a', frame: '#7a5a3a', plate: '#2a3a2a', text: '#f2e2c8', light: '#ffe2a0', awning: ['#2f5a3a', '#f2e2c8'] },
    looks: {
      barista: () => ({ shirt: '#3a3f46', jacket: null, pants: '#1b1f27', hat: '#5a3a22', hatType: 'beanie', hairStyle: 'long', acc: null }),
      hipster: (b, K) => ({ shirt: K.pick(['#c98a4a', '#5a7a5a', '#8a5a7a', '#d9c9a8']), pants: '#2b3a55', hat: K.pick([null, '#a83a2a']), hatType: 'beanie' }),
    },
    furn: {
      fd_espresso(c, f, hw, hh, t) { sh(c, hw, hh, 0.3); rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.08, '#c9ccd1'); rect(c, -hw + 0.1, -hh + 0.08, 2 * hw - 0.2, 0.2, '#2b2d33'); for (let i = 0; i < 2; i++) { disc(c, -hw * 0.45 + i * hw * 0.9, 0.1, 0.12, '#1b1b1f'); } disc(c, 0, hh - 0.15, 0.05, Math.sin(t * 4) > 0 ? '#3fdc6a' : '#1a5a2a'); if (Math.random() < 0.03) PG.burst(f.x, f.y, 'smoke', 1, 0.3, 0.8, 0.2); },
      fd_laptop(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9aa0a8'); rect(c, -hw + 0.03, -hh + 0.03, 2 * hw - 0.06, hh - 0.04, Math.sin(t * 0.7 + f.seed * 9) > 0 ? '#5ab0e8' : '#e8f4ff'); disc(c, 0, -hh * 0.5, 0.03, '#fff'); },
      fd_cakes(c, f, hw, hh) { rr(c, -hw, -hh, 2 * hw, 2 * hh, 0.08, 'rgba(220,240,255,0.55)'); const n = Math.max(2, Math.floor(hw / 0.25)); for (let i = 0; i < n; i++) { const x = -hw + 0.25 + i * (2 * hw - 0.5) / (n - 1); disc(c, x, 0, 0.16, ['#c98a4a', '#f2e2c8', '#6b3a1e', '#e86aa0'][i % 4]); disc(c, x, -0.04, 0.06, i % 2 ? '#fff6d8' : '#a85a30'); } },
      fd_menu(c, f, hw, hh) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1b1f1b'); wtext(c, 'KAFFE  $4', 0, -hh * 0.4, hh * 0.55, '#f2e2c8', 700); wtext(c, 'VAFLER $6', 0, hh * 0.45, hh * 0.55, '#f2e2c8', 700); },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 19, ambient: 0.85, wallTop: '#4a3a2a', wallLo: '#2a2016', wallHi: '#a88a6a' });
      b.room(0, 0, 18, 14, 'wood', '#a8845a', '#8a6a44');
      b.box(); b.entrance(13, 2.2);
      b.f('counter', 6, 3.4, 9, 1.2, { solid: 'low', c: '#3a2a1a', top: '#d9c9a8' });
      b.f('fd_espresso', 3.4, 1.0, 1.6, 0.9, { solid: 'low' }); b.f('kcounter', 7.8, 1.0, 4, 0.9, { solid: 'low' }); b.f('fd_menu', 6, 0.35, 3, 0.5, { layer: 2 });
      b.f('fd_cakes', 7.4, 3.3, 2.4, 0.7); b.f('register', 9.6, 3.25, 0.6, 0.5);
      b.wall(10.5, 3.15, 11.5, 3.65);
      b.ped('cashier', 9.6, 2.2, DN, { look: 'barista', rob: [60, 200] }); b.ped('clerk', 3.6, 2.1, UP, { look: 'barista', chance: 0.7 });
      b.zone(0.3, 0.3, 11.5, 2.8, 'staff');
      for (const [x, y] of [[3, 7], [3, 11], [8, 9]]) {
        b.f('table', x, y, 1.2, 1.2, { solid: 'low', round: 1, c: '#e9e4d8', mugs: 1 }); b.f('chair', x - 0.95, y, 0.5, 0.5, { rot: 0, c: '#5a3a22' }); b.f('chair', x + 0.95, y, 0.5, 0.5, { rot: PI, c: '#5a3a22' });
        b.f('fd_laptop', x - 0.25, y + 0.1, 0.4, 0.3); b.ped('sitter', x - 0.95, y, 0, { look: 'hipster', chance: 0.75 }); b.ped('sitter', x + 0.95, y, PI, { look: 'hipster', chance: 0.4 });
      }
      b.f('sofa', 16.6, 7.5, 1.1, 4, { solid: 'low', c: '#7a3b2e', back: 'e' }); b.f('table', 14.9, 7.5, 0.9, 1.8, { solid: 'low', c: '#5a3a22', mugs: 1 });
      b.ped('sitter', 16.4, 6.6, PI, { look: 'hipster', chance: 0.6 }); b.ped('sitter', 16.4, 8.4, PI, { look: 'hipster', chance: 0.4 });
      b.f('rug', 15.2, 7.5, 3.4, 4.8, { c: '#5a7a5a', c2: '#d9c9a8', layer: 0 });
      b.f('bookshelf', 17.3, 2, 0.6, 2.6, { solid: 'tall' }); b.f('plant', 1, 13, 0.9, 0.9, { solid: 'low' }); b.f('plant', 17, 12.9, 0.9, 0.9, { solid: 'low' });
      b.act(6, 4.6, 1.6, () => 'F: Buy kaffe ($4, +10 hp)', () => { if (!pay(K, 4, 'coffee')) return; hp(K, 10); K.sfx('glug'); K.popup(K.pick(['Svart kaffe. Strong enough to drive a bus.', 'Oat milk flat white. You feel like a podcast.', 'Kaffe nummer 7 today. Your hands are vibrating.'])); });
      b.act(8.4, 4.6, 1.2, () => 'F: Vafler med brunost ($6, +20 hp)', () => K.buyFood(6, 20, 'Heart-shaped waffle with brunost. Koselig!'));
      b.act(10.6, 4.6, 1.0, () => 'F: Tip jar ($5)', () => tip(sc, K, 'cashier', null, ['TUSEN TAKK!', 'NOW I CAN PAY RENT IN BUSSBY. FOR ONE DAY.', 'YOU ARE MY FAVOURITE CUSTOMER TODAY.']));
      b.act(8, 10.6, 1.2, () => 'F: Peek at a laptop', () => K.popup(K.pick(['Someone is writing a novel called "The Bus".', 'A startup pitch: "Uber, but for buses".', 'Their spreadsheet is titled ARTUR - DEBTS.', 'They are watching a 10 hour video of a fireplace.'])));
      for (const q of [[5, 5.2, UP], [12, 6, 0], [12, 11, PI]]) b.browse(q[0], q[1], q[2]);
      for (const q of [[3, 7], [3, 11], [8, 9], [15, 7.5]]) b.light(q[0], q[1], 4.5, '#ffcf8a', 0.7, { fix: 'pendant' });
      b.light(6, 2, 5, '#fff4dc', 0.7, { fix: 'panel' });
      b.win(0, 5, 0.5, 13); b.win(1, 13.5, 10, 14);
    },
    tick(sc, dt, t, K) { chatter(sc, K, dt, ['sitter', 'cashier'], ['I only drink single origin.', 'Name for the cup? ...Bjørn? Bjørn!', 'Is this oat milk gluten free?', 'I am basically a freelancer.', 'Koselig!'], 6); },
  });

  // ================= Burger joint / fast food =================
  D('burger', {
    size: [22, 16], weight: 2, minSide: 0,
    names: ['Big Bus Burger', 'Burger Fjell', 'McViking', 'Kjøttkake King', 'Drive-Thru Dag'],
    greet: ['Welcome to Big Bus Burger, may I take your order?', 'Would you like fries with that?', 'Order at the counter. Do not touch the fryer.'],
    style: { w: 2.0, door: '#2b2d33', frame: '#f2c230', plate: '#c0392b', text: '#f2c230', light: '#fff4dc', neon: '#f2c230', awning: ['#f2c230', '#c0392b'] },
    looks: {
      crew: () => ({ shirt: '#c0392b', pants: '#2b2d33', hat: '#f2c230', hatType: 'cap' }),
      manager: () => ({ shirt: '#f2f2f2', pants: '#2b2d33', tie: '#c0392b', hat: null, scale: 1.08 }),
    },
    furn: {
      fd_fryer(c, f, hw, hh, t) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#9aa0a8'); for (let i = 0; i < 2; i++) { const x = -hw * 0.5 + i * hw; rect(c, x - hw * 0.4, -hh + 0.12, hw * 0.8, 2 * hh - 0.24, '#c9a030'); for (let k = 0; k < 4; k++) disc(c, x + Math.sin(t * 11 + k * 2 + i) * hw * 0.25, -hh * 0.3 + k * hh * 0.25, 0.04, 'rgba(255,240,180,0.8)'); } },
      fd_burgersign(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#1b1b1f'); const x = -hw + 0.4; oval(c, x, -0.12, 0.25, 0.13, 0, '#d9a441'); rect(c, x - 0.25, -0.04, 0.5, 0.08, '#6b3a1e'); rect(c, x - 0.24, 0.04, 0.48, 0.04, '#3e8e5a'); oval(c, x, 0.12, 0.25, 0.07, 0, '#d9a441'); wtext(c, f.text || 'MENU', 0.3, 0, hh * 0.9, '#f2c230', 800); },
      fd_window(c, f, hw, hh, t) { rect(c, -hw, -hh, 2 * hw, 2 * hh, 'rgba(190,225,245,0.7)'); rect(c, -hw, -hh, 2 * hw, 0.06, '#f2c230'); wtext(c, 'DRIVE-THRU', 0, 0, Math.min(hw, hh) * 0.6, '#c0392b', 800); },
      fd_queue(c, f, hw, hh) { for (let y = -hh; y <= hh; y += 0.5) disc(c, 0, y, 0.05, '#c9a030'); ln(c, 0, -hh, 0, hh, '#c0392b', 0.04); },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 22, ambient: 1.0, wallTop: '#c0392b', wallLo: '#7a1a12', wallHi: '#f2c230' });
      b.room(0, 5.5, 22, 16, 'tile', '#f2f2ec', '#d9d4c4'); b.room(0, 0, 22, 5.5, 'tile', '#c9ccd1', '#a9aeb6');
      b.box(); b.entrance(11, 2.6);
      b.f('fd_fryer', 3, 1.0, 2.4, 1.0, { solid: 'low' }); b.f('grill', 8, 1.0, 4, 1.0, { solid: 'low' }); b.f('kcounter', 13.5, 1.0, 4, 1.0, { solid: 'low' });
      b.f('fd_window', 21.7, 2.8, 0.35, 2.2, { layer: 2 }); b.ped('worker', 20.6, 2.8, 0, { look: 'crew', chance: 0.8 });
      b.f('counter', 10, 5.5, 14, 1.2, { solid: 'low', c: '#c0392b', top: '#f2f2ec' });
      b.wall(0, 5.25, 2.8, 5.75); b.wall(17.2, 5.25, 21.75, 5.75, 'glass');
      for (const x of [6, 10, 14]) b.f('register', x, 5.35, 0.6, 0.5);
      b.ped('cashier', 6, 4.4, DN, { look: 'crew', rob: [80, 280] }); b.ped('cashier', 10, 4.4, DN, { look: 'crew', rob: [80, 280], chance: 0.8 });
      b.ped('clerk', 8, 2.3, UP, { look: 'crew' }); b.ped('clerk', 3, 2.3, UP, { look: 'crew', chance: 0.7 }); b.ped('owner', 14, 3.0, DN, { look: 'manager', chance: 0.7 });
      b.zone(0.3, 0.3, 21.7, 4.9, 'staff');
      for (const x of [5, 9]) b.f('fd_queue', x + 2, 7.8, 0.12, 2.6);
      for (const q of [[6, 7, UP], [6, 8.3, UP], [10, 7, UP], [10, 8.3, UP]]) b.ped('customer', q[0], q[1], q[2], { chance: 0.6 });
      for (const [x, y] of [[2.6, 11], [2.6, 14.4], [19.4, 11], [19.4, 14.4]]) { b.f('bench', x, y - 1, 3, 0.65, { solid: 'low', c: '#f2c230', back: 'n' }); b.f('table', x, y, 2.4, 0.9, { solid: 'low', c: '#c0392b', plates: 1 }); b.f('bench', x, y + 1, 3, 0.65, { solid: 'low', c: '#f2c230', back: 's' }); b.ped('sitter', x - 0.5, y - 1, DN, { chance: 0.6 }); b.ped('sitter', x + 0.5, y + 1, UP, { chance: 0.45 }); }
      for (const [x, y] of [[9, 12], [13, 12]]) tablesFor(b, K, x, y, { t: { c: '#f2f2ec' }, chair: '#c0392b', ch: 0.5 });
      b.f('fd_burgersign', 8, 0.35, 3.6, 0.6, { layer: 2, text: 'MENU' }); b.f('fd_burgersign', 14, 0.35, 3.6, 0.6, { layer: 2, text: 'KJØTTKAKE BURGER' });
      b.f('vending', 21.2, 8.5, 0.9, 1.4, { solid: 'tall', c: '#c0392b', cols: ['#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a', '#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a', '#c0392b', '#2f6fb5', '#f2c230', '#3e8e5a'] });
      b.f('neon', 6, 15.45, 3.6, 0.7, { text: 'OPEN LATE', c: '#f2c230', layer: 2 });
      b.act(7, 6.9, 1.4, () => 'F: Kjøttkake Burger meal ($9, +35 hp)', () => K.buyFood(9, 35, K.pick(['Kjøttkake in a bun with brown sauce. Bestemor would cry.', 'Big Bus Meal. You are now 10% bus.'])));
      b.act(11, 6.9, 1.4, () => 'F: Ask for the secret menu', () => {
        const c = staff(sc, K, 'cashier'); if (!c) return;
        if (!pay(K, 15, 'food')) return; hp(K, 50); K.sfx('chime');
        K.say(c, K.pick(['THE ARTUR SPECIAL. THREE PATTIES AND A THREAT.', 'BRUNOST FRIES. YOU DID NOT GET THEM FROM ME.', 'THE MCLEFSE. NOW FORGET MY FACE.']), '#ffd23a');
      });
      b.act(14, 6.9, 1.3, () => 'F: Demand to speak to the manager', () => {
        const m = staff(sc, K, 'owner'); if (!m) { K.popup('The manager "is in a meeting".'); return; }
        if (Math.random() < 0.5) { K.say(m, 'HERE IS A COUPON. PLEASE LEAVE.', '#7dff9a'); K.money(10, 'coupon', K.P.ped.x, K.P.ped.y); }
        else { K.say(m, 'YOU WANT THE MANAGER? YOU GOT THE MANAGER!', '#ff6a4a'); K.provoke(sc, m); }
      });
      for (const q of [[11, 9.5, UP], [16, 10, 0], [5, 12.5, PI]]) b.browse(q[0], q[1], q[2]);
      for (const q of [[5, 9], [11, 9], [17, 9], [5, 13.5], [11, 13.5], [17, 13.5]]) b.light(q[0], q[1], 6, '#f6fbff', 0.8, { fix: 'panel' });
      b.light(10, 2.5, 7, '#f6fbff', 0.8, { fix: 'panel' });
      b.win(0, 7, 0.5, 15); b.win(21.5, 10, 22, 15); b.win(1, 15.5, 8, 16); b.win(14, 15.5, 21, 16);
    },
    tick(sc, dt, t, K) {
      chatter(sc, K, dt, ['cashier', 'customer', 'sitter'], ['NUMBER 47! NUMBER 47?!', 'Can I get a pølse with that?', 'Ice cream machine is broken. Again.', 'Ekstra brun saus!', 'I said NO pickles.'], 5);
      sc.st.beepT = (sc.st.beepT || 4) - dt; if (sc.st.beepT <= 0) { sc.st.beepT = K.rand(6, 12); K.sfx('beep'); }
    },
  });

  // ================= Sports pub =================
  D('pub', {
    size: [24, 18], weight: 2, minSide: 0,
    names: ['The Rowdy Ram', 'Sportsbaren Bussby', 'Offside Ølstue', 'Pub Pilsner', 'Den Blå Buss'],
    greet: ['OI! Shut the door, the match is on!', 'Pils? Pils.', 'Welcome to the only pub in Bussby with a working TV.'],
    style: { w: 1.6, door: '#1f3a24', frame: '#d4af37', plate: '#142a18', text: '#f2d27a', light: '#ffb070', neon: '#3fdc6a', icon: 'beer' },
    looks: {
      publican: () => ({ shirt: '#2f5a3a', pants: '#2b2d33', hat: null, hairStyle: 'bald', scale: 1.1 }),
      fan: (b, K) => K.pick([{ shirt: '#c0392b', pants: '#1b1f27', hat: '#c0392b', hatType: 'beanie' }, { shirt: '#1f4f9c', pants: '#e9e4d8', hat: null }, { shirt: '#f2c230', pants: '#1b1f27', hat: '#1b1f27', hatType: 'cap' }]),
    },
    furn: {
      fd_scarf(c, f, hw, hh) { for (let x = -hw; x < hw; x += 0.3) rect(c, x, -hh, 0.15, 2 * hh, '#c0392b'), rect(c, x + 0.15, -hh, 0.15, 2 * hh, '#f2f2f2'); wtext(c, f.text || 'BUSSBY FK', 0, 0, hh * 1.2, '#1b1b1f', 900); },
      fd_score(c, f, hw, hh, t, sc) { rect(c, -hw, -hh, 2 * hw, 2 * hh, '#111214'); const s = (sc && sc.st.score) || [0, 0]; wtext(c, 'BUSSBY ' + s[0] + ' - ' + s[1] + ' OSLO', 0, 0, hh * 1.0, '#ffd23a', 800); },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 23, ambient: 0.45, wallTop: '#1f3a24', wallLo: '#10200f', wallHi: '#5a7a4a' });
      b.room(0, 0, 24, 18, 'wood', '#5a3a20', '#3e2814');
      b.box(); b.entrance(12, 2.4);
      sc.st.score = sc.st.score || [0, 0];
      b.f('bottles', 7, 0.95, 12, 0.9, { solid: 'tall', fragile: true });
      b.f('counter', 7, 3.9, 12, 1.3, { solid: 'low', c: '#2a1a0e', top: '#7a5030' }); b.f('taps', 5, 3.6, 1.4, 0.35); b.f('register', 10.5, 3.6, 0.7, 0.5);
      b.wall(13, 3.65, 14, 4.15);
      b.ped('cashier', 7, 2.3, DN, { look: 'publican', rob: [120, 350] });
      b.zone(0.3, 0.3, 13, 3.2, 'staff');
      for (let x = 2; x <= 12; x += 1.6) b.f('stool', x, 5.2, 0.5, 0.5, { c: '#2f5a3a' });
      for (const x of [3.6, 6.8, 10]) b.ped('drinker', x, 5.5, UP, { pose: 'drink', look: 'fan', chance: 0.8 });
      // the TV wall
      for (const [x, y] of [[18.5, 0.7], [22.6, 0.7]]) b.f('tv', x, y, 2.6, 0.45, { layer: 2, fragile: true, show: 'football' });
      b.f('tv', 23.3, 9, 0.45, 2.6, { layer: 2, fragile: true, show: 'football', rot: DN });
      b.f('fd_score', 20.5, 1.45, 4.2, 0.4, { layer: 2 });
      b.f('fd_scarf', 3, 17.6, 4, 0.4, { layer: 2 });
      b.f('sofa', 20.5, 4.6, 5, 1.1, { solid: 'low', c: '#2f5a3a', back: 's' });
      for (const x of [18.8, 20.5, 22.2]) b.ped('drinker', x, 4.5, UP, { look: 'fan', sit: true, chance: 0.75 });
      for (const q of [[17.5, 7.2], [20.5, 7.5], [22.5, 7.0], [19, 9.5]]) b.ped('drinker', q[0], q[1], UP, { look: 'fan', pose: 'drink', chance: 0.6 });
      for (const [x, y] of [[4, 10], [9, 10], [4, 14.5], [9, 14.5], [15, 14.5]]) {
        b.f('table', x, y, 1.3, 1.3, { solid: 'low', round: 1, c: '#3a2418', glasses: 1 });
        b.f('chair', x - 1.05, y, 0.55, 0.55, { rot: 0 }); b.f('chair', x + 1.05, y, 0.55, 0.55, { rot: PI });
        b.ped('sitter', x - 1.05, y, 0, { look: 'fan', chance: 0.55 }); b.ped('sitter', x + 1.05, y, PI, { look: 'fan', chance: 0.35 });
      }
      b.ped('drunk', 15, 10, PI, { look: 'drunk', pose: 'drink', chance: 0.7 }); b.ped('bouncer', 9, 16.4, UP, { chance: () => K.night() ? 0.9 : 0.3 });
      sc.st.darts = b.f('dartboard', 0.75, 7, 0.2, 0.8, { layer: 2 });
      b.f('door', 23.5, 15, 0.3, 1.5, { text: 'WC', layer: 2 });
      b.act(7, 5.6, 2.4, () => 'F: Buy a pils ($8, +12 hp)', () => { if (!pay(K, 8, 'drink')) return; hp(K, 12); K.sfx('glug'); K.popup(K.pick(['Skål! It tastes like Saturday.', 'A pils so cold it has a pension.', 'Half a litre of liquid courage.'])); });
      b.act(20.5, 6.4, 1.8, () => sc.st.bet ? 'Bet placed on ' + sc.st.bet.team + ' - watch the match' : 'F: Bet $20 on the next goal', () => {
        if (sc.st.bet) return; if (!pay(K, 20, 'bet')) return;
        sc.st.bet = { team: Math.random() < 0.5 ? 'BUSSBY' : 'OSLO', t: K.rand(6, 12) }; K.popup('You bet $20 that ' + sc.st.bet.team + ' scores next.');
      });
      b.act(13, 9.5, 1.6, () => 'F: Insult the other team', () => fight(sc, K, K.pick(['DID YOU SAY OSLO? DID YOU?!', 'MY TEAM, MY PILS, MY FIST!', 'NOBODY TALKS ABOUT BUSSBY FK LIKE THAT!'])));
      for (const q of [[13, 7, UP], [16, 12, 0], [6, 12.3, PI], [12, 15.5, 0]]) b.browse(q[0], q[1], q[2]);
      for (const x of [3, 7, 11]) b.light(x, 3, 5, '#ffcf8a', 0.75, { fix: 'pendant' });
      for (const q of [[4, 10], [9, 10], [4, 14.5], [9, 14.5], [15, 14.5]]) b.light(q[0], q[1], 3.5, '#ffc070', 0.6, { fix: 'pendant' });
      b.light(20.5, 3, 6, '#9ad8ff', 0.6); b.light(12, 9, 12, '#ffb070', 0.3);
      b.win(0, 9, 0.5, 16); b.win(16, 17.5, 22, 18);
    },
    tick(sc, dt, t, K) {
      const st = sc.st;
      st.goalT = (st.goalT == null ? K.rand(10, 20) : st.goalT) - dt;
      if (st.bet) st.bet.t -= dt;
      if (st.goalT <= 0 || (st.bet && st.bet.t <= 0)) {
        st.goalT = K.rand(18, 35);
        const home = Math.random() < 0.55; st.score[home ? 0 : 1]++;
        const fans = sc.peds.filter(p => K.mine(p) && !p.dead && p.ai.st === 'idle' && (p.ai.role === 'drinker' || p.ai.role === 'sitter'));
        for (const p of fans) if (Math.random() < 0.6) K.say(p, home ? K.pick(['MÅÅÅÅL!', 'JAAAA!', 'BUSSBY! BUSSBY!', 'SKÅL FOR SKÅRING!']) : K.pick(['NEI NEI NEI!', 'OFFSIDE!!', 'REFEREE IS FROM OSLO!', 'UFF!']), home ? '#7dff9a' : '#ff6a4a');
        if (st.bet) {
          const won = (st.bet.team === 'BUSSBY') === home; st.bet = null;
          if (won) { K.money(50, 'bet', K.P.ped.x, K.P.ped.y); K.sfx('cash'); K.popup('GOAL! Your bet pays $50!'); } else K.popup('Goal for the wrong team. Your $20 is gone.');
        }
        if (!home && Math.random() < 0.25 && fans.length > 1) { const a = K.pick(fans); K.say(a, 'YOU JINXED IT!', '#ffd23a'); K.provoke(sc, a); }
      } else chatter(sc, K, dt, ['drinker', 'sitter', 'drunk'], ['COME ON, PASS IT!', 'My grandmother runs faster!', 'One more pils!', 'Ref! Are you blind?!', 'Artur bet the bar on this one.'], 5);
    },
  });

  // ================= Karaoke bar =================
  D('karaoke', {
    size: [22, 18], weight: 1.5, minSide: 0,
    names: ['Syng Sang Karaoke', 'Mic Drop Bussby', 'Karaoke Kjell', 'Lalala Lounge', 'Neon Nordlys'],
    greet: ['Welcome! Song list is by the stage.', 'Tonight: a-ha, a-ha and more a-ha.', 'No booing. Unless it is earned.'],
    style: { w: 1.6, door: '#1b0f2a', frame: '#c25cff', plate: '#120a1c', text: '#ff7ad9', light: '#e0a0ff', neon: '#c25cff', icon: 'beer' },
    looks: {
      mc: () => ({ shirt: '#c25cff', jacket: '#ffd23a', pants: '#1b1f27', hat: null, hairStyle: 'afro', scale: 1.05 }),
      party: (b, K) => ({ shirt: K.pick(K.NEONS), pants: K.pick(['#1b1f27', '#3a3a5a', '#f2f2f2']), hat: null }),
    },
    furn: {
      fd_stage(c, f, hw, hh, t) {
        sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#2a1a3a'); const n = 8;
        for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const on = Math.sin(t * 3 + i * 0.9 + j * 1.7) > 0.2; rect(c, -hw + 0.1 + i * (2 * hw - 0.2) / n, -hh + 0.1 + j * (2 * hh - 0.2) / 3, (2 * hw - 0.2) / n - 0.05, (2 * hh - 0.2) / 3 - 0.05, on ? K0.NEONS[(i + j) % K0.NEONS.length] : '#3a2a4a'); }
      },
      fd_mic(c, f, hw) { disc(c, 0.04, 0.06, hw, 'rgba(0,0,0,0.3)'); disc(c, 0, 0, hw * 0.5, '#3a3f46'); disc(c, 0, -hw * 0.2, hw * 0.35, '#c9ccd1'); ln(c, 0, 0, hw * 0.8, hw * 0.8, '#1b1b1f', 0.03); },
      fd_screen(c, f, hw, hh, t, sc) {
        rect(c, -hw, -hh, 2 * hw, 2 * hh, '#0b0b18'); rect(c, -hw + 0.06, -hh + 0.05, 2 * hw - 0.12, 2 * hh - 0.1, '#1f1f6a');
        const s = (sc && sc.st.song) || 'TAKE ON ME', k = (t * 0.25) % 1, w = 2 * hw - 0.4;
        wtext(c, s, 0, -0.02, hh * 0.9, '#ffffff', 800); rect(c, -w / 2, hh * 0.55, w * k, 0.04, '#ff7ad9');
      },
      fd_ball(c, f, hw, hh, t) { for (let i = 0; i < 6; i++) { const a = t * 0.8 + i; disc(c, Math.cos(a) * hw * 3, Math.sin(a) * hw * 3, 0.12, rgbaN(i, 0.25)); } disc(c, 0, 0, hw, '#c9ccd1'); for (let i = 0; i < 6; i++) disc(c, Math.cos(t * 2 + i) * hw * 0.6, Math.sin(t * 2 + i) * hw * 0.6, 0.04, '#ffffff'); },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 22, ambient: 0.3, wallTop: '#2a1440', wallLo: '#140a20', wallHi: '#7a4aa0' });
      b.room(0, 0, 22, 18, 'carpet', '#3a1a4a', '#2a1036');
      b.box(); b.entrance(17, 2.2);
      sc.st.song = sc.st.song || 'TAKE ON ME';
      b.f('fd_stage', 8, 2.6, 8, 3.4, { solid: 'low' }); b.f('fd_screen', 8, 0.5, 5, 0.6, { layer: 2 });
      b.f('fd_mic', 8, 3.4, 0.35, 0.35); b.f('speaker', 3.4, 1.4, 1.1, 1.1, { solid: 'tall' }); b.f('speaker', 12.6, 1.4, 1.1, 1.1, { solid: 'tall' });
      b.ped('dj', 13.5, 4.8, PI * 0.8, { look: 'mc' });
      b.ped('customer', 8, 2.4, DN, { look: 'party', pose: 'dance', chance: 0.7 });
      b.f('fd_ball', 8, 9, 0.3, 0.3, { layer: 3 });
      for (const q of [[6, 7], [8, 7.5], [10, 7], [7, 9.5], [9.5, 9.5]]) b.ped('dancer', q[0], q[1], UP, { look: 'party', pose: 'dance', chance: () => K.night() ? 0.8 : 0.35 });
      for (const [x, y] of [[2.3, 9], [2.3, 14]]) { b.f('sofa', x - 1, y, 1.1, 3.4, { solid: 'low', c: '#c25cff', back: 'w' }); b.f('table', x + 0.5, y, 0.9, 1.6, { solid: 'low', c: '#1b1b1f', glasses: 1 }); b.ped('sitter', x - 0.9, y - 0.7, 0, { look: 'party', chance: 0.6 }); b.ped('sitter', x - 0.9, y + 0.7, 0, { look: 'party', chance: 0.5 }); }
      b.f('counter', 19, 10.5, 1.3, 7, { solid: 'low', c: '#1b0f2a', top: '#c25cff' }); b.f('bottles', 21.3, 10.5, 0.8, 7, { solid: 'tall', fragile: true }); b.f('register', 19, 8, 0.5, 0.7);
      b.wall(18.75, 6.75, 19.25, 7.0);
      b.ped('cashier', 20.3, 10.5, PI, { look: 'bartender', rob: [100, 320] });
      b.zone(19.7, 7, 21.7, 14.2, 'staff');
      for (const y of [8.5, 10.5, 12.5]) { b.f('stool', 17.6, y, 0.5, 0.5, { c: '#c25cff' }); b.ped('drinker', 17.6, y, 0, { look: 'party', pose: 'drink', chance: 0.6 }); }
      b.ped('drunk', 12, 13.5, PI, { look: 'drunk', pose: 'drink', chance: 0.6 }); b.ped('bouncer', 15, 16.3, UP, { chance: 0.7 });
      b.f('neon', 8, 17.45, 4, 0.7, { text: 'SING!', c: '#ff7ad9', layer: 2 }); b.f('neon', 0.45, 4, 0.7, 3.4, { text: '♪', c: '#3fd0ff', layer: 2, rot: DN });
      const SONGS = ['TAKE ON ME', 'FIRE IN THE BUS', 'MY BRUNOST HEART', 'DANCING QUEEN (NO)', 'BUSSBY NIGHTS', 'NORWAY 0 POINTS'];
      b.act(8, 4.9, 1.6, () => sc.st.sing > 0 ? 'Singing "' + sc.st.song + '"...' : 'F: Sing karaoke ($5)', () => {
        if (sc.st.sing > 0) return; if (!pay(K, 5, 'karaoke')) return;
        sc.st.song = K.pick(SONGS); sc.st.sing = 8; sc.st.cheer = 0; K.popup('You grab the mic: "' + sc.st.song + '"'); K.sfx('arcade');
        const m = staff(sc, K, 'dj'); if (m) K.say(m, 'GIVE IT UP FOR OUR NEXT SUPERSTAR!', '#ff7ad9');
      });
      b.act(17.6, 10.5, 1.8, () => 'F: Buy a cocktail ($12, +18 hp)', () => { if (!pay(K, 12, 'drink')) return; hp(K, 18); K.sfx('glug'); K.popup(K.pick(['A "Nordlys Sunrise". It glows.', 'Aquavit mojito. Brave choice.', 'Liquid confidence for the second verse.'])); });
      b.act(12, 11.8, 1.4, () => 'F: Steal the mic from the drunk', () => fight(sc, K, 'THAT IS MY SONG! I HAVE WAITED SINCE 1998!'));
      for (const q of [[5, 12, 0], [12, 7, PI], [15, 13, PI]]) b.browse(q[0], q[1], q[2]);
      b.light(8, 3, 6, '#ff7ad9', 0.8); b.light(8, 9, 7, '#3fd0ff', 0.5); b.light(19, 10.5, 5, '#c25cff', 0.6, { fix: 'pendant' });
      b.light(2.3, 11.5, 5, '#ff4a8a', 0.5);
    },
    tick(sc, dt, t, K) {
      const st = sc.st;
      if (st.sing > 0) {
        st.sing -= dt; K.P.ped.pose = 'dance';
        st.lyT = (st.lyT || 0) - dt;
        if (st.lyT <= 0) { st.lyT = 1.6; K.say(K.P.ped, K.pick(['♪ TAAAKE ON MEEE ♪', '♪ OOH BUSSBY ♪', '♪ (forgets the words) ♪', '♪ NANANANA ♪', '♪ MY HEART IS BRUNOST ♪']), '#ff7ad9'); }
        if (st.sing <= 0) {
          K.P.ped.pose = null;
          const score = Math.floor(K.rand(10, 100)), crowd = sc.peds.filter(p => K.mine(p) && !p.dead && p.ai.st === 'idle' && p.ai.role !== 'cashier');
          if (score >= 60) { K.money(score >= 90 ? 60 : 20, 'karaoke', K.P.ped.x, K.P.ped.y); K.sfx('cash'); K.popup('SCORE ' + score + '! The crowd throws money!'); for (const p of crowd) if (Math.random() < 0.5) K.say(p, K.pick(['WOOO!', 'ENCORE!', 'BETTER THAN A-HA!', 'BRAVO!']), '#7dff9a'); }
          else { K.popup('SCORE ' + score + '. Norway, zero points.'); for (const p of crowd) if (Math.random() < 0.5) K.say(p, K.pick(['BOOO!', 'MY EARS!', 'GET OFF THE STAGE!', 'UFF DA...']), '#ff6a4a'); if (score < 25 && crowd.length) { const h = crowd.find(p => p.ai.role === 'drunk' || p.ai.role === 'drinker'); if (h) { K.say(h, 'YOU RUINED MY SONG!', '#ffd23a'); K.provoke(sc, h); } } }
        }
      } else chatter(sc, K, dt, ['dancer', 'drinker', 'sitter', 'customer'], ['One more song!', 'Who picked a-ha AGAIN?', 'I am a natural.', 'Pass the mic!', 'Is it my turn yet?'], 6);
    },
  });

  // ================= Bakery =================
  D('bakery', {
    size: [16, 12], weight: 2, minSide: 0,
    names: ['Bakeri Bolle', 'Kanelsnurr', 'Bestemors Bakst', 'Lefse & Co', 'Bussby Brød'],
    greet: ['God morgen! Fresh skillingsboller.', 'Mind the flour. It gets everywhere.', 'The lefse is still warm!'],
    style: { w: 1.6, door: '#5a3a22', frame: '#e8d4a8', plate: '#f2ead8', text: '#7a4a22', light: '#ffe8c0', awning: ['#e8a0a0', '#f2ead8'] },
    looks: {
      baker: () => ({ shirt: '#f4f4f4', pants: '#e8e0cc', hat: '#f4f4f4', hatType: 'beanie', scale: 1.08, hairStyle: 'short' }),
    },
    furn: {
      fd_breads(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#8a5a32'); const n = Math.max(2, Math.floor(2 * hw / 0.45)); for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const x = -hw + 0.25 + i * (2 * hw - 0.5) / (n - 1), y = -hh * 0.45 + j * hh * 0.9; oval(c, x, y, 0.18, 0.11, 0.3 * ((i + j) % 2 ? 1 : -1), j ? '#c98a4a' : '#a86a30'); ln(c, x - 0.08, y, x + 0.08, y, '#e8c890', 0.02); } },
      fd_dough(c, f, hw, hh) { sh(c, hw, hh, 0.3); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#c9a878'); oval(c, -hw * 0.3, 0, hw * 0.35, hh * 0.5, 0, '#f2e8d0'); disc(c, hw * 0.35, 0, hh * 0.4, '#f2ead8'); for (let i = 0; i < 12; i++) disc(c, Math.sin(i * 7.3 + f.seed) * hw * 0.9, Math.cos(i * 3.1) * hh * 0.8, 0.03, 'rgba(255,255,255,0.7)'); },
      fd_bakeoven(c, f, hw, hh, t) { sh(c, hw, hh, 0.35); rect(c, -hw, -hh, 2 * hw, 2 * hh, '#5d636b'); for (let i = 0; i < 2; i++) { rect(c, -hw + 0.12, -hh + 0.12 + i * hh, 2 * hw - 0.24, hh - 0.2, '#2b2d33'); rect(c, -hw + 0.2, -hh + 0.2 + i * hh, 2 * hw - 0.4, hh - 0.36, 'rgba(255,' + (140 + 40 * Math.sin(t * 2 + i)) + ',60,0.6)'); } },
    },
    layout(sc, b, R, K) {
      Object.assign(sc, { camSpan: 17, ambient: 0.95, wallTop: '#a87a5a', wallLo: '#6a4a32', wallHi: '#f2d8b8' });
      b.room(0, 4.5, 16, 12, 'check', '#f2ead8', '#e0b8a8'); b.room(0, 0, 16, 4.5, 'tile', '#ece4d4', '#d4c8b0');
      b.box(); b.entrance(10, 2.2);
      b.f('fd_bakeoven', 2.2, 1.1, 3, 1.2, { solid: 'tall' }); b.f('fd_dough', 7, 1.1, 3.4, 1.0, { solid: 'low' }); b.f('fd_breads', 12.5, 0.85, 5, 0.9, { solid: 'tall' });
      b.f('counter', 7, 4.5, 10, 1.2, { solid: 'low', c: '#e8a0a0', top: '#f2ead8' });
      b.f('fd_cakes', 5, 4.4, 3.2, 0.7); b.f('pies', 8.4, 4.4, 1.2, 0.6); b.f('register', 10.8, 4.35, 0.6, 0.5);
      b.wall(12, 4.25, 15.75, 4.75);
      b.ped('cashier', 10.8, 3.4, DN, { look: 'baker', rob: [50, 180] }); b.ped('clerk', 7, 2.3, UP, { look: 'baker', when: 'day' });
      b.zone(0.3, 0.3, 15.7, 3.9, 'staff');
      b.ped('customer', 6, 6.2, UP, { chance: 0.7 }); b.ped('customer', 3, 7, UP, { chance: 0.4, when: 'day' });
      tablesFor(b, K, 3.5, 9.5, { t: { c: '#f2f2f2', mugs: 1 }, chair: '#e8a0a0', ch: 0.5 });
      b.f('bench', 15.3, 8.5, 0.7, 4, { solid: 'low', c: '#8a5a32', back: 'e' }); b.ped('sitter', 15.3, 8, PI, { chance: 0.5 });
      b.f('plant', 1, 11, 0.9, 0.9, { solid: 'low' }); b.f('sign', 8, 11.55, 2.6, 0.5, { text: 'FERSKE VAFLER', c: '#7a4a22', bg: '#f2ead8', size: 0.28, layer: 2 });
      b.act(5.5, 5.7, 1.5, () => 'F: Buy a skillingsbolle ($4, +12 hp)', () => K.buyFood(4, 12, 'Cinnamon bun the size of your head. Worth it.'));
      b.act(8.4, 5.7, 1.3, () => 'F: Lefse with butter and sugar ($7, +25 hp)', () => K.buyFood(7, 25, K.pick(['Lefse! Just like bestemor made. Before the incident.', 'Soft, sweet lefse. You forgive Oslo for a moment.'])));
      b.act(12.5, 5.7, 1.2, () => 'F: Ask for day-old bread (free)', () => {
        if (sc.st.freeBread) { K.popup('"We already gave you the old bread. Go."'); return; }
        sc.st.freeBread = 1; hp(K, 8); K.sfx('chime'); K.popup('A rock-hard rundstykke. Your teeth survived. +8 hp');
      });
      for (const q of [[4, 6.5, UP], [9, 7, UP], [12, 9, 0]]) b.browse(q[0], q[1], q[2]);
      for (const q of [[4, 8], [11, 8]]) b.light(q[0], q[1], 5, '#ffe0b0', 0.75, { fix: 'pendant' });
      b.light(7, 2, 5, '#fff4dc', 0.8, { fix: 'panel' }); b.light(2.2, 1.6, 3, '#ff9a4a', 0.6);
      b.win(0, 5.5, 0.5, 11); b.win(1, 11.5, 6, 12); b.win(12, 11.5, 15, 12);
    },
    tick(sc, dt, t, K) { chatter(sc, K, dt, ['cashier', 'customer', 'sitter'], ['Two skillingsboller, takk.', 'Is the brunost cake gluten free? No? Good.', 'Fresh out of the oven!', 'I come here only for the smell.'], 7); },
  });

  function rgbaN(i, a) { return K0.rgba(K0.NEONS[i % K0.NEONS.length], a); }
  const { rect, rr, disc, oval, ln, wtext, sh } = K0;
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
