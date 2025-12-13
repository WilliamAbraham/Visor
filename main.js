const { app, BrowserWindow, screen } = require('electron/main')
const path = require('path')
const {ipcMain} = require('electron')

// Hide dock icon on macOS
const is_mac = process.platform === 'darwin'
if (is_mac) {
  app.dock.hide()
}

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  const win = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js')
    },
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#00000000',
        height: 0
    },
  })
  
  // macOS: Set window level to appear above dock/dashboard
  if (is_mac) {
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(false) // Only show on current screen/workspace
  }
  
  // Make window click-through (clicks pass through to desktop)
  win.setIgnoreMouseEvents(true, { forward: true })
  
  // Prevent window from being closed
  win.on('close', (event) => {
    event.preventDefault()
    return false
  })
  
  win.loadFile('app/index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})