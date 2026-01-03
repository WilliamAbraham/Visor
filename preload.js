const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
})

contextBridge.exposeInMainWorld('electronAPI', {
  chatCompletion: (messages) => ipcRenderer.invoke('chat-completion', messages),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  parseScreenshot: (filename) => ipcRenderer.invoke('parse-screenshot', filename),
  sendDrawRectangle: (data) => ipcRenderer.send('draw-rectangle', data),
  onDrawRectangle: (callback) => ipcRenderer.on('draw-rectangle', (_event, value) => callback(value)),
  setClickable: (isClickable) => ipcRenderer.send('set-clickable', isClickable)
})

