require('dotenv').config({ path: require('path').join(__dirname, '.env') })

const { app, BrowserWindow, screen } = require('electron/main')
const path = require('path')
const {ipcMain} = require('electron')
const OpenAI = require('openai')
const { takeScreenshot } = require('./utils/screenshot')
const http = require('http')

const apiKey = process.env.OPENAI_API_KEY || ''
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

// Handle screenshot taking
ipcMain.handle('take-screenshot', async (event) => {
  try {
    const filename = await takeScreenshot()
    return { success: true, filename: filename }
  } catch (error) {
    console.error('Screenshot error:', error)
    return { success: false, error: error.message }
  }
})

// Handle parsing screenshot with FastAPI server
ipcMain.handle('parse-screenshot', async (event, filename) => {
    console.log('parsing screnshot')
  try {
    const fullPath = path.join(__dirname, 'data', 'screenshots', filename)
    const encodedPath = encodeURIComponent(fullPath)
    const url = `http://127.0.0.1:7777/omni?filepath=${encodedPath}`
    
    return new Promise((resolve, reject) => {
      const request = http.get(url, (response) => {
        let data = ''
        
        response.on('data', (chunk) => {
          data += chunk
        })
        
        response.on('end', () => {
          if (response.statusCode === 200) {
            resolve({ success: true, parsedContent: data })
          } else {
            reject(new Error(`Server error: ${response.statusCode} - ${data}`))
          }
        })
      })
      
      request.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`))
      })
      
      request.setTimeout(300000, () => {
        request.destroy()
        reject(new Error('Request timeout'))
      })
    })
  } catch (error) {
    console.error('Parse screenshot error:', error)
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

  overlayWin.setContentProtection(true)
  
  overlayWin.loadFile('renderer/index.html')
  return overlayWin
}

// Create chatbox window (interactive)
const createChatWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  const chatWin = new BrowserWindow({
    width: 400,
    height: 600,
    x: x + width - 420, // Position on right side of primary display
    y: y + 50,
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
    chatWin.setVisibleOnAllWorkspaces(false) // Show on all workspaces/desktops
  }

  chatWin.setContentProtection(true)
  
  chatWin.loadFile('renderer/chat.html')
  
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