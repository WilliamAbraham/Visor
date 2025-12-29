const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');

// Initialize Visor Agent
const agent = new VisorAgent();
agent.init();

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
                // Construct UI context string for LLM
                uiContext = result.parsedContent.map((item, i) => 
                    `ID: ${i} | Type: ${item.type} | Content: "${item.content}"`
                ).join('\n');
                currentImageBase64 = result.imageBase64;
                boundingBoxes = getAllBoundingBoxes(result.parsedContent);
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
        
        // Highlight element if specified
        if (response.target_id !== null && response.target_id !== undefined) {
            await highlightElement(response.target_id, boundingBoxes);
        }
        
        // Display the reply
        addMessage(response.reply, 'system');
        
        // Optionally display reasoning in console for debugging
        if (response.reasoning) {
            console.log('Reasoning:', response.reasoning);
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
welcomeDiv.className = 'message system';
welcomeDiv.textContent = 'Welcome to Visor Chat! Ask anything about the screen you are looking at.';
messagesContainer.appendChild(welcomeDiv);
messagesContainer.scrollTop = messagesContainer.scrollHeight;
