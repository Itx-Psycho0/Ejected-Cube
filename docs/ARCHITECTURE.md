# Architecture

## Frame flow

`Loop` calls `Game.frame(dt)` once per animation frame. `dt` is clamped to 1/20 s, so a stalled tab can't teleport the player.

```
Input.update
  -> pause handling
  -> mode update (menu | intro | play/boss | transition | surfacing | dead)
       updateWorld   atmosphere, seabed, fauna, station (scroll)
       Player.update spring steering, dash, current, resources
       directors     enemy + pickup spawning from the zone tables
       updateCombat  ping reveal, projectiles, enemies, collisions, boss, pickups
  -> Player.animate, Flash, Telegraph, Particles (uploads new particles only)
  -> CameraRig (shake, follow, cutscene offset)
  -> Renderer.render (RenderPass + one merged EffectPass)
```

## Game modes

| Mode | What happens |
|---|---|
| `menu` | The capsule sits docked at the station. The camera frames it beside the title menu |
| `intro` | Alarms and explosions, then launch: the camera eases out to gameplay framing |
| `play` | The zone timer advances depth; spawning is active |
| `boss` | Spawning stops and scrolling slows; the boss runs its attack scripts |
| `transition` | A 3 s breather while fog, light and music blend into the next zone |
| `surfacing` | After the final boss, the pod rises through the ocean surface |
| `dead` / `victory` | Slow motion, then the result screen; the run is banked to the save |

## Zones are data

`src/game/zones.ts` holds every zone as one object: colours, fog density, light, caustics strength, set-dressing densities, current, enemy weights, spawn rate, boss and music mood. The atmosphere blends between zones. The seabed applies a new zone's palette as tiles are recycled, so a change rolls in naturally from the right side of the screen.

## Bosses are scripts

Each boss extends `Boss` and lists its attacks as generator functions:

```ts
private *snap(ctx: BossContext) {
  ctx.telegraph.show(0, ctx.player.pos.y, ctx.bounds.x * 2.2, 30, 0.9); // warn
  yield 0.9;                                                            // wait
  /* ...fire the shockwave... */
  yield 0.9;
}
```

The base class picks a random attack (never the same one twice in a row), runs it, waits between attacks, and speeds everything up in phase 2. Collision uses a list of `HitCircle`s per boss. Each circle has a damage multiplier, so armour and weak spots are expressed per area.

## Rendering notes

- The materials are standard Three.js PBR materials, extended with small `onBeforeCompile` patches (`world/shaderPatches.ts`) for caustics, plant sway and fish swimming. Lighting, fog and shadows keep working as normal.
- Point sprites (marine snow, vent smoke, particles) do all their motion in the vertex shader.
- Textures are generated on a canvas at load time (`world/textures.ts`): sand ripples, rock, rust, the painted hull with seams and stencils, and creature scales.

## Save data

`game/Save.ts` stores a versioned JSON blob in `localStorage` under `ejected-cube:save:v1`: settings, pearls, upgrades, achievements, stats, the best ten runs and the daily best. Every access is wrapped in try/catch, so private windows still work with an in-memory save.

## Dev helpers

In `npm run dev`, `window.game` exposes the running game. For example, `game.debugJump(3, true)` jumps to the Kraken fight, and `game.loop.timeScale = 3` fast-forwards.
