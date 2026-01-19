const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.querySelector('.chat-container');
const modelSelector = document.getElementById('modelSelector');
// const getHistoryButton = document.getElementById('getHistory');

// Available models
const availableModels = [
    { value: 'openrouter/auto', label: 'Auto' },
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
];

let numOfScreenshots = 0;

// Track if first message has been sent
let isFirstMessage = true;

// Initialize Visor Agent
const agent = new VisorAgent();

// Disable input until agent is ready
messageInput.disabled = true;
sendButton.disabled = true;

// Initialize agent on startup
agent.init().then(() => {
    console.log('Visor Agent ready');
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.placeholder = 'Type a message...';
}).catch(error => {
    console.error('Failed to initialize agent:', error);
    addMessage('Failed to initialize AI agent. Please refresh.', 'system');
    messageInput.placeholder = 'Agent failed to load';
});

function addMessage(text, type = 'user') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message system loading';
    loadingDiv.id = 'loading-indicator';
    loadingDiv.innerHTML = '<div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

async function captureScreenshot() {
    try {
        const result = await window.electronAPI.takeScreenshot();
        if (result.success) {
            console.log('Screenshot saved:', result.filename);
            return result.filename;
        } else {
            console.error('Screenshot failed:', result.error);
        }
    } catch (error) {
        console.error('Error taking screenshot:', error);
    }
}

/**
 * Clean and organize UI context data for LLM consumption (OmniParser-style).
 * - Preserves enumerate-order IDs (idx) to stay aligned with the labeled overlay image numbering
 * - Does NOT sort or reindex
 * - Formats elements as HTML-ish tags ("screen_info")
 *
 * @param {Array} parsedContent - Array of UI elements from screenshot parser
 * @returns {string} Formatted UI context string
 */
function cleanUIContext(parsedContent) {
    if (!Array.isArray(parsedContent) || parsedContent.length === 0) return '';

    // Minimal escaping to keep the alt attribute valid
    const escapeAlt = (s) => {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .trim();
    };

    return parsedContent.map((element, idx) => {
        const type = (element?.type || '').toLowerCase();
        const content = escapeAlt(element?.content ?? '');
        const interactive = element?.interactivity === true ? 'true' : 'false';

        // OmniParser-style tags
        if (type === 'text') {
            return `<p id=${idx} class="text" alt="${content}" data-interactive="${interactive}"> </p>`;
        }

        // Default everything else (including "icon") to icon-style
        return `<img id=${idx} class="icon" alt="${content}" data-interactive="${interactive}"> </img>`;
    }).join('\n');
}

function exitWelcomeMode() {
    if (isFirstMessage) {
        chatContainer.classList.remove('welcome-mode');
        const welcomeMsg = document.querySelector('.message.welcome');
        if (welcomeMsg) welcomeMsg.style.display = 'none';
        isFirstMessage = false;
    }
}

async function clearScreenshots(){
    if (numOfScreenshots >= 5){
        try {
            const result = await window.electronAPI.clearScreenshotDirectories();
            if (result.success) {
                numOfScreenshots = 0;
                console.log('Screenshot directories cleared successfully');
            } else {
                console.error('Failed to clear screenshot directories:', result.error);
            }
        } catch (error) {
            console.error('Error clearing screenshot directories:', error);
        }
    }
}

async function sendMessage() {
    const start = Date.now();
    const message = messageInput.value.trim();
    if (!message){
        console.log('No message entered');
        return;
    }

    exitWelcomeMode();

    // Add user message to UI immediately and clear input field
    addMessage(message, 'user');
    messageInput.value = '';

    await triggerNextStep(message);
    
    const end = Date.now();
    console.log('Time taken:', end - start, 'ms');
}

async function triggerNextStep(message=null) {
    if (message === null){
        // const history = agent.getFullHistory();
        // message = history[history.length - 1].content;
        message = "The user completed the previous step. Is the task completed? If not, what's next? DO NOT REPEAT STEPS.";
    }
    exitWelcomeMode();
    console.log('Triggering next step with message:', message);
    let completedTask = false;
    // Show loading indicator before LLM call
    showLoadingIndicator();

    const screenshot = await captureScreenshot();
    numOfScreenshots += 1;

    // Initilize variables for llm api call
    let currentImageBase64 = null;
    let labeledImageBase64 = null;
    let uiContext = "";
    let boundingBoxes = [];

    // Parse screenshot with FastAPI server
    if (screenshot) {
        try {
            const result = await window.electronAPI.parseScreenshot(screenshot);
            if (result.success) {
                const filteredContent = result.parsedContent;
                labeledImageBase64 = result.labeledImageBase64;

                // Save labeled screenshot to data/labeled_screenshots
                if (labeledImageBase64) {
                    window.electronAPI.saveLabeledScreenshot(labeledImageBase64)
                        .then(saveResult => {
                            if (saveResult.success) {
                                console.log('Labeled screenshot saved:', saveResult.filename);
                            } else {
                                console.error('Failed to save labeled screenshot:', saveResult.error);
                            }
                        })
                        .catch(error => console.error('Error saving labeled screenshot:', error));
                }

                // Clean and organize UI context (OmniParser-style, no sorting)
                uiContext = cleanUIContext(filteredContent);
                console.log('UI context:', uiContext);

                currentImageBase64 = result.imageBase64;
                boundingBoxes = getAllBoundingBoxes(filteredContent);
            } else {
                hideLoadingIndicator();
                addMessage(`Error: ${result.error}`, 'system');
                return;
            }
        } catch (error) {
            hideLoadingIndicator();
            addMessage(`Error parsing: ${error.message}`, 'system');
            return;
        }
    } else {
        hideLoadingIndicator();
        addMessage('Error: Failed to take screenshot', 'system');
        return;
    }

    // Get selected model
    const selectedModel = modelSelector.value;
    
    // Call agent with message, UI context, screenshot, and model
    try {
        const response = await agent.sendMessage(
            message, 
            uiContext, 
            currentImageBase64, 
            labeledImageBase64, 
            selectedModel
        );
        console.log('Agent response:', response);
        
        if (!response.output || !Array.isArray(response.output)) {
            throw new Error('Invalid response format: missing output array');
        }

        let targetId = null;
        let reasoningText = '';
        let messageText = '';

        // Process each item in the output array
        for (const item of response.output) {
            // Handle reasoning type
            if (item.type === 'reasoning') {
                if (item.summary) {
                    reasoningText = item.summary;
                    console.log('Reasoning:', reasoningText);
                }
            }
            
            // Handle computer_call type
            else if (item.type === 'computer_call') {
                if (item.action && item.action.type === 'click' && item.action.target_id) {
                    targetId = item.action.target_id;
                    console.log('Action: click on', targetId, 'button:', item.action.button || 'left');
                } else if (item.action && item.action.type === 'done') {
                    completedTask = true;
                }
            }
            
            // Handle message type
            else if (item.type === 'message') {
                if (item.reply) {
                    messageText += (messageText ? ' ' : '') + item.reply;
                }
            }
        }
        console.log('Message text:', messageText);

        hideLoadingIndicator();
        if (!completedTask) {
            // Highlight element if specified
            if (targetId && boundingBoxes) {
                await highlightElement(targetId, boundingBoxes);
            }

            addMessage(messageText, 'system');
        } else {
            addMessage('Task completed', 'system');
        }
        
    } catch (error) {
        // Hide loading indicator on error
        hideLoadingIndicator();
        console.error('Error:', error);
        addMessage(`Error: ${error.message}`, 'system');
    }
}

async function highlightElement(targetId, boundingBoxes) {
    console.log('Highlighting target ID:', targetId);
    const targetBox = boundingBoxes[targetId];
    if (targetBox) {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const rect = {
            x: targetBox[0] * screenWidth,
            y: targetBox[1] * screenHeight,
            width: (targetBox[2] - targetBox[0]) * screenWidth,
            height: (targetBox[3] - targetBox[1]) * screenHeight
        };
        window.electronAPI.sendDrawRectangle(rect);
    } else {
        console.warn('Target ID not found in bounding boxes:', targetId);
    }
}

function getAllBoundingBoxes(parsedContent) {
    // If parsedContent is already an array, just extract the bbox property
    if (Array.isArray(parsedContent)) {
        return parsedContent
            .filter(item => item.bbox) // Ensure bbox exists
            .map(item => item.bbox);   // Return the [x,y,w,h] array
    }
    return [];
}

// function getHistory() {
//     console.log('Getting history');
//     console.log(agent.getHistorySummary());
// }

// Listen for main-initiated triggerNextStep calls
if (window.electronAPI && window.electronAPI.onTriggerNextStep) {
    window.electronAPI.onTriggerNextStep((msg) => {
        triggerNextStep(msg);
    });
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
// getHistoryButton.addEventListener('click', getHistory);

// Display welcome message
const welcomeDiv = document.createElement('div');
welcomeDiv.className = 'message system welcome';
welcomeDiv.textContent = 'Welcome to VisorAI';
messagesContainer.appendChild(welcomeDiv);
messagesContainer.scrollTop = messagesContainer.scrollHeight;

// Start in welcome mode
chatContainer.classList.add('welcome-mode');
