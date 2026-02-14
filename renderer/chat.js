const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');
const taskInput = document.getElementById('taskInput');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.querySelector('.chat-container');
const modelSelector = document.getElementById('modelSelector');

let numOfScreenshots = 0;
let isRunning = false;
let shouldStop = false;
let currentTask = '';

// Initialize Visor Agent
const agent = new VisorAgent();

// Initialize agent on startup
async function initialize() {
    try {
        await agent.init();
        console.log('Visor Agent ready');
        addMessage('Agent initialized. Ready to go.', 'system');
        sendButton.disabled = false;
        taskInput.focus();
    } catch (error) {
        console.error('Failed to initialize:', error);
        addMessage('Failed to initialize. Please refresh.', 'system');
    }
}

initialize();

function addMessage(text, type = 'system') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    // Add timestamp for action messages
    if (type === 'action') {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        messageDiv.innerHTML = `<span class="timestamp">[${time}]</span> ${text}`;
    } else {
        messageDiv.textContent = text;
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function clearMessages() {
    messagesContainer.innerHTML = '';
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

function cleanUIContext(parsedContent) {
    if (!Array.isArray(parsedContent) || parsedContent.length === 0) return '';

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

        if (type === 'text') {
            return `<p id=${idx} class="text" alt="${content}" data-interactive="${interactive}"> </p>`;
        }
        return `<img id=${idx} class="icon" alt="${content}" data-interactive="${interactive}"> </img>`;
    }).join('\n');
}

function getAllBoundingBoxes(parsedContent) {
    if (Array.isArray(parsedContent)) {
        return parsedContent
            .filter(item => item.bbox)
            .map(item => item.bbox);
    }
    return [];
}

async function clearScreenshots() {
    if (numOfScreenshots >= 5) {
        try {
            const result = await window.electronAPI.clearScreenshotDirectories();
            if (result.success) {
                numOfScreenshots = 0;
                console.log('Screenshot directories cleared successfully');
            }
        } catch (error) {
            console.error('Error clearing screenshot directories:', error);
        }
    }
}

// ============ ACTION EXECUTION ============

async function executeClick(targetId, boundingBoxes) {
    const targetBox = boundingBoxes[targetId];
    if (targetBox) {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;

        const x = Math.round((targetBox[0] + targetBox[2]) / 2 * screenWidth);
        const y = Math.round((targetBox[1] + targetBox[3]) / 2 * screenHeight);

        console.log(`Executing click at (${x}, ${y}) for target ${targetId}`);
        const result = await window.electronAPI.executeClick(x, y);
        return result.success;
    } else {
        console.warn('Target ID not found in bounding boxes:', targetId);
        return false;
    }
}

async function executeScroll(direction, amount = 5) {
    console.log(`Executing scroll ${direction} by ${amount}`);
    const result = await window.electronAPI.executeScroll(direction, amount);
    return result.success;
}

async function executeType(text) {
    console.log(`Executing type: "${text.substring(0, 30)}..."`);
    const result = await window.electronAPI.executeType(text);
    return result.success;
}

async function executeKey(key, modifiers = []) {
    console.log(`Executing key: ${key}`);
    const result = await window.electronAPI.executeKey(key, modifiers);
    return result.success;
}

// ============ AUTONOMOUS LOOP ============

async function runAutonomousStep(message = null) {
    // Check if stopped before starting
    if (shouldStop) {
        return { done: true, stopped: true };
    }

    if (message === null) {
        message = "Continue with the task. What's the next action?";
    }

    showLoadingIndicator();
    await clearScreenshots();

    // Check again after clearing
    if (shouldStop) {
        hideLoadingIndicator();
        return { done: true, stopped: true };
    }

    const screenshot = await captureScreenshot();
    numOfScreenshots += 1;

    let currentImageBase64 = null;
    let labeledImageBase64 = null;
    let uiContext = "";
    let boundingBoxes = [];

    if (screenshot) {
        try {
            const result = await window.electronAPI.parseScreenshot(screenshot, currentTask);
            if (result.success) {
                const filteredContent = result.parsedContent;
                labeledImageBase64 = result.labeledImageBase64;

                if (labeledImageBase64) {
                    window.electronAPI.saveLabeledScreenshot(labeledImageBase64)
                        .catch(error => console.error('Error saving labeled screenshot:', error));
                }

                uiContext = cleanUIContext(filteredContent);
                currentImageBase64 = result.imageBase64;
                boundingBoxes = getAllBoundingBoxes(filteredContent);
            } else {
                hideLoadingIndicator();
                const errorMsg = result.error || 'Unknown error';
                if (errorMsg.includes('1033') || errorMsg.includes('OmniParser')) {
                    addMessage(`OmniParser server error - check if server is running and URL is valid`, 'system');
                } else {
                    addMessage(`Error: ${errorMsg}`, 'system');
                }
                return { done: true, error: errorMsg, isOmniParserError: true };
            }
        } catch (error) {
            hideLoadingIndicator();
            addMessage(`Error parsing: ${error.message}`, 'system');
            return { done: true, error: error.message, isOmniParserError: true };
        }
    } else {
        hideLoadingIndicator();
        addMessage('Error: Failed to take screenshot', 'system');
        return { done: true, error: 'Screenshot failed' };
    }

    // Check before LLM call (the slowest part)
    if (shouldStop) {
        hideLoadingIndicator();
        return { done: true, stopped: true };
    }

    const selectedModel = modelSelector.value;

    try {
        const response = await agent.sendMessage(
            message,
            uiContext,
            currentImageBase64,
            labeledImageBase64,
            selectedModel
        );

        // Check after LLM call
        if (shouldStop) {
            hideLoadingIndicator();
            return { done: true, stopped: true };
        }

        console.log('Agent response:', response);

        if (!response.output || !Array.isArray(response.output)) {
            throw new Error('Invalid response format: missing output array');
        }

        let actions = [];
        let reasoningText = '';
        let messageText = '';

        for (const item of response.output) {
            if (item.type === 'reasoning') {
                if (item.summary) {
                    reasoningText = item.summary;
                    console.log('Reasoning:', reasoningText);
                }
            }
            else if (item.type === 'action_batch' && Array.isArray(item.actions)) {
                actions = item.actions;
            }
            else if (item.type === 'computer_call' && item.action) {
                // Backward compatibility with single action format
                actions = [item.action];
            }
            else if (item.type === 'message') {
                if (item.reply) {
                    messageText += (messageText ? ' ' : '') + item.reply;
                }
            }
        }

        hideLoadingIndicator();

        // Execute action batch
        if (actions.length > 0) {
            addMessage(messageText || `Executing ${actions.length} action(s)`, 'action');

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];

                // Check if stopped mid-batch
                if (shouldStop) {
                    return { done: true, stopped: true };
                }

                console.log(`Executing action ${i + 1}/${actions.length}:`, action.type);

                if (action.type === 'click' && action.target_id !== null && action.target_id !== undefined) {
                    await executeClick(action.target_id, boundingBoxes);
                    await sleep(150);
                }
                else if (action.type === 'double_click' && action.target_id !== null && action.target_id !== undefined) {
                    await executeClick(action.target_id, boundingBoxes);
                    await sleep(50);
                    await executeClick(action.target_id, boundingBoxes);
                    await sleep(150);
                }
                else if (action.type === 'scroll') {
                    const dir = action.direction || 'down';
                    const amt = action.amount || 5;
                    await executeScroll(dir, amt);
                    await sleep(200);
                }
                else if (action.type === 'type' && action.text) {
                    await executeType(action.text);
                    await sleep(100);
                }
                else if (action.type === 'key') {
                    await executeKey(action.key, action.modifiers || []);
                    await sleep(100);
                }
                else if (action.type === 'wait') {
                    const waitMs = action.ms || 1000;
                    await sleep(waitMs);
                }
                else if (action.type === 'done') {
                    addMessage('Task completed!', 'system');
                    return { done: true };
                }
            }

            // Small delay after batch before next screenshot
            await sleep(300);
            return { done: false };
        }

        // No actions but have message
        if (messageText) {
            addMessage(messageText, 'system');
        }

        return { done: false };

    } catch (error) {
        hideLoadingIndicator();
        console.error('Error:', error);
        addMessage(`Error: ${error.message}`, 'system');
        return { done: true, error: error.message };
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startAgent(taskMessage) {
    if (isRunning) {
        addMessage('Already running!', 'system');
        return;
    }

    if (!taskMessage || !taskMessage.trim()) {
        addMessage('Please describe a task first.', 'system');
        return;
    }

    isRunning = true;
    shouldStop = false;
    sendButton.disabled = true;
    taskInput.disabled = true;
    stopButton.disabled = false;

    clearMessages();
    addMessage(taskMessage.trim(), 'action');

    currentTask = taskMessage.trim();
    let message = taskMessage.trim();
    let stepCount = 0;
    let errorCount = 0;
    const maxSteps = 200;
    const maxErrors = 3;

    while (isRunning && !shouldStop && stepCount < maxSteps) {
        stepCount++;
        console.log(`\n=== Step ${stepCount} ===`);

        const result = await runAutonomousStep(message);

        if (result.done) {
            if (result.error && errorCount < maxErrors) {
                // Transient error - wait and retry
                errorCount++;
                const retryDelay = result.isOmniParserError ? 5000 : 3000;
                addMessage(`Retrying after error (${errorCount}/${maxErrors})...`, 'system');
                await sleep(retryDelay);
                continue;
            }
            break;
        }

        // Reset error count on successful step
        errorCount = 0;
        message = null;
        await sleep(500);
    }

    isRunning = false;
    sendButton.disabled = false;
    taskInput.disabled = false;
    stopButton.disabled = true;

    if (shouldStop) {
        addMessage(`Stopped by user after ${stepCount} steps`, 'system');
    } else {
        addMessage(`Completed after ${stepCount} steps`, 'system');
    }

    taskInput.focus();
}

function stopAgent() {
    if (!isRunning) return;

    shouldStop = true;
    addMessage('Stopping...', 'system');
}

// Send task from input
function sendTask() {
    const task = taskInput.value.trim();
    if (task && !isRunning) {
        taskInput.value = '';
        startAgent(task);
    }
}

// Event listeners
sendButton.addEventListener('click', sendTask);
stopButton.addEventListener('click', stopAgent);

// Enter to send (Shift+Enter for newline)
taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTask();
    }
});

// Initial welcome message
addMessage('Visor', 'welcome');
addMessage('Describe a task and press Enter to begin.', 'system');
