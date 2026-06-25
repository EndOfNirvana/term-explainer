const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  testApi: (data) => ipcRenderer.invoke('test-api', data),
  callLLM: (term) => ipcRenderer.invoke('call-llm', term),
  closePopup: () => ipcRenderer.send('close-popup'),
  closeAllPopups: () => ipcRenderer.send('close-all-popups'),
  onInitTerm: (callback) => ipcRenderer.on('init-term', (_, term) => callback(term)),
  onConfigCancelKey: (callback) => ipcRenderer.on('config-cancel-key', (_, key) => callback(key)),
  removeInitTerm: () => ipcRenderer.removeAllListeners('init-term'),
  removeConfigCancelKey: () => ipcRenderer.removeAllListeners('config-cancel-key'),
});
