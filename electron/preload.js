const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("aiEngineDesktop", {
  platform: process.platform,
  isElectron: true,
  openWebApp: (url, title) => ipcRenderer.send("open-webapp", { url, title }),
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
