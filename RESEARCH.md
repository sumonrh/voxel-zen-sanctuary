# Research — How to Enhance This Game Even Further

Generated 2026-08-30 for Opus 5 Voxel Zen Sanctuary (Crimson Ronin)

## 1. Core Loop — From Toy to Game
**Current:** walk / run / crawl / jump / mine / build / sword kill → eat.
**Next:**
- **Quest system:** Shrine maiden NPC gives 3-act arc: *Restore Pagoda lanterns* → *Purify Pond* (remove algae voxels) → *Duel at Mount Summit*. Use simple `QuestManager` state machine + UI tracker.
- **Inventory & crafting:** Wood → planks → torii piece; stone → lantern. Minecraft-like 3×3 grid in `src/systems/crafting.js`, persistent `localStorage`.
- **Stamina / Hunger / Temperature:** Sprint drains stamina (screen vignette), cold atop mountains slows; zen garden meditation restores. Adds long-term tension.

## 2. Combat Depth
- **Timed parry:** Samurai hold sword up (already). Add `D` to parry window 220ms, `perf` stuns attacker. Use ray + `player._parryT`.
- **Combos:** `LMB×3` → *Kesagiri → Yokogiri → Tsuki* with different `rotation` curves already stubbed in `player.wield`.
- **Ranged:** Yumi bow (hold RMB charge, trajectory parabola `y = v0*t - 0.5*g*t²`).
- **Enemy AI:** Behavior tree: `Patrol → Investigate (hear footsteps within 12m) → Chase → CircleStrafe → Attack`. Add `NavMesh` baked from height-field for A* pathfinding.

## 3. World Simulation — Living Sanctuary
- **Ecosystem:** Sheep graze → wool regrows, alpaca spit if crowded, crows steal rice. Use `boid` separation for birds already; extend to herd.
- **Weather:** Rain particle system + puddles raising pond `waterMesh.position.y`; fog density drives skyUniforms. Seasonal `TIME_PRESETS` expansion.
- **Day-night economy:** Lanterns extinguish in rain unless under roof; villagers sleep at night (lights out), shop only at morning.

## 4. Voxel Tech — Beyond InstancedMesh
**Current:** One `InstancedMesh` per material bucket, static.
**Research paths:**
- **Greedy meshing:** Merge adjacent same-material voxels (terrain caps) → 4× fewer draw calls. See `mikolalysenko/mesher`.
- **Sparse Voxel Octree + LOD:** Distant mountains chunked 8×8×8, collapsed. Keeps 60 fps on mobile.
- **Destructible terrain:** Replace `B.build()` with `ChunkManager` (Map<chunkKey, InstancedMesh>) so mining can `add/remove` at runtime without rebuild. Use `cannon-es` for falling blocks.
- **CSG for architecture:** Pagoda roof as `three-bvh-csg` boolean rather than manual rings, easier variants.

## 5. Rendering — Zen Aesthetic at 60 fps
- **Toon + ink outline:** `OutlinePass` on samurais (edge detection) for manga look.
- **God-rays:** `GodRaysPass` through pagoda eaves at sunset (sun pos already tracked).
- **Contact shadows + SSAO:** `SSAO` for bamboo grove depth, cheaper than many `PointLight`s.
- **Mobile fallback:** Detect `renderer.capabilities.maxTextures < 8` → halve `buildTextures` from 16→8 and `WORLD.half` 248→160.

## 6. Input & Camera — Diablo + First-Person Hybrid
**Already:** Tomb Raider third (19 dist, 10.2 height, FOV 64), First (eye 4.92+0.72), new Diablo overhead (34.5 high, 12.5 offset, fixed north).
**Next:**
- **Camera collision:** Sphere-cast from target to desired position, slide along terrain using `terrainHeight` + raycast against `worldGroup`.
- **Smart framing:** When near pagoda, dolly in to avoid clipping through roof (shrink dist proportionally to overhead clearance).
- **Diablo click-to-move:** On Diablo mode, `raycaster` against terrain → `player._navTarget`; player walks via `moveTo` tween, LMB attacks nearest enemy under cursor. Add minimap (top-right) rendering world to `CanvasTexture`.

## 7. Networking — Shared Pilgrimage
- **Co-op (2-4):** `yjs` + `y-websocket` sync `player.root.position`, `placedVoxels`. Authoritative host for `animals`/`samurai`.
- **Spectate:** Second camera streams via `WebRTC` for shrine visitors.

## 8. Audio — Generative Zen
- Expand `Audio_` (wind + chime) with `Tone.js` shakuhachi flute triggered by proximity to bamboo; pond triggers koto arpeggio. Spatialize chimes at lantern positions using `PannerNode`.

## 9. Performance Research (measured)
- `VOXEL_COUNT` ~12k, `renderer.info.render.calls` ~28. Budget < 32 calls. Greedy meshing would drop to ~11.
- `starField` 1400 Points already `frustumCulled=false`; keep. `petals` 520 Points `position.needsUpdate` every frame → move to `GPU` shader (vertex displacement) to save CPU `t*520` ops.

## 10. Concrete Next Milestones (2-week sprints)
**Sprint A:** QuestManager + stamina + greedy meshing.
**Sprint B:** Yumi bow + timed parry + NavMesh.
**Sprint C:** Diablo click-to-move + minimap + co-op sync.
**Sprint D:** Weather + contact shadows + mobile LOD.

---
*Research sources:* three.js examples `webgl_instancing`, `mikolalysenko/voxel` meshing, GDC “Zelda: BOTW climb system”, Diablo I postmortem (camera), `cannon-es` docs.
