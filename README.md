# Voxel Zen Sanctuary — 静寂の山寺

A Minecraft-style Japanese mountain sanctuary built with Three.js — pagoda, torii gates, taiko bridge, bamboo groves, sakura petals, and pastoral herds. Migrated from a single 1.7k-line HTML file to a Vite + Three.js multi-file project for development efficiency.

**Live repo:** https://github.com/sumonrh/voxel-zen-sanctuary

## Project Structure

```
├── index.html          # Vite entry shell (UI + canvas)
├── vite.config.js
├── package.json
└── src/
    ├── main.js         # bootstrap, scene assembly, animation loop, player controller
    └── core/
        ├── utils.js    # RNG, fbm noise
        ├── config.js   # WORLD constants
        ├── textures.js # procedural 16×16 CanvasTextures
        └── materials.js
```

**Why multi-file?** The original single file became unwieldy for the playable protagonist, combat, and voxel building systems (1500+ lines). Splitting enables HMR, module reuse, tree-shaking, and parallel editing. `src/main.js` contains the composited world (≈1400 LOC) while core utilities are isolated; further split into `entities/` and `systems/` is trivial from this baseline.

## Quick Start

```bash
npm install
npm run dev    # http://localhost:5173
npm run build  # → dist/
npm run preview
```

No build step needed for legacy: `Opus 5 Zen Sanctuary.html` remains as a standalone fallback (CDN Three.js).

## Protagonist — The Crimson Ronin

One samurai is promoted to protagonist near the torii approach path (0, 68):

- **Distinct attire:** crimson lacquer Dō and hakama (`crimson`/`crimsonDark` textures), gold sashimono banner, crimson plume, gold armguard, and trailing sash. NPC guardians keep the dark indigo `lacquer`.
- **Third-person follow camera** (default ON, toggle `E` or `Follow` button). Camera orbits behind the Ronin; drag/scroll still works via OrbitControls.

### Controls

| Action | Key |
|---|---|
| Walk | `WASD` / Arrow keys (relative to camera) |
| Run | `Shift` + `W` |
| Jump | `Space` (applies vertical velocity, gravity -28) |
| Crawl | `Ctrl` or `C` (shrinks collider, slower, lowers camera) |
| Attack | `LMB` with Katana (slot 1) — melee sweep, 3.8 m range, 18 dmg |
| Mine | `LMB` with Pickaxe (slot 2) — raycasts placed voxels |
| Build | `RMB` with Blocks (slot 3) — places 1 m cubes on hover preview |
| Switch tool | `1` Katana / `2` Pickaxe / `3` Blocks, `Q` cycles |
| Follow cam | `E` |
| Time & presets | `1-3` time, `4-8` cameras |
| Audio | `M` or Sound button |

### Combat & Survival

- Samurai guardians become hostile within 18 m, chase at 2.2 m/s, deal 1 dmg on contact.
- Sheep/alpaca flee when the Ronin approaches < 8 m; killing them with the katana restores hunger (+22) and heals (+6 HP). Animals use the fixed leg animation.
- Ghost block preview (semi-transparent) follows the center crosshair in Build mode.

### Building (Minecraft-like)

Voxel size 1 m. Placed blocks are `THREE.Mesh` with `plank`/`stone`/`woodMid` materials, added to `worldGroup`, raycastable for mining. Terrain is heightfield-based; mining terrain itself is not yet destructive (only placed blocks) to keep the `InstancedMesh` batcher performant.

## Bug Fix — Alpaca Legs

**Bug:** Legs swung sideways (lateral `rotation.x`) — animals appeared to skate crab-wise.

**Root cause:** Body long axis is `X` (head at +X). Legs swing forward/back in the `X-Y` plane, which requires `rotation.z` (around Z). Code used `rotation.x`, causing motion in `Z`.

```js
// before
a.legs[i].rotation.x = st*0.5

// after (src/main.js: ~ animateActors)
// FIXED: forward is X so legs rotate around Z
a.legs[i].rotation.z = st*0.5
a.neck.rotation.z = … // was .x
a.head.rotation.z = … // sheep
```

Sheep had the same axis bug (silently fixed). Tested at 6.2 Hz trot; legs now track ground direction.

## Dev Notes

- Three.js 0.160.0 via npm, `OrbitControls` from `three/addons/controls/OrbitControls.js`
- Procedural textures (16×16 CanvasTexture, NearestFilter) — no external assets
- `Batcher` packs variable-size voxels into `InstancedMesh` buckets per material
- Sky dome + `Fog(0xbfe0f5, 180, 900)` synced to time presets
- World half 248, fine terrain 2 m inside radius 92, coarse 4 m beyond

## GitHub

```bash
git init
git add .
git commit -m "feat: migrate to Vite + Crimson Ronin"
gh repo create voxel-zen-sanctuary --public --source=. --remote=origin --push
```

Repo already live at https://github.com/sumonrh/voxel-zen-sanctuary — this README pushed as second commit post-initial upload.

## Legacy

Original file preserved as `Opus 5 Zen Sanctuary.html` for single-file distribution.
