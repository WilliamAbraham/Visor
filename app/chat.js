const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');

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

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

const welcomeDiv = document.createElement('div');
welcomeDiv.className = 'message system';
welcomeDiv.textContent = 'Welcome to Visor Chat! Ask anything about the screen you are looking at.';
messagesContainer.appendChild(welcomeDiv);
messagesContainer.scrollTop = messagesContainer.scrollHeight;