// Grab the canvas and its 2D drawing context. All drawing goes through ctx.
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// Named sizes: resizing the canvas or square only means editing one line.
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const squareSide = 30;

// Largest frame time (in seconds) we trust. A bigger dt is probably a
// tab switch or a freeze, not real gameplay, so it gets cut down to this.
// It's a safety limit, not a smoothness limit. Go lower once collisions exist.
const MAX_DT = 0.1;

// --- Movement tuning (three separate knobs) ---

// Max speed in px/s, in ANY direction. Enforced on the whole velocity
// arrow (not per axis), so diagonals can't go faster.
const topSpeed = 150;

// px/s² — how many px/s the square GAINS per second while a key is held.
// 400 means 0 → 150 px/s in about 0.375 s.
const acceleration = 400;

// px/s² — how many px/s the square LOSES per second on an axis with no input.
// Constant slowdown, applied only when not pushing on that axis.
const friction = 300;

// --- Physical state: REMEMBERED between frames ---
// Nothing outside the game knows these, so these variables ARE the truth.

// Square's top-left corner (px). y grows downward.
let x = 0;
let y = 0;

// How fast the square is moving right now (px/s). Carries over between
// frames, which is what gives the square weight (inertia).
let velocityX = 0;
let velocityY = 0;

// --- Per-frame values: RECOMPUTED every frame, never trusted from last frame ---

// Push from the player this frame (px/s²). Built fresh from keysPressed.
let accelX = 0;
let accelY = 0;

// Timestamp of the previous frame (ms). Lives outside draw() so it
// survives between frames. Undefined until the very first frame.
let lastTime;

// --- Input ---

// The ONE source of truth for input. Listeners write it; the loop reads it.
const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

// Turn held keys into a push (acceleration), equally strong in all 8 directions.
// The direction decides WHERE the push points; `acceleration` decides HOW HARD.
function updateAcceleration() {
  const { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } = keysPressed;

  // Raw input direction: each component is -1, 0, or 1.
  // Problem: a diagonal like (1, 1) has length √2 ≈ 1.41, not 1.
  const inputX = ArrowRight - ArrowLeft;
  const inputY = ArrowDown - ArrowUp;

  // The input arrow's length (Pythagoras).
  const inputLength = Math.sqrt(inputX * inputX + inputY * inputY);

  // Default to "no push".
  let dirX = 0;
  let dirY = 0;

  // Normalize: divide by the length so the arrow keeps its direction but has length 1.
  // Guard: with no keys held the length is 0, and 0 / 0 = NaN.
  // Once NaN gets into x or y, the square is gone for good.
  if (inputLength > 0) {
    dirX = inputX / inputLength;
    dirY = inputY / inputLength;
  }

  // Unit direction × strength. Units: (no unit) × px/s² = px/s².
  accelX = dirX * acceleration;
  accelY = dirY * acceleration;
}

// Listeners ONLY record state. Moving the square here would stutter,
// because the OS waits a moment before repeating a held key.
window.addEventListener("keydown", (e) => {
  if (e.key in keysPressed) {
    // Only block arrow keys (stops page scrolling).
    // Every other key, like F5 or Ctrl+R, still works.
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
  for (const key in keysPressed) keysPressed[key] = false;
}

window.addEventListener("blur", resetAllKeys);

// --- Physics ---

// One axis of physics. Takes the current velocity and push, returns the new velocity.
// Touches no globals, so the same function works for X and Y
// (no more mirrored copies to get out of sync).
//   - Pushing on this axis → speed up: velocity += accel × dt  (px/s² × s = px/s)
//   - Not pushing          → friction slows it toward 0, never past it.
function applyAxisPhysics(velocity, accel, deltaTime) {
  if (accel === 0) {
    // Which way is it moving? (+1 or -1). At rest (0) we pick +1;
    // the clamp below immediately puts it back to 0, so it stays still.
    const motionDir = velocity >= 0 ? 1 : -1;

    // Friction always pushes AGAINST the motion.
    const frictionAccel = -motionDir * friction;
    velocity += frictionAccel * deltaTime;

    // Did friction flip the sign, or land exactly on 0? Then it's stopped.
    // Without this, a near-zero velocity overshoots back and forth (jitter).
    if (Math.sign(velocity) !== motionDir) {
      velocity = 0;
    }
  } else {
    velocity += accel * deltaTime;
  }

  return velocity;
}

// Update the velocity COMPLETELY (push, friction, speed cap) before
// anything uses it to move. Otherwise the square moves at an unchecked speed.
function updateVelocity(deltaTime) {
  velocityX = applyAxisPhysics(velocityX, accelX, deltaTime);
  velocityY = applyAxisPhysics(velocityY, accelY, deltaTime);

  // Cap the WHOLE arrow, not each axis. Capping each axis separately
  // lets a diagonal reach topSpeed × √2 ≈ 212 px/s (the 03 bug, back again).
  // No zero guard needed: speed > topSpeed means speed > 0.
  const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
  if (speed > topSpeed) {
    // Same normalize trick as 03: keep the direction, set the length to topSpeed.
    velocityX = (velocityX / speed) * topSpeed;
    velocityY = (velocityY / speed) * topSpeed;
  }
}

// Move by velocity × dt (px/s × s = px), then wrap.
// The square is (partly) visible while x is between -squareSide and canvasWidth.
// Past either limit it's fully hidden, so wrap by exactly one lap
// (canvasWidth + squareSide), keeping the overshoot so nothing snaps.
// Note: a single step bigger than a whole lap would need `while`, not `if`.
// topSpeed × MAX_DT = 15 px max per frame, far below a 430 px lap.
function updatePosition(deltaTime) {
  x += velocityX * deltaTime;

  const leftLimit = -squareSide;
  const rightLimit = canvasWidth;

  if (x < leftLimit) {
    x = canvasWidth + squareSide + x; // off the left → add one lap
  } else if (x > rightLimit) {
    x = x - canvasWidth - squareSide; // off the right → subtract one lap
  }

  y += velocityY * deltaTime;

  const topLimit = -squareSide;
  const bottomLimit = canvasHeight;

  if (y < topLimit) {
    y = canvasHeight + squareSide + y; // off the top → add one lap
  } else if (y > bottomLimit) {
    y = y - canvasHeight - squareSide; // off the bottom → subtract one lap
  }
}

// --- Drawing ---

// Drawing only: no game logic in here.
function drawSquare(posX, posY) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "red";
  ctx.fillRect(posX, posY, squareSide, squareSide);
}

// --- Game loop ---

// Fixed order every frame: input → velocity → position → draw.
// Each step finishes before the next one reads its result.
// timestamp: ms since the page loaded, passed in by requestAnimationFrame.
function gameLoop(timestamp) {
  // First frame has no previous timestamp, so dt = 0 (no jump at startup).
  if (lastTime === undefined) {
    lastTime = timestamp;
  }

  // dt = how long THIS frame took, in seconds (ms / 1000).
  // Capped at MAX_DT: browsers pause this loop in hidden tabs, so the first
  // frame back can claim several seconds passed and teleport the square.
  const deltaTime = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  updateAcceleration();
  updateVelocity(deltaTime);
  updatePosition(deltaTime);
  drawSquare(x, y);

  // Ask the browser to call gameLoop() again before the next screen repaint.
  requestAnimationFrame(gameLoop);
}

// Kick off the loop.
requestAnimationFrame(gameLoop);
