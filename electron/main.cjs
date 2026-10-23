// Desktop wrapper for Zen Drive. Loads the static game build from app/.
const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: "#0e0f13",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The static build uses ES modules; file:// blocks them without this.
      webSecurity: false,
    },
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
