const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let pendingOpenPath = null;
let fileWatcher = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 480,
    minHeight: 360,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.MDVIEW_DEBUG) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${source}:${line} ${message}`);
    });
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) {
      openFile(pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }
    mainWindow = null;
  });
}

function readMarkdown(filePath) {
  return fs.promises.readFile(filePath, 'utf8');
}

async function openFile(filePath) {
  if (!filePath || !mainWindow) return;

  try {
    const content = await readMarkdown(filePath);
    const stat = await fs.promises.stat(filePath);
    mainWindow.webContents.send('file:opened', {
      path: filePath,
      name: path.basename(filePath),
      dir: path.dirname(filePath),
      content,
      size: stat.size,
      mtime: stat.mtimeMs,
    });
    if (app.addRecentDocument) app.addRecentDocument(filePath);
    watchFile(filePath);
  } catch (err) {
    dialog.showErrorBox('Unable to open file', `${filePath}\n\n${err.message}`);
  }
}

function watchFile(filePath) {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  try {
    let debounce = null;
    fileWatcher = fs.watch(filePath, { persistent: false }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        try {
          const content = await readMarkdown(filePath);
          if (mainWindow) {
            mainWindow.webContents.send('file:changed', { path: filePath, content });
          }
        } catch (_) {}
      }, 120);
    });
  } catch (_) {}
}

async function showOpenDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown file',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'mkd', 'mdown'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!result.canceled && result.filePaths[0]) {
    await openFile(result.filePaths[0]);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => showOpenDialog(),
        },
        {
          label: 'Reload File',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.webContents.send('action:reload'),
        },
        { type: 'separator' },
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow && mainWindow.webContents.send('action:print'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow && mainWindow.webContents.send('action:find'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Theme',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => mainWindow && mainWindow.webContents.send('action:toggle-theme'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About MDView',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'MDView',
              message: 'MDView',
              detail:
                'A standalone Markdown viewer.\n\nDouble-click any .md file (after setting MDView as the default handler) and it opens directly in rendered view — no editor required.',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// File-open events
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    openFile(filePath);
  } else {
    pendingOpenPath = filePath;
  }
});

// Single-instance lock so Finder double-clicks reuse window
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const fileArg = argv.find(
      (a) => a && !a.startsWith('-') && /\.(md|markdown|mdx|mkd|mdown|txt)$/i.test(a),
    );
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (fileArg) openFile(fileArg);
    }
  });
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  // CLI argument support — `mdview some.md`
  const fileArg = process.argv.find(
    (a) => a && !a.startsWith('-') && /\.(md|markdown|mdx|mkd|mdown|txt)$/i.test(a),
  );
  if (fileArg && fs.existsSync(fileArg)) {
    pendingOpenPath = path.resolve(fileArg);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers from renderer
ipcMain.handle('dialog:open', () => showOpenDialog());

ipcMain.handle('file:read', async (_event, filePath) => {
  const content = await readMarkdown(filePath);
  return content;
});

ipcMain.handle('file:drop', async (_event, filePath) => {
  await openFile(filePath);
});

ipcMain.handle('shell:open-external', (_event, url) => {
  shell.openExternal(url);
});
