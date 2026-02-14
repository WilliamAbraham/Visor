let useScreenshot = true;

class VisorAgent {
    constructor() {
        this.systemPrompt = '';
        this.chatHistory = [];
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) {
            console.warn('VisorAgent already initialized');
            return;
        }

        try {
            const response = await fetch('../data/config/visorAgent.txt');
            this.systemPrompt = await response.text();
            
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
    }

    getFullHistory() {
        return this.chatHistory;
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

        // Construct messages array with 3 components:
        // 1. System prompt (from chatHistory[0])
        // 2. UI Context as a separate user message
        // 3. Chat history (previous conversation)
        // 4. Current user message
        
        const messages = [];
        
        // 1. Add system prompt (first item in chatHistory)
        if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
            messages.push({
                role: 'system',
                content: this.chatHistory[0].content
            });
        }
        
        // 2. Add UI context as separate user message
        if (uiContext) {
            messages.push({
                role: 'user',
                content: `[UI Context]\nHere is the list of detected UI elements by id and description:\n${uiContext}`
            });
        }
        
        // 3. Add chat history (skip system prompt, get last 10 exchanges)
        const history = this.chatHistory.slice(1).slice(-10);
        if (history.length > 0) {
            history.forEach(msg => {
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
        
        // Check if response looks like an error instead of JSON
        if (cleanJson.startsWith('error') || cleanJson.includes('error code:')) {
            throw new Error(`API returned error: ${cleanJson}`);
        }
        
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error('Failed to parse response:', cleanJson.substring(0, 200));
            throw new Error(`Failed to parse response: ${cleanJson.substring(0, 100)}`);
        }

        const stringifiedResponse = JSON.stringify(parsedResponse);

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


