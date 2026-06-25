const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  testApi: (config) => ipcRenderer.invoke('test-api', config),
  diagnoseApi: (config) => ipcRenderer.invoke('diagnose-api', config),
});
