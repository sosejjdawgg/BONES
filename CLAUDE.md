# BONES — how to work in this repo

Mobile-first dog-care sim with a Vampire-Survivors-like DOGPARK mode. The deliverable is **one
self-contained HTML file** hosted on itch.io and tested on an Android phone. That constraint is
real and it stays. What changed in v0.350a is that the single file is now the *output*, not the
*source*.

## Layout

```
src/head.html     the DOM and the CSS
src/assets.js     33 declarations, 10.1MB, pure base64. Changes about once a month.
src/src.js        1.2MB of actual code. Changes every session.
src/tail.html     the closing tags
build.sh          ./build.sh 0.351a   ->  bones-v0.351a.html + bones-latest.html
test.sh           ./test.sh smoke | ./test.sh all | ./test.sh boss
SUITES            the battery. 37 suites; "smoke" runs after every edit, "solo" runs alone.
tools/split.py    how assets.js and src.js were separated, and the safety check it applies
tools/mkpaw.py    how a paw sheet becomes a sprite: the background key, the red-numeral strip
BOSSPHASES.md     the fight, window by window: every timing, and the constant that governs it
p*.js             the harnesses. The ones in SUITES are the battery; the rest are stale probes.
bones-latest.html the current build — this is the file to upload to itch and to send to the phone
```

**Edit `src/src.js`, then `./build.sh <version>`.** Do not edit the built HTML: it is overwritten,
and `./test.sh` will refuse to run if it has drifted from `src/`.

### The loop, every session

1. `./test.sh smoke` — confirm the tree is green before touching anything
2. edit `src/src.js`
3. `./build.sh 0.351a`
4. `./test.sh smoke` while iterating, `./test.sh all` before shipping
5. update `HANDOFF.md`, commit, push
6. send `bones-latest.html` to the user — that is the file for itch.io

## Why it is split, with the numbers

`cur.js` used to be one 11.3MB file, of which **10.09MB (89%) was base64 sitting on 86 lines** —
the actual code is 1.21MB. Every search scanned nine times more than it needed to, and git stored
a fresh 11MB blob per commit because the build is one indivisible file.

`src/assets.js` is provably pure data — `tools/split.py` refuses to write it otherwise, checking
that it contains **no calls, no arrow functions, no `function`, no operators**. That is what makes
it safe to concatenate assets *first*: every asset binding exists before any code runs, and code
that consumes an asset (`FRIENDIMG = FRIENDFRAMES.map(...)`) stays in `src.js` and still runs
after.

## Testing

```
./test.sh smoke     # 6 suites, ~115s — after every edit
./test.sh all       # 37 suites, ~600s / 10 min — before shipping
./test.sh boss      # anything matching "boss"
node pboss.js       # ~64s   — the arrival and phase 0.5
node pbossfight.js  # ~263s  — FOUR AND A HALF MINUTES. See below.
```

**Run the one suite you are working on, directly, by name.** `./test.sh all` is ten minutes;
running it to find out whether one assertion passes is the easiest way there is to burn an hour.
`all` is for the end.

**And budget `pbossfight` honestly: it is 4m23s a run.** A boss session that iterates on it thirty
times has spent two hours in that one command, which is exactly how v0.355a-v0.357a took an
afternoon for changes that were, in the end, three constants and a scheduling loop. Before you run
it again, ask whether this run will actually *distinguish* anything:

- **Batch the instrumentation.** If you are hunting a number, log everything you might want in one
  pass — state, timings, distances, per-event detail — and read it once. Adding one `console.log`,
  running, reading, adding another is five minutes a question.
- **Build a scratch probe for the one thing you are testing** (`scratchpad/pphase.js` in this
  session was ~40s and answered what a 4-minute suite would have). Drive the page to the state you
  care about and print; skip the other twenty assertions.
- **Do not re-run to confirm a pass you already have.** Re-run only to measure *variance*, and
  then run it three times deliberately rather than one at a time.

Six-wide, because **the battery is dominated by a fixed ~17s boot preamble per suite**, not by the
checking. Measured: six suites took 111s serially and 21s in parallel. The full battery went from
about thirteen minutes to 249s at the time — it is **~600s now**, because the two boss suites run
`solo` (below) and have grown. Budget ten minutes for `all`, and do not spend it casually.

**One suite must not share the machine.** A suite several times longer than its neighbours does
not merely take longer — it starves them, and the failure does not look like starvation. `pboss`
grew to ten minutes over three versions and was killed at the 560s timeout with every assertion
already green, taking `pbat`'s drain-rate measurement down with it (which reported a *rate* when
what had changed was the *frame count*). Anything marked `solo` in SUITES now runs on its own,
before the parallel batch, with a longer leash. And when a suite gets that big it is usually two
suites: `pboss` is the arrival and phase 0.5, `pbossfight` is everything after the hand-over.

Suites point at `bones-latest.html`, so a version bump no longer means editing a filename in
thirty-six files. **A harness reads the BUILT file**, so `./build.sh <version>` after every edit to
`src/src.js` and before running a suite. `test.sh` catches you if you forget (below); a bare
`node pbossfight.js` does not — it will happily test the previous build and tell you your change
did nothing. Four and a half minutes to be told a lie.

`test.sh` **refuses to run against a stale build.** It rebuilds to a temp file and compares before
any suite starts. This is the one way the split can hurt: edit `src/src.js`, forget `./build.sh`,
and the battery passes against the *previous* build while reporting on code that is not in `src/`.
A green run that means nothing is worse than a red one. Costs under a second.

## Know when the measurement has stopped serving the request

This is the judgement call that decides whether a session takes forty minutes or an afternoon, and
it was got wrong in v0.357a. The user asked for one thing — *give the dog a window to escape the
thumps* — and the change that delivered it was **two constants and a scheduling loop**. Most of the
time after that went into a harness bot that kept reporting the fight was unfair when what was
actually broken was the bot: it moved at a fifth speed, it could not flee a mark planted underneath
it, it walked into a wall, it counted its own progress wrong.

Each of those was a real bug and worth fixing. But the useful question at each step was not "can I
make this measurement correct" — it was **"is this measurement still the thing standing between the
user and their request?"** Three times it was not: the change was already right, and the harness was
wrong about it.

So:

- **Verify the change narrowly and directly first.** A screenshot, a scratch probe printing the
  three numbers, a single targeted assertion. Confirm the thing the user asked for actually
  happened before touching the wider suite.
- **When a harness starts reporting something surprising about the game, suspect the harness.**
  Every single surprising result in this session — "moving is worse than standing still", "the dog
  never escapes", "phase 2 fires less than phase 1", "the beat never ends" — was the harness, not
  the game. Zero were real.
- **Say what you found and ship.** If a measurement cannot be made trustworthy in reasonable time,
  assert what the sample *can* support, write the reasoning down (this file's own rule), and move
  on. A green run that means nothing is worse than a red one — but an afternoon spent making a
  secondary assertion elegant is worse than either.

## The harness clock is a lie, and it has cost more time than any bug in the game

**`await sleep(30)` inside a `pg.evaluate` loop does not take 30ms.** Measured in this environment:
a nominal 30ms poll runs **~110-120ms** of real wall time, and a 520-iteration loop budgeted at
"15.6 seconds" actually ran **57-62 seconds**. Game time (`BOSS.t`) tracks real wall time about
1:1 — it is the *sleep* that is not honoured, not the clock.

Three consequences, and all three shipped as bugs in v0.357a before being found:

- **A bot that moves something by `spd*0.02` per poll moves at a fraction of the real speed.** It
  then "fails to dodge" things a correctly-moving dog clears easily, and you spend an hour
  concluding the fight is unfair when the bot is just crawling. **Scale every movement by the real
  elapsed game time**: `const dt=BOSS.t-lastT; lastT=BOSS.t;` — every long-lived measurement in
  `pbossfight.js` already does this, copy one.
- **A loop with a fixed iteration count "to cover N seconds" covers several times N.** It runs
  past the end of the beat you are measuring, into the next randomly-chosen one, and quietly folds
  that beat's projectiles into your numbers. **Stop on your own terms** — break when *your* success
  criteria are met (`po.n>=SLAM_HITS && !po.marks.length`), never by waiting to catch a narrow
  state transition you are hoping to poll at the right moment.
- **Counting events by diffing an array's length between polls undercounts.** Two marks can be
  created and one removed between two polls, leaving the length unchanged. Read the game's own
  counter (`po.n`) instead. This is written on the wall in `pbossfight.js` twice and was still
  re-introduced twice.

### If you are writing a bot that drives `BOSS.dog`

Four things, and each one was a separate hour:

1. **Real dt for movement** (above).
2. **A fallback when the flee vector is degenerate.** A pound mark is planted *exactly where the
   dog is*, so "direction away from the mark" is `(0,0)` — and a `||1` guard silently turns that
   into "do not move", forever, because a dog that never moves keeps getting marked on the same
   spot. Feed a zero-distance threat no direction at all and let a pull-toward-open-space term
   answer it.
3. **Do not start the dog at the board's exact geometric centre.** Both the flee vector and any
   centre-seeking bias are exactly zero there, at once, so the bot has no reason to move in any
   direction and does not.
4. **Anti-cornering.** A bot that only ever flees radially pins itself against a wall, and then
   the next mark lands on the pinned spot with nowhere to go. Copy the `pull` term out of the
   DODGE section.

### Measure over the time the thing you are measuring is allowed to happen

BADDOG turns the pentagram stream off for its whole ten seconds. Three separate assertions
reported nonsense because they divided by wall-to-wall time anyway: the stream rate said phase 2
fires *less* than phase 1, the board average said phase 3 is no busier than phase 1, and the dodge
check flipped its own answer between runs. All three now divide by the time the beat allows a
stream at all. **When a measurement swings between runs of the same build, suspect the denominator
before you suspect the game.**

## Things that were measured, so they do not get re-litigated

- **The game is not slow.** First frame at 103ms, steady 60fps by 441ms. Parsing the 11.3MB build
  takes 639ms; the whole top-level script executes in 251ms. itch.io and mobile are fine.
- **Removing the music does not speed anything up.** 12.87s vs 12.93s to Playwright-ready. It was
  stripped once on that assumption and it bought nothing. Same for stubbing all 166 images
  (12.75s), and for stripping *both* down to 1.23MB (12.7s). The remaining ~13s is a Playwright
  readiness cost, not a page cost — `page.evaluate` itself is live at 55ms.
- **Committing built HTML is what made the repo enormous.** 66 builds were 486MB of a 869MB
  working tree. Now: the last three plus `bones-latest.html`. Because assets and code are separate
  files, git can delta the 1.2MB that changes instead of re-storing 11MB.

## Conventions worth keeping

- Edit `src/src.js` with exact-string replacement (a Python heredoc with a guard that fails
  **before** it writes), never by rewriting the file.
- `node --check` does **not** catch a `const` used above its own declaration line — that is a
  temporal-dead-zone throw at load. Declaration order matters; it has bitten this file.
- **One thrown exception freezes the entire game, silently.** `loop()` does not re-arm after a
  throw, so a bad edit inside any per-frame function stops the world — no error on screen, just a
  still frame. A mis-scoped `}` in `pkPawCommon` did exactly this in v0.355a. Every harness listens
  for `pageerror`; if a suite goes strange in a way that makes no sense, **read the PAGEERROR line
  first** rather than reasoning about the symptom.
- A harness assertion that pins behaviour a new version deliberately reverses gets **inverted with
  its reasoning written down**, not deleted.
- Do not assert on a pool something else also writes to (`BOSS.fizz` is shared with the golden
  bird's reflect; `BOSS.trail` with the maw's mouthfuls). The fix for a shared pool is removing
  the other writer, never a softer threshold.
- Invariants belong at the door. The bullet cap and "no bone is born on the board" both live in
  `bossAdd`, because a rule enforced at its callers holds only until someone adds a caller.

## Finding things in a 1.2MB file

Line numbers drift every session; these do not. `grep -n` for the anchor, not for a line number.

| Looking for | Anchor |
|---|---|
| the boss's per-frame tick and phase dispatch | `BOSS.ph==="pattern"` |
| the beat pools and every timing constant | `const BOSS_P3` / `const BOSS_TELE` |
| one beat's spawner | `if(kind==="rain"){` (or `slam`, `maw`, `ring`, `surge`, `sweepL`) |
| the paws: stations, firing, poses | `function pkPawFightTick` / `function pawStation` / `function pawPoseFor` |
| BADDOG's fists | `function pkPoundTick` — the beat is `slam`, the paw sub-state is still `pound` |
| every projectile's motion and collision | `for(let i=BOSS.bullets.length-1` |
| everything drawn on the board | `ctx.translate(B.x,B.y)` — clipped; passes *after* it are panel-space |
| the dog's own movement | `function pkBossDogMove` |

**`BOSSPHASES.md` is the map of the boss fight** — every window from the arrival to the end of a
beat, its measured length, and the constant that governs it. Read it before touching WOLFIE;
update it when you change a timing. It is faster than re-deriving the numbers, and several of them
are products of four constants that are not obvious from any one of them.

`HANDOFF.md` is the running history — what changed each version and why.
