# 3D Asset Drop Folder

The site renderer uses procedural shapes for trees and cars by default. Drop GLTF/GLB files in here at the exact paths below and the renderer auto-swaps them in (auto-scales to the right dimension, drops them onto the ground, falls back to the procedural mesh if a file is missing or broken).

## Expected files

| Path                          | What                          | Auto-scaled to       |
|-------------------------------|-------------------------------|----------------------|
| `public/models/tree-oak.glb`  | Broadleaf / oak               | `tree.height` ft (Y) |
| `public/models/tree-pine.glb` | Conifer / pine                | `tree.height` ft (Y) |
| `public/models/tree-palm.glb` | Palm                          | `tree.height` ft (Y) |
| `public/models/tree-maple.glb`| Broadleaf / maple             | `tree.height` ft (Y) |
| `public/models/car-sedan.glb` | Generic passenger car         | 14 ft long (Z)       |

## Recommended free packs (CC0)

- **Quaternius — Ultimate Nature Pack**: <https://quaternius.com/packs/ultimatenature.html>
  - Pick distinct trunk/foliage variants for each species. Export as `.glb` and rename.
- **Quaternius — Ultimate Vehicles Pack**: <https://quaternius.com/packs/ultimatevehicles.html>
  - Sedan or Hatchback works well for typical parking stalls.
- **Kenney — Nature Kit**: <https://kenney.nl/assets/nature-kit>
- **Poly Pizza** (CC-BY): <https://poly.pizza>

## Calibration knobs

Edit `lib/modelConfig.ts` if a pack's models need tweaking:

- `rotateY` — radians, applied after auto-scale. Use `Math.PI` if a pack faces the wrong way.
- `scaleBoost` — multiplier on top of auto-scale. Use `1.2` if foliage looks sparse, `0.9` if too chunky.

The auto-scale pass measures the model's bounding box on load and normalizes Y (or Z for cars) to match the planning data, so any pack should "just work" without manual unit conversion.
