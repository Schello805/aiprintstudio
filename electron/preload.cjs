const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", Object.freeze({
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  getSettingsStatus: () => ipcRenderer.invoke("settings:status"),
  saveOpenAiKey: (apiKey) => ipcRenderer.invoke("settings:saveOpenAiKey", apiKey),
  removeOpenAiKey: () => ipcRenderer.invoke("settings:removeOpenAiKey"),
  saveMeshyKey: (apiKey) => ipcRenderer.invoke("settings:saveMeshyKey", apiKey),
  removeMeshyKey: () => ipcRenderer.invoke("settings:removeMeshyKey"),
  acceptModelSetup: () => ipcRenderer.invoke("settings:acceptModelSetup"),
  selectImage: () => ipcRenderer.invoke("image:select"),
  createTextImage: (options) => ipcRenderer.invoke("text:createImage", options),
  createAi3d: (prompt) => ipcRenderer.invoke("ai3d:create", prompt),
  createObjectCapture: () => ipcRenderer.invoke("objectCapture:create"),
  createRelief: (imagePath, options, editorHeightmapDataUrl, editorColorMapDataUrl) => ipcRenderer.invoke("relief:create", imagePath, options, editorHeightmapDataUrl, editorColorMapDataUrl),
  showItemInFolder: (path) => ipcRenderer.invoke("shell:showItem", path),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url)
}));
