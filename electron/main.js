const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { startServer } = require("../server");

let mainWin = null;
const webAppWins = new Map();

function cleanChromeUA(ua) {
  return String(ua || "")
    .replace(/\s*Electron\/[^\s]+/g, "")
    .replace(/\s*omni-ai\/[^\s]+/gi, "");
}

async function createWindow() {
  // Fixed port keeps the page origin stable, so chats and API keys (localStorage) survive restarts.
  let port;
  for (const p of [38517, 38518, 38519, 0]) {
    try { port = await startServer(p, "127.0.0.1"); break; } catch (e) { if (p === 0) throw e; }
  }
  mainWin = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 920,
    minHeight: 620,
    title: "Omni Ai",
    icon: path.join(__dirname, "../assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWin.loadURL("http://127.0.0.1:" + port);

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.on("open-webapp", (_ev, { url, title }) => {
  if (!/^https?:\/\//i.test(String(url || ""))) return;
  const existing = webAppWins.get(url);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const w = new BrowserWindow({
    width: 1220,
    height: 840,
    title: title ? (title + " — Omni Ai") : "Omni Ai Web Account",
    icon: path.join(__dirname, "../assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:official-webapps",
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const ua = cleanChromeUA(w.webContents.getUserAgent());
  w.webContents.setUserAgent(ua);
  // Keep OAuth / SSO login popups inside the same persistent browser session
  w.webContents.setWindowOpenHandler(() => ({
    action: "allow",
    overrideBrowserWindowOptions: {
      width: 520,
      height: 680,
      autoHideMenuBar: true,
      webPreferences: {
        partition: "persist:official-webapps",
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
  }));
  w.loadURL(url, { userAgent: ua });
  w.on("closed", () => webAppWins.delete(url));
  webAppWins.set(url, w);
});

ipcMain.on("open-external", (_ev, url) => {
  if (/^https?:\/\//i.test(String(url || ""))) shell.openExternal(url);
});

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on("second-instance", () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
