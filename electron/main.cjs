// Desktop wrapper for Zen Drive. Serves the static game build from app/
// over an app:// protocol so routing and module loading work like on the web.
const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: "#0e0f13",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL("app://localhost/");
}

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === "/" || p === "") p = "/index.html";
    const file = path.join(__dirname, "app", p);
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
