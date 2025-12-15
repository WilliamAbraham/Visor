require('dotenv').config({ path: require('path').join(__dirname, '.env') })

const { app, BrowserWindow, screen } = require('electron/main')
const path = require('path')
const {ipcMain} = require('electron')
const OpenAI = require('openai')

// Initialize OpenAI client in main process
const apiKey = process.env.OPENAI_API_KEY || ''
console.log('API Key loaded:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND')

const openai = new OpenAI({
  apiKey: apiKey
})

// Handle chat completion using OpenAI SDK
ipcMain.handle('chat-completion', async (event, messages) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages
    })
    return { success: true, response: response.choices[0].message.content }
  } catch (error) {
    console.error('Chat completion error:', error)
    return { success: false, error: error.message }
  }
})

// Hide dock icon on macOS
const is_mac = process.platform === 'darwin'
if (is_mac) {
  app.dock.hide()
}

// Create overlay window (transparent, click-through)
const createOverlayWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  const overlayWin = new BrowserWindow({
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
    overlayWin.setAlwaysOnTop(true, 'screen-saver')
    overlayWin.setVisibleOnAllWorkspaces(false)
  }
  
  // Make window click-through (clicks pass through to desktop)
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
  
  // Prevent window from being closed
  overlayWin.on('close', (event) => {
    event.preventDefault()
    return false
  })
  
  overlayWin.loadFile('app/index.html')
  return overlayWin
}

// Create chatbox window (interactive)
const createChatWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.bounds

  const chatWin = new BrowserWindow({
    width: 400,
    height: 600,
    x: width - 420, // Position on right side
    y: 50,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
    },
    frame: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    closable: true,
    minimizable: true,
    maximizable: false,
    backgroundColor: '#1e1e1e',
  })
  
  if (is_mac) {
    chatWin.setAlwaysOnTop(true, 'floating')
    chatWin.setVisibleOnAllWorkspaces(false)
  }
  
  chatWin.loadFile('app/chat.html')
  
  // Open DevTools automatically to see console logs
  chatWin.webContents.once('did-finish-load', () => {
    chatWin.webContents.openDevTools()
  })
  
  return chatWin
}

app.whenReady().then(() => {
  createOverlayWindow()
  createChatWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow()
      createChatWindow()
    }
  })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})