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

// Turn held keys into movement, at the SAME speed in all 8 directions.
function moveInDirection() {
  const { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } = keysPressed;

  // Raw direction: each component is -1, 0, or 1.
  // Problem: a diagonal like (1, 1) has length √2 ≈ 1.41, not 1.
  let vx = ArrowRight - ArrowLeft;
  let vy = ArrowDown - ArrowUp;

  // The arrow's length (Pythagoras).
  let magnitudeOfV = Math.sqrt(vx * vx + vy * vy);

  // Default to "not moving".
  let normalizedVx = 0;
  let normalizedVy = 0;

  // Normalize: divide by the length so the arrow keeps its direction but has length 1.
  // Guard: with no keys held the length is 0, and 0 / 0 = NaN.
  // Once NaN gets into x or y, the square is gone for good.
  if (magnitudeOfV > 0) {
    normalizedVx = vx / magnitudeOfV;
    normalizedVy = vy / magnitudeOfV;
  }

  // Unit direction × speed. Every direction now moves exactly `speed` px/frame.
  // (Diagonals may log 0.24999999999999997: floating-point rounding, not a bug.)
  deltaX = normalizedVx * speed;
  deltaY = normalizedVy * speed;
}

window.addEventListener("keydown", (e) => {
  if (e.key in keysPressed) {
    e.preventDefault();
    keysPressed[e.key] = true;
  }
});

window.addEventListener("keyup", (e) => {
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
