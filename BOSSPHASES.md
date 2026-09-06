# WOLFIE — every phase, every timing, and the dial that changes it

Measured off `bones-latest.html` (v0.355a) on a 412×915 viewport, where the cage comes out
**309 × 265 px**. Board-relative numbers scale with that; everything else is a constant in
`src/src.js` and is named here so it can be changed without hunting for it.

---

## 0. Why it feels busy — read this first

**Three independent things put projectiles on the board at the same time, and none of them knows
about the others.** That is the whole answer to "too many things going on". They are:

| Layer | Runs when | Owned by | Ceiling |
|---|---|---|---|
| **The paws** — a continuous stream out of the two pentagrams | only while `BOSS.ph === "pattern"` | `pkPawFightTick` → `pawFire` | `BOSS_PAW_MAX = 40` alive |
| **The beat** — one pattern spawner (phase 3: sometimes two) | `telegraph` → `pattern` | `pkBossSpawner(kind)` | per-spawner |
| **The golden bird** | any time after `BOSS_BIRD_FIRST = 8s`, every `BOSS_BIRD_GAP = 18–28s` | `BOSS.bird` | one at a time |

The paws are the newest layer and they were added *on top of* a fight that was already tuned
around the beat alone. Phase 3 fires **both** pentagrams at once, so the paw layer alone is
~38 bones a second before the beat has spawned anything. If one number is going to be turned
down, it is `BOSS_PAW_FIRE[3]`.

There is a fourth thing that only *looks* like a fourth thing: **POUND** is a beat that borrows a
paw. While it runs, that hand stops firing and stops holding its station (`busy` in
`pkPawFightTick`). It is not extra load, it is the paw doing something else.

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
| **Pattern pool** | `BOSS_P1` — rain, sweepL, sweepR, ring | `BOSS_P2` — + cross, maw, pound | `BOSS_P3` — + surge |
| **Two patterns at once** | no | no | **35% of beats**, second one `sparse` |
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
| **cross** | BADDOG | 5.4s | 1.05s apart (2.4 sparse) | alternating horizontal / vertical lanes, one gap each, no spin on anything |
| **surge** | BURY | 5.6s | 0.3s | things come **up** through the floor, telegraphed by pocks |
| **maw** | FETCH | 6.4s | `BOSS_MAW_RATE = 0.075` (13/s) × `BOSS_MAW_BURST = 11` rounds, `BOSS_MAW_GAP = 0.85` between bursts. **2 bursts at phase 2, 3 at phase 3, 1 sparse** | the head leans in over the board and hoses it, the barrel panning. `BOSS_MAW_MAX = 30` alive |
| **pound** | BADDOG | **3.62s** = `POUND_WIND 0.72 + 5×(POUND_DROP 0.14 + POUND_GAP 0.30) + 0.7` | — | the nearer hand comes up, marks go down, and it walks `POUND_STEPS = 5` slams along a line |

`BOSS_HEAVY = [maw, ring, surge, pound]` — a phase-3 double never puts two of these together, and
never two `BOSS_FILL` shapes together. That rule is in `pkBossBeginPattern`.

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

## 7. Measured: at phase 3, moving barely helps

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

---

## 8. If it is too busy, these are the three dials, in order

1. **`BOSS_PAW_FIRE[3] = 0.11`** — the phase-3 paw stream is 38 bones a second before the beat
   adds anything. Raising this to `0.16` takes it to 26/s. This is the one.
2. **The `pkBossBeginPattern` double** — `BOSS.phase>=3 && Math.random()<0.35`. Drop the 0.35 and
   phase 3 runs one beat at a time like the other two.
3. **`pawRate()`'s cap** — `min(2.4, …)`. At 1.8 the late-cycle stream stops climbing sooner
   without touching how a phase opens.

Two more, if the fight needs room rather than fewer bullets:

4. **`BOSS_PHASE_COOL = 3.0`** — the pause after a phase change, the only long gap in the fight.
5. **`0.5 + rnd*0.2` breath** in `pkBossFinishPattern` — 0.55s between beats is short. A second
   there changes the fight's whole tempo without changing a single pattern.
