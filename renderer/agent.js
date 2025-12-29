class VisorAgent {
    constructor() {
        this.systemPrompt = '';
        this.chatHistory = [];
        this.isInitialized = false;
    }

    /**
     * Initialize the agent by loading and sending the system prompt
     */
    async init() {
        if (this.isInitialized) {
            console.warn('VisorAgent already initialized');
            return;
        }

        try {
            const response = await fetch('data/config/visorAgent.txt');
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

    /**
     * Add a message to chat history
     */
    addToHistory(role, content) {
        this.chatHistory.push({ role, content });
    }

    /**
     * Clear chat history
     */
    clearHistory() {
        this.chatHistory = [];
    }

    /**
     * Get the full chat history (already includes system prompt from init)
     */
    getFullHistory() {
        return this.chatHistory;
    }

    /**
     * Send a message to OpenAI with UI context and screenshot
     * @param {string} userMessage - The user's query
     * @param {string} uiContext - Parsed UI elements as string
     * @param {string} imageBase64 - Screenshot as base64
     * @returns {Promise<Object>} - The parsed JSON response from the agent
     */
    async sendMessage(userMessage, uiContext, imageBase64) {
        if (!this.isInitialized) {
            throw new Error('VisorAgent not initialized. Call init() first.');
        }

        // Construct the message payload using message history and user input
        const messages = [
            ...this.chatHistory,
            {
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: `Parsed UI Elements:\n${uiContext}\n\nUser Query:\n${userMessage}` 
                    },
                    { 
                        type: 'image_url', 
                        image_url: { 
                            url: `data:image/png;base64,${imageBase64}`,
                            detail: 'high'
                        } 
                    }
                ]
            }
        ];

        // Call the API via Electron IPC
        const result = await window.electronAPI.chatCompletion(messages);

        if (!result.success) {
            throw new Error(result.error || 'API call failed');
        }

        // Parse the response
        const cleanJson = result.response.replace(/```json\n?|```/g, '').trim();
        const parsedResponse = JSON.parse(cleanJson);

        // Add to history (store user message as text, response as text)
        this.addToHistory('user', userMessage);
        this.addToHistory('assistant', parsedResponse.reply || '');

        return parsedResponse;
    }

    /**
     * Get chat history summary for display
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

