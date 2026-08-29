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

### Five bark tiers, and the sprite order (v0.312a)

**The cone ladder is four cones and then a circle.** `BARK_CONE = [70,110,150,190,360]` with
`BARK_RANGE = [1.00,1.13,1.28,1.55,1.55]` beside it — "wider" and "longer" are one ladder, not two
competing shop rows. Tiers 1–4 stay directional; the fifth is rarer and is what the climb is for.

`pkBarkR()` is the one number every part of the bark measures itself against: the predicate, the
`pkEnemiesNear` sweep, the charge arcs and the wave. `PK.barkR` stays the **base** — what RED
BANDANA and the per-wave scaling write to — and the rank multiplies it. Anything still reading
`PK.barkR` directly would draw a different shape from the one that hits, which is precisely the
bug the split exists to make impossible; the harness asserts the drawn reach and the hit test agree
at every rank, in both directions.

`BARK_LVL_CAP` must stay equal to `BARK_CONE.length-1`: the shop hides a capped row once
`PK[capKey] >= cap`, so a shorter cap strands the last rank as unbuyable. The row now names itself
per rank from `BARK_ROW` / `BARK_FX` (LOUDER BARK → STRONGER BARK → STRONGER AND LONGER → OMNI
BARK), built fresh inside `pkShopOpen` so it reads the live level.

**The charge gauge is a gauge.** Three nested arcs (`BARK_ARCS`), evenly spaced from `BARK_ARC_IN`
out to the full reach, **one** stroke weight and **one** cap for all of them. The fill is carried
entirely by alpha (`BARK_ARC_EMPTY` → 1.0) and by how far round the wedge each arc has opened — the
previous version also grew `lineWidth` as it filled, and a gauge whose bars change thickness is a
worse gauge. Nothing is coloured: the orange/pink/blue in the mock-up were tier labels, not art.

The arcs are centred on the dog, not on the muzzle, because that is where the hit test's origin is.
At `barkR` 21–54 a 6px forward offset would be a visible lie about the AOE.

**Sprite order: BONES → enemies → pickups.** Enemies used to be drawn up with the trees, so they
passed *under* BONES — which read as him walking over them and made a crowd around him impossible
to count. The loop moved to just after `pkDrawWingsClaim`, which is also the marker the harness
uses: no `drawEnemy` before it, every pickup draw after the last one. The thing you must not miss is
never the thing that gets covered.

**Pickups turn like Vice City pickups.** `pkPickupSq(t,seed)` is a horizontal scale by `cos` of the
spin — the sprite narrows to nothing edge-on then opens out mirrored, which reads as a rotation
rather than a flip. Two things make it work: the scale is floored at `PICKUP_EDGE` so it never
collapses to a zero-width nothing at the two crossings (a pickup that blinks out four times a
second is one you stop seeing), and each is seeded off its own position so a field of them never
turns in lockstep. On the powerups the **halo stays a circle** and only the icon turns — light does
not go edge-on, and squashing both together just made the whole pickup flicker.

### The fire birds, the crunch, and the empty hole (v0.313a)

**What the burning birds actually cost.** Every claw was drawn with a `createRadialGradient`, an
arc fill, and — by a wide margin the expensive part — its own
`ctx.filter = "sepia(1) saturate(7) hue-rotate(-28deg) brightness(1.25)"`. A sweep puts dozens on
the board at once, so that was **dozens of separate filter passes every frame**. None of it ever
changes, so `bossBirdFire()` bakes the glow and the fire tint into one small canvas per animation
frame (at `S*DPR`, blitted at `S`, so it stays pixel-sharp) and the fight blits them: one
`drawImage`, no gradient, no filter. It builds lazily and returns null until every source frame has
decoded, falling back to the old crescent in the meantime.

Budgets, all of them named constants: `BOSS_CLAW_MAX` 40 birds alive (enforced in `bossAdd`, so an
over-cap bird is never created rather than created and culled), `BOSS_CLAW_GAP` 0.22s between
volleys (was 0.16), `BOSS_TRAIL_MAX` 90 embers, `BOSS_CLAW_EMB` one ember per bird per ~7 frames
(was every 3), which leaves each bird carrying 2–4. The embers were the fight's only high-churn
allocation — thousands a second at the old rate — so `bossTrailAdd` takes them off a free list
(`BOSS.trailPool`) and dead ones go back on it.

Measured on the same saturated board, headless: **2.03ms → 0.62ms per `pkDrawBoss`**, 65 → 39
birds, 160 → 65 embers, and per frame 40-ish `ctx.filter` sets down to 2. Treat the headless number
as a floor on the win, not the size of it: `ctx.filter` is disproportionately more expensive on
real mobile hardware, where each one can force its own render target.

**The cage is twice as long.** `BOSS_CAGE_LEN` 1.00 → 2.00 and `BOSS_INTRO` 3.40 → 4.40. The four
beats are *fractions* of `LEN`, so one number slows all of them and keeps their proportions: snap
at 0.10s, build done at 0.70s, locked at 1.70s. It crunches now — `bossCrunch(big,n)` is a short
square plus a narrow band of noise up in the metal range for a tick, and the same recipe an octave
down with a wide grit band under it for the lock. `beep()` coalesces near-identical chirps by
timbre and pitch bucket, so **each tick must be handed its own key** or the build falls silent
after the first two.

**Turning up with nothing is now a beat, not a soft fail.** An empty run used to open the pour with
`shovels: 0` and quietly wind down. `pkBuryRage()` runs instead, off `BURY.ph === "rage"`: the
taunt (`YOU BECKON ME, WITHOUT A SINGLE BONE!!!`) in the same bubble the hole already uses, a 0.6s
tremble that ramps rather than holds, then the smash. `pkHoleOfferRage()` is the exit — deliberately
not `pkHoleOfferComplete`, because nothing was offered and he is coming anyway.

The eruption comes out of the hole's exact centre for free: `bu.fire` and `bu.dirt` are already
stored **relative to (cx, cy)**, the same point the hole art is drawn about. The tremble is applied
to `cx`/`cy` rather than to the transform — everything on that screen is positioned off the hole's
centre, so moving the centre shakes the hole, the fire, the bubble and the readouts together while
the black behind them stays put and never shows a seam.

**The gauge is a signal; the wave is the event.** They are split by alpha: the charge arcs top out
at `BARK_ARC_MAX` (0.50) however charged they are, and the pulse that actually fires is drawn
solid. Nothing that has not happened yet is allowed to be as loud as the thing that has.

**Testing note.** `pkBossIntroTick` advances `introT` itself, so a harness that steps the clock by
hand *and* passes a token `dt` advances wall time without advancing anything measured in `dt` — the
cage read as crunching once when it was in fact crunching six times. Drive the intro on its own
`dt` and let `introT` come out where it comes out.

### The bark is a traffic cone (v0.314a)

A 150-degree wedge is not a cone, it is a fan — three quarters of a disc stuck to the dog's nose.
A traffic cone reads as one because it is **longer than it is wide**. So the angles came down hard
and the reach went up to match:

| rank | old | new | h/w |
|---|---|---|---|
| 1 | 70° × 1.00 | **34° × 1.44** | 1.64 |
| 2 | 110° × 1.13 | **42° × 1.83** | 1.30 |
| 3 | 150° × 1.28 | **50° × 2.21** | 1.07 |
| 4 | 190° × 1.55 | **58° × 2.80** | 0.90 |
| 5 | 360° × 1.55 | 360° × 1.55 | — circle |

`h/w` is the drawn cone's height over its base width; above 1 it reads as a cone, and it stays
above 0.9 even at the widest rank, widening progressively as the ladder climbs.

**The pairs were solved, not guessed.** Each angle/reach pair was chosen so the *swept area* of
every rank lands within 1% of what it was at every base radius the game produces (17 → 62). This
changes the shape of the bark and nothing about its power — worth re-checking with the same
arithmetic if either row is ever touched. `BARK_REACH_CAP` (180) bounds the finished reach because
`PK.barkR` alone is capped at 62 and the multipliers would take it to 174; at 180 it trims nothing
anywhere on the ladder, so it is a sanity bound rather than a balance lever.

**The apex is the mouth.** `BARK_APEX` is 6px forward along the facing, applied to the hit test and
to every stroke of the UI from the same constant, so the shape that is drawn and the shape that
bites stay one object. Earlier versions kept the origin on the dog because a 6px lie was large
against a 21px reach; at 30–60px it is not, and moving both together costs nothing. The **circle**
rank is still measured from him — a ring whose centre had crept forward would leave a blind spot at
his own tail.

**The sides are always drawn.** Three floating arcs are three arcs; the two straight rays from the
apex out to the outermost one are what close the silhouette into a cone. They used to appear only
at full charge, which is exactly when the player least needs telling what the shape is. Arc ends
land *on* the rays for free — same half-angle, same apex.

**A footgun the harness found.** `pkInBarkCone` took `d` as a parameter and the circle branch
trusted it while the cone branch recomputed its own (it measures from the mouth, not from
`PK.x/PK.y`). The function's answer therefore depended on which caller asked — right for every
real caller, wrong the moment anything else asked. Both branches derive their own distance now.

**Testing note.** Scope a "what alpha is this drawn at" probe to the shape's own strokes — anything
centred on, or leaving, the apex. Capturing every `stroke()` in `parkDraw` catches the wave
banner's solid red rule and reads as the gauge being drawn at full opacity when it is not.

### A bigger board, and MAW as a machine gun (v0.315a)

**`BOSS_SCALE` (1.20) is the one number.** Everything on the board that has a size is expressed
through it — the dog sprite AND `BOSS_DOG_R`, the bullets AND `BOSS_MAW_R`, the cached burning-bird
frame, the bird catch radius, the gold pool, the wrap-seam threshold, the sprite fallback. Scaling
art without the collision is how a fight starts lying, so they move together and the harness
asserts each pair.

Two bullets were drawn at fixed pixel sizes and so would not have followed: the `bar` (a hardcoded
10×10) and the `ember` (a radius-9 gradient). Both derive from their own `b.r` now.

**The red hitbox dot is gone.** It was the collision shown honestly, and the collision has not
moved — still `BOSS_DOG_R` about `d.x/d.y` — but it read as a wound painted on the sprite. The gold
pool underneath is centred on exactly the same point and was lifted 0.30 → 0.42 to carry that job
alone.

**MAW is a machine gun.** It was one huge bone at a time, deliberately slow to read. The beat it
wanted was a Metal Slug boss opening up:

- He **leans in**: `BOSS.mawLean` ramps over the whole beat (telegraph included, so the head is
  already over the board when the first round leaves), growing the head 30% and dropping it toward
  the play area. It is grown about its **top**, not its centre — scaling about the centre swells
  the skull up over his own health bar, and the downward half of the growth is the half that was
  wanted anyway.
- The gun fires **bursts of 11 at 13 rounds a second**, 2 or 3 bursts by phase, and the **barrel
  pans**: each burst picks a lane to sweep from and one to sweep to and interpolates between them.
  A burst that scattered would be noise; this one you see coming and run out from under. Rounds are
  small and fast (`BOSS_MAW_SHOT`) where the old mouthful was a lob — same gravity solve, far more
  muzzle velocity. Phase three keeps one heavy shot as punctuation.
- The telegraph previews the **field of fire** (the two extremes of the pan and the band between)
  rather than the arc of one bone that no longer exists.

**The mouth had to be found properly.** It was a flat 14px below the head joint — fine while the
head was small, but the roar cell's open jaw is down *and to the side* of its centre, so at 30%
bigger the stream poured out of his cheek. `pkBossMouthPanel()` takes a fraction of the head CELL,
scales it by whatever the head is drawn at this frame and rotates it by the sway, exactly as the
sprite is. `BOSS_MAW_CLEAR` clamps the lean against that **real jaw**, so a round can never be born
inside the cage no matter how far he leans.

**Budgets, because a burst is dozens on screen.** `BOSS_MAW_MAX` (30) is enforced in `bossAdd`, the
ember interval went 0.035 → 0.10, and the per-bone `createRadialGradient` — the same bill the fire
birds used to run up — is now one cached gradient built at the origin and scaled into place
(`bossGrad`). A 12-round burst draws in 0.8ms.

**Testing notes.** Two harness traps, both of which produced convincing-looking failures:
`BOSS.phase` is **derived from HP** by `pkBossPhaseCheck`, so assigning it at full health is undone
and the spawner captures the old value — drop the HP instead. And the test dog stands still under
fire: after a few thousand frames `PK.hp` hits zero, `pkDeath` clears `PK.active`, and every later
block silently runs on a dead board. Revive between beats and top him up inside the loops — doing
so took the spawn audit from 119 spawns to 881.

### Sides and a wave, and love that outlives the mode (v0.316a)

**The charge is two lines now.** It used to draw three nested arcs, both sides and a breathing rim
— a whole wedge of furniture parked over the park at all times. What the player actually needs
before it fires is where the cone POINTS and how far it goes, so that is all that is drawn: the two
side rays, fading along their own length (a cached linear gradient built in the frame already
rotated onto the ray, so one object serves both sides at every rank). Alpha runs `BARK_SIDE_MIN`
(0.14) idle → `BARK_ARC_MAX` (0.50) ready, and never above half. The circle rank gets almost
nothing: one faint rim at `BARK_OMNI_HINT` and only once it is ready.

**The wave is a front.** It leaves the mouth and travels to the end of the cone with a small
overshoot, rather than starting at full reach and expanding past it — which is what the old ring
did and why it never read as something thrown. Two dimmer copies trail behind, and it spans exactly
the cone's half-angle so what sweeps is the shape that hit. **The sides blink out for the whole
flight**: the signal is never as loud as the event.

Hit logic is untouched — `pkInBarkCone` still decides, and `pcone2`'s reach/angle agreement checks
still pass. This was a rendering change only.

### Lovey Dovey keeps its friends

**Love outlives the mode.** The window only ever governed whether NEW enemies turn; a converted one
now stays pink, keeps its doubled health, and keeps fighting until killed or cleared. What ends
with the mode is the dog's tint and the brush.

**HP doubles once, and `e.loveHp` is the latch — not `e.love`.** Both entry points (the opening
burst and the brush) go through `pkLoveTake`, so it cannot double twice; keying off `e.love` would
have doubled again for anything that re-asserted the flag on an already-pink unit.

**The stall this created, and the fix.** A wave ends on `PK.waveKills` reaching its quota, and a
charmed enemy is not a kill. While love expired with the mode that could never bite — now a wave
whose last few members are all pink would sit there with nobody left to fight and no way to finish.
So once the quota is fully **spawned** and not one un-charmed enemy is left, the allies are sent off
the same way a downed enemy is (`pkDownEnemy`), which credits the wave and drops their bones. It
cannot misfire: one live foe anywhere resets the timer.

The scuffle FX budget moved from `PK.loveMode.scuffle` to `PK.loveScuffle`. Hanging it off the mode
meant every scuffle after the fifteen seconds went silent and sparkless, which is now most of them.

**Testing note.** `pkEnemiesNear` reads a spatial grid that `parkUpdate` rebuilds **every frame**.
A harness that drives `pkLoveTick`/`pkLoveEnemyTick` by hand without rebuilding it leaves the grid
holding enemies from the live run that are no longer in `PK.en` — the allies then chase a ghost off
across the park, scuffling with an object nothing else can see, and the test reports "they stopped
fighting". Call `pkBuildEnGrid(PK.WW,PK.WH)` on every step. Separately: a canvas-call recorder must
divide by the DPR that `fit()` puts on the context, or every screen-space comparison misses by
exactly that factor and records nothing.

### Readability pass (v0.317a)

**The zoom starts later in plain DOGPARK.** It waited from wave 2, which held the opening waves too
wide too early; it now waits until wave 6 and still finishes on the wave-10 clear. UNLEASHED is
untouched — still wave 2, still a 0.025 step. The step is **derived** rather than fixed
(`PK_ZOOM_TOTAL / waves-left-in-range`), so both modes end in the *same* framing: a later start
means bigger steps, not a smaller park. `PK_ZOOM_TOTAL` is 0.225, which is exactly the nine
UNLEASHED steps of 0.025, so that mode's numbers come out bit-for-bit unchanged.

**BONES is the top of the sprite stack again.** v0.312a put enemies over him at the user's request;
with twenty enemies and a floor of loot on screen, the one thing the player must never lose was the
thing getting covered. Enemies, drops, powerups and nuts all draw before him now; pickups still
draw over enemies. If it ever reads worse, this is one block move.

**The rim.** `pkDogRim` returns an alpha and a blur, applied as the canvas' own `shadowColor` /
`shadowBlur` **on the sprite pass he was already making** — no extra draw calls and no `ctx.filter`.
Two things drive it: night (UNLEASHED is dark enough that a black dog on dark grass is genuinely
hard to find) and *crowding*, since the thing that actually loses him is six squirrels standing on
him. Deliberately subtle in daylight with nothing near: a permanent hard outline on the player
character reads as a bug. At night it is already at 0.75 against a 0.95 ceiling, so a crowd can only
add the remaining 0.20 — a real lift, just a bounded one.

**The nuts were inside the night multiply.** `pkDrawNightTint` is a `multiply` pass over the whole
world, and the nut draw sat *before* it — so every thrown nut was multiplied by `#141c3c` into the
grass and was, as reported, impossible to see. Moving them after the tint fixes the cause; they also
carry their own light at night now (one cached gradient via `pkGrad`, scaled into place, so a
screenful costs one gradient rather than one each) and the shell colour goes from `#d99a4a` — almost
the same value as night grass — to `#ffc978`.

**Testing note, and a real trap.** A battery written as
`sed ... && ( node a ) & ( node b ) & ( node c ) & wait` binds the `&&` to the **first** job only:
b and c launch immediately, before the version bump lands, and they silently test the *previous*
build while reporting PASS. Ten suites "passed" that way here and three of them were lying. Do the
bump as its own command, then launch. Two suites were also still asserting behaviour that had since
been deliberately reversed (enemies over BONES; the arc stack) — a stale green is worth no more than
a stale red.

### Walk cycles, shared DOGCAM art, and half the file (v0.318a)

**The build went from 8.41 MB to 4.81 MB.** Three supplied music payloads (`MUSIC_GOODMOOD`,
`MUSIC_DOGPARK`, `MUSIC_BOSS`) are now empty strings. Everything downstream is gated by
`trackHas(a)` rather than by the element existing: the `<audio>` objects are still built (via
`new Audio()`, carrying `.hasTrack`) so every `.play()` / `.pause()` / `.volume` site keeps working
untouched, they simply never have a source. `syncMoodMusic` splits its three "which bed should be
playing" questions into `wantHome/wantPark/wantBoss` and its three "which is available" answers into
`homeCtx/parkCtx/bossCtx`; the procedural fallback is guarded on `!homeCtx && !parkCtx && !bossCtx`,
so the generated menu/selection bed still plays and did not go away with the payloads.

**Five walking strips, mirrored to eight facings.** `PKWALK` mirrors `PKDIRS` exactly — S, SE, E,
NE, N stored, with W/NW/SW drawn by `PKDIR_MAP` flip — and `pkDirDraw` takes a `walk` flag that
picks the set, falling back to the run strips if a direction is missing. Frame count comes from
`dd.n` now (`nf = dd.n || 8`) because the walk strips are 25 frames where the run strips are 8.

**"Up and northeast look smaller" — and why the fix goes in the builder, not the code.** The five
source sheets are rendered at different effective sizes, so a single `sc` cannot serve them. `FIX`
in `mkwalk.py` carries a per-direction multiplier (S 1.718, SE 1.535, E 1.186, NE 1.490, N 1.908)
applied to `BASE_STORE=0.50` **when the pixels are stored**, so every direction ships at `sc:1` and
the runtime does no per-direction correction at all. Calibrate against the *shipped run strip for
the same direction*, never across directions: a cross-view silhouette comparison told me old-S
needed 0.714 when it ships at 1.0 and looks right. Width is the invariant to match — height swings
0.96–1.26 between gaits by pose alone, width only 0.87–1.00.

**A finding for the run set, not a bug in the walk set.** Run-NE is 96.5% of run-SE's *width* but
only 77.3% of its *height* — it is vertically squashed, rendered at a different camera elevation.
No uniform scale can fix that (matching width leaves height at 60 against SE's 75); it needs a
re-render. Walk-NE is 88% width / 101% height, i.e. correct.

**Gait.** `PKDIR_RUN_AT=0.62` of top speed switches walk→run; `PKDIR_WALK_FPS=13`,
`PKDIR_RUN_FPS=10`, `PKDIR_IDLE_FPS=3.5` via `pkGaitWalk`/`pkGaitFps`.

**DOGCAM now shares the park's art.** `stripFrames(dd, img, n, after)` slices a park strip into the
per-frame canvases DOGCAM expects and runs `lcdSet` over each, so `DOGIMG.walk` is the walking-E
strip (25 frames) and `DOGIMG.come` the running-E strip (8). Left is the same art flipped.

**Diagnostics on the intermittent failures.** Two things, neither of them the game. Median frame
time is flat at 16.7 ms whether 1, 6 or 12 browsers are running, but the *worst* frame goes 17 ms →
53 ms — tail latency under parallel load, which is why wall-clock-sensitive suites wobble rather
than fail outright. Run the battery in groups of five. The other candidate turned out to be a false
alarm worth recording: a static sum of `pall.js`'s sleeps reads 15,660 ms against a 15,000 ms
`LOVE_MODE_T` and looks like a suite racing the timer it asserts on — but its `__pin`/`__brawl` rAF
chains top `loveMode.t` back up to 8 every frame, so the wall clock never reaches it. Static timing
audits of a harness that pins its own clock will lie to you.

### The stick gets a throttle (v0.319a)

**It was a direction and nothing else.** Any deflection past a tenth of the pad ran him at full
speed: `PK.vx = mx/l * PK.spd`, with the magnitude divided straight back out. That is why the two
gaits shipped in v0.318a could never both be reached — the comment above `PKDIR_RUN_AT` already
promised "a half-deflected stick walks, a full one runs" and the movement code made it impossible.

**`pkJoyThrottle(m)`** maps deflection to a fraction of top speed: nothing inside `JOY_DEAD` (0.16,
because a thumb resting on glass is not an instruction), then `JOY_MIN` (0.34) rising to 1.0 along
`m^JOY_CURVE` with the exponent at 1.5, which spends more of the pad's travel on the slow end where
fine control is what you want it for. Applied as a factor, not a replacement, so ZOOMIES, OVERDRIVE
and the wing-slow all still multiply through it as before.

**`JOY_R` 30 → 46, and the ring now draws at the radius it measures.** The old ring was stroked at
26 against a 30px travel radius — harmless when deflection was binary, wrong the moment it means
speed. There is a second, dashed ring at `pkJoyRunAt()`: the throttle curve *inverted* at the gait
threshold, so the mark cannot drift from the gait no matter what the upgrades have done to
`PK.spd`. It lands at 0.634 of the pad, and the knob brightens and thickens as it crosses. The
touch area was always the whole pad — pointerdown plants the stick wherever you press — so "bigger"
here means throw, not hit-box.

**A bug the throttle exposed.** The dog draw measured his speed as `|vx|+|vy|` — a Manhattan norm,
41% larger on a diagonal than on an axis. While every deflection was full speed that never showed;
with a throttle, the *same* stick position would have walked him east and run him north-east. The
gait now reads `hypot`, in the units its own threshold is written in. The legacy `RUNIMG` fallback
keeps the old measure, which is all it ever needed.

**Airborne is deliberately untouched.** `pkFlyTick` takes the raw stick for steering and owns speed
through `J.sp` — the pounce drives him up there, not the thumb. `pjoy.js` asserts a 0.30 and a 1.0
deflection give an identical air speed, so a future change to the throttle cannot quietly leak into
the leap.

**Testing note.** The world draws on `#dogcv`; `#parkcv` is the pad. A drawImage spy on the wrong
one returns an empty list, which reads exactly like "the walk sprites never got blitted" — the one
failure in `pjoy.js` first time out, and it was the harness.

### DOGCAM was drawing a black blob (v0.320a)

**What `lcdify` actually does, and why the park art broke it.** It splits a frame in two at a
percentile of its own luminance: below the threshold becomes ink `#0e0e12`, above becomes
`#34343c` — which is *the exact colour of the DOGCAM wall*. So the light half disappears and what
you see is a line drawing with a hollow body. That is the whole look, and it depends on the source
spreading across a range. The hand-drawn frames do: the old walk sits evenly across luminance 3–12.

The park strips do not. **88.7% of the walking sprite's pixels sit on one value** — in the park he
is a near-black silhouette on grass with a rim light and never needed an interior. Every one of
those pixels lands under the threshold (which `clamp(…,30,95)` floors at 30 anyway), so he came out
96% ink: a solid black shape on a dark wall.

**`lcdLine` is a second pass, used only for the two park-derived strips.** Ink goes where there is
an *edge* — the silhouette border, plus any interior step at least `LCD_EDGE_K` (5%) of the frame's
own range, which is relative rather than absolute precisely because a flat floor is what swallowed
the dog. Everything else takes the wall tone. The running strip has real shading and keeps it; the
walking strip has none and comes out as pure outline, so when the ink share falls below
`LCD_LINE_MIN` the outline is dilated once and drawn boldly instead. `lcdify` itself is **not**
touched — every other DOGCAM sprite, the senior set and the robot included, is drawn for it.

**The metric, and the wrong one.** An ink-as-a-share-of-opaque-pixels budget scores the old idle
frame — the one held up as the thing to imitate — at **97.9% ink**. True and useless: its body is
wall-toned, so it vanishes. The measure that corresponds to "too black" is how much of the dog's
box comes out dark once he is drawn on `#34343c` at the size DOGCAM draws him. The old frames sit
at 28.3 / 27.9 / 48.7 there. New: walk 15–18.3, run 28.2–30.4 — the run landed on the reference
without tuning, so `LCD_EDGE_K` was left where it was rather than fitted to a number that felt
better. A first version of `pcam.js` asserted absolute ink percentages and failed on the *robot*,
which has always been 64.2% and which nothing had touched. It now hashes every `lcdify` sprite in
this build and in v0.319a and requires them equal — nine sets, all identical — and separately
requires the park pair to have changed, so the suite cannot pass by doing nothing.

**A limit worth knowing.** The walking sheets are flat silhouettes with no interior at all, so no
threshold can recover leg or chest shading from them — the bold outline is the most that is
honestly there. If DOGCAM's walk ever wants the old art's weight, that has to come from the source
PNGs, not from this pass.

### Off the LCD, and up after the ball (v0.321a)

**BONES draws at full colour now.** `lcdify` still exists and still runs — for the NOURISH-BOT
only. The dog's own sets (`DOGIMG`, `BEGIMG`, `SENIORIMG`, and the two park-derived strips) come
through untouched, so the gloss, the rim light and the tongue survive. Putting him back is one
line. Note the bot is still two-tone and the dog is not; that was scoped deliberately and is the
obvious next thing to revisit if the room stops looking of a piece.

**Two new 25-frame sheets, built by `mkdogcam.py`.** They arrive at different render scales — the
idle sheet draws his standing body 106px tall, the jump sheet 89 — so each is scaled by *its own*
standing body height to a shared target and the correction is baked into the stored pixels. Same
lesson `mkwalk.py` learned for the eight isometric directions: if two sheets disagree about how big
he is, fix it where the pixels are stored, never at draw time.

**The art does the jumping.** In the jump sheet his feet genuinely leave the floor — the bbox
bottom sits at 167 while grounded and lifts to 125 at the apex, his crown travelling 56px against
his feet's 36. Cropping to a *shared* bbox and anchoring on the ground line keeps all of that
inside the sprite. `DOGCAMART` therefore ships three tables the game cannot infer: `foot` (the
floor line inside the stored image), `lift[]` and `top[]` (per frame). Everything that needs to
know where he is in the air reads them, so pose and height can never disagree.

**`dogMouthPt()` is the single source of truth** for where his mouth is, at any frame of the arc.
The catch test, the carried ball and the contact spark all come through it. `top[fi] + 0.28*body`
is his muzzle, measured off the standing frames.

**Two things the leap needed that were not obvious.**

*The lift is nearly binary.* Feet on the floor at frame 6, 16 stored px up at frame 7. Played at
face value that gives him exactly **one** jump height, and leaves a dead band between what he can
reach standing and where that jump puts his mouth — a ball lobbed just over his ears went straight
past. `LEAP_K` scales the sprite's own lift, pose untouched, so the height is continuous from a
small hop to a full stretch. `LEAP_K_MIN` has to be *low* (0.06): standing his mouth is at 0.556
and his crown near 0.455, while the ground-level catch only ever wanted `BALL.y>0.50`, so the whole
band between belongs to the leap and nothing else.

*Which way he turns.* Comparing the ball against `CAM.x` compares it against his **left edge**, and
his sprite is nearly half the width of the room — a ball just right of that edge is still well
behind his muzzle. The chase code below it documents this exact trap. Both mouths are costed and
the nearer wins; turning round is free.

**Ordering, twice.** `dogLeapTick` runs at the head of `camBehavior` and the ball is integrated
near the end of it, so a catch test living inside the tick always measures last frame's ball
against this frame's mouth — enough, at a throw's speed, to slide a dead-centre catch outside the
radius. `dogLeapCatchTest()` is called after the physics instead. And `ballPath` integrates with
the *same* constants the ball tick uses; the suite asserts predictor and world agree to 4 decimal
places, because a plan made against different physics plans a catch that misses.

**Snap** is a 70ms hitstop that freezes the ball with him (a ball that kept moving through the
pause would tear itself out of the catch), two rings off the mouth, a shrinking ground shadow, and
a three-note rise.

**Test bookkeeping.** `pcam.js` is deleted — its entire subject was the v0.320a line-art pass, which
this request removed. Two assertions in `pwalk.js` demanded the DOGCAM strips be quantized; they
are inverted rather than deleted, since the failure now worth guarding against is a filter creeping
back on. `pleap.js` is new.

### The rest of DOGCAM comes off the park strips (v0.322a)

**The run, the fetch and the trot-when-called were still black, and the LCD was not why.** v0.321a
took the filter off; these three all resolve to `DOGIMG.come`, which since v0.318a *was the DOGPARK
run strip* — art deliberately drawn as a near-black silhouette because in the park he is small, on
grass, under a rim light. On a dark living-room wall that reads as a hole in the screen. The filter
was a red herring; the source art was the answer.

**Every DOGCAM state now has its own full-colour set.** `mkdogcam.py` builds seven — `idle`, `jump`
from the clean PNG grids, and `come`, `rest`, `sit`, `beg`, `sniff` from the two later sheets. All
seven normalise to the same `body` (80 stored px) measured from their own standing frames, so he is
133.9px tall in *every* pose and a lying dog is short and a rearing one tall because the art says
so, not because a per-state constant does. `pdog.js` asserts that end to end through the real
`drawCam`: one body height across 21 states, feet on the floor line in all 20 grounded ones, and
the leap apex 60px clear of it.

**Keying JPEGs.** The later sheets arrive as JPEG on a flat dark ground with a near-black subject.
Background removal is a **flood fill inward from the border**, never a luminance cut — any global
threshold that removes the ground punches holes straight through him.

**A limit in the supplied art, and what was done about it.** Several frames carry a light filigree
crust along the spine and haunches. It is not compression speckle and not an edge artefact: it is
contiguous, *inside* the silhouette, and survives both median filtering and edge peeling, because
it is drawn into the source. Both were tried and neither moved it. The only honest fix was to use
the frames that do not have it, which is why `sniff` is 2 frames rather than 3.

**Neither sheet contains a gallop.** `come` is the side-on stride from the second sheet's row 2 —
three real leg positions, head up, motion marks. It reads as a trot, which at living-room scale is
right for all three uses. A true run needs one more sheet.

**`CAMFRAME` replaced the ternary chain.** The state→art answer changed for nine states at once,
and a five-line chain of nested ternaries cannot be read or audited. It is a table now; anything
not named falls through to a set of its own name, which is how `catch` and `shake` keep their old
frames untouched. `SENIORIMG` is also still the old dark art — he goes grey-muzzled straight back
into the Game & Watch look, and wants a sheet of his own.

**Test bookkeeping.** Two more `pwalk.js` assertions pinned DOGCAM's run *to* the park strip — the
exact arrangement this reverses. Inverted, not deleted: what is worth guarding now is that it never
goes back. `pdog.js` is new. One caution, learned again: `pall.js` failed two Lovey Dovey checks in
a batch of **six** parallel browsers and passed alone. Its heart/pulse counts are sampled maxima
over rAF frames, and the tail-latency finding from v0.318a says the worst frame goes 17ms → 53ms
under that load. Run the battery in groups of five.

### DOGCAM becomes a room (v0.323a)

**It was a side elevation.** One floor LINE at 0.82 of the canvas, everything strung along it, one
horizontal coordinate. It is a 3/4 room now: a trapezoid floor, narrow at the back wall and wide at
the near corner, and everything on it lives at `{x,z}` — x across, z from 0 at the back wall to 1 at
the edge by your feet. `rmX/rmY/rmHW/rmSc` do all of it and every object goes through them, so
nothing can disagree about where the floor is. `rmZof/rmXof` invert it for turning a finger into a
spot on the floor.

**Scale is DERIVED from the floor, not picked.** If the floor widens 2.4× back-to-front but sprites
only grow 2.1×, a ball of fixed size covers different amounts of floor at different depths and
every physical quantity in the room — a catch radius, "close enough to the bowl", a bounce — quietly
means something different depending where you are. `rmSc` is tied to `rmHW`, so one floor unit means
one thing everywhere, and `pfetch.js` asserts the two ratios match.

**Depth reads three ways at once**: higher on the glass, smaller, and a shadow that stays on the
floor and shrinks with it. One cue is ambiguous; three are not. A **held** ball is drawn bigger
again — drag it down the glass and it walks toward you and grows, drag it up and it goes back toward
the wall. That gesture falls out of the projection rather than being special-cased.

**The ball is genuinely three-dimensional**: `{x,z}` on the floor plus `hz`, its height above it.
Screen position is derived every frame and never stored. `BALL.y` is still written for everything
that reads it. The leap and its predictor moved into the same floor units, so the catch is measured
on all three axes.

**The fetch game.** A flick reads the last few points of the drag (a finger that stops dead for one
frame before lifting would otherwise throw nothing); across the glass is across the floor, up the
glass is both distance into the room and the arc. Scoring is on the ball's FIRST touch of the floor,
not where it stops rolling. **A bank is a side wall** — the target sits against the back wall, so
reaching it is the ordinary shot and counting that as a trick made every honest throw read as a
bank. Streak = a throw worth something AND returned; at four he starts intercepting, through the
same plan as any other leap so it stays a timing beat rather than a magnet.

**Gain tuning is a real trap.** The first flick constants were so hot that even a slow deliberate
push pinned against the velocity cap, so hard and gentle throws came out identical and the whole
gesture was on-or-off. The constants now map "half the glass in a quarter second" onto "reaches the
back wall", which is the band a thumb actually produces.

**What the art pack cannot do.** Sixteen sheets arrived; the tongue is the giveaway for facing,
because a dog walking away shows none. Only two sheets are away-facing and only one is a usable
cycle — so there is N, S, E and a 3/4 that faces TOWARD, and **no NE at all**. W/SW mirror E/SE and
the two away-diagonals fall back to N: a dog walking away-right showing his back is right enough,
where showing his face would be plainly wrong. The 3/4 pick is `1dc07507`, not `13318be3` — the
latter is a bound with all four feet off the floor, which does not belong beside a grounded trot.

**Still on the old floor line**: treats, poos and the pup. They keep their glass-space physics and
will sit slightly off the room's floor. The robot and both bowls and the bed were converted.

**Testing.** `pfetch.js` and `proom.js` are new. Two harness lessons worth keeping: a synthetic drag
fired in one synchronous burst gives every point the same timestamp, so the clamp bites and a gentle
throw and a violent one measure identical — walk it in real time. And `pdog.js`'s drawImage spy only
understood the five-argument blit; the directional strips go through the nine-argument form, so
every walking state read as "the sprite vanished" until it learned both.

### Room layout pass (v0.324a)

**Levels 1-5 cost half.** The opening levels are where the game is teaching you what the buttons
do, and charging full price for the tutorial is charging for the tutorial. Full price from six.

**He was being swallowed by the room.** The old rule shrank him by the floor's whole 2.41x AND by
the puppy stage on top, so a level-1 dog halfway up the room drew at about 4% of the canvas.
`DOG_BODY_MIN` is what he used to draw at his absolute LARGEST and is now his smallest - he never
goes under it, puppy or not - with the depth falloff compressed to 1.60x and growth to 1.18x.

**A size change makes absolute constants lie.** `LEAP_CATCH_R` and `LEAP_RUN` were floor units
tuned when his body measured 0.108 of the room; he got 1.6x bigger and they did not, so the catch
radius shrank *relative to him* and the band of throws worth leaving the floor for closed up. They
are expressed against his own body now (`leapCatchR()`, `leapRun()`) and behave the same at any
size. Worth remembering the next time anything in the room is rescaled.

**Where the leap band actually starts.** His standing muzzle is 0.73 of a body; the lowest a
scaled-down jump can put it is about 1.0 of a body, because the frames only climb so far back down.
Anything peaking under a body-length is his to take on his feet, and that is correct - it is the
same overreaction as a person jumping for something at chest height.

**Furniture is at the near-left**, bowls at double size with the bed alongside, all at z=0.74 - not
right at the edge, because they draw upward from their floor line and any closer runs the rims off
the panel. They are painted ALWAYS after him: a dog standing in front of his own bowl hides the one
thing you most need to read the state of. `camFurnRects` is the single source for draw and tap,
which the old layout was not - the hit-test recomputed the same magic numbers and drifted the
moment anything moved.

**The window is flat on the back wall**, centred 80% along it and clear of the floor line. Its
mullion had been hardcoded at the OLD window's centre, so it was still standing on bare wall a
third of a screen away from the glass.

### The walk pack, and the slingshot (v0.325a)

**Four separate faults were making his animations "all over the place", and none of them shows in
a still frame.** All four were in the direction art or in how it was clocked.

1. *The toward-camera sheet was wired up as N.* The tongue is the giveaway - a dog walking away
   shows none - and `6722f635` has a face, a tongue and two eyes. He showed you his front while
   walking to the back wall, and his back while walking toward you.
2. *The three-quarter sheet was a gallop.* `1dc07507`'s frame heights spread 56% and its bottom
   edge wandered 17px, because all four feet leave the floor in it. Anchored on one ground line
   that is not a walk, it is a **hop**, and it fired on every diagonal step.
3. *Only five frames of a twenty-five frame cycle were stored.* `DIR_FRAMES=5` took row 0. Playing
   every fifth pose of a smooth cycle is not a slow walk, it is a stagger.
4. *The cycle ran on the wall clock.* `DOGDIR_FPS=8` is right for exactly one speed, and the
   wander, the errands, the chase and the fetch are four different speeds, so his feet skated at
   three of them.

The pack now carries five facings (E, SE, **NE**, S, N) of 25 frames each, W/SW/NW mirrored, and
`DOGDIR_MAP` puts the away-diagonals on the real away-facing three-quarter instead of falling back
to N. The phase is advanced by **how far he actually moved** (`CAM.walkPh`, `WALK_STRIDE`), so one
set of art reads as an amble or a fast trot with nothing else to author.

**Normalising each sheet to its own height was wrong.** A rear view is shorter because you cannot
see his head over his back - not because he shrank. Scaling every sheet to a shared target inflated
N by 38%, so he grew every time he turned away. All five are stored at ONE scale off the E sheet
and report the same `body`, and what changes between them is only how much of a dog you can see.

**The room's depth was being applied twice to the walk sheets.** `dogBodyF()` already carries it,
and `dogDirDraw` multiplied `rmSc(z)` in on top: he swelled by a third the instant he started
walking at the near edge and shrank by nearly half at the wall. pdog.js used to check the two
families of art against *each other* rather than against one number, which is exactly the check
that cannot see this; it is one size across every pose now.

**`come` is a bound with all four feet off the carpet, and it was the standing fallback for eight
states** - including `bark`, which is what you see after every fetch and every call. He ran on the
spot through all of it. The walk sheets cover every frame he is actually crossing the floor, so
anything reaching `CAMFRAME` is a dog stood still and belongs in `idle`.

**He never stopped walking.** The wander picked its next target on the frame it reached the last
one. It rests 0.9-3.3s at each end now, which is most of what makes the room look inhabited.

**He left the floor for a ball at ankle height.** `LEAP_K_MIN` was 0.06 and the gate was 20% of a
body, while the ground-level catch already takes anything up to 85% standing. Raised to 0.30 / 62%
with the cooldown up to 1.15s. A dog jumping for something at chest height looks like a bug.

**The flick is a slingshot.** Press the ball, pull it BACK across the glass, let go, and it pings
away along the line you stretched. Power is the DRAW, not thumb speed - the old flick read
velocity, so an identical gesture threw differently every time and there was nothing on screen
saying what you were about to get. The band and a dotted aim ray are drawn from the anchor, rubber
creaks once per notch of new stretch, it ticks while held under load, and it snaps on release.
A held ball and its band draw **over** the room: you pull it to exactly the strip of carpet the bed
sits on, and behind the furniture is no place for the thing you are aiming.

`pfetch.js`'s flick assertions were **inverted, not deleted** - "a hard flick beats a slow push"
became "the same draw at any speed gives the same shot", which is the property the new gesture is
for. Same for its "four sheets of five".

### The deck slingshot, the intercept's skill floor, the level-up show (v0.326a)

**The ball can be dragged out of the room entirely.** The DOGCAM is only the top 42% of the phone
and everything under it is black button deck, which is where a thumb actually wants to pull back
to. `#slingcv` is a third canvas spanning the whole of `#game` at z-index 44, `pointer-events:none`
and `display:none` until something is being aimed - the drag is captured by `#dogcv` on
pointerdown, so it keeps receiving moves over the DOM below and no button ever sees them.

**The lock is the whole trick.** The lock line is the bottom edge of the room and is never drawn.
The first frame the finger crosses it, two things freeze for the rest of the drag: the room
`{x,z}` the throw will leave from, and the point on the split it crossed at. After that the finger
only sets direction and power. That separation is what lets you pull the ball right down over CALL
BONES for a full-power shot without the launch point sliding down there with it. The room keeps
drawing the shadow at the locked origin - it is the only thing saying where the shot starts while
you aim from somewhere else entirely.

Power is depth into the deck, continuous, and `botY` is short of the true bottom edge by 1.3 ball
radii so a full draw is reachable by a thumb that stops at the bottom of the glass and the ball is
never half off the picture. The band is laid down as **squares stepped along the line**, not a
dashed stroke: a CSS dash at this scale is a grey smear next to everything else on the screen. It
thickens and goes white → warm → red as the pull comes on. On release it collapses back into the
lock point over 0.2s rather than blinking out.

**Anything the plan knows about, the plan compensates for.** This one cost a wrong turn worth
recording. The intercept was a magnet, so the first pass slowed his lane run, shrank his mouth and
lengthened his wind-up by stamina and strength — and it changed *nothing*: `dogLeapPlan` reads all
three and simply declined the leaps he could no longer make. Catch rate stayed at 24/24 for both an
untrained and a maxed dog. Difficulty has to live where the plan does not look, so it lives in
**execution**: `LEAP_ERR_B` puts an untrained dog's jump most of a body-length off where the ball
will be, and `LEAP_TIME_ERR` mistimes the wind-up by up to half of it. Both are rolled once per
leap and held (a dog who is off does not drift back on), and both are zero at full attributes,
where the leap is exactly what every dog used to get for free. Measured over 60 crossings:
untrained ~45%, mid ~92%, maxed ~97%.

The wind-up being stamina-scaled has a second, correct consequence: an untrained dog is slow enough
off the mark that a ball only just over his head has fallen out of the reachable band before he
could be up there, so he declines it. `panim.js`'s single "he will not leap for a ball over his
head" was **refined rather than relaxed** — it names whose legs now, and still fails either dog for
leaving the floor at knee height. `pleap.js` maxes the attributes at boot and says why: it tests
the leap machinery, and which dog's leap that is has to be stated.

**Levelling up is a two-second show.** He stops the errand and bounces on the spot with a shimmy,
72 pieces of chunky confetti fall (squashed on the vertical, which is what a flat piece of paper
turning over does and costs nothing next to a real rotation), and the number overshoots to 1.25 and
settles. Everything else on the cam holds; the ball keeps flying, because freezing a throw mid-air
to celebrate would eat the throw. One show however many levels landed at once, and it bails
entirely in the park, on a run, at the burial or in a boss fight.

### The panel scroll, and the dance (v0.327a)

**A flex column does not overflow — it squashes.** The menu is a flex column with a fixed header
and a stack of buttons; on a short phone the stack was compressed and NEW GAME simply ended up off
the bottom with nothing to scroll. `.pscroll` is the shared fix: `flex:1 1 auto` with
**`min-height:0`**, which is the half that actually matters — without it a flex child refuses to
shrink below its content and never scrolls, however much overflow you give it. `.pclose` stays
OUTSIDE the scroller: it is absolutely positioned against the panel, and a child of a scroll
container scrolls with the content, so putting it inside would carry CLOSE off the top.

Settings had an inner `max-height:56vh` scroller with two buttons stranded below it. That inner
scroller is gone — one scroller per panel, or the inner one eats the drag and the outer never
moves. `pdeck.js` asserts both on a 640-tall viewport and counts nested scrollers.

**The dance strip.** Sixteen frames of him up on his hind legs, 4×4, replacing the standing art
the celebration was borrowing. It is rendered at the **same nominal scale as the idle sheet** — his
175px against the standing dog's 105px, a ratio of 1.67, which is what a labrador up on his back
legs actually measures — so it borrows the idle sheet's scale outright and reports the shared
`body` of 80, storing 138px tall. Normalising it to its own height, the way the grounded sets are
normalised, would have drawn a rearing dog at exactly the height of a standing one: the same
mistake that inflated the rear-view walk sheet by 38%. The code's own bounce is halved and the
shimmy is gone, because a sprite that is already dancing plus a big bounce reads as a dog being
shaken rather than a dog dancing.

**Three harness faults in one pass, worth the pattern.** The intercept trial swung 59/60 to 44/60
between runs for the *same maxed dog* whose aim error is exactly zero — 60 trials × 140 frames is
140 seconds of simulated cam, long enough for the FLY to turn up on its own random clock and pull
him out of the lane. The trial now silences the fly, treats, poos and hearts. The CLOSE-button
check measured against the window when the panel starts 42% down the screen. And the settings
check read `#mReplayTutorial`, which is `display:none` unless the tutorial is replayable and so
reports a 0×0 rect at the origin — it reads as "unreachable" however well the panel scrolls. Probe
a hidden element and you will always fail; probe the last *visible* one.

### The bowls and the bed go to the far wall (v0.328a)

**Nothing here is sized by a constant any more.** The bowls take `rmSc` at their own depth and the
bed is measured as a fraction of the FLOOR'S WIDTH there — so both come out right for wherever
they stand, and would stay right if they were moved again. The bed used to be a flat fraction of
the screen, identical at any depth, with a hardcoded `bx` lifted from the pre-room layout: that
`bx` was pointing at a patch of carpet the bed had not occupied for three versions, which is what
the poo drop and the SUPPLIES highlight were both aiming at.

`BOWL_BIG` survives at 2× but its comment is now honest: it is a legibility allowance for two
objects whose state you have to read at a glance, not a claim about where they are. At true scale
on the back wall a bowl would be about twenty pixels across.

**Painter's order flips with the geometry.** They were painted last on purpose — at the near edge
he stood in front of his own bowls and hid the one thing you most need to read. On the far wall he
is in front of them almost everywhere, and a bowl painted over a dog standing three feet nearer is
plainly wrong. The furniture and the bot both go in before him now. `pfetch.js` pins the order by
swapping out `drawRoomFurniture` (a top-level declaration, so the identifier `drawCam` calls and
the window property are one binding) and timing it against the first dog blit.

**The x's leave the middle of the wall clear**, because the target X is on that same wall and every
throw is aimed at it. A bowl under the X would foul half the honest throws; as placed, the food
bowl's foul disc misses the DIRECT band by a hair.

**Two coordinate spaces had quietly merged.** `ROBOT.x` was a canvas fraction where it was drawn
and a FLOOR x where it was compared against `CAM.x` — which held together only because the old
bowls sat at the near edge, where the two nearly coincide. Move the bowls and it comes apart. It is
a floor x everywhere now, projected at the point of drawing, and he is scaled by his depth like
everything else standing on this floor. `POOS` had the same split and got the same treatment.

**A top-level `const` that reads another one has to come after it.** `const ROBOT_Z=SPOT.food.z+0.13`
was declared beside the bot's code, thousands of lines above `SPOT` — the temporal dead zone threw
at load and took the entire rest of the script with it. It cost one screenshot to find and would
have cost nothing if the battery had run first: every suite checks `pageerror`.

Three assertions in `pfetch.js` were **inverted, not dropped** — "down by his XP bar", "double
size" and the bed's position pinned the near-edge layout, which was the right answer while it lived
there. Two harness faults on the way: the overhang check measured against the BACK WALL's edges
when the furniture stands slightly forward of it, where the floor is already wider; and the
draw-order spy only knew `DOGCAMIMG`, when the side sets are blitted as the per-frame canvases
`stripFrames` cuts at load.

### One slingshot UI, one dog size, one draw order (v0.329a)

**The five walk sheets are not drawn at the same size, and measuring a paw proves it.** v0.325a
normalised each sheet to its own height; v0.327a replaced that with one shared scale off the E
sheet, on the argument that all five were rendered at the same nominal size, so a rear view SHOULD
come out shorter — you cannot see his head over his back. That argument is checkable, and it is
wrong. A paw is as wide from the front as it is from the side, and the median paw width runs
**16.0px on E, 12.0 on SE, 9.5 on S, 9.0 on NE, 8.5 on N**: the side dog is drawn nearly twice the
size of the rear one. A shared scale does not preserve their true relative sizes — it preserves the
source's inconsistency, and on screen he lost a third of his height every time he turned away.
Back to per-sheet normalisation, which is what the eye said too: rendering all four candidate rules
side by side (shared / own-height / paw / a blend) makes it obvious, and the comparison strip is
kept as `dogcam-normalisation-v0.329a.png`. Paw-width normalisation over-corrects badly — a leg is
deeper than it is wide, so a front view sees a narrower one. Stored heights now sit in 81–87px
against 59–83 before, and `pdog.js` fails the pack if the widest and narrowest differ by 12%.

**The room drew a second slingshot.** With the deck band doing the job a foot lower, the forks and
the aim ray on `#dogcv` were two slingshots arguing over one gesture. Both are gone — and so is a
third, older one that was easy to miss: a dashed tether from the ball's floor spot up to the ball,
living inside `drawFloorKit` rather than with the rest of the aiming UI. `pdeck.js` counts dashed
strokes on a mid-room drag and fails on any.

**With nothing drawn at the moment of touch, the gesture needs teaching.** A red arrow points down
off the ball with DRAG THE BALL DOWN under it, and it retires after five shots actually fired from
the deck. It counts landed deck shots, not sessions, and rides on `S` so it survives a save — a
prompt that returns on every reload is a prompt that never taught anybody anything. In-room
releases deliberately do not count: the deck pull is the lesson.

**Furniture goes in first now, not just before the dog.** It stands against the far wall, which
makes it the furthest thing in the room that is not the room itself, so it is drawn straight after
the floor and its markings and everything else paints over it. v0.328a had only moved it ahead of
the dog and left it after the bot — so the bowls were painted over the robot standing in front of
them. `pfetch.js` times `drawRoomFurniture`, `drawRobot` and the first dog blit and pins all three.

### The throw learns to arc, and the board opens up (v0.330a)

**It fired like a rifle, and the numbers say why.** At 1.85 floor units a second across the carpet
a full pull crossed the whole room in half a second and hit the back wall before it had come down
at all — flat, fast, over. The new values come out of the flight rather than out of taste: landing
on the mark from the near edge is 0.74 floor units, a throw that takes ~1.1s to get there needs
`vh = g·t/2 = 1.43` and, against the 0.55 drag, about 0.95 across. `SLING_DECK_K` 1.85 → **0.95**,
`SLING_DECK_UP` 1.18 → **1.45**. Measured: a full pull now flies 1.1s and peaks at **1.54
dog-heights**, three-quarters lands at z=0.37, half at z=0.62 — so aim is a thing again. It also
means a thrown ball is genuinely above his head, which is what makes the intercept a jump.

**The shadow was capped and stopped being a gauge.** It was two clamped subtractions that ran out
at about a fifth of the arc, so the whole climb and fall read identically. A reciprocal
(`0.017/(1+hz·3.2)`) has no ceiling to hit: it shrinks and dims smoothly all the way up and swells
all the way back down.

**Three targets, and you earn the other two.** One X is up while the ball is in your hand or in the
air; land a shot and the other two come up and stay up, hands off, until you miss. `FETCH.hot` is
set on the hit itself rather than off `FETCH.streak` — the streak only moves once he has actually
brought the ball back, which is a long way after the moment you want the board to light up. Thick
white crosses on a dark backing, breathing gently, and all three sit clear of the furniture by more
than a foul radius so a shot on a target can never also foul on a bowl. `pfetch.js` had to be
taught this: its scoring probe left `hot` on between unrelated cases, so a "near miss" of the
middle X was scored a bullseye on a side one.

**The ball is free and it wears out.** Two hundred throws and it goes, loudly — on the LANDING of
the two-hundredth rather than at the release, because a thing that bursts should burst when it hits
something. Twenty-two chunky shards, a white flash ring, POP, and a new one a second and a half
later. A save from before this carries `ballOwned:false` and `deepAssign` restores it faithfully,
so the load path grants one: otherwise an old game sits there being told to buy a ball in a shop
that no longer sells the first one.

Levels 1–5 take another 25% off (1.5 → **1.125**), and snapping at the fly is a jump now — the same
`leapAirFrame` the real leap uses, on a 0.8s loop with a hop under it, instead of the pawing-at-the-air
pose it had.

### The trick tree (v0.331a)

**Four unlocks, bought with the points the attributes already use.** The three attributes are a
dial you turn; these are things he can suddenly *do*. FETCH is deliberately load-bearing — it is
what puts a ball in the room at all, so the very first point anyone ever spends changes what the
game is. `req` gives the tree a shape rather than a list: JUMP CATCH needs FETCH, ROLL needs SIT.
The leap is gated on JUMP CATCH, which is why `pleap`, `panim` and `pdeck` all had to be taught
their tricks at boot — an untaught dog correctly never leaves the floor, and every leap assertion
would otherwise have passed for the wrong reason.

A save from before the tree has no `tricks` at all, so the load path grants FETCH to anyone who
already owned a ball. Taking his ball away because a feature arrived after he earned it would be a
punishment for playing early.

**Two gestures on his body**, read on release off the whole travel from where the finger went down
— not off the last frame, which is a flick and not a swipe. Down is SIT, sideways is ROLL. A stroke
that wanders is still a stroke: `GEST_MIN` makes it cover real distance and `GEST_AXIS` makes it be
decisively one axis, or petting him would set him rolling.

**The roll sheet carries the trick twice with walk frames between it** — 0-1 walking, 2 head going
down, 3 tucked, 4-5 over on his back, 6 coming up, 7 rising, then it all happens again. Only 2..7
is the trick. Its scale reference is the UPRIGHT walking frames rather than the sheet median: half
of these frames are a dog lying on his back, which is not a height you can normalise against.

**The dance moved to the tap.** A level is BANKED when the XP lands and CONFERRED when you tap the
bar, and those can be minutes apart — dancing in `addXP` meant he celebrated a level nobody had
claimed yet, usually while the player was looking at something else. It runs 5s now instead of 2.1,
and he dances at `PARTY_SIDE` rather than where he stood, because the skill panel comes up over the
bottom of the screen a moment later and a dog dancing behind a menu is a dog nobody sees.

Also: back to **one** target (thicker, no ring around it, up only while the ball is in play — the
three-target board lasted one version); `SPOT.near` moved to the middle of the near edge so being
called and bringing a ball back land him in the same place; and the loft is no longer linear in the
pull (`slingLoft`), so a haymaker goes proportionally higher while the horizontal stays linear and
the landing spot stays predictable.

---

## v0.332a — the flyby, the patience, the floor under the wage, and one bare brace

**Birds make a PASS now; they do not follow.** The old flock chose a lifetime scaled to the world's
own size and wrapped around the torus while it ran — and the world grows every wave, so from wave 2
the lifetime outlived the gap to the next flyby and the flock simply stayed, glued to him. A pass is
a straight line with a beginning and an end: `PAL_BIRD_LANE` offsets the line sideways so it never
runs through him, the wrap is gone, and `life` is the time to cross `2R` at their own speed, so they
arrive, cross, and are gone whatever size the park has grown to. The gap only starts counting once
the sky is empty (`if(p.birds.length===0) p.passT-=dt`), which is what makes it read as a flyby
rather than a stream.

**He gives the throw a chance to land.** `chaseHoldFor()` returns a hold that scales with how far
the ball is from where he is standing — a third of a second for one at his feet, a second and a half
for one aimed at the far cross — so the player can actually hit the target before the dog is on it.
He always goes, always brings it back, and PLAY FETCH (`FETCH.eagerT`) clears the hold outright,
because pressing PLAY FETCH means "go", not "wait". `BALL.needsFetch` is what marks a ball as
outstanding, and only a real throw sets it: a ball whose position was assigned by hand is a ball
nobody gave him, and he correctly ignores it. Any harness that fabricates a ball has to arm it.

**Nobody works for free.** The delivery penalties were absolute numbers against a wage that is not,
so a bad-but-productive shift could zero out. The deduction is now capped at `1-PB_KEEP` of the
gross — 60% — so a shift that delivered always takes something home, and the results screen names
the difference ("THE DEPOT ATE $n OF THAT") instead of silently showing £0. Absolute constants
become lies the moment anything around them is rescaled; this is the second time that has bitten.

**The CONFUSED chip over the XP bar was one character.** A deleted `#camMsg` rule left its closing
`}` behind, which put the CSS parser into error recovery, and error recovery ate the whole of the
*next* rule — `#portrait` lost its position, its size and its `display:none` and sat permanently
over the XP bar. No suite could see a dropped rule, so `pflock` now counts `document.styleSheets`
rules and asserts `#portrait` computes to `absolute`/`none`.

**The tree is two branches off one free root.** `TRICKS` is a flat table with `x`/`y`/`side`, drawn
by `treeLayout`/`drawTree` onto `#treecv`: gold `TREE_DOG` down the left for his body, green
`TREE_CARE` down the right for his keeping, the white `bond` root between them holding both. Nine
nodes are `soon` placeholders — they draw as two dots and refuse a point — waiting for specifics.
One tap selects and explains in the card below, a second on the same node commits; a 30px circle is
too small a target to spend a point on by accident.

**And the music is back in the file** — `MUSIC_GOODMOOD` / `MUSIC_DOGPARK` / `MUSIC_BOSS` refilled
from v0.317a, which is most of the 11 MB.

---

## v0.333a — the target runs away, and the bars that say there is more

**The cross does not stay put.** Land a shot ON it - not merely near it, the generous CLOSE ring
still scores CLOSE without touching anything - and it POPS on that frame and repaints itself
somewhere else: another patch of carpet, or up a side wall. `MARK` carries `{x,z,hz,wall}` now, so
the same object describes a spot on the floor and a spot on a wall, and `markScreenPt` projects
both through the room's own three functions with nothing new added: a point at height `hz` on the
plane `x=0` lands exactly on the drawn wall, because the wall IS the plane the floor edge is the
base of. Which surface it is painted on is told by its shape - flat on the carpet because you are
looking along it, square on the back wall, squashed the other way on a side wall.

**Where it is allowed to go is not picked by eye.** `markPool()` sweeps real throws - the deck
shot's own launch, the same gravity, the same walls, the same integration order - from five launch
spots across the front of the room, and keeps every place a ball actually ended up. So every target
is reachable BY CONSTRUCTION, and stays reachable if the throw is ever retuned. `pmark.js` then
proves it the hard way: a hundred placements, each swept with real throws until one hits it using
the game's own hit tests. A hundred out of a hundred, all of which moved.

**The back wall is empty and that is a measurement, not a gap.** Loft and distance come off the
SAME component of the aim - there is no trading one for the other - so a full-power lob arrives at
z=0 exactly as it lands, and the back wall is only ever touched at carpet height. `markLegal`
still spells out the back-wall rule, and `pmark` asserts the count is zero *the way round it
actually is*, so if the throw is ever given more energy the suite fails and says to look again.
That is the same inversion rule the rest of the battery follows.

**A wall cross is scored in the air.** `ballWalls` now offers every wall contact to the target,
which is the one place that knows which wall was touched and at what height. A strike closes the
throw (`FETCH.live=false`) so the landing cannot score the same shot twice.

**And the scrollbar is ours.** `::-webkit-scrollbar` is styled and that is right on a desktop, but
iOS ignores it outright and every other engine draws an overlay that fades the moment you stop -
so on the phone this is actually played on, a panel with more below the fold looked exactly like
one without. That is how NEW GAME went missing once already. `sbarAttach` hangs a track and a thumb
off the scroller's parent, sized to the fraction on screen and moved to the fraction scrolled,
`pointer-events:none` so it can never swallow a tap, and it stands down if the platform does give a
real laid-out bar. Swept six times a second because a panel opening or a list re-rendering changes
whether there is anything to scroll and neither fires a scroll event.

The tree panel is one scrolling column now (`#treeBody`) rather than three fixed slabs fighting
over half a screen - which is what had the attribute bars in a 96px window nobody could tell was
scrollable. A canvas inside a scroller needs an explicit height: set to flex it has nothing to flex
against and collapses to nothing.

---

## v0.334a — no dead ends

**The reported trap, and why it was a class of bug rather than one bug.** A level is conferred, and
900ms later the game offers the skill tree. `canPromptSkill()` was asked when the timer was SET -
so DOGPARK could be started inside those 900ms, and the tree then opened on top of the park's
control pad. Every panel here is a full-screen takeover of the bottom half of the phone, which is
also where every control lives, so that is not "a menu left open": it is a game you can neither
play nor leave. Its one exit, LATER, sits at the end of a scrolling column and was off the bottom
of a taller phone.

Three rules, which between them close the class:

1. **A deferred open re-asks its question when it FIRES.** `awardSkillPoint`'s offer, `mystWhistle`'s
   900ms roll-up, and `CAM.needCheck`'s status card all check again on arrival. A check made when a
   timer is set answers a question about a moment in the past.
2. **Changing screen sweeps what the player was browsing.** `uiCloseOverlays()` runs inside
   `showScreen` on every real change, so it covers DOGPARK, work, the runner, the paperboy and
   coming home, rather than being bolted onto one caller. It is a DENY-list on purpose - `UI_KEEP`
   names the five flow modals the game itself raises and closes, some of them *after* the screen
   has changed - because a panel added later should be swept unless somebody says otherwise. The
   failure that leaves is a menu closing too eagerly, which you can see; the failure the other way
   round is a game you cannot escape. `#status` and `#portrait` are swept too: not `.overpanel`,
   but they take the screen just as hard.
3. **Every exit is pinned to its panel**, not to the end of its content. `#skillPanel` and `#goout`
   gained a `pclose`, which is absolutely positioned against the panel and so cannot scroll away.

`ptidy.js` replays the exact trap - confer a level, start the park 120ms later, wait out the timer -
and then asks `elementFromPoint` what is actually on top of the middle of the park pad. On v0.333a
that answers `treecv`; it now answers `parkcv`. It also walks every panel, shows it, and asserts its
way out is on screen and nothing is over it, which is the check that would have caught this in the
first place - "has a close button in its markup" was always true.

---

## Suggested first prompt for Claude Code

> Read HANDOFF.md, then bones.html and bones.js (skim park.js). Don't change anything yet —
> confirm you can run the build command and produce a working single-file output, then tell me
> what you'd do first about the save system.
