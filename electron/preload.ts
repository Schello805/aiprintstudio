import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getSettingsStatus: () => ipcRenderer.invoke("settings:status"),
  saveOpenAiKey: (apiKey: string): Promise<void> => ipcRenderer.invoke("settings:saveOpenAiKey", apiKey),
  removeOpenAiKey: (): Promise<void> => ipcRenderer.invoke("settings:removeOpenAiKey"),
  acceptModelSetup: (): Promise<void> => ipcRenderer.invoke("settings:acceptModelSetup"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url)
});
