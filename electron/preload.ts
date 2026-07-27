import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getSettingsStatus: () => ipcRenderer.invoke("settings:status"),
  saveOpenAiKey: (apiKey: string): Promise<void> => ipcRenderer.invoke("settings:saveOpenAiKey", apiKey),
  removeOpenAiKey: (): Promise<void> => ipcRenderer.invoke("settings:removeOpenAiKey"),
  acceptModelSetup: (): Promise<void> => ipcRenderer.invoke("settings:acceptModelSetup"),
  selectImage: () => ipcRenderer.invoke("image:select"),
  createRelief: (imagePath: string, options: unknown) => ipcRenderer.invoke("relief:create", imagePath, options),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke("shell:showItem", path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url)
});
