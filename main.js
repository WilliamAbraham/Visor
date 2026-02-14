import { config } from 'dotenv'
import { app, BrowserWindow, screen } from 'electron/main'
import path from 'path'
import { ipcMain } from 'electron'
import fs from 'fs'
import { fileURLToPath } from 'url'
import OpenAI from 'openai'
import { takeScreenshot } from './utils/screenshot.js'
import https from 'https'
import { URL } from 'url'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import os from 'os'
import { execSync } from 'child_process'
import { OpenRouter } from '@openrouter/sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

config({ path: path.join(__dirname, '.env') })

const openaiApiKey = process.env.OPENAI_API_KEY || ''
const openai = new OpenAI({
  apiKey: openaiApiKey
})

const openRouterApiKey = process.env.OPENROUTER_API_KEY || ''
const openRouter = new OpenRouter({
    apiKey: openRouterApiKey
});

let isParsingScreenshot = false
let overlayWin = null
let chatWin = null
let activeRect = null // Track active rectangle {x, y, width, height}

// Start global input hook
uIOhook.on('mousedown', (e) => {
  if (activeRect) {
    const { x, y } = e
    // Check if click is inside active rectangle
    /*
        This will be the foundation for the loop logic, 
    */
    if (x >= activeRect.x && x <= activeRect.x + activeRect.width &&
        y >= activeRect.y && y <= activeRect.y + activeRect.height) {
      
      // Clicked inside! Clear rectangle and trigger next step
      if (overlayWin) {
        overlayWin.webContents.send('draw-rectangle', []) // Send empty to clear
        setTimeout(() => {
          if (chatWin) {
            chatWin.webContents.send('trigger-next-step');
          }
        }, 1000);
        activeRect = null
      }
    }
  }
})

uIOhook.start()

// Handle chat completion using OpenAI SDK
ipcMain.handle('chat-completion', async (event, messages, model='google/gemini-3-flash-preview') => {

    console.log("Using model:", model);

/* OpenRouter */
    const result = await openRouter.chat.send({
      model: model,
      messages: messages,
      stream: false,
    });
    const content = result.choices[0].message.content;
    console.log('OpenRouter response:', content);
    
    // Return the content as-is (could be string or object)
    return { success: true, response: content };
})

// Allow main to trigger renderer's next step
ipcMain.on('trigger-next-step', (_event) => {
  if (chatWin) {
    chatWin.webContents.send('trigger-next-step');
  }
});

// Handle screenshot taking
ipcMain.handle('take-screenshot', async (event) => {
  if (isParsingScreenshot) {
    return { success: false, error: 'Screenshot is already being parsed' }
  }
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

  if (isParsingScreenshot) {
    return { success: false, error: 'Screenshot is already being parsed' }
  }

  isParsingScreenshot = true

  try {
    const fullPath = path.join(__dirname, 'data', 'screenshots', filename)
    
    // Read image file and convert to base64
    const imageBuffer = fs.readFileSync(fullPath)
    const imageBase64 = imageBuffer.toString('base64')
    
    // Send base64 string directly as JSON string
    const postData = JSON.stringify(imageBase64)
    
    // Get server URL from environment variable (full HTTPS URL)
    const serverUrl = process.env.OMNIPARSER_SERVER_URL
    const parsedUrl = new URL(serverUrl)
    
    // Build path (append /omni to existing pathname)
    const basePath = parsedUrl.pathname || '/'
    const requestPath = basePath.endsWith('/') ? `${basePath}omni` : `${basePath}/omni`
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: requestPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }
    
    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = ''
        
        response.on('data', (chunk) => {
          data += chunk
        })
        
        response.on('end', () => {
          try {
            const result = JSON.parse(data)
            if (response.statusCode === 200 && result.success) {
              resolve({ 
                success: true, 
                parsedContent: result.parsed_content, 
                imageBase64: imageBase64,
                labeledImageBase64: result.image_base64  // Labeled image from server
              })
            } else {
              reject(new Error(result.error || `Server error: ${response.statusCode}`))
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`))
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
      
      request.write(postData)
      request.end()
    })

    isParsingScreenshot = false
    return result
  } catch (error) {
    isParsingScreenshot = false
    console.error('Parse screenshot error:', error)
    return { success: false, error: error.message }
  }
})

// Handle saving labeled screenshot
ipcMain.handle('save-labeled-screenshot', async (event, imageBase64) => {
  try {
    const labeledDir = path.join(__dirname, 'data', 'labeled_screenshots')
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(labeledDir)) {
      fs.mkdirSync(labeledDir, { recursive: true })
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
    const filename = `screenshot-${timestamp}.png`
    const filepath = path.join(labeledDir, filename)
    
    // Convert base64 to buffer and save
    const imageBuffer = Buffer.from(imageBase64, 'base64')
    fs.writeFileSync(filepath, imageBuffer)
    
    console.log('Labeled screenshot saved:', filename)
    return { success: true, filename: filename, path: filepath }
  } catch (error) {
    console.error('Error saving labeled screenshot:', error)
    return { success: false, error: error.message }
  }
})

// Handle clearing screenshot directories
ipcMain.handle('clear-screenshot-directories', async (event) => {
  try {
    const screenshotsDir = path.join(__dirname, 'data', 'screenshots')
    const labeledScreenshotsDir = path.join(__dirname, 'data', 'labeled_screenshots')
    
    // Clear screenshots directory
    if (fs.existsSync(screenshotsDir)) {
      const files = fs.readdirSync(screenshotsDir)
      files.forEach(file => {
        const filepath = path.join(screenshotsDir, file)
        if (fs.statSync(filepath).isFile()) {
          fs.unlinkSync(filepath)
        }
      })
      console.log('Cleared screenshots directory')
    }
    
    // Clear labeled_screenshots directory
    if (fs.existsSync(labeledScreenshotsDir)) {
      const files = fs.readdirSync(labeledScreenshotsDir)
      files.forEach(file => {
        const filepath = path.join(labeledScreenshotsDir, file)
        if (fs.statSync(filepath).isFile()) {
          fs.unlinkSync(filepath)
        }
      })
      console.log('Cleared labeled_screenshots directory')
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error clearing screenshot directories:', error)
    return { success: false, error: error.message }
  }
})

// Handle get-system-info request
ipcMain.handle('get-system-info', async () => {
  try {
    const platform = os.platform()
    const cpus = os.cpus()
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1)
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1)

    // OS version
    let osVersion = os.release()
    if (platform === 'darwin') {
      try { osVersion = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim() } catch {}
    } else if (platform === 'win32') {
      try { osVersion = execSync('ver', { encoding: 'utf8' }).trim() } catch {}
    }

    // Disk info
    let diskInfo = 'unknown'
    try {
      if (platform === 'darwin' || platform === 'linux') {
        const df = execSync("df -h / | tail -1", { encoding: 'utf8' }).trim()
        const parts = df.split(/\s+/)
        diskInfo = `Total: ${parts[1]}, Used: ${parts[2]}, Available: ${parts[3]}`
      } else if (platform === 'win32') {
        const wmic = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:value', { encoding: 'utf8' }).trim()
        diskInfo = wmic.replace(/\r/g, '').split('\n').filter(Boolean).join(', ')
      }
    } catch {}

    // Network interfaces
    const nets = os.networkInterfaces()
    const activeInterfaces = []
    for (const [name, addrs] of Object.entries(nets)) {
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4') {
          activeInterfaces.push(`${name}: ${addr.address}`)
        }
      }
    }

    // Display resolution
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size
    const scaleFactor = primaryDisplay.scaleFactor

    const info = [
      `=== System Information ===`,
      `OS: ${platform} ${osVersion} (${os.arch()})`,
      `Hostname: ${os.hostname()}`,
      `User: ${os.userInfo().username}`,
      `CPU: ${cpus[0]?.model || 'unknown'} (${cpus.length} cores)`,
      `RAM: ${freeMemGB} GB free / ${totalMemGB} GB total`,
      `Disk (/): ${diskInfo}`,
      `Network: ${activeInterfaces.length > 0 ? activeInterfaces.join('; ') : 'No active interfaces'}`,
      `Display: ${width}x${height} (scale: ${scaleFactor}x)`,
    ].join('\n')

    console.log('System info gathered:', info)
    return info
  } catch (error) {
    console.error('Error gathering system info:', error)
    return `System info unavailable: ${error.message}`
  }
})

// Handle draw rectangle request
ipcMain.on('draw-rectangle', (event, data) => {
  if (overlayWin) {
    // Update active rect for hit testing
    // data can be array or single object. We support single active rect for now based on logic
    if (Array.isArray(data)) {
        activeRect = data.length > 0 ? data[0] : null
    } else {
        activeRect = data && data.width ? data : null
    }
    
    overlayWin.webContents.send('draw-rectangle', data)
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

  overlayWin = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    enableLargerThanScreen: true,
    hasShadow: false,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js')
    },
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    closable: false,
    minimizable: false,
    maximizable: false,
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

  chatWin = new BrowserWindow({
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