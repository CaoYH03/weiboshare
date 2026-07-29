const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("weiboShareApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  startSharing: () => ipcRenderer.invoke("sharing:start"),
  confirmLogin: (payload) => ipcRenderer.invoke("sharing:confirm-login", payload),
  stopSharing: () => ipcRenderer.invoke("sharing:stop"),
  resetProgress: () => ipcRenderer.invoke("sharing:reset-progress"),
  onStatusUpdate: (callback) => ipcRenderer.on("status-update", (_event, message) => callback(message)),
  onStateChange: (callback) => ipcRenderer.on("app-state", (_event, state) => callback(state)),
  onWaitForLogin: (callback) => ipcRenderer.on("wait-for-login", () => callback()),
  onLoginRequired: (callback) => ipcRenderer.on("login-required", () => callback()),
  onStatusSuccess: (callback) => ipcRenderer.on("status-success", () => callback()),
});
