const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.webContents.on('did-finish-load', () => console.log('[main] did-finish-load'));
  win.webContents.on('did-fail-load', (e, code, desc) => console.error('[main] did-fail-load', code, desc));
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

console.log('[main] app object:', typeof app);
app.whenReady().then(() => {
  console.log('[main] app ready, creating window');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(err => console.error('[main] whenReady failed:', err));

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('render-process-gone', (e, wc, details) => console.error('[main] render-process-gone', details));
process.on('uncaughtException', err => console.error('[main] uncaughtException', err));
