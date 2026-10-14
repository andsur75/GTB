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
* Getting in and out is a short sequence in `P.entering` `{car, ped, mode: 'enter'|'exit', phase:
  'walk'|'open'|'jack'|'in'|'out', t, ent}`: `X.enterCar` walks the player round the car to the door
  (`X.pathAroundCar`), then the door opens, a driver is yanked out (`carjack` happens there), the player steps
  in. `X.exitCar()` clears `P.car` at once (emits `exitCar`; the world sees them on foot) and the player then
  climbs out (hidden, with `ped.car` still set, until they stand beside the door). F is ignored meanwhile;
  weapons and brawl stay off while `P.entering` is set. Teleporting the player, knocking them down, the car
  leaving, burning or vanishing, wasted or busted all end it cleanly; someone half way through the door counts
  as inside for `X.occupants` (so a car blowing up hurts them and throws them out). A walk that makes no headway
  for a second tries the other door, then squeezes in if the player is right against the car (a tight alley) or
  gives up with "Can't get to the door" (hemmed in by other cars) instead of sliding through anything. The
  follow camera starts turning with the car once the door has shut (`P.seatT`) and keeps the car's heading
  until the player is out. Without doors.js the door part is instant.
* `X.pathAroundCar(ped, car, target)` → the next waypoint `{x, y, len (rest of the path), direct, blocked?}` for
  walking to a point beside a car without cutting through it (round the corners of its footprint, the shorter
  way, never through a wall corner or a car parked bumper to bumper; `blocked`: no way round). Re-plan every
  frame. The player takes the driver's door, or the passenger's (and climbs across) when the driver's side is
  walled in or cannot be reached. `X.doorSpot(c, side)` (-1 driver, 1 front
  passenger) is where that occupant steps out.
* Interactions (the F key on foot): `X.interactions.push({test(P) → {text, priority, run()} | null})`.
  The best non-null `test` result wins over entering a car; its `text` is shown as the on-screen hint.
  Push in `init()` (the list is reset every game).

## Input

* `X.input.down(code)`, `.pressed(code)` (this frame only), `.any(...)`, `.anyPressed(...)`,
  `.fireDown()`, `.firePressed()`, `.mouseActive()`. `X.mouse` `{sx, sy, wx, wy, down, pressed}` (world
  coords updated every frame). Codes are `KeyboardEvent.code`.
* Taken by core: WASD/arrows (move/drive), F and Enter (use), Shift (sprint / full throttle), Space
  (handbrake; fire on foot), H (horn), C (camera mode), Tab (big map), P/Esc (pause), M (mute).
  Weapons: Q/E/Digit1-9, Ctrl/J/mouse fire. Free for modules: G, R (radio), X, V, B, N, Z, T, Y, U, I, O, K, L.
* Touch: `X.touch = {move: {x, y} | null, fire, aim, hand, presses: Set}` is written by the HUD module's
  on-screen controls and read by core and weapons.

## Events

`X.on(type, fn)` (register once at module load; check `X.active`), `X.emit(type, data)`.

Core emits: `start`, `crime {type, x, y, by, ...}`, `pedHurt`, `pedKilled {ped, by, kind}`,
`doorOpen {car, side, door, fast, jack, bail, exit, by}` (a listener sets `wait`: seconds until a person fits
through, and may set `step`: seconds to climb in or out; nobody setting `wait` means no door animation),
`doorClose {car, side, door, leave}` (`leave`: left swinging, e.g. you sprinted off),
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

## Doors: doors.js

Every vehicle gets `car.doors` (made on first use by `X.doors.of(car)`): `{kind: 'swing'|'rear'|'slide'|
'fold'|'hatch', side (-1 left, 1 right), hx, hy (hinge, car-local metres from the body centre, x forward, y
right), len, max, role: 'front'|'rear'|'crew'|'side'|'cargo'|'mid'|'driver'|'hatch', a (opening: rad, or 0..1 for slide
and fold), w, mode: 'shut'|'anim'|'hold'|'free'|'gone', lock (intact), detached}`. Layouts: 2-door coupes,
4-door cars and the police cruiser, pickups with a regular or crew cab, cab doors + sliding door + rear barn
doors on the box van, cab + rear doors on the ambulance, SWAT van and Securicar, a crew cab on the fire truck,
two folding doors on the bus's kerb side plus the driver's own door, a turret hatch on the tank. A `'free'`
door swings from the car's motion in its own frame (braking opens front-hinged doors, accelerating slams them,
cornering swings the outside ones, yaw, wind and road bumps), bounces off its stop and latches when slammed if
its lock is intact.
Impacts near a door (`carImpact`) spring its lock, hard ones and blasts tear it off into debris (flung off
outwards, never through the body; cars kick it along); a big smash anywhere (> 9 m/s) may spring any lock as the
body bends; bullets and blows pop a lock now and then; `carRepaired` restores them all. An intact lock catches
when the door swings or eases shut. Drawn in the `cars` layer over any car renderer.

* `X.doors.entry(car, side)` → how the driver gets in from that side `{side, door, stand, seat, via?, any?}`
  (car-local points; `via` = the other seat to climb across; `any`: either side is as good, the near one is
  used: bus, tank; null if there is no door that side), `X.doors.exitSpot(car, side)`.
* `X.doors.open(car, door, {fast, then: 'hold'|'free', to})` → seconds until passable, `.close(car, door)`,
  `.breakLock(car, door, kick)`, `.tear(car, door, vx, vy)`, `.debris`, `.stats`, `.opts`.
* police.js crews: a cruiser whose crew got out (`car.pol.doorT`) gets its doors flung open here.

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
