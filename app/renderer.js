// Get the rectangle element
const rectangle = document.querySelector('.rectangle')

// Function to set rectangle width and height
function setRectangleSize(width, height) {
    rectangle.style.width = `${width}px`
    rectangle.style.height = `${height}px`
}

// Function to set rectangle position
function setRectanglePosition(x, y) {
    rectangle.style.left = `${x}px`
    rectangle.style.top = `${y}px`
}

// Set initial size and position
setRectangleSize(60, 60)
setRectanglePosition(1100, 870)

