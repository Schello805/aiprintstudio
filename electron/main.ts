import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir, totalmem } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import sharp, { type Metadata } from "sharp";
import type { ReliefOptions, ReliefProgress, ReliefResult } from "./relief.js";
import { exportFitsLimits, validateGeneratedExportBuffer } from "./export-validation.js";
import { renderTextImage, type TextImageOptions } from "./text-image.js";
import { buildCadPlanningRequest, encodeCadStl, validateCadPlan, type CadPlan } from "./cad.js";
import { checkSystemCompatibility } from "./system-check.js";
import { decryptApiKey, encryptApiKey, type EncryptedApiKey } from "./api-key-vault.js";
import { calculateAiCost, defaultOpenAiModel, estimateTokens, getOpenAiModel, listOpenAiModels, type OpenAiModelId } from "./openai-usage.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const execFileAsync = promisify(execFile);

type StoredSettings = {
  schemaVersion?: number;
  encryptedOpenAiKey?: string;
  openAiVault?: EncryptedApiKey;
  modelSetupAccepted?: boolean;
};

const settingsDirectoryName = "de.michaelschellenberger.aiprintstudio";
let sessionOpenAiKey: string | null = null;
const reliefJobs = new Map<string, { controller: AbortController; worker?: Worker }>();
const previewDirectoryName = "AI Print Studio Preview";

function previewDirectory(): string {
  return join(app.getPath("temp"), previewDirectoryName);
}

function isPreviewExportPath(path: string): boolean {
  const root = resolve(previewDirectory());
  const candidate = resolve(path);
  return candidate === root || candidate.startsWith(`${root}/`);
}
type Ai3dProgress = {
  phase: string;
  progress: number;
  estimatedCostEur: number;
  exactTokenUsage: boolean;
  inputTokens: number;
  outputTokens: number;
};

type Ai3dDiagnostic = {
  id: string;
  timestamp: string;
  stage: string;
  model: string;
  elapsedMs: number;
  message: string;
  technicalCause: string;
  logPath: string;
};

let lastAi3dDiagnostic: Ai3dDiagnostic | null = null;

function technicalError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    const details = cause as { code?: string; message?: string; errno?: string };
    return [details.code ?? details.errno, details.message].filter(Boolean).join(" · ") || error.message;
  }
  return error.message;
}

async function appendAi3dLog(entry: Record<string, unknown>): Promise<string> {
  const logDirectory = app.getPath("logs");
  await mkdir(logDirectory, { recursive: true });
  const path = join(logDirectory, "prompt-to-3d.log");
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  return path;
}

async function appendReliefLog(entry: Record<string, unknown>): Promise<string> {
  const logDirectory = app.getPath("logs");
  await mkdir(logDirectory, { recursive: true });
  const path = join(logDirectory, "relief.log");
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  return path;
}

function recoveryPath(): string {
  return join(app.getPath("userData"), "studio-recovery.json");
}

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
    model: join(root, "depth", "DepthAnythingV2SmallF16P6.mlmodelc")
  };
}

function depthModelAvailable(): boolean {
  const resources = depthResources();
  return existsSync(resources.worker) && existsSync(resources.model);
}

async function ensureCompatibleSystem(): Promise<boolean> {
  if (!app.isPackaged || process.argv.includes("--smoke-test")) return true;
  let freeDiskBytes = Number.POSITIVE_INFINITY;
  try {
    const disk = await statfs(app.getPath("downloads"));
    freeDiskBytes = disk.bavail * disk.bsize;
  } catch {
    // Ein nicht lesbarer Speicherwert soll den Start nicht verhindern.
  }
  const result = checkSystemCompatibility({
    platform: platform(),
    architecture: arch(),
    macOsVersion: process.getSystemVersion(),
    totalMemoryBytes: totalmem(),
    freeDiskBytes,
    depthModelAvailable: depthModelAvailable()
  });
  if (!result.supported) {
    dialog.showMessageBoxSync({
      type: "error",
      buttons: ["Beenden"],
      title: "Dieser Mac wird nicht unterstützt",
      message: "AI Print Studio kann auf diesem Mac nicht zuverlässig ausgeführt werden.",
      detail: `${result.errors.map((entry) => `• ${entry}`).join("\n")}\n\nSystemanforderungen: Apple Silicon, macOS 13 oder neuer, mindestens 8 GB RAM empfohlen.`
    });
    app.quit();
    return false;
  }
  if (result.warnings.length) {
    const choice = dialog.showMessageBoxSync({
      type: "warning",
      buttons: ["Trotzdem starten", "Beenden"],
      defaultId: 0,
      cancelId: 1,
      title: "Systemcheck mit Hinweisen",
      message: "AI Print Studio kann starten, aber einige Funktionen könnten eingeschränkt sein.",
      detail: result.warnings.map((entry) => `• ${entry}`).join("\n")
    });
    if (choice === 1) {
      app.quit();
      return false;
    }
  }
  return true;
}

async function createDepthMap(imagePath: string, signal?: AbortSignal): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (!depthModelAvailable()) {
    throw new Error("Depth Anything V2 ist in diesem Build nicht enthalten. Bitte installiere die aktuelle Release-Version.");
  }
  const directory = await mkdtemp(join(tmpdir(), "ai-print-depth-"));
  const output = join(directory, "depth.png");
  const resources = depthResources();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        resources.worker,
        [resources.model, imagePath, output],
        { timeout: 120_000, maxBuffer: 1024 * 1024 },
        (error) => error ? reject(error) : resolve()
      );
      const abort = () => {
        child.kill("SIGTERM");
        reject(new Error("Vorgang abgebrochen."));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
      child.once("exit", () => signal?.removeEventListener("abort", abort));
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
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
  settings.schemaVersion = 2;
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

async function removeLegacyStoredOpenAiKey(): Promise<void> {
  const settings = await readSettings();
  if (!settings.encryptedOpenAiKey) return;
  delete settings.encryptedOpenAiKey;
  await writeSettings(settings);
}

async function createPrintableCadPlan(
  prompt: string,
  existingPlan?: CadPlan,
  modelId: OpenAiModelId = defaultOpenAiModel,
  onProgress: (progress: Ai3dProgress) => void = () => undefined
) {
  const selectedModel = getOpenAiModel(modelId);
  const apiKey = sessionOpenAiKey;
  if (!apiKey) {
    const settings = await readSettings();
    if (settings.openAiVault) {
      throw new Error("Dein OpenAI API-Schlüssel ist gespeichert, aber für diese App-Sitzung noch gesperrt. Entsperre ihn mit deinem AI-Print-Studio-Passwort.");
    }
    throw new Error("Es ist noch kein OpenAI API-Schlüssel gespeichert. Richte ihn zuerst in den Einstellungen ein.");
  }
  const primitiveSchema = {
    type: "object",
    additionalProperties: false,
    required: ["type", "name", "position", "size", "rotation"],
    properties: {
      type: { type: "string", enum: ["box", "cylinder", "roof", "leaf"] },
      name: { type: "string" },
      position: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } },
      size: { type: "array", minItems: 3, maxItems: 3, items: { type: "number", minimum: 1.2, maximum: 300 } },
      rotation: { type: "array", minItems: 3, maxItems: 3, items: { type: "number", minimum: -360, maximum: 360 } }
    }
  };
  const planningInput = buildCadPlanningRequest(prompt, existingPlan);
  const estimatedInputTokens = estimateTokens(JSON.stringify(planningInput));
  onProgress({
    phase: "Sichere Verbindung wird aufgebaut",
    progress: 8,
    estimatedCostEur: calculateAiCost(modelId, estimatedInputTokens, 0),
    exactTokenUsage: false,
    inputTokens: estimatedInputTokens,
    outputTokens: 0
  });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel.id,
      reasoning: { effort: "medium" },
      input: planningInput,
      stream: true,
      text: {
        format: {
          type: "json_schema",
          name: "printable_cad_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "widthMm", "depthMm", "heightMm", "primitives"],
            properties: {
              title: { type: "string" },
              widthMm: { type: "number", minimum: 5, maximum: 300 },
              depthMm: { type: "number", minimum: 5, maximum: 300 },
              heightMm: { type: "number", minimum: 5, maximum: 300 },
              primitives: { type: "array", minItems: 1, maxItems: 80, items: primitiveSchema }
            }
          }
        }
      }
    })
  });
  if (!response.ok) throw new Error(`OpenAI konnte den CAD-Bauplan nicht erzeugen (${response.status}). Prüfe API-Key und Guthaben.`);
  if (!response.body) throw new Error("OpenAI hat keinen lesbaren Antwortstrom geliefert.");
  onProgress({
    phase: "OpenAI konstruiert den CAD-Bauplan",
    progress: 24,
    estimatedCostEur: calculateAiCost(modelId, estimatedInputTokens, 0),
    exactTokenUsage: false,
    inputTokens: estimatedInputTokens,
    outputTokens: 0
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let usage = { inputTokens: estimatedInputTokens, outputTokens: 0, cachedTokens: 0 };
  let completedResponse: {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  } | undefined;
  const processEvent = (payload: string) => {
    if (!payload || payload === "[DONE]") return;
    const event = JSON.parse(payload) as {
      type?: string;
      delta?: string;
      response?: typeof completedResponse;
      error?: { message?: string };
    };
    if (event.type === "response.output_text.delta" && event.delta) {
      output += event.delta;
      usage.outputTokens = Math.max(usage.outputTokens, estimateTokens(output));
      onProgress({
        phase: "CAD-Bauteile werden ausgearbeitet",
        progress: Math.min(86, 30 + Math.round(usage.outputTokens / 18)),
        estimatedCostEur: calculateAiCost(modelId, usage.inputTokens, usage.outputTokens),
        exactTokenUsage: false,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      });
    } else if (event.type === "response.completed" && event.response) {
      completedResponse = event.response;
      usage = {
        inputTokens: event.response.usage?.input_tokens ?? usage.inputTokens,
        outputTokens: event.response.usage?.output_tokens ?? usage.outputTokens,
        cachedTokens: event.response.usage?.input_tokens_details?.cached_tokens ?? 0
      };
    } else if (event.type === "error" || event.type === "response.failed") {
      throw new Error(event.error?.message ?? "OpenAI konnte den CAD-Bauplan nicht erzeugen.");
    }
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
      processEvent(data);
    }
  }
  if (buffer.trim()) {
    const data = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
    processEvent(data);
  }
  output ||= completedResponse?.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
  if (!output) throw new Error("OpenAI hat keinen CAD-Bauplan zurückgegeben.");
  onProgress({
    phase: "Bauplan validieren und STL lokal erzeugen",
    progress: 94,
    estimatedCostEur: calculateAiCost(modelId, usage.inputTokens, usage.outputTokens, usage.cachedTokens),
    exactTokenUsage: true,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });
  return {
    plan: validateCadPlan(JSON.parse(output)),
    billing: {
      model: selectedModel.id,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      estimatedCostEur: calculateAiCost(modelId, usage.inputTokens, usage.outputTokens, usage.cachedTokens)
    }
  };
}

function createWindow(): void {
  const preloadPath = join(currentDirectory, "../electron/preload.cjs");
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
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
          const saveGeneratedFile = typeof window.desktop?.saveGeneratedFile === "function";
          let sessionKeyActive = false;
          if (saveOpenAiKey) {
            await window.desktop.saveOpenAiKey("sk-test_abcdefghijklmnopqrstuvwxyz0123456789", "smoke-test-passwort");
            sessionKeyActive = (await window.desktop.getSettingsStatus()).openAiConfigured;
          }
          return JSON.stringify({ bridge, selectImage, saveOpenAiKey, saveGeneratedFile, sessionKeyActive });
        })()`
      ).then((result: string) => {
        console.log(`SMOKE_RESULT:${result}`);
        const parsed = JSON.parse(result) as { bridge: boolean; selectImage: boolean; saveOpenAiKey: boolean; saveGeneratedFile: boolean; sessionKeyActive: boolean };
        app.exit(parsed.bridge && parsed.selectImage && parsed.saveOpenAiKey && parsed.saveGeneratedFile && parsed.sessionKeyActive ? 0 : 1);
      }).catch((error: unknown) => {
        console.error("SMOKE_ERROR", error);
        app.exit(1);
      });
    });
  }
}

app.whenReady().then(async () => {
  if (!(await ensureCompatibleSystem())) return;
  if (!(await ensureApplicationLocation())) return;
  await rm(previewDirectory(), { recursive: true, force: true });
  await mkdir(previewDirectory(), { recursive: true });
  await removeLegacyStoredOpenAiKey();
  // Frühere Versionen konnten ein optionales Modell laden, dessen öffentliche
  // Lizenz die Nutzung in der EU ausschließt. Das Update entfernt diese
  // Gewichte einschließlich abgebrochener Downloads automatisch.
  await rm(join(app.getPath("userData"), "models", "hunyuan3d-mlx-shape-small"), { recursive: true, force: true });
  nativeTheme.themeSource = "dark";
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:metrics", async () => {
    const metrics = app.getAppMetrics();
    let freeStorageBytes = 0;
    let totalStorageBytes = 0;
    try {
      const storage = await statfs(app.getPath("userData"));
      freeStorageBytes = storage.bavail * storage.bsize;
      totalStorageBytes = storage.blocks * storage.bsize;
    } catch {
      // CPU und RAM bleiben auch dann sichtbar, wenn macOS den Speicherwert nicht liefert.
    }
    return {
      cpuPercent: metrics.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0),
      ramMb: metrics.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024,
      totalMemoryMb: totalmem() / 1024 / 1024,
      processCount: metrics.length,
      freeStorageBytes,
      totalStorageBytes
    };
  });
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
      openAiConfigured: Boolean(sessionOpenAiKey),
      openAiStored: Boolean(settings.openAiVault),
      modelSetupAccepted: Boolean(settings.modelSetupAccepted),
      storageVersion: settings.schemaVersion ?? 0
      ,depthModelAvailable: depthModelAvailable()
    };
  });
  ipcMain.handle("settings:saveOpenAiKey", async (_event, apiKey: string, password: string) => {
    const normalized = apiKey.trim();
    const vault = await encryptApiKey(normalized, password);
    const settings = await readSettings();
    settings.openAiVault = vault;
    await writeSettings(settings);
    sessionOpenAiKey = normalized;
  });
  ipcMain.handle("settings:unlockOpenAiKey", async (_event, password: string) => {
    const settings = await readSettings();
    if (!settings.openAiVault) throw new Error("Es ist kein verschlüsselter OpenAI-Schlüssel gespeichert.");
    sessionOpenAiKey = await decryptApiKey(settings.openAiVault, password);
  });
  ipcMain.handle("settings:removeOpenAiKey", async () => {
    sessionOpenAiKey = null;
    const settings = await readSettings();
    delete settings.openAiVault;
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
      filters: [{ name: "Bilder und Vektorgrafiken", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }]
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
      throw new Error("Die Datei ist kein lesbares PNG-, JPG-, WEBP- oder SVG-Bild oder sie ist beschädigt.");
    }
    if (!["png", "jpeg", "webp", "svg"].includes(metadata.format ?? "")) {
      throw new Error(`Das Bildformat „${metadata.format ?? "unbekannt"}“ wird nicht unterstützt. Erlaubt sind PNG, JPG, WEBP und SVG.`);
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
    const previewBytes = extension === "svg" ? await sharp(bytes).png().toBuffer() : bytes;
    const mime = extension === "png" || extension === "svg" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    return {
      path,
      name: basename(path),
      size: bytes.length,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format === "svg" ? "svg" : metadata.format === "jpeg" ? "jpg" : metadata.format,
      suggestedProfile,
      dataUrl: `data:${mime};base64,${previewBytes.toString("base64")}`
    };
  });
  ipcMain.handle("project:save", async (_event, project: unknown) => {
    const serialized = JSON.stringify(project, null, 2);
    if (serialized.length > 35 * 1024 * 1024) throw new Error("Das Projekt ist größer als 35 MB.");
    const parsed = JSON.parse(serialized) as { schemaVersion?: number; source?: { name?: string }; settings?: unknown };
    if (parsed.schemaVersion !== 1 || !parsed.source?.name || !parsed.settings || typeof parsed.settings !== "object") {
      throw new Error("Der Projektstand ist unvollständig.");
    }
    const suggested = `${parsed.source.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "-") || "AI-Print-Projekt"}.aips`;
    const result = await dialog.showSaveDialog({
      title: "AI-Print-Studio-Projekt speichern",
      defaultPath: join(app.getPath("documents"), suggested),
      filters: [{ name: "AI Print Studio Projekt", extensions: ["aips"] }]
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, serialized, "utf8");
    return result.filePath;
  });
  ipcMain.handle("project:open", async () => {
    const result = await dialog.showOpenDialog({
      title: "AI-Print-Studio-Projekt öffnen",
      properties: ["openFile"],
      filters: [{ name: "AI Print Studio Projekt", extensions: ["aips"] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const bytes = await readFile(result.filePaths[0]);
    if (!bytes.length || bytes.length > 35 * 1024 * 1024) throw new Error("Die Projektdatei ist leer oder zu groß.");
    const project = JSON.parse(bytes.toString("utf8")) as {
      schemaVersion?: number;
      source?: { name?: string; dataUrl?: string; path?: string };
      settings?: unknown;
      tool?: string;
    };
    if (
      project.schemaVersion !== 1 ||
      !project.source?.name ||
      !project.settings ||
      typeof project.settings !== "object" ||
      !["image", "text"].includes(project.tool ?? "") ||
      !/^data:image\/[a-z+.-]+;base64,/.test(project.source.dataUrl ?? "")
    ) {
      throw new Error("Die Datei ist kein gültiges AI-Print-Studio-Projekt.");
    }
    const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(project.source.dataUrl ?? "");
    if (!match) throw new Error("Das eingebettete Projektbild ist ungültig.");
    const directory = join(app.getPath("temp"), "AI Print Studio Projects");
    await mkdir(directory, { recursive: true });
    const extension = project.source.dataUrl?.startsWith("data:image/png") ? "png" : "jpg";
    const restoredPath = join(directory, `project-${Date.now()}.${extension}`);
    await writeFile(restoredPath, Buffer.from(match[1], "base64"));
    project.source.path = restoredPath;
    return project;
  });
  ipcMain.handle("recovery:save", async (_event, project: unknown) => {
    const serialized = JSON.stringify(project);
    if (serialized.length > 35 * 1024 * 1024) throw new Error("Der Wiederherstellungsstand ist größer als 35 MB.");
    const parsed = JSON.parse(serialized) as { schemaVersion?: number; source?: { name?: string }; settings?: unknown; tool?: string };
    if (parsed.schemaVersion !== 1 || !parsed.source?.name || !parsed.settings || !["image", "text", "lithophane"].includes(parsed.tool ?? "")) {
      throw new Error("Der Wiederherstellungsstand ist unvollständig.");
    }
    await mkdir(dirname(recoveryPath()), { recursive: true });
    const temporary = `${recoveryPath()}.tmp`;
    await writeFile(temporary, serialized, "utf8");
    await rename(temporary, recoveryPath());
  });
  ipcMain.handle("recovery:get", async () => {
    if (!existsSync(recoveryPath())) return null;
    try {
      const bytes = await readFile(recoveryPath());
      if (!bytes.length || bytes.length > 35 * 1024 * 1024) return null;
      const project = JSON.parse(bytes.toString("utf8")) as {
        schemaVersion?: number; savedAt?: string; source?: { name?: string; dataUrl?: string; path?: string }; settings?: unknown; tool?: string;
      };
      if (project.schemaVersion !== 1 || !project.source?.name || !project.settings || !["image", "text", "lithophane"].includes(project.tool ?? "")) return null;
      const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(project.source.dataUrl ?? "");
      if (!match) return null;
      const directory = join(app.getPath("temp"), "AI Print Studio Recovery");
      await mkdir(directory, { recursive: true });
      const extension = project.source.dataUrl?.startsWith("data:image/png") ? "png" : "jpg";
      const restoredPath = join(directory, `recovery-${Date.now()}.${extension}`);
      await writeFile(restoredPath, Buffer.from(match[1], "base64"));
      project.source.path = restoredPath;
      return project;
    } catch {
      return null;
    }
  });
  ipcMain.handle("recovery:clear", async () => rm(recoveryPath(), { force: true }));
  ipcMain.handle("diagnostics:showLogs", async () => {
    const directory = app.getPath("logs");
    await mkdir(directory, { recursive: true });
    return shell.openPath(directory);
  });
  ipcMain.handle("text:createImage", async (_event, options: TextImageOptions) => {
    const { png, text, width, height } = await renderTextImage(options);
    const directory = join(app.getPath("temp"), "AI Print Studio Text");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `text-${Date.now()}.png`);
    await writeFile(path, png);
    return {
      path,
      name: `${text.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "").slice(0, 48) || "Text"}.png`,
      size: png.length,
      width,
      height,
      suggestedProfile: "logo" as const,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`
    };
  });
  ipcMain.handle("ai3d:models", () => listOpenAiModels());
  ipcMain.handle("ai3d:lastDiagnostic", () => lastAi3dDiagnostic);
  ipcMain.handle("ai3d:create", async (event, promptValue: string, existingPlanValue?: unknown, modelValue?: string) => {
    const prompt = promptValue.trim();
    if (prompt.length < (existingPlanValue ? 3 : 10) || prompt.length > 800) {
      throw new Error(existingPlanValue ? "Die Folgeanweisung muss 3 bis 800 Zeichen enthalten." : "Beschreibe das Objekt bitte mit 10 bis 800 Zeichen.");
    }
    const existingPlan = existingPlanValue ? validateCadPlan(existingPlanValue) : undefined;
    const selectedModel = getOpenAiModel(modelValue || defaultOpenAiModel);
    const startedAt = Date.now();
    const diagnosticId = `AI3D-${startedAt.toString(36).toUpperCase()}`;
    let stage = "Anfrage vorbereiten";
    lastAi3dDiagnostic = null;
    await appendAi3dLog({
      timestamp: new Date(startedAt).toISOString(),
      id: diagnosticId,
      event: "started",
      model: selectedModel.id,
      promptLength: prompt.length,
      revision: Boolean(existingPlan)
    });
    try {
      const { plan, billing } = await createPrintableCadPlan(prompt, existingPlan, selectedModel.id, (progress) => {
        stage = progress.phase;
        if (!event.sender.isDestroyed()) event.sender.send("ai3d:progress", progress);
      });
      const outputDirectory = join(previewDirectory(), "prompt");
      await mkdir(outputDirectory, { recursive: true });
      const stlPath = join(outputDirectory, `ki-${Date.now()}.stl`);
      await writeFile(stlPath, encodeCadStl(plan));
      if (!event.sender.isDestroyed()) {
        event.sender.send("ai3d:progress", {
          phase: "Fertig",
          progress: 100,
          estimatedCostEur: billing.estimatedCostEur,
          exactTokenUsage: true,
          inputTokens: billing.inputTokens,
          outputTokens: billing.outputTokens
        } satisfies Ai3dProgress);
      }
      await appendAi3dLog({
        timestamp: new Date().toISOString(),
        id: diagnosticId,
        event: "completed",
        model: selectedModel.id,
        elapsedMs: Date.now() - startedAt,
        inputTokens: billing.inputTokens,
        outputTokens: billing.outputTokens,
        cachedTokens: billing.cachedTokens
      });
      return { stlPath, plan, billing };
    } catch (error) {
      const technicalCause = technicalError(error);
      const logPath = await appendAi3dLog({
        timestamp: new Date().toISOString(),
        id: diagnosticId,
        event: "failed",
        model: selectedModel.id,
        stage,
        elapsedMs: Date.now() - startedAt,
        errorType: error instanceof Error ? error.name : typeof error,
        technicalCause
      });
      lastAi3dDiagnostic = {
        id: diagnosticId,
        timestamp: new Date().toISOString(),
        stage,
        model: selectedModel.id,
        elapsedMs: Date.now() - startedAt,
        message: (error instanceof Error && error.message === "fetch failed") || technicalCause.includes("fetch failed")
          ? "Die Verbindung zu OpenAI wurde unterbrochen oder konnte nicht aufgebaut werden."
          : error instanceof Error ? error.message : "Die Erstellung ist fehlgeschlagen.",
        technicalCause,
        logPath
      };
      throw new Error(`${lastAi3dDiagnostic.message} Diagnose-ID: ${diagnosticId}`);
    }
  });
  ipcMain.handle("relief:cancel", async (_event, jobId: string) => {
    const job = reliefJobs.get(jobId);
    if (!job) return false;
    job.controller.abort();
    await job.worker?.terminate();
    reliefJobs.delete(jobId);
    return true;
  });
  ipcMain.handle("relief:create", async (event, jobId: string, imagePath: string, options: Partial<ReliefOptions>) => {
    if (!/^[a-f0-9-]{20,64}$/i.test(jobId)) throw new Error("Ungültige Job-ID.");
    if (reliefJobs.has(jobId)) throw new Error("Dieser Relief-Job läuft bereits.");
    const outputDirectory = join(previewDirectory(), "relief", jobId);
    let depthMap: Awaited<ReturnType<typeof createDepthMap>> | undefined;
    const controller = new AbortController();
    const job: { controller: AbortController; worker?: Worker } = { controller };
    reliefJobs.set(jobId, job);
    try {
      let mapPath: string | undefined;
      if (options.processingMode === "depth") {
        if (!event.sender.isDestroyed()) {
          event.sender.send("relief:progress", jobId, {
            phase: "KI-Tiefe analysieren",
            detail: "Depth Anything V2 berechnet lokal die räumliche Tiefe …",
            progress: 10
          } satisfies ReliefProgress);
        }
        depthMap = await createDepthMap(imagePath, controller.signal);
        mapPath = depthMap.path;
      }
      if (controller.signal.aborted) throw new Error("Vorgang abgebrochen.");
      const worker = new Worker(new URL("./relief-worker.js", import.meta.url));
      job.worker = worker;
      return await new Promise<ReliefResult>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          callback();
          void worker.terminate();
        };
        worker.on("message", (message: {
          type: "progress" | "result" | "error";
          progress?: ReliefProgress;
          result?: ReliefResult;
          message?: string;
        }) => {
          if (message.type === "progress" && message.progress) {
            if (!event.sender.isDestroyed()) event.sender.send("relief:progress", jobId, message.progress);
          } else if (message.type === "result" && message.result) {
            finish(() => resolve(message.result as ReliefResult));
          } else if (message.type === "error") {
            finish(() => reject(new Error(message.message ?? "Unbekannter Worker-Fehler")));
          }
        });
        worker.once("error", (error) => finish(() => reject(error)));
        worker.once("exit", (code) => {
          if (!settled) {
            finish(() => reject(new Error(controller.signal.aborted
              ? "Vorgang abgebrochen."
              : `Relief-Worker wurde unerwartet beendet (${code}).`)));
          }
        });
        worker.postMessage({
          imagePath,
          outputDirectory,
          options,
          depthMapPath: mapPath
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Exportfehler";
      const diagnosticId = `RELIEF-${Date.now().toString(36).toUpperCase()}`;
      await appendReliefLog({
        timestamp: new Date().toISOString(), id: diagnosticId, event: "failed",
        mode: options.processingMode ?? "auto", profile: options.profile ?? "balanced",
        imageExtension: extname(imagePath).toLowerCase(), technicalCause: technicalError(error)
      }).catch(() => undefined);
      throw new Error(`Die Relief-Vorschau konnte nicht erstellt werden: ${message} Diagnose-ID: ${diagnosticId}`);
    } finally {
      if (reliefJobs.get(jobId) === job) reliefJobs.delete(jobId);
      await job.worker?.terminate();
      await depthMap?.cleanup();
    }
  });
  ipcMain.handle("export:save", async (event, sourcePath: string) => {
    if (typeof sourcePath !== "string" || !isPreviewExportPath(sourcePath)) {
      throw new Error("Diese Vorschaudatei darf nicht exportiert werden.");
    }
    const extension = extname(sourcePath).toLowerCase();
    if (![".stl", ".3mf"].includes(extension)) {
      throw new Error("Nur STL- und 3MF-Dateien können gespeichert werden.");
    }
    const sourceBytes = await readFile(sourcePath);
    const validation = await validateGeneratedExportBuffer(extension as ".stl" | ".3mf", sourceBytes);
    if (!validation.valid) {
      throw new Error(`Die Vorschaudatei ist beschädigt und wird nicht gespeichert: ${validation.errors.join(" ")}`);
    }
    if (!exportFitsLimits(validation, sourceBytes.length)) {
      throw new Error("Die Datei überschreitet das Exportlimit von 250.000 Dreiecken oder 25 MB.");
    }
    const options = {
      title: extension === ".3mf" ? "3MF speichern" : "STL speichern",
      defaultPath: join(app.getPath("downloads"), basename(sourcePath)),
      filters: extension === ".3mf"
        ? [{ name: "3MF-Modell", extensions: ["3mf"] }]
        : [{ name: "STL-Modell", extensions: ["stl"] }]
    };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const selection = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);
    if (selection.canceled || !selection.filePath) return null;
    await copyFile(sourcePath, selection.filePath);
    return selection.filePath;
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
