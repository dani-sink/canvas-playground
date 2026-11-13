// Grab the canvas and its 2D drawing context. All drawing goes through ctx.
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// Named sizes: resizing the canvas or square only means editing one line.
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

// Largest frame time (in seconds) we trust. A bigger dt is probably a
// tab switch or a freeze, not real gameplay, so it gets cut down to this.
// It's a safety limit, not a smoothness limit. Go lower once collisions exist.
const MAX_DT = 0.1;

// Pixels per SECOND, in any direction (diagonals included, thanks to normalizing).
// Not per frame, so it's the same on 60Hz, 144Hz, and 240Hz screens.
const speed = 100;

// Square's top-left corner. y grows downward.
let x = 0;
let y = 0;

// Timestamp of the previous frame (ms). Lives outside draw() so it
// survives between frames. Undefined until the very first frame.
let lastTime;

let squareSide = 30;

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

// Turn held keys into movement, at the SAME speed in all 8 directions.
// distanceThisFrame = speed × dt, so the direction decides WHERE
// and this decides HOW FAR.
function moveInDirection(distanceThisFrame) {
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

  deltaX = normalizedVx * distanceThisFrame;
  deltaY = normalizedVy * distanceThisFrame;
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

// If the window loses focus, any keyup that happens elsewhere never reaches
// this page, and a key would look "held" forever. So assume nothing is held.
// Wrong "released" fixes itself (key-repeat re-sends keydown);
// wrong "held" never does.
// blur > visibilitychange: clicking into DevTools fires blur without hiding the page.
function resetAllKeys() {
  for (let key in keysPressed) keysPressed[key] = false;
}

window.addEventListener("blur", resetAllKeys);

// The square is (partly) visible while x is between -squareSide and canvasWidth.
// Past either limit it's fully hidden, so wrap by exactly one lap
// (canvasWidth + squareSide), keeping the overshoot so nothing snaps.
// Note: a single step bigger than a whole lap would need `while`, not `if`.
// The MAX_DT cap keeps steps small enough that this never happens.
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
// timestamp: ms since the page loaded, passed in by requestAnimationFrame.
function draw(timestamp) {
  if (lastTime === undefined) {
    lastTime = timestamp;
  }

  // dt = how long THIS frame took, in seconds (ms / 1000).
  // Capped at MAX_DT: browsers pause this loop in hidden tabs, so the first
  // frame back can claim several seconds passed and teleport the square.
  let deltaTime = Math.min((timestamp - lastTime) / 1000, MAX_DT);

  // Units: (px / s) × s = px. How far to move this frame.
  let distanceThisFrame = speed * deltaTime;
  lastTime = timestamp;

  moveInDirection(distanceThisFrame);
  updateXPosition();
  updateYPosition();
  drawSquare(x, y);

  // Ask the browser to call draw() again before the next screen repaint.
  requestAnimationFrame(draw);
}

// Kick off the loop.
requestAnimationFrame(draw);
