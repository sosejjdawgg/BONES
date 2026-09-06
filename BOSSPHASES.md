# WOLFIE — every phase, every timing, and the dial that changes it

Measured off `bones-latest.html` (v0.356a) on a 412×915 viewport, where the cage comes out
**309 × 265 px**. Board-relative numbers scale with that; everything else is a constant in
`src/src.js` and is named here so it can be changed without hunting for it.

---

## 0. Why it feels busy — read this first

**Three independent things put projectiles on the board at the same time, and none of them knows
about the others.** That is the whole answer to "too many things going on". They are:

| Layer | Runs when | Owned by | Ceiling |
|---|---|---|---|
| **The paws** — a continuous stream out of the two pentagrams | only while `BOSS.ph === "pattern"`, **and never during BADDOG** | `pkPawFightTick` → `pawFire` | `BOSS_PAW_MAX = 40` alive |
| **The beat** — one pattern spawner (phase 3: sometimes two, never under BADDOG) | `telegraph` → `pattern` | `pkBossSpawner(kind)` | per-spawner |
| **The golden bird** | any time after `BOSS_BIRD_FIRST = 8s`, every `BOSS_BIRD_GAP = 18–28s` | `BOSS.bird` | one at a time |

The paws are the newest layer and they were added *on top of* a fight that was already tuned
around the beat alone. Phase 3 fires **both** pentagrams at once, so the paw layer alone is
~38 bones a second before the beat has spawned anything. If one number is going to be turned
down, it is `BOSS_PAW_FIRE[3]`.

**One beat now runs with the stream switched off.** `slam` (BADDOG) takes both hands for its whole
length — see §4a. It is the only place in the fight where the layers do not stack, and it is
deliberately the longest beat, so a fair slice of phase 3 is now one thing at a time.

---

## 1. The opening — happens once, in this order

| Starts at | `BOSS.ph` | Length | Governed by | What he is doing |
|---|---|---|---|---|
| 0.00 | `intro` | **4.40s** | `BOSS_INTRO` | the arrival, below |
| 4.42 | `pawslam` | **3.00s** | `BOSS_PAW_SLAM` | fists → open palms → marks light → slam onto the cage |
| 7.43 | `pawwarm` | **~15.3s** | shape-governed, capped by `BOSS_WARM_DUR = 26` | phase 0.5: two swipes, then the X |
| 22.72 | the beat loop | forever | — | telegraph → pattern → breath |

### 1a. `intro` — 4.40s, sub-beats all measured from t=0

| Window | Constant | What happens |
|---|---|---|
| 0.00–0.35 | `BOSS_TURN_A/B` | the world looks away |
| 0.20–0.90 | `BOSS_RUM_A/B` | the ground starts to shake |
| 0.55–1.10 | `BOSS_CRK_A/B` | the floor opens |
| 0.85–1.40 | `BOSS_ERU_A/B` | he comes up through it |
| **1.18** | `BOSS_FIST_AT` (= `BOSS_ROAR_A − 0.22`) | **the fists come up either side of his head, before the mouth opens** |
| 1.40–2.40 | `BOSS_ROAR_A/B` | the roar, in your face. Zoom `BOSS_ROAR_ZOOM = 1.62` |
| 1.55–1.96 | `BOSS_SCREAM_A/B` (offset into the roar) | the scream fan — 150°, `BOSS_SCREAM_FAN = 2.62` |
| 2.38 | `BOSS_MUSIC_AT` | roar, a beat of silence, then the theme |
| 2.40–4.40 | `BOSS_CAGE_A` + `BOSS_CAGE_LEN = 2.00` | the cage snaps in and grows out from `BOSS_CAGE_TINY = 34px` |
| 2.40–4.40 | `BOSS_SET_A/B` | the fight assembles itself |

**Nothing is thrown during `intro`.** The fists are held clenched the whole way through.

### 1b. `pawslam` — 3.00s, four sub-beats

`BOSS_PAW_SLAM = PAWSLAM_OPEN + PAWSLAM_MARK + PAWSLAM_DROP + PAWSLAM_RING`

| Length | Constant | What happens |
|---|---|---|
| 0.80s | `PAWSLAM_OPEN` | clenched for the first `PAWSLAM_HELD = 45%` of it, then the fists **open** |
| 1.35s | `PAWSLAM_MARK` | the fire-red pentagrams fade up on the open palms. **Suspense only — no attacks** |
| 0.30s | `PAWSLAM_DROP` | the fall onto the sides of the cage |
| 0.55s | `PAWSLAM_RING` | the impact ring, shake, and the cage rings |

Still nothing thrown.

### 1c. `pawwarm` — phase 0.5, ~15.3s

A sentence in three parts. `BOSS_WARM_SWIPES = 2` singles, then the X.

**Each single swipe** (≈5.6s on a 309px board):

| Length | Constant | What |
|---|---|---|
| 0.62s | `BOSS_WARM_TELE` | the wind-up, long enough to read across the room |
| ~2.06s | `BOSS.box.w / BOSS_WARM_SPD` (150 px/s) | the swipe crosses the cage |
| 0.14s | `BOSS_WARM_TURN` | it hangs at the far side |
| ~2.06s | — | and boomerangs home to the hand that threw it |
| 0.85s | `BOSS_WARM_GAP` | between the catch and the next wind-up |

One from the left, one from the right. **Then the X** (≈3.85s):

| Length | Constant | What |
|---|---|---|
| 1.30s | `BOSS_X_TELE` | the four marks fade up, aimed at where the dog *was* |
| 1.00s | `BOSS_X_HOLD` | held solid — this is the dodge window the brief asked for |
| 4 strokes | `BOSS_X_GAP = 0.34` apart, `BOSS_X_SPD = 760 px/s` | one hand after the other, a long X |

`BOSS_WARM_DUR = 26` is a ceiling, not the governor — the shape above ends it first. If a swipe
should be quicker to read, `BOSS_WARM_SPD` is the dial; if there should be more of them,
`BOSS_WARM_SWIPES`.

---

## 2. The beat loop — every beat, from t≈22.7 onward

```
telegraph  ──▶  pattern  ──▶  breath  ──▶  (next telegraph)
  0.30-0.50      5.0-7.3       0.5-0.7
                                └── or `cool` 3.00s, once per phase change
```

| `BOSS.ph` | Length | Constant | What he is doing | Paws firing? |
|---|---|---|---|---|
| `telegraph` | 0.30–0.50s | `BOSS_TELE[kind]` | head turns to the beat's cell (`BOSS_HEAD`), the rim lights on the edge it will come over (`BOSS_EDGE`) | **no** |
| `pattern` | 5.0–7.3s | `max(spawner.life)` | the spawner runs **and the pentagrams fire the whole time** | **yes** |
| `breath` | 0.5–0.7s | `0.5 + rnd*0.2` | flat: no lean, no rigidity, no running light. He also **flinches** here (`BOSS_RECOIL_HIT = 0.42`) | no |
| `cool` | 3.00s | `BOSS_PHASE_COOL` | once per phase change, cashed in at the **end** of a beat, never mid-pattern. Both pentagrams **go out** | no |

Measured beats: telegraph 0.35 / 0.30 / 0.41; pattern 7.30 / 5.80 / 5.02; breath 0.55 / 0.55.

**Damage is only ever dealt at the end of a pattern**: `BOSS_DMG_CLEAN = 16` for an untouched
beat, `BOSS_DMG_HIT = 9` otherwise, out of `BOSS_MAXHP = 200`. The one other source is the golden
bird's reflect, `BOSS_REFLECT_DMG = 4` a bullet. So a clean run is **13 beats**; a scrappy one is
23. That, times ~6.4s a beat, is the fight's length.

---

## 3. The three phases

Thresholds are on HP, checked in `pkBossPhaseCheck` at the end of every pattern:

| Phase | HP | Enters at |
|---|---|---|
| 1 | 100% → 66% | start |
| 2 | 66% → 33% | `BOSS.hp <= maxhp*0.66` |
| 3 | 33% → 0 | `BOSS.hp <= maxhp*0.33` |

A phase change sets `coolOwed`, so the **3-second cool** lands at the end of that beat.
`BOSS.paw.cycle` resets to 0, so the fire-rate escalation restarts from the new phase's floor.

### What actually changes, phase by phase

| | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| **Paw station** (`pawStation`) | one hand over the **lid**, sliding L↔R, palm down; other hand grips the bars | one hand **orbits the outside** of the cage | **both** hands on the **sides**, swinging vertically in opposite directions |
| station speed | `P.t*0.55*pawRate()` | `P.t*1.05*pawRate()` | `P.t*1.85*pawRate()` |
| **Hands firing** | 1 | 1 | **2** |
| hand swap | every `BOSS_PAW_CYCLE = 10s` | every 10s | never — both are up |
| **Fire gap** base | `BOSS_PAW_FIRE[1] = 0.30` | `[2] = 0.19` | `[3] = 0.11` |
| rate multiplier | ×1 | ×1.35 | ×2.1 |
| **bones/sec at cycle 0** | 3.3 | 7.1 | **38** (19 × 2 hands) |
| **bones/sec at the cap** | 8.0 | 17 | **92** |
| **Bone top speed** | 66 px/s | 92 px/s | 134 px/s |
| **Pattern pool** | `BOSS_P1` — rain, sweepL, sweepR, ring | `BOSS_P2` — + **slam**, maw | `BOSS_P3` — + surge |
| **Two patterns at once** | no | no | **35% of beats**, second one `sparse` — never on or under a **slam** |
| Spawner speed-up | ×1 | ×1.18 (`fast`) | ×1.18 |

**The escalation inside a phase.** `pawRate()` is
`phaseMul × min(2.4, 1 + 0.22 × BOSS.paw.cycle)` — every 10-second cycle winds the fire rate up
by 22%, capped at 2.4×, so standing off and waiting a cycle out is never the safe play. The cap
exists because past ~2.4 the stream stops being something you move out of.

**Bone speed** goes through two multipliers before it leaves the palm:
`pawBulletSpd()` (130 / 160 / 210) × `BOSS_SPD` (0.75) × `BOSS_BONE_SLOW` (0.85) ×
`BOSS_BONE_PH[phase]` (0.80 / 0.90 / 1.00). A bone is **born at `BOSS_BONE_ACC0` = 55%** of that
and climbs to it over `BOSS_BONE_ACC_T = 0.85s`. At phase 3 a bone crosses the 309px board in
about 2.3s.

---

## 4. The beats themselves

Each `pattern` runs one spawner (`pkBossSpawner`). `sparse` thins a spawner out — it is set on
any `BOSS_FILL` beat (**sweepL, sweepR, ring, cross** — the four that own the whole board on
their own) and on the second pattern of a phase-3 double.

| Beat | Command | Life | Cadence | What it does |
|---|---|---|---|---|
| **rain** | BURY | 5.2–7.6s | every `0.52 / fast` s (`×2.2` sparse) | a fan of 9 columns from the top with **two clear columns**. From phase 2 this comes out of the *pentagram*, so it is the paw |
| **sweepL / sweepR** | PACK | 4.6–6.8s | every `BOSS_CLAW_WALL_GAP = 0.85 / fast` s (`×1.5` sparse) | a wall of claws in from one side, band `0.18–0.68` |
| **ring** | PACK | 5.0s | 1.5s apart, **3 rings** (1 sparse) | closes from every side with one door — `0.80 rad` wide, `0.95` sparse |
| **slam** | BADDOG | **9.70s** | see §4a | the lanes lock the board, then eight thumps break it open, then he is spent |
| **surge** | BURY | 5.6s | 0.3s | things come **up** through the floor, telegraphed by pocks |
| **maw** | FETCH | 6.4s | `BOSS_MAW_RATE = 0.075` (13/s) × `BOSS_MAW_BURST = 11` rounds, `BOSS_MAW_GAP = 0.85` between bursts. **2 bursts at phase 2, 3 at phase 3, 1 sparse** | the head leans in over the board and hoses it, the barrel panning. `BOSS_MAW_MAX = 30` alive |


`BOSS_HEAVY = [maw, ring, surge, slam]` — a phase-3 double never puts two of these together, and
never two `BOSS_FILL` shapes together. `slam` is additionally excluded **by name** from both sides
of the double: it can neither carry a garnish nor be one. Those rules are in `pkBossBeginPattern`.

---

## 4a. BADDOG — the lanes and the fists (v0.356a, timing revised in v0.357a)

The two BADDOG beats used to be separate pool entries — `cross` threw yellow squares across the
board, `pound` walked one fist along a line — and both of them ran on top of a pentagram stream
that never stopped. They are one beat now, and **the stream is off for all of it**.

| Stage | Length | Constant | What he is doing |
|---|---|---|---|
| **lock** | 2.30s | `SLAM_LOCK` | two walls of yellow squares drive in at `SLAM_LANE_SPD` (180 px/s) and **park** — one across, one down, each with one gap. Both fists come off the cage and cock beside his head |
| **wind** | 0.35s | `SLAM_WIND` | cosmetic only, as of v0.357a — see below. Nothing is marked yet |
| **hits** | 7×0.40s + 0.95s | `(SLAM_HITS-1)*SLAM_GAP + SLAM_TELE` | fist after fist, **alternating hands**, each aimed at where the dog *is*. Every mark, hit zero included, is on the floor `SLAM_TELE = 0.95s` before its own fist arrives |
| **rest** | 3.40s | `SLAM_REST` | both hands slide off the bars and hang open. Nothing happens at all |

**Life = 9.95s** (2.30 + 0.35 + 3.75 + 3.40, plus a 0.15s guard frame — see below). Long, because
it replaces two beats and because the rest is the point.

**v0.357a folded the first mark's special case out.** It used to be placed during `wind`
(then 0.80s long) with its own longer lead, while the other seven got `SLAM_TELE` alone — a fine
distinction to a bot with a zero-millisecond reflex, and the exact seven marks a real player was
finding unavoidable. Every mark is scheduled the same way now: mark *n* (0-indexed) is laid at
`n*SLAM_GAP` into the `hits` stage and bangs at `n*SLAM_GAP + SLAM_TELE` — uniform, so raising
`SLAM_TELE` moves every mark's appearance earlier without ever touching when a fist actually
lands, and there is no special case left to regress. `wind` is kept only as a cosmetic beat: the
fists visibly rise and the charge sound plays before the first mark exists at all.

**The 0.15s on `life` is not decorative.** `BOSS.patternT` and the pound's own `rest` clock cross
their thresholds on the same frame, and `pkBossFinishPattern` is checked *before* `pkPawFightTick`
runs that frame — so an exactly-sized `life` wins the race every time, ends the pattern a frame
early, and its own safety line ("never leave a fist parked mid-swing") force-clears the pound's
`on` flag without ever setting `done`. The pound then reads as permanently unresolved — stranded,
not finished — until the next pattern nulls it outright. One extra tenth of a second is enough for
`pkPoundTick` to get the frame it needs to finish rest naturally first.

- **The squares stop.** A lane bar carries `park`, drives to its station and halts there. What
  stands on the board is a lattice with two ways through it, not a wave to wait out. Bars are out
  of `bossBoneAcc` for this reason — a wall that eases in over most of a second arrives after the
  fists that are meant to break it.
- **Every thump throws the squares near it.** `SLAM_KNOCK = 94px`. A knocked bar goes `dead`
  (harmless immediately), arcs out and up, spins, and is drawn in **panel space** — outside the
  board's clip — so it sails past the bars and burns out in open air over `SLAM_FADE = 0.90s`.
- **The cage itself jumps.** `SLAM_KICK = 9px`, a damped shudder applied as a *draw* offset before
  the board's fill, border and clip, so the box and everything in it move as one object. The
  board's coordinates never shift: nothing that was safe becomes unsafe because the picture moved.
- **The last thump collapses what is left** — `pkPoundCollapse` throws every surviving square off
  the board, so the rest happens on an empty cage.
- **Both fists wear `fistd`** — the same clenched sheet as `fist`, cocked further over the cage
  (`PAWPOSE.fistd.img = "fist"`). During the rest they open to `palm`: a clenched fist hanging off
  the bars still reads as ready, and he is not.

Two things this beat is *not* allowed to do, both enforced in `pkBossBeginPattern`: run with a
second spawner under it, or appear as the sparse second pattern of someone else's beat. It owns
both hands, so there is nothing left to run a garnish with.

---

## 5. The golden bird

Independent of everything above. First at `BOSS_BIRD_FIRST = 8s`, then every
`BOSS_BIRD_GAP = 18–28s`, flying at 70–100 px/s. Catch her and for `BOSS_GOLD_T = 6s` everything
thrown at him bounces back up the neck at `BOSS_REFLECT_SPD = 520` for `BOSS_REFLECT_DMG = 4` a
bullet. It is the only way the player deals damage on purpose.

---

## 6. The flinch (v0.355a)

One door: `pkBossFlinch(full)`. Both hands abandon their station and clench at
`headX ± BOSS_FIST_SPREAD (78)`, `headY + BOSS_FIST_DROP (34)`.

- **`BOSS_RECOIL = 0.80s`** — a reflected bullet actually hurt him
- **`BOSS_RECOIL_HIT = 0.42s`** — he merely failed to land a beat, taken during the breath

While `BOSS.paw.recoilT > 0` **nothing spawns**: the paws do not fire *and the beat's spawner tick
is gated too* (gating `pawFire` alone was not enough — BURY's fan is pushed by the spawner). It
refuses to start while a pound is mid-swing, and refuses to retrigger while one is running.

---

## 7. Measured: at phase 3, moving barely helps — and BADDOG is meant to be worse

`pbossfight` runs two dogs through the same beats — one standing still in the middle, one walking
away from the nearest bone that is actually closing on it. Over three runs:

| | still | moving |
|---|---|---|
| run 1 | 0.86 hits/s | 0.66 |
| run 2 | 0.77 | 0.63 |
| run 3 | 0.62 | 0.80 |
| **mean** | **0.75** | **0.70** |

**Seven percent.** A crude player who keeps moving is hit almost exactly as often as one who does
not move at all. That is the "too many things going on" complaint as a number: with both
pentagrams firing from the sides and a pattern running underneath, walking away from one hand's
stream walks you into the other's. It is not that the bot is bad — there is nowhere to go.

Whatever is turned down below, this is the number to re-measure afterwards.

**BADDOG is excluded from that measurement, on purpose.** Its eight thumps are *aimed at the dog*,
so a dog standing still is marked where it stands and eats every one of them by construction. Its
fairness is a different, separately-asserted contract — and as of v0.357a that contract is
explicitly "escapable with a small but real window," not "unavoidable": the brief changed mid-way
through, and the numbers below are what answers it.

---

## 7a. BADDOG is escapable now, not unavoidable (v0.357a)

Shipped in v0.356a, the thumps gave every mark after the first `SLAM_TELE = 0.55s` on the floor.
The math looked fine against a bot with instant, perfect reactions: `pkBossSpd()` floors a
neglected dog's speed at `BOSS_SPD_REF*BOSS_SPD_MIN*BOSS_SPD_BOX` ≈ 68px/s, and 0.55s of flight
buys 37px against a 36px (`POUND_R`) mark — a single pixel. Subtract any real reaction time at all
and it is gone. It read as unavoidable because for anyone who wasn't a bot, it was.

`SLAM_TELE` is **0.95s** now. Assume a fast-but-human **150ms** to see a mark and answer it:
`(0.95-0.15)*68 ≈ 54px`, eighteen clear of the mark rather than one. A healthy dog (94px/s) clears
it by twenty-nine. Standing on the mark is still death — the fight does not owe you safety for
not moving — but leaving, even late, on the slowest dog the fight allows, is now a real escape and
not a coin flip.

`pbossfight`'s escape section drives exactly that dog: `PK.spd` forced to the floor, a bot that
ignores every mark younger than 150ms and flees the rest (pulling back off the walls so it never
corners itself, the same recipe the phase-3 dodge bot uses), and asserts **zero hits across a full
barrage, with the closest thump still clearing the mark by more than a couple of pixels** — not
just "it happened to survive this run." The lattice of parked squares is stripped out of this one
measurement on purpose: touching a square is a real, intended hazard (that's what "locks off part
of the cell" means), but it's a separate claim from "can the fists alone be dodged," and folding
the two together turned a clean thump into a false hit whenever the flee path grazed a square.

Three bugs surfaced building this, all in the test rather than the fight, and all worth knowing
about before adding another `pbossfight` bot:
- **A poll is not a frame.** The first cut moved the bot by a fixed `speed*20ms` per loop
  iteration, on the assumption that a 20ms sleep takes 20ms. Headless Chromium does not honour
  that — a single `evaluate()` round trip here runs several times longer in practice — so the bot
  was moving as though a fraction of the real time had passed. Fixed by measuring the actual
  `BOSS.t` delta between polls and scaling movement by that instead.
- **Fleeing a point you're standing on is undefined.** Every mark is planted exactly where the dog
  currently is, so the very first "direction away from the mark" is `(0,0)/0` — no direction at
  all — and a `||1` fallback quietly turns that into "don't move," forever, since a dog that never
  moves keeps getting marked on the same frozen spot. Fixed by feeding a mark that close no
  direction at all and leaning on the pull-toward-room bias instead, which is never actually zero
  once the dog starts anywhere off the board's exact geometric centre.
- **Two players don't need to touch the fight to touch each other.** `bornAt.has(m)` and
  `po.marks.length` deltas both undercount for the same reason `po.n` exists in the first place
  (§4a's own note): two marks can be created and one removed between polls, and an array-length
  comparison misses it. Both were switched to `po.n`, the beat's own reliable counter.

## 8. If it is too busy, these are the three dials, in order

1. **`BOSS_PAW_FIRE[3] = 0.11`** — the phase-3 paw stream is 38 bones a second before the beat
   adds anything. Raising this to `0.16` takes it to 26/s. This is the one.
2. **The `pkBossBeginPattern` double** — `BOSS.phase>=3 && Math.random()<0.35`. Drop the 0.35 and
   phase 3 runs one beat at a time like the other two.
2a. **More BADDOG.** It is the only beat that runs with the stream off, so weighting the pool
   toward `slam` is the cheapest way to buy quiet without changing a single rate.
3. **`pawRate()`'s cap** — `min(2.4, …)`. At 1.8 the late-cycle stream stops climbing sooner
   without touching how a phase opens.

Two more, if the fight needs room rather than fewer bullets:

4. **`BOSS_PHASE_COOL = 3.0`** — the pause after a phase change, the only long gap in the fight.
5. **`0.5 + rnd*0.2` breath** in `pkBossFinishPattern` — 0.55s between beats is short. A second
   there changes the fight's whole tempo without changing a single pattern.
