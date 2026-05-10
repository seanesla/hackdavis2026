import type { Building, StructureType } from "./types";

// Per-program room briefs, split by ground-vs-upper. Drives the visual
// content of the generated floor plan; keep terse so the model stays
// focused on architectural notation rather than creative writing.
const PROGRAM_BY_TYPE: Record<
  StructureType,
  { ground: string; upper: string }
> = {
  house: {
    ground:
      "Open-plan kitchen with island, dining area, living room with sofa cluster, entry foyer with closet, half bath, single-car garage if footprint allows.",
    upper:
      "Master bedroom with en-suite bath and walk-in closet, two secondary bedrooms, shared full bath, linen closet, central hall.",
  },
  apartment: {
    ground:
      "Lobby with mailroom, leasing office, ground-floor amenity (gym or lounge), 1-2 ADA-accessible 1-bedroom units flanking the entry.",
    upper:
      "Double-loaded corridor with 4-6 units (mix of studio, 1BR, 2BR), elevator core and stair tower at one end, trash chute, end-of-corridor windows.",
  },
  office: {
    ground:
      "Reception desk facing the entry, public lobby with seating, two enclosed meeting rooms, restrooms (M/F + ADA), service core (elevators, stairs, MEP).",
    upper:
      "Open-plan workstation grid (6-foot benches), perimeter private offices, glass-walled conference rooms, breakroom with kitchenette, restrooms, central core.",
  },
  warehouse: {
    ground:
      "Clear-span floor with no interior columns where possible, 3-5 loading dock doors along one long edge, small office cluster near the entry, racking grid lines.",
    upper:
      "Mezzanine over the office cluster only — most of the upper level is left as warehouse void with the lower floor visible (annotate as 'OPEN TO BELOW').",
  },
  parking_garage: {
    ground:
      "Two rows of 90-degree parking stalls back-to-back with a central drive aisle, perimeter ramp UP to the next level, pedestrian elevator core, painted directional arrows.",
    upper:
      "Same stall pattern as ground, but with both UP and DOWN ramps annotated, no entry/exit door. Stripe count should reflect the footprint dimensions.",
  },
  greenhouse: {
    ground:
      "3-4 parallel planting benches, central walking aisle ~4ft wide, perimeter irrigation drip line, single entry door on the south wall, headhouse / potting area at one end.",
    upper:
      "Greenhouses are single-story; render the same as ground.",
  },
  pavilion: {
    ground:
      "Open plan with no interior walls, structural columns marked at corners and midpoints, roof outline shown as dashed overhead, central picnic table or fire pit.",
    upper:
      "Pavilions are single-story; render the same as ground.",
  },
};

// Bump this when the prompt style changes meaningfully — old cached images
// generated with the previous prompt would otherwise stick around and look
// inconsistent with anything new.
const STYLE_VERSION = "v2-illustrated";

export function floorPlanCacheKey(
  building: Building,
  storyIndex: number
): string {
  return [
    STYLE_VERSION,
    Math.round(building.w),
    Math.round(building.d),
    building.stories,
    storyIndex,
    building.structure_type ?? "office",
    building.material ?? "none",
  ].join("|");
}

export function buildFloorPlanPrompt(
  building: Building,
  storyIndex: number
): string {
  const w = Math.round(building.w);
  const d = Math.round(building.d);
  const aspect = (building.w / building.d).toFixed(2);
  const totalStories = building.stories;
  const isGround = storyIndex === 0;
  const isTop = storyIndex === totalStories - 1 && totalStories > 1;
  const type = building.structure_type ?? "office";
  const material = building.material ?? "concrete";

  const program = PROGRAM_BY_TYPE[type];
  const programBlurb = isGround ? program.ground : program.upper;
  const floorLabel = isGround
    ? `Ground Floor (Level 1 of ${totalStories})`
    : isTop
    ? `Top Floor (Level ${totalStories} of ${totalStories})`
    : `Level ${storyIndex + 1} of ${totalStories}`;

  // Stable seed-like phrasing so re-rolls of the same key feel consistent.
  const seedTag = `seed-${type}-${storyIndex}-${w}x${d}`;

  return [
    `Generate a TOP-DOWN ILLUSTRATED FLOOR PLAN of a ${type} — the camera looks straight down from directly overhead at the interior of the building with the roof removed (a "dollhouse view from above"). Think modern real-estate listing render or a stylized interior-design preview, NOT a CAD drawing.`,
    `STYLE: clean, full-color illustrated render. Soft, warm color palette. Walls shown as solid light-gray bands (not black line-art). Floors clearly colored by material — hardwood as honey-tan planks, tile as light gray, carpet as muted wool tones, kitchen/bath surfaces in their own distinct colors. Light, soft drop-shadows under furniture for a subtle sense of depth. Bright magazine-quality lighting. No black-and-white CAD line work, no hatching, no poché.`,
    `FURNITURE: render every piece as a recognizable, slightly-shaded top-down illustration with a hint of axonometric depth — a sofa actually looks like a sofa with cushions, a bed has pillows and a duvet, a kitchen has a stove and sink and counters, a desk has a chair tucked under it. Each item should be readable at a glance from above without needing labels. Include rugs, plants, lamps, and small décor where appropriate to bring rooms to life.`,
    `BUILDING ENVELOPE: rectangular footprint of ${w} feet wide by ${d} feet deep. The image's aspect ratio MUST match the footprint (≈${aspect}:1 wide-to-deep) — this is critical because the image is mapped onto a plane sized to those dimensions. Doors shown as openings in the wall (with the door leaf visible swung open or closed). Windows shown as openings with light streaming in.`,
    `EXTERIOR CONTEXT: the building's outer walls are ${material} — let the exterior wall band hint at this material's color (warm brown for wood, terracotta for brick, off-white for stucco, light gray for concrete, cool steel-gray for steel, pale blue-gray for glass). Interior walls are off-white.`,
    `FLOOR PROGRAM (${floorLabel}, ${type}):`,
    programBlurb,
    `CONSTRAINTS: top-down view only — straight overhead, no perspective skew, no isometric tilt of the overall building (individual furniture can have a hint of axonometric depth but the building envelope itself is square-on from above). No people. No exterior trees, cars, or street context — only the interior of this floor. No text labels, no room name annotations, no scale bars, no north arrows, no title blocks. Clean illustration only. Do not echo this prompt as text inside the image. Tag: [${seedTag}]`,
  ].join("\n\n");
}
