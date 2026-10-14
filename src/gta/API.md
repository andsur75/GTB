# Grand Theft Bus: module API

GTA mode is built from `src/gta/core.js` (the spine) and feature modules: one file per feature in
`src/gta/<name>.js`. `node tools/build.mjs` inlines them all into `Take_the_Bus_Drift.html`, each in its
own `<script>`, core first and then alphabetically. While developing a module, build only core plus your
module (plus any module you deliberately test against) into a private output:

    node tools/build.mjs --only core,peds --out /tmp/<you>/game.html

Every module must work alone with core (other modules absent) **and** together with all the others.

## File shape

```js
// One-paragraph header: what this module adds to Grand Theft Bus.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  // ... state lives in closures or on X.<yourName> ...
  X.mod('peds', {
    order: 30,                 // tick order, lower first (core vehicles physics runs after all module ticks)
    init() {},                 // called on every new game, after the world is built
    stop() {},                 // leaving GTA mode
    tick(dt) {},               // every frame while playing (not while paused); dt <= 0.05 s
    hud(g) {},                 // every frame after core HUD update (DOM work)
    render: {                  // canvas layers, world transform already set (metres), except 'light' and 'screen'
      ground(ctx, view, t) {}, props, buildings, bodies, cars, peds, air, light, overlay, screen
    },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
```

Style: match the base game (plain ES2020, no libraries, no external assets, canvas drawing and Web Audio
synthesis only, short comments only where the why is not obvious). No `</script` inside files.
Everything a module needs at runtime it creates itself (CSS via a `<style>` element it injects, DOM nodes
appended inside `#gta-hud`, which lives inside `#hud`).

Hooks are wrapped in try/catch by core; an exception is logged once to the console and the game keeps
running, but tests treat any console error as a failure.

## Coordinates, time, units

* World units are metres. x right, y **down**. Angles in radians, `atan2(dy, dx)`; angle 0 points east,
  +π/2 points south (down on screen).
* `X.time` seconds of play; `X.clock` minutes since midnight (0..1440), advances 2 game minutes per real
  second (starts 21:30). `PG.game.particles` is the shared particle list (kinds `spark`, `smoke`,
  `tsmoke`, `fire`, `debris`, `confetti`), use `PG.burst(x, y, kind, n, speed, life, size, colors)`.
* `PG.game.shake` (seconds-ish) shakes the camera.
* Interiors live in the same coordinate space but far outside the city (x > 3000). See Scenes.

## The world

* `X.city` = the generated city (`PG.buildCity`): `W, H, xs[], ys[]` road centre lines, `wx[], wy[]`
  road widths (15 m streets with 2 lanes each way, 22 m avenues with 3), `blocks[]` `{x0,y0,x1,y1,kind:
  'city'|'park'|'plaza'}` (4.5 m sidewalk ring inside each block), `buildings[]` `{x0,y0,x1,y1,h,tint,
  neon,nside,top,deco,place?,color?}` (deco = scenery outside the city wall), `trees[] {x,y,s}`,
  `lamps[] {x,y,nx,ny}` (street lamps, n = towards the road), `fountains[]`, `walls[]`, spatial hash.
* `X.solidsNear(x, y, r)` → solid obstacles `{kind:'building'|'tree'|'fountain'|'boundary', poly, bb}`.
  `PG.cityPut(X.city, {kind, poly})` / `PG.cityRemove(X.city, obj)` add/remove solids (interiors, props).
* `X.blocked(x, y, r)` → the solid at a point/circle or null. `X.raycast(x0,y0,x1,y1,{cars,peds,ignore,
  solids,pad,deadPeds,solidFilter})` → nearest hit `{t,x,y,kind:'solid'|'car'|'ped',obj}` or null.
  `X.lineOfSight(a, b)`.
* Roads: `X.roadAt(x,y)`, `X.nearestRoadPoint(x,y)`, `X.nearestNode(x,y)`, `X.route(x0,y0,x1,y1)` →
  waypoints along road centre lines (BFS over junctions), `X.laneAt(x,y,th)`.
* Sidewalks: `X.blockAt(x,y)`, `X.onSidewalk(x,y)`, `X.randomSidewalkPoint(x, y, rMin, rMax)`.
* `X.places[id]` for `hideout` (Artur's Garage: start + safehouse), `bank`, `police`, `hospital`,
  `gunshop`, `spray`, `crusher`, `bar`, `apartment` (safehouse): `{id, name, b (building), door: {x, y,
  nx, ny} (on the sidewalk, n points out to the street), color, pad?: {x, y, w, h} (drive-on pad for
  spray/crusher)}`. `X.buildingDoor(b, k)` gives a door for any other building.
* `X.districtAt(x, y)` → district name. `X.focus()` → where the city simulation centres itself (player,
  or the street outside while indoors). Spawn and despawn around `X.focus()`, never around the player
  position while `X.scene` is set.

## People: peds

`X.peds` holds every person, including the player's character, cops, guards, corpses.

```
{ id, kind:'ped', x, y, th, vx, vy, r: 0.32, hp, maxHp, armor, dead, deadT, walk (anim phase), speed,
  car (car they sit in or null), hidden, team: 'civ'|'cop'|'gang'|'guard'|'player'|..., look: {skin, hair,
  shirt, pants, hat}, weapon (id or null), ai (owned by one module), onFire (s), knock (s of ragdoll),
  hurtT, isPlayer, removed, lastBy, lastKind }
```

* `X.makePed(o)` creates and registers one. Remove with `p.removed = true` (core prunes the list).
* **Ownership**: a module only drives peds whose `ai.owner` is its own name (`ai: {owner:'police', ...}`).
  Core moves only the player. Peds without `ai` are unclaimed: the peds module adopts them (civilians,
  ejected drivers). Corpse cleanup for every ped belongs to the peds module.
* `X.movePed(p, dt, wantVx, wantVy)` is the one way to move a person: steering towards a target velocity,
  ragdoll while `p.knock > 0`, collision with solids and cars, walk animation.
* `X.drawPed(ctx, p, t)` draws a person (core default; peds.js replaces it with a nicer one). Core draws
  every visible ped: corpses before cars, the living after cars.
* `X.damagePed(p, amount, by, kind)` / `X.killPed(p, by, kind)`. kinds: `'car' 'bullet' 'melee'
  'explosion' 'fire' 'crash' 'impact' 'bail'`. Emits `pedHurt`, `pedKilled`. Killing by the player
  reports a crime.

## Vehicles: cars

`X.cars` holds every vehicle. Fields:

```
{ id, kind:'car', model: X.MODELS[id] (name, kind?: 'police'|'taxi'|'bus'|'swat'|'ambulance'|'fire'|
  'armored'|'sports'|'van', hp, value, ...), def (derived physics spec), len, wid, color, x, y, th (centre),
  v (forward m/s), speed, ctrl: 'path'|'phys'|'parked', dv (drift-physics state when ctrl==='phys'),
  driver (a ped, e.g. the player) , npcDriver ({look, team, extra}: an abstract NPC at the wheel),
  hp, maxHp, wrecked, burning, siren, lightsOn, braking, reversing, keep, owner, ai, removed }
```

* `ctrl: 'path'` = kinematic lane traffic (cheap, follows lanes, brakes for anything ahead).
  `'phys'` = full drift physics (`dv`), used for the player's car, anything that has been hit, and any
  AI car you drive yourself. `'parked'` = static until touched.
* `X.makeCar(modelId, x, y, th, o)`; `X.spawnTraffic(x, y, rMin, rMax, modelId?, o?)`,
  `X.spawnParked(...)`; `X.removeCar(c)`; `X.toPhys(c)`; `X.toPath(c)`; `X.placeCar(c, x, y, th)`.
* Driving an AI car: set `c.ai = {owner:'police', drive(car, dt) { return ctl; }}` with ctl `{fwd, rev,
  hand, steerAbs (-1..1), thrMax}`. `X.steerCtl(car, tx, ty, {speed, dt, brakeDist, reverseOk,
  handbrake})` is a ready pure-pursuit controller with stuck detection. Set `c.owner` (or `c.keep`) so
  core never despawns your car; core recycles unowned traffic far from `X.focus()`.
* `X.carPoly(c)`, `X.carVel(c)`, `X.carMid(def)`.
* `X.damageCar(c, amount, by, kind)` → emits `carHurt`; at 0 hp `X.destroyCar(c, by)` (core default:
  wreck + `X.explode`). Collisions already deal damage and emit `carImpact {car, other, speed, at}`.
* `X.ejectOccupants(c, reason)` turns the npcDriver into real peds at the door (emits `pedEjected`).
* `X.drawCar(ctx, c, t)` draws a vehicle (police light bars, taxi sign, bus, etc.). Wrap it to add
  overlays, or draw extra things in the `cars` layer.
* `X.trafficRules.push(fn(car) → speed limit m/s | null)`: lane traffic obeys these (traffic lights).
  Push in `init()` (core resets the list each game).

## The player

`X.player` (also `P` inside core):

```
{ ped, car, money, loot, wanted (0..6, set by police.js), wantedFlash, state: 'play'|'wasted'|'busted',
  stateT, inv: { weaponId: ammo (Infinity for fists) }, weapon (current id), entering, kills }
```

* `X.playerPos()`, `X.playerVel()`, `X.byPlayer(by)` (was this damage/crime source the player, their car
  or something they own, e.g. `{owner: P.ped}` projectiles).
* `X.money(delta, reason, x?, y?)` (persisted), `X.addLoot(n, x?, y?)` (carried cash: banked
  automatically at the hideout/apartment door, lost on wasted/busted; emits `loot`, `lootBanked`,
  `lootLost`).
* `X.enterCar(c)`, `X.exitCar()`, `X.nearestEnterableCar()`, `X.wasted(kind)`, `X.bust()`,
  `X.respawn(reason)` (hospital or police station; weapons cleared; emits `respawn`).
* Interactions (the F key on foot): `X.interactions.push({test(P) → {text, priority, run()} | null})`.
  The best non-null `test` result wins over entering a car; its `text` is shown as the on-screen hint.
  Push in `init()` (the list is reset every game).

## Input

* `X.input.down(code)`, `.pressed(code)` (this frame only), `.any(...)`, `.anyPressed(...)`,
  `.fireDown()`, `.firePressed()`, `.mouseActive()`. `X.mouse` `{sx, sy, wx, wy, down, pressed}` (world
  coords updated every frame). Codes are `KeyboardEvent.code`.
* Taken by core: WASD/arrows (move/drive), F and Enter (use), Shift (sprint / full throttle), Space
  (handbrake; fire on foot), H (horn), C (camera mode), Tab (big map), P/Esc (pause), M (mute).
  Weapons: Q/E/Digit1-9, Ctrl/J/mouse fire. Engine: O (settings), ` (FPS counter). Free for modules: G,
  R (radio), X, V, B, N, Z, T, Y, U, I, K, L.
* Touch: `X.touch = {move: {x, y} | null, fire, aim, hand, presses: Set}` is written by the HUD module's
  on-screen controls and read by core and weapons.

## Events

`X.on(type, fn)` (register once at module load; check `X.active`), `X.emit(type, data)`.

Core emits: `start`, `crime {type, x, y, by, ...}`, `pedHurt`, `pedKilled {ped, by, kind}`,
`pedHitByCar {ped, car, speed}`, `pedEjected {ped, car, reason}`, `carjack {car, victims}`, `carHurt`,
`carImpact`, `carDestroyed {car, by}`, `explosion {x, y, power, by, source}`, `enterCar`, `exitCar`,
`honk`, `horn`, `trafficRammed`, `money`, `loot`, `lootBanked`, `lootLost`, `wasted`, `busted`,
`respawn {reason, place}`, `sceneChange {scene, from}`.

Crime types (`X.crime(type, x, y, extra)`; police.js turns them into wanted level): `carjack`,
`stealCopCar`, `hitPed`, `hitCop`, `killPed`, `killCop`, `hitCopCar`, `destroyCar`, `shoot`
(gunfire near people), `assault` (punching), `explosion`, `robbery`, `trespass`, `heist`.

Cross-module events (emit and listen by name):
`gunfire {x, y, by, weapon}` (weapons → peds flee, police notice), `vaultOpened`, `heistAlarm`,
`missionStart`, `missionPassed`, `missionFailed`, `carSprayed {car}`, `carSold {car, price}`,
`carRepaired {car}`, `onFire {ent}`.

## Services you may replace

A module that owns a service replaces it at load time, keeping the old one if it wants to wrap:
`const base = X.explode; X.explode = function (x, y, o) { ...; base(...) }`.

| service | owner | contract |
| --- | --- | --- |
| `X.drawPed(ctx, p, t)` | peds | draw one person (alive or dead, `p.hurtT`, `p.onFire`, weapon) |
| `X.explode(x, y, {by, power, source, noFire})` | damage | damage + fx + `explosion` event |
| `X.destroyCar(c, by, kind)` | damage | car death (burning stage, then explode) |
| `X.fireWeapon(shooter, weaponId, angle)` | weapons | one shot from a ped (or `{x,y,th,owner}`); honours `shooter.fireCd`; returns true when fired |
| `X.giveWeapon(id, ammo)` | weapons | add to the player's inventory |
| `X.WEAPONS[id]` | weapons | `{name, ...}`; core HUD shows `X.WEAPONS[P.weapon].name` |
| `X.setOnFire(ent, s)` | damage | ped or car |
| `X.police` | police | `{addHeat(n), setWanted(level), clear()}` |
| `X.missions` | missions | `{active, start(id), fail(), ...}` |
| `X.interiors` | interiors | `{enter(placeId|building), scenes}` |

## Fist fights: brawl

`brawl.js` owns melee for every person. `p.act` is a person's current action `{on, type, t, dur, w, s, r
(wind-up / strike / recovery s), side (-1 left, 1 right), res (0 pending, 1 hit, 2 missed)}`; types: `jab cross
hook uppercut haymaker kick bat stomp` (strikes) and `block dodge hitReact stagger knockdown taunt beg`. A strike
lands only when the fist, foot or bat physically reaches somebody (at that frame), with hit-stop, knockback,
blocks (-70%), and reports `assault` / `hitCopCar` for the player like weapons.js. Fists pass over people on the
ground (knocked down, getting up, sent flying); kicks and bats still connect, and the player's fire on somebody
lying in front is a `stomp` (once per knockdown). A clean blow stuns per type (a jab only makes them flinch);
someone already swinging can take a light blow and keep swinging (the player always), fighters who eat several
in a row shrug one off or raise a block, and a block is often answered with a counter. The player's uppercut
floors people as the finisher of a combo that landed. Without a mouse, the player squares up to the nearest
person fist-fighting them (so the move keys circle them and backing off kicks); sprinting breaks away.
weapons.js routes fists and the bat (`X.fireWeapon` with a melee weapon) through `X.brawl.melee`; melee damage
another module deals directly still gets a swing and a flinch drawn.

* `X.brawl.strike(p, type, o)` start a strike (`o: {side, mul, ang}`); false while stunned or down.
* `X.brawl.fight(p, target, o)` brawl takes over `p.ai` (`{owner: 'brawl', prev, target, ...}`) for a fist fight
  (`o: {skill 0..1, aggr, giveUp (hp fraction), chase (s)}`) and gives the previous AI back when it ends,
  emitting `brawlEnd {ped, target, reason: won | lost | flee | escaped | dead | stop}`. Owners react to that
  (peds.js: flee, shake a fist, carry on). `X.brawl.provoke(victim, attacker)` is the same with a yell, for a
  victim that decided to fight back (the decision is the owner's; peds.js rolls 75% for civilians).
* `X.brawl.stopFight(p, reason)`, `X.brawl.isFighting(p)` (for the player: anyone fighting them).
* `X.brawl.armPose(p, t)` the pose `X.drawPed` draws, or null when brawl has nothing to show: body frame of
  the person before the draw scale (+x facing, +y right): shoulders `lsx/lsy rsx/rsy`, elbows `lex/ley
  rex/rey`, fists `lx/ly rx/ry` (sizes `fl/fr`), torso twist `tw`, `lean`, sideways `sy`, head offset `hx/hy`,
  `stance` (0..1), a kicking leg `leg` (side) `hipx/hipy knx/kny kx/ky`, a bat `bat ba`; or `body: 'fall' |
  'lie' | 'getup' | 'kneel'` with `k` (progress) and `ang` (fall direction) for knockdowns and begging; `fk` is the
  kicking foot's size (a raised stomp looks bigger from above).
* `X.brawl.react(p, type)`, `X.brawl.knockdown(p, ang, by)`, `X.brawl.limbAt(p)` (world position of the striking
  fist / foot / bat tip), `X.brawl.fights()` active fights `{x, y, a, b, player, alive, watch}` (peds.js gathers
  a ring of watchers), `X.brawl.stats`, `X.brawl.opts`.
* Events: `brawlStart {ped, target}`, `brawlHit {by, ped, type, dmg, blocked, knockdown}`, `brawlKnockdown
  {ped, by}`, `brawlEnd`.

## Drawing helpers

* `X.addLight(x, y, radius, color, intensity, {cone: {dir, spread}})` submits a light for this frame
  (lighting.js renders the night; lights vanish after the light layer each frame). Submit from `tick`
  or any render layer before `light`.
* `X.decal(x, y, kind, size, o)` ground decals (`blood`, `scorch`, `oil`, `glass`, or `{color}`).
* `X.objective(x, y, {color, label, radius})` this-frame objective marker (ground ring, screen-edge
  arrow with distance, map blip). `X.blip(x, y, color, {edge, size, ring, shape})` minimap blip.
* `X.floatText(x, y, text, color)`, `X.popup(text)`, `X.big(text, color, ms, sub)`, `X.pager(text, ms)`
  (ms 0 = stays), `PG.ui.toast(text, kind)`.
* `X.toScreen(x, y)`, `X.toWorld(sx, sy)`, `X.inView(x, y, pad)`, `X.lastView`
  `{scale, dpr, cw, ch, cx, cy, rot, ax, ay, r}`. `PG.cityDraw.worldTransform(ctx, view)`.
* Audio: `PG.audio.kit()` → `{ctx, master, now, tone(type, f, t, dur, peak, {to, lp, detune, vib,
  attack, dest}), noise(t, dur, peak, filterType, f, {to, Q, attack, dest}), gain(v, dest), env}` or
  null while audio is locked or muted (always null-check). Existing one-shots: `PG.audio.honk(pan)`,
  `boom()`, `crash()`, `scrape()`, `chime(n)`, `fanfare()`, `trombone()`, `whoosh()`, `cone()`.
  Loops you start must stop in `stop()`, on pause (`PG.game.status !== 'play'`) and on mute.

## Settings & rendering

### Settings

`PG.settings` is a plain object with the current values. Read it **every frame** (never cache a value across
frames) and always with a fallback, so the module still works without the engine part:
`const S = PG.settings || {}; if ((S.lighting || 'high') === 'off') ...`.

| key | values | meaning |
| --- | --- | --- |
| `quality` | `low` `medium` `high` `ultra` `custom` | the preset the keys marked P came from |
| `renderScale` P | 0.5 .. 1 | backing-store resolution factor |
| `maxDpr` P | 1, 1.5, 2 | cap on `devicePixelRatio` |
| `adaptive` P | bool | lower the render scale by itself when the frame rate drops |
| `fpsCap` | 0, 30, 60 | 0 = display rate |
| `showFps` | bool | FPS counter (` key) |
| `fastRender` P | bool | cached tiles / sprites / batched paths (see Fast renderer) |
| `lighting` P | `off` `low` `medium` `high` | night lighting quality (lighting.js) |
| `lightEngine` | `auto` `webgl` `canvas` | lighting.js back end |
| `shadows` P | bool | building, tree, car and ped drop shadows |
| `particles` P | `low` `medium` `high` | caps `PG.PARTICLE_CAP` = 80 / 250 / 600 shared particles (oldest dropped) |
| `decals` P | `low` `high` | caps `PG.DECAL_CAP` = 80 / 400 ground decals |
| `skidMarks` P | bool | tyre marks recorded and drawn |
| `weather` P | bool | rain, fog |
| `ambientLife` P | bool | pigeons, litter, steam, train and other pure decoration |
| `detail` P | `low` `high` | low: no wheel / hand / face details, fewer effect particles, no motion trails |
| `screenFx` P | bool | vignettes, flashes, rain overlay, damage tint |
| `cameraShake` | bool | false = no shake at all |
| `traffic` P | 0.5 .. 1.25 | multiplier on moving and parked cars |
| `pedDensity` P | 0.5 .. 1.25 | multiplier on pedestrians |
| `policeMax` P | 3 .. 10 | most police vehicles at once |
| `wheel` | `zoom` `weapon` | what the mouse wheel does (core zooms only on `zoom`) |
| `radio` | bool | car radio |

* `PG.setSetting(key, value)` validates (unknown key or bad value: returns false; numbers are clamped and
  snapped to their step), stores, saves and notifies. Changing a preset key (P) switches `quality` to
  `'custom'`; the other keys leave the preset alone. `PG.setSetting('quality', name)` = `PG.applyPreset(name)`.
* `PG.applyPreset(name)` sets every P key from `PG.QUALITY_PRESETS[name]` (`low`, `medium`, `high` = the
  default, `ultra`); `'custom'` only renames. Also `PG.PRESET_KEYS`, `PG.SETTINGS_DEFAULTS`, `PG.SETTINGS_SPEC`.
* `PG.onSettings(fn)` → `fn(settings, changedKeys)` after every change; returns an unsubscribe function.
* Saved with the player's state (`PG.ui.state().settings` is `PG.settings`), loaded before the first frame.
* Core honours: resolution, frame cap, shadows (its cars, buses, default peds, buildings, trees), particle
  and decal caps, skid marks, detail (car wheels, default ped hands, `PG.burst` halves its particle counts),
  camera shake, traffic, wheel. Modules own the rest of their keys (lighting, weather, ambient life, screen
  effects, pedestrians, police, radio, their own particle systems, the detail of their own drawings).
* The settings screen (`#scr-settings`) opens from the title, from the pause screen and with O while playing
  (the game pauses underneath; O, Esc or Back return). `PG.ui.openSettings(from)`, `PG.ui.closeSettings()`.

### Resolution, frame rate, stats

* The main canvas backing store is CSS size × min(`devicePixelRatio`, `maxDpr`) × render scale, and it can
  change between any two frames (adaptive resolution, judged on the half-second frame rate: a 0.1 step
  down, to 0.5 at most, after 1.5 s below ~83% of the target (60, or the frame cap), kept only if the
  frame rate then really improves (a frame bound by script, not pixels, keeps its sharpness and the next try
  waits twice as long); 0.1 back up after 3 s at ~93%, waiting twice as long each time that did not hold).
  `PG.renderStats.adaptive` counts trials / kept / reverted steps. **`view.dpr` is backing pixels per CSS pixel**:
  never assume `canvas.width === clientWidth`. Screen-space drawing works as before
  (`ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)`, then CSS pixels; the `light` and `screen` layers get
  that transform) and `X.toScreen` / `X.toWorld` stay in CSS pixels. To read a pixel of the main canvas,
  scale CSS coordinates by `canvas.width / canvas.clientWidth`.
* `fpsCap` 30/60 skips display frames; `dt` still spans the real time between drawn frames.
* `PG.renderStats` `{fps, frameMs, jsMs, scale, dpr, w, h, frames, hist (frame times), hi}` is what the FPS
  counter shows; modules may add their own counts. `PG.resizeCanvas()` re-applies the size.
* Set by the main loop before each frame: `PG.mainCtx` (the main canvas context) and `PG.renderPpm` (world
  device pixels per metre = `view.scale * view.dpr`).

### Fast renderer

What pays off depends on how the browser rasterises a 2D canvas, so `PG.renderCaps` (detected once from the
WebGL renderer string) says which cached techniques the engine uses: `{gpu, renderer, tiles, cars, trees,
particles, decals, minimap}` (tests may switch them).

* **GPU canvas** (`gpu: true`): blits are nearly free and draw calls are what costs. The static ground
  (roads, paint, zebras, kerbs, sidewalks, parks, plazas) is cached in 512 px tiles at a half-octave
  pixels-per-metre level picked from the zoom (with hysteresis), drawn under the world transform with a 1 px
  overlap so the turning camera shows no seams, built a few per frame (nearest first; missing ones are drawn
  the classic way meanwhile), LRU-limited, and dropped when the city, the background or a structural solid
  changes (`PG.cityPut` / `PG.cityRemove` of anything but `prop` / `street` / `phone` / `tree`; buildings
  stay vector, so recolouring one shows at once). Cars and buses are blitted from sprites cached per (model,
  colour, size level, lights / brake / reverse / charred, steering bucket, flashing-light phase); trees,
  smoke and fire, decals and the minimap come from cached sprites too.
* **Software canvas** (`gpu: false`: no GPU, or SwiftShader / llvmpipe, which is what headless Chromium
  uses): every scaled or turned `drawImage` is rasterised per pixel on the main thread. Measured there: 40
  turned car sprites ~10 ms against ~1.7 ms for the same cars as vector paths; a full-screen turned tile
  layer took a chase frame from 14 ms to 37 ms; only unscaled, unturned blits are cheap (40 sprites ~0.5 ms);
  glow sprites beat per-frame gradients with `source-over` but lose with `lighter`; plain arcs and rects beat
  both. So there the fast renderer stays vector and only cuts work: buildings in a handful of batched paths
  (one per fill colour), lamp pools and lamp heads in one path each, particles with cached colour strings
  (sparks and debris batched by colour), one `setTransform` per decal instead of save / translate / rotate /
  restore. The big lever on such machines is pixels: render scale and adaptive resolution.
* For modules: prefer plain fills for big shapes; cache small, busy drawings in sprites when
  `PG.renderCaps.gpu` is true.
* `PG.sprites.get(key, wPx, hPx, draw(ctx, wPx, hPx))` → a cached offscreen canvas (LRU, ~12 Mpx budget,
  cleared when web fonts finish loading so lettering gets redrawn). Put everything that changes the picture
  in the key; draw it this frame, never keep it across frames. `PG.sprites.glow(color, sizePx = 64)` soft
  radial glow, `PG.sprites.disc(color, sizePx = 64)` soft-edged disc (draw with `drawImage` + `globalAlpha`
  or `'lighter'`). `PG.sprites.stats`, `PG.sprites.clear()`. `PG.spriteLevel(ppm)` picks a half-octave
  pixels-per-metre level (2 .. 128) for your own cached drawings.
* `PG.drawCar(ctx, o)`: `o.overlay(ctx)` draws markings in the car's own frame (x forward) into the same
  sprite, `o.overlayKey` must change whenever they look different; `o.vector` forces vector drawing.
* `PG.cityDraw`: `begin`, `worldMatrix(view)` → `[a, b, c, d, e, f]` (one `setTransform` instead of five
  calls), `worldTransform`, `viewBounds(view)` (world box of the screen), `ground` / `groundRaw`,
  `buildings`, `canopies`, `lampPools`, `skids`, `invalidate(x0, y0, x1, y1)` (no arguments: everything),
  `tileStats()`. `PG.rgbaStep(rgb, a)` → a cached `'rgba(r,g,b,a)'` string in 1/40 alpha steps.

## Scenes (interiors)

`X.scene` is null in the city. While indoors it is a scene object:
`{id, name, cityPos: {x, y} (street outside), camSpan, bg, drawFloor(ctx, view, t), drawWalls(ctx, view,
t), drawTop(ctx, view, t), ambient (0..1 light level)}`. Core renders only the scene (no city, no cars)
and still draws all peds, particles and module layers. Interiors are built at x > 3000 with their walls
added to the city's spatial hash (`PG.cityPut`), so movement, raycasts and bullets just work.
`X.enterScene(scene, x, y, th)` / `X.leaveScene(x, y, th)`.

## Tests

`tests/harness.mjs` opens a built file straight into GTA mode:

```js
import { launch } from './harness.mjs';
const t = await launch({ html: '/tmp/me/game.html', out: '/tmp/me/shots' });
await t.hold(['KeyW'], 1000); await t.press('KeyF'); await t.eval(() => PG.gta.player.money);
await t.shot('name'); console.log(t.errors); await t.close();
```

Chromium runs headless; Canvas 2D works and runs at about 60 fps, so time passes in real time.
Use `t.eval` to set up situations directly (teleport the player, spawn cars, give weapons) instead of
long scripted drives. Look at your screenshots (they are PNG files you can read).
