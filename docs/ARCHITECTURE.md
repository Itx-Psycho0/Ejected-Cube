# Architecture

## Frame flow

`Loop` calls `Game.frame(dt)` once per animation frame, with `dt` clamped to 1/20 s.

```
Input.update -> pause handling
  -> mode update (menu/hangar | intro | play/boss/transition | dead)
       updateWorld    atmosphere, ground, wildlife, clouds (scroll)
       Player.update  spring steering, dash, current, resources
       directors      enemy + pickup spawning from the level definition
       updateCombat   pulse reveals, projectiles, enemies, collisions, boss, pickups
  -> Flash, Telegraph, Particles, CameraRig
  -> MaterialStyler.sync (mirrors glow animation onto styled materials)
  -> Renderer.render: RenderPass -> [bloom, chromatic, ACES] -> [stylize, vignette, grain]
```

## Worlds are data

`src/themes/themes.ts` describes each world in one object:

| Part | Drives |
|---|---|
| `world` | Sky gradient, sun disc, aurora, fog, light, ground colours, terrain shape, darkness |
| `props` | Which prop set fills the ground, prop colours and densities, sway, clouds, wildlife |
| `particles` | Snow, paper flecks, sand drift, pencil specks or data motes |
| `material` | `pbr`, `toon`, `flat`, `plastic` or `clay`: applied by `MaterialStyler` |
| `fx` | Bloom, outlines, hatching, ink wash, paper grain, saturation, contrast, vignette |
| `ui` | CSS tokens: palette, fonts, radius, border, shadow, panel style, HUD contrast |
| `mood` | Music key, scale, tempo and filter for the generative soundtrack |

`Game.applyTheme()` pushes a theme into every system. Level changes happen behind `UI.pageTurn()`: a sheet in the next world's colours covers the screen, the world swaps instantly underneath, shaders compile, then the sheet slides away.

### Material styling

All models are authored with standard PBR materials. `MaterialStyler` builds a cached variant of each material per style (for example, `MeshToonMaterial` with a 3-step ramp for toon worlds) and copies the `onBeforeCompile` shader patches (plant sway, fish swim, caustics) across. Gameplay code keeps animating the original materials, and `sync()` mirrors emissive and opacity onto the active variant each frame.

### Stylize pass

`fx/StylizeEffect.ts` is one screen-space effect that reads colour and depth:
- Sobel edges on view-space depth (silhouettes) and luminance (inner lines) for ink outlines
- Luminance-banded cross-hatching on paper colour (Sketchbook)
- Monochrome ink wash that keeps reds (Ink Mountains)
- Paper-fibre overlay, saturation and contrast grading

## Levels

`game/levels.ts` turns a level number into a `LevelDef`: duration, spawn rate, enemy mix (new species unlock at levels 2, 4, 5 and 7), enemy health and damage multipliers, bullet speed, scroll speed, current strength, and a boss every third level. The level right after a boss starts slightly easier, which creates a sawtooth curve. After level 15 the cycle repeats with stronger bosses.

## Bosses are scripts

Each boss extends `Boss` and lists generator functions that `yield` seconds to wait. The base class picks an attack (never the same one twice in a row) and speeds up in phase 2. Collision is a list of hit circles, each with its own damage multiplier and harm flag.

## Missions

`game/missions.ts` has 12 templates. Three are active at a time. Accumulating ones count across runs; "single run" ones track the best value. Completing a mission pays shards and replaces it with a harder tier of a different kind.

## Save data

`localStorage` key `ejected-cube:save:v2`: settings, shards, upgrades, cosmetics owned and equipped, missions, achievements, stats, highest level, worlds seen, and story, tutorial and tour flags. Saves from v1 are migrated (pearls become shards). Every access is wrapped in try/catch.

## Story and tutorial

`ui/Story.ts` renders the storybook as inline SVG cut-out layers animated with CSS (pop-ups, gears, ink spread, the ejection, drifting pages). Finishing it splits a snapshot into two jagged halves that tear apart. The tutorial is a list of `{ setup, done }` steps in `Game`, run on a practice page with spawning switched off.
