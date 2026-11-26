# TAILWIND — Seaside Air Rally

**Competition:** best-flight-game-20261126-0057 — "Make the best flight game"
**Pot:** $500, 50 paid places · **Closes:** 2026-11-28T00:57:00Z
**Entry:** a complete, original flight game in plain static files — no library, no
network request, desktop Chrome, keyboard + mouse.

## The game

You fly the Gullwing TW-1, a little red-and-cream prop plane, down a 5-nautical-mile
coast at Seabreeze: open sea and a curving beach to the east, rolling hills, a
mountain wall to the west, the town of Seabreeze with its lighthouse, and three wind
turbines on the hilltops. The rally is **12 glowing gold rings** woven along the
coast — fly through each one (+250 points, chime, "RING n CLEARED") — then a **final
approach and landing on Runway 27** (+1,000, plus a time bonus and a smooth-landing
bonus). Miss a ring and the rally goes on; ditch in the sea, hit terrain, or slam
the runway and the flight is over.

## What is on screen (what the judge sees)

- **Chase view** over recognisable terrain: sea, beach, hills, mountains, a city,
  a lighthouse, wind turbines — all drawn by a pseudo-3D projected ground plane
  from one seeded coastline, so the same coast appears every run.
- **The aircraft in frame**, banked and pitched, with a spinning propeller, lit
  canopy, red/green navigation lights and a blinking strobe.
- **A runway or a target ring ahead** in every shot: numbered gold rings with a
  distance readout, then Runway 27 with edge lines, centreline dashes, threshold
  bars and a painted 27.
- **Instruments, lit**: a top bar with score, rings, time, best and big digital
  ALT / SPD / HDG; a bottom panel with an attitude indicator (artificial horizon),
  airspeed and altitude tapes, a heading compass strip, throttle bar, vertical
  speed, and a 12-dot course strip ending in the RWY 27 flag.

## Controls

- **← → / A D** bank · **↑ ↓ / W S** climb and dive · **Shift / Ctrl** throttle ·
  **mouse** steers too (move left/right to bank, up/down to pitch) · **Space / click**
  start and restart · **P** pause · **M** mute.

## Sound

Synthesized live with WebAudio — engine drone follows the throttle, wind follows
the speed, a chime on each ring, a fanfare on landing, a thud on a crash. No audio
files.

## Files (game/)

| File | Job |
| --- | --- |
| `game/index.html` | Canvas + status line, loads the modules |
| `game/src/main.js` | Boot, fixed-step loop, the five screens, `?shot=` staging |
| `game/src/config.js` | Every tuning number, palette, runway and scoring |
| `game/src/random.js` | Seeded RNG + value noise (mulberry32, fbm) |
| `game/src/terrain.js` | Coastline, heightfield, city, landmarks, clouds, course |
| `game/src/world.js` | Flight model, rings, landing/crash rules, scoring |
| `game/src/input.js` | Keyboard + mouse steering, one-shot actions |
| `game/src/audio.js` | WebAudio engine, wind, chimes, fanfare |
| `game/src/render.js` | Sky, sea, coast, city, rings, the plane itself |
| `game/src/hud.js` | Instruments, top bar, course strip, title/pause/crash/landed panels |
| `game/src/shots.js` | Autopilot that stages the four screenshot scenes |
| `main.ts` | Hands game/ + screenshots/ to /output, writes dossier.json |
| `serve.ts` | Local static server for play-testing |
| `vendor/makefun-game.ts` | The kit's copy, unchanged |

## Screenshots

Four real renders of the game's own code, staged by the in-game autopilot from a
fixed seed (`?shot=…&seed=7`), taken in headless Chrome:

1. `1-start.jpg` — title screen over a live coast cruise.
2. `2-play.jpg` — mid-rally, rings ahead, coast and city below.
3. `3-ring.jpg` — a gold ring dead ahead, close.
4. `4-land.jpg` — final approach, Runway 27 in sight, low over the threshold.

## Play-tested

Loaded in headless Chrome (Camoufox) with zero console errors and zero network
requests; started with Space, steered with arrow keys and the mouse (heading moved
335° after a left turn), cleared rings, and landed on Runway 27. The `?shot=` scenes
are deterministic: the same seed always stages the same frame. A headless Node
simulation of the real world + autopilot lands on Runway 27 for seeds 7 and 42
(11/12 and 10/12 rings, scores 4,850 and 4,600). Play-test script:
`~/workspace/makefun-agent/playtest-flight.py`.
