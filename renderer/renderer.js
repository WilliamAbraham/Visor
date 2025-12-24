// Clear existing static rectangle if it exists, or just append to body
// We'll treat the body as the canvas

window.electronAPI.onDrawRectangle((data) => {
    console.log('Received draw-rectangle:', data)
    
    // Clear previous rectangles
    const existingRects = document.querySelectorAll('.rectangle');
    existingRects.forEach(el => el.remove());

    const rectsToDraw = Array.isArray(data) ? data : [data];

    rectsToDraw.forEach(rectData => {
        if (rectData.width && rectData.height && rectData.x !== undefined && rectData.y !== undefined) {
            const div = document.createElement('div');
            div.className = 'rectangle';
            div.style.width = `${rectData.width}px`;
            div.style.height = `${rectData.height}px`;
            div.style.left = `${rectData.x}px`;
            div.style.top = `${rectData.y}px`;
            document.body.appendChild(div);
        }
    });
})
