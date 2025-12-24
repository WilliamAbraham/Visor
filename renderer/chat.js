const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');
const testRectBtn = document.getElementById('testRectBtn');

// Store conversation history for context
const conversationHistory = [];

function addMessage(text, type = 'user') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    conversationHistory.push({
        role: type === 'user' ? 'user' : 'assistant',
        content: text
    });
}

if (testRectBtn) {
    testRectBtn.addEventListener('click', () => {
        console.log('Sending draw-rectangle event');
        // Random position/size for testing
        const x = Math.floor(Math.random() * 800);
        const y = Math.floor(Math.random() * 600);
        window.electronAPI.sendDrawRectangle({
            x: x,
            y: y,
            width: 100,
            height: 100
        });
        addMessage(`Sent test rect to ${x},${y}`, 'system');
    });
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

    const screenshot = await captureScreenshot();

    // Parse screenshot with FastAPI server
    if (screenshot) {
        try {
            const result = await window.electronAPI.parseScreenshot(screenshot);
            if (result.success) {
                const boundingBoxes = getAllBoundingBoxes(result.parsedContent);
                console.log('Bounding boxes:', boundingBoxes);

                const screenWidth = window.screen.width;
                const screenHeight = window.screen.height;

                const rects = boundingBoxes.map(bbox => ({
                    x: bbox[0] * screenWidth,
                    y: bbox[1] * screenHeight,
                    width: (bbox[2] - bbox[0]) * screenWidth,
                    height: (bbox[3] - bbox[1]) * screenHeight
                }));

                console.log('Sending rects:', rects);
                window.electronAPI.sendDrawRectangle(rects);
            } else {
                console.error('Parse failed:', result.error);
                addMessage(`Error: ${result.error}`, 'system');
                return
            }
        } catch (error) {
            console.error('Error parsing screenshot:', error);
        }
    } else {
        addMessage('Error: Failed to take screenshot', 'system');
        return
    }

    addMessage(message, 'user');
    messageInput.value = '';

    try {
        const result = await window.electronAPI.chatCompletion(conversationHistory);
        if (result.success) {
            addMessage(result.response, 'system');
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error:', error);
        addMessage(`Error: ${error.message}`, 'system');
    }
}

function getAllBoundingBoxes(parsedContent) {
    const boxes = [];
    if (typeof parsedContent !== 'string') return boxes;

    const lines = parsedContent.split('\n');
    for (const line of lines) {
        // Look for 'bbox': [x, y, x, y] pattern
        const match = line.match(/'bbox':\s*\[([\d\.\s,]+)\]/);
        if (match && match[1]) {
            // Parse the numbers from the captured group
            const coords = match[1].split(',').map(n => parseFloat(n.trim()));
            if (coords.length === 4) {
                boxes.push(coords);
            }
        }
    }
    return boxes;
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

const welcomeDiv = document.createElement('div');
welcomeDiv.className = 'message system';
welcomeDiv.textContent = 'Welcome to Visor Chat! Ask anything about the screen you are looking at.';
messagesContainer.appendChild(welcomeDiv);
messagesContainer.scrollTop = messagesContainer.scrollHeight;