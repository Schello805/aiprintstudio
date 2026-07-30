const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", Object.freeze({
  getVersion: () => ipcRenderer.invoke("app:version"),
  getAppMetrics: () => ipcRenderer.invoke("app:metrics"),
  checkForUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  getSettingsStatus: () => ipcRenderer.invoke("settings:status"),
  saveOpenAiKey: (apiKey, password) => ipcRenderer.invoke("settings:saveOpenAiKey", apiKey, password),
  unlockOpenAiKey: (password) => ipcRenderer.invoke("settings:unlockOpenAiKey", password),
  removeOpenAiKey: () => ipcRenderer.invoke("settings:removeOpenAiKey"),
  acceptModelSetup: () => ipcRenderer.invoke("settings:acceptModelSetup"),
  selectImage: () => ipcRenderer.invoke("image:select"),
  saveProject: (project) => ipcRenderer.invoke("project:save", project),
  openProject: () => ipcRenderer.invoke("project:open"),
  createTextImage: (options) => ipcRenderer.invoke("text:createImage", options),
  getAi3dModels: () => ipcRenderer.invoke("ai3d:models"),
  getLastAi3dDiagnostic: () => ipcRenderer.invoke("ai3d:lastDiagnostic"),
  createAi3d: (prompt, existingPlan, model) => ipcRenderer.invoke("ai3d:create", prompt, existingPlan, model),
  onAi3dProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("ai3d:progress", listener);
    return () => ipcRenderer.removeListener("ai3d:progress", listener);
  },
  createRelief: (jobId, imagePath, options) => ipcRenderer.invoke("relief:create", jobId, imagePath, options),
  cancelRelief: (jobId) => ipcRenderer.invoke("relief:cancel", jobId),
  onReliefProgress: (callback) => {
    const listener = (_event, jobId, progress) => callback(jobId, progress);
    ipcRenderer.on("relief:progress", listener);
    return () => ipcRenderer.removeListener("relief:progress", listener);
  },
  saveGeneratedFile: (path) => ipcRenderer.invoke("export:save", path),
  showItemInFolder: (path) => ipcRenderer.invoke("shell:showItem", path),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url)
}));
