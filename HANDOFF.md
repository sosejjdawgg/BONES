# BONES — project handoff

A mobile-first dog-care sim built as ONE self-contained HTML file. Brutalist black/white/red
pixel art, Press Start 2P font. Split screen: DOGCAM (canvas, top) + console controls (bottom).
Currently **v0.288a**.

---

## ⚠ WHICH FILES ARE REAL (read this first)

**The live game is `bones-v0.284a.html` — a single self-contained file.** Open it, edit inside
its one big `<script>`, save it back out under the next version number. That is the whole
workflow now.

```
bones-v0.288a.html   THE GAME. ~6.2MB, everything inlined. Edit this.
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
h=open('bones-v0.288a.html').read()
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

---

## Suggested first prompt for Claude Code

> Read HANDOFF.md, then bones.html and bones.js (skim park.js). Don't change anything yet —
> confirm you can run the build command and produce a working single-file output, then tell me
> what you'd do first about the save system.
