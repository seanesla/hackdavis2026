import { Type, type FunctionDeclaration } from "@google/genai";
import {
  BUILDING_MATERIALS,
  BUSH_VARIETIES,
  FENCE_STYLES,
  POOL_SHAPES,
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
        program: {
          type: Type.STRING,
          description:
            "Short free-form description of the building's USE — drives the INTERIOR (rooms + furniture). Examples: 'single-family house', 'elementary school', 'high school', 'fire station', 'public library', 'corner cafe', 'restaurant', 'hospital', 'auto repair shop', 'art gallery', 'church', 'gym', 'retail store'. ALWAYS set this from the user's brief verbatim if they named a building type. If the user said 'school' set 'school'; if they said 'fire station' set 'fire station'; if generic ('a building', 'an office') leave unset and the renderer falls back to the structure_type's default program. Orthogonal to structure_type — a fire station might still use structure_type='house' for the gable-roof massing while program='fire station' drives the interior.",
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
      "Place a piece of street furniture. PLACEMENT IS DETERMINISTIC — the system picks coordinates from each kind's designated zone (benches → front sidewalk; trash cans / dumpsters → behind buildings; fire hydrants → front setback strip near street; mailboxes → front lot edge; bus stops → front-corner sidewalk; stop signs → front lot corners; planters → flanking building entrances). You ONLY pick the kind; the system positions it correctly, snaps to a 2.5ft grid, and rejects the call if the kind's zone is full or blocked. Call once per item; ONLY when the user explicitly mentions that item. For 'two planters at the door' call place_street_furniture twice with kind='planter' — the system handles the pairing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          enum: [...STREET_PROPS],
          description: `What to place. One of: ${STREET_PROPS.join(", ")}.`,
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "place_bushes",
    description:
      "Plant ground-level shrubs / hedges (different from trees — no trunk, sit on the lawn). Auto-avoids buildings, parking, walkways, trees, and fenced sides. Use to dress the entrance, ring building bases, or scatter low greenery. Call only if the user mentions bushes, shrubs, hedges (other than perimeter), or 'foundation planting'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: {
          type: Type.INTEGER,
          description:
            "TOTAL bushes to attempt to place (split across all targets). For 'around_buildings' the count is divided fairly across every building — pass roughly 6-10 PER BUILDING (e.g. 4 houses → count=32, 2 houses → count=16). For 'front', 5-10 is plenty. For 'scattered', 8-16.",
        },
        placement: {
          type: Type.STRING,
          enum: ["around_buildings", "front", "scattered"],
          description:
            "Where to plant. 'around_buildings' rings each building footprint with bushes (most common — foundation planting; budget ~6-10 per building). 'front' lays a single line along the lot's front. 'scattered' spreads them pseudo-randomly.",
        },
        variety: {
          type: Type.STRING,
          enum: [...BUSH_VARIETIES],
          description: `Bush variety. One of: ${BUSH_VARIETIES.join(", ")}. 'boxwood' = formal trim hedge; 'hedge_round' = larger rounded shrub; 'flowering' = colorful flowering bush.`,
        },
        size: {
          type: Type.NUMBER,
          description:
            "Optional override for canopy diameter in feet. Defaults: boxwood 3.5, hedge_round 4.5, flowering 3.0.",
        },
      },
      required: ["count", "placement", "variety"],
    },
  },
  {
    name: "place_pool",
    description:
      "Place a swimming pool on the lot. Renders as a recessed pool of water with a thin coping border. Call when the user mentions a pool, swimming pool, lap pool, plunge pool, or spa. (x, z) is the FRONT-LEFT corner of the pool's bounding box. Pools must NOT overlap any building. Place the pool inside the buildable envelope or in the back yard between the back setback and the building. Reasonable sizes: residential rectangle pool 12-20ft × 25-40ft; round pool 14-20ft diameter; lap pool 8-12ft × 40-60ft.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: "Front-left X of pool bbox, in lot coords." },
        z: { type: Type.NUMBER, description: "Front-left Z of pool bbox, in lot coords." },
        w: { type: Type.NUMBER, description: "Width of pool bbox along x, in feet." },
        d: { type: Type.NUMBER, description: "Depth of pool bbox along z, in feet." },
        shape: {
          type: Type.STRING,
          enum: [...POOL_SHAPES],
          description: `Pool shape. One of: ${POOL_SHAPES.join(", ")}. 'rectangle' = standard or lap pool. 'round' = circle inscribed in the bbox (set w == d). 'kidney' = curved freeform residential shape that fits inside the bbox. Default rectangle when unsure.`,
        },
      },
      required: ["x", "z", "w", "d", "shape"],
    },
  },
  {
    name: "update_building",
    description:
      "MUTATE an existing building IN PLACE. Use this — not place_building — when the user asks to CHANGE something about a building that already exists: resize ('make the house bigger', 'shrink it to 30x40'), restory ('add another floor'), restyle ('change to brick', 'glass facade'), retype ('turn it into a school', 'make it an apartment'), or move ('shift it 10ft to the right'). Pass 'index' (1-based, matches the order buildings were placed) plus ONLY the fields that change — omit unchanged fields. The tool re-validates lot bounds and overlap with other buildings.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        index: {
          type: Type.INTEGER,
          description:
            "1-based index of the building to update (1 = first placed, 2 = second placed, etc.). Building counts and ordering are surfaced in the modify-mode CURRENT STATE block.",
        },
        x: { type: Type.NUMBER, description: "New front-left X (only if moving)." },
        z: { type: Type.NUMBER, description: "New front-left Z (only if moving)." },
        w: { type: Type.NUMBER, description: "New width along x (only if resizing)." },
        d: { type: Type.NUMBER, description: "New depth along z (only if resizing)." },
        stories: {
          type: Type.INTEGER,
          description: "New story count (only if changing height).",
        },
        material: {
          type: Type.STRING,
          enum: [...BUILDING_MATERIALS],
          description: `New material. One of: ${BUILDING_MATERIALS.join(", ")}.`,
        },
        structure_type: {
          type: Type.STRING,
          enum: [...STRUCTURE_TYPES],
          description: `New structure type — changes the EXTERIOR. One of: ${STRUCTURE_TYPES.join(", ")}.`,
        },
        program: {
          type: Type.STRING,
          description:
            "New program label — drives the INTERIOR (rooms + furniture). Set verbatim from the user's brief, e.g. 'elementary school', 'fire station', 'public library'.",
        },
      },
      required: ["index"],
    },
  },
  {
    name: "remove_building",
    description:
      "DELETE an existing building by 1-based index. Use this — not place_building — when the user asks to remove, delete, or get rid of a building that's already on the plan ('remove the second building', 'take out the garage', 'delete the warehouse'). Indices of remaining buildings shift down after a removal, so prefer to remove higher-numbered buildings first if removing several.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        index: {
          type: Type.INTEGER,
          description: "1-based index of the building to remove.",
        },
      },
      required: ["index"],
    },
  },
  {
    name: "clear_layer",
    description:
      "WIPE an entire layer of the site at once. Use for sweeping removals like 'no trees', 'remove all the bushes', 'clear the parking', 'no fences', 'remove the pool'. Works on one layer per call. Does NOT touch buildings — use remove_building for those.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        layer: {
          type: Type.STRING,
          enum: ["parking", "trees", "walkways", "fences", "props", "bushes", "pools"],
          description:
            "Which layer to wipe. Use 'props' for street furniture (benches, trash cans, etc.).",
        },
      },
      required: ["layer"],
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
