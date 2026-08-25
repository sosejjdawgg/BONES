# BONES — project handoff

A mobile-first dog-care sim built as ONE self-contained HTML file. Brutalist black/white/red
pixel art, Press Start 2P font. Split screen: DOGCAM (canvas, top) + console controls (bottom).
Currently **v0.309a**.

---

## ⚠ WHICH FILES ARE REAL (read this first)

**The live game is `bones-v0.284a.html` — a single self-contained file.** Open it, edit inside
its one big `<script>`, save it back out under the next version number. That is the whole
workflow now.

```
bones-v0.309a.html   THE GAME. ~8.3MB, everything inlined. Edit this.
bones-v0.308a.html   previous build (WOLFIE, and the hole you wake him from).
bones-v0.307a.html   previous build (bark no longer kills during Lovey Dovey).
bones-v0.306a.html   previous build (Lovey Dovey brush, the Hollow gate + burial).
bones-v0.305a.html   previous build (the five beats, and the roar).
bones-v0.304a.html   previous build (the park opens for THE HOLLOW).
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
h=open('bones-v0.304a.html').read()
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

### THE HOLLOW arrives, and the whole screen is the pad (v0.298a)

**The arrival.** There is no cut to a fight that has already started. Closing the wave-9 shop now
runs a 1.75s sequence, driven by one clock (`BOSS.introT`) with **overlapping** windows rather
than five exclusive states — the beats are meant to bleed into each other:

| window | beat |
|---|---|
| 0.00–0.35 | the world rolls 8° and punches in — it looks away |
| 0.20–0.90 | rumble, escalating; dust shaken up out of the ground |
| 0.55–1.10 | the floor cracks: the rift scales open, red light spreading |
| 0.85–1.40 | it comes up through the hole, head forced to `roar`, one shake spike |
| 1.40–1.75 | name, bars, board and hint assemble; drag goes live |

Through the first three beats **the park is still there and visible** — that is the whole point of
the effect. `#bossPanel`'s CSS background is now `transparent`; the scrim is painted on the canvas
and only ramps to 0.86 between 0.55 and 1.25. No bullets, no damage, and no drag exist before
1.40, so there is no way to be hit by a fight that has not started.

Three things this needed that were not obvious:

1. **The roll goes on `#game`, not `#park`.** `#park` is only the control pad — rolling it tips
   the HUD while the DOGCAM above it stays dead level, which looks broken. `#game` holds both
   screens, and `#bossPanel` is its sibling under `#app`, so the overlay never moves with it.
2. **The scale is a real cover scale, computed from the element's own aspect** —
   `max((w·cos+h·sin)/w, (h·cos+w·sin)/h)`. A rotated rectangle leaves triangles of background at
   its corners, and on a 414×896 frame a generic fudge factor is nowhere near enough; the first
   version showed bright white wedges. `#app` is painted black as the backstop.
3. **Rise and death are one number played in opposite directions.** `sink` is 0 at full height and
   1 fully inside the rift; the arrival runs it 1→0 and `pkBossKill` runs it 0→1, which is why the
   two read as the same move reversed. The segment gate is `crack<0.40`, not `<1` — the erupt
   deliberately overlaps the crack, and gating on a finished crack held the wolf underground for
   most of its own entrance.

Audio follows the same shape: the park track fades at t=0, the rumble plays against **nothing**,
the breakthrough hits at 0.85, and the theme comes in at `BOSS_MUSIC_AT` (1.30). `pkBossHasRoom()`
exists so the little procedural menu melody cannot rush in to fill that silence.

**Controls: the whole overlay is the pad.** The board is a clamp on where BONES can END UP, not on
where you are allowed to touch — dragging from the wolf's face works, which on a phone is most of
the screen. It is deliberately **the same relative stick the park already uses** (`pkPad`'s own
delta/30 clamped to unit length, driving velocity), not absolute position-follow: absolute would
pin him to the nearest wall whenever a finger sat outside a small board, and it would be a second
control language to learn one wave from the end of a run. Copy is now `DRAG ANYWHERE TO DODGE`,
which also matches the pad's existing `DRAG ANYWHERE TO MOVE BONES`.

Trap worth keeping: `hurt` is read by both the board border and the health bar. Wrapping those in
separate `if(uiA>0)` blocks put it out of scope, and because `pkDrawBoss` is called straight from
`loop()`, the throw took the whole rAF chain down with it — the game froze solid at the first
frame of settle. Anything shared across those blocks has to live above them.

### The boss controls weren't actually park's scheme (v0.299a)

v0.298a's `pkBossDogMove` said in its own comment that it matched the park's control language,
and the STICK maths (relative, delta/30, clamped to unit length) genuinely did. The MOVEMENT did
not: it added `d.vx += (tx-d.vx)*k` — an exponential lerp toward the stick's target velocity —
which the park's real move block (`parkUpdate`, ~line 10588) simply does not have. Park **snaps**
velocity straight to `direction*topspeed` the instant the 0.1 deadzone clears, and only decays it
(`*0.8` per frame, no `dt` scaling — copied verbatim) once the stick is released. The lerp was
extra smoothing nobody asked for, and it's exactly what read as "slippery": every direction change
lagged a beat behind the touch instead of answering it.

Fixed by replacing the lerp with the same snap-then-decay block, unchanged in shape, box-clamped
instead of wrapping the toroidal world. Verified against the real park block: full stick to
`BOSS_DOG_SPD` (330) in one frame, a direction reversal answers just as instantly, and release
decays at the same `*0.8`/frame park does.

### BONES faces eight ways in DOGPARK (v0.300a)

He used to be one side-on run cycle, flipped when he ran left, whichever way he was actually
going. He now has all eight compass facings, from five supplied 2048x2048 sheets — **S, SE, E, NE,
N** — with **W, NW and SW drawn as those same sheets mirrored**. `mkdirs.py` + `pkdirs.js` in the
repo root regenerate the art; `PKDIRS` / `PKDIR_MAP` / `pkDirDraw` are the runtime side.

What the sheets actually are, since it isn't obvious from looking: each is an 8x8 grid of 256px
cells, but it is **an 8-frame cycle repeated eight times down the sheet**, not 64 unique frames
(frame 8 matches frame 0 to within 0.001 on the two clean sheets; on the other three the
period-8 difference is still smaller than the frame-to-frame difference, so it is the same cycle
with render jitter). Only row 0 is used.

Four things worth keeping:

1. **Frames are cropped to the direction's UNION bbox, not per frame.** Tight-cropping each frame
   independently makes the dog jitter, because every frame's crop origin moves.
2. **`ax` is the anchor, and it is real data.** All five renders put the dog on the cell's centre
   line (x=128, measured per frame at 124-130), so `ax` records where that line falls inside the
   union crop. Sprites are bottom-aligned on the ground line, so his feet meet the shadow in every
   direction.
3. **The mirror is done by the transform, so the anchor is NOT flipped by hand.** A point `ax`
   from the left pre-flip lands `(1-ax)` from the left after it, which is exactly what W/NW/SW
   want — inverting it as well puts him half a body off.
4. **The tail-on render came out about a third small**, so he shrank every time he ran away.
   `PKDIRS.N.sc = 1.35` pulls it back onto the same body scale as the other four, measured
   torso-against-torso. The others needed nothing.

`pkFaceUpdate` has **hysteresis** (`PKDIR_HYST`) and it is not optional: without it, a thumb
resting on a sector boundary strobes him between two sprites several times a second. Measured over
400 jittered samples on the E/SE line: 0 changes. Below `PKDIR_MOVE` he keeps whichever way he
last actually went rather than snapping to a default.

THE HOLLOW's board uses the same set (`BOSS.faceI`, `BOSS_DOG_SC`) — he dodges in eight directions
in there too, and leaving that one on the old flip-only frame would have looked like an oversight.
`RUNFRAMES`/`RUNIMG` stay exactly as they were: the RUNNER minigame still uses them, and they are
the fallback for the handful of frames before the strips have decoded.

Art cost: 207KB for all 40 frames — five strips, RGB through FASTOCTREE at 32 colours with the
real 8-bit alpha put back afterwards (a hard alpha cutoff makes edges this size crawl).

### The board is the park with the walls moved in (v0.301a)

**The boss dog had a speed of its own and it was wrong.** `BOSS_DOG_SPD` was a hard 330 against a
typical `PK.spd` of ~95-125 — about three times too fast, which is exactly what "slides all over
the place" feels like. There is no board speed constant any more: `pkBossDogMove` reads `PK.spd`,
so he runs at whatever that run is actually giving him, energy and mood and stamina included.
Measured in a live fight: stick full over gives `d.vx === PK.spd` to the decimal.

**The white border is a doorway, not a wall.** The clamp (which also zeroed velocity, so he stuck
to the edge) is gone; the board wraps like the park's toroidal world. Two consequences that had to
be handled or it would have looked broken:

- **He is drawn on both sides of a seam.** Straddling the border with one draw slices him in half
  at it instead of stepping him through it, so anyone within 30px of an edge gets a second copy at
  `±B.w` / `±B.h` (and a third and fourth in a corner).
- **Bullet collision is toroidal too**, via `bossWrapD` — but only on an axis where the bullet is
  actually *on* the board. Wrapping unconditionally would make a bullet still outside the left
  edge secretly adjacent to a dog hugging the right one.

**THE GOLDEN BIRD visits the fight.** Every 18-28s of live combat (first at 8s) she crosses the
board — and she crosses *the board*, not the panel, because the dog cannot leave it and an
uncatchable bird is just decoration. Catching her sets `BOSS.golden` for 6s, during which any
bullet that reaches him is **not** damage: it is removed and sent back up the neck at the head for
`BOSS_REFLECT_DMG` (4) each. It is the only way the player deals damage on purpose rather than by
surviving. Reflected hits do not spoil `cleanRun` — reflecting is skill, not a scrape.

The reflected shots **home**. Aiming once at spawn and flying straight missed by ~12px every time,
because the head sways for the whole flight and the shot arrived where the head had been; the
trace showed closest approach 34px against a 22px hit radius. They now re-steer each frame (and
the radius is 26), which also just looks better — the shot hunts the thing that threw it.

`pkBossPhaseCheck()` was factored out of `pkBossFinishPattern` because reflect damage can now
cross the 66%/33% gates too, and a phase change that only fired at end-of-pattern would have been
skipped.

### MAW — bones spat from the mouth (v0.302a)

A sixth pattern. Huge burning bones come out of THE HOLLOW's jaw, enter over the top of the board
and fall on an arch with a slow lateral wander. `BOSS_MAW_R` is 2.4x a normal bullet, so they are
unmistakable, and each one leaves a fire trail (`BOSS.trail`, drawn under the bullets so the bone
always rides in front of its own flame, capped at 160 embers).

- **Telegraph 0.50s** — the longest in the set, because it is the heaviest read. Head cell `roar`,
  and `maw` joins ring/surge in the list that hangs the jaw open. The mouth catches light and a
  dashed arc previews roughly where it will land; the arc is **bowed outward**, not dropped
  straight, or it gets drawn down the length of his own chest.
- **The mouth is read live.** `pkBossMouthBoxX()` projects `BOSS.headX` into board coordinates each
  spawn, so bones really do come from under wherever he is currently looking, not from a fixed
  centre.
- **Never aimed.** The wander is `cos(phase + t*swayW)` off a per-bone random phase — deterministic
  motion the player can read, with no term that references `BOSS.dog`. Verified: with the dog
  parked at x=47 a bone spawned overhead ended at x=101 rather than curving in.
- **1 / 2 / 3 bones per beat** by phase; out of `BOSS_P1` entirely, so it only shows up once the
  player already knows what falling lanes look like.

**`BOSS_HEAVY` is new and matters.** A phase-three double used to pick any second pattern that
wasn't a duplicate. Two patterns that each demand watching (maw, ring, surge) at once is not a
harder fight, it is an unreadable one — so a double now excludes a second heavy. Verified over 400
rolls: 218 doubles, zero heavy-on-heavy, zero duplicates, maw only ever paired with rain / cross /
sweepL / sweepR.

Golden reflect handles them: a `maw` bone reflects as `big`, worth **double** damage (8 vs 4) with
twice the fizz, a harder shake and a lower-pitched impact.

### Board speed capped, and the hitbox is the dot (v0.303a)

**Speed.** v0.301a made the board read `PK.spd` directly, which fixed the 330 but inherited the
park's whole range — 70 to 160 depending on level, mood, energy and STAMINA — and the top of that
is far too much for a board a fraction of the park's size. `pkBossSpd()` is now the single place
it is decided: **capped** at what a healthy dog does in the park (`BOSS_SPD_REF` 118 = the 95 base
at full energy), **floored** at 0.72 of that so a neglected dog can still dodge, then **×0.80** for
the smaller field. A typical run lands at 94.4 instead of 124. Friction and the stick are still the
park's, untouched — only the top speed is reined in.

**The hitbox is now literally the red dot.** It was drawn at `BOSS_DOG_R*0.62` while collision used
the full `BOSS_DOG_R`, so a bullet landed from up to 12px away against a 4.3px target on screen —
the game was hitting well outside what it showed. `BOSS_DOG_R` is **4.4** and the dot is drawn at
exactly that, so a projectile only counts when it actually overlaps the circle you can see. Reach
drops from 12 to 9.4 for a normal bullet and 19 to 16.4 for a MAW bone. Verified: edge just clear
misses, edge just touching hits, and the old 11.5px reach now passes through.

`BOSS_BIRD_CATCH_R` was split out at 19 so shrinking the hitbox did not also shrink the golden
bird's pickup radius — that one is a reward, not a threat, and wants to stay generous.

### The park opens up instead of cutting to black (v0.304a)

THE HOLLOW used to happen on a stage: `#bossPanel` painted a flat `rgba(0,0,0,0.86)` over
everything, so the park was gone and the fight read as a mode switch. Same world now, bigger frame,
darker light.

- **The park opens to full screen.** `pkBossLayoutTick` drives `#cam` from its 42% split to 100%
  over `BOSS_OPEN_T` (0.55s, smoothstepped), collapsing the pad under it — `#cam` is `flex:none`
  and `#panel` is `flex:1`, so one height write does the whole thing. It reuses `pkApplyUISplit`,
  the same call the wave zoom already uses, and restores to `BOSS.camFrom` (whatever the wave zoom
  had left it at) rather than the CSS default.
- **The park keeps drawing for the entire fight.** What replaced the black plate is a grade:
  `BOSS_TINT_MAX` (0.55) of a green-black wash plus a `BOSS_VIGNETTE` radial. Trees, grass and
  fireflies stay readable, so the wolf comes up through *somewhere*.
- **The park stops drawing its player and its HUD**, though — two BONES on one screen reads as a
  bug. `bossHidesDog()` is deliberately **not** `bossOn()`: he stays standing in the park through
  the open and the rumble, and only goes at `BOSS_ERU_A` when the eruption covers it. Banners, the
  exit nag, the shop pointer and his bark ring go with him.
- **DOM chrome goes too.** `#cam`'s white sill, `#pkBottomBtns`, `#portrait` and the music button
  all slide to the bottom of a full-screen park otherwise. `#app.bossfight` hides them; the sill
  keeps its 5px and only loses its colour, so nothing reflows.
- **The outro plays it backwards** — the pad slides back under a park that is brightening, rather
  than the panel just vanishing.

Trap: the gate around the player draw has to sit **inside** the declarations, not around them.
`spd`, `img`, `hz` and `buzz` are all declared in that block and read again further down by the
sprite and the sword, so wrapping the whole thing in `if(!bossUp){}` throws a ReferenceError every
frame the park draws — and it boots fine, because nothing calls `parkDraw` until a run starts.

### The five beats, and the roar that opens the fight (v0.305a)

THE HOLLOW is BUILT as seven spawners but it is meant to be READ as five commands, so the flair
hangs off the **beat** rather than off the spawner. `BOSS_BEAT` is the whole mapping:

| beat | patterns | what it looks like |
|---|---|---|
| **FETCH**  | `maw`            | head pulled `rear` then `roar`; the jaw goes wide and SLAMS (`BOSS.spit`); dust off the lip of the board as the bone enters; a puff, a pock and a floor-edge flash where it lands |
| **BADDOG** | `cross`          | coils go rigid (`BOSS.stiff`), head thrown `left`/`right` on a 0.44s beat with a jaw clack, lane wash behind the bars, entry-side border flash. The bars were already the only bullets with no spin |
| **BURY**   | `rain`, `surge`  | head `dip`ped, `BOSS.riftKick` surges the rift, `BOSS.coilSquash` compresses him over the floor, surge's warn grows a shaking "lid", embers trail, and everything that goes through the floor leaves a pock |
| **PACK**   | `sweepL/R`, `ring` | `BOSS.coilBias` leans the whole chain at the active edge, that edge lights, a light runs the rim L→R→T→B (`BOSS.chase`), and ring's volley flies **locked** (`spin:a+PI/2, vr:0`) instead of tumbling |
| **WALK**   | phase three      | not a pattern — a state. Sway drops to 0.70 amplitude at 0.64 speed, he leaves afterimages, maw pairs tumble mirrored, the last mouthful of a phase-three MAW is bigger and slower (`heavy`), and under 12% HP the squash becomes a sag |

`bossHeadNow()` is what the draw reads: `BOSS.headCell` is still the pattern's base cell, and
`BOSS.headOv`/`headOvT` is a short-lived override on top. `pkBossFinishPattern` clears **both** —
leaving the override running let a BAD DOG snap hang 0.3s into the flat stare that follows.

`pkBossFlair(dt)` runs **before** `pkBossSway(dt)`, because the sway reads `stiff`, `coilBias` and
the jaw envelope it sets. Afterimages copy the spine pose (`pkBossGhost`) — the chain is rebuilt
every frame, so there is nothing to look back at unless it is snapshotted.

`SETTINGS.reduceMotion` keeps every head cell, jaw move and colour change — those ARE the
telegraphs, and dropping them makes the fight unreadable rather than gentler. It drops travel:
afterimages, the extra shake, the running light's motion, the lid jitter, the RGB split.

**The roar.** The arrival grew a second: `BOSS_ROAR_A` 1.40 → `BOSS_ROAR_B` 2.40, pushing
`BOSS_SET_A/B` to 2.40/2.75 and `BOSS_MUSIC_AT` to 2.38 (the theme now lands after the roar's
silence, not during the eruption). Read as five beats of one clock:

- **0.00–0.20** push in to `BOSS_ROAR_ZOOM` 1.62. The pivot is solved so the **head** lands at
  `(w/2, h*0.40)` — `P = (T - head*k)/(1-k)` — rather than staying pinned wherever the chain
  swayed it to. It is a transform on the **boss canvas only**: the park underneath does not move,
  so it reads as him coming at you and never as the whole game zooming. The grade is painted
  outside that save, so the tint stays flat while he grows through it.
- **0.17–0.35** three struck frames (white / ice-blue / white), peak shake, and four SFX voices
  landing within 70ms — sub 62Hz saw, mid 98Hz saw, 180Hz square crunch at +40ms, 40Hz tail at
  +70ms. Separately they are beeps; together they have a body.
- **0.42–0.74** a 2px RGB split on the **head only** (two extra copies of the same cell, offset and
  hue-rotated, under `lighter`), blue-white speed lines out of the throat, and the dust/ember blast.
- **0.70–1.00** ease back out, shake decays into ~0.12s of silence, then the theme and the board.

Traps found here: the speed lines were started at a fixed 26px from the mouth point and were
drawn straight across his own muzzle — they have to start off the head (`band*0.34`) or they read
as scratches on the sprite. And the roar's blast lives in `BOSS.dust` tagged `rb:true`, skipped by
the ground-dust pass and drawn in `pkBossRoarFx` instead, because dust drawn before the body is
behind him and a roar throws things forward.

### Lovey Dovey 2.0 — the brush (v0.306a)

The mode stopped being a radius that fired once and became something he goes and DOES.

- **Seven hearts, always** (`LOVE_NODES_MIN/MAX` both 7 — `LOVE_TUNE` has seven notes, so the
  phrase now always completes), and the mode runs **15s** (`LOVE_MODE_T`).
- **`LOVE_BRUSH_R` = 22.** Every frame the mode is up, one `pkEnemiesNear` at contact radius turns
  anything he touches, instantly. The old `LOVE_CONVERT_R` burst still fires on activation.
- **`pkLoveCanCharm(e)`** is the guest list, and it exists because of `e.boss`: the ape IS the
  objective of its wave (`pkWaveDone` reads `apeKills`), so charming it strands the run with
  nothing left to kill. Scenery, roosts, `standing` and the wave-ending kill in its send-off are
  out for the same reason.
- **Pink is a source-atop recolour laid over the real sprite**, never a filter chain. BONES and
  several enemies are near-black, and `sepia/saturate/hue-rotate` has no saturation left to push
  on black — it does nothing to exactly the sprites that need it. `pkDirDraw` gained an optional
  `tint`/`tintA` for this, going through `pkPalIconTint` (cached per strip per colour).
- **Outward bias**: the target score is `distance-from-lover − min(distance-from-BONES,180)*0.45`.
  Nearest-only pulled the whole charmed pack back through him and the brawl happened on top of
  the player. Note the 180 clamp: past that, candidates stop being separable by it.
- **The scuffle marks BOTH sides** — pink/white/red sparks at the midpoint, a two-stroke clash
  mark struck across the line between them (`HITFX` gained `clash`), a pink pulse on the lover,
  the white blowout on the victim, hearts thrown off, and two voices (high blip, low thud).
  Budgeted at `LOVE_SCUFFLE_CAP` bursts a frame or fifteen charmed squirrels bury the frame.
- Mode end is unchanged: everything's `love` is cleared. No permanent friendlies, ever.

### THE HOLLOW is the gate, burial is the reward (v0.306a)

- **`bossPending` now requires `PK.plusMode && PK.wave===10`.** A regular Dogpark run never meets
  him and therefore never unlocks anything on its own.
- **`S.hollowBeaten`** is set in `pkBossKill` and is what opens burial — permanently, on the save,
  across generations (the generation reset lists its own fields and this is not one of them).
  `buryUnlocked()` gates `pkBuryStart`, the exchange row, and the wallet button.
- **The ceremony is his hole**, not a garden plot: red-black earth, a crimson lip, glowing cracks
  bent at a knee and kept inside the dirt ring (straight even spokes read as a sunburst stuck to
  the outside), embers rising off the lip, fire far down the shaft. `BURY.dirt` gained `ember`,
  which floats up instead of falling.
- **`BURY_PILE_STEP` 100 → 300, `BURY_PILE_MAX` 14 → 6.** Fourteen layers of three hundred is 4200
  bones, which nobody reaches, and a "full" hole that never fills is not a reward. Six is 1800.
- **The cash-in**: the mound is consumed the instant the last layer lands (deferring it left a
  window where the pile kept growing behind the fire), but the DRAW holds it full for the whole
  `BURY_BURN` — full, then flame, then gone. The drop loop is gated on `burnT<=0`, so a fresh
  mound starts underneath without the player letting go.
- **The wallet button has three states**: Unleashed locked → a locked BURY row that says the cost;
  unlocked but no kill → routes to `pkUnleashedAdvice` → `startPark(true)`; beaten → the ceremony.
  The Unleashed gate is a LIVE `S.snacks >= DOGPARK_UNLEASHED_COST` check, exactly as
  `reallyEnterDogpark` does it — which does mean a big burial can spend back below the unlock.
  That is the existing rule for that door; this button does not invent a different one.
- Dev: `#pkDevW9` now flips the run into `plusMode` (or the shortcut would never reach him), and
  `#devHollow` toggles `S.hollowBeaten` so burial can be tested without a full run.

**Testing note, learned the hard way here.** A busy `setTimeout` loop inside `page.evaluate`
starves rAF in headless Chromium — the park runs at roughly a fifth of real speed, and a fixed
wall-clock sleep gets nowhere near enough frames. Pin state from *inside* a `requestAnimationFrame`
chain and poll from outside with `waitForFunction`. Three separate "bugs" in this session were
that. Two more were the harness picking a roosting bird (not charmable by design) as its test
enemy, and a cleared wave opening the shop, which makes `parkUpdate` return early and freezes
everything downstream of it.

### Bark was killing freshly-charmed enemies during Lovey Dovey (v0.307a)

Reported: "I can't damage enemies during Lovey Dovey, I only turn enemies against their own
team... when I'm trying to brush up against them I'm just killing them."

`pkBark()` auto-fires on proximity alone (`parkUpdate`, next to `PK.barkCd-=dt`) with no
awareness of love mode at all — no check on `PK.loveMode`, no exclusion for `e.love`. `PK.barkR`
(≈21–33, tuned by hunger/STR/upgrades) is usually **wider** than `LOVE_BRUSH_R` (22), and
`pkLoveTick`'s brush-convert runs earlier in the same frame than the bark trigger. So walking up
to charm something meant one of two things happened, both looking like "brushing kills them":
either bark reached it first and killed it before the brush ever got a chance, or the brush
converted it that same frame and bark — whose sweep never checked `e.love` — killed the brand
new ally a beat later.

Fixed in two places:
- The auto-trigger now reads `if(!PK.loveMode && ... && !e.love && ...)`. Bark is fully suspended
  for the whole 15s: the mode's whole pitch is charm-through-contact, not combat, so BONES simply
  doesn't fight while it's running. `!e.love` is redundant with the mode check but kept as
  defense-in-depth for the frame the mode is ending.
- `pkBark()`'s own sweep loop skips `e.love` outright (`if(e.fleeing || e.love) continue;`), so an
  ally can never be hit by bark through any future call path either.

Verified in Chromium: activated Lovey Dovey for real (walked the seven-heart trail), spawned a
1‑HP enemy, sat it directly on BONES for 206 sampled frames — stayed alive, stayed `love:true`,
HP never moved. Bark resumes normally the instant the mode ends (confirmed against a fresh
enemy). Full existing suite re-run clean against this build.

### WOLFIE, and the hole you wake him from (v0.308a)

**He is WOLFIE now.** Every user-facing "THE HOLLOW" is renamed — `BOSS.name`, the fanfare, the
kill toast, the burial titles, the Unleashed pitch, the dev button. The save key stays
`S.hollowBeaten`: it is an internal id and renaming it would strand every existing save.

**2x HP** (`BOSS_MAXHP` 100 → 200). The phase gates were already fractions of `maxhp`, so they
land in the same proportional places; there was no absolute-HP threshold anywhere to rescale, and
no fourth phase was specified so the 66%/33% three-phase split stands.

**The health bar rides on his head.** It used to sit at `h*0.455`, between his chin and the board,
where it read as more of the board's furniture. It is now one stack — name, bar, PHASE — pinned
just above the top of whatever head cell is showing, so it tracks him as he sways. That needed
room: `BOSS_DROP` (0.14 of the band, ~53px) lowers the whole chain, rift included, via
`bossRiftY()`. **Both** the spine and the draw compute the rift line, and so do two arrival
dust-spawn sites — all four go through the helper or the earth comes out of the wrong place.
0.08 was the first guess and still landed the stack on the park's own WAVE/LEFT header.

**Everything is 25% slower and 25% angrier.** `BOSS_SPD` (0.75) multiplies every projectile speed
at every spawn — including the MAW's *gravity*, or a slower throw just hangs. `BOSS_AGGRO` (1.25)
multiplies the idle sway's **size and speed**, the lean into a volley, the jaw rate, the head-snap
beat and the clack. Both are single constants on purpose: the patterns were tuned one at a time
and the screen had stopped being readable.

**The overloaded phase.** `BOSS_FILL` names the four patterns that own the whole board on their
own (sweeps, ring, cross). A phase-three double is now 35% likely (was 55%), never pairs two
fillers or two heavies, and whatever it adds comes in `sparse:true` — every spawner reads that
flag and thins itself to one lane / one wall / one mouthful. The ring's door widened from 0.45rad
to 0.80 (0.95 sparse): a ring closing from every side with a 0.45 gap is a coin flip at any speed.

**Side sweeps are burning birds** — the park's own bird frames, flipped to face travel, under a
fire tint, trailing embers into the same pool the mouthfuls use. Motion, lane and hitbox are
untouched, so the read is exactly as fair as it was.

**MAW bones leave the mouth.** `pkBossMouthBox()` converts the head joint into board space once
(it comes out well negative in y, which is the point). Two traps: the bone must be `out:true` or
the top cull kills it instantly, and it must be drawn in **panel space outside the board's clip**
until it crosses in, or it is invisible for the first half of its flight and still appears to pop
in at the top edge. Flight time is solved under gravity — dividing by v0 alone gave a 14s lob.

### The hole is the way in

Clearing wave 9 no longer starts the fight, it opens a hole. `pkHoleArm()` sets `PK.holePending`;
the same slot in `parkUpdate` that used to call `pkBossStart()` now calls `pkHoleOpen()`, so it
still lands right after the wave-9 shop. The camera pan reuses the sword's exact mechanism
(`pkHoleCamProgress()` alongside `pkSwordCamProgress()`).

- **NOT NOW** ends the cine, pans back, and leaves `PK.hole` in the world. Waves carry on.
  Walking within `HOLE_TOUCH` re-asks — `PK.hole.asked` flips back on when he steps away, so it
  can ask again without nagging every frame he stands there.
- **INVESTIGATE** plays the two lines, the bubble shrinks and drifts up (`c.rise`), and the hole
  is left idling with `HOLD THE SCREEN TO THROW IN BONES`.
- Holding opens the burial with the new `src:"offer"` — the run's carried bones, and the one
  burial **not** gated on `buryUnlocked()`, because it is how you meet the boss that unlocks all
  the others. Spending anything at all sets `PK.bossArmed` and Wolfie comes. Spending nothing
  leaves the hole exactly where it was, so a player at 0 bones is never stuck.
- `PK.bossArmed` is a separate flag from `PK.bossPending` so the dev button still starts him
  directly.

`pkHoleOpen()` clears `PK.waveBanner` — the wave-10 banner fires on the same frame and lands on
top of everything the hole has to say.

**Burial's grace became a countdown.** `BURY_LETGO` 1.2 → 3.0, drawn as a 3-2-1 over the hole with
`TOUCH TO KEEP GOING`; putting a finger back down resets `bu.idle` and it vanishes. Ending a pour
by accident mid-hoard with no warning was the worst thing that screen did. The hole also shows
`LV before → LV after` under the art. Both apply to every burial, not just the offering.

**Testing note.** `BURY.held` is sticky — nothing in the game resets it — so driving it from a
self-scheduling `requestAnimationFrame` chain in a harness is unnecessary AND unstoppable from
outside; two "the countdown never ran" failures were that, not the code. Set it once. A
`Object.defineProperty` setter trap on the field is what settled it.

### The bark is a cone (v0.309a)

A dog barks AT something. The bark was a silent circular aura that ate everything behind him,
which left nothing to aim — the only input was standing near things. It now fires **forward**.

- **`BARK_CONE = [80,115,155,215,360]`** — degrees by `PK.barkBigLvl`. Rank 0 is an 80° wedge;
  the last rank is the full circle. `pkBarkArc()` / `pkBarkOmni()` read it.
- **`pkInBarkCone(dx,dy,d,e)`** is the single predicate, used by BOTH the sweep inside `pkBark()`
  and the auto-trigger in `parkUpdate` — they must agree or the bark fires at things it then
  fails to hit. It widens by `atan2(pkHitR(e), d)`, so a wide sprite clipping the rim counts, by
  less the further out it is.
- **`PK.faceAng` is its own continuous angle**, updated from velocity above `PKDIR_MOVE` and held
  when he stops. It is deliberately NOT `PK.faceI`: that is an eight-way sector index because the
  sprite set has eight strips, and aiming a wedge off it snaps the shout to 45° steps and visibly
  misses what the player is pointing at. `faceI` still picks the sprite; `faceAng` aims the cone.
- **Bark stays automatic.** It fires when something enters the CONE instead of the circle. There
  is no bark button and the pad is a joystick (wings already own double-tap), so "aim with
  movement" is the skill rather than a new input.
- **WIDER BARK** replaces BIGGER BARK on the same `barkBigLvl` / `BARK_LVL_CAP` 4-level track:
  levels open the wedge instead of the radius, and 4/4 toasts `OMNI BARK — FULL CIRCLE`.
  `BARK_LVL_CAP` must stay equal to `BARK_CONE.length-1`. Radius still grows from RED BANDANA
  and the per-wave scaling, so angle and reach are separate axes.
- **The charge is drawn as the shape it will fire**: three arcs (`N=3`) stacked along the wedge,
  filling inside-out with the cooldown, opening from straight ahead as `k` rises. Four arcs at
  4.5px merged into one white slab — `barkR` is only 21–62px, so three thin ones spread 0.52→1.0
  of the radius is what actually reads as separate bars.
- **The wave** reuses `PK.pulse` but is drawn along `PK.pulseAng`, captured at fire time so it
  does not swing if he turns mid-pulse. At omni rank the spread is forced to `PI` — a 260° arc
  where the ring used to be looked like a bug.

Both `SETTINGS.barkStyle` modes (arc and "lines") follow the cone. Bark suppression during Lovey
Dovey and the `PK.barkedTypes` missions are untouched — only the shape changed.

**Testing note.** Cone geometry is worth solving rather than watching: `pkInBarkCone` is pure, so
a harness can set `PK.faceAng`, sweep 72 bearings and assert the hit count rises monotonically per
rank (29 → 35 → 43 → 55 → 72) with no frames and no throttling at all.

### The box is a cage (v0.310a)

Three fixes that all come back to one idea: a screen owns the player's attention, and nothing may
appear inside the space the player is defending.

**INVESTIGATE opens the hole itself, not a preamble to it.** It used to answer the choice, resume
the park, and play the two lines as a bubble over the world with a pad-hold hook waiting for the
player to work out that they were meant to hold. There is now exactly one entry:
`pkHoleEnter()` → `pkBuryStart("offer")` → `BURY.ph="talk"`. The dialogue moved *into* the burial
panel as a real phase, plays `HOLE_SAY` there, and falls through to `"hold"` on its own. Deleted
with it: `pkHoleHold()`, `pkDrawHoleTalk()`, the cine's `"talk"`/`"wait"` phases and the pad hook.
`pkBuryStart` accepts `src==="offer"` below `BURY_UNIT` (the hole is allowed to be hungry and
unsatisfied); the finish-on-empty check is guarded by `bu.shovels>0` so the talk phase can't end
the offering before it starts.

**Wolfie has one door.** Pouring bones levels the dog, and a level-up was reaching
`pkBossStart()`, so the boss could begin *underneath* the burial panel. `pkBossStart` now refuses
outright while `BURY.on || PK.holeCine`, setting `PK.bossArmed=true` instead so the intent
survives; `BURY.on` also joined the list of takeovers that pause the park update. The single exit
is `pkHoleOfferComplete(gave)` — gave bones arms him, gave nothing re-arms the hole to ask again.
No other path may start him.

**Nothing dangerous is born inside the box.** Every projectile now spawns outside the arena rect
and flies in. `bossAdd` defaults `b.out=true`; a bullet clears the flag the first frame it is
genuinely inside, and until then it is drawn, moves, and **does no damage** (`if(b.out) continue`
before collision). Bullets that never enter are culled at a generous margin rather than lingering.

The ring pattern was the real offender and it was not obvious: its radius was
`max(B.w,B.h)*0.62`, which along the corner diagonals put spawn points **inside** the box —
measured at −7px clearance in a 310×260 arena. It is now `hypot(B.w,B.h)*0.5+26`, the
circumscribed circle plus a margin, worst-case clearance +19px. Mouth-fired maw bones are the one
sanctioned exception: they start above the board, keep `out:true` through their arc, and can only
hurt after crossing the lip.

**`BOSS_EDGE`** maps each pattern to the edges it comes from (`rain:"t"`, `sweepL:"l"`,
`sweepR:"r"`, `cross:"lt"`, `surge:"b"`, `ring:"lrtb"`). During `BOSS.ph==="telegraph"` those
edges pulse as an orange ghost band on the border, so the warning names the side. `BOSS.teleEdge`
clears in `pkBossFinishPattern` and `pkBossReset`.

**Testing note.** A cage audit must run on a page where the boss actually starts. Testing it from
inside the burial gives `BOSS.box {w:0,h:0}` — the new guard correctly refused the start, so
`pkBossLayout` never sized the box and "nothing spawned inside" was vacuously true. The real run
hooks `bossAdd`, sweeps all patterns in phases 1 and 3, and asserts both `badN===0` and that the
*old* radius would have failed the same assertion (`oldWorst<0`), which is what proves the test
has teeth.

### The scream, and the cage (v0.311a)

**A roar is drawn on the face.** The scream was thirty-four gradient strokes, the longest of them
460px, started at a radius that put their apex down on his chest — so it read as lasers fired out
of the rift. It is fourteen short rays now, and three things had to be right for that to work:

- **They are triangles, not strokes.** A stroke has one width for its whole length, and the taper
  from mouth to tip is the entire read. Each ray is a filled three-point path — wide at the base,
  a point at the tip — with a gradient running white → ice-blue → transparent along it.
- **They start on the head's OUTLINE, not at its centre.** This is the part that is not obvious:
  the roar is a close-up, so the head cell (230×258 at `band/480`) draws at 180×202, i.e. ±0.24 ×
  ±0.27 of the band. A ray anchored at the head joint and 25% of the band long is therefore
  *entirely inside his own fur* — the first attempt at this was invisible in every single frame.
  `bossScreamR0(a,band)` returns the ellipse radius at that bearing (`BOSS_SCREAM_HW/HH`), and the
  ray starts a few px outside it.
- **Straight down is trimmed.** It is the one bearing with his own armour in the way, and a ray
  raking the length of the chest is exactly what this replaced. `trim = 1-0.50*sin(a)²` shortens
  and dims those; sideways and upward rays, which have only air to cross, run full length.

`BOSS_SCREAM_A/B` = 0.15–0.56 of the roar, opening on the SFX peak (`roarSfx` fires at 0.155) and
gone long before the roar ends. One struck frame of white on the face leads it. The blast dust was
also slowed (110+360 → 80+190 px/s) so it stays around the muzzle instead of raking the body.

**The fight starts by TRAPPING you.** The roar used to end and leave a board sitting there, scaled
in from 0.86 over 0.35s. It now runs a one-second cage on its own clock (`bossCageK()`, -1 unless
it is actually running — the same shape as `bossRoarT`):

| c | beat |
|---|---|
| 0.05 | a 34×29 white box **snaps shut** on BONES, white flash, corner sparks |
| 0.05–0.35 | it **builds**: four corner brackets run out along both legs until they meet |
| 0.35–0.85 | it **opens** to the real board, easeOutBack with a 5% overshoot |
| 0.85–1.00 | it **locks**: two beats of border thickness, two rings thrown outward, UI fades in |

`bossCageRect(B,s)` lerps from a tiny rect centred on `BOSS.cageX/cageY` (captured where he was
standing when it bit) to the board. He is inside it for every value of s — and past 1 too, because
the overshoot only ever pushes the walls further out, never in across him. While it is closing the
walls are WALLS: `pkBossDogMove` clamps to the cage rect instead of wrapping, or he would step
through a doorway in the box that exists to say he cannot.

The board draw takes the cage rect for its fill, border and clip and keeps `translate(B.x,B.y)` for
the contents, so nothing downstream — bullets, pocks, the dog, the seams — needed to know.
`BOSS_INTRO` moved 2.75 → 3.40 so `pkBossTelegraph` still cannot run until it has locked; that is
what keeps "no bullets until the grow completes" true without a second guard.

**The easeOutBack constant is solved, not guessed.** Its overshoot is `4c₁³/27(c₁+1)²`, so
`c₁=1.16` is the value that gives 5%. The first guess, 0.90, only reached 2.8% and did not read as
a settle at all. reduceMotion gets a smoothstep with no overshoot.

**Testing note.** A page screenshot cannot show a beat you set by hand: the game's own rAF redraws
the canvas the moment the `evaluate` returns, so the image is whatever the real clock had reached.
Draw and capture inside ONE evaluate (`cv.toDataURL()`) where nothing can interleave. Separately,
`pkBossIntroTick` advances `introT` **itself**, so a harness that sets the clock and then steps
lands a whole `dt` past the mark — three "failures" in the first cage run were all that, at the
one boundary where a `dt` tips the intro into the fight.

---

## Suggested first prompt for Claude Code

> Read HANDOFF.md, then bones.html and bones.js (skim park.js). Don't change anything yet —
> confirm you can run the build command and produce a working single-file output, then tell me
> what you'd do first about the save system.
