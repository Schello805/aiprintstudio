import { describe, expect, it } from "vitest";
import { encodeCadStl, validateCadPlan } from "./cad";

describe("OpenAI CAD generator", () => {
  it("creates a binary STL from boxes, cylinders and roofs", () => {
    const plan = validateCadPlan({
      title: "Haus", widthMm: 80, depthMm: 60, heightMm: 70,
      primitives: [
        { type: "box", name: "Hauskörper", position: [0, 0, 0], size: [80, 60, 45] },
        { type: "roof", name: "Dach", position: [0, 0, 45], size: [80, 60, 25] },
        { type: "cylinder", name: "Schornstein", position: [60, 30, 55], size: [8, 8, 20] }
      ]
    });
    const stl = encodeCadStl(plan);
    expect(stl.readUInt32LE(80)).toBeGreaterThan(100);
    expect(stl.length).toBe(84 + stl.readUInt32LE(80) * 50);
  });

  it("rejects unsafe or overly thin plans", () => {
    expect(() => validateCadPlan({ title: "Fehler", primitives: [{ type: "box", name: "dünn", position: [0, 0, 0], size: [1, 10, 10] }] })).toThrow("1,2 mm");
  });
});
