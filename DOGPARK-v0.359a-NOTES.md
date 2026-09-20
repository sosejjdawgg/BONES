# v0.359a — three bug fixes

Built on v0.358a. Three reported bugs, three root causes, all verified against the live game loop.

## 1. The XP bar pulsed with nothing waiting

`drawDog`'s alpha for the XP bar was:

```js
XPANIM.pauseT>0 ? flash : XPANIM.ready ? pulse : (frac>0.8 ? 0.6+0.4*Math.sin(t*8) : 1)
```

That third case is a permanent breathe across the **top fifth of every level**. It was meant as an
"almost there" tease, but at level 30 that is several hundred XP of a bar pulsing at the player
with nothing to tap and nothing to collect — through every park run, every minigame, every care
action. It also read off `frac` (BONES' own progress) even while the bar on screen was the PUP's.

Now only the two states that mean something animate: the celebration beat, and a banked level
waiting on the tap. Measured: at 93% full with no level waiting, 120 sampled frames all return
alpha 1.0 (solid). With a level genuinely banked, 89 distinct alphas — the call to action still
pulses.

## 2. The Lovey Dovey army died all at once at the end of a wave

A wave ends on `PK.waveKills` reaching its quota, and `waveKills` only moves inside `pkDownEnemy`.
A charmed enemy never makes that call, so a wave whose surviving enemies were all pink could never
finish. The answer in v0.358a was a sweep: once the quota was fully spawned and no un-charmed enemy
remained, **every ally was sent off the board on the same frame** — which is exactly what it looked
like from the player's side.

Charming now credits the wave as it happens (`pkLoveTake`), so the stall cannot occur and there is
nothing left to sweep. `e.counted` is the latch: every goal-shaped counter in `pkDownEnemy`
(`PK.kills`, `PK.waveKills`, the bird objective, `PK.lastDowned`) now sits behind it, so an ally
that is eventually killed fighting for him does not count a second time. It still drops its bone.

Three further changes make persistence actually mean something:

- **They guard him.** Target selection had a deliberate *outward* bias — among equally close
  candidates it took the one furthest from BONES, to keep the brawl off the player. That also meant
  the army skirmished at the edges while the thing biting him went unanswered. The score now
  rewards foes closing on him, refuses to chase anything past `ALLY_LEASH` (340), and with nothing
  to fight they hold a ring at `ALLY_RING` (54) rather than piling onto his centre point — which
  keeps the original readability argument satisfied.
- **The horde hits back.** Nothing in the park could touch a charmed animal; the wave-end sweep was
  the only thing that ever removed one. Un-charmed bodies held against an ally now cost it health
  on the same contact/invulnerability model the bought companions use, and a foe trading blows is
  held in the brawl (`startledT`, the park's existing flinch state) instead of walking through and
  carrying on at BONES.
- **Durability.** Doubling alone left a wave-2 bird ally on 2 HP — about two seconds. `ALLY_MIN_HP`
  (5) is the floor. Measured: a real bird recruit held in contact by one foe survives **8.8s**.

Also: `e.love` now protects a recruit from the wave-transition cull (a charmed stalking cat was
eligible for the stalk-cat sweep), and `counted`/`invulnT`/`contactT` were added to `EN_FIELDS` so
a pooled body is never reborn already counted or already invulnerable. `LOVE_SENDOFF` and
`PK.loveStuck` are gone — nothing reads them now.

Measured over 260s of real play with Lovey Dovey fired on wave 3: army of 7 → **8 across waves 4, 5
and 6** → whittled to 2 by wave 7 → last one down on wave 8. Persists until killed.

## 3. The dog moved when a wave ended

Not the purchase — the wave boundary. `pkEnsureWalkable()` ran

```js
[PK.x, PK.y] = pkFindOpenSpot(PK.x, PK.y, SAFE_SPOT_R);
```

on every wave advance, and `pkFindOpenSpot` only returns early when there is **not a single tree
within 150 units** — which in a park holding eight hundred of them is almost nowhere. So it
relocated him every single wave, searching rings out to 630 units. Measured: a clean 105-unit
teleport on the frame the between-wave shop opened.

The case the guard was written for is a fresh grove landing on top of him, and that case is exactly
"he is inside a trunk" — which `pkTreeCollide` already answers. He is only moved now if he is
genuinely stuck; anywhere else he keeps the ground he was standing on and the clearing is punched
around him instead. Measured: **0.00 movement** across the wave end and across the purchase, and
he is not left stuck in a tree.

## Regression

Re-verified the v0.358a fixes still hold: 119 trees on screen and 0 invisible at full zoom-out;
birds still run the hold/wind/dive/away cycle with a longest dwell of 0.10s; storm birds still
charmable 10/10; barked enemies still flee away (21.8 → 77.4 units). A live park run reaches wave 8
with no page errors. `node --check` clean.
