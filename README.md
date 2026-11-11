<div align="center">

# Ejected Cube

**A 3D flying shooter where every level is a different world, made with Three.js and TypeScript.**

The Atlas is a book where every page is a whole world. A drop of ink, the Blot, is eating its pages. The Atlas Engine fired its last cube of light out into the scattered pages, and you fly it home, one world at a time.

![Story intro](docs/screenshots/01-story.jpg)

</div>

## Eleven worlds, picked at random

Every run starts on a random world, and every new level turns the page to another one. The whole game re-skins each time: landscape, props, wildlife, lighting, materials, post-processing, music and the interface. So does everything you play with. Each world belongs to a family (water, sky or space) that decides your **craft**, the **creatures**, the **pickups** and the **boss**.

| Family | Your craft | Pickups | Creatures | Bosses |
|---|---|---|---|---|
| Water | Escape capsule | Plankton, supply crates | Urchins, jellyfish, naval mines, lanternfish, pufferfish | Thermal Warden, The Lantern, The Chain, Kraken, Leviathan |
| Sky | Propeller fighter | Coins, hearts | Storm puffs, hot-air balloons, barrage balloons, darts, pop balloons, hail | Thunderhead, Ironclad Airship, Kite Dragon |
| Space | Starship | Crystals, power cells | Spiked mines, saucer drones, tether beacons, seekers, reactor pods, asteroids | Sentinel Core, Dreadnought, Star Wyrm |

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

| | |
|---|---|
| ![Paper Sky home](docs/screenshots/02-home-paper.jpg) | ![Glacier Light home](docs/screenshots/03-home-glacier.jpg) |
| ![Sketchbook](docs/screenshots/04-sketchbook.jpg) | ![Summer Sky](docs/screenshots/05-summer-sky.jpg) |
| ![Ink Mountains](docs/screenshots/06-ink-mountains.jpg) | ![Abyssal Trench](docs/screenshots/07-abyssal-trench.jpg) |
| ![Red Mesa](docs/screenshots/08-red-mesa.jpg) | ![Brick Town](docs/screenshots/09-brick-town.jpg) |
| ![Thunderhead boss](docs/screenshots/13-boss-thunderhead.jpg) | ![Sentinel Core boss](docs/screenshots/14-boss-sentinel-core.jpg) |
| ![Low Orbit](docs/screenshots/15-low-orbit.jpg) | ![Hangar](docs/screenshots/11-hangar.jpg) |

In Settings → Worlds you can choose which worlds are in the rotation, lock the game to one favourite, or keep the interface on one look.

## The journey

- **Story:** an animated paper cut-out storybook plays on the first visit and can be replayed from the home screen. It ends by tearing in half to reveal the game.
- **Levels:** numbered levels with a boss every third level. Level 1 is a gentle warm-up. From there, spawn rate, enemy health and damage, bullet speed, scroll speed and energy burn all rise each level, new creature types join at levels 2, 3, 5 and 7, and the level after a boss eases off slightly.
- **Checkpoints:** after each boss you can start later runs from that level (Journey map).
- **Ending:** beating the fifth boss at level 15 plays the story's ending. Then the pages beyond fifteen continue with stronger bosses.
- **Difficulty:** Relaxed, Normal and Hard presets.
- **Daily run:** a date-seeded run, identical for everyone each day.

## Playing

The controls are deliberately small:

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Fly | Move the mouse: the craft glides to the pointer, pitching and banking as it goes | Drag anywhere |
| Fire | Hold left click or Space | Automatic |
| Dodge | Shift or right click: a fast barrel roll up or down, toward the pointer. Nothing can hit you during it, and it rams small creatures | DODGE |
| Flare | Q, when the ring is full: clears the screen | FLARE |
| Pause | Esc / P | Pause button |

- **One bar: Energy.** Flying burns it slowly and hits take a chunk. Pickups give it back.
- **Chain pickups** for a combo; combos fill the flare ring faster.
- **Power-ups:** shield, magnet and triple shot.
- **Boss fights hold the screen still.** Red lanes mark where the next attack will land; each boss has its own patterns and a second phase.
- **Shards** are the currency: collect them in levels, from bosses and from missions.

The first run starts with a four-step **interactive tutorial** (fly, fire, dodge, flare). Targets keep respawning until you finish each step. On the first visit, a short **guided tour** points out the home screen. Both can be replayed.

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
| Audio | WebAudio, fully procedural: no audio files |
| Art | Procedural: every model, texture, terrain and the storybook are generated in code |
| Fonts | Self-hosted with Fontsource, one display face per world |
| Offline | Service worker and installable web app manifest |

Runtime dependencies: `three` and `postprocessing` (plus font files).

## Performance

- Delta-time simulation: the same speed at any refresh rate
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
  themes/     the ten world definitions and the material styler
  world/      atmosphere, ground + props, clouds, wildlife, textures, shader patches
  entities/   the cube (model, hull painter, flight), enemies, pickups, bosses
  combat/     projectile pools
  fx/         particles, stylize effect, pulse ring, camera rig, flashes, telegraphs
  game/       Game state machine, levels, missions, cosmetics, save data, upgrades
  ui/         HUD, every screen, storybook, page turns, icons, theme tokens
  styles/     CSS
```

There is a deeper tour in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT. See [LICENSE](LICENSE).
