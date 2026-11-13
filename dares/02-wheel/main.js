const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

// Square's top-left corner. y grows downward.
let x = 0;
let y = 0;

let squareSide = 30;

// Pixels per frame along each axis (frame-based, see 01).
const speed = 0.25;

// How far the square moves this frame. Recomputed every frame from
// keysPressed, never remembered between frames.
let deltaX = 0;
let deltaY = 0;

// The ONE source of truth for input. Listeners write it; the loop reads it.
const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

// Turn held keys into movement.
// Booleans act as 0/1 in arithmetic, so (Right - Left) is -1, 0, or 1:
// that's the DIRECTION on the axis. Opposite keys cancel to 0 on purpose.
// Multiplying by speed gives the MAGNITUDE.
// Note: diagonals here are ~1.41x faster (fixed in 03).
function moveInDirection() {
  const { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } = keysPressed;

  deltaX = (ArrowRight - ArrowLeft) * speed;
  deltaY = (ArrowDown - ArrowUp) * speed;
}

// Listeners ONLY record state. Moving the square here would stutter,
// because the OS waits a moment before repeating a held key.
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

// The square is (partly) visible while x is between -squareSide and canvasWidth.
// Past either limit it's fully hidden, so wrap by exactly one lap
// (canvasWidth + squareSide), keeping the overshoot so nothing snaps.
function updateXPosition() {
  x += deltaX;

  let leftLimit = 0 - squareSide;
  let rightLimit = canvasWidth;

  if (x < leftLimit) {
    x = canvasWidth + squareSide + x; // off the left → add one lap
  } else if (x > rightLimit) {
    x = x - canvasWidth - squareSide; // off the right → subtract one lap
  }
}

// Same idea as for updateXPosition, using height.
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

// Drawing only: no game logic in here.
function drawSquare(xVal, yVal) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "red";
  ctx.fillRect(xVal, yVal, squareSide, squareSide);
}

// The game loop, in a fixed order every frame: input → update → draw.
function draw() {
  moveInDirection();
  updateXPosition();
  updateYPosition();
  drawSquare(x, y);
  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
