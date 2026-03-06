// Secure preload bridge — exposes only named, allowed IPC channels to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  invoke: (channel, ...args) => {
    const allowed = [
      'take-snapshot',
      'list-snapshots',
      'load-snapshot',
      'delete-snapshot',
      'compare-snapshots',
      'upload-snapshot',
      'list-remote-snapshots',
    ];
    if (!allowed.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  }
});