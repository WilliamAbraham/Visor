const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.querySelector('.chat-container');

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

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // On first message, exit welcome mode
    if (isFirstMessage) {
        chatContainer.classList.remove('welcome-mode');
        // Hide welcome message
        const welcomeMsg = document.querySelector('.message.welcome');
        if (welcomeMsg) {
            welcomeMsg.style.display = 'none';
        }
        isFirstMessage = false;
    }

    // Add user message to UI immediately and clear input field
    addMessage(message, 'user');
    messageInput.value = '';

    const screenshot = await captureScreenshot();

    // Initilize variables for llm api call
    let currentImageBase64 = null;
    let uiContext = "";
    let boundingBoxes = [];

    // Parse screenshot with FastAPI server
    if (screenshot) {
        try {
            const result = await window.electronAPI.parseScreenshot(screenshot);
            if (result.success) {
                // Filter content to only include interactive icons
                const filteredContent = result.parsedContent.filter(item => 
                    item.type === 'icon' && item.interactivity
                );
                console.log('Filtered content:', filteredContent);

                // Construct UI context string for LLM
                uiContext = filteredContent.map((item, i) => 
                    `ID: ${i} | Type: ${item.type} | Content: ${item.content} | Interactivity: ${item.interactivity}"`
                ).join('\n');

                currentImageBase64 = result.imageBase64;
                boundingBoxes = getAllBoundingBoxes(filteredContent);
                console.log('UI elements:', uiContext);
            } else {
                console.error('Parse failed:', result.error);
                addMessage(`Error: ${result.error}`, 'system');
                return
            }
        } catch (error) {
            console.error('Error parsing screenshot:', error);
            addMessage(`Error parsing: ${error.message}`, 'system');
            return
        }
    } else {
        addMessage('Error: Failed to take screenshot', 'system');
        return
    }

    // Call agent with message, UI context, and screenshot
    try {
        const response = await agent.sendMessage(message, uiContext, currentImageBase64);
        console.log('Agent response:', response);
        
        if (!response.output || !Array.isArray(response.output)) {
            throw new Error('Invalid response format: missing output array');
        }

        let targetId = null;
        let reasoningText = '';
        let messageText = '';

        // Process each item in the output array
        for (const item of response.output) {
            if (item.type === 'reasoning') {
                // Extract reasoning text from summary
                if (item.summary && Array.isArray(item.summary)) {
                    reasoningText = item.summary
                        .filter(s => s.type === 'summary_text')
                        .map(s => s.text)
                        .join(' ');
                    console.log('Reasoning:', reasoningText);
                }
            } else if (item.type === 'computer_call') {
                // Handle computer actions (like clicks)
                if (item.action && item.action.type === 'click' && item.action.target_id) {
                    targetId = item.action.target_id;
                    console.log('Action: click on', targetId);
                }
            } else if (item.type === 'message') {
                // Collect message text
                if (item.reply) {
                    messageText += (messageText ? ' ' : '') + item.reply;
                }
            }
        }

        addMessage(messageText, 'system');
        
        // Highlight element if specified
        if (targetId && boundingBoxes) {
            await highlightElement(targetId, boundingBoxes);
        }
        
    } catch (error) {
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

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Display welcome message
const welcomeDiv = document.createElement('div');
welcomeDiv.className = 'message system welcome';
welcomeDiv.textContent = 'Welcome to VisorAI';
messagesContainer.appendChild(welcomeDiv);
messagesContainer.scrollTop = messagesContainer.scrollHeight;

// Start in welcome mode
chatContainer.classList.add('welcome-mode');
