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
SUITES            the battery. 36 suites; the six marked "smoke" run after every edit.
tools/split.py    how assets.js and src.js were separated, and the safety check it applies
p*.js             the harnesses. The ones in SUITES are the battery; the rest are stale probes.
bones-latest.html the current build — this is the file to upload to itch and to send to the phone
```

**Edit `src/src.js`, then `./build.sh <version>`.** Do not edit the built HTML: it is overwritten.

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
./test.sh smoke     # 6 suites, ~4 min — after every edit
./test.sh all       # 36 suites, ~4 min wall — before shipping
./test.sh boss      # anything matching "boss"
```

Six-wide, because **the battery is dominated by a fixed ~17s boot preamble per suite**, not by the
checking. Measured: six suites took 111s serially and 21s in parallel. The full battery went from
about thirteen minutes to **249s**.

Suites point at `bones-latest.html`, so a version bump no longer means editing a filename in
thirty-six files.

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
- A harness assertion that pins behaviour a new version deliberately reverses gets **inverted with
  its reasoning written down**, not deleted.
- Do not assert on a pool something else also writes to (`BOSS.fizz` is shared with the golden
  bird's reflect; `BOSS.trail` with the maw's mouthfuls). The fix for a shared pool is removing
  the other writer, never a softer threshold.
- Invariants belong at the door. The bullet cap and "no bone is born on the board" both live in
  `bossAdd`, because a rule enforced at its callers holds only until someone adds a caller.

`HANDOFF.md` is the running history — what changed each version and why.
