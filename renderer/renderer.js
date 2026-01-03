window.electronAPI.onDrawRectangle((data) => {
    // Clear previous rectangles
    document.querySelectorAll('.rectangle').forEach(el => el.remove());

    const rectsToDraw = Array.isArray(data) ? data : (data ? [data] : []);

    rectsToDraw.forEach(rectData => {
        if (rectData && rectData.width) {
            const div = document.createElement('div');
            div.className = 'rectangle';
            div.style.width = `${rectData.width}px`;
            div.style.height = `${rectData.height}px`;
            div.style.left = `${rectData.x}px`;
            div.style.top = `${rectData.y}px`;
            document.body.appendChild(div);
        }
    });
});
