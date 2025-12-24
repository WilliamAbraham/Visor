const rectangle = document.querySelector('.rectangle')

function setRectangleSize(width, height) {
    rectangle.style.width = `${width}px`
    rectangle.style.height = `${height}px`
}

function setRectanglePosition(x, y) {
    rectangle.style.left = `${x}px`
    rectangle.style.top = `${y}px`
}

window.electronAPI.onDrawRectangle((data) => {
    console.log('Received draw-rectangle:', data)
    if (data.width && data.height) {
        setRectangleSize(data.width, data.height)
    }
    if (data.x !== undefined && data.y !== undefined) {
        setRectanglePosition(data.x, data.y)
    }
})
