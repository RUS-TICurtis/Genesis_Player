
// Preload script
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  changeAppIcon: () => ipcRenderer.send('change-app-icon'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  updateTaskbarPlayback: (state) => ipcRenderer.send('playback-state', state),
  onTaskbarControl: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('taskbar-control', listener);
    return () => ipcRenderer.removeListener('taskbar-control', listener);
  }
});
