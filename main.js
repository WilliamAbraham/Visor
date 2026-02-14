import { config } from 'dotenv'
import { app, BrowserWindow, screen } from 'electron/main'
import path from 'path'
import { ipcMain } from 'electron'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { takeScreenshot } from './utils/screenshot.js'
import https from 'https'
import { URL } from 'url'
import { OpenRouter } from '@openrouter/sdk'
import robot from '@jitsi/robotjs'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

config({ path: path.join(__dirname, '.env') })

const openRouterApiKey = process.env.OPENROUTER_API_KEY || ''
const openRouter = new OpenRouter({
    apiKey: openRouterApiKey
});

let isParsingScreenshot = false
let overlayWin = null
let chatWin = null

// Configure robotjs for smoother mouse movement
robot.setMouseDelay(50)
robot.setKeyboardDelay(50)

// ============ ACTION EXECUTION HANDLERS ============

// Execute mouse click at coordinates
ipcMain.handle('execute-click', async (event, { x, y, button = 'left' }) => {
  try {
    robot.moveMouse(x, y)
    robot.mouseClick(button)
    console.log(`Clicked at (${x}, ${y}) with ${button} button`)
    return { success: true }
  } catch (error) {
    console.error('Click execution error:', error)
    return { success: false, error: error.message }
  }
})

// Execute scroll action
ipcMain.handle('execute-scroll', async (event, { direction, amount = 5 }) => {
  try {
    // robotjs scroll: positive = up, negative = down
    const scrollAmount = direction === 'up' ? amount : -amount
    robot.scrollMouse(0, scrollAmount)
    console.log(`Scrolled ${direction} by ${amount}`)
    return { success: true }
  } catch (error) {
    console.error('Scroll execution error:', error)
    return { success: false, error: error.message }
  }
})

// Execute keyboard typing
ipcMain.handle('execute-type', async (event, { text }) => {
  try {
    robot.typeString(text)
    console.log(`Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)
    return { success: true }
  } catch (error) {
    console.error('Type execution error:', error)
    return { success: false, error: error.message }
  }
})

// Execute key press (for special keys like Enter, Tab, etc.)
ipcMain.handle('execute-key', async (event, { key, modifiers = [] }) => {
  try {
    robot.keyTap(key, modifiers)
    console.log(`Key pressed: ${modifiers.length ? modifiers.join('+') + '+' : ''}${key}`)
    return { success: true }
  } catch (error) {
    console.error('Key execution error:', error)
    return { success: false, error: error.message }
  }
})

// Handle chat completion using OpenAI SDK
ipcMain.handle('chat-completion', async (event, messages, model='google/gemini-3-flash-preview') => {
    console.log("Using model:", model);

    try {
        const result = await openRouter.chat.send({
            model: model,
            messages: messages,
            stream: false,
        });
        
        if (!result || !result.choices || !result.choices[0]) {
            console.error('Invalid API response structure:', result);
            return { success: false, error: 'Invalid API response structure' };
        }
        
        const content = result.choices[0].message.content;
        console.log('OpenRouter response:', content);
        
        return { success: true, response: content };
    } catch (error) {
        console.error('OpenRouter API error:', error);
        return { success: false, error: error.message || 'API call failed' };
    }
})


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

// ============ CROP PRE-PASS ============

async function getCropRegion(imageBase64, imgWidth, imgHeight, taskContext) {
  try {
    const prompt = `You are a screen region selector. Given a screenshot and a task description, identify the region of the screen most relevant to the task.

Task: "${taskContext}"

Return JSON (no markdown):
{
  "use_full_screen": false,
  "region": { "x_ratio": 0.0, "y_ratio": 0.0, "width_ratio": 0.5, "height_ratio": 0.5 },
  "reasoning": "brief explanation"
}

Rules:
- Ratios are 0-1 relative to screen dimensions
- Add generous padding (10%+ on each side) around the target area
- Minimum 25% of screen per dimension (width_ratio >= 0.25, height_ratio >= 0.25)
- Set "use_full_screen": true if unsure, task spans multiple areas, or task is vague
- x_ratio + width_ratio must be <= 1.0, y_ratio + height_ratio must be <= 1.0`

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', imageUrl: { url: `data:image/png;base64,${imageBase64}` } }
        ]
      }
    ]

    const result = await openRouter.chat.send({
      model: 'google/gemini-2.0-flash-001',
      messages: messages,
      stream: false,
    })

    if (!result || !result.choices || !result.choices[0]) {
      console.log('Crop LLM: invalid response structure, using full screen')
      return null
    }

    const content = result.choices[0].message.content
    const cleanJson = content.replace(/```json\n?|```/g, '').trim()
    const parsed = JSON.parse(cleanJson)

    if (parsed.use_full_screen) {
      console.log('Crop LLM: using full screen -', parsed.reasoning)
      return null
    }

    const region = parsed.region
    if (!region) return null

    // Convert ratios to pixels
    let x = Math.round(region.x_ratio * imgWidth)
    let y = Math.round(region.y_ratio * imgHeight)
    let width = Math.round(region.width_ratio * imgWidth)
    let height = Math.round(region.height_ratio * imgHeight)

    // Enforce minimum 25% of screen per dimension
    if (width < imgWidth * 0.25) {
      console.log('Crop LLM: width too small, using full screen')
      return null
    }
    if (height < imgHeight * 0.25) {
      console.log('Crop LLM: height too small, using full screen')
      return null
    }

    // Clamp to image bounds
    x = Math.max(0, Math.min(x, imgWidth - 1))
    y = Math.max(0, Math.min(y, imgHeight - 1))
    width = Math.min(width, imgWidth - x)
    height = Math.min(height, imgHeight - y)

    console.log(`Crop region: x=${x}, y=${y}, w=${width}, h=${height} (${parsed.reasoning})`)
    return { x, y, width, height }
  } catch (error) {
    console.log('Crop LLM failed, using full screen:', error.message)
    return null
  }
}

function remapBoundingBoxes(parsedContent, cropRegion, fullWidth, fullHeight) {
  if (!cropRegion || !parsedContent) return parsedContent

  return parsedContent.map(element => {
    if (!element.bbox || element.bbox.length < 4) return element

    const [x1, y1, x2, y2] = element.bbox
    return {
      ...element,
      bbox: [
        (cropRegion.x + x1 * cropRegion.width) / fullWidth,
        (cropRegion.y + y1 * cropRegion.height) / fullHeight,
        (cropRegion.x + x2 * cropRegion.width) / fullWidth,
        (cropRegion.y + y2 * cropRegion.height) / fullHeight,
      ]
    }
  })
}

// Handle parsing screenshot with FastAPI server
ipcMain.handle('parse-screenshot', async (event, filename, taskContext) => {

  if (isParsingScreenshot) {
    return { success: false, error: 'Screenshot is already being parsed' }
  }

  isParsingScreenshot = true

  try {
    const fullPath = path.join(__dirname, 'data', 'screenshots', filename)

    // Read image file and convert to base64
    const imageBuffer = fs.readFileSync(fullPath)
    const imageBase64 = imageBuffer.toString('base64')

    // Get image dimensions and attempt crop pre-pass
    const metadata = await sharp(imageBuffer).metadata()
    const imgWidth = metadata.width
    const imgHeight = metadata.height

    let cropRegion = null
    let parseBase64 = imageBase64

    if (taskContext) {
      cropRegion = await getCropRegion(imageBase64, imgWidth, imgHeight, taskContext)
    }

    if (cropRegion) {
      try {
        const croppedBuffer = await sharp(imageBuffer)
          .extract({ left: cropRegion.x, top: cropRegion.y, width: cropRegion.width, height: cropRegion.height })
          .png()
          .toBuffer()
        parseBase64 = croppedBuffer.toString('base64')
        console.log('Using cropped image for OmniParser')
      } catch (cropError) {
        console.log('sharp.extract() failed, using full screen:', cropError.message)
        cropRegion = null
        parseBase64 = imageBase64
      }
    }

    // Send base64 string directly as JSON string
    const postData = JSON.stringify(parseBase64)
    
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
              // Remap bounding boxes from crop-relative to full-screen-relative
              const remappedContent = cropRegion
                ? remapBoundingBoxes(result.parsed_content, cropRegion, imgWidth, imgHeight)
                : result.parsed_content

              resolve({
                success: true,
                parsedContent: remappedContent,
                imageBase64: imageBase64,  // Always return original full screenshot
                labeledImageBase64: result.image_base64,  // Labeled image from server (cropped region)
                cropRegion: cropRegion  // Include crop metadata
              })
            } else {
              reject(new Error(result.error || `Server error: ${response.statusCode}`))
            }
          } catch (parseError) {
            // Log the actual response for debugging
            console.error('OmniParser raw response:', data.substring(0, 500))
            reject(new Error(`OmniParser error: ${data.substring(0, 100)}`))
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