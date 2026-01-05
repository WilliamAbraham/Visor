import screenshot from 'screenshot-desktop'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Takes a screenshot and saves it to the screenshots folder
 * @returns {Promise<string>} The filename of the saved screenshot
 */
async function takeScreenshot() {
  try {
    // Get the screenshots directory path
    const screenshotsDir = path.join(__dirname, '..', 'data', 'screenshots')
    
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true })
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `screenshot-${timestamp}.png`
    const filepath = path.join(screenshotsDir, filename)
    
    // Take screenshot and save directly to file
    await screenshot({ filename: filepath })
    
    console.log(`Screenshot saved: ${filename}`)
    return filename
  } catch (error) {
    console.error('Screenshot error:', error)
    throw error
  }
}

export { takeScreenshot }
