let useScreenshot = true;

class VisorAgent {
    constructor() {
        this.systemPrompt = '';
        this.systemInfo = '';
        this.chatHistory = [];
        this.isInitialized = false;
        this.originalGoal = null;
        this.completedSteps = [];
    }

    async init() {
        if (this.isInitialized) {
            console.warn('VisorAgent already initialized');
            return;
        }

        try {
            const response = await fetch('../data/config/visorAgent.txt');
            this.systemPrompt = await response.text();

            // Fetch system info for diagnostic context
            try {
                this.systemInfo = await window.electronAPI.getSystemInfo();
                console.log('System info loaded:', this.systemInfo);
            } catch (err) {
                console.warn('Could not load system info:', err);
                this.systemInfo = '';
            }

            // Send the system prompt to establish context
            this.addToHistory('system', this.systemPrompt);
            
            this.isInitialized = true;
            console.log('VisorAgent initialized successfully');
        } catch (error) {
            console.error('Failed to initialize VisorAgent:', error);
            throw new Error('Could not load system prompt');
        }
    }

    addToHistory(role, content) {
        this.chatHistory.push({ role, content });
    }

    clearHistory() {
        this.chatHistory = [];
        this.originalGoal = null;
        this.completedSteps = [];
    }

    getFullHistory() {
        return this.chatHistory;
    }

    extractStepSummary(parsedResponse) {
        let actionDesc = '';
        let messageDesc = '';
        for (const item of (parsedResponse.output || [])) {
            if (item.type === 'computer_call' && item.action) {
                const a = item.action;
                if (a.type === 'click' || a.type === 'double_click') {
                    actionDesc = `${a.type} on element #${a.target_id}`;
                } else if (a.type === 'type') {
                    actionDesc = `type "${a.text}"`;
                } else if (a.type === 'keypress') {
                    actionDesc = `keypress [${(a.keys || []).join('+')}]`;
                } else if (a.type === 'scroll') {
                    actionDesc = `scroll ${a.direction}`;
                } else if (a.type === 'wait') {
                    actionDesc = `wait ${a.ms}ms`;
                } else if (a.type === 'done') {
                    actionDesc = 'done';
                }
            } else if (item.type === 'message' && item.reply) {
                messageDesc = item.reply;
            }
        }
        return `${actionDesc}${messageDesc ? ' — ' + messageDesc : ''}`;
    }

    /*
       Send a message to OpenAI with UI context and screenshot
       @param {string} userMessage - The user's query
       @param {string} uiContext - Parsed UI elements as string
       @param {string} imageBase64 - Screenshot as base64
       @param {string} model - Model to use (optional)
       @returns {Promise<Object>} - The parsed JSON response from the agent
     */
    async sendMessage(userMessage, uiContext, imageBase64, labeledImageBase64, model = 'google/gemini-3-flash-preview') {
        if (!this.isInitialized) {
            throw new Error('VisorAgent not initialized. Call init() first.');
        }

        // Construct messages with smart context windowing:
        // 1. System prompt
        // 2. UI Context (current screen)
        // 3. Original goal + progress summary (compact log of all completed steps)
        // 4. Recent history (last 3 exchanges in full detail)
        // 5. Current user message + images

        const messages = [];

        // 1. Add system prompt
        if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
            messages.push({
                role: 'system',
                content: this.chatHistory[0].content
            });
        }

        // 1b. Add system info for diagnostic context
        if (this.systemInfo) {
            messages.push({
                role: 'system',
                content: `[System Diagnostic Info]\n${this.systemInfo}`
            });
        }

        // 2. Add UI context as separate user message
        if (uiContext) {
            messages.push({
                role: 'user',
                content: `[UI Context]\nHere is the list of detected UI elements by id and description:\n${uiContext}`
            });
        }

        // 3. Capture original goal on first real user message
        if (!this.originalGoal) {
            this.originalGoal = userMessage;
        }

        // 4. Add original goal + progress summary
        let contextBlock = `[Original Goal]\n${this.originalGoal}`;
        if (this.completedSteps.length > 0) {
            contextBlock += `\n\n[Progress So Far]\n${this.completedSteps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}`;
        }
        messages.push({ role: 'user', content: contextBlock });

        // 5. Add recent history (last 6 messages = ~3 exchanges, full detail)
        const recentHistory = this.chatHistory.slice(1).slice(-6);
        if (recentHistory.length > 0) {
            recentHistory.forEach(msg => {
                messages.push({
                    role: msg.role,
                    content: typeof msg.content === 'string' ? msg.content : String(msg.content)
                });
            });
        }
        
        // 4. Add current user message with optional screenshot(s)
        if (useScreenshot && imageBase64) {
            // Multimodal message with text + 1 or 2 images (raw + labeled overlay)
            const contentParts = [
                {
                    type: 'text',
                    text:
                        `[User Query]\n${userMessage}\n\n` +
                        `You will see TWO images (if provided):\n` +
                        `- Image 1: original screenshot\n` +
                        `- Image 2: screenshot with numbered boxes (IDs).\n` +
                        `When choosing a click target, the target_id MUST match the number on Image 2 (labeled overlay).`
                },
                {
                    type: 'image_url',
                    imageUrl: {
                        url: `data:image/png;base64,${imageBase64}`
                    }
                }
            ];

            // Add labeled overlay image if available
            if (labeledImageBase64) {
                contentParts.push({
                    type: 'image_url',
                    imageUrl: {
                        url: `data:image/png;base64,${labeledImageBase64}`
                    }
                });
            }

            // If you want to mirror OmniParser more closely, include UI context in the same text block too.
            // We keep the existing separate UI-context message above, but also append it here for clarity.
            if (uiContext) {
                contentParts[0].text += `\n\n[UI Context]\nHere is the list of detected UI elements by id and description:\n${uiContext}`;
            }

            messages.push({
                role: 'user',
                content: contentParts
            });
        } else {
            // Text-only user message
            const textOnly = uiContext
                ? `[User Query]\n${userMessage}\n\n[UI Context]\nHere is the list of detected UI elements by id and description:\n${uiContext}`
                : `[User Query]\n${userMessage}`;

            messages.push({
                role: 'user',
                content: textOnly
            });
        }

        console.log('Messages:', messages);

        // Call the API via Electron IPC with selected model
        const result = await window.electronAPI.chatCompletion(messages, model);

        if (!result.success) {
            throw new Error(result.error || 'API call failed');
        }

        // Parse the response
        if (!result.response) {
            throw new Error('API response is empty or invalid');
        }

        const cleanJson = result.response.replace(/```json\n?|```/g, '').trim();
        const parsedResponse = JSON.parse(cleanJson);

        const stringifiedResponse = JSON.stringify(parsedResponse);

        // Track step summary for progress log
        this.completedSteps.push(this.extractStepSummary(parsedResponse));

        // Add to history (store user message as text, response as text)
        this.addToHistory('user', userMessage);
        this.addToHistory('assistant', stringifiedResponse);

        return parsedResponse;
    }

    /*
       Get chat history summary for display
     */
    getHistorySummary() {
        return this.chatHistory.map(msg => ({
            role: msg.role,
            preview: typeof msg.content === 'string' 
                ? msg.content.substring(0, 100) 
                : '[Complex message]'
        }));
    }
}


/*
    ValidationAgent class
    This agent is responsible for ensuring visorAgent is working correctly and is not hallucinating.
    It should be rarely called
    WIP
*/
class validationAgent {
    constructor() {
        this.systemPrompt = '';
        this.chatHistory = [];
        this.isInitialized = false;
    }
    
    
    async init() {
        if (this.isInitialized) {
            console.warn('ValidationAgent already initialized');
            return;
        }
        
        
        try {
            const response = await fetch('../data/config/validationAgent.txt');
            this.systemPrompt = await response.text();
            
            // Send the system prompt to establish context
            this.addToHistory('system', this.systemPrompt);
            
            this.isInitialized = true;
            console.log('ValidationAgent initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ValidationAgent:', error);
            throw new Error('Could not load system prompt');
        }
    }

    addToHistory(role, content) {
        this.chatHistory.push({ role, content });
    }

    clearHistory() {
        this.chatHistory = [];
    }

    getFullHistory() {
        return this.chatHistory;
    }
}
