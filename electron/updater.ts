import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { access, constants, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  url: string;
  directDownload: boolean;
};

export type UpdateProgress = {
  phase: "downloading" | "verifying" | "installing" | "ready" | "error";
  detail: string;
  percent: number;
};

const EXPECTED_BUNDLE_ID = "de.michaelschellenberger.aiprintstudio";
const GITHUB_RELEASES_API = "https://api.github.com/repos/Schello805/aiprintstudio/releases/latest";
const GITHUB_RELEASES_PAGE = "https://github.com/Schello805/aiprintstudio/releases";

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = candidate.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let index = 0; index < Math.max(candidateParts.length, currentParts.length); index += 1) {
    const next = candidateParts[index] ?? 0;
    const installed = currentParts[index] ?? 0;
    if (next !== installed) return next > installed;
  }
  return false;
}

export function isAllowedUpdateDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (host === "github.com") {
      return pathname.startsWith("/schello805/aiprintstudio/releases/download/") && pathname.endsWith(".dmg");
    }
    if (host === "objects.githubusercontent.com" || host === "release-assets.githubusercontent.com") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function fetchLatestUpdateInfo(currentVersion: string): Promise<UpdateInfo> {
  const response = await fetch(GITHUB_RELEASES_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "AI-Print-Studio" }
  });
  if (!response.ok) throw new Error("Die Update-Informationen konnten nicht geladen werden.");
  const release = await response.json() as {
    tag_name?: string;
    html_url?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  };
  const latestVersion = (release.tag_name ?? "").replace(/^v/, "");
  const dmg = release.assets?.find((asset) => asset.name?.endsWith(".dmg"));
  return {
    currentVersion,
    latestVersion,
    available: Boolean(latestVersion && isNewerVersion(latestVersion, currentVersion)),
    url: dmg?.browser_download_url ?? release.html_url ?? GITHUB_RELEASES_PAGE,
    directDownload: Boolean(dmg?.browser_download_url && isAllowedUpdateDownloadUrl(dmg.browser_download_url))
  };
}

export function parseMountedVolumePath(hdiutilStdout: string): string | null {
  const lines = hdiutilStdout.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /(\/Volumes\/[^\t\r\n]+)$/.exec(lines[index].trim());
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export async function downloadAndInstallDmgUpdate(options: {
  downloadUrl: string;
  isPackaged: boolean;
  targetAppPath?: string;
  onProgress: (progress: UpdateProgress) => void;
  onQuitForInstall: () => void;
  onFallbackOpenDmg: (dmgPath: string) => Promise<void>;
}): Promise<{ installed: boolean; message: string }> {
  if (!isAllowedUpdateDownloadUrl(options.downloadUrl)) {
    throw new Error("Die Update-Adresse stammt nicht aus dem offiziellen GitHub-Release.");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "ai-print-studio-update-"));
  const dmgPath = join(tempDir, "AI-Print-Studio-Update.dmg");
  let mountPoint: string | null = null;

  try {
    options.onProgress({
      phase: "downloading",
      detail: "Update-Paket wird von GitHub geladen …",
      percent: 2
    });

    const response = await fetch(options.downloadUrl, {
      headers: { "User-Agent": "AI-Print-Studio" }
    });
    if (!response.ok || !response.body) {
      throw new Error(`Der Update-Download ist fehlgeschlagen (Status ${response.status}).`);
    }

    const totalBytes = Number(response.headers.get("content-length") ?? 0);
    let transferredBytes = 0;
    const fileStream = createWriteStream(dmgPath);
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        transferredBytes += value.byteLength;
        await new Promise<void>((resolveWrite, rejectWrite) => {
          fileStream.write(Buffer.from(value), (error) => (error ? rejectWrite(error) : resolveWrite()));
        });
        const percent = totalBytes > 0
          ? Math.min(88, Math.max(4, Math.round((transferredBytes / totalBytes) * 86)))
          : 45;
        const transferredMb = (transferredBytes / 1_048_576).toFixed(1).replace(".", ",");
        const totalMb = totalBytes > 0 ? ` / ${(totalBytes / 1_048_576).toFixed(1).replace(".", ",")} MB` : "";
        options.onProgress({
          phase: "downloading",
          detail: `Update wird heruntergeladen (${transferredMb}${totalMb}) …`,
          percent
        });
      }
    }

    await new Promise<void>((resolveClose, rejectClose) => {
      fileStream.end((error?: Error | null) => (error ? rejectClose(error) : resolveClose()));
    });

    options.onProgress({
      phase: "verifying",
      detail: "DMG wird eingebunden und Signatur geprüft …",
      percent: 91
    });

    const { stdout: attachOut } = await execFileAsync("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      dmgPath
    ]);
    mountPoint = parseMountedVolumePath(attachOut);
    if (!mountPoint || !existsSync(mountPoint)) {
      throw new Error("Das heruntergeladene Update-Image konnte nicht geöffnet werden.");
    }

    const entries = await readdir(mountPoint);
    const appBundleName = entries.find((entry) => entry.endsWith(".app"));
    if (!appBundleName) {
      throw new Error("Im Update-Image wurde kein App-Paket gefunden.");
    }
    const mountedAppPath = join(mountPoint, appBundleName);

    const { stdout: bundleIdOut } = await execFileAsync("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleIdentifier",
      join(mountedAppPath, "Contents/Info.plist")
    ]);
    if (bundleIdOut.trim() !== EXPECTED_BUNDLE_ID) {
      throw new Error("Die Paketkennung des Updates stimmt nicht mit AI Print Studio überein.");
    }

    await execFileAsync("codesign", ["--verify", "--deep", "--strict", mountedAppPath]);

    const targetAppPath = options.targetAppPath ?? "/Applications/AI Print Studio.app";
    let canWriteApplications = false;
    try {
      await access("/Applications", constants.W_OK);
      canWriteApplications = true;
    } catch {
      canWriteApplications = false;
    }

    if (!options.isPackaged || !canWriteApplications) {
      await execFileAsync("hdiutil", ["detach", mountPoint, "-quiet"]).catch(() => undefined);
      mountPoint = null;
      await options.onFallbackOpenDmg(dmgPath);
      options.onProgress({
        phase: "ready",
        detail: "Update überprüft und geöffnet.",
        percent: 100
      });
      return {
        installed: false,
        message: "Das geprüfte Update-Image wurde geöffnet."
      };
    }

    options.onProgress({
      phase: "installing",
      detail: "Update wird installiert – AI Print Studio startet gleich neu …",
      percent: 98
    });

    const updateScript = [
      "PID=$1",
      "SRC_APP=$2",
      "DST_APP=$3",
      "MNT_POINT=$4",
      "TMP_DIR=$5",
      "for _ in $(seq 1 150); do",
      "  if ! kill -0 \"$PID\" 2>/dev/null; then break; fi",
      "  sleep 0.2",
      "done",
      "rm -rf \"$DST_APP\"",
      "ditto \"$SRC_APP\" \"$DST_APP\"",
      "xattr -dr com.apple.quarantine \"$DST_APP\" 2>/dev/null || true",
      "hdiutil detach \"$MNT_POINT\" -quiet 2>/dev/null || hdiutil detach \"$MNT_POINT\" -force -quiet 2>/dev/null || true",
      "rm -rf \"$TMP_DIR\" 2>/dev/null || true",
      "open -n \"$DST_APP\""
    ].join("\n");

    const child = spawn(
      "/bin/zsh",
      ["-c", updateScript, "ai-print-studio-updater", String(process.pid), mountedAppPath, targetAppPath, mountPoint, tempDir],
      { detached: true, stdio: "ignore" }
    );
    child.unref();

    setTimeout(() => {
      options.onQuitForInstall();
    }, 350);

    return {
      installed: true,
      message: "Update wird installiert und AI Print Studio neu gestartet …"
    };
  } catch (error) {
    if (mountPoint) {
      await execFileAsync("hdiutil", ["detach", mountPoint, "-force", "-quiet"]).catch(() => undefined);
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    const detail = error instanceof Error ? error.message : "Update konnte nicht installiert werden.";
    options.onProgress({
      phase: "error",
      detail,
      percent: 0
    });
    throw error;
  }
}
