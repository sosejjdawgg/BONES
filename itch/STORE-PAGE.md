# BONES: itch.io store page

Everything here is ready to paste into **Edit game** on itch.io. The images are in `itch/media/`.

## Images

| Field | File | Size |
|---|---|---|
| Cover image | `bones-cover-630x500.png` (or the sharper `bones-cover-1260x1000.png`) | 630×500, itch's recommended size and ratio |
| Screenshots | `bones-screenshot-1-raise.jpg` … `bones-screenshot-5-themes.jpg` | 1920×1080 each, under itch's 3840×2160 limit |

Upload the screenshots in order 1 to 5. The first one is the one people see first.

## Short description or tagline

> Raise a rottweiler pup, then bark a whole park into line. A pixel dog game for your phone and browser.

## Description

**A dog is for life.**

Adopt **BONES**, a rottweiler pup who needs feeding, walking, play and a lot of love. Check in on him on the DOGCAM, keep him happy, and watch him grow.

Then take him to the **DOGPARK**, where the locals don't want him. Fight off wave after wave of birds, cats, nut-throwing squirrels and laser-eyed mad squirrels. Recruit friends to fight beside you, set the trees on fire, and save your bones for upgrades between waves.

Clear the park and **DOGPARK UNLEASHED** opens: the park at night, a blade, a pair of wings, and something waiting under the ground. Bring down **WOLFIE**.

When he needs a job, there's **SHEEP HERDING**, a whole second game. Push the flock past holes, wolves, rigs on the road and eagles overhead, one field at a time, all the way up the mountain.

**Features**
- A virtual pet you raise, feed and care for, with moods you can see on his face
- Arcade wave survival with bird storms, alpha cats, apes and a full boss fight
- A second campaign of sheep herding across seven fields
- Friends you recruit and upgrade, and moves you earn: leap, whirlwind and judgment
- Legacy: when BONES grows old, his pup carries on stronger, and the memorial wall remembers him
- One-thumb touch controls: a paw-print stick on the right, big action tiles on the left
- Eleven themes that restyle the whole interface
- Plays in the browser on phone and desktop, and there's an Android app

**Controls**
- **Touch:** put a thumb anywhere on the right half to move. Tap BARK, DASH and your earned moves on the left.
- **On a computer:** click and drag on the right half to move. Space barks and Shift dashes. In sheep herding you can also steer with the arrow keys or WASD.

---

BONES © 2026 James Scott. All rights reserved.
Music: "8-bit lofi space relaxation" by Clock Eyes; "A Bit Of Hope" by Fesliyan Studios. Font: Press Start 2P (SIL Open Font License).

## Genre

**Action** (or **Simulation**, if you want the virtual-pet side to lead)

## Tags (itch allows 10)

`virtual-pet`, `dogs`, `pixel-art`, `arcade`, `wave-survival`, `boss-battle`, `mobile`, `cute`, `retro`, `singleplayer`

## Embed options

- **Kind of project:** HTML. Upload `itch/build/BONES-itch-vX.XXXa.zip` (made by `itch/build.sh`) and tick *This file will be played in the browser*.
- **Embed:** Embed in page, *Manually set size*, **450 × 900** px. BONES is a portrait game, so a 640×360 landscape frame squashes it.
- **Frame options:** tick *Mobile friendly* with orientation *Portrait*, and tick *Fullscreen button*.

## Remaking the images

`itch/press/cap.mjs` takes the gameplay captures from the game itself, and `itch/press/compose.mjs` lays them out into the cover and screenshots. Both run with Playwright:

```
HF=/path/to/bones-vX.html OUT=/tmp/press node itch/press/cap.mjs
cp itch/press/port_*.jpeg /tmp/press/   # the cover's portraits, or re-extract them from PORTRAITS in the game
D=/tmp/press node itch/press/compose.mjs
```
