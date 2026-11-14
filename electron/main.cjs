const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');

if (!app.requestSingleInstanceLock()) app.quit();
let win;
function create() {
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 380, minHeight: 560, title: 'Ledgerleaf', autoHideMenuBar: true,
    backgroundColor: '#f9f9f7',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  create();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && create());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
