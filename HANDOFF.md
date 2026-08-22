# BONES — project handoff

A mobile-first dog-care sim built as ONE self-contained HTML file. Brutalist black/white/red
pixel art, Press Start 2P font. Split screen: DOGCAM (canvas, top) + console controls (bottom).
Currently **v0.297a**.

---

## ⚠ WHICH FILES ARE REAL (read this first)

**The live game is `bones-v0.284a.html` — a single self-contained file.** Open it, edit inside
its one big `<script>`, save it back out under the next version number. That is the whole
workflow now.

```
bones-v0.297a.html   THE GAME. ~8.1MB, everything inlined. Edit this.
bones-v0.290a.html   previous build (burial reachable from home).
bones-v0.289a.html   previous build (bury/lovehearts, park-only entry).
bones-v0.288a.html   previous build (friends overhaul).
bones-v0.287a.html   previous build (camera zoom fix).
bones-v0.286a.html   previous build (trained attributes).
bones-v0.285a.html   previous build (doggie log).
bones-v0.284a.html   previous build (wings).
bones-v0.283a.html   the build the owner handed over, kept as the recovery point.
wingframes.js        the wings art, extracted from the owner's sheet (also inlined in the build)
```

**Everything else in this repo — `bones.js`, `park.js`, `bones.html`, and the `*frames.js`
sprite files — is a v0.20a snapshot from July 2026 and is NOT the game.** The project moved to
single-file builds and the split sources were never updated; they are missing the sword, pals,
charms, night mode, fog, the enemy pool, the PWA service worker, and roughly sixty versions of
everything else. Do not read them to learn how the game works, and do not patch them expecting
the change to ship. They are kept only because deleting someone's history is not a thing to do
casually.

A previous session lost a day to this. If a new build arrives from the owner, **commit it here
first**, before touching anything.

**Working on the single file:**

```bash
# pull the script out, work on it, put it back
python3 - <<'EOF'
h=open('bones-v0.297a.html').read()
i=h.index('<script>'); j=h.index('</script>',i)
open('cur.js','w').write(h[i+8:j])
EOF
node --check cur.js            # must pass before rebuilding
```

**Always after building:**
1. `node --check` on the extracted script must pass.
2. Verify every `$("#id")` the script touches exists in the markup (a null-onclick crash
   shipped once this way).
3. Bump the version span: `+0.001` per update unless told otherwise.
4. Actually run it. Chromium + Playwright drives the real game end to end; several bugs in the
   wings work were only visible by playing it, not by reading it.

---

## Working rules established with the project owner

- **Present a plan before executing multi-part changes.** Direct bug fixes can go straight through.
- **Be frugal.** This project burned a lot of budget on giant rebuilds. Prefer targeted edits.
- **Never guess at anchors.** grep the exact string before writing a patch. Whitespace in
  comments frequently differs from memory.
- Patches were done as python heredocs doing exact-string replace with asserts. In Claude Code,
  normal file edits are better — but keep the "assert the anchor exists" discipline.
- **Verify visually before shipping sprite work.** Numeric metrics alone have been misleading.

---

## Hard-won lessons (do not relearn these)

**Sprite extraction from AI-generated sheets:**
- Grok/AI sheets are NOT consistently scaled between sheets. Measure silhouette height per
  sheet and normalise, or sprites visibly change size between animation states.
- Flood-fill background removal leaks through hairline gaps in dark outlines, hollowing sprites.
  Use morphological closing + fill_holes. Exclude props with legitimate holes (e.g. hoop centre).
- **You cannot recover detail from an already-downscaled 90px frame.** Three rescue attempts
  failed and produced a black blob. Always re-extract from the full-res source.
- Requested art spec that eliminates this whole bug class: *identical fixed cell per frame,
  feet on the cell's bottom edge, background clearly distinct from fur, no floor/grid lines,
  no dust particles.*

**Rendering:**
- DOGCAM sprites pass through `lcdify()` at load: adaptive per-frame luminance threshold
  (darkest ~58%) quantises to ink `rgb(14,14,18)` vs wall `rgb(52,52,60)`, producing a
  Game & Watch silhouette. Warm pixels (brown eyes, tongue) are exempted and keep true colour.
  Park/runner/portraits are deliberately NOT filtered — diegetic "camera vs real life" logic.
- Flex columns with a height cap will shrink children. `flex-shrink:0` on list rows, or text
  clips as lists grow.

---

## Architecture notes

- `S` = master game state object. `CAM` = Bones' DOGCAM behaviour state machine.
  `PUP` = second dog. `PK` = Dogpark. `R` = runner. `BALL`, `TRICK`, `STAY`, `BOWL`, `FBOWL`.
- Bones' states: walk/sniff/idle/rest/shake/bark/catch/come/chase/fetch/drink/eat/beg/begwait/
  wash/zoomies/stay.
- Levelling is **tap-gated**: XP banks into `S.lvl` but visual growth and evolutions are locked
  to `XPANIM.lvl` until the player taps through the bar. Anything size- or stage-related must
  use `Math.min(XPANIM.lvl, S.lvl)` or he evolves early (this was a real bug).
- Evolutions at LV 10 / 25 / 50 (crossroads: senior or prime). Cap 250.
- Dogpark is a 2x2 wrapping world. ALL distance maths must use `wd(delta, worldSize)`.
- Dev console: tap the version number in the footer, PIN `1234`. Dev actions call `devSync()`
  to skip ceremonies.

---

## PARK XP, BURIAL, LOVEHEARTS (v0.289a)

### Bones are currency, not an XP drip

Nothing about *picking up* a bone grants XP — not the drop, not the chain, not the magnet, not
the golden bird. `pkGain` only touches `PK.bones`. A run becomes levels in exactly two ways:
the bank paying out `pkRunXP()` (kills + side objectives, unchanged), and **burying**.

`BURY_UNIT`/`BURY_XP` hold the 10→2 rate in one place. `pkLevelsFromXP()` walks `xpNeed()` from
where he actually stands, so the button's `(~+N LVLS)` is a promise rather than a guess — it
shows `~+0` rather than implying a level it cannot pay. Side objectives still award immediately
through `pkAwardXP`; any new one should do the same so it lands on the result card.

### The burial ceremony

**Two ways in, and the state is deliberately not on PK.** `BURY` is module-level with a `src`
saying which pile it is spending, because the burial belongs to the dog rather than to a park run:

- **Home** — tapping the wallet's gold bone (`#bonesRow`). Spends `S.snacks` (bone treats). It
  states the XP *and* the real level gain before taking anything, and refuses while he is out.
- **Park** — the exchange panel's BURY FOR XP row. Spends `PK.bones`.

`pkBuryUpdate` is ticked once from `loop()` so it runs in any mode, and `pkDrawBury` is called
from both `drawCam` and `parkDraw`. `parkUpdate` just early-returns while `BURY.on` (landing an
airborne leap first, same guard the panels use). The v0.289a version was park-only and could not
be reached from home at all.

The point of it is the acceleration: `BURY_GAP0` (0.30s between bones) eases toward `BURY_GAP1`
(0.028s) via `BURY_RAMP`, so it starts as a drip and ends as a pour. Measured over a 300-bone
burial the gap went 0.30 → 0.084. `PK.bones` drains one shovelful at a time so the counter on the
pad is always the truth, and **the XP is awarded once, at the end**, for exactly the number the
screen promised.

### Hold to bury, and the growth spurt (v0.292a)

The burial is now a **hold**, and it levels him live while you hold it.

- `BURY.ph` runs `open → hold → close`. Nothing is buried until the screen is held; letting go
  wraps it up after `BURY_LETGO` (1.2s), which is a grace rather than a hair trigger so a slipped
  thumb can grab straight back on. Both canvases feed one `BURY.held` flag, and a lost pointer
  (`pointercancel`/`pointerleave`/window blur) counts as letting go.
- XP is awarded **per bone** through `buryAwardXP`, which levels `S.lvl` directly rather than
  banking behind the usual tap-gated bar — the whole point is the bar filling, popping white and
  going round again. It keeps `XPANIM` in lockstep and clears `S.pendingStage`, so the ordinary
  DOGCAM bar never afterwards demands a tap for a level this ceremony already celebrated.
- The wrap-up says `BONES GREW N LEVELS!`.

**The growth spurt (`#evoPanel`) is a direct child of `#app`, not of `#panel`.** Nested inside the
control panel it only covered the half of the screen it lived in. It sits at `z-index:70`, above
`#start` and `#choice`, with rotating rays, a portrait pop, a ring pulse and DOM confetti (canvas
confetti cannot sit above the canvases).

Two traps, both real bugs found by playing it:

1. **Only stages 10 and 25 may interrupt a pour.** 5 and 50 change what game you are playing —
   the park opening, the crossroads — so they queue on `BURY.deferQ` and fire once the hole is
   filled. Letting stage 5 resolve mid-burial called `startPark()` while the burial still owned
   the frame.
2. **`parkUpdate`'s "world is frozen" return must come AFTER the `!PK.started` build block.**
   Freezing the frame before the world exists left `PK.x`/`PK.WW` undefined while `parkDraw`
   carried on, which is a non-finite value into every gradient in the park.

Also: `#evoPanel>*` set `position:relative` on the confetti (two ids beat one class), which laid
every spark out **in flow** and shoved the panel's contents off centre. The selector excludes
`.evoSpark` now.

### Lovehearts

A rare wave event (`LOVE_WAVE_CHANCE` 10%, rolled once per wave alongside the other wave spawns,
and any unfinished line is cleared on wave advance). 5–7 hearts on a sine-offset line through
ground cleared with `pkClearAround`, away from the gate, the bandana dog and BONES.

Only `nodes[next]` is collectible; the rest are drawn dim but **legible** with a dotted thread
between them — at 32% alpha they vanished into the grass and it stopped reading as a trail at
all. Each in-order pickup plays the next note of `LOVE_TUNE`; out of order says IN ORDER and
costs nothing. He has to walk them, not fly (`PK.z<WING_CLEAR_Z`).

Completing the line runs `pkLoveActivate`: everything within `LOVE_CONVERT_R` gets `e.love`, and
`pkLoveEnemyTick` takes over their whole update via an early `continue` in the main enemy loop —
which is *why* they can never damage him, rather than relying on remembering to check `e.love` at
each of the fifteen contact-damage sites. They hunt the nearest non-love enemy and shove it
through `pkPalHit`. When `LOVE_MODE_T` runs out every survivor is cleared; no permanent
friendlies. `love`/`loveTgt`/`loveCd` are in `EN_FIELDS` so a pooled enemy is never reborn charmed.

### Regen cap

`REGEN_MAX_ON_FIELD` = 2. A third green pickup is noise, and stockpiling them removes the
decision about when to go and get one.

## FRIENDS: pack, cut and rear guard (v0.288a)

Squirrel, cat and ape each got their own overhaul. **The bird flock is deliberately untouched.**

### The squirrel is a pack

One recruitment buys a *commander*. The `sq` pal object stays the single entry in `PK.pals` —
so the Friends panel, the HUD row, the stay button and all the tier logic keep working — and
grows a `units[]` of up to five squirrels that fight as a unit.

`pkSqSync(p)` mirrors the pack back onto the controller every frame: `p.x/p.y` as the centroid,
`p.hp/p.hpMax` as the sum over living units. **That mirroring is load-bearing, not cosmetic.**
Eight separate places read a pal's position or health directly (heal sparks, the FRIEND DOWN
marker, the world draw cull, the ape's own target scoring). Without it every one of them reads
`undefined` off a pal that no longer has a position of its own. If you add a pack-like friend,
copy this pattern.

- Formation: a ring at `PACK_R` around BONES, leaning forward along his heading while he runs,
  marching slowly (`PACK_PATROL_SPD`) while he stands still, and holding over the stay point when
  told to stay. Siblings shove each other apart (`PACK_SEP`) so the ring never collapses.
- Targeting is shared and resolved **once per frame** for the whole pack — nearest to BONES, not
  nearest to each squirrel. Five squirrels each picking their own target is five pets, not a pack.
- T4 lasers are staggered: `PACK_LASER_MAX` (2) beams live at once, so it reads as a firing line.
  Each unit still runs all three existing safety layers unchanged (`pkPalAimSafe`, the angular
  exclusion, and the beam physically stopping short of BONES). Verified: BONES is never hit.
- A unit dies on its own; the commander is only gone once `units.length===0`. **One squirrel comes
  back per wave** via `pkSqWaveRespawn()`, called from the wave-advance path. An upgrade also
  grants one immediately. Healing tops up living units only.
- Prices raised to 30/70/120/200 — a pack of five is not a 91-bone buy.

### The cat cuts ahead

Replaces the single-target pounce. It stations ahead of BONES (lead scales with his speed) and
leaps one continuous line through the crowd, hitting up to `pkCatCut(tier)` = 3/5/7/10 enemies,
tracked in a per-leap `hitSet` so nothing is hit twice. Hit resolution is a swept segment test —
the same along/perp projection `pkSwordHeldUpdate` already uses.

**Two traps, both found by playing it:**
1. The station runs away at BONES' own speed, so a cat capped at its tier speed can never get in
   front — it just trails him and never cuts. It now chases at `max(catSpd, PK.spd*1.4)`.
2. The original "only cut once you have arrived at your station" gate meant it essentially never
   cut, because it never arrived. Replaced by `PAL_CAT_RECOVER`, a short breath between cuts.

### The ape is the rear guard

- A `rejoin`/`rejoinAir` state: past `PAL_APE_LEASH*PAL_APE_REJOIN_F` he drops the cycle for a
  short fast hop back to BONES, **with no smash on landing** — it is pure travel.
- `pkApeSmashR(tier)` grows the blast 74 → 104. It is threaded through `drawPal` too, which uses
  it in three places for the air telegraph and the landing ring.
- `pkApeBestTarget` gives a mild score bonus to clusters *behind* BONES' heading.

### Performance — read before touching this

A pack of five multiplies every per-pal query by five, and three separate things had to be fixed
to stay at parity. Measured by wrapping `pkPalsUpdate`+`pkPalDamage` (whole-frame timing in
headless Chromium is far too noisy — the same build varied 23→35ms between runs):
**0.255ms/frame before, 0.265ms/frame after**, with 150 enemies and a full T4 pack.

1. `pkPalDamage` walked all of `PK.en` twice per pal. Now `pkEnemiesNear` for contact, and the
   active beam list is gathered **once per frame** rather than re-scanned per pal.
2. The cat re-scored every enemy in seek range every frame, and scoring is a grid query *per
   candidate*. Throttled to `PAL_CAT_SCAN` and bounded by `PAL_CAT_SCORE_MAX`.
3. A squirrel whose nut was still on cooldown was running a wide grid query for an answer nobody
   would use, and a unit with no safe laser line re-asked every frame. Both now gated
   (`PACK_LASER_RETRY`).

## DOGPARK CAMERA: fixed permanent zoom creep (v0.287a)

`pkApplyZoom` had three sources compounding into one ceiling that were never supposed to share
one: BIGGER BARK / FASTER BARK shop upgrades wrote a **permanent** `zoomFromBark` (+0.025/each,
cap 0.25) meant years ago as "bigger bark → show more", and Whirlwind Slash wrote a **permanent**
+0.12 to that same field on every single cast — a few spins maxed it instantly. None of it ever
released. Combined with `pkApplyUISplit` growing `#cam` toward ~71% of the screen at max wave
zoom, a heavily-upgraded run at wave 10+ drew a genuinely tiny, sparse world.

Fixed by separating **what owns permanent framing** from **what gets a temporary cinematic
punch**, the same distinction the file's own comments already drew for Heavenly Judgment:

- Bark upgrades touch only `barkR` / `barkMax` now. Zero camera effect, ever.
- Whirlwind's punch is `pkZoomFromSpin()` — derived live from `pkWhirlwindGrowP()`, the same
  0→1→0 envelope already driving the blade's own magical grow/float. It rides down with
  `PK.whirlwindT` in `pkSwordSpinUpdate` and hits exactly 0 the instant the blade settles — no
  separate timer to keep in sync by hand, unlike Judgment's `zoomFromJudgment` which still needs
  its own explicit release.
- `PK.zoomFromWave` is the **only** permanent source left. `pkApplyZoom` is now `1 - wave - temp`,
  floored at `PK_ZOOM_FLOOR` as a last-resort safety net for the rare moment both cinematics land
  at once.
- `zoomFromBark` is deleted — init field, both shop entries, the old inline write in
  `pkWhirlwindSlash`. Grep it before reintroducing anything like it.
- `PK_ZOOM_FLOOR` 0.45→0.55 and `PK_BOTTOM_SHRINK_MAX` 0.5→0.30, now that bark upgrades can't eat
  into the same budget the wave progression needs — the pad gives up at most 30% of its height
  instead of half, so wave 10 stays readable.

## TRAINED ATTRIBUTES (v0.286a)

The middle layer the game was missing. Needs are how he feels right now, level is how far he has
come; STRENGTH / STAMINA / HEALTH (`S.str` / `S.stam` / `S.vit`) are how capable he actually IS,
and they do not care whether he ate this morning. Search the file for `TRAINED ATTRIBUTES`.

- **Never in the six need meters, never white/red.** They are gold everywhere (`.abar`, `.arow`),
  because "he is weak" must never read as "he is hungry".
- **Two growth channels.** A skill point per level is raw +1, no curve — an assigned point is a
  decision and should feel like one. Everything *earned* (agility drills, a park run) goes through
  `trainAward()` → `trainGain()`'s full/half/quarter curve, is scaled by `trainEfficiency()` (low
  energy/mood trains badly), and stops dead at `ATTR_FULL`.
- **The point is paid at the tap-through**, where `XPANIM.lvl++` happens — not in `addXP`, which
  only banks the level. Same reason everything else in this game reads `XPANIM.lvl`: a level
  sitting unclaimed in the bar has not happened yet. `devSync` back-pays whatever it skips.
- **Overfill is points-only.** Spending into a full attribute pushes to `ATTR_CAP` (150) and
  bleeds back at 1 point per `ATTR_DRAIN_SEC` (20s) via `attrTick` in the main loop — everywhere,
  including mid-run. `attrF()` returns 1.0 at full and 2.0 at the cap, so every effect doubles;
  `attrF1()` clamps at 1 for things that would be silly doubled (need drain, rest), `attrF15()`
  at 1.5 for cooldowns.
- **One number per effect.** Everything reads `attrF(k)` — park `spd`/`maxhp`/`knock`/`barkR`,
  `pkBarkDmg`, `pkSwordDmg`, `pkWingStompDmg`, `pkOverCap`, `pkArmorCap`, the wing cooldown,
  park need drain, `pkExitCosts`, `tickStats` rest recovery, `startOuting` duration, and
  `computeForm`'s spd/jmp. Add a new effect by multiplying, not by branching.
- **Readouts:** the doggie log (needs + attributes + the spend button), the status bubble, the
  menu save card, TODAY'S FORM on the pre-run screen, and the park result card's TRAINING line.
- **Old saves back-pay.** `loadGame` detects `data.S.str===undefined` and grants `S.lvl-1` points,
  so a long-running dog is not left staring at three bars he cannot move.
- Dev bar: +5 SKILL PTS.

## THE DOGGIE LOG (v0.285a)

Notices used to flash past on `#camMsg`, a strip laid over the DOGCAM. Anything the player wasn't
looking at was simply gone, and a long line scrolled sideways slower than it could be read. That
whole subsystem is deleted — strip, marquee animation, the tap-ceiling that stopped it swallowing
bowl taps, all of it.

`toast()` now calls `dogLog()`, which pushes onto `DOGLOG` (newest first, `DOGLOG_KEEP` = 10).
The `#doggieLog` button is the first child of `#home .body`, so it sits at the top of the controls
under the MENU/TO-DO/SUPPLIES/SHOP row and everything else flows down from it. It shows the newest
entry; identical repeats collapse into an `(xN)` counter instead of filling the log. Tapping opens
`#dlogPanel` with all ten, timestamped, red ones still red.

The floating `#toast` is still the fallback for the two places the control panel isn't ours: the
title screen and a live park run (`PARK_HDR`).

## DOGPARK UNLEASHED: the wings (v0.284a)

Built to sit beside the sword, deliberately as its opposite: the sword is a weapon, the wings are
an exit. Same lifecycle, same idioms — search the single file for `THE WINGS`.

`WINGFRAMES` is a 7-frame unfurl (0 folded → 6 fully spread) extracted from the owner's sheet and
**aligned on the harness base**, not normalised per frame: the frames are *supposed* to grow, that
growth is the unfurl. Cell 196x131, anchor x=98 y=127 (`WING_ASPECT`, `WING_ANCHOR_Y`). Flap loop
is 4,5,6,5.

- **Arrival.** Wave `WINGS_WAVE` (3) of an UNLEASHED run: `pkWingsDrop()` picks a site with
  `pkSwordSite()` and `pkWingsCineUpdate` owns the frame — they descend slowly, fully spread,
  inside a golden shaft, and settle hovering. No crater, no scorch: they do not scar the park.
- **Claim.** Walk within `WINGS_TAKE_R` carrying `WINGS_COST` (500) bones. Same nag-toast pattern
  as the blade when he is short.
- **Leap.** Double-tap anywhere on the pad → `pkLeap()`. **Hold** the second tap to stay up
  (`WING_HOVER` 5s ceiling, `WING_MIN_HOVER` floor so a flick still buys a real jump); release to
  dive. Costs `WING_STAM_COST` from its own meter, then `WING_CD` seconds of cooldown. Empty tank
  routes to `pkWingFlop()` — a 22px hop and a 1.6s limp.
- **Immunity.** Above `WING_CLEAR_Z` he and the horde cannot reach each other. This is one line:
  `pkInvuln()` already gates all fifteen damage sites in the park, so altitude was added there
  rather than to each site. His own offence is gated the other way (bark, sword cut, whirlwind,
  pickups, the gate) on `PK.z<WING_CLEAR_Z`.
- **Landing.** `pkWingLand()` — falloff damage through `pkPalHit` (so kills route through
  `pkDownEnemy` and drop bones normally), big knockback, four shockwave rings, dust and feathers.
- **Upgrades.** Three capped shop entries once the wings are his: DEEP LUNGS (capacity), FAST
  FEATHERS (regen), HEAVIER STOMP (damage + radius).
- Dev bar: GRANT WINGS, so the leap is testable without banking 500.

**The trap, if you extend this:** a panel or a cutscene early-returns out of `parkUpdate`, which
means a leap in progress has nothing left to land it — he hangs in the air and `pkLeap` refuses
forever after, because `PK.jump` is still set. There is a guard at the top of `parkUpdate` that
lands him first. Any new pause path needs to be added to it.

## Known gaps / backlog (owner's priorities)

1. **SAVE / PERSISTENCE — #1 priority.** localStorage is unavailable in the current preview
   environment, so there is no save at all. This is the first thing to build in a real
   app/APK context. Everything else is emotionally worthless without it.
2. Economy has never been playtested with a ledger — money-per-minute at work vs competitions
   vs park banking is unverified. Suspected too loose.
3. Levels 50–250 are an empty desert: no unlocks, no ceremonies. Either add milestone content
   every ~25 levels, lean into the successor/legacy system as prestige, or cap lower.
4. Audio is all square-wave beeps. One real bark sample would do more for identity than any
   new sprite.
5. Photo mode → memorial wall (the wall exists, nothing fills it).
6. Art wanted: puppy sprite set to the fixed-cell spec (currently the puppy just renders the
   adult sprite scaled down), senior bark/rest/shake, breed variants (Whippet, Husky — both
   are shown locked on the adopt screen), charm overlays drawn on the dog.
7. Planned but unbuilt: catapult toy (extends the trick-shot minigame alongside the hoop).

### The burial gets its own screen (v0.293a)

Drawn over the DOGCAM the ceremony had the control panel sitting under it, which made a quiet
moment look cluttered. It now owns **`#buryPanel`** — a direct child of `#app` at `z-index:68`
holding a single `<canvas id="burycv">` — so it covers both screens on pure black. `pkDrawBury()`
takes no arguments any more; it fits its own canvas and is called straight from `loop()`, not from
`drawCam` or `parkDraw`.

- **The hole is dead centre and it is the button.** `cx=w/2`, `cy=h*0.52`,
  `R=Math.min(w,h)*0.20`. `buryHitHole()` gates every press; a tap on the black around it gets a
  soft refusal beep and nothing else. That is what makes "HOLD THE HOLE" a real instruction.
- **The prompt clears out of the way.** "HOLD TO BURY" and the dashed breathing ring only draw
  while `ph==="hold" && !held`.
- **The pile.** Every `BURY_PILE_STEP` (100) bones adds a layer, up to `BURY_PILE_MAX` (14), so a
  big burial physically fills the hole. Drawn **clipped to the hole ellipse** so it can never
  spill over the lip: a dim shadowed dome for the gaps, then three bones per layer scattered by
  the golden angle and shaded by depth — the dome alone read as a smooth grey lump.
- **Bones enter at `BURY_DROP_TOP` (0.20h)**, below the readout, and fade in over the first tenth
  of the fall. Dropping them from the very top ran the whole stream straight through
  "BURYING / n / N / BONES".
- **There is always a door.** `< BACK` (`< DONE` once bones are in) sits top-left and calls
  `pkBuryFinish()`. The panel covers everything, so leaving it exit-less meant a mis-tap trapped
  you until the 9s `BURY_ABANDON` timer.

### The long game: cap 99, tripled XP, and a bed worth sleeping in (v0.294a)

The whole progression used to be over in an evening. It now runs to **`LVL_CAP` (99)**, which is
the single constant every guard reads — there is no `250` left anywhere.

- **`xpNeed(l) = 3*(20+l*8)`.** Tripled. Level 1 costs 84, level 98 costs 2412.
- **The cap is hard.** `addXP` returns at 99 and `buryAwardXP` returns before it adds anything, so
  neither route banks XP past it. Both then clamp `S.xp` to `xpNeed(LVL_CAP)`, because the award
  that carries him to 99 can arrive with far more than the last level needed and the bar would
  otherwise hold a meaningless number for the rest of the save.
- **Milestones are 5 / 10 / 25 / 99** in `addXP`, in `buryAwardXP`'s `evoQ`, and as `EVO_STAGES`
  keys. Park unlock stays at 5; Junior 10, Prime 25, and the **Crossroads is 99**. `pkBuryEvoCheck`
  defers 5 and 99 (not 5 and 50) — those are still the two that change what game you are playing.
- Senior size is **0.9**, down from 0.94.
- **`LVLREWARDS` and the gates that grant those items are stretched to match** — 3/8/14/18/25/35/
  45/55/70/85. `CHARMS[].unlock`, the agility `req`, the breeder `req` and their "UNLOCKS LV.n"
  copy all carry the same numbers; changing the reward table alone would have announced unlocks
  that had already happened.

**The bed.** `bedAdequate()` now decides more than a ceiling:

- Rest is only ever at the bed. `toggleRest` always sets `bedTarget`, and the `rest` branch of
  `camBehavior` walks him back if he is ever resting more than 0.05 away from `BED.x` while an
  adequate bed exists.
- A nap on a bed that fits recovers at **4.4/s** against 2.4 elsewhere, and lifts mood (+0.30/s)
  and fun (+0.22/s) while he is on it — measured over 6s: energy 20→47.8, mood 40→44.0, fun
  40→40.4, against 20→35.1 / 40→41.8 / 40→39.1 on a bed he has outgrown. The 70% ceiling for a
  wrong or missing bed is untouched.

### THE HOLLOW — the boss fight (v0.295a)

Clear wave 9 in either DOGPARK or UNLEASHED, spend at the shop that follows, and a wolf-serpent
comes up out of a rift and takes the screen. The park freezes whole; BONES is penned into a small
black board underneath it and has to dodge, Undertale-style.

- **Its own panel.** `#bossPanel` (z-index 67, direct child of `#app`) with one `<canvas
  id="bosscv">`, for the same reason the burial has one: drawn over the two park canvases the
  control pad sits underneath, and a boss with a HUD under its chin is not a boss. Updated and
  drawn from `loop()`; `bossOn()` is added to every gate that already lists `PK.shop`.
- **Entry is scripted, once.** Clearing wave 9 sets `PK.bossPending`; `parkUpdate` fires
  `pkBossStart()` the frame no panel is up. `PK.bossDone` means it never repeats in a run.
- **The body** is six sprites — rift, coilC/B/A, neck, head — stacked up a swaying spine and drawn
  back to front, sized off the band so it always fits. The carry between segments is **damped
  (`acc = seg.ang + acc*0.55`), not summed**: summing five sway angles leans the head 40-odd
  degrees and the whole animal falls over sideways.
- **The head is the telegraph.** Six cells — front / roar / left / right / rear / dip — picked by
  `BOSS_HEAD[telegraph]`, so it always looks at what it is about to do a beat before it does it.
  That look is the only warning there is. CROSS is a double head-shake rather than a new pose.
- **Patterns** (`rain`, `sweepL/R`, `ring`, `cross`, `surge`) are spawner objects in box-local
  coordinates, each with a clear safe gap. Phase 2 at 66% unlocks cross and speeds the sweeps;
  phase 3 at 33% unlocks surge and can run two at once. A pattern ends when it stops **feeding**,
  not when the board empties — waiting for the last bullet doubled every cycle to ~13s; stragglers
  now finish crossing during the breath, where they still have to be dodged.
- **There is no attack button.** The boss loses HP when a pattern finishes: 16 clean, 9 if it
  landed a hit. Dodging *is* the damage, so the fight always ends and ends sooner the better it is
  played. Measured: ~124s for a player who never moves once; roughly 50s played well.
- BONES is a black dog on a black board, so he gets a warm pool, a one-pixel inverted rim, and the
  **hitbox drawn honestly** as a red dot — what the bullets are actually tested against.
- Dying in there hands off to the park's own `pkDeath()`. Dev button: `#devBoss`.

**Art** is sliced from the supplied sheets by `scratchpad/slice.py` + `mkwolf.py` into `WOLF` /
`WOLFIMG` (~490KB). Two traps worth keeping: flood-filling the background walks straight in
through the wolf's dark fur outline, so the cutout is threshold + largest-blob + **hole-fill**
instead; and a plated segment thresholds into one piece *per plate*, so the mask is **bridged**
before labelling. Quantise with **FASTOCTREE, never MEDIANCUT** — median-cut drops the red eyes
and the lava entirely, because on a mostly-grey sprite the saturated reds are too few pixels to
earn a palette slot.

### Dev mode: the wave-skip bug, and real coverage everywhere (v0.296a)

**The bug.** `#pkDevSkip` ("SKIP WAVE") set `PK.waveSpawned=PK.waveQuota` and cleared `PK.en`, but
the real clear check a few hundred lines down in `parkUpdate` — `pkWaveDone()>=pkWaveGoal()` — reads
`PK.waveKills` (`PK.apeKills` on the ape wave), never `waveSpawned`. The button had been silently
inert since whatever change moved the wave-goal off a spawn count onto a kill count; it cleared the
field and then the wave just... didn't end. Fixed by setting the counter the check actually reads.

**Dev mode is a single global toggle, not per-screen.** `toggleDevMode()` flips `#devbar`,
`#pkDevbar` and (now) `#runDevbar` together — the PIN unlocks all three at once, and tapping any of
the three corner gears again while already unlocked hides all three. That's the existing design
`#pkDevToggle` established for the park; `#runDevToggle` on the run screen (new) follows the same
rule rather than inventing a second one. `#devbar` also gained `position:relative;z-index:46` — it
had grown past where the floating music button (`z-index:45`) sits and lost taps to it.

**New in the park devbar:**
- `SKIP TO BOSS (W9)` — one tap: wave 9 marked cleared, the real pipeline runs (outro, shop, wave
  10, `bossPending`), close the shop and THE HOLLOW comes up.
- `JUMP TO WAVE…` — `prompt()`-based, lands fresh on any wave 1-60 (mixed types, ape wave, whatever
  needs testing) without playing there.
- Both share `pkDevSetWave(n)`, a **fresh**-wave reset (quota/spawned/kills/mix/golden), deliberately
  lighter than the real advance path — no bark/knockback creep, since that only means anything over
  a played run, not a jumped-to one.
- `MAX SWORD`, `MAX FRIENDS` — instant, free, no cutscene. `pkBuyPal()` itself never touches
  `PK.bones` (the shop tap does that separately), so calling it straight from a dev button for free
  was already safe.
- `GOLDEN NOW`, `ALPHA SQUAD NOW` — force either encounter immediately regardless of the wave's
  own timer.

**New in the home devbar** (all stay on the home screen — none of them call `showScreen`, so the
devbar never has to follow them anywhere): `AUTO AGILITY`, `FREE BEACH DAY`, `FREE COMP ENTRY`
(bumps the level gate rather than bypassing `openPre` — the real panel still renders), `INSTANT
LITTER`.

**New: the run screen can unlock dev mode on its own.** `#devbar` lives inside `#home`, which
`showScreen("run")` hides — so the corner toggle that already worked for the park needed a twin
here. `#runDevToggle` + `#runDevbar` (`WIN RUN`, `FAIL RUN`) drive `endRun()` directly, covering
daily/practice/comp result screens without having to actually clear or fail a course.

**Left out, deliberately:** `#work` and `#paperboy` don't get their own devbar. Both already have a
one-tap way back (CLOCK OUT), so a dedicated skip button was marginal value for real added risk —
this was a scoping call, not an oversight.

### Boss music, and panels that stop stealing the track (v0.297a)

**`MUSIC_BOSS`** — THE HOLLOW's theme, encoded exactly like the other two: **MP3 CBR 64 kbps,
44.1 kHz, joint stereo**. That is what `MUSIC_GOODMOOD` and `MUSIC_DOGPARK` already are; the
convention was read off their frame headers, not guessed. There is no ffmpeg on the box —
`pip install imageio-ffmpeg` provides a static binary.

What "optimised" meant here, measured rather than assumed:
- Trimmed to its own edges. The source carried 1.4s of dead air on the tail, which on a looping
  track is a hole. (`MUSIC_DOGPARK` has ~3s of the same and still does — out of scope, but if you
  ever want the park loop tighter, that is the free win.)
- **+6.1 dB.** The source sat at p95-block −17.6 dB against DOGPARK's −10.8; it would have been
  audibly the quieter fight. Now −11.9 dB, peaking −1.4 dB — and unlike DOGPARK, which has 1619
  clipped samples, it never clips.
- Lowpassed at 15 kHz. The source is HE-AAC, so everything up there is SBR-synthesised fizz that
  LAME would otherwise spend bits on at 64k.
- Left in stereo: L/R correlation is 0.62, so there is a real image to lose.

**Panels over a live run no longer swap the music out.** Opening the wave shop used to hand the
room to the little procedural menu melody, which threw the run's momentum away every single wave.
The park track now keeps playing and moves behind a door instead — see `setMuffle`: two cascaded
lowpasses to 520 Hz (one 12 dB/oct stage alone just reads as "quieter") plus a duck to 0.62.
Measured through the live graph, that takes the spectral centroid 2569 Hz → 478 Hz.

Three traps worth keeping:

1. **`typeof PK` does not save you inside a `const`'s temporal dead zone — it throws.** Boot calls
   `syncMoodMusic()` before `const PK` further down the file has initialised, so anything it
   reaches that touches `PK` aborts the rest of the script and leaves every later `const` in TDZ
   (the symptom is a baffling "Cannot access 'PK' before initialization" from a function that
   looks nowhere near the problem). `syncMusicMuffle` tests the early `let parkMusicOn` **first**
   for exactly this reason. The `typeof PK` idiom already elsewhere in the file only survives
   because of call ordering.
2. **`createMediaElementSource` permanently reroutes an element and silences its direct output.**
   So the graph is built lazily, on the first muffle, and only while `AC.state==="running"`; with
   no context to route through the music simply keeps playing unfiltered. The important half of
   the feature (not swapping tracks) does not depend on the effect working.
3. **It connects to `AC.destination`, not `MUSICBUS`.** An unrouted `<audio>` element bypasses the
   bus and the master limiter, so going through them would have quietly signed the music up for
   `sfxDuck` and compression the first time a shop opened — a mix change nobody asked for,
   halfway through a run.

`#settingsPanel` is deliberately still a menu-melody screen: it is the same global panel the home
screen opens. The muffle applies to shop / convert / friends / gate / end-run.

---

## Suggested first prompt for Claude Code

> Read HANDOFF.md, then bones.html and bones.js (skim park.js). Don't change anything yet —
> confirm you can run the build command and produce a working single-file output, then tell me
> what you'd do first about the save system.
