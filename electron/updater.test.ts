import { describe, expect, it } from "vitest";
import { isAllowedUpdateDownloadUrl, isNewerVersion, parseMountedVolumePath } from "./updater.js";

describe("In-App Updater Hilfsfunktionen", () => {
  it("erkennt neuere Versionen zuverlässig", () => {
    expect(isNewerVersion("0.31.46", "0.31.45")).toBe(true);
    expect(isNewerVersion("0.32.0", "0.31.45")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.31.45")).toBe(true);
    expect(isNewerVersion("0.31.45", "0.31.45")).toBe(false);
    expect(isNewerVersion("0.31.44", "0.31.45")).toBe(false);
  });

  it("erlaubt nur offizielle GitHub-Release-Downloads für das Update", () => {
    expect(
      isAllowedUpdateDownloadUrl(
        "https://github.com/Schello805/aiprintstudio/releases/download/v0.31.45/AI.Print.Studio-0.31.45-mac-arm64.dmg"
      )
    ).toBe(true);
    expect(
      isAllowedUpdateDownloadUrl(
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/123456/file.dmg"
      )
    ).toBe(true);
    expect(isAllowedUpdateDownloadUrl("http://github.com/Schello805/aiprintstudio/releases/download/v1/a.dmg")).toBe(false);
    expect(isAllowedUpdateDownloadUrl("https://github.com/other/repo/releases/download/v1/a.dmg")).toBe(false);
    expect(isAllowedUpdateDownloadUrl("https://evil.example.com/AI-Print-Studio.dmg")).toBe(false);
  });

  it("extrahiert den gemounteten Volume-Pfad aus der hdiutil-Ausgabe", () => {
    const sampleOutput = [
      "/dev/disk4          \tGUID_partition_scheme          \t",
      "/dev/disk4s1        \tApple_HFS                      \t/Volumes/AI Print Studio 0.31.45"
    ].join("\n");
    expect(parseMountedVolumePath(sampleOutput)).toBe("/Volumes/AI Print Studio 0.31.45");
    expect(parseMountedVolumePath("keine mount info")).toBeNull();
  });
});
