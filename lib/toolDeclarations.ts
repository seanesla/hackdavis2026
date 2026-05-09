import { Type, type FunctionDeclaration } from "@google/genai";

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
      "Place a building on the lot. (x, z) is the FRONT-LEFT CORNER of the footprint, NOT the center. The footprint occupies x in [x, x+w] and z in [z, z+d]. Each story is 10 ft tall. Must be called after set_lot.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: "Front-left X of building, in lot coordinates (>=0, <= lot.width - w)." },
        z: { type: Type.NUMBER, description: "Front-left Z of building, in lot coordinates (>=0, <= lot.depth - d)." },
        w: { type: Type.NUMBER, description: "Building width (along x)." },
        d: { type: Type.NUMBER, description: "Building depth (along z)." },
        stories: { type: Type.INTEGER, description: "Number of stories (positive integer)." },
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
      "Pack the requested number of 9x18 ft parking stalls in a single row along the back of the lot, just inside the back setback. Stalls that would overlap the building are skipped. Call after place_building (otherwise the building can't be avoided).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.INTEGER, description: "How many stalls to attempt to place." },
      },
      required: ["count"],
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
