# Visor 1.0

Visor is a desktop navigation assistant that helps you accomplish tasks on your computer.

## Features
- **Visual Understanding**: Analyzes your screen to understand what you're looking at.
- **Smart Highlighting**: Highlights UI elements to guide you through tasks.
- **Natural Chat**: Chat with Visor to get help with your computer.
- **Click-Through Overlay**: A transparent overlay that highlights elements without getting in your way.

## How it works
1. **Ask Visor**: Type a command or question in the chat.
2. **Screen Analysis**: Visor takes a screenshot and analyzes the UI elements.
3. **Guidance**: Visor highlights the relevant button or menu item on your screen.
4. **Action**: Click the highlighted area to perform the action and dismiss the guide.

## Tech Stack
- **Electron**: Desktop application framework.
- **OmniParser**: For screen parsing and UI element detection.
- **OpenAI GPT-4o**: For intelligent reasoning and natural language.
- **uiohook-napi**: For global input monitoring.
