const { ipcRenderer, webUtils } = require('electron');

window.mdview = {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  openDroppedFile: (filePath) => ipcRenderer.invoke('file:drop', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file && file.path ? file.path : null;
    }
  },
  onFileOpened: (cb) => ipcRenderer.on('file:opened', (_e, data) => cb(data)),
  onFileChanged: (cb) => ipcRenderer.on('file:changed', (_e, data) => cb(data)),
  onAction: (cb) => {
    ipcRenderer.on('action:reload', () => cb('reload'));
    ipcRenderer.on('action:print', () => cb('print'));
    ipcRenderer.on('action:find', () => cb('find'));
    ipcRenderer.on('action:toggle-theme', () => cb('toggle-theme'));
  },
};
