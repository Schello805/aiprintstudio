import { describe, expect, it } from "vitest";
import {
  isAllowedShowItemPath,
  isApprovedSourceImagePath,
  validateIpcReliefOptions,
  validateIpcTextImageOptions
} from "./ipc-validation.js";

describe("ipc-validation", () => {
  it("accepts valid partial relief options and rejects invalid fields", () => {
    const valid = validateIpcReliefOptions({
      widthMm: 120,
      baseMm: 1.6,
      reliefMm: 4,
      profile: "logo",
      processingMode: "vector",
      colors: ["#112233", "#FFFFFF"]
    });
    expect(valid.widthMm).toBe(120);

    expect(() => validateIpcReliefOptions({ widthMm: 5 })).toThrow(/Breite/);
    expect(() => validateIpcReliefOptions({ colors: ["red"] })).toThrow(/Farbpalette/);
    expect(() => validateIpcReliefOptions({ unknownField: true })).toThrow();
  });

  it("validates text image options with zod", () => {
    const valid = validateIpcTextImageOptions({
      text: "Hallo Welt",
      fontFamily: "Helvetica",
      bold: true,
      alignment: "center"
    });
    expect(valid.text).toBe("Hallo Welt");
    expect(() => validateIpcTextImageOptions({ text: "   " })).toThrow(/Text/);
  });

  it("enforces source image path whitelist and temp studio directories", () => {
    const approved = new Set<string>(["/Users/test/Pictures/logo.png"]);
    const tempDirs = ["/tmp/AI Print Studio Projects", "/tmp/AI Print Studio Recovery"];

    expect(isApprovedSourceImagePath("/Users/test/Pictures/logo.png", approved, tempDirs)).toBe(true);
    expect(isApprovedSourceImagePath("/tmp/AI Print Studio Projects/project-123.png", approved, tempDirs)).toBe(true);
    expect(isApprovedSourceImagePath("/etc/passwd", approved, tempDirs)).toBe(false);
    expect(isApprovedSourceImagePath("/tmp/AI Print Studio Projects/../../etc/passwd", approved, tempDirs)).toBe(false);
  });

  it("restricts shell:showItem to logs, preview exports, or approved paths", () => {
    const approved = new Set<string>(["/Users/test/Documents/mein-modell.aips"]);
    expect(isAllowedShowItemPath("/var/log/app/prompt-to-3d.log", "/var/log/app", "/tmp/preview", approved)).toBe(true);
    expect(isAllowedShowItemPath("/tmp/preview/relief/123/model.stl", "/var/log/app", "/tmp/preview", approved)).toBe(true);
    expect(isAllowedShowItemPath("/Users/test/.ssh/id_rsa", "/var/log/app", "/tmp/preview", approved)).toBe(false);
  });
});
