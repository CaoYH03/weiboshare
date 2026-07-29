const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const Store = require("electron-store");
const { detectChromePath } = require("./src/main/chrome");
const { ShareService } = require("./src/main/share-service");

const store = new Store();
let mainWindow;

const shareService = new ShareService({
  store,
  sendToRenderer: (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  },
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("settings:get", async () => ({
  chromePath: store.get("chromePath") || detectChromePath(),
  intervalSeconds: store.get("intervalSeconds") || 30,
}));

ipcMain.handle("settings:save", async (_event, settings = {}) => {
  if (typeof settings.chromePath === "string") {
    store.set("chromePath", settings.chromePath.trim());
  }

  if (Number.isFinite(settings.intervalSeconds)) {
    store.set("intervalSeconds", settings.intervalSeconds);
  }

  return { ok: true };
});

ipcMain.handle("sharing:start", async () => {
  try {
    await shareService.start();
    return { ok: true };
  } catch (error) {
    console.error("启动失败:", error);
    return { ok: false, message: error.message };
  }
});

ipcMain.handle("sharing:confirm-login", async (_event, payload) => {
  try {
    await shareService.confirmLogin(payload);
    return { ok: true };
  } catch (error) {
    console.error("分享过程出错:", error);
    return { ok: false, message: error.message };
  }
});

ipcMain.handle("sharing:stop", async () => {
  await shareService.stop();
  return { ok: true };
});

ipcMain.handle("sharing:reset-progress", async () => {
  shareService.resetProgress();
  return { ok: true };
});
