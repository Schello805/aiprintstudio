import { describe, expect, it } from "vitest";
import { checkSystemCompatibility } from "./system-check.js";

const supportedMac = {
  platform: "darwin" as const,
  architecture: "arm64",
  macOsVersion: "15.6.1",
  totalMemoryBytes: 16 * 1024 ** 3,
  freeDiskBytes: 20 * 1024 ** 3,
  depthModelAvailable: true,
  objectCaptureAvailable: true
};

describe("system compatibility", () => {
  it("accepts a sufficiently equipped Apple Silicon Mac", () => {
    expect(checkSystemCompatibility(supportedMac)).toEqual({ supported: true, errors: [], warnings: [] });
  });

  it("rejects Intel Macs and old macOS versions with actionable messages", () => {
    const result = checkSystemCompatibility({ ...supportedMac, architecture: "x64", macOsVersion: "12.7.6" });
    expect(result.supported).toBe(false);
    expect(result.errors.join(" ")).toContain("Apple Silicon");
    expect(result.errors.join(" ")).toContain("macOS 13");
  });

  it("warns about constrained resources and missing optional workers", () => {
    const result = checkSystemCompatibility({
      ...supportedMac,
      totalMemoryBytes: 4 * 1024 ** 3,
      freeDiskBytes: 2 * 1024 ** 3,
      depthModelAvailable: false,
      objectCaptureAvailable: false
    });
    expect(result.supported).toBe(true);
    expect(result.warnings).toHaveLength(4);
  });
});

