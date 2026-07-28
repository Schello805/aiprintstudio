import { describe, expect, it } from "vitest";
import { validateImageFile } from "./image-validation";

describe("validateImageFile", () => {
  it("accepts a supported image within the size limit", () => {
    expect(validateImageFile({ type: "image/png", size: 1024 })).toEqual({ valid: true });
    expect(validateImageFile({ type: "image/svg+xml", size: 1024 })).toEqual({ valid: true });
  });

  it("rejects unsupported formats", () => {
    expect(validateImageFile({ type: "image/gif", size: 1024 })).toEqual({
      valid: false,
      message: "Bitte verwende ein PNG-, JPG-, WEBP- oder SVG-Bild."
    });
  });

  it("rejects oversized images", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 26 * 1024 * 1024 })).toEqual({
      valid: false,
      message: "Das Bild darf höchstens 25 MB groß sein."
    });
  });
});
