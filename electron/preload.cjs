const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", Object.freeze({
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  getSettingsStatus: () => ipcRenderer.invoke("settings:status"),
  saveOpenAiKey: (apiKey) => ipcRenderer.invoke("settings:saveOpenAiKey", apiKey),
  removeOpenAiKey: () => ipcRenderer.invoke("settings:removeOpenAiKey"),
  acceptModelSetup: () => ipcRenderer.invoke("settings:acceptModelSetup"),
  selectImage: () => ipcRenderer.invoke("image:select"),
  createRelief: (imagePath, options) => ipcRenderer.invoke("relief:create", imagePath, options),
  showItemInFolder: (path) => ipcRenderer.invoke("shell:showItem", path),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url)
}));
