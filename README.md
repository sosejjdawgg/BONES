# BONES

A brutalist black, white and red pixel-art dog care sim, built as a single self-contained HTML5 file. Adopt a dog, keep him alive, watch him grow up — and once he's old enough, take him to the DOGPARK for a genuine arcade survival game layered on top of the care sim.

No install, no backend, no accounts. Open the HTML file and play. It's an installable PWA, so it can be added to a phone's home screen and played offline.

---

## Quick Start

1. Open `dist/bones.html` in a browser (or install it as a PWA — see **Tech Overview** below).
2. Pick a breed and name your dog.
3. Keep him alive: feed him, water him, let him rest, play with him, keep him clean. Everything happens live in **DOGCAM**, the home screen.
4. Earn XP from care and activities to level him up. At **Lv.5**, the **DOGPARK** unlocks.
5. From Lv.5 onward you can send him out to bark off critters, bank bones and XP, and eventually take on a much harder night-time combat mode, **DOGPARK UNLEASHED**.

The in-game **Care Guide** (menu → ♥ CARE GUIDE) is the up-to-date, in-app version of everything below — check there first if something's unclear while playing.

---

## The Basics (DOGCAM)

BONES has six needs, all visible as meters on the home screen: **hunger, thirst, energy, mood, fun** and **clean**. Let any of them run dry for too long and he gets sick.

- **Food & water** — tap either bowl in DOGCAM to refill it. He helps himself once he's hungry or thirsty; your job is just keeping the bowls full.
- **Fetch** — once you own a ball, drag it across DOGCAM and let go, or tap **PLAY FETCH** from home. He'll chase it down and bring it back. If it ends up out of sight, pressing **FETCH** sends him after it.
- **Bath time** — grab the sponge off the wall and drag it across him to scrub him clean. Needs shampoo from the shop; each bath uses some up.
- **Rest** — a bed lets him sleep all the way to full energy, but it has to actually fit him. Every growth stage outgrows the old bed (capping sleep at 70% again) until you buy the next size up.
- **Sickness & the vet** — ignore his needs for too long and he can get sick, or worse. An emergency vet visit costs money and a countdown; letting it lapse rewinds to your last save.
- **Saving** — the game nudges you to save after anything that earns real progress (a DOGPARK run, a job, a walk). Saves live in the browser's local storage — nothing leaves the device.

## Growing Up

Every bit of care and every activity earns XP. When the bar fills, tap it to level him up.

- **Lv.5** — the DOGPARK unlocks.
- **Lv.10 / Lv.25** — visible evolution stages: junior, then full-grown/prime, each with its own stat bump.
- **Lv.50** — **The Crossroads**: choose whether he becomes a **senior** (needs ease off, he slows down, and — eventually — says goodbye, leaving a legacy) or stays in his **prime forever** (peak condition, no ending).
- **The Breeder** (unlocked Lv.18, via **GO OUT**) — start a litter to guarantee a successor when the current dog's story ends, or bring home a second dog right now for $500. Both are real, separate commitments — the dialog has a **← BACK** if you're not ready to choose either.
- **Legacy** — when a senior dog's story ends, a new generation begins with the litter's pup, carrying a numbered suffix (II, III, …) and picking up wherever the family's progress leaves off.

## Jobs & Activities (GO OUT)

- **Delivery Driver** — an isometric driving/throwing minigame: deliver parcels to the right houses along a street for cash, avoiding decoy (non-delivery) houses. The van accelerates the whole way down the road — there's a speedometer bottom-right, and the speed lines, rumble and engine note all build with it. **Swipe** to throw a parcel as the van crosses the garden path; **hold** instead to pull over and hand it to the door in person, which is a guaranteed perfect and nearly always a tip but costs you several seconds. Past the last house the controls become the brake: a **SLOW DOWN** sign, then a hatched bay you have to stop the van inside. Brake early and you stop short, brake late and you go into the wall. Pay is lopsided on purpose — a doormat is +$4, a lost parcel −$7, and a broken window −$42 — and the run is rated against a 45-second par.
- **Agility Training** — a quick energy-for-XP trade.
- **Beach Day** — a one-time unlock, then a repeatable outing for a bigger fun/mood boost than a walk.
- **Dog Competition** — enter for prize money, limited entries per day.
- **The Breeder** — see **Growing Up** above.
- **The DOGPARK / DOGPARK UNLEASHED** — see below; by far the deepest system in the game.

---

## DOGPARK

Once he's Lv.5, DOGPARK is a real-time survival mode: bark at squirrels, birds and cats to scare them off (he never hurts anyone here — they just drop a bone and scuttle away), survive a run of waves, and reach the red exit gate to **bank** everything you've earned. Get caught before you bank, and you lose it all — so knowing when to walk to the gate instead of pushing for one more wave is the core tension.

- **Bones economy** — every scared-off critter drops one bone. Spend bones between waves in the **shop** on stat upgrades (bark radius, cooldown, speed, max HP, knockback, healing, keen nose, agility), rare **charms**, or **expanding the park** itself (up to an 8×8 world). Or tap the bones counter any time to trade some for XP, money, or a treat.
- **Fixed shop slots** — **Full Armour** and the **Compass** are always available from wave 1, priced separately from the rolled upgrade pool. Armour soaks up hits before they touch his health; the compass points toward the friends shop, the exit, and anything else currently off-screen.
- **Speed bonus** — clear a wave inside 60 seconds and a bonus charm unlocks in that wave's shop.
- **The Golden Bird** — a rare, fast-flying target worth chasing for a big one-off bones payout.
- **Side missions** — bark at every kind of critter in one run (+20 XP), survive wave 1 (+10 XP). Both pay out immediately, no banking required.
- **Choosing a mode** — if DOGPARK UNLEASHED is unlocked, heading out asks **DOGPARK** or **DOGPARK UNLEASHED** each time, with a **← BACK** if you opened it by mistake.

## DOGPARK UNLEASHED

Clear wave 10 of regular DOGPARK once, and DOGPARK UNLEASHED unlocks for good: the same 10 waves, with double the enemies on screen at once, played out under a genuinely dark night sky. It's built around several systems the base mode doesn't have:

### Night & Fog of War
The whole park goes dark — a true night-time look, with fireflies drifting through the gloom. Visibility is limited to ground BONES has actually explored; wander away for too long and it fades back into fog, creeping in fastest from the directions he isn't facing. Stay moving and keep your bearings, or the park you thought you knew disappears again.

### The Sword
Wave 2 of a DOGPARK UNLEASHED run stops everything: something falls out of the sky and buries itself nearby. Walk up and pay the price shown to claim it — from then on it rides in BONES' mouth and cuts down anything he runs into. **Sharpen the blade** between waves for more reach and damage, up to 5 tiers. Leave it unclaimed too long and lightning starts striking it where it stands. Where it came from is never explained — it's just there.

### Whirlwind Slash
Once the sword is his, spin the joystick one full fast turn and he cuts loose in a wide, heavy circle — a bright white swoosh sweeps the whole radius, hitting everything around him for the full duration of the spin and knocking back anything it doesn't down outright. Enemies just outside the ring flinch and hesitate instead of getting hit for free. Long cooldown, so it's a panic button for when he's surrounded, not something to lean on constantly.

**Whirlwind Mastery** (wave shop, up to 3 tiers) widens the ring and increases the damage further — offered automatically whenever there's a tier left to buy, the same way blade-sharpening is.

### Rage & Heavenly Judgment
Taking damage fills a rage meter. Once it's full, tap it to unleash **Heavenly Judgment**: the whole park slows down as bolt after bolt rains onto everything nearby. A devastating, cinematic panic button for when a wave has gone badly wrong.

### Friends
A bandana-wearing dog runs a shop somewhere out in the trees, hidden behind a fog-of-war that only clears as BONES actually walks into the grove — follow the compass or explore to find him. Recruit **squirrels, birds, cats**, and eventually an **ape**, each upgradeable through several tiers, to fight alongside BONES. They flash invulnerable and get knocked clear whenever they're hit so they can survive a real fight, and if one gets hurt, tapping its row in the Friends panel heals it back to full for bones.

### The Hole
The crater the sword leaves behind never closes — it widens every wave, and from wave 6 on, fire spreads out of it and takes over the park permanently, burning anything (including BONES) that stands in it.

### Leaving Early
**END RUN**, bottom-left of the on-screen controls, forfeits the run and returns straight to DOGCAM — deliberately harsher than getting caught (it costs everything, not just most of it), so it's a last resort, guarded by its own confirmation prompt.

---

## Shop & Supplies

The home shop (💰 icon) sells permanent unlocks and consumables: bigger beds, shampoo, a brush, a robot feeder/carer, a hoop and ball for fetch (up to 5 balls, with spares kept in **Supplies** and set down when the current one's lost), and cosmetic charms. Prices and availability grow with level and story progress.

Money and **bones** are separate currencies — bones are what park runs bank, and the running total sits under MONEY on the menu's save card. Bones buy bone treats' worth of care, and they're the only thing the dog at the window will take.

## The Mysterious Dog

Some hours there is a black shape behind the blinds in DOGCAM, rocking gently, watching the room. He gives you ten seconds. Tap him in time and the blinds go up and he does business — **bones only**, and only for things nobody else sells. Deliberately not written up in the in-game Care Guide: finding him is the point.

He rolls once an hour for a 5% chance to appear, and never turns up twice in the same day. Do business with him once and he leaves a **DOG WHISTLE** in your Supplies — blow it and he comes to the window whenever you like, rather than you waiting on him.

His stock is currently five placeholders at 999 bones each. The prices and the flavour are real; the effects aren't written yet, so he refuses every sale rather than taking bones for nothing.

## Settings & Saves

- **Settings** — sound, music (with a global mute button on every screen), and a reduce-motion toggle for calmer animations.
- **Saves** — autosaves at key moments, plus a manual save/load and a "start over" option (confirmed before it runs — it's permanent).
- **Care Guide** — the in-app mirror of this document, always current, accessible from the menu.

---

## Tech Overview

BONES ships as one self-contained HTML file with everything — code, art, audio — inlined as base64 data URIs. No build tooling is required to *play* it; `dist/bones.html` is the finished artifact.

### Repo layout
- Gameplay logic is split across focused source files: `bones.js` (DOGCAM/home + meta-systems), `park.js` (DOGPARK/DOGPARK UNLEASHED), `paperboy.js` (Delivery Driver minigame).
- Art and audio are pre-encoded into small JS modules (`portraits.js`, `frames.js`, `swordimg.js`, `music_*.js`, etc.), each exporting a single base64 data-URI constant.
- `bones.html` is the source template; `build.sh` concatenates every source file into `combined.js`, validates it (`node --check`, plus a check that every `$("#id")` referenced in JS actually exists in the HTML), inlines it into `bones.html`, bumps the version stamp, and writes the finished file to `dist/bones.html` alongside a versioned `dist/sw.js` service worker.

### Building
```bash
./build.sh            # bumps the patch version
./build.sh --no-bump   # rebuilds without bumping the version
```

### PWA
`manifest.json` + `sw.js` make it installable and playable offline once loaded once; the service worker is stamped with the build version so every release gets a clean cache.

No server, no database, no accounts — all game state lives in the browser's `localStorage`.
