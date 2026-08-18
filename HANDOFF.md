# BONES — project handoff

A mobile-first dog-care sim built as ONE self-contained HTML file. Brutalist black/white/red
pixel art, Press Start 2P font. Split screen: DOGCAM (canvas, top) + console controls (bottom).
Currently **v0.21a**.

---

## Build system (important — read before editing)

Source files are separate; the shipped artifact is a single inlined HTML file.

```
bones.html      markup + CSS + <script src="bones.js"></script> placeholder
bones.js        main game (~107KB) — state, DOGCAM, care loop, UI, runner
park.js         Dogpark mode (2x2 toroidal survivors-like)
*.js (rest)     sprite frames as base64 data-URI arrays (large, do not hand-edit)
```

**Build command:**

```bash
cat wingframes.js jumpslide.js enemyframes.js megaframes.js parktiles.js statport.js hearts.js \
    dogframes2.js dogframes3.js runframes.js frames.js portraits.js bones.js park.js \
    > combined.js && node --check combined.js
```

`wingframes.js` must stay ahead of `park.js` — `WINGIMG` is built from `WINGFRAMES` at load.

Then inline `combined.js` into `bones.html` in place of the `<script src="bones.js"></script>`
line and write the result as the deliverable. Final file is ~1.8MB (art is inline base64).

**Always after building:**
1. `node --check combined.js` must pass.
2. Verify every `onclick` target id in combined.js exists in bones.html (a null-onclick crash
   shipped once this way).
3. Bump the version span in bones.html: `+0.01` per update unless told otherwise.

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

## DOGPARK: the wings (v0.21a)

`WINGFRAMES` (wingframes.js) is a 7-frame unfurl — 0 folded, 6 fully spread — extracted from the
owner's sheet and **aligned on the harness base**, not per-frame normalised: the frames are
*supposed* to grow, that is the unfurl. Cell 196x131, anchor x=98 y=127 (`WING.aspect`,
`WING.anchorY`). Flap loop is 4,5,6,5.

The ability lives in park.js behind the `WING` tuning object:

- Double-tap the pad → `pkLeap()`. Costs `WING.cost` stamina, then `WING.cd` seconds of cooldown.
- **Hold** the second tap to stay up (`WING.hover` = 5s ceiling, `WING.minHover` floor so a flick
  still gets a real jump). Release → dive → `pkLand()`.
- Above `WING.clearZ` he and the horde cannot touch each other — no contact damage, no auto-bark,
  no pickups, no gate banking. That mutual pass-through is the whole ability.
- `pkLand()` is the stomp: falloff damage + knockback inside `PK.stompR`, and it vacuums loose
  bones. Empty stamina instead routes to `pkFlop()` — a 22px hop and a 1.6s limp.
- Fake height is `PK.z` in screen px. Anything new that reads position on the ground must check
  `PK.z<WING.clearZ`, the same way distance maths must go through `wd()`.
- Shop: "ANGEL WINGS" is pinned to slot 0 at 500 while unowned (purchase runs the `PK.wdrop`
  descent ceremony); once owned, four wing upgrades join the normal pool. The shop draws up to
  four rows now — the SKIP row moved to `0.36 + len*0.12`.
- Dev bar has a WINGS toggle (`S.devWings`) that grants them at park start, so the leap is
  testable without banking 500.

Note for whoever picks this up: the owner referred to "the same style as the sword". There is no
sword anywhere in this source tree — the descent/golden-light presentation here was built from the
description, not matched against existing code.

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
