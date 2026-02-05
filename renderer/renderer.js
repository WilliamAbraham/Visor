window.electronAPI.onDrawRectangle((data) => {
    // Clear previous click indicators
    document.querySelectorAll('.click-indicator').forEach(el => el.remove());

    const rectsToDraw = Array.isArray(data) ? data : (data ? [data] : []);

    rectsToDraw.forEach(rectData => {
        if (rectData && rectData.width) {
            // Create container for the click indicator
            const container = document.createElement('div');
            container.className = 'click-indicator';
            
            // Position at center of the bounding box
            const centerX = rectData.x + rectData.width / 2;
            const centerY = rectData.y + rectData.height / 2;
            
            // Store bounding box data for click detection (invisible hitbox)
            container.style.left = `${rectData.x}px`;
            container.style.top = `${rectData.y}px`;
            container.style.width = `${rectData.width}px`;
            container.style.height = `${rectData.height}px`;
            
            // Create the cursor image
            const cursorImg = document.createElement('img');
            cursorImg.src = 'assets/click-cursor.png';
            cursorImg.className = 'cursor-image';
            
            // Position cursor image at center of bounding box
            // Offset so the fingertip points to the center
            cursorImg.style.left = `${rectData.width / 2 - 20}px`;
            cursorImg.style.top = `${rectData.height / 2 - 10}px`;
            
            container.appendChild(cursorImg);
            document.body.appendChild(container);
        }
    });
});
