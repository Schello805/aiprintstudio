import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRelief, type ReliefOptions } from "./relief.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

type StoredSettings = {
  encryptedOpenAiKey?: string;
  modelSetupAccepted?: boolean;
};

function settingsFile(): string {
  return join(app.getPath("userData"), "settings.json");
}

async function readSettings(): Promise<StoredSettings> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as StoredSettings;
  } catch {
    return {};
  }
}

async function writeSettings(settings: StoredSettings): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsFile(), `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#090b10",
    webPreferences: {
      preload: join(currentDirectory, "preload.js"),
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
}

app.whenReady().then(() => {
  nativeTheme.themeSource = "dark";
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("settings:status", async () => {
    const settings = await readSettings();
    return {
      openAiConfigured: Boolean(settings.encryptedOpenAiKey),
      modelSetupAccepted: Boolean(settings.modelSetupAccepted),
      encryptionAvailable: safeStorage.isEncryptionAvailable()
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
    const bytes = await readFile(path);
    if (bytes.length > 25 * 1024 * 1024) throw new Error("Das Bild darf höchstens 25 MB groß sein.");
    const extension = path.toLowerCase().split(".").pop();
    const mime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    return { path, name: basename(path), size: bytes.length, dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
  });
  ipcMain.handle("relief:create", async (_event, imagePath: string, options: Partial<ReliefOptions>) => {
    const directory = await dialog.showOpenDialog({
      title: "Ordner für STL und 3MF auswählen",
      buttonLabel: "Hier speichern",
      properties: ["openDirectory", "createDirectory"]
    });
    if (directory.canceled || !directory.filePaths[0]) return null;
    return createRelief(imagePath, directory.filePaths[0], options);
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
