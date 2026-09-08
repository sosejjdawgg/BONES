# v0.358a — Dogpark fixes

Built from `boneslatest13.html` (v0.357a), the single-file build supplied by the owner.
Note: the split sources in this repo (`bones.js`, `park.js`, …) are still at **v0.20a** and are
many versions behind that build — they were not touched. `bones-v0.358a.html` is the deliverable.

## 1. Invisible objects near the grove

`parkDraw` culls every world object against the raw canvas box (`0..w`, `0..h`) while the world is
drawn inside `ctx.scale(PK.zoom)`. `PK.zoom` reaches 0.55, so the visible world is ~1.8x the canvas
and a wide band around the edge was culled while still on screen. Ground props and enemies merely
popped in late; **trees kept their collision**, which is exactly an invisible thing you cannot walk
through — worst in the grove, where trees are densest.

Measured at full zoom-out standing in the grove: **67 of 94 on-screen trees drew nothing**.

Fixed by computing the true visible rect (`VL/VR/VT/VB`, the same inverse-transform the background
tiler already did for itself) and culling against that. All 16 culls in the world transform now use
it, so pickups, enemies, nuts and pals stop popping in at the edges too. → 0 invisible trees.

## 2. Lovey Dovey did nothing on wave 2

Wave 2's main event is `pkSpawnBirdStorm` — eighteen `stormForm` birds — and `stormForm` was on
`pkLoveCanCharm`'s exclusion list. On that wave, and only that wave, both the opening burst and the
fifteen-second brush found nobody to charm. The exclusion was never needed: the charmed branch in
the enemy loop runs before every formation branch and `continue`s, so a pink storm bird takes
`pkLoveEnemyTick`'s path and never its own, and the all-pink stall is already handled.

Removed the exclusion; `pkLoveTake` now clears the formation and dive flags as it turns a bird, so
nothing is left holding a path no one walks. `pkRecycleStragglers` no longer teleports charmed
enemies back onto the player. `loveHp`/`loveFlash`/`lovePulse` (and the new peck fields) were added
to `EN_FIELDS` — they were missing, so a pooled enemy could be reborn already believing it had had
its HP doubled.

## 3. Birds sitting on him, unhittable

Two independent causes, both fixed.

**a. The bark sent its own kills the wrong way.** `pkBark` called
`pkDownEnemy(e, -dxw/d, -dyw/d)`, while the survivor branch immediately below it uses `+dxw/d`, and
Heavenly Judgment and the whirlwind both pass `+dxw/d`. So barked enemies scuttled *toward* him and
through him for `FLEE_TIME` (2.2s) — and fleeing enemies are skipped by the bark sweep, so they
could not be barked again. A barked bird spent two seconds parked on his centre point, immune.
Sign corrected. Measured: barked birds now go 29.6px → 66.8px in 0.66s, all of them.

**b. Nothing ever told an attacking bird to leave.** The contact test only fired when he had no
invulnerability frames left, so a bird arriving during someone else's hit simply hovered on him
until the timer came round. And his centre point is the one place a bark cannot answer: the cone is
measured from his mouth along his facing, and a bird at zero distance has no bearing to be inside it.

New shared `pkBirdPeck` cycle for every attacking bird — hold, telegraph, one pass, out:

- **HOLD** — drifts round a ring derived from `pkBarkR()` (`clamp(reach*0.85, 20, 70)`), so the wait
  always happens somewhere he can actually answer. A hard position clamp, not a steering nudge:
  outside a committed dive nothing may end a frame inside the ring.
- **WIND** — 0.42s hanging and shuddering, drawn with the same red windup dot every other telegraphed
  attack uses. At most 3 birds commit at once, so it stays readable.
- **DIVE** — one fast run at 1.5x its speed.
- **AWAY** — leaves at 2.1x, immediately, **whether or not the peck landed**. The pull-out sits
  outside the damage test on purpose: that is what stopped a dive decaying into a hover.

Wired into the flying V and the incoming rows (the formation now owns only the approach and breaks
up on arrival), every plain bird in the mixed waves, and the wave-2 storm — the storm keeps its
swirl, since that is the wave's whole picture, but its dive now pulls out on a miss and on a
too-long run as well as on a hit. Its re-entry angle was also made wrap-aware; it used a raw
coordinate difference, which is meaningless across the seam of a looping world.

Measured over 30s with 16 birds on him: longest unbroken time any bird spent within body range
**0.10s**, 0.26% of bird-frames, and they otherwise sit at 30–60px, inside the bark's 36.6px reach.

## Verification

Driven headless in Chromium: adopt → enter the park → step `parkUpdate` and measure. No page errors.
`node --check` clean on the inline script.
