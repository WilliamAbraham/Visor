const rectangle = document.querySelector('.rectangle')

function setRectangleSize(width, height) {
    rectangle.style.width = `${width}px`
    rectangle.style.height = `${height}px`
}

function setRectanglePosition(x, y) {
    rectangle.style.left = `${x}px`
    rectangle.style.top = `${y}px`
}

setRectangleSize(60, 60)
setRectanglePosition(1100, 900)