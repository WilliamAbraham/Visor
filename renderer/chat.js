const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.querySelector('.chat-container');
const modelSelector = document.getElementById('modelSelector');

// Available models
const availableModels = [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
];

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

/*
    sendMessage function
    1. add user message to UI immediately and clear input field
    2. show loading indicator
    3. capture screenshot
    4. parse screenshot with FastAPI server
    5. call agent with message, UI context, screenshot, and model
    6. hide loading indicator
    7. process agent response
    8. highlight element if specified
    9. add agent response to UI
*/

/*
    Need to impliment a loop
*/

function exitWelcomeMode() {
    if (isFirstMessage) {
        chatContainer.classList.remove('welcome-mode');
        const welcomeMsg = document.querySelector('.message.welcome');
        if (welcomeMsg) welcomeMsg.style.display = 'none';
        isFirstMessage = false;
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

async function triggerNextStep(message="Assume the user completed the previous step. What's next?") {
    exitWelcomeMode();
    console.log('Triggering next step with message:', message);
    let completedTask = false;
    // Show loading indicator before LLM call
    showLoadingIndicator();

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
                console.log('Parsed screenshot:', result.parsedContent);
                // Filter content to only include interactive icons
                const filteredContent = result.parsedContent.filter(item => 
                    item.type === 'icon' && item.interactivity
                );

                // Construct UI context string for LLM
                uiContext = filteredContent.map((item, i) => 
                    //`ID: ${i} | Type: ${item.type} | Content: ${item.content} | Interactivity: ${item.interactivity}"`
                    `ID: ${i} | Content: ${item.content}"`
                ).join('\n');
                console.log('UI context:', uiContext);

                currentImageBase64 = result.imageBase64;
                boundingBoxes = getAllBoundingBoxes(filteredContent);
            } else {
                console.error('Parse failed:', result.error);
                hideLoadingIndicator();
                addMessage(`Error: ${result.error}`, 'system');
                return
            }
        } catch (error) {
            console.error('Error parsing screenshot:', error);
            hideLoadingIndicator();
            addMessage(`Error parsing: ${error.message}`, 'system');
            return
        }
    } else {
        hideLoadingIndicator();
        addMessage('Error: Failed to take screenshot', 'system');
        return
    }

    // Get selected model
    const selectedModel = modelSelector.value;
    
    // Call agent with message, UI context, screenshot, and model
    try {
        const response = await agent.sendMessage(message, uiContext, currentImageBase64, selectedModel);
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
                } else if (item.action && item.action.type === 'finish') {
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
            agent.addToHistory('assistant', messageText);
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

// Display welcome message
const welcomeDiv = document.createElement('div');
welcomeDiv.className = 'message system welcome';
welcomeDiv.textContent = 'Welcome to VisorAI';
messagesContainer.appendChild(welcomeDiv);
messagesContainer.scrollTop = messagesContainer.scrollHeight;

// Start in welcome mode
chatContainer.classList.add('welcome-mode');
