const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
})

contextBridge.exposeInMainWorld('electronAPI', {
  // LLM & Screenshot APIs
  chatCompletion: (messages, model) => ipcRenderer.invoke('chat-completion', messages, model),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  parseScreenshot: (filename) => ipcRenderer.invoke('parse-screenshot', filename),
  saveLabeledScreenshot: (imageBase64) => ipcRenderer.invoke('save-labeled-screenshot', imageBase64),
  clearScreenshotDirectories: () => ipcRenderer.invoke('clear-screenshot-directories'),
  
  // Action Execution APIs
  executeClick: (x, y, button = 'left') => ipcRenderer.invoke('execute-click', { x, y, button }),
  executeScroll: (direction, amount = 5) => ipcRenderer.invoke('execute-scroll', { direction, amount }),
  executeType: (text) => ipcRenderer.invoke('execute-type', { text }),
  executeKey: (key, modifiers = []) => ipcRenderer.invoke('execute-key', { key, modifiers }),
  
  // Config API
  loadUserConfig: () => ipcRenderer.invoke('load-user-config'),
  
  // Browser API
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  
  // Job Tracker APIs
  loadAppliedJobs: () => ipcRenderer.invoke('load-applied-jobs'),
  addAppliedJob: (company, position) => ipcRenderer.invoke('add-applied-job', { company, position })
})

