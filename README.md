<div align="center">

# Ejected Cube

<sub><em><a href="https://itx-psycho0.github.io/Ejected-Cube/">Click here to play the game</a></em></sub>

**A 3D flying shooter where every level is a different world, made with Three.js and TypeScript.**

The Atlas is a book where every page is a whole world. A drop of ink, the Blot, is eating its pages. The Atlas Engine fired its last cube of light out into the scattered pages, and you fly it home, one world at a time.

![Story intro](docs/screenshots/01-story.jpg)

</div>

## Fifteen worlds, picked at random

Every run starts on a random world, and every new level turns the page to another one. The whole game re-skins each time: landscape, props, wildlife, lighting, materials, post-processing, music and the interface. So does everything you play with. Each world belongs to a family (water, sky or space) that decides your **craft**, the **creatures**, the **pickups** and the **boss**.

| Family | Your craft | Pickups | Creatures | Bosses |
|---|---|---|---|---|
| Water | Escape capsule | Plankton, supply crates | Urchins, jellyfish, naval mines, lanternfish, pufferfish | Thermal Warden, The Lantern, The Chain, Kraken, Leviathan |
| Sky | Propeller fighter | Coins, hearts | Storm puffs, hot-air balloons, barrage balloons, darts, pop balloons, hail | Thunderhead, Ironclad Airship, Kite Dragon |
| Space | Starship | Crystals, power cells | Spiked mines, saucer drones, tether beacons, seekers, reactor pods, asteroids | Sentinel Core, Dreadnought, Star Wyrm |
| All | | | | **The Blot** (final boss, level 15) |

| World | Look |
|---|---|
| **Deep Reef** | Underwater: caustics, light shafts, kelp, vents, a whale silhouette |
| **Paper Sky** | Folded paper hills, cut-out clouds, windmills, paper grain and ink outlines |
| **Clean Room** | A white laboratory: tiled floor, pylons with signal-orange strips, lab drones |
| **Sketchbook** | Pencil line art: cross-hatching drawn by a screen-space shader |
| **Summer Sky** | Cel-shaded summer day: tall cumulus, power lines, saturated colour |
| **Brick Town** | Glossy plastic toy bricks with studs, including the ground |
| **Clay Valley** | Matte clay mushrooms and blob trees in pastel light |
| **Ink Mountains** | Sumi-e ink wash on rice paper; only vermilion keeps its colour |
| **Red Mesa** | Sunset desert, saguaro cacti, blowing sand |
| **Glacier Light** | Polar night with an animated aurora, ice crystals, snowfall |
| **Low Orbit** | Grey moon dust under a star field and nebula; dishes and habitats |
| **Autumn Woods** | Cel-shaded orange and red forest under a low golden sun |
| **Ember Peaks** | Volcanic ridges: dead trees, obsidian crystals, basalt columns, smoking lava vents |
| **Coral Lagoon** | Shallow turquoise water over bright coral |
| **Nebula Drift** | Deep space inside a magenta and teal gas cloud |

| | |
|---|---|
| ![Paper Sky home](docs/screenshots/02-home-paper.jpg) | ![Glacier Light home](docs/screenshots/03-home-glacier.jpg) |
| ![Sketchbook](docs/screenshots/04-sketchbook.jpg) | ![Summer Sky](docs/screenshots/05-summer-sky.jpg) |
| ![Ink Mountains](docs/screenshots/06-ink-mountains.jpg) | ![Abyssal Trench](docs/screenshots/07-abyssal-trench.jpg) |
| ![Red Mesa](docs/screenshots/08-red-mesa.jpg) | ![Brick Town](docs/screenshots/09-brick-town.jpg) |
| ![Thunderhead boss](docs/screenshots/13-boss-thunderhead.jpg) | ![Sentinel Core boss](docs/screenshots/14-boss-sentinel-core.jpg) |
| ![Low Orbit](docs/screenshots/15-low-orbit.jpg) | ![Hangar](docs/screenshots/11-hangar.jpg) |
| ![Autumn Woods](docs/screenshots/16-autumn-woods.jpg) | ![Ember Peaks](docs/screenshots/17-ember-peaks.jpg) |
| ![Coral Lagoon](docs/screenshots/18-coral-lagoon.jpg) | ![Nebula Drift](docs/screenshots/19-nebula-drift.jpg) |

In Settings → Worlds you can choose which worlds are in the rotation, lock the game to one favourite, or keep the interface on one look.

## The journey

- **Story:** an animated paper cut-out storybook with a dramatic voice-over plays on the first visit and can be replayed from the home screen. It ends by tearing in half to reveal the game.
- **The villain:** the Blot watches you. Its eye opens behind some later levels, every boss carries a growing stain of its ink (drips, ink blobs, ink shots), and after each boss it speaks to you. At level 15 you fight the Blot itself on its own ink page.
- **Boss arrivals:** a siren and a flashing WARNING screen, the music cuts, then the boss rolls in behind a letterboxed title card with its name spoken aloud, and a heavier boss track for its family kicks in.
- **Dramatic moments:**
  - Every level number slams in with the world's name.
  - At half health a boss freezes the screen, roars and turns **Enraged**.
  - The killing blow drops into slow motion with a white flash and **Page restored**.
  - From level 4, an **ink surge** can flood the page: the edges go dark, the Blot's eye opens, the music heats up and creatures pour in for seven seconds at double score. Survive it for a bonus.
  - At low energy you hear a heartbeat. When you fall, the ink closes in from the edges.
- **Levels:** numbered levels with a boss every third level. Level 1 is a gentle warm-up. From there, spawn rate, enemy health and damage, bullet speed, scroll speed and energy burn all rise each level, new creature types join at levels 2, 3, 5 and 7, and the level after a boss eases off slightly.
- **Two ways to play**, switched on the home screen, in Settings → Gameplay, or explained in How to play:
  - **Checkpoints** (default): your progress is saved level by level. Die, quit or close the tab, and Continue starts at the level you reached. Any level you have reached can be picked on the Journey map.
  - **Classic**: one journey, one life. Every death sends you back to level 1. Your best Classic level is kept on the home screen.
- **Ending:** beating the Blot at level 15 plays the story's ending. Then the pages beyond fifteen continue with stronger bosses.
- **Difficulty:** Relaxed, Normal and Hard presets.
- **Daily run:** a date-seeded run, identical for everyone each day.

| | |
|---|---|
| ![Boss warning](docs/screenshots/20-boss-warning.jpg) | ![Boss title card](docs/screenshots/21-boss-intro.jpg) |
| ![The Blot, final boss](docs/screenshots/22-the-blot.jpg) | ![The Blot speaks](docs/screenshots/23-villain-line.jpg) |
| ![Level slam and the laser](docs/screenshots/24-level-slam.jpg) | ![Checkpoints or Classic on the home screen](docs/screenshots/25-progress-modes.jpg) |

## Playing

[Play Ejected Cube online](https://itx-psycho0.github.io/Ejected-Cube/)

The controls are deliberately small:

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Fly | Move the mouse: the craft glides to the pointer, pitching and banking as it goes | Drag anywhere |
| Fire | Hold left click or Space (about 7 shots a second). It holds fire during boss warnings, title cards and page turns | Fires while your finger is on the screen |
| Dodge | Shift or right click: a fast barrel roll up or down, toward the pointer. Nothing can hit you during it, and it rams small creatures | DODGE |
| Flare | Q, when the ring is full: clears the screen | FLARE |
| Pause | Esc / P | Pause button |

On phones the game runs in landscape and goes fullscreen when you start. Hold the phone upright and it pauses and asks you to turn it sideways.

![Phone, landscape](docs/screenshots/12-mobile.jpg)

- **Nothing plays itself.** You only fire while holding the button (or touching the screen), and the world fights back:
  - Creatures fire aimed shots at where you are, and many come straight down your line.
  - Every boss adds aimed volleys to its own patterns.
  - Energy burns steadily, so you have to fly for pickups.

  A craft left alone dies in level 1.
- **Each level has a quota.** The page only turns when you have flown the distance *and* destroyed enough creatures (shown next to the level name, for example `7/12`). Boss levels end with the boss.
- **Energy.** Flying burns it and hits take a chunk. Pickups give it back.
- **Pickups don't come to you** unless a magnet is active. The magnet power-up pulls everything in; the Magnet upgrade pulls the common pickups only.
- **Laser charge.** Every shot uses a little (a full charge is about 13 seconds of fire). Below a third the beam fades: thinner, dimmer and slower. At zero it stops.
  - Fly into a glowing **laser cell** to refill it. One arrives as soon as you run low, and if you miss it another follows a moment later.
  - Cells also turn up now and then while the laser isn't full.
  - Each new level adds a quarter charge, and a boss fight never starts below half.
- **Chain pickups** for a combo; combos fill the flare ring faster.
- **Power-ups:** shield, magnet and triple shot.
- **Boss fights hold the screen still.** Red lanes mark where the next attack will land; each boss has its own patterns and a second phase.
- **Gates:** from level 2, rock spires, coral columns or laser pylons force you through a gap. Clearing one adds to your combo.
- **Graze:** skim past a bullet without being hit for bonus score and flare charge.
- **Elites:** from level 4 some creatures come back stained with ink: tougher, worth double, and they drop shards or repairs.
- **Shards** are the currency: collect them in levels, from bosses and from missions.

The first run starts with a four-step **interactive tutorial** (fly, fire, dodge, flare). Targets keep respawning until you finish each step. On the first visit, a short **guided tour** points out the home screen. Both can be replayed.

## Sound

- **Music** is generated live with WebAudio, and every world has its own track: key, scale, tempo, drum pattern, instruments and a melody hook generated from its key. Tracks are arranged like songs: an intro where the filter opens, the groove, a breakdown with a riser and snare roll, then a bigger drop with the hook an octave up.
  - **Fast** (default): 120–150 BPM, driving drums.
  - **Chill**: 78–92 BPM, swung lo-fi drums, seventh chords and vinyl crackle. Menus always play the chill version.
  - Each boss family (plus the Blot) has its own fight track, and ink surges and enraged bosses add extra layers.
- **Voice-over:** 30 lines for the narrator, the boss announcer and the Blot, generated offline with the [Piper](https://github.com/OHF-Voice/piper1-gpl) neural TTS and a CC0 voice, then processed per character with ffmpeg (the Blot is pitched down, doubled an octave lower and echoed). `scripts/make-voice.py` regenerates them. Music ducks under speech; Voice has its own volume slider.
- **Sound effects** for everything, from grazes and gate passes to the boss siren and roar.

## Make it yours

The **Hangar** has a live 3D preview:
- 12 hull colours, 6 accents and 7 patterns (hazard band, stripe, checker, panels, splotch, polka)
- A call sign painted on the hull
- Engine trails, floodlight colours, and capsule extras (three hull shapes, optional roll cage). Paint and call sign carry over to the fighter and the starship
- Seven upgrade tracks (max energy, energy burn, damage, fire rate, dodge recharge, magnet, flare charge)

Shards come from hidden pickups, bosses and **missions**. There are always three active, they carry over between runs, and they get harder each time you complete one.

The **Logbook** has 16 achievements, the worlds you've visited, your top-10 runs and lifetime stats.

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Build | Vite |
| Rendering | Three.js r187 (WebGL 2), PBR materials restyled per world |
| Post-processing | pmndrs/postprocessing plus a custom stylize effect (Sobel ink outlines, hatching, ink wash, paper grain) |
| Audio | WebAudio: procedural music and SFX, plus Piper neural TTS voice-over (generated offline, CC0 voice) |
| Art | Procedural: every model, texture, terrain and the storybook are generated in code |
| Fonts | Self-hosted with Fontsource, one display face per world |
| Offline | Service worker and installable web app manifest |

Runtime dependencies: `three` and `postprocessing` (plus font files).

## Performance

- Delta-time simulation: the same speed at any refresh rate
- No black frames:
  - A sanitize pass clamps the HDR buffer before bloom, so a stray Inf or NaN pixel can't be blurred across the whole screen.
  - Flash lights and mirror-like materials are capped so highlights stay in half-float range.
  - Canvas resizes (phone address bar, fullscreen) happen right before a render instead of between frames.
  - Lost GPU contexts pause the game and recover. A zero-size viewport or a broken camera can no longer blank a frame.
- Object pools for every enemy, pickup and projectile: no allocations during play
- Instanced rendering for props, wildlife, clouds, sparks, bullets and boss limbs
- GPU particles animated entirely in the vertex shader
- Dynamic resolution: when frames slow down the render scale drops a step, and it creeps back up when there is headroom
- No CSS blur over the 3D canvas
- World swaps happen behind the page-turn transition, with shaders compiled while the screen is covered
- Constant light count, so shaders never recompile mid-fight
- Three quality presets as a fallback below the lowest render scale
- HUD that only touches the DOM when a value changes

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check + production build into dist/
npm run preview
```

Add `?debug` to the URL of a production build to expose `window.game` (for example, `game.debugTheme('ink')`).

## Deploying

`dist/` is a static site that works at a domain root or in a sub-folder.

- **GitHub Pages:** push to `main`, then once set **Settings → Pages → Source → GitHub Actions**. The included workflow builds and deploys on every push.
- **Vercel:** import the repo; `vercel.json` has the settings.
- **Netlify:** import the repo; `netlify.toml` has the settings.
- **itch.io:** zip the contents of `dist/` and upload it as an HTML5 game.

## Project structure

```
src/
  core/       renderer + post FX, loop, input, quality, pools, noise, RNG
  themes/     the fifteen world definitions and the material styler
  world/      atmosphere, ground + props, clouds, wildlife, textures, shader patches
  entities/   the cube (model, hull painter, flight), enemies, pickups, bosses
  combat/     projectile pools
  fx/         particles, stylize effect, pulse ring, camera rig, flashes, telegraphs
  game/       Game state machine, levels, missions, cosmetics, save data, upgrades
  audio/      WebAudio music + SFX engine, voice-over clips
  ui/         HUD, every screen, storybook, page turns, icons, theme tokens
  styles/     CSS
scripts/      make-voice.py (regenerates the voice-over)
```

There is a deeper tour in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT. See [LICENSE](LICENSE).
