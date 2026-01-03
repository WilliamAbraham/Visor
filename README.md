# Visor - Work in Progress

Powered by Microsoft's OmniParser, a UI element extraction tool, Visor is a **human-in-the-loop**
computer use tool. Providing visual cues, glowing rectangles, Visor directs users on how to navigate
their desktop based on prompts.

## Features
- **Visual Understanding**: Analyzes your screen to understand what you're looking at.
- **Smart Highlighting**: Highlights UI elements to guide you through tasks.
- **Natural Chat**: Chat with Visor to get help with your computer.
- **Click-Through Overlay**: A transparent overlay that highlights elements without getting in your way.

## How it works
1. **Ask Visor**: Type a command or question in the chat.
2. **Screen Analysis**: Visor takes a screenshot and analyzes the UI elements.
3. **Guidance**: Visor highlights the relevant button or menu item on your screen.

## Tech Stack
- **Electron**: Desktop application framework.
- **Node.js**: Backend runtime for the desktop app.
- **OmniParser**: Screen parsing engine (YOLOv8 + Florence-2).
- **FastAPI**: Python server for the OmniParser backend.

## Installation

### Prerequisites
- Node.js (v16+)
- Python (v3.10+)
- Conda (recommended)
- Git

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/Visor1.0.git
cd Visor1.0
```

### 2. Setup OmniParser (Backend)
Visor relies on a local OmniParser server to analyze screenshots.

```bash
# Create a conda environment
conda create -n omniparser python=3.10
conda activate omniparser

# Install Python dependencies
pip install -r requirements.txt
```

**Download Model Weights:**
You need to download the pretrained weights for OmniParser and place them in the `weights` directory in the project root.

```bash
# download the model checkpoints to local directory
# You may need to install huggingface-cli: pip install -U "huggingface_hub[cli]"
for f in icon_detect/{train_args.yaml,model.pt,model.yaml} icon_caption/{config.json,generation_config.json,model.safetensors}; do huggingface-cli download microsoft/OmniParser-v2.0 "$f" --local-dir weights; done
mv weights/icon_caption weights/icon_caption_florence
```

*(You can find these weights on the official [OmniParser HuggingFace page](https://github.com/microsoft/OmniParser))*

### 3. Setup Visor (Frontend)
Open a new terminal window.

```bash
# Install Node dependencies
npm install

# Configure Environment
# Create a .env file in the root directory:
echo "OPENAI_API_KEY=your_key_here" > .env
# If using Cloudflare tunnel (recommended):
echo "OMNIPARSER_SERVER_URL=https://your-tunnel-url.trycloudflare.com" >> .env
# If running locally without tunnel:
# echo "OMNIPARSER_SERVER_URL=http://127.0.0.1:7777" >> .env
```

### 4. Start the Server
In your conda terminal:
```bash
cd services/omniparser
# Optional: Start Cloudflare tunnel for HTTPS access (fix for mixed content issues)
# cloudflared tunnel --url http://127.0.0.1:7777
python server.py
```

### 5. Start Visor
In your Node terminal:
```bash
npm start
```

Visor will launch two windows: a transparent overlay covering your screen and a chat window. Type your request in the chat (e.g., "Where is Spotify?") and Visor will highlight it on your screen.
