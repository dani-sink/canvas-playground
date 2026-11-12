const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

let x = 0;
let y = 0;

let squareSide = 30;

const speed = 0.25;

let deltaX = 0;
let deltaY = 0;

const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

function moveInDirection() {
  const { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } = keysPressed;

  deltaX = (ArrowRight - ArrowLeft) * speed;
  deltaY = (ArrowDown - ArrowUp) * speed;
}

window.addEventListener("keydown", (e) => {
  e.preventDefault();
  if (e.key in keysPressed) {
    keysPressed[e.key] = true;
  }
});

window.addEventListener("keyup", (e) => {
  e.preventDefault();
  if (e.key in keysPressed) {
    keysPressed[e.key] = false;
  }
});

function updateXPosition() {
  x += deltaX;

  let leftLimit = 0 - squareSide;
  let rightLimit = canvasWidth;

  if (x < leftLimit) {
    x = canvasWidth + squareSide + x;
  } else if (x > rightLimit) {
    x = x - canvasWidth - squareSide;
  }
}

function updateYPosition() {
  y += deltaY;

  let topLimit = 0 - squareSide;
  let bottomLimit = canvasHeight;

  if (y < topLimit) {
    y = canvasHeight + squareSide + y;
  } else if (y > bottomLimit) {
    y = y - canvasHeight - squareSide;
  }
}

function drawSquare(xVal, yVal) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "red";
  ctx.fillRect(xVal, yVal, squareSide, squareSide);
}

function draw() {
  moveInDirection();
  updateXPosition();
  updateYPosition();
  drawSquare(x, y);
  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
