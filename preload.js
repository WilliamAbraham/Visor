const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // LLM & Screenshot APIs
  chatCompletion: (messages, model) => ipcRenderer.invoke('chat-completion', messages, model),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  parseScreenshot: (filename, taskContext) => ipcRenderer.invoke('parse-screenshot', filename, taskContext),
  saveLabeledScreenshot: (imageBase64) => ipcRenderer.invoke('save-labeled-screenshot', imageBase64),
  clearScreenshotDirectories: () => ipcRenderer.invoke('clear-screenshot-directories'),
  
  // Action Execution APIs
  executeClick: (x, y, button = 'left') => ipcRenderer.invoke('execute-click', { x, y, button }),
  executeScroll: (direction, amount = 5) => ipcRenderer.invoke('execute-scroll', { direction, amount }),
  executeType: (text) => ipcRenderer.invoke('execute-type', { text }),
  executeKey: (key, modifiers = []) => ipcRenderer.invoke('execute-key', { key, modifiers })
})

