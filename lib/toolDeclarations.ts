import { Type, type FunctionDeclaration } from "@google/genai";
import {
  BUILDING_MATERIALS,
  FENCE_STYLES,
  STREET_PROPS,
  STRUCTURE_TYPES,
  TREE_SPECIES,
  WALKWAY_MATERIALS,
} from "./types";

// Schemas the model sees. Names must match keys in TOOLS (lib/tools.ts).
// Keep parameter names identical to what the tool functions expect.

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "set_lot",
    description:
      "Establish lot dimensions and zoning setbacks. Call this FIRST. Re-calling wipes any previously placed building and parking. All values in feet.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.NUMBER, description: "Lot width (left-right)." },
        depth: { type: Type.NUMBER, description: "Lot depth (front-to-back, away from street)." },
        front: { type: Type.NUMBER, description: "Front setback (from the street side)." },
        back: { type: Type.NUMBER, description: "Back setback." },
        side: { type: Type.NUMBER, description: "Side setback (applied to BOTH left and right)." },
      },
      required: ["width", "depth", "front", "back", "side"],
    },
  },
  {
    name: "place_building",
    description:
      "Place ONE building on the lot. APPENDS to the buildings array — call this multiple times for multi-building sites (e.g. 4 houses on a residential lot = 4 separate place_building calls). (x, z) is the FRONT-LEFT CORNER of the footprint, NOT the center. The footprint occupies x in [x, x+w] and z in [z, z+d]. Each story is 10 ft tall. Buildings cannot overlap each other. Must be called after set_lot.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: "Front-left X of building, in lot coordinates (>=0, <= lot.width - w)." },
        z: { type: Type.NUMBER, description: "Front-left Z of building, in lot coordinates (>=0, <= lot.depth - d)." },
        w: { type: Type.NUMBER, description: "Building width (along x)." },
        d: { type: Type.NUMBER, description: "Building depth (along z)." },
        stories: { type: Type.INTEGER, description: "Number of stories (positive integer)." },
        material: {
          type: Type.STRING,
          enum: [...BUILDING_MATERIALS],
          description: `Optional construction material. One of: ${BUILDING_MATERIALS.join(", ")}. Pick whichever the user describes (e.g. "brick warehouse" → brick, "glass office tower" → glass, "wooden cabin" → wood). Choose a sensible default based on the building program when the user is silent: residential → wood/stucco, mid-rise mixed-use → brick or stucco, office/commercial → steel or glass, civic/industrial → concrete. OMIT entirely only if you truly cannot infer.`,
        },
        structure_type: {
          type: Type.STRING,
          enum: [...STRUCTURE_TYPES],
          description: `Optional structure type — selects a specialized 3D treatment. One of: ${STRUCTURE_TYPES.join(", ")}. Use 'parking_garage' for multi-level parking decks (renders as open slabs on columns, no walls). 'greenhouse' for nurseries / botanical structures (translucent glass with frame ribs + gable roof). 'pavilion' for open shelters / picnic structures / gazebos (roof on columns, no walls). 'house', 'apartment', 'office', 'warehouse' all use the standard massing. Pick what the user describes; default is 'house' or 'office' depending on program — only set this when the user clearly asks for a non-standard structure.`,
        },
      },
      required: ["x", "z", "w", "d", "stories"],
    },
  },
  {
    name: "check_setbacks",
    description:
      "Validate that the placed building obeys all setbacks. Returns the clearances on each side, or tells you exactly which side(s) the building violates. If the building violates, READ THE ERROR and call place_building again with corrected coordinates.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "place_parking",
    description:
      "Pack the requested number of 9x18 ft parking stalls into the buildable envelope. Greedy multi-row packing: fills the rear-most row first (just inside the back setback), then keeps adding rows toward the front until the count is met or the envelope is exhausted. Cells that would overlap a building are skipped, so the packer also fills the side strips beside the building when needed. Call after place_building so it can avoid them.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.INTEGER, description: "How many stalls to attempt to place." },
      },
      required: ["count"],
    },
  },
  {
    name: "place_trees",
    description:
      "Plant a row or scatter of decorative trees. Trees auto-avoid building footprints (with a 6ft buffer). Call AFTER place_building so trees can dodge them. Call only if the user mentions trees, oaks, palms, landscaping, etc.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.INTEGER, description: "How many trees to attempt to plant." },
        placement: {
          type: Type.STRING,
          enum: ["perimeter", "front", "back", "left", "right", "scattered"],
          description:
            "Where to put them. 'perimeter' = ring around the lot, 'front'/'back'/'left'/'right' = single line along that edge, 'scattered' = pseudo-random across the lot.",
        },
        species: {
          type: Type.STRING,
          enum: [...TREE_SPECIES],
          description: `Tree species. One of: ${TREE_SPECIES.join(", ")}. Pick by climate/style: 'oak' (default, broadleaf), 'pine' (tall narrow), 'palm' (Mediterranean/tropical), 'maple' (deciduous shade).`,
        },
        height: {
          type: Type.NUMBER,
          description:
            "Optional override for trunk-to-tip height in feet. Defaults: oak 24, pine 32, palm 28, maple 22.",
        },
      },
      required: ["count", "placement", "species"],
    },
  },
  {
    name: "place_walkway",
    description:
      "Lay a flat walkway/path between two points on the lot. Renders as a thin paved strip on the ground. Use to connect a parking area to a building, lay a frontage path, or sketch a driveway. Call only if the user mentions a walkway, path, sidewalk, driveway, or flagstone. ENTRANCE ALIGNMENT: a building's front door is rendered at (building.x + building.w/2, building.z). Aim path endpoints there exactly so the walk meets the door. The tool defensively snaps any endpoint within ~half-building-width and ~8ft of a south face to the entrance coordinate, and aligns the opposite end if it sits on the lot's front/back edge — but cleanest output comes from sending the exact coordinates yourself.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        x1: { type: Type.NUMBER, description: "Start x in lot coords." },
        z1: { type: Type.NUMBER, description: "Start z in lot coords." },
        x2: { type: Type.NUMBER, description: "End x in lot coords." },
        z2: { type: Type.NUMBER, description: "End z in lot coords." },
        width: { type: Type.NUMBER, description: "Walkway width in feet (default 6)." },
        material: {
          type: Type.STRING,
          enum: [...WALKWAY_MATERIALS],
          description: `Surface material. One of: ${WALKWAY_MATERIALS.join(", ")}. 'flagstone' for residential paths, 'concrete' for civic/sidewalks, 'asphalt' for driveways.`,
        },
      },
      required: ["x1", "z1", "x2", "z2", "material"],
    },
  },
  {
    name: "place_fence",
    description:
      "Add a fence segment to the lot. ADDITIVE — call multiple times to mix styles (e.g. wrought-iron on three sides + hedge along the front). Later calls override earlier ones on overlapping sides. Call only if the user mentions a fence, hedge, or perimeter wall. Pick sides intelligently: a 'front fence' = sides=['front'], a fully fenced lot = sides=['front','back','left','right'].",
    parameters: {
      type: Type.OBJECT,
      properties: {
        sides: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: ["front", "back", "left", "right"],
          },
          description:
            "Which sides to fence. Use ['front','back','left','right'] for a fully enclosed lot, or pass an empty / partial subset. (You can also pass 'all' as a string, but the array form is preferred.)",
        },
        style: {
          type: Type.STRING,
          enum: [...FENCE_STYLES],
          description: `Fence style. One of: ${FENCE_STYLES.join(", ")}. 'wood' for residential picket / privacy, 'wrought-iron' for civic / formal, 'hedge' for landscaped greenery.`,
        },
      },
      required: ["sides", "style"],
    },
  },
  {
    name: "place_street_furniture",
    description:
      "Place a single piece of street furniture (bench, trash can, mailbox, fire hydrant, planter, bus stop, stop sign, dumpster) at a specific point on the lot. Call multiple times for multiple items. ONLY call if the user mentions one of these things — never add unprompted. Place at sensible positions: trash cans / dumpsters near building back or side, benches along walkways or front, fire hydrants in the front setback near street edge, mailboxes at the lot front, bus stops at the front edge, planters flanking entrances, stop signs at lot corners.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          enum: [...STREET_PROPS],
          description: `What to place. One of: ${STREET_PROPS.join(", ")}.`,
        },
        x: {
          type: Type.NUMBER,
          description: "Lot-coordinate X in feet (0..lot.width).",
        },
        z: {
          type: Type.NUMBER,
          description: "Lot-coordinate Z in feet (0..lot.depth).",
        },
        yaw: {
          type: Type.NUMBER,
          description:
            "Optional Y-axis rotation in DEGREES (default 0). Use 90/180/270 for cardinal facings — e.g. yaw=180 for a bench facing the street.",
        },
      },
      required: ["kind", "x", "z"],
    },
  },
  {
    name: "finalize",
    description:
      "Mark the plan complete. Call this LAST, only after the building is placed and check_setbacks has confirmed it's valid. Calling this exits the planning loop.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export const ALLOWED_TOOL_NAMES = TOOL_DECLARATIONS.map((d) => d.name as string);
