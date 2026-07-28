import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp, { type Metadata } from "sharp";
import { createRelief, type ReliefOptions } from "./relief.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const execFileAsync = promisify(execFile);

type StoredSettings = {
  schemaVersion?: number;
  encryptedOpenAiKey?: string;
  modelSetupAccepted?: boolean;
};

const settingsDirectoryName = "de.michaelschellenberger.aiprintstudio";

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = candidate.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let index = 0; index < Math.max(candidateParts.length, currentParts.length); index += 1) {
    const next = candidateParts[index] ?? 0;
    const installed = currentParts[index] ?? 0;
    if (next !== installed) return next > installed;
  }
  return false;
}

async function ensureApplicationLocation(): Promise<boolean> {
  if (process.platform !== "darwin" || !app.isPackaged || app.isInApplicationsFolder() || process.argv.includes("--smoke-test")) {
    return true;
  }
  const installedApp = "/Applications/AI Print Studio.app";
  let installedVersion = "";
  if (existsSync(installedApp)) {
    try {
      const { stdout } = await execFileAsync("/usr/libexec/PlistBuddy", [
        "-c", "Print :CFBundleShortVersionString", join(installedApp, "Contents/Info.plist")
      ]);
      installedVersion = stdout.trim();
    } catch {
      // Eine unvollständige Installation darf durch die aktuelle App ersetzt werden.
    }
  }
  const currentVersion = app.getVersion();
  const installedIsCurrentOrNewer = Boolean(installedVersion) && !isNewerVersion(currentVersion, installedVersion);
  if (installedIsCurrentOrNewer) {
    const choice = dialog.showMessageBoxSync({
      type: "info",
      buttons: ["Installierte App öffnen", "Diese Kopie trotzdem starten"],
      defaultId: 0,
      cancelId: 1,
      title: "AI Print Studio ist bereits installiert",
      message: `In „Programme“ liegt Version ${installedVersion}.`,
      detail: `Du hast Version ${currentVersion} außerhalb des Programme-Ordners gestartet. So entstehen falsche Versionsanzeigen.`
    });
    if (choice === 0) {
      await shell.openPath(installedApp);
      app.quit();
      return false;
    }
    return true;
  }
  const choice = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["In Programme installieren", "Nur diesmal hier starten"],
    defaultId: 0,
    cancelId: 1,
    title: "AI Print Studio installieren",
    message: `Version ${currentVersion} läuft noch außerhalb des Programme-Ordners.`,
    detail: "AI Print Studio kann sich jetzt selbst nach „Programme“ verschieben und anschließend neu starten."
  });
  if (choice !== 0) return true;
  try {
    const moved = app.moveToApplicationsFolder({ conflictHandler: () => true });
    return !moved;
  } catch (error) {
    dialog.showErrorBox("Installation fehlgeschlagen", error instanceof Error ? error.message : "Die App konnte nicht nach „Programme“ verschoben werden.");
    return true;
  }
}

function settingsRoot(): string {
  if (process.argv.includes("--smoke-test") && process.env.AI_PRINT_STUDIO_SETTINGS_ROOT) {
    return process.env.AI_PRINT_STUDIO_SETTINGS_ROOT;
  }
  return app.getPath("appData");
}

function settingsFile(): string {
  return join(settingsRoot(), settingsDirectoryName, "settings.json");
}

function depthResources() {
  const root = app.isPackaged ? process.resourcesPath : join(currentDirectory, "../resources");
  return {
    worker: join(root, "depth", "depth-worker"),
    model: join(root, "depth", "DepthAnythingV2SmallF16P6.mlmodelc"),
    objectCaptureWorker: join(root, "depth", "object-capture-worker")
  };
}

function depthModelAvailable(): boolean {
  const resources = depthResources();
  return existsSync(resources.worker) && existsSync(resources.model);
}

async function createDepthMap(imagePath: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (!depthModelAvailable()) {
    throw new Error("Depth Anything V2 ist in diesem Build nicht enthalten. Bitte installiere die aktuelle Release-Version.");
  }
  const directory = await mkdtemp(join(tmpdir(), "ai-print-depth-"));
  const output = join(directory, "depth.png");
  const resources = depthResources();
  await execFileAsync(resources.worker, [resources.model, imagePath, output], { timeout: 120_000, maxBuffer: 1024 * 1024 });
  return { path: output, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

async function readSettings(): Promise<StoredSettings> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as StoredSettings;
  } catch {
    return migrateLegacySettings();
  }
}

async function writeSettings(settings: StoredSettings): Promise<void> {
  const directory = join(settingsRoot(), settingsDirectoryName);
  const target = settingsFile();
  const temporary = `${target}.tmp`;
  await mkdir(directory, { recursive: true });
  settings.schemaVersion = 1;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

async function migrateLegacySettings(): Promise<StoredSettings> {
  const candidates = [
    join(app.getPath("userData"), "settings.json"),
    join(app.getPath("appData"), "ai-print-studio", "settings.json"),
    join(app.getPath("appData"), "AI Print Studio", "settings.json")
  ];
  for (const candidate of new Set(candidates)) {
    if (candidate === settingsFile()) continue;
    try {
      const settings = JSON.parse(await readFile(candidate, "utf8")) as StoredSettings;
      await writeSettings(settings);
      return settings;
    } catch {
      // Fehlende oder ungültige Altdateien werden übersprungen.
    }
  }
  return {};
}

function hasUsableOpenAiKey(settings: StoredSettings): boolean {
  if (!settings.encryptedOpenAiKey || !safeStorage.isEncryptionAvailable()) return false;
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(settings.encryptedOpenAiKey, "base64"));
    return /^sk-[A-Za-z0-9_-]{20,}$/.test(decrypted);
  } catch {
    return false;
  }
}

function createWindow(): void {
  const preloadPath = join(currentDirectory, "../electron/preload.cjs");
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#090b10",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (app.isPackaged) {
    void window.loadFile(join(currentDirectory, "../dist/index.html"));
  } else {
    void window.loadURL(developmentUrl);
  }

  if (process.argv.includes("--smoke-test")) {
    window.webContents.once("did-finish-load", () => {
      void window.webContents.executeJavaScript(
        `(async () => {
          const bridge = typeof window.desktop === "object";
          const selectImage = typeof window.desktop?.selectImage === "function";
          const saveOpenAiKey = typeof window.desktop?.saveOpenAiKey === "function";
          let settingsPersisted = false;
          if (saveOpenAiKey) {
            await window.desktop.saveOpenAiKey("sk-test_abcdefghijklmnopqrstuvwxyz0123456789");
            settingsPersisted = (await window.desktop.getSettingsStatus()).openAiConfigured;
          }
          return JSON.stringify({ bridge, selectImage, saveOpenAiKey, settingsPersisted });
        })()`
      ).then((result: string) => {
        console.log(`SMOKE_RESULT:${result}`);
        const parsed = JSON.parse(result) as { bridge: boolean; selectImage: boolean; saveOpenAiKey: boolean; settingsPersisted: boolean };
        app.exit(parsed.bridge && parsed.selectImage && parsed.saveOpenAiKey && parsed.settingsPersisted ? 0 : 1);
      }).catch((error: unknown) => {
        console.error("SMOKE_ERROR", error);
        app.exit(1);
      });
    });
  }
}

app.whenReady().then(async () => {
  if (!(await ensureApplicationLocation())) return;
  nativeTheme.themeSource = "dark";
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:checkUpdate", async () => {
    const response = await fetch("https://api.github.com/repos/Schello805/aiprintstudio/releases/latest", {
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
      currentVersion: app.getVersion(),
      latestVersion,
      available: Boolean(latestVersion && isNewerVersion(latestVersion, app.getVersion())),
      url: dmg?.browser_download_url ?? release.html_url ?? "https://github.com/Schello805/aiprintstudio/releases",
      directDownload: Boolean(dmg?.browser_download_url)
    };
  });
  ipcMain.handle("settings:status", async () => {
    const settings = await readSettings();
    return {
      openAiConfigured: hasUsableOpenAiKey(settings),
      modelSetupAccepted: Boolean(settings.modelSetupAccepted),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      storageVersion: settings.schemaVersion ?? 0
      ,depthModelAvailable: depthModelAvailable()
    };
  });
  ipcMain.handle("settings:saveOpenAiKey", async (_event, apiKey: string) => {
    const normalized = apiKey.trim();
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(normalized)) {
      throw new Error("Der API-Schlüssel hat kein gültiges OpenAI-Format.");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Die sichere macOS-Schlüsselverschlüsselung ist nicht verfügbar.");
    }
    const settings = await readSettings();
    settings.encryptedOpenAiKey = safeStorage.encryptString(normalized).toString("base64");
    await writeSettings(settings);
    const persisted = await readSettings();
    if (!hasUsableOpenAiKey(persisted)) {
      throw new Error("Der Schlüssel konnte nach dem Speichern nicht wieder sicher gelesen werden.");
    }
  });
  ipcMain.handle("settings:removeOpenAiKey", async () => {
    const settings = await readSettings();
    delete settings.encryptedOpenAiKey;
    await writeSettings(settings);
  });
  ipcMain.handle("settings:acceptModelSetup", async () => {
    const settings = await readSettings();
    settings.modelSetupAccepted = true;
    await writeSettings(settings);
  });
  ipcMain.handle("image:select", async () => {
    const result = await dialog.showOpenDialog({
      title: "Bild für das 3D-Modell auswählen",
      properties: ["openFile"],
      filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "webp"] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new Error("Das ausgewählte Bild konnte nicht gelesen werden. Prüfe die Dateiberechtigungen.");
    }
    if (bytes.length === 0) throw new Error("Die ausgewählte Bilddatei ist leer.");
    if (bytes.length > 25 * 1024 * 1024) throw new Error("Das Bild ist größer als 25 MB. Bitte verkleinere es zuerst.");
    let metadata: Metadata;
    try {
      metadata = await sharp(bytes).metadata();
    } catch {
      throw new Error("Die Datei ist kein lesbares PNG-, JPG- oder WEBP-Bild oder sie ist beschädigt.");
    }
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) {
      throw new Error(`Das Bildformat „${metadata.format ?? "unbekannt"}“ wird nicht unterstützt. Erlaubt sind PNG, JPG und WEBP.`);
    }
    if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32) {
      throw new Error("Das Bild muss mindestens 32 × 32 Pixel groß sein.");
    }
    if (metadata.width * metadata.height > 40_000_000) {
      throw new Error("Das Bild besitzt zu viele Pixel. Bitte verwende höchstens etwa 40 Megapixel.");
    }
    const { data: sample } = await sharp(bytes)
      .rotate()
      .resize(64, 64, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const quantizedColors = new Set<string>();
    for (let offset = 0; offset < sample.length; offset += 3) {
      quantizedColors.add(`${sample[offset] >> 5}:${sample[offset + 1] >> 5}:${sample[offset + 2] >> 5}`);
    }
    const suggestedProfile = quantizedColors.size <= 160 ? "logo" : "photo";
    const extension = path.toLowerCase().split(".").pop();
    const mime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    return {
      path,
      name: basename(path),
      size: bytes.length,
      width: metadata.width,
      height: metadata.height,
      suggestedProfile,
      dataUrl: `data:${mime};base64,${bytes.toString("base64")}`
    };
  });
  ipcMain.handle("objectCapture:create", async () => {
    const selection = await dialog.showOpenDialog({
      title: "Fotoserie für den 3D-Scan auswählen",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Fotos", extensions: ["png", "jpg", "jpeg", "heic", "webp"] }]
    });
    if (selection.canceled) return null;
    if (selection.filePaths.length < 12) throw new Error("Für einen stabilen 3D-Scan werden mindestens 12 Fotos benötigt.");
    if (selection.filePaths.length > 300) throw new Error("Bitte verwende höchstens 300 Fotos pro Scan.");
    const resources = depthResources();
    if (!existsSync(resources.objectCaptureWorker)) throw new Error("Object Capture ist in diesem Build nicht enthalten.");
    const workspace = await mkdtemp(join(tmpdir(), "ai-print-capture-"));
    const images = join(workspace, "images");
    await mkdir(images);
    try {
      await Promise.all(selection.filePaths.map((source, index) =>
        copyFile(source, join(images, `${String(index).padStart(4, "0")}-${basename(source)}`))
      ));
      const outputDirectory = join(app.getPath("downloads"), "AI Print Studio");
      await mkdir(outputDirectory, { recursive: true });
      const output = join(outputDirectory, `object-capture-${Date.now()}.usdz`);
      await execFileAsync(resources.objectCaptureWorker, [images, output], { timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024 });
      return { usdzPath: output, photoCount: selection.filePaths.length };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
  ipcMain.handle("relief:create", async (_event, imagePath: string, options: Partial<ReliefOptions>) => {
    const outputDirectory = join(app.getPath("downloads"), "AI Print Studio");
    let depthMap: Awaited<ReturnType<typeof createDepthMap>> | undefined;
    try {
      if (options.processingMode === "depth") depthMap = await createDepthMap(imagePath);
      return await createRelief(imagePath, outputDirectory, options, depthMap?.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Exportfehler";
      throw new Error(`Das Relief konnte nicht unter „${outputDirectory}“ gespeichert werden: ${message}`);
    } finally {
      await depthMap?.cleanup();
    }
  });
  ipcMain.handle("shell:showItem", (_event, path: string) => shell.showItemInFolder(path));
  ipcMain.handle("shell:openExternal", (_event, url: string) => {
    const parsed = new URL(url);
    if (!["https:", "mailto:"].includes(parsed.protocol)) {
      throw new Error("Nicht unterstütztes Link-Protokoll");
    }
    return shell.openExternal(url);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
